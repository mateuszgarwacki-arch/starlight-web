// Intended path: src/app/api/jobs/import-quote/extract/route.ts
//
// STEP 1 of 2 — extract only. Takes the uploaded PDF, returns the parsed/validated quote
// for the human to review. Touches NO storage and NO database. The user reviews, edits,
// then calls the /commit route.
//
// This is where the one intelligent step happens, with all four consistency levers on:
//   1. model: "claude-sonnet-4-6"  — a fixed snapshot, not an evergreen alias.
//   2. temperature: 0              — deterministic decoding.
//   3. output_config.format        — grammar-constrained JSON; the shape can't drift.
//   4. system[].cache_control      — the big static prompt+example is cached (read at 0.1x).
//
// Per-call variable cost is tiny: only the PDF *text* (~1-2k tokens) in, and compact
// JSON (~1-2k tokens) out. The 4-page WHPS quote ran ~£0.02-0.03 all-in.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { QUOTE_JSON_SCHEMA, extractedQuoteZod, reconcile, type ExtractedQuote } from "@/lib/quote-import/schema";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/quote-import/prompt";

export const runtime = "nodejs"; // pdf-parse needs Node, not the edge runtime
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function pdfToText(buf: Buffer): Promise<string> {
  // Import the lib entry directly, NOT "pdf-parse". The package's index.js runs a debug
  // block at import time that reads a bundled sample PDF (./test/data/05-versions-space.pdf),
  // which throws ENOENT under Next's server bundler. lib/pdf-parse.js is the same
  // implementation without that wrapper.
  // @ts-ignore — no type declaration for the deep path; identical call shape to the package root.
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (data: Buffer) => Promise<{ text: string }>;
  const { text } = await pdfParse(buf);
  return text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded under field 'file'." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const quoteText = await pdfToText(buf);

    // Image-only / scanned PDFs extract no usable text. Bail clearly; the fallback is to
    // send the PDF itself as a document block (see README "Scanned PDFs").
    if (quoteText.length < 40) {
      return NextResponse.json(
        { error: "Could not extract text from this PDF (it may be scanned/image-only)." },
        { status: 422 }
      );
    }

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192, // generous: large quotes emit a lot of line objects
      temperature: 0,
      // The static instruction block is cached. Order matters: cacheable content first,
      // cache_control on the last cached block.
      system: [
        {
          type: "text",
          text: EXTRACTION_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      // Only the variable part goes in the message — keep it lean.
      messages: [{ role: "user", content: `Quote text:\n\n${quoteText}` }],
      // GA structured outputs: grammar-constrained JSON, no beta header required.
      // Cast keeps this compiling on SDK versions whose types predate output_config.
      ...({ output_config: { format: QUOTE_JSON_SCHEMA } } as any),
    });

    if (msg.stop_reason === "refusal") {
      return NextResponse.json({ error: "The model refused this request." }, { status: 422 });
    }
    if (msg.stop_reason === "max_tokens") {
      return NextResponse.json(
        { error: "Output was truncated. Raise max_tokens and retry." },
        { status: 502 }
      );
    }

    const textBlock = msg.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No text block in model response." }, { status: 502 });
    }

    // Shape is guaranteed by the grammar; we still re-validate semantics defensively.
    const parsed = extractedQuoteZod.parse(JSON.parse(textBlock.text)) as ExtractedQuote;
    const reconciliation = reconcile(parsed);

    return NextResponse.json({
      extracted: parsed,
      reconciliation,
      usage: {
        input_tokens: msg.usage.input_tokens,
        output_tokens: msg.usage.output_tokens,
        cache_read_input_tokens: (msg.usage as any).cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: (msg.usage as any).cache_creation_input_tokens ?? 0,
      },
    });
  } catch (err: any) {
    console.error("import-quote/extract failed:", err);
    return NextResponse.json({ error: err?.message ?? "Extraction failed." }, { status: 500 });
  }
}
