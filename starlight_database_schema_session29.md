# Starlight Database Schema — Session 29 (21 Apr 2026)

Verified from live database. **47 tables, 41 views, 10 RPC functions, 7 utility functions, 200+ indexes.**

## Changes from Session 25

### Schema Changes (Session 29)
- **`tbl_invoice_allocations`** altered: `scope_item_id` dropped `NOT NULL`, new nullable `work_order_id INTEGER FK→tbl_work_orders(work_order_id) ON DELETE CASCADE`. New CHECK `chk_alloc_exactly_one_target` enforces scope XOR WO per row. No row on a given invoice line = "kept at job level." Partial index `idx_invoice_allocations_work_order WHERE work_order_id IS NOT NULL`.
- **`qry_invoice_scope_costs`** dropped and rebuilt: now aggregates direct scope allocations + WO-routed allocations (via parent scope). Returns `direct_scope_amount`, `via_wo_amount`, `invoiced_amount`, `line_count` per scope. Scope IDs with zero allocations filtered out.
- **`qry_invoice_wo_costs`** NEW: WO-level rollup. Sum of allocations per WO, joined to parent scope/job for context.
- **`qry_invoice_job_rollup`** NEW: job-level rollup. `invoiced_net_total` (sum of `tbl_invoice_lines.line_total`, ex-VAT), `allocated_total`, `unallocated_total` (GREATEST of net − allocated and 0), `invoice_count`, `line_count`.
- **`qry_cost_waterfall`** rebuilt: adds `invoiced_amount` column joined from `qry_invoice_scope_costs`. Column ordering otherwise preserved.
- **`qry_job_cost_summary`** rebuilt: adds `invoiced_net_total`, `invoiced_allocated`, `invoiced_unallocated`, `invoice_count` joined from `qry_invoice_job_rollup`.

Net: **0 tables added** (one altered), **2 views added**, **3 views rebuilt with new columns**. Total view count **39 → 41**.

### New Views Since S28d (Session 29)
- `qry_invoice_wo_costs`
- `qry_invoice_job_rollup`

### New RPCs Since S28d
None.

---

### Schema Changes (Sessions 26–28d)
- **Session 26**: `rpc_load_list(p_job_id)` RPC added for load-list reports. **NEW TABLE** `tbl_load_groups` (45th) — trucking-level groupings per job. **NEW TABLE** `tbl_load_events` (46th) — pack/load tracking per source row.
- **Session 27**: `tbl_stock_items.source_job_item_id INTEGER` FK→`tbl_job_items(item_id)` ON DELETE SET NULL — promoted-from-job-item traceability. Partial index `idx_stock_items_source_job_item WHERE source_job_item_id IS NOT NULL`. Promote-to-stock flow rewired to create stock rows synchronously (was dead-letter `notes='PROMOTE_TO_STOCK'`).
- **Session 28**: **NEW TABLE** `tbl_wo_assignees` (47th) — multi-person WO assignment (lead + additional assignees). `tbl_wo_documents.doc_type` CHECK extended to include `cad_model` (was `cut_list | drawing | reference | model`, now with `cad_model` for SketchUp / AutoCAD / STEP / IGES / 3DM source files). **NEW RPC** `rpc_pm_job_overview(p_job_id)` — single-call payload for the `/pm/jobs/[id]` 100m view (iterated to v5 across S28 → S28d).
- **Session 28b**: `learning_category` enum gains `pm_note` (order 11) and `materials_note` (order 12). Total 12 values. These categories back the PM view's inline PM note editor and the single-thread materials notes.
- **Session 28d**: `rpc_pm_job_overview` v5 fixes — dual-path BOM join (scope-attached OR WO-attached) and Length-on-Metre unit conversion. RPC-only patch, no table/view schema changes.

### New Views Since S25
None. View count stays at 39.

### New RPCs Since S25
- `rpc_load_list(p_job_id INTEGER) → json` (S26) — load-list report source of truth.
- `rpc_pm_job_overview(p_job_id INTEGER) → json` (S28, iterated) — PM 100m-view payload.

