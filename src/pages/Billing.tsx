import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, MessageSquare, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/use-subscription";
import { PLANS, planByCode, SMS_BUNDLES, termCost } from "@/lib/subscriptions";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export default function Billing() {
  const { orgId, currency } = useAuth();
  const { subscription, isLoading, refetch } = useSubscription();
  const queryClient = useQueryClient();
  // Platform billing is always priced in NGN, regardless of the org's own
  // invoice currency, so the figures match the published plan prices.
  const formatMoney = (n: number) => `₦${(n || 0).toLocaleString("en-NG")}`;
  const [paying, setPaying] = useState<"plan" | "sms" | null>(null);
  const [planChoice, setPlanChoice] = useState<string>("standard");
  const [bundle, setBundle] = useState<number>(SMS_BUNDLES[0].credits);

  // Which gateways the org has switched on, so we know what to offer.
  const { data: activeGateways = [] } = useQuery({
    queryKey: ["active-gateways", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("payment_gateway_config")
        .select("provider")
        .eq("org_id", orgId)
        .eq("is_active", true);
      return (data || []).map((c) => c.provider as string);
    },
    enabled: !!orgId,
  });

  const gateway = activeGateways[0] as "paystack" | "flutterwave" | undefined;
  const canPayOnline = !!gateway;

  const currentPlan = planByCode(subscription.planCode);
  const targetPlan = planByCode(planChoice) ?? PLANS[1];
  const termAmount = termCost(targetPlan, subscription.studentCount);

  const startPlanPayment = async () => {
    if (!canPayOnline || !orgId) return;
    setPaying("plan");
    try {
      const { data, error } = await supabase.functions.invoke("initiate-subscription-payment", {
        body: {
          purpose: "subscription",
          plan_code: targetPlan.code,
          provider: gateway,
          return_url: `${window.location.origin}${window.location.pathname}?provider=${gateway}&scope=billing`,
        },
      });
      if (error || data?.error || !data?.checkout_url) {
        toast.error(data?.error || getErrorMessage(error) || "Could not start this payment");
        return;
      }
      window.location.href = data.checkout_url as string;
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not start this payment"));
    } finally {
      setPaying(null);
    }
  };

  const startSmsPayment = async () => {
    if (!canPayOnline || !orgId) return;
    setPaying("sms");
    try {
      const { data, error } = await supabase.functions.invoke("initiate-subscription-payment", {
        body: {
          purpose: "sms_bundle",
          sms_credits: bundle,
          provider: gateway,
          return_url: `${window.location.origin}${window.location.pathname}?provider=${gateway}&scope=billing`,
        },
      });
      if (error || data?.error || !data?.checkout_url) {
        toast.error(data?.error || getErrorMessage(error) || "Could not start this payment");
        return;
      }
      window.location.href = data.checkout_url as string;
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not start this payment"));
    } finally {
      setPaying(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Billing & Plan</h1>
        <p className="text-sm text-muted-foreground">
          Your plan is billed per student, per term. SMS is a prepaid add-on you top up any time.
        </p>
      </div>

      {/* Current plan summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Current plan
            <Badge>{currentPlan?.name ?? subscription.planName}</Badge>
          </CardTitle>
          <CardDescription>
            {subscription.studentCount} students enrolled this term · {formatMoney(currentPlan?.pricePerStudentTerm ?? 0)}/student/term
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Term cost (current plan)</p>
            <p className="text-2xl font-bold">
              {formatMoney(termCost(currentPlan ?? PLANS[0], subscription.studentCount))}
            </p>
            <p className="text-xs text-muted-foreground">{currency} · per current term</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">SMS balance</p>
            <p className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-accent" />
              {subscription.smsBalance.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Prepaid credits · {subscription.studentCount > 0 ? `${subscription.studentCount} students` : "no students yet"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade / change plan */}
      <Card>
        <CardHeader>
          <CardTitle>Change plan</CardTitle>
          <CardDescription>
            Pay for the term ahead. The charge is your student count times the plan price.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={planChoice} onValueChange={setPlanChoice} className="grid gap-3 sm:grid-cols-3">
            {PLANS.map((plan) => (
              <Label
                key={plan.code}
                className="flex cursor-pointer flex-col gap-1 rounded-lg border p-4 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{plan.name}</span>
                  <RadioGroupItem value={plan.code} />
                </div>
                <span className="text-lg font-bold">{formatMoney(plan.pricePerStudentTerm)}</span>
                <span className="text-xs text-muted-foreground">per student / term</span>
                {plan.code === subscription.planCode && (
                  <Badge variant="secondary" className="mt-1 w-fit">Current</Badge>
                )}
              </Label>
            ))}
          </RadioGroup>

          <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">This term's charge</p>
              <p className="text-xs text-muted-foreground">
                {subscription.studentCount} students × {formatMoney(targetPlan.pricePerStudentTerm)}
              </p>
            </div>
            <p className="text-2xl font-bold">{formatMoney(termAmount)}</p>
          </div>

          {!canPayOnline && (
            <p className="flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4" /> No active payment gateway. Enable Paystack or Flutterwave in school payment settings to pay online.
            </p>
          )}
          <Button onClick={startPlanPayment} disabled={!canPayOnline || paying === "plan"} className="w-full sm:w-auto">
            {paying === "plan" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
            Pay {formatMoney(termAmount)} for this term
          </Button>
        </CardContent>
      </Card>

      {/* SMS bundle top-up */}
      <Card>
        <CardHeader>
          <CardTitle>Buy SMS credits</CardTitle>
          <CardDescription>
            SMS is a paid add-on. One credit sends one text to one parent or staff member.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={String(bundle)} onValueChange={(v) => setBundle(Number(v))} className="grid gap-3 sm:grid-cols-3">
            {SMS_BUNDLES.map((b) => (
              <Label
                key={b.credits}
                className="flex cursor-pointer flex-col gap-1 rounded-lg border p-4 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{b.label}</span>
                  <RadioGroupItem value={String(b.credits)} />
                </div>
                <span className="text-lg font-bold">{formatMoney(b.price)}</span>
              </Label>
            ))}
          </RadioGroup>

          <Button onClick={startSmsPayment} disabled={!canPayOnline || paying === "sms"} className="w-full sm:w-auto">
            {paying === "sms" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
            Buy {bundle.toLocaleString()} SMS for {formatMoney(SMS_BUNDLES.find((b) => b.credits === bundle)?.price ?? 0)}
          </Button>
        </CardContent>
      </Card>

      {subscription.aiEnabled && (
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="flex items-center gap-3 py-4">
            <Sparkles className="h-5 w-5 text-accent" />
            <p className="text-sm">AI insights are enabled on your plan.</p>
            <CheckCircle2 className="ml-auto h-5 w-5 text-success" />
          </CardContent>
        </Card>
      )}

      {/* After returning from checkout, refresh the subscription. */}
      <ReturnHandler onConfirm={refetch} />
    </div>
  );
}

/** When the payer returns from gateway checkout, ask the webhook to confirm. */
function ReturnHandler({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference") || params.get("trxref");
  const provider = params.get("provider");
  const scope = params.get("scope");

  if (scope !== "billing" || !reference || !provider) return null;

  const confirm = async () => {
    setConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke("subscription-webhook", {
        body: { reference, provider },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Confirmation failed. If you paid, your plan will update within a minute.");
      } else {
        toast.success(data?.reason === "already_recorded" ? "Already confirmed." : "Payment confirmed.");
        onConfirm();
        // Clean the query string.
        window.history.replaceState({}, "", window.location.pathname);
      }
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card className="border-accent/30">
      <CardContent className="flex items-center justify-between gap-3 py-4">
        <p className="text-sm">Just finished payment? Confirm it to update your plan.</p>
        <Button onClick={confirm} disabled={confirming} size="sm">
          {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          Confirm payment
        </Button>
      </CardContent>
    </Card>
  );
}
