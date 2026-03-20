"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatDate } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import { Printer, RotateCw, Loader2, Check } from "lucide-react";

/* ================================================================
   Types
   ================================================================ */

interface TravellerWO {
  work_order_id: number;
  job_id: number | null;
  scope_item_id: number | null;
  description: string | null;
  estimated_duration_hrs: number | null;
  complexity_construction: string | null;
  finish_relative: string | null;
  status: string | null;
  wo_sequence: number | null;
  activity_label: string;
  phase_number?: number | null;
  lead_name?: string | null;
  traveller_printed_at?: string | null;
}

interface BOM {
  bom_id: number;
  item_description: string | null;
  quantity: number | null;
  unit: string | null;
  needs_ordering: string | boolean | null;
  material_id: number | null;
  mat_standard_length: number | null;
  mat_standard_sheet_size: string | null;
  mat_unit: string | null;
}

interface Doc {
  doc_id: number;
  doc_type: string;
  file_name: string;
  onedrive_path: string | null;
  caption: string | null;
  extracted_data: any;
  extraction_status: string | null;
}

interface LinkedItem {
  item_id: number;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  item_type: string | null;
  finish_required: string | null;
}

interface Scope {
  scope_item_id: number;
  job_id: number;
  item_name: string | null;
  scope_status: string | null;
  complexity_construction: string | null;
  finish_relative: string | null;
  event_zone: string | null;
  job_name: string | null;
  job_number: string | null;
  event_date: string | null;
}

interface WOData {
  wo: TravellerWO;
  bom: BOM[];
  docs: Doc[];
  linkedItems: LinkedItem[];
  imageUrls: Record<number, string>;
  pdfPageUrls: Record<number, string[]>;
}

/* ================================================================
   Main Page
   ================================================================ */

