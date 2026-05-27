"use client";

/* ============================================================
   Cut layout SVG renderers — pure presentational components

   Used by:
   - src/components/cutlist-extractor.tsx  (live preview during BOM extraction)
   - src/app/traveller/page.tsx            (suggested cut plan on traveller)

   All measurements are in viewBox units (mm). The container constrains
   the rendered width; SVGs scale proportionally. Compact mode targets
   2-up sheets at ~88mm; non-compact targets 1-up at ~180mm.
   ============================================================ */

import type { Placement, LengthBin, MaterialSummary, CutPlanPageChunk } from "@/lib/cut-layout";
import { parseSheetSize } from "@/lib/cut-layout";

function SheetLayout({
  placements, sheetW, sheetH, sheetIdx, compact = true,
}: {
  placements: Placement[];
  sheetW: number;
  sheetH: number;
  sheetIdx: number;
  compact?: boolean;
}) {
  const my = placements.filter(p => p.sheetIdx === sheetIdx);
  const widthClass = compact ? "max-w-[88mm]" : "max-w-[180mm]";
  const labelMin = compact ? 60 : 40;
  const labelMax = compact ? 140 : 100;

  return (
    <div className="break-inside-avoid">
      <svg
        viewBox={`0 0 ${sheetW} ${sheetH}`}
        className={`w-full h-auto ${widthClass} border border-gray-700 bg-white`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Sheet number badge */}
        <text x="40" y="130" fontSize="110" fill="#999" fontWeight="bold">
          {sheetIdx + 1}
        </text>

        {my.map((p, i) => {
          const labelSize = Math.max(labelMin, Math.min(labelMax, Math.min(p.w, p.h) / 4.5));
          const showDims = Math.min(p.w, p.h) > 250;
          return (
            <g key={i}>
              <rect
                x={p.x} y={p.y}
                width={p.w} height={p.h}
                fill="rgba(0,102,204,0.08)"
                stroke="#0066cc"
                strokeWidth={3}
              />
              <text
                x={p.x + p.w / 2}
                y={p.y + p.h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={labelSize}
                fill="#003366"
                fontWeight="600"
              >
                {p.partDesc}{p.rotated ? " ↻" : ""}
              </text>
              {showDims && (
                <text
                  x={p.x + 30} y={p.y + 90}
                  fontSize="55"
                  fill="#666"
                >
                  {Math.round(p.w)}×{Math.round(p.h)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LengthBinRow({ bin }: { bin: LengthBin }) {
  return (
    <div className="break-inside-avoid mb-1">
      <p className="text-[8pt] mb-0.5 text-muted">
        Length {bin.stockIdx + 1} ({bin.stockLength}mm) — uses {bin.used}mm, waste {bin.waste}mm
      </p>
      <svg
        viewBox={`0 0 ${bin.stockLength} 80`}
        className="w-full max-w-[180mm] h-[6mm] border border-gray-700"
        preserveAspectRatio="none"
      >
        {bin.pieces.map((p, i) => {
          const fontSize = Math.max(30, Math.min(65, p.length / 7));
          return (
            <g key={i}>
              <rect
                x={p.offset} y={0}
                width={p.length} height={80}
                fill="rgba(0,102,204,0.08)"
                stroke="#0066cc"
                strokeWidth={3}
              />
              <text
                x={p.offset + p.length / 2}
                y={45}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={fontSize}
                fill="#003366"
                fontWeight="600"
              >
                {p.partDesc} {p.length}
              </text>
            </g>
          );
        })}
        {bin.waste > 0 && (
          <g>
            <rect
              x={bin.used} y={0}
              width={bin.waste} height={80}
              fill="rgba(150,150,150,0.15)"
              stroke="#999"
              strokeWidth={2}
              strokeDasharray="20,10"
            />
            <text
              x={bin.used + bin.waste / 2}
              y={45}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={40}
              fill="#999"
            >
              waste
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/**
 * Renders the cut plan for a single material — header line + layout grid.
 * Returns null if the material has no layout data (e.g. fabric, hardware).
 */
export function MaterialCutPlan({
  summary, compact = true,
}: {
  summary: MaterialSummary;
  compact?: boolean;
}) {
  const hasSheets = !!(summary.sheet_placements && summary.sheet_placements.length > 0 && summary.sheets_needed);
  const hasLengths = !!(summary.length_bins && summary.length_bins.length > 0);
  if (!hasSheets && !hasLengths) return null;

  const sheetSize = parseSheetSize(summary.standard_sheet_size);
  const sheetW = sheetSize?.w || 2440;
  const sheetH = sheetSize?.h || 1220;

  const headerDetail = hasSheets
    ? `${summary.sheets_needed} sheet${summary.sheets_needed! > 1 ? "s" : ""} of ${summary.standard_sheet_size}mm`
    : `${summary.lengths_needed} × ${summary.standard_length_mm}mm`;

  return (
    <div className="mt-2">
      <p className="text-[8pt] font-semibold text-foreground mb-1 break-after-avoid">
        {summary.material} — {headerDetail}
        {summary.waste_pct != null && (
          <span className="text-muted font-normal"> · {summary.waste_pct}% waste</span>
        )}
      </p>

      {hasSheets && (
        <div className={compact ? "grid grid-cols-2 gap-2" : "space-y-2"}>
          {Array.from({ length: summary.sheets_needed! }).map((_, sIdx) => (
            <SheetLayout
              key={sIdx}
              placements={summary.sheet_placements!}
              sheetW={sheetW}
              sheetH={sheetH}
              sheetIdx={sIdx}
              compact={compact}
            />
          ))}
        </div>
      )}

      {hasLengths && (
        <div className="mt-1">
          {summary.length_bins!.map(bin => (
            <LengthBinRow key={bin.stockIdx} bin={bin} />
          ))}
        </div>
      )}

      {summary.anomalies && summary.anomalies.length > 0 && (
        <div className="mt-1">
          {summary.anomalies.map((a, i) => (
            <p key={i} className="text-[8pt] text-starlight-amber">⚠ {a}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a "Suggested cut plan" section header + each material's layout.
 * Materials without layout data (fabric, hardware, etc.) are silently skipped.
 */
export function CutPlanSection({
  summaries, title, compact = true,
}: {
  summaries: MaterialSummary[];
  title?: string;
  compact?: boolean;
}) {
  const withLayout = summaries.filter(s =>
    (s.sheet_placements && s.sheet_placements.length > 0) ||
    (s.length_bins && s.length_bins.length > 0)
  );
  if (withLayout.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
        {title || "Suggested cut plan"}
        <span className="ml-2 font-normal text-faint normal-case tracking-normal text-[9px]">
          Verify each sheet/length for defects — adjust if needed
        </span>
      </p>
      {withLayout.map(s => (
        <MaterialCutPlan key={s.material} summary={s} compact={compact} />
      ))}
    </div>
  );
}

/**
 * Renders one cut plan chunk — fits comfortably on one printed page.
 * For multi-page cut plans (e.g. 33-sheet OSB), the traveller renders
 * one <Page> wrapper per chunk so each gets proper header/footer chrome.
 */
export function CutPlanPage({
  chunk, compact = true,
}: {
  chunk: CutPlanPageChunk;
  compact?: boolean;
}) {
  return (
    <div className="space-y-2 text-[13px]">
      {chunk.isFirst && (
        <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
          Suggested cut plan
          <span className="ml-2 font-normal text-faint normal-case tracking-normal text-[9px]">
            Verify each sheet/length for defects — adjust if needed
          </span>
        </p>
      )}
      <p className="text-[8pt] font-semibold text-foreground">
        {chunk.material} — {chunk.materialDetail}
      </p>
      {chunk.anomalies && chunk.anomalies.length > 0 && (
        <div>
          {chunk.anomalies.map((a, i) => (
            <p key={i} className="text-[8pt] text-starlight-amber">⚠ {a}</p>
          ))}
        </div>
      )}
      {chunk.sheetIndices && chunk.placements && chunk.sheetW && chunk.sheetH && (
        <div className={compact ? "grid grid-cols-2 gap-2" : "space-y-2"}>
          {chunk.sheetIndices.map(sIdx => (
            <SheetLayout
              key={sIdx}
              placements={chunk.placements!}
              sheetW={chunk.sheetW!}
              sheetH={chunk.sheetH!}
              sheetIdx={sIdx}
              compact={compact}
            />
          ))}
        </div>
      )}
      {chunk.bins && (
        <div className="space-y-1">
          {chunk.bins.map(bin => (
            <LengthBinRow key={bin.stockIdx} bin={bin} />
          ))}
        </div>
      )}
    </div>
  );
}
