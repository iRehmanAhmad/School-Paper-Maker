import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableCell, TableRow, WidthType } from "docx";
import { jsPDF } from "jspdf";
import { GeneratedPaper } from "@/types";

function buildLines(count: number) {
  return Array.from({ length: count }).map(() => "____________________________");
}

export function buildPrintableHtml(data: GeneratedPaper, type: "question" | "answer" | "rubric") {
  const set = data.sets[0];

  if (type === "answer") {
    const items = set.questions.map((q, i) => `<li>Q${i + 1}: ${q.correctAnswer ?? "N/A"}</li>`).join("");
    return `<!doctype html><html><head><meta charset=\"utf-8\"><title>Answer Key</title></head><body><h1>Answer Key</h1><ol>${items}</ol></body></html>`;
  }

  if (type === "rubric") {
    const rows = set.questions
      .map((q, i) => `<tr><td>Q${i + 1}</td><td>${q.marks}</td><td>${q.explanation ?? "Correct response"}</td></tr>`)
      .join("");
    return `<!doctype html><html><head><meta charset=\"utf-8\"><title>Rubric</title></head><body><h1>Rubric / Marking Scheme</h1><table border=\"1\" cellspacing=\"0\" cellpadding=\"6\"><tr><th>Question</th><th>Marks</th><th>Criteria</th></tr>${rows}</table></body></html>`;
  }

  const qList = set.questions
    .map((q, i) => {
      const options = q.options.length ? `<ul>${q.options.map((o) => `<li>${o}</li>`).join("")}</ul>` : "";
      const answerLines = data.request.layout.includeAnswerLines && ["SHORT", "LONG"].includes(q.questionType)
        ? `<div>${buildLines(2).join("<br/>")}</div>`
        : "";
      return `<div><p><strong>Q${i + 1}.</strong> ${q.questionText} (${q.marks})</p>${options}${answerLines}</div>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset=\"utf-8\"><title>Question Paper</title></head><body><h1>${data.request.header.schoolName}</h1><h2>${data.request.examName}</h2><p>Class: ${data.request.header.className} | Subject: ${data.request.header.subjectName}</p><p>Time: ${data.request.timeMinutes} min | Marks: ${data.request.totalMarks}</p><p>${data.request.instructions ?? "Answer all questions"}</p>${qList}</body></html>`;
}

export function buildPdf(data: GeneratedPaper, type: "question" | "answer" | "rubric") {
  const doc = new jsPDF({ orientation: data.request.layout.orientation, unit: "pt", format: data.request.layout.paperSize });
  doc.setFontSize(data.request.layout.fonts.heading);
  doc.text(data.request.header.schoolName, 40, 40);
  doc.setFontSize(12);
  doc.text(data.request.examName, 40, 60);

  let y = 90;
  const set = data.sets[0];

  if (type === "answer") {
    doc.text("Answer Key", 40, y);
    y += 20;
    set.questions.forEach((q, i) => {
      doc.text(`${i + 1}. ${q.correctAnswer ?? "N/A"}`, 40, y);
      y += 16;
    });
  } else if (type === "rubric") {
    doc.text("Rubric / Marking Scheme", 40, y);
    y += 20;
    set.questions.forEach((q, i) => {
      doc.text(`Q${i + 1} | ${q.marks} marks | ${q.explanation ?? "Correct response"}`, 40, y);
      y += 16;
    });
  } else {
    set.questions.forEach((q, i) => {
      doc.text(`${i + 1}. ${q.questionText} (${q.marks})`, 40, y);
      y += 16;
      q.options.forEach((o) => {
        doc.text(`- ${o}`, 54, y);
        y += 14;
      });
      if (data.request.layout.includeAnswerLines && ["SHORT", "LONG"].includes(q.questionType)) {
        doc.text("________________________", 54, y);
        y += 14;
        doc.text("________________________", 54, y);
        y += 14;
      }
      y += 6;
      if (y > 740) {
        doc.addPage();
        y = 40;
      }
    });
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export async function buildDocx(data: GeneratedPaper, type: "question" | "answer" | "rubric") {
  const set = data.sets[0];
  const children: Paragraph[] = [
    new Paragraph({ text: data.request.header.schoolName, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: data.request.examName, heading: HeadingLevel.HEADING_2 }),
  ];

  if (type === "answer") {
    children.push(new Paragraph("Answer Key"));
    set.questions.forEach((q, i) => children.push(new Paragraph(`Q${i + 1}: ${q.correctAnswer ?? "N/A"}`)));
  } else if (type === "rubric") {
    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: ["Question", "Marks", "Criteria"].map((t) => new TableCell({ children: [new Paragraph(t)] })),
        }),
        ...set.questions.map(
          (q, i) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(`Q${i + 1}`)] }),
                new TableCell({ children: [new Paragraph(String(q.marks))] }),
                new TableCell({ children: [new Paragraph(q.explanation ?? "Correct response")] }),
              ],
            }),
        ),
      ],
    });
    const doc = new Document({ sections: [{ children: [...children, new Paragraph("Rubric / Marking Scheme"), table] }] });
    return Buffer.from(await Packer.toBuffer(doc));
  } else {
    set.questions.forEach((q, i) => {
      children.push(new Paragraph({ children: [new TextRun({ text: `Q${i + 1}. ${q.questionText} (${q.marks})`, bold: true })] }));
      q.options.forEach((o) => children.push(new Paragraph(`- ${o}`)));
      if (data.request.layout.includeAnswerLines && ["SHORT", "LONG"].includes(q.questionType)) {
        children.push(new Paragraph("____________________________"));
        children.push(new Paragraph("____________________________"));
      }
    });
  }

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}