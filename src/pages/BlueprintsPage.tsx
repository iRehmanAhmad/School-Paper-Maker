import { FormEvent, useEffect, useMemo, useState } from "react";
import { ContextBreadcrumbs } from "@/components/ContextBreadcrumbs";
import { EmptyState } from "@/components/EmptyState";
import { useHierarchyScopeParams } from "@/hooks/useHierarchyScopeParams";
import { addBlueprint, getBlueprints } from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";
import { useHierarchy } from "@/hooks/useHierarchy";
import { useNavigate } from "react-router-dom";
import { hierarchyScopeToSearch } from "@/utils/hierarchyScope";
import type { BloomLevel, Blueprint, BlueprintSection, ExamType, QuestionLevel, QuestionType } from "@/types/domain";

const examTypes: ExamType[] = ["weekly", "monthly", "chapterwise", "quarterly", "half_yearly", "annual"];
const typeOptions: QuestionType[] = ["mcq", "true_false", "fill_blanks", "short", "long", "matching", "diagram"];
const blooms: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate"];
const questionLevels: Array<{ id: QuestionLevel; label: string }> = [
  { id: "exercise", label: "Exercise Question" },
  { id: "additional", label: "Additional Question" },
  { id: "past_papers", label: "Past Papers" },
  { id: "examples", label: "Exercise Examples" },
  { id: "conceptual", label: "Conceptual Question" },
];

type BlueprintFormSection = {
  type: QuestionType;
  count: number;
  marks: number;
  bloom_level?: BloomLevel;
  question_level?: QuestionLevel;
};

function defaultMarksForType(type: QuestionType) {
  if (type === "short") return 2;
  if (type === "long") return 5;
  if (type === "diagram") return 3;
  return 1;
}

function summarizeBlueprintSections(sections: BlueprintSection[]) {
  return sections.reduce(
    (acc, section) => {
      const count = Math.max(0, Number(section.count) || 0);
      const attempt = Math.max(0, Number(section.choice ?? section.count) || 0);
      const marks = Math.max(0, Number(section.marks ?? defaultMarksForType(section.type)) || 0);
      acc.totalQuestions += count;
      acc.totalMarks += attempt * marks;
      return acc;
    },
    { totalQuestions: 0, totalMarks: 0 }
  );
}

