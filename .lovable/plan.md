

# Student Full History — Gap Analysis & Plan

## Current State

The Student Detail page (`src/pages/StudentDetail.tsx`) already has 6 tabs: Guardians, Invoices, Payments, Attendance, Grades, and Documents. However, two key areas are missing:

### What's Missing

1. **Enrolment History tab** — The student query already fetches `enrolments(class_id, classes(name), academic_periods(name))` but this data is only used to show the *current* class in the header. There is no tab showing the student's progression through classes over academic periods (e.g. "JSS1 — Term 1 2024", "JSS2 — Term 2 2024").

2. **Awards / Achievements** — No `awards` table exists in the database. This needs a new table and UI.

---

## Implementation Plan

### 1. Database: Create `student_awards` table

New migration to create:

```sql
CREATE TABLE public.student_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  award_date date NOT NULL DEFAULT CURRENT_DATE,
  academic_period_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_awards ENABLE ROW LEVEL SECURITY;
```

RLS policies: Staff can manage (non-parent, same org), all org members can view.

### 2. Add "History" tab to StudentDetail

A new tab (insert before Documents) called **"History"** that shows:

- **Enrolment timeline**: A simple table listing every enrolment row — Class name, Academic Period name, Enrolled date — ordered by date descending. This shows the student's class progression.
- **Awards section**: Below the enrolment timeline, a card listing awards with title, description, date, and an "Add Award" button for staff.

### 3. Wire up the data

- Enrolments are already fetched in the student query but limited. Add a dedicated query for all enrolments with academic period and class joins.
- Add a query for `student_awards` filtered by `student_id`.
- Add a simple inline form or dialog to create new awards.

### Files Changed

| File | Change |
|------|--------|
| New migration | Create `student_awards` table with RLS |
| `src/pages/StudentDetail.tsx` | Add "History" tab with enrolment timeline + awards list, new queries, add award form |

