-- ============================================================
-- STARLIGHT SECURITY HARDENING SQL
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- Session 7 (23 Mar 2026)
-- ============================================================

-- ============================================================
-- 1. REALTIME: Enable publication + REPLICA IDENTITY FULL
--    (Required for RLS to work correctly on realtime subscriptions)
-- ============================================================

-- Add tables to realtime publication (idempotent — errors if already added, safe to ignore)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tbl_work_orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tbl_wo_time_entries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tbl_freelancer_schedule;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tbl_notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- REPLICA IDENTITY FULL ensures RLS filters work on realtime events
-- (Without this, RLS only gets primary key columns — not enough for role checks)
ALTER TABLE tbl_work_orders REPLICA IDENTITY FULL;
ALTER TABLE tbl_wo_time_entries REPLICA IDENTITY FULL;
ALTER TABLE tbl_freelancer_schedule REPLICA IDENTITY FULL;
ALTER TABLE tbl_notifications REPLICA IDENTITY FULL;

-- ============================================================
-- 2. RLS HARDENING: Ensure freelancers cannot access commercial data
-- ============================================================

-- Helper: extract role from JWT
-- Usage in policies: get_my_role() = 'production_manager'
CREATE OR REPLACE FUNCTION get_my_role() RETURNS text AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    'freelancer'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: extract freelancer_id from JWT
CREATE OR REPLACE FUNCTION get_my_freelancer_id() RETURNS int AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'freelancer_id')::int,
    0
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 2a. COMMERCIAL TABLES: Block freelancer access entirely
-- ============================================================

-- tbl_quotes: PM only
ALTER TABLE tbl_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotes_pm_only ON tbl_quotes;
CREATE POLICY quotes_pm_only ON tbl_quotes
  FOR ALL USING (get_my_role() IN ('production_manager', 'Production-Manager'));

-- tbl_quote_lines: PM only
ALTER TABLE tbl_quote_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quote_lines_pm_only ON tbl_quote_lines;
CREATE POLICY quote_lines_pm_only ON tbl_quote_lines
  FOR ALL USING (get_my_role() IN ('production_manager', 'Production-Manager'));

-- tbl_quote_line_contractors: PM only
ALTER TABLE tbl_quote_line_contractors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qlc_pm_only ON tbl_quote_line_contractors;
CREATE POLICY qlc_pm_only ON tbl_quote_line_contractors
  FOR ALL USING (get_my_role() IN ('production_manager', 'Production-Manager'));

-- tbl_invoices: PM only
ALTER TABLE tbl_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_pm_only ON tbl_invoices;
CREATE POLICY invoices_pm_only ON tbl_invoices
  FOR ALL USING (get_my_role() IN ('production_manager', 'Production-Manager'));

-- tbl_invoice_lines: PM only
ALTER TABLE tbl_invoice_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_lines_pm_only ON tbl_invoice_lines;
CREATE POLICY invoice_lines_pm_only ON tbl_invoice_lines
  FOR ALL USING (get_my_role() IN ('production_manager', 'Production-Manager'));

-- tbl_rate_card: PM only
ALTER TABLE tbl_rate_card ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_card_pm_only ON tbl_rate_card;
CREATE POLICY rate_card_pm_only ON tbl_rate_card
  FOR ALL USING (get_my_role() IN ('production_manager', 'Production-Manager'));

-- tbl_business_settings: PM only
ALTER TABLE tbl_business_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settings_pm_only ON tbl_business_settings;
CREATE POLICY settings_pm_only ON tbl_business_settings
  FOR ALL USING (get_my_role() IN ('production_manager', 'Production-Manager'));

-- tbl_suppliers: PM only
ALTER TABLE tbl_suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS suppliers_pm_only ON tbl_suppliers;
CREATE POLICY suppliers_pm_only ON tbl_suppliers
  FOR ALL USING (get_my_role() IN ('production_manager', 'Production-Manager'));

