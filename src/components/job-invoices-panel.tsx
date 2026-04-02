"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  FileText, ChevronDown, ChevronRight, Split, Trash2, X,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface Invoice {
  invoice_id: number; supplier: string; invoice_number: string | null;
  invoice_date: string | null; total_value: number | null; status: string;
}
interface InvLine {
  line_id: number; invoice_id: number; line_number: number;
  raw_description: string; quantity: number | null; unit: string | null;
  unit_cost: number | null; line_total: number | null;
  material_id: number | null; match_status: string;
}
interface ScopeOpt { scope_item_id: number; item_name: string | null; }
interface Alloc {
  allocation_id?: number; invoice_line_id: number;
  scope_item_id: number; percentage: number;
  allocated_amount: number; scope_name?: string;
}

interface JobInvoicesPanelProps { jobId: number; }

export function JobInvoicesPanel({ jobId }: JobInvoicesPanelProps) {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedInvId, setExpandedInvId] = useState<number | null>(null);
  const [invLines, setInvLines] = useState<InvLine[]>([]);
  const [scopeItems, setScopeItems] = useState<ScopeOpt[]>([]);
  const [materials, setMaterials] = useState<Record<number, string>>({});
  const [allocations, setAllocations] = useState<Record<number, Alloc[]>>({});
  const [allocatingLineId, setAllocatingLineId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const loadInvoices = useCallback(async () => {
    const [invRes, scopeRes] = await Promise.all([
      supabase.from("tbl_invoices").select("invoice_id, supplier, invoice_number, invoice_date, total_value, status")
        .eq("job_id", jobId).order("invoice_date", { ascending: false }),
      supabase.from("tbl_scope_items").select("scope_item_id, item_name")
        .eq("job_id", jobId).order("scope_item_id"),
    ]);
    setInvoices(invRes.data || []);
    setScopeItems(scopeRes.data || []);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const toggleExpand = async (invId: number) => {
    if (expandedInvId === invId) { setExpandedInvId(null); setInvLines([]); return; }
    setExpandedInvId(invId); setAllocatingLineId(null);
    const { data: lines } = await supabase.from("tbl_invoice_lines")
      .select("line_id, invoice_id, line_number, raw_description, quantity, unit, unit_cost, line_total, material_id, match_status")
      .eq("invoice_id", invId).order("line_number");
    const lineData = lines || [];
    setInvLines(lineData);
    // Load material names for matched lines
    const matIds = [...new Set(lineData.filter(l => l.material_id).map(l => l.material_id!))];
    if (matIds.length > 0) {
      const { data: mats } = await supabase.from("tbl_materials")
        .select("material_id, material_name").in("material_id", matIds);
      const map: Record<number, string> = {};
      (mats || []).forEach((m: any) => { map[m.material_id] = m.material_name; });
      setMaterials(map);
    }
    // Load allocations
    const lineIds = lineData.map(l => l.line_id);
    if (lineIds.length > 0) {
      const { data: allocs } = await supabase.from("tbl_invoice_allocations")
        .select("*").in("invoice_line_id", lineIds);
      const byLine: Record<number, Alloc[]> = {};
      (allocs || []).forEach((a: any) => {
        if (!byLine[a.invoice_line_id]) byLine[a.invoice_line_id] = [];
        const scope = scopeItems.find(s => s.scope_item_id === a.scope_item_id);
        byLine[a.invoice_line_id].push({ ...a, scope_name: scope?.item_name || `Scope #${a.scope_item_id}` });
      });
      setAllocations(byLine);
    } else { setAllocations({}); }
  };

  // Allocation handlers
  const saveAllocation = async (lineId: number, scopeItemId: number, percentage: number) => {
    const line = invLines.find(l => l.line_id === lineId);
    if (!line || !scopeItemId || percentage <= 0) return;
    const allocatedAmount = Math.round((line.line_total || 0) * percentage / 100 * 100) / 100;
    const existing = allocations[lineId] || [];
    const otherPct = existing.filter(a => a.scope_item_id !== scopeItemId).reduce((s, a) => s + a.percentage, 0);
    if (otherPct + percentage > 100) { toast.error(`Total would be ${otherPct + percentage}% — max 100%`); return; }
    const existingAlloc = existing.find(a => a.scope_item_id === scopeItemId);
    if (existingAlloc?.allocation_id) {
      await supabase.from("tbl_invoice_allocations").update({ percentage, allocated_amount: allocatedAmount }).eq("allocation_id", existingAlloc.allocation_id);
    } else {
      await supabase.from("tbl_invoice_allocations").insert({ invoice_line_id: lineId, scope_item_id: scopeItemId, percentage, allocated_amount: allocatedAmount });
    }
    await reloadAllocations(lineId);
    toast.success("Allocation saved");
  };

  const deleteAllocation = async (allocId: number, lineId: number) => {
    await supabase.from("tbl_invoice_allocations").delete().eq("allocation_id", allocId);
    await reloadAllocations(lineId);
    toast.success("Allocation removed");
  };

  const reloadAllocations = async (lineId: number) => {
    const { data: updated } = await supabase.from("tbl_invoice_allocations").select("*").eq("invoice_line_id", lineId);
    const enriched = (updated || []).map((a: any) => {
      const scope = scopeItems.find(s => s.scope_item_id === a.scope_item_id);
      return { ...a, scope_name: scope?.item_name || `Scope #${a.scope_item_id}` };
    });
    setAllocations(prev => ({ ...prev, [lineId]: enriched }));
  };

  const totalInvoiced = invoices.reduce((s, i) => s + (i.total_value || 0), 0);

  if (loading) return null;
  if (invoices.length === 0) return null;

  return (
    <div className="card overflow-hidden h-full">
      {/* Header — collapsible */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-surface-dim/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronRight className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
          <FileText className="h-4 w-4 text-navy" />
          <h3 className="text-sm font-semibold text-navy">Invoices</h3>
          <span className="text-[10px] text-muted font-mono">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""} · {formatCurrency(totalInvoiced)}</span>
        </div>
        <Link href="/invoices" onClick={e => e.stopPropagation()} className="text-[10px] text-starlight-blue hover:underline flex items-center gap-0.5">
          Open Invoices <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </button>

      {!collapsed && (
        <div className="border-t border-subtle">
          {invoices.map(inv => {
            const isExp = expandedInvId === inv.invoice_id;
            return (
              <div key={inv.invoice_id} className="border-b border-subtle last:border-0">
                {/* Invoice summary row */}
                <button onClick={() => toggleExpand(inv.invoice_id)}
                  className="w-full px-5 py-2.5 flex items-center gap-4 hover:bg-surface-dim/30 transition-colors text-left">
                  {isExp ? <ChevronDown className="h-3.5 w-3.5 text-muted shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted shrink-0" />}
                  <span className="text-sm font-medium text-navy flex-1 min-w-0 truncate">{inv.supplier}</span>
                  <span className="text-[10px] text-muted font-mono shrink-0">{inv.invoice_number || "—"}</span>
                  <span className="text-[10px] text-muted shrink-0">{inv.invoice_date ? formatDate(inv.invoice_date) : ""}</span>
                  <span className="text-sm font-mono text-navy font-medium shrink-0 w-20 text-right">{inv.total_value ? formatCurrency(inv.total_value) : "—"}</span>
                </button>

                {/* Expanded lines */}
                {isExp && (
                  <div className="px-5 pb-3 bg-surface-dim/30">
                    {invLines.length === 0 ? (
                      <p className="text-xs text-muted py-2">No line items</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-[10px] text-muted uppercase tracking-wider">
                            <th className="py-1 font-medium w-6">#</th>
                            <th className="py-1 font-medium">Description</th>
                            <th className="py-1 font-medium">Material</th>
                            <th className="py-1 font-medium text-right">Total</th>
                            <th className="py-1 font-medium w-16">Allocate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invLines.map(l => {
                            const lineAllocs = allocations[l.line_id] || [];
                            const totalPct = lineAllocs.reduce((s, a) => s + a.percentage, 0);
                            const isAlloc = allocatingLineId === l.line_id;
                            return (
                              <tr key={l.line_id} className="border-t border-subtle align-top">
                                <td className="py-1.5 text-muted font-mono">{l.line_number}</td>
                                <td className="py-1.5 text-muted">
                                  {l.raw_description}
                                  {/* Inline allocation badges */}
                                  {lineAllocs.length > 0 && !isAlloc && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {lineAllocs.map(a => (
                                        <span key={a.allocation_id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-starlight-blue/5 text-[9px] text-starlight-blue">
                                          {a.scope_name} · {a.percentage}% · {formatCurrency(a.allocated_amount)}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Inline allocation panel */}
                                  {isAlloc && (
                                    <div className="bg-navy/10/50 border border-starlight-blue/20 rounded-lg px-3 py-2 mt-1.5">
                                      <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-[10px] font-semibold text-navy">Allocate {formatCurrency(l.line_total || 0)}</p>
                                        <div className="flex items-center gap-2">
                                          {totalPct > 0 && <span className="text-[9px] font-mono text-muted">{totalPct}% · {formatCurrency((l.line_total || 0) * (100 - totalPct) / 100)} left</span>}
                                          <button onClick={() => setAllocatingLineId(null)} className="text-muted hover:text-muted"><X className="h-3 w-3" /></button>
                                        </div>
                                      </div>
                                      {lineAllocs.map(a => (
                                        <div key={a.allocation_id} className="flex items-center gap-2 mb-1 bg-surface rounded px-2 py-1 border border-subtle">
                                          <span className="text-[10px] text-navy font-medium flex-1">{a.scope_name}</span>
                                          <span className="text-[10px] font-mono text-muted">{a.percentage}%</span>
                                          <span className="text-[10px] font-mono text-navy">{formatCurrency(a.allocated_amount)}</span>
                                          <button onClick={() => a.allocation_id && deleteAllocation(a.allocation_id, l.line_id)} className="p-0.5 text-faint hover:text-starlight-red"><Trash2 className="h-2.5 w-2.5" /></button>
                                        </div>
                                      ))}
                                      {totalPct < 100 && (
                                        <div className="flex items-center gap-1.5 mt-1">
                                          <select id={`jip-scope-${l.line_id}`} className="flex-1 px-1.5 py-1 border border-subtle rounded text-[10px] bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue">
                                            <option value="">Scope item...</option>
                                            {scopeItems.filter(s => !lineAllocs.some(a => a.scope_item_id === s.scope_item_id)).map(s => (
                                              <option key={s.scope_item_id} value={s.scope_item_id}>{s.item_name || `#${s.scope_item_id}`}</option>
                                            ))}
                                          </select>
                                          <input id={`jip-pct-${l.line_id}`} type="number" min="1" max={100 - totalPct} defaultValue={100 - totalPct}
                                            className="w-12 px-1 py-1 border border-subtle rounded text-[10px] text-right font-mono focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                                          <span className="text-[9px] text-muted">%</span>
                                          <button onClick={() => {
                                            const sel = document.getElementById(`jip-scope-${l.line_id}`) as HTMLSelectElement;
                                            const pct = document.getElementById(`jip-pct-${l.line_id}`) as HTMLInputElement;
                                            if (sel?.value && pct?.value) saveAllocation(l.line_id, Number(sel.value), Number(pct.value));
                                          }} className="px-2 py-1 bg-starlight-blue text-white text-[10px] font-medium rounded hover:bg-navy">Add</button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>

                                <td className="py-1.5">
                                  {l.material_id && materials[l.material_id] ? (
                                    <span className="text-starlight-green font-medium text-[10px]">{materials[l.material_id]}</span>
                                  ) : <span className="text-faint">—</span>}
                                </td>
                                <td className="py-1.5 text-right font-mono text-navy font-medium">{l.line_total ? formatCurrency(l.line_total) : "—"}</td>
                                <td className="py-1.5">
                                  {scopeItems.length > 0 ? (
                                    <div className="flex items-center gap-1">
                                      {totalPct > 0 && (
                                        <span className={"text-[9px] font-mono px-1 py-0.5 rounded " + (totalPct === 100 ? "bg-starlight-green/10 text-starlight-green" : "bg-starlight-blue/10 text-starlight-blue")}>{totalPct}%</span>
                                      )}
                                      <button onClick={() => setAllocatingLineId(isAlloc ? null : l.line_id)}
                                        className={"p-0.5 rounded transition-colors " + (isAlloc ? "text-starlight-blue bg-navy/10" : "text-muted hover:text-starlight-blue")}
                                        title="Allocate to scope items"><Split className="h-3 w-3" /></button>
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
