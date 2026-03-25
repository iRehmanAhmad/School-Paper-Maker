import { Fragment } from "react";
import { CheckCircle2, Trash2, Send, ExternalLink, ChevronDown, ChevronUp, AlertCircle, Search, Filter, ClipboardList } from "lucide-react";
import type { GenerationCandidate } from "@/types/domain";

interface CandidateReviewProps {
  candidates: GenerationCandidate[];
  selectedCandidateIds: string[];
  setSelectedCandidateIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  allContextSelected: boolean;
  toggleSelectAllContextCandidates: (checked: boolean) => void;
  onDeleteSelected: () => Promise<void>;
  onPublishSelected: () => Promise<void>;
  onDeleteCandidates: (ids: string[]) => Promise<void>;
  onReviewCandidate: (id: string, action: "approve" | "reject") => Promise<void>;
  expandedCandidateId: string;
  setExpandedCandidateId: (id: string | ((prev: string|null) => string|null)) => void;
  deletingCandidates: boolean;
  publishing: boolean;
  candidatePayload: (c: GenerationCandidate) => any;
  candidateSummary: (c: GenerationCandidate) => string;
  questionOptions: (p: any) => string[];
}

export function CandidateReview({
  candidates,
  selectedCandidateIds,
  setSelectedCandidateIds,
  allContextSelected,
  toggleSelectAllContextCandidates,
  onDeleteSelected,
  onPublishSelected,
  onDeleteCandidates,
  onReviewCandidate,
  expandedCandidateId,
  setExpandedCandidateId,
  deletingCandidates,
  publishing,
  candidatePayload,
  candidateSummary,
  questionOptions,
}: CandidateReviewProps) {
  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xl shadow-slate-200/20 dark:shadow-none space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">4</div>
          Candidate Review
        </h2>
        
        <div className="flex flex-wrap items-center gap-2">
          {selectedCandidateIds.length > 0 && (
            <div className="flex items-center gap-2 mr-2 animate-in slide-in-from-right-2">
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
                {selectedCandidateIds.length} Selected
              </span>
              <button
                onClick={onDeleteSelected}
                disabled={deletingCandidates}
                className="p-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 hover:bg-rose-100 transition-all font-bold text-xs"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={onPublishSelected}
                disabled={publishing}
                className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 dark:shadow-none"
              >
                <Send size={14} />
                Publish Selected
              </button>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                placeholder="Search candidates..." 
                className="pl-9 pr-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-xs focus:ring-2 focus:ring-brand/20 outline-none w-48 transition-all"
              />
            </div>
            <button className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-brand transition-colors">
              <Filter size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="px-6 py-3 w-8">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand accent-brand"
                  checked={allContextSelected}
                  onChange={(e) => toggleSelectAllContextCandidates(e.target.checked)}
                />
              </th>
              <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Artifact</th>
              <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Preview Content</th>
              <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</th>
              <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {candidates.map((candidate) => {
              const checked = selectedCandidateIds.includes(candidate.id);
              const payload = candidatePayload(candidate);
              const isExpanded = expandedCandidateId === candidate.id;
              const preview = candidateSummary(candidate);
              
              return (
                <Fragment key={candidate.id}>
                  <tr className={`group transition-all ${isExpanded ? 'bg-slate-50/80 dark:bg-slate-800/50' : checked ? 'bg-brand/5' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'}`}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand accent-brand"
                        checked={checked}
                        onChange={(e) => setSelectedCandidateIds((prev) => (e.target.checked ? [...prev, candidate.id] : prev.filter((id) => id !== candidate.id)))}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          candidate.artifact === 'question' ? 'bg-blue-100 text-blue-600' : 
                          candidate.artifact === 'worksheet' ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          <ClipboardList size={14} />
                        </span>
                        <span className="font-bold text-slate-700 dark:text-slate-300 capitalize text-xs">
                          {candidate.artifact.replace("_", " ")}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-[400px]">
                      <p className="text-xs text-slate-600 dark:text-slate-400 truncate leading-relaxed font-medium">
                        {preview}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                        candidate.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/30' :
                        candidate.status === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:border-rose-900/30' :
                        candidate.status === 'published' ? 'bg-brand/5 text-brand border-brand/20' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                      }`}>
                        {candidate.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setExpandedCandidateId((prev: any) => (prev === candidate.id ? "" : candidate.id))}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                            isExpanded 
                              ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white" 
                              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-brand hover:text-brand"
                          }`}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          Review
                        </button>
                        
                        {candidate.status !== "published" && (
                          <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                             <button 
                                onClick={() => onReviewCandidate(candidate.id, "approve")} 
                                className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-100"
                                title="Approve"
                             >
                                <CheckCircle2 size={16} />
                             </button>
                             <button 
                                onClick={() => onReviewCandidate(candidate.id, "reject")} 
                                className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30 hover:bg-amber-100"
                                title="Reject"
                             >
                                <AlertCircle size={16} />
                             </button>
                             <button 
                                onClick={() => onDeleteCandidates([candidate.id])} 
                                className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 hover:bg-rose-100"
                                title="Delete"
                             >
                                <Trash2 size={16} />
                             </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-slate-50/80 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                      <td colSpan={5} className="px-6 py-6 animate-in slide-in-from-top-2">
                        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-lg shadow-slate-200/50 dark:shadow-none max-w-4xl mx-auto">
                          {candidate.artifact === "question" && (
                            <div className="space-y-4">
                              <div className="flex items-start justify-between">
                                  <span className="px-4 py-1.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest">
                                    Final Review
                                  </span>
                                  {candidate.status === 'published' && (
                                    <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs bg-emerald-50 px-3 py-1.5 rounded-full">
                                      <CheckCircle2 size={14} />
                                      Published to Library
                                    </div>
                                  )}
                              </div>
                              
                              <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white leading-snug break-words whitespace-normal">
                                {String(payload.question_text || payload.questionText || "Question text not available")}
                              </h3>

                              {questionOptions(payload).length > 0 && (
                                <div className="grid gap-3 sm:grid-cols-2 mt-4">
                                  {questionOptions(payload).map((option, index) => (
                                    <div 
                                      key={`${candidate.id}_opt_${index}`} 
                                      className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${
                                        String(payload.correct_answer || payload.correctAnswer) === String.fromCharCode(65 + index) || 
                                        String(payload.correct_answer || payload.correctAnswer) === option
                                          ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                                          : "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400"
                                      }`}
                                    >
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                                        String(payload.correct_answer || payload.correctAnswer) === String.fromCharCode(65 + index) || 
                                        String(payload.correct_answer || payload.correctAnswer) === option
                                          ? "bg-emerald-500 text-white"
                                          : "bg-slate-200 dark:bg-slate-700 text-slate-500"
                                      }`}>
                                        {String.fromCharCode(65 + index)}
                                      </div>
                                      <span className="font-semibold text-sm break-words whitespace-normal">{option}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex flex-wrap items-center gap-4 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Answer</span>
                                  <span className="text-sm font-bold text-emerald-600">{String(payload.correct_answer || payload.correctAnswer || "-")}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Difficulty</span>
                                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300 capitalize">{String(payload.difficulty || "-")}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bloom</span>
                                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300 capitalize">{String(payload.bloom_level || payload.bloomLevel || "-")}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Points</span>
                                    <span className="text-sm font-bold text-brand">{String(payload.marks || "1")}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Worksheet & Lesson Plan Details - Simplified for brevity but still premium */}
                          {(candidate.artifact === 'worksheet' || candidate.artifact === 'lesson_plan') && (
                            <div className="space-y-4">
                                <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                                  {String(payload.title || (candidate.artifact === 'worksheet' ? "Worksheet" : "Lesson Plan"))}
                                </h3>
                                {(payload.items || payload.blocks) && (
                                  <div className="space-y-3">
                                    {(payload.items || payload.blocks).slice(0, 10).map((row: any, idx: number) => (
                                      <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex items-start gap-4">
                                        <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                                          {idx + 1}
                                        </span>
                                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 break-words whitespace-normal">
                                          {row.prompt || row.question_text || row.content || "No text available"}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {candidates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                  <ClipboardList size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="text-xs font-medium italic">No generation candidates available in this context.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
