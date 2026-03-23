-- ============================================================
-- STARLIGHT SESSION 8: Multi-user foundation
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. AUDIT LOG TABLE
-- Stores every field-level change on key tables, supports undo
CREATE TABLE IF NOT EXISTS tbl_audit_log (
  audit_id       BIGSERIAL PRIMARY KEY,
  -- WHO
  user_id        UUID,                          -- Supabase Auth user ID
  user_name      VARCHAR,                       -- Display name at time of action
  user_role      VARCHAR,                       -- Role at time of action
  -- WHAT
  table_name     VARCHAR NOT NULL,
  record_id      INT NOT NULL,                  -- PK of the changed record
  field_name     VARCHAR NOT NULL,
  old_value      TEXT,                          -- JSON-encoded previous value
  new_value      TEXT,                          -- JSON-encoded new value
  -- WHEN
  changed_at     TIMESTAMPTZ DEFAULT NOW(),
  -- CONTEXT
  job_id         INT,                           -- Denormalised for filtering by job
  action_type    VARCHAR DEFAULT 'update',      -- update / insert / delete
  -- UNDO
  reverted_at    TIMESTAMPTZ,
  reverted_by    UUID
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_job ON tbl_audit_log(job_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON tbl_audit_log(table_name, record_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON tbl_audit_log(user_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_changed ON tbl_audit_log(changed_at DESC);


-- 2. UPDATED_AT COLUMNS for optimistic concurrency
-- Only on tables where multi-user edit conflicts are likely
ALTER TABLE tbl_quote_lines ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE tbl_scope_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE tbl_work_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE tbl_wo_bom ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE tbl_production_plan ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE tbl_quotes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Auto-update trigger function
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON tbl_quote_lines
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON tbl_scope_items
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON tbl_work_orders
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON tbl_wo_bom
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON tbl_production_plan
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON tbl_quotes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 3. RLS on AUDIT LOG
ALTER TABLE tbl_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin and PM can read all audit entries
DROP POLICY IF EXISTS audit_read_pm ON tbl_audit_log;
CREATE POLICY audit_read_pm ON tbl_audit_log FOR SELECT
  USING (
    (auth.jwt() ->> 'role') IN ('admin', 'production_manager', 'Production-Manager')
    OR (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'production_manager', 'Production-Manager')
  );

-- All authenticated users can insert audit entries (the app writes them)
DROP POLICY IF EXISTS audit_insert_all ON tbl_audit_log;
CREATE POLICY audit_insert_all ON tbl_audit_log FOR INSERT
  WITH CHECK (true);

-- Only admin can revert (update reverted_at/reverted_by)
DROP POLICY IF EXISTS audit_revert_admin ON tbl_audit_log;
CREATE POLICY audit_revert_admin ON tbl_audit_log FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') IN ('admin', 'production_manager', 'Production-Manager')
    OR (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'production_manager', 'Production-Manager')
  );

-- 4. REPLICA IDENTITY for realtime (if needed later)
ALTER TABLE tbl_audit_log REPLICA IDENTITY FULL;

