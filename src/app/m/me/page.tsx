"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatHours } from "@/lib/format-hours";
import { LogOut, User, Clock, ClipboardList, Timer, ArrowRight, Check, RotateCcw, X, AlertTriangle, Package, Wrench, Archive, MessageSquare, Save, Minus, Plus, Camera, ChevronDown, ChevronRight } from "lucide-react";
import { notify } from "@/lib/notifications";
import { LogSheet, type LogSheetData, type WoOption } from "@/components/log-sheet";
import { EditTimeEntrySheet, type EditableEntry } from "@/components/edit-time-entry-sheet";
import { EditTaskSheet, type EditableTask } from "@/components/edit-task-sheet";
import { useRealtimeRefresh } from "@/lib/use-realtime";
import { toast } from "sonner";
import { auditedUpdate, auditedInsert, getAuditContext } from "@/lib/audit";
import { TimesheetFlagsPanel } from "@/components/timesheet-flags";

interface HoursSummary { hours_this_week: number; hours_this_month: number; }
interface RecentEntry { type: "wo" | "task"; id: number; title: string; hours: number | null; date: string; job_number: string | null; status?: string; review_note?: string | null; flag_note?: string | null; work_order_id?: number; }
interface MyRequest { request_id: number; category: string; title: string; urgency: string; status: string; resolution_note: string | null; created_at: string; }
interface MyTask { task_id: number; title: string; hours: number | null; status: string; review_note: string | null; started_at: string | null; created_at: string; }
interface ActiveTimer { task_id: number; title: string; started_at: string; }

// 10-day overview: one row per calendar day, expandable to show entries.
// Day-total < 9h with entries → red flag; missing day with zero entries stays
// neutral (could be a weekend, day off, etc.).
interface DayEntry {
  kind: "wo" | "task";
  id: number;
  hours: number;
  description: string;       // WO description or task title
  job_number: string | null;
  scope_name?: string;
  flag_note: string | null;
  work_order_id?: number;    // present for WO entries (needed for edit)
  status?: string;           // task status; for badging
}
interface DayView {
  date: string;              // YYYY-MM-DD
  totalHours: number;
  entries: DayEntry[];
}

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

// What counts as a "full day" of logged hours. Below this with at least one
// entry → row turns red, prompting the freelancer to check what's missing.
// Pulled from Mateusz's stated workshop norm.
const FULL_DAY_THRESHOLD = 9;
const TEN_DAY_WINDOW = 10;

