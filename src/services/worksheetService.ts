import { hasSupabase, supabase } from "@/services/supabase";
import type { Worksheet, WorksheetItem } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal } from "./baseService";

type WorksheetFilters = {
  exam_body_id?: string;
  class_id?: string;
  subject_id?: string;
  chapter_id?: string;
  topic_id?: string;
};

type CreateWorksheetInput = Omit<Worksheet, "id" | "created_at" | "settings_json"> & {
  settings_json?: Record<string, unknown>;
};

type CreateWorksheetItemInput = Omit<WorksheetItem, "id">;
type WorksheetBundleItemInput = Omit<WorksheetItem, "id" | "worksheet_id"> & { worksheet_id?: string };

export async function getWorksheets(schoolId: string, filters?: WorksheetFilters) {
  ensureSeed();
  if (hasSupabase && supabase) {
    let query = supabase
      .from("worksheets")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
    if (filters?.exam_body_id) query = query.eq("exam_body_id", filters.exam_body_id);
    if (filters?.class_id) query = query.eq("class_id", filters.class_id);
    if (filters?.subject_id) query = query.eq("subject_id", filters.subject_id);
    if (filters?.chapter_id) query = query.eq("chapter_id", filters.chapter_id);
    if (filters?.topic_id) query = query.eq("topic_id", filters.topic_id);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Worksheet[];
  }

  let rows = readLocal<Worksheet>(DB.worksheets).filter((row) => row.school_id === schoolId);
  if (filters?.exam_body_id) rows = rows.filter((row) => row.exam_body_id === filters.exam_body_id);
  if (filters?.class_id) rows = rows.filter((row) => row.class_id === filters.class_id);
  if (filters?.subject_id) rows = rows.filter((row) => row.subject_id === filters.subject_id);
  if (filters?.chapter_id) rows = rows.filter((row) => row.chapter_id === filters.chapter_id);
  if (filters?.topic_id) rows = rows.filter((row) => (row.topic_id || "") === filters.topic_id);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addWorksheet(input: CreateWorksheetInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Worksheet title is required");

  if (hasSupabase && supabase) {
    const payload = {
      ...input,
      title,
      topic_id: input.topic_id || null,
      settings_json: input.settings_json || {},
    };
    const { data, error } = await supabase.from("worksheets").insert(payload).select("*").single();
    if (error) throw error;
    return data as Worksheet;
  }

  const row: Worksheet = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    school_id: input.school_id,
    exam_body_id: input.exam_body_id,
    class_id: input.class_id,
    subject_id: input.subject_id,
    chapter_id: input.chapter_id,
    topic_id: input.topic_id || null,
    title,
    settings_json: input.settings_json || {},
    created_by: input.created_by,
  };
  writeLocal(DB.worksheets, [row, ...readLocal<Worksheet>(DB.worksheets)]);
  return row;
}

export async function getWorksheetItems(worksheetId: string) {
  ensureSeed();
  if (hasSupabase && supabase) {
    const { data, error } = await supabase
      .from("worksheet_items")
      .select("*")
      .eq("worksheet_id", worksheetId)
      .order("order_no", { ascending: true });
    if (error) throw error;
    return (data ?? []) as WorksheetItem[];
  }
  return readLocal<WorksheetItem>(DB.worksheetItems)
    .filter((row) => row.worksheet_id === worksheetId)
    .sort((a, b) => a.order_no - b.order_no);
}

export async function addWorksheetItems(rows: CreateWorksheetItemInput[]) {
  if (!rows.length) return [] as WorksheetItem[];
  if (hasSupabase && supabase) {
    const { data, error } = await supabase.from("worksheet_items").insert(rows).select("*");
    if (error) throw error;
    return (data ?? []) as WorksheetItem[];
  }
  const existing = readLocal<WorksheetItem>(DB.worksheetItems);
  const mapped = rows.map((row) => ({ id: crypto.randomUUID(), ...row }));
  writeLocal(DB.worksheetItems, [...mapped, ...existing]);
  return mapped;
}

export async function addWorksheetWithItems(input: CreateWorksheetInput, items: WorksheetBundleItemInput[]) {
  const worksheet = await addWorksheet(input);
  const nextItems = items.map((item, index) => ({
    ...item,
    worksheet_id: worksheet.id,
    order_no: item.order_no || index + 1,
  }));
  const savedItems = await addWorksheetItems(nextItems);
  return { worksheet, items: savedItems };
}

export async function deleteWorksheet(worksheetId: string) {
  if (hasSupabase && supabase) {
    const { error } = await supabase.from("worksheets").delete().eq("id", worksheetId);
    if (error) throw error;
    return;
  }
  writeLocal(DB.worksheets, readLocal<Worksheet>(DB.worksheets).filter((row) => row.id !== worksheetId));
  writeLocal(DB.worksheetItems, readLocal<WorksheetItem>(DB.worksheetItems).filter((row) => row.worksheet_id !== worksheetId));
}
