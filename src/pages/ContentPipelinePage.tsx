import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useHierarchy } from "@/hooks/useHierarchy";
import {
  addContentSource,
  getContentSources,
  getGenerationCandidates,
  getGenerationJobs,
  getSubscriptionSummary,
  getTopics,
  queueGenerationJob,
  assertCanGenerateArtifact,
  reviewGenerationCandidate,
} from "@/services/repositories";
import { hasSupabase, supabase } from "@/services/supabase";
import { invokeIngestSource, invokePublishCandidates, invokeRunGenerationJobs } from "@/services/pipelineRuntime";
import type { ArtifactType, BloomLevel, Difficulty, GenerationCandidate, GenerationJob, QuestionType, TopicEntity } from "@/types/domain";

const questionTypes: QuestionType[] = ["mcq", "true_false", "fill_blanks", "short", "long", "matching", "diagram"];
const difficulties: Difficulty[] = ["easy", "medium", "hard"];
const blooms: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate"];

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function sha256Hex(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

export function ContentPipelinePage() {
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);

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
  } = useHierarchy(profile?.school_id, { autoSelectFirst: false });

  const [topics, setTopics] = useState<TopicEntity[]>([]);
  const [topicId, setTopicId] = useState("");

  const [sources, setSources] = useState<any[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [candidates, setCandidates] = useState<GenerationCandidate[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceTitle, setSourceTitle] = useState("");
  const [uploadingSource, setUploadingSource] = useState(false);
  const [runningJobs, setRunningJobs] = useState(false);
  const [ingestingSourceId, setIngestingSourceId] = useState("");

  const [artifact, setArtifact] = useState<ArtifactType>("question");
  const [count, setCount] = useState(10);
  const [questionType, setQuestionType] = useState<QuestionType>("mcq");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [bloom, setBloom] = useState<BloomLevel>("understand");
  const [instructions, setInstructions] = useState("");
  const [queueingJob, setQueueingJob] = useState(false);

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [subscriptionSummary, setSubscriptionSummary] = useState<Awaited<ReturnType<typeof getSubscriptionSummary>> | null>(null);

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

  async function loadData() {
    if (!profile?.school_id || !chapterId) {
      setSources([]);
      setJobs([]);
      setCandidates([]);
      return;
    }
    setLoadingData(true);
    try {
      const [sourceRows, jobRows, candidateRows] = await Promise.all([
        getContentSources(profile.school_id, {
          chapter_id: chapterId,
          topic_id: topicId || undefined,
        }),
        getGenerationJobs(profile.school_id, {
          chapter_id: chapterId,
          topic_id: topicId || undefined,
        }),
        getGenerationCandidates(profile.school_id, {}),
      ]);
      setSources(sourceRows);
      setJobs(jobRows);
      setCandidates(candidateRows);
      setSelectedCandidateIds((prev) => prev.filter((id) => candidateRows.some((row) => row.id === id)));
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to load pipeline data");
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [profile?.school_id, chapterId, topicId]);

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
    try {
      const fileHash = await sha256Hex(sourceFile);
      const title = sourceTitle.trim() || sourceFile.name.replace(/\.[^.]+$/, "");
      let filePath = `local/${Date.now()}-${sanitizeName(sourceFile.name)}`;

      if (hasSupabase && supabase) {
        const bucket = "content-sources";
        const path = `${profile.school_id}/${examBodyId}/${classId}/${subjectId}/${chapterId}/${Date.now()}-${sanitizeName(sourceFile.name)}`;
        const { error } = await supabase.storage.from(bucket).upload(path, sourceFile, { upsert: false });
        if (error) {
          throw new Error(error.message || "Storage upload failed");
        }
        filePath = `${bucket}/${path}`;
      }

      await addContentSource({
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
      toast("success", "Source uploaded");
      setSourceFile(null);
      setSourceTitle("");
      await loadData();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Source upload failed");
    } finally {
      setUploadingSource(false);
    }
  }

  async function onIngestSource(sourceId: string) {
    setIngestingSourceId(sourceId);
    try {
      const result = await invokeIngestSource(sourceId);
      toast("success", `Ingestion complete (${result.chunk_count} chunks)`);
      await loadData();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Ingestion failed");
    } finally {
      setIngestingSourceId("");
    }
  }

  async function onQueueJob() {
    if (!profile?.school_id) return;
    if (!examBodyId || !classId || !subjectId || !chapterId) {
      toast("error", "Select exam body, class, subject, and chapter first");
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
            question_type: questionType,
            difficulty,
            bloom_level: bloom,
            instructions: instructions.trim(),
          }
          : artifact === "worksheet"
            ? {
              count,
              title: `Worksheet ${new Date().toLocaleDateString()}`,
              difficulty,
              bloom_level: bloom,
              instructions: instructions.trim(),
            }
            : {
              duration_minutes: 40,
              title: `Lesson Plan ${new Date().toLocaleDateString()}`,
              instructions: instructions.trim(),
            };

      await queueGenerationJob({
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
      toast("success", "Generation job queued");
      await loadData();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to queue job");
    } finally {
      setQueueingJob(false);
    }
  }

  async function onRunJobs() {
    setRunningJobs(true);
    try {
      const result = await invokeRunGenerationJobs({
        chapter_id: chapterId || undefined,
        topic_id: topicId || undefined,
        limit: 20,
      });
      toast("success", `Jobs processed: ${result.completed} completed, ${result.failed} failed`);
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
      await reviewGenerationCandidate(candidateId, action, profile.id);
      toast("success", action === "approve" ? "Candidate approved" : "Candidate rejected");
      await loadData();
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
      toast("success", `Published ${result.published} candidate(s)`);
      setSelectedCandidateIds([]);
      await loadData();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to publish candidates");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-slate-100">Content Pipeline</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Upload chapter files, run AI generation jobs, review candidates, and publish into question bank/worksheet/lesson plan modules.
        </p>
        {subscriptionSummary && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-bold ${subscriptionSummary.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
              {subscriptionSummary.isActive ? "Subscription Active" : "Subscription Inactive"}
            </span>
            <span className="rounded-full bg-brand/10 text-brand px-2.5 py-1 font-bold">{subscriptionSummary.plan.name} Plan</span>
            {worksheetLocked && <span className="text-slate-500">Worksheets locked</span>}
            {lessonPlanLocked && <span className="text-slate-500">Lesson plans locked</span>}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">Context</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Exam Body
            <select className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" value={examBodyId} onChange={(e) => setExamBodyId(e.target.value)}>
              <option value="">Select exam body</option>
              {examBodies.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Class
            <select className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Select class</option>
              {classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Subject
            <select className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Select subject</option>
              {subjects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Chapter
            <select className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
              <option value="">Select chapter</option>
              {chapters.map((row) => <option key={row.id} value={row.id}>{row.chapter_number}. {row.title}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Topic (Optional)
            <select className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">All topics</option>
              {topics.map((row) => <option key={row.id} value={row.id}>{row.topic_number}. {row.title}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={onUploadSource} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">1. Upload Source</h2>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Title
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
              value={sourceTitle}
              onChange={(e) => setSourceTitle(e.target.value)}
              placeholder="Chapter 4 Notes"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            File
            <input
              className="mt-1 w-full text-sm"
              type="file"
              accept=".pdf,.txt,.md,.doc,.docx"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setSourceFile(file);
                if (file && !sourceTitle.trim()) {
                  setSourceTitle(file.name.replace(/\.[^.]+$/, ""));
                }
              }}
            />
          </label>
          <button
            type="submit"
            disabled={uploadingSource || !sourceFile}
            className="rounded-lg bg-brand px-4 py-2 text-white font-semibold disabled:opacity-60"
          >
            {uploadingSource ? "Uploading..." : "Upload Source"}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">2. Queue Generation Job</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Artifact
              <select className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" value={artifact} onChange={(e) => setArtifact(e.target.value as ArtifactType)}>
                <option value="question">Question</option>
                <option value="worksheet" disabled={worksheetLocked}>Worksheet{worksheetLocked ? " (Advanced)" : ""}</option>
                <option value="lesson_plan" disabled={lessonPlanLocked}>Lesson Plan{lessonPlanLocked ? " (Advanced)" : ""}</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Count
              <input className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" type="number" min={1} max={100} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} />
            </label>
            {artifact === "question" && (
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Question Type
                <select className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" value={questionType} onChange={(e) => setQuestionType(e.target.value as QuestionType)}>
                  {questionTypes.map((row) => <option key={row} value={row}>{row}</option>)}
                </select>
              </label>
            )}
            {(artifact === "question" || artifact === "worksheet") && (
              <>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Difficulty
                  <select className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                    {difficulties.map((row) => <option key={row} value={row}>{row}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Bloom
                  <select className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2" value={bloom} onChange={(e) => setBloom(e.target.value as BloomLevel)}>
                    {blooms.map((row) => <option key={row} value={row}>{row}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Instructions (Optional)
            <textarea className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 h-20" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={onQueueJob} disabled={pipelineBlocked || artifactLocked || queueingJob || !chapterId} className="rounded-lg bg-brand px-4 py-2 text-white font-semibold disabled:opacity-60">
              {queueingJob ? "Queueing..." : "Queue Job"}
            </button>
            <button type="button" onClick={onRunJobs} disabled={pipelineBlocked || runningJobs || !chapterId} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-60">
              {runningJobs ? "Running..." : "Run Queued Now"}
            </button>
          </div>
          {pipelineBlocked && (
            <p className="text-xs text-rose-600 font-semibold">Subscription inactive. Renew to queue and run jobs.</p>
          )}
          {!pipelineBlocked && artifactLocked && (
            <p className="text-xs text-brand font-semibold">Selected artifact requires Advanced plan.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">3. Sources</h2>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">Title</th>
                <th className="py-2">Version</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2">{source.title}</td>
                  <td className="py-2">v{source.version_no}</td>
                  <td className="py-2 capitalize">{source.status}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onIngestSource(source.id)}
                      disabled={ingestingSourceId === source.id}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold"
                    >
                      {ingestingSourceId === source.id ? "Ingesting..." : "Ingest"}
                    </button>
                  </td>
                </tr>
              ))}
              {!sources.length && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">No sources for selected context.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">4. Candidate Review</h2>
          <button
            type="button"
            onClick={onPublishSelected}
            disabled={publishing || !selectedCandidateIds.length}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {publishing ? "Publishing..." : "Publish Selected"}
          </button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 w-8">#</th>
                <th className="py-2">Artifact</th>
                <th className="py-2">Status</th>
                <th className="py-2">Job</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contextCandidates.map((candidate) => {
                const checked = selectedCandidateIds.includes(candidate.id);
                return (
                  <tr key={candidate.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setSelectedCandidateIds((prev) => (e.target.checked ? [...prev, candidate.id] : prev.filter((id) => id !== candidate.id)))}
                      />
                    </td>
                    <td className="py-2 capitalize">{candidate.artifact.replace("_", " ")}</td>
                    <td className="py-2 capitalize">{candidate.status}</td>
                    <td className="py-2 text-xs text-slate-500">{candidate.job_id.slice(0, 8)}</td>
                    <td className="py-2 text-right space-x-2">
                      {candidate.status === "pending_review" && (
                        <>
                          <button type="button" onClick={() => onReviewCandidate(candidate.id, "approve")} className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Approve</button>
                          <button type="button" onClick={() => onReviewCandidate(candidate.id, "reject")} className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">Reject</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!contextCandidates.length && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">No candidates in current context.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loadingData && <p className="text-xs text-slate-500">Loading pipeline data...</p>}
    </div>
  );
}
