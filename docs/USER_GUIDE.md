# Smart School Admin — User Guide

Everything a school needs to run the system, from first sign-in to the end of
term. Written for the people doing the work rather than the people who built it.

---

## Contents

1. [Before you start](#before-you-start)
2. [Setting up your school](#setting-up-your-school)
3. [Admissions](#admissions)
4. [Students and guardians](#students-and-guardians)
5. [Staff](#staff)
6. [Fees and invoicing](#fees-and-invoicing)
7. [Payments and receipts](#payments-and-receipts)
8. [Arrears](#arrears)
9. [Attendance](#attendance)
10. [Exams and report cards](#exams-and-report-cards)
11. [Academic performance](#academic-performance)
12. [Payroll](#payroll)
13. [Approvals](#approvals)
14. [Announcements and notifications](#announcements-and-notifications)
15. [Events, notices and your public page](#events-notices-and-your-public-page)
16. [Transport](#transport)
17. [The parent portal](#the-parent-portal)
18. [The student portal](#the-student-portal)
19. [Reports](#reports)
20. [AI Analysis (add-on)](#ai-analysis-add-on)
21. [Installing the app on a phone](#installing-the-app-on-a-phone)
22. [Who can do what](#who-can-do-what)
23. [When something looks wrong](#when-something-looks-wrong)

---

## Before you start

**What you need:** an email address and a browser. Nothing to install.

**The shape of the system.** One *organisation* owns one or more *schools*. Each
school has *classes*, and each class has *students* enrolled in it **for a
particular term**. That last part matters more than it sounds — see
[When something looks wrong](#when-something-looks-wrong).

Money follows a chain: a **fee schedule** says what a class pays for a term →
**invoices** are generated from it → **payments** are recorded against invoices →
anything unpaid becomes **arrears**.

---

## Setting up your school

### First sign-in

Sign up, then the onboarding wizard walks you through four steps:

| Step | What you are creating |
| --- | --- |
| **Organisation** | Your school group's name, country and currency. Currency is used everywhere and is worth getting right first time. |
| **School** | Your first school and its main campus. |
| **Classes** | The class names you use — JSS1, Primary 4, Nursery 2. Defaults are Nigerian secondary; replace them if you run primary or nursery years. |
| **Academic year** | The year and its terms. |

Tick **seed demo data** if you want a populated system to explore first. You can
clear it later from **Settings → General → Danger Zone**.

### Then, before anyone else logs in

Work through **Settings**:

- **Classes** — add any missing classes, and **assign teachers to each one**.
  This is not optional: a teacher sees only the students, registers and results
  of classes they are assigned to. A teacher with nothing assigned sees nothing.
- **Subjects** — create subjects, then assign them to classes. Exams pull their
  subject list from here.
- **Fee categories** — Tuition, Books, Transport, and so on.
- **Academic years** — check the right term is marked **Current**. Only one term
  is current at a time across the whole organisation.
- **Branding** — your logo and colours. The logo appears on the login page and on
  printed invoices, receipts and payslips.

### Inviting colleagues

**Users → Invite user.** Choose their role (see [Who can do what](#who-can-do-what)),
and the school if they work at one school only.

After inviting, a dialog shows a **set-password link**. The invite is also queued
as an email, but until your school has an email provider configured that queue
does not send. **Copy the link and send it to them** — their account cannot be
used until they set a password.

---

## Admissions

Applications arrive on their own instead of by WhatsApp, and every one of them
sits in a list with a status you can move.

### Turning it on

**Settings → Admissions.**

1. Check the **application link**. It is `yourdomain/apply/your-school` and you
   can change the last part to anything not already taken.
2. Turn **Accepting applications** on. With it off the page still loads, but it
   tells families to contact the school instead of taking their details.
3. Write a line or two under **What the page says** — the session you are
   admitting for, the sections you have places in.
4. **Copy** the link and put it wherever families look: WhatsApp status, your
   Facebook page, the school gate, a flyer.

### What a family sees

One page. The child's name, date of birth, the section they are applying for
(the form suggests one from the date of birth, and they can change it), the
present school, and how to reach the parent. Nothing to sign up for, no account
to create.

When they submit they get a **reference** like `APP-2026-00042`. That is what
they quote when they ring, and it is the first column in your list.

### Working the list

**Admissions** shows six counts across the top — New, Reviewing, Interview,
Offered, Accepted, Enrolled. Click any of them to filter.

Click a row to open the application. You get everything they submitted, a box
for your own notes (interview date, what was agreed, why the decision went the
way it did) and buttons to move the status.

An application nobody has touched for a week gets a red clock beside it. That is
the whole point of the list: applications stop being invisible.

### Turning an accepted applicant into a student

When a family has accepted a place, open the application and press **Enrol as a
student**. Pick the class, optionally give an admission number, and decide
whether to create a guardian record for the parent (untick this if they already
have one — a second child in the same family).

That creates the student, the enrolment for the current term and the guardian
link in one step, then takes you to the new student's record. It is the only way
an application reaches **Enrolled**: the status buttons deliberately do not offer
it, so the funnel can never claim a child is on the roll when no student record
exists.

You need a current academic term set before this will work. **Settings →
Academic Years.**

---

## Students and guardians

### Adding one student

**Students → Add Student.** Name and class are required. You can add a guardian
in the same form — tick *Add guardian*, and they are created and linked in one go.

Adding a student enrols them in the class you chose, **for the current term**.

### Importing many students

**Students → Import CSV.**

1. Drop in your CSV. The first row must be a header row.
2. Check the column mapping. Common headers are matched automatically —
   `firstname`, `surname`, `dob`, `studentid` all work.
3. Review the preview. Rows with errors are flagged and skipped.
4. **Choose the class to enrol them into.** This is required. Students imported
   without a class exist but belong to nowhere, and never appear in attendance
   or exams.

Guardians are not imported. Add or link them afterwards from each student's
record.

### Linking guardians

Open a student → **Guardians** tab → link an existing guardian or create a new
one. Mark one as primary — that is who fee reminders go to.

To give a guardian access to the parent portal, open the guardian and choose
**Invite to portal**. Same as staff invites: copy the link and send it to them.

### Moving students up a year

**Students → Promote.** Pick the class they are leaving, the class they are
joining, and the term to enrol them into. This creates new enrolments; the old
ones stay as history.

Run this at the start of each term or year. Until you do, the new term's class
registers are empty.

---

## Staff

**Staff → Add Staff** or **Import CSV**. Adding a staff member with a login role
also sends them an invite.

Each staff record has:

- **Profile** — contact details, position, department
- **Salary & Payroll** — salary breakdown and bank details (finance and HR roles only)
- **Payslips** — every payroll run they appeared in
- **Documents** — contracts, certificates, identification

### Setting up someone's pay

Open the staff member → **Salary & Payroll** → **Set Up Salary**.

Enter basic salary and any allowances, plus pension and tax rates. The panel
shows the resulting net pay as you type. **Pension is charged on basic salary,
tax on gross.**

Add bank details in the same dialog. Without them the staff member is left out of
the payroll bank batch export.

Staff with no salary set up are skipped by payroll runs — the run dialog names
them so you can spot the omission before you approve anything.

### Changing a salary

Use **Request Salary Change** rather than editing directly. It creates an
approval request; once a proprietor approves it, the change is applied to the
payroll profile automatically and written to the audit log.

---

## Fees and invoicing

### Fee schedules

**Fee Schedules → New Schedule.** A schedule is *what one class pays for one
term*: a name, a class, a term and an amount.

Make one per class per term. A schedule with no class applies to every active
student in the school.

### Generating invoices

**Invoices → Generate Invoices.** Pick a fee schedule and a due date.

Every student enrolled in that class for that term gets an invoice. Students who
already have an invoice for the period are skipped, so running it twice is safe.

Invoice numbers are assigned automatically (`INV-00001`).

**If any of those students ride the bus**, the dialog says so before you commit:
how many of them, and what transport would add in total. Leave the tick in and
each rider's fare goes on their invoice as its own line — so a parent sees what
the bus costs rather than finding the term's fee mysteriously larger than the
published one. Untick it if you bill transport separately.

A rider with a negotiated fare is charged that rather than the route's standard
fare, and a fare of zero is treated as a free ride and left off the invoice
entirely.

### Working with an invoice

Open any invoice to see its line items, payments against it, and its balance.
From here you can **Print or save as PDF** (your browser's print dialog offers
Save as PDF) and **Record Payment**.

---

## Payments and receipts

**Payments → Record Payment.**

1. Find the student.
2. Pick the invoice being paid.
3. Enter the amount, the method (cash, transfer, POS, cheque) and a reference.

Partial payments are fine — the invoice stays *pending* with a reduced balance
and moves to *paid* when it is settled. A receipt is generated automatically.

> **Online payment is not enabled.** Parents cannot pay through the portal yet;
> they see their invoices and pay through your usual channel, and you record it
> here. This is deliberate — recording a payment without a payment gateway
> confirming it first would let a parent mark their own fees paid.

---

## Arrears

**Arrears** lists every overdue invoice, aged 0–30, 31–60 and 60+ days, with the
student, class, invoice number and balance.

**Remind** sends a fee reminder to that student's linked guardians. It reaches
them in the app immediately; email or SMS depends on your notification setup.

---

## Attendance

**Attendance.** Pick a class, a term and a date.

Everyone starts marked **Present**, which is usually right. Change the ones who
are not: each student's row has four buttons — Present, Absent, Late, Excused —
and one tap sets any of them.

**Mark all** at the top sets everyone at once, useful for a public holiday.

Press **Save Attendance** when done. You can save a register where nobody was
changed, and you can come back and correct a day later — saving again updates the
existing records rather than duplicating them.

Excused absences are not counted against a student's attendance rate.

---

## Exams and report cards

### Creating an exam

**Exams → New Exam.** Give it a name, a class, a term, a date and a maximum score.

### Entering scores

Open the exam. You get a grid of students down the side and subjects across the
top. Type the scores and save. Grades are calculated automatically:

| Percentage | Grade | |
| --- | --- | --- |
| 90+ | A+ | Outstanding |
| 80–89 | A | Excellent |
| 70–79 | B | Very Good |
| 60–69 | C | Good |
| 50–59 | D | Fair |
| 40–49 | E | Below Average |
| Under 40 | F | Needs Improvement |

Subjects come from the class's assigned subjects. If none are assigned, the exam
page says so and links you to the right setting.

### Report cards

From the exam, open any student's report card. It shows every subject, their
score and grade, the overall average and a remark, on your school's letterhead.
Print it or save it as PDF.

---

## Academic performance

**Performance** shows how a class is actually doing, rather than a list of raw
scores.

- **Class average** and **average by subject**, so you can see which subject is
  dragging
- A ranked student table with each student's average, grade, attendance and
  whether they are improving or declining
- **Needing attention** — students flagged from a failing or borderline average,
  a sharp drop since last term, or poor attendance, with the reasons stated

Open any student for their own view: overall average, term-on-term trend line,
per-subject strengths, attendance, and position in class.

Parents see the same analysis for their own children in the portal.

---

## Payroll

### Running payroll

**Payroll → New Payroll Run.** Choose the period and run date.

The dialog previews every active staff member's gross, deductions and net pay
before you commit, warns you if a run already exists for that period, and names
anyone excluded for having no salary set up.

**Create draft run** creates the run and its payslips. Nothing is paid yet.

### Approving and paying

Open the run:

- **Approve Payroll** or **Reject** — a draft becomes approved
- **Export Bank Batch** — a CSV of net pay and bank details for your bank
- Each staff row opens their **payslip**, to print or download as a PDF

A payslip carries the school's logo and contact details, the employee's ID,
position and department, the pension and tax split, and the account the money
went to, shown as the last four digits only. **Download PDF** produces a file to
email or file; **Print** opens it ready for paper.

### My Pay

Every member of staff has **My Pay**, listing their own payslips and nothing
else — a teacher does not gain sight of the payroll by having it. Each row opens
the same payslip, with the same download.

Payslips appear there **once a run has been approved**. A draft is still a
proposal that can be rejected, and showing someone a figure that later changes is
worse than showing them nothing.

> **If someone sees "Account not linked"**, their sign-in was never attached to
> their staff record. That happens when a staff member was added without *Send
> invite*. Re-issue their access from their staff record and the two are joined.

---

## Approvals

**Approvals** is the queue of requests waiting on a decision — salary changes,
fee waivers and other sensitive actions.

Approving a salary change applies it to the staff member's payroll profile and
records it in the audit log. Rejecting marks it rejected and changes nothing.

Every important action is recorded in **Audit Log**: who did what, to what, and
when.

---

## Announcements and notifications

**Announcements → New Announcement.** Write a title and body, choose the audience
(everyone, parents, staff, or a class), and send.

Recipients see it in the app immediately. Email and SMS depend on your setup:

- **Settings → Notifications** shows the outbox — waiting, sent and failed
- Email sends once an email provider is configured
- **SMS is not delivered yet.** Texts queue and stay queued rather than
  disappearing quietly

**Templates** let you customise the wording of standard messages like fee
reminders. **My Preferences** is where each person chooses what they are
notified about.

---

## Events, notices and your public page

Three things that look similar and are not:

| | Who sees it | What it is for |
| --- | --- | --- |
| **Announcements** | Chosen roles, signed in | A message sent once |
| **Events** | Chosen audience, signed in | Something with a date, on a calendar |
| **Notices** | Everyone, including strangers | A standing statement while it is true |

### Events

**Events** holds anything with a date: resumption, mid-term break, inter-house
sports, the carol service, a PTA meeting. Give it a title, a date and an
audience — everyone, staff only, parents only or students only — and it appears
under **Upcoming** on the dashboard and in the parent and student portals until
it has passed.

### Notices

**Settings → Admissions → Notices.** A notice is a headline and an optional
paragraph, with an optional window: *show from* and *show until*. Use them for
the things a family needs to know before they ask — "Second term resumes 6
January", "Admissions open for 2026/2027", "School closes at 12 noon on Friday".

Each notice has a switch. Off is a draft, which is how you write next term's
dates in advance without publishing them. Published notices show on your public
application page and to parents and students in their portals, so your website
and your portal never say different things.

The list tells you which state each notice is in: **Showing now**, **Draft**,
**Starts later** or **Finished**.

---

## Transport

If your school runs buses, **Transport** turns that into something you can bill
for rather than something you remember.

### Routes and stops

Add a route with its name, the fee per term, the driver and their phone, the
vehicle registration and, optionally, the capacity. Then open the route and add
its **stops** in order, each with a pickup time. The stop list reads as the
journey the bus actually makes.

Each route shows how many students ride it. If you set a capacity and go over
it, the route is flagged.

### Putting a student on a bus

Open the student, go to the **Transport** tab, pick the route and the stop. The
route's termly fee applies unless you set a **fee override** for this child —
which you will, for siblings, staff children and anyone riding part of the week.

The assignment belongs to the current term, so last term's arrangements stay on
last term's record.

### What the family sees

The parent portal and the student portal show a **School bus** card with the
route, the stop, the pickup time and the driver's name and number. Families who
do not ride see nothing at all.

---

## The parent portal

A guardian with an invited account signs in and sees only their own children:

- Each child, their class and status
- **Academic performance** — the same analysis staff see, per child
- Invoices with balances, printable
- Payment history
- How to pay
- Their child's bus route, stop and pickup time, if they ride
- Upcoming events and the school's current notices

Parents cannot see other families, other students, staff records, or anything
about the school's finances.

If a parent sees *Account Not Linked*, their login exists but has not been
attached to a guardian record. Open the guardian in **Guardians** and invite them
from there.

---

---

## The student portal

Older students can have their own login, separate from their parents'.

**To give a student one:** open the student and press **Invite to portal**. You
will be asked for an email address — schools rarely hold one on the student
record, so it is asked for rather than assumed. They get a link to set a
password.

**What they see:** their own results and performance, their attendance, their
invoices and balance (printable), their bus route, upcoming events and the
school's notices. Nothing about any other student, and nothing about the
school's finances.

Whether students get logins at all is your decision. A school that only wants
parents to have access simply never sends a student invite.

---

## Reports

**Reports** covers the money and the operation:

- Total billed, collected, and collection rate
- Monthly revenue trend
- Billing by class
- Arrears ageing
- Payments by method
- Payroll summary

**Export CSV** is available on most list pages — Students, Staff, Invoices,
Payments, Payroll, Audit Log — and exports what you are currently filtered to.

**Group Overview** compares schools across the organisation, for proprietors and
group admins.

---

## AI Analysis (add-on)

A paid add-on, off unless your organisation has bought it. A proprietor or group
admin turns it on under **Settings → Add-ons**, which also shows how much of the
monthly allowance is used.

Once on, an **Analyse** button appears in four places:

| Where | What it gives you |
| --- | --- |
| **Performance** | A written read of the class's results — which subjects need attention, which students to look at first |
| **Student → Performance** | A draft end-of-term report card comment, for you to edit before publishing |
| **Reports** | Where fee collection is stuck, from collection rate and arrears ageing |
| **Reports** | Payroll cost against student and staff numbers |

Only summarised figures are sent for analysis, never raw student records.

**Check anything you plan to act on.** The analysis is generated from your data
but it can be wrong, and it is a starting point for a conversation rather than a
decision.

---

## Installing the app on a phone

The system runs in a browser, but it can be installed so it opens from the home
screen like any other app — no address bar, and it still opens on a weak signal.

**Android / Chrome:** a bar appears at the top of the screen offering to install
it. If you dismissed it, use the browser menu → *Install app* or *Add to Home
screen*.

**iPhone / Safari:** Share → *Add to Home Screen*.

Being installed does not make the system work offline — it still needs a
connection to load your school's data. What it does is start faster, survive a
flaky connection on a page you already have open, and stay one tap away.

---

## Who can do what

| | Admissions | Students | Staff | Fees | Payroll | Transport | Reports | Settings | Users |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **Proprietor** | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| **Group Admin** | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| **School Admin** | ● | ● | ● | ● | | ● | ● | ● | ● |
| **Principal** | ● | ● | ● | view | | ● | ● | | ● |
| **Bursar** | ● | ● | | ● | ● | ● | ● | | ● |
| **Finance Officer** | | view | | ● | | | ● | | ● |
| **HR Admin** | | | ● | | ● | | ● | | ● |
| **Teacher** | | own classes | | | | | | | |
| **Parent** | | own children | | own invoices | | own children | | | |
| **Student** | | themselves | | own invoices | | themselves | | | |

Teachers see only the classes they are assigned to under **Settings → Classes**.
Salary and bank details are visible only to proprietors, bursars, finance
officers and HR admins. Applications are school-office work: teachers, parents
and students cannot read other families' applications at all.

**Editing the school's own profile** — its name, email, phone and address — is
open to proprietors, group admins, school admins and principals. *Creating* and
*deleting* a school stays with the proprietor. Branding (colours, logo, tagline)
is proprietor and group admin only.

---

## When something looks wrong

### "We couldn't load your account" after signing in

Your password was accepted. What failed is the step straight after it, where the
app asks the database which school you belong to.

The screen carries a short code. Read it out to whoever supports your system —
it tells them which of three quite different things went wrong, and they will
not be able to guess without it. **Try again** repeats the lookup without making
you sign in from scratch, which is worth one attempt before you report it.

This screen exists because the failure used to be silent: you were sent to the
"create your organisation" wizard instead, as though you were a brand-new user
who had never set a school up.

### "Your account isn't attached to a school"

Different problem, and nothing you can fix yourself. Your login works and your
role is set, but the role was never linked to a school. Whoever administers your
school needs to reissue your access from **Users**.

Do not set up a new school to get past this. It will appear to work and will
leave you in a second, empty organisation that nothing else can reach.

### A save says it could not save

If a Save button reports *"Could not save … your role may not have permission to
change it"*, that is the honest answer: the database refused the change.

Usually it is a permissions boundary — not every role can edit every setting.
Ask someone with a more senior role to make the change.

This message is newer than the behaviour behind it. These saves used to show a
green "saved" message whether or not anything had been written, so a school name
could be typed, confirmed, and never stored. If something you changed weeks ago
has quietly reverted, that is the likely reason, and it is worth re-checking your
school profile and branding.

### "No students in this class" when marking attendance

Almost always the term. Enrolment is per class **per term**, so a class full of
students last term looks empty this term until they are promoted into it.

The page tells you which it is. If the class has students in another term, it
names the term and offers to switch. If it genuinely has nobody, it says so.

**Fix:** either switch the term at the top of the page, or run
**Students → Promote** to move them into the current term.

### A teacher sees nothing at all

They have no classes assigned. **Settings → Classes → Teachers** on each class
they take.

### An imported student is missing everywhere

They were imported without a class, before the class step was required. Open the
student and check their class; re-import or add the enrolment.

### An invited colleague cannot sign in

They never got the link. Invites are queued as email, and until an email provider
is configured that queue does not send. Re-invite them and **copy the link from
the dialog**, or send them to **Forgot password** on the sign-in page.

### Announcements and reminders are not arriving

Check **Settings → Notifications**. In-app notifications work regardless; this is
about email and text.

If messages sit as *waiting*, the sending address is not set up yet. Email goes
out from one address belonging to whoever runs the platform, not from each
school's own domain — so this is their job, not yours, and it is one piece of
setup for every school rather than one each. Replies still reach your school,
because the reply address on every message is the one on your school profile:
worth checking that **Settings → General → Email** is right.

If messages show as *not configured*, that is the same thing said more plainly —
they are held, not lost, and they send once the address is verified.

SMS is not delivered yet. It queues and is reported as undelivered rather than
quietly dropped, so nothing disappears, but do not rely on text for anything
urgent.

### "No current academic period set" when adding a student

No term is marked current. **Settings → Academic Years → Set current** on the
term you are in.

### A parent sees "Account Not Linked"

Their login is not attached to a guardian record. Invite them from the guardian's
page in **Guardians** rather than from **Users**.

### A student signs in and is told their login is not attached to a record

Same cause, different table. Open the student and press **Invite to portal** —
inviting from **Users** creates a login with no student behind it.

### The application link says "This admissions page is not available"

The slug in the link does not match any school. Check **Settings → Admissions**
for the current link; if you changed it, the old one stops working immediately.

### A family says they applied but nothing is in Admissions

Check that **Accepting applications** is on. While it is off the public page
turns families away rather than taking their details, so an application made
during that time was never recorded.

### "Enrol as a student" will not finish

Two usual causes: no current academic term (**Settings → Academic Years**), or no
class picked. The application stays in **Accepted** and can be enrolled again —
it is only marked **Enrolled** once the student record actually exists.

### A notice is not showing on the public page

Check its state in **Settings → Admissions → Notices**. **Draft** means the
switch is off; **Starts later** and **Finished** mean the date window has not
opened or has closed.

---

*Questions this guide does not answer belong with whoever set up your system.
For how the product is built and what is still being worked on, see
`docs/USER_JOURNEYS.md`.*
