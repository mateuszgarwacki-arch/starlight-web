"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getAuditContext, auditedInsert } from "@/lib/audit";
import { X } from "lucide-react";

interface Activity {
  lookup_id: number;
  lookup_value: string;
  phase_number: number | null;
}

interface CreateWODialogProps {
  jobId: number;
  scopeItemId: number;
  selectedItemIds: number[];
  defaultComplexity?: string | null;
  defaultFinish?: string | null;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateWODialog({
  jobId,
  scopeItemId,
  selectedItemIds,
  defaultComplexity,
  defaultFinish,
  onClose,
  onCreated,
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

  useEffect(() => {
    supabase
      .from("tbl_master_lookups")
      .select("lookup_id, lookup_value, phase_number")
      .eq("category", "ACTIVITY")
      .eq("active", true)
      .order("phase_number")
      .then(({ data }) => {
        if (data) setAllActivities(data);
      });
  }, []);

  const addActivity = (id: number) => {
    const act = allActivities.find((a) => a.lookup_id === id);
    if (act && !chosenActivities.find((c) => c.lookup_id === id)) {
      setChosenActivities([...chosenActivities, act]);
    }
  };

  const removeActivity = (id: number) => {
    setChosenActivities(chosenActivities.filter((a) => a.lookup_id !== id));
  };

  const moveActivity = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= chosenActivities.length) return;
    const arr = [...chosenActivities];
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
    setChosenActivities(arr);
  };

  const previewLabel = chosenActivities.map((a) => a.lookup_value).join(" + ") || "No activities selected";

  const handleCreate = async () => {
    if (chosenActivities.length === 0) {
      setError("Select at least one activity");
      return;
    }

    setSaving(true);
    setError(null);

    // Get next sequence number for this scope item
    const { data: existingWOs } = await supabase
      .from("tbl_work_orders")
      .select("wo_sequence")
      .eq("scope_item_id", scopeItemId)
      .not("status", "eq", "Voided")
      .order("wo_sequence", { ascending: false })
      .limit(1);
    const nextSeq = (existingWOs && existingWOs.length > 0 && existingWOs[0].wo_sequence)
      ? existingWOs[0].wo_sequence + 1 : 1;

    // 1. Create Work Order (activity_verb = first activity for backwards compat)
    const ctx = await getAuditContext(supabase);
    const { data: wo, error: woError } = await auditedInsert(ctx, "tbl_work_orders", {
      job_id: jobId,
      scope_item_id: scopeItemId,
      activity_verb: chosenActivities[0].lookup_id,
      description: description.trim() || null,
      estimated_duration_hrs: estimatedHrs ? parseFloat(estimatedHrs) : null,
      complexity_construction: complexity || null,
      finish_relative: finish || null,
      wo_sequence: nextSeq,
      status: "Not-Started",
    }, jobId);

    if (woError || !wo) {
      setError(woError?.message || "Failed to create work order");
      setSaving(false);
      return;
    }

    // 2. Create activity junction records
    const activityRows = chosenActivities.map((act, idx) => ({
      work_order_id: wo.work_order_id,
      activity_id: act.lookup_id,
      sequence: idx + 1,
    }));

    const { error: actError } = await supabase
      .from("tbl_wo_activities")
      .insert(activityRows);

    if (actError) {
      setError("WO created but activities failed: " + actError.message);
      setSaving(false);
      return;
    }

    // 3. Create junction records linking selected job items
    if (selectedItemIds.length > 0) {
      const junctions = selectedItemIds.map((itemId) => ({
        job_item_id: itemId,
        work_order_id: wo.work_order_id,
      }));

      const { error: jError } = await supabase
        .from("tbl_jobitem_workorder")
        .insert(junctions);

      if (jError) {
        setError("WO created but item linking failed: " + jError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onCreated();
  };

  const available = allActivities.filter(
    (a) => !chosenActivities.find((c) => c.lookup_id === a.lookup_id)
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-navy">Create Work Order</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Context */}
        <div className="px-6 py-3 bg-starlight-bg border-b border-gray-100">
          <p className="text-xs text-gray-500">
            {selectedItemIds.length} job item{selectedItemIds.length !== 1 ? "s" : ""} will be linked
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          {/* Activity picker */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Activities *
            </label>

            <select
              value=""
              onChange={(e) => {
                if (e.target.value) addActivity(Number(e.target.value));
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue mb-2"
            >
              <option value="">+ Add activity...</option>
              {available.map((act) => (
                <option key={act.lookup_id} value={act.lookup_id}>
                  {act.lookup_value}
                </option>
              ))}
            </select>

            {chosenActivities.length > 0 && (
              <div className="space-y-1">
                {chosenActivities.map((act, idx) => (
                  <div
                    key={act.lookup_id}
                    className="flex items-center gap-2 bg-starlight-bg rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-gray-400 w-4">{idx + 1}.</span>
                    <span className="flex-1 text-sm text-navy font-medium">
                      {act.lookup_value}
                    </span>
                    <div className="flex gap-0.5">
                      {idx > 0 && (
                        <button
                          onClick={() => moveActivity(idx, -1)}
                          className="p-0.5 text-gray-400 hover:text-navy text-xs"
                          title="Move up"
                        >
                          ↑
                        </button>
                      )}
                      {idx < chosenActivities.length - 1 && (
                        <button
                          onClick={() => moveActivity(idx, 1)}
                          className="p-0.5 text-gray-400 hover:text-navy text-xs"
                          title="Move down"
                        >
                          ↓
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => removeActivity(act.lookup_id)}
                      className="p-0.5 text-gray-400 hover:text-starlight-red"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {chosenActivities.length > 0 && (
              <p className="mt-2 text-xs text-gray-400">
                Displays as: <span className="font-medium text-navy">{previewLabel}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What specifically needs doing..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Estimated Hours</label>
            <input
              type="number"
              step="0.5"
              value={estimatedHrs}
              onChange={(e) => setEstimatedHrs(e.target.value)}
              placeholder="e.g. 4"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Complexity</label>
              <select
                value={complexity}
                onChange={(e) => setComplexity(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
              >
                <option value="">Select...</option>
                <option value="1 - Straightforward">1 - Straightforward</option>
                <option value="2 - Skilled">2 - Skilled</option>
                <option value="3 - Bespoke/Artistic">3 - Bespoke/Artistic</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Finish</label>
              <select
                value={finish}
                onChange={(e) => setFinish(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
              >
                <option value="">Select...</option>
                <option value="Harder-than-construction-warrants">Harder than warrants</option>
                <option value="Neutral">Neutral</option>
                <option value="Suits-the-form">Suits the form</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="text-sm text-starlight-red bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Work Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
