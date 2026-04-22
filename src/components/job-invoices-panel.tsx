"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FileText, ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { InvoiceLineRouter, ScopeOption, WOOption } from "@/components/invoice-line-router";
import { InvoiceAllocation } from "@/lib/invoice-routing";

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
interface JobRollup {
  invoiced_net_total: number;
  allocated_total: number;
  unallocated_total: number;
  invoice_count: number;
}

interface JobInvoicesPanelProps { jobId: number; defaultCollapsed?: boolean; }

export function JobInvoicesPanel({ jobId, defaultCollapsed = true }: JobInvoicesPanelProps) {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [rollup, setRollup] = useState<JobRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedInvId, setExpandedInvId] = useState<number | null>(null);
  const [invLines, setInvLines] = useState<InvLine[]>([]);
  const [scopeItems, setScopeItems] = useState<ScopeOption[]>([]);
  const [workOrders, setWorkOrders] = useState<WOOption[]>([]);
  const [materials, setMaterials] = useState<Record<number, string>>({});
  const [allocations, setAllocations] = useState<Record<number, InvoiceAllocation[]>>({});
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const loadInvoices = useCallback(async () => {
    const [invRes, scopeRes, woRes, rollupRes] = await Promise.all([
      supabase.from("tbl_invoices")
        .select("invoice_id, supplier, invoice_number, invoice_date, total_value, status")
        .eq("job_id", jobId).order("invoice_date", { ascending: false }),
      supabase.from("tbl_scope_items").select("scope_item_id, item_name")
        .eq("job_id", jobId).order("scope_item_id"),
      supabase.from("tbl_work_orders")
        .select("work_order_id, scope_item_id, description, activity_verb")
        .eq("job_id", jobId).neq("status", "Voided").order("work_order_id"),
      supabase.from("qry_invoice_job_rollup").select("*").eq("job_id", jobId).maybeSingle(),
    ]);

    const woRows = woRes.data || [];
    const actIds = [...new Set(woRows.map((w: any) => w.activity_verb).filter(Boolean))] as number[];
    const actMap: Record<number, string> = {};
    if (actIds.length > 0) {
      const { data: acts } = await supabase.from("tbl_master_lookups")
        .select("lookup_id, lookup_value").in("lookup_id", actIds);
      (acts || []).forEach((a: any) => (actMap[a.lookup_id] = a.lookup_value));
    }
    const enrichedWOs: WOOption[] = woRows.map((w: any) => ({
      work_order_id: w.work_order_id,
      scope_item_id: w.scope_item_id,
      activity_label: w.activity_verb ? actMap[w.activity_verb] || null : null,
      description: w.description,
    }));

    setInvoices(invRes.data || []);
    setScopeItems(scopeRes.data || []);
    setWorkOrders(enrichedWOs);
    setRollup(rollupRes.data || null);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const loadInvoiceDetails = async (invId: number) => {
    const { data: lines } = await supabase.from("tbl_invoice_lines")
      .select("line_id, invoice_id, line_number, raw_description, quantity, unit, unit_cost, line_total, material_id, match_status")
      .eq("invoice_id", invId).order("line_number");
    const lineData = lines || [];
    setInvLines(lineData);

    const matIds = [...new Set(lineData.filter((l: any) => l.material_id).map((l: any) => l.material_id!))] as number[];
    if (matIds.length > 0) {
      const { data: mats } = await supabase.from("tbl_materials")
        .select("material_id, material_name").in("material_id", matIds);
      const map: Record<number, string> = {};
      (mats || []).forEach((m: any) => (map[m.material_id] = m.material_name));
      setMaterials(map);
    } else {
      setMaterials({});
    }

    const lineIds = lineData.map((l: any) => l.line_id);
    if (lineIds.length > 0) {
      const { data: allocs } = await supabase.from("tbl_invoice_allocations")
        .select("*").in("invoice_line_id", lineIds);
      const byLine: Record<number, InvoiceAllocation[]> = {};
      (allocs || []).forEach((a: any) => {
        if (!byLine[a.invoice_line_id]) byLine[a.invoice_line_id] = [];
        byLine[a.invoice_line_id].push(a);
      });
      setAllocations(byLine);
    } else {
      setAllocations({});
    }
  };

  const toggleExpand = async (invId: number) => {
    if (expandedInvId === invId) {
      setExpandedInvId(null);
      setInvLines([]);
      setAllocations({});
      return;
    }
    setExpandedInvId(invId);
    await loadInvoiceDetails(invId);
  };

  const onAllocationChange = async () => {
    if (expandedInvId) {
      const lineIds = invLines.map((l) => l.line_id);
      if (lineIds.length > 0) {
        const { data: allocs } = await supabase
          .from("tbl_invoice_allocations")
          .select("*").in("invoice_line_id", lineIds);
        const byLine: Record<number, InvoiceAllocation[]> = {};
        (allocs || []).forEach((a: any) => {
          if (!byLine[a.invoice_line_id]) byLine[a.invoice_line_id] = [];
          byLine[a.invoice_line_id].push(a);
        });
        setAllocations(byLine);
      }
    }
    const { data: ru } = await supabase.from("qry_invoice_job_rollup").select("*").eq("job_id", jobId).maybeSingle();
    setRollup(ru || null);
  };

  const allInvoiceAllocations: InvoiceAllocation[] = Object.values(allocations).flat();
  const totalInvoiced = invoices.reduce((s, i) => s + (i.total_value || 0), 0);
  const unallocated = rollup?.unallocated_total || 0;
  const hasUnallocated = unallocated > 0.01;

  if (loading) return null;
  if (invoices.length === 0) return null;

  return (
    <div className="card overflow-hidden h-full">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-surface-dim/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {collapsed ? <ChevronRight className="h-4 w-4 text-muted shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted shrink-0" />}
          <FileText className="h-4 w-4 text-navy shrink-0" />
          <h3 className="text-sm font-semibold text-navy shrink-0">Invoices</h3>
          <span className="text-[10px] text-muted font-mono shrink-0">
            {invoices.length} · {formatCurrency(totalInvoiced)}
          </span>
          {hasUnallocated && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-starlight-amber/10 text-starlight-amber px-1.5 py-0.5 rounded font-medium ml-1 shrink-0">
              <AlertTriangle className="h-2.5 w-2.5" />
              {formatCurrency(unallocated)} unallocated
            </span>
          )}
        </div>
        <Link
          href="/invoices"
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] text-starlight-blue hover:underline flex items-center gap-0.5 shrink-0 ml-2"
        >
          Open Invoices <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </button>

      {!collapsed && (
        <div className="border-t border-subtle">
          {invoices.map((inv) => {
            const isExp = expandedInvId === inv.invoice_id;
            return (
              <div key={inv.invoice_id} className="border-b border-subtle last:border-0">
                <button
                  onClick={() => toggleExpand(inv.invoice_id)}
                  className="w-full px-5 py-2.5 flex items-center gap-4 hover:bg-surface-dim/30 transition-colors text-left"
                >
                  {isExp ? <ChevronDown className="h-3.5 w-3.5 text-muted shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted shrink-0" />}
                  <span className="text-sm font-medium text-navy flex-1 min-w-0 truncate">{inv.supplier}</span>
                  <span className="text-[10px] text-muted font-mono shrink-0">{inv.invoice_number || "—"}</span>
                  <span className="text-[10px] text-muted shrink-0">{inv.invoice_date ? formatDate(inv.invoice_date) : ""}</span>
                  <span className="text-sm font-mono text-navy font-medium shrink-0 w-20 text-right">{inv.total_value ? formatCurrency(inv.total_value) : "—"}</span>
                </button>

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
                            <th className="py-1 font-medium text-right w-20">Total</th>
                            <th className="py-1 font-medium w-64">Route to</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invLines.map((l) => {
                            const lineAllocs = allocations[l.line_id] || [];
                            return (
                              <tr key={l.line_id} className="border-t border-subtle align-top">
                                <td className="py-1.5 text-muted font-mono">{l.line_number}</td>
                                <td className="py-1.5 text-muted pr-2 max-w-[420px]">
                                  <div className="break-words">{l.raw_description}</div>
                                  {l.material_id && materials[l.material_id] && (
                                    <div className="text-[10px] text-starlight-green mt-0.5">
                                      {materials[l.material_id]}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 text-right font-mono text-navy font-medium">
                                  {l.line_total ? formatCurrency(l.line_total) : "—"}
                                </td>

                                <td className="py-1.5 pl-2">
                                  <InvoiceLineRouter
                                    line={{
                                      line_id: l.line_id,
                                      raw_description: l.raw_description,
                                      line_total: l.line_total,
                                    }}
                                    allocations={lineAllocs}
                                    scopeItems={scopeItems}
                                    workOrders={workOrders}
                                    siblingAllocations={allInvoiceAllocations}
                                    onChanged={onAllocationChange}
                                  />
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
