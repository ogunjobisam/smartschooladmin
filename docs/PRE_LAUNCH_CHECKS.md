# Pre-launch checks

Verification of the work merged in PRs #1–#3, and the prompts used to run it.

The app's own test suite proves the code compiles and the pure logic is right,
and CI now runs it on every pull request along with a full migration replay. What
neither can prove is anything about the *live* Supabase project or a rendered
screen — so those checks are run by pasting the prompts below into Lovable, whose
agent can query the connected project and drive the live preview.

---

## Status

| Part | What it covers | State |
| --- | --- | --- |
| 1 | Did the migrations, policies and function reach the live database | **Run — passed**, 2 blockers |
| 2 | Functional walkthrough of every new feature | **Run** — 7 dead ends found, all fixed |
| 3 | Security probe of the new tenant boundaries | **Run** — isolation holds; 3 role-boundary holes found and fixed |
| 4 | Confirm or refute nine suspected defects | **Run** — 8 confirmed, 1 refuted |
| 5 | Design and copy review of the new screens | **Run** — no overflow; currency and copy issues found |

Lovable's full report: [`.lovable/plan/external-review-audit-findings-report-2026-08-28.md`](../.lovable/plan/external-review-audit-findings-report-2026-08-28.md).

### Blockers found so far

1. ~~**`supabase db push` no longer works on a fresh project.**~~ **Fixed.** See
   below for what was wrong and how it was proven.
2. ~~**`RESEND_API_KEY` and `NOTIFICATIONS_FROM_EMAIL` are not set.**~~
   `RESEND_API_KEY` is now set, and the code no longer needs the second secret:
   a missing `NOTIFICATIONS_FROM_EMAIL` falls back to Resend's built-in sender
   instead of blocking the whole queue.

   **One thing remains, and it is a real limit rather than a bug.** The built-in
   sender only delivers to the address that owns the Resend account. Until a
   school domain is verified in Resend and `NOTIFICATIONS_FROM_EMAIL` is set to
   an address on it, **parents will not receive anything.** Those messages are no
   longer destroyed by the attempt — see below — they simply wait.

### The trap that was avoided

Setting the second secret without verifying a domain would have been worse than
doing nothing. Resend answers **403** for an unverified sender, and the queue
processor classified any 4xx except 429 as *permanent*: one drain would have
marked every queued invite and admissions acknowledgement `failed` on its first
attempt. Nothing in the app could move a row out of `failed` — no UPDATE policy
for `authenticated`, no UI control — so verifying the domain afterwards would not
have brought them back.

Sender refusals are now classified as `unconfigured`, which costs no attempt and
leaves the row queued, and there is a **Try failed messages again** control on
the outbox card for anything already lost. The classification is pinned by tests
in `src/test/email-result.test.ts`.

---

## Blocker 1 — the migration set was no longer replayable (fixed)

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

### What was done

The generated set turned out to be a strict superset of the hand-written one —
every table, function, policy, type, trigger and column the nine later files
created is also created by the generated files, which additionally carry the
hardening. So the nine were **deleted** rather than patched. Nothing was lost and
the hardened definitions now win.

This was proven, not assumed. A scratch PostgreSQL 16 cluster with a minimal
stand-in for the Supabase-managed schemas (`auth`, `storage`, the roles, the
realtime publication) replayed every migration in filename order:

- **Before:** failed at `20260828170000_class_teachers.sql` —
  `policy "Staff can view class teachers in their org" ... already exists`.
- **After:** applies cleanly. All 8 new tables present, **no table left with RLS
  on and no SELECT policy**, `"Staff can view transport stops"` carries the
  `is_self_service_role` guard, and `has_role` still excludes `student`.

### If the deleted versions were already applied to the live project

Deleting migration files does not touch the live database, but the Supabase CLI
tracks applied versions in `supabase_migrations.schema_migrations`. If those nine
versions were recorded there, `supabase migration list` will now show them as
remote-only. That is cosmetic, and `supabase db push` still works because no new
local file sorts before them. To tidy it:

```sh
supabase migration repair --status reverted 20260828160000 20260828170000 \
  20260828180000 20260828180100 20260828190000 20260828200000 \
  20260828210000 20260828220000 20260828230000
```

Run it only if `supabase migration list` actually reports them; if the schema was
only ever applied through Lovable, they were never recorded and there is nothing
to repair.

---

## Confirmed defects