---

## Tables (47)

### Core Production
- **tbl_production_plan**: job_id PK, job_number, external_project_ref, job_name, client_name, event_date, event_location, budget_allowance, pm_note, post_event_delivery, created_by, created_at, job_status, updated_at
- **tbl_quotes**: quote_id PK, job_id FK, quote_reference, quote_version, quote_description, quote_value, quote_date, status, notes, imported_at, imported_by, updated_at
- **tbl_quote_lines**: quote_line_id PK, quote_id FK, job_id FK, line_number VARCHAR(20), import_sequence, line_text, line_value, event_zone, line_sub_group, category, pm_note, interpretation_complete, kit_list_exported, imported_at, quantity, unit_price, updated_at, pm_est_cost, pm_est_labour_days, pm_est_material_cost, pm_est_rate_override, pm_est_notes
- **tbl_quote_line_contractors**: id PK, quote_line_id FK, contractor_id, contractor_quote_value, description, notes, created_at, supplier_id FK

### Scope & Work Orders
- **tbl_scope_items**: scope_item_id PK, job_id FK, quote_line_id FK, modified_quote_line_id, item_name, category_id FK, description, event_zone, complexity_construction, finish_relative, status, is_general, completion_photo_path, photo_waiver, photo_waiver_reason, cancellation_reason, created_by, created_at, modified_at, photo_path, updated_at
- **tbl_scope_item_categories**: category_id PK, category_name, description, active, guidance_note TEXT
- **tbl_scope_options**: option_id PK, scope_item_id FK, option_label, description, pros, cons, est_labour_days, est_material_cost, est_total_cost, impact_on_quote, status, selected_by, selected_at, created_by, created_at
- **tbl_work_orders**: work_order_id PK, job_id FK, scope_item_id FK, activity_verb, description, estimated_duration_hrs, reference_wo_id, complexity_construction, finish_relative, planned_lead_id FK, rate_override, status, on_hold_reason, void_reason, system_complete_timestamp, actual_complete_timestamp, completion_photo_path, wo_sequence, traveller_printed_at, traveller_printed_by, paint_notes TEXT, predecessor_wo_id BIGINT FK→tbl_work_orders (S24), updated_at
- **tbl_wo_activities**: id PK, work_order_id FK, activity_id, sequence, notes
- **tbl_wo_assignees** (S28 — NEW): wo_assignee_id PK, work_order_id FK→tbl_work_orders, freelancer_id FK→tbl_freelancers, assigned_at, assigned_by UUID→auth.users. Supports multi-person WOs alongside `tbl_work_orders.planned_lead_id`.
- **tbl_wo_bom**: bom_id PK, work_order_id FK (nullable), scope_item_id FK (nullable), job_id FK, material_id FK, stock_item_id FK, job_item_id FK→tbl_job_items(item_id), material_category, item_description, stock_reference, quantity, unit, unit_cost, actual_unit_cost, supplier, needs_ordering, ordered_at, ordered_by, notes, expected_delivery, from_stock BOOLEAN, updated_at. **Note**: BOM rows can be attached via *scope_item_id* OR *work_order_id* (either alone is valid). Roll-ups from BOM to quote-line must handle both paths (see `rpc_pm_job_overview` v5).
- **tbl_wo_time_entries**: entry_id PK, work_order_id FK, freelancer_id FK, system_start_timestamp, actual_start_timestamp, system_end_timestamp, actual_end_timestamp, actual_hours, applied_hourly_rate, entry_cost, flag_note, timestamp_edited_flag, archived_at, archived_by, archive_reason
- **tbl_wo_documents**: doc_id PK, work_order_id FK, scope_item_id FK, job_id FK, **doc_type VARCHAR** (CHECK: `cut_list | drawing | reference | model | cad_model` — S28), file_name, onedrive_path, onedrive_item_id, file_size, mime_type, caption, sort_order, uploaded_by, uploaded_at, extraction_status, extracted_data JSONB

