"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { MessageCircleQuestion, Send, Check, X, ChevronDown, ChevronRight } from "lucide-react";

interface PmQuery {
  query_id: number;
  question: string;
  answer: string | null;
  status: string;
  created_at: string;
  scope_item_id: number | null;
}

interface PmQueriesPanelProps {
  scopeItemId: number;
  jobId: number;
  scopeName?: string;
}

export function PmQueriesPanel({ scopeItemId, jobId, scopeName }: PmQueriesPanelProps) {
  const supabase = createClient();
  const [queries, setQueries] = useState<PmQuery[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const loadQueries = useCallback(async () => {
    const { data } = await supabase
      .from("tbl_pm_queries")
      .select("*")
      .eq("scope_item_id", scopeItemId)
      .order("created_at", { ascending: true });
    if (data) setQueries(data);
  }, [scopeItemId]);

  useEffect(() => { loadQueries(); }, [loadQueries]);

  const addQuery = async () => {
    const q = newQuestion.trim();
    if (!q) return;
    setSaving(true);
    await supabase.from("tbl_pm_queries").insert({
      job_id: jobId,
      scope_item_id: scopeItemId,
      question: q,
      status: "Open",
    });
    setNewQuestion("");
    setSaving(false);
    loadQueries();
  };

  const dismiss = async (id: number) => {
    await supabase.from("tbl_pm_queries").update({ status: "Dismissed" }).eq("query_id", id);
    loadQueries();
  };

  const openCount = queries.filter(q => q.status === "Open").length;

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-navy transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <MessageCircleQuestion className="h-3.5 w-3.5" />
        <span className="font-medium">PM Queries</span>
        {openCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-starlight-amber/15 text-starlight-amber text-[9px] font-semibold rounded-full">
            {openCount}
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {/* Existing queries */}
          {queries.map((q) => (
            <div key={q.query_id} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
              q.status === "Open" ? "bg-starlight-amber/5 border border-starlight-amber/20" :
              q.status === "Answered" ? "bg-starlight-green/5 border border-starlight-green/20" :
              "bg-gray-50 border border-gray-100 opacity-50"
            }`}>
              <div className="flex-1 min-w-0">
                <p className={`text-navy ${q.status === "Dismissed" ? "line-through text-gray-400" : ""}`}>
                  {q.question}
                </p>
                {q.answer && (
                  <p className="text-starlight-green mt-1 italic">↳ {q.answer}</p>
                )}
              </div>
              {q.status === "Open" && (
                <button onClick={() => dismiss(q.query_id)}
                  className="p-0.5 text-gray-300 hover:text-gray-500 shrink-0" title="Dismiss">
                  <X className="h-3 w-3" />
                </button>
              )}
              {q.status === "Answered" && (
                <Check className="h-3 w-3 text-starlight-green shrink-0 mt-0.5" />
              )}
            </div>
          ))}

          {/* Add new query */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addQuery(); } }}
              placeholder="Ask PM a question about this scope item..."
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-starlight-amber placeholder:text-gray-300"
            />
            <button onClick={addQuery} disabled={!newQuestion.trim() || saving}
              className="p-1.5 text-starlight-amber hover:bg-starlight-amber/10 rounded-lg transition-colors disabled:opacity-30">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
