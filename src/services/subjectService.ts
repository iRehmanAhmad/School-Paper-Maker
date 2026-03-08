import { hasSupabase, supabase } from "@/services/supabase";
import type { SubjectEntity, ChapterEntity, Question, ChapterWeightage, PaperQuestion, QuestionUsage } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal, assertUniqueName, DeleteImpact } from "./baseService";

export async function getSubjects(classIds: string[]) {
    ensureSeed();
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("subjects").select("*").in("class_id", classIds);
        if (error) {
            throw error;
        }
        return (data ?? []) as SubjectEntity[];
    }
    return readLocal<SubjectEntity>(DB.subjects).filter((r) => classIds.includes(r.class_id));
}

export async function addSubject(input: Omit<SubjectEntity, "id" | "created_at">) {
    const nextName = input.name.trim();
    if (!nextName) {
        throw new Error("Subject name is required");
    }
    if (hasSupabase && supabase) {
        const existing = await getSubjects([input.class_id]);
        assertUniqueName(existing.map((r) => r.name), nextName, "Subject");
        const { data, error } = await supabase.from("subjects").insert({ ...input, name: nextName }).select("*").single();
        if (error) {
            throw error;
        }
        return data as SubjectEntity;
    }
    const existing = readLocal<SubjectEntity>(DB.subjects).filter((r) => r.class_id === input.class_id);
    assertUniqueName(existing.map((r) => r.name), nextName, "Subject");
    const row: SubjectEntity = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...input };
    row.name = nextName;
    const rows = readLocal<SubjectEntity>(DB.subjects);
    rows.unshift(row);
    writeLocal(DB.subjects, rows);
    return row;
}

export async function updateSubjectName(subjectId: string, name: string) {
    const nextName = name.trim();
    if (!nextName) {
        throw new Error("Subject name is required");
    }
    if (hasSupabase && supabase) {
        const { data: currentRow, error: currentError } = await supabase.from("subjects").select("*").eq("id", subjectId).single();
        if (currentError) {
            throw currentError;
        }
        const row = currentRow as SubjectEntity;
        const existing = await getSubjects([row.class_id]);
        assertUniqueName(
            existing.filter((r) => r.id !== subjectId).map((r) => r.name),
            nextName,
            "Subject",
        );
        const { data, error } = await supabase.from("subjects").update({ name: nextName }).eq("id", subjectId).select("*").single();
        if (error) {
            throw error;
        }
        return data as SubjectEntity;
    }
    const rows = readLocal<SubjectEntity>(DB.subjects);
    const row = rows.find((r) => r.id === subjectId);
    if (!row) {
        throw new Error("Subject not found");
    }
    assertUniqueName(
        rows.filter((r) => r.class_id === row.class_id && r.id !== subjectId).map((r) => r.name),
        nextName,
        "Subject",
    );
    row.name = nextName;
    writeLocal(DB.subjects, rows);
    return row;
}

export async function deleteSubject(subjectId: string) {
    if (hasSupabase && supabase) {
        const { error } = await supabase.from("subjects").delete().eq("id", subjectId);
        if (error) {
            throw error;
        }
        return;
    }
    const chapters = readLocal<ChapterEntity>(DB.chapters).filter((c) => c.subject_id === subjectId).map((c) => c.id);
    const questions = readLocal<Question>(DB.questions).filter((q) => chapters.includes(q.chapter_id)).map((q) => q.id);
    writeLocal(DB.subjects, readLocal<SubjectEntity>(DB.subjects).filter((r) => r.id !== subjectId));
    writeLocal(DB.chapters, readLocal<ChapterEntity>(DB.chapters).filter((r) => r.subject_id !== subjectId));
    writeLocal(DB.questions, readLocal<Question>(DB.questions).filter((r) => !chapters.includes(r.chapter_id)));
    writeLocal(DB.weightage, readLocal<ChapterWeightage>(DB.weightage).filter((r) => !chapters.includes(r.chapter_id)));
    writeLocal(DB.paperQuestions, readLocal<PaperQuestion>(DB.paperQuestions).filter((r) => !questions.includes(r.question_id)));
    writeLocal(DB.usage, readLocal<QuestionUsage>(DB.usage).filter((r) => !questions.includes(r.question_id)));
}

export async function getSubjectDeleteImpact(subjectId: string): Promise<DeleteImpact> {
    if (hasSupabase && supabase) {
        const { data: chapters, error: chapterError } = await supabase.from("chapters").select("id").eq("subject_id", subjectId);
        if (chapterError) {
            throw chapterError;
        }
        const chapterIds = (chapters ?? []).map((c) => c.id as string);
        if (!chapterIds.length) {
            return { classes: 0, subjects: 1, chapters: 0, questions: 0 };
        }
        const { data: questions, error: questionError } = await supabase.from("questions").select("id").in("chapter_id", chapterIds);
        if (questionError) {
            throw questionError;
        }
        return { classes: 0, subjects: 1, chapters: chapterIds.length, questions: (questions ?? []).length };
    }
    ensureSeed();
    const chapters = readLocal<ChapterEntity>(DB.chapters).filter((c) => c.subject_id === subjectId);
    const chapterIds = chapters.map((c) => c.id);
    const questions = readLocal<Question>(DB.questions).filter((q) => chapterIds.includes(q.chapter_id));
    return { classes: 0, subjects: 1, chapters: chapters.length, questions: questions.length };
}
