-- PM Queries: questions raised during scope breakdown for PM clarification
CREATE TABLE IF NOT EXISTS tbl_pm_queries (
  query_id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES tbl_production_plan(job_id),
  scope_item_id INTEGER REFERENCES tbl_scope_items(scope_item_id),
  question TEXT NOT NULL,
  answer TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Answered', 'Dismissed')),
  created_by INTEGER REFERENCES tbl_freelancers(freelancer_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  answered_by INTEGER REFERENCES tbl_freelancers(freelancer_id)
);

CREATE INDEX IF NOT EXISTS idx_pm_queries_job ON tbl_pm_queries(job_id);
CREATE INDEX IF NOT EXISTS idx_pm_queries_scope ON tbl_pm_queries(scope_item_id);
CREATE INDEX IF NOT EXISTS idx_pm_queries_status ON tbl_pm_queries(status) WHERE status = 'Open';

-- RLS
ALTER TABLE tbl_pm_queries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pm_queries_select ON tbl_pm_queries;
CREATE POLICY pm_queries_select ON tbl_pm_queries FOR SELECT USING (true);
DROP POLICY IF EXISTS pm_queries_insert ON tbl_pm_queries;
CREATE POLICY pm_queries_insert ON tbl_pm_queries FOR INSERT WITH CHECK (
  get_my_role() IN ('admin', 'production_manager', 'foreman')
);
DROP POLICY IF EXISTS pm_queries_update ON tbl_pm_queries;
CREATE POLICY pm_queries_update ON tbl_pm_queries FOR UPDATE USING (
  get_my_role() IN ('admin', 'production_manager', 'foreman')
);
DROP POLICY IF EXISTS pm_queries_delete ON tbl_pm_queries;
CREATE POLICY pm_queries_delete ON tbl_pm_queries FOR DELETE USING (
  get_my_role() IN ('admin', 'production_manager')
);
