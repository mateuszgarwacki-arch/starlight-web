# Starlight Database Schema — Session 25 (17 Apr 2026)

Verified from live database. 44 tables, 39 views, 8 RPC functions, 7 utility functions, 198 indexes.

## Changes from Session 20

### Schema Changes (Sessions 21-25)
- **Session 21**: `qry_review_inbox` updated to expose `routed_to_wo_id` as `work_order_id` (UNION subquery pattern for ORDER BY)
- **Session 22**: `rpc_active_workers()` added — SECURITY DEFINER RPC exposing non-sensitive active worker data (bypasses freelancer RLS)
- **Session 23**: `tbl_tasks.photo_urls` TEXT column added — JSON array of OneDrive URLs
- **Session 24**: `tbl_work_orders.predecessor_wo_id` column added — WO chaining (↳ Next Step feature). BUILD/COVER `phase_number` populated
- **Session 25**: **NEW TABLE** `tbl_learnings` — institutional knowledge capture (43rd table). **NEW TABLE** `tbl_learning_links` — m:m junction (44th table). `pgvector` + `pg_net` extensions enabled

### New Views (Session 25)
- `qry_learnings_enriched` — learnings joined with all entity tables + context_label

### New RPCs (Session 25)
- `rpc_learnings_similar(query_embedding VECTOR(512), limit, category?)` — semantic similarity retrieval

## Tables (44)

### Core Production
- **tbl_production_plan**: job_id PK, job_number, external_project_ref, job_name, client_name, event_date, event_location, budget_allowance, pm_note, post_event_delivery, created_by, created_at, job_status, updated_at
- **tbl_quotes**: quote_id PK, job_id FK, quote_reference, quote_version, quote_description, quote_value, quote_date, status, notes, imported_at, imported_by, updated_at
- **tbl_quote_lines**: quote_line_id PK, quote_id FK, job_id FK, line_number VARCHAR(20), import_sequence, line_text, line_value, event_zone, line_sub_group, category, pm_note, interpretation_complete, kit_list_exported, imported_at, quantity, unit_price, updated_at, pm_est_cost, pm_est_labour_days, pm_est_material_cost, pm_est_rate_override, pm_est_notes
- **tbl_quote_line_contractors**: id PK, quote_line_id FK, contractor_id, contractor_quote_value, description, notes, created_at, supplier_id FK

### Scope & Work Orders
- **tbl_scope_items**: scope_item_id PK, job_id FK, quote_line_id FK, modified_quote_line_id, item_name, category_id FK, description, event_zone, complexity_construction, finish_relative, status, is_general, completion_photo_path, photo_waiver, photo_waiver_reason, cancellation_reason, created_by, created_at, modified_at, photo_path, updated_at
- **tbl_scope_item_categories**: category_id PK, category_name, description, active, guidance_note TEXT
- **tbl_scope_options**: option_id PK, scope_item_id FK, option_label, description, pros, cons, est_labour_days, est_material_cost, est_total_cost, impact_on_quote, status, selected_by, selected_at, created_by, created_at
- **tbl_work_orders**: work_order_id PK, job_id FK, scope_item_id FK, activity_verb, description, estimated_duration_hrs, reference_wo_id, complexity_construction, finish_relative, planned_lead_id FK, rate_override, status, on_hold_reason, void_reason, system_complete_timestamp, actual_complete_timestamp, completion_photo_path, wo_sequence, traveller_printed_at, traveller_printed_by, paint_notes TEXT, **predecessor_wo_id BIGINT FK→tbl_work_orders** (Session 24), updated_at
- **tbl_wo_activities**: id PK, work_order_id FK, activity_id, sequence, notes
- **tbl_wo_bom**: bom_id PK, work_order_id FK (nullable), scope_item_id FK (nullable), job_id FK, material_id FK, stock_item_id FK, job_item_id FK→tbl_job_items(item_id), material_category, item_description, stock_reference, quantity, unit, unit_cost, actual_unit_cost, supplier, needs_ordering, ordered_at, ordered_by, notes, expected_delivery, from_stock BOOLEAN, updated_at
- **tbl_wo_time_entries**: entry_id PK, work_order_id FK, freelancer_id FK, system_start_timestamp, actual_start_timestamp, system_end_timestamp, actual_end_timestamp, actual_hours, applied_hourly_rate, entry_cost, flag_note, timestamp_edited_flag, archived_at, archived_by, archive_reason
- **tbl_wo_documents**: doc_id PK, work_order_id FK, scope_item_id FK, job_id FK, doc_type, file_name, onedrive_path, onedrive_item_id, file_size, mime_type, caption, sort_order, uploaded_by, uploaded_at, extraction_status, extracted_data JSONB

