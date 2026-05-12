"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import { CheckCircle2, Undo2, ChevronRight, ChevronDown, ClipboardCheck, X } from "lucide-react";
import { toast } from "sonner";
import { notify } from "@/lib/notifications";

interface PendingProposal {
  proposal_id: number;
  work_order_id: number;
  freelancer_id: number;
  freelancer_name: string;
  completion_photo_path: string | null;
  proposed_note: string | null;
  created_at: string;
  wo_description: string | null;
  scope_name: string;
  job_id: number | null;
  job_number: string;
  job_name: string;
  photo_url: string | null;
}

export function ConfirmCompletionsPanel() {
  const supabase = createClient();
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [undoTarget, setUndoTarget] = useState<PendingProposal | null>(null);
  const [undoNote, setUndoNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);

    const { data: rawProps, error } = await supabase
      .from("tbl_wo_completion_proposals")
      .select("proposal_id, work_order_id, freelancer_id, completion_photo_path, proposed_note, created_at")
      .eq("status", "awaiting_confirmation")
      .order("created_at", { ascending: false });

    if (error || !rawProps || rawProps.length === 0) {
      setProposals([]);
      setLoading(false);
      return;
    }

    // Enrichment: freelancers, WOs, scopes, jobs
    const fIds = [...new Set(rawProps.map(p => p.freelancer_id))];
    const woIds = [...new Set(rawProps.map(p => p.work_order_id))];

    const [frsRes, woRes] = await Promise.all([
      supabase.from("tbl_freelancers").select("freelancer_id, freelancer_name").in("freelancer_id", fIds),
      supabase.from("tbl_work_orders").select("work_order_id, description, scope_item_id, job_id").in("work_order_id", woIds),
    ]);

    const fMap: Record<number, string> = {};
    (frsRes.data || []).forEach((f: any) => { fMap[f.freelancer_id] = f.freelancer_name; });

    const woMap: Record<number, any> = {};
    (woRes.data || []).forEach((w: any) => { woMap[w.work_order_id] = w; });

    const scopeIds = [...new Set((woRes.data || []).map((w: any) => w.scope_item_id).filter(Boolean))];
    const jobIds = [...new Set((woRes.data || []).map((w: any) => w.job_id).filter(Boolean))];

    const [scopeRes, jobRes] = await Promise.all([
      scopeIds.length > 0
        ? supabase.from("tbl_scope_items").select("scope_item_id, item_name").in("scope_item_id", scopeIds)
        : Promise.resolve({ data: [] }),
      jobIds.length > 0
        ? supabase.from("tbl_production_plan").select("job_id, job_number, job_name").in("job_id", jobIds)
        : Promise.resolve({ data: [] }),
    ]);

    const sMap: Record<number, string> = {};
    (scopeRes.data || []).forEach((s: any) => { sMap[s.scope_item_id] = s.item_name; });
    const jMap: Record<number, { number: string; name: string }> = {};
    (jobRes.data || []).forEach((j: any) => { jMap[j.job_id] = { number: j.job_number, name: j.job_name }; });

    // Resolve OneDrive URLs in parallel
    const enriched = await Promise.all(rawProps.map(async (p: any) => {
      const wo = woMap[p.work_order_id] || {};
      const job = wo.job_id ? jMap[wo.job_id] : null;
      let photoUrl: string | null = null;
      if (p.completion_photo_path) {
        try { photoUrl = await getOneDriveUrl(p.completion_photo_path); } catch { /* ignore */ }
      }
      return {
        proposal_id: p.proposal_id,
        work_order_id: p.work_order_id,
        freelancer_id: p.freelancer_id,
        freelancer_name: fMap[p.freelancer_id] || "Unknown",
        completion_photo_path: p.completion_photo_path,
        proposed_note: p.proposed_note,
        created_at: p.created_at,
        wo_description: wo.description || null,
        scope_name: wo.scope_item_id ? (sMap[wo.scope_item_id] || "—") : "—",
        job_id: wo.job_id || null,
        job_number: job?.number || "—",
        job_name: job?.name || "—",
        photo_url: photoUrl,
      };
    }));

    setProposals(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConfirm = async (p: PendingProposal) => {
    setActing(p.proposal_id);
    const { error } = await supabase.rpc("rpc_confirm_wo_completion", {
      p_proposal_id: p.proposal_id,
      p_review_note: null,
    });
    if (error) {
      toast.error("Confirm failed: " + error.message);
      setActing(null);
      return;
    }
    toast.success(`Confirmed — "${p.wo_description || "WO"}" is locked complete`);
    setActing(null);
    await load();
  };

  const handleUndo = async () => {
    if (!undoTarget) return;
    setActing(undoTarget.proposal_id);
    const { error } = await supabase.rpc("rpc_undo_wo_completion", {
      p_proposal_id: undoTarget.proposal_id,
      p_review_note: undoNote.trim() || null,
    });
    if (error) {
      toast.error("Undo failed: " + error.message);
      setActing(null);
      return;
    }
    // Notify the freelancer
    await notify({
      supabase,
      type: "wo_completion_undone",
      severity: "warning",
      title: `Your "${undoTarget.wo_description || "WO"}" completion was undone`,
      detail: undoNote.trim() || "PM needs another look",
      freelancerId: undoTarget.freelancer_id,
      jobId: undoTarget.job_id || undefined,
      woId: undoTarget.work_order_id,
      actionUrl: `/m/wo/${undoTarget.work_order_id}`,
    });
    toast.success("Undone — freelancer notified");
    setUndoTarget(null);
    setUndoNote("");
    setActing(null);
    await load();
  };

  if (loading) return null;
  if (proposals.length === 0) return null;

  return (
    <>
      <div className="card overflow-hidden border-l-4 border-l-starlight-green">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full px-5 py-3 flex items-center gap-3 hover:bg-surface-dim/50 transition-colors text-left"
        >
          {expanded ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
          <ClipboardCheck className="h-4 w-4 text-starlight-green" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-navy">Confirm completions</p>
            <p className="text-[10px] text-muted">
              {proposals.length} work order{proposals.length === 1 ? "" : "s"} marked complete by freelancers — quick sanity check
            </p>
          </div>
          <span className="text-xs font-mono text-starlight-green bg-starlight-green/10 px-2 py-0.5 rounded-full">
            {proposals.length}
          </span>
        </button>

        {expanded && (
          <div className="border-t border-subtle divide-y divide-subtle">
            {proposals.map(p => (
              <div key={p.proposal_id} className="px-5 py-3 flex gap-4 items-start">
                {/* Photo thumbnail */}
                {p.photo_url ? (
                  <a href={p.photo_url} target="_blank" rel="noreferrer" className="shrink-0">
                    <img
                      src={p.photo_url}
                      alt="Completion"
                      className="w-20 h-20 object-cover rounded-lg border border-subtle hover:border-starlight-blue transition-colors"
                    />
                  </a>
                ) : (
                  <div className="w-20 h-20 rounded-lg border border-dashed border-subtle bg-surface-mid flex items-center justify-center text-[10px] text-faint">
                    No photo
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-navy">{p.wo_description || "Work order"}</p>
                    <span className="text-[10px] font-mono text-muted bg-surface-mid px-1.5 py-0.5 rounded">{p.job_number}</span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {p.scope_name} · {p.job_name}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    Marked by <span className="font-medium text-navy">{p.freelancer_name}</span>
                    {" · "}
                    {new Date(p.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {p.proposed_note && (
                    <p className="text-sm text-foreground mt-2 italic bg-surface-mid/50 rounded px-2 py-1">"{p.proposed_note}"</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => handleConfirm(p)}
                    disabled={acting === p.proposal_id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-starlight-green text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirm
                  </button>
                  <button
                    onClick={() => { setUndoTarget(p); setUndoNote(""); }}
                    disabled={acting === p.proposal_id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted border border-subtle rounded-lg hover:bg-surface-mid disabled:opacity-50 transition-colors"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Undo modal */}
      {undoTarget && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-navy">Undo completion</h2>
                <p className="text-xs text-muted mt-1">
                  WO reverts to <span className="font-mono">{undoTarget.wo_description || "WO"}</span>'s previous status. Freelancer is notified.
                </p>
              </div>
              <button
                onClick={() => { setUndoTarget(null); setUndoNote(""); }}
                className="text-muted hover:text-navy"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={undoNote}
              onChange={(e) => setUndoNote(e.target.value)}
              placeholder="Optional reason for the freelancer (e.g. paint touch-up missed, photo unclear)…"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-surface-mid border border-subtle rounded-lg resize-none placeholder:text-muted focus:outline-none focus:border-starlight-blue"
              autoFocus
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setUndoTarget(null); setUndoNote(""); }}
                className="px-4 py-2 text-sm text-muted hover:bg-surface-mid rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUndo}
                disabled={acting !== null}
                className="px-4 py-2 text-sm font-medium bg-starlight-red text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {acting !== null ? "Undoing…" : "Undo completion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
