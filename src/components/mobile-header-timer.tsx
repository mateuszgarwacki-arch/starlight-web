"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";
import { Clock, ClipboardList } from "lucide-react";
import { formatHours } from "@/lib/format-hours";

interface TimerInfo {
  type: "wo" | "adhoc";
  // WO fields
  entry_id?: number;
  work_order_id?: number;
  system_start_timestamp?: string;
  system_end_timestamp?: string | null;
  actual_hours?: number | null;
  activity_label?: string;
  scope_name?: string;
  job_number?: string;
  // Ad-hoc task fields
  task_id?: number;
  task_title?: string;
  started_at?: string;
}

export function MobileHeaderTimer() {
  const supabase = createClient();
  const [info, setInfo] = useState<TimerInfo | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTimer = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const fId = user.user_metadata?.freelancer_id || 0;
    if (!fId) { setLoading(false); return; }

    // 1) Check for active WO timer (system_end null)
    const { data: activeWo } = await supabase
      .from("tbl_wo_time_entries")
      .select("entry_id, work_order_id, system_start_timestamp, system_end_timestamp, actual_hours")
      .eq("freelancer_id", fId)
      .is("system_end_timestamp", null)
      .is("archived_at", null)
      .order("system_start_timestamp", { ascending: false })
      .limit(1);

    if (activeWo?.[0]) {
      // Active WO timer — get context
      const entry = activeWo[0];
      const { data: wo } = await supabase
        .from("tbl_work_orders")
        .select("work_order_id, activity_verb, scope_item_id, job_id")
        .eq("work_order_id", entry.work_order_id)
        .single();
      if (wo) {
        const [actRes, scopeRes, jobRes] = await Promise.all([
          wo.activity_verb
            ? supabase.from("tbl_master_lookups").select("lookup_value").eq("lookup_id", wo.activity_verb).single()
            : { data: null },
          wo.scope_item_id
            ? supabase.from("tbl_scope_items").select("item_name").eq("scope_item_id", wo.scope_item_id).single()
            : { data: null },
          wo.job_id
            ? supabase.from("tbl_production_plan").select("job_number").eq("job_id", wo.job_id).single()
            : { data: null },
        ]);
        setInfo({
          type: "wo",
          entry_id: entry.entry_id,
          work_order_id: entry.work_order_id,
          system_start_timestamp: entry.system_start_timestamp,
          system_end_timestamp: entry.system_end_timestamp,
          actual_hours: entry.actual_hours,
          activity_label: actRes.data?.lookup_value || "Task",
          scope_name: scopeRes.data?.item_name || "",
          job_number: jobRes.data?.job_number || "",
        });
      }
      setLoading(false);
      return;
    }

    // 2) Check for active ad-hoc task (tbl_tasks with status=in_progress)
    const { data: activeTask } = await supabase
      .from("tbl_tasks")
      .select("task_id, title, started_at, category")
      .eq("freelancer_id", fId)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1);

    if (activeTask?.[0] && activeTask[0].started_at) {
      setInfo({
        type: "adhoc",
        task_id: activeTask[0].task_id,
        task_title: activeTask[0].title,
        started_at: activeTask[0].started_at,
      });
      setLoading(false);
      return;
    }

    // 3) Fallback: last completed WO entry
    const { data: last } = await supabase
      .from("tbl_wo_time_entries")
      .select("entry_id, work_order_id, system_start_timestamp, system_end_timestamp, actual_hours")
      .eq("freelancer_id", fId)
      .not("system_end_timestamp", "is", null)
      .is("archived_at", null)
      .order("system_end_timestamp", { ascending: false })
      .limit(1);

    if (last?.[0]) {
      const entry = last[0];
      const { data: wo } = await supabase
        .from("tbl_work_orders")
        .select("work_order_id, activity_verb, scope_item_id, job_id")
        .eq("work_order_id", entry.work_order_id)
        .single();

      if (wo) {
        const [actRes, scopeRes, jobRes] = await Promise.all([
          wo.activity_verb
            ? supabase.from("tbl_master_lookups").select("lookup_value").eq("lookup_id", wo.activity_verb).single()
            : { data: null },
          wo.scope_item_id
            ? supabase.from("tbl_scope_items").select("item_name").eq("scope_item_id", wo.scope_item_id).single()
            : { data: null },
          wo.job_id
            ? supabase.from("tbl_production_plan").select("job_number").eq("job_id", wo.job_id).single()
            : { data: null },
        ]);
        setInfo({
          type: "wo",
          entry_id: entry.entry_id,
          work_order_id: entry.work_order_id,
          system_start_timestamp: entry.system_start_timestamp,
          system_end_timestamp: entry.system_end_timestamp,
          actual_hours: entry.actual_hours,
          activity_label: actRes.data?.lookup_value || "Task",
          scope_name: scopeRes.data?.item_name || "",
          job_number: jobRes.data?.job_number || "",
        });
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTimer(); }, [loadTimer]);

  // Elapsed time ticker for active timer
  useEffect(() => {
    const startTs = info?.type === "wo"
      ? (info.system_end_timestamp ? null : info.system_start_timestamp)
      : info?.started_at;

    if (!info || !startTs) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const tick = () => {
      const start = new Date(startTs).getTime();
      const now = Date.now();
      const diffMs = now - start;
      const hrs = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      setElapsed(hrs > 0 ? `${hrs}h ${String(mins).padStart(2, "0")}m` : `${mins}m ${String(secs).padStart(2, "0")}s`);
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [info]);

  // Realtime: listen for changes to WO time entries + tasks
  useEffect(() => {
    const chan = supabase.channel("header-timer")
      .on("postgres_changes", { event: "*", schema: "public", table: "tbl_wo_time_entries" }, () => { loadTimer(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "tbl_tasks" }, () => { loadTimer(); })
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [loadTimer]);

  if (loading || !info) return null;

  // ---- Ad-hoc task timer ----
  if (info.type === "adhoc") {
    return (
      <Link href="/m/me" className="flex items-center gap-2 ml-auto min-w-0 max-w-[60%]">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-starlight-amber opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-starlight-amber" />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-white text-[11px] font-semibold leading-tight truncate">
            <ClipboardList className="inline h-3 w-3 mr-1 opacity-60" />{info.task_title}
          </span>
          <span className="text-white/60 text-[10px] leading-tight">
            Ad-hoc · <span className="font-mono text-starlight-amber">{elapsed}</span>
          </span>
        </div>
      </Link>
    );
  }

  // ---- WO timer (active or completed) ----
  const isActive = info.type === "wo" && !info.system_end_timestamp;

  const startTime = info.system_start_timestamp
    ? new Date(info.system_start_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "";

  const timeAgo = info.system_end_timestamp ? (() => {
    const diff = Date.now() - new Date(info.system_end_timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  })() : "";

  const label = info.scope_name
    ? `${info.activity_label} · ${info.scope_name}`
    : info.activity_label || "Task";

  return (
    <Link
      href={`/m/wo/${info.work_order_id}`}
      className="flex items-center gap-2 ml-auto min-w-0 max-w-[60%]"
    >
      {isActive ? (
        <>
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-starlight-amber opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-starlight-amber" />
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-white text-[11px] font-semibold leading-tight truncate">{label}</span>
            <span className="text-white/60 text-[10px] leading-tight">
              {startTime} · <span className="font-mono text-starlight-amber">{elapsed}</span>
            </span>
          </div>
        </>
      ) : (
        <>
          <Clock className="h-3.5 w-3.5 text-white/40 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-white/50 text-[11px] leading-tight truncate">{label}</span>
            <span className="text-white/30 text-[10px] leading-tight">{timeAgo}</span>
          </div>
        </>
      )}
    </Link>
  );
}
