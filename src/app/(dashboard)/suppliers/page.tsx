"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import {
  Building2, Plus, Search, Pencil, X, RefreshCw, Archive,
  FileText, Package, Phone, Mail, ChevronDown, ChevronRight,
} from "lucide-react";

interface Supplier {
  supplier_id: number;
  supplier_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  speciality: string | null;
  payment_terms: string | null;
  account_number: string | null;
  website: string | null;
  notes: string | null;
  active: boolean;
  invoice_count?: number;
  total_spend?: number;
  last_invoice_date?: string;
  material_count?: number;
}

const EMPTY_FORM = {
  supplier_name: "", contact_name: "", contact_email: "", contact_phone: "",
  speciality: "", payment_terms: "", account_number: "", website: "", notes: "",
};

export default function SuppliersPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<"invoices" | "materials">("invoices");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("qry_supplier_summary").select("*").order("supplier_name");
    setSuppliers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = suppliers.filter((s) => {
    if (!showInactive && !isTruthy(s.active)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (s.supplier_name || "").toLowerCase().includes(q) ||
        (s.contact_name || "").toLowerCase().includes(q) ||
        (s.speciality || "").toLowerCase().includes(q);
    }
    return true;
  });

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowDialog(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      supplier_name: s.supplier_name || "", contact_name: s.contact_name || "",
      contact_email: s.contact_email || "", contact_phone: s.contact_phone || "",
      speciality: s.speciality || "", payment_terms: s.payment_terms || "",
      account_number: s.account_number || "", website: s.website || "", notes: s.notes || "",
    });
    setShowDialog(true);
  };

  const saveSupplier = async () => {
    if (!form.supplier_name.trim()) return;
    setSaving(true);
    const payload: Record<string, any> = {
      supplier_name: form.supplier_name.trim(), contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null, contact_phone: form.contact_phone.trim() || null,
      speciality: form.speciality.trim() || null, payment_terms: form.payment_terms.trim() || null,
      account_number: form.account_number.trim() || null, website: form.website.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await supabase.from("tbl_suppliers").update(payload).eq("supplier_id", editing.supplier_id);
    } else {
      payload.active = true;
      await supabase.from("tbl_suppliers").insert(payload);
    }
    setSaving(false); setShowDialog(false); loadData();
  };

  const toggleActive = async (s: Supplier) => {
    await supabase.from("tbl_suppliers").update({ active: !isTruthy(s.active) }).eq("supplier_id", s.supplier_id);
    loadData();
  };

  const loadDetail = async (supplierId: number) => {
    if (expandedId === supplierId) { setExpandedId(null); return; }
    setExpandedId(supplierId); setDetailLoading(true); setDetailTab("invoices");
    const [invRes, matRes] = await Promise.all([
      supabase.from("tbl_invoices").select("invoice_id, invoice_number, invoice_date, total_value, status")
        .eq("supplier_id", supplierId).order("invoice_date", { ascending: false }),
      supabase.from("tbl_materials").select("material_id, material_name, unit, current_unit_cost")
        .eq("supplier_id", supplierId).eq("active", true).order("material_name"),
    ]);
    setInvoices(invRes.data || []); setMaterials(matRes.data || []); setDetailLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted text-sm animate-pulse">Loading suppliers...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Suppliers</h1>
          <p className="text-sm text-muted mt-0.5">{suppliers.filter(s => isTruthy(s.active)).length} active suppliers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-navy hover:bg-surface-mid rounded-lg transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red transition-colors">
            <Plus className="h-4 w-4" /> Add Supplier
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers..."
            className="w-full pl-10 pr-4 py-2.5 border border-subtle rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded border-subtle" />
          Show inactive
        </label>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card px-6 py-10 text-center text-muted text-sm">
            {search ? "No suppliers match your search" : "No suppliers yet — add your first one"}
          </div>
        ) : filtered.map((s) => {
          const isExpanded = expandedId === s.supplier_id;
          return (
            <div key={s.supplier_id} className={"card overflow-hidden " + (!isTruthy(s.active) ? "opacity-50" : "")}>
              <div className="flex items-center gap-4 px-5 py-3.5">
                <button onClick={() => loadDetail(s.supplier_id)} className="shrink-0 text-muted">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-navy">{s.supplier_name}</span>
                    {s.speciality && <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-mid text-muted">{s.speciality}</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted">
                    {s.contact_name && <span>{s.contact_name}</span>}
                    {s.contact_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.contact_phone}</span>}
                    {s.contact_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.contact_email}</span>}
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-6 text-xs shrink-0">
                  <div className="text-center">
                    <p className="font-mono text-navy font-medium">{s.invoice_count || 0}</p>
                    <p className="text-[10px] text-muted">Orders</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-navy font-medium">{s.total_spend ? formatCurrency(s.total_spend) : "£0"}</p>
                    <p className="text-[10px] text-muted">Total Spend</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-muted">{s.material_count || 0}</p>
                    <p className="text-[10px] text-muted">Materials</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted">{s.last_invoice_date ? formatDate(s.last_invoice_date) : "—"}</p>
                    <p className="text-[10px] text-muted">Last Order</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(s)} className="p-1.5 text-muted hover:text-navy hover:bg-surface-mid rounded-md transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => toggleActive(s)} className="p-1.5 text-muted hover:text-starlight-amber hover:bg-starlight-amber/10 rounded-md transition-colors"><Archive className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div className="border-t border-subtle bg-surface-dim/50">
                  <div className="flex gap-1 px-5 pt-3 pb-1">
                    {(["invoices", "materials"] as const).map((t) => (
                      <button key={t} onClick={() => setDetailTab(t)}
                        className={"px-3 py-1.5 rounded-md text-xs font-medium transition-colors " +
                          (detailTab === t ? "bg-surface text-navy shadow-sm" : "text-muted hover:text-navy")}>
                        {t === "invoices" ? <span className="flex items-center gap-1.5"><FileText className="h-3 w-3" /> Orders ({invoices.length})</span>
                          : <span className="flex items-center gap-1.5"><Package className="h-3 w-3" /> Materials ({materials.length})</span>}
                      </button>
                    ))}
                  </div>
                  {detailLoading ? (
                    <div className="px-5 py-4 text-sm text-muted animate-pulse">Loading...</div>
                  ) : detailTab === "invoices" ? (
                    <div className="px-5 pb-4">
                      {invoices.length === 0 ? <p className="text-xs text-muted py-3">No invoices from this supplier</p> : (
                        <table className="w-full text-xs mt-2">
                          <thead><tr className="text-left text-[10px] text-muted uppercase tracking-wider">
                            <th className="py-1.5 font-medium">Invoice #</th><th className="py-1.5 font-medium">Date</th>
                            <th className="py-1.5 font-medium text-right">Total</th><th className="py-1.5 font-medium">Status</th>
                          </tr></thead>
                          <tbody>{invoices.map((inv: any) => (
                            <tr key={inv.invoice_id} className="border-t border-subtle">
                              <td className="py-1.5 font-mono text-navy">{inv.invoice_number || "—"}</td>
                              <td className="py-1.5 text-muted">{inv.invoice_date ? formatDate(inv.invoice_date) : "—"}</td>
                              <td className="py-1.5 text-right font-mono text-navy">{inv.total_value ? formatCurrency(inv.total_value) : "—"}</td>
                              <td className="py-1.5"><span className={"px-2 py-0.5 rounded-full text-[10px] font-medium " +
                                (inv.status === "Processed" ? "bg-starlight-green/10 text-starlight-green" : "bg-surface-mid text-muted")}>{inv.status}</span></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      )}
                    </div>
                  ) : (
                    <div className="px-5 pb-4">
                      {materials.length === 0 ? <p className="text-xs text-muted py-3">No materials linked to this supplier</p> : (
                        <table className="w-full text-xs mt-2">
                          <thead><tr className="text-left text-[10px] text-muted uppercase tracking-wider">
                            <th className="py-1.5 font-medium">Material</th><th className="py-1.5 font-medium">Unit</th>
                            <th className="py-1.5 font-medium text-right">Unit Cost</th>
                          </tr></thead>
                          <tbody>{materials.map((m: any) => (
                            <tr key={m.material_id} className="border-t border-subtle">
                              <td className="py-1.5 font-medium text-navy">{m.material_name}</td>
                              <td className="py-1.5 text-muted">{m.unit || "—"}</td>
                              <td className="py-1.5 text-right font-mono text-navy">{m.current_unit_cost ? formatCurrency(m.current_unit_cost) : "—"}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-subtle flex items-center justify-between sticky top-0 bg-surface rounded-t-xl z-10">
              <h3 className="text-sm font-semibold text-navy">{editing ? "Edit Supplier" : "Add Supplier"}</h3>
              <button onClick={() => setShowDialog(false)} className="text-muted hover:text-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Company Name *</label>
                <input type="text" value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="e.g. Panelco Timber" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Contact Name</label>
                  <input type="text" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="John Smith" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Speciality</label>
                  <input type="text" value={form.speciality} onChange={(e) => setForm({ ...form, speciality: e.target.value })}
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="Timber, Sheet goods" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Phone</label>
                  <input type="text" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="01onal 234 567" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Email</label>
                  <input type="text" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="orders@supplier.co.uk" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Payment Terms</label>
                  <input type="text" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="30 days net" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Account #</label>
                  <input type="text" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="ACC-12345" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Website</label>
                <input type="text" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })}
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="www.supplier.co.uk" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue resize-none" placeholder="Delivery schedule, minimum orders..." />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-subtle flex justify-end gap-2 sticky bottom-0 bg-surface rounded-b-xl">
              <button onClick={() => setShowDialog(false)} className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors">Cancel</button>
              <button onClick={saveSupplier} disabled={saving || !form.supplier_name.trim()}
                className="px-5 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red disabled:opacity-50 transition-colors">
                {saving ? "Saving..." : editing ? "Update" : "Add Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
