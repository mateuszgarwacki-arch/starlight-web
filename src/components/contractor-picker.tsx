"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import { X, Building2 } from "lucide-react";

interface SupplierOption {
  supplier_id: number;
  supplier_name: string;
  speciality: string | null;
}

interface ContractorPickerProps {
  quoteLineId: number;
  currentContractorId: number | null;
  currentContractorName: string | null;
  currentQuoteValue: number | null;
  currentDescription: string | null;
  onUpdate: () => void;
}

export function ContractorPicker({
  quoteLineId,
  currentContractorId,
  currentContractorName,
  currentQuoteValue,
  currentDescription,
  onUpdate,
}: ContractorPickerProps) {
  const supabase = createClient();
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(currentContractorId);
  const [quoteValue, setQuoteValue] = useState(currentQuoteValue?.toString() || "");
  const [description, setDescription] = useState(currentDescription || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("tbl_suppliers")
      .select("supplier_id, supplier_name, speciality")
      .eq("active", true)
      .order("supplier_name")
      .then(({ data }) => {
        if (data) setSuppliers(data);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from("tbl_quote_line_contractors").delete().eq("quote_line_id", quoteLineId);
    if (selectedId) {
      await supabase.from("tbl_quote_line_contractors").insert({
        quote_line_id: quoteLineId,
        supplier_id: selectedId,
        contractor_quote_value: quoteValue ? parseFloat(quoteValue) : null,
        description: description || null,
      });
    }
    setSaving(false);
    setIsOpen(false);
    onUpdate();
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="inline-flex items-center gap-1.5 text-xs hover:bg-navy/10 px-2 py-1 rounded transition-colors">
        <Building2 className="h-3.5 w-3.5 text-starlight-blue" />
        {currentContractorName ? (
          <span className="text-starlight-blue font-medium">{currentContractorName}</span>
        ) : (
          <span className="text-muted">Assign supplier...</span>
        )}
        {currentQuoteValue && (
          <span className="text-muted ml-1">({formatCurrency(currentQuoteValue)})</span>
        )}
      </button>
    );
  }

  return (
    <div className="bg-surface border border-subtle rounded-lg shadow-lg p-3 space-y-3 min-w-[280px]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Assign Supplier / Subcontractor</span>
        <button onClick={() => setIsOpen(false)} className="p-0.5 hover:bg-surface-mid rounded"><X className="h-3.5 w-3.5 text-muted" /></button>
      </div>
      <select value={selectedId || ""} onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
        className="w-full px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue">
        <option value="">Select supplier...</option>
        {suppliers.map((s) => (
          <option key={s.supplier_id} value={s.supplier_id}>
            {s.supplier_name}{s.speciality ? ` (${s.speciality})` : ""}
          </option>
        ))}
      </select>
      <div>
        <label className="block text-[10px] text-muted mb-0.5">Their quote (£)</label>
        <input type="number" step="0.01" value={quoteValue} onChange={(e) => setQuoteValue(e.target.value)} placeholder="0.00"
          className="w-full px-2 py-1.5 border border-subtle rounded text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
      </div>
      <div>
        <label className="block text-[10px] text-muted mb-0.5">What they provide</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Full AV setup and operation"
          className="w-full px-2 py-1.5 border border-subtle rounded text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
      </div>
      <div className="flex justify-between items-center">
        <a href="/suppliers" className="text-xs text-starlight-blue hover:underline">Manage suppliers</a>
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 bg-starlight-blue text-white text-xs font-medium rounded hover:bg-navy transition-colors disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
