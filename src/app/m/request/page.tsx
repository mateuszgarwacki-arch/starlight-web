"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { ArrowLeft, Package, Wrench, Archive, AlertTriangle, MessageSquare, Camera } from "lucide-react";
import { notify } from "@/lib/notifications";
import { toast } from "sonner";

interface ActiveJob { job_id: number; job_name: string; job_number: string; }

const CATEGORIES = [
  { value: "order_material", label: "Order Material", icon: Package, color: "bg-starlight-blue/10 text-starlight-blue border-starlight-blue/30" },
  { value: "repair_equipment", label: "Repair Equipment", icon: Wrench, color: "bg-starlight-amber/10 text-starlight-amber border-starlight-amber/30" },
  { value: "restock", label: "Restock", icon: Archive, color: "bg-purple-100 text-purple-600 border-purple-300" },
  { value: "safety", label: "Safety", icon: AlertTriangle, color: "bg-starlight-red/10 text-starlight-red border-starlight-red/30" },
  { value: "general", label: "General", icon: MessageSquare, color: "bg-gray-100 text-gray-600 border-gray-300" },
];

export default function MobileRequestPage() {
  const supabase = createClient();
  const router = useRouter();
  const [myId, setMyId] = useState(0);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("order_material");
  const [urgency, setUrgency] = useState<"normal" | "urgent">("normal");
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobSearch, setJobSearch] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/m/login"); return; }
      setMyId(user.user_metadata?.freelancer_id || 0);
      const { data: jobData } = await supabase.from("tbl_production_plan").select("job_id, job_name, job_number").eq("job_status", "Active").order("job_name");
      setJobs(jobData || []);
    };
    load();
  }, []);

  const filteredJobs = jobs.filter((j) => j.job_name?.toLowerCase().includes(jobSearch.toLowerCase()) || j.job_number?.toLowerCase().includes(jobSearch.toLowerCase()));

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("What's needed?"); return; }
    setSubmitting(true);
    let photoUrl: string | null = null;
    if (photoFile) {
      try {
        const { uploadToOneDrive } = await import("@/lib/onedrive-client");
        const result = await uploadToOneDrive(photoFile, "Workshop Requests", `${new Date().toISOString().split("T")[0]}_${title.trim().replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40)}.jpg`);
        if (result?.webUrl) photoUrl = result.webUrl;
      } catch { console.warn("Photo upload failed, submitting without photo"); }
    }
    const { error } = await supabase.from("tbl_workshop_requests").insert({ freelancer_id: myId, category, title: title.trim(), description: description.trim() || null, urgency, job_id: jobId, photo_url: photoUrl, status: "open" });
    if (error) { toast.error("Failed to submit request"); setSubmitting(false); return; }
    await notify({ supabase, type: "workshop_request", title: `Request: ${title.trim()}`, detail: `${CATEGORIES.find((c) => c.value === category)?.label}${urgency === "urgent" ? " — URGENT" : ""}`, severity: urgency === "urgent" ? "urgent" : "info", freelancerId: myId, jobId, actionUrl: "/review/inbox" });
    toast.success("Request submitted");
    router.back();
  };

  const selectedJob = jobs.find((j) => j.job_id === jobId);

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 active:text-navy"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-lg font-bold text-navy">Raise a Request</h1>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">What&apos;s needed?</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 18mm MDF running low" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-navy placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" autoFocus />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">Category</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => { const Icon = cat.icon; return (<button key={cat.value} onClick={() => setCategory(cat.value)} className={"flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium border transition-all " + (category === cat.value ? cat.color + " ring-2 ring-offset-1 ring-current" : "bg-gray-50 text-gray-400 border-gray-200")}><Icon className="h-3.5 w-3.5" />{cat.label}</button>); })}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">Urgency</label>
        <div className="flex bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button onClick={() => setUrgency("normal")} className={"flex-1 py-2.5 text-xs font-medium transition-colors " + (urgency === "normal" ? "bg-navy text-white" : "text-gray-400")}>Normal</button>
          <button onClick={() => setUrgency("urgent")} className={"flex-1 py-2.5 text-xs font-medium transition-colors " + (urgency === "urgent" ? "bg-starlight-red text-white" : "text-gray-400")}>Urgent</button>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">Related job (optional)</label>
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
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">Details (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any extra detail..." rows={2} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-navy placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-starlight-blue/30 resize-none" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">Photo (optional)</label>
        {photoPreview ? (
          <div className="relative">
            <img src={photoPreview} alt="Request photo" className="w-full h-40 object-cover rounded-xl border border-gray-200" />
            <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs">✕</button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 w-full py-4 bg-white border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm cursor-pointer active:bg-gray-50">
            <Camera className="h-4 w-4" />Take a photo
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
          </label>
        )}
      </div>
      <button onClick={handleSubmit} disabled={submitting || !title.trim()} className={"w-full py-3.5 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed " + (urgency === "urgent" ? "bg-starlight-red text-white active:bg-starlight-red/90" : "bg-navy text-white active:bg-navy/90")}>
        {submitting ? "Submitting..." : "Submit Request"}
      </button>
    </div>
  );
}