### Job Items & Stock
- **tbl_job_items**: item_id PK, job_id FK, scope_item_id FK, description, item_type, stock_reference, stock_item_id FK, item_source (stock/bespoke/promoted), quantity, unit, finish_required, kit_list_exported, notes, created_by, created_at, temp_selected, source_item_id FK (self-ref)
- **tbl_jobitem_workorder**: junction_id PK, job_item_id FK, work_order_id FK, notes
- **tbl_job_attachments**: attachment_id PK, job_id FK, scope_item_id FK, quote_line_id FK, file_path, file_type, uploaded_by, uploaded_at, caption, file_name, file_category
- **tbl_stock_items**: stock_id PK, product_code, description, stock_quantity, location, weight_kg, hire_cost_day, hire_cost_week, display_order BIGINT, last_checked, category, thumbnail_url, active, created_at, **source_job_item_id INTEGER FK→tbl_job_items(item_id) ON DELETE SET NULL** (S27 — promoted-from-job-item traceability)

### Load Planning (S26 — NEW)
- **tbl_load_groups**: load_group_id PK, job_id FK, name, description, driver_name, departure_at, sort_order, created_at, updated_at. One row per trip/truck/lorry for a job.
- **tbl_load_events**: load_event_id PK, load_group_id FK (nullable), job_id FK, source_table TEXT, source_id INTEGER, status TEXT, packed_by UUID→auth.users, packed_at, loaded_by UUID→auth.users, loaded_at, notes, created_at, updated_at. Polymorphic — `source_table` + `source_id` reference whichever operational table is being loaded (job_items, scope_items, etc.).

### People & Scheduling
- **tbl_freelancers**: freelancer_id PK, freelancer_name, phone, email, role, speciality, day_rate, standard_day_hours, active, system_access, notes, created_at
- **tbl_freelancer_schedule**: schedule_id PK, freelancer_id FK, scheduled_date, status, job_id FK, booking_group UUID, notified_at, notes, unavailable_reason

### Materials & Suppliers
- **tbl_materials**: material_id PK, material_name, material_category, unit, standard_length, standard_sheet_size, standard_width INT, current_unit_cost, primary_supplier, spec_val_1/2/3, spec_text_1/2, paint_finish, active. **Note**: `standard_length` is stored in mm (e.g. 4800 = 4.8m). Roll-ups that interpret BOM `unit='Length'` against material `unit='Metre'` must multiply by `standard_length / 1000`.
- **tbl_material_prices**: price_id PK, material_id FK, unit_cost, effective_date, supplier, source
- **tbl_material_aliases**: alias_id PK, material_id FK, alias_text, supplier
- **tbl_material_spec_defs**: spec_def_id PK, category_name, slot, label, unit
- **tbl_material_category_config**: config_id PK, category_id FK→tbl_master_lookups, pricing_unit VARCHAR(30), buying_unit VARCHAR(30), fixed_dimension VARCHAR(30), bin_pack_mode VARCHAR(10), notes TEXT, active BOOLEAN, created_at, updated_at
- **tbl_suppliers**: supplier_id PK, supplier_name, phone, email, contact_name, speciality, payment_terms, active
- **tbl_invoices**: invoice_id PK, supplier, invoice_number, invoice_date, total_value, job_id FK, status, supplier_id FK
- **tbl_invoice_lines**: line_id PK, invoice_id FK, line_number, raw_description, quantity, unit, unit_cost, line_total, material_id FK, match_status, job_id FK
- **tbl_invoice_allocations**: allocation_id PK, invoice_line_id FK→tbl_invoice_lines(line_id), scope_item_id FK→tbl_scope_items (nullable, S29), work_order_id FK→tbl_work_orders (nullable, S29 NEW), percentage NUMERIC DEFAULT 100, allocated_amount NUMERIC, notes, created_at, updated_at. CHECK `chk_alloc_exactly_one_target` enforces exactly one of `scope_item_id` / `work_order_id` is set per row. No row on an invoice line = line stays at job level (unallocated).

