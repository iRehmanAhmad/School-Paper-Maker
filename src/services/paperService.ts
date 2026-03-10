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

export async function getPaperBundleById(paperId: string): Promise<any | null> {
    ensureSeed();
    let paper: Paper | undefined;
    let mappings: PaperQuestion[] = [];

    if (hasSupabase && supabase) {
        const { data: pData } = await supabase.from("papers").select("*").eq("id", paperId).single();
        if (!pData) return null;
        paper = pData as Paper;

        const { data: mData } = await supabase.from("paper_questions").select("*").eq("paper_id", paperId);
        mappings = (mData ?? []) as PaperQuestion[];
    } else {
        paper = readLocal<Paper>(DB.papers).find(p => p.id === paperId);
        if (!paper) return null;
        mappings = readLocal<PaperQuestion>(DB.paperQuestions).filter(pq => pq.paper_id === paperId);
    }

    const questionIds = Array.from(new Set(mappings.map(m => m.question_id)));
    const schoolId = (await import('@/store/useAppStore')).useAppStore.getState().profile?.school_id;
    if (!schoolId) return null;
    const allQuestions = await import("./questionService").then(m => m.getQuestions(schoolId));
    const questionsMap = new Map(allQuestions.filter(q => questionIds.includes(q.id)).map(q => [q.id, q]));

    // Group mappings by set
    const setGroups = mappings.reduce((acc, m) => {
        if (!acc[m.paper_set]) acc[m.paper_set] = [];
        acc[m.paper_set].push(m);
        return acc;
    }, {} as Record<string, PaperQuestion[]>);

    const settings = paper.settings_json as any;
    console.log("[DEBUG] Reconstructing Paper:", paperId);
    console.log("[DEBUG] Mappings found:", mappings.length);
    console.log("[DEBUG] Questions found from DB:", questionsMap.size);
    console.log("[DEBUG] Settings JSON structure:", JSON.stringify(settings, null, 2));

    const sets = Object.entries(setGroups).map(([setId, setMappings]) => {
        const sortedMappings = [...setMappings].sort((a, b) => a.order_number - b.order_number);

        const generatedQs = sortedMappings.map((m) => {
            const q = questionsMap.get(m.question_id);
            if (!q) {
                console.log("[DEBUG] Question missing from map for ID:", m.question_id);
                return null;
            }

            // Reapply settings payload just like Engine did
            const matchingSection = settings.sections?.find((s: any) => s.type === q.question_type);
            const isObjective = ["mcq", "true_false", "fill_blanks", "matching"].includes(q.question_type);
            return {
                id: q.id,
                orderNumber: m.order_number,
                setLabel: m.paper_set,
                section: isObjective ? "Objective Section" : "Subjective Section",
                questionType: q.question_type,
                questionText: q.question_text,
                options: m.shuffled_options || [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean) as string[],
                correctAnswer: q.correct_answer,
                marks: matchingSection?.marks || 1,
                emptyLines: matchingSection?.empty_lines,
                explanation: q.explanation,
                diagramUrl: q.diagram_url,
            };
        }).filter(Boolean);

        return {
            set_id: setId,
            questions: generatedQs
        };
    });

    return {
        paper,
        sets
    };
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

export async function getBlueprintById(blueprintId: string) {
    ensureSeed();
    if (hasSupabase && supabase) {
        const { data, error } = await supabase.from("blueprints").select("*").eq("id", blueprintId).maybeSingle();
        if (error) {
            throw error;
        }
        return (data ?? null) as Blueprint | null;
    }
    return readLocal<Blueprint>(DB.blueprints).find((b) => b.id === blueprintId) ?? null;
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
