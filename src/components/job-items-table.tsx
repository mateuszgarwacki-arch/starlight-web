"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import {
  Plus, Trash2, CheckCircle2, Circle, Search, X,
  Warehouse, Paintbrush, ArrowUpCircle, MapPin, Link2, Wrench,
} from "lucide-react";
import { toast } from "sonner";

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

interface JobItemsTableProps {
  jobId: number;
  scopeItemId: number;
  onSelectionChange: (selectedIds: number[]) => void;
}

export function JobItemsTable({ jobId, scopeItemId, onSelectionChange }: JobItemsTableProps) {
  const supabase = createClient();
  const [items, setItems] = useState<JobItemRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  // Stock picker state
  const [showStockPicker, setShowStockPicker] = useState(false);
  const [stockSearch, setStockSearch] = useState("");
  const [stockResults, setStockResults] = useState<StockItemResult[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const stockDebounce = useRef<NodeJS.Timeout | null>(null);

  // Bespoke dialog state
  const [showBespokeDialog, setShowBespokeDialog] = useState(false);
  const [bespokeForm, setBespokeForm] = useState({ description: "", quantity: "1", finish_required: "", promote_to_stock: false, source_item_id: null as number | null });
  const [jobBespokeItems, setJobBespokeItems] = useState<{ item_id: number; description: string; quantity: number | null; finish_required: string | null; scope_name: string }[]>([]);

  // Source item scope name resolution
  const [sourceScopes, setSourceScopes] = useState<Record<number, string>>({});

  // BOM costs for stock items + scope-level material rows
  const [bomByItem, setBomByItem] = useState<Record<number, { bom_id: number; quantity: number; unit_cost: number; unit: string }>>({});
  const [materialRows, setMaterialRows] = useState<{ bom_id: number; item_description: string; quantity: number; unit: string; unit_cost: number; material_id: number | null }[]>([]);

  // Material search
  const [showMaterialSearch, setShowMaterialSearch] = useState(false);
  const [matQuery, setMatQuery] = useState("");
  const [matResults, setMatResults] = useState<{ material_id: number; material_name: string; unit: string; current_unit_cost: number | null }[]>([]);

  const loadItems = useCallback(async () => {
    const [itemsRes, bomRes] = await Promise.all([
      supabase.from("qry_jobitems_withcoverage").select("*").eq("scope_item_id", scopeItemId).order("item_id"),
      supabase.from("tbl_wo_bom").select("bom_id, job_item_id, item_description, quantity, unit, unit_cost, material_id, stock_item_id, scope_item_id, work_order_id")
        .eq("scope_item_id", scopeItemId).is("work_order_id", null),
    ]);
    if (itemsRes.data) setItems(itemsRes.data as JobItemRow[]);

    // Split BOM: item-linked (stock costs) vs standalone (materials)
    const byItem: Record<number, { bom_id: number; quantity: number; unit_cost: number; unit: string }> = {};
    const mats: typeof materialRows = [];
    for (const b of (bomRes.data || [])) {
      if (b.job_item_id) {
        byItem[b.job_item_id] = { bom_id: b.bom_id, quantity: b.quantity || 0, unit_cost: b.unit_cost || 0, unit: b.unit || "Each" };
      } else {
        mats.push({ bom_id: b.bom_id, item_description: b.item_description || "", quantity: b.quantity || 0, unit: b.unit || "Each", unit_cost: b.unit_cost || 0, material_id: b.material_id });
      }
    }
    setBomByItem(byItem);
    setMaterialRows(mats);
    setLoading(false);
  }, [scopeItemId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Resolve source_item_id → scope names for linked badges
  useEffect(() => {
    const resolve = async () => {
      const sourceIds = items.filter(i => i.source_item_id).map(i => i.source_item_id!);
      if (sourceIds.length === 0) { setSourceScopes({}); return; }
      const { data: srcItems } = await supabase
        .from("tbl_job_items")
        .select("item_id, scope_item_id")
        .in("item_id", sourceIds);
      if (!srcItems || srcItems.length === 0) return;
      const scopeIds = [...new Set(srcItems.map(s => s.scope_item_id).filter(Boolean))] as number[];
      if (scopeIds.length === 0) return;
      const { data: scopes } = await supabase
        .from("tbl_scope_items")
        .select("scope_item_id, item_name")
        .in("scope_item_id", scopeIds);
      const scopeMap: Record<number, string> = {};
      (scopes || []).forEach((s: any) => { scopeMap[s.scope_item_id] = s.item_name; });
      const result: Record<number, string> = {};
      srcItems.forEach((si: any) => {
        if (si.scope_item_id && scopeMap[si.scope_item_id]) {
          result[si.item_id] = scopeMap[si.scope_item_id];
        }
      });
      setSourceScopes(result);
    };
    resolve();
  }, [items]);
  useEffect(() => { onSelectionChange(Array.from(selected)); }, [selected]);

  // ============================================================
  // Stock picker search
  // ============================================================
  const searchStock = useCallback(async (query: string) => {
    if (query.length < 2) { setStockResults([]); return; }
    setStockLoading(true);
    const { data } = await supabase
      .from("tbl_stock_items")
      .select("stock_id, product_code, description, stock_quantity, location, hire_cost_day, thumbnail_url")
      .eq("active", true)
      .or(`description.ilike.%${query}%,product_code.ilike.%${query}%`)
      .order("description")
      .limit(30);
    setStockResults((data as StockItemResult[]) || []);
    setStockLoading(false);
  }, []);

  const handleStockSearch = (val: string) => {
    setStockSearch(val);
    if (stockDebounce.current) clearTimeout(stockDebounce.current);
    stockDebounce.current = setTimeout(() => searchStock(val), 150);
  };

  const loadJobBespokeItems = useCallback(async () => {
    const { data } = await supabase
      .from("tbl_job_items")
      .select("item_id, description, quantity, finish_required, scope_item_id")
      .eq("job_id", jobId)
      .neq("scope_item_id", scopeItemId)
      .eq("item_source", "bespoke")
      .order("item_id");
    if (!data || data.length === 0) { setJobBespokeItems([]); return; }
    const scopeIds = [...new Set(data.map(d => d.scope_item_id).filter(Boolean))];
    let scopeMap: Record<number, string> = {};
    if (scopeIds.length > 0) {
      const { data: scopes } = await supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds);
      (scopes || []).forEach((s: any) => { scopeMap[s.scope_item_id] = s.item_name; });
    }
    setJobBespokeItems(data.map(d => ({
      item_id: d.item_id,
      description: d.description || "",
      quantity: d.quantity,
      finish_required: d.finish_required,
      scope_name: d.scope_item_id ? (scopeMap[d.scope_item_id] || `Scope #${d.scope_item_id}`) : "General",
    })));
  }, [jobId, scopeItemId]);

  const addStockItem = async (stock: StockItemResult) => {
    const { data } = await supabase.from("tbl_job_items").insert({
      job_id: jobId, scope_item_id: scopeItemId,
      description: stock.description,
      stock_item_id: stock.stock_id,
      stock_reference: stock.product_code,
      item_source: "stock",
      item_type: "Stock",
      quantity: 1,
      kit_list_exported: "false", temp_selected: "false",
      created_at: new Date().toISOString(),
    }).select("item_id").single();
    if (data) {
      // Auto-create paired BOM row with hire cost
      await supabase.from("tbl_wo_bom").insert({
        scope_item_id: scopeItemId,
        job_id: jobId,
        job_item_id: data.item_id,
        stock_item_id: stock.stock_id,
        item_description: stock.description,
        quantity: 1,
        unit: "Day",
        unit_cost: stock.hire_cost_day || 0,
        needs_ordering: "false",
      });
      toast.success(`Added: ${stock.description}`);
      loadItems();
    }
  };

  const addBespokeItem = async () => {
    if (!bespokeForm.description.trim()) return;
    await supabase.from("tbl_job_items").insert({
      job_id: jobId, scope_item_id: scopeItemId,
      description: bespokeForm.description.trim(),
      item_source: "bespoke",
      item_type: "Bespoke",
      quantity: parseInt(bespokeForm.quantity) || 1,
      finish_required: bespokeForm.finish_required.trim() || null,
      notes: bespokeForm.promote_to_stock ? "PROMOTE_TO_STOCK" : null,
      source_item_id: bespokeForm.source_item_id || null,
      kit_list_exported: "false", temp_selected: "false",
      created_at: new Date().toISOString(),
    });
    toast.success("Bespoke item added");
    setBespokeForm({ description: "", quantity: "1", finish_required: "", promote_to_stock: false, source_item_id: null });
    setShowBespokeDialog(false);
    loadItems();
  };

  const deleteItem = async (itemId: number) => {
    // Delete paired BOM row first (FK constraint)
    await supabase.from("tbl_wo_bom").delete().eq("job_item_id", itemId);
    await supabase.from("tbl_job_items").delete().eq("item_id", itemId);
    setSelected((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
    loadItems();
  };

  const updateItem = async (itemId: number, field: string, value: any) => {
    await supabase.from("tbl_job_items").update({ [field]: value }).eq("item_id", itemId);
    setItems((prev) => prev.map((i) => (i.item_id === itemId ? { ...i, [field]: value } : i)));
    // Sync quantity to paired BOM row
    if (field === "quantity" && bomByItem[itemId]) {
      await supabase.from("tbl_wo_bom").update({ quantity: value }).eq("bom_id", bomByItem[itemId].bom_id);
      setBomByItem(prev => ({ ...prev, [itemId]: { ...prev[itemId], quantity: value } }));
    }
  };

  const promoteToStock = async (item: JobItemRow) => {
    if (!item.description) return;
    const { data: stockEntry } = await supabase.from("tbl_stock_items").insert({
      product_code: `BES-${item.item_id}`,
      description: item.description,
      stock_quantity: item.quantity || 1,
      active: true,
    }).select("stock_id").single();
    if (stockEntry) {
      await supabase.from("tbl_job_items").update({
        stock_item_id: stockEntry.stock_id,
        stock_reference: `BES-${item.item_id}`,
        item_source: "promoted",
      }).eq("item_id", item.item_id);
      toast.success("Promoted to stock catalogue");
      loadItems();
    }
  };

  // Material search
  const searchMaterials = async (q: string) => {
    if (q.length < 2) { setMatResults([]); return; }
    const { data } = await supabase.from("tbl_materials")
      .select("material_id, material_name, unit, current_unit_cost")
      .eq("active", true)
      .ilike("material_name", `%${q}%`)
      .limit(8);
    setMatResults(data || []);
  };

  const addMaterial = async (mat: { material_id: number; material_name: string; unit: string; current_unit_cost: number | null }) => {
    await supabase.from("tbl_wo_bom").insert({
      scope_item_id: scopeItemId,
      job_id: jobId,
      material_id: mat.material_id,
      item_description: mat.material_name,
      quantity: 1,
      unit: mat.unit,
      unit_cost: mat.current_unit_cost || 0,
      needs_ordering: "true",
    });
    toast.success(`Added: ${mat.material_name}`);
    setShowMaterialSearch(false);
    setMatQuery("");
    setMatResults([]);
    loadItems();
  };

  const addCustomMaterial = async () => {
    if (!matQuery.trim()) return;
    await supabase.from("tbl_wo_bom").insert({
      scope_item_id: scopeItemId,
      job_id: jobId,
      item_description: matQuery.trim(),
      quantity: 1,
      needs_ordering: "true",
    });
    toast.success(`Added: ${matQuery.trim()}`);
    setShowMaterialSearch(false);
    setMatQuery("");
    setMatResults([]);
    loadItems();
  };

  const deleteMaterialRow = async (bomId: number) => {
    await supabase.from("tbl_wo_bom").delete().eq("bom_id", bomId);
    loadItems();
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const selectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.item_id)));
  };

  // Expose addFromPrompt for parent
  const addFromPrompt = async (description: string, itemType: string) => {
    await supabase.from("tbl_job_items").insert({
      job_id: jobId, scope_item_id: scopeItemId, description, item_type: itemType,
      item_source: "bespoke", kit_list_exported: "false", temp_selected: "false",
      created_at: new Date().toISOString(),
    });
    loadItems();
  };
  (JobItemsTable as any)._addFromPrompt = addFromPrompt;

  if (loading) return <div className="text-sm text-muted animate-pulse py-4">Loading job items...</div>;

  return (
    <div className="space-y-3">
      {/* Header with two action buttons */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy">Job Items & Materials ({items.length + materialRows.length})</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowStockPicker(true); setStockSearch(""); setStockResults([]); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-starlight-amber bg-starlight-amber/10 hover:bg-starlight-amber/20 rounded-lg transition-colors">
            <Warehouse className="h-3.5 w-3.5" /> Add Stock Item
          </button>
          <button onClick={() => { setShowBespokeDialog(true); loadJobBespokeItems(); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-starlight-blue bg-starlight-blue/10 hover:bg-starlight-blue/20 rounded-lg transition-colors">
            <Paintbrush className="h-3.5 w-3.5" /> Add Bespoke Item
          </button>
          <button onClick={() => { setShowMaterialSearch(true); setMatQuery(""); setMatResults([]); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface-mid hover:bg-surface-hi rounded-lg transition-colors">
            <Wrench className="h-3.5 w-3.5" /> Add Material
          </button>
        </div>
      </div>

      {/* Material search inline */}
      {showMaterialSearch && (
        <div className="card p-3 border-subtle">
          <div className="flex gap-2 mb-2">
            <input type="text" value={matQuery} onChange={e => { setMatQuery(e.target.value); searchMaterials(e.target.value); }}
              placeholder="Search materials catalogue..."
              className="flex-1 px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" autoFocus />
            <button onClick={() => setShowMaterialSearch(false)} className="px-3 py-2 text-xs text-muted hover:text-muted">Cancel</button>
          </div>
          {matResults.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {matResults.map(m => (
                <div key={m.material_id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-dim">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-navy">{m.material_name}</p>
                    <p className="text-[10px] text-muted">{m.unit} · {m.current_unit_cost ? formatCurrency(m.current_unit_cost) : "No price"}</p>
                  </div>
                  <button onClick={() => addMaterial(m)} className="ml-2 p-1.5 text-starlight-green hover:bg-starlight-green/10 rounded-md shrink-0">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {matQuery.length >= 2 && matResults.length === 0 && (
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-xs text-muted">No materials found</p>
              <button onClick={addCustomMaterial} className="text-xs text-starlight-blue hover:underline">Add "{matQuery}" as custom</button>
            </div>
          )}
        </div>
      )}

      {/* Items list */}
      {items.length === 0 ? (
        <div className="bg-surface-dim rounded-lg px-4 py-8 text-center">
          <p className="text-muted text-sm">No job items yet</p>
          <p className="text-faint text-xs mt-1">Add stock items from the catalogue or create bespoke items</p>
        </div>
      ) : (
        <div className="card overflow-hidden divide-y divide-subtle">
          {items.map((item) => {
            const hasWo = item.has_wo === "true";
            const isStock = item.item_source === "stock" || item.item_source === "promoted" || (item.stock_reference && item.item_source !== "bespoke");
            const isSelected = selected.has(item.item_id);

            return (
              <div key={item.item_id} className={`flex items-start gap-3 px-4 py-3 transition-colors ${isSelected ? "bg-navy/10/50" : ""}`}>
                {/* Select */}
                <div className="pt-1 shrink-0">
                  <button onClick={() => toggleSelect(item.item_id)}
                    className={`transition-colors ${isSelected ? "text-starlight-blue" : "text-faint hover:text-muted"}`}>
                    {isSelected ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  </button>
                </div>

                {/* Source badge + Description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isStock ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-starlight-amber/10 text-starlight-amber text-[9px] font-semibold rounded shrink-0">
                        <Warehouse className="h-2.5 w-2.5" />Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-starlight-blue/10 text-starlight-blue text-[9px] font-semibold rounded shrink-0">
                        <Paintbrush className="h-2.5 w-2.5" />Bespoke
                      </span>
                    )}
                    {item.stock_reference && (
                      <span className="text-[10px] font-mono text-muted">{item.stock_reference}</span>
                    )}
                    {item.item_source === "promoted" && (
                      <span className="text-[9px] text-starlight-green font-medium">Promoted</span>
                    )}
                    {item.source_item_id && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-starlight-blue font-medium"
                        title={sourceScopes[item.source_item_id] ? `Copied from: ${sourceScopes[item.source_item_id]}` : "Copied from another scope in this job"}>
                        <Link2 className="h-2.5 w-2.5" />
                        {sourceScopes[item.source_item_id]
                          ? `Same as ${sourceScopes[item.source_item_id].length > 40 ? sourceScopes[item.source_item_id].substring(0, 40) + "…" : sourceScopes[item.source_item_id]}`
                          : "Linked"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-navy font-medium">{item.description || "Untitled item"}</p>
                  {item.finish_required && (
                    <p className="text-xs text-muted mt-0.5">Finish: {item.finish_required}</p>
                  )}
                  <input type="text" defaultValue={item.notes || ""}
                    onBlur={(e) => { const val = e.target.value.trim() || null; if (val !== (item.notes || null)) updateItem(item.item_id, "notes", val); }}
                    placeholder="Add a note..."
                    className="mt-1 w-full text-xs text-muted bg-transparent border-0 border-b border-transparent hover:border-subtle focus:border-starlight-blue focus:outline-none px-0 py-0.5 placeholder:text-faint" />
                </div>

                {/* Qty */}
                <div className="shrink-0 w-16 text-center">
                  <input type="number" value={item.quantity ?? ""} min={1}
                    onChange={(e) => setItems((prev) => prev.map((i) => i.item_id === item.item_id ? { ...i, quantity: parseFloat(e.target.value) || null } : i))}
                    onBlur={(e) => updateItem(item.item_id, "quantity", parseFloat(e.target.value) || null)}
                    className="w-14 px-2 py-1 text-sm text-center border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                  <p className="text-[9px] text-faint mt-0.5">qty</p>
                </div>

                {/* Cost (stock items from BOM) */}
                <div className="shrink-0 w-20 text-right pt-1">
                  {bomByItem[item.item_id] ? (
                    <p className="text-sm font-mono text-navy">{formatCurrency((item.quantity || 1) * bomByItem[item.item_id].unit_cost)}</p>
                  ) : hasWo ? (
                    <span className="text-[10px] text-muted">via WO</span>
                  ) : null}
                </div>

                {/* Actions */}
                <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
                  {!hasWo && item.item_source === "bespoke" && item.description && (
                    <button onClick={() => promoteToStock(item)} title="Promote to stock catalogue"
                      className="p-1 text-faint hover:text-starlight-green transition-colors">
                      <ArrowUpCircle className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!hasWo && (
                    <button onClick={() => deleteItem(item.item_id)} title="Delete"
                      className="p-1 text-faint hover:text-starlight-red transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Material-only BOM rows */}
      {materialRows.length > 0 && (
        <div className="card overflow-hidden divide-y divide-subtle">
          {materialRows.map(m => (
            <div key={m.bom_id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="pt-0.5 shrink-0 w-6" />
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-surface-mid text-muted text-[9px] font-semibold rounded shrink-0">
                <Wrench className="h-2.5 w-2.5" />Material
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-navy">{m.item_description}</p>
              </div>
              <div className="shrink-0 w-16 text-center">
                <p className="text-sm font-mono text-muted">{m.quantity} {m.unit}</p>
              </div>
              <div className="shrink-0 w-20 text-right">
                <p className="text-sm font-mono text-navy">{formatCurrency(m.quantity * m.unit_cost)}</p>
              </div>
              <button onClick={() => deleteMaterialRow(m.bom_id)} title="Delete"
                className="p-1 text-faint hover:text-starlight-red transition-colors shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="text-xs text-starlight-blue font-medium">
          {selected.size} item{selected.size > 1 ? "s" : ""} selected for Work Order creation
        </div>
      )}

      {/* ============================================================ */}
      {/* Stock Picker Dialog */}
      {/* ============================================================ */}
      {showStockPicker && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowStockPicker(false)}>
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-subtle flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-navy flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-starlight-amber" /> Add Stock Items
                </h3>
                <p className="text-[10px] text-muted mt-0.5">Search and add items from the stock catalogue</p>
              </div>
              <button onClick={() => setShowStockPicker(false)} className="p-1.5 text-muted hover:text-muted rounded-lg hover:bg-surface-mid">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Search */}
            <div className="px-5 py-3 border-b border-subtle shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
                <input type="text" value={stockSearch} onChange={(e) => handleStockSearch(e.target.value)}
                  placeholder="Search by name or product code..."
                  className="w-full pl-9 pr-3 py-2.5 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-amber"
                  autoFocus />
              </div>
            </div>
            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {stockSearch.length < 2 ? (
                <div className="px-5 py-12 text-center text-faint text-sm">Type to search the stock catalogue...</div>
              ) : stockLoading ? (
                <div className="px-5 py-12 text-center text-muted text-sm animate-pulse">Searching...</div>
              ) : stockResults.length === 0 ? (
                <div className="px-5 py-12 text-center text-muted text-sm">No items matching &quot;{stockSearch}&quot;</div>
              ) : (
                <div className="divide-y divide-subtle">
                  {stockResults.map((stock) => (
                    <button key={stock.stock_id} onClick={() => addStockItem(stock)}
                      className="w-full flex items-center gap-4 px-5 py-3 hover:bg-starlight-amber/5 transition-colors text-left">
                      <div className="w-14 h-14 shrink-0 bg-surface-dim rounded-lg flex items-center justify-center overflow-hidden">
                        {stock.thumbnail_url ? (
                          <img src={stock.thumbnail_url} alt="" className="w-full h-full object-contain p-1" />
                        ) : (
                          <Warehouse className="h-5 w-5 text-faint" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-navy">{stock.description}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted">
                          <span className="font-mono">{stock.product_code}</span>
                          {stock.location && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{stock.location}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-navy">{stock.stock_quantity}</p>
                        <p className="text-[10px] text-muted">available</p>
                      </div>
                      {stock.hire_cost_day && (
                        <div className="text-right shrink-0 w-20">
                          <p className="text-xs font-mono text-muted">{formatCurrency(stock.hire_cost_day)}</p>
                          <p className="text-[10px] text-muted">/day</p>
                        </div>
                      )}
                      <Plus className="h-5 w-5 text-starlight-amber shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Bespoke Item Dialog */}
      {/* ============================================================ */}
      {showBespokeDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowBespokeDialog(false)}>
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-subtle flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy flex items-center gap-2">
                <Paintbrush className="h-4 w-4 text-starlight-blue" /> Add Bespoke Item
              </h3>
              <button onClick={() => setShowBespokeDialog(false)} className="p-1.5 text-muted hover:text-muted rounded-lg hover:bg-surface-mid">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Copy from this job — collapsed by default */}
              {jobBespokeItems.length > 0 && (
                <div>
                  <button type="button" onClick={() => setBespokeForm(f => ({ ...f, _showCopy: !(f as any)._showCopy } as any))}
                    className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-starlight-blue transition-colors">
                    <Link2 className="h-3 w-3" />
                    Copy from another scope ({jobBespokeItems.length})
                    <span className="text-[9px]">{(bespokeForm as any)._showCopy ? '▾' : '▸'}</span>
                  </button>
                  {(bespokeForm as any)._showCopy && <div className="mt-1.5 max-h-36 overflow-y-auto border border-subtle rounded-lg divide-y divide-subtle">
                    {jobBespokeItems.map((jbi) => (
                      <button key={jbi.item_id} type="button"
                        onClick={() => setBespokeForm({
                          ...bespokeForm,
                          description: jbi.description,
                          finish_required: jbi.finish_required || "",
                          quantity: String(jbi.quantity || 1),
                          source_item_id: jbi.item_id,
                        })}
                        className={"w-full text-left px-3 py-2 hover:bg-starlight-blue/5 transition-colors " + (bespokeForm.source_item_id === jbi.item_id ? "bg-starlight-blue/10" : "")}>
                        <p className="text-xs text-navy font-medium">{jbi.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted">{jbi.scope_name}</span>
                          {jbi.finish_required && <span className="text-[10px] text-muted">· {jbi.finish_required}</span>}
                          <span className="text-[10px] text-muted">· qty {jbi.quantity || 1}</span>
                        </div>
                      </button>
                    ))}
                  </div>}
                  {bespokeForm.source_item_id && (
                    <p className="text-[10px] text-starlight-blue mt-1 flex items-center gap-1">
                      <Link2 className="h-2.5 w-2.5" /> Linked — adjust quantity below
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Description *</label>
                <textarea value={bespokeForm.description} onChange={(e) => setBespokeForm({ ...bespokeForm, description: e.target.value })}
                  rows={3} placeholder="Describe what needs to be built..."
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Quantity</label>
                  <input type="number" value={bespokeForm.quantity} min={1}
                    onChange={(e) => setBespokeForm({ ...bespokeForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Finish Required</label>
                  <input type="text" value={bespokeForm.finish_required}
                    onChange={(e) => setBespokeForm({ ...bespokeForm, finish_required: e.target.value })}
                    placeholder="Paint colour, etc."
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer pt-1">
                <input type="checkbox" checked={bespokeForm.promote_to_stock}
                  onChange={(e) => setBespokeForm({ ...bespokeForm, promote_to_stock: e.target.checked })}
                  className="rounded border-subtle text-starlight-green focus:ring-starlight-green" />
                Add to stock catalogue when complete
              </label>
            </div>
            <div className="px-5 py-3 border-t border-subtle flex justify-end gap-3">
              <button onClick={() => setShowBespokeDialog(false)} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors">Cancel</button>
              <button onClick={addBespokeItem} disabled={!bespokeForm.description.trim()}
                className="px-4 py-2 bg-starlight-blue text-white text-sm font-medium rounded-lg hover:bg-navy transition-colors disabled:opacity-50">
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type JobItemsTableRef = {
  addFromPrompt: (description: string, itemType: string) => void;
};
