# Starlight Production System — Conventions & Patterns

**Last updated:** 5 Jun 2026 (S61)

This is the "how we do things here" document. Patterns that have been promoted from single-session lessons to permanent convention. When in doubt, this file wins.

## 1. Deployment

### 1.1 The core sequence

Repo at `C:\Users\mateusz.garwacki\Downloads\starlight-web`. Always **cmd shell**, never PowerShell (PowerShell blocks Vercel CLI via execution policy, and spaces in commit messages break).

```cmd
git add -A && git commit -F commit-msg.txt && git push origin main && del .next\lock 2>nul && npx vercel --prod --yes
```

**Pre-deploy requirements:**
- Write commit message to `commit-msg.txt` first, then `git commit -F commit-msg.txt`. Avoids all quote-escaping pain.
- Run `npx next build` to verify clean compilation before deploying.
- `del .next\lock 2>nul` before Vercel deploy prevents lock file conflicts on Windows.
- Deploy takes ~20–40 seconds.

### 1.2 Check git state before editing

**Always `git status` before starting a fix.** If there are uncommitted local changes to files you're about to edit, either complete them or consciously overwrite them. A file on disk is not necessarily in production. (Promoted to convention in S38b after discovering a half-built sidebar fix sitting uncommitted — the live site didn't match the working tree.)

### 1.3 Security-critical deploys

Security-critical renames, RLS changes, or auth changes **deploy alone, never chained** with unrelated changes, so rollback is a single `git revert`.

### 1.4 Build hygiene

Chunk boundary errors are the most common build failure when writing large files. Before writing chunk 2, verify exactly where chunk 1 ends. If a build fails with a parse error, check the line number — it's almost always at a chunk boundary.

### 1.5 Doc updates ship with the deploy

Schema changes update `03_database_schema.md` in the same commit as the migration. Session work always closes with a `TRACKER.md` entry. Docs out of sync with the deployed code is a worse failure than no docs at all.

## 2. File operations (Desktop Commander)

- **`edit_block` parameter is `file_path`**, not `path`. Common slip.
- **`edit_block` requires exact string match** including whitespace. Read the target section first when uncertain.
- **Paths with brackets** (`(dashboard)`, `[id]`, `[scopeId]`) — use `read_file` with the exact path. `start_search` with `filePattern` returns zero results on bracket paths.
- **Large file writes:** `mode: rewrite` for the first chunk, `mode: append` for subsequent. ~300 lines per chunk is reliable.
- **Create directories before `write_file`** for new routes. Use `Desktop Commander:create_directory` — `cmd mkdir` fails on bracket paths.

## 3. Supabase / SQL

### 3.1 Running SQL

Supabase MCP is connected — always run SQL directly:
- **DDL:** `Supabase:apply_migration` with `project_id: qbdnoueqkmhznqzpkvos`
- **Queries:** `Supabase:execute_sql` with same project ID

**Never ask user to run SQL manually.**

### 3.2 Transactional behaviour

Supabase SQL Editor is fully transactional. Always verify column existence and references before generating scripts. Check `information_schema.columns` (filtered by `table_name`) for authoritative column names — never assume from memory.

### 3.3 DDL ordering rules

- **`ALTER TABLE` before `CREATE VIEW`** — PostgreSQL validates view column references at creation time.
- **`DROP VIEW IF EXISTS` before `CREATE OR REPLACE VIEW`** if the column list changes. `CREATE OR REPLACE VIEW` cannot change the column list.
- **`DROP POLICY IF EXISTS` + `CREATE POLICY`** — PostgreSQL has no `CREATE POLICY IF NOT EXISTS`.

### 3.4 PostgreSQL gotchas

- **`ROUND()` needs `::numeric` cast.**
- **`UNION` cannot use expressions in `ORDER BY`** — wrap in a subquery.
- **Auto-increment PKs use `nextval` sequences** — omit PK columns from `INSERT` and use `RETURNING` to chain IDs.
- **`ON CONFLICT` requires a unique constraint.** Verify with `information_schema.table_constraints` before using.
- **RLS function ambiguity (S38):** when a plpgsql `RETURN QUERY` returns a `TABLE()` whose column names match CTE columns in the body, PostgreSQL throws a cryptic "ambiguous column" error. Prefix RETURNS TABLE outputs (e.g. `out_freelancer_id`) and/or alias CTE columns. See `rpc_detect_timesheet_gaps` for an example.

### 3.5 BOM costing (S37 INVARIANT — MUST READ)