### Lookups & Settings
- **tbl_master_lookups**: lookup_id PK, category, lookup_value, display_order, phase_number, phase_label, active
- **tbl_category_prompts**: prompt_id PK, category_id FK, description, typical_item_type, display_order, stock_item_id FK→tbl_stock_items, quantity_default INT, prompt_group TEXT
- **tbl_rate_card**: id PK, complexity, label, rate_per_hour, description
- **tbl_business_settings**: id PK, setting_key, setting_value, description

### Communication & Workflow
- **tbl_notifications**: notification_id PK, type, title, detail, severity, source_freelancer_id, source_job_id, source_wo_id, read_at, dismissed_at, action_url
- **tbl_tasks**: task_id PK, freelancer_id FK, title, description, category, job_id FK, hours, worked_date, status, routed_to_wo_id, started_at, logged_at, photo_urls TEXT (JSON array of OneDrive URLs — S23)
- **tbl_workshop_requests**: request_id PK, freelancer_id FK, category, title, description, urgency, job_id FK, work_order_id FK, status, photo_url, resolution_notes
- **tbl_pm_queries**: query_id PK, job_id FK, scope_item_id FK, question, answer, status, photo_url, created_at, answered_at

### Maintenance
- **tbl_maintenance_assets**: asset_id PK, name, location, description, photo_onedrive_path, active, created_at
- **tbl_maintenance_tasks**: task_id PK, asset_id FK, description, instructions, frequency, day_of_week, estimated_minutes, sort_order, active
- **tbl_maintenance_logs**: log_id PK, asset_id FK, performed_by FK, work_order_id FK, started_at, completed_at, status, notes
- **tbl_maintenance_checks**: check_id PK, log_id FK, task_id FK, completed_at, note, flagged, completed_by FK
- **tbl_maintenance_flags**: flag_id PK, asset_id FK, check_id FK, raised_by FK, severity, title, description, photo_onedrive_path, status, resolution_notes, resolved_by, resolved_at
- **tbl_maintenance_asset_photos**: photo_id PK, asset_id FK, onedrive_path, file_name, caption, sort_order, uploaded_by FK, uploaded_at

### Audit
- **tbl_audit_log**: audit_id PK, user_id, user_name, user_role, table_name, record_id, field_name, old_value, new_value, changed_at, job_id, action_type, reverted_at, reverted_by

### Knowledge
- **tbl_learnings**: learning_id UUID PK, category `learning_category` (enum, 12 values — see below), sub_type TEXT, severity INT 1-5, cost_impact_gbp NUMERIC(10,2), hours_impact NUMERIC(6,2), actionable BOOLEAN, headline TEXT (3-200 chars, required), detail TEXT, job_id FK, quote_line_id FK, scope_item_id FK, work_order_id FK, bom_id FK, time_entry_id FK, material_id FK, stock_item_id FK, freelancer_id FK, supplier_id FK (at least one required via CHECK), **embedding VECTOR(512)** (pgvector, Voyage voyage-3-lite), embedding_status (pending/ready/failed/disabled), created_by UUID→auth.users, created_at, updated_at, resolved_at, resolved_by, resolution_notes
- **tbl_learning_links**: link_id UUID PK, learning_id FK→tbl_learnings, entity_type TEXT (job/quote_line/scope_item/work_order/bom/time_entry/material/stock_item/freelancer/supplier), entity_id INT, created_at. UNIQUE(learning_id, entity_type, entity_id)

## Enums

