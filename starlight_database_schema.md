# STARLIGHT PRODUCTION SYSTEM — Complete Database Schema
## Snapshot: 20 March 2026

**Supabase Project:** qbdnoueqkmhznqzpkvos
**Tables:** 30 (21 migrated from Access + 9 web app additions)
**Views:** 27+
**RLS:** Enabled on all tables
**Test Data:** Chelsea In Bloom (job_id=6, job_number=13794) only

---

## LAYER 1 — JOB & COMMERCIAL

### tbl_production_plan
**Purpose:** Top-level job wrapper. One record per project. The root of the entire data hierarchy.
**Used by:** Every page that displays job info. Dashboard, Jobs list, Job detail, all child pages.
**Dependencies:** Parent to all other tables via job_id FK.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| job_id | SERIAL PK | No | Auto-increment primary key |
| job_number | VARCHAR | No | Universal reference matching accounts system (e.g. "13794") |
| external_project_ref | VARCHAR | Yes | Link to legacy PM database record |
| job_name | VARCHAR | Yes | Human-readable name (e.g. "Chelsea In Bloom") |
| client_name | VARCHAR | Yes | Client company name, pulled from accounts on import |
| event_date | DATE | Yes | Master scheduling constraint. All urgency derives from this |
| event_location | VARCHAR | Yes | Venue name and location |
| budget_allowance | DECIMAL | Yes | Workshop production budget (not total quote value) |
| pm_note | TEXT | Yes | PM-only notes (style, client personality). Never visible to workshop |
| post_event_delivery | TEXT(BOOL) | Yes | Suppresses auto-close when post-event delivery outstanding |
| created_by | INT FK→freelancers | Yes | Who created this job |
| created_at | TIMESTAMPTZ | Yes | Auto-set on creation |
| job_status | VARCHAR | Yes | Legacy field — status should be derived from WO states |

---

### tbl_quotes
**Purpose:** One record per quote document. A job can have multiple quotes (different zones, versions).
**Used by:** Job detail page quote tabs.
**Dependencies:** Parent of tbl_quote_lines. Child of tbl_production_plan.

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

---

### tbl_quote_lines
**Purpose:** Every line from every imported quote. Commercial record — not interpreted. Source for all scope creation.
**Used by:** Job detail page (main table), scope creation dialog, cost analysis, margin calculations.
**Dependencies:** Child of tbl_quotes. Referenced by tbl_scope_items.quote_line_id and tbl_quote_line_contractors.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| quote_line_id | SERIAL PK | No | Primary key |
| quote_id | INT FK→quotes | Yes | Which quote document |
| job_id | INT FK→production_plan | Yes | Denormalised for query convenience |
| line_number | VARCHAR | Yes | Original numbering from quote (VARCHAR to handle "1.1", "1.11") |
| import_sequence | INT | Yes | Stable sort order regardless of line_number format |
| line_text | TEXT | Yes | Full text exactly as in quote. Never truncated |
| line_value | DECIMAL | Yes | Commercial value of this line |
| event_zone | VARCHAR | Yes | Auto-populated from level 1 headings during import |
| line_sub_group | VARCHAR | Yes | Level 2 heading grouping (e.g. "Décor", "Lighting") |
| category | VARCHAR | Yes | Workshop Build / Stock Pick / Subcontracted / Install / Provisional |
| pm_note | TEXT | Yes | PM annotation on this specific line |
| interpretation_complete | TEXT(BOOL) | Yes | PM confirms all scope items extracted from this line |
| kit_list_exported | TEXT(BOOL) | Yes | Whether exported to Kit List system |
| imported_at | TIMESTAMPTZ | Yes | Auto-set on import |

---

### tbl_job_attachments
**Purpose:** Unstructured file storage. Photos, PDFs, drawings. Can be linked to scope or quote line later.
**Used by:** File management on scope pages, completion photos.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| attachment_id | SERIAL PK | No | Primary key |
| job_id | INT FK→production_plan | Yes | Which job |
| scope_item_id | INT FK→scope_items | Yes | Optional link to specific scope item |
| quote_line_id | INT FK→quote_lines | Yes | Optional link to specific quote line |
| file_path | VARCHAR | Yes | Server/OneDrive path |
| file_type | VARCHAR | Yes | Photo / PDF / Drawing / Note / Other |
| uploaded_by | INT FK→freelancers | Yes | Who uploaded |
| uploaded_at | TIMESTAMPTZ | Yes | When uploaded |
| caption | VARCHAR | Yes | One-line context |

---

