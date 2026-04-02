"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { MasterLookup } from "@/lib/types";

interface LookupComboProps {
  category: string;
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function LookupCombo({
  category,
  value,
  onChange,
  placeholder = "Select...",
  className = "",
  disabled = false,
}: LookupComboProps) {
  const [options, setOptions] = useState<MasterLookup[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("tbl_master_lookups")
      .select("*")
      .eq("category", category)
      .eq("active", true)
      .order("display_order")
      .then(({ data }) => {
        if (data) setOptions(data);
      });
  }, [category]);

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`px-2 py-1.5 border border-subtle rounded text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue focus:border-transparent disabled:bg-surface-dim disabled:text-muted min-w-[180px] ${className}`}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.lookup_id} value={opt.lookup_value || ""}>
          {opt.lookup_value}
        </option>
      ))}
    </select>
  );
}
