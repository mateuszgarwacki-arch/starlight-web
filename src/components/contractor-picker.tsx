"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import { X, Building2, Plus } from "lucide-react";

interface Contractor {
  contractor_id: number;
  company_name: string | null;
  contact_name: string | null;
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
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(currentContractorId);
  const [quoteValue, setQuoteValue] = useState(currentQuoteValue?.toString() || "");
  const [description, setDescription] = useState(currentDescription || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("tbl_contractors")
      .select("contractor_id, company_name, contact_name, speciality")
      .eq("active", true)
      .order("company_name")
      .then(({ data }) => {
        if (data) setContractors(data);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);

    // Delete existing link if any
    await supabase
      .from("tbl_quote_line_contractors")
      .delete()
      .eq("quote_line_id", quoteLineId);

    // Insert new link if contractor selected
    if (selectedId) {
      await supabase.from("tbl_quote_line_contractors").insert({
        quote_line_id: quoteLineId,
        contractor_id: selectedId,
        contractor_quote_value: quoteValue ? parseFloat(quoteValue) : null,
        description: description || null,
      });
    }

    setSaving(false);
    setIsOpen(false);
    onUpdate();
  };

  // Compact display when not editing
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs hover:bg-blue-50 px-2 py-1 rounded transition-colors"
      >
        <Building2 className="h-3.5 w-3.5 text-starlight-blue" />
        {currentContractorName ? (
          <span className="text-starlight-blue font-medium">{currentContractorName}</span>
        ) : (
          <span className="text-gray-400">Assign contractor...</span>
        )}
        {currentQuoteValue && (
          <span className="text-gray-400 ml-1">({formatCurrency(currentQuoteValue)})</span>
        )}
      </button>
    );
  }

  // Expanded picker
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-3 min-w-[280px]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Assign Contractor</span>
        <button onClick={() => setIsOpen(false)} className="p-0.5 hover:bg-gray-100 rounded">
          <X className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </div>

      {/* Contractor select */}
      <select
        value={selectedId || ""}
        onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue"
      >
        <option value="">Select contractor...</option>
        {contractors.map((c) => (
          <option key={c.contractor_id} value={c.contractor_id}>
            {c.company_name}{c.speciality ? ` (${c.speciality})` : ""}
          </option>
        ))}
      </select>

      {/* Their quote value */}
      <div>
        <label className="block text-[10px] text-gray-400 mb-0.5">Their quote (£)</label>
        <input
          type="number"
          step="0.01"
          value={quoteValue}
          onChange={(e) => setQuoteValue(e.target.value)}
          placeholder="0.00"
          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
        />
      </div>

      {/* What they're providing */}
      <div>
        <label className="block text-[10px] text-gray-400 mb-0.5">What they provide</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Full AV setup and operation"
          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <a href="/contractors" className="text-xs text-starlight-blue hover:underline">
          Manage contractors
        </a>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-starlight-blue text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
