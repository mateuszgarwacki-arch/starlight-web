# Starlight Production System — Database Schema

**Last updated:** 24 Jun 2026 (S69)
**Verified live:** Counts queried from `information_schema` and `pg_proc` at S47 close — 57 tables, 34 views, 19 RPCs, 3 cron jobs, 217 RLS policies. +1 RPC (`rpc_close_phantom_timers`) and +1 cron job (`phantom-timer-patrol-daily`) vs S46. S52: +1 table (`tbl_overhead_costs`), +1 view (`qry_overhead_monthly`), +4 RLS policies on the new table; `rpc_detect_timesheet_gaps` modified (self-heal) and cron job 6 widened to a 7-day window (no count change). S55: +1 DB function `import_quote` (SECURITY DEFINER, `service_role`-only) catalogued below; no new tables/views (function was deployed in a prior session, documented now).

## Counts

| Category | Count |
|---|---|
| Tables (`tbl_*`) | 58 |
| Views (`qry_*`) | 39 |
| RPC functions (`rpc_*`) | 19 |
| Other DB functions | 1 |
| pg_cron jobs | 3 |

## Tables (58)

```
tbl_audit_log                   tbl_business_settings           tbl_category_prompts
tbl_check_types                 tbl_freelancer_schedule         tbl_freelancers
tbl_handover_line_overrides     tbl_handover_wo_notes           tbl_handover_zone_documents
tbl_handover_zone_notes         tbl_invoice_allocations         tbl_invoice_lines
tbl_invoices                    tbl_job_attachments             tbl_job_items
tbl_jobitem_workorder           tbl_learning_links              tbl_learnings
tbl_load_events                 tbl_load_groups                 tbl_maintenance_asset_photos
tbl_maintenance_assets          tbl_maintenance_checks          tbl_maintenance_flags
tbl_maintenance_logs            tbl_maintenance_tasks           tbl_master_lookups
tbl_material_aliases            tbl_material_category_config    tbl_material_prices
tbl_material_spec_defs          tbl_materials                   tbl_notifications
tbl_overhead_costs              tbl_pm_queries                  tbl_production_plan             tbl_quote_line_checks
tbl_quote_line_contractors      tbl_quote_lines                 tbl_quotes
tbl_rate_card                   tbl_scope_item_categories       tbl_scope_items
tbl_scope_options               tbl_stock_items                 tbl_suppliers
tbl_tasks                       tbl_timesheet_flags             tbl_wo_activities
tbl_wo_assignees                tbl_wo_bom                      tbl_wo_completion_proposals
tbl_wo_documents                tbl_wo_steps                    tbl_wo_time_entries
tbl_wo_time_entry_edits         tbl_work_orders                 tbl_workshop_requests
```

## Views (39)

```
qry_bom_enriched                qry_bom_invariant_violations    qry_dash_quote_stats
qry_dash_upcoming_jobs          qry_dash_wo_stats               qry_estimate_vs_actual
qry_freelancer_hours_summary    qry_invoice_job_rollup          qry_invoice_scope_costs
qry_invoice_wo_costs            qry_job_accepted_quote          qry_job_execution_list
qry_jobitems_withcoverage       qry_learnings_enriched          qry_maintenance_asset_summary
qry_maintenance_task_status     qry_manpower_demand             qry_materials_list
qry_overhead_monthly            qry_procurement_needed          qry_quote_line_badges           qry_quote_lines_with_contractors
qry_quote_scopes                qry_recent_orders               qry_review_inbox
qry_scope_breakdown             qry_scope_context               qry_scope_estimated_cost
qry_scope_wo_stats              qry_stale_travellers            qry_supplier_summary
qry_wo_cost_labour              qry_wo_estimated_cost           qry_wo_phase_ordered
qry_wo_with_activities
qry_job_financials              qry_financial_consistency_violations
qry_scope_cost_position         qry_bom_actuals
```

**Canonical financial layer (S65):** `qry_job_financials` is the single source of truth for every job-level money figure — quote, workshop-quote, labour, material plan/actual/committed, committed cost, and both workshop- and full-quote margin bases — with honest nulls (NULL, not £0, when no quote exists). `rpc_job_close_report`, `rpc_review_data`, and `rpc_job_detail_data` all read it; `qry_job_accepted_quote` is now a thin status-agnostic alias over it. `qry_financial_consistency_violations` flags misrepresentation risks (multiple quotes on one job, a live job with cost/scope but no quote, committed cost with no workshop basis). The quote `status` Draft/Issued/Accepted lifecycle is **retired** — `tbl_quotes.status` now defaults to `'Accepted'` and is no longer financially load-bearing (free to repurpose later as a version-supersession marker).

