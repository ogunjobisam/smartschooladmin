# Smart School Admin

Multi-tenant school finance and operations software for private schools and school
groups. Built for schools that run on paper, spreadsheets and WhatsApp today, with
structured workflows, role-based access, approvals and an audit trail instead.

**Live app:** https://smartschooladmin.lovable.app

---

## What it does

| Area | Capability |
| --- | --- |
| Admissions | Public application form per school, applicant pipeline, one-step conversion to a student |
| Students & guardians | Enrolment, class assignment, guardian links, promotion between classes, CSV import |
| Staff | Staff records, positions, bank details, document store |
| Fees & billing | Fee categories and schedules, bulk invoice generation per class/term |
| Payments | Record payments, allocate against invoices, receipts, arrears ageing and reminders |
| Payroll | Payroll runs, payslips, bank batch export, salary-change approvals |
| Academics | Attendance register, exams, score entry, report cards |
| Communications | Announcements, notification templates, in-app notifications, events calendar, public notices |
| Transport | Bus routes, ordered stops, per-term fees with per-student overrides |
| Oversight | Approvals queue, audit log, cross-school reporting, proprietor dashboard |
| Academic performance | Per-student trends, subject strengths, class rankings, at-risk flags |
| Parent portal | Children, invoices, balances, payment history, results, bus route, events and notices |
| Student portal | A student's own results, attendance, invoices, bus route, events and notices |
| AI Analysis (paid add-on) | Written performance analysis, draft report card comments, finance and staffing insights |

Multi-tenancy runs on an `organisation_group → school → campus` hierarchy. Every
table is isolated by organisation through PostgreSQL row-level security.

## Roles

`super_admin`, `proprietor`, `group_admin`, `school_admin`, `principal`, `bursar`,
`finance_officer`, `hr_admin`, `teacher`, `parent`, `student`.

Student logins are opt-in per school: a student gets one only when someone
presses **Invite to portal** on their record.

Navigation, page access and database policies are all driven from the role on the
user's `user_roles` row. [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) is the guide
for school staff; [`docs/USER_JOURNEYS.md`](docs/USER_JOURNEYS.md) maps what each
role can do and what is still missing.

**Teachers see only the classes they are assigned to** under Settings → Classes.
After deploying, assign classes before teachers log in, or their accounts open to
an empty page.

## Tech stack

- **Frontend** — React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, React Router
- **Backend** — Supabase (PostgreSQL + row-level security, Auth, Storage, Deno edge functions)
- **Testing** — Vitest + Testing Library, Playwright for end-to-end

## Getting started

