"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getAuditContext, auditedInsert } from "@/lib/audit";
import { toast } from "sonner";
import { X, Search, Plus, Wrench } from "lucide-react";

const FIXINGS_CATEGORY_ID = 108; // S44b — Fixings & Consumables lookup_id

interface FixingResult {
  stock_id: number;
  product_code: string;
  description: string;
  hire_cost_day: number | null; // re-used as unit cost in this catalogue context
  thumbnail_url: string | null;
  location: string | null;
}

interface FixingsPickerDialogProps {
  jobId: number;
  scopeItemId: number;
  onClose: () => void;
  onAdded: () => void;
}

export function FixingsPickerDialog({
  jobId, scopeItemId, onClose, onAdded,
}: FixingsPickerDialogProps) {
  const supabase = createClient();

  const [mode, setMode] = useState<"catalogue" | "freeform">("catalogue");

  // Catalogue search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FixingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<NodeJS.Timeout | null>(null);

  // Selected catalogue item + line input
  const [picked, setPicked] = useState<FixingResult | null>(null);
  const [qty, setQty] = useState<string>(""); // blank = NULL = "provisioned"
  const [unitCost, setUnitCost] = useState<string>("");

  // Freeform form
  const [ffDesc, setFfDesc] = useState("");
  const [ffQty, setFfQty] = useState<string>("");
  const [ffCost, setFfCost] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase.from("tbl_stock_items")
        .select("stock_id, product_code, description, hire_cost_day, thumbnail_url, location")
        .eq("item_type", "fixing")
        .eq("active", true)
        .or(`description.ilike.%${query}%,product_code.ilike.%${query}%`)
        .order("description")
        .limit(20);
      setResults((data as FixingResult[]) || []);
      setSearching(false);
    }, 200);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  const handlePick = (item: FixingResult) => {
    setPicked(item);
    setQty(""); // explicit blank — "provisioned" default per design
    setUnitCost(item.hire_cost_day != null ? String(item.hire_cost_day) : "");
  };

  const insertFixingLine = async (params: {
    description: string;
    qty: number | null;
    unitCost: number | null;
    stockId: number | null;
    productCode: string | null;
  }) => {
    setSaving(true); setError(null);
    const ctx = await getAuditContext(supabase);
    const { error: insErr } = await auditedInsert(ctx, "tbl_wo_bom", {
      job_id: jobId,
      scope_item_id: scopeItemId,
      work_order_id: null,
      material_category: FIXINGS_CATEGORY_ID,
      item_description: params.description,
      quantity: params.qty,
      unit: "Each",
      unit_cost: params.unitCost,
      from_stock: false,
      stock_item_id: params.stockId,
      stock_reference: params.productCode,
    }, jobId);
    if (insErr) { setError(insErr.message); setSaving(false); return false; }
    toast.success(params.qty == null ? `Provisioned: ${params.description}` : `Added: ${params.description}`);
    setSaving(false);
    return true;
  };

  const handleAddCatalogue = async () => {
    if (!picked) return;
    const qtyVal = qty.trim() === "" ? null : parseFloat(qty);
    if (qtyVal !== null && (Number.isNaN(qtyVal) || qtyVal < 0)) {
      setError("Qty must be a positive number or left blank");
      return;
    }
    const costVal = unitCost.trim() === "" ? null : parseFloat(unitCost);
    if (costVal !== null && Number.isNaN(costVal)) {
      setError("Unit cost must be a number or left blank");
      return;
    }
    const ok = await insertFixingLine({
      description: picked.description,
      qty: qtyVal,
      unitCost: costVal,
      stockId: picked.stock_id,
      productCode: picked.product_code,
    });
    if (ok) {
      // Reset selection but keep dialog open — encourage adding several in one session.
      setPicked(null);
      setQty("");
      setUnitCost("");
      setQuery("");
      setResults([]);
      onAdded();
    }
  };

  const handleAddFreeform = async () => {
    if (!ffDesc.trim()) { setError("Description required"); return; }
    const qtyVal = ffQty.trim() === "" ? null : parseFloat(ffQty);
    if (qtyVal !== null && (Number.isNaN(qtyVal) || qtyVal < 0)) {
      setError("Qty must be a positive number or left blank");
      return;
    }
    const costVal = ffCost.trim() === "" ? null : parseFloat(ffCost);
    if (costVal !== null && Number.isNaN(costVal)) {
      setError("Unit cost must be a number or left blank");
      return;
    }
    const ok = await insertFixingLine({
      description: ffDesc.trim(),
      qty: qtyVal,
      unitCost: costVal,
      stockId: null,
      productCode: null,
    });
    if (ok) {
      setFfDesc("");
      setFfQty("");
      setFfCost("");
      onAdded();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle shrink-0">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-navy" />
            <div>
              <h2 className="text-base font-semibold text-navy">Add Fixings &amp; Consumables</h2>
              <p className="text-[11px] text-muted mt-0.5">For the pick-list. Leave qty blank for &ldquo;needs this, not counted&rdquo;.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-mid rounded-lg transition-colors">
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="px-5 pt-3 flex gap-2 border-b border-subtle">
          <button
            onClick={() => { setMode("catalogue"); setError(null); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors ${
              mode === "catalogue"
                ? "border-starlight-blue text-navy"
                : "border-transparent text-muted hover:text-navy"
            }`}
          >
            Catalogue
          </button>
          <button
            onClick={() => { setMode("freeform"); setError(null); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors ${
              mode === "freeform"
                ? "border-starlight-blue text-navy"
                : "border-transparent text-muted hover:text-navy"
            }`}
          >
            Custom entry
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {mode === "catalogue" ? (
            <>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search fixings (brackets, screws, sandpaper...)"
                  className="w-full pl-9 pr-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                />
              </div>

              {/* Results */}
              {searching && <p className="text-xs text-muted animate-pulse">Searching...</p>}
              {!searching && query.length >= 2 && results.length === 0 && (
                <div className="text-center py-4 px-3 bg-surface-dim/40 rounded-lg">
                  <p className="text-xs text-muted">No fixings catalogue matches.</p>
                  <button onClick={() => { setMode("freeform"); setFfDesc(query); }} className="mt-1 text-xs text-starlight-blue hover:underline">
                    Add as custom entry instead
                  </button>
                </div>
              )}
              {results.length > 0 && !picked && (
                <div className="border border-subtle rounded-lg divide-y divide-subtle max-h-64 overflow-y-auto">
                  {results.map(r => (
                    <button
                      key={r.stock_id}
                      onClick={() => handlePick(r)}
                      className="w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-surface-dim/50 transition-colors"
                    >
                      {r.thumbnail_url ? (
                        <img src={r.thumbnail_url} alt="" className="h-10 w-10 object-cover rounded shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-surface-mid flex items-center justify-center shrink-0">
                          <Wrench className="h-4 w-4 text-faint" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-navy truncate">{r.description}</p>
                        <p className="text-[10px] text-muted">
                          {r.product_code}
                          {r.location && ` · ${r.location}`}
                          {r.hire_cost_day != null && ` · £${r.hire_cost_day.toFixed(2)}/ea`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected item — qty + cost line */}
              {picked && (
                <div className="border border-starlight-blue/40 bg-starlight-blue/5 rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    {picked.thumbnail_url ? (
                      <img src={picked.thumbnail_url} alt="" className="h-12 w-12 object-cover rounded shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded bg-surface-mid flex items-center justify-center shrink-0">
                        <Wrench className="h-5 w-5 text-faint" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy">{picked.description}</p>
                      <p className="text-[10px] text-muted">{picked.product_code}</p>
                    </div>
                    <button onClick={() => setPicked(null)} className="p-1 text-muted hover:text-navy">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Qty (optional)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={qty}
                        onChange={e => setQty(e.target.value)}
                        placeholder="leave blank"
                        className="w-full px-2.5 py-1.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Unit cost £</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={unitCost}
                        onChange={e => setUnitCost(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2.5 py-1.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted mt-2">
                    {qty.trim() === ""
                      ? "Blank qty → renders on the pick-list as &ldquo;needs this&rdquo;, no count."
                      : `Will add ${qty} × ${picked.description} to scope BOM.`}
                  </p>
                  <button
                    onClick={handleAddCatalogue}
                    disabled={saving}
                    className="mt-3 w-full px-3 py-2 bg-starlight-blue text-white text-sm font-medium rounded-lg hover:bg-starlight-blue/90 disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Adding..." : "Add to scope BOM"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Description *</label>
                <input
                  type="text"
                  autoFocus
                  value={ffDesc}
                  onChange={e => setFfDesc(e.target.value)}
                  placeholder="e.g. 50mm M6 stainless bolts"
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Qty (optional)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={ffQty}
                    onChange={e => setFfQty(e.target.value)}
                    placeholder="leave blank"
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Unit cost £</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ffCost}
                    onChange={e => setFfCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                  />
                </div>
              </div>
              <button
                onClick={handleAddFreeform}
                disabled={saving || !ffDesc.trim()}
                className="w-full px-3 py-2 bg-starlight-blue text-white text-sm font-medium rounded-lg hover:bg-starlight-blue/90 disabled:opacity-50 transition-colors"
              >
                {saving ? "Adding..." : (<><Plus className="inline h-3.5 w-3.5 mr-1" />Add to scope BOM</>)}
              </button>
            </>
          )}

          {error && (
            <div className="text-sm text-starlight-red bg-starlight-red/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-subtle flex justify-between items-center shrink-0">
          <p className="text-[10px] text-muted">Adds keep the dialog open. Close when done.</p>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
