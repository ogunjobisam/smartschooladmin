# Smart School Admin — Capability Overview

> **What this is.** A description of what the product actually does today, module by
> module, with the code behind each one. Written to be read alongside the source: if
> a capability is described here, the file that implements it is named.
>
> This file previously held the original *SchoolFlow* build brief — a statement of
> intended end state written before the product existed. That brief is preserved in
> git history (`git log --follow docs/PRODUCT_SPEC.md`); it was superseded because
> it named a product that no longer goes by that name and described features as
> requirements that have since been built, dropped or reshaped.
>
> **Every claim below was checked against the code.** Where the marketing
> description of a capability is broader than what ships, the narrower true version
> is what appears here. Those places are marked **Narrower than it sounds**.

---

## 1. What it is

A multi-tenant school finance and operations platform for private schools and school
groups. It covers the operating loop of a school — admissions, enrolment,
attendance, examinations, fee billing, collections, arrears, payroll,
communications and governance — behind one role-aware workspace.

The tenancy model follows how school businesses are structured: an **organisation
group** owns one or more **schools**, each with one or more **campuses**. Every
business table carries an organisation scope and is enforced by PostgreSQL
row-level security.

**Stack.** React 18 + TypeScript + Vite + Tailwind + shadcn/ui on the front end;
Supabase (PostgreSQL with RLS, Auth, Storage, Deno edge functions) behind it.
69 migrations, 10 edge functions.

**Africa-first, not Africa-only.** Nigeria is the developed case — NGN, three-term
calendar, JSS/SS class naming, PAYE and pension fields on payroll profiles. The
currency and class presets are data rather than branching logic, so another country
is a data change.

> **Narrower than it sounds — "country packs".** There is a country selector in
> onboarding (`src/pages/Onboarding.tsx`) that prefills currency and class presets.
> There is no pack abstraction holding payroll rules, terminology or document
> templates per country, and no UK or Generic International pack exists. Supporting
> a second country properly is real work, not configuration.

---

## 2. Roles and access control

Eleven roles, ranked. Rank is defined once, in SQL, by `role_rank()`
(`supabase/migrations/20260828221259_*.sql`) — rank 0 is most senior:

| Rank | Role | Authority |
| --- | --- | --- |
| 0 | `super_admin` | Platform-wide |
| 1 | `proprietor` | Cross-school dashboards, approvals, fees and payroll summaries |
| 2 | `group_admin` | Several schools within one organisation group |
| 3 | `school_admin` | Users and configuration for their school |
| 4 | `principal` | School operations, academics, approvals |
| 5 | `bursar` | Fees, invoices, payments, arrears, payroll preparation |
| 6 | `finance_officer` | Records payments, cashier-style collections |
| 7 | `hr_admin` | Staff records, documents, payroll profiles |
| 8 | `teacher` | Their own classes only — attendance, scores, students |
| 9 | `parent` | Their own linked children |
| 10 | `student` | Their own record |

**One user, several roles.** `get_my_roles()` returns every role held; the most
senior drives navigation and gating. `AuthContext` (`src/contexts/AuthContext.tsx`)
reads it.

**Incompatible combinations are refused by the database.** `roles_compatible()` and
the `enforce_role_compatibility` trigger stop a student account also holding a
staff role; student may combine only with parent.

**Workspace picker.** An account holding roles in more than one organisation or
school chooses which to enter (`src/components/auth/WorkspacePicker.tsx`); all
scoping follows that choice, and it is remembered per account.

**One definition of "which organisation am I in".** `primary_user_role()` is the
single source; `get_my_role()`, `get_user_org_id()` and `get_user_school_id()` all
delegate to it. This matters more than it looks: they were once three separate
answers, two of them a `LIMIT 1` with no `ORDER BY`, and for an account with two
role rows the app and the security policies could resolve to *different*
organisations — every read empty, every write silently matching nothing.
`supabase/tests/rls.sql` asserts they cannot drift apart again.

**Route access.** `src/lib/access.ts` holds one role→route map, read by both the
sidebar and the router, so the sidebar can never offer a link the router refuses.
Unknown routes fall through to `NotFound`.

---

## 3. Core platform

### Onboarding
`src/pages/Onboarding.tsx` → `supabase/functions/setup-organisation`. A wizard
creating the organisation, first school, campus, age-banded sections, classes and
academic year with terms. Country choice prefills currency and class presets.
Optionally seeds demo data.