## LAYER 2 — PRODUCTION STRUCTURE

### tbl_scope_items
**Purpose:** Buildable deliverables interpreted from quote lines. One scope item = one distinct object to build.
**Used by:** Scope breakdown page, WO page header, traveller, cost analysis. Core of the production hierarchy.
**Dependencies:** Parent of tbl_job_items, tbl_work_orders. Child of tbl_production_plan. References tbl_quote_lines, tbl_scope_item_categories.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| scope_item_id | SERIAL PK | No | Primary key |
| job_id | INT FK→production_plan | Yes | Which job |
| quote_line_id | INT FK→quote_lines | Yes | Source quote line (one line → many scopes) |
| modified_quote_line_id | INT FK→quote_lines | Yes | Quote line from newer version that triggered modification |
| item_name | VARCHAR | Yes | Workshop name. Full text, editable inline. No truncation |
| category_id | INT FK→scope_item_categories | Yes | Object type — drives prompt engine |
| description | TEXT | Yes | Full specification, dimensions, finish requirements |
| event_zone | VARCHAR | Yes | Where on site. Inherited from quote line, overridable |
| complexity_construction | VARCHAR | Yes | "1 - Straightforward" / "2 - Skilled" / "3 - Bespoke / Artistic" |
| finish_relative | VARCHAR | Yes | "Harder-than-construction-warrants" / "Neutral" / "Suits-the-form" |
| status | VARCHAR | Yes | Provisional / Active / Modified / Workshop Complete / Completed / Cancelled-Cost-Retained |
| is_general | TEXT(BOOL) | Yes | Auto-created General Scope Item. Exempt from closure checks |
| completion_photo_path | VARCHAR | Yes | Path to completion photo (mandatory before Completed) |
| photo_waiver | TEXT(BOOL) | Yes | PM confirms no photo possible |
| photo_waiver_reason | VARCHAR | Yes | Required when waiver is true |
| cancellation_reason | TEXT | Yes | Required for Cancelled-Cost-Retained status |
| created_by | INT FK→freelancers | Yes | PM who created |
| created_at | TIMESTAMPTZ | Yes | Auto |
| modified_at | TIMESTAMPTZ | Yes | Auto on any change |
| photo_path | VARCHAR | Yes | Alternative photo path field |

---

### tbl_scope_item_categories
**Purpose:** Object type lookup (Bar, Stage, DJ Booth, etc.). Drives prompt engine.
**Used by:** Scope breakdown category dropdown, prompt panel.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| category_id | SERIAL PK | No | Primary key |
| name | VARCHAR | Yes | Category name |
| description | VARCHAR | Yes | What this category covers |
| active | BOOLEAN | Yes | Appears in dropdowns when true |

---

### tbl_category_prompts
**Purpose:** Typical components per category. Suggested when PM creates a scope item of that type.
**Used by:** Prompt panel on scope breakdown page.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| prompt_id | SERIAL PK | No | Primary key |
| category_id | INT FK→scope_item_categories | Yes | Which category |
| description | VARCHAR | Yes | Suggested component (e.g. "Bar carcass sections") |
| typical_item_type | VARCHAR | Yes | Stock / Stock-Needs-Work / Bespoke |
| display_order | INT | Yes | Sequence in prompt list |
| notes | VARCHAR | Yes | Guidance on this component |

---

### tbl_job_items
**Purpose:** Physical items making up a scope item. Bridge between stock database and work orders.
**Used by:** Job items table on scope breakdown, junction table to WOs, kit list export.
**Dependencies:** Child of tbl_scope_items. Linked to tbl_work_orders via tbl_jobitem_workorder junction.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| item_id | SERIAL PK | No | Primary key |
| job_id | INT FK→production_plan | Yes | Which job |
| scope_item_id | INT FK→scope_items | Yes | Parent scope item |
| description | VARCHAR | Yes | Plain description. Auto-expands in textarea |
| item_type | VARCHAR | Yes | Stock / Stock-Needs-Work / Bespoke |
| stock_reference | VARCHAR | Yes | Reference in stock database (null for Bespoke) |
| quantity | DECIMAL | Yes | How many |
| unit | VARCHAR | Yes | Each / Sheet / Metre / Set etc. |
| finish_required | TEXT | Yes | What needs doing (e.g. "Cover in hessian") |
| kit_list_exported | TEXT(BOOL) | Yes | Exported to Kit List system |
| kit_list_exported_at | TIMESTAMPTZ | Yes | When exported |
| notes | TEXT | Yes | Additional context |
| created_by | INT FK→freelancers | Yes | Who added |
| created_at | TIMESTAMPTZ | Yes | Auto |
| temp_selected | TEXT(BOOL) | Yes | UI state for checkbox selection |

