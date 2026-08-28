ALTER TABLE public.school_announcements
  ADD COLUMN display_mode text NOT NULL DEFAULT 'one_off',
  ADD COLUMN starts_at timestamptz,
  ADD COLUMN ends_at timestamptz,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN updated_by uuid;

ALTER TABLE public.school_announcements
  ADD CONSTRAINT school_announcements_display_mode_check
  CHECK (display_mode IN ('one_off', 'scheduled', 'perpetual'));

-- Existing rows were all immediate one-off sends.
UPDATE public.school_announcements SET display_mode = 'one_off' WHERE display_mode IS NULL;

CREATE INDEX IF NOT EXISTS school_announcements_active_idx
  ON public.school_announcements (org_id, is_active, display_mode);

CREATE TRIGGER update_school_announcements_updated_at
BEFORE UPDATE ON public.school_announcements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();