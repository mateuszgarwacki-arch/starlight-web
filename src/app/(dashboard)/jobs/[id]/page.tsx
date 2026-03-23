"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency } from "@/lib/utils";
import { DaysRemainingBadge, StatusBadge } from "@/components/ui/badges";
import { LookupCombo } from "@/components/ui/lookup-combo";
import { CreateScopeDialog } from "@/components/create-scope-dialog";
import { ContractorPicker } from "@/components/contractor-picker";
import { CostBreakdown } from "@/components/cost-breakdown";
import { ArrowLeft, Plus, Check, FileText, ChevronRight, Package, Filter, Hammer, Trash2, Pencil, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
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
  "Stock Pick":                { canCreateScope: false, showAmber: false, showContractor: false, showStockTag: true,  showDoneCheckbox: true,  autoComplete: "manual" },
  "Subcontracted":             { canCreateScope: false, showAmber: false, showContractor: true,  showStockTag: false, showDoneCheckbox: true,  autoComplete: "contractor" },
  "Subcontracted (Partial)":   { canCreateScope: true,  showAmber: true,  showContractor: true,  showStockTag: false, showDoneCheckbox: true,  autoComplete: "scope+contractor" },
  "Install":                   { canCreateScope: false, showAmber: false, showContractor: false, showStockTag: false, showDoneCheckbox: true,  autoComplete: "manual" },
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
type FilterKey = "workshop" | "provisional" | "subcontracted" | "done" | "zone";

interface FilterDef {
  key: FilterKey;
  label: string;
  filter: (line: QuoteLine, scopes: ScopeItem[], contractorMap: Record<number, any>) => boolean;
  color: string;
}

const FILTERS: FilterDef[] = [
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
    color: "bg-gray-100 text-gray-600 border-gray-200",
  },
  {
    key: "subcontracted",
    label: "Subcontracted",
    filter: (l) => ["Subcontracted", "Subcontracted (Partial)"].includes(l.category || ""),
    color: "bg-starlight-blue/10 text-starlight-blue border-starlight-blue/30",
  },
  {
    key: "done",
    label: "Done",
    filter: (l) => isTruthy(l.interpretation_complete),
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
  const [activeTab, setActiveTab] = useState<"lines" | "scopes" | "wo">("lines");
  const [woData, setWoData] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterKey | "zone" | null>(null);
  const [scopeDialogLine, setScopeDialogLine] = useState<QuoteLine | null>(null);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  // --- ADD LINE state ---
  const [showAddLine, setShowAddLine] = useState(false);
  const [newLine, setNewLine] = useState({ line_text: "", line_value: "", quantity: "", unit_price: "", event_zone: "", line_sub_group: "", category: "Workshop Build" });
  const [addingSaving, setAddingSaving] = useState(false);

  // --- INLINE EDIT state ---
  const [editingLineCell, setEditingLineCell] = useState<{ lineId: number; field: string } | null>(null);
  const [editLineCellValue, setEditLineCellValue] = useState("");

  const loadData = useCallback(async () => {
    const [jobRes, quotesRes, linesRes, scopesRes, contractorRes] = await Promise.all([
      supabase.from("tbl_production_plan").select("*").eq("job_id", jobId).single(),
      supabase.from("tbl_quotes").select("*").eq("job_id", jobId),
      supabase.from("tbl_quote_lines").select("*").eq("job_id", jobId).order("import_sequence"),
      supabase.from("tbl_scope_items").select("*").eq("job_id", jobId).order("created_at"),
      supabase.from("qry_quote_lines_with_contractors").select("quote_line_id, contractor_id, contractor_name, contractor_quote_value, contractor_description").eq("job_id", jobId),
    ]);

    if (jobRes.data) setJob(jobRes.data);
    if (quotesRes.data) setQuotes(quotesRes.data);
    if (linesRes.data) setLines(linesRes.data);
    if (scopesRes.data) setScopes(scopesRes.data);

    // Load WO data with activity labels
    const { data: wos } = await supabase
      .from("qry_wo_phase_ordered")
      .select("*")
      .eq("job_id", jobId);

    if (wos && wos.length > 0) {
      // Enrich with activity junction labels + scope names
      const woIds = wos.map((w: any) => w.work_order_id);
      const scopeIds = [...new Set(wos.map((w: any) => w.scope_item_id).filter(Boolean))];

      const [actRes, lookupRes] = await Promise.all([
        supabase.from("tbl_wo_activities").select("work_order_id, activity_id, sequence").in("work_order_id", woIds).order("sequence"),
        supabase.from("tbl_master_lookups").select("lookup_id, lookup_value, phase_number").eq("category", "ACTIVITY"),
      ]);

      const lkMap: Record<number, { v: string; p: number | null }> = {};
      (lookupRes.data || []).forEach((l: any) => { lkMap[l.lookup_id] = { v: l.lookup_value, p: l.phase_number }; });

      const actByWO: Record<number, any[]> = {};
      (actRes.data || []).forEach((a: any) => {
        if (!actByWO[a.work_order_id]) actByWO[a.work_order_id] = [];
        actByWO[a.work_order_id].push(a);
      });

      const scopeMap: Record<number, string> = {};
      if (scopesRes.data) {
        scopesRes.data.forEach((s: any) => {
          const line = linesRes.data?.find((l: any) => l.quote_line_id === s.quote_line_id);
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

    if (contractorRes.data) {
      const map: Record<number, ContractorInfo> = {};
      contractorRes.data.forEach((row: any) => {
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

  // ================================================================
  // AUTO-TICK LOGIC — check if a line should be auto-completed
  // ================================================================
  function isAutoComplete(line: QuoteLine): boolean {
    const config = getCategoryConfig(line.category);
    const hasScope = scopes.some((s) => s.quote_line_id === line.quote_line_id && s.status !== "Cancelled-Cost-Retained");
    const hasContractor = !!contractorMap[line.quote_line_id];

    switch (config.autoComplete) {
      case "scope": return hasScope;
      case "contractor": return hasContractor;
      case "scope+contractor": return hasScope && hasContractor;
      case "manual": return false; // only manual tick
      case "never": return false;
      default: return false;
    }
  }

  // Derived "done" status: manual tick OR auto-complete
  function isDone(line: QuoteLine): boolean {
    return isTruthy(line.interpretation_complete) || isAutoComplete(line);
  }

  // ================================================================
  // JOB HEADER EDITING
  // ================================================================
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (field: string, currentValue: string | null) => {
    setEditingField(field);
    setEditValue(currentValue || "");
  };

  const saveJobField = async () => {
    if (!editingField || !job) return;
    const val = editValue.trim() || null;
    await supabase.from("tbl_production_plan").update({ [editingField]: val }).eq("job_id", job.job_id);
    setJob({ ...job, [editingField]: val } as Job);
    setEditingField(null);
    setEditValue("");
  };

  const cancelEdit = () => { setEditingField(null); setEditValue(""); };

  // ================================================================
  // UPDATE HANDLERS
  // ================================================================
  const updateLine = async (lineId: number, field: string, value: string | null) => {
    const cellKey = `${lineId}-${field}`;
    setSavingCells((prev) => new Set(prev).add(cellKey));

    await supabase
      .from("tbl_quote_lines")
      .update({ [field]: value })
      .eq("quote_line_id", lineId);

    setLines((prev) =>
      prev.map((l) => (l.quote_line_id === lineId ? { ...l, [field]: value } : l))
    );

    setSavingCells((prev) => {
      const next = new Set(prev);
      next.delete(cellKey);
      return next;
    });
  };

  const toggleInterpretation = async (line: QuoteLine) => {
    const newVal = isTruthy(line.interpretation_complete) ? "false" : "true";
    await updateLine(line.quote_line_id, "interpretation_complete", newVal);
  };

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

    const { error } = await supabase.from("tbl_quote_lines").insert({
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
      interpretation_complete: "false",
    });

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

    toast.success("Line deleted");
    setLines(prev => prev.filter(l => l.quote_line_id !== line.quote_line_id));
  };

  // ================================================================
  // INLINE EDIT (description & value)
  // ================================================================
  const startLineEdit = (lineId: number, field: string, currentValue: string | number | null) => {
    setEditingLineCell({ lineId, field });
    setEditLineCellValue(String(currentValue ?? ""));
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
  };

  const cancelLineEdit = () => { setEditingLineCell(null); setEditLineCellValue(""); };

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
  const filterCounts = {
    workshop: lines.filter((l) => FILTERS[0].filter(l, scopes, contractorMap)).length,
    provisional: lines.filter((l) => FILTERS[1].filter(l, scopes, contractorMap)).length,
    subcontracted: lines.filter((l) => FILTERS[2].filter(l, scopes, contractorMap)).length,
    done: doneCount,
    zone: new Set(lines.map((l) => l.event_zone || "No Zone")).size,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">
        Loading job...
      </div>
    );
  }

  if (!job) {
    return <div className="text-center py-12 text-gray-400">Job not found</div>;
  }

  // ================================================================
  // RENDER A SINGLE QUOTE LINE ROW
  // ================================================================
  function renderLineRow(line: QuoteLine) {
    const config = getCategoryConfig(line.category);
    const lineIsDone = isDone(line);
    const isAutoCompleted = isAutoComplete(line);
    const isManuallyDone = isTruthy(line.interpretation_complete);
    const isUninterpreted = config.showAmber && !lineIsDone;
    const hasScope = scopes.some((s) => s.quote_line_id === line.quote_line_id && s.status !== "Cancelled-Cost-Retained");
    const contractorInfo = contractorMap[line.quote_line_id];

    return (
      <tr
        key={line.quote_line_id}
        className={`border-t border-gray-100 transition-colors ${
          isUninterpreted
            ? "bg-amber-50/60 border-l-4 border-l-starlight-amber"
            : lineIsDone
            ? "bg-green-50/20"
            : ""
        }`}
      >
        {/* Line number */}
        <td className="px-3 py-2.5 font-mono text-xs text-gray-400">
          {line.line_number}
        </td>

        {/* Zone */}
        <td className="px-3 py-2.5 text-xs text-gray-500">
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
              className="w-full px-2 py-1 text-sm border border-starlight-blue rounded bg-white focus:outline-none focus:ring-1 focus:ring-starlight-blue"
            />
          ) : (
            <p onClick={() => startLineEdit(line.quote_line_id, "line_text", line.line_text)}
              className="text-sm text-gray-700 leading-relaxed cursor-pointer hover:bg-blue-50/50 rounded px-1 -mx-1 transition-colors group">
              {line.line_text || <span className="text-gray-300 italic">Click to add description</span>}
              <Pencil className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 inline ml-1.5 transition-opacity" />
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
            className="mt-1 w-full px-2 py-1 text-xs border-0 border-b border-transparent hover:border-gray-200 focus:border-starlight-blue focus:outline-none bg-transparent text-gray-500 placeholder:text-gray-300"
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
              <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded">
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
              autoFocus className="w-16 px-2 py-1 text-sm text-center border border-starlight-blue rounded bg-white focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
          ) : (
            <span onClick={() => startLineEdit(line.quote_line_id, "quantity", line.quantity)}
              className="inline-block min-w-[2rem] px-1 py-0.5 text-sm tabular-nums cursor-pointer hover:bg-blue-50 rounded transition-colors text-gray-700">
              {line.quantity != null ? line.quantity : <span className="text-gray-300">—</span>}
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
              autoFocus className="w-20 px-2 py-1 text-sm text-right border border-starlight-blue rounded bg-white focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
          ) : (
            <span onClick={() => startLineEdit(line.quote_line_id, "unit_price", line.unit_price)}
              className="text-sm tabular-nums cursor-pointer hover:text-starlight-blue transition-colors text-gray-500">
              {line.unit_price != null ? formatCurrency(line.unit_price) : <span className="text-gray-300">—</span>}
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
              autoFocus className="w-24 px-2 py-1 text-sm text-right border border-starlight-blue rounded bg-white focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
          ) : (
            <span onClick={() => startLineEdit(line.quote_line_id, "line_value", line.line_value)}
              className="font-medium text-gray-700 tabular-nums cursor-pointer hover:text-starlight-blue transition-colors">
              {line.line_value ? formatCurrency(line.line_value) : <span className="text-gray-300">—</span>}
            </span>
          )}
        </td>

        {/* Done — hybrid: shows auto-tick state + manual override */}
        <td className="px-3 py-2.5 text-center">
          {config.showDoneCheckbox ? (
            <button
              onClick={() => toggleInterpretation(line)}
              title={
                isAutoCompleted && !isManuallyDone
                  ? "Auto-completed (click to manually override)"
                  : isManuallyDone
                  ? "Manually marked done (click to undo)"
                  : "Mark as done"
              }
              className={`w-6 h-6 rounded-md border-2 inline-flex items-center justify-center transition-all ${
                lineIsDone
                  ? isAutoCompleted && !isManuallyDone
                    ? "bg-starlight-green/60 border-starlight-green/60 text-white"
                    : "bg-starlight-green border-starlight-green text-white"
                  : "border-gray-300 hover:border-starlight-amber"
              }`}
            >
              {lineIsDone && <Check className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="text-gray-300">&mdash;</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5">
          {config.canCreateScope && !hasScope && (
            <button
              onClick={() => setScopeDialogLine(line)}
              title="Create Scope Item from this line"
              className="p-1.5 text-starlight-red hover:bg-red-50 rounded-md transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          {hasScope && (
            <a
              href={`/jobs/${jobId}/scope/${scopes.find(s => s.quote_line_id === line.quote_line_id)?.scope_item_id}`}
              title="Open scope item"
              className="inline-flex items-center text-starlight-green hover:text-green-700 transition-colors"
            >
              <FileText className="h-4 w-4" />
            </a>
          )}
          {!hasScope && (
            <button
              onClick={() => handleDeleteLine(line)}
              title="Delete line"
              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </td>
      </tr>
    );
  }

  // ================================================================
  // TABLE HEADER
  // ================================================================
  const tableHead = (
    <thead>
      <tr className="bg-starlight-bg text-left">
        <th className="px-3 py-2.5 font-medium text-gray-500 w-12">#</th>
        <th className="px-3 py-2.5 font-medium text-gray-500 w-24">Zone</th>
        <th className="px-3 py-2.5 font-medium text-gray-500">Description</th>
        <th className="px-3 py-2.5 font-medium text-gray-500 w-52">Category</th>
        <th className="px-3 py-2.5 font-medium text-gray-500 w-16 text-center">Qty</th>
        <th className="px-3 py-2.5 font-medium text-gray-500 w-24 text-right">Unit Price</th>
        <th className="px-3 py-2.5 font-medium text-gray-500 w-24 text-right">Value</th>
        <th className="px-3 py-2.5 font-medium text-gray-500 w-16 text-center">Done</th>
        <th className="px-3 py-2.5 font-medium text-gray-500 w-16"></th>
      </tr>
    </thead>
  );

  // ================================================================
  // MAIN RENDER
  // ================================================================
  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-navy transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All Jobs
      </Link>

      {/* Job header — editable */}
      <div className="card px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-xs text-gray-400 font-mono">{job.job_number}</p>

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
                <Pencil className="h-3.5 w-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h1>
            )}

            {/* Client — editable */}
            {editingField === "client_name" ? (
              <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveJobField(); if (e.key === "Escape") cancelEdit(); }}
                onBlur={saveJobField} autoFocus
                className="text-sm text-gray-500 w-full border-b border-starlight-blue bg-transparent outline-none" />
            ) : (
              <p onClick={() => startEdit("client_name", job.client_name)}
                className="text-sm text-gray-500 cursor-pointer hover:text-navy transition-colors group flex items-center gap-1.5">
                {job.client_name || "No client"}
                <Pencil className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
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
                className="text-sm text-gray-500 border-b border-starlight-blue bg-transparent outline-none text-right" />
            ) : (
              <p onClick={() => startEdit("event_date", job.event_date)}
                className="text-sm text-gray-500 cursor-pointer hover:text-navy transition-colors group flex items-center justify-end gap-1.5">
                {formatDate(job.event_date)}
                <Pencil className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
            )}

            {/* Location — editable */}
            {editingField === "event_location" ? (
              <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveJobField(); if (e.key === "Escape") cancelEdit(); }}
                onBlur={saveJobField} autoFocus
                className="text-xs text-gray-400 w-48 border-b border-starlight-blue bg-transparent outline-none text-right" />
            ) : job.event_location ? (
              <p onClick={() => startEdit("event_location", job.event_location)}
                className="text-xs text-gray-400 cursor-pointer hover:text-navy transition-colors group flex items-center justify-end gap-1">
                {job.event_location}
                <Pencil className="h-2.5 w-2.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
            ) : (
              <button onClick={() => startEdit("event_location", "")}
                className="text-xs text-gray-300 hover:text-gray-500 transition-colors">+ Location</button>
            )}
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Total Lines</p>
          <p className="text-lg font-semibold text-navy">{lines.length}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Quote Value</p>
          <p className="text-lg font-semibold text-navy">{formatCurrency(totalValue)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Interpreted</p>
          <p className="text-lg font-semibold text-navy">
            {doneCount}/{lines.length}
            <span className="text-xs font-normal text-gray-400 ml-1">lines done</span>
          </p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Value Covered</p>
          <p className="text-lg font-semibold text-navy">{formatCurrency(doneValue)}</p>
        </div>
      </div>

      {/* Needs action alert */}
      {needsActionCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-starlight-amber animate-pulse" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{needsActionCount}</span> lines need
            attention (scope, contractor, or decision required)
          </p>
        </div>
      )}

      {/* Job Cost Analysis */}
      <CostBreakdown jobId={jobId} quotedValue={totalValue || undefined} />

      {/* Main tabs: Quote Lines / Scope Items */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("lines")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "lines"
              ? "border-starlight-red text-navy"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Quote Lines ({lines.length})
        </button>
        <button
          onClick={() => setActiveTab("scopes")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "scopes"
              ? "border-starlight-red text-navy"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Scope Items ({scopes.length})
        </button>
        <button
          onClick={() => setActiveTab("wo")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "wo"
              ? "border-starlight-red text-navy"
              : "border-transparent text-gray-400 hover:text-gray-600"
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
            <Filter className="h-4 w-4 text-gray-400" />
            <button
              onClick={() => setActiveFilter(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeFilter === null
                  ? "bg-navy text-white border-navy"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
            >
              All ({lines.length})
            </button>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(activeFilter === f.key ? null : f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  activeFilter === f.key
                    ? f.color + " border-current"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
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
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
            >
              By Zone ({filterCounts.zone})
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
                    <span className="text-xs text-gray-400">
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
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
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
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-starlight-red border-2 border-dashed border-starlight-red/30 rounded-lg hover:bg-red-50/50 hover:border-starlight-red/50 transition-colors w-full justify-center"
            >
              <Plus className="h-4 w-4" />
              Add Quote Line
            </button>
          ) : (
            <div className="card px-5 py-4 border-2 border-starlight-blue/30 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy">New Quote Line</h3>
                <button onClick={() => setShowAddLine(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description <span className="text-starlight-red">*</span></label>
                <textarea
                  value={newLine.line_text}
                  onChange={(e) => setNewLine({ ...newLine, line_text: e.target.value })}
                  placeholder="What needs to be built or supplied..."
                  rows={2} autoFocus
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
                  <input type="number" step="1" value={newLine.quantity}
                    onChange={(e) => {
                      const q = e.target.value;
                      const up = newLine.unit_price;
                      const autoVal = (q && up) ? String(Math.round(parseFloat(q) * parseFloat(up) * 100) / 100) : newLine.line_value;
                      setNewLine({ ...newLine, quantity: q, line_value: autoVal });
                    }}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Unit Price</label>
                  <input type="number" step="0.01" value={newLine.unit_price}
                    onChange={(e) => {
                      const up = e.target.value;
                      const q = newLine.quantity;
                      const autoVal = (q && up) ? String(Math.round(parseFloat(q) * parseFloat(up) * 100) / 100) : newLine.line_value;
                      setNewLine({ ...newLine, unit_price: up, line_value: autoVal });
                    }}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Total Value</label>
                  <input type="number" step="0.01" value={newLine.line_value}
                    onChange={(e) => setNewLine({ ...newLine, line_value: e.target.value })}
                    placeholder="0.00"
                    className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue ${newLine.quantity && newLine.unit_price ? "bg-gray-50 text-gray-400" : ""}`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Zone</label>
                  <input type="text" value={newLine.event_zone}
                    onChange={(e) => setNewLine({ ...newLine, event_zone: e.target.value })}
                    placeholder="e.g. Entrance"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Sub-group</label>
                  <input type="text" value={newLine.line_sub_group}
                    onChange={(e) => setNewLine({ ...newLine, line_sub_group: e.target.value })}
                    placeholder="e.g. Décor"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                  <LookupCombo category="QUOTE_LINE_CATEGORY" value={newLine.category}
                    onChange={(val) => setNewLine({ ...newLine, category: val || "Workshop Build" })}
                    className="w-full text-xs" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setShowAddLine(false)}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                <button onClick={handleAddLine} disabled={addingSaving || !newLine.line_text.trim()}
                  className="px-5 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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
            <div className="card px-6 py-10 text-center text-gray-400 text-sm">
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
                  href={`/jobs/${jobId}/scope/${scope.scope_item_id}`}
                  className="card px-5 py-4 flex items-center gap-4 hover:shadow-md transition-shadow block"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-medium text-navy truncate">
                        {scopeTitle}
                      </h3>
                      <StatusBadge status={scope.status} />
                      {isTruthy(scope.is_general) && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          General
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
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
                  <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" />
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
            <div className="card px-6 py-10 text-center text-gray-400 text-sm">
              No work orders yet. Create them from within Scope Items.
            </div>
          ) : (
            woData.map((wo: any) => (
              <Link
                key={wo.work_order_id}
                href={`/jobs/${jobId}/scope/${wo.scope_item_id}/wo`}
                className="card px-5 py-3.5 flex items-center gap-4 hover:shadow-md transition-shadow block"
              >
                <div className="flex flex-col items-center w-12 shrink-0">
                  <span className="text-xs font-semibold text-navy">{wo.wo_sequence || "?"}/{wo.scope_total_wos}</span>
                  {wo.prev_wo_status !== null ? (
                    <span className={"text-[9px] " + (
                      wo.prev_wo_status === "Complete" ? "text-starlight-green" :
                      wo.prev_wo_status === "In-Progress" ? "text-starlight-blue" : "text-gray-400"
                    )}>
                      {wo.prev_wo_status === "Complete" ? "prev: done" :
                       wo.prev_wo_status === "In-Progress" ? "prev: active" : "prev: wait"}
                    </span>
                  ) : wo.wo_sequence === 1 ? (
                    <span className="text-[9px] text-gray-300">first</span>
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy truncate">{wo.activity_label}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
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
    </div>
  );
}