### Job Items & Stock
- **tbl_job_items**: item_id PK, job_id FK, scope_item_id FK, description, item_type, stock_reference, stock_item_id FK, item_source (stock/bespoke/promoted), quantity, unit, finish_required, kit_list_exported, notes, created_by, created_at, temp_selected, source_item_id FK (self-ref)
- **tbl_jobitem_workorder**: junction_id PK, job_item_id FK, work_order_id FK, notes
- **tbl_job_attachments**: attachment_id PK, job_id FK, scope_item_id FK, quote_line_id FK, file_path, file_type, uploaded_by, uploaded_at, caption, file_name, file_category
- **tbl_stock_items**: stock_id PK, product_code, description, stock_quantity, location, weight_kg, hire_cost_day, hire_cost_week, display_order BIGINT, last_checked, category, thumbnail_url, active, created_at

### People & Scheduling
- **tbl_freelancers**: freelancer_id PK, freelancer_name, phone, email, role, speciality, day_rate, standard_day_hours, active, system_access, notes, created_at
- **tbl_freelancer_schedule**: schedule_id PK, freelancer_id FK, scheduled_date, status, job_id FK, booking_group UUID, notified_at, notes, unavailable_reason

### Materials & Suppliers
- **tbl_materials**: material_id PK, material_name, material_category, unit, standard_length, standard_sheet_size, standard_width INT, current_unit_cost, primary_supplier, spec_val_1/2/3, spec_text_1/2, paint_finish, active
- **tbl_material_prices**: price_id PK, material_id FK, unit_cost, effective_date, supplier, source
- **tbl_material_aliases**: alias_id PK, material_id FK, alias_text, supplier
- **tbl_material_spec_defs**: spec_def_id PK, category_name, slot, label, unit
- **tbl_material_category_config**: config_id PK, category_id FK→tbl_master_lookups, pricing_unit VARCHAR(30), buying_unit VARCHAR(30), fixed_dimension VARCHAR(30), bin_pack_mode VARCHAR(10), notes TEXT, active BOOLEAN, created_at, updated_at
- **tbl_suppliers**: supplier_id PK, supplier_name, phone, email, contact_name, speciality, payment_terms, active
- **tbl_invoices**: invoice_id PK, supplier, invoice_number, invoice_date, total_value, job_id FK, status, supplier_id FK
- **tbl_invoice_lines**: line_id PK, invoice_id FK, line_number, raw_description, quantity, unit, unit_cost, line_total, material_id FK, match_status, job_id FK
- **tbl_invoice_allocations**: id PK, invoice_line_id FK, scope_item_id FK, percentage, allocated_amount, notes, created_by, created_at, updated_at

### Lookups & Settings
- **tbl_master_lookups**: lookup_id PK, category, lookup_value, display_order, phase_number, phase_label, active
- **tbl_category_prompts**: prompt_id PK, category_id FK, description, typical_item_type, display_order, stock_item_id FK→tbl_stock_items, quantity_default INT, prompt_group TEXT
- **tbl_rate_card**: id PK, complexity, label, rate_per_hour, description
- **tbl_business_settings**: id PK, setting_key, setting_value, description

### Communication & Workflow
- **tbl_notifications**: notification_id PK, type, title, detail, severity, source_freelancer_id, source_job_id, source_wo_id, read_at, dismissed_at, action_url
- **tbl_tasks**: task_id PK, freelancer_id FK, title, description, category, job_id FK, hours, worked_date, status, routed_to_wo_id, started_at, logged_at, **photo_urls TEXT** (Session 23)
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

### Knowledge (Session 25 — NEW)
- **tbl_learnings**: learning_id UUID PK, **category learning_category** (enum: estimate_miss / scope_change / execution_issue / material_supply_issue / client_behaviour / design_issue / process_issue / communication_gap / judgement_call / positive_learning), sub_type TEXT, severity INT 1-5, cost_impact_gbp NUMERIC(10,2), hours_impact NUMERIC(6,2), actionable BOOLEAN, headline TEXT (3-200 chars, required), detail TEXT, job_id FK, quote_line_id FK, scope_item_id FK, work_order_id FK, bom_id FK, time_entry_id FK, material_id FK, stock_item_id FK, freelancer_id FK, supplier_id FK (at least one required via CHECK), **embedding VECTOR(512)** (pgvector, Voyage voyage-3-lite), embedding_status (pending/ready/failed/disabled), created_by UUID→auth.users, created_at, updated_at, resolved_at, resolved_by, resolution_notes
- **tbl_learning_links**: link_id UUID PK, learning_id FK→tbl_learnings, entity_type TEXT (job/quote_line/scope_item/work_order/bom/time_entry/material/stock_item/freelancer/supplier), entity_id INT, created_at. UNIQUE(learning_id, entity_type, entity_id)

