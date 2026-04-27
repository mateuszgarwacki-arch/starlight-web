"use client";

import { useEffect, useState, useCallback, useImperativeHandle, forwardRef, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import type { WoBom, Freelancer, ScopeContext } from "@/lib/types";
import { StatusBadge } from "@/components/ui/badges";
import { WODocumentsPanel } from "@/components/wo-documents-panel";
import { PrintTravellerButton } from "@/components/traveller/traveller-preview";
import {
  ChevronDown, ChevronRight, Plus, Trash2, Hammer, ShieldCheck,
  AlertTriangle, Link2, ArrowUp, ArrowDown, Warehouse, Paintbrush,
  CheckCircle2, X, Circle, Search, MapPin, Wrench, Package,
  ArrowUpCircle, CornerDownRight,
} from "lucide-react";
import { toast } from "sonner";
import { getAuditContext, auditedUpdate, auditedInsert } from "@/lib/audit";
import { promoteJobItemToStock } from "@/lib/promote-to-stock";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import { usePresence } from "@/lib/use-presence";
import { CreateWODialog } from "@/components/create-wo-dialog";
import { ConflictDialog, type ConflictInfo } from "@/components/conflict-dialog";
import { LearningTrigger } from "@/components/learning-trigger";
import { WOStepsPanel } from "@/components/wo-steps-panel";

// ============================================================
// Types
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
  completion_photo_path: string | null;
  predecessor_wo_id: number | null;
  sort_phase: number;
  activity_label?: string;
  phase_number?: number | null;
  lead_name?: string | null;
}

interface BomRow extends WoBom { _isNew?: boolean; }

interface JobItemRow {
  item_id: number;
  job_id: number | null;
  scope_item_id: number | null;
  description: string | null;
  item_type: string | null;
  stock_reference: string | null;
  quantity: number | null;
  unit: string | null;
  finish_required: string | null;
  notes: string | null;
  has_wo: string | null;
  temp_selected: string | null;
  stock_item_id: number | null;
  item_source: string | null;
  source_item_id: number | null;
}

interface StockItemResult {
  stock_id: number;
  product_code: string;
  description: string;
  stock_quantity: number;
  location: string | null;
  hire_cost_day: number | null;
  thumbnail_url: string | null;
}