**`tbl_wo_bom.unit_cost` is the price for ONE unit of `tbl_wo_bom.unit`. Always. Line total = `quantity × unit_cost`. No multipliers at read time.**

Same invariant for `actual_unit_cost`. Any write path that changes stored `unit` must convert stored cost in the same write.

- `qry_bom_enriched` is the source of truth for BOM cost. `planned_line_cost` = `qty × unit_cost`; `reconciled_line_cost` = `qty × COALESCE(actual_unit_cost, unit_cost)`. No multipliers.
- Effective scope resolution: `COALESCE(b.scope_item_id, wo.scope_item_id)` — handles old rows missing `scope_item_id`.
- Floor Covering: priced per m², bought in linear metres. `cost × (standard_width_mm / 1000)` at write time.
- Timber (Length unit on metre-priced material): `cost × (standard_length_mm / 1000)` at write time.
- PM est: UI always writes to `pm_est_cost` field. Default day rate from rate card, not hardcoded.
- Finish lookup category is `FINISH_RELATIVE` (not `FINISH`).

**Watcher:** `SELECT * FROM qry_bom_invariant_violations` should always return 0 rows. If it returns rows, a write path violated the invariant.

### 3.6 Quote total derived from lines (S41 invariant)

**The total value of a quote is `SUM(tbl_quote_lines.line_value)` for the quote, scoped to non-overhead lines (`COALESCE(line_sub_group, '') <> 'Overhead'`). Always. There is no parallel header field.**

`tbl_quotes.quote_value` was dropped in S41 because it was a denormalised mirror with no maintaining trigger that drifted on 3 of 9 jobs. `qry_job_accepted_quote` is the canonical accessor — sums lines for `Accepted` quotes per job.

### 3.7 Fan-out prevention

Never JOIN labour + material in the same CTE — hours multiply by BOM row count. Separate CTEs, then aggregate.

### 3.8 Time entries

- **Every direct query must include `.is("archived_at", null)`.** Archived entries are excluded from all cost calculations.
- **Manual time entries must set all 4 timestamps** (`system_start`, `actual_start`, `system_end`, `actual_end`). NULL `system_end` creates a phantom active timer.
- **Timestamp format:** use `"YYYY-MM-DDT09:00:00"` with **no `Z` suffix** to prevent BST date shifts.
- Manual time entry on a Not-Started WO does NOT advance the WO status. The WO will sit in Not-Started until someone manually marks it Complete (or starts it via QR/mobile). For small jobs where PM logs hours after the fact, expect WOs to remain in Not-Started even when work is done — the close report's "WOs still active" warning will fire (correctly).
- **Freelancer-edits on WO time entries are proposals, never direct writes (S42).** `tbl_wo_time_entry_edits` holds pending changes; the canonical `tbl_wo_time_entries` row is untouched until a PM calls `rpc_approve_time_entry_edit`. Reports continue to use the canonical value throughout. **The same does NOT apply to ad-hoc tasks** — `tbl_tasks` is edited in place (with status reverted to `pending` if the PM had previously approved it as overhead). Tasks don't carry cost into reports until approval; entries do. Different invariants → different patterns.
- **Freelancer WO completions are immediate-apply + reversible, NOT deferred-apply (S43).** `tbl_wo_completion_proposals` holds the record, but the canonical `tbl_work_orders.status` flips to `Complete` immediately on freelancer mark — the PM's `rpc_confirm_wo_completion` is a sanity-stamp, not a gate. `rpc_undo_wo_completion` exists as the reversal path: it restores the snapshotted `previous_wo_status` and clears completion fields. This is the deliberate inverse of the time-entry edit pattern above. The choice is driven by what flows into reports: a WO's Complete status affects almost nothing in reporting (the time entries and BOM carry the costs); a time-entry edit moves real money. Cost-bearing changes get gated; status-only changes flow through immediately and get a reversal path.
- **Date edits preserve time-of-day** in the approve RPC: `proposed_date::timestamp + actual_start_timestamp::time`. A 09:00 entry moved to a new day stays at 09:00.

### 3.9 Complexity / status encoding

- Complexity stored as `"1 - Straightforward"` — use `LEFT(field,1)::INT` for rate card joins.
- Job phases: `BUILD` = phase 1, `COVER` = phase 3.
- Job statuses: `Active`, `Planning`, `Complete`. Active is default; Complete is set via the Job Complete button on the job page (S41).

## 4. Auditing

