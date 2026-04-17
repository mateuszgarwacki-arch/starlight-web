"use client";

import { useEffect, useState } from "react";
import { X, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase-browser";
import {
  LEARNING_CATEGORIES,
  CATEGORY_MAP,
  LearningCategory,
  LearningEntityContext,
  contextToInsertFields,
} from "@/lib/learnings";

interface LearningCaptureProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  context: LearningEntityContext;
}

export function LearningCapture({ open, onClose, onSaved, context }: LearningCaptureProps) {
  const supabase = createClient();

  const [category, setCategory] = useState<LearningCategory | null>(null);
  const [subType, setSubType] = useState<string>("");
  const [severity, setSeverity] = useState<number>(3);
  const [costImpact, setCostImpact] = useState<string>("");
  const [hoursImpact, setHoursImpact] = useState<string>("");
  const [actionable, setActionable] = useState<boolean>(false);
  const [headline, setHeadline] = useState<string>("");
  const [detail, setDetail] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory(null);
      setSubType("");
      setSeverity(3);
      setCostImpact("");
      setHoursImpact("");
      setActionable(false);
      setHeadline("");
      setDetail("");
    }
  }, [open]);

  if (!open) return null;

  const catDef = category ? CATEGORY_MAP[category] : null;
  const severityLabel = catDef?.bias === "positive" ? "Value" : "Severity";
  const canSave = !!category && headline.trim().length >= 3 && headline.trim().length <= 200 && !saving;

  const handleSave = async () => {
    if (!canSave || !category) return;
    setSaving(true);
    try {
      const entityFields = contextToInsertFields(context);
      if (Object.keys(entityFields).length === 0) {
        toast.error("No entity attached — cannot save learning");
        setSaving(false);
        return;
      }
      const payload = {
        category,
        sub_type: subType || null,
        severity,
        cost_impact_gbp: costImpact.trim() ? parseFloat(costImpact) : null,
        hours_impact: hoursImpact.trim() ? parseFloat(hoursImpact) : null,
        actionable,
        headline: headline.trim(),
        detail: detail.trim() || null,
        embedding_status: "pending" as const,
        ...entityFields,
      };
      const { data: { user } } = await supabase.auth.getUser();
      const fullPayload = user?.id ? { ...payload, created_by: user.id } : payload;
      const { error } = await supabase.from("tbl_learnings").insert(fullPayload);
      if (error) {
        toast.error(`Failed to save: ${error.message}`);
        setSaving(false);
        return;
      }
      toast.success("Learning captured");
      // Trigger embedding BEFORE closing the sheet so the request isn't
      // cancelled by the unmount. Surface errors via toast so we can diagnose.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const r = await fetch("/api/learnings/embed", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const body = await r.json().catch(() => ({}));
          if (!r.ok) {
            toast.error(`Embed failed (${r.status}): ${JSON.stringify(body).slice(0, 120)}`);
          } else if (body.processed) {
            toast.success(`Embedded ${body.processed} learning${body.processed > 1 ? "s" : ""}`);
          } else if (body.disabled) {
            toast.message(`Embeddings disabled: ${body.note || ""}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          toast.error(`Embed call error: ${msg}`);
        }
      } else {
        toast.message("No session token — embed skipped");
      }
      onSaved?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Save error: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-2xl bg-surface-mid border-t sm:border border-surface-hi sm:rounded-lg shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-surface-hi">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Capture learning</h2>
            <p className="text-sm text-muted truncate">{context.contextLabel}</p>
            {context.contextSublabel && (
              <p className="text-xs text-faint truncate">{context.contextSublabel}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-surface-hi text-muted hover:text-foreground" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <section>
            <label className="block text-xs uppercase tracking-wide text-faint mb-2">
              What kind of learning? <span className="text-rose-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {LEARNING_CATEGORIES.map((c) => {
                const active = category === c.id;
                return (
                  <button key={c.id} type="button"
                    onClick={() => { setCategory(c.id); setSubType(""); }}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      active ? c.colour + " ring-2 ring-offset-0" : "bg-surface-hi text-muted border-surface-top hover:text-foreground"
                    }`}>
                    {c.label}
                  </button>
                );
              })}
            </div>
            {catDef && <p className="mt-2 text-xs text-muted">{catDef.description}</p>}
          </section>

          {catDef && (
            <section>
              <label className="block text-xs uppercase tracking-wide text-faint mb-2">{catDef.subFieldLabel}</label>
              <div className="flex flex-wrap gap-2">
                {catDef.subOptions.map((o) => {
                  const active = subType === o.value;
                  return (
                    <button key={o.value} type="button"
                      onClick={() => setSubType(active ? "" : o.value)}
                      className={`px-3 py-1 rounded text-xs border ${
                        active ? "bg-foreground text-base border-foreground" : "bg-surface-hi text-muted border-surface-top hover:text-foreground"
                      }`}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-faint mb-2">{severityLabel}</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setSeverity(n)}
                    className={`w-8 h-8 rounded text-sm font-medium border ${
                      severity >= n
                        ? catDef?.bias === "positive" ? "bg-emerald-500/30 border-emerald-500 text-emerald-200"
                          : severity >= 4 ? "bg-rose-500/30 border-rose-500 text-rose-200"
                          : severity === 3 ? "bg-amber-500/30 border-amber-500 text-amber-200"
                          : "bg-blue-500/30 border-blue-500 text-blue-200"
                        : "bg-surface-hi border-surface-top text-faint"
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-faint mb-2">Cost impact (£)</label>
              <input type="number" inputMode="decimal" step="0.01" placeholder="optional"
                value={costImpact} onChange={(e) => setCostImpact(e.target.value)}
                className="w-full px-3 py-2 bg-surface-hi border border-surface-top rounded text-foreground placeholder:text-faint" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-faint mb-2">Hours impact</label>
              <input type="number" inputMode="decimal" step="0.25" placeholder="optional"
                value={hoursImpact} onChange={(e) => setHoursImpact(e.target.value)}
                className="w-full px-3 py-2 bg-surface-hi border border-surface-top rounded text-foreground placeholder:text-faint" />
            </div>
          </section>

          <section>
            <label className="block text-xs uppercase tracking-wide text-faint mb-2">
              Headline <span className="text-rose-400">*</span>
              <span className="text-faint normal-case tracking-normal ml-2">{headline.length}/200</span>
            </label>
            <input type="text" maxLength={200} placeholder="One-line summary of the lesson"
              value={headline} onChange={(e) => setHeadline(e.target.value)} autoFocus
              className="w-full px-3 py-2 bg-surface-hi border border-surface-top rounded text-foreground placeholder:text-faint" />
          </section>

          <section>
            <label className="block text-xs uppercase tracking-wide text-faint mb-2">Detail (optional)</label>
            <textarea rows={4} placeholder="What actually happened. What we'd do differently. Any context that matters."
              value={detail} onChange={(e) => setDetail(e.target.value)}
              className="w-full px-3 py-2 bg-surface-hi border border-surface-top rounded text-foreground placeholder:text-faint resize-y" />
          </section>

          <section>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={actionable} onChange={(e) => setActionable(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-amber-500" />
              <div>
                <div className="text-sm text-foreground flex items-center gap-2">
                  <AlertCircle size={14} className="text-amber-400" />
                  Actionable — needs follow-up
                </div>
                <div className="text-xs text-faint">
                  Flagged in the review inbox until resolved. Leave unchecked for pure historical records.
                </div>
              </div>
            </label>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-surface-hi">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm text-muted hover:text-foreground rounded">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!canSave}
            className="px-4 py-2 text-sm bg-foreground text-base rounded font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save learning
          </button>
        </div>
      </div>
    </div>
  );
}
