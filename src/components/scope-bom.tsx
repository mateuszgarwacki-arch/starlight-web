"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import { getAuditContext, auditedInsert, auditedUpdate } from "@/lib/audit";
import { Plus, Trash2, Search, Package, X, Warehouse } from "lucide-react";
import { toast } from "sonner";
import type { WoBom } from "@/lib/types";
import { isTruthy } from "@/lib/types";

interface ScopeBomProps {
  scopeItemId: number;
  jobId: number;
}

export function ScopeBom({ scopeItemId, jobId }: ScopeBomProps) {
  const supabase = createClient();
  const [rows, setRows] = useState<WoBom[]>([]);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<
    { material_id: number; material_name: string; unit: string; current_unit_cost: number | null; material_category: number | null; standard_length: number | null }[]
  >([]);
  const [stockItems, setStockItems] = useState<
    { stock_id: number; product_code: string; description: string; stock_quantity: number; hire_cost_day: number | null; thumbnail_url: string | null }[]
  >([]);
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<typeof materials>([]);
  const [stockResults, setStockResults] = useState<typeof stockItems>([]);

  const loadBom = useCallback(async () => {
    const { data } = await supabase
      .from("tbl_wo_bom")
      .select("*")
      .eq("scope_item_id", scopeItemId)
      .is("work_order_id", null)
      .order("bom_id");
    setRows((data as WoBom[]) || []);
    setLoading(false);
  }, [scopeItemId]);

  useEffect(() => {
    loadBom();
    supabase
      .from("tbl_materials")
      .select("material_id, material_name, unit, current_unit_cost, material_category, standard_length")
      .eq("active", true)
      .order("material_name")
      .then(({ data }) => setMaterials(data || []));
    supabase
      .from("tbl_stock_items")
      .select("stock_id, product_code, description, stock_quantity, hire_cost_day, thumbnail_url")
      .eq("active", true)
      .order("description")
      .then(({ data }) => setStockItems(data || []));
  }, [loadBom]);

  useEffect(() => {
    if (search.length >= 2) {
      const lower = search.toLowerCase();
      setSearchResults(materials.filter((m) => m.material_name.toLowerCase().includes(lower)).slice(0, 6));
      setStockResults(stockItems.filter((s) => s.description.toLowerCase().includes(lower) || s.product_code.toLowerCase().includes(lower)).slice(0, 6));
    } else {
      setSearchResults([]);
      setStockResults([]);
    }
  }, [search, materials, stockItems]);

  const selectMaterial = async (mat: (typeof materials)[0]) => {
    const ctx = await getAuditContext(supabase);
    const { data } = await auditedInsert(ctx, "tbl_wo_bom", {
      scope_item_id: scopeItemId, work_order_id: null, job_id: jobId,
      material_id: mat.material_id, material_category: mat.material_category,
      item_description: mat.material_name, unit: mat.unit,
      unit_cost: mat.current_unit_cost, quantity: 1, needs_ordering: "true",
    }, jobId);
    if (data) { setRows((prev) => [...prev, data as WoBom]); toast.success("Material added"); }
    setShowSearch(false); setSearch("");
  };

  const selectStockItem = async (stock: (typeof stockItems)[0]) => {
    const ctx = await getAuditContext(supabase);
    const { data } = await auditedInsert(ctx, "tbl_wo_bom", {
      scope_item_id: scopeItemId, work_order_id: null, job_id: jobId,
      stock_item_id: stock.stock_id,
      item_description: stock.description, unit: "Each",
      unit_cost: stock.hire_cost_day, quantity: 1, needs_ordering: "false",
    }, jobId);
    if (data) { setRows((prev) => [...prev, data as WoBom]); toast.success("Stock item added"); }
    setShowSearch(false); setSearch("");
  };

  const addCustomRow = async () => {
    const ctx = await getAuditContext(supabase);
    const { data } = await auditedInsert(ctx, "tbl_wo_bom", {
      scope_item_id: scopeItemId, work_order_id: null, job_id: jobId,
      item_description: search.trim() || "New material", quantity: 1, needs_ordering: "true",
    }, jobId);
    if (data) { setRows((prev) => [...prev, data as WoBom]); toast.success("Custom material added"); }
    setShowSearch(false); setSearch("");
  };

  const updateField = async (bomId: number, field: string, value: string | number | null) => {
    const row = rows.find((r) => r.bom_id === bomId);
    const expectedAt = (row as any)?.updated_at ?? null;
    const ctx = await getAuditContext(supabase);
    const result = await auditedUpdate(ctx, "tbl_wo_bom", bomId, { [field]: value }, jobId, expectedAt);
    if (result.conflict) { toast.warning("Row was modified — reloading"); loadBom(); }
    else { setRows((prev) => prev.map((r) => (r.bom_id === bomId ? { ...r, [field]: value, updated_at: result.data?.updated_at } : r))); }
  };

  const deleteRow = async (bomId: number) => {
    const ctx = await getAuditContext(supabase);
    const row = rows.find((r) => r.bom_id === bomId);
    await supabase.from("tbl_audit_log").insert({
      user_id: ctx.userId, user_name: ctx.userName, user_role: ctx.userRole,
      table_name: "tbl_wo_bom", record_id: bomId,
      field_name: "_record", old_value: row ? JSON.stringify(row) : null, new_value: null,
      job_id: jobId, action_type: "delete",
    });
    await supabase.from("tbl_wo_bom").delete().eq("bom_id", bomId);
    setRows((prev) => prev.filter((r) => r.bom_id !== bomId));
    toast.success("Material removed");
  };

  // Lookup: material_id → standard_length (in mm)
  const stdLengthMap: Record<number, number> = {};
  (materials || []).forEach((m) => { if (m.standard_length) stdLengthMap[m.material_id] = m.standard_length; });

  // Compute row total — unit_cost is always per-unit (per metre, per length, per sheet)
  const rowTotal = (row: WoBom) => {
    const cost = row.actual_unit_cost ?? row.unit_cost ?? 0;
    const qty = row.quantity || 0;
    return qty * cost;
  };

  const totalCost = rows.reduce((s, r) => s + rowTotal(r), 0);

  if (loading) return null;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-subtle">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-navy" />
          <h3 className="text-sm font-semibold text-navy">Materials</h3>
          {rows.length > 0 && (
            <span className="text-[10px] text-muted font-mono">
              {rows.length} item{rows.length !== 1 ? "s" : ""} · {formatCurrency(totalCost)}
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowSearch(true); setSearch(""); setSearchResults([]); }}
          className="inline-flex items-center gap-1 text-xs text-starlight-blue hover:text-navy font-medium transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add Material
        </button>
      </div>

      {rows.length === 0 && !showSearch ? (
        <div className="px-5 py-6 text-center text-xs text-faint">
          No materials added — use + Add Material to specify what&apos;s needed for this scope item
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-muted uppercase tracking-wider border-b border-subtle">
                <th className="text-left py-1.5 px-4 font-medium">Material</th>
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
              {rows.map((row) => {
                const cost = row.actual_unit_cost ?? row.unit_cost ?? 0;
                const total = rowTotal(row);
                const stdLen = row.material_id ? stdLengthMap[row.material_id] : null;
                const isLengthMode = row.unit === "Length" && stdLen;
                const canToggle = !!stdLen;
                return (
                  <tr key={row.bom_id} className="border-b border-subtle last:border-0">
                    <td className="py-1.5 px-4">
                      <div className="flex items-center gap-1.5">
                        {(row.stock_item_id || isTruthy(row.from_stock)) && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-starlight-amber/10 text-starlight-amber text-[9px] font-medium rounded shrink-0"><Warehouse className="h-2.5 w-2.5" />Stock</span>}
                        <input type="text" defaultValue={row.item_description || ""}
                          onBlur={(e) => { if (e.target.value !== row.item_description) updateField(row.bom_id, "item_description", e.target.value); }}
                          className="w-full text-sm text-navy bg-transparent border-0 focus:outline-none focus:bg-surface-dim rounded px-1 -ml-1" />
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <input type="number" defaultValue={row.quantity ?? ""}
                        onBlur={(e) => { const val = parseFloat(e.target.value) || 0; if (val !== row.quantity) updateField(row.bom_id, "quantity", val); }}
                        className="w-16 text-right text-sm font-mono text-navy bg-transparent border-0 focus:outline-none focus:bg-surface-dim rounded" />
                    </td>
                    <td className="py-1.5 px-2">
                      {canToggle ? (
                        <button
                          onClick={async () => {
                            const stdLenM = stdLen! / 1000;
                            const currentCost = row.actual_unit_cost ?? row.unit_cost ?? 0;
                            const currentQty = row.quantity || 0;
                            if (isLengthMode) {
                              // Length → Metre
                              await updateField(row.bom_id, "unit", "Metre");
                              if (currentQty) await updateField(row.bom_id, "quantity", Math.round(currentQty * stdLenM * 100) / 100);
                              if (currentCost) await updateField(row.bom_id, "unit_cost", Math.round((currentCost / stdLenM) * 100) / 100);
                            } else {
                              // Metre → Length
                              await updateField(row.bom_id, "unit", "Length");
                              if (currentQty) await updateField(row.bom_id, "quantity", Math.ceil(currentQty / stdLenM));
                              if (currentCost) await updateField(row.bom_id, "unit_cost", Math.round(currentCost * stdLenM * 100) / 100);
                            }
                          }}
                          className={"inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors " + (isLengthMode ? "bg-navy/10 text-navy border-navy/20 hover:bg-navy/20" : "bg-surface-mid text-muted border-subtle hover:bg-surface-hi")}
                          title={isLengthMode ? `Switch to metres (std length: ${stdLen}mm)` : `Switch to lengths of ${stdLen}mm`}
                        >
                          {isLengthMode ? "Length" : "Metre"}
                          <span className="text-[9px] text-muted">⇄</span>
                        </button>
                      ) : (
                        <input type="text" defaultValue={row.unit || ""}
                          onBlur={(e) => { if (e.target.value !== row.unit) updateField(row.bom_id, "unit", e.target.value); }}
                          className="w-16 text-sm text-muted bg-transparent border-0 focus:outline-none focus:bg-surface-dim rounded" />
                      )}
                      {isLengthMode && (
                        <p className="text-[9px] text-muted mt-0.5">{row.quantity || 0} × {(stdLen! / 1000).toFixed(1)}m = {((row.quantity || 0) * stdLen! / 1000).toFixed(1)}m · {formatCurrency(cost / (stdLen! / 1000))}/m</p>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <input type="number" step="0.01" defaultValue={cost || ""}
                        onBlur={(e) => { const val = parseFloat(e.target.value) || 0; if (val !== cost) updateField(row.bom_id, "unit_cost", val); }}
                        className="w-20 text-right text-sm font-mono text-muted bg-transparent border-0 focus:outline-none focus:bg-surface-dim rounded" />
                    </td>
                    <td className="py-1.5 px-2 text-right text-sm font-mono text-navy">{total > 0 ? formatCurrency(total) : "—"}</td>
                    <td className="py-1.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={isTruthy(row.from_stock)}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          await updateField(row.bom_id, "from_stock", val ? "true" : "false");
                          if (val) {
                            await updateField(row.bom_id, "needs_ordering", "false");
                            if (!row.unit_cost && row.material_id) {
                              const mat = materials.find(m => m.material_id === row.material_id);
                              if (mat?.current_unit_cost) await updateField(row.bom_id, "unit_cost", mat.current_unit_cost);
                            }
                          }
                        }}
                        className="h-3.5 w-3.5 rounded border-subtle text-starlight-amber focus:ring-starlight-amber"
                        title="From workshop stock (internal cost)"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={isTruthy(row.needs_ordering)}
                        disabled={isTruthy(row.from_stock)}
                        onChange={(e) => updateField(row.bom_id, "needs_ordering", e.target.checked ? "true" : "false")}
                        className="h-3.5 w-3.5 rounded border-subtle text-starlight-blue focus:ring-starlight-blue disabled:opacity-30"
                        title="Needs ordering"
                      />
                    </td>
                    <td className="py-1.5 px-1">
                      <button onClick={() => deleteRow(row.bom_id)} className="p-1 text-faint hover:text-starlight-red transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showSearch && (
        <div className="border-t border-subtle px-4 py-3 bg-surface-dim/50">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-muted" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search materials or stock items..."
              className="flex-1 text-sm border border-subtle rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-starlight-blue"
              autoFocus />
            <button onClick={() => { setShowSearch(false); setSearch(""); }} className="p-1 text-muted hover:text-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {/* Stock items section */}
            {stockResults.length > 0 && (
              <div>
                <p className="text-[9px] text-muted uppercase tracking-wider font-semibold mb-1 px-1">Stock Items</p>
                <div className="space-y-0.5">
                  {stockResults.map((s) => (
                    <button key={s.stock_id} onClick={() => selectStockItem(s)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-starlight-amber/5 transition-colors flex items-center gap-3">
                      {s.thumbnail_url ? (
                        <img src={s.thumbnail_url} alt="" className="w-8 h-8 object-contain rounded shrink-0" />
                      ) : (
                        <div className="w-8 h-8 bg-surface-mid rounded flex items-center justify-center shrink-0"><Package className="h-3 w-3 text-faint" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-navy font-medium truncate">{s.description}</p>
                        <p className="text-[10px] text-muted font-mono">{s.product_code} · {s.stock_quantity} in stock</p>
                      </div>
                      {s.hire_cost_day && <span className="text-[10px] text-muted shrink-0">{formatCurrency(s.hire_cost_day)}/day</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Materials section */}
            {searchResults.length > 0 && (
              <div>
                <p className="text-[9px] text-muted uppercase tracking-wider font-semibold mb-1 px-1">Materials</p>
                <div className="space-y-0.5">
                  {searchResults.map((m) => (
                    <button key={m.material_id} onClick={() => selectMaterial(m)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-starlight-blue/5 transition-colors flex items-center justify-between">
                      <span className="text-xs text-navy font-medium">{m.material_name}</span>
                      <span className="text-[10px] text-muted">{m.unit} · {m.current_unit_cost ? formatCurrency(m.current_unit_cost) : "no price"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {search.length >= 2 && (
            <button onClick={addCustomRow}
              className="mt-2 w-full text-left px-3 py-2 rounded-lg border border-dashed border-subtle hover:border-starlight-blue hover:bg-starlight-blue/5 transition-colors text-xs text-muted">
              + Add &quot;<span className="font-medium text-navy">{search}</span>&quot; as custom item
            </button>
          )}
        </div>
      )}
    </div>
  );
}
