# Persona-by-persona test sweep with gating checks

Goal: walk the real app in the preview as each role, follow the main journeys end to end, and confirm gating holds at both the router and the data layer. Output is a bug report, not fixes.

## Roles covered
proprietor / group_admin, school_admin, principal, bursar, finance_officer, hr_admin, teacher, parent, student, plus a signed-out stranger.

## What gets walked per persona
- Sign in, land on the right home surface (staff dashboard, /parent, /student), sidebar shows only permitted links.
- Core journey for that role:
  - Admin/principal: admissions funnel (New to Enrolled), student create/enrol, class subjects, academic period, users and role changes.
  - Bursar/finance officer: fee schedules, invoice generation, record payment, receipt, arrears reminder.
  - HR admin: staff record, salary change, payroll run, payslip.
  - Teacher: attendance marking, exam creation, score entry, report card.
  - Parent: children, invoices, pay flow, notices, events, bus card.
  - Student: own results, attendance, invoices, transport.
- Dead-end hunt: buttons that do nothing, spinners that never resolve, empty states where data exists, broken row clicks and links.

## Gating checks (two layers)
1. Router: type restricted URLs directly (/payroll, /settings, /users, /audit-log, /admissions, /transport, /reports) as each lower-privileged role; expect the refusal screen, not a blank or broken page.
2. Data layer: run the same reads the page would make with that role's token; expect empty or denied rather than rows. Includes cross-org reads, parent reading another family's student, student reading another student's scores, and role-escalation attempts (bursar granting super_admin).

## Method
- Mint a preview session per role with the platform auth-session tool; drive the app with Playwright at desktop and 375px, capturing screenshots and verbatim console/network errors.
- Use existing Test School demo data where possible. If a persona has no user, create the minimum needed rows, tag them, record before/after row counts, and delete exactly what was created at the end with counts proven back to prior values.

## Constraints
- No application code, migration, or config changes in this pass. Findings and proposed fixes in words only.
- No service role key anywhere in .env, VITE_ vars, or src/.
- No pre-existing row modified or deleted.

## Report order
1. Dead ends and broken journeys
2. Gating or tenant/family boundary leaks
3. Per-role journey pass/fail table
4. Design and copy notes (desktop + mobile)
5. Demo data created and confirmation of its removal
