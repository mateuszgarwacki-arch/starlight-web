"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Lightbulb, X } from "lucide-react";

interface Prompt {
  prompt_id: number;
  description: string | null;
  typical_item_type: string | null;
  stock_item_id: number | null;
  stock_description: string | null;
  quantity_default: number | null;
}

interface PromptPanelProps {
  categoryId: number | null;
  onAddItem: (description: string, itemType: string, stockItemId?: number, quantity?: number) => void;
}

export function PromptPanel({ categoryId, onAddItem }: PromptPanelProps) {
  const supabase = createClient();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    if (!categoryId) {
      setPrompts([]);
      return;
    }
    setLoading(true);
    setDismissed(new Set());
    supabase
      .from("tbl_category_prompts")
      .select("*")
      .eq("category_id", categoryId)
      .order("display_order")
      .then(async ({ data }) => {
        if (data && data.length > 0) {
          const stockIds = data.filter((p: any) => p.stock_item_id).map((p: any) => p.stock_item_id);
          let stockMap: Record<number, string> = {};
          if (stockIds.length > 0) {
            const { data: items } = await supabase.from("tbl_stock_items").select("stock_id, description").in("stock_id", stockIds);
            (items || []).forEach((s: any) => { stockMap[s.stock_id] = s.description; });
          }
          setPrompts(data.map((p: any) => ({ ...p, stock_description: stockMap[p.stock_item_id] || null })));
        } else {
          setPrompts([]);
        }
        setLoading(false);
      });
  }, [categoryId]);

  if (!categoryId || prompts.length === 0) return null;

  const visiblePrompts = prompts.filter((p) => !dismissed.has(p.prompt_id));
  if (visiblePrompts.length === 0 && dismissed.size > 0) {
    return (
      <div className="card px-4 py-3 border-l-4 border-l-starlight-amber/30">
        <p className="text-xs text-gray-400">All suggestions dismissed</p>
        <button
          onClick={() => setDismissed(new Set())}
          className="text-xs text-starlight-blue hover:underline mt-1"
        >
          Reset suggestions
        </button>
      </div>
    );
  }

  return (
    <div className="card border-l-4 border-l-starlight-amber overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-starlight-amber" />
          <span className="text-sm font-medium text-navy">
            Typical Components ({visiblePrompts.length})
          </span>
        </div>
        <span className="text-xs text-gray-400">
          {isOpen ? "Hide" : "Show"}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-xs text-gray-400 mb-2">
            Suggested items for this category. Click + to add, × to dismiss.
            Nothing is auto-created.
          </p>
          {loading ? (
            <p className="text-xs text-gray-400 animate-pulse">Loading...</p>
          ) : (
            visiblePrompts.map((prompt) => (
              <div
                key={prompt.prompt_id}
                className="flex items-center justify-between bg-amber-50/50 rounded-lg px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{prompt.description}</p>
                  <p className="text-xs text-gray-400">
                    {prompt.stock_item_id ? "Stock" : (prompt.typical_item_type || "Bespoke")}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-3 shrink-0">
                  <button
                    onClick={() =>
                      onAddItem(
                        prompt.stock_description || prompt.description || "",
                        prompt.stock_item_id ? "Stock" : (prompt.typical_item_type || "Bespoke"),
                        prompt.stock_item_id || undefined,
                        prompt.quantity_default || undefined
                      )
                    }
                    className="p-1.5 text-starlight-green hover:bg-green-50 rounded-md transition-colors"
                    title="Add as job item"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      setDismissed((prev) => new Set(prev).add(prompt.prompt_id))
                    }
                    className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md transition-colors"
                    title="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
