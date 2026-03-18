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
- [x] WO list page with activity labels, phase pills, status badges, estimated hours
- [x] Expandable rows with inline BOM (qty, unit cost, total, needs-ordering)
- [x] Material catalogue search with auto-fill + custom entry
- [x] Release as Ready button + WO delete/void with reason
- [x] Freelancer assignment dropdown (planned lead)
- [x] Linked Job Items shown in expanded WO
- [x] Complexity/finish moved to WO level (editable), read-only on scope
- [x] Scope Item delete/cancel with reason
- [x] Scope Items list polished (quote line text, WO progress, value)
- [x] Work Orders tab on Job view (all WOs, phase-ordered)
- [x] Cancelled scopes excluded from auto-complete
- [ ] Traveller PDF with QR code

### Phase 5: Freelancer Mobile ⬜ (enable RLS first!)
### Phase 6: Cost Visibility ⬜
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
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/wo/page.tsx` | Work orders (Phase 4 stub) |
| `src/app/(dashboard)/contractors/page.tsx` | Contractors CRUD |

## Conventions

- All pages are "use client" components reading Supabase directly from browser
- Supabase views (qry_*) handle all joins — frontend never joins tables
- Boolean fields from Supabase come as strings: use `isTruthy()` to check
- CATEGORY_CONFIG in job detail page is single source of truth for category behaviour
- Activity verbs now under category "ACTIVITY" (was "ACTIVITY_VERB")
- Multi-activity WOs: tbl_wo_activities junction, display as "CUT + COVER"
- Auto-expanding textareas for description and finish fields
- Filter pills on quote lines: Workshop, Provisional, Subcontracted, Done, By Zone
- Git commit per phase, deploy via `vercel --prod`
- RLS disabled on all tables — enable before Phase 5

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

Start with: "I'm ready for Phase 4: Work Orders & BOM"

The stub page is at `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/wo/page.tsx`. It needs to become a full WO list with expandable BOM rows, material search, status management, and traveller print. The `qry_wo_phase_ordered` and `qry_wo_with_activities` views are already built and available.
