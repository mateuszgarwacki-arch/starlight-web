"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency } from "@/lib/utils";
import { DaysRemainingBadge } from "@/components/ui/badges";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Job, QuoteLine } from "@/lib/types";
import { isTruthy } from "@/lib/types";

export default function JobDetailPage() {
  const params = useParams();
  const jobId = Number(params.id);
  const supabase = createClient();

  const [job, setJob] = useState<Job | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [jobRes, linesRes] = await Promise.all([
        supabase
          .from("tbl_production_plan")
          .select("*")
          .eq("job_id", jobId)
          .single(),
        supabase
          .from("tbl_quote_lines")
          .select("*")
          .eq("job_id", jobId)
          .order("import_sequence"),
      ]);

      if (jobRes.data) setJob(jobRes.data);
      if (linesRes.data) setLines(linesRes.data);
      setLoading(false);
    }
    load();
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">
        Loading job...
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12 text-gray-400">Job not found</div>
    );
  }

  const workshopLines = lines.filter(
    (l) =>
      ["Workshop Build", "Stock-and-Hire", "Provisional"].includes(
        l.category || ""
      ) && !isTruthy(l.interpretation_complete)
  );

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-navy transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All Jobs
      </Link>

      {/* Job header */}
      <div className="card px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 font-mono">
              {job.job_number}
            </p>
            <h1 className="text-xl font-bold text-navy mt-1">
              {job.job_name}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{job.client_name}</p>
          </div>
          <div className="text-right space-y-1">
            <DaysRemainingBadge eventDate={job.event_date} />
            <p className="text-sm text-gray-500">
              {formatDate(job.event_date)}
            </p>
            {job.budget_allowance && (
              <p className="text-sm font-medium text-navy">
                Budget: {formatCurrency(job.budget_allowance)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Uninterpreted lines alert */}
      {workshopLines.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-starlight-amber" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{workshopLines.length}</span>{" "}
            workshop lines awaiting scope interpretation
          </p>
        </div>
      )}

      {/* Quote lines table */}
      <div>
        <h2 className="text-sm font-semibold text-navy mb-3">
          Quote Lines ({lines.length})
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-starlight-bg text-left">
                <th className="px-4 py-2.5 font-medium text-gray-500 w-16">
                  #
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-500">
                  Zone
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-500">
                  Description
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-500">
                  Category
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-500 text-right">
                  Value
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-500 text-center">
                  Interpreted
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const isWorkshop = ["Workshop Build", "Stock-and-Hire", "Provisional"].includes(line.category || "");
                const isUninterpreted = isWorkshop && !isTruthy(line.interpretation_complete);

                return (
                  <tr
                    key={line.quote_line_id}
                    className={`border-t border-gray-100 ${
                      isUninterpreted ? "row-amber" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                      {line.line_number}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {line.event_zone}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {(line.line_text || "").substring(0, 120)}
                      {(line.line_text || "").length > 120 ? "..." : ""}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                        {line.category || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {formatCurrency(line.line_value)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {isTruthy(line.interpretation_complete) ? (
                        <span className="text-starlight-green">✓</span>
                      ) : isWorkshop ? (
                        <span className="text-starlight-amber text-xs">
                          Pending
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
