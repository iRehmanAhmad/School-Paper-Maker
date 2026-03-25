import type { BloomLevel, Difficulty, QuestionType } from "@/types/domain";

type Props = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  manageDifficulty: Difficulty | "all";
  onManageDifficultyChange: (value: Difficulty | "all") => void;
  manageType: QuestionType | "all";
  onManageTypeChange: (value: QuestionType | "all") => void;
  manageBloom: BloomLevel | "all";
  onManageBloomChange: (value: BloomLevel | "all") => void;
  difficultyLevels: Difficulty[];
  questionTypes: QuestionType[];
  blooms: BloomLevel[];
};

export function QuestionManageFilters({
  searchQuery,
  onSearchQueryChange,
  manageDifficulty,
  onManageDifficultyChange,
  manageType,
  onManageTypeChange,
  manageBloom,
  onManageBloomChange,
  difficultyLevels,
  questionTypes,
  blooms,
}: Props) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="block text-xs font-semibold text-slate-600">
        Search Questions
        <input
          type="text"
          placeholder="Search questions by text..."
          className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
        />
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Difficulty</p>
          <div className="flex flex-wrap gap-2">
            {(["all", ...difficultyLevels] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onManageDifficultyChange(value)}
                className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${manageDifficulty === value ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Question Type</p>
          <div className="flex flex-wrap gap-2">
            {(["all", ...questionTypes] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onManageTypeChange(value)}
                className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${manageType === value ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {value.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Bloom Level</p>
          <div className="flex flex-wrap gap-2">
            {(["all", ...blooms] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onManageBloomChange(value)}
                className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${manageBloom === value ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
