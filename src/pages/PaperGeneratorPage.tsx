import { useEffect, useMemo, useRef, useState } from "react";
import { getAppSettings } from "@/services/appSettings";
import { downloadAnswerPdf, downloadQuestionDocx, downloadQuestionPdf, downloadRubricPdf, openPrintableHtml } from "@/services/exporters";
import { generatePaperBundle } from "@/services/paperEngine";
import {
  getChapters,
  getClasses,
  getExamBodies,
  getQuestions,
  getRecentQuestionUsage,
  getSubjects,
  savePaperAndUsage,
} from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";
import type { BloomLevel, ChapterEntity, ClassEntity, Difficulty, ExamBody, GeneratorSettings, SubjectEntity, QuestionLevel, QuestionType, GeneratedQuestion } from "@/types/domain";

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

  const [isGenerating, setIsGenerating] = useState(false);
  const [step, setStep] = useState(1);
  const [examBodyId, setExamBodyId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<QuestionLevel[]>(["exercise"]);
  const [recentPapersToAvoid, setRecentPapersToAvoid] = useState(3);
  const [previewScale, setPreviewScale] = useState(1.0);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
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

  const appSettings = getAppSettings();
  const subjectName = subjects.find(s => s.id === subjectId)?.name || "";

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
    dateLabel: new Date().toLocaleDateString(),
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
  }, [classId, classes]);

  useEffect(() => {
    load();
  }, [profile?.school_id, examBodyId]);

  const filteredSubjects = useMemo(() => subjects.filter((s) => s.class_id === classId), [subjects, classId]);
  const filteredChapters = useMemo(() => chapters.filter((c) => c.subject_id === subjectId), [chapters, subjectId]);

  useEffect(() => {
    async function updateCounts() {
      if (!profile?.school_id || !chapterIds.length || !selectedLevels.length) {
        setAvailableCounts({ mcq: 0, true_false: 0, fill_blanks: 0, short: 0, long: 0, matching: 0, diagram: 0 });
        return;
      }
      const q = await getQuestions(profile.school_id, chapterIds);
      const filtered = q.filter((x) => selectedLevels.includes(resolveQuestionLevel(x.question_level)));
      const counts: Record<QuestionType, number> = { mcq: 0, true_false: 0, fill_blanks: 0, short: 0, long: 0, matching: 0, diagram: 0 };
      filtered.forEach(x => { counts[x.question_type] = (counts[x.question_type] || 0) + 1; });
      setAvailableCounts(counts);
    }
    updateCounts();
  }, [profile?.school_id, chapterIds, selectedLevels]);

  async function generate() {
    if (!profile?.school_id || !profile.id || !subjectId || !chapterIds.length) {
      toast("error", "Please complete step 1 and 2 before generating.");
      return false;
    }

    setIsGenerating(true);
    setGenerated(null); // Clear old paper to prevent stale previews/prints

    const questionPool = await getQuestions(profile.school_id, chapterIds);
    const filteredPool = questionPool.filter((q) => selectedLevels.includes(resolveQuestionLevel(q.question_level)));

    if (filteredPool.length === 0) {
      toast("error", "The selected chapters have no questions. Please select different chapters or question levels.");
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
      toast("warning", "Please select at least one question type (Section) for the paper.");
      return false;
    }

    const settings: GeneratorSettings = {
      classId,
      subjectId,
      chapterIds,
      examType: "monthly",
      sets: 1,
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

      if (bundle.sets[0].questions.length === 0) {
        throw new Error("Could not find any questions matching your criteria. Check question types.");
      }

      await savePaperAndUsage(bundle.paper, mappings, usage);
      setGenerated(bundle);
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
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Date</label>
                    <input className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:border-brand-light focus:bg-white outline-none transition-all font-bold text-slate-700" value={header.dateLabel} onChange={(e) => setHeader((p) => ({ ...p, dateLabel: e.target.value }))} />
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
                  className="w-full mt-6 rounded-2xl bg-brand py-4 font-bold text-white shadow-lg shadow-brand/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 group"
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
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{chapterIds.length} Chapters</div>
                </h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredChapters.map((c) => (
                    <label key={c.id} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${chapterIds.includes(c.id) ? "border-brand-light bg-brand/5 shadow-sm" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"}`}>
                      <input type="checkbox" className="w-5 h-5 rounded-lg border-slate-300 text-brand focus:ring-brand" checked={chapterIds.includes(c.id)} onChange={(e) => e.target.checked ? setChapterIds([...chapterIds, c.id]) : setChapterIds(chapterIds.filter(id => id !== c.id))} />
                      <div className="flex-1">
                        <div className="text-[10px] font-black text-slate-400 mb-0.5">CH {c.chapter_number}</div>
                        <div className="text-sm font-black text-slate-800">{c.title}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800">
                  <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center text-sm font-black">4</span>
                  Question Origin
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {levels.map((lvl) => (
                    <label key={lvl.id} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${selectedLevels.includes(lvl.id) ? "border-brand-light bg-brand/5 shadow-sm" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"}`}>
                      <input type="checkbox" className="w-5 h-5 rounded-lg border-slate-300 text-brand focus:ring-brand" checked={selectedLevels.includes(lvl.id)} onChange={(e) => e.target.checked ? setSelectedLevels([...selectedLevels, lvl.id]) : setSelectedLevels(selectedLevels.filter(x => x !== lvl.id))} />
                      <span className="text-xs font-black text-slate-700 uppercase tracking-tighter">{lvl.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 sticky top-4 shadow-sm">
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-xs font-black uppercase tracking-widest"><span className="text-slate-500 font-medium">Pool Size</span><span className="text-brand">{Object.values(availableCounts).reduce((a, b) => a + b, 0)} Qs</span></div>
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
                  <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center text-sm font-black">5</span>
                  Construction Strategy
                </div>
              </h3>

              <div className="overflow-x-auto -mx-8">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-100">
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Select</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Choice</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Marks</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Lines</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Total</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-8">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["mcq", "true_false", "matching", "fill_blanks", "short", "long", "diagram"] as QuestionType[]).map((type) => {
                      const row = composition.find(r => r.type === type) || { type, count: 0, choice: 0, marks: 0, emptyLines: 0, selected: false };
                      const available = availableCounts[type] || 0;
                      return (
                        <tr key={type} className={`border-b border-slate-50 transition-colors ${row.selected ? "bg-brand/5 font-black" : "hover:bg-slate-50/50"}`}>
                          <td className="px-8 py-4"><input type="checkbox" className="w-5 h-5 rounded-lg border-slate-300 text-brand focus:ring-brand" checked={row.selected} onChange={(e) => setComposition(composition.map(r => r.type === type ? { ...r, selected: e.target.checked } : r))} /></td>
                          <td className="px-4 py-4 text-[11px] font-black uppercase text-slate-700 tracking-tighter">{type.replace("_", " ")}</td>
                          <td className="px-4 py-4"><input type="number" className="w-16 mx-auto block rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-center focus:border-brand outline-none font-black" value={row.count} onChange={(e) => setComposition(composition.map(r => r.type === type ? { ...r, count: Number(e.target.value) } : r))} /></td>
                          <td className="px-4 py-4"><input type="number" className="w-16 mx-auto block rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-center focus:border-brand outline-none font-black" value={row.choice} onChange={(e) => setComposition(composition.map(r => r.type === type ? { ...r, choice: Number(e.target.value) } : r))} /></td>
                          <td className="px-4 py-4"><input type="number" className="w-14 mx-auto block rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-center focus:border-brand outline-none font-black" value={row.marks} onChange={(e) => setComposition(composition.map(r => r.type === type ? { ...r, marks: Number(e.target.value) } : r))} /></td>
                          <td className="px-4 py-4"><input type="number" className="w-14 mx-auto block rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-center focus:border-brand outline-none font-black" value={row.emptyLines} onChange={(e) => setComposition(composition.map(r => r.type === type ? { ...r, emptyLines: Number(e.target.value) } : r))} /></td>
                          <td className="px-4 py-4 text-center text-xs text-brand font-black">{row.selected ? row.choice * row.marks : 0}</td>
                          <td className="px-4 py-4 text-right pr-8"><span className={`text-[10px] font-black ${available < row.count ? "text-rose-600" : "text-emerald-600"}`}>{available} Qs</span></td>
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

              <div className="mt-8 flex justify-between items-center bg-slate-50 -mx-8 -mb-8 px-8 py-8 rounded-b-3xl border-t border-slate-100">
                <button onClick={() => setStep(2)} className="rounded-2xl px-6 py-3 font-bold text-slate-400 hover:bg-slate-200 transition-all text-xs uppercase tracking-widest">Back</button>
                <button
                  disabled={isGenerating}
                  onClick={async () => {
                    const success = await generate();
                    if (success) setStep(4);
                  }}
                  className="rounded-2xl bg-brand px-12 py-5 font-black text-white shadow-2xl shadow-brand/40 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 uppercase text-xs tracking-[0.2em] disabled:opacity-50"
                >
                  {isGenerating ? "Generating..." : "Generate & Preview"} <span className="text-xl">✨</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="animate-in fade-in zoom-in-95 duration-700 flex flex-col gap-6">
            {/* Unified Top Control Bar (Truly Horizontal Ribbon) */}
            <div className="sticky top-4 z-40 flex flex-col gap-2">
              {/* Secondary Configuration Toolbar (New) */}
              <div className="w-full bg-white/60 backdrop-blur-2xl px-6 py-2 rounded-2xl shadow-xl shadow-slate-900/5 border border-white/50 ring-1 ring-slate-900/5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Medium:</span>
                    <select className="bg-white/50 border border-slate-200 rounded-md px-2 py-0.5 text-[10px] font-bold text-slate-700 outline-none focus:border-brand" value={header.medium} onChange={(e) => setHeader({ ...header, medium: e.target.value as any })}>
                      <option value="English">English</option>
                      <option value="Urdu">Urdu</option>
                      <option value="Both">Both</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Paper:</span>
                    <select className="bg-white/50 border border-slate-200 rounded-md px-2 py-0.5 text-[10px] font-bold text-slate-700 outline-none focus:border-brand" value={header.paperSize} onChange={(e) => setHeader({ ...header, paperSize: e.target.value as any })}>
                      <option value="A4">A4 (8.27" x 11.69")</option>
                      <option value="Letter">Letter (8.5" x 11")</option>
                      <option value="Legal">Legal (8.5" x 14")</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Time:</span>
                    <input type="text" className="bg-white/50 border border-slate-200 rounded-md px-2 py-0.5 text-[10px] font-bold text-slate-700 outline-none focus:border-brand w-20" value={header.timeLabel} onChange={(e) => setHeader({ ...header, timeLabel: e.target.value })} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Term:</span>
                    <input type="text" className="bg-white/50 border border-slate-200 rounded-md px-2 py-0.5 text-[10px] font-bold text-slate-700 outline-none focus:border-brand w-24" value={header.term} onChange={(e) => setHeader({ ...header, term: e.target.value })} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Blanks:</span>
                    <select className="bg-white/50 border border-slate-200 rounded-md px-2 py-0.5 text-[10px] font-bold text-slate-700 outline-none focus:border-brand" value={header.blankInlineFor} onChange={(e) => setHeader({ ...header, blankInlineFor: e.target.value as any })}>
                      <option value="English">English</option>
                      <option value="Urdu">Urdu</option>
                      <option value="Math">Math</option>
                      <option value="None">None</option>
                    </select>
                  </div>
                </div>
                <div className="text-[9px] font-bold text-brand uppercase tracking-widest flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                  Live Preview Optimization
                </div>
              </div>

              {/* Primary View Toolbar (Existing) */}
              <div className="w-full bg-white/95 backdrop-blur-3xl px-6 py-4 rounded-[1.5rem] shadow-2xl shadow-slate-900/10 border border-white ring-1 ring-slate-900/5 flex items-center justify-between gap-4">
                {/* Visual Adjustment Group */}
                <div className="flex items-center gap-6 border-r pr-6 border-slate-100 overflow-x-auto no-scrollbar">
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest whitespace-nowrap">Font Size</span>
                    <input type="range" min={10} max={16} step={1} value={header.contentFontSize} onChange={(e) => setHeader(h => ({ ...h, contentFontSize: Number(e.target.value) }))} className="w-20 h-1 accent-brand appearance-none bg-slate-100 rounded-full" />
                    <span className="text-[10px] font-black text-brand w-8 text-center">{header.contentFontSize}px</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest whitespace-nowrap">Zoom</span>
                    <input type="range" min={0.5} max={2.0} step={0.05} value={previewScale} onChange={(e) => setPreviewScale(Number(e.target.value))} className="w-20 h-1 accent-slate-900 appearance-none bg-slate-100 rounded-full" />
                    <span className="text-[10px] font-black text-slate-900 w-12 text-center">{Math.round(previewScale * 100)}%</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest whitespace-nowrap">Layout</span>
                    <div className="bg-slate-100 p-0.5 rounded-lg flex gap-0.5">
                      <button onClick={() => setHeader(h => ({ ...h, printMode: "single" }))} className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${header.printMode === "single" ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:bg-slate-200"}`}>SINGLE</button>
                      <button onClick={() => setHeader(h => ({ ...h, printMode: "double" }))} className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${header.printMode === "double" ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:bg-slate-200"}`}>DOUBLE</button>
                    </div>
                  </div>
                </div>

                {/* Status & Storage (New) */}
                <div className="flex items-center gap-4 px-4 border-r border-slate-100 hidden lg:flex">
                  <button
                    onClick={() => {
                      if (confirm("This will clear all generated papers to free up space. Continue?")) {
                        localStorage.removeItem("pg_papers");
                        localStorage.removeItem("pg_paper_questions");
                        localStorage.removeItem("pg_usage");
                        window.location.reload();
                      }
                    }}
                    className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-600 transition-colors tracking-widest"
                  >
                    Clear History ♻️
                  </button>
                </div>

                {/* Action Buttons Group (Single Line) */}
                <div className="flex items-center justify-end gap-1.5 flex-nowrap shrink-0">
                  <button onClick={() => downloadAnswerPdf(generated!.sets[0], { ...generated!.paper.settings_json, header: { ...(generated!.paper.settings_json as any).header, ...header } } as any)} className="whitespace-nowrap flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:border-brand hover:text-brand transition-all font-bold uppercase text-[11px] tracking-wide text-slate-600">
                    KEY 🔑
                  </button>
                  <button onClick={() => openPrintableHtml(generated!.sets[0], { ...generated!.paper.settings_json, header: { ...(generated!.paper.settings_json as any).header, ...header } } as any)} className="whitespace-nowrap flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 text-white shadow-sm hover:scale-[1.03] active:scale-95 transition-all font-bold uppercase text-[11px] tracking-wide">
                    PRINT / PDF 🖨️
                  </button>
                  <div className="w-[1px] h-5 bg-slate-200 mx-1" />
                  <button onClick={() => setStep(3)} className="whitespace-nowrap px-3.5 py-2 rounded-lg bg-slate-100 font-bold text-slate-600 hover:bg-slate-200 transition-all text-[10px] uppercase tracking-wide">Edit</button>
                  <button onClick={() => { setGenerated(null); setStep(1); }} className="whitespace-nowrap px-3.5 py-2 rounded-lg bg-rose-50 font-bold text-rose-500 hover:bg-rose-100 transition-all text-[10px] uppercase tracking-wide">Reset</button>
                </div>
              </div>
            </div>

            {/* Maximized Paper Preview Container — always fits, pannable when zoomed */}
            <div
              key={generated.paper.id}
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
                                  <span className="font-black">{generated.sets[0].totalMarks}</span>
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
                              {generated.sets[0].questions.map((q, qIndex) => {
                                const sectionMeta = composition.find(r => r.type === q.questionType);
                                const emptyLines = q.emptyLines ?? sectionMeta?.emptyLines ?? 0;

                                return (
                                  <div key={q.id} className="relative pl-8">
                                    <span className="absolute left-0 font-bold">{qIndex + 1}.</span>
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

                            {/* Signature Footer */}
                            <footer className="mt-8 pt-4 border-t border-slate-200">
                              <div className="flex justify-between items-end gap-12">
                                {header.signatureBlocks.map((sig, idx) => (
                                  <div key={idx} className="flex-1 text-center font-bold text-[9px] uppercase tracking-tighter text-slate-400">
                                    <div className="border-b border-slate-200 mb-1 h-6" />
                                    <span
                                      className="hover:bg-brand/10 hover:text-brand focus:text-brand focus:outline-none focus:bg-brand/10 transition-colors rounded px-1 -mx-1 cursor-text inline-block min-w-[50px]"
                                      contentEditable suppressContentEditableWarning
                                      onBlur={(e) => {
                                        const newSigs = [...header.signatureBlocks];
                                        newSigs[idx] = e.currentTarget.textContent || "SIGNATURE";
                                        setHeader({ ...header, signatureBlocks: newSigs });
                                      }}
                                    >
                                      {sig}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-6 text-center text-[8px] font-black text-slate-300 uppercase tracking-[0.4em]">
                                *** End of Paper ***
                              </div>
                            </footer>
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
