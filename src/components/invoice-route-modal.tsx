"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import { setLineAllocations } from "@/lib/invoice-routing";
import { toast } from "sonner";
import {
  X, Search, Coins, Briefcase, Package, ChevronRight, ChevronDown,
  Trash2, SplitSquareHorizontal, Loader2, Check,
} from "lucide-react";

// ————————————————————————————————————————————————————————————————
// Invoice line → scope routing modal (S68).
//
// Replaces the cramped inline <select>. One line at a time: pick a scope (or
// the job-overhead bucket), split by £ across several scopes, or — where a
// scope carries BOM rows — pin the spend to a specific planned BOM item so
// qry_bom_actuals can derive its actual unit cost. Each scope row shows its
// quoted / committed / planned position so you can see what's already on it
// before adding more (the double-entry guard). Reads qry_scope_cost_position
// + qry_bom_actuals; writes via setLineAllocations (audited).
// ————————————————————————————————————————————————————————————————

interface ScopePosition {
  scope_item_id: number;
  item_name: string | null;
  is_general: boolean;
  quoted: number | null;
  bom_planned: number;
  bom_rows: number;
  committed: number;
}
interface BomActual {
  bom_id: number;
  scope_item_id: number;
  item_description: string | null;
  quantity: number | null;
  unit: string | null;
  est_line_cost: number;
}
interface Draft {
  key: string;
  scope_item_id: number;
  bom_id: number | null;
  label: string;
  amount: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  line: { line_id: number; raw_description: string; line_total: number | null };
  jobId: number;
  onSaved: () => void | Promise<void>;
}

