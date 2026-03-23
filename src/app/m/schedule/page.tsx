"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Check, ChevronLeft, ChevronRight, X, Plus, Trash2, CalendarPlus } from "lucide-react";

// ============================================================
// Types
// ============================================================

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

interface JobInfo {
  job_id: number;
  job_name: string | null;
  job_number: string | null;
  event_date: string | null;
}

interface BookingGroup {
  booking_group: string | null;
  job: JobInfo | null;
  notes: string | null;
  rows: ScheduleRow[];
  dateRange: string;
  dayCount: number;
  status: "pending" | "confirmed" | "partial" | "declined";
}

// ============================================================
// Helpers
// ============================================================

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function dateRange(rows: ScheduleRow[]): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  if (rows.length === 1) return fmtDate(sorted[0].scheduled_date);
  return `${fmtDate(sorted[0].scheduled_date)} – ${fmtDate(sorted[sorted.length - 1].scheduled_date)}`;
}

function groupStatus(rows: ScheduleRow[]): BookingGroup["status"] {
  const statuses = rows.map((r) => r.status);
  if (statuses.every((s) => s === "Confirmed")) return "confirmed";
  if (statuses.every((s) => s === "Declined")) return "declined";
  if (statuses.some((s) => s === "Confirmed") && statuses.some((s) => s === "Declined")) return "partial";
  return "pending";
}

// ============================================================
// Main Page
// ============================================================

