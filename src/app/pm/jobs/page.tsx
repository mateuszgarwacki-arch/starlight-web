"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency } from "@/lib/utils";
import { DaysRemainingBadge } from "@/components/ui/badges";
import { Search, Calendar, Package } from "lucide-react";
import type { Job } from "@/lib/types";

type JobCard = Job & {
  quote_total?: number | null;
  line_count?: number;
};

export default function PmJobsPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: jobsData } = await supabase
        .from("tbl_production_plan")
        .select("*")
        .order("event_date", { ascending: true });
      if (!jobsData) {
        setLoading(false);
        return;
      }
      // Pull per-job quote totals + line counts in one go
      const { data: lineStats } = await supabase
        .from("tbl_quote_lines")
        .select("job_id, line_value");
      const totals = new Map<number, { total: number; count: number }>();
      (lineStats ?? []).forEach((l: any) => {
        const agg = totals.get(l.job_id) ?? { total: 0, count: 0 };
        agg.total += Number(l.line_value ?? 0);
        agg.count += 1;
        totals.set(l.job_id, agg);
      });
      setJobs(
        jobsData.map((j: Job) => ({
          ...j,
          quote_total: totals.get(j.job_id)?.total ?? null,
          line_count: totals.get(j.job_id)?.count ?? 0,
        }))
      );
      setLoading(false);
    })();
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
      <div>
        <h1 className="text-xl font-bold text-navy">Jobs — 100m view</h1>
        <p className="text-sm text-muted mt-0.5">
          Pick a job to see its quote lines, scopes, work orders, materials, and notes in one place.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by job name, number, or client…"
          className="w-full pl-10 pr-4 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue bg-surface"
        />
      </div>

      {loading ? (
        <div className="card px-5 py-8 text-center text-muted text-sm animate-pulse">Loading jobs…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((job) => (
            <Link
              key={job.job_id}
              href={`/pm/jobs/${job.job_id}`}
              className="card p-4 hover:border-starlight-blue/60 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-muted">{job.job_number || "—"}</div>
                  <div className="font-semibold text-navy group-hover:text-starlight-blue">
                    {job.job_name || "(untitled)"}
                  </div>
                  <div className="text-xs text-muted mt-0.5">{job.client_name || "—"}</div>
                </div>
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-starlight-green/10 text-starlight-green">
                  {job.job_status || "Active"}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs">
                <Calendar className="h-3.5 w-3.5 text-muted" />
                <span className="text-muted">{formatDate(job.event_date)}</span>
                <DaysRemainingBadge eventDate={job.event_date} />
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                <Package className="h-3.5 w-3.5" />
                <span>
                  {job.line_count ?? 0} quote lines
                  {job.quote_total ? ` · ${formatCurrency(job.quote_total)}` : ""}
                </span>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full card px-5 py-8 text-center text-muted text-sm">
              {search ? "No matching jobs" : "No jobs yet"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