From Part 4, ranked. Eight are fixed; one remains open.

### Fixed

1. **Parent invites carried no `school_id`.** `invite_guardian` inserted
   `{user_id, role:'parent', org_id}` while `invite_student` and the staff invite
   both set `school_id`, so `AuthContext` fell back to the organisation's first
   school and a parent in a group was shown another school's notices and events.
   The invite now derives the school from the guardian's linked children, and a
   backfill in `20260828235900` fixes existing rows. A guardian whose children
   attend two different schools stays organisation-level rather than being
   guessed at.
2. **Events were organisation-scoped, not school-scoped.** `school_events` stored
   `school_id` but neither the policies nor the queries used it. Both policies now
   filter through a new `get_user_school_id()` helper, and both queries ask for
   this school's events plus the group-wide ones. An event with a `NULL`
   `school_id` stays organisation-wide, which is what a proprietor's group
   announcement wants.
3. **The admissions duplicate check could error and insert a duplicate anyway.**
   The one-hour window query used `.maybeSingle()`, which raises once two rows
   match, and the raise was discarded — so the third submission got through. It
   now takes the newest match with `order by ... limit 1` and checks the error.
4. **A student could hold two transport assignments for the same term.**
   `UNIQUE (student_id, academic_period_id)` does not bind when the period is
   `NULL`, because Postgres treats NULLs as distinct. A partial unique index now
   covers the NULL case — chosen over `NULLS NOT DISTINCT` so the migration does
   not require PostgreSQL 15+.
5. **Bursars saw an Admissions funnel they could not use.** The nav key and the
   SELECT policy included bursar, the manage policy did not, and the page had no
   role check at all — so the stage buttons and **Enrol** were visible and every
   write was refused. Bursars keep the read-only funnel, which is what they want
   it for; the controls are now hidden and the detail panel says who can move an
   application. Introduced in PR #3.
6. **School admins were locked out of the new Settings cards.** `canManage`
   omitted `school_admin` though RLS grants it manage rights on classes, notices
   and applications.

7. **Transport fees are now billed.** Generating invoices
   offers a tick box — on by default, shown only when the class actually has
   riders — naming how many will be charged and the total. Each rider gets a
   separate `Transport — <route>` line under an auto-created Transport fee
   category, at `fee_override ?? fee_per_term`. Opt-in per run so a school that
   bills transport separately is not silently double-charging.

### Open

8. **A route can only be retired by deleting it**, which cascades away its stops
   and every rider assignment. `is_active` is filtered on but has no UI.
9. **Columns declared and never written:** `applications.desired_class_id`,
   `transport_stops.dropoff_time`, `transport_routes.description`. Either surface
   them or drop them. (`school_events.created_by` *is* written — that suspicion
   was refuted.)

---

## Parts 2, 3 and 5 — run, and what they found

Run through Lovable against the live project. Full report in
`.lovable/plan/`. It confirmed the bursar gating works, tenant isolation holds,
anonymous access is refused, and the closed-admissions page behaves. It also
found real holes, all now fixed in `20260829100000_close_role_boundary_holes.sql`
and covered by the new behaviour tests in `supabase/tests/rls.sql`:

| Finding | Was |
| --- | --- |
| Teachers could read and **write** every student in the org | A `FOR ALL` policy sat beside the scoped one; permissive policies combine with `OR`, so the scoping was decorative |
| Teachers could read the whole school's invoices and guardians | No role check beyond "not a parent or student" |
| Any member could enumerate `user_roles` | Including which account is `super_admin` |
| **A student could write their own exam scores** | Write policies gated on `NOT has_role(…,'parent')`, written before the `student` role existed — a student is not a parent. Found while fixing the above, not by the audit |
| Performance and transcripts 500'd everywhere | `exams` and `student_scores` policies subqueried each other → `42P17 infinite recursion`, hidden behind a "No performance data yet" empty state |
| Every fresh sign-in landed on `/onboarding` | `get_my_role()` used `LIMIT 1` with no `ORDER BY`; a row with a null `org_id` could win, and users were then offered the org-creation wizard |

Also fixed: the guardian list's Invite button navigated instead of inviting; the
public form saved `section` as null; Settings linked an unsaved admissions slug;
the Transport KPI ignored per-student fee overrides; guardian names kept the
honorific, so the parent portal greeted "Welcome, Mrs".

### Still outstanding

