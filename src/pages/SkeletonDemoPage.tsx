import { useState } from "react";
import {
  Skeleton,
  SkeletonCard,
  SkeletonDashboard,
  SkeletonForm,
  SkeletonList,
  SkeletonPaperPreview,
  SkeletonQuestionCard,
  SkeletonStats,
  SkeletonTable,
  SkeletonText,
} from "@/components/ui/skeleton";
import {
  LoadingDashboard,
  LoadingForm,
  LoadingPaper,
  LoadingQuestions,
  LoadingTable,
} from "@/components/LoadingState";

export function SkeletonDemoPage() {
  const [activeDemo, setActiveDemo] = useState<string>("all");

  const demos = [
    { id: "all", label: "All Skeletons" },
    { id: "dashboard", label: "Dashboard" },
    { id: "table", label: "Table" },
    { id: "form", label: "Form" },
    { id: "questions", label: "Questions" },
    { id: "paper", label: "Paper Preview" },
    { id: "stats", label: "Stats Cards" },
    { id: "list", label: "List" },
    { id: "card", label: "Card" },
    { id: "text", label: "Text" },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-6 shadow-sm">
        <h2 className="font-display text-3xl font-bold text-slate-900">Loading Skeleton Components</h2>
        <p className="mt-1 text-sm text-slate-500">
          Preview of all loading skeleton states used throughout the application
        </p>
      </div>

      {/* Demo Selector */}
      <div className="flex flex-wrap gap-2">
        {demos.map((demo) => (
          <button
            key={demo.id}
            onClick={() => setActiveDemo(demo.id)}
            className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
              activeDemo === demo.id
                ? "bg-brand text-white shadow-md"
                : "border border-slate-200 bg-white text-slate-700 hover:border-brand/50 hover:bg-brand/5"
            }`}
          >
            {demo.label}
          </button>
        ))}
      </div>

      {/* Demo Content */}
      <div className="space-y-8">
        {(activeDemo === "all" || activeDemo === "dashboard") && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-800">Dashboard Skeleton</h3>
            <LoadingDashboard />
          </div>
        )}

        {(activeDemo === "all" || activeDemo === "table") && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-800">Table Skeleton</h3>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <LoadingTable rows={8} columns={5} />
            </div>
          </div>
        )}

        {(activeDemo === "all" || activeDemo === "form") && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-800">Form Skeleton</h3>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <LoadingForm fields={5} />
            </div>
          </div>
        )}

        {(activeDemo === "all" || activeDemo === "questions") && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-800">Question Cards Skeleton</h3>
            <LoadingQuestions count={3} />
          </div>
        )}

        {(activeDemo === "all" || activeDemo === "paper") && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-800">Paper Preview Skeleton</h3>
            <LoadingPaper />
          </div>
        )}

        {(activeDemo === "all" || activeDemo === "stats") && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-800">Stats Cards Skeleton</h3>
            <SkeletonStats count={4} />
          </div>
        )}

        {(activeDemo === "all" || activeDemo === "list") && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-800">List Skeleton</h3>
            <SkeletonList items={5} />
          </div>
        )}

        {(activeDemo === "all" || activeDemo === "card") && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-800">Card Skeleton</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        )}

        {(activeDemo === "all" || activeDemo === "text") && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-800">Text Skeleton</h3>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <SkeletonText lines={1} />
              <SkeletonText lines={3} />
              <SkeletonText lines={5} />
            </div>
          </div>
        )}

        {/* Individual Components */}
        {activeDemo === "all" && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-800">Individual Skeleton Components</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold text-slate-500 mb-3">Basic Skeleton</p>
                <Skeleton className="h-12 w-full" />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold text-slate-500 mb-3">Circular Skeleton</p>
                <Skeleton className="h-16 w-16 rounded-full" />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold text-slate-500 mb-3">Button Skeleton</p>
                <Skeleton className="h-10 w-32 rounded-xl" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Usage Guide */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Usage Guide</h3>
        <div className="space-y-4 text-sm text-slate-600">
          <div>
            <p className="font-bold text-slate-800 mb-1">Import:</p>
            <code className="block bg-slate-100 p-3 rounded-lg text-xs">
              {`import { LoadingDashboard, LoadingTable, LoadingQuestions } from "@/components/LoadingState";`}
            </code>
          </div>
          <div>
            <p className="font-bold text-slate-800 mb-1">Basic Usage:</p>
            <code className="block bg-slate-100 p-3 rounded-lg text-xs whitespace-pre">
              {`{loading ? <LoadingTable rows={10} columns={5} /> : <YourTable />}`}
            </code>
          </div>
          <div>
            <p className="font-bold text-slate-800 mb-1">AdminTable with Loading:</p>
            <code className="block bg-slate-100 p-3 rounded-lg text-xs whitespace-pre">
              {`<AdminTable
  data={items}
  columns={columns}
  keyExtractor={(item) => item.id}
  loading={isLoading}
/>`}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
