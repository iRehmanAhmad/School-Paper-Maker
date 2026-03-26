import { FormEvent } from "react";
import { FileUp, Database, Eye, Trash2, FileText, ChevronRight, Cloud, MoreVertical, AlertCircle } from "lucide-react";
import type { ContentSource, ContentChunk } from "@/types/domain";

interface SourceManagerProps {
  sources: ContentSource[];
  chunkCountBySource: Record<string, number>;
  activePreviewSourceId: string;
  setActivePreviewSourceId: (id: string) => void;
  loadPreviewChunks: (id: string) => Promise<void>;
  openPdfViewerForSource: (id: string) => Promise<void>;
  onUploadSource: (e: FormEvent) => Promise<void>;
  onIngestSource: (id: string) => Promise<void>;
  sourceTitle: string;
  setSourceTitle: (t: string) => void;
  sourceFile: File | null;
  setSourceFile: (f: File | null) => void;
  uploadingSource: boolean;
  ingestingSourceId: string;
  chapterId: string;
  hasUploadedSources: boolean;
  hasReadySources: boolean;
  readySourceCount: number;
  totalChunkCount: number;
  ingestedSourceCount: number;
  isPdfSource: (s: any) => boolean;
  canUseSupabase: boolean;
  pushSourceToCloud: (source: ContentSource, file: File) => Promise<void>;
  uploadingToCloud: Record<string, boolean>;
  onDeleteSource: (id: string) => Promise<void>;
  onIngestAll: () => Promise<void>;
  ingestingAll: boolean;
}

