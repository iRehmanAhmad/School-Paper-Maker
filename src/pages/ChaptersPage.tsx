import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addChapter, addChapters, deleteChapter, getChapterDeleteImpact, getQuestionCountsByChapter, reorderChapters, updateChapter } from "@/services/repositories";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ContextBreadcrumbs } from "@/components/ContextBreadcrumbs";
import { EmptyState } from "@/components/EmptyState";
import { useHierarchyScopeParams } from "@/hooks/useHierarchyScopeParams";
import { useUndoDeleteQueue } from "@/hooks/useUndoDeleteQueue";
import { generateSyllabus } from "@/services/ai";
import { useAppStore } from "@/store/useAppStore";
import { useHierarchy } from "@/hooks/useHierarchy";
import { hierarchyScopeToSearch } from "@/utils/hierarchyScope";
import type { ChapterEntity } from "@/types/domain";

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

function getCoverageMeta(questionCount: number) {
  if (questionCount < 5) {
    return {
      label: "Low",
      barClass: "bg-red-500",
      textClass: "text-red-700",
    };
  }
  if (questionCount > 20) {
    return {
      label: "Healthy",
      barClass: "bg-emerald-500",
      textClass: "text-emerald-700",
    };
  }
  return {
    label: "Moderate",
    barClass: "bg-amber-500",
    textClass: "text-amber-700",
  };
}

