"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import { ArrowLeft, ChevronLeft, ChevronRight, MessageCircle, Save } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

// Timezone-safe date string (avoids toISOString UTC shift in BST etc.)
function localDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function todayLocal(): string {
  const d = new Date();
  return localDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

interface FreelancerOption {
  freelancer_id: number;
  freelancer_name: string;
  speciality: string | null;
  day_rate: number | null;
  standard_day_hours: number | null;
  phone: string | null;
}

interface JobOption {
  job_id: number;
  job_name: string;
  job_number: string;
  event_date: string | null;
}

interface ExistingDay {
  date: string;
  status: string;
  job_name: string | null;
  unavailable_reason: string | null;
}

export default function AddBookingPage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [freelancers, setFreelancers] = useState<FreelancerOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [existingDays, setExistingDays] = useState<ExistingDay[]>([]);

  const [selectedFreelancer, setSelectedFreelancer] = useState<FreelancerOption | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Load freelancers and jobs
  useEffect(() => {
    (async () => {
      const [fRes, jRes] = await Promise.all([
        supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name, speciality, day_rate, standard_day_hours, phone").eq("active", true).order("freelancer_name"),
        supabase.from("tbl_production_plan").select("job_id, job_name, job_number, event_date").order("event_date"),
      ]);
      setFreelancers((fRes.data || []) as FreelancerOption[]);
      setJobs((jRes.data || []) as JobOption[]);
      setLoading(false);
    })();
  }, []);

  // Load existing schedule when freelancer changes
  const loadExistingDays = useCallback(async (fId: number) => {
    const todayStr = todayLocal();
    const { data: schedRows } = await supabase
      .from("tbl_freelancer_schedule")
      .select("scheduled_date, status, job_id, unavailable_reason")
      .eq("freelancer_id", fId)
      .gte("scheduled_date", todayStr);

    if (!schedRows) { setExistingDays([]); return; }

    // Get job names for booked days
    const jobIds = [...new Set(schedRows.map((r: any) => r.job_id).filter(Boolean))];
    let jobNameMap: Record<number, string> = {};
    if (jobIds.length > 0) {
      const { data: jd } = await supabase.from("tbl_production_plan").select("job_id, job_name").in("job_id", jobIds);
      (jd || []).forEach((j: any) => { jobNameMap[j.job_id] = j.job_name; });
    }

    setExistingDays(schedRows.map((r: any) => ({
      date: r.scheduled_date,
      status: r.status,
      job_name: r.job_id ? jobNameMap[r.job_id] || null : null,
      unavailable_reason: r.unavailable_reason,
    })));
  }, []);

  const selectFreelancer = (f: FreelancerOption) => {
    setSelectedFreelancer(f);
    setSelectedDates([]);
    loadExistingDays(f.freelancer_id);
  };

  // Calendar helpers
  const getMonthData = () => {
    const { year, month } = viewMonth;
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const firstDow = first.getDay() === 0 ? 6 : first.getDay() - 1; // Mon=0
    const days: { date: string; num: number; isWeekend: boolean }[] = [];
    for (let d = 1; d <= last.getDate(); d++) {
      const dt = new Date(year, month, d);
      days.push({
      date: localDateStr(year, month, d),
        num: d,
        isWeekend: dt.getDay() === 0 || dt.getDay() === 6,
      });
    }
    const label = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    return { days, firstDow, label };
  };

  const { days: calDays, firstDow: calPad, label: calLabel } = getMonthData();

  const shiftMonth = (dir: number) => {
    setViewMonth((prev) => {
      const d = new Date(prev.year, prev.month + dir, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const toggleDate = (dateStr: string) => {
    setSelectedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    );
  };

  const getDayState = (dateStr: string) => {
    const isSelected = selectedDates.includes(dateStr);
    const existing = existingDays.find((e) => e.date === dateStr);
    if (isSelected && existing?.status === "Unavailable") return "selected-unavailable";
    if (isSelected && existing && ["Booked", "Confirmed", "Notified"].includes(existing.status)) return "selected-booked";
    if (isSelected) return "selected";
    if (existing?.status === "Unavailable") return "unavailable";
    if (existing && ["Booked", "Confirmed", "Notified"].includes(existing.status)) return "booked";
    return "free";
  };

  // Warnings for selected dates that overlap with existing bookings/unavailability
  const conflictWarnings = selectedDates
    .map((d) => {
      const existing = existingDays.find((e) => e.date === d);
      if (!existing) return null;
      const fmtD = new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      if (existing.status === "Unavailable") return `${fmtD} — marked unavailable${existing.unavailable_reason ? " (" + existing.unavailable_reason + ")" : ""}`;
      if (["Booked", "Confirmed", "Notified"].includes(existing.status)) return `${fmtD} — already booked on ${existing.job_name || "another job"}`;
      return null;
    })
    .filter(Boolean) as string[];

  // Summary calculations
  const dayCount = selectedDates.length;
  const hoursPerDay = selectedFreelancer?.standard_day_hours || 10;
  const totalHours = dayCount * hoursPerDay;
  const totalCost = dayCount * (selectedFreelancer?.day_rate || 0);

  // Save booking
  const saveBooking = async (notify: boolean) => {
    if (!selectedFreelancer || !selectedJob || selectedDates.length === 0) return;
    setSaving(true);

    const bookingGroup = crypto.randomUUID();
    const jobIdToSave = selectedJob.job_id === 0 ? null : selectedJob.job_id;
    const inserts = selectedDates.sort().map((d) => ({
      freelancer_id: selectedFreelancer.freelancer_id,
      job_id: jobIdToSave,
      scheduled_date: d,
      status: notify ? "Notified" : "Booked",
      booking_group: bookingGroup,
      notes: note.trim() || null,
      notified_at: notify ? new Date().toISOString() : null,
    }));

    const { error } = await supabase.from("tbl_freelancer_schedule").insert(inserts);
    if (error) {
      alert("Error saving booking: " + error.message);
      setSaving(false);
      return;
    }

    if (notify && selectedFreelancer.phone) {
      // Format dates for message
      const sorted = [...selectedDates].sort();
      const fmtD = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      const dateStr = sorted.length <= 3
        ? sorted.map(fmtD).join(", ")
        : `${fmtD(sorted[0])} – ${fmtD(sorted[sorted.length - 1])} (${sorted.length} days)`;

      const msg = `Hi ${selectedFreelancer.freelancer_name?.split(" ")[0]}, I've got work for you: ${dateStr}${selectedJob.job_id ? " on " + selectedJob.job_name : " at the workshop"}. Can you confirm? Check your schedule here: https://workshop-five-gamma.vercel.app/m/schedule`;

      // Clean phone number for wa.me
      const phone = selectedFreelancer.phone.replace(/\D/g, "");
      const waPhone = phone.startsWith("0") ? "44" + phone.slice(1) : phone;
      const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, "_blank");
    }

    toast.success(`Booked ${selectedDates.length} day${selectedDates.length > 1 ? "s" : ""}${notify ? " — WhatsApp opening" : ""}`);
    router.push("/capacity");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">Loading...</div>;
  }

  const todayStr = todayLocal();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/capacity" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-navy">Add booking</h1>
          <p className="text-sm text-gray-400 mt-0.5">Select a person, a job, and the days you need them</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* Left sidebar: selections + summary */}
        <div className="space-y-4">
          {/* Freelancer picker */}
          <div>
            <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Freelancer</label>
            <select
              value={selectedFreelancer?.freelancer_id || ""}
              onChange={(e) => {
                const f = freelancers.find((x) => x.freelancer_id === Number(e.target.value));
                if (f) selectFreelancer(f);
              }}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
            >
              <option value="">Select a freelancer...</option>
              {freelancers.map((f) => (
                <option key={f.freelancer_id} value={f.freelancer_id}>
                  {f.freelancer_name} — {f.speciality || "No speciality"} — {f.day_rate ? formatCurrency(f.day_rate) + "/day" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Job picker */}
          <div>
            <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Job</label>
            <select
              value={selectedJob?.job_id || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "0") setSelectedJob({ job_id: 0, job_name: "General workshop", job_number: "", event_date: null } as any);
                else { const j = jobs.find((x) => x.job_id === Number(val)); setSelectedJob(j || null); }
              }}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
            >
              <option value="">Select a job...</option>
              <option value="0">General workshop</option>
              {jobs.map((j) => (
                <option key={j.job_id} value={j.job_id}>
                  {j.job_number} — {j.job_name}
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mainly cutting + framework assembly..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
            />
          </div>

          {/* Summary */}
          {selectedFreelancer && dayCount > 0 && (
            <div className="card px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Summary</p>
              <p className="text-xl font-semibold text-navy mt-1">{dayCount} day{dayCount > 1 ? "s" : ""} selected</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {totalHours} hours · {formatCurrency(totalCost)} estimated
              </p>
            </div>
          )}

          {/* Conflict warnings — soft signal, not a block */}
          {conflictWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <p className="text-[11px] font-medium text-amber-700 mb-1">Heads up — {conflictWarnings.length} day{conflictWarnings.length > 1 ? "s" : ""} with existing commitments:</p>
              {conflictWarnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-600">{w}</p>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2">
            <button
              onClick={() => saveBooking(true)}
              disabled={saving || !selectedFreelancer || !selectedJob || dayCount === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-starlight-blue/10 text-starlight-blue font-medium text-sm rounded-lg hover:bg-starlight-blue/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <MessageCircle className="h-4 w-4" />
              {saving ? "Saving..." : "Book & notify via WhatsApp"}
            </button>
            <button
              onClick={() => saveBooking(false)}
              disabled={saving || !selectedFreelancer || !selectedJob || dayCount === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              Book without notifying
            </button>
          </div>
        </div>

        {/* Right: Calendar */}
        <div className="card px-5 py-4">
          {!selectedFreelancer ? (
            <div className="text-center py-16 text-gray-400 text-sm">Select a freelancer to see their calendar</div>
          ) : (
            <>
              {/* Month nav */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => shiftMonth(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                    <ChevronLeft className="h-4 w-4 text-gray-400" />
                  </button>
                  <span className="text-sm font-semibold text-navy min-w-[160px] text-center">{calLabel}</span>
                  <button onClick={() => shiftMonth(1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
                <div className="flex gap-3 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-starlight-blue/20" /> Selected</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-starlight-green/30" /> Already booked</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-200" style={{ background: "repeating-linear-gradient(45deg, #e5e7eb, #e5e7eb 2px, transparent 2px, transparent 5px)" }} /> Unavailable</span>
                </div>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
                  <div key={d} className={"text-center text-[11px] font-medium py-1 " + (d === "Sat" || d === "Sun" ? "text-gray-400" : "text-gray-400")}>{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: calPad }).map((_, i) => <div key={`p-${i}`} />)}
                {calDays.map((d) => {
                  const state = getDayState(d.date);
                  const isPast = d.date < todayStr;
                  const disabled = isPast;
                  const existing = existingDays.find((e) => e.date === d.date);

                  return (
                    <button
                      key={d.date}
                      onClick={() => !disabled && toggleDate(d.date)}
                      disabled={disabled}
                      title={
                        state === "unavailable" || state === "selected-unavailable" ? `⚠ Unavailable${existing?.unavailable_reason ? ": " + existing.unavailable_reason : ""} — you can still book` :
                        state === "booked" || state === "selected-booked" ? `⚠ Already on ${existing?.job_name || "another job"} — you can still book` : ""
                      }
                      className={
                        "text-center py-2.5 rounded-lg text-[13px] transition-all " +
                        (state === "selected" ? "bg-starlight-blue/15 text-starlight-blue font-semibold ring-1 ring-starlight-blue/30 cursor-pointer" :
                         state === "selected-unavailable" ? "bg-starlight-blue/15 text-starlight-blue font-semibold ring-2 ring-starlight-amber/50 cursor-pointer" :
                         state === "selected-booked" ? "bg-starlight-blue/15 text-starlight-blue font-semibold ring-2 ring-starlight-amber/50 cursor-pointer" :
                         state === "booked" ? "bg-starlight-green/15 text-starlight-green font-medium cursor-pointer hover:ring-1 hover:ring-starlight-blue/30" :
                         state === "unavailable" ? "text-gray-400 cursor-pointer hover:ring-1 hover:ring-starlight-blue/30" :
                         isPast ? "text-gray-200 cursor-not-allowed" :
                         d.isWeekend ? "text-gray-400 hover:bg-gray-50 cursor-pointer" :
                         "text-gray-700 hover:bg-gray-50 cursor-pointer")
                      }
                      style={state === "unavailable" ? {
                        background: "repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 3px, transparent 3px, transparent 7px)",
                      } : undefined}
                    >
                      {d.num}
                    </button>
                  );
                })}
              </div>

              {/* Info bar at bottom */}
              {existingDays.length > 0 && (
                <div className="mt-3 px-3 py-2.5 bg-gray-50 rounded-lg text-[11px] text-gray-400 space-y-1">
                  {existingDays.filter((e) => e.status === "Unavailable").slice(0, 3).map((e) => (
                    <div key={e.date}>
                      {new Date(e.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} — {selectedFreelancer?.freelancer_name?.split(" ")[0]} marked unavailable{e.unavailable_reason ? ` (${e.unavailable_reason})` : ""}
                    </div>
                  ))}
                  {existingDays.filter((e) => ["Booked", "Confirmed", "Notified"].includes(e.status)).slice(0, 3).map((e) => (
                    <div key={e.date}>
                      {new Date(e.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} — already booked on {e.job_name || "another job"}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
