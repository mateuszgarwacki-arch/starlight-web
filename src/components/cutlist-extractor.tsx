"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getOneDriveUrl } from "@/lib/onedrive-client";
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
   Post-processing: client-side bin-packing + anomaly detection
   ============================================================ */

function binPackLengths(pieceLengths: number[], standardLength: number): number {
  // First-Fit Decreasing bin packing
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

function recalcMaterialSummary(
  parts: ExtractedLine[],
  aiSummary: MaterialSummary[],
  catalogueMaterials: any[]
): MaterialSummary[] {
  // Group parts by material name (lowercase match)
  const groups: Record<string, ExtractedLine[]> = {};
  for (const p of parts) {
    const key = (p.material || "unknown").toLowerCase();
    if (!groups[key]) groups[key] = [];
    // Expand by quantity
    for (let i = 0; i < (p.quantity || 1); i++) groups[key].push(p);
  }

  return aiSummary.map(mat => {
    const matKey = (mat.material || "").toLowerCase();
    const matParts = groups[matKey] || [];
    const catMat = catalogueMaterials.find(m =>
      (m.material_name || "").toLowerCase() === matKey ||
      matKey.includes((m.material_name || "").toLowerCase()) ||
      (m.material_name || "").toLowerCase().includes(matKey)
    );
    const anomalies: string[] = [];

    // Derive category from parts (AI summary often missing it) or catalogue
    const partsCat = matParts.length > 0 ? (matParts[0].material_category || "").toLowerCase() : "";
    const effectiveCat = (mat.material_category || "").toLowerCase() || partsCat;

    console.log(`[CutList][recalc] material="${mat.material}" cat="${effectiveCat}" (fromSummary="${mat.material_category}" fromParts="${partsCat}") partsFound=${matParts.length} catMatMatch=${!!catMat}`);

    if (effectiveCat === "timber") {
      // Collect individual piece lengths
      const pieceLengths = matParts
        .map(p => p.length_mm || 0)
        .filter(l => l > 0);

      console.log(`[CutList][timber] pieceLengths=${JSON.stringify(pieceLengths)} stdLen=${catMat?.standard_length || mat.standard_length_mm || 4800}`);

      const totalLinearMm = pieceLengths.reduce((a, b) => a + b, 0);
      const stdLen = catMat?.standard_length || mat.standard_length_mm || 4800;

      // Bin-pack to find actual lengths needed
      const lengthsNeeded = pieceLengths.length > 0
        ? binPackLengths(pieceLengths, stdLen)
        : Math.ceil(totalLinearMm / stdLen) || 1;

      const usedMm = lengthsNeeded * stdLen;
      const waste = usedMm > 0 ? Math.round((1 - totalLinearMm / usedMm) * 100) : 0;

      // Anomaly: check for suspicious cross-sections on timber
      // Timber width should typically be < 100mm for dimensional lumber
      for (const p of matParts) {
        const w = p.width_mm || 0;
        const t = p.thickness_mm || 0;
        const crossSection = Math.max(w, t);
        if (crossSection > 100 && (p.length_mm || 0) > 0) {
          const msg = `${p.description}: width ${w}mm × thickness ${t}mm looks too wide for timber — rotated component?`;
          if (!anomalies.includes(msg)) anomalies.push(msg);
        }
      }

      return {
        ...mat,
        total_parts: matParts.length,
        total_linear_mm: totalLinearMm,
        lengths_needed: lengthsNeeded,
        standard_length_mm: stdLen,
        waste_pct: waste,
        piece_lengths: pieceLengths,
        anomalies,
        _selected: mat._selected,
      };
    }

    // Sheets — keep AI calculation but validate
    if (mat.sheets_needed) {
      return { ...mat, anomalies, _selected: mat._selected };
    }

    return { ...mat, anomalies, _selected: mat._selected };
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
  const [matSummary, setMatSummary] = useState<MaterialSummary[]>(
    (extractedData?.material_summary || []).map((m: any) => ({ ...m, _selected: true }))
  );
  const [summary, setSummary] = useState<any>(extractedData?.summary || null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showParts, setShowParts] = useState(false);

  // Recalculate material summary with bin-packing whenever we have parts data
  useEffect(() => {
    if (parts.length === 0 || status === "pending" || status === "confirmed") return;
    const recalc = async () => {
      const { data: catMats } = await supabase.from("tbl_materials")
        .select("material_id, material_name, standard_length, standard_sheet_size, unit")
        .eq("active", true);
      const aiSummary = (extractedData?.material_summary || []).map((m: any) => ({ ...m, _selected: true }));
      console.log("[CutList] recalc input — parts:", parts.length, "aiSummary:", JSON.stringify(aiSummary));
      console.log("[CutList] parts sample:", JSON.stringify(parts.slice(0, 3)));
      console.log("[CutList] catalogue materials:", JSON.stringify(catMats?.map(m => ({ name: m.material_name, stdLen: m.standard_length }))));
      const recalced = recalcMaterialSummary(parts, aiSummary, catMats || []);
      console.log("[CutList] recalc output:", JSON.stringify(recalced));
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

      // Fetch catalogue materials for bin-packing reference
      const { data: catMats } = await supabase.from("tbl_materials")
        .select("material_id, material_name, standard_length, standard_sheet_size, unit")
        .eq("active", true);

      // Client-side recalculation with bin-packing for timber
      const aiSummary = (data.material_summary || []).map((m: any) => ({ ...m, _selected: true }));
      const recalced = recalcMaterialSummary(extractedParts, aiSummary, catMats || []);
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

    // Recalculate inline from parts — don't trust matSummary state
    const recalced = recalcMaterialSummary(parts, selected, materials || []);
    console.log("[CutList][addToBom] recalced inline:", JSON.stringify(recalced.map(m => ({ mat: m.material, cat: m.material_category, totalMm: m.total_linear_mm, lengths: m.lengths_needed, sheets: m.sheets_needed }))));

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
      // Timber: store in Metres (catalogue unit) so unit_cost × qty = correct £
      // Traveller converts to mm for workshop display
      const isTimber = mat.total_linear_mm != null && mat.total_linear_mm > 0;
      const totalMetres = isTimber ? Math.ceil((mat.total_linear_mm || 0) / 10) / 100 : 0; // round up to nearest 10mm then convert
      const bomQty = isTimber ? totalMetres
        : mat.sheets_needed || mat.lengths_needed || 1;
      const bomUnit = isTimber ? "Metre"
        : mat.sheets_needed ? "Sheet"
        : mat.lengths_needed ? "Length"
        : (matched?.unit || "Each");
      const stdLen = mat.standard_length_mm || 4800;
      const bomDesc = isTimber
        ? `${mat.material} — ${mat.total_linear_mm}mm (${mat.lengths_needed}× ${stdLen}mm)`
        : mat.material + (mat.standard_sheet_size ? ` (${mat.standard_sheet_size})` : "");

      console.log(`[CutList][addToBom] inserting: ${bomDesc} qty=${bomQty} unit=${bomUnit}`);

      await supabase.from("tbl_wo_bom").insert({
        work_order_id: workOrderId,
        job_id: jobId,
        material_id: matched?.material_id || null,
        material_category: matched?.material_category || catMap[catKey] || null,
        item_description: bomDesc,
        quantity: bomQty,
        unit: bomUnit,
        unit_cost: matched?.current_unit_cost || null,
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
            <span className="text-xs text-gray-600">{fileName}</span>
          </div>
          <button onClick={handleExtract} disabled={extracting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-starlight-amber text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50">
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
            className="text-[10px] text-gray-400 hover:text-starlight-blue px-2 py-0.5 rounded hover:bg-starlight-blue/10 transition-colors"
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
      <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
        {summary && (
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-[10px] text-gray-500">{summary.total_parts} parts → {matSummary.length} material{matSummary.length !== 1 ? "s" : ""} to order</span>
          </div>
        )}

        {/* Material summary — what to add to BOM */}
        <div className="px-3 py-2">
          <p className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Materials to Order</p>
          <div className="space-y-1.5">
            {matSummary.map((mat, idx) => (
              <div key={idx}>
                <div className={"flex items-center gap-2 py-1 px-2 rounded-lg " + (mat._selected ? "bg-starlight-green/5" : "bg-gray-50 opacity-50")}>
                  <input type="checkbox" checked={!!mat._selected} onChange={() => toggleMat(idx)} className="h-3 w-3 rounded border-gray-300" />
                  <span className="text-xs text-navy font-medium flex-1">{mat.material}</span>
                  {mat.total_linear_mm != null && mat.total_linear_mm > 0 && (
                    <span className="text-[10px] font-mono text-gray-500">{mat.total_linear_mm}mm total</span>
                  )}
                  {mat.lengths_needed != null && mat.lengths_needed > 0 && (
                    <span className="text-xs font-mono text-starlight-blue font-medium">{mat.lengths_needed}× {mat.standard_length_mm || 4800}mm</span>
                  )}
                  {mat.sheets_needed != null && mat.sheets_needed > 0 && (
                    <span className="text-xs font-mono text-starlight-blue font-medium">{mat.sheets_needed} sheet{mat.sheets_needed > 1 ? "s" : ""}</span>
                  )}
                  <span className="text-[10px] text-gray-400">{mat.total_parts} parts</span>
                  {mat.waste_pct != null && (
                    <span className={"text-[10px] " + (mat.waste_pct > 40 ? "text-starlight-amber" : "text-gray-400")}>{mat.waste_pct}% waste</span>
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
        <div className="border-t border-gray-100">
          <button onClick={() => setShowParts(!showParts)} className="w-full px-3 py-1.5 text-left text-[10px] text-gray-400 hover:text-gray-600">
            {showParts ? "▾" : "▸"} {parts.length} individual parts (reference)
          </button>
          {showParts && (
            <div className="overflow-x-auto max-h-48 overflow-y-auto border-t border-gray-50">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-[9px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
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
                    <tr key={idx} className="border-b border-gray-50">
                      <td className="px-2 py-0.5 text-navy">{p.description}</td>
                      <td className="px-2 py-0.5 text-gray-500">{p.material}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-gray-500">{p.length_mm || "—"}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-gray-500">{p.width_mm || "—"}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-gray-500">{p.thickness_mm || "—"}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-navy">{p.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add to BOM button */}
        <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <span className="text-[10px] text-gray-400">{selectedCount} material{selectedCount !== 1 ? "s" : ""} selected</span>
          <button onClick={addToBom} disabled={selectedCount === 0 || adding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-starlight-green text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {adding ? "Adding..." : `Add ${selectedCount} to BOM`}
          </button>
        </div>
      </div>
    );
  }
  return null;
}
