# Let the organisation's currency be changed

## What's happening

Currency is chosen once, during first-time setup, from the country you pick. After that there is no screen anywhere in the app to change it, so an organisation created with "United Kingdom" is stuck showing £ on every fee, invoice, payslip and report.

Checked in the database: the two demo organisations are already set to Nigeria / NGN, and "Smartever School of Life" is NGN. The two organisations named "Smart School Admin" are set to United Kingdom / GBP — that is the one showing £. So this is a setting on the workspace, not a bug in the money formatting.

Note: platform billing (your subscription and SMS bundles) is always charged in Naira and is unaffected by this setting.

## What to build

Add a **Currency & Region** card to Settings → General, visible to everyone but editable only by an owner (proprietor, group admin, super admin):

- Country picker and currency picker, pre-filled with the current values.
- Choosing a country suggests its currency; the currency can still be set independently (for a school in one country that bills in another).
- Same country/currency list already used in first-time setup.
- A short warning that changing currency changes only the symbol shown — existing amounts already recorded are not converted.
- Save button with a confirmation step, then the whole app refreshes so every page picks up the new symbol immediately.

Then, so the current £ workspace is correct straight away, switch the two "Smart School Admin" organisations to Nigeria / NGN as a one-off data update (confirm with me before I run it if you'd rather set it yourself from the new screen).

## Technical notes

- New `CurrencyCard` in `src/pages/SettingsPage.tsx`, reading and writing `organisation_groups.country` and `organisation_groups.currency` for the active `orgId` — the same pattern `AiAddonCard` already uses, so existing row-level security covers it.
- Move the country → currency list out of `src/pages/Onboarding.tsx` into a shared `src/lib/currencies.ts` and import it in both places, so the two never drift.
- After a successful save, invalidate the auth/org queries and refetch so `AuthContext`'s `currency` (and therefore `useCurrency`, all documents and exports) updates without a manual reload.
- Add `AED`, `EGP`, `TZS`, `UGX`, `RWF` to the symbol/locale maps in `src/lib/format.ts` — the setup list already offers those countries but the formatter has no entry for them, so they fall back to a bare code.
- Platform billing paths (`initiate-subscription-payment`, `src/pages/Billing.tsx`) stay hard-wired to NGN; no change there.
