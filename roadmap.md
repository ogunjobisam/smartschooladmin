# Roadmap — SmartSchoolAdmin Pricing/Billing build

## In progress
- [ ] Pricing & billing system (per-term, per-student; SMS add-on; GBP-cost-aware)

## Tasks
- [ ] Schema: subscription_plans, org_subscriptions, sms_credit_balances, sms_usage_log, platform_payments + seed 3 plans
- [ ] `my_subscription` security-definer RPC + `useSubscription` hook (mirror use-ai-addon)
- [ ] Feature-gate helper (plan limits) + apply to AI insights (Premium)
- [ ] Proprietor Billing page: plan, student count, term cost, pay via Paystack, SMS balance, buy SMS bundle
- [ ] `initiate-subscription-payment` edge function (Paystack/Flutterwave; reuse initiate-payment pattern)
- [ ] Subscription payment confirmation (extend payment-webhook or dedicated path)
- [ ] SMS metering: deduct on send; block when balance empty
- [ ] Storage quota guardrail per plan
- [ ] Public pricing page on landing site (SEO)
- [ ] Verify: TS, build, route render via Playwright
