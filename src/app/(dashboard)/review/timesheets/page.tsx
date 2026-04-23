"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatHours } from "@/lib/format-hours";
import { AlertTriangle, Check, User, Clock, X } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

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

    const { data } = await supabase
      .from("tbl_timesheet_flags")
      .select("flag_id, freelancer_id, flag_date, expected_hours, logged_hours, status, reason_category, reason_note, raised_at, resolved_at")
      .order("flag_date", { ascending: false })
      .order("freelancer_id")
      .limit(200);
    const flagRows = (data || []) as any[];
    const fIds = [...new Set(flagRows.map(r => r.freelancer_id))];
    const { data: fData } = fIds.length > 0
      ? await supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", fIds)
      : { data: [] };
    const nameMap: Record<number, string> = {};
    (fData || []).forEach((f: any) => { nameMap[f.freelancer_id] = f.freelancer_name; });
    setRows(flagRows.map(r => ({ ...r, freelancer_name: nameMap[r.freelancer_id] || `#${r.freelancer_id}` })));
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
