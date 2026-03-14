

# SmartSchool Admin — Commercial Readiness Features Plan

This is a large scope covering 5 major feature areas. To keep the build manageable and avoid breaking existing functionality, the work is organized into phases that can be implemented sequentially.

---

## Phase 1: Database Schema Changes

Create new tables via migrations for all five features:

**Notifications**
- `notifications` — id, org_id, school_id, user_id, type (enum: invoice_generated, payment_received, overdue_reminder, guardian_invite, staff_invite, payroll_pending, approval_result), title, message, entity_type, entity_id, is_read, created_at
- `notification_preferences` — id, user_id, notification_type, channel_in_app (bool default true), channel_email (bool default false), channel_sms (bool default false)

**Online Payments**
- `payment_transactions` — id, school_id, student_id, invoice_id, amount, gateway (enum: paystack, flutterwave, manual), gateway_reference, status (enum: initiated, pending, successful, failed, reversed), payer_name, payer_email, metadata (jsonb), created_at, updated_at
- `receipts` — id, school_id, payment_id, payment_transaction_id, receipt_number, student_id, amount, issued_at, issued_by

**Documents**
- `document_files` — id, org_id, school_id, entity_type (student/staff/guardian/invoice/payroll_run), entity_id, file_name, file_url, file_size, category, notes, uploaded_by, created_at

**Payroll Enhancements**
- `salary_change_requests` — id, staff_id, school_id, requested_by, field_changed, old_value, new_value, reason, approval_request_id, status, created_at

**Payment provider config** (stored in `organisation_groups` or a new `payment_gateway_config` table)
- `payment_gateway_config` — id, org_id, provider (paystack/flutterwave), is_active, public_key, created_at

All tables get appropriate RLS policies following existing patterns (org-scoped, role-restricted write, broader read).

Enable realtime on `notifications` table.

---

## Phase 2: Notifications Module

**Components & Pages:**
- `src/components/notifications/NotificationBell.tsx` — Bell icon with unread count badge in TopBar, dropdown showing recent notifications with mark-as-read
- `src/components/notifications/NotificationItem.tsx` — Single notification row component
- `src/pages/NotificationHistory.tsx` — Full notification list page for admins with filters
- Add "Notifications" tab to Settings page for managing notification preferences

**Service Layer:**
- `src/lib/notifications.ts` — Helper to create notifications via Supabase insert, with audience targeting (role-based, user-specific, parent-scoped to linked students)
- Realtime subscription in NotificationBell for live updates

**Integration Points:**
- Call notification creation from existing flows: invoice generation, payment recording, approval status changes, invite sends
- Sidebar: add notification entry for admin roles
- TopBar: add NotificationBell component

**RBAC:** Parents only see notifications where user_id matches or entity relates to their linked students. Admins see org-scoped notifications.

---

## Phase 3: Online Payment Integration

**Architecture:**
- `src/lib/payment-providers.ts` — Abstract provider interface with Paystack and Flutterwave implementations (mock mode by default)
- `supabase/functions/initiate-payment/index.ts` — Edge function to create payment transaction, generate gateway checkout URL (or mock URL)
- `supabase/functions/payment-webhook/index.ts` — Edge function to receive gateway callbacks, update transaction status, allocate payment to invoice, generate receipt, create notification

**UI Changes:**
- Parent Portal (`ParentDashboard.tsx`): Add "Pay Now" button on each unpaid/partially paid invoice row, opening a payment dialog
- `src/components/payments/PayInvoiceDialog.tsx` — Select full/partial amount, choose gateway, initiate payment
- `src/components/payments/PaymentStatusBadge.tsx` — Visual status for transaction states
- Invoice Detail page: Add payment transaction history section and receipt download
- Payments page: Add gateway transaction tab/filter alongside manual payments
- Receipts: auto-generated after successful payment, printable view
- Settings: Add "Payment Providers" tab with gateway config placeholders (public key input, active toggle)

**Mock Mode:** When no gateway credentials configured, simulate successful payment after 2-second delay for demo purposes.

---

## Phase 4: Proprietor Reporting Dashboard

**New Page:**
- `src/pages/ProprietorDashboard.tsx` — Restricted to super_admin, proprietor, group_admin

**KPIs (cross-school aggregation):**
- Total students, staff, invoiced, collected, outstanding, overdue count/value, current payroll total, pending approvals

**School Comparison:**
- Table/cards showing per-school breakdown of key metrics

**Charts (using existing recharts):**
- Collections over time (line/bar)
- Outstanding fees trend
- Student growth trend
- Payroll trend

**Filters:**
- Date range, school selector, academic year/period

**Exception Insights:**
- High arrears schools
- Aging buckets (0-30, 31-60, 60+)
- Pending salary changes
- Rejected approvals

**Export:** CSV export and print-friendly view using existing `exportToCsv` and print utilities.

**Navigation:** Add "Group Overview" link in sidebar Operations section for proprietor/super_admin/group_admin roles.

---

## Phase 5: Payroll Outputs & Salary Admin

**Payslip Generation:**
- `src/components/payroll/PayslipView.tsx` — Printable payslip component with staff details, period, salary breakdown, payment reference
- Add "View Payslip" / "Print Payslip" button per staff row in PayrollRunDetail
- Bulk print/download all payslips for a run

**Bank Export:**
- Wire up existing "Export Bank Batch" button in PayrollRunDetail to generate CSV with account details (bank_name, account_number, account_name, net_pay, reference)

**Salary Change Requests:**
- `src/components/payroll/SalaryChangeDialog.tsx` — Request form (field, old value, new value, reason)
- Creates approval_request + salary_change_request records
- On approval, auto-update payroll_profiles
- Show pending salary changes on StaffDetail page

**Payroll Summary Document:**
- Printable summary view of payroll run totals

**Audit:** All payroll actions logged to audit_logs.

---

## Phase 6: Document & File Management

**Components:**
- `src/components/documents/DocumentsTab.tsx` — Reusable tab component showing uploaded files for any entity
- `src/components/documents/UploadDocumentDialog.tsx` — Upload dialog with category, notes, file picker

**Storage:** Use existing `school-assets` bucket with path convention: `{school_id}/documents/{entity_type}/{entity_id}/{filename}`

**Integration Points:**
- Add "Documents" tab to: StudentDetail, StaffDetail, InvoiceDetail, PayrollRunDetail
- Guardian documents accessible from guardian detail (if exists) or student detail
- Payment evidence upload on RecordPayment page

**RBAC:** Role-based access — finance roles see invoice/payment docs, HR sees staff docs, parents see only their children's docs. Delete restricted to uploaders + admins.

**Audit:** Document uploads and deletes logged to audit_logs.

---

## Cross-Cutting Changes

**Sidebar Updates:**
- Add "Group Overview" under Operations for proprietor+
- Add "Notifications" link or rely on TopBar bell
- Update `roleNavAccess` accordingly

**Routes (App.tsx):**
- `/proprietor-dashboard` — ProprietorDashboard
- `/notifications` — NotificationHistory

**Existing Flows Preserved:**
- Manual payment recording unchanged
- Current payroll run logic untouched
- All existing RLS policies remain

---

## Implementation Order

Given the scope, I recommend implementing in this order:
1. **All database migrations** (single batch)
2. **Notifications** (foundation for other features to emit events)
3. **Documents** (self-contained, adds value quickly)
4. **Payroll enhancements** (extends existing payroll)
5. **Online payments** (most complex, needs edge functions)
6. **Proprietor dashboard** (depends on data from other features)

This is a very large build. Shall I proceed with implementation starting from the database migrations and notifications module?

