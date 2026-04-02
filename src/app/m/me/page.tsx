"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { LogOut, User, Clock, ClipboardList, Timer, ArrowRight, Check, RotateCcw, X, AlertTriangle, Package, Wrench, Archive, MessageSquare } from "lucide-react";
import { notify } from "@/lib/notifications";
import { useRealtimeRefresh } from "@/lib/use-realtime";
import { toast } from "sonner";

interface HoursSummary { hours_this_week: number; hours_this_month: number; }
interface RecentEntry { type: "wo" | "task"; id: number; title: string; hours: number | null; date: string; job_number: string | null; status?: string; review_note?: string | null; }
interface MyRequest { request_id: number; category: string; title: string; urgency: string; status: string; resolution_note: string | null; created_at: string; }
interface MyTask { task_id: number; title: string; hours: number | null; status: string; review_note: string | null; started_at: string | null; created_at: string; }
interface ActiveTimer { task_id: number; title: string; started_at: string; }

const REQUEST_ICONS: Record<string, any> = { order_material: Package, repair_equipment: Wrench, restock: Archive, safety: AlertTriangle, general: MessageSquare };
const TASK_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-starlight-amber/10 text-starlight-amber" },
  routed: { label: "Routed to WO", cls: "bg-starlight-blue/10 text-starlight-blue" },
  approved_overhead: { label: "Approved", cls: "bg-starlight-green/10 text-starlight-green" },
  rejected: { label: "Rejected", cls: "bg-starlight-red/10 text-starlight-red" },
  in_progress: { label: "Timer active", cls: "bg-starlight-blue/10 text-starlight-blue" },
};
const REQUEST_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-starlight-amber/10 text-starlight-amber" },
  acknowledged: { label: "Seen", cls: "bg-starlight-blue/10 text-starlight-blue" },
  in_progress: { label: "In Progress", cls: "bg-starlight-blue/10 text-starlight-blue" },
  resolved: { label: "Resolved", cls: "bg-starlight-green/10 text-starlight-green" },
  dismissed: { label: "Dismissed", cls: "bg-surface-mid text-muted" },
};

