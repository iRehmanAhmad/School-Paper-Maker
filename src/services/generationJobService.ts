import { hasSupabase, supabase } from "@/services/supabase";
import type {
  ArtifactType,
  BloomLevel,
  CandidateStatus,
  Difficulty,
  GenerationCandidate,
  GenerationJob,
  JobStatus,
  Question,
  QuestionLevel,
  QuestionType,
} from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal } from "./baseService";
import { addLessonPlanWithBlocks } from "./lessonPlanService";
import { addQuestions } from "./questionService";
import { assertCanGenerateArtifact } from "./subscriptionService";
import { addWorksheetWithItems } from "./worksheetService";

type GenerationJobFilters = {
  artifact?: ArtifactType;
  status?: JobStatus;
  chapter_id?: string;
  topic_id?: string;
};

type QueueGenerationJobInput = Omit<
  GenerationJob,
  "id" | "status" | "attempts" | "started_at" | "finished_at" | "error_message" | "created_at"
> & {
  status?: JobStatus;
};

type UpdateJobPatch = Partial<
  Pick<GenerationJob, "status" | "provider" | "model" | "error_message" | "started_at" | "finished_at" | "attempts">
>;

type CandidateFilters = {
  job_id?: string;
  artifact?: ArtifactType;
  status?: CandidateStatus;
};

type CreateCandidateInput = Omit<
  GenerationCandidate,
  "id" | "created_at" | "status" | "approved_by" | "approved_at" | "published_table" | "published_id"
> & {
  status?: CandidateStatus;
  validation_errors?: Record<string, unknown> | null;
};

type ReviewAction = "approve" | "reject";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((x) => String(x || "").trim()).filter(Boolean);
}

function coerceQuestionType(value: unknown): QuestionType {
  const fallback: QuestionType = "mcq";
  const raw = String(value || "").toLowerCase();
  const allowed: QuestionType[] = ["mcq", "true_false", "fill_blanks", "short", "long", "matching", "diagram"];
  return (allowed.includes(raw as QuestionType) ? raw : fallback) as QuestionType;
}

function coerceDifficulty(value: unknown): Difficulty {
  const raw = String(value || "").toLowerCase();
  return (["easy", "medium", "hard"].includes(raw) ? raw : "medium") as Difficulty;
}

function coerceBloom(value: unknown): BloomLevel | undefined {
  const raw = String(value || "").toLowerCase();
  const allowed: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate"];
  return allowed.includes(raw as BloomLevel) ? (raw as BloomLevel) : undefined;
}

function coerceQuestionLevel(value: unknown): QuestionLevel {
  const raw = String(value || "").toLowerCase();
  const allowed: QuestionLevel[] = ["exercise", "additional", "past_papers", "examples", "conceptual"];
  return (allowed.includes(raw as QuestionLevel) ? raw : "exercise") as QuestionLevel;
}

function defaultMarksForType(type: QuestionType) {
  if (type === "long") return 5;
  if (type === "short") return 2;
  return 1;
}

function toJsonObject(value: unknown) {
  return isRecord(value) ? value : {};
}

