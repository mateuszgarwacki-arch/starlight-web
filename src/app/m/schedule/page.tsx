"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Check, ChevronLeft, ChevronRight, X, Plus, Trash2, CalendarPlus, AlertTriangle } from "lucide-react";
import { notify } from "@/lib/notifications";

// Timezone-safe date string
function localDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function todayLocal(): string {
  const d = new Date();
  return localDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

interface ScheduleRow {
  schedule_id: number;
  freelancer_id: number;
  scheduled_date: string;
  status: string;
  job_id: number | null;
  notes: string | null;
  booking_group: string | null;
  notified_at: string | null;
  unavailable_reason: string | null;
}
interface JobInfo { job_id: number; job_name: string | null; job_number: string | null; event_date: string | null; }
interface BookingGroup {
  key: string; job: JobInfo | null; notes: string | null; rows: ScheduleRow[];
  dateRange: string; dayCount: number; status: "pending" | "confirmed" | "partial" | "declined";
}
interface DayInfo { status: string; job: JobInfo | null; row: ScheduleRow; }

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
  const [myPin, setMyPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [allRows, setAllRows] = useState<ScheduleRow[]>([]);
  const [groups, setGroups] = useState<BookingGroup[]>([]);
  const [unavailable, setUnavailable] = useState<ScheduleRow[]>([]);
  const [jobMap, setJobMap] = useState<Record<number, JobInfo>>({});
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [dayToggles, setDayToggles] = useState<Record<number, boolean>>({});
  const [acting, setActing] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });

  // Day action sheet
  const [selectedDay, setSelectedDay] = useState<{ date: string; info: DayInfo | null } | null>(null);
  // Unavailability inline
  const [unavailReason, setUnavailReason] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/m/login"); return; }
    const fId = user.user_metadata?.freelancer_id || 0;
    setMyId(fId);
    if (!fId) { setLoading(false); return; }

    const { data: me } = await supabase.from("tbl_freelancers").select("pin, freelancer_name").eq("freelancer_id", fId).single();
    if (me?.pin) setMyPin(me.pin);
    if (me?.freelancer_name) setMyName(me.freelancer_name);

    const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const pastStr = localDateStr(threeMonthsAgo.getFullYear(), threeMonthsAgo.getMonth(), threeMonthsAgo.getDate());
    const { data: rows } = await supabase.from("tbl_freelancer_schedule").select("*").eq("freelancer_id", fId).gte("scheduled_date", pastStr).order("scheduled_date");
    const all = (rows || []) as ScheduleRow[];
    setAllRows(all);

    const todayStr = todayLocal();
    const futureRows = all.filter((r) => r.scheduled_date >= todayStr);
    setUnavailable(futureRows.filter((r) => r.status === "Unavailable"));
    const bookingRows = futureRows.filter((r) => r.status !== "Unavailable");

    const jobIds = [...new Set(all.map((r) => r.job_id).filter(Boolean))] as number[];
    let jMap: Record<number, JobInfo> = {};
    if (jobIds.length > 0) {
      const { data: jd } = await supabase.from("tbl_production_plan").select("job_id, job_name, job_number, event_date").in("job_id", jobIds);
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
  // Booking group actions
  // ============================================================
  const confirmAll = async (g: BookingGroup) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").update({ status: "Confirmed" }).in("schedule_id", g.rows.map((r) => r.schedule_id));
    await notify({ supabase, type: "booking_confirmed", severity: "info",
      title: `${myName || "Someone"} confirmed ${g.dayCount} day${g.dayCount > 1 ? "s" : ""} on ${g.job?.job_name || "Workshop"}`,
      freelancerId: myId, jobId: g.job?.job_id, actionUrl: "/capacity",
    });
    await loadData(); setActing(false);
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
  };
  const toggleExpand = (key: string, g: BookingGroup) => {
    if (expandedGroup === key) { setExpandedGroup(null); setDayToggles({}); return; }
    setExpandedGroup(key);
    const t: Record<number, boolean> = {}; g.rows.forEach((r) => { t[r.schedule_id] = true; }); setDayToggles(t);
  };

  // ============================================================
  // Single-day actions (from calendar tap)
  // ============================================================
  const confirmDay = async (row: ScheduleRow) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").update({ status: "Confirmed" }).eq("schedule_id", row.schedule_id);
    const jobName = row.job_id && jobMap[row.job_id] ? jobMap[row.job_id].job_name : "Workshop";
    await notify({ supabase, type: "booking_confirmed", severity: "info",
      title: `${myName || "Someone"} confirmed ${fmtDate(row.scheduled_date)} on ${jobName}`,
      freelancerId: myId, jobId: row.job_id, scheduleId: row.schedule_id, actionUrl: "/capacity",
    });
    setSelectedDay(null); await loadData(); setActing(false);
  };

  const declineDay = async (row: ScheduleRow) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").update({ status: "Declined" }).eq("schedule_id", row.schedule_id);
    const jobName = row.job_id && jobMap[row.job_id] ? jobMap[row.job_id].job_name : "Workshop";
    await notify({ supabase, type: "booking_declined", severity: "warning",
      title: `${myName || "Someone"} declined ${fmtDate(row.scheduled_date)} on ${jobName}`,
      freelancerId: myId, jobId: row.job_id, scheduleId: row.schedule_id, actionUrl: "/capacity",
    });
    setSelectedDay(null); await loadData(); setActing(false);
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
    setSelectedDay(null); await loadData(); setActing(false);
  };

  const markDayUnavailable = async (dateStr: string, reason: string) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").insert({
      freelancer_id: myId, scheduled_date: dateStr, status: "Unavailable", unavailable_reason: reason.trim() || null,
    });
    setSelectedDay(null); setUnavailReason(""); await loadData(); setActing(false);
  };

  const removeDayUnavailable = async (row: ScheduleRow) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").delete().eq("schedule_id", row.schedule_id);
    setSelectedDay(null); await loadData(); setActing(false);
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

  const pendingCount = groups.filter((g) => g.status === "pending").length;
  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">Loading schedule...</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-navy">My schedule</h1>
          <p className="text-xs text-gray-400 mt-0.5">Tap any day to see options</p>
        </div>
        {myPin && (
          <button onClick={() => {
            window.location.href = `/api/calendar/${myId}?pin=${myPin}`;
          }} className="flex items-center gap-1.5 px-3 py-2 bg-starlight-blue/10 text-starlight-blue text-xs font-medium rounded-lg">
            <CalendarPlus className="h-3.5 w-3.5" /> Export .ics
          </button>
        )}
      </div>

      {/* Monthly Calendar */}
      <div className="bg-white rounded-xl border border-gray-100 px-3 py-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => shiftCalMonth(-1)} className="p-1.5 text-gray-400"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-semibold text-navy">{calLabel}</span>
          <button onClick={() => shiftCalMonth(1)} className="p-1.5 text-gray-400"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 justify-center">
          <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-green-400" /> Confirmed</span>
          <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-amber-300" /> Pending</span>
          <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-red-300" /> Declined</span>
          <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-gray-300" /> Off</span>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {["M","T","W","T","F","S","S"].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-medium text-gray-400">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: calPad }).map((_, i) => <div key={`p-${i}`} className="h-11" />)}
          {calDays.map((d) => {
            const info = getCalDayInfo(d.date);
            const isToday = d.date === todayStr;
            const isPast = d.date < todayStr;
            let bg = ""; let tc = d.isWeekend ? "text-gray-300" : "text-gray-500";
            if (info) {
              switch (info.status) {
                case "Confirmed": bg = "bg-green-100"; tc = "text-green-800 font-semibold"; break;
                case "Booked": case "Notified": bg = "bg-amber-50"; tc = "text-amber-700 font-semibold"; break;
                case "Declined": bg = "bg-red-50"; tc = "text-red-400 line-through"; break;
                case "Unavailable": bg = "bg-gray-100"; tc = "text-gray-400"; break;
              }
            }
            return (
              <button key={d.date} onClick={() => !isPast && setSelectedDay({ date: d.date, info })}
                disabled={isPast}
                className={"relative flex flex-col items-center justify-center h-11 rounded-lg text-[12px] transition-colors " + bg + " " + tc + (isToday ? " ring-2 ring-navy/30" : "") + (!isPast ? " active:scale-95" : " opacity-50")}>
                <span>{d.num}</span>
                {info && info.job && <span className="text-[7px] leading-tight truncate w-full text-center opacity-60">{info.job.job_name?.split(" ")[0]}</span>}
                {info?.status === "Unavailable" && info.row.unavailable_reason && <span className="text-[7px] leading-tight truncate w-full text-center opacity-50">{info.row.unavailable_reason}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pending bookings — bulk actions */}
      {pendingCount > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-navy mb-2">Action needed</h2>
          {groups.filter((g) => g.status === "pending").map((g) => {
            const isExp = expandedGroup === g.key;
            const cc = isExp ? Object.values(dayToggles).filter(Boolean).length : 0;
            const dc = isExp ? Object.values(dayToggles).filter((v) => !v).length : 0;
            return (
              <div key={g.key} className="bg-white rounded-xl border-2 border-amber-300 overflow-hidden mb-3">
                <div className="px-4 pt-4 pb-3">
                  <div className="flex justify-between items-start">
                    <div><p className="text-[15px] font-semibold text-navy">{g.job?.job_name || "Workshop"}</p><p className="text-xs text-gray-400 mt-1">{g.dateRange} · {g.dayCount} day{g.dayCount > 1 ? "s" : ""}</p></div>
                    <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Pending</span>
                  </div>
                  {g.notes && <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-500">{g.notes}</div>}
                </div>
                {!isExp && (
                  <div className="px-4 pb-4 space-y-2">
                    <button onClick={() => confirmAll(g)} disabled={acting} className="w-full py-3 bg-green-50 text-green-700 font-medium text-sm rounded-lg disabled:opacity-50">
                      <Check className="h-4 w-4 inline mr-1.5 -mt-0.5" />Confirm all {g.dayCount} day{g.dayCount > 1 ? "s" : ""}
                    </button>
                    <button onClick={() => toggleExpand(g.key, g)} className="w-full py-2.5 text-gray-500 text-sm border border-gray-200 rounded-lg">Confirm with exceptions</button>
                  </div>
                )}
                {isExp && (
                  <div className="px-4 pb-4">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">Toggle days you can't do:</p>
                    <div className="space-y-1 max-h-[240px] overflow-y-auto mb-3">
                      {g.rows.map((r) => { const on = dayToggles[r.schedule_id] !== false; return (
                        <button key={r.schedule_id} onClick={() => setDayToggles((p) => ({ ...p, [r.schedule_id]: !on }))} className={"w-full flex justify-between items-center px-3 py-2.5 rounded-lg " + (on ? "bg-green-50" : "bg-red-50")}>
                          <span className={"text-[13px] font-medium " + (on ? "text-green-700" : "text-red-600")}>{fmtDate(r.scheduled_date)}</span>
                          <div className={"w-9 h-5 rounded-full relative " + (on ? "bg-green-500" : "bg-gray-300")}><div className={"w-4 h-4 bg-white rounded-full absolute top-0.5 " + (on ? "right-0.5" : "left-0.5")} /></div>
                        </button>
                      ); })}
                    </div>
                    <div className="flex justify-between px-3 py-2.5 bg-gray-50 rounded-lg mb-3"><span className="text-xs text-gray-500">Confirming</span><span className="text-sm font-semibold text-navy">{cc} of {g.dayCount}</span></div>
                    <button onClick={() => confirmWithExceptions(g)} disabled={acting || cc === 0} className="w-full py-3 bg-green-50 text-green-700 font-medium text-sm rounded-lg disabled:opacity-50 mb-2">
                      {dc > 0 ? `Confirm ${cc}, decline ${dc}` : `Confirm all ${cc} days`}
                    </button>
                    <button onClick={() => { setExpandedGroup(null); setDayToggles({}); }} className="w-full py-2.5 text-gray-500 text-sm border border-gray-200 rounded-lg">Back</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upcoming bookings summary */}
      {groups.filter((g) => g.status !== "pending").length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-navy mb-2">Upcoming</h2>
          {groups.filter((g) => g.status !== "pending").map((g) => {
            const sl = g.status === "confirmed" ? "Confirmed" : g.status === "declined" ? "Declined" : "Partial";
            const sc = g.status === "confirmed" ? "bg-green-100 text-green-700" : g.status === "declined" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700";
            const cd = g.rows.filter((r) => r.status === "Confirmed").length;
            const dd = g.rows.filter((r) => r.status === "Declined").length;
            return (
              <div key={g.key} className="bg-white rounded-xl border border-gray-100 px-4 py-3 mb-2">
                <div className="flex justify-between items-start">
                  <div><p className="text-[15px] font-semibold text-navy">{g.job?.job_name || "Workshop"}</p><p className="text-xs text-gray-400 mt-1">{g.dateRange}</p>
                    {g.status === "partial" && <p className="text-xs text-gray-500 mt-0.5">{cd} confirmed, {dd} declined</p>}
                  </div>
                  <span className={"text-[11px] font-medium px-2.5 py-1 rounded-full " + sc}>{sl}</span>
                </div>
                {(g.status === "confirmed" || g.status === "partial") && g.rows[0]?.booking_group && myPin && (
                  <button onClick={() => { window.location.href = `/api/calendar/${myId}?pin=${myPin}&group=${g.rows[0].booking_group}`; }}
                    className="mt-2 flex items-center gap-1.5 text-xs text-starlight-blue font-medium">
                    <CalendarPlus className="h-3.5 w-3.5" /> Add to my calendar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* Day action bottom sheet */}
      {/* ============================================================ */}
      {selectedDay && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={(e) => { if (e.target === e.currentTarget) setSelectedDay(null); }}>
          <div className="bg-white w-full rounded-t-2xl max-h-[60vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-[15px] font-semibold text-navy">{fmtDate(selectedDay.date)}</h3>
                {selectedDay.info ? (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selectedDay.info.status === "Unavailable" 
                      ? `Unavailable${selectedDay.info.row.unavailable_reason ? " — " + selectedDay.info.row.unavailable_reason : ""}`
                      : `${selectedDay.info.status} — ${selectedDay.info.job?.job_name || "Workshop"}`}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-0.5">No bookings</p>
                )}
              </div>
              <button onClick={() => setSelectedDay(null)} className="p-1 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-2">

              {/* Empty day — mark unavailable */}
              {!selectedDay.info && (
                <>
                  <div className="mb-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason (optional)</label>
                    <input type="text" value={unavailReason} onChange={(e) => setUnavailReason(e.target.value)}
                      placeholder="Holiday, other job, appointment..."
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                  </div>
                  <button onClick={() => markDayUnavailable(selectedDay.date, unavailReason)} disabled={acting}
                    className="w-full py-3 bg-gray-100 text-gray-700 font-medium text-sm rounded-lg disabled:opacity-50">
                    Mark as unavailable
                  </button>
                </>
              )}

              {/* Pending / Notified / Booked — confirm or decline */}
              {selectedDay.info && ["Booked", "Notified"].includes(selectedDay.info.status) && (
                <>
                  <button onClick={() => confirmDay(selectedDay.info!.row)} disabled={acting}
                    className="w-full py-3 bg-green-50 text-green-700 font-medium text-sm rounded-lg disabled:opacity-50">
                    <Check className="h-4 w-4 inline mr-1.5 -mt-0.5" /> Confirm this day
                  </button>
                  <button onClick={() => declineDay(selectedDay.info!.row)} disabled={acting}
                    className="w-full py-3 bg-red-50 text-red-600 font-medium text-sm rounded-lg disabled:opacity-50">
                    <X className="h-4 w-4 inline mr-1.5 -mt-0.5" /> Decline this day
                  </button>
                </>
              )}

              {/* Confirmed — option to withdraw */}
              {selectedDay.info?.status === "Confirmed" && (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-1">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700">Withdrawing will notify the workshop manager so they can find a replacement.</p>
                    </div>
                  </div>
                  <button onClick={() => withdrawDay(selectedDay.info!.row)} disabled={acting}
                    className="w-full py-3 bg-red-50 text-red-600 font-medium text-sm rounded-lg disabled:opacity-50">
                    I can't make this day anymore
                  </button>
                </>
              )}

              {/* Declined — info only */}
              {selectedDay.info?.status === "Declined" && (
                <p className="text-sm text-gray-400 text-center py-2">You declined this day. Contact the workshop manager if you've changed your mind.</p>
              )}

              {/* Unavailable — remove it */}
              {selectedDay.info?.status === "Unavailable" && (
                <button onClick={() => removeDayUnavailable(selectedDay.info!.row)} disabled={acting}
                  className="w-full py-3 bg-green-50 text-green-700 font-medium text-sm rounded-lg disabled:opacity-50">
                  Remove unavailability — I'm free this day
                </button>
              )}

              {/* Cancel */}
              <button onClick={() => { setSelectedDay(null); setUnavailReason(""); }}
                className="w-full py-2.5 text-gray-400 text-sm mt-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
