import { DragEvent, FormEvent, Fragment, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addChapter,
  addChapters,
  addTopic,
  deleteChapter,
  deleteTopic,
  getChapterDeleteImpact,
  getQuestionCountsByChapter,
  getQuestionCountsByTopic,
  getTopics,
  reorderChapters,
  updateChapter,
  updateTopic,
} from "@/services/repositories";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ContextBreadcrumbs } from "@/components/ContextBreadcrumbs";
import { EmptyState } from "@/components/EmptyState";
import { GhostAutocompleteInput } from "@/components/GhostAutocompleteInput";
import { useHierarchyScopeParams } from "@/hooks/useHierarchyScopeParams";
import { useUndoDeleteQueue } from "@/hooks/useUndoDeleteQueue";
import { generateSyllabus } from "@/services/ai";
import { useAppStore } from "@/store/useAppStore";
import { useHierarchy } from "@/hooks/useHierarchy";
import { hierarchyScopeToSearch } from "@/utils/hierarchyScope";
import type { ChapterEntity, TopicEntity } from "@/types/domain";

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

const topicSuggestions = [
  "Introduction",
  "Important Definitions",
  "Worked Examples",
  "Exercise Questions",
  "Application Questions",
  "Review Exercise",
  "Past Paper Practice",
];

function findSuggestion(value: string, suggestions: string[]) {
  const needle = value.trim().toLowerCase();
  if (!needle) return "";
  return suggestions.find((item) => item.toLowerCase().startsWith(needle)) || "";
}