## Views (39)

### Production & Cost
qry_cost_waterfall, qry_dash_quote_stats, qry_dash_upcoming_jobs, qry_dash_wo_stats, qry_estimate_vs_actual, qry_freelancer_hours_summary, qry_invoice_scope_costs, qry_job_accepted_quote, qry_job_cost_summary, qry_job_estimated_cost, qry_job_execution_list, qry_job_quote_margin, qry_jobitems_withcoverage, qry_manpower_demand, qry_material_reconciliation, qry_material_summary_by_job, qry_materials_list, qry_procurement_needed, qry_quote_lines_with_contractors, qry_quote_scopes, qry_quoteline_margin, qry_recent_orders, qry_review_inbox, qry_scope_breakdown, qry_scope_context, qry_scope_estimated_cost, qry_scope_wo_stats, qry_scopeitem_cost_summary, qry_stale_travellers, qry_supplier_summary, qry_wo_cost_labour, qry_wo_cost_material, qry_wo_cost_summary, qry_wo_estimated_cost, qry_wo_phase_ordered, qry_wo_with_activities

### Maintenance
qry_maintenance_asset_summary, qry_maintenance_task_status

### Knowledge (Session 25)
qry_learnings_enriched — learnings joined with entity names + CONCAT_WS context_label (prefixes: Scope:, Mat:, Stock:, Supplier:, Freelancer:). security_invoker=true

## RPC Functions (8)
- `rpc_dashboard_data()` → json
- `rpc_workshop_data()` → json
- `rpc_review_data()` → json
- `rpc_capacity_data(p_date_from, p_date_to)` → json
- `rpc_job_detail_data(p_job_id)` → json
- `rpc_report_job_financial(p_job_id)` → json
- `rpc_active_workers()` → table (Session 22) — SECURITY DEFINER, cross-freelancer visibility
- **`rpc_learnings_similar(p_query_embedding VECTOR(512), p_limit, p_category?)`** → table (Session 25) — semantic similarity retrieval over learnings

## Utility Functions (7)
- `get_my_role()` — reads role from auth.jwt() app_metadata
- `get_my_freelancer_id()` — reads freelancer_id from auth.jwt() user_metadata
- `trigger_set_updated_at()` — auto-sets updated_at on row update
- `audit_retention_cycle()` — monthly hot/warm/cold archive lifecycle
- `rls_auto_enable()` — auto-enables RLS on new tables
- `tbl_learnings_mark_embedding_pending()` (Session 25) — BEFORE UPDATE trigger, flips embedding_status to pending when headline/detail change
- `user_role()`, `user_freelancer_id()` — legacy helpers

## Extensions
- `pgcrypto` (UUID generation)
- **`pgvector`** (Session 25) — vector similarity search
- **`pg_net`** (Session 25) — database HTTP requests (reserved for future webhooks)

## Indexes (198)
Full index coverage across all tables. Key indexes:
- Partial indexes on archived_at (time entries), status fields (WOs, requests, tasks)
- FTS on materials + stock items
- Composite indexes on schedule (freelancer+date), audit log (table+record, changed_at)
- FK indexes on all foreign keys (Session 19 audit)
- **ivfflat `idx_learnings_embedding_vec`** (Session 25) — cosine similarity on tbl_learnings.embedding (100 lists, filtered WHERE embedding IS NOT NULL)
- **Partial `idx_learnings_actionable`** — WHERE actionable=true AND resolved_at IS NULL (surfaces open learnings fast)
- **Partial FK indexes on all 10 tbl_learnings entity refs** — WHERE {field} IS NOT NULL (fast "learnings for this job/scope/material/etc.")

## RLS Summary
- **All 44 tables have RLS enabled**
- Session 19: consolidated to 1 policy per (table, action) using `get_my_role()` CASE pattern
- All views have `security_invoker = true`
- Commercial tables (quotes, invoices, rate_card, suppliers, material_prices) restricted to admin/manager
- **tbl_learnings**: admin/manager select/insert/update, admin-only delete. Freelancers blocked (pilot phase — will open to PMs later)
- Freelancer self-data: tbl_tasks, tbl_workshop_requests, own schedule entries

## Role Hierarchy
- `admin` — full access, user management, audit revert, archive
- `manager` / `production_manager` — full project operations, PM estimates, quote lines, cost analysis
- `foreman` — read-only commercial data, all operational data
- `freelancer` — own time entries, own tasks, own requests, visible bookings
- Role stored in `auth.users.app_metadata.role` (not user_metadata — prevents self-elevation)
