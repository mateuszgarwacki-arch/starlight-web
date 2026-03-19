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

    const [lineRes, sumRes] = await Promise.all([
      supabase.from("qry_quoteline_margin").select("*").eq("job_id", jobId).order("quote_line_id"),
      supabase.from("qry_job_quote_margin").select("*").eq("job_id", jobId).single(),
    ]);

    if (lineRes.data) setLines(lineRes.data);
    if (sumRes.data) setSummary(sumRes.data);
    setLoading(false);
  }, [jobId, expanded]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors text-left"
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
        {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {loading ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm animate-pulse">Loading margin data...</div>
          ) : lines.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              No workshop lines with cost data. Create scope items and complete work orders to see margins.
            </div>
          ) : (
            <>
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-5 py-3 bg-gray-50/50">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Quoted (Workshop)</p>
                    <p className="text-sm font-mono font-semibold text-navy">{formatCurrency(summary.total_quoted)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Actual Cost</p>
                    <p className="text-sm font-mono font-semibold text-navy">{formatCurrency(summary.total_actual)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Margin</p>
                    <p className={"text-sm font-mono font-semibold " + (
                      summary.total_margin >= 0 ? "text-starlight-green" : "text-starlight-red"
                    )}>
                      {formatCurrency(summary.total_margin)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Margin %</p>
                    <p className={"text-sm font-mono font-semibold " + (
                      (summary.margin_pct ?? 0) >= 0 ? "text-starlight-green" : "text-starlight-red"
                    )}>
                      {summary.margin_pct ?? 0}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Tracked / Untracked</p>
                    <p className="text-sm font-mono text-navy">
                      {summary.tracked_lines} / <span className="text-gray-400">{summary.untracked_lines}</span>
                    </p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-starlight-bg text-left text-[10px] text-gray-400 uppercase tracking-wider">
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
                      <tr key={l.quote_line_id} className={"border-t border-gray-100 " + (
                        l.tracking_status === "No Scope" ? "bg-gray-50/50 text-gray-400" : ""
                      )}>
                        <td className="px-4 py-2 text-xs font-mono text-gray-400">{l.line_number}</td>
                        <td className="px-4 py-2 text-xs text-navy max-w-[250px] truncate" title={l.line_text || ""}>
                          {l.line_text || "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">{l.event_zone || "—"}</td>
                        <td className="px-4 py-2 text-center">
                          {l.scope_count > 0 ? (
                            <span className="text-[10px] bg-starlight-green/10 text-starlight-green px-1.5 py-0.5 rounded-full font-medium">{l.scope_count}</span>
                          ) : (
                            <span className="text-[10px] text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-gray-600">{l.quoted_value ? formatCurrency(l.quoted_value) : "—"}</td>
                        <td className="px-4 py-2 text-right font-mono text-navy">{l.actual_labour > 0 ? formatCurrency(l.actual_labour) : "—"}</td>
                        <td className="px-4 py-2 text-right font-mono text-navy">{l.actual_material > 0 ? formatCurrency(l.actual_material) : "—"}</td>
                        <td className="px-4 py-2 text-right font-mono font-medium text-navy">{l.actual_total > 0 ? formatCurrency(l.actual_total) : "—"}</td>
                        <td className={"px-4 py-2 text-right font-mono font-semibold " + (
                          l.tracking_status === "No Scope" ? "text-gray-300" :
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
                          l.tracking_status === "No Scope" ? "text-gray-300" :
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
