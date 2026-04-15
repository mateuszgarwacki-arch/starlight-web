"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { ArrowLeft, Clock, Timer, Minus, Plus, ChevronRight, QrCode, X, Search, Camera } from "lucide-react";
import { notify } from "@/lib/notifications";
import { toast } from "sonner";
import { formatHours } from "@/lib/format-hours";

interface ActiveJob {
  job_id: number;
  job_name: string;
  job_number: string;
}

interface RecentTask {
  task_id: number;
  title: string;
  category: string;
  hours: number | null;
  worked_date: string | null;
  status: string;
  created_at: string;
  job_name?: string | null;
  job_number?: string | null;
}

interface WOOption {
  work_order_id: number;
  description: string | null;
  scope_name: string;
  job_number: string;
  job_id: number;
  status: string;
}

const CATEGORIES = [
  { value: "task", label: "Task (WO)", color: "bg-starlight-blue/10 text-starlight-blue border-starlight-blue/30" },
  { value: "job_work", label: "Job Work", color: "bg-navy/10 text-navy border-navy/30" },
  { value: "maintenance", label: "Maintenance", color: "bg-starlight-amber/10 text-starlight-amber border-starlight-amber/30" },
  { value: "workshop_general", label: "Workshop General", color: "bg-surface-mid text-muted border-subtle" },
  { value: "other", label: "Other", color: "bg-surface-mid text-muted border-subtle" },
];

