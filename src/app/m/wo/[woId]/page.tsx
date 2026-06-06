"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatHours } from "@/lib/format-hours";
import { uploadToOneDrive, jobFolder, woPhotoName, getOneDriveUrl } from "@/lib/onedrive-client";
import { ArrowLeft, Play, UserPlus, Clock, CheckCircle2, Camera, AlertTriangle, Users, Paintbrush, ImageIcon } from "lucide-react";
import { MobileWODocs } from "@/components/mobile-wo-docs";
import { LogSheet, type LogSheetData } from "@/components/log-sheet";
import { WOStepsPanel } from "@/components/wo-steps-panel";
import { notify } from "@/lib/notifications";
import { toast } from "sonner";
import Link from "next/link";
import { getAuditContext, auditedUpdate, auditedInsert } from "@/lib/audit";

interface WODetail {
  work_order_id: number;
  job_id: number | null;
  description: string | null;
  estimated_duration_hrs: number | null;
  status: string;
  activity_label: string;
  scope_name: string;
  job_name: string;
  job_number: string;
  complexity_construction: string | null;
  finish_relative: string | null;
  paint_notes: string | null;
  completion_photo_path: string | null;
}

interface LinkedItem {
  item_id: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  finish_required: string | null;
}

interface TimeEntryInfo {
  entry_id: number;
  freelancer_id: number;
  freelancer_name: string;
  system_start_timestamp: string;
  system_end_timestamp: string | null;
  actual_hours: number | null;
}

