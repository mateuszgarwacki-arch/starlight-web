-- Traveller PDF feature: add tracking columns to tbl_work_orders
-- Run this in Supabase SQL editor BEFORE deploying the UI

-- 1. Add traveller tracking columns
ALTER TABLE tbl_work_orders
  ADD COLUMN IF NOT EXISTS traveller_printed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS traveller_printed_by INT DEFAULT NULL;

-- 2. Create the stale travellers view
DROP VIEW IF EXISTS qry_stale_travellers;
CREATE VIEW qry_stale_travellers AS
SELECT
  wo.work_order_id,
  wo.job_id,
  wo.scope_item_id,
  wo.description AS wo_description,
  wo.status AS wo_status,
  wo.traveller_printed_at,
  sc.item_name AS scope_name,
  pp.job_number,
  pp.job_name,
  pp.event_date,
  CASE
    WHEN bom_latest.latest_bom > wo.traveller_printed_at THEN true
    ELSE false
  END AS bom_changed,
  CASE
    WHEN doc_latest.latest_doc > wo.traveller_printed_at THEN true
    ELSE false
  END AS docs_changed,
  CASE
    WHEN sc.status = 'Modified' AND sc.modified_at > wo.traveller_printed_at THEN true
    ELSE false
  END AS scope_modified,
  GREATEST(
    bom_latest.latest_bom,
    doc_latest.latest_doc,
    CASE WHEN sc.status = 'Modified' THEN sc.modified_at ELSE NULL END
  ) AS latest_change_at
FROM tbl_work_orders wo
JOIN tbl_scope_items sc ON sc.scope_item_id = wo.scope_item_id
JOIN tbl_production_plan pp ON pp.job_id = wo.job_id
LEFT JOIN LATERAL (
  SELECT MAX(GREATEST(
    COALESCE(b.ordered_at, '1970-01-01'::timestamptz)
  )) AS latest_bom
  FROM tbl_wo_bom b
  WHERE b.work_order_id = wo.work_order_id
) bom_latest ON true
LEFT JOIN LATERAL (
  SELECT MAX(d.uploaded_at::timestamptz) AS latest_doc
  FROM tbl_wo_documents d
  WHERE d.work_order_id = wo.work_order_id
) doc_latest ON true
WHERE wo.traveller_printed_at IS NOT NULL
  AND wo.status NOT IN ('Voided', 'Complete')
  AND (
    bom_latest.latest_bom > wo.traveller_printed_at
    OR doc_latest.latest_doc > wo.traveller_printed_at
    OR (sc.status = 'Modified' AND sc.modified_at > wo.traveller_printed_at)
  );
