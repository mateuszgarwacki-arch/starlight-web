"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency, statusClass } from "@/lib/utils";
import { formatHours } from "@/lib/format-hours";
import { isTruthy } from "@/lib/types";
import type { Freelancer } from "@/lib/types";
import { getAuditContext, auditedUpdate, auditedInsert, auditedArchive } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { ArrowLeft, Phone, Mail, Briefcase, Clock, Flag, Calendar, AlertTriangle, CheckCircle2, Pencil, Archive, X, Square, Users, CornerDownRight, Check, Search, ChevronDown, ChevronRight, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { JobWorkOrderPicker, type WOOption as WOPick } from "@/components/job-work-order-picker";

interface TimeEntryRow {
  entry_id: number;
  work_order_id: number;
  actual_hours: number | null;
  flag_note: string | null;
  system_start_timestamp: string | null;
  system_end_timestamp: string | null;
  actual_start_timestamp: string | null;
  actual_end_timestamp: string | null;
  timestamp_edited_flag: boolean | null;
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
  started_at: string | null;
  status: string;
  review_note?: string | null;
  routed_to_wo_id?: number | null;
  photo_urls_parsed?: string[];  // Parsed from tbl_tasks.photo_urls (JSON text)
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
  const [viewMode, setViewMode] = useState<"log" | "by-day">("by-day");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [editingEntry, setEditingEntry] = useState<number | null>(null);
  const [editHoursValue, setEditHoursValue] = useState("");
  const [editDateValue, setEditDateValue] = useState("");
  const [editFlagValue, setEditFlagValue] = useState("");
  const [archivingEntry, setArchivingEntry] = useState<number | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [stoppingEntry, setStoppingEntry] = useState<number | null>(null);
  const [stopHours, setStopHours] = useState("");

  // Tasks state (all statuses)
  const [allTasks, setAllTasks] = useState<PendingTask[]>([]);
  const [routingTask, setRoutingTask] = useState<PendingTask | null>(null);
  const [routeSelectedWo, setRouteSelectedWo] = useState<WOPick | null>(null);
  const [routeHours, setRouteHours] = useState("");
  const [routeNote, setRouteNote] = useState("");
  const [routeSubmitting, setRouteSubmitting] = useState(false);
  const [rejectingTask, setRejectingTask] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [editTaskHours, setEditTaskHours] = useState("");
  const [editTaskTitle, setEditTaskTitle] = useState("");

  // Add entry dialog
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [addEntryType, setAddEntryType] = useState<"wo" | "adhoc">("wo");
  const [addEntryDate, setAddEntryDate] = useState("");
  const [addEntryHours, setAddEntryHours] = useState("1");
  const [addSelectedWo, setAddSelectedWo] = useState<WOPick | null>(null);
  const [addEntryTitle, setAddEntryTitle] = useState("");
  const [addEntryCategory, setAddEntryCategory] = useState("job_work");
  const [addEntryNote, setAddEntryNote] = useState("");
  const [addEntrySubmitting, setAddEntrySubmitting] = useState(false);
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
      .select("entry_id, work_order_id, actual_hours, flag_note, system_start_timestamp, system_end_timestamp, actual_start_timestamp, actual_end_timestamp, timestamp_edited_flag, entry_cost, archived_at, archive_reason")
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
      .select("task_id, title, description, category, hours, worked_date, job_id, created_at, started_at, status, review_note, routed_to_wo_id, photo_urls")
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
        photo_urls_parsed: (() => {
          // photo_urls is JSON-stringified array in tbl_tasks.photo_urls (text column).
          // Parse defensively — a single bad row shouldn't blow up the whole list.
          if (!t.photo_urls) return [];
          try {
            const parsed = JSON.parse(t.photo_urls);
            return Array.isArray(parsed) ? parsed.filter((u: any) => typeof u === "string") : [];
          } catch { return []; }
        })(),
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

  // Admin: Edit entry (hours, date, flag)
  const handleEditEntry = async (entryId: number) => {
    const hours = parseFloat(editHoursValue);
    if (isNaN(hours) || hours < 0) { toast.error("Invalid hours"); return; }
    const entry = timeEntries.find(e => e.entry_id === entryId);
    const rate = person?.day_rate && person?.standard_day_hours ? person.day_rate / person.standard_day_hours : 0;
    const newCost = Math.round(hours * rate * 100) / 100;

    const updates: Record<string, any> = { actual_hours: hours, entry_cost: newCost };
    // Update date if changed. We shift the entry to the new date while
    // preserving the original time-of-day on BOTH start and end timestamps,
    // so the stored times remain coherent (end > start, durations intact).
    // If the original entry had no start timestamp (very rare), fall back to
    // a sensible 09:00 default just for the start.
    let newStartTimestamp: string | null = entry?.system_start_timestamp || null;
    if (editDateValue && entry) {
      const origStart = entry.system_start_timestamp ? new Date(entry.system_start_timestamp) : null;
      const origEnd   = entry.system_end_timestamp   ? new Date(entry.system_end_timestamp)   : null;
      // Build new start by grafting the new date onto the original time-of-day.
      // Using plain string concatenation (no Z suffix) keeps this in local time
      // and avoids the BST date-shift pitfall Claude has hit before.
      const timeOfDay = origStart
        ? `${String(origStart.getHours()).padStart(2, "0")}:${String(origStart.getMinutes()).padStart(2, "0")}:${String(origStart.getSeconds()).padStart(2, "0")}`
        : "09:00:00";
      const newStartStr = `${editDateValue}T${timeOfDay}`;
      updates.system_start_timestamp = newStartStr;
      updates.actual_start_timestamp = newStartStr;
      newStartTimestamp = newStartStr;

      // Shift end by the same number of days so duration is preserved.
      if (origStart && origEnd) {
        const deltaMs = new Date(newStartStr).getTime() - origStart.getTime();
        const newEnd = new Date(origEnd.getTime() + deltaMs);
        // Reformat as local ISO without Z.
        const pad = (n: number) => String(n).padStart(2, "0");
        const newEndStr = `${newEnd.getFullYear()}-${pad(newEnd.getMonth() + 1)}-${pad(newEnd.getDate())}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}:${pad(newEnd.getSeconds())}`;
        updates.system_end_timestamp = newEndStr;
        updates.actual_end_timestamp = newEndStr;
      }
      // Mark that timestamps were manually edited so the "edited" badge appears.
      updates.timestamp_edited_flag = true;
    }
    // Update flag_note
    updates.flag_note = editFlagValue.trim() || null;

    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_wo_time_entries", entryId, updates, entry?.job_id);

    setTimeEntries(prev => prev.map(e => e.entry_id === entryId ? {
      ...e, actual_hours: hours, entry_cost: newCost,
      flag_note: editFlagValue.trim() || null,
      system_start_timestamp: updates.system_start_timestamp ?? e.system_start_timestamp,
      system_end_timestamp:   updates.system_end_timestamp   ?? e.system_end_timestamp,
      actual_start_timestamp: updates.actual_start_timestamp ?? e.actual_start_timestamp,
      actual_end_timestamp:   updates.actual_end_timestamp   ?? e.actual_end_timestamp,
      timestamp_edited_flag:  updates.timestamp_edited_flag  ?? e.timestamp_edited_flag,
    } : e));
    setEditingEntry(null);
    toast.success("Entry updated");
  };

  // Admin: Archive entry
  const handleArchive = async (entryId: number) => {
    if (!archiveReason.trim()) { toast.error("Reason required"); return; }
    const ctx = await getAuditContext(supabase);
    const entry = timeEntries.find(e => e.entry_id === entryId);

    const result = await auditedArchive(
      ctx,
      "tbl_wo_time_entries",
      entryId,
      archiveReason.trim(),
      entry?.job_id ?? null,
    );
    if (!result.success) { toast.error(result.error || "Archive failed"); return; }

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
    toast.success(`Timer stopped — ${formatHours(hours)} logged`);
  };

  // ============================================================
  // Task Actions (approve / reject / route to WO)
  // ============================================================
  const openRouteModal = (task: PendingTask) => {
    setRoutingTask(task);
    setRouteHours(String(task.hours || ""));
    setRouteNote("");
    setRouteSelectedWo(null); // picker initial-selects from task.routed_to_wo_id
  };

  const handleRouteToWO = async () => {
    if (!routingTask || !routeSelectedWo) return;
    const hrs = parseFloat(routeHours); if (!hrs || hrs <= 0) { toast.error("Enter valid hours"); return; }
    setRouteSubmitting(true);
    try {
      const ctx = await getAuditContext(supabase);
      const wo = routeSelectedWo;
      const hourlyRate = person?.day_rate && person?.standard_day_hours && person.standard_day_hours > 0 ? person.day_rate / person.standard_day_hours : 0;
      await auditedInsert(ctx, "tbl_wo_time_entries", {
        work_order_id: wo.work_order_id, freelancer_id: freelancerId,
        actual_hours: hrs, applied_hourly_rate: hourlyRate, entry_cost: hrs * hourlyRate,
        system_start_timestamp: routingTask.worked_date ? routingTask.worked_date + "T09:00:00" : null,
        actual_start_timestamp: routingTask.worked_date ? routingTask.worked_date + "T09:00:00" : null,
        system_end_timestamp: routingTask.worked_date ? routingTask.worked_date + "T17:00:00" : null,
        actual_end_timestamp: routingTask.worked_date ? routingTask.worked_date + "T17:00:00" : null,
        flag_note: routeNote.trim() ? `Routed: ${routeNote.trim()}` : wo.is_overhead ? "Routed to job overhead" : "Routed from ad-hoc task",
      }, wo.job_id);
      await supabase.from("tbl_tasks").update({
        status: "routed", routed_to_wo_id: wo.work_order_id, routed_hours: hrs,
        reviewed_by: ctx.userId, reviewed_at: new Date().toISOString(), review_note: routeNote || null,
      }).eq("task_id", routingTask.task_id);
      await notify({ supabase, type: "task_reviewed", title: `Task routed: ${routingTask.title}`, detail: `${formatHours(hrs)} routed to WO — ${routeNote || "No note"}`, severity: "info", freelancerId, woId: wo.work_order_id, jobId: wo.job_id });
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

  // Open add entry dialog
  const openAddEntry = () => {
    const d = new Date();
    setAddEntryDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    setAddEntryHours("1"); setAddSelectedWo(null); setAddEntryTitle(""); setAddEntryCategory("job_work"); setAddEntryNote(""); setAddEntryType("wo");
    setShowAddEntry(true);
  };

  const handleAddEntry = async () => {
    const hrs = parseFloat(addEntryHours);
    if (isNaN(hrs) || hrs <= 0) { toast.error("Enter valid hours"); return; }
    if (!addEntryDate) { toast.error("Pick a date"); return; }
    setAddEntrySubmitting(true);
    try {
      const ctx = await getAuditContext(supabase);
      if (addEntryType === "wo") {
        if (!addSelectedWo) { toast.error("Pick a work order"); setAddEntrySubmitting(false); return; }
        const wo = addSelectedWo;
        const hourlyRate = person?.day_rate && person?.standard_day_hours && person.standard_day_hours > 0 ? person.day_rate / person.standard_day_hours : 0;
        await auditedInsert(ctx, "tbl_wo_time_entries", {
          work_order_id: wo.work_order_id, freelancer_id: freelancerId,
          actual_hours: hrs, applied_hourly_rate: hourlyRate, entry_cost: Math.round(hrs * hourlyRate * 100) / 100,
          system_start_timestamp: addEntryDate + "T09:00:00",
          actual_start_timestamp: addEntryDate + "T09:00:00",
          system_end_timestamp: addEntryDate + "T17:00:00",
          actual_end_timestamp: addEntryDate + "T17:00:00",
          flag_note: addEntryNote.trim() ? `PM added: ${addEntryNote.trim()}` : "PM added manually",
        }, wo.job_id);
        toast.success(`${formatHours(hrs)} WO entry created`);
      } else {
        if (!addEntryTitle.trim()) { toast.error("Enter a title"); setAddEntrySubmitting(false); return; }
        await supabase.from("tbl_tasks").insert({
          freelancer_id: freelancerId, title: addEntryTitle.trim(), description: addEntryNote.trim() || null,
          category: addEntryCategory, hours: hrs, worked_date: addEntryDate, status: "approved_overhead",
          reviewed_by: ctx.userId, reviewed_at: new Date().toISOString(), review_note: "PM added manually",
        });
        toast.success(`${formatHours(hrs)} ad-hoc task created`);
      }
      setShowAddEntry(false);
      loadData();
    } catch { toast.error("Failed to add entry"); }
    setAddEntrySubmitting(false);
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
          <p className="text-lg font-semibold text-navy">{formatHours(stats.totalHours)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Last 30 Days</p>
          <p className="text-lg font-semibold text-navy">{formatHours(stats.last30Hours)}</p>
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
                      <p className="text-lg font-bold text-navy font-mono">{formatHours(elapsed)}</p>
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
                      {task.hours != null && <span className="text-sm font-semibold text-navy">{formatHours(task.hours)}</span>}
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
          <Clock className="h-4 w-4" /> Activity ({timeEntries.filter(e => !e.archived_at).length + reviewedTasks.filter(t => t.status !== "rejected").length})
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
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-surface-mid rounded-lg p-0.5">
                  <button onClick={() => setViewMode("by-day")}
                    className={"px-3 py-1 text-xs font-medium rounded-md transition-colors " + (viewMode === "by-day" ? "bg-surface text-navy shadow-sm" : "text-muted hover:text-navy")}>
                    By Day
                  </button>
                  <button onClick={() => setViewMode("log")}
                    className={"px-3 py-1 text-xs font-medium rounded-md transition-colors " + (viewMode === "log" ? "bg-surface text-navy shadow-sm" : "text-muted hover:text-navy")}>
                    Log
                  </button>
                </div>
                <button onClick={openAddEntry}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-starlight-blue/10 text-starlight-blue rounded-lg hover:bg-starlight-blue/20 transition-colors">
                  <Plus className="h-3 w-3" /> Add Entry
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
                  className="rounded border-subtle" />
                Show archived ({timeEntries.filter(e => e.archived_at).length})
              </label>
            </div>
          )}
          {viewMode === "log" && (<>
          {(() => {
            const visible = showArchived ? timeEntries : timeEntries.filter(e => !e.archived_at);
            if (visible.length === 0 && reviewedTasks.length === 0) return <div className="card px-6 py-10 text-center text-muted text-sm">No activity recorded yet.</div>;
            return visible.map(e => {
              const isArchived = !!e.archived_at;
              return (
              <div key={e.entry_id} className={`card px-5 py-3.5 ${e.flag_note && !isArchived ? "border-l-4 border-l-starlight-amber" : ""} ${isArchived ? "opacity-40 border-l-4 border-l-red-300" : ""}`}>
              <div className="flex items-start gap-4">
                {/* Date */}
                <div className="w-20 shrink-0 text-center">
                  <p className="text-xs text-muted">
                    {e.system_start_timestamp ? new Date(e.system_start_timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                  </p>
                  <p className="text-[9px] text-faint">
                    {e.system_start_timestamp ? new Date(e.system_start_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}
                    {e.system_end_timestamp ? " → " + new Date(e.system_end_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                  {e.timestamp_edited_flag && (
                    <span className="inline-block mt-0.5 text-[8px] px-1 py-0 rounded bg-starlight-amber/15 text-starlight-amber">edited</span>
                  )}
                  {editingEntry === e.entry_id ? (
                    <p className="text-lg font-semibold text-starlight-blue">{formatHours(parseFloat(editHoursValue) || 0)}</p>
                  ) : (
                    <p className={`text-lg font-semibold text-navy ${isArchived ? "line-through" : ""}`}>{e.actual_hours != null ? formatHours(e.actual_hours) : "—"}</p>
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
                    <button onClick={() => {
                        setEditingEntry(e.entry_id);
                        setEditHoursValue(String(e.actual_hours ?? ""));
                        setEditDateValue(e.system_start_timestamp ? e.system_start_timestamp.split("T")[0] : "");
                        setEditFlagValue(e.flag_note || "");
                      }}
                      title="Edit entry" className="p-1.5 text-faint hover:text-starlight-blue hover:bg-navy/10 rounded transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { setArchivingEntry(e.entry_id); setArchiveReason(""); }}
                      title="Archive entry" className="p-1.5 text-faint hover:text-starlight-red hover:bg-starlight-red/10 rounded transition-colors">
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {isAdmin && isArchived && (
                  <button onClick={async () => {
                    const ctx = await getAuditContext(supabase);
                    await supabase.from("tbl_wo_time_entries").update({ archived_at: null, archived_by: null, archive_reason: null }).eq("entry_id", e.entry_id);
                    setTimeEntries(prev => prev.map(x => x.entry_id === e.entry_id ? { ...x, archived_at: null } : x));
                    toast.success("Entry restored");
                  }} className="px-3 py-1.5 text-xs font-medium bg-starlight-green/10 text-starlight-green rounded-lg hover:bg-starlight-green/20 transition-colors shrink-0">
                    <RotateCcw className="h-3 w-3 inline mr-1" />Restore
                  </button>
                )}
                </div>
                {editingEntry === e.entry_id && (
                  <div className="w-full mt-3 pt-3 border-t border-subtle">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-28">
                        <label className="text-[9px] text-muted block mb-0.5">Date</label>
                        <input type="date" value={editDateValue} onChange={ev => setEditDateValue(ev.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-starlight-blue rounded focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                      </div>
                      <div className="w-20">
                        <label className="text-[9px] text-muted block mb-0.5">Hours</label>
                        <input type="number" step="0.5" value={editHoursValue} onChange={ev => setEditHoursValue(ev.target.value)}
                          onKeyDown={ev => { if (ev.key === "Enter") handleEditEntry(e.entry_id); if (ev.key === "Escape") setEditingEntry(null); }}
                          autoFocus className="w-full px-2 py-1.5 text-xs text-center border border-starlight-blue rounded focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                      </div>
                      <div className="flex-1 min-w-[180px]">
                        <label className="text-[9px] text-muted block mb-0.5">Flag / Note</label>
                        <input type="text" value={editFlagValue} onChange={ev => setEditFlagValue(ev.target.value)}
                          onKeyDown={ev => { if (ev.key === "Enter") handleEditEntry(e.entry_id); if (ev.key === "Escape") setEditingEntry(null); }}
                          placeholder="Flag note..."
                          className="w-full px-2 py-1.5 text-xs border border-starlight-blue rounded focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                      </div>
                      <button onClick={() => handleEditEntry(e.entry_id)}
                        className="px-3 py-1.5 bg-starlight-blue text-white text-xs font-medium rounded hover:bg-starlight-blue/90 shrink-0">Save</button>
                      <button onClick={() => setEditingEntry(null)}
                        className="px-2 py-1.5 text-xs text-muted hover:text-foreground shrink-0">Cancel</button>
                    </div>
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
                        <p className="text-lg font-semibold text-navy">{t.hours != null ? formatHours(t.hours) : "—"}</p>
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
                      {(t.photo_urls_parsed && t.photo_urls_parsed.length > 0) && (
                        <div className="flex gap-1.5 mt-2">
                          {t.photo_urls_parsed.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                               className="block w-14 h-14 rounded border border-subtle overflow-hidden bg-surface-mid hover:ring-2 hover:ring-starlight-blue transition-all">
                              <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover"
                                   onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; (ev.target as HTMLImageElement).parentElement!.innerHTML = '<div class=\"w-full h-full flex items-center justify-center text-faint text-[10px]\">img</div>'; }} />
                            </a>
                          ))}
                        </div>
                      )}
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
                        <button onClick={async () => {
                          const ctx = await getAuditContext(supabase);
                          await supabase.from("tbl_tasks").update({ status: "rejected", reviewed_by: ctx.userId, reviewed_at: new Date().toISOString(), review_note: "Archived by PM" }).eq("task_id", t.task_id);
                          setAllTasks(prev => prev.map(x => x.task_id === t.task_id ? { ...x, status: "rejected", review_note: "Archived by PM" } : x));
                          toast.success("Task archived");
                        }}
                          title="Archive task" className="p-1.5 text-faint hover:text-starlight-red hover:bg-starlight-red/10 rounded transition-colors">
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {isAdmin && t.status === "rejected" && (
                      <button onClick={async () => {
                        await supabase.from("tbl_tasks").update({ status: "approved_overhead", review_note: "Restored by PM" }).eq("task_id", t.task_id);
                        setAllTasks(prev => prev.map(x => x.task_id === t.task_id ? { ...x, status: "approved_overhead", review_note: "Restored by PM" } : x));
                        toast.success("Task restored");
                      }} className="px-3 py-1.5 text-xs font-medium bg-starlight-green/10 text-starlight-green rounded-lg hover:bg-starlight-green/20 transition-colors shrink-0">
                        <RotateCcw className="h-3 w-3 inline mr-1" />Restore
                      </button>
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
              ...reviewedTasks.filter(t => t.status !== "routed" && (showArchived || t.status !== "rejected")).map(t => ({ _type: "task" as const, data: t })),
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

            // Sort days: "unknown" (entries without a date) floats to the top so
            // Mateusz can triage them first; everything else reverse chronological.
            const sortedDays = [...dayMap.entries()].sort((a, b) => {
              if (a[0] === "unknown" && b[0] !== "unknown") return -1;
              if (b[0] === "unknown" && a[0] !== "unknown") return 1;
              return b[0].localeCompare(a[0]);
            });

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
                      <span className={"text-lg font-bold font-mono " + (isOver ? "text-starlight-red" : "text-navy")}>{formatHours(day.totalHours)}</span>
                      {isOver && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-starlight-red/10 text-starlight-red">OVER {formatHours(maxHours)}</span>}
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
                          const isEditingThis = editingEntry === e.entry_id;
                          const isArchivingThis = archivingEntry === e.entry_id;
                          return (
                            <div key={`wo-${e.entry_id}`}>
                              <div className={"flex items-center gap-3 py-1.5 text-sm " + (isArchived ? "opacity-40 line-through" : "")}>
                                {isEditingThis ? (
                                  <div className="w-16 flex items-center gap-0.5">
                                    <input type="number" step="0.25" value={editHoursValue}
                                      onChange={ev => setEditHoursValue(ev.target.value)}
                                      onKeyDown={ev => { if (ev.key === "Enter") handleEditEntry(e.entry_id); if (ev.key === "Escape") setEditingEntry(null); }}
                                      autoFocus className="w-14 px-1 py-0.5 text-xs text-center border border-starlight-blue rounded" />
                                  </div>
                                ) : (
                                  <span className="w-16 text-right font-mono font-semibold text-navy">{e.actual_hours != null ? formatHours(e.actual_hours) : "—"}</span>
                                )}
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-navy/10 text-navy">{e.activity_label || "WO"}</span>
                                <span className="text-muted truncate flex-1">{e.scope_name || e.wo_description || "—"}</span>
                                {e.job_number && <span className="text-xs text-muted font-mono shrink-0">{e.job_number}</span>}
                                {e.entry_cost != null && <span className="text-xs text-muted font-mono shrink-0">{formatCurrency(e.entry_cost)}</span>}
                                {e.flag_note && <Flag className="h-3 w-3 text-starlight-amber shrink-0" />}
                                {isAdmin && !isArchived && !isEditingThis && !isArchivingThis && (
                                  <div className="flex gap-0.5 shrink-0">
                                    <button onClick={() => { setEditingEntry(e.entry_id); setEditHoursValue(String(e.actual_hours ?? "")); setEditDateValue(e.system_start_timestamp ? e.system_start_timestamp.split("T")[0] : ""); setEditFlagValue(e.flag_note || ""); }}
                                      title="Edit" className="p-1 text-faint hover:text-starlight-blue hover:bg-navy/10 rounded transition-colors"><Pencil className="h-3 w-3" /></button>
                                    <button onClick={() => { setArchivingEntry(e.entry_id); setArchiveReason(""); }}
                                      title="Archive" className="p-1 text-faint hover:text-starlight-red hover:bg-starlight-red/10 rounded transition-colors"><Archive className="h-3 w-3" /></button>
                                  </div>
                                )}
                                {isEditingThis && (
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => handleEditEntry(e.entry_id)} className="px-2 py-1 bg-starlight-blue text-white text-[10px] font-medium rounded">Save</button>
                                    <button onClick={() => setEditingEntry(null)} className="px-2 py-1 text-[10px] text-muted">Cancel</button>
                                  </div>
                                )}
                                {isAdmin && isArchived && (
                                  <button onClick={async () => {
                                    await supabase.from("tbl_wo_time_entries").update({ archived_at: null, archived_by: null, archive_reason: null }).eq("entry_id", e.entry_id);
                                    setTimeEntries(prev => prev.map(x => x.entry_id === e.entry_id ? { ...x, archived_at: null } : x));
                                    toast.success("Entry restored");
                                  }} className="px-2 py-1 text-[10px] font-medium bg-starlight-green/10 text-starlight-green rounded hover:bg-starlight-green/20 shrink-0">
                                    <RotateCcw className="h-3 w-3 inline mr-0.5" />Restore
                                  </button>
                                )}
                              </div>
                              {/* Detail strip — shown when there's anything worth seeing.
                                  Tight, muted, indented under the summary row. Omits
                                  entirely when nothing is recorded beyond the summary. */}
                              {(() => {
                                const hasTimes = e.system_start_timestamp || e.system_end_timestamp;
                                const hasFlag = !!e.flag_note;
                                const hasArchive = isArchived && e.archive_reason;
                                if (!hasTimes && !hasFlag && !hasArchive) return null;
                                const fmt = (ts: string | null) => ts ? new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
                                return (
                                  <div className="ml-16 mb-1 text-[11px] text-muted leading-relaxed space-y-0.5">
                                    {hasTimes && (
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-3 w-3 text-faint shrink-0" />
                                        <span>{fmt(e.system_start_timestamp)} → {fmt(e.system_end_timestamp)}</span>
                                        {e.timestamp_edited_flag && <span className="text-[9px] px-1 py-0 rounded bg-starlight-amber/15 text-starlight-amber">edited</span>}
                                      </div>
                                    )}
                                    {hasFlag && (
                                      <div className="flex items-start gap-2 text-starlight-amber">
                                        <Flag className="h-3 w-3 shrink-0 mt-0.5" />
                                        <span className="break-words">{e.flag_note}</span>
                                      </div>
                                    )}
                                    {hasArchive && (
                                      <div className="flex items-start gap-2 text-starlight-red">
                                        <Archive className="h-3 w-3 shrink-0 mt-0.5" />
                                        <span className="break-words">Archived: {e.archive_reason}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {isEditingThis && (
                                <div className="ml-16 mt-1 mb-1 p-2 bg-starlight-blue/5 border border-starlight-blue/20 rounded flex flex-wrap items-end gap-2">
                                  <div>
                                    <label className="text-[9px] text-muted block mb-0.5">Date</label>
                                    <input type="date" value={editDateValue}
                                      onChange={ev => setEditDateValue(ev.target.value)}
                                      onKeyDown={ev => { if (ev.key === "Enter") handleEditEntry(e.entry_id); if (ev.key === "Escape") setEditingEntry(null); }}
                                      className="px-2 py-1 text-xs border border-starlight-blue/40 rounded focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                                  </div>
                                  <div className="flex-1 min-w-[140px]">
                                    <label className="text-[9px] text-muted block mb-0.5">Flag / Note</label>
                                    <input type="text" value={editFlagValue}
                                      onChange={ev => setEditFlagValue(ev.target.value)}
                                      onKeyDown={ev => { if (ev.key === "Enter") handleEditEntry(e.entry_id); if (ev.key === "Escape") setEditingEntry(null); }}
                                      placeholder="Flag note..."
                                      className="w-full px-2 py-1 text-xs border border-starlight-blue/40 rounded focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                                  </div>
                                </div>
                              )}
                              {isArchivingThis && (
                                <div className="ml-16 mt-1 mb-1 p-2 bg-starlight-red/10 border border-starlight-red/20 rounded flex items-center gap-2">
                                  <input type="text" value={archiveReason} onChange={ev => setArchiveReason(ev.target.value)}
                                    onKeyDown={ev => { if (ev.key === "Enter") handleArchive(e.entry_id); if (ev.key === "Escape") setArchivingEntry(null); }}
                                    placeholder="Reason..." autoFocus className="flex-1 px-2 py-1 text-xs border border-starlight-red/20 rounded focus:outline-none" />
                                  <button onClick={() => handleArchive(e.entry_id)} className="text-xs px-2 py-1 bg-starlight-red text-white rounded">Archive</button>
                                  <button onClick={() => setArchivingEntry(null)} className="text-xs text-muted">Cancel</button>
                                </div>
                              )}
                            </div>
                          );
                        } else {
                          const t = item.data;
                          const taskCost = (t.hours || 0) * hourlyRate;
                          const isEditingThisTask = editingTask === t.task_id;
                          return (
                            <div key={`task-${t.task_id}`}>
                              <div className={"flex items-center gap-3 py-1.5 text-sm " + (t.status === "rejected" ? "opacity-40 line-through" : "")}>
                                {isEditingThisTask ? (
                                  <div className="w-16 flex items-center">
                                    <input type="number" step="0.25" value={editTaskHours}
                                      onChange={ev => setEditTaskHours(ev.target.value)}
                                      onKeyDown={ev => { if (ev.key === "Enter") handleEditTask(t.task_id); if (ev.key === "Escape") setEditingTask(null); }}
                                      autoFocus className="w-14 px-1 py-0.5 text-xs text-center border border-starlight-blue rounded" />
                                  </div>
                                ) : (
                                  <span className="w-16 text-right font-mono font-semibold text-navy">{t.hours != null ? formatHours(t.hours) : "—"}</span>
                                )}
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-starlight-amber/10 text-starlight-amber">Ad-hoc</span>
                                {isEditingThisTask ? (
                                  <input type="text" value={editTaskTitle} onChange={ev => setEditTaskTitle(ev.target.value)}
                                    onKeyDown={ev => { if (ev.key === "Enter") handleEditTask(t.task_id); if (ev.key === "Escape") setEditingTask(null); }}
                                    className="flex-1 px-2 py-0.5 text-sm border border-starlight-blue rounded focus:outline-none min-w-0" />
                                ) : (
                                  <span className="text-muted truncate flex-1">{t.title}</span>
                                )}
                                {!isEditingThisTask && t.job_number && <span className="text-xs text-muted font-mono shrink-0">{t.job_number}</span>}
                                {!isEditingThisTask && hourlyRate > 0 && <span className="text-xs text-muted font-mono shrink-0">{formatCurrency(taskCost)}</span>}
                                {isAdmin && t.status !== "rejected" && !isEditingThisTask && (
                                  <div className="flex gap-0.5 shrink-0">
                                    <button onClick={() => { setEditingTask(t.task_id); setEditTaskHours(String(t.hours ?? "")); setEditTaskTitle(t.title || ""); }}
                                      title="Edit" className="p-1 text-faint hover:text-starlight-blue hover:bg-navy/10 rounded transition-colors"><Pencil className="h-3 w-3" /></button>
                                    <button onClick={async (ev) => {
                                      ev.stopPropagation();
                                      const ctx = await getAuditContext(supabase);
                                      await supabase.from("tbl_tasks").update({ status: "rejected", reviewed_by: ctx.userId, reviewed_at: new Date().toISOString(), review_note: "Archived by PM" }).eq("task_id", t.task_id);
                                      setAllTasks(prev => prev.map(x => x.task_id === t.task_id ? { ...x, status: "rejected", review_note: "Archived by PM" } : x));
                                      toast.success("Task archived");
                                    }} title="Archive" className="p-1 text-faint hover:text-starlight-red hover:bg-starlight-red/10 rounded transition-colors"><Archive className="h-3 w-3" /></button>
                                  </div>
                                )}
                                {isEditingThisTask && (
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => handleEditTask(t.task_id)} className="px-2 py-1 bg-starlight-blue text-white text-[10px] font-medium rounded">Save</button>
                                    <button onClick={() => setEditingTask(null)} className="px-2 py-1 text-[10px] text-muted">Cancel</button>
                                  </div>
                                )}
                                {isAdmin && t.status === "rejected" && (
                                  <button onClick={async () => {
                                    await supabase.from("tbl_tasks").update({ status: "approved_overhead", review_note: "Restored by PM" }).eq("task_id", t.task_id);
                                    setAllTasks(prev => prev.map(x => x.task_id === t.task_id ? { ...x, status: "approved_overhead", review_note: "Restored by PM" } : x));
                                    toast.success("Task restored");
                                  }} className="px-2 py-1 text-[10px] font-medium bg-starlight-green/10 text-starlight-green rounded hover:bg-starlight-green/20 shrink-0">
                                    <RotateCcw className="h-3 w-3 inline mr-0.5" />Restore
                                  </button>
                                )}
                              </div>
                              {/* Task detail strip — description, category, photos, review note */}
                              {(() => {
                                const photos = t.photo_urls_parsed || [];
                                const hasDesc = !isEditingThisTask && !!t.description;
                                const hasReview = !!t.review_note;
                                const hasPhotos = photos.length > 0;
                                const hasStarted = !!t.started_at;
                                if (!hasDesc && !hasReview && !hasPhotos && !hasStarted) return null;
                                return (
                                  <div className="ml-16 mb-1 text-[11px] text-muted leading-relaxed space-y-0.5">
                                    {hasStarted && (
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-3 w-3 text-faint shrink-0" />
                                        <span>started {new Date(t.started_at!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                                        <span className="text-faint">· {t.category.replace(/_/g, " ")}</span>
                                      </div>
                                    )}
                                    {hasDesc && (
                                      <p className="break-words">{t.description}</p>
                                    )}
                                    {hasPhotos && (
                                      <div className="flex gap-1 pt-0.5">
                                        {photos.map((url, i) => (
                                          <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                             className="block w-12 h-12 rounded border border-subtle overflow-hidden bg-surface-mid hover:ring-2 hover:ring-starlight-blue transition-all">
                                            <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover"
                                                 onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; (ev.target as HTMLImageElement).parentElement!.innerHTML = '<div class=\"w-full h-full flex items-center justify-center text-faint text-[9px]\">img</div>'; }} />
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                    {hasReview && (
                                      <p className="text-navy/70 break-words">PM: {t.review_note}</p>
                                    )}
                                  </div>
                                );
                              })()}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRoutingTask(null)} />
          <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col border border-subtle overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-subtle flex items-start justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CornerDownRight className="h-4 w-4 text-starlight-blue" />
                  <h3 className="text-base font-semibold text-navy">Route task to work order</h3>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted flex-wrap">
                  <span className="font-medium text-navy">{routingTask.title}</span>
                  <span>&middot;</span>
                  <span>{person?.freelancer_name}</span>
                  {routingTask.hours != null && (<><span>&middot;</span><span className="font-semibold text-navy">{formatHours(routingTask.hours)}</span></>)}
                  {routingTask.worked_date && (<><span>&middot;</span><span>{formatDate(routingTask.worked_date)}</span></>)}
                </div>
                {routingTask.description && (
                  <div className="mt-2 px-3 py-2 bg-surface-dim border-l-2 border-starlight-blue/60 rounded-r text-xs text-navy whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                    <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-0.5">Freelancer&apos;s note</div>
                    {routingTask.description}
                  </div>
                )}
              </div>
              <button onClick={() => setRoutingTask(null)} className="p-1.5 hover:bg-surface-mid rounded-lg text-muted hover:text-navy transition-colors shrink-0" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Two-pane job -> WO picker */}
            <div className="flex-1 flex min-h-0">
              <JobWorkOrderPicker
                pinnedJobId={routingTask.job_id}
                pinnedBadgeLabel="Task's job"
                initialWoId={routingTask.routed_to_wo_id ?? null}
                selectedWoId={routeSelectedWo?.work_order_id ?? null}
                onSelect={setRouteSelectedWo}
              />
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-subtle bg-surface-dim flex items-end gap-3 shrink-0 flex-wrap">
              <div className="w-full -mb-1">
                {routeSelectedWo ? (
                  <p className="text-xs text-navy">
                    <CornerDownRight className="inline h-3 w-3 text-starlight-blue mr-1 -mt-0.5" />
                    <span className="text-muted">Routing to: </span>
                    <span className="font-semibold">{routeSelectedWo.is_overhead ? "Job Overhead" : routeSelectedWo.scope_name}</span>
                    {routeSelectedWo.description ? <span className="text-muted"> — {routeSelectedWo.description}</span> : null}
                  </p>
                ) : (
                  <p className="text-xs text-muted italic">Select a work order above to route this time</p>
                )}
              </div>
              <div className="shrink-0">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> Hours</label>
                <input type="number" step="0.25" min="0" value={routeHours} onChange={(e) => setRouteHours(e.target.value)} className="w-24 px-3 py-2 bg-surface border border-subtle rounded-lg text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
                {routingTask.hours != null && routeHours !== "" && parseFloat(routeHours) !== routingTask.hours && (
                  <p className="text-[10px] text-starlight-amber mt-1">Claimed: {formatHours(routingTask.hours)}</p>
                )}
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">Note to freelancer (optional)</label>
                <input type="text" value={routeNote} onChange={(e) => setRouteNote(e.target.value)} placeholder="Note to freelancer..." className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => setRoutingTask(null)} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors">Cancel</button>
                <button onClick={handleRouteToWO} disabled={!routeSelectedWo || routeSubmitting} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-starlight-blue text-white rounded-lg hover:bg-starlight-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  {routeSubmitting ? "Routing\u2026" : (<><CornerDownRight className="h-4 w-4" />Route &amp; create entry</>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Add Entry Modal */}
      {showAddEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddEntry(false)} />
          <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col border border-subtle overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-subtle flex items-center justify-between gap-4 shrink-0">
              <h3 className="text-base font-semibold text-navy">Add entry for {person?.freelancer_name}</h3>
              <button onClick={() => setShowAddEntry(false)} className="p-1.5 hover:bg-surface-mid rounded-lg text-muted hover:text-navy transition-colors shrink-0" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            {/* Type toggle */}
            <div className="px-6 py-3 border-b border-subtle shrink-0">
              <div className="flex items-center gap-1 bg-surface-mid rounded-lg p-0.5 w-full max-w-sm">
                <button onClick={() => setAddEntryType("wo")} className={"flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors " + (addEntryType === "wo" ? "bg-surface text-navy shadow-sm" : "text-muted hover:text-navy")}>WO Time Entry</button>
                <button onClick={() => setAddEntryType("adhoc")} className={"flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors " + (addEntryType === "adhoc" ? "bg-surface text-navy shadow-sm" : "text-muted hover:text-navy")}>Ad-hoc Task</button>
              </div>
            </div>

            {/* Body — WO picker or ad-hoc fields */}
            {addEntryType === "wo" ? (
              <div className="flex-1 flex min-h-0">
                <JobWorkOrderPicker
                  selectedWoId={addSelectedWo?.work_order_id ?? null}
                  onSelect={setAddSelectedWo}
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 px-6 py-4 space-y-4 overflow-y-auto">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Title</label>
                  <input type="text" value={addEntryTitle} onChange={e => setAddEntryTitle(e.target.value)} placeholder="What was done?"
                    className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1.5 block">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {[{ v: "job_work", l: "Job Work" }, { v: "maintenance", l: "Maintenance" }, { v: "workshop_general", l: "Workshop General" }, { v: "other", l: "Other" }].map(c => (
                      <button key={c.v} onClick={() => setAddEntryCategory(c.v)}
                        className={"px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors " + (addEntryCategory === c.v ? "bg-navy/10 text-navy border-navy/30" : "bg-surface-dim text-muted border-subtle")}>
                        {c.l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Footer — date, hours, note, actions */}
            <div className="px-6 py-4 border-t border-subtle bg-surface-dim shrink-0 space-y-3">
              {addEntryType === "wo" && (
                <div className="text-xs text-navy -mb-1">
                  {addSelectedWo ? (
                    <p>
                      <CornerDownRight className="inline h-3 w-3 text-starlight-blue mr-1 -mt-0.5" />
                      <span className="text-muted">Logging to: </span>
                      <span className="font-semibold">{addSelectedWo.is_overhead ? "Job Overhead" : addSelectedWo.scope_name}</span>
                      {addSelectedWo.description ? <span className="text-muted"> — {addSelectedWo.description}</span> : null}
                    </p>
                  ) : (
                    <p className="text-muted italic">Select a work order above</p>
                  )}
                </div>
              )}
              <div className="flex items-end gap-3 flex-wrap">
                <div className="shrink-0">
                  <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">Date</label>
                  <input type="date" value={addEntryDate} onChange={e => setAddEntryDate(e.target.value)} className="px-3 py-2 bg-surface border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
                </div>
                <div className="shrink-0">
                  <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">Hours</label>
                  <input type="number" value={addEntryHours} onChange={e => setAddEntryHours(e.target.value)} step="0.5" min="0.5" className="w-24 px-3 py-2 bg-surface border border-subtle rounded-lg text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">Note (optional)</label>
                  <input type="text" value={addEntryNote} onChange={e => setAddEntryNote(e.target.value)} placeholder="e.g. Forgot to clock in, covering for sick leave..." className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={() => setShowAddEntry(false)} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors">Cancel</button>
                  <button onClick={handleAddEntry} disabled={addEntrySubmitting || (addEntryType === "wo" && !addSelectedWo)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-starlight-blue text-white rounded-lg hover:bg-starlight-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    {addEntrySubmitting ? "Adding\u2026" : "Add Entry"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
