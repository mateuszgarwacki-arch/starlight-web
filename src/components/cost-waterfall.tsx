"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { createClient } from "@/lib/supabase-browser";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import Link from "next/link";

function fmt(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

function pct(cost: number, quoted: number): number | null {
  if (!quoted || quoted === 0) return null;
  return ((quoted - cost) / quoted) * 100;
}

interface WaterfallRow {
  scope_item_id: number;
  scope_name: string | null;
  scope_status: string | null;
  job_id: number;
  quoted_value: number | null;
  pm_est_cost: number | null;
  pm_est_labour_days: number | null;
  pm_est_material_cost: number | null;
  ws_est_labour_cost: number | null;
  ws_est_material_cost: number | null;
  ws_est_total: number | null;
  actual_labour_cost: number | null;
  actual_material_cost: number | null;
  actual_total: number | null;
  pm_margin_pct: number | null;
  ws_margin_pct: number | null;
  actual_margin_pct: number | null;
  selected_option: string | null;
  selected_option_est: number | null;
}

interface Props {
  jobId: number;
}

function MarginBadge({ cost, quoted }: { cost: number | null; quoted: number | null }) {
  if (!cost || !quoted || quoted === 0) return <span className="text-faint">—</span>;
  const m = pct(cost, quoted);
  if (m === null) return <span className="text-faint">—</span>;
  return (
    <span className={`text-xs font-mono ${
      m >= 20 ? "text-starlight-green" : m >= 0 ? "text-starlight-amber" : "text-starlight-red"
    }`}>
      {m.toFixed(0)}%
    </span>
  );
}

function TrendIcon({ actual, quoted }: { actual: number | null; quoted: number | null }) {
  if (!actual || !quoted) return <Minus className="h-3.5 w-3.5 text-faint" />;
  if (actual <= quoted * 0.9) return <TrendingDown className="h-3.5 w-3.5 text-starlight-green" />;
  if (actual <= quoted * 1.1) return <Minus className="h-3.5 w-3.5 text-starlight-amber" />;
  return <TrendingUp className="h-3.5 w-3.5 text-starlight-red" />;
}

export function CostWaterfall({ jobId }: Props) {
  const supabase = createClient();
  const [rows, setRows] = useState<WaterfallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("qry_cost_waterfall")
      .select("*")
      .eq("job_id", jobId);
    setRows(data || []);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  if (loading || rows.length === 0) return null;

  // Totals
  const totals = rows.reduce((acc, r) => ({
    quoted: acc.quoted + (r.quoted_value || 0),
    pmEst: acc.pmEst + (r.pm_est_cost || 0),
    workshopEst: acc.workshopEst + (r.ws_est_total || 0),
    actual: acc.actual + (r.actual_total || 0),
  }), { quoted: 0, pmEst: 0, workshopEst: 0, actual: 0 });

  const hasPmEst = totals.pmEst > 0;
  const hasWorkshopEst = totals.workshopEst > 0;
  const hasActuals = totals.actual > 0;

  return (
    <div className="card">
      {/* Clickable header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
          <BarChart3 className="h-4 w-4 text-navy" />
          <span className="text-sm font-semibold text-navy">Cost Waterfall</span>
          <span className="text-xs text-muted">{rows.length} scope items</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted">Quoted: <span className="font-mono text-navy">{fmt(totals.quoted)}</span></span>
          {hasActuals && (
            <span className="text-muted">Actual: <span className={`font-mono ${
              totals.actual <= totals.quoted ? "text-starlight-green" : "text-starlight-red"
            }`}>{fmt(totals.actual)}</span></span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4">
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle text-xs text-muted">
                  <th className="text-left py-2 pr-3 font-medium">Scope Item</th>
                  <th className="text-right py-2 px-2 font-medium w-24">Quoted</th>
                  {hasPmEst && <th className="text-right py-2 px-2 font-medium w-24">PM Est</th>}
                  {hasWorkshopEst && <th className="text-right py-2 px-2 font-medium w-24">Workshop Est</th>}
                  {hasActuals && <th className="text-right py-2 px-2 font-medium w-24">Actual</th>}
                  <th className="text-right py-2 px-2 font-medium w-16">Margin</th>
                  <th className="text-center py-2 pl-2 font-medium w-10">Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const bestActual = r.actual_total || r.ws_est_total || r.pm_est_cost || 0;
                  const isRowExpanded = expandedRow === r.scope_item_id;
                  return (
                    <Fragment key={r.scope_item_id}>
                      <tr
                        className="border-b border-subtle hover:bg-surface-dim/50 cursor-pointer transition-colors"
                        onClick={() => setExpandedRow(isRowExpanded ? null : r.scope_item_id)}
                      >
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-1.5">
                            {isRowExpanded
                              ? <ChevronDown className="h-3 w-3 text-muted shrink-0" />
                              : <ChevronRight className="h-3 w-3 text-muted shrink-0" />}
                            <Link
                              href={`/jobs/${jobId}/scope/${r.scope_item_id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-navy hover:text-starlight-blue transition-colors font-medium truncate max-w-[280px]"
                            >
                              {r.scope_name || `Scope #${r.scope_item_id}`}
                            </Link>
                            {r.selected_option && (
                              <span className="text-[10px] bg-starlight-green/10 text-starlight-green px-1.5 py-0.5 rounded shrink-0">
                                {r.selected_option}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="text-right py-2.5 px-2 font-mono text-navy">
                          {r.quoted_value ? fmt(r.quoted_value) : "—"}
                        </td>
                        {hasPmEst && (
                          <td className="text-right py-2.5 px-2 font-mono text-starlight-amber">
                            {r.pm_est_cost ? fmt(r.pm_est_cost) : "—"}
                          </td>
                        )}
                        {hasWorkshopEst && (
                          <td className="text-right py-2.5 px-2 font-mono text-starlight-blue">
                            {r.ws_est_total ? fmt(r.ws_est_total) : "—"}
                          </td>
                        )}
                        {hasActuals && (
                          <td className={`text-right py-2.5 px-2 font-mono ${
                            r.actual_total && r.quoted_value && r.actual_total > r.quoted_value
                              ? "text-starlight-red" : "text-navy"
                          }`}>
                            {r.actual_total ? fmt(r.actual_total) : "—"}
                          </td>
                        )}
                        <td className="text-right py-2.5 px-2">
                          <MarginBadge cost={bestActual} quoted={r.quoted_value} />
                        </td>
                        <td className="text-center py-2.5 pl-2">
                          <TrendIcon actual={bestActual} quoted={r.quoted_value} />
                        </td>
                      </tr>
                      {/* Expanded detail row */}
                      {isRowExpanded && (
                        <tr>
                          <td colSpan={6 + (hasPmEst ? 1 : 0)} className="py-2 px-4 bg-surface-dim/50">
                            <div className="grid grid-cols-4 gap-4 text-xs text-muted">
                              <div>
                                <p className="font-medium text-muted mb-1">Quoted</p>
                                <p className="font-mono">{r.quoted_value ? fmt(r.quoted_value) : "—"}</p>
                              </div>
                              {r.pm_est_cost != null && (
                                <div>
                                  <p className="font-medium text-starlight-amber mb-1">PM Estimate</p>
                                  <p className="font-mono">{fmt(r.pm_est_cost)}</p>
                                  <MarginBadge cost={r.pm_est_cost} quoted={r.quoted_value} />
                                </div>
                              )}
                              {r.ws_est_total != null && (
                                <div>
                                  <p className="font-medium text-starlight-blue mb-1">Workshop Estimate</p>
                                  <p className="font-mono">Labour: {fmt(r.ws_est_labour_cost || 0)}</p>
                                  <p className="font-mono">Material: {fmt(r.ws_est_material_cost || 0)}</p>
                                  <p className="font-mono font-semibold mt-0.5">{fmt(r.ws_est_total)}</p>
                                  <MarginBadge cost={r.ws_est_total} quoted={r.quoted_value} />
                                </div>
                              )}
                              {r.actual_total != null && r.actual_total > 0 && (
                                <div>
                                  <p className="font-medium text-navy mb-1">Actual</p>
                                  <p className="font-mono">Labour: {fmt(r.actual_labour_cost || 0)}</p>
                                  <p className="font-mono">Material: {fmt(r.actual_material_cost || 0)}</p>
                                  <p className="font-mono font-semibold mt-0.5">{fmt(r.actual_total)}</p>
                                  <MarginBadge cost={r.actual_total} quoted={r.quoted_value} />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {/* Totals row */}
                <tr className="border-t-2 border-subtle font-semibold">
                  <td className="py-2.5 pr-3 text-navy">Total ({rows.length} items)</td>
                  <td className="text-right py-2.5 px-2 font-mono text-navy">{fmt(totals.quoted)}</td>
                  {hasPmEst && (
                    <td className="text-right py-2.5 px-2 font-mono text-starlight-amber">{fmt(totals.pmEst)}</td>
                  )}
                  {hasWorkshopEst && (
                    <td className="text-right py-2.5 px-2 font-mono text-starlight-blue">{fmt(totals.workshopEst)}</td>
                  )}
                  {hasActuals && (
                    <td className={`text-right py-2.5 px-2 font-mono ${
                      totals.actual > totals.quoted ? "text-starlight-red" : "text-navy"
                    }`}>{fmt(totals.actual)}</td>
                  )}
                  <td className="text-right py-2.5 px-2">
                    <MarginBadge cost={totals.actual || totals.workshopEst || totals.pmEst} quoted={totals.quoted} />
                  </td>
                  <td className="text-center py-2.5 pl-2">
                    <TrendIcon actual={totals.actual || totals.workshopEst || totals.pmEst} quoted={totals.quoted} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
