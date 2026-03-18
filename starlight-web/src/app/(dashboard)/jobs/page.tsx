"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency } from "@/lib/utils";
import { DaysRemainingBadge } from "@/components/ui/badges";
import { Plus, Search } from "lucide-react";
import type { Job } from "@/lib/types";

export default function JobsPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("tbl_production_plan")
        .select("*")
        .order("event_date", { ascending: true });
      if (data) setJobs(data);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = jobs.filter(
    (j) =>
      !search ||
      (j.job_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (j.job_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (j.client_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Jobs</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {jobs.length} jobs in system
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
          <Plus className="h-4 w-4" />
          New Job
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by job name, number, or client..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue focus:border-transparent bg-white"
        />
      </div>

      {/* Jobs table */}
      {loading ? (
        <div className="card px-5 py-8 text-center text-gray-400 text-sm animate-pulse">
          Loading jobs...
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-starlight-bg text-left">
                <th className="px-4 py-2.5 font-medium text-gray-500">
                  Job Number
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-500">
                  Job Name
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-500">
                  Client
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-500">
                  Event Date
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-500 text-right">
                  Budget
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-500 text-center">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => (
                <tr
                  key={job.job_id}
                  className="border-t border-gray-100 hover:bg-blue-50/30 cursor-pointer transition-colors"
                  onClick={() =>
                    (window.location.href = `/jobs/${job.job_id}`)
                  }
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {job.job_number}
                  </td>
                  <td className="px-4 py-3 font-medium text-navy">
                    {job.job_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {job.client_name}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">
                        {formatDate(job.event_date)}
                      </span>
                      <DaysRemainingBadge eventDate={job.event_date} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {formatCurrency(job.budget_allowance)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-starlight-green/10 text-starlight-green">
                      {job.job_status || "Active"}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    {search ? "No matching jobs" : "No jobs found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
