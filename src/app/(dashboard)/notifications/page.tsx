"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import {
  Bell, CheckCircle2, AlertTriangle, AlertOctagon, X,
  ExternalLink, Filter, Trash2, CheckCheck,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useRealtimeRefresh } from "@/lib/use-realtime";

interface Notification {
  notification_id: number;
  type: string;
  title: string;
  detail: string | null;
  severity: string;
  source_freelancer_id: number | null;
  source_job_id: number | null;
  source_wo_id: number | null;
  read_at: string | null;
  dismissed_at: string | null;
  action_url: string | null;
  created_at: string;
}

type FilterMode = "all" | "action" | "urgent";

const severityConfig: Record<string, { icon: typeof Bell; color: string; bg: string; label: string }> = {
  info: { icon: Bell, color: "text-starlight-blue", bg: "bg-starlight-blue/10", label: "Info" },
  warning: { icon: AlertTriangle, color: "text-starlight-amber", bg: "bg-starlight-amber/10", label: "Needs attention" },
  urgent: { icon: AlertOctagon, color: "text-starlight-red", bg: "bg-starlight-red/10", label: "Urgent" },
};

const typeLabels: Record<string, string> = {
  booking_confirmed: "Booking",
  booking_declined: "Booking",
  booking_withdrawal: "Booking",
  wo_started: "Workshop",
  hours_logged: "Time",
  wo_flagged: "Flag",
  wo_completed: "Workshop",
  scope_change: "Scope",
  wo_overrun: "Cost",
  material_needed: "Materials",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NotificationsPage() {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("all");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tbl_notifications")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    setNotifications((data || []) as Notification[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // Real-time: new notifications appear instantly
  useRealtimeRefresh("tbl_notifications", loadNotifications, !loading);

  const markRead = async (id: number) => {
    await supabase.from("tbl_notifications").update({ read_at: new Date().toISOString() }).eq("notification_id", id);
    setNotifications((prev) => prev.map((n) => n.notification_id === id ? { ...n, read_at: new Date().toISOString() } : n));
  };

  const dismiss = async (id: number) => {
    await supabase.from("tbl_notifications").update({ dismissed_at: new Date().toISOString() }).eq("notification_id", id);
    setNotifications((prev) => prev.filter((n) => n.notification_id !== id));
    toast("Notification dismissed");
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.notification_id);
    if (unreadIds.length === 0) return;
    await supabase.from("tbl_notifications").update({ read_at: new Date().toISOString() }).in("notification_id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    toast.success(`${unreadIds.length} marked as read`);
  };

  const dismissAllRead = async () => {
    const readIds = notifications.filter((n) => n.read_at).map((n) => n.notification_id);
    if (readIds.length === 0) return;
    await supabase.from("tbl_notifications").update({ dismissed_at: new Date().toISOString() }).in("notification_id", readIds);
    setNotifications((prev) => prev.filter((n) => !n.read_at));
    toast.success(`${readIds.length} cleared`);
  };

  // Filtering
  const filtered = notifications.filter((n) => {
    if (filter === "action") return n.severity === "warning" || n.severity === "urgent";
    if (filter === "urgent") return n.severity === "urgent";
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const actionCount = notifications.filter((n) => !n.read_at && (n.severity === "warning" || n.severity === "urgent")).length;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted text-sm animate-pulse">Loading notifications...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Notifications</h1>
          <p className="text-sm text-muted mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            {actionCount > 0 && ` · ${actionCount} need attention`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-muted hover:text-navy hover:bg-surface-mid rounded-lg transition-colors">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
          {notifications.some((n) => n.read_at) && (
            <button onClick={dismissAllRead} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-muted hover:text-navy hover:bg-surface-mid rounded-lg transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Clear read
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-surface-mid rounded-lg p-1 w-fit">
        {([
          { key: "all", label: "All", count: notifications.length },
          { key: "action", label: "Needs attention", count: notifications.filter((n) => n.severity === "warning" || n.severity === "urgent").length },
          { key: "urgent", label: "Urgent", count: notifications.filter((n) => n.severity === "urgent").length },
        ] as { key: FilterMode; label: string; count: number }[]).map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={"px-3 py-1.5 text-xs font-medium rounded-md transition-colors " +
              (filter === f.key ? "bg-surface text-navy shadow-sm" : "text-muted hover:text-navy")}>
            {f.label} {f.count > 0 && <span className="ml-1 text-muted">({f.count})</span>}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <Bell className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted">{filter === "all" ? "No notifications" : "Nothing matching this filter"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const cfg = severityConfig[n.severity] || severityConfig.info;
            const Icon = cfg.icon;
            const isUnread = !n.read_at;
            const typeLabel = typeLabels[n.type] || n.type;

            return (
              <div key={n.notification_id}
                className={"card px-4 py-3 flex gap-3 transition-colors cursor-pointer " + (isUnread ? "border-l-4 border-l-navy" : "opacity-70")}
                onClick={() => isUnread && markRead(n.notification_id)}>
                {/* Icon */}
                <div className={"shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 " + cfg.bg}>
                  <Icon className={"h-4 w-4 " + cfg.color} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={"text-[10px] font-medium px-1.5 py-0.5 rounded " + cfg.bg + " " + cfg.color}>{typeLabel}</span>
                        <span className="text-[10px] text-muted">{timeAgo(n.created_at)}</span>
                        {isUnread && <span className="w-2 h-2 rounded-full bg-starlight-blue shrink-0" />}
                      </div>
                      <p className={"text-sm " + (isUnread ? "font-medium text-navy" : "text-muted")}>{n.title}</p>
                      {n.detail && <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.detail}</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {n.action_url && (
                        <Link href={n.action_url} onClick={(e) => e.stopPropagation()}
                          className="p-1.5 text-faint hover:text-starlight-blue hover:bg-starlight-blue/10 rounded-lg transition-colors">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); dismiss(n.notification_id); }}
                        className="p-1.5 text-faint hover:text-starlight-red hover:bg-starlight-red/10 rounded-lg transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
