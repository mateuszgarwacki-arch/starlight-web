# Starlight Web App — Development Tracker

## 🧹 Cleanup Backlog

Running list of known debt, deferred work, and small follow-ups. Reviewed at the start of every session. Items are added whenever a session ships something with a known deferral or a correctness bug that we chose not to fix in-flight. Order roughly reflects priority — top items are the ones to do next. Check items off as they ship; move completed ones to the relevant session entry.

### Correctness (do first)

*No open correctness items.*

### Small/mechanical (easy wins)

- [ ] **Share-flow size threshold** *(S40c, conditional)* — if 50MB+ PDF shares feel slow in real use, add a size check that falls back to URL-share for files >20MB. Don't ship pre-emptively.
- [ ] **Close report — completer name for admin users** *(S41)* — `completed_by` is INT FK to `tbl_freelancers` and resolves NULL for admin sessions (Mateusz's primary `@starlightdesign.co.uk` login has no freelancer row). The audit log still captures the actual auth UUID, but the report's "Completed by [name]" line is blank. Server-side enrichment from `auth.users.raw_user_meta_data->>'name'` would close this. ~10 min.
- [ ] **Enable leaked password protection** *(S46f)* — Supabase Dashboard → Authentication → Policies → toggle on. HaveIBeenPwned integration. 30 seconds, blocks compromised passwords on freelancer signup. Manual step (no migration possible).

### Features deferred

- [ ] **`cancellation_reason` on `tbl_freelancer_schedule`** *(S49b, watcher)* — pass-2 spec originally called for this column to suppress no-show flags when a booking is cancelled. Deferred because existing affordances cover the cancellation case (Remove button on the dialog deletes the row entirely; flipping status to `Declined` or `Unavailable` excludes the row from the detector's candidate set). If real false-flag pressure shows up — i.e., PMs find themselves dismissing `timesheet_no_show` flags from `tbl_timesheet_flags` because the booking should have been cancelled but the row wasn't removed/restatused — add the column. One-line ALTER + a `WHERE cancellation_reason IS NULL` clause in the `booked` CTE of `rpc_detect_timesheet_gaps`. UI side: a small "Mark cancelled" affordance on the inline calendar dialog, separate from Remove (so the booking row stays as reliability data).

- [ ] **Consolidate workshop-quote definition into a shared view** *(S45c)* — "workshop + stock quoted" (category text contains `workshop` / `stock pick` / `stock-and-hire`) is now computed in two places: the `quote_workshop` CTE in `rpc_job_close_report` and the `workshopCats` filter in `cost-breakdown.tsx`. They must stay in lockstep. If this rule is touched again, pull it into a view (e.g. `qry_job_workshop_quote`) as the single source of truth and have both consumers read it.

- [ ] **"No Accepted quote" guard on Complete** *(S45a)* — three separate "Quoted shows £0 on close report" bugs to date (S41 NULL value, S42b duplicate Accepted, S45a stuck in `Issued`). Add a soft warning in the Job Complete dialog when the job has no `status='Accepted'` quote — and/or a watcher view listing Complete jobs with no Accepted quote. Soft signal only, doesn't block the close.

- [ ] **`/reports/job-financial/[jobId]` — workshop margin** *(S45b)* — the job-close report now computes margin against `quoted_workshop`. The separate job-financial report wasn't checked this session; it may still show margin against the full quote total. Verify and apply the same `quoted_workshop` treatment if so.

- [ ] **Fixings traveller pick-list section** *(S44b)* — fixings currently render inline with the scope BOM table. The WO traveller print should surface them as their own "Fixings & Consumables" section near the front of the packet, formatted as a checkbox shopping list. NULL-qty rows prefix `☐ Item`; counted rows show `☐ 12 × Item`. Group with section header. This is the actual operational deliverable — the data model exists to feed it.

- [ ] **WO-level fixings** *(S44b)* — current flow lands fixings at scope level (`work_order_id IS NULL`). For per-activity fixings (e.g. the FINISH WO needs sandpaper that the BUILD WO doesn't), a follow-up could route to the WO's own BOM. Probably YAGNI until a real case surfaces — scope-level is the common case.

- [ ] **Mobile fixings pick-list UX** *(S44b)* — fixings will render through the existing BOM section on `/m/wo/[woId]`, but a dedicated checkbox-style "shopping list" UX hasn't been built on the freelancer surface yet. Should be a separate panel/card, ticked off as items are gathered. Persistence of the tick state is a separate question (per-freelancer-per-WO checklist state).

- [ ] **Job 13809 actual costs** *(S43, in-flight)* — quote backfilled, but the £12,010 has no actuals against it yet. Mateusz to add invoices and any retrospective time entries. Once complete he'll close the job via the existing Job Complete flow.

- [ ] **Backfill proposal rows for legacy Complete WOs** *(S43, low-urgency)* — the 21 WOs already in `Complete` status pre-date the proposal table, so they have no row in `tbl_wo_completion_proposals` and won't appear in the `/review` Confirm panel. Correct behaviour today (they were closed via the old direct-update path). Worth a one-off backfill only if record-keeping consistency becomes a felt need.

- [ ] **Click-to-edit extension to `/m/wo/[woId]` and `/m/schedule`** *(S42e)* — `EditTimeEntrySheet` and `EditTaskSheet` are already shared components; wiring them into the two remaining mobile surfaces is ~20 min each. Defer until a freelancer actually surfaces a request to edit from those screens (current dominant path is `/m/me`).

- [ ] **`reconciled_line_cost` field cleanup** *(S42a)* — the old single-value material cost field is still read by `cost-breakdown.tsx` (and possibly elsewhere). Now redundant given Plan/Actual/Committed split. Sweep all reads, kill the field's view-side source, retire from UI.

- [ ] **Invoice → BOM line linkage** *(S42a, strategic)* — the deep prerequisite for AI estimating: when an invoice is allocated to a scope, we should be able to map the line back to specific BOM rows and populate `tbl_wo_bom.actual_unit_cost`. Currently `actual_unit_cost` is a latent column (no write path). Building the link is non-trivial because allocations are percentage-split today, not item-level. Worth a design pass before implementation.

- [ ] **Actual material breakdown by category/supplier on job-close** *(S42a)* — RPC now has the data; the close report still only shows category-level **planned** material breakdown. Should also show actual where allocations exist.

- [ ] **Delete proposals on time-entry edits** *(S42e-2)* — same `tbl_wo_time_entry_edits` table can carry a `proposed_action='delete'` mode. Only worth shipping when a real "I logged this twice and need it removed" case comes up; until then, the workaround is propose 0h which functionally archives.

- [ ] **`budget_allowance` read-site cleanup** *(S42c)* — 4 surfaces still read this dead field (`/pm/jobs/[id]`, review pages, handover, job-close). Cosmetic; jobs page already swapped to live `qry_job_accepted_quote`. Sweep and kill in a quiet session.

- [ ] **Auto-complete active WOs on Job Complete** *(S41)* — option 3 from the Tramp Club Dancing podium discussion. Add a checkbox to the Job Complete dialog: "Also mark N active WO(s) Complete" (checked by default when active non-OVERHEAD WOs exist). Bypasses the WO-completion photo requirement, which is the right tradeoff for retro-closing old jobs but should be visible in the audit log (e.g. `closed_via='job_complete'` flag on the WO update). Worth ~15 min.

- [ ] **Handover — PDF drawing rendering** *(S39, dep now in place via S48b)* — image drawings render full-page inline; PDF drawings currently show a fallback "Open PDF" box. `react-pdf` + `pdfjs-dist` + self-hosted worker (`public/pdf.worker.min.mjs`) all shipped in S48b. `src/components/pdf-thumb.tsx` is the pattern starting point — needs adapting from single-page render to multi-page print render (iterate `numPages`, render each `<Page>` at print scale, 2× DPR for crisp output). Applies to `DrawingPage` in `/reports/handover/[jobId]/page.tsx`. Probably 30 min now that the infrastructure is in.

- [ ] **PDF thumbnail aspect-aware sizing** *(S48b)* — drawings/references grid container is 176×128 (landscape A-series). Portrait PDFs render top-cropped (page renders at 176 wide → ~250 tall, container overflow-hidden trims to 128). Usually fine because title blocks live at the top, but identifying info mid-page on a portrait drawing gets cut. Either compute container height per page aspect via react-pdf's `onLoadSuccess` callback, or accept the top-crop. Cosmetic.

- [ ] **react-pdf transitive vulnerabilities recheck on upgrade** *(S48b)* — npm audit flags 4 issues in pdf.js text-extraction and annotation code paths. Both paths disabled in our usage (`renderTextLayer={false} renderAnnotationLayer={false}` on every `<Page>`), so no operational risk today. Re-evaluate on each react-pdf version bump.

- [ ] **Handover — persist drawing rotation** *(S39)* — rotation state is currently in-memory only (matches traveller). If a zone has 10 landscape drawings, every session restart means re-rotating. Add `rotation INT DEFAULT 0` on `tbl_handover_zone_documents` and persist on rotate. One small migration + a PATCH on the handler.

- [ ] **Handover — activity-aware "built by" verbs** *(S39)* — current label "Hands on:" is universal. If real handover use reads too soft, upgrade to activity-aware verbs: "Built by:" for BUILD, "Painted by:" for PAINT, "Upholstered by:" for COVER, fallback "Hands on:" for anything unmapped. Small verb map maintained as new activities ship. Stronger signature/ownership feel.

- [ ] **Handover — multi-scope scope-name display** *(S39)* — the scope card currently drops `scope.item_name` (it duplicated the line text when there was one scope per line). When a line has 2+ scopes, name differentiation becomes useful again. Either always show `item_name` when it meaningfully differs from `line_text`, or always show it when there are multiple scopes on the line. Not actionable until a real 2-scope line appears on a handover.

- [ ] **Handover — multi-quote job audit** *(S39)* — Tite Street (job 14) is the only multi-quote job. Verify:
  - Job page lists both quotes, cost analysis sums across them.
  - `qry_dash_quote_stats` aggregates correctly.

- [ ] **Author columns on append-only tables** *(S46f)* — 8 tables have INSERT policies with `WITH CHECK (true)` because there's no `created_by` column to bind against: `tbl_job_attachments`, `tbl_maintenance_asset_photos`/`_checks`/`_flags`/`_logs`, `tbl_notifications`, `tbl_workshop_requests`. Add `created_by UUID REFERENCES auth.users(id)` (or `INT REFERENCES tbl_freelancers` where appropriate) and tighten INSERT policy to `created_by = auth.uid()` (or `= get_my_freelancer_id()`). Defense in depth — the SELECT policies already restrict reads, so this isn't critical but it would silence 8 advisor warnings and prevent forged authorship.

- [ ] **Harden `auditedUpdate` against silent zero-row writes** *(S46h)* — the helper currently only catches zero-row-no-error when `expectedUpdatedAt` is provided (optimistic concurrency). Without it, an RLS-blocked UPDATE returns `{ data: null, error: null }` and the caller has no signal. Fix: make `auditedUpdate` always assert that data is non-null (or that count > 0), and return `{ error: 'no rows affected — RLS or missing record' }` otherwise. Then migrate the ~90 raw `supabase.from(X).update(Y).eq(Z)` call sites in `src/` to `auditedUpdate` (or a lighter `verifiedUpdate` if they don't need audit logging). Big sweep — defer until there's a quiet session.

- [ ] **Lint rule for raw `.update()` / `.delete()`** *(S46h)* — add an ESLint custom rule (or pre-commit grep in `scripts/db-checks.sql`'s sibling) that fails on `supabase.from(...).update(` or `.delete(` outside of `lib/audit.ts`. Forces all writes through the helper. Pairs with the harden-`auditedUpdate` task — do them together.

- [ ] **`tbl_wo_bom` raw inserts in cutlist-extractor** *(S51)* — `addToBom` writes BOM rows via raw `supabase.from("tbl_wo_bom").insert(...)` despite `tbl_wo_bom` being in `AUDITED_TABLES`. Pre-existing pattern, not introduced by S51, but visible there. Migrate to `auditedInsert(ctx, "tbl_wo_bom", row, jobId)` for each row in the loop. Pairs naturally with the wider "harden auditedUpdate" and "lint raw .update()/.delete()" sweep below.

- [ ] **Audit gap on workshop requests** *(S47e)* — `handleRequestAction` in `/review/inbox/page.tsx` still uses raw `supabase.from("tbl_workshop_requests").update(...)`. Easy fix once `tbl_workshop_requests` is added to `AUDITED_TABLES` (currently absent). Smaller-stakes than the task gap closed in S47e because workshop requests aren't pay-affecting, but worth tidying when the wider audit sweep happens (pairs naturally with the harden-`auditedUpdate` task above).

### Long-running / strategic

- [ ] **Supabase Pro upgrade** *(carried)* — prerequisite for multi-PM operation. Enables daily backups + PITR. Currently on hobby tier.
- [ ] **GitHub repo transfer** *(carried)* — move from personal account to company account. Low urgency.
- [ ] **AI quoting/estimating agent** *(carried, strategic)* — `tbl_learnings` + Voyage AI embeddings is the foundation. Real build is once close-report data has accumulated across more closed jobs.
- [ ] **Vector extension to `extensions` schema** *(S46e, fresh-setup-only)* — cosmetic INFO advisor warning. Moving requires ALTERing search_path on 4 API roles (`authenticator`/`authenticated`/`anon`/`service_role`, currently only `postgres` has `extensions`) AND coordinating a PostgREST reconnect. 37+ extension-owned operators + the ivfflat index depend on `vector`. Trade-off not worth the breakage surface for a cosmetic warning. If a fresh Supabase project is ever stood up (e.g. company-org transfer), install `vector` into `extensions` from day one.

---

## Session log

### S51 — 27 May 2026

Suggested cut plan on the WO traveller and inside the BOM extractor. Visualises the 1D and 2D bin-packing layouts that the extractor already computes — the algorithms were running, but the placement data was being thrown away after counting sheets/lengths. No schema change, no DB writes. One deploy.

#### Trigger

Mateusz: "On a print traveller — I want to add what is the most efficient way to do cuts for each item/length, take another guess work out of the way."

First-pass advice was "hold off on 2D nesting—too much effort for marginal yield gain." Mateusz pushed back: *"isn't there simple guillotine function?"* Inspection of `cutlist-extractor.tsx` revealed full Best-Short-Side-Fit + Shorter-Axis-Split guillotine packing already implemented for sheet counting, plus First-Fit Decreasing 1D for timber. The algorithms ran and discarded the placements. Visualising what was already computed was a small build, not a from-scratch nesting engine.

#### Design decisions (settled before building)

- **Capture placements; don't persist.** `binPackLengths()` and `guillotinePack()` now return `LengthBin[]` and `{ sheets, placements }` respectively, capturing which piece goes into which bin/sheet and at what offset. Recompute on every render rather than store — algorithm is deterministic and fast (<50ms for typical jobs), and material catalogue changes shouldn't surface stale layouts.
- **Part labels from source.** New `part_label` field on `ExtractedLine`, populated from OpenCutList CSV columns or alphanumeric prefixes on the description ("P1 - upright"). Falls back to truncated description when source has no labels. Carpenter cross-references between traveller diagram and the original cutlist they already know.
- **Compact layout.** Sheets render 2-up at ~88mm width, lengths 1-up at ~180mm. Material header above the grid, sheet number as a small badge in the SVG corner. `break-inside-avoid` on each diagram and on the whole material block so layouts don't split mid-sheet. A typical WO with 6 sheets + 4 lengths lands in roughly half a page.
- **Reference, not instruction.** Section header reads *"Suggested cut plan — verify each sheet/length for defects before cutting. Adjust if needed."* Workshop reality: carpenters will deviate when a sheet has damage. The plan is a starting layout, not a binding spec.
- **Same renderer in two places.** Layout viewer attaches to both extracted and confirmed states of the cutlist extractor (collapsible toggle), and to the traveller (always shown, no toggle). Pure presentational components in `cut-layout-renderer.tsx` driven from the same `MaterialSummary[]` shape.

#### Files

- **`src/lib/cut-layout.ts` (new).** Shared library — types (`ExtractedLine`, `Placement`, `LengthBin`, `MaterialSummary`, `PartRect`, `CatalogueMat`), pure-function calc (`binPackLengths`, `guillotinePack`, `parseSheetSize`, `buildMaterialSummary`, `labelFor`). No React, no Supabase dependency. Lifts the duplicated algorithm out of `cutlist-extractor.tsx` so the traveller can reuse it without coupling.
- **`src/components/cut-layout-renderer.tsx` (new).** Pure SVG components (`SheetLayout`, `LengthBinRow`) plus two wrappers (`MaterialCutPlan` for a single material, `CutPlanSection` for the whole "Suggested cut plan" block). Compact mode controls layout density. Labels scale dynamically with cell size, with minimum and maximum bounds so tight nests stay legible and large parts don't get oversized text.
- **`src/app/api/extract-cutlist/route.ts`.** Prompt updated to extract `part_label` from source documents, with explicit fallback to `null` when no label exists. No schema change — stored in the existing `extracted_data` JSON.
- **`src/components/cutlist-extractor.tsx` (rewritten).** Calc functions removed (now imported from the lib). New `part_label` column in the individual-parts reference table. Layout toggle ("▸ Cut layout preview") in extracted state, collapsible. In confirmed state, the success bar gains an inline "Show cut layout" toggle alongside the existing Re-add-to-BOM control. **Audit gap closed:** the two `tbl_wo_documents` writes (extraction status flip on success, confirmed flip on Add-to-BOM, extracted flip on Re-add) now go through `auditedUpdate(ctx, "tbl_wo_documents", docId, ...)`. The pre-existing raw `tbl_wo_bom` inserts in `addToBom` remain raw — flagged in the cleanup backlog above for the wider audit sweep.
- **`src/app/traveller/page.tsx`.** Full active materials catalogue now fetched once at load time (previously per-WO subsets only) and reused for both BOM enrichment and cut plan computation. Each WO's `WOData` now carries `cutPlanSummaries: MaterialSummary[]`, built from any cut list docs with `extracted_data.lines`. A dedicated cut-plan page is inserted after the source cutlist PDF pages (and before drawings), rendering `<CutPlanSection summaries={data.cutPlanSummaries} compact />` in `flowLayout` mode so it can spill to a second printed page if many sheets/lengths are involved. No change to existing PDF rendering of the source cutlist — the suggested plan sits as its own page in the sequence.

#### Initial placement and refinement (§3 of files above)

First landed in `TaskBrief` after the BOM table, sharing page 1. Mateusz: *"cutlist view should be placed under parts list in print traveller (normally from 3rd page)."* Moved to a dedicated page that follows the source cutlist PDFs in the WO sequence: Task brief → source cutlist PDF(s) → suggested cut plan → drawings → references. Keeps the BOM table and the layout SVGs from competing for page 1 vertical space; carpenter sees the original cutlist first, then the suggested layout immediately after, then drawings.

First dedicated-page version used a single `<Page flowLayout>` with `<CutPlanSection>` inside, relying on `page-break-inside: auto` (via the `traveller-cover` class) to let the content spill across multiple printed pages. On a 33-sheet OSB + 4-sheet plywood job (Summer Solstice 2026, scope 76, WO 209) this spilled onto four printed pages but only the first and last carried the Page chrome (job header / scope description / Step indicator / page footer). Middle two printed pages were bare and the page counter said "4 of 13" on the final cut-plan page while the actual printed total was 16.

Final: split the cut plan into per-page chunks at the JS layer. `cut-layout.ts` gets `buildCutPlanPages(summaries) -> CutPlanPageChunk[]`, slicing each sheet material into pages of 10 sheets (2-up grid) and each timber material into pages of 25 length bins. The traveller renders one `<Page>` per chunk (no flowLayout), so each printed page carries full header/footer chrome and the page counter agrees with reality. First chunk carries the "Suggested cut plan / Verify each sheet…" preamble; subsequent chunks just carry their material header. Anomalies appear on the first chunk of each material only. `cut-layout-renderer.tsx` gets a new `CutPlanPage` component; `CutPlanSection` and `MaterialCutPlan` stay for the live preview inside the BOM extractor (no print path, no chunking needed).

#### Re-extraction note

Cut lists extracted before S51 have `part_label: undefined` in storage. Renderer falls back to `description.slice(0, 12)` so labels still appear, just less concise. To get real source labels on Job 13774 (and others), open each cutlist's extractor and hit Re-extract. Minor inconvenience, not a migration.

#### S51 schema summary

- **0 schema changes**, **0 DB writes** — all client-side calculation
- **2 new files:** `src/lib/cut-layout.ts`, `src/components/cut-layout-renderer.tsx`
- **4 modified files:** `extract-cutlist/route.ts`, `cutlist-extractor.tsx`, `traveller/page.tsx`, `docs/TRACKER.md`
- **Audit gap closed:** `tbl_wo_documents` updates in cutlist-extractor now audited
- **Audit gap remaining (backlog):** `tbl_wo_bom` inserts in `addToBom` still raw
- **Live totals unchanged from S50:** 57 tables, 34 views, 18 RPCs, 2 cron jobs

---

### S50 — 26 May 2026

Scroll-restore on the job detail page + documented tooling/MCP policy. Five deploys, no schema change. The scroll-restore feature took five attempts to ship correctly — two real bugs (SSR hydration trap + race-condition flag) and one design reframe (back-link should anchor to the line, not to the WO/scope tab the user came from).

#### S50a — Hash-anchor + `?tab=` scroll restore from scope/WO → job

**Trigger:** Mateusz: *"when i'm in the job level and clicking work order, do some changes, when i click back to job - can i be taken where i clicked so i don't need to scroll down again to look where were i."*

**Reframe.** Three approaches considered:
1. **Rely on Next.js built-in scroll restoration** — only works for browser back / `router.back()`. The scope page's "Back to Job" is a forward `<Link>` to `/jobs/X` so scroll always resets. Rejected.
2. **`sessionStorage` scroll-position stash** — works but stores ephemeral state and silently breaks if the list re-orders or filters between visits. Rejected.
3. **Hash-anchor + scrollIntoView (shipped)** — deterministic, survives refresh, self-documenting in the URL, no state to manage. The `?expand=` query param already on the scope page tells us whether the user came via a WO row or a scope card.

**Changes shipped (2 files, 1 deploy, 0 schema):**

1. **`src/app/(dashboard)/jobs/[id]/page.tsx`** — `useRef` import; `activeTab` initialiser now reads `?tab=` (`lines | scopes | wo`); a new one-shot `useEffect` (guarded by `didRestoreScroll` ref so it fires exactly once after `loading` flips false) calls `scrollIntoView({ behavior: "instant", block: "center" })` on `window.location.hash`. Anchor IDs `id="scope-{id}"` and `id="wo-{id}"` on the two `<Link>` rows that lead off to scope/WO detail, plus `scroll-mt-24` for breathing room.

2. **`src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx`** — "Back to Job" link is now conditional: if `expandWoId` is set (user arrived via a WO row), href is `/jobs/X?tab=wo#wo-{expandWoId}`; otherwise `/jobs/X?tab=scopes#scope-{scopeId}`. `deleteScope`'s `router.push("/jobs/" + jobId)` left alone — no point anchoring to a row that no longer exists.

**Why `block: 'center'` over `'start'`.** The dashboard layout has a sticky top bar; `'start'` would tuck the row behind it. `'center'` puts the row mid-viewport with context above and below — also why `scroll-mt-24` is largely belt-and-braces here, but harmless.

**Why `behavior: 'instant'` over `'smooth'`.** Snappier, no motion sickness on a long jump down a 50-WO list, and it matches the feel of going back rather than the feel of a guided tour.

**Failure modes.** If the WO/scope row was deleted between leaving and returning (rare given the flow), `querySelector` returns null, `scrollIntoView` silently no-ops, user lands at top. Acceptable. If the user lands on the job page directly via bookmark or sidebar (no `?tab=`, no hash), default behaviour is unchanged: Quote Lines tab, top of page.

---

#### S50b — Tooling policy promoted to `docs/06_tooling.md`

**Trigger:** S50a deploy had two long-running shell commands hang (8-min `tsc`, 17-min `vercel --prod`) before specialised MCPs were used instead. Mateusz: *"i really didn't like that desktop commander was slow and sometimes tripping."* The root cause wasn't Desktop Commander itself — it was using shell-over-MCP for long-running commands with streaming output, a bad fit for MCP's request/response model. Right division of labour needed codifying so the choice isn't relitigated every session.

**Tool tests run (short commands, identical workloads through both shells):**

| | windows-cli | Desktop Commander |
|---|---|---|
| Tool calls for 3 commands | 3 | 5 (start_process + 3 interact + force_terminate) |
| Output cleanliness | Just the command output | Output + trailing `C:\...>` prompt + "Response may be incomplete (timeout reached)" on every call even when complete |
| State management | Stateless | PID tracking + cleanup |
| Speed (subjective) | Instant | Instant |

Both handled `git status` / `git log` / `dir` cleanly. windows-cli wins on tool-call count and output noise for the stateless short-command workload that dominates our sessions.

**Policy shipped (`docs/06_tooling.md`):**

- **Default shell** — `windows-cli:execute_command`, `shell: cmd`, explicit `workingDir`. No `&` / `&&` chaining inside one command string.
- **File I/O** — Filesystem MCP (`read_file` / `edit_file` / `write_file`).
- **SQL** — Supabase MCP unchanged.
- **Deploy** — `Vercel:deploy_to_vercel` + `list_deployments`; never `npx vercel --prod` through a shell.
- **Never run through shell-over-MCP:** production builds, full-repo typechecks, fresh `npm install`, `npm run dev`. Specifically: anything that takes >30s with streaming output.
- **Desktop Commander reserved for stateful sessions** — interactive REPLs, SSH, `psql`. None of these are currently used in this project, but DC stays installed as a fallback.

**Deploy sequence updated** — the old `git ... && npx vercel --prod` one-liner is replaced with a split: git via `windows-cli`, deploy via `Vercel:deploy_to_vercel`. Both `claude_desktop_config.json` MCP servers (`filesystem` + `windows-cli`) and the remote Vercel/Supabase connectors documented in the new file.

**README updated** — `00_README.md` read-order now points at `06_tooling.md` as item 6 (TRACKER is now item 7), with an update-trigger row added to the table.

**No code changes, no schema changes.** Docs-only commit.

---

#### S50c — Scroll-restore actually working

**Trigger:** Mateusz tested S50a on prod. "scroll doesn't work" — lands at top, hash ignored entirely.

**Root causes (two of them, both fixed in this commit):**

1. **Next.js App Router scroll-to-top winning the race.** When a `<Link>` navigates, Next.js fires an automatic scroll-to-top after the route mounts. Our `scrollIntoView` would fire first (from the `loading` useEffect) and Next.js would override seconds later. The `scroll={false}` prop on the source `<Link>` (scope page's "Back to Job") disables that auto-scroll so our hash-driven scroll is the last word.

2. **`didRestoreScroll` flag set before the scroll succeeded.** The S50a useEffect set the ref to `true` BEFORE the `requestAnimationFrame` callback ran. If the rows weren't in the DOM yet (data still loading, tab not switched), the `querySelector` returned null, no scroll happened, but the flag was already burnt — no retry on subsequent renders. New code only sets the flag after `scrollIntoView` actually runs, and the effect deps include `woData.length`, `scopes.length`, and `activeTab` so it re-fires whenever the relevant DOM might now contain the target.

**Other tweaks:**
- `requestAnimationFrame` → `setTimeout(50ms)` for more generous timing on slower machines.
- `behavior: "instant"` → `behavior: "auto"` for broader browser support (instant is a newer spec value).

**Files (2):**
- `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` — added `scroll={false}` to the Back-to-Job Link.
- `src/app/(dashboard)/jobs/[id]/page.tsx` — rewrote the scroll-restore effect: better retry semantics, broader deps, longer settle window.

**Bundled:** `docs/06_tooling.md` correction (deploy section, decision matrix, contingency bullet) from after the S50b deploy when I noticed `Vercel:deploy_to_vercel` doesn't actually deploy. Was sitting uncommitted in the working tree; carried it on this commit.

---

#### S50d — SSR hydration trap behind the scroll-restore

**Trigger:** Mateusz tested S50c. "still nothing - url is correct, but doesn't take me anywhere." URL had `?tab=wo#wo-XXX` but the page wouldn't scroll. Clarifying questions confirmed: hard-refreshed, browser cache ruled out. Asked which tab was active on landing — answer in S50e below.

**Root cause.** The `activeTab` `useState` lazy initialiser used `typeof window === "undefined"` to read `?tab=` from the URL. This is a classic Next.js App Router hydration trap:

- Server prerender: `window` is undefined → initialiser returns `"lines"`
- Server emits HTML with the Quote Lines tab content rendered
- Client hydrates with the server's state value
- Even though the client-side initialiser would now return `"wo"` from the URL, the hydrated state stays `"lines"`

Net effect: URL had `?tab=wo#wo-XXX`, but the active tab was still Quote Lines, the WO rows never rendered, `document.querySelector("#wo-XXX")` returned null, no scroll fired.

**Fix.** Dropped the `window` check from the initialiser (now just `"lines"`) and added a separate `useEffect` that reads `?tab=` after mount. Runs purely client-side, post-hydration, triggers a real re-render to the correct tab. The scroll-restore effect already had `activeTab` in its deps so it re-fires after the tab switch and finds the row.

**Cost.** ~16ms flash of Quote Lines on initial load before the tab switches. Barely perceptible. Same pattern (`typeof window` check in `useState` initialiser) exists for `activeFilter` from `sessionStorage` — left alone, not on the bug path, and the flash trade-off is uglier there.

**Files (1):** `src/app/(dashboard)/jobs/[id]/page.tsx` — initialiser + new tab-sync useEffect.

---

#### S50e — Reframe: back-to-job lands on Quote Lines, anchored to the line

**Trigger:** S50d shipped, Mateusz tested. "all good - works" — then qualified: *"but when clicking back to job, i want to be taken to quote line tab - that's from where i operate."* (He'd landed on Scope Items because that's where he'd been navigating from in the test, but his actual operational pattern is to live on Quote Lines and dip into scopes/WOs to inspect or edit.)

**Design reframe.** S50a–d targeted "land on whatever tab you came from." Wrong frame. The PM operates from Quote Lines, clicks into a WO or scope to inspect or edit, and comes back. The anchor that matters is the line itself — a line can hold multiple scopes and multiple WOs but they're all children of one line. Landing on the line gives immediate context for what was just being looked at, regardless of which child element the user navigated through.

**Changes (3 files):**

1. **`src/app/(dashboard)/jobs/[id]/page.tsx` (renderLineRow)** — quote line `<tr>` now carries `id="line-{quote_line_id}"` and `scroll-mt-24` so it sits below the sticky topbar when scrolled into view. Scroll-restore effect deps now include `lines.length` so the effect re-fires when the quote-lines data arrives.

2. **`src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx`** — Back-to-Job href is now always `/jobs/X?tab=lines#line-{scope.quote_line_id}` (or just `/jobs/X` when the scope is orphaned from a line — the auto-overhead case). `scroll={false}` stays in place so Next.js doesn't fight the `scrollIntoView`.

3. **The `wo-{id}` / `scope-{id}` anchors stay in place.** No longer reached by the Back link, but cost nothing and might be useful for future deep-linking.

**Side effect: SSR trap no longer load-bearing.** Default `activeTab` is `"lines"` and that matches both the server prerender and the target tab the back-link now goes to. The S50d useEffect that reads `?tab=` still runs (harmless when `t` is already `"lines"`) but isn't on the critical path anymore. If a future back-link wants a different tab, the mechanism still works.

#### S50 schema summary

- **0 schema changes**
- **5 deploys** — `c7ae10b` S50a code, `66228cd` S50b docs, `0e95919` S50c first scroll fix, `b62479a` S50d SSR hydration fix, `29b90a8` S50e quote-lines reframe
- **Live totals unchanged from S49:** 57 tables, 34 views, 18 RPCs, 2 cron jobs
- **Net lesson:** when a feature "doesn't work" three deploys in a row, the bug isn't always the obvious one. S50c looked like a race condition (and there was one, but fixing it didn't help). S50d found the actual blocker (SSR hydration). S50e was Mateusz reframing the problem itself. Lessons stack: each fix was correct, just incomplete.

---

### S49 — 25 May 2026

Planner rename + new "Confirmed off-system" booking path. One deploy. No schema change.

#### S49a — Capacity → Planner, plus a third booking action for off-system confirmations

**Trigger:** Mateusz: *"in my capacity page — I think I would like to change it to 'planner', and when choosing people for specific dates I don't want to have the only option to book them. Sometimes I just want to check that they will be here as they were booked either by text message or verbally."*

**Reframe in chat (worth recording):** my first instinct was a new "Held" state alongside the formal booking — a second axis to the existing confirmation flow. Mateusz pushed back: *"if I mark it held, I treat it as officially booked. In matter of fact it should be just 'booked'. If booked with confirmation, it can say 'booked confirmed' or similar."* The new state was theoretical complexity; reality is one booking row, two creation paths. Same downstream effect. He also surfaced the actual operational driver, which is the prize for pass 2 (separate session): freelancers sometimes forget to log a timesheet, and there's no signal because there's no booking expectation to compare against. **Bookings should drive the no-show flag.** Pass 1 ships the booking-creation surface; pass 2 ships the no-show detector on top of it.

**Investigation findings:**
- `tbl_freelancer_schedule.status` is plain `text` with default `'Booked'`. No CHECK constraint, no triggers, no dependent views, only `rpc_capacity_data` reads it. Schema is loose — no migration needed for new status values (everything is already free text).
- Status values in live data: `Confirmed` (97), `Declined` (6), `Booked` (5). `Notified` and `Unavailable` exist in code paths but currently no live rows.
- `Notified` is a transient state set by the "Book & notify via WhatsApp" path on `/capacity/add-booking`; freelancer's mobile schedule confirm/decline action moves it to `Confirmed` / `Declined`.

**Changes shipped (5 files, 1 deploy, 0 schema):**

1. **Sidebar label + page H1 rename** (`src/components/sidebar.tsx`, `src/app/(dashboard)/capacity/page.tsx`). URL stays `/capacity` — renaming the route would chain-rename `/capacity/add-booking`, break bookmarks, and require updating Link refs throughout. Page label is the user-visible thing; URL is mechanical. Deferred URL rename to a quiet session if Mateusz wants it.

2. **`/capacity/add-booking` — third action** (`src/app/(dashboard)/capacity/add-booking/page.tsx`). Refactored `saveBooking(notify: boolean)` into `saveBooking(mode: "notify" | "silent" | "confirmed")`. Three buttons now:
   - **Book & notify via WhatsApp** (blue) — status `Notified`, fires WA. *Existing behaviour.*
   - **Book — already confirmed** (green, new) — status `Confirmed`, no WhatsApp. Tooltip: "Use when you've already arranged it via WhatsApp / phone / in person."
   - **Book without notifying** (muted) — status `Booked`, no WhatsApp. *Existing behaviour, kept for the pencil-in case.* Tooltip clarifies its distinct purpose now that "confirmed" is its own button.

3. **Inline `BookingCalendar` dialog** (`src/components/booking-calendar.tsx`). Added `dialogConfirmed` state + a small "Already confirmed" checkbox with helper subtext. Defaults checked for new bookings (PM's typical case is recording an already-arranged commitment); reflects current status for existing rows. Visible for new / `Booked` / `Confirmed` rows; hidden for `Notified` (awaiting freelancer response — PM shouldn't be flipping the meaning silently), `Declined`, and `Unavailable` (freelancer-driven states). Save path now writes `status` on existing-row updates (previously only `job_id` and `notes`), which is what enables PM-side promote/demote.

**Status colour mapping unchanged.** Confirmed = green, Notified = blue, Booked = amber, Declined = red strikethrough, Unavailable = grey. The new path lands directly on green.

**Default-checked choice — rationale + risk.** Defaulting the inline-dialog checkbox to checked changes the default outcome of a single-cell click from `Booked` → `Confirmed`. This is the right default given the dominant use case Mateusz described (he treats every PM-side booking as confirmed unless he's pencilling). The risk is that the previous muscle-memory of "click cell, click Book" now produces a Confirmed row instead of a Booked one. Mitigation: the checkbox is visible above the action buttons, defaults visibly to checked, and the post-save toast says "Booked & confirmed" so it's obvious what happened. If this proves wrong in practice, flipping the default is one line.

#### Deferred — Pass 2 (separate session): booking-driven timesheet no-show flag

The actual operational reason Mateusz wanted this: today `rpc_detect_timesheet_gaps` flags freelancers who log >0h but <90% of `standard_day_hours`. It can't catch a complete no-show because there's no row to detect against. Bookings are the missing signal — a freelancer booked for today with zero `tbl_wo_time_entries` by EOD is a no-show. Spec for next session:

- New RPC `rpc_detect_timesheet_no_shows(DATE)` — for each `tbl_freelancer_schedule` row on the date with active status (`Booked` / `Confirmed` / `Notified`) and no time entries, insert a row into `tbl_timesheet_flags` with `flag_type = 'no_show'`.
- `pg_cron` schedule at ~18:00 UK time (UTC offset depends on BST; cron is UTC per project convention — pick 17:00 UTC for now and revisit when DST changes).
- Add `cancellation_reason text` (or enum: `sick | no_show | cancelled_by_us | cancelled_by_them`) to `tbl_freelancer_schedule`. Skip flag generation when set. Gives operational signal *and* freelancer-reliability data over time.
- Notifications: freelancer gets a deep-link to mobile timesheet entry; PM sees in existing flags dashboard alongside gap flags.
- Idempotency: `UNIQUE(freelancer_id, flag_date, flag_type)` on `tbl_timesheet_flags` (verify if not already present).

Deferred to its own session per the principle that ship pass 1 (UX), then pass 2 (data + cron + notify) — they share no code, debugging cron timing simultaneously with modal UX is asking for trouble.

#### S49 schema summary

- **0 schema changes** (text column, no CHECK constraint, no triggers, no dependent views — used existing status values)
- **1 deploy** (`b25fe52`)
- **Live totals unchanged from S48:** 57 tables, 34 views, 18 RPCs, 2 cron jobs

---

#### S49b — Timesheet no-show detection (booking-driven)

The pass-2 piece from the morning: drive missing-timesheet flags off bookings, not just off zero-hour gaps in existing time entries. Today's `rpc_detect_timesheet_gaps` only considered freelancers who logged >0h on the date — a freelancer booked for the day but logging nothing was invisible. That's the silent slip Mateusz wanted to close.

**Design pivot from the spec.** The S49a doc-entry's deferred section proposed a sibling RPC (`rpc_detect_timesheet_no_shows`) plus a `flag_type` column on `tbl_timesheet_flags`. Inspection of the live schema killed that approach:

- `tbl_timesheet_flags` already has `expected_hours` / `logged_hours` / `status`. A no-show is `expected = standard_day_hours, logged = 0` — same row shape as a gap. Adding `flag_type` would have been schema noise.
- The existing unique constraint `(freelancer_id, flag_date)` gives idempotency for free, no matter how the row got there.
- The daily cron at `0 6 * * *` UTC already calls `rpc_detect_timesheet_gaps(CURRENT_DATE - 1 day)`. Folding the no-show case into the same function means one cron, one piece of logic, no behaviour drift between the two paths.

So pass 2 ships as a CREATE OR REPLACE of `rpc_detect_timesheet_gaps`, not a new RPC.

**Function change.** The candidate set is now the UNION of:

- *(A)* freelancers who logged time on the date — existing source
- *(B)* freelancers with `tbl_freelancer_schedule.status IN ('Booked','Confirmed','Notified')` on the date — new source

`Declined` and `Unavailable` are deliberately excluded — those are freelancer-driven not-going states, not no-shows. The `(B)`-only case (booked, logged nothing) flows through the same `with_std` / `classified` pipeline as before and lands in `tbl_timesheet_flags` via the existing upsert. `logged_hrs` is `COALESCE(l.hrs, 0)`, so no-show rows are naturally `is_short`.

**Notification on first detect.** For genuinely-new flags (`xmax = 0`, the Postgres trick to distinguish INSERT from UPDATE in `ON CONFLICT`) where `logged_hours = 0`, the function inserts a `timesheet_no_show` notification directly. Severity `warning`, `action_url = '/m/me'` (freelancer mobile home, where backfill lives), `source_freelancer_id` set. Title: *"Missing timesheet — Dy DD Mon"*. Detail: *"You were booked on … but no hours were logged. Tap to backfill or let the office know."*

Notifications fire **only on no-show (logged_hours=0), not on short-but-non-zero days.** Rationale: a freelancer who logged anything that day is already on their phone and will see the gap on `/m/me` themselves. Spamming them on top of a half-completed timesheet is overkill. If a real case surfaces where short-day notifications would help, easy to extend.

**Why no `cancellation_reason` column (departure from the S49a spec).** The spec proposed adding it to `tbl_freelancer_schedule` to skip flag generation when a booking was cancelled. Decided to defer. The existing surfaces cover cancellation today:

- Remove button on the inline calendar dialog → row gone, no flag.
- Status flip to `Declined` (freelancer rejected) or `Unavailable` (self-marked off) → excluded by the new `status IN ('Booked','Confirmed','Notified')` filter.

Real false-flag pressure (PM-cancelled bookings that nobody updates the status of) hasn't shown up yet. If it does, the column is a one-line ALTER plus a WHERE clause in the function. YAGNI for now. Added to the cleanup backlog as a watcher.

**Test run on live data (2026-05-22).**

```
SELECT * FROM rpc_detect_timesheet_gaps('2026-05-22'::date);
```

Result:

- Karol Socha 11h → `ok`
- George Cullingford 12h → `ok`
- **Jake Macklin 0h (booked, never logged)** → `flagged` — flag 5801 inserted, notification 753 fired with `/m/me` action URL.
- James Hackney 1.5h (already-open flag from existing detector) → `flagged`, no new notification (`is_new = false`).

Re-run confirmed idempotency: `n_notifs` for Jake remained 1 after a second invocation. Jake's flag for 2026-05-22 and the corresponding notification are real captured data (not test artifacts) — left in place. They'd have been caught on the morning cron had the change shipped a few days earlier.

**App-side changes.**

- `src/lib/notifications.ts` — `timesheet_no_show` added to `NotificationType` union.
- `src/app/(dashboard)/notifications/page.tsx` — `timesheet_no_show: 'Timesheet'` added to `typeLabels`. Without it the type renders without a category badge.

**Backfill — not run.** Past 14 days have several Jake-no-show dates (May 18, 19, 21, 22, plus a couple more outside the live window). The cron will start catching new ones from tomorrow's run (06:00 UTC on 26 May, processing 25 May). Past days won't be retroactively processed unless someone calls the RPC with an older date. Discussed; decision deferred to Mateusz on whether to run a manual backfill loop for the past 2 weeks (would generate ~6 more notifications for Jake at once).

#### S49b schema summary

- **0 tables**, **0 new functions** — replaced existing RPC body, signature unchanged
- **+1 NotificationType** value in the application union (`timesheet_no_show`)
- **1 migration** (`s49b_expand_timesheet_detector_for_no_shows`)
- **1 deploy** (`2cb495d`)
- **Live totals unchanged from S48:** 57 tables, 34 views, 18 RPCs, 2 cron jobs

---

### S48 — 25 May 2026

WO documents panel UX polish and a reusable in-app PDF viewer. Also a security-policy investigation on freelancer PIN visibility (closed without ship — see S48c). Four deploys. No schema changes.

#### S48a — Drawing/reference thumbnails: bigger, named, and laid out for identification

**Trigger:** Mateusz, on reordering drawings for print: *"thumbnails are very small, so it's hard to see what's on them when I'm changing the order — need to click each one. I don't need great resolution, but they need to be big enough to identify."*

**Two coupled UX fixes in `wo-documents-panel.tsx`:**

**(1) Size + crop.** Thumbnail size bumped from 64×64 square to 176×128 (close to A-series landscape ratio). `object-cover` (centre crop — the killer for landscape A3 drawings since only the middle slice was visible) switched to `object-contain` (full drawing visible, aspect preserved). Background changed `bg-surface-dim` → `bg-white` so line drawings have proper context (white-on-grey loses contrast on dark CAD output). Order badge and delete button scaled proportionally (was `w-5 h-5 text-[9px]`, now `w-6 h-6 text-[11px]`). FileText icon fallback also bumped (h-6 → h-10) for the non-image-non-PDF case.

**(2) Caption under each thumb.** The hover-only `title` attribute was awkward during drag-drop reorder — Mateusz: *"clue is in the name."* Added a 2-line clamped caption below each thumbnail rendering `doc.caption || displayDocName(file_name, activityLabel, scopeName)`. The new `displayDocName` helper at module level strips the `{activity}-{scope}-` prefix that the upload pipeline adds (those parts are implicit from the WO context), strips the file extension, and converts hyphens back to spaces. Falls back to raw name if no prefix matches (covers docs moved between WOs).

Schema/backend unchanged — both fixes are pure render-side. Affects both `drawing` and `reference` doc types (shared code path). Layout impact: 3–4 thumbs per row on a typical panel width instead of 8+, which is the correct density for identification rather than stamp-collection.

#### S48b — In-app PDF viewer + first-page PDF thumbnails

**Trigger:** Mateusz, after S48a landed: *"shall we build PDF viewer/thumbnail on same logic as JPEG? I don't want to need to download all PDFs to see them — do a nice PDF viewer which we can use in different parts of our system, when and where necessary."*

**Library choice — react-pdf over alternatives:**
- `@react-pdf-viewer/core` — prettier defaults but commercial-use license required (we'd pay)
- `pdf.js` direct — same engine, more boilerplate, no upside
- **`react-pdf`** (Wojciech Maj, MIT) — chosen. Industry standard, ~600KB gzipped, well-typed

**Considered and rejected: Microsoft Graph thumbnail API.** OneDrive auto-generates first-page thumbnails for PDFs server-side at zero client cost. Would have been the cheaper thumbnail solution. But Mateusz wanted a real viewer (zoom, page nav), not just thumbnails. Once react-pdf was in for the viewer, using it for thumbnails too kept the system on one library. The Graph approach remains a fallback if pdf.js client-side rendering ever becomes a perf problem on PDF-heavy WOs.

**Components shipped (both reusable across the system, not WO-specific):**
- `src/components/pdf-viewer.tsx` — fullscreen modal. Page nav (prev/next + page-number input), zoom in/out + fit-to-width, keyboard shortcuts (Esc / ← → / + - / 0). Optional `onDownload` callback for caller-provided download action. Takes a URL and an `onClose`, nothing else. v1 scope: page nav, zoom, close. Out of scope (easy adds later): text selection, search, annotation, multi-page sidebar.
- `src/components/pdf-thumb.tsx` — small first-page render for fixed-size containers. Falls back to FileText icon on load error.

**Worker setup:** `pdf.worker.min.mjs` copied from `node_modules/pdfjs-dist/build` to `public/` and referenced at `/pdf.worker.min.mjs`. Self-hosted, same-origin, no CDN dependency, no CORS. Committed to repo so Vercel builds have it. On future react-pdf upgrades, re-copy the worker file from node_modules — they must match.

**Performance — lazy loading via `next/dynamic`:** both PdfViewer and PdfThumb are dynamic-imported with `ssr: false`. pdf.js (~600KB) only downloads when a page actually has a PDF to render. Zero impact on PDF-free pages.

**Wiring in `wo-documents-panel.tsx`:**
- **Drawings/references grid:** PDFs in the grid now render real first-page thumbnails via `PdfDocThumb` (a small wrapper that fetches a same-origin view URL then renders `<PdfThumb>`). Was: generic FileText icon.
- **Click-to-preview (grid):** `openPreview` routes PDFs to the new PdfViewer modal. Was: PDF rendered in an `<iframe>` inside the image lightbox (browser-default PDF viewer, inconsistent across browsers, mobile-hostile).
- **Eye-icon on non-grid doc types (cut lists, CAD breakdown line items):** `viewDoc` now routes PDFs to PdfViewer. Other types (csv, xlsx) continue to open in a new tab.

**URL source for PDFs:** `getOneDriveViewUrl(path)` — same-origin `/api/onedrive/view` proxy returning streaming inline content. Used instead of `getOneDriveUrl` (which returns Graph CDN URLs) specifically because pdf.js's `fetch()` of the PDF bytes is sensitive to CORS — the proxy sidesteps that surface entirely.

**Known limitation — portrait PDFs in landscape thumb slot.** Container is 176×128 (landscape). Portrait drawings render at 176 wide → ~250 tall → top-cropped to 128. Usually fine because title blocks live at the top, but identifying info mid-page on a portrait drawing gets cut. Logged in cleanup backlog.

**Crosswind with existing handover backlog item:** "Handover — PDF drawing rendering" (S39) is now mostly satisfied at the infrastructure level — `react-pdf`, `pdfjs-dist`, and the self-hosted worker are all live. The handover print page still needs its own adaptation of `pdf-thumb.tsx` (multi-page iteration, print scale, 2× DPR). Updated the cleanup item to reflect.

**Deps added:** `react-pdf` (and transitive `pdfjs-dist`). `npm audit` flagged 4 transitive vulnerabilities (2 moderate, 2 high) in pdf.js text-extraction and annotation paths — neither code path active in our usage (`renderTextLayer={false} renderAnnotationLayer={false}` on every Page). Accepted for now; logged in backlog to re-check on every react-pdf version bump.

**Reusability** — to use elsewhere in the system:
```tsx
import dynamic from "next/dynamic";
const PdfViewer = dynamic(() => import("@/components/pdf-viewer"), { ssr: false });
<PdfViewer url={someUrl} fileName="..." onClose={() => setOpen(false)} />
```
Same for `PdfThumb`. The proxy URL pattern (`getOneDriveViewUrl(path)`) is what to feed them when the PDF lives in OneDrive.

#### S48c — Crew page: PIN visibility investigated, declined on policy

**Trigger:** Mateusz: *"in crew page I'd like to view freelancers' PIN numbers — a little icon so if anyone loses theirs I don't need to reset."*

**Investigation:** PINs are stored only as bcrypt hashes in Supabase Auth (SP-002). The legacy plaintext `tbl_freelancers.pin` column was dropped pre-S41; SP-002 explicitly bans reintroducing one. Building "view PIN later" would require storing PINs recoverably somewhere in the application database — a SP-002 violation that would surface in any future security audit.

**Alternative proposed:** a single "Reset & Send" button on each crew row that combines the existing 4-click flow (Generate → Save via `freelancer-sync` → WhatsApp share) into one click. Same security model, much less ceremony — the underlying workflow problem ("freelancer forgot, I want to give them one without ceremony") solved within policy. Existing detailed Mobile Access dialog stays for first-time onboarding and the rare case of setting a specific PIN.

**Outcome — Mateusz declined.** *"That's fine, leave it."* The existing Mobile Access dialog handles the workflow; he doesn't want to add a parallel fast-path. Crew page unchanged.

**Pattern worth recording:** the conversation here — user asks for a specific affordance that turns out to violate a security policy → I flag the policy → propose an alternative that solves the underlying problem within the policy → user decides. This is the SP-002 enforcement loop working as designed. Logging the trace so future-Claude doesn't relitigate when the same request reappears.

---

#### Cleanup updates this session

- **Updated:** "Handover — PDF drawing rendering" (S39). Was: "add pdf.js…" — now: dep is in place via S48b, scope narrowed to "adapt pdf-thumb.tsx pattern to multi-page print render."
- **Added (small):** PDF thumbnail aspect-aware sizing — portrait PDFs render top-cropped in the 176×128 landscape slot. Cosmetic.
- **Added (small):** `react-pdf` transitive vulnerabilities recheck on each version bump (currently dormant — text/annotation code paths are disabled in our usage).

---

#### S48 summary

- **0 schema changes** (no migration, no DB writes)
- **2 new reusable components:** `pdf-viewer.tsx`, `pdf-thumb.tsx`
- **1 new npm dep:** `react-pdf` (+ transitive `pdfjs-dist`)
- **1 new public asset:** `public/pdf.worker.min.mjs` (self-hosted pdf.js worker)
- **4 deploys:** thumbnail size+caption (`e8a9b60`), display-name caption (`bc4eef7`), PDF viewer+thumbs (`105b6f3`), all-PDFs-through-viewer (`246424b`)
- **Live totals unchanged from S47:** 57 tables, 34 views, 18 RPCs, 2 cron jobs

---

### S47 — 23 May 2026

New job intake (FA Little Rollright), traveller bug fix, and a clock-system overhaul: the main dashboard banner was reading from only one of two clock tables, so quick timers were invisible — and two real phantoms had been running unnoticed for 3 and 17 days respectively. Fixed at three levels (DB, UI, janitor) and closed an audit gap on the inbox while editable hours were being added.

Three migrations, three deploys, two cleanup items added, one closed.

#### S47a — Job 13774 FA Little Rollright + quote 40839 v13

**Migration:** `import_quote_40839_little_rollright_v13_job22`

New job for Fait Accompli ("FA"), event 6 June 2026 at Little Rollright. Job 13774 / job_id 22. `external_project_ref = 40839` (FA's quote ref from the PDF footer). `budget_allowance` left NULL — the Jobs list reads from `qry_job_accepted_quote` since S41, so the accepted quote drives the "Quoted" column on its own.

Quote imported as v13 (footer canonical version, header showed V5 — same convention as the FA Léoube import: footer "v" version is authoritative, header "V" is FA-internal). 36 lines totalling £62,965 net across 8 sections (Garden Lighting £5,480 / Marquee Lighting £2,400 / Décor £12,660 / Sound £6,825 / Power £4,100 / Labour £19,430 / Transport £7,370 / Additions £4,700). Sub-totals checked against the PDF. Status set to `Accepted` on import — only status value present in the system so far (S45 import flow assumes accepted quotes; draft handling is YAGNI until needed). S39 overhead trigger fired correctly — overhead scope #91, OVERHEAD WO #134, £0 overhead quote-line #549 all created.

Category assignments on the lines were judgement calls — flagged in chat for PM review (Décor split Workshop/Subcontracted by build vs hire, generators Subcontracted, labour lines under Install/Lighting/Sound categories). No "Labour" category in the taxonomy; Install was the closest fit for design-crew lines. Event zones used granular per-line locations (Drinks Reception, Garden, Pavilion, House Front, Car Park, Marquee, Dancefloor, Nightclub, Dining, Pergola/Lawn, Production for production-overhead lines).

#### S47b — Multi-page cutlist on job traveller

**Files changed:** `src/app/traveller/page.tsx`

Mateusz noticed a centre-staircase cutlist that's split across 2 PDF pages only printed page 1. Two coupled bugs in `traveller/page.tsx`:

1. **Data load**: `pdfPageUrls[doc.doc_id] = [url]` always created a one-element array regardless of PDF page count. The render loop then iterates `urls.length` (= 1), so page 2 onward was silently dropped.
2. **Render**: `ImagePage` hardcoded `pdf.getPage(1)`. Even if you fixed (1), every iteration would still show page 1.

Fix: at data-load time (after the OneDrive URL is fetched), open the PDF with pdf.js and read `numPages`. Populate `pdfPageUrls[doc_id]` with `numPages` copies of the URL. `ImagePage` gets a new `pdfPage` prop and renders `pdf.getPage(pdfPage || 1)`. Label is `"Cut list (1/2)"` / `"Cut list (2/2)"` when there's more than one page so it's obvious in the print. `totalPages` calculation already summed `pdfPageUrls.length` and the per-iteration loop was already correct, so the cosmetic surface needed only the page-count populate + the `pdfPage` plumbing — small, isolated diff.

pdf.js is loaded `beforeInteractive` in `traveller/layout.tsx` so it's reliably available when `loadData` runs (in a `useEffect` after hydration). Fallback if `window.pdfjsLib` is missing or `getDocument` throws: length stays 1 (current behaviour preserved on error).

Trade-off: each `ImagePage` instance fetches and parses the PDF independently, so a 2-page cutlist downloads + parses the PDF 3 times total (once for page-count, twice for rendering). Acceptable for typical cutlist sizes; if cutlists grow large or numerous, cache the parsed `pdf` object on a ref keyed by `doc_id`.

#### S47c — Dashboard active workers: surface both clock systems

**Migration:** `dashboard_active_workers_include_quick_timers`
**Files changed:** `src/app/(dashboard)/page.tsx`

The diagnostic question Mateusz raised was "James asked me to stop his clock but I can't see it". James had already stopped himself, but the investigation surfaced a real architectural gap: the dashboard's "Active Now" banner only reads from `tbl_wo_time_entries`. The system has **two** independent clock tables:

| | WO timer | Quick timer |
|---|---|---|
| Table | `tbl_wo_time_entries` | `tbl_tasks` |
| How freelancer starts it | Opens a specific WO and presses Start | Floating header timer, no WO chosen |
| Open state | `system_end_timestamp IS NULL AND archived_at IS NULL` | `status = 'in_progress'` |
| Stoppable | Workshop page PM controls + mobile | Workshop page PM controls + mobile |
| Visible on main `/` dashboard banner | ✅ | ❌ (pre-S47) |
| Visible on `/workshop` page | ✅ | ✅ (separate `tbl_tasks` query → `activeTasks`) |

Two real phantoms surfaced once we knew where to look: Mateusz Filar's quick timer running 81h (3.4 days), Radoslaw Kowalik's running 405h (17 days). Both invisible to the main dashboard, both unactioned because no one knew they existed.

**Fix at the RPC layer:** `rpc_dashboard_data.activeWorkers` now UNIONs the two sources. Each row carries `kind` (`'wo'`\|`'task'`), `id` (entry_id or task_id), `freelancer_id`, `work_order_id` (NULL for quick timers), `started_at`, `name`, `task_title`. Sorted oldest-first so the worst phantoms surface first.

**Fix at the UI layer:** dashboard banner shows duration on every pill with colour escalating by age — blue ≤12h, amber 12–24h, red >24h (with ⚠ phantom marker). Quick timers tagged inline (`· QT`) to distinguish from WO timers. Whole banner wraps in a `<Link href="/workshop">` so a click takes you to the screen where the stop controls actually live. Key changed from `w.entry_id` (collision-prone with two ID spaces) to `${w.kind}-${w.id}`.

Mateusz applied a slightly different variant of the UI patch manually while Desktop Commander was unresponsive (one clickable card vs per-pill links — arguably cleaner). Final shipped version is his pattern with a small tooltip-field fix (`w.task_title` not `w.title`).

#### S47d — Phantom-timer patrol (cron janitor)

**Migration:** `phantom_timer_patrol`

New SECURITY DEFINER function `rpc_close_phantom_timers()` and a daily `pg_cron` job (`phantom-timer-patrol-daily`, `0 4 * * *` UTC, active). Auto-closes any timer that's been running >16h:

- WO timers: `system_end_timestamp = NOW()`, `actual_end_timestamp = NOW()`, `actual_hours = 0`, `flag_note` explaining. Hours=0 means no pay attributed; `flag_note` ensures the entry surfaces in the dashboard flags banner for PM correction.
- Quick timers: `status = 'pending'`, `logged_at = NOW()`, `hours = 0`, `review_note` explaining. Status=pending routes to the PM inbox for review through the normal flow.

Threshold rationale: 16h is long enough to allow a genuinely brutal day (design crew during a build can legitimately log 12–14h), short enough that a forgotten timer can't accrue more than ~24h before the next nightly cleanup catches it. Anything legitimately longer than 16h continuous is almost certainly a forgotten timer — no one stays continuously clocked-in across a full sleep cycle.

04:00 UTC chosen so phantoms close **before** `timesheet-gap-detect-daily` runs at 06:00 — clean state for the gap detector to evaluate. The two existing phantoms (Filar 81h, Kowalik 405h) would be caught on the first run unless stopped manually first from `/workshop` (Mateusz's call on whether to attribute reasonable hours retrospectively or accept the zero).

**Audit caveat:** the patrol writes via SQL inside a SECURITY DEFINER function — bypasses `auditedUpdate`. The `flag_note` / `review_note` on each closed record IS the audit trail for the cron action. If this ever needs richer auditing, the patrol function could insert directly into `tbl_audit_log` with `user_id = NULL` and `user_name = 'phantom-patrol'`.

#### S47e — Workshop Inbox editable hours + tbl_tasks audit gap closed

**Files changed:** `src/app/(dashboard)/review/inbox/page.tsx`

Mateusz raised that with the phantom patrol now landing zeroed entries in the inbox every morning, the workflow shape was wrong: "approve task → leave inbox → hunt entry → edit hours → save" was 4 steps and a context switch for what's logically one edit.

**UI fix:** every task row now has an inline editable hours `<input type="number" step="0.25" min="0">` (decimal hours, 15-min increments) where the static `claimed_hours` span used to sit. Pre-populated from `claimed_hours ?? 0`. When the value differs from the original, the border goes amber and an `edited` tag appears with the original value in the tooltip. The edited value flows through to both Approve Overhead (writes `hours` directly into `tbl_tasks`) and Route to WO (passes through to `RouteTaskModal.claimed_hours` so the resulting WO time entry carries the corrected number). Reject ignores hours (irrelevant when rejecting).

**Audit gap closed:** `tbl_tasks` is in `AUDITED_TABLES` but `handleApproveOverhead` and `handleRejectTask` were using raw `supabase.from("tbl_tasks").update(...)` — a pre-existing violation of the "never raw update on key tables" rule (S46h cleanup item). Both switched to `auditedUpdate`. With editable hours about to make `tbl_tasks.hours` a pay-affecting writeable field directly from the PM inbox, audit coverage was no longer optional.

`handleRequestAction` (still raw on `tbl_workshop_requests`) added to cleanup backlog — smaller-stakes since workshop requests aren't pay-affecting and `tbl_workshop_requests` isn't in `AUDITED_TABLES`.

#### Phantom timers right now (not yet resolved)

The two open phantoms at S47 close:

- **Mateusz Filar** quick timer "Quick timer (07:48)" — started 19 May 07:48, currently ~81h running. Workshop General category. 0h logged.
- **Radoslaw Kowalik** quick timer "Quick timer (19:14)" — started 5 May 19:14, currently ~405h running. Workshop General category. 0h logged.

Both visible in `/review/inbox` now (S47d patrolled them into `pending`). PM action: open the inbox, set realistic hours via the new inline editor if knowable, otherwise approve at 0h or reject. Cron will catch any new phantoms automatically going forward.

#### Carried forward from S47

- **Audit gap on workshop requests** (added) — `handleRequestAction` still raw.
- **Phantom-timer patrol of WO timers in flight in real time** — currently only the nightly cron catches them. A real-time trigger (e.g. when a freelancer with an open WO timer tries to start a NEW timer) would prevent the daytime running phantom altogether. Not added to backlog yet — wait to see whether the nightly cap is sufficient.

---

### S46 — 20 May 2026

Comprehensive security audit triggered by Supabase's email about GRANT defaults (May 30 / October 30, 2026 deadlines). Audit surfaced a much bigger backlog than the immediate cause: 15 views bypassing RLS on financial data, 12 SECURITY DEFINER functions exposed to anon, 4 RLS policies that effectively negated themselves on writes, and an `audit_log` INSERT path that allowed actor spoofing. Three security migrations, one regression-test migration, plus CI guard and conventions update. No application code changed — all work was DB-side. Vector extension move investigated and **deferred** — rationale in S46e.

#### S46a — P0 security hardening

**Audit findings (Supabase advisor + live database inspection):**

- **15 views ran as SECURITY DEFINER**, bypassing RLS. Half contained financial data — `qry_invoice_job_rollup`, `qry_invoice_scope_costs`, `qry_invoice_wo_costs`, `qry_quote_line_badges`, `qry_dash_quote_stats`, etc. Any authenticated user could read every job's financial position regardless of role.
- **9 functions had mutable `search_path`** — search_path injection risk if anyone could create objects in a schema they had write access to.
- **12 SECURITY DEFINER functions had EXECUTE granted to anon and authenticated** via the implicit PUBLIC grant. `fn_create_job_overhead(p_job_id int)` was the worst — an unauthenticated POST to `/rest/v1/rpc/fn_create_job_overhead` would create overhead structures on any job. Trigger functions were exposed too.
- **4 RLS policies effectively permissive on writes**: `tbl_maintenance_checks` UPDATE was `USING (true)` (anyone could mark anyone's PAT test passed); `tbl_maintenance_logs` UPDATE same; `tbl_tasks` UPDATE was `true` (task board free-for-all); the entire `tbl_handover_*` family (`zone_notes`, `zone_documents`, `wo_notes`, `line_overrides`) was permissive on all four operations.
- **`tbl_audit_log` INSERT was `WITH CHECK (true)`** — any authenticated user could write any `user_id` they liked, making forged actor entries indistinguishable from real ones.

**Migration: `security_hardening_p0`** — ALTERed all 15 views to `security_invoker = on`, pinned `search_path` on 9 functions, REVOKE EXECUTE on the SECURITY DEFINER funcs from anon/authenticated, tightened the 4 broken RLS policies. Audit_log INSERT now `WITH CHECK (user_id = auth.uid())`. Maintenance UPDATEs now PM/admin OR `completed_by/performed_by = get_my_freelancer_id()`. Tasks UPDATE is PM/admin only; INSERT requires `freelancer_id = get_my_freelancer_id()` for non-PMs. Handover family is PM/admin only for all writes.

**Migration: `security_hardening_p0_revoke_public`** — Postgres footgun discovered mid-flight: `REVOKE EXECUTE FROM anon` is a **no-op** while `PUBLIC` still has EXECUTE. Verified: `has_function_privilege('anon', ...)` returned `true` for every "revoked" function. Fix: REVOKE EXECUTE FROM PUBLIC, then GRANT back to `authenticated` for the 3 app-callable RPCs (`rpc_active_workers`, `rpc_confirm_wo_completion`, `rpc_undo_wo_completion`). Left the 5 internal-only funcs without anon/authenticated EXECUTE. Triggers continue to fire because Postgres invokes trigger bodies internally regardless of caller EXECUTE perms.

#### S46b — P1 cleanup: auth helpers + intent documentation

**Migration: `security_hardening_p1_helpers_and_docs`**

The auth helpers `get_my_role`, `get_my_freelancer_id`, `user_role`, `user_freelancer_id` are SECURITY DEFINER by design (RLS policies on every table call them). They have to remain callable by `authenticated` or every RLS check breaks. But the advisor flagged them as "callable by anon" — true via the default PUBLIC grant, even though they return NULL for anon (no `auth.uid()`) so no real exposure.

Fix: REVOKE EXECUTE FROM PUBLIC + anon explicitly; keep authenticated. Cleared 4 anon advisor warnings. The 4 `authenticated_security_definer_function_executable` warnings on the same helpers are intentional and permanent — RLS needs them.

Also added `COMMENT ON TABLE public.tbl_material_spec_defs` documenting its intentional service-role-only state (RLS enabled, no policies = nobody but service_role can read). Future-Claude won't have to re-derive the intent.

#### S46c — Regression test fixture for `rpc_job_close_report`

**Migration: `regression_test_rpc_job_close_report`** (plus two iterative fixes for memory-stale column names).

New function `public.test_rpc_job_close_report()` returning TEXT `'OK: ...'` on pass or RAISING with the failing assertion's diagnostic on fail. Pattern: a single PL/pgSQL function seeds a known job/scope/quote/WO/time-entry/BOM fixture, calls `rpc_job_close_report`, asserts six commercial numbers (`quoted`, `labour_hours`, `labour_cost`, `material_cost_planned/actual/committed`), then raises `'TEST_OK'` to roll back the inner subtransaction. Successful runs leave **zero data behind** — the subtransaction rollback handles cleanup regardless of pass/fail.

CI calls `SELECT public.test_rpc_job_close_report()`; the regression test now locks down the cost math the directors will be reading. Extend the function as new cost-affecting code lands (it lives in the DB next to the RPC it tests).

**Two corrections discovered during build** (folded into memory note):
- `tbl_wo_time_entries` timestamp columns are `*_timestamp` suffixed (`system_start_timestamp` etc), **not** `*_start`/`*_end` as the long-standing memory had them.
- `tbl_wo_bom.job_id` is a **denormalised** column — `qry_bom_enriched` filters on it directly, so it must be set on INSERT or BOM rows disappear from every cost view that goes through the enrichment view.

#### S46d — CI guard + conventions

`scripts/db-checks.sql` and `.github/workflows/db-checks.yml` shipped to enforce the highest-leverage conventions on every push and PR to main:

1. All public views must be `security_invoker = on`.
2. All public tables must have RLS enabled.
3. No SECURITY DEFINER function in public may be callable by PUBLIC.
4. `rpc_job_close_report` regression test must pass.

Setup: one repo secret needed — `SUPABASE_DB_URL` (direct connection URI from Supabase dashboard, **not the pooler**). Without it, the action fails fast with a clear error. With it, CI catches the regressions that bit this audit before they can ship again.

`05_conventions.md` §20 (new) codifies the GRANT-then-RLS pattern for new tables (the Supabase October 30 enforcement), the SECURITY INVOKER mandate on views, the search_path requirement, the REVOKE-FROM-PUBLIC-then-GRANT pattern for SECURITY DEFINER functions, and the rule against `USING (true)` / `WITH CHECK (true)` on writes.

#### S46e — Deferred: vector extension move

Supabase advisor flagged `vector` extension installed in public schema (recommended pattern: dedicated `extensions` schema). Investigated and **deferred**: only the `postgres` role currently has `extensions` in its `search_path`. Moving `vector` would require ALTERing the `search_path` on four API roles (`authenticator`, `authenticated`, `anon`, `service_role`) **and** coordinating a PostgREST reconnect for the change to take effect for live clients. Dependency surface: 37+ extension-owned operator/function references plus the ivfflat index on `tbl_learnings.embedding`. Trade-off: substantial coordination risk for a cosmetic INFO-level warning with "no operational impact" (advisor's own framing). If a fresh Supabase setup is ever done, install vector into `extensions` from day one — backlog item logged.

#### S46f — Known remaining advisor noise (intentional, documented)

- `authenticated_security_definer_function_executable` on `get_my_role`, `get_my_freelancer_id`, `user_role`, `user_freelancer_id`, `rpc_active_workers`, `rpc_confirm_wo_completion`, `rpc_undo_wo_completion` — load-bearing for RLS or app code. Cannot be changed without breaking core functionality.
- 8 "always-true" INSERT policies on append-only tables (`tbl_job_attachments`, `tbl_maintenance_asset_photos`/`_checks`/`_flags`/`_logs`, `tbl_notifications`, `tbl_workshop_requests`) — defensible "anyone can submit" pattern; defense-in-depth would require adding `created_by` columns. Backlogged.
- `extension_in_public` for `vector` — see S46e.
- `auth_leaked_password_protection` disabled — Supabase Dashboard toggle, not a code change. Backlogged.

#### "If something breaks" — symptom → migration map

| Symptom in app | Likely cause | Where to look / verify |
|---|---|---|
| Financial dashboard shows £0 / "no data" for a user who used to see numbers | Views now respect RLS via INVOKER | Check `app_metadata.role` for the user; views like `qry_invoice_*` now respect RLS |
| Freelancer can't mark maintenance check complete | `tbl_maintenance_checks` UPDATE policy | Verify `completed_by` set to their `freelancer_id` |
| Freelancer can't save a task | `tbl_tasks` INSERT WITH CHECK | Verify `freelancer_id` = `get_my_freelancer_id()` |
| PM can't edit handover content | `tbl_handover_*` policies — PM/admin only | Verify role is `production_manager` or `admin` in `app_metadata` |
| Audit log writes fail | `tbl_audit_log` INSERT requires `user_id = auth.uid()` | Verify `auditedInsert` sets `user_id` from session |
| `fn_create_job_overhead` not callable from app | Trigger-only now | If app calls it directly, GRANT back to authenticated |
| `rpc_active_workers` / WO confirm/undo fails for anon | Authenticated-only now | Expected behaviour |
| Embedding search broken | Not S46 — vector extension untouched | Check separately |
| CI db-checks failing | New view without `security_invoker = on`, or new SECURITY DEFINER without REVOKE PUBLIC | Read the psql output; the failing check names the violator |

Recovery for any of these: each migration is in `apply_migration` form and individually revertable via Supabase MCP. `git revert` does nothing useful (no code change shipped) — write a reverse migration.

#### S46g — Hotfix: tbl_tasks UPDATE policy broke quick-timer logging

**Symptom Mateusz reported in real use:** "quick timer doesn't log — when i want to log in quick timer, it doesn't stop, but weirdly it shows in my notifications on a dashboard — but nowhere else."

**Root cause:** S46a tightened `tbl_tasks` UPDATE to PM/admin only, based on the documented "freelancer submits via INSERT, PM reviews via UPDATE" pattern. Missed the workflow in `/m/me/page.tsx → handleLogTimer`:
- **Path A** (route to WO at log time): freelancer UPDATEs their own task `in_progress → routed`.
- **Path B** (default, file as ad-hoc): freelancer UPDATEs their own task `in_progress → pending`.
- Plus `EditTaskSheet` lets freelancers edit their own pending/approved tasks.

All three are freelancer-initiated UPDATEs on `tbl_tasks`, all blocked by the new PM-only policy.

**Why it manifested as "shows in notifications but nowhere else":** the failure was **silent**. PostgREST's UPDATE endpoint does NOT return an error when RLS blocks the write — it just returns 0 rows affected with `error: null`. The client's `if (error) { toast.error... }` branch never fires; code proceeds to the `notify()` call, which writes to `tbl_notifications` (different table, INSERT policy still permissive), so the notification appears. UI cleared the activeTimer state locally, but on reload the task is still `status='in_progress'` in the DB and the timer comes back.

**Fix (migration `fix_tbl_tasks_update_policy_freelancer_own`):** PM/admin OR `freelancer_id = get_my_freelancer_id()` for both USING and WITH CHECK. Restores the working freelancer flows while keeping the core security boundary (Freelancer A cannot edit Freelancer B's tasks).

**Generalisable lesson — added to S46 recovery table above:**

> When a freelancer-initiated UPDATE fails silently (no error, no DB change, side-effects like notifications appear): **the RLS UPDATE policy is too restrictive**. PostgREST does not surface RLS denials on UPDATEs the way it does on INSERTs. The same pattern could lurk on `tbl_maintenance_checks` UPDATE (gated on `completed_by = my_freelancer_id`), `tbl_maintenance_logs` UPDATE (gated on `performed_by = my_freelancer_id`), and the `tbl_handover_*` family (PM/admin only). If a freelancer reports a silent failure on any of those, apply the same fix shape: USING `PM/admin OR own_row_owner_column = get_my_freelancer_id()`.

**Why this trap was hidden:** the audit-log helper (`auditedUpdate`) DOES return error info because it explicitly checks `.maybeSingle()` on the update query. But `handleLogTimer` uses a raw `supabase.from(...).update(...)` without checking `.data` is non-null. Defense-in-depth fix would be to check `data` not just `error`, but the simpler answer is "don't write RLS policies that block legitimate workflows".

#### S46h — Sweep: two more silent failures + an unchecked error

**Trigger:** Mateusz, after S46g: *"i hate silent errors — do a sweep now."*

Sweep methodology: Python walk of `src/app/m/**` finding every `supabase.from(X).(update|insert|delete|upsert)(...)`, cross-referenced against the current RLS UPDATE/INSERT/DELETE policy for each table to identify freelancer-blocked writes.

**Three confirmed bugs (one migration `fix_silent_failures_wo_status_and_schedule`):**

1. **`m/task/page.tsx:165` — `tbl_work_orders` UPDATE blocked.** Freelancer starts a WO timer; the flow tries to flip WO status to `In-Progress` if it's `Ready`/`Not-Started`. RLS policy was PM/admin/foreman only. Pre-dates S46 — has been broken silently for freelancer users since whenever the WO status transitions were wired up. PMs (like Mateusz) didn't see it because the policy matches their role.

   Fix: `USING (PM/admin/foreman OR (freelancer AND status IN ('Ready','Not-Started')))`, `WITH CHECK (PM/admin/foreman OR (freelancer AND status = 'In-Progress'))`. Allows the specific transition; doesn't widen further.

2. **`m/schedule/page.tsx:254` — `tbl_freelancer_schedule` DELETE blocked.** Freelancer taps "restore availability" on a day they marked Unavailable; DELETE was PM/admin only. Silent fail (DELETE behaves like UPDATE — 0 rows deleted, no error).

   Fix: USING `PM/admin OR (freelancer AND own row AND status='Unavailable')`. Status restriction prevents a freelancer deleting PM-made bookings.

3. **`m/schedule/page.tsx:249` — `tbl_freelancer_schedule` INSERT blocked.** Freelancer marks day unavailable; INSERT was PM/admin/foreman only. PostgREST DOES surface RLS denials on INSERT (the silent-UPDATE problem doesn't apply to INSERT), but the client code was `await supabase.from(...).insert({...})` without checking `error`, so toast said success while nothing happened.

   Fix: WITH CHECK `PM/admin/foreman OR (freelancer AND own AND status='Unavailable')`. Same status restriction as DELETE.

**The bigger pattern (not fixed in S46h — backlog):** roughly 90 of the 96 `.update()` call sites in `src/` are raw `supabase.from(...).update(...).eq(...)` without inspecting returned data. Most are PM-callable on PM-permissive tables so they work today, but they're all latent silent-fails if RLS ever tightens on those tables. The `auditedUpdate` helper has the same gap unless callers pass `expectedUpdatedAt`. Backlog item logged: harden `auditedUpdate` to surface zero-rows-no-error and migrate raw call sites to it.

### S45 — 14 May 2026

Closing job 13775 FA Léoube surfaced two related problems with the close report's commercial figures — one a data fix, one a genuine design gap. No schema objects added; one RPC body change (corrected once — see S45b → S45c), two UI surfaces, one direct-SQL data correction. Session closed: schema counts verified live (57 tables / 34 views / 18 RPCs / 2 cron jobs), all four commits deployed clean.

#### S45a — FA Léoube quote stuck in Issued status

**Trigger:** Mateusz went to close FA Léoube; the close report showed **QUOTED £0.00** despite the job having labour and materials against it. He flagged a hunch we'd seen this before.

**Diagnosis:** Job 13775 had exactly one quote — `40815 v15`, 47 lines, £135,405 of client lines, all present and correct — but its status was `Issued`, never flipped to `Accepted`. `qry_job_accepted_quote` (the close report's Quoted source) sums lines only for `status = 'Accepted'` quotes, so it returned nothing.

**Why it felt familiar — third distinct cause of the same symptom:**
- S41 — `tbl_quotes.quote_value` was NULL. Fixed by making the view sum from lines.
- S42b — two `Accepted` quotes on one job. Fixed by consolidating to one.
- S45a — quote total fine, lines fine, quote just stuck in `Issued`.

**Fix:** `UPDATE tbl_quotes SET status = 'Accepted' WHERE quote_id = 10` via direct SQL (confirmed with Mateusz first — key-table write + commercial-state judgement). The job ran and is being closed, only one quote exists, so `Accepted` is unambiguous. `qry_job_accepted_quote` then resolved £135,405.00.

**Recurring-pattern note:** three "Quoted shows £0 on close" bugs, three different causes. Per conventions §5 (when the same bug is fixed repeatedly, the fix is usually a missing invariant) — a guard is warranted. Added to cleanup backlog: a soft warning in the Job Complete dialog when a job has no `Accepted` quote, and/or a watcher view of Complete jobs with no Accepted quote. Not bundled into this session.

#### S45b — Close report: workshop-quoted differential

> ⚠️ **Superseded by S45c below** — S45b shipped with the wrong definition. Read S45c for the corrected logic. Kept here for the design-discussion record.

**Trigger:** With the quote flipped, the close report showed QUOTED £135,405 and a margin of 98.8%. Mateusz: *"quoted now shows total value which is very misleading. There should be a differential, like in other parts of our financials — quoted vs quoted for build."* The £135,405 is the whole-event quote; the workshop only delivers a slice of it, so margin against the full figure is meaningless.

**Design discussion — definition of "quoted for build":**
- First considered **scope-linkage** (quote lines with a scope item / WO against them). For FA Léoube that was only 3 lines / £6,850.
- Mateusz corrected this: scope-linkage *undercounts*. Workshop-delivered lines that get charged but never need a WO — re-used kit from other events ("sometimes we're smart enough to re-use stuff, still charging good money") — would be missed. The honest signal is the **manually-maintained `category` field**, not WO linkage.
- I'd wrongly written off the category field as unreliable (saw values like `Install`, `Sound` mixed with `Workshop`, `Subcontracted` and assumed import noise). It's not noise — Mateusz maintains it by hand. Corrected course.

**Rule shipped in S45b (WRONG — see S45c):** exclude-list — sum non-overhead lines where `category NOT IN ('Subcontracted','Provisional')`. Produced £112,615 for FA Léoube. Built `quote_workshop` CTE in `rpc_job_close_report`, both UI surfaces showed the QUOTED card with a "Workshop £X" sub-line and computed margin against it.

#### S45c — Correction: match the established cost-breakdown definition

**Trigger:** Mateusz compared the close report (£112,615 "Workshop") against the job page Cost Analysis panel (£8,850 "Quoted (workshop + stock)") — *"Workshop number is wrong, it should be what it is on job page, why is so badly different?"*

**Root cause — my error:** I invented a new definition for the close report instead of reusing the one that already existed. `cost-breakdown.tsx` (the job page Cost Analysis) already computes "workshop + stock" as an **include-list**: category text contains `workshop`, `stock pick`, or `stock-and-hire`. For FA Léoube that's the 4 `Workshop` lines = £8,850. My S45b exclude-list (£112,615) counted `Install` / `Sound` / `Lighting` / `Production` too. The earlier "Install, yes ours" instruction was about a *different axis* — "ours vs subcontracted" — not "bench work vs other Starlight work". The close report's margin is the workshop's margin, so it has to be against the workshop's quoted slice. Should have reused the existing logic from the start; consistency across financials is the whole point of the original ask.

**Fix:** rewrote the `quote_workshop` CTE in `rpc_job_close_report` to the include-list — `LOWER(category) LIKE '%workshop%' OR LIKE '%stock pick%' OR LIKE '%stock-and-hire%'` — mirroring `cost-breakdown.tsx` exactly. UI labels changed "Workshop" → "Workshop + stock" to match the job page's terminology. No UI logic changes — components already read `quoted_workshop`.

**Verified:** FA Léoube now returns `quoted` £135,405 / `quoted_workshop` £8,850 / margin **81.8%** — exact match to the job page's Cost Analysis ("Live margin 81.8% / £7,242.94 profit").

**Debt logged:** the workshop-quote definition now lives in two places — `rpc_job_close_report` (SQL) and `cost-breakdown.tsx` (TS). Both must move together. Backlog item added to consolidate into a shared view if it's touched again.

**Note for Mateusz:** for FA Léoube specifically the headline `quoted` (£135,405) and `quoted_workshop` (£8,850) are very far apart because this job is mostly install/sound/lighting with only a small bench-build slice. The differential is doing exactly its job — margin is now 81.8% against the £8,850 the workshop actually quoted, not a fantasy 98% against the whole event.

#### Backfill — Job 13744 Nabihah Iqbal (carried over from prior turn)

Job 13744 "Nabihah Iqbal May 2026" entered earlier in the session from quote PDF `40722 v7` — 17 lines, £22,391, all `Provisional` category for Mateusz to redistribute, Goodwood, 23 May 2026. Same retrospective-entry pattern as Job 13809 (S43a). Overhead bucket auto-created via trigger. Direct-SQL backfill, no audit entry.

### S44 — 14 May 2026

Two threads from a design discussion: a workflow gap on the scope page (unassigned items stuck without a way to attach to a WO that already exists) and a new BOM type to support build-time pick-lists rather than cost rollups. Two deploys, one schema migration.

#### S44a — Add unassigned items to existing WO

**Trigger:** Mateusz reported two recurring failure modes — (1) "people working on two work orders but clocking into one" because the WO they clocked into didn't contain all the items they actually built; (2) "I forgot to add items to a WO that already started." Both collapse to a missing flow: scope items that ended up in the Unassigned Items panel had only one route out, "Create new WO." There was no way to add them to a WO that already existed.

**Design discussion:** considered making this a toggle inside `CreateWODialog` ("New WO / Existing WO"). Rejected — the two paths have completely different inputs (new WO needs activities/description/complexity/finish; existing WO just needs a target picker). Kept them as separate buttons in the Unassigned Items panel header, both gated on `selectedItemIds.size > 0`. New button only renders when at least one live WO exists on the scope.

**Three stress tests passed:**
1. **Filter to live WOs only** — picker excludes `Voided`, `Complete`, and `Cancelled`. Adding scope to a closed/voided WO would break margin reports and the audit story.
2. **No sub-WO hour reattribution** — the design intentionally accepts that hours stay at WO level. The whole reason to merge items onto a WO is that freelancers don't differentiate within a clocked session.
3. **One scope item, one WO target per add** — bulk multi-item insert into one WO. No splitting a single item across two WOs (would break cost reconciliation).

**Implementation:** New `AddToExistingWODialog` component. On mount fetches existing `tbl_jobitem_workorder` rows for the selected items × picker WOs to build a deduplication Set (the junction table has no UNIQUE on `(job_item_id, work_order_id)` — synthetic `junction_id` PK only, so app-layer dedup is required). On mount also fetches hours-logged per WO from `tbl_wo_time_entries` to surface as context in the picker. Insert is plain `.insert([...])` on the junction (not in `AUDITED_TABLES` — junction tables stay raw). Fires `notify({ type: 'scope_change', woId, actionUrl: '/jobs/.../scope/...?wo=...' })` so anyone watching the target WO sees the new items have landed. PM gets a `sonner` toast on completion; panel calls `loadAll()` then expands the target WO.

**Verified end-to-end:** build clean, deployed to `workshop-five-gamma.vercel.app` as commit `4e02d93`.

#### S44b — Fixings & Consumables category

**Trigger:** Mateusz wanted a 4th BOM type alongside the existing three (Stock Item / Bespoke Item / Material) at the scope-level Build Plan. After early design framing leaned cost-tracking, he course-corrected: *"the reason for me to add fixings tools to wo is not cost tracking — consumables are very very marginal compared to quote — is more to help with creating a fully fledged packing/needs list."* That changed the whole shape. The category exists for **operational** reasons (don't start a build with half the kit missing), not financial ones. Most cost-side machinery falls away.

**Two-mode design:** counted fixings (12 specific brackets for a build) need a real quantity; provisioned consumables (sandpaper, masking tape, 6mm drill bit) just need a presence flag. Considered a separate boolean column; rejected as overcomplication. Mateusz's call: "qty can be NULL." `NULL quantity` becomes the mode marker — same column, same insert path, mode is implicit in whether qty is set.

**Implementation:**
- **Schema migration (one DO block):** new `tbl_master_lookups` row (lookup_id = 108, "Fixings & Consumables"), matching `tbl_material_category_config` row (Each/Each, no fixed_dimension, bin_pack_mode='none'), new `tbl_stock_items.item_type` column (VARCHAR NOT NULL DEFAULT 'stock', 2766 existing rows backfilled), CHECK constraint `chk_bom_qty_null_only_fixings` on `tbl_wo_bom` permitting NULL `quantity` only when `material_category = 108`.
- **Picker dialog (`FixingsPickerDialog`):** two modes — catalogue search (filtered to `tbl_stock_items` where `item_type='fixing'`) and freeform custom entry. Qty field defaults blank with placeholder "leave blank" and clear copy ("Blank qty → renders on the pick-list as 'needs this', no count"). Insert via `auditedInsert` on `tbl_wo_bom` with `work_order_id=null`, `scope_item_id={current}`, `material_category=108`, `from_stock=false`. Dialog stays open between adds (rapid-entry pattern from convention §8.5).
- **State preservation:** `scopeBomRows` type changed from `quantity: number` to `quantity: number | null`; loader switched from `b.quantity || 0` to `b.quantity ?? null`. Carries `material_category` through state too.
- **Render polish (scope BOM table):** fixings rows get an amber pill ("Fixings") instead of the grey "Scope" pill; NULL-qty rows prefix the description with `☐`; the qty input renders empty with placeholder `—` for fixings; total column shows `—` instead of `£0.00` on NULL qty. Cost rollups untouched — `qry_bom_enriched` already uses `COALESCE(quantity, 0)` so NULL silently computes as £0 across every cost surface.

**Two stress tests passed:**
1. **CHECK constraint covers all write paths** — no scope/WO BOM insert can land NULL qty except for category 108. Existing 191 BOM rows verified all non-NULL before constraint added.
2. **Cost-side invariant intact** — S37 (line total = qty × unit_cost) holds for all cost-bearing categories. Fixings with NULL qty produce £0 line cost, which is the intended outcome ("consumables are very very marginal compared to quote").

**Deferred to v2 (cleanup backlog below):**
- Traveller print render — currently shows fixings inline with the scope BOM. Should surface as its own "Fixings & Consumables" pick-list section on the WO traveller.
- WO-level fixings — current flow puts fixings at scope-level only. For WO-specific fixings (per-activity), a follow-up could route to the WO's own BOM. Probably YAGNI until Mateusz hits a real case.
- Mobile (`/m/wo/[woId]`) view — fixings will render through the existing BOM section, but the checkbox-style "shopping list" UX hasn't been built on the freelancer surface yet.

**Schema delta this session:** +1 master_lookup row, +1 material_category_config row, +1 column on `tbl_stock_items`, +1 CHECK constraint on `tbl_wo_bom`. No new tables, views, or RPCs. Live totals after S44 unchanged: 57 tables, 34 views, 18 RPCs, 2 cron jobs.

### S43 — 12 May 2026

Two threads: a retrospective job entry to capture an event that already happened, and the restore of the freelancer-side MARK COMPLETE flow with a PM sanity-check layer on top. One deploy, one schema migration, one direct-SQL data backfill.

#### S43a — Job 13809 Oscars Academy Spring Event — retrospective entry

**Trigger:** Event already happened (9 May 2026, 45 Park Lane). Mateusz wanted the quote in the system so he could attach actuals (invoices, retrospective time) and eventually close the job through the standard Job Complete flow rather than have it live outside the system.

**What landed:**
- New job 13809, `client_name` deliberately NULL (privacy), event date 9 May 2026, location "45 Park Lane", `job_status='Active'` (will close once costs added).
- New quote 15 (`quote_reference='41058'`, `quote_version='v4'`, status `Accepted`), `quote_description='Oscars Academy Spring Event'`.
- 17 quote lines spanning 5 sub-groups from the source PDF: Design and Décor (£5,230), Lighting (£1,570), Sound (£1,375), Crew (£2,700), Transportation (£1,135). Sums to £12,010.00 nett, matches PDF exactly.
- All 17 lines categorised `Provisional` per Mateusz's instruction — he'll distribute Workshop/Provisional/Stock Pick/Subcontracted manually rather than have me guess from the line text.
- Tech-spec notes ("8x E8 on round bases in restaurant D40, QL1", "Additional 3x E8 + D12", "2 x vans each way") routed to `pm_note`, not the public-facing `line_text`.
- The existing `trg_create_job_overhead` AFTER INSERT trigger on `tbl_production_plan` fired automatically — overhead quote line + general scope item + `ACTIVITY.OVERHEAD` work order all auto-created. `qry_job_accepted_quote` correctly excludes the overhead line via its existing `<> 'Overhead'` filter, returning the £12,010 cleanly.

**Workflow learning surfaced and codified:** when a quote PDF says things like "Allowing for 24 units" with a total, model as `quantity=24, unit_price=40, line_value=960` rather than `quantity=1, unit_price=960`. Pattern was already in Job 13757 (terracotta candles), worth keeping consistent.

**Audit:** direct-SQL backfill via Supabase MCP, no audit log entry. Same precedent as S42 Job 13757 quote consolidation.

#### S43b — WO completion confirmation workflow

**Trigger:** Mateusz reported the MARK COMPLETE button on `/m/wo/[woId]` had "disappeared." Diagnosis: the button was still in the code but gated `allEntriesClosed && wo.status === "In-Progress"`. Out of 88 active WOs, exactly 1 was `In-Progress` at the moment of check — the gate was so narrow it hid the button on 98%+ of WOs in practice.

**Design discussion:** considered three shapes before building:

1. **New WO status `"Pending Review"`** — simple (one new enum value, no new table) but pollutes every existing filter site (Workshop view, Done filter, traveller QR, capacity, dashboard). Rejected on blast radius.
2. **Parallel-row proposal table with deferred apply** — mirrors S42's `tbl_wo_time_entry_edits` pattern; WO stays In-Progress until PM approves. Rejected because Mateusz's framing was "just sanity check, mark as complete" — i.e. he doesn't want to gate completion behind his approval, he wants the WO to LOOK done immediately and his confirm to be a stamp afterward.
3. **Parallel-row proposal table with immediate apply + undo** — chosen. WO status flips to Complete on freelancer mark; proposal row records who/when/photo/note; PM Confirm marks proposal `confirmed`; PM Undo restores `previous_wo_status` and clears completion fields.

This is the deliberate inverse of S42's edit pattern. Codified in `05_conventions.md` §3.8 — the choice is driven by whether the canonical change moves money. Time-entry edits move money → gate them. WO status changes don't (the time entries + BOM carry the costs) → apply immediately and provide a reversal path.

**Schema:** new table `tbl_wo_completion_proposals` (12 cols, partial unique index `uq_one_awaiting_per_wo` on `status='awaiting_confirmation'`, RLS modelled on `tbl_wo_time_entry_edits`). New RPCs: `rpc_confirm_wo_completion` (idempotent re-assertion of Complete state, heals partial-failure orphans) and `rpc_undo_wo_completion` (restores `previous_wo_status` snapshot, clears `completion_photo_path` + completion timestamps).

**Audit:** `tbl_wo_completion_proposals` registered in `AUDITED_TABLES` with PK `proposal_id`. App-side INSERT and the WO UPDATE both go through audited helpers.

**Notification type added:** `wo_completion_undone` (severity `warning`, `actionUrl` → `/m/wo/[woId]`).

**UI:**
- `/m/wo/[woId]` — gate relaxed to `status !== "Complete" && !myOpenEntry`. MARK COMPLETE sheet now includes an optional textarea for a "what's done" note that flows into `tbl_wo_completion_proposals.proposed_note`. Photo block in WO header card is state-aware: amber "Awaiting PM confirmation" / green "Confirmed by PM" / unbranded "Completion Photo" (legacy fallback for the 21 pre-existing Complete WOs with no proposal row). Undone state surfaces a red "PM undid the completion" warning above the action buttons, including the PM's `review_note`.
- `/review` — new `ConfirmCompletionsPanel` component, expanded by default, surfaced above the Workshop Overhead panel. One row per awaiting proposal with photo thumbnail (tap to open), freelancer name, scope/job, optional note, **Confirm** / **Undo** buttons. Undo opens a modal accepting an optional reason note that flows back to the freelancer via the new notification.

**Partial-failure handling:** the app-side mark-complete does two writes (proposal INSERT + WO UPDATE). If the second fails, the proposal exists but the WO isn't Complete. Mateusz sees it in the Confirm panel anyway; tapping Confirm runs the RPC which idempotently re-asserts Complete state via `COALESCE(existing, proposal_value)` for photo path and timestamps. Self-healing.

**Verified end-to-end:** migration applied, 12 columns landed, 4 indexes, 3 policies, 2 RPCs. Build clean. Deployed to `workshop-five-gamma.vercel.app` as commit `77e46ec`.

**Schema delta this session:** +1 table, +4 indexes, +3 policies, +2 RPCs, +1 audited table, +1 notification type. Live totals after S43: 57 tables, 34 views, 18 RPCs, 2 cron jobs.

### S42 â€” 11 May 2026

Five threads. Two reporting fidelity fixes, one tactical quote consolidation, one mobile UX deepening (cutlist inline + 10-day overview), and the big arc: a full edit-time-entries workflow that includes the unification of the WO-vs-task dichotomy on the freelancer side. 10 deploys, 1 schema migration plus a follow-up column add.

#### S42a â€” Material cost reporting: Plan vs Actual split

**Trigger:** Complete Job dialog showed `Materials: £0.00` on Tramp Club Dancing podium (job 9) despite invoices being allocated. The number was wrong, and the meaning was also wrong: BOM (what we planned to spend) and invoice allocations (what we actually spent) were collapsed into a single field that took whichever was non-null.

**Fix:** `rpc_job_close_report` rewritten to return three distinct fields:
- `material_cost_planned` â€” sum of BOM at line cost (`quantity × unit_cost`)
- `material_cost_actual` â€” sum of invoice allocations via `qry_invoice_job_rollup`
- `material_cost_committed` â€” `MAX(planned, actual)` â€” the prudent forecast number; what shows in commercial summary

Dialog now reads `Plan £X / Actual £Y` with red on overrun. `/reports/job-close/[jobId]` mirrors. "Total Committed" replaces "Total Actual" in commercial summary header. The "unallocated invoices" warning now correctly compares `invoiced_total` against `material_cost_actual` (was comparing against the collapsed field, which produced a false-positive warning whenever planned > actual).

**Why this matters past the immediate bug:** Plan/Actual separation is the foundation for material variance reporting and eventually for the AI quoting agent. Without it, "did we under-estimate materials" is an unanswerable question.

#### S42b â€” Quote consolidation: Job 13757 Suneil Birthday Tite Street

**Trigger:** Job 13757 had two quotes (quote 12: £124,480, quote 13: £33,035) reflecting an iterative scope. The PM wanted a single canonical accepted quote labelled "40922 v16" so all downstream summaries (Quoted column, Plan/Actual margin, close report) reflected the real commercial value. Both old quotes were Accepted, which is also wrong on principle â€” there can only be one accepted quote per job.

**Migration:** `job_13757_consolidate_quote_v16_final` â€” created quote 14, 60 lines, £180,265. Preserved scope 54 by relinking from old quote_line 382 to new quote_line 442 (the equivalent in the consolidated quote). Hard-deleted quotes 12 and 13 and their lines. Verified scopes, BOM, and WO links continued to work.

This was tactical, but the cleanup pattern is worth keeping: any future quote-consolidation has to relink scope items (the only thing that points at quote_line_id) before deleting the source lines.

#### S42c â€” Jobs page: Budget → Quoted

**Trigger:** Jobs list "Budget" column was sourcing from `tbl_production_plan.budget_allowance`, which (a) was almost always NULL because nothing populated it, and (b) was semantically misleading â€” what the PM wants to see at-a-glance is the accepted quote total (live, lines-derived), not a vestigial "budget" concept that never had a write path.

**Change:** `/jobs/page.tsx` column renamed `Budget` → `Quoted`. Now joins `qry_job_accepted_quote` per row. `budget_allowance` field stays on `tbl_production_plan` for a potential future "client-stated budget vs our quoted price" comparison concept, but is not currently read or written anywhere except this 1 surface that we just stopped using.

**Backlog:** 4 other read-sites still reference `budget_allowance` (`/pm/jobs/[id]`, review pages, handover, job-close). Cosmetic-only on those surfaces; will mop up in a future sweep.

#### S42d â€” Cutlist (and any OneDrive doc) inline viewing

**Trigger:** Freelancers viewing a cutlist on mobile got forced into a download → PDF viewer round-trip, which is friction-heavy and creates orphaned files in their Files app. Same on desktop.

**New endpoint:** `/api/onedrive/view` re-streams the file from OneDrive with `Content-Disposition: inline` (the existing `/download` endpoint forces `attachment`). Auth via standard `Authorization: Bearer` header **or** via `?token=` query param â€” the latter is necessary because `window.open(url, '_blank')` doesn't carry custom headers, and the inline-view UX wants to land in the browser's native PDF/image viewer.

**Token strategy:** reuses the same calendar-download token pattern (HMAC-SHA256 signed, 72h expiry, see SP-013). Same secret. Endpoint validates the token, fetches via Graph API, streams back.

**Surfaces wired:**
- Desktop `wo-documents-panel.tsx` â€” Eye icon on hover next to the existing Download icon
- Mobile `mobile-wo-docs.tsx` â€” tap-to-view (the dominant action), long-press for download

#### S42e â€” Mobile time entry: completeness, editability, and unifying the WO/task flow

The largest piece this session. Five tightly-related shipments that together remake the freelancer time-entry surface on `/m/me` from "log against a WO or fail" into "log time, optionally attribute, edit anything that needs fixing."

**├ S42e-1: 10-day overview with backfill**

`/m/me` got a "Last 10 Days" panel above Recent Entries. Each row is a calendar day with total hours; red when entries exist but total < `FULL_DAY_THRESHOLD` (9h), neutral when there are zero entries (assumed not a workday). Tap to expand the day's entries. Per-day "Add entry" button reuses the LogSheet for backfill against that specific date.

LogSheet was generalised with new props (`defaultRoutedWo`, `woPickerLabel`, `hidePhotos`, `showDatePicker`, `defaultDate`) so the same component drives every time-entry input across the mobile app instead of needing parallel implementations.

**├ S42e-2: Pending-edit workflow for WO time entries**

**Goal:** let freelancers fix incorrect entries without ever touching the canonical row until a PM approves. "Nothing is broken while pending" is the explicit invariant â€” cost/margin/daily-timesheet-flag reports must continue to use the un-mutated values throughout the pending state.

**Schema added:** `tbl_wo_time_entry_edits` â€” `edit_id, entry_id, freelancer_id, proposed_actual_hours, proposed_work_order_id, proposed_date, reason (NOT NULL), status (pending/approved/rejected/withdrawn), reviewed_at, reviewed_by, review_note, created_at, updated_at`.

Constraints:
- `proposed_date` column added in a second migration once date editing was scoped in (see S42e-4)
- Partial unique index `uq_one_pending_per_entry WHERE status='pending'` â€” one in-flight proposal per entry (freelancer revises in place rather than stacking)
- RLS: freelancer can read/insert/update own pending; PM/admin updates any; **no DELETE for anyone** — audit trail survives even withdrawal (which is a status change, not a delete)
- Foreign key on `entry_id` to `tbl_wo_time_entries` is `ON DELETE CASCADE` because if the canonical entry is removed, the proposed edit is meaningless

**RPCs added:**
- `rpc_approve_time_entry_edit(p_edit_id integer, p_review_note text DEFAULT NULL)` â€” single transaction. Applies proposed values, rebuilds timestamps from `proposed_date + actual_start_timestamp::time` (preserves time-of-day across date moves), recalculates `entry_cost` from current `applied_hourly_rate`, marks the edit row approved. Defence-in-depth role check accepts `admin | pm | production_manager`.
- `rpc_reject_time_entry_edit(p_edit_id integer, p_review_note text DEFAULT NULL)` â€” marks the edit row rejected with the note; PM's note travels back to the freelancer so they understand why and can revise.

**UI:**
- `src/components/edit-time-entry-sheet.tsx` (new) â€” wraps LogSheet with reason required + photos hidden + date picker on. Detects existing-pending edit on the same entry and UPDATEs that row instead of inserting a new one (matches the unique-pending constraint). Withdraw button when there's a pending revision in-flight.
- `/m/me` â€” every WO entry in Last 10 Days expanded view and Recent Entries is now tappable. Pending and Rejected badges show inline. Rejected entries show the PM's `review_note` so the freelancer sees the reason and can revise.
- `/review/timesheets` â€” new "Edit requests" section at top of the page. Each row shows the freelancer name, entry date, a current→proposed diff (date · hours · WO with date prefix shown only when changed, to keep the line compact in the common case), the freelancer's reason, and Approve/Reject buttons. Reject prompts for an optional note.

**├ S42e-3: Click-to-edit ad-hoc tasks (with date editing)**

Edit flow for tasks is structurally simpler than WO entries â€” tasks don't carry cost into reports until a PM approves them as overhead, so we don't need a parallel-pending-row mechanism. Direct edits work, with one nuance for already-reviewed tasks.

`src/components/edit-task-sheet.tsx` (new):
- `status = pending` → direct update to title / hours / `worked_date`. PM hasn't reviewed; latest values will be what they see when they do.
- `status = approved_overhead` → same update **plus** revert status to `pending` and clear `review_note`. Fires a `task_submitted` notification with severity `warning` so the PM sees this is a re-review case and the previously-counted overhead is now contingent again.
- `status = routed` → not editable here. The task is just a paper trail; the WO time entry that was created when it routed is the real record and has its own edit flow.
- `status = rejected` → terminal; not editable from mobile. Freelancer can re-log if needed.

EditableTask interface gained `worked_date`. `/m/me` passes the calendar day for Last 10 Days clicks and the entry date for Recent Entries clicks.

**├ S42e-4: Audit map registration for `tbl_tasks` (the silent-fail bug)**

First save of an edited task errored with `column tbl_tasks.id does not exist`. Cause: `tbl_tasks` was missing from `AUDITED_TABLES` in `src/lib/audit.ts`, so `auditedUpdate` couldn't find a PK column and fell back to `.eq("id", recordId)`. The PK is `task_id`. Added the mapping.

This is a class of bug worth naming: **any audited mutation against a table missing from the map fails at the row-match step with a misleading error**. The audited helpers should arguably refuse to run on an unregistered table rather than fall through to a bad column reference, but for now: adding the table to the map is the fix.

**├ S42e-5: WO optional in backfill — unifying the dichotomy**

**Trigger:** Mateusz: "I know that in some bits we required WO or tasks but it proves to be a pain." The friction was on the backfill flow â€” a freelancer thinks "I worked 4h on Tuesday" but is forced to pick a WO they may not remember. The system was inflicting an upfront classification decision that didn't need to be theirs.

**Change:** `handleBackfillSubmit` now branches on whether a WO was picked:
- WO picked → unchanged behaviour. Creates a `[Backfill]`-flagged row in `tbl_wo_time_entries`. PM sees in `/review/timesheets`.
- WO **not** picked → files as a pending ad-hoc task in `tbl_tasks` with `worked_date = chosen date`. PM sees in `/review/inbox`. Notes field becomes the task title (required â€” an untitled task is useless to a PM).

The dichotomy "WO entry vs ad-hoc task" is now an implicit consequence of whether the freelancer picks a WO, not a required gate they have to clear before they can save. From the freelancer's perspective there is **one** mental model: log time, optionally attribute, let PM sort out anything ambiguous.

Picker label is now "Work Order (optional)". Sheet sublabel: "Pick a WO if you know it, or just describe the work."

**On the horizon for time-entry editability:** click-to-edit pattern extends naturally to `/m/wo/[woId]` and `/m/schedule` (shared sheet components are ready). Delete proposals (`proposed_action='delete'` column on the edits table) are a clean future extension if a real "I logged this twice" case comes up.

---

#### S42 schema summary

- **+1 table:** `tbl_wo_time_entry_edits` (with `proposed_date` added in a follow-up migration)
- **+2 RPCs:** `rpc_approve_time_entry_edit`, `rpc_reject_time_entry_edit`
- **Updated RPC:** `rpc_job_close_report` now returns three material-cost fields (planned/actual/committed) instead of one
- **+1 audited table:** `tbl_tasks` registered with PK `task_id`
- **Quote 14 (Tite Street consolidated)** is the only Accepted quote on Job 13757; quotes 12 and 13 hard-deleted
- **0 schema changes** for: Jobs Budget→Quoted (pure read change), cutlist inline viewing (new API route, no DB), WO-optional backfill (pure routing logic)

Totals after S42: **56 tables, 34 views, 16 RPCs.**

### S41 — 6 May 2026

Three pieces of work plus a wrap. Total: 4 deploys (Route Task tweak, freelancer onboarding tightening, Job Complete state, drift fix), 2 schema migrations on top, plus the doc migration as session close.

#### S41a — Route Task Modal: allow routing to Complete WOs

**Trigger:** PM workflow sometimes needs to route a late-arriving ad-hoc task or manually log time to a WO that was already marked Complete. The modal previously filtered to `["Ready", "In-Progress", "Not-Started"]`.

**Changes (3 surfaces, one logical fix):**
- `src/components/route-task-modal.tsx` — primary `/review/inbox` flow.
- `src/app/(dashboard)/crew/[id]/page.tsx` `openRouteModal` — per-freelancer routing.
- `src/app/(dashboard)/crew/[id]/page.tsx` `openAddEntry` — PM manual time entry.

All three now include `Complete` in the status filter. Within each scope group, active WOs sort first; Complete WOs at the bottom dimmed at 60% opacity. The existing `statusClass()` helper already returns `badge-complete` for Complete — visual differentiation came free. The crew page's two inline lists previously hardcoded an `In-Progress` ternary; both switched to `statusClass()` for consistency.

**Freelancer mobile flows (`/m/me`, `/m/task`) deliberately unchanged** — letting freelancers self-log against Complete WOs would dilute the "complete = done" signal that drives the Done filter and traveller QR flow. PMs route, freelancers don't.

#### S41b — Freelancer onboarding tightening

**Trigger:** PIN generator on the Mobile Access dialog produced 4-digit PINs only despite the label saying "4–6 digits."

**Bugs found and fixed:**
1. **Generator hardcoded to 4 digits.** `Math.floor(1000 + Math.random() * 9000)` returns 1000–9999. Fixed to `100000 + Math.random() * 900000`.
2. **Silent dead write to a non-existent column.** `savePin()` ran `supabase.from("tbl_freelancers").update({ pin: newPin })` after the auth-sync API call — but `tbl_freelancers.pin` doesn't exist in the schema (the legacy column was dropped pre-S41). Error never checked because the success toast already fired. The actual auth user IS updated correctly via the API; the dead write was just decorative noise. Removed.
3. **Privilege-escalation foothold.** `/api/auth/freelancer-sync` read role from `app_metadata.role || user_metadata.role || "freelancer"`. `user_metadata` is user-editable per Supabase Auth; the fallback was a vector if any future endpoint exposes user-metadata write. Removed fallback. Per SP-006/SP-008, role reads must use `app_metadata` only.

**Consistency cleanup:**
- Add Freelancer dialog had its own redundant PIN input (basic, no Generate button, no eye toggle, no validation, no WhatsApp helper). Mobile Access dialog has the polish. **Dropped the Add Freelancer PIN field entirely.** Onboarding is now one canonical path: Add → row appears → key icon → Mobile Access dialog → set PIN → WhatsApp invite.
- API body param: accepts `password` (preferred) or `pin` (deprecated, back-compat). Crew page sends `password`.
- Mobile Access dialog: copy "PIN (4–6 digits)" → "PIN (6 digits)". Save validation `>= 4` → `>= 6`. Existing 4-digit PINs continue to work (Supabase Auth has them hashed); only newly-set or reset PINs must be 6 digits.

**Doc consequence:** SP-002 in v2.0 of `04_security_policy.md` claimed freelancer passwords are ≥ 8 chars and `tbl_freelancers.pin` was deprecated. Reality: 6-digit numeric PIN, fully deployed and working. Fixed in v2.1 of the security policy as part of this session's doc migration. Tradeoffs and mitigations enumerated in SP-002.

#### S41c — Job Complete state

**Goal:** Replace "back of napkin" job-closing with a deliberate Complete state, an optional close-note prompt, and a print-friendly close report. No commercial freeze — costs remain live (post-complete edits are tracked in `tbl_audit_log` and surfaced via the report).

**Schema:**
- `tbl_production_plan` += `completed_at timestamptz`, `completed_by integer` (FK `tbl_freelancers`), `close_note text`. All nullable.
- New RPC: `rpc_job_close_report(p_job_id integer)` — single-call payload returning header, commercial summary (quoted, labour cost+hours, materials planned/reconciled, invoiced total, unallocated invoice total), labour by freelancer, labour by activity, materials by category and supplier, WO variance top 8, scope cost (per scope material spend), learnings linked to job, post-complete edit count from audit log.
- Verified end-to-end against Grosvenor (job 8): £377k quoted, £22.8k labour / 801hrs, £13.5k materials, 8 freelancer rows, 8 variance rows.

**UI:**
- `src/components/job-complete-dialog.tsx` (new) — confirm modal showing live numbers from the RPC, soft warning if any non-OVERHEAD WOs are still active (does NOT block — soft signals principle), optional close note textarea, "Skip & Complete" button when empty.
- `src/app/(dashboard)/jobs/[id]/page.tsx` — toolbar shows "Complete Job" button (Active jobs) or "Close Report" + "Reopen" buttons (Complete jobs). `handleReopen` clears `completed_at` and `completed_by` but **preserves `close_note`** as context. Audit-logged.
- `src/app/(dashboard)/reports/job-close/[jobId]/page.tsx` (new) — print-friendly report. Renders for any job; "Interim" badge if not yet Complete. Margin colour-coded (green ≥25%, amber ≥10%, red below). Post-complete edits warning when audit shows mutations after close.
- Two bugs in the dialog from a mid-session cut-off, fixed at next pickup: `getAuditContext` takes `supabase` as arg (was called without), and `completed_by` resolves from `user.user_metadata.freelancer_id` (NULL for admin without freelancer row), not the non-existent `ctx.actor_freelancer_id`.

**Filters:**
- `/jobs` — default-hide Complete; "Show N complete" toggle when any exist; status pill colour distinguishes (muted Complete vs green Active).
- `/m` mobile task list — fixed legacy filter that referenced `Closed` status (which never existed in this schema, so was a no-op for years). Now correctly filters Complete; both active and complete WO queries scoped to non-Complete jobs.
- `/capacity/add-booking` job picker — excludes Complete (you don't book fresh crew onto finished jobs).
- `/workshop`, `/capacity`, dashboard upcoming jobs — already filter via `rpc_workshop_data`, `rpc_capacity_data`, `rpc_dashboard_data`. Confirmed.
- `/m/task`, `/m/request` — already filter to `eq("job_status", "Active")`. Confirmed.
- `qry_procurement_needed` — patched to exclude Complete jobs (no job-status filter previously, so was surfacing unordered BOM rows from finished jobs).
- `qry_stale_travellers` — patched to exclude Complete jobs (only excluded Complete WOs previously; edge case where PM marks job Complete with WOs still Ready).

#### S41d — Quote total drift fix + drop `tbl_quotes.quote_value`

**Trigger:** While testing Job Complete on Tramp Club Dancing podium (job 9), the dialog showed "Quoted £0.00" but the job page clearly showed "Quoted £600.00."

**Root cause:** `qry_job_accepted_quote` summed `tbl_quotes.quote_value` (the header field). That field is supposed to mirror `SUM(tbl_quote_lines.line_value)` but nothing in the system maintains the relationship. 3 of 9 jobs had NULL headers despite real line values — the new-job INSERT path explicitly omits `quote_value`. Drift was inevitable.

**Fix in two stages:**

1. **View rewrite** — `qry_job_accepted_quote` now sums directly from `tbl_quote_lines` for accepted quotes, excluding overhead lines (`COALESCE(line_sub_group, '') <> 'Overhead'`). Tested across all 9 jobs, all give correct totals. Closes the immediate Tramp issue. Added `qry_quote_value_drift` watcher view per S37 invariants discipline.

2. **Column drop** — confirmed `tbl_quotes.quote_value` is a pure artefact via thorough sweep:
   - 0 app reads (no `.quote_value` accessor in `src/`)
   - 0 app writes (both INSERT paths into `tbl_quotes` — `jobs/page.tsx` and `jobs/[id]/page.tsx` — explicitly omit it)
   - 0 functions, triggers, constraints, RLS policies reference it
   - The only consumer (`qry_job_accepted_quote`) was migrated in stage 1
   - The 6 jobs that DID have populated values: every one matched `SUM(line_value)` exactly, so no information lost — fully reconstructable

   Dropped the column. Dropped the now-redundant `qry_quote_value_drift` watcher (nothing to watch). Removed the phantom `quote_value` field from the `Quote` TS interface.

**Promoted to convention:** §3.6 of `05_conventions.md` now codifies the "quote total derived from lines" invariant, and §5.1 ("Single source of truth") generalises the lesson — denormalised mirrors without maintaining triggers must be either (a) dropped, (b) triggered-and-watched, or (c) replaced with on-demand reads. The `tbl_quotes.quote_value` drop is the canonical case study cited in SP-014 checklist item 9.

#### S41e — Doc migration to repo

**The change:** docs moved from project-knowledge uploads to `/docs/` in the repo. Project knowledge becomes a stable ~20-line pointer that doesn't churn session-to-session.

**Why:** session-to-session docs were drifting because the user had to manually upload after each session. Co-locating with code means schema-doc updates ship in the same commit as the migration that needed them. Git provides the audit log (`git log docs/04_security_policy.md`).

**What shipped in `/docs/`:**
- `00_README.md` — index + read order + working principles
- `01_overview.md` — minor: Job Complete added to the Golden Path
- `02_architecture.md` — auth model updated for 6-digit PIN reality, route map updated for `/reports/job-close/[jobId]` and Complete filtering, API auth section reflects `app_metadata`-only role read
- `03_database_schema.md` — fully rebuilt from live state queries (55 tables, 34 views, 14 RPCs, 2 cron jobs). Old "session N + session N+1 patches" pattern collapsed to single current-state document. Recent additions section covers S40 → S41
- `04_security_policy.md` v2.1 — SP-002 rewritten to match reality (6-digit numeric PIN with documented tradeoffs and mitigations), SP-006/SP-008 strengthened on `app_metadata`-only reads, SP-014 checklist item 9 added (denormalisation requires trigger + watcher or it must not exist)
- `05_conventions.md` — added §3.6 (quote-total invariant), §5.1 (single source of truth — promoted from S41 Quote drift case), §3.8 manual-time-entry note, §3.9 Complete in job statuses, §19 (full Job lifecycle conventions)
- `TRACKER.md` — this file. S41 entry above; cleanup backlog updated.

**Project knowledge replacement:** see end of this entry for the ~20-line pointer file.

---

### Project knowledge replacement (paste this as the only file in project knowledge)

```
This system's authoritative documentation lives at:
  /docs/ in the github.com/mateuszgarwacki-arch/starlight-web repo

Always start a session by reading these files via Desktop Commander:
  - docs/00_README.md           (this index)
  - docs/01_overview.md         (what the system is, who it serves)
  - docs/02_architecture.md     (stack, auth, integrations)
  - docs/03_database_schema.md  (current schema state)
  - docs/04_security_policy.md  (SP-001 to SP-017)
  - docs/05_conventions.md      (deploy patterns, SQL rules, UX patterns)
  - docs/TRACKER.md             (session log + cleanup backlog)

Always end a session by updating TRACKER.md and 03_database_schema.md
where applicable. These commits ship with the same deploy as the
code changes they describe.

Local repo path: C:\Users\mateusz.garwacki\Downloads\starlight-web
Supabase project ID: qbdnoueqkmhznqzpkvos
```

---

*Earlier session entries (S1–S40) live in git history and prior project-knowledge uploads. From S41 onwards, this file is the version-controlled session log.*
