-- ============================================================
-- Starlight RLS Policy Consolidation — CREATE
-- Run AFTER the DROP script succeeds
-- ONE policy per (table, action) — eliminates all "multiple permissive" warnings
-- ============================================================

-- ============================================================
-- TIER 1: PM-ONLY (commercial tables)
-- Pattern: PM/admin can do everything, everyone else blocked
-- ============================================================

-- tbl_business_settings
CREATE POLICY rls_select ON tbl_business_settings FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_business_settings FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_business_settings FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_business_settings FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_rate_card
CREATE POLICY rls_select ON tbl_rate_card FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_rate_card FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_rate_card FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_rate_card FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_quotes
CREATE POLICY rls_select ON tbl_quotes FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_quotes FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_quotes FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_quotes FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_quote_lines
CREATE POLICY rls_select ON tbl_quote_lines FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_quote_lines FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_quote_lines FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_quote_lines FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_quote_line_contractors
CREATE POLICY rls_select ON tbl_quote_line_contractors FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_quote_line_contractors FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_quote_line_contractors FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_quote_line_contractors FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_invoices
CREATE POLICY rls_select ON tbl_invoices FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_invoices FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_invoices FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_invoices FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_invoice_lines
CREATE POLICY rls_select ON tbl_invoice_lines FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_invoice_lines FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_invoice_lines FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_invoice_lines FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_invoice_allocations
CREATE POLICY rls_select ON tbl_invoice_allocations FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_invoice_allocations FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_invoice_allocations FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_invoice_allocations FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_suppliers
CREATE POLICY rls_select ON tbl_suppliers FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_suppliers FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_suppliers FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_suppliers FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_material_prices
CREATE POLICY rls_select ON tbl_material_prices FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_material_prices FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_material_prices FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_material_prices FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_material_aliases
CREATE POLICY rls_select ON tbl_material_aliases FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_material_aliases FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_material_aliases FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_material_aliases FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));


-- ============================================================
-- TIER 2: ROLE-FILTERED (execution tables with row-level access)
-- ============================================================

-- tbl_work_orders: freelancers see Ready/In-Progress only
CREATE POLICY rls_select ON tbl_work_orders FOR SELECT TO authenticated
  USING (
    CASE get_my_role()
      WHEN 'freelancer' THEN status IN ('Ready','In-Progress')
      ELSE true
    END
  );
CREATE POLICY rls_insert ON tbl_work_orders FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin','foreman'));
CREATE POLICY rls_update ON tbl_work_orders FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin','foreman'));
CREATE POLICY rls_delete ON tbl_work_orders FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_wo_time_entries: freelancers see/write own rows only
CREATE POLICY rls_select ON tbl_wo_time_entries FOR SELECT TO authenticated
  USING (
    CASE get_my_role()
      WHEN 'freelancer' THEN freelancer_id = get_my_freelancer_id()
      ELSE true
    END
  );
CREATE POLICY rls_insert ON tbl_wo_time_entries FOR INSERT TO authenticated
  WITH CHECK (
    CASE get_my_role()
      WHEN 'freelancer' THEN freelancer_id = get_my_freelancer_id()
      ELSE true
    END
  );
CREATE POLICY rls_update ON tbl_wo_time_entries FOR UPDATE TO authenticated
  USING (
    CASE get_my_role()
      WHEN 'freelancer' THEN freelancer_id = get_my_freelancer_id()
      ELSE true
    END
  );
CREATE POLICY rls_delete ON tbl_wo_time_entries FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_freelancer_schedule: freelancers see own rows, can update own status
CREATE POLICY rls_select ON tbl_freelancer_schedule FOR SELECT TO authenticated
  USING (
    CASE get_my_role()
      WHEN 'freelancer' THEN freelancer_id = get_my_freelancer_id()
      ELSE true
    END
  );
CREATE POLICY rls_insert ON tbl_freelancer_schedule FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin','foreman'));
CREATE POLICY rls_update ON tbl_freelancer_schedule FOR UPDATE TO authenticated
  USING (
    CASE get_my_role()
      WHEN 'freelancer' THEN freelancer_id = get_my_freelancer_id()
      ELSE true
    END
  );
CREATE POLICY rls_delete ON tbl_freelancer_schedule FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_freelancers: freelancers see own row only
CREATE POLICY rls_select ON tbl_freelancers FOR SELECT TO authenticated
  USING (
    CASE get_my_role()
      WHEN 'freelancer' THEN freelancer_id = get_my_freelancer_id()
      ELSE true
    END
  );
CREATE POLICY rls_insert ON tbl_freelancers FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_freelancers FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_freelancers FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));

-- tbl_notifications: PM sees all, others see own-triggered
CREATE POLICY rls_select ON tbl_notifications FOR SELECT TO authenticated
  USING (
    CASE get_my_role()
      WHEN 'freelancer' THEN source_freelancer_id = get_my_freelancer_id()
      ELSE true
    END
  );
CREATE POLICY rls_insert ON tbl_notifications FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY rls_update ON tbl_notifications FOR UPDATE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_notifications FOR DELETE TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));


