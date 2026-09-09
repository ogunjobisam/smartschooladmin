# Fix the payroll run lifecycle, then close other dead ends

## The payroll problem (confirmed)

A new run is created with status **draft**, but the run page only shows buttons when the status is **pending**. Nothing in the app ever moves a run from draft to pending, and there is no delete, no edit, and no "mark as paid". So every draft run is a dead end: it sits in the list forever and can never be paid or removed.

The statuses the system already supports are: draft, pending, approved, paid, rejected.

## The payroll flow to build

```text
draft ──submit for approval──> pending ──approve──> approved ──mark as paid──> paid
  │                              │
  │                              └──reject──> rejected ──reopen──> draft
  └──edit / delete
```

On the run page, show only the actions that make sense for the run's current state:

- **Draft**: "Submit for approval", "Recalculate from current salaries" (refreshes every payslip line and the totals from staff salary profiles), and "Delete draft" (with a confirm step, since it removes the run and its payslips).
- **Pending**: "Approve" and "Reject" (kept as today), plus "Return to draft" so a mistake can be corrected instead of rejected. Approve/Reject stay limited to people who can approve.
- **Approved**: "Mark as paid" with the payment date, and the bank batch export stays available.
- **Paid**: locked — no edits, payslips and export still viewable.
- **Rejected**: "Reopen as draft".

Also on the run page:
- A short history line: created by/when, submitted, approved by/when, paid on.
- Remove an individual staff member from a draft run (someone on leave shouldn't be paid), with totals recalculated.
- Payroll runs list: show a per-row action menu (open, submit, delete draft) so actions don't require opening the run first, and add a status filter.

Approval trail: submitting a run also raises an entry in Approvals (type "payroll run") so approvers see it in one place, and approving/rejecting there keeps the run in step with it.

## Other dead ends found in the same sweep (confirmed by reading the code)

| Area | Missing |
|---|---|
| Invoices | No way to void or delete a wrongly issued invoice; no cancel of a draft |
| Exams | No delete, and results can be published but never un-published to correct a mistake |
| Fee schedules | Created but can never be edited or removed |
| Students / Staff / Guardians | Can be added and edited, but never archived or removed |
| Salary change requests | Raised, but the requester can't withdraw one |

Fixes follow the same shape as payroll: state-appropriate actions, confirm steps on anything destructive, and locked records once money has moved (a paid invoice is voided, never deleted).

Order of work: payroll first and fully, then invoices, exams, fee schedules, then people records.

## Technical notes

- `src/pages/PayrollRunDetail.tsx`: replace the single `status === "pending"` block with a status-driven action set; add mutations for submit, return to draft, mark paid, delete (items then run), recalculate (re-derive lines from `payroll_profiles` via `calculatePayrollLine`/`sumPayrollLines` and rewrite `payroll_run_items` plus run totals), and remove-item.
- Guard actions by role using the existing helpers in `src/lib/access.ts`; RLS already limits `payroll_runs`/`payroll_run_items` writes to proprietor, bursar and hr_admin, so approve/reject stays with proprietor/principal-level roles in the UI.
- `payroll_runs` needs a `paid_at` (and optional `submitted_at`) column; a migration adds them, nullable, no data change.
- Reuse `approval_requests` (`approval_type` already includes `payroll_run`) for the submit step; wire the Approvals page so approving a payroll-run request updates the run, mirroring the existing `applySalaryChange` pattern.
- Invalidate `payroll-run`, `payroll-run-items` and `payroll-runs` query keys after each transition.
- Destructive steps use an AlertDialog confirm; deletes remove child rows first.
