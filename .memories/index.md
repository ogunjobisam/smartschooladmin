# Project Memory

## Core
- Multi-tenant African school platform (Org Group > School > Campus) with per-school branding.
- Supabase strict org-scoped RLS for data isolation. Email auto-confirm disabled.
- 10-level rank-based RBAC (0: super_admin to 9: parent). Only modify strictly lower ranks.
- 'Current' academic period (term) exclusively drives system-wide enrolments, fees, and exams.
- Payments use provider abstraction (Paystack/Flutterwave) with Mock Mode.
- Destructive actions (e.g., Delete Data) require manual typing of the exact school name.

## Memories
- [Portal upgrades](mem://features/portal-upgrades) — Student results/attendance pages, teacher guardian contacts & class analytics, parent documents/teachers; shared printStudentTranscript helper
