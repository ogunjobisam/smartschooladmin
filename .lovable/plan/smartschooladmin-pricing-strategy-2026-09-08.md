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

## Cost & margin: does it cover costs with profit?

**Short answer: yes for the software/platform costs at the recommended prices, but SMS messaging is the one cost that can eat your margin — so charge it as a paid add-on, not included.**

Paystack fees on the subscription itself: **1.5% + ₦100 per local card transaction, capped at ₦2,000** [1](https://paystack.com/pricing). Flutterwave is comparable. International cards cost more (3.9% + ₦100) [1](https://paystack.com/pricing).

Worked example — a 200-student Standard school:

| Line | Per term | Per month (÷4) |
|------|----------|----------------|
| Revenue: 200 × ₦150 | ₦30,000 | ₦7,500 |
| Paystack fee on that payment (1.5% + ₦100) | ~₦550 | ~₦140 |
| Lovable Cloud (amortised across schools) | — | ~₦500–1,000 |
| AI Gateway (beyond 4 free credits/mo) | — | ~₦200–800 |
| Managed email (receipts, absence, results alerts) | — | ~₦300–1,000 |
| SMS **if included** (200 students × ~4 SMS × ₦3) | — | ~₦2,400 |
| **Gross margin (no SMS)** | — | **~₦4,400–6,400** |
| **Gross margin (SMS included)** | — | **~₦2,000–4,000** |

Key takeaways:

- **Software/platform costs are well covered** at ₦150/student/term for a typical school; margin grows with student count.
- **SMS is the danger** — bulk SMS in Nigeria (~₦2–4/message) scales with student × parent × messages and can exceed revenue for small schools. **Recommendation: SMS is a paid add-on.** Schools buy SMS bundles (e.g. ₦5,000 for 2,000 SMS) and usage deducts from their balance; email stays included. This keeps your margin predictable.
- **Small schools (<50 students) are free** — that's fine because their costs (a few emails, minimal Cloud share) are near zero.
- **AI insights** already sit behind an entitlement pattern — map Premium plan to it so AI Gateway spend is only incurred by paying Premium schools.

**Profit sensitivity:** the biggest lever is student count per school. At 200 students Standard you clear roughly ₦4–6k/month/school before support costs. Support is mostly self-serve (in-app, docs) — keep it that way; "priority support" on Premium is the only human-time line item.

Recommendation stands: per-student, per-term, free tier up to 50, SMS as a paid add-on. This covers costs with profit and scales.

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
