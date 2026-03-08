import { hasSupabase, supabase } from "@/services/supabase";
import type { ExamBody, ClassEntity, SubjectEntity, ChapterEntity, Question, ChapterWeightage, PaperQuestion, QuestionUsage } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal, assertUniqueName, DeleteImpact } from "./baseService";

export async function getExamBodies(schoolId: string) {
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("exam_bodies").select("*").eq("school_id", schoolId).order("name");
        if (error) {
            throw error;
        }
        return (data ?? []) as ExamBody[];
    }
    ensureSeed();
    return readLocal<ExamBody>(DB.examBodies).filter((r) => r.school_id === schoolId);
}

export async function addExamBody(input: Omit<ExamBody, "id" | "created_at">) {
    const nextName = input.name.trim();
    if (!nextName) {
        throw new Error("Exam body name is required");
    }
    if (hasSupabase && supabase) {
        const existing = await getExamBodies(input.school_id);
        assertUniqueName(existing.map((r) => r.name), nextName, "Exam body");
        const { data, error } = await supabase.from("exam_bodies").insert({ ...input, name: nextName }).select("*").single();
        if (error) {
            throw error;
        }
        return data as ExamBody;
    }
    const existing = readLocal<ExamBody>(DB.examBodies).filter((r) => r.school_id === input.school_id);
    assertUniqueName(existing.map((r) => r.name), nextName, "Exam body");
    const row: ExamBody = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...input };
    row.name = nextName;
    const rows = readLocal<ExamBody>(DB.examBodies);
    rows.unshift(row);
    writeLocal(DB.examBodies, rows);
    return row;
}

export async function updateExamBodyName(examBodyId: string, name: string) {
    const nextName = name.trim();
    if (!nextName) {
        throw new Error("Exam body name is required");
    }
    if (hasSupabase && supabase) {
        const { data: currentRow, error: currentError } = await supabase.from("exam_bodies").select("*").eq("id", examBodyId).single();
        if (currentError) {
            throw currentError;
        }
        const existing = await getExamBodies((currentRow as ExamBody).school_id);
        assertUniqueName(
            existing.filter((r) => r.id !== examBodyId).map((r) => r.name),
            nextName,
            "Exam body",
        );
        const { data, error } = await supabase.from("exam_bodies").update({ name: nextName }).eq("id", examBodyId).select("*").single();
        if (error) {
            throw error;
        }
        return data as ExamBody;
    }
    const rows = readLocal<ExamBody>(DB.examBodies);
    const row = rows.find((r) => r.id === examBodyId);
    if (!row) {
        throw new Error("Exam body not found");
    }
    assertUniqueName(
        rows.filter((r) => r.school_id === row.school_id && r.id !== examBodyId).map((r) => r.name),
        nextName,
        "Exam body",
    );
    row.name = nextName;
    writeLocal(DB.examBodies, rows);
    return row;
}

export async function deleteExamBody(examBodyId: string) {
    if (hasSupabase && supabase) {
        const { error } = await supabase.from("exam_bodies").delete().eq("id", examBodyId);
        if (error) {
            throw error;
        }
        return;
    }
    const classes = readLocal<ClassEntity>(DB.classes).filter((c) => c.exam_body_id === examBodyId).map((c) => c.id);
    const subjects = readLocal<SubjectEntity>(DB.subjects).filter((s) => classes.includes(s.class_id)).map((s) => s.id);
    const chapters = readLocal<ChapterEntity>(DB.chapters).filter((c) => subjects.includes(c.subject_id)).map((c) => c.id);
    const questions = readLocal<Question>(DB.questions).filter((q) => chapters.includes(q.chapter_id)).map((q) => q.id);

    writeLocal(DB.examBodies, readLocal<ExamBody>(DB.examBodies).filter((r) => r.id !== examBodyId));
    writeLocal(DB.classes, readLocal<ClassEntity>(DB.classes).filter((r) => r.exam_body_id !== examBodyId));
    writeLocal(DB.subjects, readLocal<SubjectEntity>(DB.subjects).filter((r) => !classes.includes(r.class_id)));
    writeLocal(DB.chapters, readLocal<ChapterEntity>(DB.chapters).filter((r) => !subjects.includes(r.subject_id)));
    writeLocal(DB.questions, readLocal<Question>(DB.questions).filter((r) => !chapters.includes(r.chapter_id)));
    writeLocal(DB.weightage, readLocal<ChapterWeightage>(DB.weightage).filter((r) => !chapters.includes(r.chapter_id)));
    writeLocal(DB.paperQuestions, readLocal<PaperQuestion>(DB.paperQuestions).filter((r) => !questions.includes(r.question_id)));
    writeLocal(DB.usage, readLocal<QuestionUsage>(DB.usage).filter((r) => !questions.includes(r.question_id)));
}

export async function getExamBodyDeleteImpact(examBodyId: string): Promise<DeleteImpact> {
    if (hasSupabase && supabase) {
        const { data: classes, error: classError } = await supabase.from("classes").select("id").eq("exam_body_id", examBodyId);
        if (classError) {
            throw classError;
        }
        const classIds = (classes ?? []).map((c) => c.id as string);
        if (!classIds.length) {
            return { classes: 0, subjects: 0, chapters: 0, questions: 0 };
        }
        const { data: subjects, error: subjectError } = await supabase.from("subjects").select("id").in("class_id", classIds);
        if (subjectError) {
            throw subjectError;
        }
        const subjectIds = (subjects ?? []).map((s) => s.id as string);
        if (!subjectIds.length) {
            return { classes: classIds.length, subjects: 0, chapters: 0, questions: 0 };
        }
        const { data: chapters, error: chapterError } = await supabase.from("chapters").select("id").in("subject_id", subjectIds);
        if (chapterError) {
            throw chapterError;
        }
        const chapterIds = (chapters ?? []).map((c) => c.id as string);
        if (!chapterIds.length) {
            return { classes: classIds.length, subjects: subjectIds.length, chapters: 0, questions: 0 };
        }
        const { data: questions, error: questionError } = await supabase.from("questions").select("id").in("chapter_id", chapterIds);
        if (questionError) {
            throw questionError;
        }
        return { classes: classIds.length, subjects: subjectIds.length, chapters: chapterIds.length, questions: (questions ?? []).length };
    }
    ensureSeed();
    const classes = readLocal<ClassEntity>(DB.classes).filter((c) => c.exam_body_id === examBodyId);
    const classIds = classes.map((c) => c.id);
    const subjects = readLocal<SubjectEntity>(DB.subjects).filter((s) => classIds.includes(s.class_id));
    const subjectIds = subjects.map((s) => s.id);
    const chapters = readLocal<ChapterEntity>(DB.chapters).filter((c) => subjectIds.includes(c.subject_id));
    const chapterIds = chapters.map((c) => c.id);
    const questions = readLocal<Question>(DB.questions).filter((q) => chapterIds.includes(q.chapter_id));
    return { classes: classes.length, subjects: subjects.length, chapters: chapters.length, questions: questions.length };
}