---

## LAYER 3 — EXECUTION

### tbl_work_orders
**Purpose:** The granular unit of work. Most important table. Defines tasks, captures completion, drives cost.
**Used by:** WO page, workshop view, traveller, mobile interface, cost analysis, capacity planning. Everything.
**Dependencies:** Child of tbl_scope_items. Parent of tbl_wo_time_entries, tbl_wo_bom, tbl_wo_documents, tbl_wo_activities. Self-join via reference_wo_id.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| work_order_id | SERIAL PK | No | Primary key |
| job_id | INT FK→production_plan | Yes | Which job |
| scope_item_id | INT FK→scope_items | Yes | Parent scope item |
| activity_verb | INT FK→master_lookups | Yes | Standardised action. Phase derived via join |
| description | TEXT | Yes | Plain language task description |
| estimated_duration_hrs | DECIMAL | Yes | Total person-hours estimate. Foundation for capacity + cost |
| reference_wo_id | INT FK→work_orders (self) | Yes | Historical WO used as estimating precedent |
| complexity_construction | VARCHAR | Yes | Nullable. "1 - Straightforward" etc. Inherits from scope when null |
| finish_relative | VARCHAR | Yes | Nullable. Only set when differs from scope item |
| planned_lead_id | INT FK→freelancers | Yes | Intention only — not used for cost |
| rate_override | DECIMAL | Yes | PM-entered rate replacing rate card for this WO |
| status | VARCHAR | Yes | Not-Started / Ready / In-Progress / Complete / On-Hold / Voided |
| on_hold_reason | VARCHAR | Yes | Required when On-Hold |
| void_reason | VARCHAR | Yes | Required when Voided |
| system_complete_timestamp | TIMESTAMPTZ | Yes | Immutable. When MARK COMPLETE tapped |
| actual_complete_timestamp | TIMESTAMPTZ | Yes | PM-overridable. Defaults to system timestamp |
| completion_photo_path | VARCHAR | Yes | Photo at task completion |
| wo_sequence | INT | Yes | Step ordering within scope. PM reorderable |
| traveller_printed_at | TIMESTAMPTZ | Yes | When traveller was printed (Session 5) |
| traveller_printed_by | INT | Yes | Who printed it (Session 5) |

---

### tbl_wo_time_entries
**Purpose:** One record per person per work session. Where all execution data lives. Cost calculated and frozen per entry.
**Used by:** Mobile START/JOIN/LOG flow, cost rollup, review page, estimate accuracy.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| entry_id | SERIAL PK | No | Primary key |
| work_order_id | INT FK→work_orders | Yes | Which work order |
| freelancer_id | INT FK→freelancers | Yes | Who worked. Captured on START/JOIN |
| system_start_timestamp | TIMESTAMPTZ | Yes | When they tapped START/JOIN. Immutable |
| actual_start_timestamp | TIMESTAMPTZ | Yes | PM-overridable |
| system_end_timestamp | TIMESTAMPTZ | Yes | When they tapped LOG MY HOURS. Immutable |
| actual_end_timestamp | TIMESTAMPTZ | Yes | PM-overridable |
| actual_hours | DECIMAL | Yes | Hours worked. Entered by freelancer, pre-filled from timestamps |
| applied_hourly_rate | DECIMAL | Yes | Rate frozen at logging. rate_override or day_rate/standard_day_hours |
| entry_cost | DECIMAL | Yes | actual_hours × applied_hourly_rate. Frozen |
| flag_note | TEXT | Yes | Freelancer observation. Two sentences max |
| timestamp_edited_flag | TEXT(BOOL) | Yes | Whether PM corrected any timestamp |

---

