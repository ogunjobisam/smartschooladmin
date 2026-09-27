# Roadmap — SmartSchoolAdmin Pricing/Billing build

## Done
- [x] Schema: subscription_plans, org_subscriptions, sms_credit_balances, sms_usage_log, platform_payments + seed 3 plans
- [x] `my_subscription` security-definer RPC + `useSubscription` hook (mirror use-ai-addon)
- [x] `org_current_student_count`, `activate_subscription`, `add_sms_credits`, `charge_sms` functions
- [x] Proprietor Billing page: plan, student count, term cost, pay via Paystack, SMS balance, buy SMS bundle
- [x] `initiate-subscription-payment` edge function (Paystack/Flutterwave; reuses initiate-payment pattern; NGN-denominated)
- [x] `subscription-webhook` edge function (signature verification, idempotent, activates plan / adds SMS credits)
- [x] Return-from-checkout confirmation on the Billing page
- [x] Public `/pricing` page on the landing site (SEO)
- [x] Billing route, nav item, sidebar icon, command palette, access (proprietor/group_admin/super_admin/school_admin)
- [x] SMS metering wired into process-message-queue (charge on real send only; balance guard; no charge while unconfigured)
- [x] Currency fix: platform billing always NGN regardless of org invoice currency

## Open
- [ ] Storage quota guardrail per plan (soft check on upload) — designed in plan, not yet enforced
- [ ] Feature gate helper applied to AI insights (Premium) — hook exists (`useSubscription`), soft gate not yet wired into AiInsightPanel
- [ ] SMS provider integration (Termii/Africa's Talking) so SMS actually delivers and `charge_sms` fires — SMS stays queued/unconfigured until then
- [ ] Annual billing (~10% discount) option — designed, not yet in UI
