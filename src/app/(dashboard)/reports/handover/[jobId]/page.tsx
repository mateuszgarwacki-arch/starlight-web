"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  Printer,
  FileText,
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Pause,
  User,
  Calendar,
  MapPin,
  Wrench,
  Layers,
  RotateCw,
} from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

// ————————————————————————————————————————————————————————
// Types — mirror of rpc_job_handover_data JSON shape
// ————————————————————————————————————————————————————————

interface HandoverJob {
  job_id: number;
  job_number: string;
  job_name: string;
  client_name: string | null;
  event_date: string | null;
  event_location: string | null;
  job_status: string | null;
  budget_allowance: number | null;
}

interface Readiness {
  wo_total: number;
  wo_complete: number;
  wo_in_progress: number;
  wo_on_hold: number;
  items_total: number;
  items_kit_ready: number;
}

interface HandoverDoc {
  doc_id: number;
  file_name: string;
  caption: string | null;
  mime_type: string | null;
  onedrive_path: string | null;
  doc_type: string | null;
  sort_order: number;
}

interface HandoverJobItem {
  item_id: number;
  description: string | null;
  item_type: string | null;
  quantity: number;
  unit: string | null;
  finish_required: string | null;
  kit_list_exported: boolean;
}

interface HandoverWO {
  work_order_id: number;
  description: string | null;
  status: string;
  activity_verb: string | null;
  wo_sequence: number | null;
  wo_note: string | null;
  workers: string[];
}

interface HandoverScope {
  scope_item_id: number;
  item_name: string | null;
  description: string | null;
  status: string;
  job_items: HandoverJobItem[];
  work_orders: HandoverWO[];
}

interface HandoverLine {
  quote_line_id: number;
  line_number: string;
  import_sequence: number;
  line_text: string;
  quantity: number;
  line_sub_group: string | null;
  line_note: string | null;
  scopes: HandoverScope[];
}

interface HandoverZone {
  event_zone: string;
  sort_order: number;
  notes: string | null;
  readiness: Readiness;
  documents: HandoverDoc[];
  quote_lines: HandoverLine[];
}

interface UnassignedLine {
  quote_line_id: number;
  line_number: string;
  line_text: string;
  quantity: number;
}

interface HandoverData {
  job: HandoverJob;
  zones: HandoverZone[];
  unassigned_lines: UnassignedLine[];
  excluded_line_count: number;
  excluded_zone_count: number;
  generated_at: string;
}

// ————————————————————————————————————————————————————————
// Helpers
// ————————————————————————————————————————————————————————

const getBaseUrl = () => {
  if (typeof window !== "undefined") return window.location.origin;
  return "https://workshop-five-gamma.vercel.app";
};

const isImageDoc = (doc: HandoverDoc): boolean => {
  if ((doc.mime_type || "").startsWith("image/")) return true;
  const n = (doc.file_name || "").toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|avif|tiff?)$/.test(n);
};

const isPdfDoc = (doc: HandoverDoc): boolean => {
  if ((doc.mime_type || "").toLowerCase() === "application/pdf") return true;
  return (doc.file_name || "").toLowerCase().endsWith(".pdf");
};

// ————————————————————————————————————————————————————————
// Drawing page — one drawing fills nearly a full A4
// ————————————————————————————————————————————————————————

