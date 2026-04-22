# Starlight Production System — Database Schema (Session 35)

Verified from live database. **48 tables, 41 views, 10 RPC functions, 7 utility functions, 200+ indexes.**

## Changes from Session 33

### Schema Changes (Session 34 — Scope Pack Print Restructure)
None. Pure frontend work. `tbl_scope_items.description`, `tbl_job_items.*`, and `tbl_wo_documents WHERE scope_item_id = ? AND work_order_id IS NULL AND doc_type = 'drawing'` all pre-existed — Session 34 just surfaced them in the pack-mode traveller cover page and scope-level drawings pages.

### Schema Changes (Session 35 — Step-by-step Instructions)
**New table: `tbl_wo_steps`**

```sql
CREATE TABLE tbl_wo_steps (
  step_id       SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES tbl_work_orders(work_order_id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  step_text     TEXT NOT NULL,
  is_critical   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wo_steps_wo_seq ON tbl_wo_steps(work_order_id, seq);

-- RLS enabled; 4 policies under standard consolidated pattern (1 per action, TO authenticated, get_my_role() CASE):
--   wo_steps_select : admin/pm/freelancer → TRUE
--   wo_steps_insert : admin/pm → TRUE
--   wo_steps_update : admin/pm → TRUE
--   wo_steps_delete : admin/pm → TRUE
```

Registered in `src/lib/audit.ts` `AUDITED_TABLES` as `tbl_wo_steps: "step_id"`.

**Net:** **1 table added** (`tbl_wo_steps`), **0 views added**, **0 RPCs added**. **Total: 48 tables.**

### New Views Since S33
None.

---

## Tables (48)

Previous 47 tables as per session 33 schema doc, plus:

