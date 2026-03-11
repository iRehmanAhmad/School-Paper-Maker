import { useState } from "react";
import type { BloomLevel, Difficulty, QuestionLevel } from "@/types/domain";

type BulkEditField = "difficulty" | "bloom_level" | "question_level" | "chapter_id" | "topic_id";

interface BulkEditModalProps {
  selectedCount: number;
  onClose: () => void;
  onApply: (updates: Partial<BulkEditValues>) => Promise<void>;
  availableChapters?: Array<{ id: string; title: string }>;
  availableTopics?: Array<{ id: string; title: string }>;
}

export interface BulkEditValues {
  difficulty?: Difficulty;
  bloom_level?: BloomLevel;
  question_level?: QuestionLevel;
  chapter_id?: string;
  topic_id?: string;
}

const difficulties: Difficulty[] = ["easy", "medium", "hard"];
const blooms: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate"];
const questionLevels: Array<{ id: QuestionLevel; label: string }> = [
  { id: "exercise", label: "Exercise Question" },
  { id: "additional", label: "Additional Question" },
  { id: "past_papers", label: "Past Papers" },
  { id: "examples", label: "Exercise Examples" },
  { id: "conceptual", label: "Conceptual Question" },
];

export function BulkEditModal({
  selectedCount,
  onClose,
  onApply,
  availableChapters = [],
  availableTopics = [],
}: BulkEditModalProps) {
  const [selectedFields, setSelectedFields] = useState<Set<BulkEditField>>(new Set());
  const [values, setValues] = useState<BulkEditValues>({});
  const [isApplying, setIsApplying] = useState(false);

  function toggleField(field: BulkEditField) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
        // Clear value when unchecking
        setValues((v) => {
          const updated = { ...v };
          delete updated[field];
          return updated;
        });
      } else {
        next.add(field);
      }
      return next;
    });
  }

  function updateValue<K extends keyof BulkEditValues>(field: K, value: BulkEditValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleApply() {
    if (selectedFields.size === 0) {
      return;
    }

    const updates: Partial<BulkEditValues> = {};
    selectedFields.forEach((field) => {
      if (values[field] !== undefined) {
        updates[field] = values[field];
      }
    });

    setIsApplying(true);
    try {
      await onApply(updates);
      onClose();
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">Bulk Edit Questions</h3>
          <p className="text-sm text-slate-500">
            Update {selectedCount} selected question{selectedCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* Difficulty */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="bulk-difficulty"
                checked={selectedFields.has("difficulty")}
                onChange={() => toggleField("difficulty")}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              />
              <div className="flex-1">
                <label htmlFor="bulk-difficulty" className="block text-sm font-bold text-slate-700 mb-2">
                  Difficulty Level
                </label>
                <select
                  value={values.difficulty || ""}
                  onChange={(e) => updateValue("difficulty", e.target.value as Difficulty)}
                  disabled={!selectedFields.has("difficulty")}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">Select difficulty</option>
                  {difficulties.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Bloom's Level */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="bulk-bloom"
                checked={selectedFields.has("bloom_level")}
                onChange={() => toggleField("bloom_level")}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              />
              <div className="flex-1">
                <label htmlFor="bulk-bloom" className="block text-sm font-bold text-slate-700 mb-2">
                  Bloom's Taxonomy Level
                </label>
                <select
                  value={values.bloom_level || ""}
                  onChange={(e) => updateValue("bloom_level", e.target.value as BloomLevel)}
                  disabled={!selectedFields.has("bloom_level")}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">Select bloom level</option>
                  {blooms.map((b) => (
                    <option key={b} value={b}>
                      {b.charAt(0).toUpperCase() + b.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Question Level */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="bulk-question-level"
                checked={selectedFields.has("question_level")}
                onChange={() => toggleField("question_level")}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              />
              <div className="flex-1">
                <label htmlFor="bulk-question-level" className="block text-sm font-bold text-slate-700 mb-2">
                  Question Level
                </label>
                <select
                  value={values.question_level || ""}
                  onChange={(e) => updateValue("question_level", e.target.value as QuestionLevel)}
                  disabled={!selectedFields.has("question_level")}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">Select question level</option>
                  {questionLevels.map((ql) => (
                    <option key={ql.id} value={ql.id}>
                      {ql.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Chapter */}
            {availableChapters.length > 0 && (
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="bulk-chapter"
                  checked={selectedFields.has("chapter_id")}
                  onChange={() => toggleField("chapter_id")}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                />
                <div className="flex-1">
                  <label htmlFor="bulk-chapter" className="block text-sm font-bold text-slate-700 mb-2">
                    Move to Chapter
                  </label>
                  <select
                    value={values.chapter_id || ""}
                    onChange={(e) => updateValue("chapter_id", e.target.value)}
                    disabled={!selectedFields.has("chapter_id")}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm disabled:opacity-50"
                  >
                    <option value="">Select chapter</option>
                    {availableChapters.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Topic */}
            {availableTopics.length > 0 && (
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="bulk-topic"
                  checked={selectedFields.has("topic_id")}
                  onChange={() => toggleField("topic_id")}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                />
                <div className="flex-1">
                  <label htmlFor="bulk-topic" className="block text-sm font-bold text-slate-700 mb-2">
                    Assign to Topic
                  </label>
                  <select
                    value={values.topic_id || ""}
                    onChange={(e) => updateValue("topic_id", e.target.value)}
                    disabled={!selectedFields.has("topic_id")}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm disabled:opacity-50"
                  >
                    <option value="">Select topic (optional)</option>
                    {availableTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs text-blue-700">
              <strong>Note:</strong> Only checked fields will be updated. Unchecked fields will remain unchanged.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying || selectedFields.size === 0}
            className="rounded-xl bg-brand px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand/90 disabled:opacity-50"
          >
            {isApplying ? "Applying..." : `Apply to ${selectedCount} Question${selectedCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
