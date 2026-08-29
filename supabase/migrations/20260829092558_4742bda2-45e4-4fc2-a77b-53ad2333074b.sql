-- Trigger-only function: nothing should be able to call it directly.
REVOKE ALL ON FUNCTION public.raise_error_alert() FROM PUBLIC, anon, authenticated;

-- A record of every abandoned demo sandbox the sweeper removed. Kept outside
-- audit_logs because deleting a demo organisation deletes its audit rows too.
CREATE TABLE public.demo_cleanup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  org_name text,
  expired_at timestamptz,
  reason text NOT NULL DEFAULT 'expired',
  removed jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_rows_removed integer NOT NULL DEFAULT 0,
  error text,
  swept_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.demo_cleanup_log TO authenticated;
GRANT ALL ON public.demo_cleanup_log TO service_role;

ALTER TABLE public.demo_cleanup_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read the demo cleanup log"
  ON public.demo_cleanup_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX demo_cleanup_log_swept_idx ON public.demo_cleanup_log (swept_at DESC);

-- Counts the demo rows about to be destroyed, so the log says what was lost.
CREATE OR REPLACE FUNCTION public.demo_org_row_counts(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _schools uuid[];
  _students uuid[];
  _staffs uuid[];
  _out jsonb;
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO _schools FROM schools WHERE org_id = _org_id;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO _students FROM students WHERE school_id = ANY(_schools);
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO _staffs FROM staff WHERE school_id = ANY(_schools);

  SELECT jsonb_build_object(
    'schools', cardinality(_schools),
    'students', cardinality(_students),
    'staff', cardinality(_staffs),
    'guardians', (SELECT count(*) FROM guardians WHERE org_id = _org_id),
    'invoices', (SELECT count(*) FROM invoices WHERE school_id = ANY(_schools)),
    'payments', (SELECT count(*) FROM payments WHERE school_id = ANY(_schools)),
    'exams', (SELECT count(*) FROM exams WHERE school_id = ANY(_schools)),
    'attendance_records', (SELECT count(*) FROM attendance_records WHERE school_id = ANY(_schools)),
    'payroll_runs', (SELECT count(*) FROM payroll_runs WHERE school_id = ANY(_schools)),
    'applications', (SELECT count(*) FROM applications WHERE school_id = ANY(_schools)),
    'recognitions', (SELECT count(*) FROM recognitions WHERE org_id = _org_id),
    'user_roles', (SELECT count(*) FROM user_roles WHERE org_id = _org_id)
  ) INTO _out;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.demo_org_row_counts(uuid) FROM PUBLIC, anon, authenticated;

-- Sweeps every demo sandbox whose four hours are up, logging what it removed.
-- Each organisation is handled on its own so one failure cannot strand the rest.
CREATE OR REPLACE FUNCTION public.sweep_expired_demo_orgs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _rec record;
  _counts jsonb;
  _total integer;
  _swept integer := 0;
BEGIN
  FOR _rec IN
    SELECT id, name, demo_expires_at
    FROM organisation_groups
    WHERE is_demo
      AND demo_expires_at IS NOT NULL
      AND demo_expires_at < now()
    ORDER BY demo_expires_at
  LOOP
    BEGIN
      _counts := public.demo_org_row_counts(_rec.id);
      SELECT COALESCE(sum((value)::text::integer), 0) INTO _total
      FROM jsonb_each(_counts);

      PERFORM public.delete_demo_org(_rec.id);

      INSERT INTO public.demo_cleanup_log (org_id, org_name, expired_at, reason, removed, total_rows_removed)
      VALUES (_rec.id, _rec.name, _rec.demo_expires_at, 'expired', _counts, _total);

      _swept := _swept + 1;
    EXCEPTION WHEN others THEN
      INSERT INTO public.demo_cleanup_log (org_id, org_name, expired_at, reason, removed, error)
      VALUES (_rec.id, _rec.name, _rec.demo_expires_at, 'expired', COALESCE(_counts, '{}'::jsonb), SQLERRM);
    END;
  END LOOP;

  RETURN _swept;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_expired_demo_orgs() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Runs every 15 minutes: an abandoned sandbox should not outlive its window by long.
SELECT cron.unschedule('sweep-expired-demo-orgs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-expired-demo-orgs');

SELECT cron.schedule(
  'sweep-expired-demo-orgs',
  '*/15 * * * *',
  $$SELECT public.sweep_expired_demo_orgs();$$
);