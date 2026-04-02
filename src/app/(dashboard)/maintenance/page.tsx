"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import {
  Wrench, Plus, X, ChevronRight, ChevronDown, AlertTriangle,
  CheckCircle2, Clock, Flag, Trash2, GripVertical, Camera,
  MapPin, Edit2, Save, Info, AlertCircle, Check, Upload, Image,
} from "lucide-react";
import { toast } from "sonner";
import { uploadToOneDrive, getOneDriveUrl } from "@/lib/onedrive-client";

interface Asset {
  asset_id: number;
  name: string;
  location: string | null;
  description: string | null;
  photo_onedrive_path: string | null;
  active: boolean;
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
  day_of_week: number | null;
  estimated_minutes: number | null;
  sort_order: number;
  active: boolean;
  last_completed: string | null;
  last_completed_by: string | null;
  due_status: string;
}

interface MFlag {
  flag_id: number;
  asset_id: number;
  check_id: number | null;
  raised_by: number | null;
  raiser_name?: string;
  severity: string;
  title: string;
  description: string | null;
  photo_onedrive_path: string | null;
  status: string;
  resolution_notes: string | null;
  created_at: string;
}

interface LogEntry {
  log_id: number;
  performer_name: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
  checks: { task_desc: string; note: string | null; flagged: boolean }[];
}

