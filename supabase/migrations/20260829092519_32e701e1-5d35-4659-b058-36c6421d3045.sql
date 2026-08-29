-- Production error reporting: captured runtime crashes and failed requests,
-- grouped by fingerprint so the same fault does not read as hundreds of faults.
CREATE TABLE public.client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  school_id uuid,
  user_id uuid,
  user_role text,
  route text NOT NULL DEFAULT 'unknown',
  kind text NOT NULL DEFAULT 'crash',
  status_code integer,
  message text NOT NULL,
  error_name text,
  stack text,
  release text,
  fingerprint text NOT NULL,
  url text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.client_errors TO anon, authenticated;
GRANT SELECT ON public.client_errors TO authenticated;
GRANT ALL ON public.client_errors TO service_role;

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

-- A crash can happen before sign-in and before the tenant is known, so the
-- report path is deliberately open. Reading is not.
CREATE POLICY "Anyone may report a runtime error"
  ON public.client_errors FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Managers read errors from their own organisation"
  ON public.client_errors FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      org_id IS NOT NULL
      AND org_id = public.get_user_org_id(auth.uid())
      AND public.is_school_manager(auth.uid())
    )
  );

CREATE INDEX client_errors_org_time_idx ON public.client_errors (org_id, occurred_at DESC);
CREATE INDEX client_errors_fingerprint_idx ON public.client_errors (fingerprint, occurred_at DESC);
CREATE INDEX client_errors_route_idx ON public.client_errors (route, occurred_at DESC);

-- Alerting: one open row per distinct fault per tenant, with a running count.
CREATE TABLE public.error_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  fingerprint text NOT NULL,
  route text NOT NULL,
  kind text NOT NULL,
  status_code integer,
  message text NOT NULL,
  release text,
  error_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid
);

CREATE UNIQUE INDEX error_alerts_group_idx
  ON public.error_alerts (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), fingerprint, route);

GRANT SELECT, UPDATE ON public.error_alerts TO authenticated;
GRANT ALL ON public.error_alerts TO service_role;

ALTER TABLE public.error_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read alerts from their own organisation"
  ON public.error_alerts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      org_id IS NOT NULL
      AND org_id = public.get_user_org_id(auth.uid())
      AND public.is_school_manager(auth.uid())
    )
  );

CREATE POLICY "Managers acknowledge alerts from their own organisation"
  ON public.error_alerts FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      org_id IS NOT NULL
      AND org_id = public.get_user_org_id(auth.uid())
      AND public.is_school_manager(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      org_id IS NOT NULL
      AND org_id = public.get_user_org_id(auth.uid())
      AND public.is_school_manager(auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.raise_error_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.error_alerts (org_id, fingerprint, route, kind, status_code, message, release)
  VALUES (NEW.org_id, NEW.fingerprint, NEW.route, NEW.kind, NEW.status_code, NEW.message, NEW.release)
  ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), fingerprint, route)
  DO UPDATE SET
    error_count = public.error_alerts.error_count + 1,
    last_seen_at = now(),
    message = EXCLUDED.message,
    release = EXCLUDED.release,
    -- A fault that comes back after being acknowledged is news again.
    acknowledged_at = CASE
      WHEN public.error_alerts.acknowledged_at < now() - interval '1 hour' THEN NULL
      ELSE public.error_alerts.acknowledged_at
    END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER client_errors_raise_alert
  AFTER INSERT ON public.client_errors
  FOR EACH ROW EXECUTE FUNCTION public.raise_error_alert();