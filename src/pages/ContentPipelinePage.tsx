import { Fragment, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useHierarchy } from "@/hooks/useHierarchy";
import { useHierarchyScopeParams } from "@/hooks/useHierarchyScopeParams";
import {
  addContentSource,
  getContentChunksBySource,
  getContentChunkCountsBySources,
  getContentSources,
  getGenerationCandidates,
  getGenerationJobs,
  getSubscriptionSummary,
  getTopics,
  getClasses,
  getSubjects,
  getChapters,
  queueGenerationJob,
  assertCanGenerateArtifact,
  deleteGenerationCandidates,
  reviewGenerationCandidate,
  updateContentSourceFilePath,
  deleteContentSource,
} from "@/services/repositories";
import { extractPdfText, sha256Hex } from "@/services/pdfText";
import { cacheSourceText } from "@/services/sourceTextCache";
import { canUseSupabase, supabase } from "@/services/supabase";
import { invokeIngestSource, invokePublishCandidates, invokeRunGenerationJobs } from "@/services/pipelineRuntime";
import type { ArtifactType, BloomLevel, ContentChunk, ContentSource, Difficulty, GenerationCandidate, GenerationJob, QuestionType, TopicEntity } from "@/types/domain";
import { SourceManager } from "@/components/pipeline/SourceManager";
import { JobQueue } from "@/components/pipeline/JobQueue";
import { CandidateReview } from "@/components/pipeline/CandidateReview";
import { ResourceLibrary } from "@/components/pipeline/ResourceLibrary";
import { Layers, Zap, CheckSquare, Sparkles, ChevronRight, ChevronLeft, Trash2, AlertCircle, Library } from "lucide-react";
import { PdfCanvasViewer } from "@/components/pipeline/PdfCanvasViewer";

const questionTypes: QuestionType[] = ["mcq", "true_false", "fill_blanks", "short", "long", "matching", "diagram"];
const difficulties: Difficulty[] = ["easy", "medium", "hard"];
const blooms: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate"];

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// sha256Hex imported from @/services/pdfText

