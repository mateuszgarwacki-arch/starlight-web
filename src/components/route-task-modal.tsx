"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getAuditContext, auditedInsert } from "@/lib/audit";
import { formatHours } from "@/lib/format-hours";
import { formatDate } from "@/lib/utils";
import { notify } from "@/lib/notifications";
import { toast } from "sonner";
import {
  JobWorkOrderPicker,
  type WOOption,
} from "@/components/job-work-order-picker";
import { X, CornerDownRight, Clock } from "lucide-react";

// ————————————————————————————————————————————————————————
// Types
// ————————————————————————————————————————————————————————

export interface RoutableTask {
  item_id: number; // task_id
  title: string;
  description: string | null; // freelancer's note, if any
  freelancer_id: number;
  freelancer_name: string;
  claimed_hours: number | null;
  worked_date: string | null;
  job_id: number | null;
  work_order_id: number | null; // pre-routed WO from mobile, if any
}

interface Props {
  task: RoutableTask;
  onClose: () => void;
  onSuccess: () => void;
}

// ————————————————————————————————————————————————————————
// Component
//
// The two-pane job → WO search lives in <JobWorkOrderPicker>. This component
// owns only the task-routing concern: the header (task context), the footer
// (hours + note), and the submit (create time entry + flip tbl_tasks to
// routed + notify).
// ————————————————————————————————————————————————————————

export function RouteTaskModal({ task, onClose, onSuccess }: Props) {
  const supabase = createClient();

  const [selectedWo, setSelectedWo] = useState<WOOption | null>(null);
  const [routeHours, setRouteHours] = useState(
    task.claimed_hours ? String(task.claimed_hours) : "",
  );
  const [routeNote, setRouteNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedWoId = selectedWo?.work_order_id ?? null;

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!selectedWo) return;
    const hrs = parseFloat(routeHours);
    if (!hrs || hrs <= 0) {
      toast.error("Enter valid hours");
      return;
    }
    setSubmitting(true);
    try {
      const ctx = await getAuditContext(supabase);
      const wo = selectedWo;
      const { data: freelancer } = await supabase
        .from("tbl_freelancers")
        .select("day_rate, standard_day_hours")
        .eq("freelancer_id", task.freelancer_id)
        .single();
      const hourlyRate =
        freelancer && freelancer.standard_day_hours > 0
          ? freelancer.day_rate / freelancer.standard_day_hours
          : 0;

      await auditedInsert(
        ctx,
        "tbl_wo_time_entries",
        {
          work_order_id: wo.work_order_id,
          freelancer_id: task.freelancer_id,
          actual_hours: hrs,
          applied_hourly_rate: hourlyRate,
          entry_cost: hrs * hourlyRate,
          system_start_timestamp: task.worked_date
            ? task.worked_date + "T09:00:00"
            : null,
          actual_start_timestamp: task.worked_date
            ? task.worked_date + "T09:00:00"
            : null,
          system_end_timestamp: task.worked_date
            ? task.worked_date + "T17:00:00"
            : null,
          actual_end_timestamp: task.worked_date
            ? task.worked_date + "T17:00:00"
            : null,
          flag_note: routeNote.trim()
            ? `Routed: ${routeNote.trim()}`
            : wo.is_overhead
              ? "Routed to job overhead"
              : "Routed from ad-hoc task",
        },
        wo.job_id,
      );

      await supabase
        .from("tbl_tasks")
        .update({
          status: "routed",
          routed_to_wo_id: wo.work_order_id,
          routed_hours: hrs,
          reviewed_by: ctx.userId,
          reviewed_at: new Date().toISOString(),
          review_note: routeNote || null,
        })
        .eq("task_id", task.item_id);

      await notify({
        supabase,
        type: "task_reviewed",
        title: `Task routed: ${task.title}`,
        detail: `${formatHours(hrs)} \u2192 ${wo.is_overhead ? "Job Overhead" : wo.description?.slice(0, 60) || "WO"}${routeNote ? ` \u00b7 ${routeNote}` : ""}`,
        severity: "info",
        freelancerId: task.freelancer_id,
        woId: wo.work_order_id,
        jobId: wo.job_id,
      });

      toast.success(
        wo.is_overhead ? "Task routed to Job Overhead" : "Task routed to WO",
      );
      onSuccess();
    } catch {
      toast.error("Failed to route task");
    }
    setSubmitting(false);
  };

  const hoursChanged =
    task.claimed_hours != null &&
    routeHours !== "" &&
    parseFloat(routeHours) !== task.claimed_hours;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col border border-subtle overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-subtle flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CornerDownRight className="h-4 w-4 text-starlight-blue" />
              <h3 className="text-base font-semibold text-navy">
                Route task to work order
              </h3>
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted flex-wrap">
              <span className="font-medium text-navy">{task.title}</span>
              <span>&middot;</span>
              <span>{task.freelancer_name}</span>
              {task.claimed_hours != null && (
                <>
                  <span>&middot;</span>
                  <span className="font-semibold text-navy">
                    {formatHours(task.claimed_hours)}
                  </span>
                </>
              )}
              {task.worked_date && (
                <>
                  <span>&middot;</span>
                  <span>{formatDate(task.worked_date)}</span>
                </>
              )}
            </div>
            {task.description && (
              <div className="mt-2 px-3 py-2 bg-surface-dim border-l-2 border-starlight-blue/60 rounded-r text-xs text-navy whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-0.5">
                  Freelancer&apos;s note
                </div>
                {task.description}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-mid rounded-lg text-muted hover:text-navy transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Two-pane body — shared job → WO picker */}
        <div className="flex-1 flex min-h-0">
          <JobWorkOrderPicker
            pinnedJobId={task.job_id}
            pinnedBadgeLabel="Task's job"
            initialWoId={task.work_order_id}
            selectedWoId={selectedWoId}
            onSelect={setSelectedWo}
          />
        </div>

        {/* Footer — hours, note, actions */}
        <div className="px-6 py-4 border-t border-subtle bg-surface-dim flex items-end gap-3 shrink-0 flex-wrap">
          <div className="w-full -mb-1">
            {selectedWo ? (
              <p className="text-xs text-navy">
                <CornerDownRight className="inline h-3 w-3 text-starlight-blue mr-1 -mt-0.5" />
                <span className="text-muted">Routing to: </span>
                <span className="font-semibold">
                  {selectedWo.is_overhead ? "Job Overhead" : selectedWo.scope_name}
                </span>
                {selectedWo.description ? (
                  <span className="text-muted"> — {selectedWo.description}</span>
                ) : null}
              </p>
            ) : (
              <p className="text-xs text-muted italic">
                Select a work order above to route this time
              </p>
            )}
          </div>
          <div className="shrink-0">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Hours
            </label>
            <input
              type="number"
              step="0.25"
              min="0"
              value={routeHours}
              onChange={(e) => setRouteHours(e.target.value)}
              className="w-24 px-3 py-2 bg-surface border border-subtle rounded-lg text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-starlight-blue/30"
            />
            {hoursChanged && (
              <p className="text-[10px] text-starlight-amber mt-1">
                Claimed: {formatHours(task.claimed_hours!)}
              </p>
            )}
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">
              Note to freelancer (optional)
            </label>
            <input
              type="text"
              value={routeNote}
              onChange={(e) => setRouteNote(e.target.value)}
              placeholder="e.g. Good to know this is on overhead — keep logging here for load days"
              className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/30"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedWoId || submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-starlight-blue text-white rounded-lg hover:bg-starlight-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                "Routing\u2026"
              ) : (
                <>
                  <CornerDownRight className="h-4 w-4" />
                  Route &amp; create entry
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
