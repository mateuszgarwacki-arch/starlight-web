"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import { StatusBadge, DaysRemainingBadge } from "@/components/ui/badges";
import {
  Hammer, Clock, Users, ChevronDown, ChevronRight,
  Filter, Search, RefreshCw, Timer, Square, Paintbrush,
} from "lucide-react";
import Link from "next/link";
import { useRealtimeRefresh } from "@/lib/use-realtime";
import { toast } from "sonner";
import { getAuditContext, auditedUpdate } from "@/lib/audit";

interface WorkshopWO {
  work_order_id: number;
  job_id: number;
  scope_item_id: number;
  description: string | null;
  estimated_duration_hrs: number | null;
  status: string;
  complexity_construction: string | null;
  finish_relative: string | null;
  planned_lead_id: number | null;
  activity_label: string;
  phase_number: number | null;
  wo_sequence: number | null;
  scope_total_wos: number;
  prev_wo_status: string | null;
  scope_name: string;
  job_name: string;
  job_number: string;
  event_date: string | null;
  lead_name: string | null;
  total_logged_hrs: number;
  active_workers: { name: string; since: string; entry_id: number; freelancer_id: number }[];
  entry_count: number;
  paint_notes: string | null;
}

type FilterStatus = "all" | "Not-Started" | "Ready" | "In-Progress" | "Complete" | "On-Hold" | "painting";

interface ActiveTask {
  task_id: number;
  title: string;
  category: string;
  freelancer_name: string;
  started_at: string;
  job_number: string | null;
  job_name: string | null;
}

