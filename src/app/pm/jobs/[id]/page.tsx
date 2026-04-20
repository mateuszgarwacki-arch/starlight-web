"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { formatHours } from "@/lib/format-hours";
import { DaysRemainingBadge } from "@/components/ui/badges";
import { LearningsSection } from "@/components/learnings-section";
import { PmNoteInline } from "@/components/pm-note-inline";
import {
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Package,
  Hammer,
  FileText,
  Download,
  AlertCircle,
  Layers,
  CircleAlert,
  CheckCircle2,
  Box,
  Image as ImageIcon,
  FileCode2,
  Paperclip,
  ArrowDownAZ,
} from "lucide-react";

/* ---------- Types (match RPC payload) ---------- */

type JobRow = {
  job_id: number; job_number: string; job_name: string;
  client_name: string | null; event_date: string | null;
  event_location: string | null; budget_allowance: number | null;
  job_status: string | null; pm_note: string | null;
};

type ScopeRef = {
  scope_item_id: number; item_name: string | null; status: string | null;
  complexity_construction: string | null; finish_relative: string | null;
  event_zone: string | null; description: string | null;
};

type TimeEntry = {
  entry_id: number;
  freelancer_name: string | null;
  work_date: string | null;
  actual_hours: number;
  applied_hourly_rate: number | null;
  entry_cost: number | null;
  flag_note: string | null;
};

type WORef = {
  work_order_id: number; scope_item_id: number;
  activity_label: string; description: string | null; status: string | null;
  estimated_duration_hrs: number | null;
  actual_hours: number; actual_labour_cost: number;
  lead_name: string | null; paint_notes: string | null;
  predecessor_wo_id: number | null; wo_sequence: number | null;
  time_entries: TimeEntry[] | null;
};

type BomGroup = {
  group_key: string; line_count: number;
  total_quantity: number; unit: string | null; total_cost: number;
  any_from_stock: boolean; any_needs_ordering: boolean;
  wo_ids: number[] | null; suppliers: string[] | null;
};

type DocRef = {
  doc_id: number; work_order_id: number | null; doc_type: string;
  file_name: string; onedrive_path: string | null;
  file_size: number | null; uploaded_at: string;
};

type QuoteLine = {
  quote_line_id: number; line_number: string; sort_key: number;
  line_sub_group: string | null; line_text: string;
  quantity: number | null; unit_price: number | null; line_value: number | null;
  category: string | null; event_zone: string | null;
  pm_note: string | null;
  pm_est_cost: number | null; pm_est_labour_days: number | null;
  pm_est_material_cost: number | null; pm_est_notes: string | null;
  scope_count: number; scopes: ScopeRef[] | null;
  wo_count: number; work_orders: WORef[] | null;
  total_actual_labour: number;
  bom_groups: BomGroup[] | null; bom_total: number;
  estimated_labour_cost: number; estimated_material_cost: number;
  documents: DocRef[] | null;
  learning_count: number; learning_open: number;
  pm_note_inline_id: string | null;
  pm_note_inline_text: string | null;
  pm_note_inline_updated_at: string | null;
};

type Payload = { job: JobRow; quote_lines: QuoteLine[] };

/* ---------- small UI helpers ---------- */

function CategoryPill({ category }: { category: string | null }) {
  if (!category) return null;
  const map: Record<string, string> = {
    Workshop: "bg-starlight-blue/10 text-starlight-blue border-starlight-blue/30",
    Subcontracted: "bg-muted/10 text-muted border-subtle",
    Lighting: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
    Sound: "bg-purple-500/10 text-purple-700 border-purple-500/30",
    "Stock Pick": "bg-starlight-green/10 text-starlight-green border-starlight-green/30",
    Install: "bg-orange-500/10 text-orange-700 border-orange-500/30",
    Production: "bg-pink-500/10 text-pink-700 border-pink-500/30",
    Provisional: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  };
  return (
    <span className={cn("shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border",
      map[category] || "bg-surface-mid text-muted border-subtle")}>
      {category}
    </span>
  );
}

