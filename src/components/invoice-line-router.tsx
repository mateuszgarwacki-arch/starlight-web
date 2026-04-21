"use client";

import { useState } from "react";
import { X, Trash2, Split, Truck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import {
  InvoiceAllocation,
  RouteTarget,
  routeLineToTarget,
  addPartialAllocation,
  deleteAllocation,
  splitProRataAcrossSiblings,
  looksLikeShipping,
  summarizeRouting,
} from "@/lib/invoice-routing";

export interface ScopeOption {
  scope_item_id: number;
  item_name: string | null;
}
export interface WOOption {
  work_order_id: number;
  scope_item_id: number | null;
  activity_label: string | null;
  description: string | null;
}

export interface LineForRouter {
  line_id: number;
  raw_description: string;
  line_total: number | null;
}

interface Props {
  line: LineForRouter;
  allocations: InvoiceAllocation[];
  scopeItems: ScopeOption[];
  workOrders: WOOption[];
  siblingAllocations: InvoiceAllocation[];
  onChanged: () => void | Promise<void>;
  compact?: boolean;
}

export function InvoiceLineRouter({
  line,
  allocations,
  scopeItems,
  workOrders,
  siblingAllocations,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitTargetKey, setSplitTargetKey] = useState("");
  const [splitPct, setSplitPct] = useState<number | "">("");

  const lineTotal = line.line_total || 0;

  const scopeNames: Record<number, string> = {};
  scopeItems.forEach((s) => (scopeNames[s.scope_item_id] = s.item_name || `Scope #${s.scope_item_id}`));
  const woLabels: Record<number, string> = {};
  workOrders.forEach((w) => {
    const scopeName = w.scope_item_id ? scopeNames[w.scope_item_id] : null;
    const label = [w.activity_label, w.description].filter(Boolean).join(": ").substring(0, 40);
    woLabels[w.work_order_id] = scopeName
      ? `${label || `WO #${w.work_order_id}`} · ${scopeName}`
      : label || `WO #${w.work_order_id}`;
  });

  const routing = summarizeRouting(allocations, scopeNames, woLabels);
  const isShipping = looksLikeShipping(line.raw_description);
  const otherSiblingAllocs = siblingAllocations.filter((a) => a.invoice_line_id !== line.line_id);
  const hasRoutedSiblings = otherSiblingAllocs.length > 0;

  const currentValue = (() => {
    if (allocations.length === 0) return "job";
    if (allocations.length === 1 && routing.isFullyRouted) {
      const a = allocations[0];
      return a.scope_item_id ? `scope:${a.scope_item_id}` : `wo:${a.work_order_id}`;
    }
    return "split";
  })();

  async function handleDropdownChange(value: string) {
    if (value === "split") {
      setSplitOpen(true);
      return;
    }
    if (value === "shipping-split") {
      await handleShippingShortcut();
      return;
    }
    setBusy(true);
    let target: RouteTarget;
    if (value === "job") target = { type: "job" };
    else if (value.startsWith("scope:"))
      target = { type: "scope", scope_item_id: Number(value.split(":")[1]) };
    else if (value.startsWith("wo:"))
      target = { type: "wo", work_order_id: Number(value.split(":")[1]) };
    else { setBusy(false); return; }
    const { error } = await routeLineToTarget(line.line_id, lineTotal, target);
    setBusy(false);
    if (error) toast.error(error);
    else {
      toast.success(value === "job" ? "Kept at job level" : "Line routed");
      await onChanged();
    }
  }

  async function handleShippingShortcut() {
    setBusy(true);
    const { error, createdCount } = await splitProRataAcrossSiblings(
      line.line_id,
      lineTotal,
      otherSiblingAllocs,
    );
    setBusy(false);
    if (error) toast.error(error);
    else {
      toast.success(`Split pro-rata across ${createdCount} target${createdCount !== 1 ? "s" : ""}`);
      await onChanged();
    }
  }

  async function handleAddSplit() {
    if (!splitTargetKey || !splitPct || splitPct <= 0) return;
    const usedPct = allocations.reduce((s, a) => s + a.percentage, 0);
    if (usedPct + splitPct > 100) {
      toast.error(`Would total ${usedPct + splitPct}% — max 100%`);
      return;
    }
    setBusy(true);
    const target: RouteTarget = splitTargetKey.startsWith("scope:")
      ? { type: "scope", scope_item_id: Number(splitTargetKey.split(":")[1]) }
      : { type: "wo", work_order_id: Number(splitTargetKey.split(":")[1]) };
    const { error } = await addPartialAllocation(line.line_id, lineTotal, target, splitPct as number);
    setBusy(false);
    if (error) toast.error(error);
    else {
      setSplitTargetKey("");
      setSplitPct("");
      await onChanged();
    }
  }

  async function handleDeleteAllocation(allocId: number) {
    setBusy(true);
    const { error } = await deleteAllocation(allocId);
    setBusy(false);
    if (error) toast.error(error);
    else await onChanged();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select
          value={currentValue === "split" ? "" : currentValue}
          onChange={(e) => handleDropdownChange(e.target.value)}
          disabled={busy}
          className="flex-1 min-w-0 px-2 py-1 border border-subtle rounded text-[11px] bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue disabled:opacity-50"
        >
          <option value="job">📋 Keep at Job (unallocated)</option>
          {scopeItems.length > 0 && (
            <optgroup label="— Scopes —">
              {scopeItems.map((s) => (
                <option key={`s${s.scope_item_id}`} value={`scope:${s.scope_item_id}`}>
                  {s.item_name || `Scope #${s.scope_item_id}`}
                </option>
              ))}
            </optgroup>
          )}

          {workOrders.length > 0 && (
            <optgroup label="— Work Orders —">
              {workOrders.map((w) => (
                <option key={`w${w.work_order_id}`} value={`wo:${w.work_order_id}`}>
                  {woLabels[w.work_order_id]}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="— Advanced —">
            <option value="split">Split across multiple targets...</option>
            {isShipping && hasRoutedSiblings && (
              <option value="shipping-split">↔ Split pro-rata across sibling lines</option>
            )}
          </optgroup>
          {currentValue === "split" && (
            <option value="" disabled>
              Split · {allocations.length} targets · {routing.totalPct}%
            </option>
          )}
        </select>

        {currentValue === "split" && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${routing.badgeClass} whitespace-nowrap`}>
            {routing.isFullyRouted ? "100%" : `${routing.totalPct}%`}
          </span>
        )}

        {isShipping && hasRoutedSiblings && allocations.length === 0 && (
          <button
            onClick={handleShippingShortcut}
            disabled={busy}
            title="Split this shipping/carriage line pro-rata across the other routed lines on this invoice"
            className="p-1 rounded text-starlight-amber hover:bg-starlight-amber/10 disabled:opacity-50"
          >
            <Truck className="h-3.5 w-3.5" />
          </button>
        )}

        {(currentValue === "split" || splitOpen) && (
          <button
            onClick={() => setSplitOpen((v) => !v)}
            disabled={busy}
            className="p-1 rounded text-muted hover:text-starlight-blue disabled:opacity-50"
            title="Edit split"
          >
            <Split className="h-3.5 w-3.5" />
          </button>
        )}

        {busy && <Loader2 className="h-3 w-3 animate-spin text-muted" />}
      </div>

      {splitOpen && (
        <div className="border border-starlight-blue/30 rounded-lg bg-navy/5 px-2.5 py-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-navy">
              Split {formatCurrency(lineTotal)} — {routing.totalPct}% allocated · {formatCurrency(lineTotal * (100 - routing.totalPct) / 100)} left
            </span>
            <button onClick={() => setSplitOpen(false)} className="text-muted hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>

          {allocations.map((a) => {
            const label = a.scope_item_id
              ? scopeNames[a.scope_item_id] || `Scope #${a.scope_item_id}`
              : woLabels[a.work_order_id!] || `WO #${a.work_order_id}`;
            const type = a.scope_item_id ? "scope" : "wo";
            return (
              <div key={a.allocation_id} className="flex items-center gap-2 bg-surface rounded px-2 py-1 border border-subtle">
                <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${type === "scope" ? "bg-starlight-blue/10 text-starlight-blue" : "bg-purple-100 text-purple-700"}`}>
                  {type === "scope" ? "S" : "WO"}
                </span>
                <span className="text-[11px] text-navy flex-1 truncate">{label}</span>
                <span className="text-[10px] font-mono text-muted">{a.percentage}%</span>
                <span className="text-[10px] font-mono text-navy">{formatCurrency(a.allocated_amount)}</span>
                <button
                  onClick={() => a.allocation_id && handleDeleteAllocation(a.allocation_id)}
                  disabled={busy}
                  className="p-0.5 text-faint hover:text-starlight-red disabled:opacity-50"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}

          {routing.totalPct < 100 && (
            <div className="flex items-center gap-1.5">
              <select
                value={splitTargetKey}
                onChange={(e) => setSplitTargetKey(e.target.value)}
                className="flex-1 px-1.5 py-1 border border-subtle rounded text-[10px] bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue"
              >
                <option value="">Add target...</option>
                {scopeItems.length > 0 && (
                  <optgroup label="Scopes">
                    {scopeItems
                      .filter((s) => !allocations.some((a) => a.scope_item_id === s.scope_item_id))
                      .map((s) => (
                        <option key={s.scope_item_id} value={`scope:${s.scope_item_id}`}>
                          {s.item_name || `Scope #${s.scope_item_id}`}
                        </option>
                      ))}
                  </optgroup>
                )}
                {workOrders.length > 0 && (
                  <optgroup label="Work Orders">
                    {workOrders
                      .filter((w) => !allocations.some((a) => a.work_order_id === w.work_order_id))
                      .map((w) => (
                        <option key={w.work_order_id} value={`wo:${w.work_order_id}`}>
                          {woLabels[w.work_order_id]}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>

              <input
                type="number"
                min="1"
                max={100 - routing.totalPct}
                value={splitPct}
                onChange={(e) => setSplitPct(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder={`${100 - routing.totalPct}`}
                className="w-12 px-1 py-1 border border-subtle rounded text-[10px] text-right font-mono focus:outline-none focus:ring-1 focus:ring-starlight-blue"
              />
              <span className="text-[9px] text-muted">%</span>
              <button
                onClick={handleAddSplit}
                disabled={busy || !splitTargetKey || !splitPct}
                className="px-2 py-1 bg-starlight-blue text-white text-[10px] font-medium rounded hover:bg-navy disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
