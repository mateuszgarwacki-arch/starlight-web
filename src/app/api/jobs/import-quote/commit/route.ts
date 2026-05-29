// Intended path: src/app/api/jobs/import-quote/commit/route.ts
//
// STEP 2 of 2 — commit. Runs only after the human has reviewed/edited the extracted data.
// Saves the PDF to OneDrive in the SAME place as the rest of the job's files, then does the
// atomic job + quote + lines (+ document) insert via the import_quote() Postgres function
// (already deployed). The quote PDF is recorded in tbl_wo_documents as a job-level
// `reference` doc, and the confirmed extraction is stored in extracted_data as an audit trail.
//
// Multipart body:
//   file    — the original PDF (the browser still has it from step 1)
//   payload — JSON string: the reviewed ExtractedQuote PLUS job.job_number (user-entered)
//             and optional job.job_status / quote.status.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { uploadFile } from "@/lib/microsoft-graph";

export const runtime = "nodejs";
export const maxDuration = 60;

// created_by / imported_by / uploaded_by = the signed-in user's tbl_freelancers.freelancer_id.
// Your DB already exposes get_my_freelancer_id() / user_freelancer_id() for JWT-bearing calls;
// this server route uses the service key, so the app's session layer should tell it who's
// acting. Until that's wired, it falls back to DEFAULT_IMPORT_FREELANCER_ID (set this to 5 —
// Mateusz — while you're the admin operating it).
async function getCurrentFreelancerId(_req: NextRequest): Promise<number | null> {
  // ADAPT: resolve from your session, e.g. look up tbl_freelancers by the authed user's email.
  const fallback = process.env.DEFAULT_IMPORT_FREELANCER_ID;
  return fallback ? Number(fallback) : null;
}

// Matches your existing OneDrive convention exactly:
//   Workshop/{job_number}-{job-name-slug}/{Category}/{file}
// e.g. Workshop/13585-Summer-Solstice-2026/Drawings/...  ->  here the category is "Quotes".
function slug(s: string): string {
  return s.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function uploadQuoteToOneDrive(args: {
  buf: Buffer;
  jobNumber: string;
  jobName: string;
  quoteRef: string | null;
  quoteVersion: string | null;
}): Promise<{ onedrive_path: string; onedrive_item_id: string | null; file_name: string }> {
  const fileName = `Quote-${slug(args.quoteRef ?? "quote")}${args.quoteVersion ? "-" + slug(args.quoteVersion) : ""}.pdf`;
  const jobFolder = `${slug(args.jobNumber)}-${slug(args.jobName)}`;
  const folder = `Workshop/${jobFolder}/Quotes`;
  const onedrive_path = `${folder}/${fileName}`;

  // Upload via the app's server-side MS Graph helper (same one used for drawings/cut-lists).
  // Graph's path-based PUT auto-creates intermediate folders, so no folder-creation call needed.
  const ab = args.buf.buffer.slice(
    args.buf.byteOffset,
    args.buf.byteOffset + args.buf.byteLength
  ) as ArrayBuffer;
  const { id } = await uploadFile(folder, fileName, ab, "application/pdf");
  return { onedrive_path, onedrive_item_id: id, file_name: fileName };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const payloadRaw = form.get("payload");
    if (!(file instanceof File) || typeof payloadRaw !== "string") {
      return NextResponse.json({ error: "Expected multipart 'file' and 'payload'." }, { status: 400 });
    }

    const payload = JSON.parse(payloadRaw);
    const jobNumber: string | undefined = payload?.job?.job_number;
    if (!jobNumber) {
      return NextResponse.json({ error: "job.job_number is required." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const uploadedBy = await getCurrentFreelancerId(req);

    // 1) Save the PDF to OneDrive (same place as the rest of the job's files).
    const buf = Buffer.from(await file.arrayBuffer());
    const doc = await uploadQuoteToOneDrive({
      buf,
      jobNumber,
      jobName: payload.job.job_name ?? jobNumber,
      quoteRef: payload.quote?.quote_reference ?? null,
      quoteVersion: payload.quote?.quote_version ?? null,
    });

    // 2) Atomic insert via the Postgres function. The document (incl. the confirmed
    //    extraction for audit) travels in the same payload, so it commits with the job.
    const { extracted_data_audit, ...core } = {
      extracted_data_audit: {
        quote: payload.quote,
        lines: payload.lines,
        source_totals: payload.source_totals,
        assumptions: payload.assumptions,
      },
      job: payload.job,
      quote: payload.quote,
      lines: payload.lines,
    };

    const { data, error } = await supabase.rpc("import_quote", {
      payload: {
        ...core,
        document: {
          ...doc,
          file_size: buf.length,
          mime_type: "application/pdf",
          caption: "Imported quote",
          extraction_status: "confirmed",
          extracted_data: extracted_data_audit,
        },
      },
      p_uploaded_by: uploadedBy,
    });

    if (error) {
      // NOTE: the OneDrive file is now orphaned if this fails. Optionally delete it here.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ...data });
  } catch (err: any) {
    console.error("import-quote/commit failed:", err);
    return NextResponse.json({ error: err?.message ?? "Commit failed." }, { status: 500 });
  }
}
