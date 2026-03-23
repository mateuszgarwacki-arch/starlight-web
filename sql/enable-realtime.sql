-- Enable Supabase Realtime on key tables
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- These commands are idempotent (safe to re-run)
ALTER PUBLICATION supabase_realtime ADD TABLE tbl_work_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE tbl_wo_time_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE tbl_freelancer_schedule;
ALTER PUBLICATION supabase_realtime ADD TABLE tbl_notifications;
