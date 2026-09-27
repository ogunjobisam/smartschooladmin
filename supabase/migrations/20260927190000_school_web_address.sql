-- A web address for each school.
--
-- Groundwork only: nothing routes on these columns yet. What this fixes now is
-- the part that is expensive to fix later — the data.
--
--   Beta          smartschooladmin.app/<slug>
--   Second school <slug>.smartschooladmin.app
--   Paid extra    portal.<the school's own domain>
--
-- All three hang off the same two values, so moving a school from one stage to
-- the next is configuration, not a data migration.
--
-- The slug is admissions_slug. It already exists, is already unique, is already
-- filled for every school, and the admissions page and the events feed already
-- resolve a school by it. A second `slug` column would start life as a copy and
-- drift from it the first time someone edited one and not the other.
--
-- The URL identifies a school; it never authorises anything. School separation
-- stays where it is — row-level security on school_id and org_id.

-- ---------------------------------------------------------------------------
-- Reserved slugs
-- ---------------------------------------------------------------------------
-- Two kinds, and both matter:
--
--   * hostnames we will want for ourselves once schools get subdomains — a
--     school called "www" would own www.smartschooladmin.app;
--   * every top-level route in the app, because the beta address is a path, and
--     a school with slug "login" would sit on top of the login page.
--
-- src/lib/admissions.ts mirrors this list for inline validation, and
-- src/test/admissions.test.ts fails if the two drift or if a new top-level route
-- in src/App.tsx is missing from it. Add to the list here, in a new migration,
-- and to the mirror in the same change.
CREATE OR REPLACE FUNCTION public.reserved_school_slugs()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    -- hostnames
    'www', 'app', 'admin', 'api', 'mail', 'demo',
    'assets', 'auth', 'blog', 'cdn', 'docs', 'ftp', 'help', 'static',
    'status', 'support', 'smtp', 'staging', 'test',
    -- top-level routes in src/App.tsx
    'achievements', 'admissions', 'announcements', 'apply', 'approvals',
    'arrears', 'attendance', 'audit-log', 'billing', 'dashboard', 'events',
    'exams', 'fees', 'forgot-password', 'group-overview', 'guardians',
    'invoices', 'login', 'message-delivery', 'my-pay',
    'notification-settings', 'notification-templates', 'notifications',
    'onboarding', 'parent', 'payments', 'payroll', 'performance', 'pricing',
    'privacy', 'reports', 'reset-password', 'roles', 'school-profile',
    'settings', 'signup', 'staff', 'staff-portal', 'student', 'students',
    'terms', 'timetable', 'transport', 'users', 'wall'
  ]::text[]
$$;

-- ---------------------------------------------------------------------------
-- The school's own domain
-- ---------------------------------------------------------------------------
-- Nullable: almost every school will never have one. Stored bare and lowercase
-- — `portal.kingsqueensacademy.com.ng`, no scheme, no path — so a lookup by
-- request Host is a plain equality.
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS custom_domain text;

COMMENT ON COLUMN public.schools.admissions_slug IS
  'The school''s web address slug: smartschooladmin.app/<slug> now, <slug>.smartschooladmin.app later. Validated by schools_validate_web_address().';
COMMENT ON COLUMN public.schools.custom_domain IS
  'The school''s own hostname, e.g. portal.example.com.ng. A paid extra: only a super_admin (or the service role) may set it.';

-- Two schools cannot claim the same host. Case is normalised by the trigger
-- below, but the index is on lower() so the guarantee does not depend on it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_custom_domain
  ON public.schools (lower(custom_domain)) WHERE custom_domain IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------------
-- A trigger rather than a CHECK constraint, deliberately. A CHECK is evaluated
-- on every UPDATE of the row, so any live school whose saved slug predates these
-- rules — two characters long, say — would be unable to change its phone number
-- until someone fixed a field they were not touching. This validates a value
-- only when it changes.
CREATE OR REPLACE FUNCTION public.schools_validate_web_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.admissions_slug IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.admissions_slug IS DISTINCT FROM OLD.admissions_slug) THEN
    NEW.admissions_slug := lower(btrim(NEW.admissions_slug));
    IF NEW.admissions_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       OR length(NEW.admissions_slug) NOT BETWEEN 3 AND 60 THEN
      RAISE EXCEPTION 'A school link must be 3 to 60 lowercase letters, numbers and single hyphens'
        USING ERRCODE = 'check_violation', HINT = 'invalid_slug';
    END IF;
    IF NEW.admissions_slug = ANY (public.reserved_school_slugs()) THEN
      RAISE EXCEPTION '"%" is reserved and cannot be used as a school link', NEW.admissions_slug
        USING ERRCODE = 'check_violation', HINT = 'reserved_slug';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.custom_domain IS DISTINCT FROM OLD.custom_domain THEN
    -- A paid extra, and the one that points traffic at us: a school admin must
    -- not be able to grant it to themselves. auth.uid() is NULL for the service
    -- role and for migrations, which may.
    IF (TG_OP = 'UPDATE' OR NEW.custom_domain IS NOT NULL)
       AND auth.uid() IS NOT NULL
       AND NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
      RAISE EXCEPTION 'Only the platform can set or change a school''s own domain'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.custom_domain IS NOT NULL THEN
      NEW.custom_domain := rtrim(lower(btrim(NEW.custom_domain)), '.');
      -- A bare hostname with at least one dot: no scheme, port, path or spaces.
      IF NEW.custom_domain !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
         OR length(NEW.custom_domain) > 253 THEN
        RAISE EXCEPTION '"%" is not a valid domain', NEW.custom_domain
          USING ERRCODE = 'check_violation', HINT = 'invalid_domain';
      END IF;
      -- Our own hostnames are assigned by slug, never claimed as a custom domain.
      IF NEW.custom_domain = 'smartschooladmin.app'
         OR NEW.custom_domain LIKE '%.smartschooladmin.app' THEN
        RAISE EXCEPTION 'A school''s own domain cannot be a smartschooladmin.app address'
          USING ERRCODE = 'check_violation', HINT = 'invalid_domain';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schools_validate_web_address ON public.schools;
CREATE TRIGGER schools_validate_web_address
  BEFORE INSERT OR UPDATE OF admissions_slug, custom_domain ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.schools_validate_web_address();
