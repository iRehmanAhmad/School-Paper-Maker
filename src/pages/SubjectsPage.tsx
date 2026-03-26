import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { extractPdfText } from "@/services/pdfText";
import { extractSubjectOutlineDraft } from "@/services/subjectOutlineImport";
import { canUseSupabase, supabase } from "@/services/supabase";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ContextBreadcrumbs } from "@/components/ContextBreadcrumbs";
import { EmptyState } from "@/components/EmptyState";
import { GhostAutocompleteInput } from "@/components/GhostAutocompleteInput";
import { useHierarchyScopeParams } from "@/hooks/useHierarchyScopeParams";
import { useUndoDeleteQueue } from "@/hooks/useUndoDeleteQueue";
import { useAppStore } from "@/store/useAppStore";
import { hierarchyScopeToSearch } from "@/utils/hierarchyScope";
import type { ClassEntity, ExamBody, SubjectEntity, SubjectOutline, SubjectOutlineChapter } from "@/types/domain";

const pakistanSubjects = [
  "Primer Mathematics",
  "Primer English",
  "Primer Urdu",
  "Neela Qaida",
  "Tajveedi Qaida",
  "Urdu",
  "English",
  "Math",
  "Mathematics",
  "General Math (EM)",
  "General Math (UM)",
  "Math (Sc) EM",
  "Math (Sc) UM",
  "Waqfiyat e Aama (UM)",
  "Islamiat (UM)",
  "Islamiat",
  "Islamiyat",
  "Akhlaqiat",
  "Nazra Quran",
  "General Science (EM)",
  "General Science",
  "General Science (UM)",
  "Masharti Aloom (UM)",
  "Tarjuma Tul Quran ul Majeed",
  "Geography",
  "Geography (UM)",
  "History",
  "History (UM)",
  "Ethics",
  "Arabic",
  "Computer Science",
  "Computer",
  "Art and Drawing",
  "Art and Model Drawing (UM)",
  "Art and Model Drawing (EM)",
  "Zari Taleem",
  "Punjabi",
  "Farsi",
  "Itlaqi Barqiat",
  "Home Economics (UM)",
  "Home Economics (EM)",
  "Home Economics",
  "Physics (EM)",
  "Physics (UM)",
  "Physics",
  "Chemistry (EM)",
  "Chemistry (UM)",
  "Chemistry",
  "Biology (EM)",
  "Biology (UM)",
  "Biology",
  "Pakistan Studies (EM)",
  "Pakistan Studies (UM)",
  "Pakistan Studies",
  "Pak Studies (EM)",
  "Pak Studies (UM)",
  "Ghiza aur Ghizayat",
  "Parcha Bafi (Textile and Clothing)",
  "Bio Tech (EM)",
  "Bio Tech (UM)",
  "General Science Tech",
  "Computer and Entrepreneur Tech (UM)",
  "Computer and Entrepreneur Tech (EM)",
  "Computer Tech (UM)",
  "Agriculture Science Tech (EM)",
  "Agriculture Science Tech (UM)",
  "Communication Skills Tech",
  "Fashion Design Tech",
  "ICT Tech",
  "Health Sciences Tech",
  "Physics Tech (EM)",
  "Physics Tech (UM)",
  "Physics Practical Video",
  "Chemistry Practical Video",
  "Biology Practical Video",
  "English Grammar and Composition",
  "Urdu Quaid e Insha",
  "Economics (UM)",
  "Economics (EM)",
  "Economics",
  "Punjabi Ikhtari",
  "Health and Physical Education",
  "Education",
  "Civics (UM)",
  "Civics",
  "Model Paper Islamiyat",
  "Physical Geography",
  "Human Geography",
  "English Book I (Short Stories)",
  "English Book II",
  "English Book III",
  "Mr Chips",
  "Statistics",
  "Ilm ul Taleem",
  "ILM UL TALEEM (UM)",
  "Hadiqat ul Adab (Juiz ul Awal)",
  "Hadiqat ul Adab (Juiz ul Sani)",
  "Muraqa e Adab",
  "Mantaq",
  "Mubadiyat Falsfa",
  "Psychology (Nafsiyat)",
  "Nafsiyat",
  "Pakstudy (UM)",
  "Pakstudy (EM)",
  "Geography Workbook",
  "Sehat o Jismani Taleem (UM)",
  "Social Studies",
  "Commerce",
  "Accounting",
  "Business Studies",
  "Persian",
  "Sindhi",
  "Pashto",
  "Balochi",
  "Siraiki",
  "Fine Arts",
  "Drawing",
  "Physical Education",
  "Quran",
  "Tajweed",
];

