# STARLIGHT PRODUCTION SYSTEM — Project Summary
## Updated: 24 March 2026 (Session 9)

---

## WHAT THIS IS

A production management system for Starlight Design, a high-end events fabrication company (sets, furniture, bars, stages, scenic elements for private HNW clients). Built as a **Next.js web application** backed by **Supabase (PostgreSQL)**, replacing the original MS Access front-end. The system is live at **workshop-five-gamma.vercel.app**.

**Key personnel:** Mateusz Garwacki (Workshop Manager, system admin, primary builder). Multiple PMs being onboarded.

---

## ARCHITECTURE

**Backend:** Supabase (PostgreSQL) — 31 tables, 27+ views, RLS on all tables
**Frontend:** Next.js 16.1.7 / React / Tailwind CSS / shadcn/ui
**Hosting:** Vercel (hobby tier)
**Auth:** Supabase Auth — email+password for staff (admin/PM/foreman), phone+PIN for freelancers
**Roles:** admin > production_manager > foreman > freelancer
**Git:** github.com/mateuszgarwacki-arch/starlight-web
**Source of truth:** TRACKER.md in repo root

---

## CORE DESIGN PRINCIPLES

1. **"If it is worth planning individually, it is worth tracking."** — replaces any minimum size threshold
2. **"More friction, less done."** — system supports experienced people, never constrains them
3. **Soft signals only.** — surfaces information, never hard-blocks
4. **Split a WO when the split changes the assignee, rate, risk, or estimate. Otherwise keep together.**

---

## THE GOLDEN PATH (Workflow)

**Quote → Scope Items → Work Orders → Time Entries → Cost Visibility**

1. **Job created** (+ New Job dialog or import from accounts system)
2. **Quote lines entered** (manually via inline form, or imported from external quote database)
3. **Lines interpreted** → PM creates Scope Items (buildable deliverables) from quote lines
4. **Scope broken down** → Job Items (components), then Work Orders (tasks with activity verb, complexity, BOM)
5. **Traveller printed** → WO status moves to Ready, QR code links to mobile interface
6. **Freelancers execute** → START/JOIN/LOG HOURS/MARK COMPLETE via phone browser
7. **Cost captured** → Hours × rate = labour cost, BOM quantities × unit cost = material cost
8. **Review & close** → PM reviews flags, corrects time entries, verifies costs, uploads site photos

---

## THE FOUR ZONES

**Zone 1 — The Architect (Planning):** PM only. Create jobs, quotes, scope items, work orders, manage capacity.
**Zone 2 — The Commander (Active Workshop):** Foreman view. All active WOs across jobs. No commercial data.
**Zone 3 — The Auditor (Review & Exceptions):** Exception handling — flag review, time corrections, cost reconciliation.
**Zone 4 — The Workshop (Freelancer Mobile):** Phone browser. START/JOIN/LOG/COMPLETE in under 30 seconds.

---

## WHAT'S BUILT (Sessions 1-9)

### Phase 0-7: Complete
All core functionality shipped: Dashboard, Jobs & Quote Lines, Scope Breakdown, Work Orders & BOM, Freelancer Mobile, Cost Visibility & Review, Capacity & Materials.

### Phase 8: Polish & Multi-User — Mostly Complete
- Traveller PDF with QR codes and print-to-release workflow
- BOM costing engine with bin-packing for timber
- AI-powered invoice extraction and cut list extraction (Claude API)
- Settings: rate card, business defaults, user management, audit log
- Analytics engine: 5-layer cost model (Quoted → Estimated → Committed → Reconciled → Margin)
- Real-time Supabase subscriptions on workshop, capacity, bookings, notifications
- Security hardening: middleware auth, API auth, RLS on all tables
- Booking system with WhatsApp notify and ICS calendar download
- OneDrive integration for document storage

### Session 8 Additions (24 Mar 2026)

**Manual Quote Entry:**
- + New Job dialog creates job + auto-creates quote container
- + Add Quote Line inline form with description, qty, unit_price, value, zone, sub-group, category
- Inline edit on all quote line fields (click to edit, blur saves)
- Delete line with scope item protection
- Qty and Unit Price as proper table columns with auto-calculate

**Multi-User Foundation:**
- Admin role (above PM in hierarchy). Admin can: manage users, edit freelancer details, archive time entries, view audit log
- User management in Settings → Users tab: create PM/foreman/admin accounts with email+password
- API route `/api/auth/manage-user`: create, update role, reset password, list staff

**Audit Log System:**
- `tbl_audit_log` — every field change on 8 key tables logged with who, when, old value, new value
- `src/lib/audit.ts` — auditedUpdate(), auditedInsert(), auditedDelete(), revertAuditEntry()
- Settings → Audit Log tab with Revert button per field-level update
- Wired across ALL key pages: job detail, scope, WOs, BOM, traveller, mobile WO, mobile photos
- `updated_at` columns + triggers on 6 tables (foundation for optimistic concurrency)

**Time Entry Admin Controls:**
- Soft delete (archive): archived_at/by/reason columns. Mandatory reason.
- Admin can edit hours inline on freelancer detail page (recalculates cost)
- Archived entries excluded from ALL cost calculations (9 queries + 4 views patched)
- "Show archived" toggle reveals greyed-out entries with reason

