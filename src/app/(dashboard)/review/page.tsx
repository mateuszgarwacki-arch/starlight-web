"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusBadge, DaysRemainingBadge } from "@/components/ui/badges";
import {
  TrendingUp, TrendingDown, Clock, AlertTriangle,
  ChevronDown, ChevronRight, DollarSign, BarChart3,
  Flag, RefreshCw, Package,
} from "lucide-react";
import Link from "next/link";

interface JobCost {
  job_id: number;
  job_number: string;
  job_name: string;
  event_date: string | null;
  budget_allowance: number | null;
  accepted_quote_value: number;
  job_est_labour_cost: number;
  job_actual_labour_cost: number;
  job_material_cost: number;
  job_total_actual_cost: number;
  job_margin: number;
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

type TabKey = "costs" | "time" | "flags" | "accuracy" | "materials";

export default function ReviewPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<TabKey>("costs");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get("tab") as TabKey;
    if (urlTab && ["costs", "time", "flags", "accuracy", "materials"].includes(urlTab)) setTab(urlTab);
  }, []);

  const [jobCosts, setJobCosts] = useState<JobCost[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntryRow[]>([]);
  const [flags, setFlags] = useState<TimeEntryRow[]>([]);
  const [accuracy, setAccuracy] = useState<EstVsActual[]>([]);
  const [matSummary, setMatSummary] = useState<MatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [scopeCosts, setScopeCosts] = useState<any[]>([]);
  const [expandedMatJob, setExpandedMatJob] = useState<number | null>(null);
  const [matDetails, setMatDetails] = useState<MatDetail[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [costRes, timeRes, accRes, matRes] = await Promise.all([
      supabase.from("qry_job_cost_summary").select("*").order("event_date"),
      supabase.from("tbl_wo_time_entries").select("*").order("system_start_timestamp", { ascending: false }).limit(50),
      supabase.from("qry_estimate_vs_actual").select("*"),
      supabase.from("qry_material_summary_by_job").select("*"),
    ]);

    if (costRes.data) setJobCosts(costRes.data);
    if (matRes.data) setMatSummary(matRes.data);

    if (accRes.data) {
      const scopeIds = accRes.data.map((a: any) => a.scope_item_id).filter(Boolean);
      const [scopeRes, jobRes] = await Promise.all([
        supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", [...new Set(scopeIds)]),
        supabase.from("tbl_production_plan").select("job_id, job_number"),
      ]);
      const sMap: Record<number, string> = {};
      (scopeRes.data || []).forEach((s: any) => { sMap[s.scope_item_id] = s.item_name; });
      const jMap: Record<number, string> = {};
      (jobRes.data || []).forEach((j: any) => { jMap[j.job_id] = j.job_number; });
      setAccuracy(accRes.data.map((a: any) => ({
        ...a,
        activity_label: a.verb_name || "—",
        scope_name: sMap[a.scope_item_id] || "—",
        job_number: jMap[a.job_id] || "—",
      })));
    }

    if (timeRes.data && timeRes.data.length > 0) {
      const fIds = [...new Set(timeRes.data.map((t: any) => t.freelancer_id))];
      const woIds = [...new Set(timeRes.data.map((t: any) => t.work_order_id))];
      const [fRes, woRes] = await Promise.all([
        supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", fIds),
        supabase.from("tbl_work_orders").select("work_order_id, scope_item_id, job_id, description").in("work_order_id", woIds),
      ]);
      const fMap: Record<number, string> = {};
      (fRes.data || []).forEach((f: any) => { fMap[f.freelancer_id] = f.freelancer_name; });
      const woMap: Record<number, any> = {};
      (woRes.data || []).forEach((w: any) => { woMap[w.work_order_id] = w; });
      const enriched = timeRes.data.map((t: any) => ({
        ...t,
        freelancer_name: fMap[t.freelancer_id] || "Unknown",
        activity_label: woMap[t.work_order_id]?.description || "—",
        scope_name: "—",
        job_number: "—",
      }));
      setTimeEntries(enriched);
      setFlags(enriched.filter((t: any) => t.flag_note));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadScopeCosts = async (jobId: number) => {
    if (expandedJob === jobId) { setExpandedJob(null); setScopeCosts([]); return; }
    setExpandedJob(jobId);
    const { data } = await supabase.from("qry_scopeitem_cost_summary").select("*").eq("job_id", jobId);
    setScopeCosts(data || []);
  };

  const loadMatDetails = async (jobId: number) => {
    if (expandedMatJob === jobId) { setExpandedMatJob(null); setMatDetails([]); return; }
    setExpandedMatJob(jobId);
    const { data } = await supabase.from("qry_material_reconciliation").select("*").eq("job_id", jobId);
    setMatDetails(data || []);
  };

  const totalQuoteValue = jobCosts.reduce((s, j) => s + j.accepted_quote_value, 0);
  const totalActualCost = jobCosts.reduce((s, j) => s + j.job_total_actual_cost, 0);
  const totalMargin = totalQuoteValue - totalActualCost;
  const totalMatVariance = matSummary.reduce((s, m) => s + m.total_variance, 0);

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

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Total Quote Value</p>
          <p className="text-lg font-semibold text-navy">{formatCurrency(totalQuoteValue)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Total Actual Cost</p>
          <p className="text-lg font-semibold text-navy">{formatCurrency(totalActualCost)}</p>
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          { key: "costs" as TabKey, label: "Job Costs", count: jobCosts.length },
          { key: "materials" as TabKey, label: "Materials", count: matSummary.length },
          { key: "time" as TabKey, label: "Time Entries", count: timeEntries.length },
          { key: "flags" as TabKey, label: "Flags", count: flags.length },
          { key: "accuracy" as TabKey, label: "Estimate Accuracy", count: accuracy.length },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={"px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap " + (
              tab === t.key ? "border-starlight-red text-navy" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            {t.label} ({t.count})
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
                  <div className="grid grid-cols-4 gap-4 text-right w-96 shrink-0">
                    <div><p className="text-[10px] text-gray-400">Quote</p><p className="text-sm font-mono text-navy">{formatCurrency(job.accepted_quote_value)}</p></div>
                    <div><p className="text-[10px] text-gray-400">Labour</p><p className="text-sm font-mono text-navy">{formatCurrency(job.job_actual_labour_cost)}</p></div>
                    <div><p className="text-[10px] text-gray-400">Material</p><p className="text-sm font-mono text-navy">{formatCurrency(job.job_material_cost)}</p></div>
                    <div><p className="text-[10px] text-gray-400">Margin</p><p className={"text-sm font-mono font-semibold " + (job.job_margin >= 0 ? "text-starlight-green" : "text-starlight-red")}>{formatCurrency(job.job_margin)}</p></div>
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
                            <th className="text-left py-1.5 font-medium">Scope Item</th>
                            <th className="text-right py-1.5 px-2 font-medium">WOs</th>
                            <th className="text-right py-1.5 px-2 font-medium">Est. Labour</th>
                            <th className="text-right py-1.5 px-2 font-medium">Actual Labour</th>
                            <th className="text-right py-1.5 px-2 font-medium">Materials</th>
                            <th className="text-right py-1.5 px-2 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scopeCosts.map((sc: any) => (
                            <tr key={sc.scope_item_id} className="border-b border-gray-100 last:border-0">
                              <td className="py-1.5 text-navy font-medium">{sc.item_name || "—"}</td>
                              <td className="py-1.5 px-2 text-right text-gray-600">{sc.wo_count}</td>
                              <td className="py-1.5 px-2 text-right font-mono text-gray-500">{formatCurrency(sc.scope_est_labour_cost)}</td>
                              <td className="py-1.5 px-2 text-right font-mono text-navy">{formatCurrency(sc.scope_actual_labour_cost)}</td>
                              <td className="py-1.5 px-2 text-right font-mono text-navy">{formatCurrency(sc.scope_material_cost)}</td>
                              <td className="py-1.5 px-2 text-right font-mono font-semibold text-navy">{formatCurrency(sc.scope_total_actual_cost)}</td>
                            </tr>
                          ))}
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
    </div>
  );
}
