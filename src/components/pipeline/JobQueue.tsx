import { ClipboardList, Play, Info, Eye } from "lucide-react";
import type { ArtifactType, QuestionType, Difficulty, BloomLevel, ContentSource } from "@/types/domain";

const questionTypes: QuestionType[] = ["mcq", "true_false", "fill_blanks", "short", "long", "matching", "diagram"];
const difficulties: Difficulty[] = ["easy", "medium", "hard"];
const blooms: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate"];

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
  onQueueJob: () => Promise<void>;
  runningJobs: boolean;
  onRunJobs: () => Promise<void>;
  pipelineBlocked: boolean;
  artifactLocked: boolean;
  hasIngestedContent: boolean;
  queuedJobsCount: number;
  readyIngestedSources: ContentSource[];
  chunkCountBySource: Record<string, number>;
  activePreviewSourceId: string;
  setActivePreviewSourceId: (id: string) => void;
  loadPreviewChunks: (id: string) => Promise<void>;
  activeSource: ContentSource | null;
  isPdfSource: (s: any) => boolean;
  setIsPdfViewerOpen: (o: boolean) => void;
  chapterId: string;
  worksheetLocked: boolean;
  lessonPlanLocked: boolean;
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
  pipelineBlocked,
  artifactLocked,
  hasIngestedContent,
  queuedJobsCount,
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
}: JobQueueProps) {
  const selectedQueueSource = readyIngestedSources.find((s) => s.id === selectedSourceId) || null;

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
            <option value="worksheet" disabled={worksheetLocked}>Worksheet {worksheetLocked ? "🔒" : ""}</option>
            <option value="lesson_plan" disabled={lessonPlanLocked}>Lesson Plan {lessonPlanLocked ? "🔒" : ""}</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Quantity/Count</span>
          <input 
            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none" 
            type="number" min={1} max={100} value={count} 
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
                loadPreviewChunks(id);
              }
            }}
          >
            <option value="">Auto-select all ingested</option>
            {readyIngestedSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title} (v{source.version_no})
              </option>
            ))}
          </select>
        </label>

        <div className="sm:col-span-2 lg:col-span-1 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Start Page</span>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
              type="number" min={1} value={contextStartPage}
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
              type="number" min={1} value={contextEndPage}
              onChange={(e) => setContextEndPage(Math.max(contextStartPage, Number(e.target.value) || 1))}
            />
          </label>
        </div>

        {artifact === "question" && (
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Question Type</span>
            <select 
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none" 
              value={questionType} onChange={(e) => setQuestionType(e.target.value as QuestionType)}
            >
              {questionTypes.map((row) => <option key={row} value={row}>{row.replace('_', ' ')}</option>)}
            </select>
          </label>
        )}

        {(artifact === "question" || artifact === "worksheet") && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Difficulty</span>
              <select 
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none" 
                value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              >
                {difficulties.map((row) => <option key={row} value={row}>{row}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Bloom</span>
              <select 
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none" 
                value={bloom} onChange={(e) => setBloom(e.target.value as BloomLevel)}
              >
                {blooms.map((row) => <option key={row} value={row}>{row}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">AI Instructions (Optional)</span>
        <textarea 
          className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none min-h-[80px]" 
          value={instructions} onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Focus on definitions, keep questions short..."
        />
      </label>

      {/* Action Footer */}
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
            onClick={onQueueJob} 
            disabled={pipelineBlocked || artifactLocked || queueingJob || !chapterId || !hasIngestedContent} 
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
            className="flex-1 sm:flex-none rounded-xl bg-emerald-600 text-white px-6 py-2.5 font-bold text-sm shadow-lg shadow-emerald-200 dark:shadow-none hover:bg-emerald-700 hover:translate-y-[-1px] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:translate-y-0 flex items-center justify-center gap-2"
          >
            <Play size={14} fill="currentColor" />
            {runningJobs ? "Running..." : `Process Queue`}
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {pipelineBlocked && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 text-xs text-rose-600 dark:text-rose-400 font-medium">
          ⚠️ Subscription inactive. Renew to run generation jobs.
        </div>
      )}
      {!pipelineBlocked && artifactLocked && (
        <div className="p-3 rounded-xl bg-brand/5 border border-brand/20 text-xs text-brand font-medium">
          ✨ The {artifact.replace('_', ' ')} artifact requires an Advanced plan.
        </div>
      )}
    </div>
  );
}
