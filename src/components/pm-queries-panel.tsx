"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { MessageCircleQuestion, Send, Check, X, ChevronDown, ChevronRight, Pencil, Camera, Trash2 } from "lucide-react";

interface PmQuery {
  query_id: number;
  question: string;
  answer: string | null;
  status: string;
  created_at: string;
  scope_item_id: number | null;
  photo_url: string | null;
}

interface PmQueriesPanelProps {
  scopeItemId: number;
  jobId: number;
}

function resizeImage(file: File, maxPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function PmQueriesPanel({ scopeItemId, jobId }: PmQueriesPanelProps) {
  const supabase = createClient();
  const [queries, setQueries] = useState<PmQuery[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoTarget, setPhotoTarget] = useState<number | null>(null); // query_id to attach photo to
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null); // for new query

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
      job_id: jobId, scope_item_id: scopeItemId,
      question: q, status: "Open",
      photo_url: pendingPhoto || null,
    });
    setNewQuestion(""); setPendingPhoto(null);
    setSaving(false);
    loadQueries();
  };

  const updateQuestion = async (id: number) => {
    const q = editText.trim();
    if (!q) return;
    await supabase.from("tbl_pm_queries").update({ question: q }).eq("query_id", id);
    setEditingId(null); setEditText("");
    loadQueries();
  };

  const dismiss = async (id: number) => {
    await supabase.from("tbl_pm_queries").update({ status: "Dismissed" }).eq("query_id", id);
    loadQueries();
  };

  const deleteQuery = async (id: number) => {
    await supabase.from("tbl_pm_queries").delete().eq("query_id", id);
    loadQueries();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImage(file, 800);
    if (photoTarget) {
      await supabase.from("tbl_pm_queries").update({ photo_url: dataUrl }).eq("query_id", photoTarget);
      setPhotoTarget(null);
      loadQueries();
    } else {
      setPendingPhoto(dataUrl);
    }
    e.target.value = "";
  };

  const removePhoto = async (id: number) => {
    await supabase.from("tbl_pm_queries").update({ photo_url: null }).eq("query_id", id);
    loadQueries();
  };

  const openCount = queries.filter(q => q.status === "Open").length;

  return (
    <div className="mt-3">
      <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={handleFileChange} />
      <button onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-navy transition-colors">
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
          {queries.map((q) => (
            <div key={q.query_id} className={`px-3 py-2 rounded-lg text-xs ${
              q.status === "Open" ? "bg-starlight-amber/5 border border-starlight-amber/20" :
              q.status === "Answered" ? "bg-starlight-green/5 border border-starlight-green/20" :
              "bg-surface-dim border border-subtle opacity-50"
            }`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {editingId === q.query_id ? (
                    <div className="flex items-center gap-1">
                      <input type="text" value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") updateQuestion(q.query_id); if (e.key === "Escape") setEditingId(null); }}
                        className="flex-1 px-2 py-0.5 border border-starlight-amber/30 rounded text-xs focus:outline-none focus:ring-1 focus:ring-starlight-amber"
                        autoFocus />
                      <button onClick={() => updateQuestion(q.query_id)} className="p-0.5 text-starlight-green"><Check className="h-3 w-3" /></button>
                      <button onClick={() => setEditingId(null)} className="p-0.5 text-muted"><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <p className={`text-navy cursor-pointer hover:text-starlight-blue ${q.status === "Dismissed" ? "line-through text-muted" : ""}`}
                      onClick={() => { setEditingId(q.query_id); setEditText(q.question); }}>
                      {q.question}
                    </p>
                  )}
                  {q.answer && <p className="text-starlight-green mt-1 italic">↳ {q.answer}</p>}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {q.status === "Open" && (
                    <>
                      <button onClick={() => { setEditingId(q.query_id); setEditText(q.question); }}
                        className="p-0.5 text-faint hover:text-starlight-blue" title="Edit"><Pencil className="h-2.5 w-2.5" /></button>
                      <button onClick={() => { setPhotoTarget(q.query_id); fileRef.current?.click(); }}
                        className="p-0.5 text-faint hover:text-starlight-blue" title="Add photo"><Camera className="h-2.5 w-2.5" /></button>
                      <button onClick={() => dismiss(q.query_id)}
                        className="p-0.5 text-faint hover:text-muted" title="Dismiss"><X className="h-2.5 w-2.5" /></button>
                      <button onClick={() => deleteQuery(q.query_id)}
                        className="p-0.5 text-faint hover:text-starlight-red" title="Delete"><Trash2 className="h-2.5 w-2.5" /></button>
                    </>
                  )}
                  {q.status === "Answered" && <Check className="h-3 w-3 text-starlight-green" />}
                </div>
              </div>
              {q.photo_url && (
                <div className="mt-1.5 relative group">
                  <img src={q.photo_url} alt="" className="max-h-32 rounded border border-subtle" />
                  {q.status === "Open" && (
                    <button onClick={() => removePhoto(q.query_id)}
                      className="absolute top-1 right-1 p-0.5 bg-surface/80 rounded text-muted hover:text-starlight-red opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* New query input */}
          {pendingPhoto && (
            <div className="relative inline-block">
              <img src={pendingPhoto} alt="" className="max-h-20 rounded border border-starlight-amber/30" />
              <button onClick={() => setPendingPhoto(null)}
                className="absolute -top-1 -right-1 p-0.5 bg-surface rounded-full shadow text-muted hover:text-starlight-red">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="text" value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addQuery(); } }}
              placeholder="Ask PM a question about this scope item..."
              className="flex-1 px-3 py-1.5 border border-subtle rounded-lg text-xs bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-amber placeholder:text-faint" />
            <button onClick={() => { setPhotoTarget(null); fileRef.current?.click(); }}
              className="p-1.5 text-faint hover:text-starlight-amber hover:bg-starlight-amber/10 rounded-lg transition-colors" title="Attach photo">
              <Camera className="h-3.5 w-3.5" />
            </button>
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