**Audited tables registry** (`src/lib/audit.ts` `AUDITED_TABLES`):
`tbl_quote_lines`, `tbl_scope_items`, `tbl_work_orders`, `tbl_wo_bom`, `tbl_production_plan`, `tbl_quotes`, `tbl_wo_time_entries`, `tbl_freelancers`, `tbl_scope_options`, `tbl_wo_documents`, `tbl_wo_steps`, `tbl_timesheet_flags`, `tbl_tasks`, `tbl_wo_completion_proposals`.

**Mandatory rules:**
- `auditedUpdate(ctx, table, recordId, changes)` for all writes on registered tables. **Never raw `supabase.update()`.**
- `auditedInsert()` for creation. `auditedDelete()` for deletion.
- Signature catch: 3rd param is the ID, 4th is changes. Not the other way round.
- `getAuditContext(supabase)` takes the supabase client as an arg. Returns `{ supabase, userId, userName, userRole }`. **Not** an `actor_freelancer_id` field — if you need the freelancer_id, read it from `user.user_metadata.freelancer_id` (NULL for admin without a row).
- Registration in `AUDITED_TABLES` is **prerequisite** — the helpers look up the PK column from this map. **If a table is missing from the map, the helpers fall back to `.eq("id", recordId)` and the mutation fails with `column tbl_X.id does not exist`** — a misleading error that hides the real cause (registration miss, not a missing column). Always register a table the first time you reach for `auditedUpdate` against it. *Case study: tbl_tasks (S42).*
- **Cosmetic updates** (sort_order drag-reorder) stay raw.
- **Don't manually write `modified_at`** — spawns an audit entry per timestamp change.

## 5. Invariants discipline (S37 / S41)

When the same bug has been "fixed" multiple times, the fix is usually a missing invariant, not a missing check.

1. **Name the invariant** in plain English.
2. **Document in the schema** (`COMMENT ON COLUMN ...`) so it's discoverable via `\d+` or schema tooling.
3. **Enforce at every write path** — grep all `.from("table").insert|update` for the affected table before declaring the invariant locked.
4. **Make reads trivial** — no clever normalisation. If reads need logic, the invariant is weak.
5. **Add a watcher view** (`qry_*_invariant_violations`) that returns 0 rows when healthy. Run periodically. Fix writes, not reads.

### 5.1 Single source of truth (S41 corollary)

If you find yourself with a denormalised mirror of data that already lives elsewhere — a `total_value` on a header that's "supposed to" mirror the sum of children — **do one of three things**:

1. **Drop the mirror.** First and best option if no one's reading it. The S41 `tbl_quotes.quote_value` drop is the canonical case study: column had been NULL on 3 of 9 jobs because the new-job INSERT path didn't populate it; only legacy jobs had values. Zero readers, zero writers, zero functions referenced it. Pure artefact. Gone.
2. **Maintain it with a trigger.** If consumers genuinely need the denormalised field for performance or contract reasons, add an INSERT/UPDATE/DELETE trigger on the child table that recomputes the mirror, plus a watcher view that returns drift rows.
3. **Read directly from the source.** Update the views/RPCs to compute on demand. Modern Postgres handles `SUM(child_value) GROUP BY parent_id` very fast with an index on `parent_id`.

What you must NOT do: leave the mirror unmaintained and hope. It will drift, and the bug will only surface when it's awkward.

### 5.2 Planned vs Actual is two fields, never one (S42)

When tracking a value with a forecast and a settled number — BOM cost vs allocated invoice cost, estimate hours vs actual hours, anything that has a "what we expect" and a "what we got" — surface **both** in the data layer, even if early UI shows only one. Collapsing to a single field (whichever happens to be non-null) buries the variance signal at the source.

S42 case study: `rpc_job_close_report` originally returned a single `materials_cost` that took BOM if invoices weren't allocated yet, and invoice allocations if they were. The Job Complete dialog read `£0` whenever neither was populated, which happened on jobs where the PM had BOM'd but not allocated. Worse, when both existed, there was no way to tell which one you were looking at — the report silently switched semantics by row.

Rewrite: three explicit fields — `material_cost_planned` (BOM), `material_cost_actual` (allocations), `material_cost_committed` (`MAX(planned, actual)`, the prudent forecast). UI surfaces "Plan £X / Actual £Y" with red on overrun. Variance becomes visible at every layer.

Generalisation: in this codebase any new field of the form "X cost" or "Y hours" should pause and ask: is this a forecast, a settled value, or the conservative-projection? If two of those are meaningful, the schema should reflect two fields. The mistake to avoid is over-aggregation in the database layer for the sake of UI brevity — the UI can always re-aggregate.

## 6. Cross-table consistency (S38c)

