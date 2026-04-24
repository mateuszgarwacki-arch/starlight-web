# Starlight Database Schema — Session 39 (24 April 2026)

**Counts:** 55 tables, 34 views, 13 RPC functions + 2 internal helper functions.

This document is a schema snapshot as of end-of-session 39. The previous doc (`starlight_database_schema_session35.md`) is now stale in two material ways:

1. S38d added `tbl_check_types`, `tbl_quote_line_checks`, and the `qry_quote_line_badges` view.
2. S38 added `tbl_timesheet_flags` and the `rpc_detect_timesheet_gaps` RPC.
3. S39 added the four handover tables, the job-overhead trigger function, and `rpc_job_handover_data`.

This file documents only what changed in S39 — refer to the earlier docs for anything not mentioned here.

---

## Session 39 additions

### Overhead bucket (S39a)

Non-schema, data shape only. Every job now has an auto-created triple:

| Tier | Row | Marker |
|---|---|---|
| Quote line | `tbl_quote_lines` row | `line_sub_group = 'Overhead'`, `category = 'General'`, `quantity = 1`, `unit_price = 0`, `line_value = 0` |
| Scope | `tbl_scope_items` row | `is_general = true` |
| Work Order | `tbl_work_orders` row | `activity_verb = (lookup_id for 'OVERHEAD')`, status `Ready` |

**New lookup value:** `ACTIVITY.OVERHEAD` in `tbl_master_lookups`. `phase_number = NULL` so it doesn't compete for fabrication scheduling.

**New internal functions (not user-facing):**

```sql
fn_create_job_overhead(p_job_id INT) RETURNS VOID
  SECURITY DEFINER, plpgsql
  Idempotent. Creates the overhead triple for the given job.
  Guard: RETURN if tbl_scope_items already has is_general=true for this job.
  Invoked by trigger and by retrofit migrations.

trg_fn_create_job_overhead() RETURNS TRIGGER
  Wrapper that calls fn_create_job_overhead(NEW.job_id).

Trigger trg_create_job_overhead ON tbl_production_plan
  AFTER INSERT FOR EACH ROW EXECUTE FUNCTION trg_fn_create_job_overhead()
```

All exclusion-safe queries going forward must filter on one or more of:
- `tbl_quote_lines.line_sub_group != 'Overhead'`
- `tbl_scope_items.is_general = false` (via `COALESCE(is_general, false) = false`)
- `tbl_work_orders` via activity_verb NOT = OVERHEAD lookup_id

Current handover RPC and cost views exclude consistently. Future report queries that should ignore overhead must do the same.

---

### Handover Summary tables (S39d)

Four sparse tables holding per-job authoring data for the handover print view.

#### `tbl_handover_zone_notes`

Per-zone notes + display order + inclusion flag for the Handover Summary.

```sql
CREATE TABLE tbl_handover_zone_notes (
  zone_notes_id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES tbl_production_plan(job_id) ON DELETE CASCADE,
  event_zone TEXT NOT NULL,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 999,
  is_included BOOLEAN NOT NULL DEFAULT true,  -- added S39f
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_at TIMESTAMPTZ,
  UNIQUE (job_id, event_zone)
);

CREATE INDEX idx_handover_zone_notes_job ON tbl_handover_zone_notes(job_id);
```

