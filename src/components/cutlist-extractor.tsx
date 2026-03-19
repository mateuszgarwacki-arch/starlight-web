"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import { Loader2, Check, Plus, X, FileText, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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

export function CutListExtractor({
  docId, workOrderId, jobId, onedrivePath, fileName,
  mimeType, extractionStatus, extractedData, onUpdate,
}: CutListExtractorProps) {
  const supabase = createClient();
  const [extracting, setExtracting] = useState(false);
  const [lines, setLines] = useState<ExtractedLine[]>(
    extractedData?.lines?.map((l: any) => ({ ...l, _selected: true })) || []
  );
  const [summary, setSummary] = useState<any>(extractedData?.summary || null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const handleExtract = async () => {
    if (!onedrivePath) return;
    setExtracting(true);
    setError(null);

    try {
      let body: any = { file_name: fileName };
      const isCSV = fileName.toLowerCase().endsWith(".csv");

      if (isCSV) {
        // Download CSV content and send as text
        const url = await getOneDriveUrl(onedrivePath);
        const res = await fetch(url);
        const text = await res.text();
        body.csv_text = text;
      } else {
        // Download file as base64 for PDF/image
        const url = await getOneDriveUrl(onedrivePath);
        const res = await fetch(url);
        const blob = await res.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(blob);
        });
        body.file_data = base64;
        body.media_type = mimeType || "application/pdf";
      }

      const { data: { session } } = await supabase.auth.getSession();
      const extractRes = await fetch("/api/extract-cutlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(body),
      });

      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({}));
        throw new Error(err.error || `Extraction failed: ${extractRes.status}`);
      }

      const data = await extractRes.json();
      const extractedLines = (data.lines || []).map((l: any) => ({ ...l, _selected: true }));
      setLines(extractedLines);
      setSummary(data.summary || null);

      // Save to database
      await supabase.from("tbl_wo_documents").update({
        extraction_status: "extracted",
        extracted_data: data,
      }).eq("doc_id", docId);

    } catch (err: any) {
      setError(err.message);
    }
    setExtracting(false);
  };

  const toggleLine = (idx: number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, _selected: !l._selected } : l));
  };

  const toggleAll = () => {
    const allSelected = lines.every(l => l._selected);
    setLines(prev => prev.map(l => ({ ...l, _selected: !allSelected })));
  };

  const addToBom = async () => {
    const selected = lines.filter(l => l._selected);
    if (selected.length === 0) return;
    setAdding(true);

    // Look up material categories from master lookups
    const { data: lookups } = await supabase
      .from("tbl_master_lookups")
      .select("lookup_id, lookup_value")
      .eq("category", "MATERIAL_CATEGORY")
      .eq("active", true);
    const catMap: Record<string, number> = {};
    (lookups || []).forEach((l: any) => { catMap[l.lookup_value?.toLowerCase()] = l.lookup_id; });

    // Search materials catalogue for matches
    const { data: materials } = await supabase
      .from("tbl_materials")
      .select("material_id, material_name, unit, current_unit_cost, material_category")
      .eq("active", true);

    for (const line of selected) {
      // Try to match material from catalogue
      const matLower = (line.material || "").toLowerCase();
      const matched = (materials || []).find(m =>
        m.material_name?.toLowerCase().includes(matLower) || matLower.includes(m.material_name?.toLowerCase() || "---")
      );

      // Build description with dimensions
      let desc = line.description || line.material || "Unknown";
      if (line.length_mm || line.width_mm) {
        const dims = [line.length_mm, line.width_mm, line.thickness_mm].filter(Boolean).join(" x ");
        desc += ` (${dims}mm)`;
      }

      const catKey = (line.material_category || "other").toLowerCase();
      const categoryId = catMap[catKey] || null;

      await supabase.from("tbl_wo_bom").insert({
        work_order_id: workOrderId,
        job_id: jobId,
        material_id: matched?.material_id || null,
        material_category: matched?.material_category || categoryId,
        item_description: desc,
        quantity: line.quantity || 1,
        unit: matched?.unit || line.unit || "Each",
        unit_cost: matched?.current_unit_cost || null,
        needs_ordering: matched ? "false" : "true",
        notes: line.notes || null,
      });
    }

    // Update status to confirmed
    await supabase.from("tbl_wo_documents").update({
      extraction_status: "confirmed",
    }).eq("doc_id", docId);

    setAdding(false);
    onUpdate();
  };

  const selectedCount = lines.filter(l => l._selected).length;

  // Pending state - show extract button
  if (extractionStatus === "pending" || (!extractionStatus && lines.length === 0)) {
    return (
      <div className="mt-2 p-3 bg-starlight-amber/5 border border-starlight-amber/20 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-starlight-amber" />
            <span className="text-xs text-gray-600">{fileName}</span>
          </div>
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-starlight-amber text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {extracting ? "Extracting..." : "Extract BOM"}
          </button>
        </div>
        {error && <p className="text-xs text-starlight-red mt-2">{error}</p>}
      </div>
    );
  }

  // Confirmed state
  if (extractionStatus === "confirmed") {
    return (
      <div className="mt-2 p-2 bg-starlight-green/5 border border-starlight-green/20 rounded-lg">
        <div className="flex items-center gap-2">
          <Check className="h-3.5 w-3.5 text-starlight-green" />
          <span className="text-[10px] text-starlight-green font-medium">
            {extractedData?.lines?.length || 0} lines added to BOM
          </span>
        </div>
      </div>
    );
  }

  // Extracted state - show review table
  if (lines.length > 0) {
    return (
      <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
        {summary && (
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-[10px] text-gray-500">
              {summary.total_parts} parts · {summary.material_types?.join(", ") || "mixed"} · {summary.source_format || ""}
            </span>
            <button onClick={toggleAll} className="text-[10px] text-starlight-blue font-medium">
              {lines.every(l => l._selected) ? "Deselect All" : "Select All"}
            </button>
          </div>
        )}
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-[9px] text-gray-400 uppercase tracking-wider border-b border-gray-200">
                <th className="px-2 py-1.5 text-center w-8"></th>
                <th className="px-2 py-1.5 text-left">Description</th>
                <th className="px-2 py-1.5 text-left">Material</th>
                <th className="px-2 py-1.5 text-right">L mm</th>
                <th className="px-2 py-1.5 text-right">W mm</th>
                <th className="px-2 py-1.5 text-right">T mm</th>
                <th className="px-2 py-1.5 text-right">Qty</th>
                <th className="px-2 py-1.5 text-left">Cat</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} className={"border-b border-gray-50 " + (line._selected ? "" : "opacity-40")}>
                  <td className="px-2 py-1 text-center">
                    <input type="checkbox" checked={!!line._selected} onChange={() => toggleLine(idx)} className="h-3 w-3 rounded border-gray-300" />
                  </td>
                  <td className="px-2 py-1 text-navy font-medium max-w-[160px] truncate" title={line.description}>{line.description}</td>
                  <td className="px-2 py-1 text-gray-500 max-w-[120px] truncate" title={line.material}>{line.material}</td>
                  <td className="px-2 py-1 text-right font-mono text-gray-600">{line.length_mm || "—"}</td>
                  <td className="px-2 py-1 text-right font-mono text-gray-600">{line.width_mm || "—"}</td>
                  <td className="px-2 py-1 text-right font-mono text-gray-600">{line.thickness_mm || "—"}</td>
                  <td className="px-2 py-1 text-right font-mono text-navy font-medium">{line.quantity}</td>
                  <td className="px-2 py-1 text-gray-400">{line.material_category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          {error && <p className="text-xs text-starlight-red flex-1">{error}</p>}
          <span className="text-[10px] text-gray-400">{selectedCount} of {lines.length} selected</span>
          <button
            onClick={addToBom}
            disabled={selectedCount === 0 || adding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-starlight-green text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {adding ? "Adding..." : `Add ${selectedCount} to BOM`}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
