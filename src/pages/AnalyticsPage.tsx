import { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { getChapters, getPapersByTeacher, getQuestions, getSubjects } from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";
import type { Question } from "@/types/domain";

ChartJS.register(ArcElement, BarElement, Tooltip, Legend, CategoryScale, LinearScale, LineElement, PointElement);

export function AnalyticsPage() {
  const profile = useAppStore((s) => s.profile);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [paperTrend, setPaperTrend] = useState<Record<string, number>>({});
  const [chapterStats, setChapterStats] = useState<Array<{ id: string; title: string; count: number; types: Record<string, number> }>>([]);

  useEffect(() => {
    async function load() {
      if (!profile?.school_id || !profile.id) return;

      const [qs, papers] = await Promise.all([
        getQuestions(profile.school_id),
        getPapersByTeacher(profile.id)
      ]);
      setQuestions(qs);

      const trend: Record<string, number> = {};
      papers.forEach((p) => {
        const key = new Date(p.created_at).toISOString().slice(0, 10);
        trend[key] = (trend[key] ?? 0) + 1;
      });
      setPaperTrend(trend);

      // Inventory stats per chapter
      const subs = await getSubjects([]); // passing empty array to get all for the school context if repo allows, or we might need to be more specific
      const chaps = await getChapters(subs.map(s => s.id));
      const stats = chaps.map(c => {
        const chapterQs = qs.filter(q => q.chapter_id === c.id);
        const types: Record<string, number> = {};
        chapterQs.forEach(q => types[q.question_type] = (types[q.question_type] || 0) + 1);
        return {
          id: c.id,
          title: c.title,
          count: chapterQs.length,
          types
        };
      });
      setChapterStats(stats);
    }
    load();
  }, [profile?.id, profile?.school_id]);

  const diffMix = useMemo(() => {
    const counts = { easy: 0, medium: 0, hard: 0 };
    questions.forEach(q => counts[q.difficulty]++);
    return {
      labels: ["Easy", "Medium", "Hard"],
      datasets: [{ data: [counts.easy, counts.medium, counts.hard], backgroundColor: ["#10b981", "#f59e0b", "#ef4444"] }]
    };
  }, [questions]);

  const bloomMix = useMemo(() => {
    const counts: Record<string, number> = {};
    questions.forEach(q => {
      const key = q.bloom_level || "unassigned";
      counts[key] = (counts[key] || 0) + 1;
    });
    return {
      labels: Object.keys(counts),
      datasets: [{ data: Object.values(counts), backgroundColor: ["#6366f1", "#8b5cf6", "#d946ef", "#f43f5e", "#fb923c", "#facc15"] }]
    };
  }, [questions]);

  const typeMix = useMemo(() => {
    const counts: Record<string, number> = {};
    questions.forEach(q => counts[q.question_type] = (counts[q.question_type] || 0) + 1);
    return {
      labels: Object.keys(counts).map(t => t.replace("_", " ")),
      datasets: [{ label: "Questions", data: Object.values(counts), backgroundColor: "#0f6f8f" }]
    };
  }, [questions]);

  const lineData = useMemo(() => ({
    labels: Object.keys(paperTrend),
    datasets: [{ label: "Papers generated", data: Object.values(paperTrend), borderColor: "#0f6f8f", backgroundColor: "rgba(15,111,143,0.1)", fill: true, tension: 0.4 }]
  }), [paperTrend]);

  const alerts = useMemo(() => chapterStats.filter(s => s.count < 5), [chapterStats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">Content Intelligence</h2>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Questions</p>
          <p className="text-3xl font-bold text-brand">{questions.length}</p>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            Inventory Alerts (Low Question Count)
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {alerts.slice(0, 5).map(a => (
              <span key={a.title} className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-amber-700 shadow-sm">
                {a.title}: {a.count}
              </span>
            ))}
            {alerts.length > 5 && <span className="text-xs text-amber-600">+{alerts.length - 5} more</span>}
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-xs font-bold uppercase text-slate-500">Difficulty Distribution</h3>
          <div className="aspect-square"><Doughnut data={diffMix} options={{ cutout: "70%", plugins: { legend: { position: "bottom" } } }} /></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-xs font-bold uppercase text-slate-500">Bloom's Taxonomy</h3>
          <div className="aspect-square"><Doughnut data={bloomMix} options={{ cutout: "70%", plugins: { legend: { position: "bottom" } } }} /></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-xs font-bold uppercase text-slate-500">Question Types</h3>
          <Bar data={typeMix} options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { display: false } } } }} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-500">Inventory Coverage Heatmap</h3>
            <p className="text-xs text-slate-400">Question distribution across chapters and types</p>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-red-500"></div><span className="text-[10px] font-bold text-slate-500 uppercase">Critical Empty</span></div>
            <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-brand"></div><span className="text-[10px] font-bold text-slate-500 uppercase">Active</span></div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-3 pr-4 font-bold text-slate-600">Chapter Title</th>
                {["mcq", "true_false", "fill_blanks", "short", "long"].map(t => (
                  <th key={t} className="pb-3 text-center font-bold text-slate-600 capitalize">{t.replace("_", " ")}</th>
                ))}
                <th className="pb-3 text-right font-bold text-slate-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {chapterStats.map(chap => (
                <tr key={chap.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                  <td className="py-3 pr-4 font-medium text-slate-700">{chap.title}</td>
                  {["mcq", "true_false", "fill_blanks", "short", "long"].map(t => {
                    const count = chap.types[t] || 0;
                    return (
                      <td key={t} className="py-2 text-center">
                        <div className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg font-bold transition-all ${count === 0 ? "bg-red-50 text-red-400 border border-red-100" :
                          count < 5 ? "bg-amber-50 text-amber-600 border border-amber-100" :
                            "bg-brand/10 text-brand border border-brand/20 shadow-sm"
                          }`}>
                          {count}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-3 text-right font-bold text-slate-900">{chap.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xs font-bold uppercase text-slate-500">Paper Generation Velocity</h3>
        <div className="h-64"><Line data={lineData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } }} /></div>
      </div>
    </div>
  );
}