function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MobileTaskPage() {
  const supabase = createClient();
  const router = useRouter();
  const [myId, setMyId] = useState(0);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("task");
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobSearch, setJobSearch] = useState("");
  const [hours, setHours] = useState(1.0);
  const [workedDate, setWorkedDate] = useState(localDateStr());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [activeWarning, setActiveWarning] = useState<string | null>(null);
  const [hasActiveTask, setHasActiveTask] = useState(false);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);

  // WO picker state (for "task" category)
  const [woOptions, setWoOptions] = useState<WOOption[]>([]);
  const [selectedWo, setSelectedWo] = useState<WOOption | null>(null);
  const [woSearch, setWoSearch] = useState("");
  const [showWoPicker, setShowWoPicker] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<any>(null);

  // Time mode: "total" or "range"
  const [timeMode, setTimeMode] = useState<"total" | "range">("total");
  const [timeFrom, setTimeFrom] = useState("09:00");
  const [timeTo, setTimeTo] = useState("17:00");

  // Photos
  const [logPhotos, setLogPhotos] = useState<{ file: File; preview: string }[]>([]);

  // Calculate hours from time range
  const calcRangeHours = () => {
    if (!timeFrom || !timeTo) return 0;
    const [fh, fm] = timeFrom.split(":").map(Number);
    const [th, tm] = timeTo.split(":").map(Number);
    const diff = (th * 60 + tm) - (fh * 60 + fm);
    return diff > 0 ? Math.round((diff / 60) * 4) / 4 : 0; // round to 0.25 (15min)
  };
  const effectiveHours = timeMode === "range" ? calcRangeHours() : hours;

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/m/login"); return; }
      const fId = user.user_metadata?.freelancer_id || 0;
      setMyId(fId);
      const { data: jobData } = await supabase.from("tbl_production_plan").select("job_id, job_name, job_number").eq("job_status", "Active").order("job_name");
      setJobs(jobData || []);
      const { data: openEntries } = await supabase.from("tbl_wo_time_entries").select("entry_id, work_order_id").eq("freelancer_id", fId).is("system_end_timestamp", null).is("archived_at", null);
      if (openEntries && openEntries.length > 0) { setActiveWarning("You have a WO session in progress. Starting a timer will overlap."); }
      const { data: activeTasks } = await supabase.from("tbl_tasks").select("task_id").eq("freelancer_id", fId).eq("status", "in_progress");
      if (activeTasks && activeTasks.length > 0) { setHasActiveTask(true); }
      // Load recent tasks
      const { data: recent } = await supabase.from("tbl_tasks").select("task_id, title, category, hours, worked_date, status, created_at, job_id").eq("freelancer_id", fId).order("created_at", { ascending: false }).limit(10);
      if (recent && recent.length > 0) {
        const rJobIds = [...new Set(recent.map(t => t.job_id).filter(Boolean))];
        const { data: rJobs } = rJobIds.length > 0 ? await supabase.from("tbl_production_plan").select("job_id, job_name, job_number").in("job_id", rJobIds) : { data: [] };
        const rjMap: Record<number, any> = {}; (rJobs || []).forEach(j => { rjMap[j.job_id] = j; });
        setRecentTasks(recent.map(t => ({ ...t, job_name: t.job_id ? rjMap[t.job_id]?.job_name || null : null, job_number: t.job_id ? rjMap[t.job_id]?.job_number || null : null })));
      }
      // Load WOs for "task" category
      const { data: wos } = await supabase.from("tbl_work_orders").select("work_order_id, description, scope_item_id, job_id, status").in("status", ["Ready", "In-Progress", "Not-Started"]);
      if (wos) {
        const scopeIds = [...new Set(wos.map((w: any) => w.scope_item_id).filter(Boolean))];
        const jobIds = [...new Set(wos.map((w: any) => w.job_id).filter(Boolean))];
        const [scopeRes, jobRes] = await Promise.all([
          scopeIds.length > 0 ? supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds) : { data: [] },
          jobIds.length > 0 ? supabase.from("tbl_production_plan").select("job_id, job_number").in("job_id", jobIds) : { data: [] },
        ]);
        const sMap: Record<number, string> = {}; ((scopeRes as any).data || []).forEach((s: any) => { sMap[s.scope_item_id] = s.item_name; });
        const jMap: Record<number, string> = {}; ((jobRes as any).data || []).forEach((j: any) => { jMap[j.job_id] = j.job_number; });
        setWoOptions(wos.map((w: any) => ({ ...w, scope_name: sMap[w.scope_item_id] || "—", job_number: jMap[w.job_id] || "—" })));
      }
    };
    load();
  }, []);

  const filteredJobs = jobs.filter((j) => j.job_name?.toLowerCase().includes(jobSearch.toLowerCase()) || j.job_number?.toLowerCase().includes(jobSearch.toLowerCase()));
  const filteredWos = woOptions.filter((w) => (w.description || "").toLowerCase().includes(woSearch.toLowerCase()) || w.scope_name.toLowerCase().includes(woSearch.toLowerCase()) || w.job_number.toLowerCase().includes(woSearch.toLowerCase()));

  // QR Scanner
  const startScanner = async () => {
    setShowScanner(true);
    // Dynamic import to avoid SSR issues
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          // Extract work_order_id from URL like /m/wo/123
          const match = decodedText.match(/\/m\/wo\/(\d+)/);
          if (match) {
            const woId = parseInt(match[1]);
            const wo = woOptions.find(w => w.work_order_id === woId);
            if (wo) {
              setSelectedWo(wo);
              setTitle(`${wo.scope_name} — ${wo.description || "WO"}`);
              toast.success(`WO found: ${wo.scope_name}`);
            } else {
              toast.error("WO not found or not active");
            }
          } else {
            toast.error("Not a valid WO QR code");
          }
          stopScanner();
        },
        () => {} // ignore scan failures
      );
    } catch (err) {
      toast.error("Camera access denied");
      setShowScanner(false);
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    setShowScanner(false);
  };

  const handleQuickLog = async () => {
    const logHours = effectiveHours;
    if (category === "task" && !selectedWo) { toast.error("Pick a work order"); return; }
    if (!title.trim()) { toast.error("What did you do?"); return; }
    if (logHours <= 0) { toast.error("Hours must be greater than 0"); return; }
    setSubmitting(true);

    // Upload photos to OneDrive
    let photoUrls: string[] = [];
    if (logPhotos.length > 0) {
      try {
        const { uploadToOneDrive } = await import("@/lib/onedrive-client");
        for (const p of logPhotos) {
          const ts = new Date().toISOString().split("T")[0];
          const safeName = title.trim().replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
          const result = await uploadToOneDrive(p.file, "Workshop/Ad-hoc Tasks", `${ts}_${safeName}_${photoUrls.length + 1}.jpg`);
          if (result?.webUrl) photoUrls.push(result.webUrl);
        }
      } catch (err) { console.warn("Photo upload failed:", err); toast.error("Photo upload failed — logging without photos"); }
    }

    const timeNote = timeMode === "range" ? `${timeFrom}–${timeTo}` : null;
    const desc = [notes.trim(), timeNote].filter(Boolean).join(" | ") || null;

    const insertData: any = {
      freelancer_id: myId, title: title.trim(), description: desc,
      category: category === "task" ? "job_work" : category,
      job_id: category === "task" ? selectedWo?.job_id : (category === "job_work" ? jobId : null),
      hours: logHours, worked_date: workedDate, status: "pending",
    };
    if (category === "task" && selectedWo) {
      insertData.routed_to_wo_id = selectedWo.work_order_id;
    }
    if (photoUrls.length > 0) {
      insertData.photo_urls = JSON.stringify(photoUrls);
    }
    const { error } = await supabase.from("tbl_tasks").insert(insertData);
    if (error) { toast.error("Failed to log task"); setSubmitting(false); return; }
    const catLabel = category === "task" ? `WO: ${selectedWo?.scope_name}` : CATEGORIES.find((c) => c.value === category)?.label;
    await notify({ supabase, type: "task_submitted", title: `Ad-hoc task: ${title.trim()}`, detail: `${formatHours(logHours)} on ${workedDate} — ${catLabel}${photoUrls.length > 0 ? ` (${photoUrls.length} photo${photoUrls.length > 1 ? "s" : ""})` : ""}`, severity: "info", freelancerId: myId, jobId: insertData.job_id, woId: selectedWo?.work_order_id, actionUrl: "/review/inbox" });
    toast.success("Task logged — pending review");
    router.back();
  };

  const handleStartTimer = async () => {
    if (!title.trim()) { toast.error("What are you doing?"); return; }
    setSubmitting(true);

    if (category === "task" && selectedWo) {
      // WO timer → create tbl_wo_time_entries row (shows in header + WO page)
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
      const { error } = await supabase.from("tbl_wo_time_entries").insert({
        work_order_id: selectedWo.work_order_id,
        freelancer_id: myId,
        system_start_timestamp: ts,
        actual_start_timestamp: ts,
      });
      if (error) { toast.error("Failed to start timer"); setSubmitting(false); return; }
      // Also update WO status to In-Progress if it's Ready
      if (selectedWo.status === "Ready" || selectedWo.status === "Not-Started") {
        await supabase.from("tbl_work_orders").update({ status: "In-Progress" }).eq("work_order_id", selectedWo.work_order_id);
      }
      await notify({ supabase, type: "wo_started", title: `Timer started: ${selectedWo.scope_name}`, detail: `${selectedWo.description || "WO"} — ${selectedWo.job_number}`, severity: "info", freelancerId: myId, jobId: selectedWo.job_id, woId: selectedWo.work_order_id, actionUrl: `/m/wo/${selectedWo.work_order_id}` });
      toast.success("WO timer started");
    } else {
      // Ad-hoc timer → tbl_tasks
      if (hasActiveTask) { toast.error("Log your current task first"); return; }
      const insertData: any = {
        freelancer_id: myId, title: title.trim(), description: notes.trim() || null,
        category, job_id: category === "job_work" ? jobId : null,
        started_at: new Date().toISOString(), status: "in_progress",
      };
      const { error } = await supabase.from("tbl_tasks").insert(insertData);
      if (error) { toast.error("Failed to start task"); setSubmitting(false); return; }
      toast.success("Timer started");
    }
    router.back();
  };

  const adjustHours = (delta: number) => { setHours((prev) => Math.max(0.25, Math.round((prev + delta) * 4) / 4)); };
  const selectedJob = jobs.find((j) => j.job_id === jobId);

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-muted active:text-navy"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-lg font-bold text-navy">Log a Task</h1>
      </div>
      {activeWarning && (<div className="bg-starlight-amber/10 border border-starlight-amber/30 rounded-xl px-4 py-3 text-xs text-starlight-amber">{activeWarning}</div>)}

      {/* Title */}
      <div>
        <label className="text-xs font-medium text-muted mb-1.5 block">What did you do?</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reorganised timber rack" className="w-full px-4 py-3 bg-surface border border-subtle rounded-xl text-sm text-navy placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" autoFocus />
      </div>

      {/* Categories */}
      <div>
        <label className="text-xs font-medium text-muted mb-1.5 block">Category</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (<button key={cat.value} onClick={() => { setCategory(cat.value); if (cat.value !== "task") setSelectedWo(null); }} className={"px-3.5 py-2 rounded-full text-xs font-medium border transition-all " + (category === cat.value ? cat.color + " ring-2 ring-offset-1 ring-current" : "bg-surface-dim text-muted border-subtle")}>{cat.label}</button>))}
        </div>
      </div>

      {/* WO Picker (for "task" category) */}
      {category === "task" && (
        <div>
          <label className="text-xs font-medium text-muted mb-1.5 block">Work Order</label>
          {selectedWo ? (
            <div className="flex items-center justify-between bg-surface border border-starlight-blue/30 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-medium text-navy">{selectedWo.scope_name}</p>
                <p className="text-[10px] text-muted">{selectedWo.job_number} · {selectedWo.description || "—"} · {selectedWo.status}</p>
              </div>
              <button onClick={() => setSelectedWo(null)} className="text-xs text-starlight-red">Clear</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
                  <input type="text" value={woSearch} onChange={(e) => { setWoSearch(e.target.value); setShowWoPicker(true); }} onFocus={() => setShowWoPicker(true)} placeholder="Search work orders..." className="w-full pl-10 pr-4 py-3 bg-surface border border-subtle rounded-xl text-sm text-navy placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
                </div>
                <button onClick={startScanner} className="px-4 py-3 bg-starlight-blue text-white rounded-xl flex items-center gap-2 active:bg-starlight-blue/90 shrink-0">
                  <QrCode className="h-4 w-4" />
                </button>
              </div>
              {showWoPicker && filteredWos.length > 0 && (
                <div className="bg-surface border border-subtle rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {(() => {
                    // Group WOs by scope
                    const groups: Record<string, WOOption[]> = {};
                    filteredWos.slice(0, 20).forEach((wo) => {
                      const key = `${wo.job_number}|${wo.scope_name}`;
                      if (!groups[key]) groups[key] = [];
                      groups[key].push(wo);
                    });
                    return Object.entries(groups).map(([key, wos]) => (
                      <div key={key}>
                        <div className="px-4 py-1.5 bg-surface-dim/50 border-b border-subtle sticky top-0">
                          <p className="text-[10px] font-bold text-navy uppercase tracking-wide">{wos[0].scope_name}</p>
                          <p className="text-[9px] text-muted font-mono">{wos[0].job_number}</p>
                        </div>
                        {wos.map((wo) => (
                          <button key={wo.work_order_id} onClick={() => { setSelectedWo(wo); setWoSearch(""); setShowWoPicker(false); setTitle(`${wo.scope_name} — ${wo.description || "WO"}`); }}
                            className="w-full text-left pl-7 pr-4 py-2 hover:bg-surface-dim active:bg-surface-mid border-b border-subtle/50 last:border-0">
                            <p className="text-sm text-navy">{wo.description || "—"}</p>
                            <p className="text-[10px] text-muted">{wo.status}</p>
                          </button>
                        ))}
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Job Picker (for "job_work" category) */}
      {category === "job_work" && (
        <div>
          <label className="text-xs font-medium text-muted mb-1.5 block">Job (optional)</label>
          {selectedJob ? (
            <div className="flex items-center justify-between bg-surface border border-subtle rounded-xl px-4 py-3">
              <div><p className="text-sm font-medium text-navy">{selectedJob.job_name}</p><p className="text-[10px] text-muted font-mono">{selectedJob.job_number}</p></div>
              <button onClick={() => setJobId(null)} className="text-xs text-starlight-red">Clear</button>
            </div>
          ) : (
            <div>
              <input type="text" value={jobSearch} onChange={(e) => { setJobSearch(e.target.value); setShowJobPicker(true); }} onFocus={() => setShowJobPicker(true)} placeholder="Search jobs..." className="w-full px-4 py-3 bg-surface border border-subtle rounded-xl text-sm text-navy placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
              {showJobPicker && filteredJobs.length > 0 && (
                <div className="mt-1 bg-surface border border-subtle rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {filteredJobs.slice(0, 8).map((j) => (<button key={j.job_id} onClick={() => { setJobId(j.job_id); setJobSearch(""); setShowJobPicker(false); }} className="w-full text-left px-4 py-2.5 hover:bg-surface-dim active:bg-surface-mid border-b border-subtle last:border-0"><p className="text-sm text-navy">{j.job_name}</p><p className="text-[10px] text-muted font-mono">{j.job_number}</p></button>))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Timer button */}
      {(() => {
        const isWo = category === "task";
        const disabled = submitting || !title.trim() || (isWo ? !selectedWo : hasActiveTask);
        const label = isWo
          ? (!selectedWo ? "Pick a WO first" : "Start WO Timer")
          : (hasActiveTask ? "Task timer already active" : "Start Timer");
        return (
          <button onClick={handleStartTimer} disabled={disabled} className="w-full py-3.5 bg-surface border-2 border-dashed border-navy/30 text-navy text-sm font-medium rounded-xl flex items-center justify-center gap-2 active:bg-navy/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Timer className="h-4 w-4" />{label}
          </button>
        );
      })()}

      <div className="flex items-center gap-3"><div className="flex-1 h-px bg-surface-hi" /><span className="text-[10px] text-muted font-medium uppercase tracking-wider">or log completed work</span><div className="flex-1 h-px bg-surface-hi" /></div>

      {/* Time input — toggle between total hours and range */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted">Time</label>
          <div className="flex items-center gap-1 bg-surface-mid rounded-lg p-0.5">
            <button onClick={() => setTimeMode("total")} className={"px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors " + (timeMode === "total" ? "bg-surface text-navy shadow-sm" : "text-muted")}>Hours</button>
            <button onClick={() => setTimeMode("range")} className={"px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors " + (timeMode === "range" ? "bg-surface text-navy shadow-sm" : "text-muted")}>From → To</button>
          </div>
        </div>
        {timeMode === "total" ? (
          <div className="flex gap-3">
            <div className="shrink-0" style={{width: "130px"}}>
              <div className="flex items-center bg-surface border border-subtle rounded-xl overflow-hidden">
                <button onClick={() => adjustHours(-0.25)} className="px-2 py-3 text-muted active:bg-surface-dim border-r border-subtle"><Minus className="h-3.5 w-3.5" /></button>
                <div className="w-16 text-center py-3 text-sm font-semibold text-navy">{formatHours(hours)}</div>
                <button onClick={() => adjustHours(0.25)} className="px-2 py-3 text-muted active:bg-surface-dim border-l border-subtle"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <input type="date" value={workedDate} onChange={(e) => setWorkedDate(e.target.value)} className="w-full px-3 py-3 bg-surface border border-subtle rounded-xl text-sm text-navy focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} className="flex-1 px-3 py-3 bg-surface border border-subtle rounded-xl text-sm text-navy text-center focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
            <span className="text-xs text-muted font-medium">→</span>
            <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} className="flex-1 px-3 py-3 bg-surface border border-subtle rounded-xl text-sm text-navy text-center focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
            <div className="shrink-0 w-14 text-center">
              <p className="text-lg font-bold text-navy">{formatHours(calcRangeHours())}</p>
            </div>
            <input type="date" value={workedDate} onChange={(e) => setWorkedDate(e.target.value)} className="flex-1 px-3 py-3 bg-surface border border-subtle rounded-xl text-sm text-navy focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-medium text-muted mb-1.5 block">Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any extra detail..." rows={2} className="w-full px-4 py-3 bg-surface border border-subtle rounded-xl text-sm text-navy placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-starlight-blue/30 resize-none" />
      </div>

      {/* Photos */}
      <div>
        <label className="text-xs font-medium text-muted mb-1.5 block">Photos (optional)</label>
        <div className="flex gap-2 flex-wrap">
          {logPhotos.map((p, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-subtle">
              <img src={p.preview} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setLogPhotos(prev => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">✕</button>
            </div>
          ))}
          {logPhotos.length < 4 && (
            <label className="w-16 h-16 flex items-center justify-center bg-surface border-2 border-dashed border-subtle rounded-lg cursor-pointer active:bg-surface-dim text-muted">
              <Camera className="h-5 w-5" />
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => setLogPhotos(prev => [...prev, { file, preview: ev.target?.result as string }]);
                reader.readAsDataURL(file);
                e.target.value = "";
              }} />
            </label>
          )}
        </div>
      </div>

      {/* Submit */}
      <button onClick={handleQuickLog} disabled={submitting || !title.trim() || effectiveHours <= 0 || (category === "task" && !selectedWo)} className="w-full py-3.5 bg-navy text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        <Clock className="h-4 w-4" />{submitting ? "Logging..." : `Log ${effectiveHours > 0 ? formatHours(effectiveHours) : "Task"}`}
      </button>

      {/* QR Scanner Overlay */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black/80">
            <p className="text-white text-sm font-medium">Scan WO QR Code</p>
            <button onClick={stopScanner} className="p-2 text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div id="qr-reader" className="w-full max-w-sm" />
          </div>
          <div className="px-4 py-4 bg-black/80 text-center">
            <p className="text-white/60 text-xs">Point camera at the QR code on the traveller</p>
          </div>
        </div>
      )}

      {/* Recent Tasks */}
      {recentTasks.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Recent Tasks</p>
          <div className="space-y-1.5">
            {recentTasks.map(t => {
              const statusStyle: Record<string, string> = {
                pending: "bg-starlight-amber/10 text-starlight-amber",
                in_progress: "bg-starlight-blue/10 text-starlight-blue",
                routed: "bg-starlight-blue/10 text-starlight-blue",
                approved_overhead: "bg-starlight-green/10 text-starlight-green",
                rejected: "bg-starlight-red/10 text-starlight-red",
              };
              return (
                <div key={t.task_id} className={"bg-surface border border-subtle rounded-xl px-4 py-3 " + (t.status === "rejected" ? "opacity-50" : "")}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-navy font-medium truncate">{t.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={"text-[10px] px-1.5 py-0.5 rounded font-medium " + (statusStyle[t.status] || "bg-surface-mid text-muted")}>{t.status.replace("_", " ")}</span>
                        {t.worked_date && <span className="text-[10px] text-muted">{new Date(t.worked_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                        {t.job_number && <span className="text-[10px] text-muted font-mono">{t.job_number}</span>}
                      </div>
                    </div>
                    {t.hours != null && <span className="text-sm font-semibold text-navy shrink-0">{formatHours(t.hours)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
