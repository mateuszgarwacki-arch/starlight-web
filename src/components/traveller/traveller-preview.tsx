"use client";

import { Printer, Package, Tags } from "lucide-react";

interface PrintButtonWO {
  work_order_id: number;
  status: string | null;
  traveller_printed_at?: string | null;
  [key: string]: any;
}

/**
 * Per-WO single traveller print button (shown on each WO row in the work orders panel).
 * Scope-pack printing lives on the scope header via <PrintScopePackButton>.
 */
export function PrintTravellerButton({
  wo,
  scopeId,
}: {
  wo: PrintButtonWO;
  scopeId: number;
}) {
  const openTraveller = () => {
    const params = new URLSearchParams({
      scopeId: String(scopeId),
      mode: "single",
      woId: String(wo.work_order_id),
    });
    window.open(`/traveller?${params.toString()}`, "_blank");
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={openTraveller}
        className="p-1.5 rounded-lg text-muted hover:text-navy hover:bg-surface-mid transition-colors"
        title="Print traveller"
      >
        <Printer className="h-4 w-4" />
      </button>
      {wo.traveller_printed_at && (
        <span
          className="text-[9px] text-muted ml-0.5 cursor-default"
          title={`Last printed: ${new Date(wo.traveller_printed_at).toLocaleString("en-GB")}`}
        >
          <Printer className="h-3 w-3 inline text-starlight-green" />
        </span>
      )}
    </div>
  );
}

/**
 * Per-WO label print button. Opens the 2"×1" label sheet for the Zebra GT800
 * (one label per linked job item). Sits beside the traveller printer icon.
 */
export function PrintLabelsButton({ wo }: { wo: PrintButtonWO }) {
  const openLabels = () => {
    const params = new URLSearchParams({ woId: String(wo.work_order_id) });
    window.open(`/labels?${params.toString()}`, "_blank");
  };

  return (
    <button
      onClick={openLabels}
      className="p-1.5 rounded-lg text-muted hover:text-navy hover:bg-surface-mid transition-colors"
      title="Print item labels (2×1) for this WO"
    >
      <Tags className="h-4 w-4" />
    </button>
  );
}

/**
 * Scope-level print button. Opens the traveller in pack mode, which prints:
 *   Cover (scope description + linked job items + docs summary)
 *   → scope-level drawings
 *   → each non-voided WO (divider + brief + cut lists + drawings + refs)
 * Only rendered when the scope has at least one WO.
 */
export function PrintScopePackButton({ scopeId }: { scopeId: number }) {
  const openTraveller = () => {
    const params = new URLSearchParams({
      scopeId: String(scopeId),
      mode: "pack",
    });
    window.open(`/traveller?${params.toString()}`, "_blank");
  };

  return (
    <button
      onClick={openTraveller}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted hover:text-navy hover:bg-surface-mid border border-subtle transition-colors"
      title="Print full scope pack — description, job items, drawings, and all work orders"
    >
      <Package className="h-4 w-4" />
      <span>Print scope pack</span>
    </button>
  );
}
