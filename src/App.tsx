import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";
import { useAppStore } from "@/store/useAppStore";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { BlueprintsPage } from "@/pages/BlueprintsPage";
import { ChaptersPage } from "@/pages/ChaptersPage";
import { ClassesPage } from "@/pages/ClassesPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ExamBodiesPage } from "@/pages/ExamBodiesPage";
import { LoginPage } from "@/pages/LoginPage";
import { PaperGeneratorPage } from "@/pages/PaperGeneratorPage";
import { QuestionBankPage } from "@/pages/QuestionBankPage";
import { ContentPipelinePage } from "@/pages/ContentPipelinePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SubjectsPage } from "@/pages/SubjectsPage";
import { TemplatesPage } from "@/pages/TemplatesPage";
import { ThemeProvider } from "@/components/ThemeProvider";

function PrivateRoute({ children }: { children: ReactElement }) {
  const profile = useAppStore((s) => s.profile);
  return profile ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: ReactElement }) {
  const profile = useAppStore((s) => s.profile);
  if (!profile) {
    return <Navigate to="/login" replace />;
  }
  if (profile.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function ToastHost() {
  const toasts = useAppStore((s) => s.toasts);
  const remove = useAppStore((s) => s.removeToast);
  return (
    <div className="fixed right-4 top-4 z-50 space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white shadow-lg ${t.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                remove(t.id);
              }}
              className="rounded bg-white/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-white/30"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => remove(t.id)}
            className="rounded bg-white/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-white/30"
          >
            Close
          </button>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ToastHost />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <AppLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route
              path="exam-bodies"
              element={
                <AdminRoute>
                  <ExamBodiesPage />
                </AdminRoute>
              }
            />
            <Route
              path="classes"
              element={
                <AdminRoute>
                  <ClassesPage />
                </AdminRoute>
              }
            />
            <Route
              path="subjects"
              element={
                <AdminRoute>
                  <SubjectsPage />
                </AdminRoute>
              }
            />
            <Route
              path="chapters"
              element={
                <AdminRoute>
                  <ChaptersPage />
                </AdminRoute>
              }
            />
            <Route
              path="question-bank"
              element={
                <AdminRoute>
                  <QuestionBankPage />
                </AdminRoute>
              }
            />
            <Route
              path="blueprints"
              element={
                <AdminRoute>
                  <BlueprintsPage />
                </AdminRoute>
              }
            />
            <Route
              path="content-pipeline"
              element={
                <AdminRoute>
                  <ContentPipelinePage />
                </AdminRoute>
              }
            />
            <Route path="paper-generator" element={<PaperGeneratorPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
