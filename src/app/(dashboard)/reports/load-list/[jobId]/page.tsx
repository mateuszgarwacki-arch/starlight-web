
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { toast } from "sonner";
import {
  ArrowLeft, Printer, Package, CheckCircle2, Circle, Truck,
  Plus, Trash2, RotateCcw, X, Check,
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
  load_group_id: number | null;
  status: "pending" | "packed" | "loaded";
  packed_by: string | null;
  packed_at: string | null;
  loaded_by: string | null;
  loaded_at: string | null;
}

interface LoadGroup {
  load_group_id: number;
  name: string;
  description: string | null;
  driver_name: string | null;
  departure_at: string | null;
  sort_order: number;
}

interface JobMeta {
  job_id: number;
  job_number: string;
  job_name: string;
  client_name: string;
  event_date: string;
  event_location: string;
}

const UNASSIGNED_ID = 0; // synthetic id for the "Unassigned" pseudo-group

export default function LoadListPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = Number(params.jobId);
  const supabase = createClient();

  const [job, setJob] = useState<JobMeta | null>(null);
  const [items, setItems] = useState<LoadItem[]>([]);
  const [groups, setGroups] = useState<LoadGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection (for bulk assign)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Print mode: null = screen, "all" = every truck, or a specific group id
  const [printMode, setPrintMode] = useState<null | "all" | number>(null);

  // New-group dialog
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDriver, setNewGroupDriver] = useState("");
  const [newGroupDeparture, setNewGroupDeparture] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("rpc_load_list", { p_job_id: jobId });
    if (error) { toast.error("Failed to load: " + error.message); setLoading(false); return; }
    setJob((data as any)?.job || null);
    setGroups(((data as any)?.groups || []) as LoadGroup[]);
    setItems(((data as any)?.items || []) as LoadItem[]);
    setLoading(false);
  }, [jobId, supabase]);

  useEffect(() => { load(); }, [load]);

  // Trigger print after state is set
  useEffect(() => {
    if (printMode !== null) {
      const t = setTimeout(() => { window.print(); setPrintMode(null); }, 100);
      return () => clearTimeout(t);
    }
  }, [printMode]);

  const keyOf = (i: LoadItem) => `${i.source_table}-${i.source_id}`;
  const toggleSelect = (i: LoadItem) => {
    setSelected(prev => {
      const next = new Set(prev);
      const k = keyOf(i);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  // ============================================================
  // Group mutations
  // ============================================================
  const addGroup = async () => {
    if (!newGroupName.trim()) { toast.error("Name required"); return; }
    const { data, error } = await supabase.from("tbl_load_groups").insert({
      job_id: jobId,
      name: newGroupName.trim(),
      driver_name: newGroupDriver.trim() || null,
      departure_at: newGroupDeparture ? new Date(newGroupDeparture).toISOString() : null,
      sort_order: groups.length,
    }).select().single();
    if (error) { toast.error("Create failed: " + error.message); return; }
    setGroups(prev => [...prev, data as LoadGroup]);
    setNewGroupName(""); setNewGroupDriver(""); setNewGroupDeparture("");
    setShowAddGroup(false);
    toast.success("Truck added");
  };

  const deleteGroup = async (groupId: number) => {
    const g = groups.find(x => x.load_group_id === groupId);
    const assigned = items.filter(i => i.load_group_id === groupId).length;
    const msg = assigned > 0
      ? `Delete "${g?.name}"? ${assigned} items will become unassigned.`
      : `Delete "${g?.name}"?`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from("tbl_load_groups").delete().eq("load_group_id", groupId);
    if (error) { toast.error("Delete failed: " + error.message); return; }
    setGroups(prev => prev.filter(g => g.load_group_id !== groupId));
    setItems(prev => prev.map(i => i.load_group_id === groupId ? { ...i, load_group_id: null } : i));
    toast.success("Truck deleted");
  };

  // ============================================================
  // Bulk assignment
  // ============================================================
  const assignSelected = async (groupId: number | null) => {
    if (selected.size === 0) return;
    const toAssign = items.filter(i => selected.has(keyOf(i)));
    const now = new Date().toISOString();

    const rows = toAssign.map(i => ({
      job_id: jobId,
      source_table: i.source_table,
      source_id: i.source_id,
      load_group_id: groupId,
      // Preserve existing status/stamps if present
      status: i.status,
      packed_by: i.packed_by,
      packed_at: i.packed_at,
      loaded_by: i.loaded_by,
      loaded_at: i.loaded_at,
      updated_at: now,
    }));

    const { error } = await supabase
      .from("tbl_load_events")
      .upsert(rows, { onConflict: "job_id,source_table,source_id" });

    if (error) { toast.error("Assign failed: " + error.message); return; }

    setItems(prev => prev.map(i =>
      selected.has(keyOf(i)) ? { ...i, load_group_id: groupId } : i,
    ));
    clearSelection();
    const target = groupId === null ? "Unassigned" : groups.find(g => g.load_group_id === groupId)?.name || "truck";
    toast.success(`${toAssign.length} items → ${target}`);
  };

  // ============================================================
  // Status transitions (same as before)
  // ============================================================
  const setStatus = async (item: LoadItem, next: "pending" | "packed" | "loaded") => {
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();

    const payload: Record<string, any> = { status: next, updated_at: now };
    if (next === "packed") {
      payload.packed_at = item.packed_at || now;
      payload.packed_by = item.packed_by || user?.id || null;
      payload.loaded_at = null;
      payload.loaded_by = null;
    } else if (next === "loaded") {
      payload.packed_at = item.packed_at || now;
      payload.packed_by = item.packed_by || user?.id || null;
      payload.loaded_at = now;
      payload.loaded_by = user?.id || null;
    } else {
      payload.packed_at = null;
      payload.packed_by = null;
      payload.loaded_at = null;
      payload.loaded_by = null;
    }

    const { error } = await supabase
      .from("tbl_load_events")
      .upsert(
        {
          job_id: jobId,
          source_table: item.source_table,
          source_id: item.source_id,
          load_group_id: item.load_group_id,
          ...payload,
        },
        { onConflict: "job_id,source_table,source_id" },
      );
    if (error) { toast.error("Update failed: " + error.message); return; }

    setItems(prev => prev.map(x =>
      x.source_table === item.source_table && x.source_id === item.source_id
        ? { ...x, ...payload } as LoadItem
        : x,
    ));
  };

  const nextStatus = (s: LoadItem["status"]): LoadItem["status"] =>
    s === "pending" ? "packed" : s === "packed" ? "loaded" : "pending";

  // ============================================================
  // Derived structures for rendering
  // ============================================================
  const groupById = useMemo(() => {
    const m: Record<number, LoadGroup> = {};
    groups.forEach(g => { m[g.load_group_id] = g; });
    return m;
  }, [groups]);

  const groupName = (gid: number | null): string => {
    if (gid == null) return "Unassigned";
    return groupById[gid]?.name || `Truck #${gid}`;
  };

  // Zone → Group → Items (primary on-screen grouping)
  // Groups iteration includes Unassigned (id=UNASSIGNED_ID / key null) if any item is unassigned
  const zones = useMemo(() => Array.from(new Set(items.map(i => i.zone))).sort(), [items]);

  const zoneGroupItems = (zone: string, groupId: number | null): LoadItem[] => {
    const norm = (v: number | null) => v == null ? null : v;
    return items.filter(i => i.zone === zone && norm(i.load_group_id) === norm(groupId));
  };

  // Summary per-group
  const groupStats = (groupId: number | null) => {
    const inGroup = items.filter(i => (i.load_group_id ?? null) === groupId);
    return {
      total: inGroup.length,
      packed: inGroup.filter(i => i.status === "packed").length,
      loaded: inGroup.filter(i => i.status === "loaded").length,
    };
  };

  // Print filter
  const itemsForPrint = (): LoadItem[] => {
    if (printMode === null) return items;
    if (printMode === "all") return items;
    return items.filter(i => (i.load_group_id ?? null) === printMode);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted animate-pulse">Loading load list...</div>;
  if (!job) return <div className="text-center py-12 text-muted">Job not found</div>;

  const totals = {
    total: items.length,
    pending: items.filter(i => i.status === "pending").length,
    packed: items.filter(i => i.status === "packed").length,
    loaded: items.filter(i => i.status === "loaded").length,
    unassigned: items.filter(i => i.load_group_id == null).length,
  };

  // Group IDs to iterate (null = unassigned pseudo-group appears first if has items)
  const iterGroupIds: (number | null)[] = [
    ...(totals.unassigned > 0 ? [null as number | null] : []),
    ...groups.map(g => g.load_group_id),
  ];

  const statusIcon = (s: LoadItem["status"]) => {
    if (s === "loaded") return <CheckCircle2 className="h-5 w-5 text-starlight-green" />;
    if (s === "packed") return <Package className="h-5 w-5 text-starlight-amber" />;
    return <Circle className="h-5 w-5 text-faint hover:text-muted" />;
  };

  // ====================== RENDER ======================
  return (
    <div className="max-w-6xl mx-auto space-y-6 print:space-y-3 traveller-page">
      {/* ============ SCREEN-ONLY TOOLBAR ============ */}
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <button onClick={() => setPrintMode("all")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-subtle text-muted hover:text-navy hover:border-navy rounded-lg transition-colors">
              <Printer className="h-3.5 w-3.5" /> Print all trucks
            </button>
          )}
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy/90 transition-colors">
            <Printer className="h-4 w-4" /> Print everything
          </button>
        </div>
      </div>

      {/* ============ HEADER ============ */}
      <div className="card p-6 print:shadow-none print:border print:border-subtle">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Truck className="h-5 w-5 text-starlight-blue print:text-muted" />
              <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">
                Load List
                {printMode !== null && printMode !== "all" && typeof printMode === "number" && (
                  <> — {groupName(printMode)}</>
                )}
              </span>
            </div>
            <h1 className="text-xl font-bold text-navy">{job.job_name}</h1>
            <p className="text-sm text-muted mt-0.5">{job.job_number} · {job.client_name}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>{job.event_date ? new Date(job.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "No date"}</p>
            <p>{job.event_location || "—"}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-3 mt-6 print:hidden">
          <div className="bg-surface-dim rounded-lg p-3"><p className="text-[10px] text-muted uppercase tracking-wider">Total</p><p className="text-lg font-bold text-navy mt-0.5">{totals.total}</p></div>
          <div className="bg-surface-dim rounded-lg p-3"><p className="text-[10px] text-muted uppercase tracking-wider">Unassigned</p><p className="text-lg font-bold text-muted mt-0.5">{totals.unassigned}</p></div>
          <div className="bg-starlight-amber/10 rounded-lg p-3"><p className="text-[10px] text-muted uppercase tracking-wider">Packed</p><p className="text-lg font-bold text-starlight-amber mt-0.5">{totals.packed}</p></div>
          <div className="bg-starlight-green/10 rounded-lg p-3"><p className="text-[10px] text-muted uppercase tracking-wider">Loaded</p><p className="text-lg font-bold text-starlight-green mt-0.5">{totals.loaded}</p></div>
        </div>
      </div>

      {/* ============ TRUCK MANAGER (screen only) ============ */}
      <div className="card p-4 print:hidden">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-navy">Trucks</h2>
          <button onClick={() => setShowAddGroup(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-starlight-blue/10 text-starlight-blue hover:bg-starlight-blue/20 rounded transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add truck
          </button>
        </div>
        {groups.length === 0 && (
          <p className="text-xs text-muted italic">No trucks yet. Add one to start assigning items.</p>
        )}
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {groups.map(g => {
              const stats = groupStats(g.load_group_id);
              return (
                <div key={g.load_group_id} className="flex items-center gap-2 px-3 py-1.5 bg-surface-dim rounded-lg border border-subtle">
                  <Truck className="h-3.5 w-3.5 text-starlight-blue" />
                  <div className="text-xs">
                    <span className="font-semibold text-navy">{g.name}</span>
                    {g.driver_name && <span className="text-muted ml-1.5">· {g.driver_name}</span>}
                    {g.departure_at && <span className="text-muted ml-1.5">· {new Date(g.departure_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                    <span className="text-faint ml-1.5">({stats.loaded}/{stats.total})</span>
                  </div>
                  <button onClick={() => setPrintMode(g.load_group_id)}
                    className="p-1 text-faint hover:text-navy transition-colors" title="Print this truck">
                    <Printer className="h-3 w-3" />
                  </button>
                  <button onClick={() => deleteGroup(g.load_group_id)}
                    className="p-1 text-faint hover:text-starlight-red transition-colors" title="Delete truck">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============ BULK ACTION BAR (screen only, when selection active) ============ */}
      {selected.size > 0 && (
        <div className="card p-3 bg-starlight-blue/5 border-starlight-blue/30 flex items-center justify-between gap-3 print:hidden sticky top-2 z-10 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-navy">{selected.size} selected</span>
            <button onClick={clearSelection} className="text-xs text-muted hover:text-navy">Clear</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted">Assign to:</span>
            {groups.map(g => (
              <button key={g.load_group_id} onClick={() => assignSelected(g.load_group_id)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-starlight-blue/10 text-starlight-blue hover:bg-starlight-blue/20 rounded transition-colors">
                <Truck className="h-3 w-3" /> {g.name}
              </button>
            ))}
            <button onClick={() => assignSelected(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-subtle text-muted hover:text-navy hover:border-navy rounded transition-colors">
              Unassign
            </button>
          </div>
        </div>
      )}

      {/* ============ SCREEN LIST: Zone → Truck → Items ============ */}
      <div className="print:hidden space-y-5">
        {zones.map(zone => {
          const zoneItems = items.filter(i => i.zone === zone);
          if (zoneItems.length === 0) return null;
          return (
            <div key={zone} className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-subtle bg-surface-dim flex items-center gap-2">
                <Package className="h-4 w-4 text-starlight-blue" />
                <h2 className="text-sm font-semibold text-navy">{zone}</h2>
                <span className="text-[10px] text-muted">· {zoneItems.length} items</span>
              </div>

              {iterGroupIds.map(gid => {
                const sub = zoneGroupItems(zone, gid);
                if (sub.length === 0) return null;
                return (
                  <div key={`${zone}-${gid ?? "none"}`} className="border-b border-subtle last:border-b-0">
                    <div className="px-5 py-2 bg-base flex items-center gap-2">
                      {gid == null ? (
                        <span className="text-xs font-medium text-muted italic">Unassigned</span>
                      ) : (
                        <>
                          <Truck className="h-3.5 w-3.5 text-starlight-blue" />
                          <span className="text-xs font-medium text-navy">{groupName(gid)}</span>
                        </>
                      )}
                      <span className="text-[10px] text-faint">· {sub.length}</span>
                    </div>
                    <div className="divide-y divide-subtle">
                      {sub.map(item => {
                        const k = keyOf(item);
                        const isSel = selected.has(k);
                        const isLoose = item.source_table === "tbl_wo_bom";
                        return (
                          <div key={k} className={`px-5 py-2.5 flex items-center gap-3 transition-colors ${isSel ? "bg-starlight-blue/5" : ""}`}>
                            <input type="checkbox" checked={isSel} onChange={() => toggleSelect(item)}
                              className="shrink-0 h-4 w-4 rounded border-subtle text-starlight-blue focus:ring-starlight-blue cursor-pointer" />
                            <button onClick={() => setStatus(item, nextStatus(item.status))}
                              className="shrink-0" title={`Mark as ${nextStatus(item.status)}`}>
                              {statusIcon(item.status)}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${item.status === "loaded" ? "text-muted line-through" : "text-navy"}`}>
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
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold text-navy">
                                {item.quantity ?? "—"}<span className="text-[10px] font-normal text-muted ml-1">{item.unit || ""}</span>
                              </p>
                            </div>
                            {item.status !== "pending" && (
                              <button onClick={() => setStatus(item, "pending")}
                                className="shrink-0 p-1 text-faint hover:text-starlight-red transition-colors" title="Reset">
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ============ PRINT VIEW: one truck per page, zones within ============ */}
      <div className="hidden print:block">
        {(() => {
          // Determine which groups to print
          let toPrint: (number | null)[];
          if (printMode === "all") {
            toPrint = [...groups.map(g => g.load_group_id), ...(totals.unassigned > 0 ? [null] : [])];
          } else if (typeof printMode === "number") {
            toPrint = [printMode];
          } else {
            // "Print everything" — all trucks then unassigned, or just the full list if no groups
            if (groups.length === 0) {
              toPrint = [null]; // single "page" with all items as unassigned
            } else {
              toPrint = [...groups.map(g => g.load_group_id), ...(totals.unassigned > 0 ? [null] : [])];
            }
          }

          return toPrint.map((gid, idx) => {
            const g = gid == null ? null : groupById[gid];
            const pageItems = gid == null
              ? items.filter(i => i.load_group_id == null)
              : items.filter(i => i.load_group_id === gid);
            if (pageItems.length === 0) return null;

            // Zones within this page
            const pageZones = Array.from(new Set(pageItems.map(i => i.zone))).sort();

            return (
              <div key={`print-${gid ?? "none"}`} className={idx > 0 ? "break-before-page" : ""}>
                {/* Per-truck header */}
                <div className="border-b-2 border-navy pb-2 mb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">Load List</p>
                      <h2 className="text-lg font-bold text-navy">
                        {g ? g.name : "Unassigned Items"}
                      </h2>
                      {g?.description && <p className="text-xs text-muted">{g.description}</p>}
                      {g?.driver_name && <p className="text-xs text-muted mt-0.5">Driver: <span className="font-medium text-navy">{g.driver_name}</span></p>}
                      {g?.departure_at && <p className="text-xs text-muted">Departs: <span className="font-medium text-navy">{new Date(g.departure_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></p>}
                    </div>
                    <div className="text-right text-xs text-muted">
                      <p className="font-semibold text-navy">{job.job_name}</p>
                      <p>{job.job_number}</p>
                      <p>{job.event_date ? new Date(job.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : ""}</p>
                      <p>{job.event_location || ""}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted mt-2">{pageItems.length} items across {pageZones.length} zone{pageZones.length === 1 ? "" : "s"}</p>
                </div>

                {/* Zones within this truck */}
                {pageZones.map(zone => {
                  const zoneItems = pageItems.filter(i => i.zone === zone);
                  return (
                    <div key={zone} className="mb-4 break-inside-avoid">
                      <div className="bg-surface-dim px-3 py-1 border border-subtle">
                        <p className="text-xs font-semibold text-navy uppercase tracking-wider">{zone} <span className="text-muted font-normal">· {zoneItems.length}</span></p>
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {zoneItems.map(item => (
                            <tr key={keyOf(item)} className="border-b border-subtle">
                              <td className="px-2 py-1.5 w-6 align-top">
                                <div className="w-4 h-4 border border-muted rounded-sm" />
                              </td>
                              <td className="px-2 py-1.5 align-top">
                                <p className="font-medium text-navy">{item.description || "Untitled"}</p>
                                <div className="flex flex-wrap gap-x-3 text-[10px] text-muted mt-0.5">
                                  {item.stock_reference && <span className="font-mono">#{item.stock_reference}</span>}
                                  {item.finish_required && <span>Finish: {item.finish_required}</span>}
                                  {item.item_source === "stock" && <span>From stock</span>}
                                  {item.item_source === "bespoke" && <span>Bespoke</span>}
                                  {item.source_table === "tbl_wo_bom" && <span>Loose material</span>}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-right align-top w-20">
                                <p className="font-semibold text-navy">
                                  {item.quantity ?? "—"}
                                  <span className="text-[10px] font-normal text-muted ml-1">{item.unit || ""}</span>
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}

                {/* Signature block */}
                <div className="mt-6 pt-3 border-t border-subtle grid grid-cols-2 gap-8 text-xs break-inside-avoid">
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
                <p className="text-center text-[9px] text-faint mt-3">
                  Starlight Design · Load List · {job.job_number} · {g?.name || "Unassigned"} · {new Date().toLocaleDateString("en-GB")} {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            );
          });
        })()}
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="card px-6 py-12 text-center text-muted print:hidden">
          <Package className="h-8 w-8 mx-auto mb-2 text-faint" />
          <p>No items to load yet.</p>
          <p className="text-xs text-faint mt-1">Items appear here once scope and BOM are defined.</p>
        </div>
      )}

      {/* ============ ADD-TRUCK DIALOG ============ */}
      {showAddGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          onClick={() => setShowAddGroup(false)}>
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-subtle flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy">Add truck</h3>
              <button onClick={() => setShowAddGroup(false)} className="text-faint hover:text-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Name *</label>
                <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                  placeholder="e.g. Truck 1 — Main, Truck 2 — Returns, Client collection"
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") addGroup(); }}
                  className="w-full px-3 py-2 text-sm border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-starlight-blue bg-surface text-foreground" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Driver (optional)</label>
                <input type="text" value={newGroupDriver} onChange={e => setNewGroupDriver(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-starlight-blue bg-surface text-foreground" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Departure (optional)</label>
                <input type="datetime-local" value={newGroupDeparture} onChange={e => setNewGroupDeparture(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-starlight-blue bg-surface text-foreground" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-subtle flex items-center justify-end gap-2">
              <button onClick={() => setShowAddGroup(false)}
                className="px-3 py-1.5 text-xs text-muted hover:text-navy transition-colors">Cancel</button>
              <button onClick={addGroup}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-starlight-blue text-white hover:bg-starlight-blue/90 rounded transition-colors">
                <Check className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