Requires Node.js 18+ (install via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
git clone <this-repository-url>
cd smartschooladmin
npm install
cp .env.example .env    # then fill in your Supabase project values
npm run dev
```

The app runs at http://localhost:8080.

### Environment variables

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The project's anon/publishable key |
| `VITE_SUPABASE_PROJECT_ID` | The project ref, used by the Supabase CLI |

These are all client-side values and safe to ship in the browser bundle — access is
controlled by row-level security, not by the key. The **service role key must never
be added here**; it belongs only in edge function secrets.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |

## Database

Schema, policies and functions live in `supabase/migrations/` and are applied in
filename order. Edge functions live in `supabase/functions/`.

Replaying the full set against an empty database is verified to work. If you add
a migration, give every `CREATE POLICY` a `DROP POLICY IF EXISTS` immediately
above it — `CREATE POLICY` has no `IF NOT EXISTS` form, so without it a replay
fails on the second run. See [`docs/PRE_LAUNCH_CHECKS.md`](docs/PRE_LAUNCH_CHECKS.md)
for how that broke once and how it is checked.

```sh
npx supabase link --project-ref <your-project-ref>
npx supabase db push                      # apply migrations
npx supabase functions deploy invite-user # deploy an edge function
```

Edge functions need `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` set as function secrets.

Sending email (invites, admissions replies, announcements) needs one secret:

```sh
npx supabase secrets set RESEND_API_KEY=re_...
npx supabase functions deploy process-message-queue
```

That alone works. With no `NOTIFICATIONS_FROM_EMAIL`, messages go out as
Resend's built-in `onboarding@resend.dev`, **which only reaches the address that
owns the Resend account.** Everyone else is refused.

**One domain serves every school.** Verify a single domain that *you* control —
not each school's — and set it as the sender:

```sh
npx supabase secrets set NOTIFICATIONS_FROM_EMAIL=notifications@yourplatform.com
```

Each message then goes out as `Grace Academy <notifications@yourplatform.com>`,
with **Reply-To set to that school's own address** from Settings → General, so a
parent sees the school in their inbox and a reply reaches the school rather than
you. Adding a school needs no DNS work at all.

The school's name and reply-to travel on the queue row (`school_id`,
`reply_to`), so this works across a multi-school group. A row with no school
falls back to a bare platform address rather than failing.

A school that later wants mail genuinely from `@theirschool.com` verifies that
domain separately — an upgrade, not a requirement.

A refusal caused by an unverified sender is treated as a configuration problem,
not a bad message: those rows stay queued and go out once the domain is
verified, rather than being marked failed. **Settings → Notifications** shows the
backlog, names the sender in use, and can put genuinely failed messages back in
the queue. Invites work without any of this — the set-password link is shown to
whoever sent the invite so they can pass it on.

**Nothing drains the queue on a schedule.** Today the Settings button is the only
sender. To automate it, enable the `pg_cron` and `pg_net` extensions and run the
following **against your project** — not as a migration, since it embeds the
service role key and must never be committed:

```sql
select cron.schedule(
  'drain-message-queue', '*/10 * * * *',
  $$select net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/process-message-queue',
      headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
    )$$
);
```

SMS is queued but not delivered — no SMS provider is wired up yet. Queued texts
stay put and say so rather than being silently dropped.

The AI add-on needs `ANTHROPIC_API_KEY`:

```sh
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy ai-insights
```

The public application form is served by an edge function that runs without a
JWT, because the applicant is not signed in:

```sh
npx supabase functions deploy admissions
```

It is the only writer of the `applications` table — there is no `anon` policy on
it — so every field a stranger submits is validated server-side. Set the school's
link and open applications under **Settings → Admissions**.

## AI Analysis add-on

The AI features are sold separately from the core product, so they are off by
default. A proprietor or group admin turns them on per organisation under
**Settings → Add-ons**, which also shows how much of the monthly allowance has
been used.

Four surfaces use it:

| Where | What it does |
| --- | --- |
| Academic Performance | Reads a class's results and attendance and says which subjects and students need attention |
| Student → Performance | Drafts an end-of-term report card comment for a teacher to edit |
| Reports | Explains where fee collection is stuck, from collection rate and arrears ageing |
| Reports | Reads payroll cost against student and staff numbers |

Every call runs through the `ai-insights` edge function, which re-checks the
caller's role, that the school belongs to their organisation, that the add-on is
active, and that the monthly allowance has not run out — the entitlement cannot
be bypassed by calling the function directly. Each call is recorded in
`ai_usage_events` with token counts, so usage can be billed later.

Only aggregated figures are sent to the model — the summaries computed in
`src/lib/performance.ts`, not raw student records. The API key lives in function
secrets and never reaches the browser.

### First run

1. Sign up, then complete onboarding to create your organisation, first school,
   academic year, terms and classes.
2. Optionally seed demo data (students, staff, invoices, payments) from the
   onboarding wizard.
3. Invite colleagues from **Users**; each invite assigns a role at organisation or
   school level.

## Security model

- Every table has row-level security keyed on the caller's organisation.
- Privileged operations (invites, role changes, bulk invoice generation, seeding,
  bulk deletion) run in edge functions that verify both the caller's role **and**
  that the target organisation and school belong to them, because those functions
  use the service role key and bypass RLS.
- Role hierarchy is enforced server-side: a caller can only assign roles below their
  own rank, and school-level admins are further limited to school-level roles.

## Project layout

```
src/
  components/   Feature components, plus shadcn/ui primitives in components/ui
  contexts/     Auth and school-branding providers
  hooks/        Shared hooks
  integrations/ Supabase client and generated types
  lib/          Formatting, CSV export, printing, notifications, access map,
                performance, admissions, notices, sections, transport helpers
  pages/        One component per route
supabase/
  functions/    Deno edge functions
  migrations/   SQL schema, policies and functions
docs/
  USER_GUIDE.md     End-to-end guide for school staff
  USER_JOURNEYS.md  Per-role journey map and known gaps
  PRODUCT_SPEC.md   Original product brief
```

## Contributing

This project syncs with [Lovable](https://lovable.dev/projects/af2f82cb-fd9f-4ac2-8e61-8aa67cb14264).
Changes made in Lovable are committed here, and pushes to `main` sync back.

Before opening a pull request, run `npm run lint`, `npm run typecheck` and
`npm test`. Use `npm run typecheck` rather than `npx tsc --noEmit`: the root
`tsconfig.json` has `"files": []` and only project references, so a bare
`tsc --noEmit` silently passes on broken code.

GitHub Actions runs all four on every pull request, plus a migration replay.

## Migration replay

`npm run test:migrations` applies every migration in `supabase/migrations/` to an
empty database and then asserts that no table has row-level security on with no
readable policy, that nothing grants `anon` or `PUBLIC` access to `applications`
or `school_notices`, and that `has_role()` still excludes `student`.

It then runs `supabase/tests/rls.sql`, which seeds a school and queries it as a
real teacher and a real student to prove the policies *behave* — a teacher
assigned to no class sees no students and cannot edit one, cannot read invoices
or guardians, and cannot enumerate roles; a student can read their own scores but
not change them. Every assertion there corresponds to a hole that was open at
some point.

It needs a PostgreSQL server and `psql`; connection comes from the usual `PG*`
variables or `DATABASE_URL`. `supabase/tests/bootstrap.sql` stands in for the
Supabase-managed schemas, so this proves the schema *applies* and the policies
are present — not that they evaluate as a signed-in user, which needs a real
project.

This exists because the migration set silently stopped being replayable once:
two overlapping sets of files created the same policies, and `CREATE POLICY` has
no `IF NOT EXISTS`. **Give every `CREATE POLICY` a `DROP POLICY IF EXISTS`
immediately above it.**
