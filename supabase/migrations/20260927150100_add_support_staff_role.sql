-- Add the support_staff role to app_role.
--
-- The enum had only specific functions — bursar, finance_officer, hr_admin —
-- and nothing for the office: a front desk, an admin assistant, an IT or
-- facilities person who needs to find a pupil, see the timetable and read
-- notices, but has no business in fees, payroll or approvals.
--
-- Job titles already live in staff_positions, so this is purely about what
-- someone may reach in the app.
--
-- This migration does nothing else on purpose. Postgres will not let a
-- transaction add an enum value and then use it, and Supabase wraps each
-- migration file in one, so role_rank() is updated in the next file — the same
-- reason 'student' and 'school_admin' each arrived in a file of their own.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_staff';
