"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatDate } from "@/lib/utils";
import { DaysRemainingBadge, StatusBadge } from "@/components/ui/badges";
import { LookupCombo } from "@/components/ui/lookup-combo";
import { PromptPanel } from "@/components/prompt-panel";
import { JobItemsTable } from "@/components/job-items-table";
import { CreateWODialog } from "@/components/create-wo-dialog";
import { CostBreakdown } from "@/components/cost-breakdown";
import { ScopeOptions } from "@/components/scope-options";
import { ScopeBom } from "@/components/scope-bom";
import { ArrowLeft, Hammer, ChevronRight, Trash2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { getAuditContext, auditedUpdate } from "@/lib/audit";
import { usePresence } from "@/lib/use-presence";
import { PresenceAvatars } from "@/components/presence-avatars";

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
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const router = useRouter();

  // Presence — show who else is viewing this scope item
  const { others: presenceOthers, setEditing: presenceSetEditing } = usePresence("scope", scopeId, "Scope Breakdown");

  const loadData = useCallback(async () => {
    const [scopeRes, catRes, woRes] = await Promise.all([
      supabase.from("qry_scope_breakdown").select("*").eq("scope_item_id", scopeId).single(),
      supabase.from("tbl_scope_item_categories").select("category_id, category_name").eq("active", true).order("category_name"),
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

  // Refresh coverage when returning from WO page
  useEffect(() => {
    const onFocus = () => { setRefreshKey((k) => k + 1); loadData(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadData]);

  const updateField = async (field: string, value: string | number | null) => {
    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_scope_items", scopeId, { [field]: value }, jobId);
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

  const deleteScope = async () => {
    if (!confirm("Delete this scope item? This cannot be undone.")) return;
    const ctx = await getAuditContext(supabase);
    // Log the deletion before cascade
    await supabase.from("tbl_audit_log").insert({
      user_id: ctx.userId, user_name: ctx.userName, user_role: ctx.userRole,
      table_name: "tbl_scope_items", record_id: scopeId,
      field_name: "_record", old_value: JSON.stringify(scope), new_value: null,
      job_id: jobId, action_type: "delete",
    });
    // Delete linked WOs, job items, junction records first
    const { data: wos } = await supabase.from("tbl_work_orders").select("work_order_id").eq("scope_item_id", scopeId);
    if (wos && wos.length > 0) {
      const woIds = wos.map((w: any) => w.work_order_id);
      await supabase.from("tbl_wo_activities").delete().in("work_order_id", woIds);
      await supabase.from("tbl_wo_bom").delete().in("work_order_id", woIds);
      await supabase.from("tbl_jobitem_workorder").delete().in("work_order_id", woIds);
      await supabase.from("tbl_work_orders").delete().eq("scope_item_id", scopeId);
    }
    await supabase.from("tbl_job_items").delete().eq("scope_item_id", scopeId);
    await supabase.from("tbl_scope_items").delete().eq("scope_item_id", scopeId);
    router.push("/jobs/" + jobId);
  };

  const cancelScope = async (reason: string) => {
    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_scope_items", scopeId, { status: "Cancelled-Cost-Retained", cancellation_reason: reason }, jobId);
    setScope((prev) => prev ? { ...prev, status: "Cancelled-Cost-Retained" } : null);
    setShowCancelDialog(false);
    setCancelReason("");
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
      {/* Back + presence */}
      <div className="flex items-center justify-between">
        <Link
          href={`/jobs/${jobId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-navy transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Job
        </Link>
        <PresenceAvatars others={presenceOthers} />
      </div>

      {/* Scope header card */}
      <div className="card px-6 py-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-mono">
              {scope.job_number} &gt; Scope #{scope.scope_item_id}
            </p>
            <textarea
              defaultValue={scope.line_text || scope.item_name || `Scope Item #${scope.scope_item_id}`}
              onFocus={() => presenceSetEditing("item_name")}
              onBlur={async (e) => {
                const val = e.target.value.trim();
                presenceSetEditing(null);
                if (val && val !== scope.item_name) {
                  const ctx = await getAuditContext(supabase);
                  await auditedUpdate(ctx, "tbl_scope_items", scope.scope_item_id, { item_name: val }, jobId);
                }
              }}
              ref={(el) => {
                if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
              }}
              onInput={(e) => {
                const el = e.target as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }}
              rows={1}
              className="text-xl font-bold text-navy mt-1 w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-starlight-blue focus:outline-none rounded px-1 -ml-1 resize-none overflow-hidden leading-tight"
            />
            {scope.job_name && (
              <p className="text-sm text-gray-400 mt-1">{scope.job_name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
              <StatusBadge status={scope.status} />
              {scope.status === "Provisional" && woCount === 0 && (
                <button
                  onClick={deleteScope}
                  className="p-1.5 text-gray-300 hover:text-starlight-red hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete scope item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              {scope.status !== "Completed" && scope.status !== "Cancelled-Cost-Retained" && (
                <button
                  onClick={() => setShowCancelDialog(true)}
                  className="p-1.5 text-gray-300 hover:text-starlight-amber hover:bg-amber-50 rounded-lg transition-colors"
                  title="Cancel (retain costs)"
                >
                  <AlertTriangle className="h-4 w-4" />
                </button>
              )}
            </div>
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
            <p className="text-sm text-navy px-2 py-1.5">
              {scope.complexity_construction || <span className="text-gray-300 italic">Set on WOs</span>}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Finish</label>
            <p className="text-sm text-navy px-2 py-1.5">
              {scope.finish_relative || <span className="text-gray-300 italic">Set on WOs</span>}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Event Zone</label>
            <input
              type="text"
              value={scope.event_zone || ""}
              onChange={(e) =>
                setScope((prev) => (prev ? { ...prev, event_zone: e.target.value } : null))
              }
              onFocus={() => presenceSetEditing("event_zone")}
              onBlur={(e) => { presenceSetEditing(null); updateField("event_zone", e.target.value || null); }}
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
            onFocus={() => presenceSetEditing("description")}
            onBlur={(e) => { presenceSetEditing(null); updateField("description", e.target.value || null); }}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
            placeholder="Describe the scope item..."
          />
        </div>

      </div>

      {/* Build options */}
      <ScopeOptions scopeItemId={scope.scope_item_id} jobId={jobId} quotedValue={scope.line_value || undefined} />

      {/* Scope-level materials (no WO needed) */}
      <ScopeBom scopeItemId={scope.scope_item_id} jobId={jobId} />

      {/* Cost analysis */}
      <CostBreakdown scopeItemId={scope.scope_item_id} quotedValue={scope.line_value || undefined} />

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

      {/* Cancel Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-navy">Cancel Scope Item</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Completed WO costs will be retained. This cannot be undone.
              </p>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason *</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why is this being cancelled..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-amber resize-none"
                autoFocus
              />
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => { setShowCancelDialog(false); setCancelReason(""); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => cancelReason.trim() && cancelScope(cancelReason.trim())}
                disabled={!cancelReason.trim()}
                className="px-4 py-2 bg-starlight-amber text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                Cancel Scope Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WO Dialog */}
      {showWODialog && (
        <CreateWODialog
          jobId={jobId}
          scopeItemId={scopeId}
          selectedItemIds={selectedItemIds}
          defaultComplexity={scope?.complexity_construction}
          defaultFinish={scope?.finish_relative}
          onClose={() => setShowWODialog(false)}
          onCreated={handleWOCreated}
        />
      )}
    </div>
  );
}
