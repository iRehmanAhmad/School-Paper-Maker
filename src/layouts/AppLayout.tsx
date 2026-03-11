import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { BookOpen, ChartPie, DatabaseZap, FileCog, FileOutput, Folder, GraduationCap, LayoutDashboard, ListChecks, LogOut, Settings, Shapes } from "lucide-react";

const adminNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/exam-bodies", label: "Add Exam Body", icon: Shapes },
  { to: "/classes", label: "Classes", icon: GraduationCap },
  { to: "/subjects", label: "Add Subject", icon: BookOpen },
  { to: "/chapters", label: "Add Chapter", icon: Folder },
  { to: "/question-bank", label: "Add Questions", icon: ListChecks },
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

function SavedPapersWidget({ teacherId }: { teacherId: string }) {
  const [papers, setPapers] = useState<any[]>([]);

  const loadPapers = useCallback(async () => {
    // We import inline to avoid circular dependencies if any, or just use localStorage directly since service requires async handling
    try {
      const { getPapersByTeacher } = await import("@/services/paperService");
      const list = await getPapersByTeacher(teacherId);
      // Only show papers that have a custom paperName saved
      const namedPapers = list.filter((p) => (p.settings_json as any)?.header?.paperName);
      setPapers(namedPapers.slice(0, 5)); // Show top 5 recent
    } catch (e) { console.error(e); }
  }, [teacherId]);

  useEffect(() => {
    loadPapers();
    window.addEventListener("storage", loadPapers);
    return () => window.removeEventListener("storage", loadPapers);
  }, [loadPapers]);

  const navigate = useNavigate();

  if (papers.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
        No saved papers yet.<br />Save one from the generator!
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {papers.map((p) => (
        <button
          key={p.id}
          className="flex flex-col items-start gap-1 rounded-lg px-3 py-2 text-sm transition-all text-slate-600 dark:text-slate-400 hover:bg-bg dark:hover:bg-slate-800/80 hover:text-brand text-left w-full group"
          onClick={() => {
            navigate(`/paper-generator?load=${p.id}`);
          }}
        >
          <span className="font-semibold truncate w-full group-hover:text-brand transition-colors text-slate-700 dark:text-slate-300">{(p.settings_json as any).header.paperName}</span>
          <span className="text-[10px] text-slate-400">{new Date(p.created_at).toLocaleDateString()}</span>
        </button>
      ))}
    </div>
  );
}
