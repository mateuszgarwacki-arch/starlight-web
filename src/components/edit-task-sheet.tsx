"use client";

/**
 * EditTaskSheet — small sheet for freelancers to edit their own ad-hoc
 * tasks from /m/me. Unlike the WO time entry edit flow (which uses a
 * pending-edits table because the original carries cost into reports
 * the moment it's logged), tasks are simpler:
 *
 * - status='pending'  → PM hasn't reviewed yet. Direct update.
 * - status='approved_overhead' → PM HAS reviewed. Update values BUT
 *   revert status to 'pending' and clear review_note, so the PM
 *   re-confirms before the (changed) hours count as overhead again.
 * - Other statuses (routed, rejected) → not editable.
 */

import { useState, useEffect } from "react";
import { Minus, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { formatHours } from "@/lib/format-hours";
import { auditedUpdate, getAuditContext } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { toast } from "sonner";

export interface EditableTask {
  task_id: number;
  freelancer_id: number;
  title: string;
  description: string | null;
  hours: number;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  task: EditableTask | null;
  onSubmitted?: () => void;
}

export function EditTaskSheet({ open, onClose, task, onSubmitted }: Props) {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && task) {
      setTitle(task.title || "");
      setHours(task.hours || 0);
    }
  }, [open, task]);

  if (!open || !task) return null;

  const adjustHours = (delta: number) =>
    setHours((p) => Math.max(0.25, Math.round((p + delta) * 4) / 4));

  const editable = task.status === "pending" || task.status === "approved_overhead";
  const needsReReview = task.status === "approved_overhead";

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    if (hours <= 0) { toast.error("Enter hours"); return; }

    setSubmitting(true);
    try {
      const ctx = await getAuditContext(supabase);
      const update: Record<string, any> = { title: title.trim(), hours };
      if (needsReReview) {
        update.status = "pending";
        update.review_note = null;
      }
      const result = await auditedUpdate(ctx, "tbl_tasks", task.task_id, update);
      if (result.error) { toast.error("Failed: " + result.error.message); setSubmitting(false); return; }

      await notify({
        supabase,
        type: "task_submitted",
        severity: needsReReview ? "warning" : "info",
        title: needsReReview
          ? `Task edited (re-review): ${title.trim()}`
          : `Task updated: ${title.trim()}`,
        detail: `${formatHours(hours)}${needsReReview ? " - PM had already approved" : ""}`,
        freelancerId: task.freelancer_id,
        actionUrl: "/review/inbox",
      });

      toast.success(needsReReview ? "Updated - needs re-approval" : "Updated");
      onSubmitted?.();
      onClose();
    } catch (err: any) {
      toast.error("Failed: " + (err.message || "unknown"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-end justify-center">
      <div className="bg-surface w-full max-w-lg rounded-t-2xl p-5 pb-10 space-y-4 animate-slide-up max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-navy">Edit ad-hoc task</h2>
            <p className="text-[11px] text-muted mt-0.5">
              {needsReReview ? "PM already approved - your edit will need re-approval" : "Pending PM review"}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-muted shrink-0 ml-2"><X className="h-5 w-5" /></button>
        </div>

        {!editable ? (
          <p className="text-xs text-muted text-center py-6">
            This task is {task.status === "routed" ? "already routed to a Work Order" : task.status}.
            <br />Edits aren't supported here.
          </p>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">What did you work on?</label>
              <input
                type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
                className="w-full px-4 py-3 bg-surface-dim border border-subtle rounded-xl text-sm text-navy placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-starlight-blue/30"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted shrink-0 w-12">Hours</label>
              <div className="flex items-center bg-surface-dim border border-subtle rounded-xl overflow-hidden flex-1 min-w-0">
                <button type="button" onClick={() => adjustHours(-0.25)} className="shrink-0 px-4 py-3 text-muted active:bg-surface-mid border-r border-subtle"><Minus className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1 text-center py-3 text-lg font-bold text-navy bg-transparent font-mono tabular-nums select-none">
                  {hours > 0 ? formatHours(hours) : "-"}
                </div>
                <button type="button" onClick={() => adjustHours(0.25)} className="shrink-0 px-4 py-3 text-muted active:bg-surface-mid border-l border-subtle"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            <button onClick={handleSave} disabled={submitting || hours <= 0 || !title.trim()}
              className="w-full py-3.5 bg-navy text-white text-sm font-semibold rounded-xl active:bg-navy/90 disabled:opacity-40 transition-colors">
              {submitting ? "Saving..." : "Save changes"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

