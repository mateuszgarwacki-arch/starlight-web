"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import {
  ShoppingCart, ChevronDown, ChevronRight, ExternalLink,
  Check, Clock, Package,
} from "lucide-react";
import Link from "next/link";

interface BomOrder {
  bom_id: number;
  item_description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  needs_ordering: string | null;
  ordered_at: string | null;
  supplier: string | null;
  from_stock: string | null;
  scope_name: string | null;
}

interface JobOrdersPanelProps { jobId: number; defaultCollapsed?: boolean; }

export function JobOrdersPanel({ jobId, defaultCollapsed = true }: JobOrdersPanelProps) {
  const supabase = createClient();
  const [items, setItems] = useState<BomOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const load = useCallback(async () => {
    // Get all BOM items for this job that need ordering OR have been ordered
    const { data } = await supabase
      .from("tbl_wo_bom")
      .select(`
        bom_id, item_description, quantity, unit, unit_cost,
        needs_ordering, ordered_at, supplier, from_stock,
        scope_item_id, work_order_id
      `)
      .eq("job_id", jobId)
      .or("needs_ordering.eq.true,ordered_at.not.is.null")
      .order("ordered_at", { ascending: true, nullsFirst: true });
    const bomItems = data || [];

    // Get scope names — via direct scope_item_id or through work_order_id → scope
    const scopeIds = [...new Set(bomItems.map(b => b.scope_item_id).filter(Boolean))];
    const woIds = [...new Set(bomItems.filter(b => !b.scope_item_id && b.work_order_id).map(b => b.work_order_id))];
    let scopeMap: Record<number, string> = {};
    let woScopeMap: Record<number, number> = {};

    if (scopeIds.length > 0) {
      const { data: scopes } = await supabase
        .from("tbl_scope_items").select("scope_item_id, item_name")
        .in("scope_item_id", scopeIds);
      (scopes || []).forEach((s: any) => { scopeMap[s.scope_item_id] = s.item_name; });
    }
    if (woIds.length > 0) {
      const { data: wos } = await supabase
        .from("tbl_work_orders").select("work_order_id, scope_item_id")
        .in("work_order_id", woIds);
      (wos || []).forEach((w: any) => { if (w.scope_item_id) woScopeMap[w.work_order_id] = w.scope_item_id; });
      // Fetch any additional scope names from WO chain
      const extraScopeIds = [...new Set(Object.values(woScopeMap))].filter(id => !scopeMap[id]);
      if (extraScopeIds.length > 0) {
        const { data: extraScopes } = await supabase
          .from("tbl_scope_items").select("scope_item_id, item_name")
          .in("scope_item_id", extraScopeIds);
        (extraScopes || []).forEach((s: any) => { scopeMap[s.scope_item_id] = s.item_name; });
      }
    }

    setItems(bomItems.map((b: any) => {
      const sid = b.scope_item_id || (b.work_order_id ? woScopeMap[b.work_order_id] : null);
      return { ...b, scope_name: sid ? scopeMap[sid] || null : null };
    }));
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const outstanding = items.filter(i => isTruthy(i.needs_ordering) && !i.ordered_at);
  const ordered = items.filter(i => !!i.ordered_at);
  const outstandingCost = outstanding.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);
  const orderedCost = ordered.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <div className="card overflow-hidden h-full">
      <button onClick={() => setCollapsed(!collapsed)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-surface-dim/50 transition-colors">
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronRight className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
          <ShoppingCart className="h-4 w-4 text-navy" />
          <h3 className="text-sm font-semibold text-navy">Orders</h3>
          <span className="text-[10px] text-muted font-mono">
            {outstanding.length > 0 && <span className="text-starlight-amber">{outstanding.length} outstanding</span>}
            {outstanding.length > 0 && ordered.length > 0 && " · "}
            {ordered.length > 0 && <span className="text-starlight-green">{ordered.length} ordered</span>}
          </span>
        </div>
        <Link href="/orders" onClick={e => e.stopPropagation()} className="text-[10px] text-starlight-blue hover:underline flex items-center gap-0.5">
          Open Orders <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </button>

      {!collapsed && (
        <div className="border-t border-subtle max-h-80 overflow-y-auto">
          {/* Outstanding */}
          {outstanding.length > 0 && (
            <div className="px-4 py-2">
              <p className="text-[10px] font-semibold text-starlight-amber uppercase tracking-wider mb-1.5">
                Outstanding · {formatCurrency(outstandingCost)}
              </p>
              {outstanding.map(i => (
                <div key={i.bom_id} className="flex items-center gap-2 py-1.5 border-b border-subtle last:border-0">
                  <Clock className="h-3 w-3 text-starlight-amber shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-navy truncate">{i.item_description}</p>
                    {i.scope_name && <p className="text-[9px] text-muted truncate">{i.scope_name}</p>}
                  </div>
                  <span className="text-[10px] font-mono text-muted shrink-0">{i.quantity} {i.unit}</span>
                  <span className="text-[10px] font-mono text-navy shrink-0 w-14 text-right">{formatCurrency((i.quantity || 0) * (i.unit_cost || 0))}</span>
                </div>
              ))}
            </div>
          )}

          {/* Ordered */}
          {ordered.length > 0 && (
            <div className="px-4 py-2">
              <p className="text-[10px] font-semibold text-starlight-green uppercase tracking-wider mb-1.5">
                Ordered · {formatCurrency(orderedCost)}
              </p>
              {ordered.map(i => (
                <div key={i.bom_id} className="flex items-center gap-2 py-1.5 border-b border-subtle last:border-0">
                  <Check className="h-3 w-3 text-starlight-green shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-navy truncate">{i.item_description}</p>
                    <p className="text-[9px] text-muted truncate">
                      {i.supplier && <span>{i.supplier} · </span>}
                      {i.ordered_at && formatDate(i.ordered_at)}
                      {i.scope_name && <span> · {i.scope_name}</span>}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-muted shrink-0">{i.quantity} {i.unit}</span>
                  <span className="text-[10px] font-mono text-navy shrink-0 w-14 text-right">{formatCurrency((i.quantity || 0) * (i.unit_cost || 0))}</span>
                </div>
              ))}
            </div>
          )}

          {outstanding.length === 0 && ordered.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted">No materials flagged for ordering</p>
          )}
        </div>
      )}
    </div>
  );
}
