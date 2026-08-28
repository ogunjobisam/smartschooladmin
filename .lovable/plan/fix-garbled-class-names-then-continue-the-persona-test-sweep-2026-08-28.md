# Fix garbled class names, then continue the persona test sweep

## What you spotted
On the student record, the class reads `{"name":"JSS1","section":"secondary"} • day`. That is not a display bug — the class name is stored that way in the database.

Confirmed: 14 class rows for **Smartever School of Life** hold a JSON blob as their `name` and have an empty `section`. Every exam name derived from those classes inherited the same text (e.g. `Mid-Term Test - {"name":"Nursery 1","section":"nursery"}`). No other school is affected; the classes created for the other schools are clean (`JSS1`, `secondary`).

Cause: those rows were created by an older onboarding path that wrote the whole `{ name, section }` object into the name column instead of splitting it. The current setup function already handles the object correctly, so new schools are fine.

## Fix (data repair, one migration)
1. For classes whose name starts with `{`: set `name` to the JSON's `name` value and `section` to its `section` value, leaving `level_order` untouched.
2. For exams whose name contains that same blob: rewrite the trailing part to the plain class name.
3. Verify no rows remain with `{` in the name in classes, exams, fee_schedules, or announcements titles.

## Guard against a repeat
Add a small display-side safety net so a malformed name never reaches a parent or student again: a shared class-name helper that unwraps a JSON-shaped value before rendering, used wherever a class name is shown (student record, transcript, report card, attendance, exams).

## Then: continue the approved persona sweep
Resume the persona-by-persona walk already approved: proprietor/group_admin, school_admin, principal, bursar, finance_officer, hr_admin, teacher, parent, student, plus a signed-out stranger — journeys, router gating, data-layer gating, dead-end hunt, desktop and 375px. Any demo data created gets removed with row counts proven back to prior values. Findings reported for us to triage together.

## Technical notes
- Migration is `UPDATE` only, scoped by `name LIKE '{%'`; no schema change, no row deletion.
- Cosmetic React warning also seen in the console (`StatCard` given a ref without `forwardRef`) — noted, fixed only if you want it in this pass.
