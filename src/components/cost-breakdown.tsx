"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CostLayer {
  label: string;
  labour: number;
  materials: number;
  total: number;
  colorClass: string;
}

interface Props {
  scopeItemId?: number;
  jobId?: number;
  quotedValue?: number;
}

function fmt(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

function pct(part: number, whole: number) {
  if (!whole) return "—";
  return ((part / whole) * 100).toFixed(1) + "%";
}

export function CostBreakdown({ scopeItemId, jobId, quotedValue }: Props) {
  const supabase = createClient();
  const [data, setData] = useState<{
    quotedTotal: number;
    quotedWorkshop: number;
    estLabour: number;
    estMaterials: number;
    actLabour: number;
    actMaterialsPlanned: number;
    actMaterialsReconciled: number;
    targetMarginPct: number;
    woCount: number;
    completedWOs: number;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [scopeItemId, jobId]);

  const load = async () => {
    setLoading(true);
    const col = scopeItemId ? "scope_item_id" : "job_id";
    const val = scopeItemId || jobId;
    if (!val) return;

    // Parallel fetch all data
    const [settRes, estRes, woRes] = await Promise.all([
      supabase.from("tbl_business_settings").select("setting_value")
        .eq("setting_key", "default_target_margin_pct").single(),
      supabase.from("qry_wo_estimated_cost").select("*").eq(col, val),
      supabase.from("tbl_work_orders").select("work_order_id, status")
        .eq(col, val).not("status", "eq", "Voided"),
    ]);

    // Get quoted values — at job level, separate workshop vs total
    let quotedTotal = quotedValue || 0;
    let quotedWorkshop = quotedValue || 0;
    if (jobId && !scopeItemId) {
      const { data: qlData } = await supabase
        .from("tbl_quote_lines")
        .select("line_value, category")
        .eq("job_id", jobId);
      if (qlData) {
        quotedTotal = qlData.reduce((s, l) => s + (l.line_value || 0), 0);
        const workshopCats = ["Workshop Build", "Workshop"];
        quotedWorkshop = qlData
          .filter(l => workshopCats.some(c => (l.category || "").toLowerCase().includes(c.toLowerCase())))
          .reduce((s, l) => s + (l.line_value || 0), 0);
      }
    }

    const targetPct = parseFloat(settRes.data?.setting_value || "40");
    const estRows = estRes.data || [];
    const wos = woRes.data || [];
    const woIds = wos.map(w => w.work_order_id);

    // Estimated from rate card view
    const estLabour = estRows.reduce((s, r) => s + (r.estimated_labour_cost || 0), 0);
    const estMaterials = estRows.reduce((s, r) => s + (r.estimated_material_cost || 0), 0);

    // Actuals — labour from time entries, materials from BOM
    let actLabour = 0;
    let actMatsPlanned = 0;
    let actMatsReconciled = 0;

    if (woIds.length > 0) {
      const [timeRes, bomRes] = await Promise.all([
        supabase.from("tbl_wo_time_entries").select("entry_cost").in("work_order_id", woIds),
        supabase.from("tbl_wo_bom").select("quantity, unit_cost, actual_unit_cost").in("work_order_id", woIds),
      ]);
      actLabour = (timeRes.data || []).reduce((s, r) => s + (r.entry_cost || 0), 0);
      for (const b of bomRes.data || []) {
        const qty = b.quantity || 0;
        actMatsPlanned += qty * (b.unit_cost || 0);
        actMatsReconciled += qty * (b.actual_unit_cost || b.unit_cost || 0);
      }
    }

    setData({
      quotedTotal, quotedWorkshop,
      estLabour, estMaterials,
      actLabour,
      actMaterialsPlanned: actMatsPlanned,
      actMaterialsReconciled: actMatsReconciled,
      targetMarginPct: targetPct,
      woCount: wos.length,
      completedWOs: wos.filter(w => w.status === "Complete").length,
    });
    setLoading(false);
  };

  if (loading) return <div className="text-xs text-gray-400 py-4">Loading cost analysis...</div>;
  if (!data) return null;

  const estTotal = data.estLabour + data.estMaterials;
  const committedTotal = data.actLabour + data.actMaterialsPlanned;
  const reconciledTotal = data.actLabour + data.actMaterialsReconciled;
  const hasReconciled = data.actMaterialsReconciled !== data.actMaterialsPlanned;

  // Margins — calculated against workshop quoted value (what we control)
  const q = data.quotedWorkshop; // workshop portion for margin calc
  const plannedMargin = q > 0 ? q - estTotal : 0;
  const plannedMarginPct = q > 0 ? (plannedMargin / q) * 100 : 0;
  const liveMargin = q > 0 ? q - committedTotal : 0;
  const liveMarginPct = q > 0 ? (liveMargin / q) * 100 : 0;
  const actualMargin = q > 0 ? q - reconciledTotal : 0;
  const actualMarginPct = q > 0 ? (actualMargin / q) * 100 : 0;
  const accuracy = estTotal > 0 ? ((committedTotal / estTotal) * 100) : 0;
  const showBothQuoted = data.quotedTotal > 0 && data.quotedTotal !== data.quotedWorkshop;

  const marginColor = (pct: number) =>
    pct >= data.targetMarginPct ? "text-starlight-green" :
    pct >= data.targetMarginPct * 0.5 ? "text-amber-500" :
    "text-starlight-red";

  const accuracyColor = accuracy === 0 ? "text-gray-400" :
    accuracy <= 110 && accuracy >= 90 ? "text-starlight-green" :
    accuracy <= 130 && accuracy >= 70 ? "text-amber-500" :
    "text-starlight-red";

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header bar — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          <span className="text-sm font-semibold text-navy">Cost analysis</span>
          <span className="text-xs text-gray-400">{data.completedWOs}/{data.woCount} WOs complete</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {data.quotedWorkshop > 0 && (
            <span className="text-gray-500">
              {showBothQuoted ? "Workshop " : "Quoted "}
              <span className="font-semibold text-gray-800">{fmt(data.quotedWorkshop)}</span>
              {showBothQuoted && <span className="text-gray-400 ml-1">(of {fmt(data.quotedTotal)})</span>}
            </span>
          )}
          {estTotal > 0 && (
            <span className="text-gray-500">Est. <span className="font-semibold text-gray-800">{fmt(estTotal)}</span></span>
          )}
          {committedTotal > 0 && (
            <span className="text-gray-500">Actual <span className="font-semibold text-gray-800">{fmt(committedTotal)}</span></span>
          )}
          {data.quotedWorkshop > 0 && committedTotal > 0 && (
            <span className={`font-semibold ${marginColor(liveMarginPct)}`}>
              {liveMarginPct.toFixed(1)}% margin
            </span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-200 px-4 py-4">
          {/* Layer grid */}
          <div className="grid grid-cols-5 gap-0 text-xs mb-4">
            {/* Headers */}
            <div className="text-gray-400 font-medium py-1.5 uppercase tracking-wider text-[10px]">Layer</div>
            <div className="text-gray-400 font-medium py-1.5 text-right uppercase tracking-wider text-[10px]">Labour</div>
            <div className="text-gray-400 font-medium py-1.5 text-right uppercase tracking-wider text-[10px]">Materials</div>
            <div className="text-gray-400 font-medium py-1.5 text-right uppercase tracking-wider text-[10px]">Total</div>
            <div className="text-gray-400 font-medium py-1.5 text-right uppercase tracking-wider text-[10px]">Margin</div>

            {/* Quoted row */}
            {data.quotedWorkshop > 0 && (
              <>
                <div className="py-2 border-t border-gray-100 font-medium text-purple-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                  {showBothQuoted ? "Quoted (workshop)" : "Quoted"}
                </div>
                <div className="py-2 border-t border-gray-100 text-right text-gray-400">—</div>
                <div className="py-2 border-t border-gray-100 text-right text-gray-400">—</div>
                <div className="py-2 border-t border-gray-100 text-right font-semibold text-gray-800">
                  {fmt(data.quotedWorkshop)}
                  {showBothQuoted && <span className="block text-[10px] text-gray-400 font-normal">of {fmt(data.quotedTotal)} total</span>}
                </div>
                <div className="py-2 border-t border-gray-100 text-right text-gray-400">—</div>
              </>
            )}

            {/* Estimated row */}
            <>
              <div className="py-2 border-t border-gray-100 font-medium text-blue-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span> Estimated
              </div>
              <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(data.estLabour)}</div>
              <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(data.estMaterials)}</div>
              <div className="py-2 border-t border-gray-100 text-right font-semibold text-gray-800">{fmt(estTotal)}</div>
              <div className={`py-2 border-t border-gray-100 text-right font-semibold ${marginColor(plannedMarginPct)}`}>
                {data.quotedWorkshop > 0 ? `${plannedMarginPct.toFixed(1)}%` : "—"}
              </div>
            </>

            {/* Committed row */}
            {committedTotal > 0 && (
              <>
                <div className="py-2 border-t border-gray-100 font-medium text-teal-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-400"></span> Committed
                </div>
                <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(data.actLabour)}</div>
                <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(data.actMaterialsPlanned)}</div>
                <div className="py-2 border-t border-gray-100 text-right font-semibold text-gray-800">{fmt(committedTotal)}</div>
                <div className={`py-2 border-t border-gray-100 text-right font-semibold ${marginColor(liveMarginPct)}`}>
                  {data.quotedWorkshop > 0 ? `${liveMarginPct.toFixed(1)}%` : "—"}
                </div>
              </>
            )}

            {/* Reconciled row — only if invoice prices differ */}
            {hasReconciled && (
              <>
                <div className="py-2 border-t border-gray-100 font-medium text-amber-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span> Reconciled
                </div>
                <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(data.actLabour)}</div>
                <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(data.actMaterialsReconciled)}</div>
                <div className="py-2 border-t border-gray-100 text-right font-semibold text-gray-800">{fmt(reconciledTotal)}</div>
                <div className={`py-2 border-t border-gray-100 text-right font-semibold ${marginColor(actualMarginPct)}`}>
                  {data.quotedWorkshop > 0 ? `${actualMarginPct.toFixed(1)}%` : "—"}
                </div>
              </>
            )}
          </div>

          {/* Insight cards */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200">
            {/* Target vs actual */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Target margin</p>
              <p className="text-lg font-bold text-gray-800">{data.targetMarginPct}%</p>
              <p className="text-[10px] text-gray-400">
                {data.quotedWorkshop > 0 ? `Budget: ${fmt(data.quotedWorkshop * (1 - data.targetMarginPct / 100))}` : "No quote linked"}
              </p>
            </div>

            {/* Estimate accuracy */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Estimate accuracy</p>
              <p className={`text-lg font-bold ${accuracyColor}`}>
                {committedTotal > 0 && estTotal > 0 ? `${accuracy.toFixed(0)}%` : "—"}
              </p>
              <p className="text-[10px] text-gray-400">
                {accuracy > 0 ? (accuracy > 100 ? "Over budget" : "Under budget") : "No actuals yet"}
              </p>
            </div>

            {/* Best margin */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                {hasReconciled ? "Actual margin" : committedTotal > 0 ? "Live margin" : "Planned margin"}
              </p>
              <p className={`text-lg font-bold ${marginColor(hasReconciled ? actualMarginPct : committedTotal > 0 ? liveMarginPct : plannedMarginPct)}`}>
                {data.quotedWorkshop > 0
                  ? `${(hasReconciled ? actualMarginPct : committedTotal > 0 ? liveMarginPct : plannedMarginPct).toFixed(1)}%`
                  : "—"}
              </p>
              <p className="text-[10px] text-gray-400">
                {data.quotedWorkshop > 0 ? fmt(hasReconciled ? actualMargin : committedTotal > 0 ? liveMargin : plannedMargin) + " profit" : "No quote linked"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
