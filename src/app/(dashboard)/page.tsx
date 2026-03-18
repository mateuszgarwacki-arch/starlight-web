"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DaysRemainingBadge } from "@/components/ui/badges";
import {
  Briefcase,
  ClipboardList,
  Package,
  Flag,
  Users,
  AlertCircle,
} from "lucide-react";
import type {
  DashUpcomingJob,
  ManpowerDemand,
} from "@/lib/types";

function StatCard({
  label,
  value,
  icon: Icon,
  color = "text-navy",
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <div className="card px-5 py-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg bg-starlight-bg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-navy">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function JobCard({ job }: { job: DashUpcomingJob }) {
  const total = job.total_wos || 0;
  const done = job.wo_done || 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <a
      href={`/jobs/${job.job_id}`}
      className="card px-5 py-4 hover:shadow-md transition-shadow block"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-gray-400 font-mono">{job.job_number}</p>
          <p className="font-semibold text-navy text-sm mt-0.5">
            {job.job_name}
          </p>
        </div>
        <DaysRemainingBadge eventDate={job.event_date} />
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
        <span>{formatDate(job.event_date)}</span>
        <span>&middot;</span>
        <span>Scope: {job.scope_prog}</span>
      </div>

      {/* WO progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Work Orders</span>
          <span className="font-medium text-navy">
            {done}/{total}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-starlight-green rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex gap-3 text-[10px] text-gray-400">
          {job.wo_plan > 0 && <span>{job.wo_plan} planned</span>}
          {job.wo_rdy > 0 && <span>{job.wo_rdy} ready</span>}
          {job.wo_act > 0 && (
            <span className="text-starlight-blue">{job.wo_act} active</span>
          )}
          {job.wo_done > 0 && (
            <span className="text-starlight-green">{job.wo_done} done</span>
          )}
        </div>
      </div>
    </a>
  );
}

export default function DashboardPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<DashUpcomingJob[]>([]);
  const [manpower, setManpower] = useState<ManpowerDemand[]>([]);
  const [procurementCount, setProcurementCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [jobsRes, manpowerRes, procRes] = await Promise.all([
        supabase.from("qry_dash_upcoming_jobs").select("*"),
        supabase.from("qry_manpower_demand").select("*"),
        supabase.from("qry_procurement_needed").select("material", { count: "exact" }),
      ]);

      if (jobsRes.data) setJobs(jobsRes.data);
      if (manpowerRes.data) setManpower(manpowerRes.data);
      if (procRes.count !== null) setProcurementCount(procRes.count);

      setLoading(false);
    }
    load();
  }, []);

  const totalHrs = manpower.reduce((s, m) => s + (m.total_hrs || 0), 0);
  const activeWos = jobs.reduce((s, j) => s + (j.wo_act || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400 text-sm">
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-navy">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Starlight Production Control
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Jobs"
          value={jobs.length}
          icon={Briefcase}
          color="text-starlight-blue"
        />
        <StatCard
          label="Active Work Orders"
          value={activeWos}
          icon={ClipboardList}
          color="text-starlight-amber"
        />
        <StatCard
          label="Items to Order"
          value={procurementCount}
          icon={Package}
          color="text-starlight-red"
        />
        <StatCard
          label="Outstanding Hours"
          value={`${Math.round(totalHrs)}h`}
          icon={Users}
          color="text-starlight-green"
        />
      </div>

      {/* Job cards */}
      <div>
        <h2 className="text-sm font-semibold text-navy mb-3">
          Upcoming Jobs
        </h2>
        {jobs.length === 0 ? (
          <div className="card px-5 py-8 text-center text-gray-400 text-sm">
            No active jobs found
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <JobCard key={job.job_id} job={job} />
            ))}
          </div>
        )}
      </div>

      {/* Manpower demand */}
      {manpower.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-navy mb-3">
            Manpower Demand by Department
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-starlight-bg text-left">
                  <th className="px-4 py-2.5 font-medium text-gray-500">
                    Department
                  </th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 text-right">
                    Total Hrs
                  </th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 text-right">
                    Not Started
                  </th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 text-right">
                    Ready
                  </th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 text-right">
                    In Progress
                  </th>
                </tr>
              </thead>
              <tbody>
                {manpower.map((row) => (
                  <tr
                    key={row.department}
                    className="border-t border-gray-100"
                  >
                    <td className="px-4 py-2.5 font-medium text-navy">
                      {row.department}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {Math.round(row.total_hrs || 0)}h
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-400">
                      {Math.round(row.hrs_not_started || 0)}h
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {Math.round(row.hrs_ready || 0)}h
                    </td>
                    <td className="px-4 py-2.5 text-right text-starlight-blue">
                      {Math.round(row.hrs_in_progress || 0)}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Procurement needed */}
      <div>
        <h2 className="text-sm font-semibold text-navy mb-3">
          Procurement Actions
        </h2>
        {procurementCount === 0 ? (
          <div className="card px-5 py-6 text-center text-gray-400 text-sm">
            No items pending order
          </div>
        ) : (
          <div className="card px-5 py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-starlight-red" />
              <p className="text-sm">
                <span className="font-semibold text-navy">
                  {procurementCount} materials
                </span>{" "}
                <span className="text-gray-500">
                  need ordering across active jobs
                </span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