When table A's state depends on table B (via SUM, COUNT, MAX, etc.):

1. **Trigger on the write** — AFTER INSERT/UPDATE/DELETE on B, recompute A's affected rows. Narrow scope (single entity/date).
2. **Re-compute on the read** — page-load re-run as belt-and-braces. Cheap if the recompute is narrow and idempotent.

Two layers: the trigger for correctness, the page-load for safety net against unknown write paths. Example: `trg_timesheet_recompute_for_time_entry` + page-load `rpc_detect_timesheet_gaps` calls in `/review/timesheets` and `TimesheetFlagsPanel`.

## 7. Notifications (mandatory for new features)

**Every state-changing action** needs `notify()` from `lib/notifications.ts` + a toast from `sonner`.

**Types:** `booking_confirmed/declined/withdrawal`, `wo_started/hours_logged/wo_flagged/wo_completed`, `scope_change`, `wo_overrun`, `material_needed`, `task_submitted`, `task_reviewed`, `workshop_request`, `request_resolved`, `wo_completion_undone`.

**Severities:** `info` / `warning` / `urgent`. **Always include `actionUrl`** for deep-link.

## 8. Frontend conventions

### 8.1 Next.js 16 specifics
- `useSearchParams()` requires a Suspense boundary in Next 16. Use `window.location.search` in `useEffect` instead.
- State preservation: Next.js preserves page state on navigation. Use a `window 'focus'` listener to refetch data when returning from sub-pages.
- z-index layering: tab bar `z-50`, bottom sheets `z-[60]`, lightbox/modals `z-[70]`.

### 8.2 Dates & timezones

**Never** `toISOString().split("T")[0]` for local dates — BST shifts to the previous day. Use `localDateStr(y, m, d)`.

### 8.3 React focus bugs
- Component functions defined inside render lose focus on re-render — inline JSX or extract to module level.
- **Uncontrolled input sync:** `key={\`field-${id}-${value}\`}` forces remount on external state changes.

### 8.4 Visuals
- **No text truncation anywhere.** Workshop screens need full content.
- **Lucide icons don't accept `title` prop** — wrap in `<span>` if you need a tooltip.
- **Critical-flag pattern:** single `is_critical BOOLEAN`, amber styling in read-only renders, `⚠` prefix in print. For "don't miss this" surfacing.

### 8.5 Authoring list UX

Enter advances and focuses next, Esc cancels, blur commits. Better than explicit Save/Add buttons for rapid entry.

### 8.6 Print
- No `#__next` wrapper in Next 16 — never use `body > *:not(#__next)`.
- **Traveller light theme:** CSS overrides on `.traveller-page`, not just `@media print`.
- **Flow-layout pages:** keep `minHeight: 287mm` on A4; only relax `page-break-inside: avoid` via a dedicated CSS class.

### 8.7 Search & affordance discipline (S36)
- **Findability > hierarchy** on freelancer surfaces. A search bar above the hierarchy, not instead of it.
- **Group headers flat, not button-like.** No tinted bg, bold, coloured accent bar, or uppercase. Coloured bars + uppercase = button language — use only for interactive elements.
- **Persist UI preferences** in `localStorage` keyed by `freelancer_id` for mobile; `sessionStorage` for "during-this-workflow" PM state (e.g. filter per job).
- **Debounce search at 150ms.** Input state instant, filter state lagged.
- **Auto-expand collapsed groups when search is active.** User's saved state untouched.
- **Don't stack redundant status signals.** If "Live" pill and named worker pills say the same thing, drop the pill.

### 8.8 Scope/WO unified page (S19)

- Single scope page absorbs what used to be separate scope + WO pages.
- `WorkOrdersPanel` is self-contained WO list, expand/collapse, BOM editing.
- Panel ref API: `refresh / expandWO / updateJobItem / deleteJobItem`.
- BOM query filters scope-level (by `scope_item_id`) + WO-level (by `work_order_id IN`) — handles older rows missing `scope_item_id`.

## 9. RPC patterns

For pages with 5+ queries, use a single PostgreSQL RPC function:

```sql
CREATE FUNCTION rpc_page_data()
RETURNS json
LANGUAGE sql
SECURITY INVOKER
STABLE
```

Cross-user reads that legitimately need to bypass RLS (e.g. showing "who else is on this WO") use `SECURITY DEFINER` RPCs that return only non-sensitive fields. Example: `rpc_active_workers` returns who + where, never rates or costs.

**Dedicated lightweight RPCs alongside main RPCs** (S36c): when the main data RPC is heavy, add a `rpc_*_counts` or similar for at-a-glance counters that can be fetched in parallel.