Re-running it is refused: an account that already holds any role row cannot create
a second organisation, because the interface has a school switcher and no
organisation switcher, so the second one would be unreachable.

### Per-school branding
Logo, colours and contact details per school, flowing through to receipts, report
cards, statements, certificates, letters and ID cards.

> **Narrower than it sounds — campuses.** A campus is created during onboarding and
> the `campuses` table is real, but there is no interface for adding or managing
> campuses afterwards, and roles are not assigned at campus level.

### Demo sandboxes
`supabase/functions/start-demo`, `src/lib/demo.ts`, `src/components/demo/`. A
visitor picks a persona from the landing page and gets a seeded Nigerian demo
school that deletes itself after four hours. Demo organisations carry `is_demo` and
`demo_expires_at`; expiry physically deletes rather than hiding, and sweeps run
opportunistically on landing-page visits and new demo starts.

### Command palette and PWA
Ctrl+K fuzzy navigation (`src/components/layout/CommandPalette.tsx`). Installable
to a phone or desktop home screen (`src/lib/pwa.ts`).

---

## 4. Modules

### 4.1 Students and guardians
`src/pages/Students.tsx`, `StudentDetail.tsx`, `src/components/students/`

Full lifecycle: admission to enrolment, class assignment, guardian linking,
documents, photos, status history, promotion between classes. CSV import with fuzzy
column mapping and row-level error reporting — **the class to enrol into is
required**, because students imported without one belong nowhere and are invisible
to attendance, exams and class-based invoicing.

Automatic student IDs in a configurable format (`src/lib/id-numbers.ts`,
`src/components/settings/IdFormatCard.tsx`) with a live sample preview and a
backfill that only fills blanks. Every ID assignment is audit-logged.

Photos are cropped (`src/lib/photos.ts`) and appear on profiles, portals and
printable ID cards (`src/lib/id-card.ts`). Documents live in a private bucket
served through short-lived signed URLs.

> **Narrower than it sounds — pickup authorisation.** `student_guardians` carries
> `relationship` and `is_primary`. There is no pickup-authorisation flag.

### 4.2 Staff and HR
`src/pages/Staff.tsx`, `StaffDetail.tsx`

Positions, departments, employment status, bank details, documents and payroll
profiles. Staff IDs and photos use the same format and cropping engines as
students. Salary changes route through approval rather than direct edit.

### 4.3 Attendance
`src/pages/Attendance.tsx`

Four statuses (present, absent, late, excused), each one tap. Everyone starts
present. A register where nobody was changed can still be saved. Returning to
correct a day updates rather than duplicates. Excused absences are excluded from
the attendance rate rather than counted against the child.

Enrolment is per class **per term**, so a class full of students last term reads as
empty this term until they are promoted — the page distinguishes "no students in
this class" from "no students in this class this term" and offers to switch.

> **Narrower than it sounds — uniqueness.** The constraint is
> `UNIQUE(student_id, date)` — one record per *student* per day, not per class per
> day. A student cannot hold two attendance rows on one date even across classes.

### 4.4 Exams, grades and report cards
`src/pages/Exams.tsx`, `ExamDetail.tsx`, `src/components/exams/ExamRubricEditor.tsx`

Subjects assigned to classes; exams belong to academic periods. A per-exam rubric
editor sets per-subject maximum scores and grade bands, so the grading scale is
configurable per exam rather than hardcoded. Bulk score entry is restricted to the
subjects assigned to that class. Rankings, class averages and per-student analytics
(`src/lib/performance.ts`). Printable report cards and transcripts.

The exam list filters, sorts, searches and paginates **server-side**, with CSV
export.

> **Narrower than it sounds — saved presets.** Filter presets are keyed per school
> and per role but stored in `localStorage`, so they are per browser and do not
> follow a user to another device.

### 4.5 Fees, invoicing and arrears
`src/pages/Fees.tsx`, `Invoices.tsx`, `RecordPayment.tsx`, `Arrears.tsx`

Fee schedules per class per term; bulk invoice generation with school-scoped
sequential numbers; payments recorded against invoices with automatic receipts;
arrears with ageing buckets and reminder dispatch.

**Transport reaches the invoice.** Generating invoices offers to add each rider's
fare as its own line, honouring a negotiated per-student fare and treating a zero
fare as a free ride (`supabase/functions/generate-invoices`).

