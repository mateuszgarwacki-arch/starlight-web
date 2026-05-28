"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getAuditContext, auditedUpdate, auditedInsert } from "@/lib/audit";
import { formatHours } from "@/lib/format-hours";
import { notify } from "@/lib/notifications";
import { useRealtimeRefresh } from "@/lib/use-realtime";
import { formatDate } from "@/lib/utils";
import { Clock, Package, Wrench, Archive, AlertTriangle, MessageSquare, Check, X, CornerDownRight, RefreshCw, ChevronDown, Image } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ReviewNavChips } from "@/components/review-nav-chips";
import { RouteTaskModal } from "@/components/route-task-modal";

interface InboxItem { item_type: "task" | "request"; item_id: number; freelancer_id: number; freelancer_name: string; category: string; title: string; description: string | null; claimed_hours: number | null; worked_date: string | null; job_id: number | null; job_name: string | null; job_number: string | null; urgency: string | null; photo_url: string | null; photo_urls: string[] | null; work_order_id: number | null; status: string; created_at: string; }

const CATEGORY_LABELS: Record<string, { label: string; icon: any }> = { job_work: { label: "Job Work", icon: Clock }, maintenance: { label: "Maintenance", icon: Wrench }, workshop_general: { label: "Workshop General", icon: Archive }, other: { label: "Other", icon: MessageSquare }, order_material: { label: "Order Material", icon: Package }, repair_equipment: { label: "Repair Equipment", icon: Wrench }, restock: { label: "Restock", icon: Archive }, safety: { label: "Safety", icon: AlertTriangle }, general: { label: "General", icon: MessageSquare } };

