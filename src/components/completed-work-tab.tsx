"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatDate } from "@/lib/utils";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import { CheckCircle2, Camera, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";

interface CompletedWO {
  work_order_id: number;
  job_id: number;
  scope_item_id: number;
  description: string | null;
  completion_photo_path: string | null;
  actual_complete_timestamp: string | null;
  status: string;
  activity_label: string;
  scope_name: string;
  job_name: string;
  job_number: string;
  photoUrl?: string;
}

export function CompletedWorkTab() {
  const supabase = createClient();
  const [items, setItems] = useState<CompletedWO[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Get completed WOs with photos from active jobs
    const { data: wos } = await supabase
      .from("tbl_work_orders")
      .select("work_order_id, job_id, scope_item_id, description, completion_photo_path, actual_complete_timestamp, status, activity_verb")
      .eq("status", "Complete")
      .not("completion_photo_path", "is", null)
      .order("actual_complete_timestamp", { ascending: false })
      .limit(50);
    if (!wos || wos.length === 0) { setItems([]); setLoading(false); return; }

    // Load context
    const scopeIds = [...new Set(wos.map(w => w.scope_item_id).filter(Boolean))];
    const jobIds = [...new Set(wos.map(w => w.job_id).filter(Boolean))];
    const woIds = wos.map(w => w.work_order_id);

    const [scopeRes, jobRes, actRes] = await Promise.all([
      supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds),
      supabase.from("tbl_production_plan").select("job_id, job_name, job_number").in("job_id", jobIds),
      supabase.from("tbl_wo_activities").select("work_order_id, activity_id, sequence").in("work_order_id", woIds).order("sequence"),
    ]);
    const scopeMap: Record<number, string> = {};
    (scopeRes.data || []).forEach((s: any) => { scopeMap[s.scope_item_id] = s.item_name; });
    const jobMap: Record<number, { name: string; number: string }> = {};
    (jobRes.data || []).forEach((j: any) => { jobMap[j.job_id] = { name: j.job_name, number: j.job_number }; });

    // Activity labels
    const actByWO: Record<number, number[]> = {};
    (actRes.data || []).forEach((a: any) => {
      if (!actByWO[a.work_order_id]) actByWO[a.work_order_id] = [];
      actByWO[a.work_order_id].push(a.activity_id);
    });
    const allActIds = [...new Set([...(actRes.data || []).map((a: any) => a.activity_id), ...wos.map(w => w.activity_verb).filter(Boolean)])];
    let lkMap: Record<number, string> = {};
    if (allActIds.length > 0) {
      const { data: lookups } = await supabase.from("tbl_master_lookups").select("lookup_id, lookup_value").in("lookup_id", allActIds);
      (lookups || []).forEach((l: any) => { lkMap[l.lookup_id] = l.lookup_value; });
    }

    const enriched: CompletedWO[] = wos.map((wo: any) => {
      const acts = actByWO[wo.work_order_id];
      let label = "No Activity";
      if (acts && acts.length > 0) {
        label = acts.map(id => lkMap[id] || "?").join(" + ");
      } else if (wo.activity_verb && lkMap[wo.activity_verb]) {
        label = lkMap[wo.activity_verb];
      }
      const job = jobMap[wo.job_id] || { name: "—", number: "—" };
      return {
        ...wo,
        activity_label: label,
        scope_name: scopeMap[wo.scope_item_id] || "—",
        job_name: job.name,
        job_number: job.number,
      };
    });
    setItems(enriched);
    setLoading(false);

    // Load photo URLs in background
    for (const item of enriched) {
      if (item.completion_photo_path) {
        getOneDriveUrl(item.completion_photo_path).then(url => {
          setItems(prev => prev.map(i => i.work_order_id === item.work_order_id ? { ...i, photoUrl: url } : i));
        }).catch(() => {});
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-32 text-gray-400 text-sm animate-pulse">Loading completed work...</div>;
  if (items.length === 0) return <div className="card px-6 py-10 text-center text-gray-400 text-sm">No completed work orders with photos yet</div>;

  // Group by job
  const byJob: Record<string, CompletedWO[]> = {};
  items.forEach(i => {
    const key = `${i.job_number}`;
    if (!byJob[key]) byJob[key] = [];
    byJob[key].push(i);
  });

  return (
    <div className="space-y-6">
      {Object.entries(byJob).map(([jobNum, jobItems]) => {
        const first = jobItems[0];
        return (
          <div key={jobNum}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="text-sm font-bold font-mono text-navy">{first.job_number}</span>
              <span className="text-sm font-semibold text-navy">{first.job_name}</span>
              <span className="text-[10px] text-gray-400">{jobItems.length} completed</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {jobItems.map(item => (
                <Link key={item.work_order_id} href={`/jobs/${item.job_id}/scope/${item.scope_item_id}/wo`}
                  className="card overflow-hidden hover:shadow-md transition-shadow group">
                  {/* Photo */}
                  <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
                    {item.photoUrl ? (
                      <img src={item.photoUrl} alt={item.scope_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-5 w-5 text-gray-300 animate-spin" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="h-5 w-5 text-starlight-green drop-shadow" />
                    </div>
                  </div>
                  {/* Info */}
                  <div className="px-3 py-2">
                    <p className="text-xs font-semibold text-navy truncate">{item.activity_label}</p>
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{item.scope_name}</p>
                    {item.actual_complete_timestamp && (
                      <p className="text-[9px] text-gray-400 mt-1">{formatDate(item.actual_complete_timestamp)}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
