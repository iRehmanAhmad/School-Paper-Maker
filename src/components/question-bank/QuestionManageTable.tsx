import { EmptyState } from "@/components/EmptyState";
import { LoadingTable } from "@/components/LoadingState";
import type { Question } from "@/types/domain";

type Props = {
  chapterId: string;
  loadingQuestions: boolean;
  paginatedQuestions: Question[];
  selectedQuestionIds: string[];
  allVisibleSelected: boolean;
  selectedVisibleCount: number;
  topicTitleById: Map<string, string>;
  rowsCount: number;
  managePage: number;
  managePageSize: number;
  manageTotalPages: number;
  onToggleSelectAllVisible: (checked: boolean) => void;
  onToggleQuestionSelection: (questionId: string) => void;
  onEditQuestion: (question: Question, triggerEl: HTMLButtonElement | null) => void;
  onCloneQuestion: (question: Question) => void;
  onDeleteQuestion: (questionId: string) => void;
  onManagePageSizeChange: (size: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export function QuestionManageTable({
  chapterId,
  loadingQuestions,
  paginatedQuestions,
  selectedQuestionIds,
  allVisibleSelected,
  selectedVisibleCount,
  topicTitleById,
  rowsCount,
  managePage,
  managePageSize,
  manageTotalPages,
  onToggleSelectAllVisible,
  onToggleQuestionSelection,
  onEditQuestion,
  onCloneQuestion,
  onDeleteQuestion,
  onManagePageSizeChange,
  onPrevPage,
  onNextPage,
}: Props) {
  return (
    <>
      <div className="overflow-x-auto overflow-y-visible rounded-xl border border-slate-200 bg-white">
        {!chapterId && (
          <div className="border-b border-slate-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700">
            Select a chapter in Current Scope to load questions quickly.
          </div>
        )}
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => onToggleSelectAllVisible(e.target.checked)}
                  aria-label="Select all visible questions"
                />
              </th>
              <th className="w-36 px-3 py-3">Type</th>
              <th className="px-3 py-3">Question</th>
              <th className="w-40 px-3 py-3">Topic</th>
              <th className="w-40 px-3 py-3">Metadata</th>
              <th className="w-48 px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingQuestions && (
              <tr>
                <td colSpan={6} className="px-4 py-4">
                  <LoadingTable rows={8} columns={6} />
                </td>
              </tr>
            )}

            {!loadingQuestions && paginatedQuestions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4">
                  <EmptyState title="No questions found" description="Try another filter or add new questions in this chapter." />
                </td>
              </tr>
            )}

            {!loadingQuestions &&
              paginatedQuestions.map((q) => (
                <tr key={q.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedQuestionIds.includes(q.id)}
                      onChange={() => onToggleQuestionSelection(q.id)}
                      aria-label={`Select question ${q.id}`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-700">
                      {q.question_type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="group relative max-w-2xl">
                      <p className="line-clamp-2 text-slate-800">{q.question_text}</p>
                      <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[30rem] rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-2xl group-hover:block">
                        <p className="font-semibold text-slate-800">{q.question_text}</p>
                        <div className="mt-2 space-y-1 text-slate-600">
                          <p>
                            <span className="font-bold text-slate-700">Answer:</span> {q.correct_answer || "--"}
                          </p>
                          <p>
                            <span className="font-bold text-slate-700">Difficulty:</span> {q.difficulty}
                          </p>
                          <p>
                            <span className="font-bold text-slate-700">Bloom:</span> {q.bloom_level || "--"}
                          </p>
                          <p>
                            <span className="font-bold text-slate-700">Level:</span> {q.question_level}
                          </p>
                          <p>
                            <span className="font-bold text-slate-700">Topic:</span> {topicTitleById.get(q.topic_id || "") || "--"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-xs font-semibold text-slate-600">{topicTitleById.get(q.topic_id || "") || "No topic"}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="space-y-1">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          q.difficulty === "hard"
                            ? "bg-red-100 text-red-700"
                            : q.difficulty === "medium"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {q.difficulty}
                      </span>
                      <p className="text-[10px] font-semibold uppercase text-slate-500">{q.bloom_level || "no bloom"}</p>
                      <p className="text-[10px] font-semibold text-slate-500">{topicTitleById.get(q.topic_id || "") || "No topic"}</p>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        id={`edit-btn-${q.id}`}
                        type="button"
                        onClick={(e) => onEditQuestion(q, e.currentTarget)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onCloneQuestion(q)}
                        className="rounded-lg border border-brand/40 px-2 py-1 text-xs font-semibold text-brand hover:bg-brand/10"
                      >
                        Clone
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteQuestion(q.id)}
                        className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!loadingQuestions && rowsCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <div>
            Showing {rowsCount === 0 ? 0 : (managePage - 1) * managePageSize + 1}-{Math.min(managePage * managePageSize, rowsCount)} of {rowsCount}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              Rows
              <select value={managePageSize} onChange={(e) => onManagePageSizeChange(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1">
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={onPrevPage} disabled={managePage === 1} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50">
              Prev
            </button>
            <span className="font-semibold">Page {managePage} / {manageTotalPages}</span>
            <button type="button" onClick={onNextPage} disabled={managePage >= manageTotalPages} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      )}

      {selectedVisibleCount > 0 && <p className="text-xs text-slate-500">{selectedVisibleCount} visible row(s) currently selected.</p>}
    </>
  );
}
