import { hasSupabase, supabase } from "@/services/supabase";
import type { Paper, PaperQuestion, QuestionUsage, Blueprint, PaperTemplate } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal } from "./baseService";
import { getQuestions } from "./questionService";
import { getClasses } from "./classService";
import { getSubjects } from "./subjectService";
import { getChapters } from "./chapterService";

export async function savePaperAndUsage(paper: Paper, mappings: PaperQuestion[], usage: QuestionUsage[]) {
    if (hasSupabase && supabase) {
        const { error: paperErr } = await supabase.from("papers").insert(paper);
        if (paperErr) {
            throw paperErr;
        }
        const { error: pqErr } = await supabase.from("paper_questions").insert(mappings);
        if (pqErr) {
            throw pqErr;
        }
        const { error: usageErr } = await supabase.from("question_usage").insert(usage);
        if (usageErr) {
            throw usageErr;
        }
        return;
    }
    writeLocal(DB.papers, [paper, ...readLocal<Paper>(DB.papers)]);
    writeLocal(DB.paperQuestions, [...mappings, ...readLocal<PaperQuestion>(DB.paperQuestions)]);
    writeLocal(DB.usage, [...usage, ...readLocal<QuestionUsage>(DB.usage)]);
}

export async function getPapersByTeacher(teacherId: string) {
    ensureSeed();
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("papers").select("*").eq("teacher_id", teacherId).order("created_at", { ascending: false }).limit(30);
        if (error) {
            throw error;
        }
        return (data ?? []) as Paper[];
    }
    return readLocal<Paper>(DB.papers).filter((p) => p.teacher_id === teacherId).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getStats(schoolId: string, teacherId: string) {
    const [questions, classes, subjects, chapters, papers] = await Promise.all([
        getQuestions(schoolId),
        getClasses(schoolId),
        getSubjects((await getClasses(schoolId)).map((c) => c.id)),
        getChapters((await getSubjects((await getClasses(schoolId)).map((c) => c.id))).map((s) => s.id)),
        getPapersByTeacher(teacherId),
    ]);

    return {
        totalQuestions: questions.length,
        totalClasses: classes.length,
        totalSubjects: subjects.length,
        totalChapters: chapters.length,
        papersGenerated: papers.length,
    };
}

export async function getBlueprints(subjectIds: string[]) {
    ensureSeed();
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("blueprints").select("*").in("subject_id", subjectIds);
        if (error) {
            throw error;
        }
        return (data ?? []) as Blueprint[];
    }
    return readLocal<Blueprint>(DB.blueprints).filter((b) => subjectIds.includes(b.subject_id));
}

export async function addBlueprint(row: Omit<Blueprint, "id">) {
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("blueprints").insert(row).select("*").single();
        if (error) {
            throw error;
        }
        return data as Blueprint;
    }
    const item = { ...row, id: crypto.randomUUID() };
    const rows = readLocal<Blueprint>(DB.blueprints);
    rows.unshift(item);
    writeLocal(DB.blueprints, rows);
    return item;
}

export async function getTemplates(teacherId: string) {
    ensureSeed();
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("paper_templates").select("*").eq("teacher_id", teacherId).order("created_at", { ascending: false });
        if (error) {
            throw error;
        }
        return (data ?? []) as PaperTemplate[];
    }
    return readLocal<PaperTemplate>(DB.templates).filter((t) => t.teacher_id === teacherId).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function saveTemplate(input: Omit<PaperTemplate, "id" | "created_at">) {
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("paper_templates").insert(input).select("*").single();
        if (error) {
            throw error;
        }
        return data as PaperTemplate;
    }
    const row: PaperTemplate = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...input };
    writeLocal(DB.templates, [row, ...readLocal<PaperTemplate>(DB.templates)]);
    return row;
}
