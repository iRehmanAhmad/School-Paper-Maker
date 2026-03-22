import { canUseSupabase, supabase } from "@/services/supabase";
import type { ContentChunk, ContentSource, IngestStatus } from "@/types/domain";
import { DB, ensureSeed, normalizeText, readLocal, writeLocal } from "./baseService";

type ContentSourceScopeFilters = {
  exam_body_id?: string;
  class_id?: string;
  subject_id?: string;
  chapter_id?: string;
  topic_id?: string;
  status?: IngestStatus;
};

type CreateContentSourceInput = {
  school_id: string;
  exam_body_id: string;
  class_id: string;
  subject_id: string;
  chapter_id: string;
  topic_id?: string | null;
  title: string;
  file_path: string;
  file_hash: string;
  created_by: string;
  pages?: number | null;
};

type CreateContentChunkInput = Omit<ContentChunk, "id" | "created_at">;

type ChunkSearchParams = {
  school_id: string;
  exam_body_id?: string;
  class_id?: string;
  subject_id?: string;
  chapter_id?: string;
  topic_id?: string;
  query?: string;
  limit?: number;
};

function applySourceFilters(rows: ContentSource[], filters?: ContentSourceScopeFilters) {
  if (!filters) return rows;
  return rows.filter((row) => {
    if (filters.exam_body_id && row.exam_body_id !== filters.exam_body_id) return false;
    if (filters.class_id && row.class_id !== filters.class_id) return false;
    if (filters.subject_id && row.subject_id !== filters.subject_id) return false;
    if (filters.chapter_id && row.chapter_id !== filters.chapter_id) return false;
    if (filters.topic_id && (row.topic_id || "") !== filters.topic_id) return false;
    if (filters.status && row.status !== filters.status) return false;
    return true;
  });
}

export async function getContentSources(schoolId: string, filters?: ContentSourceScopeFilters) {
  ensureSeed();
  if (canUseSupabase()) {
    let query = supabase
      .from("content_sources")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
    if (filters?.exam_body_id) query = query.eq("exam_body_id", filters.exam_body_id);
    if (filters?.class_id) query = query.eq("class_id", filters.class_id);
    if (filters?.subject_id) query = query.eq("subject_id", filters.subject_id);
    if (filters?.chapter_id) query = query.eq("chapter_id", filters.chapter_id);
    if (filters?.topic_id) query = query.eq("topic_id", filters.topic_id);
    if (filters?.status) query = query.eq("status", filters.status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ContentSource[];
  }
  const rows = readLocal<ContentSource>(DB.contentSources).filter((row) => row.school_id === schoolId);
  return applySourceFilters(rows, filters).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getContentSourceById(sourceId: string) {
  ensureSeed();
  if (canUseSupabase()) {
    const { data, error } = await supabase.from("content_sources").select("*").eq("id", sourceId).single();
    if (error) throw error;
    return data as ContentSource;
  }
  const row = readLocal<ContentSource>(DB.contentSources).find((item) => item.id === sourceId);
  if (!row) throw new Error("Content source not found");
  return row;
}

export async function addContentSource(input: CreateContentSourceInput) {
  const title = input.title.trim();
  const filePath = input.file_path.trim();
  const fileHash = input.file_hash.trim();
  if (!title) throw new Error("Source title is required");
  if (!filePath) throw new Error("File path is required");
  if (!fileHash) throw new Error("File hash is required");

  if (canUseSupabase()) {
    const scopeRows = await getContentSources(input.school_id, {
      exam_body_id: input.exam_body_id,
      class_id: input.class_id,
      subject_id: input.subject_id,
      chapter_id: input.chapter_id,
      topic_id: input.topic_id || undefined,
    });
    const duplicateHash = scopeRows.some((row) => row.file_hash === fileHash);
    if (duplicateHash) {
      throw new Error("This file is already uploaded in selected scope");
    }
    const nextVersion =
      Math.max(
        0,
        ...scopeRows
          .filter((row) => normalizeText(row.title) === normalizeText(title))
          .map((row) => row.version_no)
      ) + 1;

    const payload = {
      school_id: input.school_id,
      exam_body_id: input.exam_body_id,
      class_id: input.class_id,
      subject_id: input.subject_id,
      chapter_id: input.chapter_id,
      topic_id: input.topic_id || null,
      title,
      file_path: filePath,
      file_hash: fileHash,
      version_no: nextVersion,
      status: "uploaded" as IngestStatus,
      pages: input.pages ?? null,
      error_message: null,
      created_by: input.created_by,
    };
    const { data, error } = await supabase.from("content_sources").insert(payload).select("*").single();
    if (error) throw error;
    return data as ContentSource;
  }

  const existing = readLocal<ContentSource>(DB.contentSources);
  const scoped = existing.filter(
    (row) =>
      row.school_id === input.school_id &&
      row.exam_body_id === input.exam_body_id &&
      row.class_id === input.class_id &&
      row.subject_id === input.subject_id &&
      row.chapter_id === input.chapter_id &&
      (row.topic_id || "") === (input.topic_id || "")
  );
  if (scoped.some((row) => row.file_hash === fileHash)) {
    throw new Error("This file is already uploaded in selected scope");
  }
  const nextVersion =
    Math.max(
      0,
      ...scoped.filter((row) => normalizeText(row.title) === normalizeText(title)).map((row) => row.version_no)
    ) + 1;

  const row: ContentSource = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    school_id: input.school_id,
    exam_body_id: input.exam_body_id,
    class_id: input.class_id,
    subject_id: input.subject_id,
    chapter_id: input.chapter_id,
    topic_id: input.topic_id || null,
    title,
    file_path: filePath,
    file_hash: fileHash,
    version_no: nextVersion,
    status: "uploaded",
    pages: input.pages ?? null,
    error_message: null,
    created_by: input.created_by,
  };
  writeLocal(DB.contentSources, [row, ...existing]);
  return row;
}

export async function updateContentSourceStatus(
  sourceId: string,
  status: IngestStatus,
  patch?: { pages?: number | null; error_message?: string | null }
) {
  if (canUseSupabase()) {
    const { data, error } = await supabase
      .from("content_sources")
      .update({ status, pages: patch?.pages ?? null, error_message: patch?.error_message ?? null })
      .eq("id", sourceId)
      .select("*")
      .single();
    if (error) throw error;
    return data as ContentSource;
  }
  const rows = readLocal<ContentSource>(DB.contentSources);
  const row = rows.find((item) => item.id === sourceId);
  if (!row) throw new Error("Content source not found");
  row.status = status;
  if (patch && Object.prototype.hasOwnProperty.call(patch, "pages")) {
    row.pages = patch.pages ?? null;
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, "error_message")) {
    row.error_message = patch.error_message ?? null;
  }
  writeLocal(DB.contentSources, rows);
  return row;
}