### tbl_wo_bom
**Purpose:** Materials per work order. Never at job or scope level. Drives cost tracking and procurement.
**Used by:** WO page BOM section, traveller BOM table, procurement dashboard, cost analysis, orders page.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| bom_id | SERIAL PK | No | Primary key |
| work_order_id | INT FK→work_orders | Yes | Which work order |
| job_id | INT FK→production_plan | Yes | Denormalised for queries |
| material_id | INT FK→materials | Yes | Links to catalogue. Null for one-off items |
| material_category | INT FK→master_lookups | Yes | Timber / Sheet / Metal / Fabric etc. |
| item_description | VARCHAR | Yes | What this material is. Auto-filled from catalogue |
| stock_reference | VARCHAR | Yes | Stock database reference |
| quantity | DECIMAL | Yes | Amount. For timber: stored in Metres for costing |
| unit | VARCHAR | Yes | Metre / Sheet / Length / Each etc. |
| unit_cost | DECIMAL | Yes | Planned cost per unit. Snapshot from catalogue |
| actual_unit_cost | DECIMAL | Yes | What was actually paid. From invoice matching |
| supplier | VARCHAR | Yes | Where from if not stock |
| needs_ordering | TEXT(BOOL) | Yes | Procurement flag |
| ordered_at | TIMESTAMPTZ | Yes | When order confirmed placed |
| ordered_by | INT FK→freelancers | Yes | Who placed order |
| notes | VARCHAR | Yes | Procurement/handling notes. Cut list parts detail stored here |

---

### tbl_jobitem_workorder
**Purpose:** Junction table. Many-to-many between job items and work orders. Coverage tracking.
**Used by:** WO creation dialog (checkbox selection), linked items display on WO page and traveller.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| junction_id | SERIAL PK | No | Primary key |
| job_item_id | INT FK→job_items | Yes | Which job item |
| work_order_id | INT FK→work_orders | Yes | Which work order |
| notes | VARCHAR | Yes | Context about this item's role in this WO |

---

### tbl_wo_activities
**Purpose:** Junction for multi-activity WOs. A single WO can have multiple activity verbs (e.g. CUT + COVER).
**Used by:** WO page activity label display, traveller step labels.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| id | SERIAL PK | No | Primary key |
| work_order_id | INT FK→work_orders | No | Which work order |
| activity_id | INT FK→master_lookups | No | Activity verb lookup |
| sequence | INT | Yes | Order of activities |

---

### tbl_wo_documents
**Purpose:** Files attached to work orders: drawings, references, cut lists, 3D models.
**Used by:** WO documents panel, cut list extractor, traveller image pages, mobile document view.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| doc_id | SERIAL PK | No | Primary key |
| work_order_id | INT FK→work_orders | No | Which work order |
| doc_type | VARCHAR | No | drawing / reference / cut_list / model |
| file_name | VARCHAR | Yes | Original filename |
| file_path | VARCHAR | Yes | OneDrive path |
| file_data | TEXT | Yes | Temporary base64 data for review |
| extraction_status | VARCHAR | Yes | pending / extracted / confirmed (cut lists only) |
| extracted_data | JSONB | Yes | AI extraction results (parts, summary) |
| created_at | TIMESTAMPTZ | Yes | Auto |

---

## LAYER 4 — MATERIALS MANAGEMENT

### tbl_materials
**Purpose:** Central materials catalogue. Provides consistent identification across all BOMs.
**Used by:** Materials page, BOM material search, invoice matching, cut list extraction, traveller stock pull.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| material_id | SERIAL PK | No | Primary key |
| material_name | VARCHAR | Yes | Standard name (e.g. "2x1 PAR"). Unique |
| material_category | INT FK→master_lookups | Yes | Timber / Sheet / Metal / Fabric etc. |
| unit | VARCHAR | Yes | Standard unit. From UNIT lookups |
| standard_length | DECIMAL | Yes | For timber — stock length in mm (e.g. 4800) |
| standard_sheet_size | VARCHAR | Yes | For sheets — "2440x1220" |
| current_unit_cost | DECIMAL | Yes | Latest price. Auto-updated from price history |
| primary_supplier | VARCHAR | Yes | Default supplier name |
| notes | TEXT | Yes | Handling/ordering notes |
| active | TEXT(BOOL) | Yes | Appears in dropdowns. Never delete — deactivate |
| spec_val_1 | DECIMAL | Yes | Width mm (timber/sheet) or other numeric spec |
| spec_val_2 | DECIMAL | Yes | Thickness mm (timber) or other numeric spec |
| spec_val_3 | DECIMAL | Yes | Additional numeric spec |
| spec_text_1 | VARCHAR | Yes | Text specification |
| spec_text_2 | VARCHAR | Yes | Text specification |
| paint_finish | VARCHAR | Yes | Finish type for paint category |

---

### tbl_material_prices
**Purpose:** Price history per material. One record per price change.
**Used by:** Materials page price history tab.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| price_id | SERIAL PK | No | Primary key |
| material_id | INT FK→materials | No | Which material |
| unit_cost | DECIMAL | No | Price per unit at this point in time |
| effective_date | DATE | No | When this price became valid |
| supplier | VARCHAR | Yes | Who quoted/charged this price |
| source | VARCHAR | Yes | Quote / Invoice / Estimate |
| notes | VARCHAR | Yes | Context (bulk discount, minimum order etc.) |
| recorded_by | INT FK→freelancers | Yes | Who entered |
| recorded_at | TIMESTAMPTZ | Yes | Auto |

