"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight, BarChart3 } from "lucide-react";

interface QuoteLineMargin {
  quote_line_id: number;
  line_number: string | null;
  line_text: string | null;
  quoted_value: number | null;
  event_zone: string | null;
  category: string | null;
  scope_count: number;
  actual_labour: number;
  actual_material: number;
  actual_total: number;
  line_margin: number;
  margin_pct: number | null;
  tracking_status: string;
  // Added from rate card
  estimated_labour?: number;
  estimated_material?: number;
  estimated_total?: number;
}

interface JobQuoteMargin {
  total_quoted: number;
  total_actual: number;
  total_margin: number;
  margin_pct: number | null;
  tracked_lines: number;
  untracked_lines: number;
}

export function QuoteMarginPanel({ jobId }: { jobId: number }) {
  const supabase = createClient();
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState<QuoteLineMargin[]>([]);
  const [summary, setSummary] = useState<JobQuoteMargin | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!expanded) return;
    setLoading(true);

    const [lineRes, sumRes, estRes, scopeRes] = await Promise.all([
      supabase.from("qry_quoteline_margin").select("*").eq("job_id", jobId).order("quote_line_id"),
      supabase.from("qry_job_quote_margin").select("*").eq("job_id", jobId).single(),
      supabase.from("qry_wo_estimated_cost").select("scope_item_id, estimated_labour_cost, estimated_material_cost, estimated_total_cost").eq("job_id", jobId),
      supabase.from("tbl_scope_items").select("scope_item_id, quote_line_id").eq("job_id", jobId),
    ]);

    // Build scope→quote_line map, then aggregate estimated costs per quote line
    const scopeToLine: Record<number, number> = {};
    (scopeRes.data || []).forEach((s: any) => { if (s.quote_line_id) scopeToLine[s.scope_item_id] = s.quote_line_id; });

    const estByLine: Record<number, { labour: number; material: number; total: number }> = {};
    (estRes.data || []).forEach((e: any) => {
      const lineId = scopeToLine[e.scope_item_id];
      if (!lineId) return;
      if (!estByLine[lineId]) estByLine[lineId] = { labour: 0, material: 0, total: 0 };
      estByLine[lineId].labour += e.estimated_labour_cost || 0;
      estByLine[lineId].material += e.estimated_material_cost || 0;
      estByLine[lineId].total += e.estimated_total_cost || 0;
    });

    if (lineRes.data) {
      setLines(lineRes.data.map(l => ({
        ...l,
        estimated_labour: estByLine[l.quote_line_id]?.labour || 0,
        estimated_material: estByLine[l.quote_line_id]?.material || 0,
        estimated_total: estByLine[l.quote_line_id]?.total || 0,
      })));
    }
    if (sumRes.data) setSummary(sumRes.data);
    setLoading(false);
  }, [jobId, expanded]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-surface-dim/50 transition-colors text-left"
      >
        <BarChart3 className="h-4 w-4 text-starlight-red" />
        <span className="text-sm font-semibold text-navy flex-1">Quote Line Margin Analysis</span>
        {summary && (
          <span className={"text-sm font-mono font-semibold mr-3 " + (
            summary.total_margin >= 0 ? "text-starlight-green" : "text-starlight-red"
          )}>
            {formatCurrency(summary.total_margin)} ({summary.margin_pct ?? 0}%)
          </span>
        )}
        {expanded ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
      </button>

      {expanded && (
        <div className="border-t border-subtle">
          {loading ? (
            <div className="px-5 py-8 text-center text-muted text-sm animate-pulse">Loading margin data...</div>
          ) : lines.length === 0 ? (
            <div className="px-5 py-8 text-center text-muted text-sm">
              No workshop lines with cost data. Create scope items and complete work orders to see margins.
            </div>
          ) : (
            <>
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-5 py-3 bg-surface-dim/50">
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider">Quoted (Workshop)</p>
                    <p className="text-sm font-mono font-semibold text-navy">{formatCurrency(summary.total_quoted)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider">Actual Cost</p>
                    <p className="text-sm font-mono font-semibold text-navy">{formatCurrency(summary.total_actual)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider">Estimated Cost</p>
                    <p className="text-sm font-mono font-semibold text-navy">
                      {formatCurrency(lines.reduce((s, l) => s + (l.estimated_total || 0), 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider">Margin</p>
                    <p className={"text-sm font-mono font-semibold " + (
                      summary.total_margin >= 0 ? "text-starlight-green" : "text-starlight-red"
                    )}>
                      {formatCurrency(summary.total_margin)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider">Margin %</p>
                    <p className={"text-sm font-mono font-semibold " + (
                      (summary.margin_pct ?? 0) >= 0 ? "text-starlight-green" : "text-starlight-red"
                    )}>
                      {summary.margin_pct ?? 0}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider">Tracked / Untracked</p>
                    <p className="text-sm font-mono text-navy">
                      {summary.tracked_lines} / <span className="text-muted">{summary.untracked_lines}</span>
                    </p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-base text-left text-[10px] text-muted uppercase tracking-wider">
                      <th className="px-4 py-2 font-medium w-8">#</th>
                      <th className="px-4 py-2 font-medium">Line</th>
                      <th className="px-4 py-2 font-medium">Zone</th>
                      <th className="px-4 py-2 font-medium text-center">Scopes</th>
                      <th className="px-4 py-2 font-medium text-right">Quoted</th>
                      <th className="px-4 py-2 font-medium text-right">Labour</th>
                      <th className="px-4 py-2 font-medium text-right">Material</th>
                      <th className="px-4 py-2 font-medium text-right">Total Cost</th>
                      <th className="px-4 py-2 font-medium text-right">Margin</th>
                      <th className="px-4 py-2 font-medium text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => (
                      <tr key={l.quote_line_id} className={"border-t border-subtle " + (
                        l.tracking_status === "No Scope" ? "bg-surface-dim/50 text-muted" : ""
                      )}>
                        <td className="px-4 py-2 text-xs font-mono text-muted">{l.line_number}</td>
                        <td className="px-4 py-2 text-xs text-navy max-w-[250px] truncate" title={l.line_text || ""}>
                          {l.line_text || "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted">{l.event_zone || "—"}</td>
                        <td className="px-4 py-2 text-center">
                          {l.scope_count > 0 ? (
                            <span className="text-[10px] bg-starlight-green/10 text-starlight-green px-1.5 py-0.5 rounded-full font-medium">{l.scope_count}</span>
                          ) : (
                            <span className="text-[10px] text-faint">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-muted">{l.quoted_value ? formatCurrency(l.quoted_value) : "—"}</td>
                        <td className="px-4 py-2 text-right font-mono">
                          {l.actual_labour > 0
                            ? <span className="text-navy">{formatCurrency(l.actual_labour)}</span>
                            : l.estimated_labour ? <span className="text-navy">{formatCurrency(l.estimated_labour)} <span className="text-[9px] text-muted">est</span></span>
                            : <span className="text-faint">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {l.actual_material > 0
                            ? <span className="text-navy">{formatCurrency(l.actual_material)}</span>
                            : l.estimated_material ? <span className="text-navy">{formatCurrency(l.estimated_material)} <span className="text-[9px] text-muted">est</span></span>
                            : <span className="text-faint">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-medium">
                          {l.actual_total > 0
                            ? <span className="text-navy">{formatCurrency(l.actual_total)}</span>
                            : (l.estimated_total || 0) > 0 ? <span className="text-navy">{formatCurrency(l.estimated_total || 0)} <span className="text-[9px] text-muted">est</span></span>
                            : <span className="text-faint">—</span>}
                        </td>
                        <td className={"px-4 py-2 text-right font-mono font-semibold " + (
                          l.tracking_status === "No Scope" ? "text-faint" :
                          l.line_margin >= 0 ? "text-starlight-green" : "text-starlight-red"
                        )}>
                          {l.tracking_status === "No Scope" ? "—" : (
                            <>
                              {l.line_margin > 0 && <TrendingUp className="h-3 w-3 inline mr-0.5" />}
                              {l.line_margin < 0 && <TrendingDown className="h-3 w-3 inline mr-0.5" />}
                              {formatCurrency(l.line_margin)}
                            </>
                          )}
                        </td>
                        <td className={"px-4 py-2 text-right font-mono text-xs " + (
                          l.tracking_status === "No Scope" ? "text-faint" :
                          (l.margin_pct ?? 0) >= 0 ? "text-starlight-green" : "text-starlight-red"
                        )}>
                          {l.tracking_status === "No Scope" ? "—" : `${l.margin_pct ?? 0}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