interface LatestProposal {
  proposal_id: number;
  freelancer_id: number;
  freelancer_name: string;
  completion_photo_path: string | null;
  proposed_note: string | null;
  status: "awaiting_confirmation" | "confirmed" | "undone" | "withdrawn";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export default function MobileWODetail() {
  const params = useParams();
  const router = useRouter();
  const woId = Number(params.woId);
  const supabase = createClient();

  const [wo, setWo] = useState<WODetail | null>(null);
  const [entries, setEntries] = useState<TimeEntryInfo[]>([]);
  const [items, setItems] = useState<LinkedItem[]>([]);
  const [myId, setMyId] = useState(0);
  const [myName, setMyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Log Hours sheet
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [defaultLogHours, setDefaultLogHours] = useState(0);

  // Mark Complete
  const [showComplete, setShowComplete] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [completionPhotoUrl, setCompletionPhotoUrl] = useState<string | null>(null);
  const [proposedNote, setProposedNote] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);

  // Confirmation workflow
  const [latestProposal, setLatestProposal] = useState<LatestProposal | null>(null);

  const loadWO = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/m/login"); return; }
    setMyId(user.user_metadata?.freelancer_id || 0);
    const fId = user.user_metadata?.freelancer_id || 0;
    const { data: meData } = await supabase.from("tbl_freelancers").select("freelancer_name").eq("freelancer_id", fId).single();
    if (meData?.freelancer_name) setMyName(meData.freelancer_name);

    // Load WO
    const { data: woData } = await supabase
      .from("tbl_work_orders")
      .select("work_order_id, description, estimated_duration_hrs, status, activity_verb, scope_item_id, job_id, complexity_construction, finish_relative, paint_notes, completion_photo_path")
      .eq("work_order_id", woId)
      .single();

    if (!woData) { setLoading(false); return; }

    // Load context
    const [scopeRes, jobRes, actRes, timeRes, propRes, linkRes] = await Promise.all([
      supabase.from("tbl_scope_items").select("item_name").eq("scope_item_id", woData.scope_item_id).single(),
      supabase.from("tbl_production_plan").select("job_name, job_number").eq("job_id", woData.job_id).single(),
      supabase.from("tbl_wo_activities").select("activity_id, sequence").eq("work_order_id", woId).order("sequence"),
      supabase.from("tbl_wo_time_entries").select("entry_id, freelancer_id, system_start_timestamp, system_end_timestamp, actual_hours").eq("work_order_id", woId).is("archived_at", null).order("system_start_timestamp"),
      supabase.from("tbl_wo_completion_proposals").select("proposal_id, freelancer_id, completion_photo_path, proposed_note, status, review_note, reviewed_at, created_at").eq("work_order_id", woId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("tbl_jobitem_workorder").select("job_item_id").eq("work_order_id", woId),
    ]);

    // Linked job items (what physically gets built) — via the jobitem↔WO junction.
    const itemIds = [...new Set((linkRes.data || []).map((l: any) => l.job_item_id).filter(Boolean))] as number[];
    const { data: itemRows } = itemIds.length > 0
      ? await supabase.from("tbl_job_items").select("item_id, description, quantity, unit, finish_required").in("item_id", itemIds).order("item_id")
      : { data: [] };
    setItems((itemRows || []).map((it: any) => ({
      item_id: it.item_id,
      description: it.description || "Item",
      quantity: it.quantity,
      unit: it.unit,
      finish_required: it.finish_required,
    })));

    // Activity label
    const actIds = (actRes.data || []).map((a: any) => a.activity_id);
    if (woData.activity_verb && !actIds.includes(woData.activity_verb)) actIds.push(woData.activity_verb);
    const { data: lookups } = actIds.length > 0
      ? await supabase.from("tbl_master_lookups").select("lookup_id, lookup_value").in("lookup_id", actIds)
      : { data: [] };
    const lk: Record<number, string> = {};
    (lookups || []).forEach((l: any) => { lk[l.lookup_id] = l.lookup_value; });

    let label = "No Activity";
    if (actRes.data && actRes.data.length > 0) {
      label = actRes.data.map((a: any) => lk[a.activity_id] || "?").join(" + ");
    } else if (woData.activity_verb && lk[woData.activity_verb]) {
      label = lk[woData.activity_verb];
    }

    // Freelancer names for time entries and proposal
    const fIds = [...new Set((timeRes.data || []).map((t: any) => t.freelancer_id))];
    if (propRes.data?.freelancer_id && !fIds.includes(propRes.data.freelancer_id)) {
      fIds.push(propRes.data.freelancer_id);
    }
    const { data: frs } = fIds.length > 0
      ? await supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", fIds)
      : { data: [] };
    const fMap: Record<number, string> = {};
    (frs || []).forEach((f: any) => { fMap[f.freelancer_id] = f.freelancer_name; });

    setWo({
      work_order_id: woData.work_order_id,
      job_id: woData.job_id,
      description: woData.description,
      estimated_duration_hrs: woData.estimated_duration_hrs,
      status: woData.status,
      activity_label: label,
      scope_name: scopeRes.data?.item_name || "—",
      job_name: jobRes.data?.job_name || "—",
      job_number: jobRes.data?.job_number || "—",
      complexity_construction: woData.complexity_construction,
      finish_relative: woData.finish_relative,
      paint_notes: woData.paint_notes || null,
      completion_photo_path: woData.completion_photo_path || null,
    });

    setEntries((timeRes.data || []).map((t: any) => ({
      ...t,
      freelancer_name: fMap[t.freelancer_id] || "Unknown",
    })));

    if (propRes.data) {
      setLatestProposal({
        ...propRes.data,
        freelancer_name: fMap[propRes.data.freelancer_id] || "Unknown",
      } as LatestProposal);
    } else {
      setLatestProposal(null);
    }

    setLoading(false);
  }, [woId]);

  useEffect(() => { loadWO(); }, [loadWO]);

  // Load completion photo URL
  useEffect(() => {
    if (wo?.completion_photo_path) {
      getOneDriveUrl(wo.completion_photo_path).then(setCompletionPhotoUrl).catch(() => {});
    }
  }, [wo?.completion_photo_path]);

  // Derived state
  const myOpenEntry = entries.find(e => e.freelancer_id === myId && !e.system_end_timestamp);
  const openEntries = entries.filter(e => !e.system_end_timestamp);

