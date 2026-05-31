/* ============================================================
   Cut layout shared library — pure functions + types

   Used by:
   - src/components/cutlist-extractor.tsx  (live preview during BOM extraction)
   - src/app/traveller/page.tsx            (suggested cut plan on traveller)

   Algorithms:
   - binPackLengths()   1D First-Fit Decreasing for timber lengths (kerf-aware)
   - guillotinePack()   2D guillotine packing for sheets, Best Short Side
                        Fit + Shorter Axis Split heuristics (Jylänki),
                        kerf-aware, packs within a usable (squared) area.
   - buildMaterialSummary()  groups parts → materials, and for sheet goods
                        runs a kerf/squaring-aware guillotine nest, then
                        groups the resulting sheets into distinct PATTERNS by
                        layout signature. The deterministic area-sorted packer
                        fills high-count identical parts the same way across
                        sheets, so identical layouts collapse into stackable
                        runs (e.g. "×7 sheets · 4 stacked passes").

   Placements capture true part size (kerf shows as the gap between parts).
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
  /** Post-rotation TRUE width (rendered; kerf shows as the gap to the next part). */
  w: number;
  /** Post-rotation TRUE height. */
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

/* ============================================================
   Cut settings — workshop defaults + per-WO overrides
   ============================================================ */

export interface CutSettings {
  /** Saw blade kerf in mm — material lost per cut. */
  kerf_mm: number;
  /** Squaring allowance in mm — trimmed off two reference edges per sheet. */
  squaring_mm: number;
  /** Stack-cut overrides keyed by thickness string, e.g. {"18": 2}. */
  stack_overrides?: Record<string, number>;
}

export const DEFAULT_CUT_SETTINGS: CutSettings = {
  kerf_mm: 4,
  squaring_mm: 5,
};

/**
 * Merge a stored (possibly partial / null) cut_settings value with workshop
 * defaults. NULL or missing fields fall back to defaults. Used by both the
 * traveller and the cutlist extractor so the resolution rule lives in one place.
 */
export function resolveCutSettings(raw: Partial<CutSettings> | null | undefined): CutSettings {
  if (!raw) return DEFAULT_CUT_SETTINGS;
  return {
    kerf_mm: raw.kerf_mm != null ? raw.kerf_mm : DEFAULT_CUT_SETTINGS.kerf_mm,
    squaring_mm: raw.squaring_mm != null ? raw.squaring_mm : DEFAULT_CUT_SETTINGS.squaring_mm,
    stack_overrides:
      raw.stack_overrides && Object.keys(raw.stack_overrides).length > 0
        ? raw.stack_overrides
        : undefined,
  };
}

/**
 * Sheets stacked per cutting pass for a given thickness.
 * Default rule clamp(floor(36 / thickness), 1, 5) reproduces the workshop
 * table exactly: 18→2, 12→3, 9→4, 6→5, 3.6→5. Per-WO overrides win.
 */
export function stackCountForThickness(thickness: number, settings: CutSettings): number {
  const key = String(thickness);
  if (settings.stack_overrides && settings.stack_overrides[key] != null) {
    return Math.max(1, settings.stack_overrides[key]);
  }
  if (!thickness || thickness <= 0) return 1;
  return Math.min(5, Math.max(1, Math.floor(36 / thickness)));
}

/* ============================================================
   Sheet patterns + material summary
   ============================================================ */