const PUNJAB_CLASS_SUBJECTS: Record<string, string[]> = {
  kg: [
    "Primer Mathematics",
    "Primer English",
    "Primer Urdu",
    "Neela Qaida",
    "Tajveedi Qaida",
    "Nazra Quran",
    "Art and Drawing",
  ],
  "1": [
    "English",
    "Urdu",
    "Math",
    "General Math (EM)",
    "General Math (UM)",
    "Islamiat",
    "Islamiyat",
    "Nazra Quran",
    "General Science",
    "General Science (EM)",
    "General Science (UM)",
    "Social Studies",
    "Computer",
    "Art and Drawing",
    "Health and Physical Education",
  ],
  "2": [
    "English",
    "Urdu",
    "Math",
    "General Math (EM)",
    "General Math (UM)",
    "Islamiat",
    "Islamiyat",
    "Nazra Quran",
    "General Science",
    "General Science (EM)",
    "General Science (UM)",
    "Social Studies",
    "Computer",
    "Art and Drawing",
    "Health and Physical Education",
  ],
  "3": [
    "English",
    "Urdu",
    "Math",
    "General Math (EM)",
    "General Math (UM)",
    "Islamiat",
    "Islamiyat",
    "Nazra Quran",
    "General Science",
    "General Science (EM)",
    "General Science (UM)",
    "Social Studies",
    "Computer",
    "Art and Drawing",
    "Health and Physical Education",
  ],
  "4": [
    "English",
    "Urdu",
    "Mathematics",
    "General Math (EM)",
    "General Math (UM)",
    "Islamiat",
    "Islamiyat",
    "Nazra Quran",
    "General Science",
    "General Science (EM)",
    "General Science (UM)",
    "Social Studies",
    "Computer",
    "Art and Drawing",
    "Health and Physical Education",
  ],
  "5": [
    "English",
    "Urdu",
    "Mathematics",
    "General Science",
    "Islamiyat",
  ],
  "6": [
    "English",
    "Urdu",
    "General Math (EM)",
    "General Math (UM)",
    "Islamiat",
    "Islamiyat",
    "Nazra Quran",
    "General Science",
    "General Science (EM)",
    "General Science (UM)",
    "Pakistan Studies",
    "Geography",
    "History",
    "Computer Science",
    "Computer",
    "Arabic",
    "Art and Drawing",
    "Health and Physical Education",
  ],
  "7": [
    "English",
    "Urdu",
    "General Math (EM)",
    "General Math (UM)",
    "Islamiat",
    "Islamiyat",
    "Nazra Quran",
    "General Science",
    "General Science (EM)",
    "General Science (UM)",
    "Pakistan Studies",
    "Geography",
    "History",
    "Computer Science",
    "Computer",
    "Arabic",
    "Art and Drawing",
    "Health and Physical Education",
  ],
  "8": [
    "English",
    "Urdu",
    "General Math (EM)",
    "General Math (UM)",
    "Islamiat",
    "Islamiyat",
    "Nazra Quran",
    "General Science",
    "General Science (EM)",
    "General Science (UM)",
    "Pakistan Studies",
    "Geography",
    "History",
    "Computer Science",
    "Computer",
    "Arabic",
    "Art and Drawing",
    "Health and Physical Education",
  ],
  "9": [
    "English",
    "Urdu",
    "Math (Sc) EM",
    "Math (Sc) UM",
    "Physics",
    "Physics (EM)",
    "Physics (UM)",
    "Chemistry",
    "Chemistry (EM)",
    "Chemistry (UM)",
    "Biology",
    "Biology (EM)",
    "Biology (UM)",
    "Computer Science",
    "General Science Tech",
    "Islamiat",
    "Islamiyat",
    "Nazra Quran",
    "Pakistan Studies",
    "Pakistan Studies (EM)",
    "Pakistan Studies (UM)",
  ],
  "10": [
    "English",
    "Urdu",
    "Math (Sc) EM",
    "Math (Sc) UM",
    "Physics",
    "Physics (EM)",
    "Physics (UM)",
    "Chemistry",
    "Chemistry (EM)",
    "Chemistry (UM)",
    "Biology",
    "Biology (EM)",
    "Biology (UM)",
    "Computer Science",
    "General Science Tech",
    "Islamiat",
    "Islamiyat",
    "Nazra Quran",
    "Pakistan Studies",
    "Pakistan Studies (EM)",
    "Pakistan Studies (UM)",
  ],
  "11": [
    "English",
    "English Book I (Short Stories)",
    "English Book II",
    "English Book III",
    "Urdu",
    "Urdu Quaid e Insha",
    "Mathematics",
    "Statistics",
    "Physics",
    "Chemistry",
    "Biology",
    "Computer Science",
    "Economics",
    "Economics (EM)",
    "Economics (UM)",
    "Geography",
    "Physical Geography",
    "Human Geography",
    "Education",
    "Psychology (Nafsiyat)",
  ],
  "12": [
    "English",
    "Urdu",
    "Mathematics",
    "Statistics",
    "Physics",
    "Chemistry",
    "Biology",
    "Computer Science",
    "Economics",
    "Economics (EM)",
    "Economics (UM)",
    "Geography",
    "Education",
    "Psychology (Nafsiyat)",
    "Civics",
    "Civics (UM)",
    "Islamiyat",
  ],
};

