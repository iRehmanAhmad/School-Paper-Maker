import { useEffect, useMemo, useRef, useState } from "react";
import { getAppSettings } from "@/services/appSettings";
import { downloadAnswerPdf, downloadQuestionDocx, downloadQuestionPdf, downloadRubricPdf, openPrintableHtml } from "@/services/exporters";
import { generatePaperBundle } from "@/services/paperEngine";
import {
  getBlueprintById,
  getChapters,
  getClasses,
  getExamBodies,
  getQuestions,
  getRecentQuestionUsage,
  getTopics,
  getSubjects,
  savePaperAndUsage,
  getPaperBundleById,
  getSubscriptionSummary,
  assertCanGeneratePaper,
} from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";
import { useSearchParams } from "react-router-dom";
import type { BloomLevel, ChapterEntity, ClassEntity, Difficulty, ExamBody, GeneratorSettings, SubjectEntity, QuestionLevel, QuestionType, GeneratedQuestion, BlueprintSection, TopicEntity } from "@/types/domain";

type CompositionRow = {
  type: QuestionType;
  count: number;
  choice: number;
  marks: number;
  emptyLines: number;
  selected: boolean;
};

const difficulties: Difficulty[] = ["easy", "medium", "hard"];
const blooms: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate"];
const compositionTypes: QuestionType[] = ["mcq", "true_false", "matching", "fill_blanks", "short", "long", "diagram"];

function defaultMarksForType(type: QuestionType) {
  if (type === "short") return 2;
  if (type === "long") return 5;
  if (type === "diagram") return 3;
  return 1;
}

function defaultLinesForType(type: QuestionType) {
  if (type === "short") return 2;
  if (type === "long") return 10;
  if (type === "diagram") return 4;
  return 0;
}

function getDefaultCompositionRow(type: QuestionType): CompositionRow {
  return {
    type,
    count: 0,
    choice: 0,
    marks: defaultMarksForType(type),
    emptyLines: defaultLinesForType(type),
    selected: false,
  };
}

function mapBlueprintToComposition(sections: BlueprintSection[]): CompositionRow[] {
  const byType = new Map<QuestionType, CompositionRow>();
  compositionTypes.forEach((type) => byType.set(type, getDefaultCompositionRow(type)));

  sections.forEach((section) => {
    const base = byType.get(section.type) || getDefaultCompositionRow(section.type);
    const count = Math.max(0, Number(section.count) || 0);
    const choice = Math.max(0, Number(section.choice ?? section.count) || 0);
    const marks = Math.max(0, Number(section.marks ?? base.marks) || 0);
    const emptyLines = Math.max(0, Number(section.empty_lines ?? base.emptyLines) || 0);
    byType.set(section.type, { ...base, selected: true, count, choice, marks, emptyLines });
  });

  return compositionTypes.map((type) => byType.get(type) || getDefaultCompositionRow(type));
}

function resolveQuestionLevel(level: QuestionLevel | undefined): QuestionLevel {
  return level ?? "exercise";
}

