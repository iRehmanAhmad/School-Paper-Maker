import { FormEvent, useState } from "react";
import { addChapter, addChapters, deleteChapter, getChapterDeleteImpact, updateChapter } from "@/services/repositories";
import { generateSyllabus } from "@/services/ai";
import { useAppStore } from "@/store/useAppStore";
import { useHierarchy } from "@/hooks/useHierarchy";
import { AdminTable } from "@/components/AdminTable";

const chapterSuggestions = [
  "Introduction",
  "Numbers and Operations",
  "Algebra",
  "Geometry",
  "Mensuration",
  "Data Handling",
  "Matter",
  "Force and Motion",
  "Human Body",
  "Plants",
  "Environment",
  "Electricity",
  "Chemical Reactions",
  "Cell and Tissues",
  "History of Pakistan",
  "Geography of Pakistan",
  "Civics and Citizenship",
  "Islamic Teachings",
];

export function ChaptersPage() {
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);

  const {
    examBodies,
    classes,
    subjects,
    chapters: allChapters,
    examBodyId,
    setExamBodyId,
    classId,
    setClassId,
    subjectId,
    setSubjectId,
  } = useHierarchy(profile?.school_id);

  const [title, setTitle] = useState("");
  const [number, setNumber] = useState(1);
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNumber, setEditNumber] = useState(1);
  const [showAiSyllabus, setShowAiSyllabus] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiChapters, setAiChapters] = useState<string[]>([]);
  const [selectedAiChapters, setSelectedAiChapters] = useState<string[]>([]);

  async function handleAiSuggest() {
    if (!subjectId) return toast("error", "Select a subject first");
    const subj = subjects.find(s => s.id === subjectId);
    const cls = classes.find(c => c.id === classId);
    const body = examBodies.find(b => b.id === examBodyId);
    if (!subj || !cls || !body) return;

    setAiLoading(true);
    setShowAiSyllabus(true);
    try {
      const resp = await generateSyllabus({
        examBody: body.name,
        className: cls.name,
        subjectName: subj.name
      });
      setAiChapters(resp);
      setSelectedAiChapters(resp);
    } catch (error) {
      toast("error", "Failed to get AI suggestions");
    } finally {
      setAiLoading(false);
    }
  }

  async function bulkAddChapters() {
    if (!subjectId || !selectedAiChapters.length) return;
    try {
      const currentMax = allChapters.length > 0 ? Math.max(...allChapters.map(c => c.chapter_number)) : 0;
      const payload = selectedAiChapters.map((title: string, idx: number) => ({
        subject_id: subjectId,
        title: title.trim(),
        chapter_number: currentMax + idx + 1
      }));
      await addChapters(payload);
      toast("success", `Added ${payload.length} chapters`);
      setShowAiSyllabus(false);
      setAiChapters([]);
      setSelectedAiChapters([]);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Bulk add failed");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!subjectId || !title.trim()) {
      return;
    }
    try {
      await addChapter({ subject_id: subjectId, title: title.trim(), chapter_number: number });
      setTitle("");
      setNumber((n: number) => n + 1);
      toast("success", "Chapter added");
      // Note: useHierarchy handles re-fetching via its internal effects
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to add chapter");
    }
  }

  async function removeChapter(id: string) {
    const impact = await getChapterDeleteImpact(id);
    const ok = window.confirm(`Delete this chapter?\n\nThis will also remove:\n- Questions: ${impact.questions}`);
    if (!ok) return;
    await deleteChapter(id);
    toast("success", "Chapter removed");
  }

  async function saveEdit() {
    if (!editId) return;
    try {
      await updateChapter(editId, { title: editTitle, chapter_number: editNumber });
      toast("success", "Chapter updated");
      setEditId(null);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update chapter");
    }
  }

  const filteredRows = allChapters.filter((ch) => {
    const searchValue = search.trim().toLowerCase();
    return !searchValue || ch.title.toLowerCase().includes(searchValue) || String(ch.chapter_number).includes(searchValue);
  });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Chapter Management</h2>
      <form onSubmit={submit} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[200px_150px_180px_1fr_100px_auto]">
        <label className="text-xs font-semibold text-slate-600">Exam Body
          <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={examBodyId} onChange={(e) => setExamBodyId(e.target.value)}>
            {examBodies.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
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
        <label className="text-xs font-semibold text-slate-600">Chapter Title
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" list="chapter-suggestions" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chapter title" />
        </label>
        <datalist id="chapter-suggestions">
          {chapterSuggestions.map((item) => <option key={item} value={item} />)}
        </datalist>
        <label className="text-xs font-semibold text-slate-600">Number
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="number" value={number} onChange={(e) => setNumber(Number(e.target.value))} />
        </label>
        <button className="h-10 self-end rounded-lg bg-brand px-4 py-2 text-white">Add</button>
        <button
          type="button"
          onClick={handleAiSuggest}
          className="flex h-10 items-center justify-center gap-2 self-end rounded-lg border-2 border-brand/20 bg-brand/5 px-4 py-2 text-xs font-bold text-brand transition-all hover:bg-brand/10"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          AI SYLLABUS
        </button>
      </form>

      <div className="flex items-center gap-4">
        <label className="flex-1 text-xs font-semibold text-slate-600">Search Chapter
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type title or chapter number" />
        </label>
      </div>

      <AdminTable
        data={filteredRows}
        keyExtractor={(item) => item.id}
        columns={[
          {
            header: "No.",
            className: "w-20",
            render: (row) => editId === row.id ? (
              <input type="number" className="w-full rounded border px-2 py-1" value={editNumber} onChange={(e) => setEditNumber(Number(e.target.value))} />
            ) : row.chapter_number
          },
          {
            header: "Title",
            render: (row) => editId === row.id ? (
              <input className="w-full rounded border px-2 py-1" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            ) : row.title
          }
        ]}
        onEdit={(row) => {
          if (editId === row.id) {
            saveEdit();
          } else {
            setEditId(row.id);
            setEditTitle(row.title);
            setEditNumber(row.chapter_number);
          }
        }}
        onDelete={(row) => removeChapter(row.id)}
      />

      {/* AI Syllabus Selection Overlay */}
      {showAiSyllabus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 grow-0">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-brand/10 text-brand">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </span>
                  AI Syllabus Suggestions
                </h3>
                <p className="text-xs font-medium text-slate-500">Standard chapters for {subjects.find(s => s.id === subjectId)?.name}</p>
              </div>
              <button onClick={() => setShowAiSyllabus(false)} className="rounded-full p-2 hover:bg-slate-100">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                <p className="mt-4 text-sm font-bold text-slate-500">Consulting AI Knowledge...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="max-h-[300px] space-y-2 overflow-y-auto pr-2">
                  {aiChapters.map((ch: string) => (
                    <label key={ch} className="group flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 transition-all hover:border-brand/40 hover:bg-white">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                          checked={selectedAiChapters.includes(ch)}
                          onChange={(e) => e.target.checked ? setSelectedAiChapters((p: string[]) => [...p, ch]) : setSelectedAiChapters((p: string[]) => p.filter((x: string) => x !== ch))}
                        />
                        <span className="text-sm font-semibold text-slate-700">{ch}</span>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setSelectedAiChapters(aiChapters.length === selectedAiChapters.length ? [] : [...aiChapters])}
                    className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    {aiChapters.length === selectedAiChapters.length ? "Deselect All" : "Select All"}
                  </button>
                  <button
                    onClick={bulkAddChapters}
                    disabled={!selectedAiChapters.length}
                    className="flex-[2] rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                  >
                    Add {selectedAiChapters.length} Chapters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
