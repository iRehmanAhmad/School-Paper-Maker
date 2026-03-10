type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-3 rounded-2xl bg-slate-100 p-3 text-slate-500">
        <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 7h16M7 4h10a1 1 0 011 1v2H6V5a1 1 0 011-1zm0 3h10v12a1 1 0 01-1 1H8a1 1 0 01-1-1V7z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 11h6M9 15h4" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-slate-500">{description}</p>}
    </div>
  );
}
