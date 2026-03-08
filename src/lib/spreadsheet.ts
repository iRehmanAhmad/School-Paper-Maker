import * as XLSX from "xlsx";
import { Difficulty, QuestionType } from "@prisma/client";

export type ParsedQuestion = {
  chapterId: string;
  questionType: QuestionType;
  questionText: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctAnswer?: string;
  difficulty: Difficulty;
  marks: number;
  explanation?: string;
};

function toQuestionType(value: string): QuestionType {
  const v = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (v === "TRUE/FALSE") {
    return QuestionType.TRUE_FALSE;
  }
  if (Object.values(QuestionType).includes(v as QuestionType)) {
    return v as QuestionType;
  }
  return QuestionType.SHORT;
}

function toDifficulty(value: string): Difficulty {
  const v = value.trim().toUpperCase();
  if (v in Difficulty) {
    return v as Difficulty;
  }
  return Difficulty.MEDIUM;
}

export function parseSpreadsheet(file: Buffer): ParsedQuestion[] {
  const workbook = XLSX.read(file, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: "" });

  return rows
    .map((row) => ({
      chapterId: String(row.chapter_id ?? row.chapterId ?? "").trim(),
      questionType: toQuestionType(String(row.question_type ?? row.questionType ?? "SHORT")),
      questionText: String(row.question_text ?? row.questionText ?? "").trim(),
      optionA: String(row.option_a ?? row.optionA ?? "").trim() || undefined,
      optionB: String(row.option_b ?? row.optionB ?? "").trim() || undefined,
      optionC: String(row.option_c ?? row.optionC ?? "").trim() || undefined,
      optionD: String(row.option_d ?? row.optionD ?? "").trim() || undefined,
      correctAnswer: String(row.correct_answer ?? row.correctAnswer ?? "").trim() || undefined,
      difficulty: toDifficulty(String(row.difficulty ?? "MEDIUM")),
      marks: Number(row.marks ?? 1),
      explanation: String(row.explanation ?? "").trim() || undefined,
    }))
    .filter((r) => r.chapterId && r.questionText && Number.isFinite(r.marks));
}