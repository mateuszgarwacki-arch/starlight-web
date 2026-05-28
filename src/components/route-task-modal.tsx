"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getAuditContext, auditedInsert } from "@/lib/audit";
import { formatHours } from "@/lib/format-hours";
import { formatDate, statusClass } from "@/lib/utils";
import { notify } from "@/lib/notifications";
import { toast } from "sonner";
import {
  Search,
  X,
  CornerDownRight,
  Coins,
  CalendarDays,
  Briefcase,
  Clock,
  Inbox,
} from "lucide-react";

// ————————————————————————————————————————————————————————
// Types
// ————————————————————————————————————————————————————————

export interface RoutableTask {
  item_id: number; // task_id
  title: string;
  description: string | null; // freelancer's note, if any
  freelancer_id: number;
  freelancer_name: string;
  claimed_hours: number | null;
  worked_date: string | null;
  job_id: number | null;
  work_order_id: number | null; // pre-routed WO from mobile, if any
}

interface WOOption {
  work_order_id: number;
  description: string | null;
  scope_item_id: number | null;
  scope_name: string;
  is_overhead: boolean;
  job_id: number;
  job_number: string;
  job_name: string;
  job_event_date: string | null;
  activity_verb: string | null;
  wo_sequence: number | null;
  status: string;
}

interface JobOption {
  job_id: number;
  job_number: string;
  job_name: string;
  event_date: string | null;
  wo_count: number;
  has_overhead: boolean;
}

interface Props {
  task: RoutableTask;
  onClose: () => void;
  onSuccess: () => void;
}

// ————————————————————————————————————————————————————————
// Component
// ————————————————————————————————————————————————————————

