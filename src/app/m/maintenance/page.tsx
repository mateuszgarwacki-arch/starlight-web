"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import {
  Wrench, ChevronLeft, CheckCircle2, Circle, Flag,
  MapPin, Clock, Image, AlertCircle, Info, ChevronDown, Play,
} from "lucide-react";
import { toast } from "sonner";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import { notify } from "@/lib/notifications";

interface Asset {
  asset_id: number;
  name: string;
  location: string | null;
  description: string | null;
  task_count: number;
  open_flags: number;
  last_maintained: string | null;
  health_status: string;
}

interface Task {
  task_id: number;
  asset_id: number;
  description: string;
  instructions: string | null;
  frequency: string;
  estimated_minutes: number | null;
  due_status: string;
  last_completed: string | null;
}

interface AssetPhoto {
  photo_id: number;
  onedrive_path: string;
  caption: string | null;
  url?: string;
}

interface CheckItem {
  task_id: number;
  checked: boolean;
  checkedAt: number | null; // timestamp ms
  note: string;
  flagged: boolean;
  flagTitle: string;
  flagSeverity: string;
}

function healthDot(s: string) {
  if (s === "overdue") return "bg-starlight-red";
  if (s === "due_soon") return "bg-starlight-amber";
  return "bg-starlight-green";
}
function healthLabel(s: string) {
  if (s === "overdue") return "Overdue";
  if (s === "due_soon") return "Due soon";
  return "OK";
}
function dueLabel(s: string) {
  if (s === "overdue") return "Overdue";
  if (s === "due_soon") return "Due soon";
  if (s === "no_schedule") return "As needed";
  return "Done";
}
function dueDot(s: string) {
  if (s === "overdue") return "bg-starlight-red";
  if (s === "due_soon") return "bg-starlight-amber";
  if (s === "no_schedule") return "bg-surface-top";
  return "bg-starlight-green";
}
function fmtDuration(ms: number) {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs > 0 ? remSecs + "s" : ""}`.trim();
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}
function fmtTimer(ms: number) {
  const secs = Math.floor(ms / 1000) % 60;
  const mins = Math.floor(ms / 60000) % 60;
  const hrs = Math.floor(ms / 3600000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export default function MobileMaintenancePage() {
  const supabase = createClient();
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<number>(0);

  // Detail + timer state
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [photos, setPhotos] = useState<AssetPhoto[]>([]);
  const [showPhotos, setShowPhotos] = useState(false);
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");

  // Timer
  const [sessionStarted, setSessionStarted] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer tick
  useEffect(() => {
    if (sessionStarted && startTime > 0) {
      timerRef.current = setInterval(() => setElapsed(Date.now() - startTime), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [sessionStarted, startTime]);

  const loadAssets = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/m/login"); return; }
    setMyId(user.user_metadata?.freelancer_id || 0);
    const { data } = await supabase.from("qry_maintenance_asset_summary").select("*").order("name");
    if (data) {
      const sorted = [...(data as Asset[])].sort((a, b) => {
        const order = { overdue: 0, due_soon: 1, ok: 2 };
        return (order[a.health_status as keyof typeof order] ?? 2) - (order[b.health_status as keyof typeof order] ?? 2);
      });
      setAssets(sorted);
    }
    setLoading(false);
  }, []);

  const openAsset = useCallback(async (asset: Asset) => {
    setSelectedAsset(asset);
    setSessionStarted(false);
    setStartTime(0);
    setElapsed(0);
    const { data: taskData } = await supabase
      .from("qry_maintenance_task_status").select("*")
      .eq("asset_id", asset.asset_id).order("sort_order");
    const t = (taskData || []) as Task[];
    setTasks(t);
    setChecks(t.map(tk => ({ task_id: tk.task_id, checked: false, checkedAt: null, note: "", flagged: false, flagTitle: "", flagSeverity: "warning" })));
    const { data: photoData } = await supabase
      .from("tbl_maintenance_asset_photos").select("*")
      .eq("asset_id", asset.asset_id).order("sort_order");
    if (photoData) {
      const withUrls = await Promise.all(
        (photoData as AssetPhoto[]).map(async (p) => {
          try { const url = await getOneDriveUrl(p.onedrive_path); return { ...p, url }; }
          catch { return p; }
        })
      );
      setPhotos(withUrls);
    } else { setPhotos([]); }
    setSessionNotes("");
    setShowPhotos(false);
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const startSession = () => {
    const now = Date.now();
    setStartTime(now);
    setSessionStarted(true);
    setElapsed(0);
  };

  const toggleCheck = (taskId: number) => {
    setChecks(prev => prev.map(c => {
      if (c.task_id !== taskId) return c;
      if (c.checked) return { ...c, checked: false, checkedAt: null };
      return { ...c, checked: true, checkedAt: Date.now() };
    }));
  };
  const setCheckNote = (taskId: number, note: string) => {
    setChecks(prev => prev.map(c => c.task_id === taskId ? { ...c, note } : c));
  };
  const toggleFlag = (taskId: number) => {
    setChecks(prev => prev.map(c => c.task_id === taskId ? { ...c, flagged: !c.flagged, flagTitle: c.flagged ? "" : c.flagTitle } : c));
  };
  const setFlagTitle = (taskId: number, title: string) => {
    setChecks(prev => prev.map(c => c.task_id === taskId ? { ...c, flagTitle: title } : c));
  };

  // Derive per-item duration from tick timestamps
  const getItemDuration = (index: number): number | null => {
    const c = checks[index];
    if (!c?.checkedAt) return null;
    // Find previous checked item's timestamp (by checkedAt order)
    const checkedBefore = checks
      .filter((x, i) => i !== index && x.checkedAt && x.checkedAt < c.checkedAt!)
      .sort((a, b) => b.checkedAt! - a.checkedAt!);
    const prevTime = checkedBefore.length > 0 ? checkedBefore[0].checkedAt! : startTime;
    return c.checkedAt - prevTime;
  };

  const completeMaintenance = async () => {
    if (!selectedAsset) return;
    const checkedItems = checks.filter(c => c.checked);
    if (checkedItems.length === 0) { toast.error("Tick at least one item"); return; }
    setSubmitting(true);
    try {
      const startedAt = new Date(startTime).toISOString();
      const completedAt = new Date().toISOString();
      const totalMinutes = Math.round((Date.now() - startTime) / 60000);

      const { data: log } = await supabase.from("tbl_maintenance_logs").insert({
        asset_id: selectedAsset.asset_id,
        performed_by: myId || null,
        started_at: startedAt,
        completed_at: completedAt,
        status: "completed",
        notes: sessionNotes.trim() || null,
      }).select("log_id").single();
      if (!log) throw new Error("Failed to create log");

      const checkRows = checkedItems.map(c => ({
        log_id: log.log_id,
        task_id: c.task_id,
        completed_at: c.checkedAt ? new Date(c.checkedAt).toISOString() : completedAt,
        note: c.note.trim() || null,
        flagged: c.flagged,
        completed_by: myId || null,
      }));
      const { data: insertedChecks } = await supabase.from("tbl_maintenance_checks").insert(checkRows).select("check_id, task_id");

      const flaggedItems = checkedItems.filter(c => c.flagged && c.flagTitle.trim());
      for (const fi of flaggedItems) {
        const checkRow = (insertedChecks || []).find((ic: any) => ic.task_id === fi.task_id);
        await supabase.from("tbl_maintenance_flags").insert({
          asset_id: selectedAsset.asset_id,
          check_id: checkRow?.check_id || null,
          raised_by: myId || null,
          severity: fi.flagSeverity || "warning",
          title: fi.flagTitle.trim(),
          status: "open",
          created_at: new Date().toISOString(),
        });
        try {
          await notify({
            supabase,
            type: "wo_flagged",
            severity: fi.flagSeverity === "urgent" ? "urgent" : "warning",
            title: `Maintenance flag: ${selectedAsset.name}`,
            detail: fi.flagTitle.trim(),
            actionUrl: "/maintenance",
          });
        } catch {}
      }

      if (timerRef.current) clearInterval(timerRef.current);
      toast.success(`Maintenance logged: ${checkedItems.length} item${checkedItems.length > 1 ? "s" : ""} in ${totalMinutes < 1 ? "<1" : totalMinutes} min${flaggedItems.length > 0 ? `, ${flaggedItems.length} flag${flaggedItems.length > 1 ? "s" : ""} raised` : ""}`);
      setSelectedAsset(null);
      setSessionStarted(false);
      loadAssets();
    } catch (err: any) {
      toast.error("Failed: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-40 text-muted text-sm animate-pulse">Loading...</div>;

  // ── Detail view ──
  if (selectedAsset) {
    const checkedCount = checks.filter(c => c.checked).length;

    // Pre-start: show asset info + Start button
    if (!sessionStarted) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedAsset(null)} className="p-1 text-muted"><ChevronLeft className="h-5 w-5" /></button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-navy">{selectedAsset.name}</h1>
              {selectedAsset.location && <p className="text-xs text-muted flex items-center gap-1"><MapPin className="h-3 w-3" />{selectedAsset.location}</p>}
            </div>
            <div className={`w-3 h-3 rounded-full ${healthDot(selectedAsset.health_status)}`} />
          </div>
          {selectedAsset.description && <p className="text-xs text-muted bg-surface rounded-xl border border-subtle px-4 py-3">{selectedAsset.description}</p>}
          {/* Photos */}
          {photos.length > 0 && (
            <>
              <button onClick={() => setShowPhotos(!showPhotos)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-surface rounded-xl border border-subtle text-left">
                <span className="text-xs font-medium text-muted flex items-center gap-1.5"><Image className="h-3.5 w-3.5 text-muted" />Reference photos ({photos.length})</span>
                <ChevronDown className={`h-4 w-4 text-muted transition-transform ${showPhotos ? "rotate-180" : ""}`} />
              </button>
              {showPhotos && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {photos.map(p => (
                    <div key={p.photo_id} className="shrink-0 w-32">
                      {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt={p.caption || ""} className="w-32 h-24 object-cover rounded-lg border border-subtle" /></a>
                        : <div className="w-32 h-24 bg-surface-mid rounded-lg flex items-center justify-center"><Image className="h-5 w-5 text-faint" /></div>}
                      {p.caption && <p className="text-[9px] text-muted mt-1 truncate">{p.caption}</p>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {/* Task preview */}
          <div className="bg-surface rounded-xl border border-subtle px-4 py-3">
            <p className="text-xs font-semibold text-navy mb-2">{tasks.length} task{tasks.length !== 1 ? "s" : ""} to check</p>
            {tasks.slice(0, 5).map(t => (
              <div key={t.task_id} className="flex items-center gap-2 py-1 text-xs text-muted">
                <span className={`w-1.5 h-1.5 rounded-full ${dueDot(t.due_status)}`} />
                <span className="flex-1">{t.description}</span>
                <span className={t.due_status === "overdue" ? "text-starlight-red text-[10px] font-medium" : "text-[10px] text-muted"}>{dueLabel(t.due_status)}</span>
              </div>
            ))}
            {tasks.length > 5 && <p className="text-[10px] text-muted mt-1">+ {tasks.length - 5} more</p>}
          </div>
          {/* Start button */}
          <button onClick={startSession}
            className="w-full py-4 bg-starlight-blue text-white font-semibold rounded-xl hover:bg-navy active:bg-navy transition-colors flex items-center justify-center gap-2 shadow-lg">
            <Play className="h-5 w-5" /> Start Maintenance
          </button>
        </div>
      );
    }

    // Active session: timer + checklist
    return (
      <div className="space-y-3">
        {/* Header + timer */}
        <div className="flex items-center gap-3">
          <button onClick={() => { if (confirm("Abandon this maintenance session?")) { if (timerRef.current) clearInterval(timerRef.current); setSelectedAsset(null); setSessionStarted(false); } }}
            className="p-1 text-muted"><ChevronLeft className="h-5 w-5" /></button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-navy">{selectedAsset.name}</h1>
          </div>
          {/* Live timer */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-starlight-blue/10 rounded-full">
            <Clock className="h-3.5 w-3.5 text-starlight-blue animate-pulse" />
            <span className="text-sm font-mono font-semibold text-starlight-blue">{fmtTimer(elapsed)}</span>
          </div>
        </div>

        {/* Photos (collapsed) */}
        {photos.length > 0 && (
          <>
            <button onClick={() => setShowPhotos(!showPhotos)}
              className="w-full flex items-center justify-between px-3 py-2 bg-surface rounded-lg border border-subtle text-left">
              <span className="text-[11px] text-muted flex items-center gap-1"><Image className="h-3 w-3" />Photos ({photos.length})</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted transition-transform ${showPhotos ? "rotate-180" : ""}`} />
            </button>
            {showPhotos && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map(p => (
                  <div key={p.photo_id} className="shrink-0">
                    {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt="" className="w-28 h-20 object-cover rounded-lg border" /></a>
                      : <div className="w-28 h-20 bg-surface-mid rounded-lg" />}
                    {p.caption && <p className="text-[8px] text-muted mt-0.5 w-28 truncate">{p.caption}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Progress bar */}
        <div className="bg-surface rounded-lg border border-subtle px-3 py-2">
          <div className="flex items-center justify-between text-[10px] text-muted mb-1">
            <span>{checkedCount} of {tasks.length} complete</span>
            <span>{fmtTimer(elapsed)}</span>
          </div>
          <div className="w-full h-1.5 bg-surface-mid rounded-full overflow-hidden">
            <div className="h-full bg-starlight-green rounded-full transition-all duration-300" style={{ width: `${tasks.length > 0 ? (checkedCount / tasks.length) * 100 : 0}%` }} />
          </div>
        </div>

        {/* Checklist */}
        <div className="bg-surface rounded-xl border border-subtle overflow-hidden">
          <div className="divide-y divide-subtle">
            {tasks.map((task, i) => {
              const check = checks[i];
              if (!check) return null;
              const itemDuration = getItemDuration(i);
              return (
                <div key={task.task_id} className={`px-4 py-3 transition-colors ${check.checked ? "bg-starlight-green/10/30" : ""}`}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggleCheck(task.task_id)} className="pt-0.5 shrink-0">
                      {check.checked
                        ? <CheckCircle2 className="h-6 w-6 text-starlight-green" />
                        : <Circle className="h-6 w-6 text-faint" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${check.checked ? "text-muted line-through" : "text-navy font-medium"}`}>{task.description}</p>
                      {task.instructions && !check.checked && <p className="text-[10px] text-muted mt-0.5">{task.instructions}</p>}
                      <div className="flex items-center gap-2 mt-1 text-[10px]">
                        <span className={`flex items-center gap-0.5 ${task.due_status === "overdue" ? "text-starlight-red font-medium" : task.due_status === "due_soon" ? "text-starlight-amber" : "text-muted"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dueDot(task.due_status)}`} />
                          {dueLabel(task.due_status)}
                        </span>
                        <span className="text-faint capitalize">{task.frequency.replace("_", " ")}</span>
                        {check.checked && itemDuration != null && (
                          <span className="text-starlight-blue font-medium flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />{fmtDuration(itemDuration)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => toggleFlag(task.task_id)}
                      className={`p-2 rounded-lg transition-colors shrink-0 ${check.flagged ? "bg-starlight-red/10 text-starlight-red" : "text-faint"}`}>
                      <Flag className="h-4 w-4" />
                    </button>
                  </div>
                  {check.checked && (
                    <input value={check.note} onChange={e => setCheckNote(task.task_id, e.target.value)}
                      placeholder="Note (optional)..."
                      className="mt-2 ml-9 w-[calc(100%-2.25rem)] text-xs px-3 py-1.5 border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-starlight-blue bg-surface-dim" />
                  )}
                  {check.flagged && (
                    <div className="mt-2 ml-9 space-y-1.5">
                      <input value={check.flagTitle} onChange={e => setFlagTitle(task.task_id, e.target.value)}
                        placeholder="What's the issue? *"
                        className="w-[calc(100%-2.25rem)] text-xs px-3 py-1.5 border border-starlight-red/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-400 bg-starlight-red/10/30" />
                      <div className="flex items-center gap-2">
                        {(["info", "warning", "urgent"] as const).map(sev => (
                          <button key={sev} onClick={() => setChecks(prev => prev.map(c => c.task_id === task.task_id ? { ...c, flagSeverity: sev } : c))}
                            className={`px-2.5 py-1 text-[10px] rounded-full font-medium transition-colors ${check.flagSeverity === sev
                              ? sev === "urgent" ? "bg-starlight-red/15 text-starlight-red" : sev === "warning" ? "bg-starlight-amber/15 text-starlight-amber" : "bg-navy/15 text-navy"
                              : "bg-surface-mid text-muted"}`}>
                            {sev}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Session notes */}
        <div className="bg-surface rounded-xl border border-subtle px-4 py-3">
          <label className="block text-xs font-medium text-muted mb-1">Session notes (optional)</label>
          <textarea value={sessionNotes} onChange={e => setSessionNotes(e.target.value)} rows={2}
            placeholder="Anything else to mention..."
            className="w-full text-sm px-3 py-2 border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-starlight-blue resize-none" />
        </div>

        {/* Complete button */}
        <button onClick={completeMaintenance} disabled={submitting || checkedCount === 0}
          className="w-full py-3.5 bg-starlight-green text-white font-semibold rounded-xl hover:bg-starlight-green active:bg-starlight-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg">
          <CheckCircle2 className="h-5 w-5" />
          {submitting ? "Saving..." : `Complete (${checkedCount} item${checkedCount !== 1 ? "s" : ""} · ${fmtTimer(elapsed)})`}
        </button>
      </div>
    );
  }

  // ── Asset list view ──
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-navy flex items-center gap-2">
        <Wrench className="h-5 w-5" /> Maintenance
      </h1>

      {assets.length === 0 ? (
        <div className="text-center py-12 text-faint text-sm">No maintenance assets set up yet</div>
      ) : (
        <div className="space-y-2">
          {assets.map(asset => (
            <button key={asset.asset_id} onClick={() => openAsset(asset)}
              className="w-full text-left bg-surface rounded-xl border border-subtle p-4 active:bg-surface-dim transition-colors shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shrink-0 ${healthDot(asset.health_status)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy">{asset.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted">
                    {asset.location && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{asset.location}</span>}
                    <span>{asset.task_count} task{asset.task_count !== 1 ? "s" : ""}</span>
                    {asset.last_maintained && <span>Last: {new Date(asset.last_maintained).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                  </div>
                </div>
                {asset.open_flags > 0 && (
                  <span className="px-1.5 py-0.5 bg-starlight-red/10 text-starlight-red text-[10px] font-semibold rounded-full flex items-center gap-0.5">
                    <Flag className="h-2.5 w-2.5" />{asset.open_flags}
                  </span>
                )}
                <span className={`text-[10px] font-semibold ${asset.health_status === "overdue" ? "text-starlight-red" : asset.health_status === "due_soon" ? "text-starlight-amber" : "text-starlight-green"}`}>
                  {healthLabel(asset.health_status)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
