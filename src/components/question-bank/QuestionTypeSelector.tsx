import type { BloomLevel, Difficulty, QuestionType } from "@/types/domain";

export type QuestionTypePreset = {
  label: string;
  type: QuestionType;
  diff: Difficulty;
  bloom: BloomLevel;
};

type Props = {
  presets: QuestionTypePreset[];
  activeType: QuestionType;
  onSelect: (preset: QuestionTypePreset) => void;
};

export function QuestionTypeSelector({ presets, activeType, onSelect }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">Question Type</p>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onSelect(preset)}
            className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
              activeType === preset.type
                ? "border-brand bg-brand text-white shadow-md dark:border-brand/70 dark:bg-brand/90"
                : "border-slate-300 bg-white text-slate-700 hover:border-brand/50 hover:bg-brand/5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand/60 dark:hover:bg-slate-700/70"
            }`}
          >
            {preset.label.replace(/_/g, " ")}
          </button>
        ))}
      </div>
    </div>
  );
}
