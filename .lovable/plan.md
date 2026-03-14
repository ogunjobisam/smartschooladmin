

# SchoolFlow — Phase 1: Nigeria-First Pilot

## Overview
A multi-tenant school finance platform with real auth, core database tables, role-based dashboards, and the primary fee/payroll workflows. Built with the Institutional SaaS aesthetic from the design brief.

---

## 1. App Shell & Navigation
- **Sidebar layout** with Geist Sans/Mono typography, the deep navy + cool gray palette
- **Role-based navigation**: sidebar items visible based on user role (Proprietor, Principal, Bursar, Finance Officer, HR Admin, Parent)
- **Top bar** with org/school selector, notifications bell, user menu
- **Approval banner** (amber) shown when pending approvals exist
- **`Cmd+K` search** for quick student/staff lookup

## 2. Authentication & Tenant Setup (Supabase)
- Login, forgot password, password reset pages
- **Core Supabase tables**: `organisation_groups`, `schools`, `campuses`, `users`, `user_roles`, `user_role_assignments`
- RLS policies with `org_id` and `school_id` isolation
- Security-definer `has_role()` function
- First-run onboarding wizard: create org → school → choose country (Nigeria default) → currency (NGN) → academic year/terms

## 3. Role-Based Dashboards
- **Proprietor**: Total receivables (large mono figure + sparkline), fees billed vs collected, school-by-school comparison, pending approvals list, recent activity feed
- **Principal**: Student count, staff count, overdue students, exceptions needing review, attendance stats
- **Bursar**: Fees collected today, outstanding balances, payment trends chart, daily collections, overdue count
- **Finance Officer**: Recent payments, pending allocations, collection summary
- All dashboards use realistic mock data seeded for demo

## 4. Student & Guardian Management
- Student list with search, filters (class, status, enrolment), pagination (no infinite scroll)
- Student profile: personal info, guardian links, enrolment, class, fee account summary, status badges
- Guardian list and profile with linked children
- **Supabase tables**: `students`, `guardians`, `student_guardians`, `enrolments`, `classes`, `academic_years`, `academic_periods`

## 5. Staff Management
- Staff list with search, filters, export to CSV
- Staff profile: position, department, employment status, salary info, bank details (restricted by role)
- **Supabase tables**: `staff`, `staff_positions`, `staff_bank_details`

## 6. Fee Management & Invoicing
- Fee categories (tuition, transport, books, feeding, etc.)
- Fee schedule builder by term/class
- Invoice generation (individual and bulk)
- Invoice detail page with line items, status badges, payment history
- Discounts and waivers (with approval requirement)
- Student account statement view
- **Supabase tables**: `fee_categories`, `fee_schedules`, `invoices`, `invoice_items`, `discounts`, `waivers`
- All amounts stored as integers (kobo)

## 7. Payments & Receipts
- **Cashier split-screen**: student search (left) + quick payment form (right)
- Record payment: cash, transfer, POS, online
- Allocate to invoices, handle partial payments, overpayments as credits
- Payment history with downloadable receipts
- Daily collections view
- **Supabase tables**: `payments`, `payment_allocations`, `credits`, `receipts`

## 8. Arrears & Controls
- Overdue balances dashboard with ageing buckets (0-30, 31-60, 60+ days)
- Student arrears list with filters
- "Allow attendance despite arrears" exception flow with approval
- Fee waiver approval workflow
- Automatic flagging of overdue accounts
- **Supabase tables**: `arrears_flags`, `exception_logs`

## 9. Payroll (Mock Data + UI)
- Payroll profile per staff (salary components, allowances, deductions)
- Payroll run creation → preview → submit for approval → approve → mark paid
- Payslip generation (from approved runs only)
- Bank batch CSV export
- Payroll history, locked after approval
- **Tables created in Supabase** but populated with mock data: `payroll_profiles`, `payroll_runs`, `payroll_run_items`, `payroll_adjustments`, `payslips`, `bank_batches`

## 10. Approvals & Audit
- Approval inbox with type/amount/requester columns
- Approval detail page with approve/reject + reason
- Audit log page: who changed what, when, old/new values
- **Supabase tables**: `approval_requests`, `approval_steps`, `audit_logs`
- Audit entries created for invoice, payment, waiver, salary, and payroll changes

## 11. Reports
- Proprietor weekly summary
- Monthly fee collection report
- Outstanding fees report
- Payroll summary
- Student enrolment report
- Exceptions report
- Export to CSV, PDF placeholder

## 12. Demo Data Seed
- 1 organisation group, 2 schools, 1 campus each
- ~100 students across classes, 20 staff
- Fee schedules for multiple classes
- Mix of paid/unpaid/overdue invoices
- 1 pending fee waiver approval, 1 pending payroll approval
- Completed payroll runs with payslips
- Sample receipts and audit log entries

## Design Standards
- Geist Sans UI / Geist Mono for figures and IDs
- `tabular-nums` on all currency and date fields
- Deep navy primary, action blue accent, cool gray background
- 10px outer / 6px inner radius
- No delete on financials (void/reverse only)
- No modals for complex forms (full pages)
- Explicit pagination on all tables
- Success toasts include entity IDs
- Status badges: Paid (green), Pending (amber), Overdue (red), Void (gray)

