# STARLIGHT PRODUCTION SYSTEM — Complete Database Schema
## Snapshot: 24 March 2026 (Session 8)

**Supabase Project:** qbdnoueqkmhznqzpkvos
**Tables:** 31 (21 migrated from Access + 10 web app additions)
**Views:** 27+
**RLS:** Enabled on all tables
**Auth:** 4 roles — admin, production_manager, foreman, freelancer
**Test Data:** Chelsea In Bloom (job_id=6), Grosvenor Hotel Wedding (13725), Goodwood Revival

---

## LAYER 1 — JOB & COMMERCIAL

### tbl_production_plan
**Purpose:** Top-level job wrapper. One record per project.
**Used by:** Every page. Dashboard, Jobs list, Job detail, all child pages.
**Dependencies:** Parent to all other tables via job_id FK.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| job_id | SERIAL PK | No | Auto-increment primary key |
| job_number | VARCHAR | No | Universal reference matching accounts system (e.g. "13794") |
| external_project_ref | VARCHAR | Yes | Link to legacy PM database record |
| job_name | VARCHAR | Yes | Human-readable name |
| client_name | VARCHAR | Yes | Client company name |
| event_date | DATE | Yes | Master scheduling constraint |
| event_location | VARCHAR | Yes | Venue name and location |
| budget_allowance | DECIMAL | Yes | Workshop production budget (not total quote value) |
| pm_note | TEXT | Yes | PM-only notes. Never visible to workshop |
| post_event_delivery | TEXT(BOOL) | Yes | Suppresses auto-close when post-event delivery outstanding |
| created_by | INT FK→freelancers | Yes | Who created this job |
| created_at | TIMESTAMPTZ | Yes | Auto-set on creation |
| job_status | VARCHAR | Yes | Active / Closed / Deleted |
| updated_at | TIMESTAMPTZ | Yes | **Session 8** — auto-updated by trigger on every edit |

---

### tbl_quotes
**Purpose:** One record per quote document. A job can have multiple quotes (different zones, versions).
**Used by:** Job detail page quote tabs.
**Dependencies:** Parent of tbl_quote_lines. Child of tbl_production_plan.
**Note:** When creating a new job via + New Job, an "Internal Build List" quote is auto-created with status Accepted.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| quote_id | SERIAL PK | No | Primary key |
| job_id | INT FK→production_plan | Yes | Which job this quote belongs to |
| quote_reference | VARCHAR | Yes | Quote document number (e.g. "39112") |
| quote_version | VARCHAR | Yes | Version identifier (e.g. "v6") |
| quote_description | VARCHAR | Yes | What this quote covers (e.g. "Nightclub and Campsite") |
| quote_value | DECIMAL | Yes | Total commercial value of this quote document |
| quote_date | DATE | Yes | When issued |
| status | VARCHAR | Yes | Draft / Issued / Accepted / Superseded |
| notes | TEXT | Yes | Context about this version |
| imported_at | TIMESTAMPTZ | Yes | Auto-set on import |
| imported_by | INT FK→freelancers | Yes | Who imported it |
| updated_at | TIMESTAMPTZ | Yes | **Session 8** — auto-updated by trigger |

---