export function SourceManager({
  sources,
  chunkCountBySource,
  activePreviewSourceId,
  setActivePreviewSourceId,
  loadPreviewChunks,
  openPdfViewerForSource,
  onUploadSource,
  onIngestSource,
  sourceTitle,
  setSourceTitle,
  sourceFile,
  setSourceFile,
  uploadingSource,
  ingestingSourceId,
  chapterId,
  hasUploadedSources,
  hasReadySources,
  readySourceCount,
  totalChunkCount,
  ingestedSourceCount,
  isPdfSource,
  canUseSupabase,
  pushSourceToCloud,
  uploadingToCloud,
  onDeleteSource,
  onIngestAll,
  ingestingAll,
}: SourceManagerProps) {
  const pendingIngestCount = sources.filter((source) => source.status !== "ready").length;
  const canIngestAll = pendingIngestCount > 0 && !ingestingAll && !ingestingSourceId;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Readiness Brief */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Sources</p>
          <p className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            {sources.length} <span className="text-sm font-medium text-slate-500">Uploaded</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Ingest Status</p>
          <p className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            {readySourceCount}/{sources.length} <span className="text-sm font-medium text-slate-500">Ready</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Semantic Chunks</p>
          <p className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            {totalChunkCount} <span className="text-sm font-medium text-slate-500">Segments</span>
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Step 1: Upload Form */}
        <div className="lg:col-span-4 space-y-4">
          <form 
            onSubmit={onUploadSource} 
            className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xl shadow-slate-200/20 dark:shadow-none space-y-4 relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <FileUp size={80} />
            </div>
            
            <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-sm">1</div>
              Upload Source
            </h2>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              Best quality: upload one chapter or topic per file for accurate generation.
            </p>

            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">Title</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                  placeholder="e.g. Chapter 4 Notes"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 ml-1">File</span>
                <div className="mt-1 relative group/file">
                  <input
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
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
                  <div className={`w-full rounded-xl border-2 border-dashed px-4 py-8 text-center transition-all ${sourceFile ? 'border-brand bg-brand/5' : 'border-slate-200 dark:border-slate-700 group-hover/file:border-brand/40 group-hover/file:bg-slate-50 dark:group-hover/file:bg-slate-800/50'}`}>
                    <FileUp className={`mx-auto mb-2 ${sourceFile ? 'text-brand' : 'text-slate-400'}`} size={24} />
                    <p className={`text-xs font-medium ${sourceFile ? 'text-brand' : 'text-slate-500'}`}>
                      {sourceFile ? sourceFile.name : "Click or drag to upload"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">PDF, TXT, MD up to 25MB</p>
                  </div>
                </div>
              </label>
            </div>

            <button
              type="submit"
              disabled={uploadingSource || !sourceFile || !chapterId}
              className="w-full rounded-xl bg-gradient-to-r from-brand to-brand-600 px-4 py-3 text-white font-bold shadow-lg shadow-brand/20 hover:shadow-brand/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 disabled:shadow-none mt-2"
            >
              {uploadingSource ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Uploading...
                </span>
              ) : "Upload Source"}
            </button>
            
            {!chapterId && (
              <p className="text-[10px] text-center text-rose-500 font-medium">Select a chapter first</p>
            )}
          </form>
        </div>

        {/* Step 2: Source List & Ingestion */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden h-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">2</div>
                Manage Sources
              </h2>
              {sources.length > 0 && (
                <button 
                  onClick={() => void onIngestAll()}
                  disabled={!canIngestAll}
                  className="text-xs font-bold text-brand hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {ingestingAll ? "Ingesting..." : `Ingest All${pendingIngestCount ? ` (${pendingIngestCount})` : ""}`}
                </button>
              )}
            </div>

            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Title & Version</th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sources.map((source) => (
                    <tr 
                      key={source.id} 
                      className={`group transition-colors ${activePreviewSourceId === source.id ? 'bg-brand/5 text-brand' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand transition-colors">
                            {source.title}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">
                            Version {source.version_no} • {chunkCountBySource[source.id] || 0} Chunks
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold capitalize w-fit ${
                            source.status === "ready" 
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" 
                              : source.status === "failed"
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 animate-pulse"
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              source.status === "ready" ? "bg-emerald-500" : source.status === "failed" ? "bg-rose-500" : "bg-slate-400"
                            }`} />
                            {source.status}
                          </span>
                          {source.error_message && (
                            <div className="group relative cursor-help flex items-center gap-1.5 px-2 py-0.5 mt-1.5 rounded-full bg-rose-50 dark:bg-rose-900/20 w-fit">
                              <AlertCircle size={12} className="text-rose-500" />
                              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">View Error</span>
                              <div className="absolute left-0 bottom-full mb-2 w-48 p-2 rounded-lg bg-slate-900 text-white text-[10px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                                {source.error_message}
                                <div className="absolute left-4 top-full w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => onIngestSource(source.id)}
                            disabled={ingestingAll || ingestingSourceId === source.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all ${
                              ingestingAll || ingestingSourceId === source.id 
                                ? "bg-slate-100 text-slate-400" 
                                : "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:scale-95"
                            }`}
                            title="Ingest Source"
                          >
                            <Database size={12} className={ingestingAll || ingestingSourceId === source.id ? "animate-spin" : ""} />
                            Ingest
                          </button>
                          
                          {isPdfSource(source) && (
                            <button
                              onClick={() => openPdfViewerForSource(source.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-brand hover:text-brand shadow-sm active:scale-95"
                              title="Open PDF Viewer"
                            >
                              <FileText size={12} />
                              View
                            </button>
                          )}

                          <div className="relative group/dropdown">
                            <button
                              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shadow-sm"
                            >
                              <MoreVertical size={16} />
                            </button>
                            <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-700 opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all z-50 flex flex-col p-1.5 origin-top-right">
                              <button
                                onClick={async () => {
                                  setActivePreviewSourceId(source.id);
                                  await loadPreviewChunks(source.id);
                                }}
                                className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                              >
                                <Eye size={14} className="text-slate-400" />
                                Preview Chunks
                              </button>

                              {canUseSupabase && String(source.file_path).startsWith("local/") && (
                                <div className="relative w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-brand hover:bg-brand/5 transition-colors cursor-pointer">
                                  <input
                                    type="file" accept=".pdf,application/pdf" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) pushSourceToCloud(source, file);
                                      e.currentTarget.value = "";
                                    }}
                                    disabled={uploadingToCloud[source.id]}
                                  />
                                  {uploadingToCloud[source.id] ? (
                                    <div className="w-3 h-3 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
                                  ) : (
                                    <Cloud size={14} />
                                  )}
                                  {uploadingToCloud[source.id] ? "Syncing..." : "Sync to Cloud"}
                                </div>
                              )}

                              <div className="h-px w-full bg-slate-100 dark:bg-slate-800 my-1" />

                              <button
                                onClick={() => onDeleteSource(source.id)}
                                className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                              >
                                <Trash2 size={14} />
                                Delete Source
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sources.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
                        <FileUp size={40} className="mx-auto mb-3 opacity-20" />
                        <p className="text-xs font-medium italic">No sources found for this context.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