export function ContentPipelinePage() {
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);
  const { scope, mergeScope } = useHierarchyScopeParams();

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

  const [topics, setTopics] = useState<TopicEntity[]>([]);
  const [topicId, setTopicId] = useState("");

  const [sources, setSources] = useState<any[]>([]);
  const [chunkCountBySource, setChunkCountBySource] = useState<Record<string, number>>({});
  const [activePreviewSourceId, setActivePreviewSourceId] = useState("");
  const [previewChunks, setPreviewChunks] = useState<ContentChunk[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [candidates, setCandidates] = useState<GenerationCandidate[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceTitle, setSourceTitle] = useState("");
  const [uploadingSource, setUploadingSource] = useState(false);
  const [runningJobs, setRunningJobs] = useState(false);
  const [ingestingSourceId, setIngestingSourceId] = useState("");
  const [ingestingAll, setIngestingAll] = useState(false);

  const [artifact, setArtifact] = useState<ArtifactType>("question");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [count, setCount] = useState(10);
  const [contextStartPage, setContextStartPage] = useState(1);
  const [contextEndPage, setContextEndPage] = useState(30);
  const [questionType, setQuestionType] = useState<QuestionType>("mcq");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [bloom, setBloom] = useState<BloomLevel>("understand");
  const [instructions, setInstructions] = useState("");
  const [queueingJob, setQueueingJob] = useState(false);

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [deletingCandidates, setDeletingCandidates] = useState(false);
  const [expandedCandidateId, setExpandedCandidateId] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState("");
  const [pdfViewerPage, setPdfViewerPage] = useState(1);
  const [isPdfViewerOpen, setIsPdfViewerOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [rangeStatusHint, setRangeStatusHint] = useState("");
  const [localPdfPreviewUrls, setLocalPdfPreviewUrls] = useState<Record<string, string>>({});
  const pdfBlobUrlsRef = useRef<Record<string, string>>({});
  const localPdfPreviewUrlsRef = useRef<Record<string, string>>({});
  const pdfIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [subscriptionSummary, setSubscriptionSummary] = useState<Awaited<ReturnType<typeof getSubscriptionSummary>> | null>(null);
  const [uploadingToCloud, setUploadingToCloud] = useState<Record<string, boolean>>({});
  const [allSchoolSources, setAllSchoolSources] = useState<ContentSource[]>([]);
  const [allSchoolClasses, setAllSchoolClasses] = useState<any[]>([]);
  const [allSchoolSubjects, setAllSchoolSubjects] = useState<any[]>([]);
  const [allSchoolChapters, setAllSchoolChapters] = useState<any[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  const activeSource = sources.find((source) => source.id === activePreviewSourceId) || null;
  const selectedQueueSource = sources.find((source) => source.id === selectedSourceId) || null;
  const activeSourcePageCount = Math.max(0, Number(activeSource?.pages || 0));
  // Do not hard-cap navigation by ingest-detected page count (it can be incomplete/inaccurate).
  const pdfPageCap = 5000;
  const sourceSelectionStorageKey = useMemo(() => {
    if (!profile?.school_id || !chapterId) return "";
    return `pg_pipeline_source_selection:${profile.school_id}:${chapterId}:${topicId || "all"}`;
  }, [profile?.school_id, chapterId, topicId]);

  function readPersistedSourceSelection() {
    if (!sourceSelectionStorageKey || typeof window === "undefined") {
      return { activePreviewSourceId: "", selectedSourceId: "" };
    }
    try {
      const raw = localStorage.getItem(sourceSelectionStorageKey);
      if (!raw) return { activePreviewSourceId: "", selectedSourceId: "" };
      const parsed = JSON.parse(raw) as { activePreviewSourceId?: string; selectedSourceId?: string };
      return {
        activePreviewSourceId: String(parsed.activePreviewSourceId || "").trim(),
        selectedSourceId: String(parsed.selectedSourceId || "").trim(),
      };
    } catch {
      return { activePreviewSourceId: "", selectedSourceId: "" };
    }
  }

  useEffect(() => {
    if (!sourceSelectionStorageKey || typeof window === "undefined") return;
    try {
      localStorage.setItem(
        sourceSelectionStorageKey,
        JSON.stringify({
          activePreviewSourceId: activePreviewSourceId || "",
          selectedSourceId: selectedSourceId || "",
        }),
      );
    } catch {
      // ignore localStorage errors
    }
  }, [sourceSelectionStorageKey, activePreviewSourceId, selectedSourceId]);

  useEffect(() => {
    localPdfPreviewUrlsRef.current = localPdfPreviewUrls;
  }, [localPdfPreviewUrls]);

  useEffect(() => {
    return () => {
      // Cleanup all local blobs (upload previews + proxy blobs)
      const all = { ...localPdfPreviewUrlsRef.current, ...pdfBlobUrlsRef.current };
      Object.values(all).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore revoke errors
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!chapterId) {
      setTopics([]);
      setTopicId("");
      return;
    }
    getTopics([chapterId])
      .then((rows) => setTopics(rows))
      .catch(() => setTopics([]));
  }, [chapterId]);

  useEffect(() => {
    if (!topicId) return;
    if (!topics.some((t) => t.id === topicId)) {
      setTopicId("");
    }
  }, [topics, topicId]);

  useEffect(() => {
    if (!selectedSourceId) return;
    if (!sources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId("");
    }
  }, [sources, selectedSourceId]);

  useEffect(() => {
    let active = true;
    async function loadPdfPreview() {
      setPdfPreviewError("");
      setPdfPreviewUrl("");
      setPdfViewerPage(1);
      setRangeStatusHint("");
      if (!isPdfSource(activeSource)) return;
      setPdfPreviewLoading(true);
      try {
        const url = await resolvePdfPreviewUrl(activeSource);
        if (!active) return;
        if (!url) {
          setPdfPreviewError("PDF preview unavailable for this source. Re-upload local PDF in this session or use cloud upload.");
          return;
        }
        setPdfPreviewUrl(url);
      } catch (error) {
        if (!active) return;
        setPdfPreviewError(error instanceof Error ? error.message : "Failed to load PDF preview.");
      } finally {
        if (active) setPdfPreviewLoading(false);
      }
    }
    void loadPdfPreview();
    return () => {
      active = false;
    };
  }, [activePreviewSourceId, sources, localPdfPreviewUrls]);

  useEffect(() => {
    if (!isPdfViewerOpen || !pdfPreviewUrl) return;

    // Chrome's built-in PDF viewer fires postMessage events to the parent page.
    function onPdfMessage(event: MessageEvent) {
      try {
        const data = event.data;
        if (!data || typeof data !== "object") return;
        const type = typeof data.type === "string" ? data.type.toLowerCase() : "";
        if ((type === "pagechange" || type === "pagechanged") && data.pageNumber !== undefined) {
          const raw = Number(data.pageNumber);
          const page = raw === 0 ? 1 : raw;
          setPdfViewerPage(Math.max(1, Math.min(pdfPageCap, page)));
          return;
        }
        if (type === "documentloaded" && data.pageNumber !== undefined) {
          const raw = Number(data.pageNumber);
          const page = raw === 0 ? 1 : raw;
          setPdfViewerPage(Math.max(1, Math.min(pdfPageCap, page)));
        }
      } catch {
        // Ignore malformed messages
      }
    }
    window.addEventListener("message", onPdfMessage);
    return () => window.removeEventListener("message", onPdfMessage);
  }, [isPdfViewerOpen, pdfPreviewUrl, pdfPageCap]);

  // When the PDF is loaded as a same-origin blob:// URL (via Supabase SDK download),
  // we can directly read the iframe's URL hash which Chrome's PDF viewer updates
  // to reflect the current page (e.g., blob:...#page=7).
  useEffect(() => {
    if (!isPdfViewerOpen || !pdfPreviewUrl) return;
    if (!pdfPreviewUrl.startsWith("blob:")) return; // Only works for same-origin blobs

    const timer = window.setInterval(() => {
      try {
        const frame = pdfIframeRef.current;
        if (!frame?.contentWindow) return;
        const href = frame.contentWindow.location.href || "";
        const match = href.match(/[#?&]page=(\d+)/i);
        if (!match) return;
        const next = Math.max(1, Math.min(pdfPageCap, Number(match[1]) || 1));
        setPdfViewerPage((prev) => (next !== prev ? next : prev));
      } catch {
        // Same-origin access failure — silently ignore
      }
    }, 600);

    return () => window.clearInterval(timer);
  }, [isPdfViewerOpen, pdfPreviewUrl, pdfPageCap]);

  // Synchronize the iframe src when the state page changes (from controls/shortcuts)
  // Note: We are removing the explicit src update here and relying on the React key
  // to force a reload of the iframe, as many native PDF viewers ignore hash changes.


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
    // Sync preview source when moving to Generation tab
    if (activeStep === 2 && selectedSourceId && activePreviewSourceId !== selectedSourceId) {
      setActivePreviewSourceId(selectedSourceId);
      loadPreviewChunks(selectedSourceId);
    }
  }, [activeStep, selectedSourceId, activePreviewSourceId]);

  const worksheetLocked = subscriptionSummary ? !subscriptionSummary.canGenerateWorksheets : false;
  const lessonPlanLocked = subscriptionSummary ? !subscriptionSummary.canGenerateLessonPlans : false;
  const pipelineBlocked = subscriptionSummary ? !subscriptionSummary.isActive : false;
  const artifactLocked =
    (artifact === "worksheet" && worksheetLocked) ||
    (artifact === "lesson_plan" && lessonPlanLocked);

  useEffect(() => {
    if (artifact === "worksheet" && worksheetLocked) {
      setArtifact("question");
      return;
    }
    if (artifact === "lesson_plan" && lessonPlanLocked) {
      setArtifact("question");
    }
  }, [artifact, worksheetLocked, lessonPlanLocked]);

  const jobsById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const contextCandidates = useMemo(
    () =>
      candidates.filter((candidate) => {
        const job = jobsById.get(candidate.job_id);
        if (!job) return false;
        if (chapterId && job.chapter_id !== chapterId) return false;
        if (topicId && (job.topic_id || "") !== topicId) return false;
        return true;
      }),
    [candidates, jobsById, chapterId, topicId],
  );
  const contextCandidateIds = useMemo(
    () => contextCandidates.map((candidate) => candidate.id),
    [contextCandidates],
  );
  const allContextSelected =
    contextCandidateIds.length > 0 && contextCandidateIds.every((id) => selectedCandidateIds.includes(id));

  const totalChunkCount = useMemo(
    () => Object.values(chunkCountBySource).reduce((total, countValue) => total + countValue, 0),
    [chunkCountBySource],
  );
  const queuedJobsCount = useMemo(
    () => jobs.filter((job) => job.status === "queued").length,
    [jobs],
  );
  const completedJobsCount = useMemo(
    () => jobs.filter((job) => job.status === "completed" || job.status === "failed").length,
    [jobs],
  );
  const hasUploadedSources = sources.length > 0;
  const hasReadySources = sources.some((source) => source.status === "ready");
  const hasIngestedContent = totalChunkCount > 0;
  const readySourceCount = useMemo(
    () => sources.filter((source) => source.status === "ready").length,
    [sources],
  );
  const ingestedSourceCount = useMemo(
    () => sources.filter((source) => (chunkCountBySource[source.id] || 0) > 0).length,
    [sources, chunkCountBySource],
  );
  const readyIngestedSources = useMemo(
    () =>
      sources.filter((source) => {
        const chunkCount = chunkCountBySource[source.id] || 0;
        return source.status === "ready" || chunkCount > 0;
      }),
    [sources, chunkCountBySource],
  );

  function isPdfSource(source: { file_path?: string; title?: string } | null) {
    if (!source) return false;
    const path = String(source.file_path || "").toLowerCase();
    const title = String(source.title || "").toLowerCase();
    return path.endsWith(".pdf") || title.endsWith(".pdf");
  }

  function isLocalSource(source: { file_path?: string } | null) {
    if (!source) return false;
    return String(source.file_path || "").trim().startsWith("local/");
  }

  function attachLocalPreviewFile(sourceId: string, file: File | null) {
    if (!sourceId || !file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast("error", "Please choose a PDF file for preview.");
      return;
    }
    setLocalPdfPreviewUrls((prev) => {
      const existing = prev[sourceId];
      if (existing) {
        try {
          URL.revokeObjectURL(existing);
        } catch {
          // ignore revoke errors
        }
      }
      return {
        ...prev,
        [sourceId]: URL.createObjectURL(file),
      };
    });
    setPdfPreviewError("");
    setPdfViewerPage(1);
    setRangeStatusHint("Local preview attached. You can now set start/end pages.");
    toast("success", "Local PDF attached for preview.");
  }

  function rangePageCount(startPage: number, endPage: number) {
    const safeStart = Math.max(1, startPage);
    const safeEnd = Math.max(safeStart, endPage);
    return safeEnd - safeStart + 1;
  }

  function applyStartFromViewer() {
    const page = Math.max(1, Math.min(pdfPageCap, pdfViewerPage || 1));
    const nextStart = page;
    const nextEnd = Math.max(contextEndPage, nextStart);
    setContextStartPage(nextStart);
    setContextEndPage(nextEnd);
    const pages = rangePageCount(nextStart, nextEnd);
    const hint = `Start set to page ${nextStart}. Range: ${nextStart}-${nextEnd} (${pages} page${pages === 1 ? "" : "s"}).`;
    setRangeStatusHint(hint);
    toast("success", hint);
  }

  function applyEndFromViewer() {
    const page = Math.max(1, Math.min(pdfPageCap, pdfViewerPage || 1));
    const nextEnd = Math.max(contextStartPage, page);
    setContextEndPage(nextEnd);
    const pages = rangePageCount(contextStartPage, nextEnd);
    const hint = `End set to page ${nextEnd}. Range: ${contextStartPage}-${nextEnd} (${pages} page${pages === 1 ? "" : "s"}).`;
    setRangeStatusHint(hint);
    toast("success", hint);
  }

  async function resolvePdfPreviewUrl(source: { id: string; file_path?: string } | null) {
    if (!source || !source.id) return "";
    const filePath = String(source.file_path || "").trim();
    if (!filePath) return "";

    // 1. Local preview (recently uploaded — already a blob URL)
    if (filePath.startsWith("local/")) {
      const localUrl = localPdfPreviewUrls[source.id];
      if (localUrl) return localUrl;
      // Do NOT fall through to Supabase for local/ paths
      return ""; 
    }

    // 2. Return cached blob URL from this session
    if (pdfBlobUrlsRef.current[source.id]) {
      return pdfBlobUrlsRef.current[source.id];
    }

    // 3. For Supabase storage paths: download via SDK client (authenticated, avoids CORS)
    if (!filePath.startsWith("http") && canUseSupabase() && supabase) {
      const slashIdx = filePath.indexOf("/");
      if (slashIdx > 0 && slashIdx < filePath.length - 1) {
        const bucket = filePath.slice(0, slashIdx);
        const objectPath = filePath.slice(slashIdx + 1);
        try {
          const { data, error } = await supabase.storage.from(bucket).download(objectPath);
          if (error) {
            console.error("[PDF Preview] SDK download failed:", error.message);
            // Fall through to signed URL
          } else if (data) {
            const blobUrl = URL.createObjectURL(data);
            pdfBlobUrlsRef.current[source.id] = blobUrl;
            return blobUrl;
          }
        } catch (err) {
          console.error("[PDF Preview] SDK download exception:", err);
        }
      }
    }

    // 4. Fallback: use a signed URL (external http path, or if SDK download failed)
    let remoteUrl = "";
    if (/^https?:\/\//i.test(filePath)) {
      remoteUrl = filePath;
    } else if (canUseSupabase() && supabase) {
      const slashIdx = filePath.indexOf("/");
      if (slashIdx > 0 && slashIdx < filePath.length - 1) {
        const bucket = filePath.slice(0, slashIdx);
        const objectPath = filePath.slice(slashIdx + 1);
        try {
          const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 60 * 60);
          if (error) throw new Error(error.message || "Could not create signed URL");
          remoteUrl = data?.signedUrl || "";
        } catch (err) {
          console.error("[PDF Preview] Signed URL failure:", err);
        }
      }
    }

    if (!remoteUrl) return "";
    pdfBlobUrlsRef.current[source.id] = remoteUrl;
    return remoteUrl;
  }

  function candidatePayload(candidate: GenerationCandidate) {
    return (candidate.payload && typeof candidate.payload === "object" ? candidate.payload : {}) as Record<string, unknown>;
  }

  function candidateSummary(candidate: GenerationCandidate) {
    const payload = candidatePayload(candidate);
    if (candidate.artifact === "question") {
      return String(payload.question_text || payload.questionText || "").trim() || "Question text not available";
    }
    if (candidate.artifact === "worksheet") {
      const title = String(payload.title || "Worksheet").trim();
      const items = Array.isArray(payload.items) ? payload.items.length : 0;
      return `${title} (${items} item${items === 1 ? "" : "s"})`;
    }
    const title = String(payload.title || "Lesson Plan").trim();
    const blocks = Array.isArray(payload.blocks) ? payload.blocks.length : 0;
    return `${title} (${blocks} block${blocks === 1 ? "" : "s"})`;
  }

  function questionOptions(payload: Record<string, unknown>) {
    const fromArray = Array.isArray(payload.options)
      ? payload.options.map((row) => String(row || "").trim()).filter(Boolean)
      : [];
    if (fromArray.length) return fromArray;
    return [payload.option_a, payload.option_b, payload.option_c, payload.option_d]
      .map((row) => String(row || "").trim())
      .filter(Boolean);
  }

  async function extractLocalSourceText(file: File) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf")) {
      return extractPdfText(file, 220000, {
        ocrPages: 6,
        ocrLang: "eng+urd",
        includePageMarkers: true,
      });
    }
    if (name.endsWith(".txt") || name.endsWith(".md")) {
      return (await file.text()).trim();
    }
    throw new Error("Local mode supports PDF/TXT/MD for ingestion. Convert DOC/DOCX to PDF first.");
  }

  async function loadPreviewChunks(sourceId: string) {
    if (!sourceId) {
      setPreviewChunks([]);
      return;
    }
    const rows = await getContentChunksBySource(sourceId);
    setPreviewChunks(rows.slice(0, 8));
  }

  async function openPdfViewerForSource(sourceId: string) {
    if (!sourceId) return;
    setActivePreviewSourceId(sourceId);
    await loadPreviewChunks(sourceId);
    setPdfViewerPage(1);
    setIsPdfViewerOpen(true);
  }

  async function loadData() {
    if (!profile?.school_id || !chapterId) {
      setSources([]);
      setChunkCountBySource({});
      setActivePreviewSourceId("");
      setSelectedSourceId("");
      setPreviewChunks([]);
      setJobs([]);
      setCandidates([]);
      return;
    }
    setLoadingData(true);
    try {
      const [sourceRows, jobRows] = await Promise.all([
        getContentSources(profile.school_id, {
          chapter_id: chapterId,
          topic_id: topicId || undefined,
        }),
        getGenerationJobs(profile.school_id, {
          chapter_id: chapterId,
          topic_id: topicId || undefined,
        }),
      ]);
      const scopedJobIds = jobRows.map((job) => job.id);
      const [candidateRows, countMap] = await Promise.all([
        scopedJobIds.length
          ? getGenerationCandidates(profile.school_id, { job_ids: scopedJobIds })
          : Promise.resolve([] as GenerationCandidate[]),
        sourceRows.length
          ? getContentChunkCountsBySources(sourceRows.map((source) => source.id))
          : Promise.resolve({} as Record<string, number>),
      ]);
      const persistedSelection = readPersistedSourceSelection();
      setSources(sourceRows);
      setChunkCountBySource(countMap);

      const validSelectedId =
        (selectedSourceId && sourceRows.some((source) => source.id === selectedSourceId) && selectedSourceId) ||
        (persistedSelection.selectedSourceId &&
          sourceRows.some((source) => source.id === persistedSelection.selectedSourceId) &&
          persistedSelection.selectedSourceId) ||
        "";
      setSelectedSourceId(validSelectedId);

      const previewSourceId =
        (activePreviewSourceId && sourceRows.some((source) => source.id === activePreviewSourceId) && activePreviewSourceId)
        || (persistedSelection.activePreviewSourceId &&
          sourceRows.some((source) => source.id === persistedSelection.activePreviewSourceId) &&
          persistedSelection.activePreviewSourceId)
        || validSelectedId
        || sourceRows.find((source) => (countMap[source.id] || 0) > 0)?.id
        || sourceRows[0]?.id
        || "";
      setActivePreviewSourceId(previewSourceId);
      if (previewSourceId) {
        const preview = await getContentChunksBySource(previewSourceId);
        setPreviewChunks(preview.slice(0, 8));
      } else {
        setPreviewChunks([]);
      }

      setJobs(jobRows);
      setCandidates(candidateRows);
      setSelectedCandidateIds((prev) => prev.filter((id) => candidateRows.some((row) => row.id === id)));
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to load pipeline data");
    } finally {
      setLoadingData(false);
    }
  }

  async function refreshSourcesOnly() {
    if (!profile?.school_id || !chapterId) return;
    try {
      const sourceRows = await getContentSources(profile.school_id, {
        chapter_id: chapterId,
        topic_id: topicId || undefined,
      });
      const countMap = sourceRows.length
        ? await getContentChunkCountsBySources(sourceRows.map((source) => source.id))
        : {};
      setSources(sourceRows);
      setChunkCountBySource(countMap);
      setSelectedSourceId((prev) => (sourceRows.some((source) => source.id === prev) ? prev : ""));
      setActivePreviewSourceId((prev) => {
        if (sourceRows.some((source) => source.id === prev)) return prev;
        return sourceRows.find((source) => (countMap[source.id] || 0) > 0)?.id || sourceRows[0]?.id || "";
      });
    } catch (error) {
      console.error("Failed to refresh sources:", error);
    }
  }

  async function loadLibrary() {
    if (!profile?.school_id) return;
    setLoadingLibrary(true);
    try {
      const [allSources, allClasses] = await Promise.all([
        getContentSources(profile.school_id, {}),
        getClasses(profile.school_id),
      ]);
      setAllSchoolSources(allSources);
      setAllSchoolClasses(allClasses);

      const classIds = allClasses.map((c: any) => c.id);
      let allSubjects: any[] = [];
      if (classIds.length > 0) {
        allSubjects = await getSubjects(classIds);
      }
      setAllSchoolSubjects(allSubjects);

      const subjectIds = allSubjects.map((s: any) => s.id);
      let allChapters: any[] = [];
      if (subjectIds.length > 0) {
        allChapters = await getChapters(subjectIds);
      }
      setAllSchoolChapters(allChapters);
    } catch (error) {
      console.error("Failed to load school library:", error);
    } finally {
      setLoadingLibrary(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [profile?.school_id, chapterId, topicId]);

  useEffect(() => {
    if (!profile?.school_id || !chapterId) return;
    const shouldPoll = ingestingAll || sources.some((source) => source.status === "processing");
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      void refreshSourcesOnly();
    }, 4500);
    return () => window.clearInterval(timer);
  }, [profile?.school_id, chapterId, topicId, sources, ingestingAll]);

  useEffect(() => {
    loadLibrary();
  }, [profile?.school_id, sources.length]); // Re-load when sources list changes

  async function onUseSource(source: ContentSource) {
    if (!source.exam_body_id || !source.class_id || !source.subject_id || !source.chapter_id) {
      toast("error", "Source is missing required hierarchy info");
      return;
    }
    // Update the global context filters
    setExamBodyId(source.exam_body_id);
    setClassId(source.class_id);
    setSubjectId(source.subject_id);
    setChapterId(source.chapter_id);
    if (source.topic_id) setTopicId(source.topic_id);
    
    // Select the source for generation
    setSelectedSourceId(source.id);
    setActivePreviewSourceId(source.id);
    await loadPreviewChunks(source.id);
    
    // Switch to Generation tab (Step 3 now)
    setActiveStep(3);
    toast("success", `Pre-selected source: ${source.title}`);
  }

  async function pushSourceToCloud(source: ContentSource, file: File) {
    if (!supabase || !profile) return;
    setUploadingToCloud(prev => ({ ...prev, [source.id]: true }));
    try {
      const bucket = "content-sources";
      const path = `${source.school_id}/${source.exam_body_id}/${source.class_id}/${source.subject_id}/${source.chapter_id}/${Date.now()}-${sanitizeName(file.name)}`;
      
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file);
      if (uploadError) throw uploadError;

      const filePath = `${bucket}/${path}`;
      const updated = await updateContentSourceFilePath(source.id, filePath);
      
      setSources(prev => prev.map(s => s.id === source.id ? updated : s));
      toast("success", "Source synced to cloud successfully!");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Cloud sync failed");
    } finally {
      setUploadingToCloud(prev => ({ ...prev, [source.id]: false }));
    }
  }

  async function onUploadSource(event: FormEvent) {
    event.preventDefault();
    if (!profile?.school_id) return;
    if (!examBodyId || !classId || !subjectId || !chapterId) {
      toast("error", "Select exam body, class, subject, and chapter first");
      return;
    }
    if (!sourceFile) {
      toast("error", "Select a file first");
      return;
    }

    setUploadingSource(true);
    let localPdfObjectUrl = "";
    let localPdfAssigned = false;
    let uploadedBucket = "";
    let uploadedObjectPath = "";

    try {
      const sourceFileName = sourceFile.name.toLowerCase();
      const fileHash = await sha256Hex(sourceFile);
      const title = sourceTitle.trim() || sourceFile.name.replace(/\.[^.]+$/, "");
      let filePath = `local/${Date.now()}-${sanitizeName(sourceFile.name)}`;
      const usingSupabase = canUseSupabase() && !!supabase;
      
      localPdfObjectUrl =
        sourceFileName.endsWith(".pdf")
          ? URL.createObjectURL(sourceFile)
          : "";

      // For local or cloud, we always cache the text if we can before upload
      // This ensures immediate ingestion is possible without re-downloading
      try {
        const extracted = await extractPdfText(sourceFile, 250000, { includePageMarkers: true });
        if (extracted && extracted.trim().length > 80) {
          cacheSourceText(fileHash, extracted);
        }
      } catch (e) {
        console.warn("Pre-extraction / Caching failed, will retry during ingestion:", e);
      }

      if (usingSupabase && supabase) {
        const bucket = "content-sources";
        const path = `${profile.school_id}/${examBodyId}/${classId}/${subjectId}/${chapterId}/${Date.now()}-${sanitizeName(sourceFile.name)}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, sourceFile, { upsert: false });
        if (uploadError) throw new Error(uploadError.message || "Storage upload failed");
        
        uploadedBucket = bucket;
        uploadedObjectPath = path;
        filePath = `${bucket}/${path}`;
      }

      const createdSource = await addContentSource({
        school_id: profile.school_id,
        exam_body_id: examBodyId,
        class_id: classId,
        subject_id: subjectId,
        chapter_id: chapterId,
        topic_id: topicId || null,
        title,
        file_path: filePath,
        file_hash: fileHash,
        created_by: profile.id,
      });

      if (localPdfObjectUrl) {
        setLocalPdfPreviewUrls((prev) => ({
          ...prev,
          [createdSource.id]: localPdfObjectUrl,
        }));
        localPdfAssigned = true;
      }

      setSelectedSourceId(createdSource.id);
      if (sourceFileName.endsWith(".pdf")) {
        setSources((prev) => [createdSource, ...prev.filter((r) => r.id !== createdSource.id)]);
        setChunkCountBySource((prev) => ({ ...prev, [createdSource.id]: 0 }));
        setActivePreviewSourceId(createdSource.id);
        setPreviewChunks([]);
        setPdfViewerPage(1);
        setIsPdfViewerOpen(true);
      }

      toast("success", "Source uploaded successfully");
      setSourceFile(null);
      setSourceTitle("");
      await loadData();
    } catch (error) {
      // CLEANUP: If we uploaded a file but the DB save failed, delete the file
      if (uploadedBucket && uploadedObjectPath && supabase) {
        try {
          await supabase.storage.from(uploadedBucket).remove([uploadedObjectPath]);
        } catch (cleanupErr) {
          console.error("Failed to cleanup orphaned file:", cleanupErr);
        }
      }

      if (localPdfObjectUrl && !localPdfAssigned) {
        URL.revokeObjectURL(localPdfObjectUrl);
      }
      toast("error", error instanceof Error ? error.message : "Source upload failed");
    } finally {
      setUploadingSource(false);
    }
  }

  async function onDeleteSource(sourceId: string) {
    if (!confirm("Are you sure you want to permanently delete this source and all its data?")) return;
    try {
      await deleteContentSource(sourceId);
      toast("success", "Source deleted successfully");
      if (activePreviewSourceId === sourceId) {
        setActivePreviewSourceId("");
        setPreviewChunks([]);
      }
      if (selectedSourceId === sourceId) setSelectedSourceId("");
      await loadData();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to delete source");
    }
  }

  async function ingestSourceById(sourceId: string, options?: { silent?: boolean }) {
    setIngestingSourceId(sourceId);
    setSources((prev) =>
      prev.map((source) =>
        source.id === sourceId ? { ...source, status: "processing", error_message: null } : source,
      ),
    );
    try {
      const result = await invokeIngestSource(sourceId);
      setSources((prev) =>
        prev.map((source) =>
          source.id === sourceId
            ? {
              ...source,
              status: "ready",
              error_message: null,
            }
            : source,
        ),
      );
      setChunkCountBySource((prev) => ({ ...prev, [sourceId]: result.chunk_count }));
      if (activePreviewSourceId === sourceId) {
        await loadPreviewChunks(sourceId);
      }
      if (!options?.silent) {
        toast("success", `Ingestion complete (${result.chunk_count} chunks)`);
      }
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ingestion failed";
      setSources((prev) =>
        prev.map((source) =>
          source.id === sourceId
            ? {
              ...source,
              status: "failed",
              error_message: message,
            }
            : source,
        ),
      );
      if (!options?.silent) {
        toast("error", message);
      }
      return { ok: false as const, error: message };
    } finally {
      setIngestingSourceId("");
    }
  }

  async function onIngestSource(sourceId: string) {
    await ingestSourceById(sourceId);
  }

  async function onIngestAll() {
    const pending = sources.filter((source) => source.status !== "ready");
    if (!pending.length) {
      toast("success", "All sources are already ingested.");
      return;
    }
    setIngestingAll(true);
    let completed = 0;
    let failed = 0;
    for (const source of pending) {
      const result = await ingestSourceById(source.id, { silent: true });
      if (result.ok) {
        completed += 1;
      } else {
        failed += 1;
      }
    }
    setIngestingAll(false);
    if (failed > 0) {
      toast("error", `Ingest all finished. Completed: ${completed}, Failed: ${failed}.`);
    } else {
      toast("success", `Ingest all finished. Completed: ${completed}.`);
    }
    await refreshSourcesOnly();
  }

  async function onQueueJob() {
    if (!profile?.school_id) return;
    if (!examBodyId || !classId || !subjectId || !chapterId) {
      toast("error", "Select exam body, class, subject, and chapter first");
      return;
    }
    if (!hasIngestedContent) {
      toast("error", "No ingested content available. Upload a source and run ingest first.");
      return;
    }
    if (selectedSourceId && (chunkCountBySource[selectedSourceId] || 0) === 0) {
      toast("error", "Selected source is not ingested yet. Click Ingest for that source first.");
      return;
    }
    try {
      const summary = await assertCanGenerateArtifact(profile.school_id, artifact);
      setSubscriptionSummary(summary);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Artifact generation blocked by subscription.");
      return;
    }
    setQueueingJob(true);
    try {
      const requestJson =
        artifact === "question"
          ? {
            count,
            source_id: selectedSourceId || null,
            context_page_start: contextStartPage,
            context_page_end: contextEndPage,
            context_pages: Math.max(1, contextEndPage - contextStartPage + 1),
            question_type: questionType,
            difficulty,
            bloom_level: bloom,
            instructions: instructions.trim(),
          }
          : artifact === "worksheet"
            ? {
              count,
              source_id: selectedSourceId || null,
              context_page_start: contextStartPage,
              context_page_end: contextEndPage,
              context_pages: Math.max(1, contextEndPage - contextStartPage + 1),
              title: `Worksheet ${new Date().toLocaleDateString()}`,
              difficulty,
              bloom_level: bloom,
              instructions: instructions.trim(),
            }
            : {
              source_id: selectedSourceId || null,
              context_page_start: contextStartPage,
              context_page_end: contextEndPage,
              context_pages: Math.max(1, contextEndPage - contextStartPage + 1),
              duration_minutes: 40,
              title: `Lesson Plan ${new Date().toLocaleDateString()}`,
              instructions: instructions.trim(),
            };

      const queuedJob = await queueGenerationJob({
        school_id: profile.school_id,
        exam_body_id: examBodyId,
        class_id: classId,
        subject_id: subjectId,
        chapter_id: chapterId,
        topic_id: topicId || null,
        artifact,
        request_json: requestJson,
        created_by: profile.id,
      });
      setJobs((prev) => [queuedJob, ...prev.filter((job) => job.id !== queuedJob.id)]);
      toast("success", "Generation job queued");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to queue job");
    } finally {
      setQueueingJob(false);
    }
  }

  async function onRunJobs() {
    if (!hasIngestedContent) {
      toast("error", "No ingested content available. Upload and ingest chapter/topic source first.");
      return;
    }
    if (queuedJobsCount <= 0) {
      toast("error", "No queued jobs in this context. Click Queue Job first.");
      return;
    }
    setRunningJobs(true);
    try {
      const result = await invokeRunGenerationJobs({
        chapter_id: chapterId || undefined,
        topic_id: topicId || undefined,
        limit: 20,
      });
      if (result.processed <= 0) {
        toast("error", "No queued jobs were processed. Queue at least one job first.");
        return;
      }
      if (result.failed > 0) {
        const failedDetails = result.details.filter((detail) => detail.status === "failed");
        const firstError = failedDetails[0]?.error || "Unknown generation error.";
        if (result.completed > 0) {
          toast(
            "success",
            `Jobs processed: ${result.processed}. Completed: ${result.completed}, failed: ${result.failed}. Candidates created: ${result.candidates_created}.`
          );
          toast("error", `Some jobs failed. First error: ${firstError}`);
        } else {
          toast("error", `All queued jobs failed. First error: ${firstError}`);
        }
      } else {
        toast(
          "success",
          `Jobs processed: ${result.processed}. Completed: ${result.completed}, failed: ${result.failed}. Candidates created: ${result.candidates_created}.`
        );
      }
      await loadData();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to run jobs");
    } finally {
      setRunningJobs(false);
    }
  }

  async function onReviewCandidate(candidateId: string, action: "approve" | "reject") {
    if (!profile) return;
    try {
      const updated = await reviewGenerationCandidate(candidateId, action, profile.id);
      setCandidates((prev) =>
        prev.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      toast("success", action === "approve" ? "Candidate approved" : "Candidate rejected");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Review failed");
    }
  }

  async function onPublishSelected() {
    const ids = selectedCandidateIds.filter((id) => {
      const row = contextCandidates.find((candidate) => candidate.id === id);
      return row?.status === "approved";
    });
    if (!ids.length) {
      toast("error", "Select approved candidates to publish");
      return;
    }
    setPublishing(true);
    try {
      const result = await invokePublishCandidates(ids);
      const publishedIds = new Set(
        result.details
          .filter((detail) => detail.status === "published")
          .map((detail) => detail.candidate_id),
      );
      if (publishedIds.size > 0) {
        setCandidates((prev) =>
          prev.map((candidate) =>
            publishedIds.has(candidate.id) ? { ...candidate, status: "published" } : candidate,
          ),
        );
      }
      toast("success", `Published ${result.published} candidate(s)`);
      setSelectedCandidateIds((prev) => prev.filter((id) => !publishedIds.has(id)));
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to publish candidates");
    } finally {
      setPublishing(false);
    }
  }

  function toggleSelectAllContextCandidates(checked: boolean) {
    setSelectedCandidateIds((prev) => {
      const set = new Set(prev);
      if (checked) {
        contextCandidateIds.forEach((id) => set.add(id));
      } else {
        contextCandidateIds.forEach((id) => set.delete(id));
      }
      return Array.from(set);
    });
  }

  async function onDeleteCandidates(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)));
    if (!uniqueIds.length) return;
    setDeletingCandidates(true);
    try {
      const deleted = await deleteGenerationCandidates(uniqueIds);
      if (expandedCandidateId && uniqueIds.includes(expandedCandidateId)) {
        setExpandedCandidateId("");
      }
      toast("success", `Deleted ${deleted} candidate(s)`);
      setCandidates((prev) => prev.filter((candidate) => !uniqueIds.includes(candidate.id)));
      setSelectedCandidateIds((prev) => prev.filter((id) => !uniqueIds.includes(id)));
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to delete candidates");
    } finally {
      setDeletingCandidates(false);
    }
  }

  async function onDeleteSelected() {
    const ids = selectedCandidateIds.filter((id) => contextCandidateIds.includes(id));
    if (!ids.length) {
      toast("error", "Select candidate(s) to delete");
      return;
    }
    await onDeleteCandidates(ids);
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header & Plan Status */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-black text-slate-900 dark:text-white tracking-tight">
            Content <span className="text-brand">Pipeline</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Produce premium learning materials with AI-assisted workflows.
          </p>
        </div>
        
        {subscriptionSummary && (
          <div className="flex items-center gap-2 p-1.5 pl-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="flex flex-col -space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Plan</span>
              <span className="text-xs font-black text-slate-900 dark:text-white">{subscriptionSummary.plan.name}</span>
            </div>
            <div className={`h-8 w-[1px] bg-slate-100 dark:bg-slate-800 mx-1`} />
            <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${subscriptionSummary.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-rose-100 text-rose-700"}`}>
              {subscriptionSummary.isActive ? "Active" : "Inactive"}
            </span>
          </div>
        )}
      </div>

      {/* Global Context Selector - Always Visible */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
           <div className="p-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900">
             <Layers size={16} />
           </div>
           <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Pipeline Context</h2>
        </div>
        
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
           {[
             { label: 'Exam Body', value: examBodyId, options: examBodies, setter: setExamBodyId, merge: (v: string) => ({ examBodyId: v || undefined, classId: undefined, subjectId: undefined, chapterId: undefined }) },
             { label: 'Class', value: classId, options: classes, setter: setClassId, disabled: !examBodyId, merge: (v: string) => ({ examBodyId: examBodyId || undefined, classId: v || undefined, subjectId: undefined, chapterId: undefined }) },
             { label: 'Subject', value: subjectId, options: subjects, setter: setSubjectId, disabled: !classId, merge: (v: string) => ({ examBodyId: examBodyId || undefined, classId: classId || undefined, subjectId: v || undefined, chapterId: undefined }) },
             { label: 'Chapter', value: chapterId, options: chapters, setter: setChapterId, disabled: !subjectId, merge: (v: string) => ({ examBodyId: examBodyId || undefined, classId: classId || undefined, subjectId: subjectId || undefined, chapterId: v || undefined }) },
             { label: 'Topic', value: topicId, options: topics, setter: setTopicId, disabled: !chapterId, isTopic: true }
           ].map((item, idx) => (
             <div key={idx} className="space-y-1">
               <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">{item.label}</span>
               <select
                 className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-brand/20 transition-all outline-none ${
                   item.disabled 
                     ? "bg-slate-50 dark:bg-slate-800/5 col-span-1 border-slate-100 dark:border-slate-800 text-slate-400 cursor-not-allowed" 
                     : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                 }`}
                 value={item.value}
                 disabled={item.disabled}
                 onChange={(e) => {
                   const val = e.target.value;
                   if (item.isTopic) {
                     setTopicId(val);
                   } else {
                     item.setter!(val);
                     setTopicId("");
                     mergeScope(item.merge!(val));
                   }
                 }}
               >
                 <option value="">Select {item.label}</option>
                 {item.options.map((opt: any) => (
                   <option key={opt.id} value={opt.id}>
                     {item.label === 'Chapter' ? `${opt.chapter_number}. ${opt.title}` : 
                      item.label === 'Topic' ? `${opt.topic_number}. ${opt.title}` : opt.name}
                   </option>
                 ))}
               </select>
             </div>
           ))}
        </div>
      </div>

      {/* Stepped Navigation */}
      <div className="flex items-center justify-center py-4">
        <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
           {[
             { id: 1, label: 'Library', icon: Library },
             { id: 2, label: 'Sources', icon: Layers },
             { id: 3, label: 'Generation', icon: Zap },
             { id: 4, label: 'Review', icon: CheckSquare }
           ].map((step, idx) => (
             <Fragment key={step.id}>
               <button
                 type="button"
                 onClick={() => setActiveStep(step.id)}
                 className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                   activeStep === step.id 
                     ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm scale-[1.05]" 
                     : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                 }`}
               >
                 <step.icon size={14} className={activeStep === step.id ? "text-brand" : ""} />
                 {step.label}
               </button>
               {idx < 3 && <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-1" />}
             </Fragment>
           ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {activeStep === 1 && (
          <ResourceLibrary 
            examBodies={examBodies}
            classes={allSchoolClasses}
            subjects={allSchoolSubjects}
            chapters={allSchoolChapters}
            sources={allSchoolSources}
            onUseSource={onUseSource}
            onDeleteSource={onDeleteSource}
            loading={loadingLibrary}
          />
        )}

        {activeStep === 2 && (
          <SourceManager 
            sources={sources}
            chunkCountBySource={chunkCountBySource}
            activePreviewSourceId={activePreviewSourceId}
            setActivePreviewSourceId={setActivePreviewSourceId}
            loadPreviewChunks={loadPreviewChunks}
            openPdfViewerForSource={openPdfViewerForSource}
            onUploadSource={onUploadSource}
            onIngestSource={onIngestSource}
            sourceTitle={sourceTitle}
            setSourceTitle={setSourceTitle}
            sourceFile={sourceFile}
            setSourceFile={setSourceFile}
            uploadingSource={uploadingSource}
            ingestingSourceId={ingestingSourceId}
            chapterId={chapterId}
            hasUploadedSources={hasUploadedSources}
            hasReadySources={hasReadySources}
            readySourceCount={readySourceCount}
            totalChunkCount={totalChunkCount}
            ingestedSourceCount={ingestedSourceCount}
            isPdfSource={isPdfSource}
            canUseSupabase={canUseSupabase()}
            pushSourceToCloud={pushSourceToCloud}
            uploadingToCloud={uploadingToCloud}
            onDeleteSource={onDeleteSource}
            onIngestAll={onIngestAll}
            ingestingAll={ingestingAll}
          />
        )}

        {activeStep === 2 && (
          <JobQueue 
            artifact={artifact}
            setArtifact={setArtifact}
            count={count}
            setCount={setCount}
            selectedSourceId={selectedSourceId}
            setSelectedSourceId={(id) => {
              setSelectedSourceId(id);
              if (id) {
                setActivePreviewSourceId(id);
                loadPreviewChunks(id);
              }
            }}
            contextStartPage={contextStartPage}
            setContextStartPage={setContextStartPage}
            contextEndPage={contextEndPage}
            setContextEndPage={setContextEndPage}
            questionType={questionType}
            setQuestionType={setQuestionType}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            bloom={bloom}
            setBloom={setBloom}
            instructions={instructions}
            setInstructions={setInstructions}
            queueingJob={queueingJob}
            onQueueJob={onQueueJob}
            runningJobs={runningJobs}
            onRunJobs={onRunJobs}
            pipelineBlocked={pipelineBlocked}
            artifactLocked={artifactLocked}
            hasIngestedContent={hasIngestedContent}
            queuedJobsCount={queuedJobsCount}
            completedJobsCount={completedJobsCount}
            readyIngestedSources={readyIngestedSources}
            chunkCountBySource={chunkCountBySource}
            activePreviewSourceId={activePreviewSourceId}
            setActivePreviewSourceId={setActivePreviewSourceId}
            loadPreviewChunks={loadPreviewChunks}
            activeSource={activeSource}
            isPdfSource={isPdfSource}
            setIsPdfViewerOpen={setIsPdfViewerOpen}
            chapterId={chapterId}
            worksheetLocked={worksheetLocked}
            lessonPlanLocked={lessonPlanLocked}
          />
        )}

        {activeStep === 3 && (
          <CandidateReview 
            candidates={contextCandidates}
            selectedCandidateIds={selectedCandidateIds}
            setSelectedCandidateIds={setSelectedCandidateIds}
            allContextSelected={allContextSelected}
            toggleSelectAllContextCandidates={toggleSelectAllContextCandidates}
            onDeleteSelected={onDeleteSelected}
            onPublishSelected={onPublishSelected}
            onDeleteCandidates={onDeleteCandidates}
            onReviewCandidate={onReviewCandidate}
            expandedCandidateId={expandedCandidateId}
            setExpandedCandidateId={setExpandedCandidateId}
            deletingCandidates={deletingCandidates}
            publishing={publishing}
            candidatePayload={candidatePayload}
            candidateSummary={candidateSummary}
            questionOptions={questionOptions}
          />
        )}
      </div>

      {/* Floating Step Navigation (Mobile/Bottom) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 animate-in slide-in-from-bottom-8">
        <button
          type="button"
          disabled={activeStep === 1}
          onClick={() => setActiveStep(prev => prev - 1)}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-xs font-bold disabled:opacity-30 disabled:translate-y-2 transition-all hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ChevronLeft size={16} />
          Back
        </button>
        
        <button
          type="button"
          disabled={activeStep === 3}
          onClick={() => setActiveStep(prev => prev + 1)}
          className="flex items-center gap-2 px-8 py-3 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl text-xs font-bold disabled:opacity-30 disabled:translate-y-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Continue
          <ChevronRight size={16} />
        </button>
      </div>

      {/* PDF Viewer Modal */}
      {isPdfViewerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="h-[92vh] w-[95vw] max-w-[900px] rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                   <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-slate-900 dark:text-white leading-tight">
                    {activeSource?.title || "PDF Explorer"}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPdfViewerOpen(false)}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Current Page</span>
                      <div className="text-sm font-black text-brand tabular-nums">
                        {pdfViewerPage}
                      </div>
                    </div>
                  </div>

                  <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />

                  <button
                    type="button"
                    onClick={() => {
                      const page = Math.max(1, Math.min(pdfPageCap, pdfViewerPage));
                      setContextStartPage(page);
                      if (contextEndPage < page) setContextEndPage(page);
                      setRangeStatusHint(`Start page set to ${page}`);
                      setTimeout(() => setRangeStatusHint(""), 2000);
                    }}
                    className="px-4 py-2 rounded-xl bg-brand/10 text-brand text-xs font-bold hover:bg-brand hover:text-white transition-all"
                  >
                    Mark as Start
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const page = Math.max(1, Math.min(pdfPageCap, pdfViewerPage));
                      setContextEndPage(Math.max(contextStartPage, page));
                      setRangeStatusHint(`End page set to ${page}`);
                      setTimeout(() => setRangeStatusHint(""), 2000);
                    }}
                    className="px-4 py-2 rounded-xl bg-brand/10 text-brand text-xs font-bold hover:bg-brand hover:text-white transition-all"
                  >
                    Mark as End
                  </button>

                  <div className="ml-auto flex items-center gap-3">
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">Range:</span>
                     <span className="px-3 py-1.5 rounded-lg bg-slate-950 dark:bg-white text-white dark:text-slate-900 text-xs font-black shadow-lg">
                       {contextStartPage} — {contextEndPage}
                     </span>
                  </div>
                </div>

                {rangeStatusHint && (
                  <p className="text-xs font-bold text-emerald-500 animate-in fade-in slide-in-from-left-2">{rangeStatusHint}</p>
                )}

                <div className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950 relative">
                  {pdfPreviewLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
                      <p className="text-sm font-bold text-slate-500">Optimizing PDF for review...</p>
                    </div>
                  )}
                  
                  {!pdfPreviewLoading && pdfPreviewError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center gap-4">
                       <AlertCircle size={48} className="text-rose-500 opacity-20" />
                       <div>
                         <p className="text-sm font-bold text-slate-900 dark:text-white">{pdfPreviewError}</p>
                         <p className="text-xs text-slate-500 mt-1 max-w-xs">
                           {String(activeSource?.file_path || "").startsWith("local/") 
                             ? "This was a local file from a previous session. Re-attach it to preview pages."
                             : "We couldn't load the cloud preview. You can attach the local file manually to continue."}
                         </p>
                       </div>
                        {isLocalSource(activeSource) && (
                          <div className="flex flex-col items-center gap-3">
                            <label className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer hover:scale-[1.02] transition-all">
                              Select File Manually
                              <input
                                type="file" accept=".pdf,application/pdf" className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  if (activePreviewSourceId) attachLocalPreviewFile(activePreviewSourceId, file);
                                  e.currentTarget.value = "";
                                }}
                              />
                            </label>
                            
                            {canUseSupabase() && pdfPreviewUrl && (
                              <button
                                onClick={() => {
                                  // This is a bit tricky since we don't have the File object here
                                  // But we can tell the user to use the SourceManager's new sync button
                                  toast("success", "File re-attached. Use the 'Cloud Sync' button in the Sources tab to make it permanent.");
                                }}
                                className="text-[10px] font-bold text-brand hover:underline"
                              >
                                Want to make this permanent? Sync to cloud.
                              </button>
                            )}
                          </div>
                        )}
                    </div>
                  )}

                  {!pdfPreviewLoading && !pdfPreviewError && pdfPreviewUrl && (
                    <PdfCanvasViewer
                      url={pdfPreviewUrl}
                      onPageChange={setPdfViewerPage}
                    />
                  )}
                </div>
            </div>
          </div>
        </div>
      )}

      {loadingData && (
        <div className="fixed top-24 right-8 z-50 animate-in slide-in-from-right-4">
           <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full shadow-2xl">
              <div className="w-4 h-4 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Syncing Pipeline...</span>
           </div>
        </div>
      )}
    </div>
  );
}
