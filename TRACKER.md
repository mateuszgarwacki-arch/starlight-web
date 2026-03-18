# Starlight Web App — Development Tracker

## Project Overview

**What:** Web application replacing MS Access front-end for Starlight Design's production management system.
**Backend:** Supabase (PostgreSQL) — 24 tables, 23+ views, fully migrated from Access.
**Frontend:** Next.js 14+ / React / Tailwind CSS / shadcn/ui patterns.
**Hosting:** Vercel (hobby tier) — workshop-five-gamma.vercel.app
**Auth:** Supabase Auth (email+password for PM). RLS disabled — enable before Phase 5.
**Git:** github.com/mateuszgarwacki-arch/starlight-web
**Deploy:** `vercel --prod` from CLI

## Build Status

### Phase 0: Foundation ✅
- [x] Next.js project with Tailwind + TypeScript
- [x] Supabase client (browser + server)
- [x] Login page, auth middleware
- [x] Sidebar navigation, dashboard layout
- [x] TypeScript types, utility functions, shared components

### Phase 1: Dashboard ✅
- [x] Quick stats cards, job cards with progress bars
- [x] Manpower demand table, procurement alerts
- [x] Live data from Supabase views

### Phase 2: Jobs & Quote Lines ✅
- [x] Jobs list with search
- [x] Job detail with editable quote lines
- [x] Inline category dropdown editing
- [x] Interpretation toggle (hybrid auto-tick)
- [x] PM notes inline editing
- [x] Create Scope Item dialog (auto-populates name from quote line)
- [x] Scope Items tab with navigation
- [x] Quote summary bar
- [x] Filter pills: All, Workshop, Provisional, Subcontracted, Done, By Zone
- [x] Zone-grouped view with subtotals

### Category Redesign ✅
- [x] tbl_contractors + tbl_quote_line_contractors tables
- [x] qry_quote_lines_with_contractors view
- [x] CATEGORY_CONFIG object — single source of truth for per-category behaviour
- [x] Context-sensitive actions (scope/contractor/stock pick per category)
- [x] ContractorPicker component inline on subcontracted lines
- [x] Contractors management page (full CRUD)
- [x] Stock Pick purple tag
- [x] Hybrid auto-tick: auto-completes when required action done, manual override allowed
- [x] "Hire" merged into Subcontracted, duplicate Install removed
- [x] Provisional cannot have scope items (enforced)

### Phase 3: Scope Breakdown ✅
- [x] Scope detail page — title from quote line text (no separate name field)
- [x] Editable header: status, category, complexity, finish, event zone, description
- [x] Prompt engine panel (category → suggested components, +/× per suggestion)
- [x] Job items table: inline editing, auto-expanding description + finish textareas
- [x] Stock search dropdown on job items
- [x] Checkbox selection → Create Work Order dialog
- [x] Multi-activity WOs: pick multiple activities, reorder, displays as "CUT + COVER"
- [x] tbl_wo_activities junction table in Supabase
- [x] qry_wo_with_activities + updated qry_wo_phase_ordered views
- [x] ACTIVITY_VERB renamed to ACTIVITY in master lookups
- [x] Coverage indicator per job item when WO linked
- [x] Finish field: wider, amber warning on empty Stock-Needs-Work items
- [x] Unit column removed (absorbed into description/finish)
- [x] Work Orders link card with WO count

### Phase 4: Work Orders & BOM ✅
- [x] WO list page with activity labels, status badges, estimated hours
- [x] Expandable rows with inline BOM (qty, unit cost, total, needs-ordering)
- [x] Material catalogue search with auto-fill + custom entry
- [x] Release as Ready button + WO delete/void with reason
- [x] Freelancer assignment dropdown (planned lead)
- [x] Linked Job Items shown in expanded WO (qty, description, type, finish)
- [x] Complexity/finish moved to WO level (editable), read-only on scope
- [x] Scope Item delete/cancel with reason
- [x] Scope Items list polished (quote line text, WO progress, value)
- [x] Work Orders tab on Job view (all WOs across scope items)
- [x] Cancelled scopes excluded from auto-complete
- [x] WO sequence system (wo_sequence column, step indicators, reorder arrows)
- [x] Step progress display: "Step 2/3 - prev: done" replaces phase pills
- [ ] Traveller PDF with QR code