### tbl_quote_lines
**Purpose:** Every line from every quote. Source for all scope creation. Supports manual entry AND import.
**Used by:** Job detail page (main table), scope creation dialog, cost analysis, margin calculations.
**Dependencies:** Child of tbl_quotes. Referenced by tbl_scope_items.quote_line_id.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| quote_line_id | SERIAL PK | No | Primary key |
| quote_id | INT FK→quotes | Yes | Which quote document |
| job_id | INT FK→production_plan | Yes | Denormalised for query convenience |
| line_number | VARCHAR | Yes | Original numbering (VARCHAR for "1.1", "1.11") |
| import_sequence | INT | Yes | Stable sort order regardless of line_number format |
| line_text | TEXT | Yes | Full text exactly as in quote. Never truncated |
| quantity | DECIMAL | Yes | **Session 8** — number of units (e.g. 6 tables) |
| unit_price | DECIMAL | Yes | **Session 8** — price per unit (e.g. £750) |
| line_value | DECIMAL | Yes | Total value. = qty × unit_price when both present, or lump sum |
| event_zone | VARCHAR | Yes | Section grouping (e.g. "Ballroom Foyer", "Great Room") |
| line_sub_group | VARCHAR | Yes | Level 2 heading grouping (e.g. "Décor", "Lighting") |
| category | VARCHAR | Yes | Workshop Build / Stock Pick / Subcontracted / Install / Provisional |
| pm_note | TEXT | Yes | PM annotation on this specific line |
| interpretation_complete | TEXT(BOOL) | Yes | PM confirms all scope items extracted from this line |
| kit_list_exported | TEXT(BOOL) | Yes | Whether exported to Kit List system |
| imported_at | TIMESTAMPTZ | Yes | Auto-set on import |
| updated_at | TIMESTAMPTZ | Yes | **Session 8** — auto-updated by trigger |

---

### tbl_job_attachments
**Purpose:** Unstructured file storage. Photos, PDFs, drawings. Can be linked to scope or quote line later.
**Used by:** File management on scope pages, completion photos.
*No changes in Session 8. See schema v2 for full column list.*

---

## LAYER 2 — PRODUCTION STRUCTURE

### tbl_scope_items
**Purpose:** Buildable deliverables interpreted from quote lines. One scope item = one distinct object.
**Used by:** Scope breakdown page, WO creation, cost rollup.
**Dependencies:** Child of tbl_production_plan. Parent of tbl_work_orders, tbl_job_items.
**Session 8:** updated_at column + trigger added. All field updates audited via auditedUpdate().

*Full column list unchanged from schema v2. Key addition: updated_at TIMESTAMPTZ.*

### tbl_scope_item_categories, tbl_category_prompts, tbl_job_items, tbl_jobitem_workorder
*No changes in Session 8. See schema v2 for full column lists.*

---

## LAYER 3 — EXECUTION

### tbl_work_orders
**Purpose:** Individual tasks. The unit of work assignment, time tracking, and cost capture.
**Used by:** WO page, workshop view, mobile task list, traveller, cost analysis.
**Session 8:** updated_at column + trigger added. Status changes, complexity, finish, reorder all audited.

*Full column list unchanged from schema v2. Key addition: updated_at TIMESTAMPTZ.*

### tbl_wo_bom
**Purpose:** Bill of Materials per work order.
**Session 8:** updated_at column + trigger added. Field updates and deletes audited.

*Full column list unchanged from schema v2. Key addition: updated_at TIMESTAMPTZ.*

### tbl_wo_time_entries
**Purpose:** Who worked on what, for how long. The fuel for the entire cost engine.
**Used by:** Mobile clock in/out, cost views, review page, freelancer detail, dashboard.
**Session 8:** Archive (soft delete) columns added. ALL queries filter by archived_at IS NULL.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| entry_id | SERIAL PK | No | Primary key |
| work_order_id | INT FK→work_orders | Yes | Which WO |
| freelancer_id | INT FK→freelancers | Yes | Who worked |
| system_start_timestamp | TIMESTAMPTZ | Yes | Auto-recorded on START tap |
| actual_start_timestamp | TIMESTAMPTZ | Yes | Editable by freelancer |
| system_end_timestamp | TIMESTAMPTZ | Yes | Auto-recorded on LOG tap |
| actual_end_timestamp | TIMESTAMPTZ | Yes | Editable by freelancer |
| actual_hours | DECIMAL | Yes | Final hours (admin-editable from crew detail page) |
| applied_hourly_rate | DECIMAL | Yes | Rate snapshot at time of logging |
| entry_cost | DECIMAL | Yes | = actual_hours × applied_hourly_rate |
| flag_note | TEXT | Yes | Freelancer-raised issue (2 sentences max) |
| timestamp_edited_flag | TEXT(BOOL) | Yes | Whether timestamps were manually corrected |
| archived_at | TIMESTAMPTZ | Yes | **Session 8** — soft delete timestamp |
| archived_by | UUID | Yes | **Session 8** — who archived it |
| archive_reason | VARCHAR | Yes | **Session 8** — mandatory reason for archiving |

