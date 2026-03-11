import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getSubscriptionSummary } from "@/services/repositories";
import { BookOpen, ChartPie, CreditCard, DatabaseZap, FileCog, FileOutput, Folder, GraduationCap, LayoutDashboard, ListChecks, LogOut, Settings, Shapes } from "lucide-react";

const adminNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/exam-bodies", label: "Add Exam Body", icon: Shapes },
  { to: "/classes", label: "Classes", icon: GraduationCap },
  { to: "/subjects", label: "Add Subject", icon: BookOpen },
  { to: "/chapters", label: "Add Chapter", icon: Folder },
  { to: "/question-bank", label: "Add Questions", icon: ListChecks },
  { to: "/subscriptions", label: "Subscriptions", icon: CreditCard },
  { to: "/content-pipeline", label: "Content Pipeline", icon: DatabaseZap },
  { to: "/blueprints", label: "Blueprints", icon: FileCog },
  { to: "/analytics", label: "Analytics", icon: ChartPie },
  { to: "/settings", label: "Settings", icon: Settings },
];

const teacherNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/paper-generator", label: "Paper Generator", icon: FileCog },
  { to: "/templates", label: "Templates", icon: FileOutput },
  { to: "/analytics", label: "Analytics", icon: ChartPie },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const navigate = useNavigate();
  const [planLabel, setPlanLabel] = useState<string>("");
  const [planActive, setPlanActive] = useState<boolean>(true);

  useEffect(() => {
    async function loadSummary() {
      if (!profile?.school_id) {
        setPlanLabel("");
        return;
      }
      try {
        const summary = await getSubscriptionSummary(profile.school_id);
        setPlanLabel(summary.plan.name);
        setPlanActive(summary.isActive);
      } catch {
        setPlanLabel("");
      }
    }
    loadSummary();
  }, [profile?.school_id]);

  function logout() {
    setProfile(null);
    navigate("/login");
  }

  const navItems = profile?.role === "admin" ? adminNav : teacherNav;

  return (
    <div className="min-h-screen overflow-x-hidden flex">
      <div className="flex w-full">
        <aside className="w-[240px] shrink-0 rounded-r-2xl border-r border-slate-200 dark:border-slate-800 bg-card p-4 shadow-soft min-h-screen sticky top-0 self-start transition-colors duration-300">
          <h1 className="font-display text-2xl font-bold text-brand">Paper Generator</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Fast exam generation for schools</p>
          <div className="mt-4 rounded-xl bg-bg dark:bg-slate-800/50 p-3 text-sm">
            <p className="font-semibold text-ink">{profile?.full_name ?? "Guest"}</p>
            <p className="text-slate-500 dark:text-slate-400">{profile?.role ?? "teacher"}</p>
            {planLabel && (
              <p className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${planActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {planLabel} {planActive ? "Active" : "Inactive"}
              </p>
            )}
          </div>
          <nav className="mt-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all ${isActive
                      ? "bg-brand text-white shadow-md shadow-brand/20"
                      : "text-slate-600 dark:text-slate-400 hover:bg-bg dark:hover:bg-slate-800/80 hover:text-brand"
                    }`
                  }
                >
                  <Icon size={16} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {profile?.role === "teacher" && (
            <div className="mt-8 mb-4">
              <h3 className="px-3 text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
                <Folder size={12} /> My Papers
              </h3>
              <SavedPapersWidget teacherId={profile.id} />
            </div>
          )}

          <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
            <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-700/50 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30 dark:hover:text-rose-400 transition-colors font-semibold">
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </aside>
        <main className="flex-1 min-w-0 p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-900">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

type SavedPaperItem = {
  id: string;
  createdAt: string;
  paperName: string;
  subjectName: string;
  totalMarks: number;
};

function SavedPapersWidget({ teacherId }: { teacherId: string }) {
  const [papers, setPapers] = useState<SavedPaperItem[]>([]);
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "name_asc" | "name_desc">("date_desc");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"none" | "subject">("none");

  const loadPapers = useCallback(async () => {
    try {
      const { getPapersByTeacher } = await import("@/services/paperService");
      const list = await getPapersByTeacher(teacherId);
      const mapped: SavedPaperItem[] = list
        .map((p) => {
          const header = ((p.settings_json as any)?.header ?? {}) as Record<string, unknown>;
          const paperName = String(header.paperName || header.examTitle || "").trim();
          if (!paperName) return null;
          return {
            id: p.id,
            createdAt: p.created_at,
            paperName,
            subjectName: String(header.subjectName || "Unknown Subject"),
            totalMarks: Number(p.total_marks || 0),
          };
        })
        .filter((p): p is SavedPaperItem => !!p);
      setPapers(mapped);
    } catch (e) { console.error(e); }
  }, [teacherId]);

  useEffect(() => {
    loadPapers();
    window.addEventListener("storage", loadPapers);
    return () => window.removeEventListener("storage", loadPapers);
  }, [loadPapers]);

  const navigate = useNavigate();
  const subjectOptions = Array.from(new Set(papers.map((p) => p.subjectName))).sort((a, b) => a.localeCompare(b));
  const visible = [...papers]
    .filter((p) => (subjectFilter === "all" ? true : p.subjectName === subjectFilter))
    .sort((a, b) => {
      if (sortBy === "date_desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "date_asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "name_asc") return a.paperName.localeCompare(b.paperName);
      return b.paperName.localeCompare(a.paperName);
    })
    .slice(0, 10);

  const grouped = visible.reduce<Record<string, SavedPaperItem[]>>((acc, paper) => {
    const key = groupBy === "subject" ? paper.subjectName : "All";
    const bucket = acc[key] ?? [];
    bucket.push(paper);
    acc[key] = bucket;
    return acc;
  }, {});

  if (papers.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
        No saved papers yet.<br />Save one from the generator!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 px-1">
        <select
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
        >
          <option value="date_desc">Newest</option>
          <option value="date_asc">Oldest</option>
          <option value="name_asc">A-Z</option>
          <option value="name_desc">Z-A</option>
        </select>
        <select
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
        >
          <option value="none">No Group</option>
          <option value="subject">Group Subject</option>
        </select>
      </div>
      <select
        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        value={subjectFilter}
        onChange={(e) => setSubjectFilter(e.target.value)}
      >
        <option value="all">All Subjects</option>
        {subjectOptions.map((subject) => (
          <option key={subject} value={subject}>
            {subject}
          </option>
        ))}
      </select>

      <div className="flex max-h-72 flex-col gap-1.5 overflow-auto pr-1">
        {Object.entries(grouped).map(([group, list]) => (
          <div key={group} className="space-y-1">
            {groupBy === "subject" && (
              <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group}</p>
            )}
            {list.map((p) => (
              <button
                key={p.id}
                className="flex flex-col items-start gap-1 rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition-all hover:bg-bg hover:text-brand dark:text-slate-400 dark:hover:bg-slate-800/80 w-full group"
                onClick={() => {
                  navigate(`/paper-generator?load=${p.id}`);
                }}
              >
                <span className="w-full truncate font-semibold text-slate-700 transition-colors group-hover:text-brand dark:text-slate-300">
                  {p.paperName}
                </span>
                <div className="flex w-full items-center justify-between">
                  <span className="text-[10px] text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    {p.totalMarks}m
                  </span>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
