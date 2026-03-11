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
} from "./ui/skeleton";

type LoadingStateType =
  | "dashboard"
  | "table"
  | "form"
  | "list"
  | "card"
  | "stats"
  | "question"
  | "paper"
  | "text";

interface LoadingStateProps {
  type?: LoadingStateType;
  count?: number;
  rows?: number;
  columns?: number;
  fields?: number;
  items?: number;
  lines?: number;
}

export function LoadingState({
  type = "card",
  count,
  rows,
  columns,
  fields,
  items,
  lines,
}: LoadingStateProps) {
  switch (type) {
    case "dashboard":
      return <SkeletonDashboard />;
    case "table":
      return <SkeletonTable rows={rows} columns={columns} />;
    case "form":
      return <SkeletonForm fields={fields} />;
    case "list":
      return <SkeletonList items={items} />;
    case "card":
      return <SkeletonCard />;
    case "stats":
      return <SkeletonStats count={count} />;
    case "question":
      return (
        <div className="space-y-4">
          {Array.from({ length: count || 3 }).map((_, i) => (
            <SkeletonQuestionCard key={i} />
          ))}
        </div>
      );
    case "paper":
      return <SkeletonPaperPreview />;
    case "text":
      return <SkeletonText lines={lines} />;
    default:
      return <Skeleton className="h-32 w-full" />;
  }
}

// Specific loading components for common use cases
export function LoadingQuestions({ count = 5 }: { count?: number }) {
  return <LoadingState type="question" count={count} />;
}

export function LoadingTable({ rows = 10, columns = 5 }: { rows?: number; columns?: number }) {
  return <LoadingState type="table" rows={rows} columns={columns} />;
}

export function LoadingDashboard() {
  return <LoadingState type="dashboard" />;
}

export function LoadingForm({ fields = 5 }: { fields?: number }) {
  return <LoadingState type="form" fields={fields} />;
}

export function LoadingPaper() {
  return <LoadingState type="paper" />;
}