  // ================================================================
  // ACTIONS
  // ================================================================

  // Auto-close any open ad-hoc tasks (tbl_tasks with in_progress)
  const closeOpenTasks = async () => {
    const { data: openTasks } = await supabase
      .from("tbl_tasks")
      .select("task_id, title, started_at")
      .eq("freelancer_id", myId)
      .eq("status", "in_progress");
    if (!openTasks || openTasks.length === 0) return;
    for (const task of openTasks) {
      const startMs = new Date(task.started_at).getTime();
      const elapsedHrs = Math.max(0.25, Math.ceil(((Date.now() - startMs) / 3600000) * 4) / 4);
      await supabase.from("tbl_tasks").update({
        status: "pending",
        hours: elapsedHrs,
        logged_at: new Date().toISOString(),
      }).eq("task_id", task.task_id);
      toast.success(`Auto-logged ${formatHours(elapsedHrs)} for "${task.title}"`);
    }
  };

  // Auto-stop any open WO time entries for this freelancer (on OTHER work orders)
  const autoStopOpenEntries = async () => {
    if (!myId) return;
    const { data: openEntries } = await supabase
      .from("tbl_wo_time_entries")
      .select("entry_id, system_start_timestamp, work_order_id")
      .eq("freelancer_id", myId)
      .is("system_end_timestamp", null)
      .is("archived_at", null);
    if (!openEntries || openEntries.length === 0) return;

    const { data: fr } = await supabase.from("tbl_freelancers")
      .select("day_rate, standard_day_hours").eq("freelancer_id", myId).single();
    const hourlyRate = fr ? (fr.day_rate || 0) / (fr.standard_day_hours || 8) : 0;
    const now = new Date().toISOString();

    for (const oe of openEntries) {
      // Skip if it's on the current WO (we're about to log those manually)
      if (oe.work_order_id === woId) continue;
      const startMs = oe.system_start_timestamp ? new Date(oe.system_start_timestamp).getTime() : Date.now();
      const hrs = Math.max(0.25, Math.ceil(((Date.now() - startMs) / 3600000) * 4) / 4);
      const cost = hrs * hourlyRate;
      await supabase.from("tbl_wo_time_entries").update({
        system_end_timestamp: now, actual_end_timestamp: now,
        actual_hours: hrs, applied_hourly_rate: hourlyRate, entry_cost: cost,
        flag_note: "Auto-stopped: started another WO",
      }).eq("entry_id", oe.entry_id);
      toast.success(`Auto-logged ${formatHours(hrs)} on previous task`);
    }
  };

  const handleStart = async () => {
    setActing(true);
    const now = new Date().toISOString();

    // Auto-close any open ad-hoc tasks + open WO entries on other WOs
    await closeOpenTasks();
    await autoStopOpenEntries();

    // Create time entry
    const ctx = await getAuditContext(supabase);
    await auditedInsert(ctx, "tbl_wo_time_entries", {
      work_order_id: woId,
      freelancer_id: myId,
      system_start_timestamp: now,
      actual_start_timestamp: now,
    }, wo?.job_id);

    // Move WO to In-Progress if Ready
    if (wo?.status === "Ready") {
      await auditedUpdate(ctx, "tbl_work_orders", woId, { status: "In-Progress" }, wo?.job_id);
    }

    // Notify: WO started
    await notify({ supabase, type: "wo_started", severity: "info",
      title: `${myName || "Someone"} started ${wo?.activity_label || "a task"}`,
      detail: `${wo?.scope_name || ""} — ${wo?.description || ""}`.trim(),
      freelancerId: myId, jobId: wo?.job_id || undefined, woId,
      actionUrl: `/workshop`,
    });

    await loadWO();
    setActing(false);
    toast.success("Started — clock is running");
  };

