"use client";

import { useJobHistory, JobHistoryEntry } from "@/lib/job-history";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";

export function RecentJobsStrip() {
  const history = useJobHistory();
  const pathname = usePathname();

  // Don't show on job pages — you're already there
  const isJobPage = /^\/jobs\/\d+/.test(pathname);
  if (isJobPage || history.length === 0) return null;

  return (
    <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
      <div className="flex items-center gap-1.5 text-muted shrink-0">
        <Clock className="h-3.5 w-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wider">Recent</span>
      </div>
      {history.map(h => (
        <Link
          key={h.jobId}
          href={h.path}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-subtle bg-surface hover:border-starlight-blue hover:bg-starlight-blue/5 transition-colors shrink-0 group"
        >
          <span className="text-xs font-mono font-semibold text-navy">{h.jobNumber}</span>
          <span className="text-xs text-muted max-w-[140px] truncate">{h.jobName}</span>
          {h.scopeName && (
            <>
              <ArrowRight className="h-3 w-3 text-faint group-hover:text-starlight-blue" />
              <span className="text-xs text-starlight-blue font-medium max-w-[120px] truncate">{h.scopeName}</span>
            </>
          )}
        </Link>
      ))}
    </div>
  );
}
