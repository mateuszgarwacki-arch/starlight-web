"use client";

import { useState, useEffect } from "react";
import { Minus, Plus, Camera, X, Search, ArrowRight } from "lucide-react";
import { formatHours } from "@/lib/format-hours";

export interface WoOption {
  work_order_id: number;
  description: string | null;
  scope_name: string;
  job_number: string;
  status: string | null;
}

export interface LogSheetData {
  hours: number;
  date: string;
  notes: string;
  photos: { file: File; preview: string }[];
  /** If set, the parent should route this log to a WO instead of keeping it ad-hoc. */
  routedWoId?: number | null;
}

interface LogSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: LogSheetData) => Promise<void>;
  contextLabel: string;
  contextSublabel?: string;
  defaultHours?: number;
  defaultDate?: string;
  showDatePicker?: boolean;
  notesPlaceholder?: string;
  submitLabel?: string;
  submitting?: boolean;
  /** If provided, show an optional "Route to WO" section. The freelancer can
      pick one to attribute this log to a work order instead of filing it
      as a pending ad-hoc task. Omit to hide the section entirely. */
  woOptions?: WoOption[];
  /** Pre-select a WO (used for edit flows where the entry already has one).
      Useful when the section label should also say "Work order" rather than
      "Route to WO" — that's controlled separately via woPickerLabel. */
  defaultRoutedWo?: WoOption | null;
  /** Optional override for the WO picker section label. Defaults to
      "Route to Work Order (optional)". */
  woPickerLabel?: string;
  /** Hide the photo upload control. Used for edit flows where photos
      aren't meaningful (the proposed change is just hours / WO). */
  hidePhotos?: boolean;
}

