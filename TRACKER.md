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

### Security (Session 7 — mandatory for all future development)

### Audit & Multi-User (Session 8 — mandatory for all future development)
- **Audit all writes on key tables**: use `auditedUpdate()` from `src/lib/audit.ts` instead of raw `supabase.from().update()`. Covers: tbl_quote_lines, tbl_scope_items, tbl_work_orders, tbl_wo_bom, tbl_production_plan, tbl_quotes, tbl_wo_time_entries, tbl_freelancers
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
- Audit logging live on all key tables with revert capability
- Time entry archive system live with cost exclusion across entire app
- Freelancer detail page live at /crew/[id]

### SQL Already Run (Session 8)
- `sql/add-quote-line-qty.sql`: quantity + unit_price columns on tbl_quote_lines
- `sql/session8-multiuser.sql`: tbl_audit_log, updated_at triggers on 6 tables, RLS on audit log
- `sql/session8-time-entry-archive.sql`: archived_at/by/reason on tbl_wo_time_entries, 4 cost views rebuilt with archive filter, today_roster rebuilt
- `sql/seed-grosvenor.sql`: Grosvenor Hotel Wedding job + quote + 89 lines
- Admin role set via: `UPDATE auth.users SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"admin"') WHERE email = '...'`

### Outstanding Work (prioritised)
1. **Optimistic concurrency** — `updated_at` columns exist, need conflict detection on save (show "modified by X, reload?")
2. **Real-time presence** — Supabase Realtime presence channels: who's viewing what job/scope, soft edit signals
3. **Wire audit into remaining insert paths** — new WO creation, new BOM rows, new scope items currently use plain insert
4. **Audit log retention** — monthly cleanup of closed job entries (hot→warm→cold lifecycle)
5. **Quote import from real source** — currently manual entry only
6. **Drop tbl_freelancers.pin column** — code references removed, confirm nothing breaks then ALTER TABLE DROP COLUMN
7. **Supabase Pro upgrade** — CRITICAL before inviting PMs. Enables daily backups + PITR
8. Job templating, precedent search, 2D sheet nesting, cross-job analytics (Tier 3)

### New Routes (Session 8)
| Route | Purpose |
|-------|---------|
| `/crew/[id]` | Freelancer detail: profile, stats, activity timeline, bookings, admin controls |
| `/api/auth/manage-user` | Staff account management: create, update role, reset password, list |

### Test Workflow for Session 8 Features
1. **New Job**: /jobs → + New Job → fill form → verify lands on job detail with empty quote lines tab
2. **Add Quote Line**: on any job → + Add Quote Line → fill description + qty + unit_price → verify auto-calculates value
3. **Inline edit**: click any quote line description/value/qty → edit → blur → verify saved
4. **Delete line**: click trash on line without scope → confirm → verify removed
5. **User management**: Settings → Users → Add User → create PM account → verify they can log in
6. **Audit log**: make any edit → Settings → Audit Log → verify entry appears with old/new values
7. **Revert**: click Revert on an audit entry → verify value restored
8. **Freelancer detail**: Crew → click name → verify profile loads with stats, timeline, bookings
9. **Archive time entry**: on freelancer detail → click archive icon → enter reason → verify entry greyed out
10. **Cost exclusion**: after archive → check job cost analysis → verify archived entry cost excluded
