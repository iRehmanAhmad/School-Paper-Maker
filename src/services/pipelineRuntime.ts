import { canUseSupabase, supabase } from "@/services/supabase";
import {
  addContentChunks,
  getContentSourceById,
  publishGenerationCandidate,
  updateContentSourceStatus,
  updateGenerationJob,
  addGenerationCandidates,
  assertCanGenerateArtifact,
} from "@/services/repositories";
import type { ArtifactType, Difficulty, GenerationJob, QuestionType } from "@/types/domain";
import { DB, readLocal } from "@/services/baseService";

type IngestSourceResponse = {
  success: boolean;
  source_id: string;
  chunk_count: number;
  status: "ready" | "failed";
  error?: string;
};

type RunJobsResponse = {
  success: boolean;
  processed: number;
  completed: number;
  failed: number;
  candidates_created: number;
  details: Array<{ job_id: string; status: "completed" | "failed"; candidate_count?: number; error?: string }>;
};

type PublishCandidatesResponse = {
  success: boolean;
  total: number;
  published: number;
  skipped: number;
  failed: number;
  details: Array<{
    candidate_id: string;
    status: "published" | "skipped" | "failed";
    published_table?: string;
    published_id?: string;
    reason?: string;
  }>;
};

type RunGenerationJobsInput = {
  job_id?: string;
  limit?: number;
  chapter_id?: string;
  topic_id?: string;
};

function toLines(text: string, maxChunkChars = 1200) {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return [] as string[];
  const blocks = cleaned.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > maxChunkChars && current) {
      chunks.push(current);
      current = block.slice(0, maxChunkChars);
      continue;
    }
    current = next.slice(0, maxChunkChars);
  }
  if (current) chunks.push(current);
  return chunks;
}

function randomFrom<T>(rows: T[]) {
  return rows[Math.floor(Math.random() * rows.length)];
}

function mockQuestionPayload(job: GenerationJob, index: number) {
  const request = (job.request_json || {}) as Record<string, unknown>;
  const type = String(request.question_type || request.questionType || "mcq").toLowerCase() as QuestionType;
  const difficulty = String(request.difficulty || "medium").toLowerCase() as Difficulty;
  const bloom = String(request.bloom_level || request.bloomLevel || "remember").toLowerCase();
  if (type === "mcq") {
    return {
      question_type: "mcq",
      question_text: `AI mock MCQ ${index + 1} for chapter`,
      options: ["Option A", "Option B", "Option C", "Option D"],
      correct_answer: randomFrom(["A", "B", "C", "D"]),
      difficulty,
      bloom_level: bloom,
      marks: 1,
      explanation: "Auto-generated mock candidate.",
    };
  }
  if (type === "true_false") {
    return {
      question_type: "true_false",
      question_text: `AI mock True/False ${index + 1} for chapter`,
      correct_answer: index % 2 === 0 ? "True" : "False",
      difficulty,
      bloom_level: bloom,
      marks: 1,
      explanation: "Auto-generated mock candidate.",
    };
  }
  return {
    question_type: type,
    question_text: `AI mock ${type} ${index + 1} for chapter`,
    correct_answer: type === "short" || type === "long" ? "" : "Sample answer",
    difficulty,
    bloom_level: bloom,
    marks: type === "long" ? 5 : type === "short" ? 2 : 1,
    explanation: "Auto-generated mock candidate.",
  };
}

export async function invokeIngestSource(sourceId: string): Promise<IngestSourceResponse> {
  if (canUseSupabase()) {
    const { data, error } = await supabase.functions.invoke("ingest-source", {
      body: { source_id: sourceId },
    });
    if (error) {
      throw new Error(error.message || "Ingestion failed");
    }
    return data as IngestSourceResponse;
  }

  const source = await getContentSourceById(sourceId);
  await updateContentSourceStatus(sourceId, "processing");
  const fallbackText = `${source.title}\n${source.file_path}\nVersion ${source.version_no}`;
  const chunks = toLines(fallbackText, 800).map((content, index) => ({
    source_id: source.id,
    school_id: source.school_id,
    exam_body_id: source.exam_body_id,
    class_id: source.class_id,
    subject_id: source.subject_id,
    chapter_id: source.chapter_id,
    topic_id: source.topic_id || null,
    chunk_no: index + 1,
    page_from: null,
    page_to: null,
    content,
    content_hash: `local_${source.id}_${index + 1}`,
  }));
  await addContentChunks(chunks);
  await updateContentSourceStatus(sourceId, "ready", { pages: chunks.length, error_message: null });
  return { success: true, source_id: sourceId, chunk_count: chunks.length, status: "ready" };
}

