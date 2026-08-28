# User journey analysis

What each of the eleven roles can actually do, end to end, and where the journey
still stops short. Written by walking every route in the app against the
row-level security policies behind it.

Status keys used below: **Works** · **Fixed** (was broken, repaired in this
pass) · **Gap** (still missing).

---

## Summary

The app covers student, guardian, staff, fee, invoice, payment, arrears,
payroll, attendance, exam, announcement and approval management across a
multi-school organisation, with row-level security isolating every tenant.

Before this pass, four journeys ended in a wall rather than an outcome:

| Journey | What happened | Now |
| --- | --- | --- |
| HR admin runs payroll | "New Payroll Run" had no click handler, and nothing in the app ever created a payroll run or set a salary | Fixed |
| Teacher marks a full-attendance register | Save only appeared after toggling a student, so "everyone present" could not be saved | Fixed |
| Anyone uploads a document | Storage policy allowed only proprietor and group admin, while the button showed for every staff role | Fixed |
| Parent pays an invoice | The button errored under RLS, and the flow let the payer mark their own invoice paid | Fixed (removed; see Parent below) |

Two confidentiality problems were also closed: parents could read the whole
school's records, and uploaded student documents sat in a public bucket.

---

## Proprietor / Owner

**Entry:** signs up → onboarding creates the organisation, first school,
academic year, terms and classes → dashboard.

| Step | Status |
| --- | --- |
| Create organisation and school | Works |
| Seed demo data to explore | Works |
| Cross-school view via Group Overview | Works |
| Approve fee waivers and salary changes | **Fixed** — approving a salary change now applies it to the payroll profile and writes an audit entry. It previously only flipped a status field |
| Read the audit log | Works |
| Enable the AI add-on | New |
| Delete all school data | **Fixed** — any proprietor could previously wipe *another* organisation's school |
| Add a second school | Works |

**Gap:** no way to move a user between schools, and no organisation-level
dashboard of unpaid fees across schools (Group Overview shows counts, not a
consolidated arrears position).

---

## Group Admin

Same surface as the proprietor minus organisation deletion. **Works.**

**Gap:** cannot enable the AI add-on (proprietor and group admin can; deliberate)
— documented here because it is easy to mistake for a bug.

---

## School Admin

| Step | Status |
| --- | --- |
| Add students, guardians and staff | Works |
| CSV import for students and staff | Works |
| Configure classes, subjects, fee categories, terms | Works |
| Upload a student or staff document | **Fixed** — was an RLS denial |
| Invite colleagues | Works |
| Upload the school logo | **Fixed** — the storage policy excluded school admins |
| Reach Settings | Works |

**Gap:** no bulk guardian import, and no way to merge duplicate student records
created by a bad import.

---

## Principal

| Step | Status |
| --- | --- |
| See school-wide dashboard | Works |
| Review attendance and exam results | Works |
| Class performance analysis | New |
| Approve requests | Works |
| Review arrears | Works |

**Gap:** cannot see payroll, by design, but also cannot see total staffing cost,
which most principals are accountable for.

---

## Bursar

| Step | Status |
| --- | --- |
| Create fee schedules | Works |
| Generate invoices in bulk | **Fixed** — the function accepted any school id from any authenticated caller |
| Record a payment and allocate it | Works |
| Issue a receipt | Works |
| Chase arrears with reminders | Works |
| Run payroll | **Fixed** — see below |
| Export a bank batch | **Fixed** — depended on bank details nothing could create |

**Gap:** payments are recorded manually. There is no gateway integration, so
reconciliation against a bank statement is still a spreadsheet job.

---

## Finance Officer

Records payments and views invoices and arrears. **Works.**

**Gap:** cannot see the fee schedules that generated the invoices they are
collecting against, which makes queries hard to answer.

---

## HR Admin

This was the most broken journey in the app.

| Step | Before | Now |
| --- | --- | --- |
| Add a staff member | Worked | Works |
| Set their salary | **Impossible** — nothing in the app ever wrote a payroll profile | Salary and bank details editor on the staff record |
| Record bank details | **Impossible** | Same editor |
| Create a payroll run | **Impossible** — the button had no handler | Dialog previewing every active staff member's pay, warning on a duplicate period, and naming who is excluded for having no salary |
| Approve and pay a run | Worked, but only on seeded data | Works |
| Generate payslips | Worked, but only on seeded data | Works |
| Request a salary change | Button only appeared once a profile existed, which nothing could create | Works |

**Gap:** no payroll history comparison term to term, and no statutory
deductions beyond a flat pension and tax rate.

---

## Teacher

| Step | Status |
| --- | --- |
| Mark attendance | **Fixed** — a full-present register could not be saved, and saving deleted the day's records before re-inserting them |
| Enter exam scores | Works |
| See class performance | New |
| Print report cards | Works |
| Read announcements | Works |
| Open /payroll or /settings by URL | **Fixed** — every route except /users was previously unguarded |

Teachers are now assigned to classes under **Settings → Classes**, and see only
the students, registers and results of those classes. Note this is
correct-by-default rather than permissive-by-default: a teacher with nothing
assigned sees nothing, so after deploying, admins must assign classes. Every
affected screen says so rather than showing a bare empty page.

---

## Parent / Guardian

