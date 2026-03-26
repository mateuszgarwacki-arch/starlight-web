"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import {
  Warehouse, Plus, Search, Pencil, X, Check,
  RefreshCw, Trash2, MapPin,
} from "lucide-react";
import { toast } from "sonner";

interface StockItem {
  stock_id: number;
  product_code: string;
  description: string;
  stock_quantity: number;
  location: string | null;
  weight_kg: number | null;
  hire_cost_day: number | null;
  hire_cost_week: number | null;
  category: string | null;
  thumbnail_url: string | null;
  active: boolean;
  last_checked: string | null;
}

const PAGE_SIZE = 50;

export default function StockPage() {
  const supabase = createClient();

  const [items, setItems] = useState<StockItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [locations, setLocations] = useState<string[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<StockItem>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ product_code: "", description: "", stock_quantity: "0", location: "", weight_kg: "", hire_cost_day: "", hire_cost_week: "", category: "" });
  const sentinelRef = useRef<HTMLDivElement>(null);

  const buildQuery = useCallback(() => {
    let query = supabase.from("tbl_stock_items").select("*", { count: "exact" }).eq("active", true);
    if (search) query = query.or(`description.ilike.%${search}%,product_code.ilike.%${search}%`);
    if (locationFilter !== "all") {
      if (locationFilter === "none") query = query.is("location", null);
      else query = query.eq("location", locationFilter);
    }
    return query.order("product_code");
  }, [search, locationFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, count } = await buildQuery().range(0, PAGE_SIZE - 1);
    setItems((data as StockItem[]) || []);
    setTotalCount(count || 0);
    setHasMore((data?.length || 0) >= PAGE_SIZE);
    setLoading(false);
  }, [buildQuery]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const offset = items.length;
    const { data } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    const newItems = (data as StockItem[]) || [];
    setItems(prev => [...prev, ...newItems]);
    setHasMore(newItems.length >= PAGE_SIZE);
    setLoadingMore(false);
  }, [buildQuery, items.length, loadingMore, hasMore]);

  useEffect(() => { loadData(); }, [loadData]);

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMore]);

  // Load unique locations once
  useEffect(() => {
    supabase.from("tbl_stock_items").select("location").eq("active", true).not("location", "is", null)
      .then(({ data }) => {
        const locs = [...new Set((data || []).map((d: any) => d.location).filter(Boolean))].sort();
        setLocations(locs as string[]);
      });
  }, []);

  const handleSearchInput = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 150);
  };

  const startEdit = (item: StockItem) => {
    setEditing(item.stock_id);
    setEditForm({ ...item });
  };

  const cancelEdit = () => { setEditing(null); setEditForm({}); };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.from("tbl_stock_items").update({
      product_code: editForm.product_code,
      description: editForm.description,
      stock_quantity: editForm.stock_quantity,
      location: editForm.location || null,
      weight_kg: editForm.weight_kg || null,
      hire_cost_day: editForm.hire_cost_day || null,
      hire_cost_week: editForm.hire_cost_week || null,
      category: editForm.category || null,
    }).eq("stock_id", editing);
    if (error) { toast.error("Save failed"); return; }
    toast.success("Item updated");
    setEditing(null);
    loadData();
  };

  const addItem = async () => {
    const { error } = await supabase.from("tbl_stock_items").insert({
      product_code: addForm.product_code,
      description: addForm.description,
      stock_quantity: parseInt(addForm.stock_quantity) || 0,
      location: addForm.location || null,
      weight_kg: parseFloat(addForm.weight_kg) || null,
      hire_cost_day: parseFloat(addForm.hire_cost_day) || null,
      hire_cost_week: parseFloat(addForm.hire_cost_week) || null,
      category: addForm.category || null,
    });
    if (error) { toast.error("Add failed"); return; }
    toast.success("Item added");
    setShowAdd(false);
    setAddForm({ product_code: "", description: "", stock_quantity: "0", location: "", weight_kg: "", hire_cost_day: "", hire_cost_week: "", category: "" });
    loadData();
  };

  const archiveItem = async (id: number) => {
    if (!confirm("Archive this stock item?")) return;
    await supabase.from("tbl_stock_items").update({ active: false }).eq("stock_id", id);
    toast.success("Item archived");
    loadData();
  };

  const totalQty = items.reduce((s, i) => s + (i.stock_quantity || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Stock</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalCount} items{search ? ` matching "${search}"` : ""} · {locations.length} locations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-blue text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="h-4 w-4" /> Add Item
          </button>
          <button onClick={loadData} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-navy hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
          <input type="text" value={searchInput} onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="Search by name or product code..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
        </div>
        {search && <button onClick={() => { setSearch(""); setSearchInput(""); }} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
        <select value={locationFilter} onChange={(e) => { setLocationFilter(e.target.value); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue">
          <option value="all">All locations</option>
          <option value="none">No location</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm animate-pulse">Loading stock...</div>
        ) : items.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">No items found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-starlight-bg text-left text-[10px] text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-2.5 font-medium w-20">Code</th>
                  <th className="px-4 py-2.5 font-medium">Description</th>
                  <th className="px-4 py-2.5 font-medium text-right w-16">Qty</th>
                  <th className="px-4 py-2.5 font-medium w-24">Location</th>
                  <th className="px-4 py-2.5 font-medium text-right w-20">Weight</th>
                  <th className="px-4 py-2.5 font-medium text-right w-24">Day £</th>
                  <th className="px-4 py-2.5 font-medium text-right w-24">Week £</th>
                  <th className="px-4 py-2.5 font-medium w-24">Category</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isEditing = editing === item.stock_id;
                  if (isEditing) {
                    return (
                      <tr key={item.stock_id} className="border-t border-gray-100 bg-starlight-blue/5">
                        <td className="px-4 py-1.5"><input type="text" value={editForm.product_code || ""} onChange={(e) => setEditForm({...editForm, product_code: e.target.value})} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs" /></td>
                        <td className="px-4 py-1.5"><input type="text" value={editForm.description || ""} onChange={(e) => setEditForm({...editForm, description: e.target.value})} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs" /></td>
                        <td className="px-4 py-1.5"><input type="number" value={editForm.stock_quantity ?? ""} onChange={(e) => setEditForm({...editForm, stock_quantity: parseInt(e.target.value) || 0})} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs text-right" /></td>
                        <td className="px-4 py-1.5"><input type="text" value={editForm.location || ""} onChange={(e) => setEditForm({...editForm, location: e.target.value})} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs" /></td>
                        <td className="px-4 py-1.5"><input type="number" step="0.01" value={editForm.weight_kg ?? ""} onChange={(e) => setEditForm({...editForm, weight_kg: parseFloat(e.target.value) || null})} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs text-right" /></td>
                        <td className="px-4 py-1.5"><input type="number" step="0.01" value={editForm.hire_cost_day ?? ""} onChange={(e) => setEditForm({...editForm, hire_cost_day: parseFloat(e.target.value) || null})} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs text-right" /></td>
                        <td className="px-4 py-1.5"><input type="number" step="0.01" value={editForm.hire_cost_week ?? ""} onChange={(e) => setEditForm({...editForm, hire_cost_week: parseFloat(e.target.value) || null})} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs text-right" /></td>
                        <td className="px-4 py-1.5"><input type="text" value={editForm.category || ""} onChange={(e) => setEditForm({...editForm, category: e.target.value})} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs" /></td>
                        <td className="px-4 py-1.5 flex items-center gap-1">
                          <button onClick={saveEdit} className="p-1 text-starlight-green hover:bg-green-50 rounded"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={item.stock_id} className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.product_code}</td>
                      <td className="px-4 py-2.5 text-navy font-medium">{item.description}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-navy">{item.stock_quantity}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{item.location || "—"}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-mono text-gray-500">{item.weight_kg ? `${item.weight_kg}kg` : "—"}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-mono text-gray-600">{item.hire_cost_day ? formatCurrency(item.hire_cost_day) : "—"}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-mono text-gray-600">{item.hire_cost_week ? formatCurrency(item.hire_cost_week) : "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{item.category || "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(item)} className="p-1 text-gray-300 hover:text-starlight-blue transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => archiveItem(item.stock_id)} className="p-1 text-gray-300 hover:text-starlight-red transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="px-4 py-3 border-t border-gray-100 text-center">
          {loadingMore && <span className="text-xs text-gray-400 animate-pulse">Loading more...</span>}
          {!hasMore && items.length > 0 && <span className="text-xs text-gray-300">Showing all {totalCount} items</span>}
        </div>
      </div>

      {/* Add Item Dialog */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy">Add Stock Item</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Product Code *</label>
                  <input type="text" value={addForm.product_code} onChange={(e) => setAddForm({...addForm, product_code: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
                  <input type="number" value={addForm.stock_quantity} onChange={(e) => setAddForm({...addForm, stock_quantity: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description *</label>
                <input type="text" value={addForm.description} onChange={(e) => setAddForm({...addForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                  <input type="text" value={addForm.location} onChange={(e) => setAddForm({...addForm, location: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="e.g. Woking" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Weight (kg)</label>
                  <input type="number" step="0.01" value={addForm.weight_kg} onChange={(e) => setAddForm({...addForm, weight_kg: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                  <input type="text" value={addForm.category} onChange={(e) => setAddForm({...addForm, category: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hire Cost / Day (£)</label>
                  <input type="number" step="0.01" value={addForm.hire_cost_day} onChange={(e) => setAddForm({...addForm, hire_cost_day: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hire Cost / Week (£)</label>
                  <input type="number" step="0.01" value={addForm.hire_cost_week} onChange={(e) => setAddForm({...addForm, hire_cost_week: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={addItem} disabled={!addForm.product_code || !addForm.description}
                className="px-4 py-2 bg-starlight-blue text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