---

### tbl_material_spec_defs
**Purpose:** Defines which spec fields (spec_val_1/2/3, spec_text_1/2) mean what per material category.
**Used by:** Not yet fully implemented — dynamic spec labels planned for future.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| id | SERIAL PK | No | Primary key |
| material_category_id | INT FK→master_lookups | No | Which material category |
| field_name | VARCHAR | No | spec_val_1 / spec_val_2 / spec_text_1 etc. |
| label | VARCHAR | No | Human-readable label (e.g. "Width mm") |
| display_order | INT | Yes | Order in form |

---

### tbl_material_aliases
**Purpose:** Maps invoice descriptions to catalogue materials. Auto-built from invoice processing.
**Used by:** Invoice extraction auto-matching.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| alias_id | SERIAL PK | No | Primary key |
| material_id | INT FK→materials | No | Which catalogue material |
| alias_name | VARCHAR | No | Invoice description that maps to this material |
| created_at | TIMESTAMPTZ | Yes | When alias was learned |

---

## LAYER 5 — INVOICES & SUPPLIERS

### tbl_invoices
**Purpose:** Processed invoice records. PDF/image uploaded, Claude AI extracts line items.
**Used by:** Invoices page, dashboard recent invoices panel.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| invoice_id | SERIAL PK | No | Primary key |
| invoice_number | VARCHAR | Yes | Supplier's invoice number |
| supplier_id | INT FK→suppliers | Yes | Which supplier |
| job_id | INT FK→production_plan | Yes | Default job assignment |
| invoice_date | DATE | Yes | Date on invoice |
| total_amount | DECIMAL | Yes | Invoice total |
| vat_included | BOOLEAN | Yes | Whether total includes VAT |
| status | VARCHAR | Yes | pending / confirmed |
| file_data | TEXT | Yes | Temporary base64 for review |
| notes | TEXT | Yes | Any context |
| created_at | TIMESTAMPTZ | Yes | Auto |

---

### tbl_invoice_lines
**Purpose:** Individual line items extracted from invoices. Matched to materials catalogue.
**Used by:** Invoice processing page, material reconciliation view.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| line_id | SERIAL PK | No | Primary key |
| invoice_id | INT FK→invoices | No | Which invoice |
| material_id | INT FK→materials | Yes | Matched catalogue material |
| description | VARCHAR | Yes | Description from invoice |
| quantity | DECIMAL | Yes | Amount |
| unit | VARCHAR | Yes | Unit from invoice |
| unit_price | DECIMAL | Yes | Price per unit |
| total_price | DECIMAL | Yes | Line total |
| job_id | INT FK→production_plan | Yes | Per-line job override |
| confidence | VARCHAR | Yes | high / medium / low — match quality |
| created_at | TIMESTAMPTZ | Yes | Auto |

---

### tbl_suppliers
**Purpose:** All external companies — material suppliers AND subcontractors (merged in Session 2).
**Used by:** Supplier page, invoice supplier dropdown, material supplier field, orders page, contractor picker.
**Note:** Column is `supplier_name` NOT `company_name`.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| supplier_id | SERIAL PK | No | Primary key |
| supplier_name | VARCHAR | Yes | Company name |
| contact_name | VARCHAR | Yes | Primary contact person |
| phone | VARCHAR | Yes | Phone number |
| email | VARCHAR | Yes | Email |
| address | TEXT | Yes | Postal address |
| payment_terms | VARCHAR | Yes | e.g. "30 days" |
| account_number | VARCHAR | Yes | Account/reference number |
| notes | TEXT | Yes | Any context |
| active | BOOLEAN | Yes | Appears in dropdowns |
| created_at | TIMESTAMPTZ | Yes | Auto |

---

### tbl_quote_line_contractors
**Purpose:** Links subcontractors/suppliers to specific quote lines for outsourced work.
**Used by:** Job detail page contractor picker per quote line.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| id | SERIAL PK | No | Primary key |
| quote_line_id | INT FK→quote_lines | Yes | Which quote line |
| contractor_id | INT FK→suppliers | Yes | Which supplier/contractor |
| contractor_quote_value | DECIMAL | Yes | Their quoted price |
| description | VARCHAR | Yes | What they're doing |
| notes | TEXT | Yes | Context |
| created_at | TIMESTAMPTZ | Yes | Auto |

