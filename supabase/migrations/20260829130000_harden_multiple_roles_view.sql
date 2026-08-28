-- Make the diagnostic view safe on every database, however it got here.
--
-- users_with_multiple_roles was created as a plain view. Postgres runs a plain
-- view with its owner's privileges, so it reads user_roles past row-level
-- security, and Supabase grants SELECT on new public views to authenticated by
-- default. Together that hands any signed-in user of any tenant the org
-- memberships of every account on the platform.
--
-- The migration that creates the view now sets security_invoker, so a fresh
-- project is never exposed. This exists for the databases in between: one
-- where the view was created before that change, or where a later
-- CREATE OR REPLACE VIEW dropped the option again — reloptions are replaced
-- wholesale by CREATE OR REPLACE, not merged, so an ordering accident is
-- enough to silently undo it.
--
-- Both statements are idempotent, so this is a no-op on a database that is
-- already correct.

ALTER VIEW public.users_with_multiple_roles SET (security_invoker = true);

-- Defence in depth. security_invoker means a normal user now sees only what
-- row-level security lets them see — their own row — but this view is an
-- operator's diagnostic for the SQL editor, and nothing in the application
-- reads it. Nobody browsing with an anon or authenticated key needs it at all.
REVOKE ALL ON public.users_with_multiple_roles FROM anon, authenticated;
