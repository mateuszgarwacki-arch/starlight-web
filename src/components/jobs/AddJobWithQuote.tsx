"use client";
// Intended path: src/components/jobs/AddJobWithQuote.tsx
//
// The "semi-manual" UX: upload a quote, the AI fills everything in, you review/edit, then
// commit. Styling here is deliberately neutral — drop in your own design-system components
// (buttons, inputs, table) so it matches the rest of the app. The logic is what matters.
//
// Flow: pick PDF + type job number -> POST /extract -> review pre-filled fields, the
// reconciliation banner, and the assumptions list -> edit anything -> POST /commit.

import { useState } from "react";
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

  const input = "border rounded px-2 py-1 text-sm w-full";
  const label = "text-xs font-medium text-gray-500";

  if (stage === "done" && result) {
    return (
      <div className="p-4 rounded border border-green-300 bg-green-50 text-sm">
        Job created — <strong>#{result.job_id}</strong>, {result.lines_inserted} quote lines added.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded border border-red-300 bg-red-50 text-sm text-red-700">{error}</div>
      )}

      {(stage === "upload" || stage === "extracting") && (
        <div className="space-y-3">
          <div>
            <div className={label}>Job number</div>
            <input
              className={input}
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              placeholder="e.g. 13812"
            />
          </div>
          <div>
            <div className={label}>Quote PDF</div>
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <button
            className="px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-40"
            disabled={!file || !jobNumber || stage === "extracting"}
            onClick={runExtract}
          >
            {stage === "extracting" ? "Reading quote…" : "Extract from quote"}
          </button>
        </div>
      )}

      {(stage === "review" || stage === "committing") && data && (
        <div className="space-y-4">
          {recon && (
            <div
              className={`p-3 rounded border text-sm ${
                recon.matches ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"
              }`}
            >
              {recon.matches ? "✓ " : "⚠ "}
              Lines total £{recon.computedNet.toLocaleString()} net / £{recon.computedGross.toLocaleString()} gross.
              {recon.statedGross != null && <> Quote states £{recon.statedGross.toLocaleString()} gross.</>}
              {!recon.matches && recon.deltaGross != null && (
                <> Difference of £{recon.deltaGross.toLocaleString()} — check the lines below.</>
              )}
            </div>
          )}

          {data.assumptions.length > 0 && (
            <div className="p-3 rounded border border-gray-200 bg-gray-50 text-sm">
              <div className={label}>Assumptions the AI made — review these</div>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                {data.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label><span className={label}>Job number</span><input className={input} value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} /></label>
            <label><span className={label}>Job name</span><input className={input} value={data.job.job_name} onChange={(e) => setJob("job_name", e.target.value)} /></label>
            <label><span className={label}>Event date</span><input className={input} type="date" value={data.job.event_date ?? ""} onChange={(e) => setJob("event_date", e.target.value)} /></label>
            <label><span className={label}>Event location</span><input className={input} value={data.job.event_location ?? ""} onChange={(e) => setJob("event_location", e.target.value)} /></label>
            <label><span className={label}>Quote ref</span><input className={input} value={data.quote.quote_reference ?? ""} onChange={(e) => setQuote("quote_reference", e.target.value)} /></label>
            <label><span className={label}>Quote version</span><input className={input} value={data.quote.quote_version ?? ""} onChange={(e) => setQuote("quote_version", e.target.value)} /></label>
            <label className="col-span-2"><span className={label}>Quote description</span><input className={input} value={data.quote.quote_description ?? ""} onChange={(e) => setQuote("quote_description", e.target.value)} /></label>
            <label className="col-span-2"><span className={label}>PM note</span><input className={input} value={data.job.pm_note ?? ""} onChange={(e) => setJob("pm_note", e.target.value)} /></label>
          </div>

          <div>
            <div className={label}>Quote lines ({data.lines.length})</div>
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="p-2">Description</th>
                    <th className="p-2 w-24">Value £</th>
                    <th className="p-2 w-32">Zone</th>
                    <th className="p-2 w-28">Sub-group</th>
                    <th className="p-2 w-28">Category</th>
                    <th className="p-2 w-40">Note</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1"><input className={input} value={l.line_text} onChange={(e) => setLine(i, { line_text: e.target.value })} /></td>
                      <td className="p-1"><input className={input} type="number" step="0.01" value={l.line_value} onChange={(e) => setLine(i, { line_value: parseFloat(e.target.value) || 0 })} /></td>
                      <td className="p-1"><input className={input} value={l.event_zone ?? ""} onChange={(e) => setLine(i, { event_zone: e.target.value || null })} /></td>
                      <td className="p-1"><input className={input} value={l.line_sub_group ?? ""} onChange={(e) => setLine(i, { line_sub_group: e.target.value || null })} /></td>
                      <td className="p-1">
                        <select className={input} value={l.category} onChange={(e) => setLine(i, { category: e.target.value as any })}>
                          {QUOTE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-1"><input className={input} value={l.pm_note ?? ""} onChange={(e) => setLine(i, { pm_note: e.target.value || null })} /></td>
                      <td className="p-1 text-center"><button className="text-red-500" onClick={() => removeLine(i)} title="Remove line">×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-40"
              disabled={!jobNumber || stage === "committing"}
              onClick={runCommit}
            >
              {stage === "committing" ? "Creating job…" : "Create job & save quote"}
            </button>
            <button className="px-3 py-1.5 rounded border text-sm" onClick={() => setStage("upload")}>
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
