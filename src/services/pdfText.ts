type PdfTextItem = {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
};

const PAGE_MARKER_PREFIX = "[[PG_PAGE:";

let cachedPdfjs: any = null;
let cachedTesseract: any = null;

type PdfTextOptions = {
  ocrPages?: number;
  ocrLang?: string;
  onProgress?: (message: string) => void;
  onProgressValue?: (value: number) => void;
  cacheKeyMeta?: string;
  skipCache?: boolean;
  skipOcr?: boolean;
  includePageMarkers?: boolean;
};

async function loadPdfJs() {
  if (cachedPdfjs) return cachedPdfjs;
  const pdfjsLib = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/legacy/build/pdf.worker.mjs";
  cachedPdfjs = pdfjsLib;
  return pdfjsLib;
}

async function loadTesseract() {
  if (cachedTesseract) return cachedTesseract;
  const mod = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.5/dist/tesseract.esm.min.js");
  cachedTesseract = mod;
  return mod;
}

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

function getCache(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setCache(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore cache failures
  }
}

async function extractTextFromPdf(pdf: any, maxChars: number, includePageMarkers = false) {
  let combined = "";
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let currentLine: string[] = [];
    let previousY: number | null = null;

    for (const item of content.items as PdfTextItem[]) {
      const text = item?.str ? String(item.str).trim() : "";
      if (!text) continue;

      const currentY = Array.isArray(item.transform) ? item.transform[5] : null;
      const movedToNewLine =
        item.hasEOL
        || (typeof currentY === "number" && typeof previousY === "number" && Math.abs(currentY - previousY) > 2.5);

      if (movedToNewLine && currentLine.length) {
        lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
        currentLine = [];
      }

      currentLine.push(text);
      if (typeof currentY === "number") {
        previousY = currentY;
      }
    }

    if (currentLine.length) {
      lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
    }

    const text = lines.filter(Boolean).join("\n");
    combined += includePageMarkers
      ? `\n${PAGE_MARKER_PREFIX}${pageNo}]]\n${text}\n`
      : `${text}\n`;
    if (combined.length >= maxChars) {
      break;
    }
  }
  return combined.slice(0, maxChars).trim();
}

async function extractTextWithOcr(
  pdf: any,
  maxChars: number,
  pageLimit = 3,
  lang = "eng",
  includePageMarkers = false,
  onProgress?: (message: string) => void,
  onProgressValue?: (value: number) => void
) {
  if (typeof document === "undefined") {
    throw new Error("OCR requires a browser environment");
  }
  const { createWorker } = await loadTesseract();
  onProgress?.("Preparing OCR engine...");
  onProgressValue?.(10);
  const worker = await createWorker({
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.5/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0/tesseract-core.wasm.js",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
    logger: (m: any) => {
      if (m?.status === "recognizing text" && typeof m?.progress === "number") {
        const value = 10 + Math.round(m.progress * 80);
        onProgressValue?.(value);
      }
    },
  });
  let combined = "";

  try {
    await worker.loadLanguage(lang);
    await worker.initialize(lang);
    const limit = Math.min(pdf.numPages, pageLimit);
    for (let pageNo = 1; pageNo <= limit; pageNo += 1) {
      onProgress?.(`Reading page ${pageNo}/${limit}...`);
      onProgressValue?.(10 + Math.round((pageNo / limit) * 80));
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) continue;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      const result = await worker.recognize(canvas);
      const text = result?.data?.text || "";
      combined += includePageMarkers
        ? `\n${PAGE_MARKER_PREFIX}${pageNo}]]\n${text}\n`
        : `${text}\n`;
      if (combined.length >= maxChars) break;
    }
  } finally {
    onProgress?.("Finalizing OCR...");
    onProgressValue?.(95);
    await worker.terminate();
  }

  return combined.slice(0, maxChars).trim();
}

export async function extractPdfText(file: File, maxChars = 50000, options?: PdfTextOptions) {
  const pdfjsLib = await loadPdfJs();
  options?.onProgressValue?.(2);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = options?.cacheKeyMeta ? `_${options.cacheKeyMeta}` : "";
  const markerFlag = options?.includePageMarkers ? "markers" : "plain";
  const cacheKey = `pg_pdf_${await sha256Hex(bytes.buffer)}_${options?.ocrLang || "eng"}_${options?.ocrPages || 4}_${maxChars}_${markerFlag}${meta}`;
  if (!options?.skipCache) {
    const cached = getCache(cacheKey);
    if (cached) {
      options?.onProgress?.("Loaded cached OCR result.");
      options?.onProgressValue?.(100);
      return cached;
    }
  }
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  options?.onProgressValue?.(6);

  const directText = await extractTextFromPdf(pdf, maxChars, Boolean(options?.includePageMarkers));
  if (directText.length >= 80) {
    setCache(cacheKey, directText);
    options?.onProgressValue?.(100);
    return directText;
  }
  if (options?.skipOcr) {
    if (directText.length > 0) {
      setCache(cacheKey, directText);
      options?.onProgressValue?.(100);
      return directText;
    }
    throw new Error("Text layer is empty. Turn off 'Text-only' or enable OCR.");
  }

  try {
    const ocrPages = Math.max(1, Math.min(options?.ocrPages || 4, 10));
    const ocrLang = options?.ocrLang || "eng";
    const ocrText = await extractTextWithOcr(
      pdf,
      maxChars,
      ocrPages,
      ocrLang,
      Boolean(options?.includePageMarkers),
      options?.onProgress,
      options?.onProgressValue
    );
    if (ocrText.length >= 40) {
      setCache(cacheKey, ocrText);
      options?.onProgressValue?.(100);
      return ocrText;
    }
  } catch {
    // ignore and surface message below
  }

  if (directText.length > 0) {
    setCache(cacheKey, directText);
    options?.onProgressValue?.(100);
    return directText;
  }

  throw new Error("No readable text found in this PDF. Try increasing OCR pages, or switch OCR language to English + Urdu.");
}
