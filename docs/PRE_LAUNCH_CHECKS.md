# Pre-launch checks

Verification of the work merged in PRs #1–#3, and the prompts used to run it.

The app's own test suite proves the code compiles and the pure logic is right. It
proves nothing about the live Supabase project, and the repository has no CI. So
these checks are run by pasting the prompts below into Lovable, whose agent can
query the connected project and drive the live preview.

---

## Status

| Part | What it covers | State |
| --- | --- | --- |
| 1 | Did the migrations, policies and function reach the live database | **Run — passed**, 2 blockers |
| 2 | Functional walkthrough of every new feature | Not run — needs write access |
| 3 | Security probe of the new tenant boundaries | Partly run (read-only probes only) |
| 4 | Confirm or refute nine suspected defects | **Run** — 8 confirmed, 1 refuted |
| 5 | Design and copy review of the new screens | Not run |

Lovable's full report: [`.lovable/plan/external-review-audit-findings-report-2026-08-28.md`](../.lovable/plan/external-review-audit-findings-report-2026-08-28.md).

### Blockers found so far

1. **`supabase db push` no longer works on a fresh project.** See below. This is
   the most serious item and neither audit caught it.
2. **`RESEND_API_KEY` and `NOTIFICATIONS_FROM_EMAIL` are not set** as edge
   function secrets. Admissions acknowledgements, invites and fee reminders queue
   in `outbound_message_queue` and never send. Set them as function secrets —
   never in `.env` or any `VITE_*` variable.

---

## Blocker 1 — the migration set is no longer replayable

Applying the schema to the live project produced a **second, overlapping set of
migration files**, and the two sets sort in the wrong order relative to each
other.

- The Lovable-generated files are timestamped `20260828152924`–`20260828153802`.
- Seven of the hand-written files are timestamped `20260828160000`–`20260828230000`.
- They create **40 identically named policies on the same tables**, and the
  hand-written ones sort **last**.

The live database is fine — those files were applied in the order they were
actually run. The problem is any *replay*: a new tenant's project, a staging
environment, or a restore from migrations.

| Hand-written file | Policies | `DROP POLICY IF EXISTS` first? | On replay |
| --- | :-: | :-: | --- |
| `160000_message_queue_processing` | 1 | 1 | Succeeds, but reverts to the older policy |
| `170000_class_teachers` | 8 | 6 | 2 unguarded → **error** |
| `180100_student_portal` | 21 | 12 | 9 unguarded → **error** |
| `200000_school_events` | 2 | 0 | **error** |
| `210000_transport` | 10 | 0 | **error** |
| `220000_admissions` | 2 | 0 | **error** |
| `230000_school_notices` | 2 | 0 | **error** |

`CREATE POLICY` has no `IF NOT EXISTS` form, so a duplicate name is a hard error
and the push halts.

There is a worked example of the second failure mode — silent regression rather
than a loud error. `20260828153603` (Lovable) creates:

```sql
CREATE POLICY "Staff can view transport stops"
ON public.transport_stops FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())      -- the guard
  AND EXISTS (... org match ...)
);
```

`20260828210000_transport.sql` (hand-written, sorts later) creates the same
policy name **without** the `is_self_service_role` guard, which would let any
parent or student enumerate every stop on every route. Lovable's Part 4 answer —
"not a problem, the deployed policy has the guard" — is right about the live
database and does not hold for a replay.

**Suggested fix**, in order of preference:

1. Squash `20260828*` into one baseline migration that matches the live schema,
   generated with `supabase db diff`, and delete the overlapping files. Cleanest,
   and the live database is the source of truth to diff against.
2. Failing that, give every `CREATE POLICY` in the seven hand-written files a
   matching `DROP POLICY IF EXISTS` immediately above it, and re-check that the
   *later* file is the version you want to win — for transport stops it is not.

Until one of those is done, treat the live project as the only deployable
environment and do not promise a second tenant a fresh install.

---

## Confirmed defects

From Part 4. Ranked; none are fixed yet.

**Boundary and correctness**

1. **Parent invites carry no `school_id`.** `invite-user/index.ts` `invite_guardian`
   inserts `{user_id, role:'parent', org_id}`, while `invite_student` and the staff
   invite both set `school_id`. `AuthContext` falls back to the org's first school,
   so in a multi-school group a parent is pinned to the wrong one — and that now
   decides which notices and events they see. Derive it from the guardian's linked
   student, and backfill existing rows.
2. **Events are org-scoped, not school-scoped.** `school_events.school_id` is
   written but neither the RLS policies nor `Events.tsx` filter on it, so every
   school in a group sees every other school's events. Filter on `school_id`,
   treating `NULL` as an org-wide event.
