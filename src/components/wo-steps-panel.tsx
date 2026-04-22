"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getAuditContext, auditedUpdate, auditedInsert, auditedDelete } from "@/lib/audit";
import {
  Plus, Trash2, AlertTriangle, ArrowUp, ArrowDown, ListChecks, Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface WOStep {
  step_id: number;
  work_order_id: number;
  seq: number;
  step_text: string;
  is_critical: boolean;
}

/**
 * WOStepsPanel — authoring UI for step-by-step instructions on a work order.
 *
 * Design principles:
 *  - Authoring feels like a bulleted list: Enter = save and add next step.
 *  - Empty state shows a single "Add step 1" prompt (zero friction).
 *  - Steps are read-only for freelancers; this panel is for PMs/admin.
 *  - is_critical flag renders the step in amber for high-importance items.
 *  - Reorder via up/down arrows (drag-and-drop deferred — arrows work fine on desktop and are print-safe).
 *
 * Supplements (does not replace) the WO description. Description = what + why;
 * Steps = how, in order.
 */
export function WOStepsPanel({
  workOrderId,
  jobId,
  readOnly = false,
}: {
  workOrderId: number;
  jobId: number | null;
  readOnly?: boolean;
}) {
  const supabase = createClient();
  const [steps, setSteps] = useState<WOStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const newInputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tbl_wo_steps")
      .select("*")
      .eq("work_order_id", workOrderId)
      .order("seq");
    setSteps((data || []) as WOStep[]);
    setLoading(false);
  }, [workOrderId, supabase]);

  useEffect(() => { load(); }, [load]);

  const focusNewInput = () => {
    setTimeout(() => newInputRef.current?.focus(), 50);
  };

  const beginAdd = () => {
    setAdding(true);
    setNewText("");
    focusNewInput();
  };

  const commitAdd = async (continueAdding: boolean) => {
    const text = newText.trim();
    if (!text) {
      setAdding(false);
      setNewText("");
      return;
    }
    const nextSeq = steps.length > 0 ? Math.max(...steps.map(s => s.seq)) + 1 : 1;
    const ctx = await getAuditContext(supabase);
    const { data, error } = await auditedInsert(ctx, "tbl_wo_steps", {
      work_order_id: workOrderId,
      seq: nextSeq,
      step_text: text,
      is_critical: false,
    }, jobId);
    if (error) {
      toast.error("Failed to add step");
      return;
    }
    if (data) setSteps(prev => [...prev, data as WOStep]);
    setNewText("");
    if (continueAdding) {
      focusNewInput();
    } else {
      setAdding(false);
    }
  };

  const updateStep = async (stepId: number, changes: Partial<WOStep>) => {
    const ctx = await getAuditContext(supabase);
    const { error } = await auditedUpdate(ctx, "tbl_wo_steps", stepId, changes, jobId);
    if (error) {
      toast.error("Save failed");
      return;
    }
    setSteps(prev => prev.map(s => s.step_id === stepId ? { ...s, ...changes } : s));
  };

  const deleteStep = async (stepId: number) => {
    const ctx = await getAuditContext(supabase);
    const { error } = await auditedDelete(ctx, "tbl_wo_steps", stepId, jobId);
    if (error) {
      toast.error("Delete failed");
      return;
    }
    // Re-sequence remaining steps so we stay 1..N contiguous
    const remaining = steps.filter(s => s.step_id !== stepId);
    const reseq = remaining.map((s, i) => ({ ...s, seq: i + 1 }));
    setSteps(reseq);
    // Persist new seq values (only for those whose seq actually changed)
    for (const s of reseq) {
      const prior = steps.find(p => p.step_id === s.step_id);
      if (prior && prior.seq !== s.seq) {
        await supabase.from("tbl_wo_steps").update({ seq: s.seq }).eq("step_id", s.step_id);
      }
    }
  };

  const move = async (stepId: number, direction: -1 | 1) => {
    const idx = steps.findIndex(s => s.step_id === stepId);
    if (idx === -1) return;
    const target = idx + direction;
    if (target < 0 || target >= steps.length) return;
    const a = steps[idx];
    const b = steps[target];
    // Swap seq
    const newSteps = [...steps];
    newSteps[idx] = { ...a, seq: b.seq };
    newSteps[target] = { ...b, seq: a.seq };
    newSteps.sort((x, y) => x.seq - y.seq);
    setSteps(newSteps);
    await Promise.all([
      supabase.from("tbl_wo_steps").update({ seq: b.seq }).eq("step_id", a.step_id),
      supabase.from("tbl_wo_steps").update({ seq: a.seq }).eq("step_id", b.step_id),
    ]);
  };

  // ────────────────────────────────────────────────────────────────
  // Read-only render (mobile, traveller, freelancer view)
  // ────────────────────────────────────────────────────────────────
  if (readOnly) {
    if (loading) return null;
    if (steps.length === 0) return null;
    return (
      <div>
        <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
          <ListChecks className="h-3 w-3" /> Steps
        </p>
        <ol className="space-y-1.5">
          {steps.map((s) => (
            <li
              key={s.step_id}
              className={
                "flex gap-2 px-3 py-2 rounded leading-snug break-words whitespace-pre-wrap text-[13px] " +
                (s.is_critical
                  ? "bg-starlight-amber/10 border border-starlight-amber/20 text-foreground"
                  : "bg-surface-dim text-foreground")
              }
            >
              <span className={"font-bold shrink-0 " + (s.is_critical ? "text-starlight-amber" : "text-muted")}>
                {s.is_critical && <AlertTriangle className="h-3.5 w-3.5 inline mr-0.5 -mt-0.5" />}
                {s.seq}.
              </span>
              <span className="flex-1">{s.step_text}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // Authoring render (scope page, PM/admin)
  // ────────────────────────────────────────────────────────────────
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
        <ListChecks className="h-3 w-3" /> Steps
        {steps.length > 0 && <span className="ml-1 text-faint normal-case font-normal tracking-normal">({steps.length})</span>}
      </label>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted py-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading...
        </div>
      )}

      {!loading && steps.length === 0 && !adding && (
        <button
          onClick={beginAdd}
          className="w-full text-left px-3 py-2 text-xs text-muted hover:text-navy border border-dashed border-subtle hover:border-starlight-blue rounded transition-colors"
        >
          <Plus className="h-3 w-3 inline mr-1" /> Add step 1 — break the WO into ordered instructions
        </button>
      )}

      {!loading && steps.length > 0 && (
        <ol className="space-y-1.5">
          {steps.map((s, idx) => (
            <StepRow
              key={s.step_id}
              step={s}
              isFirst={idx === 0}
              isLast={idx === steps.length - 1}
              onUpdate={(changes) => updateStep(s.step_id, changes)}
              onDelete={() => deleteStep(s.step_id)}
              onMove={(dir) => move(s.step_id, dir)}
            />
          ))}
        </ol>
      )}

      {/* New-step input */}
      {adding && (
        <div className="mt-1.5 flex items-start gap-1.5 px-2 py-1.5 rounded bg-surface border border-starlight-blue/40">
          <span className="text-muted text-xs font-bold w-5 shrink-0 pt-1">{steps.length + 1}.</span>
          <textarea
            ref={newInputRef}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitAdd(true); // Enter = save + add next
              } else if (e.key === "Escape") {
                setAdding(false);
                setNewText("");
              }
            }}
            onBlur={() => commitAdd(false)} // Click away = save + stop
            rows={1}
            className="flex-1 px-1.5 py-1 text-xs bg-transparent border-0 focus:outline-none resize-y min-h-[24px]"
            placeholder="Type the step, Enter to save & add next, Esc to cancel"
          />
        </div>
      )}

      {!loading && steps.length > 0 && !adding && (
        <button
          onClick={beginAdd}
          className="mt-1.5 w-full text-left px-2 py-1.5 text-xs text-muted hover:text-navy border border-dashed border-subtle hover:border-starlight-blue rounded transition-colors"
        >
          <Plus className="h-3 w-3 inline mr-1" /> Add step {steps.length + 1}
        </button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// StepRow — single editable row
// ────────────────────────────────────────────────────────────────
function StepRow({
  step, isFirst, isLast, onUpdate, onDelete, onMove,
}: {
  step: WOStep;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (changes: Partial<WOStep>) => Promise<void>;
  onDelete: () => Promise<void>;
  onMove: (dir: -1 | 1) => Promise<void>;
}) {
  const [text, setText] = useState(step.step_text);

  // Keep local text in sync if parent reorders
  useEffect(() => { setText(step.step_text); }, [step.step_text]);

  const commitText = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      // Empty text on blur — treat as delete request
      if (confirm("Delete this step?")) {
        onDelete();
      } else {
        setText(step.step_text);
      }
      return;
    }
    if (trimmed !== step.step_text) {
      onUpdate({ step_text: trimmed });
    }
  };

  return (
    <li
      className={
        "flex items-start gap-1.5 px-2 py-1.5 rounded group transition-colors " +
        (step.is_critical
          ? "bg-starlight-amber/10 border border-starlight-amber/30"
          : "bg-surface border border-subtle hover:border-starlight-blue/40")
      }
    >
      <span className={"text-xs font-bold w-5 shrink-0 pt-1 text-right " + (step.is_critical ? "text-starlight-amber" : "text-muted")}>
        {step.seq}.
      </span>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        rows={1}
        className="flex-1 px-1.5 py-1 text-xs bg-transparent border-0 focus:outline-none resize-y min-h-[24px] break-words"
      />

      <div className="flex items-center gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        {/* Critical toggle */}
        <button
          onClick={() => onUpdate({ is_critical: !step.is_critical })}
          className={
            "p-1 rounded transition-colors " +
            (step.is_critical
              ? "text-starlight-amber bg-starlight-amber/20"
              : "text-faint hover:text-starlight-amber hover:bg-starlight-amber/10")
          }
          title={step.is_critical ? "Unmark as critical" : "Mark as critical (shown in amber with ⚠)"}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove(-1)}
          disabled={isFirst}
          className="p-1 rounded text-muted hover:text-navy hover:bg-surface-mid disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Move up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={isLast}
          className="p-1 rounded text-muted hover:text-navy hover:bg-surface-mid disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Move down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => { if (confirm("Delete this step?")) onDelete(); }}
          className="p-1 rounded text-faint hover:text-starlight-red hover:bg-starlight-red/10 transition-colors"
          title="Delete step"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
