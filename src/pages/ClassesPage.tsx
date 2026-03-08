import { FormEvent, useEffect, useState } from "react";
import { addClass, deleteClass, getClassDeleteImpact, getClasses, getExamBodies, updateClassName } from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";
import type { ClassEntity, ExamBody } from "@/types/domain";

const quickClassLabels = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const chipColors = [
  "bg-rose-100 text-rose-700",
  "bg-orange-100 text-orange-700",
  "bg-amber-100 text-amber-700",
  "bg-lime-100 text-lime-700",
  "bg-emerald-100 text-emerald-700",
  "bg-cyan-100 text-cyan-700",
  "bg-sky-100 text-sky-700",
  "bg-blue-100 text-blue-700",
  "bg-indigo-100 text-indigo-700",
  "bg-violet-100 text-violet-700",
  "bg-pink-100 text-pink-700",
];
const classSuggestions = ["Pre-KG", "KG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "O Level", "A Level"];

export function ClassesPage() {
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const [rows, setRows] = useState<ClassEntity[]>([]);
  const [examBodies, setExamBodies] = useState<ExamBody[]>([]);
  const [examBodyId, setExamBodyId] = useState("");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function load() {
    if (!profile?.school_id) {
      return;
    }
    const bodies = await getExamBodies(profile.school_id);
    setExamBodies(bodies);
    const selectedBody = examBodyId || bodies[0]?.id || "";
    setExamBodyId(selectedBody);
    setRows(await getClasses(profile.school_id, selectedBody));
  }

  useEffect(() => {
    load();
  }, [profile?.school_id, examBodyId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!profile?.school_id || !name.trim() || !examBodyId) {
      return;
    }
    try {
      await addClass({ school_id: profile.school_id, exam_body_id: examBodyId, name: name.trim() });
      setName("");
      toast("success", "Class added");
      load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to add class");
    }
  }

  async function removeClass(id: string) {
    const impact = await getClassDeleteImpact(id);
    const ok = window.confirm(
      `Delete this class?\n\nThis will also remove:\n- Subjects: ${impact.subjects}\n- Chapters: ${impact.chapters}\n- Questions: ${impact.questions}`,
    );
    if (!ok) {
      return;
    }
    await deleteClass(id);
    toast("success", "Class removed");
    load();
  }

  async function saveEdit() {
    if (!editId) {
      return;
    }
    try {
      await updateClassName(editId, editName);
      toast("success", "Class updated");
      setEditId(null);
      setEditName("");
      load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update class");
    }
  }

  const filteredRows = rows.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Class Management</h2>
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-xs font-semibold text-slate-600">
          Exam Body
          <select className="mt-1 rounded-lg border border-slate-300 px-3 py-2" value={examBodyId} onChange={(e) => setExamBodyId(e.target.value)}>
            {examBodies.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-56 flex-1 text-xs font-semibold text-slate-600">
          Class Name
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" list="class-suggestions" value={name} onChange={(e) => setName(e.target.value)} placeholder="Class name" />
        </label>
        <datalist id="class-suggestions">
          {classSuggestions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        <button className="rounded-lg bg-brand px-4 py-2 text-white">Add Class</button>
      </form>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-sm font-semibold">Quick class labels</p>
        <div className="flex flex-wrap gap-2">
          {quickClassLabels.map((label, idx) => (
            <button
              key={label}
              type="button"
              onClick={() => setName(label === "KG" ? "KG" : `Class ${label}`)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${chipColors[idx % chipColors.length]}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Click a label or type a custom class name above.</p>
      </div>
      <label className="block text-xs font-semibold text-slate-600">
        Search Class
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to filter classes" />
      </label>
      <div className="rounded-xl border border-slate-200 bg-white">
        {filteredRows.map((row) => (
          <div key={row.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm last:border-b-0">
            {editId === row.id ? (
              <div className="flex w-full items-center gap-2">
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={editName} onChange={(e) => setEditName(e.target.value)} />
                <button type="button" onClick={saveEdit} className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditId(null);
                    setEditName("");
                  }}
                  className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <span>{row.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(row.id);
                      setEditName(row.name);
                    }}
                    className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700"
                  >
                    Edit
                  </button>
                  <button type="button" onClick={() => removeClass(row.id)} className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                    Remove
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