### learning_category (12 values)
| Order | Value | Added in |
|------:|-------|----------|
| 1 | `estimate_miss` | S25 |
| 2 | `scope_change` | S25 |
| 3 | `execution_issue` | S25 |
| 4 | `material_supply_issue` | S25 |
| 5 | `client_behaviour` | S25 |
| 6 | `design_issue` | S25 |
| 7 | `process_issue` | S25 |
| 8 | `communication_gap` | S25 |
| 9 | `judgement_call` | S25 |
| 10 | `positive_learning` | S25 |
| 11 | `pm_note` | **S28b** — inline PM explanatory note per quote line, actionable=false, severity=1 default, one row per quote_line_id (upsert pattern) |
| 12 | `materials_note` | **S28b** — single-thread materials note per quote line (covers both Job items and Materials sub-sections on PM view) |

## CHECK Constraints (notable)

### tbl_wo_documents.doc_type (S28)
```
doc_type IN ('cut_list', 'drawing', 'reference', 'model', 'cad_model')
```
- `model` — GLB/GLTF for inline 3D viewer (browser-renderable)
- `cad_model` — SketchUp / AutoCAD / STEP / IGES / 3DM source files (download-only; PM view shows as download cards)

## Views (41)

### Production & Cost
qry_cost_waterfall, qry_dash_quote_stats, qry_dash_upcoming_jobs, qry_dash_wo_stats, qry_estimate_vs_actual, qry_freelancer_hours_summary, qry_invoice_job_rollup, qry_invoice_scope_costs, qry_invoice_wo_costs, qry_job_accepted_quote, qry_job_cost_summary, qry_job_estimated_cost, qry_job_execution_list, qry_job_quote_margin, qry_jobitems_withcoverage, qry_manpower_demand, qry_material_reconciliation, qry_material_summary_by_job, qry_materials_list, qry_procurement_needed, qry_quote_lines_with_contractors, qry_quote_scopes, qry_quoteline_margin, qry_recent_orders, qry_review_inbox, qry_scope_breakdown, qry_scope_context, qry_scope_estimated_cost, qry_scope_wo_stats, qry_scopeitem_cost_summary, qry_stale_travellers, qry_supplier_summary, qry_wo_cost_labour, qry_wo_cost_material, qry_wo_cost_summary, qry_wo_estimated_cost, qry_wo_phase_ordered, qry_wo_with_activities

### Maintenance
qry_maintenance_asset_summary, qry_maintenance_task_status

### Knowledge
qry_learnings_enriched — learnings joined with entity names + CONCAT_WS context_label (prefixes: Scope:, Mat:, Stock:, Supplier:, Freelancer:). security_invoker=true

## RPC Functions (10)

| RPC | Args | Added | Notes |
|-----|------|-------|-------|
| `rpc_dashboard_data` | — | S12 | Admin dashboard payload |
| `rpc_workshop_data` | — | S12 | Workshop view payload |
| `rpc_review_data` | — | S12 | Review page payload |
| `rpc_capacity_data` | `p_date_from text, p_date_to text` | S12 | Capacity planner |
| `rpc_job_detail_data` | `p_job_id integer` | S12 | Admin job detail |
| `rpc_report_job_financial` | `p_job_id integer` | S12 | Pre-build financial report |
| `rpc_active_workers` | — | S22 | SECURITY DEFINER, bypasses freelancer RLS for cross-user who/where |
| `rpc_learnings_similar` | `p_query_embedding vector, p_limit int = 5, p_category learning_category = null` | S25 | Semantic similarity over learnings embeddings |
| `rpc_load_list` | `p_job_id integer` | **S26** | Load-list report payload, reads tbl_load_groups + tbl_load_events |
| `rpc_pm_job_overview` | `p_job_id integer` | **S28 → v5 at S28d** | PM 100m-view payload. Returns job, quote_lines[] with scopes/WOs/BOM split into job_items + materials groups, per-WO time_entries, doc list, pm_note_inline, learning counts. Key v5 fixes: dual-path BOM join (scope OR WO), Length-on-Metre unit→base multiplier |

