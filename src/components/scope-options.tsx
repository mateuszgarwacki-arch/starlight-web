"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getAuditContext, auditedInsert, auditedUpdate } from "@/lib/audit";
import { Plus, Check, X, ChevronDown, ChevronRight, Trash2, Layers } from "lucide-react";
import { toast } from "sonner";
import type { ScopeOption } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

interface Props {
  scopeItemId: number;
  jobId: number;
  quotedValue?: number;
}

export function ScopeOptions({ scopeItemId, jobId, quotedValue }: Props) {
  const supabase = createClient();
  const [options, setOptions] = useState<ScopeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [defaultDayRate, setDefaultDayRate] = useState(250);

  // Form state
  const [formLabel, setFormLabel] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPros, setFormPros] = useState("");
  const [formCons, setFormCons] = useState("");
  const [formLabourDays, setFormLabourDays] = useState("");
  const [formMaterialCost, setFormMaterialCost] = useState("");

  const load = useCallback(async () => {
    const [optRes, rateRes, dayHrsRes] = await Promise.all([
      supabase.from("tbl_scope_options").select("*").eq("scope_item_id", scopeItemId).order("created_at"),
      supabase.from("tbl_rate_card").select("rate_per_hour").eq("complexity", 1).single(),
      supabase.from("tbl_business_settings").select("setting_value").eq("setting_key", "standard_day_hours").single(),
    ]);
    setOptions(optRes.data || []);
    const rate = (rateRes.data?.rate_per_hour || 25) * (parseFloat(dayHrsRes.data?.setting_value) || 10);
    setDefaultDayRate(rate);
    setLoading(false);
  }, [scopeItemId]);

  useEffect(() => { load(); }, [load]);

  const calcTotal = (labourDays: number, materialCost: number) =>
    (labourDays * defaultDayRate) + materialCost;

  const resetForm = () => {
    setFormLabel(""); setFormDesc(""); setFormPros(""); setFormCons("");
    setFormLabourDays(""); setFormMaterialCost("");
    setShowForm(false);
  };

  const handleAdd = async () => {
    if (!formLabel.trim()) return;
    const labourDays = parseFloat(formLabourDays) || 0;
    const materialCost = parseFloat(formMaterialCost) || 0;
    const total = calcTotal(labourDays, materialCost);
    const impact = quotedValue ? total - quotedValue : null;
    const ctx = await getAuditContext(supabase);
    const { error } = await auditedInsert(ctx, "tbl_scope_options", {
      scope_item_id: scopeItemId,
      option_label: formLabel.trim(),
      description: formDesc.trim() || null,
      pros: formPros.trim() || null,
      cons: formCons.trim() || null,
      est_labour_days: labourDays || null,
      est_material_cost: materialCost || null,
      est_total_cost: total || null,
      impact_on_quote: impact,
      status: "proposed",
      created_by: ctx.userId,
      created_at: new Date().toISOString(),
    }, jobId);
    if (error) { toast.error("Failed to add option"); return; }
    toast.success("Option added");
    resetForm();
    load();
  };

  const handleSelect = async (opt: ScopeOption) => {
    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_scope_options", opt.option_id, {
      status: "selected",
      selected_by: ctx.userId,
      selected_at: new Date().toISOString(),
    }, jobId);
    toast.success(`Selected: ${opt.option_label}`);
    load();
  };

  const handleReject = async (opt: ScopeOption) => {
    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_scope_options", opt.option_id, { status: "rejected" }, jobId);
    toast.success(`Rejected: ${opt.option_label}`);
    load();
  };

  const handleRevert = async (opt: ScopeOption) => {
    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_scope_options", opt.option_id, {
      status: "proposed", selected_by: null, selected_at: null,
    }, jobId);
    toast.success(`Reverted to proposed`);
    load();
  };

  const handleDelete = async (opt: ScopeOption) => {
    if (!confirm(`Delete "${opt.option_label}"?`)) return;
    const ctx = await getAuditContext(supabase);
    // Log before delete
    await supabase.from("tbl_audit_log").insert({
      user_id: ctx.userId, user_name: ctx.userName, user_role: ctx.userRole,
      table_name: "tbl_scope_options", record_id: opt.option_id,
      field_name: "_record", old_value: JSON.stringify(opt), new_value: null,
      job_id: jobId, action_type: "delete",
    });
    await supabase.from("tbl_scope_options").delete().eq("option_id", opt.option_id);
    toast.success("Option deleted");
    load();
  };

  // Sort: selected first, then proposed, then rejected
  const sorted = [...options].sort((a, b) => {
    const order: Record<string, number> = { selected: 0, proposed: 1, rejected: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });

  if (loading) return null;
  // Progressive disclosure: don't show empty section, just a subtle link
  if (options.length === 0 && !showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-starlight-blue transition-colors"
      >
        <Layers className="h-3.5 w-3.5" />
        Add build options
      </button>
    );
  }

  return (
    <div className="card px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-navy flex items-center gap-1.5">
          <Layers className="h-4 w-4" />
          Build Options
        </h3>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 text-xs text-starlight-blue hover:text-navy transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Option
          </button>
        )}
      </div>

      {/* Option cards */}
      <div className="space-y-2">
        {sorted.map((opt) => {
          const isExpanded = expandedId === opt.option_id;
          const isSelected = opt.status === "selected";
          const isRejected = opt.status === "rejected";
          const labourCost = (opt.est_labour_days || 0) * defaultDayRate;
          const total = opt.est_total_cost || labourCost + (opt.est_material_cost || 0);
          const marginPct = quotedValue && quotedValue > 0
            ? ((quotedValue - total) / quotedValue) * 100 : null;

          return (
            <div
              key={opt.option_id}
              className={`rounded-lg border transition-colors ${
                isSelected ? "border-starlight-green/40 bg-starlight-green/10/30" :
                isRejected ? "border-subtle bg-surface-dim/50 opacity-60" :
                "border-subtle bg-surface"
              }`}
            >
              {/* Card header — always visible */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : opt.option_id)}
              >
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-muted shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isRejected ? "line-through text-muted" : "text-navy"}`}>
                      {opt.option_label}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      isSelected ? "bg-starlight-green/10 text-starlight-green" :
                      isRejected ? "bg-surface-mid text-muted" :
                      "bg-starlight-blue/10 text-starlight-blue"
                    }`}>
                      {opt.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {total > 0 && (
                    <span className={`text-sm font-mono ${isRejected ? "text-muted line-through" : "text-navy"}`}>
                      {fmt(total)}
                    </span>
                  )}
                  {marginPct !== null && !isRejected && (
                    <span className={`text-xs font-mono ${
                      marginPct >= 20 ? "text-starlight-green" :
                      marginPct >= 0 ? "text-starlight-amber" :
                      "text-starlight-red"
                    }`}>
                      {marginPct >= 0 ? "+" : ""}{marginPct.toFixed(0)}%
                    </span>
                  )}
                  {opt.impact_on_quote !== null && opt.impact_on_quote !== undefined && !isRejected && (
                    <span className={`text-xs font-mono ${
                      (opt.impact_on_quote || 0) <= 0 ? "text-starlight-green" : "text-starlight-red"
                    }`}>
                      {(opt.impact_on_quote || 0) > 0 ? "+" : ""}{fmt(opt.impact_on_quote || 0)}
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-subtle space-y-3">
                  {opt.description && (
                    <p className="text-sm text-muted">{opt.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {opt.pros && (
                      <div>
                        <p className="text-xs font-medium text-starlight-green mb-0.5">Pros</p>
                        <p className="text-xs text-muted">{opt.pros}</p>
                      </div>
                    )}
                    {opt.cons && (
                      <div>
                        <p className="text-xs font-medium text-starlight-red mb-0.5">Cons</p>
                        <p className="text-xs text-muted">{opt.cons}</p>
                      </div>
                    )}
                  </div>
                  {/* Cost breakdown */}
                  <div className="flex items-center gap-4 text-xs text-muted">
                    {opt.est_labour_days != null && (
                      <span>{opt.est_labour_days}d × {fmt(defaultDayRate)}/day = {fmt(labourCost)}</span>
                    )}
                    {opt.est_material_cost != null && (
                      <span>Materials: {fmt(opt.est_material_cost)}</span>
                    )}
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    {opt.status === "proposed" && (
                      <>
                        <button
                          onClick={() => handleSelect(opt)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-starlight-green/10 text-starlight-green rounded-lg hover:bg-starlight-green/20 transition-colors"
                        >
                          <Check className="h-3 w-3" /> Select
                        </button>
                        <button
                          onClick={() => handleReject(opt)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-surface-mid text-muted rounded-lg hover:bg-surface-hi transition-colors"
                        >
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </>
                    )}
                    {(opt.status === "selected" || opt.status === "rejected") && (
                      <button
                        onClick={() => handleRevert(opt)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-surface-mid text-muted rounded-lg hover:bg-surface-hi transition-colors"
                      >
                        Revert to Proposed
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(opt)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-muted hover:text-starlight-red transition-colors ml-auto"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Inline add form */}
      {showForm && (
        <div className="mt-3 border border-starlight-blue/30 rounded-lg px-4 py-4 bg-navy/10/20 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Option Label *</label>
            <input
              type="text"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              placeholder="e.g. Option A: Solid Oak Frame"
              className="w-full px-3 py-1.5 border border-subtle rounded text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Description</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="What does this approach involve..."
              rows={2}
              className="w-full px-3 py-1.5 border border-subtle rounded text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Pros</label>
              <textarea
                value={formPros}
                onChange={(e) => setFormPros(e.target.value)}
                placeholder="Advantages..."
                rows={2}
                className="w-full px-3 py-1.5 border border-subtle rounded text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Cons</label>
              <textarea
                value={formCons}
                onChange={(e) => setFormCons(e.target.value)}
                placeholder="Disadvantages..."
                rows={2}
                className="w-full px-3 py-1.5 border border-subtle rounded text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Labour Days</label>
              <input
                type="number"
                step="0.5"
                value={formLabourDays}
                onChange={(e) => setFormLabourDays(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-1.5 border border-subtle rounded text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Materials £</label>
              <input
                type="number"
                step="0.01"
                value={formMaterialCost}
                onChange={(e) => setFormMaterialCost(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-1.5 border border-subtle rounded text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Total (auto)</label>
              <p className="text-sm font-mono text-navy px-3 py-1.5">
                {fmt(calcTotal(parseFloat(formLabourDays) || 0, parseFloat(formMaterialCost) || 0))}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted">
            Day rate: {fmt(defaultDayRate)} (from rate card)
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={!formLabel.trim()}
              className="px-4 py-1.5 text-xs font-medium bg-starlight-blue text-white rounded-lg hover:bg-navy transition-colors disabled:opacity-50"
            >
              Add Option
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-1.5 text-xs text-muted hover:bg-surface-mid rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
