# Starlight Web App — Development Tracker

## 🧹 Cleanup Backlog

Running list of known debt, deferred work, and small follow-ups. Reviewed at the start of every session. Items are added whenever a session ships something with a known deferral or a correctness bug that we chose not to fix in-flight. Order roughly reflects priority — top items are the ones to do next. Check items off as they ship; move completed ones to the relevant session entry.

### Correctness (do first)
- [ ] **Admin scope page BOM cost — Length-on-Metre + WO-attached join** *(S28d)* — `/jobs/[id]/scope/[scopeId]/page.tsx` (68 KB). Same two bugs the PM RPC just fixed. Admin computes BOM totals directly off `tbl_wo_bom` without (a) the dual-path scope-or-WO join — any BOM row attached via `work_order_id` with null `scope_item_id` is silently dropped (polyline on Grosvenor is the known case); (b) the unit→base multiplier for Length-on-Metre — timber like 3x2 Rounded Edge shows £6.60 instead of £31.68. Ops are currently looking at wrong cost numbers on the admin view.

### Small/mechanical (easy wins)
- [ ] **Delete dead file** `src/components/job-items-table.tsx` *(S27)* — not imported anywhere since scope page was unified; kept around as a safety net during the redesign. Safe to delete.
- [ ] **Next.js 16 middleware rename** *(S28)* — `middleware.ts` → `proxy.ts`. Emits a deprecation warning on every build. Straight file rename; update `src/middleware.ts` export convention if needed.

### Features deferred
- [ ] **CAD file upload** on admin WO docs panel *(S28)* — `doc_type = 'cad_model'` already exists in the DB and renders correctly on PM view. Still need: add `.skp .dwg .3dm .step .iges .stp .igs` to accepted extensions, route to OneDrive subfolder `Workshop/{jobNumber}/cad/`, set doc_type on upload. Low risk, pure additive on the upload form.
- [ ] **Admin dashboard PM-note flag widget** *(S28b)* — show recent `pm_note` learnings on `/` so new notes surface without drilling into a job. Query: `tbl_learnings WHERE category='pm_note'` joined to `tbl_quote_lines` + `tbl_production_plan` for active jobs, newest first, limit ~10. Render as a card on the admin home, click-through to `/pm/jobs/{id}` (or `/jobs/{id}` in admin view).
- [ ] **Image thumbnail proxy** *(S28b)* — PM view doc cards currently show type-icon placeholders because OneDrive direct paths can't be used as `<img src>`. Needs a signed-URL or thumbnail endpoint (Graph API `driveItem/thumbnails` or a Vercel proxy route) so `.png/.jpg/.jpeg/.webp` docs show actual previews in the DocumentGallery.

### Testing gaps
- [ ] **Multi-scope rendering on PM view** *(S28)* — code path is implemented but no quote line in production has 2+ scopes yet. First time a line is split, validate the scope-tier rendering (blue left border, per-scope WO groups, scope notes thread).

### Stock/catalogue polish
- [ ] **Stock build-state badge for promoted stock** *(S27)* — when a PM picks a promoted stock item, show whether it's physically available ("Built and available") vs still in build ("In build: 2/5 WOs complete"). View over `tbl_stock_items` joined to its `source_job_item_id` → scope → WOs. Low urgency while you're the only PM promoting, but important before handing stock picking to other PMs.

---

## Project Overview

**What:** Web application replacing MS Access front-end for Starlight Design's production management system.
**Backend:** Supabase (PostgreSQL) — 42 tables, 38 views, 6 RPC functions, 115+ indexes.
**Frontend:** Next.js 16.1.7 / React / Tailwind CSS / shadcn/ui patterns.
**Hosting:** Vercel (hobby tier) — workshop-five-gamma.vercel.app
**Auth:** Supabase Auth (email+password for PM/foreman, phone+PIN for freelancers). Three-layer security: middleware session validation + API route auth + RLS on all tables. See Security conventions below.
**Git:** github.com/mateuszgarwacki-arch/starlight-web
**Deploy:** `vercel --prod` from CLI (use cmd shell, not powershell)
**Test Job:** Chelsea In Bloom (job_id=6, job_number=13794) — all other test data deleted.

## Build Status

### Phase 0: Foundation ✅
### Phase 1: Dashboard ✅
### Phase 2: Jobs & Quote Lines ✅
### Category Redesign ✅
### Phase 3: Scope Breakdown ✅
### Phase 4: Work Orders & BOM ✅
### Phase 5: Freelancer Mobile ✅
### Phase 5.5: Workshop & Scheduling ✅
### Phase 6: Cost Visibility & Review ✅
### Phase 7: Capacity & Materials ✅
### Invoice Processing System ✅
### Suppliers System ✅
### Dashboard Polish ✅

### Phase 8: Polish & Handover — MOSTLY COMPLETE

#### Traveller PDF ✅ (Session 5)
- [x] Full traveller page at `/traveller?scopeId=X&mode=single&woId=Y`
- [x] Page layout: double border frame, header (job no, job name, step X of Y, scope item name), footer (print date, page X of Y, WO-id)
- [x] TaskBrief section: full description, BOM with stock pull column, linked items, sibling WOs with descriptions, sign-off slots
- [x] Image pages: auto-detect landscape, rotate button, pdf.js canvas rendering for cut lists
- [x] Real QR codes via qrcode.react — scans to `/m/wo/{id}` for instant mobile access
- [x] Print & Release button: writes `traveller_printed_at`, sets Not-Started → Ready
- [x] Print CSS fixed for Next.js 16 (no `#__next` wrapper — `body > *` rule was hiding everything)
- [x] Blank last page eliminated (removed inline `pageBreakAfter: "always"`, CSS `:last-child` rule handles it)
- [x] Step numbering: "Step 1 of 2" format, counts ALL WOs on scope not just filtered
- [x] Sibling WOs show description + status (not hours estimate)
- [x] Days remaining removed from traveller (stale after printing)
- [x] Order column removed from traveller BOM (procurement is PM concern, not workshop)
- [x] Header strip: two-line layout, scope name wraps fully

#### BOM Costing Engine ✅ (Session 5)
- [x] Cut list bin-packing: FFD algorithm for timber, groups by material
- [x] Category derived from parts data (AI summary often missing `material_category`)
- [x] BOM stores whole standard lengths in Metres for correct financial costing (e.g. 4.8m × £0.79 = £3.79)
- [x] Traveller converts to workshop units: "1 Length · 4800mm each"
- [x] Description format: "2x1 PAR - 1.9m Total (1 length)"
- [x] "Re-add to BOM" button deletes old rows before resetting extraction status
- [x] Inline recalculation in addToBom handler (bypasses state timing issues)
- [x] Anomaly detection: flags timber parts with cross-section width > 100mm

#### Materials & Invoices Dropdowns ✅ (Session 5)
- [x] Materials page: Unit field is dropdown from `tbl_master_lookups` UNIT category + "Other..."
- [x] Materials page: Primary Supplier is dropdown from `tbl_suppliers` + inline "Add new supplier"
- [x] Materials page: Sheet dimensions (Length mm, Width mm, Thickness mm) compose `standard_sheet_size`
- [x] Materials page: Timber dimensions (Stock Length mm, Width mm, Thickness mm) → `standard_length`, `spec_val_1/2`
- [x] Materials page: Category change is reactive — dimension fields appear immediately
- [x] Invoices page: Line item unit dropdown from `tbl_master_lookups` UNIT
- [x] Invoices page: Create New Material dialog unit dropdown
- [x] Invoices page: "+ Create New Material" moved to top of dropdown

#### Text & Display Fixes ✅ (Session 5)
- [x] All text truncation removed: quote lines show full text (was substring 150)
- [x] Scope item name created from full quote line (was substring 80)
- [x] Scope map display shows full text (was substring 60)
- [x] Scope title in WO tabs shows full text (was substring 100)
- [x] Editable scope name: textarea with auto-height, saves on blur
- [x] Job items textarea auto-expands on mount (ref callback sets scrollHeight)
- [x] Job items table rows: `align-top` (not centered vertically)
- [x] BOM table columns widened: Qty w-20, Unit w-20, Unit£ w-24, Total w-24, Order w-16

#### Settings Page ✅ (Session 5)
- [x] `/settings` page with Settings icon in sidebar
- [x] Rate card: 3 complexity levels with editable hourly rates (£35/£40/£50)
- [x] Rate card descriptions editable inline
- [x] Business defaults: default target margin % (40%), standard day hours (10)
- [x] Instant save with green flash confirmation
- [x] Tables: `tbl_rate_card`, `tbl_business_settings`

#### Analytics Engine ✅ (Session 5)
- [x] Unified `<CostBreakdown>` component replaces separate QuoteMarginPanel
- [x] Five-layer cost model: Quoted → Estimated → Committed → Reconciled → Margin Analysis
- [x] Estimated costs from rate card: `est_hours × complexity_rate` + BOM materials
- [x] Workshop vs total quoted differentiation: margins calculated against workshop portion only
- [x] Job page: header shows "Workshop £900 (of £1,750)", layers grid, insight cards, per-line breakdown
- [x] Scope breakdown page: same cost panel with scope-level data
- [x] WO page: scope-level cost visibility while managing work orders
- [x] Insight cards: target margin, estimate accuracy, live/planned margin with traffic lights
- [x] Per-quote-line table: shows estimated (blue with "est" label) or actual costs with margin %
- [x] SQL views: `qry_wo_estimated_cost`, `qry_scope_estimated_cost`, `qry_job_estimated_cost`
- [x] Complexity extraction: `LEFT(complexity_construction, 1)` handles "1 - Straightforward" format

#### Remaining Phase 8
- [x] Toast notifications — Sonner installed, wired across all mobile + desktop actions (Session 6b)
- [x] WO status refresh after Print & Release — visibilitychange listener auto-refreshes on tab return (Session 7)
- [x] Real-time Supabase subscriptions — Workshop, Capacity, Booking Calendar, Notifications page, Sidebar badge (Session 7)
- [x] Security hardening — middleware auth, API auth, RLS overhaul, signed calendar tokens, PIN removal (Session 7)
- [ ] Quote import from real source (currently manual entry)

### Session 9: Presence + Concurrency + Audit Inserts ✅

#### Real-time Presence ✅ (Session 9)
- [x] `usePresence` hook — Supabase Realtime Presence API, channels scoped to `presence:{type}:{id}`
- [x] `<PresenceAvatars>` component — coloured initials circles with hover tooltip (name, editing field, time on page)
- [x] `<FieldPresenceIndicator>` component — coloured ring around fields being edited by others (Excel Online pattern)
- [x] Wired into: Job detail page, Scope breakdown page, WO page
- [x] Deterministic avatar colours from user ID hash (8-colour palette)
- [x] Self-filtering — you never see your own avatar in the presence row

#### Optimistic Concurrency ✅ (Session 9)
- [x] `auditedUpdate()` accepts optional `expectedUpdatedAt` — compares against DB before writing
- [x] Returns `AuditUpdateResult` with `{ conflict: boolean, currentRecord }` — fully backward-compatible
- [x] `<ConflictDialog>` component — shows both values side-by-side with "Keep theirs" / "Use mine" / "Cancel"
- [x] Job detail: quote line inline edits show full conflict dialog; job header edits auto-reload on conflict
- [x] WO page: all 6 update handlers converted from raw Supabase to `auditedUpdate` with concurrency guards
- [x] WO page: `updateBomField` also gets concurrency guard
- [x] Conflict on WO page triggers toast + auto-reload (simpler UX than dialog for non-field-level edits)

#### Audit on Remaining Inserts ✅ (Session 9)
- [x] WO creation (`create-wo-dialog.tsx`) → `auditedInsert`
- [x] Scope creation (`create-scope-dialog.tsx`) → `auditedInsert`
- [x] BOM rows: `selectMaterial` + `addCustomBomRow` → `auditedInsert`
- [x] Quote lines: `handleAddLine` → `auditedInsert`
- [x] Time entries: mobile START + JOIN → `auditedInsert`

#### Raw Supabase Updates Eliminated (Session 9)
- [x] WO page `voidWO` → `auditedUpdate` with concurrency guard
- [x] WO page `updatePlannedLead` → `auditedUpdate` with concurrency guard
- [x] WO page `updateEstimatedHrs` → `auditedUpdate` with concurrency guard
- [x] WO page `updateWODescription` → `auditedUpdate` with concurrency guard

### Future / Tier 3
- [ ] Job templating — clone scope/WO/BOM from previous builds
- [ ] Precedent search UI — search completed WOs by verb, complexity, material
- [ ] Cut list 2D sheet nesting algorithm
- [ ] Cross-job analytics dashboard (margin trends over time)
- [ ] Freelancer performance view (actual vs estimated per person per task type)
- [ ] Dynamic spec field labels from `tbl_material_spec_defs`

## Database Tables (30)

## Database Schema (verified 26 Mar 2026)

### Tables (33 active)

| Table | Key Columns |
|-------|-------------|
| `tbl_production_plan` | job_id, job_number, job_name, client_name, event_date, event_location, budget_allowance, job_status, pm_note |
| `tbl_quotes` | quote_id, job_id, quote_reference, quote_version, quote_value, status |
| `tbl_quote_lines` | quote_line_id, quote_id, job_id, line_number, line_text, line_value, category, event_zone, pm_est_cost, pm_est_labour_days, pm_est_material_cost, interpretation_complete |
| `tbl_quote_line_contractors` | id, quote_line_id, contractor_id, contractor_quote_value, supplier_id |
| `tbl_scope_items` | scope_item_id, job_id, quote_line_id, item_name, category_id, description, event_zone, complexity_construction, finish_relative, status |
| `tbl_scope_item_categories` | category_id, category_name, description, active |
| `tbl_scope_options` | option_id, scope_item_id, option_label, description, pros, cons, est_labour_days, est_material_cost, est_total_cost, status |
| `tbl_work_orders` | work_order_id, job_id, scope_item_id, activity_verb, description, estimated_duration_hrs, complexity_construction, finish_relative, planned_lead_id, status, wo_sequence, traveller_printed_at |
| `tbl_wo_activities` | id, work_order_id, activity_id, sequence, notes |
| `tbl_wo_bom` | bom_id, work_order_id, scope_item_id, job_id, material_id, stock_item_id, item_description, quantity, unit, unit_cost, needs_ordering, stock_reference |
| `tbl_wo_time_entries` | entry_id, work_order_id, freelancer_id, actual_hours, applied_hourly_rate, entry_cost, archived_at |
| `tbl_wo_documents` | doc_id, work_order_id, scope_item_id, job_id, doc_type, file_name, onedrive_path, onedrive_item_id, extraction_status, extracted_data |
| `tbl_job_items` | item_id, job_id, scope_item_id, description, item_type, stock_reference, stock_item_id, item_source, quantity, finish_required, notes |
| `tbl_jobitem_workorder` | junction_id, job_item_id, work_order_id |
| `tbl_job_attachments` | attachment_id, job_id, scope_item_id, file_path, file_type, file_name, file_category |
| `tbl_stock_items` | stock_id, product_code, description, stock_quantity, location, weight_kg, hire_cost_day, hire_cost_week, thumbnail_url, active, category |
| `tbl_freelancers` | freelancer_id, freelancer_name, phone, email, role, speciality, day_rate, standard_day_hours, active |
| `tbl_freelancer_schedule` | schedule_id, freelancer_id, scheduled_date, status, job_id, booking_group, notified_at |
| `tbl_materials` | material_id, material_name, material_category, unit, standard_length, standard_sheet_size, current_unit_cost, primary_supplier, spec_val_1/2/3, spec_text_1/2, paint_finish, active |
| `tbl_material_prices` | price_id, material_id, unit_cost, effective_date, supplier, source |
| `tbl_material_aliases` | alias_id, material_id, alias_text, supplier |
| `tbl_material_spec_defs` | spec_def_id, category_name, slot, label, unit |
| `tbl_master_lookups` | lookup_id, category, lookup_value, display_order, phase_number, phase_label, active |
| `tbl_category_prompts` | prompt_id, category_id, description, typical_item_type, display_order |
| `tbl_suppliers` | supplier_id, supplier_name, phone, email, contact_name, speciality, payment_terms, active |
| `tbl_invoices` | invoice_id, supplier, invoice_number, invoice_date, total_value, job_id, status, supplier_id |
| `tbl_invoice_lines` | line_id, invoice_id, line_number, raw_description, quantity, unit, unit_cost, line_total, material_id, match_status, job_id |
| `tbl_notifications` | notification_id, type, title, detail, severity, source_freelancer_id, source_job_id, source_wo_id, read_at, dismissed_at, action_url |
| `tbl_tasks` | task_id, freelancer_id, title, description, category, job_id, hours, worked_date, status, routed_to_wo_id |
| `tbl_workshop_requests` | request_id, freelancer_id, category, title, description, urgency, job_id, work_order_id, status |
| `tbl_rate_card` | id, complexity, label, rate_per_hour, description |
| `tbl_business_settings` | id, setting_key, setting_value, description |
| `tbl_audit_log` | audit_id, user_id, user_name, user_role, table_name, record_id, field_name, old_value, new_value, changed_at, job_id, action_type, reverted_at |

### Views (34)
qry_dash_quote_stats, qry_dash_upcoming_jobs, qry_dash_wo_stats, qry_estimate_vs_actual, qry_freelancer_hours_summary, qry_job_accepted_quote, qry_job_cost_summary, qry_job_estimated_cost, qry_job_execution_list, qry_job_quote_margin, qry_jobitems_withcoverage, qry_manpower_demand, qry_material_reconciliation, qry_material_summary_by_job, qry_materials_list, qry_procurement_needed, qry_quote_lines_with_contractors, qry_quote_scopes, qry_quoteline_margin, qry_recent_orders, qry_review_inbox, qry_scope_breakdown, qry_scope_context, qry_scope_estimated_cost, qry_scope_wo_stats, qry_scopeitem_cost_summary, qry_stale_travellers, qry_supplier_summary, qry_wo_cost_labour, qry_wo_cost_material, qry_wo_cost_summary, qry_wo_estimated_cost, qry_wo_phase_ordered, qry_wo_with_activities

### RPC Functions (6)
rpc_dashboard_data, rpc_workshop_data, rpc_review_data, rpc_capacity_data(date,date), rpc_job_detail_data(job_id), rpc_report_job_financial(job_id)

### Utility Functions (7)
audit_retention_cycle, get_my_freelancer_id, get_my_role, rls_auto_enable, trigger_set_updated_at, user_freelancer_id, user_role

