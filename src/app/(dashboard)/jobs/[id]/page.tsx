"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatDate, formatCurrency } from "@/lib/utils";
import { DaysRemainingBadge, StatusBadge } from "@/components/ui/badges";
import { LookupCombo } from "@/components/ui/lookup-combo";
import { CreateScopeDialog } from "@/components/create-scope-dialog";
import { ArrowLeft, Plus, Check, FileText, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Job, QuoteLine, ScopeItem, Quote } from "@/lib/types";
import { isTruthy } from "@/lib/types";

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = Number(params.id);
  const supabase = createClient();

  const [job, setJob] = useState<Job | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [scopes, setScopes] = useState<ScopeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"lines" | "scopes">("lines");

  // Dialog state
  const [scopeDialogLine, setScopeDialogLine] = useState<QuoteLine | null>(null);

  // Track which cells are saving
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    const [jobRes, quotesRes, linesRes, scopesRes] = await Promise.all([
      supabase.from("tbl_production_plan").select("*").eq("job_id", jobId).single(),
      supabase.from("tbl_quotes").select("*").eq("job_id", jobId),
      supabase.from("tbl_quote_lines").select("*").eq("job_id", jobId).order("import_sequence"),
      supabase.from("tbl_scope_items").select("*").eq("job_id", jobId).order("created_at"),
    ]);

    if (jobRes.data) setJob(jobRes.data);
    if (quotesRes.data) setQuotes(quotesRes.data);
    if (linesRes.data) setLines(linesRes.data);
    if (scopesRes.data) setScopes(scopesRes.data);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- INLINE UPDATE HANDLERS ----

  const updateLine = async (
    lineId: number,
    field: string,
    value: string | null
  ) => {
    const cellKey = `${lineId}-${field}`;
    setSavingCells((prev) => new Set(prev).add(cellKey));

    await supabase
      .from("tbl_quote_lines")
      .update({ [field]: value })
      .eq("quote_line_id", lineId);

    // Optimistic update
    setLines((prev) =>
      prev.map((l) =>
        l.quote_line_id === lineId ? { ...l, [field]: value } : l
      )
    );

    setSavingCells((prev) => {
      const next = new Set(prev);
      next.delete(cellKey);
      return next;
    });
  };

  const toggleInterpretation = async (line: QuoteLine) => {
    const newVal = isTruthy(line.interpretation_complete) ? "false" : "true";
    await updateLine(line.quote_line_id, "interpretation_complete", newVal);
  };

  // ---- SCOPE CREATION ----

  const handleScopeCreated = (scopeItemId: number) => {
    setScopeDialogLine(null);
    loadData(); // Refresh all data
    // Navigate to scope detail
    router.push(`/jobs/${jobId}/scope/${scopeItemId}`);
  };

  // ---- COMPUTED VALUES ----

  // Lines that CAN have scope items created (get [+] button and amber highlight)
  const scopeReadyCategories = ["Workshop Build", "Workshop", "Stock-and-Hire"];
  // All workshop-related categories (get the Done checkbox)
  const workshopCategories = ["Workshop Build", "Workshop", "Stock-and-Hire", "Provisional"];
  const workshopLines = lines.filter((l) => workshopCategories.includes(l.category || ""));
  const scopeReadyLines = lines.filter((l) => scopeReadyCategories.includes(l.category || ""));
  const uninterpretedCount = scopeReadyLines.filter((l) => !isTruthy(l.interpretation_complete)).length;
  const totalValue = lines.reduce((s, l) => s + (l.line_value || 0), 0);
  const interpretedValue = scopeReadyLines
    .filter((l) => isTruthy(l.interpretation_complete))
    .reduce((s, l) => s + (l.line_value || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">
        Loading job...
      </div>
    );
  }

  if (!job) {
    return <div className="text-center py-12 text-gray-400">Job not found</div>;
  }

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-navy transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All Jobs
      </Link>

      {/* Job header */}
      <div className="card px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 font-mono">{job.job_number}</p>
            <h1 className="text-xl font-bold text-navy mt-1">{job.job_name}</h1>
            <p className="text-sm text-gray-500 mt-1">{job.client_name}</p>
          </div>
          <div className="text-right space-y-1">
            <DaysRemainingBadge eventDate={job.event_date} />
            <p className="text-sm text-gray-500">{formatDate(job.event_date)}</p>
            {job.event_location && (
              <p className="text-xs text-gray-400">{job.event_location}</p>
            )}
          </div>
        </div>
      </div>

      {/* Quote summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Total Lines</p>
          <p className="text-lg font-semibold text-navy">{lines.length}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Quote Value</p>
          <p className="text-lg font-semibold text-navy">{formatCurrency(totalValue)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Scope-Ready Lines</p>
          <p className="text-lg font-semibold text-navy">
            {scopeReadyLines.length - uninterpretedCount}/{scopeReadyLines.length}
            <span className="text-xs font-normal text-gray-400 ml-1">interpreted</span>
          </p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-gray-400">Scope Value Covered</p>
          <p className="text-lg font-semibold text-navy">{formatCurrency(interpretedValue)}</p>
        </div>
      </div>

      {/* Uninterpreted alert */}
      {uninterpretedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-starlight-amber animate-pulse" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{uninterpretedCount}</span> workshop
            lines awaiting scope interpretation
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("lines")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "lines"
              ? "border-starlight-red text-navy"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Quote Lines ({lines.length})
        </button>
        <button
          onClick={() => setActiveTab("scopes")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "scopes"
              ? "border-starlight-red text-navy"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Scope Items ({scopes.length})
        </button>
      </div>

      {/* TAB: Quote Lines */}
      {activeTab === "lines" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-starlight-bg text-left">
                  <th className="px-3 py-2.5 font-medium text-gray-500 w-12">#</th>
                  <th className="px-3 py-2.5 font-medium text-gray-500 w-20">Zone</th>
                  <th className="px-3 py-2.5 font-medium text-gray-500">Description</th>
                  <th className="px-3 py-2.5 font-medium text-gray-500 w-52">Category</th>
                  <th className="px-3 py-2.5 font-medium text-gray-500 w-24 text-right">Value</th>
                  <th className="px-3 py-2.5 font-medium text-gray-500 w-20 text-center">Done</th>
                  <th className="px-3 py-2.5 font-medium text-gray-500 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const isWorkshop = workshopCategories.includes(line.category || "");
                  const isScopeReady = scopeReadyCategories.includes(line.category || "");
                  const isInterpreted = isTruthy(line.interpretation_complete);
                  const isUninterpreted = isScopeReady && !isInterpreted;
                  const hasScope = scopes.some(
                    (s) => s.quote_line_id === line.quote_line_id
                  );

                  return (
                    <tr
                      key={line.quote_line_id}
                      className={`border-t border-gray-100 transition-colors ${
                        isUninterpreted
                          ? "bg-amber-50/60 border-l-4 border-l-starlight-amber"
                          : isInterpreted && isScopeReady
                          ? "bg-green-50/30"
                          : ""
                      }`}
                    >
                      {/* Line number */}
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-400">
                        {line.line_number}
                      </td>

                      {/* Zone */}
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {line.event_zone}
                      </td>

                      {/* Description — clickable to expand */}
                      <td className="px-3 py-2.5 text-gray-700">
                        <p className="text-sm leading-relaxed">
                          {(line.line_text || "").substring(0, 150)}
                          {(line.line_text || "").length > 150 ? "..." : ""}
                        </p>
                        {/* PM note inline edit */}
                        <input
                          type="text"
                          value={line.pm_note || ""}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.quote_line_id === line.quote_line_id
                                  ? { ...l, pm_note: e.target.value }
                                  : l
                              )
                            )
                          }
                          onBlur={(e) =>
                            updateLine(
                              line.quote_line_id,
                              "pm_note",
                              e.target.value || null
                            )
                          }
                          placeholder="PM note..."
                          className="mt-1 w-full px-2 py-1 text-xs border-0 border-b border-transparent hover:border-gray-200 focus:border-starlight-blue focus:outline-none bg-transparent text-gray-500 placeholder:text-gray-300"
                        />
                      </td>

                      {/* Category dropdown */}
                      <td className="px-3 py-2.5">
                        <LookupCombo
                          category="QUOTE_LINE_CATEGORY"
                          value={line.category}
                          onChange={(val) =>
                            updateLine(line.quote_line_id, "category", val)
                          }
                          className="w-full text-xs"
                        />
                      </td>

                      {/* Value */}
                      <td className="px-3 py-2.5 text-right font-medium text-gray-700">
                        {formatCurrency(line.line_value)}
                      </td>

                      {/* Interpretation toggle */}
                      <td className="px-3 py-2.5 text-center">
                        {isWorkshop ? (
                          <button
                            onClick={() => toggleInterpretation(line)}
                            className={`w-6 h-6 rounded-md border-2 inline-flex items-center justify-center transition-all ${
                              isInterpreted
                                ? "bg-starlight-green border-starlight-green text-white"
                                : "border-gray-300 hover:border-starlight-amber"
                            }`}
                          >
                            {isInterpreted && <Check className="h-3.5 w-3.5" />}
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5">
                        {isScopeReady && !hasScope && (
                          <button
                            onClick={() => setScopeDialogLine(line)}
                            title="Create Scope Item from this line"
                            className="p-1.5 text-starlight-red hover:bg-red-50 rounded-md transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                        {hasScope && (
                          <a
                            href={`/jobs/${jobId}/scope/${scopes.find(s => s.quote_line_id === line.quote_line_id)?.scope_item_id}`}
                            title="Open scope item"
                            className="inline-flex items-center text-starlight-green hover:text-green-700 transition-colors"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Scope Items */}
      {activeTab === "scopes" && (
        <div className="space-y-3">
          {scopes.length === 0 ? (
            <div className="card px-6 py-10 text-center text-gray-400 text-sm">
              No scope items yet. Create one from the Quote Lines tab.
            </div>
          ) : (
            scopes.map((scope) => (
              <Link
                key={scope.scope_item_id}
                href={`/jobs/${jobId}/scope/${scope.scope_item_id}`}
                className="card px-5 py-4 flex items-center justify-between hover:shadow-md transition-shadow block"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium text-navy">
                      {scope.item_name || "(unnamed)"}
                    </h3>
                    <StatusBadge status={scope.status} />
                    {isTruthy(scope.is_general) && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                        General
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    {scope.event_zone && <span>Zone: {scope.event_zone}</span>}
                    {scope.complexity_construction && (
                      <span>Complexity: {scope.complexity_construction}</span>
                    )}
                    {scope.finish_relative && (
                      <span>Finish: {scope.finish_relative}</span>
                    )}
                  </div>
                  {scope.description && (
                    <p className="text-sm text-gray-500 mt-1">
                      {scope.description.substring(0, 100)}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" />
              </Link>
            ))
          )}
        </div>
      )}

      {/* Scope creation dialog */}
      {scopeDialogLine && (
        <CreateScopeDialog
          jobId={jobId}
          quoteLine={scopeDialogLine}
          onClose={() => setScopeDialogLine(null)}
          onCreated={handleScopeCreated}
        />
      )}
    </div>
  );
}
