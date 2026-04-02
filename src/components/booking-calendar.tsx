"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useRealtimeRefresh } from "@/lib/use-realtime";

interface Booking {
  schedule_id: number;
  freelancer_id: number;
  scheduled_date: string;
  status: string;
  job_id: number | null;
  notes: string | null;
  booking_group: string | null;
  unavailable_reason: string | null;
}

interface CrewMember {
  freelancer_id: number;
  freelancer_name: string;
  speciality: string | null;
  day_rate: number | null;
}

interface JobOption {
  job_id: number;
  job_name: string;
  job_number: string;
}

interface BookingCalendarProps {
  crew: CrewMember[];
}

export function BookingCalendar({ crew }: BookingCalendarProps) {
  const supabase = createClient();
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1); // Monday
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Booking dialog
  const [dialog, setDialog] = useState<{
    freelancerId: number;
    date: string;
    name: string;
    existing?: Booking;
  } | null>(null);
  const [dialogJobId, setDialogJobId] = useState<string>("");
  const [dialogNotes, setDialogNotes] = useState("");

  // Generate 7 days (Mon-Sun) or 5 days (Mon-Fri)
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const dateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const startStr = dateStr(days[0]);
  const endStr = dateStr(days[6]);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    const [bookRes, jobRes] = await Promise.all([
      supabase
        .from("tbl_freelancer_schedule")
        .select("*")
        .gte("scheduled_date", startStr)
        .lte("scheduled_date", endStr),
      supabase
        .from("tbl_production_plan")
        .select("job_id, job_name, job_number")
        .order("event_date"),
    ]);
    if (bookRes.data) setBookings(bookRes.data);
    if (jobRes.data) setJobs(jobRes.data);
    setLoading(false);
  }, [startStr, endStr]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  // Real-time: auto-refresh when bookings change (e.g. freelancer confirms from mobile)
  useRealtimeRefresh("tbl_freelancer_schedule", loadBookings, !loading);

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };
  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };
  const goToday = () => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    d.setHours(0, 0, 0, 0);
    setWeekStart(d);
  };

  const getBooking = (fId: number, date: string) =>
    bookings.find((b) => b.freelancer_id === fId && b.scheduled_date === date);

  const handleCellClick = (fId: number, date: string, name: string) => {
    const existing = getBooking(fId, date);
    setDialog({ freelancerId: fId, date, name, existing });
    setDialogJobId(existing?.job_id ? String(existing.job_id) : "");
    setDialogNotes(existing?.notes || "");
  };

  const saveBooking = async () => {
    if (!dialog) return;
    if (dialog.existing) {
      await supabase.from("tbl_freelancer_schedule").update({
        job_id: dialogJobId ? Number(dialogJobId) : null,
        notes: dialogNotes.trim() || null,
      }).eq("schedule_id", dialog.existing.schedule_id);
    } else {
      await supabase.from("tbl_freelancer_schedule").insert({
        freelancer_id: dialog.freelancerId,
        scheduled_date: dialog.date,
        status: "Booked",
        job_id: dialogJobId ? Number(dialogJobId) : null,
        notes: dialogNotes.trim() || null,
      });
    }
    setDialog(null);
    loadBookings();
    toast.success(dialog.existing ? "Booking updated" : "Day booked");
  };

  const removeBooking = async () => {
    if (!dialog?.existing) return;
    // Detach any notifications referencing this booking before deleting
    await supabase.from("tbl_notifications")
      .update({ source_schedule_id: null })
      .eq("source_schedule_id", dialog.existing.schedule_id);
    const { error } = await supabase.from("tbl_freelancer_schedule")
      .delete().eq("schedule_id", dialog.existing.schedule_id);
    if (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to remove booking: " + error.message);
      return;
    }
    setDialog(null);
    loadBookings();
    toast("Booking removed");
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "Confirmed": return "bg-starlight-green text-white";
      case "Declined": return "bg-starlight-red/20 text-starlight-red line-through";
      case "Booked": return "bg-starlight-amber/20 text-starlight-amber";
      case "Notified": return "bg-starlight-blue/20 text-starlight-blue";
      case "Unavailable": return "bg-surface-hi text-muted";
      default: return "bg-surface-mid text-muted";
    }
  };

  const dayLabel = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
  const monthLabel = days[0].toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const isToday = (d: Date) => dateStr(d) === dateStr(new Date());
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  // Count bookings per day for the header
  const dayTotals = days.map(d => bookings.filter(b => b.scheduled_date === dateStr(d)).length);

  const jobMap: Record<number, string> = {};
  jobs.forEach(j => { jobMap[j.job_id] = j.job_number || j.job_name; });

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-1.5 hover:bg-surface-mid rounded-lg transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted" />
          </button>
          <h3 className="text-sm font-semibold text-navy min-w-[180px] text-center">{monthLabel}</h3>
          <button onClick={nextWeek} className="p-1.5 hover:bg-surface-mid rounded-lg transition-colors">
            <ChevronRight className="h-4 w-4 text-muted" />
          </button>
          <button onClick={goToday} className="text-xs text-starlight-blue hover:text-navy font-medium ml-2">
            Today
          </button>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-starlight-amber/20 border border-starlight-amber/40" /> Booked</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-starlight-blue/20 border border-starlight-blue/40" /> Notified</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-starlight-green" /> Confirmed</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-starlight-red/20 border border-starlight-red/40" /> Declined</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-surface-hi" /> Unavailable</span>
        </div>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="text-center py-8 text-muted text-sm animate-pulse">Loading schedule...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 w-36 text-xs font-medium text-muted">Crew</th>
                {days.map((d, i) => (
                  <th
                    key={i}
                    className={"text-center px-1 py-2 text-xs font-medium min-w-[100px] " +
                      (isToday(d) ? "text-starlight-red" : isWeekend(d) ? "text-faint" : "text-muted")}
                  >
                    <div>{dayLabel(d)}</div>
                    {dayTotals[i] > 0 && (
                      <div className="text-[10px] font-normal text-muted">{dayTotals[i]} booked</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {crew.map((f) => (
                <tr key={f.freelancer_id} className="border-t border-subtle">
                  <td className="px-3 py-2">
                    <p className="text-sm font-medium text-navy">{f.freelancer_name}</p>
                    <p className="text-[10px] text-muted">{f.speciality || "—"}</p>
                  </td>
                  {days.map((d, i) => {
                    const ds = dateStr(d);
                    const booking = getBooking(f.freelancer_id, ds);
                    const weekend = isWeekend(d);
                    return (
                      <td
                        key={i}
                        className={"text-center px-1 py-1.5 cursor-pointer transition-colors " +
                          (weekend ? "bg-surface-dim/50 " : "") +
                          (isToday(d) ? "bg-starlight-red/5 " : "") +
                          (!booking ? "hover:bg-starlight-blue/5" : "")}
                        onClick={() => handleCellClick(f.freelancer_id, ds, f.freelancer_name || "")}
                      >
                        {booking ? (
                          <div className={"rounded-md px-1.5 py-1 text-[10px] font-medium " + statusColor(booking.status)}>
                            {booking.status === "Booked" ? "●" : booking.status === "Confirmed" ? "✓" : booking.status === "Notified" ? "◉" : booking.status === "Unavailable" ? "—" : "✕"}
                            {booking.job_id && jobMap[booking.job_id] && booking.status !== "Unavailable" && (
                              <div className="text-[9px] font-normal opacity-75 truncate">{jobMap[booking.job_id]}</div>
                            )}
                            {booking.status === "Unavailable" && booking.unavailable_reason && (
                              <div className="text-[9px] font-normal opacity-75 truncate">{booking.unavailable_reason}</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-faint hover:text-starlight-blue transition-colors py-1">
                            <Plus className="h-3 w-3 mx-auto" />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Booking dialog */}
      {dialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-xs">
            <div className="px-5 py-4 border-b border-subtle">
              <h3 className="text-sm font-semibold text-navy">
                {dialog.existing ? "Edit Booking" : "Book"} — {dialog.name}
              </h3>
              <p className="text-xs text-muted mt-0.5">
                {new Date(dialog.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Job (optional)</label>
                <select
                  value={dialogJobId}
                  onChange={(e) => setDialogJobId(e.target.value)}
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                >
                  <option value="">General workshop</option>
                  {jobs.map(j => (
                    <option key={j.job_id} value={j.job_id}>{j.job_number} — {j.job_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Notes</label>
                <input
                  type="text"
                  value={dialogNotes}
                  onChange={(e) => setDialogNotes(e.target.value)}
                  placeholder="Need you for the bar install..."
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                />
              </div>
              {dialog.existing && (
                <div className="flex items-center gap-2 text-xs text-muted">
                  Status: <span className={"font-medium " + (
                    dialog.existing.status === "Confirmed" ? "text-starlight-green" :
                    dialog.existing.status === "Declined" ? "text-starlight-red" : "text-starlight-amber"
                  )}>{dialog.existing.status}</span>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-subtle flex justify-between">
              <div>
                {dialog.existing && (
                  <button onClick={removeBooking} className="px-3 py-2 text-xs text-starlight-red hover:bg-starlight-red/10 rounded-lg transition-colors">
                    Remove
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDialog(null)} className="px-3 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors">
                  Cancel
                </button>
                <button
                  onClick={saveBooking}
                  className="px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red transition-colors"
                >
                  {dialog.existing ? "Update" : "Book"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
