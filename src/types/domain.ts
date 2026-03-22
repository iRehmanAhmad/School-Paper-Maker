export type UserRole = "admin" | "teacher";
export type Difficulty = "easy" | "medium" | "hard";
export type BloomLevel = "remember" | "understand" | "apply" | "analyze" | "evaluate";
export type QuestionType = "mcq" | "true_false" | "fill_blanks" | "short" | "long" | "matching" | "diagram";
export type ExamType = "weekly" | "monthly" | "chapterwise" | "quarterly" | "half_yearly" | "annual";
export type QuestionLevel = "exercise" | "additional" | "past_papers" | "examples" | "conceptual";
export type ArtifactType = "question" | "worksheet" | "lesson_plan";
export type IngestStatus = "uploaded" | "processing" | "ready" | "failed";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type CandidateStatus = "pending_review" | "approved" | "rejected" | "published";
export type SubscriptionPlanCode = "basic" | "advanced";
export type SubscriptionStatus = "pending_payment" | "active" | "expired" | "suspended" | "cancelled";
export type PaymentProvider = "jazzcash" | "easypaisa" | "manual";
export type PaymentIntentStatus = "pending" | "success" | "failed" | "expired" | "cancelled";

export type School = {
  id: string;
  name: string;
  logo_url?: string | null;
  created_at: string;
};

export type SubscriptionPlan = {
  id: string;
  code: SubscriptionPlanCode;
  name: string;
  description?: string | null;
  max_paper_sets: number;
  allow_worksheets: boolean;
  allow_lesson_plans: boolean;
  created_at: string;
};

export type Subscription = {
  id: string;
  school_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  starts_at: string;
  ends_at: string;
  payment_method?: PaymentProvider | null;
  transaction_id?: string | null;
  paid_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentIntent = {
  id: string;
  school_id: string;
  subscription_id?: string | null;
  provider: PaymentProvider;
  amount_pkr: number;
  status: PaymentIntentStatus;
  merchant_txn_id: string;
  provider_txn_id?: string | null;
  payer_phone?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  paid_at?: string | null;
};

export type PaymentEvent = {
  id: string;
  school_id: string;
  payment_intent_id?: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  signature_valid?: boolean | null;
  created_at: string;
};

export type AuditLog = {
  id: string;
  school_id?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  details?: Record<string, unknown> | null;
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
  // Temporary input field (not persisted for production auth).
  password?: string;
  // Local/demo fallback hash. In Supabase auth mode, password is handled by auth.users.
  password_hash?: string;
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

export type SubjectOutlineChapter = {
  title: string;
  topics: string[];
};

export type SubjectOutline = {
  id: string;
  school_id: string;
  exam_body_id: string;
  class_id: string;
  subject_id: string;
  source_name: string;
  source_path?: string | null;
  source_type: string;
  outline: SubjectOutlineChapter[];
  status: "draft" | "approved" | "archived";
  created_by: string;
  created_at: string;
};

export type ContentSource = {
  id: string;
  school_id: string;
  exam_body_id: string;
  class_id: string;
  subject_id: string;
  chapter_id: string;
  topic_id?: string | null;
  title: string;
  file_path: string;
  file_hash: string;
  version_no: number;
  status: IngestStatus;
  pages?: number | null;
  error_message?: string | null;
  created_by: string;
  created_at: string;
};

export type ContentChunk = {
  id: string;
  source_id: string;
  school_id: string;
  exam_body_id: string;
  class_id: string;
  subject_id: string;
  chapter_id: string;
  topic_id?: string | null;
  chunk_no: number;
  page_from?: number | null;
  page_to?: number | null;
  content: string;
  content_hash: string;
  created_at: string;
};

export type GenerationJob = {
  id: string;
  school_id: string;
  exam_body_id: string;
  class_id: string;
  subject_id: string;
  chapter_id: string;
  topic_id?: string | null;
  artifact: ArtifactType;
  request_json: Record<string, unknown>;
  status: JobStatus;
  provider?: string | null;
  model?: string | null;
  attempts: number;
  error_message?: string | null;
  created_by: string;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
};

export type GenerationCandidate = {
  id: string;
  job_id: string;
  school_id: string;
  artifact: ArtifactType;
  payload: Record<string, unknown>;
  validation_errors?: Record<string, unknown> | null;
  status: CandidateStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  published_table?: string | null;
  published_id?: string | null;
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

export type Worksheet = {
  id: string;
  school_id: string;
  exam_body_id: string;
  class_id: string;
  subject_id: string;
  chapter_id: string;
  topic_id?: string | null;
  title: string;
  settings_json: Record<string, unknown>;
  created_by: string;
  created_at: string;
};

export type WorksheetItem = {
  id: string;
  worksheet_id: string;
  order_no: number;
  item_type: string;
  prompt: string;
  options?: unknown[] | null;
  answer_key?: string | null;
  marks?: number | null;
  bloom_level?: string | null;
  difficulty?: string | null;
};

export type LessonPlan = {
  id: string;
  school_id: string;
  exam_body_id: string;
  class_id: string;
  subject_id: string;
  chapter_id: string;
  topic_id?: string | null;
  title: string;
  duration_minutes?: number | null;
  objectives: unknown[];
  created_by: string;
  created_at: string;
};

export type LessonPlanBlock = {
  id: string;
  lesson_plan_id: string;
  order_no: number;
  block_type: string;
  duration_minutes?: number | null;
  content: string;
  resources: unknown[];
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
