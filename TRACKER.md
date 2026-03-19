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

## Database Tables (28)

### Migrated from Access (21)
tbl_production_plan, tbl_quotes, tbl_quote_lines, tbl_scope_items, tbl_scope_item_categories, tbl_category_prompts, tbl_job_items, tbl_jobitem_workorder, tbl_work_orders, tbl_wo_bom, tbl_wo_time_entries, tbl_freelancers, tbl_freelancer_schedule, tbl_materials, tbl_material_prices, tbl_material_spec_defs, tbl_master_lookups, tbl_suppliers, tbl_job_attachments, tbl_dummy_source_quote, tbl_dummy_stock_items

### Added by web app (7)
tbl_contractors (DEPRECATED — merged into tbl_suppliers), tbl_quote_line_contractors, tbl_wo_activities, tbl_material_aliases, tbl_invoices, tbl_invoice_lines, tbl_wo_documents

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
| `src/app/(dashboard)/orders/page.tsx` | Procurement management: outstanding items grouped by material, mark ordered, recent orders |
| `src/app/api/extract-invoice/route.ts` | API: Claude-powered invoice PDF/image extraction |
| `src/app/api/auth/freelancer-sync/route.ts` | API: create/update freelancer auth accounts |
| `src/app/api/onedrive/upload/route.ts` | API: upload files to OneDrive via Graph API |
| `src/app/api/onedrive/download/route.ts` | API: get download URLs from OneDrive |
| `src/lib/microsoft-graph.ts` | Microsoft Graph client: auth, upload, download, sharing |
| `src/lib/onedrive-client.ts` | Browser-side OneDrive upload/download helper |
| `src/components/wo-documents-panel.tsx` | WO file management: drawings, references, cut lists, models |
| `src/components/model-viewer.tsx` | Three.js GLB/GLTF viewer with OrbitControls, studio lighting, auto-fit |
| `src/components/mobile-wo-docs.tsx` | Mobile read-only document view: thumbnails, lightbox, 3D viewer |
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

Phases 0-7 complete + Invoice system + Suppliers + Dashboard polish + Phase 8 mostly done. Remaining:

### Phase 8: Polish & Handover
- **Traveller PDF with QR code** — NEXT PRIORITY. Mateusz will provide full spec. Chelsea In Bloom job (13794) being built out with WOs, drawings, and models as the test case.
- ~~Three.js 3D model viewer inline (Phase C)~~ ✅ DONE
- ~~Freelancer mobile document view (Phase D)~~ ✅ DONE
- ~~Orders page — procurement management~~ ✅ DONE
- ~~Editable job header~~ ✅ DONE
- Loading states, error handling, toast notifications
- Materials: dynamic spec field labels from tbl_material_spec_defs (deferred)
- Job templating / clone from previous build (Tier 3 feature — discussed, not started)
- Create job from UI (currently requires SQL insert — needed before go-live)

### Completed Session 4 (19 Mar 2026 — afternoon)
- [x] Three.js 3D model viewer: GLB/GLTF with OrbitControls, studio lighting, auto-fit, fullscreen, reset
- [x] Mobile document view: drawings (thumbnail grid + lightbox), 3D models (inline viewer), cut lists (download)
- [x] Orders page (/orders): outstanding items grouped by material, mark-as-ordered workflow, recently ordered tab
- [x] Smart supplier dropdown: last-used supplier first, order history per material, divider, then alphabetical rest
- [x] Dashboard fix: procurement panel columns (material_name not company_name), stat card links to /orders
- [x] Sidebar: Orders link between Materials and Invoices
- [x] Editable job header: click-to-edit job name, client, event date, location with pencil icon on hover
- [x] 2 new Supabase views: qry_procurement_needed (replaced with joins), qry_recent_orders
- [x] New column: tbl_wo_bom.expected_delivery (DATE)
- [x] Bug fix: supplier column name (supplier_name not company_name throughout)
- [x] Bug fix: boolean filter logic — exclude false, don't require true (handles null = active)
- [x] Chelsea In Bloom job (13794) created in Supabase — Mateusz building out WOs manually

