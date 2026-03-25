import { canUseSupabase, supabase } from "@/services/supabase";
import type { BloomLevel, Difficulty, Question, QuestionType, PaperQuestion, QuestionUsage } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal } from "./baseService";

export type GetQuestionsPageInput = {
    schoolId: string;
    chapterIds?: string[];
    topicId?: string;
    search?: string;
    difficulty?: Difficulty | "all";
    questionType?: QuestionType | "all";
    bloomLevel?: BloomLevel | "all";
    page?: number;
    pageSize?: number;
};

export type GetQuestionsPageResult = {
    rows: Question[];
    total: number;
};

export async function getQuestions(schoolId: string, chapterIds?: string[]) {
    ensureSeed();
    if (canUseSupabase()) {
        let query = supabase!.from("questions").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(5000);
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

export async function getQuestionsPage(input: GetQuestionsPageInput): Promise<GetQuestionsPageResult> {
    ensureSeed();
    const page = Math.max(1, Math.floor(input.page || 1));
    const pageSize = Math.max(1, Math.floor(input.pageSize || 25));
    const search = (input.search || "").trim();

    if (canUseSupabase()) {
        let query = supabase!
            .from("questions")
            .select("*", { count: "exact" })
            .eq("school_id", input.schoolId)
            .order("created_at", { ascending: false });

        if (input.chapterIds?.length) {
            query = query.in("chapter_id", input.chapterIds);
        }
        if (input.topicId) {
            query = query.eq("topic_id", input.topicId);
        }
        if (input.difficulty && input.difficulty !== "all") {
            query = query.eq("difficulty", input.difficulty);
        }
        if (input.questionType && input.questionType !== "all") {
            query = query.eq("question_type", input.questionType);
        }
        if (input.bloomLevel && input.bloomLevel !== "all") {
            query = query.eq("bloom_level", input.bloomLevel);
        }
        if (search) {
            query = query.ilike("question_text", `%${search}%`);
        }

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const { data, error, count } = await query.range(from, to);
        if (error) {
            throw error;
        }
        return {
            rows: (data ?? []) as Question[],
            total: Number(count || 0),
        };
    }

    let filtered = readLocal<Question>(DB.questions).filter((q) => q.school_id === input.schoolId);
    if (input.chapterIds?.length) {
        const chapterSet = new Set(input.chapterIds);
        filtered = filtered.filter((q) => chapterSet.has(q.chapter_id));
    }
    if (input.topicId) {
        filtered = filtered.filter((q) => (q.topic_id || "") === input.topicId);
    }
    if (input.difficulty && input.difficulty !== "all") {
        filtered = filtered.filter((q) => q.difficulty === input.difficulty);
    }
    if (input.questionType && input.questionType !== "all") {
        filtered = filtered.filter((q) => q.question_type === input.questionType);
    }
    if (input.bloomLevel && input.bloomLevel !== "all") {
        filtered = filtered.filter((q) => (q.bloom_level || "") === input.bloomLevel);
    }
    if (search) {
        const needle = search.toLowerCase();
        filtered = filtered.filter((q) => (q.question_text || "").toLowerCase().includes(needle));
    }

    filtered = filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const total = filtered.length;
    const from = (page - 1) * pageSize;
    const rows = filtered.slice(from, from + pageSize);
    return { rows, total };
}

export async function addQuestions(rows: Omit<Question, "id" | "created_at">[]) {
    if (canUseSupabase()) {
        const { data, error } = await supabase!.from("questions").insert(rows).select("*");
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

    if (canUseSupabase()) {
        const counts: Record<string, number> = {};
        const pageSize = 1000;
        let from = 0;

        while (true) {
            const { data, error } = await supabase!
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

    if (canUseSupabase()) {
        const counts: Record<string, number> = {};
        const pageSize = 1000;
        let from = 0;

        while (true) {
            const { data, error } = await supabase!
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
    if (canUseSupabase()) {
        const { data, error } = await supabase!
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
    if (canUseSupabase()) {
        const { error } = await supabase!.from("questions").delete().in("id", questionIds);
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
