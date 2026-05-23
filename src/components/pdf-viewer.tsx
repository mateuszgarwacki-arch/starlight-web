"use client";

// Reusable full-screen PDF viewer.
// Loads PDF via pdf.js (react-pdf). Worker is self-hosted at /pdf.worker.min.mjs
// (copied from node_modules/pdfjs-dist/build at install time). Keep this
// component free of project-specific concerns so it can be reused anywhere
// in the system — just pass it a URL.

import { useState, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Download as DownloadIcon, Loader2,
} from "lucide-react";

// Same-origin worker — avoids CORS and external CDN dependency.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PdfViewerProps {
  url: string;
  fileName?: string;
  onClose: () => void;
  onDownload?: () => void;
}

export function PdfViewer({ url, fileName, onClose, onDownload }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  // 'fit' = width-based auto-fit to viewport; number = explicit zoom multiplier
  const [scale, setScale] = useState<number | "fit">("fit");
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [error, setError] = useState<string | null>(null);

  // Capture viewport width on client so SSR-safe + reactive to resize
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setPageNumber(p => Math.min(numPages || p, p + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPageNumber(p => Math.max(1, p - 1));
      } else if (e.key === "+" || e.key === "=") {
        setScale(s => (typeof s === "number" ? Math.min(3, s + 0.25) : 1.25));
      } else if (e.key === "-") {
        setScale(s => (typeof s === "number" ? Math.max(0.5, s - 0.25) : 0.75));
      } else if (e.key === "0") {
        setScale("fit");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numPages, onClose]);

  const onDocLoad = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setError(null);
  }, []);

  const onDocError = useCallback((err: Error) => {
    setError(err.message || "Failed to load PDF");
  }, []);

  const fitWidth = Math.min(viewportWidth - 64, 1400);

  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col" role="dialog" aria-modal="true">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/60 text-white shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{fileName || "PDF"}</span>
          {numPages > 0 && (
            <span className="text-xs text-white/60 shrink-0 hidden sm:inline">
              {pageNumber} / {numPages}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setScale(s => (typeof s === "number" ? Math.max(0.5, s - 0.25) : 0.75))}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            aria-label="Zoom out"
            title="Zoom out (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={() => setScale("fit")}
            className="px-2 py-1 text-xs hover:bg-white/10 rounded transition-colors min-w-[3.5rem]"
            aria-label="Fit to width"
            title="Fit to width (0)"
          >
            {scale === "fit" ? "Fit" : `${Math.round((scale as number) * 100)}%`}
          </button>
          <button
            onClick={() => setScale(s => (typeof s === "number" ? Math.min(3, s + 0.25) : 1.25))}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          {onDownload && (
            <button
              onClick={onDownload}
              className="p-1.5 hover:bg-white/10 rounded transition-colors ml-1"
              aria-label="Download"
              title="Download"
            >
              <DownloadIcon className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded transition-colors ml-1"
            aria-label="Close"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* PDF content */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4">
        {error ? (
          <div className="text-white/80 text-center mt-12 max-w-md">
            <p className="text-sm">Couldn&apos;t load PDF</p>
            <p className="text-xs text-white/50 mt-1">{error}</p>
          </div>
        ) : (
          <Document
            file={url}
            onLoadSuccess={onDocLoad}
            onLoadError={onDocError}
            loading={
              <div className="text-white/80 text-sm flex items-center gap-2 mt-12">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading PDF…
              </div>
            }
            className="flex flex-col items-center"
          >
            <Page
              pageNumber={pageNumber}
              {...(scale === "fit" ? { width: fitWidth } : { scale: scale as number })}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-2xl"
              loading={
                <div className="text-white/60 text-sm flex items-center gap-2 mt-12">
                  <Loader2 className="h-4 w-4 animate-spin" /> Rendering page…
                </div>
              }
            />
          </Document>
        )}
      </div>

      {/* Bottom nav — only if multi-page */}
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3 px-4 py-2 bg-black/60 text-white shrink-0">
          <button
            onClick={() => setPageNumber(p => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="p-1.5 hover:bg-white/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Previous page"
            title="Previous page (←)"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="number"
              value={pageNumber}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) setPageNumber(Math.max(1, Math.min(numPages, v)));
              }}
              className="w-14 px-2 py-1 bg-white/10 rounded text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              min={1}
              max={numPages}
              aria-label="Page number"
            />
            <span className="text-white/60">/ {numPages}</span>
          </div>
          <button
            onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="p-1.5 hover:bg-white/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next page"
            title="Next page (→)"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default PdfViewer;