export default function WorkshopPage() {
  const supabase = createClient();
  const [wos, setWos] = useState<WorkshopWO[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWO, setExpandedWO] = useState<number | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterJob, setFilterJob] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);

  // PM stop task controls
  const [stoppingTask, setStoppingTask] = useState<number | null>(null);
  const [stopHours, setStopHours] = useState("");
  const [stopReason, setStopReason] = useState("");

  // PM stop WO timer controls
  const [stoppingWOEntry, setStoppingWOEntry] = useState<number | null>(null);
  const [stopWOHours, setStopWOHours] = useState("");
  const [stopWOReason, setStopWOReason] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);

    // Single RPC replaces 7+ individual queries
    const { data: d, error } = await supabase.rpc("rpc_workshop_data");
    if (error || !d) { console.error("Workshop RPC failed:", error); setWos([]); setLoading(false); return; }

    // Load active ad-hoc tasks (not in RPC)
    const { data: taskData } = await supabase
      .from("tbl_tasks")
      .select("task_id, title, category, freelancer_id, started_at, job_id")
      .eq("status", "in_progress")
      .order("started_at");
    if (taskData && taskData.length > 0) {
      const fIds = [...new Set(taskData.map((t: any) => t.freelancer_id).filter(Boolean))];
      const jIds = [...new Set(taskData.map((t: any) => t.job_id).filter(Boolean))];
      const [fRes, jRes] = await Promise.all([
        fIds.length > 0 ? supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", fIds) : { data: [] },
        jIds.length > 0 ? supabase.from("tbl_production_plan").select("job_id, job_name, job_number").in("job_id", jIds) : { data: [] },
      ]);
      const fMap: Record<number, string> = {};
      (fRes.data || []).forEach((f: any) => { fMap[f.freelancer_id] = f.freelancer_name; });
      const jMap: Record<number, { name: string; number: string }> = {};
      (jRes.data || []).forEach((j: any) => { jMap[j.job_id] = { name: j.job_name, number: j.job_number }; });
      setActiveTasks(taskData.map((t: any) => ({
        task_id: t.task_id,
        title: t.title,
        category: t.category,
        freelancer_name: fMap[t.freelancer_id] || "Unknown",
        started_at: t.started_at,
        job_number: t.job_id ? jMap[t.job_id]?.number || null : null,
        job_name: t.job_id ? jMap[t.job_id]?.name || null : null,
      })));
    } else {
      setActiveTasks([]);
    }

    const woData = d.work_orders || [];
    if (woData.length === 0) { setWos([]); setLoading(false); return; }

    const lk: Record<number, { v: string; p: number | null }> = {};
    (d.lookups || []).forEach((l: any) => { lk[l.lookup_id] = { v: l.lookup_value, p: l.phase_number }; });
    const actByWO: Record<number, any[]> = {};
    (d.activities || []).forEach((a: any) => {
      if (!actByWO[a.work_order_id]) actByWO[a.work_order_id] = [];
      actByWO[a.work_order_id].push(a);
    });

    const scopeMap: Record<number, string> = {};
    (d.scope_items || []).forEach((s: any) => { scopeMap[s.scope_item_id] = s.item_name || "Scope #" + s.scope_item_id; });
    const jobMap: Record<number, { name: string; number: string; date: string | null }> = {};
    (d.jobs || []).forEach((j: any) => { jobMap[j.job_id] = { name: j.job_name, number: j.job_number, date: j.event_date }; });
    const fMap: Record<number, string> = {};
    (d.freelancers || []).forEach((f: any) => { fMap[f.freelancer_id] = f.freelancer_name; });

    const timeByWO: Record<number, any[]> = {};
    (d.time_entries || []).forEach((t: any) => {
      if (!timeByWO[t.work_order_id]) timeByWO[t.work_order_id] = [];
      timeByWO[t.work_order_id].push(t);
    });

    // Direct query for open entries to guarantee entry_id (RPC may not include it)
    const { data: openEntries } = await supabase
      .from("tbl_wo_time_entries")
      .select("entry_id, work_order_id, freelancer_id, system_start_timestamp")
      .is("system_end_timestamp", null)
      .is("archived_at", null);
    const openEntryMap: Record<string, number> = {};
    (openEntries || []).forEach((oe: any) => {
      openEntryMap[`${oe.work_order_id}-${oe.freelancer_id}`] = oe.entry_id;
    });

    const enriched: WorkshopWO[] = woData.map((wo: any) => {
      const acts = actByWO[wo.work_order_id];
      let label = "No Activity"; let phase: number | null = null;
      if (acts && acts.length > 0) {
        acts.sort((a: any, b: any) => a.sequence - b.sequence);
        label = acts.map((a: any) => lk[a.activity_id]?.v || "?").join(" + ");
        phase = lk[acts[0].activity_id]?.p ?? null;
      } else if (wo.activity_verb && lk[wo.activity_verb]) {
        label = lk[wo.activity_verb].v; phase = lk[wo.activity_verb].p;
      }
      const job = jobMap[wo.job_id] || { name: "—", number: "—", date: null };
      const entries = timeByWO[wo.work_order_id] || [];
      const totalHrs = entries.reduce((s: number, e: any) => s + (e.actual_hours || 0), 0);
      const activeWorkers = entries
        .filter((e: any) => !e.system_end_timestamp)
        .map((e: any) => ({
          name: fMap[e.freelancer_id] || "Unknown",
          since: new Date(e.system_start_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          entry_id: e.entry_id || openEntryMap[`${wo.work_order_id}-${e.freelancer_id}`] || 0,
          freelancer_id: e.freelancer_id,
        }));

      return {
        work_order_id: wo.work_order_id,
        job_id: wo.job_id,
        scope_item_id: wo.scope_item_id,
        description: wo.description,
        estimated_duration_hrs: wo.estimated_duration_hrs,
        status: wo.status,
        complexity_construction: wo.complexity_construction,
        finish_relative: wo.finish_relative,
        planned_lead_id: wo.planned_lead_id,
        paint_notes: wo.paint_notes || null,
        activity_label: label,
        phase_number: phase,
        scope_name: scopeMap[wo.scope_item_id] || "—",
        job_name: job.name,
        job_number: job.number,
        event_date: job.date,
        lead_name: wo.planned_lead_id ? fMap[wo.planned_lead_id] || null : null,
        wo_sequence: wo.wo_sequence,
        scope_total_wos: 0,
        prev_wo_status: null,
        total_logged_hrs: totalHrs,
        active_workers: activeWorkers,
        entry_count: entries.length,
      };
    });

    // Compute per-scope step info
    const wosByScope: Record<number, WorkshopWO[]> = {};
    enriched.forEach(w => {
      if (!wosByScope[w.scope_item_id]) wosByScope[w.scope_item_id] = [];
      wosByScope[w.scope_item_id].push(w);
    });
    Object.values(wosByScope).forEach(scopeWOs => {
      scopeWOs.sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999));
      scopeWOs.forEach((w, idx) => {
        w.scope_total_wos = scopeWOs.length;
        w.prev_wo_status = idx > 0 ? scopeWOs[idx - 1].status : null;
      });
    });
    enriched.sort((a, b) => (a.phase_number || 999) - (b.phase_number || 999));
    setWos(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // PM: stop an ad-hoc task with reason and hours override
  const handleStopTask = async (taskId: number) => {
    const hrs = parseFloat(stopHours);
    if (!hrs || hrs <= 0) { toast.error("Enter valid hours"); return; }
    if (!stopReason.trim()) { toast.error("Enter a reason"); return; }
    await supabase.from("tbl_tasks").update({
      status: "pending",
      hours: hrs,
      logged_at: new Date().toISOString(),
      description: (stopReason.trim() ? `[PM stopped] ${stopReason.trim()}` : null),
    }).eq("task_id", taskId);
    toast.success("Task stopped — sent to review");
    setStoppingTask(null);
    setStopHours("");
    setStopReason("");
    loadAll();
  };

  // PM: stop an open WO timer with reason and hours override
  const handleStopWOEntry = async (entryId: number, freelancerId: number) => {
    const hours = parseFloat(stopWOHours);
    if (isNaN(hours) || hours <= 0) { toast.error("Enter valid hours"); return; }
    if (!stopWOReason.trim()) { toast.error("Reason required"); return; }

    // Get freelancer rate
    const { data: fr } = await supabase.from("tbl_freelancers")
      .select("day_rate, standard_day_hours")
      .eq("freelancer_id", freelancerId)
      .single();
    const rate = fr?.day_rate && fr?.standard_day_hours ? fr.day_rate / fr.standard_day_hours : 0;
    const cost = Math.round(hours * rate * 100) / 100;
    const now = new Date().toISOString();

    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_wo_time_entries", entryId, {
      system_end_timestamp: now,
      actual_end_timestamp: now,
      actual_hours: hours,
      applied_hourly_rate: rate,
      entry_cost: cost,
      flag_note: `PM override: ${stopWOReason.trim()}`,
    });

    setStoppingWOEntry(null);
    setStopWOHours("");
    setStopWOReason("");
    toast.success(`Timer stopped — ${hours}h logged`);
    loadAll();
  };

  // Real-time: auto-refresh when WOs or time entries change
  useRealtimeRefresh(["tbl_work_orders", "tbl_wo_time_entries", "tbl_tasks"], loadAll, !loading);

  // Expand to show time entries
  const toggleExpand = async (woId: number) => {
    if (expandedWO === woId) {
      setExpandedWO(null);
      setExpandedEntries([]);
      return;
    }
    setExpandedWO(woId);
    const { data } = await supabase
      .from("tbl_wo_time_entries")
      .select("entry_id, freelancer_id, system_start_timestamp, system_end_timestamp, actual_hours, applied_hourly_rate, entry_cost, flag_note")
      .eq("work_order_id", woId)
      .is("archived_at", null)
      .order("system_start_timestamp");
    // Enrich with names
    const fIds = [...new Set((data || []).map((e: any) => e.freelancer_id))];
    const { data: frs } = fIds.length > 0
      ? await supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", fIds)
      : { data: [] };
    const nm: Record<number, string> = {};
    (frs || []).forEach((f: any) => { nm[f.freelancer_id] = f.freelancer_name; });
    setExpandedEntries((data || []).map((e: any) => ({ ...e, name: nm[e.freelancer_id] || "Unknown" })));
  };

  // Filtering
  const jobs = [...new Set(wos.map(w => w.job_number))].sort();
  const filtered = wos.filter(w => {
    if (filterStatus === "painting") {
      if (!w.paint_notes) return false;
      if (w.status === "Complete" || w.status === "Voided") return false;
    } else if (filterStatus !== "all" && w.status !== filterStatus) return false;
    if (filterJob !== "all" && w.job_number !== filterJob) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      if (!w.activity_label.toLowerCase().includes(s) && !w.scope_name.toLowerCase().includes(s) && !(w.description || "").toLowerCase().includes(s) && !(w.paint_notes || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  // Stats
  const stats = {
    total: wos.length,
    notStarted: wos.filter(w => w.status === "Not-Started").length,
    ready: wos.filter(w => w.status === "Ready").length,
    inProgress: wos.filter(w => w.status === "In-Progress").length,
    complete: wos.filter(w => w.status === "Complete").length,
    onHold: wos.filter(w => w.status === "On-Hold").length,
    totalEstHrs: wos.reduce((s, w) => s + (w.estimated_duration_hrs || 0), 0),
    totalLoggedHrs: wos.reduce((s, w) => s + w.total_logged_hrs, 0),
    activeWorkerCount: new Set(wos.flatMap(w => w.active_workers.map(a => a.name))).size,
    painting: wos.filter(w => w.paint_notes && w.status !== "Complete" && w.status !== "Voided").length,
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted text-sm animate-pulse">Loading workshop...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Workshop</h1>
          <p className="text-sm text-muted mt-0.5">All work orders across all active jobs</p>
        </div>
        <button onClick={loadAll} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-navy hover:bg-surface-mid rounded-lg transition-colors">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Total WOs</p>
          <p className="text-lg font-semibold text-navy">{stats.total}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">In Progress</p>
          <p className="text-lg font-semibold text-starlight-blue">{stats.inProgress}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Ready</p>
          <p className="text-lg font-semibold text-navy">{stats.ready}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Est. Hours</p>
          <p className="text-lg font-semibold text-navy">{stats.totalEstHrs}h</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Logged Hours</p>
          <p className="text-lg font-semibold text-starlight-green">{Math.round(stats.totalLoggedHrs * 10) / 10}h</p>
        </div>
      </div>

      {/* Active workers banner — shows who's on what */}
      {(stats.activeWorkerCount > 0 || activeTasks.length > 0) && (
        <div className="bg-starlight-blue/5 border border-starlight-blue/20 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-starlight-blue" />
            <p className="text-sm font-medium text-starlight-blue">
              {stats.activeWorkerCount + activeTasks.length} {(stats.activeWorkerCount + activeTasks.length) === 1 ? "person" : "people"} currently working
            </p>
          </div>
          <div className="space-y-1">
            {/* WO workers */}
            {wos.flatMap(w => w.active_workers.map(aw => {
              return (
              <div key={`${w.work_order_id}-${aw.entry_id}`}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-navy w-28 truncate">{aw.name}</span>
                  <span className="text-starlight-blue">→</span>
                  <span className="text-muted truncate flex-1">{w.activity_label} — {w.scope_name}</span>
                  <span className="text-[10px] font-mono text-muted shrink-0">{w.job_number}</span>
                  <span className="text-[10px] text-muted shrink-0">since {aw.since}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (stoppingWOEntry === aw.entry_id) { setStoppingWOEntry(null); return; }
                      setStoppingWOEntry(aw.entry_id);
                      setStopWOHours("");
                      setStopWOReason("");
                    }}
                    className={`p-1 rounded transition-colors shrink-0 ${stoppingWOEntry === aw.entry_id ? "bg-starlight-red/10 text-starlight-red" : "text-faint hover:text-starlight-red hover:bg-starlight-red/10"}`}
                    title="Stop this timer">
                    <Square className="h-3 w-3" />
                  </button>
                </div>
                {stoppingWOEntry === aw.entry_id && (
                  <div className="mt-1.5 ml-[7.5rem] flex items-end gap-2">
                    <div className="w-20">
                      <label className="text-[9px] text-muted block mb-0.5">Hours</label>
                      <input type="number" step="0.5" min="0.5" value={stopWOHours}
                        onChange={e => setStopWOHours(e.target.value)}
                        className="w-full px-2 py-1 text-sm text-center border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-red-400" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] text-muted block mb-0.5">Reason *</label>
                      <input type="text" value={stopWOReason}
                        onChange={e => setStopWOReason(e.target.value)}
                        placeholder="e.g. Forgot to stop, end of day"
                        className="w-full px-2 py-1 text-xs border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-red-400"
                        autoFocus />
                    </div>
                    <button onClick={() => handleStopWOEntry(aw.entry_id, aw.freelancer_id)}
                      disabled={!stopWOReason.trim() || !stopWOHours}
                      className="px-3 py-1 bg-starlight-red text-white text-xs font-medium rounded hover:bg-starlight-red disabled:opacity-50 shrink-0">
                      Stop
                    </button>
                    <button onClick={() => setStoppingWOEntry(null)}
                      className="px-2 py-1 text-xs text-muted hover:text-muted shrink-0">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              );
            }))}

            {/* Ad-hoc task workers */}
            {activeTasks.map(t => (
              <div key={t.task_id} className="flex items-center gap-2 text-xs">
                <span className="font-medium text-navy w-28 truncate">{t.freelancer_name}</span>
                <span className="text-starlight-amber">→</span>
                <span className="text-muted truncate flex-1">{t.title}</span>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${t.category === "maintenance" ? "bg-starlight-amber/10 text-starlight-amber" : "bg-navy/10 text-navy"}`}>
                  {t.category === "maintenance" ? "Maint." : "General"}
                </span>
                <span className="text-[10px] text-muted shrink-0">since {new Date(t.started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active ad-hoc tasks */}
      {activeTasks.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-subtle flex items-center gap-2">
            <Timer className="h-4 w-4 text-starlight-amber" />
            <h3 className="text-xs font-semibold text-navy">Active Tasks ({activeTasks.length})</h3>
            <span className="text-[10px] text-muted">Ad-hoc work in progress — not linked to work orders</span>
          </div>
          <div className="divide-y divide-subtle">
            {activeTasks.map(task => {
              const elapsed = Math.round((Date.now() - new Date(task.started_at).getTime()) / 60000);
              const elapsedStr = elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`;
              const catLabel = task.category === "workshop_general" ? "General" : task.category === "maintenance" ? "Maintenance" : task.category === "job_work" ? "Job" : "Other";
              return (
                <div key={task.task_id} className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                      task.category === "maintenance" ? "bg-starlight-amber/10 text-starlight-amber" :
                      task.category === "job_work" ? "bg-starlight-blue/10 text-starlight-blue" :
                      "bg-navy/10 text-navy"
                    }`}>{catLabel}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-navy font-medium truncate">{task.title}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted">
                        <span>{task.freelancer_name}</span>
                        {task.job_number && <span className="font-mono">{task.job_number}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono text-starlight-amber font-semibold">{elapsedStr}</p>
                      <p className="text-[9px] text-muted">since {new Date(task.started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (stoppingTask === task.task_id) { setStoppingTask(null); return; }
                        const defHrs = Math.max(0.5, Math.round((elapsed / 60) * 2) / 2);
                        setStoppingTask(task.task_id);
                        setStopHours(String(defHrs));
                        setStopReason("");
                      }}
                      className={`p-1.5 rounded-lg transition-colors shrink-0 ${stoppingTask === task.task_id ? "bg-starlight-red/10 text-starlight-red" : "text-muted hover:text-starlight-red hover:bg-starlight-red/10"}`}
                      title="Stop this task">
                      <Square className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {stoppingTask === task.task_id && (
                    <div className="mt-2 ml-16 flex items-end gap-2">
                      <div className="w-20">
                        <label className="text-[9px] text-muted block mb-0.5">Hours</label>
                        <input type="number" step="0.5" min="0.5" value={stopHours}
                          onChange={e => setStopHours(e.target.value)}
                          className="w-full px-2 py-1.5 text-sm text-center border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-red-400" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[9px] text-muted block mb-0.5">Reason *</label>
                        <input type="text" value={stopReason}
                          onChange={e => setStopReason(e.target.value)}
                          placeholder="e.g. Forgot to stop, moved to WO, end of day"
                          className="w-full px-2 py-1.5 text-xs border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-red-400"
                          autoFocus />
                      </div>
                      <button onClick={() => handleStopTask(task.task_id)}
                        disabled={!stopReason.trim() || !stopHours}
                        className="px-3 py-1.5 bg-starlight-red text-white text-xs font-medium rounded hover:bg-starlight-red disabled:opacity-50 shrink-0">
                        Stop
                      </button>
                      <button onClick={() => setStoppingTask(null)}
                        className="px-2 py-1.5 text-xs text-muted hover:text-muted shrink-0">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted" />
          {(["all", "Not-Started", "Ready", "In-Progress", "Complete", "On-Hold"] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={"px-3 py-1 rounded-full text-xs font-medium border transition-colors " + (
                filterStatus === s ? "bg-navy text-white border-navy" : "bg-surface text-muted border-subtle hover:border-subtle"
              )}
            >
              {s === "all" ? `All (${stats.total})` : `${s} (${wos.filter(w => w.status === s).length})`}
            </button>
          ))}
          {stats.painting > 0 && (
            <button
              onClick={() => setFilterStatus(filterStatus === "painting" ? "all" : "painting")}
              className={"px-3 py-1 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1 " + (
                filterStatus === "painting" ? "bg-starlight-amber text-white border-starlight-amber" : "bg-surface text-starlight-amber border-starlight-amber/30 hover:border-starlight-amber"
              )}
            >
              <Paintbrush className="h-3 w-3" /> Painting ({stats.painting})
            </button>
          )}
        </div>
        <select
          value={filterJob}
          onChange={(e) => setFilterJob(e.target.value)}
          className="px-3 py-1.5 border border-subtle rounded-lg text-xs bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue"
        >
          <option value="all">All Jobs</option>
          {jobs.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search activities, scope items..."
            className="w-full pl-9 pr-3 py-1.5 border border-subtle rounded-lg text-xs bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue"
          />
        </div>
      </div>

      {/* WO List — grouped by job, then by scope item */}
      <div className="space-y-6">
        {filtered.length === 0 ? (
          <div className="card px-6 py-12 text-center text-muted text-sm">No work orders match your filters</div>
        ) : (
          Object.entries(
            filtered.reduce((groups: Record<string, typeof filtered>, wo) => {
              const key = wo.job_id + "";
              if (!groups[key]) groups[key] = [];
              groups[key].push(wo);
              return groups;
            }, {})
          )
          .sort(([, a], [, b]) => {
            // Sort jobs by earliest event date
            const dateA = a[0]?.event_date ? new Date(a[0].event_date).getTime() : Infinity;
            const dateB = b[0]?.event_date ? new Date(b[0].event_date).getTime() : Infinity;
            return dateA - dateB;
          })
          .map(([jobKey, jobWOs]) => {
            const firstJob = jobWOs[0];
            const jobDoneCount = jobWOs.filter(w => w.status === "Complete").length;
            const jobActiveCount = jobWOs.filter(w => w.status === "In-Progress").length;
            // Sub-group by scope
            const scopeGroups = Object.entries(
              jobWOs.reduce((sg: Record<string, typeof jobWOs>, wo) => {
                const sk = wo.scope_item_id + "";
                if (!sg[sk]) sg[sk] = [];
                sg[sk].push(wo);
                return sg;
              }, {})
            );
            return (
              <div key={jobKey}>
                {/* Job header */}
                <div className="flex items-center gap-3 mb-2 px-1 border-b border-subtle pb-2">
                  <span className="text-sm font-bold font-mono text-navy">{firstJob.job_number}</span>
                  <p className="text-sm font-semibold text-navy truncate flex-1">{firstJob.job_name}</p>
                  <span className="text-[10px] text-muted">{jobDoneCount}/{jobWOs.length} WOs done</span>
                  {jobActiveCount > 0 && <span className="text-[10px] text-starlight-blue font-medium">{jobActiveCount} active</span>}
                  {firstJob.event_date && <DaysRemainingBadge eventDate={firstJob.event_date} />}
                </div>
                {/* Scope groups within job */}
                <div className="space-y-3 ml-1">
                  {scopeGroups.map(([scopeKey, scopeWOs]) => {
                    scopeWOs.sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999));
                    const first = scopeWOs[0];
                    const doneCount = scopeWOs.filter(w => w.status === "Complete").length;
                    return (
                      <div key={scopeKey}>
                        <div className="flex items-center gap-3 mb-1.5 px-1">
                          <p className="text-xs font-semibold text-muted truncate">{first.scope_name}</p>
                          <span className="text-[10px] text-muted">{doneCount}/{scopeWOs.length} steps done</span>
                        </div>
                        <div className="card overflow-hidden divide-y divide-subtle">
                          {scopeWOs.map((wo, woIdx) => {
            const isExpanded = expandedWO === wo.work_order_id;
            return (
              <div key={wo.work_order_id} className="card overflow-hidden">
                {/* Row */}
                <div
                  className="px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-surface-dim/50 transition-colors"
                  onClick={() => toggleExpand(wo.work_order_id)}
                >
                  <div className="text-faint">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                  <div className="flex items-center gap-1.5 w-16 shrink-0">
                    <div className={"w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 " + (
                      wo.status === "Complete" ? "bg-starlight-green" :
                      wo.status === "In-Progress" ? "bg-starlight-blue" :
                      wo.status === "Voided" ? "bg-surface-top" :
                      woIdx === 0 || (woIdx > 0 && scopeWOs[woIdx - 1].status === "Complete") ? "bg-starlight-amber" :
                      "bg-surface-top"
                    )}>
                      {woIdx + 1}
                    </div>
                    {woIdx < scopeWOs.length - 1 && (
                      <div className={"w-3 h-0.5 " + (wo.status === "Complete" ? "bg-starlight-green" : "bg-surface-hi")} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-navy truncate">{wo.activity_label}</p>
                      {wo.paint_notes && <span title="Has painting notes"><Paintbrush className="h-3 w-3 text-starlight-amber shrink-0" /></span>}
                    </div>
                    <p className="text-xs text-muted truncate mt-0.5">
                      {wo.scope_name}{wo.description ? ` — ${wo.description}` : ""}
                    </p>
                    {wo.paint_notes && filterStatus === "painting" && (
                      <p className="text-xs text-starlight-amber bg-starlight-amber/10 rounded px-2 py-1 mt-1 whitespace-pre-wrap">{wo.paint_notes}</p>
                    )}
                  </div>

                  {/* Hours: est vs logged */}
                  <div className="text-right w-20 shrink-0">
                    <p className="text-sm font-mono text-navy">
                      {wo.total_logged_hrs > 0 ? `${Math.round(wo.total_logged_hrs * 10) / 10}h` : "—"}
                    </p>
                    <p className="text-[10px] text-muted">
                      {wo.estimated_duration_hrs ? `of ${wo.estimated_duration_hrs}h est.` : "no est."}
                    </p>
                  </div>
                  {/* Active workers indicator */}
                  <div className="w-24 shrink-0 text-right">
                    {wo.active_workers.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-starlight-blue">
                        <Users className="h-3 w-3" />
                        {wo.active_workers.map(w => w.name.split(" ")[0]).join(", ")}
                      </span>
                    ) : wo.lead_name ? (
                      <p className="text-xs text-muted truncate">{wo.lead_name}</p>
                    ) : (
                      <p className="text-xs text-faint italic">Unassigned</p>
                    )}
                  </div>
                  <div className="w-24 shrink-0 text-right">
                    <StatusBadge status={wo.status} />
                  </div>
                  <DaysRemainingBadge eventDate={wo.event_date} />
                </div>

                {/* Expanded: Time entries */}
                {isExpanded && (
                  <div className="border-t border-subtle bg-surface-dim/30 px-5 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Time Entries</h3>
                      <Link
                        href={`/jobs/${wo.job_id}/scope/${wo.scope_item_id}?expand=${wo.work_order_id}`}
                        className="text-xs text-starlight-blue hover:text-navy font-medium"
                      >
                        Open in Work Orders →
                      </Link>
                    </div>
                    {expandedEntries.length === 0 ? (
                      <p className="text-xs text-faint py-2">No time entries yet</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] text-muted uppercase tracking-wider border-b border-subtle">
                              <th className="text-left py-1.5 pr-3 font-medium">Person</th>
                              <th className="text-left py-1.5 px-2 font-medium">Started</th>
                              <th className="text-left py-1.5 px-2 font-medium">Ended</th>
                              <th className="text-right py-1.5 px-2 font-medium">Hours</th>
                              <th className="text-right py-1.5 px-2 font-medium">Rate</th>
                              <th className="text-right py-1.5 px-2 font-medium">Cost</th>
                              <th className="text-left py-1.5 px-2 font-medium">Flag</th>
                            </tr>
                          </thead>
                          <tbody>
                            {expandedEntries.map((e: any) => (
                              <tr key={e.entry_id} className={"border-b border-subtle last:border-0 " + (!e.system_end_timestamp ? "bg-starlight-blue/5" : "")}>
                                <td className="py-1.5 pr-3 text-sm text-navy font-medium">
                                  {e.name}
                                  {!e.system_end_timestamp && <span className="ml-1.5 text-[10px] text-starlight-blue font-normal">(active)</span>}
                                </td>
                                <td className="py-1.5 px-2 text-xs text-muted font-mono">
                                  {new Date(e.system_start_timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </td>
                                <td className="py-1.5 px-2 text-xs text-muted font-mono">
                                  {e.system_end_timestamp
                                    ? new Date(e.system_end_timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                                    : "—"}
                                </td>
                                <td className="py-1.5 px-2 text-right text-sm font-mono text-navy">{e.actual_hours ? `${e.actual_hours}h` : "—"}</td>
                                <td className="py-1.5 px-2 text-right text-xs font-mono text-muted">{e.applied_hourly_rate ? formatCurrency(e.applied_hourly_rate) : "—"}</td>
                                <td className="py-1.5 px-2 text-right text-sm font-mono text-navy">{e.entry_cost ? formatCurrency(e.entry_cost) : "—"}</td>
                                <td className="py-1.5 px-2 text-xs text-starlight-amber max-w-[200px] truncate">{e.flag_note || ""}</td>
                              </tr>
                            ))}
                          </tbody>
                          {expandedEntries.some((e: any) => e.system_end_timestamp) && (
                            <tfoot>
                              <tr className="border-t border-subtle">
                                <td colSpan={3} className="py-2 text-right text-xs font-medium text-muted">Total</td>
                                <td className="py-2 px-2 text-right text-sm font-semibold text-navy font-mono">
                                  {Math.round(expandedEntries.reduce((s: number, e: any) => s + (e.actual_hours || 0), 0) * 10) / 10}h
                                </td>
                                <td className="py-2 px-2"></td>
                                <td className="py-2 px-2 text-right text-sm font-semibold text-navy font-mono">
                                  {formatCurrency(expandedEntries.reduce((s: number, e: any) => s + (e.entry_cost || 0), 0))}
                                </td>
                                <td></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
                  );
                })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
