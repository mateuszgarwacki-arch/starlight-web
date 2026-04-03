-- ============================================================
-- Starlight RLS Policy Consolidation
-- Reduces ~150 overlapping policies to ~1 per table/action
-- Run in Supabase SQL Editor as TWO separate scripts (split at the marked line)
-- ============================================================

-- SCRIPT 1: DROP ALL EXISTING POLICIES
-- ============================================================

-- Tier 1: PM-only tables
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN (
    'tbl_business_settings','tbl_rate_card','tbl_quotes','tbl_quote_lines',
    'tbl_quote_line_contractors','tbl_invoices','tbl_invoice_lines',
    'tbl_invoice_allocations','tbl_suppliers','tbl_material_prices','tbl_material_aliases'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Tier 2: Role-filtered tables
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN (
    'tbl_work_orders','tbl_wo_time_entries','tbl_freelancer_schedule',
    'tbl_freelancers','tbl_notifications'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Tier 3: Reference tables (all read, PM write)
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN (
    'tbl_production_plan','tbl_scope_items','tbl_scope_item_categories',
    'tbl_master_lookups','tbl_materials','tbl_job_items','tbl_jobitem_workorder',
    'tbl_wo_activities','tbl_wo_bom','tbl_wo_documents','tbl_job_attachments',
    'tbl_category_prompts','tbl_stock_items'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Other tables
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN (
    'tbl_audit_log','tbl_pm_queries','tbl_scope_options','tbl_tasks',
    'tbl_workshop_requests',
    'tbl_maintenance_assets','tbl_maintenance_tasks','tbl_maintenance_logs',
    'tbl_maintenance_checks','tbl_maintenance_flags','tbl_maintenance_asset_photos'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;
