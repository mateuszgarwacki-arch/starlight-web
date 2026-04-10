"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";
import { Clock } from "lucide-react";

interface TimerInfo {
  entry_id: number;
  work_order_id: number;
  system_start_timestamp: string;
  system_end_timestamp: string | null;
  actual_hours: number | null;
  // WO context
  activity_label: string;
  scope_name: string;
  job_number: string;
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

    // 1) Check for active timer (system_end null)
    const { data: active } = await supabase
      .from("tbl_wo_time_entries")
      .select("entry_id, work_order_id, system_start_timestamp, system_end_timestamp, actual_hours")
      .eq("freelancer_id", fId)
      .is("system_end_timestamp", null)
      .is("archived_at", null)
      .order("system_start_timestamp", { ascending: false })
      .limit(1);

    let entry = active?.[0] || null;

    // 2) If no active timer, get last completed entry
    if (!entry) {
      const { data: last } = await supabase
        .from("tbl_wo_time_entries")
        .select("entry_id, work_order_id, system_start_timestamp, system_end_timestamp, actual_hours")
        .eq("freelancer_id", fId)
        .not("system_end_timestamp", "is", null)
        .is("archived_at", null)
        .order("system_end_timestamp", { ascending: false })
        .limit(1);
      entry = last?.[0] || null;
    }

    if (!entry) { setLoading(false); return; }

    // 3) Get WO context
    const { data: wo } = await supabase
      .from("tbl_work_orders")
      .select("work_order_id, activity_verb, scope_item_id, job_id")
      .eq("work_order_id", entry.work_order_id)
      .single();

    if (!wo) { setLoading(false); return; }

    // Get activity label, scope name, job number in parallel
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
      entry_id: entry.entry_id,
      work_order_id: entry.work_order_id,
      system_start_timestamp: entry.system_start_timestamp,
      system_end_timestamp: entry.system_end_timestamp,
      actual_hours: entry.actual_hours,
      activity_label: actRes.data?.lookup_value || "Task",
      scope_name: scopeRes.data?.item_name || "",
      job_number: jobRes.data?.job_number || "",
    });
    setLoading(false);
  }, []);

  useEffect(() => { loadTimer(); }, [loadTimer]);

  // Elapsed time ticker for active timer
  useEffect(() => {
    if (!info || info.system_end_timestamp) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const tick = () => {
      const start = new Date(info.system_start_timestamp).getTime();
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

  // Realtime: listen for changes to own time entries
  useEffect(() => {
    const chan = supabase.channel("header-timer").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tbl_wo_time_entries" },
      () => { loadTimer(); }
    ).subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [loadTimer]);

  if (loading || !info) return null;

  const isActive = !info.system_end_timestamp;

  // Format start time as HH:MM
  const startTime = new Date(info.system_start_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  // For completed: show how long ago
  const timeAgo = info.system_end_timestamp ? (() => {
    const diff = Date.now() - new Date(info.system_end_timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  })() : "";

  // Compact label: "Build · Reception Desk" or just activity
  const label = info.scope_name
    ? `${info.activity_label} · ${info.scope_name}`
    : info.activity_label;

  return (
    <Link
      href={`/m/wo/${info.work_order_id}`}
      className="flex items-center gap-2 ml-auto min-w-0 max-w-[60%]"
    >
      {isActive ? (
        <>
          {/* Pulsing green dot */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-green-400 text-[11px] font-semibold leading-tight truncate">{label}</span>
            <span className="text-green-300/70 text-[10px] leading-tight">
              {startTime} · <span className="font-mono">{elapsed}</span>
            </span>
          </div>
        </>
      ) : (
        <>
          <Clock className="h-3.5 w-3.5 text-muted shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-muted text-[11px] leading-tight truncate">{label}</span>
            <span className="text-muted/60 text-[10px] leading-tight">{timeAgo}</span>
          </div>
        </>
      )}
    </Link>
  );
}
