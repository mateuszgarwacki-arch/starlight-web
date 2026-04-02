# Starlight Database Schema — Session 18 (2 Apr 2026)

Verified from live database. 42 tables, 38 views, 6 RPC functions, 7 utility functions, 115+ indexes.

## Changes from Session 17

### Schema Changes (Session 18)
- `tbl_master_lookups`: New QUOTE_LINE_CATEGORY value: "Install (Materials)" — install items that need materials/ordering prep (distinct from plain "Install" which needs no prep)

### No new tables, columns, views, or indexes

### Frontend-Only Changes (Session 18)
- **Dark theme migration**: Full token system (base/surface/foreground/muted/faint/subtle). 2875 color replacements across 64 files. Brand palette: steel blue #7BA4D4, dusty rose #D47BA0
- **BOM cost fix**: `bomRowTotal` simplified to `qty × unit_cost` (was incorrectly multiplying by stdLen for Length unit). Toggle now converts both qty AND unit_cost
- **Auto-tick removed**: Done = manual only. `isDone()` checks only `interpretation_complete`
- **Default filter**: "To Do" (workshop categories not done) is default on job page. "All" moved to end
- **Auto-stop WO entries**: freelancer START/JOIN auto-stops open time entries on other WOs
- **Crew timestamps**: time entries show start→end times
- **Traveller**: forced light on screen (not just print)
- **Scope column**: repositioned between Value and PM Est with named header
- **Orders panel**: resolves scope names through WO chain (work_order_id→scope_item_id)

## Tables (42)

### Core Production
- **tbl_production_plan**: job_id PK, job_number, external_project_ref, job_name, client_name, event_date, event_location, budget_allowance, pm_note, post_event_delivery, created_by, created_at, job_status, updated_at
- **tbl_quotes**: quote_id PK, job_id FK, quote_reference, quote_version, quote_description, quote_value, quote_date, status, notes, imported_at, imported_by, updated_at
- **tbl_quote_lines**: quote_line_id PK, quote_id FK, job_id FK, line_number VARCHAR(20), import_sequence, line_text, line_value, event_zone, line_sub_group, category, pm_note, interpretation_complete, kit_list_exported, imported_at, quantity, unit_price, updated_at, pm_est_cost, pm_est_labour_days, pm_est_material_cost, pm_est_rate_override, pm_est_notes
- **tbl_quote_line_contractors**: id PK, quote_line_id FK, contractor_id, contractor_quote_value, description, notes, created_at, supplier_id FK

### Scope & Work Orders
- **tbl_scope_items**: scope_item_id PK, job_id FK, quote_line_id FK, modified_quote_line_id, item_name, category_id FK, description, event_zone, complexity_construction, finish_relative, status, is_general, completion_photo_path, photo_waiver, photo_waiver_reason, cancellation_reason, created_by, created_at, modified_at, photo_path, updated_at
- **tbl_scope_item_categories**: category_id PK, category_name, description, active, **guidance_note TEXT**
- **tbl_scope_options**: option_id PK, scope_item_id FK, option_label, description, pros, cons, est_labour_days, est_material_cost, est_total_cost, impact_on_quote, status, selected_by, selected_at, created_by, created_at
- **tbl_work_orders**: work_order_id PK, job_id FK, scope_item_id FK, activity_verb, description, estimated_duration_hrs, reference_wo_id, complexity_construction, finish_relative, planned_lead_id FK, rate_override, status, on_hold_reason, void_reason, system_complete_timestamp, actual_complete_timestamp, completion_photo_path, wo_sequence, traveller_printed_at, traveller_printed_by, paint_notes TEXT, updated_at
- **tbl_wo_activities**: id PK, work_order_id FK, activity_id, sequence, notes
- **tbl_wo_bom**: bom_id PK, work_order_id FK (nullable), scope_item_id FK (nullable), job_id FK, material_id FK, stock_item_id FK, **job_item_id FK→tbl_job_items(item_id)**, material_category, item_description, stock_reference, quantity, unit, unit_cost, actual_unit_cost, supplier, needs_ordering, ordered_at, ordered_by, notes, expected_delivery, from_stock BOOLEAN, updated_at
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
- **tbl_materials**: material_id PK, material_name, material_category, unit, standard_length, standard_sheet_size, current_unit_cost, primary_supplier, spec_val_1/2/3, spec_text_1/2, paint_finish, active
- **tbl_material_prices**: price_id PK, material_id FK, unit_cost, effective_date, supplier, source
- **tbl_material_aliases**: alias_id PK, material_id FK, alias_text, supplier
- **tbl_material_spec_defs**: spec_def_id PK, category_name, slot, label, unit
- **tbl_suppliers**: supplier_id PK, supplier_name, phone, email, contact_name, speciality, payment_terms, active
- **tbl_invoices**: invoice_id PK, supplier, invoice_number, invoice_date, total_value, job_id FK, status, supplier_id FK
- **tbl_invoice_lines**: line_id PK, invoice_id FK, line_number, raw_description, quantity, unit, unit_cost, line_total, material_id FK, match_status, job_id FK
- **tbl_invoice_allocations**: id PK, invoice_line_id FK, scope_item_id FK, percentage, allocated_amount, notes, created_by, created_at, updated_at

