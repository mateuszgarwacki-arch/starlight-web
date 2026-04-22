# Starlight Database Schema — Session 33 (22 Apr 2026)

Verified from live database. **47 tables, 41 views, 10 RPC functions, 7 utility functions, 200+ indexes.**

## Changes from Session 29

### Schema Changes (Session 30 — CAD Library Phase 1)
- **`tbl_wo_documents.doc_type` CHECK rebuilt**. S28 added `cad_model` as a single catch-all for CAD files. S30 split it into two distinct types: `cad_concept` (design-side source, the PM's SketchUp/AutoCAD) and `cad_breakdown` (workshop's interpretation/cut-list-ready model). Zero rows migrated — `cad_model` was a placeholder with no production data. New allowed values: `cut_list | drawing | reference | model | cad_concept | cad_breakdown`.
- **OneDrive folder routing** (filesystem, not DB but noted for completeness): `Workshop/{jobNumber} - {jobName}/CAD-Concept/` and `.../CAD-Breakdown/` replace the single `CAD/` folder.

### Schema Changes (Sessions 31–32 — CAD Library Phases 2 & 3)
None. Both phases were pure frontend work:
- **S31** mounted the existing `WODocumentsPanel` at job and scope levels (was WO-only). Component gained a third query branch: `WHERE job_id = :jobId AND scope_item_id IS NULL AND work_order_id IS NULL`. No schema change — `tbl_wo_documents` already had all three anchor FKs nullable.
- **S32** added `/library/cad` page — a cross-job searchable archive. Single nested-select query over `tbl_wo_documents` filtered to `cad_concept | cad_breakdown`, joined to job + scope + category. No new view or RPC — at current volume (tens of files) client-side filter is adequate.

### Schema Changes (Session 33 — Backlog Cleanup)
- **`qry_wo_cost_material` DROPPED** via migration `drop_orphaned_qry_wo_cost_material`. Was a legacy rollup of `tbl_wo_bom` that summed `quantity × COALESCE(actual_unit_cost, unit_cost, 0)` with no Length-on-Metre multiplier. No SQL dependents (verified via `pg_depend`), no frontend references (grep clean). Dropping prevents anyone reintroducing the buggy formula — the correct path is `qry_bom_enriched.reconciled_line_cost` (with the multiplier) aggregated into `qry_wo_cost_summary`.
- **`qry_bom_enriched` noted as source of truth**. Existed before S33 but was absent from the S29 doc — adding now for the record. Applies the Length-on-Metre multiplier and resolves dual-path anchors (`effective_scope_item_id = COALESCE(b.scope_item_id, wo.scope_item_id)`). Every downstream cost view routes through its `planned_line_cost` / `reconciled_line_cost` columns. See conventions section.
- **`tbl_wo_documents` added to `AUDITED_TABLES` registry** in `src/lib/audit.ts` (PK: `doc_id`). Not a database change per se — the registry lives in application code — but noted here because it changes which tables write audit rows. Uploads and deletes on `tbl_wo_documents` now produce entries in `tbl_audit_log`.

Net: **0 tables added/dropped**, **1 view dropped** (`qry_wo_cost_material`), **0 RPCs added**. **Total view count stays at 41** — `qry_bom_enriched` was already counted in the S29 total even though absent from the S29 doc's Production & Cost list, so dropping one view and documenting one existing view nets to zero.

### New Views Since S29
None.

### Dropped Views Since S29
- `qry_wo_cost_material` (S33)

### New RPCs Since S29
None.

---

## Tables (47)

Unchanged from Session 29. Full list preserved by the S29 schema doc. Only change surface: `tbl_wo_documents.doc_type` CHECK constraint now has 6 allowed values (see below).

### Key Table Notes (reinforced in S30-S33)
- **`tbl_wo_documents`** — doc_id PK, three nullable FK anchors (`work_order_id`, `scope_item_id`, `job_id`) so a single document can live at any of the three levels. **New doc_type CHECK allows 6 values**:
  - `drawing` — image/PDF working drawings (WO level)
  - `reference` — image/PDF reference material (any level)
  - `cut_list` — CSV/PDF/XLSX feeding `CutListExtractor` (WO-coupled, hidden at non-WO mounts)
  - `model` — GLB/GLTF for inline 3D viewer (browser-renderable)
  - `cad_concept` (S30) — design-side CAD source (SketchUp/AutoCAD/STEP/IGES/3DM). PM uploads on job or scope page.
  - `cad_breakdown` (S30) — workshop's interpretation/cut-ready CAD. Either level.
  - Freelancer mobile view and traveller PDF hide `cad_concept` and `cad_breakdown` client-side.
  - `tbl_wo_documents` is now an **audited table** (`AUDITED_TABLES["tbl_wo_documents"] = "doc_id"` in `src/lib/audit.ts`). Uploads go through `auditedInsert`, deletions through `auditedDelete`. `sort_order` drag-reorder stays raw (cosmetic, high-volume, low-signal).

