"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { notify } from "@/lib/notifications";
import { toast } from "sonner";
import { X, CheckCircle2, Circle, Clock, Package } from "lucide-react";

export interface WOPickerRow {
  work_order_id: number;
  display_label: string;
  status: string | null;
  current_item_count: number;
}

interface AddToExistingWODialogProps {
  jobId: number;
  scopeItemId: number;
  selectedItemIds: number[];
  availableWOs: WOPickerRow[];
  onClose: () => void;
  onAdded: (workOrderId: number) => void;
}

export function AddToExistingWODialog({
  jobId, scopeItemId, selectedItemIds, availableWOs, onClose, onAdded,
}: AddToExistingWODialogProps) {
  const supabase = createClient();
  const [chosenWO, setChosenWO] = useState<number | null>(null);
  const [existingJunctions, setExistingJunctions] = useState<Set<string>>(new Set());
  const [hoursByWO, setHoursByWO] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing junctions (avoid duplicate inserts since no DB-level UNIQUE)
  // + hours logged per WO
  useEffect(() => {
    const woIds = availableWOs.map(w => w.work_order_id);
    if (woIds.length === 0) return;

    if (selectedItemIds.length > 0) {
      supabase.from("tbl_jobitem_workorder")
        .select("job_item_id, work_order_id")
        .in("work_order_id", woIds)
        .in("job_item_id", selectedItemIds)
        .then(({ data }) => {
          if (data) {
            setExistingJunctions(new Set(data.map(j => `${j.job_item_id}-${j.work_order_id}`)));
          }
        });
    }

    supabase.from("tbl_wo_time_entries")
      .select("work_order_id, actual_hours")
      .in("work_order_id", woIds)
      .is("archived_at", null)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<number, number> = {};
        for (const e of data) {
          if (!e.work_order_id) continue;
          map[e.work_order_id] = (map[e.work_order_id] || 0) + (Number(e.actual_hours) || 0);
        }
        setHoursByWO(map);
      });
  }, []);

  const handleSubmit = async () => {
    if (!chosenWO) { setError("Select a Work Order"); return; }
    if (selectedItemIds.length === 0) { setError("No items selected"); return; }
    setSaving(true); setError(null);

    const toInsert = selectedItemIds
      .filter(itemId => !existingJunctions.has(`${itemId}-${chosenWO}`))
      .map(itemId => ({ job_item_id: itemId, work_order_id: chosenWO }));

    if (toInsert.length === 0) {
      setError("All selected items are already linked to this Work Order");
      setSaving(false);
      return;
    }

    const { error: insErr } = await supabase.from("tbl_jobitem_workorder").insert(toInsert);
    if (insErr) {
      setError(insErr.message);
      setSaving(false);
      return;
    }

    const woRow = availableWOs.find(w => w.work_order_id === chosenWO);
    await notify({
      supabase,
      type: "scope_change",
      title: `${toInsert.length} item${toInsert.length === 1 ? "" : "s"} added to WO`,
      detail: woRow ? `Added to: ${woRow.display_label}` : undefined,
      severity: "info",
      jobId,
      woId: chosenWO,
      actionUrl: `/jobs/${jobId}/scope/${scopeItemId}?wo=${chosenWO}`,
    });

    toast.success(`Added ${toInsert.length} item${toInsert.length === 1 ? "" : "s"} to WO`);
    setSaving(false);
    onAdded(chosenWO);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle shrink-0">
          <div>
            <h2 className="text-base font-semibold text-navy">Add to existing Work Order</h2>
            <p className="text-xs text-muted mt-0.5">
              {selectedItemIds.length} item{selectedItemIds.length === 1 ? "" : "s"} will be linked
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-mid rounded-lg transition-colors">
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {availableWOs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted">No live Work Orders on this scope.</p>
              <p className="text-xs text-faint mt-1">Create a new WO instead.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {availableWOs.map(wo => {
                const sel = chosenWO === wo.work_order_id;
                const hrs = hoursByWO[wo.work_order_id] ?? 0;
                return (
                  <button
                    key={wo.work_order_id}
                    type="button"
                    onClick={() => setChosenWO(wo.work_order_id)}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors border ${
                      sel
                        ? "bg-starlight-blue/5 border-starlight-blue/40"
                        : "border-subtle hover:bg-surface-dim/50"
                    }`}
                  >
                    <div className="pt-0.5 shrink-0">
                      {sel
                        ? <CheckCircle2 className="h-4 w-4 text-starlight-blue" />
                        : <Circle className="h-4 w-4 text-faint" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-navy">{wo.display_label}</span>
                        {wo.status && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-mid text-muted">
                            {wo.status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {wo.current_item_count} item{wo.current_item_count === 1 ? "" : "s"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {hrs.toFixed(1)}h logged
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {error && (
            <div className="mt-3 text-sm text-starlight-red bg-starlight-red/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-subtle flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !chosenWO || availableWOs.length === 0}
            className="px-4 py-2 bg-starlight-blue text-white text-sm font-medium rounded-lg hover:bg-starlight-blue/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add to WO"}
          </button>
        </div>
      </div>
    </div>
  );
}
