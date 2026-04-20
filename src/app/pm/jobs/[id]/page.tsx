"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { formatHours } from "@/lib/format-hours";
import { DaysRemainingBadge } from "@/components/ui/badges";
import { LearningsSection } from "@/components/learnings-section";
import {
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Package,
  Hammer,
  FileText,
  Download,
  AlertCircle,
  MessageSquare,
  Layers,
  CircleAlert,
  CheckCircle2,
  Box,
} from "lucide-react";

/* ---------- Types (match RPC payload) ---------- */

type JobRow = {
  job_id: number;
  job_number: string;
  job_name: string;
  client_name: string | null;
  event_date: string | null;
  event_location: string | null;
  budget_allowance: number | null;
  job_status: string | null;
  pm_note: string | null;
};

type ScopeRef = {
  scope_item_id: number;
  item_name: string | null;
  status: string | null;
  complexity_construction: string | null;
  finish_relative: string | null;
  event_zone: string | null;
  description: string | null;
};

type WORef = {
  work_order_id: number;
  scope_item_id: number;
  activity_label: string;
  description: string | null;
  status: string | null;
  estimated_duration_hrs: number | null;
  actual_hours: number;
  actual_labour_cost: number;
  lead_name: string | null;
  paint_notes: string | null;
  predecessor_wo_id: number | null;
  wo_sequence: number | null;
};

type BomGroup = {
  group_key: string;
  first_bom_id: number | null;
  line_count: number;
  total_quantity: number;
  unit: string | null;
  total_cost: number;
  any_from_stock: boolean;
  any_needs_ordering: boolean;
  wo_ids: number[] | null;
  suppliers: string[] | null;
};

type DocRef = {
  doc_id: number;
  work_order_id: number | null;
  doc_type: string;
  file_name: string;
  onedrive_path: string | null;
  file_size: number | null;
  uploaded_at: string;
};

type QuoteLine = {
  quote_line_id: number;
  line_number: string;
  line_sub_group: string | null;
  line_text: string;
  quantity: number | null;
  unit_price: number | null;
  line_value: number | null;
  category: string | null;
  event_zone: string | null;
  pm_note: string | null;
  pm_est_cost: number | null;
  pm_est_labour_days: number | null;
  pm_est_material_cost: number | null;
  pm_est_notes: string | null;
  scope_count: number;
  scopes: ScopeRef[] | null;
  wo_count: number;
  work_orders: WORef[] | null;
  bom_groups: BomGroup[] | null;
  bom_total: number;
  estimated_labour_cost: number;
  estimated_material_cost: number;
  documents: DocRef[] | null;
  learning_count: number;
  learning_open: number;
};

type Payload = {
  job: JobRow;
  quote_lines: QuoteLine[];
};

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
    <span className={cn("shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border", map[category] || "bg-surface-mid text-muted border-subtle")}>
      {category}
    </span>
  );
}

function WoStatusPill({ status }: { status: string | null }) {
  const s = (status || "").toLowerCase();
  const cls =
    s === "complete" || s === "completed"
      ? "bg-starlight-green/10 text-starlight-green"
      : s === "in_progress" || s === "active"
      ? "bg-starlight-blue/10 text-starlight-blue"
      : s === "blocked" || s === "flagged"
      ? "bg-starlight-red/10 text-starlight-red"
      : "bg-surface-mid text-muted";
  return <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", cls)}>{status || "—"}</span>;
}

/* ---------- Document download ---------- */

function DocLink({ doc }: { doc: DocRef }) {
  const isCad = doc.doc_type === "cad_model";
  const iconCls = isCad ? "text-starlight-blue" : "text-muted";
  return (
    <a
      href={doc.onedrive_path || "#"}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs border border-subtle hover:bg-surface-mid"
      title={isCad ? "Download CAD file" : "Open document"}
    >
      {isCad ? <Box className={cn("h-3.5 w-3.5", iconCls)} /> : <FileText className={cn("h-3.5 w-3.5", iconCls)} />}
      <span className="max-w-[220px] truncate">{doc.file_name}</span>
      <Download className="h-3 w-3 text-faint ml-1" />
    </a>
  );
}

