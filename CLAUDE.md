# Working in this repository

Conventions that are not obvious from the code, and that this codebase has
already been bitten by. Each one below is here because something broke.

---

## 1. Never re-apply a migration that already exists

Every file in `supabase/migrations/` is already applied to the live database.

Re-applying one — through Lovable, or by copying it to a new timestamp — writes
a fresh copy that sorts to the **end** of the filename ordering and re-creates
the *older* version of whatever it touches. On 27 September that silently undid
a row-level-security fix: copies of three migrations landed after the migration
that had tightened `exams` and `exam_subjects`, and the `support_staff`
exclusion disappeared from both.

If a schema change is needed, write **one new migration with a new timestamp**.

Two consequences worth knowing:

- **A migration must be safe to run twice.** `CREATE POLICY` has no
  `IF NOT EXISTS`, so always `DROP POLICY IF EXISTS` first — a half-finished
  manual apply is otherwise unrecoverable without hand-inspection.
- **After any round of re-applied migrations, run the replay** against `main`.
  The file list looks fine in both the harmless and the harmful case; only the
  replay tells them apart.

## 2. Never hardcode a colour

`src/lib/theme.ts` derives ~30 HSL tokens from a school's two brand colours, and
the `:root` and `.dark` blocks in `src/index.css` are generated from it —
`src/test/theme.test.ts` parses the stylesheet and asserts they match character
for character.

Use the tokens: `bg-primary`, `text-gold-ink`, `bg-tile`, `text-warning`. A
literal hex or `hsl()` in a component breaks per-school branding and dark mode at
once. If a token you need does not exist, add it to `theme.ts` so both modes get
it and the contrast suite covers it.

Two rules the token set encodes:

- **A colour cannot be both a fill carrying white text and ink on a pale ground.**
  That is why `--gold` / `--gold-ink` / `--gold-on-primary` exist, and why the
  status colours have `--*-ink` variants with a Tailwind `textColor` override.
- **`--primary` inverts in dark mode.** Anything that must stay dark in both
  modes uses `--tile` (the icon plaque) or `--shadow-color` (shadows).

## 3. Role seniority lives in exactly one place

`ROLE_RANK` and `canAssignRole()` are in
`supabase/functions/_shared/caller-roles.ts`, read by both the `invite-user`
edge function and the User Management screen, and mirrored by
`public.role_rank()` in SQL.

Do not re-declare ranks anywhere. `src/test/caller-roles.test.ts` parses
`role_rank()` out of the migration and fails if they drift — it was a
hand-written third copy before, and it drifted the first time a role was added.

`primary_user_role()` is the single definition of "most senior role held".
Anything selecting one role from several must order by rank, never
`LIMIT 1` without `ORDER BY` — that bug has appeared twice, in `my_staff_id()`
and in six edge functions, and it fails intermittently by returning physical
heap order.

## 4. Adding a role grants it almost everything by default

The staff read policies are **denylists**: *"not a parent or pupil, not
teacher-only, therefore allowed."* A new `app_role` value inherits the whole
organisation's invoices, payments, fee schedules, exams and scores the moment it
exists — without a single policy being edited.

A new role therefore needs:

1. an `is_<role>_only()` helper in the shape of `is_teacher_only()` — *most
   senior role held*, not merely *holds this role*, so someone who is also a
   bursar keeps the bursar's reach;
2. explicit exclusion from the relevant policies **including the `FOR ALL`
   "manage" ones**. Permissive policies combine with **OR**, so tightening only
   the SELECT policy changes nothing at all. This was missed once and the
   exclusion was decorative until it was caught;
3. assertions in `supabase/tests/rls.sql`, each **watched failing first**.

An enum value must be added in its own migration: Postgres refuses to add a value
and use it in the same transaction (*"New enum values must be committed before
they can be used"*).

`src/lib/access.ts` only hides menu items. Its own header says it is defence in
depth and not the security boundary, and that is correct — row-level security is.

## 5. Tests that pass for the wrong reason

`supabase/tests/rls.sql` has produced vacuous assertions three times:

- a fixture user that a later section promoted, so the assertion measured the
  wrong role;
- a `count(*) = 0` against a table with **no rows**, which is true whatever RLS
  says — always add a fixture row and a positive control proving somebody *can*
  see it;
- a clause never reached, because the user was not the role the policy narrows.

Write the assertion, watch it fail, then fix the code.

## Before pushing

```
npm run typecheck        # tsc -b; plain `npx tsc --noEmit` checks nothing here
npx vitest run           # 997 tests
npx eslint .             # 0 errors; 67 pre-existing warnings
npx vite build
npm run test:migrations  # needs a Postgres; see scripts/check-migrations.sh
```

`npm run test:migrations` replays every migration into an empty database and
asserts eight invariants. It is the check that catches the class of problem in
§1 and §4, and it is worth running against `main` itself after anything reorders
the migration set.
