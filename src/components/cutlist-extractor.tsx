"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import { getAuthHeaders } from "@/lib/auth-headers";
import { Loader2, Check, Plus, FileText, Zap } from "lucide-react";

interface ExtractedLine {
  line_number: number;
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

interface MaterialSummary {
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
  _selected?: boolean;
}

interface CutListExtractorProps {
  docId: number;
  workOrderId: number;
  jobId: number;
  onedrivePath: string | null;
  fileName: string;
  mimeType: string | null;
  extractionStatus: string | null;
  extractedData: any;
  onUpdate: () => void;
}

/* ============================================================
   Post-processing: client-side bin-packing calculations
   ============================================================ */

// --- 1D bin packing for timber (First-Fit Decreasing) ---

function binPackLengths(pieceLengths: number[], standardLength: number): number {
  const sorted = [...pieceLengths].sort((a, b) => b - a);
  const bins: number[] = [];
  for (const piece of sorted) {
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] + piece <= standardLength) {
        bins[i] += piece;
        placed = true;
        break;
      }
    }
    if (!placed) bins.push(piece);
  }
  return bins.length;
}

// --- 2D guillotine bin packing for sheets ---
// Models how a table saw actually works: each placed part splits
// remaining space into two rectangles via a guillotine cut.

interface Rect { w: number; h: number; }
interface FreeRect { x: number; y: number; w: number; h: number; }

function guillotinePack(parts: Rect[], sheetW: number, sheetH: number): { sheets: number; placements: number } {
  // Sort parts by area descending (largest first = better packing)
  const sorted = [...parts].sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const sheets: FreeRect[][] = [];
  let totalPlaced = 0;

  for (const part of sorted) {
    let placed = false;

    // Try each existing sheet
    for (const freeRects of sheets) {
      const idx = findBestFit(freeRects, part.w, part.h);
      if (idx !== -1) {
        splitRect(freeRects, idx, part.w, part.h);
        totalPlaced++;
        placed = true;
        break;
      }
      // Try rotated (swap w/h)
      if (part.w !== part.h) {
        const idxR = findBestFit(freeRects, part.h, part.w);
        if (idxR !== -1) {
          splitRect(freeRects, idxR, part.h, part.w);
          totalPlaced++;
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      // Open a new sheet
      const newSheet: FreeRect[] = [{ x: 0, y: 0, w: sheetW, h: sheetH }];
      const idx = findBestFit(newSheet, part.w, part.h);
      if (idx !== -1) {
        splitRect(newSheet, idx, part.w, part.h);
        totalPlaced++;
      } else if (part.w !== part.h) {
        const idxR = findBestFit(newSheet, part.h, part.w);
        if (idxR !== -1) {
          splitRect(newSheet, idxR, part.h, part.w);
          totalPlaced++;
        }
        // If still can't fit, part is oversized — sheet still opened, counted as waste
      }
      sheets.push(newSheet);
    }
  }

  return { sheets: sheets.length, placements: totalPlaced };
}

function findBestFit(freeRects: FreeRect[], pw: number, ph: number): number {
  // Best Short Side Fit: minimise leftover on the shorter remaining side
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
  // Remove the used rect
  freeRects.splice(idx, 1);

  // Split along the shorter leftover axis (Shorter Axis Split rule)
  const remainW = r.w - pw;
  const remainH = r.h - ph;

  if (remainW > 0 || remainH > 0) {
    if (remainW < remainH) {
      // Horizontal split: right strip is narrow, bottom strip is wide
      if (remainW > 0) freeRects.push({ x: r.x + pw, y: r.y, w: remainW, h: ph });
      if (remainH > 0) freeRects.push({ x: r.x, y: r.y + ph, w: r.w, h: remainH });
    } else {
      // Vertical split: bottom strip is narrow, right strip is tall
      if (remainW > 0) freeRects.push({ x: r.x + pw, y: r.y, w: remainW, h: r.h });
      if (remainH > 0) freeRects.push({ x: r.x, y: r.y + ph, w: pw, h: remainH });
    }
  }

  // Merge adjacent free rects where possible (simple pass)
  mergeFreeRects(freeRects);
}

function mergeFreeRects(rects: FreeRect[]) {
  // Remove rects fully contained within another
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

// --- Parse sheet size string ---

function parseSheetSize(sizeStr?: string | null): { w: number; h: number } | null {
  if (!sizeStr) return null;
  const m = sizeStr.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (m) return { w: parseInt(m[1]), h: parseInt(m[2]) };
  return null;
}

// --- Build material summary from extracted parts ---

function buildMaterialSummary(
  parts: ExtractedLine[],
  catalogueMaterials: any[]
): MaterialSummary[] {
  // Group parts by material name (case-insensitive)
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
      const pieceLengths: number[] = [];
      for (const p of matParts) {
        const l = p.length_mm || 0;
        if (l > 0) { for (let i = 0; i < (p.quantity || 1); i++) pieceLengths.push(l); }
      }
      const totalLinearMm = pieceLengths.reduce((a, b) => a + b, 0);
      const stdLen = catMat?.standard_length || 4800;
      const lengthsNeeded = pieceLengths.length > 0
        ? binPackLengths(pieceLengths, stdLen)
        : Math.max(1, Math.ceil(totalLinearMm / stdLen));
      const usedMm = lengthsNeeded * stdLen;
      const waste = usedMm > 0 ? Math.round((1 - totalLinearMm / usedMm) * 100) : 0;

      return {
        material: materialName, material_category: "Timber",
        total_parts: totalParts, total_linear_mm: totalLinearMm,
        lengths_needed: lengthsNeeded, standard_length_mm: stdLen,
        waste_pct: waste, piece_lengths: pieceLengths,
        anomalies, _selected: true,
      };
    }

    if (category === "sheet") {
      const catSheet = parseSheetSize(catMat?.standard_sheet_size);
      const sheetW = catSheet?.w || 2440;
      const sheetH = catSheet?.h || 1220;

      // Build rectangle list expanded by quantity
      const rects: Rect[] = [];
      for (const p of matParts) {
        const l = p.length_mm || 0;
        const w = p.width_mm || 0;
        if (l > 0 && w > 0) {
          for (let i = 0; i < (p.quantity || 1); i++) rects.push({ w: l, h: w });
        }
      }

      // Check for oversized parts
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
        material: materialName, material_category: "Sheet",
        total_parts: totalParts, sheets_needed: sheets,
        standard_sheet_size: `${sheetW}x${sheetH}`,
        waste_pct: wastePct, anomalies, _selected: true,
      };
    }

    return {
      material: materialName, material_category: category,
      total_parts: totalParts, anomalies, _selected: true,
    };
  });
}

