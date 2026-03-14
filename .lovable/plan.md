

## User Flow Gap Analysis

After reviewing the full codebase, database schema, edge functions, and page components, here is a comprehensive assessment of the current user flow and its gaps.

---

### What Works Today

```text
Signup → Email Confirm → Login → Onboarding (Org + School + Academic Year) → Dashboard
                                                                              ├── Add Students (manual, one-by-one)
                                                                              ├── Add Staff (manual, one-by-one)
                                                                              ├── Add Guardians (manual, one-by-one)
                                                                              ├── Invite Users (via User Management page)
                                                                              ├── Fee Schedules → Generate Invoices → Record Payments
                                                                              └── Payroll → Runs → Approval
```

---

### Identified Gaps

#### 1. No Bulk Import for Students, Staff, or Guardians
Schools typically onboard hundreds of students at once. Currently, each must be added one-by-one via a dialog form. There is no CSV/Excel upload.

#### 2. No Student-Guardian Linking During Student Creation
When adding a student, there is no option to attach or create a guardian. The `student_guardians` junction table exists, but the AddStudentDialog does not use it. Guardians must be created separately, then manually linked (and there is no UI to link them at all outside of demo data seeding).

#### 3. No Student Enrolment Flow
Students are created but not enrolled in a class during creation. The `enrolments` table exists but AddStudentDialog does not create an enrolment record. There is no visible "Enrol in Class" action on the student detail page either.

#### 4. Staff Have No Login Accounts
Adding staff via AddStaffDialog creates a `staff` record but does not create an auth user or assign a `user_role`. Staff members (teachers, bursars, etc.) cannot log into the system unless separately invited via the User Management page. These two flows are completely disconnected -- the `staff` table has a `user_id` column but it is never populated.

#### 5. Guardians/Parents Have No Login Portal Link
Guardians are created as records, but there is no flow to give them login credentials or link them to auth users. The `guardians` table has a `user_id` column (nullable), but it is never set. The `ParentDashboard` page exists but parents have no way to reach it.

#### 6. No Guided Post-Onboarding Checklist
After completing the 3-step onboarding wizard, the user lands on the dashboard with no guidance on what to do next (add classes, create fee schedules, add students, invite staff). There is no "Getting Started" checklist or empty-state guidance.

#### 7. No Class Assignment When Adding Students
The AddStudentDialog collects basic info but does not ask which class the student belongs to, which is arguably the most important piece of information at enrollment time.

#### 8. Invite Flow Does Not Link to Staff Records
The User Management invite creates an auth user + `user_role`, but for staff roles (teacher, bursar, hr_admin) it does not create or link to a `staff` record. This means invited staff won't appear on the Staff page.

---

### Recommended Fixes (Priority Order)

| # | Gap | Fix |
|---|-----|-----|
| 1 | **Student creation missing class + guardian** | Extend AddStudentDialog to include class selection (creates enrolment) and optional guardian fields (creates guardian + student_guardian link) |
| 2 | **Staff ↔ User account disconnect** | When inviting a user with a staff role, auto-create a `staff` record and link `user_id`. When adding staff, offer to also send a login invite. |
| 3 | **No bulk import** | Add CSV upload for students and staff with column mapping and validation |
| 4 | **Parent portal inaccessible** | When creating/editing a guardian, add "Send login invite" button that creates an auth user with `parent` role and links `guardians.user_id` |
| 5 | **No post-onboarding guidance** | Add a "Getting Started" checklist on the dashboard that tracks: classes configured, students added, staff added, fee schedules created, first invoice generated |
| 6 | **No student-guardian linking UI** | Add a "Guardians" tab on StudentDetail page to link/unlink guardians |

---

### Implementation Plan

**Phase 1 -- Fix Core Creation Flows (highest impact)**

1. **Enhance AddStudentDialog**: Add class dropdown (required), optional guardian section (name, phone, relationship). On submit: insert student → insert enrolment → optionally insert guardian + student_guardian link.

2. **Bridge Staff ↔ User Management**: Add an "Invite to Login" button on AddStaffDialog and StaffDetail that calls the existing `invite-user` edge function, then updates `staff.user_id`. Conversely, update `invite-user` to auto-create a staff record when the role is teacher/principal/bursar/hr_admin.

3. **Guardian Portal Access**: Add "Send Login Invite" on guardian records that creates an auth user with `parent` role and sets `guardians.user_id`.

**Phase 2 -- Productivity Features**

4. **Bulk CSV Import**: Create a reusable CSV upload component, then use it on Students page and Staff page. Parse, validate, preview, and batch insert.

5. **Post-Onboarding Checklist**: Add a dismissible checklist card on the dashboard that queries for the existence of students, staff, fee schedules, and invoices.

6. **Student-Guardian Linking UI**: Add a Guardians tab on StudentDetail with search + link/unlink.

---

Shall I proceed with implementing Phase 1 (the three core flow fixes)?

