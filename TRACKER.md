# Starlight Web App — Development Tracker

## Project Overview

**What:** Web application replacing MS Access front-end for Starlight Design's production management system.
**Backend:** Supabase (PostgreSQL) — 21 tables, 21+ views, fully migrated from Access.
**Frontend:** Next.js 14+ / React / Tailwind CSS / shadcn/ui patterns.
**Hosting:** Vercel (hobby tier).
**Auth:** Supabase Auth (email+password for PM, PIN for freelancers TBD).

## Architecture Reference

See `Starlight_Web_Architecture_v1.docx` in project knowledge for full architecture plan including:
- Technology stack decisions and rejected alternatives
- All route mappings (Access form → web page)
- Component breakdown per form
- Supabase view usage map
- 8-phase build plan
- Risk mitigations

## Supabase Connection

- **21 tables** (tbl_*) — fully migrated from Access, live data
- **21+ views** (qry_*) — cost visibility stack, dashboard feeds, operational views
- Access remains connected via ODBC — both read/write the same database
- Booleans stored as TEXT ('true'/'false') due to ODBC driver — use `isTruthy()` helper

## Colour System

| Token | Hex | Usage |
|-------|-----|-------|
| navy | #1A1A2E | Sidebar, headings |
| red | #C0392B | Primary actions, urgent |
| blue | #2980B9 | In-Progress status |
| green | #27AE60 | Complete status |
| amber | #F39C12 | Warnings, On-Hold |
| bg | #F4F5F7 | Main background |
| white | #FFFFFF | Cards, inputs |

Phase pills: Phase 1=#3498DB, Phase 2=#9B59B6, Phase 3=#E67E22, Phase 4=#E91E63, Phase 5=#1ABC9C

## Build Status

### Phase 0: Foundation ✅ DEPLOYED
- [x] Next.js project with Tailwind + TypeScript
- [x] Supabase client (browser + server)
- [x] Auth middleware (simplified — allows all routes for now)
- [x] Login page (Supabase Auth email+password)
- [x] Sidebar navigation with all zone routes
- [x] Dashboard layout shell
- [x] TypeScript types for all 21 tables + key views
- [x] Utility functions (formatCurrency, formatDate, daysRemaining, statusClass, isTruthy)
- [x] Shared components: StatusBadge, DaysRemainingBadge, PhasePill
- [x] Deployed to Vercel

### Phase 1: Dashboard ✅ DEPLOYED
- [x] Quick stats cards (active jobs, active WOs, items to order, outstanding hours)
- [x] Job cards with progress bars and traffic light indicators
- [x] Manpower demand table by department
- [x] Procurement actions alert
- [x] Live data from qry_dash_upcoming_jobs, qry_manpower_demand, qry_procurement_needed

### Phase 2: Jobs & Quote Lines 🔨 IN PROGRESS
- [x] Jobs list page with search and status table
- [x] Job detail page with quote lines table
- [x] Amber highlighting on uninterpreted workshop lines
- [ ] Inline category dropdown editing on quote lines
- [ ] Interpretation toggle (click to mark complete)
- [ ] PM notes editing on quote lines
- [ ] [+ Create Scope Item] button from quote line
- [ ] Create Scope Item dialog
- [ ] Quote value summary bar (total, interpreted, remaining)
- [ ] Navigation to scope detail page

### Phase 3: Scope Breakdown ⬜ NOT STARTED
- [ ] Scope item detail page with editable header fields
- [ ] Prompt engine panel (category → suggested components)
- [ ] Job items table with stock search
- [ ] Checkbox selection + Create WO dialog
- [ ] Coverage indicator per job item

### Phase 4: Work Orders & BOM ⬜ NOT STARTED
- [ ] Work orders page with phase ordering
- [ ] Expandable rows with inline BOM
- [ ] Material catalogue search
- [ ] Release as Ready button
- [ ] Traveller PDF with QR code

### Phase 5: Freelancer Mobile ⬜ NOT STARTED
- [ ] PIN login
- [ ] Task list (MY TASKS / ALL TASKS)
- [ ] Start / Join / Log Hours / Complete flows
- [ ] Camera for completion photos
- [ ] QR scanner

### Phase 6: Cost Visibility ⬜ NOT STARTED
### Phase 7: Capacity & Materials ⬜ NOT STARTED
### Phase 8: Polish & Handover ⬜ NOT STARTED

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | TypeScript interfaces for all tables and views |
| `src/lib/utils.ts` | Helpers: cn(), formatCurrency(), formatDate(), statusClass() |
| `src/lib/supabase-browser.ts` | Browser-side Supabase client |
| `src/lib/supabase-server.ts` | Server-side Supabase client (simplified) |
| `src/middleware.ts` | Auth middleware (currently passthrough) |
| `src/components/sidebar.tsx` | Main navigation |
| `src/components/ui/badges.tsx` | StatusBadge, DaysRemainingBadge, PhasePill |
| `src/app/(dashboard)/layout.tsx` | Dashboard shell with sidebar |
| `src/app/(dashboard)/page.tsx` | Main dashboard |
| `src/app/(dashboard)/jobs/page.tsx` | Jobs list |
| `src/app/(dashboard)/jobs/[id]/page.tsx` | Job detail with quote lines |
| `TRACKER.md` | This file |

## Conventions

- All pages are client components ("use client") reading Supabase directly
- Supabase views (qry_*) handle all joins — frontend never joins tables
- Boolean fields from Supabase come as strings: use `isTruthy()` to check
- Tailwind for all styling — no CSS modules, no styled-components
- shadcn/ui patterns for complex components (dialogs, dropdowns, tables)
- Git commit per phase completion

## Supabase Views Used

| View | Pages Using It |
|------|---------------|
| qry_dash_upcoming_jobs | Dashboard |
| qry_manpower_demand | Dashboard, Capacity |
| qry_procurement_needed | Dashboard |
| qry_scope_context | Work Orders header |
| qry_scope_breakdown | Scope detail page |
| qry_wo_phase_ordered | Work Orders list |
| qry_materials_list | Materials page |
| qry_quote_scopes | Job detail (scope tab) |
| qry_job_cost_summary | Cost review |
| qry_scopeitem_cost_summary | Cost drill-down |
| qry_wo_cost_summary | WO detail |
| qry_estimate_vs_actual | Cost analysis |
| qry_jobitems_withcoverage | Scope breakdown |
| qry_job_execution_list | Workshop view |
| qry_today_roster | Dashboard |