## 10. Scheduling / booking

- Booking statuses: `Booked → Notified → Confirmed/Declined`; `Unavailable` separate.
- Soft signals only — never block PM from booking.
- WhatsApp phone format: strip non-digits, replace leading `0` with `44`.

## 11. Documents (OneDrive)

- **Three-anchor model:** documents attach to job / scope / WO. Same `WODocumentsPanel` component.
- `doc_type` values: `cut_list`, `drawing`, `reference`, `model` (GLB/GLTF inline viewer), `cad_concept` (design source), `cad_breakdown` (workshop breakdown).
- Scope-level vs WO-level disambiguated by: `work_order_id IS NULL AND scope_item_id = ?` vs `work_order_id = ?`.
- **Freelancer mobile filters `cad_concept` only** (design source, PM-only). `cad_breakdown` is allowed through to `/m/wo/[woId]` — it's the workshop's working file, exists for the floor (S40b).
- OneDrive folder structure: `Workshop/{jobNumber} - {jobName}/{docType}/`.

## 12. AI extraction (Claude API)

- **Send materials catalogue as context** — dramatically improves matching accuracy.
- **Include workshop naming in prompt:** `2x1 = 2x1 PAR Softwood (44×19mm)`, `MDF18 = 18mm MDF`, `ply18 = 18mm Plywood`.
- Cut-list to BOM: material summary (sheets/lengths) goes to BOM. Individual parts list is reference only.
- Two-layer view: "Materials to Order" (actionable) + "Individual Parts" (expandable reference).

## 13. UX patterns

- **Instant feedback** on state changes — local `useState` first, DB sync in background.
- **Specific callbacks** — refresh only the affected UI, not the whole page.
- **Empty states don't nag.** Dashed button invites, doesn't reproach.
- **Verify backlog items against live data** before assuming open — stale entries exist.

## 14. General workshop / maintenance tasks

Not job-linked overhead. Appear in Review page's Workshop Overhead panel only — never confused with billable job time.

## 15. npm

Local npm has `omit=dev` set globally. Use `--include=dev` for `npm install / ci` when dev dependencies are needed.

## 16. Session hygiene

- Session wrap-up: update `TRACKER.md`, schema doc, and `05_conventions.md` if a new pattern was promoted.
- Discuss design before building complex features. Ship Form 1 equivalent before starting Form 2.
- Consolidated pages over fragmented navigation.
- No gold-plating. Each phase is 1–2 sessions.
- Before starting a fix, `git status` — uncommitted local changes mean the live site may not match the file.

## 17. pg_cron (S38)

For periodic SQL-native work (detectors, aggregations, cleanup), **prefer `pg_cron` over external schedulers**. Built-in, free, logs to `cron.job_run_details`. Example:

```sql
SELECT cron.schedule(
  'job-name',
  '0 6 * * *',
  $$ SELECT my_function(); $$
);
```

Supabase server time is UTC.

Don't build a Vercel cron or Edge Function for purely SQL work — use `pg_cron`.

## 18. Sharing & file delivery (S40)

### 18.1 Never share a signed URL when you can share the bytes

OneDrive download URLs (and most cloud-storage signed URLs) **expire within ~1 hour**. Sharing such a URL via WhatsApp/Mail/etc. produces a link that's dead by the time the recipient looks at it the next day.

For any user-initiated share of file content to a third party (subcontractor, transport, client rep), use the **Web Share API with a `File` blob**:

```ts
const blob = await (await fetch(signedUrl)).blob();
const file = new File([blob], doc.file_name, { type: blob.type || doc.mime_type });
if (navigator.canShare?.({ files: [file] })) {
  await navigator.share({ files: [file], title: doc.caption });
}
```

The recipient gets a real attachment they can save and re-open later. Same principle applies any time the alternative is "send a link that expires".

### 18.2 Capability-detect, then fall back

Web Share API (and similar browser APIs — camera, geolocation, clipboard, push) are well-supported on mobile but not universal. Pattern:

1. **Feature-test:** `navigator.share && navigator.canShare?.(data)` before attempting.
2. **Try the rich path** in a `try/catch`.
3. **Catch `AbortError` silently** — that's the user cancelling the share sheet, not an error.
4. **Catch other errors** — alert + fall back to a degraded path (e.g. open the URL in a new tab so the user can save manually).

Reference implementation: `shareFile()` in `src/components/mobile-wo-docs.tsx`.

### 18.3 Auto-fill defaults vs opt-in copy

