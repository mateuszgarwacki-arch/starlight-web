"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, statusClass } from "@/lib/utils";
import { Search, Coins, CalendarDays, Briefcase, Inbox } from "lucide-react";

// ————————————————————————————————————————————————————————
// Shared job → work-order picker.
//
// Extracted from RouteTaskModal so the same two-pane search (job list +
// scope-grouped work orders, overhead pinned, Complete dimmed) is reused
// everywhere a PM points time at a WO — review-inbox routing, the crew-page
// task router, the crew-page "Add Entry" dialog.
//
// Selection is held internally but reported up via onSelect(wo) so the host
// owns the hours/note/date footer and the submit. The host never needs the
// full WO list — onSelect hands back the whole WOOption.
//
// Completed jobs (tbl_production_plan.job_status = 'Complete') are hidden by
// default; a "Show completed" toggle reveals them. A pinned job (pinnedJobId)
// is always shown regardless of the toggle, so a modal opened against a
// finished job can't lose its own context.
// ————————————————————————————————————————————————————————

export interface WOOption {
  work_order_id: number;
  description: string | null;
  scope_item_id: number | null;
  scope_name: string;
  is_overhead: boolean;
  job_id: number;
  job_number: string;
  job_name: string;
  job_event_date: string | null;
  job_status: string | null;
  activity_verb: string | null;
  wo_sequence: number | null;
  status: string;
}

interface JobOption {
  job_id: number;
  job_number: string;
  job_name: string;
  event_date: string | null;
  job_status: string | null;
  wo_count: number;
  has_overhead: boolean;
}

interface Props {
  onSelect: (wo: WOOption | null) => void;
  selectedWoId: number | null;
  pinnedJobId?: number | null;
  pinnedBadgeLabel?: string;
  initialWoId?: number | null;
}

const isJobActive = (status: string | null) => status !== "Complete";

