"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatHours } from "@/lib/format-hours";
import { isTruthy } from "@/lib/types";
import {
  Users, RefreshCw, AlertTriangle, ChevronDown, ChevronRight,
  BarChart3, Clock, CheckCircle2, Calendar, Briefcase,
  Plus, ChevronLeft,
} from "lucide-react";
import Link from "next/link";
import { BookingCalendar } from "@/components/booking-calendar";
import { useRealtimeRefresh } from "@/lib/use-realtime";

// ============================================================
// Types
// ============================================================

interface DemandRow {
  job_id: number;
  job_number: string;
  job_name: string;
  event_date: string | null;
  scope_item_id: number;
  scope_name: string;
  work_order_id: number;
  wo_description: string;
  activity_label: string;
  status: string;
  estimated_duration_hrs: number | null;
  actual_hours_total: number;
  planned_lead_name: string | null;
}

interface CrewMember {
  freelancer_id: number;
  freelancer_name: string;
  speciality: string | null;
  day_rate: number | null;
  standard_day_hours: number | null;
}

interface Booking {
  schedule_id: number;
  freelancer_id: number;
  scheduled_date: string;
  status: string;
  job_id: number | null;
  notes: string | null;
}

interface Conflict {
  freelancer_id: number;
  freelancer_name: string;
  date: string;
  jobs: { job_id: number; job_name: string }[];
}

interface JobDemand {
  job_id: number;
  job_number: string;
  job_name: string;
  event_date: string | null;
  total_estimated: number;
  total_actual: number;
  remaining: number;
  complete_pct: number;
  wo_count: number;
  wo_complete: number;
  booked_days: number;
  booked_hours: number;
}

// ============================================================
// Main Page
// ============================================================

