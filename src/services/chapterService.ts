import { hasSupabase, supabase } from "@/services/supabase";
import type { ChapterEntity, Question, ChapterWeightage, PaperQuestion, QuestionUsage } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal, normalizeText, DeleteImpact } from "./baseService";

export async function getChapters(subjectIds: string[]) {
    ensureSeed();
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("chapters").select("*").in("subject_id", subjectIds).order("chapter_number", { ascending: true });
        if (error) {
            throw error;
        }
        return (data ?? []) as ChapterEntity[];
    }
    return readLocal<ChapterEntity>(DB.chapters).filter((r) => subjectIds.includes(r.subject_id));
}

export async function addChapter(input: Omit<ChapterEntity, "id" | "created_at">) {
    const nextTitle = input.title.trim();
    if (!nextTitle) {
        throw new Error("Chapter title is required");
    }
    if (hasSupabase && supabase) {
        const existing = await getChapters([input.subject_id]);
        const titleExists = existing.some((r) => normalizeText(r.title) === normalizeText(nextTitle));
        if (titleExists) {
            throw new Error("Chapter title already exists");
        }
        const numberExists = existing.some((r) => r.chapter_number === input.chapter_number);
        if (numberExists) {
            throw new Error("Chapter number already exists");
        }
        const { data, error } = await supabase.from("chapters").insert({ ...input, title: nextTitle }).select("*").single();
        if (error) {
            throw error;
        }
        return data as ChapterEntity;
    }
    const existing = readLocal<ChapterEntity>(DB.chapters).filter((r) => r.subject_id === input.subject_id);
    const titleExists = existing.some((r) => normalizeText(r.title) === normalizeText(nextTitle));
    if (titleExists) {
        throw new Error("Chapter title already exists");
    }
    const numberExists = existing.some((r) => r.chapter_number === input.chapter_number);
    if (numberExists) {
        throw new Error("Chapter number already exists");
    }
    const row: ChapterEntity = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...input };
    row.title = nextTitle;
    const rows = readLocal<ChapterEntity>(DB.chapters);
    rows.unshift(row);
    writeLocal(DB.chapters, rows);
    return row;
}

export async function addChapters(rows: Omit<ChapterEntity, "id" | "created_at">[]) {
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("chapters").insert(rows).select("*");
        if (error) {
            throw error;
        }
        return (data ?? []) as ChapterEntity[];
    }
    const now = new Date().toISOString();
    const existing = readLocal<ChapterEntity>(DB.chapters);
    const mapped = rows.map((r) => ({ id: crypto.randomUUID(), created_at: now, ...r, title: r.title.trim() }));
    writeLocal(DB.chapters, [...mapped, ...existing]);
    return mapped;
}

export async function updateChapter(chapterId: string, input: Pick<ChapterEntity, "title" | "chapter_number">) {
    const nextTitle = input.title.trim();
    if (!nextTitle) {
        throw new Error("Chapter title is required");
    }
    if (hasSupabase && supabase) {
        const { data: currentRow, error: currentError } = await supabase.from("chapters").select("*").eq("id", chapterId).single();
        if (currentError) {
            throw currentError;
        }
        const row = currentRow as ChapterEntity;
        const existing = await getChapters([row.subject_id]);
        const titleExists = existing.some((r) => r.id !== chapterId && normalizeText(r.title) === normalizeText(nextTitle));
        if (titleExists) {
            throw new Error("Chapter title already exists");
        }
        const numberExists = existing.some((r) => r.id !== chapterId && r.chapter_number === input.chapter_number);
        if (numberExists) {
            throw new Error("Chapter number already exists");
        }
        const { data, error } = await supabase
            .from("chapters")
            .update({ title: nextTitle, chapter_number: input.chapter_number })
            .eq("id", chapterId)
            .select("*")
            .single();
        if (error) {
            throw error;
        }
        return data as ChapterEntity;
    }
    const rows = readLocal<ChapterEntity>(DB.chapters);
    const row = rows.find((r) => r.id === chapterId);
    if (!row) {
        throw new Error("Chapter not found");
    }
    const existing = rows.filter((r) => r.subject_id === row.subject_id && r.id !== chapterId);
    const titleExists = existing.some((r) => normalizeText(r.title) === normalizeText(nextTitle));
    if (titleExists) {
        throw new Error("Chapter title already exists");
    }
    const numberExists = existing.some((r) => r.chapter_number === input.chapter_number);
    if (numberExists) {
        throw new Error("Chapter number already exists");
    }
    row.title = nextTitle;
    row.chapter_number = input.chapter_number;
    writeLocal(DB.chapters, rows);
    return row;
}