- **`tbl_wo_bom`** — unchanged, but reinforced convention: **BOM costs MUST be computed via `qry_bom_enriched`, never directly off the base table**. Direct computation misses the Length-on-Metre multiplier and the dual-path effective_scope_item_id. See Conventions section.

## Enums

### learning_category (12 values, unchanged from S28b)
Order 1-10 from S25, plus `pm_note` (11) and `materials_note` (12) from S28b.

## CHECK Constraints (notable)

### tbl_wo_documents.doc_type (S30 — rebuilt)
```sql
doc_type IN ('cut_list', 'drawing', 'reference', 'model', 'cad_concept', 'cad_breakdown')
```
`cad_model` (S28) was replaced by the two-way concept/breakdown split in S30. Zero production rows existed with `cad_model`, so rebuild was a `DROP CONSTRAINT` + `ADD CONSTRAINT` without data migration.

### tbl_invoice_allocations.chk_alloc_exactly_one_target (S29)
```sql
(scope_item_id IS NOT NULL)::int + (work_order_id IS NOT NULL)::int = 1
```
Enforces XOR between scope and WO targets. No row on an invoice line = unallocated (stays at job level).

---

## Views (41)

### Production & Cost (38)
`qry_bom_enriched`, `qry_cost_waterfall`, `qry_dash_quote_stats`, `qry_dash_upcoming_jobs`, `qry_dash_wo_stats`, `qry_estimate_vs_actual`, `qry_freelancer_hours_summary`, `qry_invoice_job_rollup`, `qry_invoice_scope_costs`, `qry_invoice_wo_costs`, `qry_job_accepted_quote`, `qry_job_cost_summary`, `qry_job_estimated_cost`, `qry_job_execution_list`, `qry_job_quote_margin`, `qry_jobitems_withcoverage`, `qry_manpower_demand`, `qry_material_reconciliation`, `qry_material_summary_by_job`, `qry_materials_list`, `qry_procurement_needed`, `qry_quote_lines_with_contractors`, `qry_quote_scopes`, `qry_quoteline_margin`, `qry_recent_orders`, `qry_review_inbox`, `qry_scope_breakdown`, `qry_scope_context`, `qry_scope_estimated_cost`, `qry_scope_wo_stats`, `qry_scopeitem_cost_summary`, `qry_stale_travellers`, `qry_supplier_summary`, `qry_wo_cost_labour`, `qry_wo_cost_summary`, `qry_wo_estimated_cost`, `qry_wo_phase_ordered`, `qry_wo_with_activities`

### Maintenance (2)
`qry_maintenance_asset_summary`, `qry_maintenance_task_status`

### Knowledge (1)
`qry_learnings_enriched`

### Key View: qry_bom_enriched (source of truth for BOM cost)

Enriches every `tbl_wo_bom` row with (a) joined material metadata and (b) two computed columns that every downstream cost calculation depends on:

```sql
-- Conceptual definition (simplified; see live DB for actual)
SELECT
  b.*,
  m.material_name, m.unit AS material_unit, m.standard_length,
  wo.status AS wo_status,
  COALESCE(b.scope_item_id, wo.scope_item_id) AS effective_scope_item_id,
  CASE
    WHEN LOWER(COALESCE(b.unit, '')) = 'length'
     AND LOWER(COALESCE(m.unit, '')) IN ('metre', 'meter', 'm')
     AND m.standard_length > 0
    THEN m.standard_length / 1000.0
    ELSE 1.0
  END AS unit_to_base_multiplier,
  (quantity * COALESCE(unit_cost, 0) * unit_to_base_multiplier)        AS planned_line_cost,
  (quantity * COALESCE(actual_unit_cost, unit_cost, 0) * unit_to_base_multiplier) AS reconciled_line_cost
FROM tbl_wo_bom b
LEFT JOIN tbl_materials m ON m.material_id = b.material_id
LEFT JOIN tbl_work_orders wo ON wo.work_order_id = b.work_order_id;
```

Two fixes baked in:
1. **Length-on-Metre multiplier** — when BOM row is priced per length (e.g. 4 × 3x2 timber @ £1.65/m) but the material is stored in metres with `standard_length = 4800` mm, the row's true cost is `qty × price × (4800/1000) = qty × price × 4.8`. This multiplier is invisible to direct `tbl_wo_bom` queries.
2. **Dual-path scope resolution** — `effective_scope_item_id` falls back from `b.scope_item_id` (direct attachment) to `wo.scope_item_id` (attached via work order). Rows that attach only to a WO, with null direct scope_id, still resolve to their parent scope.

All roll-up views (`qry_wo_cost_summary`, `qry_scopeitem_cost_summary`, `qry_scope_estimated_cost` via `qry_wo_estimated_cost`, `qry_job_cost_summary`, `qry_material_reconciliation`) route through `qry_bom_enriched`. Frontend components (`<CostBreakdown>`, `work-orders-panel.tsx`) also route through it or mirror its formula in-memory. **Never write new cost logic that queries `tbl_wo_bom` directly.**

