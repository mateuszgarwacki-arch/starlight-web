import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Batch import of Expend card spend (S67).
 *
 * Receives rows already classified client-side (action="import" only) via
 * src/lib/expend-import.ts. Each becomes one tbl_invoices row (status "Imported",
 * receipt URL in file_path) + one whole-transaction tbl_invoice_lines row that
 * lands unallocated, to be routed through the existing InvoiceLineRouter.
 *
 * Idempotent on expend_txn_id (unique index uq_invoices_expend_txn): re-running
 * the same CSV skips anything already imported.
 *
 * Job-coded rows arrive with a resolved job_id; quarterly/ghost rows arrive with
 * job_id null (unassigned) and are sorted in the inbox.
 */

interface ImportInvoice {
  expend_txn_id: string;
  supplier: string;
  invoice_date: string | null;
  total_value: number | null;
  job_id: number | null;
  receipt_url: string | null;
  category: string;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = user.app_metadata?.role || user.user_metadata?.role || "freelancer";
  if (role === "freelancer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const invoices: ImportInvoice[] = Array.isArray(body?.invoices) ? body.invoices : [];
  if (invoices.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }

  // Idempotency: skip transactions already imported — as an invoice OR already moved to overhead.
  const txnIds = invoices.map((i) => i.expend_txn_id).filter(Boolean);
  const [invExisting, ohExisting] = await Promise.all([
    supabase.from("tbl_invoices").select("expend_txn_id").in("expend_txn_id", txnIds),
    supabase.from("tbl_overhead_costs").select("expend_txn_id").in("expend_txn_id", txnIds),
  ]);
  if (invExisting.error || ohExisting.error) {
    return NextResponse.json(
      { error: "Idempotency check failed", detail: invExisting.error?.message || ohExisting.error?.message },
      { status: 500 },
    );
  }
  const seen = new Set<string>([
    ...(invExisting.data || []).map((e: any) => e.expend_txn_id),
    ...(ohExisting.data || []).map((e: any) => e.expend_txn_id),
  ]);
  const fresh = invoices.filter((i) => i.expend_txn_id && !seen.has(i.expend_txn_id));

  if (fresh.length === 0) {
    return NextResponse.json({ inserted: 0, skipped_existing: invoices.length, total: invoices.length });
  }

  // Collapse split-transaction rows into one invoice. Expend's "Transaction ID" is
  // per card payment, not per expense line — a single payment can appear as several
  // rows (VAT splits, multi-item receipts) that share the ID. Those are the same
  // payment, so we sum their net amounts into one invoice (and the unique index on
  // expend_txn_id is satisfied: exactly one row per transaction). Within a group the
  // Project/Job routing key is identical, so the merged invoice's job_id is unambiguous.
  const byTxn = new Map<string, ImportInvoice>();
  for (const r of fresh) {
    const ex = byTxn.get(r.expend_txn_id);
    if (ex) {
      ex.total_value = Math.round(((ex.total_value || 0) + (r.total_value || 0)) * 100) / 100;
      if (ex.job_id == null && r.job_id != null) ex.job_id = r.job_id;
      if (!ex.receipt_url && r.receipt_url) ex.receipt_url = r.receipt_url;
    } else {
      byTxn.set(r.expend_txn_id, { ...r });
    }
  }
  const grouped = [...byTxn.values()];

  // Bulk insert invoice headers.
  const invoiceRows = grouped.map((i) => ({
    supplier: (i.supplier || "Unknown").trim(),
    supplier_id: null,
    invoice_number: null,
    invoice_date: i.invoice_date,
    total_value: i.total_value,
    job_id: i.job_id,
    status: "Imported",
    notes: i.category ? `Expend: ${i.category}` : null,
    file_path: i.receipt_url,
    file_type: null,
    file_data: null,
    expend_txn_id: i.expend_txn_id,
    uploaded_by: null,
    processed_at: null,
  }));

  const { data: inserted, error: invErr } = await supabase
    .from("tbl_invoices")
    .insert(invoiceRows)
    .select("invoice_id, expend_txn_id, total_value, supplier");
  if (invErr || !inserted) {
    return NextResponse.json({ error: "Invoice insert failed", detail: invErr?.message }, { status: 500 });
  }

  // One whole-transaction line per invoice (unallocated -> routed in the inbox).
  const lineRows = inserted.map((inv: any) => ({
    invoice_id: inv.invoice_id,
    line_number: 1,
    raw_description: (inv.supplier || "Imported transaction").trim(),
    quantity: null,
    unit: null,
    unit_cost: null,
    line_total: inv.total_value,
    material_id: null,
    match_confidence: null,
    match_status: "unmatched",
    work_order_id: null,
    job_id: null,
    notes: null,
  }));

  const { error: lineErr } = await supabase.from("tbl_invoice_lines").insert(lineRows);
  if (lineErr) {
    // Headers landed but lines failed — surface it so it can be re-run (idempotent).
    return NextResponse.json(
      { error: "Line insert failed after headers inserted", detail: lineErr.message, inserted: inserted.length },
      { status: 500 },
    );
  }

  return NextResponse.json({
    inserted: inserted.length,
    skipped_existing: seen.size,
    total: invoices.length,
  });
}
