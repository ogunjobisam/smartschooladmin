-- Event RSVPs -------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.event_rsvp_status AS ENUM ('going', 'maybe', 'not_going');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.school_events(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organisation_groups(id),
  school_id uuid REFERENCES public.schools(id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.event_rsvp_status NOT NULL,
  guests integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_rsvps TO authenticated;
GRANT ALL ON public.event_rsvps TO service_role;

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own RSVP" ON public.event_rsvps;
CREATE POLICY "Users manage their own RSVP"
  ON public.event_rsvps FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND org_id = public.get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Managers view RSVPs in their org" ON public.event_rsvps;
CREATE POLICY "Managers view RSVPs in their org"
  ON public.event_rsvps FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.is_school_manager(auth.uid()) OR public.has_role(auth.uid(), 'principal'::app_role))
  );

DROP TRIGGER IF EXISTS update_event_rsvps_updated_at ON public.event_rsvps;
CREATE TRIGGER update_event_rsvps_updated_at
  BEFORE UPDATE ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS event_rsvps_event_idx ON public.event_rsvps(event_id);

-- Event notification type --------------------------------------------------
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'school_event';

-- Reminder preferences -----------------------------------------------------
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS event_reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS event_reminder_lead_minutes integer NOT NULL DEFAULT 1440;

-- Delivery tracking --------------------------------------------------------
ALTER TABLE public.outbound_message_queue
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS retried_by uuid REFERENCES auth.users(id);

DROP POLICY IF EXISTS "Managers retry outbound messages" ON public.outbound_message_queue;
CREATE POLICY "Managers retry outbound messages"
  ON public.outbound_message_queue FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.is_school_manager(auth.uid()) OR public.has_role(auth.uid(), 'principal'::app_role))
  )
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));
