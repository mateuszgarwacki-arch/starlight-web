# Starlight Web App — Development Tracker

## 🧹 Cleanup Backlog

Running list of known debt, deferred work, and small follow-ups. Reviewed at the start of every session. Items are added whenever a session ships something with a known deferral or a correctness bug that we chose not to fix in-flight. Order roughly reflects priority — top items are the ones to do next. Check items off as they ship; move completed ones to the relevant session entry.

### Correctness (do first)

*No open correctness items.*

### Small/mechanical (easy wins)

- [ ] **Share-flow size threshold** *(S40c, conditional)* — if 50MB+ PDF shares feel slow in real use, add a size check that falls back to URL-share for files >20MB. Don't ship pre-emptively.
- [ ] **Close report — completer name for admin users** *(S41)* — `completed_by` is INT FK to `tbl_freelancers` and resolves NULL for admin sessions (Mateusz's primary `@starlightdesign.co.uk` login has no freelancer row). The audit log still captures the actual auth UUID, but the report's "Completed by [name]" line is blank. Server-side enrichment from `auth.users.raw_user_meta_data->>'name'` would close this. ~10 min.

### Features deferred

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

- [ ] **Handover — PDF drawing rendering** *(S39)* — image drawings render full-page inline; PDF drawings currently show a fallback "Open PDF" box. Add pdf.js (dynamic import, ~500KB gzipped) and render PDF pages to canvas at 2× DPR for crisp print. Applies to `DrawingPage` in `/reports/handover/[jobId]/page.tsx`.

- [ ] **Handover — persist drawing rotation** *(S39)* — rotation state is currently in-memory only (matches traveller). If a zone has 10 landscape drawings, every session restart means re-rotating. Add `rotation INT DEFAULT 0` on `tbl_handover_zone_documents` and persist on rotate. One small migration + a PATCH on the handler.

- [ ] **Handover — activity-aware "built by" verbs** *(S39)* — current label "Hands on:" is universal. If real handover use reads too soft, upgrade to activity-aware verbs: "Built by:" for BUILD, "Painted by:" for PAINT, "Upholstered by:" for COVER, fallback "Hands on:" for anything unmapped. Small verb map maintained as new activities ship. Stronger signature/ownership feel.

- [ ] **Handover — multi-scope scope-name display** *(S39)* — the scope card currently drops `scope.item_name` (it duplicated the line text when there was one scope per line). When a line has 2+ scopes, name differentiation becomes useful again. Either always show `item_name` when it meaningfully differs from `line_text`, or always show it when there are multiple scopes on the line. Not actionable until a real 2-scope line appears on a handover.

- [ ] **Handover — multi-quote job audit** *(S39)* — Tite Street (job 14) is the only multi-quote job. Verify:
  - Job page lists both quotes, cost analysis sums across them.
  - `qry_dash_quote_stats` aggregates correctly.

### Long-running / strategic

- [ ] **Supabase Pro upgrade** *(carried)* — prerequisite for multi-PM operation. Enables daily backups + PITR. Currently on hobby tier.
- [ ] **GitHub repo transfer** *(carried)* — move from personal account to company account. Low urgency.
- [ ] **AI quoting/estimating agent** *(carried, strategic)* — `tbl_learnings` + Voyage AI embeddings is the foundation. Real build is once close-report data has accumulated across more closed jobs.

---

## Session log

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