---

## LAYER 6 — PEOPLE

### tbl_freelancers
**Purpose:** Every person in the system. Active users, not just records. Login via PIN on mobile.
**Used by:** Crew page, planned lead dropdown, time entries, mobile auth, capacity planning.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| freelancer_id | SERIAL PK | No | Primary key |
| freelancer_name | VARCHAR | Yes | Full name |
| phone | VARCHAR | Yes | Primary contact and login identifier |
| email | VARCHAR | Yes | Secondary contact |
| role | VARCHAR | Yes | Production-Manager / Foreman / Freelancer / PM-External |
| speciality | VARCHAR | Yes | Carpenter / Scenic-Artist / Fabricator etc. |
| day_rate | DECIMAL | Yes | Agreed day rate. The commercial agreement |
| standard_day_hours | DECIMAL | Yes | Hours constituting one day (8, 10 etc.) |
| active | TEXT(BOOL) | Yes | Currently available for assignment |
| system_access | TEXT(BOOL) | Yes | Has active login |
| notes | TEXT | Yes | Skills, working patterns |
| created_at | TIMESTAMPTZ | Yes | Auto |
| pin | VARCHAR | Yes | 4-6 digit PIN for mobile login |

---

### tbl_freelancer_schedule
**Purpose:** Booking calendar entries. Which freelancer is booked to which job on which dates.
**Used by:** Crew booking calendar, capacity planning, cross-job conflict detection.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| schedule_id | SERIAL PK | No | Primary key |
| freelancer_id | INT FK→freelancers | No | Who is booked |
| job_id | INT FK→production_plan | Yes | Which job |
| schedule_date | DATE | No | Which day |
| status | VARCHAR | Yes | booked / confirmed / declined |
| notes | VARCHAR | Yes | Context |
| created_at | TIMESTAMPTZ | Yes | Auto |

---

## LAYER 7 — LOOKUPS & SETTINGS

### tbl_master_lookups
**Purpose:** Single table feeding every dropdown. Activity verbs with phase numbers live here.
**Used by:** Every dropdown in the system. Activity verb selection, material categories, units, specialities.
**Critical:** Retired values deactivated never deleted — preserves historical data integrity.

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| lookup_id | SERIAL PK | No | Primary key |
| category | VARCHAR | Yes | ACTIVITY / MATERIAL_CATEGORY / UNIT / SPECIALITY / FILE_TYPE / SUBGROUP_CATEGORY_MAP |
| lookup_value | VARCHAR | Yes | The option text |
| display_order | INT | Yes | Sort order within category |
| phase_number | INT | Yes | ACTIVITY only. Build sequence position (1-5) |
| phase_label | VARCHAR | Yes | ACTIVITY only. "Phase 1 — Fabrication" etc. |
| active | TEXT(BOOL) | Yes | Whether appears in dropdowns |
| notes | VARCHAR | Yes | Internal guidance. For SUBGROUP_CATEGORY_MAP: stores default category |

**Key categories:**
- ACTIVITY: CUT, WELD, BUILD, ASSEMBLE, FIT, PREP, SAND, PRIME, PAINT, SPRAY, SCULPT, COVER, INSTALL, DELIVER
- MATERIAL_CATEGORY: Timber, Sheet, Metal, Fabric, Paint & Finish, Hardware, Electrical, Bought-In Component, Consumable
- UNIT: Each, Sheet, Metre, Length, Litre, kg, Roll, Pack, mm
- SPECIALITY: Carpenter, Scenic-Artist, Fabricator, Painter etc.

---

### tbl_rate_card
**Purpose:** Standard hourly rates by complexity level. Used for estimated cost calculations.
**Used by:** Settings page, qry_wo_estimated_cost view, cost analysis component.
**Added:** Session 5 (20 Mar 2026)

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| id | SERIAL PK | No | Primary key |
| complexity | INT UNIQUE | No | 1, 2, or 3 |
| label | VARCHAR(50) | No | "Straightforward" / "Skilled" / "Bespoke / Artistic" |
| rate_per_hour | DECIMAL(10,2) | No | Hourly rate (£35 / £40 / £50) |
| description | TEXT | Yes | What this complexity level covers |
| updated_at | TIMESTAMPTZ | Yes | Auto |

---