3. **The admissions duplicate check can error and insert a duplicate anyway.** The
   one-hour window query uses `.maybeSingle()` on something that can match several
   rows; the error is destructured away and ignored. Use `order by created_at desc,
   limit 1` and check the error.
4. **`student_transport`'s unique constraint does not bind without a current term.**
   `UNIQUE (student_id, academic_period_id)` — Postgres treats NULLs as distinct,
   so two rows are creatable and `StudentTransportCard`'s `.maybeSingle()` then
   throws `PGRST116`. Use `NULLS NOT DISTINCT`, or require the period.

**Dead ends in the UI**

5. **Bursars see an Admissions funnel they cannot use.** `access.ts` grants bursar
   the `admissions` nav key and the SELECT policy includes them, but the manage
   policy does not — and `Admissions.tsx` has no role check at all, so the stage
   buttons and **Enrol** are visible and every write fails. Decide which way it
   goes: read-only funnel for bursars (hide the controls) or add them to the manage
   policy. This one is mine, introduced in PR #3.
6. **School admins are locked out of the new Settings cards.** `SettingsPage.tsx`
   computes `canManage` without `school_admin`, though RLS grants it manage rights
   on both `school_notices` and `applications`.
7. **Transport fees are never billed.** `generate-invoices` has no reference to
   transport. Add a line per rider using `fee_override ?? fee_per_term`.
8. **A route can only be retired by deleting it**, which cascades away its stops
   and every rider assignment. `is_active` is filtered on but has no UI.

**Loose ends**

9. Columns declared and never written: `applications.desired_class_id`,
   `transport_stops.dropoff_time`, `transport_routes.description`. Either surface
   them or drop them. (`school_events.created_by` *is* written — that suspicion was
   refuted.)

---

## Prompt A — the audit (already run)

Kept so it can be re-run after fixes. Paste into Lovable as one message.

> You are checking work that was merged into `main` from an external code review:
> a `student` role and student portal, age-banded school sections, an events
> calendar, school transport, an admissions funnel with a public application form,
> public notices, and PWA installability.
>
> **Do not change any code, run any migration, or create any file.** This is an
> investigation — report what you find and stop. Your commits sync back to my
> GitHub repo, so an unreviewed edit lands on `main` without review.
>
> Never put the Supabase **service role key** into `.env`, any `VITE_*` variable,
> or any file under `src/` — it belongs only in edge function secrets. If you
> cannot check something, say so plainly rather than assuming it passed.
>
> **Part 1 gates the rest.** Confirm against the connected project: the 8 new
> tables (`applications`, `school_notices`, `school_events`, `transport_routes`,
> `transport_stops`, `student_transport`, `class_teachers`, `ai_usage_events`);
> the enums (`app_role` contains `student`; `school_section` 4 values;
> `event_audience` 4; `application_status` 8); the 7 new columns
> (`students.user_id`, `classes.section`, `schools.admissions_slug/open/intro`,
> `organisation_groups.ai_addon_enabled/ai_monthly_limit`); RLS on with policies
> for all six new tables; **no `anon` or PUBLIC grant** on `applications` or
> `school_notices`; `has_role` containing
> `_role NOT IN ('parent'::app_role, 'student'::app_role)`; and the helpers
> `my_student_id`, `is_self_service_role`, `is_my_child`. Then check the two
> backfills — any class with a NULL `section`, and one distinct non-null
> `admissions_slug` per school — and whether the `admissions` function is deployed
> (it must answer without a JWT) and `RESEND_API_KEY` /
> `NOTIFICATIONS_FROM_EMAIL` are set. Report pass/fail and say whether it is safe
> to continue.
>
> **Part 2 — walk it in the preview.** Apply as a stranger at `/apply/<slug>`
> signed out; check the reference comes back, and that switching admissions off
> makes the page refuse politely. Work an application through the funnel. Enrol it
> and confirm the student, guardian, enrolment and `converted_student_id` all
> exist and that the application can no longer be moved. Create a transport route
> with stops and assign a student. Invite a student to the portal, sign in, and
> check `/student`. Sign in as a parent and check the bus card, notices and
> events. Create a notice dated in the future and confirm it does **not** show,
> then today's and confirm it does. Paste any console error verbatim.
>
> **Part 3 — probe the boundaries.** Cross-organisation reads of `applications`,
> `school_notices`, `school_events`, `student_transport` (all must return
> nothing). Anon `select` and `insert` on `applications` and `school_notices`
> (both refused). The `admissions` function with `action: "apply"` against a
> school where `admissions_open` is false (403). A teacher navigating directly to
> `/admissions`, `/transport`, `/payroll`, `/settings` — refused by the router,
> and also refused at the data layer. A student reading another student's scores,
> attendance or invoices. And `has_role(<a super_admin>, 'student')` must be false.
>
> **Part 4 — confirm or refute**, with evidence, answering confirmed / not a
> problem / could not check: (1) bursar sees Admissions controls that fail under
> RLS; (2) `invite_guardian` omits `school_id`; (3) transport fees never reach
> `generate-invoices`; (4) `"Staff can view transport stops"` lacks the
> `is_self_service_role` guard; (5) `student_transport`'s unique constraint does
> not bind when `academic_period_id` is NULL; (6) `school_events` filters on
> `org_id` only though it stores `school_id`; (7) the admissions duplicate check
> misuses `.maybeSingle()`; (8) `desired_class_id`, `dropoff_time`, `description`,
> `created_by` and `is_active` are declared but unused; (9) `SettingsPage`'s
> `canManage` excludes `school_admin` though RLS grants it.
>
> **Part 5 — how it looks.** `/admissions`, `/apply/<slug>`, `/transport`,
> `/events`, `/student` and Settings → Admissions, at desktop and 375px. Overflow,
> unreadable tables, broken-looking empty states, inconsistent buttons, unclear
> copy.
>
> Report in this order: Part 1 pass/fail → anything that dead-ends → anything that
> leaks across a tenant, role or family boundary → Part 4 verdicts → design notes,
> ranked by severity. Propose fixes in words; do not apply them.