// Day-of-week label for the day-row header (no special-cased today/yesterday).
function weekdayShort(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" });
}
// Build the last N calendar days as YYYY-MM-DD strings, newest first.
function lastNDates(n: number): string[] {
  const out: string[] = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base); d.setDate(base.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

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
  const [defaultLogHours, setDefaultLogHours] = useState(0);
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [woOptions, setWoOptions] = useState<WoOption[]>([]);
  const [, setTick] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingNote, setEditingNote] = useState<{ entryId: number; note: string } | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  // Last-10-days view state. expandedDay = which date row is currently open.
  // backfillTarget = which date/entry the LogSheet is editing or adding for.
  const [tenDayView, setTenDayView] = useState<DayView[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [backfillTarget, setBackfillTarget] = useState<
    | { mode: "add"; date: string }
    | { mode: "edit"; date: string; entry: DayEntry }
    | null
  >(null);
  const [backfillSubmitting, setBackfillSubmitting] = useState(false);

  // Edit-request state. editTarget = the entry whose hours/WO the freelancer
  // wants to change. editsByEntry maps an entry_id → its pending or
  // most-recent-rejected edit so the UI can show the appropriate badge.
  const [editTarget, setEditTarget] = useState<EditableEntry | null>(null);
  const [editsByEntry, setEditsByEntry] = useState<Record<number, { pending?: any; lastRejected?: any }>>({});
  // Ad-hoc task edits use a separate sheet (different lifecycle than WO entries).
  const [editTaskTarget, setEditTaskTarget] = useState<EditableTask | null>(null);

  // Live updates when tasks/requests change
  useRealtimeRefresh(["tbl_tasks", "tbl_workshop_requests"], () => setRefreshKey((k) => k + 1));

  const saveEntryNote = async (entryId: number, note: string) => {
    setSavingNote(true);
    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_wo_time_entries", entryId, { flag_note: note.trim() || null });
    setEditingNote(null); setSavingNote(false);
    setRecentEntries((prev) => prev.map((e) => e.type === "wo" && e.id === entryId ? { ...e, flag_note: note.trim() || null } : e));
    toast.success("Note saved");
  };

  // Backfill a time entry for a past day. Always pending PM approval — the
  // [Backfill] flag prefix surfaces it in /review/timesheets. Timestamps
  // are synthetic (start at 09:00 local on the chosen date) since the
  // freelancer didn't run a timer; PM can see and adjust if needed.
  const handleBackfillSubmit = async (data: LogSheetData) => {
    if (!backfillTarget || backfillTarget.mode !== "add") return;
    if (data.hours <= 0) { toast.error("Enter hours"); return; }
    const targetDate = backfillTarget.date;

    setBackfillSubmitting(true);
    try {
      const ctx = await getAuditContext(supabase);

      // Path A: freelancer picked a WO. Goes straight to the WO time entries
      // table with the [Backfill] flag so the PM sees it in /review/timesheets.
      if (data.routedWoId) {
        // Hourly rate snapshot (matches existing pattern in handleLogTimer).
        const { data: me } = await supabase.from("tbl_freelancers")
          .select("day_rate, standard_day_hours").eq("freelancer_id", myId).maybeSingle();
        const rate = me?.day_rate && me?.standard_day_hours && me.standard_day_hours > 0
          ? Number(me.day_rate) / Number(me.standard_day_hours) : 0;

        // Synthetic timestamps in local time. The no-Z format avoids the
        // BST-shift trap (per memory's timestamp rule).
        const startIso = `${targetDate}T09:00:00`;
        const endMs = new Date(startIso).getTime() + data.hours * 3600 * 1000;
        const endDate = new Date(endMs);
        const pad = (n: number) => String(n).padStart(2, "0");
        const endIso = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;

        const flagNote = `[Backfill] ${data.notes || "Missing entry added by freelancer"}`;
        const wo = woOptions.find((w) => w.work_order_id === data.routedWoId);

        const result = await auditedInsert(ctx, "tbl_wo_time_entries", {
          work_order_id: data.routedWoId,
          freelancer_id: myId,
          system_start_timestamp: startIso,
          actual_start_timestamp: startIso,
          system_end_timestamp: endIso,
          actual_end_timestamp: endIso,
          actual_hours: data.hours,
          applied_hourly_rate: rate,
          entry_cost: Math.round(data.hours * rate * 100) / 100,
          flag_note: flagNote,
        });
        if (result.error) { toast.error("Failed to add: " + result.error.message); setBackfillSubmitting(false); return; }

        await notify({
          supabase,
          type: "wo_flagged",
          severity: "warning",
          title: `Backfill: ${formatHours(data.hours)} on ${formatDateShort(targetDate)}`,
          detail: wo ? `${wo.job_number} · ${wo.description || wo.scope_name}` : "",
          freelancerId: myId,
          actionUrl: "/review/timesheets",
        });
        toast.success("Added — pending review");
      } else {
        // Path B: no WO chosen. Files as an ad-hoc task so the PM can decide
        // whether it routes to a WO, counts as overhead, or gets rejected.
        // The freelancer's notes become the task title â€” required, since a
        // PM looking at an empty-titled task is useless. matches /m/task UX.
        if (!data.notes || !data.notes.trim()) {
          toast.error("Add a short description so the PM knows what it was for");
          setBackfillSubmitting(false);
          return;
        }
        const result = await auditedInsert(ctx, "tbl_tasks", {
          freelancer_id: myId,
          title: data.notes.trim(),
          hours: data.hours,
          worked_date: targetDate,
          status: "pending",
          logged_at: new Date().toISOString(),
        });
        if (result.error) { toast.error("Failed to add: " + result.error.message); setBackfillSubmitting(false); return; }

        await notify({
          supabase,
          type: "task_submitted",
          severity: "info",
          title: `Ad-hoc backfill: ${data.notes.trim()}`,
          detail: `${formatHours(data.hours)} on ${formatDateShort(targetDate)}`,
          freelancerId: myId,
          actionUrl: "/review/inbox",
        });
        toast.success("Logged — PM will review");
      }

      setBackfillTarget(null);
      setBackfillSubmitting(false);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error("Failed: " + (err.message || "unknown"));
      setBackfillSubmitting(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/m/login"); return; }
      const fId = user.user_metadata?.freelancer_id || 0;
      setMyId(fId); setName(user.user_metadata?.name || "Unknown");

      // Date floor for the 10-day overview. Querying via gte on the
      // timestamp column needs a YYYY-MM-DD string; Postgres will compare
      // lexicographically against the start of the column's day.
      const tenAgoBase = new Date(); tenAgoBase.setDate(tenAgoBase.getDate() - (TEN_DAY_WINDOW - 1));
      const tenDaysAgoStr = `${tenAgoBase.getFullYear()}-${String(tenAgoBase.getMonth() + 1).padStart(2, "0")}-${String(tenAgoBase.getDate()).padStart(2, "0")}`;

      const [hoursRes, woEntriesRes, tasksRes, requestsRes, activeTaskRes, tenDayWoRes, tenDayTasksRes, editsRes] = await Promise.all([
        supabase.from("qry_freelancer_hours_summary").select("*").eq("freelancer_id", fId).maybeSingle(),
        supabase.from("tbl_wo_time_entries").select("entry_id, work_order_id, actual_hours, system_start_timestamp, actual_start_timestamp, flag_note").eq("freelancer_id", fId).is("archived_at", null).not("actual_hours", "is", null).order("system_start_timestamp", { ascending: false }).limit(20),
        supabase.from("tbl_tasks").select("task_id, title, hours, status, review_note, started_at, created_at, job_id").eq("freelancer_id", fId).neq("status", "in_progress").order("created_at", { ascending: false }).limit(20),
        supabase.from("tbl_workshop_requests").select("request_id, category, title, urgency, status, resolution_note, created_at").eq("freelancer_id", fId).order("created_at", { ascending: false }).limit(15),
        supabase.from("tbl_tasks").select("task_id, title, started_at").eq("freelancer_id", fId).eq("status", "in_progress").maybeSingle(),
        // 10-day window: WO time entries the freelancer has logged. Skipped
        // if archived or still open (no actual_hours).
        supabase.from("tbl_wo_time_entries").select("entry_id, work_order_id, actual_hours, system_start_timestamp, actual_start_timestamp, flag_note").eq("freelancer_id", fId).is("archived_at", null).not("actual_hours", "is", null).gte("actual_start_timestamp", tenDaysAgoStr),
        // 10-day window: ad-hoc tasks. Routed tasks are excluded because
        // each routing creates a parallel tbl_wo_time_entries row that
        // would double-count toward the day's total.
        supabase.from("tbl_tasks").select("task_id, title, hours, status, worked_date").eq("freelancer_id", fId).in("status", ["pending", "approved_overhead"]).not("hours", "is", null).gte("worked_date", tenDaysAgoStr),
        // Pending and most-recent-rejected edits for this freelancer. Used
        // to badge entries in the UI. Approved/withdrawn ones not needed
        // here (approved → entry already reflects change; withdrawn → user
        // cancelled, no signal to show).
        supabase.from("tbl_wo_time_entry_edits").select("edit_id, entry_id, status, proposed_actual_hours, proposed_work_order_id, reason, review_note, created_at, reviewed_at").eq("freelancer_id", fId).in("status", ["pending", "rejected"]).order("created_at", { ascending: false }),
      ]);
      if (hoursRes.data) { setHoursSummary({ hours_this_week: Number(hoursRes.data.hours_this_week) || 0, hours_this_month: Number(hoursRes.data.hours_this_month) || 0 }); }

      // Build a single WO/job lookup spanning BOTH datasets (recent entries
      // and 10-day window) so we don't double-fetch and so the 10-day view
      // gets WO descriptions for entries outside the recent-20.
      const allWoIds = [
        ...new Set([
          ...(woEntriesRes.data || []).map((e: any) => e.work_order_id),
          ...(tenDayWoRes.data || []).map((e: any) => e.work_order_id),
        ]),
      ].filter(Boolean);
      const woMap: Record<number, { desc: string; jobId: number }> = {};
      const jobNumMap: Record<number, string> = {};
      if (allWoIds.length > 0) {
        const { data: wos } = await supabase.from("tbl_work_orders").select("work_order_id, description, job_id").in("work_order_id", allWoIds);
        (wos || []).forEach((w: any) => { woMap[w.work_order_id] = { desc: w.description || "Work Order", jobId: w.job_id }; });
        const jobIds = [...new Set(Object.values(woMap).map((w) => w.jobId).filter(Boolean))];
        if (jobIds.length > 0) {
          const { data: jobData } = await supabase.from("tbl_production_plan").select("job_id, job_number").in("job_id", jobIds);
          (jobData || []).forEach((j: any) => { jobNumMap[j.job_id] = j.job_number; });
        }
      }

      // Recent entries list (unchanged behaviour — last 20 WO entries +
      // last 20 tasks, merged and trimmed to 15).
      const woEntries: RecentEntry[] = (woEntriesRes.data || []).map((e: any) => {
        const wo = woMap[e.work_order_id];
        return { type: "wo" as const, id: e.entry_id, title: wo?.desc || "WO #" + e.work_order_id, hours: e.actual_hours, date: (e.actual_start_timestamp || e.system_start_timestamp || "").split("T")[0], job_number: wo ? jobNumMap[wo.jobId] || null : null, flag_note: e.flag_note || null, work_order_id: e.work_order_id };
      });
      const taskEntries: RecentEntry[] = (tasksRes.data || []).map((t: any) => ({ type: "task" as const, id: t.task_id, title: t.title, hours: t.hours, date: (t.created_at || "").split("T")[0], job_number: null, status: t.status, review_note: t.review_note }));
      const merged = [...woEntries, ...taskEntries].sort((a, b) => b.date.localeCompare(a.date));
      setRecentEntries(merged.slice(0, 15));

      // Group last-10-days entries by date. Pre-seed each of the 10 dates so
      // empty days still render as a row (freelancer can tap to add).
      const dayMap: Record<string, DayEntry[]> = {};
      lastNDates(TEN_DAY_WINDOW).forEach((d) => { dayMap[d] = []; });
      (tenDayWoRes.data || []).forEach((e: any) => {
        const date = (e.actual_start_timestamp || e.system_start_timestamp || "").split("T")[0];
        if (!dayMap[date]) return;
        const wo = woMap[e.work_order_id];
        dayMap[date].push({
          kind: "wo",
          id: e.entry_id,
          hours: Number(e.actual_hours) || 0,
          description: wo?.desc || "WO #" + e.work_order_id,
          job_number: wo ? jobNumMap[wo.jobId] || null : null,
          flag_note: e.flag_note || null,
          work_order_id: e.work_order_id,
        });
      });
      (tenDayTasksRes.data || []).forEach((t: any) => {
        const date = t.worked_date;  // schema stores YYYY-MM-DD directly
        if (!date || !dayMap[date]) return;
        dayMap[date].push({
          kind: "task",
          id: t.task_id,
          hours: Number(t.hours) || 0,
          description: t.title,
          job_number: null,
          flag_note: null,
          status: t.status,
        });
      });
      setTenDayView(
        lastNDates(TEN_DAY_WINDOW).map((date) => ({
          date,
          totalHours: dayMap[date].reduce((s, e) => s + e.hours, 0),
          entries: dayMap[date].sort((a, b) => b.hours - a.hours),
        }))
      );

      // editsByEntry: pending winner first; lastRejected is the most-recent
      // rejected (only set if there's no pending). Ordering relies on the
      // .order("created_at", desc) on the editsRes query above.
      const eMap: Record<number, { pending?: any; lastRejected?: any }> = {};
      (editsRes.data || []).forEach((e: any) => {
        if (!eMap[e.entry_id]) eMap[e.entry_id] = {};
        if (e.status === "pending" && !eMap[e.entry_id].pending) {
          eMap[e.entry_id].pending = e;
        } else if (e.status === "rejected" && !eMap[e.entry_id].pending && !eMap[e.entry_id].lastRejected) {
          eMap[e.entry_id].lastRejected = e;
        }
      });
      setEditsByEntry(eMap);
      const openReqs = (requestsRes.data || []).filter((r: any) => ["open", "acknowledged", "in_progress"].includes(r.status));
      const closedReqs = (requestsRes.data || []).filter((r: any) => ["resolved", "dismissed"].includes(r.status)).slice(0, 5);
      setMyRequests([...openReqs, ...closedReqs]);
      const pendingTasks = (tasksRes.data || []).filter((t: any) => t.status === "pending");
      const recentReviewed = (tasksRes.data || []).filter((t: any) => ["routed", "approved_overhead", "rejected"].includes(t.status)).slice(0, 5);
      setMyTasks([...pendingTasks, ...recentReviewed]);
      if (activeTaskRes.data) { setActiveTimer(activeTaskRes.data as ActiveTimer); }

      // Load active WOs for the optional "route to WO" picker in the LogSheet.
      // We show WOs the freelancer might plausibly want to route to: anything
      // Ready / In-Progress / Not-Started on an active job. If this grows too
      // large we can tighten to "WOs where this freelancer has logged time
      // recently" — for now a simple list keeps the freelancer's mental model
      // the same as /m/task's picker.
      const { data: wos } = await supabase
        .from("tbl_work_orders")
        .select("work_order_id, description, scope_item_id, job_id, status")
        .in("status", ["Ready", "In-Progress", "Not-Started"]);
      if (wos && wos.length > 0) {
        const scopeIds = [...new Set(wos.map((w: any) => w.scope_item_id).filter(Boolean))];
        const jobIds2 = [...new Set(wos.map((w: any) => w.job_id).filter(Boolean))];
        const [scopeRes, jobRes] = await Promise.all([
          scopeIds.length > 0 ? supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds) : { data: [] },
          jobIds2.length > 0 ? supabase.from("tbl_production_plan").select("job_id, job_number, job_status").in("job_id", jobIds2) : { data: [] },
        ]);
        const sMap: Record<number, string> = {};
        ((scopeRes as any).data || []).forEach((s: any) => { sMap[s.scope_item_id] = s.item_name; });
        const jMap: Record<number, { num: string; status: string }> = {};
        ((jobRes as any).data || []).forEach((j: any) => { jMap[j.job_id] = { num: j.job_number, status: j.job_status }; });
        // Only show WOs on Active jobs.
        setWoOptions(
          wos
            .filter((w: any) => jMap[w.job_id]?.status === "Active")
            .map((w: any) => ({
              work_order_id: w.work_order_id,
              description: w.description,
              scope_name: sMap[w.scope_item_id] || "—",
              job_number: jMap[w.job_id]?.num || "—",
              status: w.status,
            }))
        );
      }

      setLoading(false);
    };
    load();
  }, [refreshKey]);

  useEffect(() => { if (!activeTimer) return; const interval = setInterval(() => setTick((t) => t + 1), 30000); return () => clearInterval(interval); }, [activeTimer]);

  const handleLogTimer = async (data: LogSheetData) => {
    if (!activeTimer) return;
    const hrs = data.hours;
    if (!hrs || hrs <= 0) { toast.error("Enter hours"); return; }
    setLogSubmitting(true);

    // Upload photos to OneDrive
    let photoUrls: string[] = [];
    if (data.photos.length > 0) {
      try {
        const { uploadToOneDrive } = await import("@/lib/onedrive-client");
        for (const p of data.photos) {
          const ts = new Date().toISOString().split("T")[0];
          const safeName = activeTimer.title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
          const result = await uploadToOneDrive(p.file, "Workshop/Ad-hoc Tasks", `${ts}_${safeName}_${photoUrls.length + 1}.jpg`);
          if (result?.webUrl) photoUrls.push(result.webUrl);
        }
      } catch (err) { console.warn("Photo upload failed:", err); toast.error("Photo upload failed — logging without photos"); }
    }

    // Branch: routed to a WO vs filed as ad-hoc (original behaviour).
    if (data.routedWoId) {
      // Self-routed: create a real tbl_wo_time_entries row using the timer's
      // actual start and "now" as end. Task itself is marked routed so it
      // drops out of the PM review inbox. PM still sees the time entry in
      // the daily timesheet and can archive/edit if wrong.
      const ctx = await getAuditContext(supabase);
      const startIso = activeTimer.started_at;
      const endIso = new Date().toISOString();
      const wo = woOptions.find(w => w.work_order_id === data.routedWoId);
      // Hourly rate snapshot for this entry.
      const { data: me } = await supabase.from("tbl_freelancers")
        .select("day_rate, standard_day_hours").eq("freelancer_id", myId).maybeSingle();
      const rate = me?.day_rate && me?.standard_day_hours && me.standard_day_hours > 0
        ? Number(me.day_rate) / Number(me.standard_day_hours) : 0;
      const flag = data.notes
        ? `Self-routed from timer: ${data.notes}`
        : "Self-routed from timer";
      const { error: teErr } = await supabase.from("tbl_wo_time_entries").insert({
        work_order_id: data.routedWoId,
        freelancer_id: myId,
        system_start_timestamp: startIso,
        actual_start_timestamp: startIso,
        system_end_timestamp: endIso,
        actual_end_timestamp: endIso,
        actual_hours: hrs,
        applied_hourly_rate: rate,
        entry_cost: Math.round(hrs * rate * 100) / 100,
        flag_note: flag,
      });
      if (teErr) { toast.error("Failed to route: " + teErr.message); setLogSubmitting(false); return; }

      // Mark the task routed so the review inbox doesn't surface it.
      const taskUpdate: any = {
        hours: hrs,
        worked_date: activeTimer.started_at.split("T")[0],
        logged_at: new Date().toISOString(),
        status: "routed",
        routed_to_wo_id: data.routedWoId,
        routed_hours: hrs,
        description: data.notes || null,
        review_note: "Self-routed at log time",
      };
      if (photoUrls.length > 0) taskUpdate.photo_urls = JSON.stringify(photoUrls);
      await supabase.from("tbl_tasks").update(taskUpdate).eq("task_id", activeTimer.task_id);

      await notify({
        supabase, type: "task_submitted",
        title: `${formatHours(hrs)} routed to ${wo?.scope_name || "WO"}`,
        detail: wo ? `${wo.job_number} · ${wo.description || ""}` : "",
        severity: "info", freelancerId: myId,
        jobId: undefined, actionUrl: "/review/timesheets",
      });
      toast.success("Logged to WO");
      setActiveTimer(null); setShowLogSheet(false); setLogSubmitting(false);
      window.location.reload();
      return;
    }

    // Default: file as a pending ad-hoc task for PM review.
    const updateData: any = { hours: hrs, worked_date: activeTimer.started_at.split("T")[0], logged_at: new Date().toISOString(), status: "pending", description: data.notes || null };
    if (photoUrls.length > 0) { updateData.photo_urls = JSON.stringify(photoUrls); }
    const { error } = await supabase.from("tbl_tasks").update(updateData).eq("task_id", activeTimer.task_id);
    if (error) { toast.error("Failed to log hours"); setLogSubmitting(false); return; }
    await notify({ supabase, type: "task_submitted", title: `Ad-hoc task: ${activeTimer.title}`, detail: `${formatHours(hrs)} — timer logged${photoUrls.length > 0 ? ` (${photoUrls.length} photo${photoUrls.length > 1 ? "s" : ""})` : ""}`, severity: "info", freelancerId: myId, actionUrl: "/review/inbox" });
    toast.success("Task logged — pending review"); setActiveTimer(null); setShowLogSheet(false); setLogSubmitting(false); window.location.reload();
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

      {/* Missing hours — open timesheet flags for this freelancer */}
      <TimesheetFlagsPanel myId={myId} onResolved={() => setRefreshKey((k) => k + 1)} />

      {activeTimer && (
        <div className="bg-starlight-blue/10 border border-starlight-blue/30 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-starlight-blue animate-pulse" />
              <div><p className="text-sm font-semibold text-navy">{activeTimer.title}</p><p className="text-xs text-starlight-blue">{elapsedSince(activeTimer.started_at)} elapsed</p></div>
            </div>
            <button onClick={() => { const ms = Date.now() - new Date(activeTimer.started_at).getTime(); const hrs = Math.ceil((ms / 3600000) * 4) / 4; setDefaultLogHours(Math.max(0.25, hrs)); setShowLogSheet(true); }} className="px-4 py-2 bg-starlight-blue text-white text-xs font-semibold rounded-lg active:bg-starlight-blue/90">Log Hours</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl border border-subtle p-4 text-center"><p className="text-2xl font-bold text-navy">{formatHours(hoursSummary.hours_this_week)}</p><p className="text-[10px] text-muted font-medium uppercase tracking-wider mt-0.5">This Week</p></div>
        <div className="bg-surface rounded-xl border border-subtle p-4 text-center"><p className="text-2xl font-bold text-navy">{formatHours(hoursSummary.hours_this_month)}</p><p className="text-[10px] text-muted font-medium uppercase tracking-wider mt-0.5">This Month</p></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => router.push("/m/task")} className="flex items-center justify-center gap-2 py-3 bg-surface border border-subtle rounded-xl text-sm font-medium text-navy active:bg-surface-dim"><Clock className="h-4 w-4" />Log Task</button>
        <button onClick={() => router.push("/m/request")} className="flex items-center justify-center gap-2 py-3 bg-surface border border-subtle rounded-xl text-sm font-medium text-navy active:bg-surface-dim"><ClipboardList className="h-4 w-4" />Raise Request</button>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-navy mb-2">Last 10 Days</h2>
        <div className="bg-surface rounded-xl border border-subtle divide-y divide-subtle overflow-hidden">
          {tenDayView.map((day) => {
            const isOpen = expandedDay === day.date;
            const hasEntries = day.entries.length > 0;
            // Red flag: had entries but day didn't reach a full day. No
            // flag on zero-entry days (might be weekend, day off, etc.).
            const isShort = hasEntries && day.totalHours < FULL_DAY_THRESHOLD;
            return (
              <div key={day.date}>
                <button
                  onClick={() => setExpandedDay(isOpen ? null : day.date)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-surface-dim"
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-navy">{formatDateShort(day.date)}</p>
                    <p className="text-[10px] text-muted">{weekdayShort(day.date)} · {day.date}</p>
                  </div>
                  <span
                    className={
                      "text-sm font-semibold tabular-nums shrink-0 " +
                      (isShort ? "text-starlight-red" : hasEntries ? "text-navy" : "text-faint")
                    }
                  >
                    {hasEntries ? formatHours(day.totalHours) : "—"}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 py-3 bg-surface-dim/50 space-y-2">
                    {day.entries.length === 0 ? (
                      <p className="text-xs text-muted text-center py-1">No entries</p>
                    ) : (
                      day.entries.map((e) => {
                        const editState = e.kind === "wo" ? editsByEntry[e.id] : undefined;
                        const hasPending = !!editState?.pending;
                        const hasRejected = !!editState?.lastRejected;
                        // Both kinds are now tappable. WO entries open the
                        // pending-edit flow; tasks open the direct-edit flow
                        // (which still pushes back to pending if PM had
                        // already approved). Routed/rejected tasks aren't
                        // in this list (filtered out at fetch).
                        const isClickable = e.kind === "wo" || e.kind === "task";
                        // Optimistic preview: when pending, show the proposed
                        // hours next to the original so the freelancer sees
                        // what they asked for.
                        const proposedHours = editState?.pending?.proposed_actual_hours;
                        return (
                          <div key={`${e.kind}-${e.id}`}>
                            <button
                              type="button"
                              disabled={!isClickable}
                              onClick={() => {
                                if (e.kind === "wo") {
                                  if (!e.work_order_id) return;
                                  setEditTarget({
                                    entry_id: e.id,
                                    freelancer_id: myId,
                                    actual_hours: e.hours,
                                    work_order_id: e.work_order_id,
                                    description: e.description,
                                    date: day.date,
                                  });
                                } else if (e.kind === "task") {
                                  setEditTaskTarget({
                                    task_id: e.id,
                                    freelancer_id: myId,
                                    title: e.description,
                                    description: null,
                                    hours: e.hours,
                                    status: e.status || "pending",
                                    worked_date: day.date,
                                  });
                                }
                              }}
                              className={"w-full flex items-center justify-between gap-2 py-1.5 px-2 -mx-2 rounded text-left " + (isClickable ? "active:bg-surface-mid" : "")}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-xs text-navy truncate">{e.description}</p>
                                  {e.kind === "task" && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-navy/5 text-navy/60 font-medium shrink-0">Ad-hoc</span>
                                  )}
                                  {e.flag_note?.startsWith("[Backfill]") && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-starlight-amber/10 text-starlight-amber font-medium shrink-0">Backfill</span>
                                  )}
                                  {hasPending && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-starlight-blue/10 text-starlight-blue font-medium shrink-0">Edit pending</span>
                                  )}
                                  {hasRejected && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-starlight-red/10 text-starlight-red font-medium shrink-0">Edit rejected</span>
                                  )}
                                </div>
                                {e.job_number && <p className="text-[10px] text-muted font-mono">{e.job_number}</p>}
                                {hasPending && proposedHours != null && (
                                  <p className="text-[10px] text-starlight-blue mt-0.5">
                                    Proposed: {formatHours(proposedHours)}
                                  </p>
                                )}
                                {hasRejected && editState?.lastRejected?.review_note && (
                                  <p className="text-[10px] text-starlight-red mt-0.5 italic">
                                    PM: {editState.lastRejected.review_note}
                                  </p>
                                )}
                              </div>
                              <span className="text-xs font-semibold text-navy tabular-nums shrink-0">{formatHours(e.hours)}</span>
                            </button>
                          </div>
                        );
                      })
                    )}
                    <button
                      onClick={() => setBackfillTarget({ mode: "add", date: day.date })}
                      className="w-full mt-2 py-2 bg-surface border border-subtle rounded-lg text-xs font-medium text-navy active:bg-surface-dim flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add entry for {formatDateShort(day.date)}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-navy mb-2">Recent Entries</h2>
        {recentEntries.length === 0 ? (<p className="text-xs text-muted bg-surface rounded-xl border border-subtle p-4 text-center">No entries yet</p>) : (
          <div className="bg-surface rounded-xl border border-subtle divide-y divide-subtle">
            {recentEntries.map((entry) => {
              const editState = entry.type === "wo" ? editsByEntry[entry.id] : undefined;
              const hasPending = !!editState?.pending;
              const hasRejected = !!editState?.lastRejected;
              const proposedHours = editState?.pending?.proposed_actual_hours;
              // Editable: WO entries with a work_order_id, OR ad-hoc tasks
              // in editable statuses. EditTaskSheet handles the gating for
              // routed/rejected internally with a friendly message.
              const taskEditable = entry.type === "task" && (entry.status === "pending" || entry.status === "approved_overhead");
              const isEditable = (entry.type === "wo" && !!entry.work_order_id) || taskEditable;
              return (
                <div key={`${entry.type}-${entry.id}`} className="px-4 py-3">
                  <button
                    type="button"
                    disabled={!isEditable}
                    onClick={() => {
                      if (entry.type === "wo") {
                        if (!entry.work_order_id || entry.hours == null) return;
                        setEditTarget({
                          entry_id: entry.id,
                          freelancer_id: myId,
                          actual_hours: entry.hours,
                          work_order_id: entry.work_order_id,
                          description: entry.title,
                          date: entry.date,
                        });
                      } else if (entry.type === "task") {
                        if (entry.hours == null) return;
                        setEditTaskTarget({
                          task_id: entry.id,
                          freelancer_id: myId,
                          title: entry.title,
                          description: null,
                          hours: entry.hours,
                          status: entry.status || "pending",
                          worked_date: entry.date,
                        });
                      }
                    }}
                    className={"w-full flex items-center justify-between text-left " + (isEditable ? "active:bg-surface-dim -mx-2 px-2 py-1 rounded" : "")}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-navy truncate">{entry.title}</p>
                        {entry.type === "task" && (<span className="text-[9px] px-1.5 py-0.5 rounded bg-navy/5 text-navy/60 font-medium shrink-0">Ad-hoc</span>)}
                        {hasPending && (<span className="text-[9px] px-1.5 py-0.5 rounded bg-starlight-blue/10 text-starlight-blue font-medium shrink-0">Edit pending</span>)}
                        {hasRejected && (<span className="text-[9px] px-1.5 py-0.5 rounded bg-starlight-red/10 text-starlight-red font-medium shrink-0">Edit rejected</span>)}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted">
                        <span>{formatDateShort(entry.date)}</span>{entry.job_number && <span className="font-mono">{entry.job_number}</span>}
                        {entry.type === "task" && entry.status && (<span className={"px-1.5 py-0.5 rounded-full text-[9px] font-medium " + (TASK_STATUS_BADGE[entry.status]?.cls || "")}>{TASK_STATUS_BADGE[entry.status]?.label}</span>)}
                      </div>
                      {hasPending && proposedHours != null && (
                        <p className="text-[10px] text-starlight-blue mt-0.5">Proposed: {formatHours(proposedHours)}</p>
                      )}
                      {hasRejected && editState?.lastRejected?.review_note && (
                        <p className="text-[10px] text-starlight-red mt-0.5 italic">PM: {editState.lastRejected.review_note}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-navy tabular-nums shrink-0 ml-3">{entry.hours != null ? formatHours(entry.hours) : "—"}</span>
                  </button>
                  {entry.type === "wo" && (
                    editingNote?.entryId === entry.id ? (
                      <div className="mt-2 flex gap-2">
                        <input type="text" value={editingNote.note} onChange={(ev) => setEditingNote({ ...editingNote, note: ev.target.value })}
                          placeholder="Add a note..." autoFocus
                          className="flex-1 px-2.5 py-1.5 border border-subtle rounded text-xs focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                        <button onClick={() => saveEntryNote(entry.id, editingNote.note)} disabled={savingNote}
                          className="px-2.5 py-1.5 bg-starlight-blue text-white text-xs rounded disabled:opacity-50"><Save className="h-3 w-3" /></button>
                        <button onClick={() => setEditingNote(null)} className="px-2 py-1.5 text-muted text-xs"><X className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <button onClick={(ev) => { ev.stopPropagation(); setEditingNote({ entryId: entry.id, note: entry.flag_note || "" }); }}
                        className="mt-1 text-[11px] text-muted hover:text-navy transition-colors text-left">
                        {entry.flag_note ? `📝 ${entry.flag_note}` : "+ Add note"}
                      </button>
                    )
                  )}
                </div>
              );
            })}
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
                <div className="flex items-center gap-2 shrink-0 ml-2">{task.hours != null && (<span className="text-xs text-muted tabular-nums">{formatHours(task.hours)}</span>)}{badge && (<span className={"text-[10px] px-2 py-0.5 rounded-full font-medium " + badge.cls}>{badge.label}</span>)}</div>
              </div>
              {task.review_note && (<p className="text-[10px] text-muted mt-1 italic">{task.review_note}</p>)}
            </div>); })}
        </div>
      </div>)}

      <LogSheet
        open={showLogSheet && !!activeTimer}
        onClose={() => setShowLogSheet(false)}
        onSubmit={handleLogTimer}
        contextLabel={activeTimer?.title || "Task"}
        contextSublabel={activeTimer ? `${new Date(activeTimer.started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} — ${elapsedSince(activeTimer.started_at)} ago` : undefined}
        defaultHours={defaultLogHours}
        notesPlaceholder="What did you work on..."
        submitting={logSubmitting}
        woOptions={woOptions}
      />

      {/* Backfill sheet — adds a flagged time entry for a past day. Reuses
          LogSheet but forces WO selection (handler rejects without it) and
          relabels the picker so the freelancer knows it's required. */}
      <LogSheet
        open={!!backfillTarget && backfillTarget.mode === "add"}
        onClose={() => setBackfillTarget(null)}
        onSubmit={handleBackfillSubmit}
        contextLabel={backfillTarget ? `Add entry for ${formatDateShort(backfillTarget.date)}` : ""}
        contextSublabel="Pick a WO if you know it, or just describe the work"
        defaultHours={0}
        notesPlaceholder="What did you work on..."
        submitLabel="Add entry"
        submitting={backfillSubmitting}
        woOptions={woOptions}
        woPickerLabel="Work Order (optional)"
      />

      {/* Edit-request sheet — opens when any time entry in this page is
          tapped. Submits a pending row to tbl_wo_time_entry_edits without
          touching the entry. PM approves/rejects in /review/timesheets. */}
      <EditTimeEntrySheet
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        entry={editTarget}
        woOptions={woOptions}
        onSubmitted={() => setRefreshKey((k) => k + 1)}
      />

      {/* Edit-task sheet — for ad-hoc tasks. Direct update for pending;
          revert to pending if PM had approved (forces re-review). */}
      <EditTaskSheet
        open={!!editTaskTarget}
        onClose={() => setEditTaskTarget(null)}
        task={editTaskTarget}
        onSubmitted={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
