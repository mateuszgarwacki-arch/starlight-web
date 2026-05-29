# Quote import — automated "Add new job" from a PDF

Upload a quote when adding a job → it's parsed by Sonnet into your exact schema → you review
the pre-filled fields → commit saves the PDF to OneDrive and inserts the job, quote, and all
lines in one transaction. Same result as the manual job-13812 import, on a button.

## The core idea

Doing 13812 by hand cost a lot of *thinking*: reading your schema, studying past quotes to
learn the zone/sub-group/category conventions, reconciling totals. **None of that needs to
happen again.** That was one-time discovery. The conventions are now baked into a static
prompt (`prompt.ts`) plus one worked example. At runtime the model does only the single
irreducible step — read this PDF, map it to the schema — and everything else is plain code.

```
Add Job modal
   │  upload PDF + type job number
   ▼
/extract  ──►  pdf-parse → text  ──►  Sonnet 4.6 (cached prompt + JSON schema, temp 0)
   │                                         │
   │                                         ▼
   │                              validated JSON + reconciliation + assumptions
   ▼
review/edit in the modal  (the "semi-manual" step)
   │  confirm
   ▼
/commit  ──►  save PDF to OneDrive  ──►  import_quote() rpc  ──►  job + quote + lines (atomic)
```

## Why it gives the same result every time — four levers

1. **Fixed model snapshot** — `claude-sonnet-4-6` is a pinned snapshot, not an evergreen
   alias. The weights don't shift under you.
