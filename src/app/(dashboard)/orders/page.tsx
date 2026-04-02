"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ShoppingCart, Package, Check, ChevronDown, ChevronRight,
  Truck, Calendar, Clock, Search, Filter, X, Plus,
} from "lucide-react";

interface ProcItem {
  bom_id: number;
  work_order_id: number;
  job_id: number;
  material_id: number | null;
  material_category: number | null;
  item_description: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  supplier: string | null;
  notes: string | null;
  material_name: string;
  category_name: string | null;
  job_number: string | null;
  job_name: string | null;
  event_date: string | null;
  wo_description: string | null;
  scope_name: string | null;
  standard_length: number | null;
  standard_sheet_size: string | null;
}

interface OrderedItem {
  bom_id: number;
  work_order_id: number;
  job_id: number;
  material_id: number | null;
  item_description: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  supplier: string | null;
  ordered_at: string;
  expected_delivery: string | null;
  notes: string | null;
  material_name: string;
  job_number: string | null;
  job_name: string | null;
  wo_description: string | null;
  scope_name: string | null;
  ordered_by_name: string | null;
}

interface MaterialGroup {
  key: string;
  material_name: string;
  category_name: string | null;
  unit: string | null;
  total_qty: number;
  standard_length: number | null;
  standard_sheet_size: string | null;
  items: ProcItem[];
  expanded: boolean;
}

