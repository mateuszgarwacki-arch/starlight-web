"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatHours } from "@/lib/format-hours";
import { AlertTriangle, Check, User, Clock, X, Edit3, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { getAuditContext, auditedUpdate } from "@/lib/audit";
import Link from "next/link";
import { ReviewNavChips } from "@/components/review-nav-chips";

interface FlagRow {
  flag_id: number;
  freelancer_id: number;
  freelancer_name: string;
  flag_date: string;
  expected_hours: number;
  logged_hours: number;
  status: string;
  reason_category: string | null;
  reason_note: string | null;
  raised_at: string;
  resolved_at: string | null;
}

// Pending edit request from a freelancer. Enriched with the original entry
// values and WO descriptions so the PM can see what's changing without
// drilling in.
interface EditRow {
  edit_id: number;
  entry_id: number;
  freelancer_id: number;
  freelancer_name: string;
  reason: string;
  created_at: string;
  proposed_actual_hours: number | null;
  proposed_work_order_id: number | null;
  // Original entry values
  current_actual_hours: number;
  current_work_order_id: number;
  entry_date: string;
  // WO descriptions for both current and proposed (if WO change)
  current_wo_label: string;
  proposed_wo_label: string | null;
  current_job_number: string | null;
  proposed_job_number: string | null;
}

const REASON_LABEL: Record<string, string> = {
  sick: "Off sick",
  left_early: "Left early",
  materials: "Materials delayed",
  site_closed: "Site closed",
  other: "Other",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-starlight-red/10 text-starlight-red" },
  resolved_logged: { label: "Hours logged", cls: "bg-starlight-green/10 text-starlight-green" },
  resolved_reason: { label: "Reason given", cls: "bg-starlight-blue/10 text-starlight-blue" },
  resolved_admin: { label: "Admin closed", cls: "bg-surface-mid text-muted" },
};

function formatDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(y, m - 1, day);
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default function TimesheetsReviewPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<FlagRow[]>([]);
  const [edits, setEdits] = useState<EditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [reviewingEditId, setReviewingEditId] = useState<number | null>(null);

  const load = useCallback(async () => {
    // Option 3 (S38c): page-load re-run of the detector for the last 14 days
    // as a safety net in case the on-write trigger ever misses something or
    // a new write path isn't yet covered. Cheap (idempotent, narrow-scope
    // query) and guarantees the admin always sees current state.
    const dates: string[] = [];
    const d = new Date();
    for (let i = 1; i <= 14; i++) {
      const dt = new Date(d);
      dt.setDate(dt.getDate() - i);
      dates.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
    }
    await Promise.all(dates.map(date =>
      supabase.rpc("rpc_detect_timesheet_gaps", { p_flag_date: date })
    ));

    const [flagsRes, editsRes] = await Promise.all([
      supabase
        .from("tbl_timesheet_flags")
        .select("flag_id, freelancer_id, flag_date, expected_hours, logged_hours, status, reason_category, reason_note, raised_at, resolved_at")
        .order("flag_date", { ascending: false })
        .order("freelancer_id")
        .limit(200),
      supabase
        .from("tbl_wo_time_entry_edits")
        .select("edit_id, entry_id, freelancer_id, reason, created_at, proposed_actual_hours, proposed_work_order_id")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    ]);

    const flagRows = (flagsRes.data || []) as any[];
    const editsData = (editsRes.data || []) as any[];

    // Collect all freelancer/entry/wo ids we need to enrich.
    const fIds = [...new Set([...flagRows.map(r => r.freelancer_id), ...editsData.map(e => e.freelancer_id)])];
    const entryIds = [...new Set(editsData.map(e => e.entry_id))];
    const [fNamesRes, entriesRes] = await Promise.all([
      fIds.length > 0
        ? supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", fIds)
        : Promise.resolve({ data: [] }),
      entryIds.length > 0
        ? supabase.from("tbl_wo_time_entries").select("entry_id, work_order_id, actual_hours, actual_start_timestamp").in("entry_id", entryIds)
        : Promise.resolve({ data: [] }),
    ]);
    const nameMap: Record<number, string> = {};
    (fNamesRes.data || []).forEach((f: any) => { nameMap[f.freelancer_id] = f.freelancer_name; });
    const entryMap: Record<number, any> = {};
    (entriesRes.data || []).forEach((e: any) => { entryMap[e.entry_id] = e; });

    // Resolve all WO ids we need (current + proposed) for the edits.
    const woIds = [...new Set([
      ...editsData.map((e: any) => entryMap[e.entry_id]?.work_order_id).filter(Boolean),
      ...editsData.map((e: any) => e.proposed_work_order_id).filter(Boolean),
    ])];
    let woMap: Record<number, { desc: string; job_id: number }> = {};
    let jobNumMap: Record<number, string> = {};
    if (woIds.length > 0) {
      const { data: wos } = await supabase.from("tbl_work_orders").select("work_order_id, description, job_id").in("work_order_id", woIds);
      (wos || []).forEach((w: any) => { woMap[w.work_order_id] = { desc: w.description || "Work Order", job_id: w.job_id }; });
      const jobIds = [...new Set(Object.values(woMap).map((w: any) => w.job_id).filter(Boolean))];
      if (jobIds.length > 0) {
        const { data: jobs } = await supabase.from("tbl_production_plan").select("job_id, job_number").in("job_id", jobIds);
        (jobs || []).forEach((j: any) => { jobNumMap[j.job_id] = j.job_number; });
      }
    }

    setRows(flagRows.map(r => ({ ...r, freelancer_name: nameMap[r.freelancer_id] || `#${r.freelancer_id}` })));

    const enrichedEdits: EditRow[] = editsData
      .map((e: any) => {
        const entry = entryMap[e.entry_id];
        if (!entry) return null;  // entry was deleted? skip
        const curWo = woMap[entry.work_order_id];
        const propWo = e.proposed_work_order_id ? woMap[e.proposed_work_order_id] : null;
        return {
          edit_id: e.edit_id,
          entry_id: e.entry_id,
          freelancer_id: e.freelancer_id,
          freelancer_name: nameMap[e.freelancer_id] || `#${e.freelancer_id}`,
          reason: e.reason,
          created_at: e.created_at,
          proposed_actual_hours: e.proposed_actual_hours,
          proposed_work_order_id: e.proposed_work_order_id,
          current_actual_hours: Number(entry.actual_hours) || 0,
          current_work_order_id: entry.work_order_id,
          entry_date: (entry.actual_start_timestamp || "").split("T")[0],
          current_wo_label: curWo?.desc || `WO #${entry.work_order_id}`,
          proposed_wo_label: propWo?.desc || null,
          current_job_number: curWo ? jobNumMap[curWo.job_id] || null : null,
          proposed_job_number: propWo ? jobNumMap[propWo.job_id] || null : null,
        } as EditRow;
      })
      .filter((e: EditRow | null): e is EditRow => e !== null);
    setEdits(enrichedEdits);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const adminClose = async (flag: FlagRow) => {
    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(ctx, "tbl_timesheet_flags", flag.flag_id, {
      status: "resolved_admin",
      resolved_at: new Date().toISOString(),
      resolved_by_admin: true,
    });
    if (result.conflict) { toast.warning("Someone else updated — reloading"); await load(); return; }
    toast.success("Flag closed");
    await load();
  };

  // Approve a pending edit. The RPC atomically applies the proposed values
  // to the entry and marks the edit row as approved. Optional review_note
  // is shown to the freelancer (rarely needed on approve, but available).
  const approveEdit = async (edit: EditRow) => {
    setReviewingEditId(edit.edit_id);
    try {
      const { error } = await supabase.rpc("rpc_approve_time_entry_edit", {
        p_edit_id: edit.edit_id, p_review_note: null,
      });
      if (error) throw error;
      toast.success("Edit approved");
      await load();
    } catch (err: any) {
      toast.error("Approve failed: " + (err.message || "unknown"));
    } finally {
      setReviewingEditId(null);
    }
  };

  // Reject a pending edit. Prompt for a short reason that's shown to the
  // freelancer back in /m/me — closes the loop so they understand why.
  const rejectEdit = async (edit: EditRow) => {
    const note = prompt(`Reject this edit? Tell ${edit.freelancer_name} why (optional):`, "");
    if (note === null) return;  // cancelled
    setReviewingEditId(edit.edit_id);
    try {
      const { error } = await supabase.rpc("rpc_reject_time_entry_edit", {
        p_edit_id: edit.edit_id, p_review_note: note.trim() || null,
      });
      if (error) throw error;
      toast.success("Edit rejected");
      await load();
    } catch (err: any) {
      toast.error("Reject failed: " + (err.message || "unknown"));
    } finally {
      setReviewingEditId(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-40 text-muted text-sm animate-pulse">Loading...</div>;

  const open = rows.filter(r => r.status === "open");
  const resolved = rows.filter(r => r.status !== "open");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-navy">Timesheet gaps</h1>
        <p className="text-xs text-muted mt-0.5">Days where a freelancer logged some hours but less than 90% of their standard day.</p>
      </div>

      <ReviewNavChips />

      {/* Pending edit requests from freelancers. Original entries are NOT
          touched until approved — so all cost/margin reports continue to
          use the canonical value while these sit here. */}
      {edits.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 bg-starlight-blue/5 border-b border-subtle flex items-center gap-2">
            <Edit3 className="h-4 w-4 text-starlight-blue" />
            <h2 className="text-sm font-semibold text-navy">Edit requests ({edits.length})</h2>
            <span className="text-[10px] text-muted ml-2">Originals untouched until you approve</span>
          </div>
          <div className="divide-y divide-subtle">
            {edits.map((e) => {
              const hoursChanged = e.proposed_actual_hours != null;
              const woChanged = e.proposed_work_order_id != null;
              const reviewing = reviewingEditId === e.edit_id;
              return (
                <div key={e.edit_id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/crew/${e.freelancer_id}`} className="text-sm font-medium text-navy hover:text-starlight-blue">{e.freelancer_name}</Link>
                        <span className="text-xs text-muted">{e.entry_date ? formatDate(e.entry_date) : ""}</span>
                        <span className="text-[10px] text-faint">· proposed {new Date(e.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                      </div>

                      {/* Diff line: current → proposed */}
                      <div className="mt-1.5 flex items-center gap-2 text-xs flex-wrap">
                        <span className="font-mono text-muted">
                          {formatHours(e.current_actual_hours)}
                          {" · "}
                          <span className="text-navy">{e.current_wo_label}</span>
                          {e.current_job_number && <span className="text-faint"> ({e.current_job_number})</span>}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted shrink-0" />
                        <span className="font-mono">
                          {hoursChanged ? (
                            <span className="text-starlight-blue font-semibold">{formatHours(e.proposed_actual_hours!)}</span>
                          ) : (
                            <span className="text-muted">{formatHours(e.current_actual_hours)}</span>
                          )}
                          {" · "}
                          {woChanged ? (
                            <>
                              <span className="text-starlight-blue font-semibold">{e.proposed_wo_label}</span>
                              {e.proposed_job_number && <span className="text-faint"> ({e.proposed_job_number})</span>}
                            </>
                          ) : (
                            <>
                              <span className="text-muted">{e.current_wo_label}</span>
                              {e.current_job_number && <span className="text-faint"> ({e.current_job_number})</span>}
                            </>
                          )}
                        </span>
                      </div>

                      {/* Freelancer's reason */}
                      <p className="text-xs text-muted mt-1.5 italic">"{e.reason}"</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => approveEdit(e)}
                        disabled={reviewing}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-starlight-green rounded-md hover:bg-starlight-green/90 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                      <button
                        onClick={() => rejectEdit(e)}
                        disabled={reviewing}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-starlight-red bg-starlight-red/10 rounded-md hover:bg-starlight-red/20 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Open flags */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 bg-starlight-red/5 border-b border-subtle flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-starlight-red" />
          <h2 className="text-sm font-semibold text-navy">Open ({open.length})</h2>
        </div>
        {open.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted text-center">No open timesheet gaps</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-muted uppercase tracking-wider border-b border-subtle">
                <th className="text-left px-4 py-2 font-medium">Freelancer</th>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-right px-4 py-2 font-medium">Logged</th>
                <th className="text-right px-4 py-2 font-medium">Expected</th>
                <th className="text-right px-4 py-2 font-medium">Short</th>
                <th className="text-left px-4 py-2 font-medium">Raised</th>
                <th className="text-right px-4 py-2 font-medium w-28">Action</th>
              </tr>
            </thead>
            <tbody>
              {open.map(r => {
                const short = Number(r.expected_hours) - Number(r.logged_hours);
                return (
                  <tr key={r.flag_id} className="border-t border-subtle">
                    <td className="px-4 py-2.5">
                      <Link href={`/crew/${r.freelancer_id}`} className="font-medium text-navy hover:text-starlight-blue">{r.freelancer_name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{formatDate(r.flag_date)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-navy">{formatHours(Number(r.logged_hours))}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted">{formatHours(Number(r.expected_hours))}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-starlight-red">{formatHours(short)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{new Date(r.raised_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => adminClose(r)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-navy bg-surface-mid hover:bg-surface-hi rounded-md transition-colors"
                      >
                        <Check className="h-3 w-3" /> Close
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Resolved */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowResolved(!showResolved)}
          className="w-full px-4 py-3 flex items-center justify-between active:bg-surface-dim"
        >
          <h2 className="text-sm font-semibold text-navy">Resolved ({resolved.length})</h2>
          <span className="text-xs text-muted">{showResolved ? "Hide" : "Show"}</span>
        </button>
        {showResolved && resolved.length > 0 && (
          <table className="w-full text-sm border-t border-subtle">
            <thead>
              <tr className="text-[10px] text-muted uppercase tracking-wider border-b border-subtle">
                <th className="text-left px-4 py-2 font-medium">Freelancer</th>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-right px-4 py-2 font-medium">Logged / Expected</th>
                <th className="text-left px-4 py-2 font-medium">How resolved</th>
                <th className="text-left px-4 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {resolved.map(r => {
                const badge = STATUS_BADGE[r.status] || STATUS_BADGE.open;
                return (
                  <tr key={r.flag_id} className="border-t border-subtle">
                    <td className="px-4 py-2.5">
                      <Link href={`/crew/${r.freelancer_id}`} className="font-medium text-navy hover:text-starlight-blue">{r.freelancer_name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{formatDate(r.flag_date)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted">
                      {formatHours(Number(r.logged_hours))} / {formatHours(Number(r.expected_hours))}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium " + badge.cls}>
                        {badge.label}
                      </span>
                      {r.reason_category && (
                        <span className="ml-2 text-xs text-muted">{REASON_LABEL[r.reason_category] || r.reason_category}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted max-w-[240px] truncate">{r.reason_note || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