### Lookups & Settings
- **tbl_master_lookups**: lookup_id PK, category, lookup_value, display_order, phase_number, phase_label, active
- **tbl_category_prompts**: prompt_id PK, category_id FK, description, typical_item_type, display_order, **stock_item_id FK→tbl_stock_items**, **quantity_default INT**, **prompt_group TEXT**
- **tbl_rate_card**: id PK, complexity, label, rate_per_hour, description
- **tbl_business_settings**: id PK, setting_key, setting_value, description

### Communication & Workflow
- **tbl_notifications**: notification_id PK, type, title, detail, severity, source_freelancer_id, source_job_id, source_wo_id, read_at, dismissed_at, action_url
- **tbl_tasks**: task_id PK, freelancer_id FK, title, description, category, job_id FK, hours, worked_date, status, routed_to_wo_id, started_at, logged_at
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

## Views (38)
qry_cost_waterfall, qry_dash_quote_stats, qry_dash_upcoming_jobs, qry_dash_wo_stats, qry_estimate_vs_actual, qry_freelancer_hours_summary, qry_invoice_scope_costs, qry_job_accepted_quote, qry_job_cost_summary, qry_job_estimated_cost, qry_job_execution_list, qry_job_quote_margin, qry_jobitems_withcoverage, qry_manpower_demand, qry_maintenance_asset_summary, qry_maintenance_task_status, qry_material_reconciliation, qry_material_summary_by_job, qry_materials_list, qry_procurement_needed, qry_quote_lines_with_contractors, qry_quote_scopes, qry_quoteline_margin, qry_recent_orders, qry_review_inbox, qry_scope_breakdown, qry_scope_context, qry_scope_estimated_cost, qry_scope_wo_stats, qry_scopeitem_cost_summary, qry_stale_travellers, qry_supplier_summary, qry_wo_cost_labour, qry_wo_cost_material, qry_wo_cost_summary, qry_wo_estimated_cost, qry_wo_phase_ordered, qry_wo_with_activities

## RPC Functions (6)
- `rpc_dashboard_data()` → json
- `rpc_workshop_data()` → json
- `rpc_review_data()` → json
- `rpc_capacity_data(p_date_from, p_date_to)` → json
- `rpc_job_detail_data(p_job_id)` → json
- `rpc_report_job_financial(p_job_id)` → json

## Utility Functions (7)
- `get_my_role()` — reads role from auth.jwt() app_metadata
- `get_my_freelancer_id()` — reads freelancer_id from auth.jwt() user_metadata
- `trigger_set_updated_at()` — auto-sets updated_at on row update
- `audit_retention_cycle()` — monthly hot/warm/cold archive lifecycle
- `rls_auto_enable()` — auto-enables RLS on new tables
- `user_role()` — legacy
- `user_freelancer_id()` — legacy

## Cost Model

### Unified Job Items & Materials (Session 17)
- **Stock items**: job item + paired BOM row (auto-created). `tbl_wo_bom.job_item_id` FK links them. Cost = qty × hire_cost_day. Qty syncs between job item and BOM row
- **Bespoke items**: job item only. Cost derived from WOs via `tbl_jobitem_workorder` junction
- **Materials**: BOM row only (scope-level, no WO needed). Cost = qty × unit_cost
- All costs flow through `tbl_wo_bom` → existing cost views unchanged

### BOM Costing Rule (Session 18 — corrected)
- **Total = qty × unit_cost (always)**. No special Length-mode multiplication in frontend JS
- **unit_cost is per-unit**: if unit=Metre, cost is per metre. If unit=Length, cost is per length. If unit=Sheet, cost is per sheet
- **Cut list extraction**: converts per-metre catalogue price to per-length when inserting timber BOM (unit_cost = price_per_m × std_length_m)
- **Toggle Metre↔Length**: converts both qty AND unit_cost so total stays constant. Metre→Length: qty=ceil(qty/stdLen), cost=cost×stdLen. Length→Metre: qty=qty×stdLen, cost=cost/stdLen
- **SQL views** already use `quantity × NZ(actual_unit_cost, unit_cost)` — no change needed in DB

### Spent vs Committed
- **Spent** = frozen costs: closed time entries + BOM materials (ordered/stock)
- **Committed** = max(Estimated, Spent) — projected landing cost
- **Estimated** = WO estimated_duration_hrs × rate card rate + BOM quantity × unit_cost
- **Margin** = Quoted − Committed

### Prompt Engine (Session 17)
- `tbl_category_prompts.stock_item_id` → clicking + creates stock-linked job item + paired BOM row
- `tbl_category_prompts.prompt_group` → collapsible sections on scope pages
- `tbl_scope_item_categories.guidance_note` → shown at top of Typical Components panel
- Managed via Settings → Typical Components tab

### Category Behaviour (Session 18)
- **Install**: no scope creation, no amber, not in To Do. Just tick done when handled
- **Install (Materials)**: scope creation, amber highlight, appears in To Do. Same workflow as Workshop
- **Done = manual only**: `isDone()` checks only `interpretation_complete`. No auto-tick from scope/contractor existence
