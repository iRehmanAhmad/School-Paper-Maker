import { useMemo, useState, useEffect } from "react";
import { Folder, FileText, CheckCircle2, AlertCircle, Play, Layers, BookOpen } from "lucide-react";
import type { ExamBody, ClassEntity, SubjectEntity, ChapterEntity, ContentSource } from "@/types/domain";

interface ResourceLibraryProps {
  examBodies: ExamBody[];
  classes: ClassEntity[];
  subjects: SubjectEntity[];
  chapters: ChapterEntity[];
  sources: ContentSource[];
  onUseSource: (source: ContentSource) => void;
  onDeleteSource: (id: string) => Promise<void>;
  loading?: boolean;
}

export function ResourceLibrary({
  examBodies,
  classes,
  subjects,
  chapters,
  sources,
  onUseSource,
  onDeleteSource,
  loading,
}: ResourceLibraryProps) {
  const [selectedExamBodyId, setSelectedExamBodyId] = useState<string>("");

  useEffect(() => {
    if (examBodies.length > 0 && !selectedExamBodyId) {
      setSelectedExamBodyId(examBodies[0].id);
    }
  }, [examBodies, selectedExamBodyId]);

  const sortedSources = useMemo(() => {
    if (!selectedExamBodyId) return [];

    return [...sources]
      .filter((s) => s.exam_body_id === selectedExamBodyId)
      .sort((a, b) => {
        const clsA = classes.find((c) => c.id === a.class_id)?.name || "Z";
        const clsB = classes.find((c) => c.id === b.class_id)?.name || "Z";
        const clsCmp = clsA.localeCompare(clsB);
        if (clsCmp !== 0) return clsCmp;

        const subjA = subjects.find((s) => s.id === a.subject_id)?.name || "Z";
        const subjB = subjects.find((s) => s.id === b.subject_id)?.name || "Z";
        const subjCmp = subjA.localeCompare(subjB);
        if (subjCmp !== 0) return subjCmp;

        const chapA = chapters.find((c) => c.id === a.chapter_id)?.chapter_number || 999;
        const chapB = chapters.find((c) => c.id === b.chapter_id)?.chapter_number || 999;
        return chapA - chapB;
      });
  }, [sources, selectedExamBodyId, classes, subjects, chapters]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-in fade-in">
        <div className="w-8 h-8 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
        <span className="mt-4 text-xs font-bold uppercase tracking-widest text-slate-400">Loading Library Assets...</span>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in">
        <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-center text-slate-300 mb-4">
          <Layers size={32} />
        </div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Your Library is Empty</h3>
        <p className="max-w-[300px] mt-2 text-xs text-slate-500 leading-relaxed font-medium">
          Once you upload files in the "Sources" tab, they will appear here organized by class and subject for easy access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Resource Library</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Manage and reuse all your school assets</p>
        </div>
        
        {examBodies.length > 0 && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl overflow-x-auto scrollbar-hide">
            {examBodies.map((exam) => (
              <button
                key={exam.id}
                onClick={() => setSelectedExamBodyId(exam.id)}
                className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  selectedExamBodyId === exam.id 
                    ? "bg-white dark:bg-slate-900 text-brand shadow-sm" 
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {exam.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {sortedSources.length === 0 && selectedExamBodyId && (
          <div className="flex justify-center py-10 opacity-50">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">No resources found for this Exam Body.</span>
          </div>
        )}

        {sortedSources.length > 0 && (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md shadow-sm">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/50 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black tracking-widest border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4">Class</th>
                  <th className="px-6 py-4">Subject</th>
                  <th className="px-6 py-4">Chapter</th>
                  <th className="px-6 py-4">Resource Info</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortedSources.map((source) => {
                  const cls = classes.find((c) => c.id === source.class_id);
                  const subj = subjects.find((s) => s.id === source.subject_id);
                  const chap = chapters.find((c) => c.id === source.chapter_id);

                  const className = cls?.name || "Unassigned";
                  const subjectName = subj?.name || "Unassigned";
                  const chapterName = chap ? `Ch ${chap.chapter_number}: ${chap.title}` : "Unassigned";

                  return (
                    <tr key={source.id} className="hover:bg-white dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{className}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-brand">{subjectName}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{chapterName}</span>
                      </td>
                      <td className="px-6 py-4 min-w-[250px]">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 group-hover:bg-brand/10 transition-colors shrink-0">
                            <FileText size={16} className="text-slate-400 group-hover:text-brand" />
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[200px] xl:max-w-[300px]" title={source.title || "unnamed"}>
                              {source.title || "unnamed"}
                            </h5>
                            <p className="text-[10px] text-slate-400 font-medium truncate max-w-[200px] xl:max-w-[300px]">
                              {source.file_path || "Local Session Only"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                            source.status === "ready" 
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" 
                              : source.status === "failed" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
                          }`}>
                            {source.status}
                          </span>
                          {source.status === "ready" && (
                            <div className="flex items-center justify-center gap-1 text-emerald-500">
                              <CheckCircle2 size={10} />
                              <span className="text-[9px] font-bold uppercase">Ingested</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => onUseSource(source)}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-sm shadow-brand/20"
                          >
                            <Play size={10} fill="currentColor" />
                            Use
                          </button>
                          <button
                            onClick={() => onDeleteSource(source.id)}
                            className="p-1.5 rounded-lg border border-slate-100 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-200 dark:hover:bg-rose-900/20 dark:hover:border-rose-900/30 transition-all"
                            title="Delete Resource"
                          >
                            <AlertCircle size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