  const handleJoin = async () => {
    setActing(true);
    const now = new Date().toISOString();

    // Auto-close any open ad-hoc tasks + open WO entries on other WOs
    await closeOpenTasks();
    await autoStopOpenEntries();

    const ctx = await getAuditContext(supabase);
    await auditedInsert(ctx, "tbl_wo_time_entries", {
      work_order_id: woId,
      freelancer_id: myId,
      system_start_timestamp: now,
      actual_start_timestamp: now,
    }, wo?.job_id);

    await loadWO();
    setActing(false);
    toast.success("Joined — clock is running");
  };

  const handleLogHours = async (data: LogSheetData) => {
    if (!myOpenEntry) return;
    setActing(true);
    const now = new Date().toISOString();
    const hrs = data.hours;

    // Upload photos to OneDrive
    let photoNote = "";
    if (data.photos.length > 0) {
      try {
        const { uploadToOneDrive } = await import("@/lib/onedrive-client");
        for (const p of data.photos) {
          const ts = new Date().toISOString().split("T")[0];
          const safeName = (wo?.activity_label || "WO").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
          await uploadToOneDrive(p.file, `Workshop/${wo?.job_number || "Unknown"} - ${wo?.job_name || "Job"}/WO Photos`, `${ts}_${safeName}_${data.photos.indexOf(p) + 1}.jpg`);
        }
        photoNote = ` (${data.photos.length} photo${data.photos.length > 1 ? "s" : ""})`;
      } catch (err) { console.warn("Photo upload failed:", err); }
    }

    // Get freelancer rate
    const { data: fr } = await supabase
      .from("tbl_freelancers")
      .select("day_rate, standard_day_hours")
      .eq("freelancer_id", myId)
      .single();

    const hourlyRate = fr ? (fr.day_rate || 0) / (fr.standard_day_hours || 8) : 0;
    const cost = hrs * hourlyRate;

    await supabase.from("tbl_wo_time_entries").update({
      system_end_timestamp: now,
      actual_end_timestamp: now,
      actual_hours: hrs,
      applied_hourly_rate: hourlyRate,
      entry_cost: cost,
      flag_note: data.notes || null,
    }).eq("entry_id", myOpenEntry.entry_id);

    // Notify
    if (data.notes) {
      await notify({ supabase, type: "wo_flagged", severity: "warning",
        title: `${myName || "Someone"} flagged ${wo?.activity_label || "a task"}`,
        detail: data.notes, freelancerId: myId, jobId: wo?.job_id || undefined, woId, actionUrl: `/review` });
    }
    await notify({ supabase, type: "hours_logged", severity: "info",
      title: `${myName || "Someone"} logged ${formatHours(hrs)} on ${wo?.activity_label || "a task"}${photoNote}`,
      detail: wo?.scope_name || "", freelancerId: myId, jobId: wo?.job_id || undefined, woId, actionUrl: `/review` });

    setShowLogSheet(false);
    await loadWO();
    setActing(false);
    toast.success(`${formatHours(hrs)} logged`);
  };

  const openLogSheet = () => {
    if (myOpenEntry) {
      const start = new Date(myOpenEntry.system_start_timestamp).getTime();
      const diffHrs = Math.ceil(((Date.now() - start) / 3600000) * 4) / 4;
      setDefaultLogHours(Math.max(diffHrs, 0.25));
    }
    setShowLogSheet(true);
  };

