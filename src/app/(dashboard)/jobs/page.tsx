"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency } from "@/lib/utils";
import { DaysRemainingBadge } from "@/components/ui/badges";
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import type { Job } from "@/lib/types";

export default function JobsPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNewJob, setShowNewJob] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newJob, setNewJob] = useState({
    job_number: "",
    job_name: "",
    client_name: "",
    event_date: "",
    event_location: "",
  });

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

  const handleCreateJob = async () => {
    if (!newJob.job_name.trim()) return;
    setSaving(true);

    // 1. Create the job record
    const { data: jobData, error: jobErr } = await supabase
      .from("tbl_production_plan")
      .insert({
        job_number: newJob.job_number.trim() || null,
        job_name: newJob.job_name.trim(),
        client_name: newJob.client_name.trim() || null,
        event_date: newJob.event_date || null,
        event_location: newJob.event_location.trim() || null,
        job_status: "Active",
      })
      .select()
      .single();

    if (jobErr || !jobData) {
      toast.error("Failed to create job");
      setSaving(false);
      return;
    }

    // 2. Auto-create a quote container so lines can be added immediately
    await supabase.from("tbl_quotes").insert({
      job_id: jobData.job_id,
      quote_description: "Internal Build List",
      status: "Accepted",
      imported_at: new Date().toISOString(),
    });

    toast.success("Job created");
    setSaving(false);
    setShowNewJob(false);
    setNewJob({ job_number: "", job_name: "", client_name: "", event_date: "", event_location: "" });

    // Navigate to the new job
    window.location.href = `/jobs/${jobData.job_id}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Jobs</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {jobs.length} jobs in system
          </p>
        </div>
        <button
          onClick={() => setShowNewJob(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
        >
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
                <th className="px-4 py-2.5 font-medium text-gray-500">Job Number</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">Job Name</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">Client</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">Event Date</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 text-right">Budget</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => (
                <tr
                  key={job.job_id}
                  className="border-t border-gray-100 hover:bg-blue-50/30 cursor-pointer transition-colors"
                  onClick={() => (window.location.href = `/jobs/${job.job_id}`)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{job.job_number}</td>
                  <td className="px-4 py-3 font-medium text-navy">{job.job_name}</td>
                  <td className="px-4 py-3 text-gray-600">{job.client_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">{formatDate(job.event_date)}</span>
                      <DaysRemainingBadge eventDate={job.event_date} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(job.budget_allowance)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-starlight-green/10 text-starlight-green">
                      {job.job_status || "Active"}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {search ? "No matching jobs" : "No jobs found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* NEW JOB MODAL */}
      {showNewJob && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowNewJob(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-navy">New Job</h2>
              <button onClick={() => setShowNewJob(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Job Number</label>
                <input type="text" value={newJob.job_number} onChange={(e) => setNewJob({ ...newJob, job_number: e.target.value })}
                  placeholder="e.g. 13800" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Job Name <span className="text-starlight-red">*</span></label>
                <input type="text" value={newJob.job_name} onChange={(e) => setNewJob({ ...newJob, job_name: e.target.value })}
                  placeholder="e.g. Chelsea In Bloom 2026" autoFocus
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Client</label>
                <input type="text" value={newJob.client_name} onChange={(e) => setNewJob({ ...newJob, client_name: e.target.value })}
                  placeholder="e.g. Bello Flowers Ltd"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Event Date</label>
                  <input type="date" value={newJob.event_date} onChange={(e) => setNewJob({ ...newJob, event_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                  <input type="text" value={newJob.event_location} onChange={(e) => setNewJob({ ...newJob, event_location: e.target.value })}
                    placeholder="e.g. London"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowNewJob(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleCreateJob} disabled={saving || !newJob.job_name.trim()}
                className="px-5 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {saving ? "Creating..." : "Create Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
