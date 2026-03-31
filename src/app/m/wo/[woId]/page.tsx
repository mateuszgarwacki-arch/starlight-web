"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { uploadToOneDrive, jobFolder, woPhotoName } from "@/lib/onedrive-client";
import { ArrowLeft, Play, UserPlus, Clock, CheckCircle2, Camera, AlertTriangle, Users, Paintbrush } from "lucide-react";
import { MobileWODocs } from "@/components/mobile-wo-docs";
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
}

interface TimeEntryInfo {
  entry_id: number;
  freelancer_id: number;
  freelancer_name: string;
  system_start_timestamp: string;
  system_end_timestamp: string | null;
  actual_hours: number | null;
}

export default function MobileWODetail() {
  const params = useParams();
  const router = useRouter();
  const woId = Number(params.woId);
  const supabase = createClient();

  const [wo, setWo] = useState<WODetail | null>(null);
  const [entries, setEntries] = useState<TimeEntryInfo[]>([]);
  const [myId, setMyId] = useState(0);
  const [myName, setMyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Log Hours sheet
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [logHours, setLogHours] = useState("");
  const [flagNote, setFlagNote] = useState("");

  // Mark Complete
  const [showComplete, setShowComplete] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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
      .select("work_order_id, description, estimated_duration_hrs, status, activity_verb, scope_item_id, job_id, complexity_construction, finish_relative, paint_notes")
      .eq("work_order_id", woId)
      .single();

    if (!woData) { setLoading(false); return; }

    // Load context
    const [scopeRes, jobRes, actRes, timeRes] = await Promise.all([
      supabase.from("tbl_scope_items").select("item_name").eq("scope_item_id", woData.scope_item_id).single(),
      supabase.from("tbl_production_plan").select("job_name, job_number").eq("job_id", woData.job_id).single(),
      supabase.from("tbl_wo_activities").select("activity_id, sequence").eq("work_order_id", woId).order("sequence"),
      supabase.from("tbl_wo_time_entries").select("entry_id, freelancer_id, system_start_timestamp, system_end_timestamp, actual_hours").eq("work_order_id", woId).is("archived_at", null).order("system_start_timestamp"),
    ]);

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

    // Freelancer names for time entries
    const fIds = [...new Set((timeRes.data || []).map((t: any) => t.freelancer_id))];
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
    });

    setEntries((timeRes.data || []).map((t: any) => ({
      ...t,
      freelancer_name: fMap[t.freelancer_id] || "Unknown",
    })));

    setLoading(false);
  }, [woId]);

  useEffect(() => { loadWO(); }, [loadWO]);

  // Derived state
  const myOpenEntry = entries.find(e => e.freelancer_id === myId && !e.system_end_timestamp);
  const allEntriesClosed = entries.length > 0 && entries.every(e => e.system_end_timestamp);
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
      const elapsedHrs = Math.max(0.5, Math.round(((Date.now() - startMs) / 3600000) * 2) / 2);
      await supabase.from("tbl_tasks").update({
        status: "pending",
        hours: elapsedHrs,
        logged_at: new Date().toISOString(),
      }).eq("task_id", task.task_id);
      toast.success(`Auto-logged ${elapsedHrs}h for "${task.title}"`);
    }
  };

  const handleStart = async () => {
    setActing(true);
    const now = new Date().toISOString();

    // Auto-close any open ad-hoc tasks
    await closeOpenTasks();

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

    // Auto-close any open ad-hoc tasks
    await closeOpenTasks();

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

  const handleLogHours = async () => {
    if (!myOpenEntry || !logHours) return;
    setActing(true);
    const now = new Date().toISOString();
    const hrs = parseFloat(logHours);

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
      flag_note: flagNote.trim() || null,
    }).eq("entry_id", myOpenEntry.entry_id);

    // Notify: hours logged (flag = warning, no flag = info)
    if (flagNote.trim()) {
      await notify({ supabase, type: "wo_flagged", severity: "warning",
        title: `${myName || "Someone"} flagged ${wo?.activity_label || "a task"}`,
        detail: flagNote.trim(),
        freelancerId: myId, jobId: wo?.job_id || undefined, woId,
        actionUrl: `/review`,
      });
    }
    await notify({ supabase, type: "hours_logged", severity: "info",
      title: `${myName || "Someone"} logged ${hrs}h on ${wo?.activity_label || "a task"}`,
      detail: wo?.scope_name || "",
      freelancerId: myId, jobId: wo?.job_id || undefined, woId,
      actionUrl: `/review`,
    });

    setShowLogSheet(false);
    setLogHours("");
    setFlagNote("");
    await loadWO();
    setActing(false);
    toast.success(`${hrs}h logged`);
  };

  const openLogSheet = () => {
    // Pre-fill hours from timestamps
    if (myOpenEntry) {
      const start = new Date(myOpenEntry.system_start_timestamp).getTime();
      const now = Date.now();
      const diffHrs = Math.round(((now - start) / 3600000) * 2) / 2; // round to 0.5
      setLogHours(String(Math.max(diffHrs, 0.5)));
    }
    setShowLogSheet(true);
  };

  const handleMarkComplete = async () => {
    setActing(true);
    const now = new Date().toISOString();

    // Upload photo if taken
    let photoPath = null;
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
    await auditedUpdate(ctx, "tbl_work_orders", woId, {
      status: "Complete",
      system_complete_timestamp: now,
      actual_complete_timestamp: now,
      completion_photo_path: photoPath,
    }, wo?.job_id);

    // Notify: WO completed
    await notify({ supabase, type: "wo_completed", severity: "info",
      title: `${myName || "Someone"} completed ${wo?.activity_label || "a task"}`,
      detail: wo?.scope_name || "",
      freelancerId: myId, jobId: wo?.job_id || undefined, woId,
      actionUrl: `/workshop`,
    });

    toast.success("Work order completed");
    router.push("/m");
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
    return <div className="flex items-center justify-center h-40 text-gray-400 text-sm animate-pulse">Loading...</div>;
  }
  if (!wo) {
    return <div className="text-center py-12 text-gray-400">Work order not found</div>;
  }

  return (
    <div className="space-y-4">
      <Link href="/m" className="inline-flex items-center gap-1.5 text-sm text-gray-400">
        <ArrowLeft className="h-4 w-4" /> Back to Tasks
      </Link>

      {/* WO Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-navy">{wo.activity_label}</p>
            <p className="text-sm text-gray-500 mt-0.5">{wo.scope_name}</p>
          </div>
          <span className={"text-xs px-2 py-1 rounded-full font-medium " + (
            wo.status === "Ready" ? "bg-gray-100 text-gray-600" :
            wo.status === "In-Progress" ? "bg-starlight-blue/10 text-starlight-blue" :
            wo.status === "Complete" ? "bg-starlight-green/10 text-starlight-green" : "bg-gray-100 text-gray-500"
          )}>
            {wo.status}
          </span>
        </div>

        {wo.description && <p className="text-sm text-gray-600 mt-3 leading-relaxed">{wo.description}</p>}

        {wo.paint_notes && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Paintbrush className="h-3.5 w-3.5 text-starlight-amber" />
              <span className="text-[10px] font-semibold text-starlight-amber uppercase tracking-wider">Painting</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{wo.paint_notes}</p>
          </div>
        )}

        <div className="flex gap-4 mt-3 text-xs text-gray-400">
          <span className="font-mono">{wo.job_number}</span>
          {wo.estimated_duration_hrs && <span>{wo.estimated_duration_hrs}h est.</span>}
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
              <p key={e.entry_id} className="text-sm text-gray-600">
                {e.freelancer_name}
                <span className="text-xs text-gray-400 ml-2">
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
          <p className="text-2xl font-bold text-navy mt-2 font-mono">{elapsedHours}h</p>
          <p className="text-xs text-gray-400 mt-1">
            Started {new Date(myOpenEntry.system_start_timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      )}

      {/* ACTION BUTTONS */}
      <div className="space-y-3 pt-2">
        {/* START — Ready WO, I'm not on it */}
        {wo.status === "Ready" && !myOpenEntry && (
          <button
            onClick={handleStart}
            disabled={acting}
            className="w-full py-4 bg-starlight-blue text-white text-lg font-semibold rounded-xl active:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <Play className="h-6 w-6" /> START
          </button>
        )}

        {/* JOIN — In-Progress, I have no open entry */}
        {wo.status === "In-Progress" && !myOpenEntry && (
          <button
            onClick={handleJoin}
            disabled={acting}
            className="w-full py-4 bg-starlight-amber text-white text-lg font-semibold rounded-xl active:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <UserPlus className="h-6 w-6" /> JOIN
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

        {/* MARK COMPLETE — all entries closed */}
        {allEntriesClosed && wo.status === "In-Progress" && (
          <button
            onClick={() => setShowComplete(true)}
            className="w-full py-4 bg-starlight-green text-white text-lg font-semibold rounded-xl active:bg-green-700 transition-colors flex items-center justify-center gap-3"
          >
            <CheckCircle2 className="h-6 w-6" /> MARK COMPLETE
          </button>
        )}
      </div>

      {/* Completed entries log */}
      {entries.filter(e => e.system_end_timestamp).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Time Log</h3>
          {entries.filter(e => e.system_end_timestamp).map(e => (
            <div key={e.entry_id} className="flex justify-between py-1.5 text-sm border-b border-gray-50 last:border-0">
              <span className="text-gray-600">{e.freelancer_name}</span>
              <span className="font-mono text-navy">{e.actual_hours || "—"}h</span>
            </div>
          ))}
        </div>
      )}

      {/* Documents — drawings, references, 3D models, cut lists */}
      <MobileWODocs workOrderId={woId} />

      {/* ============ LOG HOURS BOTTOM SHEET ============ */}
      {showLogSheet && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-2xl p-6 pb-10 space-y-4 animate-slide-up">
            <h2 className="text-lg font-bold text-navy">Log My Hours</h2>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Actual Hours *</label>
              <input
                type="number"
                step="0.5"
                value={logHours}
                onChange={(e) => setLogHours(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-xl text-center font-mono focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                autoFocus
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Flag Note (optional)</label>
              <input
                type="text"
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                placeholder="Material arrived warped, needed extra time..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                maxLength={200}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowLogSheet(false); setLogHours(""); setFlagNote(""); }}
                className="flex-1 py-3 text-gray-600 bg-gray-100 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleLogHours}
                disabled={!logHours || acting}
                className="flex-1 py-3 bg-navy text-white rounded-xl font-semibold disabled:opacity-50"
              >
                {acting ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MARK COMPLETE SHEET ============ */}
      {showComplete && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-2xl p-6 pb-10 space-y-4">
            <h2 className="text-lg font-bold text-navy">Mark Complete</h2>
            <p className="text-sm text-gray-500">Take a completion photo of the finished work.</p>

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
                className="w-full py-8 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center gap-2 text-gray-400 active:bg-gray-50"
              >
                <Camera className="h-8 w-8" />
                <span className="text-sm">Tap to take photo</span>
              </button>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowComplete(false); setPhotoFile(null); setPhotoPreview(null); }}
                className="flex-1 py-3 text-gray-600 bg-gray-100 rounded-xl font-medium"
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