/* ---------- Cost strip ---------- */

function CostStrip({ ql }: { ql: QuoteLine }) {
  const quoted = Number(ql.line_value ?? 0);
  const pmEst = Number(ql.pm_est_cost ?? 0);
  const estLabour = Number(ql.estimated_labour_cost ?? 0);
  const estMaterials = Number(ql.estimated_material_cost ?? 0);
  const committed = Number(ql.bom_total ?? 0);
  const actualLabour = (ql.work_orders ?? []).reduce((s, w) => s + Number(w.actual_labour_cost || 0), 0);
  const workshopEst = estLabour + estMaterials;

  const cells: { label: string; value: number; hint?: string }[] = [
    { label: "Quoted", value: quoted },
    { label: "PM est.", value: pmEst, hint: "Your early estimate" },
    { label: "Workshop est.", value: workshopEst, hint: "Labour + materials estimate" },
    { label: "Committed", value: committed, hint: "BOM rows committed" },
    { label: "Actual labour", value: actualLabour, hint: "From time entries" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
      {cells.map((c) => (
        <div key={c.label} className="rounded border border-subtle bg-surface px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-faint">{c.label}</div>
          <div className="text-sm font-semibold text-navy">{c.value ? formatCurrency(c.value) : "—"}</div>
          {c.hint && <div className="text-[10px] text-faint mt-0.5">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}

/* ---------- WO block ---------- */

function WoBlock({ wo, jobId }: { wo: WORef; jobId: number }) {
  const est = Number(wo.estimated_duration_hrs ?? 0);
  const act = Number(wo.actual_hours ?? 0);
  const over = est > 0 && act > est;
  return (
    <div className="border border-subtle rounded p-3 bg-surface space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] text-faint">WO#{wo.work_order_id}</span>
            <span className="font-medium text-navy text-sm">{wo.activity_label}</span>
            <WoStatusPill status={wo.status} />
            {wo.predecessor_wo_id && (
              <span className="text-[10px] text-muted">↳ after WO#{wo.predecessor_wo_id}</span>
            )}
          </div>
          {wo.description && <div className="text-xs text-muted mt-1 whitespace-pre-wrap">{wo.description}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            {wo.lead_name && <span>Lead: {wo.lead_name}</span>}
            <span className={cn(over && "text-starlight-red")}>
              {formatHours(act)} / {formatHours(est)}
            </span>
            {Number(wo.actual_labour_cost) > 0 && <span>{formatCurrency(wo.actual_labour_cost)} labour</span>}
          </div>
          {wo.paint_notes && (
            <div className="mt-1.5 text-[11px] text-muted italic">Paint: {wo.paint_notes}</div>
          )}
        </div>
      </div>
      <LearningsSection
        context={{
          work_order_id: wo.work_order_id,
          job_id: jobId,
          contextLabel: `WO#${wo.work_order_id} ${wo.activity_label}`,
          contextSublabel: wo.description ?? undefined,
        }}
        filterField="work_order_id"
        filterValue={wo.work_order_id}
        title="Notes"
        defaultCollapsed
      />
    </div>
  );
}

/* ---------- Material rollup row ---------- */

function MaterialRow({ g, jobId }: { g: BomGroup; jobId: number }) {
  const [showWhere, setShowWhere] = useState(false);
  const flagStock = g.any_from_stock;
  const flagOrder = g.any_needs_ordering;
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
        {flagStock && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-starlight-green/10 text-starlight-green">
            <CheckCircle2 className="h-2.5 w-2.5" /> From stock
          </span>
        )}
        {flagOrder && (
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
            <span key={id} className="font-mono mr-2">
              WO#{id}
            </span>
          ))}
        </div>
      )}
      {g.first_bom_id && (
        <LearningsSection
          context={{
            bom_id: g.first_bom_id,
            job_id: jobId,
            contextLabel: `Material: ${g.group_key}`,
            contextSublabel: g.unit ? `${g.total_quantity} ${g.unit}` : undefined,
          }}
          filterField="bom_id"
          filterValue={g.first_bom_id}
          title="Notes"
          defaultCollapsed
        />
      )}
    </div>
  );
}

/* ---------- Quote line row (the centrepiece) ---------- */

function QuoteLineRow({ ql, jobId }: { ql: QuoteLine; jobId: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasScopes = ql.scope_count > 0;
  const isMultiScope = ql.scope_count >= 2;
  const isOrphan = ql.scope_count === 0;

  // WOs grouped by scope_item_id for multi-scope lines
  const wosByScope = useMemo(() => {
    const map = new Map<number, WORef[]>();
    (ql.work_orders ?? []).forEach((w) => {
      if (!map.has(w.scope_item_id)) map.set(w.scope_item_id, []);
      map.get(w.scope_item_id)!.push(w);
    });
    return map;
  }, [ql.work_orders]);

  // Docs grouped by WO for in-WO display
  const docsByWo = useMemo(() => {
    const map = new Map<number, DocRef[]>();
    (ql.documents ?? []).forEach((d) => {
      if (!d.work_order_id) return;
      if (!map.has(d.work_order_id)) map.set(d.work_order_id, []);
      map.get(d.work_order_id)!.push(d);
    });
    return map;
  }, [ql.documents]);

  const lineCost = Number(ql.line_value ?? 0);

  return (
    <div className="card overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-surface-mid/50 transition-colors"
      >
        <div className="shrink-0 text-muted">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="shrink-0 font-mono text-[11px] text-faint w-10 text-right">{ql.line_number}</div>
        <CategoryPill category={ql.category} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-navy truncate">{ql.line_text}</div>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[10px] text-muted">
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
            {ql.wo_count > 0 && (
              <span>
                · {ql.wo_count} WO{ql.wo_count > 1 ? "s" : ""}
              </span>
            )}
            {ql.learning_open > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <AlertCircle className="h-2.5 w-2.5" /> {ql.learning_open} open
              </span>
            )}
            {ql.learning_count > 0 && ql.learning_open === 0 && (
              <span className="inline-flex items-center gap-1 text-muted">
                <MessageSquare className="h-2.5 w-2.5" /> {ql.learning_count}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-navy">{formatCurrency(lineCost)}</div>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-subtle bg-base/30 space-y-4">
          {/* Cost strip */}
          <CostStrip ql={ql} />

          {/* Orphan: just line text + notes */}
          {isOrphan && (
            <>
              <div className="text-xs text-muted italic">
                This quote line hasn&apos;t been broken into scope yet. Notes here capture anything worth
                remembering before planning starts.
              </div>
              <LearningsSection
                context={{
                  quote_line_id: ql.quote_line_id,
                  job_id: jobId,
                  contextLabel: `Line ${ql.line_number}: ${ql.line_text.slice(0, 80)}`,
                }}
                filterField="quote_line_id"
                filterValue={ql.quote_line_id}
                title="Line notes"
                defaultCollapsed={false}
              />
            </>
          )}

          {/* 1-scope: flat WO list */}
          {hasScopes && !isMultiScope && (
            <>
              {(ql.work_orders ?? []).length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted uppercase tracking-wide">
                    <Hammer className="h-3.5 w-3.5" /> Work orders
                  </div>
                  <div className="space-y-2">
                    {(ql.work_orders ?? []).map((wo) => (
                      <div key={wo.work_order_id}>
                        <WoBlock wo={wo} jobId={jobId} />
                        {(docsByWo.get(wo.work_order_id) ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1 pl-3">
                            {(docsByWo.get(wo.work_order_id) ?? []).map((d) => (
                              <DocLink key={d.doc_id} doc={d} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Multi-scope: group WOs under scope headings */}
          {isMultiScope && (
            <>
              {(ql.scopes ?? []).map((s) => {
                const scopeWos = wosByScope.get(s.scope_item_id) ?? [];
                return (
                  <section key={s.scope_item_id} className="border-l-2 border-starlight-blue/40 pl-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-navy">
                        Scope: {s.item_name || `#${s.scope_item_id}`}
                      </span>
                      {s.status && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-mid text-muted">
                          {s.status}
                        </span>
                      )}
                      {s.event_zone && <span className="text-[10px] text-muted">{s.event_zone}</span>}
                    </div>
                    {scopeWos.length > 0 ? (
                      <div className="space-y-2">
                        {scopeWos.map((wo) => (
                          <div key={wo.work_order_id}>
                            <WoBlock wo={wo} jobId={jobId} />
                            {(docsByWo.get(wo.work_order_id) ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1 pl-3">
                                {(docsByWo.get(wo.work_order_id) ?? []).map((d) => (
                                  <DocLink key={d.doc_id} doc={d} />
                                ))}
                              </div>
                            )}
                          </div>
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
                      title="Scope notes"
                      defaultCollapsed
                    />
                  </section>
                );
              })}
            </>
          )}

          {/* Materials rollup */}
          {hasScopes && (ql.bom_groups ?? []).length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted uppercase tracking-wide">
                <Package className="h-3.5 w-3.5" /> Materials
              </div>
              <div className="space-y-1.5">
                {(ql.bom_groups ?? []).map((g) => (
                  <MaterialRow key={g.group_key} g={g} jobId={jobId} />
                ))}
              </div>
            </section>
          )}

          {/* Line notes (shown for all, after the detail) */}
          {hasScopes && (
            <LearningsSection
              context={{
                quote_line_id: ql.quote_line_id,
                job_id: jobId,
                contextLabel: `Line ${ql.line_number}: ${ql.line_text.slice(0, 80)}`,
              }}
              filterField="quote_line_id"
              filterValue={ql.quote_line_id}
              title="Line notes"
              defaultCollapsed
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- The page ---------- */

export default function PmJobPage() {
  const params = useParams<{ id: string }>();
  const jobId = Number(params?.id);
  const supabase = createClient();

  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

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
    return payload.quote_lines.filter((ql) => {
      if (zoneFilter !== "all" && ql.event_zone !== zoneFilter) return false;
      if (categoryFilter !== "all" && ql.category !== categoryFilter) return false;
      return true;
    });
  }, [payload, zoneFilter, categoryFilter]);

  // Group lines by line_sub_group for section headers
  const grouped = useMemo(() => {
    const m = new Map<string, QuoteLine[]>();
    filteredLines.forEach((ql) => {
      const k = ql.line_sub_group || "Other";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(ql);
    });
    return Array.from(m.entries());
  }, [filteredLines]);

  if (loading) {
    return <div className="card px-5 py-8 text-center text-muted text-sm animate-pulse">Loading job overview…</div>;
  }
  if (error || !payload) {
    return <div className="card px-5 py-8 text-center text-starlight-red text-sm">{error || "Job not found"}</div>;
  }

  const job = payload.job;
  const totalQuoted = payload.quote_lines.reduce((s, ql) => s + Number(ql.line_value || 0), 0);
  const orphans = payload.quote_lines.filter((ql) => ql.scope_count === 0).length;

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
            <span>· {formatCurrency(totalQuoted)}</span>
            <span>· {payload.quote_lines.length} lines</span>
            {orphans > 0 && <span className="text-amber-600">· {orphans} not planned</span>}
          </div>
        </div>
      </div>

      {/* Job-level notes */}
      <LearningsSection
        context={{
          job_id: jobId,
          contextLabel: `Job: ${job.job_name}`,
          contextSublabel: job.job_number ?? undefined,
        }}
        filterField="job_id"
        filterValue={jobId}
        title="Job notes"
        defaultCollapsed
      />

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted">Filter:</span>
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="px-2 py-1 border border-subtle rounded bg-surface text-navy"
        >
          <option value="all">All zones</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-2 py-1 border border-subtle rounded bg-surface text-navy"
        >
          <option value="all">All departments</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="ml-auto text-muted">
          Showing {filteredLines.length} / {payload.quote_lines.length} lines
        </span>
      </div>

      {/* Quote lines, grouped by sub_group */}
      <div className="space-y-5">
        {grouped.map(([group, lines]) => (
          <section key={group} className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted px-1">{group}</div>
            <div className="space-y-2">
              {lines.map((ql) => (
                <QuoteLineRow key={ql.quote_line_id} ql={ql} jobId={jobId} />
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
