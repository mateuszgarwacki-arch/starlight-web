"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase-browser";

/**
 * PM note — a single inline note per quote line, stored as a learning with
 * category='pm_note' and actionable=false. Upsert behaviour: if the line
 * already has a pm_note learning, edits update it in place; if not, a new one
 * is created on first save. Reading the latest pm_note for a line happens
 * inside rpc_pm_job_overview (pm_note_inline_text).
 */
export function PmNoteInline({
  jobId,
  quoteLineId,
  initialId,
  initialText,
  compact = false,
  onSaved,
}: {
  jobId: number;
  quoteLineId: number;
  initialId?: string | null;
  initialText?: string | null;
  /** Collapsed view: single line + edit pencil. Used inside quote line row header. */
  compact?: boolean;
  onSaved?: (newText: string | null, newId: string | null) => void;
}) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialText ?? "");
  const [saving, setSaving] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(initialId ?? null);
  const [currentText, setCurrentText] = useState<string | null>(initialText ?? null);

  useEffect(() => {
    setValue(initialText ?? "");
    setNoteId(initialId ?? null);
    setCurrentText(initialText ?? null);
  }, [initialId, initialText]);

  const save = async () => {
    const text = value.trim();
    if (text === (currentText ?? "").trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      if (text.length === 0 && noteId) {
        const { error } = await supabase.from("tbl_learnings").delete().eq("learning_id", noteId);
        if (error) throw error;
        setNoteId(null);
        setCurrentText(null);
        onSaved?.(null, null);
      } else if (text.length > 0 && noteId) {
        const { error } = await supabase
          .from("tbl_learnings")
          .update({ headline: text, updated_at: new Date().toISOString() })
          .eq("learning_id", noteId);
        if (error) throw error;
        setCurrentText(text);
        onSaved?.(text, noteId);
      } else if (text.length > 0 && !noteId) {
        const { data: userData } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("tbl_learnings")
          .insert({
            category: "pm_note",
            actionable: false,
            severity: 1,
            headline: text,
            job_id: jobId,
            quote_line_id: quoteLineId,
            created_by: userData.user?.id ?? null,
          })
          .select("learning_id")
          .single();
        if (error) throw error;
        setNoteId(data.learning_id);
        setCurrentText(text);
        onSaved?.(text, data.learning_id);
      }
      setEditing(false);
    } catch (e: any) {
      toast.error(`PM note: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setValue(currentText ?? "");
    setEditing(false);
  };

  // --- COMPACT (in-row) rendering ---
  if (compact && !editing) {
    const placeholder = !currentText;
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className={
          "group inline-flex items-start gap-1.5 text-left text-xs px-2 py-1 rounded border border-dashed border-subtle hover:border-starlight-blue/50 hover:bg-starlight-blue/5 transition-colors w-full"
        }
        title="PM note — click to edit"
      >
        <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-starlight-blue" />
        <span className={"min-w-0 flex-1 " + (placeholder ? "italic text-faint" : "text-navy")}>
          {currentText || "+ Add PM note"}
        </span>
        <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 text-muted" />
      </button>
    );
  }

  // --- EDIT / FULL-WIDTH rendering ---
  return (
    <div
      className="rounded border border-starlight-blue/40 bg-starlight-blue/5 p-2 space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-starlight-blue">
        <MessageSquare className="h-3 w-3" />
        <span className="font-medium">PM note</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        placeholder="e.g. Temple scaffolding subject to site survey — hold timber ordering until 20 May."
        className="w-full min-h-[60px] text-sm border border-subtle rounded px-2 py-1.5 bg-surface text-navy focus:outline-none focus:ring-1 focus:ring-starlight-blue"
        autoFocus={editing}
      />
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-starlight-blue text-white hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3 w-3" /> Save
        </button>
        <button
          onClick={cancel}
          disabled={saving}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-subtle text-muted hover:text-navy"
        >
          <X className="h-3 w-3" /> Cancel
        </button>
        <span className="ml-auto">⌘/Ctrl + Enter to save · Esc to cancel</span>
      </div>
    </div>
  );
}