**Scope cost attribution + BOM actuals (S68):** `qry_scope_cost_position` is one row per scope — quoted (from the scope's quote line, honest NULL if none), bom_planned, bom_rows, committed — and backs the invoice routing modal (you see what's already on a scope before adding more). `qry_bom_actuals` is one row per BOM row and **derives** actual unit cost (`actual_committed ÷ quantity`) plus variance from invoice allocations carrying that `bom_id`; it does **not** write the latent `tbl_wo_bom.actual_unit_cost` column (derive-not-store, same anti-drift rule that retired `quote_value`/`reconciled_line_cost`). Both aggregate BOM and allocation rows in separate CTEs to avoid fan-out. New column `tbl_invoice_allocations.bom_id` (nullable FK → `tbl_wo_bom`, ON DELETE SET NULL, CHECK `bom_id ⇒ scope_item_id`) is the rail: an allocation slice may optionally name the specific planned BOM row it realises, set human-side in the modal alongside `scope_item_id` (so the scope⊻wo XOR and scope-grouped views are unaffected).

## Functions (20)

| Function | Args | Purpose |
|---|---|---|
| `import_quote` | `payload jsonb, p_uploaded_by int DEFAULT NULL` | **Not `rpc_*`-prefixed** — called directly by the quote-import commit route (S55). SECURITY DEFINER, `search_path=public`, EXECUTE granted to `service_role` ONLY. One transaction: inserts the job (`tbl_production_plan`), quote header (`tbl_quotes`), all lines (`tbl_quote_lines`, numbered 1…N via `WITH ORDINALITY`), and the quote PDF as a job-level `reference` doc in `tbl_wo_documents` (confirmed AI extraction stored in `extracted_data`). Raises if `job_number` is missing or already exists. Source of record: `import_quote.function.sql` (repo root) |
| `rpc_active_workers` | — | SECURITY DEFINER. Cross-user view of who's currently clocked-in (non-sensitive fields only) |
| `rpc_approve_time_entry_edit` | `p_edit_id integer, p_review_note text DEFAULT NULL` | Atomic apply of a freelancer-proposed time-entry edit. Rebuilds timestamps from `proposed_date + actual_start_timestamp::time`, recalculates `entry_cost` from current `applied_hourly_rate`. Role check: `admin/pm/production_manager` only |
| `rpc_capacity_data` | `p_date_from text, p_date_to text` | Capacity page data; filters Complete jobs |
| `rpc_close_phantom_timers` | — | SECURITY DEFINER. Phantom-timer patrol. Closes any WO timer (`tbl_wo_time_entries.system_end_timestamp IS NULL`) or quick timer (`tbl_tasks.status='in_progress'`) that has been running >16h. WO entries → hours=0 + `flag_note`; tasks → `status='pending'` + hours=0 + `review_note`. Returns `(wo_closed, task_closed)`. Driven by `phantom-timer-patrol-daily` cron at 04:00 UTC |
| `rpc_confirm_wo_completion` | `p_proposal_id integer, p_review_note text DEFAULT NULL` | SECURITY DEFINER. Locks a freelancer-marked WO completion. Marks proposal `confirmed`; idempotently re-asserts WO `Complete` state (heals partial-failure orphans). Role check: `admin/pm/production_manager` |
| `rpc_dashboard_data` | — | Dashboard data (16+ queries collapsed); upcoming jobs filters Complete. `activeWorkers` block (S47) UNIONs WO timers and quick timers; each row carries `kind` (`'wo'`\|`'task'`), `id`, `started_at`, `task_title` |
| `rpc_detect_timesheet_gaps` | `p_flag_date date` | Idempotent flag detector. Candidate set is the UNION of (A) freelancers who logged any time on the date and (B) freelancers with an active booking (`tbl_freelancer_schedule.status IN ('Booked','Confirmed','Notified')`). Flags rows under 90% of `standard_day_hours`. For genuinely-new flags with `logged_hours = 0` (the no-show case), inserts a `timesheet_no_show` notification with `action_url='/m/me'`. Uses `xmax = 0` to distinguish INSERT vs UPDATE for notification idempotency. Cron-driven daily (S49b) |
| `rpc_job_close_report` | `p_job_id integer` | Close report data — header, commercial summary (with `material_cost_planned`/`actual`/`committed` split), labour, materials by category/supplier, WO variance, scope cost, learnings, post-complete edit count. Live data, never a snapshot |
| `rpc_job_detail_data` | `p_job_id integer` | Job page main data |
| `rpc_job_handover_data` | `p_job_id integer` | Handover summary data — zones, exclusions, drawings |
| `rpc_job_header_counts` | `p_job_id integer` | Lightweight counters for the job page toolbar (PM queries, learnings, invoices, orders, documents) |
| `rpc_learnings_similar` | `p_query_embedding vector, p_limit int, p_category` | Voyage AI similarity search over institutional knowledge |
| `rpc_load_list` | `p_job_id integer` | Load list data |
| `rpc_pm_job_overview` | `p_job_id integer` | PM 100m view |
| `rpc_reject_time_entry_edit` | `p_edit_id integer, p_review_note text DEFAULT NULL` | Marks an edit row rejected with PM's note. Note travels back to freelancer so they understand why and can revise |
| `rpc_report_job_financial` | `p_job_id integer` | Financial report data |
| `rpc_review_data` | — | Review page data |
| `rpc_undo_wo_completion` | `p_proposal_id integer, p_review_note text DEFAULT NULL` | SECURITY DEFINER. Reverts a PM-undone WO completion. Marks proposal `undone`; restores WO's `previous_wo_status` from the proposal snapshot, clears `completion_photo_path` and completion timestamps. Role check: `admin/pm/production_manager` |
| `rpc_workshop_data` | — | Workshop page data; filters Complete jobs |

