# Starlight Web App — Development Tracker

## Project Overview

**What:** Web application replacing MS Access front-end for Starlight Design's production management system.
**Backend:** Supabase (PostgreSQL) — 27 tables, 24+ views, fully migrated from Access.
**Frontend:** Next.js 14+ / React / Tailwind CSS / shadcn/ui patterns.
**Hosting:** Vercel (hobby tier) — workshop-five-gamma.vercel.app
**Auth:** Supabase Auth (email+password for PM). RLS enabled on all tables.
**Git:** github.com/mateuszgarwacki-arch/starlight-web
**Deploy:** `vercel --prod` from CLI (use cmd shell, not powershell)

## Build Status

### Phase 0: Foundation ✅
### Phase 1: Dashboard ✅
### Phase 2: Jobs & Quote Lines ✅
### Category Redesign ✅
### Phase 3: Scope Breakdown ✅
### Phase 4: Work Orders & BOM ✅ (Traveller PDF still outstanding)
### Phase 5: Freelancer Mobile ✅
### Phase 5.5: Workshop & Scheduling ✅
### Phase 6: Cost Visibility & Review ✅

### Phase 7: Capacity & Materials ✅
- [x] Materials catalogue page: full CRUD (add/edit/deactivate)
- [x] Category filtering pills, search, show/hide inactive
- [x] Contextual fields: standard_length for Timber/Metal/Fabric, standard_sheet_size for Sheet
- [x] Spec fields (spec_val_1/2/3, spec_text_1/2, paint_finish) in add/edit dialog
- [x] Price History tab: material selector, price entry table, auto-update current_unit_cost
- [x] CURRENT badge on most recent price, clock icon quick-link to price history
- [x] Capacity planning page: demand vs supply overview
- [x] Summary cards: estimated total, hours logged, remaining, booked (4 wks), gap analysis
- [x] Gap indicator: green (surplus), amber (tight), red (shortfall)
- [x] Cross-job conflict detection (same person booked to different jobs same day)
- [x] Per-job demand breakdown: expandable rows with WO-level detail
- [x] Crew availability table with conflict indicators
- [x] Link to Crew Calendar from capacity page

### Invoice Processing System ✅ (NEW)
- [x] `/invoices` page: upload PDF/image, Claude AI extracts line items
- [x] API route `/api/extract-invoice` calls Anthropic API with invoice document
- [x] Auto-match extracted lines against material aliases (high confidence) then fuzzy name match (medium)
- [x] Material search dropdown per line with "Create New Material" option
- [x] New material creation inline: internal name + alias auto-saved from invoice description
- [x] Supplier dropdown (from tbl_suppliers) with inline "+ Add Supplier" dialog
- [x] VAT handling: manual toggle + smart auto-detection (if lines × 1.2 ≈ total, show amber confirmation)
- [x] Total verification: green check when line sum matches invoice total, red with difference
- [x] Per-line job override: each line can override the invoice-level job assignment
- [x] Side-by-side invoice preview (PDF rendered full-width, no thumbnail nav pane)
- [x] Edit existing invoices: pencil icon reopens in edit mode with all lines loaded
- [x] Duplicate detection: warns if invoice number already exists, offers to edit instead
- [x] Delete invoices with confirmation
- [x] Expandable rows in invoice list showing line items (view-only)
- [x] On confirm: updates material price + supplier, saves alias for future auto-matching
- [x] Invoice file temporarily stored in file_data column for review, discardable after

### Suppliers System ✅ (NEW)
- [x] `/suppliers` page: full CRUD with company details, contact, payment terms, account #
- [x] Expandable rows with two tabs: Orders (invoice history) and Materials (linked materials)
- [x] Summary stats per supplier: invoice count, total spend, last order date, material count
- [x] qry_supplier_summary view for aggregated data
- [x] Contractors merged into Suppliers (single entity for all external companies)
- [x] Contractor picker component updated to read from tbl_suppliers
- [x] Contractors page deleted, sidebar updated

### Dashboard Polish ✅
- [x] 5 stat cards: Active Jobs, Active WOs, Items to Order, Unread Flags, Outstanding Hours
- [x] All stat cards clickable with links to relevant pages
- [x] Flags card deep-links to /review?tab=flags
- [x] Review page reads ?tab= URL param to open correct tab
- [x] Active Workers banner: shows who's currently clocked in with pulsing indicators
- [x] Procurement Actions panel: actual BOM items table (material, qty, job) not just count
- [x] Freelancer Flags panel: enriched with context (person, WO description, job, scope item)
- [x] Recent Invoices panel: last 5 processed invoices
- [x] Manpower Demand table: cleaned up columns
- [x] Deleted jobs filtered from dashboard
- [x] Empty jobs (no WOs, no scope) filtered from dashboard

### Phase 8: Polish & Handover ⬜

## Database Tables (27)

