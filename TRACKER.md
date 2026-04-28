# Starlight Web App — Development Tracker

## 🧹 Cleanup Backlog

Running list of known debt, deferred work, and small follow-ups. Reviewed at the start of every session. Items are added whenever a session ships something with a known deferral or a correctness bug that we chose not to fix in-flight. Order roughly reflects priority — top items are the ones to do next. Check items off as they ship; move completed ones to the relevant session entry.

### Correctness (do first)

*No open correctness items. S28d closed out in S33 — see session entry below.*

### Small/mechanical (easy wins)

- \[ \] **Update** `05_conventions.md` **§11** *(S40b, manual)* — file lives in project knowledge upload, not the repo. Replace "Freelancer mobile filters CAD types client-side" with the specific rule: only `cad_concept` is filtered; `cad_breakdown` flows through to `/m/wo/[woId]`.
- \[ \] **Share-flow size threshold** *(S40c, conditional)* — if 50MB+ PDF shares feel slow in real use, add a size check that falls back to URL-share for files &gt;20MB. Don't ship pre-emptively.

### Features deferred

- \[ \] **Handover — PDF drawing rendering** *(S39)* — image drawings render full-page inline; PDF drawings currently show a fallback "Open PDF" box. Add pdf.js (dynamic import, \~500KB gzipped) and render PDF pages to canvas at 2× DPR for crisp print. Applies to `DrawingPage` in `/reports/handover/[jobId]/page.tsx`.
- \[ \] **Handover — persist drawing rotation** *(S39)* — rotation state is currently in-memory only (matches traveller). If a zone has 10 landscape drawings, every session restart means re-rotating. Add `rotation INT DEFAULT 0` on `tbl_handover_zone_documents` and persist on rotate. One small migration + a PATCH on the handler.
- \[ \] **Handover — activity-aware "built by" verbs** *(S39)* — current label "Hands on:" is universal. If real handover use reads too soft, upgrade to activity-aware verbs: "Built by:" for BUILD, "Painted by:" for PAINT, "Upholstered by:" for COVER, fallback "Hands on:" for anything unmapped. Small verb map maintained as new activities ship. Stronger signature/ownership feel.
- \[ \] **Handover — multi-scope scope-name display** *(S39)* — the scope card currently drops `scope.item_name` (it duplicated the line text when there was one scope per line). When a line has 2+ scopes, name differentiation becomes useful again. Either always show `item_name` when it meaningfully differs from `line_text`, or always show it when there are multiple scopes on the line. Not actionable until a real 2-scope line appears on a handover.
- \[ \] **Handover — multi-quote job audit** *(S39)* — Tite Street (job 14) is the only multi-quote job. Verify:
  - Job page lists both quotes, cost analysis sums across them.
  - `qry_dash_quote_stats` aggregates correctly.
