"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { toast } from "sonner";
import { Plus, Trash2, Search, Package, Pencil, GripVertical, ArrowUp, ArrowDown, Lightbulb, ChevronDown, ChevronRight } from "lucide-react";

interface Category {
  category_id: number;
  category_name: string;
  guidance_note: string | null;
}

interface PromptRow {
  prompt_id: number;
  category_id: number;
  description: string | null;
  typical_item_type: string | null;
  stock_item_id: number | null;
  quantity_default: number | null;
  display_order: number | null;
  prompt_group: string | null;
  // Resolved
  stock_description?: string;
}

interface StockResult {
  stock_id: number;
  product_code: string;
  description: string;
  category: string | null;
}

export function TypicalComponentsEditor() {
  const supabase = createClient();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [guidanceNote, setGuidanceNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add bespoke form
  const [showAddBespoke, setShowAddBespoke] = useState(false);
  const [bespokeDesc, setBespokeDesc] = useState("");
  const [bespokeQty, setBespokeQty] = useState("1");
  const [bespokeType, setBespokeType] = useState("Bespoke");

  // Stock search
  const [showStockSearch, setShowStockSearch] = useState(false);
  const [stockQuery, setStockQuery] = useState("");
  const [stockResults, setStockResults] = useState<StockResult[]>([]);
  const [stockSearching, setStockSearching] = useState(false);

  // Group management
  const [addGroup, setAddGroup] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [stockAddGroup, setStockAddGroup] = useState("");


  // Load categories
  useEffect(() => {
    supabase.from("tbl_scope_item_categories")
      .select("category_id, category_name, guidance_note")
      .eq("active", true)
      .order("category_name")
      .then(({ data }) => {
        if (data) setCategories(data);
        setLoading(false);
      });
  }, []);

  // Load prompts for selected category
  const loadPrompts = useCallback(async (catId: number) => {
    const { data } = await supabase
      .from("tbl_category_prompts")
      .select("*")
      .eq("category_id", catId)
      .order("display_order");
    if (data && data.length > 0) {
      // Resolve stock descriptions
      const stockIds = data.filter((p: any) => p.stock_item_id).map((p: any) => p.stock_item_id);
      let stockMap: Record<number, string> = {};
      if (stockIds.length > 0) {
        const { data: items } = await supabase.from("tbl_stock_items").select("stock_id, description").in("stock_id", stockIds);
        (items || []).forEach((s: any) => { stockMap[s.stock_id] = s.description; });
      }
      setPrompts(data.map((p: any) => ({ ...p, stock_description: stockMap[p.stock_item_id] || undefined })));
    } else {
      setPrompts([]);
    }
  }, []);

  // On category change
  const handleCategoryChange = (catId: number) => {
    setSelectedCatId(catId);
    const cat = categories.find(c => c.category_id === catId);
    setGuidanceNote(cat?.guidance_note || "");
    loadPrompts(catId);
    setShowAddBespoke(false);
    setShowStockSearch(false);
  };

  // Save guidance note
  const saveGuidance = async () => {
    if (!selectedCatId) return;
    setSaving(true);
    await supabase.from("tbl_scope_item_categories")
      .update({ guidance_note: guidanceNote.trim() || null })
      .eq("category_id", selectedCatId);
    setCategories(prev => prev.map(c => c.category_id === selectedCatId ? { ...c, guidance_note: guidanceNote.trim() || null } : c));
    setSaving(false);
    toast.success("Guidance saved");
  };

  // Add bespoke prompt
  const addBespoke = async () => {
    if (!selectedCatId || !bespokeDesc.trim()) return;
    const maxOrder = prompts.reduce((m, p) => Math.max(m, p.display_order || 0), 0);
    const group = addGroup === "__new__" ? newGroupName.trim() || null : addGroup || null;
    const { data } = await supabase.from("tbl_category_prompts").insert({
      category_id: selectedCatId,
      description: bespokeDesc.trim(),
      typical_item_type: bespokeType,
      quantity_default: parseInt(bespokeQty) || 1,
      display_order: maxOrder + 1,
      prompt_group: group,
    }).select().single();
    if (data) setPrompts(prev => [...prev, data]);
    setBespokeDesc("");
    setBespokeQty("1");
    setShowAddBespoke(false);
    setAddGroup("");
    setNewGroupName("");
    toast.success("Added");
  };


  // Stock search
  const searchStock = async () => {
    if (stockQuery.length < 2) return;
    setStockSearching(true);
    const { data } = await supabase.from("tbl_stock_items")
      .select("stock_id, product_code, description, category")
      .eq("active", true)
      .or(`description.ilike.%${stockQuery}%,product_code.ilike.%${stockQuery}%`)
      .limit(12);
    setStockResults(data || []);
    setStockSearching(false);
  };

  // Add stock prompt
  const addStockPrompt = async (item: StockResult) => {
    if (!selectedCatId) return;
    // Check if already exists
    if (prompts.some(p => p.stock_item_id === item.stock_id)) {
      toast.error("Already in list");
      return;
    }
    const maxOrder = prompts.reduce((m, p) => Math.max(m, p.display_order || 0), 0);
    const group = stockAddGroup === "__new__" ? newGroupName.trim() || null : stockAddGroup || null;
    const { data } = await supabase.from("tbl_category_prompts").insert({
      category_id: selectedCatId,
      description: item.description,
      typical_item_type: "Stock",
      stock_item_id: item.stock_id,
      quantity_default: 1,
      display_order: maxOrder + 1,
      prompt_group: group,
    }).select().single();
    if (data) setPrompts(prev => [...prev, { ...data, stock_description: item.description }]);
    toast.success(`Added: ${item.description.substring(0, 40)}`);
  };

  // Delete prompt
  const deletePrompt = async (promptId: number) => {
    await supabase.from("tbl_category_prompts").delete().eq("prompt_id", promptId);
    setPrompts(prev => prev.filter(p => p.prompt_id !== promptId));
  };

  // Reorder
  const movePrompt = async (promptId: number, direction: "up" | "down") => {
    const idx = prompts.findIndex(p => p.prompt_id === promptId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= prompts.length) return;
    const a = prompts[idx];
    const b = prompts[swapIdx];
    const aOrder = a.display_order || idx + 1;
    const bOrder = b.display_order || swapIdx + 1;
    await Promise.all([
      supabase.from("tbl_category_prompts").update({ display_order: bOrder }).eq("prompt_id", a.prompt_id),
      supabase.from("tbl_category_prompts").update({ display_order: aOrder }).eq("prompt_id", b.prompt_id),
    ]);
    const updated = [...prompts];
    updated[idx] = { ...a, display_order: bOrder };
    updated[swapIdx] = { ...b, display_order: aOrder };
    updated.sort((x, y) => (x.display_order || 0) - (y.display_order || 0));
    setPrompts(updated);
  };

  const selectedCat = categories.find(c => c.category_id === selectedCatId);
  const existingGroups = [...new Set(prompts.map(p => p.prompt_group).filter(Boolean))] as string[];

  // Change group on existing item
  const changeGroup = async (promptId: number, group: string | null) => {
    await supabase.from("tbl_category_prompts").update({ prompt_group: group }).eq("prompt_id", promptId);
    setPrompts(prev => prev.map(p => p.prompt_id === promptId ? { ...p, prompt_group: group } : p));
  };

  if (loading) return <div className="text-sm text-gray-400 animate-pulse">Loading categories...</div>;


  return (
    <div className="space-y-5">
      {/* Category selector */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Category</label>
        <select
          value={selectedCatId || ""}
          onChange={(e) => e.target.value && handleCategoryChange(Number(e.target.value))}
          className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
        >
          <option value="">Select a category...</option>
          {categories.map(c => (
            <option key={c.category_id} value={c.category_id}>
              {c.category_name} ({prompts.length > 0 && c.category_id === selectedCatId ? `${prompts.length} items` : "—"})
            </option>
          ))}
        </select>
      </div>

      {selectedCatId && (
        <>
          {/* Guidance note */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
              Category Guidance Note
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Shown at the top of Typical Components on scope pages. Tips, reminders, category-specific instructions.
            </p>
            <textarea
              value={guidanceNote}
              onChange={(e) => setGuidanceNote(e.target.value)}
              onBlur={saveGuidance}
              rows={3}
              placeholder="e.g. Check deck sizes against venue plan. Allow 2 bolts per join. Triangle decks for curved edges only."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none placeholder:text-gray-300"
            />
          </div>

          {/* Prompt list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-navy">
                Components ({prompts.length})
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowStockSearch(true); setShowAddBespoke(false); setStockQuery(""); setStockResults([]); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-starlight-blue border border-starlight-blue/30 rounded-lg hover:bg-starlight-blue/5 transition-colors"
                >
                  <Package className="h-3.5 w-3.5" /> Add from Stock
                </button>
                <button
                  onClick={() => { setShowAddBespoke(true); setShowStockSearch(false); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-navy border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Bespoke
                </button>
              </div>
            </div>


            {/* Stock search panel */}
            {showStockSearch && (
              <div className="card p-4 mb-3 border-starlight-blue/30">
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={stockQuery}
                    onChange={(e) => setStockQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchStock()}
                    placeholder="Search stock by name or code..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                    autoFocus
                  />
                  <button onClick={searchStock} disabled={stockQuery.length < 2}
                    className="px-3 py-2 bg-starlight-blue text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    <Search className="h-4 w-4" />
                  </button>
                  <button onClick={() => setShowStockSearch(false)}
                    className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600">
                    Cancel
                  </button>
                </div>
                <div className="mb-3 flex gap-1.5 items-end">
                  <div className="w-36">
                    <label className="text-[10px] text-gray-400 block mb-0.5">Group</label>
                    <select value={stockAddGroup} onChange={e => { setStockAddGroup(e.target.value); if (e.target.value !== "__new__") setNewGroupName(""); }}
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                      <option value="">No group</option>
                      {existingGroups.map(g => <option key={g} value={g}>{g}</option>)}
                      <option value="__new__">+ New group...</option>
                    </select>
                  </div>
                  {stockAddGroup === "__new__" && (
                    <div className="w-32">
                      <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                        placeholder="Group name"
                        className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                    </div>
                  )}
                </div>
                {stockSearching && <p className="text-xs text-gray-400 animate-pulse">Searching...</p>}
                {stockResults.length > 0 && (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {stockResults.map(item => (
                      <div key={item.stock_id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-navy truncate">{item.description}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{item.product_code} · {item.category || "—"}</p>
                        </div>
                        <button onClick={() => addStockPrompt(item)}
                          className="ml-2 p-1.5 text-starlight-green hover:bg-green-50 rounded-md shrink-0">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {!stockSearching && stockResults.length === 0 && stockQuery.length >= 2 && (
                  <p className="text-xs text-gray-400">No stock items found</p>
                )}
              </div>
            )}

            {/* Add bespoke form */}
            {showAddBespoke && (
              <div className="card p-4 mb-3">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-400 block mb-0.5">Description</label>
                    <input type="text" value={bespokeDesc} onChange={(e) => setBespokeDesc(e.target.value)}
                      placeholder="e.g. M10 60mm bolts"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                      autoFocus />
                  </div>
                  <div className="w-20">
                    <label className="text-[10px] text-gray-400 block mb-0.5">Default qty</label>
                    <input type="number" value={bespokeQty} onChange={(e) => setBespokeQty(e.target.value)} min="1"
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                  </div>
                  <div className="w-28">
                    <label className="text-[10px] text-gray-400 block mb-0.5">Type</label>
                    <select value={bespokeType} onChange={(e) => setBespokeType(e.target.value)}
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                      <option value="Bespoke">Bespoke</option>
                      <option value="Stock-Needs-Work">Stock-Needs-Work</option>
                    </select>
                  </div>
                  <button onClick={addBespoke} disabled={!bespokeDesc.trim()}
                    className="px-3 py-2 bg-navy text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 shrink-0">
                    Add
                  </button>
                  <button onClick={() => setShowAddBespoke(false)}
                    className="px-2 py-2 text-xs text-gray-400 hover:text-gray-600 shrink-0">
                    Cancel
                  </button>
                </div>
                <div className="mt-2 flex gap-1.5 items-end">
                  <div className="w-36">
                    <label className="text-[10px] text-gray-400 block mb-0.5">Group</label>
                    <select value={addGroup} onChange={e => { setAddGroup(e.target.value); if (e.target.value !== "__new__") setNewGroupName(""); }}
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                      <option value="">No group</option>
                      {existingGroups.map(g => <option key={g} value={g}>{g}</option>)}
                      <option value="__new__">+ New group...</option>
                    </select>
                  </div>
                  {addGroup === "__new__" && (
                    <div className="w-32">
                      <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                        placeholder="Group name"
                        className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                    </div>
                  )}
                </div>
              </div>
            )}


            {/* Prompt items — grouped */}
            {prompts.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                No typical components defined for {selectedCat?.category_name}. Add some above.
              </div>
            ) : (() => {
              const ungrouped = prompts.filter(p => !p.prompt_group);
              const groups = existingGroups;
              const renderItem = (p: PromptRow, idx: number, list: PromptRow[]) => (
                <div key={p.prompt_id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-gray-200 bg-white group">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button onClick={() => movePrompt(p.prompt_id, "up")} disabled={idx === 0}
                      className="p-0.5 text-gray-300 hover:text-navy disabled:opacity-20 transition-colors">
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button onClick={() => movePrompt(p.prompt_id, "down")} disabled={idx === list.length - 1}
                      className="p-0.5 text-gray-300 hover:text-navy disabled:opacity-20 transition-colors">
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                    p.stock_item_id ? "bg-starlight-blue/10 text-starlight-blue" : "bg-gray-100 text-gray-500"
                  }`}>
                    {p.stock_item_id ? "Stock" : (p.typical_item_type || "Bespoke")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-navy truncate">{p.stock_description || p.description}</p>
                  </div>
                  {p.quantity_default && p.quantity_default > 1 && (
                    <span className="text-xs text-gray-400 shrink-0">×{p.quantity_default}</span>
                  )}
                  <select value={p.prompt_group || ""} onChange={e => changeGroup(p.prompt_id, e.target.value || null)}
                    className="text-[10px] text-gray-400 border-0 bg-transparent focus:outline-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity w-20 shrink-0"
                    title="Change group">
                    <option value="">No group</option>
                    {existingGroups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <button onClick={() => deletePrompt(p.prompt_id)}
                    className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
              return (
                <div className="space-y-3">
                  {ungrouped.length > 0 && (
                    <div className="space-y-1">
                      {ungrouped.map((p, idx) => renderItem(p, idx, ungrouped))}
                    </div>
                  )}
                  {groups.map(groupName => {
                    const groupItems = prompts.filter(p => p.prompt_group === groupName);
                    return (
                      <div key={groupName} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 flex items-center gap-2">
                          <span className="text-xs font-semibold text-navy uppercase tracking-wider">{groupName}</span>
                          <span className="text-[10px] text-gray-400">{groupItems.length}</span>
                        </div>
                        <div className="p-1 space-y-1">
                          {groupItems.map((p, idx) => renderItem(p, idx, groupItems))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