### Phase 5: Freelancer Mobile ✅
- [x] RLS enabled on all 22 tables (PM/Foreman/Freelancer policies)
- [x] Supabase Auth for freelancers (phone@starlight.local + PIN)
- [x] API route /api/auth/freelancer-sync (create/update auth users)
- [x] Mobile layout with bottom tab bar (Tasks, Photos, Me)
- [x] Mobile login page (phone + PIN)
- [x] Task list with MY TASKS / ALL TASKS toggle, phase-ordered cards
- [x] WO detail with START, JOIN, LOG HOURS (bottom sheet), MARK COMPLETE (camera)
- [x] Site Photos placeholder page
- [x] Profile page with sign out
- [x] Crew page: full CRUD, visible PINs, PIN management dialog
- [x] WhatsApp onboarding message generator (copy to clipboard)
- [x] Boolean handling fix (isTruthy supports real booleans globally)

### Phase 5.5: Workshop & Scheduling ✅
- [x] Workshop view (Zone 2): all WOs across jobs, grouped by scope item
- [x] Coloured step circles (green=done, blue=active, amber=next, grey=waiting)
- [x] Time entries expandable per WO (person, hours, rate, cost, flags)
- [x] Status/job/search filters with counts
- [x] Active workers banner
- [x] Crew booking calendar: week grid, click to book, job link optional
- [x] Booking dialog with job picker, notes, remove booking
- [x] Booking status colours (amber=booked, green=confirmed, red=declined)
- [x] Mobile /m/me: upcoming bookings with Accept/Decline buttons

### Phase 6: Cost Visibility & Review ✅
- [x] Review page with 4 tabs: Job Costs, Time Entries, Flags, Estimate Accuracy
- [x] Summary strip: total quote value, actual cost, margin, unread flags
- [x] Job costs: expandable per job with scope item cost breakdown
- [x] Time entries table: person, WO, timestamps, hours, rate, cost, flag notes
- [x] Flags tab: dedicated view of flagged time entries
- [x] Estimate accuracy: estimated vs actual hours, variance, accuracy percentage
- [x] Colour-coded accuracy (green <=110%, amber <=150%, red >150%)

### Phase 7: Capacity & Materials ⬜
### Phase 8: Polish & Handover ⬜

## Category Behaviour Matrix

| Category | Amber | Done | Auto-Complete When | [+] Scope | Contractor | Stock Tag |
|----------|-------|------|-------------------|-----------|------------|-----------|
| Workshop / Workshop Build | Yes | Yes | Scope created | Yes | No | No |
| Stock-and-Hire | Yes | Yes | Scope created | Yes | No | No |
| Stock Pick | No | Yes | Manual only | No | No | Yes |
| Subcontracted | No | Yes | Contractor assigned | No | Yes | No |
| Subcontracted (Partial) | Yes | Yes | Scope + contractor | Yes | Yes | No |
| Install | No | Yes | Manual only | No | No | No |
| Provisional | No | Yes | Never (recategorise first) | No | No | No |
| Shared Departments | Yes | Yes | Scope created | Yes | No | No |

## Database Tables (24)

### Migrated from Access (21)
tbl_production_plan, tbl_quotes, tbl_quote_lines, tbl_scope_items, tbl_scope_item_categories, tbl_category_prompts, tbl_job_items, tbl_jobitem_workorder, tbl_work_orders, tbl_wo_bom, tbl_wo_time_entries, tbl_freelancers, tbl_freelancer_schedule, tbl_materials, tbl_material_prices, tbl_material_spec_defs, tbl_master_lookups, tbl_suppliers, tbl_job_attachments, tbl_dummy_source_quote, tbl_dummy_stock_items