-- ============================================================
-- 2b. EXECUTION TABLES: Freelancers get limited access
-- ============================================================

-- tbl_work_orders: Freelancers see Ready + In-Progress only; PM/foreman see all
ALTER TABLE tbl_work_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wo_select ON tbl_work_orders;
CREATE POLICY wo_select ON tbl_work_orders FOR SELECT USING (
  CASE
    WHEN get_my_role() = 'freelancer' THEN status IN ('Ready', 'In-Progress')
    ELSE true
  END
);
DROP POLICY IF EXISTS wo_update ON tbl_work_orders;
CREATE POLICY wo_update ON tbl_work_orders FOR UPDATE USING (
  get_my_role() IN ('production_manager', 'Production-Manager', 'foreman', 'Foreman')
);
DROP POLICY IF EXISTS wo_insert ON tbl_work_orders;
CREATE POLICY wo_insert ON tbl_work_orders FOR INSERT WITH CHECK (
  get_my_role() IN ('production_manager', 'Production-Manager', 'foreman', 'Foreman')
);
DROP POLICY IF EXISTS wo_delete ON tbl_work_orders;
CREATE POLICY wo_delete ON tbl_work_orders FOR DELETE USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- tbl_wo_time_entries: Freelancers can INSERT own + UPDATE own; PM can do all
ALTER TABLE tbl_wo_time_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_select ON tbl_wo_time_entries;
CREATE POLICY time_select ON tbl_wo_time_entries FOR SELECT USING (
  CASE
    WHEN get_my_role() = 'freelancer' THEN freelancer_id = get_my_freelancer_id()
    ELSE true
  END
);
DROP POLICY IF EXISTS time_insert ON tbl_wo_time_entries;
CREATE POLICY time_insert ON tbl_wo_time_entries FOR INSERT WITH CHECK (
  CASE
    WHEN get_my_role() = 'freelancer' THEN freelancer_id = get_my_freelancer_id()
    ELSE true
  END
);
DROP POLICY IF EXISTS time_update ON tbl_wo_time_entries;
CREATE POLICY time_update ON tbl_wo_time_entries FOR UPDATE USING (
  CASE
    WHEN get_my_role() = 'freelancer' THEN freelancer_id = get_my_freelancer_id()
    ELSE true
  END
);
DROP POLICY IF EXISTS time_delete ON tbl_wo_time_entries;
CREATE POLICY time_delete ON tbl_wo_time_entries FOR DELETE USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- tbl_wo_bom: Freelancers can see (for traveller), PM/foreman can edit
ALTER TABLE tbl_wo_bom ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bom_select ON tbl_wo_bom;
CREATE POLICY bom_select ON tbl_wo_bom FOR SELECT USING (true);
DROP POLICY IF EXISTS bom_modify ON tbl_wo_bom;
CREATE POLICY bom_modify ON tbl_wo_bom FOR ALL USING (
  get_my_role() IN ('production_manager', 'Production-Manager', 'foreman', 'Foreman')
);

-- tbl_freelancer_schedule: Freelancers see own; PM sees all
ALTER TABLE tbl_freelancer_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_select ON tbl_freelancer_schedule;
CREATE POLICY schedule_select ON tbl_freelancer_schedule FOR SELECT USING (
  CASE
    WHEN get_my_role() = 'freelancer' THEN freelancer_id = get_my_freelancer_id()
    ELSE true
  END
);
DROP POLICY IF EXISTS schedule_update ON tbl_freelancer_schedule;
CREATE POLICY schedule_update ON tbl_freelancer_schedule FOR UPDATE USING (
  CASE
    WHEN get_my_role() = 'freelancer' THEN freelancer_id = get_my_freelancer_id()
    ELSE true
  END
);
DROP POLICY IF EXISTS schedule_insert ON tbl_freelancer_schedule;
CREATE POLICY schedule_insert ON tbl_freelancer_schedule FOR INSERT WITH CHECK (
  get_my_role() IN ('production_manager', 'Production-Manager', 'foreman', 'Foreman')
);
DROP POLICY IF EXISTS schedule_delete ON tbl_freelancer_schedule;
CREATE POLICY schedule_delete ON tbl_freelancer_schedule FOR DELETE USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- ============================================================
-- 2c. REFERENCE/LOOKUP TABLES: Read-only for non-PM
-- ============================================================

