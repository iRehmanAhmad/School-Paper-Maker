import { Copy, Download, Edit, Trash2, X } from "lucide-react";

interface BulkActionsToolbarProps {
  selectedCount: number;
  totalCount: number;
  onClearSelection: () => void;
  onBulkEdit: () => void;
  onBulkDelete: () => void;
  onBulkDuplicate: () => void;
  onBulkExport: () => void;
  isProcessing?: boolean;
}

export function BulkActionsToolbar({
  selectedCount,
  totalCount,
  onClearSelection,
  onBulkEdit,
  onBulkDelete,
  onBulkDuplicate,
  onBulkExport,
  isProcessing = false,
}: BulkActionsToolbarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="sticky top-0 z-10 animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="rounded-2xl border-2 border-brand bg-gradient-to-r from-brand to-brand/90 p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Selection Info */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <span className="text-lg font-black text-white">{selectedCount}</span>
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                {selectedCount} of {totalCount} selected
              </p>
              <p className="text-xs text-white/80">Choose an action below</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBulkEdit}
              disabled={isProcessing}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-brand shadow-sm hover:bg-white/90 disabled:opacity-50 transition-all"
              title="Edit selected questions"
            >
              <Edit size={16} />
              <span className="hidden sm:inline">Edit</span>
            </button>

            <button
              type="button"
              onClick={onBulkDuplicate}
              disabled={isProcessing}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-emerald-600 shadow-sm hover:bg-white/90 disabled:opacity-50 transition-all"
              title="Duplicate selected questions"
            >
              <Copy size={16} />
              <span className="hidden sm:inline">Duplicate</span>
            </button>

            <button
              type="button"
              onClick={onBulkExport}
              disabled={isProcessing}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-blue-600 shadow-sm hover:bg-white/90 disabled:opacity-50 transition-all"
              title="Export selected questions to CSV"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              type="button"
              onClick={onBulkDelete}
              disabled={isProcessing}
              className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50 transition-all"
              title="Delete selected questions"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">Delete</span>
            </button>

            <div className="h-6 w-px bg-white/30" />

            <button
              type="button"
              onClick={onClearSelection}
              disabled={isProcessing}
              className="flex items-center gap-2 rounded-xl bg-white/20 px-3 py-2 text-sm font-bold text-white backdrop-blur-sm hover:bg-white/30 disabled:opacity-50 transition-all"
              title="Clear selection"
            >
              <X size={16} />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 backdrop-blur-sm">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span className="text-xs font-bold text-white">Processing...</span>
          </div>
        )}
      </div>
    </div>
  );
}
