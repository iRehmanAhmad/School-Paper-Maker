import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { ArcElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, BarElement, Tooltip, LineElement, PointElement } from "chart.js";
import { ArrowDownRight, ArrowUpRight, BookCheck, BookOpen, FileText, FolderPlus, Layers3, Sparkles, WandSparkles } from "lucide-react";
import { getChapters, getClasses, getPapersByTeacher, getQuestions, getStats, getSubjects } from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";
import { LoadingDashboard } from "@/components/LoadingState";
import type { ChapterEntity, ClassEntity, Paper, Question, SubjectEntity } from "@/types/domain";

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend, LineElement, PointElement, Filler);

type DashboardStats = {
  totalQuestions: number;
  papersGenerated: number;
  totalSubjects: number;
  totalChapters: number;
  totalClasses: number;
};

type TrendStat = {
  value: number;
  delta: number;
};

function asDateMs(value: string) {
  const n = Date.parse(value);
  return Number.isNaN(n) ? 0 : n;
}

function countInWindow<T>(rows: T[], accessor: (row: T) => string, start: number, end: number) {
  return rows.reduce((acc, row) => {
    const ts = asDateMs(accessor(row));
    return ts >= start && ts < end ? acc + 1 : acc;
  }, 0);
}

export function DashboardPage() {
  const profile = useAppStore((s) => s.profile);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({ totalQuestions: 0, papersGenerated: 0, totalSubjects: 0, totalChapters: 0, totalClasses: 0 });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [subjects, setSubjects] = useState<SubjectEntity[]>([]);
  const [chapters, setChapters] = useState<ChapterEntity[]>([]);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      if (!profile?.school_id) {
        return;
      }

      setLoading(true);
      try {
        const [s, qs, teacherPapers, schoolClasses] = await Promise.all([
          getStats(profile.school_id, profile.id),
          getQuestions(profile.school_id),
          getPapersByTeacher(profile.id),
          getClasses(profile.school_id),
        ]);

        const classIds = schoolClasses.map((c) => c.id);
        const schoolSubjects = classIds.length ? await getSubjects(classIds) : [];
        const subjectIds = schoolSubjects.map((sRow) => sRow.id);
        const schoolChapters = subjectIds.length ? await getChapters(subjectIds) : [];

        setStats(s);
        setQuestions(qs);
        setPapers(teacherPapers);
        setClasses(schoolClasses);
        setSubjects(schoolSubjects);
        setChapters(schoolChapters);

        const counts: Record<string, number> = {};
        qs.forEach((q) => {
          counts[q.question_type] = (counts[q.question_type] ?? 0) + 1;
        });
        setTypeCounts(counts);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profile?.id, profile?.school_id]);

  const typeChartData = useMemo(
    () => ({
      labels: Object.keys(typeCounts).map((x) => x.replace("_", " ")),
      datasets: [{ label: "Questions", data: Object.values(typeCounts), backgroundColor: ["#0f6f8f", "#2563eb", "#0ea5e9", "#f59e0b", "#16a34a", "#9333ea", "#dc2626"], borderRadius: 8 }],
    }),
    [typeCounts],
  );

  const bloomChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    questions.forEach((q) => {
      const key = q.bloom_level || "unassigned";
      counts[key] = (counts[key] || 0) + 1;
    });
    return {
      labels: Object.keys(counts),
      datasets: [{ data: Object.values(counts), backgroundColor: ["#6366f1", "#8b5cf6", "#d946ef", "#f43f5e", "#fb923c", "#facc15"] }],
    };
  }, [questions]);

  const velocityChartData = useMemo(() => {
    const days = 10;
    const labels = Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      return date.toISOString().slice(0, 10);
    });
    const byDay: Record<string, number> = {};
    papers.forEach((p) => {
      const key = p.created_at.slice(0, 10);
      byDay[key] = (byDay[key] ?? 0) + 1;
    });
    return {
      labels,
      datasets: [{ label: "Papers", data: labels.map((k) => byDay[k] ?? 0), borderColor: "#0f6f8f", backgroundColor: "rgba(15,111,143,0.12)", fill: true, tension: 0.35 }],
    };
  }, [papers]);

  const trend = useMemo(() => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const thisStart = now - (7 * day);
    const prevStart = now - (14 * day);

    const questionsThis = countInWindow(questions, (q) => q.created_at, thisStart, now);
    const questionsPrev = countInWindow(questions, (q) => q.created_at, prevStart, thisStart);
    const papersThis = countInWindow(papers, (p) => p.created_at, thisStart, now);
    const papersPrev = countInWindow(papers, (p) => p.created_at, prevStart, thisStart);
    const classesThis = countInWindow(classes, (c) => c.created_at, thisStart, now);
    const classesPrev = countInWindow(classes, (c) => c.created_at, prevStart, thisStart);
    const subjectsThis = countInWindow(subjects, (s) => s.created_at, thisStart, now);
    const subjectsPrev = countInWindow(subjects, (s) => s.created_at, prevStart, thisStart);
    const chaptersThis = countInWindow(chapters, (c) => c.created_at, thisStart, now);
    const chaptersPrev = countInWindow(chapters, (c) => c.created_at, prevStart, thisStart);

    return {
      questions: { value: stats.totalQuestions, delta: questionsThis - questionsPrev },
      papers: { value: stats.papersGenerated, delta: papersThis - papersPrev },
      classes: { value: stats.totalClasses, delta: classesThis - classesPrev },
      subjects: { value: stats.totalSubjects, delta: subjectsThis - subjectsPrev },
      chapters: { value: stats.totalChapters, delta: chaptersThis - chaptersPrev },
    };
  }, [questions, papers, classes, subjects, chapters, stats]);

  const classNameById = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c.name])), [classes]);
  const subjectNameById = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s.name])), [subjects]);

  const recent = useMemo(() => papers.slice(0, 5), [papers]);

  const statCards: Array<{ title: string; trend: TrendStat; icon: React.ComponentType<{ size?: number; className?: string }>; badgeClass: string }> = [
    { title: "Total Questions", trend: trend.questions, icon: BookCheck, badgeClass: "bg-sky-100 text-sky-700" },
    { title: "Papers Generated", trend: trend.papers, icon: FileText, badgeClass: "bg-emerald-100 text-emerald-700" },
    { title: "Classes", trend: trend.classes, icon: Layers3, badgeClass: "bg-violet-100 text-violet-700" },
    { title: "Subjects", trend: trend.subjects, icon: BookOpen, badgeClass: "bg-amber-100 text-amber-700" },
    { title: "Chapters", trend: trend.chapters, icon: Sparkles, badgeClass: "bg-rose-100 text-rose-700" },
  ];

  const isAdmin = profile?.role === "admin";

  if (loading) {
    return <LoadingDashboard />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-6 shadow-sm dark:from-slate-900 dark:to-slate-900">
        <h2 className="font-display text-3xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Operational overview for quick admin decisions.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          const up = card.trend.delta >= 0;
          return (
            <div key={card.title} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{card.title}</p>
                <span className={`rounded-full p-2 ${card.badgeClass}`}>
                  <Icon size={14} />
                </span>
              </div>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-100">{card.trend.value}</p>
              <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {up ? "+" : ""}
                {card.trend.delta} this week
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <WandSparkles size={16} className="text-brand" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600">Quick Actions</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <>
              <button onClick={() => navigate("/question-bank")} className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-sm">Add Questions</button>
              <button onClick={() => navigate("/paper-generator")} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white shadow-sm">Generate Paper</button>
              <button onClick={() => navigate("/chapters")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-100">
                <FolderPlus size={14} className="mr-1 inline-block" />
                Add Chapter
              </button>
            </>
          ) : (
            <>
              <button onClick={() => navigate("/paper-generator")} className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-sm">Generate Paper</button>
              <button onClick={() => navigate("/templates")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-100">Templates</button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Question Type Distribution</h3>
          <Bar data={typeChartData} options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} />
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Bloom's Taxonomy</h3>
          <Doughnut data={bloomChartData} options={{ plugins: { legend: { position: "bottom" } }, cutout: "68%" }} />
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Paper Velocity (10 Days)</h3>
          <Line data={velocityChartData} options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Recent Papers</h3>
        <div className="space-y-2">
          {recent.length ? recent.map((p) => {
            const settingsHeader = ((p.settings_json as Record<string, unknown>)?.header ?? {}) as Record<string, unknown>;
            const title = (settingsHeader.paperName as string) || (settingsHeader.examTitle as string) || "Untitled Paper";
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/paper-generator?load=${p.id}`)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-brand hover:bg-brand/5 dark:border-slate-700 dark:bg-slate-800"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</p>
                  <p className="text-xs text-slate-500">
                    {classNameById[p.class_id] || "Class"} | {subjectNameById[p.subject_id] || "Subject"} | {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">{p.total_marks} marks</span>
                  <span className="text-xs font-bold text-brand">Review</span>
                </div>
              </button>
            );
          }) : <p className="text-sm text-slate-500">No papers yet</p>}
        </div>
      </div>
    </div>
  );
}
