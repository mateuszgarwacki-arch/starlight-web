"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { AlertTriangle, Clock, MessageSquare, Plus, X, Check, ChevronRight } from "lucide-react";
import { formatHours } from "@/lib/format-hours";
import { LogSheet, type LogSheetData } from "@/components/log-sheet";
import { getAuditContext, auditedUpdate } from "@/lib/audit";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export interface TimesheetFlag {
  flag_id: number;
  freelancer_id: number;
  flag_date: string; // YYYY-MM-DD
  expected_hours: number;
  logged_hours: number;
  status: string; // 'open' | 'resolved_*'
  reason_category: string | null;
  reason_note: string | null;
}

const REASON_OPTIONS: { key: string; label: string }[] = [
  { key: "sick", label: "Off sick" },
  { key: "left_early", label: "Left early" },
  { key: "materials", label: "Materials delayed" },
  { key: "site_closed", label: "Site closed / no work" },
  { key: "other", label: "Other" },
];

function formatDateShort(d: string): string {
  // d is YYYY-MM-DD
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(y, m - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - dt.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return dt.toLocaleDateString("en-GB", { weekday: "long" });
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface TimesheetFlagsPanelProps {
  myId: number;
  onResolved?: () => void;
}

export function TimesheetFlagsPanel({ myId, onResolved }: TimesheetFlagsPanelProps) {
  const supabase = createClient();
  const router = useRouter();
  const [flags, setFlags] = useState<TimesheetFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasonOpenFor, setReasonOpenFor] = useState<number | null>(null);
  const [pickedReason, setPickedReason] = useState<string>("");
  const [reasonNote, setReasonNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [logSheetFor, setLogSheetFor] = useState<TimesheetFlag | null>(null);

  const load = useCallback(async () => {
    if (!myId) return;
    const { data } = await supabase
      .from("tbl_timesheet_flags")
      .select("*")
      .eq("freelancer_id", myId)
      .eq("status", "open")
      .order("flag_date", { ascending: false });
    setFlags((data || []) as TimesheetFlag[]);
    setLoading(false);
  }, [myId]);

  useEffect(() => { load(); }, [load]);

  const submitReason = async (flag: TimesheetFlag) => {
    if (!pickedReason) { toast.error("Pick a reason"); return; }
    setSubmitting(true);
    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(ctx, "tbl_timesheet_flags", flag.flag_id, {
      status: "resolved_reason",
      reason_category: pickedReason,
      reason_note: reasonNote.trim() || null,
      resolved_at: new Date().toISOString(),
      resolved_by: myId,
    });
    setSubmitting(false);
    if (result.conflict) { toast.warning("Someone else updated this — reloading"); await load(); return; }
    toast.success("Thanks — reason logged");
    setReasonOpenFor(null); setPickedReason(""); setReasonNote("");
    await load();
    onResolved?.();
  };

  // Route "Add hours" → the LogSheet. But the LogSheet (as it exists today) needs
  // a WO context to write a time entry against. We don't have that here — we only
  // know the date. The cleanest path: open the LogSheet in a special "pick WO later"
  // mode isn't built yet. For v1, route the user to /m/task with ?date={flag_date}
  // where they can pick a WO and log time; the cron will auto-close the flag next run.
  // OR: open LogSheet pre-filled but without target, prompt them to go pick a WO.
  // Simpler v1: deep-link to /m/task?date=... — task page already lets them pick a WO
  // and log time against it.
  const goAddHours = (flag: TimesheetFlag) => {
    router.push(`/m/task?date=${flag.flag_date}&short=${(flag.expected_hours - flag.logged_hours).toFixed(2)}`);
  };

  if (loading) return null;
  if (flags.length === 0) return null;

  return (
    <div className="bg-starlight-red/5 border border-starlight-red/30 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-starlight-red/10 border-b border-starlight-red/30 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-starlight-red shrink-0" />
        <p className="text-sm font-semibold text-starlight-red">
          {flags.length} day{flags.length !== 1 ? "s" : ""} need attention
        </p>
      </div>

      <div className="divide-y divide-starlight-red/20">
        {flags.map((flag) => {
          const short = Number(flag.expected_hours) - Number(flag.logged_hours);
          const isOpen = reasonOpenFor === flag.flag_id;
          return (
            <div key={flag.flag_id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy">{formatDateShort(flag.flag_date)}</p>
                  <p className="text-xs text-muted mt-0.5">
                    Logged {formatHours(Number(flag.logged_hours))} of {formatHours(Number(flag.expected_hours))} ·
                    <span className="text-starlight-red font-medium"> {formatHours(short)} short</span>
                  </p>
                </div>
              </div>

              {!isOpen ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => goAddHours(flag)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-starlight-blue text-white text-xs font-semibold rounded-lg active:bg-starlight-blue/90"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add hours
                  </button>
                  <button
                    onClick={() => { setReasonOpenFor(flag.flag_id); setPickedReason(""); setReasonNote(""); }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface border border-subtle text-navy text-xs font-semibold rounded-lg active:bg-surface-dim"
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Give reason
                  </button>
                </div>
              ) : (
                <div className="space-y-2 bg-surface rounded-lg border border-subtle p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Why was it short?</p>
                    <button onClick={() => setReasonOpenFor(null)} className="text-muted"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {REASON_OPTIONS.map((r) => (
                      <button
                        key={r.key}
                        onClick={() => setPickedReason(r.key)}
                        className={"px-2.5 py-1 text-xs rounded-full border transition-colors " + (pickedReason === r.key ? "bg-navy text-white border-navy" : "bg-surface text-muted border-subtle active:bg-surface-dim")}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reasonNote}
                    onChange={(e) => setReasonNote(e.target.value)}
                    placeholder="Optional note..."
                    rows={2}
                    className="w-full px-2 py-1.5 text-sm border border-subtle rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue resize-none"
                  />
                  <button
                    onClick={() => submitReason(flag)}
                    disabled={!pickedReason || submitting}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-starlight-green text-white text-xs font-semibold rounded-lg disabled:opacity-50 active:bg-starlight-green/90"
                  >
                    <Check className="h-3.5 w-3.5" /> {submitting ? "Saving..." : "Submit reason"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Small banner widget for the task list page: red strip with count, tap → /m/me
interface TimesheetFlagsBannerProps { myId: number; }

export function TimesheetFlagsBanner({ myId }: TimesheetFlagsBannerProps) {
  const supabase = createClient();
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    const load = async () => {
      const { count: c } = await supabase
        .from("tbl_timesheet_flags")
        .select("*", { count: "exact", head: true })
        .eq("freelancer_id", myId)
        .eq("status", "open");
      if (!cancelled) setCount(c || 0);
    };
    load();

    // Realtime: refetch when any flag row for this freelancer changes
    const channel = supabase
      .channel(`timesheet-flags-${myId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tbl_timesheet_flags", filter: `freelancer_id=eq.${myId}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [myId]);

  if (count === 0) return null;

  return (
    <button
      onClick={() => router.push("/m/me")}
      className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-starlight-red/10 border border-starlight-red/30 rounded-lg active:bg-starlight-red/15"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-starlight-red shrink-0" />
        <span className="text-sm font-semibold text-starlight-red">
          {count} day{count !== 1 ? "s" : ""} need attention
        </span>
      </div>
      <ChevronRight className="h-4 w-4 text-starlight-red" />
    </button>
  );
}
