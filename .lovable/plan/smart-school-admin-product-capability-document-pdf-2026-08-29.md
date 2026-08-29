# Smart School Admin — Product Capability Document (PDF)

Produce a polished, investor/internal-facing **PDF** that documents every feature in the app, with a short paragraph plus key workflows and rules per module. Output: `/mnt/documents/SmartSchoolAdmin_Product_Document.pdf`.

## Approach

1. **Gather feature inventory** (read-only, already mostly known from project memory + codebase):
   - Confirm module list against `docs/PRODUCT_SPEC.md`, `docs/USER_JOURNEYS.md`, `docs/USER_GUIDE.md`, `src/pages/`, and project memory so nothing built is missed.
2. **Author content** — for each module: what it does, who uses it (persona), key workflows, business rules/edge cases.
3. **Generate PDF** with ReportLab (Platypus): cover page, table of contents, styled sections, tables for role matrix and module summaries. DejaVu font registered for safety.
4. **Visual QA** — convert every page to an image (`pdftoppm`), inspect each page, fix layout issues, re-verify.

## Document structure

1. **Cover page** — product name, tagline, date, "Product Capability Overview".
2. **Executive summary** — what the platform is, multi-tenant architecture (Org Group → School → Campus), Africa-first/global design, tech stack (React/TypeScript + Lovable Cloud backend with RLS).
3. **Roles & access control** — 10-level rank hierarchy table (super_admin → parent), multi-role support, student-role incompatibility, workspace picker for multi-school users, role-change audit logging.
4. **Core platform** — onboarding wizard, country packs/presets, per-school branding, command palette, PWA, demo sandboxes (4-hour self-destructing).
5. **Module chapters** (one section each, paragraph + workflow bullets + rules):
   - Students & Guardians (enrolment, profiles, auto student IDs with configurable format, bulk import, promotion, status lifecycle incl. graduated/expelled, documents, photos/ID cards)
   - Staff & HR (profiles, payroll profiles, documents, staff IDs, invites)
   - Attendance (daily per-class marking, 4 statuses, summaries)
   - Exams & Grades (subjects per class, rubric editor, score entry, report cards, transcripts, performance analytics)
   - Finance (fee schedules, invoicing, payments, receipts, arrears & ageing, statements of account, fee reminders, printable letters for guardians without email)
   - Payroll (runs, approval workflow, payslips, bank CSV export)
   - Admissions funnel (public application form, conversion to enrolment)
   - Events & calendar (RSVPs, ICS feed, add-to-calendar)
   - Transport (routes, riders, billing)
   - Achievement Wall (recognitions, appointments/prefects, publish workflow, certificates with photos)
   - Notifications & Communications (3-channel dispatcher, templates with defaults, per-user preferences, quiet hours/frequency, delivery tracking & retry, announcements incl. pinned banners and scheduled/perpetual modes)
   - Approvals & Audit (approval inbox/workflows, full audit log)
   - Parent & Student Portals (invoices, receipts, achievements, events, statement downloads — own data only)
   - AI Insights (5 free analyses/month, add-on gating)
   - Reporting & Dashboards (proprietor group overview, exports, CSV)
   - Settings & Configuration (ID formats, notices, sections, academic periods)
6. **Security & data isolation** — org-scoped RLS, tenant boundaries, destructive-action confirmations, demo data isolation.
7. **Roadmap / integration readiness** — payment providers (Paystack/Flutterwave, mock mode), email/SMS provider hooks, accounting/bank export frameworks.

## Technical details

- Tool: Python + ReportLab Platypus (A4, styled headings, TOC, tables, header/footer with page numbers).
- Brand cues taken from the app's design tokens (check `src/index.css`).
- QA: `pdftoppm -jpeg -r 150` on all pages; inspect each image for overflow, clipping, orphaned headings, table misalignment; iterate until clean. QA images go to `/tmp`, never `/mnt/documents`.
- No app code, migrations, or config changes — this is a document deliverable only.
