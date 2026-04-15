"use client";

import { useState, useEffect } from "react";
import { Minus, Plus, Camera, X } from "lucide-react";
import { formatHours } from "@/lib/format-hours";

export interface LogSheetData {
  hours: number;
  date: string;
  notes: string;
  photos: { file: File; preview: string }[];
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
}

function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function LogSheet({
  open, onClose, onSubmit, contextLabel, contextSublabel,
  defaultHours = 0, defaultDate, showDatePicker = false,
  notesPlaceholder = "Any notes...", submitLabel, submitting = false,
}: LogSheetProps) {
  const [hours, setHours] = useState(defaultHours);
  const [date, setDate] = useState(defaultDate || localDateStr());
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);

  // Reset state every time the sheet opens
  useEffect(() => {
    if (open) {
      setHours(defaultHours);
      setDate(defaultDate || localDateStr());
      setNotes("");
      setPhotos([]);
    }
  }, [open, defaultHours, defaultDate]);

  if (!open) return null;

  const adjustHours = (delta: number) => setHours(prev => Math.max(0.25, Math.round((prev + delta) * 4) / 4));
  const label = submitLabel || `Log ${hours > 0 ? formatHours(hours) : "hours"}`;

  const handleSubmit = async () => {
    if (hours <= 0) return;
    await onSubmit({ hours, date, notes: notes.trim(), photos });
  };

  const addPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => setPhotos(prev => [...prev, { file, preview: ev.target?.result as string }]);
    reader.readAsDataURL(file);
  };

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

        {/* Hours stepper */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-muted shrink-0 w-12">Hours</label>
          <div className="flex items-center bg-surface-dim border border-subtle rounded-xl overflow-hidden flex-1 min-w-0">
            <button type="button" onClick={() => adjustHours(-0.25)} className="shrink-0 px-4 py-3 text-muted active:bg-surface-mid border-r border-subtle"><Minus className="h-4 w-4" /></button>
            <input type="number" step="0.25" value={hours || ""} onChange={e => setHours(parseFloat(e.target.value) || 0)}
              className="min-w-0 flex-1 text-center py-3 text-lg font-bold text-navy bg-transparent focus:outline-none font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              inputMode="decimal" />
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

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-muted mb-1.5 block">Notes</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder={notesPlaceholder} maxLength={300}
            className="w-full px-4 py-3 bg-surface-dim border border-subtle rounded-xl text-sm text-navy placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-starlight-blue/30" />
        </div>

        {/* Photos */}
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

        {/* Submit */}
        <button onClick={handleSubmit} disabled={submitting || hours <= 0}
          className="w-full py-3.5 bg-navy text-white text-sm font-semibold rounded-xl active:bg-navy/90 disabled:opacity-40 transition-colors">
          {submitting ? "Logging..." : label}
        </button>
      </div>
    </div>
  );
}