function localDateStr(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function formatDateShort(d: string): string {
  const today = localDateStr();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  if (d === today) return "Today"; if (d === yesterday) return "Yesterday";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function elapsedSince(iso: string): string { const ms = Date.now() - new Date(iso).getTime(); const mins = Math.floor(ms / 60000); const hrs = Math.floor(mins / 60); const m = mins % 60; if (hrs > 0) return `${hrs}h ${m}m`; return `${m}m`; }

export default function MobileProfilePage() {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [myId, setMyId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hoursSummary, setHoursSummary] = useState<HoursSummary>({ hours_this_week: 0, hours_this_month: 0 });
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [logHours, setLogHours] = useState("");
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [, setTick] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Live updates when tasks/requests change
  useRealtimeRefresh(["tbl_tasks", "tbl_workshop_requests"], () => setRefreshKey((k) => k + 1));

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/m/login"); return; }
      const fId = user.user_metadata?.freelancer_id || 0;
      setMyId(fId); setName(user.user_metadata?.name || "Unknown");
      const [hoursRes, woEntriesRes, tasksRes, requestsRes, activeTaskRes] = await Promise.all([
        supabase.from("qry_freelancer_hours_summary").select("*").eq("freelancer_id", fId).maybeSingle(),
        supabase.from("tbl_wo_time_entries").select("entry_id, work_order_id, actual_hours, system_start_timestamp, actual_start_timestamp").eq("freelancer_id", fId).is("archived_at", null).not("actual_hours", "is", null).order("system_start_timestamp", { ascending: false }).limit(20),
        supabase.from("tbl_tasks").select("task_id, title, hours, status, review_note, started_at, created_at, job_id").eq("freelancer_id", fId).neq("status", "in_progress").order("created_at", { ascending: false }).limit(20),
        supabase.from("tbl_workshop_requests").select("request_id, category, title, urgency, status, resolution_note, created_at").eq("freelancer_id", fId).order("created_at", { ascending: false }).limit(15),
        supabase.from("tbl_tasks").select("task_id, title, started_at").eq("freelancer_id", fId).eq("status", "in_progress").maybeSingle(),
      ]);
      if (hoursRes.data) { setHoursSummary({ hours_this_week: Number(hoursRes.data.hours_this_week) || 0, hours_this_month: Number(hoursRes.data.hours_this_month) || 0 }); }
      const woEntries: RecentEntry[] = [];
      if (woEntriesRes.data && woEntriesRes.data.length > 0) {
        const woIds = [...new Set(woEntriesRes.data.map((e: any) => e.work_order_id))];
        const { data: wos } = await supabase.from("tbl_work_orders").select("work_order_id, description, job_id").in("work_order_id", woIds);
        const woMap: Record<number, { desc: string; jobId: number }> = {};
        (wos || []).forEach((w: any) => { woMap[w.work_order_id] = { desc: w.description || "Work Order", jobId: w.job_id }; });
        const jobIds = [...new Set(Object.values(woMap).map((w) => w.jobId).filter(Boolean))];
        const { data: jobData } = jobIds.length > 0 ? await supabase.from("tbl_production_plan").select("job_id, job_number").in("job_id", jobIds) : { data: [] };
        const jobNumMap: Record<number, string> = {};
        (jobData || []).forEach((j: any) => { jobNumMap[j.job_id] = j.job_number; });
        woEntriesRes.data.forEach((e: any) => {
          const wo = woMap[e.work_order_id];
          woEntries.push({ type: "wo", id: e.entry_id, title: wo?.desc || "WO #" + e.work_order_id, hours: e.actual_hours, date: (e.actual_start_timestamp || e.system_start_timestamp || "").split("T")[0], job_number: wo ? jobNumMap[wo.jobId] || null : null });
        });
      }
      const taskEntries: RecentEntry[] = (tasksRes.data || []).map((t: any) => ({ type: "task" as const, id: t.task_id, title: t.title, hours: t.hours, date: (t.created_at || "").split("T")[0], job_number: null, status: t.status, review_note: t.review_note }));
      const merged = [...woEntries, ...taskEntries].sort((a, b) => b.date.localeCompare(a.date));
      setRecentEntries(merged.slice(0, 15));
      const openReqs = (requestsRes.data || []).filter((r: any) => ["open", "acknowledged", "in_progress"].includes(r.status));
      const closedReqs = (requestsRes.data || []).filter((r: any) => ["resolved", "dismissed"].includes(r.status)).slice(0, 5);
      setMyRequests([...openReqs, ...closedReqs]);
      const pendingTasks = (tasksRes.data || []).filter((t: any) => t.status === "pending");
      const recentReviewed = (tasksRes.data || []).filter((t: any) => ["routed", "approved_overhead", "rejected"].includes(t.status)).slice(0, 5);
      setMyTasks([...pendingTasks, ...recentReviewed]);
      if (activeTaskRes.data) { setActiveTimer(activeTaskRes.data as ActiveTimer); }
      setLoading(false);
    };
    load();
  }, [refreshKey]);

  useEffect(() => { if (!activeTimer) return; const interval = setInterval(() => setTick((t) => t + 1), 30000); return () => clearInterval(interval); }, [activeTimer]);

  const handleLogTimer = async () => {
    if (!activeTimer) return;
    const hrs = parseFloat(logHours);
    if (!hrs || hrs <= 0) { toast.error("Enter hours"); return; }
    setLogSubmitting(true);
    const { error } = await supabase.from("tbl_tasks").update({ hours: hrs, worked_date: activeTimer.started_at.split("T")[0], logged_at: new Date().toISOString(), status: "pending" }).eq("task_id", activeTimer.task_id);
    if (error) { toast.error("Failed to log hours"); setLogSubmitting(false); return; }
    await notify({ supabase, type: "task_submitted", title: `Ad-hoc task: ${activeTimer.title}`, detail: `${hrs}h — timer logged`, severity: "info", freelancerId: myId, actionUrl: "/review/inbox" });
    toast.success("Task logged — pending review"); setActiveTimer(null); setShowLogSheet(false); setLogHours(""); setLogSubmitting(false); window.location.reload();
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/m/login"); };

  if (loading) { return <div className="flex items-center justify-center h-40 text-muted text-sm animate-pulse">Loading...</div>; }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-navy/10 flex items-center justify-center"><User className="h-5 w-5 text-navy" /></div>
          <p className="text-lg font-semibold text-navy">Hi {name.split(" ")[0]}</p>
        </div>
        <button onClick={handleLogout} className="text-muted active:text-starlight-red p-2"><LogOut className="h-5 w-5" /></button>
      </div>

      {activeTimer && (
        <div className="bg-starlight-blue/10 border border-starlight-blue/30 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-starlight-blue animate-pulse" />
              <div><p className="text-sm font-semibold text-navy">{activeTimer.title}</p><p className="text-xs text-starlight-blue">{elapsedSince(activeTimer.started_at)} elapsed</p></div>
            </div>
            <button onClick={() => { const ms = Date.now() - new Date(activeTimer.started_at).getTime(); const hrs = Math.round((ms / 3600000) * 2) / 2; setLogHours(String(Math.max(0.5, hrs))); setShowLogSheet(true); }} className="px-4 py-2 bg-starlight-blue text-white text-xs font-semibold rounded-lg active:bg-starlight-blue/90">Log Hours</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl border border-subtle p-4 text-center"><p className="text-2xl font-bold text-navy">{Number(hoursSummary.hours_this_week).toFixed(1)}</p><p className="text-[10px] text-muted font-medium uppercase tracking-wider mt-0.5">This Week</p></div>
        <div className="bg-surface rounded-xl border border-subtle p-4 text-center"><p className="text-2xl font-bold text-navy">{Number(hoursSummary.hours_this_month).toFixed(1)}</p><p className="text-[10px] text-muted font-medium uppercase tracking-wider mt-0.5">This Month</p></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => router.push("/m/task")} className="flex items-center justify-center gap-2 py-3 bg-surface border border-subtle rounded-xl text-sm font-medium text-navy active:bg-surface-dim"><Clock className="h-4 w-4" />Log Task</button>
        <button onClick={() => router.push("/m/request")} className="flex items-center justify-center gap-2 py-3 bg-surface border border-subtle rounded-xl text-sm font-medium text-navy active:bg-surface-dim"><ClipboardList className="h-4 w-4" />Raise Request</button>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-navy mb-2">Recent Entries</h2>
        {recentEntries.length === 0 ? (<p className="text-xs text-muted bg-surface rounded-xl border border-subtle p-4 text-center">No entries yet</p>) : (
          <div className="bg-surface rounded-xl border border-subtle divide-y divide-subtle">
            {recentEntries.map((entry) => (
              <div key={`${entry.type}-${entry.id}`} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><p className="text-sm text-navy truncate">{entry.title}</p>{entry.type === "task" && (<span className="text-[9px] px-1.5 py-0.5 rounded bg-navy/5 text-navy/60 font-medium shrink-0">Ad-hoc</span>)}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted">
                    <span>{formatDateShort(entry.date)}</span>{entry.job_number && <span className="font-mono">{entry.job_number}</span>}
                    {entry.type === "task" && entry.status && (<span className={"px-1.5 py-0.5 rounded-full text-[9px] font-medium " + (TASK_STATUS_BADGE[entry.status]?.cls || "")}>{TASK_STATUS_BADGE[entry.status]?.label}</span>)}
                  </div>
                </div>
                <span className="text-sm font-semibold text-navy tabular-nums shrink-0 ml-3">{entry.hours != null ? `${Number(entry.hours).toFixed(1)}h` : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {myRequests.length > 0 && (<div>
        <h2 className="text-sm font-semibold text-navy mb-2">My Requests</h2>
        <div className="bg-surface rounded-xl border border-subtle divide-y divide-subtle">
          {myRequests.map((req) => { const Icon = REQUEST_ICONS[req.category] || MessageSquare; const badge = REQUEST_STATUS_BADGE[req.status]; return (
            <div key={req.request_id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0"><Icon className="h-3.5 w-3.5 text-muted shrink-0" /><p className="text-sm text-navy truncate">{req.title}</p>{req.urgency === "urgent" && (<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-starlight-red/10 text-starlight-red font-medium shrink-0">Urgent</span>)}</div>
                {badge && (<span className={"text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ml-2 " + badge.cls}>{badge.label}</span>)}
              </div>
              {req.resolution_note && (<p className="text-[10px] text-muted mt-1 ml-5 italic">{req.resolution_note}</p>)}
            </div>); })}
        </div>
      </div>)}

      {myTasks.length > 0 && (<div>
        <h2 className="text-sm font-semibold text-navy mb-2">My Tasks</h2>
        <div className="bg-surface rounded-xl border border-subtle divide-y divide-subtle">
          {myTasks.map((task) => { const badge = TASK_STATUS_BADGE[task.status]; return (
            <div key={task.task_id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1"><p className="text-sm text-navy truncate">{task.title}</p></div>
                <div className="flex items-center gap-2 shrink-0 ml-2">{task.hours != null && (<span className="text-xs text-muted tabular-nums">{Number(task.hours).toFixed(1)}h</span>)}{badge && (<span className={"text-[10px] px-2 py-0.5 rounded-full font-medium " + badge.cls}>{badge.label}</span>)}</div>
              </div>
              {task.review_note && (<p className="text-[10px] text-muted mt-1 italic">{task.review_note}</p>)}
            </div>); })}
        </div>
      </div>)}

      {showLogSheet && activeTimer && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowLogSheet(false)} />
          <div className="relative w-full bg-surface rounded-t-2xl p-6 space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between"><h3 className="text-base font-semibold text-navy">Log Timer: {activeTimer.title}</h3><button onClick={() => setShowLogSheet(false)} className="text-muted"><X className="h-5 w-5" /></button></div>
            <p className="text-xs text-muted">Started {new Date(activeTimer.started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} — {elapsedSince(activeTimer.started_at)} ago</p>
            <div><label className="text-xs font-medium text-muted mb-1.5 block">Hours</label><input type="number" value={logHours} onChange={(e) => setLogHours(e.target.value)} step="0.5" className="w-full px-4 py-3 bg-surface-dim border border-subtle rounded-xl text-lg text-center font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-starlight-blue/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" autoFocus /></div>
            <button onClick={handleLogTimer} disabled={logSubmitting} className="w-full py-3.5 bg-navy text-white text-sm font-semibold rounded-xl active:bg-navy/90 disabled:opacity-40">{logSubmitting ? "Logging..." : "Log & Submit for Review"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
