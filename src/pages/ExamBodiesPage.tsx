import { FormEvent, useEffect, useState } from "react";
import { addExamBody, deleteExamBody, getExamBodies, getExamBodyDeleteImpact, updateExamBodyName } from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";
import type { ExamBody } from "@/types/domain";

const examBodySuggestions = [
  "Punjab Govt",
  "Sindh Govt",
  "KPK Govt",
  "Balochistan Govt",
  "Federal Board (FBISE)",
  "Punjab Textbook Board",
  "Sindh Textbook Board",
  "KPK Textbook Board",
  "AJK Board",
  "Cambridge O Level",
  "Cambridge A Level",
];

export function ExamBodiesPage() {
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const [rows, setRows] = useState<ExamBody[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function load() {
    if (!profile?.school_id) {
      return;
    }
    setRows(await getExamBodies(profile.school_id));
  }

  useEffect(() => {
    load();
  }, [profile?.school_id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!profile?.school_id || !name.trim()) {
      return;
    }
    try {
      await addExamBody({ school_id: profile.school_id, name: name.trim() });
      setName("");
      toast("success", "Exam body added");
      load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to add exam body");
    }
  }

  async function removeBody(id: string) {
    const impact = await getExamBodyDeleteImpact(id);
    const ok = window.confirm(
      `Delete this exam body?\n\nThis will also remove:\n- Classes: ${impact.classes}\n- Subjects: ${impact.subjects}\n- Chapters: ${impact.chapters}\n- Questions: ${impact.questions}`,
    );
    if (!ok) {
      return;
    }
    await deleteExamBody(id);
    toast("success", "Exam body removed");
    load();
  }

  async function saveEdit() {
    if (!editId) {
      return;
    }
    try {
      await updateExamBodyName(editId, editName);
      toast("success", "Exam body updated");
      setEditId(null);
      setEditName("");
      load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update exam body");
    }
  }

  const filteredRows = rows.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Add Exam Body</h2>
      <form onSubmit={submit} className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <label className="min-w-64 flex-1 text-xs font-semibold text-slate-600">
          Exam Body Name
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            list="exam-body-suggestions"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Punjab Govt"
          />
        </label>
        <datalist id="exam-body-suggestions">
          {examBodySuggestions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        <button className="rounded-lg bg-brand px-4 py-2 text-white">Add</button>
      </form>
      <label className="block text-xs font-semibold text-slate-600">
        Search Exam Body
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type to filter exam bodies"
        />
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
                  <button type="button" onClick={() => removeBody(row.id)} className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
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
