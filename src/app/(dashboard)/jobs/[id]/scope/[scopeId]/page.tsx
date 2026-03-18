"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatDate } from "@/lib/utils";
import { DaysRemainingBadge, StatusBadge } from "@/components/ui/badges";
import { LookupCombo } from "@/components/ui/lookup-combo";
import { PromptPanel } from "@/components/prompt-panel";
import { JobItemsTable } from "@/components/job-items-table";
import { CreateWODialog } from "@/components/create-wo-dialog";
import { ArrowLeft, Hammer, ChevronRight } from "lucide-react";
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
  line_text?: string | null;
  line_value?: number | null;
  job_name?: string | null;
  job_number?: string | null;
}

interface ScopeCategory {
  category_id: number;
  category_name: string | null;
}

export default function ScopeDetailPage() {
  const params = useParams();
  const jobId = Number(params.id);
  const scopeId = Number(params.scopeId);
  const supabase = createClient();

  const [scope, setScope] = useState<ScopeDetail | null>(null);
  const [categories, setCategories] = useState<ScopeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [showWODialog, setShowWODialog] = useState(false);
  const [woCount, setWoCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadData = useCallback(async () => {
    const [scopeRes, catRes, woRes] = await Promise.all([
      supabase.from("qry_scope_breakdown").select("*").eq("scope_item_id", scopeId).single(),
      supabase.from("tbl_scope_item_categories").select("category_id, category_name").eq("active", "true").order("category_name"),
      supabase.from("tbl_work_orders").select("work_order_id", { count: "exact" }).eq("scope_item_id", scopeId),
    ]);

    if (scopeRes.data) {
      setScope(scopeRes.data);
    } else {
      const { data: raw } = await supabase.from("tbl_scope_items").select("*").eq("scope_item_id", scopeId).single();
      if (raw) setScope(raw);
    }
    if (catRes.data) setCategories(catRes.data);
    if (woRes.count !== null) setWoCount(woRes.count);
    setLoading(false);
  }, [scopeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateField = async (field: string, value: string | number | null) => {
    await supabase.from("tbl_scope_items").update({ [field]: value }).eq("scope_item_id", scopeId);
    setScope((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const handleAddFromPrompt = async (description: string, itemType: string) => {
    await supabase.from("tbl_job_items").insert({
      job_id: jobId,
      scope_item_id: scopeId,
      description,
      item_type: itemType,
      kit_list_exported: "false",
      temp_selected: "false",
      created_at: new Date().toISOString(),
    });
    setRefreshKey((k) => k + 1);
  };

  const handleWOCreated = () => {
    setShowWODialog(false);
    setSelectedItemIds([]);
    setRefreshKey((k) => k + 1);
    loadData();
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
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-mono">
              {scope.job_number} &gt; Scope #{scope.scope_item_id}
            </p>
            <h1 className="text-xl font-bold text-navy mt-1">
              {scope.line_text
                ? (scope.line_text).substring(0, 100)
                : scope.item_name || `Scope Item #${scope.scope_item_id}`}
            </h1>
            {scope.job_name && (
              <p className="text-sm text-gray-400 mt-1">{scope.job_name}</p>
            )}
          </div>
          <StatusBadge status={scope.status} />
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Status</label>
            <LookupCombo
              category="SCOPE_STATUS"
              value={scope.status}
              onChange={(val) => updateField("status", val)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
            <select
              value={scope.category_id || ""}
              onChange={(e) => updateField("category_id", e.target.value ? Number(e.target.value) : null)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue min-w-[120px]"
            >
              <option value="">Select...</option>
              {categories.map((cat) => (
                <option key={cat.category_id} value={cat.category_id}>
                  {cat.category_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Complexity</label>
            <LookupCombo
              category="COMPLEXITY"
              value={scope.complexity_construction}
              onChange={(val) => updateField("complexity_construction", val)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Finish</label>
            <LookupCombo
              category="FINISH_RELATIVE"
              value={scope.finish_relative}
              onChange={(val) => updateField("finish_relative", val)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Event Zone</label>
            <input
              type="text"
              value={scope.event_zone || ""}
              onChange={(e) =>
                setScope((prev) => (prev ? { ...prev, event_zone: e.target.value } : null))
              }
              onBlur={(e) => updateField("event_zone", e.target.value || null)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
            />
          </div>
        </div>

        {/* Description */}
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
          <textarea
            value={scope.description || ""}
            onChange={(e) =>
              setScope((prev) => (prev ? { ...prev, description: e.target.value } : null))
            }
            onBlur={(e) => updateField("description", e.target.value || null)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
            placeholder="Describe the scope item..."
          />
        </div>

      </div>

      {/* Main content: prompt engine + job items + WO link */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Left: Prompt Engine */}
        <div className="lg:col-span-1">
          <PromptPanel
            categoryId={scope.category_id}
            onAddItem={handleAddFromPrompt}
          />

          {/* Work Orders link card */}
          <Link
            href={`/jobs/${jobId}/scope/${scopeId}/wo`}
            className="card px-4 py-4 mt-4 flex items-center justify-between hover:shadow-md transition-shadow block"
          >
            <div className="flex items-center gap-2">
              <Hammer className="h-4 w-4 text-navy" />
              <div>
                <p className="text-sm font-medium text-navy">Work Orders</p>
                <p className="text-xs text-gray-400">{woCount} WOs</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </Link>
        </div>

        {/* Right: Job Items table */}
        <div className="lg:col-span-3">
          <JobItemsTable
            key={refreshKey}
            jobId={jobId}
            scopeItemId={scopeId}
            onSelectionChange={setSelectedItemIds}
          />

          {/* Create WO button — appears when items selected */}
          {selectedItemIds.length > 0 && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => setShowWODialog(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                <Hammer className="h-4 w-4" />
                Create Work Order from {selectedItemIds.length} Item{selectedItemIds.length > 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* WO Dialog */}
      {showWODialog && (
        <CreateWODialog
          jobId={jobId}
          scopeItemId={scopeId}
          selectedItemIds={selectedItemIds}
          onClose={() => setShowWODialog(false)}
          onCreated={handleWOCreated}
        />
      )}
    </div>
  );
}
