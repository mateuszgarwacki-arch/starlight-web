"use client";

// Small first-page PDF thumbnail. Renders inside an existing fixed-size
// container (caller is responsible for sizing). Uses the same pdf.js worker
// as PdfViewer so loads are deduplicated across the page.

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { FileText } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PdfThumbProps {
  url: string;
  width?: number;
}

export function PdfThumb({ url, width = 176 }: PdfThumbProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface-dim">
        <FileText className="h-10 w-10 text-faint" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-start justify-center overflow-hidden bg-white">
      <Document
        file={url}
        onLoadError={() => setFailed(true)}
        loading={<div className="w-full h-full bg-surface-mid animate-pulse" />}
        error={
          <div className="w-full h-full flex items-center justify-center bg-surface-dim">
            <FileText className="h-10 w-10 text-faint" />
          </div>
        }
        noData=""
      >
        <Page
          pageNumber={1}
          width={width}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          loading={<div className="w-full h-full bg-surface-mid animate-pulse" />}
        />
      </Document>
    </div>
  );
}

export default PdfThumb;