function completeLastCommaToken(value: string, suggestions: string[]) {
  const lastCommaIndex = value.lastIndexOf(",");
  const token = (lastCommaIndex >= 0 ? value.slice(lastCommaIndex + 1) : value).trim();
  if (!token) return "";
  const match = suggestions.find((item) => item.toLowerCase().startsWith(token.toLowerCase()));
  if (!match) return "";
  if (match.toLowerCase() === token.toLowerCase()) return "";
  if (lastCommaIndex < 0) return match;
  const prefix = value.slice(0, lastCommaIndex + 1).trimEnd();
  return `${prefix} ${match}`.trimStart();
}

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
  const [chapterTopicsInput, setChapterTopicsInput] = useState("");
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
  const [topics, setTopics] = useState<TopicEntity[]>([]);
  const [topicCountById, setTopicCountById] = useState<Record<string, number>>({});
  const [selectedChapterForTopics, setSelectedChapterForTopics] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [topicNumber, setTopicNumber] = useState(1);
  const [topicSearch, setTopicSearch] = useState("");
  const [topicEditId, setTopicEditId] = useState<string | null>(null);
  const [topicEditTitle, setTopicEditTitle] = useState("");
  const [topicEditNumber, setTopicEditNumber] = useState(1);
  const [topicDeleteTarget, setTopicDeleteTarget] = useState<{ id: string; title: string; countSnapshot: number } | null>(null);
  const [isDeletingTopic, setIsDeletingTopic] = useState(false);

  const mergeTopics = (prev: TopicEntity[], incoming: TopicEntity[]) => {
    const map = new Map<string, TopicEntity>();
    [...prev, ...incoming].forEach((t) => map.set(t.id, t));
    return Array.from(map.values()).sort((a, b) => a.topic_number - b.topic_number);
  };
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

  useEffect(() => {
    if (!orderedRows.length) {
      setSelectedChapterForTopics("");
      setTopics([]);
      return;
    }
    if (selectedChapterForTopics && !orderedRows.some((row) => row.id === selectedChapterForTopics)) {
      setSelectedChapterForTopics("");
    }
  }, [orderedRows, selectedChapterForTopics]);

  useEffect(() => {
    if (!orderedRows.length) {
      setTopics([]);
      return;
    }
    let ignore = false;
    getTopics(orderedRows.map((row) => row.id))
      .then((rows) => {
        if (!ignore) {
          setTopics(mergeTopics([], rows));
        }
      })
      .catch(() => {
        if (!ignore) {
          toast("error", "Failed to load topics");
        }
      });
    return () => {
      ignore = true;
    };
  }, [orderedRows]);

  useEffect(() => {
    if (!profile?.school_id || !topics.length) {
      setTopicCountById({});
      return;
    }
    let ignore = false;
    getQuestionCountsByTopic(profile.school_id, topics.map((topic) => topic.id))
      .then((counts) => {
        if (!ignore) {
          setTopicCountById(counts);
        }
      })
      .catch(() => {
        if (!ignore) {
          toast("error", "Failed to load topic question counts");
        }
      });
    return () => {
      ignore = true;
    };
  }, [profile?.school_id, topics]);

  useEffect(() => {
    if (!selectedChapterForTopics) {
      setTopicNumber(1);
      return;
    }
    const siblingTopics = topics.filter((topic) => topic.chapter_id === selectedChapterForTopics);
    setTopicNumber(siblingTopics.length ? Math.max(...siblingTopics.map((topic) => topic.topic_number)) + 1 : 1);
  }, [topics, selectedChapterForTopics]);

  const filteredRows = useMemo(
    () =>
      orderedRows.filter((ch) => {
        return !searchValue || ch.title.toLowerCase().includes(searchValue) || String(ch.chapter_number).includes(searchValue);
      }),
    [orderedRows, searchValue]
  );
  const topicSearchValue = topicSearch.trim().toLowerCase();
  const selectedBodyName = examBodies.find((item) => item.id === examBodyId)?.name;
  const selectedClassName = classes.find((item) => item.id === classId)?.name;
  const selectedSubjectName = subjects.find((item) => item.id === subjectId)?.name;
  const selectedScopeChapterName = orderedRows.find((item) => item.id === scope.chapterId)?.title;

  function parseTopicNames(raw: string) {
    const names = raw
      .split(/[\n,]/g)
      .map((item) => item.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    return names.filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function onChapterTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Tab") return;
    const suggestion = findSuggestion(title, chapterSuggestions);
    if (!suggestion) return;
    if (suggestion.toLowerCase() === title.trim().toLowerCase()) return;
    e.preventDefault();
    setTitle(suggestion);
  }

  function onChapterTopicsInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Tab") return;
    const completed = completeLastCommaToken(chapterTopicsInput, topicSuggestions);
    if (!completed) return;
    e.preventDefault();
    setChapterTopicsInput(completed);
  }

  function onTopicTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Tab") return;
    const suggestion = findSuggestion(topicTitle, topicSuggestions);
    if (!suggestion) return;
    if (suggestion.toLowerCase() === topicTitle.trim().toLowerCase()) return;
    e.preventDefault();
    setTopicTitle(suggestion);
  }

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
      const defaultTopics = await Promise.all(
        inserted.map((chapter) =>
          addTopic({ chapter_id: chapter.id, title: "General", topic_number: 1 }).catch(() => null)
        )
      );
      const validTopics = defaultTopics.filter((topic): topic is TopicEntity => !!topic);
      if (validTopics.length) {
        setTopics((prev) => mergeTopics(prev, validTopics));
      }
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
      const parsedTopics = parseTopicNames(chapterTopicsInput);
      const topicNames = parsedTopics.length ? parsedTopics : ["General"];
      const newTopics = await Promise.all(
        topicNames.map((topicTitle, idx) =>
          addTopic({
            chapter_id: inserted.id,
            title: topicTitle,
            topic_number: idx + 1,
          })
        )
      );
      setTopics((prev) => mergeTopics(prev, newTopics));
      setSelectedChapterForTopics(inserted.id);
      setTitle("");
      setChapterTopicsInput("");
      setNumber((n: number) => n + 1);
      toast("success", `Chapter added with ${newTopics.length} topic(s)`);
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

  async function submitTopic(e: FormEvent) {
    e.preventDefault();
    if (!selectedChapterForTopics || !topicTitle.trim()) {
      return;
    }
    try {
      const inserted = await addTopic({
        chapter_id: selectedChapterForTopics,
        title: topicTitle.trim(),
        topic_number: topicNumber,
      });
      setTopics((prev) => mergeTopics(prev, [inserted]));
      setTopicTitle("");
      setTopicNumber((n) => n + 1);
      toast("success", "Topic added");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to add topic");
    }
  }

  async function saveTopicEdit() {
    if (!topicEditId) return;
    try {
      const updated = await updateTopic(topicEditId, { title: topicEditTitle, topic_number: topicEditNumber });
      setTopics((prev) => mergeTopics([], prev.map((topic) => (topic.id === topicEditId ? updated : topic))));
      setTopicEditId(null);
      toast("success", "Topic updated");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update topic");
    }
  }

  function requestDeleteTopic(topic: TopicEntity) {
    setTopicDeleteTarget({
      id: topic.id,
      title: topic.title,
      countSnapshot: topicCountById[topic.id] || 0,
    });
  }

  function confirmDeleteTopic() {
    if (!topicDeleteTarget) return;
    const snapshot = topics.find((topic) => topic.id === topicDeleteTarget.id);
    if (!snapshot) {
      setTopicDeleteTarget(null);
      return;
    }
    setIsDeletingTopic(true);
    setTopics((prev) => prev.filter((topic) => topic.id !== topicDeleteTarget.id));
    setTopicCountById((prev) => {
      const next = { ...prev };
      delete next[topicDeleteTarget.id];
      return next;
    });
    queueDelete({
      label: "Topic",
      commit: () => deleteTopic(topicDeleteTarget.id),
      rollback: () => {
        setTopics((prev) => mergeTopics(prev, [snapshot]));
        setTopicCountById((prev) => ({ ...prev, [snapshot.id]: topicDeleteTarget.countSnapshot }));
      },
      successMessage: "Topic deleted",
      failureMessage: "Failed to delete topic",
    });
    setTopicDeleteTarget(null);
    setIsDeletingTopic(false);
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Chapter & Topic Management</h2>
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
      <form onSubmit={submit} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[180px_130px_170px_1fr_1fr_90px_auto_auto]">
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
        <label className="text-xs font-semibold text-slate-600">Chapter Title
          <GhostAutocompleteInput
            className="mt-1"
            value={title}
            onChange={setTitle}
            suggestion={findSuggestion(title, chapterSuggestions)}
            onKeyDown={onChapterTitleKeyDown}
            placeholder="Chapter title (type then Tab to autocomplete)"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">Topics (Optional)
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={chapterTopicsInput}
            onChange={(e) => setChapterTopicsInput(e.target.value)}
            onKeyDown={onChapterTopicsInputKeyDown}
            autoComplete="off"
            placeholder="e.g. Basics, Exercise 1, Review (Tab to autocomplete token)"
          />
          <p className="mt-1 text-[10px] text-slate-500">Comma separated. Leave empty to auto-create "General".</p>
        </label>
        <label className="text-xs font-semibold text-slate-600">Number
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="number" value={number} onChange={(e) => setNumber(Number(e.target.value))} />
        </label>
        <button disabled={!subjectId} className="h-10 self-end rounded-lg bg-brand px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60">Add</button>
        <button
          type="button"
          onClick={handleAiSuggest}
          disabled={!subjectId}
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
                    const isTopicsOpen = selectedChapterForTopics === row.id;
                    const chapterTopics = topics
                      .filter((topic) => topic.chapter_id === row.id)
                      .filter((topic) => !topicSearchValue || topic.title.toLowerCase().includes(topicSearchValue) || String(topic.topic_number).includes(topicSearchValue))
                      .sort((a, b) => a.topic_number - b.topic_number);
                    const chapterTopicCount = topics.filter((topic) => topic.chapter_id === row.id).length;

                    return (
                      <Fragment key={row.id}>
                        <tr
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
                                  if (isTopicsOpen) {
                                    setSelectedChapterForTopics("");
                                    setTopicSearch("");
                                    setTopicEditId(null);
                                  } else {
                                    setSelectedChapterForTopics(row.id);
                                    setTopicSearch("");
                                    setTopicTitle("");
                                  }
                                }}
                                className="rounded bg-cyan-50 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-cyan-700 hover:bg-cyan-100"
                              >
                                {isTopicsOpen ? "Hide Topics" : `Topics (${chapterTopicCount})`}
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
                        {isTopicsOpen && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={6} className="px-4 py-4">
                              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h4 className="text-sm font-bold text-slate-800">Topics for Chapter {row.chapter_number}: {row.title}</h4>
                                    <p className="text-xs text-slate-500">Add, edit, and remove topics inline.</p>
                                  </div>
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                                    {chapterTopicCount} topic(s)
                                  </span>
                                </div>

                                <form onSubmit={submitTopic} className="grid gap-2 md:grid-cols-[1fr_140px_auto]">
                                  <label className="text-xs font-semibold text-slate-600">
                                    Topic Title
                                    <GhostAutocompleteInput
                                      className="mt-1"
                                      value={topicTitle}
                                      onChange={setTopicTitle}
                                      suggestion={findSuggestion(topicTitle, topicSuggestions)}
                                      onKeyDown={onTopicTitleKeyDown}
                                      placeholder="Type topic title (Tab to autocomplete)"
                                    />
                                  </label>
                                  <label className="text-xs font-semibold text-slate-600">
                                    Number
                                    <input
                                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                      type="number"
                                      min={1}
                                      value={topicNumber}
                                      onChange={(e) => setTopicNumber(Number(e.target.value))}
                                    />
                                  </label>
                                  <button type="submit" className="h-10 self-end rounded-lg bg-brand px-4 py-2 text-white">
                                    Add Topic
                                  </button>
                                </form>

                                <label className="block text-xs font-semibold text-slate-600">
                                  Search Topics
                                  <input
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                    value={topicSearch}
                                    onChange={(e) => setTopicSearch(e.target.value)}
                                    placeholder="Type title or topic number"
                                  />
                                </label>

                                <div className="overflow-hidden rounded-xl border border-slate-200">
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                      <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        <tr>
                                          <th className="w-20 px-4 py-3">No.</th>
                                          <th className="px-4 py-3">Topic</th>
                                          <th className="w-28 px-4 py-3 text-center">Questions</th>
                                          <th className="w-44 px-4 py-3 text-right">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 bg-white">
                                        {chapterTopics.length === 0 ? (
                                          <tr>
                                            <td colSpan={4} className="px-4 py-4">
                                              <EmptyState title="No topics found" description="Add topics for this chapter." />
                                            </td>
                                          </tr>
                                        ) : (
                                          chapterTopics.map((topic) => {
                                            const isTopicEditing = topicEditId === topic.id;
                                            return (
                                              <tr key={topic.id}>
                                                <td className="px-4 py-3">
                                                  {isTopicEditing ? (
                                                    <input
                                                      type="number"
                                                      min={1}
                                                      className="w-full rounded border px-2 py-1"
                                                      value={topicEditNumber}
                                                      onChange={(e) => setTopicEditNumber(Number(e.target.value))}
                                                    />
                                                  ) : (
                                                    topic.topic_number
                                                  )}
                                                </td>
                                                <td className="px-4 py-3">
                                                  {isTopicEditing ? (
                                                    <input
                                                      className="w-full rounded border px-2 py-1"
                                                      value={topicEditTitle}
                                                      onChange={(e) => setTopicEditTitle(e.target.value)}
                                                    />
                                                  ) : (
                                                    topic.title
                                                  )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                  <span className="inline-flex min-w-12 justify-center rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                                                    {topicCountById[topic.id] || 0}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                  <div className="flex justify-end gap-2">
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        if (isTopicEditing) {
                                                          saveTopicEdit();
                                                        } else {
                                                          setTopicEditId(topic.id);
                                                          setTopicEditTitle(topic.title);
                                                          setTopicEditNumber(topic.topic_number);
                                                        }
                                                      }}
                                                      className="rounded bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-amber-700 hover:bg-amber-100"
                                                    >
                                                      {isTopicEditing ? "Save" : "Edit"}
                                                    </button>
                                                    {isTopicEditing && (
                                                      <button
                                                        type="button"
                                                        onClick={() => setTopicEditId(null)}
                                                        className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-slate-600 hover:bg-slate-200"
                                                      >
                                                        Cancel
                                                      </button>
                                                    )}
                                                    <button
                                                      type="button"
                                                      onClick={() => requestDeleteTopic(topic)}
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
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
      <ConfirmModal
        open={!!topicDeleteTarget}
        title="Delete Topic"
        message={topicDeleteTarget ? `Delete topic "${topicDeleteTarget.title}"?\n\nQuestions linked to this topic will remain but topic tag will be removed.` : ""}
        confirmLabel="Delete"
        loading={isDeletingTopic}
        onCancel={() => setTopicDeleteTarget(null)}
        onConfirm={confirmDeleteTopic}
      />
    </div>
  );
}