const ROMAN_CLASS_TO_DECIMAL: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
  xi: "11",
  xii: "12",
};

function dedupeSubjects(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeClassKey(rawClassName?: string) {
  const text = (rawClassName || "").trim().toLowerCase();
  if (!text) return "";
  if (/(^|\W)(kg|k\.g|kindergarten|prep|pre[- ]?primary|nursery|playgroup)(\W|$)/.test(text)) {
    return "kg";
  }
  const digitMatch = text.match(/\b(10|11|12|[1-9])\b/);
  if (digitMatch) return digitMatch[1];
  const romanMatch = text.match(/\b(xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/);
  if (romanMatch) return ROMAN_CLASS_TO_DECIMAL[romanMatch[1]] || "";
  return "";
}

function getPunjabSubjectSuggestionsForClass(className?: string) {
  const key = normalizeClassKey(className);
  if (!key) return [];
  const scoped = PUNJAB_CLASS_SUBJECTS[key] || [];
  if (!scoped.length) return [];
  const known = new Set(pakistanSubjects.map((item) => item.toLowerCase()));
  return dedupeSubjects(scoped).filter((item) => known.has(item.toLowerCase()));
}

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
  const [chapterCountBySubject, setChapterCountBySubject] = useState<Record<string, number>>({});
  const [examBodyId, setExamBodyId] = useState("");
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [classSort, setClassSort] = useState<"asc" | "desc">("asc");
  const [classSearch, setClassSearch] = useState("");
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
  const [useOcrCache, setUseOcrCache] = useState(true);
  const [textOnly, setTextOnly] = useState(false);
  const [lastOutlineFileName, setLastOutlineFileName] = useState("");
  const [textPreview, setTextPreview] = useState("");
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [selectedSubjectBatch, setSelectedSubjectBatch] = useState<string[]>([]);
  const subjectPickerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    setSelectedSubjectIds((prev) => prev.filter((id) => rows.some((row) => row.id === id)));
  }, [rows]);

  useEffect(() => {
    setSelectedSubjectBatch([]);
    setSubjectPickerOpen(false);
  }, [examBodyId, classId]);

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      const root = subjectPickerRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setSubjectPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

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
      const subjectRows = await getSubjects(classRows.map((c) => c.id));
      setRows(subjectRows);
      if (subjectRows.length) {
        const chapters = await getChapters(subjectRows.map((s) => s.id));
        const chapterCounts = chapters.reduce<Record<string, number>>((acc, chapter) => {
          acc[chapter.subject_id] = (acc[chapter.subject_id] || 0) + 1;
          return acc;
        }, {});
        setChapterCountBySubject(chapterCounts);
      } else {
        setChapterCountBySubject({});
      }
    } else {
      setRows([]);
      setChapterCountBySubject({});
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
      const textLimit = 250000;
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
      const outline = extractSubjectOutlineDraft(text);
      if (!outline.length) {
        throw new Error("No chapter headings were detected. Use Text Preview to verify the PDF text, then add chapters manually if needed.");
      }

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
      toast("success", "Outline draft ready. Review and create chapters.");
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
    const selectedTitles = outlineSelectedTitles.map((item) => item.trim()).filter(Boolean);
    if (!selectedTitles.length) {
      toast("error", "Select at least one chapter to add");
      return;
    }
    setOutlineApplying(true);
    try {
      const selected = outlineDraft.outline.filter((ch) => selectedTitles.includes(ch.title.trim()) && ch.title.trim());
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

  function updateDraftChapter(index: number, updater: (chapter: SubjectOutlineChapter) => SubjectOutlineChapter) {
    setOutlineDraft((prev) => {
      if (!prev) return prev;
      const nextOutline = prev.outline.map((chapter, chapterIndex) => (
        chapterIndex === index ? updater(chapter) : chapter
      ));
      return { ...prev, outline: nextOutline };
    });
  }

  function renameDraftChapter(index: number, nextTitle: string) {
    setOutlineDraft((prev) => {
      if (!prev) return prev;
      const current = prev.outline[index];
      if (!current) return prev;
      const cleanedTitle = nextTitle.trim();
      const nextOutline = [...prev.outline];
      nextOutline[index] = { ...current, title: cleanedTitle };
      setOutlineSelectedTitles((selected) => selected.map((item) => (item === current.title ? cleanedTitle : item)));
      return { ...prev, outline: nextOutline };
    });
  }

  function updateDraftTopics(index: number, rawValue: string) {
    updateDraftChapter(index, (chapter) => ({
      ...chapter,
      topics: rawValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    }));
  }

  function removeDraftChapter(index: number) {
    setOutlineDraft((prev) => {
      if (!prev) return prev;
      const current = prev.outline[index];
      if (!current) return prev;
      setOutlineSelectedTitles((selected) => selected.filter((item) => item !== current.title));
      return { ...prev, outline: prev.outline.filter((_, chapterIndex) => chapterIndex !== index) };
    });
  }

  function addDraftChapter() {
    setOutlineDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        outline: [...prev.outline, { title: "", topics: [] }],
      };
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!classId) {
      return;
    }
    if (selectedSubjectBatch.length > 0) {
      const existingSet = new Set(
        rows
          .filter((row) => row.class_id === classId)
          .map((row) => normalizeText(row.name)),
      );
      const targets = selectedSubjectBatch.filter((subjectName) => !existingSet.has(normalizeText(subjectName)));
      if (!targets.length) {
        toast("error", "All selected subjects already exist in this class");
        return;
      }
      let added = 0;
      let skipped = 0;
      let lastCreatedId = "";
      for (const subjectName of targets) {
        try {
          const created = await addSubject({ class_id: classId, name: subjectName.trim() });
          lastCreatedId = created.id;
          added += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message.toLowerCase() : "";
          if (message.includes("already exists") || message.includes("duplicate")) {
            skipped += 1;
            continue;
          }
          throw error;
        }
      }
      if (!added) {
        toast("error", "No selected subjects were added");
        return;
      }
      toast("success", `${added} subject(s) added${skipped ? `, ${skipped} skipped` : ""}`);
      setName("");
      setSelectedSubjectBatch([]);
      setSubjectPickerOpen(false);
      mergeScope({ examBodyId: examBodyId || undefined, classId, subjectId: lastCreatedId || undefined, chapterId: undefined });
      await load();
      return;
    }
    if (!name.trim()) {
      return;
    }
    try {
      const created = await addSubject({ class_id: classId, name: name.trim() });
      toast("success", "Subject added");
      setName("");
      setSubjectPickerOpen(false);
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

  function toggleSubjectSelection(id: string) {
    setSelectedSubjectIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectAllFilteredSubjects() {
    if (!filteredRows.length) return;
    const visibleIds = filteredRows.map((row) => row.id);
    const allSelected = visibleIds.every((id) => selectedSubjectIds.includes(id));
    setSelectedSubjectIds((prev) => {
      if (allSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }

  async function confirmBulkDelete() {
    if (!selectedSubjectIds.length) return;
    setBulkDeleting(true);
    const targets = [...selectedSubjectIds];
    let deleted = 0;
    let failed = 0;
    for (const id of targets) {
      try {
        await deleteSubject(id);
        deleted += 1;
      } catch {
        failed += 1;
      }
    }
    if (deleted > 0) {
      setRows((prev) => prev.filter((row) => !targets.includes(row.id)));
      setChapterCountBySubject((prev) => {
        const next = { ...prev };
        targets.forEach((id) => delete next[id]);
        return next;
      });
      if (scope.subjectId && targets.includes(scope.subjectId)) {
        clearFrom("subjectId");
      }
    }
    setSelectedSubjectIds([]);
    setBulkDeleteOpen(false);
    setBulkDeleting(false);
    if (deleted > 0) {
      toast("success", `${deleted} subject(s) deleted${failed ? `, ${failed} failed` : ""}`);
    } else {
      toast("error", "Failed to delete selected subjects");
    }
    await load();
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

  const selectedBodyName = examBodies.find((item) => item.id === examBodyId)?.name;
  const selectedClassName = classes.find((item) => item.id === classId)?.name;
  const scopedSubjectSuggestions = useMemo(() => getPunjabSubjectSuggestionsForClass(selectedClassName), [selectedClassName]);
  const subjectSuggestionPool = scopedSubjectSuggestions.length > 0 ? scopedSubjectSuggestions : pakistanSubjects;
  const existingSubjectSetForClass = useMemo(
    () => new Set(rows.filter((row) => row.class_id === classId).map((row) => normalizeText(row.name))),
    [rows, classId],
  );
  const pickerOptions = useMemo(() => {
    const needle = name.trim().toLowerCase();
    if (!needle) return subjectSuggestionPool;
    const starts = subjectSuggestionPool.filter((item) => item.toLowerCase().startsWith(needle));
    const contains = subjectSuggestionPool.filter(
      (item) => !item.toLowerCase().startsWith(needle) && item.toLowerCase().includes(needle),
    );
    return [...starts, ...contains];
  }, [name, subjectSuggestionPool]);
  const selectablePickerOptions = useMemo(
    () => pickerOptions.filter((item) => !existingSubjectSetForClass.has(normalizeText(item))),
    [pickerOptions, existingSubjectSetForClass],
  );
  const allSelectableShownSelected = selectablePickerOptions.length > 0
    && selectablePickerOptions.every((item) => selectedSubjectBatch.includes(item));

  function toggleSubjectBatch(subjectName: string) {
    setSelectedSubjectBatch((prev) =>
      prev.includes(subjectName) ? prev.filter((item) => item !== subjectName) : [...prev, subjectName],
    );
  }

  function toggleSelectAllShownSubjects() {
    if (!selectablePickerOptions.length) return;
    setSelectedSubjectBatch((prev) => {
      if (allSelectableShownSelected) {
        return prev.filter((item) => !selectablePickerOptions.includes(item));
      }
      const next = new Set(prev);
      selectablePickerOptions.forEach((item) => next.add(item));
      return Array.from(next);
    });
  }

  function onSubjectNameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Tab") return;
    const suggestion = findSuggestion(name, subjectSuggestionPool);
    if (!suggestion) return;
    if (suggestion.toLowerCase() === name.trim().toLowerCase()) return;
    e.preventDefault();
    setName(suggestion);
  }
  
  const inlineSuggestion = findSuggestion(name, subjectSuggestionPool);

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
  const classSearchNeedle = classSearch.trim().toLowerCase();
  const visibleClasses = sortedClasses.filter((row) => row.name.toLowerCase().includes(classSearchNeedle));
  const selectedScopeSubjectName = rows.find((item) => item.id === scope.subjectId)?.name;
  const classNameById = useMemo(() => Object.fromEntries(classes.map((item) => [item.id, item.name])), [classes]);
  const normalizedName = name.trim().toLowerCase();
  const duplicateRow = classId && normalizedName ? rows.find((row) => row.class_id === classId && row.name.trim().toLowerCase() === normalizedName) : null;
  const canAddSingle = Boolean(profile?.school_id && classId && name.trim() && !duplicateRow);
  const canAddBatch = Boolean(profile?.school_id && classId && selectedSubjectBatch.length > 0);
  const canAdd = canAddSingle || canAddBatch;
  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedSubjectIds.includes(row.id));

  function formatDateShort(value?: string) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString();
  }

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
            {classes.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Subject Name
          <div ref={subjectPickerRef} className="relative mt-1">
            <GhostAutocompleteInput
              value={name}
              onChange={setName}
              suggestion={inlineSuggestion}
              onKeyDown={onSubjectNameKeyDown}
              onFocus={() => setSubjectPickerOpen(true)}
              onClick={() => setSubjectPickerOpen(true)}
              placeholder="Subject name (type then Tab to autocomplete)"
            />
            {subjectPickerOpen ? (
              <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-brand hover:text-brand"
                    onClick={toggleSelectAllShownSubjects}
                    disabled={!selectablePickerOptions.length}
                  >
                    {allSelectableShownSelected ? "Unselect All Shown" : "Select All Shown"}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400"
                    onClick={() => setSelectedSubjectBatch([])}
                    disabled={!selectedSubjectBatch.length}
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1">
                  {pickerOptions.length === 0 ? (
                    <p className="px-1 py-2 text-[11px] text-slate-500">No subjects match your typed text.</p>
                  ) : (
                    pickerOptions.map((subjectName) => {
                      const exists = existingSubjectSetForClass.has(normalizeText(subjectName));
                      const checked = selectedSubjectBatch.includes(subjectName);
                      return (
                        <label
                          key={subjectName}
                          className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                            exists ? "bg-slate-50 text-slate-400" : "hover:bg-slate-50"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={exists}
                              onChange={() => toggleSubjectBatch(subjectName)}
                            />
                            <span>{subjectName}</span>
                          </span>
                          {exists ? <span className="text-[10px] font-semibold">Already added</span> : null}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <span className="mt-1 block text-[11px] text-slate-500">
            {scopedSubjectSuggestions.length > 0
              ? `${scopedSubjectSuggestions.length} class-aware suggestions loaded (${selectedClassName || "selected class"}).`
              : "Global subject suggestions loaded. Select a class for class-specific suggestions."}
          </span>
          {selectedSubjectBatch.length > 0 ? (
            <span className="mt-1 block text-[11px] font-semibold text-brand">
              {selectedSubjectBatch.length} selected for bulk add
            </span>
          ) : null}
        </label>
        <button disabled={!canAdd} className="rounded-lg bg-brand px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60">
          {selectedSubjectBatch.length > 0 ? `Add Selected (${selectedSubjectBatch.length})` : "Add Subject"}
        </button>
        {duplicateRow ? (
          <div className="lg:col-span-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            Already exists in this class: {duplicateRow.name}
          </div>
        ) : null}
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
            Extract chapter draft after adding subject
          </label>
        </div>
        <div className="lg:col-span-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Safe import mode reads the PDF text, detects likely chapter headings, and lets you review them before creating chapters.
          It does not trust AI to invent the syllabus.
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
              Only used when the PDF is scanned or its text layer is weak.
            </span>
          </label>
        </div>
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
              {classSort === "asc" ? "A-Z" : "Z-A"}
            </button>
          </div>
          <label className="mt-2 block text-xs font-semibold text-slate-600">
            Search Class
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              value={classSearch}
              onChange={(e) => setClassSearch(e.target.value)}
              placeholder="Type class name"
            />
          </label>
          <p className="mt-2 text-[11px] text-slate-500">
            {visibleClasses.length} of {sortedClasses.length} shown
          </p>
          <div className="mt-2 space-y-2">
            {visibleClasses.length === 0 ? (
              <p className="text-xs text-slate-400">No classes found</p>
            ) : (
              visibleClasses.map((c) => (
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
        <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Existing Subjects</h3>
            <p className="text-xs text-slate-500">{filteredRows.length} of {rows.length} shown</p>
          </div>
          <div className="w-full max-w-sm space-y-2">
            <label className="block text-xs font-semibold text-slate-600">
              Search Subject
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to filter subjects" />
            </label>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={toggleSelectAllFilteredSubjects}
                disabled={!filteredRows.length}
                className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {allFilteredSelected ? "Unselect All Shown" : "Select All Shown"}
              </button>
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={!selectedSubjectIds.length}
                className="rounded bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete Selected ({selectedSubjectIds.length})
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-2">
        {filteredRows.length === 0 ? (
          <EmptyState title="No subjects found" description="Add subjects for this class to continue chapter and question setup." />
        ) : (
          filteredRows.map((row) => (
            <article key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/30 p-3 text-sm">
              {editId === row.id ? (
                <div className="flex w-full items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedSubjectIds.includes(row.id)}
                    onChange={() => toggleSubjectSelection(row.id)}
                    className="h-4 w-4"
                  />
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedSubjectIds.includes(row.id)}
                        onChange={() => toggleSubjectSelection(row.id)}
                        className="mt-0.5 h-4 w-4"
                      />
                      <h4 className="truncate text-sm font-bold text-slate-800">
                        {row.name}
                        <span className="ml-1 text-[11px] font-medium text-slate-500">
                          ({classNameById[row.class_id] || "Class"}, Updated {formatDateShort(row.created_at)})
                        </span>
                      </h4>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        Total Chapters: {chapterCountBySubject[row.id] || 0}
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
                      <button type="button" onClick={() => removeSubject(row.id)} className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                        Remove
                      </button>
                    </div>
                  </div>
                </>
              )}
            </article>
          ))
        )}
        </div>
        </div>
      </div>
      {outlineLoading && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600">
          {outlineProgress || "Reading PDF and preparing outline draft..."}
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
              <h3 className="text-sm font-bold text-slate-700">Imported Outline Draft</h3>
              <p className="text-xs text-slate-500">
                Source: {outlineDraft.source_name} | Status: {outlineDraft.status}
              </p>
              {lastOutlineFileName ? (
                <p className="text-[11px] text-slate-400">Analyzed file: {lastOutlineFileName}</p>
              ) : null}
              <p className="mt-1 text-[11px] text-slate-500">
                Review the detected chapter names. Edit anything that looks wrong before creating chapters.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addDraftChapter}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Add Row
              </button>
              <button
                type="button"
                onClick={regenerateOutline}
                disabled={outlineRegenerating || outlineLoading}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
              >
                {outlineRegenerating ? "Re-extracting..." : "Re-extract from PDF"}
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
            {outlineDraft.outline.map((chapter, index) => {
              const checked = outlineSelectedTitles.includes(chapter.title);
              return (
                <div key={`${chapter.title}-${index}`} className="rounded-lg border border-slate-100 px-3 py-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setOutlineSelectedTitles((prev) => (
                          e.target.checked
                            ? [...prev, chapter.title]
                            : prev.filter((title) => title !== chapter.title)
                        ));
                      }}
                      disabled={outlineDraft.status === "approved"}
                      className="mt-1"
                    />
                    <div className="grid flex-1 gap-3 md:grid-cols-[1.1fr_1fr_auto]">
                      <label className="text-xs font-semibold text-slate-600">
                        Chapter Title
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
                          value={chapter.title}
                          onChange={(e) => renameDraftChapter(index, e.target.value)}
                          disabled={outlineDraft.status === "approved"}
                          placeholder="Enter chapter title"
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">
                        Topic Hints (comma separated)
                        <textarea
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700"
                          rows={2}
                          value={chapter.topics.join(", ")}
                          onChange={(e) => updateDraftTopics(index, e.target.value)}
                          disabled={outlineDraft.status === "approved"}
                          placeholder="Optional topic hints"
                        />
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removeDraftChapter(index)}
                          disabled={outlineDraft.status === "approved"}
                          className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
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
      <ConfirmModal
        open={bulkDeleteOpen}
        title="Delete Selected Subjects"
        message={`Delete ${selectedSubjectIds.length} selected subject(s)?\n\nRelated chapters and questions will also be removed.`}
        confirmLabel="Delete Selected"
        loading={bulkDeleting}
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
      />
    </div>
  );
}