export function BlueprintsPage() {
  const navigate = useNavigate();
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const { scope, mergeScope, clearFrom, scopeToLevel } = useHierarchyScopeParams();

  const {
    examBodies,
    classes,
    subjects,
    examBodyId,
    setExamBodyId,
    classId,
    setClassId,
    subjectId,
    setSubjectId,
  } = useHierarchy(profile?.school_id, { initialScope: scope, autoSelectFirst: false });

  const [rows, setRows] = useState<Blueprint[]>([]);
  const [name, setName] = useState("Monthly Test Template");
  const [examType, setExamType] = useState<ExamType>("monthly");
  const [sections, setSections] = useState<BlueprintFormSection[]>([
    { type: "mcq", count: 10, marks: 1, question_level: "exercise" },
    { type: "short", count: 5, marks: 2, question_level: "exercise" },
    { type: "long", count: 2, marks: 5, question_level: "exercise" },
  ]);

  async function loadBlueprints() {
    if (subjects.length) {
      setRows(await getBlueprints(subjects.map((x) => x.id)));
    }
  }

  useEffect(() => {
    loadBlueprints();
  }, [subjects]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!classId || !subjectId || !name.trim()) return;

    const normalizedSections: BlueprintSection[] = sections
      .map((section) => ({
        type: section.type,
        count: Math.max(0, Number(section.count) || 0),
        choice: Math.max(0, Number(section.count) || 0),
        marks: Math.max(0, Number(section.marks) || defaultMarksForType(section.type)),
        bloom_level: section.bloom_level,
        question_level: section.question_level,
      }))
      .filter((section) => section.count > 0);

    if (!normalizedSections.length) {
      toast("error", "Add at least one section with count greater than 0");
      return;
    }

    await addBlueprint({
      class_id: classId,
      subject_id: subjectId,
      exam_type: examType,
      name: name.trim(),
      structure_json: { sections: normalizedSections },
    });
    toast("success", "Blueprint saved");
    loadBlueprints();
  }

  async function duplicateBlueprint(row: Blueprint) {
    const cloneName = `${row.name} (Copy)`;
    await addBlueprint({
      class_id: row.class_id,
      subject_id: row.subject_id,
      exam_type: row.exam_type,
      name: cloneName,
      structure_json: {
        sections: row.structure_json.sections.map((section) => ({ ...section })),
      },
    });
    toast("success", "Blueprint duplicated");
    loadBlueprints();
  }

  const classNameById = useMemo(
    () => Object.fromEntries(classes.map((item) => [item.id, item.name])),
    [classes]
  );
  const subjectNameById = useMemo(
    () => Object.fromEntries(subjects.map((item) => [item.id, item.name])),
    [subjects]
  );
  const selectedBodyName = examBodies.find((item) => item.id === examBodyId)?.name;
  const selectedClassName = classes.find((item) => item.id === classId)?.name;
  const selectedSubjectName = subjects.find((item) => item.id === subjectId)?.name;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Blueprint Management</h2>
      <ContextBreadcrumbs
        items={[
          {
            label: "Exam Body",
            value: selectedBodyName || "All Exam Bodies",
            selected: !!examBodyId,
            count: examBodies.length,
            onSelect: () => navigate({ pathname: "/exam-bodies", search: hierarchyScopeToSearch(scopeToLevel("examBodyId")) }),
            onClear: () => {
              setExamBodyId("");
              clearFrom("examBodyId");
            },
          },
          {
            label: "Class",
            value: selectedClassName || "All Classes",
            selected: !!classId,
            count: classes.length,
            onSelect: () => navigate({ pathname: "/classes", search: hierarchyScopeToSearch(scopeToLevel("classId")) }),
            onClear: () => {
              setClassId("");
              clearFrom("classId");
            },
          },
          {
            label: "Subject",
            value: selectedSubjectName || "All Subjects",
            selected: !!subjectId,
            count: subjects.length,
            onSelect: () => navigate({ pathname: "/subjects", search: hierarchyScopeToSearch(scopeToLevel("subjectId")) }),
            onClear: () => {
              setSubjectId("");
              clearFrom("subjectId");
            },
          },
          {
            label: "Chapter",
            value: scope.chapterId ? "Selected Chapter" : "All Chapters",
            selected: !!scope.chapterId,
            onSelect: () => navigate({ pathname: "/chapters", search: hierarchyScopeToSearch(scopeToLevel("chapterId")) }),
            onClear: () => clearFrom("chapterId"),
          },
        ]}
      />
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-2 md:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">Exam Body
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={examBodyId}
              onChange={(e) => {
                const nextBody = e.target.value;
                setExamBodyId(nextBody);
                mergeScope({ examBodyId: nextBody || undefined, classId: undefined, subjectId: undefined, chapterId: undefined });
              }}
            >
              <option value="">All Exam Bodies</option>
              {examBodies.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Name
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Class
            <select
              className={`mt-1 w-full rounded-lg border px-3 py-2 ${!examBodyId ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : "border-slate-300"}`}
              value={classId}
              onChange={(e) => {
                const nextClass = e.target.value;
                setClassId(nextClass);
                mergeScope({ examBodyId: examBodyId || undefined, classId: nextClass || undefined, subjectId: undefined, chapterId: undefined });
              }}
              disabled={!examBodyId}
            >
              <option value="">{examBodyId ? "All Classes" : "Select Exam Body First"}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Subject
            <select
              className={`mt-1 w-full rounded-lg border px-3 py-2 ${!classId ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : "border-slate-300"}`}
              value={subjectId}
              onChange={(e) => {
                const nextSubject = e.target.value;
                setSubjectId(nextSubject);
                mergeScope({ examBodyId: examBodyId || undefined, classId: classId || undefined, subjectId: nextSubject || undefined, chapterId: undefined });
              }}
              disabled={!classId}
            >
              <option value="">{classId ? "All Subjects" : "Select Class First"}</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">Exam Type
            <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={examType} onChange={(e) => setExamType(e.target.value as ExamType)}>
              {examTypes.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase">Sections</p>
          {sections.map((section, idx) => (
            <div key={idx} className="grid items-end gap-2 md:grid-cols-[1fr_120px_120px_1fr_1fr_auto]">
              <label className="text-xs font-semibold text-slate-600">Type
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={section.type} onChange={(e) => setSections((prev) => prev.map((p, i) => i === idx ? { ...p, type: e.target.value as QuestionType, marks: defaultMarksForType(e.target.value as QuestionType) } : p))}>
                  {typeOptions.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Count
                <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="number" min={1} value={section.count} onChange={(e) => setSections((prev) => prev.map((p, i) => i === idx ? { ...p, count: Number(e.target.value) } : p))} />
              </label>
              <label className="text-xs font-semibold text-slate-600">Marks / Q
                <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="number" min={0} value={section.marks} onChange={(e) => setSections((prev) => prev.map((p, i) => i === idx ? { ...p, marks: Number(e.target.value) } : p))} />
              </label>
              <label className="text-xs font-semibold text-slate-600">Bloom Level
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={section.bloom_level || ""} onChange={(e) => setSections((prev) => prev.map((p, i) => i === idx ? { ...p, bloom_level: (e.target.value || undefined) as BloomLevel } : p))}>
                  <option value="">Any/Optional</option>
                  {blooms.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Level
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={section.question_level || ""} onChange={(e) => setSections((prev) => prev.map((p, i) => i === idx ? { ...p, question_level: (e.target.value || undefined) as QuestionLevel } : p))}>
                  <option value="">Any/Optional</option>
                  {questionLevels.map((lvl) => <option key={lvl.id} value={lvl.id}>{lvl.label}</option>)}
                </select>
              </label>
              <button type="button" className="rounded bg-red-50 p-2 text-red-600 hover:bg-red-100" onClick={() => setSections((prev) => prev.filter((_, i) => i !== idx))}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold" onClick={() => setSections((prev) => [...prev, { type: "mcq", count: 1, marks: 1 }])}>+ Add Section</button>
          <button disabled={!classId || !subjectId} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:cursor-not-allowed disabled:opacity-60">Save Blueprint</button>
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="font-bold text-slate-700">Saved Blueprints</h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Context</th>
                  <th className="px-4 py-3">Exam Type</th>
                  <th className="px-4 py-3">Preview Summary</th>
                  <th className="px-4 py-3">Structure</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-4">
                      <EmptyState title="No blueprints found" description="Create a blueprint template to reuse exam structure quickly." />
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const summary = summarizeBlueprintSections(row.structure_json.sections);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{row.name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-slate-700">
                            {classNameById[row.class_id] || "Unknown Class"} / {subjectNameById[row.subject_id] || "Unknown Subject"}
                          </p>
                        </td>
                        <td className="px-4 py-3 capitalize">{row.exam_type}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700">
                              {summary.totalQuestions} Questions
                            </span>
                            <span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                              {summary.totalMarks} Marks
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {row.structure_json.sections.map((section, idx) => (
                              <span key={idx} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                {section.type}: {section.count} x {section.marks ?? defaultMarksForType(section.type)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => duplicateBlueprint(row)}
                              className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-emerald-700 hover:bg-emerald-100"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/paper-generator?blueprint=${row.id}`)}
                              className="rounded bg-brand px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-white hover:bg-brand/90"
                            >
                              Use This Blueprint
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