### SQL that needs running (if not already done)
```sql
-- Add expected_delivery column to BOM
ALTER TABLE tbl_wo_bom ADD COLUMN IF NOT EXISTS expected_delivery DATE;

-- Replace procurement view with proper joins  
DROP VIEW IF EXISTS qry_procurement_needed;
CREATE VIEW qry_procurement_needed AS
SELECT b.bom_id, b.work_order_id, b.job_id, b.material_id, b.material_category,
  b.item_description, b.stock_reference, b.quantity, b.unit, b.unit_cost,
  b.actual_unit_cost, b.supplier, b.needs_ordering, b.ordered_at, b.ordered_by,
  b.expected_delivery, b.notes,
  COALESCE(m.material_name, b.item_description) AS material_name,
  m.standard_length, m.standard_sheet_size,
  j.job_number, j.job_name, j.event_date,
  w.description AS wo_description, w.scope_item_id,
  s.item_name AS scope_name, mc.lookup_value AS category_name
FROM tbl_wo_bom b
LEFT JOIN tbl_materials m ON m.material_id = b.material_id
LEFT JOIN tbl_production_plan j ON j.job_id = b.job_id
LEFT JOIN tbl_work_orders w ON w.work_order_id = b.work_order_id
LEFT JOIN tbl_scope_items s ON s.scope_item_id = w.scope_item_id
LEFT JOIN tbl_master_lookups mc ON mc.lookup_id = b.material_category
WHERE b.needs_ordering = true AND b.ordered_at IS NULL;

-- Create recent orders view
DROP VIEW IF EXISTS qry_recent_orders;
CREATE VIEW qry_recent_orders AS
SELECT b.bom_id, b.work_order_id, b.job_id, b.material_id, b.material_category,
  b.item_description, b.quantity, b.unit, b.unit_cost, b.actual_unit_cost,
  b.supplier, b.ordered_at, b.ordered_by, b.expected_delivery, b.notes,
  COALESCE(m.material_name, b.item_description) AS material_name,
  j.job_number, j.job_name, w.description AS wo_description,
  s.item_name AS scope_name, f.freelancer_name AS ordered_by_name
FROM tbl_wo_bom b
LEFT JOIN tbl_materials m ON m.material_id = b.material_id
LEFT JOIN tbl_production_plan j ON j.job_id = b.job_id
LEFT JOIN tbl_work_orders w ON w.work_order_id = b.work_order_id
LEFT JOIN tbl_scope_items s ON s.scope_item_id = w.scope_item_id
LEFT JOIN tbl_freelancers f ON f.freelancer_id = b.ordered_by
WHERE b.ordered_at IS NOT NULL ORDER BY b.ordered_at DESC;
```

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

## Build Progress Log

### Session 1 (17 Mar 2026) — Foundation + Dashboard + Jobs
14 commits. Phases 0-6 shipped. RLS on 22 tables. Mobile interface with PIN auth. Workshop view, crew calendar, cost review.

### Session 2 (18 Mar 2026) — Phase 7 + Invoices + Suppliers + Polish
Phase 7 complete. Invoice AI extraction. Suppliers system. Dashboard polish. Deployment guide created.

### Session 3 (19 Mar 2026) — Phase 8 Partial: OneDrive + Documents + Cut Lists
16 commits, 15 features. Material reconciliation + quote margin analysis. OneDrive integration via Microsoft Graph API. WO documents panel (drawings, references, cut lists, models). Cut list AI extraction with OpenCutList support. 4 bug fixes. Azure AD app registration configured.

