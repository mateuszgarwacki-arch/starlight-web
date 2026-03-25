import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Notification helper — single function for all notification types
// ============================================================

export type NotificationType =
  | "booking_confirmed"
  | "booking_declined"
  | "booking_withdrawal"
  | "wo_started"
  | "hours_logged"
  | "wo_flagged"
  | "wo_completed"
  | "scope_change"
  | "wo_overrun"
  | "material_needed"
  | "task_submitted"
  | "task_reviewed"
  | "workshop_request"
  | "request_resolved";

export type NotificationSeverity = "info" | "warning" | "urgent";

interface NotifyParams {
  supabase: SupabaseClient;
  type: NotificationType;
  title: string;
  detail?: string;
  severity?: NotificationSeverity;
  freelancerId?: number;
  jobId?: number | null;
  scheduleId?: number;
  woId?: number;
  actionUrl?: string;
}

export async function notify({
  supabase, type, title, detail, severity = "info",
  freelancerId, jobId, scheduleId, woId, actionUrl,
}: NotifyParams) {
  await supabase.from("tbl_notifications").insert({
    type,
    title,
    detail: detail || null,
    severity,
    source_freelancer_id: freelancerId || null,
    source_job_id: jobId || null,
    source_schedule_id: scheduleId || null,
    source_wo_id: woId || null,
    action_url: actionUrl || null,
  });
}
