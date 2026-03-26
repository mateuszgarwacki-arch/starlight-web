-- ============================================================================
-- SESSION 12: Cleanup + Performance
-- Run in Supabase SQL Editor
-- ============================================================================

-- PART 1: pg_cron (run after enabling pg_cron extension)
-- SELECT cron.schedule('audit-retention-monthly', '0 3 1 * *', $$SELECT audit_retention_cycle()$$);

-- PART 2-5: Drops already executed in Supabase SQL editor
-- 18 vw_ views, 2 tables, 1 qry_ view, 7 functions

-- PART 6: Performance indexes — already created

-- PART 7: rpc_dashboard_data() — already created
