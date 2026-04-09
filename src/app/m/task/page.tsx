"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { ArrowLeft, Clock, Timer, Minus, Plus, ChevronRight } from "lucide-react";
import { notify } from "@/lib/notifications";
import { toast } from "sonner";

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

const CATEGORIES = [
  { value: "job_work", label: "Job Work", color: "bg-starlight-blue/10 text-starlight-blue border-starlight-blue/30" },
  { value: "maintenance", label: "Maintenance", color: "bg-starlight-amber/10 text-starlight-amber border-starlight-amber/30" },
  { value: "workshop_general", label: "Workshop General", color: "bg-navy/10 text-navy border-navy/30" },
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
  const [category, setCategory] = useState("job_work");
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
    };
    load();
  }, []);

  const filteredJobs = jobs.filter((j) => j.job_name?.toLowerCase().includes(jobSearch.toLowerCase()) || j.job_number?.toLowerCase().includes(jobSearch.toLowerCase()));

  const handleQuickLog = async () => {
    if (!title.trim()) { toast.error("What did you do?"); return; }
    if (hours <= 0) { toast.error("Hours must be greater than 0"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("tbl_tasks").insert({ freelancer_id: myId, title: title.trim(), description: notes.trim() || null, category, job_id: category === "job_work" ? jobId : null, hours, worked_date: workedDate, status: "pending" });
    if (error) { toast.error("Failed to log task"); setSubmitting(false); return; }
    await notify({ supabase, type: "task_submitted", title: `Ad-hoc task: ${title.trim()}`, detail: `${hours}h on ${workedDate} — ${CATEGORIES.find((c) => c.value === category)?.label}`, severity: "info", freelancerId: myId, jobId: category === "job_work" ? jobId : null, actionUrl: "/review/inbox" });
    toast.success("Task logged — pending review");
    router.back();
  };

  const handleStartTimer = async () => {
    if (!title.trim()) { toast.error("What are you doing?"); return; }
    if (hasActiveTask) { toast.error("Log your current task first"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("tbl_tasks").insert({ freelancer_id: myId, title: title.trim(), description: notes.trim() || null, category, job_id: category === "job_work" ? jobId : null, started_at: new Date().toISOString(), status: "in_progress" });
    if (error) { toast.error("Failed to start task"); setSubmitting(false); return; }
    toast.success("Timer started");
    router.back();
  };

  const adjustHours = (delta: number) => { setHours((prev) => Math.max(0.5, Math.round((prev + delta) * 2) / 2)); };
  const selectedJob = jobs.find((j) => j.job_id === jobId);

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-muted active:text-navy"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-lg font-bold text-navy">Log a Task</h1>
      </div>
      {activeWarning && (<div className="bg-starlight-amber/10 border border-starlight-amber/30 rounded-xl px-4 py-3 text-xs text-starlight-amber">{activeWarning}</div>)}
      <div>
        <label className="text-xs font-medium text-muted mb-1.5 block">What did you do?</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reorganised timber rack" className="w-full px-4 py-3 bg-surface border border-subtle rounded-xl text-sm text-navy placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" autoFocus />
      </div>
      <div>
        <label className="text-xs font-medium text-muted mb-1.5 block">Category</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (<button key={cat.value} onClick={() => setCategory(cat.value)} className={"px-3.5 py-2 rounded-full text-xs font-medium border transition-all " + (category === cat.value ? cat.color + " ring-2 ring-offset-1 ring-current" : "bg-surface-dim text-muted border-subtle")}>{cat.label}</button>))}
        </div>
      </div>
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
      <button onClick={handleStartTimer} disabled={submitting || !title.trim() || hasActiveTask} className="w-full py-3.5 bg-surface border-2 border-dashed border-navy/30 text-navy text-sm font-medium rounded-xl flex items-center justify-center gap-2 active:bg-navy/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        <Timer className="h-4 w-4" />{hasActiveTask ? "Task timer already active" : "Start Timer"}
      </button>
      <div className="flex items-center gap-3"><div className="flex-1 h-px bg-surface-hi" /><span className="text-[10px] text-muted font-medium uppercase tracking-wider">or log completed work</span><div className="flex-1 h-px bg-surface-hi" /></div>
      <div className="flex gap-3">
        <div className="shrink-0" style={{width: "130px"}}>
          <label className="text-xs font-medium text-muted mb-1.5 block">Hours</label>
          <div className="flex items-center bg-surface border border-subtle rounded-xl overflow-hidden">
            <button onClick={() => adjustHours(-0.5)} className="px-2 py-3 text-muted active:bg-surface-dim border-r border-subtle"><Minus className="h-3.5 w-3.5" /></button>
            <input type="number" value={hours} onChange={(e) => setHours(Math.max(0, parseFloat(e.target.value) || 0))} step="0.5" className="w-12 text-center py-3 text-sm font-semibold text-navy focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
            <button onClick={() => adjustHours(0.5)} className="px-2 py-3 text-muted active:bg-surface-dim border-l border-subtle"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-xs font-medium text-muted mb-1.5 block">When</label>
          <input type="date" value={workedDate} onChange={(e) => setWorkedDate(e.target.value)} className="w-full px-3 py-3 bg-surface border border-subtle rounded-xl text-sm text-navy focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted mb-1.5 block">Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any extra detail..." rows={2} className="w-full px-4 py-3 bg-surface border border-subtle rounded-xl text-sm text-navy placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-starlight-blue/30 resize-none" />
      </div>
      <button onClick={handleQuickLog} disabled={submitting || !title.trim() || hours <= 0} className="w-full py-3.5 bg-navy text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        <Clock className="h-4 w-4" />{submitting ? "Logging..." : "Log Task"}
      </button>

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
                    {t.hours != null && <span className="text-sm font-semibold text-navy shrink-0">{t.hours}h</span>}
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
