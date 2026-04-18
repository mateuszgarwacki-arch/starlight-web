
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { toast } from "sonner";
import {
  ArrowLeft, Printer, Package, CheckCircle2, Circle, Truck,
  ChevronDown, ChevronRight, RotateCcw,
} from "lucide-react";

interface LoadItem {
  source_table: "tbl_job_items" | "tbl_wo_bom";
  source_id: number;
  scope_item_id: number | null;
  zone: string;
  scope_name: string | null;
  description: string | null;
  item_source: string | null;
  item_type: string | null;
  stock_reference: string | null;
  quantity: number | null;
  unit: string | null;
  finish_required: string | null;
  notes: string | null;
  load_event_id: number | null;
  status: "pending" | "packed" | "loaded";
  packed_by: string | null;
  packed_at: string | null;
  loaded_by: string | null;
  loaded_at: string | null;
  load_notes: string | null;
}

interface JobMeta {
  job_id: number;
  job_number: string;
  job_name: string;
  client_name: string;
  event_date: string;
  event_location: string;
}

export default function LoadListPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = Number(params.jobId);
  const supabase = createClient();

  const [job, setJob] = useState<JobMeta | null>(null);
  const [items, setItems] = useState<LoadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedZones, setCollapsedZones] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("rpc_load_list", { p_job_id: jobId });
    if (error) { toast.error("Failed to load list: " + error.message); setLoading(false); return; }
    setJob((data as any)?.job || null);
    setItems(((data as any)?.items || []) as LoadItem[]);
    setLoading(false);
  }, [jobId, supabase]);

  useEffect(() => { load(); }, [load]);

  // ====== Status transitions ======
  const setStatus = async (
    item: LoadItem,
    next: "pending" | "packed" | "loaded",
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();

    // Build payload. Preserve earlier timestamps when stepping forward,
    // clear later timestamps when stepping back.
    const payload: Record<string, any> = { status: next, updated_at: now };
    if (next === "packed") {
      payload.packed_at = item.packed_at || now;
      payload.packed_by = item.packed_by || user?.id || null;
      payload.loaded_at = null;
      payload.loaded_by = null;
    } else if (next === "loaded") {
      // Packing is implied — backfill packed_at if never set
      payload.packed_at = item.packed_at || now;
      payload.packed_by = item.packed_by || user?.id || null;
      payload.loaded_at = now;
      payload.loaded_by = user?.id || null;
    } else {
      // pending — clear everything
      payload.packed_at = null;
      payload.packed_by = null;
      payload.loaded_at = null;
      payload.loaded_by = null;
    }

    // UPSERT on (job_id, source_table, source_id)
    const { error } = await supabase
      .from("tbl_load_events")
      .upsert(
        {
          job_id: jobId,
          source_table: item.source_table,
          source_id: item.source_id,
          ...payload,
        },
        { onConflict: "job_id,source_table,source_id" },
      );

    if (error) { toast.error("Update failed: " + error.message); return; }

    // Optimistic local update
    setItems(prev => prev.map(x =>
      x.source_table === item.source_table && x.source_id === item.source_id
        ? { ...x, ...payload } as LoadItem
        : x,
    ));
  };

  // Next status in the cycle (pending → packed → loaded → pending)
  const nextStatus = (s: LoadItem["status"]): LoadItem["status"] =>
    s === "pending" ? "packed" : s === "packed" ? "loaded" : "pending";

  // Mark all items in a zone as loaded
  const markZoneLoaded = async (zone: string) => {
    const zoneItems = items.filter(i => i.zone === zone && i.status !== "loaded");
    if (zoneItems.length === 0) { toast.info("All items in this zone already loaded"); return; }
    if (!confirm(`Mark all ${zoneItems.length} items in "${zone}" as loaded?`)) return;

    for (const item of zoneItems) {
      await setStatus(item, "loaded");
    }
    toast.success(`${zoneItems.length} items loaded`);
  };

  const toggleZone = (zone: string) => {
    setCollapsedZones(prev => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone); else next.add(zone);
      return next;
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted animate-pulse">Loading load list...</div>;
  if (!job) return <div className="text-center py-12 text-muted">Job not found</div>;

  // Group items by zone
  const zones = Array.from(new Set(items.map(i => i.zone))).sort();
  const byZone: Record<string, LoadItem[]> = {};
  zones.forEach(z => { byZone[z] = items.filter(i => i.zone === z); });

  // Summary counts
  const total = items.length;
  const packed = items.filter(i => i.status === "packed").length;
  const loaded = items.filter(i => i.status === "loaded").length;
  const pending = items.filter(i => i.status === "pending").length;

  // Status badge/icon helper
  const statusPill = (s: LoadItem["status"]) => {
    if (s === "loaded") return "bg-starlight-green/15 text-starlight-green";
    if (s === "packed") return "bg-starlight-amber/15 text-starlight-amber";
    return "bg-surface-dim text-muted";
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 print:space-y-3 traveller-page">
      {/* Nav - hidden in print */}
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy/90 transition-colors">
          <Printer className="h-4 w-4" /> Print / PDF
        </button>
      </div>

      {/* Header */}
      <div className="card p-6 print:shadow-none print:border print:border-subtle">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Truck className="h-5 w-5 text-starlight-blue print:text-muted" />
              <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Load List</span>
            </div>
            <h1 className="text-xl font-bold text-navy">{job.job_name}</h1>
            <p className="text-sm text-muted mt-0.5">{job.job_number} · {job.client_name}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>{job.event_date ? new Date(job.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "No date"}</p>
            <p>{job.event_location || "—"}</p>
          </div>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-3 mt-6">
          <div className="bg-surface-dim rounded-lg p-3 print:border print:border-subtle">
            <p className="text-[10px] text-muted uppercase tracking-wider">Total Items</p>
            <p className="text-lg font-bold text-navy mt-0.5">{total}</p>
          </div>
          <div className="bg-surface-dim rounded-lg p-3 print:border print:border-subtle">
            <p className="text-[10px] text-muted uppercase tracking-wider">Pending</p>
            <p className="text-lg font-bold text-muted mt-0.5">{pending}</p>
          </div>
          <div className="bg-starlight-amber/10 rounded-lg p-3 print:border print:border-subtle">
            <p className="text-[10px] text-muted uppercase tracking-wider">Packed</p>
            <p className="text-lg font-bold text-starlight-amber mt-0.5">{packed}</p>
          </div>
          <div className="bg-starlight-green/10 rounded-lg p-3 print:border print:border-subtle">
            <p className="text-[10px] text-muted uppercase tracking-wider">Loaded</p>
            <p className="text-lg font-bold text-starlight-green mt-0.5">{loaded}</p>
          </div>
        </div>
      </div>

      {/* Zones */}
      {zones.map(zone => {
        const zoneItems = byZone[zone];
        const zonePacked = zoneItems.filter(i => i.status === "packed").length;
        const zoneLoaded = zoneItems.filter(i => i.status === "loaded").length;
        const allLoaded = zoneLoaded === zoneItems.length;
        const isCollapsed = collapsedZones.has(zone);

        return (
          <div key={zone} className="card overflow-hidden print:shadow-none print:border print:border-subtle print:break-inside-avoid">
            {/* Zone header */}
            <div className="px-5 py-3 border-b border-subtle bg-surface-dim flex items-center justify-between gap-3">
              <button onClick={() => toggleZone(zone)}
                className="flex items-center gap-2 text-left flex-1 min-w-0 print:pointer-events-none">
                {isCollapsed
                  ? <ChevronRight className="h-4 w-4 text-muted shrink-0 print:hidden" />
                  : <ChevronDown className="h-4 w-4 text-muted shrink-0 print:hidden" />}
                <Package className="h-4 w-4 text-starlight-blue shrink-0 print:text-muted" />
                <h2 className="text-sm font-semibold text-navy truncate">{zone}</h2>
                <span className="text-[10px] text-muted shrink-0">
                  {zoneLoaded}/{zoneItems.length} loaded
                </span>
              </button>
              {!allLoaded && (
                <button onClick={() => markZoneLoaded(zone)}
                  className="print:hidden text-xs px-2.5 py-1 bg-starlight-green/10 text-starlight-green hover:bg-starlight-green/20 rounded transition-colors font-medium shrink-0">
                  Mark all loaded
                </button>
              )}
            </div>

            {/* Zone items */}
            {!isCollapsed && (
              <div className="divide-y divide-subtle">
                {zoneItems.map(item => {
                  const key = `${item.source_table}-${item.source_id}`;
                  const isLoose = item.source_table === "tbl_wo_bom";
                  return (
                    <div key={key} className="px-5 py-3 flex items-center gap-3">
                      {/* Print-only checkbox (screen hides this; print shows it) */}
                      <div className="hidden print:inline-block w-4 h-4 border border-muted rounded-sm shrink-0" />

                      {/* Screen: stepper button */}
                      <button onClick={() => setStatus(item, nextStatus(item.status))}
                        className="print:hidden shrink-0 transition-colors"
                        title={`Click to mark as ${nextStatus(item.status)}`}>
                        {item.status === "loaded" ? (
                          <CheckCircle2 className="h-5 w-5 text-starlight-green" />
                        ) : item.status === "packed" ? (
                          <Package className="h-5 w-5 text-starlight-amber" />
                        ) : (
                          <Circle className="h-5 w-5 text-faint hover:text-muted" />
                        )}
                      </button>

                      {/* Item detail */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${item.status === "loaded" ? "text-muted line-through print:no-underline" : "text-navy"}`}>
                          {item.description || "Untitled"}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-muted">
                          {item.stock_reference && <span className="font-mono">#{item.stock_reference}</span>}
                          {item.finish_required && <span>Finish: {item.finish_required}</span>}
                          {isLoose && <span className="italic">Loose material</span>}
                          {item.item_source === "stock" && <span className="italic">From stock</span>}
                          {item.item_source === "bespoke" && <span className="italic">Bespoke build</span>}
                        </div>
                      </div>

                      {/* Quantity */}
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-navy">
                          {item.quantity ?? "—"}
                          <span className="text-[10px] font-normal text-muted ml-1">{item.unit || ""}</span>
                        </p>
                      </div>

                      {/* Status pill (screen only) */}
                      <span className={`print:hidden shrink-0 text-[10px] font-medium px-2 py-0.5 rounded ${statusPill(item.status)}`}>
                        {item.status}
                      </span>

                      {/* Reset (screen only) */}
                      {item.status !== "pending" && (
                        <button onClick={() => setStatus(item, "pending")}
                          className="print:hidden shrink-0 p-1 text-faint hover:text-starlight-red transition-colors"
                          title="Reset to pending">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {zones.length === 0 && (
        <div className="card px-6 py-12 text-center text-muted">
          <Package className="h-8 w-8 mx-auto mb-2 text-faint" />
          <p>No items to load yet.</p>
          <p className="text-xs text-faint mt-1">Items appear here once scope and BOM are defined.</p>
        </div>
      )}

      {/* Print-only signature block */}
      <div className="hidden print:block mt-6 pt-4 border-t border-subtle">
        <div className="grid grid-cols-2 gap-8 text-xs">
          <div>
            <p className="text-muted mb-8">Packed by</p>
            <div className="border-b border-muted"></div>
            <p className="text-[10px] text-muted mt-1">Signature / Date</p>
          </div>
          <div>
            <p className="text-muted mb-8">Loaded by</p>
            <div className="border-b border-muted"></div>
            <p className="text-[10px] text-muted mt-1">Signature / Date</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-faint py-4 print:py-2">
        Starlight Design · Load List · {job.job_number} · Generated {new Date().toLocaleDateString("en-GB")} {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}