| Step | Status |
| --- | --- |
| Sign in after invite | Works |
| See their children | Works |
| See invoices and balances | Works |
| See their children's results and attendance | New |
| See their children's bus route, stop and pickup time | New |
| See upcoming events and the school's notices | New |
| Print an invoice | Works |
| Pay online | **Removed** — see below |
| Read the whole school's invoices, staff records and other families' contact details | **Fixed** — this was possible |

**On payment.** The pay flow records the payment from the browser: it inserts
the payment, allocates it and marks the invoice paid, with no gateway
verification. That is acceptable for a bursar entering a payment they have
already received, and unacceptable as a parent-facing action — it would let a
parent mark their own fees paid. RLS denied the writes anyway, so the button only
ever produced an error. Parents now get a printable invoice and instructions.
Re-enabling this needs a server-side flow that records a payment only after the
gateway confirms it.

**Gap:** no way for a parent to update their own contact details, and no
notification when a new invoice is issued.

---

## Student

The eleventh role, added in this pass. A school decides whether students get
logins at all: nothing happens until someone presses **Invite to portal** on the
student's record.

| Step | Status |
| --- | --- |
| Sign in after invite | New |
| See their own results and performance | New |
| See their own attendance | New |
| See their own invoices and print one | New |
| See their bus route, events and notices | New |
| See any other student, or anything about the school's finances | Denied by RLS |

`has_role` was also corrected so that super_admin no longer matches `student` —
without that, a platform admin would have satisfied every student-scoped policy.

**Gap:** a student cannot update their own details, and there is no in-portal
timetable.

---

## Super Admin

Full access across the platform. **Works.**

**Gap:** `has_role` grants super_admin every role except parent, but there is no
cross-organisation view, so a super admin is still confined to the organisation
on their `user_roles` row.

---

## Cross-cutting fixes in this pass

**Tenant isolation.** Every privileged edge function runs with the service role
key and bypasses RLS, and none of them checked that the `org_id` and `school_id`
in the request body belonged to the caller. One let any proprietor delete another
school's entire records. All now verify ownership before writing.

**Stale policy names.** A hardening migration dropped two policies by names that
never existed, so the permissive originals survived. Because PostgreSQL combines
permissive policies with `OR`, the tighter replacements had no effect: any
proprietor could read and re-role users in any organisation, and any staff member
could read salary change requests.

**Route authorisation.** Only `/users` checked a role. The sidebar and router now
share one access map, with a test asserting the sidebar can never offer a link
the router would refuse.

**Crash on the parent dashboard.** Three `useQuery` hooks sat after a conditional
return, so the hook count changed once the role resolved and the page crashed for
every parent.

---

## Ideas worth taking from BLMS

[blmsportal.com/blms](https://blmsportal.com/blms/) is a single-school site and
portal for a Nigerian Montessori school. What it does that this product does not:

| Idea | Status | Where it landed |
| --- | --- | --- |
| **Admissions funnel** — apply, capture the enquiry, move it through a pipeline | Built | Public form at `/apply/<slug>`, an `admissions` edge function as the only writer, `/admissions` for the office, and one-step conversion to a student |
| **Student portal and student role** | Built | `student` app role, `students.user_id`, `/student`, invited from the student record |
| **Public page with managed notices** | Built | Notices with a publish flag and a date window, shown on the public application page and in both portals. Not a full website — the public surface is the admissions page |
| **Age-banded sections** — Toddler, Nursery, Primary, Secondary | Built | `school_section` on classes, picked during onboarding, backfilled from existing class names, and used to sort every class picker |
| **Events calendar** | Built | `/events` with a per-audience setting, surfaced as Upcoming on the dashboard and both portals |
| **Transport / bus service** | Built | Routes, ordered stops, per-term fee with a per-student override, and a rider card on the family's portal |
| **Mobile app for parents** | Built | Installable: manifest, icons, an install bar, and a small service worker that never caches the API |
| **Entrance assessment scheduling** | Partial | The funnel has an **Interview** stage with notes, but no scheduling or calendar invite |
| **SMS to parents** | Parked for v2 | Deliberate: email sends through Resend once configured; SMS queues and is reported undelivered rather than dropped |
| **Clubs, sports, ICT and library** | Not built | Co-curricular records feed report cards and parent engagement |

The two highest-value ones are done: admissions brings revenue in, and the
student portal doubles the engaged audience without new data.

---

## Known gaps, ranked

1. **Online fee payment** — the pay flow is client-side and unverified. Needs a
   server-side gateway integration before any parent-facing payment is enabled.
2. **Payment providers are placeholders** — `src/lib/payment-providers.ts` builds
   checkout URLs but never calls Paystack or Flutterwave.
3. **SMS has no provider.** Email now sends through Resend once configured, and
   invites always show a copyable set-password link. SMS still queues without
   delivering — it is reported rather than dropped, but a Nigerian pilot will
   want a provider (Termii, Africa's Talking) wired into
   `process-message-queue`.
4. **Entrance assessments are not scheduled.** The funnel records that an
   interview stage was reached and what was said, but nothing books a date or
   tells the family.
5. **The public surface is one page.** A school with no website gets an
   admissions page with notices, not a site. Anything beyond that — history,
   staff profiles, a gallery — is still missing.
6. **Transport fees are not invoiced automatically.** The per-term fee and the
   per-student override are recorded, and invoice generation does not yet pick
   them up as a line.
7. **`any` in view code** — none left. `noImplicitAny` is on and `npm run
   typecheck` fails on a reintroduction.
