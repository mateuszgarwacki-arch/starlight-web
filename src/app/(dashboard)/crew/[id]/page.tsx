"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import type { Freelancer } from "@/lib/types";
import { getAuditContext, auditedUpdate, auditedInsert } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { ArrowLeft, Phone, Mail, Briefcase, Clock, Flag, Calendar, AlertTriangle, CheckCircle2, Pencil, Archive, X, Square, Users, CornerDownRight, Check, Search, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface TimeEntryRow {
  entry_id: number;
  work_order_id: number;
  actual_hours: number | null;
  flag_note: string | null;
  system_start_timestamp: string | null;
  system_end_timestamp: string | null;
  entry_cost: number | null;
  // Joined fields
  wo_description: string | null;
  activity_label: string | null;
  scope_name: string | null;
  job_name: string | null;
  job_number: string | null;
  job_id: number | null;
  scope_item_id: number | null;
  wo_status: string | null;
  // Archive fields
  archived_at: string | null;
  archive_reason: string | null;
}

interface BookingRow {
  schedule_id: number;
  scheduled_date: string;
  status: string | null;
  job_id: number | null;
  job_name: string | null;
  job_number: string | null;
  notes: string | null;
  unavailable_reason: string | null;
}

interface Stats {
  totalHours: number;
  last30Hours: number;
  totalWOs: number;
  avgAccuracy: number | null; // actual/estimated ratio
  flagCount: number;
}

interface PendingTask {
  task_id: number;
  title: string;
  description: string | null;
  category: string;
  hours: number | null;
  worked_date: string | null;
  job_id: number | null;
  job_name?: string | null;
  job_number?: string | null;
  created_at: string;
  status: string;
  review_note?: string | null;
  routed_to_wo_id?: number | null;
}

interface WOOption {
  work_order_id: number;
  description: string | null;
  scope_name: string;
  job_number: string;
  job_id: number;
  status: string;
}

export default function FreelancerDetailPage() {
  const params = useParams();
  const freelancerId = Number(params.id);
  const supabase = createClient();

  const [person, setPerson] = useState<Freelancer | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntryRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [stats, setStats] = useState<Stats>({ totalHours: 0, last30Hours: 0, totalWOs: 0, avgAccuracy: null, flagCount: 0 });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [activeTab, setActiveTab] = useState<"timeline" | "bookings">("timeline");
  const [viewMode, setViewMode] = useState<"flat" | "by-day">("flat");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [editingEntry, setEditingEntry] = useState<number | null>(null);
  const [editHoursValue, setEditHoursValue] = useState("");
  const [archivingEntry, setArchivingEntry] = useState<number | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [stoppingEntry, setStoppingEntry] = useState<number | null>(null);
  const [stopHours, setStopHours] = useState("");

  // Tasks state (all statuses)
  const [allTasks, setAllTasks] = useState<PendingTask[]>([]);
  const [routingTask, setRoutingTask] = useState<PendingTask | null>(null);
  const [woOptions, setWoOptions] = useState<WOOption[]>([]);
  const [woSearch, setWoSearch] = useState("");
  const [selectedWo, setSelectedWo] = useState<number | null>(null);
  const [routeHours, setRouteHours] = useState("");
  const [routeNote, setRouteNote] = useState("");
  const [routeSubmitting, setRouteSubmitting] = useState(false);
  const [rejectingTask, setRejectingTask] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [editTaskHours, setEditTaskHours] = useState("");
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [stopReason, setStopReason] = useState("");

  const loadData = useCallback(async () => {
    // Check current user role
    const { data: { user } } = await supabase.auth.getUser();
    const role = user?.app_metadata?.role || user?.user_metadata?.role || "freelancer";
    setIsAdmin(role === "admin");

    // Load freelancer
    const { data: fr } = await supabase.from("tbl_freelancers").select("*").eq("freelancer_id", freelancerId).single();
    if (fr) setPerson(fr);

    // Load time entries with WO + job context
    const { data: entries } = await supabase
      .from("tbl_wo_time_entries")
      .select("entry_id, work_order_id, actual_hours, flag_note, system_start_timestamp, system_end_timestamp, entry_cost, archived_at, archive_reason")
      .eq("freelancer_id", freelancerId)
      .order("system_start_timestamp", { ascending: false })
      .limit(200);

    if (entries && entries.length > 0) {
      const woIds = [...new Set(entries.map(e => e.work_order_id).filter(Boolean))];
      const { data: wos } = await supabase
        .from("tbl_work_orders")
        .select("work_order_id, description, scope_item_id, job_id, status, activity_verb, estimated_duration_hrs")
        .in("work_order_id", woIds);

      // Get job + scope names
      const jobIds = [...new Set((wos || []).map(w => w.job_id).filter(Boolean))];
      const scopeIds = [...new Set((wos || []).map(w => w.scope_item_id).filter(Boolean))];

      const [jobRes, scopeRes, lookupRes] = await Promise.all([
        jobIds.length > 0 ? supabase.from("tbl_production_plan").select("job_id, job_name, job_number").in("job_id", jobIds) : { data: [] },
        scopeIds.length > 0 ? supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds) : { data: [] },
        supabase.from("tbl_master_lookups").select("lookup_id, lookup_value").eq("category", "ACTIVITY"),
      ]);

      const woMap: Record<number, any> = {};
      (wos || []).forEach(w => { woMap[w.work_order_id] = w; });
      const jobMap: Record<number, any> = {};
      (jobRes.data || []).forEach(j => { jobMap[j.job_id] = j; });
      const scopeMap: Record<number, string> = {};
      (scopeRes.data || []).forEach(s => { scopeMap[s.scope_item_id] = s.item_name; });
      const lkMap: Record<number, string> = {};
      (lookupRes.data || []).forEach(l => { lkMap[l.lookup_id] = l.lookup_value; });

      const enriched: TimeEntryRow[] = entries.map(e => {
        const wo = woMap[e.work_order_id] || {};
        const job = jobMap[wo.job_id] || {};
        return {
          ...e,
          wo_description: wo.description,
          activity_label: lkMap[wo.activity_verb] || null,
          scope_name: scopeMap[wo.scope_item_id] || null,
          job_name: job.job_name || null,
          job_number: job.job_number || null,
          job_id: wo.job_id || null,
          scope_item_id: wo.scope_item_id || null,
          wo_status: wo.status || null,
          archived_at: e.archived_at || null,
          archive_reason: e.archive_reason || null,
        };
      });
      setTimeEntries(enriched);

      // Calculate stats (exclude archived)
      const activeEntries = entries.filter(e => !e.archived_at);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const totalHours = activeEntries.reduce((s, e) => s + (e.actual_hours || 0), 0);
      const last30 = activeEntries.filter(e => e.system_start_timestamp && new Date(e.system_start_timestamp) > thirtyDaysAgo);
      const last30Hours = last30.reduce((s, e) => s + (e.actual_hours || 0), 0);
      const completedWOs = new Set(activeEntries.filter(e => woMap[e.work_order_id]?.status === "Complete").map(e => e.work_order_id));
      const flags = activeEntries.filter(e => e.flag_note && e.flag_note.trim().length > 0);

      // Accuracy: compare actual vs estimated on completed WOs
      let accuracySum = 0, accuracyCount = 0;
      completedWOs.forEach(woId => {
        const wo = woMap[woId];
        if (wo?.estimated_duration_hrs) {
          const actual = activeEntries.filter(e => e.work_order_id === woId).reduce((s, e) => s + (e.actual_hours || 0), 0);
          if (actual > 0) { accuracySum += actual / wo.estimated_duration_hrs; accuracyCount++; }
        }
      });

      setStats({
        totalHours: Math.round(totalHours * 10) / 10,
        last30Hours: Math.round(last30Hours * 10) / 10,
        totalWOs: completedWOs.size,
        avgAccuracy: accuracyCount > 0 ? Math.round((accuracySum / accuracyCount) * 100) : null,
        flagCount: flags.length,
      });
    }

    // Load bookings (upcoming + recent)
    const { data: schedData } = await supabase
      .from("tbl_freelancer_schedule")
      .select("schedule_id, scheduled_date, status, job_id, notes, unavailable_reason")
      .eq("freelancer_id", freelancerId)
      .gte("scheduled_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .order("scheduled_date", { ascending: false })
      .limit(100);

    if (schedData && schedData.length > 0) {
      const sJobIds = [...new Set(schedData.map(s => s.job_id).filter(Boolean))];
      const { data: sJobs } = sJobIds.length > 0
        ? await supabase.from("tbl_production_plan").select("job_id, job_name, job_number").in("job_id", sJobIds)
        : { data: [] };
      const sjMap: Record<number, any> = {};
      (sJobs || []).forEach(j => { sjMap[j.job_id] = j; });

      setBookings(schedData.map(s => ({
        ...s,
        job_name: s.job_id ? sjMap[s.job_id]?.job_name || null : null,
        job_number: s.job_id ? sjMap[s.job_id]?.job_number || null : null,
      })));
    }

    // Load all tasks (any status)
    const { data: taskData } = await supabase
      .from("tbl_tasks")
      .select("task_id, title, description, category, hours, worked_date, job_id, created_at, status, review_note, routed_to_wo_id")
      .eq("freelancer_id", freelancerId)
      .order("created_at", { ascending: false });
    if (taskData && taskData.length > 0) {
      const tJobIds = [...new Set(taskData.map(t => t.job_id).filter(Boolean))];
      const { data: tJobs } = tJobIds.length > 0
        ? await supabase.from("tbl_production_plan").select("job_id, job_name, job_number").in("job_id", tJobIds)
        : { data: [] };
      const tjMap: Record<number, any> = {};
      (tJobs || []).forEach(j => { tjMap[j.job_id] = j; });
      setAllTasks(taskData.map(t => ({
        ...t,
        job_name: t.job_id ? tjMap[t.job_id]?.job_name || null : null,
        job_number: t.job_id ? tjMap[t.job_id]?.job_number || null : null,
      })));
    } else {
      setAllTasks([]);
    }

    setLoading(false);
  }, [freelancerId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Admin inline edit
  const startEdit = (field: string, current: string | number | null) => {
    if (!isAdmin) return;
    setEditingField(field);
    setEditValue(String(current ?? ""));
  };
  const saveField = async () => {
    if (!editingField || !person) return;
    const val = editValue.trim() || null;
    const numFields = ["day_rate", "standard_day_hours"];
    const saveVal = numFields.includes(editingField) && val ? parseFloat(val) : val;
    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_freelancers", person.freelancer_id, { [editingField]: saveVal });
    setPerson({ ...person, [editingField]: saveVal } as any);
    setEditingField(null);
    toast.success("Saved");
  };
  const cancelEdit = () => { setEditingField(null); setEditValue(""); };

  // Editable field component
  const EditableField = ({ field, value, label, type = "text", suffix = "" }: { field: string; value: string | number | null; label: string; type?: string; suffix?: string }) => (
    <div className="min-w-0">
      <p className="text-[10px] text-muted uppercase tracking-wider">{label}</p>
      {editingField === field ? (
        <input type={type} value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={saveField} onKeyDown={e => { if (e.key === "Enter") saveField(); if (e.key === "Escape") cancelEdit(); }}
          autoFocus className="w-full px-2 py-1 text-sm border border-starlight-blue rounded bg-surface focus:outline-none" />
      ) : (
        <p onClick={() => startEdit(field, value)} title={String(value ?? "")}
          className={`text-sm text-navy font-medium truncate ${isAdmin ? "cursor-pointer hover:text-starlight-blue transition-colors group" : ""}`}>
          {value ?? <span className="text-faint">—</span>}{suffix}
          {isAdmin && <Pencil className="h-3 w-3 text-faint opacity-0 group-hover:opacity-100 inline ml-1" />}
        </p>
      )}
    </div>
  );

  // Admin: Edit hours
  const handleEditHours = async (entryId: number) => {
    const hours = parseFloat(editHoursValue);
    if (isNaN(hours) || hours < 0) { toast.error("Invalid hours"); return; }
    const entry = timeEntries.find(e => e.entry_id === entryId);
    const rate = person?.day_rate && person?.standard_day_hours ? person.day_rate / person.standard_day_hours : 0;
    const newCost = Math.round(hours * rate * 100) / 100;

    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_wo_time_entries", entryId, {
      actual_hours: hours,
      entry_cost: newCost,
    }, entry?.job_id);

    setTimeEntries(prev => prev.map(e => e.entry_id === entryId ? { ...e, actual_hours: hours, entry_cost: newCost } : e));
    setEditingEntry(null);
    toast.success(`Hours updated to ${hours}h`);
  };

  // Admin: Archive entry
  const handleArchive = async (entryId: number) => {
    if (!archiveReason.trim()) { toast.error("Reason required"); return; }
    const ctx = await getAuditContext(supabase);
    const entry = timeEntries.find(e => e.entry_id === entryId);

    await supabase.from("tbl_wo_time_entries").update({
      archived_at: new Date().toISOString(),
      archived_by: ctx.userId,
      archive_reason: archiveReason.trim(),
    }).eq("entry_id", entryId);

    // Log it
    await supabase.from("tbl_audit_log").insert({
      user_id: ctx.userId, user_name: ctx.userName, user_role: ctx.userRole,
      table_name: "tbl_wo_time_entries", record_id: entryId,
      field_name: "_archive", old_value: JSON.stringify(entry), new_value: JSON.stringify({ reason: archiveReason.trim() }),
      job_id: entry?.job_id, action_type: "archive",
    });

    setTimeEntries(prev => prev.map(e => e.entry_id === entryId ? { ...e, archived_at: new Date().toISOString(), archive_reason: archiveReason.trim() } : e));
    setArchivingEntry(null);
    setArchiveReason("");
    toast.success("Entry archived");
  };

  // PM: Stop open timer and set hours
  const handleStopTimer = async (entryId: number) => {
    const hours = parseFloat(stopHours);
    if (isNaN(hours) || hours <= 0) { toast.error("Enter valid hours"); return; }
    if (!stopReason.trim()) { toast.error("Reason required"); return; }
    const entry = timeEntries.find(e => e.entry_id === entryId);
    const rate = person?.day_rate && person?.standard_day_hours ? person.day_rate / person.standard_day_hours : 0;
    const cost = Math.round(hours * rate * 100) / 100;
    const now = new Date().toISOString();

    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_wo_time_entries", entryId, {
      system_end_timestamp: now,
      actual_end_timestamp: now,
      actual_hours: hours,
      applied_hourly_rate: rate,
      entry_cost: cost,
      flag_note: `PM override: ${stopReason.trim()}`,
    }, entry?.job_id);

    setTimeEntries(prev => prev.map(e => e.entry_id === entryId ? {
      ...e, system_end_timestamp: now, actual_hours: hours, entry_cost: cost,
      flag_note: `PM override: ${stopReason.trim()}`,
    } : e));
    setStoppingEntry(null);
    setStopHours("");
    setStopReason("");
    toast.success(`Timer stopped — ${hours}h logged`);
  };

  // ============================================================
  // Task Actions (approve / reject / route to WO)
  // ============================================================
  const openRouteModal = async (task: PendingTask) => {
    setRoutingTask(task); setRouteHours(String(task.hours || "")); setRouteNote(""); setSelectedWo(null); setWoSearch("");
    const { data: wos } = await supabase.from("tbl_work_orders").select("work_order_id, description, scope_item_id, job_id, status").in("status", ["Ready", "In-Progress", "Not-Started"]);
    if (!wos) { setWoOptions([]); return; }
    const scopeIds = [...new Set(wos.map((w: any) => w.scope_item_id).filter(Boolean))];
    const jobIds = [...new Set(wos.map((w: any) => w.job_id).filter(Boolean))];
    const [scopeRes, jobRes] = await Promise.all([
      scopeIds.length > 0 ? supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds) : { data: [] },
      jobIds.length > 0 ? supabase.from("tbl_production_plan").select("job_id, job_number").in("job_id", jobIds) : { data: [] },
    ]);
    const sMap: Record<number, string> = {}; ((scopeRes as any).data || []).forEach((s: any) => { sMap[s.scope_item_id] = s.item_name; });
    const jMap: Record<number, string> = {}; ((jobRes as any).data || []).forEach((j: any) => { jMap[j.job_id] = j.job_number; });
    const enriched: WOOption[] = wos.map((w: any) => ({ ...w, scope_name: sMap[w.scope_item_id] || "—", job_number: jMap[w.job_id] || "—" }));
    if (task.job_id) { enriched.sort((a, b) => { if (a.job_id === task.job_id && b.job_id !== task.job_id) return -1; if (b.job_id === task.job_id && a.job_id !== task.job_id) return 1; return 0; }); }
    setWoOptions(enriched);
  };

  const handleRouteToWO = async () => {
    if (!routingTask || !selectedWo) return;
    const hrs = parseFloat(routeHours); if (!hrs || hrs <= 0) { toast.error("Enter valid hours"); return; }
    setRouteSubmitting(true);
    try {
      const ctx = await getAuditContext(supabase);
      const wo = woOptions.find((w) => w.work_order_id === selectedWo);
      const hourlyRate = person?.day_rate && person?.standard_day_hours && person.standard_day_hours > 0 ? person.day_rate / person.standard_day_hours : 0;
      await auditedInsert(ctx, "tbl_wo_time_entries", {
        work_order_id: selectedWo, freelancer_id: freelancerId,
        actual_hours: hrs, applied_hourly_rate: hourlyRate, entry_cost: hrs * hourlyRate,
        actual_start_timestamp: routingTask.worked_date ? routingTask.worked_date + "T09:00:00Z" : null,
      }, wo?.job_id);
      await supabase.from("tbl_tasks").update({
        status: "routed", routed_to_wo_id: selectedWo, routed_hours: hrs,
        reviewed_by: ctx.userId, reviewed_at: new Date().toISOString(), review_note: routeNote || null,
      }).eq("task_id", routingTask.task_id);
      await notify({ supabase, type: "task_reviewed", title: `Task routed: ${routingTask.title}`, detail: `${hrs}h routed to WO — ${routeNote || "No note"}`, severity: "info", freelancerId, woId: selectedWo, jobId: wo?.job_id });
      toast.success("Task routed to WO");
      setRoutingTask(null);
      setAllTasks(prev => prev.map(t => t.task_id === routingTask.task_id ? { ...t, status: "routed" } : t));
      loadData();
    } catch { toast.error("Failed to route task"); }
    setRouteSubmitting(false);
  };

  const handleApproveOverhead = async (task: PendingTask) => {
    const ctx = await getAuditContext(supabase);
    await supabase.from("tbl_tasks").update({ status: "approved_overhead", reviewed_by: ctx.userId, reviewed_at: new Date().toISOString() }).eq("task_id", task.task_id);
    await notify({ supabase, type: "task_reviewed", title: `Task approved: ${task.title}`, detail: "Approved as overhead", severity: "info", freelancerId });
    toast.success("Approved as overhead");
    setAllTasks(prev => prev.map(t => t.task_id === task.task_id ? { ...t, status: "approved_overhead" } : t));
  };

  const handleRejectTask = async (taskId: number) => {
    if (!rejectReason.trim()) { toast.error("Rejection needs a reason"); return; }
    const task = allTasks.find(t => t.task_id === taskId);
    const ctx = await getAuditContext(supabase);
    await supabase.from("tbl_tasks").update({ status: "rejected", reviewed_by: ctx.userId, reviewed_at: new Date().toISOString(), review_note: rejectReason.trim() }).eq("task_id", taskId);
    await notify({ supabase, type: "task_reviewed", title: `Task rejected: ${task?.title || ""}`, detail: rejectReason.trim(), severity: "warning", freelancerId });
    toast.success("Task rejected");
    setRejectingTask(null); setRejectReason("");
    setAllTasks(prev => prev.map(t => t.task_id === taskId ? { ...t, status: "rejected" } : t));
  };

  const filteredWos = woOptions.filter((w) => (w.description || "").toLowerCase().includes(woSearch.toLowerCase()) || w.scope_name.toLowerCase().includes(woSearch.toLowerCase()) || w.job_number.toLowerCase().includes(woSearch.toLowerCase()));

  // Edit task hours/title
  const handleEditTask = async (taskId: number) => {
    const hrs = parseFloat(editTaskHours);
    if (isNaN(hrs) || hrs < 0) { toast.error("Invalid hours"); return; }
    const updates: Record<string, any> = { hours: hrs };
    if (editTaskTitle.trim()) updates.title = editTaskTitle.trim();
    await supabase.from("tbl_tasks").update(updates).eq("task_id", taskId);
    setAllTasks(prev => prev.map(t => t.task_id === taskId ? { ...t, ...updates } : t));
    setEditingTask(null);
    toast.success("Task updated");
  };

  // Derived: split tasks by status
  const pendingTasks = allTasks.filter(t => t.status === "pending");
  const reviewedTasks = allTasks.filter(t => t.status !== "pending");

  const statusColor = (s: string | null) => {
    if (!s) return "bg-surface-mid text-muted";
    const m: Record<string, string> = {
      Booked: "bg-navy/15 text-navy", Notified: "bg-starlight-amber/15 text-starlight-amber",
      Confirmed: "bg-starlight-green/15 text-starlight-green", Declined: "bg-starlight-red/15 text-starlight-red",
      Unavailable: "bg-surface-hi text-muted",
    };
    return m[s] || "bg-surface-mid text-muted";
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted text-sm animate-pulse">Loading...</div>;
  if (!person) return <div className="text-center py-12 text-muted">Freelancer not found</div>;

  const isActive = isTruthy(person.active);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/crew" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy transition-colors">
        <ArrowLeft className="h-4 w-4" /> All Crew
      </Link>

      {/* Header card */}
      <div className="card px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <EditableField field="freelancer_name" value={person.freelancer_name} label="" />
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${isActive ? "bg-starlight-green/15 text-starlight-green" : "bg-starlight-red/15 text-starlight-red"}`}>
                {isActive ? "Active" : "Inactive"}
              </span>
              {person.role && (
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-navy/15 text-navy">{person.role}</span>
              )}
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
          <EditableField field="phone" value={person.phone} label="Phone" />
          <EditableField field="email" value={person.email} label="Email" />
          <EditableField field="speciality" value={person.speciality} label="Speciality" />
          <EditableField field="day_rate" value={person.day_rate} label="Day Rate" type="number" suffix={person.day_rate ? "" : ""} />
          <EditableField field="standard_day_hours" value={person.standard_day_hours} label="Day Hours" type="number" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Total Hours</p>
          <p className="text-lg font-semibold text-navy">{stats.totalHours}h</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Last 30 Days</p>
          <p className="text-lg font-semibold text-navy">{stats.last30Hours}h</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">WOs Completed</p>
          <p className="text-lg font-semibold text-navy">{stats.totalWOs}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Avg vs Estimate</p>
          <p className={`text-lg font-semibold ${stats.avgAccuracy === null ? "text-faint" : stats.avgAccuracy > 110 ? "text-starlight-red" : stats.avgAccuracy < 90 ? "text-starlight-green" : "text-navy"}`}>
            {stats.avgAccuracy !== null ? `${stats.avgAccuracy}%` : "—"}
          </p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Flag Notes</p>
          <p className="text-lg font-semibold text-navy">{stats.flagCount}</p>
        </div>
      </div>

      {/* Active timers — open entries that haven't been closed */}
      {(() => {
        const openEntries = timeEntries.filter(e => !e.system_end_timestamp && !e.archived_at);
        if (openEntries.length === 0) return null;
        return (
          <div className="bg-starlight-blue/5 border border-starlight-blue/20 rounded-xl px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-starlight-blue" />
              <p className="text-sm font-semibold text-starlight-blue">Active Timer{openEntries.length > 1 ? "s" : ""}</p>
            </div>
            {openEntries.map(entry => {
              const elapsed = entry.system_start_timestamp
                ? Math.round(((Date.now() - new Date(entry.system_start_timestamp).getTime()) / 3600000) * 10) / 10
                : 0;
              const isStopping = stoppingEntry === entry.entry_id;
              return (
                <div key={entry.entry_id} className="bg-surface rounded-lg border border-subtle px-4 py-3 mb-2 last:mb-0">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-starlight-blue animate-pulse shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy">{entry.activity_label || "WO"} — {entry.scope_name || "Unknown scope"}</p>
                      <p className="text-xs text-muted truncate">{entry.job_number} · {entry.job_name}{entry.wo_description ? ` — ${entry.wo_description}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-navy font-mono">{elapsed}h</p>
                      <p className="text-[9px] text-muted">since {entry.system_start_timestamp ? new Date(entry.system_start_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                    </div>
                    <button onClick={() => { setStoppingEntry(isStopping ? null : entry.entry_id); setStopHours(String(Math.max(0.5, Math.round(elapsed * 2) / 2))); setStopReason(""); }}
                      className={"p-2 rounded-lg transition-colors " + (isStopping ? "bg-starlight-red/10 text-starlight-red" : "text-muted hover:text-starlight-red hover:bg-starlight-red/10")}
                      title="Stop timer & set hours">
                      <Square className="h-4 w-4" />
                    </button>
                  </div>
                  {isStopping && (
                    <div className="mt-3 pt-3 border-t border-subtle flex items-end gap-2">
                      <div className="w-20">
                        <label className="text-[9px] text-muted block mb-0.5">Hours</label>
                        <input type="number" step="0.5" min="0.5" value={stopHours}
                          onChange={e => setStopHours(e.target.value)}
                          className="w-full px-2 py-1.5 text-sm text-center border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-starlight-red" autoFocus />
                      </div>
                      <div className="flex-1">
                        <label className="text-[9px] text-muted block mb-0.5">Reason *</label>
                        <input type="text" value={stopReason} onChange={e => setStopReason(e.target.value)}
                          placeholder="e.g. Forgot to log, end of day, left site"
                          className="w-full px-2 py-1.5 text-xs border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-starlight-red" />
                      </div>
                      <button onClick={() => handleStopTimer(entry.entry_id)}
                        disabled={!stopReason.trim() || !stopHours}
                        className="px-3 py-1.5 bg-starlight-red text-white text-xs font-medium rounded hover:bg-starlight-red disabled:opacity-50 shrink-0">
                        Stop & Log
                      </button>
                      <button onClick={() => setStoppingEntry(null)}
                        className="px-2 py-1.5 text-xs text-muted hover:text-muted shrink-0">Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Pending Tasks — needs PM action */}
      {pendingTasks.length > 0 && (
        <div className="bg-starlight-amber/5 border border-starlight-amber/20 rounded-xl px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-starlight-amber" />
            <p className="text-sm font-semibold text-starlight-amber">
              {pendingTasks.length} pending task{pendingTasks.length !== 1 ? "s" : ""} — needs your review
            </p>
          </div>
          <div className="space-y-2">
            {pendingTasks.map(task => (
              <div key={task.task_id} className="bg-surface rounded-lg border border-subtle px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-starlight-amber/10 text-starlight-amber uppercase tracking-wider">{task.category.replace("_", " ")}</span>
                      {task.hours != null && <span className="text-sm font-semibold text-navy">{task.hours}h</span>}
                      {task.worked_date && <span className="text-xs text-muted">{formatDate(task.worked_date)}</span>}
                    </div>
                    <p className="text-sm font-medium text-navy mt-1">{task.title}</p>
                    {task.description && <p className="text-xs text-muted mt-0.5">{task.description}</p>}
                    {task.job_number && <p className="text-xs text-muted mt-0.5 font-mono">{task.job_number} — {task.job_name}</p>}
                  </div>
                </div>
                {rejectingTask === task.task_id ? (
                  <div className="mt-3 pt-3 border-t border-subtle flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[9px] text-muted block mb-0.5">Reason *</label>
                      <input type="text" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleRejectTask(task.task_id); if (e.key === "Escape") { setRejectingTask(null); setRejectReason(""); } }}
                        placeholder="Reason for rejection..."
                        className="w-full px-2 py-1.5 text-xs border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-starlight-red" autoFocus />
                    </div>
                    <button onClick={() => handleRejectTask(task.task_id)} disabled={!rejectReason.trim()}
                      className="px-3 py-1.5 bg-starlight-red text-white text-xs font-medium rounded hover:bg-starlight-red disabled:opacity-50 shrink-0">Reject</button>
                    <button onClick={() => { setRejectingTask(null); setRejectReason(""); }}
                      className="px-2 py-1.5 text-xs text-muted hover:text-muted shrink-0">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-subtle">
                    <button onClick={() => openRouteModal(task)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-starlight-blue text-white rounded-lg hover:bg-starlight-blue/90 transition-colors">
                      <CornerDownRight className="h-3 w-3" /> Route to WO
                    </button>
                    <button onClick={() => handleApproveOverhead(task)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-starlight-green/10 text-starlight-green rounded-lg hover:bg-starlight-green/20 transition-colors">
                      <Check className="h-3 w-3" /> Approve Overhead
                    </button>
                    <button onClick={() => { setRejectingTask(task.task_id); setRejectReason(""); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-mid text-muted rounded-lg hover:bg-surface-hi transition-colors">
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-subtle">
        <button onClick={() => setActiveTab("timeline")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "timeline" ? "border-starlight-red text-navy" : "border-transparent text-muted hover:text-muted"
          }`}>
          <Clock className="h-4 w-4" /> Activity ({timeEntries.length + reviewedTasks.length})
        </button>
        <button onClick={() => setActiveTab("bookings")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "bookings" ? "border-starlight-red text-navy" : "border-transparent text-muted hover:text-muted"
          }`}>
          <Calendar className="h-4 w-4" /> Bookings ({bookings.length})
        </button>
      </div>

      {/* TAB: Activity Timeline */}
      {activeTab === "timeline" && (
        <div className="space-y-2">
          {/* Controls */}
          {isAdmin && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 bg-surface-mid rounded-lg p-0.5">
                <button onClick={() => setViewMode("flat")}
                  className={"px-3 py-1 text-xs font-medium rounded-md transition-colors " + (viewMode === "flat" ? "bg-surface text-navy shadow-sm" : "text-muted hover:text-navy")}>
                  Flat
                </button>
                <button onClick={() => setViewMode("by-day")}
                  className={"px-3 py-1 text-xs font-medium rounded-md transition-colors " + (viewMode === "by-day" ? "bg-surface text-navy shadow-sm" : "text-muted hover:text-navy")}>
                  By Day
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
                  className="rounded border-subtle" />
                Show archived ({timeEntries.filter(e => e.archived_at).length})
              </label>
            </div>
          )}
          {viewMode === "flat" && (<>
          {(() => {
            const visible = showArchived ? timeEntries : timeEntries.filter(e => !e.archived_at);
            if (visible.length === 0 && reviewedTasks.length === 0) return <div className="card px-6 py-10 text-center text-muted text-sm">No activity recorded yet.</div>;
            return visible.map(e => {
              const isArchived = !!e.archived_at;
              return (
              <div key={e.entry_id} className={`card px-5 py-3.5 flex items-start gap-4 ${e.flag_note && !isArchived ? "border-l-4 border-l-starlight-amber" : ""} ${isArchived ? "opacity-40 border-l-4 border-l-red-300" : ""}`}>
                {/* Date */}
                <div className="w-20 shrink-0 text-center">
                  <p className="text-xs text-muted">
                    {e.system_start_timestamp ? new Date(e.system_start_timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                  </p>
                  <p className="text-[9px] text-faint">
                    {e.system_start_timestamp ? new Date(e.system_start_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}
                    {e.system_end_timestamp ? " → " + new Date(e.system_end_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                  {editingEntry === e.entry_id ? (
                    <div className="flex items-center gap-1">
                      <input type="number" step="0.5" value={editHoursValue}
                        onChange={ev => setEditHoursValue(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === "Enter") handleEditHours(e.entry_id); if (ev.key === "Escape") setEditingEntry(null); }}
                        autoFocus className="w-14 px-1 py-0.5 text-sm text-center border border-starlight-blue rounded" />
                      <button onClick={() => handleEditHours(e.entry_id)} className="text-starlight-green"><CheckCircle2 className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <p className={`text-lg font-semibold text-navy ${isArchived ? "line-through" : ""}`}>{e.actual_hours != null ? `${e.actual_hours}h` : "—"}</p>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {e.activity_label && <span className="text-sm font-semibold text-navy">{e.activity_label}</span>}
                    {e.wo_status && (
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        e.wo_status === "Complete" ? "bg-starlight-green/15 text-starlight-green" :
                        e.wo_status === "In-Progress" ? "bg-navy/15 text-navy" : "bg-surface-mid text-muted"
                      }`}>{e.wo_status}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted mt-0.5 leading-relaxed">{e.scope_name || e.wo_description || "—"}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                    {e.job_number && (
                      <Link href={`/jobs/${e.job_id}`} className="hover:text-navy transition-colors">
                        {e.job_number} — {e.job_name}
                      </Link>
                    )}
                    {e.entry_cost != null && <span className="font-mono">{formatCurrency(e.entry_cost)}</span>}
                  </div>
                  {e.flag_note && (
                    <div className="mt-2 flex items-start gap-2 bg-starlight-amber/10 rounded px-3 py-2">
                      <Flag className="h-3.5 w-3.5 text-starlight-amber shrink-0 mt-0.5" />
                      <p className="text-xs text-starlight-amber leading-relaxed">{e.flag_note}</p>
                    </div>
                  )}
                  {/* Archive reason (if archived) */}
                  {isArchived && e.archive_reason && (
                    <div className="mt-2 flex items-start gap-2 bg-starlight-red/10 rounded px-3 py-2">
                      <Archive className="h-3.5 w-3.5 text-starlight-red shrink-0 mt-0.5" />
                      <p className="text-xs text-starlight-red leading-relaxed">Archived: {e.archive_reason}</p>
                    </div>
                  )}
                  {/* Archive form (when archiving) */}
                  {archivingEntry === e.entry_id && (
                    <div className="mt-2 p-3 bg-starlight-red/10 border border-starlight-red/20 rounded space-y-2">
                      <p className="text-xs font-medium text-starlight-red">Archive this time entry — it will be excluded from all costs</p>
                      <input type="text" value={archiveReason} onChange={ev => setArchiveReason(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === "Enter") handleArchive(e.entry_id); if (ev.key === "Escape") setArchivingEntry(null); }}
                        placeholder="Reason (required)..." autoFocus
                        className="w-full px-3 py-1.5 text-sm border border-starlight-red/20 rounded focus:outline-none focus:ring-2 focus:ring-red-300" />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setArchivingEntry(null)} className="text-xs text-muted hover:text-foreground">Cancel</button>
                        <button onClick={() => handleArchive(e.entry_id)} disabled={!archiveReason.trim()}
                          className="text-xs px-3 py-1 bg-starlight-red text-white rounded hover:bg-starlight-red disabled:opacity-50">Archive</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Admin action buttons */}
                {isAdmin && !isArchived && archivingEntry !== e.entry_id && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => { setEditingEntry(e.entry_id); setEditHoursValue(String(e.actual_hours ?? "")); }}
                      title="Edit hours" className="p-1.5 text-faint hover:text-starlight-blue hover:bg-navy/10 rounded transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { setArchivingEntry(e.entry_id); setArchiveReason(""); }}
                      title="Archive entry" className="p-1.5 text-faint hover:text-starlight-red hover:bg-starlight-red/10 rounded transition-colors">
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              );
            });
          })()}

          {/* Ad-hoc Tasks */}
          {reviewedTasks.length > 0 && (
            <>
              <div className="flex items-center gap-2 mt-4 mb-1">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Ad-hoc Tasks</span>
                <span className="text-[10px] text-faint">({reviewedTasks.length})</span>
              </div>
              {reviewedTasks.map(t => {
                const isEditing = editingTask === t.task_id;
                const taskStatusStyle: Record<string, string> = {
                  routed: "bg-starlight-blue/10 text-starlight-blue",
                  approved_overhead: "bg-starlight-green/10 text-starlight-green",
                  rejected: "bg-starlight-red/10 text-starlight-red",
                  in_progress: "bg-navy/10 text-navy",
                };
                const hourlyRate = person?.day_rate && person?.standard_day_hours && person.standard_day_hours > 0 ? person.day_rate / person.standard_day_hours : 0;
                return (
                  <div key={`task-${t.task_id}`} className={"card px-5 py-3.5 flex items-start gap-4 border-l-4 " + (t.status === "rejected" ? "border-l-red-300 opacity-50" : "border-l-starlight-amber/40")}>
                    <div className="w-20 shrink-0 text-center">
                      <p className="text-xs text-muted">
                        {t.worked_date ? new Date(t.worked_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : new Date(t.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </p>
                      {isEditing ? (
                        <div className="flex items-center gap-1 mt-1">
                          <input type="number" step="0.5" value={editTaskHours}
                            onChange={ev => setEditTaskHours(ev.target.value)}
                            onKeyDown={ev => { if (ev.key === "Enter") handleEditTask(t.task_id); if (ev.key === "Escape") setEditingTask(null); }}
                            autoFocus className="w-14 px-1 py-0.5 text-sm text-center border border-starlight-blue rounded" />
                          <button onClick={() => handleEditTask(t.task_id)} className="text-starlight-green"><CheckCircle2 className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <p className="text-lg font-semibold text-navy">{t.hours != null ? `${t.hours}h` : "—"}</p>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-starlight-amber/10 text-starlight-amber uppercase">Ad-hoc</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-surface-mid text-muted">{t.category.replace("_", " ")}</span>
                        <span className={"text-[10px] px-1.5 py-0.5 rounded font-medium " + (taskStatusStyle[t.status] || "bg-surface-mid text-muted")}>{t.status.replace("_", " ")}</span>
                      </div>
                      {isEditing ? (
                        <input type="text" value={editTaskTitle} onChange={ev => setEditTaskTitle(ev.target.value)}
                          onKeyDown={ev => { if (ev.key === "Enter") handleEditTask(t.task_id); if (ev.key === "Escape") setEditingTask(null); }}
                          className="w-full mt-1 px-2 py-1 text-sm border border-starlight-blue rounded focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                      ) : (
                        <p className="text-sm text-muted mt-0.5 leading-relaxed">{t.title}</p>
                      )}
                      {t.description && !isEditing && <p className="text-xs text-faint mt-0.5">{t.description}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                        {t.job_number && <span className="font-mono">{t.job_number} — {t.job_name}</span>}
                        {t.hours != null && hourlyRate > 0 && <span className="font-mono">{formatCurrency(t.hours * hourlyRate)}</span>}
                      </div>
                      {t.review_note && (
                        <div className="mt-2 flex items-start gap-2 bg-navy/5 rounded px-3 py-2">
                          <p className="text-xs text-muted leading-relaxed">PM note: {t.review_note}</p>
                        </div>
                      )}
                    </div>
                    {isAdmin && t.status !== "rejected" && !isEditing && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button onClick={() => { setEditingTask(t.task_id); setEditTaskHours(String(t.hours ?? "")); setEditTaskTitle(t.title || ""); }}
                          title="Edit task" className="p-1.5 text-faint hover:text-starlight-blue hover:bg-navy/10 rounded transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
          </>)}

          {/* BY DAY VIEW */}
          {viewMode === "by-day" && (() => {
            const visible = showArchived ? timeEntries : timeEntries.filter(e => !e.archived_at);
            const hourlyRate = person?.day_rate && person?.standard_day_hours && person.standard_day_hours > 0 ? person.day_rate / person.standard_day_hours : 0;
            const maxHours = person?.standard_day_hours || 10;

            // Build unified items with a common date key
            type DayItem = { _type: "wo"; data: TimeEntryRow } | { _type: "task"; data: PendingTask };
            const allItems: DayItem[] = [
              ...visible.map(e => ({ _type: "wo" as const, data: e })),
              ...reviewedTasks.map(t => ({ _type: "task" as const, data: t })),
            ];

            // Group by date
            const dayMap = new Map<string, { items: DayItem[]; totalHours: number }>();
            allItems.forEach(item => {
              let dateStr: string;
              if (item._type === "wo") {
                dateStr = item.data.system_start_timestamp ? item.data.system_start_timestamp.split("T")[0] : "unknown";
              } else {
                dateStr = item.data.worked_date || item.data.created_at.split("T")[0];
              }
              if (!dayMap.has(dateStr)) dayMap.set(dateStr, { items: [], totalHours: 0 });
              const day = dayMap.get(dateStr)!;
              day.items.push(item);
              const hrs = item._type === "wo" ? (item.data.actual_hours || 0) : (item.data.hours || 0);
              if (item._type === "wo" && (item.data as TimeEntryRow).archived_at) { /* don't count archived */ }
              else day.totalHours += hrs;
            });

            const sortedDays = [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

            if (sortedDays.length === 0) return <div className="card px-6 py-10 text-center text-muted text-sm">No activity recorded yet.</div>;

            const toggleDay = (d: string) => {
              setExpandedDays(prev => {
                const next = new Set(prev);
                if (next.has(d)) next.delete(d); else next.add(d);
                return next;
              });
            };

            return sortedDays.map(([dateStr, day]) => {
              const isExpanded = expandedDays.has(dateStr);
              const isOver = day.totalHours > maxHours;
              const dateObj = dateStr !== "unknown" ? new Date(dateStr + "T12:00:00") : null;
              const woCount = day.items.filter(i => i._type === "wo").length;
              const taskCount = day.items.filter(i => i._type === "task").length;
              const cost = day.totalHours * hourlyRate;

              return (
                <div key={dateStr} className="card overflow-hidden">
                  <button onClick={() => toggleDay(dateStr)}
                    className={"w-full px-5 py-3 flex items-center gap-4 text-left hover:bg-surface-dim transition-colors " + (isOver ? "bg-starlight-red/5" : "")}>
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted shrink-0" />}
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-semibold text-navy">
                        {dateObj ? dateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "Unknown"}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 flex-1">
                      <span className={"text-lg font-bold font-mono " + (isOver ? "text-starlight-red" : "text-navy")}>{Math.round(day.totalHours * 10) / 10}h</span>
                      {isOver && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-starlight-red/10 text-starlight-red">OVER {maxHours}h</span>}
                      <span className="text-xs text-muted">{woCount} WO entr{woCount !== 1 ? "ies" : "y"}{taskCount > 0 ? ` + ${taskCount} task${taskCount !== 1 ? "s" : ""}` : ""}</span>
                      {hourlyRate > 0 && <span className="text-xs text-muted font-mono ml-auto">{formatCurrency(cost)}</span>}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-subtle px-5 py-2 space-y-1.5">
                      {day.items.map((item, idx) => {
                        if (item._type === "wo") {
                          const e = item.data;
                          const isArchived = !!(e as TimeEntryRow).archived_at;
                          return (
                            <div key={`wo-${e.entry_id}`} className={"flex items-center gap-3 py-1.5 text-sm " + (isArchived ? "opacity-40 line-through" : "")}>
                              <span className="w-12 text-right font-mono font-semibold text-navy">{e.actual_hours != null ? `${e.actual_hours}h` : "—"}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-navy/10 text-navy">{e.activity_label || "WO"}</span>
                              <span className="text-muted truncate flex-1">{e.scope_name || e.wo_description || "—"}</span>
                              {e.job_number && <span className="text-xs text-muted font-mono shrink-0">{e.job_number}</span>}
                              {e.entry_cost != null && <span className="text-xs text-muted font-mono shrink-0">{formatCurrency(e.entry_cost)}</span>}
                              {e.flag_note && <Flag className="h-3 w-3 text-starlight-amber shrink-0" />}
                            </div>
                          );
                        } else {
                          const t = item.data;
                          const taskCost = (t.hours || 0) * hourlyRate;
                          return (
                            <div key={`task-${t.task_id}`} className={"flex items-center gap-3 py-1.5 text-sm " + (t.status === "rejected" ? "opacity-40 line-through" : "")}>
                              <span className="w-12 text-right font-mono font-semibold text-navy">{t.hours != null ? `${t.hours}h` : "—"}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-starlight-amber/10 text-starlight-amber">Ad-hoc</span>
                              <span className="text-muted truncate flex-1">{t.title}</span>
                              {t.job_number && <span className="text-xs text-muted font-mono shrink-0">{t.job_number}</span>}
                              {hourlyRate > 0 && <span className="text-xs text-muted font-mono shrink-0">{formatCurrency(taskCost)}</span>}
                            </div>
                          );
                        }
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* TAB: Bookings */}
      {activeTab === "bookings" && (
        <div className="space-y-2">
          {bookings.length === 0 ? (
            <div className="card px-6 py-10 text-center text-muted text-sm">No bookings in the last 30 days or upcoming.</div>
          ) : (
            bookings.map(b => (
              <div key={b.schedule_id} className="card px-5 py-3.5 flex items-center gap-4">
                <div className="w-20 shrink-0 text-center">
                  <p className="text-sm font-semibold text-navy">
                    {new Date(b.scheduled_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                  <p className="text-[10px] text-muted">
                    {new Date(b.scheduled_date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" })}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  {b.job_name ? (
                    <Link href={`/jobs/${b.job_id}`} className="text-sm font-medium text-navy hover:text-starlight-blue transition-colors">
                      {b.job_number} — {b.job_name}
                    </Link>
                  ) : b.status === "Unavailable" ? (
                    <p className="text-sm text-muted">{b.unavailable_reason || "Unavailable"}</p>
                  ) : (
                    <p className="text-sm text-muted">—</p>
                  )}
                  {b.notes && <p className="text-xs text-muted mt-0.5">{b.notes}</p>}
                </div>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(b.status)}`}>
                  {b.status || "—"}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Route to WO Modal */}
      {routingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setRoutingTask(null)} />
          <div className="relative bg-surface rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-navy">Route Task to Work Order</h3>
            <p className="text-sm text-muted">{routingTask.title} — {person?.freelancer_name}</p>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
              <input type="text" value={woSearch} onChange={(e) => setWoSearch(e.target.value)} placeholder="Search work orders..."
                className="w-full pl-10 pr-4 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
            </div>
            <div className="border border-subtle rounded-lg max-h-48 overflow-y-auto divide-y divide-subtle">
              {filteredWos.length === 0 ? (<p className="text-sm text-muted p-4 text-center">No matching work orders</p>) : (
                filteredWos.slice(0, 20).map((wo) => (
                  <button key={wo.work_order_id} onClick={() => setSelectedWo(wo.work_order_id)}
                    className={"w-full text-left px-4 py-3 hover:bg-surface-dim transition-colors " + (selectedWo === wo.work_order_id ? "bg-starlight-blue/5 border-l-2 border-l-starlight-blue" : "")}>
                    <p className="text-sm text-navy">{wo.description || wo.scope_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted">
                      <span className="font-mono">{wo.job_number}</span><span>{wo.scope_name}</span>
                      <span className={"px-1.5 py-0.5 rounded-full font-medium " + (wo.status === "In-Progress" ? "bg-starlight-blue/10 text-starlight-blue" : "bg-surface-mid text-muted")}>{wo.status}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Hours</label>
                <input type="number" value={routeHours} onChange={(e) => setRouteHours(e.target.value)} step="0.5"
                  className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
                {routingTask.hours && routeHours && parseFloat(routeHours) !== routingTask.hours && (
                  <p className="text-[10px] text-starlight-amber mt-1">Claimed: {routingTask.hours}h</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Note (optional)</label>
                <input type="text" value={routeNote} onChange={(e) => setRouteNote(e.target.value)} placeholder="Note to freelancer..."
                  className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRoutingTask(null)} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg">Cancel</button>
              <button onClick={handleRouteToWO} disabled={!selectedWo || routeSubmitting}
                className="px-4 py-2 text-sm font-medium bg-starlight-blue text-white rounded-lg hover:bg-starlight-blue/90 disabled:opacity-40">
                {routeSubmitting ? "Routing..." : "Route & Create Entry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