### tbl_business_settings
**Purpose:** Key-value store for business-level configuration.
**Used by:** Settings page, cost analysis (target margin), capacity planning (day hours).
**Added:** Session 5 (20 Mar 2026)

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| id | SERIAL PK | No | Primary key |
| setting_key | VARCHAR(100) UNIQUE | No | Key name |
| setting_value | TEXT | No | Value |
| description | TEXT | Yes | What this setting controls |
| updated_at | TIMESTAMPTZ | Yes | Auto |

**Current keys:**
- `default_target_margin_pct` = "40" — Default margin target for new jobs
- `standard_day_hours` = "10" — Working hours per day for capacity calcs

---

## LAYER 8 — DEPRECATED / REFERENCE

### tbl_contractors (DEPRECATED)
**Purpose:** Originally separate from suppliers. Merged into tbl_suppliers in Session 2.
**Status:** Table still exists but unused. tbl_suppliers is canonical.

### tbl_dummy_source_quote
**Purpose:** Simulates the external quote database for import testing.
**Used by:** Quote import flow (manual entry mode).

### tbl_dummy_stock_items
**Purpose:** Simulates the external stock database for stock search.
**Used by:** Job items stock reference search.

---

## VIEWS (27+)

### Dashboard Views

**qry_dash_upcoming_jobs** — Job cards for dashboard. Includes scope progress counts and WO status breakdown.
- Reads: tbl_production_plan, tbl_quotes, tbl_scope_items, tbl_work_orders
- Used by: Dashboard page, jobs list

**qry_today_roster** — Who's on site today and what they're doing.
- Reads: tbl_freelancer_schedule, tbl_freelancers, tbl_production_plan
- Used by: Dashboard active workers banner

### Scope & WO Views

**qry_scope_context** — Scope item with parent job context (job name, number, event date).
- Reads: tbl_scope_items, tbl_production_plan
- Used by: WO page header, traveller header

**qry_scope_breakdown** — Scope items with quote line and job context.
- Reads: tbl_scope_items, tbl_quote_lines, tbl_production_plan
- Used by: Scope breakdown page

**qry_wo_phase_ordered** — Work orders sorted by build phase via activity verb lookup.
- Reads: tbl_work_orders, tbl_master_lookups (join on activity_verb)
- Used by: WO page, workshop view, traveller

**qry_jobitems_withcoverage** — Job items with WO linkage indicator (has_wo boolean).
- Reads: tbl_job_items, tbl_jobitem_workorder
- Used by: Scope breakdown job items table (green checkmark)

### Cost Views

**qry_job_cost_summary** — Full job cost rollup: labour + materials + margin.
- Reads: tbl_production_plan, tbl_quotes, tbl_work_orders, tbl_wo_time_entries, tbl_wo_bom
- Used by: Review page cost visibility

**qry_scopeitem_cost_summary** — Scope item level cost breakdown.
- Reads: tbl_scope_items, tbl_work_orders, tbl_wo_time_entries, tbl_wo_bom
- Used by: Review page scope drill-down

**qry_wo_cost_summary** — Individual WO cost: labour + material.
- Reads: tbl_work_orders, tbl_wo_time_entries, tbl_wo_bom
- Used by: WO detail, cost review

**qry_estimate_vs_actual** — Estimated vs actual hours per completed WO.
- Reads: tbl_work_orders, tbl_wo_time_entries
- Used by: Review page accuracy tab

### Analytics Engine Views (Session 5)

**qry_wo_estimated_cost** — Rate card × estimated hours + BOM materials per WO.
- Reads: tbl_work_orders, tbl_scope_items, tbl_rate_card, tbl_wo_bom
- Uses: `LEFT(complexity_construction, 1)::INT` to extract complexity number
- Used by: Cost analysis component on all pages

**qry_scope_estimated_cost** — Rollup of qry_wo_estimated_cost to scope level.
- Reads: qry_wo_estimated_cost
- Used by: Cost analysis on scope page

**qry_job_estimated_cost** — Rollup of qry_wo_estimated_cost to job level.
- Reads: qry_wo_estimated_cost
- Used by: Cost analysis on job page

### Margin & Reconciliation Views

**qry_quoteline_margin** — Quoted vs actual cost per quote line with margin %.
- Reads: tbl_quote_lines, tbl_scope_items, tbl_work_orders, tbl_wo_time_entries, tbl_wo_bom
- Used by: Cost analysis per-line breakdown

**qry_job_quote_margin** — Job-level margin summary.
- Reads: qry_quoteline_margin
- Used by: Cost analysis header

**qry_material_reconciliation** — BOM planned vs invoice actual per material.
- Reads: tbl_wo_bom, tbl_invoice_lines, tbl_materials
- Used by: Review page material reconciliation tab