export default function TravellerPage() {
  const supabase = createClient();
  const [scope, setScope] = useState<Scope | null>(null);
  const [allWOs, setAllWOs] = useState<TravellerWO[]>([]);
  const [woDataMap, setWoDataMap] = useState<Record<number, WOData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);
  const [rotations, setRotations] = useState<Record<string, number>>({});

  // Parse URL params
  const [scopeId, setScopeId] = useState<number>(0);
  const [mode, setMode] = useState<"single" | "pack">("single");
  const [singleWoId, setSingleWoId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setScopeId(Number(params.get("scopeId") || 0));
    setMode((params.get("mode") as "single" | "pack") || "single");
    setSingleWoId(params.get("woId") ? Number(params.get("woId")) : null);
  }, []);

  // Load all data
  const loadData = useCallback(async () => {
    if (!scopeId) return;
    setLoading(true);

    // 1. Scope context
    const { data: scopeData } = await supabase
      .from("qry_scope_context").select("*").eq("scope_item_id", scopeId).single();
    if (!scopeData) { setError("Scope item not found"); setLoading(false); return; }
    setScope(scopeData as Scope);

    // 2. All WOs for this scope (for enrichment)
    const { data: rawWOs } = await supabase
      .from("qry_wo_phase_ordered").select("*").eq("scope_item_id", scopeId);
    if (!rawWOs) { setError("No work orders found"); setLoading(false); return; }

    // 3. Enrich with activity labels
    const woIds = rawWOs.map((w: any) => w.work_order_id);
    const { data: actData } = await supabase
      .from("tbl_wo_activities").select("work_order_id, activity_id, sequence")
      .in("work_order_id", woIds).order("sequence");

    const activityIds = actData ? [...new Set(actData.map((a: any) => a.activity_id))] : [];
    const verbIds = rawWOs.map((w: any) => w.activity_verb).filter(Boolean);
    const allLookupIds = [...new Set([...activityIds, ...verbIds])];

    let lookupMap: Record<number, { value: string; phase: number | null }> = {};
    if (allLookupIds.length > 0) {
      const { data: lookups } = await supabase
        .from("tbl_master_lookups").select("lookup_id, lookup_value, phase_number")
        .in("lookup_id", allLookupIds);
      if (lookups) lookups.forEach((l: any) => {
        lookupMap[l.lookup_id] = { value: l.lookup_value || "", phase: l.phase_number };
      });
    }

    const actByWO: Record<number, any[]> = {};
    if (actData) actData.forEach((a: any) => {
      if (!actByWO[a.work_order_id]) actByWO[a.work_order_id] = [];
      actByWO[a.work_order_id].push(a);
    });

    const { data: freelancers } = await supabase
      .from("tbl_freelancers").select("freelancer_id, freelancer_name").eq("active", true);
    const flMap: Record<number, string> = {};
    if (freelancers) freelancers.forEach((f: any) => { flMap[f.freelancer_id] = f.freelancer_name; });

    const enriched: TravellerWO[] = rawWOs.map((wo: any) => {
      const acts = actByWO[wo.work_order_id];
      let label = "No Activity";
      let phase: number | null = null;
      if (acts && acts.length > 0) {
        acts.sort((a: any, b: any) => a.sequence - b.sequence);
        label = acts.map((a: any) => lookupMap[a.activity_id]?.value || "?").join(" + ");
        phase = lookupMap[acts[0].activity_id]?.phase ?? null;
      } else if (wo.activity_verb && lookupMap[wo.activity_verb]) {
        label = lookupMap[wo.activity_verb].value;
        phase = lookupMap[wo.activity_verb].phase;
      }
      return {
        ...wo,
        activity_label: label,
        phase_number: phase,
        lead_name: wo.planned_lead_id ? flMap[wo.planned_lead_id] || null : null,
      };
    });

    setAllWOs(enriched);

    // 4. Determine which WOs to print
    const toPrint = mode === "single" && singleWoId
      ? enriched.filter((w) => w.work_order_id === singleWoId)
      : enriched.filter((w) => w.status !== "Voided")
          .sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999));

    // 5. Load BOM, docs, linked items, image URLs for each
    const dataMap: Record<number, WOData> = {};
    for (const wo of toPrint) {
      const [bomRes, docsRes, jxnRes] = await Promise.all([
        supabase.from("tbl_wo_bom")
          .select("bom_id, item_description, quantity, unit, needs_ordering, material_id")
          .eq("work_order_id", wo.work_order_id).order("bom_id"),
        supabase.from("tbl_wo_documents")
          .select("doc_id, doc_type, file_name, onedrive_path, caption, sort_order, extracted_data, extraction_status")
          .eq("work_order_id", wo.work_order_id).order("sort_order"),
        supabase.from("tbl_jobitem_workorder")
          .select("job_item_id").eq("work_order_id", wo.work_order_id),
      ]);

      let linkedItems: LinkedItem[] = [];
      if (jxnRes.data && jxnRes.data.length > 0) {
        const ids = jxnRes.data.map((j: any) => j.job_item_id);
        const { data: items } = await supabase.from("tbl_job_items")
          .select("item_id, description, quantity, unit, item_type, finish_required")
          .in("item_id", ids);
        linkedItems = (items || []) as LinkedItem[];
      }

      const docs = (docsRes.data || []) as Doc[];
      const imageUrls: Record<number, string> = {};
      const pdfPageUrls: Record<number, string[]> = {};

      for (const doc of docs) {
        if (!doc.onedrive_path) continue;
        try {
          const url = await getOneDriveUrl(doc.onedrive_path);
          if (doc.doc_type === "drawing" || doc.doc_type === "reference") {
            imageUrls[doc.doc_id] = url;
          }
          if (doc.doc_type === "cut_list") {
            // For PDFs, we store the download URL and render via pdf.js
            pdfPageUrls[doc.doc_id] = [url];
          }
        } catch (_e) {
          // Skip unavailable files
        }
      }

      // Enrich BOM with material catalogue data (standard lengths, sheet sizes)
      const rawBom = (bomRes.data || []) as any[];
      const matIds = rawBom.map((b: any) => b.material_id).filter(Boolean);
      let matMap: Record<number, { standard_length: number | null; standard_sheet_size: string | null; unit: string | null }> = {};
      if (matIds.length > 0) {
        const { data: mats } = await supabase.from("tbl_materials")
          .select("material_id, standard_length, standard_sheet_size, unit")
          .in("material_id", matIds);
        if (mats) mats.forEach((m: any) => {
          matMap[m.material_id] = { standard_length: m.standard_length, standard_sheet_size: m.standard_sheet_size, unit: m.unit };
        });
      }
      const enrichedBom: BOM[] = rawBom.map((b: any) => {
        const mat = b.material_id ? matMap[b.material_id] : null;
        return {
          ...b,
          mat_standard_length: mat?.standard_length || null,
          mat_standard_sheet_size: mat?.standard_sheet_size || null,
          mat_unit: mat?.unit || null,
        };
      });

      dataMap[wo.work_order_id] = {
        wo, bom: enrichedBom, docs, linkedItems, imageUrls, pdfPageUrls,
      };
    }

    setWoDataMap(dataMap);
    setLoading(false);
  }, [scopeId, mode, singleWoId]);

  useEffect(() => {
    if (scopeId > 0) loadData();
  }, [scopeId, loadData]);

  // Print handler
  const handlePrint = async () => {
    if (!scope) return;
    const toPrint = wosToPrint;
    const now = new Date().toISOString();

    for (const wo of toPrint) {
      await supabase.from("tbl_work_orders").update({
        traveller_printed_at: now,
      }).eq("work_order_id", wo.work_order_id);

      if (wo.status === "Not-Started") {
        await supabase.from("tbl_work_orders").update({
          status: "Ready",
        }).eq("work_order_id", wo.work_order_id);
      }
    }

    setPrinted(true);
    setTimeout(() => window.print(), 300);
  };

  // Rotation
  const toggleRotation = (key: string) => {
    setRotations((prev) => ({ ...prev, [key]: ((prev[key] || 0) + 90) % 360 }));
  };

  // Derived
  const wosToPrint = mode === "single" && singleWoId
    ? allWOs.filter((w) => w.work_order_id === singleWoId)
    : allWOs.filter((w) => w.status !== "Voided")
        .sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999));

  const siblingWOs = mode === "single" && singleWoId
    ? allWOs.filter((w) => w.work_order_id !== singleWoId && w.status !== "Voided")
    : [];

  const daysRemaining = scope?.event_date
    ? Math.ceil((new Date(scope.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const nowStr = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  // Count pages
  let totalPages = 0;
  for (const wo of wosToPrint) {
    const data = woDataMap[wo.work_order_id];
    if (!data) continue;
    if (mode === "pack" && wosToPrint.indexOf(wo) > 0) totalPages++;
    totalPages++; // task brief
    const cutLists = data.docs.filter((d) => d.doc_type === "cut_list");
    for (const cl of cutLists) {
      const pages = data.pdfPageUrls[cl.doc_id];
      totalPages += pages ? pages.length : 1;
    }
    totalPages += data.docs.filter((d) => d.doc_type === "drawing").length;
    totalPages += data.docs.filter((d) => d.doc_type === "reference").length;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading traveller...</p>
          <p className="text-xs text-gray-400 mt-1">Fetching documents from OneDrive</p>
        </div>
      </div>
    );
  }

  if (error || !scope) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-red-500 text-sm">{error || "Failed to load"}</p>
      </div>
    );
  }

  // Build pages
  let pageNum = 0;
  const pages: React.ReactNode[] = [];

  for (let woIdx = 0; woIdx < wosToPrint.length; woIdx++) {
    const wo = wosToPrint[woIdx];
    const data = woDataMap[wo.work_order_id];
    if (!data) continue;

    const drawings = data.docs.filter((d) => d.doc_type === "drawing");
    const references = data.docs.filter((d) => d.doc_type === "reference");
    const cutLists = data.docs.filter((d) => d.doc_type === "cut_list");

    // Pack divider
    if (mode === "pack" && woIdx > 0) {
      pageNum++;
      pages.push(
        <Page key={`div-${wo.work_order_id}`} scope={scope} wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} pageNum={pageNum} totalPages={totalPages} printDate={nowStr}>
          <div className="flex items-center justify-center" style={{ minHeight: "240mm" }}>
            <div className="text-center">
              <p className="text-5xl font-bold text-gray-800 mb-3">Step {woIdx + 1}/{wosToPrint.length}</p>
              <p className="text-2xl font-semibold text-gray-600 mb-4">{wo.activity_label}</p>
              {wo.description && <p className="text-base text-gray-500 max-w-lg mx-auto">{wo.description}</p>}
              <div className="mt-6 flex items-center justify-center gap-4 text-sm text-gray-400">
                {wo.estimated_duration_hrs != null && <span>Est. {wo.estimated_duration_hrs}h</span>}
                {wo.lead_name && <span>Lead: {wo.lead_name}</span>}
              </div>
            </div>
          </div>
        </Page>
      );
    }

    // Task brief
    pageNum++;
    pages.push(
      <Page key={`brief-${wo.work_order_id}`} scope={scope} wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} pageNum={pageNum} totalPages={totalPages} printDate={nowStr}>
        <TaskBrief wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} bom={data.bom} linkedItems={data.linkedItems} scope={scope} siblingWOs={siblingWOs} daysRemaining={daysRemaining} drawingCount={drawings.length} referenceCount={references.length} cutListCount={cutLists.length} />
      </Page>
    );

    // Cut list pages (PDF rendered as images)
    for (const cl of cutLists) {
      const urls = data.pdfPageUrls[cl.doc_id];
      if (urls && urls.length > 0) {
        for (let pi = 0; pi < urls.length; pi++) {
          pageNum++;
          const rKey = `pdf-${cl.doc_id}-${pi}`;
          pages.push(
            <Page key={rKey} scope={scope} wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} pageNum={pageNum} totalPages={totalPages} printDate={nowStr}>
              <ImagePage url={urls[pi]} fileName={cl.file_name} label="Cut list" rotationKey={rKey} rotation={rotations[rKey] || 0} onRotate={() => toggleRotation(rKey)} isPdf />
            </Page>
          );
        }
      } else {
        pageNum++;
        pages.push(
          <Page key={`cl-${cl.doc_id}`} scope={scope} wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} pageNum={pageNum} totalPages={totalPages} printDate={nowStr}>
            <div className="text-center py-20 text-gray-400 text-sm">Cut list file not available for preview</div>
          </Page>
        );
      }
    }

    // Drawings
    for (const d of drawings) {
      pageNum++;
      const rKey = `drw-${d.doc_id}`;
      pages.push(
        <Page key={rKey} scope={scope} wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} pageNum={pageNum} totalPages={totalPages} printDate={nowStr}>
          <ImagePage url={data.imageUrls[d.doc_id] || ""} fileName={d.file_name} label="Drawing" rotationKey={rKey} rotation={rotations[rKey] || 0} onRotate={() => toggleRotation(rKey)} />
        </Page>
      );
    }

    // References
    for (const r of references) {
      pageNum++;
      const rKey = `ref-${r.doc_id}`;
      pages.push(
        <Page key={rKey} scope={scope} wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} pageNum={pageNum} totalPages={totalPages} printDate={nowStr}>
          <ImagePage url={data.imageUrls[r.doc_id] || ""} fileName={r.file_name} label="Reference" rotationKey={rKey} rotation={rotations[rKey] || 0} onRotate={() => toggleRotation(rKey)} />
        </Page>
      );
    }
  }

  return (
    <div className="bg-gray-100 min-h-screen print:bg-white">
      {/* Floating toolbar — hidden on print */}
      <div className="print:hidden fixed top-0 left-0 right-0 z-50 bg-[#1A1A2E] text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div>
          <p className="text-sm font-medium">
            Traveller — {mode === "pack" ? "Scope Pack" : "Single WO"}
          </p>
          <p className="text-xs text-white/50">
            {scope.job_number} — {scope.item_name} — {totalPages} pages
          </p>
        </div>
        <div className="flex items-center gap-3">
          {wosToPrint.some((w) => w.status === "Not-Started") && !printed && (
            <span className="text-xs bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full">
              Will set Not-Started → Ready
            </span>
          )}
          {printed && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Timestamps saved
            </span>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 bg-white text-[#1A1A2E] font-medium text-sm rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print{!printed ? " & Release" : ""}
          </button>
        </div>
      </div>

      {/* Pages */}
      <div className="pt-16 print:pt-0 pb-8 print:pb-0">
        {pages}
      </div>
    </div>
  );
}

/* ================================================================
   Page Frame (header + footer + double border on every page)
   ================================================================ */

function Page({ scope, wo, woIdx, totalWOs, pageNum, totalPages, printDate, children }: {
  scope: Scope; wo: TravellerWO; woIdx: number; totalWOs: number;
  pageNum: number; totalPages: number; printDate: string;
  children: React.ReactNode;
}) {
  return (
    <div className="traveller-page bg-white mx-auto my-4 print:my-0 relative" style={{ width: "200mm", minHeight: "287mm", border: "2px solid #1A1A2E", pageBreakAfter: "always", pageBreakInside: "avoid" }}>
      <div className="absolute inset-[3px] border border-gray-400 pointer-events-none" style={{ zIndex: 0 }} />
      <div className="relative" style={{ zIndex: 1, padding: "7mm 8mm" }}>
        {/* Header */}
        <div className="text-[9px] pb-2 mb-3 border-b border-gray-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">{scope.job_number}</span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600">{scope.job_name}</span>
            </div>
            <span className="font-semibold text-gray-700 shrink-0">Step {woIdx + 1}/{totalWOs} {wo.activity_label}</span>
          </div>
          <p className="text-gray-500 mt-0.5 leading-tight">{scope.item_name}</p>
        </div>

        {/* Content */}
        <div style={{ minHeight: "252mm" }}>{children}</div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[9px] text-gray-400 pt-2 mt-3 border-t border-gray-300">
          <span>Printed: {printDate}</span>
          <span className="font-medium text-gray-500">Page {pageNum} of {totalPages}</span>
          <span>WO-{wo.work_order_id} · Starlight</span>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Task Brief (page 1 content)
   ================================================================ */

function TaskBrief({ wo, woIdx, totalWOs, bom, linkedItems, scope, siblingWOs, daysRemaining, drawingCount, referenceCount, cutListCount }: {
  wo: TravellerWO; woIdx: number; totalWOs: number; bom: BOM[]; linkedItems: LinkedItem[];
  scope: Scope; siblingWOs: TravellerWO[]; daysRemaining: number | null;
  drawingCount: number; referenceCount: number; cutListCount: number;
}) {
  return (
    <div className="space-y-3 text-[13px]">
      {/* Header with QR */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900">{scope.job_number} — {scope.job_name}</h1>
          <p className="text-sm font-medium text-gray-700 mt-1 break-words">{scope.item_name}</p>
          <p className="text-xs text-gray-500 mt-1">
            <span className="font-semibold text-gray-800">Step {woIdx + 1}/{totalWOs} — {wo.activity_label}</span>
            {" · "}Est. {wo.estimated_duration_hrs ?? "—"}h
            {" · "}Event: {formatDate(scope.event_date)}
          </p>
        </div>
        <div className="w-[72px] h-[72px] border-2 border-dashed border-gray-300 rounded flex items-center justify-center shrink-0 text-center">
          <span className="text-[7px] text-gray-400 leading-tight">QR CODE<br />/m/wo/{wo.work_order_id}</span>
        </div>
      </div>

      <hr className="border-gray-300" />

      {/* Full description */}
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Task description</p>
        <p className="text-[13px] text-gray-800 bg-gray-50 px-3 py-2 rounded leading-snug break-words whitespace-pre-wrap">{wo.description || "No description provided"}</p>
      </div>

      <hr className="border-gray-300" />

      {/* BOM */}
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Bill of materials</p>
        {bom.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No materials assigned</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 print:bg-gray-100">
                <th className="text-left py-1 px-2 font-semibold text-gray-600">Material</th>
                <th className="text-right py-1 px-2 font-semibold text-gray-600 w-14">Qty</th>
                <th className="text-right py-1 px-2 font-semibold text-gray-600 w-14">Unit</th>
                <th className="text-left py-1 px-2 font-semibold text-gray-600 w-36">Stock pull</th>
                <th className="text-right py-1 px-2 font-semibold text-gray-600 w-16">Order?</th>
              </tr>
            </thead>
            <tbody>
              {bom.map((r) => {
                let stockPull = "";
                let qtyDisplay = `${r.quantity ?? "—"}`;
                let unitDisplay = r.unit || "—";

                if (r.mat_standard_length && r.quantity) {
                  // BOM stores whole-length Metres for costing
                  // Traveller shows length count for the workshop floor
                  const uLower = unitDisplay.toLowerCase();
                  const qtyMm = (uLower.startsWith("metre") || uLower === "m") ? r.quantity * 1000
                    : uLower === "mm" ? r.quantity
                    : r.quantity;
                  const stdLenMm = r.mat_standard_length;
                  const lengths = Math.round(qtyMm / stdLenMm);
                  qtyDisplay = `${lengths}`;
                  unitDisplay = lengths === 1 ? "length" : "lengths";
                  stockPull = `${stdLenMm}mm each`;
                } else if (r.unit?.toLowerCase() === "mm" && r.quantity) {
                  qtyDisplay = `${Math.round(r.quantity)}mm`;
                  unitDisplay = "";
                } else if (r.mat_standard_sheet_size && r.quantity) {
                  stockPull = `${r.quantity} sheet${r.quantity > 1 ? "s" : ""} (${r.mat_standard_sheet_size})`;
                }
                return (
                  <tr key={r.bom_id} className="border-b border-gray-100">
                    <td className="py-1 px-2 text-gray-800">{r.item_description || "—"}</td>
                    <td className="py-1 px-2 text-right">{qtyDisplay}</td>
                    <td className="py-1 px-2 text-right text-gray-600">{unitDisplay}</td>
                    <td className="py-1 px-2 text-[10px] text-gray-500">{stockPull || "—"}</td>
                    <td className="py-1 px-2 text-right text-[10px] text-gray-500">{isTruthy(r.needs_ordering) ? "needs order" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <hr className="border-gray-300" />

      {/* Linked items */}
      {linkedItems.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Linked job items</p>
          {linkedItems.map((it) => (
            <div key={it.item_id} className="flex items-start gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
              <span className="text-xs text-gray-800">{it.quantity && it.quantity > 1 ? `${it.quantity}x ` : ""}{it.description}{it.item_type ? ` · ${it.item_type}` : ""}{it.finish_required ? ` · ${it.finish_required}` : ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* Docs summary */}
      {(drawingCount > 0 || referenceCount > 0 || cutListCount > 0) && (
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Documents</p>
          <p className="text-xs text-gray-600">
            {[drawingCount > 0 && `${drawingCount} drawing${drawingCount > 1 ? "s" : ""}`, referenceCount > 0 && `${referenceCount} ref`, cutListCount > 0 && `${cutListCount} cut list`].filter(Boolean).join(" · ")}
            <span className="text-gray-400"> — following pages</span>
          </p>
        </div>
      )}

      {/* Sibling WOs */}
      {siblingWOs.length > 0 && (
        <>
          <hr className="border-gray-300" />
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Other work orders on this scope item</p>
            {siblingWOs.sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999)).map((s) => {
              const all = [...siblingWOs, wo].sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999));
              const idx = all.findIndex((x) => x.work_order_id === s.work_order_id);
              return (
                <p key={s.work_order_id} className="text-xs text-gray-600 mb-0.5">
                  <span className="text-gray-400 inline-block w-7">{idx + 1}/{all.length}</span>
                  <span className="font-medium">{s.activity_label}</span>
                  {" · "}{s.estimated_duration_hrs != null ? `${s.estimated_duration_hrs}h` : "—"}
                  {" · "}<span className={s.status === "Complete" ? "text-green-600" : s.status === "In-Progress" ? "text-blue-600" : "text-gray-400"}>{s.status}</span>
                  {s.lead_name && ` · ${s.lead_name}`}
                </p>
              );
            })}
          </div>
        </>
      )}

      <hr className="border-gray-300" />

      {/* Notes */}
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Notes / special instructions</p>
        <div className="border border-dashed border-gray-300 rounded h-14" />
      </div>

      {/* Sign-off */}
      <div>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Sign-off</p>
        <div className="space-y-2 text-xs text-gray-600">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-end gap-3 border-b border-gray-200 pb-1.5">
              <div className="flex-1"><span className="text-gray-400 text-[10px]">{n === 1 ? "Started" : "Completed"} by: </span><span className="inline-block w-44 border-b border-gray-300 ml-1" /></div>
              <div><span className="text-gray-400 text-[10px]">Hours: </span><span className="inline-block w-12 border-b border-gray-300" /></div>
              <div><span className="text-gray-400 text-[10px]">Date: </span><span className="inline-block w-20 border-b border-gray-300" /></div>
            </div>
          ))}
        </div>
      </div>

      {/* Completion notes */}
      <div className="mt-1">
        <p className="text-[9px] text-gray-400 mb-0.5">Notes on completion:</p>
        <div className="border border-dashed border-gray-300 rounded h-10" />
      </div>
    </div>
  );
}

/* ================================================================
   Image Page (drawings, references, cut list PDF pages)
   ================================================================ */

function ImagePage({ url, fileName, label, rotationKey, rotation, onRotate, isPdf }: {
  url: string; fileName: string; label: string;
  rotationKey: string; rotation: number; onRotate: () => void;
  isPdf?: boolean;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [pdfRendered, setPdfRendered] = useState(false);

  // Auto-detect landscape for images
  useEffect(() => {
    if (isPdf || !url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (img.naturalWidth > img.naturalHeight * 1.2) {
        setIsLandscape(true);
        if (rotation === 0) {
          // Auto-rotate landscape images 90° so they fill portrait page
          onRotate();
        }
      }
    };
    img.src = url;
  }, [url, isPdf]);

  // Render PDF via pdf.js
  useEffect(() => {
    if (!isPdf || !url || !canvasRef.current) return;
    const renderPdf = async () => {
      try {
        // @ts-ignore - loaded from CDN
        const pdfjsLib = window.pdfjsLib;
        if (!pdfjsLib) return;
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const pdf = await pdfjsLib.getDocument(url).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = canvasRef.current!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        setPdfRendered(true);
        // Check landscape
        if (viewport.width > viewport.height * 1.2) {
          setIsLandscape(true);
        }
      } catch (_e) {
        console.error("PDF render failed:", _e);
      }
    };
    renderPdf();
  }, [isPdf, url]);

  const effectiveRotation = rotation;
  const isRotated = effectiveRotation === 90 || effectiveRotation === 270;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-[9px] text-gray-400 truncate max-w-[260px]">{fileName}</p>
          <button onClick={onRotate} className="print:hidden p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" title="Rotate 90°">
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ minHeight: "230mm" }}>
        {isPdf ? (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full object-contain"
            style={{
              transform: `rotate(${effectiveRotation}deg)`,
              maxWidth: isRotated ? "260mm" : "184mm",
              maxHeight: isRotated ? "184mm" : "240mm",
            }}
          />
        ) : url ? (
          <img
            ref={imgRef}
            src={url}
            alt={fileName}
            crossOrigin="anonymous"
            className="object-contain"
            style={{
              transform: `rotate(${effectiveRotation}deg)`,
              maxWidth: isRotated ? "250mm" : "184mm",
              maxHeight: isRotated ? "184mm" : "240mm",
            }}
          />
        ) : (
          <p className="text-gray-400 text-sm">Image not available</p>
        )}
      </div>
    </div>
  );
}