**Freelancer Detail Page (/crew/[id]):**
- Clickable crew names → full profile with editable header (admin only)
- Stats: total hours, last 30 days, WOs completed, avg vs estimate %, flag count
- Activity timeline: reverse-chronological time entries with job links, flags, admin edit/archive buttons
- Bookings tab: schedule entries with status badges

### Session 9 Additions (24 Mar 2026)

**Real-time Presence:**
- `usePresence` hook joins Supabase Realtime Presence channels (`presence:job:{id}`, `presence:scope:{id}`)
- `<PresenceAvatars>` shows coloured initials of other users viewing the same page
- `<FieldPresenceIndicator>` shows coloured ring around fields another user is editing (Excel Online pattern)
- Wired into: Job detail, Scope breakdown, WO pages. Deterministic 8-colour palette from user ID hash

**Optimistic Concurrency:**
- `auditedUpdate()` now accepts optional `expectedUpdatedAt` — detects when another user modified a record
- `<ConflictDialog>` modal shows both values side-by-side: "Keep theirs" / "Use mine" / "Cancel"
- Quote line edits show full dialog; WO status/field changes use toast warning + auto-reload
- All 6 WO page update handlers converted from raw Supabase to audited with concurrency guards

**Audit on All Creation Paths:**
- `auditedInsert()` wired into: WO creation, scope creation, BOM rows (catalogue + custom), quote lines, mobile time entries
- All raw `.insert()` calls on audited tables eliminated — every creation appears in audit log

---

## KEY TABLES

| Table | Purpose |
|-------|---------|
| tbl_production_plan | Jobs — the root of everything |
| tbl_quotes | Quote documents per job |
| tbl_quote_lines | Individual line items with qty × unit_price |
| tbl_scope_items | Buildable deliverables interpreted from quote lines |
| tbl_job_items | Physical components of scope items |
| tbl_work_orders | Tasks with activity verb, complexity, BOM |
| tbl_wo_time_entries | Who worked, how long, at what rate (supports soft delete) |
| tbl_wo_bom | Materials per work order |
| tbl_freelancers | All people — freelancers, foremen, PMs, admin |
| tbl_freelancer_schedule | Booking calendar entries |
| tbl_audit_log | Change tracking with undo support |
| tbl_notifications | System alerts (bookings, flags, completions) |

---

## OUTSTANDING WORK (prioritised)

1. **Wire `presenceSetEditing`** into field focus/blur handlers — enables full field-highlight effect (optional polish)
2. **Audit log retention** — monthly cleanup of closed job entries (hot→warm→cold lifecycle)
3. **Drop tbl_freelancers.pin column** — code references removed, just needs ALTER TABLE DROP COLUMN
4. **Supabase Pro upgrade** — CRITICAL before inviting PMs. Enables daily backups + PITR
5. **Quote import from real source** — currently manual entry only
6. **Add `updated_at?: string` to TS interfaces** — Job, QuoteLine, WORow, BomRow (cleanup)
7. Job templating, precedent search, 2D sheet nesting, cross-job analytics (Tier 3)

---

## MANDATORY PATTERNS FOR NEW FEATURES

**Audit updates:** Use `auditedUpdate()` from `lib/audit.ts` for all writes on key tables. Never raw `supabase.update()`. Pass `expectedUpdatedAt` (6th param) for optimistic concurrency on tables with `updated_at` triggers.

**Audit inserts:** Use `auditedInsert()` for creation of WOs, scope items, BOM rows, quote lines, time entries. Never raw `.insert()` on audited tables.

**Concurrency:** When `auditedUpdate` returns `{ conflict: true }`, show `<ConflictDialog>` for single-field inline edits, or `toast.warning + reload` for status changes. Always update local state with `result.data?.updated_at` after successful saves.

**Presence:** Add `usePresence(type, id, pageName)` + `<PresenceAvatars>` to any new page where multiple PMs may view simultaneously. Keep channel granularity to job/scope level — no per-WO channels.

**Time entries:** Every query MUST include `.is("archived_at", null)`.

**Notifications:** Every state-changing action needs `notify()` from `lib/notifications.ts` + `toast` from sonner.

**Security:** Three layers on every data path — middleware session + API route auth + RLS. New tables need RLS before data insertion.

**Timezone:** Never `toISOString().split("T")[0]` for local dates. Use `localDateStr()`.

**PostgreSQL:** `ROUND()` needs `::numeric` cast. No `CREATE POLICY IF NOT EXISTS`. CTE chains with `RETURNING` for multi-table inserts.

---

## REFERENCE DOCUMENTS

| Document | Purpose |
|----------|---------|
| **TRACKER.md** (in repo) | Single source of truth. Build status, file list, conventions, lessons learned |
| **starlight_database_schema_v3.md** | Complete table definitions, views, FK map, SQL scripts |
| **starlight_consolidated_v3.docx** | Original Access design spec (historical reference) |
| **Starlight_Web_Architecture_v1.docx** | Web architecture plan and component mapping |
| **Starlight_Security_Policy_v1.docx** | 17 security policies (SP-001 to SP-017) |
| **Starlight_Deployment_Guide_v2.docx** | Environment setup and deployment procedures |
