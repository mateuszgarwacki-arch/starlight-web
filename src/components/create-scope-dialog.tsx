"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { X } from "lucide-react";
import { LookupCombo } from "@/components/ui/lookup-combo";

interface CreateScopeDialogProps {
  jobId: number;
  quoteLine: {
    quote_line_id: number;
    line_text: string | null;
    line_value: number | null;
    event_zone: string | null;
  };
  onClose: () => void;
  onCreated: (scopeItemId: number) => void;
}

export function CreateScopeDialog({
  jobId,
  quoteLine,
  onClose,
  onCreated,
}: CreateScopeDialogProps) {
  const supabase = createClient();
  const [itemName, setItemName] = useState(
    // Auto-populate from full quote line text
    (quoteLine.line_text || "").split("\n")[0].trim()
  );
  const [complexity, setComplexity] = useState("");
  const [finishRelative, setFinishRelative] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!itemName.trim()) {
      setError("Scope item name is required");
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("tbl_scope_items")
      .insert({
        job_id: jobId,
        quote_line_id: quoteLine.quote_line_id,
        item_name: itemName.trim(),
        event_zone: quoteLine.event_zone,
        complexity_construction: complexity || null,
        finish_relative: finishRelative || null,
        status: "Provisional",
        is_general: "false",
        photo_waiver: "false",
        created_at: new Date().toISOString(),
      })
      .select("scope_item_id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    // Mark quote line as interpretation complete
    await supabase
      .from("tbl_quote_lines")
      .update({ interpretation_complete: "true" })
      .eq("quote_line_id", quoteLine.quote_line_id);

    if (data) {
      onCreated(data.scope_item_id);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-navy">
            Create Scope Item
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Quote line context */}
        <div className="px-6 py-3 bg-starlight-bg border-b border-gray-100">
          <p className="text-xs text-gray-500 mb-1">From quote line:</p>
          <p className="text-sm text-gray-700">
            {(quoteLine.line_text || "").substring(0, 200)}
          </p>
          {quoteLine.event_zone && (
            <p className="text-xs text-gray-400 mt-1">
              Zone: {quoteLine.event_zone}
            </p>
          )}
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Scope Item Name <span className="text-gray-400 font-normal">(edit if needed)</span>
            </label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. 12ft Circular Bar, DJ Booth, Food Station..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue focus:border-transparent"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Complexity
              </label>
              <LookupCombo
                category="COMPLEXITY"
                value={complexity}
                onChange={setComplexity}
                placeholder="Select..."
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Finish Relative
              </label>
              <LookupCombo
                category="FINISH_RELATIVE"
                value={finishRelative}
                onChange={setFinishRelative}
                placeholder="Select..."
                className="w-full"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-starlight-red bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Scope Item"}
          </button>
        </div>
      </div>
    </div>
  );
}