export function JobWorkOrderPicker({
  onSelect,
  selectedWoId,
  pinnedJobId = null,
  pinnedBadgeLabel,
  initialWoId = null,
}: Props) {
  const supabase = createClient();

  const [allWos, setAllWos] = useState<WOOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedJobId, setSelectedJobId] = useState<number | null>(pinnedJobId);
  const [jobSearch, setJobSearch] = useState("");
  const [woSearch, setWoSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const selectedWoRef = useRef<HTMLButtonElement | null>(null);
  const didInitialScroll = useRef(false);
  const didInitialSelect = useRef(false);

  // Load all routable WOs + their scope + job + activity verb.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: wos } = await supabase
        .from("tbl_work_orders")
        .select(
          "work_order_id, description, scope_item_id, job_id, status, activity_verb, wo_sequence",
        )
        // Include Complete so PMs can point late-arriving time at finished WOs.
        // Complete rows sort to the bottom of each group and dim (see sorts).
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
              .select("job_id, job_number, job_name, event_date, job_status")
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

      const scopeMap: Record<number, { name: string; is_general: boolean }> = {};
      ((scopeRes as any).data || []).forEach((s: any) => {
        scopeMap[s.scope_item_id] = {
          name: s.item_name || "—",
          is_general: s.is_general === true,
        };
      });
      const jobMap: Record<
        number,
        { number: string; name: string; event_date: string | null; status: string | null }
      > = {};
      ((jobRes as any).data || []).forEach((j: any) => {
        jobMap[j.job_id] = {
          number: j.job_number || "—",
          name: j.job_name || "",
          event_date: j.event_date,
          status: j.job_status ?? null,
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
        job_status: jobMap[w.job_id]?.status ?? null,
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

  // Jobs derived from the loaded WOs. Pinned job first, then by event date.
  const jobs = useMemo<JobOption[]>(() => {
    const map = new Map<number, JobOption>();
    allWos.forEach((wo) => {
      if (!map.has(wo.job_id)) {
        map.set(wo.job_id, {
          job_id: wo.job_id,
          job_number: wo.job_number,
          job_name: wo.job_name,
          event_date: wo.job_event_date,
          job_status: wo.job_status,
          wo_count: 0,
          has_overhead: false,
        });
      }
      const j = map.get(wo.job_id)!;
      j.wo_count++;
      if (wo.is_overhead) j.has_overhead = true;
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.job_id === pinnedJobId) return -1;
      if (b.job_id === pinnedJobId) return 1;
      if (!a.event_date && !b.event_date)
        return a.job_number.localeCompare(b.job_number);
      if (!a.event_date) return 1;
      if (!b.event_date) return -1;
      return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
    });
  }, [allWos, pinnedJobId]);

  const completedCount = useMemo(
    () =>
      jobs.filter((j) => !isJobActive(j.job_status) && j.job_id !== pinnedJobId)
        .length,
    [jobs, pinnedJobId],
  );

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    return jobs.filter((j) => {
      // Completed jobs hidden unless toggled on or pinned.
      if (!isJobActive(j.job_status) && !showCompleted && j.job_id !== pinnedJobId)
        return false;
      if (!q) return true;
      return (
        j.job_number.toLowerCase().includes(q) ||
        j.job_name.toLowerCase().includes(q)
      );
    });
  }, [jobs, jobSearch, showCompleted, pinnedJobId]);

  const wosForSelectedJob = useMemo(
    () =>
      selectedJobId ? allWos.filter((w) => w.job_id === selectedJobId) : [],
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
        const ap = a.status === "Complete" ? 1 : 0;
        const bp = b.status === "Complete" ? 1 : 0;
        if (ap !== bp) return ap - bp;
        return (a.wo_sequence ?? 0) - (b.wo_sequence ?? 0);
      }),
    );
    return groups;
  }, [filteredWos]);

  const scopeGroupsSorted = useMemo(
    () =>
      Object.entries(wosByScope).sort((a, b) =>
        a[1].name.localeCompare(b[1].name),
      ),
    [wosByScope],
  );

  // Initial selection from initialWoId: open its job + report up. Once only.
  useEffect(() => {
    if (loading || didInitialSelect.current) return;
    if (initialWoId) {
      const wo = allWos.find((w) => w.work_order_id === initialWoId);
      if (wo) {
        setSelectedJobId(wo.job_id);
        onSelect(wo);
      }
    }
    didInitialSelect.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialWoId, allWos]);

  // If the open job no longer contains the selected WO, clear the selection.
  useEffect(() => {
    if (!selectedWoId) return;
    const wo = allWos.find((w) => w.work_order_id === selectedWoId);
    if (wo && wo.job_id !== selectedJobId) onSelect(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId, selectedWoId, allWos]);

  // Scroll the pre-selected WO into view once (busy jobs push it below fold).
  useEffect(() => {
    if (loading || didInitialScroll.current) return;
    if (initialWoId && selectedWoId === initialWoId && selectedWoRef.current) {
      selectedWoRef.current.scrollIntoView({ block: "center" });
      didInitialScroll.current = true;
    }
  }, [loading, selectedWoId, initialWoId]);

  const selectedJob = selectedJobId
    ? jobs.find((j) => j.job_id === selectedJobId)
    : null;

  const handleWoClick = (wo: WOOption) => {
    onSelect(wo.work_order_id === selectedWoId ? null : wo);
  };

  return (
    <div className="flex min-h-0 h-full w-full">
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
              autoFocus={!pinnedJobId}
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-subtle rounded-lg focus:outline-none focus:ring-2 focus:ring-starlight-blue/30"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              {filteredJobs.length} job{filteredJobs.length !== 1 ? "s" : ""}
            </div>
            {completedCount > 0 && (
              <label className="flex items-center gap-1.5 text-[10px] text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.target.checked)}
                  className="rounded border-subtle"
                />
                Show completed ({completedCount})
              </label>
            )}
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
              const isPinned = pinnedJobId === job.job_id;
              const isComplete = !isJobActive(job.job_status);
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
                    {isPinned && pinnedBadgeLabel && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-starlight-blue/15 text-starlight-blue rounded-full font-semibold uppercase tracking-wider">
                        {pinnedBadgeLabel}
                      </span>
                    )}
                    {isComplete && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-surface-mid text-muted rounded-full font-semibold uppercase tracking-wider">
                        Complete
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
                          onClick={() => handleWoClick(wo)}
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
                          onClick={() => handleWoClick(wo)}
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
  );
}
