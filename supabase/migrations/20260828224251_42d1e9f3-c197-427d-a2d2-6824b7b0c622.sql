CREATE TABLE public.notification_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  in_app_frequency text NOT NULL DEFAULT 'immediate',
  email_frequency text NOT NULL DEFAULT 'daily',
  sms_frequency text NOT NULL DEFAULT 'off',
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_start time NOT NULL DEFAULT '21:00',
  quiet_end time NOT NULL DEFAULT '07:00',
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_settings_in_app_frequency_check CHECK (in_app_frequency IN ('immediate','daily','weekly','off')),
  CONSTRAINT notification_settings_email_frequency_check CHECK (email_frequency IN ('immediate','daily','weekly','off')),
  CONSTRAINT notification_settings_sms_frequency_check CHECK (sms_frequency IN ('immediate','daily','weekly','off'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own notification settings"
ON public.notification_settings FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();