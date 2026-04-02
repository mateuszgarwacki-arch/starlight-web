"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// ============================================================
// ConflictDialog — shown when optimistic concurrency detects
// that someone else modified a record while you were editing.
// ============================================================

export interface ConflictInfo {
  /** Human-readable field name */
  fieldLabel: string;
  /** What you tried to save */
  yourValue: string;
  /** What's currently in the DB (the other person's value) */
  currentValue: string;
  /** Who last changed it (from audit trail or presence) */
  changedBy?: string;
  /** When it was changed */
  changedAt?: string;
}

interface Props {
  open: boolean;
  conflict: ConflictInfo;
  /** User chose to overwrite with their value */
  onUseMine: () => void;
  /** User chose to accept the other person's value */
  onUseTheirs: () => void;
  /** User cancelled — discard their change */
  onCancel: () => void;
}

export function ConflictDialog({ open, conflict, onUseMine, onUseTheirs, onCancel }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-starlight-amber/10 border-b border-starlight-amber/20 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-starlight-amber/20 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-starlight-amber" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Edit conflict</h3>
            <p className="text-xs text-muted">
              {conflict.changedBy
                ? `${conflict.changedBy} modified this ${conflict.changedAt ? `at ${conflict.changedAt}` : "just now"}`
                : "Someone else modified this while you were editing"}
            </p>
          </div>
        </div>

        {/* Values comparison */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-muted">
            <span className="font-medium">{conflict.fieldLabel}</span> was changed:
          </p>

          {/* Their value */}
          <div className="rounded-lg border border-navy/20 bg-navy/10/50 p-3">
            <p className="text-[10px] font-medium text-navy uppercase tracking-wide mb-1">
              Current value {conflict.changedBy ? `(${conflict.changedBy})` : "(other user)"}
            </p>
            <p className="text-sm text-foreground font-mono">
              {conflict.currentValue || <span className="text-muted italic">empty</span>}
            </p>
          </div>

          {/* Your value */}
          <div className="rounded-lg border border-starlight-amber/20 bg-starlight-amber/10/50 p-3">
            <p className="text-[10px] font-medium text-starlight-amber uppercase tracking-wide mb-1">
              Your value
            </p>
            <p className="text-sm text-foreground font-mono">
              {conflict.yourValue || <span className="text-muted italic">empty</span>}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-subtle flex gap-2">
          <button
            onClick={onUseTheirs}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-subtle text-muted hover:bg-surface-dim transition-colors flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Keep theirs
          </button>
          <button
            onClick={onUseMine}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-starlight-amber text-white hover:bg-starlight-amber transition-colors font-medium"
          >
            Use mine
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 text-sm text-muted hover:text-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
