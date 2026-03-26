import { canUseSupabase, supabase } from "@/services/supabase";
import {
  addContentChunks,
  getContentSourceById,
  publishGenerationCandidate,
  searchContentChunks,
  updateContentSourceStatus,
  updateGenerationJob,
  addGenerationCandidates,
  assertCanGenerateArtifact,
} from "@/services/repositories";
import { generateArtifactCandidatesFromText } from "@/services/ai";
import { readCachedSourceText } from "@/services/sourceTextCache";
import { extractPdfText } from "./pdfText";
import type { ArtifactType, Difficulty, GenerationJob, QuestionType } from "@/types/domain";
import { DB, readLocal } from "@/services/baseService";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

type ChunkLike = {
  source_id: string;
  chunk_no: number;
  created_at: string;
  content: string;
};

function buildDistributedContext(chunks: ChunkLike[], maxChars = 28000, targetSlices = 18) {
  const ordered = chunks
    .slice()
    .sort((a, b) => {
      if (a.source_id === b.source_id) return a.chunk_no - b.chunk_no;
      return a.created_at.localeCompare(b.created_at);
    });
  const texts = ordered.map((row) => row.content.trim()).filter(Boolean);
  if (!texts.length) return "";

  if (texts.length <= targetSlices) {
    return texts.join("\n\n").slice(0, maxChars);
  }

  // Pick evenly distributed chunks so model sees beginning, middle, and end of chapter.
  const picked = new Set<number>();
  for (let i = 0; i < targetSlices; i += 1) {
    const idx = Math.round((i * (texts.length - 1)) / Math.max(1, targetSlices - 1));
    picked.add(idx);
  }

  const distributed = Array.from(picked)
    .sort((a, b) => a - b)
    .map((idx) => texts[idx]);

  let out = distributed.join("\n\n");
  if (out.length > maxChars) {
    return out.slice(0, maxChars);
  }

  // Fill remaining space with nearest unpicked chunks for better continuity.
  for (let idx = 0; idx < texts.length; idx += 1) {
    if (picked.has(idx)) continue;
    const next = `${out}\n\n${texts[idx]}`;
    if (next.length > maxChars) break;
    out = next;
  }
  return out.slice(0, maxChars);
}

function toLines(text: string, maxChunkChars = 1200) {
  const chunkify = (raw: string) => {
    const cleaned = raw
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!cleaned) return [] as string[];
    const blocks = cleaned.split(/\n\n+/);
    const out: string[] = [];
    let current = "";
    for (const block of blocks) {
      const next = current ? `${current}\n\n${block}` : block;
      if (next.length > maxChunkChars && current) {
        out.push(current);
        current = block.slice(0, maxChunkChars);
        continue;
      }
      current = next.slice(0, maxChunkChars);
    }
    if (current) out.push(current);
    return out;
  };

  const markerRegex = /\[\[PG_PAGE:(\d+)\]\]/g;
  const parts = text.split(markerRegex);
  const hasPageMarkers = parts.length > 2;
  if (!hasPageMarkers) {
    return chunkify(text).map((content) => ({ content, page_from: null as number | null, page_to: null as number | null }));
  }

  const rows: Array<{ content: string; page_from: number | null; page_to: number | null }> = [];
  for (let index = 1; index < parts.length; index += 2) {
    const pageNo = Number(parts[index] || 0);
    const section = String(parts[index + 1] || "");
    const chunks = chunkify(section);
    for (const content of chunks) {
      rows.push({
        content,
        page_from: Number.isFinite(pageNo) && pageNo > 0 ? pageNo : null,
        page_to: Number.isFinite(pageNo) && pageNo > 0 ? pageNo : null,
      });
    }
  }
  if (rows.length) return rows;
  return chunkify(text).map((content) => ({ content, page_from: null as number | null, page_to: null as number | null }));
}

