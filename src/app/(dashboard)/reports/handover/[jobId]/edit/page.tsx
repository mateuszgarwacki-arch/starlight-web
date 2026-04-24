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
  is_included: boolean;
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

interface ZoneLineWO {
  work_order_id: number;
  description: string;
  status: string;
  activity_label: string | null;
  wo_sequence: number | null;
  wo_note: string;
}

interface ZoneLine {
  quote_line_id: number;
  line_number: string;
  line_text: string;
  import_sequence: number;
  is_included: boolean;
  line_note: string;
  wos: ZoneLineWO[];
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
  const [linesByZone, setLinesByZone] = useState<Map<string, ZoneLine[]>>(
    new Map(),
  );

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
      .select("event_zone, notes, sort_order, is_included")
      .eq("job_id", jobId);
    const noteMap = new Map(
      (noteData || []).map((n) => [
        n.event_zone as string,
        {
          notes: (n.notes as string | null) || "",
          sort_order: n.sort_order as number,
          is_included: (n.is_included as boolean | null) ?? true,
        },
      ]),
    );

    const zonesArr: ZoneRow[] = distinctZones.map((z) => ({
      event_zone: z,
      sort_order: noteMap.get(z)?.sort_order ?? 999,
      notes: noteMap.get(z)?.notes ?? "",
      is_included: noteMap.get(z)?.is_included ?? true,
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

    // Quote lines (non-overhead, zoned)
    const { data: allLines } = await supabase
      .from("tbl_quote_lines")
      .select(
        "quote_line_id, line_number, line_text, event_zone, import_sequence, line_sub_group",
      )
      .eq("job_id", jobId);
    const usableLines = (allLines || []).filter(
      (l) =>
        l.event_zone &&
        l.event_zone.trim() !== "" &&
        (l.line_sub_group || "") !== "Overhead",
    );

    // Line overrides (sparse)
    const { data: overrides } = await supabase
      .from("tbl_handover_line_overrides")
      .select("quote_line_id, is_included, notes")
      .eq("job_id", jobId);
    const overrideMap = new Map(
      (overrides || []).map((o) => [
        o.quote_line_id as number,
        {
          is_included: o.is_included as boolean,
          notes: (o.notes as string | null) || "",
        },
      ]),
    );

    // Scopes (non-general) for the job — to join WOs back to their quote line
    const { data: scopeRows } = await supabase
      .from("tbl_scope_items")
      .select("scope_item_id, quote_line_id, is_general")
      .eq("job_id", jobId);
    const scopesFiltered = (scopeRows || []).filter((s) => !s.is_general);
    const scopeToLine = new Map(
      scopesFiltered.map((s) => [
        s.scope_item_id as number,
        s.quote_line_id as number,
      ]),
    );
    const scopeIds = scopesFiltered.map((s) => s.scope_item_id as number);

    // WOs for these scopes
    const { data: woRows } =
      scopeIds.length > 0
        ? await supabase
            .from("tbl_work_orders")
            .select(
              "work_order_id, scope_item_id, description, status, activity_verb, wo_sequence",
            )
            .in("scope_item_id", scopeIds)
        : { data: [] as any[] };

    // Activity verb labels
    const { data: activityRows } = await supabase
      .from("tbl_master_lookups")
      .select("lookup_id, lookup_value")
      .eq("category", "ACTIVITY");
    const activityMap = new Map(
      (activityRows || []).map((a) => [
        a.lookup_id as number,
        a.lookup_value as string,
      ]),
    );

    // WO notes (sparse)
    const { data: woNoteRows } = await supabase
      .from("tbl_handover_wo_notes")
      .select("work_order_id, notes")
      .eq("job_id", jobId);
    const woNoteMap = new Map(
      (woNoteRows || []).map((n) => [
        n.work_order_id as number,
        (n.notes as string | null) || "",
      ]),
    );

    // Assemble: group WOs by their line, group lines by zone
    const woByLine = new Map<number, ZoneLineWO[]>();
    (woRows || []).forEach((wo: any) => {
      const lineId = scopeToLine.get(wo.scope_item_id);
      if (!lineId) return;
      if (!woByLine.has(lineId)) woByLine.set(lineId, []);
      woByLine.get(lineId)!.push({
        work_order_id: wo.work_order_id,
        description: wo.description || "",
        status: wo.status || "",
        activity_label: wo.activity_verb
          ? activityMap.get(wo.activity_verb) || null
          : null,
        wo_sequence: wo.wo_sequence,
        wo_note: woNoteMap.get(wo.work_order_id) || "",
      });
    });
    woByLine.forEach((arr) => {
      arr.sort((a, b) => {
        const sa = a.wo_sequence ?? 999;
        const sb = b.wo_sequence ?? 999;
        if (sa !== sb) return sa - sb;
        return a.work_order_id - b.work_order_id;
      });
    });

    const byZone = new Map<string, ZoneLine[]>();
    usableLines.forEach((l) => {
      const zone = l.event_zone as string;
      if (!byZone.has(zone)) byZone.set(zone, []);
      const override = overrideMap.get(l.quote_line_id as number);
      byZone.get(zone)!.push({
        quote_line_id: l.quote_line_id as number,
        line_number: (l.line_number as string) || "",
        line_text: (l.line_text as string) || "",
        import_sequence: (l.import_sequence as number) ?? 0,
        is_included: override?.is_included ?? true,
        line_note: override?.notes || "",
        wos: woByLine.get(l.quote_line_id as number) || [],
      });
    });
    byZone.forEach((arr) =>
      arr.sort((a, b) => a.import_sequence - b.import_sequence),
    );
    setLinesByZone(byZone);

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
          is_included: current.is_included,
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

  async function toggleZoneInclusion(zone: string, is_included: boolean) {
    const current = zones.find((z) => z.event_zone === zone);
    if (!current) return;
    const { error } = await supabase
      .from("tbl_handover_zone_notes")
      .upsert(
        {
          job_id: jobId,
          event_zone: zone,
          notes: current.notes || null,
          sort_order: current.sort_order,
          is_included,
          modified_at: new Date().toISOString(),
        },
        { onConflict: "job_id,event_zone" },
      );
    if (error) {
      toast.error("Failed to toggle zone");
      return;
    }
    setZones((prev) =>
      prev.map((z) =>
        z.event_zone === zone ? { ...z, is_included } : z,
      ),
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
      is_included: z.is_included,
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

  // Helper: find a line by id in the zones map
  function findLine(quote_line_id: number): ZoneLine | undefined {
    for (const arr of linesByZone.values()) {
      const found = arr.find((l) => l.quote_line_id === quote_line_id);
      if (found) return found;
    }
    return undefined;
  }

  function patchLine(quote_line_id: number, patch: Partial<ZoneLine>) {
    setLinesByZone((prev) => {
      const next = new Map(prev);
      for (const [zone, arr] of next) {
        const idx = arr.findIndex((l) => l.quote_line_id === quote_line_id);
        if (idx >= 0) {
          const copy = [...arr];
          copy[idx] = { ...copy[idx], ...patch };
          next.set(zone, copy);
          break;
        }
      }
      return next;
    });
  }

  async function toggleLineIncluded(
    quote_line_id: number,
    is_included: boolean,
  ) {
    const line = findLine(quote_line_id);
    if (!line) return;
    const { error } = await supabase
      .from("tbl_handover_line_overrides")
      .upsert(
        {
          job_id: jobId,
          quote_line_id,
          is_included,
          notes: line.line_note || null,
          modified_at: new Date().toISOString(),
        },
        { onConflict: "job_id,quote_line_id" },
      );
    if (error) {
      toast.error("Failed to update line");
      return;
    }
    patchLine(quote_line_id, { is_included });
  }

  async function saveLineNote(quote_line_id: number, notes: string) {
    const line = findLine(quote_line_id);
    if (!line) return;
    if (notes === line.line_note) return;
    const { error } = await supabase
      .from("tbl_handover_line_overrides")
      .upsert(
        {
          job_id: jobId,
          quote_line_id,
          is_included: line.is_included,
          notes: notes || null,
          modified_at: new Date().toISOString(),
        },
        { onConflict: "job_id,quote_line_id" },
      );
    if (error) {
      toast.error("Failed to save line note");
      return;
    }
    patchLine(quote_line_id, { line_note: notes });
  }

  async function saveWoNote(work_order_id: number, notes: string) {
    // Find the line containing this WO for local state update
    let targetLineId: number | null = null;
    let targetZone: string | null = null;
    for (const [zone, arr] of linesByZone) {
      for (const line of arr) {
        if (line.wos.some((w) => w.work_order_id === work_order_id)) {
          targetLineId = line.quote_line_id;
          targetZone = zone;
          break;
        }
      }
      if (targetLineId) break;
    }
    if (!targetLineId || !targetZone) return;

    if (!notes || notes.trim() === "") {
      const { error } = await supabase
        .from("tbl_handover_wo_notes")
        .delete()
        .eq("job_id", jobId)
        .eq("work_order_id", work_order_id);
      if (error) {
        toast.error("Failed to clear WO note");
        return;
      }
    } else {
      const { error } = await supabase
        .from("tbl_handover_wo_notes")
        .upsert(
          {
            job_id: jobId,
            work_order_id,
            notes,
            modified_at: new Date().toISOString(),
          },
          { onConflict: "job_id,work_order_id" },
        );
      if (error) {
        toast.error("Failed to save WO note");
        return;
      }
    }

    setLinesByZone((prev) => {
      const next = new Map(prev);
      const arr = next.get(targetZone!);
      if (!arr) return prev;
      const copy = arr.map((l) =>
        l.quote_line_id === targetLineId
          ? {
              ...l,
              wos: l.wos.map((w) =>
                w.work_order_id === work_order_id
                  ? { ...w, wo_note: notes }
                  : w,
              ),
            }
          : l,
      );
      next.set(targetZone!, copy);
      return next;
    });
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
              onToggleInclusion={(inc) =>
                toggleZoneInclusion(zone.event_zone, inc)
              }
              onToggleDoc={(docId, checked) =>
                toggleDoc(zone.event_zone, docId, checked)
              }
              lines={linesByZone.get(zone.event_zone) || []}
              onLineToggle={toggleLineIncluded}
              onLineNoteSave={saveLineNote}
              onWoNoteSave={saveWoNote}
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
  onToggleInclusion,
  onToggleDoc,
  lines,
  onLineToggle,
  onLineNoteSave,
  onWoNoteSave,
}: {
  zone: ZoneRow;
  idx: number;
  total: number;
  docs: JobDoc[];
  linkedDocIds: number[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onNoteSave: (notes: string) => void;
  onToggleInclusion: (is_included: boolean) => void;
  onToggleDoc: (docId: number, checked: boolean) => void;
  lines: ZoneLine[];
  onLineToggle: (quote_line_id: number, is_included: boolean) => void;
  onLineNoteSave: (quote_line_id: number, notes: string) => void;
  onWoNoteSave: (work_order_id: number, notes: string) => void;
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
  const excluded = !zone.is_included;

  return (
    <section
      className={
        "card overflow-hidden transition-opacity " +
        (excluded ? "opacity-50" : "")
      }
    >
      <div
        className={
          "flex items-center gap-3 px-5 py-3 border-b border-subtle " +
          (excluded ? "bg-surface-dim/50" : "bg-surface-dim")
        }
      >
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={idx === 0 || excluded}
            className="p-1 hover:bg-surface-mid rounded disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            aria-label="Move up"
          >
            <ArrowUp className="h-3 w-3 text-muted" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={idx === total - 1 || excluded}
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
            <h3
              className={
                "text-base font-semibold truncate " +
                (excluded
                  ? "text-muted line-through"
                  : "text-navy")
              }
            >
              {zone.event_zone}
            </h3>
            {excluded && (
              <span className="text-[9px] uppercase tracking-wider font-semibold text-starlight-amber bg-starlight-amber/10 border border-starlight-amber/30 px-1.5 py-0.5 rounded shrink-0">
                Excluded
              </span>
            )}
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
        <label
          className="flex items-center gap-2 text-xs text-muted cursor-pointer shrink-0 select-none"
          title={
            zone.is_included
              ? "Zone included in handover. Untick to hide this whole zone from the print."
              : "Zone excluded. Tick to include it in the handover again."
          }
        >
          <input
            type="checkbox"
            checked={zone.is_included}
            onChange={(e) => onToggleInclusion(e.target.checked)}
            className="accent-starlight-blue h-4 w-4"
          />
          <span className="hidden sm:inline">Include</span>
        </label>
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

      {/* Quote lines */}
      {lines.length > 0 && (
        <LinesSection
          lines={lines}
          onLineToggle={onLineToggle}
          onLineNoteSave={onLineNoteSave}
          onWoNoteSave={onWoNoteSave}
        />
      )}
    </section>
  );
}

// ————————————————————————————————————————————————————————
// Lines section — inclusion toggles + line notes + WO notes
// ————————————————————————————————————————————————————————

function LinesSection({
  lines,
  onLineToggle,
  onLineNoteSave,
  onWoNoteSave,
}: {
  lines: ZoneLine[];
  onLineToggle: (quote_line_id: number, is_included: boolean) => void;
  onLineNoteSave: (quote_line_id: number, notes: string) => void;
  onWoNoteSave: (work_order_id: number, notes: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const includedCount = lines.filter((l) => l.is_included).length;
  const excludedCount = lines.length - includedCount;
  const linesWithNotes = lines.filter(
    (l) => l.line_note && l.line_note.trim().length > 0,
  ).length;
  const wosWithNotes = lines.reduce(
    (m, l) =>
      m +
      l.wos.filter((w) => w.wo_note && w.wo_note.trim().length > 0).length,
    0,
  );

  return (
    <div className="px-5 py-3 border-t border-subtle">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted" />
          <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">
            Quote lines
          </span>
          <span className="text-xs text-muted">
            ({includedCount}/{lines.length} included
            {excludedCount > 0 ? ` · ${excludedCount} excluded` : ""}
            {linesWithNotes > 0 ? ` · ${linesWithNotes} line note${linesWithNotes !== 1 ? "s" : ""}` : ""}
            {wosWithNotes > 0 ? ` · ${wosWithNotes} WO note${wosWithNotes !== 1 ? "s" : ""}` : ""}
            )
          </span>
        </div>
        <span className="text-[10px] text-muted">
          {open ? "hide" : "edit"}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {lines.map((line) => (
            <LineEditor
              key={line.quote_line_id}
              line={line}
              onToggle={(incl) => onLineToggle(line.quote_line_id, incl)}
              onNoteSave={(notes) =>
                onLineNoteSave(line.quote_line_id, notes)
              }
              onWoNoteSave={onWoNoteSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LineEditor({
  line,
  onToggle,
  onNoteSave,
  onWoNoteSave,
}: {
  line: ZoneLine;
  onToggle: (is_included: boolean) => void;
  onNoteSave: (notes: string) => void;
  onWoNoteSave: (work_order_id: number, notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [noteDraft, setNoteDraft] = useState(line.line_note);
  const [savedPulse, setSavedPulse] = useState(false);

  useEffect(() => {
    setNoteDraft(line.line_note);
  }, [line.line_note]);

  const handleNoteBlur = async () => {
    if (noteDraft === line.line_note) return;
    await onNoteSave(noteDraft);
    setSavedPulse(true);
    setTimeout(() => setSavedPulse(false), 900);
  };

  const hasLineNote = line.line_note && line.line_note.trim().length > 0;
  const woNoteCount = line.wos.filter(
    (w) => w.wo_note && w.wo_note.trim().length > 0,
  ).length;

  const excluded = !line.is_included;

  return (
    <div
      className={
        "border border-subtle rounded bg-surface-dim transition-opacity " +
        (excluded ? "opacity-50" : "")
      }
    >
      {/* Header row */}
      <div className="flex items-start gap-2 px-3 py-2">
        <input
          type="checkbox"
          checked={line.is_included}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 accent-starlight-blue shrink-0"
          title={
            line.is_included
              ? "Included in handover — click to exclude"
              : "Excluded — click to include"
          }
        />
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 text-left min-w-0"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-mono text-faint shrink-0">
              #{line.line_number}
            </span>
            <span
              className={
                "text-xs truncate " +
                (excluded ? "line-through text-muted" : "text-navy")
              }
            >
              {line.line_text.slice(0, 120)}
              {line.line_text.length > 120 ? "…" : ""}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted">
            {line.wos.length > 0 && (
              <span>
                {line.wos.length} WO{line.wos.length !== 1 ? "s" : ""}
              </span>
            )}
            {hasLineNote && (
              <span className="text-starlight-blue">line note set</span>
            )}
            {woNoteCount > 0 && (
              <span className="text-starlight-blue">
                {woNoteCount} WO note{woNoteCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-subtle px-3 py-3 space-y-3 bg-surface">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                Line note
              </label>
              {savedPulse && (
                <span className="text-[10px] text-starlight-green">
                  Saved
                </span>
              )}
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="Optional — prints above this line on the handover."
              className="w-full px-2 py-1.5 bg-surface-dim border border-subtle rounded text-xs resize-y min-h-[2.25rem] focus:outline-none focus:ring-2 focus:ring-starlight-blue/30"
              rows={2}
            />
          </div>

          {line.wos.length > 0 && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted font-semibold block mb-1.5">
                Work orders ({line.wos.length})
              </label>
              <div className="space-y-1.5">
                {line.wos.map((wo) => (
                  <WoNoteEditor
                    key={wo.work_order_id}
                    wo={wo}
                    onSave={(notes) =>
                      onWoNoteSave(wo.work_order_id, notes)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WoNoteEditor({
  wo,
  onSave,
}: {
  wo: ZoneLineWO;
  onSave: (notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(
    !!wo.wo_note && wo.wo_note.trim().length > 0,
  );
  const [noteDraft, setNoteDraft] = useState(wo.wo_note);
  const [savedPulse, setSavedPulse] = useState(false);

  useEffect(() => {
    setNoteDraft(wo.wo_note);
  }, [wo.wo_note]);

  const handleBlur = async () => {
    if (noteDraft === wo.wo_note) return;
    await onSave(noteDraft);
    setSavedPulse(true);
    setTimeout(() => setSavedPulse(false), 900);
  };

  const hasNote = wo.wo_note && wo.wo_note.trim().length > 0;

  return (
    <div className="border border-subtle rounded bg-surface-dim">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
      >
        <span className="text-[9px] font-mono font-semibold text-faint shrink-0 uppercase">
          {wo.status || "—"}
        </span>
        {wo.activity_label && (
          <span className="text-[10px] text-starlight-blue shrink-0">
            {wo.activity_label}
          </span>
        )}
        <span className="text-xs text-navy truncate flex-1 min-w-0">
          {wo.description || "(no description)"}
        </span>
        {hasNote && (
          <span className="text-[10px] text-starlight-blue shrink-0">
            ✎ note
          </span>
        )}
        <span className="text-[10px] text-faint shrink-0">
          {expanded ? "−" : "+"}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-subtle px-2 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] uppercase tracking-wider text-muted font-semibold">
              WO note
            </span>
            {savedPulse && (
              <span className="text-[9px] text-starlight-green">Saved</span>
            )}
          </div>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={handleBlur}
            placeholder="Optional — prints under this WO description on the handover."
            className="w-full px-2 py-1.5 bg-surface border border-subtle rounded text-xs resize-y min-h-[2rem] focus:outline-none focus:ring-2 focus:ring-starlight-blue/30"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}