interface AssetPhoto {
  photo_id: number;
  onedrive_path: string;
  file_name: string | null;
  caption: string | null;
  uploaded_at: string;
  url?: string;
}

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
  { value: "as_needed", label: "As Needed" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function healthColor(status: string) {
  if (status === "overdue") return "text-starlight-red bg-starlight-red/10 border-starlight-red/20";
  if (status === "due_soon") return "text-starlight-amber bg-starlight-amber/10 border-starlight-amber/20";
  return "text-starlight-green bg-starlight-green/10 border-starlight-green/20";
}

function healthDot(status: string) {
  if (status === "overdue") return "bg-starlight-red";
  if (status === "due_soon") return "bg-starlight-amber";
  return "bg-starlight-green";
}

function dueLabel(status: string) {
  if (status === "overdue") return "Overdue";
  if (status === "due_soon") return "Due soon";
  if (status === "no_schedule") return "As needed";
  return "Up to date";
}

export default function MaintenancePage() {
  const supabase = createClient();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAsset, setExpandedAsset] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [flags, setFlags] = useState<MFlag[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"checklist" | "photos" | "history" | "flags">("checklist");

  // Photos
  const [photos, setPhotos] = useState<AssetPhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  // Add asset dialog
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [assetForm, setAssetForm] = useState({ name: "", location: "", description: "" });

  // Add task form
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ description: "", instructions: "", frequency: "weekly", day_of_week: "", estimated_minutes: "" });

  // Edit asset
  const [editingAsset, setEditingAsset] = useState(false);
  const [editAssetForm, setEditAssetForm] = useState({ name: "", location: "", description: "" });

  // Flag resolution
  const [resolvingFlag, setResolvingFlag] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const loadAssets = useCallback(async () => {
    const { data } = await supabase
      .from("qry_maintenance_asset_summary")
      .select("*")
      .order("name");
    if (data) setAssets(data as Asset[]);
    setLoading(false);
  }, []);

  const loadAssetDetail = useCallback(async (assetId: number) => {
    // Tasks with due status
    const { data: taskData } = await supabase
      .from("qry_maintenance_task_status")
      .select("*")
      .eq("asset_id", assetId)
      .order("sort_order");
    if (taskData) setTasks(taskData as Task[]);

    // Open flags
    const { data: flagData } = await supabase
      .from("tbl_maintenance_flags")
      .select("*, raiser:tbl_freelancers!raised_by(freelancer_name)")
      .eq("asset_id", assetId)
      .neq("status", "resolved")
      .order("created_at", { ascending: false });
    if (flagData) setFlags(flagData.map((f: any) => ({ ...f, raiser_name: f.raiser?.freelancer_name })));

    // Photos
    const { data: photoData } = await supabase
      .from("tbl_maintenance_asset_photos")
      .select("*")
      .eq("asset_id", assetId)
      .order("sort_order");
    if (photoData) {
      const withUrls = await Promise.all(
        (photoData as AssetPhoto[]).map(async (p) => {
          try { const url = await getOneDriveUrl(p.onedrive_path); return { ...p, url }; }
          catch { return { ...p, url: undefined }; }
        })
      );
      setPhotos(withUrls);
    }

    // Recent logs
    const { data: logData } = await supabase
      .from("tbl_maintenance_logs")
      .select("log_id, completed_at, status, notes, performer:tbl_freelancers!performed_by(freelancer_name)")
      .eq("asset_id", assetId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (logData) {
      const logsWithChecks: LogEntry[] = [];
      for (const log of logData as any[]) {
        const { data: checks } = await supabase
          .from("tbl_maintenance_checks")
          .select("task:tbl_maintenance_tasks!task_id(description), note, flagged")
          .eq("log_id", log.log_id);
        logsWithChecks.push({
          log_id: log.log_id,
          performer_name: log.performer?.freelancer_name || "Unknown",
          completed_at: log.completed_at,
          status: log.status,
          notes: log.notes,
          checks: (checks || []).map((c: any) => ({
            task_desc: c.task?.description || "Unknown task",
            note: c.note,
            flagged: c.flagged,
          })),
        });
      }
      setLogs(logsWithChecks);
    }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const toggleAsset = (assetId: number) => {
    if (expandedAsset === assetId) { setExpandedAsset(null); return; }
    setExpandedAsset(assetId);
    setActiveTab("checklist");
    setEditingAsset(false);
    loadAssetDetail(assetId);
  };

  // ── CRUD Handlers ──

  const addAsset = async () => {
    if (!assetForm.name.trim()) return;
    await supabase.from("tbl_maintenance_assets").insert({
      name: assetForm.name.trim(),
      location: assetForm.location.trim() || null,
      description: assetForm.description.trim() || null,
      created_at: new Date().toISOString(),
    });
    toast.success(`Asset "${assetForm.name}" added`);
    setAssetForm({ name: "", location: "", description: "" });
    setShowAddAsset(false);
    loadAssets();
  };

  const updateAsset = async (assetId: number) => {
    await supabase.from("tbl_maintenance_assets").update({
      name: editAssetForm.name.trim(),
      location: editAssetForm.location.trim() || null,
      description: editAssetForm.description.trim() || null,
    }).eq("asset_id", assetId);
    toast.success("Asset updated");
    setEditingAsset(false);
    loadAssets();
  };

  const archiveAsset = async (assetId: number) => {
    if (!confirm("Archive this asset? It will be hidden but history is preserved.")) return;
    await supabase.from("tbl_maintenance_assets").update({ active: false }).eq("asset_id", assetId);
    toast.success("Asset archived");
    setExpandedAsset(null);
    loadAssets();
  };

  const addTask = async (assetId: number) => {
    if (!taskForm.description.trim()) return;
    const maxSort = tasks.length > 0 ? Math.max(...tasks.map(t => t.sort_order)) + 1 : 0;
    await supabase.from("tbl_maintenance_tasks").insert({
      asset_id: assetId,
      description: taskForm.description.trim(),
      instructions: taskForm.instructions.trim() || null,
      frequency: taskForm.frequency,
      day_of_week: taskForm.frequency === "weekly" && taskForm.day_of_week !== "" ? parseInt(taskForm.day_of_week) : null,
      estimated_minutes: taskForm.estimated_minutes ? parseInt(taskForm.estimated_minutes) : null,
      sort_order: maxSort,
    });
    toast.success("Task added");
    setTaskForm({ description: "", instructions: "", frequency: "weekly", day_of_week: "", estimated_minutes: "" });
    setShowAddTask(false);
    loadAssetDetail(assetId);
    loadAssets();
  };

  const deleteTask = async (taskId: number, assetId: number) => {
    if (!confirm("Delete this maintenance task?")) return;
    await supabase.from("tbl_maintenance_tasks").update({ active: false }).eq("task_id", taskId);
    toast.success("Task removed");
    loadAssetDetail(assetId);
    loadAssets();
  };

  const acknowledgeFlag = async (flagId: number) => {
    await supabase.from("tbl_maintenance_flags").update({
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
    }).eq("flag_id", flagId);
    toast.success("Flag acknowledged");
    if (expandedAsset) loadAssetDetail(expandedAsset);
    loadAssets();
  };

  const resolveFlag = async (flagId: number) => {
    await supabase.from("tbl_maintenance_flags").update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolution_notes: resolutionNotes.trim() || null,
    }).eq("flag_id", flagId);
    toast.success("Flag resolved");
    setResolvingFlag(null);
    setResolutionNotes("");
    if (expandedAsset) loadAssetDetail(expandedAsset);
    loadAssets();
  };

  const uploadPhoto = async (assetId: number, assetName: string, file: File) => {
    setUploading(true);
    try {
      const folder = `Maintenance/${assetName.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "-")}`;
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}.${ext}`;
      const result = await uploadToOneDrive(file, folder, fileName);
      await supabase.from("tbl_maintenance_asset_photos").insert({
        asset_id: assetId,
        onedrive_path: result.path,
        file_name: file.name,
        sort_order: photos.length,
        uploaded_at: new Date().toISOString(),
      });
      toast.success("Photo uploaded");
      loadAssetDetail(assetId);
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const updateCaption = async (photoId: number, caption: string) => {
    await supabase.from("tbl_maintenance_asset_photos").update({ caption: caption.trim() || null }).eq("photo_id", photoId);
    setPhotos(prev => prev.map(p => p.photo_id === photoId ? { ...p, caption: caption.trim() || null } : p));
  };

  const deletePhoto = async (photoId: number) => {
    if (!confirm("Delete this photo?")) return;
    await supabase.from("tbl_maintenance_asset_photos").delete().eq("photo_id", photoId);
    toast.success("Photo deleted");
    if (expandedAsset) loadAssetDetail(expandedAsset);
  };

  if (loading) return <div className="p-8 text-muted animate-pulse">Loading maintenance assets...</div>;

  const currentAsset = assets.find(a => a.asset_id === expandedAsset);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Maintenance
          </h1>
          <p className="text-xs text-muted mt-0.5">Equipment and workshop area maintenance tracking</p>
        </div>
        <button onClick={() => setShowAddAsset(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-starlight-blue text-white text-sm font-medium rounded-lg hover:bg-navy transition-colors">
          <Plus className="h-4 w-4" /> Add Asset
        </button>
      </div>

      {/* Summary bar */}
      {assets.length > 0 && (
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted">{assets.length} asset{assets.length !== 1 ? "s" : ""}</span>
          {assets.filter(a => a.health_status === "overdue").length > 0 && (
            <span className="text-starlight-red font-medium">{assets.filter(a => a.health_status === "overdue").length} overdue</span>
          )}
          {assets.filter(a => a.health_status === "due_soon").length > 0 && (
            <span className="text-starlight-amber font-medium">{assets.filter(a => a.health_status === "due_soon").length} due soon</span>
          )}
          {assets.filter(a => a.open_flags > 0).length > 0 && (
            <span className="text-starlight-red font-medium flex items-center gap-1"><Flag className="h-3 w-3" />{assets.reduce((s, a) => s + a.open_flags, 0)} open flags</span>
          )}
        </div>
      )}

      {/* Asset Cards */}
      {assets.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <Wrench className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-muted text-sm">No maintenance assets yet</p>
          <p className="text-faint text-xs mt-1">Add your first piece of equipment or workshop area</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map(asset => (
            <div key={asset.asset_id} className="card overflow-hidden">
              {/* Asset row */}
              <button onClick={() => toggleAsset(asset.asset_id)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-surface-dim/50 transition-colors">
                {/* Health dot */}
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthDot(asset.health_status)}`} />
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy">{asset.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted">
                    {asset.location && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{asset.location}</span>}
                    <span>{asset.task_count} task{asset.task_count !== 1 ? "s" : ""}</span>
                    {asset.last_maintained && <span>Last: {new Date(asset.last_maintained).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                  </div>
                </div>
                {/* Flags badge */}
                {asset.open_flags > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-starlight-red/10 text-starlight-red text-[10px] font-semibold rounded-full">
                    <Flag className="h-2.5 w-2.5" />{asset.open_flags}
                  </span>
                )}
                {/* Status badge */}
                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${healthColor(asset.health_status)}`}>
                  {asset.health_status === "overdue" ? "Overdue" : asset.health_status === "due_soon" ? "Due Soon" : "OK"}
                </span>
                {expandedAsset === asset.asset_id ? <ChevronDown className="h-4 w-4 text-muted shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted shrink-0" />}
              </button>

              {/* Expanded Detail */}
              {expandedAsset === asset.asset_id && currentAsset && (
                <div className="border-t border-subtle bg-surface-dim/30">
                  {/* Asset info bar + edit */}
                  <div className="px-5 py-3 border-b border-subtle flex items-center justify-between">
                    {editingAsset ? (
                      <div className="flex items-center gap-3 flex-1">
                        <input value={editAssetForm.name} onChange={e => setEditAssetForm({ ...editAssetForm, name: e.target.value })}
                          className="px-2 py-1 text-sm border rounded w-48 focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="Name" />
                        <input value={editAssetForm.location} onChange={e => setEditAssetForm({ ...editAssetForm, location: e.target.value })}
                          className="px-2 py-1 text-sm border rounded w-36 focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="Location" />
                        <input value={editAssetForm.description} onChange={e => setEditAssetForm({ ...editAssetForm, description: e.target.value })}
                          className="px-2 py-1 text-sm border rounded flex-1 focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="Description" />
                        <button onClick={() => updateAsset(asset.asset_id)} className="p-1.5 text-starlight-green hover:bg-starlight-green/10 rounded"><Save className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditingAsset(false)} className="p-1.5 text-muted hover:bg-surface-mid rounded"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-muted">{currentAsset.description || "No description"}</p>
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditingAsset(true); setEditAssetForm({ name: currentAsset.name, location: currentAsset.location || "", description: currentAsset.description || "" }); }}
                            className="p-1.5 text-muted hover:text-starlight-blue hover:bg-navy/10 rounded transition-colors" title="Edit asset">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => archiveAsset(asset.asset_id)}
                            className="p-1.5 text-muted hover:text-starlight-red hover:bg-starlight-red/10 rounded transition-colors" title="Archive asset">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-subtle">
                    {(["checklist", "photos", "history", "flags"] as const).map(tab => (
                      <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-5 py-2.5 text-xs font-medium transition-colors border-b-2 ${activeTab === tab ? "border-starlight-blue text-starlight-blue" : "border-transparent text-muted hover:text-muted"}`}>
                        {tab === "checklist" && `Checklist (${tasks.length})`}
                        {tab === "photos" && `Photos (${photos.length})`}
                        {tab === "history" && `History (${logs.length})`}
                        {tab === "flags" && <>Flags {flags.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-starlight-red/15 text-starlight-red rounded-full text-[9px]">{flags.length}</span>}</>}
                      </button>
                    ))}
                  </div>

                  {/* Checklist Tab */}
                  {activeTab === "checklist" && (
                    <div className="px-5 py-3 space-y-2">
                      {tasks.length === 0 ? (
                        <p className="text-xs text-muted py-4 text-center">No maintenance tasks defined yet</p>
                      ) : (
                        tasks.map(task => (
                          <div key={task.task_id} className="flex items-start gap-3 py-2 border-b border-subtle last:border-0">
                            <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${healthDot(task.due_status)}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-navy">{task.description}</p>
                              {task.instructions && <p className="text-[10px] text-muted mt-0.5">{task.instructions}</p>}
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted">
                                <span className="font-medium capitalize">{task.frequency.replace("_", " ")}</span>
                                {task.frequency === "weekly" && task.day_of_week != null && <span>{DAYS[task.day_of_week]}</span>}
                                {task.estimated_minutes && <span>{task.estimated_minutes} min</span>}
                                <span className={task.due_status === "overdue" ? "text-starlight-red font-medium" : task.due_status === "due_soon" ? "text-starlight-amber" : "text-starlight-green"}>
                                  {dueLabel(task.due_status)}
                                </span>
                                {task.last_completed && (
                                  <span>Last: {new Date(task.last_completed).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                    {task.last_completed_by ? ` by ${task.last_completed_by}` : ""}</span>
                                )}
                              </div>
                            </div>
                            <button onClick={() => deleteTask(task.task_id, asset.asset_id)}
                              className="p-1 text-faint hover:text-starlight-red transition-colors shrink-0" title="Remove task">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))
                      )}
                      {/* Add task */}
                      {showAddTask ? (
                        <div className="pt-2 space-y-2 border-t border-subtle">
                          <input value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}
                            placeholder="Task description (e.g. Drain water from tank)"
                            className="w-full px-3 py-2 text-sm border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-starlight-blue" autoFocus />
                          <input value={taskForm.instructions} onChange={e => setTaskForm({ ...taskForm, instructions: e.target.value })}
                            placeholder="Detailed instructions (optional)"
                            className="w-full px-3 py-1.5 text-xs border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                          <div className="flex items-center gap-3">
                            <select value={taskForm.frequency} onChange={e => setTaskForm({ ...taskForm, frequency: e.target.value })}
                              className="px-2 py-1.5 text-xs border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-starlight-blue">
                              {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                            {taskForm.frequency === "weekly" && (
                              <select value={taskForm.day_of_week} onChange={e => setTaskForm({ ...taskForm, day_of_week: e.target.value })}
                                className="px-2 py-1.5 text-xs border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-starlight-blue">
                                <option value="">Any day</option>
                                {DAYS.map((d, i) => <option key={i} value={String(i)}>{d}</option>)}
                              </select>
                            )}
                            <input value={taskForm.estimated_minutes} onChange={e => setTaskForm({ ...taskForm, estimated_minutes: e.target.value })}
                              type="number" placeholder="Min" className="w-16 px-2 py-1.5 text-xs border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                            <div className="flex-1" />
                            <button onClick={() => setShowAddTask(false)} className="text-xs text-muted hover:text-muted">Cancel</button>
                            <button onClick={() => addTask(asset.asset_id)} disabled={!taskForm.description.trim()}
                              className="px-3 py-1.5 bg-starlight-blue text-white text-xs font-medium rounded-lg hover:bg-navy disabled:opacity-50">Add</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setShowAddTask(true)}
                          className="w-full py-2 text-xs text-muted hover:text-starlight-blue hover:bg-navy/10/50 rounded-lg transition-colors flex items-center justify-center gap-1">
                          <Plus className="h-3 w-3" /> Add maintenance task
                        </button>
                      )}
                    </div>
                  )}

                  {/* Photos Tab */}
                  {activeTab === "photos" && (
                    <div className="px-5 py-3">
                      {/* Upload button */}
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs text-muted">Reference photos for identification and instructions</p>
                        <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${uploading ? "bg-surface-mid text-muted" : "bg-starlight-blue/10 text-starlight-blue hover:bg-starlight-blue/20"}`}>
                          <Upload className="h-3.5 w-3.5" />
                          {uploading ? "Uploading..." : "Upload Photo"}
                          <input type="file" accept="image/*" className="hidden" disabled={uploading}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f && currentAsset) uploadPhoto(currentAsset.asset_id, currentAsset.name, f); e.target.value = ""; }} />
                        </label>
                      </div>
                      {photos.length === 0 ? (
                        <div className="py-8 text-center">
                          <Image className="h-8 w-8 text-faint mx-auto mb-2" />
                          <p className="text-xs text-muted">No photos yet</p>
                          <p className="text-[10px] text-faint mt-0.5">Upload photos showing equipment location, components, or reference images</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {photos.map(photo => (
                            <div key={photo.photo_id} className="group relative border border-subtle rounded-lg overflow-hidden bg-surface-dim">
                              {photo.url ? (
                                <a href={photo.url} target="_blank" rel="noopener noreferrer">
                                  <img src={photo.url} alt={photo.caption || photo.file_name || ""} className="w-full h-36 object-cover" />
                                </a>
                              ) : (
                                <div className="w-full h-36 flex items-center justify-center text-faint">
                                  <Image className="h-6 w-6" />
                                </div>
                              )}
                              <div className="px-2 py-1.5">
                                <input
                                  type="text"
                                  defaultValue={photo.caption || ""}
                                  onBlur={(e) => updateCaption(photo.photo_id, e.target.value)}
                                  placeholder="Add caption..."
                                  className="w-full text-[10px] text-muted bg-transparent border-0 border-b border-transparent hover:border-subtle focus:border-starlight-blue focus:outline-none px-0 py-0.5 placeholder:text-faint"
                                />
                                <p className="text-[9px] text-faint mt-0.5">{photo.file_name || "Photo"}</p>
                              </div>
                              <button onClick={() => deletePhoto(photo.photo_id)}
                                className="absolute top-1 right-1 p-1 bg-surface/80 rounded-full text-muted hover:text-starlight-red opacity-0 group-hover:opacity-100 transition-opacity">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* History Tab */}
                  {activeTab === "history" && (
                    <div className="px-5 py-3">
                      {logs.length === 0 ? (
                        <p className="text-xs text-muted py-4 text-center">No maintenance sessions recorded yet</p>
                      ) : (
                        <div className="space-y-3">
                          {logs.map(log => (
                            <div key={log.log_id} className="border border-subtle rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="font-medium text-navy">{log.performer_name}</span>
                                  <span className="text-muted">
                                    {log.completed_at ? new Date(log.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "In progress"}
                                  </span>
                                </div>
                                <span className={`text-[10px] font-medium ${log.status === "completed" ? "text-starlight-green" : "text-starlight-amber"}`}>
                                  {log.status === "completed" ? "Completed" : "In Progress"}
                                </span>
                              </div>
                              {log.checks.length > 0 && (
                                <div className="space-y-1">
                                  {log.checks.map((c, i) => (
                                    <div key={i} className="flex items-start gap-2 text-[11px]">
                                      <CheckCircle2 className={`h-3 w-3 mt-0.5 shrink-0 ${c.flagged ? "text-starlight-red" : "text-starlight-green"}`} />
                                      <span className="text-muted">{c.task_desc}</span>
                                      {c.note && <span className="text-muted italic">— {c.note}</span>}
                                      {c.flagged && <Flag className="h-2.5 w-2.5 text-starlight-red shrink-0" />}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {log.notes && <p className="text-[10px] text-muted mt-2 border-t border-subtle pt-2">{log.notes}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Flags Tab */}
                  {activeTab === "flags" && (
                    <div className="px-5 py-3">
                      {flags.length === 0 ? (
                        <p className="text-xs text-muted py-4 text-center flex items-center justify-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-starlight-green" /> No open flags
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {flags.map(flag => (
                            <div key={flag.flag_id} className={`border rounded-lg p-3 ${flag.severity === "urgent" ? "border-starlight-red/20 bg-starlight-red/10/30" : flag.severity === "warning" ? "border-starlight-amber/20 bg-starlight-amber/10/30" : "border-subtle"}`}>
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    {flag.severity === "urgent" ? <AlertCircle className="h-3.5 w-3.5 text-starlight-red" /> :
                                     flag.severity === "warning" ? <AlertTriangle className="h-3.5 w-3.5 text-starlight-amber" /> :
                                     <Info className="h-3.5 w-3.5 text-navy" />}
                                    <span className="text-sm font-medium text-navy">{flag.title}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${flag.status === "open" ? "bg-starlight-red/15 text-starlight-red" : "bg-starlight-amber/15 text-starlight-amber"}`}>
                                      {flag.status}
                                    </span>
                                  </div>
                                  {flag.description && <p className="text-xs text-muted ml-5">{flag.description}</p>}
                                  <div className="flex items-center gap-3 mt-1 ml-5 text-[10px] text-muted">
                                    {flag.raiser_name && <span>Raised by {flag.raiser_name}</span>}
                                    <span>{new Date(flag.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {flag.status === "open" && (
                                    <button onClick={() => acknowledgeFlag(flag.flag_id)}
                                      className="px-2 py-1 text-[10px] text-starlight-amber bg-starlight-amber/10 hover:bg-starlight-amber/15 rounded transition-colors">Acknowledge</button>
                                  )}
                                  {resolvingFlag === flag.flag_id ? (
                                    <div className="flex items-center gap-1">
                                      <input value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)}
                                        placeholder="Resolution notes..."
                                        className="px-2 py-1 text-[10px] border rounded w-48 focus:outline-none focus:ring-1 focus:ring-green-500" autoFocus />
                                      <button onClick={() => resolveFlag(flag.flag_id)}
                                        className="px-2 py-1 text-[10px] text-starlight-green bg-starlight-green/10 hover:bg-starlight-green/15 rounded transition-colors">Done</button>
                                      <button onClick={() => { setResolvingFlag(null); setResolutionNotes(""); }}
                                        className="p-1 text-muted hover:text-muted"><X className="h-3 w-3" /></button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setResolvingFlag(flag.flag_id)}
                                      className="px-2 py-1 text-[10px] text-starlight-green bg-starlight-green/10 hover:bg-starlight-green/15 rounded transition-colors">Resolve</button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Asset Dialog */}
      {showAddAsset && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddAsset(false)}>
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-subtle flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy flex items-center gap-2">
                <Wrench className="h-4 w-4 text-starlight-blue" /> Add Maintenance Asset
              </h3>
              <button onClick={() => setShowAddAsset(false)} className="p-1.5 text-muted hover:text-muted rounded-lg hover:bg-surface-mid">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Name *</label>
                <input value={assetForm.name} onChange={e => setAssetForm({ ...assetForm, name: e.target.value })}
                  placeholder="e.g. Main Compressor, Table Saw Bay 1, Spray Booth"
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Location</label>
                <input value={assetForm.location} onChange={e => setAssetForm({ ...assetForm, location: e.target.value })}
                  placeholder="e.g. Workshop Bay 2, Compressor Room"
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Description</label>
                <textarea value={assetForm.description} onChange={e => setAssetForm({ ...assetForm, description: e.target.value })}
                  rows={2} placeholder="Brief notes about this asset..."
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-subtle flex justify-end gap-3">
              <button onClick={() => setShowAddAsset(false)} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors">Cancel</button>
              <button onClick={addAsset} disabled={!assetForm.name.trim()}
                className="px-4 py-2 bg-starlight-blue text-white text-sm font-medium rounded-lg hover:bg-navy transition-colors disabled:opacity-50">
                Add Asset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
