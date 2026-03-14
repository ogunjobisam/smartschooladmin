

## Production Readiness Assessment

Apart from payment integration and email notifications (which you've already identified), here is a breakdown of what needs attention before going live:

---

### Critical Security Issues (Must Fix)

The security scan found **3 critical** and **4 warning-level** issues:

1. **Cross-org privilege escalation** -- Proprietors can insert `user_roles` rows targeting any `org_id`, letting them take over other organizations. The RLS policy on `user_roles` needs a `WITH CHECK` that scopes inserts to the caller's own org.

2. **All user profiles exposed** -- The `profiles` table has a `USING (true)` SELECT policy, meaning any logged-in user can read every user's name, email, phone, and avatar across all organizations. Must be scoped to same-org users.

3. **Salary data exposed to parents** -- The `salary_change_requests` SELECT policy allows all org members (including parents and teachers) to see salary figures. Must restrict to HR/finance roles.

4. **Leaked password protection disabled** -- Should be enabled in auth settings.

5. **Outbound message queue open to all** -- Any authenticated user (including parents) can inject arbitrary emails/SMS into the queue.

6. **Payment transaction PII exposed** -- Payer email/name visible to all org members.

7. **Audit logs open to all** -- Sensitive historical data in `old_values`/`new_values` readable by everyone.

---

### Other Production Gaps

| Area | Status | What's Needed |
|------|--------|---------------|
| **Email verification** | Likely disabled (auto-confirm) | Confirm email verification is enforced before sign-in |
| **Password policy** | Weak defaults | Enable leaked password protection |
| **Rate limiting** | None on client | Add throttling to login attempts and invite functions |
| **Error handling** | Basic | Many pages use optimistic patterns without robust error recovery |
| **Input validation** | Partial | Edge functions trust client input (e.g., `invite-user` should validate email format, role values server-side) |
| **Data export/backup** | None | No backup strategy for production data |
| **Logging/monitoring** | Minimal | No structured error tracking (e.g., Sentry) |
| **Multi-school isolation** | Partial | `school_admin` role exists but some RLS policies don't filter by `school_id`, only `org_id` |
| **Mobile responsiveness** | Untested | Sidebar and complex tables may not render well on small screens |

---

### Recommended Fix Priority

**Phase 1 -- Security (before any real users):**
1. Fix cross-org privilege escalation on `user_roles`
2. Scope `profiles` SELECT policy to same-org
3. Restrict salary, audit log, and payment transaction visibility
4. Lock down outbound message queue INSERT to staff roles
5. Enable leaked password protection

**Phase 2 -- Hardening:**
6. Add server-side input validation in edge functions
7. Add error tracking/monitoring
8. Test and fix mobile responsiveness

---

### Summary

The app has a solid feature set -- students, staff, fees, invoices, exams, attendance, payroll, notifications, approvals, audit logs, documents, and RBAC are all built out. The **database schema and RLS policies are the main blocker**. The 7 security findings above must be resolved before putting real user data in the system. Everything else (monitoring, mobile polish, rate limiting) is important but lower priority.

Want me to fix the security issues?

