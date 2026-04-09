-- Update qry_review_inbox to include routed_to_wo_id for tasks
DROP VIEW IF EXISTS qry_review_inbox;

CREATE VIEW qry_review_inbox WITH (security_invoker = true) AS
SELECT * FROM (
  SELECT
    'task'::TEXT AS item_type,
    t.task_id AS item_id,
    t.freelancer_id,
    f.freelancer_name,
    t.category,
    t.title,
    t.description,
    t.hours AS claimed_hours,
    t.worked_date,
    t.job_id,
    pp.job_name,
    pp.job_number,
    NULL::TEXT AS urgency,
    NULL::TEXT AS photo_url,
    t.routed_to_wo_id AS work_order_id,
    t.status,
    t.created_at
  FROM tbl_tasks t
  JOIN tbl_freelancers f ON f.freelancer_id = t.freelancer_id
  LEFT JOIN tbl_production_plan pp ON pp.job_id = t.job_id
  WHERE t.status = 'pending'

  UNION ALL

  SELECT
    'request'::TEXT AS item_type,
    r.request_id AS item_id,
    r.freelancer_id,
    f.freelancer_name,
    r.category,
    r.title,
    r.description,
    NULL::NUMERIC AS claimed_hours,
    NULL::DATE AS worked_date,
    r.job_id,
    pp.job_name,
    pp.job_number,
    r.urgency,
    r.photo_url,
    r.work_order_id,
    r.status,
    r.created_at
  FROM tbl_workshop_requests r
  JOIN tbl_freelancers f ON f.freelancer_id = r.freelancer_id
  LEFT JOIN tbl_production_plan pp ON pp.job_id = r.job_id
  WHERE r.status IN ('open', 'acknowledged')
) sub
ORDER BY
  CASE WHEN urgency = 'urgent' THEN 0 ELSE 1 END,
  created_at DESC;