### Added by web app (3)
tbl_contractors, tbl_quote_line_contractors, tbl_wo_activities

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | TypeScript interfaces for all tables and views |
| `src/lib/utils.ts` | Helpers: cn(), formatCurrency(), formatDate(), statusClass(), isTruthy() |
| `src/lib/supabase-browser.ts` | Browser-side Supabase client |
| `src/components/sidebar.tsx` | Main navigation (includes Contractors) |
| `src/components/ui/badges.tsx` | StatusBadge, DaysRemainingBadge, PhasePill |
| `src/components/ui/lookup-combo.tsx` | Reusable dropdown bound to tbl_master_lookups |
| `src/components/create-scope-dialog.tsx` | Modal for scope creation (auto-populates name) |
| `src/components/contractor-picker.tsx` | Inline contractor assignment |
| `src/components/prompt-panel.tsx` | Category-driven component suggestions |
| `src/components/job-items-table.tsx` | Job items grid with stock search, inline editing |
| `src/components/create-wo-dialog.tsx` | Multi-activity WO creation dialog |
| `src/app/(dashboard)/page.tsx` | Main dashboard |
| `src/app/(dashboard)/jobs/page.tsx` | Jobs list |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | Job detail with filter tabs and quote lines |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | Scope breakdown |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/wo/page.tsx` | Work orders with BOM, step indicators, reorder |
| `src/app/(dashboard)/contractors/page.tsx` | Contractors CRUD |
| `src/app/(dashboard)/workshop/page.tsx` | Workshop view - all WOs grouped by scope |
| `src/app/(dashboard)/review/page.tsx` | Cost visibility, time entries, flags, accuracy |
| `src/app/(dashboard)/crew/page.tsx` | Crew management, PINs, booking calendar |
| `src/app/m/layout.tsx` | Mobile layout with bottom tab bar |
| `src/app/m/login/page.tsx` | Freelancer PIN login |
| `src/app/m/page.tsx` | Mobile task list |
| `src/app/m/wo/[woId]/page.tsx` | Mobile WO detail - START/JOIN/LOG/COMPLETE |
| `src/app/m/me/page.tsx` | Mobile profile + booking accept/decline |
| `src/app/m/photos/page.tsx` | Site photos placeholder |
| `src/app/api/auth/freelancer-sync/route.ts` | API: create/update freelancer auth accounts |
| `src/lib/supabase-admin.ts` | Server-side Supabase client (service role) |
| `src/components/booking-calendar.tsx` | Week grid booking calendar |

## Conventions

- All pages are "use client" components reading Supabase directly from browser
- Supabase views (qry_*) handle all joins — frontend never joins tables
- Boolean fields: `isTruthy()` handles both real booleans and string "true" (ODBC legacy)
- Supabase queries use `.eq("active", true)` (real boolean, not string)
- RLS enabled on all 22 tables — PM/Foreman/Freelancer policies active
- Freelancer auth: phone@starlight.local + PIN via Supabase Auth
- WO sequence: wo_sequence column drives step ordering, reorderable by PM
- Complexity/finish live on WOs (primary), read-only on scope items
- CATEGORY_CONFIG in job detail page is single source of truth for category behaviour
- Activity verbs now under category "ACTIVITY" (was "ACTIVITY_VERB")
- Multi-activity WOs: tbl_wo_activities junction, display as "CUT + COVER"
- Auto-expanding textareas for description and finish fields
- Filter pills on quote lines: Workshop, Provisional, Subcontracted, Done, By Zone
- Git commit per phase, deploy via `vercel --prod`

## Deployment Cheat Sheet

```bash
# Copy a downloaded file into the project
copy C:\Users\mateusz.garwacki\Downloads\FILENAME.tsx "src\path\to\file.tsx"

# Deploy
vercel --prod

# Commit
git add .
git commit -m "Description"
git push
```

## Next Session Pickup

Phases 0-6 complete. Remaining work:

### Outstanding SQL
- Run Phase5_Schedule_Extend.sql (corrected version without policies) — adds status, job_id, notes, created_at to tbl_freelancer_schedule

### Phase 7: Capacity & Materials
- Capacity/manpower page (from qry_manpower_demand)
- Materials catalogue management page
- Cross-job conflict detection

### Phase 8: Polish & Handover
- Traveller PDF with QR code (Phase 4 leftover)
- Loading states, error handling
- Supabase storage bucket for completion photos
- Dashboard polish (procurement actions, flags count)
- Mobile: site photos page (currently placeholder)

### Known bugs/improvements to address
- WO coverage indicator doesn't refresh after deleting a WO (needs page reload)
- Workshop view: could add real-time Supabase subscription for live updates
- Review page: time entries need WO activity labels enriched (currently shows description only)
