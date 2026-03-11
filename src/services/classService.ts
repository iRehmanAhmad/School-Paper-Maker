import { hasSupabase, supabase } from "@/services/supabase";
import type { ClassEntity, SubjectEntity, ChapterEntity, Question, ChapterWeightage, PaperQuestion, QuestionUsage, TopicEntity } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal, assertUniqueName, DeleteImpact } from "./baseService";

export async function getClasses(schoolId: string, examBodyId?: string) {
    if (hasSupabase && supabase) {
        let query = supabase.from("classes").select("*").eq("school_id", schoolId).order("created_at", { ascending: false });
        if (examBodyId) {
            query = query.eq("exam_body_id", examBodyId);
        }
        const { data, error } = await query;
        if (error) {
            throw error;
        }
        return (data ?? []) as ClassEntity[];
    }
    ensureSeed();
    return readLocal<ClassEntity>(DB.classes).filter((r) => r.school_id === schoolId && (!examBodyId || r.exam_body_id === examBodyId));
}

export async function addClass(input: Omit<ClassEntity, "id" | "created_at">) {
    const nextName = input.name.trim();
    if (!nextName) {
        throw new Error("Class name is required");
    }
    if (hasSupabase && supabase) {
        const existing = await getClasses(input.school_id, input.exam_body_id);
        assertUniqueName(existing.map((r) => r.name), nextName, "Class");
        const { data, error } = await supabase.from("classes").insert({ ...input, name: nextName }).select("*").single();
        if (error) {
            throw error;
        }
        return data as ClassEntity;
    }
    const existing = readLocal<ClassEntity>(DB.classes).filter((r) => r.school_id === input.school_id && r.exam_body_id === input.exam_body_id);
    assertUniqueName(existing.map((r) => r.name), nextName, "Class");
    const row: ClassEntity = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...input };
    row.name = nextName;
    const rows = readLocal<ClassEntity>(DB.classes);
    rows.unshift(row);
    writeLocal(DB.classes, rows);
    return row;
}

export async function updateClassName(classId: string, name: string) {
    const nextName = name.trim();
    if (!nextName) {
        throw new Error("Class name is required");
    }
    if (hasSupabase && supabase) {
        const { data: currentRow, error: currentError } = await supabase.from("classes").select("*").eq("id", classId).single();
        if (currentError) {
            throw currentError;
        }
        const row = currentRow as ClassEntity;
        const existing = await getClasses(row.school_id, row.exam_body_id);
        assertUniqueName(
            existing.filter((r) => r.id !== classId).map((r) => r.name),
            nextName,
            "Class",
        );
        const { data, error } = await supabase.from("classes").update({ name: nextName }).eq("id", classId).select("*").single();
        if (error) {
            throw error;
        }
        return data as ClassEntity;
    }
    const rows = readLocal<ClassEntity>(DB.classes);
    const row = rows.find((r) => r.id === classId);
    if (!row) {
        throw new Error("Class not found");
    }
    assertUniqueName(
        rows.filter((r) => r.school_id === row.school_id && r.exam_body_id === row.exam_body_id && r.id !== classId).map((r) => r.name),
        nextName,
        "Class",
    );
    row.name = nextName;
    writeLocal(DB.classes, rows);
    return row;
}

export async function deleteClass(classId: string) {
    if (hasSupabase && supabase) {
        const { error } = await supabase.from("classes").delete().eq("id", classId);
        if (error) {
            throw error;
        }
        return;
    }
    const subjects = readLocal<SubjectEntity>(DB.subjects).filter((s) => s.class_id === classId).map((s) => s.id);
    const chapters = readLocal<ChapterEntity>(DB.chapters).filter((c) => subjects.includes(c.subject_id)).map((c) => c.id);
    const topics = readLocal<TopicEntity>(DB.topics).filter((t) => chapters.includes(t.chapter_id)).map((t) => t.id);
    const questions = readLocal<Question>(DB.questions).filter((q) => chapters.includes(q.chapter_id)).map((q) => q.id);

    writeLocal(DB.classes, readLocal<ClassEntity>(DB.classes).filter((r) => r.id !== classId));
    writeLocal(DB.subjects, readLocal<SubjectEntity>(DB.subjects).filter((r) => r.class_id !== classId));
    writeLocal(DB.chapters, readLocal<ChapterEntity>(DB.chapters).filter((r) => !subjects.includes(r.subject_id)));
    writeLocal(DB.topics, readLocal<TopicEntity>(DB.topics).filter((r) => !topics.includes(r.id)));
    writeLocal(DB.questions, readLocal<Question>(DB.questions).filter((r) => !chapters.includes(r.chapter_id)));
    writeLocal(DB.weightage, readLocal<ChapterWeightage>(DB.weightage).filter((r) => !chapters.includes(r.chapter_id)));
    writeLocal(DB.paperQuestions, readLocal<PaperQuestion>(DB.paperQuestions).filter((r) => !questions.includes(r.question_id)));
    writeLocal(DB.usage, readLocal<QuestionUsage>(DB.usage).filter((r) => !questions.includes(r.question_id)));
}

export async function getClassDeleteImpact(classId: string): Promise<DeleteImpact> {
    if (hasSupabase && supabase) {
        const { data: subjects, error: subjectError } = await supabase.from("subjects").select("id").eq("class_id", classId);
        if (subjectError) {
            throw subjectError;
        }
        const subjectIds = (subjects ?? []).map((s) => s.id as string);
        if (!subjectIds.length) {
            return { classes: 1, subjects: 0, chapters: 0, questions: 0 };
        }
        const { data: chapters, error: chapterError } = await supabase.from("chapters").select("id").in("subject_id", subjectIds);
        if (chapterError) {
            throw chapterError;
        }
        const chapterIds = (chapters ?? []).map((c) => c.id as string);
        if (!chapterIds.length) {
            return { classes: 1, subjects: subjectIds.length, chapters: 0, questions: 0 };
        }
        const { data: questions, error: questionError } = await supabase.from("questions").select("id").in("chapter_id", chapterIds);
        if (questionError) {
            throw questionError;
        }
        return { classes: 1, subjects: subjectIds.length, chapters: chapterIds.length, questions: (questions ?? []).length };
    }
    ensureSeed();
    const subjects = readLocal<SubjectEntity>(DB.subjects).filter((s) => s.class_id === classId);
    const subjectIds = subjects.map((s) => s.id);
    const chapters = readLocal<ChapterEntity>(DB.chapters).filter((c) => subjectIds.includes(c.subject_id));
    const chapterIds = chapters.map((c) => c.id);
    const questions = readLocal<Question>(DB.questions).filter((q) => chapterIds.includes(q.chapter_id));
    return { classes: 1, subjects: subjects.length, chapters: chapters.length, questions: questions.length };
}
