# Starlight Web App — Development Tracker

## 🧹 Cleanup Backlog

Running list of known debt, deferred work, and small follow-ups. Reviewed at the start of every session. Items are added whenever a session ships something with a known deferral or a correctness bug that we chose not to fix in-flight. Order roughly reflects priority — top items are the ones to do next. Check items off as they ship; move completed ones to the relevant session entry.

### Correctness (do first)

*No open correctness items.*

### Small/mechanical (easy wins)

- [ ] **Share-flow size threshold** *(S40c, conditional)* — if 50MB+ PDF shares feel slow in real use, add a size check that falls back to URL-share for files >20MB. Don't ship pre-emptively.
- [ ] **Close report — completer name for admin users** *(S41)* — `completed_by` is INT FK to `tbl_freelancers` and resolves NULL for admin sessions (Mateusz's primary `@starlightdesign.co.uk` login has no freelancer row). The audit log still captures the actual auth UUID, but the report's "Completed by [name]" line is blank. Server-side enrichment from `auth.users.raw_user_meta_data->>'name'` would close this. ~10 min.

### Features deferred

- [ ] **Auto-complete active WOs on Job Complete** *(S41)* — option 3 from the Tramp Club Dancing podium discussion. Add a checkbox to the Job Complete dialog: "Also mark N active WO(s) Complete" (checked by default when active non-OVERHEAD WOs exist). Bypasses the WO-completion photo requirement, which is the right tradeoff for retro-closing old jobs but should be visible in the audit log (e.g. `closed_via='job_complete'` flag on the WO update). Worth ~15 min.

- [ ] **Handover — PDF drawing rendering** *(S39)* — image drawings render full-page inline; PDF drawings currently show a fallback "Open PDF" box. Add pdf.js (dynamic import, ~500KB gzipped) and render PDF pages to canvas at 2× DPR for crisp print. Applies to `DrawingPage` in `/reports/handover/[jobId]/page.tsx`.

- [ ] **Handover — persist drawing rotation** *(S39)* — rotation state is currently in-memory only (matches traveller). If a zone has 10 landscape drawings, every session restart means re-rotating. Add `rotation INT DEFAULT 0` on `tbl_handover_zone_documents` and persist on rotate. One small migration + a PATCH on the handler.

- [ ] **Handover — activity-aware "built by" verbs** *(S39)* — current label "Hands on:" is universal. If real handover use reads too soft, upgrade to activity-aware verbs: "Built by:" for BUILD, "Painted by:" for PAINT, "Upholstered by:" for COVER, fallback "Hands on:" for anything unmapped. Small verb map maintained as new activities ship. Stronger signature/ownership feel.

- [ ] **Handover — multi-scope scope-name display** *(S39)* — the scope card currently drops `scope.item_name` (it duplicated the line text when there was one scope per line). When a line has 2+ scopes, name differentiation becomes useful again. Either always show `item_name` when it meaningfully differs from `line_text`, or always show it when there are multiple scopes on the line. Not actionable until a real 2-scope line appears on a handover.

- [ ] **Handover — multi-quote job audit** *(S39)* — Tite Street (job 14) is the only multi-quote job. Verify:
  - Job page lists both quotes, cost analysis sums across them.
  - `qry_dash_quote_stats` aggregates correctly.

### Long-running / strategic

- [ ] **Supabase Pro upgrade** *(carried)* — prerequisite for multi-PM operation. Enables daily backups + PITR. Currently on hobby tier.
- [ ] **GitHub repo transfer** *(carried)* — move from personal account to company account. Low urgency.
- [ ] **AI quoting/estimating agent** *(carried, strategic)* — `tbl_learnings` + Voyage AI embeddings is the foundation. Real build is once close-report data has accumulated across more closed jobs.

---

## Session log

### S41 — 6 May 2026

Three pieces of work plus a wrap. Total: 4 deploys (Route Task tweak, freelancer onboarding tightening, Job Complete state, drift fix), 2 schema migrations on top, plus the doc migration as session close.

#### S41a — Route Task Modal: allow routing to Complete WOs

**Trigger:** PM workflow sometimes needs to route a late-arriving ad-hoc task or manually log time to a WO that was already marked Complete. The modal previously filtered to `["Ready", "In-Progress", "Not-Started"]`.

**Changes (3 surfaces, one logical fix):**
- `src/components/route-task-modal.tsx` — primary `/review/inbox` flow.
- `src/app/(dashboard)/crew/[id]/page.tsx` `openRouteModal` — per-freelancer routing.
- `src/app/(dashboard)/crew/[id]/page.tsx` `openAddEntry` — PM manual time entry.

All three now include `Complete` in the status filter. Within each scope group, active WOs sort first; Complete WOs at the bottom dimmed at 60% opacity. The existing `statusClass()` helper already returns `badge-complete` for Complete — visual differentiation came free. The crew page's two inline lists previously hardcoded an `In-Progress` ternary; both switched to `statusClass()` for consistency.

**Freelancer mobile flows (`/m/me`, `/m/task`) deliberately unchanged** — letting freelancers self-log against Complete WOs would dilute the "complete = done" signal that drives the Done filter and traveller QR flow. PMs route, freelancers don't.

#### S41b — Freelancer onboarding tightening

**Trigger:** PIN generator on the Mobile Access dialog produced 4-digit PINs only despite the label saying "4–6 digits."

**Bugs found and fixed:**
1. **Generator hardcoded to 4 digits.** `Math.floor(1000 + Math.random() * 9000)` returns 1000–9999. Fixed to `100000 + Math.random() * 900000`.
2. **Silent dead write to a non-existent column.** `savePin()` ran `supabase.from("tbl_freelancers").update({ pin: newPin })` after the auth-sync API call — but `tbl_freelancers.pin` doesn't exist in the schema (the legacy column was dropped pre-S41). Error never checked because the success toast already fired. The actual auth user IS updated correctly via the API; the dead write was just decorative noise. Removed.
3. **Privilege-escalation foothold.** `/api/auth/freelancer-sync` read role from `app_metadata.role || user_metadata.role || "freelancer"`. `user_metadata` is user-editable per Supabase Auth; the fallback was a vector if any future endpoint exposes user-metadata write. Removed fallback. Per SP-006/SP-008, role reads must use `app_metadata` only.

**Consistency cleanup:**
- Add Freelancer dialog had its own redundant PIN input (basic, no Generate button, no eye toggle, no validation, no WhatsApp helper). Mobile Access dialog has the polish. **Dropped the Add Freelancer PIN field entirely.** Onboarding is now one canonical path: Add → row appears → key icon → Mobile Access dialog → set PIN → WhatsApp invite.
- API body param: accepts `password` (preferred) or `pin` (deprecated, back-compat). Crew page sends `password`.
- Mobile Access dialog: copy "PIN (4–6 digits)" → "PIN (6 digits)". Save validation `>= 4` → `>= 6`. Existing 4-digit PINs continue to work (Supabase Auth has them hashed); only newly-set or reset PINs must be 6 digits.

**Doc consequence:** SP-002 in v2.0 of `04_security_policy.md` claimed freelancer passwords are ≥ 8 chars and `tbl_freelancers.pin` was deprecated. Reality: 6-digit numeric PIN, fully deployed and working. Fixed in v2.1 of the security policy as part of this session's doc migration. Tradeoffs and mitigations enumerated in SP-002.

#### S41c — Job Complete state

**Goal:** Replace "back of napkin" job-closing with a deliberate Complete state, an optional close-note prompt, and a print-friendly close report. No commercial freeze — costs remain live (post-complete edits are tracked in `tbl_audit_log` and surfaced via the report).

**Schema:**
- `tbl_production_plan` += `completed_at timestamptz`, `completed_by integer` (FK `tbl_freelancers`), `close_note text`. All nullable.
- New RPC: `rpc_job_close_report(p_job_id integer)` — single-call payload returning header, commercial summary (quoted, labour cost+hours, materials planned/reconciled, invoiced total, unallocated invoice total), labour by freelancer, labour by activity, materials by category and supplier, WO variance top 8, scope cost (per scope material spend), learnings linked to job, post-complete edit count from audit log.
- Verified end-to-end against Grosvenor (job 8): £377k quoted, £22.8k labour / 801hrs, £13.5k materials, 8 freelancer rows, 8 variance rows.

**UI:**
- `src/components/job-complete-dialog.tsx` (new) — confirm modal showing live numbers from the RPC, soft warning if any non-OVERHEAD WOs are still active (does NOT block — soft signals principle), optional close note textarea, "Skip & Complete" button when empty.
- `src/app/(dashboard)/jobs/[id]/page.tsx` — toolbar shows "Complete Job" button (Active jobs) or "Close Report" + "Reopen" buttons (Complete jobs). `handleReopen` clears `completed_at` and `completed_by` but **preserves `close_note`** as context. Audit-logged.
- `src/app/(dashboard)/reports/job-close/[jobId]/page.tsx` (new) — print-friendly report. Renders for any job; "Interim" badge if not yet Complete. Margin colour-coded (green ≥25%, amber ≥10%, red below). Post-complete edits warning when audit shows mutations after close.
- Two bugs in the dialog from a mid-session cut-off, fixed at next pickup: `getAuditContext` takes `supabase` as arg (was called without), and `completed_by` resolves from `user.user_metadata.freelancer_id` (NULL for admin without freelancer row), not the non-existent `ctx.actor_freelancer_id`.

**Filters:**
- `/jobs` — default-hide Complete; "Show N complete" toggle when any exist; status pill colour distinguishes (muted Complete vs green Active).
- `/m` mobile task list — fixed legacy filter that referenced `Closed` status (which never existed in this schema, so was a no-op for years). Now correctly filters Complete; both active and complete WO queries scoped to non-Complete jobs.
- `/capacity/add-booking` job picker — excludes Complete (you don't book fresh crew onto finished jobs).
- `/workshop`, `/capacity`, dashboard upcoming jobs — already filter via `rpc_workshop_data`, `rpc_capacity_data`, `rpc_dashboard_data`. Confirmed.
- `/m/task`, `/m/request` — already filter to `eq("job_status", "Active")`. Confirmed.
- `qry_procurement_needed` — patched to exclude Complete jobs (no job-status filter previously, so was surfacing unordered BOM rows from finished jobs).
- `qry_stale_travellers` — patched to exclude Complete jobs (only excluded Complete WOs previously; edge case where PM marks job Complete with WOs still Ready).

#### S41d — Quote total drift fix + drop `tbl_quotes.quote_value`

**Trigger:** While testing Job Complete on Tramp Club Dancing podium (job 9), the dialog showed "Quoted £0.00" but the job page clearly showed "Quoted £600.00."

**Root cause:** `qry_job_accepted_quote` summed `tbl_quotes.quote_value` (the header field). That field is supposed to mirror `SUM(tbl_quote_lines.line_value)` but nothing in the system maintains the relationship. 3 of 9 jobs had NULL headers despite real line values — the new-job INSERT path explicitly omits `quote_value`. Drift was inevitable.

**Fix in two stages:**

1. **View rewrite** — `qry_job_accepted_quote` now sums directly from `tbl_quote_lines` for accepted quotes, excluding overhead lines (`COALESCE(line_sub_group, '') <> 'Overhead'`). Tested across all 9 jobs, all give correct totals. Closes the immediate Tramp issue. Added `qry_quote_value_drift` watcher view per S37 invariants discipline.

2. **Column drop** — confirmed `tbl_quotes.quote_value` is a pure artefact via thorough sweep:
   - 0 app reads (no `.quote_value` accessor in `src/`)
   - 0 app writes (both INSERT paths into `tbl_quotes` — `jobs/page.tsx` and `jobs/[id]/page.tsx` — explicitly omit it)
   - 0 functions, triggers, constraints, RLS policies reference it
   - The only consumer (`qry_job_accepted_quote`) was migrated in stage 1
   - The 6 jobs that DID have populated values: every one matched `SUM(line_value)` exactly, so no information lost — fully reconstructable

   Dropped the column. Dropped the now-redundant `qry_quote_value_drift` watcher (nothing to watch). Removed the phantom `quote_value` field from the `Quote` TS interface.

**Promoted to convention:** §3.6 of `05_conventions.md` now codifies the "quote total derived from lines" invariant, and §5.1 ("Single source of truth") generalises the lesson — denormalised mirrors without maintaining triggers must be either (a) dropped, (b) triggered-and-watched, or (c) replaced with on-demand reads. The `tbl_quotes.quote_value` drop is the canonical case study cited in SP-014 checklist item 9.

#### S41e — Doc migration to repo

**The change:** docs moved from project-knowledge uploads to `/docs/` in the repo. Project knowledge becomes a stable ~20-line pointer that doesn't churn session-to-session.

**Why:** session-to-session docs were drifting because the user had to manually upload after each session. Co-locating with code means schema-doc updates ship in the same commit as the migration that needed them. Git provides the audit log (`git log docs/04_security_policy.md`).

**What shipped in `/docs/`:**
- `00_README.md` — index + read order + working principles
- `01_overview.md` — minor: Job Complete added to the Golden Path
- `02_architecture.md` — auth model updated for 6-digit PIN reality, route map updated for `/reports/job-close/[jobId]` and Complete filtering, API auth section reflects `app_metadata`-only role read
- `03_database_schema.md` — fully rebuilt from live state queries (55 tables, 34 views, 14 RPCs, 2 cron jobs). Old "session N + session N+1 patches" pattern collapsed to single current-state document. Recent additions section covers S40 → S41
- `04_security_policy.md` v2.1 — SP-002 rewritten to match reality (6-digit numeric PIN with documented tradeoffs and mitigations), SP-006/SP-008 strengthened on `app_metadata`-only reads, SP-014 checklist item 9 added (denormalisation requires trigger + watcher or it must not exist)
- `05_conventions.md` — added §3.6 (quote-total invariant), §5.1 (single source of truth — promoted from S41 Quote drift case), §3.8 manual-time-entry note, §3.9 Complete in job statuses, §19 (full Job lifecycle conventions)
- `TRACKER.md` — this file. S41 entry above; cleanup backlog updated.

**Project knowledge replacement:** see end of this entry for the ~20-line pointer file.

---

### Project knowledge replacement (paste this as the only file in project knowledge)

```
This system's authoritative documentation lives at:
  /docs/ in the github.com/mateuszgarwacki-arch/starlight-web repo

Always start a session by reading these files via Desktop Commander:
  - docs/00_README.md           (this index)
  - docs/01_overview.md         (what the system is, who it serves)
  - docs/02_architecture.md     (stack, auth, integrations)
  - docs/03_database_schema.md  (current schema state)
  - docs/04_security_policy.md  (SP-001 to SP-017)
  - docs/05_conventions.md      (deploy patterns, SQL rules, UX patterns)
  - docs/TRACKER.md             (session log + cleanup backlog)

Always end a session by updating TRACKER.md and 03_database_schema.md
where applicable. These commits ship with the same deploy as the
code changes they describe.

Local repo path: C:\Users\mateusz.garwacki\Downloads\starlight-web
Supabase project ID: qbdnoueqkmhznqzpkvos
```

---

*Earlier session entries (S1–S40) live in git history and prior project-knowledge uploads. From S41 onwards, this file is the version-controlled session log.*
