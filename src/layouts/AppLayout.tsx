import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { BookOpen, ChartPie, FileCog, FileOutput, Folder, GraduationCap, LayoutDashboard, ListChecks, LogOut, Settings, Shapes } from "lucide-react";

const adminNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/exam-bodies", label: "Add Exam Body", icon: Shapes },
  { to: "/classes", label: "Classes", icon: GraduationCap },
  { to: "/subjects", label: "Add Subject", icon: BookOpen },
  { to: "/chapters", label: "Add Chapter", icon: Folder },
  { to: "/question-bank", label: "Add Questions", icon: ListChecks },
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
          <button onClick={logout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 dark:bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-900 transition-colors">
            <LogOut size={14} />
            Logout
          </button>
        </aside>
        <main className="flex-1 min-w-0 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