export function CutListExtractor({
  docId, workOrderId, jobId, onedrivePath, fileName,
  mimeType, extractionStatus: initialStatus, extractedData, onUpdate,
}: CutListExtractorProps) {
  const supabase = createClient();
  const [extracting, setExtracting] = useState(false);
  const [status, setStatus] = useState(initialStatus || "pending");
  const [parts, setParts] = useState<ExtractedLine[]>(extractedData?.lines || []);
  const [matSummary, setMatSummary] = useState<MaterialSummary[]>([]);
  const [rawAiSummary, setRawAiSummary] = useState<any[]>(extractedData?.material_summary || []);
  const [summary, setSummary] = useState<any>(extractedData?.summary || null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showParts, setShowParts] = useState(false);

  // Recalculate material summary from parts data whenever parts change
  useEffect(() => {
    if (parts.length === 0 || status === "pending") return;
    const recalc = async () => {
      const { data: catMats } = await supabase.from("tbl_materials")
        .select("material_id, material_name, standard_length, standard_sheet_size, unit")
        .eq("active", true);
      const recalced = buildMaterialSummary(parts, catMats || []);
      setMatSummary(recalced);
    };
    recalc();
  }, [parts, status]);

  const handleExtract = async () => {
    if (!onedrivePath) return;
    setExtracting(true);
    setError(null);

    try {
      const { data: materials } = await supabase
        .from("tbl_materials")
        .select("material_id, material_name, unit, current_unit_cost, standard_length, standard_sheet_size, spec_val_1, spec_val_2, spec_val_3")
        .eq("active", true);

      const matContext = (materials || []).map(m => {
        const specs = [m.spec_val_1, m.spec_val_2, m.spec_val_3].filter(Boolean);
        return `${m.material_name} (unit: ${m.unit}${m.standard_length ? ', std length: ' + m.standard_length + 'mm' : ''}${m.standard_sheet_size ? ', std sheet: ' + m.standard_sheet_size : ''} ${specs.length ? 'dims: ' + specs.join('x') + 'mm' : ''})`;
      }).join('\n');

      let body: any = { file_name: fileName, materials_context: matContext };
      const isCSV = fileName.toLowerCase().endsWith(".csv");

      if (isCSV) {
        const url = await getOneDriveUrl(onedrivePath);
        const res = await fetch(url);
        body.csv_text = await res.text();
      } else {
        const url = await getOneDriveUrl(onedrivePath);
        const res = await fetch(url);
        const blob = await res.blob();
        body.file_data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(blob);
        });
        body.media_type = mimeType || "application/pdf";
      }

      const { data: { session } } = await supabase.auth.getSession();
      const extractRes = await fetch("/api/extract-cutlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });

      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({}));
        throw new Error(err.error || `Extraction failed: ${extractRes.status}`);
      }

      const data = await extractRes.json();
      const extractedParts = data.lines || [];
      setParts(extractedParts);
      setRawAiSummary(data.material_summary || []);

      // Fetch catalogue materials for calculation reference
      const { data: catMats } = await supabase.from("tbl_materials")
        .select("material_id, material_name, standard_length, standard_sheet_size, unit")
        .eq("active", true);

      // Client-side calculation — all math done deterministically in JS
      const recalced = buildMaterialSummary(extractedParts, catMats || []);
      setMatSummary(recalced);
      setSummary(data.summary || null);
      setStatus("extracted");

      await supabase.from("tbl_wo_documents").update({
        extraction_status: "extracted", extracted_data: data,
      }).eq("doc_id", docId);
    } catch (err: any) { setError(err.message); }
    setExtracting(false);
  };

  const toggleMat = (idx: number) => {
    setMatSummary(prev => prev.map((m, i) => i === idx ? { ...m, _selected: !m._selected } : m));
  };

  const addToBom = async () => {
    const selected = matSummary.filter(m => m._selected);
    if (selected.length === 0) return;
    setAdding(true);

    const { data: lookups } = await supabase
      .from("tbl_master_lookups").select("lookup_id, lookup_value")
      .eq("category", "MATERIAL_CATEGORY").eq("active", true);
    const catMap: Record<string, number> = {};
    (lookups || []).forEach((l: any) => { catMap[(l.lookup_value || "").toLowerCase()] = l.lookup_id; });

    const { data: materials } = await supabase
      .from("tbl_materials")
      .select("material_id, material_name, unit, current_unit_cost, material_category, standard_length, standard_sheet_size")
      .eq("active", true);

    // Recalculate inline from parts — deterministic JS math
    const recalced = buildMaterialSummary(parts, materials || []);
    // Apply user's checkbox selections from matSummary state
    const selectedMats = new Set(matSummary.filter(m => m._selected).map(m => (m.material || "").toLowerCase()));
    for (const m of recalced) { m._selected = selectedMats.has((m.material || "").toLowerCase()); }
    console.log("[CutList][addToBom] recalced:", JSON.stringify(recalced.map(m => ({ mat: m.material, cat: m.material_category, totalMm: m.total_linear_mm, lengths: m.lengths_needed, sheets: m.sheets_needed }))));

    for (const mat of recalced) {
      if (!mat._selected) continue;
      const matLower = (mat.material || "").toLowerCase();
      let matched = (materials || []).find(m => (m.material_name || "").toLowerCase() === matLower);
      if (!matched) matched = (materials || []).find(m => matLower.includes((m.material_name || "").toLowerCase()) || (m.material_name || "").toLowerCase().includes(matLower));

      const catKey = (mat.material_category || "other").toLowerCase();

      // Build parts note
      const partsForMat = parts.filter(p => (p.material || "").toLowerCase() === matLower);
      // Expand by quantity for piece list
      const expandedParts: string[] = [];
      for (const p of partsForMat) {
        const dims = [p.length_mm, p.width_mm].filter(Boolean).join("x");
        expandedParts.push(`${p.quantity || 1}× ${p.description}${dims ? ` ${dims}mm` : ""}`);
      }
      const partsNote = expandedParts.length > 0
        ? `${expandedParts.length} parts: ${expandedParts.join(", ")}`.substring(0, 250)
        : "";

      // Determine BOM values based on recalculated data
      // Timber: order by number of standard lengths needed
      const isTimber = mat.total_linear_mm != null && mat.total_linear_mm > 0;
      const stdLen = mat.standard_length_mm || 4800;
      const lengthsNeeded = mat.lengths_needed || 1;
      const totalMm = mat.total_linear_mm || 0;
      const totalMetresActual = Math.ceil(totalMm / 100) / 10; // round up to 0.1m
      const bomQty = isTimber ? lengthsNeeded
        : mat.sheets_needed || mat.lengths_needed || 1;
      const bomUnit = isTimber ? "Length"
        : mat.sheets_needed ? "Sheet"
        : mat.lengths_needed ? "Length"
        : (matched?.unit || "Each");
      const bomDesc = isTimber
        ? `${mat.material} - ${totalMetresActual}m actual (${lengthsNeeded}× ${stdLen / 1000}m)`
        : mat.material + (mat.standard_sheet_size ? ` (${mat.standard_sheet_size})` : "");

      console.log(`[CutList][addToBom] inserting: ${bomDesc} qty=${bomQty} unit=${bomUnit}`);

      // For timber sold by metre but ordered by length: unit_cost = price/m × standard_length_m
      const catUnitCost = matched?.current_unit_cost || null;
      let bomUnitCost = catUnitCost;
      if (isTimber && catUnitCost && matched?.unit?.toLowerCase() === "metre") {
        bomUnitCost = Math.round(catUnitCost * (stdLen / 1000) * 100) / 100;
      }

      await supabase.from("tbl_wo_bom").insert({
        work_order_id: workOrderId,
        job_id: jobId,
        material_id: matched?.material_id || null,
        material_category: matched?.material_category || catMap[catKey] || null,
        item_description: bomDesc,
        quantity: bomQty,
        unit: bomUnit,
        unit_cost: bomUnitCost,
        needs_ordering: matched ? "false" : "true",
        notes: partsNote || null,
      });
    }

    await supabase.from("tbl_wo_documents").update({ extraction_status: "confirmed" }).eq("doc_id", docId);
    setStatus("confirmed");
    setAdding(false);
    onUpdate();
  };

  const selectedCount = matSummary.filter(m => m._selected).length;

  // PENDING
  if (status === "pending" && parts.length === 0) {
    return (
      <div className="mt-2 p-3 bg-starlight-amber/5 border border-starlight-amber/20 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-starlight-amber" />
            <span className="text-xs text-muted">{fileName}</span>
          </div>
          <button onClick={handleExtract} disabled={extracting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-starlight-amber text-white text-xs font-medium rounded-lg hover:bg-starlight-amber transition-colors disabled:opacity-50">
            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {extracting ? "Extracting..." : "Extract BOM"}
          </button>
        </div>
        {error && <p className="text-xs text-starlight-red mt-2">{error}</p>}
      </div>
    );
  }

  // CONFIRMED
  if (status === "confirmed") {
    return (
      <div className="mt-2 p-2 bg-starlight-green/5 border border-starlight-green/20 rounded-lg">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-starlight-green" />
            <span className="text-[10px] text-starlight-green font-medium">
              {matSummary.length} material{matSummary.length !== 1 ? "s" : ""} added to BOM ({parts.length} parts extracted)
            </span>
          </div>
          <button
            onClick={async () => {
              // Delete existing BOM rows for this WO so we don't duplicate
              await supabase.from("tbl_wo_bom").delete().eq("work_order_id", workOrderId);
              await supabase.from("tbl_wo_documents").update({ extraction_status: "extracted" }).eq("doc_id", docId);
              setStatus("extracted");
              if (onUpdate) onUpdate();
            }}
            className="text-[10px] text-muted hover:text-starlight-blue px-2 py-0.5 rounded hover:bg-starlight-blue/10 transition-colors"
          >
            Re-add to BOM
          </button>
        </div>
      </div>
    );
  }

  // EXTRACTED — show material summary (what to order) + expandable parts list
  if (matSummary.length > 0) {
    return (
      <div className="mt-2 border border-subtle rounded-lg overflow-hidden">
        {summary && (
          <div className="px-3 py-2 bg-surface-dim border-b border-subtle flex items-center justify-between">
            <span className="text-[10px] text-muted">{summary.total_parts} parts → {matSummary.length} material{matSummary.length !== 1 ? "s" : ""} to order</span>
          </div>
        )}

        {/* Material summary — what to add to BOM */}
        <div className="px-3 py-2">
          <p className="text-[9px] text-muted uppercase tracking-wider font-semibold mb-1.5">Materials to Order</p>
          <div className="space-y-1.5">
            {matSummary.map((mat, idx) => (
              <div key={idx}>
                <div className={"flex items-center gap-2 py-1 px-2 rounded-lg " + (mat._selected ? "bg-starlight-green/5" : "bg-surface-dim opacity-50")}>
                  <input type="checkbox" checked={!!mat._selected} onChange={() => toggleMat(idx)} className="h-3 w-3 rounded border-subtle" />
                  <span className="text-xs text-navy font-medium flex-1">{mat.material}</span>
                  {mat.total_linear_mm != null && mat.total_linear_mm > 0 && (
                    <span className="text-[10px] font-mono text-muted">{mat.total_linear_mm}mm total</span>
                  )}
                  {mat.lengths_needed != null && mat.lengths_needed > 0 && (
                    <span className="text-xs font-mono text-starlight-blue font-medium">{mat.lengths_needed}× {mat.standard_length_mm || 4800}mm</span>
                  )}
                  {mat.sheets_needed != null && mat.sheets_needed > 0 && (
                    <span className="text-xs font-mono text-starlight-blue font-medium">{mat.sheets_needed} sheet{mat.sheets_needed > 1 ? "s" : ""}</span>
                  )}
                  <span className="text-[10px] text-muted">{mat.total_parts} parts</span>
                  {mat.waste_pct != null && (
                    <span className={"text-[10px] " + (mat.waste_pct > 40 ? "text-starlight-amber" : "text-muted")}>{mat.waste_pct}% waste</span>
                  )}
                </div>
                {mat.anomalies && mat.anomalies.length > 0 && (
                  <div className="ml-7 mt-0.5 mb-1">
                    {mat.anomalies.map((a, ai) => (
                      <p key={ai} className="text-[10px] text-starlight-amber flex items-start gap-1">
                        <span className="shrink-0">⚠</span> {a}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Expandable parts list — reference */}
        <div className="border-t border-subtle">
          <button onClick={() => setShowParts(!showParts)} className="w-full px-3 py-1.5 text-left text-[10px] text-muted hover:text-muted">
            {showParts ? "▾" : "▸"} {parts.length} individual parts (reference)
          </button>
          {showParts && (
            <div className="overflow-x-auto max-h-48 overflow-y-auto border-t border-subtle">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-[9px] text-muted uppercase tracking-wider border-b border-subtle">
                    <th className="px-2 py-1 text-left">Part</th>
                    <th className="px-2 py-1 text-left">Material</th>
                    <th className="px-2 py-1 text-right">L</th>
                    <th className="px-2 py-1 text-right">W</th>
                    <th className="px-2 py-1 text-right">T</th>
                    <th className="px-2 py-1 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p, idx) => (
                    <tr key={idx} className="border-b border-subtle">
                      <td className="px-2 py-0.5 text-navy">{p.description}</td>
                      <td className="px-2 py-0.5 text-muted">{p.material}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-muted">{p.length_mm || "—"}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-muted">{p.width_mm || "—"}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-muted">{p.thickness_mm || "—"}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-navy">{p.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add to BOM button */}
        <div className="px-3 py-2 border-t border-subtle bg-surface-dim flex items-center justify-between">
          <span className="text-[10px] text-muted">{selectedCount} material{selectedCount !== 1 ? "s" : ""} selected</span>
          <button onClick={addToBom} disabled={selectedCount === 0 || adding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-starlight-green text-white text-xs font-medium rounded-lg hover:bg-starlight-green transition-colors disabled:opacity-50">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {adding ? "Adding..." : `Add ${selectedCount} to BOM`}
          </button>
        </div>
      </div>
    );
  }
  return null;
}