export async function reorderChapters(subjectId: string, orderedChapterIds: string[]) {
    if (!orderedChapterIds.length) {
        return;
    }

    if (hasSupabase && supabase) {
        const client = supabase;
        const existing = await getChapters([subjectId]);
        const existingIds = existing.map((c) => c.id);
        if (existingIds.length !== orderedChapterIds.length) {
            throw new Error("Reorder list is incomplete");
        }
        const sameSet = existingIds.every((id) => orderedChapterIds.includes(id));
        if (!sameSet) {
            throw new Error("Reorder list has invalid chapter IDs");
        }

        const offset = 1000;
        const tempResults = await Promise.all(
            orderedChapterIds.map((id, idx) =>
                client.from("chapters").update({ chapter_number: idx + 1 + offset }).eq("id", id)
            )
        );
        const tempError = tempResults.find((res) => res.error)?.error;
        if (tempError) {
            throw tempError;
        }

        const finalResults = await Promise.all(
            orderedChapterIds.map((id, idx) =>
                client.from("chapters").update({ chapter_number: idx + 1 }).eq("id", id)
            )
        );
        const finalError = finalResults.find((res) => res.error)?.error;
        if (finalError) {
            throw finalError;
        }
        return;
    }

    const rows = readLocal<ChapterEntity>(DB.chapters);
    const subjectRows = rows.filter((r) => r.subject_id === subjectId);
    const subjectIds = subjectRows.map((c) => c.id);
    if (subjectIds.length !== orderedChapterIds.length || !subjectIds.every((id) => orderedChapterIds.includes(id))) {
        throw new Error("Reorder list is invalid");
    }

    const nextNumberById = new Map<string, number>();
    orderedChapterIds.forEach((id, idx) => nextNumberById.set(id, idx + 1));
    const updated = rows.map((row) =>
        row.subject_id === subjectId && nextNumberById.has(row.id)
            ? { ...row, chapter_number: nextNumberById.get(row.id)! }
            : row
    );
    writeLocal(DB.chapters, updated);
}

export async function deleteChapter(chapterId: string) {
    if (hasSupabase && supabase) {
        const { error } = await supabase.from("chapters").delete().eq("id", chapterId);
        if (error) {
            throw error;
        }
        return;
    }
    const questions = readLocal<Question>(DB.questions).filter((q) => q.chapter_id === chapterId).map((q) => q.id);
    writeLocal(DB.chapters, readLocal<ChapterEntity>(DB.chapters).filter((r) => r.id !== chapterId));
    writeLocal(DB.questions, readLocal<Question>(DB.questions).filter((r) => r.chapter_id !== chapterId));
    writeLocal(DB.weightage, readLocal<ChapterWeightage>(DB.weightage).filter((r) => r.chapter_id !== chapterId));
    writeLocal(DB.paperQuestions, readLocal<PaperQuestion>(DB.paperQuestions).filter((r) => !questions.includes(r.question_id)));
    writeLocal(DB.usage, readLocal<QuestionUsage>(DB.usage).filter((r) => !questions.includes(r.question_id)));
}

export async function getChapterDeleteImpact(chapterId: string): Promise<DeleteImpact> {
    if (hasSupabase && supabase) {
        const { data: questions, error } = await supabase.from("questions").select("id").eq("chapter_id", chapterId);
        if (error) {
            throw error;
        }
        return { classes: 0, subjects: 0, chapters: 1, questions: (questions ?? []).length };
    }
    ensureSeed();
    const questions = readLocal<Question>(DB.questions).filter((q) => q.chapter_id === chapterId);
    return { classes: 0, subjects: 0, chapters: 1, questions: questions.length };
}

export async function getChapterWeightage(chapterIds: string[]) {
    ensureSeed();
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("chapter_weightage").select("*").in("chapter_id", chapterIds);
        if (error) {
            throw error;
        }
        return (data ?? []) as ChapterWeightage[];
    }
    return readLocal<ChapterWeightage>(DB.weightage).filter((w) => chapterIds.includes(w.chapter_id));
}
