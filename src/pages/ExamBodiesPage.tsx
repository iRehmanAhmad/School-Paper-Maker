import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addExamBody, deleteExamBody, getExamBodies, getExamBodyDeleteImpact, updateExamBodyName } from "@/services/repositories";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ContextBreadcrumbs } from "@/components/ContextBreadcrumbs";
import { EmptyState } from "@/components/EmptyState";
import { GhostAutocompleteInput } from "@/components/GhostAutocompleteInput";
import { useHierarchyScopeParams } from "@/hooks/useHierarchyScopeParams";
import { useUndoDeleteQueue } from "@/hooks/useUndoDeleteQueue";
import { useAppStore } from "@/store/useAppStore";
import { hierarchyScopeToSearch } from "@/utils/hierarchyScope";
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

function findSuggestion(value: string, suggestions: string[]) {
  const needle = value.trim().toLowerCase();
  if (!needle) return "";
  return suggestions.find((item) => item.toLowerCase().startsWith(needle)) || "";
}

export function ExamBodiesPage() {
  const navigate = useNavigate();
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const { scope, mergeScope, clearFrom, scopeToLevel } = useHierarchyScopeParams();
  const { queueDelete } = useUndoDeleteQueue();
  const [rows, setRows] = useState<ExamBody[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    setDeleteTarget({
      id,
      message: `Delete this exam body?\n\nThis will also remove:\n- Classes: ${impact.classes}\n- Subjects: ${impact.subjects}\n- Chapters: ${impact.chapters}\n- Questions: ${impact.questions}`,
    });
  }

  function rollbackRow(snapshot: ExamBody) {
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
      label: "Exam body",
      commit: () => deleteExamBody(deleteTarget.id),
      rollback: () => rollbackRow(snapshot),
      successMessage: "Exam body deleted",
      failureMessage: "Failed to delete exam body",
    });
    if (scope.examBodyId === deleteTarget.id) {
      clearFrom("examBodyId");
    }
    setDeleteTarget(null);
    setIsDeleting(false);
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

  function onExamBodyNameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Tab") return;
    const suggestion = findSuggestion(name, examBodySuggestions);
    if (!suggestion) return;
    if (suggestion.toLowerCase() === name.trim().toLowerCase()) return;
    e.preventDefault();
    setName(suggestion);
  }

  const filteredRows = rows.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase()));
  const selectedScopeBodyName = rows.find((row) => row.id === scope.examBodyId)?.name;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Add Exam Body</h2>
      <ContextBreadcrumbs
        items={[
          {
            label: "Exam Body",
            value: selectedScopeBodyName || "All Exam Bodies",
            selected: !!scope.examBodyId,
            count: rows.length,
            onSelect: () => navigate({ pathname: "/exam-bodies", search: hierarchyScopeToSearch(scopeToLevel("examBodyId")) }),
            onClear: () => clearFrom("examBodyId"),
          },
          {
            label: "Class",
            value: scope.classId ? "Selected Class" : "All Classes",
            selected: !!scope.classId,
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
      <form onSubmit={submit} className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <label className="min-w-64 flex-1 text-xs font-semibold text-slate-600">
          Exam Body Name
          <GhostAutocompleteInput
            className="mt-1"
            value={name}
            onChange={setName}
            suggestion={findSuggestion(name, examBodySuggestions)}
            onKeyDown={onExamBodyNameKeyDown}
            placeholder="e.g. Punjab Govt (Tab to autocomplete)"
          />
        </label>
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
        {filteredRows.length === 0 ? (
          <EmptyState title="No exam bodies found" description="Create an exam body to continue with classes, subjects, and chapters." />
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
                        mergeScope({ examBodyId: row.id, classId: undefined, subjectId: undefined, chapterId: undefined });
                        toast("success", "Context set to this exam body");
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
                    <button type="button" onClick={() => removeBody(row.id)} className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
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
