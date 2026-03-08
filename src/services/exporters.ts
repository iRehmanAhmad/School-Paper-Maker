import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, TableBorders } from "docx";
import jsPDF from "jspdf";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { GeneratedSet, GeneratorSettings } from "@/types/domain";

pdfMake.vfs = pdfFonts?.pdfMake?.vfs;

function fileName(prefix: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${date}`;
}

function questionLine(q: GeneratedSet["questions"][number], includeAnswer = false) {
  const options = q.options.length ? `\n${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}` : "";
  const answer = includeAnswer ? `\nAnswer: ${q.correctAnswer ?? "-"}` : "";
  return `${q.orderNumber}. ${q.questionText} (${q.marks})${options}${answer}`;
}

export function downloadQuestionPdf(set: GeneratedSet, settings: GeneratorSettings) {
  // Since the HTML Print view is the source of truth for perfect layout, 
  // we trigger the print dialog. The user can just 'Save as PDF' from there.
  return openPrintableHtml(set, settings, false);
}

export function downloadAnswerPdf(set: GeneratedSet, settings: GeneratorSettings) {
  return openPrintableHtml(set, settings, true);
}

export function downloadRubricPdf(set: GeneratedSet) {
  const body = [["Question", "Marks", "Criteria"]] as string[][];
  set.questions.forEach((q) => body.push([`Q${q.orderNumber}`, String(q.marks), q.explanation || "Correct response per key"]));
  const dd = {
    content: [
      { text: `Rubric - Set ${set.label}`, style: "header" },
      { table: { headerRows: 1, widths: [70, 60, "*"], body } },
    ],
    styles: { header: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] } },
  };
  pdfMake.createPdf(dd).download(`${fileName("rubric")}-set-${set.label}.pdf`);
}

export async function downloadQuestionDocx(set: GeneratedSet, settings: GeneratorSettings) {
  const fsHalf = (settings.header.contentFontSize || 11) * 2;
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text: settings.header.schoolName, bold: true, size: 44 })],
    spacing: { after: 300 }
  }));

  // Meta (Simplified line)
  children.push(new Paragraph({
    children: [
      new TextRun({ text: `Name/Roll No: ____________________     Date: ${settings.header.dateLabel || "__________"}`, bold: true, size: 20 })
    ],
    spacing: { after: 100 }
  }));
  children.push(new Paragraph({
    children: [
      new TextRun({ text: `Class: ${settings.header.className}                Time Allowed: ${settings.header.timeLabel}`, bold: true, size: 20 })
    ],
    spacing: { after: 100 }
  }));
  children.push(new Paragraph({
    children: [
      new TextRun({ text: `Chapter: Selected Chapters             Maximum Marks: ${set.totalMarks}`, bold: true, size: 20 })
    ],
    spacing: { after: 200 }
  }));

  if (settings.header.instructions) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `Inst: ${settings.header.instructions}`, italics: true, size: 20, color: "444444" })],
      spacing: { after: 300 }
    }));
  }

  // Continuous Question List - No Sections
  set.questions.forEach((q, i) => {
    // Question Text
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `Q.No.${i + 1}: `, bold: true, size: fsHalf + 4 }),
        new TextRun({ text: q.questionText, size: fsHalf + 2 })
      ],
      spacing: { before: 200, after: 120 }
    }));

    // Options (if any)
    if (q.options?.length) {
      const optionsRow = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TableBorders.NONE,
        rows: [
          new TableRow({
            children: q.options.map((opt, optIdx) => new TableCell({
              children: [new Paragraph({
                children: [
                  new TextRun({ text: `${String.fromCharCode(65 + optIdx)}. `, bold: true, size: fsHalf }),
                  new TextRun({ text: opt, size: fsHalf })
                ]
              })],
              borders: TableBorders.NONE
            }))
          })
        ]
      });
      children.push(optionsRow);
    }

    // Empty lines (if any)
    const emptyLines = q.emptyLines || 0;
    for (let j = 0; j < emptyLines; j++) {
      children.push(new Paragraph({ spacing: { before: 240 } }));
    }
  });

  const paperSize = settings.header.paperSize === "A4" ? { width: 11906, height: 16838 } :
    settings.header.paperSize === "Letter" ? { width: 12240, height: 15840 } :
      settings.header.paperSize === "Legal" ? { width: 12240, height: 20160 } :
        { width: 11906, height: 16838 }; // Default to A4

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5 inch margin (720 twips = 0.5 inch)
          size: { width: paperSize.width, height: paperSize.height }
        }
      },
      children
    }]
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName("question-paper")}-set-${set.label}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function openPrintableHtml(set: GeneratedSet, settings: GeneratorSettings, showAnswers = false) {
  const isDouble = settings.header.printMode === "double";
  const fontSize = settings.header.contentFontSize;
  const pageSize = settings.header.paperSize;

  const checkMcqAnswer = (opt: string, index: number, correctRaw?: string | null) => {
    if (!correctRaw) return false;
    const correct = correctRaw.trim().toLowerCase();
    const optStr = opt.trim().toLowerCase();
    const letter = String.fromCharCode(97 + index);
    return optStr === correct || correct === letter || correct === `${letter}.` || optStr.startsWith(correct) || correct.startsWith(optStr);
  };

  const sections: Record<string, GeneratedSet["questions"]> = {};
  set.questions.forEach((q) => {
    if (!sections[q.section]) sections[q.section] = [];
    sections[q.section].push(q);
  });
  const questionHtml = (q: GeneratedSet["questions"][number], i: number) => `
    <div class="question">
      <span class="q-no">${i + 1}.</span>
      <div class="q-text">${q.questionText}</div>
      ${showAnswers && !q.options.length && q.correctAnswer ? `
        <div class="written-answer">
          <span style="font-weight:900; text-transform:uppercase; font-size:10px; opacity:0.7; display:block; margin-bottom:2px;">Answer</span>
          ${q.correctAnswer}
        </div>
      ` : ""}
      ${q.options.length ? `
        <div class="options">
          ${q.options.map((o, oi) => `
            <div class="opt">
              <span>${String.fromCharCode(65 + oi)}.</span>
              <span class="${showAnswers && checkMcqAnswer(o, oi, q.correctAnswer) ? "correct-answer" : ""}">${o}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${Array.from({ length: q.emptyLines || 0 }).map(() => `<div class="empty-line"></div>`).join("")}
    </div>
  `;

  const estimateUnits = (q: GeneratedSet["questions"][number]) => {
    let units = 2;
    units += Math.max(0, Math.ceil((q.questionText?.length ?? 0) / 140));
    if (q.options.length) units += 1.5;
    if (showAnswers && !q.options.length && q.correctAnswer) units += 1.5;
    units += Math.ceil(Math.min(14, Number((q as any).empty_lines || 0)) * 0.45);
    return units;
  };

  const pages: string[] = [];
  let pageParts: string[] = [];
  let usedUnits = 0;

  const getLimit = (pageNo: number) => {
    const baseLimit = isDouble ? 120 : 165;
    const reserve = pageNo === 1 ? 4 : 2; // header space
    return baseLimit - reserve - 1; // 1 for footer
  };

  // Flattened Loop - No Sections
  set.questions.forEach((q, i) => {
    const qUnits = estimateUnits(q);
    const limit = getLimit(pages.length + 1);

    if (usedUnits > 0 && (usedUnits + qUnits) > limit) {
      // Flush Page
      pages.push(pageParts.join(""));
      pageParts = [];
      usedUnits = 0;
    }

    pageParts.push(questionHtml(q, i));
    usedUnits += qUnits;
  });

  if (pageParts.length) {
    pages.push(pageParts.join(""));
  }
  if (!pages.length) pages.push("");

  const renderCopy = (mainHtml: string, isLastPage: boolean, pageNo: number, totalPages: number, showFullHeader: boolean) => `
    <div class="copy">
      ${settings.header.showWatermark ? `
        <div class="watermark">
          ${settings.header.watermarkType === "Image" && settings.header.schoolLogo ? `<img src="${settings.header.schoolLogo}" />` : settings.header.schoolName}
        </div>
      ` : ""}
      ${showFullHeader ? `
        <header>
          <div class="header-top">
            ${settings.header.schoolLogo ? `<div class="logo-area"><img src="${settings.header.schoolLogo}" /></div>` : ""}
            <div class="title-area" style="text-align: ${settings.header.schoolLogo && settings.header.secondaryLogo ? "center" : settings.header.schoolLogo ? "right" : settings.header.secondaryLogo ? "left" : "center"}">
              <h1>${settings.header.schoolName}</h1>
              ${settings.header.showAddress !== false ? `<p>${(settings.header as any).schoolAddress || "School Address / Campus Branch Line"}</p>` : ""}
              ${showAnswers ? `<div style="color:#16a34a; font-size:16px; font-weight:900; margin-top:5px; text-transform:uppercase; letter-spacing:2px;">Official Answer Key</div>` : ""}
            </div>
            ${settings.header.secondaryLogo ? `<div class="logo-area"><img src="${settings.header.secondaryLogo}" /></div>` : ""}
          </div>
          <div class="meta-grid">
            <div class="meta-item"><span class="meta-label">Name/ Roll No:</span> <span class="meta-value"></span></div>
            <div class="meta-item"><span class="meta-label">Date:</span> <span class="meta-value static">${settings.header.dateLabel}</span></div>
            <div class="meta-item"><span class="meta-label">Class:</span> <span class="meta-value static">${settings.header.className}</span></div>
            <div class="meta-item"><span class="meta-label">Time Allowed:</span> <span class="meta-value static">${settings.header.timeLabel}</span></div>
            <div class="meta-item"><span class="meta-label">Term / Medium:</span> <span class="meta-value static">${settings.header.term} / ${settings.header.medium}</span></div>
            <div class="meta-item"><span class="meta-label">Maximum Marks:</span> <span class="meta-value static">${set.totalMarks}</span></div>
          </div>
        </header>
        ${settings.header.instructions ? `<div class="instructions">Inst: ${settings.header.instructions}</div>` : ""}
      ` : `<div class="continuation-head"><span>${settings.header.examTitle}</span></div>`}
      <main>${mainHtml}</main>
    </div>
  `;

  const html = `
<!doctype html>
<html>
<head>
  <title>${settings.header.schoolName} - ${settings.header.examTitle}</title>
  <style>
    @page { 
      size: ${isDouble ? (pageSize === "Letter" || pageSize === "Legal" ? "11in 8.5in" : "297mm 210mm") : (pageSize === "Letter" ? "8.5in 11in" : pageSize === "Legal" ? "8.5in 14in" : "A4")}; 
      margin: 15mm; 
    }
    body { margin: 0; padding: 0; font-family: "Arial", sans-serif; -webkit-print-color-adjust: exact; background: #fff; }
    .sheet { 
      width: 100%;
      min-height: ${isDouble ? (pageSize === "Letter" || pageSize === "Legal" ? "8.5in" : "210mm") : (pageSize === "Letter" ? "11in" : pageSize === "Legal" ? "14in" : "297mm")}; 
      padding: 0; 
      box-sizing: border-box; 
      display: flex; 
      gap: 15mm;
      page-break-after: always;
      break-after: page;
    }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .copy { flex: 1; min-height: 100%; display: flex; flex-direction: column; gap: 15px; }
    .copy:not(:last-child) { border-right: 1px dashed #ccc; padding-right: 15mm; }
    
    header { border-bottom: 2px solid #000; padding-bottom: 10px; position: relative; }
    .header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
    .logo-area { width: 80px; height: 80px; border: ${settings.header.schoolLogo ? 'none' : '1px dashed #ccc'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; overflow: hidden; flex-shrink: 0; }
    .logo-area img { width: 100%; height: 100%; object-fit: contain; }
    .title-area { flex: 1; min-width: 0; padding: 0 10px; }
    .title-area h1 { margin: 0; font-size: 30px; text-transform: uppercase; font-weight: 900; }
    .title-area p { margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #666; font-weight: bold; }
    
    .meta-grid { 
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px 40px; 
      font-size: 12px; font-weight: bold; margin-top: 10px;
    }
    .meta-item { display: flex; gap: 5px; }
    .meta-label { width: 110px; }
    .meta-value { flex: 1; border-bottom: 1px solid #000; min-width: 50px; }
    .meta-value.static { border-bottom: none; }
    
    .instructions { font-size: 10px; font-style: italic; color: #666; background: #f5f5f5; padding: 5px 10px; border-left: 3px solid #ccc; margin-top: 10px; }
    .continuation-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #475569;
      border-bottom: 1px solid #dbe2ea;
      padding-bottom: 6px;
      margin-bottom: 4px;
    }
    
    main { flex: 1; margin-top: 20px; }
    .section { margin-bottom: 25px; }
    .section-header { 
      border-bottom: 1.5px solid #333; padding-bottom: 4px; margin-bottom: 15px; 
      font-size: 14px; font-weight: 900; display: flex; justify-content: space-between;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .section-header.is-cont { border-bottom: none; margin-bottom: 8px; margin-top: 5px; color: #475569; font-size: 12px; }
    
    .question { margin-bottom: 15px; font-size: ${fontSize}px; position: relative; padding-left: 30px; }
    .q-no { position: absolute; left: 0; font-weight: bold; }
    .q-text { font-weight: bold; }
    
    .options { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 5px; font-size: 11px; font-weight: bold; }
    .opt { display: flex; gap: 5px; }
    
    .empty-line { border-bottom: 1px solid #cbd5e1; height: 28px; width: 100%; margin-top: 5px; }
    
    .correct-answer { color: #16a34a; font-weight: 900; background: #dcfce7; padding: 2px 6px; border-radius: 4px; box-shadow: 0 0 0 1px #bbf7d0; }
    .written-answer { color: #16a34a; font-weight: bold; font-size: 13px; margin-top: 5px; padding: 8px 12px; background: #f0fdf4; border-left: 3px solid #22c55e; border-radius: 0 4px 4px 0; font-family: "Courier New", Courier, monospace; }
    
    .footer-std { margin-top: 10px; padding-top: 8px; border-top: 1.5px solid #eee; }
    .sigs { display: flex; justify-content: space-between; gap: 30px; margin-bottom: 5px; }
    .sig { flex: 1; text-align: center; font-size: 9px; font-weight: bold; color: #999; text-transform: uppercase; }
    .sig-line { border-bottom: 1.2px solid #ccc; height: 28px; margin-bottom: 6px; }
    .end-mark { text-align: center; font-size: 8px; font-weight: bold; color: #ccc; margin: 15px 0; letter-spacing: 5px; text-transform: uppercase; }
    .page-mark { text-align: right; font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    
    .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); font-size: 120px; color: rgba(0,0,0,${settings.header.watermarkOpacity ?? 0.05}); pointer-events: none; z-index: -1; text-transform: uppercase; width: 100%; text-align: center; font-weight: 900; }
    .watermark img { width: 400px; height: 400px; object-fit: contain; }

    @media print {
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; padding: 0; }
      .sheet { box-shadow: none; margin: 0; page-break-after: always; break-after: page; }
      .sheet:last-child { page-break-after: auto; break-after: auto; }

      /* Keep section headers glued to their first question */
      .section-header { break-after: avoid-page; page-break-after: avoid; }

      /* Footer content should never be split */
      .sigs, .footer-std { break-inside: avoid-page; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${pages
      .map((pageHtml, index) => {
        const pageNo = index + 1;
        const last = pageNo === pages.length;
        const copies = [1, isDouble ? 2 : null]
          .filter(Boolean)
          .map(() => renderCopy(pageHtml, last, pageNo, pages.length, pageNo === 1))
          .join("");
        return `<div class="sheet">${copies}</div>`;
      })
      .join("")}
  <script>
    window.onload = () => {
      window.print();
      setTimeout(() => window.close(), 500);
    }
  </script>
</body>
</html>
  `;
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