export async function getGenerationJobs(schoolId: string, filters?: GenerationJobFilters) {
  ensureSeed();
  if (hasSupabase && supabase) {
    let query = supabase
      .from("generation_jobs")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
    if (filters?.artifact) query = query.eq("artifact", filters.artifact);
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.chapter_id) query = query.eq("chapter_id", filters.chapter_id);
    if (filters?.topic_id) query = query.eq("topic_id", filters.topic_id);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as GenerationJob[];
  }

  let rows = readLocal<GenerationJob>(DB.generationJobs).filter((row) => row.school_id === schoolId);
  if (filters?.artifact) rows = rows.filter((row) => row.artifact === filters.artifact);
  if (filters?.status) rows = rows.filter((row) => row.status === filters.status);
  if (filters?.chapter_id) rows = rows.filter((row) => row.chapter_id === filters.chapter_id);
  if (filters?.topic_id) rows = rows.filter((row) => (row.topic_id || "") === filters.topic_id);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function queueGenerationJob(input: QueueGenerationJobInput) {
  await assertCanGenerateArtifact(input.school_id, input.artifact);
  if (hasSupabase && supabase) {
    const payload = {
      ...input,
      status: input.status || "queued",
      attempts: 0,
      error_message: null,
      started_at: null,
      finished_at: null,
    };
    const { data, error } = await supabase.from("generation_jobs").insert(payload).select("*").single();
    if (error) throw error;
    return data as GenerationJob;
  }

  const row: GenerationJob = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    school_id: input.school_id,
    exam_body_id: input.exam_body_id,
    class_id: input.class_id,
    subject_id: input.subject_id,
    chapter_id: input.chapter_id,
    topic_id: input.topic_id || null,
    artifact: input.artifact,
    request_json: toJsonObject(input.request_json),
    status: input.status || "queued",
    provider: input.provider || null,
    model: input.model || null,
    attempts: 0,
    error_message: null,
    created_by: input.created_by,
    started_at: null,
    finished_at: null,
  };
  writeLocal(DB.generationJobs, [row, ...readLocal<GenerationJob>(DB.generationJobs)]);
  return row;
}

export async function updateGenerationJob(jobId: string, patch: UpdateJobPatch) {
  if (hasSupabase && supabase) {
    const { data, error } = await supabase.from("generation_jobs").update(patch).eq("id", jobId).select("*").single();
    if (error) throw error;
    return data as GenerationJob;
  }
  const rows = readLocal<GenerationJob>(DB.generationJobs);
  const row = rows.find((item) => item.id === jobId);
  if (!row) throw new Error("Generation job not found");
  Object.assign(row, patch);
  writeLocal(DB.generationJobs, rows);
  return row;
}