export function RouteTaskModal({ task, onClose, onSuccess }: Props) {
  const supabase = createClient();

  const [allWos, setAllWos] = useState<WOOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedJobId, setSelectedJobId] = useState<number | null>(
    task.job_id ?? null,
  );
  const [selectedWoId, setSelectedWoId] = useState<number | null>(
    task.work_order_id ?? null,
  );

  const [jobSearch, setJobSearch] = useState("");
  const [woSearch, setWoSearch] = useState("");
  const [routeHours, setRouteHours] = useState(
    task.claimed_hours ? String(task.claimed_hours) : "",
  );
  const [routeNote, setRouteNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Ref to the pre-selected WO so we can scroll it into view on open. On busy
  // jobs (30+ WOs) the pre-routed WO is otherwise below the fold and the modal
  // looks like nothing was selected — the "find the WO again" complaint.
  const selectedWoRef = useRef<HTMLButtonElement | null>(null);
  const didInitialScroll = useRef(false);

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load all routable WOs + their scope + job + activity verb
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: wos } = await supabase
        .from("tbl_work_orders")
        .select(
          "work_order_id, description, scope_item_id, job_id, status, activity_verb, wo_sequence",
        )
        // Include Complete so PMs can route late-arriving time to finished WOs.
        // Complete rows are sorted to the bottom of each scope group and dimmed
        // (see overhead/scope sort below). The existing statusClass() pill makes
        // them visually distinct without needing extra labels.
        .in("status", ["Ready", "In-Progress", "Not-Started", "Complete"]);

      if (cancelled) return;
      if (!wos) {
        setAllWos([]);
        setLoading(false);
        return;
      }

      const scopeIds = [
        ...new Set(wos.map((w: any) => w.scope_item_id).filter(Boolean)),
      ] as number[];
      const jobIds = [
        ...new Set(wos.map((w: any) => w.job_id).filter(Boolean)),
      ] as number[];
      const verbIds = [
        ...new Set(wos.map((w: any) => w.activity_verb).filter(Boolean)),
      ] as number[];

      const [scopeRes, jobRes, verbRes] = await Promise.all([
        scopeIds.length
          ? supabase
              .from("tbl_scope_items")
              .select("scope_item_id, item_name, is_general")
              .in("scope_item_id", scopeIds)
          : Promise.resolve({ data: [] as any[] }),
        jobIds.length
          ? supabase
              .from("tbl_production_plan")
              .select("job_id, job_number, job_name, event_date")
              .in("job_id", jobIds)
          : Promise.resolve({ data: [] as any[] }),
        verbIds.length
          ? supabase
              .from("tbl_master_lookups")
              .select("lookup_id, lookup_value")
              .in("lookup_id", verbIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (cancelled) return;

      const scopeMap: Record<
        number,
        { name: string; is_general: boolean }
      > = {};
      ((scopeRes as any).data || []).forEach((s: any) => {
        scopeMap[s.scope_item_id] = {
          name: s.item_name || "—",
          is_general: s.is_general === true,
        };
      });
      const jobMap: Record<
        number,
        { number: string; name: string; event_date: string | null }
      > = {};
      ((jobRes as any).data || []).forEach((j: any) => {
        jobMap[j.job_id] = {
          number: j.job_number || "—",
          name: j.job_name || "",
          event_date: j.event_date,
        };
      });
      const verbMap: Record<number, string> = {};
      ((verbRes as any).data || []).forEach((v: any) => {
        verbMap[v.lookup_id] = v.lookup_value;
      });

      const enriched: WOOption[] = wos.map((w: any) => ({
        work_order_id: w.work_order_id,
        description: w.description,
        scope_item_id: w.scope_item_id,
        scope_name: scopeMap[w.scope_item_id]?.name || "—",
        is_overhead: scopeMap[w.scope_item_id]?.is_general || false,
        job_id: w.job_id,
        job_number: jobMap[w.job_id]?.number || "—",
        job_name: jobMap[w.job_id]?.name || "",
        job_event_date: jobMap[w.job_id]?.event_date || null,
        activity_verb: w.activity_verb ? verbMap[w.activity_verb] || null : null,
        wo_sequence: w.wo_sequence ?? null,
        status: w.status,
      }));

      setAllWos(enriched);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ————————————————————————————————————————
  // Derived: job list, filtered
  // ————————————————————————————————————————
  const jobs = useMemo<JobOption[]>(() => {
    const map = new Map<number, JobOption>();
    allWos.forEach((wo) => {
      if (!map.has(wo.job_id)) {
        map.set(wo.job_id, {
          job_id: wo.job_id,
          job_number: wo.job_number,
          job_name: wo.job_name,
          event_date: wo.job_event_date,
          wo_count: 0,
          has_overhead: false,
        });
      }
      const j = map.get(wo.job_id)!;
      j.wo_count++;
      if (wo.is_overhead) j.has_overhead = true;
    });
    // Sort: task's job pinned, then by event date (nearest first, nulls last)
    return Array.from(map.values()).sort((a, b) => {
      if (a.job_id === task.job_id) return -1;
      if (b.job_id === task.job_id) return 1;
      if (!a.event_date && !b.event_date)
        return a.job_number.localeCompare(b.job_number);
      if (!a.event_date) return 1;
      if (!b.event_date) return -1;
      return (
        new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
      );
    });
  }, [allWos, task.job_id]);

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        j.job_number.toLowerCase().includes(q) ||
        j.job_name.toLowerCase().includes(q),
    );
  }, [jobs, jobSearch]);

  // ————————————————————————————————————————
  // Derived: WOs for selected job, grouped
  // ————————————————————————————————————————
  const wosForSelectedJob = useMemo(
    () => (selectedJobId ? allWos.filter((w) => w.job_id === selectedJobId) : []),
    [allWos, selectedJobId],
  );

  const filteredWos = useMemo(() => {
    const q = woSearch.trim().toLowerCase();
    if (!q) return wosForSelectedJob;
    return wosForSelectedJob.filter(
      (w) =>
        (w.description || "").toLowerCase().includes(q) ||
        w.scope_name.toLowerCase().includes(q) ||
        (w.activity_verb || "").toLowerCase().includes(q),
    );
  }, [wosForSelectedJob, woSearch]);

  const overheadWos = useMemo(
    () =>
      filteredWos
        .filter((w) => w.is_overhead)
        .sort((a, b) => {
          // Active first, Complete last; within each group, by wo_sequence.
          const ap = a.status === "Complete" ? 1 : 0;
          const bp = b.status === "Complete" ? 1 : 0;
          if (ap !== bp) return ap - bp;
          return (a.wo_sequence ?? 0) - (b.wo_sequence ?? 0);
        }),
    [filteredWos],
  );

  const wosByScope = useMemo(() => {
    const groups: Record<number, { name: string; wos: WOOption[] }> = {};
    filteredWos
      .filter((w) => !w.is_overhead)
      .forEach((wo) => {
        const key = wo.scope_item_id || 0;
        if (!groups[key]) groups[key] = { name: wo.scope_name, wos: [] };
        groups[key].wos.push(wo);
      });
    Object.values(groups).forEach((g) =>
      g.wos.sort((a, b) => {
        // Active first, Complete last; within each group, by wo_sequence.
        const ap = a.status === "Complete" ? 1 : 0;
        const bp = b.status === "Complete" ? 1 : 0;
        if (ap !== bp) return ap - bp;
        return (a.wo_sequence ?? 0) - (b.wo_sequence ?? 0);
      }),
    );
    return groups;
  }, [filteredWos]);

  const scopeGroupsSorted = useMemo(
    () => Object.entries(wosByScope).sort((a, b) => a[1].name.localeCompare(b[1].name)),
    [wosByScope],
  );

  // If user switches job and the selected WO isn't in the new job, clear it
  useEffect(() => {
    if (!selectedWoId) return;
    const wo = allWos.find((w) => w.work_order_id === selectedWoId);
    if (wo && wo.job_id !== selectedJobId) setSelectedWoId(null);
  }, [selectedJobId, selectedWoId, allWos]);

  // On first load, scroll the pre-routed WO into view — once only, so we don't
  // yank the pane when the PM clicks around afterwards.
  useEffect(() => {
    if (loading || didInitialScroll.current) return;
    if (
      task.work_order_id &&
      selectedWoId === task.work_order_id &&
      selectedWoRef.current
    ) {
      selectedWoRef.current.scrollIntoView({ block: "center" });
      didInitialScroll.current = true;
    }
  }, [loading, selectedWoId, task.work_order_id]);

  // ————————————————————————————————————————
  // Submit
  // ————————————————————————————————————————
  const handleSubmit = async () => {
    if (!selectedWoId) return;
    const hrs = parseFloat(routeHours);
    if (!hrs || hrs <= 0) {
      toast.error("Enter valid hours");
      return;
    }
    setSubmitting(true);
    try {
      const ctx = await getAuditContext(supabase);
      const wo = allWos.find((w) => w.work_order_id === selectedWoId);
      const { data: freelancer } = await supabase
        .from("tbl_freelancers")
        .select("day_rate, standard_day_hours")
        .eq("freelancer_id", task.freelancer_id)
        .single();
      const hourlyRate =
        freelancer && freelancer.standard_day_hours > 0
          ? freelancer.day_rate / freelancer.standard_day_hours
          : 0;

      await auditedInsert(
        ctx,
        "tbl_wo_time_entries",
        {
          work_order_id: selectedWoId,
          freelancer_id: task.freelancer_id,
          actual_hours: hrs,
          applied_hourly_rate: hourlyRate,
          entry_cost: hrs * hourlyRate,
          system_start_timestamp: task.worked_date
            ? task.worked_date + "T09:00:00"
            : null,
          actual_start_timestamp: task.worked_date
            ? task.worked_date + "T09:00:00"
            : null,
          system_end_timestamp: task.worked_date
            ? task.worked_date + "T17:00:00"
            : null,
          actual_end_timestamp: task.worked_date
            ? task.worked_date + "T17:00:00"
            : null,
          flag_note: routeNote.trim()
            ? `Routed: ${routeNote.trim()}`
            : wo?.is_overhead
              ? "Routed to job overhead"
              : "Routed from ad-hoc task",
        },
        wo?.job_id,
      );

      await supabase
        .from("tbl_tasks")
        .update({
          status: "routed",
          routed_to_wo_id: selectedWoId,
          routed_hours: hrs,
          reviewed_by: ctx.userId,
          reviewed_at: new Date().toISOString(),
          review_note: routeNote || null,
        })
        .eq("task_id", task.item_id);

      await notify({
        supabase,
        type: "task_reviewed",
        title: `Task routed: ${task.title}`,
        detail: `${formatHours(hrs)} \u2192 ${wo?.is_overhead ? "Job Overhead" : wo?.description?.slice(0, 60) || "WO"}${routeNote ? ` \u00b7 ${routeNote}` : ""}`,
        severity: "info",
        freelancerId: task.freelancer_id,
        woId: selectedWoId,
        jobId: wo?.job_id,
      });

      toast.success(
        wo?.is_overhead ? "Task routed to Job Overhead" : "Task routed to WO",
      );
      onSuccess();
    } catch {
      toast.error("Failed to route task");
    }
    setSubmitting(false);
  };

  const selectedJob = selectedJobId
    ? jobs.find((j) => j.job_id === selectedJobId)
    : null;

  const selectedWo = useMemo(
    () =>
      selectedWoId
        ? allWos.find((w) => w.work_order_id === selectedWoId) ?? null
        : null,
    [selectedWoId, allWos],
  );

  const hoursChanged =
    task.claimed_hours != null &&
    routeHours !== "" &&
    parseFloat(routeHours) !== task.claimed_hours;

  // ————————————————————————————————————————
  // Render
  // ————————————————————————————————————————
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col border border-subtle overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-subtle flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CornerDownRight className="h-4 w-4 text-starlight-blue" />
              <h3 className="text-base font-semibold text-navy">
                Route task to work order
              </h3>
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted flex-wrap">
              <span className="font-medium text-navy">{task.title}</span>
              <span>&middot;</span>
              <span>{task.freelancer_name}</span>
              {task.claimed_hours != null && (
                <>
                  <span>&middot;</span>
                  <span className="font-semibold text-navy">
                    {formatHours(task.claimed_hours)}
                  </span>
                </>
              )}
              {task.worked_date && (
                <>
                  <span>&middot;</span>
                  <span>{formatDate(task.worked_date)}</span>
                </>
              )}
            </div>
            {task.description && (
              <div className="mt-2 px-3 py-2 bg-surface-dim border-l-2 border-starlight-blue/60 rounded-r text-xs text-navy whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-0.5">
                  Freelancer&apos;s note
                </div>
                {task.description}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-mid rounded-lg text-muted hover:text-navy transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Two-pane body */}
        <div className="flex-1 flex min-h-0">
          {/* Job pane */}
          <div className="w-[340px] border-r border-subtle flex flex-col bg-surface-dim/30">
            <div className="p-3 border-b border-subtle shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search jobs..."
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                  autoFocus={!task.job_id}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-subtle rounded-lg focus:outline-none focus:ring-2 focus:ring-starlight-blue/30"
                />
              </div>
              <div className="mt-2 text-[10px] font-semibold text-muted uppercase tracking-wider flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                {filteredJobs.length} job
                {filteredJobs.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="px-3 py-8 text-xs text-muted text-center animate-pulse">
                  Loading jobs&hellip;
                </p>
              ) : filteredJobs.length === 0 ? (
                <p className="px-3 py-8 text-xs text-muted text-center">
                  No matching jobs
                </p>
              ) : (
                filteredJobs.map((job) => {
                  const isSelected = selectedJobId === job.job_id;
                  const isTaskJob = task.job_id === job.job_id;
                  return (
                    <button
                      key={job.job_id}
                      onClick={() => setSelectedJobId(job.job_id)}
                      className={
                        "w-full text-left px-3 py-2.5 border-l-2 transition-all " +
                        (isSelected
                          ? "bg-starlight-blue/10 border-l-starlight-blue"
                          : "border-l-transparent hover:bg-surface-dim")
                      }
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-semibold text-navy">
                          {job.job_number}
                        </span>
                        {isTaskJob && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-starlight-blue/15 text-starlight-blue rounded-full font-semibold uppercase tracking-wider">
                            Task&apos;s job
                          </span>
                        )}
                        {job.has_overhead && (
                          <span
                            title="This job has an Overhead bucket"
                            className="text-starlight-amber"
                          >
                            <Coins className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-navy mt-0.5 line-clamp-2 leading-snug">
                        {job.job_name || (
                          <span className="text-muted">Untitled job</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted">
                        {job.event_date ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-2.5 w-2.5" />
                            {formatDate(job.event_date)}
                          </span>
                        ) : (
                          <span className="italic">No date</span>
                        )}
                        <span>&middot;</span>
                        <span>
                          {job.wo_count} WO{job.wo_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* WO pane */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedJobId ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <div>
                  <Inbox className="h-10 w-10 text-muted mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-muted">
                    Select a job on the left to see its work orders
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-subtle shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search work orders in this job..."
                      value={woSearch}
                      onChange={(e) => setWoSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm bg-surface-dim border border-subtle rounded-lg focus:outline-none focus:ring-2 focus:ring-starlight-blue/30"
                    />
                  </div>
                  {selectedJob && (
                    <div className="mt-2 text-[10px] text-muted flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-navy">
                        {selectedJob.job_number}
                      </span>
                      <span>&middot;</span>
                      <span className="truncate">{selectedJob.job_name}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {/* Overhead bucket — pinned to top */}
                  {overheadWos.length > 0 && (
                    <div>
                      <div className="px-1 pb-1.5 text-[10px] font-semibold text-starlight-amber uppercase tracking-wider flex items-center gap-1.5">
                        <Coins className="h-3 w-3" />
                        Job Overhead
                      </div>
                      <div className="space-y-1.5">
                        {overheadWos.map((wo) => {
                          const isSel = selectedWoId === wo.work_order_id;
                          return (
                            <button
                              key={wo.work_order_id}
                              ref={isSel ? selectedWoRef : null}
                              onClick={() => setSelectedWoId(wo.work_order_id)}
                              className={
                                "w-full text-left p-3 rounded-lg border-2 transition-all " +
                                (isSel
                                  ? "bg-starlight-amber/15 border-starlight-amber shadow-sm"
                                  : "bg-starlight-amber/5 border-starlight-amber/30 hover:bg-starlight-amber/10 hover:border-starlight-amber/60") +
                                (wo.status === "Complete" && !isSel ? " opacity-60" : "")
                              }
                            >
                              <div className="flex items-start gap-2.5">
                                <Coins className="h-4 w-4 text-starlight-amber mt-0.5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-navy">
                                      Job Overhead
                                    </p>
                                    <span
                                      className={
                                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium " +
                                        statusClass(wo.status)
                                      }
                                    >
                                      {wo.status}
                                    </span>
                                  </div>
                                  {wo.description && (
                                    <p className="text-xs text-muted mt-1 line-clamp-2 leading-snug">
                                      {wo.description}
                                    </p>
                                  )}
                                  <p className="text-[10px] text-starlight-amber/80 mt-1.5 italic">
                                    Non-billable &middot; reduces job margin
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Regular WOs grouped by scope */}
                  {scopeGroupsSorted.map(([scopeId, group]) => (
                    <div key={scopeId}>
                      <div className="px-1 pb-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">
                        {group.name}
                      </div>
                      <div className="space-y-1.5">
                        {group.wos.map((wo) => {
                          const isSel = selectedWoId === wo.work_order_id;
                          return (
                            <button
                              key={wo.work_order_id}
                              ref={isSel ? selectedWoRef : null}
                              onClick={() => setSelectedWoId(wo.work_order_id)}
                              className={
                                "w-full text-left p-3 rounded-lg border transition-all " +
                                (isSel
                                  ? "bg-starlight-blue/10 border-starlight-blue shadow-sm"
                                  : "bg-surface-dim/50 border-subtle hover:bg-surface-dim hover:border-starlight-blue/30") +
                                (wo.status === "Complete" && !isSel ? " opacity-60" : "")
                              }
                            >
                              <div className="flex items-start gap-2.5">
                                <div className="flex flex-col items-center shrink-0 pt-0.5 w-14">
                                  {wo.activity_verb && (
                                    <span className="text-[9px] font-bold text-navy/80 uppercase tracking-wider">
                                      {wo.activity_verb}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-navy leading-snug line-clamp-2">
                                    {wo.description || (
                                      <span className="italic text-muted">
                                        No description
                                      </span>
                                    )}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <span
                                      className={
                                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium " +
                                        statusClass(wo.status)
                                      }
                                    >
                                      {wo.status}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {overheadWos.length === 0 &&
                    scopeGroupsSorted.length === 0 &&
                    !woSearch && (
                      <p className="py-10 text-sm text-muted text-center">
                        No work orders in this job.
                      </p>
                    )}
                  {overheadWos.length === 0 &&
                    scopeGroupsSorted.length === 0 &&
                    woSearch && (
                      <p className="py-10 text-sm text-muted text-center">
                        No work orders match &ldquo;{woSearch}&rdquo;
                      </p>
                    )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer — hours, note, actions */}
        <div className="px-6 py-4 border-t border-subtle bg-surface-dim flex items-end gap-3 shrink-0 flex-wrap">
          <div className="w-full -mb-1">
            {selectedWo ? (
              <p className="text-xs text-navy">
                <CornerDownRight className="inline h-3 w-3 text-starlight-blue mr-1 -mt-0.5" />
                <span className="text-muted">Routing to: </span>
                <span className="font-semibold">
                  {selectedWo.is_overhead
                    ? "Job Overhead"
                    : selectedWo.scope_name}
                </span>
                {selectedWo.description ? (
                  <span className="text-muted"> — {selectedWo.description}</span>
                ) : null}
              </p>
            ) : (
              <p className="text-xs text-muted italic">
                Select a work order above to route this time
              </p>
            )}
          </div>
          <div className="shrink-0">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Hours
            </label>
            <input
              type="number"
              step="0.25"
              min="0"
              value={routeHours}
              onChange={(e) => setRouteHours(e.target.value)}
              className="w-24 px-3 py-2 bg-surface border border-subtle rounded-lg text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-starlight-blue/30"
            />
            {hoursChanged && (
              <p className="text-[10px] text-starlight-amber mt-1">
                Claimed: {formatHours(task.claimed_hours!)}
              </p>
            )}
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">
              Note to freelancer (optional)
            </label>
            <input
              type="text"
              value={routeNote}
              onChange={(e) => setRouteNote(e.target.value)}
              placeholder="e.g. Good to know this is on overhead — keep logging here for load days"
              className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue/30"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedWoId || submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-starlight-blue text-white rounded-lg hover:bg-starlight-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                "Routing\u2026"
              ) : (
                <>
                  <CornerDownRight className="h-4 w-4" />
                  Route &amp; create entry
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
