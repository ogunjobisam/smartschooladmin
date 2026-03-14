

# Remaining Features to Build

After a thorough audit of every page, component, and database table, here are the features that are not yet built or are incomplete:

---

## 1. Academic Period Management (Settings gap)
The Settings page allows adding Academic Years but has **no UI to add Terms/Periods within a year**. Users can see existing periods but cannot create new ones. This is critical since periods are required for enrolments, invoices, and exams.

**Fix:** Add an "Add Period" form per academic year in the Academic Years tab, and a button to toggle `is_current` on a period.

## 2. Student Class Promotion
There is no mechanism to promote students to the next class at the end of a term/year. Currently the only way to move a student is to manually create a new enrolment record.

**Fix:** Add a "Promote Students" dialog accessible from the Students page that bulk-creates new enrolment records for the next class and period.

## 3. Bulk Report Card Generation (Exams gap)
ExamDetail allows viewing individual report cards but has no "Generate All Report Cards" or bulk print/download capability.

**Fix:** Add a "Print All Report Cards" button to ExamDetail that iterates through all students and renders report cards in a print-friendly layout.

## 4. Student Data Export
The Students page has no CSV export. Staff, Invoices, and Reports pages have export but Students does not.

**Fix:** Add an "Export CSV" button to the Students page header.

## 5. Guardian Data Export
Same gap as Students — no export on the Guardians page.

**Fix:** Add CSV export button.

## 6. Invoice Receipts for Parents
When a parent pays via the Pay dialog, there's no receipt generated. The `receipts` table exists but is never written to or displayed.

**Fix:** After a successful payment, auto-create a receipt row. Show receipt history in the parent dashboard and on InvoiceDetail.

## 7. Arrears Page — Missing Reminder Action
The Arrears page (`src/pages/Arrears.tsx`) lists overdue invoices but likely has no "Send Reminder" button to notify guardians about outstanding payments.

**Fix:** Add a "Send Reminder" button per row (or bulk) that dispatches overdue_reminder notifications to linked guardians.

## 8. Staff Detail — Missing Payroll History Tab
Staff detail page likely shows profile info but no payroll history for that specific staff member.

**Fix:** Add a "Payroll" tab showing all `payroll_run_items` for that staff member with net pay, deductions, and dates.

---

## Implementation Order

| Priority | Feature | Files |
|----------|---------|-------|
| 1 | Academic Period management (add/set current) | `SettingsPage.tsx` |
| 2 | Student class promotion | New `PromoteStudentsDialog.tsx`, `Students.tsx` |
| 3 | Bulk report card print | `ExamDetail.tsx` |
| 4 | Students & Guardians CSV export | `Students.tsx`, `Guardians.tsx` |
| 5 | Receipt generation & display | `PayInvoiceDialog.tsx`, `ParentDashboard.tsx`, `InvoiceDetail.tsx` |
| 6 | Arrears reminder notifications | `Arrears.tsx` |
| 7 | Staff payroll history tab | `StaffDetail.tsx` |

No new database tables are needed -- all tables already exist. This is purely frontend wiring and query work.

