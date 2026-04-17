"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertCircle, CheckCircle2, BookOpen, Search } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase-browser";
import {
  LearningEnriched,
  LEARNING_CATEGORIES,
  CATEGORY_MAP,
  LearningCategory,
  severityDots,
  severityColour,
} from "@/lib/learnings";

function linkFor(r: LearningEnriched): string | null {
  if (r.scope_item_id && r.job_id) return `/jobs/${r.job_id}/scope/${r.scope_item_id}`;
  if (r.job_id) return `/jobs/${r.job_id}`;
  return null;
}

export function LearningsTab() {
  const supabase = createClient();
  const [rows, setRows] = useState<LearningEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<LearningCategory | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "resolved">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("qry_learnings_enriched")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { toast.error(`Load learnings: ${error.message}`); setRows([]); }
    else setRows((data ?? []) as LearningEnriched[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => {
    if (filterCat !== "all" && r.category !== filterCat) return false;
    if (filterStatus === "open" && (!r.actionable || r.resolved_at)) return false;
    if (filterStatus === "resolved" && !r.resolved_at) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = (r.headline || "") + " " + (r.detail || "") + " " + (r.context_label || "") + " " + (r.job_number || "");
      if (!hay.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total = rows.length;
  const openActionable = rows.filter((r) => r.actionable && !r.resolved_at).length;
  const byCat: Record<string, number> = {};
  for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card px-4 py-3">
          <div className="text-xs text-muted">Total learnings</div>
          <div className="text-2xl font-semibold text-navy">{total}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-xs text-muted">Open (actionable)</div>
          <div className="text-2xl font-semibold text-starlight-amber flex items-center gap-2">
            {openActionable}
            {openActionable > 0 && <AlertCircle size={18} />}
          </div>
        </div>
        <div className="card px-4 py-3 col-span-2 sm:col-span-2">
          <div className="text-xs text-muted mb-1">By category</div>
          <div className="flex flex-wrap gap-1">
            {LEARNING_CATEGORIES.map((c) => {
              const n = byCat[c.id] || 0;
              if (n === 0) return null;
              return (
                <button key={c.id} onClick={() => setFilterCat(filterCat === c.id ? "all" : c.id)}
                  className={`px-2 py-0.5 text-xs rounded-full border ${c.colour} ${filterCat === c.id ? "ring-2 ring-offset-0 ring-white/30" : ""}`}>
                  {c.label} {n}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card px-3 py-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2 top-2.5 text-faint" />
          <input type="text" placeholder="Search headline, detail, job…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-sm bg-surface-hi border border-subtle rounded text-navy placeholder:text-faint" />
        </div>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value as LearningCategory | "all")}
          className="px-3 py-1.5 text-sm bg-surface-hi border border-subtle rounded text-navy">
          <option value="all">All categories</option>
          {LEARNING_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <div className="flex rounded border border-subtle overflow-hidden">
          {(["all", "open", "resolved"] as const).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-sm capitalize ${filterStatus === s ? "bg-navy text-white" : "bg-surface-hi text-muted hover:text-navy"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card px-6 py-10 text-center text-muted text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card px-6 py-10 text-center text-muted text-sm">
          <BookOpen className="mx-auto mb-2 opacity-40" size={24} />
          No learnings match this filter.
        </div>
      ) : (
        <div className="card divide-y divide-subtle">
          {filtered.map((r) => {
            const cat = CATEGORY_MAP[r.category];
            const isResolved = !!r.resolved_at;
            const isOpen = r.actionable && !isResolved;
            const link = linkFor(r);
            const body = (
              <div className={`px-4 py-3 flex items-start gap-3 ${isOpen ? "border-l-2 border-starlight-amber" : ""}`}>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs border ${cat.colour}`}>{cat.label}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-navy">
                    {r.headline}
                    {isResolved && <CheckCircle2 size={12} className="inline ml-2 text-starlight-green" />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {r.context_label && <span className="truncate max-w-[30ch]">{r.context_label}</span>}
                    {r.sub_type && <span>{cat.subOptions.find((o) => o.value === r.sub_type)?.label ?? r.sub_type}</span>}
                    {r.severity != null && <span className={severityColour(r.severity)}>{severityDots(r.severity)}</span>}
                    {r.cost_impact_gbp != null && <span>£{Number(r.cost_impact_gbp).toFixed(0)}</span>}
                    {r.hours_impact != null && <span>{Number(r.hours_impact).toFixed(1)}h</span>}
                    <span>{new Date(r.created_at).toLocaleDateString("en-GB")}</span>
                  </div>
                  {r.detail && <div className="mt-1 text-xs text-muted line-clamp-2">{r.detail}</div>}
                </div>
              </div>
            );
            return link ? (
              <Link key={r.learning_id} href={link} className="block hover:bg-surface-hi/40">{body}</Link>
            ) : (
              <div key={r.learning_id}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