**CRITICAL:** Every query on this table MUST include `.is("archived_at", null)` or `WHERE archived_at IS NULL`. There are 9 direct queries + 4 SQL views that were all patched in Session 8.

---

## LAYER 4 — REFERENCE & LOOKUP

### tbl_freelancers
**Purpose:** All people in the system — freelancers, foremen, PMs, admin.
**Session 8:** Now audited via auditedUpdate(). Admin-only editing on /crew/[id] detail page.

*Full column list unchanged from schema v2.*

### tbl_freelancer_schedule, tbl_materials, tbl_material_prices, tbl_material_spec_defs, tbl_master_lookups, tbl_suppliers
*No changes in Session 8. See schema v2 for full column lists.*

---

## LAYER 5 — WEB APP ADDITIONS

### tbl_audit_log (**NEW — Session 8**)
**Purpose:** Comprehensive change tracking with undo support. Every field-level change on key tables is logged with who, when, old value, new value. Supports one-click revert.
**Used by:** Settings → Audit Log tab (admin/PM only). Revert button per entry.
**Managed by:** `src/lib/audit.ts` — auditedUpdate(), auditedInsert(), auditedDelete(), revertAuditEntry()

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| audit_id | BIGSERIAL PK | No | Primary key |
| user_id | UUID | Yes | Supabase Auth user ID of who made the change |
| user_name | VARCHAR | Yes | Display name at time of action |
| user_role | VARCHAR | Yes | Role at time of action (admin/pm/foreman/freelancer) |
| table_name | VARCHAR | No | Which table was changed |
| record_id | INT | No | PK of the changed record |
| field_name | VARCHAR | No | Which field. "_record" for insert/delete of whole record |
| old_value | TEXT | Yes | JSON-encoded previous value |
| new_value | TEXT | Yes | JSON-encoded new value |
| changed_at | TIMESTAMPTZ | Yes | Default NOW() |
| job_id | INT | Yes | Denormalised for filtering by job |
| action_type | VARCHAR | Yes | update / insert / delete / archive / revert |
| reverted_at | TIMESTAMPTZ | Yes | When this change was undone |
| reverted_by | UUID | Yes | Who reverted it |

**Indexes:** job_id+changed_at, table+record+changed_at, user+changed_at, changed_at DESC
**RLS:** PM/admin can SELECT and UPDATE (for revert). All authenticated can INSERT.
**Audited tables:** tbl_quote_lines, tbl_scope_items, tbl_work_orders, tbl_wo_bom, tbl_production_plan, tbl_quotes, tbl_wo_time_entries, tbl_freelancers

**Retention policy (planned):** Hot 0-3mo (full + undo), Warm 3-12mo (read-only), Cold 12mo+ (compress to summary)

### tbl_quote_line_contractors, tbl_wo_activities, tbl_material_aliases, tbl_invoices, tbl_invoice_lines, tbl_wo_documents, tbl_rate_card, tbl_business_settings, tbl_notifications
*No changes in Session 8. See schema v2 for full column lists.*

### tbl_contractors — DEPRECATED (merged into tbl_suppliers in Session 2)
### tbl_dummy_source_quote, tbl_dummy_stock_items — test data tables

---

## VIEWS (27+)

### Cost Views (REBUILT in Session 8 — archive filter added)