function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function LogSheet({
  open, onClose, onSubmit, contextLabel, contextSublabel,
  defaultHours = 0, defaultDate, showDatePicker = false,
  notesPlaceholder = "Any notes...", submitLabel, submitting = false,
  woOptions, defaultRoutedWo, woPickerLabel, hidePhotos = false,
}: LogSheetProps) {
  const [hours, setHours] = useState(defaultHours);
  const [date, setDate] = useState(defaultDate || localDateStr());
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [routedWo, setRoutedWo] = useState<WoOption | null>(defaultRoutedWo || null);
  const [woSearch, setWoSearch] = useState("");
  const [showWoPicker, setShowWoPicker] = useState(false);

  // Reset state every time the sheet opens
  useEffect(() => {
    if (open) {
      setHours(defaultHours);
      setDate(defaultDate || localDateStr());
      setNotes("");
      setPhotos([]);
      setRoutedWo(defaultRoutedWo || null);
      setWoSearch("");
      setShowWoPicker(false);
    }
  }, [open, defaultHours, defaultDate, defaultRoutedWo]);

  if (!open) return null;

  const adjustHours = (delta: number) => setHours(prev => Math.max(0.25, Math.round((prev + delta) * 4) / 4));
  const label = submitLabel || `Log ${hours > 0 ? formatHours(hours) : "hours"}${routedWo ? " to WO" : ""}`;

  const handleSubmit = async () => {
    if (hours <= 0) return;
    await onSubmit({
      hours, date, notes: notes.trim(), photos,
      routedWoId: routedWo?.work_order_id ?? null,
    });
  };

  const addPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => setPhotos(prev => [...prev, { file, preview: ev.target?.result as string }]);
    reader.readAsDataURL(file);
  };

  const filteredWos = (woOptions || []).filter(w =>
    !woSearch.trim() ||
    (w.description || "").toLowerCase().includes(woSearch.toLowerCase()) ||
    w.scope_name.toLowerCase().includes(woSearch.toLowerCase()) ||
    w.job_number.toLowerCase().includes(woSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-end justify-center">
      <div className="bg-surface w-full max-w-lg rounded-t-2xl p-5 pb-10 space-y-4 animate-slide-up max-h-[85vh] overflow-y-auto">
        {/* Header — context + close */}
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-navy truncate">{contextLabel}</h2>
            {contextSublabel && <p className="text-[11px] text-muted mt-0.5 truncate">{contextSublabel}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-muted shrink-0 ml-2"><X className="h-5 w-5" /></button>
        </div>

        {/* Hours stepper — center is a formatted read-out (h/m), not a decimal input.
            Freelancer adjusts via ± buttons; direct-typing decimals was rarely used. */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-muted shrink-0 w-12">Hours</label>
          <div className="flex items-center bg-surface-dim border border-subtle rounded-xl overflow-hidden flex-1 min-w-0">
            <button type="button" onClick={() => adjustHours(-0.25)} className="shrink-0 px-4 py-3 text-muted active:bg-surface-mid border-r border-subtle"><Minus className="h-4 w-4" /></button>
            <div className="min-w-0 flex-1 text-center py-3 text-lg font-bold text-navy bg-transparent font-mono tabular-nums select-none">
              {hours > 0 ? formatHours(hours) : "—"}
            </div>
            <button type="button" onClick={() => adjustHours(0.25)} className="shrink-0 px-4 py-3 text-muted active:bg-surface-mid border-l border-subtle"><Plus className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Date */}
        {showDatePicker && (
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-muted shrink-0 w-12">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="flex-1 px-3 py-2.5 bg-surface-dim border border-subtle rounded-xl text-sm text-navy focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
          </div>
        )}

        {/* Route to WO — optional. Shown only when woOptions prop is provided. */}
        {woOptions && woOptions.length > 0 && (
          <div>
            <label className="text-xs font-medium text-muted mb-1.5 block">{woPickerLabel || "Route to Work Order (optional)"}</label>
            {routedWo ? (
              <div className="flex items-center justify-between bg-starlight-blue/10 border border-starlight-blue/30 rounded-xl px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy truncate">{routedWo.scope_name}</p>
                  <p className="text-[10px] text-muted truncate">{routedWo.job_number} · {routedWo.description || "—"}</p>
                </div>
                <button onClick={() => setRoutedWo(null)} className="text-xs text-starlight-red ml-2 shrink-0">Clear</button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
                  <input type="text" value={woSearch}
                    onChange={e => { setWoSearch(e.target.value); setShowWoPicker(true); }}
                    onFocus={() => setShowWoPicker(true)}
                    placeholder="Search work orders..."
                    className="w-full pl-10 pr-4 py-2.5 bg-surface-dim border border-subtle rounded-xl text-sm text-navy placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
                </div>
                {showWoPicker && filteredWos.length > 0 && (
                  <div className="bg-surface border border-subtle rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {(() => {
                      // Group by scope so multiple WOs on the same scope show together.
                      const groups: Record<string, WoOption[]> = {};
                      filteredWos.slice(0, 30).forEach(w => {
                        const key = `${w.job_number}|${w.scope_name}`;
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(w);
                      });
                      return Object.entries(groups).map(([key, ws]) => (
                        <div key={key}>
                          <div className="px-3 py-1.5 bg-surface-dim/50 border-b border-subtle sticky top-0">
                            <p className="text-[10px] font-bold text-navy uppercase tracking-wide truncate">{ws[0].scope_name}</p>
                            <p className="text-[9px] text-muted font-mono">{ws[0].job_number}</p>
                          </div>
                          {ws.map(w => (
                            <button key={w.work_order_id}
                              onClick={() => { setRoutedWo(w); setWoSearch(""); setShowWoPicker(false); }}
                              className="w-full text-left pl-6 pr-4 py-2 hover:bg-surface-dim active:bg-surface-mid border-b border-subtle/50 last:border-0 flex items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-navy truncate">{w.description || "—"}</p>
                                <p className="text-[10px] text-muted">{w.status}</p>
                              </div>
                              <ArrowRight className="h-3 w-3 text-faint shrink-0" />
                            </button>
                          ))}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-muted mb-1.5 block">Notes</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder={notesPlaceholder} maxLength={300}
            className="w-full px-4 py-3 bg-surface-dim border border-subtle rounded-xl text-sm text-navy placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
        </div>

        {/* Photos */}
        {!hidePhotos && (
        <div>
          <label className="text-xs font-medium text-muted mb-1.5 block">Photos</label>
          <div className="flex gap-2 flex-wrap">
            {photos.map((p, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-subtle">
                <img src={p.preview} alt="" className="w-full h-full object-cover" />
                <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">✕</button>
              </div>
            ))}
            {photos.length < 4 && (
              <label className="w-16 h-16 flex items-center justify-center bg-starlight-green text-white rounded-full shadow-md cursor-pointer active:bg-starlight-green/80">
                <Camera className="h-6 w-6" />
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) addPhoto(file);
                  e.target.value = "";
                }} />
              </label>
            )}
          </div>
        </div>
        )}

        {/* Submit */}
        <button onClick={handleSubmit} disabled={submitting || hours <= 0}
          className="w-full py-3.5 bg-navy text-white text-sm font-semibold rounded-xl active:bg-navy/90 disabled:opacity-40 transition-colors">
          {submitting ? "Logging..." : label}
        </button>
      </div>
    </div>
  );
}
