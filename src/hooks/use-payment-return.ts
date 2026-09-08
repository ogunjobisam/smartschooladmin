import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Handles the payer coming back from a gateway's checkout page.
 *
 * The gateway appends its own reference to the return URL. We hand that
 * reference to the server, which asks the gateway whether the money really
 * arrived before any receipt is written — the browser is never trusted to say
 * "paid".
 */
export function usePaymentReturn() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const reference =
      params.get("reference") || params.get("trxref") || params.get("tx_ref");
    const provider = params.get("provider") || "";
    if (!reference || handled.current === reference) return;
    handled.current = reference;

    (async () => {
      const { data, error } = await supabase.functions.invoke("payment-webhook", {
        body: { reference, provider },
      });

      if (error || data?.ok === false) {
        toast.error("We could not confirm that payment yet. If you were charged, it will appear shortly.");
      } else if (data?.reason === "already_recorded") {
        toast.success("That payment is already on the account.");
      } else {
        toast.success(
          data?.receipt_number
            ? `Payment confirmed — receipt ${data.receipt_number}`
            : "Payment confirmed",
        );
      }

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });

      const next = new URLSearchParams(params);
      ["reference", "trxref", "tx_ref", "provider", "status"].forEach((k) => next.delete(k));
      setParams(next, { replace: true });
    })();
  }, [params, setParams, queryClient]);
}
