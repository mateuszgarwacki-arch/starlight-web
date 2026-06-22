"use client";

/**
 * JobCompleteDialog
 *
 * Confirms marking a job as Complete.
 *
 * - Calls rpc_job_close_report on open to show LIVE numbers (quote, labour,
 *   materials, hours) so the PM sees what they're closing against.
 * - Surfaces a soft warning if any non-overhead WOs are still active. Does
 *   NOT block — design principle: soft signals only.
 * - Captures an optional close_note (one free-text field). PM can hit
 *   "Skip & Complete" without writing one.
 * - Writes via auditedUpdate so the close is logged in tbl_audit_log.
 * - On success, navigates to /reports/job-close/[jobId].
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { auditedUpdate, getAuditContext } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle2, X, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface JobCompleteDialogProps {
  jobId: number;
  jobNumber: string;
  jobName: string;
  onClose: () => void;
  onCompleted: () => void;
}

interface ReportSummary {
  commercial: {
    quoted: number | null;            // full quote — all non-overhead lines. NULL = no quote captured.
    quoted_workshop: number | null;   // workshop slice — excludes Subcontracted / Provisional. NULL = no quote.
    has_quote: boolean;               // false = no quote lines exist for this job
    labour_cost: number;
    labour_hours: number;
    material_cost_planned: number;   // BOM total — the plan
    material_cost_actual: number;    // invoice allocations — what's actually been spent
    material_cost_committed: number; // MAX(planned, actual) — drives margin
    committed_cost: number;          // labour + material_committed (canonical)
    workshop_margin_value: number | null; // NULL when there is no workshop quote basis
    workshop_margin_pct: number | null;   // NULL when there is no workshop quote basis
    invoiced_total: number;
    unallocated_invoice_total: number;
  };
  active_wo_count: number;
}

export function JobCompleteDialog({
  jobId,
  jobNumber,
  jobName,
  onClose,
  onCompleted,
}: JobCompleteDialogProps) {
  const supabase = createClient();
  const router = useRouter();

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [closeNote, setCloseNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load summary on open
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Pull commercial numbers from the close-report RPC (single source of truth)
      // + a separate count of non-overhead WOs that aren't Complete or Voided.
      const [reportRes, woRes] = await Promise.all([
        supabase.rpc("rpc_job_close_report", { p_job_id: jobId }),
        supabase
          .from("tbl_work_orders")
          .select("work_order_id, status, activity_verb, tbl_master_lookups!inner(lookup_value)")
          .eq("job_id", jobId)
          .not("status", "in", "(\"Complete\",\"Voided\")"),
      ]);
      if (cancelled) return;

      // Filter out OVERHEAD activity from the active count — overhead WOs
      // are persistent buckets, not signals of incomplete work.
      const activeWos = (woRes.data || []).filter((w: any) => {
        const verb = w.tbl_master_lookups?.lookup_value;
        return verb !== "OVERHEAD";
      });

      const data = reportRes.data as any;
      setSummary({
        commercial: data?.commercial || {
          quoted: null, quoted_workshop: null, has_quote: false,
          labour_cost: 0, labour_hours: 0,
          material_cost_planned: 0, material_cost_actual: 0, material_cost_committed: 0,
          committed_cost: 0, workshop_margin_value: null, workshop_margin_pct: null,
          invoiced_total: 0, unallocated_invoice_total: 0,
        },
        active_wo_count: activeWos.length,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [jobId, supabase]);

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const handleComplete = async () => {
    setSaving(true);
    try {
      const ctx = await getAuditContext(supabase);

      // completed_by is INT FK to tbl_freelancers. Read it from JWT
      // user_metadata where present (set when freelancers and PM-with-row
      // log in). Admin / staff with no freelancer row -> NULL. The audit
      // log row records the actual auth UUID either way, so accountability
      // is preserved regardless.
      const { data: { user } } = await supabase.auth.getUser();
      const completedByFreelancerId =
        (user?.user_metadata?.freelancer_id as number | undefined) ?? null;

      const result = await auditedUpdate(
        ctx,
        "tbl_production_plan",
        jobId,
        {
          job_status: "Complete",
          completed_at: new Date().toISOString(),
          completed_by: completedByFreelancerId,
          close_note: closeNote.trim() || null,
        },
        jobId, // jobId arg for the audit row's job_id linkage
      );

      if (result.error) {
        toast.error("Failed to complete: " + result.error.message);
        setSaving(false);
        return;
      }
      if (result.conflict) {
        toast.warning("Job was modified elsewhere — reload and try again");
        setSaving(false);
        return;
      }

      toast.success("Job marked Complete");
      onCompleted();
      // Navigate to the close report
      router.push(`/reports/job-close/${jobId}`);
    } catch (err: any) {
      toast.error("Failed to complete: " + (err?.message || "unknown error"));
      setSaving(false);
    }
  };

  const c = summary?.commercial;
  // Total Committed = labour spent + materials at the worse of (plan, actual).
  // Matches the system-wide rule that margin is calculated against committed cost.
  const totalCommitted = c ? (c.labour_cost + c.material_cost_committed) : 0;
  // Quote / margin come straight from the canonical financial layer. They are
  // NULL when there is no quote to measure against — we render "—", never a
  // confident £0 / 0%. Margin basis is the WORKSHOP quote (the full figure
  // includes subcontracted / provisional work that isn't ours to cost).
  const hasQuote = !!c && c.quoted != null;
  const marginPct = c?.workshop_margin_pct ?? null;        // null = no basis
  const marginValue = c?.workshop_margin_value ?? null;    // null = no basis
  const materialOverrun = c ? (c.material_cost_actual > c.material_cost_planned && c.material_cost_planned > 0) : false;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-subtle flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-navy flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-starlight-green" />
              Complete Job
            </h3>
            <p className="text-xs text-muted mt-0.5 font-mono">{jobNumber} — {jobName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 text-faint hover:text-muted rounded transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading summary…
            </div>
          ) : (
            <>
              {/* Soft warning if WOs still active */}
              {summary && summary.active_wo_count > 0 && (
                <div className="flex gap-2.5 px-3 py-2.5 bg-starlight-amber/10 border border-starlight-amber/30 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-starlight-amber shrink-0 mt-0.5" />
                  <div className="text-xs text-navy leading-relaxed">
                    <strong>{summary.active_wo_count} work order{summary.active_wo_count === 1 ? "" : "s"} still active.</strong>
                    {" "}You can still complete the job — this is just a heads-up. They&apos;ll appear in the close report as unfinished.
                  </div>
                </div>
              )}

              {/* Commercial snapshot — live numbers */}
              {c && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="px-3 py-2.5 bg-base rounded-lg">
                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Quoted</p>
                    <p className="text-base font-semibold text-navy mt-0.5">{hasQuote ? formatCurrency(c.quoted as number) : "—"}</p>
                    <p className="text-[10px] text-muted mt-0.5">
                      {c.quoted_workshop != null
                        ? <>Workshop + stock <span className="font-mono text-navy">{formatCurrency(c.quoted_workshop)}</span></>
                        : <span className="italic">No quote captured</span>}
                    </p>
                  </div>
                  <div className="px-3 py-2.5 bg-base rounded-lg">
                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Total Committed</p>
                    <p className="text-base font-semibold text-navy mt-0.5">{formatCurrency(totalCommitted)}</p>
                  </div>
                  <div className="px-3 py-2.5 bg-base rounded-lg">
                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Labour</p>
                    <p className="text-sm font-semibold text-navy mt-0.5">
                      {formatCurrency(c.labour_cost)}
                      <span className="text-xs text-muted font-normal ml-1.5">
                        / {Number(c.labour_hours).toFixed(1)}h
                      </span>
                    </p>
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
                  <div className={
                    "col-span-2 px-3 py-2.5 rounded-lg " +
                    (marginPct == null ? "bg-base" :
                     marginPct >= 20 ? "bg-starlight-green/10" :
                     marginPct >= 0 ? "bg-starlight-amber/10" : "bg-starlight-red/10")
                  }>
                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Estimated Margin</p>
                    {marginPct == null ? (
                      <>
                        <p className="text-base font-semibold mt-0.5 text-muted">—</p>
                        <p className="text-[10px] text-muted mt-0.5">No workshop + stock quote captured to measure against</p>
                      </>
                    ) : (
                      <>
                        <p className={
                          "text-base font-semibold mt-0.5 " +
                          (marginPct >= 20 ? "text-starlight-green" :
                           marginPct >= 0 ? "text-starlight-amber" : "text-starlight-red")
                        }>
                          {marginPct.toFixed(1)}%
                          <span className="text-xs text-muted font-normal ml-1.5">
                            ({marginValue != null ? formatCurrency(marginValue) : "—"})
                          </span>
                        </p>
                        <p className="text-[10px] text-muted mt-0.5">vs workshop + stock quoted {formatCurrency(c.quoted_workshop as number)}</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Unallocated invoices warning */}
              {c && c.unallocated_invoice_total > 0 && (
                <div className="flex gap-2.5 px-3 py-2 bg-starlight-blue/5 border border-starlight-blue/20 rounded-lg">
                  <AlertTriangle className="h-3.5 w-3.5 text-starlight-blue shrink-0 mt-0.5" />
                  <div className="text-xs text-muted leading-relaxed">
                    <strong className="text-navy">{formatCurrency(c.unallocated_invoice_total)}</strong> in invoices not yet allocated to a scope or work order. Allocate them so the cost shows in the right place.
                  </div>
                </div>
              )}

              {/* Close note */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">
                  Anything to note for next time? <span className="text-faint font-normal">(optional)</span>
                </label>
                <textarea
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  rows={3}
                  placeholder="What went well, what didn't, anything future-you should know about this job…"
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
                  disabled={saving}
                />
                <p className="text-[10px] text-muted mt-1">
                  Specific lessons (a supplier, a technique) are better captured as a Learning. This is the job-level wrap.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-subtle flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleComplete}
            disabled={loading || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-starlight-green text-white text-sm font-medium rounded-lg hover:bg-starlight-green/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Completing…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {closeNote.trim() ? "Complete Job" : "Skip & Complete"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
