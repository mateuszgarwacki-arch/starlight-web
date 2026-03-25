"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { ArrowLeft, Clock, Timer, Minus, Plus } from "lucide-react";
import { notify } from "@/lib/notifications";
import { toast } from "sonner";

interface ActiveJob {
  job_id: number;
  job_name: string;
  job_number: string;
}

const CATEGORIES = [
  { value: "job_work", label: "Job Work", color: "bg-starlight-blue/10 text-starlight-blue border-starlight-blue/30" },
  { value: "maintenance", label: "Maintenance", color: "bg-starlight-amber/10 text-starlight-amber border-starlight-amber/30" },
  { value: "workshop_general", label: "Workshop General", color: "bg-navy/10 text-navy border-navy/30" },
  { value: "other", label: "Other", color: "bg-gray-100 text-gray-600 border-gray-300" },
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
        <button onClick={() => router.back()} className="text-gray-400 active:text-navy"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-lg font-bold text-navy">Log a Task</h1>
      </div>
      {activeWarning && (<div className="bg-starlight-amber/10 border border-starlight-amber/30 rounded-xl px-4 py-3 text-xs text-starlight-amber">{activeWarning}</div>)}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">What did you do?</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reorganised timber rack" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-navy placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" autoFocus />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">Category</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (<button key={cat.value} onClick={() => setCategory(cat.value)} className={"px-3.5 py-2 rounded-full text-xs font-medium border transition-all " + (category === cat.value ? cat.color + " ring-2 ring-offset-1 ring-current" : "bg-gray-50 text-gray-400 border-gray-200")}>{cat.label}</button>))}
        </div>
      </div>
      {category === "job_work" && (
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">Job (optional)</label>
          {selectedJob ? (
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div><p className="text-sm font-medium text-navy">{selectedJob.job_name}</p><p className="text-[10px] text-gray-400 font-mono">{selectedJob.job_number}</p></div>
              <button onClick={() => setJobId(null)} className="text-xs text-starlight-red">Clear</button>
            </div>
          ) : (
            <div>
              <input type="text" value={jobSearch} onChange={(e) => { setJobSearch(e.target.value); setShowJobPicker(true); }} onFocus={() => setShowJobPicker(true)} placeholder="Search jobs..." className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-navy placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
              {showJobPicker && filteredJobs.length > 0 && (
                <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {filteredJobs.slice(0, 8).map((j) => (<button key={j.job_id} onClick={() => { setJobId(j.job_id); setJobSearch(""); setShowJobPicker(false); }} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 last:border-0"><p className="text-sm text-navy">{j.job_name}</p><p className="text-[10px] text-gray-400 font-mono">{j.job_number}</p></button>))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <button onClick={handleStartTimer} disabled={submitting || !title.trim() || hasActiveTask} className="w-full py-3.5 bg-white border-2 border-dashed border-navy/30 text-navy text-sm font-medium rounded-xl flex items-center justify-center gap-2 active:bg-navy/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        <Timer className="h-4 w-4" />{hasActiveTask ? "Task timer already active" : "Start Timer"}
      </button>
      <div className="flex items-center gap-3"><div className="flex-1 h-px bg-gray-200" /><span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">or log completed work</span><div className="flex-1 h-px bg-gray-200" /></div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">Hours</label>
          <div className="flex items-center gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button onClick={() => adjustHours(-0.5)} className="px-3 py-3 text-gray-400 active:bg-gray-50 border-r border-gray-200"><Minus className="h-4 w-4" /></button>
            <input type="number" value={hours} onChange={(e) => setHours(Math.max(0, parseFloat(e.target.value) || 0))} step="0.5" className="flex-1 text-center py-3 text-sm font-semibold text-navy focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
            <button onClick={() => adjustHours(0.5)} className="px-3 py-3 text-gray-400 active:bg-gray-50 border-l border-gray-200"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">When</label>
          <input type="date" value={workedDate} onChange={(e) => setWorkedDate(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-navy focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any extra detail..." rows={2} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-navy placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-starlight-blue/30 resize-none" />
      </div>
      <button onClick={handleQuickLog} disabled={submitting || !title.trim() || hours <= 0} className="w-full py-3.5 bg-navy text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        <Clock className="h-4 w-4" />{submitting ? "Logging..." : "Log Task"}
      </button>
    </div>
  );
}
