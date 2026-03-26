import { Dispatch, SetStateAction, useState } from "react";
import { Play, Info, Eye, Loader2, Settings2, ChevronDown } from "lucide-react";
import type { ArtifactType, QuestionType, Difficulty, BloomLevel, ContentSource } from "@/types/domain";

const questionTypes: QuestionType[] = ["mcq", "true_false", "fill_blanks", "short", "long", "matching", "diagram"];
const difficulties: Difficulty[] = ["easy", "medium", "hard"];
const blooms: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate"];

type GenerationRunReport = {
  timestamp: string;
  processed: number;
  completed: number;
  failed: number;
  candidatesCreated: number;
  failedJobIds: string[];
  topErrors: Array<{
    message: string;
    count: number;
    hint: string;
    actionKey?: "open_settings" | "retry_failed";
    actionLabel?: string;
  }>;
};

interface JobQueueProps {
  artifact: ArtifactType;
  setArtifact: (a: ArtifactType) => void;
  count: number;
  setCount: (c: number) => void;
  selectedSourceId: string;
  setSelectedSourceId: (id: string) => void;
  contextStartPage: number;
  setContextStartPage: (p: number) => void;
  contextEndPage: number;
  setContextEndPage: (p: number) => void;
  questionType: QuestionType;
  setQuestionType: (t: QuestionType) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  bloom: BloomLevel;
  setBloom: (b: BloomLevel) => void;
  instructions: string;
  setInstructions: (i: string) => void;
  queueingJob: boolean;
  onQueueJob: () => Promise<boolean>;
  runningJobs: boolean;
  onRunJobs: () => Promise<boolean>;
  onQueueAndRunNow: () => Promise<void>;
  onRetryFailedJobs: () => Promise<void>;
  onRunReportAction: (actionKey: "open_settings" | "retry_failed", message: string) => void;
  pipelineBlocked: boolean;
  artifactLocked: boolean;
  hasIngestedContent: boolean;
  queuedJobsCount: number;
  completedJobsCount: number;
  readyIngestedSources: ContentSource[];
  chunkCountBySource: Record<string, number>;
  activePreviewSourceId: string;
  setActivePreviewSourceId: Dispatch<SetStateAction<string>>;
  loadPreviewChunks: (id: string) => Promise<void>;
  activeSource: ContentSource | null;
  isPdfSource: (s: unknown) => boolean;
  setIsPdfViewerOpen: (o: boolean) => void;
  chapterId: string;
  worksheetLocked: boolean;
  lessonPlanLocked: boolean;
  generationRunReport: GenerationRunReport | null;
}

