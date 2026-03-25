# Starlight Web App — Development Tracker

## Project Overview

**What:** Web application replacing MS Access front-end for Starlight Design's production management system.
**Backend:** Supabase (PostgreSQL) — 30 tables, 27+ views, fully migrated from Access.
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

### Migrated from Access (21)
tbl_production_plan, tbl_quotes, tbl_quote_lines, tbl_scope_items, tbl_scope_item_categories, tbl_category_prompts, tbl_job_items, tbl_jobitem_workorder, tbl_work_orders, tbl_wo_bom, tbl_wo_time_entries, tbl_freelancers, tbl_freelancer_schedule, tbl_materials, tbl_material_prices, tbl_material_spec_defs, tbl_master_lookups, tbl_suppliers, tbl_job_attachments, tbl_dummy_source_quote, tbl_dummy_stock_items

### Added by web app (11)
tbl_contractors (DEPRECATED — merged into tbl_suppliers), tbl_quote_line_contractors, tbl_wo_activities, tbl_material_aliases, tbl_invoices, tbl_invoice_lines, tbl_wo_documents, tbl_rate_card, tbl_business_settings, tbl_notifications, tbl_audit_log

### Key Views (27+)
qry_dash_upcoming_jobs, qry_wo_phase_ordered, qry_scope_context, qry_scope_breakdown, qry_manpower_demand, qry_procurement_needed, qry_job_cost_summary, qry_scopeitem_cost_summary, qry_wo_cost_summary, qry_estimate_vs_actual, qry_jobitems_withcoverage, qry_today_roster, qry_supplier_summary, qry_material_reconciliation, qry_material_summary_by_job, qry_quoteline_margin, qry_job_quote_margin, qry_wo_estimated_cost, qry_scope_estimated_cost, qry_job_estimated_cost

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | TypeScript interfaces for all tables and views |
| `src/lib/utils.ts` | Helpers: cn(), formatCurrency(), formatDate(), statusClass(), isTruthy() |
| `src/lib/supabase-browser.ts` | Browser-side Supabase client |
| `src/lib/supabase-admin.ts` | Server-side Supabase client (service role) |
| `src/lib/microsoft-graph.ts` | Microsoft Graph client: auth, upload, download, sharing |
| `src/lib/onedrive-client.ts` | Browser-side OneDrive upload/download helper |
| `src/components/sidebar.tsx` | Main navigation (13 items incl. Settings) |
| `src/components/ui/badges.tsx` | StatusBadge, DaysRemainingBadge, PhasePill |
| `src/components/ui/lookup-combo.tsx` | Reusable dropdown bound to tbl_master_lookups |
| `src/components/cost-breakdown.tsx` | Unified 5-layer cost analysis (replaces quote-margin-panel) |
| `src/components/create-scope-dialog.tsx` | Modal for scope creation (full quote line text) |
| `src/components/contractor-picker.tsx` | Inline supplier assignment (reads tbl_suppliers) |
| `src/components/prompt-panel.tsx` | Category-driven component suggestions |
| `src/components/job-items-table.tsx` | Job items grid with stock search, auto-expanding textareas |
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
- **BOM stores whole standard lengths in Metres** — e.g. 1 length of 4800mm = qty 4.8, unit Metre, at £0.79/m = £3.79
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

### SQL Already Run (Session 8 — no new SQL in Session 9)
- `sql/add-quote-line-qty.sql`: quantity + unit_price columns on tbl_quote_lines
- `sql/session8-multiuser.sql`: tbl_audit_log, updated_at triggers on 6 tables, RLS on audit log
- `sql/session8-time-entry-archive.sql`: archived_at/by/reason on tbl_wo_time_entries, 4 cost views rebuilt with archive filter, today_roster rebuilt
- `sql/seed-grosvenor.sql`: Grosvenor Hotel Wedding job + quote + 89 lines
- Admin role set via: `UPDATE auth.users SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"admin"') WHERE email = '...'`

### Outstanding Work (prioritised)
1. **Supabase Pro upgrade** — CRITICAL before inviting PMs. Enables daily backups + PITR
2. **Scope options UI** — tbl_scope_options exists, needs cards on scope breakdown page (add/select/reject)
3. **Cost waterfall component** — qry_cost_waterfall view exists, needs standalone UI or integration into scope page
4. **Quote import from real source** — currently manual entry only
5. **Schedule `audit_retention_cycle()`** — function created, needs pg_cron on Pro plan (monthly)
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
