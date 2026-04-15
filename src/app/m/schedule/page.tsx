"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatHours } from "@/lib/format-hours";
import { Check, ChevronLeft, ChevronRight, X, CalendarPlus, AlertTriangle, Save } from "lucide-react";
import { notify } from "@/lib/notifications";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/auth-headers";
import { auditedUpdate } from "@/lib/audit";

function localDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function todayLocal(): string {
  const d = new Date(); return localDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

interface ScheduleRow {
  schedule_id: number; freelancer_id: number; scheduled_date: string; status: string;
  job_id: number | null; notes: string | null; booking_group: string | null;
  notified_at: string | null; unavailable_reason: string | null;
}
interface JobInfo { job_id: number; job_name: string | null; job_number: string | null; event_date: string | null; }
interface BookingGroup {
  key: string; job: JobInfo | null; notes: string | null; rows: ScheduleRow[];
  dateRange: string; dayCount: number; status: "pending" | "confirmed" | "partial" | "declined";
}
interface DayInfo { status: string; job: JobInfo | null; row: ScheduleRow; }
interface TimeEntry {
  entry_id: number; work_order_id: number; system_start_timestamp: string;
  system_end_timestamp: string | null; actual_hours: number | null; flag_note: string | null;
  activity_label: string; scope_name: string; job_number: string;
}
interface DayEntries { date: string; entries: TimeEntry[]; totalHours: number; }

function dateRange(rows: ScheduleRow[]): string {
  if (rows.length === 0) return "";
  const s = [...rows].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  return s.length === 1 ? fmtDate(s[0].scheduled_date) : `${fmtDate(s[0].scheduled_date)} – ${fmtDate(s[s.length - 1].scheduled_date)}`;
}
function groupStatus(rows: ScheduleRow[]): BookingGroup["status"] {
  const st = rows.map((r) => r.status);
  if (st.every((s) => s === "Confirmed")) return "confirmed";
  if (st.every((s) => s === "Declined")) return "declined";
  if (st.some((s) => s === "Confirmed") && st.some((s) => s === "Declined")) return "partial";
  return "pending";
}

export default function MobileSchedule() {
  const supabase = createClient();
  const router = useRouter();
  const [myId, setMyId] = useState(0);
  const [myName, setMyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [allRows, setAllRows] = useState<ScheduleRow[]>([]);
  const [groups, setGroups] = useState<BookingGroup[]>([]);
  const [jobMap, setJobMap] = useState<Record<number, JobInfo>>({});
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [dayToggles, setDayToggles] = useState<Record<number, boolean>>({});
  const [acting, setActing] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [selectedDay, setSelectedDay] = useState<{ date: string; info: DayInfo | null } | null>(null);
  const [unavailReason, setUnavailReason] = useState("");
  // Time entries
  const [timeByDate, setTimeByDate] = useState<Record<string, DayEntries>>({});
  const [allTimeEntries, setAllTimeEntries] = useState<TimeEntry[]>([]);
  const [editingNote, setEditingNote] = useState<{ entryId: number; note: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/m/login"); return; }
    const fId = user.user_metadata?.freelancer_id || 0;
    setMyId(fId);
    if (!fId) { setLoading(false); return; }

    const { data: me } = await supabase.from("tbl_freelancers").select("freelancer_name").eq("freelancer_id", fId).single();
    if (me?.freelancer_name) setMyName(me.freelancer_name);

    const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const pastStr = localDateStr(threeMonthsAgo.getFullYear(), threeMonthsAgo.getMonth(), threeMonthsAgo.getDate());

    // Load schedule rows + time entries in parallel
    const [schedRes, timeRes] = await Promise.all([
      supabase.from("tbl_freelancer_schedule").select("*").eq("freelancer_id", fId).gte("scheduled_date", pastStr).order("scheduled_date"),
      supabase.from("tbl_wo_time_entries")
        .select("entry_id, work_order_id, system_start_timestamp, system_end_timestamp, actual_hours, flag_note")
        .eq("freelancer_id", fId).is("archived_at", null)
        .gte("system_start_timestamp", pastStr + "T00:00:00")
        .order("system_start_timestamp"),
    ]);
    const all = (schedRes.data || []) as ScheduleRow[];
    setAllRows(all);

    // Enrich time entries with WO context
    const rawEntries = (timeRes.data || []) as any[];
    const woIds = [...new Set(rawEntries.map((e: any) => e.work_order_id))];
    let woMap: Record<number, any> = {};
    if (woIds.length > 0) {
      const { data: wos } = await supabase.from("tbl_work_orders").select("work_order_id, activity_verb, scope_item_id, job_id").in("work_order_id", woIds);
      const sIds = [...new Set((wos || []).map((w: any) => w.scope_item_id).filter(Boolean))];
      const jIds = [...new Set((wos || []).map((w: any) => w.job_id).filter(Boolean))];
      const actIds = [...new Set((wos || []).map((w: any) => w.activity_verb).filter(Boolean))];
      const [scopeR, jobR, actR] = await Promise.all([
        sIds.length ? supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", sIds) : { data: [] },
        jIds.length ? supabase.from("tbl_production_plan").select("job_id, job_number").in("job_id", jIds) : { data: [] },
        actIds.length ? supabase.from("tbl_master_lookups").select("lookup_id, lookup_value").in("lookup_id", actIds) : { data: [] },
      ]);
      const sm: Record<number, string> = {}; ((scopeR.data || []) as any[]).forEach((s: any) => { sm[s.scope_item_id] = s.item_name; });
      const jm: Record<number, string> = {}; ((jobR.data || []) as any[]).forEach((j: any) => { jm[j.job_id] = j.job_number; });
      const am: Record<number, string> = {}; ((actR.data || []) as any[]).forEach((a: any) => { am[a.lookup_id] = a.lookup_value; });
      (wos || []).forEach((w: any) => {
        woMap[w.work_order_id] = {
          activity_label: am[w.activity_verb] || "Task",
          scope_name: sm[w.scope_item_id] || "",
          job_number: jm[w.job_id] || "",
        };
      });
    }

    const enriched: TimeEntry[] = rawEntries.map((e: any) => ({
      entry_id: e.entry_id,
      work_order_id: e.work_order_id,
      system_start_timestamp: e.system_start_timestamp,
      system_end_timestamp: e.system_end_timestamp,
      actual_hours: e.actual_hours,
      flag_note: e.flag_note,
      ...(woMap[e.work_order_id] || { activity_label: "Task", scope_name: "", job_number: "" }),
    }));
    setAllTimeEntries(enriched);

    // Group time entries by date
    const byDate: Record<string, DayEntries> = {};
    enriched.forEach((e) => {
      const dateStr = e.system_start_timestamp?.slice(0, 10);
      if (!dateStr) return;
      if (!byDate[dateStr]) byDate[dateStr] = { date: dateStr, entries: [], totalHours: 0 };
      byDate[dateStr].entries.push(e);
      byDate[dateStr].totalHours += e.actual_hours || 0;
    });
    setTimeByDate(byDate);

    // Booking groups (existing logic)
    const todayStr = todayLocal();
    const futureRows = all.filter((r) => r.scheduled_date >= todayStr);
    const bookingRows = futureRows.filter((r) => r.status !== "Unavailable");

    const bookJobIds = [...new Set(all.map((r) => r.job_id).filter(Boolean))] as number[];
    let jMap: Record<number, JobInfo> = {};
    if (bookJobIds.length > 0) {
      const { data: jd } = await supabase.from("tbl_production_plan").select("job_id, job_name, job_number, event_date").in("job_id", bookJobIds);
      (jd || []).forEach((j: any) => { jMap[j.job_id] = j; });
    }
    setJobMap(jMap);

    const groupMap: Record<string, ScheduleRow[]> = {};
    bookingRows.forEach((r) => { const k = r.booking_group || `s-${r.schedule_id}`; if (!groupMap[k]) groupMap[k] = []; groupMap[k].push(r); });
    const bgs: BookingGroup[] = Object.entries(groupMap).map(([key, gRows]) => {
      const sorted = [...gRows].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
      const f = sorted[0];
      return { key, job: f.job_id ? jMap[f.job_id] || null : null, notes: f.notes, rows: sorted, dateRange: dateRange(sorted), dayCount: sorted.length, status: groupStatus(sorted) };
    });
    bgs.sort((a, b) => { const ap = a.status === "pending" ? 0 : 1; const bp = b.status === "pending" ? 0 : 1; if (ap !== bp) return ap - bp; return (a.rows[0]?.scheduled_date || "").localeCompare(b.rows[0]?.scheduled_date || ""); });
    setGroups(bgs);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ============================================================
  // Booking actions (unchanged)
  // ============================================================
  const confirmAll = async (g: BookingGroup) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").update({ status: "Confirmed" }).in("schedule_id", g.rows.map((r) => r.schedule_id));
    await notify({ supabase, type: "booking_confirmed", severity: "info",
      title: `${myName || "Someone"} confirmed ${g.dayCount} day${g.dayCount > 1 ? "s" : ""} on ${g.job?.job_name || "Workshop"}`,
      freelancerId: myId, jobId: g.job?.job_id, actionUrl: "/capacity",
    });
    await loadData(); setActing(false); toast.success(`Confirmed ${g.dayCount} day${g.dayCount > 1 ? "s" : ""}`);
  };
  const confirmWithExceptions = async (g: BookingGroup) => {
    setActing(true);
    const cIds = g.rows.filter((r) => dayToggles[r.schedule_id] !== false).map((r) => r.schedule_id);
    const dIds = g.rows.filter((r) => dayToggles[r.schedule_id] === false).map((r) => r.schedule_id);
    if (cIds.length) await supabase.from("tbl_freelancer_schedule").update({ status: "Confirmed" }).in("schedule_id", cIds);
    if (dIds.length) await supabase.from("tbl_freelancer_schedule").update({ status: "Declined" }).in("schedule_id", dIds);
    const jobName = g.job?.job_name || "Workshop";
    if (dIds.length > 0) {
      await notify({ supabase, type: "booking_declined", severity: "warning",
        title: `${myName || "Someone"} declined ${dIds.length} day${dIds.length > 1 ? "s" : ""} on ${jobName}`,
        detail: `Confirmed ${cIds.length}, declined ${dIds.length}`,
        freelancerId: myId, jobId: g.job?.job_id, actionUrl: "/capacity",
      });
    } else {
      await notify({ supabase, type: "booking_confirmed", severity: "info",
        title: `${myName || "Someone"} confirmed ${cIds.length} day${cIds.length > 1 ? "s" : ""} on ${jobName}`,
        freelancerId: myId, jobId: g.job?.job_id, actionUrl: "/capacity",
      });
    }
    setExpandedGroup(null); setDayToggles({}); await loadData(); setActing(false);
    toast.success(dIds.length > 0 ? `Confirmed ${cIds.length}, declined ${dIds.length}` : `Confirmed ${cIds.length} days`);
  };
  const toggleExpand = (key: string, g: BookingGroup) => {
    if (expandedGroup === key) { setExpandedGroup(null); setDayToggles({}); return; }
    setExpandedGroup(key);
    const t: Record<number, boolean> = {}; g.rows.forEach((r) => { t[r.schedule_id] = true; }); setDayToggles(t);
  };

  // Single-day booking actions
  const confirmDay = async (row: ScheduleRow) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").update({ status: "Confirmed" }).eq("schedule_id", row.schedule_id);
    const jobName = row.job_id && jobMap[row.job_id] ? jobMap[row.job_id].job_name : "Workshop";
    await notify({ supabase, type: "booking_confirmed", severity: "info",
      title: `${myName || "Someone"} confirmed ${fmtDate(row.scheduled_date)} on ${jobName}`,
      freelancerId: myId, jobId: row.job_id, scheduleId: row.schedule_id, actionUrl: "/capacity",
    });
    setSelectedDay(null); await loadData(); setActing(false); toast.success("Day confirmed");
  };
  const declineDay = async (row: ScheduleRow) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").update({ status: "Declined" }).eq("schedule_id", row.schedule_id);
    const jobName = row.job_id && jobMap[row.job_id] ? jobMap[row.job_id].job_name : "Workshop";
    await notify({ supabase, type: "booking_declined", severity: "warning",
      title: `${myName || "Someone"} declined ${fmtDate(row.scheduled_date)} on ${jobName}`,
      freelancerId: myId, jobId: row.job_id, scheduleId: row.schedule_id, actionUrl: "/capacity",
    });
    setSelectedDay(null); await loadData(); setActing(false); toast("Day declined", { icon: "✕" });
  };
  const withdrawDay = async (row: ScheduleRow) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").update({ status: "Declined" }).eq("schedule_id", row.schedule_id);
    const jobName = row.job_id && jobMap[row.job_id] ? jobMap[row.job_id].job_name : "a job";
    await notify({ supabase, type: "booking_withdrawal", severity: "urgent",
      title: `${myName || "Someone"} withdrew from ${fmtDate(row.scheduled_date)}`,
      detail: `${myName} can no longer work on ${jobName} on ${fmtDate(row.scheduled_date)}. You may need to find a replacement.`,
      freelancerId: myId, jobId: row.job_id, scheduleId: row.schedule_id, actionUrl: "/capacity",
    });
    setSelectedDay(null); await loadData(); setActing(false); toast.warning("Withdrawal sent — workshop manager notified");
  };
  const markDayUnavailable = async (dateStr: string, reason: string) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").insert({ freelancer_id: myId, scheduled_date: dateStr, status: "Unavailable", unavailable_reason: reason.trim() || null });
    setSelectedDay(null); setUnavailReason(""); await loadData(); setActing(false); toast.success("Marked as unavailable");
  };
  const removeDayUnavailable = async (row: ScheduleRow) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").delete().eq("schedule_id", row.schedule_id);
    setSelectedDay(null); await loadData(); setActing(false); toast.success("Availability restored");
  };

  // Save flag note on time entry
  const saveNote = async (entryId: number, note: string) => {
    setActing(true);
    const ctx = await (async () => { const { data: { user } } = await supabase.auth.getUser(); return { supabase, userId: user?.id || "", userName: myName, userRole: "freelancer" }; })();
    await auditedUpdate(ctx, "tbl_wo_time_entries", entryId, { flag_note: note.trim() || null });
    setEditingNote(null); await loadData(); setActing(false); toast.success("Note saved");
  };

  // ============================================================
  // Calendar helpers
  // ============================================================
  const getMonthData = (y: number, m: number) => {
    const first = new Date(y, m, 1); const last = new Date(y, m + 1, 0);
    const firstDow = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const days: { date: string; num: number; isWeekend: boolean }[] = [];
    for (let d = 1; d <= last.getDate(); d++) {
      const dt = new Date(y, m, d);
      days.push({ date: localDateStr(y, m, d), num: d, isWeekend: dt.getDay() === 0 || dt.getDay() === 6 });
    }
    return { days, firstDow, label: first.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  };
  const shiftCalMonth = (dir: number) => setCalMonth((p) => { const d = new Date(p.year, p.month + dir, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  const { days: calDays, firstDow: calPad, label: calLabel } = getMonthData(calMonth.year, calMonth.month);
  const todayStr = todayLocal();

  const getCalDayInfo = (dateStr: string): DayInfo | null => {
    const dayRows = allRows.filter((r) => r.scheduled_date === dateStr);
    if (dayRows.length === 0) return null;
    const c = dayRows.find((r) => r.status === "Confirmed");
    if (c) return { status: "Confirmed", job: c.job_id ? jobMap[c.job_id] : null, row: c };
    const n = dayRows.find((r) => r.status === "Notified");
    if (n) return { status: "Notified", job: n.job_id ? jobMap[n.job_id] : null, row: n };
    const b = dayRows.find((r) => r.status === "Booked");
    if (b) return { status: "Booked", job: b.job_id ? jobMap[b.job_id] : null, row: b };
    const dc = dayRows.find((r) => r.status === "Declined");
    if (dc) return { status: "Declined", job: dc.job_id ? jobMap[dc.job_id] : null, row: dc };
    const u = dayRows.find((r) => r.status === "Unavailable");
    if (u) return { status: "Unavailable", job: null, row: u };
    return null;
  };

  // Monthly total for displayed month
  const monthPrefix = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, "0")}`;
  const monthHours = Object.entries(timeByDate)
    .filter(([d]) => d.startsWith(monthPrefix))
    .reduce((sum, [, de]) => sum + de.totalHours, 0);
  const monthEntryCount = Object.entries(timeByDate)
    .filter(([d]) => d.startsWith(monthPrefix))
    .reduce((sum, [, de]) => sum + de.entries.length, 0);

  // This week totals (Mon-Sun)
  const now = new Date();
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartStr = localDateStr(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
  const weekEndStr = localDateStr(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
  const thisWeekEntries = Object.entries(timeByDate).filter(([d]) => d >= weekStartStr && d <= weekEndStr);
  const thisWeekHours = thisWeekEntries.reduce((s, [, de]) => s + de.totalHours, 0);
  const thisWeekCount = thisWeekEntries.reduce((s, [, de]) => s + de.entries.length, 0);

  // Last week
  const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(lastWeekStart); lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
  const lwStartStr = localDateStr(lastWeekStart.getFullYear(), lastWeekStart.getMonth(), lastWeekStart.getDate());
  const lwEndStr = localDateStr(lastWeekEnd.getFullYear(), lastWeekEnd.getMonth(), lastWeekEnd.getDate());
  const lastWeekHours = Object.entries(timeByDate).filter(([d]) => d >= lwStartStr && d <= lwEndStr).reduce((s, [, de]) => s + de.totalHours, 0);

  const pendingCount = groups.filter((g) => g.status === "pending").length;

  if (loading) return <div className="flex items-center justify-center h-64 text-muted text-sm animate-pulse">Loading schedule...</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-navy">My Schedule</h1>
          <p className="text-xs text-muted mt-0.5">Tap any day to see details</p>
        </div>
        {myId && (
          <button onClick={async () => {
            try {
              const authH = await getAuthHeaders();
              const res = await fetch("/api/calendar/token", { method: "POST", headers: { "Content-Type": "application/json", ...authH }, body: JSON.stringify({ freelancer_id: myId }) });
              if (!res.ok) { toast.error("Failed to generate calendar link"); return; }
              const { url } = await res.json();
              window.location.href = url;
            } catch { toast.error("Calendar export failed"); }
          }} className="flex items-center gap-1.5 px-3 py-2 bg-starlight-blue/10 text-starlight-blue text-xs font-medium rounded-lg">
            <CalendarPlus className="h-3.5 w-3.5" /> Export
          </button>
        )}
      </div>

      {/* Weekly summary strip */}
      <div className="flex gap-2">
        <div className="flex-1 bg-surface rounded-xl border border-subtle px-3 py-2.5">
          <p className="text-[10px] text-muted uppercase tracking-wide">This week</p>
          <p className="text-lg font-bold text-navy">{formatHours(thisWeekHours)}</p>
          <p className="text-[10px] text-muted">{thisWeekCount} entr{thisWeekCount === 1 ? "y" : "ies"}</p>
        </div>
        <div className="flex-1 bg-surface rounded-xl border border-subtle px-3 py-2.5">
          <p className="text-[10px] text-muted uppercase tracking-wide">Last week</p>
          <p className="text-lg font-bold text-muted">{formatHours(lastWeekHours)}</p>
          <p className="text-[10px] text-muted">{thisWeekHours > lastWeekHours ? "↑" : thisWeekHours < lastWeekHours ? "↓" : "="} vs this week</p>
        </div>
      </div>

      {/* Monthly Calendar */}
      <div className="bg-surface rounded-xl border border-subtle px-3 py-3">
        <div className="flex items-center justify-between mb-1">
          <button onClick={() => shiftCalMonth(-1)} className="p-1.5 text-muted"><ChevronLeft className="h-4 w-4" /></button>
          <div className="text-center">
            <span className="text-sm font-semibold text-navy">{calLabel}</span>
            {monthHours > 0 && <span className="text-xs text-muted ml-2">{formatHours(monthHours)} logged</span>}
          </div>
          <button onClick={() => shiftCalMonth(1)} className="p-1.5 text-muted"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 justify-center">
          <span className="flex items-center gap-1 text-[9px] text-muted"><span className="w-2 h-2 rounded-sm bg-starlight-green" /> Confirmed</span>
          <span className="flex items-center gap-1 text-[9px] text-muted"><span className="w-2 h-2 rounded-sm bg-starlight-amber/30" /> Pending</span>
          <span className="flex items-center gap-1 text-[9px] text-muted"><span className="w-2 h-2 rounded-sm bg-starlight-red/30" /> Declined</span>
          <span className="flex items-center gap-1 text-[9px] text-muted"><span className="w-2 h-2 rounded-sm bg-surface-top" /> Off</span>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {["M","T","W","T","F","S","S"].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-medium text-muted">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: calPad }).map((_, i) => <div key={`p-${i}`} className="h-12" />)}
          {calDays.map((d) => {
            const info = getCalDayInfo(d.date);
            const dayTime = timeByDate[d.date];
            const isToday = d.date === todayStr;
            const isPast = d.date < todayStr;
            const hasGap = info && ["Confirmed", "Booked", "Notified"].includes(info.status) && isPast && !dayTime;
            let bg = ""; let tc = d.isWeekend ? "text-faint" : "text-muted";
            if (info) {
              switch (info.status) {
                case "Confirmed": bg = "bg-starlight-green/15"; tc = "text-starlight-green font-semibold"; break;
                case "Booked": case "Notified": bg = "bg-starlight-amber/10"; tc = "text-starlight-amber font-semibold"; break;
                case "Declined": bg = "bg-starlight-red/10"; tc = "text-starlight-red line-through"; break;
                case "Unavailable": bg = "bg-surface-mid"; tc = "text-muted"; break;
              }
            }
            return (
              <button key={d.date} onClick={() => { setSelectedDay({ date: d.date, info }); setEditingNote(null); }}
                className={"relative flex flex-col items-center justify-center h-12 rounded-lg text-[12px] transition-colors " + bg + " " + tc + (isToday ? " ring-2 ring-navy/30" : "") + " active:scale-95"}>
                <span>{d.num}</span>
                {dayTime && <span className="text-[8px] font-mono font-bold text-starlight-blue leading-none">{formatHours(dayTime.totalHours)}</span>}
                {!dayTime && info && info.job && <span className="text-[7px] leading-tight truncate w-full text-center opacity-60">{info.job.job_name?.split(" ")[0]}</span>}
                {hasGap && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-starlight-red" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pending bookings */}
      {pendingCount > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-navy mb-2">Action needed</h2>
          {groups.filter((g) => g.status === "pending").map((g) => {
            const isExp = expandedGroup === g.key;
            const cc = isExp ? Object.values(dayToggles).filter(Boolean).length : 0;
            const dc = isExp ? Object.values(dayToggles).filter((v) => !v).length : 0;
            return (
              <div key={g.key} className="bg-surface rounded-xl border-2 border-starlight-amber/30 overflow-hidden mb-3">
                <div className="px-4 pt-4 pb-3">
                  <div className="flex justify-between items-start">
                    <div><p className="text-[15px] font-semibold text-navy">{g.job?.job_name || "Workshop"}</p><p className="text-xs text-muted mt-1">{g.dateRange} · {g.dayCount} day{g.dayCount > 1 ? "s" : ""}</p></div>
                    <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-starlight-amber/15 text-starlight-amber">Pending</span>
                  </div>
                  {g.notes && <div className="mt-2 px-3 py-2 bg-surface-dim rounded-lg text-xs text-muted">{g.notes}</div>}
                </div>
                {!isExp && (
                  <div className="px-4 pb-4 space-y-2">
                    <button onClick={() => confirmAll(g)} disabled={acting} className="w-full py-3 bg-starlight-green/10 text-starlight-green font-medium text-sm rounded-lg disabled:opacity-50">
                      <Check className="h-4 w-4 inline mr-1.5 -mt-0.5" />Confirm all {g.dayCount} day{g.dayCount > 1 ? "s" : ""}
                    </button>
                    <button onClick={() => toggleExpand(g.key, g)} className="w-full py-2.5 text-muted text-sm border border-subtle rounded-lg">Confirm with exceptions</button>
                  </div>
                )}
                {isExp && (
                  <div className="px-4 pb-4">
                    <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">Toggle days you can't do:</p>
                    <div className="space-y-1 max-h-[240px] overflow-y-auto mb-3">
                      {g.rows.map((r) => { const on = dayToggles[r.schedule_id] !== false; return (
                        <button key={r.schedule_id} onClick={() => setDayToggles((p) => ({ ...p, [r.schedule_id]: !on }))} className={"w-full flex justify-between items-center px-3 py-2.5 rounded-lg " + (on ? "bg-starlight-green/10" : "bg-starlight-red/10")}>
                          <span className={"text-[13px] font-medium " + (on ? "text-starlight-green" : "text-starlight-red")}>{fmtDate(r.scheduled_date)}</span>
                          <div className={"w-9 h-5 rounded-full relative " + (on ? "bg-starlight-green" : "bg-surface-top")}><div className={"w-4 h-4 bg-surface rounded-full absolute top-0.5 " + (on ? "right-0.5" : "left-0.5")} /></div>
                        </button>
                      ); })}
                    </div>
                    <div className="flex justify-between px-3 py-2.5 bg-surface-dim rounded-lg mb-3"><span className="text-xs text-muted">Confirming</span><span className="text-sm font-semibold text-navy">{cc} of {g.dayCount}</span></div>
                    <button onClick={() => confirmWithExceptions(g)} disabled={acting || cc === 0} className="w-full py-3 bg-starlight-green/10 text-starlight-green font-medium text-sm rounded-lg disabled:opacity-50 mb-2">
                      {dc > 0 ? `Confirm ${cc}, decline ${dc}` : `Confirm all ${cc} days`}
                    </button>
                    <button onClick={() => { setExpandedGroup(null); setDayToggles({}); }} className="w-full py-2.5 text-muted text-sm border border-subtle rounded-lg">Back</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upcoming bookings */}
      {groups.filter((g) => g.status !== "pending").length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-navy mb-2">Upcoming</h2>
          {groups.filter((g) => g.status !== "pending").map((g) => {
            const sl = g.status === "confirmed" ? "Confirmed" : g.status === "declined" ? "Declined" : "Partial";
            const sc = g.status === "confirmed" ? "bg-starlight-green/15 text-starlight-green" : g.status === "declined" ? "bg-starlight-red/15 text-starlight-red" : "bg-navy/15 text-navy";
            const cd = g.rows.filter((r) => r.status === "Confirmed").length;
            const dd = g.rows.filter((r) => r.status === "Declined").length;
            return (
              <div key={g.key} className="bg-surface rounded-xl border border-subtle px-4 py-3 mb-2">
                <div className="flex justify-between items-start">
                  <div><p className="text-[15px] font-semibold text-navy">{g.job?.job_name || "Workshop"}</p><p className="text-xs text-muted mt-1">{g.dateRange}</p>
                    {g.status === "partial" && <p className="text-xs text-muted mt-0.5">{cd} confirmed, {dd} declined</p>}
                  </div>
                  <span className={"text-[11px] font-medium px-2.5 py-1 rounded-full " + sc}>{sl}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Day detail bottom sheet */}
      {selectedDay && (() => {
        const dayTime = timeByDate[selectedDay.date];
        const isPast = selectedDay.date < todayStr;
        const hasGap = selectedDay.info && ["Confirmed", "Booked", "Notified"].includes(selectedDay.info.status) && isPast && !dayTime;
        return (
          <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={(e) => { if (e.target === e.currentTarget) { setSelectedDay(null); setEditingNote(null); } }}>
            <div className="bg-surface w-full rounded-t-2xl max-h-[75vh] overflow-y-auto">
              <div className="px-5 py-4 border-b border-subtle flex justify-between items-center">
                <div>
                  <h3 className="text-[15px] font-semibold text-navy">{fmtDate(selectedDay.date)}</h3>
                  {selectedDay.info ? (
                    <p className="text-xs text-muted mt-0.5">
                      {selectedDay.info.status === "Unavailable"
                        ? `Unavailable${selectedDay.info.row.unavailable_reason ? " — " + selectedDay.info.row.unavailable_reason : ""}`
                        : `${selectedDay.info.status} — ${selectedDay.info.job?.job_name || "Workshop"}`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted mt-0.5">{dayTime ? `${formatHours(dayTime.totalHours)} logged` : "No bookings"}</p>
                  )}
                </div>
                <button onClick={() => { setSelectedDay(null); setEditingNote(null); }} className="p-1 text-muted"><X className="h-5 w-5" /></button>
              </div>
              <div className="px-5 py-4 space-y-3">

                {/* Time entries for this day */}
                {dayTime && dayTime.entries.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-navy uppercase tracking-wide">Time Logged</h4>
                      <span className="text-xs font-semibold text-starlight-blue">{formatHours(dayTime.totalHours)} · {dayTime.entries.length} entr{dayTime.entries.length === 1 ? "y" : "ies"}</span>
                    </div>
                    <div className="space-y-2">
                      {dayTime.entries.map((e) => {
                        const startT = new Date(e.system_start_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                        const endT = e.system_end_timestamp ? new Date(e.system_end_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "Active";
                        const isEditing = editingNote?.entryId === e.entry_id;
                        return (
                          <div key={e.entry_id} className="bg-surface-dim rounded-lg px-3 py-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-navy truncate">{e.activity_label}{e.scope_name ? ` · ${e.scope_name}` : ""}</p>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted">
                                  <span className="font-mono">{e.job_number}</span>
                                  <span>{startT} → {endT}</span>
                                  {e.actual_hours != null && <span className="font-semibold text-starlight-blue">{formatHours(e.actual_hours)}</span>}
                                </div>
                              </div>
                              <button onClick={() => router.push("/m/wo/" + e.work_order_id)}
                                className="text-[10px] text-starlight-blue bg-starlight-blue/10 px-2 py-1 rounded shrink-0">View</button>
                            </div>
                            {/* Flag note */}
                            {isEditing ? (
                              <div className="mt-2 flex gap-2">
                                <input type="text" value={editingNote.note} onChange={(ev) => setEditingNote({ ...editingNote, note: ev.target.value })}
                                  placeholder="Add a note..."
                                  className="flex-1 px-2.5 py-1.5 border border-subtle rounded text-xs focus:outline-none focus:ring-1 focus:ring-starlight-blue" autoFocus />
                                <button onClick={() => saveNote(e.entry_id, editingNote.note)} disabled={acting}
                                  className="px-2.5 py-1.5 bg-starlight-blue text-white text-xs rounded disabled:opacity-50"><Save className="h-3 w-3" /></button>
                              </div>
                            ) : (
                              <button onClick={() => setEditingNote({ entryId: e.entry_id, note: e.flag_note || "" })}
                                className="mt-1.5 text-[11px] text-muted hover:text-navy transition-colors text-left w-full">
                                {e.flag_note ? `📝 ${e.flag_note}` : "+ Add note"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Gap warning */}
                {hasGap && (
                  <div className="bg-starlight-red/10 border border-starlight-red/20 rounded-lg px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-starlight-red mt-0.5 shrink-0" />
                      <p className="text-xs text-starlight-red">You were booked but no hours were logged for this day.</p>
                    </div>
                  </div>
                )}

                {/* Booking actions */}
                {!selectedDay.info && !isPast && (
                  <>
                    <div className="mb-2">
                      <label className="block text-xs font-medium text-muted mb-1.5">Reason (optional)</label>
                      <input type="text" value={unavailReason} onChange={(ev) => setUnavailReason(ev.target.value)}
                        placeholder="Holiday, other job, appointment..."
                        className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                    </div>
                    <button onClick={() => markDayUnavailable(selectedDay.date, unavailReason)} disabled={acting}
                      className="w-full py-3 bg-surface-mid text-foreground font-medium text-sm rounded-lg disabled:opacity-50">
                      Mark as unavailable
                    </button>
                  </>
                )}
                {selectedDay.info && ["Booked", "Notified"].includes(selectedDay.info.status) && (
                  <>
                    <button onClick={() => confirmDay(selectedDay.info!.row)} disabled={acting}
                      className="w-full py-3 bg-starlight-green/10 text-starlight-green font-medium text-sm rounded-lg disabled:opacity-50">
                      <Check className="h-4 w-4 inline mr-1.5 -mt-0.5" /> Confirm this day
                    </button>
                    <button onClick={() => declineDay(selectedDay.info!.row)} disabled={acting}
                      className="w-full py-3 bg-starlight-red/10 text-starlight-red font-medium text-sm rounded-lg disabled:opacity-50">
                      <X className="h-4 w-4 inline mr-1.5 -mt-0.5" /> Decline this day
                    </button>
                  </>
                )}
                {selectedDay.info?.status === "Confirmed" && !isPast && (
                  <>
                    <div className="bg-starlight-amber/10 border border-starlight-amber/20 rounded-lg px-3 py-2.5 mb-1">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-starlight-amber mt-0.5 shrink-0" />
                        <p className="text-xs text-starlight-amber">Withdrawing will notify the workshop manager.</p>
                      </div>
                    </div>
                    <button onClick={() => withdrawDay(selectedDay.info!.row)} disabled={acting}
                      className="w-full py-3 bg-starlight-red/10 text-starlight-red font-medium text-sm rounded-lg disabled:opacity-50">
                      I can't make this day anymore
                    </button>
                  </>
                )}
                {selectedDay.info?.status === "Declined" && (
                  <p className="text-sm text-muted text-center py-2">You declined this day. Contact the workshop manager if you've changed your mind.</p>
                )}
                {selectedDay.info?.status === "Unavailable" && (
                  <button onClick={() => removeDayUnavailable(selectedDay.info!.row)} disabled={acting}
                    className="w-full py-3 bg-starlight-green/10 text-starlight-green font-medium text-sm rounded-lg disabled:opacity-50">
                    Remove unavailability — I'm free this day
                  </button>
                )}
                <button onClick={() => { setSelectedDay(null); setUnavailReason(""); setEditingNote(null); }}
                  className="w-full py-2.5 text-muted text-sm mt-1">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