export async function invokeRunGenerationJobs(input?: RunGenerationJobsInput): Promise<RunJobsResponse> {
  if (canUseSupabase()) {
    const { data, error } = await supabase.functions.invoke("run-generation-jobs", {
      body: input || {},
    });
    if (error) {
      throw new Error(error.message || "Generation runner failed");
    }
    return data as RunJobsResponse;
  }

  const allJobs = readLocal<GenerationJob>(DB.generationJobs);
  const queued = allJobs
    .filter((job) => job.status === "queued")
    .filter((job) => (input?.job_id ? job.id === input.job_id : true))
    .filter((job) => (input?.chapter_id ? job.chapter_id === input.chapter_id : true))
    .filter((job) => (input?.topic_id ? (job.topic_id || "") === input.topic_id : true))
    .slice(0, Math.max(1, Math.min(input?.limit || 10, 100)));

  let completed = 0;
  let failed = 0;
  let candidatesCreated = 0;
  const details: RunJobsResponse["details"] = [];

  for (const job of queued) {
    try {
      await assertCanGenerateArtifact(job.school_id, job.artifact);
      await updateGenerationJob(job.id, {
        status: "running",
        started_at: new Date().toISOString(),
        attempts: (job.attempts || 0) + 1,
        error_message: null,
      });
      const request = (job.request_json || {}) as Record<string, unknown>;
      const count = Math.max(1, Math.min(Number(request.count || 5), 50));
      const rows =
        job.artifact === "question"
          ? Array.from({ length: count }).map((_, i) => ({
            job_id: job.id,
            school_id: job.school_id,
            artifact: "question" as ArtifactType,
            payload: mockQuestionPayload(job, i),
          }))
          : job.artifact === "worksheet"
            ? [{
              job_id: job.id,
              school_id: job.school_id,
              artifact: "worksheet" as ArtifactType,
              payload: {
                title: String(request.title || "AI Worksheet"),
                items: Array.from({ length: count }).map((_, i) => ({
                  order_no: i + 1,
                  item_type: "short",
                  prompt: `Worksheet prompt ${i + 1}`,
                  answer_key: "Sample answer",
                  marks: 2,
                })),
              },
            }]
            : [{
              job_id: job.id,
              school_id: job.school_id,
              artifact: "lesson_plan" as ArtifactType,
              payload: {
                title: String(request.title || "AI Lesson Plan"),
                duration_minutes: Number(request.duration_minutes || 40),
                objectives: ["Concept understanding", "Class participation"],
                blocks: [
                  { order_no: 1, block_type: "warmup", duration_minutes: 5, content: "Quick recap", resources: [] },
                  { order_no: 2, block_type: "instruction", duration_minutes: 15, content: "Main concept teaching", resources: [] },
                  { order_no: 3, block_type: "practice", duration_minutes: 15, content: "Guided practice", resources: [] },
                  { order_no: 4, block_type: "assessment", duration_minutes: 5, content: "Exit ticket", resources: [] },
                ],
              },
            }];
      const created = await addGenerationCandidates(rows);
      candidatesCreated += created.length;
      await updateGenerationJob(job.id, {
        status: "completed",
        finished_at: new Date().toISOString(),
      });
      completed += 1;
      details.push({ job_id: job.id, status: "completed", candidate_count: created.length });
    } catch (error) {
      failed += 1;
      await updateGenerationJob(job.id, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Failed",
      });
      details.push({ job_id: job.id, status: "failed", error: error instanceof Error ? error.message : "Failed" });
    }
  }

  return {
    success: true,
    processed: queued.length,
    completed,
    failed,
    candidates_created: candidatesCreated,
    details,
  };
}

export async function invokePublishCandidates(candidateIds: string[]): Promise<PublishCandidatesResponse> {
  const ids = Array.from(new Set(candidateIds.filter(Boolean)));
  if (!ids.length) {
    return { success: true, total: 0, published: 0, skipped: 0, failed: 0, details: [] };
  }

  if (canUseSupabase()) {
    const { data, error } = await supabase.functions.invoke("publish-candidates", {
      body: { candidate_ids: ids },
    });
    if (!error && data) {
      return data as PublishCandidatesResponse;
    }
  }

  let published = 0;
  let failed = 0;
  const details: PublishCandidatesResponse["details"] = [];
  for (const id of ids) {
    try {
      const out = await publishGenerationCandidate(id);
      published += 1;
      details.push({
        candidate_id: id,
        status: "published",
        published_table: out.published_table,
        published_id: out.published_id,
      });
    } catch (error) {
      failed += 1;
      details.push({
        candidate_id: id,
        status: "failed",
        reason: error instanceof Error ? error.message : "Failed to publish",
      });
    }
  }
  return {
    success: failed === 0,
    total: ids.length,
    published,
    skipped: 0,
    failed,
    details,
  };
}