// Color palette for WO→item linking
export const WO_COLORS = [
  { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30", dot: "bg-blue-400" },
  { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", dot: "bg-amber-400" },
  { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/30", dot: "bg-purple-400" },
  { bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30", dot: "bg-rose-400" },
  { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/30", dot: "bg-cyan-400" },
];

export interface WorkOrdersPanelRef {
  refresh: () => Promise<void>;
  expandWO: (woId: number) => void;
  updateJobItem: (itemId: number, field: string, value: any) => Promise<void>;
  deleteJobItem: (itemId: number) => Promise<void>;
}

interface WorkOrdersPanelProps {
  jobId: number;
  scopeId: number;
  scope: ScopeContext | null;
  initialExpandId?: number | null;
  onCostChange?: () => void;
  onRequestCreateWO?: (itemIds: number[]) => void;
  onInventoryUpdate?: (data: { items: any[]; junctions: any[]; woColorMap: Record<number, number>; sortedWOs: any[]; scopeBom: any[]; woBom: any[] }) => void;
}

// ============================================================
// Component
// ============================================================

export const WorkOrdersPanel = forwardRef<WorkOrdersPanelRef, WorkOrdersPanelProps>(
  function WorkOrdersPanel({ jobId, scopeId, scope, initialExpandId, onCostChange, onRequestCreateWO, onInventoryUpdate }, ref) {
    const supabase = createClient();

    // WO state
    const [workOrders, setWorkOrders] = useState<WORow[]>([]);
    const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedWO, setExpandedWO] = useState<number | null>(null);
    const [bomRows, setBomRows] = useState<BomRow[]>([]);
    const [bomLoading, setBomLoading] = useState(false);
    const [materials, setMaterials] = useState<
      { material_id: number; material_name: string; unit: string; current_unit_cost: number | null; material_category: number | null; standard_length: number | null; standard_width: number | null }[]
    >([]);
    const [voidDialog, setVoidDialog] = useState<{ woId: number; status: string } | null>(null);
    const [voidReason, setVoidReason] = useState("");
    const [completionPhotoUrls, setCompletionPhotoUrls] = useState<Record<number, string>>({});

    // Job items state
    const [jobItems, setJobItems] = useState<JobItemRow[]>([]);
    const [junctions, setJunctions] = useState<{ job_item_id: number; work_order_id: number }[]>([]);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
    // Assignees: work_order_id → array of freelancer_ids (peer-model: all equal)
    const [assigneesByWO, setAssigneesByWO] = useState<Record<number, number[]>>({});
    // Track which WO has its assignee picker open
    const [assigneePickerWO, setAssigneePickerWO] = useState<number | null>(null);

    // All BOM rows across all WOs (for consolidated view)
    const [allBomRows, setAllBomRows] = useState<(BomRow & { wo_label?: string; wo_color_idx?: number })[]>([]);
    const [scopeBomRows, setScopeBomRows] = useState<{ bom_id: number; item_description: string; quantity: number; unit: string; unit_cost: number; material_id: number | null; from_stock: string | null; needs_ordering: string | null }[]>([]);

    // Material search for WO BOM
    const [matSearch, setMatSearch] = useState("");
    const [matResults, setMatResults] = useState<typeof materials>([]);
    const [showMatSearch, setShowMatSearch] = useState(false);
    const [addingBomTo, setAddingBomTo] = useState<number | null>(null);
    const [linkedItems, setLinkedItems] = useState<any[]>([]);

    // Stock picker
    const [showStockPicker, setShowStockPicker] = useState(false);
    const [stockSearch, setStockSearch] = useState("");
    const [stockResults, setStockResults] = useState<StockItemResult[]>([]);
    const [stockLoading, setStockLoading] = useState(false);
    const stockDebounce = useRef<NodeJS.Timeout | null>(null);

    // Bespoke dialog
    const [showBespokeDialog, setShowBespokeDialog] = useState(false);
    const [bespokeForm, setBespokeForm] = useState({ description: "", quantity: "1", finish_required: "", promote_to_stock: false, source_item_id: null as number | null, _showCopy: false });
    const [jobBespokeItems, setJobBespokeItems] = useState<{ item_id: number; description: string; quantity: number | null; finish_required: string | null; scope_name: string }[]>([]);

    // Scope-level material add
    const [showScopeMaterialSearch, setShowScopeMaterialSearch] = useState(false);
    const [scopeMatQuery, setScopeMatQuery] = useState("");
    const [scopeMatResults, setScopeMatResults] = useState<{ material_id: number; material_name: string; unit: string; current_unit_cost: number | null; material_category: number | null; standard_width: number | null; standard_length: number | null }[]>([]);
    const [scopeMatSelected, setScopeMatSelected] = useState<{ material_id: number; material_name: string; unit: string; current_unit_cost: number | null; standard_width: number | null; standard_length: number | null } | null>(null);
    const [scopeMatQty, setScopeMatQty] = useState("1");
    const [scopeMatUnit, setScopeMatUnit] = useState("");

    // Consolidated BOM expanded
    const [bomExpanded, setBomExpanded] = useState(false);

    // Next Step dialog
    const [nextStepPredecessor, setNextStepPredecessor] = useState<{ work_order_id: number; activity_label: string; phase_number: number | null; description: string | null; job_item_ids: number[] } | null>(null);

    const [costKey, setCostKey] = useState(0);
    const bumpCost = () => { setCostKey(k => k + 1); onCostChange?.(); };

    const { setEditing: presenceSetEditing } = usePresence("scope", scopeId, "Work Orders");
    const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
    const [conflictResolve, setConflictResolve] = useState<{ onMine: () => void; onTheirs: () => void } | null>(null);

    // ============================================================
    // Data loading
    // ============================================================

    const loadAll = useCallback(async () => {
      // Phase 1: core data (no dependency on WO IDs)
      const [woRes, freelancerRes, matRes, itemsRes] = await Promise.all([
        supabase.from("qry_wo_phase_ordered").select("*").eq("scope_item_id", scopeId),
        supabase.from("tbl_freelancers").select("*").eq("active", true).order("freelancer_name"),
        supabase.from("tbl_materials").select("material_id, material_name, unit, current_unit_cost, material_category, standard_length, standard_width").eq("active", true).order("material_name"),
        supabase.from("qry_jobitems_withcoverage").select("*").eq("scope_item_id", scopeId).order("item_id"),
      ]);

      if (freelancerRes.data) setFreelancers(freelancerRes.data as Freelancer[]);
      if (matRes.data) setMaterials(matRes.data);
      if (itemsRes.data) setJobItems(itemsRes.data as JobItemRow[]);

      // Phase 2: queries that depend on WO IDs
      const woIds = (woRes.data || []).map((w: WORow) => w.work_order_id);

      let juncData: any[] = [];
      let scopeBomData: BomRow[] = [];
      let woBomData: BomRow[] = [];
      let actData: any[] = [];

      if (woIds.length > 0) {
        const [juncRes, scopeBomRes, woBomRes, actRes, assigneesRes] = await Promise.all([
          supabase.from("tbl_jobitem_workorder").select("job_item_id, work_order_id").in("work_order_id", woIds),
          supabase.from("tbl_wo_bom").select("*").eq("scope_item_id", scopeId).is("work_order_id", null).order("bom_id"),
          supabase.from("tbl_wo_bom").select("*").in("work_order_id", woIds).order("bom_id"),
          supabase.from("tbl_wo_activities").select("work_order_id, activity_id, sequence").in("work_order_id", woIds).order("sequence"),
          supabase.from("tbl_wo_assignees").select("work_order_id, freelancer_id").in("work_order_id", woIds),
        ]);
        juncData = juncRes.data || [];
        scopeBomData = (scopeBomRes.data || []) as BomRow[];
        woBomData = (woBomRes.data || []) as BomRow[];
        actData = actRes.data || [];
        // Build assignees map
        const assMap: Record<number, number[]> = {};
        (assigneesRes.data || []).forEach((a: any) => {
          if (!assMap[a.work_order_id]) assMap[a.work_order_id] = [];
          assMap[a.work_order_id].push(a.freelancer_id);
        });
        setAssigneesByWO(assMap);
      } else {
        // No WOs — just get scope-level BOM
        const { data } = await supabase.from("tbl_wo_bom").select("*").eq("scope_item_id", scopeId).is("work_order_id", null).order("bom_id");
        scopeBomData = (data || []) as BomRow[];
      }

      setJunctions(juncData);

      // Split scope BOM
      const sBom: typeof scopeBomRows = [];
      for (const b of scopeBomData) {
        sBom.push({ bom_id: b.bom_id, item_description: b.item_description || "", quantity: b.quantity || 0, unit: b.unit || "Each", unit_cost: b.unit_cost || 0, material_id: b.material_id, from_stock: b.from_stock, needs_ordering: b.needs_ordering });
      }
      setScopeBomRows(sBom);

      // Enrich WOs with activity labels (actData already fetched in phase 2)
      if (woRes.data && woRes.data.length > 0) {
        const activityIds = actData.length > 0 ? [...new Set(actData.map((a: { activity_id: number }) => a.activity_id))] : [];
        const verbIds = woRes.data.map((w: WORow) => w.activity_verb).filter((id: number | null): id is number => id !== null);
        const allLookupIds = [...new Set([...activityIds, ...verbIds])];

        let lookupMap: Record<number, { lookup_value: string; phase_number: number | null }> = {};
        if (allLookupIds.length > 0) {
          const { data: lookups } = await supabase.from("tbl_master_lookups").select("lookup_id, lookup_value, phase_number").in("lookup_id", allLookupIds);
          if (lookups) lookups.forEach((l: any) => { lookupMap[l.lookup_id] = { lookup_value: l.lookup_value || "", phase_number: l.phase_number }; });
        }

        const actByWO: Record<number, { activity_id: number; sequence: number }[]> = {};
        actData.forEach((a: any) => { if (!actByWO[a.work_order_id]) actByWO[a.work_order_id] = []; actByWO[a.work_order_id].push(a); });
        const flMap: Record<number, string> = {};
        if (freelancerRes.data) (freelancerRes.data as Freelancer[]).forEach(f => { flMap[f.freelancer_id] = f.freelancer_name || "Unknown"; });

        const enriched: WORow[] = woRes.data.map((wo: WORow) => {
          const acts = actByWO[wo.work_order_id];
          let label: string; let phaseNum: number | null = null;
          if (acts && acts.length > 0) {
            acts.sort((a, b) => a.sequence - b.sequence);
            label = acts.map(a => lookupMap[a.activity_id]?.lookup_value || "?").join(" + ");
            phaseNum = lookupMap[acts[0].activity_id]?.phase_number ?? null;
          } else if (wo.activity_verb && lookupMap[wo.activity_verb]) {
            label = lookupMap[wo.activity_verb].lookup_value; phaseNum = lookupMap[wo.activity_verb].phase_number;
          } else { label = "No Activity"; }
          return { ...wo, activity_label: label, phase_number: phaseNum, lead_name: wo.planned_lead_id ? flMap[wo.planned_lead_id] || null : null };
        });

        setWorkOrders(enriched);

        const sortedWOs = [...enriched].sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999));
        const woColorMap: Record<number, number> = {};
        sortedWOs.forEach((wo, idx) => { woColorMap[wo.work_order_id] = idx % WO_COLORS.length; });
        setAllBomRows(woBomData.map(b => ({ ...b, wo_label: enriched.find(w => w.work_order_id === b.work_order_id)?.activity_label, wo_color_idx: b.work_order_id ? woColorMap[b.work_order_id] : undefined })));
      } else {
        setWorkOrders([]);
        setAllBomRows([]);
      }
      setLoading(false);
      setSelectedItemIds(new Set());
    }, [scopeId]);

    // Push inventory data to parent after each load
    useEffect(() => {
      if (!loading) {
        const sorted = [...workOrders].sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999));
        const colorMap: Record<number, number> = {};
        sorted.forEach((wo, idx) => { colorMap[wo.work_order_id] = idx % WO_COLORS.length; });
        onInventoryUpdate?.({ items: jobItems, junctions, woColorMap: colorMap, sortedWOs: sorted, scopeBom: scopeBomRows, woBom: allBomRows });
      }
    }, [loading, jobItems, junctions, workOrders, scopeBomRows, allBomRows]);

    useEffect(() => { loadAll(); }, [loadAll]);
    useEffect(() => { if (initialExpandId) setExpandedWO(initialExpandId); }, [initialExpandId]);
    useEffect(() => {
      const h = () => { if (document.visibilityState === "visible") loadAll(); };
      document.addEventListener("visibilitychange", h);
      return () => document.removeEventListener("visibilitychange", h);
    }, [loadAll]);

    useImperativeHandle(ref, () => ({
      refresh: loadAll,
      expandWO: (woId: number) => { setExpandedWO(woId); loadBOM(woId); loadLinkedItems(woId); },
      updateJobItem: async (itemId: number, field: string, value: any) => { await updateJobItem(itemId, field, value); },
      deleteJobItem: async (itemId: number) => { await deleteJobItem(itemId); },
    }));

    // ============================================================
    // BOM loading for expanded WO
    // ============================================================
    const loadBOM = async (woId: number) => {
      setBomLoading(true);
      const { data } = await supabase.from("tbl_wo_bom").select("*").eq("work_order_id", woId).order("bom_id");
      setBomRows((data as BomRow[]) || []);
      setBomLoading(false);
    };
    const loadLinkedItems = async (woId: number) => {
      const { data: juncs } = await supabase.from("tbl_jobitem_workorder").select("job_item_id").eq("work_order_id", woId);
      if (juncs && juncs.length > 0) {
        const ids = juncs.map((j: any) => j.job_item_id);
        const { data: items } = await supabase.from("tbl_job_items").select("item_id, description, quantity, unit, item_type, finish_required").in("item_id", ids);
        setLinkedItems(items || []);
      } else { setLinkedItems([]); }
    };
    const toggleExpand = (woId: number) => {
      if (expandedWO === woId) { setExpandedWO(null); setBomRows([]); setLinkedItems([]); }
      else {
        setExpandedWO(woId); loadBOM(woId); loadLinkedItems(woId);
        const wo = workOrders.find(w => w.work_order_id === woId);
        if (wo?.completion_photo_path && !completionPhotoUrls[woId]) {
          getOneDriveUrl(wo.completion_photo_path).then(url => setCompletionPhotoUrls(p => ({ ...p, [woId]: url }))).catch(() => {});
        }
      }
    };

    // ============================================================
    // WO Actions
    // ============================================================
    const updateWOStatus = async (woId: number, newStatus: string) => {
      const wo = workOrders.find(w => w.work_order_id === woId);
      const ctx = await getAuditContext(supabase);
      const result = await auditedUpdate(ctx, "tbl_work_orders", woId, { status: newStatus }, jobId, (wo as any)?.updated_at ?? null);
      if (result.conflict) { toast.warning("WO modified — reloading"); await loadAll(); }
      else { setWorkOrders(prev => prev.map(w => w.work_order_id === woId ? { ...w, status: newStatus, updated_at: result.data?.updated_at } : w)); }
    };
    const deleteWO = async (woId: number) => {
      const ctx = await getAuditContext(supabase);
      const wo = workOrders.find(w => w.work_order_id === woId);
      await supabase.from("tbl_audit_log").insert({ user_id: ctx.userId, user_name: ctx.userName, user_role: ctx.userRole, table_name: "tbl_work_orders", record_id: woId, field_name: "_record", old_value: wo ? JSON.stringify(wo) : null, new_value: null, job_id: jobId, action_type: "delete" });
      await supabase.from("tbl_wo_activities").delete().eq("work_order_id", woId);
      await supabase.from("tbl_jobitem_workorder").delete().eq("work_order_id", woId);
      await supabase.from("tbl_wo_bom").delete().eq("work_order_id", woId);
      await supabase.from("tbl_work_orders").delete().eq("work_order_id", woId);
      if (expandedWO === woId) { setExpandedWO(null); setBomRows([]); setLinkedItems([]); }
      loadAll(); bumpCost();
    };
    const reorderWO = async (woId: number, direction: -1 | 1) => {
      const sorted = [...workOrders].sort((a, b) => (a.wo_sequence || 0) - (b.wo_sequence || 0));
      const idx = sorted.findIndex(w => w.work_order_id === woId);
      const swapIdx = idx + direction;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      const current = sorted[idx]; const swap = sorted[swapIdx];
      const ctx = await getAuditContext(supabase);
      await Promise.all([
        auditedUpdate(ctx, "tbl_work_orders", current.work_order_id, { wo_sequence: swap.wo_sequence || swapIdx + 1 }, jobId),
        auditedUpdate(ctx, "tbl_work_orders", swap.work_order_id, { wo_sequence: current.wo_sequence || idx + 1 }, jobId),
      ]);
      setWorkOrders(prev => prev.map(w => {
        if (w.work_order_id === current.work_order_id) return { ...w, wo_sequence: swap.wo_sequence || swapIdx + 1 };
        if (w.work_order_id === swap.work_order_id) return { ...w, wo_sequence: current.wo_sequence || idx + 1 };
        return w;
      }));
    };
    const voidWO = async (woId: number, reason: string) => {
      const wo = workOrders.find(w => w.work_order_id === woId);
      const ctx = await getAuditContext(supabase);
      const result = await auditedUpdate(ctx, "tbl_work_orders", woId, { status: "Voided", void_reason: reason }, jobId, (wo as any)?.updated_at ?? null);
      if (result.conflict) { toast.warning("WO modified — reloading"); await loadAll(); }
      else { setWorkOrders(prev => prev.map(w => w.work_order_id === woId ? { ...w, status: "Voided", void_reason: reason, updated_at: result.data?.updated_at } : w)); }
      setVoidDialog(null); setVoidReason("");
    };
    const addAssignee = async (woId: number, freelancerId: number) => {
      const current = assigneesByWO[woId] || [];
      if (current.includes(freelancerId)) return;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("tbl_wo_assignees").insert({
        work_order_id: woId,
        freelancer_id: freelancerId,
        assigned_by: user?.id || null,
      });
      if (error) { toast.error("Assign failed: " + error.message); return; }
      setAssigneesByWO(prev => ({ ...prev, [woId]: [...current, freelancerId] }));
      // Reflect sync-trigger result in local WO state so "lead_name" stays correct
      if (current.length === 0) {
        const name = freelancers.find(f => f.freelancer_id === freelancerId)?.freelancer_name || null;
        setWorkOrders(prev => prev.map(w => w.work_order_id === woId ? { ...w, planned_lead_id: freelancerId, lead_name: name } : w));
      }
      const name = freelancers.find(f => f.freelancer_id === freelancerId)?.freelancer_name || "";
      toast.success(`${name} assigned`);
    };
    const removeAssignee = async (woId: number, freelancerId: number) => {
      const { error } = await supabase
        .from("tbl_wo_assignees")
        .delete()
        .eq("work_order_id", woId)
        .eq("freelancer_id", freelancerId);
      if (error) { toast.error("Remove failed: " + error.message); return; }
      const next = (assigneesByWO[woId] || []).filter(id => id !== freelancerId);
      setAssigneesByWO(prev => ({ ...prev, [woId]: next }));
      // Reflect sync-trigger result: planned_lead_id becomes the new "first" assignee (or null)
      const newLead = next[0] ?? null;
      const name = newLead ? freelancers.find(f => f.freelancer_id === newLead)?.freelancer_name || null : null;
      setWorkOrders(prev => prev.map(w => w.work_order_id === woId ? { ...w, planned_lead_id: newLead, lead_name: name } : w));
    };
    const updateEstimatedHrs = async (woId: number, hrs: string) => {
      const val = hrs ? parseFloat(hrs) : null;
      const wo = workOrders.find(w => w.work_order_id === woId);
      const ctx = await getAuditContext(supabase);
      const result = await auditedUpdate(ctx, "tbl_work_orders", woId, { estimated_duration_hrs: val }, jobId, (wo as any)?.updated_at ?? null);
      if (result.conflict) { toast.warning("Hours conflict — reloading"); await loadAll(); }
      else { setWorkOrders(prev => prev.map(w => w.work_order_id === woId ? { ...w, estimated_duration_hrs: val, updated_at: result.data?.updated_at } : w)); bumpCost(); }
    };
    const updateWODescription = async (woId: number, desc: string) => {
      const wo = workOrders.find(w => w.work_order_id === woId);
      const ctx = await getAuditContext(supabase);
      const result = await auditedUpdate(ctx, "tbl_work_orders", woId, { description: desc || null }, jobId, (wo as any)?.updated_at ?? null);
      if (result.conflict) { toast.warning("Description modified — reloading"); await loadAll(); }
      else { setWorkOrders(prev => prev.map(w => w.work_order_id === woId ? { ...w, description: desc || null, updated_at: result.data?.updated_at } : w)); }
    };

    // ============================================================
    // BOM Actions
    // ============================================================
    const addBomRow = (woId: number) => { setAddingBomTo(woId); setShowMatSearch(true); setMatSearch(""); setMatResults([]); };
    const selectMaterial = async (mat: (typeof materials)[0]) => {
      if (!addingBomTo) return;
      const ctx = await getAuditContext(supabase);
      const { data } = await auditedInsert(ctx, "tbl_wo_bom", { work_order_id: addingBomTo, job_id: jobId, scope_item_id: scopeId, material_id: mat.material_id, material_category: mat.material_category, item_description: mat.material_name, unit: mat.unit, unit_cost: mat.current_unit_cost, quantity: 1, needs_ordering: "false" }, jobId);
      if (data) setBomRows(prev => [...prev, data as BomRow]);
      setShowMatSearch(false); setAddingBomTo(null); setMatSearch(""); bumpCost();
    };
    const addCustomBomRow = async () => {
      if (!addingBomTo) return;
      const ctx = await getAuditContext(supabase);
      const { data } = await auditedInsert(ctx, "tbl_wo_bom", { work_order_id: addingBomTo, job_id: jobId, scope_item_id: scopeId, item_description: matSearch.trim() || "New material", quantity: 1, needs_ordering: "true" }, jobId);
      if (data) setBomRows(prev => [...prev, data as BomRow]);
      setShowMatSearch(false); setAddingBomTo(null); setMatSearch(""); bumpCost();
    };
    const updateBomField = async (bomId: number, field: string, value: string | number | null) => {
      const row = bomRows.find(r => r.bom_id === bomId);
      const ctx = await getAuditContext(supabase);
      const result = await auditedUpdate(ctx, "tbl_wo_bom", bomId, { [field]: value }, jobId, (row as any)?.updated_at ?? null);
      if (result.conflict) { toast.warning("BOM modified — reloading"); if (expandedWO) loadBOM(expandedWO); }
      else { setBomRows(prev => prev.map(r => r.bom_id === bomId ? { ...r, [field]: value, updated_at: result.data?.updated_at } : r)); }
      bumpCost();
    };
    const deleteBomRow = async (bomId: number) => {
      const ctx = await getAuditContext(supabase);
      const row = bomRows.find(r => r.bom_id === bomId);
      await supabase.from("tbl_audit_log").insert({ user_id: ctx.userId, user_name: ctx.userName, user_role: ctx.userRole, table_name: "tbl_wo_bom", record_id: bomId, field_name: "_record", old_value: row ? JSON.stringify(row) : null, new_value: null, job_id: jobId, action_type: "delete" });
      await supabase.from("tbl_wo_bom").delete().eq("bom_id", bomId);
      setBomRows(prev => prev.filter(r => r.bom_id !== bomId));
      bumpCost();
    };
    useEffect(() => {
      if (matSearch.length >= 2) { const l = matSearch.toLowerCase(); setMatResults(materials.filter(m => m.material_name?.toLowerCase().includes(l)).slice(0, 8)); }
      else setMatResults([]);
    }, [matSearch, materials]);

    // ============================================================
    // Job Item Actions
    // ============================================================
    const addStockItem = async (stock: StockItemResult) => {
      const { data } = await supabase.from("tbl_job_items").insert({
        job_id: jobId, scope_item_id: scopeId, description: stock.description, stock_item_id: stock.stock_id,
        stock_reference: stock.product_code, item_source: "stock", item_type: "Stock", quantity: 1,
        kit_list_exported: "false", temp_selected: "false", created_at: new Date().toISOString(),
      }).select("item_id").single();
      if (data) {
        await supabase.from("tbl_wo_bom").insert({ scope_item_id: scopeId, job_id: jobId, job_item_id: data.item_id, stock_item_id: stock.stock_id, item_description: stock.description, quantity: 1, unit: "Day", unit_cost: stock.hire_cost_day || 0, needs_ordering: "false" });
        toast.success(`Added: ${stock.description}`);
        loadAll();
      }
    };
    const handleStockSearch = (val: string) => {
      setStockSearch(val);
      if (stockDebounce.current) clearTimeout(stockDebounce.current);
      stockDebounce.current = setTimeout(async () => {
        if (val.length < 2) { setStockResults([]); return; }
        setStockLoading(true);
        const { data } = await supabase.from("tbl_stock_items").select("stock_id, product_code, description, stock_quantity, location, hire_cost_day, thumbnail_url").eq("active", true).or(`description.ilike.%${val}%,product_code.ilike.%${val}%`).order("description").limit(30);
        setStockResults((data as StockItemResult[]) || []); setStockLoading(false);
      }, 150);
    };
    const addBespokeItem = async () => {
      if (!bespokeForm.description.trim()) return;
      const desc = bespokeForm.description.trim();
      const qty = parseInt(bespokeForm.quantity) || 1;
      const finish = bespokeForm.finish_required.trim() || null;
      const { data: inserted, error } = await supabase.from("tbl_job_items").insert({
        job_id: jobId, scope_item_id: scopeId, description: desc, item_source: "bespoke", item_type: "Bespoke",
        quantity: qty, finish_required: finish,
        source_item_id: bespokeForm.source_item_id || null,
        kit_list_exported: "false", temp_selected: "false", created_at: new Date().toISOString(),
      }).select("item_id").single();
      if (error) { toast.error("Add failed: " + error.message); return; }

      if (bespokeForm.promote_to_stock && inserted?.item_id) {
        const res = await promoteJobItemToStock(supabase, {
          item_id: inserted.item_id, job_id: jobId, description: desc, quantity: qty,
        });
        if (res.ok) {
          toast.success(
            res.action === "merged"
              ? `Bespoke added & stock updated (${res.description} now ${res.newQuantity})`
              : `Bespoke added & promoted to stock (${res.description})`
          );
        } else {
          toast.warning("Item added but promote failed: " + res.error);
        }
      } else {
        toast.success("Bespoke item added");
      }

      setBespokeForm({ description: "", quantity: "1", finish_required: "", promote_to_stock: false, source_item_id: null, _showCopy: false });
      setShowBespokeDialog(false); loadAll();
    };
    const loadJobBespokeItems = useCallback(async () => {
      const { data } = await supabase.from("tbl_job_items").select("item_id, description, quantity, finish_required, scope_item_id").eq("job_id", jobId).neq("scope_item_id", scopeId).eq("item_source", "bespoke").order("item_id");
      if (!data || data.length === 0) { setJobBespokeItems([]); return; }
      const scopeIds = [...new Set(data.map(d => d.scope_item_id).filter(Boolean))];
      let scopeMap: Record<number, string> = {};
      if (scopeIds.length > 0) { const { data: scopes } = await supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds); (scopes || []).forEach((s: any) => { scopeMap[s.scope_item_id] = s.item_name; }); }
      setJobBespokeItems(data.map(d => ({ item_id: d.item_id, description: d.description || "", quantity: d.quantity, finish_required: d.finish_required, scope_name: d.scope_item_id ? (scopeMap[d.scope_item_id] || `Scope #${d.scope_item_id}`) : "General" })));
    }, [jobId, scopeId]);
    const deleteJobItem = async (itemId: number) => {
      await supabase.from("tbl_wo_bom").delete().eq("job_item_id", itemId);
      await supabase.from("tbl_job_items").delete().eq("item_id", itemId);
      setSelectedItemIds(prev => { const n = new Set(prev); n.delete(itemId); return n; });
      loadAll();
    };
    const updateJobItem = async (itemId: number, field: string, value: any) => {
      await supabase.from("tbl_job_items").update({ [field]: value }).eq("item_id", itemId);
      setJobItems(prev => prev.map(i => i.item_id === itemId ? { ...i, [field]: value } : i));
    };
    // Scope-level material add
    const selectScopeMaterial = (mat: typeof scopeMatSelected) => {
      if (!mat) return;
      setScopeMatSelected(mat);
      setScopeMatQty("1");
      setScopeMatUnit(mat.unit || "Each");
    };
    const confirmScopeMaterial = async () => {
      if (!scopeMatSelected) return;
      const qty = parseFloat(scopeMatQty) || 1;
      const unit = scopeMatUnit || scopeMatSelected.unit || "Each";
      // Cost conversion: if buying unit differs from catalogue unit, adjust
      let unitCost = scopeMatSelected.current_unit_cost || 0;
      const catUnit = (scopeMatSelected.unit || "").toLowerCase();
      const buyUnit = unit.toLowerCase();
      // m² → linear metre conversion: cost_per_lm = cost_per_m2 × (standard_width / 1000)
      if (catUnit === "m²" && (buyUnit === "linear metre" || buyUnit === "metre") && scopeMatSelected.standard_width) {
        unitCost = Math.round(unitCost * (scopeMatSelected.standard_width / 1000) * 100) / 100;
      }
      // metre → length conversion (timber pattern): stored cost must be per-length since unit=Length
      // S37 invariant: tbl_wo_bom.unit_cost is always per ONE of tbl_wo_bom.unit.
      if (catUnit === "metre" && buyUnit === "length" && scopeMatSelected.standard_length) {
        unitCost = Math.round(unitCost * (scopeMatSelected.standard_length / 1000) * 100) / 100;
      }
      await supabase.from("tbl_wo_bom").insert({
        scope_item_id: scopeId, job_id: jobId, material_id: scopeMatSelected.material_id,
        item_description: scopeMatSelected.material_name, quantity: qty, unit, unit_cost: unitCost, needs_ordering: "true",
      });
      toast.success(`Added: ${scopeMatSelected.material_name} × ${qty} ${unit}`);
      setShowScopeMaterialSearch(false); setScopeMatSelected(null); setScopeMatQuery(""); loadAll(); bumpCost();
    };
    const deleteScopeBomRow = async (bomId: number) => {
      await supabase.from("tbl_wo_bom").delete().eq("bom_id", bomId); loadAll(); bumpCost();
    };

    // ============================================================
    // Computed values
    // ============================================================
    const sortedWOs = [...workOrders].sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999));
    const woColorMap: Record<number, number> = {};
    sortedWOs.forEach((wo, idx) => { woColorMap[wo.work_order_id] = idx % WO_COLORS.length; });

    // Item → WO mapping
    const itemToWOs: Record<number, number[]> = {};
    junctions.forEach(j => { if (!itemToWOs[j.job_item_id]) itemToWOs[j.job_item_id] = []; itemToWOs[j.job_item_id].push(j.work_order_id); });
    const woToItems: Record<number, number[]> = {};
    junctions.forEach(j => { if (!woToItems[j.work_order_id]) woToItems[j.work_order_id] = []; woToItems[j.work_order_id].push(j.job_item_id); });

    const unlinkedItems = jobItems.filter(i => !itemToWOs[i.item_id]);
    const toggleSelect = (id: number) => setSelectedItemIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    const stdLengthMap: Record<number, number> = {};
    (materials || []).forEach(m => { if (m.standard_length) stdLengthMap[m.material_id] = m.standard_length; });

    // S37 invariant: tbl_wo_bom.unit_cost is the price for ONE of tbl_wo_bom.unit.
    // Line total is qty × price. No multiplier. Applies to every unit (Metre, Length,
    // Sheet, Each, Day, etc.) — the stored cost is always per-one-of-stored-unit.
    // Write paths (cut-list extractor, unit toggle, scope material add) are responsible
    // for converting cost when they change the stored unit.
    const bomRowCost = (row: { unit?: string | null; unit_cost?: number | null; actual_unit_cost?: number | null; quantity?: number | null; material_id?: number | null }): number => {
      const qty = row.quantity || 0;
      const price = row.actual_unit_cost ?? row.unit_cost ?? 0;
      return qty * price;
    };

    const bomRowTotal = (row: BomRow) => bomRowCost(row);
    const bomTotal = (rows: BomRow[]) => rows.reduce((sum, r) => sum + bomRowTotal(r), 0);

    // Consolidated material totals — uses the same multiplier-aware helper for every row
    const consolidatedTotal = allBomRows.reduce((sum, r) => sum + bomRowCost(r), 0)
      + scopeBomRows.reduce((sum, r) => sum + bomRowCost(r), 0);

    // ============================================================
    // Render
    // ============================================================
    if (loading) return <div className="flex items-center justify-center h-32 text-muted text-sm animate-pulse">Loading scope workspace...</div>;

    return (
      <>
        {/* Action buttons */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Hammer className="h-5 w-5 text-navy" />
            <h2 className="text-lg font-semibold text-navy">Build Plan</h2>
            <span className="text-sm text-muted">({jobItems.length} items · {workOrders.length} WOs)</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowStockPicker(true); setStockSearch(""); setStockResults([]); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-starlight-amber bg-starlight-amber/10 hover:bg-starlight-amber/20 rounded-lg transition-colors">
              <Warehouse className="h-3.5 w-3.5" /> Add Stock Item
            </button>
            <button onClick={() => { setShowBespokeDialog(true); loadJobBespokeItems(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-starlight-blue bg-starlight-blue/10 hover:bg-starlight-blue/20 rounded-lg transition-colors">
              <Paintbrush className="h-3.5 w-3.5" /> Add Bespoke Item
            </button>
            <button onClick={() => { setShowScopeMaterialSearch(true); setScopeMatQuery(""); setScopeMatResults([]); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface-mid hover:bg-surface-hi rounded-lg transition-colors">
              <Wrench className="h-3.5 w-3.5" /> Add Material
            </button>
          </div>
        </div>

        {/* ============== UNLINKED ITEMS ============== */}
        {unlinkedItems.length > 0 && (
          <div className="card border-starlight-amber/30 mb-4">
            <div className="px-4 py-2.5 bg-starlight-amber/5 border-b border-starlight-amber/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-starlight-amber" />
                <span className="text-xs font-semibold text-starlight-amber">Unassigned Items ({unlinkedItems.length})</span>
                <span className="text-[10px] text-muted">— select items and create a Work Order</span>
              </div>
              {selectedItemIds.size > 0 && (
                <button onClick={() => onRequestCreateWO?.(Array.from(selectedItemIds))} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-starlight-red text-white text-xs font-medium rounded-lg hover:bg-starlight-red/90 transition-colors">
                  <Hammer className="h-3.5 w-3.5" /> Create WO from {selectedItemIds.size}
                </button>
              )}
            </div>
            <div className="divide-y divide-subtle">
              {unlinkedItems.map(item => {
                const isStock = item.item_source === "stock" || item.item_source === "promoted";
                const isSelected = selectedItemIds.has(item.item_id);
                return (
                  <div key={item.item_id} className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${isSelected ? "bg-starlight-blue/5" : ""}`}>
                    <button onClick={() => toggleSelect(item.item_id)}
                      className={`shrink-0 transition-colors ${isSelected ? "text-starlight-blue" : "text-faint hover:text-muted"}`}>
                      {isSelected ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </button>
                    <span className={"inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-semibold rounded shrink-0 " + (isStock ? "bg-starlight-amber/10 text-starlight-amber" : "bg-starlight-blue/10 text-starlight-blue")}>
                      {isStock ? <><Warehouse className="h-2.5 w-2.5" />Stock</> : <><Paintbrush className="h-2.5 w-2.5" />Bespoke</>}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-navy font-medium truncate">{item.description || "Untitled"}</p>
                      {item.finish_required && <p className="text-[10px] text-muted">Finish: {item.finish_required}</p>}
                    </div>
                    <div className="shrink-0 w-14 text-center">
                      <input type="number" value={item.quantity ?? ""} min={1}
                        onChange={e => setJobItems(prev => prev.map(i => i.item_id === item.item_id ? { ...i, quantity: parseFloat(e.target.value) || null } : i))}
                        onBlur={e => updateJobItem(item.item_id, "quantity", parseFloat(e.target.value) || null)}
                        className="w-12 px-1.5 py-1 text-sm text-center border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                    </div>
                    <button onClick={() => deleteJobItem(item.item_id)} className="p-1 text-faint hover:text-starlight-red transition-colors shrink-0" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============== WORK ORDERS ============== */}
        {sortedWOs.length === 0 && unlinkedItems.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="text-muted text-sm">No items or work orders yet</p>
            <p className="text-faint text-xs mt-1">Use the buttons above to add items</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedWOs.map((wo, woIdx) => {
              const isExpanded = expandedWO === wo.work_order_id;
              const colorIdx = woColorMap[wo.work_order_id] ?? 0;
              const color = WO_COLORS[colorIdx];
              const woItemIds = woToItems[wo.work_order_id] || [];
              const woItems = jobItems.filter(i => woItemIds.includes(i.item_id));

              return (
                <div key={wo.work_order_id} className={`card overflow-hidden border-l-4 ${color.border}`}>
                  {/* WO Header Row */}
                  <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-surface-dim/50 transition-colors" onClick={() => toggleExpand(wo.work_order_id)}>
                    <div className="text-faint shrink-0">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                    <div className="flex flex-col items-center w-10 shrink-0">
                      <span className="text-xs font-semibold text-navy">{woIdx + 1}/{sortedWOs.length}</span>
                      {woIdx > 0 && <span className={"text-[9px] " + (sortedWOs[woIdx - 1].status === "Complete" ? "text-starlight-green" : sortedWOs[woIdx - 1].status === "In-Progress" ? "text-starlight-blue" : "text-muted")}>
                        prev: {sortedWOs[woIdx - 1].status === "Complete" ? "done" : sortedWOs[woIdx - 1].status === "In-Progress" ? "active" : "waiting"}
                      </span>}
                      {woIdx === 0 && <span className="text-[9px] text-faint">first</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-navy">{wo.activity_label}</p>
                        {wo.paint_notes && <Paintbrush className="h-3 w-3 text-starlight-amber shrink-0" />}
                      </div>
                      {wo.predecessor_wo_id && (() => {
                        const pred = sortedWOs.find(w => w.work_order_id === wo.predecessor_wo_id);
                        if (!pred) return null;
                        const predDone = pred.status === "Complete";
                        const predActive = pred.status === "In-Progress";
                        return (
                          <p className="text-[10px] text-muted flex items-center gap-1 mt-0.5">
                            <CornerDownRight className="h-2.5 w-2.5 text-faint" />
                            after <span className="font-medium">{pred.activity_label}</span>
                            <span className={predDone ? "text-starlight-green" : predActive ? "text-starlight-blue" : "text-muted"}>
                              ({predDone ? "done" : predActive ? "active" : "waiting"})
                            </span>
                          </p>
                        );
                      })()}
                      {wo.description && <p className="text-xs text-muted mt-0.5">{wo.description}</p>}
                      {/* Linked item chips */}
                      {woItems.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {woItems.map(item => (
                            <span key={item.item_id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${color.bg} ${color.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                              {item.quantity && item.quantity > 1 ? `${item.quantity}× ` : ""}{(item.description || "").length > 30 ? (item.description || "").substring(0, 30) + "…" : item.description}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right w-14 shrink-0">
                      <p className="text-sm font-mono text-navy">{wo.estimated_duration_hrs != null ? `${wo.estimated_duration_hrs}h` : "—"}</p>
                      <p className="text-[10px] text-muted">est.</p>
                    </div>
                    <div className="w-24 shrink-0 text-right">
                      {wo.lead_name ? <p className="text-xs text-muted truncate">{wo.lead_name}</p> : <p className="text-xs text-faint italic">Unassigned</p>}
                    </div>
                    <div className="w-24 shrink-0 text-right" onClick={e => e.stopPropagation()}>
                      <StatusBadge status={wo.status} />
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <LearningTrigger
                        context={{
                          work_order_id: wo.work_order_id,
                          scope_item_id: scopeId,
                          job_id: jobId,
                          contextLabel: `WO — ${wo.activity_label || "Work Order"}`,
                          contextSublabel: wo.description || undefined,
                        }}
                        title="Capture learning for this WO"
                      />
                      <PrintTravellerButton wo={{ ...wo, activity_label: wo.activity_label || "No Activity" }} scopeId={scopeId} />
                      {wo.status === "Not-Started" && <button onClick={() => updateWOStatus(wo.work_order_id, "Ready")} className="p-1.5 rounded-lg text-starlight-green hover:bg-starlight-green/10 transition-colors" title="Release as Ready"><ShieldCheck className="h-4 w-4" /></button>}
                      {(wo.status === "Not-Started" || wo.status === "Ready") && <button onClick={() => { if (confirm("Delete this work order?")) deleteWO(wo.work_order_id); }} className="p-1.5 rounded-lg text-faint hover:text-starlight-red hover:bg-starlight-red/10 transition-colors" title="Delete"><Trash2 className="h-4 w-4" /></button>}
                      {wo.status !== "Voided" && wo.status !== "Complete" && wo.status !== "Not-Started" && <button onClick={() => setVoidDialog({ woId: wo.work_order_id, status: wo.status || "" })} className="p-1.5 rounded-lg text-faint hover:text-starlight-amber hover:bg-starlight-amber/10 transition-colors" title="Void"><AlertTriangle className="h-4 w-4" /></button>}
                      {wo.status !== "Voided" && <button onClick={() => { const itemIds = woToItems[wo.work_order_id] || []; setNextStepPredecessor({ work_order_id: wo.work_order_id, activity_label: wo.activity_label || "WO", phase_number: wo.phase_number ?? null, description: wo.description, job_item_ids: itemIds }); }} className="p-1.5 rounded-lg text-faint hover:text-starlight-blue hover:bg-starlight-blue/10 transition-colors" title="Add next step"><CornerDownRight className="h-4 w-4" /></button>}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-subtle bg-surface-dim/30">
                      {/* Editable fields */}
                      <div className="px-5 py-3 border-b border-subtle">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-medium text-muted">Step {woIdx + 1} of {sortedWOs.length}</span>
                          <button onClick={e => { e.stopPropagation(); reorderWO(wo.work_order_id, -1); }} disabled={woIdx === 0} className="p-1 rounded text-muted hover:text-navy hover:bg-surface-mid disabled:opacity-30 transition-colors" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button onClick={e => { e.stopPropagation(); reorderWO(wo.work_order_id, 1); }} disabled={woIdx === sortedWOs.length - 1} className="p-1 rounded text-muted hover:text-navy hover:bg-surface-mid disabled:opacity-30 transition-colors" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="mb-3">
                          <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Description</label>
                          <textarea defaultValue={wo.description || ""} onFocus={() => presenceSetEditing(`wo_${wo.work_order_id}_desc`)} onBlur={e => { presenceSetEditing(null); updateWODescription(wo.work_order_id, e.target.value); }} className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-y min-h-[60px]" placeholder="What needs doing..." rows={2} />
                        </div>
                        <div className="mb-3">
                          <WOStepsPanel workOrderId={wo.work_order_id} jobId={jobId} />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          <div>
                            <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Est. Hours</label>
                            <input type="number" step="0.5" defaultValue={wo.estimated_duration_hrs ?? ""} onFocus={() => presenceSetEditing(`wo_${wo.work_order_id}_hrs`)} onBlur={e => { presenceSetEditing(null); updateEstimatedHrs(wo.work_order_id, e.target.value); }} className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Assigned to</label>
                            <div className="flex flex-wrap gap-1 min-h-[30px] p-1 border border-subtle rounded bg-surface">
                              {(assigneesByWO[wo.work_order_id] || []).length === 0 && assigneePickerWO !== wo.work_order_id && (
                                <span className="text-xs text-faint italic px-1 py-0.5">Unassigned</span>
                              )}
                              {(assigneesByWO[wo.work_order_id] || []).map(fid => {
                                const f = freelancers.find(fr => fr.freelancer_id === fid);
                                return (
                                  <span key={fid} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-starlight-blue/10 text-starlight-blue rounded">
                                    {f?.freelancer_name || `#${fid}`}
                                    <button type="button" onClick={() => removeAssignee(wo.work_order_id, fid)} className="hover:text-starlight-red" title="Remove">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                );
                              })}
                              {assigneePickerWO === wo.work_order_id ? (
                                <select autoFocus value="" onChange={e => { if (e.target.value) { addAssignee(wo.work_order_id, Number(e.target.value)); setAssigneePickerWO(null); } }} onBlur={() => setAssigneePickerWO(null)} className="text-xs px-1 py-0.5 border border-subtle rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue">
                                  <option value="">Pick person...</option>
                                  {freelancers.filter(f => !(assigneesByWO[wo.work_order_id] || []).includes(f.freelancer_id)).map(f => (
                                    <option key={f.freelancer_id} value={f.freelancer_id}>{f.freelancer_name}</option>
                                  ))}
                                </select>
                              ) : (
                                <button type="button" onClick={() => setAssigneePickerWO(wo.work_order_id)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs text-muted hover:text-starlight-blue hover:bg-starlight-blue/5 rounded transition-colors" title="Add person">
                                  <Plus className="h-3 w-3" /> Add
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Complexity</label>
                            <select value={wo.complexity_construction || ""} onChange={async e => { const v = e.target.value || null; const ctx = await getAuditContext(supabase); await auditedUpdate(ctx, "tbl_work_orders", wo.work_order_id, { complexity_construction: v }, jobId); setWorkOrders(p => p.map(w => w.work_order_id === wo.work_order_id ? { ...w, complexity_construction: v } : w)); }} className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                              <option value="">Select...</option><option value="1 - Straightforward">1 - Straightforward</option><option value="2 - Skilled">2 - Skilled</option><option value="3 - Bespoke/Artistic">3 - Bespoke/Artistic</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Finish</label>
                            <select value={wo.finish_relative || ""} onChange={async e => { const v = e.target.value || null; const ctx = await getAuditContext(supabase); await auditedUpdate(ctx, "tbl_work_orders", wo.work_order_id, { finish_relative: v }, jobId); setWorkOrders(p => p.map(w => w.work_order_id === wo.work_order_id ? { ...w, finish_relative: v } : w)); }} className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                              <option value="">Select...</option><option value="Raw">Raw</option><option value="Good">Good</option><option value="Spotlight">Spotlight</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Status</label>
                            <select value={wo.status || "Not-Started"} onChange={e => updateWOStatus(wo.work_order_id, e.target.value)} className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                              <option value="Not-Started">Not-Started</option><option value="Ready">Ready</option><option value="In-Progress">In-Progress</option><option value="Complete">Complete</option><option value="On-Hold">On-Hold</option><option value="Voided">Voided</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      {/* Paint notes */}
                      <div className="px-5 py-3 border-b border-subtle">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Paintbrush className="h-3.5 w-3.5 text-starlight-amber" />
                          <label className="text-[10px] font-medium text-muted uppercase tracking-wider">Painting</label>
                          {!wo.paint_notes && <span className="text-[9px] text-faint italic">None</span>}
                        </div>
                        <textarea defaultValue={wo.paint_notes || ""} onFocus={() => presenceSetEditing(`wo_${wo.work_order_id}_paint`)} onBlur={async e => { presenceSetEditing(null); const v = e.target.value.trim() || null; if (v !== wo.paint_notes) { const ctx = await getAuditContext(supabase); await auditedUpdate(ctx, "tbl_work_orders", wo.work_order_id, { paint_notes: v }, jobId); setWorkOrders(p => p.map(w => w.work_order_id === wo.work_order_id ? { ...w, paint_notes: v } : w)); } }} rows={2} placeholder="e.g. RAL 9005, 2 coats primer + 1 topcoat" className="w-full px-3 py-2 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-amber resize-none placeholder:text-faint" />
                      </div>
                      {/* Completion photo */}
                      {completionPhotoUrls[wo.work_order_id] && (
                        <div className="px-5 py-3 border-b border-subtle">
                          <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="h-3.5 w-3.5 text-starlight-green" /><span className="text-[10px] font-semibold text-starlight-green uppercase tracking-wider">Completion Photo</span></div>
                          <img src={completionPhotoUrls[wo.work_order_id]} alt="Completion" className="rounded-lg border border-subtle max-h-64 object-contain" />
                        </div>
                      )}

                      {/* Linked items detail */}
                      {linkedItems.length > 0 && (
                        <div className="px-5 py-3 border-b border-subtle">
                          <h3 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Linked Job Items</h3>
                          <div className="flex flex-wrap gap-2">
                            {linkedItems.map((item: any) => (
                              <div key={item.item_id} className="inline-flex items-center gap-2 bg-surface border border-subtle rounded-lg px-3 py-1.5">
                                <Link2 className="h-3 w-3 text-muted shrink-0" />
                                <div><p className="text-xs font-medium text-navy">{item.quantity ? item.quantity + "x " : ""}{item.description}</p>{item.finish_required && <p className="text-[10px] text-starlight-amber">{item.finish_required}</p>}</div>
                                <span className="text-[10px] text-muted bg-surface-dim px-1.5 py-0.5 rounded">{item.item_type}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* BOM */}
                      <div className="px-5 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Bill of Materials</h3>
                          <button onClick={() => addBomRow(wo.work_order_id)} className="inline-flex items-center gap-1 text-xs text-starlight-blue hover:text-navy font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Add Material</button>
                        </div>
                        {bomLoading ? <p className="text-xs text-muted animate-pulse py-2">Loading...</p> : bomRows.length === 0 ? <p className="text-xs text-faint py-2">No materials added yet</p> : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead><tr className="text-[10px] text-muted uppercase tracking-wider border-b border-subtle">
                                <th className="text-left py-1.5 pr-3 font-medium">Material</th><th className="text-right py-1.5 px-2 font-medium w-20">Qty</th><th className="text-left py-1.5 px-2 font-medium w-20">Unit</th><th className="text-right py-1.5 px-2 font-medium w-24">Unit £</th><th className="text-right py-1.5 px-2 font-medium w-24">Total</th><th className="text-center py-1.5 px-2 font-medium w-14">Stock</th><th className="text-center py-1.5 px-2 font-medium w-16">Order</th><th className="w-8"></th>
                              </tr></thead>
                              <tbody>{bomRows.map(row => {
                                const cost = row.actual_unit_cost ?? row.unit_cost ?? 0;
                                const total = bomRowTotal(row);
                                const stdLen = row.material_id ? stdLengthMap[row.material_id] : null;
                                const isLengthMode = row.unit === "Length" && stdLen;
                                const canToggle = !!stdLen;
                                const isFromStock = isTruthy(row.from_stock);
                                return (
                                  <tr key={row.bom_id} className="border-b border-subtle last:border-0">
                                    <td className="py-1.5 pr-3"><div className="flex items-center gap-1.5">{(row.stock_item_id || isFromStock) && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-starlight-amber/10 text-starlight-amber text-[9px] font-medium rounded shrink-0"><Warehouse className="h-2.5 w-2.5" />Stock</span>}
                                      <input type="text" defaultValue={row.item_description || ""} onFocus={() => presenceSetEditing(`bom_${row.bom_id}_desc`)} onBlur={e => { presenceSetEditing(null); updateBomField(row.bom_id, "item_description", e.target.value || null); }} className="w-full px-1.5 py-1 border border-transparent hover:border-subtle focus:border-starlight-blue rounded text-sm bg-transparent focus:bg-surface focus:outline-none" /></div></td>
                                    <td className="py-1.5 px-2"><input type="number" step="0.01" defaultValue={row.quantity ?? ""} onFocus={() => presenceSetEditing(`bom_${row.bom_id}_qty`)} onBlur={e => { presenceSetEditing(null); updateBomField(row.bom_id, "quantity", e.target.value ? parseFloat(e.target.value) : null); }} className="w-full px-1.5 py-1 border border-transparent hover:border-subtle focus:border-starlight-blue rounded text-sm text-right bg-transparent focus:bg-surface focus:outline-none font-mono" /></td>
                                    <td className="py-1.5 px-2">{canToggle ? <button onClick={async () => { const sl = stdLen! / 1000; const cc = row.actual_unit_cost ?? row.unit_cost ?? 0; const cq = row.quantity || 0; if (isLengthMode) { await updateBomField(row.bom_id, "unit", "Metre"); if (cq) await updateBomField(row.bom_id, "quantity", Math.round(cq * sl * 100) / 100); if (cc) await updateBomField(row.bom_id, "unit_cost", Math.round((cc / sl) * 100) / 100); } else { await updateBomField(row.bom_id, "unit", "Length"); if (cq) await updateBomField(row.bom_id, "quantity", Math.ceil(cq / sl)); if (cc) await updateBomField(row.bom_id, "unit_cost", Math.round(cc * sl * 100) / 100); } }} className={"inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors " + (isLengthMode ? "bg-navy/10 text-navy border-navy/20 hover:bg-navy/20" : "bg-surface-mid text-muted border-subtle hover:bg-surface-hi")}>{isLengthMode ? "Length" : "Metre"} <span className="text-[9px] text-muted">⇄</span></button> : <span className="text-xs text-muted">{row.unit || "—"}</span>}</td>
                                    <td className="py-1.5 px-2"><input type="number" step="0.01" defaultValue={cost || ""} onFocus={() => presenceSetEditing(`bom_${row.bom_id}_cost`)} onBlur={e => { presenceSetEditing(null); updateBomField(row.bom_id, "unit_cost", e.target.value ? parseFloat(e.target.value) : null); }} className="w-full px-1.5 py-1 border border-transparent hover:border-subtle focus:border-starlight-blue rounded text-sm text-right bg-transparent focus:bg-surface focus:outline-none font-mono" /></td>
                                    <td className="py-1.5 px-2 text-right text-sm font-mono text-navy">{formatCurrency(total)}</td>
                                    <td className="py-1.5 px-2 text-center"><input type="checkbox" checked={isFromStock} onChange={async e => { const v = e.target.checked; await updateBomField(row.bom_id, "from_stock", v ? "true" : "false"); if (v) { await updateBomField(row.bom_id, "needs_ordering", "false"); if (!row.unit_cost && row.material_id) { const m = materials.find(mm => mm.material_id === row.material_id); if (m?.current_unit_cost) await updateBomField(row.bom_id, "unit_cost", m.current_unit_cost); } } }} className="h-3.5 w-3.5 rounded border-subtle text-starlight-amber focus:ring-starlight-amber" title="From stock" /></td>
                                    <td className="py-1.5 px-2 text-center"><input type="checkbox" checked={isTruthy(row.needs_ordering)} disabled={isFromStock} onChange={e => updateBomField(row.bom_id, "needs_ordering", e.target.checked ? "true" : "false")} className={"h-3.5 w-3.5 rounded border-subtle text-starlight-amber focus:ring-starlight-amber" + (isFromStock ? " opacity-30" : "")} /></td>
                                    <td className="py-1.5"><button onClick={() => deleteBomRow(row.bom_id)} className="p-1 text-faint hover:text-starlight-red transition-colors" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button></td>
                                  </tr>
                                );
                              })}</tbody>
                              <tfoot><tr className="border-t border-subtle"><td colSpan={4} className="py-2 text-right text-xs font-medium text-muted">Material Total</td><td className="py-2 px-2 text-right text-sm font-semibold text-navy font-mono">{formatCurrency(bomTotal(bomRows))}</td><td colSpan={3}></td></tr></tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                      {/* Documents */}
                      <WODocumentsPanel workOrderId={wo.work_order_id} scopeItemId={scopeId} jobId={jobId} jobNumber={scope?.job_number || ""} jobName={scope?.job_name || ""} scopeName={scope?.item_name || ""} activityLabel={wo.activity_label || ""} readOnly={wo.status === "Voided" || wo.status === "Complete"} onBomChanged={async () => { await loadBOM(wo.work_order_id); }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ============== CONSOLIDATED MATERIALS ============== */}
        {(allBomRows.length > 0 || scopeBomRows.length > 0) && (
          <div className="card mt-4">
            <button onClick={() => setBomExpanded(e => !e)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-dim/50 transition-colors">
              <div className="flex items-center gap-2">
                {bomExpanded ? <ChevronDown className="h-4 w-4 text-faint" /> : <ChevronRight className="h-4 w-4 text-faint" />}
                <Package className="h-4 w-4 text-navy" />
                <span className="text-sm font-semibold text-navy">All Materials</span>
                <span className="text-xs text-muted">({allBomRows.length + scopeBomRows.length} items)</span>
              </div>
              <span className="text-sm font-semibold font-mono text-navy">{formatCurrency(consolidatedTotal)}</span>
            </button>
            {bomExpanded && (
              <div className="border-t border-subtle px-4 py-3">
                <div className="flex justify-end mb-2">
                  <button onClick={() => { setShowScopeMaterialSearch(true); setScopeMatQuery(""); setScopeMatResults([]); setScopeMatSelected(null); }} className="inline-flex items-center gap-1 text-xs text-starlight-blue hover:text-navy font-medium"><Plus className="h-3.5 w-3.5" />Add Scope Material</button>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="text-[10px] text-muted uppercase tracking-wider border-b border-subtle">
                    <th className="text-left py-1.5 pr-3 font-medium">Material</th><th className="text-left py-1.5 px-2 font-medium w-24">Source</th><th className="text-right py-1.5 px-2 font-medium w-16">Qty</th><th className="text-left py-1.5 px-2 font-medium w-16">Unit</th><th className="text-right py-1.5 px-2 font-medium w-24">Total</th><th className="w-8"></th>
                  </tr></thead>
                  <tbody>
                    {allBomRows.map(row => {
                      const ci = row.wo_color_idx ?? 0;
                      const c = WO_COLORS[ci];
                      const total = bomRowCost(row);
                      return (
                        <tr key={row.bom_id} className="border-b border-subtle last:border-0">
                          <td className="py-1.5 pr-3 text-sm text-navy">{row.item_description}</td>
                          <td className="py-1.5 px-2"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.bg} ${c.text}`}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{row.wo_label || "WO"}</span></td>
                          <td className="py-1.5 px-2 text-right text-sm font-mono text-muted">{row.quantity || 0}</td>
                          <td className="py-1.5 px-2 text-xs text-muted">{row.unit || "—"}</td>
                          <td className="py-1.5 px-2 text-right text-sm font-mono text-navy">{formatCurrency(total)}</td>
                          <td></td>
                        </tr>
                      );
                    })}
                    {scopeBomRows.map(row => (
                      <tr key={row.bom_id} className="border-b border-subtle last:border-0">
                        <td className="py-1.5 pr-3 text-sm text-navy">{row.item_description}</td>
                        <td className="py-1.5 px-2"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-mid text-muted">Scope</span></td>
                        <td className="py-1.5 px-2"><input type="number" step="0.5" defaultValue={row.quantity} onBlur={async e => { const v = parseFloat(e.target.value) || 0; if (v === row.quantity) return; await supabase.from("tbl_wo_bom").update({ quantity: v }).eq("bom_id", row.bom_id); setScopeBomRows(prev => prev.map(r => r.bom_id === row.bom_id ? { ...r, quantity: v } : r)); bumpCost(); }} className="w-14 px-1.5 py-0.5 text-sm text-right font-mono border border-transparent hover:border-subtle focus:border-starlight-blue rounded bg-transparent focus:bg-surface focus:outline-none" /></td>
                        <td className="py-1.5 px-2 text-xs text-muted">{row.unit}</td>
                        <td className="py-1.5 px-2 text-right text-sm font-mono text-navy">{formatCurrency(bomRowCost(row))}</td>
                        <td className="py-1.5"><button onClick={() => deleteScopeBomRow(row.bom_id)} className="p-1 text-faint hover:text-starlight-red transition-colors"><Trash2 className="h-3 w-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t border-subtle"><td colSpan={4} className="py-2 text-right text-xs font-medium text-muted">Grand Total</td><td className="py-2 px-2 text-right text-sm font-bold text-navy font-mono">{formatCurrency(consolidatedTotal)}</td><td></td></tr></tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Void dialog */}
        {voidDialog && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-surface rounded-xl shadow-2xl w-full max-w-sm">
              <div className="px-5 py-4 border-b border-subtle"><h3 className="text-sm font-semibold text-navy">Void Work Order</h3><p className="text-xs text-muted mt-0.5">Voided WOs retain time entry costs.</p></div>
              <div className="px-5 py-4"><label className="block text-xs font-medium text-muted mb-1.5">Reason *</label><textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Why is this being voided..." rows={3} className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-amber resize-none" autoFocus /></div>
              <div className="px-5 py-3 border-t border-subtle flex justify-end gap-3"><button onClick={() => { setVoidDialog(null); setVoidReason(""); }} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg">Cancel</button><button onClick={() => voidReason.trim() && voidWO(voidDialog.woId, voidReason.trim())} disabled={!voidReason.trim()} className="px-4 py-2 bg-starlight-amber text-white text-sm font-medium rounded-lg disabled:opacity-50">Void Work Order</button></div>
            </div>
          </div>
        )}

        {/* WO BOM material search */}
        {showMatSearch && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md">
              <div className="px-5 py-4 border-b border-subtle"><h3 className="text-sm font-semibold text-navy">Add Material to BOM</h3></div>
              <div className="px-5 py-3">
                <input type="text" value={matSearch} onChange={e => setMatSearch(e.target.value)} placeholder="Search materials..." className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" autoFocus />
                {matResults.length > 0 && <div className="mt-2 max-h-48 overflow-y-auto border border-subtle rounded-lg divide-y divide-subtle">{matResults.map(m => <button key={m.material_id} onClick={() => selectMaterial(m)} className="w-full text-left px-3 py-2 hover:bg-base transition-colors"><p className="text-sm text-navy font-medium">{m.material_name}</p><p className="text-xs text-muted">{m.unit}{m.current_unit_cost != null ? ` · ${formatCurrency(m.current_unit_cost)}` : ""}</p></button>)}</div>}
                {matSearch.length >= 2 && matResults.length === 0 && <p className="text-xs text-muted mt-2">No matches</p>}
              </div>
              <div className="px-5 py-3 border-t border-subtle flex justify-between"><button onClick={() => { setShowMatSearch(false); setAddingBomTo(null); setMatSearch(""); }} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg">Cancel</button><button onClick={addCustomBomRow} className="px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy/90">{matSearch.trim() ? `Add "${matSearch.trim()}"` : "Add blank row"}</button></div>
            </div>
          </div>
        )}

        {/* Stock Picker */}
        {showStockPicker && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowStockPicker(false)}>
            <div className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-subtle flex items-center justify-between shrink-0"><div><h3 className="text-sm font-semibold text-navy flex items-center gap-2"><Warehouse className="h-4 w-4 text-starlight-amber" /> Add Stock Items</h3></div><button onClick={() => setShowStockPicker(false)} className="p-1.5 text-muted hover:text-muted rounded-lg hover:bg-surface-mid"><X className="h-4 w-4" /></button></div>
              <div className="px-5 py-3 border-b border-subtle shrink-0"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" /><input type="text" value={stockSearch} onChange={e => handleStockSearch(e.target.value)} placeholder="Search by name or product code..." className="w-full pl-9 pr-3 py-2.5 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-amber" autoFocus /></div></div>
              <div className="flex-1 overflow-y-auto">
                {stockSearch.length < 2 ? <div className="px-5 py-12 text-center text-faint text-sm">Type to search...</div> : stockLoading ? <div className="px-5 py-12 text-center text-muted text-sm animate-pulse">Searching...</div> : stockResults.length === 0 ? <div className="px-5 py-12 text-center text-muted text-sm">No matches</div> : (
                  <div className="divide-y divide-subtle">{stockResults.map(s => (
                    <button key={s.stock_id} onClick={() => addStockItem(s)} className="w-full flex items-center gap-4 px-5 py-3 hover:bg-starlight-amber/5 transition-colors text-left">
                      <div className="w-14 h-14 shrink-0 bg-surface-dim rounded-lg flex items-center justify-center overflow-hidden">{s.thumbnail_url ? <img src={s.thumbnail_url} alt="" className="w-full h-full object-contain p-1" /> : <Warehouse className="h-5 w-5 text-faint" />}</div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-navy">{s.description}</p><div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted"><span className="font-mono">{s.product_code}</span>{s.location && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{s.location}</span>}</div></div>
                      <div className="text-right shrink-0"><p className="text-sm font-semibold text-navy">{s.stock_quantity}</p><p className="text-[10px] text-muted">available</p></div>
                      {s.hire_cost_day && <div className="text-right shrink-0 w-20"><p className="text-xs font-mono text-muted">{formatCurrency(s.hire_cost_day)}</p><p className="text-[10px] text-muted">/day</p></div>}
                      <Plus className="h-5 w-5 text-starlight-amber shrink-0" />
                    </button>
                  ))}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bespoke dialog */}
        {showBespokeDialog && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowBespokeDialog(false)}>
            <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-subtle flex items-center justify-between"><h3 className="text-sm font-semibold text-navy flex items-center gap-2"><Paintbrush className="h-4 w-4 text-starlight-blue" /> Add Bespoke Item</h3><button onClick={() => setShowBespokeDialog(false)} className="p-1.5 text-muted rounded-lg hover:bg-surface-mid"><X className="h-4 w-4" /></button></div>
              <div className="px-5 py-4 space-y-3">
                {jobBespokeItems.length > 0 && (
                  <div>
                    <button type="button" onClick={() => setBespokeForm(f => ({ ...f, _showCopy: !f._showCopy }))} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-starlight-blue"><Link2 className="h-3 w-3" />Copy from another scope ({jobBespokeItems.length})</button>
                    {bespokeForm._showCopy && <div className="mt-1.5 max-h-36 overflow-y-auto border border-subtle rounded-lg divide-y divide-subtle">{jobBespokeItems.map(jbi => (
                      <button key={jbi.item_id} type="button" onClick={() => setBespokeForm({ ...bespokeForm, description: jbi.description, finish_required: jbi.finish_required || "", quantity: String(jbi.quantity || 1), source_item_id: jbi.item_id })} className={"w-full text-left px-3 py-2 hover:bg-starlight-blue/5 " + (bespokeForm.source_item_id === jbi.item_id ? "bg-starlight-blue/10" : "")}><p className="text-xs text-navy font-medium">{jbi.description}</p><div className="flex items-center gap-2 mt-0.5"><span className="text-[10px] text-muted">{jbi.scope_name}</span>{jbi.finish_required && <span className="text-[10px] text-muted">· {jbi.finish_required}</span>}<span className="text-[10px] text-muted">· qty {jbi.quantity || 1}</span></div></button>
                    ))}</div>}
                  </div>
                )}
                <div><label className="block text-xs font-medium text-muted mb-1">Description *</label><textarea value={bespokeForm.description} onChange={e => setBespokeForm({ ...bespokeForm, description: e.target.value })} rows={3} placeholder="Describe what needs to be built..." className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none" autoFocus /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-muted mb-1">Quantity</label><input type="number" value={bespokeForm.quantity} min={1} onChange={e => setBespokeForm({ ...bespokeForm, quantity: e.target.value })} className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" /></div>
                  <div><label className="block text-xs font-medium text-muted mb-1">Finish</label><input type="text" value={bespokeForm.finish_required} onChange={e => setBespokeForm({ ...bespokeForm, finish_required: e.target.value })} placeholder="Paint colour..." className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" /></div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer pt-1"><input type="checkbox" checked={bespokeForm.promote_to_stock} onChange={e => setBespokeForm({ ...bespokeForm, promote_to_stock: e.target.checked })} className="rounded border-subtle text-starlight-green focus:ring-starlight-green" />Also add to stock catalogue</label>
              </div>
              <div className="px-5 py-3 border-t border-subtle flex justify-end gap-3"><button onClick={() => setShowBespokeDialog(false)} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg">Cancel</button><button onClick={addBespokeItem} disabled={!bespokeForm.description.trim()} className="px-4 py-2 bg-starlight-blue text-white text-sm font-medium rounded-lg hover:bg-navy disabled:opacity-50">Add Item</button></div>
            </div>
          </div>
        )}

        {/* Scope Material Search dialog — two-step: pick → configure → add */}
        {showScopeMaterialSearch && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md">
              <div className="px-5 py-4 border-b border-subtle">
                <h3 className="text-sm font-semibold text-navy flex items-center gap-2"><Wrench className="h-4 w-4 text-muted" /> Add Scope Material</h3>
                {scopeMatSelected && <p className="text-xs text-muted mt-1">{scopeMatSelected.material_name}</p>}
              </div>
              <div className="px-5 py-3">
                {!scopeMatSelected ? (
                  <>
                    <input type="text" value={scopeMatQuery} onChange={e => { setScopeMatQuery(e.target.value); if (e.target.value.length >= 2) { const l = e.target.value.toLowerCase(); setScopeMatResults(materials.filter(m => (m.material_name || "").toLowerCase().includes(l)).slice(0, 8) as any); } else setScopeMatResults([]); }} placeholder="Search materials catalogue..." className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" autoFocus />
                    {scopeMatResults.length > 0 && <div className="mt-2 max-h-48 overflow-y-auto border border-subtle rounded-lg divide-y divide-subtle">{scopeMatResults.map(m => <button key={m.material_id} onClick={() => selectScopeMaterial(m)} className="w-full text-left px-3 py-2 hover:bg-base transition-colors"><p className="text-sm text-navy font-medium">{m.material_name}</p><p className="text-xs text-muted">{m.unit}{m.current_unit_cost ? ` · ${formatCurrency(m.current_unit_cost)}/${m.unit}` : ""}</p></button>)}</div>}
                    {scopeMatQuery.length >= 2 && scopeMatResults.length === 0 && <p className="text-xs text-muted mt-2">No matches</p>}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Quantity</label>
                        <input type="number" step="0.5" min={0.1} value={scopeMatQty} onChange={e => setScopeMatQty(e.target.value)} className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" autoFocus />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Unit</label>
                        <select value={scopeMatUnit} onChange={e => setScopeMatUnit(e.target.value)} className="w-full px-3 py-2 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                          <option value={scopeMatSelected.unit}>{scopeMatSelected.unit}</option>
                          {["Each", "Metre", "Linear Metre", "Length", "Sheet", "M²", "Kg", "Litre", "Day"].filter(u => u !== scopeMatSelected.unit).map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="bg-surface-dim rounded-lg px-3 py-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">Catalogue price</span>
                        <span className="text-navy font-mono">{scopeMatSelected.current_unit_cost ? `${formatCurrency(scopeMatSelected.current_unit_cost)} / ${scopeMatSelected.unit}` : "—"}</span>
                      </div>
                      {scopeMatSelected.unit.toLowerCase() === "m²" && scopeMatUnit.toLowerCase() !== "m²" && scopeMatSelected.standard_width && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted">Roll width</span>
                          <span className="text-navy font-mono">{scopeMatSelected.standard_width}mm ({scopeMatSelected.standard_width / 1000}m)</span>
                        </div>
                      )}
                      {(() => {
                        const qty = parseFloat(scopeMatQty) || 0;
                        const catUnit = (scopeMatSelected.unit || "").toLowerCase();
                        const buyUnit = scopeMatUnit.toLowerCase();
                        let effectiveCost = scopeMatSelected.current_unit_cost || 0;
                        if (catUnit === "m²" && (buyUnit === "linear metre" || buyUnit === "metre") && scopeMatSelected.standard_width) {
                          effectiveCost = Math.round(effectiveCost * (scopeMatSelected.standard_width / 1000) * 100) / 100;
                        }
                        // S37: preview must match what confirmScopeMaterial writes
                        if (catUnit === "metre" && buyUnit === "length" && scopeMatSelected.standard_length) {
                          effectiveCost = Math.round(effectiveCost * (scopeMatSelected.standard_length / 1000) * 100) / 100;
                        }
                        const total = qty * effectiveCost;
                        return (
                          <>
                            {effectiveCost !== (scopeMatSelected.current_unit_cost || 0) && (
                              <div className="flex justify-between text-xs">
                                <span className="text-starlight-blue">Converted cost</span>
                                <span className="text-starlight-blue font-mono font-medium">{formatCurrency(effectiveCost)} / {scopeMatUnit}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-xs font-medium border-t border-subtle pt-1 mt-1">
                              <span className="text-muted">Total</span>
                              <span className="text-navy font-mono">{formatCurrency(total)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <button onClick={() => setScopeMatSelected(null)} className="text-xs text-starlight-blue hover:text-navy">← Pick different material</button>
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t border-subtle flex justify-end gap-3">
                <button onClick={() => { setShowScopeMaterialSearch(false); setScopeMatSelected(null); }} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg">Cancel</button>
                {scopeMatSelected && (
                  <button onClick={confirmScopeMaterial} disabled={!scopeMatQty || parseFloat(scopeMatQty) <= 0}
                    className="px-4 py-2 bg-starlight-green text-white text-sm font-medium rounded-lg hover:bg-starlight-green/90 disabled:opacity-50">
                    Add to BOM
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Next Step dialog */}
        {nextStepPredecessor && (
          <CreateWODialog
            jobId={jobId}
            scopeItemId={scopeId}
            selectedItemIds={[]}
            defaultComplexity={scope?.complexity_construction}
            defaultFinish={scope?.finish_relative}
            predecessorWO={nextStepPredecessor}
            scopeFinish={scope?.finish_relative}
            scopeDescription={scope?.description}
            scopeItemName={scope?.item_name}
            onClose={() => setNextStepPredecessor(null)}
            onCreated={async (woId) => {
              setNextStepPredecessor(null);
              await loadAll();
              setExpandedWO(woId);
              loadBOM(woId);
              loadLinkedItems(woId);
              bumpCost();
              toast.success("Next step created");
            }}
          />
        )}

        {/* Conflict dialog */}
        {conflictInfo && conflictResolve && <ConflictDialog open={true} conflict={conflictInfo} onUseMine={conflictResolve.onMine} onUseTheirs={conflictResolve.onTheirs} onCancel={() => { setConflictInfo(null); setConflictResolve(null); }} />}
      </>
    );
  }
);