When a field could plausibly be filled from a parent record but isn't always wanted, **prefer an opt-in "copy from X" button** over auto-fill on dialog open.

Concrete case: WO description used to auto-fill from scope description (S24 removed it). Multi-phase WOs on one scope (CUT / ASSEMBLE / PAINT) shouldn't all share the same description, so auto-fill silently overwrote the user's intent. S40a re-introduced the convenience as an explicit button — fills silently when the field is empty, confirms before replacing existing text. Same shape applies anywhere a default is plausible-but-not-always-correct.

## 19. Job lifecycle (S41)

### 19.1 Complete is the only operational close state

There's one terminal status — `Complete` — set via the Job Complete button on the job page header. Triggers:
- `tbl_production_plan.completed_at`, `completed_by`, `close_note` populated
- Job drops out of all active surfaces (`/jobs` default, `/workshop`, `/capacity`, `/m`, dashboard upcoming jobs, `qry_procurement_needed`, `qry_stale_travellers`)
- Job page toolbar shows Close Report + Reopen instead of Complete

There is no "Closed" state separate from Complete. A job marked Complete is the operational signal; cost data remains live and can still post (post-complete edits are tracked in `tbl_audit_log` and surfaced via `rpc_job_close_report.post_complete_edits`).

### 19.2 Complete is a soft signal, not a lock

The Complete button is available regardless of WO state. If there are non-OVERHEAD WOs still in non-terminal status, the dialog warns but does not block. Per design principle 3 ("Soft signals only"), the user is trusted to complete a job with active WOs if they so choose — common for small jobs where hours were logged manually after the fact and WOs never advanced through their state machine.

### 19.3 Reopen preserves close_note

Reopen clears `completed_at` and `completed_by` but keeps `close_note` — useful context if the job is reopened for further work, useful audit trail in the change history.

### 19.4 Close report is always live

`rpc_job_close_report` runs against current data, never a snapshot. If a supplier credit posts six weeks after close, the report number updates. We trust the live read because the audit log captures every mutation and the report itself surfaces a "last edited after close" warning when `post_complete_edits.edit_count > 0`.

### 19.5 The report renders for any job

`/reports/job-close/[jobId]` works on Active jobs too (header shows "Interim" instead of "Complete"). Same RPC, same structure, just labelled differently. Useful as a mid-flight cost check without committing to Complete.


## 20. Database security and RLS (S46)

S46 audit hardened the database security posture and codified the patterns below. CI enforces a subset via `scripts/db-checks.sql`.

### 20.1 New tables — mandatory boilerplate

Every `CREATE TABLE` must include explicit GRANTs (Supabase **October 30, 2026** enforcement removes implicit grants for new tables) and enable RLS:

```sql
CREATE TABLE public.tbl_xxx (...);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tbl_xxx TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tbl_xxx TO service_role;
-- Do NOT grant to anon unless the table is genuinely public-readable.

ALTER TABLE public.tbl_xxx ENABLE ROW LEVEL SECURITY;

-- Then RLS policies — one per (table, action), TO authenticated,
-- using get_my_role() CASE pattern (see §3).
```

Every existing table already has explicit grants — the October 30 enforcement is a non-event for the current schema. The pattern is mandatory from now on for every new table.

### 20.2 Views — always SECURITY INVOKER

Supabase defaults views to SECURITY DEFINER, which **bypasses RLS** on every row read through the view. Critical for views over financial data (`qry_invoice_*`, `qry_dash_*`, etc).

```sql
CREATE VIEW public.qry_xxx AS SELECT ...;
ALTER VIEW public.qry_xxx SET (security_invoker = on);
```

Both statements always — the ALTER cannot be skipped. CI catches violations.

### 20.3 Functions — pin search_path, REVOKE PUBLIC

Every new function in `public` must pin `search_path` (prevents search_path injection). For SECURITY DEFINER specifically, the Postgres footgun: `REVOKE EXECUTE FROM anon` is a **no-op** while `PUBLIC` still has EXECUTE (which it does by default). Always REVOKE FROM PUBLIC, then GRANT explicitly to the roles that need it.

```sql
CREATE FUNCTION public.rpc_xxx(p_arg int)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER  -- default; use DEFINER only with explicit reason
STABLE
SET search_path = pg_catalog, public
AS $$ ... $$;

-- For SECURITY DEFINER functions only:
REVOKE EXECUTE ON FUNCTION public.rpc_xxx(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_xxx(int) TO authenticated;
-- For internal-only (trigger/cron/admin) funcs: REVOKE FROM PUBLIC, do NOT GRANT to authenticated.
```

