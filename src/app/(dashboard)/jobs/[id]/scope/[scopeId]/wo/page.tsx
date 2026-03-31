"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import type { WoBom, Freelancer, ScopeContext } from "@/lib/types";
import { StatusBadge, DaysRemainingBadge } from "@/components/ui/badges";
import { WODocumentsPanel } from "@/components/wo-documents-panel";
import { PrintTravellerButton } from "@/components/traveller/traveller-preview";
import { CostBreakdown } from "@/components/cost-breakdown";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Hammer,
  UserCheck,
  ShieldCheck,
  AlertTriangle,
  X,
  Link2,
  ArrowUp,
  ArrowDown,
  Warehouse,
  Paintbrush,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { getAuditContext, auditedUpdate, auditedInsert } from "@/lib/audit";
import { usePresence } from "@/lib/use-presence";
import { PresenceAvatars } from "@/components/presence-avatars";
import { ConflictDialog, type ConflictInfo } from "@/components/conflict-dialog";

// ============================================================
// Types for this page
// ============================================================

interface WORow {
  work_order_id: number;
  job_id: number | null;
  scope_item_id: number | null;
  activity_verb: number | null;
  description: string | null;
  estimated_duration_hrs: number | null;
  planned_lead_id: number | null;
  rate_override: number | null;
  status: string | null;
  on_hold_reason: string | null;
  void_reason: string | null;
  complexity_construction: string | null;
  finish_relative: string | null;
  wo_sequence: number | null;
  traveller_printed_at?: string | null;
  paint_notes: string | null;
  sort_phase: number;
  // Enriched client-side
  activity_label?: string;
  phase_number?: number | null;
  lead_name?: string | null;
}

interface BomRow extends WoBom {
  _isNew?: boolean;
}

interface ActivityEntry {
  activity_id: number;
  sequence: number;
  lookup_value: string;
  phase_number: number | null;
}

// ============================================================
// Main Page Component
// ============================================================

