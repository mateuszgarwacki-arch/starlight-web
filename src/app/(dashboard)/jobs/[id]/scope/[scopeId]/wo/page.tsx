"use client";

import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ScopeWorkOrdersPage() {
  const params = useParams();
  const jobId = Number(params.id);
  const scopeId = Number(params.scopeId);

  return (
    <div className="space-y-5">
      <Link
        href={`/jobs/${jobId}/scope/${scopeId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-navy transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Scope Item
      </Link>

      <div>
        <h1 className="text-xl font-bold text-navy">Work Orders</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Phase-ordered work orders for this scope item
        </p>
      </div>

      <div className="card px-6 py-12 text-center">
        <p className="text-gray-400 text-sm">Coming in Phase 4</p>
        <p className="text-gray-300 text-xs mt-1">
          Work order list, BOM management, traveller print
        </p>
      </div>
    </div>
  );
}