Verified correct on real Grosvenor (job_number 13725) data:
- `3x2 Rounded Edge` (bom_id 148): qty 4, unit Length, unit_cost £1.65 → reconciled_line_cost £31.68 (multiplier 4.8)
- `Polyline IFR 60" Dark Green` (bom_id 70): scope_item_id NULL, work_order_id 23 → effective_scope_item_id 17 (dual-path resolution)

## RPC Functions (10, unchanged from S29)

| RPC | Args | Added | Notes |
|-----|------|-------|-------|
| `rpc_dashboard_data` | — | S12 | Admin dashboard payload |
| `rpc_workshop_data` | — | S12 | Workshop view payload |
| `rpc_review_data` | — | S12 | Review page payload |
| `rpc_capacity_data` | `p_date_from text, p_date_to text` | S12 | Capacity planner |
| `rpc_job_detail_data` | `p_job_id integer` | S12 | Admin job detail |
| `rpc_report_job_financial` | `p_job_id integer` | S12 | Pre-build financial report |
| `rpc_active_workers` | — | S22 | SECURITY DEFINER — bypasses freelancer RLS for non-sensitive cross-user who/where data |
| `rpc_learnings_similar` | `p_query_embedding vector, p_limit int = 5, p_category learning_category = null` | S25 | Semantic similarity over learnings embeddings |
| `rpc_load_list` | `p_job_id integer` | S26 | Load-list report payload |
| `rpc_pm_job_overview` | `p_job_id integer` | S28 (v5 at S28d) | PM 100m view payload. Key v5 fixes: dual-path BOM join, Length-on-Metre multiplier — same fixes that are in `qry_bom_enriched` |

## Utility Functions (7, unchanged from S29)
`get_my_role`, `get_my_freelancer_id`, `trigger_set_updated_at`, `audit_retention_cycle`, `rls_auto_enable`, `tbl_learnings_mark_embedding_pending`, `user_role`/`user_freelancer_id` (legacy).

## Extensions
`pgcrypto`, `pgvector` (S25), `pg_net` (S25).

## Indexes (200+)
Unchanged from S29. Full coverage documented there.

## RLS Summary
Unchanged from S29. All 47 tables have RLS enabled; new tables inherit `rls_auto_enable()` trigger. Role-based policies consolidated into 1 policy per (table, action) pattern using `get_my_role()` CASE. Role stored in `auth.users.app_metadata.role` (not user_metadata).

## Conventions (reinforced and added in S30-S33)

**From S28d (still authoritative — now implemented via `qry_bom_enriched`):**
- **BOM reaches quote line via two paths** — scope-attached OR WO-attached. `qry_bom_enriched.effective_scope_item_id = COALESCE(b.scope_item_id, wo.scope_item_id)` handles this. Direct `tbl_wo_bom` queries miss WO-only attachments.
- **BOM unit ≠ material unit means conversion** — `qry_bom_enriched.unit_to_base_multiplier` computes it (currently only handles Length → Metre; extensible to m² → linear-metre if needed).

**New in S30-S33:**
- **CAD documents live at three anchor levels** — job, scope, WO. Same `WODocumentsPanel` component mounts at all three, switches query branch based on which IDs are passed. Filename prefix convention: WO-level `{activity}-{scope}-{basename}.{ext}`, scope-level `{scope}-{basename}.{ext}`, job-level `{basename}.{ext}` (open collision risk — flagged in backlog).
- **`doc_type` split** — cad_concept (design) vs cad_breakdown (workshop). Don't collapse back to one type; the distinction matters for PM workflow.
- **`AUDITED_TABLES` registration is a prerequisite, not automatic** — `auditedInsert/Delete` gate log writes on `AUDITED_TABLES[tableName]`. Calling them with an unregistered table silently no-ops the audit branch. When adding audit coverage to any new table: (1) add the entry with PK column to `AUDITED_TABLES` in `src/lib/audit.ts`, (2) convert the raw calls, (3) verify by inspecting `tbl_audit_log` after a test action.
- **Audit inserts vs deletes have different value** — for tables where the row itself carries `uploaded_by`/`created_by`, the insert audit entry is redundant with the row. The delete audit entry is where the real value lives (once the row is gone, the audit log is the only trace). `tbl_wo_documents` follows this pattern.
- **Cosmetic updates stay raw** — drag-reorder on `sort_order`, UI preference toggles, anything that doesn't affect financial or operational state. Auditing them generates noise.
- **Verify correctness backlog items against live data before assuming they're still open** — stale entries exist. S28d's BOM bug was flagged as top priority for weeks but had actually been fixed via `qry_bom_enriched` earlier; a single Supabase query confirmed the fix live before spending work on a non-issue.
- **Next.js 16 auth file is `src/proxy.ts`** (renamed from `middleware.ts` in S33). Export is `export async function proxy(request: NextRequest)`. Runtime is Node.js, not configurable. Not a DB change but noted because PM deploy path depends on auth redirects working.