export function JobQueue({
  artifact,
  setArtifact,
  count,
  setCount,
  selectedSourceId,
  setSelectedSourceId,
  contextStartPage,
  setContextStartPage,
  contextEndPage,
  setContextEndPage,
  questionType,
  setQuestionType,
  difficulty,
  setDifficulty,
  bloom,
  setBloom,
  instructions,
  setInstructions,
  queueingJob,
  onQueueJob,
  runningJobs,
  onRunJobs,
  onQueueAndRunNow,
  onRetryFailedJobs,
  onRunReportAction,
  pipelineBlocked,
  artifactLocked,
  hasIngestedContent,
  queuedJobsCount,
  completedJobsCount,
  readyIngestedSources,
  chunkCountBySource,
  activePreviewSourceId,
  setActivePreviewSourceId,
  loadPreviewChunks,
  activeSource,
  isPdfSource,
  setIsPdfViewerOpen,
  chapterId,
  worksheetLocked,
  lessonPlanLocked,
  generationRunReport,
}: JobQueueProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xl shadow-slate-200/20 dark:shadow-none space-y-6 animate-in slide-in-from-right-4 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 flex items-center justify-center text-sm font-bold">3</div>
          Queue Generation Job
        </h2>
        {queuedJobsCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-full text-[10px] font-bold text-amber-600 dark:text-amber-400">
            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
            {queuedJobsCount} Queued
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Artifact Type</span>
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
            value={artifact}
            onChange={(e) => setArtifact(e.target.value as ArtifactType)}
          >
            <option value="question">Question</option>
            <option value="worksheet" disabled={worksheetLocked}>Worksheet {worksheetLocked ? "(Advanced)" : ""}</option>
            <option value="lesson_plan" disabled={lessonPlanLocked}>Lesson Plan {lessonPlanLocked ? "(Advanced)" : ""}</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Quantity/Count</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Reference Source</span>
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
            value={selectedSourceId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedSourceId(id);
              if (id) {
                setActivePreviewSourceId(id);
                void loadPreviewChunks(id);
              }
            }}
          >
            <option value="">Auto-select all ingested</option>
            {readyIngestedSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title} (v{source.version_no}, chunks: {chunkCountBySource[source.id] || 0})
              </option>
            ))}
          </select>
        </label>

        <div className="sm:col-span-2 lg:col-span-1 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Start Page</span>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
              type="number"
              min={1}
              value={contextStartPage}
              onChange={(e) => {
                const n = Math.max(1, Number(e.target.value) || 1);
                setContextStartPage(n);
                if (contextEndPage < n) setContextEndPage(n);
              }}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">End Page</span>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
              type="number"
              min={1}
              value={contextEndPage}
              onChange={(e) => setContextEndPage(Math.max(contextStartPage, Number(e.target.value) || 1))}
            />
          </label>
        </div>

        <div className="sm:col-span-2 lg:col-span-3 pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-2 text-xs font-bold transition-colors w-fit px-3 py-1.5 rounded-lg border ${
              showAdvanced ? "bg-brand/5 border-brand/20 text-brand" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-brand hover:border-brand/30"
            }`}
          >
            <Settings2 size={14} />
            {showAdvanced ? "Hide Advanced Settings" : "Advanced AI Settings (Difficulty, Bloom, Instructions)"}
            <ChevronDown size={14} className={`transition-transform duration-300 ${showAdvanced ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showAdvanced && (
          <div className="sm:col-span-2 border-l-2 border-brand/20 pl-4 space-y-4 animate-in slide-in-from-top-2 lg:col-span-3 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
            {artifact === "question" && (
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Question Type</span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                >
                  {questionTypes.map((row) => <option key={row} value={row}>{row.replace("_", " ")}</option>)}
                </select>
              </label>
            )}

            {(artifact === "question" || artifact === "worksheet") && (
              <div className="grid grid-cols-2 gap-3 lg:col-span-2">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Difficulty</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  >
                    {difficulties.map((row) => <option key={row} value={row}>{row}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Bloom</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                    value={bloom}
                    onChange={(e) => setBloom(e.target.value as BloomLevel)}
                  >
                    {blooms.map((row) => <option key={row} value={row}>{row}</option>)}
                  </select>
                </label>
              </div>
            )}

            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">AI Instructions (Optional)</span>
              <textarea
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none min-h-[80px]"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Focus on definitions, keep questions short..."
              />
            </label>
          </div>
        )}
      </div>

      {runningJobs && (
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-white shadow-xl relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in slide-in-from-bottom-4">
          <div
            className="absolute inset-y-0 left-0 bg-brand/10 transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, (completedJobsCount / Math.max(1, queuedJobsCount + completedJobsCount)) * 100)}%` }}
          />
          <div className="flex items-center gap-3 relative z-10 border-l-[3px] border-brand pl-3">
            <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
              <Loader2 size={16} className="text-brand animate-spin" />
            </div>
            <div>
              <h4 className="text-sm font-bold">Processing AI Jobs</h4>
              <p className="text-xs text-slate-400 font-medium">Extracting content from context pages {contextStartPage} - {contextEndPage}</p>
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0 relative z-10">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Progress</span>
            <span className="text-2xl font-display font-black leading-none">{completedJobsCount} <span className="text-sm font-medium text-slate-500">/ {queuedJobsCount + completedJobsCount}</span></span>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPdfViewerOpen(true)}
            disabled={!activePreviewSourceId || !isPdfSource(activeSource)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            <Eye size={14} />
            Check Reference Pages
          </button>
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-[10px] font-bold text-blue-600 dark:text-blue-400">
            <Info size={12} />
            Page Range: {contextStartPage} - {contextEndPage}
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={onQueueAndRunNow}
            disabled={pipelineBlocked || artifactLocked || queueingJob || runningJobs || !chapterId || !hasIngestedContent}
            className="flex-1 sm:flex-none rounded-xl bg-brand text-white px-6 py-2.5 font-bold text-sm shadow-lg shadow-brand/20 hover:bg-brand-600 hover:translate-y-[-1px] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:translate-y-0"
          >
            {(queueingJob || runningJobs) ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Queue + Run...
              </span>
            ) : "Queue & Run Now"}
          </button>

          <button
            onClick={onQueueJob}
            disabled={pipelineBlocked || artifactLocked || queueingJob || runningJobs || !chapterId || !hasIngestedContent}
            className="flex-1 sm:flex-none rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2.5 font-bold text-sm shadow-lg shadow-slate-200 dark:shadow-none hover:translate-y-[-1px] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:translate-y-0"
          >
            {queueingJob ? (
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-slate-400 border-t-white dark:border-t-slate-900 rounded-full animate-spin" />
                Queueing...
              </span>
            ) : "Queue Job"}
          </button>

          <button
            onClick={onRunJobs}
            disabled={pipelineBlocked || runningJobs || !chapterId || !hasIngestedContent || queuedJobsCount <= 0}
            className="group relative flex-1 sm:flex-none rounded-xl bg-emerald-600 text-white px-6 py-2.5 font-bold text-sm shadow-lg shadow-emerald-200 dark:shadow-none hover:bg-emerald-700 hover:translate-y-[-1px] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:translate-y-0 flex items-center justify-center gap-2 min-w-[140px] overflow-hidden"
          >
            {runningJobs && (
              <div
                className="absolute inset-0 bg-white/20 transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, (completedJobsCount / Math.max(1, queuedJobsCount + completedJobsCount)) * 100)}%` }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {runningJobs ? <Loader2 size={16} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
              {runningJobs ? `Running (${completedJobsCount}/${queuedJobsCount + completedJobsCount})` : "Process Queue"}
            </span>
          </button>
        </div>
      </div>

      {pipelineBlocked && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 text-xs text-rose-600 dark:text-rose-400 font-medium">
          Subscription inactive. Renew to run generation jobs.
        </div>
      )}
      {!pipelineBlocked && artifactLocked && (
        <div className="p-3 rounded-xl bg-brand/5 border border-brand/20 text-xs text-brand font-medium">
          The {artifact.replace("_", " ")} artifact requires an Advanced plan.
        </div>
      )}

      {generationRunReport && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Last Run Summary</p>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Processed: {generationRunReport.processed} | Completed: {generationRunReport.completed} | Failed: {generationRunReport.failed} | Candidates: {generationRunReport.candidatesCreated}
          </p>
          {generationRunReport.failedJobIds.length > 0 && (
            <button
              type="button"
              onClick={onRetryFailedJobs}
              disabled={runningJobs || queueingJob || pipelineBlocked}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Retry Failed Jobs ({generationRunReport.failedJobIds.length})
            </button>
          )}
          {generationRunReport.topErrors.length > 0 && (
            <div className="space-y-2">
              {generationRunReport.topErrors.map((error, idx) => (
                <div key={`${idx}_${error.message}`} className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {error.count}x {error.message}
                    </p>
                    {error.actionKey && error.actionLabel && (
                      <button
                        type="button"
                        onClick={() => onRunReportAction(error.actionKey!, error.message)}
                        className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-[10px] font-semibold text-white"
                      >
                        {error.actionLabel}
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-200/80">{error.hint}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
