# External review audit — findings report

No code changed, no migration run, no data written. Everything below is either a
read-only SQL query, an unauthenticated HTTP probe, or a static file read.

## Part 1 — Did it reach the database?

| Check | Expectation | Result | Verdict |
|---|---|---|---|
| 1a tables | 8 new tables | all 8 present (applications, school_notices, school_events, transport_routes, transport_stops, student_transport, class_teachers, ai_usage_events) | PASS |
| 1b enums | app_role incl. `student`; 4/4/8 values | app_role has 11 values incl. `school_admin` + `student`; school_section 4; event_audience 4; application_status 8 | PASS |
| 1c columns | 7 rows | 7 rows exactly (students.user_id, classes.section, schools.admissions_slug/open/intro, organisation_groups.ai_addon_enabled/ai_monthly_limit) | PASS |
| 1d RLS | on, with policies | applications 2, school_notices 2, school_events 2, student_transport 4, transport_routes 3, transport_stops 3 — RLS on for all | PASS |
| 1e anon grants | `authenticated` only | all 4 policies on applications + school_notices are granted to `authenticated`; no PUBLIC/anon role | PASS |
| 1f has_role | excludes student | definition contains `_role NOT IN ('parent'::app_role, 'student'::app_role)` | PASS |
| 1g helpers | 3 functions | my_student_id, is_self_service_role, is_my_child all exist | PASS |
| 1h section backfill | no NULLs | 18 classes, all banded `secondary`, zero NULL | PASS (see note) |
| 1i slug backfill | unique, non-null | 3 schools, 3 distinct slugs, none null; `admissions_open = false` on all three | PASS |
| `admissions` fn live | deployed, no JWT | `POST /functions/v1/admissions` with no Authorization header returns 200 with school payload | PASS |
| RESEND_API_KEY | set | **not present** in project secrets | FAIL |
| NOTIFICATIONS_FROM_EMAIL | set | **not present** in project secrets | FAIL |

Safe to continue: **yes** — the schema and the function are live. Two caveats:

- 1h note: every class in the project is a secondary class (JSS1–SS3 across three
  schools). The regex was never exercised against nursery/primary names, so the
  backfill passing here is weak evidence, not proof.
- Admissions emails will queue in `outbound_message_queue` and never send until
  `RESEND_API_KEY` and `NOTIFICATIONS_FROM_EMAIL` exist as edge function secrets.

## Parts 2, 3 (interactive) and 5 — not run, and why

Parts 2 and 3 require writing: submitting an application, toggling
`admissions_open`, creating routes and stops, inviting a portal student, signing
in as four different roles. Part 5 needs those screens populated to be worth
judging. I did not do any of it, because you asked for an investigation with no
state change and I am currently in plan mode. Saying so plainly rather than
implying it passed.

What I *was* able to check without writing:

- Anon `select` on `applications` and `school_notices` with the anon key only:
  returns `200 []` — no rows leak. (Note: PostgREST answers 200 with an empty
  array rather than 403; the data is protected, the status code is not a refusal.)
- Anon `insert` on `applications`: refused, `42501 new row violates row-level
  security policy for table "applications"`. The edge function is the only writer.
- `admissions` with `{"action":"apply"}` against a school whose `admissions_open`
  is false: **403**, `"This school is not accepting applications at the moment."`
- `has_role(super_admin, 'student')` is false by definition (1f).

Everything else in Parts 2/3/5 is **could not check**.

## Part 4 verdicts

1. **Bursar in Admissions — CONFIRMED.** `applications` has a SELECT policy that
   includes bursar and an ALL policy that does not (proprietor, group_admin,
   school_admin, principal only). `src/pages/Admissions.tsx` has no role check and
   `access.ts` gives bursar the `admissions` key. A bursar sees the stage buttons
   and Enrol, and every write silently fails RLS.
2. **Guardian invite missing school_id — CONFIRMED.** The `invite_guardian` branch
   inserts `{ user_id, role: 'parent', org_id }` with no `school_id`, while
   `invite_student` passes `school_id: student.school_id`. In a multi-school group
   the parent's role row has a null school, so anything keyed on `school_id`
   (notices, school-scoped events) resolves wrongly or emptily.
