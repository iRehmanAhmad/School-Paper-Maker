import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addChapters,
  addSubject,
  addSubjectOutline,
  addTopic,
  deleteSubject,
  getChapters,
  getClasses,
  getExamBodies,
  getLatestSubjectOutline,
  getSubjectDeleteImpact,
  getSubjects,
  getTopics,
  normalizeText,
  updateSubjectName,
  updateSubjectOutlineStatus,
} from "@/services/repositories";
import { generateSubjectOutlineFromText } from "@/services/ai";
import { extractPdfText } from "@/services/pdfText";
import { canUseSupabase, supabase } from "@/services/supabase";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ContextBreadcrumbs } from "@/components/ContextBreadcrumbs";
import { EmptyState } from "@/components/EmptyState";
import { GhostAutocompleteInput } from "@/components/GhostAutocompleteInput";
import { useHierarchyScopeParams } from "@/hooks/useHierarchyScopeParams";
import { useUndoDeleteQueue } from "@/hooks/useUndoDeleteQueue";
import { useAppStore } from "@/store/useAppStore";
import { hierarchyScopeToSearch } from "@/utils/hierarchyScope";
import type { ClassEntity, ExamBody, SubjectEntity, SubjectOutline } from "@/types/domain";

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

function findSuggestion(value: string, suggestions: string[]) {
  const needle = value.trim().toLowerCase();
  if (!needle) return "";
  return suggestions.find((item) => item.toLowerCase().startsWith(needle)) || "";
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

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
  const [classSort, setClassSort] = useState<"asc" | "desc">("asc");
  const [subjectFile, setSubjectFile] = useState<File | null>(null);
  const [autoAnalyzePdf, setAutoAnalyzePdf] = useState(true);
  const [outlineDraft, setOutlineDraft] = useState<SubjectOutline | null>(null);
  const [outlineSelectedTitles, setOutlineSelectedTitles] = useState<string[]>([]);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineApplying, setOutlineApplying] = useState(false);
  const [outlineError, setOutlineError] = useState("");
  const [outlineProgress, setOutlineProgress] = useState("");
  const [outlineProgressValue, setOutlineProgressValue] = useState(0);
  const [ocrPages, setOcrPages] = useState(4);
  const [ocrLang, setOcrLang] = useState("eng");
  const [ocrTesting, setOcrTesting] = useState(false);
  const [ocrPreview, setOcrPreview] = useState("");
  const [outlineRegenerating, setOutlineRegenerating] = useState(false);
  const [outlinePrompt, setOutlinePrompt] = useState("");
  const [unitsOnly, setUnitsOnly] = useState(false);
  const [useOcrCache, setUseOcrCache] = useState(true);
  const [textOnly, setTextOnly] = useState(false);
  const [lastOutlineFileName, setLastOutlineFileName] = useState("");
  const [textPreview, setTextPreview] = useState("");

  useEffect(() => {
    setExamBodyId(scope.examBodyId || "");
  }, [scope.examBodyId]);

  useEffect(() => {
    setClassId(scope.classId || "");
  }, [scope.classId]);

  useEffect(() => {
    if (!scope.subjectId) {
      setOutlineDraft(null);
      setOutlineSelectedTitles([]);
      return;
    }
    getLatestSubjectOutline(scope.subjectId)
      .then((draft) => {
        setOutlineDraft(draft);
        setOutlineSelectedTitles(draft?.outline.map((ch) => ch.title) ?? []);
      })
      .catch(() => {
        setOutlineDraft(null);
        setOutlineSelectedTitles([]);
      });
  }, [scope.subjectId]);

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
    if (!selectedClassId && classRows.length > 0) {
      const firstClassId = classRows[0].id;
      setClassId(firstClassId);
      mergeScope({ examBodyId: selectedBody || undefined, classId: firstClassId, subjectId: undefined, chapterId: undefined });
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

  async function runSubjectPdfOutline(subject: SubjectEntity, file: File) {
    if (!profile?.school_id) {
      return;
    }
    setOutlineError("");
    setOutlineProgress("");
    setOutlineProgressValue(0);
    setOutlineLoading(true);
    setLastOutlineFileName(file.name);
    try {
      const classRow = classes.find((item) => item.id === subject.class_id);
      const bodyId = classRow?.exam_body_id || examBodyId;
      if (!bodyId) {
        throw new Error("Select an exam body before analyzing the PDF");
      }
      const examBodyName = examBodies.find((item) => item.id === bodyId)?.name || "Exam Body";
      const className = classRow?.name || "Class";
      const textLimit = unitsOnly ? 250000 : 40000;
      const text = await extractPdfText(file, textLimit, {
        ocrPages,
        ocrLang,
        onProgress: setOutlineProgress,
        onProgressValue: setOutlineProgressValue,
        cacheKeyMeta: `${file.name}_${file.size}_${file.lastModified}`,
        skipCache: !useOcrCache,
        skipOcr: textOnly,
      });
      if (!text) {
        throw new Error("No readable text found in this PDF");
      }
      const outline = await generateSubjectOutlineFromText({
        examBody: examBodyName,
        className,
        subjectName: subject.name,
        text,
        instructions: outlinePrompt.trim() || undefined,
        unitsOnly,
      });

      let sourcePath: string | null = null;
      if (canUseSupabase() && supabase) {
        const bucket = "subject-sources";
        const path = `${profile.school_id}/${bodyId || "general"}/${subject.class_id}/${subject.id}/${Date.now()}-${sanitizeName(file.name)}`;
        const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
        if (!error) {
          sourcePath = `${bucket}/${path}`;
        }
      }

      const draft = await addSubjectOutline({
        school_id: profile.school_id,
        exam_body_id: bodyId || "",
        class_id: subject.class_id,
        subject_id: subject.id,
        source_name: file.name || subject.name,
        source_path: sourcePath,
        source_type: file.type || "pdf",
        outline,
        created_by: profile.id,
      });

      setOutlineDraft(draft);
      setOutlineSelectedTitles(draft.outline.map((ch) => ch.title));
      toast("success", "AI outline ready. Review and create chapters.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to analyze subject PDF";
      setOutlineError(message);
      toast("error", message);
    } finally {
      setOutlineLoading(false);
      setOutlineProgress("");
      setOutlineProgressValue(0);
    }
  }

  async function runOcrTest() {
    if (!subjectFile) {
      toast("error", "Select a subject PDF first");
      return;
    }
    setOcrTesting(true);
    setOutlineProgress("");
    setOutlineProgressValue(0);
    setOcrPreview("");
    try {
      const text = await extractPdfText(subjectFile, 2000, {
        ocrPages: 1,
        ocrLang,
        onProgress: setOutlineProgress,
        onProgressValue: setOutlineProgressValue,
        cacheKeyMeta: `${subjectFile.name}_${subjectFile.size}_${subjectFile.lastModified}`,
        skipCache: !useOcrCache,
        skipOcr: textOnly,
      });
      setOcrPreview(text.slice(0, 1200));
      toast("success", "OCR preview generated");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "OCR test failed");
    } finally {
      setOcrTesting(false);
      setOutlineProgress("");
      setOutlineProgressValue(0);
    }
  }

  async function runTextPreview() {
    if (!subjectFile) {
      toast("error", "Select a subject PDF first");
      return;
    }
    setOcrTesting(true);
    setOutlineProgress("");
    setOutlineProgressValue(0);
    setTextPreview("");
    try {
      const text = await extractPdfText(subjectFile, 2000, {
        ocrPages: 1,
        ocrLang,
        onProgress: setOutlineProgress,
        onProgressValue: setOutlineProgressValue,
        cacheKeyMeta: `${subjectFile.name}_${subjectFile.size}_${subjectFile.lastModified}`,
        skipCache: !useOcrCache,
        skipOcr: true,
      });
      setTextPreview(text.slice(0, 1200));
      toast("success", "Text preview generated");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Text preview failed");
    } finally {
      setOcrTesting(false);
      setOutlineProgress("");
      setOutlineProgressValue(0);
    }
  }

  function clearOcrCache() {
    try {
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith("pg_pdf_"))
        .forEach((key) => sessionStorage.removeItem(key));
      toast("success", "OCR cache cleared");
    } catch {
      toast("error", "Unable to clear OCR cache");
    }
  }

  async function regenerateOutline() {
    if (!outlineDraft) return;
    if (!subjectFile) {
      toast("error", "Select the subject PDF again to regenerate the outline");
      return;
    }
    const subject = rows.find((item) => item.id === outlineDraft.subject_id);
    if (!subject) {
      toast("error", "Subject not found for regeneration");
      return;
    }
    setOutlineRegenerating(true);
    try {
      await runSubjectPdfOutline(subject, subjectFile);
    } finally {
      setOutlineRegenerating(false);
    }
  }

  async function applyOutlineDraft() {
    if (!outlineDraft) return;
    if (!outlineSelectedTitles.length) {
      toast("error", "Select at least one chapter to add");
      return;
    }
    setOutlineApplying(true);
    try {
      const selected = outlineDraft.outline.filter((ch) => outlineSelectedTitles.includes(ch.title));
      const existingChapters = await getChapters([outlineDraft.subject_id]);
      const chapterByTitle = new Map(existingChapters.map((ch) => [normalizeText(ch.title), ch]));
      let nextNumber = existingChapters.reduce((max, ch) => Math.max(max, ch.chapter_number), 0) + 1;

      const chaptersToCreate = selected
        .filter((ch) => !chapterByTitle.has(normalizeText(ch.title)))
        .map((ch) => ({
          subject_id: outlineDraft.subject_id,
          title: ch.title,
          chapter_number: nextNumber++,
        }));

      const created = chaptersToCreate.length ? await addChapters(chaptersToCreate) : [];
      const allChapters = [...existingChapters, ...created];
      const allTopics = await getTopics(allChapters.map((ch) => ch.id));
      const topicsByChapter = new Map<string, string[]>();
      allTopics.forEach((topic) => {
        const group = topicsByChapter.get(topic.chapter_id) || [];
        group.push(topic.title);
        topicsByChapter.set(topic.chapter_id, group);
      });

      const chapterLookup = new Map(allChapters.map((ch) => [normalizeText(ch.title), ch]));
      let topicsAdded = 0;
      for (const chapter of selected) {
        const target = chapterLookup.get(normalizeText(chapter.title));
        if (!target) continue;
        const existingTopics = topicsByChapter.get(target.id) || [];
        const topicSet = new Set(existingTopics.map((t) => normalizeText(t)));
        let nextTopicNumber = existingTopics.length > 0 ? existingTopics.length + 1 : 1;
        if (existingTopics.length > 0) {
          const maxNumber = allTopics
            .filter((row) => row.chapter_id === target.id)
            .reduce((max, row) => Math.max(max, row.topic_number), 0);
          nextTopicNumber = maxNumber + 1;
        }
        for (const topicTitle of chapter.topics || []) {
          if (!topicTitle) continue;
          if (topicSet.has(normalizeText(topicTitle))) continue;
          await addTopic({
            chapter_id: target.id,
            title: topicTitle,
            topic_number: nextTopicNumber,
          });
          nextTopicNumber += 1;
          topicsAdded += 1;
        }
      }

      await updateSubjectOutlineStatus(outlineDraft.id, "approved");
      setOutlineDraft({ ...outlineDraft, status: "approved" });
      toast("success", `Chapters created: ${created.length}, Topics added: ${topicsAdded}`);
      await load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to apply outline");
    } finally {
      setOutlineApplying(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!classId || !name.trim()) {
      return;
    }
    try {
      const created = await addSubject({ class_id: classId, name: name.trim() });
      toast("success", "Subject added");
      setName("");
      mergeScope({ examBodyId: examBodyId || undefined, classId, subjectId: created.id, chapterId: undefined });
      await load();
      if (subjectFile && autoAnalyzePdf) {
        await runSubjectPdfOutline(created, subjectFile);
        setSubjectFile(null);
      }
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

  function onSubjectNameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Tab") return;
    const suggestion = findSuggestion(name, pakistanSubjects);
    if (!suggestion) return;
    if (suggestion.toLowerCase() === name.trim().toLowerCase()) return;
    e.preventDefault();
    setName(suggestion);
  }
  
  const inlineSuggestion = findSuggestion(name, pakistanSubjects);

  const filteredRows = rows.filter((r) => {
    if (classId && r.class_id !== classId) {
      return false;
    }
    return r.name.toLowerCase().includes(search.trim().toLowerCase());
  });
  const sortedClasses = [...classes].sort((a, b) => {
    const res = a.name.localeCompare(b.name);
    return classSort === "asc" ? res : -res;
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
      <form onSubmit={submit} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 lg:grid-cols-[220px_220px_1fr_auto]">
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
          <GhostAutocompleteInput
            className="mt-1"
            value={name}
            onChange={setName}
            suggestion={inlineSuggestion}
            onKeyDown={onSubjectNameKeyDown}
            placeholder="Subject name (type then Tab to autocomplete)"
          />
        </label>
        <button className="rounded-lg bg-brand px-4 py-2 text-white">Add Subject</button>
        <div className="lg:col-span-4 grid gap-2 md:grid-cols-[1fr_auto]">
          <label className="text-xs font-semibold text-slate-600">
            Subject PDF (optional)
            <input
              type="file"
              accept=".pdf"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              onChange={(e) => setSubjectFile(e.target.files?.[0] || null)}
            />
            {subjectFile ? <span className="mt-1 block text-[11px] text-slate-500">Selected: {subjectFile.name}</span> : null}
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 md:self-end">
            <input
              type="checkbox"
              checked={autoAnalyzePdf}
              onChange={(e) => setAutoAnalyzePdf(e.target.checked)}
            />
            Analyze PDF after adding subject
          </label>
        </div>
        <div className="lg:col-span-4 grid gap-2 md:grid-cols-[180px_1fr]">
          <label className="text-xs font-semibold text-slate-600">
            OCR Pages
            <input
              type="number"
              min={1}
              max={10}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              value={ocrPages}
              onChange={(e) => setOcrPages(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            OCR Language
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              value={ocrLang}
              onChange={(e) => setOcrLang(e.target.value)}
            >
              <option value="eng">English</option>
              <option value="urd">Urdu</option>
              <option value="eng+urd">English + Urdu</option>
            </select>
            <span className="mt-1 block text-[11px] text-slate-500">
              OCR downloads language data on first use and may take a moment.
            </span>
          </label>
        </div>
        <label className="lg:col-span-4 text-xs font-semibold text-slate-600">
          Custom AI Prompt (optional)
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            rows={2}
            value={outlinePrompt}
            onChange={(e) => setOutlinePrompt(e.target.value)}
            placeholder="Example: Use textbook headings. Keep 6-8 topics per chapter. Prefer short titles."
          />
        </label>
        <label className="lg:col-span-4 flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={unitsOnly}
            onChange={(e) => setUnitsOnly(e.target.checked)}
          />
          Units only (no topics)
        </label>
        <label className="lg:col-span-4 flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={textOnly}
            onChange={(e) => setTextOnly(e.target.checked)}
          />
          Text-only (skip OCR)
        </label>
        <label className="lg:col-span-4 flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={useOcrCache}
            onChange={(e) => setUseOcrCache(e.target.checked)}
          />
          Use OCR cache (faster on re-run)
        </label>
        <div className="lg:col-span-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runTextPreview}
            disabled={!subjectFile || ocrTesting}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
          >
            {ocrTesting ? "Loading..." : "Text Preview"}
          </button>
          <button
            type="button"
            onClick={runOcrTest}
            disabled={!subjectFile || ocrTesting || textOnly}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
          >
            {ocrTesting ? "Testing OCR..." : "Test OCR (first page)"}
          </button>
          <button
            type="button"
            onClick={clearOcrCache}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Clear OCR Cache
          </button>
          {outlineProgressValue > 0 && (
            <div className="flex-1 min-w-[180px]">
              <div className="h-2 w-full rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-brand transition-all"
                  style={{ width: `${Math.min(100, outlineProgressValue)}%` }}
                />
              </div>
              {outlineProgress ? <p className="mt-1 text-[11px] text-slate-500">{outlineProgress}</p> : null}
            </div>
          )}
        </div>
        {ocrPreview ? (
          <div className="lg:col-span-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap">
            {ocrPreview}
          </div>
        ) : null}
        {textPreview ? (
          <div className="lg:col-span-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap">
            {textPreview}
          </div>
        ) : null}
      </form>
      <label className="block text-xs font-semibold text-slate-600">
        Search Subject
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to filter subjects" />
      </label>
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600">Classes</p>
            <button
              type="button"
              onClick={() => setClassSort((prev) => (prev === "asc" ? "desc" : "asc"))}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-brand hover:text-brand"
              title="Toggle sort order"
            >
              {classSort === "asc" ? "A–Z" : "Z–A"}
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {sortedClasses.length === 0 ? (
              <p className="text-xs text-slate-400">No classes found</p>
            ) : (
              sortedClasses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setClassId(c.id);
                    mergeScope({ examBodyId: examBodyId || undefined, classId: c.id, subjectId: undefined, chapterId: undefined });
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                    classId === c.id ? "border-brand bg-brand/10 text-brand" : "border-slate-200 text-slate-700 hover:border-brand/60"
                  }`}
                >
                  {c.name}
                </button>
              ))
            )}
          </div>
        </div>
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
      </div>
      {outlineLoading && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600">
          {outlineProgress || "Analyzing PDF and preparing outline..."}
          {outlineProgressValue > 0 && (
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-brand transition-all"
                style={{ width: `${Math.min(100, outlineProgressValue)}%` }}
              />
            </div>
          )}
        </div>
      )}
      {outlineError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {outlineError}
        </div>
      )}
      {outlineDraft && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-700">AI Outline Draft</h3>
              <p className="text-xs text-slate-500">
                Source: {outlineDraft.source_name} • Status: {outlineDraft.status}
              </p>
              {lastOutlineFileName ? (
                <p className="text-[11px] text-slate-400">Analyzed file: {lastOutlineFileName}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={regenerateOutline}
                disabled={outlineRegenerating || outlineLoading}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
              >
                {outlineRegenerating ? "Regenerating..." : "Regenerate outline"}
              </button>
              <button
                type="button"
                onClick={applyOutlineDraft}
                disabled={outlineApplying || outlineDraft.status === "approved"}
                className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {outlineDraft.status === "approved" ? "Chapters Created" : outlineApplying ? "Creating..." : "Create Chapters & Topics"}
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {outlineDraft.outline.map((chapter) => {
              const checked = outlineSelectedTitles.includes(chapter.title);
              return (
                <label key={chapter.title} className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setOutlineSelectedTitles((prev) =>
                        e.target.checked ? [...prev, chapter.title] : prev.filter((title) => title !== chapter.title),
                      );
                    }}
                    disabled={outlineDraft.status === "approved"}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{chapter.title}</p>
                    <p className="text-xs text-slate-500">
                      {chapter.topics?.length ? chapter.topics.join(", ") : "No topics suggested"}
                    </p>
                  </div>
                </label>
              );
            })}
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