- **Redeploy the edge functions.** The deployed `invite-user` predates the
  `student` role and returns `400`, so the student portal has never worked in
  production. The repo source is correct — it needs
  `npx supabase functions deploy invite-user`.
- **Three orphaned `auth.users`** from the audit (`audit.*@example.com`) with a
  known password. They hold no role, which combined with the onboarding bug meant
  they could have created a new organisation. Delete them from the dashboard.
- **Check `admissions_open` on each school.** The audit toggled it and restored
  it to `true`, but its own notes say all three started `false`.
- **Organisation currency is GBP**, so money renders in £. Change it to NGN.
- ~~The application reference sequence is global, not per-school.~~ **Fixed** —
  each school now numbers from 1 each year via `next_application_reference()`,
  and uniqueness moved from `reference` to `(school_id, reference)` so the short
  form a parent reads out over the phone is kept.

---

## If sign-in lands nowhere

Signing in successfully and then ending up at the onboarding wizard — or on a
screen with nothing on it — is not an authentication failure. The password was
accepted; what failed is the step straight after it, where the app asks the
database which school you belong to.

That step used to fail silently: the error went to the browser console and the
app treated "we could not read your role" as "this person has no school yet",
which is the same state as a brand-new signup. So a working account was sent to
the wizard, and the only thing on offer there was to create a *second*
organisation.

Two screens now stand in the way of that.

**"We couldn't load your account"** — the lookup itself failed. The screen
carries the Postgres or PostgREST code and a sentence about what it usually
means. The three worth recognising:

| Code | What it means |
| --- | --- |
| `42501` | A row-level security policy is blocking the read, or the policy that should allow it was never applied |
| `42P17` | Two policies refer to each other in a loop; nothing can be read until one is rewritten |
| `42883` / `PGRST202` | The function the app calls does not exist on this project — **almost always a migration that was never pushed** |

A `42883` or `PGRST202` on `get_my_role` means the live database is behind the
repository. Run `npx supabase db push` and sign in again.

**"Your account isn't attached to a school"** — the lookup worked and found a
role, but with no organisation behind it. That is a data problem on the account,
not a deployment problem; the role needs reissuing from user management.

Both screens carry **Try again**, which repeats the lookup without a full
sign-out, and both are reached only when the account is genuinely stranded — a
real new signup still goes to onboarding as before.

---

## If saving appears to work but nothing changes

Everything is linked. What used to go wrong is that the app and the database
could disagree about **which organisation you are in**.

Three functions each answered that question, and two of them answered it with
`LIMIT 1` and no `ORDER BY`:

| Function | Read by |
| --- | --- |
| `get_my_role()` | `AuthContext` — decides `orgId` and `schoolId` for every query the app sends |
| `get_user_org_id()` | 212 references across the row-level security policies |
| `get_user_school_id()` | the school-scoped policies |

With one role row on your account they agree by luck. With two — a proprietor
who ran onboarding twice, someone invited to a second school — `LIMIT 1` with
no `ORDER BY` returns whichever row Postgres reaches first. That is physical
row order, and it changes after an ordinary `UPDATE` to a role row.

Reproduced against Postgres 16: one `UPDATE` flipped `get_user_org_id()` to the
second organisation while `get_my_role()` stayed on the first. From then on the
app filtered every query by org A while the database evaluated org B, so **every
read came back empty and every write matched no rows**.

And a write that matches no rows is not an error. PostgREST returns
`{ data: [], error: null }` — a success. So the school name was typed, saved,
confirmed with a green toast, and never stored.

All three now delegate to one `primary_user_role()`, which prefers a row with an
organisation, then one with a school, then **the most recently granted**. Most
recent matters: the old ordering preferred the oldest row, so someone who had
just created a school was put back into an older, empty one.

Two guards keep it fixed. `scripts/check-migrations.sh` asserts the app and RLS
resolve the same organisation across repeated rewrites of the role rows, and
`assertWrote()` (`src/lib/writes.ts`) makes a write that changes nothing report
a failure instead of a success.

### Repairing an account that already has more than one

The fix stops new ones appearing and lands you in the most recently created
organisation, but the earlier ones are still there. To find affected accounts,
in the SQL editor (the view is revoked from `anon` and `authenticated`, so it
is readable only as the service role):

```sql
SELECT * FROM public.users_with_multiple_roles;
```

