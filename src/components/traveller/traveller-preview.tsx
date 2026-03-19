"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatDate } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import {
  Printer, X, FileText, Package,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface TravellerWO {
  work_order_id: number;
  job_id: number | null;
  scope_item_id: number | null;
  description: string | null;
  estimated_duration_hrs: number | null;
  complexity_construction: string | null;
  finish_relative: string | null;
  status: string | null;
  wo_sequence: number | null;
  activity_label: string;
  phase_number: number | null;
  lead_name: string | null;
  traveller_printed_at?: string | null;
}

interface TravellerBOM {
  bom_id: number;
  item_description: string | null;
  quantity: number | null;
  unit: string | null;
  needs_ordering: string | boolean | null;
  notes: string | null;
}

interface TravellerDoc {
  doc_id: number;
  doc_type: string;
  file_name: string;
  onedrive_path: string | null;
  caption: string | null;
}

interface TravellerLinkedItem {
  item_id: number;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  item_type: string | null;
  finish_required: string | null;
}

interface ScopeInfo {
  scope_item_id: number;
  job_id: number;
  item_name: string | null;
  scope_status: string | null;
  complexity_construction: string | null;
  finish_relative: string | null;
  event_zone: string | null;
  job_name: string | null;
  job_number: string | null;
  event_date: string | null;
}

interface WOPrintData {
  wo: TravellerWO;
  bom: TravellerBOM[];
  docs: TravellerDoc[];
  linkedItems: TravellerLinkedItem[];
  docUrls: Record<number, string>;
}

interface TravellerPreviewProps {
  scopeId: number;
  jobId: number;
  mode: "single" | "pack";
  singleWoId?: number;
  workOrders: TravellerWO[];
  scope: ScopeInfo;
  onClose: () => void;
  onPrinted: () => void;
}

// ============================================================
// Main Preview Component
// ============================================================