**qry_material_summary_by_job** — Material spend aggregated by job.
- Reads: tbl_wo_bom, tbl_work_orders
- Used by: Review page

### Procurement & Capacity Views

**qry_procurement_needed** — BOM items where needs_ordering=true AND ordered_at IS NULL.
- Reads: tbl_wo_bom, tbl_work_orders, tbl_materials
- Used by: Dashboard procurement panel, orders page

**qry_manpower_demand** — Hours by department (phase) and status.
- Reads: tbl_work_orders, tbl_master_lookups
- Used by: Capacity page, dashboard

### Supplier View

**qry_supplier_summary** — Per-supplier aggregated stats: invoice count, total spend, material count.
- Reads: tbl_suppliers, tbl_invoices, tbl_invoice_lines, tbl_materials
- Used by: Suppliers page expandable rows

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
├── tbl_job_items (job_id)
├── tbl_invoices (job_id)
│   └── tbl_invoice_lines (invoice_id)
└── tbl_freelancer_schedule (job_id)

tbl_freelancers (freelancer_id)
├── tbl_wo_time_entries (freelancer_id)
├── tbl_work_orders (planned_lead_id)
├── tbl_freelancer_schedule (freelancer_id)
└── Various created_by fields

tbl_materials (material_id)
├── tbl_wo_bom (material_id) [nullable]
├── tbl_material_prices (material_id)
├── tbl_material_aliases (material_id)
└── tbl_invoice_lines (material_id) [nullable]

tbl_master_lookups (lookup_id)
├── tbl_work_orders.activity_verb
├── tbl_wo_bom.material_category
├── tbl_wo_activities.activity_id
├── tbl_materials.material_category
└── tbl_scope_items.category_id (via tbl_scope_item_categories)

tbl_suppliers (supplier_id)
├── tbl_invoices (supplier_id)
├── tbl_quote_line_contractors (contractor_id)
└── tbl_materials.primary_supplier [text, not FK]

tbl_rate_card (complexity)
└── qry_wo_estimated_cost (joined via LEFT(complexity,1)::INT)
```

---

## SAFE DELETION ORDER

When deleting a job and all its children, execute in this exact order:

```sql
1. tbl_wo_time_entries (via work_order_id subquery)
2. tbl_wo_bom (via work_order_id subquery)
3. tbl_wo_documents (via work_order_id subquery)
4. tbl_wo_activities (via work_order_id subquery)
5. tbl_jobitem_workorder (via work_order_id AND job_item_id subqueries)
6. tbl_work_orders (by job_id)
7. tbl_job_items (by scope_item_id subquery, THEN by job_id)
8. tbl_job_attachments (by scope_item_id subquery, THEN by job_id)
9. tbl_invoice_lines (via invoice_id subquery)
10. tbl_invoices (by job_id)
11. tbl_quote_line_contractors (via quote_line_id subquery)
12. tbl_scope_items (by job_id)
13. tbl_quote_lines (by job_id)
14. tbl_quotes (by job_id)
15. tbl_freelancer_schedule (by job_id)
16. tbl_production_plan (by job_id)
```

**Critical:** Some tbl_job_items rows have scope_item_id set but job_id NULL. Always delete by scope_item_id subquery FIRST, then by job_id as cleanup.

---

## BOOLEAN FIELD NOTE

Fields marked `TEXT(BOOL)` store booleans as strings due to ODBC legacy. Values may be:
- `true` / `"true"` / `"True"` / `-1` = truthy
- `false` / `"false"` / `null` = falsy

Always use `isTruthy()` helper in TypeScript. In SQL views, use `= 'true'` or `IS TRUE`.

---

## CURRENT DATA STATE

As of 20 March 2026, only Chelsea In Bloom exists:
- **Job:** job_id=6, job_number=13794, client=Bello Flowers Ltd, event=19 May 2026
- **Quote lines:** 3 (Workshop £900, Stock Pick £150, Install £700)
- **Scope items:** 1 active (Rocket frame + plywood formers)
- **Work orders:** 2 (BUILD complexity 1 @ 2h, BUILD complexity 2 @ 10h)
- **BOM:** 2 rows on WO1 (2x1 PAR 4.8m Metre, 18mm Ply 1 Sheet)
- **Documents:** 2 drawings, 1 reference, 1 cut list (confirmed), 1 3D model on WO1
- **All other test data deleted**

---

*Starlight Production System — Database Schema Snapshot v1.0*
*Generated: 20 March 2026*
