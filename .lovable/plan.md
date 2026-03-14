

## Plan: Add "Delete Demo Data" Feature

### What
Add a "Danger Zone" section to the Settings page that allows admins to purge all demo/seed data from their school in one click. This will create a new edge function that deletes data in the correct order (respecting foreign key dependencies).

### Implementation

**1. Create `supabase/functions/delete-demo-data/index.ts`**
- Authenticate the caller and verify they have `proprietor` or `super_admin` role
- Accept `org_id` and `school_id` in the request body
- Delete data in dependency order using the service role client:
  1. `payment_allocations` (via payments in school)
  2. `invoice_items` (via invoices in school)
  3. `payroll_run_items` (via payroll_runs in school)
  4. `payroll_runs` (by school_id)
  5. `payments` (by school_id)
  6. `invoices` (by school_id)
  7. `approval_requests` (by org_id)
  8. `audit_logs` (by org_id)
  9. `student_guardians` (via students in school)
  10. `enrolments` (via students in school)
  11. `students` (by school_id)
  12. `guardians` (by org_id)
  13. `staff_bank_details` (via staff in school)
  14. `payroll_profiles` (via staff in school)
  15. `staff_positions` (via staff in school)
  16. `staff` (by school_id)
- Return counts of deleted records

**2. Update `supabase/config.toml`**
- Add `[functions.delete-demo-data]` with `verify_jwt = false`

**3. Add "Danger Zone" card to `src/pages/SettingsPage.tsx`**
- New card at bottom of General tab (visible to proprietor/super_admin only)
- Red-bordered card with "Delete All Data" button
- Confirmation dialog (AlertDialog) requiring the user to type the school name to confirm
- Calls the edge function, shows progress toast, then invalidates all queries

### Technical Notes
- The edge function uses service role key to bypass RLS for bulk deletes
- Deletion order matters due to foreign key constraints between tables
- Only `proprietor` and `super_admin` roles can access this feature

