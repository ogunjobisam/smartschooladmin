# Outstanding gaps — full list, then the student/teacher fix

## Part 1: The complete gap list (pick what you want built)

### A. Student and teacher visibility (biggest gap, confirmed)
1. Students can only open Dashboard, My Portal, Wall, Events, Preferences. Attendance history, per-exam results/report card, and documents are blocked by the app's menu rules even though the database already permits a student to read their own attendance, exams and scores.
2. Students see only rolled-up numbers: one overall average and four attendance totals. No day-by-day attendance, no subject-by-subject results, no printable report card of their own.
3. No timetable anywhere in the product. There is no timetable or class-schedule data at all, so "my subjects and when they happen" would be new ground-up work.
4. Teachers see a flat roster of their students that does not open anything — the rows are not clickable, so a teacher cannot reach a student's profile from My Teaching.
5. Teachers cannot see guardian contact details at all. This is blocked in the database, not just the screen: the guardian rule explicitly excludes teachers. They can see which guardian is linked, but not the name, phone or email.
6. Teachers get only an exam average per exam. No pass rate, no subject strengths/weaknesses, no per-student breakdown.
7. Teachers cannot see or nominate achievements for their own students from My Teaching.

### B. Communications
8. SMS is queued but never sent — no SMS provider is connected, so SMS messages sit in the queue forever.
9. Reminder scheduling relies on the queue drain; repeat-reminder rules and per-user timezone handling are still rough.

### C. Money
10. Transport is not billed — routes and riders exist, but no transport fee flows into invoices.
11. Live card payments are still mock/simulated end to end; no real Paystack/Flutterwave keys in use.

### D. Trust and operations
12. Several school notice/permission controls are unclear about who can publish what.
13. Some database helper functions still raise "search path" security warnings in the scanner.
14. No automated end-to-end test suite for the money journeys (student → invoice → payment → payroll → payslip).

### E. Smaller loose ends
15. A few leftover test accounts cannot be deleted.
16. www.smartschooladmin.app domain records are still incomplete (the plain domain works).

## Part 2: What I propose to build now (your selections)

### Student portal — "everything about me"
- **My results**: a new results section listing every exam the student sat, each subject's score, grade and class position, plus a printable report card using the existing branded report-card design.
- **My attendance**: a dated attendance log for the current term with the four status totals kept on top, filterable by term.
- **My subjects**: the subject list for the student's class (from the existing class-subject setup), shown as "My subjects". A true weekly timetable is called out as separate future work since no timetable data exists yet — I will not fake one.
- **My fees, events, awards**: keep the current fees widget, statements, events and awards, and add the missing links so nothing is a dead end.
- Grant the student access to the results and attendance screens in the menu rules, restricted to their own record.

### Teacher portal — "everything about my students"
- Make the roster rows open the student profile, and make sure a teacher opening a student sees attendance, results and achievements for that child.
- **Guardian contacts for my students only**: change the guardian rule in the database so a teacher can read the guardian records of children they actually teach — nothing wider. Add a contacts panel on the student profile and a contact column on the roster.
- **Class performance**: per-class subject averages, pass rate, highest/lowest, and a per-student score table for each of their exams.
- Add an achievements panel so a teacher can see and nominate recognitions for their own students.

## Technical notes
- Access rules live in `src/lib/access.ts` (`NAV_KEY_BY_ROLE`); add `attendance`-style keys for student with own-record-only pages rather than opening the existing management screens.
- New pages: `src/pages/student/MyResults.tsx`, `MyAttendance.tsx`; new panels `ClassPerformancePanel.tsx`, `GuardianContactsPanel.tsx`.
- Reuse `summariseStudent`, `useStudentPerformanceData`, `print-documents.ts` report card, `document-theme.ts`.
- One migration: replace the `guardians` staff SELECT policy so teachers pass when `teaches_student()` holds for a linked child (via `student_guardians`), keeping the current manager access unchanged. `is_teacher_only`/`is_self_service_role` confirmed: teachers are not self-service, so no other policy needs touching.
- No change to parent, bursar or manager access.
