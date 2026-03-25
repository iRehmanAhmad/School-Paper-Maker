export type ContextBreadcrumbItem = {
  label: string;
  value: string;
  onSelect?: () => void;
  onClear?: () => void;
  selected?: boolean;
  count?: number;
};

type ContextBreadcrumbsProps = {
  items: ContextBreadcrumbItem[];
};

export function ContextBreadcrumbs({ items }: ContextBreadcrumbsProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current Scope</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {items.map((item, index) => {
          const chipClass = item.selected
            ? "border-brand/40 bg-brand/10 text-brand"
            : "border-slate-200 bg-slate-100 text-slate-700";
          return (
            <div key={item.label} className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wide text-slate-500">{item.label}</span>
              <div className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-1 ${chipClass}`}>
                {item.onSelect ? (
                  <button
                    type="button"
                    onClick={item.onSelect}
                    className="rounded-full px-2 py-0.5 font-semibold hover:bg-white/70"
                  >
                    {item.value}
                  </button>
                ) : (
                  <span className="px-2 py-0.5 font-semibold">{item.value}</span>
                )}
                {typeof item.count === "number" && (
                  <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold">{item.count}</span>
                )}
                {item.selected && item.onClear && (
                  <button
                    type="button"
                    onClick={item.onClear}
                    aria-label={`Clear ${item.label}`}
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-white/80 hover:text-red-600"
                  >
                    x
                  </button>
                )}
              </div>
              {index < items.length - 1 && <span className="text-slate-400">-&gt;</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
