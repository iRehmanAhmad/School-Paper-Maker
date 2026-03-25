import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface PdfCanvasViewerProps {
  url: string;
  onPageChange?: (page: number) => void;
}

let cachedPdfjs: any = null;

async function loadPdfJs() {
  if (cachedPdfjs) return cachedPdfjs;
  const pdfjsLib = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/legacy/build/pdf.worker.mjs";
  cachedPdfjs = pdfjsLib;
  return pdfjsLib;
}

export function PdfCanvasViewer({ url, onPageChange }: PdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1.4);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderTasksRef = useRef<Map<number, any>>(new Map());
  const renderedRef = useRef<Set<number>>(new Set());

  // Load the PDF document
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setPdfDoc(null);
    setCurrentPage(1);
    setTotalPages(0);
    renderedRef.current.clear();
    renderTasksRef.current.forEach((t) => t.cancel?.());
    renderTasksRef.current.clear();

    (async () => {
      try {
        const pdfjsLib = await loadPdfJs();
        const doc = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(String(e?.message || "Failed to load PDF."));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  // Render pages on demand as they become visible
  useEffect(() => {
    if (!pdfDoc) return;
    
    // REDRAW EVERYTHING IF SCALE CHANGES
    renderedRef.current.clear();
    renderTasksRef.current.forEach((t) => t.cancel?.());
    renderTasksRef.current.clear();

    async function renderPage(pageNum: number) {
      if (renderedRef.current.has(pageNum)) return;
      const canvas = canvasRefs.current.get(pageNum);
      if (!canvas) return;

      // Cancel previous render task for this page
      renderTasksRef.current.get(pageNum)?.cancel?.();

      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const task = page.render({ canvasContext: ctx, viewport });
        renderTasksRef.current.set(pageNum, task);
        await task.promise;
        renderedRef.current.add(pageNum);
      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") {
          console.warn("Page render error:", e);
        }
      }
    }

    // Render visible pages
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = Number((entry.target as HTMLElement).dataset.page);
            if (!isNaN(pageNum)) renderPage(pageNum);
          }
        }
      },
      { root: containerRef.current, rootMargin: "200px" }
    );

    // Observe all page wrappers
    const wrappers = containerRef.current?.querySelectorAll("[data-page]");
    wrappers?.forEach((w) => observer.observe(w));

    return () => observer.disconnect();
  }, [pdfDoc, scale]);

  // Track current page via scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !totalPages) return;

    function onScroll() {
      const wrappers = container!.querySelectorAll("[data-page]");
      let visiblePage = 1;
      for (const wrapper of wrappers) {
        const rect = wrapper.getBoundingClientRect();
        const containerRect = container!.getBoundingClientRect();
        // Page is considered "current" when its top half is visible in the container
        if (rect.top <= containerRect.top + containerRect.height * 0.5) {
          visiblePage = Number((wrapper as HTMLElement).dataset.page) || 1;
        }
      }
      setCurrentPage(visiblePage);
      onPageChange?.(visiblePage);
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [totalPages, onPageChange]);

  function scrollToPage(page: number) {
    const target = containerRef.current?.querySelector(`[data-page="${page}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goTo(page: number) {
    const p = Math.max(1, Math.min(totalPages || 1, page));
    scrollToPage(p);
    setCurrentPage(p);
    onPageChange?.(p);
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Toolbar - Compacted */}
      <div className="flex-none flex items-center gap-1.5 px-2 py-1 bg-slate-900 border-b border-white/5 text-white text-[11px]">
        <button
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage <= 1}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-20 transition-all"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="font-bold tabular-nums opacity-90 mx-1">
          {currentPage} / {totalPages || "—"}
        </span>
        <button
          onClick={() => goTo(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 disabled:opacity-20 transition-all"
        >
          <ChevronRight size={14} />
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-white/5 rounded-lg px-1.5 py-0.5 border border-white/5">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
            onContextMenu={(e) => { e.preventDefault(); setScale(1.0); }}
            title="Right click to reset"
            className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/10 transition-all active:scale-95"
          >
            −
          </button>
          <span className="min-w-[32px] text-center font-medium opacity-60 scale-90">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
            className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/10 transition-all active:scale-95"
          >
            +
          </button>
        </div>
      </div>

      {/* PDF canvas area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto bg-slate-700 flex flex-col items-center gap-4 py-4">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-20 text-white/60">
            <Loader2 size={32} className="animate-spin" />
            <span className="text-sm font-medium">Loading PDF...</span>
          </div>
        )}
        {error && (
          <div className="py-20 px-8 text-center text-red-400 text-sm font-medium">{error}</div>
        )}
        {!loading && !error && pdfDoc && Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            data-page={pageNum}
            className="relative shadow-2xl bg-white"
          >
            <canvas
              ref={(el) => {
                if (el) canvasRefs.current.set(pageNum, el);
                else canvasRefs.current.delete(pageNum);
              }}
              className="block"
            />
            <span className="absolute bottom-2 right-2 text-[10px] font-bold text-slate-400 bg-white/80 px-1.5 py-0.5 rounded">
              {pageNum}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