export function InvoiceRouteModal({ open, onClose, line, jobId, onSaved }: Props) {
  const supabase = createClient();
  const lineTotal = line.line_total || 0;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scopes, setScopes] = useState<ScopePosition[]>([]);
  const [boms, setBoms] = useState<BomActual[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [search, setSearch] = useState("");
  const [expandedScope, setExpandedScope] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setSearch("");
      setExpandedScope(null);
      const [posRes, allocRes] = await Promise.all([
        supabase.from("qry_scope_cost_position").select("*").eq("job_id", jobId),
        supabase.from("tbl_invoice_allocations").select("*").eq("invoice_line_id", line.line_id),
      ]);
      if (cancelled) return;
      const positions: ScopePosition[] = (posRes.data as any) || [];
      const scopeIds = positions.map((p) => p.scope_item_id);
      let bomRows: BomActual[] = [];
      if (scopeIds.length > 0) {
        const { data: bomData } = await supabase
          .from("qry_bom_actuals").select("*").in("scope_item_id", scopeIds);
        bomRows = (bomData as any) || [];
      }
      if (cancelled) return;
      setScopes(positions);
      setBoms(bomRows);

      const existing = (allocRes.data as any[]) || [];
      const seeded: Draft[] = existing
        .filter((a) => a.scope_item_id)
        .map((a) => {
          const sc = positions.find((p) => p.scope_item_id === a.scope_item_id);
          const bm = a.bom_id ? bomRows.find((b) => b.bom_id === a.bom_id) : null;
          return {
            key: `a${a.allocation_id}`,
            scope_item_id: a.scope_item_id,
            bom_id: a.bom_id ?? null,
            label: (sc?.item_name || `Scope #${a.scope_item_id}`) +
              (bm ? ` › ${bm.item_description || "item"}` : ""),
            amount: Number(a.allocated_amount) || 0,
          };
        });
      setDrafts(seeded);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId, line.line_id]);

  const allocated = useMemo(() => drafts.reduce((s, d) => s + d.amount, 0), [drafts]);
  const remainder = Math.round((lineTotal - allocated) * 100) / 100;
  const scopeName = (id: number) =>
    scopes.find((s) => s.scope_item_id === id)?.item_name || `Scope #${id}`;
  const bomsForScope = (id: number) => boms.filter((b) => b.scope_item_id === id);

  function addScope(scopeId: number) {
    if (drafts.some((d) => d.scope_item_id === scopeId && d.bom_id == null)) return;
    const amt = remainder > 0 ? remainder : 0;
    setDrafts((d) => [...d, {
      key: `s${scopeId}-${Date.now()}`, scope_item_id: scopeId, bom_id: null,
      label: scopeName(scopeId), amount: amt,
    }]);
  }
  function addBom(b: BomActual) {
    if (drafts.some((d) => d.bom_id === b.bom_id)) return;
    const amt = remainder > 0 ? remainder : 0;
    setDrafts((d) => [...d, {
      key: `b${b.bom_id}-${Date.now()}`, scope_item_id: b.scope_item_id, bom_id: b.bom_id,
      label: `${scopeName(b.scope_item_id)} › ${b.item_description || "item"}`, amount: amt,
    }]);
  }
  function setAmount(key: string, amount: number) {
    setDrafts((d) => d.map((x) => (x.key === key ? { ...x, amount } : x)));
  }
  function removeDraft(key: string) {
    setDrafts((d) => d.filter((x) => x.key !== key));
  }
  function evenSplit() {
    if (drafts.length === 0 || lineTotal <= 0) return;
    const each = Math.floor((lineTotal / drafts.length) * 100) / 100;
    setDrafts((d) => d.map((x, i) =>
      i === d.length - 1
        ? { ...x, amount: Math.round((lineTotal - each * (d.length - 1)) * 100) / 100 }
        : { ...x, amount: each }));
  }
  function keepAtJob() { setDrafts([]); }

  async function save() {
    if (allocated - lineTotal > 0.001) {
      toast.error(`Allocated ${formatCurrency(allocated)} exceeds line total ${formatCurrency(lineTotal)}`);
      return;
    }
    if (drafts.some((d) => d.amount <= 0)) {
      toast.error("Every allocation needs an amount above £0 — or remove it");
      return;
    }
    setSaving(true);
    const { error } = await setLineAllocations(
      line.line_id, lineTotal, jobId,
      drafts.map((d) => ({ scope_item_id: d.scope_item_id, bom_id: d.bom_id, amount: d.amount })),
    );
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success(drafts.length === 0 ? "Kept at job (unallocated)" : "Invoice line routed");
    await onSaved();
    onClose();
  }

  if (!open) return null;

  const q = search.trim().toLowerCase();
  const matches = (s: ScopePosition) => !q || (s.item_name || "").toLowerCase().includes(q);
  const generalScopes = scopes.filter((s) => s.is_general && matches(s));
  const realScopes = scopes
    .filter((s) => !s.is_general && matches(s))
    .sort((a, b) => (a.item_name || "").localeCompare(b.item_name || ""));

  const renderScopeRow = (s: ScopePosition, amber: boolean) => {
    const sBoms = bomsForScope(s.scope_item_id);
    const isAdded = drafts.some((d) => d.scope_item_id === s.scope_item_id && d.bom_id == null);
    const expanded = expandedScope === s.scope_item_id;
    return (
      <div key={s.scope_item_id}
        className={"rounded-lg border " + (amber
          ? "border-starlight-amber/30 bg-starlight-amber/5"
          : "border-subtle bg-surface-dim/50")}>
        <div className="flex items-start gap-2 p-2.5">
          <button onClick={() => addScope(s.scope_item_id)} disabled={isAdded}
            className="flex-1 text-left min-w-0 disabled:opacity-60">
            <p className="text-xs text-navy leading-snug line-clamp-2">
              {amber && <Coins className="inline h-3 w-3 mr-1 text-starlight-amber" />}
              {s.item_name || `Scope #${s.scope_item_id}`}
            </p>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted flex-wrap">
              <span>Quoted <span className="text-navy font-mono">{s.quoted != null ? formatCurrency(s.quoted) : "—"}</span></span>
              <span>·</span>
              <span>Committed <span className={"font-mono " + (s.committed > 0 ? "text-starlight-green" : "text-muted")}>{formatCurrency(s.committed)}</span></span>
              {s.bom_planned > 0 && (<><span>·</span><span>BOM <span className="text-navy font-mono">{formatCurrency(s.bom_planned)}</span></span></>)}
            </div>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            {isAdded ? (
              <Check className="h-4 w-4 text-starlight-green" />
            ) : (
              <button onClick={() => addScope(s.scope_item_id)}
                className="text-[11px] px-2 py-1 rounded bg-starlight-blue/10 text-starlight-blue hover:bg-starlight-blue/20 font-medium">Add</button>
            )}
            {sBoms.length > 0 && (
              <button onClick={() => setExpandedScope(expanded ? null : s.scope_item_id)}
                title="Match to a planned BOM item" className="text-muted hover:text-navy p-1">
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
        {expanded && sBoms.length > 0 && (
          <div className="px-2.5 pb-2.5 space-y-1">
            <p className="text-[9px] uppercase tracking-wider text-muted px-1">Pin spend to a planned BOM item</p>
            {sBoms.map((b) => {
              const added = drafts.some((d) => d.bom_id === b.bom_id);
              return (
                <div key={b.bom_id} className="flex items-center gap-2 bg-surface rounded px-2 py-1 border border-subtle/60">
                  <Package className="h-3 w-3 text-starlight-blue shrink-0" />
                  <span className="text-[11px] text-navy flex-1 truncate" title={b.item_description || ""}>{b.item_description || `BOM #${b.bom_id}`}</span>
                  <span className="text-[10px] text-muted font-mono">est {b.est_line_cost > 0 ? formatCurrency(b.est_line_cost) : "—"}</span>
                  {added ? (<Check className="h-3 w-3 text-starlight-green" />) : (
                    <button onClick={() => addBom(b)} className="text-[10px] px-1.5 py-0.5 rounded bg-starlight-blue/10 text-starlight-blue hover:bg-starlight-blue/20">Add</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-subtle flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-navy">Route invoice line</h3>
            <p className="text-xs text-muted mt-0.5 truncate" title={line.raw_description}>{line.raw_description || "—"}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm font-mono font-semibold text-navy">{formatCurrency(lineTotal)}</span>
            <button onClick={onClose} className="text-muted hover:text-navy"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {/* Allocation summary */}
        <div className="px-5 py-3 border-b border-subtle bg-surface-dim/40 shrink-0 space-y-2">
          {drafts.length === 0 ? (
            <p className="text-xs text-muted">Nothing allocated — this line stays at <span className="text-navy font-medium">job level (unallocated)</span>. Pick a scope below to route it.</p>
          ) : (<>
            {drafts.map((d) => (
              <div key={d.key} className="flex items-center gap-2">
                <span className="text-xs text-navy flex-1 truncate" title={d.label}>
                  {d.bom_id != null && <Package className="inline h-3 w-3 mr-1 text-starlight-blue" />}
                  {d.label}
                </span>
                <span className="text-[11px] text-muted">£</span>
                <input type="number" min="0" step="0.01" value={d.amount || ""}
                  onChange={(e) => setAmount(d.key, e.target.value === "" ? 0 : Number(e.target.value))}
                  className="w-20 px-2 py-1 text-xs text-right font-mono bg-surface border border-subtle rounded focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                <span className="text-[10px] text-muted w-9 text-right font-mono">
                  {lineTotal > 0 ? `${Math.round((d.amount / lineTotal) * 100)}%` : "—"}
                </span>
                <button onClick={() => removeDraft(d.key)} className="text-faint hover:text-starlight-red p-0.5">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1 border-t border-subtle/60">
              <div className="flex items-center gap-3">
                {drafts.length > 1 && (
                  <button onClick={evenSplit} className="text-[11px] text-starlight-blue hover:underline inline-flex items-center gap-1">
                    <SplitSquareHorizontal className="h-3 w-3" /> Even split
                  </button>
                )}
                <button onClick={keepAtJob} className="text-[11px] text-muted hover:text-navy">Clear</button>
              </div>
              <span className={"text-[11px] font-mono " + (Math.abs(remainder) < 0.005 ? "text-starlight-green" : remainder < 0 ? "text-starlight-red" : "text-starlight-amber")}>
                {remainder < -0.005 ? `${formatCurrency(-remainder)} over` : Math.abs(remainder) < 0.005 ? "fully allocated" : `${formatCurrency(remainder)} left at job`}
              </span>
            </div>
          </>)}
        </div>

        {/* Scope picker */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 border-b border-subtle sticky top-0 bg-surface z-10">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted pointer-events-none" />
              <input type="text" placeholder="Search scopes…" value={search} autoFocus
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-surface-dim border border-subtle rounded-lg focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
            </div>
          </div>

          {loading ? (
            <p className="px-3 py-10 text-xs text-muted text-center animate-pulse">Loading scopes…</p>
          ) : (
            <div className="p-3 space-y-3">
              {generalScopes.length > 0 && (
                <div>
                  <div className="px-1 pb-1.5 text-[10px] font-semibold text-starlight-amber uppercase tracking-wider flex items-center gap-1.5">
                    <Coins className="h-3 w-3" /> Job overhead
                  </div>
                  <div className="space-y-1.5">{generalScopes.map((s) => renderScopeRow(s, true))}</div>
                </div>
              )}
              <div>
                <div className="px-1 pb-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3" /> Scopes
                </div>
                <div className="space-y-1.5">
                  {realScopes.map((s) => renderScopeRow(s, false))}
                  {realScopes.length === 0 && (
                    <p className="text-xs text-muted px-1 py-4 text-center">
                      {q ? "No scopes match your search." : "This job has no scopes."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-subtle flex items-center justify-between gap-3 shrink-0">
          <button onClick={keepAtJob} className="text-xs text-muted hover:text-navy">Keep at job (unallocated)</button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted hover:text-navy">Cancel</button>
            <button onClick={save} disabled={saving}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-starlight-blue text-white hover:bg-navy disabled:opacity-50 inline-flex items-center gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save routing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
