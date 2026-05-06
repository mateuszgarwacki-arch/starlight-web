# Starlight Production System — Database Schema

**Last updated:** 6 May 2026 (S41)
**Verified live:** Counts and view definitions queried from `information_schema` and `pg_proc` at S41 close.

## Counts

| Category | Count |
|---|---|
| Tables (`tbl_*`) | 55 |
| Views (`qry_*`) | 34 |
| RPC functions (`rpc_*`) | 14 |
| pg_cron jobs | 2 |

## Tables (55)

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
tbl_pm_queries                  tbl_production_plan             tbl_quote_line_checks
tbl_quote_line_contractors      tbl_quote_lines                 tbl_quotes
tbl_rate_card                   tbl_scope_item_categories       tbl_scope_items
tbl_scope_options               tbl_stock_items                 tbl_suppliers
tbl_tasks                       tbl_timesheet_flags             tbl_wo_activities
tbl_wo_assignees                tbl_wo_bom                      tbl_wo_documents
tbl_wo_steps                    tbl_wo_time_entries             tbl_work_orders
tbl_workshop_requests
```

## Views (34)

```
qry_bom_enriched                qry_bom_invariant_violations    qry_dash_quote_stats
qry_dash_upcoming_jobs          qry_dash_wo_stats               qry_estimate_vs_actual
qry_freelancer_hours_summary    qry_invoice_job_rollup          qry_invoice_scope_costs
qry_invoice_wo_costs            qry_job_accepted_quote          qry_job_execution_list
qry_jobitems_withcoverage       qry_learnings_enriched          qry_maintenance_asset_summary
qry_maintenance_task_status     qry_manpower_demand             qry_materials_list
qry_procurement_needed          qry_quote_line_badges           qry_quote_lines_with_contractors
qry_quote_scopes                qry_recent_orders               qry_review_inbox
qry_scope_breakdown             qry_scope_context               qry_scope_estimated_cost
qry_scope_wo_stats              qry_stale_travellers            qry_supplier_summary
qry_wo_cost_labour              qry_wo_estimated_cost           qry_wo_phase_ordered
qry_wo_with_activities
```

## RPC functions (14)

| Function | Args | Purpose |
|---|---|---|
| `rpc_active_workers` | — | SECURITY DEFINER. Cross-user view of who's currently clocked-in (non-sensitive fields only) |
| `rpc_capacity_data` | `p_date_from text, p_date_to text` | Capacity page data; filters Complete jobs |
| `rpc_dashboard_data` | — | Dashboard data (16+ queries collapsed); upcoming jobs filters Complete |
| `rpc_detect_timesheet_gaps` | `p_flag_date date` | Idempotent flag detector for sub-90% logged hours; cron-driven daily |
| `rpc_job_close_report` | `p_job_id integer` | Close report data — header, commercial, labour, materials, WO variance, scope cost, learnings, post-complete edit count. Live data, never a snapshot |
| `rpc_job_detail_data` | `p_job_id integer` | Job page main data |
| `rpc_job_handover_data` | `p_job_id integer` | Handover summary data — zones, exclusions, drawings |
| `rpc_job_header_counts` | `p_job_id integer` | Lightweight counters for the job page toolbar (PM queries, learnings, invoices, orders, documents) |
| `rpc_learnings_similar` | `p_query_embedding vector, p_limit int, p_category` | Voyage AI similarity search over institutional knowledge |
| `rpc_load_list` | `p_job_id integer` | Load list data |
| `rpc_pm_job_overview` | `p_job_id integer` | PM 100m view |
| `rpc_report_job_financial` | `p_job_id integer` | Financial report data |
| `rpc_review_data` | — | Review page data |
| `rpc_workshop_data` | — | Workshop page data; filters Complete jobs |

## pg_cron jobs (2)

| Name | Schedule | Command |
|---|---|---|
| `audit-retention-monthly` | `0 3 1 * *` | `SELECT audit_retention_cycle()` — monthly audit log retention |
| `timesheet-gap-detect-daily` | `0 6 * * *` | `SELECT rpc_detect_timesheet_gaps(CURRENT_DATE - INTERVAL '1 day')` — daily 06:00 UTC |

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

## Recent additions (S40 → S41)

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
