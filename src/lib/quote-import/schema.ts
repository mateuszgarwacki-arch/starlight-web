// quote-import/schema.ts
//
// The extraction contract. One schema, three jobs:
//   1. QUOTE_JSON_SCHEMA  -> sent to the API as output_config.format (grammar-constrained).
//   2. ExtractedQuote      -> the TypeScript shape the rest of the app consumes.
//   3. extractedQuoteZod   -> server-side re-validation (shape is guaranteed by the API,
//                             but we still sanity-check semantics: non-empty text, valid
//                             date shape, enum category. Values may be negative (discounts).
//
// Schema design notes (from the structured-outputs docs):
//   - EVERY property is listed in `required`; optionality is expressed with nullable
//     union types (["string","null"]). This keeps the "optional parameters" budget at 0
//     and makes output property order deterministic.
//   - additionalProperties:false on every object (required by the feature).
//   - ~12 union-typed properties total — under the hard limit of 16. If you add nullable
//     fields, watch that ceiling.
//   - `category` is an enum so the model can never invent a category value.
//   - Keep this object byte-stable: changing it recompiles the grammar (24h cache) AND
//     invalidates the prompt cache for the request.

import { z } from "zod";

export const QUOTE_CATEGORIES = [
  "Workshop",
  "Provisional",
  "Subcontracted",
  "Install",
  "Stock Pick",
  "Lighting",
  "Sound",
  "Production",
  "General",
] as const;

export const QUOTE_JSON_SCHEMA = {
  type: "json_schema",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["job", "quote", "lines", "source_totals", "assumptions"],
    properties: {
      job: {
        type: "object",
        additionalProperties: false,
        required: ["job_name", "event_date", "event_location", "pm_note"],
        properties: {
          job_name: { type: "string", description: "Event/job title, cleaned." },
          event_date: {
            type: ["string", "null"],
            description: "ISO YYYY-MM-DD of the first/primary event day, or null.",
          },
          event_location: { type: ["string", "null"], description: "Venue name, or null." },
          pm_note: {
            type: ["string", "null"],
            description: "One-line schedule/assumptions summary from the preamble, or null.",
          },
        },
      },
      quote: {
        type: "object",
        additionalProperties: false,
        required: ["quote_reference", "quote_version", "quote_description"],
        properties: {
          quote_reference: { type: ["string", "null"], description: 'e.g. "40988".' },
          quote_version: { type: ["string", "null"], description: 'e.g. "v16".' },
          quote_description: { type: ["string", "null"] },
        },
      },
      lines: {
        type: "array",
        description: "One object per real line item. No subtotals, no VAT, no grand total.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["line_text", "line_value", "event_zone", "line_sub_group", "category", "pm_note"],
          properties: {
            line_text: { type: "string" },
            line_value: { type: "number", description: "Ex-VAT amount, plain number." },
            event_zone: { type: ["string", "null"], description: "Room/space, or null." },
            line_sub_group: { type: ["string", "null"], description: "Discipline." },
            category: { type: "string", enum: [...QUOTE_CATEGORIES] },
            pm_note: { type: ["string", "null"], description: "Equipment spec/note, or null." },
          },
        },
      },
      source_totals: {
        type: "object",
        additionalProperties: false,
        required: ["net_ex_vat", "vat", "gross_inc_vat"],
        properties: {
          net_ex_vat: { type: ["number", "null"] },
          vat: { type: ["number", "null"] },
          gross_inc_vat: { type: ["number", "null"], description: 'Maps the "Nett Total" figure.' },
        },
      },
      assumptions: {
        type: "array",
        description: "Plain-English flags for every inference/cleanup made.",
        items: { type: "string" },
      },
    },
  },
} as const;

// ---- TypeScript shape -------------------------------------------------------

export type QuoteCategory = (typeof QUOTE_CATEGORIES)[number];

export interface ExtractedQuoteLine {
  line_text: string;
  line_value: number;
  event_zone: string | null;
  line_sub_group: string | null;
  category: QuoteCategory;
  pm_note: string | null;
}

export interface ExtractedQuote {
  job: {
    job_name: string;
    event_date: string | null;
    event_location: string | null;
    pm_note: string | null;
  };
  quote: {
    quote_reference: string | null;
    quote_version: string | null;
    quote_description: string | null;
  };
  lines: ExtractedQuoteLine[];
  source_totals: {
    net_ex_vat: number | null;
    vat: number | null;
    gross_inc_vat: number | null;
  };
  assumptions: string[];
}

// ---- Server-side re-validation (semantics, not shape) -----------------------

export const extractedQuoteZod = z.object({
  job: z.object({
    job_name: z.string().min(1),
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    event_location: z.string().nullable(),
    pm_note: z.string().nullable(),
  }),
  quote: z.object({
    quote_reference: z.string().nullable(),
    quote_version: z.string().nullable(),
    quote_description: z.string().nullable(),
  }),
  lines: z
    .array(
      z.object({
        line_text: z.string().min(1),
        // No .min(0): discount lines are legitimately negative (e.g. a "-£2,770" discount
        // line that reconciles the sum of items to the printed Nett Total). reconcile()
        // is the real semantic guard — a hallucinated sign won't match the printed total.
        line_value: z.number(),
        event_zone: z.string().nullable(),
        line_sub_group: z.string().nullable(),
        category: z.enum(QUOTE_CATEGORIES),
        pm_note: z.string().nullable(),
      })
    )
    .min(1),
  source_totals: z.object({
    net_ex_vat: z.number().nullable(),
    vat: z.number().nullable(),
    gross_inc_vat: z.number().nullable(),
  }),
  assumptions: z.array(z.string()),
});

// ---- Reconciliation: does the sum of lines match the printed total? ---------

export interface Reconciliation {
  computedNet: number;
  computedVat: number;
  computedGross: number;
  statedNet: number | null;
  statedGross: number | null;
  /** true when computed gross is within 1p of either printed total. */
  matches: boolean;
  deltaGross: number | null;
}

export function reconcile(q: ExtractedQuote, vatRate = 0.2): Reconciliation {
  const computedNet = Math.round(q.lines.reduce((s, l) => s + l.line_value, 0) * 100) / 100;
  const computedVat = Math.round(computedNet * vatRate * 100) / 100;
  const computedGross = Math.round((computedNet + computedVat) * 100) / 100;
  const statedNet = q.source_totals.net_ex_vat;
  const statedGross = q.source_totals.gross_inc_vat;
  const target = statedGross ?? (statedNet != null ? Math.round(statedNet * (1 + vatRate) * 100) / 100 : null);
  const deltaGross = target != null ? Math.round((computedGross - target) * 100) / 100 : null;
  const matches = deltaGross != null ? Math.abs(deltaGross) <= 0.01 : true;
  return { computedNet, computedVat, computedGross, statedNet, statedGross, matches, deltaGross };
}
