import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addSubject, deleteSubject, getClasses, getExamBodies, getSubjectDeleteImpact, getSubjects, updateSubjectName } from "@/services/repositories";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ContextBreadcrumbs } from "@/components/ContextBreadcrumbs";
import { EmptyState } from "@/components/EmptyState";
import { useHierarchyScopeParams } from "@/hooks/useHierarchyScopeParams";
import { useUndoDeleteQueue } from "@/hooks/useUndoDeleteQueue";
import { useAppStore } from "@/store/useAppStore";
import { hierarchyScopeToSearch } from "@/utils/hierarchyScope";
import type { ClassEntity, ExamBody, SubjectEntity } from "@/types/domain";

const pakistanSubjects = [
  "Urdu",
  "English",
  "Mathematics",
  "General Science",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "Islamiat",
  "Pakistan Studies",
  "Social Studies",
  "History",
  "Geography",
  "Civics",
  "Economics",
  "Commerce",
  "Accounting",
  "Business Studies",
  "Statistics",
  "Education",
  "Arabic",
  "Persian",
  "Punjabi",
  "Sindhi",
  "Pashto",
  "Balochi",
  "Siraiki",
  "Home Economics",
  "Fine Arts",
  "Drawing",
  "Physical Education",
  "Ethics",
  "Quran",
  "Tajweed",
];

export function SubjectsPage() {
  const navigate = useNavigate();
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const { scope, mergeScope, clearFrom, scopeToLevel } = useHierarchyScopeParams();
  const { queueDelete } = useUndoDeleteQueue();
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [examBodies, setExamBodies] = useState<ExamBody[]>([]);
  const [rows, setRows] = useState<SubjectEntity[]>([]);
  const [examBodyId, setExamBodyId] = useState("");
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setExamBodyId(scope.examBodyId || "");
  }, [scope.examBodyId]);

  useEffect(() => {
    setClassId(scope.classId || "");
  }, [scope.classId]);

  async function load() {
    if (!profile?.school_id) {
      return;
    }
    const bodies = await getExamBodies(profile.school_id);
    setExamBodies(bodies);
    const selectedBody = examBodyId && bodies.some((b) => b.id === examBodyId) ? examBodyId : "";
    if (examBodyId && !selectedBody) {
      setExamBodyId("");
      clearFrom("examBodyId");
    }
    const classRows = await getClasses(profile.school_id, selectedBody || undefined);
    setClasses(classRows);
    const selectedClassId = classId && classRows.some((c) => c.id === classId) ? classId : "";
    if (classId && !selectedClassId) {
      setClassId("");
      clearFrom("classId");
    }
    if (classRows.length) {
      setRows(await getSubjects(classRows.map((c) => c.id)));
    } else {
      setRows([]);
    }
  }

  useEffect(() => {
    load();
  }, [profile?.school_id, examBodyId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!classId || !name.trim()) {
      return;
    }
    try {
      await addSubject({ class_id: classId, name: name.trim() });
      toast("success", "Subject added");
      setName("");
      load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to add subject");
    }
  }

  async function removeSubject(id: string) {
    const impact = await getSubjectDeleteImpact(id);
    setDeleteTarget({
      id,
      message: `Delete this subject?\n\nThis will also remove:\n- Chapters: ${impact.chapters}\n- Questions: ${impact.questions}`,
    });
  }

  function rollbackRow(snapshot: SubjectEntity) {
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
      label: "Subject",
      commit: () => deleteSubject(deleteTarget.id),
      rollback: () => rollbackRow(snapshot),
      successMessage: "Subject deleted",
      failureMessage: "Failed to delete subject",
    });
    if (scope.subjectId === deleteTarget.id) {
      clearFrom("subjectId");
    }
    setDeleteTarget(null);
    setIsDeleting(false);
  }

  async function saveEdit() {
    if (!editId) {
      return;
    }
    try {
      await updateSubjectName(editId, editName);
      toast("success", "Subject updated");
      setEditId(null);
      setEditName("");
      load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update subject");
    }
  }

  const filteredRows = rows.filter((r) => {
    if (classId && r.class_id !== classId) {
      return false;
    }
    return r.name.toLowerCase().includes(search.trim().toLowerCase());
  });
  const selectedBodyName = examBodies.find((item) => item.id === examBodyId)?.name;
  const selectedClassName = classes.find((item) => item.id === classId)?.name;
  const selectedScopeSubjectName = rows.find((item) => item.id === scope.subjectId)?.name;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Subject Management</h2>
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
              setClassId("");
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
            value: selectedScopeSubjectName || "All Subjects",
            selected: !!scope.subjectId,
            count: filteredRows.length,
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
      <form onSubmit={submit} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[220px_1fr_auto]">
        <label className="text-xs font-semibold text-slate-600">
          Exam Body
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={examBodyId}
            onChange={(e) => {
              const nextBody = e.target.value;
              setExamBodyId(nextBody);
              setClassId("");
              mergeScope({ examBodyId: nextBody || undefined, classId: undefined, subjectId: undefined, chapterId: undefined });
            }}
          >
            <option value="">All Exam Bodies</option>
            {examBodies.map((b) => <option value={b.id} key={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Class
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
            {classes.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Subject Name
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" list="subject-suggestions" value={name} onChange={(e) => setName(e.target.value)} placeholder="Subject name" />
        </label>
        <datalist id="subject-suggestions">
          {pakistanSubjects.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        <button className="rounded-lg bg-brand px-4 py-2 text-white">Add Subject</button>
      </form>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-sm font-semibold">Quick subject labels (Pakistan)</p>
        <div className="flex flex-wrap gap-2">
          {pakistanSubjects.map((subject, idx) => (
            <button
              key={subject}
              type="button"
              onClick={() => setName(subject)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                idx % 6 === 0
                  ? "bg-emerald-100 text-emerald-700"
                  : idx % 6 === 1
                    ? "bg-sky-100 text-sky-700"
                    : idx % 6 === 2
                      ? "bg-amber-100 text-amber-700"
                      : idx % 6 === 3
                        ? "bg-violet-100 text-violet-700"
                        : idx % 6 === 4
                          ? "bg-rose-100 text-rose-700"
                          : "bg-lime-100 text-lime-700"
              }`}
            >
              {subject}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Click to auto-fill subject name, then add. You can still type custom subjects.</p>
      </div>
      <label className="block text-xs font-semibold text-slate-600">
        Search Subject
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to filter subjects" />
      </label>
      <div className="rounded-xl border border-slate-200 bg-white">
        {filteredRows.length === 0 ? (
          <EmptyState title="No subjects found" description="Add subjects for this class to continue chapter and question setup." />
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
                        const parentClass = classes.find((item) => item.id === row.class_id);
                        const parentExamBodyId = parentClass?.exam_body_id || examBodyId || undefined;
                        setExamBodyId(parentExamBodyId || "");
                        setClassId(row.class_id);
                        mergeScope({
                          examBodyId: parentExamBodyId,
                          classId: row.class_id,
                          subjectId: row.id,
                          chapterId: undefined,
                        });
                        toast("success", "Context set to this subject");
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
                    <button type="button" onClick={() => removeSubject(row.id)} className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
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