3. **Bus fees never billed — CONFIRMED.** `generate-invoices/index.ts` contains no
   reference to transport, `fee_per_term` or `fee_override`. Routes carry a fee
   that nothing charges.
4. **Transport stops enumeration — NOT A PROBLEM (in the live DB).** The live
   policy is `NOT is_self_service_role(auth.uid()) AND <org match>`, plus a
   separate "Riders can view their stop" policy scoped through
   `is_my_child()`/`my_student_id()`. The suspicion looks like it came from a
   stale migration file; the deployed policy has the guard.
5. **Duplicate transport rows — CONFIRMED (structurally).** Constraint is
   `UNIQUE (student_id, academic_period_id)`; Postgres treats NULLs as distinct, so
   with no current term two rows are creatable and `.maybeSingle()` in
   `StudentTransportCard.tsx` will throw `PGRST116`. Not reproduced live.
6. **Cross-school events — CONFIRMED.** Both `school_events` policies filter on
   `org_id` only, and `src/pages/Events.tsx` queries `.eq("org_id", orgId)`.
   `school_id` is written but never used to filter, so in a group every school sees
   every other school's events.
7. **Duplicate check `.maybeSingle()` — CONFIRMED.** The hour-window query in the
   `admissions` function can match multiple rows; `.maybeSingle()` then errors, the
   error is swallowed (`data` destructured without checking `error`), `recent` is
   falsy, and a third duplicate is inserted.
8. **Dead columns — CONFIRMED except one.** No writer anywhere for
   `applications.desired_class_id`, `transport_stops.dropoff_time`,
   `transport_routes.description`, or `transport_routes.is_active` (which
   `StudentTransportCard.tsx` filters on with no UI to set it — deletion is the
   only exit, and it cascades stops and rider rows away). `school_events.created_by`
   **is** written (`Events.tsx` sets `created_by: user?.id`) — that one is refuted.
9. **school_admin locked out of Settings — CONFIRMED.** `SettingsPage.tsx` line 37:
   `canManage = super_admin || proprietor || group_admin || principal`. RLS grants
   `school_admin` manage rights on both `school_notices` and `applications`, so the
   role has permission it cannot exercise in the UI.

## Proposed fixes, ranked (words only, nothing applied)

**Boundary / correctness**

1. Give the parent invite a `school_id`, derived from the guardian's linked
   student's school (fall back to the org's only school), and consider a
   `school_id` backfill for existing parent rows.
2. Filter `school_events` by `school_id` in both the RLS policies and the Events
   query, keeping org-level events as rows with a null `school_id`.
3. Fix the admissions duplicate check: order by `created_at desc`, `limit 1`, read
   the first row instead of `.maybeSingle()`, and check the error.
4. Replace the `student_transport` unique constraint with `NULLS NOT DISTINCT`, or
   make `academic_period_id` required; harden the card to take the newest row.

**Dead ends**

5. Either add bursar to the applications manage policy (read-only funnel is
   defensible too) or drop the `admissions` nav key from bursar and hide the stage
   buttons and Enrol behind the same role list the policy uses.
6. Add `school_admin` to `canManage` in Settings.
7. Bill transport in `generate-invoices`: add a line per rider using
   `fee_override ?? fee_per_term`, under a "Transport" fee category.
8. Add an active/inactive toggle for routes so retiring one does not cascade-delete
   its stops and riders.

**Loose ends**

9. Either surface `desired_class_id`, `dropoff_time` and `description` in their
   forms or drop the columns.
10. Set `RESEND_API_KEY` and `NOTIFICATIONS_FROM_EMAIL` as edge function secrets
    (never in `.env` or any `VITE_*` var), then verify the queue drains.

## To finish the audit

On your go-ahead I will run Parts 2, 3 and 5 for real in the preview — mint a
session per role, walk the seven flows, probe the four boundaries, and screenshot
each new screen at desktop and 375px — and report back without changing code.
That run does write demo rows (an application, a route, a portal student).
