"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import type { Material, MasterLookup } from "@/lib/types";
import {
  Package, Plus, Search, Pencil, X,
  RefreshCw, Archive, History,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface MaterialRow extends Material {
  category_name?: string;
}

interface PriceEntry {
  price_id: number;
  material_id: number;
  unit_cost: number;
  effective_date: string;
  supplier: string | null;
  source: string | null;
  notes: string | null;
  recorded_by: number | null;
  recorded_at: string | null;
}

type TabKey = "catalogue" | "prices";

// ============================================================
// Form defaults
// ============================================================

const EMPTY_FORM = {
  material_name: "",
  material_category: "",
  unit: "",
  standard_length: "",
  standard_sheet_size: "",
  current_unit_cost: "",
  primary_supplier: "",
  notes: "",
  spec_val_1: "",
  spec_val_2: "",
  spec_val_3: "",
  spec_text_1: "",
  spec_text_2: "",
  paint_finish: "",
};

type FormState = typeof EMPTY_FORM;

// ============================================================
// Main Page
// ============================================================

export default function MaterialsPage() {
  const supabase = createClient();

  // Data
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [categories, setCategories] = useState<MasterLookup[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("All");
  const [showInactive, setShowInactive] = useState(false);

  // Tab
  const [tab, setTab] = useState<TabKey>("catalogue");

  // Add/Edit dialog
  const [showDialog, setShowDialog] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<MaterialRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Price history
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [priceForm, setPriceForm] = useState({
    unit_cost: "",
    effective_date: new Date().toISOString().split("T")[0],
    supplier: "",
    source: "Invoice",
    notes: "",
  });

  // ============================================================
  // Load data
  // ============================================================

  const loadData = useCallback(async () => {
    setLoading(true);
    const [matRes, catRes] = await Promise.all([
      supabase.from("tbl_materials").select("*").order("material_name"),
      supabase.from("tbl_master_lookups").select("*").eq("category", "MATERIAL_CATEGORY").eq("active", true).order("display_order"),
    ]);

    const catMap: Record<number, string> = {};
    (catRes.data || []).forEach((c: MasterLookup) => {
      catMap[c.lookup_id] = c.lookup_value || "";
    });

    if (matRes.data) {
      setMaterials(matRes.data.map((m: Material) => ({
        ...m,
        category_name: m.material_category ? catMap[m.material_category] || "Unknown" : "—",
      })));
    }
    if (catRes.data) setCategories(catRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ============================================================
  // Filtered materials
  // ============================================================

  const filtered = materials.filter((m) => {
    if (!showInactive && !isTruthy(m.active)) return false;
    if (catFilter !== "All" && m.category_name !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (m.material_name || "").toLowerCase().includes(q) ||
        (m.primary_supplier || "").toLowerCase().includes(q) ||
        (m.notes || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeCount = materials.filter((m) => isTruthy(m.active)).length;
  const categoryNames = [...new Set(materials.map((m) => m.category_name || "—"))].sort();

  // ============================================================
  // Add / Edit handlers
  // ============================================================

  const openAddDialog = () => {
    setEditingMaterial(null);
    setForm({ ...EMPTY_FORM });
    setShowDialog(true);
  };

  const openEditDialog = (m: MaterialRow) => {
    setEditingMaterial(m);
    setForm({
      material_name: m.material_name || "",
      material_category: m.material_category ? String(m.material_category) : "",
      unit: m.unit || "",
      standard_length: m.standard_length ? String(m.standard_length) : "",
      standard_sheet_size: m.standard_sheet_size || "",
      current_unit_cost: m.current_unit_cost ? String(m.current_unit_cost) : "",
      primary_supplier: m.primary_supplier || "",
      notes: m.notes || "",
      spec_val_1: m.spec_val_1 ? String(m.spec_val_1) : "",
      spec_val_2: m.spec_val_2 ? String(m.spec_val_2) : "",
      spec_val_3: m.spec_val_3 ? String(m.spec_val_3) : "",
      spec_text_1: m.spec_text_1 || "",
      spec_text_2: m.spec_text_2 || "",
      paint_finish: m.paint_finish || "",
    });
    setShowDialog(true);
  };

  const saveMaterial = async () => {
    if (!form.material_name.trim()) return;
    setSaving(true);

    const payload: Record<string, any> = {
      material_name: form.material_name.trim(),
      material_category: form.material_category ? Number(form.material_category) : null,
      unit: form.unit.trim() || null,
      standard_length: form.standard_length ? Number(form.standard_length) : null,
      standard_sheet_size: form.standard_sheet_size.trim() || null,
      current_unit_cost: form.current_unit_cost ? Number(form.current_unit_cost) : null,
      primary_supplier: form.primary_supplier.trim() || null,
      notes: form.notes.trim() || null,
      spec_val_1: form.spec_val_1 ? Number(form.spec_val_1) : null,
      spec_val_2: form.spec_val_2 ? Number(form.spec_val_2) : null,
      spec_val_3: form.spec_val_3 ? Number(form.spec_val_3) : null,
      spec_text_1: form.spec_text_1.trim() || null,
      spec_text_2: form.spec_text_2.trim() || null,
      paint_finish: form.paint_finish.trim() || null,
    };

    if (editingMaterial) {
      await supabase.from("tbl_materials").update(payload).eq("material_id", editingMaterial.material_id);
    } else {
      payload.active = true;
      await supabase.from("tbl_materials").insert(payload);
    }

    setSaving(false);
    setShowDialog(false);
    loadData();
  };

  const toggleActive = async (m: MaterialRow) => {
    const newVal = !isTruthy(m.active);
    await supabase.from("tbl_materials").update({ active: newVal }).eq("material_id", m.material_id);
    loadData();
  };

  // ============================================================
  // Price history handlers
  // ============================================================

  const loadPrices = useCallback(async (materialId: number) => {
    setPricesLoading(true);
    setSelectedMaterialId(materialId);
    const { data } = await supabase
      .from("tbl_material_prices")
      .select("*")
      .eq("material_id", materialId)
      .order("effective_date", { ascending: false });
    setPrices(data || []);
    setPricesLoading(false);
  }, []);

  const savePrice = async () => {
    if (!selectedMaterialId || !priceForm.unit_cost) return;
    setSaving(true);

    const newCost = Number(priceForm.unit_cost);

    // Insert price record
    await supabase.from("tbl_material_prices").insert({
      material_id: selectedMaterialId,
      unit_cost: newCost,
      effective_date: priceForm.effective_date,
      supplier: priceForm.supplier.trim() || null,
      source: priceForm.source || null,
      notes: priceForm.notes.trim() || null,
    });

    // Auto-update current_unit_cost if this is the latest price
    const { data: latest } = await supabase
      .from("tbl_material_prices")
      .select("effective_date")
      .eq("material_id", selectedMaterialId)
      .order("effective_date", { ascending: false })
      .limit(1);

    if (latest && latest.length > 0 && latest[0].effective_date <= priceForm.effective_date) {
      await supabase.from("tbl_materials")
        .update({ current_unit_cost: newCost })
        .eq("material_id", selectedMaterialId);
    }

    setPriceForm({
      unit_cost: "",
      effective_date: new Date().toISOString().split("T")[0],
      supplier: "",
      source: "Invoice",
      notes: "",
    });
    setShowPriceForm(false);
    setSaving(false);
    loadPrices(selectedMaterialId);
    loadData();
  };

  const selectedMaterial = materials.find((m) => m.material_id === selectedMaterialId);

  // ============================================================
  // Contextual fields based on category
  // ============================================================

  const selectedCategoryName = editingMaterial
    ? editingMaterial.category_name
    : form.material_category
      ? categories.find((c) => c.lookup_id === Number(form.material_category))?.lookup_value
      : null;

  const showLength = selectedCategoryName === "Timber" || selectedCategoryName === "Metal" || selectedCategoryName === "Fabric";
  const showSheetSize = selectedCategoryName === "Sheet";

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">Loading materials catalogue...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Materials Catalogue</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {activeCount} active materials · {categories.length} categories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-navy hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={openAddDialog}
            className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Material
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(["catalogue", "prices"] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "px-4 py-2 rounded-md text-sm font-medium transition-colors " +
              (tab === t ? "bg-white text-navy shadow-sm" : "text-gray-500 hover:text-navy")
            }
          >
            {t === "catalogue" ? (
              <span className="flex items-center gap-2"><Package className="h-4 w-4" /> Catalogue</span>
            ) : (
              <span className="flex items-center gap-2"><History className="h-4 w-4" /> Price History</span>
            )}
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/* TAB: Catalogue                                                */}
      {/* ============================================================ */}
      {tab === "catalogue" && (
        <>
          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search materials..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show inactive
            </label>
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCatFilter("All")}
              className={
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors " +
                (catFilter === "All"
                  ? "bg-navy text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200")
              }
            >
              All ({materials.filter(m => showInactive || isTruthy(m.active)).length})
            </button>
            {categoryNames.map((cat) => {
              const count = materials.filter(
                (m) => m.category_name === cat && (showInactive || isTruthy(m.active))
              ).length;
              if (count === 0 && catFilter !== cat) return null;
              return (
                <button
                  key={cat}
                  onClick={() => setCatFilter(catFilter === cat ? "All" : cat)}
                  className={
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors " +
                    (catFilter === cat
                      ? "bg-navy text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200")
                  }
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            {filtered.length === 0 ? (
              <div className="px-6 py-10 text-center text-gray-400 text-sm">
                {search ? "No materials match your search" : "No materials in catalogue yet"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-starlight-bg text-left text-[10px] text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-2 font-medium">Material</th>
                      <th className="px-4 py-2 font-medium">Category</th>
                      <th className="px-4 py-2 font-medium">Unit</th>
                      <th className="px-4 py-2 font-medium text-right">Unit Cost</th>
                      <th className="px-4 py-2 font-medium">Supplier</th>
                      <th className="px-4 py-2 font-medium">Size / Length</th>
                      <th className="px-4 py-2 font-medium w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m) => (
                      <tr
                        key={m.material_id}
                        className={
                          "border-t border-gray-100 transition-colors hover:bg-gray-50 " +
                          (!isTruthy(m.active) ? "opacity-50" : "")
                        }
                      >
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-navy">{m.material_name || "—"}</p>
                          {m.notes && (
                            <p className="text-[10px] text-gray-400 mt-0.5 max-w-[250px] truncate">{m.notes}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            {m.category_name}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{m.unit || "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-navy">
                          {m.current_unit_cost ? formatCurrency(m.current_unit_cost) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{m.primary_supplier || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          {m.standard_length ? `${m.standard_length}m` : ""}
                          {m.standard_sheet_size || ""}
                          {!m.standard_length && !m.standard_sheet_size && "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => { setTab("prices"); loadPrices(m.material_id); }}
                              title="Price history"
                              className="p-1.5 text-gray-400 hover:text-starlight-blue hover:bg-blue-50 rounded-md transition-colors"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openEditDialog(m)}
                              title="Edit"
                              className="p-1.5 text-gray-400 hover:text-navy hover:bg-gray-100 rounded-md transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => toggleActive(m)}
                              title={isTruthy(m.active) ? "Deactivate" : "Reactivate"}
                              className="p-1.5 text-gray-400 hover:text-starlight-amber hover:bg-amber-50 rounded-md transition-colors"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* TAB: Price History                                            */}
      {/* ============================================================ */}
      {tab === "prices" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Material selector */}
          <div className="card overflow-hidden lg:col-span-1">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-navy">Select Material</h3>
            </div>
            <div className="p-3">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                />
              </div>
              <div className="max-h-[500px] overflow-y-auto space-y-0.5">
                {materials
                  .filter((m) => isTruthy(m.active))
                  .filter((m) =>
                    !search || (m.material_name || "").toLowerCase().includes(search.toLowerCase())
                  )
                  .map((m) => (
                    <button
                      key={m.material_id}
                      onClick={() => loadPrices(m.material_id)}
                      className={
                        "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors " +
                        (selectedMaterialId === m.material_id
                          ? "bg-starlight-blue/10 text-starlight-blue font-medium"
                          : "text-gray-700 hover:bg-gray-50")
                      }
                    >
                      <p className="truncate">{m.material_name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {m.category_name} · {m.current_unit_cost ? formatCurrency(m.current_unit_cost) : "no price"}
                      </p>
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Price history panel */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedMaterialId ? (
              <div className="card px-6 py-12 text-center text-gray-400 text-sm">
                Select a material to view its price history
              </div>
            ) : (
              <>
                {/* Selected material header */}
                <div className="card px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-navy">{selectedMaterial?.material_name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {selectedMaterial?.category_name} · {selectedMaterial?.unit || "—"} · Current: {selectedMaterial?.current_unit_cost ? formatCurrency(selectedMaterial.current_unit_cost) : "not set"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setShowPriceForm(true);
                        setPriceForm({
                          unit_cost: "",
                          effective_date: new Date().toISOString().split("T")[0],
                          supplier: selectedMaterial?.primary_supplier || "",
                          source: "Invoice",
                          notes: "",
                        });
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-starlight-red text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Price
                    </button>
                  </div>
                </div>

                {/* Add price form */}
                {showPriceForm && (
                  <div className="card px-5 py-4 border-l-4 border-l-starlight-blue">
                    <h4 className="text-xs font-semibold text-navy mb-3">New Price Entry</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">Unit Cost (£) *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={priceForm.unit_cost}
                          onChange={(e) => setPriceForm({ ...priceForm, unit_cost: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                          placeholder="0.00"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">Effective Date</label>
                        <input
                          type="date"
                          value={priceForm.effective_date}
                          onChange={(e) => setPriceForm({ ...priceForm, effective_date: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">Source</label>
                        <select
                          value={priceForm.source}
                          onChange={(e) => setPriceForm({ ...priceForm, source: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                        >
                          <option value="Quote">Quote</option>
                          <option value="Invoice">Invoice</option>
                          <option value="Estimate">Estimate</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">Supplier</label>
                        <input
                          type="text"
                          value={priceForm.supplier}
                          onChange={(e) => setPriceForm({ ...priceForm, supplier: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                          placeholder="Supplier name"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">Notes</label>
                      <input
                        type="text"
                        value={priceForm.notes}
                        onChange={(e) => setPriceForm({ ...priceForm, notes: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                        placeholder="Bulk discount, minimum order, etc."
                      />
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        onClick={() => setShowPriceForm(false)}
                        className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={savePrice}
                        disabled={saving || !priceForm.unit_cost}
                        className="px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {saving ? "Saving..." : "Save Price"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Price history table */}
                <div className="card overflow-hidden">
                  {pricesLoading ? (
                    <div className="px-6 py-8 text-center text-gray-400 text-sm animate-pulse">Loading prices...</div>
                  ) : prices.length === 0 ? (
                    <div className="px-6 py-8 text-center text-gray-400 text-sm">
                      No price history recorded for this material
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-starlight-bg text-left text-[10px] text-gray-400 uppercase tracking-wider">
                            <th className="px-4 py-2 font-medium">Effective Date</th>
                            <th className="px-4 py-2 font-medium text-right">Unit Cost</th>
                            <th className="px-4 py-2 font-medium">Source</th>
                            <th className="px-4 py-2 font-medium">Supplier</th>
                            <th className="px-4 py-2 font-medium">Notes</th>
                            <th className="px-4 py-2 font-medium">Recorded</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prices.map((p, idx) => (
                            <tr
                              key={p.price_id}
                              className={
                                "border-t border-gray-100 " +
                                (idx === 0 ? "bg-starlight-blue/5" : "")
                              }
                            >
                              <td className="px-4 py-2.5 font-medium text-navy">
                                {formatDate(p.effective_date)}
                                {idx === 0 && (
                                  <span className="ml-2 text-[10px] text-starlight-blue font-medium">CURRENT</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-navy font-medium">
                                {formatCurrency(p.unit_cost)}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={
                                  "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium " +
                                  (p.source === "Invoice" ? "bg-starlight-green/10 text-starlight-green" :
                                   p.source === "Quote" ? "bg-starlight-blue/10 text-starlight-blue" :
                                   "bg-gray-100 text-gray-500")
                                }>
                                  {p.source || "—"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">{p.supplier || "—"}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[200px] truncate">{p.notes || "—"}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">
                                {p.recorded_at ? formatDate(p.recorded_at) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Add / Edit Dialog                                             */}
      {/* ============================================================ */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-xl z-10">
              <h3 className="text-sm font-semibold text-navy">
                {editingMaterial ? "Edit Material" : "Add Material"}
              </h3>
              <button onClick={() => setShowDialog(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Material Name *</label>
                <input
                  type="text"
                  value={form.material_name}
                  onChange={(e) => setForm({ ...form, material_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                  placeholder="e.g. 2×1 PAR Softwood"
                  autoFocus
                />
              </div>

              {/* Category + Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                  <select
                    value={form.material_category}
                    onChange={(e) => setForm({ ...form, material_category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                  >
                    <option value="">Select category...</option>
                    {categories.map((c) => (
                      <option key={c.lookup_id} value={c.lookup_id}>{c.lookup_value}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                    placeholder="Metre / Sheet / Litre / Each"
                  />
                </div>
              </div>

              {/* Cost + Supplier */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Current Unit Cost (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.current_unit_cost}
                    onChange={(e) => setForm({ ...form, current_unit_cost: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Primary Supplier</label>
                  <input
                    type="text"
                    value={form.primary_supplier}
                    onChange={(e) => setForm({ ...form, primary_supplier: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                    placeholder="Supplier name"
                  />
                </div>
              </div>

              {/* Standard size fields — only when category is relevant */}
              {(showLength || showSheetSize) && (
                <div className="grid grid-cols-2 gap-3">
                  {showLength && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Standard Length (m)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.standard_length}
                        onChange={(e) => setForm({ ...form, standard_length: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                        placeholder="e.g. 2.4"
                      />
                    </div>
                  )}
                  {showSheetSize && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Standard Sheet Size</label>
                      <input
                        type="text"
                        value={form.standard_sheet_size}
                        onChange={(e) => setForm({ ...form, standard_sheet_size: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                        placeholder="e.g. 2440×1220"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Spec fields */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-3">Specification Fields</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Spec Value 1</label>
                    <input type="number" step="any" value={form.spec_val_1} onChange={(e) => setForm({ ...form, spec_val_1: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Spec Value 2</label>
                    <input type="number" step="any" value={form.spec_val_2} onChange={(e) => setForm({ ...form, spec_val_2: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Spec Value 3</label>
                    <input type="number" step="any" value={form.spec_val_3} onChange={(e) => setForm({ ...form, spec_val_3: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Spec Text 1</label>
                    <input type="text" value={form.spec_text_1} onChange={(e) => setForm({ ...form, spec_text_1: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Spec Text 2</label>
                    <input type="text" value={form.spec_text_2} onChange={(e) => setForm({ ...form, spec_text_2: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Paint / Finish</label>
                  <input type="text" value={form.paint_finish} onChange={(e) => setForm({ ...form, paint_finish: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="e.g. Matt, Satin, Gloss" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
                  placeholder="Handling, ordering, or specification notes..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white rounded-b-xl">
              <button
                onClick={() => setShowDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveMaterial}
                disabled={saving || !form.material_name.trim()}
                className="px-5 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : editingMaterial ? "Update" : "Add Material"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