-- tbl_freelancers: Freelancers see own row only; PM/foreman see all
ALTER TABLE tbl_freelancers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS freelancers_select ON tbl_freelancers;
CREATE POLICY freelancers_select ON tbl_freelancers FOR SELECT USING (
  CASE
    WHEN get_my_role() = 'freelancer' THEN freelancer_id = get_my_freelancer_id()
    ELSE true
  END
);
DROP POLICY IF EXISTS freelancers_modify ON tbl_freelancers;
CREATE POLICY freelancers_modify ON tbl_freelancers FOR ALL USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- tbl_production_plan: Freelancers can see job name/number (needed for mobile); no costs
ALTER TABLE tbl_production_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jobs_select ON tbl_production_plan;
CREATE POLICY jobs_select ON tbl_production_plan FOR SELECT USING (true);
DROP POLICY IF EXISTS jobs_modify ON tbl_production_plan;
CREATE POLICY jobs_modify ON tbl_production_plan FOR ALL USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- tbl_scope_items: Freelancers can see (needed for WO context); PM can edit
ALTER TABLE tbl_scope_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scope_select ON tbl_scope_items;
CREATE POLICY scope_select ON tbl_scope_items FOR SELECT USING (true);
DROP POLICY IF EXISTS scope_modify ON tbl_scope_items;
CREATE POLICY scope_modify ON tbl_scope_items FOR ALL USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- tbl_master_lookups: Everyone reads; PM writes
ALTER TABLE tbl_master_lookups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lookups_select ON tbl_master_lookups;
CREATE POLICY lookups_select ON tbl_master_lookups FOR SELECT USING (true);
DROP POLICY IF EXISTS lookups_modify ON tbl_master_lookups;
CREATE POLICY lookups_modify ON tbl_master_lookups FOR ALL USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- tbl_materials: Everyone reads (needed for BOM/traveller); PM writes
ALTER TABLE tbl_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS materials_select ON tbl_materials;
CREATE POLICY materials_select ON tbl_materials FOR SELECT USING (true);
DROP POLICY IF EXISTS materials_modify ON tbl_materials;
CREATE POLICY materials_modify ON tbl_materials FOR ALL USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- tbl_notifications: Users see own (by source_freelancer_id) or PM sees all
ALTER TABLE tbl_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_select ON tbl_notifications;
CREATE POLICY notif_select ON tbl_notifications FOR SELECT USING (
  CASE
    WHEN get_my_role() = 'freelancer' THEN source_freelancer_id = get_my_freelancer_id()
    ELSE true
  END
);
DROP POLICY IF EXISTS notif_insert ON tbl_notifications;
CREATE POLICY notif_insert ON tbl_notifications FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS notif_update ON tbl_notifications;
CREATE POLICY notif_update ON tbl_notifications FOR UPDATE USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);
DROP POLICY IF EXISTS notif_delete ON tbl_notifications;
CREATE POLICY notif_delete ON tbl_notifications FOR DELETE USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- ============================================================
-- 2d. REMAINING TABLES: Ensure coverage
-- ============================================================