  const handleMarkComplete = async () => {
    if (!wo) return;
    setActing(true);
    const now = new Date().toISOString();

    // Upload photo if taken
    let photoPath: string | null = null;
    if (photoFile) {
      try {
        const ext = photoFile.name.split(".").pop() || "jpg";
        const folder = `${jobFolder(wo?.job_number || "unknown", wo?.job_name || "unknown")}/WO-Photos`;
        const fileName = woPhotoName(wo?.activity_label || "WO", wo?.scope_name || `scope`, ext) .replace(`.${ext}`, `-${woId}.${ext}`);
        const result = await uploadToOneDrive(photoFile, folder, fileName);
        photoPath = result.path;
      } catch (err: any) {
        alert("Photo upload failed: " + (err.message || "Check OneDrive configuration."));
        setActing(false);
        return;
      }
    }

    const ctx = await getAuditContext(supabase);
    const previousStatus = wo.status;
    const noteTrimmed = proposedNote.trim();

    // 1. Insert proposal row (snapshots previous status so PM Undo can revert)
    const { error: propErr } = await auditedInsert(ctx, "tbl_wo_completion_proposals", {
      work_order_id: woId,
      freelancer_id: myId,
      previous_wo_status: previousStatus,
      completion_photo_path: photoPath,
      proposed_note: noteTrimmed || null,
      status: "awaiting_confirmation",
    }, wo.job_id);

    if (propErr) {
      alert("Could not mark complete: " + (propErr.message || "unknown error"));
      setActing(false);
      return;
    }

    // 2. Flip WO to Complete (status visible immediately, PM confirms after)
    await auditedUpdate(ctx, "tbl_work_orders", woId, {
      status: "Complete",
      system_complete_timestamp: now,
      actual_complete_timestamp: now,
      completion_photo_path: photoPath,
    }, wo.job_id);

    // Notify PM: action goes to /review for the confirmation panel
    await notify({ supabase, type: "wo_completed", severity: "info",
      title: `${myName || "Someone"} marked ${wo?.activity_label || "a task"} complete`,
      detail: wo?.scope_name || "",
      freelancerId: myId, jobId: wo?.job_id || undefined, woId,
      actionUrl: `/review`,
    });

    // Reset sheet
    setShowComplete(false);
    setPhotoFile(null);
    setPhotoPreview(null);
    setProposedNote("");

    await loadWO();
    setActing(false);
    toast.success("Marked complete — awaiting PM confirmation");
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  // Pre-fill hours for elapsed time display
  const elapsedHours = myOpenEntry
    ? Math.round(((Date.now() - new Date(myOpenEntry.system_start_timestamp).getTime()) / 3600000) * 10) / 10
    : 0;

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-muted text-sm animate-pulse">Loading...</div>;
  }
  if (!wo) {
    return <div className="text-center py-12 text-muted">Work order not found</div>;
  }

