"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { Clock, Play, UserPlus, CheckCircle2, Paintbrush, ChevronDown, ChevronRight } from "lucide-react";

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
  workers: { freelancer_id: number; name: string; open: boolean }[];
  myOpenEntry: number | null;
  paint_notes: string | null;
}

interface ScopeGroup {
  scope_item_id: number;
  scope_name: string;
  tasks: TaskCard[];
}

interface JobGroup {
  job_id: number;
  job_name: string;
  job_number: string;
  scopes: ScopeGroup[];
  taskCount: number;
}

export default function MobileTaskList() {
  const supabase = createClient();
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"mine" | "all" | "painting" | "done">("all");
  const [myId, setMyId] = useState<number>(0);
  const [myName, setMyName] = useState("");
  const [collapsedJobs, setCollapsedJobs] = useState<Set<number>>(new Set());

  const toggleJob = (jobId: number) => {
    setCollapsedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const loadTasks = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/m/login"); return; }

    const fId = user.user_metadata?.freelancer_id;
    const fName = user.user_metadata?.name || "You";
    setMyId(fId);
    setMyName(fName);

    // Load Ready + In-Progress WOs
    const { data: activeWos } = await supabase
      .from("tbl_work_orders")
      .select("work_order_id, scope_item_id, job_id, description, estimated_duration_hrs, status, activity_verb, paint_notes")
      .in("status", ["Ready", "In-Progress"]);
    // Load Complete WOs from all active jobs (for Done filter + painting)
    const { data: activeJobs } = await supabase
      .from("tbl_production_plan")
      .select("job_id")
      .not("job_status", "eq", "Closed");
    const activeJobIds = (activeJobs || []).map((j: any) => j.job_id);
    let completeWos: any[] = [];
    if (activeJobIds.length > 0) {
      const { data } = await supabase
        .from("tbl_work_orders")
        .select("work_order_id, scope_item_id, job_id, description, estimated_duration_hrs, status, activity_verb, paint_notes")
        .eq("status", "Complete")
        .in("job_id", activeJobIds);
      completeWos = data || [];
    }
    const wos = [...(activeWos || []), ...completeWos];

    if (!wos || wos.length === 0) { setTasks([]); setLoading(false); return; }

    const woIds = wos.map(w => w.work_order_id);
    const scopeIds = [...new Set(wos.map(w => w.scope_item_id).filter(Boolean))];
    const jobIds = [...new Set(wos.map(w => w.job_id).filter(Boolean))];

    const [actRes, scopeRes, jobRes, timeRes] = await Promise.all([
      supabase.from("tbl_wo_activities").select("work_order_id, activity_id, sequence").in("work_order_id", woIds).order("sequence"),
      supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds),
      supabase.from("tbl_production_plan").select("job_id, job_name, job_number").in("job_id", jobIds),
      supabase.from("tbl_wo_time_entries").select("entry_id, work_order_id, freelancer_id, system_end_timestamp").in("work_order_id", woIds).is("archived_at", null),
    ]);

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

    const workerIds = [...new Set((timeRes.data || []).map((t: any) => t.freelancer_id))];
    const { data: freelancers } = workerIds.length > 0
      ? await supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", workerIds)
      : { data: [] };
    const fNames: Record<number, string> = {};
    (freelancers || []).forEach((f: any) => { fNames[f.freelancer_id] = f.freelancer_name; });

    const actByWO: Record<number, any[]> = {};
    (actRes.data || []).forEach((a: any) => {
      if (!actByWO[a.work_order_id]) actByWO[a.work_order_id] = [];
      actByWO[a.work_order_id].push(a);
    });

    const scopeMap: Record<number, string> = {};
    (scopeRes.data || []).forEach((s: any) => { scopeMap[s.scope_item_id] = s.item_name || "Scope #" + s.scope_item_id; });
    const jobMap: Record<number, { name: string; number: string }> = {};
    (jobRes.data || []).forEach((j: any) => { jobMap[j.job_id] = { name: j.job_name, number: j.job_number }; });

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
        paint_notes: wo.paint_notes || null,
      };
    });

    cards.sort((a, b) => (a.phase_number || 999) - (b.phase_number || 999));
    setTasks(cards);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Filter logic
  const activeTasks = tasks.filter(t => t.status !== "Complete");
  const doneTasks = tasks.filter(t => t.status === "Complete");
  const paintingCount = tasks.filter(t => t.paint_notes).length;
  const paintingTasks = tasks.filter(t => t.paint_notes);
  const filtered = filter === "mine"
    ? activeTasks.filter(t => t.myOpenEntry || t.workers.some(w => w.freelancer_id === myId))
    : filter === "painting"
    ? paintingTasks
    : filter === "done"
    ? doneTasks
    : activeTasks;

  // Group filtered tasks into Job → Scope → WOs
  const jobGroups: JobGroup[] = (() => {
    const jobMap = new Map<number, JobGroup>();
    for (const task of filtered) {
      if (!jobMap.has(task.job_id)) {
        jobMap.set(task.job_id, {
          job_id: task.job_id,
          job_name: task.job_name,
          job_number: task.job_number,
          scopes: [],
          taskCount: 0,
        });
      }
      const jg = jobMap.get(task.job_id)!;
      jg.taskCount++;
      let sg = jg.scopes.find(s => s.scope_item_id === task.scope_item_id);
      if (!sg) {
        sg = { scope_item_id: task.scope_item_id, scope_name: task.scope_name, tasks: [] };
        jg.scopes.push(sg);
      }
      sg.tasks.push(task);
    }
    return Array.from(jobMap.values());
  })();

  const phaseColors: Record<number, string> = {
    1: "bg-phase-1", 2: "bg-phase-2", 3: "bg-phase-3", 4: "bg-phase-4", 5: "bg-phase-5",
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-muted text-sm animate-pulse">Loading tasks...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-navy">Tasks</h1>
        <div className="flex bg-surface rounded-lg border border-subtle overflow-hidden">
          <button
            onClick={() => setFilter("all")}
            className={"px-3 py-1.5 text-xs font-medium transition-colors " + (filter === "all" ? "bg-navy text-white" : "text-muted")}
          >
            All ({activeTasks.length})
          </button>
          <button
            onClick={() => setFilter("mine")}
            className={"px-3 py-1.5 text-xs font-medium transition-colors " + (filter === "mine" ? "bg-navy text-white" : "text-muted")}
          >
            Mine
          </button>
          {doneTasks.length > 0 && (
            <button
              onClick={() => setFilter(filter === "done" ? "all" : "done")}
              className={"px-3 py-1.5 text-xs font-medium transition-colors " + (filter === "done" ? "bg-starlight-green text-white" : "text-starlight-green")}
            >
              Done
            </button>
          )}
          {paintingCount > 0 && (
            <button
              onClick={() => setFilter(filter === "painting" ? "all" : "painting")}
              className={"px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 " + (filter === "painting" ? "bg-starlight-amber text-white" : "text-starlight-amber")}
            >
              <Paintbrush className="h-3 w-3" /> {paintingCount}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted">Hey {myName}. {filtered.length} task{filtered.length !== 1 ? "s" : ""} available.</p>

      {/* Tree: Job → Scope → WO */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-faint text-sm">No tasks right now</div>
      ) : (
        <div className="space-y-3">
          {jobGroups.map((job) => {
            const isCollapsed = collapsedJobs.has(job.job_id);
            return (
              <div key={job.job_id} className="bg-surface rounded-xl border border-subtle overflow-hidden">
                {/* Job header */}
                <button
                  onClick={() => toggleJob(job.job_id)}
                  className="w-full flex items-center gap-2 px-4 py-3 active:bg-surface-dim transition-colors"
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted shrink-0" />}
                  <span className="font-mono text-xs text-starlight-blue font-semibold">{job.job_number}</span>
                  <span className="text-sm font-semibold text-navy truncate">{job.job_name}</span>
                  {isCollapsed && (
                    <span className="ml-auto text-[10px] text-muted bg-surface-top px-2 py-0.5 rounded-full shrink-0">{job.taskCount}</span>
                  )}
                </button>

                {/* Scopes + WOs */}
                {!isCollapsed && (
                  <div className="border-t border-subtle">
                    {job.scopes.map((scope, si) => (
                      <div key={scope.scope_item_id}>
                        {/* Scope header */}
                        <div className="px-4 py-2 bg-surface-dim/50 flex items-center gap-2">
                          <div className="w-1 h-4 bg-starlight-amber rounded-full shrink-0" />
                          <span className="text-xs font-bold text-navy uppercase tracking-wide">{scope.scope_name}</span>
                          <span className="text-[10px] text-muted">({scope.tasks.length})</span>
                        </div>
                        {/* WO rows */}
                        {scope.tasks.map((task) => (
                          <button
                            key={task.work_order_id}
                            onClick={() => router.push("/m/wo/" + task.work_order_id)}
                            className="w-full text-left flex items-center gap-2 px-4 py-2.5 border-t border-subtle/50 active:bg-surface-dim transition-colors"
                          >
                            {/* Phase dot */}
                            <div className={"w-1.5 h-1.5 rounded-full shrink-0 " + (phaseColors[task.phase_number || 0] || "bg-surface-top")} />
                            {/* Activity badge */}
                            <span className="text-[10px] font-medium text-muted bg-surface-top px-1.5 py-0.5 rounded shrink-0 min-w-[3rem] text-center">
                              {task.activity_label.length > 12 ? task.activity_label.slice(0, 12) + "…" : task.activity_label}
                            </span>
                            {/* Description = headline */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-navy truncate">{task.description || task.activity_label}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {task.workers.length > 0 && task.workers.map((w) => (
                                  <span key={w.freelancer_id} className="inline-flex items-center gap-1 text-[10px] font-medium text-starlight-blue bg-starlight-blue/10 px-1.5 py-0.5 rounded-full">
                                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                                    </span>
                                    {w.name.split(" ")[0]}
                                  </span>
                                ))}
                                {task.estimated_duration_hrs && (
                                  <span className="text-[10px] text-muted flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{task.estimated_duration_hrs}h</span>
                                )}
                                {task.paint_notes && <Paintbrush className="h-2.5 w-2.5 text-starlight-amber" />}
                              </div>
                              {task.paint_notes && filter === "painting" && (
                                <p className="text-[10px] text-starlight-amber bg-starlight-amber/10 rounded px-1.5 py-0.5 mt-1">{task.paint_notes}</p>
                              )}
                            </div>
                            {/* Status indicators */}
                            <div className="shrink-0 flex items-center gap-1">
                              {task.status === "In-Progress" && (
                                <span className="text-[9px] bg-starlight-blue/10 text-starlight-blue px-1.5 py-0.5 rounded-full font-medium">Live</span>
                              )}
                              {task.status === "Complete" && (
                                <span className="text-[9px] bg-starlight-green/10 text-starlight-green px-1.5 py-0.5 rounded-full font-medium">Built</span>
                              )}
                              {task.myOpenEntry ? (
                                <CheckCircle2 className="h-4 w-4 text-starlight-green" />
                              ) : task.status === "Ready" ? (
                                <Play className="h-4 w-4 text-starlight-blue" />
                              ) : task.status !== "Complete" ? (
                                <UserPlus className="h-4 w-4 text-starlight-amber" />
                              ) : null}
                            </div>
                          </button>
                        ))}
                        {/* Divider between scopes (not after last) */}
                        {si < job.scopes.length - 1 && <div className="mx-4 border-b border-subtle" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
