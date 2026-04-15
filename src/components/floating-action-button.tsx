"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Plus, X, Clock, ClipboardList, Timer } from "lucide-react";
import { toast } from "sonner";

export function FloatingActionButton() {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Hide on pages that have their own primary actions
  if (pathname.startsWith("/m/wo/")) return null;
  if (pathname === "/m/login") return null;
  if (pathname === "/m/task") return null;
  if (pathname === "/m/request") return null;

  const handleQuickTimer = async () => {
    setStarting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Not logged in"); return; }
      const fId = user.user_metadata?.freelancer_id;
      if (!fId) { toast.error("No freelancer profile"); return; }

      // Check for existing active timer
      const { data: active } = await supabase.from("tbl_tasks")
        .select("task_id").eq("freelancer_id", fId).eq("status", "in_progress").limit(1);
      if (active && active.length > 0) {
        toast.error("You already have a timer running — log it first");
        setOpen(false); setStarting(false);
        router.push("/m/me");
        return;
      }

      const now = new Date();
      const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const { error } = await supabase.from("tbl_tasks").insert({
        freelancer_id: fId,
        title: `Quick timer (${time})`,
        category: "workshop_general",
        started_at: now.toISOString(),
        status: "in_progress",
      });
      if (error) { toast.error("Failed to start timer"); setStarting(false); return; }
      toast.success("Timer started");
      setOpen(false);
      router.push("/m/me");
    } catch { toast.error("Something went wrong"); }
    setStarting(false);
  };

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setOpen(false)} />}

      {open && (
        <div className="fixed bottom-36 right-4 z-50 flex flex-col gap-3 items-end">
          <button
            onClick={handleQuickTimer}
            disabled={starting}
            className="flex items-center gap-2 bg-starlight-green text-white pl-4 pr-5 py-3 rounded-full shadow-lg active:bg-starlight-green/90 transition-all animate-in fade-in slide-in-from-bottom-2 duration-250 disabled:opacity-60"
          >
            <Timer className="h-4 w-4" />
            <span className="text-sm font-medium">{starting ? "Starting..." : "Start Timer"}</span>
          </button>
          <button
            onClick={() => { setOpen(false); router.push("/m/task"); }}
            className="flex items-center gap-2 bg-navy text-white pl-4 pr-5 py-3 rounded-full shadow-lg active:bg-navy/90 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">Log Task</span>
          </button>
          <button
            onClick={() => { setOpen(false); router.push("/m/request"); }}
            className="flex items-center gap-2 bg-starlight-amber text-base pl-4 pr-5 py-3 rounded-full shadow-lg active:bg-starlight-amber/90 transition-all animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            <ClipboardList className="h-4 w-4" />
            <span className="text-sm font-medium">Raise Request</span>
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className={"fixed bottom-[5.5rem] right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 " + (open ? "bg-surface-bright rotate-0" : "bg-starlight-red")}
      >
        {open ? <X className="h-6 w-6 text-white" /> : <Plus className="h-6 w-6 text-white" />}
      </button>
    </>
  );
}