## pg_cron jobs (3)

| Name | Schedule | Command |
|---|---|---|
| `audit-retention-monthly` | `0 3 1 * *` | `SELECT audit_retention_cycle()` — monthly audit log retention |
| `phantom-timer-patrol-daily` | `0 4 * * *` | `SELECT rpc_close_phantom_timers()` — daily 04:00 UTC. Caps any forgotten WO/quick timer at ~24h before next-day close |
| `timesheet-gap-detect-daily` | `0 6 * * *` | `SELECT rpc_detect_timesheet_gaps(d::date) FROM generate_series(CURRENT_DATE-7, CURRENT_DATE-1, '1 day') d` — daily 06:00 UTC. S52: widened from yesterday-only to a rolling 7-day window so backfills are revisited and flags/notifications self-heal |

## Audited tables (`src/lib/audit.ts` — `AUDITED_TABLES`)

```typescript
{
  tbl_quote_lines:      "quote_line_id",
  tbl_scope_items:      "scope_item_id",
  tbl_work_orders:      "work_order_id",
  tbl_wo_bom:           "bom_id",
  tbl_production_plan:  "job_id",
  tbl_quotes:           "quote_id",
  tbl_wo_time_entries:  "entry_id",
  tbl_freelancers:      "freelancer_id",
  tbl_scope_options:    "option_id",
  tbl_wo_documents:     "doc_id",
  tbl_wo_steps:         "step_id",
  tbl_timesheet_flags:  "flag_id",
  tbl_tasks:            "task_id",
  tbl_wo_completion_proposals: "proposal_id",
  tbl_overhead_costs:   "overhead_cost_id",
  tbl_invoice_allocations: "allocation_id",   // S68 — cost attribution traceable
  tbl_invoices:         "invoice_id",         // S69 — VAT-reclaimable flip traceable
}
```

All mutations on these tables MUST go through `auditedUpdate / auditedInsert / auditedDelete`. Raw `.update() / .insert() / .delete()` on audited tables is a policy violation. Cosmetic-only updates (sort_order drag-reorder) stay raw.

## Invariants on record

These are the named, documented invariants the system relies on. Each has a watcher view that should always be empty in steady state.

### `tbl_wo_bom.unit_cost` (S37)

Price for ONE of `tbl_wo_bom.unit`. Line total is **always** `quantity × unit_cost`. No multipliers at read time. Any write path that changes stored `unit` must also convert stored cost in the same write.

Same invariant for `actual_unit_cost` (latent — no write path exists yet).

**Watcher:** `qry_bom_invariant_violations`. Currently 0 rows.

### Quote total derived from lines (S41)

The total value of a quote is **always** `SUM(tbl_quote_lines.line_value)` for the quote, scoped to non-overhead lines (`COALESCE(line_sub_group, '') <> 'Overhead'`). There is no parallel header field — `tbl_quotes.quote_value` was dropped in S41 because it was a denormalised mirror with no maintaining trigger that drifted on 3 of 9 jobs.

`qry_job_accepted_quote` is the canonical accessor. Sums lines for `Accepted` quotes per job.

### `tbl_timesheet_flags.logged_hours` (S38)

Reflects hours as of last detector run for that `(freelancer_id, flag_date)`. Trigger ensures real-time consistency on time-entry writes. 14-day page-load re-run on `/review/timesheets` and `/m/me` panel ensures eventual consistency for everything else. UNIQUE constraint on `(freelancer_id, flag_date)` makes detector idempotent.

### `tbl_wo_completion_proposals` — one in-flight proposal per WO (S43)

Partial unique index `uq_one_awaiting_per_wo WHERE status='awaiting_confirmation'`. A WO can only have one awaiting-confirmation proposal at a time. After undo, the previous proposal flips to `undone` (no longer counted by the partial index) and a fresh proposal can be created.

`previous_wo_status VARCHAR NOT NULL` snapshots the WO's status at mark-time so `rpc_undo_wo_completion` can restore it. Without this, the system would have to invent a default revert status — wrong if the WO was `Not-Started` or `Ready` at the time of marking.

## Recent additions (S40 → S69)