2. **`temperature: 0`** — deterministic decoding.
3. **Structured Outputs (JSON mode)** — the schema is compiled to a grammar and the model is
   *constrained* to emit schema-valid JSON. No "please return JSON," no `JSON.parse` failures,
   no missing fields, no invented `category` values. GA on Sonnet 4.6; no beta header. (It's
   also ZDR — your client/quote data isn't retained.)
4. **One cached, worked example** — `prompt.ts` carries the full WHPS mapping you approved.
   The model pattern-matches against a concrete correct answer, not just rules.

On top of those, the **reconciliation banner** + **assumptions list** are the human safety
net: the UI checks the sum of extracted lines against the quote's printed total and surfaces
every judgement the model made before anything is written.

## Token economics — and why the rich prompt is basically free

The big static block (`prompt.ts`, ~3–4k tokens) is sent with `cache_control`, so it's
**written to cache once (1.25×) then read at 0.1×** on every later call. The JSON-schema
grammar is cached separately for 24h. So the only per-call cost that scales is the variable
part: the PDF text in, and the JSON out.

Rough per-quote cost on Sonnet 4.6 (warm cache; $3/M in, $15/M out, cache read $0.30/M —
current May 2026, see https://platform.claude.com/docs/en/about-claude/pricing):

| Component | Tokens | Cost |
|---|---|---|
| Cached prompt + example (read) | ~3,500 | ~£0.001 |
| PDF text in (a 4-page quote) | ~1,500 | ~£0.005 |
| JSON out (~21 lines) | ~1,800 | ~£0.027 |
| **Total** | | **~£0.03** |

Output dominates, not the prompt — which is exactly why it's fine to keep a long, complete
worked example in the cached prefix. Keeping the prompt and the schema **byte-stable** is what
keeps the cache warm; any edit triggers one cache re-write. Watch `cache_read_input_tokens`
in the `usage` the `/extract` route returns to confirm you're getting hits.

## Files

| File | Goes to | What it is |
|---|---|---|
| `prompt.ts` | `src/lib/quote-import/` | **The knowledge.** Canonical runtime system prompt + WHPS example. |
| `extraction.prompt.md` | (docs) | Annotated/explained version of the same prompt. |
| `schema.ts` | `src/lib/quote-import/` | JSON schema (for `output_config.format`), TS types, Zod re-validation, `reconcile()`. |
| `import-quote.extract.route.ts` | `src/app/api/jobs/import-quote/extract/route.ts` | PDF → validated JSON preview. |
| `import-quote.commit.route.ts` | `src/app/api/jobs/import-quote/commit/route.ts` | OneDrive save + atomic insert. |
| `import_quote.function.sql` | run once on the DB | The atomic `import_quote()` Postgres function. |
| `AddJobWithQuote.tsx` | `src/components/jobs/` | Upload → review → commit UI (restyle to your design system). |

## Setup

```bash
npm i @anthropic-ai/sdk pdf-parse zod
```

Env:
```
ANTHROPIC_API_KEY=...
SUPABASE_URL=...                 # you likely already have these
SUPABASE_SERVICE_ROLE_KEY=...    # server-only; never ship to the client
DEFAULT_IMPORT_FREELANCER_ID=5   # fallback "created_by" until the route reads the session (5 = Mateusz)
```

The `import_quote()` Postgres function is **already deployed** to your project
(`qbdnoueqkmhznqzpkvos`) and verified end-to-end. `import_quote.function.sql` is the source of
record if you ever need to re-apply or review it.

## Wiring points (the `ADAPT:` markers)

Only two things remain, both in `commit/route.ts`:

- **`uploadQuoteToOneDrive(...)`** → drop in your existing MS Graph upload helper (the one that
  already files drawings/cut-lists). The path is now exact and matches your convention:
  `Workshop/{job_number}-{job-name-slug}/Quotes/{file}` — e.g.
  `Workshop/13585-Summer-Solstice-2026/Quotes/Quote-40988-v16.pdf`. The slug logic (spaces →
  hyphens) is already in the file; you just need the actual upload call that creates the folder
  and returns the driveItem id.
- **`getCurrentFreelancerId(req)`** → for now it reads `DEFAULT_IMPORT_FREELANCER_ID` (set it to
  `5`, you). When you want true per-user attribution, resolve the signed-in user here — your DB
  already has `get_my_freelancer_id()` / `user_freelancer_id()` for JWT-bearing calls, or look up
  `tbl_freelancers` by the authed email.

Then **mount `AddJobWithQuote`** in your Add-Job modal (e.g. an "Import from quote" tab).

Supabase service client / `createClient` is also a swap-for-your-existing-helper, but works as-is
with the env vars above.

## Decisions baked in (flip any of these)

1. **Category convention** = the one you approved on 13812: Lighting→`Lighting`, Sound→`Sound`,
   AV/Video→`Provisional`, in-house build→`Workshop`, own stock→`Stock Pick`, crew→`Install`,
   subcontracted labour→`Subcontracted`, transport→`Install`. To change it, edit the mapping in
   `prompt.ts` and the worked example, and the `enum` in `schema.ts`.
2. **Quote PDF stored in `tbl_wo_documents`** as a job-level `reference` doc (scope_item_id /
   work_order_id NULL) — the convention your other docs already use. (Not `tbl_job_attachments`,
   which is empty and lacks the OneDrive columns.)
3. **New quote status = `Draft`, job status = `Active`** by default. The review form can set
   these; or flip the defaults in `import_quote.function.sql`.

## Scanned / image-only PDFs

`pdf-parse` only reads text PDFs (your quoting software emits those, so this is the normal
path). If a scanned PDF ever comes through, `/extract` returns 422. The fallback is to send the
PDF itself as a document block to the same model instead of extracted text — same prompt, same
schema — at a higher token cost (pages are rasterised). Easy to add as a branch when needed.

## What an import creates (heads-up on your triggers)

Inserting the job fires your existing app automation, so one import produces: the **job**, an
auto **"Job Overhead"** line (`quote_id` NULL, sequence 0) with its overhead **scope item** and
**work order**, then your **quote** with its lines numbered 1…N, and the **quote PDF** document
row. That's the same behaviour as creating a job by hand today — just confirming it so the extra
overhead line in the list isn't a surprise.

## Backfilling old jobs

To import a stack of historical quotes at once, run the same `/extract` logic through the
**Batch API** (50% cheaper, async < 24h) and write the results straight in — skip the review
UI, or queue them for a quick bulk review. Same prompt, same schema.
