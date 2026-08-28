// Currency formatting utilities
// The currency code comes from the organisation_groups table

const currencyLocaleMap: Record<string, string> = {
  NGN: "en-NG",
  GBP: "en-GB",
  USD: "en-US",
  GHS: "en-GH",
  KES: "en-KE",
  ZAR: "en-ZA",
  EUR: "de-DE",
  INR: "en-IN",
  CAD: "en-CA",
  AUD: "en-AU",
};

const currencySymbolMap: Record<string, string> = {
  NGN: "₦",
  GBP: "£",
  USD: "$",
  GHS: "GH₵",
  KES: "KSh",
  ZAR: "R",
  EUR: "€",
  INR: "₹",
  CAD: "CA$",
  AUD: "A$",
};

export function formatCurrency(value: number, currencyCode = "NGN"): string {
  const locale = currencyLocaleMap[currencyCode] || "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    // Fallback if currency code is invalid
    return `${currencyCode} ${value.toLocaleString()}`;
  }
}

export function formatCurrencyCompact(value: number, currencyCode = "NGN"): string {
  const symbol = currencySymbolMap[currencyCode] || currencyCode + " ";
  // Abbreviate on magnitude and put the sign in front of the symbol. Balances go
  // negative when a payment overshoots an invoice, and "₦-2500000" is unreadable.
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${symbol}${abs}`;
}

// Legacy aliases for backward compatibility
export const formatNaira = (value: number) => formatCurrency(value, "NGN");
export const formatNairaCompact = (value: number) => formatCurrencyCompact(value, "NGN");