function DrawingPage({
  doc,
  zoneName,
  rotation,
  onRotate,
}: {
  doc: HandoverDoc;
  zoneName: string;
  rotation: number;
  onRotate: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [autoRotated, setAutoRotated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!doc.onedrive_path) {
      setErr("No file path");
      return;
    }
    (async () => {
      try {
        const u = await getOneDriveUrl(doc.onedrive_path!);
        if (!cancelled) setUrl(u);
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load";
          setErr(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.onedrive_path]);

  const image = isImageDoc(doc);
  const pdf = isPdfDoc(doc);

  // Auto-rotate landscape images 90° once so they fill the portrait page.
  // Runs only once per drawing (guarded by autoRotated) — the PM can still
  // override manually afterwards.
  useEffect(() => {
    if (!url || !image || autoRotated) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (img.naturalWidth > img.naturalHeight * 1.2 && rotation === 0) {
        onRotate();
      }
      setAutoRotated(true);
    };
    img.onerror = () => setAutoRotated(true);
    img.src = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, image]);

  const isRotated = rotation === 90 || rotation === 270;
  const imgStyle: React.CSSProperties = {
    transform: `rotate(${rotation}deg)`,
    transformOrigin: "center",
    maxWidth: isRotated ? "260mm" : "100%",
    maxHeight: isRotated ? "184mm" : "240mm",
    width: "auto",
    height: "auto",
    objectFit: "contain",
    transition: "transform 0.2s ease",
  };

  return (
    <section className="handover-page handover-drawing-page">
      <div className="handover-drawing-label">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[10px] uppercase tracking-widest text-neutral-500">
              {zoneName}
            </span>
            <span className="font-semibold text-sm truncate">
              {doc.caption || doc.file_name}
            </span>
          </div>
          {image && url && (
            <button
              onClick={onRotate}
              className="print:hidden shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded text-neutral-700 transition-colors"
              title="Rotate 90° — does not affect the file, only this print layout"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>
                Rotate
                {rotation > 0 ? ` (${rotation}°)` : ""}
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="handover-drawing-canvas">
        {err && (
          <div className="text-center text-red-700 p-8">
            <AlertCircle className="mx-auto mb-2" size={32} />
            <p className="text-sm">Couldn&apos;t load drawing: {err}</p>
            <p className="text-xs text-neutral-500 mt-1">{doc.file_name}</p>
          </div>
        )}
        {!err && !url && (
          <div className="text-neutral-500 text-sm">Loading drawing…</div>
        )}
        {url && image && (
          <img
            src={url}
            alt={doc.caption || doc.file_name}
            className="handover-drawing-img"
            style={imgStyle}
          />
        )}
        {url && pdf && (
          <div className="text-center p-10 border border-dashed border-neutral-400 rounded max-w-md">
            <FileText size={48} className="mx-auto mb-3 text-neutral-500" />
            <p className="font-semibold text-sm mb-1">{doc.file_name}</p>
            <p className="text-xs text-neutral-600 mb-3">
              PDF — inline PDF rendering arriving in a follow-up. Open directly
              from the link, or print the PDF separately and staple it into
              this section.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 bg-neutral-900 text-white text-xs rounded"
            >
              Open PDF
            </a>
          </div>
        )}
        {url && !image && !pdf && (
          <div className="text-center p-10 border border-dashed border-neutral-400 rounded max-w-md">
            <FileText size={48} className="mx-auto mb-3 text-neutral-500" />
            <p className="font-semibold text-sm mb-1">{doc.file_name}</p>
            <p className="text-xs text-neutral-600 mb-3">
              {doc.mime_type || "Unknown file type"} — can&apos;t preview
              inline.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 bg-neutral-900 text-white text-xs rounded"
            >
              Open file
            </a>
          </div>
        )}
      </div>
      <div className="handover-drawing-footer text-[10px] text-neutral-500">
        {doc.file_name}
      </div>
    </section>
  );
}

// ————————————————————————————————————————————————————————
// Readiness strip — used on cover + zone intro
// ————————————————————————————————————————————————————————

function ReadinessStrip({ r }: { r: Readiness }) {
  if (r.wo_total === 0 && r.items_total === 0) {
    return (
      <div className="handover-readiness text-neutral-500">
        No work orders or items yet
      </div>
    );
  }
  const woDone = r.wo_total > 0 && r.wo_complete === r.wo_total;
  return (
    <div className="handover-readiness">
      {r.wo_total > 0 && (
        <span className={woDone ? "text-emerald-700 font-semibold" : ""}>
          {woDone ? (
            <CheckCircle2 className="inline mr-1" size={12} />
          ) : null}
          {r.wo_complete} of {r.wo_total} WO{r.wo_total !== 1 ? "s" : ""} complete
        </span>
      )}
      {r.wo_in_progress > 0 && (
        <span className="text-amber-700">
          <Clock className="inline mr-1" size={12} />
          {r.wo_in_progress} in progress
        </span>
      )}
      {r.items_total > 0 && (
        <span className="text-neutral-600">
          {r.items_total} item{r.items_total !== 1 ? "s" : ""}
        </span>
      )}
      {r.wo_on_hold > 0 && (
        <span className="text-red-700 font-semibold">
          <Pause className="inline mr-1" size={12} />
          {r.wo_on_hold} on hold
        </span>
      )}
    </div>
  );
}

// ————————————————————————————————————————————————————————
// WO status pill
// ————————————————————————————————————————————————————————

function WOStatusPill({ status }: { status: string }) {
  const cfg: Record<
    string,
    { bg: string; text: string; icon: typeof CheckCircle2; label: string }
  > = {
    Complete: {
      bg: "bg-emerald-100",
      text: "text-emerald-800",
      icon: CheckCircle2,
      label: "Complete",
    },
    "In-Progress": {
      bg: "bg-amber-100",
      text: "text-amber-800",
      icon: Clock,
      label: "In progress",
    },
    Ready: {
      bg: "bg-sky-100",
      text: "text-sky-800",
      icon: CircleDashed,
      label: "Ready",
    },
    "Not-Started": {
      bg: "bg-neutral-100",
      text: "text-neutral-700",
      icon: CircleDashed,
      label: "Not started",
    },
    "On-Hold": {
      bg: "bg-red-100",
      text: "text-red-800",
      icon: Pause,
      label: "On hold",
    },
    Voided: {
      bg: "bg-neutral-200",
      text: "text-neutral-500",
      icon: CircleDashed,
      label: "Voided",
    },
  };
  const c = cfg[status] || cfg["Not-Started"];
  const Icon = c.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${c.bg} ${c.text}`}
    >
      <Icon size={10} /> {c.label}
    </span>
  );
}

// ————————————————————————————————————————————————————————
// WO card (inside scope)
// ————————————————————————————————————————————————————————

function WOCard({ wo, baseUrl }: { wo: HandoverWO; baseUrl: string }) {
  const qrUrl = `${baseUrl}/m/wo/${wo.work_order_id}`;
  return (
    <div className="handover-wo flex gap-3 py-2 border-t border-neutral-200">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-[10px] font-mono text-neutral-500">
            WO-{wo.work_order_id}
          </span>
          {wo.activity_verb && (
            <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-700">
              {wo.activity_verb}
            </span>
          )}
          <WOStatusPill status={wo.status} />
        </div>
        <div className="text-xs text-neutral-800 leading-snug mb-1">
          {wo.description || (
            <span className="italic text-neutral-400">No description</span>
          )}
        </div>
        {wo.wo_note && wo.wo_note.trim() !== "" && (
          <div className="mt-1 mb-1 px-2 py-1.5 bg-sky-50 border-l-2 border-sky-400 rounded-r text-[11px] text-sky-900 whitespace-pre-wrap">
            {wo.wo_note}
          </div>
        )}
        {wo.workers.length > 0 && (
          <div className="text-[10px] text-neutral-600 flex items-center gap-1">
            <User size={10} /> Who knows: {wo.workers.join(", ")}
          </div>
        )}
      </div>
      <div className="handover-wo-qr flex flex-col items-center shrink-0">
        <div className="bg-white p-1 border border-neutral-300 rounded">
          <QRCodeSVG value={qrUrl} size={56} level="M" />
        </div>
        <div className="text-[8px] text-neutral-500 mt-0.5">Scan for details</div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————
// Scope block
// ————————————————————————————————————————————————————————

function ScopeBlock({
  scope,
  baseUrl,
}: {
  scope: HandoverScope;
  baseUrl: string;
}) {
  return (
    <div className="handover-scope mt-3 border border-neutral-300 rounded overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 border-b border-neutral-300">
        <Wrench size={12} className="text-neutral-600" />
        <span className="font-semibold text-sm">
          {scope.item_name || "Unnamed scope"}
        </span>
        <span className="text-[10px] px-2 py-0.5 bg-white rounded text-neutral-700 ml-auto">
          {scope.status}
        </span>
      </div>

      {scope.job_items.length > 0 && (
        <div className="px-3 py-2 border-b border-neutral-200">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">
            Items ({scope.job_items.length})
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="w-6 py-1">#</th>
                <th className="py-1">Description</th>
                <th className="w-20 py-1 text-right">Qty</th>
                <th className="w-20 py-1">Finish</th>
              </tr>
            </thead>
            <tbody>
              {scope.job_items.map((item, idx) => (
                <tr
                  key={item.item_id}
                  className="border-t border-neutral-200"
                >
                  <td className="py-1 text-neutral-500">{idx + 1}</td>
                  <td className="py-1">{item.description || "—"}</td>
                  <td className="py-1 text-right">
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ""}
                  </td>
                  <td className="py-1 text-neutral-600">
                    {item.finish_required || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scope.work_orders.length > 0 && (
        <div className="px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">
            Work orders ({scope.work_orders.length})
          </div>
          {scope.work_orders.map((wo) => (
            <WOCard key={wo.work_order_id} wo={wo} baseUrl={baseUrl} />
          ))}
        </div>
      )}

      {scope.job_items.length === 0 && scope.work_orders.length === 0 && (
        <div className="px-3 py-2 text-xs text-neutral-500 italic">
          No items or work orders on this scope.
        </div>
      )}
    </div>
  );
}

// ————————————————————————————————————————————————————————
// Quote line block
// ————————————————————————————————————————————————————————

function QuoteLineBlock({
  line,
  baseUrl,
}: {
  line: HandoverLine;
  baseUrl: string;
}) {
  return (
    <div className="handover-line mb-4">
      <div className="flex items-baseline gap-3 py-1.5 border-b-2 border-neutral-800">
        <span className="font-mono text-xs text-neutral-500 shrink-0">
          #{line.line_number}
        </span>
        <span className="flex-1 text-sm font-medium">{line.line_text}</span>
        <span className="text-xs text-neutral-600 shrink-0">
          Qty {line.quantity}
        </span>
      </div>

      {line.line_note && line.line_note.trim() !== "" && (
        <div className="mt-2 px-3 py-2 bg-sky-50 border-l-4 border-sky-500 rounded-r text-xs text-sky-900 whitespace-pre-wrap">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-sky-700 mb-1">
            Note
          </div>
          {line.line_note}
        </div>
      )}

      {line.scopes.length === 0 && (
        <div className="mt-2 px-3 py-2 text-xs italic text-neutral-500 border border-dashed border-neutral-300 rounded">
          No fabrication scope on this line — this is typically handled by
          crew on-site or with bought-in goods.
        </div>
      )}

      {line.scopes.map((scope) => (
        <ScopeBlock
          key={scope.scope_item_id}
          scope={scope}
          baseUrl={baseUrl}
        />
      ))}
    </div>
  );
}

// ————————————————————————————————————————————————————————
// Zone section — intro + drawings + data
// ————————————————————————————————————————————————————————

function ZoneSection({
  zone,
  baseUrl,
  rotations,
  onRotate,
}: {
  zone: HandoverZone;
  baseUrl: string;
  rotations: Record<string, number>;
  onRotate: (key: string) => void;
}) {
  return (
    <>
      {/* Intro page */}
      <section className="handover-page handover-zone-intro">
        <div className="flex items-baseline gap-3 pb-3 border-b-2 border-neutral-800">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">
            Zone
          </span>
          <h2 className="text-3xl font-bold">{zone.event_zone}</h2>
        </div>

        {zone.notes && (
          <div className="mt-4 p-4 bg-neutral-50 border-l-4 border-neutral-400 rounded-r">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">
              Notes
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {zone.notes}
            </div>
          </div>
        )}

        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
            Readiness
          </div>
          <ReadinessStrip r={zone.readiness} />
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="text-center p-4 border border-neutral-300 rounded">
            <div className="text-4xl font-bold">{zone.quote_lines.length}</div>
            <div className="text-xs text-neutral-500 mt-1">
              quote line{zone.quote_lines.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div className="text-center p-4 border border-neutral-300 rounded">
            <div className="text-4xl font-bold">{zone.documents.length}</div>
            <div className="text-xs text-neutral-500 mt-1">
              drawing{zone.documents.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div className="text-center p-4 border border-neutral-300 rounded">
            <div className="text-4xl font-bold">
              {zone.readiness.items_total}
            </div>
            <div className="text-xs text-neutral-500 mt-1">job items</div>
          </div>
        </div>

      </section>

      {/* Drawing pages — one per drawing */}
      {zone.documents.map((doc) => {
        const rKey = `${zone.event_zone}:${doc.doc_id}`;
        return (
          <DrawingPage
            key={doc.doc_id}
            doc={doc}
            zoneName={zone.event_zone}
            rotation={rotations[rKey] || 0}
            onRotate={() => onRotate(rKey)}
          />
        );
      })}

      {/* Data page(s) — quote lines flow */}
      <section className="handover-page handover-zone-data">
        <div className="pb-2 mb-4 border-b border-neutral-400">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">
            Breakdown
          </span>
          <h3 className="text-xl font-semibold">{zone.event_zone}</h3>
        </div>

        {zone.quote_lines.map((line) => (
          <QuoteLineBlock
            key={line.quote_line_id}
            line={line}
            baseUrl={baseUrl}
          />
        ))}
      </section>
    </>
  );
}

// ————————————————————————————————————————————————————————
// Main page
// ————————————————————————————————————————————————————————

export default function HandoverPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = parseInt(params.jobId, 10);
  const supabase = createClient();
  const [data, setData] = useState<HandoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: rpcData, error } = await supabase.rpc(
        "rpc_job_handover_data",
        { p_job_id: jobId },
      );
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      setData(rpcData as HandoverData);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, supabase]);

  const baseUrl = useMemo(() => getBaseUrl(), []);

  // Per-drawing rotation state (in-memory only, not persisted).
  // Cycles 0 → 90 → 180 → 270 → 0.
  const [rotations, setRotations] = useState<Record<string, number>>({});
  const toggleRotation = useCallback((key: string) => {
    setRotations((prev) => ({
      ...prev,
      [key]: ((prev[key] || 0) + 90) % 360,
    }));
  }, []);

  const totalReadiness: Readiness | null = useMemo(() => {
    if (!data) return null;
    return data.zones.reduce(
      (acc, z) => ({
        wo_total: acc.wo_total + z.readiness.wo_total,
        wo_complete: acc.wo_complete + z.readiness.wo_complete,
        wo_in_progress: acc.wo_in_progress + z.readiness.wo_in_progress,
        wo_on_hold: acc.wo_on_hold + z.readiness.wo_on_hold,
        items_total: acc.items_total + z.readiness.items_total,
        items_kit_ready: acc.items_kit_ready + z.readiness.items_kit_ready,
      }),
      {
        wo_total: 0,
        wo_complete: 0,
        wo_in_progress: 0,
        wo_on_hold: 0,
        items_total: 0,
        items_kit_ready: 0,
      },
    );
  }, [data]);

  if (loading) {
    return (
      <div className="p-8 text-muted">Loading handover summary…</div>
    );
  }
  if (err) {
    return (
      <div className="p-8 text-starlight-red">
        Error loading handover: {err}
      </div>
    );
  }
  if (!data) {
    return <div className="p-8 text-muted">No data.</div>;
  }
  if ("error" in data && (data as { error?: string }).error) {
    return (
      <div className="p-8 text-starlight-red">Job not found.</div>
    );
  }

  const { job, zones, unassigned_lines, excluded_line_count, excluded_zone_count } = data;

  return (
    <div className="handover-root">
      {/* Toolbar — hidden in print */}
      <div className="handover-toolbar sticky top-0 z-20 bg-surface-dim border-b border-subtle px-4 py-2 flex items-center gap-3">
        <Link
          href={`/jobs/${jobId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy"
        >
          <ArrowLeft size={16} /> Back to job
        </Link>
        <div className="flex-1 text-sm text-navy font-medium truncate">
          Handover — {job.job_number} · {job.job_name}
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-starlight-blue text-white text-sm font-medium rounded hover:bg-starlight-blue/90"
        >
          <Printer size={14} /> Print
        </button>
      </div>

      {/* Document — each <section.handover-page> is an A4 page in print */}
      <div className="handover-print-area">
        {/* COVER */}
        <section className="handover-page handover-cover-page">
          <div className="py-6 border-t-2 border-b-2 border-neutral-800 mb-8">
            <div className="font-mono text-sm text-neutral-500">
              {job.job_number}
            </div>
            <div className="text-3xl font-bold mt-1">{job.job_name}</div>
          </div>

          <div className="space-y-2 text-sm mb-8">
            {job.event_date && (
              <div className="flex items-center gap-3">
                <Calendar
                  size={14}
                  className="text-neutral-500 shrink-0"
                />
                <span className="text-neutral-500 w-20">Event</span>
                <strong>{formatDate(job.event_date)}</strong>
              </div>
            )}
            {job.event_location && (
              <div className="flex items-start gap-3">
                <MapPin
                  size={14}
                  className="text-neutral-500 shrink-0 mt-1"
                />
                <span className="text-neutral-500 w-20 shrink-0">Venue</span>
                <strong>{job.event_location}</strong>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Layers size={14} className="text-neutral-500 shrink-0" />
              <span className="text-neutral-500 w-20">Zones</span>
              <strong>{zones.length}</strong>
            </div>
          </div>

          {unassigned_lines.length > 0 && (
            <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r mb-8">
              <div className="flex items-start gap-2">
                <AlertCircle
                  size={16}
                  className="text-amber-700 shrink-0 mt-0.5"
                />
                <div className="text-sm text-amber-900">
                  <strong>
                    {unassigned_lines.length} quote line
                    {unassigned_lines.length > 1 ? "s have" : " has"} no zone
                  </strong>{" "}
                  and won&apos;t appear in any section below. Assign a zone
                  on the quote or they will be missed.
                  <ul className="mt-2 text-xs list-disc list-inside">
                    {unassigned_lines.slice(0, 5).map((l) => (
                      <li key={l.quote_line_id}>
                        <span className="font-mono">#{l.line_number}</span>{" "}
                        {l.line_text.slice(0, 80)}
                        {l.line_text.length > 80 ? "…" : ""}
                      </li>
                    ))}
                    {unassigned_lines.length > 5 && (
                      <li>+ {unassigned_lines.length - 5} more</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {(excluded_zone_count > 0 || excluded_line_count > 0) && (
            <div className="p-3 bg-neutral-100 border-l-4 border-neutral-400 rounded-r mb-8 text-xs text-neutral-700">
              {excluded_zone_count > 0 && (
                <div>
                  <strong>{excluded_zone_count}</strong> zone
                  {excluded_zone_count > 1 ? "s have" : " has"} been
                  excluded from this handover (everything in them — lines,
                  drawings, WOs — is hidden below).
                </div>
              )}
              {excluded_line_count > 0 && (
                <div className={excluded_zone_count > 0 ? "mt-1" : ""}>
                  <strong>{excluded_line_count}</strong> individual quote
                  line{excluded_line_count > 1 ? "s have" : " has"} been
                  excluded (install-only, handled elsewhere, or done).
                </div>
              )}
              <div className="mt-1 text-[11px] text-neutral-500">
                Manage from the Edit Handover page if that&apos;s wrong.
              </div>
            </div>
          )}

          {totalReadiness && totalReadiness.wo_total > 0 && (
            <div className="mb-8">
              <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
                Overall readiness
              </h2>
              <ReadinessStrip r={totalReadiness} />
            </div>
          )}

          <div>
            <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
              Zones in this handover
            </h2>
            <ol className="space-y-1 list-decimal list-inside">
              {zones.map((z) => (
                <li key={z.event_zone} className="text-sm">
                  <span className="font-medium">{z.event_zone}</span>
                  <span className="text-xs text-neutral-500 ml-3">
                    {z.readiness.wo_total > 0
                      ? `${z.readiness.wo_complete}/${z.readiness.wo_total} WOs`
                      : "—"}
                    {z.documents.length > 0
                      ? ` · ${z.documents.length} drawing${z.documents.length > 1 ? "s" : ""}`
                      : ""}
                    {z.readiness.wo_on_hold > 0
                      ? ` · ${z.readiness.wo_on_hold} on hold`
                      : ""}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-auto pt-10 text-[10px] text-neutral-500 border-t border-neutral-300">
            Generated{" "}
            {new Date(data.generated_at).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            · Live data — reprint for updates
          </div>
        </section>

        {/* ZONES */}
        {zones.map((zone) => (
          <ZoneSection
            key={zone.event_zone}
            zone={zone}
            baseUrl={baseUrl}
            rotations={rotations}
            onRotate={toggleRotation}
          />
        ))}

        {zones.length === 0 && (
          <section className="handover-page">
            <div className="text-center py-20">
              <AlertCircle
                size={48}
                className="mx-auto mb-4 text-neutral-400"
              />
              <h2 className="text-xl font-semibold mb-2">
                No zones on this job
              </h2>
              <p className="text-sm text-neutral-600 max-w-md mx-auto">
                Quote lines need an <code>event_zone</code> set for them to
                appear in the handover. Assign zones from the quote, then
                reload.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
