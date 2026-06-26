"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getAuthHeaders } from "@/lib/auth-headers";
import { toast } from "sonner";
import Link from "next/link";
import { Upload, ArrowLeft, FileText, Check, AlertTriangle, Ban } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { classifyRow, summarize, parseCsv, type ClassifiedRow } from "@/lib/expend-import";

export default function ImportExpendPage() {
  const supabase = createClient();
  const [jobMap, setJobMap] = useState<Record<string, number>>({});
  const [jobNames, setJobNames] = useState<Record<string, string>>({});
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ClassifiedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<{ inserted: number; skipped: number; total: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tbl_production_plan")
        .select("job_id, job_number, job_name");
      const map: Record<string, number> = {};
      const names: Record<string, string> = {};
      (data || []).forEach((j: any) => {
        if (j.job_number != null) {
          map[String(j.job_number)] = j.job_id;
          names[String(j.job_number)] = j.job_name;
        }
      });
      setJobMap(map);
      setJobNames(names);
      setJobsLoaded(true);
    })();
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!jobsLoaded) {
      toast.error("Still loading jobs — try again in a second.");
      return;
    }
    setFileName(file.name);
    setDone(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCsv(String(reader.result || ""));
        setRows(parsed.map((r) => classifyRow(r, jobMap)));
      } catch (err: any) {
        toast.error(`Could not parse CSV: ${err.message}`);
      }
    };
    reader.onerror = () => toast.error("Could not read file.");
    reader.readAsText(file);
    e.target.value = "";
  };

  const runImport = async () => {
    setImporting(true);
    const payload = rows
      .filter((r) => r.action === "import")
      .map((r) => ({
        expend_txn_id: r.txnId,
        supplier: r.merchant,
        invoice_date: r.date,
        total_value: r.net,
        vat: r.vat,
        job_id: r.jobId,
        receipt_url: r.receiptUrl,
        category: r.category,
      }));
    try {
      const authH = await getAuthHeaders();
      const res = await fetch("/api/import-expend", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH },
        body: JSON.stringify({ invoices: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setDone({ inserted: data.inserted, skipped: data.skipped_existing, total: data.total });
      toast.success(`Imported ${data.inserted} · ${data.skipped_existing} already present`);
    } catch (err: any) {
      toast.error(err.message);
    }
    setImporting(false);
  };

  const summary = summarize(rows);

  const destLabel = (r: ClassifiedRow): { text: string; cls: string } => {
    if (r.action === "skip") return { text: `Skip — ${r.reason}`, cls: "text-faint" };
    if (r.jobId != null) return { text: jobNames[r.code!] || `Job ${r.code}`, cls: "text-starlight-green" };
    return { text: "Unassigned", cls: "text-starlight-amber" };
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/invoices" className="text-muted hover:text-navy transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl font-bold text-navy">Import from Expend</h1>
          </div>
          <p className="text-sm text-muted mt-0.5 ml-6">
            Upload an Expend CSV export · job-coded rows assign automatically · the rest land unassigned to route
          </p>
        </div>
        <label className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red transition-colors cursor-pointer">
          <Upload className="h-4 w-4" /> Choose CSV
          <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
        </label>
      </div>

      {done && (
        <div className="card px-5 py-4 border-l-4 border-l-starlight-green">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-starlight-green" />
            <div>
              <p className="text-sm font-medium text-navy">
                Imported {done.inserted} transaction{done.inserted === 1 ? "" : "s"}
                {done.skipped > 0 && ` · skipped ${done.skipped} already present`}
              </p>
              <Link href="/invoices" className="text-xs text-starlight-blue hover:underline">
                Go to Invoices to route them →
              </Link>
            </div>
          </div>
        </div>
      )}

      {rows.length > 0 && !done && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="card px-4 py-3">
              <p className="text-[10px] text-muted uppercase tracking-wider">To import</p>
              <p className="text-lg font-semibold text-navy font-mono">{summary.toImport}</p>
            </div>
            <div className="card px-4 py-3">
              <p className="text-[10px] text-muted uppercase tracking-wider">Auto-assigned</p>
              <p className="text-lg font-semibold text-starlight-green font-mono">{summary.assignedToJob}</p>
            </div>
            <div className="card px-4 py-3">
              <p className="text-[10px] text-muted uppercase tracking-wider">Unassigned</p>
              <p className="text-lg font-semibold text-starlight-amber font-mono">{summary.unassigned}</p>
            </div>
            <div className="card px-4 py-3">
              <p className="text-[10px] text-muted uppercase tracking-wider">Skipped</p>
              <p className="text-lg font-semibold text-faint font-mono">{summary.skipped}</p>
            </div>
          </div>

          {(summary.missingReceipt > 0 || summary.refunds > 0) && (
            <p className="text-xs text-muted flex items-center gap-3">
              {summary.missingReceipt > 0 && (
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-starlight-amber" /> {summary.missingReceipt} without a receipt
                </span>
              )}
              {summary.refunds > 0 && <span>{summary.refunds} refund/credit (negative)</span>}
            </p>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">{fileName}</p>
            <button
              onClick={runImport}
              disabled={importing || summary.toImport === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red disabled:opacity-50 transition-colors"
            >
              <Check className="h-4 w-4" /> {importing ? "Importing..." : `Import ${summary.toImport}`}
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-base">
                  <tr className="text-left text-[10px] text-muted uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">Merchant</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium text-right">Net</th>
                    <th className="px-4 py-2 font-medium">Code</th>
                    <th className="px-4 py-2 font-medium">Destination</th>
                    <th className="px-4 py-2 font-medium text-center w-16">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const d = destLabel(r);
                    return (
                      <tr
                        key={r.txnId || idx}
                        className={"border-t border-subtle " + (r.action === "skip" ? "opacity-50" : "")}
                      >
                        <td className="px-4 py-2 text-navy">{r.merchant || "—"}</td>
                        <td className="px-4 py-2 text-muted text-xs">{r.date || "—"}</td>
                        <td className="px-4 py-2 text-right font-mono text-navy">
                          {r.net != null ? formatCurrency(r.net) : "—"}
                        </td>
                        <td className="px-4 py-2 text-muted font-mono text-xs">{r.code || "—"}</td>
                        <td className={"px-4 py-2 text-xs font-medium " + d.cls}>{d.text}</td>
                        <td className="px-4 py-2 text-center">
                          {r.action === "skip" ? (
                            <Ban className="h-3.5 w-3.5 text-faint inline" />
                          ) : r.hasReceipt ? (
                            <FileText className="h-3.5 w-3.5 text-starlight-green inline" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-starlight-amber inline" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {rows.length === 0 && !done && (
        <div className="card px-6 py-12 text-center">
          <FileText className="h-10 w-10 text-faint mx-auto" />
          <p className="text-sm text-muted mt-3">Choose an Expend CSV export to preview what will be imported.</p>
        </div>
      )}
    </div>
  );
}