export default function ReviewInboxPage() {
  const supabase = createClient();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [routingTask, setRoutingTask] = useState<InboxItem | null>(null);
  const [actionItem, setActionItem] = useState<InboxItem | null>(null);
  const [actionType, setActionType] = useState<string>("");
  const [actionNote, setActionNote] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  // Per-task hours edits: PM can override claimed_hours inline before
  // Approve/Route, so phantoms (auto-closed to 0h) can be corrected
  // without leaving the inbox.
  const [editedHours, setEditedHours] = useState<Record<number, number>>({});
  const effectiveHours = (task: InboxItem) =>
    editedHours[task.item_id] ?? task.claimed_hours ?? 0;

  const loadInbox = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("qry_review_inbox").select("*");
    const inboxItems = (data || []) as InboxItem[];
    // Fetch photo_urls for task items
    const taskIds = inboxItems.filter(i => i.item_type === "task").map(i => i.item_id);
    if (taskIds.length > 0) {
      const { data: taskPhotos } = await supabase.from("tbl_tasks").select("task_id, photo_urls").in("task_id", taskIds);
      const photoMap: Record<number, string[]> = {};
      (taskPhotos || []).forEach((t: any) => {
        if (t.photo_urls) { try { photoMap[t.task_id] = JSON.parse(t.photo_urls); } catch {} }
      });
      inboxItems.forEach(item => { if (item.item_type === "task" && photoMap[item.item_id]) { item.photo_urls = photoMap[item.item_id]; } });
    }
    setItems(inboxItems);
    setLoading(false);
  }, []);
  useEffect(() => { loadInbox(); }, [loadInbox]);
  useRealtimeRefresh(["tbl_tasks", "tbl_workshop_requests"], loadInbox);

  const openRouteModal = (task: InboxItem) => {
    // If PM has edited hours inline, push the edit into the modal so
    // routing carries the corrected value through to the WO entry.
    const edited = editedHours[task.item_id];
    setRoutingTask(edited != null ? { ...task, claimed_hours: edited } : task);
  };

  const handleApproveOverhead = async (task: InboxItem, note: string) => {
    const ctx = await getAuditContext(supabase);
    const hrs = effectiveHours(task);

    // Record the labour in the workshop overhead pool so it stops being a
    // costing black hole. Rate = day_rate / standard_day_hours, the same calc
    // the WO router uses. A unique index on source_task_id keeps this
    // idempotent — a task can only ever spawn one overhead row.
    const { data: fr } = await supabase
      .from("tbl_freelancers")
      .select("day_rate, standard_day_hours")
      .eq("freelancer_id", task.freelancer_id)
      .single();
    const hourlyRate =
      fr && fr.standard_day_hours > 0 ? fr.day_rate / fr.standard_day_hours : 0;
    const { data: cat } = await supabase
      .from("tbl_master_lookups")
      .select("lookup_id")
      .eq("category", "OVERHEAD_CATEGORY")
      .eq("lookup_value", "General labour")
      .maybeSingle();
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;

    const ins = await auditedInsert(ctx, "tbl_overhead_costs", {
      cost_date: task.worked_date || today,
      cost_type: "labour",
      category_id: cat?.lookup_id ?? null,
      description: task.title,
      amount: Math.round(hrs * hourlyRate * 100) / 100,
      hours: hrs,
      freelancer_id: task.freelancer_id,
      source_task_id: task.item_id,
      note: note || null,
      created_by: ctx.userId,
    });
    // 23505 = unique violation (task already produced an overhead row): fine,
    // treat as already-recorded. Any other error: stop, don't mark approved.
    if (ins.error && (ins.error as any).code !== "23505") {
      toast.error("Couldn't record overhead labour");
      return;
    }

    await auditedUpdate(ctx, "tbl_tasks", task.item_id, {
      status: "approved_overhead",
      hours: hrs,
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    });
    await notify({ supabase, type: "task_reviewed", title: `Task approved: ${task.title}`, detail: note || `Logged to workshop overhead (${hrs}h)`, severity: "info", freelancerId: task.freelancer_id });
    toast.success(`Logged to workshop overhead — ${hrs}h`); loadInbox();
  };

  const handleRejectTask = async (task: InboxItem, note: string) => {
    if (!note.trim()) { toast.error("Rejection needs a reason"); return; }
    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_tasks", task.item_id, {
      status: "rejected",
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    });
    await notify({ supabase, type: "task_reviewed", title: `Task rejected: ${task.title}`, detail: note, severity: "warning", freelancerId: task.freelancer_id });
    toast.success("Task rejected"); loadInbox();
  };

  const handleRequestAction = async (item: InboxItem, action: string, note: string) => {
    if (action === "dismissed" && !note.trim()) { toast.error("Dismissal needs a reason"); return; }
    if (action === "resolved" && !note.trim()) { toast.error("Resolution needs a note"); return; }
    const ctx = await getAuditContext(supabase);
    const updates: Record<string, any> = { status: action };
    if (["resolved", "dismissed"].includes(action)) { updates.resolved_by = ctx.userId; updates.resolved_at = new Date().toISOString(); updates.resolution_note = note || null; }
    await supabase.from("tbl_workshop_requests").update(updates).eq("request_id", item.item_id);
    await notify({ supabase, type: "request_resolved", title: action === "acknowledged" ? `Request seen: ${item.title}` : `Request ${action}: ${item.title}`, detail: note || `Status: ${action}`, severity: "info", freelancerId: item.freelancer_id, jobId: item.job_id });
    toast.success(action === "acknowledged" ? "Acknowledged" : `Request ${action}`); loadInbox();
  };

  const pendingTasks = items.filter((i) => i.item_type === "task");
  const openRequests = items.filter((i) => i.item_type === "request");

  if (loading) { return <div className="flex items-center justify-center h-64 text-muted text-sm animate-pulse">Loading inbox...</div>; }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Workshop Inbox</h1>
          <p className="text-sm text-muted mt-0.5">{pendingTasks.length} pending task{pendingTasks.length !== 1 ? "s" : ""}, {openRequests.length} open request{openRequests.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={loadInbox} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-navy hover:bg-surface-mid rounded-lg transition-colors"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>

      <ReviewNavChips />

      {items.length === 0 && (<div className="card px-8 py-12 text-center"><Check className="h-10 w-10 text-starlight-green mx-auto mb-3" /><p className="text-lg font-semibold text-navy">All clear</p><p className="text-sm text-muted mt-1">No pending tasks or open requests</p></div>)}

      <div className="space-y-3">
        {items.map((item) => {
          const catInfo = CATEGORY_LABELS[item.category] || { label: item.category, icon: MessageSquare };
          const CatIcon = catInfo.icon; const isTask = item.item_type === "task"; const isUrgent = item.urgency === "urgent";
          return (
            <div key={`${item.item_type}-${item.item_id}`} className={"card px-5 py-4 " + (isUrgent ? "border-l-4 border-l-starlight-red" : "")}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={"p-2 rounded-lg shrink-0 " + (isTask ? "bg-navy/5" : "bg-starlight-amber/5")}><CatIcon className={"h-4 w-4 " + (isTask ? "text-navy" : "text-starlight-amber")} /></div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={"text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider " + (isTask ? "bg-navy/10 text-navy" : "bg-starlight-amber/10 text-starlight-amber")}>{isTask ? "Task" : "Request"}</span>
                      <span className="text-[10px] text-muted">{catInfo.label}</span>
                      {isUrgent && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-starlight-red/10 text-starlight-red">URGENT</span>}
                    </div>
                    <p className="text-sm font-semibold text-navy mt-1">{item.title}</p>
                    {item.description && <p className="text-xs text-muted mt-0.5">{item.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted">
                      <span>{item.freelancer_name}</span>{item.job_number && <span className="font-mono">{item.job_number} — {item.job_name}</span>}
                      {isTask ? (
                        <label className="inline-flex items-center gap-1" title="Edit hours before approving or routing">
                          <span className="text-muted">Hours:</span>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            value={editedHours[item.item_id] ?? item.claimed_hours ?? 0}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setEditedHours((p) => ({ ...p, [item.item_id]: isNaN(v) ? 0 : v }));
                            }}
                            className={
                              "w-14 px-1.5 py-0.5 border rounded text-xs font-semibold text-navy bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue " +
                              (editedHours[item.item_id] != null && editedHours[item.item_id] !== (item.claimed_hours ?? 0)
                                ? "border-starlight-amber"
                                : "border-subtle")
                            }
                            aria-label="Hours"
                          />
                          {editedHours[item.item_id] != null && editedHours[item.item_id] !== (item.claimed_hours ?? 0) && (
                            <span className="text-[9px] text-starlight-amber" title={`Original: ${item.claimed_hours ?? 0}h`}>edited</span>
                          )}
                        </label>
                      ) : (
                        item.claimed_hours != null && <span className="font-semibold text-navy">{formatHours(item.claimed_hours)}</span>
                      )}
                      {item.worked_date && <span>{formatDate(item.worked_date)}</span>}
                      <span>{new Date(item.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </div>
                {item.photo_url && (<a href={item.photo_url} target="_blank" rel="noopener noreferrer" className="shrink-0"><div className="w-16 h-16 rounded-lg bg-surface-mid flex items-center justify-center border border-subtle overflow-hidden"><Image className="h-5 w-5 text-muted" /></div></a>)}
                {item.photo_urls && item.photo_urls.length > 0 && (
                  <div className="flex gap-1.5 shrink-0">
                    {item.photo_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded-lg border border-subtle overflow-hidden bg-surface-mid hover:ring-2 hover:ring-starlight-blue transition-all">
                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg class="h-5 w-5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>'; }} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-subtle">
                {isTask ? (<>
                  <button onClick={() => openRouteModal(item)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-starlight-blue text-white rounded-lg hover:bg-starlight-blue/90 transition-colors"><CornerDownRight className="h-3 w-3" /> Route to WO</button>
                  <button onClick={() => handleApproveOverhead(item, "")} title="Logs these hours to the workshop overhead pool (General labour) — not billed to a job" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-starlight-green/10 text-starlight-green rounded-lg hover:bg-starlight-green/20 transition-colors"><Check className="h-3 w-3" /> Approve Overhead</button>
                  <button onClick={() => { setActionItem(item); setActionType("reject"); setActionNote(""); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-mid text-muted rounded-lg hover:bg-surface-hi transition-colors"><X className="h-3 w-3" /> Reject</button>
                </>) : (<>
                  {item.status === "open" && (<button onClick={() => handleRequestAction(item, "acknowledged", "")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-starlight-blue/10 text-starlight-blue rounded-lg hover:bg-starlight-blue/20 transition-colors"><Check className="h-3 w-3" /> Acknowledge</button>)}
                  <button onClick={() => { setActionItem(item); setActionType("resolved"); setActionNote(""); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-starlight-green/10 text-starlight-green rounded-lg hover:bg-starlight-green/20 transition-colors"><Check className="h-3 w-3" /> Resolve</button>
                  <button onClick={() => { setActionItem(item); setActionType("dismissed"); setActionNote(""); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-mid text-muted rounded-lg hover:bg-surface-hi transition-colors"><X className="h-3 w-3" /> Dismiss</button>
                </>)}
              </div>
            </div>
          );
        })}
      </div>

      {routingTask && (
        <RouteTaskModal
          task={{
            item_id: routingTask.item_id,
            title: routingTask.title,
            description: routingTask.description,
            freelancer_id: routingTask.freelancer_id,
            freelancer_name: routingTask.freelancer_name,
            claimed_hours: routingTask.claimed_hours,
            worked_date: routingTask.worked_date,
            job_id: routingTask.job_id,
            work_order_id: routingTask.work_order_id,
          }}
          onClose={() => setRoutingTask(null)}
          onSuccess={() => {
            setRoutingTask(null);
            loadInbox();
          }}
        />
      )}

      {actionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setActionItem(null)} />
          <div className="relative bg-surface rounded-xl shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-navy">{actionType === "reject" ? "Reject Task" : actionType === "resolved" ? "Resolve Request" : "Dismiss Request"}</h3>
            <p className="text-sm text-muted">{actionItem.title}</p>
            <div><label className="text-xs font-medium text-muted mb-1 block">{actionType === "resolved" ? "Resolution note (required)" : "Reason (required)"}</label><textarea value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder={actionType === "resolved" ? "e.g. Ordered, arriving Thursday" : "Reason..."} rows={3} className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/30 resize-none" autoFocus /></div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setActionItem(null)} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg">Cancel</button>
              <button onClick={async () => { setActionSubmitting(true); if (actionItem.item_type === "task") { await handleRejectTask(actionItem, actionNote); } else { await handleRequestAction(actionItem, actionType, actionNote); } setActionItem(null); setActionSubmitting(false); }} disabled={actionSubmitting} className={"px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-40 " + (actionType === "reject" || actionType === "dismissed" ? "bg-surface-bright text-white hover:bg-surface-bright" : "bg-starlight-green text-white hover:bg-starlight-green/90")}>{actionSubmitting ? "..." : actionType === "reject" ? "Reject" : actionType === "resolved" ? "Resolve" : "Dismiss"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
