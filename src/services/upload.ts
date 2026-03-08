import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { BloomLevel, Difficulty, QuestionType } from "@/types/domain";

const normalize = (k: string) => k.toLowerCase().trim().replace(/\s+/g, "_");

const difficultyMap: Record<string, Difficulty> = { easy: "easy", medium: "medium", hard: "hard" };
const typeMap: Record<string, QuestionType> = {
  mcq: "mcq",
  true_false: "true_false",
  truefalse: "true_false",
  fill_in_the_blanks: "fill_blanks",
  fill_blanks: "fill_blanks",
  short: "short",
  long: "long",
  matching: "matching",
  diagram: "diagram",
};
const bloomMap: Record<string, BloomLevel> = {
  remember: "remember",
  understand: "understand",
  apply: "apply",
  analyze: "analyze",
  evaluate: "evaluate",
};

export type ImportedQuestionRow = {
  chapterTitle?: string;
  chapterNumber?: number;
  questionType: QuestionType;
  questionText: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctAnswer?: string;
  difficulty: Difficulty;
  bloomLevel: BloomLevel;
  marks: number;
  explanation?: string;
  diagramUrl?: string;
};

function mapRawRow(raw: Record<string, unknown>): ImportedQuestionRow | null {
  const row = Object.fromEntries(Object.entries(raw).map(([k, v]) => [normalize(k), typeof v === "string" ? v.trim() : v]));
  const qText = String(row.question_text ?? row.question ?? "").trim();
  const mappedType = typeMap[String(row.question_type ?? "mcq").toLowerCase().replace(/\s+/g, "_")] ?? "mcq";
  const mappedDiff = difficultyMap[String(row.difficulty ?? "easy").toLowerCase()] ?? "easy";
  const mappedBloom = bloomMap[String(row.bloom_level ?? row.bloom ?? "remember").toLowerCase()] ?? "remember";
  if (!qText) {
    return null;
  }
  return {
    chapterTitle: row.chapter_title ? String(row.chapter_title) : undefined,
    chapterNumber: Number(row.chapter_number ?? 0) || undefined,
    questionType: mappedType,
    questionText: qText,
    optionA: row.option_a ? String(row.option_a) : undefined,
    optionB: row.option_b ? String(row.option_b) : undefined,
    optionC: row.option_c ? String(row.option_c) : undefined,
    optionD: row.option_d ? String(row.option_d) : undefined,
    correctAnswer: row.correct_answer ? String(row.correct_answer) : undefined,
    difficulty: mappedDiff,
    bloomLevel: mappedBloom,
    marks: Math.max(1, Number(row.marks ?? 1)),
    explanation: row.explanation ? String(row.explanation) : undefined,
    diagramUrl: row.diagram_url ? String(row.diagram_url) : undefined,
  };
}

export async function parseCsv(file: File): Promise<ImportedQuestionRow[]> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
  return parsed.data.map(mapRawRow).filter(Boolean) as ImportedQuestionRow[];
}

export async function parseExcel(file: File): Promise<ImportedQuestionRow[]> {
  const buff = await file.arrayBuffer();
  const wb = XLSX.read(buff, { type: "array" });
  const first = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first], { defval: "" });
  return rows.map(mapRawRow).filter(Boolean) as ImportedQuestionRow[];
}