**Semantics:**
- Zone identity is the `event_zone` string on `tbl_quote_lines`. No zone dictionary — authored values live here only.
- Sparse: absence of a row for a zone means `sort_order=999` (end) + notes empty + `is_included=true` (included).
- Arrow reorder in edit page normalises all zones to 1..N on first click, locking in explicit order.
- `is_included=false` excludes the whole zone (and everything inside it — lines, scopes, WOs, drawings) from the handover.
- Notes and drawings on excluded zones stay editable (don't lose work if re-included).

**RLS:** authenticated users can SELECT/INSERT/UPDATE/DELETE.

#### `tbl_handover_zone_documents`

Junction from handover zones to job-level documents (the drawings that appear on each zone's drawing pages).

```sql
CREATE TABLE tbl_handover_zone_documents (
  job_id INT NOT NULL REFERENCES tbl_production_plan(job_id) ON DELETE CASCADE,
  event_zone TEXT NOT NULL,
  doc_id INT NOT NULL REFERENCES tbl_wo_documents(doc_id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id, event_zone, doc_id)
);

CREATE INDEX idx_handover_zone_docs_job ON tbl_handover_zone_documents(job_id);
```

**Semantics:**
- Only documents where `tbl_wo_documents.scope_item_id IS NULL AND work_order_id IS NULL` qualify — i.e. job-level docs (production drawings, not scope or WO attachments).
- Explicit link — a document does NOT automatically belong to any zone. PM picks per-zone.
- CASCADE on both FKs so deleting a job or a document cleans up cleanly.

**RLS:** authenticated users can SELECT/INSERT/UPDATE/DELETE.

#### `tbl_handover_line_overrides`

Per-quote-line overrides — inclusion flag + optional note. Sparse.

```sql
CREATE TABLE tbl_handover_line_overrides (
  job_id INT NOT NULL REFERENCES tbl_production_plan(job_id) ON DELETE CASCADE,
  quote_line_id INT NOT NULL REFERENCES tbl_quote_lines(quote_line_id) ON DELETE CASCADE,
  is_included BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_at TIMESTAMPTZ,
  PRIMARY KEY (job_id, quote_line_id)
);

CREATE INDEX idx_handover_line_overrides_job ON tbl_handover_line_overrides(job_id);
```

**Semantics:**
- Sparse: absence of row = line is included, no note. No backfill needed.
- `is_included=false` drops the line from the handover body but it still counts in `excluded_line_count` (unless the whole zone is also excluded — double-exclusion hygiene in the RPC).
- `notes` prints above the scope breakdown for that line on the handover.

**RLS:** authenticated users can SELECT/INSERT/UPDATE/DELETE.

#### `tbl_handover_wo_notes`

Per-WO notes for the handover. Sparse.

```sql
CREATE TABLE tbl_handover_wo_notes (
  job_id INT NOT NULL REFERENCES tbl_production_plan(job_id) ON DELETE CASCADE,
  work_order_id INT NOT NULL REFERENCES tbl_work_orders(work_order_id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_at TIMESTAMPTZ,
  PRIMARY KEY (job_id, work_order_id)
);

CREATE INDEX idx_handover_wo_notes_job ON tbl_handover_wo_notes(job_id);
```

**Semantics:**
- Sparse: row only exists when notes have been set.
- Prints inline under the WO description on the handover (above "Hands on:" worker names line).

**RLS:** authenticated users can SELECT/INSERT/UPDATE/DELETE.

---

### RPC: `rpc_job_handover_data(p_job_id INT) RETURNS JSONB`

**Purpose:** Single-call JSON payload for the handover print page. Live data — no snapshot.

**Signature:** `LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path = public`.

**Return shape:**

```jsonc
{
  "job": {
    "job_id": 8,
    "job_number": "13725",
    "job_name": "Wedding at Grosvenor Hotel V3",
    "client_name": "Fait Accompli",       // not printed on cover (discretion)
    "event_date": "2026-05-09T00:00:00+00:00",
    "event_location": "Grosvenor Hotel, London",
    "job_status": "Active",
    "budget_allowance": 377340.00
  },
  "zones": [
    {
      "event_zone": "Ballroom Foyer",
      "sort_order": 1,
      "notes": "Access via north corridor only...",
      "readiness": {
        "wo_total": 7,         // excluding overhead, excluding excluded lines
        "wo_complete": 6,
        "wo_in_progress": 0,
        "wo_on_hold": 0,
        "items_total": 12,
        "items_kit_ready": 0
      },
      "documents": [
        {
          "doc_id": 182,
          "file_name": "Main-Ballroom-entance.jpg",
          "caption": null,
          "mime_type": "image/jpeg",
          "onedrive_item_id": null,
          "onedrive_path": "Workshop/13725-.../Main-Ballroom-entance.jpg",  // added S39g
          "doc_type": "drawing",
          "sort_order": 1
        }
      ],
      "quote_lines": [
        {
          "quote_line_id": 95,
          "line_number": "2",
          "import_sequence": 2,
          "line_text": "Pleated Green polyline wall...",
          "quantity": 7,
          "line_sub_group": "Design",
          "line_note": null,          // from tbl_handover_line_overrides (S39e)
          "scopes": [
            {
              "scope_item_id": 42,
              "item_name": "Pleated Green polyline wall...",
              "description": null,
              "status": "Workshop Completed",
              "job_items": [
                {
                  "item_id": 215,
                  "description": "12' x 4' Flat",
                  "item_type": "Flat",
                  "quantity": 6,
                  "unit": null,
                  "finish_required": null,
                  "kit_list_exported": false,
                  "linked_wos": [       // added S39h
                    {
                      "work_order_id": 23,
                      "wo_sequence": 1,
                      "status": "Complete"
                    }
                  ]
                }
              ],
              "work_orders": [
                {
                  "work_order_id": 23,
                  "description": "Build carcasses with wheels...",
                  "status": "Complete",
                  "activity_verb": "BUILD",
                  "wo_sequence": 1,
                  "wo_note": null,        // from tbl_handover_wo_notes (S39e)
                  "workers": ["Mark Cambell"]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "unassigned_lines": [],                 // quote lines with null/empty event_zone
  "excluded_line_count": 0,               // only lines in INCLUDED zones count
  "excluded_zone_count": 0,
  "generated_at": "2026-04-24T22:43:00Z"
}
```

**Filter logic:**

- **Overhead bucket excluded at every level:**
  - `tbl_quote_lines.line_sub_group != 'Overhead'`
  - `tbl_scope_items.is_general = false`
  - (Overhead's WO is not reachable — its scope is excluded.)

- **Line overrides:** LEFT JOIN `tbl_handover_line_overrides`, filter `COALESCE(is_included, true) = true` everywhere (readiness counts, quote_lines subquery, unassigned_lines).

- **Zone overrides:** LEFT JOIN `tbl_handover_zone_notes`, filter `COALESCE(is_included, true) = true` at the top-level zone aggregation. Everything nested drops with the zone.

- **Double-exclusion hygiene:** `excluded_line_count` counts only lines whose zone is INCLUDED. A line in an excluded zone is "doubly excluded" — it should be silent, not inflate the line banner.

**Error handling:** if job not found, returns `{ "error": "Job not found", "job_id": N }`.

---

### Schema diff summary

| Table / view / function | Status | Source |
|---|---|---|
| `tbl_handover_zone_notes` | NEW | S39d |
| `tbl_handover_zone_documents` | NEW | S39d |
| `tbl_handover_line_overrides` | NEW | S39e |
| `tbl_handover_wo_notes` | NEW | S39e |
| `tbl_handover_zone_notes.is_included` | ADDED | S39f |
| `rpc_job_handover_data(INT)` | NEW | S39d, patched S39e/f/g/h |
| `fn_create_job_overhead(INT)` | NEW | S39a |
| `trg_fn_create_job_overhead()` | NEW | S39a |
| Trigger `trg_create_job_overhead` on `tbl_production_plan` | NEW | S39a |
| Lookup `ACTIVITY.OVERHEAD` | NEW | S39a |

No tables dropped. No views touched. No RLS changes outside new tables' own policies.

---

### Not in this session (for reference)

These items from the previous schema doc (`session35`) are still accurate as of S39:

- `tbl_stock_items`, `tbl_job_items`, `tbl_quote_lines`, `tbl_scope_items`, `tbl_work_orders`, `tbl_wo_bom`, `tbl_wo_time_entries`, `tbl_freelancers`, `tbl_production_plan`, `tbl_quotes`, `tbl_master_lookups` — unchanged structurally.
- Realtime publication membership — unchanged.
- RLS pattern (1 policy per table-action, `TO authenticated`) — unchanged.
- Audit tables (`tbl_audit_log`) — unchanged.

Items added between session35 and session39 in other sessions (S38 and before):
- `tbl_check_types`, `tbl_quote_line_checks`, view `qry_quote_line_badges` (S38d)
- `tbl_timesheet_flags`, `rpc_detect_timesheet_gaps`, cron job (S38)
- `tbl_production_plan` had `budget_allowance` column through a separate migration path (predates S39).

See `TRACKER.md` for full session-by-session log.