export async function getGenerationCandidates(schoolId: string, filters?: CandidateFilters) {
  ensureSeed();
  if (hasSupabase && supabase) {
    let query = supabase
      .from("generation_candidates")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
    if (filters?.job_id) query = query.eq("job_id", filters.job_id);
    if (filters?.artifact) query = query.eq("artifact", filters.artifact);
    if (filters?.status) query = query.eq("status", filters.status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as GenerationCandidate[];
  }

  let rows = readLocal<GenerationCandidate>(DB.generationCandidates).filter((row) => row.school_id === schoolId);
  if (filters?.job_id) rows = rows.filter((row) => row.job_id === filters.job_id);
  if (filters?.artifact) rows = rows.filter((row) => row.artifact === filters.artifact);
  if (filters?.status) rows = rows.filter((row) => row.status === filters.status);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addGenerationCandidates(rows: CreateCandidateInput[]) {
  if (!rows.length) return [] as GenerationCandidate[];
  if (hasSupabase && supabase) {
    const payload = rows.map((row) => ({
      ...row,
      payload: toJsonObject(row.payload),
      validation_errors: row.validation_errors ?? null,
      status: row.status || "pending_review",
      approved_by: null,
      approved_at: null,
      published_table: null,
      published_id: null,
    }));
    const { data, error } = await supabase.from("generation_candidates").insert(payload).select("*");
    if (error) throw error;
    return (data ?? []) as GenerationCandidate[];
  }

  const now = new Date().toISOString();
  const mapped: GenerationCandidate[] = rows.map((row) => ({
    id: crypto.randomUUID(),
    created_at: now,
    job_id: row.job_id,
    school_id: row.school_id,
    artifact: row.artifact,
    payload: toJsonObject(row.payload),
    validation_errors: row.validation_errors ?? null,
    status: row.status || "pending_review",
    approved_by: null,
    approved_at: null,
    published_table: null,
    published_id: null,
  }));
  writeLocal(DB.generationCandidates, [...mapped, ...readLocal<GenerationCandidate>(DB.generationCandidates)]);
  return mapped;
}

export async function reviewGenerationCandidate(candidateId: string, action: ReviewAction, reviewerId: string) {
  const status: CandidateStatus = action === "approve" ? "approved" : "rejected";
  const approvedAt = action === "approve" ? new Date().toISOString() : null;
  const approvedBy = action === "approve" ? reviewerId : null;
  if (hasSupabase && supabase) {
    const { data, error } = await supabase
      .from("generation_candidates")
      .update({ status, approved_by: approvedBy, approved_at: approvedAt })
      .eq("id", candidateId)
      .select("*")
      .single();
    if (error) throw error;
    return data as GenerationCandidate;
  }
  const rows = readLocal<GenerationCandidate>(DB.generationCandidates);
  const row = rows.find((item) => item.id === candidateId);
  if (!row) throw new Error("Candidate not found");
  row.status = status;
  row.approved_by = approvedBy;
  row.approved_at = approvedAt;
  writeLocal(DB.generationCandidates, rows);
  return row;
}

async function getCandidateById(candidateId: string) {
  if (hasSupabase && supabase) {
    const { data, error } = await supabase.from("generation_candidates").select("*").eq("id", candidateId).single();
    if (error) throw error;
    return data as GenerationCandidate;
  }
  const row = readLocal<GenerationCandidate>(DB.generationCandidates).find((item) => item.id === candidateId);
  if (!row) throw new Error("Candidate not found");
  return row;
}

async function getJobById(jobId: string) {
  if (hasSupabase && supabase) {
    const { data, error } = await supabase.from("generation_jobs").select("*").eq("id", jobId).single();
    if (error) throw error;
    return data as GenerationJob;
  }
  const row = readLocal<GenerationJob>(DB.generationJobs).find((item) => item.id === jobId);
  if (!row) throw new Error("Generation job not found");
  return row;
}

async function markCandidatePublished(candidateId: string, tableName: string, publishedId: string) {
  if (hasSupabase && supabase) {
    const { data, error } = await supabase
      .from("generation_candidates")
      .update({
        status: "published",
        published_table: tableName,
        published_id: publishedId,
      })
      .eq("id", candidateId)
      .select("*")
      .single();
    if (error) throw error;
    return data as GenerationCandidate;
  }
  const rows = readLocal<GenerationCandidate>(DB.generationCandidates);
  const row = rows.find((item) => item.id === candidateId);
  if (!row) throw new Error("Candidate not found");
  row.status = "published";
  row.published_table = tableName;
  row.published_id = publishedId;
  writeLocal(DB.generationCandidates, rows);
  return row;
}

export async function publishGenerationCandidate(candidateId: string) {
  const candidate = await getCandidateById(candidateId);
  const job = await getJobById(candidate.job_id);
  const payload = candidate.payload || {};
  if (!isRecord(payload)) {
    throw new Error("Candidate payload is invalid");
  }

  if (candidate.artifact === "question") {
    const questionType = coerceQuestionType(payload.question_type || payload.questionType || job.request_json?.questionType);
    const options = parseStringArray(payload.options);
    const mappedOptions =
      options.length >= 4
        ? options
        : [payload.option_a, payload.option_b, payload.option_c, payload.option_d].map((x) => String(x || "").trim());
    const questionText = String(payload.question_text || payload.questionText || "").trim();
    if (!questionText) throw new Error("Question candidate has empty question_text");
    const marksRaw = Number(payload.marks);
    const marks = Number.isFinite(marksRaw) && marksRaw > 0 ? marksRaw : defaultMarksForType(questionType);
    const rows: Omit<Question, "id" | "created_at">[] = [
      {
        school_id: job.school_id,
        chapter_id: String(payload.chapter_id || payload.chapterId || job.chapter_id),
        topic_id: String(payload.topic_id || payload.topicId || job.topic_id || "") || null,
        question_type: questionType,
        question_text: questionText,
        option_a: mappedOptions[0] || null,
        option_b: mappedOptions[1] || null,
        option_c: mappedOptions[2] || null,
        option_d: mappedOptions[3] || null,
        correct_answer: String(payload.correct_answer || payload.correctAnswer || "").trim() || null,
        difficulty: coerceDifficulty(payload.difficulty || job.request_json?.difficulty),
        bloom_level: coerceBloom(payload.bloom_level || payload.bloomLevel || job.request_json?.bloom_level),
        question_level: coerceQuestionLevel(payload.question_level || payload.questionLevel || job.request_json?.question_level),
        marks,
        diagram_url: String(payload.diagram_url || payload.diagramUrl || "").trim() || null,
        explanation: String(payload.explanation || "").trim() || null,
      },
    ];
    const [saved] = await addQuestions(rows);
    await markCandidatePublished(candidateId, "questions", saved.id);
    return { artifact: "question" as ArtifactType, published_table: "questions", published_id: saved.id };
  }

  if (candidate.artifact === "worksheet") {
    const title = String(payload.title || "AI Worksheet").trim();
    const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
    const items = itemsRaw
      .filter((item) => isRecord(item))
      .map((item, index) => ({
        order_no: Number(item.order_no) > 0 ? Number(item.order_no) : index + 1,
        item_type: String(item.item_type || item.type || "short").trim(),
        prompt: String(item.prompt || item.question_text || "").trim(),
        options: Array.isArray(item.options) ? item.options : null,
        answer_key: String(item.answer_key || item.correct_answer || "").trim() || null,
        marks: Number(item.marks) > 0 ? Number(item.marks) : null,
        bloom_level: String(item.bloom_level || "").trim() || null,
        difficulty: String(item.difficulty || "").trim() || null,
      }))
      .filter((item) => item.prompt);
    const result = await addWorksheetWithItems(
      {
        school_id: job.school_id,
        exam_body_id: job.exam_body_id,
        class_id: job.class_id,
        subject_id: job.subject_id,
        chapter_id: job.chapter_id,
        topic_id: job.topic_id || null,
        title,
        settings_json: toJsonObject(payload.settings_json || payload.settings),
        created_by: job.created_by,
      },
      items
    );
    await markCandidatePublished(candidateId, "worksheets", result.worksheet.id);
    return { artifact: "worksheet" as ArtifactType, published_table: "worksheets", published_id: result.worksheet.id };
  }

  const title = String(payload.title || "AI Lesson Plan").trim();
  const blocksRaw = Array.isArray(payload.blocks) ? payload.blocks : [];
  const blocks = blocksRaw
    .filter((block) => isRecord(block))
    .map((block, index) => ({
      order_no: Number(block.order_no) > 0 ? Number(block.order_no) : index + 1,
      block_type: String(block.block_type || block.type || "instruction").trim(),
      duration_minutes: Number(block.duration_minutes) > 0 ? Number(block.duration_minutes) : null,
      content: String(block.content || block.prompt || "").trim(),
      resources: Array.isArray(block.resources) ? block.resources : [],
    }))
    .filter((block) => block.content);
  const result = await addLessonPlanWithBlocks(
    {
      school_id: job.school_id,
      exam_body_id: job.exam_body_id,
      class_id: job.class_id,
      subject_id: job.subject_id,
      chapter_id: job.chapter_id,
      topic_id: job.topic_id || null,
      title,
      duration_minutes: Number(payload.duration_minutes) > 0 ? Number(payload.duration_minutes) : null,
      objectives: Array.isArray(payload.objectives) ? payload.objectives : [],
      created_by: job.created_by,
    },
    blocks
  );
  await markCandidatePublished(candidateId, "lesson_plans", result.plan.id);
  return { artifact: "lesson_plan" as ArtifactType, published_table: "lesson_plans", published_id: result.plan.id };
}
