"use client";

import { Printer, Package } from "lucide-react";

interface PrintButtonWO {
  work_order_id: number;
  status: string | null;
  traveller_printed_at?: string | null;
}

interface PrintButtonScope {
  scope_item_id: number;
}

export function PrintTravellerButton({
  wo,
  workOrders,
  scope,
  scopeId,
  jobId,
  onPrinted,
}: {
  wo?: PrintButtonWO;
  workOrders: PrintButtonWO[];
  scope: PrintButtonScope;
  scopeId: number;
  jobId: number;
  onPrinted: () => void;
}) {
  const printableWOs = workOrders.filter((w) => w.status !== "Voided");

  const openTraveller = (mode: "single" | "pack") => {
    const params = new URLSearchParams({
      scopeId: String(scopeId),
      mode,
    });
    if (mode === "single" && wo) {
      params.set("woId", String(wo.work_order_id));
    }
    window.open(`/traveller?${params.toString()}`, "_blank");
  };

  return (
    <div className="flex items-center gap-1">
      {wo && (
        <button
          onClick={() => openTraveller("single")}
          className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100 transition-colors"
          title="Print traveller"
        >
          <Printer className="h-4 w-4" />
        </button>
      )}
      {printableWOs.length > 1 && (
        <button
          onClick={() => openTraveller("pack")}
          className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100 transition-colors"
          title="Print scope pack (all WOs)"
        >
          <Package className="h-4 w-4" />
        </button>
      )}
      {wo?.traveller_printed_at && (
        <span
          className="text-[9px] text-gray-400 ml-0.5 cursor-default"
          title={`Last printed: ${new Date(wo.traveller_printed_at).toLocaleString("en-GB")}`}
        >
          <Printer className="h-3 w-3 inline text-starlight-green" />
        </span>
      )}
    </div>
  );
}
