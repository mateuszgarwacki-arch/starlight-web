"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { MessageCircleQuestion, Copy, Check, ChevronDown, ChevronRight, Send, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface PmQueryRow {
  query_id: number;
  scope_item_id: number | null;
  question: string;
  answer: string | null;
  status: string;
  photo_url: string | null;
  scope_name?: string;
}

interface PmQueriesJobPanelProps {
  jobId: number;
  jobName?: string;
}

export function PmQueriesJobPanel({ jobId, jobName }: PmQueriesJobPanelProps) {
  const supabase = createClient();
  const [queries, setQueries] = useState<PmQueryRow[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [answeringId, setAnsweringId] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState("");

  const loadQueries = useCallback(async () => {
    const { data: rawQueries } = await supabase
      .from("tbl_pm_queries").select("*").eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (!rawQueries || rawQueries.length === 0) { setQueries([]); return; }
    const scopeIds = [...new Set(rawQueries.map(q => q.scope_item_id).filter(Boolean))];
    let scopeMap: Record<number, string> = {};
    if (scopeIds.length > 0) {
      const { data: scopes } = await supabase
        .from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds);
      (scopes || []).forEach((s: any) => { scopeMap[s.scope_item_id] = s.item_name; });
    }
    setQueries(rawQueries.map(q => ({
      ...q,
      scope_name: q.scope_item_id ? scopeMap[q.scope_item_id] || `Scope #${q.scope_item_id}` : "General",
    })));
  }, [jobId]);

  useEffect(() => { loadQueries(); }, [loadQueries]);

  const openQueries = queries.filter(q => q.status === "Open");
  const answeredQueries = queries.filter(q => q.status === "Answered");
  const openCount = openQueries.length;

  const answerQuery = async (queryId: number) => {
    if (!answerText.trim()) return;
    await supabase.from("tbl_pm_queries").update({
      answer: answerText.trim(), status: "Answered", answered_at: new Date().toISOString(),
    }).eq("query_id", queryId);
    setAnsweringId(null); setAnswerText("");
    loadQueries();
  };

  const copyAllOpen = () => {
    if (openQueries.length === 0) return;
    const byScope: Record<string, string[]> = {};
    for (const q of openQueries) {
      const key = q.scope_name || "General";
      if (!byScope[key]) byScope[key] = [];
      byScope[key].push(q.question);
    }
    const lines = Object.entries(byScope).map(([scope, questions]) =>
      `${scope}:\n${questions.map((q, i) => `  ${i + 1}. ${q}`).join("\n")}`
    ).join("\n\n");
    navigator.clipboard.writeText(`PM Queries — ${jobName || "Job"} (${openCount} open)\n\n${lines}`);
    toast.success(`${openCount} queries copied to clipboard`);
  };

  const shareWithPhotos = () => {
    if (openQueries.length === 0) return;
    const byScope: Record<string, PmQueryRow[]> = {};
    for (const q of openQueries) {
      const key = q.scope_name || "General";
      if (!byScope[key]) byScope[key] = [];
      byScope[key].push(q);
    }
    const sections = Object.entries(byScope).map(([scope, qs]) => {
      const items = qs.map((q, i) => {
        const photo = q.photo_url ? `<div style="margin:6px 0"><img src="${q.photo_url}" style="max-height:200px;border-radius:6px;border:1px solid #e5e7eb" /></div>` : "";
        return `<div style="margin-bottom:12px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px"><p style="margin:0;font-size:14px;color:#1e293b"><strong>${i + 1}.</strong> ${q.question}</p>${photo}</div>`;
      }).join("");
      return `<div style="margin-bottom:24px"><h2 style="font-size:15px;color:#334155;margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0">${scope}</h2>${items}</div>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PM Queries — ${jobName || "Job"}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#334155}h1{font-size:20px;color:#0f172a;margin-bottom:4px}@media print{body{margin:20px}}</style></head><body><h1>PM Queries — ${jobName || "Job"}</h1><p style="color:#94a3b8;font-size:13px;margin-bottom:24px">${openCount} open question${openCount !== 1 ? "s" : ""} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>${sections}</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  if (queries.length === 0) return null;

  return (
    <div className={"card overflow-hidden " + (openCount > 0 ? "border-l-4 border-l-starlight-amber" : "")}>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left">
        {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        <MessageCircleQuestion className="h-4 w-4 text-starlight-amber" />
        <span className="text-sm font-semibold text-navy">PM Queries</span>
        {openCount > 0 && (
          <span className="px-2 py-0.5 bg-starlight-amber/15 text-starlight-amber text-[10px] font-semibold rounded-full">{openCount} open</span>
        )}
        {answeredQueries.length > 0 && (
          <span className="px-2 py-0.5 bg-starlight-green/10 text-starlight-green text-[10px] font-semibold rounded-full">{answeredQueries.length} answered</span>
        )}
        <div className="flex-1" />
        {openCount > 0 && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={copyAllOpen}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-starlight-amber bg-starlight-amber/10 hover:bg-starlight-amber/20 rounded-lg transition-colors">
              <Copy className="h-3 w-3" /> Copy text
            </button>
            <button onClick={shareWithPhotos}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-starlight-blue bg-starlight-blue/10 hover:bg-starlight-blue/20 rounded-lg transition-colors">
              <ExternalLink className="h-3 w-3" /> Share with photos
            </button>
          </div>
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-2">
          {openQueries.map((q) => (
            <div key={q.query_id} className="px-3 py-2 bg-starlight-amber/5 border border-starlight-amber/20 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {q.scope_item_id && (
                      <Link href={`/jobs/${jobId}/scope/${q.scope_item_id}`}
                        className="text-[10px] font-medium text-starlight-blue hover:underline truncate max-w-[200px]">
                        {q.scope_name}
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-navy">{q.question}</p>
                  {q.photo_url && (
                    <div className="mt-1.5">
                      <img src={q.photo_url} alt="" className="max-h-28 rounded border border-gray-200" />
                    </div>
                  )}
                  {answeringId === q.query_id ? (
                    <div className="flex items-center gap-2 mt-1.5">
                      <input type="text" value={answerText} onChange={(e) => setAnswerText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") answerQuery(q.query_id); }}
                        placeholder="Type answer..."
                        className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-starlight-green"
                        autoFocus />
                      <button onClick={() => answerQuery(q.query_id)} className="p-1 text-starlight-green hover:bg-starlight-green/10 rounded"><Send className="h-3 w-3" /></button>
                      <button onClick={() => { setAnsweringId(null); setAnswerText(""); }} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><span className="text-xs">✕</span></button>
                    </div>
                  ) : (
                    <button onClick={() => { setAnsweringId(q.query_id); setAnswerText(""); }}
                      className="text-[10px] text-starlight-green hover:underline mt-1">Answer</button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {answeredQueries.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">
                {answeredQueries.length} answered
              </summary>
              <div className="mt-1 space-y-1">
                {answeredQueries.map((q) => (
                  <div key={q.query_id} className="px-3 py-1.5 bg-starlight-green/5 border border-starlight-green/20 rounded-lg text-xs">
                    <span className="text-gray-500">{q.scope_name}: </span>
                    <span className="text-navy">{q.question}</span>
                    {q.answer && <p className="text-starlight-green italic mt-0.5">↳ {q.answer}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