Printable **statements of account** per student with date-range and status filters
(`src/lib/statements.ts`), and printable **fee-reminder, overdue and final-notice
letters** with a tear-off acknowledgement slip (`src/lib/letters.ts`) for guardians
without email.

> **Narrower than it sounds — overpayments.** Partial payments work and leave a
> reduced balance. Overpayment is not modelled as a credit sitting against the
> student.

### 4.6 Payroll
`src/pages/Payroll.tsx`, `PayrollRunDetail.tsx`, `src/lib/payroll.ts`

Runs assemble from staff payroll profiles, preview per-staff gross, deductions and
net — naming anyone excluded for having no salary — then route through approval.
Payslips generate from approved runs. Bank batch CSV export for disbursement.

Pension is charged on basic salary, tax on gross.

### 4.7 Admissions
`src/pages/Admissions.tsx`, `Apply.tsx`, `supabase/functions/admissions`

A public branded application page per school feeds a pipeline; accepted applicants
convert to student and enrolment in one step, carrying their details across.

References are numbered **per school, per year** — two schools legitimately both
hold `APP-2026-00001`. This was deliberate: one global sequence let a school read
another tenant's application volume off the gaps in its own numbering.

While *Accepting applications* is off, the public page turns families away rather
than holding their details — an application made in that window was never recorded.

### 4.8 Events and calendar
`src/pages/Events.tsx`, `src/components/events/`, `supabase/functions/events-ics`

Events carry an audience, and the audience decides who sees them — a parents-only
evening does not appear on a teacher's calendar. RSVP (going / maybe / not going)
from portal event cards. Per-event `.ics` download and Google Calendar links, plus
a subscribable school feed (`src/lib/ics.ts`).

### 4.9 Transport
`src/pages/Transport.tsx`, `src/components/transport/`

Routes with ordered stops and pickup times, riders assigned per route, per-term
fares with per-student overrides. The fare is charged at invoicing (see 4.5), so
riders must be on their routes before invoices are generated for the term.

### 4.10 Achievement wall
`src/pages/Achievements.tsx`, `AchievementWall.tsx`, `src/components/achievements/`,
`src/lib/certificates.ts`

Awards, subject prizes, attendance and conduct recognition, teacher-of-the-term,
long-service, and prefect appointments — through a draft → submitted → published
workflow with cropped photos. Only published recognitions appear on portals and
profiles. Printable certificates and award letters. `/wall` is a read-only view
suited to a reception screen.

### 4.11 Notifications and communications
`src/pages/Announcements.tsx`, `NotificationTemplates.tsx`,
`NotificationSettings.tsx`, `MessageDelivery.tsx`,
`supabase/functions/process-message-queue`

Three channels (in-app, email, SMS) driven by editable templates. Announcements
support perpetual or time-boxed display and a pinned site-wide banner. A delivery
console shows queued / sent / failed per recipient with retry. Each user controls
their channel mix, frequency and quiet hours, with a live preview of what they will
actually receive.

**Sending model.** One verified domain belonging to the platform operator sends for
every school, with reply-to set to the school's own address — so a parent sees the
school's name and a reply reaches the school, and adding the hundredth school needs
no DNS work. Display names are RFC 5322 quoted and CR/LF stripped
(`supabase/functions/_shared/sender.ts`).

A sender problem is distinguished from a message problem
(`supabase/functions/_shared/email-result.ts`): the first holds the queue and
reports itself, the second fails that one message. Without this, configuring a
sender before verifying its domain would have marked the entire accumulated backlog
permanently failed on first drain.

**SMS queues but does not deliver.** It is reported as undelivered rather than
dropped. No provider is wired in.

### 4.12 Approvals and audit
`src/pages/Approvals.tsx`, `AuditLog.tsx`, `src/lib/audit.ts`

Fee waivers, salary changes and payroll runs route through an approval inbox with
reasons and decision trails. The audit log records actor, entity, old and new
values and timestamp across roles, templates, announcements, ID generation,
preferences and financial entities. Approval queues are role-gated to what the
viewer can act on.

### 4.13 Parent and student portals
`src/pages/ParentDashboard.tsx`, `StudentPortal.tsx`

Parents see each child's invoices, receipts, balances, results, attendance,
achievements and events, and can download statements. Students see their own fees,
results, attendance, recognitions and bus route.

Student logins are opt-in per school: a student gets one when someone presses
**Invite to portal** on their record. Inviting from Users instead creates a login
with no student behind it.