## Utility Functions (7)
- `get_my_role()` — reads role from `auth.jwt() app_metadata`
- `get_my_freelancer_id()` — reads freelancer_id from `auth.jwt() user_metadata`
- `trigger_set_updated_at()` — auto-sets updated_at on row update
- `audit_retention_cycle()` — monthly hot/warm/cold archive lifecycle
- `rls_auto_enable()` — auto-enables RLS on new tables
- `tbl_learnings_mark_embedding_pending()` (S25) — BEFORE UPDATE trigger, flips embedding_status to pending when headline/detail change
- `user_role()`, `user_freelancer_id()` — legacy helpers

## Extensions
- `pgcrypto` (UUID generation)
- `pgvector` (S25) — vector similarity search
- `pg_net` (S25) — database HTTP requests (reserved for future webhooks)

## Indexes (200+)
Full index coverage across all tables. Notable additions since S25:
- **S27** — Partial `idx_stock_items_source_job_item WHERE source_job_item_id IS NOT NULL` on `tbl_stock_items`
- **S28** — FK indexes on the three new tables (tbl_load_groups, tbl_load_events, tbl_wo_assignees)

Key existing indexes (unchanged from S25):
- Partial indexes on archived_at (time entries), status fields (WOs, requests, tasks)
- FTS on materials + stock items
- Composite indexes on schedule (freelancer+date), audit log (table+record, changed_at)
- FK indexes on all foreign keys (S19 audit)
- `ivfflat idx_learnings_embedding_vec` — cosine similarity on tbl_learnings.embedding (100 lists, filtered WHERE embedding IS NOT NULL)
- Partial `idx_learnings_actionable` — WHERE actionable=true AND resolved_at IS NULL
- Partial FK indexes on all 10 tbl_learnings entity refs — WHERE {field} IS NOT NULL

## RLS Summary
- **All 47 tables have RLS enabled**
- S19: consolidated to 1 policy per (table, action) using `get_my_role()` CASE pattern
- All views have `security_invoker = true`
- Commercial tables (quotes, invoices, rate_card, suppliers, material_prices) restricted to admin/manager
- **tbl_learnings**: admin/manager select/insert/update, admin-only delete. Freelancers blocked (pilot phase)
- Freelancer self-data: tbl_tasks, tbl_workshop_requests, own schedule entries
- New tables inherit `rls_auto_enable()` trigger — any NEW table added gets RLS enabled by default

## Role Hierarchy
- `admin` — full access, user management, audit revert, archive
- `manager` / `production_manager` — full project operations, PM estimates, quote lines, cost analysis
- `foreman` — read-only commercial data, all operational data
- `freelancer` — own time entries, own tasks, own requests, visible bookings
- Role stored in `auth.users.app_metadata.role` (not user_metadata — prevents self-elevation)

## Conventions (reinforced in S26–S28d)
- **BOM reaches quote line via two paths**: scope-attached (`b.scope_item_id` set) OR WO-attached (`b.work_order_id` set, `b.scope_item_id` null). Any roll-up must handle both — `COALESCE(si_direct.quote_line_id, si_via_wo.quote_line_id)` pattern. *(S28d)*
- **BOM unit ≠ material unit means conversion**: when `tbl_wo_bom.unit = 'Length'` and `tbl_materials.unit = 'Metre'`, cost = `qty × unit_cost × (standard_length/1000)`. The earlier blunt "BOM total = qty × unit_cost always" (S16) under-priced any timber/linear-trim row stored with unit='Length'. *(S28d)*
- **Promote-to-stock is immediate, not deferred**: clicking "→ STOCK" creates a `tbl_stock_items` row synchronously and links back via `source_job_item_id`. `item_source='promoted'` on the job item is the post-state signal. *(S27)*
- **PM notes upsert, not thread**: one `pm_note` learning per `quote_line_id`. Find-then-update or insert if none. Empty save deletes. *(S28b)*
- **Category-filtered learning threads**: when multiple note types anchor the same entity, use `LearningsSection`'s `filterCategories` / `excludeCategories` props. Materials section uses `filterCategories={['materials_note']}`; other threads use `excludeCategories={['pm_note', 'materials_note']}`. *(S28b)*
