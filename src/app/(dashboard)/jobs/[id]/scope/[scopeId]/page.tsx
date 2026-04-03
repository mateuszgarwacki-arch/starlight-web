"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { PmQueriesPanel } from "@/components/pm-queries-panel";
import { WorkOrdersPanel, type WorkOrdersPanelRef } from "@/components/work-orders-panel";
import { ArrowLeft, Hammer, Trash2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { getAuditContext, auditedUpdate } from "@/lib/audit";
import { recordJobVisit } from "@/lib/job-history";
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
  const [costRefreshKey, setCostRefreshKey] = useState(0);
  const [expandWoId, setExpandWoId] = useState<number | null>(null);
  const woRef = useRef<WorkOrdersPanelRef>(null);
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

  // Auto-expand WO from query param (e.g. from external links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("expand");
    if (id) setExpandWoId(Number(id));
  }, []);

  // Record visit for recent jobs strip
  useEffect(() => {
    if (scope) recordJobVisit({
      jobId, jobNumber: scope.job_number || "", jobName: scope.job_name || "",
      scopeId, scopeName: scope.item_name || "",
      path: `/jobs/${jobId}/scope/${scopeId}`,
    });
  }, [scope?.scope_item_id]);

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

  const handleAddFromPrompt = async (description: string, itemType: string, stockItemId?: number, quantity?: number) => {
    let stockRef: string | null = null;
    let stockDesc = description;
    let hireCost = 0;
    if (stockItemId) {
      const { data: si } = await supabase.from("tbl_stock_items").select("product_code, description, hire_cost_day").eq("stock_id", stockItemId).single();
      if (si) { stockRef = si.product_code; stockDesc = si.description || description; hireCost = si.hire_cost_day || 0; }
    }
    const { data: inserted } = await supabase.from("tbl_job_items").insert({
      job_id: jobId,
      scope_item_id: scopeId,
      description: stockDesc,
      item_type: stockItemId ? "Stock" : itemType,
      stock_item_id: stockItemId || null,
      stock_reference: stockRef,
      item_source: stockItemId ? "stock" : "bespoke",
      quantity: quantity || 1,
      kit_list_exported: "false",
      temp_selected: "false",
      created_at: new Date().toISOString(),
    }).select("item_id").single();
    // Auto-create paired BOM row for stock items
    if (inserted && stockItemId) {
      await supabase.from("tbl_wo_bom").insert({
        scope_item_id: scopeId,
        job_id: jobId,
        job_item_id: inserted.item_id,
        stock_item_id: stockItemId,
        item_description: stockDesc,
        quantity: quantity || 1,
        unit: "Day",
        unit_cost: hireCost,
        needs_ordering: "false",
      });
    }
    setRefreshKey((k) => k + 1);
    toast.success(`Added: ${stockDesc.substring(0, 50)}`);
  };

  const handleWOCreated = async (workOrderId: number) => {
    setShowWODialog(false);
    setSelectedItemIds([]);
    setRefreshKey((k) => k + 1);
    loadData();
    // Wait a tick for the WO panel to refresh, then expand
    await woRef.current?.refresh();
    woRef.current?.expandWO(workOrderId);
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
      <div className="flex items-center justify-center h-64 text-muted text-sm animate-pulse">
        Loading scope item...
      </div>
    );
  }

  if (!scope) {
    return <div className="text-center py-12 text-muted">Scope item not found</div>;
  }

  return (
    <div className="space-y-5">
      {/* Back + presence */}
      <div className="flex items-center justify-between">
        <Link
          href={`/jobs/${jobId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy transition-colors"
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
            <p className="text-xs text-muted font-mono">
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
              className="text-xl font-bold text-navy mt-1 w-full bg-transparent border border-transparent hover:border-subtle focus:border-starlight-blue focus:outline-none rounded px-1 -ml-1 resize-none overflow-hidden leading-tight"
            />
            {scope.job_name && (
              <p className="text-sm text-muted mt-1">{scope.job_name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
              <StatusBadge status={scope.status} />
              {scope.status === "Provisional" && woCount === 0 && (
                <button
                  onClick={deleteScope}
                  className="p-1.5 text-faint hover:text-starlight-red hover:bg-starlight-red/10 rounded-lg transition-colors"
                  title="Delete scope item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              {scope.status !== "Completed" && scope.status !== "Cancelled-Cost-Retained" && (
                <button
                  onClick={() => setShowCancelDialog(true)}
                  className="p-1.5 text-faint hover:text-starlight-amber hover:bg-starlight-amber/10 rounded-lg transition-colors"
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
            <label className="block text-xs font-medium text-muted mb-1">Status</label>
            <LookupCombo
              category="SCOPE_STATUS"
              value={scope.status}
              onChange={(val) => updateField("status", val)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Category</label>
            <select
              value={scope.category_id || ""}
              onChange={(e) => updateField("category_id", e.target.value ? Number(e.target.value) : null)}
              className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue min-w-[120px]"
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
            <label className="block text-xs font-medium text-muted mb-1">Complexity</label>
            <select
              value={scope.complexity_construction || ""}
              onChange={(e) => updateField("complexity_construction", e.target.value || null)}
              className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue"
            >
              <option value="">Select...</option>
              <option value="1 - Straightforward">1 - Straightforward</option>
              <option value="2 - Skilled">2 - Skilled</option>
              <option value="3 - Bespoke/Artistic">3 - Bespoke/Artistic</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Finish</label>
            <select
              value={scope.finish_relative || ""}
              onChange={(e) => updateField("finish_relative", e.target.value || null)}
              className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue"
            >
              <option value="">Select...</option>
              <option value="Raw">Raw</option>
              <option value="Good">Good</option>
              <option value="Spotlight">Spotlight</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Event Zone</label>
            <input
              type="text"
              value={scope.event_zone || ""}
              onChange={(e) =>
                setScope((prev) => (prev ? { ...prev, event_zone: e.target.value } : null))
              }
              onFocus={() => presenceSetEditing("event_zone")}
              onBlur={(e) => { presenceSetEditing(null); updateField("event_zone", e.target.value || null); }}
              className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue"
            />
          </div>
        </div>

        {/* Description */}
        <div className="mt-3">
          <label className="block text-xs font-medium text-muted mb-1">Description</label>
          <textarea
            value={scope.description || ""}
            onChange={(e) =>
              setScope((prev) => (prev ? { ...prev, description: e.target.value } : null))
            }
            onFocus={() => presenceSetEditing("description")}
            onBlur={(e) => { presenceSetEditing(null); updateField("description", e.target.value || null); }}
            rows={4}
            className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
            placeholder="Describe the scope item..."
          />
        </div>

        {/* PM Queries */}
        <PmQueriesPanel scopeItemId={scope.scope_item_id} jobId={jobId} />

      </div>

      {/* Build options */}
      <ScopeOptions scopeItemId={scope.scope_item_id} jobId={jobId} quotedValue={scope.line_value || undefined} />

      {/* Cost analysis */}
      <CostBreakdown scopeItemId={scope.scope_item_id} quotedValue={scope.line_value || undefined} refreshKey={costRefreshKey} />

      {/* Main content: prompt engine + job items */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Left: Prompt Engine */}
        <div className="lg:col-span-1">
          <PromptPanel
            categoryId={scope.category_id}
            onAddItem={handleAddFromPrompt}
          />
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
                className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red transition-colors"
              >
                <Hammer className="h-4 w-4" />
                Create Work Order from {selectedItemIds.length} Item{selectedItemIds.length > 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Work Orders — inline panel */}
      <WorkOrdersPanel
        ref={woRef}
        jobId={jobId}
        scopeId={scopeId}
        scope={scope as any}
        initialExpandId={expandWoId}
        onCostChange={() => setCostRefreshKey((k) => k + 1)}
      />

      {/* Cancel Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-subtle">
              <h3 className="text-sm font-semibold text-navy">Cancel Scope Item</h3>
              <p className="text-xs text-muted mt-0.5">
                Completed WO costs will be retained. This cannot be undone.
              </p>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs font-medium text-muted mb-1.5">Reason *</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why is this being cancelled..."
                rows={3}
                className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-amber resize-none"
                autoFocus
              />
            </div>
            <div className="px-5 py-3 border-t border-subtle flex justify-end gap-3">
              <button
                onClick={() => { setShowCancelDialog(false); setCancelReason(""); }}
                className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => cancelReason.trim() && cancelScope(cancelReason.trim())}
                disabled={!cancelReason.trim()}
                className="px-4 py-2 bg-starlight-amber text-white text-sm font-medium rounded-lg hover:bg-starlight-amber transition-colors disabled:opacity-50"
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
