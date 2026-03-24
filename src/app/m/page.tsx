"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { Clock, Users, Play, UserPlus, CheckCircle2 } from "lucide-react";

interface TaskCard {
  work_order_id: number;
  scope_item_id: number;
  job_id: number;
  description: string | null;
  estimated_duration_hrs: number | null;
  status: string;
  activity_label: string;
  scope_name: string;
  job_name: string;
  job_number: string;
  phase_number: number | null;
  // Current workers
  workers: { freelancer_id: number; name: string; open: boolean }[];
  // My state
  myOpenEntry: number | null; // entry_id if I have an open session
}

export default function MobileTaskList() {
  const supabase = createClient();
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"mine" | "all">("all");
  const [myId, setMyId] = useState<number>(0);
  const [myName, setMyName] = useState("");

  const loadTasks = useCallback(async () => {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/m/login"); return; }
    
    const fId = user.user_metadata?.freelancer_id;
    const fName = user.user_metadata?.name || "You";
    setMyId(fId);
    setMyName(fName);

    // Load Ready + In-Progress WOs
    const { data: wos } = await supabase
      .from("tbl_work_orders")
      .select("work_order_id, scope_item_id, job_id, description, estimated_duration_hrs, status, activity_verb")
      .in("status", ["Ready", "In-Progress"]);

    if (!wos || wos.length === 0) { setTasks([]); setLoading(false); return; }

    const woIds = wos.map(w => w.work_order_id);
    const scopeIds = [...new Set(wos.map(w => w.scope_item_id).filter(Boolean))];
    const jobIds = [...new Set(wos.map(w => w.job_id).filter(Boolean))];

    // Batch load: activities, scopes, jobs, time entries, lookups
    const [actRes, scopeRes, jobRes, timeRes] = await Promise.all([
      supabase.from("tbl_wo_activities").select("work_order_id, activity_id, sequence").in("work_order_id", woIds).order("sequence"),
      supabase.from("tbl_scope_items").select("scope_item_id, item_name, quote_line_id").in("scope_item_id", scopeIds),
      supabase.from("tbl_production_plan").select("job_id, job_name, job_number").in("job_id", jobIds),
      supabase.from("tbl_wo_time_entries").select("entry_id, work_order_id, freelancer_id, system_end_timestamp").in("work_order_id", woIds).is("archived_at", null),
    ]);

    // Load lookups for activity names
    const allActIds = [
      ...new Set([
        ...(actRes.data || []).map((a: any) => a.activity_id),
        ...wos.map(w => w.activity_verb).filter(Boolean),
      ])
    ];
    const { data: lookups } = await supabase
      .from("tbl_master_lookups").select("lookup_id, lookup_value, phase_number").in("lookup_id", allActIds);
    
    const lk: Record<number, { v: string; p: number | null }> = {};
    (lookups || []).forEach((l: any) => { lk[l.lookup_id] = { v: l.lookup_value, p: l.phase_number }; });

    // Load freelancer names for workers
    const workerIds = [...new Set((timeRes.data || []).map((t: any) => t.freelancer_id))];
    const { data: freelancers } = workerIds.length > 0
      ? await supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", workerIds)
      : { data: [] };
    const fNames: Record<number, string> = {};
    (freelancers || []).forEach((f: any) => { fNames[f.freelancer_id] = f.freelancer_name; });

    // Build activity labels per WO
    const actByWO: Record<number, any[]> = {};
    (actRes.data || []).forEach((a: any) => {
      if (!actByWO[a.work_order_id]) actByWO[a.work_order_id] = [];
      actByWO[a.work_order_id].push(a);
    });

    // Build scope/job maps
    const scopeMap: Record<number, string> = {};
    (scopeRes.data || []).forEach((s: any) => { scopeMap[s.scope_item_id] = s.item_name || "Scope #" + s.scope_item_id; });
    const jobMap: Record<number, { name: string; number: string }> = {};
    (jobRes.data || []).forEach((j: any) => { jobMap[j.job_id] = { name: j.job_name, number: j.job_number }; });

    // Build time entry info per WO
    const timeByWO: Record<number, any[]> = {};
    (timeRes.data || []).forEach((t: any) => {
      if (!timeByWO[t.work_order_id]) timeByWO[t.work_order_id] = [];
      timeByWO[t.work_order_id].push(t);
    });

    const cards: TaskCard[] = wos.map((wo: any) => {
      const acts = actByWO[wo.work_order_id];
      let label = "No Activity";
      let phase: number | null = null;
      if (acts && acts.length > 0) {
        acts.sort((a: any, b: any) => a.sequence - b.sequence);
        label = acts.map((a: any) => lk[a.activity_id]?.v || "?").join(" + ");
        phase = lk[acts[0].activity_id]?.p ?? null;
      } else if (wo.activity_verb && lk[wo.activity_verb]) {
        label = lk[wo.activity_verb].v;
        phase = lk[wo.activity_verb].p;
      }

      const entries = timeByWO[wo.work_order_id] || [];
      const workers = entries
        .filter((e: any) => !e.system_end_timestamp)
        .map((e: any) => ({ freelancer_id: e.freelancer_id, name: fNames[e.freelancer_id] || "Unknown", open: true }));
      const myOpen = entries.find((e: any) => e.freelancer_id === fId && !e.system_end_timestamp);

      const job = jobMap[wo.job_id] || { name: "—", number: "—" };

      return {
        work_order_id: wo.work_order_id,
        scope_item_id: wo.scope_item_id,
        job_id: wo.job_id,
        description: wo.description,
        estimated_duration_hrs: wo.estimated_duration_hrs,
        status: wo.status,
        activity_label: label,
        scope_name: scopeMap[wo.scope_item_id] || "—",
        job_name: job.name,
        job_number: job.number,
        phase_number: phase,
        workers,
        myOpenEntry: myOpen ? myOpen.entry_id : null,
      };
    });

    // Sort by phase
    cards.sort((a, b) => (a.phase_number || 999) - (b.phase_number || 999));
    setTasks(cards);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const filtered = filter === "mine"
    ? tasks.filter(t => t.myOpenEntry || t.workers.some(w => w.freelancer_id === myId))
    : tasks;

  const phaseColors: Record<number, string> = {
    1: "bg-phase-1", 2: "bg-phase-2", 3: "bg-phase-3", 4: "bg-phase-4", 5: "bg-phase-5",
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-gray-400 text-sm animate-pulse">Loading tasks...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-navy">Tasks</h1>
        <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setFilter("all")}
            className={"px-3 py-1.5 text-xs font-medium transition-colors " + (filter === "all" ? "bg-navy text-white" : "text-gray-500")}
          >
            All ({tasks.length})
          </button>
          <button
            onClick={() => setFilter("mine")}
            className={"px-3 py-1.5 text-xs font-medium transition-colors " + (filter === "mine" ? "bg-navy text-white" : "text-gray-500")}
          >
            My Tasks
          </button>
        </div>
      </div>

      {/* Welcome */}
      <p className="text-sm text-gray-400">Hey {myName}. {filtered.length} task{filtered.length !== 1 ? "s" : ""} available.</p>

      {/* Task cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-300 text-sm">No tasks right now</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task) => (
            <button
              key={task.work_order_id}
              onClick={() => router.push("/m/wo/" + task.work_order_id)}
              className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 active:bg-gray-50 transition-colors shadow-sm"
            >
              <div className="flex items-start gap-3">
                {/* Phase dot */}
                <div className={"w-2 h-2 rounded-full mt-1.5 shrink-0 " + (phaseColors[task.phase_number || 0] || "bg-gray-300")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-navy truncate">{task.activity_label}</p>
                    {task.status === "In-Progress" && (
                      <span className="text-[10px] bg-starlight-blue/10 text-starlight-blue px-1.5 py-0.5 rounded-full font-medium shrink-0">Live</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{task.scope_name}</p>
                  {task.description && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{task.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                    <span className="font-mono">{task.job_number}</span>
                    {task.estimated_duration_hrs && (
                      <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{task.estimated_duration_hrs}h est.</span>
                    )}
                    {task.workers.length > 0 && (
                      <span className="flex items-center gap-0.5 text-starlight-blue">
                        <Users className="h-3 w-3" />
                        {task.workers.map(w => w.name.split(" ")[0]).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                {/* Action hint */}
                <div className="shrink-0 mt-1">
                  {task.myOpenEntry ? (
                    <CheckCircle2 className="h-5 w-5 text-starlight-green" />
                  ) : task.status === "Ready" ? (
                    <Play className="h-5 w-5 text-starlight-blue" />
                  ) : (
                    <UserPlus className="h-5 w-5 text-starlight-amber" />
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