export function ChaptersPage() {
  const navigate = useNavigate();
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const { scope, mergeScope, clearFrom, scopeToLevel } = useHierarchyScopeParams();
  const { queueDelete } = useUndoDeleteQueue();

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
  } = useHierarchy(profile?.school_id, { initialScope: scope, autoSelectFirst: false });

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
  const [orderedRows, setOrderedRows] = useState<ChapterEntity[]>([]);
  const [questionCountByChapter, setQuestionCountByChapter] = useState<Record<string, number>>({});
  const [loadingQuestionCounts, setLoadingQuestionCounts] = useState(false);
  const [dragChapterId, setDragChapterId] = useState<string | null>(null);
  const [dragOverChapterId, setDragOverChapterId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; message: string; countSnapshot: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const searchValue = search.trim().toLowerCase();
  const searchActive = !!searchValue;

  useEffect(() => {
    const next = [...allChapters].sort((a, b) => a.chapter_number - b.chapter_number);
    setOrderedRows(next);
    setNumber(next.length ? Math.max(...next.map((x) => x.chapter_number)) + 1 : 1);
  }, [allChapters]);

  useEffect(() => {
    if (!profile?.school_id || !orderedRows.length) {
      setQuestionCountByChapter({});
      return;
    }

    let ignore = false;
    const chapterIds = orderedRows.map((row) => row.id);
    setLoadingQuestionCounts(true);
    getQuestionCountsByChapter(profile.school_id, chapterIds)
      .then((counts) => {
        if (!ignore) {
          setQuestionCountByChapter(counts);
        }
      })
      .catch(() => {
        if (!ignore) {
          toast("error", "Failed to load chapter question counts");
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoadingQuestionCounts(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [profile?.school_id, orderedRows]);

  const filteredRows = useMemo(
    () =>
      orderedRows.filter((ch) => {
        return !searchValue || ch.title.toLowerCase().includes(searchValue) || String(ch.chapter_number).includes(searchValue);
      }),
    [orderedRows, searchValue]
  );
  const selectedBodyName = examBodies.find((item) => item.id === examBodyId)?.name;
  const selectedClassName = classes.find((item) => item.id === classId)?.name;
  const selectedSubjectName = subjects.find((item) => item.id === subjectId)?.name;
  const selectedScopeChapterName = orderedRows.find((item) => item.id === scope.chapterId)?.title;

  function buildReorderedRows(sourceId: string, targetId: string) {
    const current = [...orderedRows];
    const sourceIndex = current.findIndex((row) => row.id === sourceId);
    const targetIndex = current.findIndex((row) => row.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
      return null;
    }
    const [moved] = current.splice(sourceIndex, 1);
    current.splice(targetIndex, 0, moved);
    return current.map((row, idx) => ({ ...row, chapter_number: idx + 1 }));
  }

  function onDragStartChapter(e: DragEvent<HTMLTableRowElement>, chapterId: string) {
    if (searchActive || reordering || editId !== null) {
      e.preventDefault();
      return;
    }
    setDragChapterId(chapterId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", chapterId);
  }

  function onDragOverChapter(e: DragEvent<HTMLTableRowElement>, chapterId: string) {
    if (!dragChapterId || dragChapterId === chapterId || searchActive || reordering || editId !== null) return;
    e.preventDefault();
    setDragOverChapterId(chapterId);
  }

  async function onDropChapter(e: DragEvent<HTMLTableRowElement>, targetChapterId: string) {
    e.preventDefault();
    const sourceId = dragChapterId || e.dataTransfer.getData("text/plain");
    setDragOverChapterId(null);
    setDragChapterId(null);
    if (!sourceId || sourceId === targetChapterId || !subjectId) return;
    const next = buildReorderedRows(sourceId, targetChapterId);
    if (!next) return;

    const prev = orderedRows;
    setOrderedRows(next);
    setReordering(true);
    try {
      await reorderChapters(subjectId, next.map((row) => row.id));
      toast("success", "Chapter order updated");
    } catch (error) {
      setOrderedRows(prev);
      toast("error", error instanceof Error ? error.message : "Failed to reorder chapters");
    } finally {
      setReordering(false);
    }
  }

  function onDragEndChapter() {
    setDragChapterId(null);
    setDragOverChapterId(null);
  }

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
      const currentMax = orderedRows.length > 0 ? Math.max(...orderedRows.map(c => c.chapter_number)) : 0;
      const payload = selectedAiChapters.map((title: string, idx: number) => ({
        subject_id: subjectId,
        title: title.trim(),
        chapter_number: currentMax + idx + 1
      }));
      const inserted = await addChapters(payload);
      setOrderedRows((prev) => [...prev, ...inserted].sort((a, b) => a.chapter_number - b.chapter_number));
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
      const inserted = await addChapter({ subject_id: subjectId, title: title.trim(), chapter_number: number });
      setOrderedRows((prev) => [...prev, inserted].sort((a, b) => a.chapter_number - b.chapter_number));
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
    setDeleteTarget({
      id,
      message: `Delete this chapter?\n\nThis will also remove:\n- Questions: ${impact.questions}`,
      countSnapshot: questionCountByChapter[id] || 0,
    });
  }

  function commitDelete() {
    if (!deleteTarget) return;
    const snapshot = orderedRows.find((row) => row.id === deleteTarget.id);
    if (!snapshot) {
      setDeleteTarget(null);
      return;
    }
    setIsDeleting(true);
    setOrderedRows((prev) => prev.filter((row) => row.id !== deleteTarget.id));
    setQuestionCountByChapter((prev) => {
      const next = { ...prev };
      delete next[deleteTarget.id];
      return next;
    });
    queueDelete({
      label: "Chapter",
      commit: () => deleteChapter(deleteTarget.id),
      rollback: () => {
        setOrderedRows((prev) => [...prev, snapshot].sort((a, b) => a.chapter_number - b.chapter_number));
        setQuestionCountByChapter((prev) => ({ ...prev, [snapshot.id]: deleteTarget.countSnapshot }));
      },
      successMessage: "Chapter deleted",
      failureMessage: "Failed to delete chapter",
    });
    if (scope.chapterId === deleteTarget.id) {
      clearFrom("chapterId");
    }
    setDeleteTarget(null);
    setIsDeleting(false);
  }

  async function saveEdit() {
    if (!editId) return;
    try {
      await updateChapter(editId, { title: editTitle, chapter_number: editNumber });
      setOrderedRows((prev) =>
        prev
          .map((row) => (row.id === editId ? { ...row, title: editTitle, chapter_number: editNumber } : row))
          .sort((a, b) => a.chapter_number - b.chapter_number)
      );
      toast("success", "Chapter updated");
      setEditId(null);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update chapter");
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Chapter Management</h2>
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
            value: selectedScopeChapterName || "All Chapters",
            selected: !!scope.chapterId,
            count: orderedRows.length,
            onSelect: () => navigate({ pathname: "/question-bank", search: hierarchyScopeToSearch(scopeToLevel("chapterId")) }),
            onClear: () => clearFrom("chapterId"),
          },
        ]}
      />
      <form onSubmit={submit} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[200px_150px_180px_1fr_100px_auto]">
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
        <label className="text-xs font-semibold text-slate-600">Class
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={classId}
            onChange={(e) => {
              const nextClass = e.target.value;
              setClassId(nextClass);
              mergeScope({ examBodyId: examBodyId || undefined, classId: nextClass || undefined, subjectId: undefined, chapterId: undefined });
            }}
          >
            <option value="">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Subject
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={subjectId}
            onChange={(e) => {
              const nextSubject = e.target.value;
              setSubjectId(nextSubject);
              mergeScope({ examBodyId: examBodyId || undefined, classId: classId || undefined, subjectId: nextSubject || undefined, chapterId: undefined });
            }}
          >
            <option value="">All Subjects</option>
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

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <p>
            {searchActive
              ? "Drag reorder is disabled while search is active."
              : "Tip: drag rows using the handle to reorder chapter numbers."}
          </p>
          {loadingQuestionCounts && <p className="font-semibold">Loading question counts...</p>}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="w-12 px-4 py-3">Move</th>
                  <th className="w-20 px-4 py-3">No.</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="w-28 px-4 py-3 text-center">Questions</th>
                  <th className="w-64 px-4 py-3">Coverage</th>
                  <th className="w-44 px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-4">
                      <EmptyState title="No chapters found" description="Add a chapter for the selected subject." />
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const questionCount = questionCountByChapter[row.id] ?? 0;
                    const coverage = getCoverageMeta(questionCount);
                    const progress = Math.max(6, Math.min(100, Math.round((questionCount / 20) * 100)));
                    const isEditing = editId === row.id;
                    const dragDisabled = searchActive || reordering || editId !== null;

                    return (
                      <tr
                        key={row.id}
                        draggable={!dragDisabled}
                        onDragStart={(e) => onDragStartChapter(e, row.id)}
                        onDragOver={(e) => onDragOverChapter(e, row.id)}
                        onDrop={(e) => onDropChapter(e, row.id)}
                        onDragEnd={onDragEndChapter}
                        className={`hover:bg-slate-50/70 ${dragOverChapterId === row.id ? "bg-brand/5" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <span className={`inline-flex select-none rounded border px-2 py-1 text-xs ${dragDisabled ? "cursor-not-allowed border-slate-200 text-slate-300" : "cursor-grab border-slate-300 text-slate-500"}`}>
                            ::
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input type="number" className="w-full rounded border px-2 py-1" value={editNumber} onChange={(e) => setEditNumber(Number(e.target.value))} />
                          ) : (
                            row.chapter_number
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input className="w-full rounded border px-2 py-1" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                          ) : (
                            row.title
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex min-w-12 justify-center rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                            {questionCount}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full ${coverage.barClass}`} style={{ width: `${progress}%` }} />
                            </div>
                            <p className={`text-[11px] font-semibold ${coverage.textClass}`}>
                              {coverage.label} pool
                              <span className="ml-1 text-slate-500">({questionCount} questions)</span>
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                mergeScope({
                                  examBodyId: examBodyId || undefined,
                                  classId: classId || undefined,
                                  subjectId: subjectId || undefined,
                                  chapterId: row.id,
                                });
                                toast("success", "Context set to this chapter");
                              }}
                              className="rounded bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-indigo-700 hover:bg-indigo-100"
                            >
                              Use Context
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditing) {
                                  saveEdit();
                                } else {
                                  setEditId(row.id);
                                  setEditTitle(row.title);
                                  setEditNumber(row.chapter_number);
                                }
                              }}
                              className="rounded bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-amber-700 hover:bg-amber-100"
                            >
                              {isEditing ? "Save" : "Edit"}
                            </button>
                            {isEditing && (
                              <button
                                type="button"
                                onClick={() => setEditId(null)}
                                className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-slate-600 hover:bg-slate-200"
                              >
                                Cancel
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeChapter(row.id)}
                              className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Delete
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
      <ConfirmModal
        open={!!deleteTarget}
        title="Confirm Delete"
        message={deleteTarget?.message || ""}
        confirmLabel="Delete"
        loading={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={commitDelete}
      />
    </div>
  );
}
