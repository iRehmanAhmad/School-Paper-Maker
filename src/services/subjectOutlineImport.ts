import type { SubjectOutlineChapter } from "@/types/domain";

type Candidate = {
  title: string;
  lineIndex: number;
};

const STRUCTURE_MARKERS = [
  "table of contents",
  "contents",
  "syllabus",
  "units",
  "chapters",
  "course contents",
];

const CHAPTER_NOISE = [
  "learning outcomes",
  "student learning outcomes",
  "objectives",
  "overview",
  "introduction",
  "summary",
  "exercise",
  "exercises",
  "review exercise",
  "review",
  "activities",
  "activity",
  "assessment",
  "worksheet",
  "teacher guide",
  "teaching guide",
  "glossary",
  "appendix",
  "model paper",
  "sample paper",
  "answers",
];

const TOPIC_NOISE = [
  ...CHAPTER_NOISE,
  "notes",
  "definition",
  "definitions",
  "true false",
  "mcqs",
  "short questions",
  "long questions",
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimPageNumbers(value: string) {
  return value
    .replace(/\.{2,}\s*\d{1,4}$/g, "")
    .replace(/\s+\d{1,4}$/g, "")
    .trim();
}

function cleanChapterTitle(raw: string) {
  let title = normalizeWhitespace(raw);
  title = trimPageNumbers(title);
  title = title.replace(/^(unit|chapter|lesson|section|block|part)\s*[ivxlcdm\d.]*\s*[:.)-]?\s*/i, "");
  title = title.replace(/^[ivxlcdm\d]{1,6}[.)-]\s+/i, "");
  title = title.replace(/^[ivxlcdm\d]{1,6}\s+/i, "");
  title = title.replace(/^[-*•]\s*/, "");
  title = title.replace(/\s+[|:;-]\s*$/g, "");
  title = normalizeWhitespace(title);

  const lower = title.toLowerCase();
  if (!title || title.length < 3 || title.length > 110) return "";
  if (CHAPTER_NOISE.some((noise) => lower === noise || lower.startsWith(`${noise} `))) return "";
  if (/^[\d.\- ]+$/.test(title)) return "";
  if ((title.match(/[,:;]/g) || []).length > 3) return "";
  return title;
}

function cleanTopicTitle(raw: string) {
  let title = normalizeWhitespace(raw);
  title = trimPageNumbers(title);
  title = title.replace(/^(exercise|topic)\s*[ivxlcdm\d.]*\s*[:.)-]?\s*/i, "");
  title = title.replace(/^[a-z]\)\s+/i, "");
  title = title.replace(/^[ivxlcdm\d]{1,8}([.)-]\d{1,3})?\s*[.)-]?\s*/i, "");
  title = title.replace(/^[-*•]\s*/, "");
  title = normalizeWhitespace(title);

  const lower = title.toLowerCase();
  if (!title || title.length < 3 || title.length > 90) return "";
  if (TOPIC_NOISE.some((noise) => lower === noise || lower.startsWith(`${noise} `))) return "";
  if (/^[\d.\- ]+$/.test(title)) return "";
  return title;
}

function splitLines(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .flatMap((line) => line.split(/\s{3,}/g))
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function findFocusLines(lines: string[]) {
  const markerIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return STRUCTURE_MARKERS.some((marker) => lower.includes(marker));
  });

  if (markerIndex >= 0) {
    return lines.slice(markerIndex, markerIndex + 220);
  }
  return lines.slice(0, 260);
}

function isChapterLine(line: string) {
  return /^(unit|chapter|lesson|section|block|part)\s*[ivxlcdm\d.]*\s*[:.)-]?\s*.+$/i.test(line)
    || /^[ivxlcdm\d]{1,6}[.)-]\s+[A-Za-z].{2,100}$/.test(line)
    || /^[ivxlcdm\d]{1,6}\s+[A-Za-z].{2,100}$/.test(line);
}

function isLikelyTopicLine(line: string) {
  return /^\d{1,2}\.\d{1,2}\s+.+$/.test(line)
    || /^exercise\s+\d{1,2}\.\d{1,2}\s+.+$/i.test(line)
    || /^[-*•]\s+.+$/.test(line)
    || /^[a-z]\)\s+.+$/i.test(line);
}

function extractCandidates(lines: string[]) {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  lines.forEach((line, lineIndex) => {
    if (!isChapterLine(line)) return;
    const title = cleanChapterTitle(line);
    const key = normalizeKey(title);
    if (!title || seen.has(key)) return;
    seen.add(key);
    candidates.push({ title, lineIndex });
  });

  return candidates;
}

function extractTopicsForCandidate(lines: string[], start: number, end: number) {
  const seen = new Set<string>();
  const topics: string[] = [];

  for (let index = start + 1; index < end; index += 1) {
    const line = lines[index];
    if (!line || isChapterLine(line)) continue;
    if (!isLikelyTopicLine(line)) continue;
    const topic = cleanTopicTitle(line);
    const key = normalizeKey(topic);
    if (!topic || seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
    if (topics.length >= 8) break;
  }

  return topics;
}

function buildOutlineFromLines(lines: string[]) {
  const candidates = extractCandidates(lines);
  if (!candidates.length) return [];

  return candidates.map((candidate, index) => {
    const nextLineIndex = candidates[index + 1]?.lineIndex ?? Math.min(lines.length, candidate.lineIndex + 24);
    const topics = extractTopicsForCandidate(lines, candidate.lineIndex, nextLineIndex);
    return { title: candidate.title, topics };
  });
}

export function extractSubjectOutlineDraft(rawText: string): SubjectOutlineChapter[] {
  const lines = splitLines(rawText);
  if (!lines.length) return [];

  const focusLines = findFocusLines(lines);
  const focusOutline = buildOutlineFromLines(focusLines);
  if (focusOutline.length >= 2) {
    return focusOutline;
  }

  const fullOutline = buildOutlineFromLines(lines);
  if (fullOutline.length >= 1) {
    return fullOutline;
  }

  return [];
}
