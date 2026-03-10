import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { downloadQuestionTemplate } from "@/utils/templateGenerator";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { discussGenerationStrategy, generateQuestionsFromPdf, type AIGeneratedQuestion, type ChatMessage } from "@/services/ai";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ContextBreadcrumbs } from "@/components/ContextBreadcrumbs";
import { EmptyState } from "@/components/EmptyState";
import { useHierarchyScopeParams } from "@/hooks/useHierarchyScopeParams";
import { addQuestions, deleteQuestionsByIds, getQuestions, updateQuestionById } from "@/services/repositories";
import { useUndoDeleteQueue } from "@/hooks/useUndoDeleteQueue";
import { useAppStore } from "@/store/useAppStore";
import { useHierarchy } from "@/hooks/useHierarchy";
import { hierarchyScopeToSearch } from "@/utils/hierarchyScope";
import type { BloomLevel, Difficulty, Question, QuestionLevel, QuestionType } from "@/types/domain";

const questionTypes: QuestionType[] = ["mcq", "true_false", "fill_blanks", "short", "long", "matching", "diagram"];
const difficultyLevels: Difficulty[] = ["easy", "medium", "hard"];
const blooms: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate"];
const questionLevels: Array<{ id: QuestionLevel; label: string }> = [
  { id: "exercise", label: "Exercise Question" },
  { id: "additional", label: "Additional Question" },
  { id: "past_papers", label: "Past Papers" },
  { id: "examples", label: "Exercise Examples" },
  { id: "conceptual", label: "Conceptual Question" },
];

const quickPresets: { label: string; type: QuestionType; diff: Difficulty; bloom: BloomLevel }[] = [
  { label: "mcq", type: "mcq", diff: "easy", bloom: "remember" },
  { label: "true_false", type: "true_false", diff: "easy", bloom: "remember" },
  { label: "fill_blanks", type: "fill_blanks", diff: "easy", bloom: "remember" },
  { label: "short", type: "short", diff: "medium", bloom: "understand" },
  { label: "long", type: "long", diff: "hard", bloom: "analyze" },
  { label: "matching", type: "matching", diff: "medium", bloom: "apply" },
  { label: "diagram", type: "diagram", diff: "medium", bloom: "apply" },
];

const uploadColumnsByType: Record<QuestionType, string[]> = {
  mcq: ["question_text", "option_a", "option_b", "option_c", "option_d", "correct_answer", "difficulty", "bloom_level", "explanation"],
  true_false: ["question_text", "correct_answer", "difficulty", "bloom_level", "explanation"],
  fill_blanks: ["question_text", "correct_answer", "difficulty", "bloom_level", "explanation"],
  short: ["question_text", "difficulty", "bloom_level", "explanation"],
  long: ["question_text", "difficulty", "bloom_level", "explanation"],
  matching: ["question_text", "correct_answer", "difficulty", "bloom_level", "explanation"],
  diagram: ["question_text", "diagram_url", "correct_answer", "difficulty", "bloom_level", "explanation"],
};

const sampleRowsByType: Record<QuestionType, Record<string, string | number>> = {
  mcq: { question_text: "Which organ pumps blood?", option_a: "Liver", option_b: "Heart", option_c: "Lungs", option_d: "Kidney", correct_answer: "B", difficulty: "easy", bloom_level: "remember", explanation: "Heart pumps blood." },
  true_false: { question_text: "The sun rises in the east.", correct_answer: "True", difficulty: "easy", bloom_level: "remember", explanation: "Factual statement." },
  fill_blanks: { question_text: "Water boils at ___ degree Celsius.", correct_answer: "100", difficulty: "easy", bloom_level: "remember", explanation: "At sea level." },
  short: { question_text: "Write two functions of roots.", difficulty: "medium", bloom_level: "understand", explanation: "Any two valid functions." },
  long: { question_text: "Explain photosynthesis in detail.", difficulty: "hard", bloom_level: "analyze", explanation: "Include full process." },
  matching: { question_text: "Match Column A with B.", correct_answer: "A-2;B-1;C-4;D-3", difficulty: "medium", bloom_level: "apply", explanation: "Use pair mapping." },
  diagram: { question_text: "Label the plant diagram.", diagram_url: "https://example.com/plant.png", correct_answer: "Root, Stem, Leaf", difficulty: "medium", bloom_level: "apply", explanation: "Label major parts." },
};

const typeHints: Record<QuestionType, string> = {
  mcq: "Enter question + 4 options, then choose correct option (A/B/C/D).",
  true_false: "Enter statement and set correct answer as True or False.",
  fill_blanks: "Use blank placeholder in question text (e.g. ___) and provide correct answer.",
  short: "Enter short response question. Correct answer is optional and not required.",
  long: "Enter descriptive question. Correct answer is optional and not required.",
  matching: "Optionally enter Column A/B pairs and set mapping in Correct Answer (e.g. A-2;B-1;C-4;D-3).",
  diagram: "Attach diagram image (URL/upload) and provide labeling key in Correct Answer.",
};

type UploadPreviewRow = {
  index: number;
  questionText: string;
  status: "valid" | "error";
  message: string;
  mapped?: Omit<Question, "id" | "created_at">;
};

type EditQuestionDraft = {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  difficulty: Difficulty;
  bloom_level: BloomLevel | "";
  question_level: QuestionLevel;
  explanation: string;
  diagram_url: string;
};

type DeleteQuestionIntent = {
  ids: string[];
  snapshots: Question[];
  message: string;
};