export function TravellerPreview({
  scopeId, jobId, mode, singleWoId, workOrders, scope, onClose, onPrinted,
}: TravellerPreviewProps) {
  const supabase = createClient();
  const printRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [woDataMap, setWoDataMap] = useState<Record<number, WOPrintData>>({});

  const wosToPrint = mode === "single" && singleWoId
    ? workOrders.filter((w) => w.work_order_id === singleWoId)
    : [...workOrders]
        .filter((w) => w.status !== "Voided")
        .sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999));

  const siblingWOs = mode === "single" && singleWoId
    ? workOrders.filter((w) => w.work_order_id !== singleWoId && w.status !== "Voided")
    : [];

  const loadWOData = useCallback(async () => {
    setLoading(true);
    const dataMap: Record<number, WOPrintData> = {};

    for (const wo of wosToPrint) {
      const [bomRes, docsRes, junctionRes] = await Promise.all([
        supabase
          .from("tbl_wo_bom")
          .select("bom_id, item_description, quantity, unit, needs_ordering, notes")
          .eq("work_order_id", wo.work_order_id)
          .order("bom_id"),
        supabase
          .from("tbl_wo_documents")
          .select("doc_id, doc_type, file_name, onedrive_path, caption, sort_order")
          .eq("work_order_id", wo.work_order_id)
          .order("sort_order"),
        supabase
          .from("tbl_jobitem_workorder")
          .select("job_item_id")
          .eq("work_order_id", wo.work_order_id),
      ]);

      let linkedItems: TravellerLinkedItem[] = [];
      if (junctionRes.data && junctionRes.data.length > 0) {
        const itemIds = junctionRes.data.map((j: any) => j.job_item_id);
        const { data: items } = await supabase
          .from("tbl_job_items")
          .select("item_id, description, quantity, unit, item_type, finish_required")
          .in("item_id", itemIds);
        linkedItems = (items || []) as TravellerLinkedItem[];
      }

      const docs = (docsRes.data || []) as TravellerDoc[];
      const imageDocIds = docs.filter(
        (d) => d.doc_type === "drawing" || d.doc_type === "reference"
      );

      const docUrls: Record<number, string> = {};
      for (const doc of imageDocIds) {
        if (doc.onedrive_path) {
          try {
            docUrls[doc.doc_id] = await getOneDriveUrl(doc.onedrive_path);
          } catch (_e) {
            docUrls[doc.doc_id] = "";
          }
        }
      }

      dataMap[wo.work_order_id] = {
        wo,
        bom: (bomRes.data || []) as TravellerBOM[],
        docs,
        linkedItems,
        docUrls,
      };
    }

    setWoDataMap(dataMap);
    setLoading(false);
  }, [wosToPrint.map((w) => w.work_order_id).join(",")]);

  useEffect(() => {
    loadWOData();
  }, []);

  const daysUntilEvent = scope.event_date
    ? Math.ceil((new Date(scope.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const totalPages = (() => {
    let count = 0;
    for (const wo of wosToPrint) {
      const data = woDataMap[wo.work_order_id];
      if (!data) continue;
      if (mode === "pack" && wosToPrint.indexOf(wo) > 0) count++; // divider
      count++; // task brief
      if (data.docs.filter((d) => d.doc_type === "cut_list").length > 0) count++;
      count += data.docs.filter((d) => d.doc_type === "drawing").length;
      count += data.docs.filter((d) => d.doc_type === "reference").length;
    }
    return count;
  })();

  const handlePrint = async () => {
    setPrinting(true);
    const woIds = wosToPrint.map((w) => w.work_order_id);
    const now = new Date().toISOString();

    for (const woId of woIds) {
      await supabase.from("tbl_work_orders").update({
        traveller_printed_at: now,
      }).eq("work_order_id", woId);

      const wo = wosToPrint.find((w) => w.work_order_id === woId);
      if (wo && wo.status === "Not-Started") {
        await supabase.from("tbl_work_orders").update({
          status: "Ready",
        }).eq("work_order_id", woId);
      }
    }

    window.print();
    setPrinting(false);
    onPrinted();
  };

  const nowStr = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-auto">
      {/* Toolbar - hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-navy text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
          <div>
            <p className="text-sm font-medium">
              Traveller Preview — {mode === "pack" ? "Scope Pack" : "Single WO"}
            </p>
            <p className="text-xs text-white/60">
              {scope.job_number} — {scope.item_name} — {totalPages} page{totalPages !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {wosToPrint.some((w) => w.status === "Not-Started") && (
            <span className="text-xs bg-starlight-amber/20 text-starlight-amber px-3 py-1 rounded-full">
              Print will set Not-Started WOs to Ready
            </span>
          )}
          <button
            onClick={handlePrint}
            disabled={loading || printing}
            className="flex items-center gap-2 px-5 py-2 bg-white text-navy font-medium text-sm rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            {printing ? "Printing..." : "Print & Release"}
          </button>
        </div>
      </div>

      {/* Print content */}
      <div ref={printRef} className="traveller-print-area bg-white mx-auto" style={{ maxWidth: "210mm" }}>
        {loading ? (
          <div className="flex items-center justify-center py-32 print:hidden">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-navy border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm text-gray-500">Loading traveller data...</p>
              <p className="text-xs text-gray-400 mt-1">Fetching drawings from OneDrive...</p>
            </div>
          </div>
        ) : (
          (() => {
            let pageNum = 0;
            const pages: React.ReactNode[] = [];

            for (let woIdx = 0; woIdx < wosToPrint.length; woIdx++) {
              const wo = wosToPrint[woIdx];
              const data = woDataMap[wo.work_order_id];
              if (!data) continue;

              const drawings = data.docs.filter((d) => d.doc_type === "drawing");
              const references = data.docs.filter((d) => d.doc_type === "reference");
              const cutLists = data.docs.filter((d) => d.doc_type === "cut_list");

              // Pack mode divider page
              if (mode === "pack" && woIdx > 0) {
                pageNum++;
                pages.push(
                  <TravellerPage key={`div-${wo.work_order_id}`} scope={scope} wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} pageNum={pageNum} totalPages={totalPages} printDate={nowStr} daysRemaining={daysUntilEvent}>
                    <div className="flex items-center justify-center h-full min-h-[500px]">
                      <div className="text-center">
                        <p className="text-4xl font-bold text-gray-800 mb-2">Step {woIdx + 1}/{wosToPrint.length}</p>
                        <p className="text-2xl font-semibold text-gray-700 mb-4">{wo.activity_label}</p>
                        {wo.description && <p className="text-base text-gray-500 max-w-md mx-auto">{wo.description}</p>}
                        <div className="mt-6 flex items-center justify-center gap-4 text-sm text-gray-400">
                          {wo.estimated_duration_hrs != null && <span>Est. {wo.estimated_duration_hrs}h</span>}
                          {wo.lead_name && <span>Lead: {wo.lead_name}</span>}
                        </div>
                      </div>
                    </div>
                  </TravellerPage>
                );
              }

              // Task brief page
              pageNum++;
              pages.push(
                <TravellerPage key={`brief-${wo.work_order_id}`} scope={scope} wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} pageNum={pageNum} totalPages={totalPages} printDate={nowStr} daysRemaining={daysUntilEvent}>
                  <TaskBriefContent wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} bom={data.bom} linkedItems={data.linkedItems} scope={scope} siblingWOs={mode === "single" ? siblingWOs : []} daysRemaining={daysUntilEvent} drawingCount={drawings.length} referenceCount={references.length} cutListCount={cutLists.length} />
                </TravellerPage>
              );

              // Cut list page
              if (cutLists.length > 0) {
                pageNum++;
                pages.push(
                  <TravellerPage key={`cut-${wo.work_order_id}`} scope={scope} wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} pageNum={pageNum} totalPages={totalPages} printDate={nowStr} daysRemaining={daysUntilEvent}>
                    <CutListContent cutLists={cutLists} />
                  </TravellerPage>
                );
              }

              // Drawing pages
              for (const drawing of drawings) {
                pageNum++;
                pages.push(
                  <TravellerPage key={`drw-${drawing.doc_id}`} scope={scope} wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} pageNum={pageNum} totalPages={totalPages} printDate={nowStr} daysRemaining={daysUntilEvent}>
                    <ImagePageContent doc={drawing} imageUrl={data.docUrls[drawing.doc_id] || ""} label="Drawing" />
                  </TravellerPage>
                );
              }

              // Reference pages
              for (const ref of references) {
                pageNum++;
                pages.push(
                  <TravellerPage key={`ref-${ref.doc_id}`} scope={scope} wo={wo} woIdx={woIdx} totalWOs={wosToPrint.length} pageNum={pageNum} totalPages={totalPages} printDate={nowStr} daysRemaining={daysUntilEvent}>
                    <ImagePageContent doc={ref} imageUrl={data.docUrls[ref.doc_id] || ""} label="Reference" />
                  </TravellerPage>
                );
              }
            }
            return pages;
          })()
        )}
      </div>
    </div>
  );
}

