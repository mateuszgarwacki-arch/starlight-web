"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  FileText, Upload, Search, Check, X, Plus,
  AlertTriangle, Zap, Package,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface Invoice {
  invoice_id: number;
  supplier: string;
  invoice_number: string | null;
  invoice_date: string | null;
  total_value: number | null;
  job_id: number | null;
  status: string;
  notes: string | null;
  uploaded_at: string;
  processed_at: string | null;
}

interface InvoiceLine {
  line_id?: number;
  line_number: number;
  raw_description: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  line_total: number | null;
  material_id: number | null;
  material_name?: string;
  match_confidence: string | null;
  match_status: string;
  work_order_id: number | null;
  alias_saved: boolean;
  notes: string | null;
}

interface MaterialOption {
  material_id: number;
  material_name: string;
  unit?: string;
  current_unit_cost?: number;
}

interface Alias {
  alias_id: number;
  material_id: number;
  alias_text: string;
  supplier: string | null;
}

interface ExtractedData {
  supplier: string;
  invoice_number: string;
  invoice_date: string;
  total: number;
  lines: { line_number: number; description: string; quantity: number; unit: string; unit_cost: number; line_total: number; }[];
}

// ============================================================
// Main Page
// ============================================================

export default function InvoicesPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [mode, setMode] = useState<"list" | "process">("list");
  const [invoiceForm, setInvoiceForm] = useState({ supplier: "", invoice_number: "", invoice_date: "", total_value: "", job_id: "", notes: "" });
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [searchingLine, setSearchingLine] = useState<number | null>(null);
  const [materialSearch, setMaterialSearch] = useState("");

  // ============================================================
  // Load data
  // ============================================================

  const loadData = useCallback(async () => {
    setLoading(true);
    const [invRes, jobRes, matRes, aliasRes] = await Promise.all([
      supabase.from("tbl_invoices").select("*").order("uploaded_at", { ascending: false }),
      supabase.from("tbl_production_plan").select("job_id, job_number, job_name").order("event_date", { ascending: false }),
      supabase.from("tbl_materials").select("material_id, material_name, unit, current_unit_cost").eq("active", true).order("material_name"),
      supabase.from("tbl_material_aliases").select("*"),
    ]);
    setInvoices(invRes.data || []);
    setJobs(jobRes.data || []);
    setMaterials(matRes.data || []);
    setAliases(aliasRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ============================================================
  // File upload + extraction
  // ============================================================

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setExtractError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const mediaType = file.type || "application/pdf";
      try {
        const res = await fetch("/api/extract-invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_data: base64, media_type: mediaType }),
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Extraction failed"); }
        const data: ExtractedData = await res.json();
        setInvoiceForm({
          supplier: data.supplier || "", invoice_number: data.invoice_number || "",
          invoice_date: data.invoice_date || "", total_value: data.total ? String(data.total) : "",
          job_id: "", notes: "",
        });

        // Auto-match lines against aliases then fuzzy name match
        const matchedLines = data.lines.map((l) => {
          const aliasMatch = aliases.find((a) =>
            a.alias_text.toLowerCase() === l.description.toLowerCase() ||
            l.description.toLowerCase().includes(a.alias_text.toLowerCase())
          );
          const mat = aliasMatch
            ? materials.find((m) => m.material_id === aliasMatch.material_id)
            : materials.find((m) =>
                (m.material_name || "").toLowerCase().includes(l.description.toLowerCase().split(" ").slice(0, 3).join(" ")) ||
                l.description.toLowerCase().includes((m.material_name || "").toLowerCase())
              );
          return {
            line_number: l.line_number, raw_description: l.description, quantity: l.quantity,
            unit: l.unit, unit_cost: l.unit_cost, line_total: l.line_total,
            material_id: mat?.material_id || null, material_name: mat?.material_name || undefined,
            match_confidence: aliasMatch ? "high" : mat ? "medium" : null,
            match_status: mat ? "matched" : "unmatched",
            work_order_id: null, alias_saved: false, notes: null,
          };
        });
        setLines(matchedLines);
        setMode("process");
      } catch (err: any) { setExtractError(err.message); }
      setExtracting(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const startManualEntry = () => {
    setInvoiceForm({ supplier: "", invoice_number: "", invoice_date: new Date().toISOString().split("T")[0], total_value: "", job_id: "", notes: "" });
    setLines([]);
    setMode("process");
  };

  const addLine = () => {
    setLines([...lines, {
      line_number: lines.length + 1, raw_description: "", quantity: 1, unit: "Each",
      unit_cost: null, line_total: null, material_id: null, match_status: "unmatched",
      match_confidence: null, work_order_id: null, alias_saved: false, notes: null,
    }]);
  };

  const assignMaterial = (lineIdx: number, mat: MaterialOption) => {
    const updated = [...lines];
    updated[lineIdx] = { ...updated[lineIdx], material_id: mat.material_id, material_name: mat.material_name, match_status: "confirmed", match_confidence: "manual" };
    setLines(updated);
    setSearchingLine(null);
    setMaterialSearch("");
  };

  const confirmMatch = (lineIdx: number) => {
    const updated = [...lines];
    updated[lineIdx] = { ...updated[lineIdx], match_status: "confirmed" };
    setLines(updated);
  };

  const skipLine = (lineIdx: number) => {
    const updated = [...lines];
    updated[lineIdx] = { ...updated[lineIdx], match_status: "skipped" };
    setLines(updated);
  };

  const updateLine = (lineIdx: number, field: string, value: any) => {
    const updated = [...lines];
    updated[lineIdx] = { ...updated[lineIdx], [field]: value };
    setLines(updated);
  };

  // ============================================================
  // Save invoice + update prices + save aliases
  // ============================================================

  const processInvoice = async () => {
    if (!invoiceForm.supplier.trim()) return;
    setSaving(true);

    const { data: inv, error: invErr } = await supabase.from("tbl_invoices").insert({
      supplier: invoiceForm.supplier.trim(),
      invoice_number: invoiceForm.invoice_number.trim() || null,
      invoice_date: invoiceForm.invoice_date || null,
      total_value: invoiceForm.total_value ? Number(invoiceForm.total_value) : null,
      job_id: invoiceForm.job_id ? Number(invoiceForm.job_id) : null,
      status: "Processed",
      notes: invoiceForm.notes.trim() || null,
      processed_at: new Date().toISOString(),
    }).select("invoice_id").single();

    if (invErr || !inv) { setSaving(false); return; }

    const confirmedLines = lines.filter((l) => l.match_status === "confirmed" || l.match_status === "skipped");
    if (confirmedLines.length > 0) {
      await supabase.from("tbl_invoice_lines").insert(
        confirmedLines.map((l) => ({
          invoice_id: inv.invoice_id, line_number: l.line_number, raw_description: l.raw_description,
          quantity: l.quantity, unit: l.unit, unit_cost: l.unit_cost, line_total: l.line_total,
          material_id: l.material_id, match_confidence: l.match_confidence,
          match_status: l.match_status, work_order_id: l.work_order_id, notes: l.notes,
        }))
      );
    }

    for (const line of confirmedLines) {
      if (line.material_id && line.unit_cost && line.match_status === "confirmed") {
        await supabase.from("tbl_material_prices").insert({
          material_id: line.material_id, unit_cost: line.unit_cost,
          effective_date: invoiceForm.invoice_date || new Date().toISOString().split("T")[0],
          supplier: invoiceForm.supplier.trim(), source: "Invoice",
          notes: `From invoice ${invoiceForm.invoice_number || ""}`.trim(),
        });
        await supabase.from("tbl_materials").update({ current_unit_cost: line.unit_cost }).eq("material_id", line.material_id);

        const mat = materials.find((m) => m.material_id === line.material_id);
        if (mat && line.raw_description.toLowerCase() !== (mat.material_name || "").toLowerCase()) {
          const existingAlias = aliases.find((a) => a.material_id === line.material_id && a.alias_text.toLowerCase() === line.raw_description.toLowerCase());
          if (!existingAlias) {
            await supabase.from("tbl_material_aliases").insert({
              material_id: line.material_id, alias_text: line.raw_description, supplier: invoiceForm.supplier.trim(),
            });
          }
        }
      }
    }

    setSaving(false);
    setMode("list");
    loadData();
  };

  const filteredMaterials = materialSearch
    ? materials.filter((m) => (m.material_name || "").toLowerCase().includes(materialSearch.toLowerCase()))
    : materials.slice(0, 20);

  const confirmedCount = lines.filter((l) => l.match_status === "confirmed").length;
  const unmatchedCount = lines.filter((l) => l.match_status === "unmatched" || l.match_status === "matched").length;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">Loading invoices...</div>;
  }

  // ============================================================
  // LIST MODE
  // ============================================================
  if (mode === "list") {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-navy">Invoices</h1>
            <p className="text-sm text-gray-400 mt-0.5">Upload supplier invoices · auto-match materials · update prices</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={startManualEntry} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-navy hover:bg-gray-100 rounded-lg transition-colors">
              <Plus className="h-4 w-4" /> Manual Entry
            </button>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors cursor-pointer">
              <Upload className="h-4 w-4" /> Upload Invoice
              <input type="file" accept=".pdf,image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {extracting && (
          <div className="card px-5 py-4 border-l-4 border-l-starlight-blue">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-starlight-blue animate-pulse" />
              <div>
                <p className="text-sm font-medium text-navy">Extracting invoice data...</p>
                <p className="text-xs text-gray-400 mt-0.5">Claude is reading the invoice and extracting line items</p>
              </div>
            </div>
          </div>
        )}

        {extractError && (
          <div className="card px-5 py-4 border-l-4 border-l-starlight-red">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-starlight-red" />
              <p className="text-sm text-starlight-red">{extractError}</p>
            </div>
            <p className="text-xs text-gray-400 mt-1">Make sure ANTHROPIC_API_KEY is set in Vercel environment variables, or use Manual Entry.</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="card px-4 py-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Invoices Processed</p>
            <p className="text-lg font-semibold text-navy font-mono">{invoices.filter((i) => i.status === "Processed").length}</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Material Aliases</p>
            <p className="text-lg font-semibold text-starlight-blue font-mono">{aliases.length}</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Materials in Catalogue</p>
            <p className="text-lg font-semibold text-starlight-green font-mono">{materials.length}</p>
          </div>
        </div>

        <div className="card overflow-hidden">
          {invoices.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileText className="h-10 w-10 text-gray-300 mx-auto" />
              <p className="text-sm text-gray-400 mt-3">No invoices processed yet</p>
              <p className="text-xs text-gray-300 mt-1">Upload a PDF or image to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-starlight-bg text-left text-[10px] text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">Supplier</th>
                    <th className="px-4 py-2 font-medium">Invoice #</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                    <th className="px-4 py-2 font-medium">Job</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Processed</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const job = jobs.find((j: any) => j.job_id === inv.job_id);
                    return (
                      <tr key={inv.invoice_id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-navy">{inv.supplier}</td>
                        <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{inv.invoice_number || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{inv.invoice_date ? formatDate(inv.invoice_date) : "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-navy">{inv.total_value ? formatCurrency(inv.total_value) : "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{job ? (job.job_number || job.job_name) : "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium " +
                            (inv.status === "Processed" ? "bg-starlight-green/10 text-starlight-green" : "bg-gray-100 text-gray-500")}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{inv.processed_at ? formatDate(inv.processed_at) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // PROCESS MODE
  // ============================================================
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Process Invoice</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {confirmedCount} confirmed · {unmatchedCount} need matching · {lines.length} total lines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMode("list")} className="px-3 py-2 text-sm text-gray-500 hover:text-navy hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={processInvoice} disabled={saving || confirmedCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
            <Check className="h-4 w-4" /> {saving ? "Saving..." : "Process Invoice"}
          </button>
        </div>
      </div>

      {/* Invoice header */}
      <div className="card px-5 py-4">
        <h3 className="text-xs font-semibold text-navy mb-3">Invoice Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Supplier *</label>
            <input type="text" value={invoiceForm.supplier} onChange={(e) => setInvoiceForm({ ...invoiceForm, supplier: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="Supplier name" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Invoice #</label>
            <input type="text" value={invoiceForm.invoice_number} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="INV-001" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Date</label>
            <input type="date" value={invoiceForm.invoice_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Total (£)</label>
            <input type="number" step="0.01" value={invoiceForm.total_value} onChange={(e) => setInvoiceForm({ ...invoiceForm, total_value: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="0.00" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Link to Job</label>
            <select value={invoiceForm.job_id} onChange={(e) => setInvoiceForm({ ...invoiceForm, job_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue">
              <option value="">No job linked</option>
              {jobs.map((j: any) => (<option key={j.job_id} value={j.job_id}>{j.job_number} — {j.job_name}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Notes</label>
            <input type="text" value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="Any notes..." />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-navy flex items-center gap-2">
            <Package className="h-4 w-4" /> Line Items ({lines.length})
          </h3>
          <button onClick={addLine} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-navy hover:bg-gray-100 rounded-lg transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Line
          </button>
        </div>

        <div className="space-y-2">
          {lines.map((line, idx) => (
            <div key={idx} className={"card px-4 py-3 border-l-4 " + (
              line.match_status === "confirmed" ? "border-l-starlight-green" :
              line.match_status === "skipped" ? "border-l-gray-300" :
              line.match_status === "matched" ? "border-l-starlight-blue" :
              "border-l-starlight-amber"
            )}>
              <div className="flex items-start gap-3">
                <span className="text-[10px] text-gray-400 font-mono mt-2 shrink-0 w-6">{line.line_number}</span>
                <div className="flex-1 min-w-0 space-y-2">
                  <input type="text" value={line.raw_description} onChange={(e) => updateLine(idx, "raw_description", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                    placeholder="Product description from invoice" />

                  <div className="flex items-center gap-2 flex-wrap">
                    {line.material_id ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-starlight-green/10 text-starlight-green">
                        <Check className="h-3 w-3" />
                        {line.material_name || `Material #${line.material_id}`}
                        {line.match_confidence === "high" && <span className="text-[9px] opacity-60">(alias)</span>}
                      </span>
                    ) : (
                      <button onClick={() => { setSearchingLine(idx); setMaterialSearch(""); }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-starlight-amber/10 text-starlight-amber hover:bg-starlight-amber/20 transition-colors">
                        <Search className="h-3 w-3" /> Match Material
                      </button>
                    )}
                    <input type="number" step="0.01" value={line.quantity ?? ""} onChange={(e) => updateLine(idx, "quantity", e.target.value ? Number(e.target.value) : null)}
                      className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="Qty" />
                    <input type="text" value={line.unit ?? ""} onChange={(e) => updateLine(idx, "unit", e.target.value)}
                      className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="Unit" />
                    <input type="number" step="0.01" value={line.unit_cost ?? ""} onChange={(e) => updateLine(idx, "unit_cost", e.target.value ? Number(e.target.value) : null)}
                      className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="£ cost" />
                    {line.line_total != null && (
                      <span className="text-xs font-mono text-navy font-medium">{formatCurrency(line.line_total)}</span>
                    )}
                  </div>

                  {searchingLine === idx && (
                    <div className="border border-gray-200 rounded-lg bg-white shadow-lg p-2 max-h-48 overflow-y-auto">
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                        <input type="text" value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-starlight-blue"
                          placeholder="Search materials..." autoFocus />
                      </div>
                      {filteredMaterials.map((m) => (
                        <button key={m.material_id} onClick={() => assignMaterial(idx, m)}
                          className="w-full text-left px-3 py-1.5 rounded-md text-xs hover:bg-gray-50 transition-colors">
                          <span className="font-medium text-navy">{m.material_name}</span>
                          {m.current_unit_cost && <span className="ml-2 text-gray-400 font-mono">{formatCurrency(m.current_unit_cost)}</span>}
                        </button>
                      ))}
                      {filteredMaterials.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No materials found</p>}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0 mt-1">
                  {line.match_status !== "confirmed" && line.material_id && (
                    <button onClick={() => confirmMatch(idx)} title="Confirm match"
                      className="p-1.5 text-starlight-green hover:bg-green-50 rounded-md transition-colors">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {line.match_status !== "skipped" && (
                    <button onClick={() => skipLine(idx)} title="Skip line"
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {lines.length === 0 && (
          <div className="card px-6 py-8 text-center text-gray-400 text-sm">
            No line items yet. Upload an invoice for auto-extraction, or add lines manually.
          </div>
        )}
      </div>
    </div>
  );
}