### tbl_wo_steps (new in S35)
| Column | Type | Notes |
|---|---|---|
| `step_id` | `SERIAL` | PK |
| `work_order_id` | `INTEGER NOT NULL` | FK → `tbl_work_orders(work_order_id) ON DELETE CASCADE` |
| `seq` | `INTEGER NOT NULL` | 1-indexed contiguous ordering within WO. Re-sequenced on delete. |
| `step_text` | `TEXT NOT NULL` | Instruction text, whitespace preserved (`whitespace-pre-wrap` in UI) |
| `is_critical` | `BOOLEAN NOT NULL DEFAULT FALSE` | Amber styling + ⚠ prefix in read-only renders |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |
| `modified_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | **NOT auto-updated** — no trigger. Manual write was rejected to avoid audit log noise (would spawn audit entry per update). Safe to ignore unless S36+ adds a trigger. |

**Index:** `idx_wo_steps_wo_seq (work_order_id, seq)` — primary access pattern is "all steps for a WO ordered by seq".

**Notes:**
- `seq` is 1..N contiguous, maintained by application on delete. Gaps don't matter for correctness; contiguity is a UI convenience.
- `ON DELETE CASCADE` — voiding/deleting a WO cleans up all steps atomically. No orphan risk.
- No `modified_by` / `updated_by` column; all writes go through `auditedInsert`/`auditedUpdate`/`auditedDelete` which logs user + action to `tbl_audit_log`.
- No soft-delete (`archived_at`). Steps are cheap to delete/recreate during authoring.

### Key Table Notes (carried forward from S30-S33)
`tbl_wo_documents` unchanged — still the three-anchor model (job / scope / WO), six `doc_type` values (`cut_list`, `drawing`, `reference`, `model`, `cad_concept`, `cad_breakdown`), registered in AUDITED_TABLES as `doc_id`. Scope-pack traveller in S34 added a new filter pattern: `work_order_id IS NULL AND scope_item_id = ? AND doc_type = 'drawing'` for scope-level drawings appearing on the pack cover flow.

`tbl_wo_bom` unchanged — `qry_bom_enriched` remains source of truth for BOM cost.

## Enums

### learning_category (12 values, unchanged from S28b)
Order 1-10 from S25, plus `pm_note` (11) and `materials_note` (12).

## CHECK Constraints (notable)

`tbl_wo_documents.doc_type`:
```sql
doc_type IN ('cut_list', 'drawing', 'reference', 'model', 'cad_concept', 'cad_breakdown')
```

`tbl_wo_steps` — no CHECK constraints. `seq > 0` enforced by application, not DB (NUMERIC fields are non-negative convention; if gaming becomes a problem add `CHECK (seq > 0)` later).

## Views (41 — unchanged)

Carry forward from S33. No new views in S34 or S35.

**Key view reminder: `qry_bom_enriched` is the source of truth for BOM cost**. Never compute BOM totals directly off `tbl_wo_bom` — use `planned_line_cost` / `reconciled_line_cost` from the enriched view, which applies `unit_to_base_multiplier` (Length-on-Metre materials × `standard_length/1000`) and resolves `effective_scope_item_id = COALESCE(b.scope_item_id, wo.scope_item_id)`.

## AUDITED_TABLES (`src/lib/audit.ts`)

Current registry:
```typescript
tbl_quote_lines:      "quote_line_id",
tbl_scope_items:      "scope_item_id",
tbl_work_orders:      "work_order_id",
tbl_wo_bom:           "bom_id",
tbl_production_plan:  "job_id",
tbl_quotes:           "quote_id",
tbl_wo_time_entries:  "entry_id",
tbl_freelancers:      "freelancer_id",
tbl_scope_options:    "option_id",
tbl_wo_documents:     "doc_id",
tbl_wo_steps:         "step_id",   // NEW in S35
```

## RLS

All 48 tables have RLS enabled; new tables inherit `rls_auto_enable()` trigger. New in S35: `tbl_wo_steps` gets 4 consolidated policies (SELECT/INSERT/UPDATE/DELETE) following the standard pattern — 1 policy per action, `TO authenticated`, `get_my_role()` CASE, admin/pm full CRUD, freelancer SELECT-only.

All views remain `SECURITY INVOKER` (unchanged). `get_my_role()` still reads `app_metadata.role` (not user-editable `user_metadata`).

## Conventions (added in S34-S35)

**From S28d (still authoritative — implemented via `qry_bom_enriched`):**
- BOM total = `qty × unit_cost × unit_to_base_multiplier`. Never multiply by `standard_length` directly.
- BOM unit ≠ material unit means conversion happens inside `qry_bom_enriched`.

**From S30-S33:**
- CAD documents live at three anchor levels (job / scope / WO). Same `WODocumentsPanel` component.
- `doc_type` split: `cad_concept` (design) vs `cad_breakdown` (workshop). Don't collapse back.
- `AUDITED_TABLES` registration is a prerequisite, not automatic. `auditedInsert/Delete` gate log writes.
- Cosmetic updates (sort_order, UI preferences) stay raw. Don't audit drag-reorder operations.

**New in S34:**
- **Flow-layout pages** (content that can span multiple printed pages): keep `minHeight: 287mm` on A4 pages; only relax `page-break-inside: avoid` via a dedicated CSS class (`.traveller-cover`). Dropping `min-height` entirely shrinks to content which is usually wrong.
- **Scope-level vs WO-level `tbl_wo_documents`** disambiguated by filter: `work_order_id IS NULL AND scope_item_id = ?` vs `work_order_id = ?`. Pack-mode needs both paths.
- **Traveller `Page` component** supports scope-context rendering (no `wo` required). Footer shows `Scope-{id}` instead of `WO-{id}`. Useful for any future non-WO summary pages.
- **Print buttons for scope-level actions live on the scope page, not on WO rows.** One button next to `StatusBadge`, not duplicated per row.

**New in S35:**
- **Don't manually write `modified_at` on every update** unless the field is in `SKIP_FIELDS`, or a DB trigger handles it. Otherwise every update spawns an audit log entry for the timestamp change, polluting the trail.
- **Authoring UX Enter-to-advance pattern** is the right feel for list-style content (steps, tags, items). Esc cancels, blur commits-and-stops. Better than explicit Save/Add buttons for rapid entry.
- **Empty states for optional features should not nag.** Dashed button invites, doesn't reproach.
- **`ON DELETE CASCADE` for child rows like steps, BOM, junctions** — application-level cascade is fragile. DB should handle it.
- **Critical-flag pattern** (single `is_critical BOOLEAN`, amber styling in read-only renders, warning prefix in print) is a cheap way to surface "don't miss this" without heavier workflow like mandatory acknowledgement. Pattern is lift-able to other tables (e.g. `tbl_wo_bom.is_critical` for must-order-today materials) if adoption proves the idea.

---

## File inventory as of S35

**Component additions:**
- `src/components/wo-steps-panel.tsx` (S35) — dual-mode component for step authoring + read-only render

**Component changes:**
- `src/components/traveller/traveller-preview.tsx` (S34) — split into `PrintTravellerButton` (single WO) + `PrintScopePackButton` (scope)
- `src/components/work-orders-panel.tsx` (S34, S35) — simplified print button call site; mounts `WOStepsPanel` in expanded WO
- `src/app/(dashboard)/jobs/[id]/scope/[scopeId]/page.tsx` (S34) — renders `PrintScopePackButton` when `woCount > 0`
- `src/app/m/wo/[woId]/page.tsx` (S35) — renders `WOStepsPanel readOnly` between description and paint notes
- `src/app/traveller/page.tsx` (S34, S35) — scope cover flow-page, scope drawings, steps block in `TaskBrief`
- `src/app/globals.css` (S34) — `.traveller-cover` class for flow-layout pages
- `src/lib/audit.ts` (S33, S35) — `tbl_wo_documents` + `tbl_wo_steps` added to AUDITED_TABLES