**qry_wo_cost_summary** — Individual WO cost: labour + material. `WHERE archived_at IS NULL` on time entries.
**qry_scopeitem_cost_summary** — Scope item level cost breakdown. Rolls up from qry_wo_cost_summary.
**qry_job_cost_summary** — Full job cost rollup with margin %. Uses `ROUND(...)::numeric` for PG compatibility.
**qry_estimate_vs_actual** — Estimated vs actual hours per completed WO. Excludes archived entries.
**qry_today_roster** — Who's on site today. Excludes archived entries.

### Analytics Engine Views (unchanged)
**qry_wo_estimated_cost** — Rate card × estimated hours + BOM materials per WO.
**qry_scope_estimated_cost** — Rollup to scope level.
**qry_job_estimated_cost** — Rollup to job level.

### Other Views (unchanged)
qry_dash_upcoming_jobs, qry_wo_phase_ordered, qry_scope_context, qry_scope_breakdown, qry_manpower_demand, qry_procurement_needed, qry_jobitems_withcoverage, qry_supplier_summary, qry_material_reconciliation, qry_material_summary_by_job, qry_quoteline_margin, qry_job_quote_margin

---

## TRIGGERS (NEW — Session 8)

**trigger_set_updated_at** — Function that sets `updated_at = NOW()` before every UPDATE.
Applied to: tbl_quote_lines, tbl_scope_items, tbl_work_orders, tbl_wo_bom, tbl_production_plan, tbl_quotes.
Purpose: Foundation for optimistic concurrency (conflict detection on multi-user edits).

---

## AUTH & ROLES (Session 8)

| Role | Zones | Login | Access |
|------|-------|-------|--------|
| admin | 1,2,3,4 | Email+password | Full access + user management + audit log + freelancer edits |
| production_manager | 1,2,3,4 | Email+password | Full operational access. Cannot manage users or edit freelancer details |
| foreman | 2,3,4 | Email+password | Workshop execution. No commercial data |
| freelancer | 4 only | Phone+PIN | Task list, clock in/out, photos, flags |

**Staff accounts** created via Settings → Users tab or `/api/auth/manage-user` endpoint.
**Freelancer accounts** created via Crew page PIN sync (`/api/auth/freelancer-sync`).
**Admin bootstrap:** `UPDATE auth.users SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"admin"') WHERE email = '...'`

---

## FK DEPENDENCY MAP

```
tbl_production_plan (job_id)
├── tbl_quotes (job_id)
│   └── tbl_quote_lines (quote_id, job_id)
│       ├── tbl_quote_line_contractors (quote_line_id)
│       └── tbl_scope_items (quote_line_id) [nullable]
├── tbl_scope_items (job_id)
│   ├── tbl_job_items (scope_item_id)
│   │   └── tbl_jobitem_workorder (job_item_id)
│   ├── tbl_work_orders (scope_item_id)
│   │   ├── tbl_wo_time_entries (work_order_id)
│   │   ├── tbl_wo_bom (work_order_id)
│   │   ├── tbl_wo_documents (work_order_id)
│   │   ├── tbl_wo_activities (work_order_id)
│   │   └── tbl_jobitem_workorder (work_order_id)
│   └── tbl_job_attachments (scope_item_id) [nullable]
├── tbl_job_attachments (job_id)
├── tbl_invoices (job_id) → tbl_invoice_lines (invoice_id)
├── tbl_freelancer_schedule (job_id)
└── tbl_audit_log (job_id) [denormalised, no FK constraint]
```

## SQL SCRIPTS (run in order)

| Script | Session | Purpose |
|--------|---------|---------|
| `sql/security-hardening.sql` | 7 | RLS policies, helper functions, realtime config |
| `sql/add-quote-line-qty.sql` | 8 | quantity + unit_price columns on tbl_quote_lines |
| `sql/session8-multiuser.sql` | 8 | tbl_audit_log, updated_at triggers, audit RLS |
| `sql/session8-time-entry-archive.sql` | 8 | Archive columns, rebuilt cost views with archive filter |
| `sql/seed-grosvenor.sql` | 8 | Grosvenor Hotel Wedding — 89 lines, £377,340 |
