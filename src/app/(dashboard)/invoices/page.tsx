"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import { getAuthHeaders } from "@/lib/auth-headers";
import {
  FileText, Upload, Search, Check, X, Plus, RefreshCw,
  AlertTriangle, Zap, Package, Pencil, Eye, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { ScopeOption, WOOption } from "@/components/invoice-line-router";
import { InvoiceRouteModal } from "@/components/invoice-route-modal";
import { InvoiceAllocation, summarizeRouting } from "@/lib/invoice-routing";

interface Invoice { invoice_id: number; supplier: string; supplier_id: number | null; invoice_number: string | null; invoice_date: string | null; total_value: number | null; job_id: number | null; status: string; notes: string | null; uploaded_at: string; processed_at: string | null; file_path: string | null; file_data: string | null; file_type: string | null; expend_txn_id?: string | null; }
interface InvoiceLine { line_id?: number; invoice_id?: number; line_number: number; raw_description: string; quantity: number | null; unit: string | null; unit_cost: number | null; line_total: number | null; material_id: number | null; material_name?: string; match_confidence: string | null; match_status: string; work_order_id: number | null; job_id: number | null; alias_saved: boolean; notes: string | null; }
interface MaterialOption { material_id: number; material_name: string; unit?: string; current_unit_cost?: number; }
interface SupplierOption { supplier_id: number; supplier_name: string; }
interface Alias { alias_id: number; material_id: number; alias_text: string; supplier: string | null; }
type Mode = "list" | "process" | "edit";

export default function InvoicesPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [mode, setMode] = useState<Mode>("list");
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ supplier: "", supplier_id: "", invoice_number: "", invoice_date: "", total_value: "", job_id: "", notes: "", includes_vat: false });
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [overheadCats, setOverheadCats] = useState<{ lookup_id: number; lookup_value: string }[]>([]);
  const [overheadFor, setOverheadFor] = useState<Invoice | null>(null);
  const [overheadCatId, setOverheadCatId] = useState<string>("");
  const [showPreview, setShowPreview] = useState(true);
  const [searchingLine, setSearchingLine] = useState<number | null>(null);
  const [materialSearch, setMaterialSearch] = useState("");
  const [showNewMaterial, setShowNewMaterial] = useState(false);
  const [newMatLine, setNewMatLine] = useState<number | null>(null);
  const [newMatForm, setNewMatForm] = useState({ name: "", category: "", unit: "" });
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [expandedInvId, setExpandedInvId] = useState<number | null>(null);
  const [previewLines, setPreviewLines] = useState<any[]>([]);
  const [scopeItems, setScopeItems] = useState<ScopeOption[]>([]);
  const [workOrders, setWorkOrders] = useState<WOOption[]>([]);
  const [allocations, setAllocations] = useState<Record<number, InvoiceAllocation[]>>({});
  const [routeCtx, setRouteCtx] = useState<{ line: { line_id: number; raw_description: string; line_total: number | null }; jobId: number } | null>(null);
  const scopeNamesMap = useMemo(() => {
    const m: Record<number, string> = {};
    scopeItems.forEach((s) => { m[s.scope_item_id] = s.item_name || `Scope #${s.scope_item_id}`; });
    return m;
  }, [scopeItems]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [invRes, jobRes, matRes, supRes, aliasRes, unitRes, ohcRes] = await Promise.all([
      supabase.from("tbl_invoices").select("*").order("uploaded_at", { ascending: false }),
      supabase.from("tbl_production_plan").select("job_id, job_number, job_name").order("event_date", { ascending: false }),
      supabase.from("tbl_materials").select("material_id, material_name, unit, current_unit_cost").eq("active", true).order("material_name"),
      supabase.from("tbl_suppliers").select("supplier_id, supplier_name").eq("active", true).order("supplier_name"),
      supabase.from("tbl_material_aliases").select("*"),
      supabase.from("tbl_master_lookups").select("lookup_value").eq("category", "UNIT").eq("active", true).order("display_order"),
      supabase.from("tbl_master_lookups").select("lookup_id, lookup_value").eq("category", "OVERHEAD_CATEGORY").eq("active", true).order("display_order"),
    ]);
    setInvoices(invRes.data || []); setJobs(jobRes.data || []); setMaterials(matRes.data || []);
    setSuppliers(supRes.data || []); setAliases(aliasRes.data || []);
    setUnitOptions((unitRes.data || []).map((u: any) => u.lookup_value).filter(Boolean));
    setOverheadCats((ohcRes.data as any) || []);
    setLoading(false);
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const toggleExpandInvoice = async (invId: number) => {
    if (expandedInvId === invId) { setExpandedInvId(null); setPreviewLines([]); return; }
    setExpandedInvId(invId);
    const inv = invoices.find(i => i.invoice_id === invId);
    // Load lines
    const { data } = await supabase.from("tbl_invoice_lines").select("*").eq("invoice_id", invId).order("line_number");
    const enriched = (data || []).map((l: any) => { const mat = materials.find((m) => m.material_id === l.material_id); return { ...l, material_name: mat?.material_name }; });
    setPreviewLines(enriched);
    // Load scopes + WOs for this invoice's job, in parallel
    if (inv?.job_id) {
      const [scopeRes, woRes] = await Promise.all([
        supabase.from("tbl_scope_items").select("scope_item_id, item_name").eq("job_id", inv.job_id).order("scope_item_id"),
        supabase.from("tbl_work_orders").select("work_order_id, scope_item_id, description, activity_verb").eq("job_id", inv.job_id).neq("status", "Voided").order("work_order_id"),
      ]);
      setScopeItems(scopeRes.data || []);
      // Enrich WOs with activity label
      const woRows = woRes.data || [];
      const actIds = [...new Set(woRows.map((w: any) => w.activity_verb).filter(Boolean))] as number[];
      const actMap: Record<number, string> = {};
      if (actIds.length > 0) {
        const { data: acts } = await supabase.from("tbl_master_lookups").select("lookup_id, lookup_value").in("lookup_id", actIds);
        (acts || []).forEach((a: any) => (actMap[a.lookup_id] = a.lookup_value));
      }
      setWorkOrders(woRows.map((w: any) => ({
        work_order_id: w.work_order_id,
        scope_item_id: w.scope_item_id,
        activity_label: w.activity_verb ? actMap[w.activity_verb] || null : null,
        description: w.description,
      })));
    } else { setScopeItems([]); setWorkOrders([]); }
    // Load existing allocations for all lines in this invoice
    const lineIds = (data || []).map((l: any) => l.line_id).filter(Boolean);
    if (lineIds.length > 0) {
      const { data: allocs } = await supabase.from("tbl_invoice_allocations").select("*").in("invoice_line_id", lineIds);
      const byLine: Record<number, InvoiceAllocation[]> = {};
      (allocs || []).forEach((a: any) => {
        if (!byLine[a.invoice_line_id]) byLine[a.invoice_line_id] = [];
        byLine[a.invoice_line_id].push(a);
      });
      setAllocations(byLine);
    } else { setAllocations({}); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setExtracting(true); setExtractError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const mediaType = file.type || "application/pdf";
      setFileData(base64); setFileType(mediaType); setFilePath(null);
      try {
        const authH = await getAuthHeaders();
        const res = await fetch("/api/extract-invoice", { method: "POST", headers: { "Content-Type": "application/json", ...authH }, body: JSON.stringify({ file_data: base64, media_type: mediaType }) });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Extraction failed"); }
        const data = await res.json();
        const matchedSupplier = suppliers.find((s) => (s.supplier_name || "").toLowerCase() === (data.supplier || "").toLowerCase() || (data.supplier || "").toLowerCase().includes((s.supplier_name || "").toLowerCase()));
        // Check for duplicate invoice
        const existingInv = invoices.find((i) => i.invoice_number && data.invoice_number && i.invoice_number.toLowerCase() === data.invoice_number.toLowerCase());
        if (existingInv) {
          const confirmed = window.confirm(`Invoice ${data.invoice_number} already exists (from ${existingInv.supplier}, ${existingInv.invoice_date ? formatDate(existingInv.invoice_date) : "no date"}). Open it for editing instead?`);
          if (confirmed) { setExtracting(false); openEditInvoice(existingInv); return; }
        }
        setInvoiceForm({ supplier: data.supplier || "", supplier_id: matchedSupplier ? String(matchedSupplier.supplier_id) : "", invoice_number: data.invoice_number || "", invoice_date: data.invoice_date || "", total_value: data.total ? String(data.total) : "", job_id: "", notes: "", includes_vat: false });
        const matchedLines: InvoiceLine[] = (data.lines || []).map((l: any) => {
          const aliasMatch = aliases.find((a) => a.alias_text.toLowerCase() === l.description.toLowerCase() || l.description.toLowerCase().includes(a.alias_text.toLowerCase()));
          const mat = aliasMatch ? materials.find((m) => m.material_id === aliasMatch.material_id) : materials.find((m) => l.description.toLowerCase().includes((m.material_name || "").toLowerCase()));
          return { line_number: l.line_number, raw_description: l.description, quantity: l.quantity, unit: l.unit, unit_cost: l.unit_cost, line_total: l.line_total, material_id: mat?.material_id || null, material_name: mat?.material_name || undefined, match_confidence: aliasMatch ? "high" : mat ? "medium" : null, match_status: mat ? "matched" : "unmatched", work_order_id: null, job_id: null, alias_saved: false, notes: null };
        });
        setLines(matchedLines); setMode("process");
      } catch (err: any) { setExtractError(err.message); }
      setExtracting(false);
    };
    reader.readAsDataURL(file); e.target.value = "";
  };

  const startManualEntry = () => { setInvoiceForm({ supplier: "", supplier_id: "", invoice_number: "", invoice_date: new Date().toISOString().split("T")[0], total_value: "", job_id: "", notes: "", includes_vat: false }); setLines([]); setFileData(null); setFileType(null); setFilePath(null); setEditingInvoiceId(null); setMode("process"); };

  const openEditInvoice = async (inv: Invoice) => {
    setEditingInvoiceId(inv.invoice_id);
    setInvoiceForm({ supplier: inv.supplier || "", supplier_id: inv.supplier_id ? String(inv.supplier_id) : "", invoice_number: inv.invoice_number || "", invoice_date: inv.invoice_date || "", total_value: inv.total_value ? String(inv.total_value) : "", job_id: inv.job_id ? String(inv.job_id) : "", notes: inv.notes || "", includes_vat: false });
    setFileData(inv.file_data || null); setFileType(inv.file_type || null); setFilePath(inv.file_path || null);
    const { data: existingLines } = await supabase.from("tbl_invoice_lines").select("*").eq("invoice_id", inv.invoice_id).order("line_number");
    if (existingLines) { setLines(existingLines.map((l: any) => { const mat = materials.find((m) => m.material_id === l.material_id); return { ...l, material_name: mat?.material_name || undefined }; })); }
    setMode("edit");
  };

  const addLine = () => { setLines([...lines, { line_number: lines.length + 1, raw_description: "", quantity: 1, unit: "Each", unit_cost: null, line_total: null, material_id: null, match_status: "unmatched", match_confidence: null, work_order_id: null, job_id: null, alias_saved: false, notes: null }]); };
  const updateLine = (idx: number, field: string, value: any) => { const updated = [...lines]; updated[idx] = { ...updated[idx], [field]: value }; if (field === "quantity" || field === "unit_cost") { const q = field === "quantity" ? value : updated[idx].quantity; const c = field === "unit_cost" ? value : updated[idx].unit_cost; if (q && c) updated[idx].line_total = Math.round(q * c * 100) / 100; } setLines(updated); };
  const assignMaterial = (idx: number, mat: MaterialOption) => { const updated = [...lines]; updated[idx] = { ...updated[idx], material_id: mat.material_id, material_name: mat.material_name, match_status: "confirmed", match_confidence: "manual" }; setLines(updated); setSearchingLine(null); setMaterialSearch(""); };
  const confirmMatch = (idx: number) => { const updated = [...lines]; updated[idx] = { ...updated[idx], match_status: "confirmed" }; setLines(updated); };
  const skipLine = (idx: number) => { const updated = [...lines]; updated[idx] = { ...updated[idx], match_status: "skipped" }; setLines(updated); };
  const removeLine = (idx: number) => { setLines(lines.filter((_, i) => i !== idx)); };

  const createSupplierInline = async () => {
    const name = newSupplierName.trim() || invoiceForm.supplier.trim();
    if (!name) return; setSaving(true);
    const { data } = await supabase.from("tbl_suppliers").insert({ supplier_name: name, active: true }).select("supplier_id, supplier_name").single();
    if (data) {
      setSuppliers([...suppliers, data].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name)));
      setInvoiceForm({ ...invoiceForm, supplier_id: String(data.supplier_id), supplier: data.supplier_name });
    }
    setSaving(false); setShowNewSupplier(false); setNewSupplierName("");
  };

  const openNewMaterial = (lineIdx: number) => { setNewMatLine(lineIdx); setNewMatForm({ name: "", category: "", unit: lines[lineIdx]?.unit || "Each" }); setShowNewMaterial(true); setSearchingLine(null); };
  const saveNewMaterial = async () => {
    if (!newMatForm.name.trim() || newMatLine === null) return; setSaving(true);
    const line = lines[newMatLine];
    const { data: newMat } = await supabase.from("tbl_materials").insert({ material_name: newMatForm.name.trim(), unit: newMatForm.unit.trim() || null, current_unit_cost: line.unit_cost, active: true, primary_supplier: invoiceForm.supplier.trim() || null, supplier_id: invoiceForm.supplier_id ? Number(invoiceForm.supplier_id) : null }).select("material_id, material_name").single();
    if (newMat) {
      if (line.raw_description.toLowerCase() !== newMat.material_name.toLowerCase()) { await supabase.from("tbl_material_aliases").insert({ material_id: newMat.material_id, alias_text: line.raw_description, supplier: invoiceForm.supplier.trim() || null }); }
      const updated = [...lines]; updated[newMatLine] = { ...updated[newMatLine], material_id: newMat.material_id, material_name: newMat.material_name, match_status: "confirmed", match_confidence: "new" }; setLines(updated);
      const { data: allMats } = await supabase.from("tbl_materials").select("material_id, material_name, unit, current_unit_cost").eq("active", true).order("material_name"); if (allMats) setMaterials(allMats);
    }
    setSaving(false); setShowNewMaterial(false); setNewMatLine(null);
  };

  const applyVatToggle = (includesVat: boolean) => {
    setInvoiceForm({ ...invoiceForm, includes_vat: includesVat });
    if (includesVat) { setLines(lines.map((l) => ({ ...l, unit_cost: l.unit_cost ? Math.round((l.unit_cost / 1.2) * 100) / 100 : l.unit_cost, line_total: l.line_total ? Math.round((l.line_total / 1.2) * 100) / 100 : l.line_total }))); }
  };

  const processInvoice = async () => {
    if (!invoiceForm.supplier.trim() && !invoiceForm.supplier_id) return; setSaving(true);
    const supplierName = invoiceForm.supplier_id ? (suppliers.find(s => s.supplier_id === Number(invoiceForm.supplier_id))?.supplier_name || invoiceForm.supplier) : invoiceForm.supplier;
    const payload: Record<string, any> = { supplier: supplierName.trim(), supplier_id: invoiceForm.supplier_id ? Number(invoiceForm.supplier_id) : null, invoice_number: invoiceForm.invoice_number.trim() || null, invoice_date: invoiceForm.invoice_date || null, total_value: invoiceForm.total_value ? Number(invoiceForm.total_value) : null, job_id: invoiceForm.job_id ? Number(invoiceForm.job_id) : null, status: "Processed", notes: invoiceForm.notes.trim() || null, processed_at: new Date().toISOString(), file_data: fileData || null, file_type: fileType || null };
    let invoiceId = editingInvoiceId;
    if (editingInvoiceId) { await supabase.from("tbl_invoices").update(payload).eq("invoice_id", editingInvoiceId); await supabase.from("tbl_invoice_lines").delete().eq("invoice_id", editingInvoiceId); }
    else { const { data: inv } = await supabase.from("tbl_invoices").insert(payload).select("invoice_id").single(); if (!inv) { setSaving(false); return; } invoiceId = inv.invoice_id; }

    const linesToSave = lines.filter((l) => l.raw_description.trim());
    if (linesToSave.length > 0) { await supabase.from("tbl_invoice_lines").insert(linesToSave.map((l) => ({ invoice_id: invoiceId, line_number: l.line_number, raw_description: l.raw_description, quantity: l.quantity, unit: l.unit, unit_cost: l.unit_cost, line_total: l.line_total, material_id: l.material_id, match_confidence: l.match_confidence, match_status: l.match_status, work_order_id: l.work_order_id, job_id: l.job_id, notes: l.notes }))); }

    for (const line of linesToSave.filter((l) => l.match_status === "confirmed" && l.material_id && l.unit_cost)) {
      await supabase.from("tbl_material_prices").insert({ material_id: line.material_id, unit_cost: line.unit_cost, effective_date: invoiceForm.invoice_date || new Date().toISOString().split("T")[0], supplier: supplierName.trim(), source: "Invoice", notes: `Invoice ${invoiceForm.invoice_number || ""}`.trim() });
      const matUpdate: Record<string, any> = { current_unit_cost: line.unit_cost, primary_supplier: supplierName.trim() };
      if (invoiceForm.supplier_id) matUpdate.supplier_id = Number(invoiceForm.supplier_id);
      await supabase.from("tbl_materials").update(matUpdate).eq("material_id", line.material_id);
      const mat = materials.find((m) => m.material_id === line.material_id);
      if (mat && line.raw_description.toLowerCase() !== (mat.material_name || "").toLowerCase()) {
        const existing = aliases.find((a) => a.material_id === line.material_id && a.alias_text.toLowerCase() === line.raw_description.toLowerCase());
        if (!existing) { await supabase.from("tbl_material_aliases").insert({ material_id: line.material_id, alias_text: line.raw_description, supplier: supplierName.trim() }); }
      }
    }
    setSaving(false); setMode("list"); setEditingInvoiceId(null); loadData();
  };

  // ============================================================
  // Allocation reload (called by InvoiceLineRouter after any change)
  // ============================================================
  const reloadAllocationsForExpanded = async () => {
    const lineIds = previewLines.map((l: any) => l.line_id).filter(Boolean);
    if (lineIds.length === 0) { setAllocations({}); return; }
    const { data: allocs } = await supabase.from("tbl_invoice_allocations").select("*").in("invoice_line_id", lineIds);
    const byLine: Record<number, InvoiceAllocation[]> = {};
    (allocs || []).forEach((a: any) => {
      if (!byLine[a.invoice_line_id]) byLine[a.invoice_line_id] = [];
      byLine[a.invoice_line_id].push(a);
    });
    setAllocations(byLine);
  };

  // Assign a job to an unassigned invoice, then load its scopes/WOs so the line can be routed.
  const assignInvoiceJob = async (inv: Invoice, jobIdStr: string) => {
    const jobId = jobIdStr ? Number(jobIdStr) : null;
    if (jobId == null) return;
    await supabase.from("tbl_invoices").update({ job_id: jobId }).eq("invoice_id", inv.invoice_id);
    setInvoices((prev) => prev.map((i) => (i.invoice_id === inv.invoice_id ? { ...i, job_id: jobId } : i)));
    const [scopeRes, woRes] = await Promise.all([
      supabase.from("tbl_scope_items").select("scope_item_id, item_name").eq("job_id", jobId).order("scope_item_id"),
      supabase.from("tbl_work_orders").select("work_order_id, scope_item_id, description, activity_verb").eq("job_id", jobId).neq("status", "Voided").order("work_order_id"),
    ]);
    setScopeItems(scopeRes.data || []);
    const woRows = woRes.data || [];
    const actIds = [...new Set(woRows.map((w: any) => w.activity_verb).filter(Boolean))] as number[];
    const actMap: Record<number, string> = {};
    if (actIds.length > 0) {
      const { data: acts } = await supabase.from("tbl_master_lookups").select("lookup_id, lookup_value").in("lookup_id", actIds);
      (acts || []).forEach((a: any) => (actMap[a.lookup_id] = a.lookup_value));
    }
    setWorkOrders(woRows.map((w: any) => ({ work_order_id: w.work_order_id, scope_item_id: w.scope_item_id, activity_label: w.activity_verb ? actMap[w.activity_verb] || null : null, description: w.description })));
    toast.success("Job assigned — route the line below");
  };

  // Move an invoice into the overhead pool (tbl_overhead_costs) with a category tag, then clear it.
  const confirmOverhead = async () => {
    const inv = overheadFor;
    if (!inv) return;
    setSaving(true);
    const { error } = await supabase.from("tbl_overhead_costs").insert({
      cost_date: inv.invoice_date || new Date().toISOString().split("T")[0],
      cost_type: "spend",
      category_id: overheadCatId ? Number(overheadCatId) : null,
      description: inv.supplier || "Imported overhead",
      amount: inv.total_value ?? 0,
      supplier_id: inv.supplier_id,
      receipt_url: inv.file_path,
      expend_txn_id: inv.expend_txn_id ?? null,
      note: inv.notes,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    await supabase.from("tbl_invoice_lines").delete().eq("invoice_id", inv.invoice_id);
    await supabase.from("tbl_invoices").delete().eq("invoice_id", inv.invoice_id);
    toast.success(`Moved to overhead${overheadCatId ? "" : " (untagged)"}`);
    setOverheadFor(null); setOverheadCatId(""); setExpandedInvId(null); setSaving(false);
    loadData();
  };

  const filteredMaterials = materialSearch ? materials.filter((m) => (m.material_name || "").toLowerCase().includes(materialSearch.toLowerCase())) : materials.slice(0, 15);
  const confirmedCount = lines.filter((l) => l.match_status === "confirmed").length;
  const unmatchedCount = lines.filter((l) => l.match_status === "unmatched" || l.match_status === "matched").length;
  const lineSum = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const invoiceTotal = invoiceForm.total_value ? Number(invoiceForm.total_value) : 0;
  const totalMatch = invoiceTotal > 0 ? Math.abs(lineSum - invoiceTotal) < 0.02 : true;
  const vatDetected = invoiceTotal > 0 && !totalMatch && Math.abs(lineSum * 1.2 - invoiceTotal) < 1.0;
  const netFromGross = vatDetected ? Math.round(invoiceTotal / 1.2 * 100) / 100 : null;

  if (loading) { return <div className="flex items-center justify-center h-64 text-muted text-sm animate-pulse">Loading invoices...</div>; }

  if (mode === "list") { return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-navy">Invoices</h1><p className="text-sm text-muted mt-0.5">Upload supplier invoices · auto-match materials · update prices</p></div>
        <div className="flex items-center gap-2">
          <Link href="/invoices/import" className="inline-flex items-center gap-2 px-3 py-2 text-sm text-starlight-blue hover:bg-surface-mid rounded-lg transition-colors"><Upload className="h-4 w-4" /> Import from Expend</Link>
          <button onClick={startManualEntry} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-navy hover:bg-surface-mid rounded-lg transition-colors"><Plus className="h-4 w-4" /> Manual Entry</button>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red transition-colors cursor-pointer"><Upload className="h-4 w-4" /> Upload Invoice<input type="file" accept=".pdf,image/*" onChange={handleFileUpload} className="hidden" /></label>
        </div>
      </div>
      {extracting && (<div className="card px-5 py-4 border-l-4 border-l-starlight-blue"><div className="flex items-center gap-3"><Zap className="h-5 w-5 text-starlight-blue animate-pulse" /><div><p className="text-sm font-medium text-navy">Extracting invoice data...</p><p className="text-xs text-muted mt-0.5">Claude is reading the invoice and extracting line items</p></div></div></div>)}
      {extractError && (<div className="card px-5 py-4 border-l-4 border-l-starlight-red"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-starlight-red" /><p className="text-sm text-starlight-red">{extractError}</p></div><p className="text-xs text-muted mt-1">Make sure ANTHROPIC_API_KEY is set in Vercel environment variables, or use Manual Entry.</p></div>)}
      <div className="grid grid-cols-3 gap-3">
        <div className="card px-4 py-3"><p className="text-[10px] text-muted uppercase tracking-wider">Invoices Processed</p><p className="text-lg font-semibold text-navy font-mono">{invoices.filter((i) => i.status === "Processed").length}</p></div>
        <div className="card px-4 py-3"><p className="text-[10px] text-muted uppercase tracking-wider">Material Aliases</p><p className="text-lg font-semibold text-starlight-blue font-mono">{aliases.length}</p></div>
        <div className="card px-4 py-3"><p className="text-[10px] text-muted uppercase tracking-wider">Materials in Catalogue</p><p className="text-lg font-semibold text-starlight-green font-mono">{materials.length}</p></div>
      </div>
      <div className="card overflow-hidden">
        {invoices.length === 0 ? (<div className="px-6 py-12 text-center"><FileText className="h-10 w-10 text-faint mx-auto" /><p className="text-sm text-muted mt-3">No invoices processed yet</p></div>) : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-base text-left text-[10px] text-muted uppercase tracking-wider"><th className="px-4 py-2 font-medium">Supplier</th><th className="px-4 py-2 font-medium">Invoice #</th><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium text-right">Total</th><th className="px-4 py-2 font-medium">Job</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium w-16"></th></tr></thead>
          <tbody>{invoices.map((inv) => { const job = jobs.find((j: any) => j.job_id === inv.job_id); const isExp = expandedInvId === inv.invoice_id; return (<>
            <tr key={inv.invoice_id} className="border-t border-subtle hover:bg-surface-dim cursor-pointer" onClick={() => toggleExpandInvoice(inv.invoice_id)}>
              <td className="px-4 py-2.5 font-medium text-navy">
                <div className="flex items-center gap-2">
                  {isExp ? <ChevronDown className="h-3.5 w-3.5 text-muted shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted shrink-0" />}
                  {inv.supplier}
                </div>
              </td>
              <td className="px-4 py-2.5 text-muted font-mono text-xs">{inv.invoice_number || "—"}</td>
              <td className="px-4 py-2.5 text-muted text-xs">{inv.invoice_date ? formatDate(inv.invoice_date) : "—"}</td>
              <td className="px-4 py-2.5 text-right font-mono text-navy">{inv.total_value ? formatCurrency(inv.total_value) : "—"}</td>
              <td className="px-4 py-2.5 text-xs text-muted">{job ? (job.job_number || job.job_name) : "—"}</td>
              <td className="px-4 py-2.5"><span className={"inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium " + (inv.status === "Processed" ? "bg-starlight-green/10 text-starlight-green" : "bg-surface-mid text-muted")}>{inv.status}</span></td>
              <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEditInvoice(inv)} className="p-1.5 text-muted hover:text-navy hover:bg-surface-mid rounded-md transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={async () => { if (window.confirm(`Delete invoice ${inv.invoice_number || inv.supplier}?`)) { await supabase.from("tbl_invoice_lines").delete().eq("invoice_id", inv.invoice_id); await supabase.from("tbl_invoices").delete().eq("invoice_id", inv.invoice_id); loadData(); } }} className="p-1.5 text-faint hover:text-starlight-red hover:bg-starlight-red/10 rounded-md transition-colors"><X className="h-3.5 w-3.5" /></button>
                </div>
              </td>
            </tr>
            {isExp && (
              <tr key={`${inv.invoice_id}-detail`}><td colSpan={7} className="px-0 py-0 bg-surface-dim/50">
                <div className="px-8 py-3">
                  <div className="flex items-start gap-4">
                    {(inv.file_path || inv.file_data) ? (
                      <div className="rounded-lg border border-subtle overflow-hidden bg-base shrink-0" style={{ width: 320, height: 400 }}>
                        {inv.file_data && inv.file_type?.startsWith("image/")
                          ? <img src={`data:${inv.file_type};base64,${inv.file_data}`} alt="Receipt" className="w-full h-full object-contain" />
                          : inv.file_data && inv.file_type === "application/pdf"
                          ? <iframe src={`data:application/pdf;base64,${inv.file_data}#view=FitH&navpanes=0`} className="w-full h-full border-0" title="Receipt" />
                          : inv.file_path
                          ? <iframe src={inv.file_path} className="w-full h-full border-0" title="Receipt" />
                          : null}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-subtle flex items-center justify-center text-[11px] text-faint shrink-0" style={{ width: 320, height: 120 }}>No receipt on this invoice</div>
                    )}
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {!inv.job_id ? (<>
                          <span className="text-[11px] text-starlight-amber font-medium">Unassigned</span>
                          <select defaultValue="" onChange={(e) => assignInvoiceJob(inv, e.target.value)} className="px-2 py-1 border border-subtle rounded-lg text-xs bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue max-w-[240px]">
                            <option value="">Assign to job…</option>
                            {jobs.map((j: any) => (<option key={j.job_id} value={j.job_id}>{j.job_number} — {j.job_name}</option>))}
                          </select>
                          <span className="text-[11px] text-faint">or</span>
                        </>) : (
                          <span className="text-[11px] text-muted">Job <span className="text-navy font-medium">{(jobs.find((j: any) => j.job_id === inv.job_id)?.job_number) || inv.job_id}</span></span>
                        )}
                        <button onClick={() => { setOverheadFor(inv); setOverheadCatId(""); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-navy/5 text-navy hover:bg-navy/10 transition-colors">→ Overhead</button>
                        {inv.file_path && (<a href={inv.file_path} target="_blank" rel="noopener noreferrer" className="text-[11px] text-starlight-blue hover:underline ml-auto">Open receipt ↗</a>)}
                      </div>
                  {previewLines.length === 0 ? <p className="text-xs text-muted py-2">No line items</p> : (
                    <table className="w-full text-xs">
                      <thead><tr className="text-left text-[10px] text-muted uppercase tracking-wider border-b border-subtle">
                        <th className="py-1.5 font-medium w-8">#</th>
                        <th className="py-1.5 font-medium">Description</th>
                        <th className="py-1.5 font-medium w-32">Material</th>
                        <th className="py-1.5 font-medium text-right w-12">Qty</th>
                        <th className="py-1.5 font-medium w-14">Unit</th>
                        <th className="py-1.5 font-medium text-right w-20">Cost</th>
                        <th className="py-1.5 font-medium text-right w-20">Total</th>
                        <th className="py-1.5 font-medium w-48 pl-3">Route to</th>
                      </tr></thead>
                      <tbody>{previewLines.map((l: any) => {
                        const lineAllocs = allocations[l.line_id] || [];
                        return (
                          <tr key={l.line_id || l.line_number} className="border-t border-subtle align-top">
                            <td className="py-2 text-muted font-mono">{l.line_number}</td>
                            <td className="py-2 text-navy pr-3"><div className="max-w-[280px] leading-snug">{l.raw_description}</div></td>
                            <td className="py-2">{l.material_name ? <span className="text-starlight-green font-medium">{l.material_name}</span> : <span className="text-faint">—</span>}</td>
                            <td className="py-2 text-right font-mono text-muted">{l.quantity || "—"}</td>
                            <td className="py-2 text-muted">{l.unit || "—"}</td>
                            <td className="py-2 text-right font-mono text-muted">{l.unit_cost ? formatCurrency(l.unit_cost) : "—"}</td>
                            <td className="py-2 text-right font-mono text-navy font-medium">{l.line_total ? formatCurrency(l.line_total) : "—"}</td>
                            <td className="py-2 pl-3">
                              {l.line_id && inv.job_id ? (() => {
                                const r = summarizeRouting(lineAllocs, scopeNamesMap, {});
                                const tag = lineAllocs.length === 0 ? "JOB" : r.isFullyRouted ? (lineAllocs.length === 1 ? "✓" : "SPLIT") : `${r.totalPct}%`;
                                return (
                                  <button onClick={() => setRouteCtx({ line: { line_id: l.line_id, raw_description: l.raw_description, line_total: l.line_total }, jobId: inv.job_id! })}
                                    className="inline-flex items-center gap-1.5 w-full max-w-[190px] px-2 py-1.5 rounded-lg border border-subtle bg-surface hover:border-starlight-blue/40 hover:bg-surface-dim transition-colors text-left">
                                    <span className={"text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0 " + (lineAllocs.length === 0 ? "bg-slate-100 text-slate-600" : r.badgeClass)}>{tag}</span>
                                    <span className="text-[11px] text-navy truncate flex-1">{lineAllocs.length === 0 ? "Keep at job" : r.label}</span>
                                    <ChevronRight className="h-3 w-3 text-muted shrink-0" />
                                  </button>
                                );
                              })() : (
                                <span className="text-faint text-[9px]">{!l.line_id ? "" : "No job linked"}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  )}
                    </div>
                  </div>
                </div>
              </td></tr>
            )}
          </>); })}</tbody></table></div>)}
      </div>

      {overheadFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-subtle flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy">Move to Overhead</h3>
              <button onClick={() => setOverheadFor(null)} className="text-muted hover:text-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="text-xs text-muted bg-surface-dim rounded-lg px-3 py-2">
                <span className="text-navy font-medium">{overheadFor.supplier}</span>
                <span className="float-right font-mono text-navy">{overheadFor.total_value != null ? formatCurrency(overheadFor.total_value) : "—"}</span>
                <p className="text-[10px] mt-1 clear-both">Removes the invoice and books it as an overhead spend, keeping the receipt.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Category tag</label>
                <select value={overheadCatId} onChange={(e) => setOverheadCatId(e.target.value)} className="w-full px-3 py-2 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                  <option value="">No category</option>
                  {overheadCats.map((c) => (<option key={c.lookup_id} value={c.lookup_id}>{c.lookup_value}</option>))}
                </select>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-subtle flex justify-end gap-2">
              <button onClick={() => setOverheadFor(null)} className="px-3 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg">Cancel</button>
              <button onClick={confirmOverhead} disabled={saving} className="px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red disabled:opacity-50 transition-colors">{saving ? "Moving..." : "Move to Overhead"}</button>
            </div>
          </div>
        </div>
      )}
    </div>); }

  // PROCESS / EDIT MODE
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-navy">{editingInvoiceId ? "Edit Invoice" : "Process Invoice"}</h1><p className="text-sm text-muted mt-0.5">{confirmedCount} confirmed · {unmatchedCount} need matching · {lines.length} total lines</p></div>
        <div className="flex items-center gap-2">
          {(fileData || filePath) && (<button onClick={() => setShowPreview(!showPreview)} className={"px-3 py-2 text-sm rounded-lg transition-colors " + (showPreview ? "text-starlight-blue bg-navy/10" : "text-muted hover:bg-surface-mid")}><Eye className="h-4 w-4" /></button>)}
          <button onClick={() => { setMode("list"); setEditingInvoiceId(null); }} className="px-3 py-2 text-sm text-muted hover:text-navy hover:bg-surface-mid rounded-lg transition-colors">Cancel</button>
          <button onClick={processInvoice} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red disabled:opacity-50 transition-colors"><Check className="h-4 w-4" /> {saving ? "Saving..." : editingInvoiceId ? "Update Invoice" : "Process Invoice"}</button>
        </div>
      </div>

      <div className={(fileData || filePath) && showPreview ? "grid grid-cols-1 lg:grid-cols-2 gap-5" : ""}>
        <div className="space-y-5">
          {/* Invoice header */}
          <div className="card px-5 py-4">
            <h3 className="text-xs font-semibold text-navy mb-3">Invoice Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-muted mb-1">Supplier *</label>
                <div className="flex gap-2">
                <select value={invoiceForm.supplier_id} onChange={(e) => { const sup = suppliers.find((s) => s.supplier_id === Number(e.target.value)); setInvoiceForm({ ...invoiceForm, supplier_id: e.target.value, supplier: sup?.supplier_name || invoiceForm.supplier }); }}
                  className="flex-1 px-3 py-2 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                  <option value="">Select supplier...</option>
                  {suppliers.map((s) => (<option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>))}
                </select>
                <button onClick={() => { setNewSupplierName(invoiceForm.supplier || ""); setShowNewSupplier(true); }} className="px-2.5 py-2 border border-subtle rounded-lg text-muted hover:text-starlight-blue hover:border-starlight-blue transition-colors" title="Add new supplier"><Plus className="h-4 w-4" /></button>
                </div>
                {!invoiceForm.supplier_id && invoiceForm.supplier && (<p className="text-[10px] text-starlight-amber mt-1">Extracted: &quot;{invoiceForm.supplier}&quot; — select or add new</p>)}
              </div>
              <div><label className="block text-[10px] font-medium text-muted mb-1">Invoice #</label><input type="text" value={invoiceForm.invoice_number} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })} className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="INV-001" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div><label className="block text-[10px] font-medium text-muted mb-1">Date</label><input type="date" value={invoiceForm.invoice_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })} className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" /></div>
              <div><label className="block text-[10px] font-medium text-muted mb-1">Total (£ net)</label><input type="number" step="0.01" value={invoiceForm.total_value} onChange={(e) => setInvoiceForm({ ...invoiceForm, total_value: e.target.value })} className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="0.00" /></div>
              <div><label className="block text-[10px] font-medium text-muted mb-1">Job</label><select value={invoiceForm.job_id} onChange={(e) => setInvoiceForm({ ...invoiceForm, job_id: e.target.value })} className="w-full px-3 py-2 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue"><option value="">No job</option>{jobs.map((j: any) => (<option key={j.job_id} value={j.job_id}>{j.job_number} — {j.job_name}</option>))}</select></div>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none"><input type="checkbox" checked={invoiceForm.includes_vat} onChange={(e) => applyVatToggle(e.target.checked)} className="rounded border-subtle" /> Prices include VAT (strip 20%)</label>
              <div className="flex-1" />
              {invoiceTotal > 0 && (
                <div className="flex items-center gap-2">
                  {totalMatch ? (
                    <div className="text-xs font-mono px-3 py-1 rounded-lg bg-starlight-green/10 text-starlight-green">Lines: {formatCurrency(lineSum)} ✓</div>
                  ) : vatDetected ? (
                    <div className="text-xs font-mono px-3 py-1 rounded-lg bg-starlight-amber/10 text-starlight-amber">Lines: {formatCurrency(lineSum)} net · Invoice total {formatCurrency(invoiceTotal)} incl. VAT ✓</div>
                  ) : (
                    <div className="text-xs font-mono px-3 py-1 rounded-lg bg-starlight-red/10 text-starlight-red">Lines: {formatCurrency(lineSum)} (diff: {formatCurrency(Math.abs(lineSum - invoiceTotal))})</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-navy flex items-center gap-2"><Package className="h-4 w-4" /> Line Items ({lines.length})</h3>
              <button onClick={addLine} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted hover:text-navy hover:bg-surface-mid rounded-lg transition-colors"><Plus className="h-3.5 w-3.5" /> Add Line</button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className={"card px-4 py-3 border-l-4 " + (line.match_status === "confirmed" ? "border-l-starlight-green" : line.match_status === "skipped" ? "border-l-gray-300" : line.match_status === "matched" ? "border-l-starlight-blue" : "border-l-starlight-amber")}>
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] text-muted font-mono mt-2 shrink-0 w-6">{line.line_number}</span>
                    <div className="flex-1 min-w-0 space-y-2">
                      <input type="text" value={line.raw_description} onChange={(e) => updateLine(idx, "raw_description", e.target.value)} className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="Product description from invoice" />
                      <div className="flex items-center gap-2 flex-wrap">
                        {line.material_id ? (
                          <button onClick={() => { setSearchingLine(idx); setMaterialSearch(""); }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-starlight-green/10 text-starlight-green hover:bg-starlight-green/20 transition-colors">
                            <Check className="h-3 w-3" /> {line.material_name || `#${line.material_id}`}
                            {line.match_confidence === "high" && <span className="text-[9px] opacity-60">(alias)</span>}
                            {line.match_confidence === "new" && <span className="text-[9px] opacity-60">(new)</span>}
                          </button>
                        ) : (
                          <button onClick={() => { setSearchingLine(idx); setMaterialSearch(""); }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-starlight-amber/10 text-starlight-amber hover:bg-starlight-amber/20 transition-colors"><Search className="h-3 w-3" /> Match Material</button>
                        )}
                        <input type="number" step="0.01" value={line.quantity ?? ""} onChange={(e) => updateLine(idx, "quantity", e.target.value ? Number(e.target.value) : null)} className="w-20 px-2 py-1 border border-subtle rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="Qty" />
                        <select value={line.unit ?? ""} onChange={(e) => updateLine(idx, "unit", e.target.value)} className="w-20 px-1 py-1 border border-subtle rounded-lg text-xs text-center bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue">
                          <option value="">Unit</option>
                          {unitOptions.map((u) => (<option key={u} value={u}>{u}</option>))}
                        </select>
                        <input type="number" step="0.01" value={line.unit_cost ?? ""} onChange={(e) => updateLine(idx, "unit_cost", e.target.value ? Number(e.target.value) : null)} className="w-24 px-2 py-1 border border-subtle rounded-lg text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="£ cost" />
                        {line.line_total != null && <span className="text-xs font-mono text-navy font-medium">{formatCurrency(line.line_total)}</span>}
                        <select value={line.job_id ?? ""} onChange={(e) => updateLine(idx, "job_id", e.target.value ? Number(e.target.value) : null)} className="px-2 py-1 border border-subtle rounded-lg text-[10px] bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue max-w-[140px]"><option value="">Invoice job</option>{jobs.map((j: any) => (<option key={j.job_id} value={j.job_id}>{j.job_number}</option>))}</select>
                      </div>
                      {searchingLine === idx && (
                        <div className="border border-subtle rounded-lg bg-surface shadow-lg p-2 max-h-56 overflow-y-auto z-10 relative">
                          <div className="mb-1 pb-1 border-b border-subtle"><button onClick={() => openNewMaterial(idx)} className="w-full text-left px-3 py-1.5 rounded-md text-xs text-starlight-blue hover:bg-navy/10 transition-colors font-medium"><Plus className="h-3 w-3 inline mr-1.5" /> Create New Material</button></div>
                          <div className="relative mb-2"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted" /><input type="text" value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 border border-subtle rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-starlight-blue" placeholder="Search materials..." autoFocus /></div>
                          {filteredMaterials.map((m) => (<button key={m.material_id} onClick={() => assignMaterial(idx, m)} className="w-full text-left px-3 py-1.5 rounded-md text-xs hover:bg-surface-dim transition-colors"><span className="font-medium text-navy">{m.material_name}</span>{m.current_unit_cost != null && <span className="ml-2 text-muted font-mono">{formatCurrency(m.current_unit_cost)}</span>}</button>))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-1">
                      {line.match_status !== "confirmed" && line.material_id && (<button onClick={() => confirmMatch(idx)} title="Confirm" className="p-1.5 text-starlight-green hover:bg-starlight-green/10 rounded-md transition-colors"><Check className="h-3.5 w-3.5" /></button>)}
                      {line.match_status !== "skipped" && line.match_status !== "confirmed" && (<button onClick={() => skipLine(idx)} title="Skip" className="p-1.5 text-muted hover:text-muted hover:bg-surface-mid rounded-md transition-colors"><X className="h-3.5 w-3.5" /></button>)}
                      <button onClick={() => removeLine(idx)} title="Remove" className="p-1.5 text-faint hover:text-starlight-red hover:bg-starlight-red/10 rounded-md transition-colors"><X className="h-3 w-3" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {lines.length === 0 && (<div className="card px-6 py-8 text-center text-muted text-sm">No line items. Upload an invoice or add lines manually.</div>)}
          </div>
        </div>

        {/* RIGHT: Invoice preview */}
        {(fileData || filePath) && showPreview && (
          <div className="card overflow-hidden sticky top-4 flex flex-col" style={{ maxHeight: "90vh" }}>
            <div className="px-4 py-2 border-b border-subtle flex items-center justify-between shrink-0"><h3 className="text-xs font-semibold text-navy">Invoice Preview</h3><button onClick={() => setShowPreview(false)} className="text-muted hover:text-muted"><X className="h-4 w-4" /></button></div>
            <div className="flex-1 min-h-0">
              {fileData && fileType?.startsWith("image/") ? (<img src={`data:${fileType};base64,${fileData}`} alt="Invoice" className="w-full h-full object-contain" />) :
               fileData && fileType === "application/pdf" ? (<iframe src={`data:application/pdf;base64,${fileData}#navpanes=0&view=FitH`} className="w-full h-full border-0" style={{ minHeight: "80vh" }} title="Invoice PDF" />) :
               filePath ? (<iframe src={filePath} className="w-full h-full border-0" style={{ minHeight: "80vh" }} title="Receipt" />) :
               (<p className="p-4 text-sm text-muted">Preview not available</p>)}
            </div>
          </div>
        )}
      </div>

      {/* New Supplier Dialog */}
      {showNewSupplier && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-subtle flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy">Add Supplier</h3>
              <button onClick={() => setShowNewSupplier(false)} className="text-muted hover:text-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs font-medium text-muted mb-1">Company Name *</label>
              <input type="text" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)}
                className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                placeholder="e.g. Volund Timber Ltd" autoFocus />
              <p className="text-[10px] text-muted mt-2">You can add contact details later in the Suppliers page.</p>
            </div>
            <div className="px-5 py-3 border-t border-subtle flex justify-end gap-2">
              <button onClick={() => setShowNewSupplier(false)} className="px-3 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg">Cancel</button>
              <button onClick={createSupplierInline} disabled={saving || !newSupplierName.trim()}
                className="px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red disabled:opacity-50 transition-colors">
                {saving ? "Adding..." : "Add & Select"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Material Dialog */}
      {showNewMaterial && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-subtle flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy">Create New Material</h3>
              <button onClick={() => setShowNewMaterial(false)} className="text-muted hover:text-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {newMatLine !== null && lines[newMatLine] && (
                <div className="text-xs text-muted bg-surface-dim rounded-lg px-3 py-2">
                  Invoice: <span className="text-muted">{lines[newMatLine]?.raw_description}</span>
                  <p className="text-[10px] mt-1">This description will be saved as an alias</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Your Internal Name *</label>
                <input type="text" value={newMatForm.name} onChange={(e) => setNewMatForm({ ...newMatForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                  placeholder="e.g. 3x2 CLS Timber" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Unit</label>
                <select value={newMatForm.unit} onChange={(e) => setNewMatForm({ ...newMatForm, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                  <option value="">Select unit...</option>
                  {unitOptions.map((u) => (<option key={u} value={u}>{u}</option>))}
                </select>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-subtle flex justify-end gap-2">
              <button onClick={() => setShowNewMaterial(false)} className="px-3 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg">Cancel</button>
              <button onClick={saveNewMaterial} disabled={saving || !newMatForm.name.trim()}
                className="px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red disabled:opacity-50 transition-colors">
                {saving ? "Creating..." : "Create & Match"}
              </button>
            </div>
          </div>
        </div>
      )}

      {routeCtx && (
        <InvoiceRouteModal
          open={!!routeCtx}
          onClose={() => setRouteCtx(null)}
          line={routeCtx.line}
          jobId={routeCtx.jobId}
          onSaved={reloadAllocationsForExpanded}
        />
      )}
    </div>
  );
}