export default function OrdersPage() {
  const supabase = createClient();
  const [outstanding, setOutstanding] = useState<ProcItem[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderedItem[]>([]);
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showMarkDialog, setShowMarkDialog] = useState(false);
  const [markSupplier, setMarkSupplier] = useState("");
  const [markDelivery, setMarkDelivery] = useState("");
  const [markNotes, setMarkNotes] = useState("");
  const [acting, setActing] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"outstanding" | "ordered">("outstanding");
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [recentSuppliers, setRecentSuppliers] = useState<string[]>([]);
  const [lastSupplier, setLastSupplier] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [procRes, orderedRes, suppRes] = await Promise.all([
      supabase.from("qry_procurement_needed").select("*"),
      supabase.from("qry_recent_orders").select("*").limit(50),
      supabase.from("tbl_suppliers").select("supplier_id, supplier_name").order("supplier_name"),
    ]);

    const items = procRes.data || [];
    setOutstanding(items);
    setRecentOrders(orderedRes.data || []);
    setSuppliers(suppRes.data || []);

    // Group by material name
    const groupMap = new Map<string, MaterialGroup>();
    items.forEach(item => {
      const key = item.material_name || item.item_description || "Unknown";
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key,
          material_name: key,
          category_name: item.category_name,
          unit: item.unit,
          total_qty: 0,
          standard_length: item.standard_length,
          standard_sheet_size: item.standard_sheet_size,
          items: [],
          expanded: false,
        });
      }
      const g = groupMap.get(key)!;
      g.total_qty += item.quantity || 0;
      g.items.push(item);
    });

    setGroups(Array.from(groupMap.values()).sort((a, b) => a.material_name.localeCompare(b.material_name)));
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleGroup = (key: string) => {
    setGroups(prev => prev.map(g => g.key === key ? { ...g, expanded: !g.expanded } : g));
  };

  const toggleSelectAll = (group: MaterialGroup) => {
    const allSelected = group.items.every(i => selected.has(i.bom_id));
    const next = new Set(selected);
    group.items.forEach(i => {
      if (allSelected) next.delete(i.bom_id); else next.add(i.bom_id);
    });
    setSelected(next);
  };

  const toggleItem = (bomId: number) => {
    const next = new Set(selected);
    if (next.has(bomId)) next.delete(bomId); else next.add(bomId);
    setSelected(next);
  };

  const openMarkDialog = async () => {
    setShowMarkDialog(true);
    // Look up supplier history for selected materials
    const selectedItems = outstanding.filter(i => selected.has(i.bom_id));
    const materialIds = [...new Set(selectedItems.map(i => i.material_id).filter(Boolean))] as number[];
    if (materialIds.length > 0) {
      const { data: history } = await supabase
        .from("tbl_wo_bom")
        .select("supplier, ordered_at")
        .in("material_id", materialIds)
        .not("ordered_at", "is", null)
        .not("supplier", "is", null)
        .order("ordered_at", { ascending: false })
        .limit(20);
      if (history && history.length > 0) {
        const last = history[0].supplier;
        setLastSupplier(last);
        const uniqueSuppliers = [...new Set(history.map((h: any) => h.supplier).filter(Boolean))] as string[];
        setRecentSuppliers(uniqueSuppliers);
        setMarkSupplier(last); // Pre-select last used
      } else {
        setLastSupplier(null);
        setRecentSuppliers([]);
      }
    } else {
      setLastSupplier(null);
      setRecentSuppliers([]);
    }
  };

  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) return;
    setAddingSupplier(true);
    const { data, error } = await supabase.from("tbl_suppliers")
      .insert({ supplier_name: newSupplierName.trim(), active: true })
      .select("supplier_id, supplier_name, active")
      .single();
    if (data) {
      setSuppliers(prev => [...prev, data].sort((a, b) => (a.supplier_name || "").localeCompare(b.supplier_name || "")));
      setMarkSupplier(data.supplier_name);
    }
    setNewSupplierName("");
    setShowAddSupplier(false);
    setAddingSupplier(false);
  };

  const handleMarkOrdered = async () => {
    if (selected.size === 0) return;
    setActing(true);
    const now = new Date().toISOString();
    const { data: { user } } = await supabase.auth.getUser();
    const freelancerId = user?.user_metadata?.freelancer_id || null;

    const updates: Record<string, any> = {
      ordered_at: now,
      ordered_by: freelancerId,
    };
    if (markSupplier) updates.supplier = markSupplier;
    if (markDelivery) updates.expected_delivery = markDelivery;
    if (markNotes) updates.notes = markNotes;

    await supabase.from("tbl_wo_bom")
      .update(updates)
      .in("bom_id", Array.from(selected));

    setSelected(new Set());
    setShowMarkDialog(false);
    setMarkSupplier("");
    setMarkDelivery("");
    setMarkNotes("");
    setActing(false);
    await loadData();
  };

  const filteredGroups = filter
    ? groups.filter(g => g.material_name.toLowerCase().includes(filter.toLowerCase()))
    : groups;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted text-sm">Loading procurement...</div></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Orders</h1>
          <p className="text-sm text-muted mt-0.5">Procurement management — what needs buying, what&apos;s been ordered</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={openMarkDialog}
              className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-green text-white text-sm font-medium rounded-lg hover:bg-starlight-green transition-colors"
            >
              <Check className="h-4 w-4" /> Mark {selected.size} Ordered
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card px-4 py-3">
          <p className="text-2xl font-semibold text-navy">{outstanding.length}</p>
          <p className="text-xs text-muted">Items to order</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-2xl font-semibold text-navy">{groups.length}</p>
          <p className="text-xs text-muted">Unique materials</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-2xl font-semibold text-navy">
            {formatCurrency(outstanding.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0))}
          </p>
          <p className="text-xs text-muted">Est. total cost</p>
        </div>

        <div className="card px-4 py-3">
          <p className="text-2xl font-semibold text-navy">
            {new Set(outstanding.map(i => i.job_number).filter(Boolean)).size}
          </p>
          <p className="text-xs text-muted">Jobs affected</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-subtle">
        <button
          onClick={() => setTab("outstanding")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "outstanding" ? "border-starlight-red text-navy" : "border-transparent text-muted hover:text-muted"
          }`}
        >
          <Package className="h-3.5 w-3.5 inline mr-1.5" />
          Outstanding ({outstanding.length})
        </button>
        <button
          onClick={() => setTab("ordered")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "ordered" ? "border-starlight-green text-navy" : "border-transparent text-muted hover:text-muted"
          }`}
        >
          <Truck className="h-3.5 w-3.5 inline mr-1.5" />
          Recently Ordered ({recentOrders.length})
        </button>
      </div>

      {/* OUTSTANDING TAB */}
      {tab === "outstanding" && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Filter by material name..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/50"
            />
            {filter && (
              <button onClick={() => setFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-navy">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {filteredGroups.length === 0 ? (
            <div className="card px-5 py-10 text-center">
              <Package className="h-8 w-8 text-faint mx-auto mb-2" />
              <p className="text-sm text-muted">{filter ? "No materials match your filter" : "Nothing to order — all BOM items are covered"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGroups.map(group => {
                const allSelected = group.items.every(i => selected.has(i.bom_id));
                const someSelected = group.items.some(i => selected.has(i.bom_id));
                const estCost = group.items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);

                return (
                  <div key={group.key} className="card overflow-hidden">
                    {/* Group header */}
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-dim/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={() => toggleSelectAll(group)}
                        className="h-4 w-4 rounded border-subtle text-starlight-blue focus:ring-starlight-blue/50"
                      />
                      <button onClick={() => toggleGroup(group.key)} className="flex items-center gap-2 flex-1 text-left">
                        {group.expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-muted" />}
                        <span className="font-medium text-navy text-sm">{group.material_name}</span>
                        {group.category_name && <span className="text-[10px] bg-surface-mid text-muted px-1.5 py-0.5 rounded-full">{group.category_name}</span>}
                      </button>
                      <div className="flex items-center gap-4 text-xs text-muted shrink-0">
                        <span className="font-mono font-medium text-navy">{group.total_qty} {group.unit || ""}</span>
                        {group.standard_sheet_size && <span className="text-muted">{group.standard_sheet_size}</span>}
                        {group.standard_length && <span className="text-muted">{group.standard_length}m std</span>}
                        {estCost > 0 && <span className="text-muted">{formatCurrency(estCost)}</span>}
                        <span className="text-muted">{group.items.length} {group.items.length === 1 ? "WO" : "WOs"}</span>
                      </div>
                    </div>

                    {/* Expanded detail rows */}
                    {group.expanded && (
                      <div className="border-t border-subtle bg-surface-dim/30">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-[10px] text-muted uppercase tracking-wider">
                              <th className="pl-11 pr-2 py-2 font-medium w-8"></th>
                              <th className="px-2 py-2 font-medium">Work Order</th>
                              <th className="px-2 py-2 font-medium">Scope Item</th>
                              <th className="px-2 py-2 font-medium">Job</th>
                              <th className="px-2 py-2 font-medium text-right">Qty</th>
                              <th className="px-2 py-2 font-medium text-right">Unit Cost</th>
                              <th className="px-2 py-2 font-medium">Supplier</th>
                              <th className="px-2 py-2 font-medium">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map(item => (
                              <tr key={item.bom_id} className="border-t border-subtle/50 hover:bg-surface/50">
                                <td className="pl-11 pr-2 py-2">
                                  <input
                                    type="checkbox"
                                    checked={selected.has(item.bom_id)}
                                    onChange={() => toggleItem(item.bom_id)}
                                    className="h-3.5 w-3.5 rounded border-subtle text-starlight-blue focus:ring-starlight-blue/50"
                                  />
                                </td>
                                <td className="px-2 py-2 text-navy">{item.wo_description || "—"}</td>
                                <td className="px-2 py-2 text-muted">{item.scope_name || "—"}</td>
                                <td className="px-2 py-2 text-muted font-mono">{item.job_number || "—"}</td>
                                <td className="px-2 py-2 text-right font-mono text-navy">{item.quantity || "—"} {item.unit || ""}</td>

                                <td className="px-2 py-2 text-right text-muted">{item.unit_cost ? formatCurrency(item.unit_cost) : "—"}</td>
                                <td className="px-2 py-2 text-muted">{item.supplier || "—"}</td>
                                <td className="px-2 py-2 text-muted truncate max-w-[150px]">{item.notes || ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ORDERED TAB */}
      {tab === "ordered" && (
        <div>
          {recentOrders.length === 0 ? (
            <div className="card px-5 py-10 text-center">
              <Truck className="h-8 w-8 text-faint mx-auto mb-2" />
              <p className="text-sm text-muted">No recent orders recorded</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-base text-left text-[10px] text-muted uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">Material</th>
                    <th className="px-4 py-2 font-medium text-right">Qty</th>
                    <th className="px-4 py-2 font-medium">Supplier</th>
                    <th className="px-4 py-2 font-medium">Job</th>
                    <th className="px-4 py-2 font-medium">Work Order</th>
                    <th className="px-4 py-2 font-medium">Ordered</th>
                    <th className="px-4 py-2 font-medium">Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(o => (
                    <tr key={o.bom_id} className="border-t border-subtle hover:bg-surface-dim/50">
                      <td className="px-4 py-2.5 font-medium text-navy">{o.material_name}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-muted">{o.quantity || "—"} {o.unit || ""}</td>
                      <td className="px-4 py-2.5 text-muted">{o.supplier || "—"}</td>
                      <td className="px-4 py-2.5 text-muted font-mono">{o.job_number || "—"}</td>
                      <td className="px-4 py-2.5 text-muted truncate max-w-[180px]">{o.wo_description || "—"}</td>

                      <td className="px-4 py-2.5 text-muted">{formatDate(o.ordered_at)}</td>
                      <td className="px-4 py-2.5">
                        {o.expected_delivery ? (
                          <span className="text-muted">{formatDate(o.expected_delivery)}</span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}


      {/* MARK ORDERED DIALOG */}
      {showMarkDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-navy">Mark as Ordered</h2>
            <p className="text-sm text-muted">{selected.size} item{selected.size !== 1 ? "s" : ""} selected</p>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Supplier</label>
              {!showAddSupplier ? (
                <div className="flex gap-2">
                  <select
                    value={markSupplier}
                    onChange={(e) => setMarkSupplier(e.target.value)}
                    className="flex-1 px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/50"
                  >
                    <option value="">— Select supplier —</option>
                    {lastSupplier && <option value={lastSupplier}>★ {lastSupplier} (last used)</option>}
                    {recentSuppliers.filter(s => s !== lastSupplier).map(s => (
                      <option key={`recent-${s}`} value={s}>↻ {s}</option>
                    ))}
                    {recentSuppliers.length > 0 && <option disabled>─────────────</option>}
                    {suppliers
                      .filter((s: any) => !recentSuppliers.includes(s.supplier_name))
                      .map((s: any) => (
                        <option key={s.supplier_id} value={s.supplier_name}>{s.supplier_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowAddSupplier(true)}
                    className="px-3 py-2.5 border border-subtle rounded-lg text-sm text-muted hover:text-navy hover:border-starlight-blue transition-colors shrink-0"
                    title="Add new supplier"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    placeholder="New supplier name..."
                    className="flex-1 px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/50"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddSupplier(); if (e.key === "Escape") { setShowAddSupplier(false); setNewSupplierName(""); } }}
                  />
                  <button
                    onClick={handleAddSupplier}
                    disabled={!newSupplierName.trim() || addingSupplier}
                    className="px-3 py-2.5 bg-starlight-blue text-white rounded-lg text-sm font-medium hover:bg-navy transition-colors disabled:opacity-50 shrink-0"
                  >
                    {addingSupplier ? "..." : "Add"}
                  </button>
                  <button
                    onClick={() => { setShowAddSupplier(false); setNewSupplierName(""); }}
                    className="px-2.5 py-2.5 text-muted hover:text-navy transition-colors shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {suppliers.length === 0 && !showAddSupplier && (
                <p className="text-[10px] text-muted mt-1">No suppliers yet — click + to add one</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Expected Delivery</label>
              <input
                type="date"
                value={markDelivery}
                onChange={(e) => setMarkDelivery(e.target.value)}
                className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={markNotes}
                onChange={(e) => setMarkNotes(e.target.value)}
                placeholder="e.g. Amazon order #12345, arriving Thursday"
                className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/50"
                maxLength={200}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowMarkDialog(false); setMarkSupplier(""); setMarkDelivery(""); setMarkNotes(""); setLastSupplier(null); setRecentSuppliers([]); }}
                className="flex-1 px-4 py-2.5 text-muted bg-surface-mid rounded-lg text-sm font-medium hover:bg-surface-hi transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkOrdered}
                disabled={acting}
                className="flex-1 px-4 py-2.5 bg-starlight-green text-white rounded-lg text-sm font-semibold hover:bg-starlight-green transition-colors disabled:opacity-50"
              >
                {acting ? "Saving..." : "Confirm Ordered"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