### S69 — Invoice VAT exception (non-reclaimable VAT on overseas purchases)

**Two columns added to existing tables; two views modified. No new tables/views/RPCs/cron — counts unchanged (58 tables, 39 views).**

- `tbl_invoice_lines.line_vat` (numeric, nullable) — the VAT figure from Expend's `Tax Amount`, captured per line. NULL on every pre-S69 row (the importer used to discard it). Cost basis for a line = `line_total` when the parent invoice is reclaimable, else `line_total + line_vat`.
- `tbl_invoices.vat_reclaimable` (boolean NOT NULL DEFAULT true) — false when the VAT on the purchase is not reclaimable (overseas / zero-rated / non-VAT-registered seller, no valid UK VAT invoice). Set by a human in the `/invoices` routing inbox.
- **`qry_invoice_job_rollup`** gains a trailing `allocated_committed` column = `sum(allocated_amount + CASE WHEN NOT vat_reclaimable AND line_total <> 0 THEN line_vat × (allocated_amount / line_total) ELSE 0 END)` — net allocations grossed up by their proportional non-reclaimable VAT. Existing columns (`allocated_total`, `unallocated_total`, …) unchanged; `allocated_total` stays the raw net allocation sum.
- **`qry_job_financials.material_actual`** now reads `qry_invoice_job_rollup.allocated_committed` (was `allocated_total`). Identical while every invoice is reclaimable; grosses up only for routed non-reclaimable invoices. Both views remain `SECURITY INVOKER`. No-op verified across all 19 jobs at S69 close (committed cost £94,907.72 unchanged).
- `tbl_invoices` added to `AUDITED_TABLES` (PK `invoice_id`) so the reclaimable flip is audited via `setInvoiceVatReclaimable()`. **Note:** pre-existing raw `tbl_invoices` writes (job assignment, manual process/edit, overhead-move delete) are now technically un-audited writes on a registered table — migrate to `auditedUpdate/Delete` when convenient. Out of scope for S69; no behaviour change (raw ops don't consult the map).

### S67 — Expend import idempotency (`expend_txn_id`)

**No new tables/views/RPCs/cron — two existing tables gain one column + a partial unique index each.**

The Expend CSV batch-importer (S67 — see TRACKER) needs to re-run the same export without double-importing. Both `tbl_invoices` and `tbl_overhead_costs` gain:
- `expend_txn_id text` (nullable) — the Expend `Transaction ID`, the per-transaction idempotency key. NULL for every manually-entered row (so they're exempt); set only on rows that came from the importer or were moved to overhead.
- Partial unique index — `uq_invoices_expend_txn` on `tbl_invoices(expend_txn_id) WHERE expend_txn_id IS NOT NULL`; `uq_overhead_expend_txn` on `tbl_overhead_costs(expend_txn_id) WHERE expend_txn_id IS NOT NULL`. Partial so the many NULL (manual) rows don't collide.

The importer's pre-insert idempotency check unions seen `expend_txn_id`s from **both** tables, so a transaction already imported as an invoice — or already moved into the overhead pool — is skipped on the next run. Imported receipts are referenced by their Expend URL in `tbl_invoices.file_path` (not fetched into `file_data`), so the import is a pure insert. The "Move to Overhead" action on `/invoices` carries `receipt_url` + `expend_txn_id` onto the new `tbl_overhead_costs` row before deleting the invoice, preserving idempotency across the move. `tbl_invoices_status_check` was extended to allow `'Imported'` (previously `'Pending'`/`'Processed'`/`'Archived'` only) — imported invoices carry `status = 'Imported'`, distinct from manual `'Processed'`.

Counts unchanged: 58 tables, 37 views, 19 RPCs, 3 cron jobs.

### S52 — Workshop overhead pool + timesheet-gap self-heal

**New table (`tbl_overhead_costs`):** non-job workshop running costs.
- Columns: `overhead_cost_id` PK; `cost_date` date; `cost_type` text CHECK in ('spend','labour'); `category_id` int FK→`tbl_master_lookups(lookup_id)` **ON DELETE SET NULL**; `description` text; `amount` numeric(12,2) (net of VAT); `hours` numeric(8,2) (labour only); `freelancer_id` int FK; `supplier_id` int FK (spend only); `receipt_url` text; `source_task_id` int FK→`tbl_tasks` (links the Approve-Overhead task); `note` text; `created_by` uuid; `created_at` timestamptz.
- Indexes: `uq_overhead_source_task` UNIQUE on `source_task_id WHERE source_task_id IS NOT NULL` (idempotency — one labour row per task); `idx_overhead_cost_date`; `idx_overhead_category`.
- RLS: 4 policies, PM/admin only via `get_my_role()` (mirrors `tbl_invoices`). In `AUDITED_TABLES` (PK `overhead_cost_id`).

**New view (`qry_overhead_monthly`, SECURITY INVOKER):** `month × category_id × cost_type` rollup with `entries` and `total`; category name coalesced to 'Uncategorised'.

**Lookups:** 8 rows `category='OVERHEAD_CATEGORY'` (Consumables, Cleaning & Waste, PPE & Safety, Tooling & small repairs, Equipment servicing, Utilities, General labour, Other). Managed in Settings → Overhead Categories.

**Wiring:** Review-inbox Approve Overhead inserts a `labour` row (`hours × day_rate/standard_day_hours`) then marks the task — previously the hours hit no cost pool. Workshop page has a collapsible Overhead panel (entry + monthly/category rollups + recent entries).

**Function change (`rpc_detect_timesheet_gaps`):** added `clear_notifs` CTE — dismisses the `timesheet_no_show` notification (by `source_freelancer_id` + type + date-specific title) once `logged_hrs > 0`. Flag auto-resolve (`auto_close`) unchanged. The enabler is cron job 6 now re-running a rolling 7-day window (see pg_cron table).

Counts: 58 tables, 35 views, 19 RPCs, 3 cron jobs.

### S51 (cont.) — Cut nesting settings (per-WO override)

**New column (`tbl_work_orders.cut_settings`):**
- `JSONB`, nullable. Per-WO cut-nesting overrides for the suggested cut plan. Shape: `{ kerf_mm: number, squaring_mm: number, stack_overrides: { "<thickness>": number } }`. **NULL = workshop defaults** (kerf 4mm, squaring 5mm, stack = `clamp(floor(36/thickness), 1, 5)`), resolved by `resolveCutSettings()` in `src/lib/cut-layout.ts`. The extractor stores NULL back when the user's draft equals defaults, keeping rows clean.
- `tbl_work_orders` is already in `AUDITED_TABLES` (PK `work_order_id`); the editor writes via `auditedUpdate`.
- Not exposed on `qry_wo_phase_ordered` (the view expands `*` at creation, so the new column isn't picked up). The traveller fetches `cut_settings` in a small separate `tbl_work_orders` query rather than recreating the load-bearing `SECURITY INVOKER` view.

No new tables/views/RPCs. Counts unchanged: 57 tables, 34 views, 18 RPCs, 2 cron jobs.

### S45 — Close report: workshop-quoted differential (pure RPC change)

**`rpc_job_close_report` — new `commercial.quoted_workshop` field.** The close report previously showed only `quoted` (the full accepted-quote value, all non-overhead lines) and computed margin against it. For jobs where the workshop delivers only a slice of the event — subcontracted production, install, etc. — that produced a meaningless margin (e.g. FA Léoube: 98.8% against £135,405 when the workshop's actual quoted portion was £8,850).

New `quote_workshop` CTE sums accepted-quote, non-overhead lines that match the **bench-work include-list** — category text contains `workshop`, `stock pick`, or `stock-and-hire` (case-insensitive). Exposed as `commercial.quoted_workshop` alongside the existing `commercial.quoted`.

**This definition is the canonical one already used by `cost-breakdown.tsx`** (the job page Cost Analysis panel — its "Quoted (workshop + stock)" row). The two MUST stay in lockstep. It is deliberately bench-work only: it excludes `Install`, `Sound`, `Lighting`, `Production` even though those are Starlight's own (non-subcontracted) work — "ours" and "workshop + stock" are different axes, and margin on the close report is the *workshop's* margin, compared against the *workshop's* quoted slice.

⚠️ **Known duplication:** this rule now lives in two places — the `quote_workshop` CTE here and the `workshopCats` filter in `cost-breakdown.tsx`. If it changes again, consolidate into a shared view (`qry_job_workshop_quote` or similar) — see TRACKER backlog.

Both UI surfaces (`job-complete-dialog.tsx`, `/reports/job-close/[jobId]`) show the QUOTED card with a "Workshop + stock £X" sub-line and compute **margin against `quoted_workshop`, not `quoted`**. Verified against FA Léoube: `quoted` £135,405 / `quoted_workshop` £8,850 / margin 81.8% — matches the job page's Cost Analysis exactly.

No schema objects added — RPC body change only. Counts unchanged: 57 tables, 34 views, 18 RPCs, 2 cron jobs.

**Related data fix (same session):** Job 13775 FA Léoube — quote `40815 v15` was stuck in `Issued` status, so `qry_job_accepted_quote` (filters to `status = 'Accepted'`) returned nothing and the close report showed £0 quoted. Flipped to `Accepted` via direct SQL. Third distinct cause of "Quoted shows £0 on a close report" (S41 was NULL `quote_value`, S42b was duplicate Accepted quotes) — see TRACKER cleanup backlog for the proposed "no Accepted quote on a Complete job" guard.

### S44 — Add-to-existing-WO + Fixings & Consumables (S44a, S44b)

**S44a — Pure code (no schema):** New flow on the scope page Unassigned Items panel. Selecting items now shows two buttons: "Create WO from N" (existing) and "Add to existing WO" (new). The new button picks a live WO (excludes `Voided` / `Complete` / `Cancelled`) and inserts into `tbl_jobitem_workorder`, deduped client-side against existing junctions (the table has no unique constraint on `(job_item_id, work_order_id)` — synthetic `junction_id` PK only, so dedup must be at the app layer). Fires a `scope_change` notification with `actionUrl` deep-linking to the scope page.

**S44b — Fixings & Consumables category:**

**New lookup row (`tbl_master_lookups`):**
- `lookup_id = 108`, `category = 'MATERIAL_CATEGORY'`, `lookup_value = 'Fixings & Consumables'`, `display_order = 5`. The fifth `MATERIAL_CATEGORY` lookup alongside Timber/Sheet/Fabric/Paint & Finish/Hardware/Steel/Floor Covering.

**New config row (`tbl_material_category_config`):**
- `category_id = 108`, `pricing_unit = 'Each'`, `buying_unit = 'Each'`, `fixed_dimension = NULL`, `bin_pack_mode = 'none'`. Count-based pricing, no dimension math.

**New column (`tbl_stock_items.item_type`):**
- `VARCHAR NOT NULL DEFAULT 'stock'`. Distinguishes catalogue subtypes — `'stock'` for production stock, `'fixing'` for fixings & consumables. All 2766 pre-existing rows backfilled to `'stock'`. Drives picker filtering in the new fixings dialog. New rows tagged `'fixing'` are pickable from the WO BOM "Add Fixings" flow.

**New CHECK constraint (`tbl_wo_bom.chk_bom_qty_null_only_fixings`):**
- `CHECK (quantity IS NOT NULL OR material_category = 108)`. Allows NULL `quantity` **only** when `material_category = 108` (Fixings & Consumables). Other categories must always specify a quantity — preserves the S37 invariant that line total = `qty × unit_cost` for cost-bearing categories.
- All 191 pre-existing BOM rows verified `quantity IS NOT NULL` before constraint added — no backfill needed.

**Design rationale:** NULL `quantity` on a fixings row means "needed but unquantified" (the provisioned mode — sandpaper, masking tape, drill bits). The BOM line still renders on the WO traveller pick-list as a checkbox-style "needs this", drops the `× qty` prefix, and shows `—` in the cost column instead of `£0.00`. Counted fixings (12 specific brackets) still carry a real qty and roll up normally. Both modes coexist in the same column without a separate flag — `qty IS NULL` is itself the mode marker. Cost rollups already use `COALESCE(quantity, 0) * COALESCE(unit_cost, 0)` (`qry_bom_enriched`) and `quantity || 0` (in-component `bomRowCost`), so NULL qty silently computes as £0 across every cost surface without further changes.

**App-side preservation of NULL:** `WorkOrdersPanel` state setter changed from `b.quantity || 0` → `b.quantity ?? null` so NULL passes through state. The inline qty input on the scope BOM table renders empty on NULL, placeholder `—` for fixings, and the onBlur handler writes NULL back to DB only when the input is cleared on a fixings row; non-fixings rows still coerce empty → 0 (the CHECK constraint blocks NULL there).

**Audit:** `tbl_wo_bom` is already in `AUDITED_TABLES` with PK `bom_id`; fixings inserts go through `auditedInsert` in the picker dialog.

**Notification:** S44a uses existing `scope_change` notification type.

### S43 — WO completion confirmation workflow + Job 13809 backfill

**New table:**
- `tbl_wo_completion_proposals` — freelancer-marked WO completions awaiting PM sanity-check. Columns: `proposal_id` (PK), `work_order_id` (FK → `tbl_work_orders` ON DELETE CASCADE), `freelancer_id`, `previous_wo_status` (NOT NULL — snapshot for undo), `completion_photo_path`, `proposed_note`, `status` (`awaiting_confirmation|confirmed|undone|withdrawn`, default `awaiting_confirmation`), `reviewed_at`, `reviewed_by` (uuid), `review_note`, `created_at`, `updated_at`.
- Partial unique index `uq_one_awaiting_per_wo WHERE status='awaiting_confirmation'`. Secondary indexes on `status` and `freelancer_id`.
- RLS: same shape as `tbl_wo_time_entry_edits` — freelancer R/W own awaiting; PM/admin updates any; no DELETE for anyone (`withdrawn` is a status change).

**RPCs added:**
- `rpc_confirm_wo_completion(p_proposal_id, p_review_note)` — SECURITY DEFINER. Marks proposal `confirmed`. **Idempotently re-asserts WO `Complete` state** using `COALESCE(existing, proposal_value)` for `completion_photo_path` and timestamps — heals the partial-failure case where the app-side INSERT succeeded but UPDATE failed.
- `rpc_undo_wo_completion(p_proposal_id, p_review_note)` — SECURITY DEFINER. Marks proposal `undone`; restores `previous_wo_status`; clears `completion_photo_path`, `system_complete_timestamp`, `actual_complete_timestamp`. PM's `review_note` flows back to the freelancer via `wo_completion_undone` notification.

**Design distinction from `tbl_wo_time_entry_edits` (S42):**
- Time-entry edits: canonical row is **untouched** until PM approves. Reports use the canonical value throughout the pending state. The proposal IS the gate.
- WO completion: WO status flips to `Complete` **immediately** on freelancer mark. PM's confirmation is a sanity-stamp, not a gate. The proposal is a reversibility record, not an approval queue.
- Mental model from Mateusz: "just sanity check, mark as complete". Different invariants → different patterns. Codified in `05_conventions.md` §3.8.

**Audited table added:**
- `tbl_wo_completion_proposals` registered with PK `proposal_id`.

**Notification type added:**
- `wo_completion_undone` (severity `warning`) — fired from `/review` when a PM taps Undo. `actionUrl` deep-links the freelancer to `/m/wo/[woId]` where the "PM undid the completion" warning + review_note is surfaced.

**UI surfaces:**
- `/m/wo/[woId]` — relaxed `MARK COMPLETE` gating from `allEntriesClosed && status === "In-Progress"` to `status !== "Complete" && !myOpenEntry`. The old gate hid the button on ~98% of active WOs. Photo block in the WO header is now state-aware ("Awaiting PM confirmation" amber / "Confirmed by PM" green). Undone state surfaces a red warning above the action buttons with the PM's review_note.
- `/review` — new `ConfirmCompletionsPanel` component near the top. Lists every `awaiting_confirmation` proposal with photo thumbnail, freelancer name, scope/job, optional note, Confirm/Undo buttons. Undo opens a modal accepting an optional reason note.

**Data fix (Job 13809 Oscars Academy Spring Event — retrospective entry):**
- Created job 13809, "Oscars Academy Spring Event", event date 9 May 2026, location "45 Park Lane", `client_name` deliberately NULL (privacy), status `Active`. Created quote 15 "41058 v4" Accepted. 17 lines spanning Design and Décor (£5,230), Lighting (£1,570), Sound (£1,375), Crew (£2,700), Transportation (£1,135) — all categorised `Provisional` for PM to redistribute. `qry_job_accepted_quote` returns £12,010.00 matching the PDF nett total. Overhead bucket auto-created via existing trigger. Direct-SQL backfill — no audit trail (same precedent as S42 quote consolidation).

### S42 — Material cost reporting, time-entry pending-edit workflow

**New table:**
- `tbl_wo_time_entry_edits` — freelancer-proposed edits to their own WO time entries. Columns: `edit_id` (PK), `entry_id` (FK → `tbl_wo_time_entries` ON DELETE CASCADE), `freelancer_id`, `proposed_actual_hours`, `proposed_work_order_id`, `proposed_date`, `reason` (NOT NULL), `status` (`pending|approved|rejected|withdrawn`, default `pending`), `reviewed_at`, `reviewed_by` (uuid), `review_note`, `created_at`, `updated_at`.
- Partial unique index `uq_one_pending_per_entry WHERE status='pending'` — one in-flight proposal per entry. Freelancer revises in place.
- RLS: freelancer can read/insert/update own pending. PM/admin can update any. **No DELETE policy for anyone** — withdrawals are status changes, audit trail survives.

**RPCs added:**
- `rpc_approve_time_entry_edit(p_edit_id integer, p_review_note text DEFAULT NULL)` — atomic single-transaction apply. Rebuilds timestamps from `proposed_date + actual_start_timestamp::time` (preserves time-of-day on date moves). Recalculates `entry_cost` from current `applied_hourly_rate`. Role check accepts `admin | pm | production_manager`.
- `rpc_reject_time_entry_edit(p_edit_id integer, p_review_note text DEFAULT NULL)` — marks rejected with the PM's note. Note surfaces back to the freelancer on `/m/me` so they understand why and can revise.

**RPC updated:**
- `rpc_job_close_report` now returns three distinct material-cost fields instead of a single collapsed value:
  - `material_cost_planned` (BOM — `SUM(quantity × unit_cost)`)
  - `material_cost_actual` (invoice allocations via `qry_invoice_job_rollup`)
  - `material_cost_committed` (`MAX(planned, actual)` — the prudent forecast)
  - `unallocated_invoice_total` warning compares against `material_cost_actual` not the old collapsed value (fixes false-positive when planned > actual)

**Audited table added:**
- `tbl_tasks` registered with PK `task_id`. Previous omission caused `auditedUpdate` to fall back to `.eq("id", ...)` and fail with `column tbl_tasks.id does not exist` whenever the helpers were used (e.g. when EditTaskSheet shipped). Any audited mutation against an unregistered table fails this way — worth remembering for future tables.

**Data fix (Job 13757 Suneil Birthday Tite Street):**
- Quotes 12 (£124,480) and 13 (£33,035) consolidated into new quote 14 "40922 v16" — 60 lines, £180,265. Scope 54 relinked from old quote_line 382 → new quote_line 442. Old quotes/lines hard-deleted. Quote 14 is now the only Accepted quote on the job.

**No schema changes from this session for:**
- Mobile 10-day overview (pure UI in `/m/me`)
- Jobs page Budget→Quoted (column rename + query join change; `budget_allowance` field retained for potential future client-stated-budget concept)
- Cutlist inline viewing (new API route `/api/onedrive/view`, no DB)
- WO-optional backfill (pure routing logic in `handleBackfillSubmit`; no WO → inserts to `tbl_tasks` as pending, with WO → inserts to `tbl_wo_time_entries` as before)

### S41 — Job Complete state, drift fix, freelancer onboarding tightening

**`tbl_production_plan` columns added:**
- `completed_at timestamptz` — when the job was marked Complete
- `completed_by integer` — freelancer_id of completer (NULL for admin without a freelancer row)
- `close_note text` — optional debrief

**RPC added:**
- `rpc_job_close_report(p_job_id integer)` — full close report data

**Views rewritten:**
- `qry_job_accepted_quote` — now sums from `tbl_quote_lines` (was `tbl_quotes.quote_value`); excludes overhead lines
- `qry_procurement_needed` — now excludes Complete jobs (was no job-status filter)
- `qry_stale_travellers` — now excludes Complete jobs (only excluded Complete WOs)

**Column dropped:**
- `tbl_quotes.quote_value` — pure artefact. Confirmed 0 reads, 0 writes, 0 functions/triggers/constraints/RLS policies. The only consumer (`qry_job_accepted_quote`) was migrated to read from lines.

**View dropped:**
- `qry_quote_value_drift` — was a watcher I added at the start of S41; became redundant once the drifting column was gone.

**No schema changes from this session for:**
- Freelancer onboarding tightening (pure code: PIN generator 4→6 digits, dropped dead `tbl_freelancers.pin` write that was failing silently against a non-existent column, removed `user_metadata.role` privilege-escalation foothold from `freelancer-sync` API, dropped redundant Add-Freelancer PIN field, accepted `password`/`pin` in API for back-compat)
- Route Task → Complete WOs (pure code: status filter + sort logic in `route-task-modal.tsx` and crew page modals)

### S38d (pre-S41, included for completeness)

- `tbl_check_types` — quote-line check definitions
- `tbl_quote_line_checks` — junction
- `qry_quote_line_badges` — visual badges for quote lines

### S38 (pre-S41)

- `tbl_timesheet_flags` — sub-90%-logged-hours detector output
- `rpc_detect_timesheet_gaps(p_flag_date date)` — idempotent detector
- pg_cron job `timesheet-gap-detect-daily`
- Trigger `trg_timesheet_recompute_for_time_entry` on `tbl_wo_time_entries`

### S39 (pre-S41)

- Overhead bucket: `fn_create_job_overhead`, trigger on `tbl_production_plan`, `ACTIVITY.OVERHEAD` lookup
- Handover tables: `tbl_handover_zone_notes`, `tbl_handover_zone_documents`, `tbl_handover_line_overrides`, `tbl_handover_wo_notes`
- `rpc_job_handover_data(p_job_id integer)`

## RLS

All `tbl_%` tables have RLS enabled. Standard consolidated pattern: 1 policy per (table, action), `TO authenticated`, `get_my_role()` CASE. All views `SECURITY INVOKER`. `get_my_role()` reads `app_metadata.role` (not user-editable) per SP-006.

Cross-user reads that legitimately bypass RLS use SECURITY DEFINER RPCs returning only non-sensitive fields. Example: `rpc_active_workers` returns who + where, never rates or costs.

## Conventions quick-ref (full list in `05_conventions.md`)

- **Never** use `toISOString().split("T")[0]` for local dates — BST shift. Use `localDateStr(y, m, d)`.
- Timestamp strings for manual entries: `"YYYY-MM-DDT09:00:00"` (no `Z` suffix).
- Manual time entries set all 4 timestamps (never leave `system_end` null).
- `auditedUpdate / auditedInsert / auditedDelete` only — never raw mutations on registered tables.
- `CREATE POLICY IF NOT EXISTS` doesn't exist in PG — use `DROP POLICY IF EXISTS` + `CREATE POLICY`.
- `ROUND()` needs `::numeric` cast.
- Always filter `archived_at IS NULL` on every direct query touching `tbl_wo_time_entries`.
- All views must be `SECURITY INVOKER`.
- Always verify column existence via `information_schema.columns` before writing SQL against unfamiliar tables.
- BOM cost = `quantity × unit_cost` always; no multipliers at read time (S37 invariant).