### Session 4 (19 Mar 2026) — Phase 8C+D: 3D Viewer + Mobile Docs + Orders + Job Editing
8 commits. Three.js GLB/GLTF viewer replacing placeholder. Mobile document view for freelancers. Orders page with material grouping, mark-ordered workflow, smart supplier dropdown (last-used first). Dashboard procurement fix. Editable job header (click-to-edit). Supplier column name fix (supplier_name not company_name). Boolean filter fix (exclude false, don't require true).

## Lessons Learned & Execution Rules

### Deployment
- **cmd shell only** for `git commit` and `vercel --prod` — PowerShell blocks vercel via execution policy, and spaces in commit messages break
- **PowerShell or Desktop Commander:create_directory** for creating dirs — cmd `mkdir` fails on paths with parentheses (Next.js App Router uses them)
- **Commit messages use hyphens** not spaces: `"Phase-8-material-recon"` — quoting doesn't work reliably across shells
- **Chunk file writes ~300 lines** via Desktop Commander write_file. First chunk: mode 'rewrite', subsequent: mode 'append'. Check boundaries for duplicate closing tags.
- **Can clone repo in container** (github.com/mateuszgarwacki-arch/starlight-web is public) — useful for reading code, but can't push from container. Build in container, deploy via Desktop Commander write_file.
- **Deploy cycle**: edit on local via Desktop Commander → `git add -A && git commit && git push && vercel --prod` all in one cmd command
- **Vercel env vars via pipe** add trailing newlines — use interactive `vercel env add` with interact_with_process for clean values

### SQL & Database
- **ALTER TABLE before CREATE VIEW** — PostgreSQL validates view columns at creation time
- **DROP VIEW IF EXISTS before CREATE VIEW** — `CREATE OR REPLACE VIEW` can't change column list
- **RLS policies**: wrap in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` to avoid re-run errors
- **Boolean handling**: always use `isTruthy()` — Supabase returns real booleans but ODBC legacy left string "true"/"false" in some columns
- **Run SQL before deploying UI** that depends on new views/tables — UI will show empty but won't error

### Next.js / React
- **useSearchParams requires Suspense in Next.js 16** — use `window.location.search` in useEffect instead
- **State doesn't refresh when navigating back** — Next.js preserves page state. Use window `focus` event listener to refetch data when returning from sub-pages.
- **Bottom sheets need z-[60]** or higher to clear the mobile tab bar (z-50). Add `pb-10` padding so buttons aren't hidden behind safe area.
- **Async callbacks between components**: when child component changes data that parent displays, the callback must be `async` and `await` the parent's reload function. Otherwise the parent fetches stale data.
- **File inputs need ref reset** after upload: `fileRef.current.value = ""` — otherwise same file can't be re-selected
- **Three.js must be dynamically imported** in Next.js — `await import("three")` inside useCallback to avoid SSR. OrbitControls and GLTFLoader from `three/examples/jsm/`. Cleanup must dispose renderer, controls, and cancel animation frame.
- **`@types/three` goes in devDependencies** — not needed at runtime

### OneDrive / Microsoft Graph
- **Client credentials flow** (app-only auth) needs `Sites.ReadWrite.All` application permission + admin consent to access SharePoint
- **Admin consent is a separate step** — adding the permission in Azure AD isn't enough. Must click "Grant admin consent" button. Token will have `roles: "none"` until consented.
- **Decode JWT payload** to check actual permissions: `JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())` → check `roles` array
- **Permission propagation** can take up to 15 minutes after admin consent
- **Drive ID not Site ID**: for direct file operations use `drives/{driveId}` not `sites/{siteId}/drive`. Get drive ID from the site's drives list.
- **"Workshop" was a folder not a site** — resolve sharing links via `/v1.0/shares/{encodedUrl}/driveItem` to find parent drive and path
- **Buffer type fails in fetch body** — use `new Uint8Array(arrayBuffer)` for TypeScript compatibility
- **Structured folder naming**: `Workshop/{jobNumber} - {jobName}/{docType}/` — sanitise names (no special chars, hyphens for spaces)

### AI Extraction (Claude API)
- **Send materials catalogue as context** to the extraction prompt — dramatically improves matching accuracy
- **Workshop naming conventions must be in the prompt**: "2x1" = 2x1 PAR Softwood (44x19mm), "MDF18" = 18mm MDF, "ply18" = 18mm Plywood
- **Cut list → BOM should be material summary, not individual parts**: 3 pieces of 600x300 MDF = 1 standard sheet to order. Parts list is reference, material summary is what goes to BOM.
- **Two-layer extraction view**: "Materials to Order" (actionable, goes to BOM) + "Individual Parts" (reference, expandable)
- **Local CSV parse first**: if headers are obvious, skip AI. If ambiguous columns, use AI. Saves API cost.

### UX Patterns
- **State changes must be visible immediately** — don't make users refresh. Use local state (`useState`) to track status transitions (pending → extracted → confirmed), then sync to database in background.
- **Callbacks must refresh the specific section that changed** — when cut list adds BOM items, refresh the BOM table, not the whole page. Pass specific reload function as callback, not a general "refresh everything".
- **Upload → extract → review → confirm** flow must work without any page navigation. Each step updates in-place.
- **Lightbox for images, download for documents** — don't try to render PDFs inline on mobile
- **z-index layering**: tab bar=50, bottom sheets=60, lightbox/modals=70

### Naming & Schema
- **tbl_suppliers uses `supplier_name`** not `company_name` — established when contractors merged into suppliers (Session 2). Always check the actual interface/types before referencing columns.
- **Boolean filter logic: exclude false, don't require true** — `active` column may be null (never set), true, "true", or "-1" depending on data source (ODBC, web app, manual SQL). Filter as `!== false && !== "false"` to treat null as active by default.
- **Smart supplier dropdown pattern**: query order history for the selected material_id to find last-used supplier. Pre-select it and show at top with ★ prefix. Other historical suppliers show with ↻ prefix. Divider line, then alphabetical rest. Builds intelligence over time with zero configuration.