| Column | What it tells you |
| --- | --- |
| `account`, `email` | Whose account this is |
| `role_count`, `roles` | How many role rows, and which roles |
| `organisations` | Every organisation the account holds a role in, by name |
| `signs_in_to`, `signs_in_to_school` | Where they actually land — **the one to keep** |
| `unreachable` | The abandoned ones, by name |
| `keep_org_id`, `stray_org_ids` | The same, as ids, for the delete below |

`unreachable` organisations cannot be reached from the interface at all: there
is a school switcher but no organisation switcher.

**Before deleting, check the strays are actually empty.** An abandoned setup
attempt usually is, but a demo seeded into one is not, and deleting the
organisation cascades to everything under it:

```sql
SELECT og.name,
       (SELECT count(*) FROM schools s WHERE s.org_id = og.id)  AS schools,
       (SELECT count(*) FROM students st
          JOIN schools s ON s.id = st.school_id WHERE s.org_id = og.id) AS students
FROM organisation_groups og
WHERE og.id = ANY (
  SELECT unnest(stray_org_ids) FROM public.users_with_multiple_roles
  WHERE email = 'you@example.com'
);
```

Then, once the counts look like something you are willing to lose:

```sql
-- The role rows first: while they exist, the organisation cannot be removed.
DELETE FROM public.user_roles
WHERE user_id = (SELECT user_id FROM public.users_with_multiple_roles
                 WHERE email = 'you@example.com')
  AND org_id = ANY (SELECT unnest(stray_org_ids)
                    FROM public.users_with_multiple_roles
                    WHERE email = 'you@example.com');

-- Then the organisations themselves, which cascades to their schools.
DELETE FROM public.organisation_groups og
WHERE og.id IN (…the ids you just checked…)
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.org_id = og.id);
```

The `NOT EXISTS` guard is deliberate: if anyone else — an invited teacher, a
parent — still holds a role in that organisation, this leaves it alone rather
than deleting the ground from under them.

Re-run the first query afterwards. An account that no longer appears is fixed.

---

## Two things to know about migrations from the preview platform

### The set now contains duplicates, and that is currently harmless

Pushing through the preview platform's migration tool re-recorded five
migrations under fresh timestamped filenames. They are byte-identical to the
originals apart from a trailing newline:

| Re-recorded as | Already in the repo as |
| --- | --- |
| `20260828202209_982875be…` | `20260828235900_scope_events_to_school.sql` |
| `20260828202424_1124837c…` | `20260829090000_message_school_context.sql` |
| `20260828202542_7c08ed43…` | `20260829100000_close_role_boundary_holes.sql` |
| `20260828202606_cc5244a6…` | `20260829110000_per_school_application_references.sql` |
| `20260828202628_1364fab7…` | `20260829120000_one_definition_of_current_org.sql` |

A duplicated migration set is what broke replay once before, because
`CREATE POLICY` has no `IF NOT EXISTS`. These are safe only because every one
of them drops before it creates, so applying the same file twice is a no-op —
and `scripts/check-migrations.sh` replays all 45 from empty on every push, so
if that ever stops being true CI says so rather than a fresh project failing.

They are being kept rather than deleted: both sets are recorded as applied on
the live project, and removing files that a database has already run is what
makes the next `supabase db push` complain about a migration-history mismatch.
The cost is duplication in the history, which is ugly but inert.

### A migration that arrives out of order can undo a later one

The platform's fix-up for the `security_invoker` warning was written with a
timestamp *earlier* than the migration that creates the view it was fixing. On
the live database that was fine — it ran afterwards in wall-clock order. On a
fresh replay it ran first, and then the original `CREATE OR REPLACE VIEW` put
the insecure definition back.

That matters because `CREATE OR REPLACE VIEW` **replaces `reloptions`
wholesale rather than merging them**: a later replace with no `WITH` clause
silently drops `security_invoker` with no error and no warning.

The view is now created with `security_invoker` in the first place, and
`20260829130000_harden_multiple_roles_view.sql` re-asserts it (plus revokes
`anon` and `authenticated`, which have no reason to read an operator's
diagnostic) so every database converges however it got there.

**The guard that was missing.** `scripts/check-migrations.sh` checked tables
and never looked at views, so it had nothing to say about a view reading its
base tables past every policy on them. It now requires every view in `public`
to be `security_invoker`. The first version of that check joined against
current grants and passed against a view that was provably leaking — the
replay database is not a Supabase project and carries none of its default
privileges, so at that point nothing is granted to `authenticated` yet. It now
ignores grants entirely.

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
