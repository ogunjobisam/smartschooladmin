import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { useCallback } from "react";

/** Returns formatMoney / formatMoneyCompact bound to the org's currency. */
export function useCurrency() {
  const { currency } = useAuth();

  const formatMoney = useCallback(
    (value: number) => formatCurrency(value, currency),
    [currency]
  );

  const formatMoneyCompact = useCallback(
    (value: number) => formatCurrencyCompact(value, currency),
    [currency]
  );

  return { currency, formatMoney, formatMoneyCompact };
}
