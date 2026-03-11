export type UserRole = "admin" | "teacher";
export type Difficulty = "easy" | "medium" | "hard";
export type BloomLevel = "remember" | "understand" | "apply" | "analyze" | "evaluate";
export type QuestionType = "mcq" | "true_false" | "fill_blanks" | "short" | "long" | "matching" | "diagram";
export type ExamType = "weekly" | "monthly" | "chapterwise" | "quarterly" | "half_yearly" | "annual";
export type QuestionLevel = "exercise" | "additional" | "past_papers" | "examples" | "conceptual";

export type School = {
  id: string;
  name: string;
  logo_url?: string | null;
  created_at: string;
};

export type ExamBody = {
  id: string;
  school_id: string;
  name: string;
  created_at: string;
};

export type UserProfile = {
  id: string;
  email: string;
  role: UserRole;
  school_id: string | null;
  full_name: string;
  is_premium?: boolean;
  created_at: string;
};

export type ClassEntity = {
  id: string;
  school_id: string;
  exam_body_id: string;
  name: string;
  created_at: string;
};

export type SubjectEntity = {
  id: string;
  class_id: string;
  name: string;
  created_at: string;
};

export type ChapterEntity = {
  id: string;
  subject_id: string;
  title: string;
  chapter_number: number;
  created_at: string;
};

export type TopicEntity = {
  id: string;
  chapter_id: string;
  title: string;
  topic_number: number;
  created_at: string;
};

export type Question = {
  id: string;
  chapter_id: string;
  topic_id?: string | null;
  school_id: string;
  question_type: QuestionType;
  question_text: string;
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
  correct_answer?: string | null;
  difficulty: Difficulty;
  bloom_level?: BloomLevel;
  question_level: QuestionLevel;
  marks?: number;
  diagram_url?: string | null;
  explanation?: string | null;
  created_at: string;
};

export type ChapterWeightage = {
  id: string;
  chapter_id: string;
  exam_type: ExamType;
  weight_percent: number;
};

export type BlueprintSection = {
  type: QuestionType;
  count: number;
  choice?: number;
  empty_lines?: number;
  bloom_level?: BloomLevel;
  question_level?: QuestionLevel;
  marks?: number;
};

export type Blueprint = {
  id: string;
  class_id: string;
  subject_id: string;
  exam_type: ExamType;
  name: string;
  structure_json: {
    sections: BlueprintSection[];
  };
};

export type Paper = {
  id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string;
  exam_type: ExamType;
  total_marks: number;
  time_limit: number;
  settings_json: Record<string, unknown>;
  created_at: string;
};

export type PaperQuestion = {
  id: string;
  paper_id: string;
  question_id: string;
  order_number: number;
  paper_set: string;
  shuffled_options?: string[] | null;
};

export type QuestionUsage = {
  id: string;
  question_id: string;
  paper_id: string;
  used_at: string;
};

export type PaperTemplate = {
  id: string;
  teacher_id: string;
  school_id: string;
  name: string;
  settings_json: GeneratorSettings;
  created_at: string;
};

export type GeneratorSettings = {
  classId: string;
  subjectId: string;
  chapterIds: string[];
  topicIds?: string[];
  examType: ExamType;
  blueprintId?: string;
  sets: number;
  recentPapersToAvoid: number;
  difficultyDistribution: Partial<Record<Difficulty, number>>;
  bloomDistribution: Partial<Record<BloomLevel, number>>;
  chapterWeightage: Record<string, number>;
  layout: {
    paperSize: "A4" | "A5" | "Letter" | "Legal";
    orientation: "portrait" | "landscape";
    columns: "single" | "two";
    spacing: "compact" | "normal" | "wide";
    answerLines: number;
    margins: { top: number; right: number; bottom: number; left: number };
    fonts: { heading: number; question: number; option: number };
  };
  header: {
    schoolName: string;
    schoolLogo?: string;
    secondaryLogo?: string;
    schoolAddress: string;
    examTitle: string;
    className: string;
    subjectName: string;
    timeLabel: string;
    marksLabel: string;
    dateLabel: string;
    instructions: string;
    teacherName: string;
    signatureBlocks: string[]; // e.g. ["Teacher", "Principal"]
    showWatermark: boolean;
    showQR: boolean;
    printMode: "single" | "double";
    paperSize: "A4" | "Letter" | "Legal";
    medium: "English" | "Urdu" | "Both";
    term: string;
    blankInlineFor: "English" | "Urdu" | "Math" | "None";
    contentFontSize: number;
    // Advanced UI Settings
    layoutStyle: string;
    lineHeight: number;
    watermarkOpacity: number;
    showAddress: boolean;
    watermarkType: string;
  };
};

export type GeneratedQuestion = {
  id: string;
  orderNumber: number;
  setLabel: string;
  section: string;
  questionType: QuestionType;
  questionText: string;
  options: string[];
  correctAnswer?: string | null;
  marks: number;
  emptyLines?: number;
  explanation?: string | null;
  diagramUrl?: string | null;
};

export type GeneratedSet = {
  label: string;
  questions: GeneratedQuestion[];
  totalMarks: number;
  rubric?: string;
};

export type GeneratedPaperBundle = {
  paper: Paper;
  sets: GeneratedSet[];
};
