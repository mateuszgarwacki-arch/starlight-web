"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import type { Freelancer } from "@/lib/types";
import { getAuditContext, auditedUpdate } from "@/lib/audit";
import { ArrowLeft, Phone, Mail, Briefcase, Clock, Flag, Calendar, AlertTriangle, CheckCircle2, Pencil, Archive, X } from "lucide-react";
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
  const [showArchived, setShowArchived] = useState(false);
  const [editingEntry, setEditingEntry] = useState<number | null>(null);
  const [editHoursValue, setEditHoursValue] = useState("");
  const [archivingEntry, setArchivingEntry] = useState<number | null>(null);
  const [archiveReason, setArchiveReason] = useState("");

  const loadData = useCallback(async () => {
    // Check current user role
    const { data: { user } } = await supabase.auth.getUser();
    const role = user?.user_metadata?.role || "freelancer";
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
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
      {editingField === field ? (
        <input type={type} value={editValue} onChange={e => setEditValue(e.target.value)}
          onBlur={saveField} onKeyDown={e => { if (e.key === "Enter") saveField(); if (e.key === "Escape") cancelEdit(); }}
          autoFocus className="w-full px-2 py-1 text-sm border border-starlight-blue rounded bg-white focus:outline-none" />
      ) : (
        <p onClick={() => startEdit(field, value)} title={String(value ?? "")}
          className={`text-sm text-navy font-medium truncate ${isAdmin ? "cursor-pointer hover:text-starlight-blue transition-colors group" : ""}`}>
          {value ?? <span className="text-gray-300">—</span>}{suffix}
          {isAdmin && <Pencil className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 inline ml-1" />}
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

  const statusColor = (s: string | null) => {
    if (!s) return "bg-gray-100 text-gray-500";
    const m: Record<string, string> = {
      Booked: "bg-blue-100 text-blue-700", Notified: "bg-amber-100 text-amber-700",
      Confirmed: "bg-green-100 text-green-700", Declined: "bg-red-100 text-red-700",
      Unavailable: "bg-gray-200 text-gray-600",
    };
    return m[s] || "bg-gray-100 text-gray-500";
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">Loading...</div>;
  if (!person) return <div className="text-center py-12 text-gray-400">Freelancer not found</div>;

  const isActive = isTruthy(person.active);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/crew" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-navy transition-colors">
        <ArrowLeft className="h-4 w-4" /> All Crew
      </Link>

      {/* Header card */}
      <div className="card px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <EditableField field="freelancer_name" value={person.freelancer_name} label="" />
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {isActive ? "Active" : "Inactive"}
              </span>
              {person.role && (
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{person.role}</span>
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
          <p className="text-xs text-gray-400">Total Hours</p>
          <p className="text-lg font-semibold text-navy">{stats.totalHours}h</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Last 30 Days</p>
          <p className="text-lg font-semibold text-navy">{stats.last30Hours}h</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">WOs Completed</p>
          <p className="text-lg font-semibold text-navy">{stats.totalWOs}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Avg vs Estimate</p>
          <p className={`text-lg font-semibold ${stats.avgAccuracy === null ? "text-gray-300" : stats.avgAccuracy > 110 ? "text-starlight-red" : stats.avgAccuracy < 90 ? "text-starlight-green" : "text-navy"}`}>
            {stats.avgAccuracy !== null ? `${stats.avgAccuracy}%` : "—"}
          </p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Flag Notes</p>
          <p className="text-lg font-semibold text-navy">{stats.flagCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => setActiveTab("timeline")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "timeline" ? "border-starlight-red text-navy" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}>
          <Clock className="h-4 w-4" /> Activity ({timeEntries.length})
        </button>
        <button onClick={() => setActiveTab("bookings")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "bookings" ? "border-starlight-red text-navy" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}>
          <Calendar className="h-4 w-4" /> Bookings ({bookings.length})
        </button>
      </div>

      {/* TAB: Activity Timeline */}
      {activeTab === "timeline" && (
        <div className="space-y-2">
          {/* Show archived toggle */}
          {isAdmin && (
            <div className="flex items-center justify-end">
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
                  className="rounded border-gray-300" />
                Show archived ({timeEntries.filter(e => e.archived_at).length})
              </label>
            </div>
          )}
          {(() => {
            const visible = showArchived ? timeEntries : timeEntries.filter(e => !e.archived_at);
            if (visible.length === 0) return <div className="card px-6 py-10 text-center text-gray-400 text-sm">No time entries recorded yet.</div>;
            return visible.map(e => {
              const isArchived = !!e.archived_at;
              return (
              <div key={e.entry_id} className={`card px-5 py-3.5 flex items-start gap-4 ${e.flag_note && !isArchived ? "border-l-4 border-l-starlight-amber" : ""} ${isArchived ? "opacity-40 border-l-4 border-l-red-300" : ""}`}>
                {/* Date */}
                <div className="w-20 shrink-0 text-center">
                  <p className="text-xs text-gray-400">
                    {e.system_start_timestamp ? new Date(e.system_start_timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
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
                        e.wo_status === "Complete" ? "bg-green-100 text-green-700" :
                        e.wo_status === "In-Progress" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                      }`}>{e.wo_status}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{e.scope_name || e.wo_description || "—"}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {e.job_number && (
                      <Link href={`/jobs/${e.job_id}`} className="hover:text-navy transition-colors">
                        {e.job_number} — {e.job_name}
                      </Link>
                    )}
                    {e.entry_cost != null && <span className="font-mono">{formatCurrency(e.entry_cost)}</span>}
                  </div>
                  {e.flag_note && (
                    <div className="mt-2 flex items-start gap-2 bg-amber-50 rounded px-3 py-2">
                      <Flag className="h-3.5 w-3.5 text-starlight-amber shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 leading-relaxed">{e.flag_note}</p>
                    </div>
                  )}
                  {/* Archive reason (if archived) */}
                  {isArchived && e.archive_reason && (
                    <div className="mt-2 flex items-start gap-2 bg-red-50 rounded px-3 py-2">
                      <Archive className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-600 leading-relaxed">Archived: {e.archive_reason}</p>
                    </div>
                  )}
                  {/* Archive form (when archiving) */}
                  {archivingEntry === e.entry_id && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded space-y-2">
                      <p className="text-xs font-medium text-red-700">Archive this time entry — it will be excluded from all costs</p>
                      <input type="text" value={archiveReason} onChange={ev => setArchiveReason(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === "Enter") handleArchive(e.entry_id); if (ev.key === "Escape") setArchivingEntry(null); }}
                        placeholder="Reason (required)..." autoFocus
                        className="w-full px-3 py-1.5 text-sm border border-red-200 rounded focus:outline-none focus:ring-2 focus:ring-red-300" />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setArchivingEntry(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        <button onClick={() => handleArchive(e.entry_id)} disabled={!archiveReason.trim()}
                          className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">Archive</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Admin action buttons */}
                {isAdmin && !isArchived && archivingEntry !== e.entry_id && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => { setEditingEntry(e.entry_id); setEditHoursValue(String(e.actual_hours ?? "")); }}
                      title="Edit hours" className="p-1.5 text-gray-300 hover:text-starlight-blue hover:bg-blue-50 rounded transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { setArchivingEntry(e.entry_id); setArchiveReason(""); }}
                      title="Archive entry" className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                      <Archive className="h-3.5 w-3.5" />
                    </button>
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
            <div className="card px-6 py-10 text-center text-gray-400 text-sm">No bookings in the last 30 days or upcoming.</div>
          ) : (
            bookings.map(b => (
              <div key={b.schedule_id} className="card px-5 py-3.5 flex items-center gap-4">
                <div className="w-20 shrink-0 text-center">
                  <p className="text-sm font-semibold text-navy">
                    {new Date(b.scheduled_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(b.scheduled_date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" })}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  {b.job_name ? (
                    <Link href={`/jobs/${b.job_id}`} className="text-sm font-medium text-navy hover:text-starlight-blue transition-colors">
                      {b.job_number} — {b.job_name}
                    </Link>
                  ) : b.status === "Unavailable" ? (
                    <p className="text-sm text-gray-500">{b.unavailable_reason || "Unavailable"}</p>
                  ) : (
                    <p className="text-sm text-gray-500">—</p>
                  )}
                  {b.notes && <p className="text-xs text-gray-400 mt-0.5">{b.notes}</p>}
                </div>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(b.status)}`}>
                  {b.status || "—"}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
