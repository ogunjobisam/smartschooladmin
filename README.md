# Smart School Admin

Multi-tenant school finance and operations software for private schools and school
groups. Built for schools that run on paper, spreadsheets and WhatsApp today, with
structured workflows, role-based access, approvals and an audit trail instead.

**Live app:** https://smartschooladmin.lovable.app

---

## What it does

| Area | Capability |
| --- | --- |
| Admissions | Public application form per school, applicant pipeline, one-step conversion to a student, per-school reference numbering |
| Students & guardians | Enrolment, class assignment, guardian links, promotion between classes, CSV import, cropped photos, configurable ID formats, printable ID cards |
| Staff | Staff records, positions, bank details, document store, photos and ID cards |
| Fees & billing | Fee categories and schedules, bulk invoice generation per class/term, transport fares billed as their own invoice line |
| Payments | Record payments, allocate against invoices, receipts, arrears ageing, printable statements of account and reminder/final-notice letters |
| Payroll | Payroll runs, approval gate, payslips, bank batch export, salary-change approvals |
| Academics | Attendance register, exams with per-exam rubrics and grade bands, score entry, report cards, transcripts |
| Academic performance | Per-student trends, subject strengths, class rankings, at-risk flags |
| Achievement wall | Awards, prizes and prefect appointments through draft → published, printable certificates, read-only `/wall` display view |
| Communications | Announcements with pinned banner, notification templates, per-user channel/quiet-hour preferences, delivery console with retry, public notices |
| Events | Audience-scoped events, RSVPs, `.ics` download and subscribable school calendar feed |
| Transport | Bus routes, ordered stops, per-term fares with per-student overrides |
| Oversight | Approvals queue, audit log, cross-school reporting, proprietor dashboard |
| Parent portal | Children, invoices, balances, payment history, results, attendance, achievements, bus route, events |
| Student portal | A student's own results, attendance, invoices, recognitions, bus route, events |
| AI Analysis (paid add-on) | Written performance analysis, draft report card comments, finance and staffing insights; five free analyses a month |
| Demo sandboxes | Self-serve persona demo from the landing page, seeded and self-deleting after four hours |
| Everywhere | Ctrl+K command palette, installable as a phone/desktop app, CSV export on every list |

Multi-tenancy runs on an `organisation_group → school → campus` hierarchy. Every
table is isolated by organisation through PostgreSQL row-level security.

[`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) describes each module and the code
behind it, and is explicit about the handful of places where the capability is
narrower than its name suggests.

## Roles

`super_admin`, `proprietor`, `group_admin`, `school_admin`, `principal`, `bursar`,
`finance_officer`, `hr_admin`, `teacher`, `parent`, `student` — ranked in that
order by `role_rank()` in SQL, most senior first.

**A user may hold several roles.** `get_my_roles()` returns all of them and the
most senior drives navigation and gating. The database refuses incompatible
combinations: `roles_compatible()` and the `enforce_role_compatibility` trigger
stop a student account also holding a staff role, and student may combine only
with parent. An administrator can only grant roles below their own rank.

**An account spanning several organisations or schools picks one at sign-in**
through the workspace picker; all scoping follows that choice.

Student logins are opt-in per school: a student gets one only when someone
presses **Invite to portal** on their record.

Navigation, page access and database policies all resolve from one place —
`src/lib/access.ts` for routes, `primary_user_role()` for which organisation and
school the caller is in. [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) is the guide
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
- **One definition of the caller's organisation.** `get_my_role()`,
  `get_user_org_id()` and `get_user_school_id()` all delegate to
  `primary_user_role()`. They used to answer separately, two of them with a
  `LIMIT 1` and no `ORDER BY` — for an account holding two role rows the app and
  the policies could resolve to different organisations, leaving every read empty
  and every write matching nothing. `supabase/tests/rls.sql` asserts they agree.
- **Every view in `public` must run `security_invoker`.** A plain view executes
  with its owner's privileges and reads past the policies on its base tables, and
  Supabase grants new public views to signed-in users by default.
  `scripts/check-migrations.sh` fails on any view without it.
- **A blocked write reports failure.** RLS filtering a write out is not an error to
  PostgREST — it is an update matching no rows, returned as
  `{ data: [], error: null }`. `src/lib/writes.ts` requires a row to have actually
  changed, so a save cannot show a green confirmation while storing nothing.
- Student and staff documents and photos live in a private bucket behind
  short-lived signed URLs; only branding logos are public.

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