-- ============================================================
-- TIER 3: REFERENCE (all authenticated read, PM/admin write)
-- Pattern: one SELECT for all, one each INSERT/UPDATE/DELETE for PM
-- ============================================================

-- Helper: generate Tier 3 policies for a table
-- We'll do each explicitly for clarity

-- tbl_production_plan
CREATE POLICY rls_select ON tbl_production_plan FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_production_plan FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_production_plan FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_production_plan FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_scope_items
CREATE POLICY rls_select ON tbl_scope_items FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_scope_items FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_scope_items FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_scope_items FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_scope_item_categories
CREATE POLICY rls_select ON tbl_scope_item_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_scope_item_categories FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_scope_item_categories FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_scope_item_categories FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_master_lookups
CREATE POLICY rls_select ON tbl_master_lookups FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_master_lookups FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_master_lookups FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_master_lookups FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_materials
CREATE POLICY rls_select ON tbl_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_materials FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_materials FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_materials FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_job_items
CREATE POLICY rls_select ON tbl_job_items FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_job_items FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_job_items FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_job_items FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_jobitem_workorder
CREATE POLICY rls_select ON tbl_jobitem_workorder FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_jobitem_workorder FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_jobitem_workorder FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_jobitem_workorder FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_wo_activities
CREATE POLICY rls_select ON tbl_wo_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_wo_activities FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_wo_activities FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_wo_activities FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_wo_bom
CREATE POLICY rls_select ON tbl_wo_bom FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_wo_bom FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_wo_bom FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_wo_bom FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_wo_documents
CREATE POLICY rls_select ON tbl_wo_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_wo_documents FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_wo_documents FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_wo_documents FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_job_attachments (freelancers can INSERT completion photos)
CREATE POLICY rls_select ON tbl_job_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_job_attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rls_update ON tbl_job_attachments FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_job_attachments FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_category_prompts
CREATE POLICY rls_select ON tbl_category_prompts FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_category_prompts FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_category_prompts FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_category_prompts FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_stock_items
CREATE POLICY rls_select ON tbl_stock_items FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_stock_items FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_stock_items FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_stock_items FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));


-- ============================================================
-- OTHER TABLES
-- ============================================================

-- tbl_audit_log: anyone INSERT, PM SELECT, admin UPDATE (revert)
CREATE POLICY rls_select ON tbl_audit_log FOR SELECT TO authenticated
  USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_insert ON tbl_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY rls_update ON tbl_audit_log FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- tbl_pm_queries: PM full, all authenticated read
CREATE POLICY rls_select ON tbl_pm_queries FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_pm_queries FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_pm_queries FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_pm_queries FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_scope_options: PM full, all read
CREATE POLICY rls_select ON tbl_scope_options FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_scope_options FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_scope_options FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_scope_options FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_tasks: freelancers can CRUD own tasks
CREATE POLICY rls_select ON tbl_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rls_update ON tbl_tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY rls_delete ON tbl_tasks FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- tbl_workshop_requests: anyone can create, PM manages
CREATE POLICY rls_select ON tbl_workshop_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_workshop_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rls_update ON tbl_workshop_requests FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_workshop_requests FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- Maintenance tables: all authenticated read, PM write
CREATE POLICY rls_select ON tbl_maintenance_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_maintenance_assets FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_maintenance_assets FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_maintenance_assets FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

CREATE POLICY rls_select ON tbl_maintenance_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_maintenance_tasks FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_update ON tbl_maintenance_tasks FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_maintenance_tasks FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

CREATE POLICY rls_select ON tbl_maintenance_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_maintenance_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rls_update ON tbl_maintenance_logs FOR UPDATE TO authenticated USING (true);
CREATE POLICY rls_delete ON tbl_maintenance_logs FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

CREATE POLICY rls_select ON tbl_maintenance_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_maintenance_checks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rls_update ON tbl_maintenance_checks FOR UPDATE TO authenticated USING (true);
CREATE POLICY rls_delete ON tbl_maintenance_checks FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

CREATE POLICY rls_select ON tbl_maintenance_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_maintenance_flags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rls_update ON tbl_maintenance_flags FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_maintenance_flags FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

CREATE POLICY rls_select ON tbl_maintenance_asset_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_insert ON tbl_maintenance_asset_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rls_update ON tbl_maintenance_asset_photos FOR UPDATE TO authenticated USING (get_my_role() IN ('production_manager','admin'));
CREATE POLICY rls_delete ON tbl_maintenance_asset_photos FOR DELETE TO authenticated USING (get_my_role() IN ('production_manager','admin'));

-- ============================================================
-- DUPLICATE INDEX CLEANUP
-- Run the SELECT queries first, then uncomment the DROP that matches
-- ============================================================

-- Check tbl_freelancer_schedule indexes
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tbl_freelancer_schedule' ORDER BY indexname;
-- DROP INDEX IF EXISTS idx_fs_date;  -- keep idx_schedule_date (or vice versa)

-- Check tbl_quote_lines indexes
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tbl_quote_lines' ORDER BY indexname;

-- Check tbl_scope_items indexes
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tbl_scope_items' ORDER BY indexname;
