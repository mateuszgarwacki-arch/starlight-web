/* ============================================================
   Cut layout shared library — pure functions + types

   Used by:
   - src/components/cutlist-extractor.tsx  (live preview during BOM extraction)
   - src/app/traveller/page.tsx            (suggested cut plan on traveller)

   Algorithms:
   - binPackLengths()   1D First-Fit Decreasing for timber lengths
   - guillotinePack()   2D guillotine packing for sheets, Best Short Side
                        Fit + Shorter Axis Split heuristics (Jylänki).

   Both algorithms now CAPTURE placements (which piece goes where) rather
   than just returning counts, so the layout can be visualised.
   ============================================================ */

export interface ExtractedLine {
  line_number: number;
  /** Source-document label (e.g. "P1", "A.2"). Null when source has no labels. */
  part_label?: string | null;
  description: string;
  material: string;
  material_category: string;
  length_mm: number | null;
  width_mm: number | null;
  thickness_mm: number | null;
  quantity: number;
  unit: string;
  notes: string | null;
}

export interface CatalogueMat {
  material_id: number;
  material_name: string;
  standard_length: number | null;
  standard_sheet_size: string | null;
  unit: string;
  current_unit_cost: number | null;
  material_category: number | null;
}

export interface PartRect { w: number; h: number; desc: string; }
interface FreeRect { x: number; y: number; w: number; h: number; }

export interface Placement {
  sheetIdx: number;
  x: number;
  y: number;
  /** Post-rotation width (rendered). */
  w: number;
  /** Post-rotation height (rendered). */
  h: number;
  rotated: boolean;
  partDesc: string;
}

export interface LengthBin {
  stockIdx: number;
  stockLength: number;
  used: number;
  waste: number;
  pieces: { length: number; partDesc: string; offset: number }[];
}

export interface MaterialSummary {
  material: string;
  material_category: string;
  total_parts: number;
  sheets_needed?: number;
  lengths_needed?: number;
  total_linear_mm?: number;
  standard_sheet_size?: string;
  standard_length_mm?: number;
  waste_pct?: number;
  piece_lengths?: number[];
  anomalies?: string[];
  /** 2D placements when material_category === "Sheet". */
  sheet_placements?: Placement[];
  /** 1D bins when material_category === "Timber". */
  length_bins?: LengthBin[];
  /** UI state — selected for "Add to BOM". Not persisted. */
  _selected?: boolean;
  /** UI state — chosen catalogue material (override or auto-match). Not persisted. */
  _catalogueMatch?: CatalogueMat | null;
}

/** Short label for a part on cut plan diagrams. Prefers source label, falls back to truncated description. */
export function labelFor(p: ExtractedLine): string {
  return ((p.part_label || p.description || "") + "").slice(0, 12);
}

/* ============================================================
   1D bin packing — First-Fit Decreasing
   ============================================================ */

