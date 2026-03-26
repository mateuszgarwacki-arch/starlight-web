"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { FileText, TrendingUp, PoundSterling, BarChart3 } from "lucide-react";

interface JobOption { job_id: number; job_number: string; job_name: string; }

const REPORTS = [
  {
    id: "job-financial",
    title: "Pre-Build Financial Review",
    description: "Per-line margin analysis for a job. Shows quoted vs estimated cost, highlights lines below target margin. Use before workshop starts.",
    icon: PoundSterling,
    color: "text-starlight-green",
    bg: "bg-green-50",
    needsJob: true,
  },
  {
    id: "coming-soon-1",
    title: "Post-Build Reconciliation",
    description: "Compare estimates to actuals after job completion. Identifies where time and money really went.",
    icon: TrendingUp,
    color: "text-gray-300",
    bg: "bg-gray-50",
    disabled: true,
  },
  {
    id: "coming-soon-2",
    title: "Workshop Utilisation",
    description: "Capacity usage over time. Shows who worked, on what, and how efficiently.",
    icon: BarChart3,
    color: "text-gray-300",
    bg: "bg-gray-50",
    disabled: true,
  },
];

export default function ReportsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [showJobPicker, setShowJobPicker] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("tbl_production_plan")
      .select("job_id, job_number, job_name")
      .order("job_number", { ascending: false })
      .limit(50)
      .then(({ data }) => setJobs((data as JobOption[]) || []));
  }, []);

  const launchReport = (reportId: string) => {
    if (!selectedJob) return;
    router.push(`/reports/${reportId}/${selectedJob}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy">Reports</h1>
        <p className="text-sm text-gray-400 mt-0.5">Generate reports for jobs, scopes, and operations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <div key={report.id}
              className={`card p-5 transition-all ${report.disabled ? "opacity-50" : "hover:shadow-md hover:border-starlight-blue/30 cursor-pointer"}`}>
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-lg ${report.bg}`}>
                  <Icon className={`h-5 w-5 ${report.color}`} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-navy">{report.title}</h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{report.description}</p>
                </div>
              </div>

              {!report.disabled && report.needsJob && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  {showJobPicker === report.id ? (
                    <div className="space-y-2">
                      <select value={selectedJob || ""} onChange={(e) => setSelectedJob(Number(e.target.value) || null)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                        <option value="">Select a job...</option>
                        {jobs.map((j) => (
                          <option key={j.job_id} value={j.job_id}>{j.job_number} — {j.job_name}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button onClick={() => launchReport(report.id)} disabled={!selectedJob}
                          className="flex-1 px-3 py-2 bg-starlight-blue text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          Generate Report
                        </button>
                        <button onClick={() => { setShowJobPicker(null); setSelectedJob(null); }}
                          className="px-3 py-2 text-xs text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowJobPicker(report.id)}
                      className="w-full px-3 py-2 text-xs font-medium text-starlight-blue bg-starlight-blue/5 hover:bg-starlight-blue/10 rounded-lg transition-colors">
                      Select Job & Generate
                    </button>
                  )}
                </div>
              )}
              {report.disabled && (
                <p className="mt-3 text-[10px] text-gray-300 font-medium uppercase tracking-wider">Coming soon</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
