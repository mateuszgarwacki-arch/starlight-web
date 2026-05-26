"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency, statusClass } from "@/lib/utils";
import { DaysRemainingBadge, StatusBadge } from "@/components/ui/badges";
import { LookupCombo } from "@/components/ui/lookup-combo";
import { CreateScopeDialog } from "@/components/create-scope-dialog";
import { ContractorPicker } from "@/components/contractor-picker";
import { CostBreakdown } from "@/components/cost-breakdown";
import { ArrowLeft, Plus, FileText, ChevronRight, ChevronDown, Package, Filter, Hammer, Trash2, Pencil, X, Truck, MessageCircleQuestion, ShoppingCart, FolderOpen, BookOpen, AlertCircle, Printer, CheckCircle2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { getAuditContext, auditedUpdate, auditedInsert, auditedDelete } from "@/lib/audit";
import { recordJobVisit } from "@/lib/job-history";
import { usePresence } from "@/lib/use-presence";
import { PresenceAvatars } from "@/components/presence-avatars";
import { ConflictDialog, type ConflictInfo } from "@/components/conflict-dialog";
import { PmQueriesJobPanel } from "@/components/pm-queries-job-panel";
import { JobInvoicesPanel } from "@/components/job-invoices-panel";
import { JobOrdersPanel } from "@/components/job-orders-panel";
import { WODocumentsPanel } from "@/components/wo-documents-panel";
import { LearningsSection } from "@/components/learnings-section";
import { LearningTrigger } from "@/components/learning-trigger";
import { JobCompleteDialog } from "@/components/job-complete-dialog";
import type { Job, QuoteLine, ScopeItem, Quote } from "@/lib/types";
import { isTruthy } from "@/lib/types";

// ================================================================
// CATEGORY CONFIG — single source of truth
// ================================================================
const CATEGORY_CONFIG: Record<string, {
  canCreateScope: boolean;
  showAmber: boolean;
  showContractor: boolean;
  showStockTag: boolean;
  showDoneCheckbox: boolean;
  // What counts as "done" for auto-tick
  autoComplete: "scope" | "contractor" | "scope+contractor" | "manual" | "never";
}> = {
  "Workshop":                  { canCreateScope: true,  showAmber: true,  showContractor: false, showStockTag: false, showDoneCheckbox: true,  autoComplete: "scope" },
  "Workshop Build":            { canCreateScope: true,  showAmber: true,  showContractor: false, showStockTag: false, showDoneCheckbox: true,  autoComplete: "scope" },
  "Stock-and-Hire":            { canCreateScope: true,  showAmber: true,  showContractor: false, showStockTag: false, showDoneCheckbox: true,  autoComplete: "scope" },
  "Stock Pick":                { canCreateScope: true,  showAmber: true,  showContractor: false, showStockTag: true,  showDoneCheckbox: true,  autoComplete: "scope" },
  "Subcontracted":             { canCreateScope: false, showAmber: false, showContractor: true,  showStockTag: false, showDoneCheckbox: true,  autoComplete: "contractor" },
  "Subcontracted (Partial)":   { canCreateScope: true,  showAmber: true,  showContractor: true,  showStockTag: false, showDoneCheckbox: true,  autoComplete: "scope+contractor" },
  "Install":                   { canCreateScope: false, showAmber: false, showContractor: false, showStockTag: false, showDoneCheckbox: true,  autoComplete: "manual" },
  "Install (Materials)":       { canCreateScope: true,  showAmber: true,  showContractor: false, showStockTag: false, showDoneCheckbox: true,  autoComplete: "manual" },
  "Provisional":               { canCreateScope: false, showAmber: false, showContractor: false, showStockTag: false, showDoneCheckbox: true,  autoComplete: "never" },
  "Shared Departments":        { canCreateScope: true,  showAmber: true,  showContractor: false, showStockTag: false, showDoneCheckbox: true,  autoComplete: "scope" },
};

const DEFAULT_CONFIG = {
  canCreateScope: false, showAmber: false, showContractor: false,
  showStockTag: false, showDoneCheckbox: false, autoComplete: "manual" as const,
};

function getCategoryConfig(category: string | null) {
  return CATEGORY_CONFIG[category || ""] || DEFAULT_CONFIG;
}

// ================================================================
// FILTER DEFINITIONS
// ================================================================
type FilterKey = "todo" | "workshop" | "provisional" | "subcontracted" | "done" | "zone";

interface FilterDef {
  key: FilterKey;
  label: string;
  filter: (line: QuoteLine, scopes: ScopeItem[], contractorMap: Record<number, any>) => boolean;
  color: string;
}

const FILTERS: FilterDef[] = [
  {
    key: "todo",
    label: "To Do",
    filter: (l) => ["Workshop", "Workshop Build", "Stock-and-Hire", "Stock Pick", "Shared Departments", "Install (Materials)", "Subcontracted (Partial)"].includes(l.category || ""),
    color: "bg-starlight-red/10 text-starlight-red border-starlight-red/30",
  },
  {
    key: "workshop",
    label: "Workshop",
    filter: (l) => ["Workshop", "Workshop Build", "Stock-and-Hire", "Shared Departments"].includes(l.category || ""),
    color: "bg-starlight-amber/10 text-starlight-amber border-starlight-amber/30",
  },
  {
    key: "provisional",
    label: "Provisional",
    filter: (l) => l.category === "Provisional",
    color: "bg-surface-mid text-muted border-subtle",
  },
  {
    key: "subcontracted",
    label: "Subcontracted",
    filter: (l) => ["Subcontracted", "Subcontracted (Partial)"].includes(l.category || ""),
    color: "bg-starlight-blue/10 text-starlight-blue border-starlight-blue/30",
  },
  {
    key: "done",
    label: "Interpreted",
    filter: () => false, // Short-circuited in filteredLines via activeFilter === "done" branch (needs interpretedSet from component state)
    color: "bg-starlight-green/10 text-starlight-green border-starlight-green/30",
  },
];

// Contractor info type
interface ContractorInfo {
  contractor_id: number | null;
  contractor_name: string | null;
  contractor_quote_value: number | null;
  contractor_description: string | null;
}

// ================================================================
// COMPONENT
// ================================================================
export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = Number(params.id);
  const supabase = createClient();

  const [job, setJob] = useState<Job | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [scopes, setScopes] = useState<ScopeItem[]>([]);
  const [contractorMap, setContractorMap] = useState<Record<number, ContractorInfo>>({});
  const [loading, setLoading] = useState(true);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<"lines" | "scopes" | "wo">(() => {
    // Read ?tab= so a "Back to Job" link from the scope page lands on the
    // same tab the user was on when they navigated away.
    if (typeof window === "undefined") return "lines";
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "lines" || t === "scopes" || t === "wo") return t;
    return "lines";
  });
  const [woData, setWoData] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterKey | "zone" | null>(() => {
    // Persist last-used filter per job (session-scoped — dies on tab close)
    if (typeof window === "undefined") return "todo";
    try {
      const saved = sessionStorage.getItem(`job-filter-${jobId}`);
      if (saved === "null") return null;
      const valid = new Set(["todo", "workshop", "provisional", "subcontracted", "done", "zone"]);
      if (saved && valid.has(saved)) return saved as FilterKey | "zone";
    } catch { /* storage unavailable */ }
    return "todo";
  });
  const [activeTool, setActiveTool] = useState<null | "queries" | "orders" | "invoices" | "documents" | "learnings">(null);
  const [headerCounts, setHeaderCounts] = useState<{
    pm_queries_open: number; learnings_total: number; learnings_open: number;
    invoices_count: number; invoices_total: number; invoices_unallocated: number;
    orders_outstanding: number; documents_count: number;
  } | null>(null);
  const [scopeDialogLine, setScopeDialogLine] = useState<QuoteLine | null>(null);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  // --- Quote line badges ---
  // Sourced from qry_quote_line_badges. Manual checks are toggled via
  // tbl_quote_line_checks; derived alerts (materials_needed) are read-only.
  const [interpretedSet,    setInterpretedSet]    = useState<Set<number>>(new Set());
  const [kitListReadySet,   setKitListReadySet]   = useState<Set<number>>(new Set());
  const [materialsNeededSet, setMaterialsNeededSet] = useState<Set<number>>(new Set());

  // --- ADD LINE state ---
  const [showAddLine, setShowAddLine] = useState(false);
  const [newLine, setNewLine] = useState({ line_text: "", line_value: "", quantity: "", unit_price: "", event_zone: "", line_sub_group: "", category: "Workshop Build" });
  const [addingSaving, setAddingSaving] = useState(false);

  // --- INLINE EDIT state ---
  const [editingLineCell, setEditingLineCell] = useState<{ lineId: number; field: string } | null>(null);
  const [expandedPmEst, setExpandedPmEst] = useState<number | null>(null);
  const [defaultDayRate, setDefaultDayRate] = useState(250);
  const [editLineCellValue, setEditLineCellValue] = useState("");

  // Presence — show who else is viewing this job
  const { others: presenceOthers, setEditing: presenceSetEditing } = usePresence("job", jobId, "Quote Lines");

  // Conflict dialog state for optimistic concurrency
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [conflictResolve, setConflictResolve] = useState<{
    onMine: () => void;
    onTheirs: () => void;
  } | null>(null);

  const loadData = useCallback(async () => {
    // Main detail data + lightweight header counts run in parallel
    const [mainRes, countsRes] = await Promise.all([
      supabase.rpc("rpc_job_detail_data", { p_job_id: jobId }),
      supabase.rpc("rpc_job_header_counts", { p_job_id: jobId }),
    ]);
    if (countsRes.data) setHeaderCounts(countsRes.data as any);
    const d = mainRes.data;
    const error = mainRes.error;
    if (error || !d) { console.error("Job detail RPC failed:", error); setLoading(false); return; }

    // Calculate default day rate from rate card
    const stdHours = parseFloat(d.standard_day_hours) || 10;
    const straightforwardRate = d.rate_card?.rate_per_hour || 25;
    setDefaultDayRate(straightforwardRate * stdHours);

    if (d.job) setJob(d.job);
    if (d.quotes) setQuotes(d.quotes);
    if (d.lines) setLines(d.lines);
    if (d.scopes) setScopes(d.scopes);

    // Load all badges for this job's lines (manual checks + derived alerts)
    const lineIds = (d.lines || []).map((l: any) => l.quote_line_id);
    if (lineIds.length > 0) {
      const { data: badges } = await supabase
        .from("qry_quote_line_badges")
        .select("quote_line_id, badge_code")
        .in("quote_line_id", lineIds);
      const interp   = new Set<number>();
      const kitReady = new Set<number>();
      const matsNeed = new Set<number>();
      for (const b of (badges || []) as any[]) {
        if (b.badge_code === "interpreted")       interp.add(b.quote_line_id);
        else if (b.badge_code === "kit_list_ready") kitReady.add(b.quote_line_id);
        else if (b.badge_code === "materials_needed") matsNeed.add(b.quote_line_id);
      }
      setInterpretedSet(interp);
      setKitListReadySet(kitReady);
      setMaterialsNeededSet(matsNeed);
    } else {
      setInterpretedSet(new Set());
      setKitListReadySet(new Set());
      setMaterialsNeededSet(new Set());
    }

    // Enrich WO data with activity labels
    const wos = d.work_orders || [];
    if (wos.length > 0) {
      const lkMap: Record<number, { v: string; p: number | null }> = {};
      (d.activity_lookups || []).forEach((l: any) => { lkMap[l.lookup_id] = { v: l.lookup_value, p: l.phase_number }; });

      const actByWO: Record<number, any[]> = {};
      (d.wo_activities || []).forEach((a: any) => {
        if (!actByWO[a.work_order_id]) actByWO[a.work_order_id] = [];
        actByWO[a.work_order_id].push(a);
      });

      const scopeMap: Record<number, string> = {};
      if (d.scopes) {
        d.scopes.forEach((s: any) => {
          const line = d.lines?.find((l: any) => l.quote_line_id === s.quote_line_id);
          scopeMap[s.scope_item_id] = line?.line_text || s.item_name || "Scope #" + s.scope_item_id;
        });
      }

      const woEnriched = wos.map((wo: any) => {
        const acts = actByWO[wo.work_order_id];
        let label = "No Activity";
        let phase: number | null = null;
        if (acts && acts.length > 0) {
          acts.sort((a: any, b: any) => a.sequence - b.sequence);
          label = acts.map((a: any) => lkMap[a.activity_id]?.v || "?").join(" + ");
          phase = lkMap[acts[0].activity_id]?.p ?? null;
        } else if (wo.activity_verb && lkMap[wo.activity_verb]) {
          label = lkMap[wo.activity_verb].v;
          phase = lkMap[wo.activity_verb].p;
        }
        return { ...wo, activity_label: label, phase_number: phase, wo_sequence: wo.wo_sequence, scope_name: scopeMap[wo.scope_item_id] || "—", scope_total_wos: 0, prev_wo_status: null as string | null };
      });
      // Compute per-scope step info
      const wsByScope: Record<number, any[]> = {};
      woEnriched.forEach((w: any) => {
        if (!wsByScope[w.scope_item_id]) wsByScope[w.scope_item_id] = [];
        wsByScope[w.scope_item_id].push(w);
      });
      Object.values(wsByScope).forEach((sWOs: any[]) => {
        sWOs.sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999));
        sWOs.forEach((w, idx) => {
          w.scope_total_wos = sWOs.length;
          w.prev_wo_status = idx > 0 ? sWOs[idx - 1].status : null;
        });
      });
      setWoData(woEnriched);
    } else {
      setWoData([]);
    }

    if (d.contractors) {
      const map: Record<number, ContractorInfo> = {};
      d.contractors.forEach((row: any) => {
        if (row.contractor_id) {
          map[row.quote_line_id] = {
            contractor_id: row.contractor_id,
            contractor_name: row.contractor_name,
            contractor_quote_value: row.contractor_quote_value,
            contractor_description: row.contractor_description,
          };
        }
      });
      setContractorMap(map);
    }

    setLoading(false);
  }, [jobId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Scroll-restore on return from a scope/WO page.
  // The scope page's "Back to Job" link encodes the row the user came from
  // as `?tab=wo#wo-123` (or `?tab=scopes#scope-456`). The `?tab=` is read
  // by the activeTab initialiser above; the hash is consumed here, once,
  // after the data load completes and the rows have rendered.
  const didRestoreScroll = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading || didRestoreScroll.current) return;
    if (!window.location.hash) return;
    didRestoreScroll.current = true; // attempt once; silently no-op if element is missing
    requestAnimationFrame(() => {
      const el = document.querySelector(window.location.hash);
      if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
    });
  }, [loading]);

  // Record visit for recent jobs strip
  useEffect(() => {
    if (job) recordJobVisit({ jobId: job.job_id, jobNumber: job.job_number || "", jobName: job.job_name || "", path: `/jobs/${job.job_id}` });
  }, [job?.job_id]);

  // Persist filter choice on change (session-scoped, per job)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(`job-filter-${jobId}`, activeFilter === null ? "null" : activeFilter);
    } catch { /* storage unavailable */ }
  }, [activeFilter, jobId]);

  // Short label for scope status pill on quote-line rows
  // Maps internal DB values to concise workshop-friendly labels
  function displayScopeStatus(status: string | null): string {
    switch (status) {
      case "Workshop Completed": return "Built";
      case "Cancelled-Cost-Retained": return "Cancelled";
      default: return status || "—";
    }
  }

  // ================================================================
  // Quote line badge helpers
  //   isDone            — 'interpreted' manual check (junction table)
  //   isKitListReady    — 'kit_list_ready' manual check (junction table)
  //   hasMaterialsNeeded — derived alert from qry_quote_line_badges
  // ================================================================
  function isDone(line: QuoteLine): boolean {
    return interpretedSet.has(line.quote_line_id);
  }
  function isKitListReady(line: QuoteLine): boolean {
    return kitListReadySet.has(line.quote_line_id);
  }
  function hasMaterialsNeeded(line: QuoteLine): boolean {
    return materialsNeededSet.has(line.quote_line_id);
  }

  // ================================================================
  // JOB HEADER EDITING
  // ================================================================
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (field: string, currentValue: string | null) => {
    setEditingField(field);
    setEditValue(currentValue || "");
    presenceSetEditing(field);
  };

  const saveJobField = async () => {
    if (!editingField || !job) return;
    const val = editValue.trim() || null;
    const expectedAt = (job as any).updated_at ?? null;
    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(ctx, "tbl_production_plan", job.job_id, { [editingField]: val }, job.job_id, expectedAt);
    if (result.conflict) {
      toast.warning("This job was modified by someone else — reloading");
      await loadData();
    } else {
      setJob({ ...job, [editingField]: val } as Job);
    }
    setEditingField(null);
    setEditValue("");
    presenceSetEditing(null);
  };

  const cancelEdit = () => { setEditingField(null); setEditValue(""); presenceSetEditing(null); };

  // Reopen a Complete job back to Active. One click, audit-logged. completed_at /
  // completed_by / close_note are NOT cleared — the original close is preserved
  // in the audit log as a useful "this was reopened" trail.
  const handleReopen = async () => {
    if (!job) return;
    if (!confirm("Reopen this job? It'll go back to Active. Original completion data is kept in the audit log.")) return;
    const expectedAt = (job as any).updated_at ?? null;
    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(
      ctx,
      "tbl_production_plan",
      job.job_id,
      {
        job_status: "Active",
        completed_at: null,
        completed_by: null,
        // Keep close_note — it's still useful context if reopened.
      },
      job.job_id,
      expectedAt,
    );
    if (result.error) { toast.error("Reopen failed: " + result.error.message); return; }
    if (result.conflict) { toast.warning("Job modified elsewhere — reloading"); await loadData(); return; }
    toast.success("Job reopened");
    setJob({ ...job, job_status: "Active", completed_at: null, completed_by: null } as Job);
  };

  // ================================================================
  // UPDATE HANDLERS
  // ================================================================
  const updateLine = async (lineId: number, field: string, value: string | null) => {
    const cellKey = `${lineId}-${field}`;
    setSavingCells((prev) => new Set(prev).add(cellKey));

    const line = lines.find((l) => l.quote_line_id === lineId);
    const expectedAt = (line as any)?.updated_at ?? null;

    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(ctx, "tbl_quote_lines", lineId, { [field]: value }, jobId, expectedAt);

    if (result.conflict && result.currentRecord) {
      // Show conflict dialog — let user choose
      const current = result.currentRecord;
      const fieldLabel = field.replace(/_/g, " ");
      setConflictInfo({
        fieldLabel,
        yourValue: String(value ?? ""),
        currentValue: String(current[field] ?? ""),
        changedBy: undefined, // could enrich from audit log
      });
      setConflictResolve({
        onMine: async () => {
          // Force-save: no concurrency guard this time
          const ctx2 = await getAuditContext(supabase);
          await auditedUpdate(ctx2, "tbl_quote_lines", lineId, { [field]: value }, jobId);
          setLines((prev) =>
            prev.map((l) => (l.quote_line_id === lineId ? { ...l, [field]: value, updated_at: new Date().toISOString() } as any : l))
          );
          setConflictInfo(null);
          setConflictResolve(null);
          toast.success("Your value saved");
        },
        onTheirs: () => {
          // Accept DB value — update local state to match
          setLines((prev) =>
            prev.map((l) => (l.quote_line_id === lineId ? { ...l, ...current } : l))
          );
          setConflictInfo(null);
          setConflictResolve(null);
          toast("Kept other user's value");
        },
      });
    } else {
      // Success — update local state with new updated_at
      setLines((prev) =>
        prev.map((l) => (l.quote_line_id === lineId
          ? { ...l, [field]: value, updated_at: result.data?.updated_at } as any
          : l))
      );
    }

    setSavingCells((prev) => {
      const next = new Set(prev);
      next.delete(cellKey);
      return next;
    });
  };

  // Toggle a manual check on a quote line. Works for any check_code in tbl_check_types.
  // Uses optimistic local update; rolls back on error.
  const toggleCheck = async (
    line: QuoteLine,
    checkCode: "interpreted" | "kit_list_ready",
  ) => {
    const set    = checkCode === "interpreted" ? interpretedSet    : kitListReadySet;
    const setter = checkCode === "interpreted" ? setInterpretedSet : setKitListReadySet;
    const isTicked = set.has(line.quote_line_id);

    if (isTicked) {
      const { error } = await supabase
        .from("tbl_quote_line_checks")
        .delete()
        .eq("quote_line_id", line.quote_line_id)
        .eq("check_code", checkCode);
      if (error) { toast.error("Failed to untick: " + error.message); return; }
      setter((prev) => { const n = new Set(prev); n.delete(line.quote_line_id); return n; });
    } else {
      const { error } = await supabase
        .from("tbl_quote_line_checks")
        .insert({ quote_line_id: line.quote_line_id, check_code: checkCode });
      if (error) { toast.error("Failed to tick: " + error.message); return; }
      setter((prev) => new Set(prev).add(line.quote_line_id));
    }
  };

  const toggleInterpretation = (line: QuoteLine) => toggleCheck(line, "interpreted");
  const toggleKitListReady   = (line: QuoteLine) => toggleCheck(line, "kit_list_ready");

  const handleScopeCreated = (scopeItemId: number) => {
    setScopeDialogLine(null);
    loadData();
    router.push(`/jobs/${jobId}/scope/${scopeItemId}`);
  };

  // ================================================================
  // ADD LINE
  // ================================================================
  const handleAddLine = async () => {
    if (!newLine.line_text.trim()) return;
    setAddingSaving(true);

    // Ensure a quote container exists
    let quoteId = quotes[0]?.quote_id;
    if (!quoteId) {
      const { data: q } = await supabase
        .from("tbl_quotes")
        .insert({ job_id: jobId, quote_description: "Internal Build List", status: "Accepted", imported_at: new Date().toISOString() })
        .select()
        .single();
      if (q) {
        quoteId = q.quote_id;
        setQuotes([q]);
      }
    }
    if (!quoteId) { toast.error("Failed to create quote"); setAddingSaving(false); return; }

    const nextSeq = lines.length > 0 ? Math.max(...lines.map(l => l.import_sequence || 0)) + 1 : 1;
    const nextNum = String(nextSeq);

    const qty = newLine.quantity ? parseFloat(newLine.quantity) : null;
    const unitP = newLine.unit_price ? parseFloat(newLine.unit_price) : null;
    const manualVal = newLine.line_value ? parseFloat(newLine.line_value) : null;
    const computedValue = (qty && unitP) ? qty * unitP : manualVal;

    const ctx = await getAuditContext(supabase);
    const { error } = await auditedInsert(ctx, "tbl_quote_lines", {
      quote_id: quoteId,
      job_id: jobId,
      line_number: nextNum,
      import_sequence: nextSeq,
      line_text: newLine.line_text.trim(),
      line_value: computedValue,
      quantity: qty,
      unit_price: unitP,
      event_zone: newLine.event_zone.trim() || null,
      line_sub_group: newLine.line_sub_group.trim() || null,
      category: newLine.category || null,
    }, jobId);

    if (error) { toast.error("Failed to add line"); setAddingSaving(false); return; }

    toast.success("Line added");
    setNewLine({ line_text: "", line_value: "", quantity: "", unit_price: "", event_zone: "", line_sub_group: "", category: "Workshop Build" });
    setShowAddLine(false);
    setAddingSaving(false);
    loadData();
  };

  // ================================================================
  // DELETE LINE
  // ================================================================
  const handleDeleteLine = async (line: QuoteLine) => {
    const hasScope = scopes.some(s => s.quote_line_id === line.quote_line_id && s.status !== "Cancelled-Cost-Retained");
    if (hasScope) { toast.error("Cannot delete — scope item exists from this line"); return; }

    const desc = (line.line_text || "").slice(0, 50);
    if (!confirm(`Delete line ${line.line_number}: "${desc}..."?`)) return;

    const { error } = await supabase.from("tbl_quote_lines").delete().eq("quote_line_id", line.quote_line_id);
    if (error) { toast.error("Delete failed"); return; }

    // Log deletion
    const ctx = await getAuditContext(supabase);
    await supabase.from("tbl_audit_log").insert({
      user_id: ctx.userId, user_name: ctx.userName, user_role: ctx.userRole,
      table_name: "tbl_quote_lines", record_id: line.quote_line_id,
      field_name: "_record", old_value: JSON.stringify(line), new_value: null,
      job_id: jobId, action_type: "delete",
    });

    toast.success("Line deleted");
    setLines(prev => prev.filter(l => l.quote_line_id !== line.quote_line_id));
  };

  // ================================================================
  // INLINE EDIT (description & value)
  // ================================================================
  const startLineEdit = (lineId: number, field: string, currentValue: string | number | null) => {
    setEditingLineCell({ lineId, field });
    setEditLineCellValue(String(currentValue ?? ""));
    presenceSetEditing(`line_${lineId}_${field}`);
  };

  const saveLineEdit = async () => {
    if (!editingLineCell) return;
    const { lineId, field } = editingLineCell;
    let val: string | number | null = editLineCellValue.trim() || null;
    if (["line_value", "quantity", "unit_price"].includes(field) && val !== null) val = parseFloat(val as string) || null;

    // Save the edited field
    await updateLine(lineId, field, val as any);

    // Auto-recalc line_value when qty or unit_price changes
    if (field === "quantity" || field === "unit_price") {
      const line = lines.find(l => l.quote_line_id === lineId);
      if (line) {
        const newQty = field === "quantity" ? (val as number) : line.quantity;
        const newUp = field === "unit_price" ? (val as number) : line.unit_price;
        if (newQty && newUp) {
          const total = Math.round(newQty * newUp * 100) / 100;
          await updateLine(lineId, "line_value", total as any);
        }
      }
    }

    setEditingLineCell(null);
    setEditLineCellValue("");
    presenceSetEditing(null);
  };

  const cancelLineEdit = () => { setEditingLineCell(null); setEditLineCellValue(""); presenceSetEditing(null); };

  // PM Estimate Level 2/3 save
  const savePmEstBreakdown = async (lineId: number, labourDays: number | null, materialCost: number | null, rateOverride: number | null, notes: string | null) => {
    const rate = rateOverride || defaultDayRate;
    const labourCost = (labourDays || 0) * rate;
    const totalCost = labourCost + (materialCost || 0);
    const changes: Record<string, any> = {
      pm_est_labour_days: labourDays,
      pm_est_material_cost: materialCost,
      pm_est_rate_override: rateOverride,
      pm_est_notes: notes,
      pm_est_cost: totalCost > 0 ? totalCost : null,
    };
    const ctx = await getAuditContext(supabase);
    const line = lines.find(l => l.quote_line_id === lineId);
    const expectedAt = (line as any)?.updated_at ?? null;
    const result = await auditedUpdate(ctx, "tbl_quote_lines", lineId, changes, job?.job_id || null, expectedAt);
    if (result.conflict) { toast.warning("Line modified by another user — reloading"); await loadData(); }
    else { setLines(prev => prev.map(l => l.quote_line_id === lineId ? { ...l, ...changes, updated_at: (result.data as any)?.updated_at } : l)); toast.success("PM estimate saved"); }
  };

  // ================================================================
  // COMPUTED VALUES
  // ================================================================
  const scopeReadyLines = lines.filter((l) => getCategoryConfig(l.category).canCreateScope);
  const doneCount = lines.filter((l) => isDone(l)).length;
  const needsActionCount = lines.filter((l) => {
    const config = getCategoryConfig(l.category);
    return (config.showAmber || config.showContractor) && !isDone(l);
  }).length;
  const totalValue = lines.reduce((s, l) => s + (l.line_value || 0), 0);
  const doneValue = lines.filter((l) => isDone(l)).reduce((s, l) => s + (l.line_value || 0), 0);

  // Apply active filter
  const filteredLines = (() => {
    if (!activeFilter) return lines;
    if (activeFilter === "zone") return lines; // zone uses grouping, not filtering
    if (activeFilter === "done") return lines.filter((l) => isDone(l));
    if (activeFilter === "todo") {
      const filterDef = FILTERS.find((f) => f.key === "todo");
      if (!filterDef) return lines;
      return lines.filter((l) => filterDef.filter(l, scopes, contractorMap) && !isDone(l));
    }
    const filterDef = FILTERS.find((f) => f.key === activeFilter);
    if (!filterDef) return lines;
    return lines.filter((l) => filterDef.filter(l, scopes, contractorMap));
  })();

  // For zone view, group by event_zone
  const zoneGroups = (() => {
    if (activeFilter !== "zone") return null;
    const groups: Record<string, QuoteLine[]> = {};
    lines.forEach((l) => {
      const zone = l.event_zone || "No Zone";
      if (!groups[zone]) groups[zone] = [];
      groups[zone].push(l);
    });
    return groups;
  })();

  // Filter counts
  const todoFilter = FILTERS.find((f) => f.key === "todo")!;
  const workshopFilter = FILTERS.find((f) => f.key === "workshop")!;
  const provisionalFilter = FILTERS.find((f) => f.key === "provisional")!;
  const subcontractedFilter = FILTERS.find((f) => f.key === "subcontracted")!;
  const filterCounts = {
    todo: lines.filter((l) => todoFilter.filter(l, scopes, contractorMap) && !isDone(l)).length,
    workshop: lines.filter((l) => workshopFilter.filter(l, scopes, contractorMap)).length,
    provisional: lines.filter((l) => provisionalFilter.filter(l, scopes, contractorMap)).length,
    subcontracted: lines.filter((l) => subcontractedFilter.filter(l, scopes, contractorMap)).length,
    done: doneCount,
    zone: new Set(lines.map((l) => l.event_zone || "No Zone")).size,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm animate-pulse">
        Loading job...
      </div>
    );
  }

  if (!job) {
    return <div className="text-center py-12 text-muted">Job not found</div>;
  }

  // ================================================================
  // PM ESTIMATE SUB-ROW (Level 2/3)
  // ================================================================
  function PmEstSubRow({ line, onSave, defaultRate }: { line: QuoteLine; onSave: (lineId: number, labourDays: number | null, materialCost: number | null, rateOverride: number | null, notes: string | null) => Promise<void>; defaultRate: number }) {
    const [labourDays, setLabourDays] = useState(line.pm_est_labour_days ?? "");
    const [materialCost, setMaterialCost] = useState(line.pm_est_material_cost ?? "");
    const [rateOverride, setRateOverride] = useState(line.pm_est_rate_override ?? "");
    const [notes, setNotes] = useState(line.pm_est_notes ?? "");
    const [saving, setSaving] = useState(false);
    const rate = Number(rateOverride) || defaultRate;
    const calcLabour = (Number(labourDays) || 0) * rate;
    const calcTotal = calcLabour + (Number(materialCost) || 0);
    return (
      <tr className="bg-navy/10/30 border-t border-navy/15">
        <td colSpan={10} className="px-6 py-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Labour Days</label>
              <input type="number" step="0.5" value={labourDays} onChange={(e) => setLabourDays(e.target.value)} className="w-20 px-2 py-1.5 border border-subtle rounded text-sm text-center bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="0" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Day Rate</label>
              <input type="number" step="1" value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} className="w-20 px-2 py-1.5 border border-subtle rounded text-sm text-center bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder={String(defaultRate)} />
            </div>
            <div className="text-xs text-muted pb-2">= {formatCurrency(calcLabour)} labour</div>
            <div>
              <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Materials</label>
              <input type="number" step="0.01" value={materialCost} onChange={(e) => setMaterialCost(e.target.value)} className="w-24 px-2 py-1.5 border border-subtle rounded text-sm text-center bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="0" />
            </div>
            <div className="text-sm font-semibold text-navy pb-2">= {formatCurrency(calcTotal)} total</div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Basis / Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="e.g. Similar to Claridge's job..." />
            </div>
            <button disabled={saving} onClick={async () => { setSaving(true); await onSave(line.quote_line_id, Number(labourDays) || null, Number(materialCost) || null, Number(rateOverride) || null, notes.trim() || null); setSaving(false); }} className="px-3 py-1.5 text-xs font-medium bg-navy text-white rounded hover:bg-navy/90 disabled:opacity-40">
              {saving ? "..." : "Save"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  // ================================================================
  // RENDER A SINGLE QUOTE LINE ROW
  // ================================================================
  function renderLineRow(line: QuoteLine) {
    const config = getCategoryConfig(line.category);
    const lineIsDone = isDone(line);
    const isUninterpreted = config.showAmber && !lineIsDone;
    const hasScope = scopes.some((s) => s.quote_line_id === line.quote_line_id && s.status !== "Cancelled-Cost-Retained");
    const contractorInfo = contractorMap[line.quote_line_id];

    return (
      <Fragment key={line.quote_line_id}>
      <tr
        className={`border-t border-subtle transition-colors ${
          isUninterpreted
            ? "bg-starlight-amber/10/60 border-l-4 border-l-starlight-amber"
            : lineIsDone
            ? "bg-starlight-green/10/20"
            : ""
        }`}
      >
        {/* Line number */}
        <td className="px-3 py-2.5 font-mono text-xs text-muted">
          {line.line_number}
        </td>

        {/* Zone */}
        <td className="px-3 py-2.5 text-xs text-muted">
          {line.event_zone}
        </td>

        {/* Description + PM note + contractor/stock */}
        <td className="px-3 py-2.5">
          {editingLineCell?.lineId === line.quote_line_id && editingLineCell.field === "line_text" ? (
            <textarea
              value={editLineCellValue}
              onChange={(e) => setEditLineCellValue(e.target.value)}
              onBlur={saveLineEdit}
              onKeyDown={(e) => { if (e.key === "Escape") cancelLineEdit(); }}
              autoFocus rows={3}
              className="w-full px-2 py-1 text-sm border border-starlight-blue rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue"
            />
          ) : (
            <p onClick={() => startLineEdit(line.quote_line_id, "line_text", line.line_text)}
              className="text-sm text-foreground leading-relaxed cursor-pointer hover:bg-navy/10/50 rounded px-1 -mx-1 transition-colors group">
              {line.line_text || <span className="text-faint italic">Click to add description</span>}
              <Pencil className="h-3 w-3 text-faint opacity-0 group-hover:opacity-100 inline ml-1.5 transition-opacity" />
            </p>
          )}
          <input
            type="text"
            value={line.pm_note || ""}
            onChange={(e) =>
              setLines((prev) =>
                prev.map((l) =>
                  l.quote_line_id === line.quote_line_id
                    ? { ...l, pm_note: e.target.value }
                    : l
                )
              )
            }
            onBlur={(e) =>
              updateLine(line.quote_line_id, "pm_note", e.target.value || null)
            }
            placeholder="PM note..."
            className="mt-1 w-full px-2 py-1 text-xs border-0 border-b border-transparent hover:border-subtle focus:border-starlight-blue focus:outline-none bg-transparent text-muted placeholder:text-faint"
          />
          {config.showContractor && (
            <div className="mt-1.5">
              <ContractorPicker
                quoteLineId={line.quote_line_id}
                currentContractorId={contractorInfo?.contractor_id || null}
                currentContractorName={contractorInfo?.contractor_name || null}
                currentQuoteValue={contractorInfo?.contractor_quote_value || null}
                currentDescription={contractorInfo?.contractor_description || null}
                onUpdate={loadData}
              />
            </div>
          )}
          {config.showStockTag && (
            <div className="mt-1.5">
              <span className="inline-flex items-center gap-1 text-xs bg-phase-2/10 text-phase-2 px-2 py-0.5 rounded">
                <Package className="h-3 w-3" />
                Stock Pick
              </span>
            </div>
          )}
        </td>

        {/* Category dropdown */}
        <td className="px-3 py-2.5">
          <LookupCombo
            category="QUOTE_LINE_CATEGORY"
            value={line.category}
            onChange={(val) => updateLine(line.quote_line_id, "category", val)}
            className="w-full text-xs"
          />
        </td>

        {/* Qty — editable */}
        <td className="px-3 py-2.5 text-center">
          {editingLineCell?.lineId === line.quote_line_id && editingLineCell.field === "quantity" ? (
            <input type="number" step="1" value={editLineCellValue}
              onChange={(e) => setEditLineCellValue(e.target.value)}
              onBlur={saveLineEdit}
              onKeyDown={(e) => { if (e.key === "Enter") saveLineEdit(); if (e.key === "Escape") cancelLineEdit(); }}
              autoFocus className="w-16 px-2 py-1 text-sm text-center border border-starlight-blue rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
          ) : (
            <span onClick={() => startLineEdit(line.quote_line_id, "quantity", line.quantity)}
              className="inline-block min-w-[2rem] px-1 py-0.5 text-sm tabular-nums cursor-pointer hover:bg-navy/10 rounded transition-colors text-foreground">
              {line.quantity != null ? line.quantity : <span className="text-faint">—</span>}
            </span>
          )}
        </td>

        {/* Unit Price — editable */}
        <td className="px-3 py-2.5 text-right">
          {editingLineCell?.lineId === line.quote_line_id && editingLineCell.field === "unit_price" ? (
            <input type="number" step="0.01" value={editLineCellValue}
              onChange={(e) => setEditLineCellValue(e.target.value)}
              onBlur={saveLineEdit}
              onKeyDown={(e) => { if (e.key === "Enter") saveLineEdit(); if (e.key === "Escape") cancelLineEdit(); }}
              autoFocus className="w-20 px-2 py-1 text-sm text-right border border-starlight-blue rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
          ) : (
            <span onClick={() => startLineEdit(line.quote_line_id, "unit_price", line.unit_price)}
              className="text-sm tabular-nums cursor-pointer hover:text-starlight-blue transition-colors text-muted">
              {line.unit_price != null ? formatCurrency(line.unit_price) : <span className="text-faint">—</span>}
            </span>
          )}
        </td>

        {/* Total Value — editable */}
        <td className="px-3 py-2.5 text-right">
          {editingLineCell?.lineId === line.quote_line_id && editingLineCell.field === "line_value" ? (
            <input type="number" step="0.01" value={editLineCellValue}
              onChange={(e) => setEditLineCellValue(e.target.value)}
              onBlur={saveLineEdit}
              onKeyDown={(e) => { if (e.key === "Enter") saveLineEdit(); if (e.key === "Escape") cancelLineEdit(); }}
              autoFocus className="w-24 px-2 py-1 text-sm text-right border border-starlight-blue rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
          ) : (
            <span onClick={() => startLineEdit(line.quote_line_id, "line_value", line.line_value)}
              className="font-medium text-foreground tabular-nums cursor-pointer hover:text-starlight-blue transition-colors">
              {line.line_value ? formatCurrency(line.line_value) : <span className="text-faint">—</span>}
            </span>
          )}
        </td>

        {/* Scope — create, or coloured status pill linking to scope page */}
        <td className="px-3 py-2.5 text-center">
          {config.canCreateScope && !hasScope && (
            <button
              onClick={() => setScopeDialogLine(line)}
              title="Create Scope Item from this line"
              className="p-1 text-starlight-red hover:bg-starlight-red/10 rounded-md transition-colors"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
          {hasScope && (() => {
            const s = scopes.find(x => x.quote_line_id === line.quote_line_id && x.status !== "Cancelled-Cost-Retained");
            if (!s) return null;
            return (
              <a
                href={`/jobs/${jobId}/scope/${s.scope_item_id}`}
                title={`Open scope — ${s.status || "—"}`}
                className="inline-flex items-center transition-opacity hover:opacity-80"
              >
                <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap " + statusClass(s.status)}>
                  {displayScopeStatus(s.status)}
                </span>
              </a>
            );
          })()}
        </td>

        {/* PM Est — Level 1 inline + expand chevron */}
        <td className="px-3 py-2.5 text-right">
          {editingLineCell?.lineId === line.quote_line_id && editingLineCell.field === "pm_est_cost" ? (
            <input type="number" step="0.01" value={editLineCellValue}
              onChange={(e) => setEditLineCellValue(e.target.value)}
              onBlur={saveLineEdit}
              onKeyDown={(e) => { if (e.key === "Enter") saveLineEdit(); if (e.key === "Escape") cancelLineEdit(); }}
              autoFocus className="w-20 px-2 py-1 text-sm text-right border border-starlight-blue rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
          ) : line.pm_est_cost != null ? (
            <div>
              <div className="flex items-center justify-end gap-1.5">
                <span onClick={() => startLineEdit(line.quote_line_id, "pm_est_cost", line.pm_est_cost)}
                  className="text-sm font-medium tabular-nums cursor-pointer hover:text-starlight-blue transition-colors text-foreground">
                  {formatCurrency(line.pm_est_cost)}
                </span>
                <button onClick={() => setExpandedPmEst(expandedPmEst === line.quote_line_id ? null : line.quote_line_id)}
                  className={"w-5 h-5 rounded flex items-center justify-center transition-colors " + (expandedPmEst === line.quote_line_id ? "bg-navy text-white" : "bg-surface-mid text-muted hover:bg-surface-hi")} title="Breakdown">
                  <ChevronDown className={"h-3 w-3 transition-transform " + (expandedPmEst === line.quote_line_id ? "rotate-180" : "")} />
                </button>
              </div>
              {line.line_value != null && line.line_value > 0 && (
                <div className={"text-[10px] tabular-nums mt-0.5 text-right " + (((line.line_value - line.pm_est_cost) / line.line_value * 100) >= 20 ? "text-starlight-green" : ((line.line_value - line.pm_est_cost) / line.line_value * 100) >= 0 ? "text-starlight-amber" : "text-starlight-red")}>
                  {Math.round((line.line_value - line.pm_est_cost) / line.line_value * 100)}% margin
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1.5">
              <span onClick={() => startLineEdit(line.quote_line_id, "pm_est_cost", null)}
                className="inline-block px-2 py-0.5 text-xs text-faint border border-dashed border-subtle rounded cursor-pointer hover:border-starlight-blue hover:text-starlight-blue transition-colors">
                Est...
              </span>
              <button onClick={() => setExpandedPmEst(expandedPmEst === line.quote_line_id ? null : line.quote_line_id)}
                className={"w-5 h-5 rounded flex items-center justify-center transition-colors " + (expandedPmEst === line.quote_line_id ? "bg-navy text-white" : "bg-surface-mid text-muted hover:bg-surface-hi")} title="Breakdown">
                <ChevronDown className={"h-3 w-3 transition-transform " + (expandedPmEst === line.quote_line_id ? "rotate-180" : "")} />
              </button>
            </div>
          )}
        </td>

        {/* Flags — manual checks + derived alerts */}
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-center gap-1.5">
            {config.showDoneCheckbox ? (
              <>
                <button
                  onClick={() => toggleInterpretation(line)}
                  title={lineIsDone ? "Interpreted — click to untick" : "Mark Interpreted"}
                  className={`w-6 h-6 rounded-md border-2 inline-flex items-center justify-center text-[10px] font-semibold transition-all ${
                    lineIsDone
                      ? "bg-starlight-green border-starlight-green text-white"
                      : "border-subtle text-faint hover:border-starlight-amber hover:text-starlight-amber"
                  }`}
                >
                  I
                </button>
                <button
                  onClick={() => toggleKitListReady(line)}
                  title={isKitListReady(line) ? "Kit List Ready — click to untick" : "Mark Kit List Ready"}
                  className={`w-6 h-6 rounded-md border-2 inline-flex items-center justify-center text-[10px] font-semibold transition-all ${
                    isKitListReady(line)
                      ? "bg-starlight-green border-starlight-green text-white"
                      : "border-subtle text-faint hover:border-starlight-amber hover:text-starlight-amber"
                  }`}
                >
                  K
                </button>
              </>
            ) : (
              <span className="text-faint">&mdash;</span>
            )}
            {hasMaterialsNeeded(line) && (
              <span
                title="Materials Needed — BOM rows flagged for ordering"
                className="inline-flex items-center gap-0.5 px-1.5 h-6 rounded-md bg-starlight-amber/10 text-starlight-amber border border-starlight-amber/30 text-[10px] font-medium"
              >
                <AlertCircle className="h-3 w-3" />
              </span>
            )}
          </div>
        </td>

        {/* Delete */}
        <td className="px-2 py-2.5">
          <div className="flex items-center gap-0.5">
            <LearningTrigger
              context={{
                quote_line_id: line.quote_line_id,
                job_id: jobId,
                contextLabel: `Quote line ${line.line_number || ""}`.trim(),
                contextSublabel: (line.line_text || "").slice(0, 80),
              }}
              title="Capture learning for this quote line"
            />
            {!hasScope && (
              <button
                onClick={() => handleDeleteLine(line)}
                title="Delete line"
                className="p-1 text-faint hover:text-starlight-red hover:bg-starlight-red/10 rounded-md transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {expandedPmEst === line.quote_line_id && (
        <PmEstSubRow line={line} onSave={savePmEstBreakdown} defaultRate={defaultDayRate} />
      )}
      </Fragment>
    );
  }

  // ================================================================
  // TABLE HEADER
  // ================================================================
  const tableHead = (
    <thead>
      <tr className="bg-base text-left">
        <th className="px-3 py-2.5 font-medium text-muted w-12">#</th>
        <th className="px-3 py-2.5 font-medium text-muted w-24">Zone</th>
        <th className="px-3 py-2.5 font-medium text-muted">Description</th>
        <th className="px-3 py-2.5 font-medium text-muted w-52">Category</th>
        <th className="px-3 py-2.5 font-medium text-muted w-16 text-center">Qty</th>
        <th className="px-3 py-2.5 font-medium text-muted w-24 text-right">Unit Price</th>
        <th className="px-3 py-2.5 font-medium text-muted w-24 text-right">Value</th>
        <th className="px-3 py-2.5 font-medium text-muted w-16 text-center">Scope</th>
        <th className="px-3 py-2.5 font-medium text-muted w-28 text-right">PM Est</th>
        <th className="px-3 py-2.5 font-medium text-muted w-28 text-center">Flags</th>
        <th className="px-3 py-2.5 font-medium text-muted w-10"></th>
      </tr>
    </thead>
  );

  // ================================================================
  // MAIN RENDER
  // ================================================================
  return (
    <div className="space-y-5">
      {/* Back link + presence */}
      <div className="flex items-center justify-between">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          All Jobs
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href={`/reports/load-list/${jobId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-starlight-blue/10 text-starlight-blue hover:bg-starlight-blue/20 rounded-lg transition-colors"
            title="Load list — items to pack for this job"
          >
            <Truck className="h-3.5 w-3.5" />
            Load List
          </Link>
          {job?.job_status === "Complete" ? (
            <>
              <Link
                href={`/reports/job-close/${jobId}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-starlight-green/10 text-starlight-green hover:bg-starlight-green/20 rounded-lg transition-colors"
                title="Close report — full job summary"
              >
                <FileText className="h-3.5 w-3.5" />
                Close Report
              </Link>
              <button
                onClick={handleReopen}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-surface-mid text-muted hover:text-navy hover:bg-surface-hi rounded-lg transition-colors"
                title="Reopen job — sets back to Active"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reopen
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowCompleteDialog(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-starlight-green/10 text-starlight-green hover:bg-starlight-green/20 rounded-lg transition-colors"
              title="Mark this job Complete"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Complete Job
            </button>
          )}
          <PresenceAvatars others={presenceOthers} />
        </div>
      </div>

      {/* Job header — editable */}
      <div className="card px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-xs text-muted font-mono">{job.job_number}</p>

            {/* Job name — editable */}
            {editingField === "job_name" ? (
              <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveJobField(); if (e.key === "Escape") cancelEdit(); }}
                onBlur={saveJobField} autoFocus
                className="text-xl font-bold text-navy w-full border-b-2 border-starlight-blue bg-transparent outline-none py-0.5" />
            ) : (
              <h1 onClick={() => startEdit("job_name", job.job_name)}
                className="text-xl font-bold text-navy cursor-pointer hover:text-starlight-blue transition-colors group flex items-center gap-1.5">
                {job.job_name || "Untitled Job"}
                <Pencil className="h-3.5 w-3.5 text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
              </h1>
            )}

            {/* Client — editable */}
            {editingField === "client_name" ? (
              <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveJobField(); if (e.key === "Escape") cancelEdit(); }}
                onBlur={saveJobField} autoFocus
                className="text-sm text-muted w-full border-b border-starlight-blue bg-transparent outline-none" />
            ) : (
              <p onClick={() => startEdit("client_name", job.client_name)}
                className="text-sm text-muted cursor-pointer hover:text-navy transition-colors group flex items-center gap-1.5">
                {job.client_name || "No client"}
                <Pencil className="h-3 w-3 text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
            )}
          </div>
          <div className="text-right space-y-1 shrink-0 ml-4">
            <DaysRemainingBadge eventDate={job.event_date} />

            {/* Event date — editable */}
            {editingField === "event_date" ? (
              <input type="date" value={editValue} onChange={e => { setEditValue(e.target.value); }}
                onKeyDown={e => { if (e.key === "Escape") cancelEdit(); }}
                onBlur={saveJobField} autoFocus
                className="text-sm text-muted border-b border-starlight-blue bg-transparent outline-none text-right" />
            ) : (
              <p onClick={() => startEdit("event_date", job.event_date)}
                className="text-sm text-muted cursor-pointer hover:text-navy transition-colors group flex items-center justify-end gap-1.5">
                {formatDate(job.event_date)}
                <Pencil className="h-3 w-3 text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
            )}

            {/* Location — editable */}
            {editingField === "event_location" ? (
              <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveJobField(); if (e.key === "Escape") cancelEdit(); }}
                onBlur={saveJobField} autoFocus
                className="text-xs text-muted w-48 border-b border-starlight-blue bg-transparent outline-none text-right" />
            ) : job.event_location ? (
              <p onClick={() => startEdit("event_location", job.event_location)}
                className="text-xs text-muted cursor-pointer hover:text-navy transition-colors group flex items-center justify-end gap-1">
                {job.event_location}
                <Pencil className="h-2.5 w-2.5 text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
            ) : (
              <button onClick={() => startEdit("event_location", "")}
                className="text-xs text-faint hover:text-muted transition-colors">+ Location</button>
            )}
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Total Lines</p>
          <p className="text-lg font-semibold text-navy">{lines.length}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Quote Value</p>
          <p className="text-lg font-semibold text-navy">{formatCurrency(totalValue)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Interpreted</p>
          <p className="text-lg font-semibold text-navy">
            {doneCount}/{lines.length}
            <span className="text-xs font-normal text-muted ml-1">lines done</span>
          </p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">Value Covered</p>
          <p className="text-lg font-semibold text-navy">{formatCurrency(doneValue)}</p>
        </div>
      </div>

      {/* Reports — outbound deliverables for this job */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={`/reports/handover/${jobId}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-surface border border-subtle rounded-lg hover:bg-surface-mid hover:border-navy/30 transition-all text-navy"
          title="Printable handover summary — zone by zone, with drawings, WOs, and QR codes"
        >
          <Printer className="h-4 w-4" /> Handover Summary
        </Link>
        <Link
          href={`/reports/handover/${jobId}/edit`}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-surface border border-subtle rounded-lg hover:bg-surface-mid hover:border-navy/30 transition-all text-muted hover:text-navy"
          title="Edit the handover — zone order, notes and drawings"
        >
          <FileText className="h-4 w-4" /> Edit Handover
        </Link>
        <Link
          href={`/reports/load-list/${jobId}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-surface border border-subtle rounded-lg hover:bg-surface-mid hover:border-navy/30 transition-all text-navy"
        >
          <Package className="h-4 w-4" /> Load List
        </Link>
      </div>

      {/* Needs action alert */}
      {needsActionCount > 0 && (
        <div className="bg-starlight-amber/10 border border-starlight-amber/20 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-starlight-amber animate-pulse" />
          <p className="text-sm text-starlight-amber">
            <span className="font-semibold">{needsActionCount}</span> lines need
            attention (scope, contractor, or decision required)
          </p>
        </div>
      )}

      {/* Job Cost Analysis (stays full-width, always visible) */}
      <CostBreakdown jobId={jobId} quotedValue={totalValue || undefined} />

      {/* Compact tool row — one button per section, click to expand below.
          Replaces the stacked panel tower that used to push quote lines down. */}
      {(() => {
        const c = headerCounts;
        const tools: {
          key: NonNullable<typeof activeTool>;
          icon: any;
          label: string;
          badge: string | null;
          warning: boolean;
        }[] = [
          {
            key: "queries",
            icon: MessageCircleQuestion,
            label: "PM Queries",
            badge: c && c.pm_queries_open > 0 ? String(c.pm_queries_open) : null,
            warning: !!(c && c.pm_queries_open > 0),
          },
          {
            key: "orders",
            icon: ShoppingCart,
            label: "Orders",
            badge: c && c.orders_outstanding > 0 ? `${c.orders_outstanding} out` : null,
            warning: !!(c && c.orders_outstanding > 0),
          },
          {
            key: "invoices",
            icon: FileText,
            label: "Invoices",
            badge: c && c.invoices_unallocated > 0
              ? `£${Number(c.invoices_unallocated).toLocaleString("en-GB", { maximumFractionDigits: 0 })} unalloc`
              : (c && c.invoices_count > 0 ? String(c.invoices_count) : null),
            warning: !!(c && c.invoices_unallocated > 0),
          },
          {
            key: "documents",
            icon: FolderOpen,
            label: "Documents",
            badge: c && c.documents_count > 0 ? String(c.documents_count) : null,
            warning: false,
          },
          {
            key: "learnings",
            icon: BookOpen,
            label: "Learnings",
            badge: c && c.learnings_open > 0 ? `${c.learnings_open} open` : (c && c.learnings_total > 0 ? String(c.learnings_total) : null),
            warning: !!(c && c.learnings_open > 0),
          },
        ];

        return (
          <div className="card overflow-hidden">
            {/* Button row */}
            <div className="flex flex-wrap border-b border-subtle">
              {tools.map((t, i) => {
                const active = activeTool === t.key;
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTool(active ? null : t.key)}
                    className={
                      "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors flex-1 min-w-[160px] " +
                      (i > 0 ? "border-l border-subtle " : "") +
                      (active
                        ? "bg-navy/5 text-navy"
                        : "text-muted hover:bg-surface-dim hover:text-navy")
                    }
                  >
                    <Icon className={"h-4 w-4 shrink-0 " + (active ? "text-starlight-red" : "")} />
                    <span className="truncate">{t.label}</span>
                    {t.badge && (
                      <span
                        className={
                          "ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap " +
                          (t.warning
                            ? "bg-starlight-amber/15 text-starlight-amber"
                            : "bg-surface-mid text-muted")
                        }
                      >
                        {t.badge}
                      </span>
                    )}
                    {!t.badge && t.warning && (
                      <AlertCircle className="h-3.5 w-3.5 text-starlight-amber ml-auto shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Expanded panel for the active tool */}
            {activeTool === "queries" && (
              <PmQueriesJobPanel jobId={jobId} jobName={job?.job_name || ""} defaultExpanded />
            )}
            {activeTool === "orders" && (
              <JobOrdersPanel jobId={jobId} defaultCollapsed={false} />
            )}
            {activeTool === "invoices" && (
              <JobInvoicesPanel jobId={jobId} defaultCollapsed={false} />
            )}
            {activeTool === "documents" && job && (
              <div className="p-4">
                <p className="text-xs text-muted mb-3">
                  Site plans, master CAD models, and reference material for the job as a whole. Scope- and WO-specific files live on their own pages.
                </p>
                <WODocumentsPanel
                  jobId={jobId}
                  jobNumber={job.job_number || ""}
                  jobName={job.job_name || ""}
                />
              </div>
            )}
            {activeTool === "learnings" && job && (
              <LearningsSection
                filterField="job_id"
                filterValue={jobId}
                context={{
                  job_id: jobId,
                  contextLabel: `Job ${job.job_number || jobId} — ${job.job_name || ""}`.trim(),
                  contextSublabel: job.client_name || undefined,
                }}
                defaultCollapsed={false}
              />
            )}
          </div>
        );
      })()}

      {/* Main tabs: Quote Lines / Scope Items */}
      <div className="flex gap-1 border-b border-subtle">
        <button
          onClick={() => setActiveTab("lines")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "lines"
              ? "border-starlight-red text-navy"
              : "border-transparent text-muted hover:text-muted"
          }`}
        >
          Quote Lines ({lines.length})
        </button>
        <button
          onClick={() => setActiveTab("scopes")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "scopes"
              ? "border-starlight-red text-navy"
              : "border-transparent text-muted hover:text-muted"
          }`}
        >
          Scope Items ({scopes.length})
        </button>
        <button
          onClick={() => setActiveTab("wo")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "wo"
              ? "border-starlight-red text-navy"
              : "border-transparent text-muted hover:text-muted"
          }`}
        >
          Work Orders ({woData.length})
        </button>
      </div>

      {/* TAB: Quote Lines */}
      {activeTab === "lines" && (
        <div className="space-y-3">
          {/* Filter pills */}
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="h-4 w-4 text-muted" />
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(activeFilter === f.key ? null : f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  activeFilter === f.key
                    ? f.color + " border-current"
                    : "bg-surface text-muted border-subtle hover:border-subtle"
                }`}
              >
                {f.label} ({filterCounts[f.key]})
              </button>
            ))}
            <button
              onClick={() => setActiveFilter(activeFilter === "zone" ? null : "zone")}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeFilter === "zone"
                  ? "bg-navy/10 text-navy border-navy/30"
                  : "bg-surface text-muted border-subtle hover:border-subtle"
              }`}
            >
              By Zone ({filterCounts.zone})
            </button>
            <button
              onClick={() => setActiveFilter(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeFilter === null
                  ? "bg-navy text-white border-navy"
                  : "bg-surface text-muted border-subtle hover:border-subtle"
              }`}
            >
              All ({lines.length})
            </button>
          </div>

          {/* Table — zone grouped or flat */}
          {activeFilter === "zone" && zoneGroups ? (
            // ZONE GROUPED VIEW
            <div className="space-y-4">
              {Object.entries(zoneGroups).map(([zone, zoneLines]) => (
                <div key={zone}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-navy">{zone}</h3>
                    <span className="text-xs text-muted">
                      ({zoneLines.length} lines &middot; {formatCurrency(zoneLines.reduce((s, l) => s + (l.line_value || 0), 0))})
                    </span>
                  </div>
                  <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        {tableHead}
                        <tbody>{zoneLines.map(renderLineRow)}</tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // FLAT VIEW (with or without filter)
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {tableHead}
                  <tbody>
                    {filteredLines.map(renderLineRow)}
                    {filteredLines.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-muted text-sm">
                          No lines match this filter
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ADD LINE — button + inline form */}
          {!showAddLine ? (
            <button
              onClick={() => setShowAddLine(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-starlight-red border-2 border-dashed border-starlight-red/30 rounded-lg hover:bg-starlight-red/10/50 hover:border-starlight-red/50 transition-colors w-full justify-center"
            >
              <Plus className="h-4 w-4" />
              Add Quote Line
            </button>
          ) : (
            <div className="card px-5 py-4 border-2 border-starlight-blue/30 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy">New Quote Line</h3>
                <button onClick={() => setShowAddLine(false)} className="text-muted hover:text-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Description <span className="text-starlight-red">*</span></label>
                <textarea
                  value={newLine.line_text}
                  onChange={(e) => setNewLine({ ...newLine, line_text: e.target.value })}
                  placeholder="What needs to be built or supplied..."
                  rows={2} autoFocus
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Qty</label>
                  <input type="number" step="1" value={newLine.quantity}
                    onChange={(e) => {
                      const q = e.target.value;
                      const up = newLine.unit_price;
                      const autoVal = (q && up) ? String(Math.round(parseFloat(q) * parseFloat(up) * 100) / 100) : newLine.line_value;
                      setNewLine({ ...newLine, quantity: q, line_value: autoVal });
                    }}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Unit Price</label>
                  <input type="number" step="0.01" value={newLine.unit_price}
                    onChange={(e) => {
                      const up = e.target.value;
                      const q = newLine.quantity;
                      const autoVal = (q && up) ? String(Math.round(parseFloat(q) * parseFloat(up) * 100) / 100) : newLine.line_value;
                      setNewLine({ ...newLine, unit_price: up, line_value: autoVal });
                    }}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Total Value</label>
                  <input type="number" step="0.01" value={newLine.line_value}
                    onChange={(e) => setNewLine({ ...newLine, line_value: e.target.value })}
                    placeholder="0.00"
                    className={`w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue ${newLine.quantity && newLine.unit_price ? "bg-surface-dim text-muted" : ""}`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Zone</label>
                  <input type="text" value={newLine.event_zone}
                    onChange={(e) => setNewLine({ ...newLine, event_zone: e.target.value })}
                    placeholder="e.g. Entrance"
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Sub-group</label>
                  <input type="text" value={newLine.line_sub_group}
                    onChange={(e) => setNewLine({ ...newLine, line_sub_group: e.target.value })}
                    placeholder="e.g. Décor"
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Category</label>
                  <LookupCombo category="QUOTE_LINE_CATEGORY" value={newLine.category}
                    onChange={(val) => setNewLine({ ...newLine, category: val || "Workshop Build" })}
                    className="w-full text-xs" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setShowAddLine(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors">Cancel</button>
                <button onClick={handleAddLine} disabled={addingSaving || !newLine.line_text.trim()}
                  className="px-5 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {addingSaving ? "Adding..." : "Add Line"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Scope Items */}
      {activeTab === "scopes" && (
        <div className="space-y-3">
          {scopes.length === 0 ? (
            <div className="card px-6 py-10 text-center text-muted text-sm">
              No scope items yet. Create one from the Quote Lines tab.
            </div>
          ) : (
            scopes.map((scope) => {
              const scopeLine = lines.find((l) => l.quote_line_id === scope.quote_line_id);
              const scopeTitle = scopeLine?.line_text || scope.item_name || "(unnamed)";
              const scopeWOs = woData.filter((w: any) => w.scope_item_id === scope.scope_item_id);
              const woComplete = scopeWOs.filter((w: any) => w.status === "Complete").length;

              return (
                <Link
                  key={scope.scope_item_id}
                  id={`scope-${scope.scope_item_id}`}
                  href={`/jobs/${jobId}/scope/${scope.scope_item_id}`}
                  className="card px-5 py-4 flex items-center gap-4 hover:shadow-md transition-shadow block scroll-mt-24"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-medium text-navy truncate">
                        {scopeTitle}
                      </h3>
                      <StatusBadge status={scope.status} />
                      {isTruthy(scope.is_general) && (
                        <span className="text-[10px] bg-surface-mid text-muted px-1.5 py-0.5 rounded">
                          General
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1.5 text-xs text-muted">
                      {scope.event_zone && <span>{scope.event_zone}</span>}
                      {scope.complexity_construction && (
                        <span>Complexity: {scope.complexity_construction}</span>
                      )}
                      {scopeWOs.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Hammer className="h-3 w-3" />
                          {woComplete}/{scopeWOs.length} WOs
                        </span>
                      )}
                      {scopeLine?.line_value && (
                        <span className="font-mono">{formatCurrency(scopeLine.line_value)}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-faint shrink-0" />
                </Link>
              );
            })
          )}
        </div>
      )}

      {/* TAB: Work Orders (all across scope items) */}
      {activeTab === "wo" && (
        <div className="space-y-2">
          {woData.length === 0 ? (
            <div className="card px-6 py-10 text-center text-muted text-sm">
              No work orders yet. Create them from within Scope Items.
            </div>
          ) : (
            woData.map((wo: any) => (
              <Link
                key={wo.work_order_id}
                id={`wo-${wo.work_order_id}`}
                href={`/jobs/${jobId}/scope/${wo.scope_item_id}?expand=${wo.work_order_id}`}
                className="card px-5 py-3.5 flex items-center gap-4 hover:shadow-md transition-shadow block scroll-mt-24"
              >
                <div className="flex flex-col items-center w-12 shrink-0">
                  <span className="text-xs font-semibold text-navy">{wo.wo_sequence || "?"}/{wo.scope_total_wos}</span>
                  {wo.prev_wo_status !== null ? (
                    <span className={"text-[9px] " + (
                      wo.prev_wo_status === "Complete" ? "text-starlight-green" :
                      wo.prev_wo_status === "In-Progress" ? "text-starlight-blue" : "text-muted"
                    )}>
                      {wo.prev_wo_status === "Complete" ? "prev: done" :
                       wo.prev_wo_status === "In-Progress" ? "prev: active" : "prev: wait"}
                    </span>
                  ) : wo.wo_sequence === 1 ? (
                    <span className="text-[9px] text-faint">first</span>
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy truncate">{wo.activity_label}</p>
                  <p className="text-xs text-muted truncate mt-0.5">
                    {wo.scope_name}
                    {wo.description ? ` — ${wo.description}` : ""}
                  </p>
                </div>
                <div className="text-right w-14 shrink-0">
                  <p className="text-sm font-mono text-navy">
                    {wo.estimated_duration_hrs != null ? `${wo.estimated_duration_hrs}h` : "—"}
                  </p>
                </div>
                <StatusBadge status={wo.status} />
              </Link>
            ))
          )}
        </div>
      )}

      {/* Scope creation dialog */}
      {scopeDialogLine && (
        <CreateScopeDialog
          jobId={jobId}
          quoteLine={scopeDialogLine}
          onClose={() => setScopeDialogLine(null)}
          onCreated={handleScopeCreated}
        />
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

      {/* Complete-job dialog */}
      {showCompleteDialog && job && (
        <JobCompleteDialog
          jobId={job.job_id}
          jobNumber={job.job_number || ""}
          jobName={job.job_name || ""}
          onClose={() => setShowCompleteDialog(false)}
          onCompleted={() => {
            setShowCompleteDialog(false);
            // The dialog navigates to the report; reload here ensures the job
            // page reflects Complete state if the user navigates back.
            loadData();
          }}
        />
      )}
    </div>
  );
}
