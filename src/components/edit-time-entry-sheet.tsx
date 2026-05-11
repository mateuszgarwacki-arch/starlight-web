"use client";

/**
 * EditTimeEntrySheet — freelancer-facing sheet for proposing changes to an
 * existing time entry. Submits a pending row to tbl_wo_time_entry_edits;
 * the original entry is not touched until a PM approves.
 *
 * UX:
 * - Opens pre-filled with the entry's current hours + WO.
 * - Reason field is required (used as the LogSheet "notes" field).
 * - Photos hidden (don't make sense for an edit request).
 *
 * Used from anywhere a freelancer sees their own time entries:
 *   /m/me (Last 10 Days, Recent Entries), /m/wo/[woId], /m/schedule.
 */

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { LogSheet, type LogSheetData, type WoOption } from "@/components/log-sheet";
import { notify } from "@/lib/notifications";
import { toast } from "sonner";
import { formatHours } from "@/lib/format-hours";

export interface EditableEntry {
  entry_id: number;
  freelancer_id: number;
  actual_hours: number;
  work_order_id: number;
  /** Display only — used for the sheet header. */
  description?: string | null;
  /** Display only. */
  date?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  entry: EditableEntry | null;
  woOptions: WoOption[];
  /** Called after a successful submit so the parent can refresh its
      entry list and pending-edits map. */
  onSubmitted?: () => void;
}

export function EditTimeEntrySheet({ open, onClose, entry, woOptions, onSubmitted }: Props) {
  const supabase = createClient();
  const [submitting, setSubmitting] = useState(false);
  const [existingPending, setExistingPending] = useState<{ edit_id: number; proposed_actual_hours: number | null; proposed_work_order_id: number | null; proposed_date: string | null; reason: string } | null>(null);

  // When the sheet opens for a specific entry, check whether there's already
  // a pending edit on that entry (e.g. freelancer is revising their proposal).
  // If yes, we'll UPDATE that row instead of inserting a new one — the
  // unique-pending-per-entry index would block a second insert anyway.
  useEffect(() => {
    if (!open || !entry) { setExistingPending(null); return; }
    (async () => {
      const { data } = await supabase
        .from("tbl_wo_time_entry_edits")
        .select("edit_id, proposed_actual_hours, proposed_work_order_id, proposed_date, reason")
        .eq("entry_id", entry.entry_id)
        .eq("status", "pending")
        .maybeSingle();
      setExistingPending(data as any);
    })();
  }, [open, entry]);

  if (!entry) return null;

  // Pre-fill: prefer existing-pending values (revision), else current entry.
  const initialHours = existingPending?.proposed_actual_hours ?? entry.actual_hours;
  const initialWoId = existingPending?.proposed_work_order_id ?? entry.work_order_id;
  const initialDate = existingPending?.proposed_date ?? entry.date ?? "";
  const currentWo = woOptions.find((w) => w.work_order_id === initialWoId) || null;

  const handleSubmit = async (data: LogSheetData) => {
    if (!data.notes || !data.notes.trim()) {
      toast.error("Please give a reason for the edit");
      return;
    }
    if (data.hours <= 0) {
      toast.error("Enter hours");
      return;
    }
    const targetWoId = data.routedWoId ?? entry.work_order_id;

    // Compute proposed_* — only set values that actually differ from the
    // current entry. This keeps the diff in the PM review UI clean.
    const proposedHours = data.hours !== entry.actual_hours ? data.hours : null;
    const proposedWoId = targetWoId !== entry.work_order_id ? targetWoId : null;
    const proposedDate = (data.date && entry.date && data.date !== entry.date) ? data.date : null;

    if (proposedHours === null && proposedWoId === null && proposedDate === null) {
      toast.error("Nothing changed");
      return;
    }

    setSubmitting(true);
    try {
      if (existingPending) {
        // Revise existing proposal in place. RLS allows freelancer to
        // update their own pending edit.
        const { error } = await supabase
          .from("tbl_wo_time_entry_edits")
          .update({
            proposed_actual_hours: proposedHours,
            proposed_work_order_id: proposedWoId,
            proposed_date: proposedDate,
            reason: data.notes.trim(),
          })
          .eq("edit_id", existingPending.edit_id);
        if (error) throw error;
        toast.success("Edit request updated");
      } else {
        const { error } = await supabase.from("tbl_wo_time_entry_edits").insert({
          entry_id: entry.entry_id,
          freelancer_id: entry.freelancer_id,
          proposed_actual_hours: proposedHours,
          proposed_work_order_id: proposedWoId,
          proposed_date: proposedDate,
          reason: data.notes.trim(),
          status: "pending",
        });
        if (error) throw error;
        toast.success("Edit request submitted — pending review");
      }

      // Notify the PM review queue. Severity warning so it stands out.
      const wo = woOptions.find((w) => w.work_order_id === targetWoId);
      await notify({
        supabase,
        type: "wo_flagged",
        severity: "warning",
        title: `Edit request: ${formatHours(entry.actual_hours)} → ${formatHours(data.hours)}`,
        detail: wo ? `${wo.job_number} · ${wo.description || wo.scope_name}` : "",
        freelancerId: entry.freelancer_id,
        actionUrl: "/review/timesheets",
      });

      onSubmitted?.();
      onClose();
    } catch (err: any) {
      toast.error("Failed: " + (err.message || "unknown"));
    } finally {
      setSubmitting(false);
    }
  };

  // Withdraw — freelancer cancels their pending edit. Soft-cancel (status
  // → 'withdrawn') so the audit trail survives.
  const handleWithdraw = async () => {
    if (!existingPending) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("tbl_wo_time_entry_edits")
        .update({ status: "withdrawn" })
        .eq("edit_id", existingPending.edit_id);
      if (error) throw error;
      toast.success("Edit request withdrawn");
      onSubmitted?.();
      onClose();
    } catch (err: any) {
      toast.error("Failed: " + (err.message || "unknown"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <LogSheet
        open={open}
        onClose={onClose}
        onSubmit={handleSubmit}
        contextLabel={existingPending ? "Revise edit request" : "Edit entry"}
        contextSublabel={
          entry.date
            ? `${entry.date} · was ${formatHours(entry.actual_hours)}`
            : `Was ${formatHours(entry.actual_hours)}`
        }
        defaultHours={initialHours}
        defaultDate={initialDate}
        showDatePicker
        defaultRoutedWo={currentWo}
        notesPlaceholder="Why does this need changing..."
        submitLabel={existingPending ? "Update request" : "Submit for review"}
        submitting={submitting}
        woOptions={woOptions}
        woPickerLabel="Work Order"
        hidePhotos
      />
      {/* Withdraw control — shown as a separate small action so it doesn't
          clutter the LogSheet itself. Sits below the sheet visually when
          there's an existing pending edit. */}
      {open && existingPending && (
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-[70] pointer-events-none">
          <button
            onClick={handleWithdraw}
            disabled={submitting}
            className="pointer-events-auto px-3 py-1.5 bg-surface-dim border border-subtle rounded-lg text-xs text-muted active:text-starlight-red disabled:opacity-50"
          >
            Withdraw request
          </button>
        </div>
      )}
    </>
  );
}
