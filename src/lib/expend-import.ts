/**
 * Expend CSV batch-import classification (S67).
 *
 * Pure, side-effect-free rules. Validated against the Jan–Apr 2026 export (93 rows):
 *   6 skipped (5 OPEN + 1 Personal), 87 imported — 21 to a live job, 66 unassigned.
 *
 * Rules:
 *  - Skip rows that are not APPROVED (OPEN / unsubmitted) or are Personal expenses.
 *  - Routing key is the leading code in `Project` (fallback `Job`):
 *      • code matches a live job_number  -> assign that job_id (route to scope later)
 *      • quarterly bucket / ghost job / no match -> job_id null (unassigned, routed in the inbox)
 *  - Net cost is `Amount (excluding tax)` (may be negative — a refund/credit).
 *  - Receipt is the `Attachments` URL (may be blank -> flagged, still imported).
 *  - Idempotency key is `Transaction ID` (stored in tbl_invoices.expend_txn_id).
 */

// Exact Expend export headers this importer reads.
export const EXPEND_COLS = {
  txnId: "Transaction ID",
  date: "Date",
  merchant: "Merchant",
  job: "Job",
  project: "Project",
  category: "Expense Category",
  netAmount: "Amount (excluding tax)",
  taxAmount: "Tax Amount",
  state: "Expense State",
  attachments: "Attachments",
} as const;

export type ExpendRow = Record<string, string>;

export interface ClassifiedRow {
  txnId: string;
  date: string | null; // YYYY-MM-DD
  merchant: string;
  net: number | null; // ex-VAT, may be negative
  vat: number | null;
  receiptUrl: string | null; // Expend Attachments URL, null if none
  code: string | null; // leading code from Project/Job
  category: string;
  jobId: number | null; // resolved live job, or null = unassigned
  action: "import" | "skip";
  reason: string | null; // skip reason (human-readable)
  hasReceipt: boolean;
}

export function parseAmount(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Leading 4+ digit code, e.g. "13506-GHH Grosvenor Hotel(...)" -> "13506". */
export function leadingCode(s: string | null | undefined): string | null {
  const m = String(s ?? "").trim().match(/^(\d{4,})/);
  return m ? m[1] : null;
}

/**
 * Classify one Expend row against the live job_number -> job_id map.
 * jobMap only contains REAL jobs; quarterly codes (13093/13094) and ghost
 * jobs are absent, so they fall through to job_id = null (unassigned).
 */
export function classifyRow(row: ExpendRow, jobMap: Record<string, number>): ClassifiedRow {
  const get = (k: string) => (row[k] ?? "").trim();
  const state = get(EXPEND_COLS.state);
  const category = get(EXPEND_COLS.category);
  const receiptUrl = get(EXPEND_COLS.attachments) || null;
  const code = leadingCode(get(EXPEND_COLS.project)) ?? leadingCode(get(EXPEND_COLS.job));
  const jobId = code != null && Object.prototype.hasOwnProperty.call(jobMap, code) ? jobMap[code] : null;

  const base = {
    txnId: get(EXPEND_COLS.txnId),
    date: get(EXPEND_COLS.date) || null,
    merchant: get(EXPEND_COLS.merchant),
    net: parseAmount(get(EXPEND_COLS.netAmount)),
    vat: parseAmount(get(EXPEND_COLS.taxAmount)),
    receiptUrl,
    code,
    category,
    jobId,
    hasReceipt: receiptUrl != null,
  };

  if (state !== "APPROVED") {
    return { ...base, action: "skip" as const, reason: "Not approved (still OPEN in Expend)" };
  }
  if (category.startsWith("Personal")) {
    return { ...base, action: "skip" as const, reason: "Personal expense" };
  }
  if (!base.txnId) {
    return { ...base, action: "skip" as const, reason: "No Transaction ID" };
  }
  return { ...base, action: "import" as const, reason: null };
}

export interface ClassificationSummary {
  total: number;
  toImport: number;
  skipped: number;
  assignedToJob: number;
  unassigned: number;
  missingReceipt: number;
  refunds: number;
}

export function summarize(rows: ClassifiedRow[]): ClassificationSummary {
  const imp = rows.filter((r) => r.action === "import");
  return {
    total: rows.length,
    toImport: imp.length,
    skipped: rows.length - imp.length,
    assignedToJob: imp.filter((r) => r.jobId != null).length,
    unassigned: imp.filter((r) => r.jobId == null).length,
    missingReceipt: imp.filter((r) => !r.hasReceipt).length,
    refunds: imp.filter((r) => (r.net ?? 0) < 0).length,
  };
}

/**
 * Minimal CSV parser (RFC4180-ish): handles quoted fields, embedded commas,
 * escaped double-quotes, and CRLF. Avoids a third-party dependency for the
 * one place we parse CSV. Returns one object per data row keyed by header.
 */
export function parseCsv(input: string): ExpendRow[] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field); field = "";
    } else if (c === "\n") {
      record.push(field); rows.push(record); record = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || record.length > 0) { record.push(field); rows.push(record); }
  if (rows.length === 0) return [];

  const header = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => {
      const o: ExpendRow = {};
      header.forEach((h, idx) => { o[h] = r[idx] ?? ""; });
      return o;
    });
}