  return (
    <div className="space-y-4">
      <Link href="/m" className="inline-flex items-center gap-1.5 text-sm text-muted">
        <ArrowLeft className="h-4 w-4" /> Back to Tasks
      </Link>

      {/* WO Header card */}
      <div className="bg-surface rounded-xl border border-subtle p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-navy">{wo.activity_label}</p>
            <p className="text-sm text-muted mt-0.5">{wo.scope_name}</p>
          </div>
          <span className={"text-xs px-2 py-1 rounded-full font-medium " + (
            wo.status === "Ready" ? "bg-surface-mid text-muted" :
            wo.status === "In-Progress" ? "bg-starlight-blue/10 text-starlight-blue" :
            wo.status === "Complete" ? "bg-starlight-green/10 text-starlight-green" : "bg-surface-mid text-muted"
          )}>
            {wo.status}
          </span>
        </div>

        {wo.description && <p className="text-sm text-muted mt-3 leading-relaxed">{wo.description}</p>}

        {/* Linked job items — what physically gets built. Compact, under the task. */}
        {items.length > 0 && (
          <div className="mt-3 border-t border-subtle pt-3">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
              Items ({items.length})
            </p>
            <ul className="space-y-1.5">
              {items.map(it => (
                <li key={it.item_id} className="text-sm leading-snug">
                  <span className="text-foreground">
                    {it.quantity != null && (
                      <span className="font-semibold text-navy">
                        {it.unit ? `${it.quantity} ${it.unit}` : `${it.quantity}×`}{" "}
                      </span>
                    )}
                    {it.description}
                  </span>
                  {it.finish_required && (
                    <span className="block text-xs italic text-muted mt-0.5">{it.finish_required}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3">
          <WOStepsPanel workOrderId={wo.work_order_id} jobId={wo.job_id} readOnly />
        </div>

        {wo.paint_notes && (
          <div className="mt-3 bg-starlight-amber/10 border border-starlight-amber/20 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Paintbrush className="h-3.5 w-3.5 text-starlight-amber" />
              <span className="text-[10px] font-semibold text-starlight-amber uppercase tracking-wider">Painting</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{wo.paint_notes}</p>
          </div>
        )}

        {/* Completion photo + state */}
        {completionPhotoUrl && (() => {
          const propStatus = latestProposal?.status;
          const isAwaiting = propStatus === "awaiting_confirmation";
          const isConfirmed = propStatus === "confirmed";
          const label = isAwaiting
            ? "Marked complete · Awaiting PM confirmation"
            : isConfirmed
              ? "Complete · Confirmed by PM"
              : "Completion Photo";
          const colorCls = isAwaiting
            ? "text-starlight-amber"
            : "text-starlight-green";
          return (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ImageIcon className={`h-3.5 w-3.5 ${colorCls}`} />
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${colorCls}`}>{label}</span>
              </div>
              {latestProposal && (
                <p className="text-xs text-muted mb-1.5">
                  By {latestProposal.freelancer_name}
                  {latestProposal.proposed_note && <> · "{latestProposal.proposed_note}"</>}
                </p>
              )}
              <img src={completionPhotoUrl} alt="Completion" className="w-full rounded-lg border border-subtle object-contain max-h-64" />
            </div>
          );
        })()}

        <div className="flex gap-4 mt-3 text-xs text-muted">
          <span className="font-mono">{wo.job_number}</span>
          {wo.estimated_duration_hrs && <span>{formatHours(wo.estimated_duration_hrs)} est.</span>}
          {wo.complexity_construction && <span>{wo.complexity_construction}</span>}
        </div>
      </div>

      {/* Who's working */}
      {openEntries.length > 0 && (
        <div className="bg-starlight-blue/5 rounded-xl border border-starlight-blue/20 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-starlight-blue font-medium">
            <Users className="h-4 w-4" />
            Currently working:
          </div>
          <div className="mt-1.5 space-y-1">
            {openEntries.map(e => (
              <p key={e.entry_id} className="text-sm text-muted">
                {e.freelancer_name}
                <span className="text-xs text-muted ml-2">
                  since {new Date(e.system_start_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* My timer if I'm on it */}
      {myOpenEntry && (
        <div className="bg-starlight-green/5 rounded-xl border border-starlight-green/20 px-4 py-4 text-center">
          <Clock className="h-6 w-6 text-starlight-green mx-auto" />
          <p className="text-2xl font-bold text-navy mt-2 font-mono">{formatHours(elapsedHours)}</p>
          <p className="text-xs text-muted mt-1">
            Started {new Date(myOpenEntry.system_start_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      )}

      {/* Undone by PM — needs another look */}
      {latestProposal?.status === "undone" && wo.status !== "Complete" && (
        <div className="bg-red-500/5 rounded-xl border border-red-500/30 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
            <AlertTriangle className="h-4 w-4" />
            PM undid the completion
          </div>
          <p className="text-xs text-muted mt-1">
            {latestProposal.freelancer_name} marked this complete, but it needs another look.
          </p>
          {latestProposal.review_note && (
            <p className="text-sm text-foreground mt-2 italic">"{latestProposal.review_note}"</p>
          )}
          <p className="text-xs text-muted mt-2">Re-do the work and mark complete again.</p>
        </div>
      )}

      {/* ACTION BUTTONS */}
      <div className="space-y-3 pt-2">
        {/* START — Ready WO, I'm not on it */}
        {wo.status === "Ready" && !myOpenEntry && (
          <button
            onClick={handleStart}
            disabled={acting}
            className="w-full py-4 bg-starlight-blue text-white text-lg font-semibold rounded-xl active:bg-navy transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <Play className="h-6 w-6" /> START
          </button>
        )}

        {/* JOIN — In-Progress or Complete, I have no open entry */}
        {(wo.status === "In-Progress" || wo.status === "Complete") && !myOpenEntry && (
          <button
            onClick={handleJoin}
            disabled={acting}
            className="w-full py-4 bg-starlight-amber text-white text-lg font-semibold rounded-xl active:bg-starlight-amber transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <UserPlus className="h-6 w-6" /> {wo.status === "Complete" ? "LOG TIME" : "JOIN"}
          </button>
        )}

        {/* LOG MY HOURS — I have an open entry */}
        {myOpenEntry && (
          <button
            onClick={openLogSheet}
            disabled={acting}
            className="w-full py-4 bg-navy text-white text-lg font-semibold rounded-xl active:bg-navy/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <Clock className="h-6 w-6" /> LOG MY HOURS
          </button>
        )}

        {/* MARK COMPLETE — anything not already Complete, no open timer */}
        {wo.status !== "Complete" && !myOpenEntry && (
          <button
            onClick={() => setShowComplete(true)}
            className="w-full py-4 bg-starlight-green text-white text-lg font-semibold rounded-xl active:bg-starlight-green transition-colors flex items-center justify-center gap-3"
          >
            <CheckCircle2 className="h-6 w-6" /> MARK COMPLETE
          </button>
        )}
      </div>

      {/* Completed entries log */}
      {entries.filter(e => e.system_end_timestamp).length > 0 && (
        <div className="bg-surface rounded-xl border border-subtle p-4">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Time Log</h3>
          {entries.filter(e => e.system_end_timestamp).map(e => (
            <div key={e.entry_id} className="flex justify-between py-1.5 text-sm border-b border-subtle last:border-0">
              <span className="text-muted">{e.freelancer_name}</span>
              <span className="font-mono text-navy">{e.actual_hours ? formatHours(e.actual_hours) : "—"}</span>
            </div>
          ))}
        </div>
      )}

      {/* Documents — drawings, references, 3D models, cut lists */}
      <MobileWODocs workOrderId={woId} />

      {/* ============ LOG HOURS SHEET ============ */}
      <LogSheet
        open={showLogSheet}
        onClose={() => setShowLogSheet(false)}
        onSubmit={handleLogHours}
        contextLabel={wo?.activity_label || "Work Order"}
        contextSublabel={`${wo?.job_number || ""} · ${wo?.scope_name || ""}`}
        defaultHours={defaultLogHours}
        notesPlaceholder="Material arrived warped, needed extra time..."
        submitting={acting}
      />

      {/* ============ MARK COMPLETE SHEET ============ */}
      {showComplete && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end justify-center">
          <div className="bg-surface w-full max-w-lg rounded-t-2xl p-6 pb-10 space-y-4">
            <h2 className="text-lg font-bold text-navy">Mark Complete</h2>
            <p className="text-sm text-muted">Take a completion photo of the finished work.</p>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              className="hidden"
            />

            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="Completion" className="w-full h-48 object-cover rounded-xl" />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => cameraRef.current?.click()}
                className="w-full py-8 border-2 border-dashed border-subtle rounded-xl flex flex-col items-center gap-2 text-muted active:bg-surface-dim"
              >
                <Camera className="h-8 w-8" />
                <span className="text-sm">Tap to take photo</span>
              </button>
            )}

            <textarea
              value={proposedNote}
              onChange={(e) => setProposedNote(e.target.value)}
              placeholder="Optional note for PM (e.g. paint touch-up still needed, used different timber, etc.)"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-surface-mid border border-subtle rounded-lg resize-none placeholder:text-muted focus:outline-none focus:border-starlight-blue"
            />

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowComplete(false); setPhotoFile(null); setPhotoPreview(null); setProposedNote(""); }}
                className="flex-1 py-3 text-muted bg-surface-mid rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkComplete}
                disabled={!photoFile || acting}
                className="flex-1 py-3 bg-starlight-green text-white rounded-xl font-semibold disabled:opacity-50"
              >
                {acting ? "Completing..." : "Complete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
