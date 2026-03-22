import React from "react";

type GhostAutocompleteInputProps = {
  value: string;
  onChange: (value: string) => void;
  suggestion?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  autoComplete?: string;
};

export function GhostAutocompleteInput({
  value,
  onChange,
  suggestion,
  placeholder,
  className,
  inputClassName,
  onKeyDown,
  autoComplete = "off",
}: GhostAutocompleteInputProps) {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  const suggestionLower = (suggestion || "").toLowerCase();
  const canShow = Boolean(trimmed) && suggestion && suggestionLower.startsWith(lower) && suggestionLower !== lower;
  const suffix = canShow ? suggestion!.slice(trimmed.length) : "";

  return (
    <div className={`relative ${className || ""}`}>
      <div className="pointer-events-none absolute inset-0 flex items-center px-3 py-2">
        <span className="text-transparent">{value}</span>
        {suffix && <span className="text-slate-400">{suffix}</span>}
      </div>
      <input
        className={inputClassName || "w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-slate-900"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
    </div>
  );
}