export default function ScopeWorkOrdersPage() {
  const params = useParams();
  const jobId = Number(params.id);
  const scopeId = Number(params.scopeId);
  const supabase = createClient();

  // State
  const [scope, setScope] = useState<ScopeContext | null>(null);
  const [workOrders, setWorkOrders] = useState<WORow[]>([]);
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWO, setExpandedWO] = useState<number | null>(null);
  const [bomRows, setBomRows] = useState<BomRow[]>([]);
  const [bomLoading, setBomLoading] = useState(false);
  const [materials, setMaterials] = useState<
    { material_id: number; material_name: string; unit: string; current_unit_cost: number | null; material_category: number | null; standard_length: number | null }[]
  >([]);
  const [matSearch, setMatSearch] = useState("");
  const [matResults, setMatResults] = useState<typeof materials>([]);
  const [showMatSearch, setShowMatSearch] = useState(false);
  const [addingBomTo, setAddingBomTo] = useState<number | null>(null);
  const [linkedItems, setLinkedItems] = useState<any[]>([]);
  const [voidDialog, setVoidDialog] = useState<{ woId: number; status: string } | null>(null);
  const [voidReason, setVoidReason] = useState("");

  // Presence — show who else is viewing this scope's work orders
  const { others: presenceOthers, setEditing: presenceSetEditing } = usePresence("scope", scopeId, "Work Orders");

  // Conflict dialog state for optimistic concurrency
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [conflictResolve, setConflictResolve] = useState<{
    onMine: () => void;
    onTheirs: () => void;
  } | null>(null);

  // ============================================================
  // Data loading
  // ============================================================

  const loadAll = useCallback(async () => {
    const [scopeRes, woRes, freelancerRes, matRes] = await Promise.all([
      supabase.from("qry_scope_context").select("*").eq("scope_item_id", scopeId).single(),
      supabase
        .from("qry_wo_phase_ordered")
        .select("*")
        .eq("scope_item_id", scopeId),
      supabase
        .from("tbl_freelancers")
        .select("*")
        .eq("active", true)
        .order("freelancer_name"),
      supabase
        .from("tbl_materials")
        .select("material_id, material_name, unit, current_unit_cost, material_category, standard_length")
        .eq("active", true)
        .order("material_name"),
    ]);

    if (scopeRes.data) setScope(scopeRes.data);
    if (freelancerRes.data) setFreelancers(freelancerRes.data as Freelancer[]);
    if (matRes.data) setMaterials(matRes.data);

    // Enrich WOs with activity labels
    if (woRes.data && woRes.data.length > 0) {
      const woIds = woRes.data.map((w: WORow) => w.work_order_id);

      // Fetch activity junction + lookup labels for all WOs at once
      const { data: actData } = await supabase
        .from("tbl_wo_activities")
        .select("work_order_id, activity_id, sequence")
        .in("work_order_id", woIds)
        .order("sequence");

      // Fetch lookup values for all activity_ids
      const activityIds = actData
        ? [...new Set(actData.map((a: { activity_id: number }) => a.activity_id))]
        : [];

      let lookupMap: Record<number, { lookup_value: string; phase_number: number | null }> = {};
      if (activityIds.length > 0) {
        const { data: lookups } = await supabase
          .from("tbl_master_lookups")
          .select("lookup_id, lookup_value, phase_number")
          .in("lookup_id", activityIds);
        if (lookups) {
          lookups.forEach((l: any) => {
            lookupMap[l.lookup_id] = { lookup_value: l.lookup_value || "", phase_number: l.phase_number };
          });
        }
      }

      // Also get lookups for WOs that only have activity_verb (no junction rows)
      const verbIds = woRes.data
        .map((w: WORow) => w.activity_verb)
        .filter((id: number | null): id is number => id !== null);
      if (verbIds.length > 0) {
        const { data: verbLookups } = await supabase
          .from("tbl_master_lookups")
          .select("lookup_id, lookup_value, phase_number")
          .in("lookup_id", verbIds);
        if (verbLookups) {
          verbLookups.forEach((l: any) => {
            if (!lookupMap[l.lookup_id]) {
              lookupMap[l.lookup_id] = { lookup_value: l.lookup_value || "", phase_number: l.phase_number };
            }
          });
        }
      }

      // Build label per WO
      const actByWO: Record<number, { activity_id: number; sequence: number }[]> = {};
      if (actData) {
        actData.forEach((a: { work_order_id: number; activity_id: number; sequence: number }) => {
          if (!actByWO[a.work_order_id]) actByWO[a.work_order_id] = [];
          actByWO[a.work_order_id].push(a);
        });
      }

      // Build freelancer map
      const flMap: Record<number, string> = {};
      if (freelancerRes.data) {
        (freelancerRes.data as Freelancer[]).forEach((f) => {
          flMap[f.freelancer_id] = f.freelancer_name || "Unknown";
        });
      }

      const enriched: WORow[] = woRes.data.map((wo: WORow) => {
        const acts = actByWO[wo.work_order_id];
        let label: string;
        let phaseNum: number | null = null;

        if (acts && acts.length > 0) {
          acts.sort((a, b) => a.sequence - b.sequence);
          label = acts
            .map((a) => lookupMap[a.activity_id]?.lookup_value || "?")
            .join(" + ");
          phaseNum = lookupMap[acts[0].activity_id]?.phase_number ?? null;
        } else if (wo.activity_verb && lookupMap[wo.activity_verb]) {
          label = lookupMap[wo.activity_verb].lookup_value;
          phaseNum = lookupMap[wo.activity_verb].phase_number;
        } else {
          label = "No Activity";
        }

        return {
          ...wo,
          activity_label: label,
          phase_number: phaseNum,
          lead_name: wo.planned_lead_id ? flMap[wo.planned_lead_id] || null : null,
        };
      });

      setWorkOrders(enriched);
    } else {
      setWorkOrders([]);
    }

    setLoading(false);
  }, [scopeId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Refresh data when user returns from traveller tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadAll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [loadAll]);

  // ============================================================
  // BOM loading for expanded WO
  // ============================================================

  const loadBOM = async (woId: number) => {
    setBomLoading(true);
    const { data } = await supabase
      .from("tbl_wo_bom")
      .select("*")
      .eq("work_order_id", woId)
      .order("bom_id");
    setBomRows((data as BomRow[]) || []);
    setBomLoading(false);
  };

  const loadLinkedItems = async (woId: number) => {
    const { data: junctions } = await supabase
      .from("tbl_jobitem_workorder")
      .select("job_item_id")
      .eq("work_order_id", woId);

    if (junctions && junctions.length > 0) {
      const itemIds = junctions.map((j: any) => j.job_item_id);
      const { data: items } = await supabase
        .from("tbl_job_items")
        .select("item_id, description, quantity, unit, item_type, finish_required")
        .in("item_id", itemIds);
      setLinkedItems(items || []);
    } else {
      setLinkedItems([]);
    }
  };

  const toggleExpand = (woId: number) => {
    if (expandedWO === woId) {
      setExpandedWO(null);
      setBomRows([]);
      setLinkedItems([]);
    } else {
      setExpandedWO(woId);
      loadBOM(woId);
      loadLinkedItems(woId);
    }
  };

  // ============================================================
  // WO Actions
  // ============================================================

  const updateWOStatus = async (woId: number, newStatus: string) => {
    const wo = workOrders.find((w) => w.work_order_id === woId);
    const expectedAt = (wo as any)?.updated_at ?? null;
    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(ctx, "tbl_work_orders", woId, { status: newStatus }, jobId, expectedAt);
    if (result.conflict) {
      toast.warning("This work order was modified — reloading");
      await loadAll();
    } else {
      setWorkOrders((prev) =>
        prev.map((w) => (w.work_order_id === woId ? { ...w, status: newStatus, updated_at: result.data?.updated_at } : w))
      );
    }
  };

  const deleteWO = async (woId: number) => {
    const ctx = await getAuditContext(supabase);
    const wo = workOrders.find(w => w.work_order_id === woId);
    // Log before cascade delete
    await supabase.from("tbl_audit_log").insert({
      user_id: ctx.userId, user_name: ctx.userName, user_role: ctx.userRole,
      table_name: "tbl_work_orders", record_id: woId,
      field_name: "_record", old_value: wo ? JSON.stringify(wo) : null, new_value: null,
      job_id: jobId, action_type: "delete",
    });
    // Delete junction records first, then WO
    await supabase.from("tbl_wo_activities").delete().eq("work_order_id", woId);
    await supabase.from("tbl_jobitem_workorder").delete().eq("work_order_id", woId);
    await supabase.from("tbl_wo_bom").delete().eq("work_order_id", woId);
    await supabase.from("tbl_work_orders").delete().eq("work_order_id", woId);
    setWorkOrders((prev) => prev.filter((wo) => wo.work_order_id !== woId));
    if (expandedWO === woId) {
      setExpandedWO(null);
      setBomRows([]);
      setLinkedItems([]);
    }
  };

  const reorderWO = async (woId: number, direction: -1 | 1) => {
    const sorted = [...workOrders].sort((a, b) => (a.wo_sequence || 0) - (b.wo_sequence || 0));
    const idx = sorted.findIndex(w => w.work_order_id === woId);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    
    const current = sorted[idx];
    const swap = sorted[swapIdx];
    const currentSeq = current.wo_sequence || idx + 1;
    const swapSeq = swap.wo_sequence || swapIdx + 1;

    // Swap sequences in DB
    const ctx = await getAuditContext(supabase);
    await Promise.all([
      auditedUpdate(ctx, "tbl_work_orders", current.work_order_id, { wo_sequence: swapSeq }, jobId),
      auditedUpdate(ctx, "tbl_work_orders", swap.work_order_id, { wo_sequence: currentSeq }, jobId),
    ]);

    // Update local state
    setWorkOrders(prev => prev.map(w => {
      if (w.work_order_id === current.work_order_id) return { ...w, wo_sequence: swapSeq };
      if (w.work_order_id === swap.work_order_id) return { ...w, wo_sequence: currentSeq };
      return w;
    }));
  };

  const voidWO = async (woId: number, reason: string) => {
    const wo = workOrders.find((w) => w.work_order_id === woId);
    const expectedAt = (wo as any)?.updated_at ?? null;
    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(ctx, "tbl_work_orders", woId, { status: "Voided", void_reason: reason }, jobId, expectedAt);
    if (result.conflict) {
      toast.warning("This work order was modified — reloading");
      await loadAll();
    } else {
      setWorkOrders((prev) =>
        prev.map((w) =>
          w.work_order_id === woId ? { ...w, status: "Voided", void_reason: reason, updated_at: result.data?.updated_at } : w
        )
      );
    }
    setVoidDialog(null);
    setVoidReason("");
  };

  const updatePlannedLead = async (woId: number, freelancerId: number | null) => {
    const wo = workOrders.find((w) => w.work_order_id === woId);
    const expectedAt = (wo as any)?.updated_at ?? null;
    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(ctx, "tbl_work_orders", woId, { planned_lead_id: freelancerId }, jobId, expectedAt);

    if (result.conflict) {
      toast.warning("This work order was modified — reloading");
      await loadAll();
    } else {
      const leadName = freelancerId
        ? freelancers.find((f) => f.freelancer_id === freelancerId)?.freelancer_name || null
        : null;
      setWorkOrders((prev) =>
        prev.map((w) =>
          w.work_order_id === woId
            ? { ...w, planned_lead_id: freelancerId, lead_name: leadName, updated_at: result.data?.updated_at }
            : w
        )
      );
    }
  };

  const updateEstimatedHrs = async (woId: number, hrs: string) => {
    const val = hrs ? parseFloat(hrs) : null;
    const wo = workOrders.find((w) => w.work_order_id === woId);
    const expectedAt = (wo as any)?.updated_at ?? null;
    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(ctx, "tbl_work_orders", woId, { estimated_duration_hrs: val }, jobId, expectedAt);

    if (result.conflict) {
      toast.warning("Estimated hours conflict — reloading");
      await loadAll();
    } else {
      setWorkOrders((prev) =>
        prev.map((w) =>
          w.work_order_id === woId ? { ...w, estimated_duration_hrs: val, updated_at: result.data?.updated_at } : w
        )
      );
    }
  };

  const updateWODescription = async (woId: number, desc: string) => {
    const wo = workOrders.find((w) => w.work_order_id === woId);
    const expectedAt = (wo as any)?.updated_at ?? null;
    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(ctx, "tbl_work_orders", woId, { description: desc || null }, jobId, expectedAt);

    if (result.conflict) {
      toast.warning("Description was modified by someone else — reloading");
      await loadAll();
    } else {
      setWorkOrders((prev) =>
        prev.map((w) =>
          w.work_order_id === woId ? { ...w, description: desc || null, updated_at: result.data?.updated_at } : w
        )
      );
    }
  };

  // ============================================================
  // BOM Actions
  // ============================================================

  const addBomRow = async (woId: number) => {
    setAddingBomTo(woId);
    setShowMatSearch(true);
    setMatSearch("");
    setMatResults([]);
  };

  const selectMaterial = async (mat: (typeof materials)[0]) => {
    if (!addingBomTo) return;

    const ctx = await getAuditContext(supabase);
    const { data } = await auditedInsert(ctx, "tbl_wo_bom", {
      work_order_id: addingBomTo,
      job_id: jobId,
      material_id: mat.material_id,
      material_category: mat.material_category,
      item_description: mat.material_name,
      unit: mat.unit,
      unit_cost: mat.current_unit_cost,
      quantity: 1,
      needs_ordering: "false",
    }, jobId);

    if (data) {
      setBomRows((prev) => [...prev, data as BomRow]);
    }
    setShowMatSearch(false);
    setAddingBomTo(null);
    setMatSearch("");
  };

  const addCustomBomRow = async () => {
    if (!addingBomTo) return;

    const ctx = await getAuditContext(supabase);
    const { data } = await auditedInsert(ctx, "tbl_wo_bom", {
      work_order_id: addingBomTo,
      job_id: jobId,
      item_description: matSearch.trim() || "New material",
      quantity: 1,
      needs_ordering: "true",
    }, jobId);

    if (data) {
      setBomRows((prev) => [...prev, data as BomRow]);
    }
    setShowMatSearch(false);
    setAddingBomTo(null);
    setMatSearch("");
  };

  const updateBomField = async (bomId: number, field: string, value: string | number | null) => {
    const row = bomRows.find((r) => r.bom_id === bomId);
    const expectedAt = (row as any)?.updated_at ?? null;
    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(ctx, "tbl_wo_bom", bomId, { [field]: value }, jobId, expectedAt);
    if (result.conflict) {
      toast.warning("BOM row was modified — reloading");
      if (expandedWO) loadBOM(expandedWO);
    } else {
      setBomRows((prev) =>
        prev.map((r) => (r.bom_id === bomId ? { ...r, [field]: value, updated_at: result.data?.updated_at } : r))
      );
    }
  };

  const deleteBomRow = async (bomId: number) => {
    const ctx = await getAuditContext(supabase);
    const row = bomRows.find(r => r.bom_id === bomId);
    await supabase.from("tbl_audit_log").insert({
      user_id: ctx.userId, user_name: ctx.userName, user_role: ctx.userRole,
      table_name: "tbl_wo_bom", record_id: bomId,
      field_name: "_record", old_value: row ? JSON.stringify(row) : null, new_value: null,
      job_id: jobId, action_type: "delete",
    });
    await supabase.from("tbl_wo_bom").delete().eq("bom_id", bomId);
    setBomRows((prev) => prev.filter((r) => r.bom_id !== bomId));
  };

  // Material search filtering
  useEffect(() => {
    if (matSearch.length >= 2) {
      const lower = matSearch.toLowerCase();
      setMatResults(
        materials.filter((m) => m.material_name?.toLowerCase().includes(lower)).slice(0, 8)
      );
    } else {
      setMatResults([]);
    }
  }, [matSearch, materials]);

  // ============================================================
  // Render helpers
  // ============================================================

  // Build standard_length lookup for unit toggle
  const stdLengthMap: Record<number, number> = {};
  (materials || []).forEach((m) => { if (m.standard_length) stdLengthMap[m.material_id] = m.standard_length; });

  // Length-aware row total
  const bomRowTotal = (row: BomRow) => {
    const cost = row.actual_unit_cost ?? row.unit_cost ?? 0;
    const qty = row.quantity || 0;
    if (row.unit === "Length" && row.material_id && stdLengthMap[row.material_id]) {
      return qty * (stdLengthMap[row.material_id] / 1000) * cost;
    }
    return qty * cost;
  };

  const bomTotal = (rows: BomRow[]) =>
    rows.reduce((sum, r) => sum + bomRowTotal(r), 0);

  // ============================================================
  // Loading / not found
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">
        Loading work orders...
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
          href={`/jobs/${jobId}/scope/${scopeId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-navy transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Scope Item
        </Link>
        <PresenceAvatars others={presenceOthers} />
      </div>

      {/* Context bar */}
      <div className="card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-mono">
              {scope.job_number} &gt; Scope #{scope.scope_item_id}
            </p>
            <h1 className="text-xl font-bold text-navy mt-0.5">
              {scope.item_name || `Scope Item #${scope.scope_item_id}`}
            </h1>
            <p className="text-sm text-gray-400">{scope.job_name}</p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-xs text-gray-400">Event</p>
              <p className="text-sm font-medium text-navy">{formatDate(scope.event_date)}</p>
            </div>
            <DaysRemainingBadge eventDate={scope.event_date} />
            <StatusBadge status={scope.scope_status} />
          </div>
        </div>
      </div>

      {/* Cost analysis */}
      <CostBreakdown scopeItemId={scopeId} />

      {/* Work Orders header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hammer className="h-5 w-5 text-navy" />
          <h2 className="text-lg font-semibold text-navy">Work Orders</h2>
          <span className="text-sm text-gray-400">({workOrders.length})</span>
        </div>
      </div>

      {/* Work Orders list */}
      {workOrders.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-gray-400 text-sm">No work orders yet</p>
          <p className="text-gray-300 text-xs mt-1">
            Go back to the Scope Item and create WOs from selected Job Items
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...workOrders].sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999)).map((wo, woIdx, sortedArr) => {
            const isExpanded = expandedWO === wo.work_order_id;

            return (
              <div key={wo.work_order_id} className="card overflow-hidden">
                {/* WO Row */}
                <div
                  className="px-5 py-3.5 flex items-center gap-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() => toggleExpand(wo.work_order_id)}
                >
                  {/* Expand chevron */}
                  <div className="text-gray-300">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>

                  {/* Step indicator */}
                  <div className="flex flex-col items-center w-14 shrink-0">
                    <span className="text-xs font-semibold text-navy">{woIdx + 1}/{sortedArr.length}</span>
                    {woIdx > 0 && (
                      <span className={"text-[9px] " + (
                        sortedArr[woIdx - 1].status === "Complete" ? "text-starlight-green" :
                        sortedArr[woIdx - 1].status === "In-Progress" ? "text-starlight-blue" :
                        "text-gray-400"
                      )}>
                        prev: {sortedArr[woIdx - 1].status === "Complete" ? "done" :
                               sortedArr[woIdx - 1].status === "In-Progress" ? "active" :
                               "waiting"}
                      </span>
                    )}
                    {woIdx === 0 && <span className="text-[9px] text-gray-300">first</span>}
                  </div>

                  {/* Activity label + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-navy truncate">
                        {wo.activity_label}
                      </p>
                      {wo.paint_notes && <span title="Has painting notes"><Paintbrush className="h-3 w-3 text-starlight-amber shrink-0" /></span>}
                    </div>
                    {wo.description && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {wo.description}
                      </p>
                    )}
                  </div>

                  {/* Estimated hours */}
                  <div className="text-right w-16 shrink-0">
                    <p className="text-sm font-mono text-navy">
                      {wo.estimated_duration_hrs != null
                        ? `${wo.estimated_duration_hrs}h`
                        : "—"}
                    </p>
                    <p className="text-[10px] text-gray-400">est.</p>
                  </div>

                  {/* Planned lead */}
                  <div className="w-28 shrink-0 text-right">
                    {wo.lead_name ? (
                      <p className="text-xs text-gray-600 truncate">{wo.lead_name}</p>
                    ) : (
                      <p className="text-xs text-gray-300 italic">Unassigned</p>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="w-24 shrink-0 text-right" onClick={(e) => e.stopPropagation()}>
                    <StatusBadge status={wo.status} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Print Traveller */}
                    <PrintTravellerButton
                      wo={{
                        ...wo,
                        activity_label: wo.activity_label || "No Activity",
                      }}
                      workOrders={sortedArr.map((w) => ({
                        ...w,
                        activity_label: w.activity_label || "No Activity",
                      }))}
                      scope={scope!}
                      scopeId={scopeId}
                      jobId={jobId}
                      onPrinted={() => loadAll()}
                    />
                    {wo.status === "Not-Started" && (
                      <button
                        onClick={() => updateWOStatus(wo.work_order_id, "Ready")}
                        className="p-1.5 rounded-lg text-starlight-green hover:bg-starlight-green/10 transition-colors"
                        title="Release as Ready"
                      >
                        <ShieldCheck className="h-4 w-4" />
                      </button>
                    )}
                    {(wo.status === "Not-Started" || wo.status === "Ready") && (
                      <button
                        onClick={() => {
                          if (confirm("Delete this work order? This cannot be undone.")) {
                            deleteWO(wo.work_order_id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-starlight-red hover:bg-red-50 transition-colors"
                        title="Delete work order"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {wo.status !== "Voided" && wo.status !== "Complete" && wo.status !== "Not-Started" && (
                      <button
                        onClick={() => setVoidDialog({ woId: wo.work_order_id, status: wo.status || "" })}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-starlight-amber hover:bg-amber-50 transition-colors"
                        title="Void work order"
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/30">
                    {/* Editable WO fields */}
                    <div className="px-5 py-3 border-b border-gray-100">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-medium text-gray-500">Step {woIdx + 1} of {sortedArr.length}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); reorderWO(wo.work_order_id, -1); }}
                          disabled={woIdx === 0}
                          className="p-1 rounded text-gray-400 hover:text-navy hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                          title="Move up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); reorderWO(wo.work_order_id, 1); }}
                          disabled={woIdx === sortedArr.length - 1}
                          className="p-1 rounded text-gray-400 hover:text-navy hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                          title="Move down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                      <div>
                        <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          defaultValue={wo.description || ""}
                          onFocus={() => presenceSetEditing(`wo_${wo.work_order_id}_description`)}
                          onBlur={(e) => {
                            presenceSetEditing(null);
                            updateWODescription(wo.work_order_id, e.target.value);
                          }}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                          placeholder="What needs doing..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                          Est. Hours
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          defaultValue={wo.estimated_duration_hrs ?? ""}
                          onFocus={() => presenceSetEditing(`wo_${wo.work_order_id}_est_hrs`)}
                          onBlur={(e) => {
                            presenceSetEditing(null);
                            updateEstimatedHrs(wo.work_order_id, e.target.value);
                          }}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                          Planned Lead
                        </label>
                        <select
                          value={wo.planned_lead_id || ""}
                          onChange={(e) =>
                            updatePlannedLead(
                              wo.work_order_id,
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                        >
                          <option value="">Unassigned</option>
                          {freelancers.map((f) => (
                            <option key={f.freelancer_id} value={f.freelancer_id}>
                              {f.freelancer_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                          Complexity
                        </label>
                        <select
                          value={wo.complexity_construction || ""}
                          onChange={async (e) => {
                            const val = e.target.value || null;
                            const ctx = await getAuditContext(supabase);
                            await auditedUpdate(ctx, "tbl_work_orders", wo.work_order_id, { complexity_construction: val }, jobId);
                            setWorkOrders((prev) => prev.map((w) => w.work_order_id === wo.work_order_id ? { ...w, complexity_construction: val } : w));
                          }}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                        >
                          <option value="">Select...</option>
                          <option value="1 - Straightforward">1 - Straightforward</option>
                          <option value="2 - Skilled">2 - Skilled</option>
                          <option value="3 - Bespoke/Artistic">3 - Bespoke/Artistic</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                          Finish
                        </label>
                        <select
                          value={wo.finish_relative || ""}
                          onChange={async (e) => {
                            const val = e.target.value || null;
                            const ctx = await getAuditContext(supabase);
                            await auditedUpdate(ctx, "tbl_work_orders", wo.work_order_id, { finish_relative: val }, jobId);
                            setWorkOrders((prev) => prev.map((w) => w.work_order_id === wo.work_order_id ? { ...w, finish_relative: val } : w));
                          }}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                        >
                          <option value="">Select...</option>
                          <option value="Raw">Raw</option>
                          <option value="Good">Good</option>
                          <option value="Spotlight">Spotlight</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                          Status
                        </label>
                        <select
                          value={wo.status || "Not-Started"}
                          onChange={(e) =>
                            updateWOStatus(wo.work_order_id, e.target.value)
                          }
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                        >
                          <option value="Not-Started">Not-Started</option>
                          <option value="Ready">Ready</option>
                          <option value="In-Progress">In-Progress</option>
                          <option value="Complete">Complete</option>
                          <option value="On-Hold">On-Hold</option>
                          <option value="Voided">Voided</option>
                        </select>
                      </div>
                    </div>

                    </div>
                    {/* Paint notes */}
                    <div className="px-5 py-3 border-b border-gray-100">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Paintbrush className="h-3.5 w-3.5 text-starlight-amber" />
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Painting</label>
                        {!wo.paint_notes && <span className="text-[9px] text-gray-300 italic">None — add notes if this WO needs painting</span>}
                      </div>
                      <textarea
                        defaultValue={wo.paint_notes || ""}
                        onFocus={() => presenceSetEditing(`wo_${wo.work_order_id}_paint`)}
                        onBlur={async (e) => {
                          presenceSetEditing(null);
                          const val = e.target.value.trim() || null;
                          if (val !== wo.paint_notes) {
                            const ctx = await getAuditContext(supabase);
                            await auditedUpdate(ctx, "tbl_work_orders", wo.work_order_id, { paint_notes: val }, jobId);
                            setWorkOrders(prev => prev.map(w => w.work_order_id === wo.work_order_id ? { ...w, paint_notes: val } : w));
                          }
                        }}
                        rows={2}
                        placeholder="e.g. Paint back panel RAL 9005, 2 coats primer + 1 topcoat on raw MDF edges"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-amber resize-none placeholder:text-gray-300"
                      />
                    </div>
                    {/* Linked Job Items */}
                    {linkedItems.length > 0 && (
                      <div className="px-5 py-3 border-b border-gray-100">
                        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          Linked Job Items
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {linkedItems.map((item: any) => (
                            <div
                              key={item.item_id}
                              className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5"
                            >
                              <Link2 className="h-3 w-3 text-gray-400 shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-navy">
                                  {item.quantity ? item.quantity + "x " : ""}{item.description}
                                </p>
                                {item.finish_required && (
                                  <p className="text-[10px] text-starlight-amber">{item.finish_required}</p>
                                )}
                              </div>
                              <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                                {item.item_type}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* BOM Section */}
                    <div className="px-5 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Bill of Materials
                        </h3>
                        <button
                          onClick={() => addBomRow(wo.work_order_id)}
                          className="inline-flex items-center gap-1 text-xs text-starlight-blue hover:text-blue-700 font-medium transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Material
                        </button>
                      </div>

                      {bomLoading ? (
                        <p className="text-xs text-gray-400 animate-pulse py-2">
                          Loading materials...
                        </p>
                      ) : bomRows.length === 0 ? (
                        <p className="text-xs text-gray-300 py-2">
                          No materials added yet
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-200">
                                <th className="text-left py-1.5 pr-3 font-medium">Material</th>
                                <th className="text-right py-1.5 px-2 font-medium w-20">Qty</th>
                                <th className="text-left py-1.5 px-2 font-medium w-20">Unit</th>
                                <th className="text-right py-1.5 px-2 font-medium w-24">Unit £</th>
                                <th className="text-right py-1.5 px-2 font-medium w-24">Total</th>
                                <th className="text-center py-1.5 px-2 font-medium w-14">Stock</th>
                                <th className="text-center py-1.5 px-2 font-medium w-16">Order</th>
                                <th className="w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bomRows.map((row) => {
                                const cost = row.actual_unit_cost ?? row.unit_cost ?? 0;
                                const total = bomRowTotal(row);
                                const stdLen = row.material_id ? stdLengthMap[row.material_id] : null;
                                const isLengthMode = row.unit === "Length" && stdLen;
                                const canToggle = !!stdLen;
                                const isFromStock = isTruthy(row.from_stock);
                                return (
                                  <tr
                                    key={row.bom_id}
                                    className="border-b border-gray-100 last:border-0"
                                  >
                                    <td className="py-1.5 pr-3">
                                      <div className="flex items-center gap-1.5">
                                        {(row.stock_item_id || isFromStock) && (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-starlight-amber/10 text-starlight-amber text-[9px] font-medium rounded shrink-0">
                                            <Warehouse className="h-2.5 w-2.5" />Stock
                                          </span>
                                        )}
                                        <input
                                          type="text"
                                          defaultValue={row.item_description || ""}
                                          onFocus={() => presenceSetEditing(`bom_${row.bom_id}_desc`)}
                                          onBlur={(e) => {
                                            presenceSetEditing(null);
                                            updateBomField(row.bom_id, "item_description", e.target.value || null);
                                          }}
                                          className="w-full px-1.5 py-1 border border-transparent hover:border-gray-200 focus:border-starlight-blue rounded text-sm bg-transparent focus:bg-white focus:outline-none"
                                        />
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        defaultValue={row.quantity ?? ""}
                                        onFocus={() => presenceSetEditing(`bom_${row.bom_id}_qty`)}
                                        onBlur={(e) => {
                                          presenceSetEditing(null);
                                          updateBomField(
                                            row.bom_id,
                                            "quantity",
                                            e.target.value ? parseFloat(e.target.value) : null
                                          );
                                        }}
                                        className="w-full px-1.5 py-1 border border-transparent hover:border-gray-200 focus:border-starlight-blue rounded text-sm text-right bg-transparent focus:bg-white focus:outline-none font-mono"
                                      />
                                    </td>
                                    <td className="py-1.5 px-2">
                                      {canToggle ? (
                                        <div>
                                          <button
                                            onClick={() => updateBomField(row.bom_id, "unit", isLengthMode ? "Metre" : "Length")}
                                            className={"inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors " + (isLengthMode ? "bg-navy/10 text-navy border-navy/20 hover:bg-navy/20" : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200")}
                                            title={isLengthMode ? `Switch to metres (std length: ${stdLen}mm)` : `Switch to lengths of ${stdLen}mm`}
                                          >
                                            {isLengthMode ? "Length" : "Metre"}
                                            <span className="text-[9px] text-gray-400">⇄</span>
                                          </button>
                                          {isLengthMode && (
                                            <p className="text-[9px] text-gray-400 mt-0.5">{row.quantity || 0} × {(stdLen! / 1000).toFixed(1)}m = {((row.quantity || 0) * stdLen! / 1000).toFixed(1)}m</p>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-xs text-gray-400">{row.unit || "—"}</span>
                                      )}
                                    </td>
                                    <td className="py-1.5 px-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        defaultValue={cost || ""}
                                        onFocus={() => presenceSetEditing(`bom_${row.bom_id}_cost`)}
                                        onBlur={(e) => {
                                          presenceSetEditing(null);
                                          updateBomField(
                                            row.bom_id,
                                            "unit_cost",
                                            e.target.value ? parseFloat(e.target.value) : null
                                          );
                                        }}
                                        className="w-full px-1.5 py-1 border border-transparent hover:border-gray-200 focus:border-starlight-blue rounded text-sm text-right bg-transparent focus:bg-white focus:outline-none font-mono"
                                      />
                                    </td>
                                    <td className="py-1.5 px-2 text-right text-sm font-mono text-navy">
                                      {formatCurrency(total)}
                                    </td>
                                    <td className="py-1.5 px-2 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isFromStock}
                                        onChange={async (e) => {
                                          const val = e.target.checked;
                                          await updateBomField(row.bom_id, "from_stock", val ? "true" : "false");
                                          if (val) {
                                            await updateBomField(row.bom_id, "needs_ordering", "false");
                                            // Auto-fill cost from catalogue if empty
                                            if (!row.unit_cost && row.material_id) {
                                              const mat = materials.find(m => m.material_id === row.material_id);
                                              if (mat?.current_unit_cost) {
                                                await updateBomField(row.bom_id, "unit_cost", mat.current_unit_cost);
                                              }
                                            }
                                          }
                                        }}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-starlight-amber focus:ring-starlight-amber"
                                        title="From workshop stock (internal cost)"
                                      />
                                    </td>
                                    <td className="py-1.5 px-2 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isTruthy(row.needs_ordering)}
                                        disabled={isFromStock}
                                        onChange={(e) =>
                                          updateBomField(
                                            row.bom_id,
                                            "needs_ordering",
                                            e.target.checked ? "true" : "false"
                                          )
                                        }
                                        className={"h-3.5 w-3.5 rounded border-gray-300 text-starlight-amber focus:ring-starlight-amber" + (isFromStock ? " opacity-30" : "")}
                                      />
                                    </td>
                                    <td className="py-1.5">
                                      <button
                                        onClick={() => deleteBomRow(row.bom_id)}
                                        className="p-1 text-gray-300 hover:text-starlight-red transition-colors"
                                        title="Remove"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-gray-200">
                                <td
                                  colSpan={5}
                                  className="py-2 text-right text-xs font-medium text-gray-500"
                                >
                                  Material Total
                                </td>
                                <td className="py-2 px-2 text-right text-sm font-semibold text-navy font-mono">
                                  {formatCurrency(bomTotal(bomRows))}
                                </td>
                                <td colSpan={3}></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Documents & Files */}
                    <WODocumentsPanel
                      workOrderId={wo.work_order_id}
                      scopeItemId={scopeId}
                      jobId={jobId}
                      jobNumber={scope?.job_number || ""}
                      jobName={scope?.job_name || ""}
                      scopeName={scope?.item_name || ""}
                      activityLabel={wo.activity_label || ""}
                      readOnly={wo.status === "Voided" || wo.status === "Complete"}
                      onBomChanged={async () => { await loadBOM(wo.work_order_id); }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Void dialog */}
      {voidDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-navy">Void Work Order</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Voided WOs retain all time entry costs. This cannot be undone.
              </p>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason *</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Why is this being voided..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-amber resize-none"
                autoFocus
              />
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => { setVoidDialog(null); setVoidReason(""); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => voidReason.trim() && voidWO(voidDialog.woId, voidReason.trim())}
                disabled={!voidReason.trim()}
                className="px-4 py-2 bg-starlight-amber text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                Void Work Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Material search modal */}
      {showMatSearch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-navy">Add Material to BOM</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Search the catalogue or type a custom item
              </p>
            </div>
            <div className="px-5 py-3">
              <input
                type="text"
                value={matSearch}
                onChange={(e) => setMatSearch(e.target.value)}
                placeholder="Search materials..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                autoFocus
              />

              {/* Results */}
              {matResults.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {matResults.map((m) => (
                    <button
                      key={m.material_id}
                      onClick={() => selectMaterial(m)}
                      className="w-full text-left px-3 py-2 hover:bg-starlight-bg transition-colors"
                    >
                      <p className="text-sm text-navy font-medium">{m.material_name}</p>
                      <p className="text-xs text-gray-400">
                        {m.unit}
                        {m.current_unit_cost != null && ` · ${formatCurrency(m.current_unit_cost)}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {matSearch.length >= 2 && matResults.length === 0 && (
                <p className="text-xs text-gray-400 mt-2 py-1">
                  No catalogue matches
                </p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
              <button
                onClick={() => {
                  setShowMatSearch(false);
                  setAddingBomTo(null);
                  setMatSearch("");
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addCustomBomRow}
                className="px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy/90 transition-colors"
              >
                {matSearch.trim() ? `Add "${matSearch.trim()}" as custom` : "Add blank row"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict dialog for concurrent edits */}
      {conflictInfo && conflictResolve && (
        <ConflictDialog
          open={true}
          conflict={conflictInfo}
          onUseMine={conflictResolve.onMine}
          onUseTheirs={conflictResolve.onTheirs}
          onCancel={() => { setConflictInfo(null); setConflictResolve(null); }}
        />
      )}
    </div>
  );
}
