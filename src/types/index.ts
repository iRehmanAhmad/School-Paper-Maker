import { Difficulty, ExamType, QuestionType, Role } from "@prisma/client";

export type AuthUser = {
  id: string;
  schoolId: string | null;
  email: string;
  role: Role;
  fullName: string;
};

export type GeneratorRequest = {
  classId: string;
  subjectId: string;
  chapterIds: string[];
  examType: ExamType;
  title: string;
  examName: string;
  timeMinutes: number;
  totalMarks: number;
  instructions?: string;
  structure: Partial<Record<QuestionType, number>>;
  difficultyDistribution: Partial<Record<Difficulty, number>>;
  layout: {
    paperSize: "A4" | "A5" | "Letter" | "Legal";
    orientation: "portrait" | "landscape";
    columns: "single" | "two";
    spacing: "compact" | "normal" | "extra";
    includeAnswerLines: boolean;
    margins: { top: number; right: number; bottom: number; left: number };
    fonts: { heading: number; question: number; option: number };
    watermark?: string;
  };
  header: {
    schoolName: string;
    schoolLogo?: string;
    examTitle: string;
    className: string;
    subjectName: string;
    timeLabel: string;
    marksLabel: string;
    teacherName: string;
  };
  sets: number;
  shuffleOptions: boolean;
};

export type GeneratedSet = {
  label: string;
  questions: {
    id: string;
    section: string;
    orderIndex: number;
    questionType: QuestionType;
    questionText: string;
    options: string[];
    correctAnswer: string | null;
    marks: number;
    explanation: string | null;
  }[];
};

export type GeneratedPaper = {
  request: GeneratorRequest;
  sets: GeneratedSet[];
};