// ============================================================
// Universal Page Frame
// ============================================================

function TravellerPage({
  scope, wo, woIdx, totalWOs, pageNum, totalPages,
  printDate, daysRemaining, children,
}: {
  scope: ScopeInfo;
  wo: TravellerWO;
  woIdx: number;
  totalWOs: number;
  pageNum: number;
  totalPages: number;
  printDate: string;
  daysRemaining: number | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className="traveller-page relative bg-white mx-auto my-4 print:my-0"
      style={{
        width: "190mm",
        minHeight: "277mm",
        border: "2px solid #1A1A2E",
        pageBreakAfter: "always",
        pageBreakInside: "avoid",
      }}
    >
      {/* Inner border */}
      <div className="absolute inset-[3px] border border-gray-400 pointer-events-none" style={{ zIndex: 1 }} />

      <div className="relative" style={{ zIndex: 2, padding: "6mm 7mm" }}>
        {/* Header strip */}
        <div className="bg-gray-100 px-3 py-1.5 flex items-center justify-between text-[10px] mb-3 -mx-[7mm] -mt-[6mm] border-b border-gray-300" style={{ marginLeft: "-4mm", marginRight: "-4mm", marginTop: "-3mm", padding: "4px 12px" }}>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">{scope.job_number}</span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-700">{scope.job_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700">Step {woIdx + 1}/{totalWOs} {wo.activity_label}</span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-600 truncate max-w-[180px]">{scope.item_name}</span>
          </div>
        </div>

        {/* Content area */}
        <div className="min-h-[235mm]">{children}</div>

        {/* Footer strip */}
        <div className="bg-gray-50 px-3 py-1 flex items-center justify-between text-[9px] text-gray-400 -mx-[7mm] -mb-[6mm] mt-2 border-t border-gray-300" style={{ marginLeft: "-4mm", marginRight: "-4mm", marginBottom: "-3mm", padding: "3px 12px" }}>
          <span>Printed: {printDate}</span>
          <span className="font-medium">Page {pageNum} of {totalPages}</span>
          <span>WO-{wo.work_order_id} · Starlight</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Page 1: Task Brief
// ============================================================

function TaskBriefContent({
  wo, woIdx, totalWOs, bom, linkedItems, scope,
  siblingWOs, daysRemaining, drawingCount, referenceCount, cutListCount,
}: {
  wo: TravellerWO; woIdx: number; totalWOs: number;
  bom: TravellerBOM[]; linkedItems: TravellerLinkedItem[];
  scope: ScopeInfo; siblingWOs: TravellerWO[];
  daysRemaining: number | null;
  drawingCount: number; referenceCount: number; cutListCount: number;
}) {
  return (
    <div className="space-y-3 text-sm">
      {/* Top: QR + identification */}
      <div className="flex gap-4">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">{scope.job_number} — {scope.job_name}</h1>
          <p className="text-base font-medium text-gray-700 mt-0.5">{scope.item_name}</p>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 flex-wrap">
            <span className="font-semibold text-gray-800">Step {woIdx + 1}/{totalWOs} — {wo.activity_label}</span>
            <span>·</span>
            <span>Est. {wo.estimated_duration_hrs ?? "—"}h</span>
            <span>·</span>
            <span>Event: {formatDate(scope.event_date)}</span>
            {daysRemaining !== null && (
              <>
                <span>·</span>
                <span className={daysRemaining <= 7 ? "text-red-600 font-semibold" : daysRemaining <= 14 ? "text-amber-600 font-semibold" : ""}>
                  {daysRemaining}d remaining
                </span>
              </>
            )}
          </div>
        </div>
        <div className="w-[72px] h-[72px] border-2 border-dashed border-gray-300 rounded flex items-center justify-center shrink-0">
          <div className="text-center">
            <div className="text-[7px] text-gray-400 leading-tight">QR CODE</div>
            <div className="text-[6px] text-gray-300 mt-0.5">/m/wo/{wo.work_order_id}</div>
          </div>
        </div>
      </div>

      <hr className="border-gray-300" />

      {/* Description */}
      <div>
        <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Task description</h3>
        <p className="text-sm text-gray-800 bg-gray-50 px-3 py-2 rounded">{wo.description || "No description provided"}</p>
      </div>

      {/* Complexity + Finish */}
      <div className="flex gap-3">
        <div className="bg-gray-50 px-3 py-1.5 rounded text-xs">
          <span className="text-gray-500">Complexity: </span>
          <span className="font-medium text-gray-800">{wo.complexity_construction || scope.complexity_construction || "—"}</span>
        </div>
        <div className="bg-gray-50 px-3 py-1.5 rounded text-xs">
          <span className="text-gray-500">Finish: </span>
          <span className="font-medium text-gray-800">{wo.finish_relative || scope.finish_relative || "—"}</span>
        </div>
        {wo.lead_name && (
          <div className="bg-gray-50 px-3 py-1.5 rounded text-xs">
            <span className="text-gray-500">Planned lead: </span>
            <span className="font-medium text-gray-800">{wo.lead_name}</span>
          </div>
        )}
      </div>

      <hr className="border-gray-300" />

      {/* Bill of Materials */}
      <div>
        <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Bill of materials</h3>
        {bom.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No materials assigned</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left py-1 px-2 font-semibold text-gray-600">Material</th>
                <th className="text-right py-1 px-2 font-semibold text-gray-600 w-14">Qty</th>
                <th className="text-right py-1 px-2 font-semibold text-gray-600 w-14">Unit</th>
                <th className="text-right py-1 px-2 font-semibold text-gray-600 w-20">Order?</th>
              </tr>
            </thead>
            <tbody>
              {bom.map((row) => (
                <tr key={row.bom_id} className="border-b border-gray-100">
                  <td className="py-1 px-2 text-gray-800">{row.item_description || "—"}</td>
                  <td className="py-1 px-2 text-right text-gray-800">{row.quantity ?? "—"}</td>
                  <td className="py-1 px-2 text-right text-gray-600">{row.unit || "—"}</td>
                  <td className="py-1 px-2 text-right text-gray-500 text-[10px]">{isTruthy(row.needs_ordering) ? "needs order" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <hr className="border-gray-300" />

      {/* Linked Job Items */}
      {linkedItems.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Linked job items</h3>
          {linkedItems.map((item) => (
            <div key={item.item_id} className="flex items-start gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
              <div>
                <span className="text-xs text-gray-800">{item.quantity && item.quantity > 1 ? `${item.quantity}x ` : ""}{item.description || "—"}</span>
                <span className="text-[10px] text-gray-400 ml-1.5">{item.item_type}{item.finish_required && ` · ${item.finish_required}`}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documents summary */}
      {(drawingCount > 0 || referenceCount > 0 || cutListCount > 0) && (
        <div>
          <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Documents attached</h3>
          <p className="text-xs text-gray-600">
            {[drawingCount > 0 && `${drawingCount} drawing${drawingCount > 1 ? "s" : ""}`, referenceCount > 0 && `${referenceCount} reference${referenceCount > 1 ? "s" : ""}`, cutListCount > 0 && `${cutListCount} cut list${cutListCount > 1 ? "s" : ""}`].filter(Boolean).join("  ·  ")}
            <span className="text-gray-400"> — see following pages</span>
          </p>
        </div>
      )}

      {/* Sibling WOs (single mode only) */}
      {siblingWOs.length > 0 && (
        <>
          <hr className="border-gray-300" />
          <div>
            <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Other work orders on this scope item</h3>
            {siblingWOs.sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999)).map((sib) => {
              const allSorted = [...siblingWOs, wo].sort((a, b) => (a.wo_sequence || 999) - (b.wo_sequence || 999));
              const sibIdx = allSorted.findIndex((s) => s.work_order_id === sib.work_order_id);
              return (
                <div key={sib.work_order_id} className="flex items-center gap-2 mb-0.5 text-xs">
                  <span className="text-gray-400 w-8">{sibIdx + 1}/{allSorted.length}</span>
                  <span className="font-medium text-gray-700">{sib.activity_label}</span>
                  <span className="text-gray-400">{sib.estimated_duration_hrs != null ? `${sib.estimated_duration_hrs}h` : "—"}</span>
                  <span className="text-gray-300">·</span>
                  <span className={sib.status === "Complete" ? "text-green-600" : sib.status === "In-Progress" ? "text-blue-600" : "text-gray-400"}>{sib.status}</span>
                  {sib.lead_name && <span className="text-gray-400">· {sib.lead_name}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}

      <hr className="border-gray-300" />

      {/* Notes space */}
      <div>
        <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Notes / special instructions</h3>
        <div className="border border-dashed border-gray-300 rounded h-14" />
      </div>

      {/* Sign-off */}
      <div>
        <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Sign-off</h3>
        <div className="space-y-2 text-xs text-gray-600">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-end gap-3 border-b border-gray-200 pb-1.5">
              <div className="flex-1">
                <span className="text-gray-400 text-[10px]">{n === 1 ? "Started" : "Completed"} by: </span>
                <span className="inline-block w-40 border-b border-gray-300 ml-1" />
              </div>
              <div>
                <span className="text-gray-400 text-[10px]">Hours: </span>
                <span className="inline-block w-12 border-b border-gray-300" />
              </div>
              <div>
                <span className="text-gray-400 text-[10px]">Date: </span>
                <span className="inline-block w-20 border-b border-gray-300" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Completion notes */}
      <div className="mt-1">
        <p className="text-[9px] text-gray-400 mb-0.5">Notes on completion:</p>
        <div className="border border-dashed border-gray-300 rounded h-10" />
      </div>
    </div>
  );
}

// ============================================================
// Page 2: Cut List
// ============================================================

function CutListContent({ cutLists }: { cutLists: TravellerDoc[] }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Cut list</h3>
      {cutLists.map((cl) => (
        <div key={cl.doc_id} className="mb-4">
          <p className="text-xs font-medium text-gray-700 mb-1">{cl.file_name}</p>
          {cl.caption && <p className="text-xs text-gray-400 mb-2">{cl.caption}</p>}
          <div className="text-xs text-gray-400 italic bg-gray-50 px-4 py-8 rounded text-center border border-gray-200">
            Cut list data from extracted parts.<br />
            Refer to original file if printed version is unclear.
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Pages 3+: Drawing / Reference Image
// ============================================================

function ImagePageContent({ doc, imageUrl, label }: { doc: TravellerDoc; imageUrl: string; label: string }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</h3>
        <p className="text-[9px] text-gray-400 truncate max-w-[280px]">{doc.file_name}</p>
      </div>
      {doc.caption && <p className="text-xs text-gray-600 mb-2">{doc.caption}</p>}
      <div className="flex-1 flex items-center justify-center min-h-[200mm]">
        {imageUrl ? (
          <img src={imageUrl} alt={doc.file_name} className="max-w-full max-h-[220mm] object-contain" crossOrigin="anonymous" />
        ) : (
          <div className="text-center text-gray-400">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Image not available for print preview</p>
            <p className="text-[10px] mt-1">{doc.file_name}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Print Button (used in WO page)
// ============================================================

export function PrintTravellerButton({
  wo,
  workOrders,
  scope,
  scopeId,
  jobId,
  onPrinted,
}: {
  wo?: TravellerWO;
  workOrders: TravellerWO[];
  scope: ScopeInfo;
  scopeId: number;
  jobId: number;
  onPrinted: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<"single" | "pack">("single");
  const printableWOs = workOrders.filter((w) => w.status !== "Voided");

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Single WO print */}
        {wo && (
          <button
            onClick={() => { setPreviewMode("single"); setShowPreview(true); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100 transition-colors"
            title="Print traveller (this WO)"
          >
            <Printer className="h-4 w-4" />
          </button>
        )}
        {/* Scope pack print */}
        {printableWOs.length > 1 && (
          <button
            onClick={() => { setPreviewMode("pack"); setShowPreview(true); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100 transition-colors"
            title="Print scope pack (all WOs)"
          >
            <Package className="h-4 w-4" />
          </button>
        )}
        {/* Printed indicator */}
        {wo?.traveller_printed_at && (
          <span
            className="text-[9px] text-gray-400 ml-0.5 cursor-default"
            title={`Last printed: ${new Date(wo.traveller_printed_at).toLocaleString("en-GB")}`}
          >
            printed
          </span>
        )}
      </div>

      {showPreview && (
        <TravellerPreview
          scopeId={scopeId}
          jobId={jobId}
          mode={previewMode}
          singleWoId={wo?.work_order_id}
          workOrders={workOrders}
          scope={scope}
          onClose={() => setShowPreview(false)}
          onPrinted={() => { setShowPreview(false); onPrinted(); }}
        />
      )}
    </>
  );
}
