import { hasSupabase, supabase } from "@/services/supabase";
import type { Question, PaperQuestion, QuestionUsage } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal } from "./baseService";

export async function getQuestions(schoolId: string, chapterIds?: string[]) {
    ensureSeed();
    if (hasSupabase && supabase) {
        let query = supabase.from("questions").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(5000);
        if (chapterIds?.length) {
            query = query.in("chapter_id", chapterIds);
        }
        const { data, error } = await query;
        if (error) {
            throw error;
        }
        return (data ?? []) as Question[];
    }
    const pool = readLocal<Question>(DB.questions).filter((q) => q.school_id === schoolId);
    return chapterIds?.length ? pool.filter((q) => chapterIds.includes(q.chapter_id)) : pool;
}

export async function addQuestions(rows: Omit<Question, "id" | "created_at">[]) {
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("questions").insert(rows).select("*");
        if (error) {
            throw error;
        }
        return (data ?? []) as Question[];
    }
    const now = new Date().toISOString();
    const existing = readLocal<Question>(DB.questions);
    const mapped = rows.map((r) => ({ id: crypto.randomUUID(), created_at: now, ...r }));
    writeLocal(DB.questions, [...mapped, ...existing]);
    return mapped;
}

export async function getQuestionCountsByChapter(schoolId: string, chapterIds: string[]) {
    ensureSeed();
    if (!chapterIds.length) {
        return {} as Record<string, number>;
    }

    if (hasSupabase && supabase) {
        const counts: Record<string, number> = {};
        const pageSize = 1000;
        let from = 0;

        while (true) {
            const { data, error } = await supabase
                .from("questions")
                .select("chapter_id")
                .eq("school_id", schoolId)
                .in("chapter_id", chapterIds)
                .range(from, from + pageSize - 1);
            if (error) {
                throw error;
            }
            const rows = (data ?? []) as Array<Pick<Question, "chapter_id">>;
            for (const row of rows) {
                counts[row.chapter_id] = (counts[row.chapter_id] ?? 0) + 1;
            }
            if (rows.length < pageSize) {
                break;
            }
            from += pageSize;
        }
        return counts;
    }

    const counts: Record<string, number> = {};
    for (const row of readLocal<Question>(DB.questions)) {
        if (row.school_id !== schoolId || !chapterIds.includes(row.chapter_id)) {
            continue;
        }
        counts[row.chapter_id] = (counts[row.chapter_id] ?? 0) + 1;
    }
    return counts;
}

export async function getQuestionCountsByTopic(schoolId: string, topicIds: string[]) {
    ensureSeed();
    if (!topicIds.length) {
        return {} as Record<string, number>;
    }

    if (hasSupabase && supabase) {
        const counts: Record<string, number> = {};
        const pageSize = 1000;
        let from = 0;

        while (true) {
            const { data, error } = await supabase
                .from("questions")
                .select("topic_id")
                .eq("school_id", schoolId)
                .in("topic_id", topicIds)
                .range(from, from + pageSize - 1);
            if (error) {
                throw error;
            }
            const rows = (data ?? []) as Array<Pick<Question, "topic_id">>;
            for (const row of rows) {
                if (!row.topic_id) continue;
                counts[row.topic_id] = (counts[row.topic_id] ?? 0) + 1;
            }
            if (rows.length < pageSize) {
                break;
            }
            from += pageSize;
        }
        return counts;
    }

    const counts: Record<string, number> = {};
    for (const row of readLocal<Question>(DB.questions)) {
        if (row.school_id !== schoolId || !row.topic_id || !topicIds.includes(row.topic_id)) {
            continue;
        }
        counts[row.topic_id] = (counts[row.topic_id] ?? 0) + 1;
    }
    return counts;
}

export async function updateQuestionById(questionId: string, patch: Partial<Omit<Question, "id" | "created_at">>) {
    if (hasSupabase && supabase) {
        const { data, error } = await supabase
            .from("questions")
            .update(patch)
            .eq("id", questionId)
            .select("*")
            .single();
        if (error) {
            throw error;
        }
        return data as Question;
    }

    const existing = readLocal<Question>(DB.questions);
    const target = existing.find((q) => q.id === questionId);
    if (!target) {
        throw new Error("Question not found");
    }
    const updated = { ...target, ...patch };
    writeLocal(DB.questions, existing.map((q) => (q.id === questionId ? updated : q)));
    return updated;
}

export async function deleteQuestionsByIds(questionIds: string[]) {
    if (!questionIds.length) {
        return;
    }
    if (hasSupabase && supabase) {
        const { error } = await supabase.from("questions").delete().in("id", questionIds);
        if (error) {
            throw error;
        }
        return;
    }
    writeLocal(DB.questions, readLocal<Question>(DB.questions).filter((q) => !questionIds.includes(q.id)));
    writeLocal(DB.paperQuestions, readLocal<PaperQuestion>(DB.paperQuestions).filter((pq) => !questionIds.includes(pq.question_id)));
    writeLocal(DB.usage, readLocal<QuestionUsage>(DB.usage).filter((u) => !questionIds.includes(u.question_id)));
}

export async function getRecentQuestionUsage(schoolQuestionIds: string[], recentPaperCount: number) {
    ensureSeed();
    const usage = readLocal<QuestionUsage>(DB.usage).sort((a, b) => b.used_at.localeCompare(a.used_at));
    const recentPaperIds = [...new Set(usage.map((u) => u.paper_id))].slice(0, Math.max(0, recentPaperCount));
    return usage.filter((u) => recentPaperIds.includes(u.paper_id) && schoolQuestionIds.includes(u.question_id));
}