### 4.14 AI insights (paid add-on)
`supabase/functions/ai-insights`, `src/lib/ai-insights.ts`

Written analysis over live school data: class results, draft report-card comments,
where fee collection is stuck, payroll cost against student and staff numbers.

Every organisation gets **five free analyses a month**; the add-on lifts the cap.
The entitlement is enforced server-side — the function re-checks the caller's role,
that the school is theirs, that the add-on is active and that the allowance holds,
so calling it directly gains nothing. Every call is metered with token counts. Only
aggregated figures leave the browser, never raw student records.

### 4.15 Reporting and dashboards
`src/pages/Reports.tsx`, `ProprietorDashboard.tsx`, `Performance.tsx`

Role-tailored dashboards plus a proprietor group overview comparing schools on
collection rate, revenue, debtors and invoice status. Every list exports to CSV
(`src/lib/csv-export.ts`). The onboarding checklist is persona-aware
(`src/components/dashboard/OnboardingChecklist.tsx`).

### 4.16 Settings
`src/pages/SettingsPage.tsx`, `src/components/settings/`

School profile and branding, academic periods with a single current period driving
the whole system, classes and age-banded sections, subject assignment, ID format
configuration, admissions settings and the public notices board.

Editing the school profile is open to proprietors, group admins, school admins and
principals; creating and deleting schools stays with the proprietor; branding is
proprietor and group admin only.

---

## 5. Security and data isolation

Isolation is enforced in the database, not the interface.

- **Org-scoped RLS everywhere.** Schools within a group are isolated unless a role
  grants cross-school visibility. `my_student_id()` and `is_my_child()` make
  parent and student scoping explicit and testable.
- **Teachers are scoped to their assigned classes** for students, registers,
  enrolments and scores — on write as well as read. Correct-by-default, not
  permissive-by-default: a teacher with nothing assigned sees nothing, and every
  affected screen says so rather than showing a blank page.
- **Security-definer functions are minimal**, with public execution revoked; the
  sign-in role lookup bypasses RLS through one vetted RPC.
- **Every view must run `security_invoker`.** A plain view executes with its
  owner's privileges and reads past every policy on its base tables, and Supabase
  grants new public views to signed-in users by default. `scripts/check-migrations.sh`
  fails the build on any view in `public` without it.
- **Private storage** for student and staff documents and photos, served through
  60-second signed URLs. Only branding logos are public.
- **Rank-enforced administration.** Role grants validate hierarchy server-side; an
  administrator can only assign roles below their own rank.
- **Writes report failure.** A write that RLS filters out is not an error to
  PostgREST — it is an update matching no rows, returning `{data: [], error: null}`.
  `src/lib/writes.ts` insists a row actually changed, so a save cannot show a green
  confirmation while storing nothing.
- **Destructive actions require typing the exact school name.**
- **No anonymous sign-ups; email auto-confirmation disabled.**

**Continuous verification.** `scripts/check-migrations.sh` replays all 69
migrations from an empty database on every push and then re-asserts the invariants
by querying as a real teacher and a real student (`supabase/tests/rls.sql`). This
exists because the migration set had silently stopped being replayable.

---

## 6. Integration readiness

External touchpoints sit behind abstractions that run in mock mode today.

| Area | State |
| --- | --- |
| **Payments** | Provider abstraction over Paystack and Flutterwave with mock mode (`src/lib/payment-providers.ts`). Invoice payment flows and transaction records are modelled. **No live gateway call is made** — recording a payment the gateway has not confirmed would let a parent mark their own fees paid, so this stays in mock mode until a server-side verification flow exists. |
| **Email** | Queue, templates, preferences, delivery tracking and retry are complete. One domain must be verified before any parent receives mail; until then messages are held, not lost. |
| **SMS** | Queue and tracking complete; no provider wired in. The largest remaining commercial gap, since most Nigerian schools reach parents by text. |
| **Accounting / bank** | CSV export packs and bank batch formats exist. Per-package mapping is additive. |
| **AI** | Live, metered per organisation, with the add-on paywall enforced server-side. |

**Nearest work:** live payment-provider credentials and webhooks, an SMS provider,
and verifying the sending domain.

---

*For deployment steps and known open items, see
[`PRE_LAUNCH_CHECKS.md`](PRE_LAUNCH_CHECKS.md). For how to operate the product day
to day, see [`USER_GUIDE.md`](USER_GUIDE.md).*
