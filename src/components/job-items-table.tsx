"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { LookupCombo } from "@/components/ui/lookup-combo";
import { Plus, Trash2, CheckCircle2, Circle, Search } from "lucide-react";

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
}

interface StockItem {
  stock_id: number;
  stock_ref: string | null;
  description: string | null;
  category: string | null;
}

interface JobItemsTableProps {
  jobId: number;
  scopeItemId: number;
  onSelectionChange: (selectedIds: number[]) => void;
}

export function JobItemsTable({
  jobId,
  scopeItemId,
  onSelectionChange,
}: JobItemsTableProps) {
  const supabase = createClient();
  const [items, setItems] = useState<JobItemRow[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockSearch, setStockSearch] = useState("");
  const [stockDropdownFor, setStockDropdownFor] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadItems = async () => {
    const { data } = await supabase
      .from("qry_jobitems_withcoverage")
      .select("*")
      .eq("scope_item_id", scopeItemId)
      .order("item_id");
    if (data) setItems(data);
    setLoading(false);
  };

  useEffect(() => {
    loadItems();
    // Load stock items for search
    supabase
      .from("tbl_dummy_stock_items")
      .select("stock_id, stock_ref, description, category")
      .order("description")
      .then(({ data }) => {
        if (data) setStockItems(data);
      });
  }, [scopeItemId]);

  useEffect(() => {
    onSelectionChange(Array.from(selected));
  }, [selected]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const noWo = items.filter((i) => i.has_wo !== "true");
    if (selected.size === noWo.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(noWo.map((i) => i.item_id)));
    }
  };

  const updateItem = async (itemId: number, field: string, value: any) => {
    await supabase
      .from("tbl_job_items")
      .update({ [field]: value })
      .eq("item_id", itemId);
    setItems((prev) =>
      prev.map((i) => (i.item_id === itemId ? { ...i, [field]: value } : i))
    );
  };

  const addBlankItem = async () => {
    const { data } = await supabase
      .from("tbl_job_items")
      .insert({
        job_id: jobId,
        scope_item_id: scopeItemId,
        description: "",
        item_type: "Bespoke",
        kit_list_exported: "false",
        temp_selected: "false",
        created_at: new Date().toISOString(),
      })
      .select("item_id")
      .single();
    if (data) loadItems();
  };

  const addFromPrompt = async (description: string, itemType: string) => {
    await supabase.from("tbl_job_items").insert({
      job_id: jobId,
      scope_item_id: scopeItemId,
      description: description,
      item_type: itemType,
      kit_list_exported: "false",
      temp_selected: "false",
      created_at: new Date().toISOString(),
    });
    loadItems();
  };

  const deleteItem = async (itemId: number) => {
    await supabase.from("tbl_job_items").delete().eq("item_id", itemId);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    loadItems();
  };

  const assignStock = async (itemId: number, stock: StockItem) => {
    await supabase
      .from("tbl_job_items")
      .update({
        stock_reference: stock.stock_ref,
        description: stock.description,
        item_type: stock.category === "Stock" ? "Stock" : "Stock-Needs-Work",
      })
      .eq("item_id", itemId);
    setStockDropdownFor(null);
    setStockSearch("");
    loadItems();
  };

  const filteredStock = stockItems.filter(
    (s) =>
      !stockSearch ||
      (s.description || "").toLowerCase().includes(stockSearch.toLowerCase()) ||
      (s.stock_ref || "").toLowerCase().includes(stockSearch.toLowerCase()) ||
      (s.category || "").toLowerCase().includes(stockSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="text-sm text-gray-400 animate-pulse py-4">
        Loading job items...
      </div>
    );
  }

  // Expose addFromPrompt via a ref-like pattern
  // Parent can call this via the component instance
  (JobItemsTable as any)._addFromPrompt = addFromPrompt;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy">
          Job Items ({items.length})
        </h3>
        <button
          onClick={addBlankItem}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-starlight-red hover:bg-red-50 rounded-lg transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Item
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-gray-50 rounded-lg px-4 py-6 text-center text-gray-400 text-sm">
          No job items yet. Add items manually or use the prompt suggestions.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-starlight-bg text-left">
                  <th className="px-3 py-2 w-10">
                    <button
                      onClick={selectAll}
                      className="text-gray-400 hover:text-navy"
                      title="Select all without WOs"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium text-gray-500 min-w-[180px]">Description</th>
                  <th className="px-3 py-2 font-medium text-gray-500 w-32">Type</th>
                  <th className="px-3 py-2 font-medium text-gray-500 w-28">Stock Ref</th>
                  <th className="px-3 py-2 font-medium text-gray-500 w-20">Qty</th>
                  <th className="px-3 py-2 font-medium text-gray-500 min-w-[200px]">Finish Required</th>
                  <th className="px-3 py-2 font-medium text-gray-500 w-14 text-center">WO</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const hasWo = item.has_wo === "true";
                  const isSelected = selected.has(item.item_id);

                  return (
                    <tr
                      key={item.item_id}
                      className={`border-t border-gray-100 transition-colors ${
                        isSelected ? "bg-blue-50/50" : ""
                      } ${hasWo ? "opacity-70" : ""}`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2">
                        {!hasWo ? (
                          <button
                            onClick={() => toggleSelect(item.item_id)}
                            className={`transition-colors ${
                              isSelected
                                ? "text-starlight-blue"
                                : "text-gray-300 hover:text-gray-400"
                            }`}
                          >
                            {isSelected ? (
                              <CheckCircle2 className="h-4.5 w-4.5" />
                            ) : (
                              <Circle className="h-4.5 w-4.5" />
                            )}
                          </button>
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="px-3 py-2">
                        <textarea
                          value={item.description || ""}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i) =>
                                i.item_id === item.item_id
                                  ? { ...i, description: e.target.value }
                                  : i
                              )
                            )
                          }
                          onBlur={(e) =>
                            updateItem(item.item_id, "description", e.target.value || null)
                          }
                          rows={1}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 hover:border-gray-300 focus:border-starlight-blue focus:outline-none rounded bg-white resize-none overflow-hidden"
                          placeholder="Item description..."
                          onInput={(e) => {
                            const el = e.target as HTMLTextAreaElement;
                            el.style.height = "auto";
                            el.style.height = el.scrollHeight + "px";
                          }}
                        />
                      </td>

                      {/* Type */}
                      <td className="px-3 py-2">
                        <LookupCombo
                          category="ITEM_TYPE"
                          value={item.item_type}
                          onChange={(val) => updateItem(item.item_id, "item_type", val)}
                          className="w-full text-xs min-w-[100px]"
                        />
                      </td>

                      {/* Stock Reference with search */}
                      <td className="px-3 py-2 relative">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 truncate max-w-[80px]">
                            {item.stock_reference || "—"}
                          </span>
                          {item.item_type !== "Bespoke" && (
                            <button
                              onClick={() =>
                                setStockDropdownFor(
                                  stockDropdownFor === item.item_id
                                    ? null
                                    : item.item_id
                                )
                              }
                              className="p-0.5 text-gray-400 hover:text-starlight-blue rounded"
                            >
                              <Search className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {/* Stock search dropdown */}
                        {stockDropdownFor === item.item_id && (
                          <div className="absolute z-20 top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg">
                            <div className="p-2 border-b border-gray-100">
                              <input
                                type="text"
                                value={stockSearch}
                                onChange={(e) => setStockSearch(e.target.value)}
                                placeholder="Search stock..."
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-starlight-blue"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {filteredStock.slice(0, 20).map((stock) => (
                                <button
                                  key={stock.stock_id}
                                  onClick={() => assignStock(item.item_id, stock)}
                                  className="w-full px-3 py-2 text-left hover:bg-blue-50 text-xs border-b border-gray-50"
                                >
                                  <span className="font-mono text-gray-400">
                                    {stock.stock_ref}
                                  </span>
                                  <span className="ml-2 text-gray-700">
                                    {stock.description}
                                  </span>
                                </button>
                              ))}
                              {filteredStock.length === 0 && (
                                <p className="px-3 py-2 text-xs text-gray-400">
                                  No matching stock
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                setStockDropdownFor(null);
                                setStockSearch("");
                              }}
                              className="w-full px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-t"
                            >
                              Close
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.1"
                          value={item.quantity ?? ""}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i) =>
                                i.item_id === item.item_id
                                  ? { ...i, quantity: e.target.value ? parseFloat(e.target.value) : null }
                                  : i
                              )
                            )
                          }
                          onBlur={(e) =>
                            updateItem(
                              item.item_id,
                              "quantity",
                              e.target.value ? parseFloat(e.target.value) : null
                            )
                          }
                          className="w-full min-w-[50px] px-2 py-1.5 text-sm border border-gray-200 hover:border-gray-300 focus:border-starlight-blue focus:outline-none rounded bg-white text-center"
                          placeholder="—"
                        />
                      </td>

                      {/* Finish Required */}
                      <td className="px-3 py-2">
                        <textarea
                          value={item.finish_required || ""}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i) =>
                                i.item_id === item.item_id
                                  ? { ...i, finish_required: e.target.value }
                                  : i
                              )
                            )
                          }
                          onBlur={(e) =>
                            updateItem(
                              item.item_id,
                              "finish_required",
                              e.target.value || null
                            )
                          }
                          rows={1}
                          className={`w-full px-2 py-1.5 text-sm border rounded focus:border-starlight-blue focus:outline-none resize-none overflow-hidden ${
                            !item.finish_required && item.item_type === "Stock-Needs-Work"
                              ? "border-starlight-amber bg-amber-50/50 placeholder:text-amber-400"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          }`}
                          placeholder={
                            item.item_type === "Stock-Needs-Work"
                              ? "⚠ Finish required..."
                              : "Finish details..."
                          }
                          onInput={(e) => {
                            const el = e.target as HTMLTextAreaElement;
                            el.style.height = "auto";
                            el.style.height = el.scrollHeight + "px";
                          }}
                        />
                      </td>

                      {/* WO Coverage */}
                      <td className="px-3 py-2 text-center">
                        {hasWo ? (
                          <span className="text-starlight-green" title="Work Order linked">
                            ✓
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Delete */}
                      <td className="px-3 py-2">
                        {!hasWo && (
                          <button
                            onClick={() => deleteItem(item.item_id)}
                            className="p-1 text-gray-300 hover:text-starlight-red rounded transition-colors"
                            title="Delete item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="text-xs text-starlight-blue font-medium">
          {selected.size} item{selected.size > 1 ? "s" : ""} selected for Work
          Order creation
        </div>
      )}
    </div>
  );
}

// Export the addFromPrompt capability
export type JobItemsTableRef = {
  addFromPrompt: (description: string, itemType: string) => void;
};
