import { useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { CategoryScale, Chart as ChartJS, Legend, LinearScale, BarElement, Tooltip } from "chart.js";
import { getPapersByTeacher, getQuestions, getStats } from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export function DashboardPage() {
  const profile = useAppStore((s) => s.profile);
  const [stats, setStats] = useState({ totalQuestions: 0, papersGenerated: 0, totalSubjects: 0, totalChapters: 0, totalClasses: 0 });
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<{ id: string; created_at: string; total_marks: number }[]>([]);

  useEffect(() => {
    async function load() {
      if (!profile?.school_id) {
        return;
      }
      const [s, qs, papers] = await Promise.all([getStats(profile.school_id, profile.id), getQuestions(profile.school_id), getPapersByTeacher(profile.id)]);
      setStats(s);
      setRecent(papers.slice(0, 5));
      const counts: Record<string, number> = {};
      qs.forEach((q) => {
        counts[q.question_type] = (counts[q.question_type] ?? 0) + 1;
      });
      setTypeCounts(counts);
    }
    load();
  }, [profile?.id, profile?.school_id]);

  const chartData = useMemo(
    () => ({
      labels: Object.keys(typeCounts),
      datasets: [{ label: "Questions", data: Object.values(typeCounts), backgroundColor: ["#0f6f8f", "#2563eb", "#0ea5e9", "#f59e0b", "#16a34a", "#9333ea", "#dc2626"] }],
    }),
    [typeCounts],
  );

  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-bold">Dashboard</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Total Questions", stats.totalQuestions],
          ["Papers Generated", stats.papersGenerated],
          ["Classes", stats.totalClasses],
          ["Subjects", stats.totalSubjects],
          ["Chapters", stats.totalChapters],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{k}</p>
            <p className="mt-1 text-2xl font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold">Question Type Distribution</h3>
          <Bar data={chartData} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold">Recent Papers</h3>
          <div className="space-y-2 text-sm">
            {recent.length ? recent.map((p) => <div key={p.id} className="rounded border border-slate-200 p-2">{new Date(p.created_at).toLocaleString()} - {p.total_marks} marks</div>) : <p>No papers yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