---

## Prompt B — finish the audit

Parts 2, 3 and 5 need to write demo rows, which is why they were not run. Paste
this next.

> Go ahead and run Parts 2, 3 and 5 of the audit for real in the preview. You may
> create demo data — an application, a transport route and stops, a portal student
> — but still **do not change any application code, migration or config**, and
> tell me exactly what rows you created so I can clear them.
>
> Mint a session per role (admin, bursar, teacher, parent, student) and walk the
> seven flows in Part 2, probe the five boundaries in Part 3, and screenshot each
> new screen at desktop and 375px for Part 5.
>
> Two specific things to settle while you are in there, both from Part 4:
>
> - As a **bursar**, open `/admissions` and press a stage button and **Enrol**.
>   Tell me exactly what the user sees when the RLS write is refused — a toast, a
>   silent no-op, or a crash. That decides how urgent the fix is.
> - Sign in as a **parent in a multi-school organisation** and tell me which
>   school's notices and events they get, and whether it is the right one.
>
> Separately, and more important than any of the above: `supabase/migrations/`
> now contains two overlapping sets of files. Yours are timestamped
> `20260828152924`–`20260828153802`; seven hand-written ones are
> `20260828160000`–`20260828230000`, they sort **after** yours, and between them
> they create **40 identically named policies on the same tables**. Four of the
> hand-written files issue no `DROP POLICY IF EXISTS` at all, so replaying this
> migration set against a **fresh** project errors out on a duplicate policy name.
> Where it does not error it silently reverts to the older definition — for
> instance `20260828153603` creates `"Staff can view transport stops"` with a
> `NOT is_self_service_role(auth.uid())` guard, and `20260828210000_transport.sql`
> recreates the same policy without it.
>
> The live database is correct; a replay is not. Confirm my reading, then tell me
> which you would rather do — squash `20260828*` into a single baseline generated
> from the live schema with `supabase db diff`, or add the missing
> `DROP POLICY IF EXISTS` statements and reconcile which definition should win in
> each of the 40 cases. **Do not do either yet**; I want to agree the approach
> first, and it should land as a reviewed pull request rather than a direct push
> to `main`.

---

## Running these yourself

The SQL in Part 1 is worth keeping to hand for any future deployment:

```sql
-- New tables — expect 8
select tablename from pg_tables where schemaname = 'public' and tablename in (
  'applications','school_notices','school_events','transport_routes',
  'transport_stops','student_transport','class_teachers','ai_usage_events')
order by tablename;

-- SECURITY CRITICAL: expect every row to say 'authenticated', never PUBLIC/anon
select c.relname, p.polname, coalesce(r.rolname,'PUBLIC') as granted_to, p.polcmd
from pg_policy p
join pg_class c on c.oid = p.polrelid
left join lateral unnest(p.polroles) pr(oid) on true
left join pg_roles r on r.oid = pr.oid
where c.relname in ('applications','school_notices')
order by c.relname, p.polname;

-- Classes the section backfill could not band — these need setting by hand
select coalesce(section::text,'(none)') as section, count(*),
       string_agg(name, ', ' order by name) as classes
from public.classes group by 1 order by 1;
```