The auth helpers (`get_my_role`, `get_my_freelancer_id`, `user_role`, `user_freelancer_id`) are an intentional exception — they must remain callable by `authenticated` because RLS policies on every table evaluate them at query time. Their `authenticated_security_definer_function_executable` advisor warnings persist forever and are documented in S46f.

### 20.4 RLS policies — no `USING (true)` or `WITH CHECK (true)` on writes

SELECT policies may legitimately be `USING (true)` for genuinely public-read tables. INSERT/UPDATE/DELETE must always restrict — either by role check, by owner-of-row check, or both. The Supabase advisor flags violations; CI does not currently lint this directly (manual review during code review).

**Defensible exceptions** (currently present, documented in S46f):
- `tbl_audit_log` INSERT — pinned to `user_id = auth.uid()` (literally restricts; not actually "true")
- 8 append-only "anyone can submit" patterns on attachment/photo/notification tables. These lack `created_by` columns so cannot bind WITH CHECK to the caller. Future work: add author columns and tighten — see Cleanup backlog.

### 20.5 Extension placement

`vector` extension currently lives in `public` (legacy install). **Do not move it** without coordinating role search_path updates AND a PostgREST reconnect — see S46e for the full rationale. For any **new** extension, install into `extensions` schema from day one:

```sql
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, authenticated, service_role, anon;
CREATE EXTENSION foo SCHEMA extensions;
```

### 20.6 Regression test for cost math

`SELECT public.test_rpc_job_close_report()` validates the close report's commercial numbers. Subtransaction-based — runs against the live DB but rolls back cleanly so zero test data persists. Extend the function as new cost-affecting code lands:

- Add new assertions for new fields in the return JSON.
- For new scenarios (e.g. partial completion, voided WOs), build separate `test_<scenario>` functions following the same shape — `BEGIN ... seed ... assert ... RAISE 'TEST_OK' ... EXCEPTION WHEN OTHERS ... END`.
- CI calls these; failures fail the build.

Function is `SECURITY DEFINER`, callable by `service_role` only — CI uses the service-role connection.

### 20.7 CI guard

`.github/workflows/db-checks.yml` runs `scripts/db-checks.sql` against the live database via psql on every push and PR to main. Enforces:

1. All public views are SECURITY INVOKER.
2. All public tables have RLS enabled.
3. No SECURITY DEFINER function in public is PUBLIC-callable.
4. Regression test passes.

The action needs the `SUPABASE_DB_URL` repo secret (direct connection URI from Supabase dashboard, **not the pooler**). Add new checks here as conventions evolve — the SQL is purely DO blocks that RAISE on violation, so additions are mechanical.


## 21. Label printing — Zebra GT800 via Browser Print (S53)

- **Drive label printers with native ZPL, never the OS/browser print dialog.** For die-cut label stock a rasterised page (HTML or PDF) couples orientation and seating: size the page to seat one-per-label (50×25) and the EPL driver rotates the image 90°; rotate it to fix that (25×50 portrait) and the page length no longer matches the gap pitch, so labels drift. Chrome also ignores `@page size` for thermal stock. Send ZPL: `^PW` (print width), `^LL` (label length = pitch, drives per-label register/advance), `^BQ` (native QR), `^FB` (wrapped text). 300 dpi → dots = mm × 11.81.
- **Transport = Zebra Browser Print** (`src/lib/zebra.ts`). The app is cloud-hosted (Vercel) and the printers are on the workshop LAN (shared from `sl-dc02`, IPs `192.168.62.180`/`.181`); the cloud can't reach a LAN IP, so a local agent on the print-station PC relays the raw ZPL. Per machine, one-time: install Browser Print, then trust its localhost cert by visiting `https://localhost:9101` once (Advanced → proceed). The client probes `https://localhost:9101` first (cert CN = `localhost`), then 127.0.0.1 / http. `getPrinter()` skips any printer whose name matches `/plastic/i` (the plastic-stock GT800 isn't loaded).
- **The GT800 is on the EPL driver but auto-senses ZPL per job** — ZPL prints fine without changing the driver. Geometry assumes the 50 mm edge is across the head (`^FWN`); if a printer is loaded the other way, swap to `^FWR`.
- **Batch cut.** `^MMC` cuts after *every* label; for cut-once-after-a-run set `^MMT` (tear-off, no cut) on all labels except the last and `^MMC` on the last. `^MMC` only does anything if the cutter accessory is fitted — if not, it no-ops (prints, no cut).
- **Keep a PDF fallback** (`jspdf`) at the seated 50×25 mm landscape size for machines without Browser Print; it relies on the printer driver's own Orientation setting to de-rotate.
- **The print click must stay synchronous.** Pre-decode the QR to an `<img>`/data-URL on load — an `await` between the click and `window.open`/`send` trips the popup blocker.
- **Label face content + the item Note (S54).** Each label prints `JOB# · WO#`, the item description (large), the item **Note**, and a QR to `/m/wo/{woId}`. The Note prints **whenever it is set, regardless of WO activity** — the original PAINT/COVER-only gate was removed in S54, so notes like "Set A — upstage flat" now print on cut/build WOs too (the floor's stated use case: which board belongs to which set part). The Note is stored in `tbl_job_items.finish_required` — a **legacy column name repurposed** as a free-text per-item note; no rename (the column is read by `rpc_job_handover_data`, `rpc_load_list`, `qry_jobitems_withcoverage` and ~10 frontend files, so the blast radius isn't worth a cosmetic rename). It is entered as **"Note"** on the scope card and the Add-Bespoke-Item form, and surfaces as a **"Note"** column on the traveller, handover, and load-list (all relabelled "Finish" → "Note" in S54 for consistency). **Do not confuse with `finish_relative`** — that is the WO/scope finish *state* (Raw/Primed/Painted), a separate field, untouched.


