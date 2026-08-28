-- Add 'student' to the role enum.
--
-- On its own, deliberately: PostgreSQL will not let a new enum value be *used*
-- in the same transaction that adds it, and Supabase runs each migration in a
-- transaction. Everything that references 'student' is in the next migration.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'student';