export function PaperGeneratorPage() {
  const profile = useAppStore((s) => s.profile);
  const generated = useAppStore((s) => s.generatedPaper);
  const setGenerated = useAppStore((s) => s.setGeneratedPaper);
  const toast = useAppStore((s) => s.pushToast);

  const isPremium = profile?.is_premium || false;

  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [examBodies, setExamBodies] = useState<ExamBody[]>([]);
  const [subjects, setSubjects] = useState<SubjectEntity[]>([]);
  const [chapters, setChapters] = useState<ChapterEntity[]>([]);
  const [topics, setTopics] = useState<TopicEntity[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [step, setStep] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const [examBodyId, setExamBodyId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<QuestionLevel[]>(["exercise"]);
  const [recentPapersToAvoid, setRecentPapersToAvoid] = useState(3);
  const [requestedSets, setRequestedSets] = useState(1);
  const [activeSetLabel, setActiveSetLabel] = useState("A");
  const [subscriptionSummary, setSubscriptionSummary] = useState<Awaited<ReturnType<typeof getSubscriptionSummary>> | null>(null);
  const [previewScale, setPreviewScale] = useState(1.0);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const appliedBlueprintRef = useRef<string | null>(null);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const [composition, setComposition] = useState<CompositionRow[]>([
    { type: "mcq", count: 10, choice: 10, marks: 1, emptyLines: 0, selected: true },
    { type: "short", count: 5, choice: 5, marks: 2, emptyLines: 2, selected: true },
    { type: "long", count: 3, choice: 3, marks: 5, emptyLines: 10, selected: true },
  ]);

  const [difficultyDistribution] = useState<Record<Difficulty, number>>({ easy: 40, medium: 40, hard: 20 });
  const [bloomDistribution] = useState<Record<BloomLevel, number>>({ remember: 40, understand: 30, apply: 20, analyze: 10, evaluate: 0 });
  const [availableCounts, setAvailableCounts] = useState<Record<QuestionType, number>>({ mcq: 0, true_false: 0, fill_blanks: 0, short: 0, long: 0, matching: 0, diagram: 0 });
  const [chapterCounts, setChapterCounts] = useState<Record<string, number>>({});

  // Composition Presets
  const [compositionPresets, setCompositionPresets] = useState<Record<string, CompositionRow[]>>(() => {
    try {
      const saved = localStorage.getItem("pg_composition_presets");
      if (saved) return JSON.parse(saved);
    } catch (e) { console.error("Could not load presets", e); }
    return {};
  });

  const appSettings = getAppSettings();
  const subjectName = subjects.find(s => s.id === subjectId)?.name || "";
  const activeSet = generated?.sets.find((setRow) => setRow.label === activeSetLabel) || generated?.sets[0];
  const maxPlanSets = subscriptionSummary?.maxPaperSets ?? 1;
  const isSubscriptionActive = subscriptionSummary?.isActive ?? true;

  const [header, setHeader] = useState<GeneratorSettings["header"]>({
    schoolName: appSettings.schoolName || (isPremium ? "ABC Public School" : "Antigravity Academic Engine"),
    schoolLogo: appSettings.schoolLogo || "",
    secondaryLogo: appSettings.secondaryLogo || "",
    schoolAddress: appSettings.schoolAddress || "",
    examTitle: "Monthly Test",
    className: "Class 5",
    subjectName: "Science",
    timeLabel: "30 min",
    marksLabel: "25",
    dateLabel: new Date().toISOString().split('T')[0],
    instructions: "Attempt all questions clearly. Overwriting is not allowed.",
    teacherName: profile?.full_name || "Teacher",
    signatureBlocks: ["Teacher Sig", "Principal Sig"],
    showWatermark: false,
    showQR: false,
    printMode: "single",
    paperSize: "A4",
    medium: subjectName.toLowerCase().includes("urdu") ? "Urdu" : subjectName.toLowerCase().includes("english") ? "English" : "English",
    term: "Monthly",
    blankInlineFor: subjectName.toLowerCase().includes("urdu") ? "Urdu" : subjectName.toLowerCase().includes("math") ? "Math" : "English",
    contentFontSize: appSettings.paperFontSize,
    // Inject App Settings
    layoutStyle: appSettings.layout,
    lineHeight: appSettings.lineHeight,
    watermarkOpacity: appSettings.watermarkOpacity,
    showAddress: appSettings.showAddress,
    watermarkType: appSettings.watermarkType,
  });

  // Measure the preview container to compute fit-to-width scale
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paperWidths = { A4: 794, Letter: 816, Legal: 816 };
  const paperHeights = { A4: 1123, Letter: 1056, Legal: 1344 };

  const paperNaturalWidth = header.printMode === 'double' ? (paperHeights[header.paperSize] * 1.06) : paperWidths[header.paperSize];
  const paperNaturalHeight = header.printMode === 'double' ? paperWidths[header.paperSize] : paperHeights[header.paperSize];

  const fitScale = containerWidth > 0 ? (containerWidth - 64) / paperNaturalWidth : 1;
  const effectiveScale = fitScale * previewScale;
  const canPan = previewScale > 1.05;

  // Reset pan when zooming back to fit
  useEffect(() => {
    if (previewScale <= 1.0) { setPanX(0); setPanY(0); }
  }, [previewScale]);

  function handleMouseDown(e: React.MouseEvent) {
    if (!canPan) return;
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPanX(px => px + dx);
    setPanY(py => py + dy);
  }

  function handleMouseUp() {
    isDragging.current = false;
  }

  async function load() {
    if (!profile?.school_id) return;
    const bodies = await getExamBodies(profile.school_id);
    setExamBodies(bodies);
    const selectedBody = examBodyId || bodies[0]?.id || "";
    setExamBodyId(selectedBody);
    const c = await getClasses(profile.school_id, selectedBody);
    setClasses(c);
    const s = await getSubjects(c.map((x) => x.id));
    setSubjects(s);
    const ch = await getChapters(s.map((x) => x.id));
    setChapters(ch);
    const tp = await getTopics(ch.map((x) => x.id));
    setTopics(tp);

    const cid = classId || c[0]?.id || "";
    setClassId(cid);
    const sid = subjectId || s.find((r) => r.class_id === cid)?.id || s[0]?.id || "";
    setSubjectId(sid);

    setHeader((prev) => ({
      ...prev,
      className: c.find((x) => x.id === cid)?.name || prev.className,
      subjectName: s.find((x) => x.id === (subjectId || sid))?.name || prev.subjectName,
      medium: (s.find((x) => x.id === (subjectId || sid))?.name || "").toLowerCase().includes("urdu") ? "Urdu" : "English",
      blankInlineFor: (s.find((x) => x.id === (subjectId || sid))?.name || "").toLowerCase().includes("urdu") ? "Urdu" : "English",
    }));
  }

  // Metadata Sync Hooks
  useEffect(() => {
    const sName = subjects.find(s => s.id === subjectId)?.name;
    if (sName) {
      setHeader(prev => ({
        ...prev,
        subjectName: sName,
        medium: sName.toLowerCase().includes("urdu") ? "Urdu" : "English",
        blankInlineFor: sName.toLowerCase().includes("urdu") ? "Urdu" : "English",
      }));
    }
  }, [subjectId, subjects]);

  useEffect(() => {
    const cName = classes.find(c => c.id === classId)?.name;
    if (cName) {
      setHeader(prev => ({ ...prev, className: cName }));
    }

    // Auto-reset subject if current subject doesn't belong to the newly selected class
    if (subjectId && subjects.length > 0) {
      const isValidForClass = subjects.some(s => s.id === subjectId && s.class_id === classId);
      if (!isValidForClass) {
        setSubjectId("");
      }
    }
  }, [classId, classes, subjects, subjectId]);

  useEffect(() => {
    load();
  }, [profile?.school_id, examBodyId]);

  useEffect(() => {
    async function loadSubscription() {
      if (!profile?.school_id) {
        setSubscriptionSummary(null);
        return;
      }
      try {
        const summary = await getSubscriptionSummary(profile.school_id);
        setSubscriptionSummary(summary);
      } catch (error) {
        console.error("Failed to load subscription summary", error);
      }
    }
    loadSubscription();
  }, [profile?.school_id]);

  useEffect(() => {
    if (!subscriptionSummary) return;
    if (requestedSets > subscriptionSummary.maxPaperSets) {
      setRequestedSets(subscriptionSummary.maxPaperSets);
    }
  }, [subscriptionSummary, requestedSets]);

  useEffect(() => {
    if (!generated?.sets?.length) return;
    if (generated.sets.some((setRow) => setRow.label === activeSetLabel)) return;
    setActiveSetLabel(generated.sets[0].label);
  }, [generated, activeSetLabel]);

  // Load Saved Paper Workflow
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (!profile?.id || !loadId) return;

    async function fetchSavedPaper() {
      setIsGenerating(true);
      try {
        const bundle = await getPaperBundleById(loadId!);
        if (bundle) {
          // Restore Context
          const settings = bundle.paper.settings_json;
          setClassId(settings.classId);
          setSubjectId(settings.subjectId);
          setChapterIds(settings.chapterIds);
          setSelectedTopicIds(Array.isArray(settings.topicIds) ? settings.topicIds : []);
          setExamBodyId(settings.examBodyId || examBodyId);
          setSelectedLevels(settings.levels || ["exercise"]);
          setRequestedSets(Math.max(1, Number(settings.sets || 1)));
          setHeader(settings.header);

          setGenerated(bundle);
          setActiveSetLabel(bundle.sets?.[0]?.label || "A");
          setStep(4);
          toast("success", "Paper loaded from My Papers!");
        } else {
          toast("error", "Could not find the saved paper.");
        }
      } catch (e) {
        console.error(e);
        toast("error", "Failed to load saved paper.");
      } finally {
        setIsGenerating(false);
        setSearchParams(new URLSearchParams()); // Clear URL to avoid reloading on every re-mount
      }
    }
    fetchSavedPaper();
  }, [searchParams.get("load"), profile?.id]);

  useEffect(() => {
    const blueprintId = searchParams.get("blueprint");
    const loadId = searchParams.get("load");
    const schoolId = profile?.school_id;
    if (typeof schoolId !== "string" || !schoolId || !blueprintId || loadId) return;
    if (appliedBlueprintRef.current === blueprintId) return;
    const targetBlueprintId = blueprintId;

    async function applyBlueprintToGenerator() {
      try {
        const resolvedSchoolId = schoolId as string;
        const blueprint = await getBlueprintById(targetBlueprintId);
        if (!blueprint) {
          toast("error", "Blueprint not found");
          return;
        }

        const allClasses = await getClasses(resolvedSchoolId);
        const allSubjects = await getSubjects(allClasses.map((c) => c.id));
        const allChapters = await getChapters(allSubjects.map((s) => s.id));

        const ownerClass = allClasses.find((c) => c.id === blueprint.class_id);
        if (ownerClass) {
          setExamBodyId(ownerClass.exam_body_id);
        }
        setClassId(blueprint.class_id);
        setSubjectId(blueprint.subject_id);

        const subjectChapters = allChapters
          .filter((c) => c.subject_id === blueprint.subject_id)
          .sort((a, b) => a.chapter_number - b.chapter_number);
        setChapterIds(subjectChapters.map((c) => c.id));
        setSelectedTopicIds([]);

        setComposition(mapBlueprintToComposition(blueprint.structure_json.sections));
        setHeader((prev) => ({ ...prev, examTitle: blueprint.name }));

        const levelsFromBlueprint = Array.from(
          new Set(
            blueprint.structure_json.sections
              .map((section) => section.question_level)
              .filter(Boolean)
          )
        ) as QuestionLevel[];
        if (levelsFromBlueprint.length) {
          setSelectedLevels(levelsFromBlueprint);
        }

        appliedBlueprintRef.current = targetBlueprintId;
        setStep(3);
        toast("success", `Blueprint loaded: ${blueprint.name}`);

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("blueprint");
        setSearchParams(nextParams);
      } catch (error) {
        toast("error", "Failed to load blueprint into generator");
      }
    }

    applyBlueprintToGenerator();
  }, [searchParams.get("blueprint"), searchParams.get("load"), profile?.school_id]);

  const filteredSubjects = useMemo(() => subjects.filter((s) => s.class_id === classId), [subjects, classId]);
  const filteredChapters = useMemo(() => {
    return chapters
      .filter((c) => c.subject_id === subjectId)
      .sort((a, b) => a.chapter_number - b.chapter_number);
  }, [chapters, subjectId]);
  const filteredTopics = useMemo(() => {
    if (!chapterIds.length) return [] as TopicEntity[];
    return topics
      .filter((topic) => chapterIds.includes(topic.chapter_id))
      .sort((a, b) => a.topic_number - b.topic_number);
  }, [topics, chapterIds]);

  useEffect(() => {
    if (!chapterIds.length) return;
    const visible = new Set(filteredChapters.map((chapter) => chapter.id));
    setChapterIds((prev) => prev.filter((id) => visible.has(id)));
  }, [filteredChapters, chapterIds.length]);

  useEffect(() => {
    if (!selectedTopicIds.length) return;
    if (chapterIds.length > 0 && topics.length === 0) return;
    const visible = new Set(filteredTopics.map((topic) => topic.id));
    setSelectedTopicIds((prev) => prev.filter((id) => visible.has(id)));
  }, [filteredTopics, selectedTopicIds.length, chapterIds.length, topics.length]);

  // Fetch individual chapter counts for display in the syllabus step
  useEffect(() => {
    async function fetchChapterCounts() {
      if (!profile?.school_id || filteredChapters.length === 0) {
        setChapterCounts({});
        return;
      }
      const cIds = filteredChapters.map(c => c.id);
      const q = await getQuestions(profile.school_id, cIds);
      const counts: Record<string, number> = {};
      q.forEach(question => {
        counts[question.chapter_id] = (counts[question.chapter_id] || 0) + 1;
      });
      setChapterCounts(counts);
    }
    fetchChapterCounts();
  }, [profile?.school_id, filteredChapters]);

  useEffect(() => {
    async function updateCounts() {
      if (!profile?.school_id || !chapterIds.length || !selectedLevels.length) {
        setAvailableCounts({ mcq: 0, true_false: 0, fill_blanks: 0, short: 0, long: 0, matching: 0, diagram: 0 });
        return;
      }
      const q = await getQuestions(profile.school_id, chapterIds);
      const filtered = q.filter(
        (x) =>
          selectedLevels.includes(resolveQuestionLevel(x.question_level)) &&
          (!selectedTopicIds.length || (!!x.topic_id && selectedTopicIds.includes(x.topic_id)))
      );
      const counts: Record<QuestionType, number> = { mcq: 0, true_false: 0, fill_blanks: 0, short: 0, long: 0, matching: 0, diagram: 0 };
      filtered.forEach(x => { counts[x.question_type] = (counts[x.question_type] || 0) + 1; });
      setAvailableCounts(counts);
    }
    updateCounts();
  }, [profile?.school_id, chapterIds, selectedLevels, selectedTopicIds]);

  async function generate() {
    if (!profile?.school_id || !profile.id || !subjectId || !chapterIds.length) {
      toast("error", "Please complete step 1 and 2 before generating.");
      return false;
    }

    const sanitizedSetCount = Math.max(1, Math.floor(requestedSets || 1));
    try {
      const summary = await assertCanGeneratePaper(profile.school_id, sanitizedSetCount);
      setSubscriptionSummary(summary);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Paper generation is blocked by subscription.");
      return false;
    }

    setIsGenerating(true);
    setGenerated(null); // Clear old paper to prevent stale previews/prints

    const questionPool = await getQuestions(profile.school_id, chapterIds);
    const filteredPool = questionPool.filter(
      (q) =>
        selectedLevels.includes(resolveQuestionLevel(q.question_level)) &&
        (!selectedTopicIds.length || (!!q.topic_id && selectedTopicIds.includes(q.topic_id)))
    );

    if (filteredPool.length === 0) {
      toast("error", "No questions match selected chapters/topics/levels. Adjust your syllabus filters.");
      return false;
    }

    const recentUsage = await getRecentQuestionUsage(filteredPool.map((q) => q.id), recentPapersToAvoid);

    const activeSections = composition
      .filter(r => r.selected)
      .map(r => ({
        type: r.type,
        count: r.count,
        choice: r.choice,
        marks: r.marks,
        empty_lines: r.emptyLines,
      }));

    if (activeSections.length === 0) {
      toast("error", "Please select at least one question type (Section) for the paper.");
      return false;
    }

    const settings: GeneratorSettings = {
      classId,
      subjectId,
      chapterIds,
      topicIds: selectedTopicIds,
      examType: "monthly",
      sets: sanitizedSetCount,
      recentPapersToAvoid,
      difficultyDistribution,
      bloomDistribution,
      chapterWeightage: {},
      layout: {
        paperSize: "A4",
        orientation: "portrait",
        columns: "single",
        spacing: "normal",
        answerLines: 2,
        margins: { top: 24, right: 24, bottom: 24, left: 24 },
        fonts: { heading: 16, question: header.contentFontSize, option: header.contentFontSize - 1 },
      },
      header,
    };

    try {
      const { bundle, mappings, usage } = generatePaperBundle({
        settings,
        teacherId: profile.id,
        questions: filteredPool,
        recentUsage,
        sections: activeSections as any,
      });

      if (bundle.sets.every((setRow) => setRow.questions.length === 0)) {
        throw new Error("Could not find any questions matching your criteria. Check question types.");
      }

      await savePaperAndUsage(bundle.paper, mappings, usage);
      setGenerated(bundle);
      setActiveSetLabel(bundle.sets[0]?.label || "A");
      toast("success", "Paper generated successfully!");
      return true;
    } catch (e: any) {
      console.error("Critical Generation Error:", e);
      toast("error", `Generation failed: ${e.message || "Please check pool size or database connection."}`);
      return false;
    } finally {
      setIsGenerating(false);
    }
  }

  const levels: { id: QuestionLevel; label: string }[] = [
    { id: "exercise", label: "Exercise Question" },
    { id: "additional", label: "Additional Question" },
    { id: "past_papers", label: "Past Papers" },
    { id: "examples", label: "Exercise Examples" },
    { id: "conceptual", label: "Conceptual Question" },
  ];

  const steps = [
    { id: 1, name: "Context", icon: "🏢" },
    { id: 2, name: "Syllabus", icon: "📚" },
    { id: 3, name: "Composition", icon: "🔧" },
    { id: 4, name: "Review", icon: "📄" },
  ];

  return (
    <div className="w-full space-y-6 pb-20 px-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold bg-gradient-to-r from-brand to-brand/70 bg-clip-text text-transparent italic tracking-tight">Paper Constructor <span className="text-xs font-black uppercase text-brand/40 align-top opacity-50 tracking-widest ml-2">SaaS v2.0</span></h2>
          <p className="text-sm text-slate-500">Construct high-quality exam papers in minutes.</p>
          {subscriptionSummary && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2.5 py-1 font-bold ${subscriptionSummary.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {subscriptionSummary.isActive ? "Subscription Active" : "Subscription Inactive"}
              </span>
              <span className="rounded-full bg-brand/10 text-brand px-2.5 py-1 font-bold">
                {subscriptionSummary.plan.name} Plan
              </span>
              <span className="text-slate-500">
                Max sets: {subscriptionSummary.maxPaperSets}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => i + 1 < step && setStep(s.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${step === s.id
                  ? "bg-brand text-white shadow-lg shadow-brand/20 scale-105"
                  : i + 1 < step ? "text-brand hover:bg-brand/5" : "text-slate-400 opacity-60"
                  }`}
              >
                <span>{s.icon}</span>
                <span className="hidden sm:inline">{s.name}</span>
              </button>
              {i < steps.length - 1 && <div className="h-0.5 w-3 bg-slate-100 rounded-full mx-0.5" />}
            </div>
          ))}
        </div>
      </div>

      <div>
        {step === 1 && (
          <div className="grid gap-6 md:grid-cols-[1fr_350px] animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center justify-between text-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center text-sm font-black">1</span>
                    Select Exam Context
                  </div>
                </h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Exam Body</label>
                    <select className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:border-brand-light focus:bg-white outline-none transition-all font-bold text-slate-700" value={examBodyId} onChange={(e) => setExamBodyId(e.target.value)}>
                      {examBodies.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Grade / Class</label>
                    <select className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:border-brand-light focus:bg-white outline-none transition-all font-bold text-slate-700" value={classId} onChange={(e) => setClassId(e.target.value)}>
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Subject</label>
                    <select className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:border-brand-light focus:bg-white outline-none transition-all font-bold text-slate-700" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                      <option value="">Select a Subject</option>
                      {filteredSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Visual Confirmation Badge */}
                {(header.className || header.subjectName) && (
                  <div className="mt-6 p-4 rounded-2xl bg-brand/5 border border-brand/10 flex items-center justify-center gap-3">
                    <span className="text-xs font-bold text-slate-500">Selected Setup:</span>
                    <span className="px-3 py-1 rounded-full bg-white border border-slate-200 text-[10px] font-black uppercase text-slate-700 shadow-sm tracking-widest">{header.className || "Class"}</span>
                    <span className="text-slate-300">➔</span>
                    <span className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-black shadow-sm ${subjectId ? 'bg-brand text-white border border-transparent' : 'bg-rose-50 text-rose-500 border border-rose-200'}`}>
                      {subjectId ? header.subjectName : "No Subject Selected"}
                    </span>
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800">
                  <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center text-sm font-black">2</span>
                  Identity & Branding
                  {!isPremium && <span className="ml-auto text-[10px] font-black px-2 py-1 bg-amber-100 text-amber-700 rounded-lg uppercase tracking-widest">Premium Locked</span>}
                </h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">School / Institution Name</label>
                    <div className="relative">
                      <input
                        disabled={!isPremium}
                        className={`w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-brand-light focus:bg-white outline-none transition-all font-bold ${!isPremium ? "bg-slate-100/50 text-slate-400 italic" : "bg-slate-50/50 text-slate-700"}`}
                        value={header.schoolName}
                        onChange={(e) => setHeader((p) => ({ ...p, schoolName: e.target.value }))}
                        placeholder={isPremium ? "e.g. ABC Grammar School" : "Upgrade to unlock custom name"}
                      />
                      {!isPremium && <div className="absolute right-4 top-1/2 -translate-y-1/2 text-lg">🔒</div>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Exam Title</label>
                    <input className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:border-brand-light focus:bg-white outline-none transition-all font-bold text-slate-700" value={header.examTitle} onChange={(e) => setHeader((p) => ({ ...p, examTitle: e.target.value }))} placeholder="e.g. Mid-Term 2024" />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {["Monthly Test", "Mid-Term", "Final Term", "Weekly Quiz"].map(t => (
                        <button key={t} onClick={() => setHeader(p => ({ ...p, examTitle: t }))} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors">{t}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Date</label>
                    <input type="date" className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:border-brand-light focus:bg-white outline-none transition-all font-bold text-slate-700" value={header.dateLabel} onChange={(e) => setHeader((p) => ({ ...p, dateLabel: e.target.value }))} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">General Instructions</label>
                    <textarea rows={2} className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:border-brand-light focus:bg-white outline-none transition-all font-bold text-slate-700 resize-none" value={header.instructions} onChange={(e) => setHeader((p) => ({ ...p, instructions: e.target.value }))} placeholder="Enter instructions for students..." />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-brand/10 bg-brand/5 p-6 sticky top-4">
                <h4 className="font-black text-brand mb-2 text-xs uppercase tracking-widest">Guidance 💡</h4>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">Free users proceed with SaaS branding. Upgrade to enable custom identity, watermarks, and QR verification.</p>
                <button
                  onClick={() => setStep(2)}
                  disabled={!subjectId}
                  className="w-full mt-6 rounded-2xl bg-brand py-4 font-bold text-white shadow-lg shadow-brand/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 group disabled:pointer-events-none disabled:bg-slate-300 disabled:shadow-none"
                >
                  Continue to Syllabus
                  <svg className="group-hover:translate-x-1 transition-transform" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-6 md:grid-cols-[1fr_350px] animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center justify-between text-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center text-sm font-black">3</span>
                    Select Chapters
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-brand transition-colors">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded border-slate-300 text-brand focus:ring-brand"
                        checked={filteredChapters.length > 0 && chapterIds.length === filteredChapters.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setChapterIds(filteredChapters.map(c => c.id));
                          } else {
                            setChapterIds([]);
                          }
                        }}
                      />
                      Select All
                    </label>
                    <div className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">{chapterIds.length} Selected</div>
                  </div>
                </h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredChapters.map((c) => (
                    <label key={c.id} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${chapterIds.includes(c.id) ? "border-brand-light bg-brand/5 shadow-sm" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"}`}>
                      <input type="checkbox" className="w-5 h-5 rounded-lg border-slate-300 text-brand focus:ring-brand" checked={chapterIds.includes(c.id)} onChange={(e) => e.target.checked ? setChapterIds([...chapterIds, c.id]) : setChapterIds(chapterIds.filter(id => id !== c.id))} />
                      <div className="flex-1 flex justify-between items-center">
                        <div>
                          <div className="text-[10px] font-black text-slate-400 mb-0.5">CH {c.chapter_number}</div>
                          <div className="text-sm font-black text-slate-800">{c.title}</div>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${chapterCounts[c.id] ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                          {chapterCounts[c.id] || 0} Qs
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center justify-between text-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center text-sm font-black">4</span>
                    Select Topics (Optional)
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!filteredTopics.length) return;
                        setSelectedTopicIds((prev) => (prev.length === filteredTopics.length ? [] : filteredTopics.map((topic) => topic.id)));
                      }}
                      className="rounded-lg bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200"
                      disabled={!filteredTopics.length}
                    >
                      {selectedTopicIds.length === filteredTopics.length && filteredTopics.length > 0 ? "Unselect All Topics" : "Select All Topics"}
                    </button>
                    <div className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">{selectedTopicIds.length} Selected</div>
                  </div>
                </h3>

                {!chapterIds.length ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-500">
                    Select one or more chapters first, then their topics will appear here.
                  </div>
                ) : filteredTopics.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-500">
                    No topics available under selected chapters yet.
                  </div>
                ) : (
                  <div className="max-h-[320px] space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                    {filteredChapters
                      .filter((chapter) => chapterIds.includes(chapter.id))
                      .map((chapter) => {
                        const chapterTopics = filteredTopics.filter((topic) => topic.chapter_id === chapter.id);
                        if (!chapterTopics.length) return null;
                        return (
                          <div key={chapter.id} className="space-y-2">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                              Ch {chapter.chapter_number}: {chapter.title}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {chapterTopics.map((topic) => (
                                <label key={topic.id} className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all cursor-pointer ${selectedTopicIds.includes(topic.id) ? "border-brand-light bg-brand/5 text-slate-800" : "border-slate-100 text-slate-600 hover:border-slate-200 hover:bg-slate-50"}`}>
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                                    checked={selectedTopicIds.includes(topic.id)}
                                    onChange={(e) =>
                                      e.target.checked
                                        ? setSelectedTopicIds((prev) => Array.from(new Set([...prev, topic.id])))
                                        : setSelectedTopicIds((prev) => prev.filter((id) => id !== topic.id))
                                    }
                                  />
                                  <span>{topic.topic_number}. {topic.title}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center justify-between text-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center text-sm font-black">5</span>
                    Question Origin
                  </div>
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 mb-8">
                  {levels.map((lvl) => (
                    <label key={lvl.id} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${selectedLevels.includes(lvl.id) ? "border-brand-light bg-brand/5 shadow-sm" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"}`}>
                      <input type="checkbox" className="w-5 h-5 rounded-lg border-slate-300 text-brand focus:ring-brand" checked={selectedLevels.includes(lvl.id)} onChange={(e) => e.target.checked ? setSelectedLevels([...selectedLevels, lvl.id]) : setSelectedLevels(selectedLevels.filter(x => x !== lvl.id))} />
                      <span className="text-xs font-black text-slate-700 uppercase tracking-tighter">{lvl.label}</span>
                    </label>
                  ))}
                </div>

                <div className="space-y-4 pt-6 border-t border-slate-100">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Avoid Recent Papers</label>
                      <span className="text-xs font-black text-brand bg-brand/10 px-2 rounded">{recentPapersToAvoid}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium mb-3 ml-1">The system will try not to use questions that appeared in the last {recentPapersToAvoid} papers.</p>
                    <input
                      type="range"
                      min="0" max="10"
                      value={recentPapersToAvoid}
                      onChange={(e) => setRecentPapersToAvoid(Number(e.target.value))}
                      className="w-full accent-brand h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] font-black text-slate-300 uppercase mt-1 px-1">
                      <span>0 (None)</span>
                      <span>5</span>
                      <span>10 (Max)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 sticky top-4 shadow-sm">
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-500">Pool Size</span>
                    <span className="text-brand text-lg font-black">{Object.values(availableCounts).reduce((a, b) => a + b, 0)} Qs</span>
                  </div>

                  {Object.values(availableCounts).reduce((a, b) => a + b, 0) > 0 ? (
                    <div className="space-y-2 pt-2">
                      {(Object.entries(availableCounts) as [QuestionType, number][])
                        .filter(([_, count]) => count > 0)
                        .sort((a, b) => b[1] - a[1]) // Sort by count descending
                        .map(([type, count]) => (
                          <div key={type} className="flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            <span>{type.replace("_", " ")}</span>
                            <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded leading-none">{count}</span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-[10px] font-black text-amber-500 uppercase tracking-widest bg-amber-50 rounded-xl border border-amber-100">
                      Select chapters/topics & levels
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <span>Topic Filter</span>
                    <span className="text-slate-700">{selectedTopicIds.length ? `${selectedTopicIds.length} selected` : "All topics"}</span>
                  </div>
                </div>
                <button onClick={() => setStep(3)} disabled={!chapterIds.length} className="w-full rounded-2xl bg-brand py-4 font-bold text-white shadow-lg shadow-brand/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 group">Configure Composition <svg className="group-hover:translate-x-1 transition-transform" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></button>
                <button onClick={() => setStep(1)} className="w-full mt-3 rounded-2xl bg-slate-100 py-3 font-bold text-slate-400 hover:bg-slate-200 transition-all text-xs uppercase tracking-widest">Back</button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm overflow-hidden border-b-4 border-brand">
              <h3 className="text-lg font-bold mb-6 flex items-center justify-between text-slate-800">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center text-sm font-black">6</span>
                  Construction Strategy
                </div>
                {/* Save/Load Preset UI */}
                <div className="flex items-center gap-2">
                  {Object.keys(compositionPresets).length > 0 && (
                    <select
                      className="bg-slate-50 border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 rounded-lg px-3 py-2 outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                      onChange={(e) => {
                        if (e.target.value) {
                          setComposition(compositionPresets[e.target.value]);
                          toast("success", `Loaded preset: ${e.target.value}`);
                          e.target.value = ""; // Reset select
                        }
                      }}
                    >
                      <option value="">Load Preset...</option>
                      {Object.keys(compositionPresets).map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => {
                      const name = prompt("Enter a name for this paper composition preset:");
                      if (name && name.trim()) {
                        const newPresets = { ...compositionPresets, [name.trim()]: composition };
                        setCompositionPresets(newPresets);
                        localStorage.setItem("pg_composition_presets", JSON.stringify(newPresets));
                        toast("success", "Preset saved successfully!");
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-brand/10 text-brand hover:bg-brand hover:text-white rounded-lg transition-colors text-[10px] font-black uppercase tracking-widest cursor-pointer"
                  >
                    <span>💾</span> Save Preset
                  </button>
                </div>
              </h3>

              <div className="overflow-x-auto -mx-8">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-100">
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Select</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center" title="How many questions the student must attempt">Attempt From</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Marks</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Lines</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Total Marks</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-8">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compositionTypes
                      .filter(type => availableCounts[type] > 0 || composition.find(r => r.type === type)?.selected)
                      .map((type) => {
                        const row = composition.find(r => r.type === type) || getDefaultCompositionRow(type);
                        const available = availableCounts[type] || 0;
                        const isObjective = type === "mcq" || type === "true_false";

                        const updateRow = (updates: Partial<CompositionRow>) => {
                          setComposition(prev => {
                            if (!prev.find(r => r.type === type)) {
                              return [...prev, { ...getDefaultCompositionRow(type), ...updates }];
                            }
                            return prev.map(r => r.type === type ? { ...r, ...updates } : r);
                          });
                        };

                        return (
                          <tr key={type} className={`border-b border-slate-50 transition-colors ${row.selected ? "bg-brand/5 font-black" : "hover:bg-slate-50/50 opacity-60"}`}>
                            <td className="px-8 py-4"><input type="checkbox" className="w-5 h-5 rounded-lg border-slate-300 text-brand focus:ring-brand cursor-pointer" checked={row.selected} onChange={(e) => updateRow({ selected: e.target.checked })} /></td>
                            <td className="px-4 py-4 text-[11px] font-black uppercase text-slate-700 tracking-tighter">{type.replace("_", " ")}</td>
                            <td className="px-4 py-4"><input type="number" min={0} max={available} disabled={!row.selected} className={`w-16 mx-auto block rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-center focus:border-brand outline-none font-black disabled:opacity-50 disabled:bg-slate-100 disabled:cursor-not-allowed`} value={row.count} onChange={(e) => updateRow({ count: Number(e.target.value) })} /></td>
                            <td className="px-4 py-4"><input type="number" min={0} max={row.count} disabled={!row.selected} className={`w-16 mx-auto block rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-center focus:border-brand outline-none font-black disabled:opacity-50 disabled:bg-slate-100 disabled:cursor-not-allowed`} value={row.choice} onChange={(e) => updateRow({ choice: Number(e.target.value) })} title={row.choice < row.count ? "WARNING: Cannot attempt fewer than total qty" : ""} /></td>
                            <td className="px-4 py-4"><input type="number" min={0} disabled={!row.selected} className={`w-14 mx-auto block rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-center focus:border-brand outline-none font-black disabled:opacity-50 disabled:bg-slate-100 disabled:cursor-not-allowed`} value={row.marks} onChange={(e) => updateRow({ marks: Number(e.target.value) })} /></td>
                            <td className="px-4 py-4"><input type="number" min={0} disabled={isObjective || !row.selected} className={`w-14 mx-auto block rounded-xl border px-2 py-1.5 text-xs text-center outline-none font-black ${(isObjective || !row.selected) ? 'bg-slate-100 opacity-50 border-transparent text-slate-400 cursor-not-allowed' : 'border-slate-200 focus:border-brand'}`} value={isObjective ? 0 : row.emptyLines} onChange={(e) => updateRow({ emptyLines: Number(e.target.value) })} /></td>
                            <td className="px-4 py-4 text-center text-xs text-brand font-black">{row.selected ? row.choice * row.marks : 0}</td>
                            <td className="px-4 py-4 text-right pr-8"><span className={`text-[10px] font-black px-2 py-1 rounded-full ${available < row.count ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>{available} Qs</span></td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-black border-t-2 border-slate-100">
                      <td colSpan={6} className="px-8 py-4 text-right text-[10px] text-slate-400 uppercase tracking-widest">Aggregated Marks:</td>
                      <td className="px-4 py-4 text-center text-xl text-brand">{composition.filter(r => r.selected).reduce((acc, r) => acc + (r.choice * r.marks), 0)}</td>
                      <td className="pr-8"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex flex-wrap items-end gap-4">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Paper Variations (Sets)
                  <input
                    type="number"
                    min={1}
                    max={maxPlanSets}
                    value={requestedSets}
                    disabled={!isSubscriptionActive}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next)) return;
                      setRequestedSets(Math.max(1, Math.min(maxPlanSets, Math.floor(next))));
                    }}
                    className="mt-2 w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-700 outline-none focus:border-brand disabled:opacity-60"
                  />
                </label>
                <div className="text-xs text-slate-500 space-y-1">
                  <div>Current plan allows up to <span className="font-black text-slate-700">{maxPlanSets}</span> variation(s).</div>
                  {!isSubscriptionActive && <div className="text-rose-600 font-semibold">Subscription inactive. Renew plan to generate papers.</div>}
                  {subscriptionSummary && subscriptionSummary.maxPaperSets === 1 && (
                    <div className="text-brand font-semibold">Upgrade to Advanced for Set B/C variations.</div>
                  )}
                </div>
              </div>

              <div className="mt-8 flex justify-between items-center bg-slate-50 -mx-8 -mb-8 px-8 py-8 rounded-b-3xl border-t border-slate-100">
                <button onClick={() => setStep(2)} className="rounded-2xl px-6 py-3 font-bold text-slate-400 hover:bg-slate-200 transition-all text-xs uppercase tracking-widest">Back</button>
                <div className="flex flex-col items-end gap-2">
                  <button
                    disabled={!isSubscriptionActive || isGenerating || composition.some(r => r.selected && r.count > (availableCounts[r.type] || 0))}
                    onClick={async () => {
                      const success = await generate();
                      if (success) setStep(4);
                    }}
                    className="rounded-2xl bg-brand px-12 py-5 font-black text-white shadow-2xl shadow-brand/40 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 uppercase text-xs tracking-[0.2em] disabled:opacity-50 disabled:pointer-events-none disabled:bg-slate-400 disabled:shadow-none"
                  >
                    {isGenerating ? "Generating..." : "Generate & Preview"} <span className="text-xl">✨</span>
                  </button>
                  {composition.some(r => r.selected && r.count > (availableCounts[r.type] || 0)) && (
                    <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest px-2 relative -top-1">
                      ⚠️ Selected qty exceeds available pool
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="animate-in fade-in zoom-in-95 duration-700 flex flex-col gap-6">
            {/* Unified Top Control Bar (Truly Horizontal Ribbon) */}
            <div className="sticky top-4 z-40 flex flex-col gap-2">
              <div className="w-full bg-white/95 backdrop-blur-3xl p-5 rounded-[1.5rem] shadow-2xl shadow-slate-900/10 border border-white ring-1 ring-slate-900/5 flex flex-wrap items-center gap-y-4 gap-x-6 justify-between">

                {/* Paper Settings */}
                <div className="flex flex-wrap items-center gap-3">
                  <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-700 outline-none focus:border-brand" value={header.medium} onChange={(e) => setHeader({ ...header, medium: e.target.value as any })}>
                    <option value="English">Medium: English</option>
                    <option value="Urdu">Medium: Urdu</option>
                    <option value="Both">Medium: Both</option>
                  </select>
                  <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-700 outline-none focus:border-brand" value={header.paperSize} onChange={(e) => setHeader({ ...header, paperSize: e.target.value as any })}>
                    <option value="A4">Size: A4</option>
                    <option value="Letter">Size: Letter</option>
                    <option value="Legal">Size: Legal</option>
                  </select>
                  <input type="text" placeholder="Time" className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-700 outline-none focus:border-brand w-20" value={header.timeLabel} onChange={(e) => setHeader({ ...header, timeLabel: e.target.value })} />
                  <input type="text" placeholder="Term" className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-700 outline-none focus:border-brand w-24" value={header.term} onChange={(e) => setHeader({ ...header, term: e.target.value })} />
                  <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-700 outline-none focus:border-brand" value={header.blankInlineFor} onChange={(e) => setHeader({ ...header, blankInlineFor: e.target.value as any })}>
                    <option value="English">Blanks: English</option>
                    <option value="Urdu">Blanks: Urdu</option>
                    <option value="Math">Blanks: Math</option>
                    <option value="None">Blanks: None</option>
                  </select>
                </div>

                {/* Visual Settings */}
                <div className="flex flex-wrap items-center gap-5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest whitespace-nowrap">Font Size</span>
                    <input type="range" min={10} max={16} step={1} value={header.contentFontSize} onChange={(e) => setHeader(h => ({ ...h, contentFontSize: Number(e.target.value) }))} className="w-20 h-1.5 accent-brand bg-slate-100 rounded-full cursor-pointer" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest whitespace-nowrap">Zoom</span>
                    <input type="range" min={0.5} max={2.0} step={0.05} value={previewScale} onChange={(e) => setPreviewScale(Number(e.target.value))} className="w-20 h-1.5 accent-slate-900 bg-slate-100 rounded-full cursor-pointer" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest whitespace-nowrap">Layout</span>
                    <div className="bg-slate-100 p-0.5 rounded-lg flex gap-0.5">
                      <button onClick={() => setHeader(h => ({ ...h, printMode: "single" }))} className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${header.printMode === "single" ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:bg-slate-200"}`}>Single</button>
                      <button onClick={() => setHeader(h => ({ ...h, printMode: "double" }))} className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${header.printMode === "double" ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:bg-slate-200"}`}>Double</button>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 lg:ml-auto w-full lg:w-auto justify-end border-t lg:border-t-0 border-slate-100 pt-3 lg:pt-0 mt-1 lg:mt-0">
                  {generated && generated.sets.length > 1 && (
                    <select
                      className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-700 outline-none focus:border-brand"
                      value={activeSet?.label || ""}
                      onChange={(e) => setActiveSetLabel(e.target.value)}
                    >
                      {generated.sets.map((setRow) => (
                        <option key={setRow.label} value={setRow.label}>
                          Set {setRow.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <button onClick={() => activeSet && downloadAnswerPdf(activeSet, { ...generated!.paper.settings_json, header: { ...(generated!.paper.settings_json as any).header, ...header } } as any)} className="px-4 py-2 rounded-lg bg-white border border-slate-200 hover:border-brand hover:text-brand font-bold uppercase text-[10px] tracking-wide text-slate-600 transition-all shadow-sm">
                    Answer Key
                  </button>
                  <button onClick={() => activeSet && downloadQuestionDocx(activeSet, { ...generated!.paper.settings_json, header: { ...(generated!.paper.settings_json as any).header, ...header } } as any)} className="px-4 py-2 rounded-lg bg-[#2b579a] hover:bg-[#1e3e6d] text-white font-bold uppercase text-[10px] tracking-wide transition-all shadow-sm">
                    Word Docx
                  </button>
                  <button onClick={() => activeSet && openPrintableHtml(activeSet, { ...generated!.paper.settings_json, header: { ...(generated!.paper.settings_json as any).header, ...header } } as any)} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold uppercase text-[10px] tracking-wide transition-all shadow-sm">
                    PDF / Print
                  </button>

                  <div className="hidden lg:block w-[1px] h-6 bg-slate-200 mx-2" />

                  <button disabled={isGenerating} onClick={async () => { await generate(); }} className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold uppercase text-[10px] tracking-wide transition-all disabled:opacity-50">Regenerate</button>
                  <button onClick={() => {
                    const autoName = `${header.subjectName} - ${header.className} - ${header.dateLabel}`;
                    const currentHeader = (generated?.paper.settings_json as any)?.header || {};
                    const name = prompt("Enter a name to save this paper:", currentHeader.paperName || autoName);
                    if (name) {
                      const papers = JSON.parse(localStorage.getItem("pg_papers") || "[]");
                      const updatedPapers = papers.map((p: any) => {
                        if (p.id === generated?.paper.id) {
                          return { ...p, settings_json: { ...p.settings_json, header: { ...p.settings_json.header, paperName: name } } };
                        }
                        return p;
                      });
                      localStorage.setItem("pg_papers", JSON.stringify(updatedPapers));
                      toast("success", "Paper saved to My Papers successfully!");
                      // Manually dispatch storage event so other components (like AppLayout) can re-fetch
                      window.dispatchEvent(new Event("storage"));
                    }
                  }} className="px-4 py-2 rounded-lg bg-brand/10 text-brand hover:bg-brand hover:text-white font-bold uppercase text-[10px] tracking-wide transition-all flex items-center gap-1.5 shadow-sm">
                    💾 Save Paper
                  </button>
                  <button onClick={() => setStep(3)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold uppercase text-[10px] tracking-wide transition-all">Edit Paper</button>
                  <button onClick={() => { setGenerated(null); setStep(1); }} className="px-4 py-2 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 font-bold uppercase text-[10px] tracking-wide transition-all">Reset All</button>
                </div>
              </div>
            </div>

            {/* Maximized Paper Preview Container — always fits, pannable when zoomed */}
            <div
              key={generated?.paper.id ?? "preview-empty"}
              ref={previewContainerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="bg-slate-200/50 rounded-[3rem] shadow-inner border border-slate-200/60 w-full overflow-hidden flex justify-center py-12 transition-all duration-300 select-none"
              style={{
                minHeight: `${Math.round(paperNaturalHeight * effectiveScale + 96)}px`,
                cursor: canPan ? (isDragging.current ? 'grabbing' : 'grab') : 'default'
              }}
            >
              {generated ? (() => {
                const updateQuestionText = (qId: string, newText: string) => {
                  const newSets = generated.sets.map(s => ({
                    ...s,
                    questions: s.questions.map(q => q.id === qId ? { ...q, questionText: newText } : q)
                  }));
                  setGenerated({ ...generated, sets: newSets });
                };

                const updateOptionText = (qId: string, optIndex: number, newText: string) => {
                  const newSets = generated.sets.map(s => ({
                    ...s,
                    questions: s.questions.map(q => {
                      if (q.id === qId) {
                        const newOpts = [...q.options];
                        newOpts[optIndex] = newText;
                        return { ...q, options: newOpts };
                      }
                      return q;
                    })
                  }));
                  setGenerated({ ...generated, sets: newSets });
                };

                const handleSwapQuestion = async (qId: string, type: QuestionType) => {
                  try {
                    const currentIds = (activeSet?.questions || []).map(q => q.id);
                    const allAvailable = await getQuestions(profile!.school_id!, chapterIds);
                    const replacements = allAvailable.filter(
                      q => q.question_type === type &&
                        selectedLevels.includes(resolveQuestionLevel(q.question_level)) &&
                        (!selectedTopicIds.length || (!!q.topic_id && selectedTopicIds.includes(q.topic_id))) &&
                        !currentIds.includes(q.id)
                    );

                    if (replacements.length === 0) {
                      toast("error", "No alternative questions available in the current chapter/topic/level pool.");
                      return;
                    }

                    const newQ = replacements[Math.floor(Math.random() * replacements.length)];
                    const newSets = generated.sets.map(s => ({
                      ...s,
                      questions: s.questions.map(q => {
                        if (q.id === qId) {
                          return {
                            ...q,
                            id: newQ.id,
                            questionText: newQ.question_text,
                            options: [newQ.option_a, newQ.option_b, newQ.option_c, newQ.option_d].filter(Boolean) as string[],
                            correctAnswer: newQ.correct_answer,
                            explanation: newQ.explanation
                          };
                        }
                        return q;
                      })
                    }));
                    setGenerated({ ...generated, sets: newSets });
                    toast("success", "Question swapped successfully!");
                  } catch (e) {
                    console.error("Swap failed", e);
                    toast("error", "Failed to swap question.");
                  }
                };

                return (
                  <div className="flex justify-center items-start w-full">
                    <div
                      style={{
                        transform: `translate(${panX}px, ${panY}px) scale(${effectiveScale})`,
                        transformOrigin: 'top center',
                        transition: isDragging.current ? 'none' : 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                      className="shrink-0"
                    >
                      <div
                        id="print-sheet"
                        className={`bg-white shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)] select-none print:shadow-none font-sans 
                          ${header.printMode === "double" ? "w-[297mm] min-h-[210mm] flex p-[8mm] gap-[8mm]" :
                            header.paperSize === "Letter" ? "w-[215.9mm] min-h-[279.4mm] p-[10mm] flex flex-col" :
                              header.paperSize === "Legal" ? "w-[215.9mm] min-h-[355.6mm] p-[10mm] flex flex-col" :
                                "w-[210mm] min-h-[297mm] p-[10mm] flex flex-col"
                          }`}
                      >
                        {/* Single copy or two copies based on printMode */}
                        {[1, header.printMode === "double" ? 2 : null].filter(Boolean).map((n) => (
                          <div key={n} style={{ fontSize: `${header.contentFontSize}px` }} className={`flex-1 flex flex-col gap-2 ${header.printMode === "double" && n === 1 ? "border-r border-dashed border-slate-200 pr-[8mm]" : ""}`}>
                            {/* Paper Header based on Sample.pdf */}
                            <header className="relative pb-2 border-b-2 border-slate-800">
                              <div className="flex items-center justify-between mb-2 gap-4">
                                {header.schoolLogo && (
                                  <div
                                    className="rounded-full flex flex-shrink-0 items-center justify-center overflow-hidden"
                                    style={{ width: 80, height: 80 }}
                                  >
                                    <img src={header.schoolLogo} className="w-full h-full object-contain" />
                                  </div>
                                )}
                                <div className={`flex-1 ${header.schoolLogo && header.secondaryLogo ? 'text-center' : header.schoolLogo ? 'text-right' : header.secondaryLogo ? 'text-left' : 'text-center'}`}>
                                  <h1
                                    className="font-black uppercase tracking-tight text-slate-900 leading-none mb-1 hover:bg-brand/10 hover:text-brand focus:outline-none focus:bg-brand/10 transition-colors rounded px-2 -mx-2 cursor-text inline-block break-words max-w-full"
                                    style={{ fontSize: 30, fontWeight: 900 }}
                                    contentEditable
                                    suppressContentEditableWarning
                                    onBlur={(e) => setHeader({ ...header, schoolName: e.currentTarget.textContent || "School Name" })}
                                  >
                                    {header.schoolName}
                                  </h1>
                                  {header.showAddress !== false && (
                                    <p
                                      className="mt-1.5 font-bold text-slate-600 uppercase tracking-widest text-[11px] hover:bg-brand/10 hover:text-brand focus:outline-none focus:bg-brand/10 transition-colors rounded px-2 -mx-2 cursor-text"
                                      contentEditable suppressContentEditableWarning
                                      onBlur={(e) => setHeader({ ...header, schoolAddress: e.currentTarget.textContent || "School Address" })}
                                    >
                                      {header.schoolAddress || "School Address / Campus Branch Line"}
                                    </p>
                                  )}
                                  {header.showQR && isPremium && <div className="inline-block w-12 h-12 bg-slate-100 mt-2 mb-2" />}
                                </div>
                                {header.secondaryLogo && (
                                  <div
                                    className="rounded-full flex flex-shrink-0 items-center justify-center overflow-hidden"
                                    style={{ width: 80, height: 80 }}
                                  >
                                    <img src={header.secondaryLogo} className="w-full h-full object-contain" />
                                  </div>
                                )}
                              </div>

                              {/* Metadata Grid */}
                              <div className="grid grid-cols-2 gap-y-0.5 text-[11px] font-bold text-slate-800">
                                <div className="flex gap-2">
                                  <span className="w-28 text-slate-900">Name/ Roll No:</span>
                                  <span className="flex-1 border-b border-slate-900 min-w-[50px]"></span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="w-28 text-slate-900">Date:</span>
                                  <span
                                    className="font-black underline underline-offset-4 hover:bg-brand/10 focus:outline-none focus:bg-brand/10 transition-colors rounded px-1 -mx-1 cursor-text inline-block min-w-[20px]"
                                    contentEditable suppressContentEditableWarning
                                    onBlur={(e) => setHeader({ ...header, dateLabel: e.currentTarget.textContent || "" })}
                                  >{header.dateLabel}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="w-28 text-slate-900">Class:</span>
                                  <span
                                    className="hover:bg-brand/10 focus:outline-none focus:bg-brand/10 transition-colors rounded px-1 -mx-1 cursor-text inline-block min-w-[20px]"
                                    contentEditable suppressContentEditableWarning
                                    onBlur={(e) => setHeader({ ...header, className: e.currentTarget.textContent || "" })}
                                  >{header.className}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="w-28 text-slate-900">Time Allowed:</span>
                                  <span
                                    className="hover:bg-brand/10 focus:outline-none focus:bg-brand/10 transition-colors rounded px-1 -mx-1 cursor-text inline-block min-w-[20px]"
                                    contentEditable suppressContentEditableWarning
                                    onBlur={(e) => setHeader({ ...header, timeLabel: e.currentTarget.textContent || "" })}
                                  >{header.timeLabel}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="w-28 text-slate-900">Term / Medium:</span>
                                  <span className="flex-1 whitespace-nowrap overflow-hidden">
                                    <span
                                      className="hover:bg-brand/10 focus:outline-none focus:bg-brand/10 transition-colors rounded px-1 -mx-1 cursor-text"
                                      contentEditable suppressContentEditableWarning
                                      onBlur={(e) => setHeader({ ...header, term: e.currentTarget.textContent || "" })}
                                    >{header.term}</span> / {header.medium}
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="w-28 text-slate-900">Chapter:</span>
                                  <span className="italic">{chapterIds.length > 0 ? filteredChapters.filter(c => chapterIds.includes(c.id)).map(c => `Ch. ${c.chapter_number}`).join(", ") : "All Chapters"}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="w-28 text-slate-900">Maximum Marks:</span>
                                  <span className="font-black">{activeSet?.totalMarks ?? 0}</span>
                                </div>
                              </div>

                              {header.showWatermark && isPremium && (
                                <div
                                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none -rotate-12 z-0 font-black uppercase tracking-widest text-[120px] text-center w-full"
                                  style={{ color: `rgba(0,0,0,${header.watermarkOpacity ?? 0.05})` }}
                                >
                                  {header.watermarkType === 'Image' && header.schoolLogo ? (
                                    <img
                                      src={header.schoolLogo}
                                      className="object-contain mx-auto"
                                      style={{ width: 400, height: 400 }}
                                    />
                                  ) : (
                                    header.schoolName
                                  )}
                                </div>
                              )}
                            </header>

                            {/* Instructions */}
                            {header.instructions && (
                              <div className="text-[11px] font-bold italic text-slate-600 bg-slate-50 p-2 rounded border-l-4 border-slate-300">
                                Inst: <span
                                  className="hover:bg-brand/10 focus:outline-none focus:bg-brand/10 transition-colors rounded px-1 -mx-1 cursor-text"
                                  contentEditable suppressContentEditableWarning
                                  onBlur={(e) => setHeader({ ...header, instructions: e.currentTarget.textContent || "" })}
                                >{header.instructions}</span>
                              </div>
                            )}

                            {/* Flattened Question List - No Sections */}
                            <main className="flex-1 space-y-4 mt-2 relative z-10" style={{ lineHeight: header.lineHeight || 1.5 }}>
                              {(activeSet?.questions || []).map((q, qIndex) => {
                                const sectionMeta = composition.find(r => r.type === q.questionType);
                                const emptyLines = q.emptyLines ?? sectionMeta?.emptyLines ?? 0;

                                return (
                                  <div key={q.id} className="relative pl-8 group/question">
                                    <span className="absolute left-0 font-bold">{qIndex + 1}.</span>
                                    {/* Inline Swap Button */}
                                    <button
                                      onClick={() => handleSwapQuestion(q.id, q.questionType)}
                                      className="absolute -left-8 top-1 opacity-0 group-hover/question:opacity-100 bg-brand/10 hover:bg-brand text-brand hover:text-white transition-all rounded p-1 shadow-sm tooltip"
                                      title="Swap Question"
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-4-4" /><path d="M17 20V4" /><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /></svg>
                                    </button>
                                    <div className="flex-1">
                                      <p
                                        className="font-medium text-slate-800 leading-snug hover:bg-brand/10 focus:outline-none focus:bg-brand/10 transition-colors rounded px-1 -mx-1 cursor-text"
                                        contentEditable
                                        suppressContentEditableWarning
                                        onBlur={(e) => updateQuestionText(q.id, e.currentTarget.textContent || "")}
                                      >
                                        {q.questionText}
                                      </p>
                                      {q.options.length > 0 && (
                                        <div className="grid grid-cols-4 gap-4 mt-2 text-[11px] font-bold">
                                          {q.options.map((opt, idx) => (
                                            <div key={idx} className="flex gap-1 items-start">
                                              <span>{String.fromCharCode(65 + idx)}.</span>
                                              <span
                                                className="hover:bg-brand/10 focus:outline-none focus:bg-brand/10 transition-colors rounded px-1 -mx-1 cursor-text"
                                                contentEditable
                                                suppressContentEditableWarning
                                                onBlur={(e) => updateOptionText(q.id, idx, e.currentTarget.textContent || "")}
                                              >
                                                {opt}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {emptyLines > 0 ? (
                                        <div className="mt-3 space-y-0">
                                          {Array.from({ length: emptyLines }).map((_, li) => (
                                            <div key={li} className="h-7 border-b border-slate-300 w-full" />
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </main>

                            {/* Footer intentionally removed to align with export styling */}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="flex flex-col items-center justify-center p-20 text-slate-400 text-center gap-8 bg-white/50 rounded-3xl backdrop-blur-sm border-2 border-dashed border-slate-200 w-full h-full">
                  <div className="relative w-24 h-24">
                    <div className="absolute inset-0 rounded-full border-8 border-slate-100 border-t-brand animate-spin" />
                    <div className="absolute inset-4 rounded-full border-8 border-slate-50 border-b-brand-light animate-spin-slow" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-black text-slate-600 uppercase tracking-[0.3em] text-sm italic">Engine Initializing</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Optimizing distribution for {header.subjectName}...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
