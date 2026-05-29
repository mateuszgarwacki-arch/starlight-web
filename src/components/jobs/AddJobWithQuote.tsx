"use client";
// Intended path: src/components/jobs/AddJobWithQuote.tsx
//
// The "semi-manual" UX: upload a quote, the AI fills everything in, you review/edit, then
// commit. Styled to the Starlight design system (S55) to match the New Job modal.
//
// Flow: pick PDF + type job number -> POST /extract -> review pre-filled fields, the
// reconciliation banner, and the assumptions list -> edit anything -> POST /commit.

import { useState } from "react";
import { Loader2, FileText, Check, AlertTriangle, Trash2, Sparkles } from "lucide-react";
import {
  QUOTE_CATEGORIES,
  type ExtractedQuote,
  type Reconciliation,
} from "@/lib/quote-import/schema";

type Stage = "upload" | "extracting" | "review" | "committing" | "done";

export default function AddJobWithQuote({ onCreated }: { onCreated?: (jobId: number) => void }) {
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [jobNumber, setJobNumber] = useState("");
  const [data, setData] = useState<ExtractedQuote | null>(null);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ job_id: number; lines_inserted: number } | null>(null);

  async function runExtract() {
    if (!file) return;
    setError(null);
    setStage("extracting");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/jobs/import-quote/extract", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Extraction failed");
      setData(json.extracted);
      setRecon(json.reconciliation);
      setStage("review");
    } catch (e: any) {
      setError(e.message);
      setStage("upload");
    }
  }

  async function runCommit() {
    if (!file || !data) return;
    setError(null);
    setStage("committing");
    try {
      const payload = { ...data, job: { ...data.job, job_number: jobNumber } };
      const fd = new FormData();
      fd.append("file", file);
      fd.append("payload", JSON.stringify(payload));
      const res = await fetch("/api/jobs/import-quote/commit", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Commit failed");
      setResult({ job_id: json.job_id, lines_inserted: json.lines_inserted });
      setStage("done");
      onCreated?.(json.job_id);
    } catch (e: any) {
      setError(e.message);
      setStage("review");
    }
  }

  // ---- helpers to edit nested state ----
  const setJob = (k: keyof ExtractedQuote["job"], v: string) =>
    setData((d) => (d ? { ...d, job: { ...d.job, [k]: v || null } } : d));
  const setQuote = (k: keyof ExtractedQuote["quote"], v: string) =>
    setData((d) => (d ? { ...d, quote: { ...d.quote, [k]: v || null } } : d));
  const setLine = (i: number, patch: Partial<ExtractedQuote["lines"][number]>) =>
    setData((d) =>
      d ? { ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : d
    );
  const removeLine = (i: number) =>
    setData((d) => (d ? { ...d, lines: d.lines.filter((_, j) => j !== i) } : d));

  const input =
    "w-full px-3 py-2 border border-subtle rounded-lg text-sm bg-surface text-navy focus:outline-none focus:ring-2 focus:ring-starlight-blue";
  const cell =
    "w-full px-2 py-1 border border-subtle rounded text-sm bg-surface text-navy focus:outline-none focus:ring-1 focus:ring-starlight-blue";
  const label = "block text-xs font-medium text-muted mb-1";

  if (stage === "done" && result) {
    return (
      <div className="p-4 rounded-lg border border-starlight-green/20 bg-starlight-green/5 text-sm text-navy flex items-center gap-2">
        <Check className="h-4 w-4 text-starlight-green shrink-0" />
        <span>
          Job created — <strong>#{result.job_id}</strong>, {result.lines_inserted} quote line
          {result.lines_inserted !== 1 ? "s" : ""} added.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg border border-starlight-red/20 bg-starlight-red/5 text-sm text-starlight-red flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {(stage === "upload" || stage === "extracting") && (
        <div className="space-y-4">
          <div>
            <label className={label}>Job number</label>
            <input
              className={input}
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              placeholder="e.g. 13812"
            />
          </div>
          <div>
            <label className={label}>Quote PDF</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-base file:text-navy hover:file:bg-surface-mid file:cursor-pointer"
            />
          </div>
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-starlight-blue text-white text-sm font-medium hover:bg-starlight-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!file || !jobNumber || stage === "extracting"}
            onClick={runExtract}
          >
            {stage === "extracting" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {stage === "extracting" ? "Reading quote…" : "Extract from quote"}
          </button>
        </div>
      )}

      {(stage === "review" || stage === "committing") && data && (
        <div className="space-y-4">
          {recon && (
            <div
              className={
                "p-3 rounded-lg border text-sm flex items-start gap-2 " +
                (recon.matches
                  ? "border-starlight-green/20 bg-starlight-green/5 text-navy"
                  : "border-starlight-amber/20 bg-starlight-amber/5 text-navy")
              }
            >
              {recon.matches ? (
                <Check className="h-4 w-4 text-starlight-green shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-starlight-amber shrink-0 mt-0.5" />
              )}
              <span>
                Lines total £{recon.computedNet.toLocaleString()} net / £
                {recon.computedGross.toLocaleString()} gross.
                {recon.statedGross != null && (
                  <> Quote states £{recon.statedGross.toLocaleString()} gross.</>
                )}
                {!recon.matches && recon.deltaGross != null && (
                  <> Difference of £{recon.deltaGross.toLocaleString()} — check the lines below.</>
                )}
              </span>
            </div>
          )}

          {data.assumptions.length > 0 && (
            <div className="p-3 rounded-lg border border-subtle bg-base text-sm">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText className="h-3.5 w-3.5 text-muted" />
                <span className="text-xs font-medium text-muted">
                  Assumptions the AI made — review these
                </span>
              </div>
              <ul className="list-disc ml-5 mt-1 space-y-0.5 text-navy">
                {data.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Job number</label><input className={input} value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} /></div>
            <div><label className={label}>Job name</label><input className={input} value={data.job.job_name} onChange={(e) => setJob("job_name", e.target.value)} /></div>
            <div><label className={label}>Event date</label><input className={input} type="date" value={data.job.event_date ?? ""} onChange={(e) => setJob("event_date", e.target.value)} /></div>
            <div><label className={label}>Event location</label><input className={input} value={data.job.event_location ?? ""} onChange={(e) => setJob("event_location", e.target.value)} /></div>
            <div><label className={label}>Quote ref</label><input className={input} value={data.quote.quote_reference ?? ""} onChange={(e) => setQuote("quote_reference", e.target.value)} /></div>
            <div><label className={label}>Quote version</label><input className={input} value={data.quote.quote_version ?? ""} onChange={(e) => setQuote("quote_version", e.target.value)} /></div>
            <div className="col-span-2"><label className={label}>Quote description</label><input className={input} value={data.quote.quote_description ?? ""} onChange={(e) => setQuote("quote_description", e.target.value)} /></div>
            <div className="col-span-2"><label className={label}>PM note</label><input className={input} value={data.job.pm_note ?? ""} onChange={(e) => setJob("pm_note", e.target.value)} /></div>
          </div>

          <div>
            <div className={label}>Quote lines ({data.lines.length})</div>
            <div className="overflow-x-auto border border-subtle rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-base text-left text-xs text-muted uppercase tracking-wider">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Description</th>
                    <th className="px-2 py-1.5 font-medium w-24">Value £</th>
                    <th className="px-2 py-1.5 font-medium w-32">Zone</th>
                    <th className="px-2 py-1.5 font-medium w-28">Sub-group</th>
                    <th className="px-2 py-1.5 font-medium w-28">Category</th>
                    <th className="px-2 py-1.5 font-medium w-40">Note</th>
                    <th className="px-2 py-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l, i) => (
                    <tr key={i} className="border-t border-subtle">
                      <td className="p-1"><input className={cell} value={l.line_text} onChange={(e) => setLine(i, { line_text: e.target.value })} /></td>
                      <td className="p-1"><input className={cell} type="number" step="0.01" value={l.line_value} onChange={(e) => setLine(i, { line_value: parseFloat(e.target.value) || 0 })} /></td>
                      <td className="p-1"><input className={cell} value={l.event_zone ?? ""} onChange={(e) => setLine(i, { event_zone: e.target.value || null })} /></td>
                      <td className="p-1"><input className={cell} value={l.line_sub_group ?? ""} onChange={(e) => setLine(i, { line_sub_group: e.target.value || null })} /></td>
                      <td className="p-1">
                        <select className={cell} value={l.category} onChange={(e) => setLine(i, { category: e.target.value as any })}>
                          {QUOTE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-1"><input className={cell} value={l.pm_note ?? ""} onChange={(e) => setLine(i, { pm_note: e.target.value || null })} /></td>
                      <td className="p-1 text-center">
                        <button
                          className="text-faint hover:text-starlight-red transition-colors"
                          onClick={() => removeLine(i)}
                          aria-label="Remove line"
                        >
                          <span title="Remove line"><Trash2 className="h-3.5 w-3.5" /></span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-starlight-red text-white text-sm font-medium hover:bg-starlight-red transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!jobNumber || stage === "committing"}
              onClick={runCommit}
            >
              {stage === "committing" && <Loader2 className="h-4 w-4 animate-spin" />}
              {stage === "committing" ? "Creating job…" : "Create job & save quote"}
            </button>
            <button
              className="px-4 py-2 rounded-lg border border-subtle text-sm text-muted hover:text-navy transition-colors"
              onClick={() => setStage("upload")}
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
