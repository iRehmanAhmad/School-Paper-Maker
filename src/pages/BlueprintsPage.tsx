import { FormEvent, useEffect, useState } from "react";
import { addBlueprint, getBlueprints } from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";
import { useHierarchy } from "@/hooks/useHierarchy";
import { AdminTable } from "@/components/AdminTable";
import type { BloomLevel, Blueprint, ExamType, QuestionLevel, QuestionType } from "@/types/domain";

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

export function BlueprintsPage() {
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);

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
  } = useHierarchy(profile?.school_id);

  const [rows, setRows] = useState<Blueprint[]>([]);
  const [name, setName] = useState("Monthly Test Template");
  const [examType, setExamType] = useState<ExamType>("monthly");
  const [sections, setSections] = useState<Array<{ type: QuestionType; count: number; bloom_level?: BloomLevel; question_level?: QuestionLevel }>>([
    { type: "mcq", count: 10, question_level: "exercise" },
    { type: "short", count: 5, question_level: "exercise" },
    { type: "long", count: 2, question_level: "exercise" },
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
    await addBlueprint({ class_id: classId, subject_id: subjectId, exam_type: examType, name, structure_json: { sections } });
    toast("success", "Blueprint saved");
    loadBlueprints();
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Blueprint Management</h2>
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-2 md:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">Exam Body
            <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={examBodyId} onChange={(e) => setExamBodyId(e.target.value)}>
              {examBodies.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Name
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Class
            <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Subject
            <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
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
            <div key={idx} className="grid items-end gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
              <label className="text-xs font-semibold text-slate-600">Type
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={section.type} onChange={(e) => setSections((prev) => prev.map((p, i) => i === idx ? { ...p, type: e.target.value as QuestionType } : p))}>
                  {typeOptions.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Count
                <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="number" min={1} value={section.count} onChange={(e) => setSections((prev) => prev.map((p, i) => i === idx ? { ...p, count: Number(e.target.value) } : p))} />
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
          <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold" onClick={() => setSections((prev) => [...prev, { type: "mcq", count: 1 }])}>+ Add Section</button>
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand/20">Save Blueprint</button>
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="font-bold text-slate-700">Saved Blueprints</h3>
        <AdminTable
          data={rows}
          keyExtractor={(b) => b.id}
          columns={[
            {
              header: "Name",
              render: (b) => <p className="font-semibold">{b.name}</p>
            },
            {
              header: "Type",
              className: "capitalize",
              render: (b) => b.exam_type
            },
            {
              header: "Structure",
              render: (b) => (
                <div className="flex flex-wrap gap-1">
                  {b.structure_json.sections.map((s, i) => (
                    <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                      {s.type}: {s.count}
                    </span>
                  ))}
                </div>
              )
            }
          ]}
        />
      </div>
    </div>
  );
}
