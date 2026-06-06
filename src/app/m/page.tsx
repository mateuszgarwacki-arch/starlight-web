"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatHours } from "@/lib/format-hours";
import { useRouter } from "next/navigation";
import { Clock, Play, UserPlus, CheckCircle2, Paintbrush, ChevronDown, ChevronRight, UserCheck, Search, X, Tag } from "lucide-react";
import { TimesheetFlagsBanner } from "@/components/timesheet-flags";

interface LinkedItem {
  item_id: number;
  description: string;
  quantity: number | null;
  unit: string | null;
}

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
  assignee_ids: number[];
  my_last_entry_id: number | null;
  items: LinkedItem[];
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
  const [filter, setFilter] = useState<"recent" | "all" | "assigned" | "painting" | "done">("all");
  const [myId, setMyId] = useState<number>(0);
  const [myName, setMyName] = useState("");
  const [collapsedJobs, setCollapsedJobs] = useState<Set<number>>(new Set());
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce search input → actual search term used for filtering
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.toLowerCase().trim()), 150);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Persist collapsed state per freelancer
  useEffect(() => {
    if (!myId) return;
    try {
      localStorage.setItem(
        `m-tasks-collapsed-${myId}`,
        JSON.stringify(Array.from(collapsedJobs))
      );
    } catch { /* localStorage unavailable (private mode etc.) */ }
  }, [collapsedJobs, myId]);

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

    // Restore collapsed state from localStorage in the same pass
    // (inline here to avoid a flicker between "all expanded" and restored state)
    try {
      const raw = localStorage.getItem(`m-tasks-collapsed-${fId}`);
      if (raw) {
        const arr = JSON.parse(raw) as number[];
        setCollapsedJobs(new Set(arr));
      }
    } catch { /* localStorage unavailable */ }

    // Identify non-Complete jobs first; both WO queries below scope to these.
    // (The legacy filter was against "Closed" — a status that never existed
    // in this schema, so it was a no-op. Now correctly filters Complete.)
    const { data: activeJobs } = await supabase
      .from("tbl_production_plan")
      .select("job_id")
      .neq("job_status", "Complete");
    const activeJobIds = (activeJobs || []).map((j: any) => j.job_id);

    // No active jobs at all -> empty task list
    if (activeJobIds.length === 0) { setTasks([]); setLoading(false); return; }

    // Load Ready + In-Progress WOs scoped to non-Complete jobs
    const { data: activeWos } = await supabase
      .from("tbl_work_orders")
      .select("work_order_id, scope_item_id, job_id, description, estimated_duration_hrs, status, activity_verb, paint_notes")
      .in("status", ["Ready", "In-Progress"])
      .in("job_id", activeJobIds);
    // Load Complete WOs from non-Complete jobs (for Done filter + painting)
    const { data: completeWosData } = await supabase
      .from("tbl_work_orders")
      .select("work_order_id, scope_item_id, job_id, description, estimated_duration_hrs, status, activity_verb, paint_notes")
      .eq("status", "Complete")
      .in("job_id", activeJobIds);
    const completeWos = completeWosData || [];
    const wos = [...(activeWos || []), ...completeWos];

    if (!wos || wos.length === 0) { setTasks([]); setLoading(false); return; }

    const woIds = wos.map(w => w.work_order_id);
    const scopeIds = [...new Set(wos.map(w => w.scope_item_id).filter(Boolean))];
    const jobIds = [...new Set(wos.map(w => w.job_id).filter(Boolean))];

    const [actRes, scopeRes, jobRes, timeRes, activeWorkersRes, assigneesRes, linkRes] = await Promise.all([
      supabase.from("tbl_wo_activities").select("work_order_id, activity_id, sequence").in("work_order_id", woIds).order("sequence"),
      supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds),
      supabase.from("tbl_production_plan").select("job_id, job_name, job_number").in("job_id", jobIds),
      supabase.from("tbl_wo_time_entries").select("entry_id, work_order_id, freelancer_id, system_end_timestamp").in("work_order_id", woIds).is("archived_at", null),
      supabase.rpc("rpc_active_workers"),
      supabase.from("tbl_wo_assignees").select("work_order_id, freelancer_id").in("work_order_id", woIds),
      supabase.from("tbl_jobitem_workorder").select("work_order_id, job_item_id").in("work_order_id", woIds),
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

    // Build active workers map from RPC (bypasses RLS, returns all active workers)
    const activeWorkersByWO: Record<number, { freelancer_id: number; name: string }[]> = {};
    ((activeWorkersRes.data || []) as any[]).forEach((aw: any) => {
      if (!activeWorkersByWO[aw.work_order_id]) activeWorkersByWO[aw.work_order_id] = [];
      activeWorkersByWO[aw.work_order_id].push({ freelancer_id: aw.freelancer_id, name: aw.freelancer_name });
    });

    // Build assignees map from tbl_wo_assignees (peer-model: all equal)
    const assigneesByWO: Record<number, number[]> = {};
    ((assigneesRes.data || []) as any[]).forEach((a: any) => {
      if (!assigneesByWO[a.work_order_id]) assigneesByWO[a.work_order_id] = [];
      assigneesByWO[a.work_order_id].push(a.freelancer_id);
    });

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

    // Linked job items per WO (what physically gets built) — batch-resolved via the junction.
    const links = (linkRes.data || []) as { work_order_id: number; job_item_id: number }[];
    const linkedItemIds = [...new Set(links.map(l => l.job_item_id).filter(Boolean))] as number[];
    const { data: itemRows } = linkedItemIds.length > 0
      ? await supabase.from("tbl_job_items").select("item_id, description, quantity, unit").in("item_id", linkedItemIds)
      : { data: [] };
    const itemById: Record<number, LinkedItem> = {};
    (itemRows || []).forEach((it: any) => {
      itemById[it.item_id] = { item_id: it.item_id, description: it.description || "Item", quantity: it.quantity, unit: it.unit };
    });
    const itemsByWO: Record<number, LinkedItem[]> = {};
    for (const l of links) {
      const it = itemById[l.job_item_id];
      if (it) (itemsByWO[l.work_order_id] ||= []).push(it);
    }

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
      const workers = (activeWorkersByWO[wo.work_order_id] || []).map(w => ({ ...w, open: true }));
      const myOpen = entries.find((e: any) => e.freelancer_id === fId && !e.system_end_timestamp);
      const myEntries = entries.filter((e: any) => e.freelancer_id === fId);
      const myLastEntryId = myEntries.length > 0
        ? Math.max(...myEntries.map((e: any) => e.entry_id))
        : null;
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
        assignee_ids: assigneesByWO[wo.work_order_id] || [],
        my_last_entry_id: myLastEntryId,
        items: itemsByWO[wo.work_order_id] || [],
      };
    });

    cards.sort((a, b) => (a.phase_number || 999) - (b.phase_number || 999));
    setTasks(cards);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Status filter
  const activeTasks = tasks.filter(t => t.status !== "Complete");
  const doneTasks = tasks.filter(t => t.status === "Complete");
  const paintingCount = tasks.filter(t => t.paint_notes).length;
  const paintingTasks = tasks.filter(t => t.paint_notes);
  const onTasks = activeTasks.filter(t => t.assignee_ids.includes(myId));
  const recentTasks = tasks.filter(t => t.my_last_entry_id !== null);
  const filtered = filter === "recent"
    ? recentTasks.slice().sort((a, b) => (b.my_last_entry_id || 0) - (a.my_last_entry_id || 0))
    : filter === "assigned"
    ? onTasks
    : filter === "painting"
    ? paintingTasks
    : filter === "done"
    ? doneTasks
    : activeTasks;

  // Search filter layered on top of status filter
  const searched = search
    ? filtered.filter(t => {
        const haystack = [
          t.description || "",
          t.scope_name,
          t.job_name,
          t.job_number,
          t.activity_label,
          ...t.items.map(i => i.description),
        ].join(" ").toLowerCase();
        return haystack.includes(search);
      })
    : filtered;

  // When searching, auto-expand all jobs so matches are visible regardless of collapse state
  const effectiveCollapsed = search ? new Set<number>() : collapsedJobs;

  // Group searched tasks into Job → Scope → WOs
  const jobGroups: JobGroup[] = (() => {
    const jobMap = new Map<number, JobGroup>();
    for (const task of searched) {
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
    <div className="space-y-3">
      {/* Missing-hours banner — only renders when there are open flags */}
      <TimesheetFlagsBanner myId={myId} />

      {/* Title + filter pills (not sticky) */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-navy">Tasks</h1>
        <div className="flex bg-surface rounded-lg border border-subtle overflow-hidden">
          <button
            onClick={() => setFilter("all")}
            className={"px-3 py-1.5 text-xs font-medium transition-colors " + (filter === "all" ? "bg-navy text-white" : "text-muted")}
          >
            All ({activeTasks.length})
          </button>
          {recentTasks.length > 0 && (
            <button
              onClick={() => setFilter(filter === "recent" ? "all" : "recent")}
              className={"px-3 py-1.5 text-xs font-medium transition-colors " + (filter === "recent" ? "bg-navy text-white" : "text-muted")}
              title="Work Orders you've worked on, newest first"
            >
              Recent ({recentTasks.length})
            </button>
          )}
          {onTasks.length > 0 && (
            <button
              onClick={() => setFilter(filter === "assigned" ? "all" : "assigned")}
              className={"px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 " + (filter === "assigned" ? "bg-starlight-blue text-white" : "text-starlight-blue")}
              title="Work Orders you're assigned to"
            >
              <UserCheck className="h-3 w-3" /> On ({onTasks.length})
            </button>
          )}
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

      {/* Sticky search bar */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-base/95 backdrop-blur-sm border-b border-subtle/50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-faint pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={`Search ${filtered.length} task${filtered.length !== 1 ? "s" : ""}\u2026`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-8 pr-8 py-2 text-sm bg-surface border border-subtle rounded-lg focus:border-starlight-blue focus:outline-none"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-faint active:text-muted p-0.5"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {search && (
          <p className="text-[10px] text-muted mt-1.5">
            {searched.length} of {filtered.length} match
          </p>
        )}
      </div>

      {/* Greeting */}
      <p className="text-sm text-muted">Hey {myName}. {filtered.length} task{filtered.length !== 1 ? "s" : ""} available.</p>

      {/* Tree */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-faint text-sm">No tasks right now</div>
      ) : search && searched.length === 0 ? (
        <div className="text-center py-12 text-faint text-sm">
          No tasks match &ldquo;{searchInput}&rdquo;
        </div>
      ) : (
        <div className="space-y-3">
          {jobGroups.map((job) => {
            const isCollapsed = effectiveCollapsed.has(job.job_id);
            return (
              <div key={job.job_id} className="bg-surface rounded-xl border border-subtle overflow-hidden">
                {/* Job header — the only interactive group header */}
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
                        {/* Scope header — flat label, clearly not a button */}
                        <div className="px-4 pt-3 pb-1.5 flex items-center gap-1.5">
                          <Tag className="h-3 w-3 text-faint shrink-0" />
                          <span className="text-xs text-muted font-medium">{scope.scope_name}</span>
                          <span className="text-[10px] text-faint">&middot; {scope.tasks.length}</span>
                        </div>
                        {/* WO rows — the actionable things */}
                        {scope.tasks.map((task) => (
                          <button
                            key={task.work_order_id}
                            onClick={() => router.push("/m/wo/" + task.work_order_id)}
                            className="w-full text-left flex items-center gap-2 px-4 py-2.5 border-t border-subtle/50 active:bg-surface-dim transition-colors"
                          >
                            {/* Phase dot */}
                            <div className={"w-1.5 h-1.5 rounded-full shrink-0 " + (phaseColors[task.phase_number || 0] || "bg-surface-top")} />
                            {/* Activity badge — full width, no truncation */}
                            <span className="text-[10px] font-medium text-muted bg-surface-top px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                              {task.activity_label}
                            </span>
                            {/* Description = headline, wraps if needed */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-navy break-words">{task.description || task.activity_label}</p>
                              {task.items.length > 0 && (
                                <p className="text-[11px] italic text-muted leading-snug mt-0.5 line-clamp-2">
                                  {task.items.map(it => {
                                    const q = it.quantity != null ? (it.unit ? `${it.quantity} ${it.unit} ` : `${it.quantity}× `) : "";
                                    return q + it.description;
                                  }).join(" · ")}
                                </p>
                              )}
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
                                  <span className="text-[10px] text-muted flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{formatHours(task.estimated_duration_hrs)}</span>
                                )}
                                {task.paint_notes && <Paintbrush className="h-2.5 w-2.5 text-starlight-amber" />}
                              </div>
                              {task.paint_notes && filter === "painting" && (
                                <p className="text-[10px] text-starlight-amber bg-starlight-amber/10 rounded px-1.5 py-0.5 mt-1">{task.paint_notes}</p>
                              )}
                            </div>
                            {/* Status indicators — Live pill removed, worker pills carry that signal */}
                            <div className="shrink-0 flex items-center gap-1">
                              {task.status === "Complete" && (
                                <span className="text-[9px] bg-starlight-green/10 text-starlight-green px-1.5 py-0.5 rounded-full font-medium">Completed</span>
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
