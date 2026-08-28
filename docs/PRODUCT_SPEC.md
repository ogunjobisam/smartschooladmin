# Smart School Admin — Product Specification

> This is the original product brief the application was built from. It describes the
> intended end state, not necessarily what ships today — see the README for what is
> currently implemented and `docs/USER_JOURNEYS.md` for a per-role breakdown.
> The brief refers to the product as "SchoolFlow"; it is now called Smart School Admin.

---

Build a production-ready multi-tenant SaaS web application called SchoolFlow.

Product vision:

SchoolFlow is a modern global school finance and operations platform for private schools and school groups. It is designed to replace archaic paper-based, spreadsheet-based and verbal processes with structured workflows, strong controls, audit trails and clear reporting. The product must work globally with minimal country limitations by using a strong global core plus configurable country-specific packs.

Primary users:

- Proprietor / Owner

- School Group Admin

- Principal

- Bursar

- Finance Officer

- HR / Admin Officer

- Teacher / Staff Viewer

- Parent / Guardian

Primary goals:

- Give school owners and leadership direct visibility into fees, payroll, staff, students and exceptions

- Create reliable fee billing and arrears controls

- Create reliable payroll workflows with payslips and payment batches

- Support multiple schools and campuses under one owner or group

- Allow country-specific payroll, currency, academic and reporting configuration

- Build a modern, clean, mobile-friendly experience for non-technical users

Important design principles:

- Modern, premium, trustworthy UI

- Clear dashboard-led experience

- Minimal clutter

- Role-based access throughout

- Multi-tenant by organisation and school

- Strong audit trail for important actions

- Approval workflows for sensitive actions

- Highly configurable without becoming messy

- Global-first architecture

- Secure backend logic for sensitive workflows

- Row-level security and tenant isolation

- All important actions should be logged

Tech expectations:

- Use Lovable best practices

- Use a proper database schema

- Use authentication and role-based access

- Use secure backend functions for sensitive operations

- Use storage for generated documents such as payslips and invoice PDFs

- Seed demo data for a school group with 2 schools and sample students, staff, invoices, payments and payroll runs

- Create sample dashboards with realistic charts, cards and tables

- Make the app responsive for desktop and tablet, and usable on mobile

Branding:

- Product name: SchoolFlow

- Tone: modern, reliable, professional, clear

- Colour direction: clean SaaS aesthetic, trust-building, suitable for schools and finance

- Use polished empty states, onboarding states and status badges

Build scope:

Build everything up to Phase 4 of the roadmap, including:

Phase 1: Nigeria-first, globally designed pilot

Phase 2: Generic private-school package

Phase 3: Country packs

Phase 4: Ecosystem integrations

========================================

CORE PLATFORM ARCHITECTURE

========================================

Create a multi-tenant hierarchy:

- organisation_groups

- schools

- campuses

Support:

- one proprietor owning multiple schools

- one school group with multiple campuses

- users assigned at group level, school level or campus level

- country and currency settings at organisation or school level

Create these core modules:

1. Authentication and user management

2. Role and permission management

3. Student and guardian management

4. Staff management

5. Academic structure management

6. Fee management

7. Invoicing and payments

8. Arrears control

9. Payroll and payslips

10. Approval workflows

11. Audit logs

12. Reporting and dashboards

13. Country settings and country packs

14. Notifications

15. Integrations hub

16. Parent portal

17. Document generation and storage

18. Settings and configuration

========================================

ROLES AND ACCESS CONTROL

========================================

Create these system roles:

- Super Admin

- Proprietor

- Group Admin

- Principal

- Bursar

- Finance Officer

- HR Admin

- Teacher Viewer

- Parent

Access rules:

- Super Admin can manage the entire platform

- Proprietor can see cross-school reports, approvals, exceptions, fees, payroll summaries and key dashboards

- Group Admin can manage multiple schools in the organisation

- Principal can manage school operations and review exceptions

- Bursar can manage fees, invoices, payments and payroll preparation