export function binPackLengths(
  pieces: { length: number; desc: string }[],
  standardLength: number,
): LengthBin[] {
  const sorted = [...pieces].sort((a, b) => b.length - a.length);
  const bins: LengthBin[] = [];

  for (const piece of sorted) {
    let placed = false;
    for (const bin of bins) {
      if (bin.used + piece.length <= standardLength) {
        bin.pieces.push({ length: piece.length, partDesc: piece.desc, offset: bin.used });
        bin.used += piece.length;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bins.push({
        stockIdx: bins.length,
        stockLength: standardLength,
        used: piece.length,
        waste: 0,
        pieces: [{ length: piece.length, partDesc: piece.desc, offset: 0 }],
      });
    }
  }

  for (const bin of bins) bin.waste = standardLength - bin.used;
  return bins;
}

/* ============================================================
   2D guillotine bin packing
   Best Short Side Fit + Shorter Axis Split rule
   ============================================================ */

function findBestFit(freeRects: FreeRect[], pw: number, ph: number): number {
  let bestIdx = -1;
  let bestShortSide = Infinity;
  for (let i = 0; i < freeRects.length; i++) {
    const r = freeRects[i];
    if (pw <= r.w && ph <= r.h) {
      const shortSide = Math.min(r.w - pw, r.h - ph);
      if (shortSide < bestShortSide) {
        bestShortSide = shortSide;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}

function splitRect(freeRects: FreeRect[], idx: number, pw: number, ph: number) {
  const r = freeRects[idx];
  freeRects.splice(idx, 1);
  const remainW = r.w - pw;
  const remainH = r.h - ph;
  if (remainW > 0 || remainH > 0) {
    if (remainW < remainH) {
      if (remainW > 0) freeRects.push({ x: r.x + pw, y: r.y, w: remainW, h: ph });
      if (remainH > 0) freeRects.push({ x: r.x, y: r.y + ph, w: r.w, h: remainH });
    } else {
      if (remainW > 0) freeRects.push({ x: r.x + pw, y: r.y, w: remainW, h: r.h });
      if (remainH > 0) freeRects.push({ x: r.x, y: r.y + ph, w: pw, h: remainH });
    }
  }
  mergeFreeRects(freeRects);
}

function mergeFreeRects(rects: FreeRect[]) {
  for (let i = rects.length - 1; i >= 0; i--) {
    for (let j = 0; j < rects.length; j++) {
      if (i === j || i >= rects.length) continue;
      const a = rects[i], b = rects[j];
      if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
        rects.splice(i, 1);
        break;
      }
    }
  }
}

export function guillotinePack(
  parts: PartRect[],
  sheetW: number,
  sheetH: number,
): { sheets: number; placements: Placement[] } {
  const sorted = [...parts].sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const sheetsFree: FreeRect[][] = [];
  const placements: Placement[] = [];

  const tryPlace = (free: FreeRect[], sheetIdx: number, p: PartRect): boolean => {
    let idx = findBestFit(free, p.w, p.h);
    let rotated = false;
    if (idx === -1 && p.w !== p.h) {
      idx = findBestFit(free, p.h, p.w);
      rotated = true;
    }
    if (idx === -1) return false;
    const r = free[idx];
    const placedW = rotated ? p.h : p.w;
    const placedH = rotated ? p.w : p.h;
    placements.push({ sheetIdx, x: r.x, y: r.y, w: placedW, h: placedH, rotated, partDesc: p.desc });
    splitRect(free, idx, placedW, placedH);
    return true;
  };

  for (const part of sorted) {
    let placed = false;
    for (let s = 0; s < sheetsFree.length; s++) {
      if (tryPlace(sheetsFree[s], s, part)) { placed = true; break; }
    }
    if (!placed) {
      const newSheet: FreeRect[] = [{ x: 0, y: 0, w: sheetW, h: sheetH }];
      tryPlace(newSheet, sheetsFree.length, part);
      sheetsFree.push(newSheet);
    }
  }

  return { sheets: sheetsFree.length, placements };
}

/* ============================================================
   Sheet size parser
   ============================================================ */

export function parseSheetSize(sizeStr?: string | null): { w: number; h: number } | null {
  if (!sizeStr) return null;
  const m = sizeStr.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (m) return { w: parseInt(m[1]), h: parseInt(m[2]) };
  return null;
}

/* ============================================================
   Build material summary from extracted parts
   ============================================================ */

export function buildMaterialSummary(
  parts: ExtractedLine[],
  catalogueMaterials: CatalogueMat[],
): MaterialSummary[] {
  const groups: Record<string, { parts: ExtractedLine[]; category: string }> = {};
  for (const p of parts) {
    const key = (p.material || "unknown").toLowerCase();
    if (!groups[key]) groups[key] = { parts: [], category: (p.material_category || "Other").toLowerCase() };
    groups[key].parts.push(p);
  }

  return Object.entries(groups).map(([matKey, { parts: matParts, category }]) => {
    const materialName = matParts[0]?.material || matKey;
    const catMat = catalogueMaterials.find(m =>
      (m.material_name || "").toLowerCase() === matKey ||
      matKey.includes((m.material_name || "").toLowerCase()) ||
      (m.material_name || "").toLowerCase().includes(matKey)
    );
    const anomalies: string[] = [];
    const totalParts = matParts.reduce((s, p) => s + (p.quantity || 1), 0);

    if (category === "timber") {
      const pieces: { length: number; desc: string }[] = [];
      for (const p of matParts) {
        const l = p.length_mm || 0;
        if (l > 0) {
          for (let i = 0; i < (p.quantity || 1); i++) {
            pieces.push({ length: l, desc: labelFor(p) });
          }
        }
      }
      const totalLinearMm = pieces.reduce((a, b) => a + b.length, 0);
      const stdLen = catMat?.standard_length || 4800;
      const bins = pieces.length > 0 ? binPackLengths(pieces, stdLen) : [];
      const lengthsNeeded = bins.length > 0
        ? bins.length
        : Math.max(1, Math.ceil(totalLinearMm / stdLen));
      const usedMm = lengthsNeeded * stdLen;
      const waste = usedMm > 0 ? Math.round((1 - totalLinearMm / usedMm) * 100) : 0;

      return {
        material: materialName,
        material_category: "Timber",
        total_parts: totalParts,
        total_linear_mm: totalLinearMm,
        lengths_needed: lengthsNeeded,
        standard_length_mm: stdLen,
        waste_pct: waste,
        piece_lengths: pieces.map(p => p.length),
        length_bins: bins,
        anomalies,
        _selected: true,
        _catalogueMatch: catMat || null,
      };
    }

    if (category === "sheet") {
      const catSheet = parseSheetSize(catMat?.standard_sheet_size);
      const sheetW = catSheet?.w || 2440;
      const sheetH = catSheet?.h || 1220;

      const rects: PartRect[] = [];
      for (const p of matParts) {
        const l = p.length_mm || 0;
        const w = p.width_mm || 0;
        if (l > 0 && w > 0) {
          for (let i = 0; i < (p.quantity || 1); i++) {
            rects.push({ w: l, h: w, desc: labelFor(p) });
          }
        }
      }

      for (const p of matParts) {
        const l = p.length_mm || 0;
        const w = p.width_mm || 0;
        const fits = (l <= sheetW && w <= sheetH) || (l <= sheetH && w <= sheetW);
        if (l > 0 && w > 0 && !fits) {
          const msg = `${p.description}: ${l}×${w}mm does not fit on ${sheetW}×${sheetH}mm sheet in any orientation`;
          if (!anomalies.includes(msg)) anomalies.push(msg);
        }
      }

      const { sheets, placements } = guillotinePack(rects, sheetW, sheetH);
      const sheetArea = sheetW * sheetH;
      const partArea = rects.reduce((s, r) => s + r.w * r.h, 0);
      const wastePct = sheets > 0 ? Math.round((1 - partArea / (sheets * sheetArea)) * 100) : 0;

      return {
        material: materialName,
        material_category: "Sheet",
        total_parts: totalParts,
        sheets_needed: sheets,
        standard_sheet_size: `${sheetW}x${sheetH}`,
        waste_pct: wastePct,
        sheet_placements: placements,
        anomalies,
        _selected: true,
        _catalogueMatch: catMat || null,
      };
    }

    return {
      material: materialName,
      material_category: category,
      total_parts: totalParts,
      anomalies,
      _selected: true,
      _catalogueMatch: catMat || null,
    };
  });
}

/* ============================================================
   Page chunking for traveller print

   Splits a list of material summaries into per-page chunks that
   fit on one A4 with proper header/footer chrome. Each chunk is
   rendered as its own <Page> wrapper, so totalPages and the actual
   printed page count agree.

   Empirical density (compact 2-up sheets, 1-up timber lengths):
     SHEETS_PER_PAGE = 10  (~250mm of content area)
     BINS_PER_PAGE   = 25  (timber bins are ~6mm tall each)

   Tune if the page-break-inside: avoid budget gets tight — if a chunk
   ever overflows, the entire chunk pushes to the next page and leaves
   a blank page behind.
   ============================================================ */

export interface CutPlanPageChunk {
  /** True on the first chunk of the whole cut plan — render section preamble. */
  isFirst: boolean;
  material: string;
  /** "33 sheets of 2440x1220mm · 11% waste" — same on every chunk of a material. */
  materialDetail: string;
  /** Anomalies are shown on the first chunk of each material only. */
  anomalies?: string[];
  /* Sheet payload */
  sheetIndices?: number[];
  placements?: Placement[];
  sheetW?: number;
  sheetH?: number;
  /* Timber payload */
  bins?: LengthBin[];
}

const SHEETS_PER_PAGE = 10;
const BINS_PER_PAGE = 25;

export function buildCutPlanPages(summaries: MaterialSummary[]): CutPlanPageChunk[] {
  const chunks: CutPlanPageChunk[] = [];
  let isFirst = true;

  for (const s of summaries) {
    const hasSheets = !!(s.sheet_placements && s.sheet_placements.length > 0 && s.sheets_needed);
    const hasLengths = !!(s.length_bins && s.length_bins.length > 0);
    if (!hasSheets && !hasLengths) continue;

    if (hasSheets) {
      const sz = parseSheetSize(s.standard_sheet_size);
      const sheetW = sz?.w || 2440;
      const sheetH = sz?.h || 1220;
      const wasteStr = s.waste_pct != null ? ` · ${s.waste_pct}% waste` : "";
      const detail = `${s.sheets_needed} sheet${s.sheets_needed! > 1 ? "s" : ""} of ${s.standard_sheet_size}mm${wasteStr}`;
      const total = s.sheets_needed!;

      for (let i = 0; i < total; i += SHEETS_PER_PAGE) {
        const end = Math.min(i + SHEETS_PER_PAGE, total);
        const indices: number[] = [];
        for (let j = i; j < end; j++) indices.push(j);
        chunks.push({
          isFirst: isFirst && i === 0,
          material: s.material,
          materialDetail: detail,
          anomalies: i === 0 ? s.anomalies : undefined,
          sheetIndices: indices,
          placements: s.sheet_placements,
          sheetW, sheetH,
        });
        isFirst = false;
      }
    }

    if (hasLengths) {
      const wasteStr = s.waste_pct != null ? ` · ${s.waste_pct}% waste` : "";
      const detail = `${s.lengths_needed} × ${s.standard_length_mm}mm${wasteStr}`;
      const bins = s.length_bins!;
      for (let i = 0; i < bins.length; i += BINS_PER_PAGE) {
        chunks.push({
          isFirst: isFirst && i === 0,
          material: s.material,
          materialDetail: detail,
          anomalies: i === 0 ? s.anomalies : undefined,
          bins: bins.slice(i, i + BINS_PER_PAGE),
        });
        isFirst = false;
      }
    }
  }

  return chunks;
}
