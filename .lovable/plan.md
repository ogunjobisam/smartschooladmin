

# Gap Audit — Remaining Dead Ends & Missing Links

After reviewing the full codebase, here are the gaps that still exist:

---

## 1. Guardian rows are not clickable (dead end)
**File:** `src/pages/Guardians.tsx` (line 79)
- Rows have `cursor-pointer` class but no `onClick` handler — clicking a guardian does nothing.
- There is no Guardian Detail page at all.
- **Fix:** Create a `/guardians/:id` page with guardian info, linked children list, invoices across children, and documents tab. Wire up the row click.

## 2. PayrollRunDetail — missing payslip view & non-functional buttons
**File:** `src/pages/PayrollRunDetail.tsx`
- The `PayslipView` component was built but is never used here — no "View Payslip" button per staff row.
- "Export Bank Batch" button (line 89) has no `onClick` handler — does nothing.
- "Approve Payroll" and "Reject" buttons (lines 74-76) have no `onClick` handlers — dead ends.
- No Documents tab despite the plan calling for it.
- **Fix:** Wire up Approve/Reject mutations, add payslip view per row, implement bank batch CSV export using `exportToCsv`, add documents tab.

## 3. InvoiceDetail — no Documents tab, no Pay button
**File:** `src/pages/InvoiceDetail.tsx`
- No "Documents" tab for uploading payment evidence.
- No "Pay Now" button for online payment (admin side).
- "Download PDF" button just calls the same `handlePrint` — not a real download.
- **Fix:** Add Documents tab and Pay button similar to parent dashboard.

## 4. Sidebar footer menu items are dead ends
**File:** `src/components/layout/AppSidebar.tsx` (lines 229-230)
- "Profile" menu item does nothing (no onClick, no link, no profile page).
- "Switch School" menu item does nothing (school switching exists in TopBar but this menu item is disconnected).
- **Fix:** Link Profile to a profile page or settings, make Switch School functional or remove it.

## 5. Parent sidebar routes to wrong dashboard
- Parent role shows "Dashboard" linking to `/dashboard` which redirects to the admin Index page (which then redirects parents to `/parent`). This creates a redirect chain.
- **Fix:** Map parent's "Dashboard" to `/parent` directly.

## 6. Student Detail — no Attendance or Grades tabs
- Attendance and exam data exist but aren't shown on the student detail page.
- **Fix:** Add "Attendance" and "Grades" tabs to StudentDetail showing attendance history/percentage and exam scores/report cards.

## 7. Exams page — no link from exam to report cards
- Report cards can only be viewed from ExamDetail score grid, but there's no dedicated "Generate Report Cards" button or bulk print.
- **Fix:** Add bulk report card generation/download from ExamDetail.

## 8. Search button in TopBar is non-functional
**File:** `src/components/layout/TopBar.tsx` (line 30)
- The ⌘K search button is purely decorative.
- **Fix:** Either wire up a command palette (using existing `command.tsx` component) or remove the button.

---

## Implementation Order
1. **Guardian Detail page** + wire row clicks (highest visibility gap)
2. **PayrollRunDetail** — wire approve/reject, payslip view, bank export
3. **InvoiceDetail** — add documents tab and pay button
4. **StudentDetail** — add attendance + grades tabs
5. **Fix sidebar dead ends** (profile, switch school, parent dashboard route)
6. **TopBar search** — wire up or remove

This is a significant set of fixes. Shall I proceed with implementation?

