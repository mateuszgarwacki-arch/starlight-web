-- ============================================================
-- TIME ENTRY SOFT DELETE + ADMIN EDIT
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Archive columns on time entries
ALTER TABLE tbl_wo_time_entries ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE tbl_wo_time_entries ADD COLUMN IF NOT EXISTS archived_by UUID;
ALTER TABLE tbl_wo_time_entries ADD COLUMN IF NOT EXISTS archive_reason VARCHAR;

-- 2. Update cost views to exclude archived entries
-- Drop dependent views first (job rolls up from scope, scope from wo)
DROP VIEW IF EXISTS qry_job_cost_summary CASCADE;
DROP VIEW IF EXISTS qry_scopeitem_cost_summary CASCADE;
DROP VIEW IF EXISTS qry_wo_cost_summary CASCADE;
DROP VIEW IF EXISTS qry_estimate_vs_actual CASCADE;


-- 3. Recreate WO cost summary (excludes archived time entries)
CREATE OR REPLACE VIEW qry_wo_cost_summary AS
SELECT
  wo.work_order_id,
  wo.scope_item_id,
  wo.job_id,
  wo.status,
  wo.description,
  wo.estimated_duration_hrs,
  COALESCE(te.labour_cost, 0) AS labour_cost,
  COALESCE(te.total_hours, 0) AS total_hours,
  COALESCE(te.entry_count, 0) AS entry_count,
  COALESCE(bom.material_cost, 0) AS material_cost,
  COALESCE(te.labour_cost, 0) + COALESCE(bom.material_cost, 0) AS total_cost
FROM tbl_work_orders wo
LEFT JOIN (
  SELECT work_order_id,
    SUM(entry_cost) AS labour_cost,
    SUM(actual_hours) AS total_hours,
    COUNT(*) AS entry_count
  FROM tbl_wo_time_entries
  WHERE archived_at IS NULL
  GROUP BY work_order_id
) te ON te.work_order_id = wo.work_order_id
LEFT JOIN (
  SELECT work_order_id,
    SUM(COALESCE(actual_unit_cost, unit_cost, 0) * COALESCE(quantity, 0)) AS material_cost
  FROM tbl_wo_bom
  GROUP BY work_order_id
) bom ON bom.work_order_id = wo.work_order_id;


-- 4. Recreate scope item cost summary
CREATE OR REPLACE VIEW qry_scopeitem_cost_summary AS
SELECT
  si.scope_item_id,
  si.job_id,
  si.item_name,
  si.status,
  COUNT(DISTINCT wo.work_order_id) AS wo_count,
  SUM(COALESCE(wc.labour_cost, 0)) AS labour_cost,
  SUM(COALESCE(wc.total_hours, 0)) AS total_hours,
  SUM(COALESCE(wc.material_cost, 0)) AS material_cost,
  SUM(COALESCE(wc.total_cost, 0)) AS total_cost
FROM tbl_scope_items si
LEFT JOIN tbl_work_orders wo ON wo.scope_item_id = si.scope_item_id
LEFT JOIN qry_wo_cost_summary wc ON wc.work_order_id = wo.work_order_id
GROUP BY si.scope_item_id, si.job_id, si.item_name, si.status;

-- 5. Recreate job cost summary
CREATE OR REPLACE VIEW qry_job_cost_summary AS
SELECT
  pp.job_id,
  pp.job_name,
  pp.job_number,
  pp.budget_allowance,
  COALESCE(q.quote_total, 0) AS quote_total,
  COALESCE(sc.labour_cost, 0) AS labour_cost,
  COALESCE(sc.total_hours, 0) AS total_hours,
  COALESCE(sc.material_cost, 0) AS material_cost,
  COALESCE(sc.total_cost, 0) AS total_cost,
  CASE WHEN COALESCE(q.quote_total, 0) > 0
    THEN ROUND((1 - COALESCE(sc.total_cost, 0) / q.quote_total) * 100, 1)
    ELSE NULL END AS margin_pct
FROM tbl_production_plan pp
LEFT JOIN (
  SELECT job_id, SUM(quote_value) AS quote_total
  FROM tbl_quotes WHERE status = 'Accepted'
  GROUP BY job_id
) q ON q.job_id = pp.job_id
LEFT JOIN (
  SELECT job_id,
    SUM(labour_cost) AS labour_cost,
    SUM(total_hours) AS total_hours,
    SUM(material_cost) AS material_cost,
    SUM(total_cost) AS total_cost
  FROM qry_scopeitem_cost_summary
  GROUP BY job_id
) sc ON sc.job_id = pp.job_id;


-- 6. Recreate estimate vs actual
CREATE OR REPLACE VIEW qry_estimate_vs_actual AS
SELECT
  wo.work_order_id,
  wo.scope_item_id,
  wo.job_id,
  wo.description,
  wo.estimated_duration_hrs,
  wo.status,
  COALESCE(te.total_hours, 0) AS actual_hours,
  CASE WHEN wo.estimated_duration_hrs > 0
    THEN ROUND(COALESCE(te.total_hours, 0) / wo.estimated_duration_hrs * 100, 1)
    ELSE NULL END AS accuracy_pct
FROM tbl_work_orders wo
LEFT JOIN (
  SELECT work_order_id, SUM(actual_hours) AS total_hours
  FROM tbl_wo_time_entries
  WHERE archived_at IS NULL
  GROUP BY work_order_id
) te ON te.work_order_id = wo.work_order_id
WHERE wo.status = 'Complete';

-- 7. Also update today_roster to exclude archived
DROP VIEW IF EXISTS qry_today_roster;
CREATE OR REPLACE VIEW qry_today_roster AS
SELECT
  f.freelancer_id,
  f.freelancer_name,
  f.speciality,
  te.work_order_id,
  te.system_start_timestamp,
  te.actual_hours,
  wo.description AS wo_description,
  wo.job_id,
  pp.job_name,
  pp.job_number
FROM tbl_wo_time_entries te
JOIN tbl_freelancers f ON f.freelancer_id = te.freelancer_id
JOIN tbl_work_orders wo ON wo.work_order_id = te.work_order_id
LEFT JOIN tbl_production_plan pp ON pp.job_id = wo.job_id
WHERE te.system_end_timestamp IS NULL
  AND te.archived_at IS NULL
  AND te.system_start_timestamp::date = CURRENT_DATE;
