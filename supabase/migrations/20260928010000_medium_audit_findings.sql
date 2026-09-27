-- Close the medium findings from the September security audit.
--
-- Safe to run twice: policies are dropped before they are created, functions
-- use CREATE OR REPLACE, and the table and index use IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- 1. Notifications go to people in the sender's organisation
-- ---------------------------------------------------------------------------
-- The insert policy checked only the sender's organisation, never the
-- recipient's, so anyone signed in could put a "Pay here" notification in any
-- user's bell, in any school. A family could also notify another family.
-- Recipients must now hold a role in the row's organisation, and a parent or
-- pupil may notify only staff (or themselves). SECURITY DEFINER because
-- families cannot read other people's user_roles rows.
CREATE OR REPLACE FUNCTION public.can_notify(_recipient uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _recipient = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _recipient
        AND ur.org_id = _org_id
        AND (public.is_org_staff(auth.uid())
             OR ur.role NOT IN ('parent'::app_role, 'student'::app_role))
    )
$$;
REVOKE ALL ON FUNCTION public.can_notify(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_notify(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Org members can insert notifications" ON public.notifications;
CREATE POLICY "Org members can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid())
    AND public.can_notify(user_id, org_id));

-- ---------------------------------------------------------------------------
-- 2. Families see only their own documents
-- ---------------------------------------------------------------------------
-- document_files was readable by every member of the organisation, so a
-- parent or pupil could list every staff contract, payroll attachment and
-- invoice file, with its storage path. Staff keep the whole organisation's;
-- a family sees what is attached to their own child's (or their own) record.
-- is_org_staff() rather than is_self_service_role(), so a teacher who is also
-- a parent keeps the staff view.
DROP POLICY IF EXISTS "Org members can view documents" ON public.document_files;
CREATE POLICY "Org members can view documents" ON public.document_files
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid())
    AND (public.is_org_staff(auth.uid())
      OR (entity_type = 'student'
          AND (entity_id = public.my_student_id() OR public.is_my_child(entity_id)))));

-- ---------------------------------------------------------------------------
-- 3. Rate limiting for the public endpoints
-- ---------------------------------------------------------------------------
-- start-demo and admissions answer anyone, with no account: start-demo creates
-- an organisation, a user and a school's worth of seed data per call, and
-- admissions sends an email to an address the caller chooses. Neither had any
-- limit. Hits are counted per key in fixed windows. The table is sealed: only
-- the edge functions, through the service role, touch it.
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_window_start_idx ON public.rate_limit_hits (window_start);
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_hits FROM anon, authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;

-- True while this key is within its limit for the current window, counting
-- this hit. One statement, so parallel requests cannot both slip under it.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(_key text, _limit integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  bucket timestamptz := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);
  n integer;
BEGIN
  INSERT INTO public.rate_limit_hits (key, window_start, hits)
  VALUES (_key, bucket, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = public.rate_limit_hits.hits + 1
  RETURNING hits INTO n;
  -- Keep the table small without a scheduled job.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_hits WHERE window_start < now() - interval '2 days';
  END IF;
  RETURN n <= _limit;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The AI allowance cannot be overshot by asking in parallel
-- ---------------------------------------------------------------------------
-- ai-insights counted this month's successful analyses, called the model, and
-- only then recorded the use. Parallel requests all passed the count, so an
-- organisation on the free five could run as many as it could send at once.
-- A slot is now reserved before the model is called: one row per analysis,
-- "pending" until the function marks it succeeded or failed, counted under a
-- per-organisation lock. A pending row older than fifteen minutes belonged to
-- a request that died, and stops counting.
CREATE OR REPLACE FUNCTION public.reserve_ai_analysis(
  _org_id uuid, _limit integer, _school_id uuid, _user_id uuid, _analysis_type text, _model text
)
RETURNS TABLE (event_id uuid, used integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
  new_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ai_usage:' || _org_id::text));
  SELECT count(*) INTO n
  FROM public.ai_usage_events
  WHERE org_id = _org_id
    AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    AND (status = 'succeeded'
         OR (status = 'pending' AND created_at > now() - interval '15 minutes'));
  IF n >= _limit THEN
    RETURN QUERY SELECT NULL::uuid, n;
    RETURN;
  END IF;
  INSERT INTO public.ai_usage_events (org_id, school_id, user_id, analysis_type, model, status)
  VALUES (_org_id, _school_id, _user_id, _analysis_type, _model, 'pending')
  RETURNING id INTO new_id;
  RETURN QUERY SELECT new_id, n;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_analysis(uuid, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_analysis(uuid, integer, uuid, uuid, text, text) TO service_role;
