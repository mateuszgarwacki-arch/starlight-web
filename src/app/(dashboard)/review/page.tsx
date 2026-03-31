"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusBadge, DaysRemainingBadge } from "@/components/ui/badges";
import {
  TrendingUp, TrendingDown, Clock, AlertTriangle,
  ChevronDown, ChevronRight, DollarSign, BarChart3,
  Flag, RefreshCw, Package, Inbox,
} from "lucide-react";
import Link from "next/link";
import { CompletedWorkTab } from "@/components/completed-work-tab";

interface JobCost {
  job_id: number;
  job_number: string;
  job_name: string;
  event_date: string | null;
  budget_allowance: number | null;
  // Match actual view column names from qry_job_cost_summary
  quote_total: number;
  labour_cost: number;
  total_hours: number;
  material_cost: number;
  total_cost: number;
  margin_pct: number | null;
  // Legacy aliases (RPC may use either)
  accepted_quote_value?: number;
  job_actual_labour_cost?: number;
  job_material_cost?: number;
  job_total_actual_cost?: number;
  job_margin?: number;
  job_est_labour_cost?: number;
}

interface TimeEntryRow {
  entry_id: number;
  work_order_id: number;
  freelancer_name: string;
  activity_label: string;
  scope_name: string;
  job_number: string;
  system_start_timestamp: string;
  system_end_timestamp: string | null;
  actual_hours: number | null;
  applied_hourly_rate: number | null;
  entry_cost: number | null;
  flag_note: string | null;
}

interface EstVsActual {
  work_order_id: number;
  activity_label: string;
  scope_name: string;
  job_number: string;
  estimated_duration_hrs: number | null;
  actual_hours_total: number;
  variance_hrs: number;
  accuracy_pct: number | null;
}

interface MatSummary {
  job_id: number;
  job_number: string;
  job_name: string;
  line_count: number;
  total_bom_cost: number;
  total_inv_cost: number;
  total_variance: number;
  unmatched_invoices: number;
  unmatched_bom: number;
}

interface MatDetail {
  job_id: number;
  material_name: string;
  material_category: string;
  bom_qty: number;
  bom_cost: number;
  inv_qty: number;
  inv_cost: number;
  variance: number;
  match_status: string;
}

type TabKey = "costs" | "time" | "flags" | "accuracy" | "materials" | "completed";