export interface SheetPattern {
  /** Layout for ONE representative sheet (placements all use sheetIdx 0). */
  placements: Placement[];
  /** Physical sheets that share this exact layout. */
  count: number;
  /** Sheets stacked per cutting pass (from thickness). */
  stackCount: number;
  /** ceil(count / stackCount). */
  passes: number;
  /** Area fill % for this pattern. */
  fillPct: number;
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
  /** Distinct sheet layouts (Sheet category). Replaces flat sheet_placements. */
  patterns?: SheetPattern[];
  /** Total stacked cutting passes across all patterns. */
  total_passes?: number;
  /** Sheets stacked per pass for this material (from thickness). */
  stack_count?: number;
  sheetW?: number;
  sheetH?: number;
  /** Squaring allowance used (mm) — for drawing the trim boundary. */
  squaring_mm?: number;
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
   1D bin packing — First-Fit Decreasing, kerf-aware
   ============================================================ */

export function binPackLengths(
  pieces: { length: number; desc: string }[],
  standardLength: number,
  kerf = 0,
): LengthBin[] {
  const sorted = [...pieces].sort((a, b) => b.length - a.length);
  const bins: LengthBin[] = [];

  for (const piece of sorted) {
    let placed = false;
    for (const bin of bins) {
      const gap = bin.pieces.length > 0 ? kerf : 0;
      if (bin.used + gap + piece.length <= standardLength) {
        const offset = bin.used + gap;
        bin.pieces.push({ length: piece.length, partDesc: piece.desc, offset });
        bin.used = offset + piece.length;
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
   2D guillotine bin packing — Best Short Side Fit + Shorter Axis
   Split. Kerf-aware: each part's footprint is inflated by kerf, but
   the stored placement keeps the TRUE size so kerf renders as a gap.
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
  usableW: number,
  usableH: number,
  kerf = 0,
): { sheets: number; placements: Placement[] } {
  const sorted = [...parts].sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const sheetsFree: FreeRect[][] = [];
  const placements: Placement[] = [];

  const tryPlace = (free: FreeRect[], sheetIdx: number, p: PartRect): boolean => {
    // footprint includes kerf on right + bottom
    const fw = p.w + kerf;
    const fh = p.h + kerf;
    let idx = findBestFit(free, fw, fh);
    let rotated = false;
    if (idx === -1 && p.w !== p.h) {
      idx = findBestFit(free, fh, fw);
      rotated = true;
    }
    if (idx === -1) return false;
    const r = free[idx];
    const trueW = rotated ? p.h : p.w;
    const trueH = rotated ? p.w : p.h;
    const footW = rotated ? fh : fw;
    const footH = rotated ? fw : fh;
    placements.push({ sheetIdx, x: r.x, y: r.y, w: trueW, h: trueH, rotated, partDesc: p.desc });
    splitRect(free, idx, footW, footH);
    return true;
  };

  for (const part of sorted) {
    let placed = false;
    for (let s = 0; s < sheetsFree.length; s++) {
      if (tryPlace(sheetsFree[s], s, part)) { placed = true; break; }
    }
    if (!placed) {
      const newSheet: FreeRect[] = [{ x: 0, y: 0, w: usableW, h: usableH }];
      tryPlace(newSheet, sheetsFree.length, part);
      sheetsFree.push(newSheet);
    }
  }

  return { sheets: sheetsFree.length, placements };
}

/* ============================================================
   Pattern grouping — collapse identical sheet layouts
   ============================================================ */

function sheetSignature(pl: Placement[]): string {
  return pl
    .map(p => `${p.partDesc}|${Math.round(p.x)}|${Math.round(p.y)}|${Math.round(p.w)}|${Math.round(p.h)}|${p.rotated ? 1 : 0}`)
    .sort()
    .join(";");
}

function groupSheetsIntoPatterns(
  placements: Placement[],
  sheetCount: number,
  stackCount: number,
  usableW: number,
  usableH: number,
): SheetPattern[] {
  const bySheet: Record<number, Placement[]> = {};
  for (const p of placements) (bySheet[p.sheetIdx] ||= []).push(p);

  const groups: Record<string, { placements: Placement[]; count: number }> = {};
  const order: string[] = [];
  for (let i = 0; i < sheetCount; i++) {
    const sheet = bySheet[i] || [];
    const sig = sheetSignature(sheet);
    if (!groups[sig]) {
      groups[sig] = { placements: sheet.map(p => ({ ...p, sheetIdx: 0 })), count: 0 };
      order.push(sig);
    }
    groups[sig].count++;
  }

  return order.map(sig => {
    const g = groups[sig];
    const partArea = g.placements.reduce((s, p) => s + p.w * p.h, 0);
    return {
      placements: g.placements,
      count: g.count,
      stackCount,
      passes: Math.ceil(g.count / stackCount),
      fillPct: usableW * usableH > 0 ? Math.round((partArea / (usableW * usableH)) * 100) : 0,
    };
  });
}

function dominantThickness(nums: number[]): number {
  if (nums.length === 0) return 0;
  const counts: Record<number, number> = {};
  let best = nums[0], bestC = 0;
  for (const n of nums) {
    counts[n] = (counts[n] || 0) + 1;
    if (counts[n] > bestC) { bestC = counts[n]; best = n; }
  }
  return best;
}

/* ============================================================
   Build material summary from extracted parts
   ============================================================ */

/** Sheet-goods layout fields for one material on a given stock sheet size. */
export function sheetLayoutFields(
  matParts: ExtractedLine[],
  sheetW: number,
  sheetH: number,
  settings: CutSettings,
): Partial<MaterialSummary> {
  const kerf = settings.kerf_mm ?? 4;
  const squaring = settings.squaring_mm ?? 5;
  const usableW = Math.max(1, sheetW - squaring);
  const usableH = Math.max(1, sheetH - squaring);
  const thickness = dominantThickness(
    matParts.map(p => p.thickness_mm || 0).filter(t => t > 0),
  );
  const stackCount = stackCountForThickness(thickness, settings);

  // Oversize check (against usable area, both orientations, incl. kerf)
  const anomalies: string[] = [];
  for (const p of matParts) {
    const l = p.length_mm || 0;
    const w = p.width_mm || 0;
    const fits =
      (l + kerf <= usableW && w + kerf <= usableH) ||
      (w + kerf <= usableW && l + kerf <= usableH);
    if (l > 0 && w > 0 && !fits) {
      const msg = `${p.description}: ${l}×${w}mm does not fit on ${usableW}×${usableH}mm usable sheet (after ${squaring}mm squaring) in any orientation`;
      if (!anomalies.includes(msg)) anomalies.push(msg);
    }
  }

  // Build all part rects (true sizes), then nest with a kerf-aware guillotine.
  // The deterministic area-sorted packer fills high-count identical parts the
  // same way across sheets, so grouping by layout signature yields natural
  // stackable runs (e.g. ×7 identical sheets).
  const rects: PartRect[] = [];
  let totalPartArea = 0;
  for (const p of matParts) {
    const l = p.length_mm || 0;
    const w = p.width_mm || 0;
    const qty = p.quantity || 1;
    if (l <= 0 || w <= 0) continue;
    totalPartArea += l * w * qty;
    const desc = labelFor(p);
    for (let i = 0; i < qty; i++) rects.push({ w: l, h: w, desc });
  }

  const { sheets, placements } = guillotinePack(rects, usableW, usableH, kerf);
  const patterns = groupSheetsIntoPatterns(placements, sheets, stackCount, usableW, usableH);
  const sheetsNeeded = patterns.reduce((s, p) => s + p.count, 0);
  const totalPasses = patterns.reduce((s, p) => s + p.passes, 0);
  const wastePct = sheetsNeeded > 0
    ? Math.round((1 - totalPartArea / (sheetsNeeded * sheetW * sheetH)) * 100)
    : 0;

  return {
    sheets_needed: sheetsNeeded,
    standard_sheet_size: `${sheetW}x${sheetH}`,
    sheetW, sheetH,
    squaring_mm: squaring,
    waste_pct: wastePct,
    patterns,
    total_passes: totalPasses,
    stack_count: stackCount,
    anomalies,
  };
}

/** Timber 1D layout fields for one material on a given stock length. */
export function timberLayoutFields(
  matParts: ExtractedLine[],
  standardLength: number,
  settings: CutSettings,
): Partial<MaterialSummary> {
  const kerf = settings.kerf_mm ?? 4;
  const squaring = settings.squaring_mm ?? 5;
  const pieces: { length: number; desc: string }[] = [];
  for (const p of matParts) {
    const l = p.length_mm || 0;
    if (l > 0) {
      for (let i = 0; i < (p.quantity || 1); i++) pieces.push({ length: l, desc: labelFor(p) });
    }
  }
  const totalLinearMm = pieces.reduce((a, b) => a + b.length, 0);
  const usableLen = Math.max(1, standardLength - squaring); // end trim
  const bins = pieces.length > 0 ? binPackLengths(pieces, usableLen, kerf) : [];
  const lengthsNeeded = bins.length > 0
    ? bins.length
    : Math.max(1, Math.ceil(totalLinearMm / usableLen));
  const usedMm = lengthsNeeded * usableLen;
  const waste = usedMm > 0 ? Math.round((1 - totalLinearMm / usedMm) * 100) : 0;

  return {
    total_linear_mm: totalLinearMm,
    lengths_needed: lengthsNeeded,
    standard_length_mm: standardLength,
    waste_pct: waste,
    piece_lengths: pieces.map(p => p.length),
    length_bins: bins,
  };
}

export function buildMaterialSummary(
  parts: ExtractedLine[],
  catalogueMaterials: CatalogueMat[],
  settings: CutSettings = DEFAULT_CUT_SETTINGS,
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
      const catLen = catMat?.standard_length || 4800;
      return {
        material: materialName,
        material_category: "Timber",
        total_parts: totalParts,
        ...timberLayoutFields(matParts, catLen, settings),
        anomalies,
        _selected: true,
        _catalogueMatch: catMat || null,
      };
    }

    if (category === "sheet") {
      const catSheet = parseSheetSize(catMat?.standard_sheet_size);
      const sheetW = catSheet?.w || 2440;
      const sheetH = catSheet?.h || 1220;
      return {
        material: materialName,
        material_category: "Sheet",
        total_parts: totalParts,
        ...sheetLayoutFields(matParts, sheetW, sheetH, settings),
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
   Sheet size parser
   ============================================================ */

export function parseSheetSize(sizeStr?: string | null): { w: number; h: number } | null {
  if (!sizeStr) return null;
  const m = sizeStr.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (m) return { w: parseInt(m[1]), h: parseInt(m[2]) };
  return null;
}

/* ============================================================
   Page chunking for traveller print

   Each printed page packs as MANY materials as fit by estimated
   height (mm), instead of one material per page — small timber bins
   and single-sheet plans no longer each burn a whole A4. A material
   taller than one page is sliced across pages (header repeated with
   "(cont.)"); the cross-material packer then fills the leftover space
   on the last slice's page with the next material. Heights key off
   the sheet aspect ratio, so portrait stock is budgeted correctly.
   Each block keeps break-inside-avoid in the renderer, so any estimate
   miss breaks cleanly between materials, never mid-diagram.

   One <Page> wrapper per chunk so totalPages stays honest.
   ============================================================ */

/** One material's renderable unit on a page (a whole material, or a slice of an oversized one). */
export interface CutPlanBlock {
  material: string;
  materialDetail: string;
  /** True when this is a continuation slice of a material split across pages. */
  isContinuation?: boolean;
  anomalies?: string[];
  /* Sheet payload */
  patterns?: SheetPattern[];
  sheetW?: number;
  sheetH?: number;
  squaring?: number;
  /* Timber payload */
  bins?: LengthBin[];
}

/** One printed page of the cut plan — one or more material blocks. */
export interface CutPlanPageChunk {
  /** True on the first page of the whole cut plan — render the section preamble. */
  isFirst: boolean;
  blocks: CutPlanBlock[];
}

/* Height model (mm) for greedy page packing. Conservative: usable content
   height is ~247mm; budgeting 225 leaves ~20mm slack for render variance. */
const PAGE_BUDGET_MM = 225;
const PREAMBLE_MM = 9;        // section heading (first page only)
const BLOCK_HEADER_MM = 6;    // material name + detail line
const BLOCK_GAP_MM = 3;       // space-y-2 between blocks
const ANOMALY_MM = 4;         // per amber warning line
const PATTERN_CELL_W_MM = 88; // 2-up grid cell width (max-w-[88mm])
const PATTERN_CAPTION_MM = 5; // per pattern-row: caption + grid gap
const BIN_ROW_MM = 11;        // per timber bin: caption + 6mm bar + margin

interface RowUnit { h: number; patterns?: SheetPattern[]; bin?: LengthBin; }

/** Height-tagged row units for one material: pairs of sheet patterns (2-up) or single timber bins. */
function rowUnitsFor(s: MaterialSummary): RowUnit[] {
  if (s.patterns && s.patterns.length > 0) {
    const svgH = PATTERN_CELL_W_MM * ((s.sheetH || 1220) / (s.sheetW || 2440));
    const rowH = svgH + PATTERN_CAPTION_MM;
    const units: RowUnit[] = [];
    for (let i = 0; i < s.patterns.length; i += 2) {
      units.push({ h: rowH, patterns: s.patterns.slice(i, i + 2) });
    }
    return units;
  }
  if (s.length_bins && s.length_bins.length > 0) {
    return s.length_bins.map(bin => ({ h: BIN_ROW_MM, bin }));
  }
  return [];
}

function sheetDetailStr(s: MaterialSummary): string {
  const n = s.patterns?.length || 0;
  const wasteStr = s.waste_pct != null ? ` · ${s.waste_pct}% waste` : "";
  const stackStr = s.stack_count && s.stack_count > 1 ? ` · stack ${s.stack_count}` : "";
  const passStr = s.total_passes != null ? ` · ${s.total_passes} pass${s.total_passes === 1 ? "" : "es"}` : "";
  const patStr = `${n} pattern${n === 1 ? "" : "s"}`;
  return `${s.sheets_needed} sheet${s.sheets_needed === 1 ? "" : "s"} in ${patStr}${passStr}${stackStr}${wasteStr}`;
}

export function buildCutPlanPages(summaries: MaterialSummary[]): CutPlanPageChunk[] {
  const pages: CutPlanPageChunk[] = [];
  let curBlocks: CutPlanBlock[] = [];
  let curHeight = PREAMBLE_MM; // first page carries the section heading

  const flush = () => {
    if (curBlocks.length === 0) return;
    pages.push({ isFirst: pages.length === 0, blocks: curBlocks });
    curBlocks = [];
    curHeight = 0; // preamble height only applies to the first page
  };

  for (const s of summaries) {
    const isSheet = !!(s.patterns && s.patterns.length > 0);
    const isTimber = !isSheet && !!(s.length_bins && s.length_bins.length > 0);
    if (!isSheet && !isTimber) continue;

    const units = rowUnitsFor(s);
    if (units.length === 0) continue;

    const detail = isSheet
      ? sheetDetailStr(s)
      : `${s.lengths_needed} × ${s.standard_length_mm}mm${s.waste_pct != null ? ` · ${s.waste_pct}% waste` : ""}`;

    let i = 0;
    let matFirst = true;
    while (i < units.length) {
      const anomalies = matFirst ? s.anomalies : undefined;
      const anomalyH = anomalies && anomalies.length > 0 ? anomalies.length * ANOMALY_MM : 0;
      const headerH = BLOCK_HEADER_MM + anomalyH;
      const gap = curBlocks.length > 0 ? BLOCK_GAP_MM : 0;

      // If header + first row can't fit on the current (non-empty) page, wrap.
      if (curBlocks.length > 0 && curHeight + gap + headerH + units[i].h > PAGE_BUDGET_MM) {
        flush();
      }

      curHeight += (curBlocks.length > 0 ? BLOCK_GAP_MM : 0) + headerH;

      const taken: RowUnit[] = [];
      while (i < units.length && curHeight + units[i].h <= PAGE_BUDGET_MM) {
        taken.push(units[i]);
        curHeight += units[i].h;
        i++;
      }
      // Guarantee progress: a single row taller than the whole budget still
      // gets placed (it owns its page; we accept the overflow, as before).
      if (taken.length === 0) {
        taken.push(units[i]);
        curHeight += units[i].h;
        i++;
      }

      const block: CutPlanBlock = isSheet
        ? {
            material: s.material,
            materialDetail: detail,
            isContinuation: !matFirst,
            anomalies,
            patterns: taken.flatMap(u => u.patterns!),
            sheetW: s.sheetW,
            sheetH: s.sheetH,
            squaring: s.squaring_mm,
          }
        : {
            material: s.material,
            materialDetail: detail,
            isContinuation: !matFirst,
            anomalies,
            bins: taken.map(u => u.bin!),
          };
      curBlocks.push(block);
      matFirst = false;

      // More rows of this material remain → they spill to a fresh page.
      if (i < units.length) flush();
    }
  }

  flush();
  return pages;
}