function WoStatusPill({ status }: { status: string | null }) {
  const s = (status || "").toLowerCase();
  const cls =
    s === "complete" || s === "completed" ? "bg-starlight-green/10 text-starlight-green"
    : s === "in_progress" || s === "active" ? "bg-starlight-blue/10 text-starlight-blue"
    : s === "blocked" || s === "flagged" ? "bg-starlight-red/10 text-starlight-red"
    : "bg-surface-mid text-muted";
  return <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", cls)}>{status || "—"}</span>;
}

function CostCell({ label, value, hint, emphasis }: { label: string; value: number; hint?: string; emphasis?: boolean }) {
  return (
    <div className={cn("text-right", emphasis && "")}>
      <div className="text-[9px] uppercase tracking-wide text-faint">{label}</div>
      <div className={cn("text-sm font-semibold", emphasis ? "text-navy" : "text-muted")}>
        {value ? formatCurrency(value) : "—"}
      </div>
      {hint && <div className="text-[9px] text-faint">{hint}</div>}
    </div>
  );
}

/* ---------- Document gallery (thumbnails grouped by type) ---------- */

const DOC_TYPE_LABELS: Record<string, { label: string; icon: typeof FileText; colour: string }> = {
  drawing:   { label: "Drawings",     icon: FileText,  colour: "text-sky-600" },
  cut_list:  { label: "Cut lists",    icon: FileCode2, colour: "text-indigo-600" },
  reference: { label: "Reference",    icon: Paperclip, colour: "text-muted" },
  model:     { label: "3D models",    icon: Box,       colour: "text-emerald-600" },
  cad_model: { label: "CAD files",    icon: Box,       colour: "text-starlight-blue" },
};

function prettyBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function DocCard({ doc }: { doc: DocRef }) {
  const meta = DOC_TYPE_LABELS[doc.doc_type] ?? { label: doc.doc_type, icon: FileText, colour: "text-muted" };
  const Icon = meta.icon;
  const ext = (doc.file_name.split(".").pop() || "").toLowerCase();
  const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
  return (
    <a
      href={doc.onedrive_path || "#"}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col w-44 border border-subtle rounded-md bg-surface hover:border-starlight-blue/60 overflow-hidden"
      title={doc.file_name}
    >
      <div className="h-24 bg-surface-mid flex items-center justify-center">
        {isImage ? (
          <ImageIcon className="h-10 w-10 text-muted group-hover:text-starlight-blue" />
        ) : (
          <Icon className={cn("h-10 w-10", meta.colour)} />
        )}
      </div>
      <div className="p-2 border-t border-subtle">
        <div className="text-xs font-medium text-navy truncate">{doc.file_name}</div>
        <div className="mt-0.5 flex items-center justify-between text-[10px] text-faint">
          <span>.{ext}</span>
          <span>{prettyBytes(doc.file_size)}</span>
        </div>
        <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted group-hover:text-starlight-blue">
          <Download className="h-3 w-3" /> Download
        </div>
      </div>
    </a>
  );
}

