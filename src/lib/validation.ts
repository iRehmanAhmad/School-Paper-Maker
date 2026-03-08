import { Difficulty, ExamType, QuestionType, Role } from "@prisma/client";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const classSchema = z.object({
  name: z.string().min(1).max(120),
  schoolId: z.string().optional(),
});

export const subjectSchema = z.object({
  classId: z.string().min(1),
  name: z.string().min(1).max(120),
});

export const chapterSchema = z.object({
  subjectId: z.string().min(1),
  title: z.string().min(1).max(200),
  chapterNumber: z.number().int().positive(),
});

export const questionSchema = z.object({
  chapterId: z.string().min(1),
  questionType: z.nativeEnum(QuestionType),
  questionText: z.string().min(5),
  optionA: z.string().optional(),
  optionB: z.string().optional(),
  optionC: z.string().optional(),
  optionD: z.string().optional(),
  correctAnswer: z.string().optional(),
  difficulty: z.nativeEnum(Difficulty),
  marks: z.number().int().positive().max(100),
  explanation: z.string().optional(),
});

export const templateSchema = z.object({
  name: z.string().min(1),
  examType: z.nativeEnum(ExamType),
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  structure: z.record(z.string(), z.number().int().min(0)),
  difficultyDistribution: z.record(z.string(), z.number().min(0).max(100)),
  layout: z.record(z.string(), z.unknown()),
});

export const paperGenerationSchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  chapterIds: z.array(z.string().min(1)).min(1),
  examType: z.nativeEnum(ExamType),
  title: z.string().min(1),
  examName: z.string().min(1),
  timeMinutes: z.number().int().positive(),
  totalMarks: z.number().int().positive(),
  instructions: z.string().optional(),
  structure: z.record(z.string(), z.number().int().min(0)),
  difficultyDistribution: z.record(z.string(), z.number().min(0).max(100)),
  layout: z.object({
    paperSize: z.enum(["A4", "A5", "Letter", "Legal"]),
    orientation: z.enum(["portrait", "landscape"]),
    columns: z.enum(["single", "two"]),
    spacing: z.enum(["compact", "normal", "extra"]),
    includeAnswerLines: z.boolean(),
    margins: z.object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() }),
    fonts: z.object({ heading: z.number(), question: z.number(), option: z.number() }),
    watermark: z.string().optional(),
  }),
  header: z.object({
    schoolName: z.string(),
    schoolLogo: z.string().optional(),
    examTitle: z.string(),
    className: z.string(),
    subjectName: z.string(),
    timeLabel: z.string(),
    marksLabel: z.string(),
    teacherName: z.string(),
  }),
  sets: z.number().int().min(1).max(5),
  shuffleOptions: z.boolean().default(true),
});

export const createUserSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  role: z.nativeEnum(Role),
  schoolId: z.string().optional(),
  password: z.string().min(8),
});
