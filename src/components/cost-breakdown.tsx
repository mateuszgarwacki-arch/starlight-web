"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { createClient } from "@/lib/supabase-browser";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface QuoteLine {
  quote_line_id: number;
  line_number: string | null;
  line_text: string | null;
  line_value: number | null;
  event_zone: string | null;
  category: string | null;
  pmEstCost: number;
  pmEstLabour: number;
  pmEstMaterial: number;
  estLabour: number;
  estMaterial: number;
  estTotal: number;
  actLabour: number;
  actMaterial: number;
  actTotal: number;
  scopeCount: number;
}

interface WaterfallRow {
  scope_item_id: number;
  scope_name: string | null;
  scope_status: string | null;
  quoted_value: number | null;
  pm_est_cost: number | null;
  ws_est_labour_cost: number | null;
  ws_est_material_cost: number | null;
  ws_est_total: number | null;
  actual_labour_cost: number | null;
  actual_material_cost: number | null;
  actual_total: number | null;
  selected_option: string | null;
}

interface Props {
  scopeItemId?: number;
  jobId?: number;
  quotedValue?: number;
}

function fmt(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

export function CostBreakdown({ scopeItemId, jobId, quotedValue }: Props) {
  const supabase = createClient();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([]);
  const [expandedLineId, setExpandedLineId] = useState<number | null>(null);
  const [waterfallCache, setWaterfallCache] = useState<Record<number, WaterfallRow[]>>({});
  const [d, setD] = useState({
    quotedTotal: 0, quotedWorkshop: 0,
    pmEstTotal: 0, pmEstLabour: 0, pmEstMaterials: 0,
    estLabour: 0, estMaterials: 0,
    actLabour: 0, actMatsPlanned: 0, actMatsReconciled: 0,
    targetMarginPct: 40, woCount: 0, completedWOs: 0,
  });

  useEffect(() => { load(); }, [scopeItemId, jobId]);

  const load = async () => {
    setLoading(true);
    const col = scopeItemId ? "scope_item_id" : "job_id";
    const val = scopeItemId || jobId;
    if (!val) return;

    const [settRes, estRes, woRes, rateRes, dayHrsRes] = await Promise.all([
      supabase.from("tbl_business_settings").select("setting_value").eq("setting_key", "default_target_margin_pct").single(),
      supabase.from("qry_wo_estimated_cost").select("*").eq(col, val),
      supabase.from("tbl_work_orders").select("work_order_id, status").eq(col, val).not("status", "eq", "Voided"),
      supabase.from("tbl_rate_card").select("rate_per_hour").eq("complexity", 1).single(),
      supabase.from("tbl_business_settings").select("setting_value").eq("setting_key", "standard_day_hours").single(),
    ]);

    const targetPct = parseFloat(settRes.data?.setting_value || "40");
    const defaultDayRate = (rateRes.data?.rate_per_hour || 25) * (parseFloat(dayHrsRes.data?.setting_value) || 10);
    const estRows = estRes.data || [];
    const wos = woRes.data || [];
    const woIds = wos.map((w: any) => w.work_order_id);
    const estLabour = estRows.reduce((s: number, r: any) => s + (r.estimated_labour_cost || 0), 0);
    const estMaterials = estRows.reduce((s: number, r: any) => s + (r.estimated_material_cost || 0), 0);

    let actLabour = 0, actMatsPlanned = 0, actMatsReconciled = 0;
    if (woIds.length > 0) {
      const [timeRes, bomRes] = await Promise.all([
        supabase.from("tbl_wo_time_entries").select("entry_cost").in("work_order_id", woIds).is("archived_at", null),
        supabase.from("tbl_wo_bom").select("quantity, unit_cost, actual_unit_cost").in("work_order_id", woIds),
      ]);
      actLabour = (timeRes.data || []).reduce((s: number, r: any) => s + (r.entry_cost || 0), 0);
      for (const b of bomRes.data || []) {
        const qty = b.quantity || 0;
        actMatsPlanned += qty * (b.unit_cost || 0);
        actMatsReconciled += qty * (b.actual_unit_cost || b.unit_cost || 0);
      }
    }

    // Quote lines with estimated costs (job level only)
    let quotedTotal = quotedValue || 0;
    let quotedWorkshop = quotedValue || 0;
    const lineData: QuoteLine[] = [];

    if (jobId && !scopeItemId) {
      const [qlRes, scopeRes, marginRes] = await Promise.all([
        supabase.from("tbl_quote_lines").select("quote_line_id, line_number, line_text, line_value, event_zone, category, pm_est_cost, pm_est_labour_days, pm_est_material_cost").eq("job_id", jobId),
        supabase.from("tbl_scope_items").select("scope_item_id, quote_line_id").eq("job_id", jobId),
        supabase.from("qry_quoteline_margin").select("*").eq("job_id", jobId),
      ]);

      const qlRows = qlRes.data || [];
      quotedTotal = qlRows.reduce((s: number, l: any) => s + (l.line_value || 0), 0);
      const workshopCats = ["workshop build", "workshop", "stock pick", "stock-and-hire"];
      quotedWorkshop = qlRows.filter((l: any) => workshopCats.some(c => (l.category || "").toLowerCase().includes(c)))
        .reduce((s: number, l: any) => s + (l.line_value || 0), 0);

      // Map scopes to quote lines for estimated cost aggregation
      const scopeToLine: Record<number, number> = {};
      (scopeRes.data || []).forEach((s: any) => { if (s.quote_line_id) scopeToLine[s.scope_item_id] = s.quote_line_id; });

      const estByLine: Record<number, { labour: number; material: number }> = {};
      for (const e of estRows) {
        const lineId = scopeToLine[e.scope_item_id];
        if (!lineId) continue;
        if (!estByLine[lineId]) estByLine[lineId] = { labour: 0, material: 0 };
        estByLine[lineId].labour += e.estimated_labour_cost || 0;
        estByLine[lineId].material += e.estimated_material_cost || 0;
      }

      // Count scopes per line
      const scopeCountByLine: Record<number, number> = {};
      (scopeRes.data || []).forEach((s: any) => {
        if (s.quote_line_id) scopeCountByLine[s.quote_line_id] = (scopeCountByLine[s.quote_line_id] || 0) + 1;
      });

      const marginMap: Record<number, any> = {};
      (marginRes.data || []).forEach((m: any) => { marginMap[m.quote_line_id] = m; });

      for (const ql of qlRows) {
        const margin = marginMap[ql.quote_line_id];
        const est = estByLine[ql.quote_line_id];
        const pmLabourCost = (ql.pm_est_labour_days || 0) * (defaultDayRate);
        const pmMatCost = ql.pm_est_material_cost || 0;
        lineData.push({
          quote_line_id: ql.quote_line_id,
          line_number: ql.line_number, line_text: ql.line_text,
          line_value: ql.line_value, event_zone: ql.event_zone, category: ql.category,
          pmEstCost: ql.pm_est_cost || 0,
          pmEstLabour: pmLabourCost,
          pmEstMaterial: pmMatCost,
          estLabour: est?.labour || 0, estMaterial: est?.material || 0,
          estTotal: (est?.labour || 0) + (est?.material || 0),
          actLabour: margin?.actual_labour || 0, actMaterial: margin?.actual_material || 0,
          actTotal: margin?.actual_total || 0,
          scopeCount: scopeCountByLine[ql.quote_line_id] || 0,
        });
      }
    }

    // PM estimate totals (workshop lines only)
    const workshopCatsLower = ["workshop build", "workshop"];
    const pmWsLines = lineData.filter(l => workshopCatsLower.some(c => (l.category || "").toLowerCase().includes(c)));
    const pmEstLabour = pmWsLines.reduce((s, l) => s + l.pmEstLabour, 0);
    const pmEstMaterials = pmWsLines.reduce((s, l) => s + l.pmEstMaterial, 0);
    const pmEstTotal = pmWsLines.reduce((s, l) => s + l.pmEstCost, 0);

    setQuoteLines(lineData);
    setD({
      quotedTotal, quotedWorkshop,
      pmEstTotal, pmEstLabour, pmEstMaterials,
      estLabour, estMaterials,
      actLabour, actMatsPlanned: actMatsPlanned, actMatsReconciled,
      targetMarginPct: targetPct, woCount: wos.length,
      completedWOs: wos.filter((w: any) => w.status === "Complete").length,
    });
    setLoading(false);
  };

  const toggleLineExpand = async (lineId: number) => {
    if (expandedLineId === lineId) { setExpandedLineId(null); return; }
    setExpandedLineId(lineId);
    if (!waterfallCache[lineId]) {
      const { data } = await supabase.from("qry_cost_waterfall").select("*").eq("quote_line_id", lineId);
      setWaterfallCache(prev => ({ ...prev, [lineId]: data || [] }));
    }
  };

  if (loading) return <div className="text-xs text-gray-400 py-4">Loading cost analysis...</div>;

  const estTotal = d.estLabour + d.estMaterials;
  const committedTotal = d.actLabour + d.actMatsPlanned;
  const reconciledTotal = d.actLabour + d.actMatsReconciled;
  const hasReconciled = d.actMatsReconciled !== d.actMatsPlanned;
  const q = d.quotedWorkshop;
  const showBothQuoted = d.quotedTotal > 0 && d.quotedTotal !== d.quotedWorkshop;

  const plannedMargin = q > 0 ? q - estTotal : 0;
  const plannedMarginPct = q > 0 ? (plannedMargin / q) * 100 : 0;
  const liveMargin = q > 0 ? q - committedTotal : 0;
  const liveMarginPct = q > 0 ? (liveMargin / q) * 100 : 0;
  const accuracy = estTotal > 0 ? ((committedTotal / estTotal) * 100) : 0;
  const budget = q > 0 ? q * (1 - d.targetMarginPct / 100) : 0;
  const estVsBudget = budget > 0 && estTotal > 0 ? ((estTotal / budget) * 100) : 0;
  const estOverUnder = estVsBudget > 0 ? Math.abs(estVsBudget - 100) : 0;

  const mc = (pct: number) =>
    pct >= d.targetMarginPct ? "text-starlight-green" :
    pct >= d.targetMarginPct * 0.5 ? "text-amber-500" : "text-starlight-red";

  const bestMarginPct = committedTotal > 0 ? liveMarginPct : plannedMarginPct;
  const bestMargin = committedTotal > 0 ? liveMargin : plannedMargin;
  const bestLabel = committedTotal > 0 ? "Live margin" : "Planned margin";

  // Workshop + stock lines for the per-line table
  const workshopLines = quoteLines.filter(l => {
    const cat = (l.category || "").toLowerCase();
    return cat.includes("workshop") || cat.includes("stock pick") || cat.includes("stock-and-hire");
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          <span className="text-sm font-semibold text-navy">Cost analysis</span>
          <span className="text-xs text-gray-400">{d.completedWOs}/{d.woCount} WOs complete</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {q > 0 && (
            <span className="text-gray-500">
              {showBothQuoted ? "Internal " : "Quoted "}<span className="font-semibold text-gray-800">{fmt(q)}</span>
              {showBothQuoted && <span className="text-gray-400 ml-1">(of {fmt(d.quotedTotal)})</span>}
            </span>
          )}
          {d.pmEstTotal > 0 && <span className="text-gray-500">PM Est. <span className="font-semibold text-orange-700">{fmt(d.pmEstTotal)}</span></span>}
          {estTotal > 0 && <span className="text-gray-500">Est. <span className="font-semibold text-gray-800">{fmt(estTotal)}</span></span>}
          {committedTotal > 0 && <span className="text-gray-500">Actual <span className="font-semibold text-gray-800">{fmt(committedTotal)}</span></span>}
          {q > 0 && (estTotal > 0 || committedTotal > 0) && (
            <span className={`font-semibold ${mc(bestMarginPct)}`}>{bestMarginPct.toFixed(1)}% margin</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 px-4 py-4 space-y-4">
          {/* Cost layers grid */}
          <div className="grid grid-cols-5 gap-0 text-xs">
            <div className="text-gray-400 font-medium py-1.5 uppercase tracking-wider text-[10px]">Layer</div>
            <div className="text-gray-400 font-medium py-1.5 text-right uppercase tracking-wider text-[10px]">Labour</div>
            <div className="text-gray-400 font-medium py-1.5 text-right uppercase tracking-wider text-[10px]">Materials</div>
            <div className="text-gray-400 font-medium py-1.5 text-right uppercase tracking-wider text-[10px]">Total</div>
            <div className="text-gray-400 font-medium py-1.5 text-right uppercase tracking-wider text-[10px]">Margin</div>

            {q > 0 && (<>
              <div className="py-2 border-t border-gray-100 font-medium text-purple-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400"></span>{showBothQuoted ? "Quoted (workshop + stock)" : "Quoted"}
              </div>
              <div className="py-2 border-t border-gray-100 text-right text-gray-400">—</div>
              <div className="py-2 border-t border-gray-100 text-right text-gray-400">—</div>
              <div className="py-2 border-t border-gray-100 text-right font-semibold text-gray-800">
                {fmt(q)}{showBothQuoted && <span className="block text-[10px] text-gray-400 font-normal">of {fmt(d.quotedTotal)} total</span>}
              </div>
              <div className="py-2 border-t border-gray-100 text-right text-gray-400">—</div>
            </>)}

            {/* PM Estimate */}
            {d.pmEstTotal > 0 && (<>
              <div className="py-2 border-t border-gray-100 font-medium text-orange-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-400"></span>PM Estimate
              </div>
              <div className="py-2 border-t border-gray-100 text-right text-gray-700">{d.pmEstLabour > 0 ? fmt(d.pmEstLabour) : "—"}</div>
              <div className="py-2 border-t border-gray-100 text-right text-gray-700">{d.pmEstMaterials > 0 ? fmt(d.pmEstMaterials) : "—"}</div>
              <div className="py-2 border-t border-gray-100 text-right font-semibold text-gray-800">{fmt(d.pmEstTotal)}</div>
              <div className={`py-2 border-t border-gray-100 text-right font-semibold ${mc(q > 0 ? ((q - d.pmEstTotal) / q) * 100 : 0)}`}>
                {q > 0 ? `${(((q - d.pmEstTotal) / q) * 100).toFixed(1)}%` : "—"}
              </div>
            </>)}

            {/* Estimated */}
            <div className="py-2 border-t border-gray-100 font-medium text-blue-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>Estimated
            </div>
            <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(d.estLabour)}</div>
            <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(d.estMaterials)}</div>
            <div className="py-2 border-t border-gray-100 text-right font-semibold text-gray-800">{fmt(estTotal)}</div>
            <div className={`py-2 border-t border-gray-100 text-right font-semibold ${mc(plannedMarginPct)}`}>
              {q > 0 ? `${plannedMarginPct.toFixed(1)}%` : "—"}
            </div>

            {/* Committed */}
            {committedTotal > 0 && (<>
              <div className="py-2 border-t border-gray-100 font-medium text-teal-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-400"></span>Committed
              </div>
              <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(d.actLabour)}</div>
              <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(d.actMatsPlanned)}</div>
              <div className="py-2 border-t border-gray-100 text-right font-semibold text-gray-800">{fmt(committedTotal)}</div>
              <div className={`py-2 border-t border-gray-100 text-right font-semibold ${mc(liveMarginPct)}`}>
                {q > 0 ? `${liveMarginPct.toFixed(1)}%` : "—"}
              </div>
            </>)}

            {/* Reconciled */}
            {hasReconciled && (<>
              <div className="py-2 border-t border-gray-100 font-medium text-amber-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>Reconciled
              </div>
              <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(d.actLabour)}</div>
              <div className="py-2 border-t border-gray-100 text-right text-gray-700">{fmt(d.actMatsReconciled)}</div>
              <div className="py-2 border-t border-gray-100 text-right font-semibold text-gray-800">{fmt(reconciledTotal)}</div>
              <div className={`py-2 border-t border-gray-100 text-right font-semibold ${mc(q > 0 ? ((q - reconciledTotal) / q) * 100 : 0)}`}>
                {q > 0 ? `${(((q - reconciledTotal) / q) * 100).toFixed(1)}%` : "—"}
              </div>
            </>)}
          </div>

          {/* Insight cards */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Target margin</p>
              <p className="text-lg font-bold text-gray-800">{d.targetMarginPct}%</p>
              <p className="text-[10px] text-gray-400">{q > 0 ? `Budget: ${fmt(q * (1 - d.targetMarginPct / 100))}` : "No quote linked"}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Estimate vs budget</p>
              <p className={`text-lg font-bold ${estVsBudget === 0 ? "text-gray-400" : estVsBudget <= 100 ? "text-starlight-green" : estVsBudget <= 115 ? "text-amber-500" : "text-starlight-red"}`}>
                {budget > 0 && estTotal > 0 ? `${estOverUnder.toFixed(0)}%` : "—"}
              </p>
              <p className="text-[10px] text-gray-400">{budget > 0 && estTotal > 0 ? (estVsBudget > 100 ? "Over budget" : "Under budget") : "No data yet"}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">{bestLabel}</p>
              <p className={`text-lg font-bold ${mc(bestMarginPct)}`}>{q > 0 ? `${bestMarginPct.toFixed(1)}%` : "—"}</p>
              <p className="text-[10px] text-gray-400">{q > 0 ? fmt(bestMargin) + " profit" : "No quote linked"}</p>
            </div>
          </div>

          {/* Per-line breakdown — job level only */}
          {workshopLines.length > 0 && (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Workshop &amp; stock quote lines</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-left text-[10px] text-gray-400 uppercase tracking-wider">
                      <th className="px-3 py-2 font-medium w-8">#</th>
                      <th className="px-3 py-2 font-medium">Line</th>
                      <th className="px-3 py-2 font-medium text-center w-14">Scopes</th>
                      <th className="px-3 py-2 font-medium text-right w-20">Quoted</th>
                      <th className="px-3 py-2 font-medium text-right w-20">PM Est</th>
                      <th className="px-3 py-2 font-medium text-right w-20">Labour</th>
                      <th className="px-3 py-2 font-medium text-right w-20">Material</th>
                      <th className="px-3 py-2 font-medium text-right w-20">Total</th>
                      <th className="px-3 py-2 font-medium text-right w-20">Margin</th>
                      <th className="px-3 py-2 font-medium text-right w-14">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workshopLines.map(l => {
                      const cost = l.actTotal > 0 ? l.actTotal : l.estTotal;
                      const labour = l.actLabour > 0 ? l.actLabour : l.estLabour;
                      const material = l.actMaterial > 0 ? l.actMaterial : l.estMaterial;
                      const isEst = l.actTotal === 0 && l.estTotal > 0;
                      const margin = (l.line_value || 0) - cost;
                      const marginPct = (l.line_value || 0) > 0 ? (margin / (l.line_value || 1)) * 100 : 0;
                      const clr = isEst ? "text-blue-500" : "text-gray-800";
                      const hasScopes = l.scopeCount > 0;
                      const isLineExpanded = expandedLineId === l.quote_line_id;
                      const wfRows = waterfallCache[l.quote_line_id] || [];
                      return (
                        <Fragment key={l.quote_line_id}>
                        <tr className={`border-t border-gray-100 ${hasScopes ? "cursor-pointer hover:bg-gray-50/50" : ""}`}
                          onClick={hasScopes ? () => toggleLineExpand(l.quote_line_id) : undefined}>
                          <td className="px-3 py-2 text-gray-400 font-mono">
                            {hasScopes && (isLineExpanded
                              ? <ChevronDown className="h-3 w-3 inline mr-0.5 text-gray-400" />
                              : <ChevronRight className="h-3 w-3 inline mr-0.5 text-gray-400" />
                            )}
                            {l.line_number}
                          </td>
                          <td className="px-3 py-2 text-gray-700 max-w-[300px]">
                            <span className="line-clamp-2">{l.line_text || "—"}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {l.scopeCount > 0
                              ? <span className="text-[10px] bg-starlight-green/10 text-starlight-green px-1.5 py-0.5 rounded-full font-medium">{l.scopeCount}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-600">{l.line_value ? fmt(l.line_value) : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono text-orange-600">{l.pmEstCost > 0 ? fmt(l.pmEstCost) : "—"}</td>
                          <td className={`px-3 py-2 text-right font-mono ${clr}`}>
                            {labour > 0 ? fmt(labour) : "—"}{isEst && labour > 0 && <span className="text-[9px] text-gray-400 ml-0.5">est</span>}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono ${clr}`}>
                            {material > 0 ? fmt(material) : "—"}{isEst && material > 0 && <span className="text-[9px] text-gray-400 ml-0.5">est</span>}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-medium ${clr}`}>
                            {cost > 0 ? fmt(cost) : "—"}{isEst && cost > 0 && <span className="text-[9px] text-gray-400 ml-0.5">est</span>}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-semibold ${margin >= 0 ? "text-starlight-green" : "text-starlight-red"}`}>
                            {cost > 0 && l.line_value ? (<>{margin > 0 && <TrendingUp className="h-3 w-3 inline mr-0.5" />}{margin < 0 && <TrendingDown className="h-3 w-3 inline mr-0.5" />}{fmt(margin)}</>) : "—"}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono ${marginPct >= d.targetMarginPct ? "text-starlight-green" : marginPct > 0 ? "text-amber-500" : "text-starlight-red"}`}>
                            {cost > 0 && l.line_value ? `${marginPct.toFixed(0)}%` : "—"}
                          </td>
                        </tr>
                        {/* Waterfall sub-rows for scope items */}
                        {isLineExpanded && wfRows.length > 0 && wfRows.map(w => {
                          const wBest = w.actual_total || w.ws_est_total || w.pm_est_cost || 0;
                          const wQuoted = w.quoted_value || 0;
                          const wMarginPct = wQuoted > 0 ? ((wQuoted - wBest) / wQuoted) * 100 : null;
                          return (
                            <tr key={w.scope_item_id} className="bg-gray-50/70 border-t border-gray-100/50">
                              <td className="px-3 py-1.5"></td>
                              <td className="px-3 py-1.5 text-[11px] text-gray-600 pl-6">
                                <span className="text-gray-400 mr-1">↳</span>
                                {w.scope_name || `Scope #${w.scope_item_id}`}
                                {w.selected_option && (
                                  <span className="ml-1.5 text-[9px] bg-green-50 text-starlight-green px-1 py-0.5 rounded">{w.selected_option}</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5"></td>
                              <td className="px-3 py-1.5 text-right font-mono text-[11px] text-gray-500">
                                {wQuoted > 0 ? fmt(wQuoted) : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-[11px] text-orange-500">
                                {w.pm_est_cost ? fmt(w.pm_est_cost) : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-[11px] text-blue-500">
                                {w.ws_est_labour_cost ? fmt(w.ws_est_labour_cost) : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-[11px] text-blue-500">
                                {w.ws_est_material_cost ? fmt(w.ws_est_material_cost) : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-[11px] font-medium text-gray-600">
                                {wBest > 0 ? fmt(wBest) : "—"}
                              </td>
                              <td className="px-3 py-1.5"></td>
                              <td className={`px-3 py-1.5 text-right font-mono text-[11px] ${
                                wMarginPct === null ? "text-gray-300" :
                                wMarginPct >= 20 ? "text-starlight-green" :
                                wMarginPct >= 0 ? "text-amber-500" : "text-starlight-red"
                              }`}>
                                {wMarginPct !== null ? `${wMarginPct.toFixed(0)}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                        {isLineExpanded && wfRows.length === 0 && (
                          <tr className="bg-gray-50/70">
                            <td colSpan={10} className="px-3 py-2 text-[11px] text-gray-400 pl-6">
                              Loading scope items...
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