- Finance Officer can record payments and assist with payroll

- HR Admin can manage staff records and payroll profiles

- Teacher Viewer can view permitted student or class information only

- Parent can only view linked children, fee balances, invoices, receipts and selected communications

Enforce strict tenant isolation.

Parents must never see unrelated students.

School users must not see other schools unless explicitly authorised.

Sensitive payroll fields must be restricted to finance and approved leadership roles.

========================================

DATABASE / DATA MODEL

========================================

Create a clean scalable schema with these main entities:

Organisation and access:

- organisation_groups

- schools

- campuses

- users

- roles

- user_role_assignments

- permission_overrides

Academic:

- academic_years

- academic_periods

- classes

- enrolments

People:

- students

- guardians

- student_guardians

- staff

- staff_positions

- staff_bank_details

- staff_documents

Finance:

- fee_categories

- fee_schedules

- invoices

- invoice_items

- payments

- payment_allocations

- credits

- discounts

- waivers

- arrears_flags

- receipts

Payroll:

- payroll_profiles

- payroll_runs

- payroll_run_items

- payroll_adjustments

- payslips

- bank_batches

- bank_batch_items

Governance:

- approval_requests

- approval_steps

- exception_logs

- audit_logs

- locked_periods

Configuration:

- country_settings

- currencies

- notification_templates

- report_templates

- academic_templates

- payroll_rule_sets

- fee_rule_sets

Integrations:

- payment_gateways

- accounting_exports

- messaging_integrations

- bank_export_formats

- integration_logs

Portal and communications:

- parent_portal_access

- announcements

- communication_logs

- reminders

Use appropriate relationships, constraints and status fields.

Add created_at, updated_at and created_by style metadata where useful.

========================================

PHASE 1 - NIGERIA-FIRST, GLOBALLY DESIGNED PILOT

========================================

Build the initial pilot feature set for a private school in Nigeria, but architect it to be globally reusable.

Create these pages and flows:

1. Login and onboarding

- Login page

- Forgot password

- Invite user flow

- Initial tenant setup wizard

- Choose country

- Choose currency

- Create organisation and first school

- Create first academic year and term structure

2. Dashboard

Create tailored dashboards for:

- Proprietor

- Principal

- Bursar

- Finance Officer

Dashboard widgets should include:

- Total students

- Total active staff

- Fees billed this term

- Fees collected this term

- Outstanding fees

- Number of overdue students

- Payroll due this month

- Payroll paid this month

- Pending approvals

- Exceptions requiring review

- Payment trends

- School-by-school comparison where relevant

3. Student and guardian management

Build:

- Student list

- Student profile page

- Guardian list

- Guardian profile page

- Student-guardian linking

- Enrolment status

- Class assignment

- Emergency contact details

- Status badges such as active, inactive, suspended, withdrawn

4. Staff management

Build:

- Staff list

- Staff profile

- Position and department

- Salary setup

- Bank details

- Employment status

- Document upload placeholders

- Search, filter and export

5. Fee management

Build:

- Fee categories such as tuition, transport, books, feeding, boarding, uniforms, exam fees

- Fee schedule builder by term, class, school or student category

- Invoice generation

- Invoice detail pages

- Manual and bulk invoice generation

- Discounts and waivers

- Receipts

- Student account statement

- Outstanding balance summary

6. Payments

Build:

- Record payment manually

- Allocate payments to invoices

- Partial payments

- Overpayments as credits

- Payment methods such as cash, transfer, POS, online

- Payment history

- Downloadable receipt

- Daily collections view

- Cashier-style payment screen for bursar or finance officer

7. Arrears and controls

Build:

- Overdue balances dashboard

- Student arrears list

- Ageing buckets

- Threshold rules

- “Allow attendance despite arrears” exception flow

- Approval request for fee waivers and special arrangements

- Exception notes with reason and approver

- Automatic flagging of overdue accounts

8. Payroll

Build:

- Payroll profile per staff member

- Salary components

