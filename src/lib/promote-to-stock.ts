import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Promote a bespoke job item to the stock catalogue.
 *
 * Behaviour:
 * - If another job item on the SAME job has already been promoted with the exact
 *   same description, merge into that stock row (bump its stock_quantity).
 * - Otherwise, create a new tbl_stock_items row with:
 *     product_code       = "PROMO-{item_id}"
 *     stock_quantity     = item.quantity ?? 1
 *     source_job_item_id = item.item_id
 *     active             = true
 *     hire_cost_day/week = null  (PM sets on the Stock page)
 * - Link the job item back: stock_item_id, stock_reference, item_source='promoted'.
 * - If the job item still carries the legacy notes flag 'PROMOTE_TO_STOCK', clear it.
 *
 * This helper is deliberately dumb — it doesn't try to "unpromote". Once an item
 * is promoted it shows the Stock badge and the toggle goes away. To undo, edit
 * the stock row directly on the Stock page.
 */

export type PromoteItemInput = {
  item_id: number;
  job_id: number | null;
  description: string | null;
  quantity: number | null;
};

export type PromoteResult =
  | {
      ok: true;
      action: "created" | "merged";
      stockId: number;
      productCode: string;
      description: string;
      newQuantity: number;
    }
  | { ok: false; error: string };

export async function promoteJobItemToStock(
  supabase: SupabaseClient,
  item: PromoteItemInput
): Promise<PromoteResult> {
  const desc = item.description?.trim();
  if (!desc) return { ok: false, error: "Item has no description" };
  if (!item.job_id) return { ok: false, error: "Item has no job_id" };

  const qty = item.quantity ?? 1;

  // Look for another promoted item on the same job with the exact same description
  const { data: siblings, error: sibErr } = await supabase
    .from("tbl_job_items")
    .select("stock_item_id")
    .eq("job_id", item.job_id)
    .eq("description", desc)
    .eq("item_source", "promoted")
    .not("stock_item_id", "is", null)
    .neq("item_id", item.item_id)
    .limit(1);

  if (sibErr) return { ok: false, error: sibErr.message };

  let stockId: number;
  let productCode: string;
  let newQty: number;
  let action: "created" | "merged";

  if (siblings && siblings.length > 0 && siblings[0].stock_item_id) {
    // Merge into the existing stock row
    stockId = siblings[0].stock_item_id;
    const { data: existing, error: exErr } = await supabase
      .from("tbl_stock_items")
      .select("product_code, stock_quantity")
      .eq("stock_id", stockId)
      .single();
    if (exErr || !existing) return { ok: false, error: exErr?.message || "Could not load existing stock row" };

    newQty = (existing.stock_quantity ?? 0) + qty;
    productCode = existing.product_code;
    const { error: updErr } = await supabase
      .from("tbl_stock_items")
      .update({ stock_quantity: newQty, last_checked: new Date().toISOString() })
      .eq("stock_id", stockId);
    if (updErr) return { ok: false, error: updErr.message };
    action = "merged";
  } else {
    // Create a brand new stock row
    productCode = `PROMO-${item.item_id}`;
    newQty = qty;
    const { data: inserted, error: insErr } = await supabase
      .from("tbl_stock_items")
      .insert({
        product_code: productCode,
        description: desc,
        stock_quantity: newQty,
        active: true,
        source_job_item_id: item.item_id,
        last_checked: new Date().toISOString(),
      })
      .select("stock_id")
      .single();
    if (insErr || !inserted) return { ok: false, error: insErr?.message || "Failed to create stock item" };
    stockId = inserted.stock_id;
    action = "created";
  }

  // Link the job item to the stock row
  const { error: linkErr } = await supabase
    .from("tbl_job_items")
    .update({
      stock_item_id: stockId,
      stock_reference: productCode,
      item_source: "promoted",
    })
    .eq("item_id", item.item_id);
  if (linkErr) return { ok: false, error: linkErr.message };

  // Clear the legacy PROMOTE_TO_STOCK flag if present, but DO NOT wipe real user notes
  await supabase
    .from("tbl_job_items")
    .update({ notes: null })
    .eq("item_id", item.item_id)
    .eq("notes", "PROMOTE_TO_STOCK");

  return { ok: true, action, stockId, productCode, description: desc, newQuantity: newQty };
}
