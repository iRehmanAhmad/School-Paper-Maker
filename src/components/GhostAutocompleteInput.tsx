import React, { useEffect, useMemo, useRef, useState } from "react";

type GhostAutocompleteInputProps = {
  value: string;
  onChange: (value: string) => void;
  suggestion?: string;
  options?: string[];
  maxOptions?: number;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onClick?: React.MouseEventHandler<HTMLInputElement>;
  autoComplete?: string;
};

export function GhostAutocompleteInput({
  value,
  onChange,
  suggestion,
  options = [],
  maxOptions = 8,
  placeholder,
  className,
  inputClassName,
  onKeyDown,
  onFocus,
  onClick,
  autoComplete = "off",
}: GhostAutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  const suggestionLower = (suggestion || "").toLowerCase();
  const canShow = Boolean(trimmed) && suggestion && suggestionLower.startsWith(lower) && suggestionLower !== lower;
  const suffix = canShow ? suggestion!.slice(trimmed.length) : "";
  const filteredOptions = useMemo(() => {
    const unique = Array.from(new Set(options.map((item) => item.trim()).filter(Boolean)));
    if (!unique.length) return [];
    if (!lower) return unique.slice(0, maxOptions);
    const starts = unique.filter((item) => item.toLowerCase().startsWith(lower));
    const includes = unique.filter((item) => !item.toLowerCase().startsWith(lower) && item.toLowerCase().includes(lower));
    return [...starts, ...includes].slice(0, maxOptions);
  }, [options, lower, maxOptions]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const node = rootRef.current;
      if (!node) return;
      if (event.target instanceof Node && !node.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [value, isOpen]);

  function pickOption(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (!isOpen || filteredOptions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      pickOption(filteredOptions[activeIndex] || filteredOptions[0]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <div className="pointer-events-none absolute inset-0 flex items-center px-3 py-2">
        <span className="text-transparent">{value}</span>
        {suffix && <span className="text-slate-400">{suffix}</span>}
      </div>
      <input
        className={inputClassName || "w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-slate-900"}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={(e) => {
          if (filteredOptions.length > 0) setIsOpen(true);
          onFocus?.(e);
        }}
        onClick={(e) => {
          if (filteredOptions.length > 0) setIsOpen(true);
          onClick?.(e);
        }}
        onKeyDown={handleKeyDown}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      {isOpen && filteredOptions.length > 0 ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          {filteredOptions.map((item, index) => (
            <button
              key={item}
              type="button"
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                index === activeIndex ? "bg-brand/10 text-brand" : "text-slate-700 hover:bg-slate-100"
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickOption(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