export async function invokeIngestSource(sourceId: string): Promise<IngestSourceResponse> {
  const source = await getContentSourceById(sourceId);
  await updateContentSourceStatus(sourceId, "processing", { error_message: null });

  try {
    let cleanText = "";
    const filePath = String(source.file_path || "").trim();
    const isPdf = filePath.toLowerCase().endsWith(".pdf") || 
                  String(source.title || "").toLowerCase().endsWith(".pdf") ||
                  String(source.id).includes("pdf");

    // 1. Try Cache First
    const cachedText = readCachedSourceText(source.file_hash);
    if (cachedText && cachedText.trim().length > 80) {
      cleanText = cachedText.trim();
    } else {
      // 2. Perform Extraction
      if (filePath.startsWith("local/")) {
        // Local source, text must be in cache or it's lost (handled by onUploadSource)
        throw new Error("Local source text not found in cache. Please re-upload.");
      } else if (canUseSupabase() && supabase) {
        // Cloud source: download and parse client-side
        const slashIdx = filePath.indexOf("/");
        if (slashIdx > 0 && slashIdx < filePath.length - 1) {
          const bucket = filePath.slice(0, slashIdx);
          const objectPath = filePath.slice(slashIdx + 1);
          const { data: blob, error: downloadErr } = await supabase.storage.from(bucket).download(objectPath);
          if (downloadErr || !blob) throw new Error(downloadErr?.message || "Failed to download cloud source");
          
          if (isPdf) {
            // Robust PDF.js / OCR extraction
            const file = new File([blob], source.title || "source.pdf", { type: "application/pdf" });
            cleanText = await extractPdfText(file, 250000, {
              ocrPages: 8,
              ocrLang: "eng+urd",
              includePageMarkers: true,
            });
          } else {
            cleanText = await blob.text();
          }
        }
      }
    }

    if (!cleanText || cleanText.length < 80) {
      throw new Error("Could not extract enough text from this source. It might be too small or a scanned image without OCR.");
    }

    const parsedChunks = toLines(cleanText, 1200);
    const chunks = parsedChunks.map((row, index) => ({
      source_id: source.id,
      school_id: source.school_id,
      exam_body_id: source.exam_body_id,
      class_id: source.class_id,
      subject_id: source.subject_id,
      chapter_id: source.chapter_id,
      topic_id: source.topic_id || null,
      chunk_no: index + 1,
      page_from: row.page_from,
      page_to: row.page_to,
      content: row.content,
      content_hash: `pg_${source.file_hash}_${index + 1}_${row.content.length}`,
    }));

    if (!chunks.length) {
      throw new Error("No usable text segments were created from this source.");
    }

    await addContentChunks(chunks);
    const detectedPages = Math.max(
      0,
      ...chunks
        .map((row) => Number(row.page_to || row.page_from || 0))
        .filter((value) => Number.isFinite(value) && value > 0)
    );
    await updateContentSourceStatus(sourceId, "ready", {
      pages: detectedPages > 0 ? detectedPages : chunks.length,
      error_message: null,
    });
    return { success: true, source_id: sourceId, chunk_count: chunks.length, status: "ready" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed";
    await updateContentSourceStatus(sourceId, "failed", { error_message: message });
    throw new Error(message);
  }
}

export async function invokeRunGenerationJobs(input?: RunGenerationJobsInput): Promise<RunJobsResponse> {
  if (canUseSupabase() && supabase) {
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
      const requestedSourceId = String(request.source_id || request.sourceId || "").trim();
      const chunks = await searchContentChunks({
        school_id: job.school_id,
        exam_body_id: job.exam_body_id,
        class_id: job.class_id,
        subject_id: job.subject_id,
        chapter_id: job.chapter_id,
        topic_id: job.topic_id || undefined,
        source_id: requestedSourceId || undefined,
        limit: 150,
      });
      if (!chunks.length) {
        throw new Error(requestedSourceId
          ? "No ingested content available for the selected source."
          : "No ingested content available for this chapter/topic.");
      }

      const requestedPagesRaw = Number(request.context_pages ?? request.max_context_pages ?? 0);
      const requestedPages = Number.isFinite(requestedPagesRaw)
        ? Math.max(0, Math.min(5000, Math.floor(requestedPagesRaw)))
        : 0;
      const requestedStartRaw = Number(request.context_page_start ?? request.page_start ?? 0);
      const requestedEndRaw = Number(request.context_page_end ?? request.page_end ?? 0);
      const requestedStart = Number.isFinite(requestedStartRaw)
        ? Math.max(0, Math.min(5000, Math.floor(requestedStartRaw)))
        : 0;
      const requestedEnd = Number.isFinite(requestedEndRaw)
        ? Math.max(0, Math.min(5000, Math.floor(requestedEndRaw)))
        : 0;
      const pageRangeStart = requestedStart > 0 ? requestedStart : 0;
      const pageRangeEnd = requestedEnd > 0
        ? requestedEnd
        : (requestedPages > 0 ? pageRangeStart + requestedPages - 1 : 0);
      const hasPageRange = pageRangeStart > 0 && pageRangeEnd > 0;
      const normalizedStart = hasPageRange ? Math.min(pageRangeStart, pageRangeEnd) : 0;
      const normalizedEnd = hasPageRange ? Math.max(pageRangeStart, pageRangeEnd) : 0;
      const hasPageInfo = chunks.some((row) => Number(row.page_from || row.page_to || 0) > 0);
      const limitedChunks = hasPageRange
        ? hasPageInfo
          ? chunks.filter((row) => {
            const from = Number(row.page_from || 0);
            const to = Number(row.page_to || row.page_from || 0);
            const safeFrom = from > 0 ? from : to;
            const safeTo = to > 0 ? to : from;
            if (safeFrom <= 0 || safeTo <= 0) return false;
            return safeFrom <= normalizedEnd && safeTo >= normalizedStart;
          })
          : chunks
              .slice()
              .sort((a, b) => {
                if (a.source_id === b.source_id) return a.chunk_no - b.chunk_no;
                return a.created_at.localeCompare(b.created_at);
              })
              .slice(Math.max(0, (normalizedStart - 1) * 2), Math.max(0, normalizedEnd * 2))
        : requestedPages > 0
          ? hasPageInfo
            ? chunks.filter((row) => {
              const page = Number(row.page_from || row.page_to || 0);
              return page > 0 && page <= requestedPages;
            })
            : chunks
                .slice()
                .sort((a, b) => {
                  if (a.source_id === b.source_id) return a.chunk_no - b.chunk_no;
                  return a.created_at.localeCompare(b.created_at);
                })
                .slice(0, requestedPages * 2)
          : chunks;
      if (!limitedChunks.length) {
        if (hasPageRange) {
          throw new Error(`No ingested content found in pages ${normalizedStart}-${normalizedEnd}.`);
        }
        throw new Error(`No ingested content found within first ${requestedPages} pages.`);
      }

      const chunkText = buildDistributedContext(limitedChunks as ChunkLike[], 28000, 18);

      if (!chunkText) {
        throw new Error("Ingested chunks are empty. Re-ingest the source file.");
      }

      const generatedPayloads = await generateArtifactCandidatesFromText({
        artifact: job.artifact,
        contextText: chunkText,
        contextLabel: `${job.chapter_id}${job.topic_id ? ` / ${job.topic_id}` : ""}`,
        count: Math.max(1, Math.min(Number(request.count || 5), 50)),
        questionType: String(request.question_type || request.questionType || "mcq").toLowerCase() as QuestionType,
        difficulty: String(request.difficulty || "medium").toLowerCase() as Difficulty,
        bloomLevel: String(request.bloom_level || request.bloomLevel || "understand").toLowerCase() as any,
        instructions: String(request.instructions || "").trim(),
      });

      const rows = generatedPayloads.map((payload) => ({
        job_id: job.id,
        school_id: job.school_id,
        artifact: job.artifact as ArtifactType,
        payload,
      }));

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
    
    // Throttling: Wait a bit between jobs to stay within AI rate limits
    await sleep(1200); 
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

  if (canUseSupabase() && supabase) {
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