### Indexes (115)
Full index coverage across all tables. Key indexes: partial indexes on archived_at (time entries), status fields (WOs, requests, tasks), FTS on materials + stock items, composite indexes on schedule (freelancer+date), audit log (table+record, changed_at).

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | TypeScript interfaces for all tables and views |
| `src/lib/utils.ts` | Helpers: cn(), formatCurrency(), formatDate(), statusClass(), isTruthy() |
| `src/lib/supabase-browser.ts` | Browser-side Supabase client |
| `src/lib/supabase-admin.ts` | Server-side Supabase client (service role) |
| `src/lib/microsoft-graph.ts` | Microsoft Graph client: auth, upload, download, sharing |
| `src/lib/onedrive-client.ts` | Browser-side OneDrive upload/download helper |
| `src/components/sidebar.tsx` | Main navigation (15 items incl. Stock, Reports, Settings) |
| `src/components/ui/badges.tsx` | StatusBadge, DaysRemainingBadge, PhasePill |
| `src/components/ui/lookup-combo.tsx` | Reusable dropdown bound to tbl_master_lookups |
| `src/components/cost-breakdown.tsx` | Unified 5-layer cost analysis (replaces quote-margin-panel) |
| `src/components/create-scope-dialog.tsx` | Modal for scope creation (full quote line text) |
| `src/components/contractor-picker.tsx` | Inline supplier assignment (reads tbl_suppliers) |
| `src/components/prompt-panel.tsx` | Category-driven component suggestions |
| `src/components/job-items-table.tsx` | Job items: stock picker + bespoke dialogs, promote to stock |
| `src/components/create-wo-dialog.tsx` | Multi-activity WO creation dialog |
| `src/components/booking-calendar.tsx` | Week grid booking calendar |
| `src/components/wo-documents-panel.tsx` | WO file management: drawings, references, cut lists, models |
| `src/components/cutlist-extractor.tsx` | AI cut list extraction + bin-packing + BOM import |
| `src/components/model-viewer.tsx` | Three.js GLB/GLTF inline 3D viewer |
| `src/components/mobile-wo-docs.tsx` | Mobile document viewer for freelancers |
| `src/components/traveller/traveller-preview.tsx` | PrintTravellerButton component |
| `src/app/traveller/page.tsx` | Full traveller PDF page (~800 lines) |
| `src/app/traveller/layout.tsx` | Loads pdf.js 3.11.174 via Script tag |
| `src/app/(dashboard)/page.tsx` | Main dashboard with stats, procurement, flags, workers |
| `src/app/(dashboard)/jobs/page.tsx` | Jobs list |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | Job detail with quote lines, cost analysis |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | Scope breakdown with editable name |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/wo/page.tsx` | Work orders with BOM |
| `src/app/(dashboard)/settings/page.tsx` | Rate card + business defaults |
| `src/app/(dashboard)/workshop/page.tsx` | Workshop view - all WOs grouped by scope |
| `src/app/(dashboard)/review/page.tsx` | Cost visibility, time entries, flags, accuracy |
| `src/app/(dashboard)/crew/page.tsx` | Crew management: people, rates, PINs (calendar moved to Capacity) |
| `src/app/(dashboard)/notifications/page.tsx` | Notifications: severity-coded cards, filter tabs, mark read/dismiss |
| `src/app/(dashboard)/materials/page.tsx` | Materials catalogue, category filters, price history |
| `src/app/(dashboard)/capacity/page.tsx` | Capacity planning: demand vs supply, booking calendar, conflicts |
| `src/app/(dashboard)/capacity/add-booking/page.tsx` | Add booking: month-view day picker, WhatsApp notify |
| `src/app/(dashboard)/invoices/page.tsx` | Invoice upload, AI extraction, material matching |
| `src/app/(dashboard)/suppliers/page.tsx` | Suppliers CRUD, order history, materials tabs |
| `src/app/(dashboard)/orders/page.tsx` | Orders page with material grouping |
| `src/app/api/extract-invoice/route.ts` | API: Claude-powered invoice extraction |
| `src/app/api/extract-cutlist/route.ts` | API: Claude-powered cut list extraction |
| `src/app/api/onedrive/upload/route.ts` | API: upload files to OneDrive via Graph API |
| `src/app/api/onedrive/download/route.ts` | API: get download URLs from OneDrive |
| `src/lib/notifications.ts` | Shared notify() helper — single function for all notification types |
| `src/app/api/calendar/[freelancerId]/route.ts` | API: ICS calendar download (signed token auth, no PINs) |
| `src/app/api/calendar/token/route.ts` | API: Generate signed HMAC tokens for ICS downloads |
| `src/lib/auth-headers.ts` | Helper: get Supabase session auth headers for internal API calls |
| `src/lib/calendar-token.ts` | HMAC-SHA256 token generation/validation for calendar downloads |
| `src/lib/use-realtime.ts` | Hook: useRealtimeRefresh — subscribe to table changes with debounce |
| `src/middleware.ts` | Auth middleware: session validation, role-based routing, login redirects |
| `src/lib/audit.ts` | Audit engine: auditedUpdate/Insert/Delete, revertAuditEntry, getAuditContext |
| `src/lib/use-presence.ts` | Hook: usePresence — Supabase Realtime Presence for who's viewing what |
| `src/components/presence-avatars.tsx` | PresenceAvatars (coloured initials) + FieldPresenceIndicator (edit ring) |
| `src/components/conflict-dialog.tsx` | Optimistic concurrency conflict resolution dialog |
| `src/app/api/auth/manage-user/route.ts` | API: create/update/reset/list staff accounts (admin/PM only) |
| `src/app/(dashboard)/crew/[id]/page.tsx` | Freelancer detail: profile, stats, activity timeline, bookings, admin edit/archive |
| `sql/session8-multiuser.sql` | Audit log table, updated_at triggers, RLS on audit log |
| `sql/session8-time-entry-archive.sql` | Archive columns on time entries, cost views rebuilt with archive filter |
| `sql/seed-grosvenor.sql` | Grosvenor Hotel Wedding — 89 quote lines, £377,340 |
| `sql/security-hardening.sql` | RLS policies, helper functions, realtime config — run in Supabase SQL Editor |
| `src/app/m/layout.tsx` | Mobile layout with bottom tab bar (Tasks, Schedule, Photos, Me) |
| `src/app/m/schedule/page.tsx` | Mobile schedule: interactive calendar, confirm/decline/withdraw, unavailability |
| `src/app/m/wo/[woId]/page.tsx` | Mobile WO detail - START/JOIN/LOG/COMPLETE + docs |

## Conventions

- All pages are "use client" components reading Supabase directly from browser
- Supabase views (qry_*) handle all joins — frontend never joins tables
- Boolean fields: `isTruthy()` handles both real booleans and string "true" (ODBC legacy)
- RLS enabled on all tables — PM/Foreman/Freelancer policies active
- Freelancer auth: phone@starlight.local + PIN via Supabase Auth
- WO sequence: wo_sequence column drives step ordering, reorderable by PM
- Complexity stored as "1 - Straightforward" / "2 - Skilled" / "3 - Bespoke / Artistic"
- Complexity/finish live on WOs (primary), read-only on scope items
- CATEGORY_CONFIG in job detail page is single source of truth for category behaviour
- Activity verbs under category "ACTIVITY" in master lookups
- Multi-activity WOs: tbl_wo_activities junction, display as "CUT + COVER"
- Contractors merged into Suppliers — tbl_contractors deprecated, tbl_suppliers is canonical
- Invoice processing: Claude API extracts lines, aliases auto-build over time
- BOM timber: stored in Metres for costing, traveller converts to Lengths for workshop
- Estimated costs: rate card × complexity (not freelancer personal rate)
- Workshop vs total quoted: margins calculated against workshop-category lines only
- No text truncation anywhere — full quote line descriptions, scope names, job items
- Scope name editable inline via textarea with auto-height
- Deploy via cmd shell (not powershell)
- File deployment: Desktop Commander write_file with mode 'rewrite' then 'append' chunks (~300 lines each)
- **Timezone-safe dates**: never use `toISOString().split("T")[0]` for local dates — BST shifts midnight to previous day. Use `localDateStr(year, month, day)` helper instead
- **Booking statuses**: Booked → Notified → Confirmed / Declined. Unavailable is separate (no job_id). All count toward capacity except Declined
- **Soft signals only**: unavailable/booked days are visually flagged but never block PM from booking. Warnings, not blocks
- **WhatsApp notify**: wa.me deep links with pre-filled message. Phone number cleaned: strip non-digits, replace leading 0 with 44
- **ICS calendar**: downloadable .ics files (not subscription). Uses HMAC-signed tokens (72h expiry) via `/api/calendar/token` endpoint. No PINs in URLs. Filename includes job name + freelancer name + date
- **Sidebar badge**: real-time subscription on tbl_notifications (replaced 30s polling in Session 7)

### Presence & Concurrency (Session 9 — mandatory for all future development)
- **Presence channels**: `usePresence(resourceType, resourceId, pageName)` from `src/lib/use-presence.ts`. Channel name: `presence:{type}:{id}`. Currently wired to job detail, scope breakdown, WO pages
- **Presence scope**: job-level and scope-level only. Do NOT create per-WO channels — channel proliferation kills performance with low user counts
- **Presence skip for freelancers**: mobile interface (`/m/*`) does not participate in presence. Freelancers aren't competing with PMs for the same fields
- **PresenceAvatars placement**: always in the top bar between the back link and the page header, wrapped in a flex justify-between div
- **Field editing signals**: call `presenceSetEditing("field_name")` on focus, `presenceSetEditing(null)` on blur. Enables `<FieldPresenceIndicator>` glow on other users' screens. Infrastructure deployed, wiring per-field is optional polish
- **Optimistic concurrency scope**: applied to all 6 tables with `updated_at` triggers (tbl_quote_lines, tbl_scope_items, tbl_work_orders, tbl_wo_bom, tbl_production_plan, tbl_quotes). NOT applied to tbl_freelancer_schedule, tbl_notifications, lookup tables
- **Conflict resolution strategy**: `<ConflictDialog>` for single-field inline edits (shows both values, user chooses). `toast.warning + auto-reload` for status transitions and bulk operations (simpler, less disruptive)
- **auditedUpdate return type changed**: now returns `AuditUpdateResult { data, error, conflict, currentRecord? }` instead of raw Supabase result. Existing callers that destructure `{ error }` still work because the shape is compatible
- **TypeScript updated_at gap**: `Job`, `QuoteLine`, `WORow` interfaces don't include `updated_at` but the DB records have it. Use `(record as any)?.updated_at` for reads and `as any` cast for writes. Adding to interfaces is future cleanup

### Security (Session 7 — mandatory for all future development)

### Audit & Multi-User (Session 8+9 — mandatory for all future development)
- **Audit all writes on key tables**: use `auditedUpdate()` from `src/lib/audit.ts` instead of raw `supabase.from().update()`. Covers: tbl_quote_lines, tbl_scope_items, tbl_work_orders, tbl_wo_bom, tbl_production_plan, tbl_quotes, tbl_wo_time_entries, tbl_freelancers
- **Audit all inserts on key tables**: use `auditedInsert()` for creation of WOs, scope items, BOM rows, quote lines, time entries. Logs with `action_type: "insert"`, `field_name: "_record"`
- **Optimistic concurrency**: pass `expectedUpdatedAt` (6th param) to `auditedUpdate()` when editing records with `updated_at` columns. Returns `{ conflict: true, currentRecord }` when another user modified the record. Handle with `<ConflictDialog>` for field-level edits or `toast.warning + loadAll()` for simpler cases
- **Concurrency guard pattern**: on load, capture `updated_at` from the record. On save, pass it as `expectedUpdatedAt`. On conflict, either show dialog (for single-field inline edits) or auto-reload (for status changes, bulk operations)
- **updated_at tracking in local state**: after successful `auditedUpdate`, always update local state with `result.data?.updated_at` so subsequent edits use the fresh timestamp. Use `as any` cast when the TS interface doesn't include `updated_at`
- **No raw Supabase updates on audited tables**: every `.update()` on the 8 audited tables must go through `auditedUpdate()`. Session 9 eliminated all remaining raw updates on WO page
- **Audit log schema**: `tbl_audit_log` — user_id, user_name, user_role, table_name, record_id, field_name, old_value (JSON text), new_value (JSON text), changed_at, job_id, action_type (update/insert/delete/archive/revert), reverted_at, reverted_by
- **For deletes**: log the full record as old_value with action_type="delete" BEFORE the cascade delete
- **For archives (soft delete)**: set archived_at + archived_by + archive_reason, don't hard delete. Log with action_type="archive"
- **Revert capability**: `revertAuditEntry()` restores old value, marks entry as reverted, logs the revert as a new entry
- **Time entries MUST filter archived**: every query on `tbl_wo_time_entries` MUST include `.is("archived_at", null)`. Cost views already have `WHERE archived_at IS NULL`. There are 9 direct queries across the codebase — all patched
- **Admin role**: `admin` in user_metadata.role. Can manage users, edit freelancer details, archive time entries, see audit log. PM cannot do these
- **Role hierarchy**: admin > production_manager > foreman > freelancer. Only admin can create admin accounts
- **Staff accounts**: created via `/api/auth/manage-user` with real email+password (not phone+PIN like freelancers)
- **PostgreSQL ROUND needs ::numeric cast**: `ROUND((value)::numeric, 1)` — double precision fails with "function does not exist"
- **New job auto-creates quote container**: when creating via + New Job, insert tbl_quotes with status "Accepted" and description "Internal Build List" so lines can be added immediately
- **Audit log retention policy** (future): Hot 0-3mo (full detail + undo), Warm 3-12mo (read-only), Cold 12mo+ (compress to job summary)

### Security (Session 7 — mandatory for all future development)
- **Defence in depth**: every data path protected by middleware + API auth + RLS (three layers)
- **Middleware**: `src/middleware.ts` validates Supabase session on all routes. Unauthenticated → redirect to login. Freelancer role → forced to `/m/*` only. API routes excluded (handle own auth)
- **API auth pattern**: every API route must independently validate session via Authorization header. Use `getAuthHeaders()` from `src/lib/auth-headers.ts` on the client side. Check role before executing. Return 401/403, never redirect
- **New table checklist**: (1) enable RLS, (2) create policies per role, (3) if added to Realtime publication, set REPLICA IDENTITY FULL
- **New API route checklist**: (1) extract auth header, (2) validate session via supabase.auth.getUser(), (3) check role, (4) return 401/403 on failure
- **No credentials in URLs**: never pass PINs, tokens, or secrets as query parameters that could be logged. Use signed tokens with expiry for external-facing endpoints
- **No plaintext credentials in database**: PINs exist only as bcrypt hashes in Supabase Auth. The tbl_freelancers.pin column is deprecated and must be dropped
- **Commercial data isolation**: tbl_quotes, tbl_quote_lines, tbl_invoices, tbl_invoice_lines, tbl_rate_card, tbl_business_settings, tbl_suppliers, tbl_material_prices — all PM-only via RLS
- **Realtime tables**: must have REPLICA IDENTITY FULL for RLS to filter subscription events correctly
- **Security policy reference**: see `Starlight_Security_Policy_v1.docx` (17 policies, SP-001 to SP-017)

## Deployment Cheat Sheet

```bash
# From cmd (not powershell)
cd /d C:\Users\mateusz.garwacki\Downloads\starlight-web
git add -A
git commit -m "Description-with-hyphens-no-spaces"
git push origin main
vercel --prod
```

## Environment Variables (Vercel)

| Variable | Purpose | Required |
|----------|---------|----------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL | Yes |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key | Yes |
| SUPABASE_SERVICE_ROLE_KEY | Server-side admin access | Yes |
| ANTHROPIC_API_KEY | Invoice + cut list AI extraction | Yes |
| MICROSOFT_TENANT_ID | Azure AD tenant ID | For OneDrive |
| MICROSOFT_CLIENT_ID | Azure AD app client ID | For OneDrive |
| MICROSOFT_CLIENT_SECRET | Azure AD app secret | For OneDrive |
| MICROSOFT_DRIVE_ID | SharePoint document library drive ID | For OneDrive |

## Build Progress Log

### Session 1 (17 Mar 2026) — Foundation + Dashboard + Jobs
14 commits. Phases 0-6 shipped. RLS on 22 tables. Mobile interface with PIN auth. Workshop view, crew calendar, cost review.

### Session 2 (18 Mar 2026) — Phase 7 + Invoices + Suppliers + Polish
Phase 7 complete. Invoice AI extraction. Suppliers system. Dashboard polish. Deployment guide created.

### Session 3 (19 Mar 2026) — Phase 8 Partial: OneDrive + Documents + Cut Lists
16 commits. Material reconciliation + quote margin analysis. OneDrive integration. WO documents panel. Cut list AI extraction. 4 bug fixes.

### Session 4 (19 Mar 2026) — Phase 8C+D: 3D Viewer + Mobile Docs + Orders
8 commits. Three.js GLB/GLTF viewer. Mobile document view. Orders page. Job header editing. Supplier/boolean fixes.

### Session 5 (20 Mar 2026) — Traveller PDF + Analytics Engine + BOM Costing
~35 commits. Major session covering:
- Traveller PDF with real QR codes, print working, full layout polish
- BOM costing engine: bin-packing, metres for financials, lengths for workshop floor
- Cut list extraction fixes: category derivation, inline recalculation, re-add flow
- Materials & invoices: unit/supplier dropdowns from lookups/suppliers tables
- Text truncation purge: all descriptions show in full across all pages
- Editable scope name, job items align-top, BOM columns widened
- Settings page: rate card (complexity-based hourly rates), business defaults (target margin, day hours)
- Unified analytics engine: 5-layer cost model (Quoted→Estimated→Committed→Reconciled→Margin)
- Workshop vs total quoted separation for margin calculations
- All test data deleted except Chelsea In Bloom (job_id=6)

### Session 8 (23-24 Mar 2026) — Quote Management + Multi-User Foundation + Audit System
~10 commits. Two major themes: manual quote line entry and multi-user readiness.

**Manual Quote Lines & Job Creation:**
- + New Job dialog on /jobs page: creates tbl_production_plan + auto-creates tbl_quotes container
- + Add Quote Line inline form on job detail: description, qty, unit_price, value, zone, sub-group, category
- Inline edit on description and value (click to edit, blur to save)
- Delete line with scope item protection (can't delete lines with linked scopes)
- Qty and Unit Price as proper table columns (not crammed into value cell)
- Auto-calculate line_value = qty × unit_price when both present
- Dashboard fix: show all active jobs, not just WO-bearing ones

**Multi-User Foundation:**
- Admin role added to role hierarchy (admin > pm > foreman > freelancer)
- User management in Settings: Users tab creates PM/foreman/admin accounts with email+password
- `/api/auth/manage-user` route: create_staff, update_role, reset_password, list_users
- Only admin can create other admins. Only admin can edit freelancer details on crew profile

**Audit Log System (with undo):**
- `tbl_audit_log` table: who, when, which table, which record, which field, old value, new value, revert support
- `src/lib/audit.ts`: auditedUpdate(), auditedInsert(), auditedDelete(), revertAuditEntry()
- Audit logging wired into ALL key pages: job detail, scope breakdown, work orders, BOM, traveller, mobile WO, mobile photos
- Settings → Audit Log tab: table of recent changes with Revert button per field-level update
- `updated_at` columns + auto-update triggers on 6 key tables for future optimistic concurrency

**Time Entry Admin Controls:**
- Soft delete (archive) on time entries: archived_at, archived_by, archive_reason columns
- Admin can edit hours inline on freelancer detail page (recalculates entry_cost)
- Admin can archive entries with mandatory reason
- Archived entries excluded from ALL cost calculations (views + 9 direct queries patched)
- "Show archived" toggle on freelancer detail page
- 4 cost views recreated with `WHERE archived_at IS NULL`

**Freelancer Detail Page (`/crew/[id]`):**
- Click crew name → full profile with editable header (admin only), stats, activity timeline, bookings
- Stats: total hours, last 30d hours, WOs completed, avg vs estimate %, flag count
- Activity tab: reverse-chronological time entries with job links, flag notes highlighted, admin edit/archive buttons
- Bookings tab: schedule entries with status badges

**Grosvenor Hotel Quote Seeded:**
- 89 quote lines across 11 zones, £377,340 total, all with qty × unit_price
- Job 13725, client Fait Accompli, quote ref 40656 v16

### Session 9 (24 Mar 2026) — Presence + Optimistic Concurrency + Audit Inserts
1 commit, 10 files changed, 688 insertions, 153 deletions. Three interconnected features:

**Real-time Presence:**
- `usePresence` hook joins Supabase Realtime Presence channels scoped to `presence:{type}:{id}`
- `<PresenceAvatars>` component: coloured initial circles with hover tooltips (name, editing field, time on page)
- `<FieldPresenceIndicator>`: coloured ring around fields being edited by others (Excel Online pattern, infrastructure deployed)
- Wired into Job detail, Scope breakdown, WO pages. Deterministic 8-colour palette from user ID hash

**Optimistic Concurrency:**
- `auditedUpdate()` now accepts optional `expectedUpdatedAt` (6th param). Compares DB `updated_at` before writing
- Returns `AuditUpdateResult { data, error, conflict, currentRecord }` — fully backward-compatible
- `<ConflictDialog>`: side-by-side value comparison with "Keep theirs" / "Use mine" / "Cancel"
- Job detail: quote line edits show full dialog on conflict. Job header edits auto-reload
- WO page: 6 handlers converted from raw Supabase to `auditedUpdate` with guards: `voidWO`, `updatePlannedLead`, `updateEstimatedHrs`, `updateWODescription`, `updateWOStatus`, `updateBomField`

**Audit on Remaining Inserts:**
- `auditedInsert()` wired into: WO creation, scope creation, BOM rows (catalogue + custom), quote lines, mobile time entries (START + JOIN)
- All creation paths now appear in Settings → Audit Log with `action_type: "insert"`

## Lessons Learned & Execution Rules

### Deployment
- **cmd shell only** for `git commit` and `vercel --prod` — PowerShell blocks vercel via execution policy, spaces in commit messages break
- **Desktop Commander:create_directory** for creating dirs — cmd mkdir fails on parentheses in Next.js paths
- **Commit messages use hyphens** not spaces: `"Phase-8-material-recon"` — quoting unreliable across shells
- **Chunk file writes ~300 lines** via Desktop Commander write_file. First chunk: mode 'rewrite', subsequent: mode 'append'
- **Can clone repo in container** (public repo) for reading code, but can't push. Build in container, deploy via Desktop Commander
- **Deploy cycle**: edit local via Desktop Commander → `git add -A && git commit && git push && vercel --prod` all in one cmd command

### SQL & Database
- **ALTER TABLE before CREATE VIEW** — PostgreSQL validates view columns at creation time
- **DROP VIEW IF EXISTS** in dependency order (job→scope→wo) before recreating
- **RLS policies**: wrap in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
- **Boolean handling**: always use `isTruthy()` — mixed real booleans and "true"/"false" strings
- **Run SQL before deploying UI** that depends on new views/tables
- **Complexity field stores full string** like "1 - Straightforward" — use `LEFT(field, 1)::INT` to extract number for joins to rate card
- **FK-safe deletion order**: time_entries → bom → wo_documents → wo_activities → junction → work_orders → job_items → attachments → scope_items → quote_lines → quotes → jobs. Job_items may reference scope_items without job_id — delete by scope_item_id subquery
- **standard_length stored in mm** (not metres) — conversion done in Session 5 migration

### Next.js / React
- **useSearchParams requires Suspense in Next.js 16** — use `window.location.search` in useEffect
- **State doesn't refresh when navigating back** — use window `focus` event listener to refetch
- **Bottom sheets need z-[60]+** to clear mobile tab bar (z-50). Add `pb-10` for safe area
- **Async callbacks between components**: child callbacks must be `async` and `await` parent reload
- **File inputs need ref reset** after upload: `fileRef.current.value = ""`
- **Three.js dynamically imported** — `await import("three")` inside useCallback to avoid SSR
- **Textarea auto-height on mount**: use ref callback `(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }` plus onInput handler for typing
- **No text truncation** — never use `.substring()` on display text. Full descriptions everywhere, let CSS handle wrapping
- **Print CSS in Next.js 16**: no `#__next` wrapper exists. `body > *:not(#__next)` hides EVERYTHING. Only hide specific selectors: `nav, .sidebar, header, .print:hidden`
- **Page break control**: never use inline `pageBreakAfter: "always"` — it overrides CSS `:last-child` rules. Use CSS class `.traveller-page` with `page-break-after: always` and `:last-child { page-break-after: auto }`

### OneDrive / Microsoft Graph
- **Client credentials flow** needs `Sites.ReadWrite.All` + admin consent
- **Drive ID not Site ID** for file operations
- **Buffer type fails** — use `new Uint8Array(arrayBuffer)` for TypeScript
- **Structured folder naming**: `Workshop/{jobNumber} - {jobName}/{docType}/`

### AI Extraction (Claude API)
- **Send materials catalogue as context** — dramatically improves matching accuracy
- **Workshop naming conventions in prompt**: "2x1" = 2x1 PAR Softwood, "MDF18" = 18mm MDF
- **Cut list → BOM = material summary, not individual parts**: group by material, count lengths/sheets
- **Material category often missing from AI summary** — derive from parts data: `parts[0].material_category`
- **Inline recalculation in addToBom handler** — don't rely on useEffect state timing for critical calculations
- **Two-layer extraction view**: "Materials to Order" (BOM) + "Individual Parts" (reference)

### BOM & Costing
- **unit_cost is ALWAYS per-unit** — if unit=Metre, cost is per metre. If unit=Length, cost is per length. If unit=Sheet, cost is per sheet. Total = qty × unit_cost (always). No special stdLen multiplication
- **Cut list extraction converts to per-length**: when inserting timber BOM, unit_cost = price_per_metre × standard_length_in_metres. qty = number of lengths. unit = "Length"
- **Toggle converts both qty AND unit_cost**: Metre→Length: qty = ceil(qty/stdLen), cost = cost×stdLen. Length→Metre: qty = qty×stdLen, cost = cost/stdLen. Total stays the same
- **Traveller converts to workshop units**: qty = number of lengths, unit = "Length", stock pull = "4800mm each"
- **Overestimate principle**: cost whole lengths (what you buy), not actual used mm
- **Bin-packing (FFD algorithm)**: sort pieces descending, fit into standard lengths. 4× 3000mm in 4800mm stock = 4 lengths not 3
- **Estimated costs use rate card, not freelancer rates**: complexity 1=£35, 2=£40, 3=£50 per hour
- **Workshop vs total quoted**: at job level, filter quote lines by category containing "workshop" for margin calculation. Show both values: "Workshop £900 (of £1,750 total)"

### UX Patterns
- **State changes must be visible immediately** — use local useState, sync to DB in background
- **Callbacks must refresh specific section** — pass specific reload function, not general "refresh everything"
- **Upload → extract → review → confirm** flow must work without page navigation
- **No text truncation anywhere** — full descriptions, let CSS `break-words` and auto-height handle layout
- **Editable fields pattern**: transparent border, hover shows border-gray-200, focus shows border-blue. onBlur saves to DB
- **Table cell alignment**: `align-top` on `<tr>` when description textareas may expand multi-line
- **z-index layering**: tab bar=50, bottom sheets=60, lightbox/modals=70

### Naming & Schema
- **tbl_suppliers uses `supplier_name`** not `company_name`
- **Boolean filter: exclude false, don't require true** — null treated as active by default
- **Smart supplier dropdown**: last-used first from order history, ★ prefix, ↻ for historical
- **Complexity field format**: "1 - Straightforward" / "2 - Skilled" / "3 - Bespoke / Artistic" — extract number with `LEFT(field, 1)`

### Notification Pattern (MANDATORY for new features)
Every user-facing action that changes state should generate a notification AND a toast. This is the standard pattern:

**Notifications (`tbl_notifications`):**
- Import `notify` from `@/lib/notifications` 
- Call `notify({ supabase, type, title, detail, severity, freelancerId, jobId, woId, actionUrl })`
- Types: `booking_confirmed`, `booking_declined`, `booking_withdrawal`, `wo_started`, `hours_logged`, `wo_flagged`, `wo_completed`, `scope_change`, `wo_overrun`, `material_needed`
- Severities: `info` (awareness only), `warning` (needs attention), `urgent` (act now — creates gap)
- Always include `actionUrl` so the notification deep-links to the relevant page
- Always include relevant source IDs (freelancerId, jobId, woId, scheduleId) for filtering/context

**Toast notifications (Sonner):**
- Import `toast` from `sonner`
- `toast.success("Message")` for confirmations
- `toast.warning("Message")` for warnings (e.g. withdrawals)
- `toast("Message")` for neutral info
- `toast.error("Message")` for errors
- Call toast AFTER the async operation completes, not before

**When building ANY new feature, ask: "What notifications should this generate?"**
- Freelancer does something → PM gets notified (info or warning)
- System detects an issue → PM gets notified (warning or urgent)
- PM changes something affecting freelancers → consider whether freelancers need to know (future: mobile notification bell)

### Booking & Scheduling
- **Booking statuses**: Booked → Notified → Confirmed / Declined. Unavailable is separate (no job_id). All count toward capacity except Declined
- **booking_group UUID**: generated on creation, groups multi-day bookings into single actionable cards on mobile. Each booking action (Add Booking click) creates one group
- **Soft signals only**: unavailable/booked days are visually flagged but never block PM from booking. Amber warning banner lists conflicts. Weekends are clickable too — only past days are truly disabled
- **WhatsApp notify**: `wa.me/{phone}?text={encoded}` deep links. Phone cleaned: strip non-digits, replace leading 0 with 44. Opens in new tab
- **ICS calendar**: downloadable .ics files (not subscription — Google Calendar subscriptions take 12-24h to first fetch). Per-booking via `?group={uuid}` param, or full schedule. `Content-Disposition: attachment` forces download. Filename: `Starlight-{JobName}-{PersonName}-{Date}.ics`
- **Calendar sync approach**: `.ics` file download is universal — every phone OS routes calendar files to the default calendar app automatically. No "choose your provider" step needed
- **Freelancer mobile calendar**: tap any day → bottom sheet with context-appropriate actions. Confirmed days show "I can't make this day anymore" which triggers `booking_withdrawal` notification (urgent severity)

### Timezone Safety
- **NEVER use `toISOString().split("T")[0]`** for local dates — BST (UTC+1) shifts midnight to previous day in UTC
- **Always use `localDateStr(year, month, day)`** helper: `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`
- **`todayLocal()`** helper for current date string
- **`fmtDate(d)`** with `new Date(d + "T00:00:00")` to prevent timezone parse shifts
- This bug caused calendar days to appear in wrong grid positions — very visible, very confusing

### PostgreSQL Gotchas
- **No `CREATE POLICY IF NOT EXISTS`** — use `DROP POLICY IF EXISTS` + `CREATE POLICY`
- **`CREATE INDEX IF NOT EXISTS`** works fine
- **`ALTER TABLE ADD COLUMN IF NOT EXISTS`** works fine
- **CTE chains with `RETURNING`** for multi-table inserts — `@@IDENTITY` doesn't exist in PostgreSQL

### Presence & Concurrency (Session 9)
- **Presence solves 80% of concurrency problems**: people naturally avoid editing the same thing when they can see who else is there. Presence is cheap, conflicts are expensive — deploy presence first
- **Supabase Presence is connection-based**: when a user closes the tab, the heartbeat timeout (30s default) removes them. Brief ghosts are cosmetic, not harmful
- **Channel granularity matters**: one channel per job and one per scope is sufficient. Per-WO channels multiply quickly and waste resources at Starlight's user count
- **Optimistic concurrency uses pre-check, not WHERE clause**: the initial implementation tried `WHERE updated_at = ?` in the UPDATE, but Supabase returns ambiguous results (null data + null error = zero rows vs genuine not-found). Solution: fetch current record first, compare `updated_at` in code, only proceed with update if they match. If mismatch, return conflict immediately without writing
- **Two conflict resolution UX patterns**: (1) `<ConflictDialog>` for single-field inline edits where the user is actively looking at the field — shows both values, lets them choose. (2) `toast.warning + auto-reload` for status changes and multi-field operations — simpler, less disruptive, acceptable loss of the user's in-flight change
- **TypeScript interfaces lag behind DB schema**: `Job`, `QuoteLine`, `WORow` don't declare `updated_at` even though the DB has it. Use `(record as any)?.updated_at` for reads and `as any` cast for state updates. Adding `updated_at?: string` to all interfaces is future cleanup
- **`auditedUpdate` return type change is backward-compatible**: old callers that destructure `{ error }` or ignore the return still work because `AuditUpdateResult` has `error` in the same position. Only callers that want conflict detection need to check `.conflict`
- **Build before deploy**: always run `npx next build` locally before `git push && vercel --prod`. Catches TS type errors that would fail the Vercel build (Session 9 caught `ringColor` not being valid CSS, `updated_at` not on TS interfaces)
- **CSS ring colour can't use `style={{ ringColor }}`**: Tailwind's `ring-*` classes are implemented as box-shadow, not a CSS property. Use `style={{ boxShadow: '0 0 0 2px {color}' }}` for dynamic ring colours

### Session 6 (23 Mar 2026) — Crew Booking, Capacity Redesign, Mobile Schedule
~11 commits. Full booking workflow: Capacity page redesigned with weekly calendar + Add Booking page (month-view day picker, WhatsApp wa.me notify). Mobile schedule (/m/schedule) with interactive monthly calendar — tap days for context-appropriate actions (confirm, decline, withdraw, mark unavailable). Crew page stripped to people management only. ICS calendar download API. Notifications table created (tbl_notifications) — booking withdrawals auto-create alerts. Timezone bug fixed (BST toISOString shift). Schema: booking_group UUID, notified_at, unavailable_reason added to tbl_freelancer_schedule.

### Session 6b (23 Mar 2026) — Notifications System + Toast Polish
~4 commits. Notifications page with severity-coded cards, filter tabs (All/Needs attention/Urgent), mark read/dismiss/bulk actions. Sidebar bell badge with unread count (polls 30s). Notification triggers wired into: booking confirm/decline/withdrawal, WO start/join/log/flag/complete. Shared notify() helper in lib/notifications.ts. Sonner toast notifications on all actions across mobile and desktop. General Workshop booking option on Add Booking page. ICS filenames now descriptive.

### Session 7 (23 Mar 2026) — Security Hardening + Realtime + Quick Wins
~7 commits. Full security audit and remediation:
- **Bug fixes**: Booking delete FK error (nullify notifications before delete), booking delete error handling (surface real errors instead of false success)
- **Quick wins**: WO auto-refresh on tab return (visibilitychange listener), Dashboard notification panel (unread alerts with severity icons + deep links)
- **Realtime subscriptions**: useRealtimeRefresh hook with 500ms debounce. Wired to Workshop (WO + time entries), Capacity (WO + bookings), Booking Calendar (schedule), Notifications page, Sidebar badge (replaced 30s polling)
- **Security — C1 Middleware**: Server-side session validation on all routes. Freelancers restricted to /m/*. Login redirects for unauthenticated requests
- **Security — C2 API auth**: Extract-invoice + extract-cutlist now require valid session + PM/foreman role. Auth header passed via getAuthHeaders() helper
- **Security — C3 Privilege escalation**: Freelancer-sync endpoint now requires PM session before creating/updating auth users
- **Security — H2 Calendar tokens**: HMAC-SHA256 signed tokens replace PINs in ICS download URLs. 72h expiry. New /api/calendar/token endpoint
- **Security — H3 PIN removal**: All code references to tbl_freelancers.pin removed. Column flagged for DROP
- **Security — H4 RLS overhaul**: Comprehensive policies for all tables. Helper functions get_my_role() and get_my_freelancer_id(). Commercial tables locked to PM-only
- **Security — M1 Realtime**: REPLICA IDENTITY FULL on all 4 realtime tables
- **Documents**: Security Audit Report + Security Policy v1.0 (17 policies) generated

## Next Session Pickup

### Current State
- Chelsea In Bloom (job_id=6, job_number=13794) — test job with scope items, WOs, BOM
- **Grosvenor Hotel Wedding (job_number=13725)** — real job, 89 quote lines, £377,340, all zones populated with qty/unit_price
- **Goodwood Revival 2026** — manually created job, empty (testing + New Job flow)
- Settings page: 4 tabs (Rate Card, Defaults, Users, Audit Log)
- Admin role active — Mateusz is admin, can create PM accounts
- Audit logging live on all key tables with revert capability — now includes inserts
- Time entry archive system live with cost exclusion across entire app
- Freelancer detail page live at /crew/[id]
- **Real-time presence** live on job detail, scope breakdown, WO pages
- **Optimistic concurrency** live on all audited update paths with conflict dialog
- **All creation paths audited** — WOs, scopes, BOM rows, quote lines, time entries
- **Scope options** live on scope breakdown page — add/select/reject build approaches with cost estimates
- **Cost waterfall** integrated as drill-down inside cost analysis — expand quote lines to see scope items
- **Chunked upload** live — files up to 100MB+ upload directly to OneDrive from browser
- **Security: 0 Supabase advisor issues** — all views SECURITY INVOKER, roles in app_metadata, RLS clean

### Outstanding Work (prioritised)
1. **Supabase Pro upgrade** — CRITICAL before inviting PMs. Enables daily backups + PITR
2. **Quote import from real source** — currently manual entry only
3. **Schedule `audit_retention_cycle()`** — function created, needs pg_cron on Pro plan (monthly)
4. **Clean up vw_ views** — 18 legacy views duplicating qry_ views. Verify nothing uses them, then DROP
5. **Repo transfer** — move from personal GitHub to company account, update Vercel git connection
6. Job templating, precedent search, 2D sheet nesting, cross-job analytics (Tier 3)

### New Files (Session 9)
| File | Purpose |
|------|---------|
| `src/lib/use-presence.ts` | Supabase Realtime Presence hook — who's viewing what |
| `src/components/presence-avatars.tsx` | Coloured avatars + field editing indicator |
| `src/components/conflict-dialog.tsx` | Optimistic concurrency conflict resolution modal |

### Test Workflow for Session 9 Features
1. **Presence**: Open same job in two browser windows with different user accounts → verify avatar appears in header bar
2. **Presence cleanup**: Close one tab → verify avatar disappears within ~30 seconds
3. **Optimistic concurrency**: In tab A, click to edit a quote line value. In tab B, edit the same field to a different value and save. Go back to tab A and save → verify conflict dialog shows both values
4. **Conflict "Use mine"**: In the conflict dialog, click "Use mine" → verify your value is saved
5. **Conflict "Keep theirs"**: Repeat conflict scenario, click "Keep theirs" → verify other user's value is kept
6. **WO status conflict**: In two tabs, try to change a WO status simultaneously → verify toast warning + auto-reload
7. **Audit inserts**: Create a new WO → check Settings → Audit Log → verify entry appears with action_type "insert"
8. **Audit inserts (BOM)**: Add a BOM row from material catalogue → check audit log → verify "insert" entry
9. **Audit inserts (scope)**: Create a scope item → check audit log → verify "insert" entry
10. **Audit inserts (quote line)**: Add a quote line → check audit log → verify "insert" entry


### Session 10 (25 Mar 2026) — Ad-Hoc Tasks, Workshop Requests, Me Tab, FAB, Review Inbox
3 commits, 9 files changed, 768 insertions, 154 deletions. Three interconnected features for freelancer engagement + PM review workflow.

**Database (SQL run in Supabase):**
- `tbl_tasks`: ad-hoc work logging with timer support. Categories: job_work, maintenance, workshop_general, other. Statuses: in_progress → pending → routed/approved_overhead/rejected. Timer fields: started_at, logged_at. PM routing: routed_to_wo_id, routed_hours
- `tbl_workshop_requests`: freelancer-raised requests. Categories: order_material, repair_equipment, restock, safety, general. Urgency: normal/urgent. Photo support via OneDrive. Statuses: open → acknowledged → in_progress → resolved/dismissed
- RLS: freelancers see own rows, PM/admin see all. Freelancers can update own in_progress tasks only
- `qry_freelancer_hours_summary`: unions WO time entries + approved tasks for Me tab totals
- `qry_review_inbox`: unified view — pending tasks + open/acknowledged requests, sorted urgent-first
- Realtime: REPLICA IDENTITY FULL + added to supabase_realtime publication (now 6 tables)
- `tbl_freelancers.pin` column dropped (was deprecated Session 7, code refs removed, now column gone)

**Mobile — FAB:**
- `FloatingActionButton` component: red "+" bottom-right, expands to "Log Task" + "Raise Request"
- Hidden on `/m/wo/[woId]` (WO detail has own primary actions) and `/m/login`
- Added to mobile layout between content and tab bar

**Mobile — /m/task (Log a Task):**
- Two modes: Quick Log (enter hours + date) or Start Timer (creates in_progress task)
- Category pills (4 options), optional job picker (searchable active jobs)
- Soft warning if WO session already active (doesn't block — user chose this)
- Blocks starting timer if another task timer is already active (one timer at a time)
- Submits with notify() → task_submitted notification to PM
- Hours stepper: shrink-0 130px with w-12 input (fits 10.5), date picker gets flex-1

**Mobile — /m/request (Raise a Request):**
- 5 category pills with icons (Package, Wrench, Archive, AlertTriangle, MessageSquare)
- Urgency toggle (Normal / Urgent — urgent gets red highlight + urgent notification severity)
- Optional job picker, optional description, optional photo capture (OneDrive upload)
- Submits with notify() → workshop_request notification

**Mobile — /m/me (Me Tab Rebuild):**
- Profile header with logout
- Active timer banner: pulsing icon, elapsed time, "Log Hours" button → bottom sheet with pre-calculated hours
- Hours summary cards: This Week / This Month (from qry_freelancer_hours_summary view)
- Quick action buttons: Log Task + Raise Request (duplicated from FAB for discoverability)
- Recent Entries: merged list of WO time entries + ad-hoc tasks, sorted by date. Tasks show "Ad-hoc" tag + status badge
- My Requests: open requests with status badges + resolution notes when resolved
- My Tasks: pending + recently reviewed tasks with status badges + review notes

**Desktop — /review/inbox (Workshop Inbox):**
- Unified list from qry_review_inbox view. Cards show type badge, category, title, freelancer, job, hours, urgency
- Task actions: Route to WO (modal with WO search, hour adjustment, rate calculation → creates tbl_wo_time_entries), Approve as Overhead, Reject (requires reason)
- Request actions: Acknowledge, Resolve (requires note), Dismiss (requires reason)
- All actions fire notify() back to freelancer and call loadInbox() to refresh
- Route to WO: fetches freelancer day_rate/standard_day_hours, calculates hourly rate, creates audited time entry

**Desktop — Dashboard + Review integration:**
- Dashboard: new "Workshop Inbox" stat card with count (pending tasks + open requests), links to /review/inbox
- Review page: amber inbox banner with count when items pending, links to /review/inbox
- Both load counts from tbl_tasks (status=pending) + tbl_workshop_requests (status IN open, acknowledged)

**Notification types added:** task_submitted, task_reviewed, workshop_request, request_resolved

### New Files (Session 10)
| File | Purpose |
|------|---------|
| `src/components/floating-action-button.tsx` | Mobile FAB with expand/collapse, auto-hide on WO detail |
| `src/app/m/task/page.tsx` | Task form: quick log + start timer |
| `src/app/m/request/page.tsx` | Request form: 5 categories, urgency, photo |
| `src/app/(dashboard)/review/inbox/page.tsx` | Unified PM inbox with routing + action modals |

### SQL Already Run (Session 10)
- `session10-part1-tables.sql`: tbl_tasks, tbl_workshop_requests, indexes, RLS, REPLICA IDENTITY FULL
- `session10-part2-views.sql`: qry_freelancer_hours_summary, qry_review_inbox
- `ALTER PUBLICATION supabase_realtime ADD TABLE tbl_tasks, tbl_workshop_requests`
- `ALTER TABLE tbl_freelancers DROP COLUMN IF EXISTS pin`


### Session 10b (25 Mar 2026) — Polish + PM Estimates + Cost Analysis
~6 commits, 12 files changed. Cleanup, presence wiring, PM estimate feature, cost analysis integration.

**Cleanup & Polish:**
- `tbl_freelancers.pin` column dropped (ALTER TABLE DROP COLUMN)
- Realtime publication: tbl_tasks + tbl_workshop_requests added (now 6 tables in supabase_realtime)
- `audit_retention_cycle()` SQL function created — hot (0-3mo, undo enabled), warm (3-12mo, undo disabled), cold (12mo+, deleted for closed jobs). Run manually or schedule via pg_cron
- `useRealtimeRefresh` wired into Me tab (tbl_tasks + tbl_workshop_requests) and /review/inbox
- `presenceSetEditing` wired into all inline edits: job header (start/save/cancel), quote line cells (start/save/cancel), scope page (name textarea, event_zone, description), WO page (description, est_hrs), BOM rows (description, qty, unit_cost)
- TS interfaces: `updated_at?: string | null` added to Job, Quote, QuoteLine, ScopeItem, WorkOrder, WoBom. `pin` removed from Freelancer. `ScopeOption` interface added
- Crew page: removed all `f.pin` references (column no longer exists)

**PM Estimate on Quote Lines (new feature):**
- 5 new columns on tbl_quote_lines: pm_est_cost, pm_est_labour_days, pm_est_material_cost, pm_est_rate_override, pm_est_notes
- Progressive disclosure UI: Level 1 (single cost number inline), Level 2 (expand → labour days + materials), Level 3 (+ rate override + basis notes)
- "PM Est" column in quote lines table with click-to-edit (same pattern as value/qty/unit_price)
- Dashed "Est..." placeholder for empty values, square chevron button to expand breakdown
- Margin % indicator below value (green ≥20%, amber 0-20%, red negative)
- PmEstSubRow component: labour days, day rate, materials, notes, auto-calculated total, Save button
- Default day rate calculated from rate card: `straightforward_rate_per_hour × standard_day_hours` (not hardcoded)
- savePmEstBreakdown handler: auto-calculates pm_est_cost from breakdown, saves via auditedUpdate with concurrency

**Scope Options Table (schema only, UI pending):**
- `tbl_scope_options` created with RLS (PM+ write, foreman+ read)
- Fields: option_label, description, pros, cons, est_labour_days, est_material_cost, est_total_cost, impact_on_quote, status (proposed/selected/rejected)
- ON DELETE CASCADE from scope_item_id

**Cost Analysis Integration:**
- Orange "PM Estimate" layer row in cost analysis grid (between Quoted and Estimated)
- Shows PM est labour, materials, total, margin % — colour-coded against target
- PM Est in collapsed header bar summary
- "PM Est" column in workshop quote lines per-line table (orange text)
- PM totals calculated from workshop-category lines only (consistent with existing logic)
- Default day rate loaded from tbl_rate_card + tbl_business_settings (not hardcoded)
- Layer only appears when PM estimates exist (progressive disclosure)

**Cost Waterfall View (SQL only, UI pending):**
- `qry_cost_waterfall` view: per scope item, 4-layer comparison — Quoted → PM Est → Workshop Est → Actual
- Joins: tbl_scope_items → tbl_quote_lines (PM est) → qry_scope_estimated_cost (workshop) → qry_scopeitem_cost_summary (actuals) → tbl_scope_options (selected option)
- Margin % calculated for each layer against quoted value

### New/Modified Files (Session 10b)
| File | Purpose |
|------|---------|
| `src/components/cost-breakdown.tsx` | PM Estimate layer row + per-line column in cost analysis |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | PM Est column, PmEstSubRow, expandedPmEst state, default day rate from rate card |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | presenceSetEditing on name, zone, description |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/wo/page.tsx` | presenceSetEditing on WO desc, est hrs, BOM fields |
| `src/app/(dashboard)/crew/page.tsx` | Removed pin references |
| `src/app/(dashboard)/review/inbox/page.tsx` | useRealtimeRefresh added |
| `src/app/m/me/page.tsx` | useRealtimeRefresh + refreshKey added |
| `src/lib/types.ts` | updated_at on 6 interfaces, pin removed, ScopeOption + pm_est fields added |

### SQL Already Run (Session 10b)
- PM estimate columns: `ALTER TABLE tbl_quote_lines ADD COLUMN pm_est_cost, pm_est_labour_days, pm_est_material_cost, pm_est_rate_override, pm_est_notes`
- `CREATE TABLE tbl_scope_options` with RLS, index, ON DELETE CASCADE
- `CREATE VIEW qry_cost_waterfall` — 4-layer cost comparison per scope item
- `CREATE FUNCTION audit_retention_cycle()` — monthly hot/warm/cold lifecycle
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE tbl_tasks, tbl_workshop_requests`
- Cleanup: `ALTER TABLE tbl_freelancers DROP COLUMN IF EXISTS pin`

### Database Tables (now 33)
Migrated from Access (21) + Added by web app (12):
tbl_tasks (NEW), tbl_workshop_requests (NEW), tbl_scope_options (NEW) + existing 10

### Views (now 30+)
New: qry_freelancer_hours_summary, qry_review_inbox, qry_cost_waterfall

### Conventions Added (Session 10)
- **Always check `information_schema.columns`** before writing SQL that references column names. Never trust documentation or memory
- **Split SQL into tables + views** so table creation succeeds even if view creation fails (Supabase runs as transaction)
- **PG UNION ORDER BY**: can't use expressions — wrap in subquery: `SELECT * FROM (...) sub ORDER BY expr`
- **cmd git commit**: always use `-F commit-msg.txt` to avoid shell quoting issues
- **uploadToOneDrive** signature: `(file, folder, fileName?)` — no supabase param
- **Mobile layout**: use `shrink-0` fixed width for compact controls (hours stepper), `flex-1` for expanding controls (date picker)
- **Default day rate**: calculated from `tbl_rate_card` (complexity=1, rate_per_hour) × `tbl_business_settings` (standard_day_hours). Never hardcode
- **PM estimate auto-calc**: UI always writes `pm_est_cost` — either directly (Level 1) or calculated from breakdown (Level 2+). View just reads it

### Session 11 (25 Mar 2026) — Scope Options UI + Cost Waterfall
1 commit, 5 files changed. Both features have backend done (Session 10b), this is pure UI.

**Scope Options (`<ScopeOptions>` component):**
- [x] `src/components/scope-options.tsx` — full CRUD for build approach options per scope item
- [x] Progressive disclosure: if no options exist, shows subtle "+ Add build options" link (not empty card)
- [x] Inline add form (not modal) — label, description, pros/cons, labour days, materials, auto-calc total
- [x] Day rate from rate card (complexity 1 × standard day hours), never hardcoded
- [x] Card per option: label, status badge (proposed/selected/rejected), cost total, margin %, impact vs quoted
- [x] Expandable detail: description, pros/cons, labour × day rate breakdown, materials
- [x] Select/Reject/Revert/Delete actions — all through `auditedInsert`/`auditedUpdate`
- [x] Selected options get green border + sorted to top. Rejected are greyed with strikethrough
- [x] Placed on scope breakdown page between header card and CostBreakdown
- [x] `tbl_scope_options` added to AUDITED_TABLES in audit.ts

**Cost Waterfall → Merged into Cost Analysis (refactored):**
- [x] Standalone `<CostWaterfall>` card removed from job page
- [x] Waterfall drill-down integrated into `<CostBreakdown>` workshop quote lines table
- [x] Quote line rows with scope items (scopeCount > 0) are now expandable — click to see scope items underneath
- [x] Scope sub-rows show: name, selected option tag, quoted, PM est, workshop est (labour + material), total, margin %
- [x] Lazy-loads from `qry_cost_waterfall` per quote_line_id with client-side cache
- [x] Eliminates redundancy — one place for all cost data, not two overlapping panels

### New/Modified Files (Session 11)
| File | Purpose |
|------|---------|
| `src/components/scope-options.tsx` | Build options CRUD on scope breakdown page |
| `src/components/cost-waterfall.tsx` | RETAINED but no longer imported — waterfall logic merged into cost-breakdown |
| `src/components/cost-breakdown.tsx` | Waterfall drill-down added: expandable quote lines show scope items |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | Removed CostWaterfall import + placement |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | Added ScopeOptions import + placement |
| `src/lib/audit.ts` | Added tbl_scope_options to AUDITED_TABLES + app_metadata role |

**Chunked Upload for Large Files (up to 100MB+):**
- [x] `/api/onedrive/upload-session` — new API route creates pre-authenticated OneDrive upload session
- [x] `onedrive-client.ts` — files ≤3.5MB proxy through Vercel (existing), files >3.5MB upload direct to OneDrive in ~3MB chunks
- [x] Browser never sees Graph API token — only gets scoped, time-limited, single-file upload URL
- [x] `microsoft-graph.ts` — also updated with server-side chunked upload (for any future server-side uploads)

**Security Hardening — Role in app_metadata:**
- [x] All role checks now read `app_metadata?.role` first, fall back to `user_metadata?.role`
- [x] `get_my_role()` PG function updated to read from `app_metadata` (not user-editable)
- [x] `audit_read_pm` and `audit_revert_admin` policies rebuilt using `get_my_role()`
- [x] All 53 views switched to `SECURITY INVOKER` (was SECURITY DEFINER bypassing RLS)
- [x] All API routes patched: manage-user, freelancer-sync, extract-cutlist, extract-invoice, calendar/token
- [x] middleware.ts, audit.ts, settings page, crew detail page — all patched
- [x] New user creation writes role to both `user_metadata` AND `app_metadata`
- [x] Existing users migrated: `raw_app_meta_data` populated from `raw_user_meta_data`
- [x] `tbl_quote_line_contractors` RLS fixed — was missing admin role, had two conflicting policies
- [x] Supabase Security Advisor: 0 issues

**Bug Fix — Supplier Assignment:**
- [x] `tbl_quote_line_contractors` had two RLS policies neither allowing admin — replaced with single `pm_admin_full_access` policy

### SQL Already Run (Session 11)
- 53× `ALTER VIEW ... SET (security_invoker = on)` — all qry_ and vw_ views
- `UPDATE auth.users SET raw_app_meta_data = jsonb_set(...)` — migrate roles to app_metadata
- `CREATE OR REPLACE FUNCTION get_my_role()` — reads from app_metadata
- DROP + CREATE policies on `tbl_audit_log` — audit_read_pm, audit_revert_admin
- DROP + CREATE policy on `tbl_quote_line_contractors` — pm_admin_full_access

### New Files (Session 11)
| File | Purpose |
|------|---------|
| `src/components/scope-options.tsx` | Build options CRUD on scope breakdown page |
| `src/app/api/onedrive/upload-session/route.ts` | Pre-authenticated upload session for large files |

### Conventions Added (Session 11)
- **Role reading pattern**: Always `app_metadata?.role || user_metadata?.role || "freelancer"` — never just user_metadata (user-editable, insecure)
- **New user creation**: Must set role in BOTH `user_metadata` (for display) and `app_metadata` (for security/RLS)
- **Large file upload**: Files >3.5MB go browser→OneDrive direct via upload session. Small files still proxy through Vercel
- **View security**: All views must be SECURITY INVOKER. Add `ALTER VIEW ... SET (security_invoker = on)` to new view checklist


### Session 12 (26 Mar 2026) — Stock Catalogue, Job Items Redesign, Reports Engine

#### DB Cleanup ✅
- [x] Dropped 27 orphaned objects (18 legacy views, 2 test tables, 7 unused functions)
- [x] Created `qry_stale_travellers` view
- [x] `audit_retention_cycle()` scheduled via pg_cron (1st of month, 3am UTC)
- [x] Fixed duplicate UNIT entries in `tbl_master_lookups` + added `m²`
- [x] Fixed cutlist extractor state bug (`useEffect` overwriting fresh extraction data)

#### Performance Optimization ✅
- [x] 5 RPC functions replace 50+ individual queries: `rpc_dashboard_data`, `rpc_workshop_data`, `rpc_review_data`, `rpc_capacity_data`, `rpc_job_detail_data`
- [x] 18 performance indexes (partial indexes on archived_at, status fields, FTS on materials)
- [x] **Convention**: All pages with 5+ queries MUST use PostgreSQL RPC functions

#### Scope-Level BOM ✅
- [x] `tbl_wo_bom.scope_item_id` (nullable FK) — materials attach directly to scope items without WOs
- [x] CHECK constraint: at least one parent (work_order_id OR scope_item_id)
- [x] `<ScopeBom>` component: search materials + stock items, inline edit, delete with audit
- [x] Cost rollup views rebuilt: `qry_wo_cost_summary` → `qry_scopeitem_cost_summary` → `qry_job_cost_summary`

#### Stock Catalogue Import ✅
- [x] `tbl_stock_items` table: product_code, description, stock_quantity, location, weight_kg, hire_cost_day/week, thumbnail_url, active
- [x] 2,743 items imported from 3 PDFs (502 pages total)
- [x] 1,960 thumbnail images extracted, resized to 120px width JPEG, stored in `public/stock-thumbs/{code}.jpg`
- [x] Served from Vercel CDN with browser caching

#### Stock Management Page ✅ (`/stock`)
- [x] Grid view (cards with square thumbnails) and List view (compact rows) — list is default
- [x] Grid/List toggle in header
- [x] Live search with 150ms debounce (no Search button)
- [x] Location filter dropdown
- [x] Infinite scroll (IntersectionObserver, 50 items per batch, 200px rootMargin)
- [x] Click any item → detail modal with large image, stats, metadata
- [x] Edit mode in modal (all fields editable)
- [x] Add Item dialog, Archive (soft delete)
- [x] Warehouse icon in sidebar

#### Stock Pick Wiring ✅
- [x] `tbl_wo_bom.stock_item_id` FK → `tbl_stock_items`
- [x] ScopeBom search shows two sections: Stock Items (with thumbnails, qty, hire rate) and Materials
- [x] Stock badge (amber "Stock" tag) on BOM rows linked to stock items
- [x] Stock Pick category enabled for scope creation (`canCreateScope: true`, `autoComplete: "scope"`)

#### Job Items Redesign ✅
- [x] Two distinct add buttons: **"+ Add Stock Item"** (amber picker) and **"+ Add Bespoke Item"** (blue form)
- [x] Stock picker dialog: full search with thumbnails, available qty, location, hire rate. Multiple picks before closing
- [x] Bespoke dialog: description textarea, quantity, finish required, "Add to stock catalogue when complete" checkbox
- [x] `tbl_job_items.stock_item_id` FK → `tbl_stock_items`, `item_source` column (stock/bespoke/promoted)
- [x] Card-style item display with source badges (Stock/Bespoke/Promoted)
- [x] Inline notes field on every job item
- [x] **Promote to Stock**: green arrow button on bespoke items creates `tbl_stock_items` entry and links back

#### Freelancer Auth Fix ✅
- [x] PIN field added to Add Freelancer dialog — auto-creates Supabase Auth user on creation
- [x] Toast confirms "Freelancer added with mobile login" or warns if no PIN set
- [x] Eliminates two-step creation (add freelancer → separately set PIN)

#### Cost Analysis Fixes ✅
- [x] "Estimate vs Budget" metric: compares estimate to budget (not committed to estimated)
- [x] Budget now includes Stock Pick + Stock-and-Hire lines (not just Workshop)
- [x] Header label: "Internal £X (of £Y total)" instead of "Workshop"
- [x] Per-line table includes all internal categories

#### RLS Policy Fix ✅
- [x] Added `admin` role to ALL 30 modify policies (Session 11 security hardening missed admin)
- [x] Fixed `tbl_notifications` policy (referenced non-existent `user_id` column)

#### Materials — Steel Category ✅
- [x] Steel behaves identically to Timber/Metal: spec value fields, standard length visible

#### Reports Engine ✅
- [x] `/reports` page with report cards, job selector, generate button
- [x] `/reports/job-financial/[jobId]` — Pre-Build Financial Review
- [x] `rpc_report_job_financial(p_job_id)` — single RPC returns all report data
- [x] Summary metrics: Internal Quoted, Estimated Cost, Estimated Margin, Target Margin
- [x] Alert banner: "X of Y lines below target margin — review lines N, N"
- [x] Line-by-line analysis table: sorted worst-margin-first, RAG status icons
- [x] Other Quote Lines section (Install, Subcontracted — not costed internally)
- [x] Print / PDF button with print-friendly CSS
- [x] Future report placeholders: Post-Build Reconciliation, Workshop Utilisation

### New/Modified Files (Session 12)
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/stock/page.tsx` | Stock management page: grid/list view, search, edit, add |
| `src/app/(dashboard)/reports/page.tsx` | Reports index: report cards with job selector |
| `src/app/(dashboard)/reports/job-financial/[jobId]/page.tsx` | Pre-Build Financial Review report |
| `src/components/scope-bom.tsx` | Scope-level materials panel: stock + material search |
| `src/components/job-items-table.tsx` | Rewritten: stock picker + bespoke dialogs, promote to stock |
| `src/components/cost-breakdown.tsx` | Budget includes stock lines, estimate vs budget fix |
| `src/components/sidebar.tsx` | Added Stock (Warehouse icon), Reports (FileText icon) |
| `src/app/(dashboard)/crew/page.tsx` | PIN field in Add Freelancer dialog |
| `src/app/(dashboard)/materials/page.tsx` | Steel category alongside Timber/Metal |
| `src/lib/types.ts` | WoBom: scope_item_id, stock_item_id added |
| `public/stock-thumbs/*.jpg` | 1,960 stock item thumbnail images |

### SQL Run (Session 12)
- DB cleanup: 27 objects dropped, `qry_stale_travellers` created, pg_cron scheduled
- 5 RPC functions: dashboard, workshop, review, capacity, job_detail
- 18 performance indexes
- `tbl_wo_bom`: scope_item_id, stock_item_id columns + CHECK constraint
- `tbl_stock_items`: full table creation + 2,743 items imported
- Stock thumbnail URL updates (10 SQL files)
- `tbl_job_items`: stock_item_id, item_source columns
- `rpc_report_job_financial()` function
- RLS fix: admin role added to all 30 modify policies
- Duplicate UNIT cleanup in master_lookups

### Database Tables (now 34)
Previous (30) + Added: tbl_stock_items, tbl_tasks, tbl_workshop_requests, tbl_scope_options

### Key Views (30+)
Added: qry_stale_travellers
Removed: 18 legacy vw_ views

### RPC Functions (6)
rpc_dashboard_data, rpc_workshop_data, rpc_review_data, rpc_capacity_data(date,date), rpc_job_detail_data(job_id), rpc_report_job_financial(job_id)

### Conventions Added (Session 12)
- **RPC for heavy pages**: All pages with 5+ queries MUST use PostgreSQL RPC functions (single server call)
- **Supabase SQL is transactional**: If ANY statement fails, entire script rolls back. Nothing gets applied. Always verify column names before writing SQL
- **Stock thumbnails**: Served as static files from `public/stock-thumbs/{code}.jpg` — not stored in DB
- **Freelancer creation**: Should include PIN in one step (auto-creates auth user)
- **Always check `information_schema.columns`** before writing RPC functions or views. Column name mismatches cause full script rollback
- **Fan-out prevention**: Never join labour and material calculations in the same CTE. Separate into `wo_labour` (no BOM join) and `wo_materials` (BOM join only)


### Session 13 (27 Mar 2026) — Bugfixes, Cut List Overhaul, PM Queries, Job Item Reuse

#### Bugfixes ✅
- [x] **Capacity planning**: General workshop bookings (job_id=null) now count toward supply. Independent supply counter, "Xh general" subtitle on Booked card
- [x] **Multi-WO from job items**: Items with existing WO coverage can be selected for additional WOs (e.g. BUILD then PAINT). Removed opacity dimming and static checkmark
- [x] **PDF extraction**: Added `anthropic-beta: pdfs-2024-09-25` header to both extract-cutlist and extract-invoice API routes. Hardened JSON parsing with first-brace/last-brace fallback

#### Cut List Extraction Overhaul ✅
- [x] **Prompt simplified**: Claude only extracts raw parts list (dimensions, quantities, materials). No more asking LLM to do math
- [x] **2D guillotine bin packing**: Sheet materials now use proper rectangle packing algorithm (Best Short Side Fit, rotation support, Shorter Axis Split). Area-based calculation was completely wrong (1830×865 part: area says 2 sheets for 6 parts, packing correctly says 6)
- [x] **1D bin packing**: Timber uses First-Fit Decreasing for standard lengths (unchanged, was already correct)
- [x] **Timber BOM**: Orders by Length count (not Metres). Unit cost = price_per_metre × standard_length_in_metres
- [x] **Material groups built from parts**: No longer depends on Claude's `material_summary` — groups are derived deterministically from extracted parts data
- [x] **Oversized part detection**: Anomaly warning when a part doesn't fit any orientation on standard sheet

#### PM Queries ✅
- [x] **tbl_pm_queries** table: job_id, scope_item_id, question, answer, status, photo_url
- [x] **Scope-level panel**: Collapsible section below description. Type question → Enter → saved. Badge count for open queries
- [x] **Editable questions**: Click text to edit inline, Enter to save
- [x] **Photo attachments**: Camera button, client-side resize to 800px max, stored as base64 in DB
- [x] **Job-level aggregation**: Panel on job detail page showing all open queries across scopes
- [x] **Copy text**: Clipboard paste grouped by scope item for WhatsApp/email
- [x] **Share with photos**: Opens formatted HTML page in new tab with embedded images — printable/saveable as PDF
- [x] **Answer inline**: Record PM responses on job page with timestamp

#### In Progress — Copy Bespoke Item from Same Job 🔧
Feature: When adding a bespoke item to a scope, option to copy an existing bespoke item from another scope in the same job. Avoids retyping identical items when same design appears across multiple quote lines.

**SQL needed (not yet run):**
```sql
ALTER TABLE tbl_job_items ADD COLUMN IF NOT EXISTS source_item_id INTEGER REFERENCES tbl_job_items(item_id);
CREATE INDEX IF NOT EXISTS idx_job_items_source ON tbl_job_items(source_item_id) WHERE source_item_id IS NOT NULL;
```

**Steps to complete:**
- [x] Run SQL above in Supabase (confirmed 27 Mar)
- [ ] Update `job-items-table.tsx` bespoke dialog: add "Copy from this job" section at top
  - Query `tbl_job_items` WHERE `job_id = currentJobId` AND `scope_item_id != currentScopeId` AND `item_source = 'bespoke'`
  - Show matching items with scope name, description, finish, quantity
  - Click item → pre-fills description, finish_required, notes fields
  - `source_item_id` set to original item's `item_id`
  - Quantity left editable (main thing that changes between scopes)
- [ ] In job items list: show small link icon on items with `source_item_id` — "Same as {original scope name}"
- [ ] Optional: when original item gets "promoted to stock", consider auto-updating linked items' `stock_item_id`

### New/Modified Files (Session 13)
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/capacity/page.tsx` | General workshop booking supply fix |
| `src/components/job-items-table.tsx` | Multi-WO selection enabled |
| `src/app/api/extract-cutlist/route.ts` | PDF beta header, simplified prompt, robust JSON parsing |
| `src/app/api/extract-invoice/route.ts` | PDF beta header, robust JSON parsing |
| `src/components/cutlist-extractor.tsx` | Full rewrite: guillotine bin packing, deterministic math |
| `src/components/pm-queries-panel.tsx` | Scope-level PM queries with edit + photos |
| `src/components/pm-queries-job-panel.tsx` | Job-level query aggregation + share |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | PM queries panel wired in |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | PM queries job panel wired in |

### SQL Run (Session 13)
- `tbl_pm_queries`: New table with RLS policies + indexes
- `tbl_pm_queries.photo_url`: TEXT column for base64 images

### Database Tables (now 35)
Previous (34) + Added: tbl_pm_queries

### Conventions Added (Session 13)
- **Cut list extraction**: Claude extracts parts only. ALL math (sheet counting, timber lengths) done client-side in JS
- **Sheet calculation**: 2D guillotine bin packing — never area-based division (see memory: "Area-based sheet calculation is invalid")
- **Timber BOM**: qty = number of standard lengths, unit = "Length", unit_cost = price_per_metre × standard_length_in_metres
- **PDF API calls**: Always include `anthropic-beta: pdfs-2024-09-25` header when sending PDF documents
- **JSON parse hardening**: Always use first-brace/last-brace fallback when parsing Claude API responses


### Session 14 (30 Mar 2026) — Maintenance System, Workshop UX, Cost Tracking Fixes
12 commits. Major new feature: full maintenance system (desktop + mobile). Multiple Workshop page improvements. Cost tracking debugging.

#### Copy Bespoke Item from Same Job ✅
- [x] Bespoke dialog: collapsed "Copy from another scope (N)" link at top, expands on click
- [x] Click item → pre-fills description, finish_required, quantity, sets `source_item_id`
- [x] Link badge: "Same as {scope name}" with Link2 icon, two-hop scope name resolution
- [x] Falls back to "Linked" if scope name can't be resolved, full name in tooltip

#### Maintenance System ✅ (NEW)
6 new tables, 2 views, desktop page, mobile page with timer.

**Database:**
- `tbl_maintenance_assets`: name, location, description, photo_onedrive_path, active
- `tbl_maintenance_tasks`: asset_id FK, description, instructions, frequency (daily/weekly/fortnightly/monthly/quarterly/annually/as_needed), day_of_week, estimated_minutes, sort_order
- `tbl_maintenance_logs`: asset_id FK, performed_by, work_order_id (nullable), started_at, completed_at, status, notes
- `tbl_maintenance_checks`: log_id FK, task_id FK, completed_at, note, flagged, completed_by
- `tbl_maintenance_flags`: asset_id FK, check_id (nullable), raised_by, severity (info/warning/urgent), title, description, photo_onedrive_path, status (open/acknowledged/resolved), resolution_notes
- `tbl_maintenance_asset_photos`: asset_id FK, onedrive_path, file_name, caption, sort_order, uploaded_by
- `qry_maintenance_task_status`: per-task due status (overdue/due_soon/done/no_schedule) derived from last completion + frequency
- `qry_maintenance_asset_summary`: per-asset health (worst-case of tasks), task count, open flags, last maintained
- MAINTENANCE_FREQUENCY values added to `tbl_master_lookups`
- RLS: all tables readable by everyone, assets/tasks modifiable by PM/admin/foreman, logs/checks/flags modifiable by everyone

**Desktop `/maintenance`:**
- [x] Asset cards with RAG health dots (overdue/due soon/OK), open flags badge, task count, last maintained
- [x] Summary bar: total assets, overdue count, due soon count, open flags
- [x] Click to expand with 4 tabs: Checklist, Photos, History, Flags
- [x] Checklist tab: tasks with frequency, due status, last completed, add/remove tasks
- [x] Photos tab: OneDrive upload, grid display, editable captions, delete
- [x] History tab: maintenance sessions with who, when, checks ticked, flags raised
- [x] Flags tab: severity icons, acknowledge → resolve workflow with resolution notes
- [x] Add Asset dialog, Edit/Archive asset inline
- [x] Wrench icon in sidebar

**Mobile `/m/maintenance`:**
- [x] Wrench icon as 5th tab in bottom nav (Tasks, Schedule, Maint., Photos, Me)
- [x] Asset list sorted by urgency: overdue first, then due soon, then OK
- [x] Tap asset → Pre-start screen: asset info, reference photos, task preview, "Start Maintenance" button
- [x] Active session: live timer (MM:SS), progress bar, tick items line by line
- [x] Per-item duration derived from tick timestamps (time since previous tick)
- [x] Optional note per item, flag button per item with severity selector
- [x] "Complete Maintenance" button shows checked count + elapsed time
- [x] Flagged items → PM notification via `notify()`

#### Auto-Close Open Tasks on WO Start ✅
- [x] `handleStart` and `handleJoin` in mobile WO detail now auto-close any open `tbl_tasks` (in_progress) for that freelancer
- [x] Hours calculated from elapsed time (rounded to 0.5h, min 0.5h), status set to pending
- [x] Toast confirms: "Auto-logged Xh for '{task title}'"
- [x] Closed task goes to review inbox

#### Workshop Page Improvements ✅
- [x] **Active Tasks panel**: shows all in-progress ad-hoc tasks from `tbl_tasks` (not linked to WOs)
- [x] **PM Stop button**: inline form per task — hours override (pre-filled from elapsed) + reason (required) + Stop
- [x] **Workers banner enhanced**: shows WHO is on WHAT — person → WO activity + scope (blue arrow) or task title + category badge (amber arrow), with start time
- [x] **WOs grouped by job**: Job header (number, name, WO done count, active count, days remaining) → scope groups within each job. Jobs sorted by event date nearest first
- [x] Realtime subscription includes `tbl_tasks`

#### Traveller Timber Qty Fix ✅
- [x] BOM now stores unit="Length" (Session 13 convention). Traveller had old conversion logic dividing lengths by standard_length_mm → showed 0
- [x] Fix: if unit is already "Length"/"Lengths", pass through qty directly. Legacy metre-based records still convert correctly

#### 3D Model Viewer Lighting ✅
- [x] HDR environment via Three.js `RoomEnvironment` (procedural studio, no file download)
- [x] SketchUp material fix: metalness reset to 0, roughness to 0.85, envMapIntensity 0.6
- [x] Green background (#4a6741) for white model contrast
- [x] Key + fill directional lights for readable shadows
- [x] Tone mapping exposure 0.7 (prevents blown-out whites)

#### Review Page Cost Fixes ✅
- [x] NaN in summary cards fixed: null-safe reduces with `|| 0`
- [x] Job Costs field mapping: interface accepts both view column names (`quote_total`, `labour_cost`) and legacy aliases
- [x] Helper functions `getQuote()`, `getLabour()`, `getMaterial()`, `getTotal()`, `getMargin()` resolve whichever field name the RPC returns
- [x] Workshop Overhead panel: expandable section showing non-job tasks (general, maintenance, other) with person, hours, rate, cost
- [x] "Workshop Overhead" summary card in amber
- [x] "Loading scope items..." stuck message → "No scope item cost data for this line"
- [x] `qry_cost_waterfall` view recreated (was dropped in Session 12 cleanup)

#### Cost Issues Resolved ✅ (Session 15)
- [x] `qry_quoteline_margin` was missing `WHERE archived_at IS NULL` — archived test time entry inflated Rocket frame labour by £35 (£305 instead of £270)
- [x] `qry_quoteline_margin` was missing 'Stock Pick' category — Stock Pick lines excluded from per-line margin table
- [x] Both `qry_quoteline_margin` and `qry_job_quote_margin` recreated with `security_invoker = true` and archived filter
- [x] Review page scope expansion rewired from `qry_scopeitem_cost_summary` (old view chain, returning nulls) to `qry_cost_waterfall`
- [x] Cost waterfall verified working on Chelsea In Bloom — numbers match scope page

### Session 15: Financial Visibility & UX Polish (31 Mar 2026)

#### Review Page Overhaul ✅
- [x] Scope expansion: switched from `qry_scopeitem_cost_summary` to `qry_cost_waterfall` — 4-layer waterfall (Quoted → PM Est → WS Est → Actual)
- [x] Job header: replaced 4-col (Quote/Labour/Material/Margin) with 5-col (Quote/WS Quote/Labour/Material/WS Margin)
- [x] WS Quote + WS Margin from `qry_job_quote_margin` — workshop-only numbers for real decision making
- [x] Scope items expandable → WO drill-down with full financials (Est Hrs, Act Hrs, Est Cost, Act Labour, Material, Total)
- [x] Three-level drill: Job → Scope Items (waterfall) → Work Orders (financials) all on one page
- [x] Scope expand chevron: dedicated 40px column with bg highlight, separate from scope name link
- [x] Scope names are links back to scope detail page
- [x] Hours column goes red when actual > estimated (overrun flag)

#### Cost Analysis: Spent vs Committed ✅
- [x] Per-line table redesigned: columns now # / Line / Scopes / Quoted / Spent / Committed / Margin / %
- [x] **Spent** = frozen costs (logged time entries + BOM material costs) — navy text, red bold when overrunning
- [x] **Committed** = `max(Estimated, Spent)` — projected landing cost. Blue with "est" suffix when includes projections
- [x] Margin always calculated against Committed ("where will we land?" number)
- [x] Waterfall sub-rows use same Spent/Committed logic
- [x] Layers grid: "Committed" renamed to "Spent", header bar shows "Spent" instead of "Actual"

#### BOM Unit Toggle (Metre ↔ Length) ✅
- [x] Materials with `standard_length` show a toggle button in Unit column instead of text input
- [x] Click toggles between "Metre" and "Length" — saves to DB immediately
- [x] Length mode: total = qty × (standard_length_mm / 1000) × unit_cost_per_metre
- [x] Subtitle shows conversion: "3 × 4.8m = 14.4m"
- [x] Materials without standard_length keep regular text input (no toggle)
- [x] Applies on scope BOM (scope-bom.tsx). WO BOM uses same data model

#### Drawing Drag-and-Drop Reorder ✅
- [x] Drawing/reference thumbnails in WODocumentsPanel now draggable (HTML5 Drag and Drop API)
- [x] Navy number badges (1, 2, 3...) show print sequence order
- [x] Blue ring highlight on drop target during drag
- [x] Optimistic reorder + persist to `sort_order` in `tbl_wo_documents`
- [x] Traveller already renders drawings in `sort_order` — reorder flows through to print
- [x] Cursor changes to grab/grabbing for discoverability

#### Stock Data Fix ✅
- [x] 7 ali deck stock items had truncated descriptions from original migration ("4 x", "6 x", "8 x")
- [x] Updated: full descriptions, hire costs, weights, locations from stock list PDF

### New/Modified Files (Session 15)
| File | Purpose |
|------|--------|
| `src/app/(dashboard)/review/page.tsx` | WS Quote/Margin cols, scope→WO drill-down, waterfall data source |
| `src/components/cost-breakdown.tsx` | Spent vs Committed columns, renamed layers, waterfall sub-rows |
| `src/components/scope-bom.tsx` | Metre/Length unit toggle with standard_length calc |
| `src/components/wo-documents-panel.tsx` | Drag-drop reorder, position badges, sort_order persist |

### SQL Run (Session 15)
- `qry_quoteline_margin` recreated: added `WHERE archived_at IS NULL`, added 'Stock Pick' category, `security_invoker = true`
- `qry_job_quote_margin` recreated: `security_invoker = true` (dependency of quoteline_margin)
- Stock item updates: 7 ali deck records fixed (descriptions, hire costs, weights)

### Conventions Added (Session 15)
- **Spent vs Committed**: Spent = frozen costs (time entries + ordered/stock materials). Committed = max(Estimated, Spent). Margin always against Committed
- **BOM unit toggle**: materials with `standard_length` can switch Metre↔Length. Length mode: qty × (std_len_mm / 1000) × unit_cost. Stored as unit="Length" in DB
- **Drawing order**: `sort_order` on `tbl_wo_documents` controls traveller print sequence. Drag-drop to reorder
- **Review page data sources**: job headers from `qry_job_quote_margin` (workshop margins), scope expansion from `qry_cost_waterfall`, WO details from direct queries with archived_at filter
- **Always filter archived time entries**: every new query on `tbl_wo_time_entries` MUST include `.is("archived_at", null)` or `WHERE archived_at IS NULL`

### New/Modified Files (Session 14)
| File | Purpose |
|------|--------|
| `src/components/job-items-table.tsx` | Copy bespoke from same job, collapsed section, linked badge |
| `src/components/sidebar.tsx` | Wrench icon, Maintenance nav item |
| `src/app/(dashboard)/maintenance/page.tsx` | Desktop maintenance: assets, checklists, photos, flags, history |
| `src/app/m/maintenance/page.tsx` | Mobile maintenance: timer flow, checklist, flags |
| `src/app/m/layout.tsx` | 5th bottom tab: Maint. |
| `src/app/m/wo/[woId]/page.tsx` | Auto-close open tasks on START/JOIN |
| `src/app/(dashboard)/workshop/page.tsx` | Active tasks panel, PM stop, workers detail, job grouping |
| `src/app/traveller/page.tsx` | Timber qty fix (Length unit pass-through) |
| `src/components/model-viewer.tsx` | HDR environment, material fix, green background |
| `src/app/(dashboard)/review/page.tsx` | NaN fix, field mapping, overhead panel |
| `src/components/cost-breakdown.tsx` | Loading message fix |

### SQL Run (Session 14)
- 6 maintenance tables: assets, tasks, logs, checks, flags, asset_photos
- 2 maintenance views: qry_maintenance_task_status, qry_maintenance_asset_summary
- MAINTENANCE_FREQUENCY lookup values
- RLS policies on all 6 tables
- Indexes on asset_id, log_id, task_id, status
- `qry_cost_waterfall` view recreated

### Database Tables (now 41)
Previous (35) + Added: tbl_maintenance_assets, tbl_maintenance_tasks, tbl_maintenance_logs, tbl_maintenance_checks, tbl_maintenance_flags, tbl_maintenance_asset_photos

### Views (now 37)
Previous (34) + Added: qry_maintenance_task_status, qry_maintenance_asset_summary, qry_cost_waterfall (recreated)

### Conventions Added (Session 14)
- **Maintenance photos**: stored on OneDrive under `Maintenance/{AssetName}/`, multiple per asset with captions
- **Maintenance timer**: freelancer taps Start, ticks items, per-item duration derived from tick timestamps (not manual entry)
- **Auto-close tasks on WO start**: any open `tbl_tasks` entry auto-closes with calculated hours when freelancer starts/joins a WO
- **Workshop overhead costs**: `tbl_tasks` with category workshop_general/maintenance/other are NOT job-linked. They appear in Review page's Workshop Overhead panel, separate from job cost chain
- **Traveller timber unit**: if BOM unit is already "Length"/"Lengths", pass through qty directly (don't re-convert from metres)
- **3D model viewer**: uses RoomEnvironment HDR for SketchUp models. Reset metalness=0, roughness=0.85, envMapIntensity=0.6
- **Cost view column names**: `qry_job_cost_summary` uses `quote_total`, `labour_cost`, `material_cost`, `total_cost`, `margin_pct`. Frontend must accept both these and legacy aliases

### Session 16: Invoice Allocation, Paint Notes, Job Command Centre (31 Mar 2026)

#### Invoice Allocation to Scope Items ✔
- [x] `tbl_invoice_allocations` table: percentage split of invoice lines to scope items
- [x] Inline allocation UI on expanded invoice lines (invoices page)
- [x] Scope item dropdown, percentage input, running total, 100% shortcut
- [x] Green badge when fully allocated, blue for partial
- [x] `qry_invoice_scope_costs` view: aggregated allocated amounts per scope item
- [x] RLS: PM-only access

#### Stock-as-Internal-Cost on BOM ✔
- [x] `from_stock` boolean on `tbl_wo_bom`
- [x] Stock checkbox on scope-bom and WO BOM — auto-clears ordering, auto-fills catalogue price
- [x] Amber "Stock" badge shows for both `stock_item_id` and `from_stock` items
- [x] Cost still counts in all cost views (internal charge, not free)

#### WO BOM Unit Toggle ✔
- [x] `standard_length` added to materials query on WO page
- [x] Length ↔ Metre toggle button on WO BOM (same pattern as scope-bom)
- [x] Length-aware total calculation: qty × (std_len_mm / 1000) × unit_cost
- [x] Conversion subtitle: "3 × 4.8m = 14.4m"

#### Job Page: Invoices & Orders Panels ✔
- [x] `<JobInvoicesPanel>` — job’s invoices with expandable lines + allocation controls
- [x] `<JobOrdersPanel>` — outstanding (amber) + ordered (green) BOM items for job
- [x] Side-by-side 2-column grid on desktop, stacked on mobile
- [x] Both auto-hide when job has no data, link to full pages

#### Editable Complexity & Finish on Scope ✔
- [x] Complexity and Finish now editable dropdowns on scope detail page (were read-only)
- [x] Finish categories renamed everywhere: Raw / Good / Spotlight
- [x] Old values migrated via SQL UPDATE on tbl_scope_items + tbl_work_orders
- [x] Create WO dialog updated to match

#### Paint Notes System ✔
- [x] `paint_notes` TEXT column on `tbl_work_orders`
- [x] WO detail (desktop): collapsible Painting section with free-text textarea
- [x] Amber paintbrush icon on WO rows with paint notes
- [x] Workshop page: "Painting" filter (amber) shows WOs needing painting
- [x] Workshop: paint notes expanded inline in painting filter mode
- [x] Mobile task list: Painting filter button + paint notes on cards
- [x] Mobile WO detail: amber Painting section displayed prominently
- [x] Traveller: amber "🎨 Painting" section between description and BOM

#### Time Logging on Complete WOs ✔
- [x] Mobile WO detail: "LOG TIME" button on Complete WOs (JOIN without status change)
- [x] Mobile task list: Complete WOs from active jobs shown in Done filter
- [x] "Built" green badge on Complete WO cards
- [x] Enables painting, packing, touch-up work after build completion

#### Mobile Task Filters ✔
- [x] Four filters: All | My Tasks | Done | Painting
- [x] Done filter loads Complete WOs from all non-Closed jobs (not just ones with active WOs)
- [x] Painting filter shows all WOs with paint_notes regardless of status
- [x] Complete WOs excluded from All/My Tasks counts

#### Completion Photo Visibility ✔
- [x] Mobile WO detail: completion photo loaded from OneDrive, displayed with green label
- [x] Desktop WO detail: completion photo in expanded panel (loads on expand)
- [x] Review page: new "Completed" tab with photo grid grouped by job
- [x] Photos load progressively from OneDrive, cards link to WO pages

#### PM Timer Stop on Crew Page ✔
- [x] Active Timer banner on freelancer detail page for open WO time entries
- [x] Live elapsed time + task context (activity, scope, job)
- [x] Stop & Override: PM sets hours + mandatory reason
- [x] Flag note auto-prefixed with "PM override:" for audit trail
- [x] Cost calculated from freelancer's day rate

#### Stock Data ✔
- [x] 15 steel deck items added (product codes 1744-2903) from stock list PDF

### New/Modified Files (Session 16)
| File | Purpose |
|------|--------|
| `src/components/job-invoices-panel.tsx` | NEW: Job-level invoice view with allocation controls |
| `src/components/job-orders-panel.tsx` | NEW: Job-level orders view (outstanding + ordered) |
| `src/components/completed-work-tab.tsx` | NEW: Completed work photo grid for review page |
| `src/components/scope-bom.tsx` | Stock checkbox column, from_stock badge |
| `src/app/(dashboard)/invoices/page.tsx` | Allocation UI on expanded lines, Split icon, handlers |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | Import JobInvoicesPanel + JobOrdersPanel, 2-col grid |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | Editable complexity/finish dropdowns |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/wo/page.tsx` | Unit toggle, stock checkbox, paint notes, completion photo |
| `src/app/(dashboard)/workshop/page.tsx` | Painting filter, paint icon on cards, paint_notes in enrichment |
| `src/app/(dashboard)/review/page.tsx` | Completed tab |
| `src/app/(dashboard)/crew/[id]/page.tsx` | Active timer banner, PM stop/override |
| `src/app/m/page.tsx` | Painting + Done filters, paint icon, Complete WO loading |
| `src/app/m/wo/[woId]/page.tsx` | Paint notes, completion photo, LOG TIME on Complete WOs |
| `src/app/traveller/page.tsx` | Paint notes section (amber) |
| `src/lib/types.ts` | from_stock on WoBom |
| `src/components/create-wo-dialog.tsx` | Finish options: Raw/Good/Spotlight |

### SQL Run (Session 16)
- `ALTER TABLE tbl_wo_bom ADD COLUMN from_stock BOOLEAN DEFAULT FALSE`
- `ALTER TABLE tbl_work_orders ADD COLUMN paint_notes TEXT`
- `CREATE TABLE tbl_invoice_allocations` with RLS, indexes, updated_at trigger
- `CREATE VIEW qry_invoice_scope_costs` (security_invoker)
- Finish value migration: 6 UPDATE statements on scope_items + work_orders
- 15 steel deck stock items inserted

### Database Tables (now 42)
Previous (41) + Added: tbl_invoice_allocations

### Views (now 38)
Previous (37) + Added: qry_invoice_scope_costs

### Conventions Added (Session 16)
- **Invoice allocation**: percentage split per invoice line to scope items. Sum ≤ 100% per line. `allocated_amount = line_total × percentage / 100`
- **from_stock on BOM**: tick = internal stock charge. Auto-clears ordering, auto-fills catalogue price. Cost still counts everywhere
- **Finish categories**: Raw (easiest) / Good (standard) / Spotlight (highest). Replaces old Suits-the-form / Neutral / Harder-than-construction-warrants
- **Paint notes**: free text on WOs. Presence = WO needs painting. Surfaces on: WO detail, workshop (filter), mobile (filter + detail), traveller (print)
- **Time logging on Complete WOs**: JOIN/LOG TIME allowed. Status stays Complete. Enables post-build painting/packing/touch-ups
- **PM timer stop**: from crew/freelancer detail page. Requires reason. Flag note prefixed "PM override:"
- **ON CONFLICT requires unique constraint**: always verify unique constraints exist before using ON CONFLICT in SQL. `tbl_stock_items.product_code` has NO unique constraint — use plain INSERT

### Session 17: UX Polish & Prompt Engine (1 Apr 2026)

#### PM Timer Stop from Workshop Page ✔
- [x] Stop button (□) on each active WO worker in the blue "currently working" banner
- [x] Inline form: hours input + mandatory reason, same pattern as crew/[id] and task stop
- [x] `auditedUpdate` with "PM override:" flag prefix for audit trail
- [x] Freelancer rate queried on demand (not cached) for accurate cost calculation
- [x] Direct `tbl_wo_time_entries` query guarantees `entry_id` availability (RPC may not return it)

#### Recent Jobs Navigation Strip ✔
- [x] `useJobHistory` hook + `sessionStorage` tracking (up to 5 jobs, session-scoped)
- [x] `<RecentJobsStrip>` component in dashboard layout — shows on all non-job pages
- [x] Chips: job number + name + last scope visited, deeplinks to last page
- [x] `recordJobVisit()` called from job detail, scope breakdown, and WO pages
- [x] Scope-level recording: chip points to scope/WO page, not just job
- [x] Hidden when already on a job page (no point showing it there)
- [x] Custom event dispatch (`jobhistory`) for cross-component reactivity

#### Cost Analysis Auto-Refresh ✔
- [x] `refreshKey` prop on `<CostBreakdown>` component
- [x] WO page: `bumpCost()` triggers refresh after: estimated hours change, BOM add/edit/delete
- [x] No polling, no performance hit — single re-query only when data changes

#### Finish Categories Fix ✔
- [x] Create Scope dialog: replaced LookupCombo (category `FINISH_RELATIVE`) with hardcoded Raw/Good/Spotlight
- [x] `tbl_master_lookups` FINISH_RELATIVE values updated via SQL (old → new)

#### Typical Components Admin UI ✔
- [x] New "Typical Components" tab in Settings page
- [x] Category selector dropdown
- [x] Guidance note: free-text per category, saves on blur, shown on scope pages
- [x] Add from Stock: search stock catalogue, one-click add as stock-linked prompt
- [x] Add Bespoke: description + default quantity + type (Bespoke/Stock-Needs-Work)
- [x] Reorder with up/down arrows, delete with hover trash
- [x] `stock_item_id` + `quantity_default` on `tbl_category_prompts`
- [x] `guidance_note` on `tbl_scope_item_categories`
- [x] Prompt panel: shows guidance note, stock items create stock-linked job items on click

### New/Modified Files (Session 17)
| File | Purpose |
|------|--------|
| `src/lib/job-history.ts` | NEW: sessionStorage job visit tracking hook |
| `src/components/recent-jobs-strip.tsx` | NEW: Recent jobs chip strip for quick nav |
| `src/components/typical-components-editor.tsx` | NEW: Full CRUD for category prompts in Settings |
| `src/components/prompt-panel.tsx` | Stock-linked prompts, guidance note display |
| `src/components/cost-breakdown.tsx` | refreshKey prop for on-demand refresh |
| `src/components/create-scope-dialog.tsx` | Hardcoded Raw/Good/Spotlight finish dropdown |
| `src/app/(dashboard)/layout.tsx` | RecentJobsStrip added |
| `src/app/(dashboard)/settings/page.tsx` | Typical Components tab |
| `src/app/(dashboard)/workshop/page.tsx` | PM stop on WO timers, entry_id guarantee |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | recordJobVisit, import job-history |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | recordJobVisit, stock-linked prompt handler |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/wo/page.tsx` | recordJobVisit, bumpCost on all handlers |

### SQL to Run (Session 17)
```sql
ALTER TABLE tbl_scope_item_categories ADD COLUMN IF NOT EXISTS guidance_note TEXT;
ALTER TABLE tbl_category_prompts ADD COLUMN IF NOT EXISTS stock_item_id INTEGER REFERENCES tbl_stock_items(stock_id);
ALTER TABLE tbl_category_prompts ADD COLUMN IF NOT EXISTS quantity_default INTEGER;
UPDATE tbl_master_lookups SET lookup_value = 'Raw' WHERE category = 'FINISH_RELATIVE' AND lookup_value = 'Suits-the-form';
UPDATE tbl_master_lookups SET lookup_value = 'Good' WHERE category = 'FINISH_RELATIVE' AND lookup_value = 'Neutral';
UPDATE tbl_master_lookups SET lookup_value = 'Spotlight' WHERE category = 'FINISH_RELATIVE' AND lookup_value = 'Harder-than-warrants';
```

### Session 18: Dark Theme + BOM Cost Fix (2 Apr 2026)

#### Dark Theme Migration (Option B — Full Token System) ✔
- [x] New palette: base #0c0d14, surface tiers (#111219/#171820/#1d1e27/#23242e/#2a2c34)
- [x] Brand colours from logo: steel blue #7BA4D4 (primary), dusty rose #D47BA0 (accent)
- [x] Status colours for dark bg: red #ff716c, green #4ade80, amber #fbbf24
- [x] Semantic tokens in tailwind.config.ts: base, surface/dim/mid/hi/top/bright, foreground, muted, faint, subtle, starlight.pink
- [x] Batch-replaced 2875 color refs across 64 files (bg-white→bg-surface, text-gray→text-muted, etc.)
- [x] Sidebar: bg-base, brand-blue active highlights, pink notification badge
- [x] Login pages: bg-base (were bg-navy)
- [x] Global dark input styling (bg-surface-mid, text-foreground, inverted number spinners)
- [x] Traveller print CSS hardened: forces dark-on-white for all .traveller-page content
- [x] Phase pills and print styles preserved

#### BOM Cost Double-Counting Fix ✔
- [x] **Root cause**: bomRowTotal in wo/page.tsx and scope-bom.tsx multiplied by stdLen when unit_cost was already per-length (from cut list extraction). Result: 39 × 4.8 × £8.40 = £1,572.48 instead of 39 × £8.40 = £327.60
- [x] **Fix**: total = qty × unit_cost (always). No special Length-mode multiplication. Matches SQL views
- [x] **Toggle converts both values**: Metre→Length converts qty and cost. Length→Metre reverses. Total stays constant
- [x] **Subtitle enhanced**: Length mode shows per-metre reference (e.g. "£1.75/m")
- [x] Fixed in both wo/page.tsx and scope-bom.tsx

#### Traveller Print Preview ✔
- [x] `.traveller-page` forced light on screen (not just @media print)
- [x] All surface tokens mapped to white/light-gray inside traveller
- [x] Text tokens mapped to dark equivalents (foreground→#1A1A2E, muted→#555)
- [x] BOM table header, task description, painting notes all readable

#### Scope BOM: Stock/Order Checkboxes ✔
- [x] Order checkbox added to scope-bom.tsx (was missing, WO page had it)
- [x] Stock + Order checkboxes added to material rows in job-items-table.tsx
- [x] Stock check auto-clears Order; Order disabled when Stock checked
- [x] Badge flips Material→Stock (amber) based on from_stock state
- [x] from_stock + needs_ordering fetched in BOM query

#### Auto-tick Removed / Default Filter ✔
- [x] Auto-tick logic (`isAutoComplete`) deleted entirely
- [x] Done = manual only (`interpretation_complete` field)
- [x] New "To Do" filter: workshop categories not yet marked done (default on page load)
- [x] Filter order: To Do | Workshop | Provisional | Subcontracted | Done | By Zone | All

#### Install (Materials) Category ✔
- [x] New category: "Install (Materials)" — install items that need materials/prep
- [x] Plain "Install" changed: no scope creation, no amber highlight, not in To Do
- [x] "Install (Materials)": scope creation, amber, appears in To Do filter
- [x] SQL: new QUOTE_LINE_CATEGORY lookup value needed

#### Crew Page: Time Entry Timestamps ✔
- [x] Start → end times shown below date (e.g. "09:15 → 13:30")
- [x] Open entries show start time only

#### Mobile: Auto-Stop Open WO Entries ✔
- [x] `autoStopOpenEntries()` on START and JOIN
- [x] Stops open time entries on OTHER work orders for same freelancer
- [x] Hours = elapsed rounded to 0.5h, costed at day rate
- [x] Flag note: "Auto-stopped: started another WO"
- [x] Ad-hoc tasks still auto-closed separately

#### Scope Column Repositioned ✔
- [x] Scope icon moved between Value and PM Est columns
- [x] Named "Scope" column header
- [x] Icons bumped to h-5 w-5 (was h-4 w-4)
- [x] Delete button moved to own slim column at end

#### WO Page: Job Overview Link ✔
- [x] "Job Overview" link added next to "Back to Scope Item"
- [x] Separated by | divider

#### Orders Panel: Scope Names on All Items ✔
- [x] Resolves scope names through two paths: direct scope_item_id OR work_order_id → scope
- [x] All order items now show scope context

### New/Modified Files (Session 18)
| File | Purpose |
|------|--------|
| `tailwind.config.ts` | Dark theme token system |
| `src/app/globals.css` | Dark body, inputs, traveller light override, spinner fix |
| `src/components/sidebar.tsx` | Full rewrite for dark theme |
| `src/components/floating-action-button.tsx` | text-base on amber button |
| `src/app/login/page.tsx` | bg-base |
| `src/app/m/login/page.tsx` | bg-base |
| `src/app/traveller/page.tsx` | Toolbar bg-base, print button contrast |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | Auto-tick removed, To Do filter, Install (Materials), Scope column repositioned |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/wo/page.tsx` | BOM cost fix, smart toggle, Job Overview link |
| `src/components/scope-bom.tsx` | BOM cost fix, smart toggle, Order checkbox |
| `src/components/job-items-table.tsx` | Stock/Order checkboxes on material rows |
| `src/components/job-orders-panel.tsx` | Scope name resolution via WO chain |
| `src/app/(dashboard)/crew/[id]/page.tsx` | Time entry timestamps |
| `src/app/m/wo/[woId]/page.tsx` | Auto-stop open WO entries on START/JOIN |
| 64 .tsx files | Batch color token migration |

### SQL to Run (Session 18)
```sql
INSERT INTO tbl_master_lookups (category, lookup_value, sort_order)
SELECT 'QUOTE_LINE_CATEGORY', 'Install (Materials)', COALESCE(MAX(sort_order), 0) + 1
FROM tbl_master_lookups
WHERE category = 'QUOTE_LINE_CATEGORY';
```

### Conventions Added (Session 18)
- **unit_cost is ALWAYS per-unit**: total = qty × unit_cost regardless of unit field. No stdLen multiplication in JS
- **Toggle converts both qty AND unit_cost**: total stays constant across modes
- **Dark theme tokens**: bg-surface (cards), bg-base (page), text-foreground (primary), text-muted (secondary), text-faint (tertiary), border-subtle
- **Print pages stay light**: .traveller-page forced light on screen AND print via CSS overrides in globals.css
- **Number input spinners**: `filter: invert(0.7)` on ::-webkit-inner/outer-spin-button for dark mode
- **Done = manual only**: no auto-tick. `isDone()` checks only `interpretation_complete`
- **Default filter is To Do**: workshop categories not yet done. "All" is last
- **Install vs Install (Materials)**: plain Install = no prep needed. Install (Materials) = needs scope/ordering
- **Auto-stop WO entries**: when freelancer START/JOIN a new WO, open entries on other WOs auto-stop with elapsed hours + flag note
- **Orders panel scope resolution**: resolves through `scope_item_id` directly OR `work_order_id` → `tbl_work_orders.scope_item_id`

### Conventions Added (Session 17)
- **Recent jobs strip**: `sessionStorage`-based, session-scoped. `recordJobVisit()` from job/scope/WO pages. Strip hidden on job pages
- **Cost analysis refresh**: use `refreshKey` prop on `<CostBreakdown>`. Increment after any cost-affecting change (hours, BOM). No polling
- **Finish dropdown**: hardcoded Raw/Good/Spotlight in create-scope-dialog and create-wo-dialog. LookupCombo category is `FINISH_RELATIVE` (not `FINISH`)
- **Prompt engine stock linking**: `stock_item_id` on `tbl_category_prompts`. When set, clicking + creates stock-linked job item with `item_source='stock'`
- **PM timer stop locations**: crew/[id] page, Workshop active workers banner, ad-hoc tasks panel. All use same pattern: hours + reason + "PM override:" flag

#### Prompt Engine Grouping ✔
- [x] `prompt_group` TEXT on `tbl_category_prompts`
- [x] Settings editor: group picker on add forms (existing groups dropdown + "New group")
- [x] Settings editor: items rendered in group sections with hover-to-change-group
- [x] Scope pages: groups as collapsible sections with item counts
- [x] Ungrouped items shown at top level

#### Unified Job Items & Materials ✔
- [x] `job_item_id` FK on `tbl_wo_bom` — pairs BOM rows with stock job items
- [x] Stock items auto-create paired BOM row with hire_cost_day as unit_cost
- [x] Cost column on stock items shows qty × hire cost (flows through BOM to all cost views)
- [x] Quantity sync: changing stock item qty updates paired BOM row
- [x] Deleting stock item also deletes paired BOM row
- [x] "+ Add Material" button with inline catalogue search
- [x] Material-only BOM rows rendered below items with grey Material badge
- [x] Bespoke items show "via WO" in cost column
- [x] ScopeBom section removed from scope page (absorbed into unified list)
- [x] Prompt engine stock items also create paired BOM rows
- [x] **Zero cost queries changed** — all costs still flow through tbl_wo_bom

### SQL Run (Session 17)
```sql
ALTER TABLE tbl_scope_item_categories ADD COLUMN IF NOT EXISTS guidance_note TEXT;
ALTER TABLE tbl_category_prompts ADD COLUMN IF NOT EXISTS stock_item_id INTEGER REFERENCES tbl_stock_items(stock_id);
ALTER TABLE tbl_category_prompts ADD COLUMN IF NOT EXISTS quantity_default INTEGER;
ALTER TABLE tbl_category_prompts ADD COLUMN IF NOT EXISTS prompt_group TEXT;
ALTER TABLE tbl_wo_bom ADD COLUMN IF NOT EXISTS job_item_id INTEGER REFERENCES tbl_job_items(item_id);
CREATE INDEX IF NOT EXISTS idx_wo_bom_job_item ON tbl_wo_bom(job_item_id) WHERE job_item_id IS NOT NULL;
UPDATE tbl_master_lookups SET lookup_value = 'Raw' WHERE category = 'FINISH_RELATIVE' AND lookup_value = 'Suits-the-form';
UPDATE tbl_master_lookups SET lookup_value = 'Good' WHERE category = 'FINISH_RELATIVE' AND lookup_value = 'Neutral';
UPDATE tbl_master_lookups SET lookup_value = 'Spotlight' WHERE category = 'FINISH_RELATIVE' AND lookup_value = 'Harder-than-warrants';
```


### Session 19 (3 Apr 2026) — Scope Page Unification + Performance Overhaul
~12 commits. Major scope page restructure + database performance cleanup.

#### Dark Theme Fixes
- [x] `color-scheme: dark` on `:root`, `color-scheme: light` on `.traveller-page` — fixes native scrollbar arrows, select arrows, resize handles
- [x] Description textarea doubled from `rows={2}` to `rows={4}`

#### Scope Page Unification — WO-Centric Build Plan ✔
Merged separate Work Orders page into scope page. Everything on one screen.
- [x] Created `WorkOrdersPanel` component (~900 lines) — self-contained WO list, expand/collapse, BOM editing, void/material dialogs
- [x] `/wo` route converted to redirect (preserves bookmarks/browser history)
- [x] Updated 3 external links (job detail, workshop, completed-work-tab) → scope page with `?expand={woId}`
- [x] Auto-expand WO from `?expand=` query param
- [x] WO creation from scope → auto-expands new WO in panel (no navigation)
- [x] `CreateWODialog` returns `workOrderId` to parent for expansion

#### Option A: WO-Centric Unified Layout ✔
- [x] **Unlinked Items** section at top (amber warning) — items not assigned to any WO, with selection checkboxes + "Create WO" button
- [x] **WO list with color-coded item chips** — 6-color palette (blue, green, amber, purple, rose, cyan), items shown as pills on collapsed WO rows
- [x] **Consolidated Materials** panel at bottom — expandable, groups by WO with color-matched chips, grand total
- [x] Colored left borders on WO cards matching palette

#### Left Column: Job Items Panel ✔
- [x] Rich editable cards replacing old compact inventory
- [x] Row 1: Stock/Bespoke badge + description + stock reference + WO color dots
- [x] Row 2: Editable quantity + editable finish field
- [x] Row 3: Editable notes + clickable "→ STOCK" promote toggle + delete button
- [x] `updateJobItem` and `deleteJobItem` exposed via panel ref
- [x] Prompt Panel stays below for quick item addition

#### Frontend Performance ✔
- [x] `tbl_jobitem_workorder` query: fetched ALL rows → now filtered by WO IDs server-side
- [x] Activities + BOM + junctions: sequential → parallel (phase 2 depends on WO IDs from phase 1)
- [x] Two separate lookup queries → single combined query
- [x] BOM query split: scope-level (by scope_item_id) + WO-level (by work_order_id IN) — catches older rows without scope_item_id
- [x] Total round-trips: ~10 sequential → 4 parallel + 4 parallel + 1 = faster

#### Database Performance ✔
- [x] **RLS consolidation**: 533 warnings → 12 intentional. Dropped ~150 overlapping policies, created ~120 clean ones (1 per table/action). Pattern: `TO authenticated` with `get_my_role()` CASE expressions
- [x] **Duplicate indexes dropped**: `idx_schedule_date`, `idx_schedule_freelancer_date`, `idx_quotelines_job`, `idx_scope_job`
- [x] **Function search_path**: fixed on all 12 functions (`SET search_path = public`)
- [x] **38 FK indexes added**: covering all unindexed foreign keys flagged by Supabase advisor
- [x] **Leaked password protection**: enabled in Supabase Auth settings

### New/Modified Files (Session 19)
| File | Purpose |
|------|--------|
| `src/components/work-orders-panel.tsx` | Complete rewrite — unified WO + items + BOM panel with color coding |
| `src/components/create-wo-dialog.tsx` | Returns `workOrderId` to parent |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | Unified layout: Job Items panel + Build Plan |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/wo/page.tsx` | Converted to redirect |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | WO links → scope page with `?expand=` |
| `src/app/(dashboard)/workshop/page.tsx` | WO link → scope page with `?expand=` |
| `src/components/completed-work-tab.tsx` | WO link → scope page with `?expand=` |
| `src/app/globals.css` | `color-scheme: dark/light`, description rows |
| `sql/rls-consolidation-drop.sql` | DROP all old overlapping policies |
| `sql/rls-consolidation-create.sql` | CREATE clean consolidated policies |

### SQL Run (Session 19)
```sql
-- RLS: Drop ~150 overlapping policies (rls-consolidation-drop.sql)
-- RLS: Create ~120 clean policies (rls-consolidation-create.sql)
-- Function search_path: 12 ALTER FUNCTION ... SET search_path = public
-- Duplicate indexes: DROP 4 duplicate indexes
-- FK indexes: CREATE 38 indexes on unindexed foreign keys
-- Leaked password protection: enabled via dashboard
```

### Conventions Added (Session 19)
- **WO color palette**: 6 colors cycle: blue, green, amber, purple, rose, cyan. Assigned by WO sequence index. Used for item chips, left borders, consolidated BOM tags, and inventory dots
- **Scope page layout**: Left col (1/4) = Job Items + Prompt Panel. Right col (3/4) = Build Plan (unlinked items → WO cards → All Materials)
- **Panel ref pattern**: `WorkOrdersPanelRef` exposes `refresh()`, `expandWO(id)`, `updateJobItem()`, `deleteJobItem()` for parent coordination
- **Inventory callback**: `onInventoryUpdate` prop pushes items/junctions/colorMap to parent for left-column rendering
- **BOM query pattern**: scope-level rows by `scope_item_id` + WO rows by `work_order_id IN (ids)` — handles older rows without `scope_item_id`
- **RLS policy pattern**: ONE policy per (table, action). `TO authenticated` with `get_my_role()` CASE for role filtering. No `{public}` role policies
- **Promote toggle**: `notes = "PROMOTE_TO_STOCK"` flag, clickable on all bespoke items. Shows as green "→ STOCK" button


### Session 20 (7 Apr 2026) — Material Categories Config, Cut List Override, Scope Material Dialog

7 commits. Material category behaviour made configurable from Settings UI. Cut list material matching now supports manual override before BOM commit. Scope material add redesigned as two-step dialog with unit/qty/cost preview and m² conversion.

#### UI Polish
- [x] Settings audit log: container widens to `max-w-6xl` on audit tab so Revert column isn't clipped
- [x] Number input spinners: `opacity: 0.4` replaces `filter: invert(0.7)` — arrows no longer glare white on dark theme
- [x] Left panel Job Items: qty/finish/notes inputs sync when changed from Build Plan (key-based remount for uncontrolled inputs)
- [x] WO description: full-width resizable textarea (was single-line input squeezed into 6-col grid). `resize-y`, `min-h-[60px]`, `rows={2}`. Collapsed header no longer truncates description

#### Cut List Material Override ✅
- [x] Each material row in "Materials to Order" has ⇄ swap button
- [x] Inline catalogue search dropdown — sorted by name similarity, shows dimensions + unit cost
- [x] Match status: "✓ matched", strikethrough old name on override, "no match — click ⇄" prompt
- [x] Swap triggers bin packing recalculation (1D/2D) with new material's standard dimensions
- [x] `addToBom` uses `_catalogueMatch` override for material_id, unit_cost, and BOM description
- [x] `CatalogueMat` interface added to `cutlist-extractor.tsx`

#### Material Category Config ✅
- [x] New table `tbl_material_category_config`: category_id FK, pricing_unit, buying_unit, fixed_dimension, bin_pack_mode, notes
- [x] "Floor Covering" added to MATERIAL_CATEGORY lookups
- [x] "M²" and "Linear Metre" added to UNIT lookups
- [x] Config seeded for all existing categories (Timber→metre/length/1d, Sheet→sheet/sheet/2d, Floor Covering→m²/linear metre/area, etc.)
- [x] Settings → Material Categories tab: configurable dropdowns per category (supplier prices in / you buy in / fixed dimension / cut list packing)
- [x] Add/delete categories from Settings UI. Delete blocked if materials exist in category
- [x] Conversion preview shown when pricing_unit ≠ buying_unit
- [x] `standard_width` column added to `tbl_materials` (roll/bolt width for floor covering, fabric)
- [x] Materials page: "Roll / Bolt Dimensions" section appears for Floor Covering / Fabric categories
- [x] `Material` interface in `types.ts` updated with `standard_width`
- [x] RLS: read all authenticated, write PM/admin only

#### Scope Material Add — Two-Step Dialog ✅
- [x] Step 1: search and pick material from catalogue (unchanged)
- [x] Step 2: set quantity + unit dropdown, live cost preview panel
- [x] m² → Linear Metre conversion: `cost_per_lm = cost_per_m² × (standard_width / 1000)`
- [x] Shows catalogue price, roll width, converted cost, and total before confirming
- [x] "← Pick different material" back link in step 2
- [x] Scope BOM rows now inline-editable (qty field editable directly in All Materials table)

### New/Modified Files (Session 20)
| File | Purpose |
|------|---------|
| `src/components/material-categories-editor.tsx` | **NEW** — Settings tab for category config CRUD |
| `src/components/cutlist-extractor.tsx` | Material override picker, CatalogueMat interface, swap + recalc |
| `src/components/work-orders-panel.tsx` | Two-step scope material dialog, inline scope BOM edit, standard_width in queries |
| `src/app/(dashboard)/settings/page.tsx` | Material Categories tab, wider container for audit+materials tabs |
| `src/app/(dashboard)/materials/page.tsx` | standard_width in form/save, Roll/Bolt Dimensions section |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | Key-based remount for qty/finish/notes uncontrolled inputs |
| `src/lib/types.ts` | `standard_width` on Material interface |
| `src/app/globals.css` | Number spinner opacity fix |
| `sql/020_material_category_config.sql` | Schema + seed + RLS for category config table |

### SQL Run (Session 20)
```sql
-- sql/020_material_category_config.sql:
-- ALTER TABLE tbl_materials ADD COLUMN standard_width INT
-- CREATE TABLE tbl_material_category_config (config_id, category_id FK, pricing_unit, buying_unit, fixed_dimension, bin_pack_mode, notes, active)
-- INSERT Floor Covering into MATERIAL_CATEGORY lookups
-- INSERT M², Linear Metre into UNIT lookups
-- DO $$ seed config for all existing categories
-- RLS: 4 policies (select/insert/update/delete)
-- INDEX: idx_mat_cat_config_category
```

### Conventions Added (Session 20)
- **Category config pattern**: pricing/buying/packing behaviour per material category stored in `tbl_material_category_config`, not hardcoded. Settings UI for CRUD
- **Cut list override flow**: AI extracts → user reviews materials → swap ⇄ overrides catalogue match → recalculates bin packing → then "Add to BOM" uses override
- **Scope material two-step**: pick → configure (qty/unit/cost preview) → confirm. Never auto-insert with qty=1
- **Unit conversion (m² → linear metre)**: `unit_cost_per_lm = catalogue_cost_per_m² × (standard_width_mm / 1000)`. Applied in scope add dialog and will be used in cut list extractor Phase B
- **Uncontrolled input sync**: When `defaultValue` inputs need to reflect external state changes, add `key` prop including the value (e.g. `key={`qty-${id}-${value}`}`) to force remount


### Session 21 (10 Apr 2026) — Crew Management, Task Workflow, Time Entry Fixes

~10 commits. Crew page polish, task review workflow, time entry editing, mobile task overhaul.

**Crew Page — WhatsApp Invitation:**
- Send icon (↗) added to crew table rows — opens PIN dialog for quick invite
- "WhatsApp" button in PIN dialog — `wa.me` link with pre-filled credentials message (login URL, phone, PIN)
- Same phone cleaning pattern as booking notifications (strip non-digits, leading 0→44)

**Sidebar — Review Inbox Badge:**
- Amber badge on Review nav item showing count of pending tasks + open requests
- Realtime updates via `tbl_tasks` + `tbl_workshop_requests` subscriptions
- Separate from notification bell (pink) — Review badge is amber for visual distinction

**Crew Detail — Pending Tasks Panel:**
- Amber panel above Activity tab shows freelancer's pending tasks needing PM review
- Route to WO / Approve Overhead / Reject actions — same as `/review/inbox`
- Route to WO modal with WO search, hour adjustment, note

**Crew Detail — Ad-hoc Task History:**
- Activity tab now shows reviewed tasks (routed/approved/rejected) below WO entries
- "Ad-hoc Tasks" section with category badge, status badge, job reference, calculated cost
- Inline editing: pencil icon opens hours + title editing
- Archive button: sets task to "rejected" with "Archived by PM" note

**Crew Detail — By Day View:**
- Flat / By Day toggle on Activity tab controls
- Day cards: date, total hours, entry count, daily cost
- Red "OVER Xh" badge when total hours exceed `standard_day_hours`
- Click to expand: shows each WO entry + ad-hoc task with hours, activity, scope, cost
- Unified grouping: WO time entries + reviewed tasks combined by date

**Crew Detail — Add Entry:**
- "+ Add Entry" button in Activity controls opens modal
- Type toggle: WO Time Entry or Ad-hoc Task
- Date picker, hours, WO search or title/category, optional note
- WO entries: sets all 4 timestamps (no phantom timers), no Z suffix (no date shift)
- Ad-hoc tasks: auto-approved as overhead with "PM added manually"

**Crew Detail — Expanded Edit Panel:**
- Pencil icon on any WO time entry opens inline edit row
- Edit: Date, Hours, Flag/Note — all three fields editable at once
- Save commits all changes atomically via `auditedUpdate`

**Mobile `/m/task` — Full Rebuild:**
- **"Task (WO)" category** (first option, blue) — log time against an existing WO
- **WO picker**: search field + QR scan button (blue)
- **QR scanner**: full-screen camera overlay via `html5-qrcode`, reads traveller QR codes, auto-selects WO + pre-fills title
- **Time input toggle**: "Hours" (stepper, default) or "From → To" (two time pickers, auto-calculates rounded to 0.5h)
- **Recent Tasks** section below Log button showing last 10 tasks with status badges
- Task (WO) submissions: `tbl_tasks` with `routed_to_wo_id` pre-filled → inbox pre-selects WO for one-click routing
- Categories: Task (WO), Job Work, Maintenance, Workshop General, Other

**Route to WO — Date & Timer Fixes:**
- Review inbox + crew detail: routed entries now set all 4 timestamps (system_start, actual_start, system_end, actual_end)
- Uses task's `worked_date` without Z suffix — BST no longer shifts dates
- Flag note auto-set to "Routed from ad-hoc task" or custom note

**Review Inbox — WO Pre-selection:**
- `qry_review_inbox` view updated to expose `routed_to_wo_id` as `work_order_id` for tasks
- Route to WO modal pre-selects the WO when freelancer already picked one (one-click routing)
- SQL: `session21-inbox-view-update.sql` (UNION wrapped in subquery for ORDER BY)

**npm Fix:**
- Local npm had `omit=dev` globally — devDependencies (including tailwindcss) not installed
- Fixed with `npm ci --include=dev`
- `html5-qrcode` dependency added for QR scanning

### New/Modified Files (Session 21)
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/crew/page.tsx` | WhatsApp send icon + invite button in PIN dialog |
| `src/app/(dashboard)/crew/[id]/page.tsx` | Pending tasks panel, ad-hoc task history, By Day view, Add Entry, expanded edit panel, archive tasks |
| `src/app/(dashboard)/review/inbox/page.tsx` | Route to WO: fixed timestamps, WO pre-selection |
| `src/components/sidebar.tsx` | Amber inbox badge on Review with realtime |
| `src/app/m/task/page.tsx` | Full rebuild: Task (WO) category, QR scanner, time range, recent tasks |
| `sql/session21-inbox-view-update.sql` | qry_review_inbox view with routed_to_wo_id |

### SQL Run (Session 21)
```sql
-- sql/session21-inbox-view-update.sql:
-- DROP VIEW IF EXISTS qry_review_inbox
-- CREATE VIEW qry_review_inbox WITH (security_invoker = true) AS SELECT * FROM (...UNION ALL...) sub ORDER BY urgency, created_at DESC
-- Now exposes routed_to_wo_id as work_order_id for tasks
```

### Conventions Added (Session 21)
- **Manual time entries**: Always set all 4 timestamps (system_start, actual_start, system_end, actual_end) — never leave system_end_timestamp NULL or it creates a phantom active timer
- **Timezone-safe timestamps**: Never use `Z` suffix on timestamp strings for date-anchored entries — use `"YYYY-MM-DDT09:00:00"` (no Z) to prevent BST date shifts
- **Task → WO routing**: `routed_to_wo_id` on `tbl_tasks` pre-selects WO in review inbox. PM can one-click confirm instead of searching
- **npm omit=dev**: Local machine has `omit=dev` globally. Always use `--include=dev` flag for `npm install`/`npm ci` commands


---

## Session 22 — 15 April 2026

### Summary
Mobile freelancer interface improvements: navigation cleanup, header enhancements, task tree restructure, schedule enrichment, cost analysis time entries, and note editing across multiple surfaces.

### Completed

#### Mobile Nav Cleanup ✔
- [x] Removed Photos tab from bottom nav (freelancers often prohibited from site photos — PM responsibility)
- [x] Mobile nav now 4 tabs: Tasks, Schedule, Maint., Me
- [x] `/m/photos` route still exists but not linked from nav

#### Mobile Header Enhancements ✔
- [x] Starlight logo now clickable → `/m/me` tab
- [x] Active timer indicator in header: pulsing amber dot, white task label, amber elapsed time
- [x] Inactive state: muted clock icon + last task label with "3h ago" time-ago
- [x] Links to WO detail on tap
- [x] Realtime updates via Supabase channel on `tbl_wo_time_entries`
- [x] Color scheme: white/amber on navy for visibility (originally green, changed for contrast)
- [x] New component: `src/components/mobile-header-timer.tsx`

#### Mobile Tasks — Tree Layout ✔
- [x] Restructured from flat card list to Job → Scope → WO tree
- [x] Job sections: collapsible with chevron, show job number + name, task count badge when collapsed
- [x] Scope groups: amber bar + bold uppercase name + count
- [x] WO rows: compact with activity badge (small), description as headline, phase dot
- [x] Active freelancers shown as individual blue pills with pulsing green dot + first name
- [x] `rpc_active_workers` RPC (SECURITY DEFINER) used for cross-freelancer visibility
- [x] Filters preserved: All, Mine, Done, Painting

#### rpc_active_workers RPC ✔
- [x] New SECURITY DEFINER function for cross-freelancer active worker visibility
- [x] Returns: work_order_id, freelancer_id, freelancer_name (non-sensitive only)
- [x] Used by mobile task list to show all active workers regardless of RLS

#### Schedule Tab — Hours & Time Entries ✔
- [x] Weekly summary strip: "This week" and "Last week" cards with hours + entry count + comparison arrow
- [x] Monthly total in calendar header: "April 2026 · 142h logged"
- [x] Hours overlay on calendar days: blue "6.5h" badge per day
- [x] Gap detection: red dot on days with bookings but no hours logged (past days only)
- [x] Day bottom sheet: shows time entries with activity + scope, job number, start→end, hours
- [x] Editable flag notes per time entry from schedule bottom sheet
- [x] Past days now tappable (was disabled before)
- [x] All existing booking actions (confirm/decline/withdraw) preserved

#### Me Tab — Entry Notes ✔
- [x] Recent WO entries now show flag_note
- [x] Inline edit: "+ Add note" or existing note with edit capability
- [x] Save via `auditedUpdate` with cancel (X) button

#### Cost Analysis — Scope Time Entries ✔
- [x] Collapsible time entries section in scope-level cost analysis
- [x] Shows between cost layers grid and insight cards
- [x] Collapsed default: "▸ 🕐 12 time entries · 28.5h · £1,188.00"
- [x] Expanded: table with Date, Who, Task (activity badge + description), Hours, Cost, Note
- [x] Only on scope-level views (not job-level)
- [x] Enriched with freelancer names, WO descriptions, activity labels

### New/Modified Files (Session 22)
| File | Purpose |
|------|---------|
| `src/components/mobile-header-timer.tsx` | NEW: Active/last timer indicator in mobile header |
| `src/app/m/layout.tsx` | Clickable logo → /m/me, timer component, Photos tab removed |
| `src/app/m/page.tsx` | Tree layout (Job → Scope → WO), rpc_active_workers, freelancer pills |
| `src/app/m/schedule/page.tsx` | Hours overlay, weekly/monthly totals, time entry detail, gap detection, note editing |
| `src/app/m/me/page.tsx` | Flag note editing on recent WO entries |
| `src/components/cost-breakdown.tsx` | Collapsible time entries table on scope-level cost analysis |

### SQL Run (Session 22)
```sql
-- Run in Supabase SQL Editor:
CREATE OR REPLACE FUNCTION rpc_active_workers()
RETURNS TABLE(work_order_id INT, freelancer_id INT, freelancer_name TEXT)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT DISTINCT te.work_order_id, te.freelancer_id, f.freelancer_name
  FROM tbl_wo_time_entries te
  JOIN tbl_freelancers f ON f.freelancer_id = te.freelancer_id
  WHERE te.system_end_timestamp IS NULL
    AND te.archived_at IS NULL
$$;
```

### Conventions Added (Session 22)
- **Cross-freelancer visibility**: Use `SECURITY DEFINER` RPC functions (e.g. `rpc_active_workers`) to expose non-sensitive data across freelancer RLS boundaries. Never expose rates/costs/hours in these functions
- **Mobile header timer**: `MobileHeaderTimer` component in layout — queries own active/last entry, ticks every second for active timers, realtime channel refresh
- **Task tree pattern**: Group WOs by Job → Scope for scannable navigation. Activity label as small badge, description as headline
- **Schedule hours overlay**: Time entries grouped by date, shown as badges on calendar cells. Gap detection = booked + past + no entries → red warning dot


---

## Session 23 — 15 April 2026

### Summary
Mobile task logging UX overhaul, hours formatting system-wide, photo capture for ad-hoc tasks, crew time entry management improvements.

### Mobile Task Logging (`/m/task`) ✅
- [x] FAB hidden on `/m/task` and `/m/request` pages (no double navigation)
- [x] FAB action items repositioned to `bottom-36` (was overlapping X close button)
- [x] WO search picker: grouped by scope (scope header → indented WO rows with description + status)
- [x] WO tasks can start timer: creates `tbl_wo_time_entries` row (not tbl_tasks), auto-sets WO status to In-Progress, sends notification
- [x] 15-minute increments (was 30-minute): stepper ±0.25h, range rounding to 0.25h
- [x] Hours stepper shows formatted text (`1h 15m`) instead of raw number input

### formatHours System-Wide Rollout ✅
- [x] New utility: `lib/format-hours.ts` — `formatHours(1.5)` → `"1h 30m"`, `formatHours(0.25)` → `"15m"`
- [x] Applied to ALL mobile pages: task, schedule, WO detail, task tree, Me page
- [x] Applied to ALL desktop pages: workshop, review, review inbox, crew detail, capacity, dashboard, cost breakdown, traveller

### Mobile Header Timer Enhancements ✅
- [x] Now shows ad-hoc task timers (was WO-only): checks `tbl_tasks` with `status=in_progress`
- [x] Ad-hoc timer links to `/m/me` (WO timer links to WO detail)
- [x] Realtime subscription covers both `tbl_wo_time_entries` and `tbl_tasks`
- [x] Ad-hoc display: clipboard icon, "Ad-hoc" label, amber elapsed time

### Me Page Log Sheet Redesign ✅
- [x] No auto-focus on hours input (keyboard no longer hides submit button)
- [x] Stepper (±15min) instead of raw number input
- [x] `pb-24` bottom padding clears fixed nav bar
- [x] Photo capture: green camera button, up to 4 photos, OneDrive upload to `Workshop/Ad-hoc Tasks/`
- [x] Photos stored as JSON array in `tbl_tasks.photo_urls` TEXT column
- [x] Upload failure shows visible red toast (was silent console.warn)
- [x] Weekly/monthly hours now use formatHours

### Review Inbox Photo Display ✅
- [x] Fetches `photo_urls` from `tbl_tasks` for pending task items
- [x] Shows clickable thumbnail grid on task cards (opens full image in new tab)
- [x] Fallback icon on image load error

### Crew Detail — By Day View Improvements ✅
- [x] Routed tasks excluded from By Day totals (prevents double-counting with WO entry)
- [x] Rejected tasks hidden by default (shown when "Show archived" is checked)
- [x] Activity counter excludes archived WO entries and rejected tasks
- [x] WO entries: edit (inline hours) + archive (with reason) buttons
- [x] Ad-hoc tasks: edit (inline hours + title) + archive buttons
- [x] Restore buttons on all archived/rejected entries (green "Restore" with RotateCcw icon)
- [x] Restore works in both flat and By Day views

### Review Page — Overhead Table ✅
- [x] Archive (X) button on each overhead task row
- [x] Refreshes data after archiving

### New/Modified Files (Session 23)
| File | Purpose |
|------|---------|
| `src/lib/format-hours.ts` | NEW: `formatHours()` utility — decimal hours → human-readable |
| `src/components/floating-action-button.tsx` | Hidden on task/request pages, action items repositioned |
| `src/components/mobile-header-timer.tsx` | Rebuilt: WO + ad-hoc timer support, links to correct page |
| `src/app/m/task/page.tsx` | WO grouping, WO timer, 15min increments, formatHours |
| `src/app/m/me/page.tsx` | Log sheet redesign: stepper, photos, no autofocus, formatHours |
| `src/app/m/page.tsx` | formatHours on estimated durations |
| `src/app/m/schedule/page.tsx` | formatHours on all hours displays |
| `src/app/m/wo/[woId]/page.tsx` | formatHours on elapsed, estimated, entry hours, toasts |
| `src/app/(dashboard)/workshop/page.tsx` | formatHours on stats, estimates, entries, toasts |
| `src/app/(dashboard)/review/page.tsx` | formatHours + archive button on overhead table |
| `src/app/(dashboard)/review/inbox/page.tsx` | formatHours + photo display for tasks |
| `src/app/(dashboard)/crew/[id]/page.tsx` | By Day: edit/archive/restore on all entry types, formatHours, counter fix |
| `src/app/(dashboard)/capacity/page.tsx` | formatHours on all summary + per-job stats |
| `src/app/(dashboard)/page.tsx` | formatHours on activity + department table |
| `src/app/traveller/page.tsx` | formatHours on estimated hours |
| `src/components/cost-breakdown.tsx` | formatHours on time entry summary + table |

### SQL Run (Session 23)
```sql
ALTER TABLE tbl_tasks ADD COLUMN photo_urls TEXT;
```

### Conventions Added (Session 23)
- **formatHours**: Always use `formatHours()` from `lib/format-hours.ts` for displaying hours. Never show raw decimals like `1.5h` or `0.25h`. Format: `1h 30m`, `15m`, `2h`
- **15-minute increments**: All manual time entry uses 0.25h steps (was 0.5h). Stepper shows formatted text, not raw numbers
- **WO timer from task page**: When category is "task" (WO), timer creates `tbl_wo_time_entries` row directly (not tbl_tasks). This ensures it shows in header timer and WO page
- **Ad-hoc task photos**: Upload to OneDrive `Workshop/Ad-hoc Tasks/`, store URLs as JSON array in `tbl_tasks.photo_urls`. Review inbox fetches and displays thumbnails
- **Routed task exclusion**: By Day view ALWAYS excludes `status=routed` tasks (hours live in WO entry). Rejected tasks hidden unless "Show archived" checked
- **Restore pattern**: Archived WO entries → clear `archived_at/by/reason`. Rejected tasks → set `status=approved_overhead`. Both show green "Restore" button when archived entries are visible
- **Supabase MCP**: Connected — run SQL via `Supabase:execute_sql` with project_id `qbdnoueqkmhznqzpkvos`. No more manual SQL paste


---

## Session 24 — 16 April 2026

### Summary
Next Step WO chaining (predecessor workflow) + unified mobile logging experience.

### Next Step WO Chaining
- [x] `predecessor_wo_id` column on `tbl_work_orders` (nullable FK, ON DELETE SET NULL)
- [x] "↳" (CornerDownRight) button on every non-voided WO row in scope Build Plan
- [x] Clicking opens "Add Next Step" dialog with:
  - Context: "After: BUILD → new step"
  - Job item checkboxes: all inherited from predecessor, individually togglable
  - Activity picker: all activities shown (soft signals only, ★ marks typical next phases)
  - No auto-description prefill — user types what they need
  - Complexity + Finish inherited from scope defaults
- [x] New WO gets `predecessor_wo_id` pointing to parent
- [x] Visual chain indicator on WO cards: "↳ after BUILD (done/active/waiting)"
- [x] Phase numbers set: BUILD=1, COVER=3 (were NULL)

### Mobile Quick Timer (FAB)
- [x] FAB red "+" now shows 3 options: Start Timer (green), Log Task (navy), Raise Request (amber)
- [x] Start Timer: one-tap, creates `tbl_tasks` row with "Quick timer (HH:MM)", status=in_progress
- [x] Checks for existing active timer — blocks with error + redirect to Me page
- [x] Timer shows in Me page's active timer banner, logged via standard flow

### Mobile Photo on Quick-Log
- [x] `/m/task` "log completed work" section: green camera button (up to 4 photos)
- [x] Photos uploaded to OneDrive `Workshop/Ad-hoc Tasks/`, stored as `photo_urls` JSON array
- [x] Photo count included in review notification

### Unified LogSheet Component ✔
- [x] NEW: `src/components/log-sheet.tsx` — shared bottom sheet for ALL mobile logging
- [x] Always shows: hours stepper (±0.25, editable centre), notes field, photos (green camera, up to 4), submit button
- [x] Conditional: date picker (shown for quick-log, hidden for timer stops)
- [x] Context bar: read-only label + sublabel (WO name + job number, or task title)
- [x] State resets on open via useEffect (fixes defaultHours not applying)
- [x] Stepper buttons `shrink-0` (fixes '+' cutoff on mobile)
- [x] Wired into all 3 flows:
  - `/m/wo/[woId]` — WO timer stop (gained: stepper, photos, consistent layout)
  - `/m/me` — Ad-hoc timer stop (gained: notes field, consistent layout)
  - `/m/task` — Quick log (now: pick context at top → "Log Hours" button → LogSheet opens)

### New/Modified Files (Session 24)
| File | Purpose |
|------|---------|
| `src/components/log-sheet.tsx` | NEW: Unified logging bottom sheet component |
| `src/components/create-wo-dialog.tsx` | Rewritten: predecessorWO prop, item checkboxes, no auto-description |
| `src/components/work-orders-panel.tsx` | Next Step button, predecessor indicator, CreateWODialog import |
| `src/components/floating-action-button.tsx` | Rewritten: 3 options, quick timer with Supabase insert |
| `src/app/m/task/page.tsx` | Rewritten: uses LogSheet, removed inline time/date/notes/photos |
| `src/app/m/me/page.tsx` | Uses LogSheet, gained notes field |
| `src/app/m/wo/[woId]/page.tsx` | Uses LogSheet, gained stepper + photos |

### SQL Run (Session 24)
```sql
ALTER TABLE tbl_work_orders ADD COLUMN predecessor_wo_id BIGINT 
  REFERENCES tbl_work_orders(work_order_id) ON DELETE SET NULL;
UPDATE tbl_master_lookups SET phase_number = 1 WHERE lookup_id = 57; -- BUILD
UPDATE tbl_master_lookups SET phase_number = 3 WHERE lookup_id = 58; -- COVER
```

### Database Tables (still 42, no new tables)
### Views (still 38, no new views)

### Conventions Added (Session 24)
- **Unified LogSheet**: All mobile hour logging flows use `<LogSheet>` component. Never build inline logging UI again
- **LogSheet state reset**: `useEffect` on `open` + `defaultHours` ensures fresh state each time sheet opens
- **Stepper buttons**: Always `shrink-0` on ±buttons in flex containers to prevent mobile cutoff
- **Predecessor WO chain**: `predecessor_wo_id` on `tbl_work_orders` for Next Step feature. Visual indicator shows chain status. Soft signals only — never filter/block activities
- **FAB Quick Timer**: Creates `tbl_tasks` with `status: "in_progress"`, `started_at: now`, title includes time. Checks for existing active timer before creating


---

## Session 25 — 17 April 2026

### Summary
Institutional knowledge capture system ("The Starlight System"). Ten-category taxonomy for capturing deviations and lessons, attached to any entity in the schema. Semantic embeddings via Voyage AI set the foundation for future agent-assisted quoting and estimation.

### Strategic context
Previous discussion (same session, pre-implementation): identified that PMs/bosses engage at start and end of projects only, and forcing mid-project engagement won't work. Real prize is data quality good enough to support an AI agent — quoting, estimating, risk flagging. Most valuable missing signal: structured *why* data (not just what happened, but what made it go sideways). This is the "knowledge foundation" for later agent capabilities.

### What landed

#### tbl_learnings — The knowledge table ✅
- New table `tbl_learnings` with 10-category enum (`learning_category`):
  - `estimate_miss`, `scope_change`, `execution_issue`, `material_supply_issue`, `client_behaviour`, `design_issue`, `process_issue`, `communication_gap`, `judgement_call`, `positive_learning`
- Each category has 1 structured sub-field (enum value, expandable later) — kept minimal per "ship first" principle
- 10 nullable FK entity refs: `job_id`, `quote_line_id`, `scope_item_id`, `work_order_id`, `bom_id`, `time_entry_id`, `material_id`, `stock_item_id`, `freelancer_id`, `supplier_id`
- CHECK constraint requires at least one entity FK
- Impact fields: `severity INT 1-5`, `cost_impact_gbp NUMERIC`, `hours_impact NUMERIC`, `actionable BOOLEAN`
- Text fields: `headline TEXT` (3-200 chars, required), `detail TEXT` (optional war story)
- Resolution: `resolved_at`, `resolved_by`, `resolution_notes`
- Meta: `created_by UUID REFERENCES auth.users`, `created_at`, `updated_at`
- 17 indexes: category, created_at DESC, partial on actionable (where not resolved), severity, one per FK, plus ivfflat on embedding
- RLS: admin/manager select/insert/update, admin-only delete. Freelancers blocked (will open to PMs later)
- `tbl_learning_links` junction for m:m cross-entity links (when one learning spans several entities of same type)
- Audit insert tracking `auditedInsert` wired in via LearningCapture (not via tbl_audit_log — avoid meta-recursion)

#### Semantic embeddings — Voyage AI ✅
- `embedding VECTOR(512)` column (`pgvector` extension enabled earlier, rebuilt for voyage-3-lite's 512 dimensions)
- `embedding_status TEXT` enum: `pending`, `ready`, `failed`, `disabled`
- Trigger `tbl_learnings_mark_embedding_pending` auto-invalidates embedding when text changes
- `/api/learnings/embed` endpoint:
  - Processes up to 20 pending rows per call
  - Calls Voyage `voyage-3-lite` (cosine, document input_type for indexing)
  - Writes embeddings back with `embedding_status='ready'`
  - Fails gracefully if `VOYAGE_API_KEY` missing → flips to `disabled`
- Fire-and-forget trigger from capture UI using `fetch({ keepalive: true })` — survives component unmount
- ivfflat index `idx_learnings_embedding_vec` with `vector_cosine_ops`, 100 lists
- `rpc_learnings_similar(query_embedding VECTOR(512), limit, category?)` — returns N most similar learnings by cosine similarity

#### qry_learnings_enriched view ✅
- View joins tbl_learnings with all entity tables + tbl_master_lookups for WO activity labels
- `context_label` built via CONCAT_WS from whichever entities are attached:
  - `Job 13725 · Line 64` (quote line only)
  - `Job 13725 · Scope: Pergola canopy · WO BUILD` (full chain)
  - `Job 13725 · Scope: Plinth · Mat: 18mm MDF` (material attached)
  - Prefixes: `Scope:`, `Mat:`, `Stock:`, `Supplier:`, `Freelancer:` — distinguishable at a glance
- `security_invoker = true` (matches Session 11 convention)
- Returns `LearningEnriched` interface for frontend display

#### Capture UI ✅
- `src/components/learning-capture.tsx` — universal bottom-sheet modal (dark theme tokens: `bg-surface-mid`, `border-surface-hi`, etc.)
- 10 category pills with colour-coded chips (rose/amber/red/orange/fuchsia/violet/slate/yellow/blue/emerald)
- Each category opens its sub-field as a pill row on selection
- Severity 1-5 buttons (emerald for positive_learning, amber/red/blue gradient otherwise)
- Cost + Hours inputs (optional)
- Headline required (3-200 chars with live counter), detail optional (textarea)
- Actionable checkbox with explanation
- `src/components/learning-trigger.tsx` — small book icon button for inline placement (table rows)
- `src/components/learnings-section.tsx` — attached-list display for entity detail pages (collapsible, expand-per-row, inline resolve/reopen/delete)
- `src/components/learnings-tab.tsx` — review page tab with summary cards, category filter chips, search, status toggle, deep-link to scope/job

#### Wired into pages ✅
- **Review page**: new "Learnings" tab between Estimate Accuracy and Completed. Full dashboard with summary cards + filters
- **Job detail page**: `<LearningsSection>` after PM Queries panel (collapsed by default); small book-icon `<LearningTrigger>` on every quote line row
- **Scope detail page**: `<LearningsSection>` after Cost Analysis (collapsed by default)
- **WO rows in work-orders-panel**: book-icon trigger in action row (alongside printer, delete, next-step)

#### Database state at end of session
- 43 tables (was 42) — added `tbl_learnings`
- 39 views — added `qry_learnings_enriched`
- 8 RPC functions — added `rpc_learnings_similar`
- Extensions: added `pgvector` (and `pg_net` enabled for future use)

### Voyage AI integration detail

**Model choice:** `voyage-3-lite`
- 512 dimensions (not 1024 — initial assumption was wrong, corrected via diagnostic endpoint)
- Free tier: 200M tokens/month (enough for millions of learnings of typical length)
- Anthropic-recommended embedding provider — keeps vendor surface aligned with eventual Claude agent

**Auth:** `VOYAGE_API_KEY` env var on Vercel (not checked into git). Capture sheet's fire-and-forget fetch uses Supabase session token to authenticate against the embed route, which then calls Voyage with the service-owned key.

**Rationale (rejected OpenAI):** One-vendor simplicity for upcoming agent layer (all Claude/Anthropic ecosystem). Voyage has stronger retrieval benchmarks anyway.

### Bug log from this session (for future reference)

**Dim mismatch — the real blocker for ~90 mins of debugging:**
- Initially set column to VECTOR(1024) assuming voyage-3-lite returned 1024 dims
- voyage-3-lite actually returns 512 dims
- Writes silently failed (Postgres rejected vector length mismatch during update)
- Status stayed `pending` (not `failed` or `disabled`) because the failure was in the write-back, not in the API call
- Diagnostic endpoint (`?diag=1`) revealed truth: `voyage_status: 200, dims_returned: 512`
- Fix: drop+recreate column as VECTOR(512), rebuild view (it depended on `l.*`), rebuild RPC signature

**Client-side fire-and-forget unreliability:**
- Initial capture used `fetch().then()` without await — fetch was cancelled on component unmount
- Added `keepalive: true` flag which tells browser to finish the request even if page/component unmounts
- This is the correct pattern for "submit something in the background that shouldn't block UI"

**`toast.message()` may not exist in sonner version** — be careful using it. Safer to use `toast()` or `toast.info()` for neutral messages.

### Files added
| File | Purpose |
|------|---------|
| `src/lib/learnings.ts` | Taxonomy, types, CATEGORY_MAP, helpers (severityDots, severityColour, contextToInsertFields) |
| `src/components/learning-capture.tsx` | Universal capture bottom-sheet modal |
| `src/components/learning-trigger.tsx` | Small icon-button wrapper for inline placement |
| `src/components/learnings-section.tsx` | Attached-list display for entity pages |
| `src/components/learnings-tab.tsx` | Review page tab with filters + dashboard |
| `src/app/api/learnings/embed/route.ts` | Embedding endpoint (Voyage AI voyage-3-lite) |

### Files modified
| File | Change |
|------|--------|
| `src/app/(dashboard)/review/page.tsx` | Added Learnings tab (import, TabKey extension, URL validation, tab button, tab content) |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | LearningsSection after PmQueriesJobPanel; LearningTrigger per quote line row |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | LearningsSection after CostBreakdown |
| `src/components/work-orders-panel.tsx` | LearningTrigger in WO action row |

### SQL applied (Supabase MCP)
- `session_25_learnings_system` — main table + links + enum + indexes + RLS + triggers
- `session_25_learnings_view_and_rpc` — qry_learnings_enriched + rpc_learnings_similar
- `session_25_learnings_embedding_voyage_1024_v2` — column dim migration (1536→1024, later corrected to 512)
- `session_25c_learnings_view_context_fix` — context_label includes quote line, WO activity label via lookup join
- `session_25c_learnings_view_separator_fix` — separator character (· not `\u00b7`)
- `session_25d_learnings_context_scope_prefix` — "Scope:", "Mat:", "Stock:" etc. prefixes in context label
- `fix_embedding_dims_512_voyage_lite` — real fix: VECTOR(1024)→VECTOR(512), rebuilt view + RPC
- `enable_pg_net_for_webhooks` — enabled pg_net extension (reserved for future webhook pattern)

### Conventions added
- **Universal entity attachment pattern**: nullable FK columns for each possible parent (not polymorphic `entity_type + entity_id`). One column per entity type, CHECK constraint requires ≥1 set. Integrity enforced by FK, clean joins, no indirection
- **`tbl_learnings` as the single knowledge surface**: all institutional knowledge attaches here. Don't add "notes" columns to other tables for deviations — use learnings
- **10-category taxonomy (v1)**: locked via PG enum. Expansion requires enum ALTER + UI pill + sub-field additions. Resist per-category duplicates — use sub-field for nuance
- **Embedding dimensions match model**: always verify `dims_returned` from the provider before setting `VECTOR(n)` column size. `voyage-3-lite` = 512, `voyage-3` = 1024, `voyage-3-large` = up to 2048
- **Voyage input_type**: `"document"` when indexing (the corpus), `"query"` when searching. Use `rpc_learnings_similar` with query-type embedding for searches
- **keepalive fetch for fire-and-forget**: `fetch(url, { keepalive: true })` for background requests that must survive component unmount. Without it, React's unmount cancels in-flight requests
- **Context label hierarchy**: Job → Line → Scope → WO → Material/Stock/Supplier/Freelancer. Each prefixed with its type for scannability. Truncate long scope names at 60 chars
- **Semantic similarity via pgvector cosine distance**: `embedding <=> query_vec` gives distance (smaller = more similar). `1 - (embedding <=> query_vec)` gives similarity score (1.0 = identical, 0.0 = orthogonal)
- **Capture UX — dark theme first**: learning-capture and learnings-section use dark theme tokens (bg-surface-mid, text-foreground, border-surface-hi). LearningsTab uses light theme to match other review tabs (text-navy, card)

### Next session start point

**State at end of session 25:**
- 6 learnings captured across 1 test job (Grosvenor)
- All embedded successfully (512 dims, Voyage AI)
- Semantic similarity retrieval verified working — sensible clustering of related learnings
- `VOYAGE_API_KEY` set in Vercel production env
- RLS locked to admin/manager (Mateusz) for pilot phase

**Immediate next steps (when returning):**
1. **Get Mateusz's backlog in** — many existing lessons, capture rough versions now, rough headlines are fine
2. **Build "similar past learnings" panel** — when viewing a scope item, show 3 most similar past learnings via `rpc_learnings_similar`. This is where PMs start seeing value
3. **Retrospective workflow** — at job completion, prompt to review + augment learnings gathered during the build. Not building from scratch, augmenting
4. **Agent connection** — once ~50+ learnings exist, wire MCP so Claude can retrieve from `rpc_learnings_similar` during quoting/estimating conversations

**Outstanding tidy:**
- Diagnostic endpoint `?diag=1` removed from route.ts (cleaned up in Session 25 wrap-up)
- Consider RLS change when inviting PMs — currently blocked. Probably: PMs can see/edit learnings on jobs they're on (add policy scoped by job)

### Deliverable quality reflection
This was a fraught session with several debugging loops (dim mismatch, fetch cancellation, cached JS, device switching between mobile and desktop). Final system works end-to-end but the path wasn't clean. Honest grade: B+ on the code, D on the debugging approach. Should have added diagnostic output earlier and run end-to-end verification before declaring victory.



## Session 26 — 18 April 2026

### Summary
Five features shipped, all serving the "production reality" layer — places where PMs and foremen need shared ground truth: (1) audit-log revert extended to archive actions so soft-deletes can be undone; (2) load list system — zone-grouped packing checklist unifying job items and loose BOM materials, with per-truck grouping for multi-vehicle departures; (3) multi-assignee WO model — replacing single `planned_lead_id` with a proper peer model (`tbl_wo_assignees`) behind a sync trigger that keeps workshop/capacity/traveller compatible; (4) mobile "On" filter — freelancers see only work they're assigned to; (5) Project Pack xlsx — standalone handoff document for external PMs on Grosvenor wedding, with quote lines as the spine and empty templates matching their existing pack structure.

### Strategic context
We've had the data model for a while; we haven't had the export surface. This session filled that gap in two directions: internally (load list, peer assignees, mobile filter — making the existing data useful during the build) and externally (Project Pack — making our data useful to people outside the system). The peer-assignee change is structurally the biggest — it replaces a scalar field with a relation without breaking any downstream consumer, via trigger. That pattern will recur.

### What landed

#### Audit log — Revert for archived entries ✅
- New `auditedArchive(ctx, tableName, recordId, reason, jobId)` helper in `src/lib/audit.ts` — single source of truth for soft-delete with audit trail
- Writes audit row with `action_type="archive"`, record snapshot in `old_value`, reason in `new_value`
- Extended `revertAuditEntry()` to handle `action_type="archive"` — nulls `archived_at`/`archived_by`/`archive_reason` when restored
- Refactored `handleArchive` in `src/app/(dashboard)/crew/[id]/page.tsx` to use the new helper
- Settings → Audit Log UI shows "Restore" button on archive rows with `_archive`/`_unarchive` badge treatment
- Fixed `qry_jobitems_withcoverage` view — rebuilt with `security_invoker=true`, exposed `item_source`, `stock_item_id`, `source_item_id` so Stock/Bespoke badges render correctly



#### Load list system ✅
- New page `/reports/load-list/[jobId]` — zone-grouped load list unifying job items + loose scope-level BOM materials
- Excludes WO-level BOM and BOM paired with job items (avoids double-count — those items are already represented via their job item)
- `tbl_load_events(job_id, source_table, source_id)` with UNIQUE — tracks `pending → packed → loaded` state per item
- RLS: admin/manager/PM/foreman can insert/update/delete; all authenticated can read
- `rpc_load_list(p_job_id)` unions job_items + loose scope BOM, groups by zone
- UI: per-item stepper (pending → packed → loaded), zone "Mark all loaded", status pills, reset button, summary bar, collapsible zones
- Print view: checkbox layout, loaded items crossed out, signature block at bottom
- "Load List" button on job header
- Tested on Grosvenor: 73 items across the active zones

#### Load list — Truck grouping (supplement) ✅
- `tbl_load_groups` per-job named containers: name, description, driver, departure_at, sort_order
- RLS: PMs create/edit/delete; foreman read-only
- `tbl_load_events.load_group_id` nullable FK (ON DELETE SET NULL) — a load event can belong to a truck or be unassigned
- `rpc_load_list` extended to return `{ job, groups, items }` for unified hydration in one round trip
- UI: truck strip at top; bulk selection with sticky action bar; grouping hierarchy Zone → Truck → Items; per-truck print mode
- Designed as a supplement to zone grouping, not a replacement — zones remain the default packing lens



#### Multi-assignee peer model (WO) ✅

**Schema:**
- `tbl_wo_assignees(wo_assignee_id, work_order_id, freelancer_id, assigned_at, assigned_by)` with UNIQUE(wo, freelancer)
- RLS: all authenticated SELECT; admin/manager/PM/foreman INSERT/DELETE
- Sync trigger `trg_sync_planned_lead_from_assignees` — on insert/delete updates `tbl_work_orders.planned_lead_id` to first assignee (ordered by `assigned_at`, tiebreak `wo_assignee_id`) or NULL
- Backfill migration: moved existing `planned_lead_id` values into `tbl_wo_assignees` (4 rows)

**Why the trigger matters:**
Workshop page, capacity page and traveller PDF generator still read `planned_lead_id` — not touched this session. Trigger keeps that field accurate as the "primary assignee" so nothing downstream breaks while we expand the relationship to peer-based. Migrate consumers one at a time instead of flag-day rewrite.

**Desktop WO picker (`src/components/work-orders-panel.tsx`):**
- Single `<select>` replaced with chip UI: each assignee shown as removable chip + "+ Add" opens picker
- `addAssignee` / `removeAssignee` handlers replace previous `updatePlannedLead`
- Optimistic UI updates mirror the trigger's behaviour

**Mobile (`src/app/m/page.tsx`):**
- Fetches `tbl_wo_assignees` alongside WOs in parallel (one extra query)
- `TaskCard.planned_lead_id` → `assignee_ids: number[]`
- Old "Lead" pill → new "On (N)" pill in starlight-blue with UserCheck icon, shows peer count on the WO
- Filter logic: `t.assignee_ids.includes(myId)` replaces the single-lead check

**Audit gap (accepted):** `tbl_wo_assignees` not added to `AUDITED_TABLES` — the sync trigger audits `planned_lead_id` transitions on `tbl_work_orders`, which covers the primary use case. Expand if peer-level attribution becomes important.

#### Mobile "On" filter ✅
- Mobile tasks tab filter extended with "On" — shows only WOs where the current freelancer appears in `tbl_wo_assignees`
- Works alongside existing Done / All filters
- Uses the new `assignee_ids` array from the WO fetch (no extra query)



#### Project Pack xlsx — Standalone handoff for external PMs ✅
- **Context**: Fait Accompli PMs for Grosvenor wedding (job 13725) don't use the Starlight system. They need structured data from our side, delivered in a spreadsheet they can work in. One-off for now; becomes a button on the job page later
- **Output**: 11-sheet xlsx (`Starlight_ProjectPack_13725_Grosvenor_YYYY-MM-DD.xlsx`)
  - **Overview** — job header, sheet index, quick numbers (quote value, est cost, actual cost, line counts)
  - **Quote Lines** — all 89 lines: Line# / Category / Zone / Description / Qty / Unit £ / Line £ / Est Cost / Actual £ / Margin £ / Margin % / Status / PM Note, totals row at bottom
  - **Scope & Build** — grouped Zone → Scope → Job Items, each scope showing quote line ref, status, complexity, finish, est cost, description, with job items listed underneath (source, qty, finish, stock ref, notes)
  - **Materials** — 51 aggregated BOM rows grouped by category (Timber £952, Sheet £4,415, Fabric £371, Paint & Finish £132, Uncategorised £196), with quote line refs + scope usage cross-refs
  - **Suppliers / Crew Schedule / Production Schedule / Vehicles & Loads / Graphics / Hires / Onsite Management** — empty templates matching the existing pack structure Fait Accompli already use
- **Banners**: amber "Generated from Starlight Production System — data columns overwritten on re-export, use Notes column for notes" on auto-filled sheets; blue on blank templates
- **Design decisions** (see roadmap doc):
  - Quote lines as the spine — every exported row references stable `quote_line_id` (shown in row-level metadata)
  - Nothing locked — PMs can edit freely; re-export overwrites data columns but preserves their Notes column work
  - No cell formulas — survives copy-paste, avoids circular references when they split/merge rows
  - Empty templates match existing pack column structure so adoption is zero-friction
- **Build path**: Python + openpyxl generator (lives as `scripts/build_project_pack.py` in repo; ran via MCP for this one-off). Data pulled via Supabase MCP and staged as JSON files locally. To re-generate: rerun queries, replace JSON, rerun script
- **Verified on Grosvenor**: 89 quote lines summing £377,340 ✓; 16 scopes; 67 job items; 51 aggregated materials summing £6,066



### Files added
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/reports/load-list/[jobId]/page.tsx` | Load list page — zone grouping, truck strip, stepper per item, print mode |
| `src/app/api/load-events/route.ts` | Load event state transitions (create/update) |
| `src/app/api/load-groups/route.ts` | Load group (truck) CRUD |
| `src/components/load-event-stepper.tsx` | Per-item pending/packed/loaded stepper |
| `src/components/truck-strip.tsx` | Horizontal strip of trucks with item counts |
| `scripts/build_project_pack.py` | Standalone xlsx generator for Project Pack (dev-side tool) |
| `STARLIGHT_PROJECT_PACK_ROADMAP.md` | Planning doc for the Project Pack format evolution |

### Files modified
| File | Change |
|------|---------|
| `src/lib/audit.ts` | New `auditedArchive()` helper; `revertAuditEntry` handles archive actions |
| `src/app/(dashboard)/settings/audit/page.tsx` | Restore button on archive rows, badge treatment |
| `src/app/(dashboard)/crew/[id]/page.tsx` | Uses `auditedArchive()` instead of raw soft-delete |
| `src/components/work-orders-panel.tsx` | Chip UI replaces single-select for assignees; `addAssignee`/`removeAssignee` handlers |
| `src/app/m/page.tsx` | Fetches `tbl_wo_assignees`; `assignee_ids[]` on TaskCard; "On (N)" pill; "On" filter |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | "Load List" button on job header |

### SQL applied (Supabase MCP)
- `session_26_audited_archive_support` — `auditedArchive` action_type support in audit revert
- `session_26_qry_jobitems_withcoverage_fix` — rebuilt view with security_invoker=true, exposed source fields
- `session_26_load_events_table` — `tbl_load_events` + RLS + uniqueness constraint
- `session_26_rpc_load_list` — RPC unifying job_items + loose scope BOM for a job
- `session_26_load_groups_table` — `tbl_load_groups` for truck grouping + RLS
- `session_26_rpc_load_list_with_groups` — RPC extended to return groups alongside items
- `session_26_wo_assignees_table` — `tbl_wo_assignees` + UNIQUE + RLS
- `session_26_sync_planned_lead_trigger` — keeps `tbl_work_orders.planned_lead_id` in sync with assignees
- `session_26_backfill_wo_assignees` — migrated existing `planned_lead_id` values to junction table


### Conventions added
- **Soft-delete goes through `auditedArchive()`**: never call `.update({ archived_at })` directly on audited tables. The helper writes the audit row AND updates the record in a single flow, making revert possible. Raw soft-delete = no trail = no undo
- **Peer relationships get their own table; primary is derived**: when a relationship goes from 1:1 to 1:N or M:N, introduce a junction table and keep the old scalar column in sync via trigger rather than breaking every downstream consumer. `tbl_wo_assignees` → syncs `planned_lead_id`. Lets us migrate consumers (workshop page, capacity, traveller) one at a time instead of a flag-day rewrite. The trigger is the bridge, not a long-term solution — eventually consumers read the junction table directly
- **Load lists exclude WO-level BOM**: job items already represent what's being loaded. WO-level BOM is workshop consumables (glue, screws, offcuts). Only *loose* scope-level BOM (things like carpet rolls, fabric bolts that aren't wrapped in a job item) joins the load list. Otherwise the PM loads four sheets of MDF to site because they appeared in the BOM of every job item built from them
- **Handoff artefacts are separate products**: an export to external stakeholders isn't a feature of the system — it's a derived document. Snapshot data, structure for *their* mental model (not ours), leave columns editable, make re-export safe. Don't try to turn their spreadsheet into a live connection to our DB — that's a different (harder) problem and they didn't ask for it
- **Quote lines as the spine for external docs**: every exported row references a stable `quote_line_id` so anything the external team builds (notes, status, commentary) can be re-associated after a re-export. No UUID spaghetti, no "which row was this again". This is why we show the line# on every sheet, even where it's slightly awkward
- **Re-export safety via column lanes**: in a handoff xlsx, data columns (from our system) and editable columns (their notes) live in separate, well-marked ranges. Banner at the top of each auto-filled sheet states which columns get overwritten on re-export. Lets us regenerate without destroying their work


### Next session start point

**State at end of session 26:**
- Load list + truck grouping live, tested on Grosvenor
- `tbl_wo_assignees` peer model live; sync trigger keeping `planned_lead_id` accurate
- Mobile "On" filter shipping with the new assignee model
- Audit revert now handles archives (crew restored test passed)
- Project Pack v1 xlsx delivered for Grosvenor — standalone, one-off generation

**Deferred / accepted from this session:**
- `tbl_wo_assignees` not in `AUDITED_TABLES` — trigger audits primary-lead changes, peer-level attribution can wait
- Project Pack lives as `scripts/build_project_pack.py` not a web button — promote to job-page button in a future session once format stabilises with real Fait Accompli feedback
- Stock catalogue names not joined into Project Pack's Scope & Build sheet — shows `sref: "1744"` without the "8x4 Steel Deck" label. Low priority; add on next iteration
- Zone ordering on Scope & Build sheet is alphabetical — likely wants to switch to event-flow order (Entrance → Foyer → Corridor → Great Room) after first review
- Workshop page, capacity page, traveller PDF still read `planned_lead_id` directly. Sync trigger keeps them working. Migrate to reading `tbl_wo_assignees` when touching those pages next

**Open from Session 25 (still pending):**
- Learnings backlog capture (Mateusz to add existing known lessons)
- "Similar past learnings" panel on scope items
- Retrospective workflow at job completion
- Agent MCP connection once ~50+ learnings exist

**Open from earlier sessions (long-running):**
- Drop `tbl_freelancers.pin` column (verify no code still references it)
- Supabase Pro upgrade
- GitHub repo transfer personal → company account
- Quote import from real source (currently manual)

**Excel templating roadmap:**
- See new doc `STARLIGHT_PROJECT_PACK_ROADMAP.md` at repo root — captures current v1 structure, design rationale, and ideas to explore once the format is validated in real use

### Deliverable quality reflection
Efficient session for the amount shipped. The Project Pack build was messy in the middle — I flailed on strategy (live DB connection? anon key? embed data?) before committing to "query via MCP, stage as JSON, build in Python". Lesson: when stuck between three approaches, pick the one that completes in one session even if it's the least elegant. Reusability comes from *having shipped v1*, not from a prettier abstraction. Cost me probably 20 minutes of wheel-spinning.




### Session 27 (19 Apr 2026) — Promote-to-Stock: from flag to action

1 commit, 4 files changed. Fixed a dead-letter feature: the "→ STOCK" toggle wrote `notes = 'PROMOTE_TO_STOCK'` as an intent flag, but no trigger or hook ever acted on it, so bespoke items flagged for promotion stayed bespoke forever.

**Why the change:** Mateusz flagged 9 items on Grosvenor (job 8) for promotion. He needed to allocate those items — specifically the Grosvenor Straight Bars — to another job scheduled *before* Grosvenor's event date. With a "wait until WOs complete" model, cross-allocation is impossible. Revised model: click → stock exists now.

**Schema:**
- `ALTER TABLE tbl_stock_items ADD COLUMN source_job_item_id INTEGER REFERENCES tbl_job_items(item_id) ON DELETE SET NULL`
- Partial index `idx_stock_items_source_job_item WHERE source_job_item_id IS NOT NULL`

**New helper (`src/lib/promote-to-stock.ts`):**
- `promoteJobItemToStock(supabase, item)` — creates OR merges into existing stock row
- Dedup: finds other `item_source='promoted'` job items on the same job with the exact same description; if found, bumps that stock row's `stock_quantity` instead of creating a second row
- New row: `product_code = PROMO-{item_id}`, `stock_quantity = item.quantity`, `active=true`, `source_job_item_id = item.item_id`, `hire_cost_day/week = null` (PM prices on stock page)
- Updates job item: `stock_item_id`, `stock_reference`, `item_source='promoted'`
- Clears legacy `notes='PROMOTE_TO_STOCK'` flag only if still present (never wipes real user notes)

**Call sites rewired:**
- Scope page left-column "→ STOCK" button (`src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx`) — calls helper, toasts created/merged result, then `woRef.current?.refresh()`
- `work-orders-panel.tsx` `addBespokeItem` — if "Also add to stock catalogue" checkbox ticked, calls helper immediately after insert. Checkbox label changed from "Add to stock catalogue when complete" (old lie) to "Also add to stock catalogue" (accurate)
- `job-items-table.tsx` not updated — dead code, not imported anywhere. Flagged for deletion in a future cleanup

**Backfill (job 8 Grosvenor — the 9 flagged items):**
- 9 job items with `notes='PROMOTE_TO_STOCK'` → 7 deduplicated stock rows (stock_ids 3460–3466)
- Grosvenor Straight Bar 6ft: items 29 + 33 + 34 merged into one stock row qty 16 (`PROMO-G-29`)
- Trellis panel 3.6m × 4 (`PROMO-G-28`), Skybond Mirror Fascia × 6 (`PROMO-G-30`), X Handrail × 2 (`PROMO-G-38`), Back bar back × 6 (`PROMO-G-103`), Back bar shelves × 30 (`PROMO-G-102`), Back bar sides × 12 (`PROMO-G-101`)
- All 9 job items now carry `stock_item_id`, `stock_reference`, `item_source='promoted'`, and `notes` cleared

**What's deferred:**
- Stock availability / build-state badge ("In build: 2/5 WOs complete" vs "Built and available") — a view over `tbl_stock_items` joined to its source job item's WOs. Useful when other PMs pick promoted stock that isn't physically on the shelf yet. Low urgency while Mateusz is the only PM promoting.
- `job-items-table.tsx` deletion — dead code but safe to leave; deletion is cosmetic cleanup.

### New/Modified Files (Session 27)
| File | Purpose |
|------|---------|
| `src/lib/promote-to-stock.ts` | NEW — shared helper for immediate promote with dedup |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | Left-column "→ STOCK" button calls helper |
| `src/components/work-orders-panel.tsx` | `addBespokeItem` calls helper on checkbox tick; checkbox relabelled |
| `TRACKER.md` | This entry |

### SQL Run (Session 27)
```sql
ALTER TABLE tbl_stock_items
  ADD COLUMN IF NOT EXISTS source_job_item_id INTEGER
  REFERENCES tbl_job_items(item_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_items_source_job_item
  ON tbl_stock_items(source_job_item_id)
  WHERE source_job_item_id IS NOT NULL;

-- Backfill: DO-block loop groups job_items by description,
-- inserts one stock row per group, links all job_items to it, clears the flag.
-- 9 job items → 7 stock rows (PROMO-G-28..103).
```

### Conventions Added (Session 27)
- **Promote-to-stock is immediate, not deferred**: clicking "→ STOCK" creates a `tbl_stock_items` row synchronously and links the job item back. No completion gate, no flag-and-wait. The `item_source='promoted'` value is the signal, not a notes-field string
- **Dedup on promote**: within a single job, items sharing an exact-match description promote into ONE stock row (quantity sums). Prevents three "Grosvenor Straight Bar, 6ft" stock rows for what's conceptually one product. Fuzzy matching is deliberately NOT applied — exact-match is the right bar for auto-merge
- **`tbl_stock_items.source_job_item_id`**: traceability FK on promoted stock, pointing to the job item that first caused the stock row to exist. `ON DELETE SET NULL` — deleting the source job item doesn't destroy the stock row (it may now have physical inventory; PM can deactivate manually). For catalogue-seeded stock this field is null
- **Never wipe `notes` wholesale on promote**: the helper only clears `notes` when it exactly equals the legacy `PROMOTE_TO_STOCK` flag. Real user notes on job items are preserved
- **Product code pattern for promoted stock**: `PROMO-{item_id}`. `tbl_stock_items.product_code` has no unique constraint (per S16 learning), so collisions aren't a risk — but using the item_id makes the code traceable to the originating item by eye


---

## Session 28 — PM 100m view (`/pm/*`) and unified learnings as notes
**Date**: 20 April 2026
**Deploy**: 1 commit, 10 files changed. Built a read-mostly PM view at `/pm/jobs` and `/pm/jobs/[id]` alongside the existing admin view, with a header switcher that lets any authenticated user flip between the two.

**Why the change:** Pilot for handing a PM an overview without handing over the full admin system. The admin view is deep, operational, and editable everywhere. The PM view is shallow by design: one level (jobs list), then a single per-job page where the quote line is the row and everything underneath — scope, WOs, materials, costs, notes — expands inline. "100m view" not because it's sparse, but because the entry altitude is always the quote line, never a scope or a WO.

**What a PM actually sees:**
- A jobs grid with event date, days-to-event badge, line count and quote total
- Per job: every quote line, grouped by `line_sub_group`, filterable by zone and department
- Expanding a quote line shows the cost strip (Quoted | PM est | Workshop est | Committed | Actual labour), the WOs, the materials rolled up by description (with "used in N WOs" sub-expand, stock/ordering flags, suppliers), and Notes at every level — line, scope, WO, material
- Multi-scope quote lines get a Scope tier inside the expansion; single-scope lines hide it; orphan lines (no scope yet) show a grey "Not planned yet" badge and a notes-only expansion
- Documents attached to WOs surface as inline download chips — including the new `cad_model` doc_type (SketchUp / AutoCAD source files) with a distinctive 3D icon

**The view switcher:**
- Small Admin / PM pill in the header, shown to every authenticated user
- Click = POST to `/api/auth/preferred-view` which updates the caller's `app_metadata.preferred_view` via the service-role key, then navigates to `/` or `/pm/jobs`
- Middleware: on a visit to `/`, if `preferred_view === 'pm'`, redirect to `/pm/jobs`. Neither view is access-locked — the switcher is always present and always works, independent of role

**Notes = learnings (the unifying call of the session):**
- Discovered `tbl_learnings` already had `quote_line_id` and `bom_id` FKs and `qry_learnings_enriched` already exposed them. No schema change needed to treat PM notes as learnings
- Every note-capture point in the 100m view is `<LearningsSection>` with an appropriate `filterField`: `job_id`, `quote_line_id`, `scope_item_id`, `work_order_id`, `bom_id`
- Writing a "note" creates a learning tied to that anchor. Six months from now the learning search surfaces those notes alongside retros. One knowledge base, not two
- Intentional non-goal: the threaded-conversation UX. Each note is a full learning with category + severity + optional cost/hours impact. Lighter "just leave a comment" UX can be added as a LearningCapture preset later without a schema change

**RPC `rpc_pm_job_overview(p_job_id INTEGER) RETURNS JSON` (SECURITY INVOKER STABLE):**
Single call returns everything the 100m page needs:
```
{ job, quote_lines: [{
    quote_line_id, line_number, line_sub_group, line_text, quantity,
    unit_price, line_value, category, event_zone, pm_note, pm_est_*,
    scope_count, scopes:[{scope_item_id, item_name, status, complexity,
                          finish, event_zone, description}],
    wo_count, work_orders:[{work_order_id, scope_item_id, activity_label,
                            description, status, estimated_duration_hrs,
                            actual_hours, actual_labour_cost, lead_name,
                            paint_notes, predecessor_wo_id, wo_sequence}],
    bom_groups:[{group_key (description), first_bom_id, line_count,
                 total_quantity, unit, total_cost, any_from_stock,
                 any_needs_ordering, wo_ids[], suppliers[]}],
    bom_total, estimated_labour_cost, estimated_material_cost,
    documents:[{doc_id, work_order_id, doc_type, file_name,
                onedrive_path, file_size, uploaded_at}],
    learning_count, learning_open }]}
```
- BOM aggregation dedups by `item_description` within each quote line. `any_from_stock` / `any_needs_ordering` are OR across rows; `first_bom_id` anchors the notes section for that material group
- WO actual hours and labour cost come from `tbl_wo_time_entries` with `archived_at IS NULL` filter (S22 convention)
- Uses `qry_scope_estimated_cost` columns `estimated_labour` and `estimated_materials` (bare names, no `_cost` suffix — caught in v1 migration attempt)
- Smoke-tested on Grosvenor (job 8): 89 lines, 73 orphan, 0 multi-scope — confirms orphan/1-scope branches

**Schema change:**
- `tbl_wo_documents.doc_type` CHECK constraint extended to include `cad_model`. Existing values untouched: `cut_list | drawing | reference | model | cad_model`. `model` continues to mean GLB/GLTF inline viewer files; `cad_model` is download-only for SketchUp / AutoCAD / 3DM / STEP / IGES source files
- Constraint comment: `model = GLB/GLTF (inline 3D viewer). cad_model = SketchUp/AutoCAD/3D source files (download-only).`

**What's deferred:**
- **CAD file upload** in the admin WO docs panel. The `cad_model` doc_type exists, and the PM view renders download chips with a distinct 3D icon when docs have that type. But the admin-side upload flow (adding `.skp .dwg .3dm .step .iges` to accepted extensions, routing to `Workshop/{jobNumber}/cad/` OneDrive subfolder) is not wired — upload whatever's there today via the existing doc types, and the first CAD file will probably land via a raw OneDrive put
- **Multi-scope rendering** is implemented but untested on real data (no multi-scope quote lines exist in the system yet). Will validate the first time a quote line is broken into 2+ scopes
- **PM-facing dashboard at `/pm`** — for now the PM route namespace redirects into `/pm/jobs` via the sidebar default. Home tile can come later with upcoming events, open-flag counts, what's late

### New/Modified Files (Session 28)
| File | Purpose |
|------|---------|
| `src/app/api/auth/preferred-view/route.ts` | NEW — writes `app_metadata.preferred_view` via service role, validates caller's session |
| `src/components/view-switcher.tsx` | NEW — header pill, Admin ⇄ PM, navigates to landing page |
| `src/components/pm-sidebar.tsx` | NEW — simplified sidebar (Jobs only + PM badge + signout) |
| `src/app/pm/layout.tsx` | NEW — mirrors admin layout; sticky header with ViewSwitcher |
| `src/app/pm/jobs/page.tsx` | NEW — cards grid, search, event date + days-to-event, line count |
| `src/app/pm/jobs/[id]/page.tsx` | NEW — the 100m view; QuoteLineRow, WoBlock, MaterialRow, CostStrip helper components |
| `src/app/(dashboard)/layout.tsx` | Added sticky top header carrying ViewSwitcher (was header-less) |
| `src/middleware.ts` | On landing at `/`, honour `app_metadata.preferred_view === 'pm'` → redirect to `/pm/jobs` |
| `TRACKER.md` | This entry |

### SQL Run (Session 28)
```sql
-- Add cad_model to doc_type CHECK
ALTER TABLE tbl_wo_documents DROP CONSTRAINT tbl_wo_documents_doc_type_check;
ALTER TABLE tbl_wo_documents
  ADD CONSTRAINT tbl_wo_documents_doc_type_check
  CHECK (doc_type::text = ANY (ARRAY[
    'cut_list','drawing','reference','model','cad_model'
  ]::text[]));

-- rpc_pm_job_overview — see migration file for the full CTE chain
CREATE OR REPLACE FUNCTION rpc_pm_job_overview(p_job_id INTEGER)
  RETURNS JSON LANGUAGE sql SECURITY INVOKER STABLE AS $$ … $$;
GRANT EXECUTE ON FUNCTION rpc_pm_job_overview(INTEGER) TO authenticated;
```

### Conventions Added (Session 28)
- **View-layer routing is separate from permissions.** `/pm/*` and `/` are two different presentations over the same data, not two privilege tiers. The switcher is the only control; no role-gating blocks either view. Freelancer role still hard-routes to `/m/*` as before
- **Preferred view lives in `app_metadata`, not `user_metadata`.** `user_metadata` is user-editable from the client; `app_metadata` requires service role. Using `app_metadata` means the setting survives a malicious client edit and middleware can trust it. Service-role endpoint `/api/auth/preferred-view` is the only write path
- **Notes at every level are learnings.** Do not create parallel comment tables. `<LearningsSection>` accepts any of 10 `filterField` values; reusing it anywhere needing a "leave a note here" UX is the default. The `contextLabel: string` field on `LearningEntityContext` is required — build it from the visible headline of the thing being noted (quote line text, scope name, WO activity, material description)
- **Quote-line-first rendering is the PM lens.** Scope is an internal decomposition the PM doesn't need unless it diverges from the quote (2+ scopes on one line). Rendering rule: `scope_count === 1` → flat WO list, no scope shown; `scope_count >= 2` → scope sub-sections; `scope_count === 0` → grey "Not planned yet" with notes-only expansion. No "Plan this" affordance — PM view is read-only pilot
- **Material rollup groups by description, not by `material_id` or `stock_item_id`.** Many BOM rows have no material or stock FK but do have hand-typed descriptions. Grouping by description catches more cases. `first_bom_id` is used as the notes anchor (one learning thread per material group rather than per BOM row)
- **RPC payload shape: single call, full tree.** 100m view uses one `rpc_pm_job_overview` call. No lazy loading of expansion data. At 149 lines (Summer Solstice scale) the JSON is still well under a few hundred KB and network + render complete in ~1–2s. If that becomes painful, graduate to lazy expansion per-line rather than switching to multiple queries per line
- **`build.log` is untracked.** Added to `.gitignore`. Session 28 accidentally committed the build output log; removed in the cleanup follow-up

### On the horizon
- CAD file upload in admin WO docs panel (accepted extensions + OneDrive `/cad/` subfolder)
- Admin-side rendering of the notes-as-learnings thread on WO / scope / quote-line pages (reuse same component, minimal lift)
- PM home dashboard at `/pm` with upcoming events, flag counts, what's late
- Traveller PDF with QR code (still parked pending WO workflow stabilisation)


---

## Session 28b — PM view iteration (sort, richer row, PM notes, cost analysis, doc thumbnails)
**Date**: 20 April 2026
**Deploy**: 1 commit, 5 files changed. First-pass review of the PM 100m view surfaced six follow-ups. All shipped in one iteration.

### What the review flagged
1. **Line numbers sorted as text** — "1, 10, 11, 2, 20" instead of "1, 2, 3". Plus no user-facing sort control.
2. **Collapsed row too thin** — only showed Quoted; no Workshop estimate, no Live Spent. And no visible note.
3. **Notes ≠ learnings** — a "PM note" is an explanation or tip, not a structured learning. Wanted it inline per line, severity-less, visible on the row itself, and flagged up on the admin dashboard. Under the hood still a learning (unified knowledge layer), but with its own category and minimal capture UX.
4. **Cost analysis too shallow** — 5-cell strip wasn't enough; wanted per-WO breakdown with time entries.
5. **Materials notes per-row was wrong** — one notes thread for the whole Materials section, not one per material line.
6. **WO documents as tiny chips was wrong** — wanted thumbnails per WO, larger, grouped by doc_type (Drawing / Cut list / 3D model).

### What shipped

**Natural line sort, user-selectable.** RPC v3 extracts leading integer from `line_number` via `NULLIF(regexp_replace(line_number,'[^0-9].*$',''),'')::INT`, exposes as `sort_key`. Frontend ORDER BY uses it by default; client-side re-sort via dropdown (line number / value ↓ / value ↑ / department / zone). Sub-group headers only render when sorted by line number — any other sort would fragment them nonsensically.

**Richer row.** Collapsed row now shows Quoted on top, Workshop estimate + Live Spent below it, right-aligned. Live Spent = `total_actual_labour + bom_total` (actual labour from time entries + committed materials BOM). Under the line text, a compact dashed-border PM note bar shows either the current note or `+ Add PM note`. Clicking the bar inline-expands to a textarea with ⌘↵ to save, Esc to cancel. Empty save deletes the note.

**PM note as a real concept.**
- Two new values on `learning_category` enum: `pm_note` and `materials_note`
- `LEARNING_CATEGORIES` lib entry for each, both `bias: "neutral"`, no `subOptions`, distinct colour (`pm_note` = starlight-blue, `materials_note` = teal)
- New component `src/components/pm-note-inline.tsx` — upserts one `pm_note` learning per `quote_line_id`. Find existing → update headline; no existing → insert with `actionable=false`, `severity=1`. Empty text deletes. Compact (in-row) and edit (textarea) modes.
- RPC returns the latest `pm_note` per line as `pm_note_inline_id` / `pm_note_inline_text` / `pm_note_inline_updated_at` via `DISTINCT ON (quote_line_id) … ORDER BY quote_line_id, updated_at DESC`
- `LearningsSection` extended with `filterCategories` and `excludeCategories` props so other threads (WO notes, scope notes, "Other learnings on this line") silently skip `pm_note` + `materials_note` and don't double-render

**Detailed cost analysis.** Inside quote line expansion, above the WOs, a compact per-WO table: WO ID, activity, status, est hrs, actual hrs, **variance (coloured green/red)**, labour cost. Totals row at the bottom. Variance in hours is signed and formatted via `formatHours`.

**WO individual expand with time entries + thumbnails.** Each `WoBlock` is now a clickable row (was always-open). Click to expand:
- Description + lead + paint_notes
- **Time entries table** — who, date, hours, applied rate, cost, with totals. From the RPC payload (`time_entries` array per WO, archived filtered out).
- **Document gallery** — new `DocumentGallery` component. Groups docs by `doc_type` with typed headers: Drawings / Cut lists / 3D models / CAD files / Reference. Each doc is a 176px-wide card with icon header, file name, extension, size, download action. Image extensions show an image icon (thumbnail proxy is a follow-up; OneDrive direct URLs aren't `<img>`-safe)
- WO-level learnings thread (excluding `pm_note` + `materials_note`)

**Materials section has one notes thread.** Top of the section is `<LearningsSection filterCategories={["materials_note"]} filterField="quote_line_id">`, so adding a note from here creates a `materials_note` learning anchored to the quote line. Per-row notes on materials are gone. `MaterialRow` still shows `from_stock` / `needs_ordering` flags, supplier, "Used in N WOs" expand.

**Job-level totals strip.** Above the filter row, three cards: Quoted / Workshop estimate / Live spent — summed across all lines. Same inputs as the per-line row, aggregated.

**Job header counts.** Adds `· N PM notes` if any line has a `pm_note_inline_text`, `· N not planned` if any are orphan.

### RPC v3 additions (vs v2)
```
sort_key              INT   -- leading integer of line_number, 999999 fallback
pm_note_inline_id     UUID  -- latest pm_note learning for this line, if any
pm_note_inline_text   TEXT  -- its headline
pm_note_inline_updated_at  TIMESTAMPTZ
total_actual_labour   NUMERIC -- sum of wo actual_labour_cost on this line

work_orders[].time_entries[{
  entry_id, freelancer_name, work_date, actual_hours,
  applied_hourly_rate, entry_cost, flag_note
}]
```
ORDER BY in the top-level JSON_AGG became `ql.sort_key, ql.line_number`.

### New/Modified Files (Session 28b)
| File | Purpose |
|------|---------|
| `src/components/pm-note-inline.tsx` | NEW — inline PM-note editor, upsert one learning per quote line |
| `src/lib/learnings.ts` | Added `pm_note` + `materials_note` to `LearningCategory` union and `LEARNING_CATEGORIES` |
| `src/components/learnings-section.tsx` | Added `filterCategories` and `excludeCategories` props |
| `src/app/pm/jobs/[id]/page.tsx` | Full rewrite: natural sort, sort dropdown, richer row with 3 cost cells + PM note bar, job totals strip, per-WO cost table, `WoBlock` individual expand with time entries table + `DocumentGallery`, single materials notes thread, orphan-aware body |
| `TRACKER.md` | This entry |

### SQL Run (Session 28b)
```sql
-- Add the two new learning categories
ALTER TYPE learning_category ADD VALUE IF NOT EXISTS 'pm_note';
ALTER TYPE learning_category ADD VALUE IF NOT EXISTS 'materials_note';

-- Rewrite rpc_pm_job_overview (see full CTE chain in migration)
-- Key changes:
--   * Adds `sort_key` on the `lines` CTE via regex
--   * New `pm_notes` CTE: DISTINCT ON (quote_line_id) ordered by updated_at DESC
--   * New `time_entries` sub-SELECT on each `wo_rich` row
--   * `wos_per_line` now also aggregates `total_actual_labour`
--   * Top-level JSON_AGG ORDER BY ql.sort_key, ql.line_number
```

### Conventions Added (Session 28b)
- **PM notes are upserted, not threaded.** One `pm_note` learning per `quote_line_id`; the `PmNoteInline` component finds-then-updates, or inserts if none exists. Keeps the "note is a statement, not a conversation" mental model. The audit log still captures every change if you need history. Empty text deletes the learning.
- **Category-filtered threads.** When multiple note types can anchor to the same entity, filter the `LearningsSection` thread with `filterCategories` (positive list) or `excludeCategories` (negative list). Example: materials section uses `filterCategories={["materials_note"]}`; WO / scope / other threads use `excludeCategories={["pm_note", "materials_note"]}` so PM and materials notes don't bleed across.
- **Varchar line-number sort.** `tbl_quote_lines.line_number` is varchar and may contain "1", "1a", "10", "Sub-15". Natural sort key: `NULLIF(regexp_replace(line_number, '[^0-9].*$', ''), '')::INT` with 999999 fallback for non-numeric. Exposed as `sort_key` in the RPC so the frontend can re-sort client-side without another query.
- **Row = 3 numbers, body = 5 layers.** Quoted / Workshop est / Live spent on the collapsed row is the at-a-glance summary; full waterfall (PM est, scope-level estimate, committed, actual, variance) is only meaningful once expanded. Don't try to fit everything into the row.
- **Sort vs group.** When sorting by anything other than `line_number`, sub-group (Infrastructure / Reception / Temple / …) headers disappear. A sub-group is a property of the original quote layout; any other sort dimension would produce nonsense like "Marquees" repeating for every department.
- **Document thumbnails group by `doc_type`.** The PM doesn't think "documents on this WO" — they think "give me the drawing, give me the cutlist, give me the CAD file." Group by type with typed section headers, not by upload date.

### On the horizon (carried from Session 28)
- **Admin dashboard PM-note flag** — user asked for PM notes to show up on the admin home. Straightforward: `SELECT ql.line_number, ql.line_text, l.headline, p.job_name FROM tbl_learnings l JOIN tbl_quote_lines ql ON ql.quote_line_id = l.quote_line_id JOIN tbl_production_plan p ON p.job_id = ql.job_id WHERE l.category = 'pm_note' ORDER BY l.updated_at DESC LIMIT 10`. Render as a card on `/`.
- **Real image thumbnails** — OneDrive direct paths can't be used as `<img src>`; needs a proxy endpoint (or signed-URL generation via Graph API). For now docs show icon placeholders sized like thumbnails.
- **CAD file upload** in the admin WO docs panel — accept `.skp .dwg .3dm .step .iges`, route to `Workshop/{jobNumber}/cad/`
- **Multi-scope rendering** still untested on real data — no quote line has 2+ scopes yet in production


---

## Session 28d — PM RPC fixes: WO-attached BOM + Length-unit cost conversion
**Date**: 20 April 2026
**Deploy**: RPC-only (applied via Supabase migration). No frontend commit required — live on next page load.

### What was wrong
Looking at scope 17 on Grosvenor (pleated polyline wall), two separate bugs surfaced:

1. **Polyline material missing from PM view.** Admin scope page showed 4 materials including "Polyline IFR 60&quot;/150cm Dark Green 54 Metre £243.00"; PM view showed only 1 material (the 3x2 timber) and Spent £201.60 instead of £438+. Root cause: `rpc_pm_job_overview` joined BOM to quote line via `scope_item_id` only. The polyline row had `scope_item_id=NULL, work_order_id=23` — the BOM was attached to the WO directly, not the scope. Any BOM row added from the WO panel rather than the scope panel was being silently dropped.

2. **3x2 Rounded Edge priced at £6.60 instead of £31.68.** Both admin and PM showed `£1.65 × 4 = £6.60`. But `tbl_materials.unit = "Metre"` and `standard_length = 4800 mm`, so £1.65 is the per-**metre** price, and "4 Length" is 4 × 4.8m = 19.2m of timber. Correct cost: £31.68. The BOM row's `unit_cost = 1.65` was inherited from the material's per-metre `current_unit_cost`, but the BOM row's `unit = 'Length'` — unit mismatch was not being reconciled.

### Fix (both in rpc_pm_job_overview v5)

**Dual-path BOM join.** The `bom_raw` CTE now reaches quote line via either scope or work order:
```sql
LEFT JOIN tbl_scope_items si_direct ON si_direct.scope_item_id = b.scope_item_id
LEFT JOIN tbl_work_orders wo ON wo.work_order_id = b.work_order_id
LEFT JOIN tbl_scope_items si_via_wo ON si_via_wo.scope_item_id = wo.scope_item_id
-- quote_line_id = COALESCE(si_direct.quote_line_id, si_via_wo.quote_line_id)
```
And filtered with `WHERE quote_line_id IS NOT NULL` in `bom_grouped` — BOM rows that reach nothing (orphans) stay excluded. A BOM row that appears in both paths (scope and WO agreeing) resolves to one quote line via the coalesce; no risk of double-counting because each BOM row is one source row in the CTE.

**Unit→base multiplier.** Applied only when BOM row's `unit = 'Length'` AND material's `unit IN ('Metre', 'Meter', 'M')` AND `standard_length > 0`:
```sql
CASE
  WHEN LOWER(b.unit) = 'length'
   AND LOWER(m.unit) IN ('metre','meter','m')
   AND m.standard_length > 0
  THEN m.standard_length / 1000.0
  ELSE 1.0
END
```
Multiplier is applied inside `SUM(qty × unit_cost × multiplier)` in `bom_grouped`. Deliberately narrow: doesn't touch floor-covering (where a different convention of `unit='Metre'` + `standard_width_mm` applies), doesn't touch sheets, doesn't touch anything where unit_cost was already stored in the BOM's unit. Only the "per-metre price stored, lengths counted" case is reconciled.

### Regression check
Sum of `materials_total + job_items_total` across all 89 lines of Grosvenor = £9,709.09, matched exactly to raw aggregation of the same BOM rows with the same multiplier in a separate query. No duplication from the dual-path join, no over-counting.

### New/Modified (Session 28d)
| Object | Change |
|--------|--------|
| `rpc_pm_job_overview` | v5 — dual-path BOM join (scope OR WO), unit→base multiplier for Length-on-Metre materials |
| `TRACKER.md` | This entry |

### Conventions added (Session 28d)
- **BOM reaches quote line via two paths**, not one. Scope-attached (`b.scope_item_id` set) and WO-attached (`b.work_order_id` set, `b.scope_item_id` null) are both valid. Any query that aggregates BOM up to quote/job level must handle both — use `COALESCE(si_direct.quote_line_id, si_via_wo.quote_line_id)` with `LEFT JOIN tbl_work_orders` in the middle. This applies to future reports, dashboards, and exports.
- **BOM unit ≠ material unit means conversion, not display.** When `tbl_wo_bom.unit = 'Length'` and `tbl_materials.unit = 'Metre'`, the BOM's `unit_cost` is still per-metre (inherited from material's price), so cost = `qty × unit_cost × (standard_length/1000)`. The earlier convention "BOM total = qty × unit_cost always" (from S16) was too blunt — it accidentally under-prices any timber/linear-trim row stored with unit='Length'.
- **The exception is targeted, not general.** Only Length-on-Metre is reconciled. Floor covering (Metre-on-Metre with width conversion) and Sheet (matched units) stay on the plain `qty × unit_cost` path.

### Admin view has the same Bug 2
The admin scope page (`/jobs/[id]/scope/[scopeId]`) also renders 3x2 Rounded Edge at £6.60. It doesn't use `rpc_pm_job_overview` — it computes BOM totals directly from tbl_wo_bom. Same multiplier logic needs applying on the admin side. Not fixed in this session because the user flagged the PM view specifically; worth doing in the next session as a small, self-contained follow-up so admin cost analysis and procurement totals pick up the correction.
