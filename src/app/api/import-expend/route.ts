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

  // Idempotency: skip transactions already imported.
  const txnIds = invoices.map((i) => i.expend_txn_id).filter(Boolean);
  const { data: existing, error: exErr } = await supabase
    .from("tbl_invoices")
    .select("expend_txn_id")
    .in("expend_txn_id", txnIds);
  if (exErr) {
    return NextResponse.json({ error: "Idempotency check failed", detail: exErr.message }, { status: 500 });
  }
  const seen = new Set((existing || []).map((e: any) => e.expend_txn_id));
  const fresh = invoices.filter((i) => i.expend_txn_id && !seen.has(i.expend_txn_id));

  if (fresh.length === 0) {
    return NextResponse.json({ inserted: 0, skipped_existing: invoices.length, total: invoices.length });
  }

  // Bulk insert invoice headers.
  const invoiceRows = fresh.map((i) => ({
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