## 22. Shared job → work-order picker (S61)

The two-pane job → WO search is **one component** — `src/components/job-work-order-picker.tsx` (`<JobWorkOrderPicker>`). Anywhere a PM points time at a work order uses it; do not hand-roll another WO list. Current consumers: the `/review/inbox` route-task modal (`route-task-modal.tsx`) and both crew-page modals (Route to WO, Add Entry) in `(dashboard)/crew/[id]/page.tsx`. Before S61 the same fetch-and-enrich logic was copy-pasted in three places (one good, two worse flat lists) — extraction killed the drift.

### 22.1 Contract

- The picker **self-fetches and enriches** WOs (scope `is_general` → `is_overhead`, job number/name/date/**status**, activity verb). Hosts pass no data in.
- Selection lives **inside** the picker and is reported up via `onSelect(wo: WOOption | null)`. The host stores the returned `WOOption` and reads `work_order_id` / `job_id` / `is_overhead` / `scope_name` / `description` straight off it for its footer + submit — no id-to-list lookup, because the host doesn't hold the list.
- The host owns its own **footer and submit** (hours / note / date differ per surface — task routing vs. manual entry). The picker is the body only.
- Props: `onSelect` (required), `selectedWoId` (required, for highlight), `pinnedJobId?`, `pinnedBadgeLabel?`, `initialWoId?` (pre-select + scroll-into-view, e.g. a mobile-routed WO).
- The `WOOption` type is exported from the picker. If a host already has a local `WOOption`, import the picker's **aliased** (the crew page uses `WOPick`) rather than renaming the host's.
- **Mounting / layout:** the picker fills its parent (`h-full`) and its two panes scroll internally, so mount it in a **definite-height flex column**. The host modal is `flex flex-col h-[88vh] overflow-hidden` — a *definite* `h-[88vh]`, **not** `max-h-[88vh]`: max-height alone did not give the flex children a resolved height to shrink against, so the WO list grew to its content height and clipped behind the footer (S61 — `min-h-0` on the panes in `aede010` wasn't enough; the definite height in `7ae6a67` was). Header/footer are `shrink-0`; the picker sits in a `flex-1 flex min-h-0` body; the panes also carry `min-h-0`. If a body can be short (e.g. the add-entry ad-hoc form), give it `flex-1 min-h-0` too so the footer stays pinned in the fixed-height modal.

### 22.2 Completed-job visibility ("inactive" = Complete)

- Jobs with `tbl_production_plan.job_status = 'Complete'` are **hidden by default**. A "Show completed (N)" checkbox reveals them.
- The live `job_status` vocabulary is `Active` / `Planning` / `Complete` — there is no Cancelled/Voided. So the rule is simply: **everything that isn't `Complete` is "active" and shown**; `Complete` is the only value filtered.
- A **pinned** job (`pinnedJobId`) is always shown regardless of the toggle — a modal opened against a finished job (e.g. routing an old task) must never lose its own context.
- Within a job's WO pane, **Complete WOs sort last and render dimmed** (`opacity-60`) but stay selectable — a late time entry can still be pointed at a finished WO. The WO fetch deliberately includes `Complete` alongside `Ready` / `In-Progress` / `Not-Started`.
