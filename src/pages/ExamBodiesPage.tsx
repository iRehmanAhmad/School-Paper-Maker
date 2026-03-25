import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addExamBody, deleteExamBody, getClasses, getExamBodies, getExamBodyDeleteImpact, getSubjects, updateExamBodyName } from "@/services/repositories";
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

type ExamBodyKind = "govt" | "federal" | "cambridge" | "textbook" | "other";

function getExamBodyKind(name: string): ExamBodyKind {
  const lower = name.toLowerCase();
  if (lower.includes("cambridge")) return "cambridge";
  if (lower.includes("federal") || lower.includes("fbise")) return "federal";
  if (lower.includes("textbook")) return "textbook";
  if (
    lower.includes("govt") ||
    lower.includes("punjab") ||
    lower.includes("sindh") ||
    lower.includes("kpk") ||
    lower.includes("balochistan")
  ) {
    return "govt";
  }
  return "other";
}

function getExamBodyKindBadge(kind: ExamBodyKind) {
  if (kind === "cambridge") {
    return { label: "Cambridge", className: "bg-violet-100 text-violet-700" };
  }
  if (kind === "federal") {
    return { label: "Federal", className: "bg-sky-100 text-sky-700" };
  }
  if (kind === "textbook") {
    return { label: "Textbook", className: "bg-amber-100 text-amber-700" };
  }
  if (kind === "govt") {
    return { label: "Govt", className: "bg-emerald-100 text-emerald-700" };
  }
  return { label: "Other", className: "bg-slate-100 text-slate-700" };
}

function formatDateShort(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export function ExamBodiesPage() {
  const navigate = useNavigate();
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const { scope, clearFrom, scopeToLevel } = useHierarchyScopeParams();
  const { queueDelete } = useUndoDeleteQueue();
  const [rows, setRows] = useState<ExamBody[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [classCountByBody, setClassCountByBody] = useState<Record<string, number>>({});
  const [subjectCountByBody, setSubjectCountByBody] = useState<Record<string, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function load() {
    if (!profile?.school_id) {
      return;
    }
    try {
      const examBodies = await getExamBodies(profile.school_id);
      setRows(examBodies);

      const classes = await getClasses(profile.school_id);
      const classCounts = classes.reduce<Record<string, number>>((acc, row) => {
        acc[row.exam_body_id] = (acc[row.exam_body_id] || 0) + 1;
        return acc;
      }, {});
      setClassCountByBody(classCounts);

      if (!classes.length) {
        setSubjectCountByBody({});
        return;
      }

      const subjects = await getSubjects(classes.map((row) => row.id));
      const classToBody = new Map(classes.map((row) => [row.id, row.exam_body_id]));
      const subjectCounts = subjects.reduce<Record<string, number>>((acc, row) => {
        const examBodyId = classToBody.get(row.class_id);
        if (!examBodyId) return acc;
        acc[examBodyId] = (acc[examBodyId] || 0) + 1;
        return acc;
      }, {});
      setSubjectCountByBody(subjectCounts);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to load exam bodies");
    }
  }

  useEffect(() => {
    load();
  }, [profile?.school_id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!profile?.school_id || !name.trim()) {
      return;
    }
    const nextName = name.trim();
    if (rows.some((row) => row.name.trim().toLowerCase() === nextName.toLowerCase())) {
      toast("error", "This exam body already exists");
      return;
    }
    try {
      await addExamBody({ school_id: profile.school_id, name: nextName });
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
  const sortedRows = [...filteredRows].sort((a, b) => a.name.localeCompare(b.name));
  const selectedScopeBodyName = rows.find((row) => row.id === scope.examBodyId)?.name;
  const normalizedName = name.trim().toLowerCase();
  const duplicateRow = normalizedName ? rows.find((row) => row.name.trim().toLowerCase() === normalizedName) : null;
  const canAdd = Boolean(profile?.school_id && name.trim() && !duplicateRow);
  const visibleSuggestionChips = examBodySuggestions.slice(0, 8);

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
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600">
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
            {duplicateRow ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Already exists: {duplicateRow.name}
              </p>
            ) : null}
            <button
              disabled={!canAdd}
              className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add Exam Body
            </button>
          </form>
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Quick Suggestions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {visibleSuggestionChips.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setName(item)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-brand/40 hover:text-brand"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Existing Exam Bodies</h3>
              <p className="text-xs text-slate-500">{sortedRows.length} of {rows.length} shown</p>
            </div>
            <label className="w-full max-w-sm text-xs font-semibold text-slate-600">
              Search
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to filter exam bodies"
              />
            </label>
          </div>

          <div className="mt-3 space-y-3">
            {sortedRows.length === 0 ? (
              <EmptyState title="No exam bodies found" description="Create an exam body to continue with classes, subjects, and chapters." />
            ) : (
              sortedRows.map((row) => {
                const kind = getExamBodyKind(row.name);
                const badge = getExamBodyKindBadge(kind);
                const classCount = classCountByBody[row.id] || 0;
                const subjectCount = subjectCountByBody[row.id] || 0;
                return (
                  <article key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/30 p-3">
                    {editId === row.id ? (
                      <div className="flex w-full flex-wrap items-center gap-2">
                        <input className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-2" value={editName} onChange={(e) => setEditName(e.target.value)} />
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
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold text-slate-800">
                              {row.name}
                              <span className="ml-1 text-[11px] font-medium text-slate-500">
                                (Updated {formatDateShort(row.created_at)})
                              </span>
                            </h4>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                              Total Classes: {classCount}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                              Total Subjects: {subjectCount}
                            </span>
                          </div>
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
                        </div>
                      </>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>
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
