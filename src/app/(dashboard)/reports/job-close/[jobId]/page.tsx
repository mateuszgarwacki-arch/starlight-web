"use client";

/**
 * Job Close Report
 *
 * Live report driven by rpc_job_close_report. Renders for any job, but the
 * page styling/headline language adapts based on whether the job is
 * Complete (close report) or Active (interim — shown for transparency).
 *
 * Sections:
 *   - Header (job, client, event, status)
 *   - Commercial summary (quoted / labour / material / margin)
 *   - Labour breakdown (by freelancer, by activity)
 *   - Material breakdown (by category, by supplier)
 *   - WO variance (top movers vs estimate)
 *   - Scope cost (where material spend landed)
 *   - Learnings (linked to job)
 *   - Close note + post-complete edit warning
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ArrowLeft, Printer, CheckCircle2, AlertTriangle, Clock,
  Users, Package, TrendingUp, TrendingDown, BookOpen, FileText,
} from "lucide-react";

interface CloseReport {
  job: {
    job_id: number;
    job_number: string;
    job_name: string;
    client_name: string;
    event_date: string | null;
    event_location: string | null;
    budget_allowance: number | null;
    job_status: string;
    completed_at: string | null;
    completed_by: number | null;
    completed_by_name: string | null;
    close_note: string | null;
    created_at: string | null;
  };
  commercial: {
    quoted: number | null;
    quoted_workshop: number | null;
    has_quote: boolean;
    labour_cost: number;
    labour_hours: number;
    material_cost_planned: number;
    material_cost_actual: number;
    material_cost_committed: number;
    committed_cost: number;
    workshop_margin_value: number | null;
    workshop_margin_pct: number | null;
    invoiced_total: number;
    unallocated_invoice_total: number;
  };
  labour_by_freelancer: Array<{
    freelancer_id: number;
    freelancer_name: string;
    role: string;
    hours: number;
    cost: number;
  }>;
  labour_by_activity: Array<{
    activity: string;
    hours: number;
    cost: number;
  }>;
  material_by_category: Array<{
    category: string;
    planned_cost: number;
    line_count: number;
  }>;
  material_by_supplier: Array<{
    supplier: string;
    planned_cost: number;
    line_count: number;
  }>;
  wo_variance_top: Array<{
    work_order_id: number;
    description: string;
    status: string;
    activity_label: string;
    scope_name: string;
    estimated_duration_hrs: number;
    actual_hours: number;
    variance_hrs: number;
  }>;
  scope_cost: Array<{
    scope_item_id: number;
    item_name: string;
    planned_material: number;
    actual_material: number;
  }>;
  learnings: Array<{
    learning_id: number;
    headline: string;
    detail: string;
    category: string;
    severity: string;
    cost_impact_gbp: number | null;
    hours_impact: number | null;
    created_at: string;
  }>;
  post_complete_edits: {
    edit_count: number;
    last_edit_at: string | null;
  };
  generated_at: string;
}

export default function JobCloseReport() {
  const params = useParams();
  const router = useRouter();
  const jobId = Number(params.jobId);
  const supabase = createClient();
  const [data, setData] = useState<CloseReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("rpc_job_close_report", { p_job_id: jobId })
      .then(({ data: d, error }) => {
        if (error) { console.error(error); }
        setData(d as CloseReport);
        setLoading(false);
      });
  }, [jobId, supabase]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted animate-pulse">Generating close report…</div>;
  }
  if (!data?.job) {
    return <div className="text-center py-12 text-muted">No data found for this job</div>;
  }

  const { job, commercial: c, post_complete_edits: edits } = data;
  const isComplete = job.job_status === "Complete";
  const totalCommitted = c.labour_cost + c.material_cost_committed;
  // Quote / margin come straight from the canonical financial layer. They are
  // NULL when there is no quote to measure against — we render "—", never a
  // confident £0 / 0%. Margin basis is the WORKSHOP quote (excludes
  // Subcontracted / Provisional — the full quote includes work that isn't
  // ours to cost).
  const hasQuote = c.quoted != null;
  const marginPct = c.workshop_margin_pct;       // null = no basis
  const marginValue = c.workshop_margin_value;   // null = no basis
  const materialOverrun = c.material_cost_actual > c.material_cost_planned && c.material_cost_planned > 0;

  const marginColor =
    marginPct == null ? "text-muted" :
    marginPct >= 25 ? "text-starlight-green" :
    marginPct >= 10 ? "text-starlight-amber" :
    "text-starlight-red";
  const marginBg =
    marginPct == null ? "bg-base border-subtle" :
    marginPct >= 25 ? "bg-starlight-green/10 border-starlight-green/30" :
    marginPct >= 10 ? "bg-starlight-amber/10 border-starlight-amber/30" :
    "bg-starlight-red/10 border-starlight-red/30";

  return (
    <div className="max-w-5xl mx-auto space-y-6 print:space-y-4 print:max-w-none">
      {/* Top nav (print:hidden) */}
      <div className="flex items-center justify-between print:hidden">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-surface-mid text-muted hover:text-navy hover:bg-surface-hi rounded-lg transition-colors"
        >
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
      </div>

      {/* Header */}
      <div className="card px-6 py-5 print:shadow-none print:border print:px-4 print:py-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted font-mono">{job.job_number}</p>
            <h1 className="text-2xl font-semibold text-navy mt-0.5">{job.job_name}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted">
              <span>{job.client_name}</span>
              {job.event_date && <span>· {formatDate(job.event_date)}</span>}
              {job.event_location && <span>· {job.event_location}</span>}
            </div>
          </div>
          <div className="text-right">
            {isComplete ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-starlight-green/10 text-starlight-green rounded-full text-xs font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Complete
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-starlight-blue/10 text-starlight-blue rounded-full text-xs font-medium">
                <Clock className="h-3.5 w-3.5" />
                Interim ({job.job_status})
              </div>
            )}
            {isComplete && job.completed_at && (
              <p className="text-[10px] text-muted mt-1.5">
                Completed {formatDate(job.completed_at)}
                {job.completed_by_name ? ` by ${job.completed_by_name}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* Post-complete edits warning */}
        {isComplete && edits.edit_count > 0 && (
          <div className="mt-4 flex gap-2.5 px-3 py-2.5 bg-starlight-amber/10 border border-starlight-amber/30 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-starlight-amber shrink-0 mt-0.5" />
            <div className="text-xs text-navy leading-relaxed">
              <strong>{edits.edit_count} edit{edits.edit_count === 1 ? "" : "s"} since marked Complete.</strong>
              {edits.last_edit_at && <> Last on {formatDate(edits.last_edit_at)}.</>}
              {" "}Numbers below reflect those changes.
            </div>
          </div>
        )}
      </div>

      {/* Commercial summary */}
      <div className="card px-6 py-5 print:shadow-none print:border print:px-4 print:py-3">
        <h2 className="text-sm font-semibold text-navy uppercase tracking-wider mb-4">Commercial</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="px-3 py-2.5 bg-base rounded-lg">
            <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Quoted</p>
            <p className="text-lg font-semibold text-navy mt-0.5">{hasQuote ? formatCurrency(c.quoted as number) : "—"}</p>
            <p className="text-[10px] text-muted mt-0.5">
              {c.quoted_workshop != null
                ? <>Workshop + stock <span className="font-mono text-navy">{formatCurrency(c.quoted_workshop)}</span></>
                : <span className="italic">No quote captured</span>}
            </p>
          </div>
          <div className="px-3 py-2.5 bg-base rounded-lg">
            <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Labour</p>
            <p className="text-lg font-semibold text-navy mt-0.5">{formatCurrency(c.labour_cost)}</p>
            <p className="text-[10px] text-muted mt-0.5">{Number(c.labour_hours).toFixed(1)}h</p>
          </div>
          <div className="px-3 py-2.5 bg-base rounded-lg">
            <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Materials</p>
            <div className="mt-0.5 space-y-0.5">
              <p className="text-xs">
                <span className="text-muted">Plan </span>
                <span className="font-semibold text-navy font-mono">{formatCurrency(c.material_cost_planned)}</span>
              </p>
              <p className="text-xs">
                <span className="text-muted">Actual </span>
                <span className={"font-semibold font-mono " + (materialOverrun ? "text-starlight-red" : "text-navy")}>
                  {formatCurrency(c.material_cost_actual)}
                </span>
              </p>
            </div>
          </div>
          <div className={"px-3 py-2.5 rounded-lg border " + marginBg}>
            <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Margin</p>
            {marginPct == null ? (
              <>
                <p className={"text-lg font-semibold mt-0.5 " + marginColor}>—</p>
                <p className="text-[10px] text-muted mt-0.5">No workshop + stock quote to measure against</p>
              </>
            ) : (
              <>
                <p className={"text-lg font-semibold mt-0.5 " + marginColor}>{marginPct.toFixed(1)}%</p>
                <p className={"text-[10px] mt-0.5 " + marginColor}>{marginValue != null ? formatCurrency(marginValue) : "—"}</p>
                <p className="text-[10px] text-muted mt-0.5">vs workshop + stock quoted</p>
              </>
            )}
          </div>
        </div>

        {/* Invoice reconciliation hint */}
        {c.unallocated_invoice_total > 0 && (
          <div className="mt-4 flex gap-2 px-3 py-2 bg-starlight-blue/5 border border-starlight-blue/20 rounded-lg text-xs text-muted">
            <AlertTriangle className="h-3.5 w-3.5 text-starlight-blue shrink-0 mt-0.5" />
            <span>
              <strong className="text-navy">{formatCurrency(c.unallocated_invoice_total)}</strong> in invoices not yet allocated to a scope or work order. Until allocated, this spend isn&apos;t reflected in the actual material cost.
            </span>
          </div>
        )}
      </div>

      {/* Close note */}
      {job.close_note && (
        <div className="card px-6 py-5 print:shadow-none print:border print:px-4 print:py-3">
          <h2 className="text-sm font-semibold text-navy uppercase tracking-wider mb-3 inline-flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted" /> Close Note
          </h2>
          <p className="text-sm text-navy whitespace-pre-wrap leading-relaxed">{job.close_note}</p>
        </div>
      )}

      {/* Labour by freelancer */}
      {data.labour_by_freelancer.length > 0 && (
        <div className="card px-6 py-5 print:shadow-none print:border print:px-4 print:py-3 print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-navy uppercase tracking-wider mb-3 inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-muted" /> Labour by Person
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle text-xs text-muted uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Person</th>
                  <th className="text-left py-2 font-medium">Role</th>
                  <th className="text-right py-2 font-medium">Hours</th>
                  <th className="text-right py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.labour_by_freelancer.map((r) => (
                  <tr key={r.freelancer_id} className="border-b border-subtle/40">
                    <td className="py-2 text-navy">{r.freelancer_name || "—"}</td>
                    <td className="py-2 text-muted text-xs">{r.role || "—"}</td>
                    <td className="py-2 text-right font-mono">{Number(r.hours).toFixed(1)}</td>
                    <td className="py-2 text-right font-mono">{formatCurrency(r.cost)}</td>
                  </tr>
                ))}
                <tr className="font-semibold text-navy">
                  <td className="py-2" colSpan={2}>Total</td>
                  <td className="py-2 text-right font-mono">{Number(c.labour_hours).toFixed(1)}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(c.labour_cost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Labour by activity */}
      {data.labour_by_activity.length > 0 && (
        <div className="card px-6 py-5 print:shadow-none print:border print:px-4 print:py-3 print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-navy uppercase tracking-wider mb-3">Labour by Activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle text-xs text-muted uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Activity</th>
                  <th className="text-right py-2 font-medium">Hours</th>
                  <th className="text-right py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.labour_by_activity.map((r) => (
                  <tr key={r.activity} className="border-b border-subtle/40">
                    <td className="py-2 text-navy">{r.activity || "—"}</td>
                    <td className="py-2 text-right font-mono">{Number(r.hours).toFixed(1)}</td>
                    <td className="py-2 text-right font-mono">{formatCurrency(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Material by category (BOM plan) */}
      {data.material_by_category.length > 0 && (
        <div className="card px-6 py-5 print:shadow-none print:border print:px-4 print:py-3 print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-navy uppercase tracking-wider mb-3 inline-flex items-center gap-2">
            <Package className="h-4 w-4 text-muted" /> Materials by Category
          </h2>
          <p className="text-[10px] text-muted mb-3">Planned spend from the BOM. Actual spend by category will require invoice-line categorisation.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle text-xs text-muted uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Category</th>
                  <th className="text-right py-2 font-medium">Lines</th>
                  <th className="text-right py-2 font-medium">Planned</th>
                </tr>
              </thead>
              <tbody>
                {data.material_by_category.map((r) => (
                  <tr key={r.category} className="border-b border-subtle/40">
                    <td className="py-2 text-navy">{r.category}</td>
                    <td className="py-2 text-right text-muted text-xs">{r.line_count}</td>
                    <td className="py-2 text-right font-mono">{formatCurrency(r.planned_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Material by supplier (BOM plan) */}
      {data.material_by_supplier.length > 0 && (
        <div className="card px-6 py-5 print:shadow-none print:border print:px-4 print:py-3 print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-navy uppercase tracking-wider mb-3">Planned Spend by Supplier</h2>
          <p className="text-[10px] text-muted mb-3">From the BOM. Actual invoiced spend by supplier lives in the invoices view.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle text-xs text-muted uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Supplier</th>
                  <th className="text-right py-2 font-medium">Lines</th>
                  <th className="text-right py-2 font-medium">Planned</th>
                </tr>
              </thead>
              <tbody>
                {data.material_by_supplier.map((r) => (
                  <tr key={r.supplier} className="border-b border-subtle/40">
                    <td className="py-2 text-navy">{r.supplier}</td>
                    <td className="py-2 text-right text-muted text-xs">{r.line_count}</td>
                    <td className="py-2 text-right font-mono">{formatCurrency(r.planned_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* WO variance — top movers */}
      {data.wo_variance_top.length > 0 && (
        <div className="card px-6 py-5 print:shadow-none print:border print:px-4 print:py-3 print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-navy uppercase tracking-wider mb-3">Variance vs Estimate</h2>
          <p className="text-xs text-muted mb-3">Where actual hours diverged most from the plan.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle text-xs text-muted uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">WO</th>
                  <th className="text-left py-2 font-medium">Activity</th>
                  <th className="text-right py-2 font-medium">Est</th>
                  <th className="text-right py-2 font-medium">Actual</th>
                  <th className="text-right py-2 font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {data.wo_variance_top.map((r) => {
                  const v = Number(r.variance_hrs);
                  const overrun = v > 0;
                  return (
                    <tr key={r.work_order_id} className="border-b border-subtle/40">
                      <td className="py-2 text-navy max-w-md">
                        <p className="truncate">{r.description || "—"}</p>
                        <p className="text-[10px] text-muted truncate">{r.scope_name || "—"}</p>
                      </td>
                      <td className="py-2 text-muted text-xs">{r.activity_label || "—"}</td>
                      <td className="py-2 text-right font-mono text-muted">{Number(r.estimated_duration_hrs).toFixed(1)}</td>
                      <td className="py-2 text-right font-mono">{Number(r.actual_hours).toFixed(1)}</td>
                      <td className={"py-2 text-right font-mono inline-flex items-center justify-end gap-1 " + (overrun ? "text-starlight-red" : "text-starlight-green")}>
                        {overrun ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {overrun ? "+" : ""}{v.toFixed(1)}h
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scope cost — where material spend went */}
      {data.scope_cost.length > 0 && (
        <div className="card px-6 py-5 print:shadow-none print:border print:px-4 print:py-3 print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-navy uppercase tracking-wider mb-3">Material Cost by Scope</h2>
          <p className="text-[10px] text-muted mb-3">Plan = BOM. Actual = invoice allocations to this scope or its work orders.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle text-xs text-muted uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Scope</th>
                  <th className="text-right py-2 font-medium">Plan</th>
                  <th className="text-right py-2 font-medium">Actual</th>
                  <th className="text-right py-2 font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {data.scope_cost.map((r) => {
                  const variance = Number(r.actual_material) - Number(r.planned_material);
                  const overrun = variance > 0 && Number(r.planned_material) > 0;
                  return (
                    <tr key={r.scope_item_id} className="border-b border-subtle/40">
                      <td className="py-2 text-navy">{r.item_name}</td>
                      <td className="py-2 text-right font-mono text-muted">{formatCurrency(r.planned_material)}</td>
                      <td className={"py-2 text-right font-mono " + (overrun ? "text-starlight-red" : "")}>
                        {formatCurrency(r.actual_material)}
                      </td>
                      <td className={"py-2 text-right font-mono text-xs " + (overrun ? "text-starlight-red" : variance < 0 ? "text-muted" : "text-faint")}>
                        {variance === 0 ? "—" : (variance > 0 ? "+" : "") + formatCurrency(variance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Learnings */}
      {data.learnings.length > 0 && (
        <div className="card px-6 py-5 print:shadow-none print:border print:px-4 print:py-3 print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-navy uppercase tracking-wider mb-3 inline-flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted" /> Learnings
          </h2>
          <div className="space-y-3">
            {data.learnings.map((l) => (
              <div key={l.learning_id} className="border-l-2 border-starlight-blue/40 pl-3 py-1">
                <p className="text-sm text-navy font-medium">{l.headline}</p>
                {l.detail && <p className="text-xs text-muted mt-1 leading-relaxed whitespace-pre-wrap">{l.detail}</p>}
                <p className="text-[10px] text-muted mt-1">
                  {l.category}{l.severity ? ` · ${l.severity}` : ""}
                  {l.cost_impact_gbp ? ` · ${formatCurrency(l.cost_impact_gbp)}` : ""}
                  {l.hours_impact ? ` · ${l.hours_impact}h` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-[10px] text-muted print:text-[9px]">
        Generated {formatDate(data.generated_at)} · Live data
      </div>
    </div>
  );
}
