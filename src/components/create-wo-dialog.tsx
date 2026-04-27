"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getAuditContext, auditedInsert } from "@/lib/audit";
import { X, ArrowRight, CheckCircle2, Circle, ArrowDownToLine } from "lucide-react";

interface Activity {
  lookup_id: number;
  lookup_value: string;
  phase_number: number | null;
}

interface PredecessorWO {
  work_order_id: number;
  activity_label: string;
  phase_number: number | null;
  description: string | null;
  job_item_ids: number[];
}

interface JobItemBrief {
  item_id: number;
  description: string | null;
  quantity: number | null;
  finish_required: string | null;
}

interface CreateWODialogProps {
  jobId: number;
  scopeItemId: number;
  selectedItemIds: number[];
  defaultComplexity?: string | null;
  defaultFinish?: string | null;
  predecessorWO?: PredecessorWO | null;
  scopeFinish?: string | null;
  scopeDescription?: string | null;
  scopeItemName?: string | null;
  onClose: () => void;
  onCreated: (workOrderId: number) => void;
}

export function CreateWODialog({
  jobId, scopeItemId, selectedItemIds, defaultComplexity, defaultFinish,
  predecessorWO, scopeFinish, scopeDescription, scopeItemName, onClose, onCreated,
}: CreateWODialogProps) {
  const supabase = createClient();
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [chosenActivities, setChosenActivities] = useState<Activity[]>([]);
  const [description, setDescription] = useState("");
  const [estimatedHrs, setEstimatedHrs] = useState("");
  const [complexity, setComplexity] = useState(defaultComplexity || "");
  const [finish, setFinish] = useState(defaultFinish || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Next-step: job items with toggle
  const [predItems, setPredItems] = useState<JobItemBrief[]>([]);
  const [selectedPredItems, setSelectedPredItems] = useState<Set<number>>(new Set());

  const isNextStep = !!predecessorWO;

  useEffect(() => {
    supabase.from("tbl_master_lookups")
      .select("lookup_id, lookup_value, phase_number")
      .eq("category", "ACTIVITY").eq("active", true).order("phase_number")
      .then(({ data }) => { if (data) setAllActivities(data); });
  }, []);

  // Load predecessor job items
  useEffect(() => {
    if (!isNextStep || predecessorWO!.job_item_ids.length === 0) return;
    supabase.from("tbl_job_items")
      .select("item_id, description, quantity, finish_required")
      .in("item_id", predecessorWO!.job_item_ids)
      .then(({ data }) => {
        if (data) {
          setPredItems(data);
          setSelectedPredItems(new Set(data.map(d => d.item_id)));
        }
      });
  }, []);

  const addActivity = (id: number) => {
    const act = allActivities.find((a) => a.lookup_id === id);
    if (act && !chosenActivities.find((c) => c.lookup_id === id)) {
      setChosenActivities([...chosenActivities, act]);
    }
  };
  const removeActivity = (id: number) => setChosenActivities(chosenActivities.filter((a) => a.lookup_id !== id));
  const moveActivity = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= chosenActivities.length) return;
    const arr = [...chosenActivities];
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
    setChosenActivities(arr);
  };
  const togglePredItem = (id: number) => {
    setSelectedPredItems(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  // Prefer description, fall back to item_name. Trim and normalise whitespace.
  const scopeCopyText = (scopeDescription?.trim() || scopeItemName?.trim() || "");
  const canCopyFromScope = scopeCopyText.length > 0;
  const copyFromScope = () => {
    if (!canCopyFromScope) return;
    if (description.trim().length > 0) {
      const ok = window.confirm("Replace the current description with the scope text?");
      if (!ok) return;
    }
    setDescription(scopeCopyText);
  };

  const previewLabel = chosenActivities.map((a) => a.lookup_value).join(" + ") || "No activities selected";

  const handleCreate = async () => {
    if (chosenActivities.length === 0) { setError("Select at least one activity"); return; }
    const itemIds = isNextStep ? Array.from(selectedPredItems) : selectedItemIds;
    setSaving(true); setError(null);

    const { data: existingWOs } = await supabase.from("tbl_work_orders")
      .select("wo_sequence").eq("scope_item_id", scopeItemId)
      .not("status", "eq", "Voided").order("wo_sequence", { ascending: false }).limit(1);
    const nextSeq = (existingWOs?.[0]?.wo_sequence ?? 0) + 1;

    const ctx = await getAuditContext(supabase);
    const { data: wo, error: woError } = await auditedInsert(ctx, "tbl_work_orders", {
      job_id: jobId, scope_item_id: scopeItemId,
      activity_verb: chosenActivities[0].lookup_id,
      description: description.trim() || null,
      estimated_duration_hrs: estimatedHrs ? parseFloat(estimatedHrs) : null,
      complexity_construction: complexity || null, finish_relative: finish || null,
      wo_sequence: nextSeq, status: "Not-Started",
      predecessor_wo_id: isNextStep ? predecessorWO!.work_order_id : null,
    }, jobId);
    if (woError || !wo) { setError(woError?.message || "Failed to create work order"); setSaving(false); return; }

    const activityRows = chosenActivities.map((act, idx) => ({ work_order_id: wo.work_order_id, activity_id: act.lookup_id, sequence: idx + 1 }));
    const { error: actError } = await supabase.from("tbl_wo_activities").insert(activityRows);
    if (actError) { setError("WO created but activities failed: " + actError.message); setSaving(false); return; }

    if (itemIds.length > 0) {
      const junctions = itemIds.map((itemId) => ({ job_item_id: itemId, work_order_id: wo.work_order_id }));
      const { error: jError } = await supabase.from("tbl_jobitem_workorder").insert(junctions);
      if (jError) { setError("WO created but item linking failed: " + jError.message); setSaving(false); return; }
    }
    setSaving(false); onCreated(wo.work_order_id);
  };

  const available = allActivities.filter((a) => !chosenActivities.find((c) => c.lookup_id === a.lookup_id));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-navy">{isNextStep ? "Add Next Step" : "Create Work Order"}</h2>
            {isNextStep && (
              <p className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
                After: <span className="font-medium text-navy">{predecessorWO!.activity_label}</span>
                <ArrowRight className="h-3 w-3 text-faint" /> <span className="text-faint">new step</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-mid rounded-lg transition-colors"><X className="h-5 w-5 text-muted" /></button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Job items — next-step mode: checkboxes; normal mode: context line */}
          {isNextStep && predItems.length > 0 ? (
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Items to include ({selectedPredItems.size}/{predItems.length})
              </label>
              <div className="border border-subtle rounded-lg divide-y divide-subtle max-h-40 overflow-y-auto">
                {predItems.map(item => {
                  const sel = selectedPredItems.has(item.item_id);
                  return (
                    <button key={item.item_id} type="button" onClick={() => togglePredItem(item.item_id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${sel ? "bg-starlight-blue/5" : "hover:bg-surface-dim/50"}`}>
                      {sel
                        ? <CheckCircle2 className="h-4 w-4 text-starlight-blue shrink-0" />
                        : <Circle className="h-4 w-4 text-faint shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-navy truncate">{item.quantity && item.quantity > 1 ? `${item.quantity}× ` : ""}{item.description || "Untitled"}</p>
                        {item.finish_required && <p className="text-[10px] text-muted truncate">{item.finish_required}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : !isNextStep && selectedItemIds.length > 0 ? (
            <div className="bg-base rounded-lg px-3 py-2">
              <p className="text-xs text-muted">{selectedItemIds.length} job item{selectedItemIds.length !== 1 ? "s" : ""} will be linked</p>
            </div>
          ) : null}

          {/* Activity picker */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Activities *</label>
            <select value="" onChange={(e) => { if (e.target.value) addActivity(Number(e.target.value)); }}
              className="w-full px-3 py-2 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue mb-2">
              <option value="">+ Add activity...</option>
              {available.map((act) => {
                const predecessorPhase = predecessorWO?.phase_number ?? 0;
                const isTypicalNext = isNextStep && (act.phase_number ?? 0) > predecessorPhase;
                return (
                  <option key={act.lookup_id} value={act.lookup_id}>
                    {isTypicalNext ? "★ " : ""}{act.lookup_value}{act.phase_number ? ` (Phase ${act.phase_number})` : ""}
                  </option>
                );
              })}
            </select>
            {chosenActivities.length > 0 && (
              <div className="space-y-1">
                {chosenActivities.map((act, idx) => (
                  <div key={act.lookup_id} className="flex items-center gap-2 bg-base rounded-lg px-3 py-2">
                    <span className="text-xs text-muted w-4">{idx + 1}.</span>
                    <span className="flex-1 text-sm text-navy font-medium">{act.lookup_value}</span>
                    <div className="flex gap-0.5">
                      {idx > 0 && <button onClick={() => moveActivity(idx, -1)} className="p-0.5 text-muted hover:text-navy text-xs" title="Move up">↑</button>}
                      {idx < chosenActivities.length - 1 && <button onClick={() => moveActivity(idx, 1)} className="p-0.5 text-muted hover:text-navy text-xs" title="Move down">↓</button>}
                    </div>
                    <button onClick={() => removeActivity(act.lookup_id)} className="p-0.5 text-muted hover:text-starlight-red"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            {chosenActivities.length > 0 && (
              <p className="mt-2 text-xs text-muted">Displays as: <span className="font-medium text-navy">{previewLabel}</span></p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-muted">Description</label>
              {canCopyFromScope && (
                <button
                  type="button"
                  onClick={copyFromScope}
                  title={scopeCopyText.length > 80 ? scopeCopyText.slice(0, 80) + "…" : scopeCopyText}
                  className="flex items-center gap-1 text-xs text-starlight-blue hover:underline"
                >
                  <ArrowDownToLine className="h-3 w-3" />
                  Copy from scope
                </button>
              )}
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What specifically needs doing..."
              rows={3}
              className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Estimated Hours</label>
            <input type="number" step="0.5" value={estimatedHrs} onChange={(e) => setEstimatedHrs(e.target.value)}
              placeholder="e.g. 4"
              className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Complexity</label>
              <select value={complexity} onChange={(e) => setComplexity(e.target.value)}
                className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                <option value="">Select...</option>
                <option value="1 - Straightforward">1 - Straightforward</option>
                <option value="2 - Skilled">2 - Skilled</option>
                <option value="3 - Bespoke/Artistic">3 - Bespoke/Artistic</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Finish</label>
              <select value={finish} onChange={(e) => setFinish(e.target.value)}
                className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                <option value="">Select...</option>
                <option value="Raw">Raw</option>
                <option value="Good">Good</option>
                <option value="Spotlight">Spotlight</option>
              </select>
            </div>
          </div>

          {error && <div className="text-sm text-starlight-red bg-starlight-red/10 rounded-lg px-3 py-2">{error}</div>}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            className="px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red transition-colors disabled:opacity-50">
            {saving ? "Creating..." : isNextStep ? "Create Next Step" : "Create Work Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