-- tbl_job_items: Everyone reads; PM writes
ALTER TABLE tbl_job_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ji_select ON tbl_job_items;
CREATE POLICY ji_select ON tbl_job_items FOR SELECT USING (true);
DROP POLICY IF EXISTS ji_modify ON tbl_job_items;
CREATE POLICY ji_modify ON tbl_job_items FOR ALL USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- tbl_jobitem_workorder: Everyone reads; PM writes
ALTER TABLE tbl_jobitem_workorder ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jiwo_select ON tbl_jobitem_workorder;
CREATE POLICY jiwo_select ON tbl_jobitem_workorder FOR SELECT USING (true);
DROP POLICY IF EXISTS jiwo_modify ON tbl_jobitem_workorder;
CREATE POLICY jiwo_modify ON tbl_jobitem_workorder FOR ALL USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- tbl_wo_activities: Everyone reads; PM writes
ALTER TABLE tbl_wo_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS woact_select ON tbl_wo_activities;
CREATE POLICY woact_select ON tbl_wo_activities FOR SELECT USING (true);
DROP POLICY IF EXISTS woact_modify ON tbl_wo_activities;
CREATE POLICY woact_modify ON tbl_wo_activities FOR ALL USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- tbl_wo_documents: Everyone reads; PM/foreman writes
ALTER TABLE tbl_wo_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wodoc_select ON tbl_wo_documents;
CREATE POLICY wodoc_select ON tbl_wo_documents FOR SELECT USING (true);
DROP POLICY IF EXISTS wodoc_modify ON tbl_wo_documents;
CREATE POLICY wodoc_modify ON tbl_wo_documents FOR ALL USING (
  get_my_role() IN ('production_manager', 'Production-Manager', 'foreman', 'Foreman')
);

-- tbl_job_attachments: Everyone reads; anyone can INSERT (completion photos)
ALTER TABLE tbl_job_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attach_select ON tbl_job_attachments;
CREATE POLICY attach_select ON tbl_job_attachments FOR SELECT USING (true);
DROP POLICY IF EXISTS attach_insert ON tbl_job_attachments;
CREATE POLICY attach_insert ON tbl_job_attachments FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS attach_modify ON tbl_job_attachments;
CREATE POLICY attach_modify ON tbl_job_attachments FOR UPDATE USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);
DROP POLICY IF EXISTS attach_delete ON tbl_job_attachments;
CREATE POLICY attach_delete ON tbl_job_attachments FOR DELETE USING (
  get_my_role() IN ('production_manager', 'Production-Manager')
);

-- tbl_material_prices: PM only
ALTER TABLE tbl_material_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matprice_pm ON tbl_material_prices;
CREATE POLICY matprice_pm ON tbl_material_prices
  FOR ALL USING (get_my_role() IN ('production_manager', 'Production-Manager'));

-- tbl_material_aliases: PM only
ALTER TABLE tbl_material_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matalias_pm ON tbl_material_aliases;
CREATE POLICY matalias_pm ON tbl_material_aliases
  FOR ALL USING (get_my_role() IN ('production_manager', 'Production-Manager'));

-- ============================================================
-- 3. H3 FIX: Remove plaintext PIN from tbl_freelancers
--    PINs are stored as hashed passwords in Supabase Auth.
--    The plaintext column is a security liability.
--    
--    NOTE: Run this AFTER confirming ICS calendar uses tokens
--    (not PINs) and the crew page sync works via Supabase Auth.
-- ============================================================

-- Step 1: Rename to flag it as deprecated (safer than immediate drop)
-- ALTER TABLE tbl_freelancers RENAME COLUMN pin TO pin_deprecated;

-- Step 2: After confirming nothing breaks, drop it entirely
-- ALTER TABLE tbl_freelancers DROP COLUMN pin_deprecated;

-- FOR NOW: Just restrict SELECT visibility of the pin column
-- Freelancers should never see other people's PINs
-- (The RLS policy above already restricts freelancers to their own row,
--  which is sufficient — they can see their own PIN but nobody else's)


-- ============================================================
-- 4. VERIFICATION: Check all tables have RLS enabled
-- ============================================================

-- Run this query to verify. Every table should show TRUE:
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename LIKE 'tbl_%'
-- ORDER BY tablename;

-- Run this to see all policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