export default function CapacityPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);

  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);

  const [jobDemands, setJobDemands] = useState<JobDemand[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [woDetails, setWoDetails] = useState<any[]>([]);
  const [allBookedSupplyHours, setAllBookedSupplyHours] = useState(0);
  const [generalWorkshopHours, setGeneralWorkshopHours] = useState(0);

  const today = new Date();
  const fourWeeksOut = new Date(today);
  fourWeeksOut.setDate(fourWeeksOut.getDate() + 28);
  const todayStr = today.toISOString().split("T")[0];
  const futureStr = fourWeeksOut.toISOString().split("T")[0];

  // ============================================================
  // Load data
  // ============================================================

  const loadData = useCallback(async () => {
    setLoading(true);

    // Single RPC replaces 5+ individual queries
    const { data: d, error } = await supabase.rpc("rpc_capacity_data", { p_date_from: todayStr, p_date_to: futureStr });
    if (error || !d) { console.error("Capacity RPC failed:", error); setLoading(false); return; }

    const wos = d.work_orders || [];
    const crewData = d.crew || [];
    const bookData = d.bookings || [];
    const jobData = d.jobs || [];

    setWorkOrders(wos);
    setCrew(crewData);
    setBookings(bookData);
    setJobs(jobData);

    // Build time map from pre-aggregated data
    let timeMap: Record<number, number> = {};
    (d.time_hours_by_wo || []).forEach((t: any) => {
      timeMap[t.work_order_id] = parseFloat(t.total_hours) || 0;
    });

    const jobMap: Record<number, any> = {};
    jobData.forEach((j: any) => { jobMap[j.job_id] = j; });

    const crewMap: Record<number, CrewMember> = {};
    crewData.forEach((c: CrewMember) => { crewMap[c.freelancer_id] = c; });

    const byJob: Record<number, any[]> = {};
    wos.forEach((w: any) => {
      if (!byJob[w.job_id]) byJob[w.job_id] = [];
      byJob[w.job_id].push({ ...w, actual_hours_total: timeMap[w.work_order_id] || 0 });
    });

    const jobBookedDays: Record<number, number> = {};
    const jobBookedHours: Record<number, number> = {};
    let totalSupplyHours = 0;
    let generalHours = 0;
    bookData.forEach((b: Booking) => {
      const isActive = b.status === "Booked" || b.status === "Confirmed" || b.status === "Notified";
      if (!isActive) return;
      const person = crewMap[b.freelancer_id];
      const dayHours = person?.standard_day_hours || 8;
      totalSupplyHours += dayHours;
      if (b.job_id) {
        jobBookedDays[b.job_id] = (jobBookedDays[b.job_id] || 0) + 1;
        jobBookedHours[b.job_id] = (jobBookedHours[b.job_id] || 0) + dayHours;
      } else {
        generalHours += dayHours;
      }
    });
    setAllBookedSupplyHours(totalSupplyHours);
    setGeneralWorkshopHours(generalHours);

    const demands: JobDemand[] = Object.entries(byJob)
      .map(([jobIdStr, wos]) => {
        const jobId = Number(jobIdStr);
        const job = jobMap[jobId];
        if (!job) return null;
        const totalEstimated = wos.reduce((s: number, w: any) => s + (w.estimated_duration_hrs || 0), 0);
        const totalActual = wos.reduce((s: number, w: any) => s + w.actual_hours_total, 0);
        const woComplete = wos.filter((w: any) => w.status === "Complete").length;
        const remaining = Math.max(0, totalEstimated - totalActual);
        return {
          job_id: jobId, job_number: job.job_number || "", job_name: job.job_name || "", event_date: job.event_date,
          total_estimated: totalEstimated, total_actual: totalActual, remaining,
          complete_pct: totalEstimated > 0 ? Math.round((totalActual / totalEstimated) * 100) : 0,
          wo_count: wos.length, wo_complete: woComplete,
          booked_days: jobBookedDays[jobId] || 0, booked_hours: jobBookedHours[jobId] || 0,
        };
      })
      .filter(Boolean) as JobDemand[];

    demands.sort((a, b) => {
      if (!a.event_date) return 1;
      if (!b.event_date) return -1;
      return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
    });
    setJobDemands(demands);

    // Cross-job conflict detection
    const personDayJobs: Record<string, { freelancer_id: number; freelancer_name: string; date: string; jobs: Set<number> }> = {};
    bookData
      .filter((b: Booking) => b.job_id && (b.status === "Booked" || b.status === "Confirmed" || b.status === "Notified"))
      .forEach((b: Booking) => {
        const key = `${b.freelancer_id}-${b.scheduled_date}`;
        if (!personDayJobs[key]) {
          const person = crewMap[b.freelancer_id];
          personDayJobs[key] = { freelancer_id: b.freelancer_id, freelancer_name: person?.freelancer_name || "Unknown", date: b.scheduled_date, jobs: new Set() };
        }
        personDayJobs[key].jobs.add(b.job_id!);
      });

    const detectedConflicts: Conflict[] = Object.values(personDayJobs)
      .filter((entry) => entry.jobs.size > 1)
      .map((entry) => ({
        freelancer_id: entry.freelancer_id, freelancer_name: entry.freelancer_name, date: entry.date,
        jobs: [...entry.jobs].map((jId) => ({ job_id: jId, job_name: jobMap[jId]?.job_name || jobMap[jId]?.job_number || `Job ${jId}` })),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    setConflicts(detectedConflicts);
    setLoading(false);
  }, [todayStr, futureStr]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time: refresh demand stats when WOs or bookings change
  useRealtimeRefresh(["tbl_work_orders", "tbl_freelancer_schedule"], loadData, !loading);

  // ============================================================
  // Expand job to show WO breakdown
  // ============================================================

  const toggleJobExpand = async (jobId: number) => {
    if (expandedJob === jobId) { setExpandedJob(null); setWoDetails([]); return; }
    setExpandedJob(jobId);

    const { data: wos } = await supabase.from("tbl_work_orders")
      .select("work_order_id, scope_item_id, description, status, estimated_duration_hrs, planned_lead_id")
      .eq("job_id", jobId).not("status", "eq", "Voided").order("work_order_id");

    if (!wos || wos.length === 0) { setWoDetails([]); return; }

    const scopeIds = [...new Set(wos.map((w: any) => w.scope_item_id).filter(Boolean))];
    const { data: scopes } = await supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds);
    const scopeMap: Record<number, string> = {};
    (scopes || []).forEach((s: any) => { scopeMap[s.scope_item_id] = s.item_name; });

    const woIds = wos.map((w: any) => w.work_order_id);
    const { data: times } = await supabase.from("tbl_wo_time_entries").select("work_order_id, actual_hours").in("work_order_id", woIds).is("archived_at", null);
    const timeMap: Record<number, number> = {};
    (times || []).forEach((t: any) => { timeMap[t.work_order_id] = (timeMap[t.work_order_id] || 0) + (t.actual_hours || 0); });

    const leadIds = [...new Set(wos.map((w: any) => w.planned_lead_id).filter(Boolean))];
    let leadMap: Record<number, string> = {};
    if (leadIds.length > 0) {
      const { data: leads } = await supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", leadIds);
      (leads || []).forEach((l: any) => { leadMap[l.freelancer_id] = l.freelancer_name; });
    }

    // Get activity labels for WOs
    const { data: actData } = await supabase.from("tbl_wo_activities").select("work_order_id, activity_id, sequence").in("work_order_id", woIds).order("sequence");
    const allActIds = [...new Set((actData || []).map((a: any) => a.activity_id))];
    let lkMap: Record<number, string> = {};
    if (allActIds.length > 0) {
      const { data: lookups } = await supabase.from("tbl_master_lookups").select("lookup_id, lookup_value").in("lookup_id", allActIds);
      (lookups || []).forEach((l: any) => { lkMap[l.lookup_id] = l.lookup_value; });
    }
    const woActLabel: Record<number, string> = {};
    (actData || []).forEach((a: any) => {
      const label = lkMap[a.activity_id] || "?";
      woActLabel[a.work_order_id] = woActLabel[a.work_order_id] ? woActLabel[a.work_order_id] + " + " + label : label;
    });

    setWoDetails(wos.map((w: any) => ({
      ...w, scope_name: scopeMap[w.scope_item_id] || "—",
      actual_hours: timeMap[w.work_order_id] || 0,
      lead_name: w.planned_lead_id ? leadMap[w.planned_lead_id] || "—" : "Unassigned",
      activity_label: woActLabel[w.work_order_id] || "",
    })));
  };

  // Summary stats
  const totalEstimated = jobDemands.reduce((s, j) => s + j.total_estimated, 0);
  const totalActual = jobDemands.reduce((s, j) => s + j.total_actual, 0);
  const totalRemaining = jobDemands.reduce((s, j) => s + j.remaining, 0);
  const totalBookedHours = allBookedSupplyHours;
  const gap = totalBookedHours - totalRemaining;
  const gapTier = gap >= 0 ? "green" : gap > -40 ? "amber" : "red";

  const daysRemaining = (eventDate: string | null) => {
    if (!eventDate) return null;
    return Math.ceil((new Date(eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };
  const daysTier = (days: number | null) => {
    if (days === null) return "text-muted";
    if (days < 0) return "text-muted";
    if (days <= 7) return "text-starlight-red";
    if (days <= 14) return "text-starlight-amber";
    return "text-starlight-green";
  };
  const statusColor = (status: string) => {
    switch (status) {
      case "Complete": return "bg-starlight-green/10 text-starlight-green";
      case "In-Progress": return "bg-starlight-blue/10 text-starlight-blue";
      case "Ready": return "bg-surface-mid text-foreground";
      case "On-Hold": return "bg-starlight-amber/10 text-starlight-amber";
      default: return "bg-surface-dim text-muted";
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted text-sm animate-pulse">Loading capacity data...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Capacity Planning</h1>
          <p className="text-sm text-muted mt-0.5">Demand vs supply · next 4 weeks · {jobDemands.length} active jobs</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/capacity/add-booking" className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-blue/10 text-starlight-blue text-sm font-medium rounded-lg hover:bg-starlight-blue/20 transition-colors">
            <Plus className="h-4 w-4" /> Add booking
          </Link>
          <button onClick={loadData} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-navy hover:bg-surface-mid rounded-lg transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card px-4 py-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Estimated Total</p>
          <p className="text-lg font-semibold text-navy font-mono">{formatHours(totalEstimated)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Hours Logged</p>
          <p className="text-lg font-semibold text-starlight-green font-mono">{formatHours(totalActual)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Remaining</p>
          <p className="text-lg font-semibold text-navy font-mono">{formatHours(totalRemaining)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Booked (4 wks)</p>
          <p className="text-lg font-semibold text-starlight-blue font-mono">{formatHours(totalBookedHours)}</p>
          {generalWorkshopHours > 0 && (
            <p className="text-[10px] text-muted mt-0.5">{formatHours(generalWorkshopHours)} general</p>
          )}
        </div>
        <div className={"card px-4 py-3 border-l-4 " + (gapTier === "green" ? "border-l-starlight-green" : gapTier === "amber" ? "border-l-starlight-amber" : "border-l-starlight-red")}>
          <p className="text-[10px] text-muted uppercase tracking-wider">Gap</p>
          <p className={"text-lg font-semibold font-mono " + (gapTier === "green" ? "text-starlight-green" : gapTier === "amber" ? "text-starlight-amber" : "text-starlight-red")}>
            {gap >= 0 ? "+" : ""}{Math.round(gap)}h
          </p>
          <p className="text-[10px] text-muted mt-0.5">{gap >= 0 ? "Surplus capacity" : "Shortfall — book more crew"}</p>
        </div>
      </div>

      {/* Conflicts warning */}
      {conflicts.length > 0 && (
        <div className="card px-5 py-4 border-l-4 border-l-starlight-red">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-starlight-red" />
            <h3 className="text-sm font-semibold text-starlight-red">Cross-Job Conflicts ({conflicts.length})</h3>
          </div>
          <div className="space-y-1.5">
            {conflicts.map((c, idx) => (
              <div key={idx} className="text-xs text-muted">
                <span className="font-medium text-navy">{c.freelancer_name}</span>
                <span className="text-muted"> · </span>
                <span className="font-mono text-muted">{formatDate(c.date)}</span>
                <span className="text-muted"> — booked on: </span>
                {c.jobs.map((j, ji) => (
                  <span key={j.job_id}>
                    {ji > 0 && <span className="text-muted"> &amp; </span>}
                    <span className="font-medium text-starlight-red">{j.job_name}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Booking Calendar */}
      <div className="card px-5 py-4">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-navy" />
          <h2 className="text-sm font-semibold text-navy">Booking calendar</h2>
        </div>
        <BookingCalendar
          crew={crew.map(c => ({
            freelancer_id: c.freelancer_id,
            freelancer_name: c.freelancer_name || "",
            speciality: c.speciality || null,
            day_rate: c.day_rate || null,
          }))}
        />
      </div>

      {/* Job demand breakdown */}
      <div>
        <h2 className="text-sm font-semibold text-navy mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Demand by Job
        </h2>
        <div className="space-y-2">
          {jobDemands.length === 0 ? (
            <div className="card px-6 py-10 text-center text-muted text-sm">No work orders found across active jobs</div>
          ) : (
            jobDemands.map((j) => {
              const days = daysRemaining(j.event_date);
              const isExpanded = expandedJob === j.job_id;
              const progressPct = Math.min(100, j.complete_pct);
              return (
                <div key={j.job_id} className="card overflow-hidden">
                  <button onClick={() => toggleJobExpand(j.job_id)} className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-surface-dim transition-colors text-left">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-navy">{j.job_name}</span>
                        <span className="text-xs font-mono text-muted">{j.job_number}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <div className="flex-1 h-2 bg-surface-mid rounded-full overflow-hidden max-w-[200px]">
                          <div className="h-full bg-starlight-green rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted font-mono">{j.wo_complete}/{j.wo_count} WOs</span>
                      </div>
                    </div>
                    <div className="hidden md:flex items-center gap-6 text-xs shrink-0">
                      <div className="text-center"><p className="font-mono text-navy font-medium">{formatHours(j.total_estimated)}</p><p className="text-[10px] text-muted">Estimated</p></div>
                      <div className="text-center"><p className="font-mono text-starlight-green font-medium">{formatHours(j.total_actual)}</p><p className="text-[10px] text-muted">Logged</p></div>
                      <div className="text-center"><p className="font-mono text-navy font-medium">{formatHours(j.remaining)}</p><p className="text-[10px] text-muted">Remaining</p></div>
                      <div className="text-center"><p className="font-mono text-starlight-blue font-medium">{formatHours(j.booked_hours)}</p><p className="text-[10px] text-muted">Booked</p></div>
                    </div>
                    <div className={"text-right shrink-0 " + daysTier(days)}>
                      <p className="text-sm font-semibold font-mono">{days !== null ? (days < 0 ? `${Math.abs(days)}d ago` : `${days}d`) : "—"}</p>
                      <p className="text-[10px]">{j.event_date ? formatDate(j.event_date) : "No date"}</p>
                    </div>
                  </button>
                  {/* Expanded WO details */}
                  {isExpanded && (
                    <div className="border-t border-subtle bg-surface-dim/50">
                      {woDetails.length === 0 ? (
                        <div className="px-6 py-4 text-sm text-muted">Loading...</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-[10px] text-muted uppercase tracking-wider">
                                <th className="px-5 py-2 font-medium">Scope Item</th>
                                <th className="px-3 py-2 font-medium">Work Order</th>
                                <th className="px-3 py-2 font-medium">Status</th>
                                <th className="px-3 py-2 font-medium">Lead</th>
                                <th className="px-3 py-2 font-medium text-right">Est</th>
                                <th className="px-3 py-2 font-medium text-right">Actual</th>
                                <th className="px-3 py-2 font-medium text-right">Remaining</th>
                              </tr>
                            </thead>
                            <tbody>
                              {woDetails.map((w: any) => {
                                const est = w.estimated_duration_hrs || 0;
                                const act = w.actual_hours || 0;
                                const rem = w.status === "Complete" ? 0 : Math.max(0, est - act);
                                return (
                                  <tr key={w.work_order_id} className="border-t border-subtle">
                                    <td className="px-5 py-2 text-navy font-medium max-w-[150px] truncate">{w.scope_name}</td>
                                    <td className="px-3 py-2 text-muted max-w-[200px] truncate">
                                      {w.activity_label && <span className="text-navy font-medium">{w.activity_label}</span>}
                                      {w.activity_label && w.description && <span className="text-muted"> — </span>}
                                      {w.description || (!w.activity_label ? "—" : "")}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium " + statusColor(w.status)}>{w.status}</span>
                                    </td>
                                    <td className="px-3 py-2 text-muted">{w.lead_name}</td>
                                    <td className="px-3 py-2 text-right font-mono text-muted">{est ? `${est}h` : "—"}</td>
                                    <td className="px-3 py-2 text-right font-mono text-starlight-green">{act ? `${Math.round(act * 10) / 10}h` : "—"}</td>
                                    <td className={"px-3 py-2 text-right font-mono font-medium " + (rem > 0 ? "text-navy" : "text-muted")}>{rem > 0 ? `${Math.round(rem * 10) / 10}h` : "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