function DocumentGallery({ docs }: { docs: DocRef[] }) {
  if (docs.length === 0) return null;
  // Group by doc_type, preserving a sensible order
  const order: string[] = ["drawing", "cut_list", "model", "cad_model", "reference"];
  const byType = new Map<string, DocRef[]>();
  docs.forEach((d) => {
    if (!byType.has(d.doc_type)) byType.set(d.doc_type, []);
    byType.get(d.doc_type)!.push(d);
  });
  const groups = order
    .filter((t) => byType.has(t))
    .map((t) => [t, byType.get(t)!] as const)
    .concat(Array.from(byType.entries()).filter(([t]) => !order.includes(t)));

  return (
    <div className="space-y-3">
      {groups.map(([t, list]) => {
        const meta = DOC_TYPE_LABELS[t] ?? { label: t, icon: FileText, colour: "text-muted" };
        const Icon = meta.icon;
        return (
          <div key={t}>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted">
              <Icon className={cn("h-3.5 w-3.5", meta.colour)} />
              <span>{meta.label}</span>
              <span className="text-faint">({list.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {list.map((d) => <DocCard key={d.doc_id} doc={d} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- WO block with per-WO expand ---------- */

function WoBlock({ wo, docs, jobId }: { wo: WORef; docs: DocRef[]; jobId: number }) {
  const [expanded, setExpanded] = useState(false);
  const est = Number(wo.estimated_duration_hrs ?? 0);
  const act = Number(wo.actual_hours ?? 0);
  const over = est > 0 && act > est;
  const timeEntries = wo.time_entries ?? [];

  return (
    <div className="border border-subtle rounded bg-surface">
      {/* Header — clickable to expand */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-surface-mid/50"
      >
        <div className="shrink-0 text-muted">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
        <span className="font-mono text-[10px] text-faint">WO#{wo.work_order_id}</span>
        <span className="font-medium text-navy text-sm truncate">{wo.activity_label}</span>
        <WoStatusPill status={wo.status} />
        {wo.predecessor_wo_id && (
          <span className="text-[10px] text-muted">↳ after WO#{wo.predecessor_wo_id}</span>
        )}
        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <span className={cn("text-muted", over && "text-starlight-red font-medium")}>
            {formatHours(act)} / {formatHours(est)}
          </span>
          {Number(wo.actual_labour_cost) > 0 && (
            <span className="text-muted">{formatCurrency(wo.actual_labour_cost)}</span>
          )}
          {docs.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-faint">
              <Paperclip className="h-3 w-3" /> {docs.length}
            </span>
          )}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 py-3 border-t border-subtle space-y-3 text-xs">
          {/* Description + meta */}
          {wo.description && (
            <div className="text-muted whitespace-pre-wrap">{wo.description}</div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            {wo.lead_name && <span>Lead: <span className="text-navy">{wo.lead_name}</span></span>}
            {wo.paint_notes && <span className="italic">Paint: {wo.paint_notes}</span>}
          </div>

          {/* Time entries */}
          {timeEntries.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-faint mb-1">Time entries</div>
              <div className="border border-subtle rounded overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-surface-mid text-muted">
                      <th className="text-left px-2 py-1 font-medium">Who</th>
                      <th className="text-left px-2 py-1 font-medium">Date</th>
                      <th className="text-right px-2 py-1 font-medium">Hours</th>
                      <th className="text-right px-2 py-1 font-medium">Rate</th>
                      <th className="text-right px-2 py-1 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeEntries.map((e) => (
                      <tr key={e.entry_id} className="border-t border-subtle">
                        <td className="px-2 py-1 text-navy">{e.freelancer_name ?? "—"}</td>
                        <td className="px-2 py-1 text-muted">
                          {e.work_date ? new Date(e.work_date).toLocaleDateString("en-GB") : "—"}
                        </td>
                        <td className="px-2 py-1 text-right text-muted">{formatHours(e.actual_hours)}</td>
                        <td className="px-2 py-1 text-right text-faint">
                          {e.applied_hourly_rate ? `£${Number(e.applied_hourly_rate).toFixed(0)}` : "—"}
                        </td>
                        <td className="px-2 py-1 text-right text-navy">
                          {e.entry_cost ? formatCurrency(e.entry_cost) : "—"}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-subtle bg-surface-mid/30 font-medium">
                      <td className="px-2 py-1 text-muted" colSpan={2}>Total</td>
                      <td className="px-2 py-1 text-right text-navy">{formatHours(act)}</td>
                      <td></td>
                      <td className="px-2 py-1 text-right text-navy">
                        {formatCurrency(wo.actual_labour_cost)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Documents (thumbnails grouped by type) */}
          {docs.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-faint mb-1">Documents</div>
              <DocumentGallery docs={docs} />
            </div>
          )}

          {/* WO-level learning notes (excluding pm_note + materials_note so they don't double up) */}
          <LearningsSection
            context={{
              work_order_id: wo.work_order_id,
              job_id: jobId,
              contextLabel: `WO#${wo.work_order_id} ${wo.activity_label}`,
              contextSublabel: wo.description ?? undefined,
            }}
            filterField="work_order_id"
            filterValue={wo.work_order_id}
            excludeCategories={["pm_note", "materials_note"]}
            title="WO notes"
            defaultCollapsed
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Material row (no per-row notes) ---------- */

function MaterialRow({ g }: { g: BomGroup }) {
  const [showWhere, setShowWhere] = useState(false);
  const suppliers = (g.suppliers ?? []).filter(Boolean);
  return (
    <div className="border border-subtle rounded px-3 py-2 bg-surface text-xs space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-navy">{g.group_key}</span>
        <span className="text-muted">
          {Number(g.total_quantity).toLocaleString("en-GB", { maximumFractionDigits: 2 })}
          {g.unit ? ` ${g.unit}` : ""}
        </span>
        <span className="ml-auto font-semibold text-navy">{formatCurrency(g.total_cost)}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[10px]">
        {g.any_from_stock && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-starlight-green/10 text-starlight-green">
            <CheckCircle2 className="h-2.5 w-2.5" /> From stock
          </span>
        )}
        {g.any_needs_ordering && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700">
            <CircleAlert className="h-2.5 w-2.5" /> Needs ordering
          </span>
        )}
        {suppliers.length > 0 && <span className="text-faint">{suppliers.join(", ")}</span>}
        {g.wo_ids && g.wo_ids.length > 0 && (
          <button
            onClick={() => setShowWhere((v) => !v)}
            className="text-muted hover:text-navy inline-flex items-center gap-0.5"
          >
            {showWhere ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Used in {g.wo_ids.length} WO{g.wo_ids.length > 1 ? "s" : ""}
          </button>
        )}
      </div>
      {showWhere && g.wo_ids && (
        <div className="pl-3 text-[11px] text-muted">
          {g.wo_ids.map((id) => (
            <span key={id} className="font-mono mr-2">WO#{id}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Cost analysis table (per-WO breakdown inside expansion) ---------- */

function CostAnalysisTable({ ql }: { ql: QuoteLine }) {
  const wos = ql.work_orders ?? [];
  if (wos.length === 0) return null;
  const totalEst = wos.reduce((s, w) => s + Number(w.estimated_duration_hrs || 0), 0);
  const totalAct = wos.reduce((s, w) => s + Number(w.actual_hours || 0), 0);
  const totalCost = wos.reduce((s, w) => s + Number(w.actual_labour_cost || 0), 0);

  return (
    <div className="border border-subtle rounded overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-surface-mid text-muted">
            <th className="text-left px-3 py-1.5 font-medium">Work order</th>
            <th className="text-left px-2 py-1.5 font-medium">Status</th>
            <th className="text-right px-2 py-1.5 font-medium">Est hrs</th>
            <th className="text-right px-2 py-1.5 font-medium">Actual hrs</th>
            <th className="text-right px-2 py-1.5 font-medium">Variance</th>
            <th className="text-right px-3 py-1.5 font-medium">Labour cost</th>
          </tr>
        </thead>
        <tbody>
          {wos.map((w) => {
            const est = Number(w.estimated_duration_hrs || 0);
            const act = Number(w.actual_hours || 0);
            const variance = act - est;
            return (
              <tr key={w.work_order_id} className="border-t border-subtle">
                <td className="px-3 py-1.5 text-navy">
                  <span className="font-mono text-[10px] text-faint mr-1.5">WO#{w.work_order_id}</span>
                  {w.activity_label}
                </td>
                <td className="px-2 py-1.5"><WoStatusPill status={w.status} /></td>
                <td className="px-2 py-1.5 text-right text-muted">{formatHours(est)}</td>
                <td className="px-2 py-1.5 text-right text-navy">{formatHours(act)}</td>
                <td className={cn(
                  "px-2 py-1.5 text-right",
                  variance > 0 ? "text-starlight-red" : variance < 0 ? "text-starlight-green" : "text-faint"
                )}>
                  {est === 0 ? "—" : (variance > 0 ? "+" : "") + formatHours(variance)}
                </td>
                <td className="px-3 py-1.5 text-right text-navy">
                  {Number(w.actual_labour_cost) > 0 ? formatCurrency(w.actual_labour_cost) : "—"}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-subtle bg-surface-mid/30 font-medium">
            <td className="px-3 py-1.5 text-muted" colSpan={2}>Total ({wos.length} WO{wos.length > 1 ? "s" : ""})</td>
            <td className="px-2 py-1.5 text-right text-muted">{formatHours(totalEst)}</td>
            <td className="px-2 py-1.5 text-right text-navy">{formatHours(totalAct)}</td>
            <td></td>
            <td className="px-3 py-1.5 text-right text-navy">{formatCurrency(totalCost)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Quote line row (the centrepiece) ---------- */

function QuoteLineRow({ ql, jobId, onPmNoteSaved }: {
  ql: QuoteLine;
  jobId: number;
  onPmNoteSaved: (quoteLineId: number, text: string | null, id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasScopes = ql.scope_count > 0;
  const isMultiScope = ql.scope_count >= 2;
  const isOrphan = ql.scope_count === 0;

  const wosByScope = useMemo(() => {
    const map = new Map<number, WORef[]>();
    (ql.work_orders ?? []).forEach((w) => {
      if (!map.has(w.scope_item_id)) map.set(w.scope_item_id, []);
      map.get(w.scope_item_id)!.push(w);
    });
    return map;
  }, [ql.work_orders]);

  const docsByWo = useMemo(() => {
    const map = new Map<number, DocRef[]>();
    (ql.documents ?? []).forEach((d) => {
      if (!d.work_order_id) return;
      if (!map.has(d.work_order_id)) map.set(d.work_order_id, []);
      map.get(d.work_order_id)!.push(d);
    });
    return map;
  }, [ql.documents]);

  const quoted = Number(ql.line_value ?? 0);
  const workshopEst = Number(ql.estimated_labour_cost || 0) + Number(ql.estimated_material_cost || 0);
  const spent = Number(ql.total_actual_labour || 0) + Number(ql.bom_total || 0);

  return (
    <div className="card overflow-hidden">
      {/* Header row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-surface-mid/50 transition-colors cursor-pointer"
      >
        <div className="shrink-0 text-muted pt-0.5">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="shrink-0 font-mono text-[11px] text-faint w-10 text-right pt-1">{ql.line_number}</div>
        <div className="shrink-0 pt-0.5"><CategoryPill category={ql.category} /></div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-sm text-navy">{ql.line_text}</div>
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted">
            {ql.event_zone && <span>{ql.event_zone}</span>}
            {ql.line_sub_group && <span className="text-faint">·</span>}
            {ql.line_sub_group && <span>{ql.line_sub_group}</span>}
            {ql.quantity && ql.quantity > 1 && <span>· qty {ql.quantity}</span>}
            {isMultiScope && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-starlight-blue/10 text-starlight-blue">
                <Layers className="h-2.5 w-2.5" /> {ql.scope_count} scopes
              </span>
            )}
            {isOrphan && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-faint/10 text-faint border border-subtle">
                Not planned yet
              </span>
            )}
            {ql.wo_count > 0 && <span>· {ql.wo_count} WO{ql.wo_count > 1 ? "s" : ""}</span>}
            {ql.learning_open > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <AlertCircle className="h-2.5 w-2.5" /> {ql.learning_open} open
              </span>
            )}
          </div>
          {/* PM note — compact inline */}
          <div className="max-w-xl">
            <PmNoteInline
              jobId={jobId}
              quoteLineId={ql.quote_line_id}
              initialId={ql.pm_note_inline_id}
              initialText={ql.pm_note_inline_text}
              compact
              onSaved={(t, id) => onPmNoteSaved(ql.quote_line_id, t, id)}
            />
          </div>
        </div>
        {/* Cost cluster */}
        <div className="shrink-0 flex flex-col items-end gap-2 min-w-[160px] pt-0.5">
          <div className="flex items-start gap-4">
            <CostCell label="Quoted" value={quoted} emphasis />
          </div>
          <div className="flex items-start gap-4 text-right">
            <CostCell label="Workshop est." value={workshopEst} />
            <CostCell label="Spent" value={spent} />
          </div>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-subtle bg-base/30 space-y-5">
          {/* Cost analysis — per-WO table */}
          {hasScopes && (ql.work_orders ?? []).length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted uppercase tracking-wide">
                Cost analysis
              </div>
              <CostAnalysisTable ql={ql} />
            </section>
          )}

          {/* Orphan case */}
          {isOrphan && (
            <div className="text-xs text-muted italic">
              This quote line hasn&apos;t been broken into scope yet. Use the PM note above to flag anything worth
              remembering before planning starts.
            </div>
          )}

          {/* 1-scope: flat WO list */}
          {hasScopes && !isMultiScope && (ql.work_orders ?? []).length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted uppercase tracking-wide">
                <Hammer className="h-3.5 w-3.5" /> Work orders
              </div>
              <div className="space-y-2">
                {(ql.work_orders ?? []).map((wo) => (
                  <WoBlock key={wo.work_order_id} wo={wo} docs={docsByWo.get(wo.work_order_id) ?? []} jobId={jobId} />
                ))}
              </div>
            </section>
          )}

          {/* Multi-scope */}
          {isMultiScope && (ql.scopes ?? []).map((s) => {
            const scopeWos = wosByScope.get(s.scope_item_id) ?? [];
            return (
              <section key={s.scope_item_id} className="border-l-2 border-starlight-blue/40 pl-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-navy">
                    Scope: {s.item_name || `#${s.scope_item_id}`}
                  </span>
                  {s.status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-mid text-muted">{s.status}</span>
                  )}
                  {s.event_zone && <span className="text-[10px] text-muted">{s.event_zone}</span>}
                </div>
                {scopeWos.length > 0 ? (
                  <div className="space-y-2">
                    {scopeWos.map((wo) => (
                      <WoBlock key={wo.work_order_id} wo={wo} docs={docsByWo.get(wo.work_order_id) ?? []} jobId={jobId} />
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-faint italic">No work orders yet.</div>
                )}
                <LearningsSection
                  context={{
                    scope_item_id: s.scope_item_id,
                    job_id: jobId,
                    contextLabel: `Scope: ${s.item_name ?? `#${s.scope_item_id}`}`,
                    contextSublabel: s.event_zone ?? undefined,
                  }}
                  filterField="scope_item_id"
                  filterValue={s.scope_item_id}
                  excludeCategories={["pm_note", "materials_note"]}
                  title="Scope notes"
                  defaultCollapsed
                />
              </section>
            );
          })}

          {/* Materials — one notes thread for the whole section (no per-row notes) */}
          {hasScopes && (ql.bom_groups ?? []).length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted uppercase tracking-wide">
                <Package className="h-3.5 w-3.5" /> Materials
                <span className="text-faint">
                  ({(ql.bom_groups ?? []).length} items · {formatCurrency(ql.bom_total)})
                </span>
              </div>
              <div className="space-y-3">
                <LearningsSection
                  context={{
                    quote_line_id: ql.quote_line_id,
                    job_id: jobId,
                    contextLabel: `Materials — Line ${ql.line_number}`,
                    contextSublabel: ql.line_text.slice(0, 80),
                  }}
                  filterField="quote_line_id"
                  filterValue={ql.quote_line_id}
                  filterCategories={["materials_note"]}
                  title="Materials notes"
                  defaultCollapsed
                />
                <div className="space-y-1.5">
                  {(ql.bom_groups ?? []).map((g) => (
                    <MaterialRow key={g.group_key} g={g} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* All other learning threads for this quote line (issues, risks, retros — NOT pm_note/materials_note) */}
          {hasScopes && (
            <LearningsSection
              context={{
                quote_line_id: ql.quote_line_id,
                job_id: jobId,
                contextLabel: `Line ${ql.line_number}: ${ql.line_text.slice(0, 80)}`,
              }}
              filterField="quote_line_id"
              filterValue={ql.quote_line_id}
              excludeCategories={["pm_note", "materials_note"]}
              title="Other learnings on this line"
              defaultCollapsed
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- The page ---------- */

type SortKey = "line_number" | "value_desc" | "value_asc" | "category" | "zone";

export default function PmJobPage() {
  const params = useParams<{ id: string }>();
  const jobId = Number(params?.id);
  const supabase = createClient();

  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("line_number");

  useEffect(() => {
    if (!jobId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("rpc_pm_job_overview", { p_job_id: jobId });
      if (error) setError(error.message);
      else setPayload(data as Payload);
      setLoading(false);
    })();
  }, [jobId]);

  // Locally update cached PM note after an inline save — no round-trip to RPC
  const handlePmNoteSaved = (quoteLineId: number, text: string | null, id: string | null) => {
    setPayload((p) => {
      if (!p) return p;
      return {
        ...p,
        quote_lines: p.quote_lines.map((ql) =>
          ql.quote_line_id === quoteLineId
            ? { ...ql, pm_note_inline_text: text, pm_note_inline_id: id }
            : ql
        ),
      };
    });
  };

  const zones = useMemo(() => {
    if (!payload) return [];
    return Array.from(new Set(payload.quote_lines.map((ql) => ql.event_zone).filter(Boolean))).sort() as string[];
  }, [payload]);

  const categories = useMemo(() => {
    if (!payload) return [];
    return Array.from(new Set(payload.quote_lines.map((ql) => ql.category).filter(Boolean))).sort() as string[];
  }, [payload]);

  const filteredLines = useMemo(() => {
    if (!payload) return [];
    let lines = payload.quote_lines.filter((ql) => {
      if (zoneFilter !== "all" && ql.event_zone !== zoneFilter) return false;
      if (categoryFilter !== "all" && ql.category !== categoryFilter) return false;
      return true;
    });
    // Sort
    lines = [...lines].sort((a, b) => {
      switch (sortBy) {
        case "value_desc": return Number(b.line_value || 0) - Number(a.line_value || 0);
        case "value_asc":  return Number(a.line_value || 0) - Number(b.line_value || 0);
        case "category":
          return (a.category || "~").localeCompare(b.category || "~") || a.sort_key - b.sort_key;
        case "zone":
          return (a.event_zone || "~").localeCompare(b.event_zone || "~") || a.sort_key - b.sort_key;
        case "line_number":
        default:
          return a.sort_key - b.sort_key;
      }
    });
    return lines;
  }, [payload, zoneFilter, categoryFilter, sortBy]);

  // When sorting by something other than line_number, don't group by sub_group
  // (the grouping would fragment by each sort key group, which makes no sense)
  const grouped = useMemo(() => {
    if (sortBy !== "line_number") {
      return [["", filteredLines]] as [string, QuoteLine[]][];
    }
    const m = new Map<string, QuoteLine[]>();
    filteredLines.forEach((ql) => {
      const k = ql.line_sub_group || "Other";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(ql);
    });
    return Array.from(m.entries());
  }, [filteredLines, sortBy]);

  if (loading) {
    return <div className="card px-5 py-8 text-center text-muted text-sm animate-pulse">Loading job overview…</div>;
  }
  if (error || !payload) {
    return <div className="card px-5 py-8 text-center text-starlight-red text-sm">{error || "Job not found"}</div>;
  }

  const job = payload.job;
  const totalQuoted = payload.quote_lines.reduce((s, ql) => s + Number(ql.line_value || 0), 0);
  const totalSpent  = payload.quote_lines.reduce((s, ql) => s + Number(ql.total_actual_labour || 0) + Number(ql.bom_total || 0), 0);
  const totalWorkshopEst = payload.quote_lines.reduce(
    (s, ql) => s + Number(ql.estimated_labour_cost || 0) + Number(ql.estimated_material_cost || 0),
    0
  );
  const orphans = payload.quote_lines.filter((ql) => ql.scope_count === 0).length;
  const pmNotedLines = payload.quote_lines.filter((ql) => !!ql.pm_note_inline_text).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/pm/jobs" className="inline-flex items-center gap-1 text-xs text-muted hover:text-navy mb-1">
            <ArrowLeft className="h-3 w-3" /> All jobs
          </Link>
          <h1 className="text-xl font-bold text-navy">{job.job_name}</h1>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-muted">
            <span className="font-mono">{job.job_number}</span>
            {job.client_name && <span>· {job.client_name}</span>}
            {job.event_date && (
              <>
                <span>· {formatDate(job.event_date)}</span>
                <DaysRemainingBadge eventDate={job.event_date} />
              </>
            )}
            <span>· {formatCurrency(totalQuoted)} quoted</span>
            <span>· {payload.quote_lines.length} lines</span>
            {orphans > 0 && <span className="text-amber-600">· {orphans} not planned</span>}
            {pmNotedLines > 0 && (
              <span className="text-starlight-blue">· {pmNotedLines} PM note{pmNotedLines > 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
      </div>

      {/* Job-level totals strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wide text-faint">Quoted</div>
          <div className="text-lg font-bold text-navy">{formatCurrency(totalQuoted)}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wide text-faint">Workshop estimate</div>
          <div className="text-lg font-bold text-navy">{formatCurrency(totalWorkshopEst)}</div>
          <div className="text-[10px] text-faint">Labour + materials est. on planned scopes</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wide text-faint">Live spent</div>
          <div className="text-lg font-bold text-navy">{formatCurrency(totalSpent)}</div>
          <div className="text-[10px] text-faint">Actual labour + committed materials</div>
        </div>
      </div>

      {/* Job-level notes (no pm_note / materials_note — those live on their lines) */}
      <LearningsSection
        context={{
          job_id: jobId,
          contextLabel: `Job: ${job.job_name}`,
          contextSublabel: job.job_number ?? undefined,
        }}
        filterField="job_id"
        filterValue={jobId}
        excludeCategories={["pm_note", "materials_note"]}
        title="Job-level learnings"
        defaultCollapsed
      />

      {/* Sort + Filters */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="inline-flex items-center gap-1 text-muted">
          <ArrowDownAZ className="h-3.5 w-3.5" /> Sort:
        </span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="px-2 py-1 border border-subtle rounded bg-surface text-navy"
        >
          <option value="line_number">Line number</option>
          <option value="value_desc">Value (high → low)</option>
          <option value="value_asc">Value (low → high)</option>
          <option value="category">Department</option>
          <option value="zone">Zone</option>
        </select>
        <span className="text-muted ml-3">Filter:</span>
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="px-2 py-1 border border-subtle rounded bg-surface text-navy"
        >
          <option value="all">All zones</option>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-2 py-1 border border-subtle rounded bg-surface text-navy"
        >
          <option value="all">All departments</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="ml-auto text-muted">
          Showing {filteredLines.length} / {payload.quote_lines.length} lines
        </span>
      </div>

      {/* Quote lines */}
      <div className="space-y-5">
        {grouped.map(([group, lines]) => (
          <section key={group || "all"} className="space-y-2">
            {group && (
              <div className="text-xs font-semibold uppercase tracking-wide text-muted px-1">{group}</div>
            )}
            <div className="space-y-2">
              {lines.map((ql) => (
                <QuoteLineRow
                  key={ql.quote_line_id}
                  ql={ql}
                  jobId={jobId}
                  onPmNoteSaved={handlePmNoteSaved}
                />
              ))}
            </div>
          </section>
        ))}
        {filteredLines.length === 0 && (
          <div className="card px-5 py-8 text-center text-muted text-sm">No lines match these filters.</div>
        )}
      </div>
    </div>
  );
}
