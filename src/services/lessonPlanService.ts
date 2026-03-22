import { canUseSupabase, supabase } from "@/services/supabase";
import type { LessonPlan, LessonPlanBlock } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal } from "./baseService";

type LessonPlanFilters = {
  exam_body_id?: string;
  class_id?: string;
  subject_id?: string;
  chapter_id?: string;
  topic_id?: string;
};

type CreateLessonPlanInput = Omit<LessonPlan, "id" | "created_at">;
type CreateLessonPlanBlockInput = Omit<LessonPlanBlock, "id">;
type LessonPlanBundleBlockInput = Omit<LessonPlanBlock, "id" | "lesson_plan_id"> & { lesson_plan_id?: string };

export async function getLessonPlans(schoolId: string, filters?: LessonPlanFilters) {
  ensureSeed();
  if (canUseSupabase()) {
    let query = supabase
      .from("lesson_plans")
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
    return (data ?? []) as LessonPlan[];
  }

  let rows = readLocal<LessonPlan>(DB.lessonPlans).filter((row) => row.school_id === schoolId);
  if (filters?.exam_body_id) rows = rows.filter((row) => row.exam_body_id === filters.exam_body_id);
  if (filters?.class_id) rows = rows.filter((row) => row.class_id === filters.class_id);
  if (filters?.subject_id) rows = rows.filter((row) => row.subject_id === filters.subject_id);
  if (filters?.chapter_id) rows = rows.filter((row) => row.chapter_id === filters.chapter_id);
  if (filters?.topic_id) rows = rows.filter((row) => (row.topic_id || "") === filters.topic_id);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addLessonPlan(input: CreateLessonPlanInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Lesson plan title is required");

  if (canUseSupabase()) {
    const payload = {
      ...input,
      title,
      topic_id: input.topic_id || null,
      objectives: input.objectives || [],
    };
    const { data, error } = await supabase.from("lesson_plans").insert(payload).select("*").single();
    if (error) throw error;
    return data as LessonPlan;
  }

  const row: LessonPlan = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    school_id: input.school_id,
    exam_body_id: input.exam_body_id,
    class_id: input.class_id,
    subject_id: input.subject_id,
    chapter_id: input.chapter_id,
    topic_id: input.topic_id || null,
    title,
    duration_minutes: input.duration_minutes ?? null,
    objectives: input.objectives || [],
    created_by: input.created_by,
  };
  writeLocal(DB.lessonPlans, [row, ...readLocal<LessonPlan>(DB.lessonPlans)]);
  return row;
}

export async function getLessonPlanBlocks(lessonPlanId: string) {
  ensureSeed();
  if (canUseSupabase()) {
    const { data, error } = await supabase
      .from("lesson_plan_blocks")
      .select("*")
      .eq("lesson_plan_id", lessonPlanId)
      .order("order_no", { ascending: true });
    if (error) throw error;
    return (data ?? []) as LessonPlanBlock[];
  }
  return readLocal<LessonPlanBlock>(DB.lessonPlanBlocks)
    .filter((row) => row.lesson_plan_id === lessonPlanId)
    .sort((a, b) => a.order_no - b.order_no);
}

export async function addLessonPlanBlocks(rows: CreateLessonPlanBlockInput[]) {
  if (!rows.length) return [] as LessonPlanBlock[];
  if (canUseSupabase()) {
    const { data, error } = await supabase.from("lesson_plan_blocks").insert(rows).select("*");
    if (error) throw error;
    return (data ?? []) as LessonPlanBlock[];
  }
  const existing = readLocal<LessonPlanBlock>(DB.lessonPlanBlocks);
  const mapped = rows.map((row) => ({ id: crypto.randomUUID(), ...row }));
  writeLocal(DB.lessonPlanBlocks, [...mapped, ...existing]);
  return mapped;
}

export async function addLessonPlanWithBlocks(input: CreateLessonPlanInput, blocks: LessonPlanBundleBlockInput[]) {
  const plan = await addLessonPlan(input);
  const nextBlocks = blocks.map((block, index) => ({
    ...block,
    lesson_plan_id: plan.id,
    order_no: block.order_no || index + 1,
  }));
  const savedBlocks = await addLessonPlanBlocks(nextBlocks);
  return { plan, blocks: savedBlocks };
}

export async function deleteLessonPlan(lessonPlanId: string) {
  if (canUseSupabase()) {
    const { error } = await supabase.from("lesson_plans").delete().eq("id", lessonPlanId);
    if (error) throw error;
    return;
  }
  writeLocal(DB.lessonPlans, readLocal<LessonPlan>(DB.lessonPlans).filter((row) => row.id !== lessonPlanId));
  writeLocal(
    DB.lessonPlanBlocks,
    readLocal<LessonPlanBlock>(DB.lessonPlanBlocks).filter((row) => row.lesson_plan_id !== lessonPlanId)
  );
}

