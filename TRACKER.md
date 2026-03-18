# Starlight Web App — Development Tracker

## Project Overview

**What:** Web application replacing MS Access front-end for Starlight Design's production management system.
**Backend:** Supabase (PostgreSQL) — 23 tables, 22+ views, fully migrated from Access.
**Frontend:** Next.js 14+ / React / Tailwind CSS / shadcn/ui patterns.
**Hosting:** Vercel (hobby tier) — workshop-five-gamma.vercel.app
**Auth:** Supabase Auth (email+password for PM). RLS disabled — enable before Phase 5.
**Git:** github.com/mateuszgarwacki-arch/starlight-web
**Deploy:** `vercel --prod` from CLI (not GitHub auto-deploy)

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
- [x] Job detail page with quote lines table
- [x] Inline category dropdown editing
- [x] Interpretation toggle checkboxes
- [x] PM notes inline editing
- [x] [+] Create Scope Item dialog
- [x] Scope Items tab with navigation
- [x] Quote summary bar (total, interpreted, remaining)
- [x] Scope detail page with editable header fields

### Category Redesign ✅
- [x] tbl_contractors table in Supabase
- [x] tbl_quote_line_contractors link table
- [x] qry_quote_lines_with_contractors view
- [x] CATEGORY_CONFIG object — single source of truth for category behaviour
- [x] Context-sensitive actions per category (scope/contractor/stock pick)
- [x] ContractorPicker component (inline below description)
- [x] Contractors management page (full CRUD)
- [x] Stock Pick purple tag
- [x] Amber only on scope-ready categories
- [x] "Hire" merged into Subcontracted, duplicate Install removed
- [x] Lookup cleanup (Stock Pick, Subcontracted Partial, Shared Departments added)

### Phase 3: Scope Breakdown 🔨 NEXT
- [x] Scope item detail page with editable header
- [ ] Prompt engine panel (category → suggested components)
- [ ] Job items table with stock search, inline editing
- [ ] Checkbox selection + Create WO dialog
- [ ] Coverage indicator per job item
- [ ] Navigation to Work Orders

### Phase 4: Work Orders & BOM ⬜ NOT STARTED
### Phase 5: Freelancer Mobile ⬜ NOT STARTED (enable RLS first!)
### Phase 6: Cost Visibility ⬜ NOT STARTED
### Phase 7: Capacity & Materials ⬜ NOT STARTED
### Phase 8: Polish & Handover ⬜ NOT STARTED

## Category Behaviour Matrix

| Category | Amber | Done ✓ | [+] Scope | Contractor | Stock Tag |
|----------|-------|--------|-----------|------------|-----------|
| Workshop / Workshop Build | Yes | Yes | Yes | No | No |
| Stock-and-Hire | Yes | Yes | Yes | No | No |
| Stock Pick | No | Yes | No | No | Yes |
| Subcontracted | No | Yes | No | Yes | No |
| Subcontracted (Partial) | Yes | Yes | Yes | Yes | No |
| Install | No | Yes | No | No | No |
| Provisional | No | Yes | No | No | No |
| Shared Departments | Yes | Yes | Yes | No | No |
| Production/Lighting/Sound/etc | No | No | No | No | No |

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | TypeScript interfaces for all tables and views |
| `src/lib/utils.ts` | Helpers: cn(), formatCurrency(), formatDate(), statusClass() |
| `src/lib/supabase-browser.ts` | Browser-side Supabase client |
| `src/components/sidebar.tsx` | Main navigation (includes Contractors link) |
| `src/components/ui/badges.tsx` | StatusBadge, DaysRemainingBadge, PhasePill |
| `src/components/ui/lookup-combo.tsx` | Reusable dropdown bound to tbl_master_lookups |
| `src/components/create-scope-dialog.tsx` | Modal for creating scope items from quote lines |
| `src/components/contractor-picker.tsx` | Inline contractor assignment on subcontracted lines |
| `src/app/(dashboard)/page.tsx` | Main dashboard |
| `src/app/(dashboard)/jobs/page.tsx` | Jobs list |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | Job detail with category-sensitive quote lines |
| `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` | Scope item detail |
| `src/app/(dashboard)/contractors/page.tsx` | Contractors CRUD |

## Database Tables (23)

### Original (migrated from Access)
tbl_production_plan, tbl_quotes, tbl_quote_lines, tbl_scope_items, tbl_scope_item_categories, tbl_category_prompts, tbl_job_items, tbl_jobitem_workorder, tbl_work_orders, tbl_wo_bom, tbl_wo_time_entries, tbl_freelancers, tbl_freelancer_schedule, tbl_materials, tbl_material_prices, tbl_material_spec_defs, tbl_master_lookups, tbl_suppliers, tbl_job_attachments, tbl_dummy_source_quote, tbl_dummy_stock_items

### Added by web app
tbl_contractors, tbl_quote_line_contractors

## Conventions

- All pages are client components ("use client") reading Supabase directly
- Supabase views (qry_*) handle all joins — frontend never joins tables
- Boolean fields from Supabase come as strings: use `isTruthy()` to check
- CATEGORY_CONFIG in job detail page is the single source of truth for category behaviour
- Tailwind for all styling, no CSS modules
- Git commit per phase, deploy via `vercel --prod`
- RLS disabled on all tables — must enable before freelancer access (Phase 5)
