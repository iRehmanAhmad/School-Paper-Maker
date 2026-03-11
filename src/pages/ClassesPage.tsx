import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addClass, deleteClass, getClassDeleteImpact, getClasses, getExamBodies, updateClassName } from "@/services/repositories";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ContextBreadcrumbs } from "@/components/ContextBreadcrumbs";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonList } from "@/components/ui/skeleton";
import { useHierarchyScopeParams } from "@/hooks/useHierarchyScopeParams";
import { useUndoDeleteQueue } from "@/hooks/useUndoDeleteQueue";
import { useAppStore } from "@/store/useAppStore";
import { hierarchyScopeToSearch } from "@/utils/hierarchyScope";
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

function findSuggestion(value: string, suggestions: string[]) {
  const needle = value.trim().toLowerCase();
  if (!needle) return "";
  return suggestions.find((item) => item.toLowerCase().startsWith(needle)) || "";
}

export function ClassesPage() {
  const navigate = useNavigate();
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const { scope, mergeScope, clearFrom, scopeToLevel } = useHierarchyScopeParams();
  const { queueDelete } = useUndoDeleteQueue();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ClassEntity[]>([]);
  const [examBodies, setExamBodies] = useState<ExamBody[]>([]);
  const [examBodyId, setExamBodyId] = useState("");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setExamBodyId(scope.examBodyId || "");
  }, [scope.examBodyId]);

  async function load() {
    if (!profile?.school_id) {
      return;
    }
    setLoading(true);
    try {
      const bodies = await getExamBodies(profile.school_id);
      setExamBodies(bodies);
      const selectedBody = examBodyId && bodies.some((b) => b.id === examBodyId) ? examBodyId : "";
      if (examBodyId && !selectedBody) {
        setExamBodyId("");
        clearFrom("examBodyId");
      }
      setRows(await getClasses(profile.school_id, selectedBody || undefined));
    } finally {
      setLoading(false);
    }
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
    setDeleteTarget({
      id,
      message: `Delete this class?\n\nThis will also remove:\n- Subjects: ${impact.subjects}\n- Chapters: ${impact.chapters}\n- Questions: ${impact.questions}`,
    });
  }

  function rollbackRow(snapshot: ClassEntity) {
    setRows((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)]);
  }

  function commitDelete() {
    if (!deleteTarget) return;
    const snapshot = rows.find((item) => item.id === deleteTarget.id);
    if (!snapshot) {
      setDeleteTarget(null);
      return;
    }
    setIsDeleting(true);
    setRows((prev) => prev.filter((item) => item.id !== deleteTarget.id));
    queueDelete({
      label: "Class",
      commit: () => deleteClass(deleteTarget.id),
      rollback: () => rollbackRow(snapshot),
      successMessage: "Class deleted",
      failureMessage: "Failed to delete class",
    });
    if (scope.classId === deleteTarget.id) {
      clearFrom("classId");
    }
    setDeleteTarget(null);
    setIsDeleting(false);
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

  function onClassNameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Tab") return;
    const suggestion = findSuggestion(name, classSuggestions);
    if (!suggestion) return;
    if (suggestion.toLowerCase() === name.trim().toLowerCase()) return;
    e.preventDefault();
    setName(suggestion);
  }

  const filteredRows = rows.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase()));
  const selectedBodyName = examBodies.find((item) => item.id === examBodyId)?.name;
  const selectedScopeClassName = rows.find((item) => item.id === scope.classId)?.name;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Class Management</h2>
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
            value: selectedScopeClassName || "All Classes",
            selected: !!scope.classId,
            count: rows.length,
            onSelect: () => navigate({ pathname: "/classes", search: hierarchyScopeToSearch(scopeToLevel("classId")) }),
            onClear: () => clearFrom("classId"),
          },
          {
            label: "Subject",
            value: scope.subjectId ? "Selected Subject" : "All Subjects",
            selected: !!scope.subjectId,
            onSelect: () => navigate({ pathname: "/subjects", search: hierarchyScopeToSearch(scopeToLevel("subjectId")) }),
            onClear: () => clearFrom("subjectId"),
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
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-xs font-semibold text-slate-600">
          Exam Body
          <select
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
            value={examBodyId}
            onChange={(e) => {
              const nextBody = e.target.value;
              setExamBodyId(nextBody);
              mergeScope({ examBodyId: nextBody || undefined, classId: undefined, subjectId: undefined, chapterId: undefined });
            }}
          >
            <option value="">All Exam Bodies</option>
            {examBodies.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-56 flex-1 text-xs font-semibold text-slate-600">
          Class Name
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onClassNameKeyDown}
            autoComplete="off"
            placeholder="Class name (type then Tab to autocomplete)"
          />
        </label>
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
        {loading ? (
          <div className="p-4">
            <SkeletonList items={5} />
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState title="No classes found" description="Add a class for the selected exam body to continue." />
        ) : (
          filteredRows.map((row) => (
            <div key={row.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm last:border-b-0">
              {editId === row.id ? (
                <div className="flex w-full items-center gap-2">
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700"
                  >
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
                        setExamBodyId(row.exam_body_id);
                        mergeScope({ examBodyId: row.exam_body_id, classId: row.id, subjectId: undefined, chapterId: undefined });
                        toast("success", "Context set to this class");
                      }}
                      className="rounded bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700"
                    >
                      Use Context
                    </button>
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
          ))
        )}
      </div>
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
