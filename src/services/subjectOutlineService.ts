import { canUseSupabase, supabase } from "@/services/supabase";
import type { SubjectOutline, SubjectOutlineChapter } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal } from "./baseService";

type CreateSubjectOutlineInput = {
  school_id: string;
  exam_body_id: string;
  class_id: string;
  subject_id: string;
  source_name: string;
  source_path?: string | null;
  source_type?: string;
  outline: SubjectOutlineChapter[];
  created_by: string;
};

function isMissingTable(error: unknown) {
  const message = `${(error as any)?.message || ""}`.toLowerCase();
  return message.includes("does not exist") || message.includes("relation");
}

function mapRow(row: any): SubjectOutline {
  return {
    id: row.id,
    school_id: row.school_id,
    exam_body_id: row.exam_body_id,
    class_id: row.class_id,
    subject_id: row.subject_id,
    source_name: row.source_name,
    source_path: row.source_path ?? null,
    source_type: row.source_type || "pdf",
    outline: (row.outline_json || row.outline || []) as SubjectOutlineChapter[],
    status: row.status || "draft",
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

export async function getLatestSubjectOutline(subjectId: string) {
  ensureSeed();
  if (canUseSupabase() && supabase) {
    try {
      const { data, error } = await supabase
        .from("subject_outlines")
        .select("*")
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data) : null;
    } catch (error) {
      if (!isMissingTable(error)) {
        throw error;
      }
    }
  }
  const rows = readLocal<SubjectOutline>(DB.subjectOutlines).filter((row) => row.subject_id === subjectId);
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sorted[0];
}

export async function addSubjectOutline(input: CreateSubjectOutlineInput) {
  const payload: SubjectOutline = {
    id: crypto.randomUUID(),
    school_id: input.school_id,
    exam_body_id: input.exam_body_id,
    class_id: input.class_id,
    subject_id: input.subject_id,
    source_name: input.source_name.trim() || "Subject Source",
    source_path: input.source_path ?? null,
    source_type: input.source_type || "pdf",
    outline: input.outline,
    status: "draft",
    created_by: input.created_by,
    created_at: new Date().toISOString(),
  };

  if (canUseSupabase() && supabase) {
    try {
      const { data, error } = await supabase
        .from("subject_outlines")
        .insert({
          school_id: payload.school_id,
          exam_body_id: payload.exam_body_id,
          class_id: payload.class_id,
          subject_id: payload.subject_id,
          source_name: payload.source_name,
          source_path: payload.source_path,
          source_type: payload.source_type,
          outline_json: payload.outline,
          status: payload.status,
          created_by: payload.created_by,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapRow(data);
    } catch (error) {
      if (!isMissingTable(error)) {
        throw error;
      }
    }
  }

  const rows = readLocal<SubjectOutline>(DB.subjectOutlines);
  writeLocal(DB.subjectOutlines, [payload, ...rows]);
  return payload;
}

export async function updateSubjectOutlineStatus(outlineId: string, status: SubjectOutline["status"]) {
  if (canUseSupabase() && supabase) {
    try {
      const { data, error } = await supabase.from("subject_outlines").update({ status }).eq("id", outlineId).select("*").single();
      if (error) throw error;
      return mapRow(data);
    } catch (error) {
      if (!isMissingTable(error)) {
        throw error;
      }
    }
  }

  const rows = readLocal<SubjectOutline>(DB.subjectOutlines);
  const row = rows.find((item) => item.id === outlineId);
  if (!row) {
    throw new Error("Outline not found");
  }
  row.status = status;
  writeLocal(DB.subjectOutlines, rows);
  return row;
}
