"use client";

/**
 * 2"×1" item labels for the workshop floor (Zebra GT800 / any 203dpi label printer).
 *
 * Launched per-WO from the work-orders panel: /labels?woId=123
 * One label per physical job item linked to the WO (quantity → copies, capped).
 * Each label carries: job # · WO #, the item description (large, human-readable),
 * a finish line (only when the WO is a PAINT or COVER activity and finish_required
 * is set), and a QR to /m/wo/{woId} so a phone camera opens the WO page.
 *
 * Offline-first by design: the painter's primary need (what it is + the finish)
 * is printed on the face. The QR is the "show me the drawing" bonus layer, never
 * the only source of truth — the workshop WiFi is not guaranteed.
 *
 * No schema change: finish_required already lives on tbl_job_items.
 */

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Loader2, Tags } from "lucide-react";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

interface LabelItem {
  item_id: number;
  description: string | null;
  finish_required: string | null;
  unit: string | null;
  copies: number;            // resolved number of physical labels to print
  qtyOverflow: number | null; // set when qty exceeds the copy cap (measured material)
}

// Guard against runaway spools when an item carries a measured quantity
// (e.g. 45 sqm of floor covering) rather than a discrete build count.
const COPY_CAP = 30;

export default function LabelsPage() {
  const supabase = createClient();
  const [woId, setWoId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<LabelItem[]>([]);
  const [jobNumber, setJobNumber] = useState("");
  const [activity, setActivity] = useState("");
  const [isPaintOrCover, setIsPaintOrCover] = useState(false);
  const [origin, setOrigin] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Next 16: read params off window.location.search (no Suspense needed).
  useEffect(() => {
    setOrigin(window.location.origin);
    const p = new URLSearchParams(window.location.search);
    const id = p.get("woId");
    setWoId(id ? Number(id) : null);
  }, []);

  // Pre-render the QR to a PNG data URL so the print handler stays synchronous
  // (an await between the click and window.open trips the popup blocker).
  useEffect(() => {
    if (!origin || woId === null) return;
    QRCode.toDataURL(`${origin}/m/wo/${woId}`, { margin: 0, width: 320, errorCorrectionLevel: "M" })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [origin, woId]);

  const loadData = useCallback(async () => {
    if (!woId) { setError("No work order specified"); setLoading(false); return; }
    setLoading(true);
    setError(null);

    // 1. WO row → scope + job context
    const { data: wo, error: woErr } = await supabase
      .from("tbl_work_orders")
      .select("work_order_id, scope_item_id, job_id, status")
      .eq("work_order_id", woId)
      .single();
    if (woErr || !wo) { setError("Work order not found"); setLoading(false); return; }

    // 2. Job number via scope context (mirrors the traveller)
    if (wo.scope_item_id) {
      const { data: ctx } = await supabase
        .from("qry_scope_context")
        .select("job_number")
        .eq("scope_item_id", wo.scope_item_id)
        .single();
      setJobNumber((ctx as any)?.job_number || "");
    }

    // 3. Activities → resolve labels → is this a PAINT or COVER WO?
    const { data: acts } = await supabase
      .from("tbl_wo_activities")
      .select("activity_id, sequence")
      .eq("work_order_id", woId)
      .order("sequence");
    const actIds = acts ? [...new Set(acts.map((a: any) => a.activity_id))] : [];
    if (actIds.length) {
      const { data: lookups } = await supabase
        .from("tbl_master_lookups")
        .select("lookup_id, lookup_value")
        .in("lookup_id", actIds);
      const map: Record<number, string> = {};
      (lookups || []).forEach((l: any) => { map[l.lookup_id] = l.lookup_value || ""; });
      const ordered = (acts || []).map((a: any) => map[a.activity_id]).filter(Boolean);
      setActivity(ordered.join(" + "));
      setIsPaintOrCover(ordered.some((v) => {
        const u = String(v).toUpperCase();
        return u === "PAINT" || u === "COVER";
      }));
    }

    // 4. Linked job items. The .in() query collapses duplicate junction rows
    //    (tbl_jobitem_workorder has no unique constraint — dedup is by design).
    const { data: jxn } = await supabase
      .from("tbl_jobitem_workorder")
      .select("job_item_id")
      .eq("work_order_id", woId);
    const itemIds = jxn ? [...new Set(jxn.map((j: any) => j.job_item_id))] : [];
    if (itemIds.length) {
      const { data: rows } = await supabase
        .from("tbl_job_items")
        .select("item_id, description, finish_required, quantity, unit")
        .in("item_id", itemIds);
      const mapped: LabelItem[] = (rows || []).map((r: any) => {
        const q = Number(r.quantity);
        const whole = Number.isFinite(q) && q >= 1 ? Math.round(q) : 1;
        const capped = whole > COPY_CAP;
        return {
          item_id: r.item_id,
          description: r.description,
          finish_required: r.finish_required,
          unit: r.unit,
          copies: capped ? 1 : whole,
          qtyOverflow: capped ? whole : null,
        };
      });
      // Stable order by item_id so reprints line up with the previous run.
      mapped.sort((a, b) => a.item_id - b.item_id);
      setItems(mapped);
    } else {
      setItems([]);
    }
    setLoading(false);
  }, [woId, supabase]);

  useEffect(() => { if (woId !== null) loadData(); }, [woId, loadData]);

  // Flatten into one entry per physical label.
  const labels: { key: string; item: LabelItem; idx: number; total: number }[] = [];
  items.forEach((it) => {
    for (let k = 0; k < it.copies; k++) {
      labels.push({ key: `${it.item_id}-${k}`, item: it, idx: k + 1, total: it.copies });
    }
  });
  const qrUrl = origin ? `${origin}/m/wo/${woId}` : "";

  // Build a hard-sized 50×25mm PDF and hand it to the GT800 driver. A PDF page
  // pins the geometry the way an MS Access report does — Chrome's HTML print
  // would not honour the label pitch and straddled two physical labels.
  const generatePdf = () => {
    if (!labels.length || !qrDataUrl) return;
    const W = 50, H = 25, PAD = 1.5;        // mm — physical label, landscape
    const QR = 20;                          // mm QR box
    const qrX = W - PAD - QR;
    const qrY = (H - QR) / 2;
    const textW = qrX - PAD - 1;            // left text column width

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [W, H] });

    labels.forEach(({ item, idx, total }, i) => {
      if (i > 0) doc.addPage([W, H], "landscape");

      doc.addImage(qrDataUrl, "PNG", qrX, qrY, QR, QR);

      let y = PAD + 2.4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(`JOB ${jobNumber || "—"} · WO ${woId}`, PAD, y);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const nameLines = (doc.splitTextToSize(item.description || "(no description)", textW) as string[]).slice(0, 3);
      y += 3.6;
      nameLines.forEach((ln) => { doc.text(ln, PAD, y); y += 3.6; });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      if (isPaintOrCover && item.finish_required && item.finish_required.trim() !== "") {
        doc.text((doc.splitTextToSize(item.finish_required, textW) as string[])[0], PAD, y);
        y += 3.2;
      }
      if (item.qtyOverflow) {
        doc.text(`Qty ${item.qtyOverflow}${item.unit ? ` ${item.unit}` : ""}`, PAD, y);
      }

      if (total > 1) {
        doc.setFontSize(6);
        doc.text(`${idx} / ${total}`, PAD, H - PAD);
      }
    });

    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        <Loader2 className="h-5 w-5 animate-spin" /> <span style={{ marginLeft: 8 }}>Loading labels…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#b00" }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#000" }}>
      <style>{LABEL_CSS}</style>

      {/* Toolbar — never printed */}
      <div className="no-print" style={{ position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #e5e5e5", padding: "12px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <Tags className="h-5 w-5" />
          {labels.length} label{labels.length === 1 ? "" : "s"}
          <span style={{ fontWeight: 400, color: "#666" }}>
            · Job {jobNumber || "—"} · WO {woId}{activity ? ` · ${activity}` : ""}
          </span>
        </div>
        <button
          onClick={generatePdf}
          disabled={labels.length === 0 || !qrDataUrl}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: (labels.length && qrDataUrl) ? "#1f2a44" : "#aaa", color: "#fff", border: "none", cursor: (labels.length && qrDataUrl) ? "pointer" : "default", fontSize: 14 }}
        >
          <Printer className="h-4 w-4" /> Print labels (PDF)
        </button>
        <span style={{ fontSize: 12, color: "#888" }}>
          Opens a 50×25 mm PDF → print to the GT800 at <b>Actual size</b> (not Fit)
        </span>
      </div>

      {labels.length === 0 ? (
        <div style={{ padding: 40, color: "#666", maxWidth: 520 }}>
          No job items are linked to this work order yet. Link items to the WO on the
          scope page, then come back and print labels.
        </div>
      ) : (
        <div className="sheet">
          {labels.map(({ key, item, idx, total }) => (
            <div className="label" key={key}>
              <div className="label-inner">
              <div className="label-left">
                <div className="label-meta">JOB {jobNumber || "—"} · WO {woId}</div>
                <div className="label-name">{item.description || "(no description)"}</div>
                {isPaintOrCover && item.finish_required && item.finish_required.trim() !== "" && (
                  <div className="label-finish">{item.finish_required}</div>
                )}
                {item.qtyOverflow && (
                  <div className="label-finish">Qty {item.qtyOverflow}{item.unit ? ` ${item.unit}` : ""}</div>
                )}
                {total > 1 && <div className="label-count">{idx} / {total}</div>}
              </div>
              <div className="label-qr">
                {qrUrl && <QRCodeSVG value={qrUrl} size={78} level="M" />}
              </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const LABEL_CSS = `
  .sheet {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 16px;
  }
  .label {
    width: 2in;
    height: 1in;
    box-sizing: border-box;
    overflow: hidden;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    border: 1px dashed #c4c4c4; /* preview only — removed on print */
  }
  .label-inner {
    width: 2in;
    height: 1in;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 0.06in;
    padding: 0.06in 0.08in;
    background: #fff;
  }
  .label-left { flex: 1 1 auto; min-width: 0; }
  .label-qr { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; }
  .label-meta { font-size: 7pt; letter-spacing: 0.02em; line-height: 1.1; }
  .label-name {
    font-size: 12pt;
    font-weight: 700;
    line-height: 1.05;
    margin-top: 1px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }
  .label-finish { font-size: 8pt; font-weight: 600; line-height: 1.1; margin-top: 1px; }
  .label-count { font-size: 7pt; margin-top: 1px; }
  /* This page is a preview; real printing goes through the 50x25mm PDF
     (Print labels button). Browser printing of the HTML is not used. */
  @media print {
    .no-print { display: none !important; }
  }
`;
