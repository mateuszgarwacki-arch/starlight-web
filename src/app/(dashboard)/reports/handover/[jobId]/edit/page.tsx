"use client";

import { useEffect, useState, useCallback, use } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  ArrowUp,
  ArrowDown,
  FileText,
  Paperclip,
  Loader2,
  Image as ImageIcon,
  FileIcon,
} from "lucide-react";
import { toast } from "sonner";

// ————————————————————————————————————————————————————————
// Types
// ————————————————————————————————————————————————————————

interface JobHeader {
  job_number: string;
  job_name: string;
}

interface ZoneRow {
  event_zone: string;
  sort_order: number;
  notes: string;
}

interface JobDoc {
  doc_id: number;
  file_name: string;
  caption: string | null;
  mime_type: string | null;
  doc_type: string | null;
}

interface ZoneDocLink {
  event_zone: string;
  doc_id: number;
  sort_order: number;
}

// ————————————————————————————————————————————————————————
// Page
// ————————————————————————————————————————————————————————

export default function HandoverEditPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId: jobIdStr } = use(params);
  const jobId = parseInt(jobIdStr);
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<JobHeader | null>(null);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [jobDocs, setJobDocs] = useState<JobDoc[]>([]);
  const [zoneDocLinks, setZoneDocLinks] = useState<ZoneDocLink[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: jobData } = await supabase
      .from("tbl_production_plan")
      .select("job_number, job_name")
      .eq("job_id", jobId)
      .single();
    if (jobData) setJob(jobData as JobHeader);

    const { data: lineData } = await supabase
      .from("tbl_quote_lines")
      .select("event_zone, line_sub_group")
      .eq("job_id", jobId);
    const distinctZones = Array.from(
      new Set(
        (lineData || [])
          .filter(
            (l) =>
              l.event_zone &&
              l.event_zone.trim() !== "" &&
              (l.line_sub_group || "") !== "Overhead",
          )
          .map((l) => l.event_zone as string),
      ),
    );

    const { data: noteData } = await supabase
      .from("tbl_handover_zone_notes")
      .select("event_zone, notes, sort_order")
      .eq("job_id", jobId);
    const noteMap = new Map(
      (noteData || []).map((n) => [
        n.event_zone as string,
        {
          notes: (n.notes as string | null) || "",
          sort_order: n.sort_order as number,
        },
      ]),
    );

    const zonesArr: ZoneRow[] = distinctZones.map((z) => ({
      event_zone: z,
      sort_order: noteMap.get(z)?.sort_order ?? 999,
      notes: noteMap.get(z)?.notes ?? "",
    }));
    zonesArr.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.event_zone.localeCompare(b.event_zone);
    });
    setZones(zonesArr);

    const { data: docs } = await supabase
      .from("tbl_wo_documents")
      .select("doc_id, file_name, caption, mime_type, doc_type")
      .eq("job_id", jobId)
      .is("scope_item_id", null)
      .is("work_order_id", null)
      .order("file_name", { ascending: true });
    setJobDocs((docs as JobDoc[]) || []);

    const { data: zds } = await supabase
      .from("tbl_handover_zone_documents")
      .select("event_zone, doc_id, sort_order")
      .eq("job_id", jobId);
    setZoneDocLinks((zds as ZoneDocLink[]) || []);

    setLoading(false);
  }, [jobId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveNote(zone: string, notes: string) {
    const current = zones.find((z) => z.event_zone === zone);
    if (!current) return;
    const { error } = await supabase
      .from("tbl_handover_zone_notes")
      .upsert(
        {
          job_id: jobId,
          event_zone: zone,
          notes: notes || null,
          sort_order: current.sort_order,
          modified_at: new Date().toISOString(),
        },
        { onConflict: "job_id,event_zone" },
      );
    if (error) {
      toast.error("Failed to save note");
      return;
    }
    setZones((prev) =>
      prev.map((z) => (z.event_zone === zone ? { ...z, notes } : z)),
    );
  }

  async function moveZone(zone: string, direction: -1 | 1) {
    const idx = zones.findIndex((z) => z.event_zone === zone);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= zones.length) return;

    const next = zones.map((z) => ({ ...z }));
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    next.forEach((z, i) => {
      z.sort_order = i + 1;
    });

    setZones(next);

    const rows = next.map((z) => ({
      job_id: jobId,
      event_zone: z.event_zone,
      notes: z.notes || null,
      sort_order: z.sort_order,
      modified_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("tbl_handover_zone_notes")
      .upsert(rows, { onConflict: "job_id,event_zone" });
    if (error) {
      toast.error("Failed to reorder — reloading");
      await load();
    }
  }

  async function toggleDoc(zone: string, docId: number, checked: boolean) {
    if (checked) {
      const existingForZone = zoneDocLinks.filter(
        (l) => l.event_zone === zone,
      );
      const newSort =
        existingForZone.reduce((m, l) => Math.max(m, l.sort_order), 0) + 1;
      const { error } = await supabase
        .from("tbl_handover_zone_documents")
        .insert({
          job_id: jobId,
          event_zone: zone,
          doc_id: docId,
          sort_order: newSort,
        });
      if (error) {
        toast.error("Failed to attach drawing");
        return;
      }
      setZoneDocLinks((prev) => [
        ...prev,
        { event_zone: zone, doc_id: docId, sort_order: newSort },
      ]);
    } else {
      const { error } = await supabase
        .from("tbl_handover_zone_documents")
        .delete()
        .eq("job_id", jobId)
        .eq("event_zone", zone)
        .eq("doc_id", docId);
      if (error) {
        toast.error("Failed to remove drawing");
        return;
      }
      setZoneDocLinks((prev) =>
        prev.filter((l) => !(l.event_zone === zone && l.doc_id === docId)),
      );
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-8 text-starlight-red">Job not found.</div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <Link
            href={`/jobs/${jobId}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-navy transition-colors mb-2"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Job
          </Link>
          <div className="font-mono text-xs text-muted">
            {job.job_number}
          </div>
          <h1 className="text-2xl font-bold text-navy">
            {job.job_name}
          </h1>
          <p className="text-sm text-muted mt-1">
            Handover Prep — zone order, notes &amp; drawings. Changes save as
            you go.
          </p>
        </div>
        <Link
          href={`/reports/handover/${jobId}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy/90 transition-colors text-sm shrink-0"
        >
          <Printer className="h-4 w-4" />
          Open Print View
        </Link>
      </div>

      <div className="flex gap-6 text-xs text-muted border-t border-subtle pt-3">
        <span>
          <strong className="text-navy">{zones.length}</strong> zone
          {zones.length !== 1 ? "s" : ""}
        </span>
        <span>
          <strong className="text-navy">{jobDocs.length}</strong> job-level
          document{jobDocs.length !== 1 ? "s" : ""} available
        </span>
        <span>
          <strong className="text-navy">{zoneDocLinks.length}</strong> drawing
          attachment{zoneDocLinks.length !== 1 ? "s" : ""}
        </span>
      </div>

      {zones.length === 0 ? (
        <div className="p-8 text-center text-muted border border-dashed border-subtle rounded-lg">
          No zones yet. Zones are derived from{" "}
          <code className="text-xs bg-surface-mid px-1 rounded">
            event_zone
          </code>{" "}
          on quote lines — add some to your quote first.
        </div>
      ) : (
        <div className="space-y-3">
          {zones.map((zone, idx) => (
            <ZoneEditor
              key={zone.event_zone}
              zone={zone}
              idx={idx}
              total={zones.length}
              docs={jobDocs}
              linkedDocIds={zoneDocLinks
                .filter((l) => l.event_zone === zone.event_zone)
                .map((l) => l.doc_id)}
              onMoveUp={() => moveZone(zone.event_zone, -1)}
              onMoveDown={() => moveZone(zone.event_zone, 1)}
              onNoteSave={(notes) => saveNote(zone.event_zone, notes)}
              onToggleDoc={(docId, checked) =>
                toggleDoc(zone.event_zone, docId, checked)
              }
            />
          ))}
        </div>
      )}

      {jobDocs.length === 0 && (
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-100">
          No job-level documents uploaded yet. Attach production drawings to
          the job (not to a scope or WO) first — they&apos;ll appear here as
          pickable options for each zone.
        </div>
      )}
    </div>
  );
}

function ZoneEditor({
  zone,
  idx,
  total,
  docs,
  linkedDocIds,
  onMoveUp,
  onMoveDown,
  onNoteSave,
  onToggleDoc,
}: {
  zone: ZoneRow;
  idx: number;
  total: number;
  docs: JobDoc[];
  linkedDocIds: number[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onNoteSave: (notes: string) => void;
  onToggleDoc: (docId: number, checked: boolean) => void;
}) {
  const [noteDraft, setNoteDraft] = useState(zone.notes);
  const [savedPulse, setSavedPulse] = useState(false);
  const [docsOpen, setDocsOpen] = useState(linkedDocIds.length > 0);

  useEffect(() => {
    setNoteDraft(zone.notes);
  }, [zone.notes]);

  const handleBlur = async () => {
    if (noteDraft === zone.notes) return;
    await onNoteSave(noteDraft);
    setSavedPulse(true);
    setTimeout(() => setSavedPulse(false), 900);
  };

  const linkedDocs = docs.filter((d) => linkedDocIds.includes(d.doc_id));

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-subtle bg-surface-dim">
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={idx === 0}
            className="p-1 hover:bg-surface-mid rounded disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            aria-label="Move up"
          >
            <ArrowUp className="h-3 w-3 text-muted" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={idx === total - 1}
            className="p-1 hover:bg-surface-mid rounded disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            aria-label="Move down"
          >
            <ArrowDown className="h-3 w-3 text-muted" />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-faint shrink-0">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <h3 className="text-base font-semibold text-navy truncate">
              {zone.event_zone}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted mt-0.5">
            {linkedDocs.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-2.5 w-2.5" />
                {linkedDocs.length} drawing
                {linkedDocs.length !== 1 ? "s" : ""}
              </span>
            )}
            {zone.notes && zone.notes.trim().length > 0 && (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-2.5 w-2.5" />
                note set
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-b border-subtle">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] uppercase tracking-wider text-muted font-semibold">
            Zone note
          </label>
          {savedPulse && (
            <span className="text-[10px] text-starlight-green">Saved</span>
          )}
        </div>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={handleBlur}
          placeholder="Prints at the top of this zone's intro page. Access constraints, key contact, anything the stand-in needs to know before walking into this zone."
          className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-sm resize-y min-h-[3rem] focus:outline-none focus:ring-2 focus:ring-starlight-blue/30"
          rows={2}
        />
      </div>

      <div className="px-5 py-3">
        <button
          onClick={() => setDocsOpen((o) => !o)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Paperclip className="h-3.5 w-3.5 text-muted" />
            <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">
              Drawings
            </span>
            <span className="text-xs text-muted">
              ({linkedDocs.length} attached)
            </span>
          </div>
          <span className="text-[10px] text-muted">
            {docsOpen ? "hide" : "pick"}
          </span>
        </button>

        {docsOpen && (
          <div className="mt-3">
            {docs.length === 0 ? (
              <p className="text-xs text-muted italic py-2">
                No job-level documents to choose from.
              </p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto border border-subtle rounded bg-surface-dim p-2">
                {docs.map((doc) => {
                  const isLinked = linkedDocIds.includes(doc.doc_id);
                  const isImg = (doc.mime_type || "").startsWith("image/");
                  return (
                    <label
                      key={doc.doc_id}
                      className="flex items-start gap-2 px-2 py-1.5 hover:bg-surface-mid rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isLinked}
                        onChange={(e) =>
                          onToggleDoc(doc.doc_id, e.target.checked)
                        }
                        className="mt-0.5 accent-starlight-blue shrink-0"
                      />
                      {isImg ? (
                        <ImageIcon className="h-3.5 w-3.5 text-muted mt-0.5 shrink-0" />
                      ) : (
                        <FileIcon className="h-3.5 w-3.5 text-muted mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div
                          className={
                            "text-xs truncate " +
                            (isLinked
                              ? "text-navy font-medium"
                              : "text-muted")
                          }
                        >
                          {doc.file_name}
                        </div>
                        {doc.caption && (
                          <div className="text-[10px] text-faint truncate">
                            {doc.caption}
                          </div>
                        )}
                      </div>
                      {doc.doc_type && (
                        <span className="text-[9px] uppercase text-faint tracking-wider shrink-0">
                          {doc.doc_type}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
