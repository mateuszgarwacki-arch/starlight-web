"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatDate } from "@/lib/utils";
import { DaysRemainingBadge, StatusBadge } from "@/components/ui/badges";
import { LookupCombo } from "@/components/ui/lookup-combo";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface ScopeDetail {
  scope_item_id: number;
  job_id: number;
  item_name: string | null;
  description: string | null;
  event_zone: string | null;
  complexity_construction: string | null;
  finish_relative: string | null;
  status: string | null;
  category_id: number | null;
  is_general: string | null;
  quote_line_id: number | null;
  // From the view join
  line_text?: string | null;
  line_value?: number | null;
  job_name?: string | null;
  job_number?: string | null;
}

export default function ScopeDetailPage() {
  const params = useParams();
  const jobId = Number(params.id);
  const scopeId = Number(params.scopeId);
  const supabase = createClient();

  const [scope, setScope] = useState<ScopeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Try view first (has joined data), fall back to table
      const { data } = await supabase
        .from("qry_scope_breakdown")
        .select("*")
        .eq("scope_item_id", scopeId)
        .single();

      if (data) {
        setScope(data);
      } else {
        // Fallback to raw table
        const { data: raw } = await supabase
          .from("tbl_scope_items")
          .select("*")
          .eq("scope_item_id", scopeId)
          .single();
        if (raw) setScope(raw);
      }
      setLoading(false);
    }
    load();
  }, [scopeId]);

  const updateField = async (field: string, value: string | null) => {
    await supabase
      .from("tbl_scope_items")
      .update({ [field]: value })
      .eq("scope_item_id", scopeId);

    setScope((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">
        Loading scope item...
      </div>
    );
  }

  if (!scope) {
    return <div className="text-center py-12 text-gray-400">Scope item not found</div>;
  }

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        href={`/jobs/${jobId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-navy transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Job
      </Link>

      {/* Scope header card */}
      <div className="card px-6 py-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 font-mono">
              {scope.job_number} &gt; Scope Item #{scope.scope_item_id}
            </p>
            <input
              type="text"
              value={scope.item_name || ""}
              onChange={(e) =>
                setScope((prev) =>
                  prev ? { ...prev, item_name: e.target.value } : null
                )
              }
              onBlur={(e) => updateField("item_name", e.target.value || null)}
              className="text-xl font-bold text-navy mt-1 bg-transparent border-0 border-b-2 border-transparent hover:border-gray-200 focus:border-starlight-blue focus:outline-none w-full"
            />
          </div>
          <StatusBadge status={scope.status} />
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Status
            </label>
            <LookupCombo
              category="SCOPE_STATUS"
              value={scope.status}
              onChange={(val) => updateField("status", val)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Complexity
            </label>
            <LookupCombo
              category="COMPLEXITY"
              value={scope.complexity_construction}
              onChange={(val) => updateField("complexity_construction", val)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Finish
            </label>
            <LookupCombo
              category="FINISH_RELATIVE"
              value={scope.finish_relative}
              onChange={(val) => updateField("finish_relative", val)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Event Zone
            </label>
            <input
              type="text"
              value={scope.event_zone || ""}
              onChange={(e) =>
                setScope((prev) =>
                  prev ? { ...prev, event_zone: e.target.value } : null
                )
              }
              onBlur={(e) => updateField("event_zone", e.target.value || null)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
            />
          </div>
        </div>

        {/* Description */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Description
          </label>
          <textarea
            value={scope.description || ""}
            onChange={(e) =>
              setScope((prev) =>
                prev ? { ...prev, description: e.target.value } : null
              )
            }
            onBlur={(e) => updateField("description", e.target.value || null)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
            placeholder="Describe the scope item..."
          />
        </div>

        {/* Quote line context */}
        {scope.line_text && (
          <div className="mt-4 bg-starlight-bg rounded-lg px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">From quote line:</p>
            <p className="text-sm text-gray-600">{scope.line_text}</p>
          </div>
        )}
      </div>

      {/* Placeholder sections for Phase 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Job Items — Phase 3 */}
        <div className="lg:col-span-2">
          <div className="card px-5 py-8 text-center">
            <p className="text-gray-400 text-sm">Job Items & Prompt Engine</p>
            <p className="text-gray-300 text-xs mt-1">
              Phase 3: Stock search, item grid, WO creation
            </p>
          </div>
        </div>

        {/* Work Orders link */}
        <div>
          <Link
            href={`/jobs/${jobId}/scope/${scopeId}/wo`}
            className="card px-5 py-8 text-center hover:shadow-md transition-shadow block"
          >
            <p className="text-navy font-medium text-sm">Work Orders &gt;&gt;</p>
            <p className="text-gray-400 text-xs mt-1">
              View and manage work orders
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
