"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { CostBreakdown } from "@/components/cost-breakdown";
import { LearningsSection } from "@/components/learnings-section";
import { WODocumentsPanel } from "@/components/wo-documents-panel";
import {
  Coins,
  BookOpen,
  FolderOpen,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

type TabKey = "cost" | "learnings" | "docs";

interface ScopeTabsProps {
  scopeItemId: number;
  jobId: number;
  scopeName: string;
  scopeDescription?: string | null;
  jobNumber: string;
  jobName: string;
  quotedValue?: number;
  costRefreshKey?: number;
}

const STORAGE_KEY = "scope-active-tab";
const HASH_MAP: Record<string, TabKey> = { "#cost": "cost", "#learnings": "learnings", "#docs": "docs" };

function fmt(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}

export function ScopeTabs({
  scopeItemId, jobId, scopeName, scopeDescription,
  jobNumber, jobName, quotedValue, costRefreshKey,
}: ScopeTabsProps) {
  const supabase = createClient();

  // Tab state: URL hash > localStorage > default ("cost")
  const [activeTab, setActiveTab] = useState<TabKey>("cost");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Initial resolution on client only (avoids hydration mismatch)
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const fromHash = HASH_MAP[hash];
    if (fromHash) {
      setActiveTab(fromHash);
    } else {
      const fromStorage = window.localStorage.getItem(STORAGE_KEY) as TabKey | null;
      if (fromStorage && ["cost", "learnings", "docs"].includes(fromStorage)) {
        setActiveTab(fromStorage);
      }
    }
    setMounted(true);
  }, []);

  const switchTab = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, tab);
    // Update hash without scroll jump
    const newHash = `#${tab}`;
    if (window.location.hash !== newHash) {
      history.replaceState(null, "", newHash);
    }
  }, []);

  // Summary state (fed by children via onSummaryChange)
  const [costSummary, setCostSummary] = useState<{
    quoted: number; pmEstTotal: number; estTotal: number; committedTotal: number;
    marginPct: number | null; woCount: number; completedWOs: number;
    hasInvoiced: boolean; invoicedTotal: number;
  } | null>(null);
  const [learningsSummary, setLearningsSummary] = useState<{ total: number; openCount: number } | null>(null);

  // Documents count — fetched here since the panel doesn't expose it (yet). One light query.
  const [docCount, setDocCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("tbl_wo_documents")
        .select("doc_id", { count: "exact", head: true })
        .eq("scope_item_id", scopeItemId)
        .is("work_order_id", null);
      if (!cancelled) setDocCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [scopeItemId, supabase]);

  // Margin colour helper — mirrors CostBreakdown mc(). Target 40% by default.
  const TARGET_MARGIN = 40;
  const marginColour = (pct: number | null) => {
    if (pct == null) return "text-muted";
    if (pct >= TARGET_MARGIN) return "text-starlight-green";
    if (pct >= TARGET_MARGIN * 0.5) return "text-starlight-amber";
    return "text-starlight-red";
  };

  const MarginIcon = ({ pct }: { pct: number | null }) => {
    if (pct == null) return <Minus className="h-3 w-3 text-muted" />;
    if (pct >= TARGET_MARGIN) return <TrendingUp className="h-3 w-3 text-starlight-green" />;
    if (pct >= TARGET_MARGIN * 0.5) return <Minus className="h-3 w-3 text-starlight-amber" />;
    return <TrendingDown className="h-3 w-3 text-starlight-red" />;
  };

  // Guard: don't render until mounted — prevents localStorage read during SSR.
  if (!mounted) {
    // Render a placeholder with cost tab active so the first paint matches the common case.
    return (
      <div className="card overflow-hidden">
        <div className="h-12 bg-surface-dim animate-pulse" />
      </div>
    );
  }

  const pillBase =
    "flex-1 min-w-0 flex items-center gap-2.5 px-4 py-3 text-sm border-b-2 transition-all";
  const pillActive = "border-b-starlight-blue bg-surface text-navy font-semibold";
  const pillInactive = "border-b-transparent text-muted hover:text-navy hover:bg-surface-dim";

  return (
    <div className="card overflow-hidden">
      {/* Tab pills */}
      <div className="flex items-stretch border-b border-subtle bg-surface-dim">
        {/* Cost */}
        <button
          onClick={() => switchTab("cost")}
          className={`${pillBase} ${activeTab === "cost" ? pillActive : pillInactive}`}
        >
          <Coins className="h-4 w-4 shrink-0" />
          <div className="flex flex-col items-start min-w-0">
            <span>Cost analysis</span>
            {costSummary && (
              <span className="text-[10px] font-normal text-muted flex items-center gap-1.5 mt-0.5">
                {costSummary.woCount > 0 && (
                  <span>{costSummary.completedWOs}/{costSummary.woCount} WOs</span>
                )}
                {costSummary.quoted > 0 && (
                  <>
                    {costSummary.woCount > 0 && <span>&middot;</span>}
                    <span>Q {fmt(costSummary.quoted)}</span>
                  </>
                )}
                {costSummary.marginPct != null && (
                  <>
                    <span>&middot;</span>
                    <span className={`font-semibold flex items-center gap-0.5 ${marginColour(costSummary.marginPct)}`}>
                      <MarginIcon pct={costSummary.marginPct} />
                      {costSummary.marginPct.toFixed(1)}%
                    </span>
                  </>
                )}
              </span>
            )}
          </div>
        </button>

        {/* Learnings */}
        <button
          onClick={() => switchTab("learnings")}
          className={`${pillBase} ${activeTab === "learnings" ? pillActive : pillInactive}`}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          <div className="flex flex-col items-start min-w-0">
            <span>
              Learnings
              {learningsSummary != null && (
                <span className="font-normal text-muted ml-1.5">({learningsSummary.total})</span>
              )}
            </span>
            {learningsSummary && learningsSummary.openCount > 0 && (
              <span className="text-[10px] font-normal text-starlight-amber flex items-center gap-1 mt-0.5">
                <AlertCircle className="h-2.5 w-2.5" /> {learningsSummary.openCount} open
              </span>
            )}
          </div>
        </button>

        {/* Documents */}
        <button
          onClick={() => switchTab("docs")}
          className={`${pillBase} ${activeTab === "docs" ? pillActive : pillInactive}`}
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          <div className="flex flex-col items-start min-w-0">
            <span>
              Documents
              {docCount != null && (
                <span className="font-normal text-muted ml-1.5">({docCount})</span>
              )}
            </span>
            <span className="text-[10px] font-normal text-muted mt-0.5 hidden md:inline">
              CAD, drawings, refs
            </span>
          </div>
        </button>
      </div>

      {/* Active panel. All 3 mount always — hidden by CSS — so summary callbacks keep firing and there's no re-fetch on switch. */}
      <div className="relative">
        <div className={activeTab === "cost" ? "block" : "hidden"}>
          <div className="p-4">
            <CostBreakdown
              scopeItemId={scopeItemId}
              quotedValue={quotedValue}
              refreshKey={costRefreshKey}
              hideHeader
              onSummaryChange={setCostSummary}
            />
          </div>
        </div>

        <div className={activeTab === "learnings" ? "block" : "hidden"}>
          <LearningsSection
            filterField="scope_item_id"
            filterValue={scopeItemId}
            context={{
              scope_item_id: scopeItemId,
              job_id: jobId,
              contextLabel: `Scope — ${scopeName || "Unnamed"}`,
              contextSublabel: scopeDescription || undefined,
            }}
            hideHeader
            onSummaryChange={setLearningsSummary}
          />
        </div>

        <div className={activeTab === "docs" ? "block" : "hidden"}>
          <div className="px-5 py-3 border-b border-subtle">
            <p className="text-xs text-muted">
              CAD concept &amp; breakdown, drawings and references for this scope item. WO-specific files live on the WO itself.
            </p>
          </div>
          <WODocumentsPanel
            jobId={jobId}
            scopeItemId={scopeItemId}
            scopeName={scopeName}
            jobNumber={jobNumber}
            jobName={jobName}
          />
        </div>
      </div>
    </div>
  );
}
