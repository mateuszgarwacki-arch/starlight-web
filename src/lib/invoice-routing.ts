/**
 * Invoice line routing helpers.
 *
 * Allocation model (S25):
 * - tbl_invoice_allocations has scope_item_id XOR work_order_id (CHECK constraint).
 * - No allocation row = line stays at job level (unallocated).
 * - Sum of percentages per line <= 100.
 */

import { createClient } from "@/lib/supabase-browser";

export interface InvoiceAllocation {
  allocation_id?: number;
  invoice_line_id: number;
  scope_item_id: number | null;
  work_order_id: number | null;
  percentage: number;
  allocated_amount: number;
  target_label?: string;
  target_type?: "scope" | "wo";
}

export interface RouteTarget {
  type: "scope" | "wo" | "job";
  scope_item_id?: number;
  work_order_id?: number;
  label?: string;
}

export interface InvoiceLineForRouting {
  line_id: number;
  line_total: number | null;
}

/**
 * Route a whole invoice line (100%) to a single target.
 * Clears any existing allocations on this line first.
 */
export async function routeLineToTarget(
  lineId: number,
  lineTotal: number,
  target: RouteTarget,
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { error: delErr } = await supabase
    .from("tbl_invoice_allocations")
    .delete()
    .eq("invoice_line_id", lineId);
  if (delErr) return { error: delErr.message };

  if (target.type === "job") return {};

  if (target.type === "scope" && target.scope_item_id) {
    const { error } = await supabase.from("tbl_invoice_allocations").insert({
      invoice_line_id: lineId,
      scope_item_id: target.scope_item_id,
      work_order_id: null,
      percentage: 100,
      allocated_amount: lineTotal,
    });
    return error ? { error: error.message } : {};
  }

  if (target.type === "wo" && target.work_order_id) {
    const { error } = await supabase.from("tbl_invoice_allocations").insert({
      invoice_line_id: lineId,
      scope_item_id: null,
      work_order_id: target.work_order_id,
      percentage: 100,
      allocated_amount: lineTotal,
    });
    return error ? { error: error.message } : {};
  }

  return { error: "Invalid target" };
}

/**
 * Add a partial allocation to a line (keeps existing allocations).
 */
export async function addPartialAllocation(
  lineId: number,
  lineTotal: number,
  target: RouteTarget,
  percentage: number,
): Promise<{ error?: string }> {
  if (target.type === "job") return { error: "Cannot split to Job" };
  const supabase = createClient();
  const allocatedAmount = Math.round((lineTotal * percentage) / 100 * 100) / 100;

  const payload = {
    invoice_line_id: lineId,
    percentage,
    allocated_amount: allocatedAmount,
    scope_item_id: target.type === "scope" ? target.scope_item_id : null,
    work_order_id: target.type === "wo" ? target.work_order_id : null,
  };
  const { error } = await supabase.from("tbl_invoice_allocations").insert(payload);
  return error ? { error: error.message } : {};
}

export async function deleteAllocation(allocationId: number): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("tbl_invoice_allocations")
    .delete()
    .eq("allocation_id", allocationId);
  return error ? { error: error.message } : {};
}

/**
 * Split pro-rata across sibling lines' existing allocations.
 * Use case: shipping line on an invoice with already-routed material lines.
 */
export async function splitProRataAcrossSiblings(
  lineId: number,
  lineTotal: number,
  siblingAllocations: InvoiceAllocation[],
): Promise<{ error?: string; createdCount?: number }> {
  if (siblingAllocations.length === 0) {
    return { error: "No other lines on this invoice are routed yet." };
  }

  const weights = new Map<string, { type: "scope" | "wo"; id: number; amount: number }>();
  for (const a of siblingAllocations) {
    if (a.invoice_line_id === lineId) continue;
    const key = a.scope_item_id ? `s${a.scope_item_id}` : `w${a.work_order_id}`;
    const type = a.scope_item_id ? "scope" : "wo";
    const id = (a.scope_item_id ?? a.work_order_id) as number;
    const existing = weights.get(key);
    if (existing) existing.amount += a.allocated_amount;
    else weights.set(key, { type, id, amount: a.allocated_amount });
  }

  const total = Array.from(weights.values()).reduce((s, w) => s + w.amount, 0);
  if (total <= 0) return { error: "Sibling allocations total zero." };

  const supabase = createClient();
  await supabase.from("tbl_invoice_allocations").delete().eq("invoice_line_id", lineId);

  const entries = Array.from(weights.values());
  let pctAccumulated = 0;
  let amountAccumulated = 0;
  const rows: any[] = [];
  entries.forEach((w, i) => {
    const isLast = i === entries.length - 1;
    const pctRaw = (w.amount / total) * 100;
    const pct = isLast ? Math.round((100 - pctAccumulated) * 100) / 100
                       : Math.round(pctRaw * 100) / 100;
    const amtRaw = (lineTotal * pct) / 100;
    const amt = isLast ? Math.round((lineTotal - amountAccumulated) * 100) / 100
                       : Math.round(amtRaw * 100) / 100;
    pctAccumulated += pct;
    amountAccumulated += amt;
    rows.push({
      invoice_line_id: lineId,
      scope_item_id: w.type === "scope" ? w.id : null,
      work_order_id: w.type === "wo" ? w.id : null,
      percentage: pct,
      allocated_amount: amt,
    });
  });

  const { error } = await supabase.from("tbl_invoice_allocations").insert(rows);
  return error ? { error: error.message } : { createdCount: rows.length };
}

/**
 * Heuristic: does this look like a shipping/carriage/delivery line?
 */
export function looksLikeShipping(description: string | null): boolean {
  if (!description) return false;
  const d = description.toLowerCase();
  return /\b(shipping|carriage|delivery|freight|postage|haulage|courier)\b/.test(d);
}

/**
 * Summarise a line's current routing state.
 */
export function summarizeRouting(
  allocs: InvoiceAllocation[],
  scopeNames: Record<number, string>,
  woLabels: Record<number, string>,
): {
  label: string;
  badgeClass: string;
  isFullyRouted: boolean;
  totalPct: number;
} {
  if (allocs.length === 0) {
    return {
      label: "Job",
      badgeClass: "bg-slate-100 text-slate-600",
      isFullyRouted: false,
      totalPct: 0,
    };
  }
  const totalPct = allocs.reduce((s, a) => s + a.percentage, 0);
  const isFullyRouted = totalPct >= 99.5 && totalPct <= 100.5;

  if (allocs.length === 1 && isFullyRouted) {
    const a = allocs[0];
    const label = a.scope_item_id
      ? scopeNames[a.scope_item_id] || `Scope #${a.scope_item_id}`
      : woLabels[a.work_order_id!] || `WO #${a.work_order_id}`;
    return {
      label,
      badgeClass: a.scope_item_id
        ? "bg-starlight-blue/10 text-starlight-blue"
        : "bg-purple-100 text-purple-700",
      isFullyRouted: true,
      totalPct: 100,
    };
  }

  return {
    label: `Split · ${allocs.length} targets`,
    badgeClass: isFullyRouted
      ? "bg-starlight-green/10 text-starlight-green"
      : "bg-starlight-amber/10 text-starlight-amber",
    isFullyRouted,
    totalPct,
  };
}
