"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import {
  ArrowLeft, Printer, AlertTriangle, CheckCircle2,
  TrendingDown, TrendingUp, PoundSterling, FileText,
} from "lucide-react";

interface ReportLine {
  line_number: number;
  description: string;
  quoted: number;
  category: string;
  zone: string;
  pm_est: number | null;
  scope_count: number;
  est_labour: number;
  est_material: number;
  est_total: number;
  act_labour: number;
  act_material: number;
  act_total: number;
  est_margin: number;
  est_margin_pct: number;
}

interface ReportData {
  job: { job_id: number; job_number: string; job_name: string; client_name: string; event_date: string; event_location: string };
  target_margin_pct: number;
  generated_at: string;
  lines: ReportLine[];
}

export default function JobFinancialReport() {
  const params = useParams();
  const router = useRouter();
  const jobId = Number(params.jobId);
  const supabase = createClient();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("rpc_report_job_financial", { p_job_id: jobId })
      .then(({ data: d }) => { setData(d as ReportData); setLoading(false); });
  }, [jobId]);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted animate-pulse">Generating report...</div>;
  if (!data?.job) return <div className="text-center py-12 text-muted">No data found for this job</div>;

  const { job, lines, target_margin_pct } = data;
  const internalLines = (lines || []).filter(l => {
    const cat = (l.category || "").toLowerCase();
    return cat.includes("workshop") || cat.includes("stock pick") || cat.includes("stock-and-hire");
  });
  const otherLines = (lines || []).filter(l => !internalLines.includes(l));

  const totalQuoted = internalLines.reduce((s, l) => s + l.quoted, 0);
  const totalEstLabour = internalLines.reduce((s, l) => s + l.est_labour, 0);
  const totalEstMaterial = internalLines.reduce((s, l) => s + l.est_material, 0);
  const totalEst = totalEstLabour + totalEstMaterial;
  const totalMargin = totalQuoted - totalEst;
  const totalMarginPct = totalQuoted > 0 ? (totalMargin / totalQuoted) * 100 : 0;
  const budget = totalQuoted * (1 - target_margin_pct / 100);

  const problemLines = internalLines.filter(l => l.est_margin_pct < target_margin_pct && l.est_total > 0);
  const healthyLines = internalLines.filter(l => l.est_margin_pct >= target_margin_pct || l.est_total === 0);

  const mc = (pct: number) => pct >= target_margin_pct ? "text-starlight-green" : pct >= target_margin_pct * 0.5 ? "text-starlight-amber" : "text-starlight-red";
  const bg = (pct: number) => pct >= target_margin_pct ? "bg-starlight-green/10" : pct >= target_margin_pct * 0.5 ? "bg-starlight-amber/10" : "bg-starlight-red/10";
  const fmt = formatCurrency;

  return (
    <div className="max-w-5xl mx-auto space-y-6 print:space-y-4">
      {/* Nav - hidden in print */}
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy/90 transition-colors">
          <Printer className="h-4 w-4" /> Print / PDF
        </button>
      </div>

      {/* Report Header */}
      <div className="card p-6 print:shadow-none print:border print:border-subtle">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-5 w-5 text-starlight-blue print:text-muted" />
              <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Pre-Build Financial Review</span>
            </div>
            <h1 className="text-xl font-bold text-navy">{job.job_name}</h1>
            <p className="text-sm text-muted mt-0.5">{job.job_number} · {job.client_name}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>{job.event_date ? new Date(job.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "No date"}</p>
            <p>{job.event_location || "—"}</p>
            <p className="mt-2 text-[10px]">Generated {new Date(data.generated_at).toLocaleDateString("en-GB")} {new Date(data.generated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>

        {/* Summary metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-surface-dim rounded-lg p-3 print:border print:border-subtle">
            <p className="text-[10px] text-muted uppercase tracking-wider">Internal Quoted</p>
            <p className="text-lg font-bold text-navy mt-0.5">{fmt(totalQuoted)}</p>
          </div>
          <div className="bg-surface-dim rounded-lg p-3 print:border print:border-subtle">
            <p className="text-[10px] text-muted uppercase tracking-wider">Estimated Cost</p>
            <p className="text-lg font-bold text-navy mt-0.5">{fmt(totalEst)}</p>
            <p className="text-[10px] text-muted">{fmt(totalEstLabour)} labour · {fmt(totalEstMaterial)} materials</p>
          </div>
          <div className={`rounded-lg p-3 print:border print:border-subtle ${bg(totalMarginPct)}`}>
            <p className="text-[10px] text-muted uppercase tracking-wider">Estimated Margin</p>
            <p className={`text-lg font-bold mt-0.5 ${mc(totalMarginPct)}`}>{totalMarginPct.toFixed(1)}%</p>
            <p className="text-[10px] text-muted">{fmt(totalMargin)} profit</p>
          </div>
          <div className="bg-surface-dim rounded-lg p-3 print:border print:border-subtle">
            <p className="text-[10px] text-muted uppercase tracking-wider">Target Margin</p>
            <p className="text-lg font-bold text-navy mt-0.5">{target_margin_pct}%</p>
            <p className="text-[10px] text-muted">Budget: {fmt(budget)}</p>
          </div>
        </div>

        {/* Alert banner */}
        {problemLines.length > 0 && (
          <div className="mt-4 px-4 py-3 bg-starlight-red/10 border border-starlight-red/20 rounded-lg flex items-start gap-3 print:bg-surface">
            <AlertTriangle className="h-4 w-4 text-starlight-red shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-starlight-red">
                {problemLines.length} of {internalLines.length} line{internalLines.length > 1 ? "s" : ""} below target margin
              </p>
              <p className="text-xs text-starlight-red mt-0.5">
                Review line{problemLines.length > 1 ? "s" : ""} {problemLines.map(l => l.line_number).join(", ")} — consider cheaper materials, reduced finish, or re-quoting.
              </p>
            </div>
          </div>
        )}
        {problemLines.length === 0 && internalLines.length > 0 && totalEst > 0 && (
          <div className="mt-4 px-4 py-3 bg-starlight-green/10 border border-starlight-green/20 rounded-lg flex items-start gap-3 print:bg-surface">
            <CheckCircle2 className="h-4 w-4 text-starlight-green shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-starlight-green">All lines meet or exceed target margin. Ready for production.</p>
          </div>
        )}
      </div>

      {/* Per-line breakdown */}
      <div className="card overflow-hidden print:shadow-none print:border print:border-subtle">
        <div className="px-5 py-3 border-b border-subtle">
          <h2 className="text-sm font-semibold text-navy">Line-by-Line Analysis</h2>
          <p className="text-[10px] text-muted mt-0.5">Sorted worst margin first. Internal lines (Workshop, Stock Pick, Stock-and-Hire).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-base text-left text-[9px] text-muted uppercase tracking-wider">
                <th className="px-4 py-2 font-medium w-10">#</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium w-16">Cat</th>
                <th className="px-4 py-2 font-medium text-right w-20">Quoted</th>
                <th className="px-4 py-2 font-medium text-right w-20">Est Labour</th>
                <th className="px-4 py-2 font-medium text-right w-20">Est Mats</th>
                <th className="px-4 py-2 font-medium text-right w-20">Est Total</th>
                <th className="px-4 py-2 font-medium text-right w-20">Margin £</th>
                <th className="px-4 py-2 font-medium text-right w-16">Margin %</th>
                <th className="px-4 py-2 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {[...internalLines].sort((a, b) => a.est_margin_pct - b.est_margin_pct).map((line) => {
                const isBelow = line.est_margin_pct < target_margin_pct && line.est_total > 0;
                const isLoss = line.est_margin < 0;
                return (
                  <tr key={line.line_number} className={`border-t border-subtle ${isLoss ? "bg-starlight-red/10/50" : isBelow ? "bg-starlight-amber/10/30" : ""}`}>
                    <td className="px-4 py-2.5 font-mono text-muted">{line.line_number}</td>
                    <td className="px-4 py-2.5 text-navy max-w-[300px]">
                      <p className="font-medium leading-tight line-clamp-2">{line.description}</p>
                      {line.scope_count > 0 && <p className="text-[10px] text-muted mt-0.5">{line.scope_count} scope{line.scope_count > 1 ? "s" : ""}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{line.category}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted">{fmt(line.quoted)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted">{line.est_labour > 0 ? fmt(line.est_labour) : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted">{line.est_material > 0 ? fmt(line.est_material) : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-navy">{line.est_total > 0 ? fmt(line.est_total) : "—"}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${mc(line.est_margin_pct)}`}>{line.est_total > 0 ? fmt(line.est_margin) : "—"}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${mc(line.est_margin_pct)}`}>{line.est_total > 0 ? `${line.est_margin_pct}%` : "—"}</td>
                    <td className="px-4 py-2.5">
                      {isLoss && <TrendingDown className="h-3.5 w-3.5 text-starlight-red" />}
                      {isBelow && !isLoss && <AlertTriangle className="h-3.5 w-3.5 text-starlight-amber" />}
                      {!isBelow && line.est_total > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-starlight-green" />}
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="border-t-2 border-subtle bg-surface-dim font-semibold">
                <td className="px-4 py-2.5"></td>
                <td className="px-4 py-2.5 text-navy">Total (Internal)</td>
                <td className="px-4 py-2.5"></td>
                <td className="px-4 py-2.5 text-right font-mono text-navy">{fmt(totalQuoted)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-muted">{fmt(totalEstLabour)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-muted">{fmt(totalEstMaterial)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-navy">{fmt(totalEst)}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${mc(totalMarginPct)}`}>{fmt(totalMargin)}</td>
                <td className={`px-4 py-2.5 text-right ${mc(totalMarginPct)}`}>{totalMarginPct.toFixed(1)}%</td>
                <td className="px-4 py-2.5"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Non-internal lines (Install, Subcontracted, etc) */}
      {otherLines.length > 0 && (
        <div className="card overflow-hidden print:shadow-none print:border print:border-subtle">
          <div className="px-5 py-3 border-b border-subtle">
            <h2 className="text-sm font-semibold text-navy">Other Quote Lines</h2>
            <p className="text-[10px] text-muted mt-0.5">Install, Subcontracted, and other non-workshop lines (not costed internally)</p>
          </div>
          <div className="divide-y divide-subtle">
            {otherLines.map((line) => (
              <div key={line.line_number} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-navy font-medium">#{line.line_number} · {line.description?.substring(0, 80)}{(line.description?.length || 0) > 80 ? "..." : ""}</p>
                  <p className="text-[10px] text-muted mt-0.5">{line.category || "Uncategorised"}</p>
                </div>
                <p className="text-sm font-mono font-semibold text-navy">{fmt(line.quoted)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-[10px] text-faint py-4 print:py-2">
        Starlight Design · Pre-Build Financial Review · {job.job_number} · Generated {new Date(data.generated_at).toLocaleDateString("en-GB")}
      </div>
    </div>
  );
}
