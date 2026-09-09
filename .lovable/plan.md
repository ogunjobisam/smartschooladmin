# SmartSchoolAdmin Pricing Strategy (revised: GBP costs, document hosting, SMS add-on)

Strategy only — no code yet. This revises the approved direction with three things you flagged: your costs are in **£ (GBP)** while revenue is in NGN (and other African currencies), we **do host documents** (a storage cost), and SMS volume per student is much higher than 4.

## Confirmed facts

- **Documents are hosted** — student/staff/invoice/payroll records live in a private Supabase Storage bucket (`school-documents`); school logos in `school-assets`. Signed-URL access only. So storage (GB stored + bandwidth) is a real, if small, per-school cost.
- **Exchange rate (Sep 2026):** £1 ≈ ₦1,840–1,875. Use **₦1,850/£** for planning. NGN has historically weakened vs GBP, so price in NGN with a buffer and review quarterly.
- **Bulk SMS in Nigeria:** ~₦2–4 per delivered message. Use **₦3/SMS** average. ([SMSDora 2026](https://www.smsdora.com/bulk-sms-pricing-nigeria), [Paystack pricing](https://paystack.com/pricing))
- **Paystack fees on the subscription payment:** 1.5% + ₦100 local, capped at ₦2,000; 3.9% + ₦100 international. ([Paystack pricing](https://paystack.com/pricing))

## Recommended model (unchanged shape, prices set)

| Plan | Price (NGN) | In GBP (≈₦1,850/£) | Who |
|------|-------------|-------------------|-----|
| Free | ₦0 — up to 50 students | — | New/small schools |
| Standard | **₦300/student/term** | ~£0.162/student/term | Most schools |
| Premium | **₦450/student/term** | ~£0.243/student/term | Groups, AI, payroll |

You set Standard at ₦300; Premium at ₦450 keeps the ~50% premium uplift for AI/payroll/multi-school. This gives a healthy GBP margin (see below) while staying within reach of Nigerian private schools.

- **Bill per term**, matching the academic-period model. Offer **~10% off** if a school pays the full year upfront.
- **Billable student** = actively enrolled in the current term only.
- **Free tier** (up to 50 students) over a time-limited trial.

## Cost & margin in GBP (your currency)

Worked example — a 200-student **Standard** school, per month (term ≈ 4 months):

| Line | NGN/mo | GBP/mo (÷1,850) |
|------|--------|-----------------|
| Revenue: 200 × ₦300 ÷ 4 | ₦15,000 | **£8.11** |
| Paystack fee on term payment (1.5% + ₦100) ÷4 | ₦163 | £0.09 |
| Lovable Cloud (amortised across schools) | ~₦1,000–2,500 | £0.54–1.35 |
| AI Gateway (Premium only; Standard ≈ nil) | — | £0.00 |
| Managed email (receipts, absence, results alerts) | ~₦600–2,000 | £0.32–1.08 |
| Document storage (a few GB + bandwidth) | ~₦200–800 | £0.11–0.43 |
| **Platform cost (excl. SMS)** | | **£1.06–2.95** |
| **Gross margin per school/mo** | | **£5.2–7.1 (~60–85%)** |

For a 500-student school: revenue ≈ ₦37,500/mo ≈ £20.3/mo; costs scale mostly flat-to-mild, so margin ≈ £16–18/mo. Margin improves sharply with size.

**Small-school honesty:** a 60-student Standard school brings ~£2.4/mo revenue vs ~£1–2 cost — now clearly profitable, not break-even. The free tier (≤50) means we don't carry the tiniest schools at all.

### SMS — the cost that must NOT be bundled

Realistic parent SMS volume is far higher than 4/student: absence + late + fee reminder + overdue + result published + event + announcement ≈ **10–20 SMS/month per parent**. At ₦3/SMS:

- 200 students × 1.5 parents × 12 SMS/mo × ₦3 = **₦10,800/mo (~£5.8/mo)** — more than the entire platform fee. Bundling SMS would erase all margin.

**Recommendation: SMS is a paid add-on.** Schools buy SMS credit bundles; usage deducts per message.

| SMS bundle | Price to school | Messages | Effective ₦/SMS | Your cost (~₦3) | Margin |
|-----------|-----------------|----------|-----------------|-----------------|--------|
| Starter | ₦2,000 | 400 | ₦5.0 | ₦1,200 | ₦800 (~£0.43) |
| Standard | ₦8,000 | 2,000 | ₦4.0 | ₦6,000 | ₦2,000 (~£1.08) |
| Bulk | ₦18,000 | 5,000 | ₦3.6 | ₦15,000 | ₦3,000 (~£1.62) |

Email stays included (cheap); SMS is the only metered add-on. Schools that don't want SMS simply don't buy it.

### Exchange-rate buffer

Because your costs are in £ and revenue in NGN/GHS/KES, NGN depreciation shrinks your GBP margin over time. Two safeguards:

1. **Price with a ~15–20% FX buffer** above the GBP break-even rate, and review prices **quarterly** against the prevailing rate.
2. Optionally **peg the internal cost** of each plan in £ and auto-flag when NGN revenue/£ falls below a floor — but that's a later build detail.

## Feature gating (unchanged)

- **Free**: students, staff, attendance, fees/invoices, basic announcements
- **Standard**: + exams/report cards, timetables, parent/student portals, notifications (email included; SMS add-on), admissions
- **Premium**: + payroll, multi-school/group dashboards, AI insights, achievement wall, priority support

## What building later involves (reference, not now)

1. `subscription_plans` + `org_subscriptions` tables (org-scoped; super_admin managed)
2. `sms_credits` + `sms_usage` tables for the add-on; per-message deduction
3. Proprietor billing page: current plan, student count, term invoice, SMS balance
4. Paystack/Flutterwave checkout reusing `initiate-payment`/`payment-webhook` (already built for fee payments)
5. Feature gates reading the org's plan (copy the AI-entitlement pattern in `use-ai-addon.ts`)
6. Storage quota guardrail tied to plan (Free = e.g. 1GB; Standard = 10GB; Premium = 50GB)
7. Public pricing page on the landing site (SEO-friendly, mirrors the table above)

## Open decisions for you

1. **Raised prices** — ₦200 Standard / ₦350 Premium per student per term. OK, or set your own?
2. **Free tier** up to 50 students (vs time-limited trial) — confirm.
3. **Yearly discount** — ~10% off if a school pays a full year upfront — include?
4. **SMS bundle prices** above — adjust the naira amounts?
5. **Storage quotas** per plan — sensible limits, or unlimited?

Approve to lock this as the agreed direction; the actual build will follow under a separate plan.
