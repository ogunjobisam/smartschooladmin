# SmartSchoolAdmin Pricing Strategy

No code changes yet — this is a strategy proposal to review before we build anything.

## Recommended model: per-student, billed per term, with a free tier

For African private schools, flat tiered plans punish small schools and undercharge large ones. Per-student pricing matches how schools themselves think (fees per pupil) and scales naturally.

**Recommended structure:**

| Plan | Price (NGN, indicative) | Who it fits |
|------|------------------------|-------------|
| Free | ₦0 — up to 50 students, 1 school | New/small schools trying the product |
| Standard | ~₦150/student/term | Most private primary & secondary schools |
| Premium | ~₦250/student/term | Groups, multi-campus, wants AI insights, payroll, priority support |

- **Bill per term**, not monthly — schools budget and collect fees per term. This matches the existing academic-period model in the app.
- **Currency per market** — NGN first, then GHS/KES etc., matching each school's configured currency.
- **Free tier over free trial** — trials expire and churn schools that are slow to onboard; a 50-student free tier lets small schools adopt permanently and upgrade as they grow. (Trial vs free tier is still open — flagged below.)

## Feature gating suggestion

- **Free**: students, staff, attendance, fees/invoices, basic announcements
- **Standard**: + exams/report cards, timetables, parent/student portals, notifications (email/SMS), admissions
- **Premium**: + payroll, multi-school/group dashboards, AI insights, achievement wall, priority support

## Payments when we build

Paystack/Flutterwave — same gateway abstraction already built for parent fee payments, reused for platform subscriptions (schools paying SmartSchoolAdmin). Starts in test mode, webhook-confirmed receipts, exactly like invoice payments.

## What building this would later involve (for reference, not now)

1. `subscription_plans` + `org_subscriptions` tables (org-scoped, super-admin managed)
2. A billing page for proprietors: current plan, student count, term invoice
3. Paystack/Flutterwave checkout reusing `initiate-payment`/`payment-webhook`
4. Feature gates that read the org's plan (e.g. AI insights already has an entitlement pattern to copy)
5. Public pricing page on the landing site (SEO-friendly, mirrors the table above)

## Open decisions for you

1. **Free tier vs time-limited trial** (recommended: free tier up to 50 students)
2. **Exact prices** — ₦150/₦250 per student per term are starting points; adjust per market research
3. **Per-term vs per-year billing** (per-term recommended; offer ~10% annual discount?)
4. **What counts as a billable student** — active enrolment in the current term only (recommended)

Approve to save this as the agreed direction; a follow-up plan will cover the actual build when you're ready.