export async function deleteContentSource(sourceId: string) {
  if (canUseSupabase()) {
    const { error } = await supabase.from("content_sources").delete().eq("id", sourceId);
    if (error) throw error;
    return;
  }
  writeLocal(DB.contentSources, readLocal<ContentSource>(DB.contentSources).filter((row) => row.id !== sourceId));
  writeLocal(DB.contentChunks, readLocal<ContentChunk>(DB.contentChunks).filter((row) => row.source_id !== sourceId));
}

export async function getContentChunksBySource(sourceId: string) {
  ensureSeed();
  if (canUseSupabase()) {
    const { data, error } = await supabase
      .from("content_chunks")
      .select("*")
      .eq("source_id", sourceId)
      .order("chunk_no", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ContentChunk[];
  }
  return readLocal<ContentChunk>(DB.contentChunks)
    .filter((row) => row.source_id === sourceId)
    .sort((a, b) => a.chunk_no - b.chunk_no);
}

export async function addContentChunks(rows: CreateContentChunkInput[]) {
  if (!rows.length) return [] as ContentChunk[];
  if (canUseSupabase()) {
    const { data, error } = await supabase.from("content_chunks").insert(rows).select("*");
    if (error) throw error;
    return (data ?? []) as ContentChunk[];
  }
  const existing = readLocal<ContentChunk>(DB.contentChunks);
  const now = new Date().toISOString();
  const deduped = rows.filter(
    (row) =>
      !existing.some(
        (item) => item.source_id === row.source_id && (item.content_hash === row.content_hash || item.chunk_no === row.chunk_no)
      )
  );
  const mapped = deduped.map((row) => ({
    id: crypto.randomUUID(),
    created_at: now,
    ...row,
  }));
  writeLocal(DB.contentChunks, [...mapped, ...existing]);
  return mapped;
}

export async function searchContentChunks(params: ChunkSearchParams) {
  const queryText = params.query?.trim().toLowerCase() || "";
  const limit = Math.max(1, Math.min(200, params.limit ?? 50));
  ensureSeed();

  if (canUseSupabase()) {
    let query = supabase
      .from("content_chunks")
      .select("*")
      .eq("school_id", params.school_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (params.exam_body_id) query = query.eq("exam_body_id", params.exam_body_id);
    if (params.class_id) query = query.eq("class_id", params.class_id);
    if (params.subject_id) query = query.eq("subject_id", params.subject_id);
    if (params.chapter_id) query = query.eq("chapter_id", params.chapter_id);
    if (params.topic_id) query = query.eq("topic_id", params.topic_id);
    if (queryText) query = query.ilike("content", `%${queryText}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ContentChunk[];
  }

  let rows = readLocal<ContentChunk>(DB.contentChunks).filter((row) => row.school_id === params.school_id);
  if (params.exam_body_id) rows = rows.filter((row) => row.exam_body_id === params.exam_body_id);
  if (params.class_id) rows = rows.filter((row) => row.class_id === params.class_id);
  if (params.subject_id) rows = rows.filter((row) => row.subject_id === params.subject_id);
  if (params.chapter_id) rows = rows.filter((row) => row.chapter_id === params.chapter_id);
  if (params.topic_id) rows = rows.filter((row) => (row.topic_id || "") === params.topic_id);
  if (queryText) rows = rows.filter((row) => row.content.toLowerCase().includes(queryText));
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

