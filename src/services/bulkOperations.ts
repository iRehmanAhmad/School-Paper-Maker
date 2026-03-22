import { canUseSupabase, supabase } from "./supabase";
import type { Question } from "@/types/domain";

export interface BulkUpdatePayload {
  difficulty?: string;
  bloom_level?: string;
  question_level?: string;
  chapter_id?: string;
  topic_id?: string;
}

/**
 * Bulk update multiple questions with the same values
 */
export async function bulkUpdateQuestions(
  questionIds: string[],
  updates: BulkUpdatePayload
): Promise<{ success: number; failed: number }> {
  if (!questionIds.length) {
    return { success: 0, failed: 0 };
  }

  if (canUseSupabase()) {
    try {
      const { error, count } = await supabase
        .from("questions")
        .update(updates)
        .in("id", questionIds);

      if (error) {
        console.error("Bulk update error:", error);
        return { success: 0, failed: questionIds.length };
      }

      return { success: count || questionIds.length, failed: 0 };
    } catch (error) {
      console.error("Bulk update exception:", error);
      return { success: 0, failed: questionIds.length };
    }
  }

  // LocalStorage fallback
  try {
    const stored = localStorage.getItem("questions");
    if (!stored) {
      return { success: 0, failed: questionIds.length };
    }

    const questions: Question[] = JSON.parse(stored);
    const idSet = new Set(questionIds);
    let updated = 0;

    const updatedQuestions = questions.map((q) => {
      if (idSet.has(q.id)) {
        updated++;
        return { ...q, ...updates };
      }
      return q;
    });

    localStorage.setItem("questions", JSON.stringify(updatedQuestions));
    return { success: updated, failed: questionIds.length - updated };
  } catch (error) {
    console.error("LocalStorage bulk update error:", error);
    return { success: 0, failed: questionIds.length };
  }
}

/**
 * Bulk delete multiple questions
 */
export async function bulkDeleteQuestions(
  questionIds: string[]
): Promise<{ success: number; failed: number }> {
  if (!questionIds.length) {
    return { success: 0, failed: 0 };
  }

  if (canUseSupabase()) {
    try {
      const { error, count } = await supabase
        .from("questions")
        .delete()
        .in("id", questionIds);

      if (error) {
        console.error("Bulk delete error:", error);
        return { success: 0, failed: questionIds.length };
      }

      return { success: count || questionIds.length, failed: 0 };
    } catch (error) {
      console.error("Bulk delete exception:", error);
      return { success: 0, failed: questionIds.length };
    }
  }

  // LocalStorage fallback
  try {
    const stored = localStorage.getItem("questions");
    if (!stored) {
      return { success: 0, failed: questionIds.length };
    }

    const questions: Question[] = JSON.parse(stored);
    const idSet = new Set(questionIds);
    const remaining = questions.filter((q) => !idSet.has(q.id));
    const deleted = questions.length - remaining.length;

    localStorage.setItem("questions", JSON.stringify(remaining));
    return { success: deleted, failed: questionIds.length - deleted };
  } catch (error) {
    console.error("LocalStorage bulk delete error:", error);
    return { success: 0, failed: questionIds.length };
  }
}

/**
 * Bulk duplicate questions
 */
export async function bulkDuplicateQuestions(
  questionIds: string[],
  questions: Question[]
): Promise<{ success: number; failed: number; newIds: string[] }> {
  if (!questionIds.length) {
    return { success: 0, failed: 0, newIds: [] };
  }

  const idSet = new Set(questionIds);
  const toDuplicate = questions.filter((q) => idSet.has(q.id));

  if (!toDuplicate.length) {
    return { success: 0, failed: questionIds.length, newIds: [] };
  }

  const newIds: string[] = [];
  const duplicates = toDuplicate.map((q) => {
    const newId = crypto.randomUUID();
    newIds.push(newId);
    return {
      ...q,
      id: newId,
      question_text: `${q.question_text} (Copy)`,
      created_at: new Date().toISOString(),
    };
  });

  if (canUseSupabase()) {
    try {
      const { error, data } = await supabase
        .from("questions")
        .insert(duplicates)
        .select("id");

      if (error) {
        console.error("Bulk duplicate error:", error);
        return { success: 0, failed: questionIds.length, newIds: [] };
      }

      return {
        success: data?.length || 0,
        failed: questionIds.length - (data?.length || 0),
        newIds: data?.map((d) => d.id) || [],
      };
    } catch (error) {
      console.error("Bulk duplicate exception:", error);
      return { success: 0, failed: questionIds.length, newIds: [] };
    }
  }

  // LocalStorage fallback
  try {
    const stored = localStorage.getItem("questions");
    const existing: Question[] = stored ? JSON.parse(stored) : [];
    const updated = [...existing, ...duplicates];
    localStorage.setItem("questions", JSON.stringify(updated));

    return { success: duplicates.length, failed: 0, newIds };
  } catch (error) {
    console.error("LocalStorage bulk duplicate error:", error);
    return { success: 0, failed: questionIds.length, newIds: [] };
  }
}

/**
 * Bulk export questions to CSV
 */
export function bulkExportQuestionsToCSV(questions: Question[]): string {
  if (!questions.length) {
    return "";
  }

  const headers = [
    "question_text",
    "question_type",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_answer",
    "difficulty",
    "bloom_level",
    "question_level",
    "explanation",
    "diagram_url",
  ];

  const rows = questions.map((q) => [
    `"${(q.question_text || "").replace(/"/g, '""')}"`,
    q.question_type,
    `"${(q.option_a || "").replace(/"/g, '""')}"`,
    `"${(q.option_b || "").replace(/"/g, '""')}"`,
    `"${(q.option_c || "").replace(/"/g, '""')}"`,
    `"${(q.option_d || "").replace(/"/g, '""')}"`,
    `"${(q.correct_answer || "").replace(/"/g, '""')}"`,
    q.difficulty,
    q.bloom_level || "",
    q.question_level || "exercise",
    `"${(q.explanation || "").replace(/"/g, '""')}"`,
    q.diagram_url || "",
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

