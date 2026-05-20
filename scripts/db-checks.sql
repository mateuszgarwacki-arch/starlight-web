-- =====================================================
-- DB conventions guard — runs from CI via psql with ON_ERROR_STOP=1.
-- Any RAISE = non-zero exit = failed build.
--
-- Established S46 (2026-05-20). See docs/05_conventions.md §20.
-- =====================================================

\echo Check 1: All views in public must be SECURITY INVOKER
DO $$
DECLARE v_violations TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_violations
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND NOT ('security_invoker=on' = ANY(COALESCE(c.reloptions, ARRAY[]::text[])));
  IF v_violations IS NOT NULL THEN
    RAISE EXCEPTION 'Views missing SECURITY INVOKER: %', v_violations;
  END IF;
END $$;

\echo Check 2: All tables in public must have RLS enabled
DO $$
DECLARE v_violations TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_violations
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relrowsecurity = false;
  IF v_violations IS NOT NULL THEN
    RAISE EXCEPTION 'Tables without RLS enabled: %', v_violations;
  END IF;
END $$;

\echo Check 3: SECURITY DEFINER functions in public must NOT be PUBLIC-callable
DO $$
DECLARE v_violations TEXT;
BEGIN
  SELECT string_agg(p.proname || pg_get_function_identity_arguments(p.oid), E'\n  ') INTO v_violations
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF v_violations IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER functions still callable by PUBLIC:%s%s', E'\n  ', v_violations;
  END IF;
END $$;

\echo Check 4: rpc_job_close_report regression test (cost math)
SELECT public.test_rpc_job_close_report();

\echo All DB conventions checks passed.
