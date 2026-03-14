
-- Add new notification types
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'fee_reminder';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'payment_confirmation';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'school_announcement';

-- Notification templates table
CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  type text NOT NULL, -- e.g. 'fee_reminder', 'payment_confirmation', 'school_announcement'
  channel text NOT NULL DEFAULT 'in_app', -- 'in_app', 'email', 'sms'
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, type, channel)
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage templates" ON public.notification_templates
  FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'proprietor'::app_role) OR has_role(auth.uid(), 'principal'::app_role)))
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'proprietor'::app_role) OR has_role(auth.uid(), 'principal'::app_role)));

CREATE POLICY "Users can view templates" ON public.notification_templates
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

-- School announcements table
CREATE TABLE public.school_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'all', -- 'all', 'parents', 'staff', 'class'
  target_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  channels text[] NOT NULL DEFAULT '{in_app}', -- array of 'in_app', 'email', 'sms'
  status text NOT NULL DEFAULT 'draft', -- 'draft', 'sent'
  sent_at timestamptz,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage announcements" ON public.school_announcements
  FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND NOT has_role(auth.uid(), 'parent'::app_role))
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND NOT has_role(auth.uid(), 'parent'::app_role));

CREATE POLICY "Users can view sent announcements" ON public.school_announcements
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND status = 'sent');

-- Message queue for outbound SMS/email (backbone for future integration)
CREATE TABLE public.outbound_message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  channel text NOT NULL, -- 'email' or 'sms'
  recipient text NOT NULL, -- email address or phone number
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- 'queued', 'sent', 'failed'
  related_notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.outbound_message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view message queue" ON public.outbound_message_queue
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'proprietor'::app_role) OR has_role(auth.uid(), 'principal'::app_role)));

CREATE POLICY "System can insert messages" ON public.outbound_message_queue
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()));
