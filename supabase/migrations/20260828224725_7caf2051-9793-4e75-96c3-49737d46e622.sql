ALTER TABLE public.school_announcements
  ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS school_announcements_pinned_idx
  ON public.school_announcements (org_id, is_pinned) WHERE is_pinned;