export function QuestionBankPage() {
  const navigate = useNavigate();
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const { scope, mergeScope, clearFrom, scopeToLevel } = useHierarchyScopeParams();
  const { queueDelete } = useUndoDeleteQueue();

  const [viewMode, setViewMode] = useState<"add" | "manage">("manage");
  const {
    examBodies,
    classes,
    subjects,
    chapters,
    examBodyId,
    setExamBodyId,
    classId,
    setClassId,
    subjectId,
    setSubjectId,
    chapterId,
    setChapterId,
  } = useHierarchy(profile?.school_id, { initialScope: scope, autoSelectFirst: false });

  const [rowsCount, setRowsCount] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [manageDifficulty, setManageDifficulty] = useState<Difficulty | "all">("all");
  const [manageType, setManageType] = useState<QuestionType | "all">("all");
  const [manageBloom, setManageBloom] = useState<BloomLevel | "all">("all");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editDraft, setEditDraft] = useState<EditQuestionDraft | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteIntent, setDeleteIntent] = useState<DeleteQuestionIntent | null>(null);
  const [isDeletingQuestions, setIsDeletingQuestions] = useState(false);

  const [entryMode, setEntryMode] = useState<"manual" | "upload" | "ai" | "">("");

  const [questionType, setQuestionType] = useState<QuestionType>("mcq");
  const [questionText, setQuestionText] = useState("");
  const [diff, setDiff] = useState<Difficulty>("easy");
  const [bloom, setBloom] = useState<BloomLevel | "">("");
  const [qLevel, setQLevel] = useState<QuestionLevel>("exercise");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState("A");
  const [diagramUrl, setDiagramUrl] = useState("");
  const [diagramInputMode, setDiagramInputMode] = useState<"url" | "upload">("url");
  const [diagramFileName, setDiagramFileName] = useState("");
  const [explanation, setExplanation] = useState("");
  const [matchingLeft, setMatchingLeft] = useState(["", "", "", ""]);
  const [matchingRight, setMatchingRight] = useState(["", "", "", ""]);

  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadPreview, setUploadPreview] = useState<UploadPreviewRow[]>([]);
  const [lastImportIds, setLastImportIds] = useState<string[]>([]);
  const [aiPdfFile, setAiPdfFile] = useState<File | null>(null);
  const [aiCount, setAiCount] = useState(10);
  const [aiDiff, setAiDiff] = useState<Difficulty>("medium");
  const [aiBloom, setAiBloom] = useState<BloomLevel | "">("");
  const [aiQLevel, setAiQLevel] = useState<QuestionLevel>("exercise");
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiGenerated, setAiGenerated] = useState<Array<{ question_text: string; options?: string[]; correct_answer?: string; explanation?: string; difficulty?: Difficulty; bloom_level?: BloomLevel; question_level?: QuestionLevel; diagram_url?: string }>>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Chat Lab State
  const [chatMode, setChatMode] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [chatGenerated, setChatGenerated] = useState<AIGeneratedQuestion[]>([]);

  const [step, setStep] = useState(1);
  const [showPreview, setShowPreview] = useState(false);
  const [aiStartPage, setAiStartPage] = useState(1);
  const [aiEndPage, setAiEndPage] = useState(10);
  const [rawUploadData, setRawUploadData] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [showMapper, setShowMapper] = useState(false);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  const step2Theme = useMemo(() => {
    if (questionType === "mcq" || questionType === "true_false") return "border-cyan-300 bg-cyan-50";
    if (questionType === "short" || questionType === "long") return "border-amber-300 bg-amber-50";
    if (questionType === "diagram" || questionType === "matching") return "border-emerald-300 bg-emerald-50";
    return "border-violet-300 bg-violet-50";
  }, [questionType]);

  async function fetchQuestions() {
    if (!profile?.school_id) return;
    setLoadingQuestions(true);
    try {
      const data = await getQuestions(profile.school_id, chapterId ? [chapterId] : undefined);
      setQuestions(data);
      setRowsCount(data.length);
    } finally {
      setLoadingQuestions(false);
    }
  }

  useEffect(() => {
    if (viewMode === "manage") {
      fetchQuestions();
    }
  }, [viewMode, chapterId, profile?.school_id]);

  const visibleSubjects = useMemo(() => subjects.filter((s) => !classId || s.class_id === classId), [subjects, classId]);
  const visibleChapters = useMemo(() => chapters.filter((c) => !subjectId || c.subject_id === subjectId), [chapters, subjectId]);
  const selectedExamBodyName = examBodies.find((b) => b.id === examBodyId)?.name;
  const selectedClassName = classes.find((c) => c.id === classId)?.name;
  const selectedSubjectName = subjects.find((s) => s.id === subjectId)?.name;
  const selectedChapterName = chapterId ? chapters.find((c) => c.id === chapterId)?.title : "All Chapters";

  function applyExamBody(nextExamBodyId: string) {
    setExamBodyId(nextExamBodyId);
    mergeScope({ examBodyId: nextExamBodyId || undefined, classId: undefined, subjectId: undefined, chapterId: undefined });
  }

  function applyClass(nextClassId: string) {
    setClassId(nextClassId);
    mergeScope({ examBodyId: examBodyId || undefined, classId: nextClassId || undefined, subjectId: undefined, chapterId: undefined });
  }

  function applySubject(nextSubjectId: string) {
    setSubjectId(nextSubjectId);
    mergeScope({ examBodyId: examBodyId || undefined, classId: classId || undefined, subjectId: nextSubjectId || undefined, chapterId: undefined });
  }

  function applyChapter(nextChapterId: string) {
    setChapterId(nextChapterId);
    mergeScope({
      examBodyId: examBodyId || undefined,
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      chapterId: nextChapterId || undefined,
    });
  }

  const filteredQuestions = useMemo(
    () =>
      questions.filter((q) => {
        const matchesSearch = q.question_text.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDifficulty = manageDifficulty === "all" || q.difficulty === manageDifficulty;
        const matchesType = manageType === "all" || q.question_type === manageType;
        const matchesBloom = manageBloom === "all" || (q.bloom_level || "") === manageBloom;
        return matchesSearch && matchesDifficulty && matchesType && matchesBloom;
      }),
    [questions, searchQuery, manageDifficulty, manageType, manageBloom]
  );

  const visibleQuestionIds = useMemo(() => filteredQuestions.map((q) => q.id), [filteredQuestions]);
  const allVisibleSelected = visibleQuestionIds.length > 0 && visibleQuestionIds.every((id) => selectedQuestionIds.includes(id));
  const selectedVisibleCount = visibleQuestionIds.filter((id) => selectedQuestionIds.includes(id)).length;

  function normalizeQuestionPrefix(value: string) {
    return value.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 50);
  }

  async function getChapterQuestionsForDuplicateCheck(targetChapterId: string) {
    if (!profile?.school_id) return [] as Question[];
    const cached = questions.filter((q) => q.chapter_id === targetChapterId);
    if (cached.length > 0) return cached;
    return getQuestions(profile.school_id, [targetChapterId]);
  }

  async function findDuplicateQuestion(targetChapterId: string, questionTextValue: string, excludeQuestionId?: string) {
    const prefix = normalizeQuestionPrefix(questionTextValue);
    if (!prefix) return null;
    const pool = await getChapterQuestionsForDuplicateCheck(targetChapterId);
    return pool.find((q) => q.id !== excludeQuestionId && normalizeQuestionPrefix(q.question_text) === prefix) || null;
  }

  function toggleQuestionSelection(questionId: string) {
    setSelectedQuestionIds((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    );
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedQuestionIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, ...visibleQuestionIds]));
      }
      return prev.filter((id) => !visibleQuestionIds.includes(id));
    });
  }

  useEffect(() => {
    setSelectedQuestionIds((prev) => prev.filter((id) => questions.some((q) => q.id === id)));
  }, [questions]);

  useEffect(() => {
    if (questionType === "mcq") {
      setOptions(["", "", "", ""]);
      setCorrect("A");
      setDiagramUrl("");
    } else if (questionType === "true_false") {
      setOptions(["True", "False", "", ""]);
      setCorrect("True");
      setDiagramUrl("");
    } else if (questionType === "fill_blanks") {
      setOptions(["", "", "", ""]);
      setCorrect("");
      setDiagramUrl("");
    } else if (questionType === "short" || questionType === "long") {
      setOptions(["", "", "", ""]);
      setCorrect("");
      setDiagramUrl("");
    } else if (questionType === "matching") {
      setOptions(["", "", "", ""]);
      setCorrect("A-1;B-2");
      setDiagramUrl("");
      setMatchingLeft(["", "", "", ""]);
      setMatchingRight(["", "", "", ""]);
    } else if (questionType === "diagram") {
      setOptions(["", "", "", ""]);
      setCorrect("");
      setDiagramInputMode("url");
      setDiagramFileName("");
    }
    setUploadPreview([]);
    setUploadFileName("");
  }, [questionType]);

  const correctChoices = questionType === "mcq" ? ["A", "B", "C", "D"] : questionType === "true_false" ? ["True", "False"] : [];
  const needsOptions = questionType === "mcq" || questionType === "true_false";
  const needsCorrect = ["mcq", "true_false", "fill_blanks", "matching", "diagram"].includes(questionType);
  const visibleOptionCount = questionType === "true_false" ? 2 : 4;

  function resetManualFields() {
    setQuestionText("");
    setExplanation("");
    setDiagramUrl("");
    setDiagramInputMode("url");
    setDiagramFileName("");
    setMatchingLeft(["", "", "", ""]);
    setMatchingRight(["", "", "", ""]);
    if (questionType === "mcq") {
      setOptions(["", "", "", ""]);
      setCorrect("A");
    }
    if (questionType === "true_false") {
      setOptions(["True", "False", "", ""]);
      setCorrect("True");
    }
    // NOT resetting marks, diff, bloom for "Rapid-Fire" entry
  }

  async function saveManual(closeAfter = false) {
    if (!profile?.school_id || !chapterId || !questionText.trim()) {
      toast("error", "Question text and chapter are required");
      return;
    }
    if (questionType === "mcq") {
      const [oa, ob, oc, od] = options.map((x) => x.trim());
      if (!oa || !ob || !oc || !od) {
        toast("error", "MCQ requires Option A, B, C and D");
        return;
      }
      if (!["A", "B", "C", "D"].includes(correct)) {
        toast("error", "MCQ correct answer must be A/B/C/D");
        return;
      }
    }
    if (questionType === "true_false") {
      if (!["True", "False"].includes(correct)) {
        toast("error", "True/False correct answer must be True or False");
        return;
      }
    }
    if (questionType === "fill_blanks" && !correct.trim()) {
      toast("error", "Fill in the blanks requires correct answer");
      return;
    }
    if (questionType === "matching" && !correct.trim()) {
      toast("error", "Matching requires answer mapping (e.g. A-2;B-1)");
      return;
    }
    if (questionType === "diagram" && !diagramUrl.trim()) {
      toast("error", "Diagram image is required for diagram question type");
      return;
    }
    if (questionType === "diagram" && !correct.trim()) {
      toast("error", "Correct answer / labeling key is required for diagram questions");
      return;
    }

    const duplicate = await findDuplicateQuestion(chapterId, questionText);
    if (duplicate) {
      toast("error", "Duplicate question detected in this chapter (same first 50 characters)");
      return;
    }

    const isMatching = questionType === "matching";
    const hasMatchingPairs = matchingLeft.some((x) => x.trim()) || matchingRight.some((x) => x.trim());
    const formattedMatchingText = isMatching && hasMatchingPairs
      ? `${questionText.trim()}\n\nColumn A:\n${matchingLeft
        .map((item, i) => `${String.fromCharCode(65 + i)}) ${item || "-"}`)
        .join("\n")}\n\nColumn B:\n${matchingRight.map((item, i) => `${i + 1}) ${item || "-"}`).join("\n")}`
      : questionText.trim();

    await addQuestions([
      {
        school_id: profile.school_id,
        chapter_id: chapterId,
        question_type: questionType,
        question_text: formattedMatchingText,
        option_a: needsOptions ? options[0] || null : null,
        option_b: needsOptions ? options[1] || null : null,
        option_c: questionType === "mcq" ? options[2] || null : null,
        option_d: questionType === "mcq" ? options[3] || null : null,
        correct_answer: needsCorrect ? correct || null : null,
        difficulty: diff,
        bloom_level: bloom ? bloom : undefined,
        question_level: qLevel,
        explanation: explanation || null,
        diagram_url: questionType === "diagram" ? diagramUrl || null : null,
      },
    ]);

    toast("success", "Question added");
    resetManualFields();
    if (closeAfter) setEntryMode("");
    fetchQuestions();
  }

  async function onManualSubmit(e: FormEvent) {
    e.preventDefault();
    await saveManual(false);
  }

  function removeAiItem(idx: number) {
    setAiGenerated((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSendChatMessage() {
    if (!chatInput.trim() || isChatting) return;

    const userMsg: ChatMessage = { role: "user", content: chatInput };
    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setChatInput("");
    setIsChatting(true);

    try {
      const resp = await discussGenerationStrategy(newHistory, chatFile || aiPdfFile || undefined);
      const assistantMsg: ChatMessage & { questions?: AIGeneratedQuestion[] } = {
        role: "assistant",
        content: resp.message,
        questions: resp.generatedQuestions
      };
      setChatMessages([...newHistory, assistantMsg]);

      if (resp.generatedQuestions && resp.generatedQuestions.length > 0) {
        toast("success", `AI generated ${resp.generatedQuestions.length} questions! Review them in the chat.`);
      }

      // If AI suggested a config, we can handle it (maybe show a toast or auto-apply if certain)
      if (resp.suggestedConfig) {
        const { questionType: qt, count, difficulty: d, bloomLevel: bl, questionLevel: ql, instructions: inst } = resp.suggestedConfig;
        if (qt) setQuestionType(qt);
        if (count) setAiCount(count);
        if (d) setAiDiff(d);
        if (bl !== undefined) setAiBloom(bl);
        if (ql) setAiQLevel(ql);
        if (inst) setAiInstructions(inst);
        toast("success", "AI has updated your generation settings based on our discussion!");
      }
    } catch (err) {
      toast("error", "Failed to get AI response");
    } finally {
      setIsChatting(false);
    }
  }

  async function addChatQuestions(questions: AIGeneratedQuestion[]) {
    if (!profile?.school_id || !chapterId) {
      toast("error", "Please select Subject/Chapter first in Step 1");
      return;
    }
    try {
      const mapped = questions.map(q => ({
        ...q,
        school_id: profile.school_id,
        chapter_id: chapterId,
        subject_id: subjectId,
        difficulty: q.difficulty || aiDiff,
        bloom_level: q.bloom_level || aiBloom || undefined,
        question_level: q.question_level || aiQLevel,
        options: q.options || [],
        correct_answer: q.correct_answer || "",
        explanation: q.explanation || ""
      } as any));
      await addQuestions(mapped);
      toast("success", `Successfully added ${questions.length} questions to the bank!`);
    } catch (err) {
      toast("error", "Failed to add questions");
    }
  }

  function updateAiItem(idx: number, field: string, value: any) {
    setAiGenerated((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function onManualKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      await saveManual(false);
    }
  }

  async function handleDiagramFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast("error", "Please select an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDiagramUrl(String(reader.result || ""));
      setDiagramFileName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function normalizeHeaders(row: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim().replace(/\s+/g, "_"), typeof v === "string" ? v.trim() : v]));
  }

  function validateAndMapUploadRow(raw: Record<string, unknown>, index: number): UploadPreviewRow {
    const row = normalizeHeaders(raw);
    const qText = String(row.question_text ?? "").trim();
    if (!qText) {
      return { index, questionText: "", status: "error", message: "Missing question_text" };
    }

    const d = String(row.difficulty ?? diff).toLowerCase();
    const b = row.bloom_level ? String(row.bloom_level).toLowerCase() : "";
    const ql = String(row.question_level ?? qLevel).toLowerCase();

    if (!["easy", "medium", "hard"].includes(d)) {
      return { index, questionText: qText, status: "error", message: "Invalid difficulty" };
    }
    if (b && !["remember", "understand", "apply", "analyze", "evaluate"].includes(b)) {
      return { index, questionText: qText, status: "error", message: "Invalid bloom_level" };
    }
    if (!["exercise", "additional", "past_papers", "examples", "conceptual"].includes(ql)) {
      return { index, questionText: qText, status: "error", message: "Invalid question_level" };
    }

    const mapped: Omit<Question, "id" | "created_at"> = {
      school_id: profile!.school_id!,
      chapter_id: chapterId,
      question_type: questionType,
      question_text: qText,
      option_a: null,
      option_b: null,
      option_c: null,
      option_d: null,
      correct_answer: null,
      difficulty: d as Difficulty,
      bloom_level: b ? (b as BloomLevel) : undefined,
      question_level: ql as QuestionLevel,
      explanation: row.explanation ? String(row.explanation) : null,
      diagram_url: null,
    };

    if (questionType === "mcq") {
      const oa = String(row.option_a ?? "").trim();
      const ob = String(row.option_b ?? "").trim();
      const oc = String(row.option_c ?? "").trim();
      const od = String(row.option_d ?? "").trim();
      const ans = String(row.correct_answer ?? "").trim().toUpperCase();
      if (!oa || !ob || !oc || !od || !["A", "B", "C", "D"].includes(ans)) {
        return { index, questionText: qText, status: "error", message: "MCQ needs option_a..option_d and correct_answer A/B/C/D" };
      }
      mapped.option_a = oa;
      mapped.option_b = ob;
      mapped.option_c = oc;
      mapped.option_d = od;
      mapped.correct_answer = ans;
    }

    if (questionType === "true_false") {
      const ans = String(row.correct_answer ?? "").trim();
      if (!["True", "False", "true", "false"].includes(ans)) {
        return { index, questionText: qText, status: "error", message: "True/False needs correct_answer True/False" };
      }
      mapped.option_a = "True";
      mapped.option_b = "False";
      mapped.correct_answer = ans[0].toUpperCase() + ans.slice(1).toLowerCase();
    }

    if (questionType === "fill_blanks" || questionType === "matching") {
      const ans = String(row.correct_answer ?? "").trim();
      if (!ans) {
        return { index, questionText: qText, status: "error", message: "correct_answer required" };
      }
      mapped.correct_answer = ans;
    }

    if (questionType === "diagram") {
      const diagram = String(row.diagram_url ?? "").trim();
      if (!diagram) {
        return { index, questionText: qText, status: "error", message: "diagram_url required" };
      }
      mapped.diagram_url = diagram;
      mapped.correct_answer = row.correct_answer ? String(row.correct_answer) : null;
    }

    return { index, questionText: qText, status: "valid", message: "Ready", mapped };
  }

  function downloadTemplate(type: QuestionType) {
    const cols = uploadColumnsByType[type];
    const sample = sampleRowsByType[type];
    const row = Object.fromEntries(cols.map((c) => [c, sample[c] ?? ""]));
    const ws = XLSX.utils.json_to_sheet([row], { header: cols });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "questions");
    XLSX.writeFile(wb, `${type}-questions-template.xlsx`);
  }

  async function handleClone(q: Question) {
    setQuestionType(q.question_type);
    setQuestionText(q.question_text);
    setOptions([q.option_a || "", q.option_b || "", q.option_c || "", q.option_d || ""]);
    setCorrect(q.correct_answer || "");
    setExplanation(q.explanation || "");
    setDiff(q.difficulty);
    setBloom(q.bloom_level || "");
    setQLevel(q.question_level || "exercise");
    setDiagramUrl(q.diagram_url || "");

    setViewMode("add");
    setStep(3);
    setEntryMode("manual");
    toast("success", "Question cloned to form");
  }

  function handleEdit(q: Question) {
    setEditingQuestion(q);
    setEditDraft({
      question_text: q.question_text || "",
      option_a: q.option_a || "",
      option_b: q.option_b || "",
      option_c: q.option_c || "",
      option_d: q.option_d || "",
      correct_answer: q.correct_answer || "",
      difficulty: q.difficulty,
      bloom_level: q.bloom_level || "",
      question_level: q.question_level,
      explanation: q.explanation || "",
      diagram_url: q.diagram_url || "",
    });
  }

  async function saveEdit() {
    if (!editingQuestion || !editDraft) return;
    const nextText = editDraft.question_text.trim();
    if (!nextText) {
      toast("error", "Question text is required");
      return;
    }

    if (editingQuestion.question_type === "mcq") {
      if (!editDraft.option_a.trim() || !editDraft.option_b.trim() || !editDraft.option_c.trim() || !editDraft.option_d.trim()) {
        toast("error", "MCQ requires Option A, B, C and D");
        return;
      }
      if (!["A", "B", "C", "D"].includes(editDraft.correct_answer)) {
        toast("error", "MCQ correct answer must be A/B/C/D");
        return;
      }
    }

    if (editingQuestion.question_type === "true_false" && !["True", "False"].includes(editDraft.correct_answer)) {
      toast("error", "True/False correct answer must be True or False");
      return;
    }

    if (["fill_blanks", "matching", "diagram"].includes(editingQuestion.question_type) && !editDraft.correct_answer.trim()) {
      toast("error", "Correct answer is required for this question type");
      return;
    }

    if (editingQuestion.question_type === "diagram" && !editDraft.diagram_url.trim()) {
      toast("error", "Diagram URL is required for diagram questions");
      return;
    }

    const duplicate = await findDuplicateQuestion(editingQuestion.chapter_id, nextText, editingQuestion.id);
    if (duplicate) {
      toast("error", "Duplicate question detected in this chapter (same first 50 characters)");
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateQuestionById(editingQuestion.id, {
        question_text: nextText,
        option_a: editingQuestion.question_type === "mcq" || editingQuestion.question_type === "true_false" ? editDraft.option_a.trim() || null : null,
        option_b: editingQuestion.question_type === "mcq" || editingQuestion.question_type === "true_false" ? editDraft.option_b.trim() || null : null,
        option_c: editingQuestion.question_type === "mcq" ? editDraft.option_c.trim() || null : null,
        option_d: editingQuestion.question_type === "mcq" ? editDraft.option_d.trim() || null : null,
        correct_answer: editDraft.correct_answer.trim() || null,
        difficulty: editDraft.difficulty,
        bloom_level: editDraft.bloom_level || undefined,
        question_level: editDraft.question_level,
        explanation: editDraft.explanation.trim() || null,
        diagram_url: editingQuestion.question_type === "diagram" ? editDraft.diagram_url.trim() || null : null,
      });
      toast("success", "Question updated");
      setEditingQuestion(null);
      setEditDraft(null);
      fetchQuestions();
    } finally {
      setIsSavingEdit(false);
    }
  }

  function applyQuestionState(next: Question[]) {
    setQuestions(next);
    setRowsCount(next.length);
  }

  function prepareDeleteIntent(ids: string[], message: string) {
    const snapshots = questions.filter((question) => ids.includes(question.id));
    if (!snapshots.length) {
      toast("error", "No matching questions found");
      return;
    }
    setDeleteIntent({ ids, snapshots, message });
  }

  async function confirmDeleteIntent() {
    if (!deleteIntent) return;
    setIsDeletingQuestions(true);
    const { ids, snapshots } = deleteIntent;
    applyQuestionState(questions.filter((question) => !ids.includes(question.id)));
    setSelectedQuestionIds((prev) => prev.filter((id) => !ids.includes(id)));
    queueDelete({
      label: ids.length > 1 ? `${ids.length} questions` : "Question",
      commit: () => deleteQuestionsByIds(ids),
      rollback: () => {
        const restored = [...snapshots, ...questions.filter((question) => !snapshots.some((snap) => snap.id === question.id))]
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        applyQuestionState(restored);
      },
      successMessage: ids.length > 1 ? `${ids.length} questions deleted` : "Question deleted",
      failureMessage: "Failed to delete question(s)",
    });
    setDeleteIntent(null);
    setIsDeletingQuestions(false);
  }

  async function deleteSelectedQuestions() {
    if (!selectedQuestionIds.length) {
      toast("error", "No questions selected");
      return;
    }
    prepareDeleteIntent(selectedQuestionIds, `Delete ${selectedQuestionIds.length} selected question(s)?`);
  }
  async function handleFileSelection(file: File) {
    if (!profile?.school_id || !chapterId) return;

    let rows: any[] = [];
    let headers: string[] = [];

    if (file.name.toLowerCase().endsWith(".csv")) {
      const text = await file.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      rows = parsed.data;
      headers = parsed.meta.fields || [];
    } else {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet);
      if (rows.length > 0) headers = Object.keys(rows[0]);
    }

    setDetectedHeaders(headers);
    setRawUploadData(rows);
    setUploadFileName(file.name);

    // Auto-detect mappings
    const initialMapping: Record<string, string> = {};
    const systemHeaders = ["question_text", "correct_answer", "difficulty", "bloom_level", "question_level", "explanation"];
    if (questionType === "mcq") systemHeaders.push("option_a", "option_b", "option_c", "option_d");

    systemHeaders.forEach(sys => {
      const match = headers.find(h => h.toLowerCase().replace(/[\s_]/g, "") === sys.toLowerCase().replace(/[\s_]/g, ""));
      if (match) initialMapping[sys] = match;
    });
    setColumnMapping(initialMapping);
    setShowMapper(true);
    setUploadPreview([]); // Reset preview until mapping applied
  }

  function applyMapping() {
    const validated = rawUploadData.map((row, idx) => {
      const mappedRow: Record<string, unknown> = {
        question_text: columnMapping["question_text"] ? row[columnMapping["question_text"]] : "",
        correct_answer: columnMapping["correct_answer"] ? row[columnMapping["correct_answer"]] : "",
        difficulty: columnMapping["difficulty"] ? row[columnMapping["difficulty"]] : "medium",
        bloom_level: columnMapping["bloom_level"] ? row[columnMapping["bloom_level"]] : "",
        question_level: columnMapping["question_level"] ? row[columnMapping["question_level"]] : "exercise",
        explanation: columnMapping["explanation"] ? row[columnMapping["explanation"]] : "",
        diagram_url: columnMapping["diagram_url"] ? row[columnMapping["diagram_url"]] : "",
      };
      if (questionType === "mcq") {
        mappedRow.option_a = columnMapping["option_a"] ? row[columnMapping["option_a"]] : "";
        mappedRow.option_b = columnMapping["option_b"] ? row[columnMapping["option_b"]] : "";
        mappedRow.option_c = columnMapping["option_c"] ? row[columnMapping["option_c"]] : "";
        mappedRow.option_d = columnMapping["option_d"] ? row[columnMapping["option_d"]] : "";
      }
      return validateAndMapUploadRow(mappedRow, idx + 1);
    });
    setUploadPreview(validated);
    setShowMapper(false);
    toast("success", `Mapped ${validated.length} questions successfully`);
  }

  async function submitUpload() {
    const validRows = uploadPreview.filter((x) => x.status === "valid" && x.mapped).map((x) => x.mapped!) as Omit<Question, "id" | "created_at">[];
    if (!validRows.length) {
      toast("error", "No valid rows to import");
      return;
    }
    const existing = chapterId ? await getChapterQuestionsForDuplicateCheck(chapterId) : [];
    const seenPrefixes = new Set(existing.map((q) => normalizeQuestionPrefix(q.question_text)));
    const uniqueRows: Omit<Question, "id" | "created_at">[] = [];
    let skippedDuplicates = 0;

    for (const row of validRows) {
      const prefix = normalizeQuestionPrefix(row.question_text || "");
      if (!prefix) continue;
      if (seenPrefixes.has(prefix)) {
        skippedDuplicates += 1;
        continue;
      }
      seenPrefixes.add(prefix);
      uniqueRows.push(row);
    }

    if (!uniqueRows.length) {
      toast("error", "All rows were duplicates based on the first 50 characters");
      return;
    }

    const inserted = await addQuestions(uniqueRows);
    setLastImportIds(inserted.map((q) => q.id));
    toast("success", skippedDuplicates ? `${inserted.length} questions imported, ${skippedDuplicates} duplicates skipped` : `${inserted.length} questions imported`);
    setUploadFileName("");
    setUploadPreview([]);
    fetchQuestions();
  }

  async function undoLastImport() {
    if (!lastImportIds.length) {
      toast("error", "No recent import to undo");
      return;
    }
    await deleteQuestionsByIds(lastImportIds);
    setLastImportIds([]);
    toast("success", "Last import undone");
    fetchQuestions();
  }

  async function generateFromAI() {
    if (!aiPdfFile) {
      toast("error", "Upload PDF first");
      return;
    }
    setAiLoading(true);
    try {
      const questions = await generateQuestionsFromPdf({
        file: aiPdfFile,
        questionType,
        count: Math.max(1, aiCount),
        difficulty: aiDiff,
        bloomLevel: aiBloom,
        questionLevel: aiQLevel,
        instructions: aiInstructions,
        startPage: aiStartPage,
        endPage: aiEndPage,
      });
      setAiGenerated(questions);
      toast("success", `AI generated ${questions.length} questions`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setAiLoading(false);
    }
  }

  async function saveAIGenerated() {
    if (!profile?.school_id || !chapterId || !aiGenerated.length) {
      toast("error", "No AI generated questions to save");
      return;
    }

    const payload: Omit<Question, "id" | "created_at">[] = aiGenerated
      .map((q) => {
        const base: Omit<Question, "id" | "created_at"> = {
          school_id: profile.school_id!,
          chapter_id: chapterId,
          question_type: questionType,
          question_text: q.question_text?.trim() || "",
          option_a: null,
          option_b: null,
          option_c: null,
          option_d: null,
          correct_answer: q.correct_answer || null,
          difficulty: q.difficulty || aiDiff,
          bloom_level: q.bloom_level || (aiBloom || undefined),
          question_level: q.question_level || aiQLevel,
          explanation: q.explanation || null,
          diagram_url: questionType === "diagram" ? q.diagram_url || null : null,
        };

        if (questionType === "mcq") {
          const opts = (q.options || []).slice(0, 4);
          base.option_a = opts[0] || null;
          base.option_b = opts[1] || null;
          base.option_c = opts[2] || null;
          base.option_d = opts[3] || null;
          base.correct_answer = (q.correct_answer || "A").toUpperCase();
        } else if (questionType === "true_false") {
          base.option_a = "True";
          base.option_b = "False";
          base.correct_answer = q.correct_answer || "True";
        }

        return base;
      })
      .filter((q) => q.question_text);

    if (!payload.length) {
      toast("error", "AI output is empty");
      return;
    }

    const existing = chapterId ? await getChapterQuestionsForDuplicateCheck(chapterId) : [];
    const seenPrefixes = new Set(existing.map((q) => normalizeQuestionPrefix(q.question_text)));
    const uniquePayload: Omit<Question, "id" | "created_at">[] = [];
    let skippedDuplicates = 0;

    for (const row of payload) {
      const prefix = normalizeQuestionPrefix(row.question_text || "");
      if (!prefix) continue;
      if (seenPrefixes.has(prefix)) {
        skippedDuplicates += 1;
        continue;
      }
      seenPrefixes.add(prefix);
      uniquePayload.push(row);
    }

    if (!uniquePayload.length) {
      toast("error", "All AI questions were duplicates based on the first 50 characters");
      return;
    }

    const inserted = await addQuestions(uniquePayload);
    setLastImportIds(inserted.map((q) => q.id));
    toast("success", skippedDuplicates ? `${inserted.length} AI questions saved, ${skippedDuplicates} duplicates skipped` : `${inserted.length} AI questions saved`);
    setAiGenerated([]);
    fetchQuestions();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold">Question Bank</h2>
          <p className="text-sm text-slate-600">Total questions: {rowsCount}</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          <button
            onClick={() => setViewMode("manage")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${viewMode === "manage" ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:text-brand"}`}
          >
            Manage
          </button>
          <button
            onClick={() => setViewMode("add")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${viewMode === "add" ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:text-brand"}`}
          >
            Add New
          </button>
        </div>
      </div>
      <ContextBreadcrumbs
        items={[
          {
            label: "Exam Body",
            value: selectedExamBodyName || "All Exam Bodies",
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
            count: visibleSubjects.length,
            onSelect: () => navigate({ pathname: "/subjects", search: hierarchyScopeToSearch(scopeToLevel("subjectId")) }),
            onClear: () => {
              setSubjectId("");
              clearFrom("subjectId");
            },
          },
          {
            label: "Chapter",
            value: selectedChapterName || "All Chapters",
            selected: !!chapterId,
            count: visibleChapters.length,
            onSelect: () => navigate({ pathname: "/chapters", search: hierarchyScopeToSearch(scopeToLevel("chapterId")) }),
            onClear: () => {
              setChapterId("");
              clearFrom("chapterId");
            },
          },
        ]}
      />

      {viewMode === "manage" ? (
        <>
          <div className="sticky top-2 z-10 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Context</p>
              <button onClick={() => setViewMode("add")} className="text-xs font-bold text-brand hover:underline">+ Add New From This Context</button>
            </div>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600">Exam Body
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={examBodyId} onChange={(e) => applyExamBody(e.target.value)}>
                  <option value="">All Exam Bodies</option>
                  {examBodies.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Class
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={classId} onChange={(e) => applyClass(e.target.value)}>
                  <option value="">All Classes</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Subject
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={subjectId} onChange={(e) => applySubject(e.target.value)}>
                  <option value="">All Subjects</option>
                  {visibleSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Chapter
                <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={chapterId} onChange={(e) => applyChapter(e.target.value)}>
                  <option value="">All Chapters</option>
                  {visibleChapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <label className="block text-xs font-semibold text-slate-600">
                Search Questions
                <input
                  type="text"
                  placeholder="Search questions by text..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </label>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Difficulty</p>
                  <div className="flex flex-wrap gap-2">
                    {(["all", ...difficultyLevels] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setManageDifficulty(value)}
                        className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${manageDifficulty === value ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Question Type</p>
                  <div className="flex flex-wrap gap-2">
                    {(["all", ...questionTypes] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setManageType(value)}
                        className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${manageType === value ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        {value.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Bloom Level</p>
                  <div className="flex flex-wrap gap-2">
                    {(["all", ...blooms] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setManageBloom(value)}
                        className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${manageBloom === value ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {selectedQuestionIds.length > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-2">
                <p className="text-xs font-semibold text-red-700">{selectedQuestionIds.length} selected</p>
                <button
                  type="button"
                  onClick={deleteSelectedQuestions}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                >
                  Delete Selected
                </button>
              </div>
            )}

            <div className="overflow-x-auto overflow-y-visible rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                        aria-label="Select all visible questions"
                      />
                    </th>
                    <th className="w-36 px-3 py-3">Type</th>
                    <th className="px-3 py-3">Question</th>
                    <th className="w-40 px-3 py-3">Metadata</th>
                    <th className="w-48 px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingQuestions && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">Loading questions...</td>
                    </tr>
                  )}

                  {!loadingQuestions && filteredQuestions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-4">
                        <EmptyState title="No questions found" description="Try another filter or add new questions in this chapter." />
                      </td>
                    </tr>
                  )}

                  {!loadingQuestions && filteredQuestions.map((q) => (
                    <tr key={q.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedQuestionIds.includes(q.id)}
                          onChange={() => toggleQuestionSelection(q.id)}
                          aria-label={`Select question ${q.id}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-700">
                          {q.question_type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="group relative max-w-2xl">
                          <p className="line-clamp-2 text-slate-800">{q.question_text}</p>
                          <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[30rem] rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-2xl group-hover:block">
                            <p className="font-semibold text-slate-800">{q.question_text}</p>
                            <div className="mt-2 space-y-1 text-slate-600">
                              <p><span className="font-bold text-slate-700">Answer:</span> {q.correct_answer || "--"}</p>
                              <p><span className="font-bold text-slate-700">Difficulty:</span> {q.difficulty}</p>
                              <p><span className="font-bold text-slate-700">Bloom:</span> {q.bloom_level || "--"}</p>
                              <p><span className="font-bold text-slate-700">Level:</span> {q.question_level}</p>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${q.difficulty === "hard" ? "bg-red-100 text-red-700" : q.difficulty === "medium" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {q.difficulty}
                          </span>
                          <p className="text-[10px] font-semibold uppercase text-slate-500">{q.bloom_level || "no bloom"}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => handleEdit(q)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Edit</button>
                          <button type="button" onClick={() => handleClone(q)} className="rounded-lg border border-brand/40 px-2 py-1 text-xs font-semibold text-brand hover:bg-brand/10">Clone</button>
                          <button
                            type="button"
                            onClick={() => {
                              prepareDeleteIntent([q.id], "Delete this question?");
                            }}
                            className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedVisibleCount > 0 && (
              <p className="text-xs text-slate-500">{selectedVisibleCount} visible row(s) currently selected.</p>
            )}
          </div>
        </>
      ) : (
        <div className="mx-auto max-w-4xl space-y-6">
          {/* 3-Step Wizard UI */}
          <div className="flex items-center justify-center space-x-8 px-4 py-4">
            {[
              { n: 1, label: "Context Selection" },
              { n: 2, label: "Input Method" },
              { n: 3, label: "Review & Save" }
            ].map((s) => (
              <div key={s.n} className="flex items-center space-x-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${step === s.n ? "bg-brand text-white ring-4 ring-brand/10 scale-110" : step > s.n ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                  {step > s.n ? <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg> : s.n}
                </div>
                <span className={`text-xs font-bold uppercase tracking-tight ${step === s.n ? "text-brand" : "text-slate-400"}`}>{s.label}</span>
                {s.n < 3 && <div className="h-[2px] w-8 bg-slate-200" />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50 transition-all animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-bold">Where would you like to add questions?</h3>
                <p className="text-sm text-slate-500">Select the book and chapter to ensure AI and Uploads are correctly assigned.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-slate-500">Exam Body</span>
                  <select className="flex h-12 w-full items-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium focus:border-brand focus:ring-1 focus:ring-brand" value={examBodyId} onChange={(e) => applyExamBody(e.target.value)}>
                    <option value="">All Exam Bodies</option>
                    {examBodies.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-slate-500">Board Class</span>
                  <select className="flex h-12 w-full items-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium focus:border-brand focus:ring-1 focus:ring-brand" value={classId} onChange={(e) => applyClass(e.target.value)}>
                    <option value="">All Classes</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-slate-500">Subject</span>
                  <select className="flex h-12 w-full items-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium focus:border-brand focus:ring-1 focus:ring-brand" value={subjectId} onChange={(e) => applySubject(e.target.value)}>
                    <option value="">All Subjects</option>
                    {visibleSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-slate-500">Specific Chapter</span>
                  <select className="flex h-12 w-full items-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium focus:border-brand focus:ring-1 focus:ring-brand" value={chapterId} onChange={(e) => applyChapter(e.target.value)}>
                    <option value="">-- Choose Chapter --</option>
                    {visibleChapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex justify-end pt-4">
                <button onClick={() => { if (!chapterId) toast("error", "Select a chapter first"); else setStep(2); }} className="flex items-center gap-2 rounded-xl bg-brand px-8 py-3 font-bold text-white shadow-lg shadow-brand/20 transition-transform active:scale-95">
                  Continue to Input
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center justify-between px-2">
                <button onClick={() => setStep(1)} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                  BACK TO CONTEXT
                </button>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Context</p>
                  <p className="text-xs font-bold text-slate-600">{chapters.find(c => c.id === chapterId)?.title}</p>
                </div>
              </div>

              <div className={`space-y-4 rounded-3xl border p-8 shadow-lg ${step2Theme}`}>
                <div className="space-y-1">
                  <h3 className="font-display text-xl font-bold">Choose your input method</h3>
                  <p className="text-sm text-slate-600">Select a question type and how you want to add it.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {quickPresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => { setQuestionType(preset.type); setDiff(preset.diff); setBloom(preset.bloom); }}
                      className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-6 py-4 transition-all ${questionType === preset.type ? "border-brand bg-white text-brand shadow-md scale-105" : "border-transparent bg-white/50 text-slate-600 hover:bg-white"}`}
                    >
                      <span className="text-xs font-bold uppercase tracking-widest">{preset.label}</span>
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 pt-4 sm:grid-cols-3">
                  {[
                    { id: "manual", label: "Manual Entry", desc: "Type it out", icon: "✍️" },
                    { id: "upload", label: "Smart Bulk", desc: "Excel/CSV Upload", icon: "📤" },
                    { id: "ai", label: "AI Generator", desc: "Extract from PDF", icon: "✨" }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => { setEntryMode(mode.id as any); setStep(3); }}
                      className={`relative flex flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition-all ${entryMode === mode.id ? "border-brand bg-white shadow-md ring-4 ring-brand/5" : "border-transparent bg-white/50 hover:bg-white"}`}
                    >
                      <span className="text-xl">{mode.icon}</span>
                      <p className="text-sm font-bold text-slate-900">{mode.label}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">{mode.desc}</p>
                      {entryMode === mode.id && <div className="absolute right-3 top-3"><div className="h-2 w-2 rounded-full bg-brand" /></div>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center justify-between px-2">
                <button onClick={() => setStep(2)} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                  BACK TO METHODS
                </button>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Mode</p>
                  <p className="text-xs font-bold text-slate-600 capitalize">{entryMode} - {questionType.replace("_", " ")}</p>
                </div>
              </div>

              {entryMode === "manual" && (
                <form onSubmit={onManualSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  {/* Existing Manual Form */}
                  <p className="text-xs font-semibold text-slate-500">Manual Entry Content</p>
                  <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">{typeHints[questionType]}</p>

                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-600">Question Text</label>
                    <button type="button" onClick={() => setShowPreview(!showPreview)} className="text-[10px] font-bold text-brand uppercase hover:underline">
                      {showPreview ? "⌨️ Show Editor" : "👁️ Show Preview"}
                    </button>
                  </div>
                  {showPreview ? (
                    <div className="mt-1 min-h-[96px] w-full rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm prose prose-slate max-w-none">
                      {questionText.split("\n").map((line, i) => (
                        <p key={i} className="mb-2">
                          {line.split(/(\*\*.*?\*\*|\$.*?\$)/).map((part, pi) => {
                            if (part.startsWith("**") && part.endsWith("**")) return <strong key={pi}>{part.slice(2, -2)}</strong>;
                            if (part.startsWith("$") && part.endsWith("$")) return <code key={pi} className="bg-brand/10 text-brand px-1 rounded italic">{part.slice(1, -1)}</code>;
                            return part;
                          })}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <textarea className="mt-1 h-24 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" value={questionText} onChange={(e) => setQuestionText(e.target.value)} onKeyDown={onManualKeyDown} placeholder="Tip: Use **bold** for emphasis and $formula$ for variables." />
                  )}

                  {needsOptions ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      {options.slice(0, visibleOptionCount).map((opt, i) => (
                        <label key={i} className="text-xs font-semibold text-slate-600">Option {String.fromCharCode(65 + i)}
                          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={opt} onChange={(e) => setOptions((prev) => prev.map((x, idx) => idx === i ? e.target.value : x))} />
                        </label>
                      ))}
                    </div>
                  ) : null}

                  {questionType === "diagram" && (
                    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-600">Diagram Source</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setDiagramInputMode("url")} className={`rounded-full px-3 py-1 text-xs font-semibold ${diagramInputMode === "url" ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}>Paste URL</button>
                        <button type="button" onClick={() => setDiagramInputMode("upload")} className={`rounded-full px-3 py-1 text-xs font-semibold ${diagramInputMode === "upload" ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}>Upload Image</button>
                      </div>
                      {diagramInputMode === "url" ? (
                        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={diagramUrl} onChange={(e) => setDiagramUrl(e.target.value)} placeholder="https://..." />
                      ) : (
                        <input className="mt-1 block w-full text-sm" type="file" onChange={(e) => e.target.files?.[0] && handleDiagramFile(e.target.files[0])} />
                      )}
                      {diagramUrl && <img src={diagramUrl} alt="Preview" className="max-h-32 rounded border" />}
                    </div>
                  )}

                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                    {needsCorrect && (
                      <label className="text-xs font-semibold text-slate-600">Correct Answer
                        {["mcq", "true_false"].includes(questionType) ? (
                          <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={correct} onChange={(e) => setCorrect(e.target.value)}>{correctChoices.map(x => <option key={x}>{x}</option>)}</select>
                        ) : (
                          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={correct} onChange={(e) => setCorrect(e.target.value)} />
                        )}
                      </label>
                    )}
                    <label className="text-xs font-semibold text-slate-600">Difficulty<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={diff} onChange={(e) => setDiff(e.target.value as Difficulty)}>{difficultyLevels.map(x => <option key={x}>{x}</option>)}</select></label>
                    <label className="text-xs font-semibold text-slate-600">Bloom Level
                      <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={bloom} onChange={(e) => setBloom(e.target.value as any)}>
                        <option value="">-- Optional --</option>
                        {blooms.map(x => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Question Level
                      <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={qLevel} onChange={(e) => setQLevel(e.target.value as QuestionLevel)}>
                        {questionLevels.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-white">Save & Add Another</button>
                    <button type="button" onClick={() => saveManual(true)} className="rounded-lg bg-slate-700 px-4 py-2 text-white">Save & Close</button>
                  </div>
                </form>
              )}

              {entryMode === "upload" && (
                <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
                  <div className="space-y-1">
                    <h3 className="font-display text-xl font-bold">Smart Bulk Upload</h3>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-500">Drag and drop your file. We'll help you map the columns.</p>
                      <button
                        type="button"
                        onClick={() => downloadQuestionTemplate(questionType)}
                        className="flex items-center gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-1.5 text-[10px] font-bold text-brand uppercase transition-all hover:bg-brand/10"
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Download {questionType.replace("_", " ")} Template
                      </button>
                    </div>
                  </div>

                  {!showMapper && uploadPreview.length === 0 && (
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-brand", "bg-brand/5"); }}
                      onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-brand", "bg-brand/5"); }}
                      onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-brand", "bg-brand/5"); const file = e.dataTransfer.files[0]; if (file) handleFileSelection(file); }}
                      className="group relative flex h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition-all hover:border-brand hover:bg-brand/5"
                    >
                      <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-brand">
                        <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        <p className="text-sm font-bold">Drop CSV or Excel here</p>
                        <p className="text-xs">Max file size: 5MB</p>
                      </div>
                      <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && handleFileSelection(e.target.files[0])} className="absolute inset-0 opacity-0" />
                    </div>
                  )}

                  {showMapper && (
                    <div className="space-y-4 animate-in fade-in zoom-in-95">
                      <div className="rounded-xl bg-brand/5 p-4">
                        <p className="text-xs font-bold text-brand uppercase tracking-widest">Column Mapping Required</p>
                        <p className="text-xs text-brand/70">Match your file's headers to our system fields.</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        {["question_text", "correct_answer", "difficulty", "bloom_level"].map(sys => (
                          <label key={sys} className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase text-slate-500">{sys.replace("_", " ")}</span>
                            <select
                              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold"
                              value={columnMapping[sys] || ""}
                              onChange={(e) => setColumnMapping(prev => ({ ...prev, [sys]: e.target.value }))}
                            >
                              <option value="">-- Ignored --</option>
                              {detectedHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                      <button onClick={applyMapping} className="w-full rounded-xl bg-brand py-3 font-bold text-white shadow-lg shadow-brand/20">
                        Continue to Preview
                      </button>
                    </div>
                  )}

                  {uploadPreview.length > 0 && !showMapper && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-4">
                        <div>
                          <p className="text-xs font-bold text-emerald-700 uppercase">Ready to Import</p>
                          <p className="text-sm font-bold text-emerald-900">{uploadPreview.length} questions detected from your file.</p>
                        </div>
                        <button onClick={() => { setUploadPreview([]); setRawUploadData([]); }} className="text-xs font-bold text-slate-400 hover:text-slate-600">RESET</button>
                      </div>

                      <button onClick={submitUpload} className="w-full rounded-xl bg-brand py-3 font-bold text-white shadow-lg shadow-brand/20 transition-transform active:scale-95">
                        Import All Questions
                      </button>

                      <div className="flex gap-2">
                        <button onClick={() => downloadTemplate(questionType)} className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Download Template</button>
                        <button onClick={undoLastImport} className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Undo Last Upload</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {entryMode === "ai" && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">AI Generation Strategy</p>
                    <button
                      onClick={() => setChatMode(!chatMode)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${chatMode ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {chatMode ? "Back to Settings" : "💬 Open Discussion Lab"}
                    </button>
                  </div>

                  {chatMode ? (
                    <div className="flex flex-col gap-4 animate-in slide-in-from-top-2 duration-300">
                      <div className="h-[300px] overflow-y-auto rounded-xl border bg-slate-50 p-4 space-y-4">
                        {chatMessages.length === 0 && (
                          <div className="text-center py-10 space-y-2">
                            <span className="text-3xl">🤖</span>
                            <p className="text-sm text-slate-500 max-w-xs mx-auto">Hi! I'm your Paper Architect. Tell me what kind of exam you're planning, and I'll help you configure the perfect questions.</p>
                            <p className="text-[10px] text-slate-400">Example: "I need 10 hard MCQs about Plants for Class 5"</p>
                          </div>
                        )}
                        {chatMessages.map((msg, i) => (
                          <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${msg.role === "user" ? "bg-brand text-white rounded-br-none" : "bg-white text-slate-800 rounded-bl-none border border-slate-200"}`}>
                              {msg.content}
                            </div>
                            {(msg as any).questions && (msg as any).questions.length > 0 && (
                              <div className="mt-2 w-full max-w-[90%] space-y-2 rounded-xl bg-slate-100 p-3 shadow-inner">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase">Generated Questions ({(msg as any).questions.length})</span>
                                  <button
                                    onClick={() => addChatQuestions((msg as any).questions)}
                                    className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm hover:bg-emerald-600 transition-colors"
                                  >
                                    ADD ALL TO BANK
                                  </button>
                                </div>
                                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                                  {(msg as any).questions.map((q: any, qi: number) => (
                                    <div key={qi} className="p-2 bg-white rounded border border-slate-200 text-[11px] leading-tight">
                                      <span className="font-bold text-brand">Q{qi + 1}:</span> {q.question_text}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        {isChatting && (
                          <div className="flex justify-start">
                            <div className="bg-white text-slate-400 rounded-2xl px-4 py-2 text-xs border border-slate-200 animate-pulse">
                              AI is typing...
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      <div className="space-y-2">
                        {chatFile && (
                          <div className="flex items-center justify-between bg-brand/5 border border-brand/20 p-2 rounded-lg text-[10px]">
                            <span className="flex items-center gap-1 font-bold text-brand"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg> {chatFile.name}</span>
                            <button onClick={() => setChatFile(null)} className="text-red-400 font-bold hover:text-red-600">REMOVE</button>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <label className="flex items-center justify-center p-2.5 rounded-xl border border-slate-300 text-slate-400 hover:text-brand hover:border-brand transition-colors cursor-pointer bg-white">
                            <input type="file" accept=".pdf" className="hidden" onChange={(e) => setChatFile(e.target.files?.[0] || null)} />
                            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                          </label>
                          <input
                            className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-brand outline-none bg-white"
                            placeholder="Describe your requirements..."
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                          />
                          <button
                            onClick={handleSendChatMessage}
                            disabled={!chatInput.trim() || isChatting}
                            className="rounded-xl bg-brand p-2.5 text-white shadow-lg shadow-brand/20 disabled:opacity-50"
                          >
                            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 animate-in fade-in duration-300">
                      <div className="space-y-3">
                        <label className="block text-xs font-bold text-slate-600 font-display">Source PDF <input className="mt-1 block w-full text-xs" type="file" accept=".pdf" onChange={(e) => setAiPdfFile(e.target.files?.[0] || null)} /></label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-xs font-bold text-slate-600">Start Page <input className="mt-1 w-full rounded border px-2 py-1" type="number" value={aiStartPage} onChange={(e) => setAiStartPage(Number(e.target.value))} /></label>
                          <label className="text-xs font-bold text-slate-600">End Page <input className="mt-1 w-full rounded border px-2 py-1" type="number" value={aiEndPage} onChange={(e) => setAiEndPage(Number(e.target.value))} /></label>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <label className="text-xs font-bold text-slate-600">Count <input className="mt-1 w-full rounded border px-2 py-1" type="number" value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))} /></label>
                          <label className="text-xs font-bold text-slate-600 font-display">Bloom Level <select className="mt-1 w-full rounded border px-2 py-1" value={aiBloom} onChange={(e) => setAiBloom(e.target.value as any)}><option value="">-- Optional/Mixed --</option>{blooms.map(b => <option key={b} value={b}>{b}</option>)}</select></label>
                          <label className="text-xs font-bold text-slate-600 font-display">Level <select className="mt-1 w-full rounded border px-2 py-1" value={aiQLevel} onChange={(e) => setAiQLevel(e.target.value as QuestionLevel)}>{questionLevels.map(lvl => <option key={lvl.id} value={lvl.id}>{lvl.label}</option>)}</select></label>
                        </div>
                        <button onClick={generateFromAI} disabled={aiLoading} className="w-full rounded-lg bg-brand py-2 font-bold text-white shadow-lg disabled:opacity-50">
                          {aiLoading ? "AI is thinking..." : "✨ Generate Questions"}
                        </button>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3 italic text-xs text-slate-500">
                        <p className="font-bold">Instructions for AI:</p>
                        <textarea className="mt-1 w-full rounded border p-2" rows={3} value={aiInstructions} onChange={(e) => setAiInstructions(e.target.value)} placeholder="e.g. Include questions about photosynthesis cycle..." />
                      </div>
                    </div>
                  )}

                  {aiGenerated.length > 0 && (
                    <div className="mt-4 space-y-3 rounded-lg border-2 border-brand/20 bg-brand/5 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display font-bold text-brand">Review Generated Questions</h3>
                        <button onClick={saveAIGenerated} className="rounded-lg bg-brand px-4 py-2 text-white shadow-md">Confirm & Save All</button>
                      </div>
                      <div className="space-y-4 max-h-[500px] overflow-auto pr-2">
                        {aiGenerated.map((q, idx) => (
                          <div key={idx} className="relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm group">
                            <button onClick={() => removeAiItem(idx)} className="absolute -right-2 -top-2 hidden rounded-full bg-red-500 p-1 text-white shadow-md group-hover:block hover:bg-red-600">
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                            <textarea
                              className="w-full resize-none border-none p-0 text-sm font-semibold focus:ring-0"
                              value={q.question_text}
                              onChange={(e) => updateAiItem(idx, "question_text", e.target.value)}
                              rows={2}
                            />
                            {q.options && (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                {q.options.map((opt, oidx) => (
                                  <input
                                    key={oidx}
                                    className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs"
                                    value={opt}
                                    onChange={(e) => {
                                      const newOpts = [...q.options!];
                                      newOpts[oidx] = e.target.value;
                                      updateAiItem(idx, "options", newOpts);
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase">
                              <span>Answer: <input className="ml-1 rounded border-none bg-slate-50 px-2 py-0.5 text-brand" value={q.correct_answer} onChange={(e) => updateAiItem(idx, "correct_answer", e.target.value)} /></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!deleteIntent}
        title="Confirm Delete"
        message={deleteIntent?.message || ""}
        confirmLabel="Delete"
        loading={isDeletingQuestions}
        onCancel={() => setDeleteIntent(null)}
        onConfirm={confirmDeleteIntent}
      />

      {editingQuestion && editDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900">Edit Question</h3>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Type: {editingQuestion.question_type.replace("_", " ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingQuestion(null);
                  setEditDraft(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <label className="block text-xs font-semibold text-slate-600">
                Question Text
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={editDraft.question_text}
                  onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, question_text: e.target.value } : prev))}
                />
              </label>

              {editingQuestion.question_type === "mcq" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">Option A
                    <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editDraft.option_a} onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, option_a: e.target.value } : prev))} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Option B
                    <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editDraft.option_b} onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, option_b: e.target.value } : prev))} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Option C
                    <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editDraft.option_c} onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, option_c: e.target.value } : prev))} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Option D
                    <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editDraft.option_d} onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, option_d: e.target.value } : prev))} />
                  </label>
                </div>
              )}

              {editingQuestion.question_type === "true_false" && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  True/False options are fixed as Option A = True and Option B = False.
                </div>
              )}

              {editingQuestion.question_type === "diagram" && (
                <label className="block text-xs font-semibold text-slate-600">
                  Diagram URL
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={editDraft.diagram_url}
                    onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, diagram_url: e.target.value } : prev))}
                  />
                </label>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  Correct Answer
                  {editingQuestion.question_type === "mcq" ? (
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editDraft.correct_answer}
                      onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, correct_answer: e.target.value } : prev))}
                    >
                      {["A", "B", "C", "D"].map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                    </select>
                  ) : editingQuestion.question_type === "true_false" ? (
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editDraft.correct_answer}
                      onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, correct_answer: e.target.value } : prev))}
                    >
                      {["True", "False"].map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                    </select>
                  ) : (
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editDraft.correct_answer}
                      onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, correct_answer: e.target.value } : prev))}
                    />
                  )}
                </label>

                <label className="text-xs font-semibold text-slate-600">
                  Difficulty
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={editDraft.difficulty}
                    onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, difficulty: e.target.value as Difficulty } : prev))}
                  >
                    {difficultyLevels.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-600">
                  Bloom Level
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={editDraft.bloom_level}
                    onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, bloom_level: e.target.value as BloomLevel | "" } : prev))}
                  >
                    <option value="">-- None --</option>
                    {blooms.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-600">
                  Question Level
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={editDraft.question_level}
                    onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, question_level: e.target.value as QuestionLevel } : prev))}
                  >
                    {questionLevels.map((lvl) => <option key={lvl.id} value={lvl.id}>{lvl.label}</option>)}
                  </select>
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-600">
                Explanation / Rubric Hint
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={editDraft.explanation}
                  onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, explanation: e.target.value } : prev))}
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingQuestion(null);
                    setEditDraft(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={isSavingEdit}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isSavingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