### Migrated from Access (21)
tbl_production_plan, tbl_quotes, tbl_quote_lines, tbl_scope_items, tbl_scope_item_categories, tbl_category_prompts, tbl_job_items, tbl_jobitem_workorder, tbl_work_orders, tbl_wo_bom, tbl_wo_time_entries, tbl_freelancers, tbl_freelancer_schedule, tbl_materials, tbl_material_prices, tbl_material_spec_defs, tbl_master_lookups, tbl_suppliers, tbl_job_attachments, tbl_dummy_source_quote, tbl_dummy_stock_items

### Added by web app (6)
tbl_contractors (DEPRECATED — merged into tbl_suppliers), tbl_quote_line_contractors, tbl_wo_activities, tbl_material_aliases, tbl_invoices, tbl_invoice_lines

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | TypeScript interfaces for all tables and views |
| `src/lib/utils.ts` | Helpers: cn(), formatCurrency(), formatDate(), statusClass(), isTruthy() |
| `src/lib/supabase-browser.ts` | Browser-side Supabase client |
| `src/lib/supabase-admin.ts` | Server-side Supabase client (service role) |
| `src/components/sidebar.tsx` | Main navigation |
| `src/components/ui/badges.tsx` | StatusBadge, DaysRemainingBadge, PhasePill |
| `src/components/ui/lookup-combo.tsx` | Reusable dropdown bound to tbl_master_lookups |
| `src/components/create-scope-dialog.tsx` | Modal for scope creation |
| `src/components/contractor-picker.tsx` | Inline supplier assignment (reads tbl_suppliers) |
| `src/components/prompt-panel.tsx` | Category-driven component suggestions |
| `src/components/job-items-table.tsx` | Job items grid with stock search, inline editing |
| `src/components/create-wo-dialog.tsx` | Multi-activity WO creation dialog |
| `src/components/booking-calendar.tsx` | Week grid booking calendar |
| `src/app/(dashboard)/page.tsx` | Main dashboard with stats, procurement, flags, workers |
| `src/app/(dashboard)/jobs/page.tsx` | Jobs list |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | Job detail with quote lines, filter tabs |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | Scope breakdown |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/wo/page.tsx` | Work orders with BOM |
| `src/app/(dashboard)/workshop/page.tsx` | Workshop view - all WOs grouped by scope |
| `src/app/(dashboard)/review/page.tsx` | Cost visibility, time entries, flags, accuracy |
| `src/app/(dashboard)/crew/page.tsx` | Crew management, PINs, booking calendar |
| `src/app/(dashboard)/materials/page.tsx` | Materials catalogue, category filters, price history |
| `src/app/(dashboard)/capacity/page.tsx` | Capacity planning: demand vs supply, conflicts |
| `src/app/(dashboard)/invoices/page.tsx` | Invoice upload, AI extraction, material matching |
| `src/app/(dashboard)/suppliers/page.tsx` | Suppliers CRUD, order history, materials tabs |
| `src/app/api/extract-invoice/route.ts` | API: Claude-powered invoice PDF/image extraction |
| `src/app/api/auth/freelancer-sync/route.ts` | API: create/update freelancer auth accounts |
| `src/app/api/onedrive/upload/route.ts` | API: upload files to OneDrive via Graph API |
| `src/app/api/onedrive/download/route.ts` | API: get download URLs from OneDrive |
| `src/lib/microsoft-graph.ts` | Microsoft Graph client: auth, upload, download, sharing |
| `src/lib/onedrive-client.ts` | Browser-side OneDrive upload/download helper |
| `src/components/wo-documents-panel.tsx` | WO file management: drawings, references, cut lists, models |
| `src/components/cutlist-extractor.tsx` | AI cut list extraction + BOM import with material summary |
| `src/app/api/extract-cutlist/route.ts` | API: Claude-powered cut list CSV/PDF extraction |
| `src/app/m/layout.tsx` | Mobile layout with bottom tab bar |
| `src/app/m/login/page.tsx` | Freelancer PIN login |
| `src/app/m/page.tsx` | Mobile task list |
| `src/app/m/wo/[woId]/page.tsx` | Mobile WO detail - START/JOIN/LOG/COMPLETE |
| `src/app/m/me/page.tsx` | Mobile profile + booking accept/decline |
| `src/app/m/photos/page.tsx` | Site photos placeholder |

## Conventions

- All pages are "use client" components reading Supabase directly from browser
- Supabase views (qry_*) handle all joins — frontend never joins tables
- Boolean fields: `isTruthy()` handles both real booleans and string "true" (ODBC legacy)
- RLS enabled on all tables — PM/Foreman/Freelancer policies active
- Freelancer auth: phone@starlight.local + PIN via Supabase Auth
- WO sequence: wo_sequence column drives step ordering, reorderable by PM
- Complexity/finish live on WOs (primary), read-only on scope items
- CATEGORY_CONFIG in job detail page is single source of truth for category behaviour
- Activity verbs under category "ACTIVITY" in master lookups
- Multi-activity WOs: tbl_wo_activities junction, display as "CUT + COVER"
- Contractors merged into Suppliers — tbl_contractors deprecated, tbl_suppliers is canonical
- Invoice processing: Claude API extracts lines, aliases auto-build over time
- Deploy via cmd shell (not powershell — vercel script blocked by execution policy)
- File deployment: Desktop Commander write_file with mode 'rewrite' then 'append' chunks (~300 lines each)

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
| ANTHROPIC_API_KEY | Invoice AI extraction | For invoice upload feature |
| MICROSOFT_TENANT_ID | Azure AD tenant ID | For OneDrive integration |
| MICROSOFT_CLIENT_ID | Azure AD app client ID | For OneDrive integration |
| MICROSOFT_CLIENT_SECRET | Azure AD app secret | For OneDrive integration |
| MICROSOFT_DRIVE_ID | SharePoint document library drive ID | For OneDrive file storage |

## Next Session Pickup

Phases 0-7 complete + Invoice system + Suppliers + Dashboard polish + Phase 8 partial. Remaining:

### Phase 8: Polish & Handover
- Traveller PDF with QR code (parked until WO workflow finalised)
- Three.js 3D model viewer inline (Phase C — upload works, viewer is placeholder)
- Freelancer mobile document view (Phase D — drawings/models visible to freelancers)
- Loading states, error handling, toast notifications
- Materials: dynamic spec field labels from tbl_material_spec_defs (deferred)
- Job templating / clone from previous build (Tier 3 feature — discussed, not started)

### Completed this session (19 Mar 2026)
- [x] Material reconciliation tab on Review page (BOM planned vs invoice actual, per-job expandable)
- [x] Quote Line Margin Analysis panel on Job detail page (quoted vs actual per line, margin %)
- [x] Mobile site photos page (lists Workshop Complete items, camera + waiver)
- [x] 4 new Supabase views: qry_material_reconciliation, qry_material_summary_by_job, qry_quoteline_margin, qry_job_quote_margin
- [x] Fix: WO coverage indicator refreshes on window focus
- [x] Fix: Review page time entries show activity verb labels + scope + job
- [x] Fix: Dashboard Active Jobs only counts jobs with WOs
- [x] Fix: Capacity page shows activity verb labels in expanded WO detail
- [x] OneDrive integration: Microsoft Graph API, SharePoint document library, structured folders
- [x] Photo upload from mobile (WO completion + scope site photos) to OneDrive
- [x] Fix: mobile bottom sheet z-index overlap with tab bar
- [x] WO Documents panel: drawings, references, cut lists, 3D models — upload to OneDrive
- [x] Cut List AI extraction: OpenCutList CSV support, material matching, sheet/length optimisation
- [x] Two-layer cut list view: material summary (BOM) + parts list (reference)
- [x] BOM auto-refresh after cut list import

### OneDrive Integration ✅
- [x] Microsoft Graph client library (src/lib/microsoft-graph.ts): token caching, upload, download, sharing links
- [x] Client-side helper (src/lib/onedrive-client.ts): uploadToOneDrive(), getOneDriveUrl()
- [x] API route: /api/onedrive/upload (auth-gated, multipart form)
- [x] API route: /api/onedrive/download (auth-gated, path-based)
- [x] Mobile WO completion uses OneDrive upload
- [x] Mobile site photos uses OneDrive upload
- [x] Vercel env vars set: MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_DRIVE_ID
- [x] Azure AD app has Sites.ReadWrite.All permission with admin consent
- [x] Upload tested and confirmed working to SharePoint
- Target: Starlight Design Team Site root → /Shared Documents/Workshop/
- Subfolders: Workshop/WO-Photos/, Workshop/Scope-Photos/ (auto-created on first upload)
- Future: Workshop/Models/, Workshop/Drawings/

### WO Documents & Cut List Extraction ✅ (NEW)
- [x] tbl_wo_documents table (cut_list, drawing, reference, model types)
- [x] WODocumentsPanel component: upload, preview, download, delete per doc type
- [x] Drawings: thumbnail grid with lightbox preview, multi-upload
- [x] References: same as drawings, separate category
- [x] Cut Lists: upload CSV/PDF, AI extraction via Claude API
- [x] Cut list extraction: reads OpenCutList CSV, understands naming conventions (2x1=timber, MDF18=sheet etc.)
- [x] Material summary: groups parts by material, calculates sheets/lengths needed with waste %
- [x] Two-layer view: "Materials to Order" (goes to BOM) + expandable parts list (reference)
- [x] Catalogue context: sends materials database to Claude for better matching
- [x] Add to BOM: creates one line per material type (not per part), auto-matches catalogue, notes include parts list
- [x] BOM auto-refresh after cut list import (async callback)
- [x] 3D Models: upload .glb/.gltf, placeholder viewer (Phase C: Three.js), download link
- [x] OneDrive folder structure: Workshop/{job}/Drawings/, References/, Cut-Lists/, Models/
- [x] Descriptive filenames with activity + scope name prefix

### Known bugs/improvements (remaining)
- Workshop view: could add real-time Supabase subscription for live updates
- Invoice page: could add "Create Supplier" inline from extracted name (+ button exists, basic name only — could pre-fill contact from invoice)
- Suppliers: could add search/filter on invoice lines tab
