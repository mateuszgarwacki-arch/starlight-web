"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DaysRemainingBadge } from "@/components/ui/badges";
import {
  Briefcase, ClipboardList, Package, Users, AlertCircle,
  Flag, FileText, Clock, RefreshCw, ShoppingCart, Zap,
} from "lucide-react";
import Link from "next/link";
import type { DashUpcomingJob, ManpowerDemand } from "@/lib/types";

function StatCard({ label, value, icon: Icon, color = "text-navy", href }: { label: string; value: string | number; icon: React.ElementType; color?: string; href?: string }) {
  const inner = (
    <div className={"card px-5 py-4 flex items-center gap-4" + (href ? " hover:shadow-md transition-shadow" : "")}>
      <div className={`p-2.5 rounded-lg bg-starlight-bg ${color}`}><Icon className="h-5 w-5" /></div>
      <div><p className="text-2xl font-semibold text-navy">{value}</p><p className="text-xs text-gray-500">{label}</p></div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function JobCard({ job }: { job: DashUpcomingJob }) {
  const total = job.total_wos || 0;
  const done = job.wo_done || 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <Link href={`/jobs/${job.job_id}`} className="card px-5 py-4 hover:shadow-md transition-shadow block">
      <div className="flex items-start justify-between mb-3">
        <div><p className="text-xs text-gray-400 font-mono">{job.job_number}</p><p className="font-semibold text-navy text-sm mt-0.5">{job.job_name}</p></div>
        <DaysRemainingBadge eventDate={job.event_date} />
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3"><span>{formatDate(job.event_date)}</span><span>&middot;</span><span>Scope: {job.scope_prog}</span></div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs"><span className="text-gray-500">Work Orders</span><span className="font-medium text-navy">{done}/{total}</span></div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-starlight-green rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="flex gap-3 text-[10px] text-gray-400">
          {job.wo_plan > 0 && <span>{job.wo_plan} planned</span>}
          {job.wo_rdy > 0 && <span>{job.wo_rdy} ready</span>}
          {job.wo_act > 0 && <span className="text-starlight-blue">{job.wo_act} active</span>}
          {job.wo_done > 0 && <span className="text-starlight-green">{job.wo_done} done</span>}
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<DashUpcomingJob[]>([]);
  const [manpower, setManpower] = useState<ManpowerDemand[]>([]);
  const [procurement, setProcurement] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [activeWorkers, setActiveWorkers] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [jobsRes, manpowerRes, procRes, flagsRes, invoiceRes, jobStatusRes] = await Promise.all([
        supabase.from("qry_dash_upcoming_jobs").select("*"),
        supabase.from("qry_manpower_demand").select("*"),
        supabase.from("qry_procurement_needed").select("*").limit(15),
        supabase.from("tbl_wo_time_entries").select("entry_id, work_order_id, freelancer_id, flag_note, actual_hours, entry_cost, system_start_timestamp").not("flag_note", "is", null).order("system_start_timestamp", { ascending: false }).limit(10),
        supabase.from("tbl_invoices").select("invoice_id, supplier, invoice_number, invoice_date, total_value, status").eq("status", "Processed").order("uploaded_at", { ascending: false }).limit(5),
        supabase.from("tbl_production_plan").select("job_id, job_status"),
      ]);

      // Filter out deleted jobs
      const deletedJobIds = new Set((jobStatusRes.data || []).filter((j: any) => j.job_status === "Deleted").map((j: any) => j.job_id));
      const activeJobs = (jobsRes.data || []).filter((j: any) => !deletedJobIds.has(j.job_id) && ((j.total_wos || 0) > 0 || j.scope_prog !== "0/0"));
      if (activeJobs) setJobs(activeJobs);
      if (manpowerRes.data) setManpower(manpowerRes.data);
      setProcurement(procRes.data || []);
      setRecentInvoices(invoiceRes.data || []);

      // Enrich flags with context
      const rawFlags = flagsRes.data || [];
      if (rawFlags.length > 0) {
        const woIds = [...new Set(rawFlags.map((f: any) => f.work_order_id))];
        const fIds = [...new Set(rawFlags.map((f: any) => f.freelancer_id))];
        const [woRes, fRes] = await Promise.all([
          supabase.from("tbl_work_orders").select("work_order_id, job_id, scope_item_id, description").in("work_order_id", woIds),
          supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", fIds),
        ]);
        const woMap: Record<number, any> = {};
        (woRes.data || []).forEach((w: any) => { woMap[w.work_order_id] = w; });
        const fMap: Record<number, string> = {};
        (fRes.data || []).forEach((f: any) => { fMap[f.freelancer_id] = f.freelancer_name; });
        // Get job + scope names
        const jobIds = [...new Set(Object.values(woMap).map((w: any) => w.job_id).filter(Boolean))];
        const scopeIds = [...new Set(Object.values(woMap).map((w: any) => w.scope_item_id).filter(Boolean))];
        const [jobNamesRes, scopeNamesRes] = await Promise.all([
          jobIds.length > 0 ? supabase.from("tbl_production_plan").select("job_id, job_name, job_number").in("job_id", jobIds) : { data: [] },
          scopeIds.length > 0 ? supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds) : { data: [] },
        ]);
        const jobNameMap: Record<number, any> = {};
        (jobNamesRes.data || []).forEach((j: any) => { jobNameMap[j.job_id] = j; });
        const scopeNameMap: Record<number, string> = {};
        (scopeNamesRes.data || []).forEach((s: any) => { scopeNameMap[s.scope_item_id] = s.item_name; });
        setFlags(rawFlags.map((f: any) => {
          const wo = woMap[f.work_order_id] || {};
          const job = jobNameMap[wo.job_id] || {};
          return { ...f, freelancer_name: fMap[f.freelancer_id] || "Unknown", wo_description: wo.description || "", job_name: job.job_name || "", job_number: job.job_number || "", scope_name: scopeNameMap[wo.scope_item_id] || "" };
        }));
      }

      // Get currently active workers (open time entries)
      const { data: openEntries } = await supabase.from("tbl_wo_time_entries")
        .select("entry_id, freelancer_id, work_order_id, system_start_timestamp")
        .is("system_end_timestamp", null);
      if (openEntries && openEntries.length > 0) {
        const fIds = [...new Set(openEntries.map((e: any) => e.freelancer_id))];
        const { data: names } = await supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", fIds);
        const nameMap: Record<number, string> = {};
        (names || []).forEach((n: any) => { nameMap[n.freelancer_id] = n.freelancer_name; });
        setActiveWorkers(openEntries.map((e: any) => ({ ...e, name: nameMap[e.freelancer_id] || "Unknown" })));
      }
      setLoading(false);
    }
    load();
  }, []);

  const totalHrs = manpower.reduce((s, m) => s + (m.total_hrs || 0), 0);
  const activeWos = jobs.reduce((s, j) => s + (j.wo_act || 0), 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-gray-400 text-sm">Loading dashboard...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-navy">Dashboard</h1><p className="text-sm text-gray-400 mt-0.5">Starlight Production Control</p></div>
        <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-navy hover:bg-gray-100 rounded-lg transition-colors"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Active Jobs" value={jobs.length} icon={Briefcase} color="text-starlight-blue" href="/jobs" />
        <StatCard label="Active Work Orders" value={activeWos} icon={ClipboardList} color="text-starlight-amber" href="/workshop" />
        <StatCard label="Items to Order" value={procurement.length} icon={Package} color={procurement.length > 0 ? "text-starlight-red" : "text-gray-400"} />
        <StatCard label="Unread Flags" value={flags.length} icon={Flag} color={flags.length > 0 ? "text-starlight-red" : "text-gray-400"} href="/review?tab=flags" />
        <StatCard label="Outstanding Hours" value={`${Math.round(totalHrs)}h`} icon={Users} color="text-starlight-green" href="/capacity" />
      </div>

      {/* Active workers banner */}
      {activeWorkers.length > 0 && (
        <div className="card px-5 py-3 border-l-4 border-l-starlight-blue">
          <div className="flex items-center gap-2 mb-1"><Zap className="h-4 w-4 text-starlight-blue" /><span className="text-xs font-semibold text-navy">Active Now ({activeWorkers.length})</span></div>
          <div className="flex flex-wrap gap-2">
            {activeWorkers.map((w: any) => (
              <span key={w.entry_id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-starlight-blue/10 text-starlight-blue font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-starlight-blue animate-pulse" />{w.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Two-column: Procurement + Flags */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Procurement panel */}
        <div>
          <h2 className="text-sm font-semibold text-navy mb-3 flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Procurement Actions</h2>
          <div className="card overflow-hidden">
            {procurement.length === 0 ? (
              <div className="px-5 py-6 text-center text-gray-400 text-sm">No items pending order</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-starlight-bg text-left text-[10px] text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">Material</th>
                    <th className="px-4 py-2 font-medium text-right">Qty</th>
                    <th className="px-4 py-2 font-medium">Job</th>
                  </tr></thead>
                  <tbody>
                    {procurement.map((p: any, idx: number) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-medium text-navy">{p.material || p.item_description || "—"}</td>
                        <td className="px-4 py-2 text-right font-mono text-gray-600">{p.quantity || "—"} {p.unit || ""}</td>
                        <td className="px-4 py-2 text-gray-500">{p.job_number || p.job_name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {procurement.length >= 15 && <div className="px-4 py-2 text-[10px] text-gray-400 text-center border-t border-gray-100">Showing first 15 — view all in Workshop</div>}
              </div>
            )}
          </div>
        </div>

        {/* Flags panel */}
        <div>
          <h2 className="text-sm font-semibold text-navy mb-3 flex items-center gap-2"><Flag className="h-4 w-4" /> Freelancer Flags</h2>
          <div className="card overflow-hidden">
            {flags.length === 0 ? (
              <div className="px-5 py-6 text-center text-gray-400 text-sm">No flagged entries</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {flags.slice(0, 8).map((f: any) => (
                  <div key={f.entry_id} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <Flag className="h-3.5 w-3.5 text-starlight-amber mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-700 line-clamp-2">{f.flag_note}</p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          <span className="font-medium text-navy">{f.freelancer_name}</span>
                          {f.wo_description && <> · <span className="text-gray-500">{f.wo_description}</span></>}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {f.job_name && <><span>{f.job_number || f.job_name}</span> · </>}
                          {f.scope_name && <><span>{f.scope_name}</span> · </>}
                          {f.actual_hours ? `${f.actual_hours}h` : ""} {f.entry_cost ? `· ${formatCurrency(f.entry_cost)}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {flags.length > 8 && <div className="px-4 py-2 text-[10px] text-gray-400 text-center">+{flags.length - 8} more — <Link href="/review" className="text-starlight-blue hover:underline">View all</Link></div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Job cards */}
      <div>
        <h2 className="text-sm font-semibold text-navy mb-3">Active Jobs</h2>
        {jobs.length === 0 ? (
          <div className="card px-5 py-8 text-center text-gray-400 text-sm">No active jobs found</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobs.map((job) => (<JobCard key={job.job_id} job={job} />))}
          </div>
        )}
      </div>

      {/* Two-column: Recent Invoices + Manpower */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent invoices */}
        <div>
          <h2 className="text-sm font-semibold text-navy mb-3 flex items-center gap-2"><FileText className="h-4 w-4" /> Recent Invoices</h2>
          <div className="card overflow-hidden">
            {recentInvoices.length === 0 ? (
              <div className="px-5 py-6 text-center text-gray-400 text-sm">No invoices processed yet — <Link href="/invoices" className="text-starlight-blue hover:underline">upload one</Link></div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentInvoices.map((inv: any) => (
                  <Link key={inv.invoice_id} href="/invoices" className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-xs font-medium text-navy">{inv.supplier}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{inv.invoice_number || "No ref"} · {inv.invoice_date ? formatDate(inv.invoice_date) : "—"}</p>
                    </div>
                    <span className="text-xs font-mono text-navy">{inv.total_value ? formatCurrency(inv.total_value) : "—"}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Manpower demand */}
        <div>
          <h2 className="text-sm font-semibold text-navy mb-3 flex items-center gap-2"><Clock className="h-4 w-4" /> Manpower Demand</h2>
          <div className="card overflow-hidden">
            {manpower.length === 0 ? (
              <div className="px-5 py-6 text-center text-gray-400 text-sm">No demand data</div>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="bg-starlight-bg text-left text-[10px] text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-4 py-2 font-medium text-right">Ready</th>
                  <th className="px-4 py-2 font-medium text-right">Active</th>
                </tr></thead>
                <tbody>
                  {manpower.map((row) => (
                    <tr key={row.department} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium text-navy">{row.department}</td>
                      <td className="px-4 py-2 text-right font-mono">{Math.round(row.total_hrs || 0)}h</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-500">{Math.round(row.hrs_ready || 0)}h</td>
                      <td className="px-4 py-2 text-right font-mono text-starlight-blue">{Math.round(row.hrs_in_progress || 0)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
