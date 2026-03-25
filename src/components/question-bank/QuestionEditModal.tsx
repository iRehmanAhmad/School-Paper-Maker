import type { BloomLevel, Difficulty, Question, QuestionLevel } from "@/types/domain";

export type EditQuestionDraft = {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  difficulty: Difficulty;
  bloom_level: BloomLevel | "";
  question_level: QuestionLevel;
  explanation: string;
  diagram_url: string;
};

type Props = {
  question: Question | null;
  draft: EditQuestionDraft | null;
  difficultyLevels: Difficulty[];
  blooms: BloomLevel[];
  questionLevels: Array<{ id: QuestionLevel; label: string }>;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  onDraftChange: (next: EditQuestionDraft) => void;
};

export function QuestionEditModal({
  question,
  draft,
  difficultyLevels,
  blooms,
  questionLevels,
  isSaving,
  onClose,
  onSave,
  onDraftChange,
}: Props) {
  if (!question || !draft) {
    return null;
  }

  const updateDraft = (patch: Partial<EditQuestionDraft>) => {
    onDraftChange({ ...draft, ...patch });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl font-bold text-slate-900">Edit Question</h3>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type: {question.question_type.replace("_", " ")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="space-y-4">
          <label className="block text-xs font-semibold text-slate-600">
            Question Text
            <textarea
              rows={4}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={draft.question_text}
              onChange={(e) => updateDraft({ question_text: e.target.value })}
            />
          </label>

          {question.question_type === "mcq" && (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                Option A
                <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draft.option_a} onChange={(e) => updateDraft({ option_a: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Option B
                <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draft.option_b} onChange={(e) => updateDraft({ option_b: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Option C
                <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draft.option_c} onChange={(e) => updateDraft({ option_c: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Option D
                <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draft.option_d} onChange={(e) => updateDraft({ option_d: e.target.value })} />
              </label>
            </div>
          )}

          {question.question_type === "true_false" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              True/False options are fixed as Option A = True and Option B = False.
            </div>
          )}

          {question.question_type === "diagram" && (
            <label className="block text-xs font-semibold text-slate-600">
              Diagram URL
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={draft.diagram_url}
                onChange={(e) => updateDraft({ diagram_url: e.target.value })}
              />
            </label>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              Correct Answer
              {question.question_type === "mcq" ? (
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={draft.correct_answer}
                  onChange={(e) => updateDraft({ correct_answer: e.target.value })}
                >
                  {["A", "B", "C", "D"].map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              ) : question.question_type === "true_false" ? (
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={draft.correct_answer}
                  onChange={(e) => updateDraft({ correct_answer: e.target.value })}
                >
                  {["True", "False"].map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={draft.correct_answer}
                  onChange={(e) => updateDraft({ correct_answer: e.target.value })}
                />
              )}
            </label>

            <label className="text-xs font-semibold text-slate-600">
              Difficulty
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={draft.difficulty}
                onChange={(e) => updateDraft({ difficulty: e.target.value as Difficulty })}
              >
                {difficultyLevels.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-600">
              Bloom Level
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={draft.bloom_level}
                onChange={(e) => updateDraft({ bloom_level: e.target.value as BloomLevel | "" })}
              >
                <option value="">-- None --</option>
                {blooms.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-600">
              Question Level
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={draft.question_level}
                onChange={(e) => updateDraft({ question_level: e.target.value as QuestionLevel })}
              >
                {questionLevels.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs font-semibold text-slate-600">
            Explanation / Rubric Hint
            <textarea
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={draft.explanation}
              onChange={(e) => updateDraft({ explanation: e.target.value })}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