export default function MobileSchedule() {
  const supabase = createClient();
  const router = useRouter();
  const [myId, setMyId] = useState(0);
  const [myPin, setMyPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [allRows, setAllRows] = useState<ScheduleRow[]>([]);
  const [groups, setGroups] = useState<BookingGroup[]>([]);
  const [unavailable, setUnavailable] = useState<ScheduleRow[]>([]);
  const [jobMap, setJobMap] = useState<Record<number, JobInfo>>({});
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [dayToggles, setDayToggles] = useState<Record<number, boolean>>({});
  const [acting, setActing] = useState(false);

  // Calendar month
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Unavailability form
  const [showUnavailForm, setShowUnavailForm] = useState(false);
  const [unavailDates, setUnavailDates] = useState<string[]>([]);
  const [unavailReason, setUnavailReason] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/m/login"); return; }
    const fId = user.user_metadata?.freelancer_id || 0;
    setMyId(fId);
    if (!fId) { setLoading(false); return; }

    // Fetch PIN for calendar feed URL
    const { data: me } = await supabase.from("tbl_freelancers").select("pin").eq("freelancer_id", fId).single();
    if (me?.pin) setMyPin(me.pin);

    // Fetch all schedule rows (past + future for calendar display)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const pastStr = threeMonthsAgo.toISOString().split("T")[0];

    const { data: rows } = await supabase
      .from("tbl_freelancer_schedule")
      .select("*")
      .eq("freelancer_id", fId)
      .gte("scheduled_date", pastStr)
      .order("scheduled_date");

    const all = (rows || []) as ScheduleRow[];
    setAllRows(all);

    // Separate unavailable vs bookings (future only for cards)
    const todayStr = new Date().toISOString().split("T")[0];
    const futureRows = all.filter((r) => r.scheduled_date >= todayStr);
    const unavailRows = futureRows.filter((r) => r.status === "Unavailable");
    const bookingRows = futureRows.filter((r) => r.status !== "Unavailable");
    setUnavailable(unavailRows);

    // Get unique job IDs for all rows (calendar needs them too)
    const jobIds = [...new Set(all.map((r) => r.job_id).filter(Boolean))] as number[];
    let jMap: Record<number, JobInfo> = {};
    if (jobIds.length > 0) {
      const { data: jobData } = await supabase
        .from("tbl_production_plan")
        .select("job_id, job_name, job_number, event_date")
        .in("job_id", jobIds);
      (jobData || []).forEach((j: any) => { jMap[j.job_id] = j; });
    }
    setJobMap(jMap);

    // Group future bookings by booking_group
    const groupMap: Record<string, ScheduleRow[]> = {};
    bookingRows.forEach((r) => {
      const key = r.booking_group || `single-${r.schedule_id}`;
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(r);
    });

    const bookingGroups: BookingGroup[] = Object.entries(groupMap).map(([key, gRows]) => {
      const sorted = [...gRows].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
      const firstRow = sorted[0];
      return {
        booking_group: firstRow.booking_group,
        job: firstRow.job_id ? jMap[firstRow.job_id] || null : null,
        notes: firstRow.notes,
        rows: sorted,
        dateRange: dateRange(sorted),
        dayCount: sorted.length,
        status: groupStatus(sorted),
      };
    });

    bookingGroups.sort((a, b) => {
      const aPending = a.status === "pending" ? 0 : 1;
      const bPending = b.status === "pending" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return (a.rows[0]?.scheduled_date || "").localeCompare(b.rows[0]?.scheduled_date || "");
    });

    setGroups(bookingGroups);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ============================================================
  // Actions
  // ============================================================
  const confirmAll = async (group: BookingGroup) => {
    setActing(true);
    const ids = group.rows.map((r) => r.schedule_id);
    await supabase.from("tbl_freelancer_schedule").update({ status: "Confirmed" }).in("schedule_id", ids);
    await loadData();
    setActing(false);
  };

  const confirmWithExceptions = async (group: BookingGroup) => {
    setActing(true);
    const confirmIds: number[] = [];
    const declineIds: number[] = [];
    group.rows.forEach((r) => {
      if (dayToggles[r.schedule_id] === false) declineIds.push(r.schedule_id);
      else confirmIds.push(r.schedule_id);
    });
    if (confirmIds.length > 0) await supabase.from("tbl_freelancer_schedule").update({ status: "Confirmed" }).in("schedule_id", confirmIds);
    if (declineIds.length > 0) await supabase.from("tbl_freelancer_schedule").update({ status: "Declined" }).in("schedule_id", declineIds);
    setExpandedGroup(null);
    setDayToggles({});
    await loadData();
    setActing(false);
  };

  const toggleExpand = (groupKey: string, group: BookingGroup) => {
    if (expandedGroup === groupKey) { setExpandedGroup(null); setDayToggles({}); return; }
    setExpandedGroup(groupKey);
    const toggles: Record<number, boolean> = {};
    group.rows.forEach((r) => { toggles[r.schedule_id] = true; });
    setDayToggles(toggles);
  };

  // Unavailability
  const toggleUnavailDate = (dateStr: string) => {
    setUnavailDates((prev) => prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]);
  };

  const saveUnavailability = async () => {
    if (unavailDates.length === 0) return;
    setActing(true);
    const inserts = unavailDates.map((d) => ({
      freelancer_id: myId,
      scheduled_date: d,
      status: "Unavailable",
      unavailable_reason: unavailReason.trim() || null,
    }));
    await supabase.from("tbl_freelancer_schedule").insert(inserts);
    setShowUnavailForm(false);
    setUnavailDates([]);
    setUnavailReason("");
    await loadData();
    setActing(false);
  };

  const removeUnavail = async (id: number) => {
    setActing(true);
    await supabase.from("tbl_freelancer_schedule").delete().eq("schedule_id", id);
    await loadData();
    setActing(false);
  };

  // ============================================================
  // Calendar helpers
  // ============================================================
  const getMonthData = (year: number, month: number) => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const firstDow = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const days: { date: string; num: number; isWeekend: boolean }[] = [];
    for (let d = 1; d <= last.getDate(); d++) {
      const dt = new Date(year, month, d);
      days.push({ date: dt.toISOString().split("T")[0], num: d, isWeekend: dt.getDay() === 0 || dt.getDay() === 6 });
    }
    return { days, firstDow, label: first.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  };

  const shiftCalMonth = (dir: number) => {
    setCalMonth((prev) => {
      const d = new Date(prev.year, prev.month + dir, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const { days: calDays, firstDow: calPad, label: calLabel } = getMonthData(calMonth.year, calMonth.month);
  const todayStr = new Date().toISOString().split("T")[0];

  // Get status for a calendar day
  const getCalDayInfo = (dateStr: string) => {
    const dayRows = allRows.filter((r) => r.scheduled_date === dateStr);
    if (dayRows.length === 0) return null;
    // Priority: Confirmed > Notified > Booked > Declined > Unavailable
    const confirmed = dayRows.find((r) => r.status === "Confirmed");
    if (confirmed) return { status: "Confirmed", job: confirmed.job_id ? jobMap[confirmed.job_id] : null, row: confirmed };
    const notified = dayRows.find((r) => r.status === "Notified");
    if (notified) return { status: "Notified", job: notified.job_id ? jobMap[notified.job_id] : null, row: notified };
    const booked = dayRows.find((r) => r.status === "Booked");
    if (booked) return { status: "Booked", job: booked.job_id ? jobMap[booked.job_id] : null, row: booked };
    const declined = dayRows.find((r) => r.status === "Declined");
    if (declined) return { status: "Declined", job: declined.job_id ? jobMap[declined.job_id] : null, row: declined };
    const unavail = dayRows.find((r) => r.status === "Unavailable");
    if (unavail) return { status: "Unavailable", job: null, row: unavail };
    return null;
  };

  const pendingCount = groups.filter((g) => g.status === "pending").length;

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">Loading schedule...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-navy">My schedule</h1>
          <p className="text-xs text-gray-400 mt-0.5">Upcoming bookings and availability</p>
        </div>
        {myPin && (
          <button
            onClick={() => {
              const base = window.location.origin;
              const webcalUrl = `webcal://${window.location.host}/api/calendar/${myId}/route?pin=${myPin}`;
              const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
              // Try webcal first (works on iOS/Mac), fall back to Google Calendar URL
              if (/iPhone|iPad|Mac/.test(navigator.userAgent)) {
                window.location.href = webcalUrl;
              } else {
                window.open(googleUrl, "_blank");
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-starlight-blue/10 text-starlight-blue text-xs font-medium rounded-lg hover:bg-starlight-blue/20 transition-colors"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Sync to calendar
          </button>
        )}
      </div>

      {/* ============================================================ */}
      {/* Monthly Calendar View */}
      {/* ============================================================ */}
      <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => shiftCalMonth(-1)} className="p-1.5 text-gray-400 hover:text-navy">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-navy">{calLabel}</span>
          <button onClick={() => shiftCalMonth(1)} className="p-1.5 text-gray-400 hover:text-navy">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3 justify-center">
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2.5 h-2.5 rounded-sm bg-green-400" /> Confirmed</span>
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300" /> Pending</span>
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2.5 h-2.5 rounded-sm bg-blue-300" /> Notified</span>
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2.5 h-2.5 rounded-sm bg-red-300" /> Declined</span>
          <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2.5 h-2.5 rounded-sm bg-gray-300" /> Unavailable</span>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["M","T","W","T","F","S","S"].map((d, i) => (
            <div key={i} className="text-center text-[11px] font-medium text-gray-400">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: calPad }).map((_, i) => <div key={`p-${i}`} />)}
          {calDays.map((d) => {
            const info = getCalDayInfo(d.date);
            const isToday = d.date === todayStr;

            let bgClass = "";
            let textClass = d.isWeekend ? "text-gray-300" : "text-gray-600";
            let dotColor = "";

            if (info) {
              switch (info.status) {
                case "Confirmed": bgClass = "bg-green-100"; textClass = "text-green-800 font-semibold"; dotColor = "bg-green-400"; break;
                case "Booked": bgClass = "bg-amber-50"; textClass = "text-amber-700 font-semibold"; dotColor = "bg-amber-300"; break;
                case "Notified": bgClass = "bg-blue-50"; textClass = "text-blue-700 font-semibold"; dotColor = "bg-blue-300"; break;
                case "Declined": bgClass = "bg-red-50"; textClass = "text-red-400 line-through"; dotColor = "bg-red-300"; break;
                case "Unavailable": bgClass = "bg-gray-100"; textClass = "text-gray-400"; dotColor = "bg-gray-300"; break;
              }
            }

            return (
              <div
                key={d.date}
                className={
                  "relative text-center py-2 rounded-lg text-[13px] " +
                  bgClass + " " + textClass +
                  (isToday ? " ring-2 ring-navy/30" : "")
                }
              >
                {d.num}
                {info && info.job && (
                  <div className="text-[8px] leading-tight truncate px-0.5 opacity-70">{info.job.job_name?.split(" ")[0]}</div>
                )}
                {info && !info.job && info.status === "Unavailable" && info.row.unavailable_reason && (
                  <div className="text-[8px] leading-tight truncate px-0.5 opacity-60">{info.row.unavailable_reason}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================ */}
      {/* Pending bookings needing response */}
      {/* ============================================================ */}
      {pendingCount > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-navy mb-2">Action needed</h2>
          {groups.filter((g) => g.status === "pending").map((g) => {
            const key = g.booking_group || `single-${g.rows[0]?.schedule_id}`;
            const isExpanded = expandedGroup === key;
            const confirmedCount = isExpanded ? Object.values(dayToggles).filter(Boolean).length : 0;
            const declinedCount = isExpanded ? Object.values(dayToggles).filter((v) => !v).length : 0;

            return (
              <div key={key} className="bg-white rounded-xl border-2 border-amber-300 overflow-hidden mb-3">
                <div className="px-4 pt-4 pb-3">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-navy truncate">{g.job?.job_name || "General workshop"}</p>
                      <p className="text-xs text-gray-400 mt-1">{g.dateRange}</p>
                      <p className="text-xs text-gray-400">{g.dayCount} day{g.dayCount > 1 ? "s" : ""}</p>
                    </div>
                    <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 shrink-0">Pending</span>
                  </div>
                  {g.notes && (
                    <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-500">{g.notes}</div>
                  )}
                </div>

                {/* Confirm buttons */}
                {!isExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    <button onClick={() => confirmAll(g)} disabled={acting}
                      className="w-full py-3 bg-green-50 text-green-700 font-medium text-sm rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50">
                      <Check className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                      Confirm all {g.dayCount} day{g.dayCount > 1 ? "s" : ""}
                    </button>
                    <button onClick={() => toggleExpand(key, g)}
                      className="w-full py-2.5 text-gray-500 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      Confirm with exceptions
                    </button>
                  </div>
                )}

                {/* Expanded day toggles */}
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">Toggle days you can't do:</p>
                    <div className="space-y-1 max-h-[280px] overflow-y-auto mb-3">
                      {g.rows.map((r) => {
                        const isOn = dayToggles[r.schedule_id] !== false;
                        return (
                          <button key={r.schedule_id}
                            onClick={() => setDayToggles((prev) => ({ ...prev, [r.schedule_id]: !isOn }))}
                            className={"w-full flex justify-between items-center px-3 py-2.5 rounded-lg transition-colors " + (isOn ? "bg-green-50" : "bg-red-50")}>
                            <span className={"text-[13px] font-medium " + (isOn ? "text-green-700" : "text-red-600")}>{fmtDate(r.scheduled_date)}</span>
                            <div className={"w-9 h-5 rounded-full relative transition-colors " + (isOn ? "bg-green-500" : "bg-gray-300")}>
                              <div className={"w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all " + (isOn ? "right-0.5" : "left-0.5")} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-center px-3 py-2.5 bg-gray-50 rounded-lg mb-3">
                      <span className="text-xs text-gray-500">Confirming</span>
                      <span className="text-sm font-semibold text-navy">{confirmedCount} of {g.dayCount} days</span>
                    </div>
                    <button onClick={() => confirmWithExceptions(g)} disabled={acting || confirmedCount === 0}
                      className="w-full py-3 bg-green-50 text-green-700 font-medium text-sm rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 mb-2">
                      {declinedCount > 0 ? `Confirm ${confirmedCount} day${confirmedCount > 1 ? "s" : ""}, decline ${declinedCount}` : `Confirm all ${confirmedCount} days`}
                    </button>
                    <button onClick={() => { setExpandedGroup(null); setDayToggles({}); }}
                      className="w-full py-2.5 text-gray-500 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      Back
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* Upcoming confirmed bookings */}
      {/* ============================================================ */}
      {groups.filter((g) => g.status !== "pending").length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-navy mb-2">Upcoming bookings</h2>
          {groups.filter((g) => g.status !== "pending").map((g) => {
            const key = g.booking_group || `single-${g.rows[0]?.schedule_id}`;
            const statusLabel = g.status === "confirmed" ? "Confirmed" : g.status === "declined" ? "Declined" : "Partial";
            const statusClass = g.status === "confirmed" ? "bg-green-100 text-green-700" : g.status === "declined" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700";
            const confirmedDays = g.rows.filter((r) => r.status === "Confirmed").length;
            const declinedDays = g.rows.filter((r) => r.status === "Declined").length;

            return (
              <div key={key} className="bg-white rounded-xl border border-gray-100 px-4 py-3 mb-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-navy truncate">{g.job?.job_name || "General workshop"}</p>
                    <p className="text-xs text-gray-400 mt-1">{g.dateRange}</p>
                    {g.status === "partial" && (
                      <p className="text-xs text-gray-500 mt-0.5">{confirmedDays} confirmed, {declinedDays} declined</p>
                    )}
                  </div>
                  <span className={"text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 " + statusClass}>{statusLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* Unavailability */}
      {/* ============================================================ */}
      <div>
        <h2 className="text-sm font-semibold text-navy mb-2">My availability</h2>
        {unavailable.length > 0 && (
          <div className="space-y-2 mb-3">
            {unavailable.map((u) => (
              <div key={u.schedule_id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3">
                <div>
                  <p className="text-[13px] text-gray-600">{fmtDate(u.scheduled_date)}</p>
                  {u.unavailable_reason && <p className="text-[11px] text-gray-400">{u.unavailable_reason}</p>}
                </div>
                <button onClick={() => removeUnavail(u.schedule_id)} disabled={acting} className="text-red-400 hover:text-red-600 p-1 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => { setShowUnavailForm(true); setUnavailDates([]); setUnavailReason(""); }}
          className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors">
          <Plus className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Mark days as unavailable
        </button>
      </div>

      {/* Unavailability form modal */}
      {showUnavailForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50">
          <div className="bg-white w-full rounded-t-2xl max-h-[85vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-[15px] font-semibold text-navy">Mark unavailable</h3>
              <button onClick={() => setShowUnavailForm(false)} className="p-1 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setCalMonth((p) => { const d = new Date(p.year, p.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                  className="px-3 py-1.5 text-gray-400 hover:text-navy text-sm">‹</button>
                <span className="text-sm font-semibold text-navy">{calLabel}</span>
                <button onClick={() => setCalMonth((p) => { const d = new Date(p.year, p.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                  className="px-3 py-1.5 text-gray-400 hover:text-navy text-sm">›</button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
                  <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-1">{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {Array.from({ length: calPad }).map((_, i) => <div key={`pad-${i}`} />)}
                {calDays.map((d) => {
                  const isPast = d.date < todayStr;
                  const isSelected = unavailDates.includes(d.date);
                  const existing = getCalDayInfo(d.date);
                  const disabled = isPast || (existing !== null);
                  return (
                    <button key={d.date} onClick={() => !disabled && toggleUnavailDate(d.date)} disabled={disabled}
                      className={
                        "text-center py-2.5 rounded-lg text-[13px] transition-colors " +
                        (isSelected ? "bg-red-100 text-red-700 font-semibold" :
                         existing?.status === "Confirmed" ? "bg-green-100 text-green-600" :
                         existing?.status === "Unavailable" ? "bg-gray-100 text-gray-300 line-through" :
                         existing ? "bg-amber-50 text-amber-600" :
                         isPast ? "text-gray-200" :
                         "text-gray-700 hover:bg-gray-50")
                      }>{d.num}</button>
                  );
                })}
              </div>

              {/* Reason */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason (optional)</label>
                <input type="text" value={unavailReason} onChange={(e) => setUnavailReason(e.target.value)}
                  placeholder="Holiday, other job, appointment..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
              </div>

              {unavailDates.length > 0 && (
                <div className="bg-gray-50 rounded-lg px-3 py-2.5 mb-4 flex justify-between items-center">
                  <span className="text-xs text-gray-500">Selected</span>
                  <span className="text-sm font-semibold text-navy">{unavailDates.length} day{unavailDates.length > 1 ? "s" : ""}</span>
                </div>
              )}

              <button onClick={saveUnavailability} disabled={acting || unavailDates.length === 0}
                className="w-full py-3 bg-red-50 text-red-700 font-medium text-sm rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 mb-2">
                Mark {unavailDates.length || 0} day{unavailDates.length !== 1 ? "s" : ""} as unavailable
              </button>
              <button onClick={() => setShowUnavailForm(false)}
                className="w-full py-2.5 text-gray-500 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
