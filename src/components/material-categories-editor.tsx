"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { toast } from "sonner";
import { Plus, Trash2, Save, Package } from "lucide-react";

interface CategoryConfig {
  config_id: number;
  category_id: number;
  category_name: string;
  pricing_unit: string;
  buying_unit: string;
  fixed_dimension: string | null;
  bin_pack_mode: string;
  notes: string | null;
  active: boolean;
}

const PRICING_UNITS = ["Each", "Metre", "M²", "Sheet", "Kg", "Litre", "Linear Metre", "Length"];
const BUYING_UNITS = ["Each", "Metre", "Linear Metre", "Length", "Sheet", "Kg", "Litre"];
const FIXED_DIMS = [
  { value: "", label: "None" },
  { value: "standard_length", label: "Standard Length (mm)" },
  { value: "standard_sheet_size", label: "Sheet Size (L×W mm)" },
  { value: "standard_width", label: "Standard Width (mm)" },
];
const BIN_PACK_MODES = [
  { value: "none", label: "None — count only" },
  { value: "1d", label: "1D — fit pieces into standard lengths (timber)" },
  { value: "2d", label: "2D — guillotine pack into sheets" },
  { value: "area", label: "Area — m² ÷ standard width (floor covering)" },
];

export function MaterialCategoriesEditor() {
  const supabase = createClient();
  const [configs, setConfigs] = useState<CategoryConfig[]>([]);
  const [allCategories, setAllCategories] = useState<{ lookup_id: number; lookup_value: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingNew, setAddingNew] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [catsRes, configRes] = await Promise.all([
      supabase.from("tbl_master_lookups")
        .select("lookup_id, lookup_value")
        .eq("category", "MATERIAL_CATEGORY").eq("active", true)
        .order("display_order"),
      supabase.from("tbl_material_category_config")
        .select("*").eq("active", true),
    ]);
    const cats = catsRes.data || [];
    const cfgs = configRes.data || [];
    setAllCategories(cats);
    // Merge: every category gets a config row (even if not in DB yet)
    const merged: CategoryConfig[] = cats.map(cat => {
      const cfg = cfgs.find((c: any) => c.category_id === cat.lookup_id);
      return {
        config_id: cfg?.config_id || 0,
        category_id: cat.lookup_id,
        category_name: cat.lookup_value,
        pricing_unit: cfg?.pricing_unit || "Each",
        buying_unit: cfg?.buying_unit || "Each",
        fixed_dimension: cfg?.fixed_dimension || null,
        bin_pack_mode: cfg?.bin_pack_mode || "none",
        notes: cfg?.notes || null,
        active: true,
      };
    });
    setConfigs(merged);
    setDirty(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const updateField = (idx: number, field: keyof CategoryConfig, value: any) => {
    setConfigs(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
    setDirty(prev => new Set(prev).add(idx));
  };

  const saveAll = async () => {
    setSaving(true);
    for (const idx of dirty) {
      const cfg = configs[idx];
      if (!cfg) continue;
      const row = {
        category_id: cfg.category_id,
        pricing_unit: cfg.pricing_unit,
        buying_unit: cfg.buying_unit,
        fixed_dimension: cfg.fixed_dimension || null,
        bin_pack_mode: cfg.bin_pack_mode,
        notes: cfg.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (cfg.config_id > 0) {
        await supabase.from("tbl_material_category_config").update(row).eq("config_id", cfg.config_id);
      } else {
        const { data } = await supabase.from("tbl_material_category_config").insert(row).select("config_id").single();
        if (data) setConfigs(prev => prev.map((c, i) => i === idx ? { ...c, config_id: data.config_id } : c));
      }
    }
    setDirty(new Set());
    setSaving(false);
    toast.success("Category settings saved");
  };

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setAddingNew(true);
    // Add to lookups
    const maxOrder = allCategories.length * 10 + 10;
    const { data: lookup } = await supabase.from("tbl_master_lookups")
      .insert({ category: "MATERIAL_CATEGORY", lookup_value: name, display_order: maxOrder, active: true })
      .select("lookup_id").single();
    if (!lookup) { toast.error("Failed to create category"); setAddingNew(false); return; }
    // Add default config
    await supabase.from("tbl_material_category_config")
      .insert({ category_id: lookup.lookup_id, pricing_unit: "Each", buying_unit: "Each", bin_pack_mode: "none" });
    setNewCatName("");
    setAddingNew(false);
    toast.success(`Category "${name}" added`);
    loadData();
  };

  const deleteCategory = async (cfg: CategoryConfig) => {
    // Check if any materials use this category
    const { count } = await supabase.from("tbl_materials").select("material_id", { count: "exact", head: true }).eq("material_category", cfg.category_id);
    if (count && count > 0) {
      toast.error(`Cannot delete — ${count} material${count > 1 ? "s" : ""} use this category`);
      return;
    }
    if (!confirm(`Delete category "${cfg.category_name}"? This cannot be undone.`)) return;
    if (cfg.config_id > 0) await supabase.from("tbl_material_category_config").delete().eq("config_id", cfg.config_id);
    await supabase.from("tbl_master_lookups").update({ active: false }).eq("lookup_id", cfg.category_id);
    toast.success(`Category "${cfg.category_name}" removed`);
    loadData();
  };

  if (loading) return <div className="text-sm text-muted animate-pulse">Loading categories...</div>;

  return (
    <div className="space-y-4">
      {/* Save bar */}
      {dirty.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-starlight-blue/5 border border-starlight-blue/20 rounded-lg">
          <span className="text-xs text-starlight-blue">{dirty.size} unsaved change{dirty.size > 1 ? "s" : ""}</span>
          <button onClick={saveAll} disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-starlight-blue text-white text-xs font-medium rounded-lg hover:bg-starlight-blue/90 transition-colors disabled:opacity-50">
            <Save className="h-3.5 w-3.5" />{saving ? "Saving..." : "Save All"}
          </button>
        </div>
      )}

      {/* Category rows */}
      <div className="space-y-3">
        {configs.map((cfg, idx) => (
          <div key={cfg.category_id} className={"card p-4 space-y-3 " + (dirty.has(idx) ? "ring-1 ring-starlight-blue/30" : "")}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted" />
                <h3 className="text-sm font-semibold text-navy">{cfg.category_name}</h3>
              </div>
              <button onClick={() => deleteCategory(cfg)}
                className="p-1 text-faint hover:text-starlight-red transition-colors" title="Delete category">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Supplier prices in</label>
                <select value={cfg.pricing_unit} onChange={e => updateField(idx, "pricing_unit", e.target.value)}
                  className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                  {PRICING_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">You buy in</label>
                <select value={cfg.buying_unit} onChange={e => updateField(idx, "buying_unit", e.target.value)}
                  className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                  {BUYING_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Fixed dimension</label>
                <select value={cfg.fixed_dimension || ""} onChange={e => updateField(idx, "fixed_dimension", e.target.value || null)}
                  className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                  {FIXED_DIMS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Cut list packing</label>
                <select value={cfg.bin_pack_mode} onChange={e => updateField(idx, "bin_pack_mode", e.target.value)}
                  className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                  {BIN_PACK_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>

            {cfg.notes && (
              <p className="text-[10px] text-muted italic">{cfg.notes}</p>
            )}
            <input type="text" value={cfg.notes || ""} onChange={e => updateField(idx, "notes", e.target.value || null)}
              placeholder="Notes (e.g. conversion explanation)..."
              className="w-full px-2 py-1 text-xs border border-transparent hover:border-subtle focus:border-starlight-blue rounded bg-transparent focus:bg-surface focus:outline-none placeholder:text-faint" />

            {/* Conversion preview */}
            {cfg.pricing_unit !== cfg.buying_unit && (
              <div className="text-[10px] text-starlight-blue bg-starlight-blue/5 px-2 py-1 rounded">
                Conversion: supplier prices per <span className="font-semibold">{cfg.pricing_unit}</span> → you order in <span className="font-semibold">{cfg.buying_unit}</span>
                {cfg.fixed_dimension && <> using <span className="font-semibold">{FIXED_DIMS.find(d => d.value === cfg.fixed_dimension)?.label || cfg.fixed_dimension}</span></>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new category */}
      <div className="flex items-center gap-2 pt-2 border-t border-subtle">
        <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
          placeholder="New category name..."
          onKeyDown={e => e.key === "Enter" && addCategory()}
          className="flex-1 px-3 py-2 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue placeholder:text-faint" />
        <button onClick={addCategory} disabled={!newCatName.trim() || addingNew}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-starlight-green text-white text-xs font-medium rounded-lg hover:bg-starlight-green/90 transition-colors disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />{addingNew ? "Adding..." : "Add Category"}
        </button>
      </div>
    </div>
  );
}
