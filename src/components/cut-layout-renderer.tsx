"use client";

/* ============================================================
   Cut layout SVG renderers — pure presentational components

   Used by:
   - src/components/cutlist-extractor.tsx  (live preview during BOM extraction)
   - src/app/traveller/page.tsx            (suggested cut plan on traveller)

   Renders distinct PATTERNS (not every physical sheet). Each pattern shows
   one representative layout plus a caption "×N sheets · M passes · fill%".
   Every part carries its label AND its size. Kerf shows as the gap between
   parts. All measurements are viewBox units (mm); the container constrains
   width and the SVG scales. Compact mode: 2-up at ~88mm; non-compact 1-up.
   ============================================================ */

import type { LengthBin, MaterialSummary, SheetPattern, CutPlanPageChunk } from "@/lib/cut-layout";

function PatternLayout({
  pattern, sheetW, sheetH, index, compact = true,
}: {
  pattern: SheetPattern;
  sheetW: number;
  sheetH: number;
  index: number;
  compact?: boolean;
}) {
  const widthClass = compact ? "max-w-[88mm]" : "max-w-[180mm]";

  return (
    <div className="break-inside-avoid">
      <svg
        viewBox={`0 0 ${sheetW} ${sheetH}`}
        className={`w-full h-auto ${widthClass} border border-gray-700 bg-white`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Pattern index badge */}
        <text x="36" y="120" fontSize="105" fill="#bbb" fontWeight="bold">{index}</text>

        {pattern.placements.map((p, i) => {
          const cx = p.x + p.w / 2;
          const cy = p.y + p.h / 2;
          const short = Math.min(p.w, p.h);
          let labelSize = Math.max(40, Math.min(140, short * 0.30));
          let dimSize = labelSize * 0.6;
          // Ensure label + dims fit within the part height
          const totalH = labelSize + dimSize;
          if (totalH > p.h * 0.9) {
            const k = (p.h * 0.9) / totalH;
            labelSize *= k;
            dimSize *= k;
          }
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
                x={cx} y={cy - dimSize * 0.45}
                textAnchor="middle" dominantBaseline="central"
                fontSize={labelSize} fill="#003366" fontWeight="600"
              >
                {p.partDesc}{p.rotated ? " ↻" : ""}
              </text>
              <text
                x={cx} y={cy + labelSize * 0.55}
                textAnchor="middle" dominantBaseline="central"
                fontSize={dimSize} fill="#5a6b80"
              >
                {Math.round(p.w)}×{Math.round(p.h)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[7.5pt] text-muted mt-0.5 leading-tight">
        ×{pattern.count} sheet{pattern.count === 1 ? "" : "s"} · {pattern.passes} pass{pattern.passes === 1 ? "" : "es"}
        {pattern.stackCount > 1 ? ` · stack ${pattern.stackCount}` : ""}
        {" · "}{pattern.fillPct}% used
      </p>
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

/** Header line for a sheet material (mirrors buildCutPlanPages detail). */
function sheetDetail(s: MaterialSummary): string {
  const n = s.patterns?.length || 0;
  const wasteStr = s.waste_pct != null ? ` · ${s.waste_pct}% waste` : "";
  const stackStr = s.stack_count && s.stack_count > 1 ? ` · stack ${s.stack_count}` : "";
  const passStr = s.total_passes != null ? ` · ${s.total_passes} pass${s.total_passes === 1 ? "" : "es"}` : "";
  return `${s.sheets_needed} sheet${s.sheets_needed === 1 ? "" : "s"} in ${n} pattern${n === 1 ? "" : "s"}${passStr}${stackStr}${wasteStr}`;
}

/**
 * Renders the cut plan for a single material — header + pattern grid (or
 * timber bins). Used by the live preview (all patterns, scrolls).
 * Returns null if the material has no layout data.
 */
export function MaterialCutPlan({
  summary, compact = true,
}: {
  summary: MaterialSummary;
  compact?: boolean;
}) {
  const hasPatterns = !!(summary.patterns && summary.patterns.length > 0);
  const hasLengths = !!(summary.length_bins && summary.length_bins.length > 0);
  if (!hasPatterns && !hasLengths) return null;

  const detail = hasPatterns
    ? sheetDetail(summary)
    : `${summary.lengths_needed} × ${summary.standard_length_mm}mm${summary.waste_pct != null ? ` · ${summary.waste_pct}% waste` : ""}`;

  return (
    <div className="mt-2">
      <p className="text-[8pt] font-semibold text-foreground mb-1">
        {summary.material} — {detail}
      </p>

      {hasPatterns && (
        <div className={compact ? "grid grid-cols-2 gap-2" : "space-y-2"}>
          {summary.patterns!.map((pat, i) => (
            <PatternLayout
              key={i}
              pattern={pat}
              sheetW={summary.sheetW || 2440}
              sheetH={summary.sheetH || 1220}
              index={i + 1}
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
 * "Suggested cut plan" section header + each material's layout.
 * Used by the live preview in the BOM extractor (not paginated).
 */
export function CutPlanSection({
  summaries, title, compact = true,
}: {
  summaries: MaterialSummary[];
  title?: string;
  compact?: boolean;
}) {
  const withLayout = summaries.filter(s =>
    (s.patterns && s.patterns.length > 0) ||
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
 * Renders one cut plan chunk on the traveller — fits one printed page.
 * The traveller renders one <Page> wrapper per chunk so each gets full
 * header/footer chrome.
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
            Verify each sheet/length for defects — adjust if needed · identical sheets can be stacked
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
      {chunk.patterns && chunk.sheetW && chunk.sheetH && (
        <div className={compact ? "grid grid-cols-2 gap-2" : "space-y-2"}>
          {chunk.patterns.map((pat, i) => (
            <PatternLayout
              key={i}
              pattern={pat}
              sheetW={chunk.sheetW!}
              sheetH={chunk.sheetH!}
              index={i + 1}
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