export default function ReviewPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<TabKey>("costs");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get("tab") as TabKey;
    if (urlTab && ["costs", "time", "flags", "accuracy", "materials", "completed"].includes(urlTab)) setTab(urlTab);
  }, []);

  const [jobCosts, setJobCosts] = useState<JobCost[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntryRow[]>([]);
  const [flags, setFlags] = useState<TimeEntryRow[]>([]);
  const [accuracy, setAccuracy] = useState<EstVsActual[]>([]);
  const [matSummary, setMatSummary] = useState<MatSummary[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [scopeCosts, setScopeCosts] = useState<any[]>([]);
  const [expandedMatJob, setExpandedMatJob] = useState<number | null>(null);
  const [matDetails, setMatDetails] = useState<MatDetail[]>([]);
  const [overheadTasks, setOverheadTasks] = useState<any[]>([]);
  const [overheadTotal, setOverheadTotal] = useState(0);
  const [workshopMargins, setWorkshopMargins] = useState<Record<number, any>>({});
  const [expandedScope, setExpandedScope] = useState<number | null>(null);
  const [woDetails, setWoDetails] = useState<any[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);

    // Single RPC replaces 16+ individual queries
    const { data: d, error } = await supabase.rpc("rpc_review_data");
    if (error || !d) { console.error("Review RPC failed:", error); setLoading(false); return; }

    setInboxCount(d.inbox_count || 0);
    if (d.job_costs) setJobCosts(d.job_costs);
    if (d.material_summary) setMatSummary(d.material_summary);

    // Build lookup maps from pre-fetched data
    const sMap: Record<number, string> = {};
    (d.scope_items || []).forEach((s: any) => { sMap[s.scope_item_id] = s.item_name; });
    const jMap: Record<number, string> = {};
    (d.jobs || []).forEach((j: any) => { jMap[j.job_id] = j.job_number; });
    const lkMap: Record<number, string> = {};
    (d.activity_lookups || []).forEach((l: any) => { lkMap[l.lookup_id] = l.lookup_value; });

    // Build WO activity labels
    const woActLabel: Record<number, string> = {};
    (d.wo_activities || []).forEach((a: any) => {
      const label = lkMap[a.activity_id] || "?";
      woActLabel[a.work_order_id] = woActLabel[a.work_order_id] ? woActLabel[a.work_order_id] + " + " + label : label;
    });

    // Enrich accuracy data
    if (d.estimate_vs_actual) {
      setAccuracy(d.estimate_vs_actual.map((a: any) => ({
        ...a,
        activity_label: a.verb_name || "—",
        scope_name: sMap[a.scope_item_id] || "—",
        job_number: jMap[a.job_id] || "—",
      })));
    }

    // Enrich time entries (pre-joined with freelancer_name, wo data from RPC)
    const rawTime = d.time_entries || [];
    if (rawTime.length > 0) {
      const enriched = rawTime.map((t: any) => {
        const actLabel = woActLabel[t.work_order_id] || "—";
        return {
          ...t,
          activity_label: actLabel + (t.wo_description ? " — " + t.wo_description : ""),
          scope_name: t.scope_item_id ? sMap[t.scope_item_id] || "—" : "—",
          job_number: t.job_id ? jMap[t.job_id] || "—" : "—",
        };
      });
      setTimeEntries(enriched);
      setFlags(enriched.filter((t: any) => t.flag_note));
    }
    // Load workshop overhead (non-job tasks)
    const { data: ohData } = await supabase
      .from("tbl_tasks")
      .select("task_id, title, category, hours, worked_date, status, started_at, logged_at, freelancer_id")
      .in("category", ["workshop_general", "maintenance", "other"])
      .in("status", ["pending", "approved_overhead", "in_progress"])
      .order("logged_at", { ascending: false });
    if (ohData && ohData.length > 0) {
      const fIds = [...new Set(ohData.map((t: any) => t.freelancer_id).filter(Boolean))];
      const { data: frs } = fIds.length > 0
        ? await supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name, day_rate, standard_day_hours").in("freelancer_id", fIds)
        : { data: [] };
      const fMap: Record<number, { name: string; rate: number }> = {};
      (frs || []).forEach((f: any) => {
        const hourly = (f.day_rate || 0) / (f.standard_day_hours || 8);
        fMap[f.freelancer_id] = { name: f.freelancer_name, rate: hourly };
      });
      const enriched = ohData.map((t: any) => {
        const f = fMap[t.freelancer_id] || { name: "Unknown", rate: 0 };
        const hrs = t.hours || 0;
        return { ...t, freelancer_name: f.name, hourly_rate: f.rate, cost: hrs * f.rate };
      });
      setOverheadTasks(enriched);
      setOverheadTotal(enriched.reduce((s: number, t: any) => s + t.cost, 0));
    } else {
      setOverheadTasks([]);
      setOverheadTotal(0);
    }
    // Workshop quote margins per job (from qry_job_quote_margin)
    const { data: wmData } = await supabase.from("qry_job_quote_margin").select("*");
    if (wmData) {
      const map: Record<number, any> = {};
      wmData.forEach((m: any) => { map[m.job_id] = m; });
      setWorkshopMargins(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadScopeCosts = async (jobId: number) => {
    if (expandedJob === jobId) { setExpandedJob(null); setScopeCosts([]); return; }
    setExpandedJob(jobId);
    // Use qry_cost_waterfall for reliable 4-layer cost data (same source as job page)
    const { data } = await supabase.from("qry_cost_waterfall").select("*").eq("job_id", jobId);
    setScopeCosts(data || []);
  };

  const loadMatDetails = async (jobId: number) => {
    if (expandedMatJob === jobId) { setExpandedMatJob(null); setMatDetails([]); return; }
    setExpandedMatJob(jobId);
    const { data } = await supabase.from("qry_material_reconciliation").select("*").eq("job_id", jobId);
    setMatDetails(data || []);
  };

  const loadWoDetails = async (scopeItemId: number) => {
    if (expandedScope === scopeItemId) { setExpandedScope(null); setWoDetails([]); return; }
    setExpandedScope(scopeItemId);
    const [woRes, estRes] = await Promise.all([
      supabase.from("tbl_work_orders").select("work_order_id, description, status, estimated_duration_hrs, wo_sequence").eq("scope_item_id", scopeItemId).not("status", "eq", "Voided").order("wo_sequence"),
      supabase.from("qry_wo_estimated_cost").select("work_order_id, estimated_labour_cost, estimated_material_cost, estimated_total_cost").eq("scope_item_id", scopeItemId),
    ]);
    const wos = woRes.data || [];
    const woIds = wos.map((w: any) => w.work_order_id);
    const estMap: Record<number, any> = {};
    (estRes.data || []).forEach((e: any) => { estMap[e.work_order_id] = e; });
    let actMap: Record<number, { labour: number; hours: number }> = {};
    let matMap: Record<number, number> = {};
    if (woIds.length > 0) {
      const [timeRes, bomRes] = await Promise.all([
        supabase.from("tbl_wo_time_entries").select("work_order_id, entry_cost, actual_hours").in("work_order_id", woIds).is("archived_at", null),
        supabase.from("tbl_wo_bom").select("work_order_id, quantity, unit_cost, actual_unit_cost").in("work_order_id", woIds),
      ]);
      for (const t of timeRes.data || []) {
        if (!actMap[t.work_order_id]) actMap[t.work_order_id] = { labour: 0, hours: 0 };
        actMap[t.work_order_id].labour += t.entry_cost || 0;
        actMap[t.work_order_id].hours += t.actual_hours || 0;
      }
      for (const b of bomRes.data || []) {
        matMap[b.work_order_id] = (matMap[b.work_order_id] || 0) + (b.quantity || 0) * (b.actual_unit_cost || b.unit_cost || 0);
      }
    }
    setWoDetails(wos.map((wo: any) => ({
      ...wo,
      est_labour: estMap[wo.work_order_id]?.estimated_labour_cost || 0,
      est_material: estMap[wo.work_order_id]?.estimated_material_cost || 0,
      est_total: estMap[wo.work_order_id]?.estimated_total_cost || 0,
      act_hours: actMap[wo.work_order_id]?.hours || 0,
      act_labour: actMap[wo.work_order_id]?.labour || 0,
      act_material: matMap[wo.work_order_id] || 0,
      act_total: (actMap[wo.work_order_id]?.labour || 0) + (matMap[wo.work_order_id] || 0),
    })));
  };

  // Helper: resolve field names (view uses quote_total, RPC may alias differently)
  const getQuote = (j: JobCost) => j.quote_total ?? j.accepted_quote_value ?? 0;
  const getLabour = (j: JobCost) => j.labour_cost ?? j.job_actual_labour_cost ?? 0;
  const getMaterial = (j: JobCost) => j.material_cost ?? j.job_material_cost ?? 0;
  const getTotal = (j: JobCost) => j.total_cost ?? j.job_total_actual_cost ?? 0;
  const getMargin = (j: JobCost) => {
    const q = getQuote(j);
    const t = getTotal(j);
    return q > 0 ? q - t : j.job_margin ?? 0;
  };

  const totalQuoteValue = jobCosts.reduce((s, j) => s + getQuote(j), 0);
  const totalActualCost = jobCosts.reduce((s, j) => s + getTotal(j), 0);
  const totalMargin = totalQuoteValue - totalActualCost;
  const totalMatVariance = matSummary.reduce((s, m) => s + (m.total_variance || 0), 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">Loading review data...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Review & Cost Visibility</h1>
          <p className="text-sm text-gray-400 mt-0.5">Job costs, time entries, flags, estimate accuracy, material reconciliation</p>
        </div>
        <button onClick={loadAll} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-navy hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Inbox banner */}
      {inboxCount > 0 && (
        <Link href="/review/inbox" className="card px-5 py-3 border-l-4 border-l-starlight-amber flex items-center justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <Inbox className="h-5 w-5 text-starlight-amber" />
            <div>
              <p className="text-sm font-semibold text-navy">{inboxCount} item{inboxCount !== 1 ? "s" : ""} in Workshop Inbox</p>
              <p className="text-[10px] text-gray-400">Pending tasks and open requests from freelancers</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </Link>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Total Quote Value</p>
          <p className="text-lg font-semibold text-navy">{formatCurrency(totalQuoteValue)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Job Costs</p>
          <p className="text-lg font-semibold text-navy">{formatCurrency(totalActualCost)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Workshop Overhead</p>
          <p className={"text-lg font-semibold " + (overheadTotal > 0 ? "text-starlight-amber" : "text-navy")}>{formatCurrency(overheadTotal)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Margin</p>
          <p className={"text-lg font-semibold " + (totalMargin >= 0 ? "text-starlight-green" : "text-starlight-red")}>
            {formatCurrency(totalMargin)}
          </p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Unread Flags</p>
          <p className={"text-lg font-semibold " + (flags.length > 0 ? "text-starlight-amber" : "text-navy")}>{flags.length}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Material Variance</p>
          <p className={"text-lg font-semibold " + (totalMatVariance > 0 ? "text-starlight-red" : totalMatVariance < 0 ? "text-starlight-green" : "text-navy")}>
            {totalMatVariance > 0 ? "+" : ""}{formatCurrency(totalMatVariance)}
          </p>
        </div>
      </div>

      {/* Workshop Overhead panel */}
      {overheadTasks.length > 0 && (
        <details className="card overflow-hidden">
          <summary className="px-5 py-3 cursor-pointer hover:bg-gray-50/50 flex items-center gap-3 list-none">
            <ChevronRight className="h-4 w-4 text-gray-400 transition-transform [details[open]>&]:rotate-90" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-navy">Workshop Overhead</p>
              <p className="text-[10px] text-gray-400">Non-job costs: general tasks, maintenance, cleaning</p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-right w-64 shrink-0">
              <div><p className="text-[10px] text-gray-400">Tasks</p><p className="text-sm font-mono text-navy">{overheadTasks.length}</p></div>
              <div><p className="text-[10px] text-gray-400">Hours</p><p className="text-sm font-mono text-navy">{Math.round(overheadTasks.reduce((s: number, t: any) => s + (t.hours || 0), 0) * 10) / 10}h</p></div>
              <div><p className="text-[10px] text-gray-400">Cost</p><p className="text-sm font-mono text-starlight-amber font-semibold">{formatCurrency(overheadTotal)}</p></div>
            </div>
          </summary>
          <div className="border-t border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-200 bg-gray-50/30">
                  <th className="text-left py-1.5 px-5 font-medium">Person</th>
                  <th className="text-left py-1.5 px-2 font-medium">Task</th>
                  <th className="text-left py-1.5 px-2 font-medium">Category</th>
                  <th className="text-left py-1.5 px-2 font-medium">Date</th>
                  <th className="text-right py-1.5 px-2 font-medium">Hours</th>
                  <th className="text-right py-1.5 px-2 font-medium">Rate</th>
                  <th className="text-right py-1.5 px-5 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {overheadTasks.map((t: any) => (
                  <tr key={t.task_id} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 px-5 text-navy font-medium">{t.freelancer_name}</td>
                    <td className="py-1.5 px-2 text-gray-600 max-w-[200px] truncate">{t.title}</td>
                    <td className="py-1.5 px-2">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                        t.category === "maintenance" ? "bg-starlight-amber/10 text-starlight-amber" : "bg-navy/10 text-navy"
                      }`}>{t.category === "workshop_general" ? "General" : t.category === "maintenance" ? "Maintenance" : "Other"}</span>
                    </td>
                    <td className="py-1.5 px-2 text-xs text-gray-500 font-mono">{t.worked_date || (t.logged_at ? new Date(t.logged_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—")}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{t.hours || "—"}h</td>
                    <td className="py-1.5 px-2 text-right text-xs font-mono text-gray-500">{t.hourly_rate ? formatCurrency(t.hourly_rate) : "—"}</td>
                    <td className="py-1.5 px-5 text-right font-mono font-semibold text-navy">{formatCurrency(t.cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50/30">
                  <td colSpan={4} className="py-2 px-5 text-right text-xs font-medium text-gray-500">Total</td>
                  <td className="py-2 px-2 text-right text-sm font-semibold text-navy font-mono">{Math.round(overheadTasks.reduce((s: number, t: any) => s + (t.hours || 0), 0) * 10) / 10}h</td>
                  <td className="py-2 px-2"></td>
                  <td className="py-2 px-5 text-right text-sm font-semibold text-navy font-mono">{formatCurrency(overheadTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </details>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          { key: "costs" as TabKey, label: "Job Costs", count: jobCosts.length },
          { key: "materials" as TabKey, label: "Materials", count: matSummary.length },
          { key: "time" as TabKey, label: "Time Entries", count: timeEntries.length },
          { key: "flags" as TabKey, label: "Flags", count: flags.length },
          { key: "accuracy" as TabKey, label: "Estimate Accuracy", count: accuracy.length },
          { key: "completed" as TabKey, label: "Completed", count: -1 },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={"px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap " + (
              tab === t.key ? "border-starlight-red text-navy" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            {t.label}{t.count >= 0 ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {/* TAB: Job Costs */}
      {tab === "costs" && (
        <div className="space-y-2">
          {jobCosts.length === 0 ? (
            <div className="card px-6 py-10 text-center text-gray-400 text-sm">No cost data yet. Complete some work orders to see costs.</div>
          ) : (
            jobCosts.map(job => (
              <div key={job.job_id} className="card overflow-hidden">
                <div className="px-5 py-3.5 flex items-center gap-4 cursor-pointer hover:bg-gray-50/50 transition-colors" onClick={() => loadScopeCosts(job.job_id)}>
                  <div className="text-gray-300">
                    {expandedJob === job.job_id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-navy">{job.job_name}</p>
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{job.job_number}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Event: {formatDate(job.event_date)}</p>
                  </div>
                  <div className="grid grid-cols-5 gap-3 text-right w-[500px] shrink-0">
                    <div><p className="text-[10px] text-gray-400">Quote</p><p className="text-sm font-mono text-navy">{formatCurrency(getQuote(job))}</p></div>
                    <div><p className="text-[10px] text-gray-400">WS Quote</p><p className="text-sm font-mono text-navy">{formatCurrency(workshopMargins[job.job_id]?.total_quoted || 0)}</p></div>
                    <div><p className="text-[10px] text-gray-400">Labour</p><p className="text-sm font-mono text-navy">{formatCurrency(getLabour(job))}</p></div>
                    <div><p className="text-[10px] text-gray-400">Material</p><p className="text-sm font-mono text-navy">{formatCurrency(getMaterial(job))}</p></div>
                    <div>
                      <p className="text-[10px] text-gray-400">WS Margin</p>
                      {(() => { const wm = workshopMargins[job.job_id]; const m = wm ? wm.total_margin : getMargin(job); return (
                        <p className={"text-sm font-mono font-semibold " + (m >= 0 ? "text-starlight-green" : "text-starlight-red")}>{formatCurrency(m)}</p>
                      ); })()}
                    </div>
                  </div>
                </div>
                {expandedJob === job.job_id && (
                  <div className="border-t border-gray-100 bg-gray-50/30 px-5 py-3">
                    {scopeCosts.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">No scope item costs yet</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-200">
                            <th className="py-1.5 w-10"></th>
                            <th className="text-left py-1.5 pl-3 font-medium">Scope Item</th>
                            <th className="text-right py-1.5 px-2 font-medium">Quoted</th>
                            <th className="text-right py-1.5 px-2 font-medium">PM Est</th>
                            <th className="text-right py-1.5 px-2 font-medium">WS Est</th>
                            <th className="text-right py-1.5 px-2 font-medium">Actual</th>
                            <th className="text-right py-1.5 px-2 font-medium">Margin</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scopeCosts.map((sc: any) => {
                            const best = sc.actual_total || sc.ws_est_total || sc.pm_est_cost || 0;
                            const quoted = sc.quoted_value || 0;
                            const marginPct = quoted > 0 && best > 0 ? ((quoted - best) / quoted) * 100 : null;
                            const isScopeExpanded = expandedScope === sc.scope_item_id;
                            return (
                              <Fragment key={sc.scope_item_id}>
                              <tr className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-100/50" onClick={() => loadWoDetails(sc.scope_item_id)}>
                                <td className="py-0 px-0 w-10">
                                  <div className={"w-10 h-full min-h-[2.5rem] flex items-center justify-center " + (isScopeExpanded ? "bg-navy/10" : "bg-gray-100 hover:bg-navy/10")}>
                                    {isScopeExpanded ? <ChevronDown className="h-4 w-4 text-navy" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                                  </div>
                                </td>
                                <td className="py-1.5 pl-3 text-navy font-medium max-w-[280px]">
                                  <Link href={`/jobs/${job.job_id}/scope/${sc.scope_item_id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                                    {sc.scope_name || "—"}
                                  </Link>
                                  {sc.selected_option && (
                                    <span className="ml-1.5 text-[9px] bg-green-50 text-starlight-green px-1 py-0.5 rounded">{sc.selected_option}</span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono text-gray-500">{quoted > 0 ? formatCurrency(quoted) : "—"}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-orange-500">{sc.pm_est_cost ? formatCurrency(sc.pm_est_cost) : "—"}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-blue-500">{sc.ws_est_total ? formatCurrency(sc.ws_est_total) : "—"}</td>
                                <td className="py-1.5 px-2 text-right font-mono font-medium text-navy">{sc.actual_total ? formatCurrency(sc.actual_total) : "—"}</td>
                                <td className={`py-1.5 px-2 text-right font-mono font-semibold ${
                                  marginPct === null ? "text-gray-300" :
                                  marginPct >= 40 ? "text-starlight-green" :
                                  marginPct >= 20 ? "text-amber-500" : "text-starlight-red"
                                }`}>
                                  {marginPct !== null ? `${marginPct.toFixed(0)}%` : "—"}
                                </td>
                              </tr>
                              {isScopeExpanded && woDetails.length > 0 && (
                                <>
                                <tr className="bg-white/80">
                                  <td colSpan={7} className="px-0 py-0">
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="text-[9px] text-gray-400 uppercase tracking-wider border-b border-gray-200/60">
                                          <th className="text-left py-1 pl-8 font-medium">Work Order</th>
                                          <th className="text-center py-1 px-1 font-medium">Status</th>
                                          <th className="text-right py-1 px-1 font-medium">Est Hrs</th>
                                          <th className="text-right py-1 px-1 font-medium">Act Hrs</th>
                                          <th className="text-right py-1 px-1 font-medium">Est Cost</th>
                                          <th className="text-right py-1 px-1 font-medium">Act Labour</th>
                                          <th className="text-right py-1 px-1 font-medium">Material</th>
                                          <th className="text-right py-1 pr-2 font-medium">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {woDetails.map((wo: any) => {
                                          const hasActuals = wo.act_total > 0;
                                          return (
                                            <tr key={wo.work_order_id} className="border-b border-gray-100/50 last:border-0">
                                              <td className="py-1 pl-8 text-gray-600 max-w-[220px] truncate">{wo.description || "—"}</td>
                                              <td className="py-1 px-1 text-center">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                                  wo.status === "Complete" ? "bg-starlight-green/10 text-starlight-green" :
                                                  wo.status === "In-Progress" ? "bg-starlight-blue/10 text-starlight-blue" :
                                                  "bg-gray-100 text-gray-500"
                                                }`}>{wo.status}</span>
                                              </td>
                                              <td className="py-1 px-1 text-right font-mono text-gray-500">{wo.estimated_duration_hrs ? `${wo.estimated_duration_hrs}h` : "—"}</td>
                                              <td className={`py-1 px-1 text-right font-mono ${wo.act_hours > 0 ? (wo.act_hours > (wo.estimated_duration_hrs || 999) ? "text-starlight-red font-medium" : "text-navy") : "text-gray-300"}`}>
                                                {wo.act_hours > 0 ? `${Math.round(wo.act_hours * 10) / 10}h` : "—"}
                                              </td>
                                              <td className="py-1 px-1 text-right font-mono text-blue-400">{wo.est_total > 0 ? formatCurrency(wo.est_total) : "—"}</td>
                                              <td className="py-1 px-1 text-right font-mono text-navy">{wo.act_labour > 0 ? formatCurrency(wo.act_labour) : "—"}</td>
                                              <td className="py-1 px-1 text-right font-mono text-navy">{wo.act_material > 0 ? formatCurrency(wo.act_material) : "—"}</td>
                                              <td className="py-1 pr-2 text-right font-mono font-medium text-navy">{hasActuals ? formatCurrency(wo.act_total) : "—"}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                                </>
                              )}
                              {isScopeExpanded && woDetails.length === 0 && (
                                <tr className="bg-white/80"><td colSpan={7} className="py-1.5 pl-8 text-[11px] text-gray-400">No work orders</td></tr>
                              )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB: Materials Reconciliation */}
      {tab === "materials" && (
        <div className="space-y-2">
          {matSummary.length === 0 ? (
            <div className="card px-6 py-10 text-center text-gray-400 text-sm">
              <Package className="h-8 w-8 mx-auto text-gray-300 mb-2" />
              No material data yet. Add BOM entries to work orders and process invoices to see reconciliation.
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400">
                Comparing BOM planned costs against confirmed invoice costs per job. Expand a row for material-level detail.
              </p>
              {matSummary.map(ms => (
                <div key={ms.job_id} className="card overflow-hidden">
                  <div className="px-5 py-3.5 flex items-center gap-4 cursor-pointer hover:bg-gray-50/50 transition-colors" onClick={() => loadMatDetails(ms.job_id)}>
                    <div className="text-gray-300">
                      {expandedMatJob === ms.job_id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-navy">{ms.job_name}</p>
                        <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{ms.job_number}</span>
                      </div>
                      <div className="flex gap-3 mt-1">
                        {ms.unmatched_invoices > 0 && (
                          <span className="text-[10px] text-starlight-amber font-medium">{ms.unmatched_invoices} invoice-only</span>
                        )}
                        {ms.unmatched_bom > 0 && (
                          <span className="text-[10px] text-starlight-blue font-medium">{ms.unmatched_bom} BOM-only</span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-right w-72 shrink-0">
                      <div><p className="text-[10px] text-gray-400">BOM Planned</p><p className="text-sm font-mono text-navy">{formatCurrency(ms.total_bom_cost)}</p></div>
                      <div><p className="text-[10px] text-gray-400">Invoiced</p><p className="text-sm font-mono text-navy">{formatCurrency(ms.total_inv_cost)}</p></div>
                      <div><p className="text-[10px] text-gray-400">Variance</p><p className={"text-sm font-mono font-semibold " + (ms.total_variance > 0 ? "text-starlight-red" : ms.total_variance < 0 ? "text-starlight-green" : "text-gray-500")}>{ms.total_variance > 0 ? "+" : ""}{formatCurrency(ms.total_variance)}</p></div>
                    </div>
                  </div>
                  {expandedMatJob === ms.job_id && (
                    <div className="border-t border-gray-100 bg-gray-50/30 px-5 py-3">
                      {matDetails.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">No material detail</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-200">
                              <th className="text-left py-1.5 font-medium">Material</th>
                              <th className="text-left py-1.5 px-2 font-medium">Category</th>
                              <th className="text-right py-1.5 px-2 font-medium">BOM Qty</th>
                              <th className="text-right py-1.5 px-2 font-medium">BOM Cost</th>
                              <th className="text-right py-1.5 px-2 font-medium">Inv Qty</th>
                              <th className="text-right py-1.5 px-2 font-medium">Inv Cost</th>
                              <th className="text-right py-1.5 px-2 font-medium">Variance</th>
                              <th className="text-center py-1.5 px-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {matDetails.map((md, idx) => (
                              <tr key={idx} className={"border-b border-gray-100 last:border-0 " + (md.match_status === "Invoice Only" ? "bg-amber-50/50" : md.match_status === "BOM Only" ? "bg-blue-50/50" : "")}>
                                <td className="py-1.5 text-navy font-medium max-w-[200px] truncate">{md.material_name}</td>
                                <td className="py-1.5 px-2 text-xs text-gray-500">{md.material_category}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-gray-600">{md.bom_qty > 0 ? md.bom_qty : "—"}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-gray-600">{md.bom_cost > 0 ? formatCurrency(md.bom_cost) : "—"}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-navy">{md.inv_qty > 0 ? md.inv_qty : "—"}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-navy">{md.inv_cost > 0 ? formatCurrency(md.inv_cost) : "—"}</td>
                                <td className={"py-1.5 px-2 text-right font-mono font-medium " + (md.variance > 0 ? "text-starlight-red" : md.variance < 0 ? "text-starlight-green" : "text-gray-500")}>
                                  {md.variance !== 0 ? ((md.variance > 0 ? "+" : "") + formatCurrency(md.variance)) : "—"}
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  <span className={"text-[10px] px-2 py-0.5 rounded-full font-medium " + (md.match_status === "Matched" ? "bg-starlight-green/10 text-starlight-green" : md.match_status === "Invoice Only" ? "bg-starlight-amber/10 text-starlight-amber" : "bg-starlight-blue/10 text-starlight-blue")}>
                                    {md.match_status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* TAB: Time Entries */}
      {tab === "time" && (
        <div className="card overflow-hidden">
          {timeEntries.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">No time entries yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-starlight-bg text-left text-[10px] text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">Person</th>
                    <th className="px-4 py-2 font-medium">WO / Description</th>
                    <th className="px-4 py-2 font-medium">Started</th>
                    <th className="px-4 py-2 font-medium">Ended</th>
                    <th className="px-4 py-2 font-medium text-right">Hours</th>
                    <th className="px-4 py-2 font-medium text-right">Rate</th>
                    <th className="px-4 py-2 font-medium text-right">Cost</th>
                    <th className="px-4 py-2 font-medium">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {timeEntries.map(e => (
                    <tr key={e.entry_id} className={"border-t border-gray-100 " + (!e.system_end_timestamp ? "bg-starlight-blue/5" : "") + (e.flag_note ? " border-l-2 border-l-starlight-amber" : "")}>
                      <td className="px-4 py-2.5 font-medium text-navy">
                        {e.freelancer_name}
                        {!e.system_end_timestamp && <span className="ml-1 text-[10px] text-starlight-blue">(active)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[200px] truncate">{e.activity_label}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-gray-500">
                        {new Date(e.system_start_timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-gray-500">
                        {e.system_end_timestamp ? new Date(e.system_end_timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-navy">{e.actual_hours ? `${e.actual_hours}h` : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-500">{e.applied_hourly_rate ? formatCurrency(e.applied_hourly_rate) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-navy">{e.entry_cost ? formatCurrency(e.entry_cost) : "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-starlight-amber max-w-[150px] truncate">{e.flag_note || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: Flags */}
      {tab === "flags" && (
        <div className="space-y-2">
          {flags.length === 0 ? (
            <div className="card px-6 py-10 text-center text-gray-400 text-sm">No flag notes from freelancers</div>
          ) : (
            flags.map(e => (
              <div key={e.entry_id} className="card px-5 py-4 border-l-4 border-l-starlight-amber">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-navy">{e.freelancer_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{e.activity_label}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(e.system_start_timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {e.actual_hours ? ` · ${e.actual_hours}h logged` : ""}
                    </p>
                  </div>
                  <Flag className="h-4 w-4 text-starlight-amber shrink-0" />
                </div>
                <p className="mt-2 text-sm text-gray-700 bg-amber-50 rounded-lg px-3 py-2">{e.flag_note}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB: Estimate Accuracy */}
      {tab === "accuracy" && (
        <div className="card overflow-hidden">
          {accuracy.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">No completed work orders to analyse yet. Accuracy data builds over time.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-starlight-bg text-left text-[10px] text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">Activity</th>
                    <th className="px-4 py-2 font-medium">Scope</th>
                    <th className="px-4 py-2 font-medium">Job</th>
                    <th className="px-4 py-2 font-medium text-right">Estimated</th>
                    <th className="px-4 py-2 font-medium text-right">Actual</th>
                    <th className="px-4 py-2 font-medium text-right">Variance</th>
                    <th className="px-4 py-2 font-medium text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {accuracy.map(a => {
                    const overUnder = a.variance_hrs > 0 ? "over" : a.variance_hrs < 0 ? "under" : "exact";
                    return (
                      <tr key={a.work_order_id} className="border-t border-gray-100">
                        <td className="px-4 py-2.5 font-medium text-navy">{a.activity_label}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[150px] truncate">{a.scope_name}</td>
                        <td className="px-4 py-2.5 text-xs font-mono text-gray-400">{a.job_number}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-600">{a.estimated_duration_hrs ? `${a.estimated_duration_hrs}h` : "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-navy">{a.actual_hours_total ? `${Math.round(a.actual_hours_total * 10) / 10}h` : "—"}</td>
                        <td className={"px-4 py-2.5 text-right font-mono font-medium " + (overUnder === "over" ? "text-starlight-red" : overUnder === "under" ? "text-starlight-green" : "text-gray-500")}>
                          {overUnder === "over" && <TrendingUp className="h-3 w-3 inline mr-1" />}
                          {overUnder === "under" && <TrendingDown className="h-3 w-3 inline mr-1" />}
                          {a.variance_hrs > 0 ? "+" : ""}{Math.round(a.variance_hrs * 10) / 10}h
                        </td>
                        <td className={"px-4 py-2.5 text-right font-mono font-semibold " + (
                          a.accuracy_pct !== null && a.accuracy_pct <= 110 ? "text-starlight-green" :
                          a.accuracy_pct !== null && a.accuracy_pct <= 150 ? "text-starlight-amber" : "text-starlight-red"
                        )}>
                          {a.accuracy_pct !== null ? `${Math.round(a.accuracy_pct)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: Completed Work */}
      {tab === "completed" && <CompletedWorkTab />}
    </div>
  );
}