- Allowances

- Deductions

- Payroll run creation

- Payroll run preview

- Approval workflow for payroll

- Payslip generation

- Payment batch generation

- Payroll history

- Locked payroll after approval

9. Reporting

Build:

- Proprietor weekly summary

- Monthly fee collection report

- Outstanding fees report

- Payroll summary report

- Staff count report

- Student enrolment report

- Exceptions report

- Export to CSV and PDF where sensible

10. Audit and approvals

Build:

- Approval inbox

- Approval details page

- Audit log page

- Track who changed what and when

- Show changes to invoices, payments, waivers, salaries and payroll approvals

========================================

PHASE 2 - GENERIC PRIVATE-SCHOOL PACKAGE

========================================

Now generalise the app so it can be configured for many private schools beyond the pilot.

Add configuration and self-setup features:

1. School setup and configuration

- School profile

- Branding settings

- School logo

- Address and contact details

- Currency selection

- Date format

- Time zone

- Session / term / semester configuration

- Class naming configuration

- Student ID format configuration

- Invoice numbering configuration

- Receipt numbering configuration

2. Academic configuration

- Support terms, semesters and trimesters

- Support school-defined year groups and classes

- Support multiple campuses or branches

- Allow schools to define their own structure without code changes

3. Fee configuration enhancements

- Installment plans

- Penalty rules

- Scholarship rules

- Boarding/day student rules

- Optional fee items

- One-off charges

- Recurring charges

- Bulk fee assignment

- Template-based fee structures

4. Payroll configuration enhancements

- Monthly or other configurable pay frequency

- Custom earnings and deduction types

- Gross and net pay modes

- Employer notes

- Payslip branding

- Manual payroll pack if no statutory automation is available

- Bank payment schedule export

5. Parent portal

Build a parent-facing portal where linked parents can:

- View children

- View invoices

- View receipts

- View outstanding balances

- Download account statements

- View announcements

- See selected payment reminders

6. Notifications and reminders

Build:

- Fee due reminders

- Overdue payment reminders

- Payroll reminders

- Approval reminders

- In-app notifications

- Email-ready notification template framework

7. Better onboarding

Create a first-run setup wizard for new schools:

- Create school

- Choose country

- Choose academic model

- Create classes

- Create fee categories

- Add staff

- Import students

- Configure branding

- Set up payroll mode

8. Import tools

Add import flows for:

- Students

- Guardians

- Staff

- Fee schedules

- Opening balances

Make these friendly with sample CSV templates and error handling.

========================================

PHASE 3 - COUNTRY PACKS

========================================

Create a country-pack architecture so the core platform remains global while local rules are modular.

Build country pack support with:

- country selector

- country pack registry

- country-specific settings

- payroll rules

- default currencies

- default date formats

- default academic templates

- default invoice terminology

- report template variations

Create these initial country packs:

1. Nigeria Pack

2. UK Pack

3. Generic International Pack

Nigeria Pack should include:

- NGN as default currency

- Term-based private school default template

- Payroll rule configuration placeholders for PAYE and pension

- Nigerian bank-friendly payment batch fields

- Nigeria-oriented invoice and receipt wording

- Configurable fee categories common in Nigerian schools

UK Pack should include:

- GBP as default currency

- Term/academic year starter template

- Payroll rule placeholders for PAYE, NI and pension

- UK-style payroll and payslip field structure

- UK-oriented invoice and statement defaults

Generic International Pack should include:

- Flexible currency and date format

- Generic payroll mode with manual tax and deductions

- Generic academic structure

- Generic invoice and payroll terminology

Important:

Do not hardcode detailed tax logic yet unless needed to support the architecture.

Instead, build a rules framework and settings structure that can support country-specific formulas later.

The UI should clearly show when a payroll mode is fully automated versus manually configured.

========================================

PHASE 4 - ECOSYSTEM INTEGRATIONS

========================================

Build an integrations hub and foundational integrations architecture.

Create an Integrations page with cards, statuses, setup modals and logs for:

- Payment gateways

- Messaging integrations

- Accounting exports

- Bank export formats

Implement the following Phase 4 integration foundations:

1. Payment gateway framework

Support a pluggable payment integration model.

Create UI and backend structure for:

- Paystack

- Flutterwave

- Stripe

- Manual offline payments

Parents should be able to pay invoices through supported gateways where enabled.

Support:

- payment initiation

- webhook-ready payment confirmation flow

- payment reconciliation status

- gateway transaction log

2. Messaging integration framework

Create messaging provider support for:

- Email provider integration structure

- SMS provider integration structure

- WhatsApp-ready integration placeholder

Support:

- payment reminders

- overdue reminders

- announcement delivery

- payroll or approval alerts for staff where appropriate

3. Accounting export framework

Create export flows for:

- fee collections summary

- payroll summary

- invoice export

- payment export

Support:

- CSV export packs

- accounting mapping configuration

- export logs

4. Bank export framework

Create configurable bank export structures for payroll payment batches.

Support:

- downloadable bank payment schedules

- configurable export columns

- basic bank template selection by country or school

5. Integration logs and monitoring

Create:

- integration status indicators

- last sync / last export display

- failed webhook or failed export log

- retry action placeholders

- audit trail entries for integration actions

========================================

UI / UX REQUIREMENTS

========================================

Use a premium admin SaaS design style.

Key screens should include:

- Global top bar

- Left sidebar navigation

- Role-aware quick actions

- Search and filters

- Modern cards and tables

- Summary charts

- Status badges

- Empty states

- Confirmation modals

- Approval banners

- Clean form layouts

Important UI pages:

- Login

- Onboarding wizard

- Dashboard

- Students

- Student detail

- Guardians

- Staff

- Staff detail

- Fee schedules

- Invoices

- Invoice detail

- Payments

- Receipts

- Arrears

- Payroll runs

- Payslips

- Approvals

- Reports

- Audit logs

- Parent portal

- Settings

- Country packs

- Integrations

========================================

BUSINESS RULES

========================================

Enforce these rules:

- Every active student should have an enrolment and fee relationship

- Payments must be linked to a student and either allocated to an invoice or stored as credit

- Fee waivers and salary changes require approval

- Payroll runs cannot be marked paid until approved

- Payslips are generated only from approved payroll runs

- Old financial periods can be locked

- Sensitive changes must create audit logs

- Parents can only see their linked children

- Attendance-blocking or arrears-exception decisions must require explicit workflow and reason

- Country settings must influence defaults without breaking the global core

========================================

DEMO DATA

========================================

Seed realistic demo data for:

- One organisation group

- Two schools

- One campus each

- 100 students

- 20 staff

- Fee schedules for multiple classes

- Mixed paid and unpaid invoices

- Several overdue accounts

- One pending fee waiver approval

- One pending payroll approval

- Several completed payroll runs

- Sample receipts, payslips and reports

========================================

OUTPUT QUALITY

========================================

Do not build a toy prototype.

Build a structured, scalable SaaS application with realistic workflows, polished interfaces and strong internal logic.

Where full external integration is not possible, build the correct architecture, admin screens, statuses, placeholders, logs and workflow foundations so that the app is integration-ready.

Start by:

1. Creating the database schema and tenant model

2. Creating authentication and role structure

3. Creating the main shell and dashboard

4. Building Phase 1 features end-to-end

5. Then layering Phase 2 configuration features

6. Then country pack support

7. Then integrations hub and payment/messaging/accounting/bank integration foundations

After building, ensure there is seeded demo data and that the main user journeys work:

- Create student

- Generate invoice

- Record payment

- View outstanding balance

- Create payroll run

- Approve payroll

- Generate payslip

- Review proprietor dashboard

- Approve fee waiver

- Use parent portal

- Configure country pack

- Configure payment gateway

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://smartschooladmin.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/af2f82cb-fd9f-4ac2-8e61-8aa67cb14264).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
