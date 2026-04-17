"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, BookOpen, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase-browser";
import {
  LearningEnriched,
  LearningEntityContext,
  CATEGORY_MAP,
  severityDots,
  severityColour,
} from "@/lib/learnings";
import { LearningCapture } from "@/components/learning-capture";

interface LearningsSectionProps {
  context: LearningEntityContext;
  filterField:
    | "job_id" | "quote_line_id" | "scope_item_id" | "work_order_id"
    | "bom_id" | "time_entry_id" | "material_id" | "stock_item_id"
    | "freelancer_id" | "supplier_id";
  filterValue: number;
  title?: string;
  defaultCollapsed?: boolean;
  canEdit?: boolean;
}

export function LearningsSection({
  context, filterField, filterValue,
  title = "Learnings", defaultCollapsed = false, canEdit = true,
}: LearningsSectionProps) {
  const supabase = createClient();
  const [rows, setRows] = useState<LearningEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("qry_learnings_enriched")
      .select("*")
      .eq(filterField, filterValue)
      .order("created_at", { ascending: false });
    if (error) { toast.error(`Load learnings: ${error.message}`); setRows([]); }
    else { setRows((data ?? []) as LearningEnriched[]); }
    setLoading(false);
  }, [filterField, filterValue, supabase]);

  useEffect(() => { load(); }, [load]);

  const openCount = rows.filter((r) => r.actionable && !r.resolved_at).length;

  const handleResolve = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("tbl_learnings")
      .update({ resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null })
      .eq("learning_id", id);
    if (error) toast.error(`Resolve: ${error.message}`);
    else { toast.success("Resolved"); load(); }
  };

  const handleReopen = async (id: string) => {
    const { error } = await supabase.from("tbl_learnings")
      .update({ resolved_at: null, resolved_by: null }).eq("learning_id", id);
    if (error) toast.error(`Reopen: ${error.message}`);
    else load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this learning? This cannot be undone.")) return;
    const { error } = await supabase.from("tbl_learnings").delete().eq("learning_id", id);
    if (error) toast.error(`Delete: ${error.message}`);
    else { toast.success("Deleted"); load(); }
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <button onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 text-navy hover:text-muted">
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <BookOpen size={16} className="text-muted" />
          <span className="font-medium">{title}</span>
          <span className="text-sm text-muted">({rows.length})</span>
          {openCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-starlight-amber">
              <AlertCircle size={12} /> {openCount} open
            </span>
          )}
        </button>
        {canEdit && (
          <button onClick={() => setCaptureOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-surface-hi hover:bg-surface-mid text-navy rounded border border-subtle">
            <Plus size={14} /> Add
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="divide-y divide-subtle">
          {loading ? (
            <div className="px-4 py-6 text-sm text-muted">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted">
              No learnings yet.{canEdit && " Click Add to capture the first one."}
            </div>
          ) : (
            rows.map((r) => {
              const cat = CATEGORY_MAP[r.category];
              const isResolved = !!r.resolved_at;
              const isActionableOpen = r.actionable && !isResolved;
              const expanded = expandedId === r.learning_id;
              return (
                <div key={r.learning_id}
                  className={`px-4 py-3 ${isActionableOpen ? "border-l-2 border-starlight-amber" : ""}`}>
                  <button onClick={() => setExpandedId(expanded ? null : r.learning_id)}
                    className="w-full flex items-start gap-3 text-left">
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs border ${cat.colour}`}>
                      {cat.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-navy">
                        {r.headline}
                        {isResolved && <CheckCircle2 size={12} className="inline ml-2 text-starlight-green" />}
                      </div>

                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        {r.sub_type && (
                          <span>{cat.subOptions.find((o) => o.value === r.sub_type)?.label ?? r.sub_type}</span>
                        )}
                        {r.severity != null && (
                          <span className={severityColour(r.severity)}>{severityDots(r.severity)}</span>
                        )}
                        {r.cost_impact_gbp != null && <span>£{Number(r.cost_impact_gbp).toFixed(0)}</span>}
                        {r.hours_impact != null && <span>{Number(r.hours_impact).toFixed(1)}h</span>}
                        <span>{new Date(r.created_at).toLocaleDateString("en-GB")}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-muted">
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                  </button>

                  {expanded && (
                    <div className="mt-3 space-y-3 text-sm">
                      {r.detail && <div className="text-muted whitespace-pre-wrap">{r.detail}</div>}
                      {r.context_label && <div className="text-xs text-faint">Context: {r.context_label}</div>}
                      {canEdit && (
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          {isResolved ? (
                            <button onClick={() => handleReopen(r.learning_id)}
                              className="px-2 py-1 text-xs border border-subtle rounded text-muted hover:text-navy">
                              Reopen
                            </button>
                          ) : (r.actionable && (
                            <button onClick={() => handleResolve(r.learning_id)}
                              className="px-2 py-1 text-xs border border-starlight-green/50 rounded text-starlight-green hover:bg-starlight-green/10">
                              <CheckCircle2 size={12} className="inline mr-1" /> Mark resolved
                            </button>
                          ))}
                          <button onClick={() => handleDelete(r.learning_id)}
                            className="px-2 py-1 text-xs border border-subtle rounded text-muted hover:text-starlight-red ml-auto">
                            <Trash2 size={12} className="inline mr-1" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
      <LearningCapture open={captureOpen} onClose={() => setCaptureOpen(false)} onSaved={load} context={context} />
    </section>
  );
}
