/**
 * Countries offered at setup and in Settings, each with the currency schools in
 * that country normally bill in. Shared so first-time setup and the currency
 * card can never drift apart.
 */
export const COUNTRIES = [
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "GH", name: "Ghana", currency: "GHS" },
  { code: "KE", name: "Kenya", currency: "KES" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
  { code: "IN", name: "India", currency: "INR" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "EG", name: "Egypt", currency: "EGP" },
  { code: "TZ", name: "Tanzania", currency: "TZS" },
  { code: "UG", name: "Uganda", currency: "UGX" },
  { code: "RW", name: "Rwanda", currency: "RWF" },
] as const;

export interface CurrencyOption {
  code: string;
  label: string;
}

/** Currency codes on offer, in the order the countries above introduce them. */
export const CURRENCIES: CurrencyOption[] = [
  { code: "NGN", label: "NGN — Nigerian Naira (₦)" },
  { code: "GBP", label: "GBP — Pound Sterling (£)" },
  { code: "USD", label: "USD — US Dollar ($)" },
  { code: "EUR", label: "EUR — Euro (€)" },
  { code: "GHS", label: "GHS — Ghanaian Cedi (GH₵)" },
  { code: "KES", label: "KES — Kenyan Shilling (KSh)" },
  { code: "ZAR", label: "ZAR — South African Rand (R)" },
  { code: "INR", label: "INR — Indian Rupee (₹)" },
  { code: "CAD", label: "CAD — Canadian Dollar (CA$)" },
  { code: "AUD", label: "AUD — Australian Dollar (A$)" },
  { code: "AED", label: "AED — UAE Dirham (د.إ)" },
  { code: "EGP", label: "EGP — Egyptian Pound (E£)" },
  { code: "TZS", label: "TZS — Tanzanian Shilling (TSh)" },
  { code: "UGX", label: "UGX — Ugandan Shilling (USh)" },
  { code: "RWF", label: "RWF — Rwandan Franc (FRw)" },
];

/** The currency normally used in a country, if we know it. */
export function currencyForCountry(code: string): string | undefined {
  return COUNTRIES.find((c) => c.code === code)?.currency;
}

/** Country name for a stored code, falling back to the code itself. */
export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  return COUNTRIES.find((c) => c.code === code)?.name || code;
}
