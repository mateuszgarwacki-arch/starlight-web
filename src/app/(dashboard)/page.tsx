"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DaysRemainingBadge } from "@/components/ui/badges";
import {
  Briefcase, ClipboardList, Package, Users, AlertCircle,
  Flag, FileText, Clock, RefreshCw, ShoppingCart, Zap, Printer,
  Bell, AlertOctagon, Inbox,
} from "lucide-react";
import Link from "next/link";
import type { DashUpcomingJob, ManpowerDemand } from "@/lib/types";

function StatCard({ label, value, icon: Icon, color = "text-navy", href }: { label: string; value: string | number; icon: React.ElementType; color?: string; href?: string }) {
  const inner = (
    <div className={"card px-5 py-4 flex items-center gap-4" + (href ? " hover:shadow-md transition-shadow" : "")}>
      <div className={`p-2.5 rounded-lg bg-base ${color}`}><Icon className="h-5 w-5" /></div>
      <div><p className="text-2xl font-semibold text-navy">{value}</p><p className="text-xs text-muted">{label}</p></div>
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
        <div><p className="text-xs text-muted font-mono">{job.job_number}</p><p className="font-semibold text-navy text-sm mt-0.5">{job.job_name}</p></div>
        <DaysRemainingBadge eventDate={job.event_date} />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted mb-3"><span>{formatDate(job.event_date)}</span><span>&middot;</span><span>Scope: {job.scope_prog}</span></div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs"><span className="text-muted">Work Orders</span><span className="font-medium text-navy">{done}/{total}</span></div>
        <div className="h-1.5 bg-surface-mid rounded-full overflow-hidden"><div className="h-full bg-starlight-green rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="flex gap-3 text-[10px] text-muted">
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
  const [staleTravellers, setStaleTravellers] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Single RPC call replaces 16+ individual queries
      const { data, error } = await supabase.rpc("rpc_dashboard_data");

      if (error || !data) {
        console.error("Dashboard RPC failed:", error);
        setLoading(false);
        return;
      }

      setJobs(data.jobs || []);
      setManpower(data.manpower || []);
      setProcurement(data.procurement || []);
      setFlags(data.flags || []);
      setRecentInvoices(data.recentInvoices || []);
      setStaleTravellers(data.staleTravellers || []);
      setNotifications(data.notifications || []);
      setInboxCount(data.inboxCount || 0);
      setActiveWorkers(data.activeWorkers || []);
      setLoading(false);
    }
    load();
  }, []);

  const totalHrs = manpower.reduce((s, m) => s + (m.total_hrs || 0), 0);
  const activeWos = jobs.reduce((s, j) => s + (j.wo_act || 0), 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted text-sm">Loading dashboard...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-navy">Dashboard</h1><p className="text-sm text-muted mt-0.5">Starlight Production Control</p></div>
        <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-navy hover:bg-surface-mid rounded-lg transition-colors"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard label="Active Jobs" value={jobs.length} icon={Briefcase} color="text-starlight-blue" href="/jobs" />
        <StatCard label="Active Work Orders" value={activeWos} icon={ClipboardList} color="text-starlight-amber" href="/workshop" />
        <StatCard label="Items to Order" value={procurement.length} icon={Package} color={procurement.length > 0 ? "text-starlight-red" : "text-muted"} href="/orders" />
        <StatCard label="Unread Flags" value={flags.length} icon={Flag} color={flags.length > 0 ? "text-starlight-red" : "text-muted"} href="/review?tab=flags" />
        <StatCard label="Workshop Inbox" value={inboxCount} icon={Inbox} color={inboxCount > 0 ? "text-starlight-amber" : "text-muted"} href="/review/inbox" />
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
        {/* Notifications panel */}
        <div>
          <h2 className="text-sm font-semibold text-navy mb-3 flex items-center gap-2">
            <Bell className="h-4 w-4" /> Notifications
            {notifications.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-starlight-red text-white">
                {notifications.length}
              </span>
            )}
          </h2>
          <div className="card overflow-hidden">
            {notifications.length === 0 ? (
              <div className="px-5 py-6 text-center text-muted text-sm">All caught up</div>
            ) : (
              <div className="divide-y divide-subtle">
                {notifications.slice(0, 5).map((n: any) => {
                  const sevIcon = n.severity === "urgent" ? AlertOctagon : n.severity === "warning" ? AlertCircle : Bell;
                  const SevIcon = sevIcon;
                  const sevColor = n.severity === "urgent" ? "text-starlight-red" : n.severity === "warning" ? "text-starlight-amber" : "text-starlight-blue";
                  const ago = (() => {
                    const diff = Date.now() - new Date(n.created_at).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 1) return "Just now";
                    if (mins < 60) return `${mins}m ago`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs}h ago`;
                    return `${Math.floor(hrs / 24)}d ago`;
                  })();
                  const inner = (
                    <div className="flex items-start gap-3 px-4 py-3 hover:bg-surface-dim transition-colors">
                      <SevIcon className={`h-4 w-4 mt-0.5 shrink-0 ${sevColor}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-navy">{n.title}</p>
                        {n.detail && <p className="text-[10px] text-muted mt-0.5 line-clamp-1">{n.detail}</p>}
                        <p className="text-[10px] text-faint mt-0.5">{ago}</p>
                      </div>
                    </div>
                  );
                  return n.action_url ? (
                    <Link key={n.notification_id} href={n.action_url}>{inner}</Link>
                  ) : (
                    <div key={n.notification_id}>{inner}</div>
                  );
                })}
                {notifications.length > 5 && (
                  <div className="px-4 py-2 text-[10px] text-muted text-center border-t border-subtle">
                    +{notifications.length - 5} more — <Link href="/notifications" className="text-starlight-blue hover:underline">View all</Link>
                  </div>
                )}
                <div className="px-4 py-2 text-center border-t border-subtle">
                  <Link href="/notifications" className="text-xs text-starlight-blue hover:underline font-medium">
                    Open notifications
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-navy mb-3 flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Procurement Actions</h2>
          <div className="card overflow-hidden">
            {procurement.length === 0 ? (
              <div className="px-5 py-6 text-center text-muted text-sm">No items pending order</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-base text-left text-[10px] text-muted uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">Material</th>
                    <th className="px-4 py-2 font-medium text-right">Qty</th>
                    <th className="px-4 py-2 font-medium">Job</th>
                  </tr></thead>
                  <tbody>
                    {procurement.map((p: any, idx: number) => (
                      <tr key={idx} className="border-t border-subtle">
                        <td className="px-4 py-2 font-medium text-navy">{p.material_name || p.item_description || "—"}</td>
                        <td className="px-4 py-2 text-right font-mono text-muted">{p.quantity || "—"} {p.unit || ""}</td>
                        <td className="px-4 py-2 text-muted">{p.job_number || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {procurement.length >= 15 && <div className="px-4 py-2 text-[10px] text-muted text-center border-t border-subtle">Showing first 15 — <Link href="/orders" className="text-starlight-blue hover:underline">View all orders</Link></div>}
              </div>
            )}
          </div>
        </div>

        {/* Flags panel */}
        <div>
          <h2 className="text-sm font-semibold text-navy mb-3 flex items-center gap-2"><Flag className="h-4 w-4" /> Freelancer Flags</h2>
          <div className="card overflow-hidden">
            {flags.length === 0 ? (
              <div className="px-5 py-6 text-center text-muted text-sm">No flagged entries</div>
            ) : (
              <div className="divide-y divide-subtle">
                {flags.slice(0, 8).map((f: any) => (
                  <div key={f.entry_id} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <Flag className="h-3.5 w-3.5 text-starlight-amber mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground line-clamp-2">{f.flag_note}</p>
                        <p className="text-[10px] text-muted mt-1">
                          <span className="font-medium text-navy">{f.freelancer_name}</span>
                          {f.wo_description && <> · <span className="text-muted">{f.wo_description}</span></>}
                        </p>
                        <p className="text-[10px] text-muted">
                          {f.job_name && <><span>{f.job_number || f.job_name}</span> · </>}
                          {f.scope_name && <><span>{f.scope_name}</span> · </>}
                          {f.actual_hours ? `${f.actual_hours}h` : ""} {f.entry_cost ? `· ${formatCurrency(f.entry_cost)}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {flags.length > 8 && <div className="px-4 py-2 text-[10px] text-muted text-center">+{flags.length - 8} more — <Link href="/review" className="text-starlight-blue hover:underline">View all</Link></div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Job cards */}
      <div>
        <h2 className="text-sm font-semibold text-navy mb-3">Active Jobs</h2>
        {jobs.length === 0 ? (
          <div className="card px-5 py-8 text-center text-muted text-sm">No active jobs found</div>
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
              <div className="px-5 py-6 text-center text-muted text-sm">No invoices processed yet — <Link href="/invoices" className="text-starlight-blue hover:underline">upload one</Link></div>
            ) : (
              <div className="divide-y divide-subtle">
                {recentInvoices.map((inv: any) => (
                  <Link key={inv.invoice_id} href="/invoices" className="flex items-center justify-between px-4 py-3 hover:bg-surface-dim transition-colors">
                    <div>
                      <p className="text-xs font-medium text-navy">{inv.supplier}</p>
                      <p className="text-[10px] text-muted mt-0.5">{inv.invoice_number || "No ref"} · {inv.invoice_date ? formatDate(inv.invoice_date) : "—"}</p>
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
              <div className="px-5 py-6 text-center text-muted text-sm">No demand data</div>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="bg-base text-left text-[10px] text-muted uppercase tracking-wider">
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-4 py-2 font-medium text-right">Ready</th>
                  <th className="px-4 py-2 font-medium text-right">Active</th>
                </tr></thead>
                <tbody>
                  {manpower.map((row) => (
                    <tr key={row.department} className="border-t border-subtle">
                      <td className="px-4 py-2 font-medium text-navy">{row.department}</td>
                      <td className="px-4 py-2 text-right font-mono">{Math.round(row.total_hrs || 0)}h</td>
                      <td className="px-4 py-2 text-right font-mono text-muted">{Math.round(row.hrs_ready || 0)}h</td>
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
