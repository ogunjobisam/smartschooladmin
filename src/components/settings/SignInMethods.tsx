import { useCallback, useEffect, useState } from "react";
import { KeyRound, Link2, Loader2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Identity = {
  identity_id: string;
  provider: string;
  email?: string | null;
};

const LABELS: Record<string, string> = {
  email: "Email and password",
  google: "Google",
};

function label(provider: string) {
  return LABELS[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * The ways this person can get into their account.
 *
 * Adding Google here keeps one single account: the same students, roles and
 * history, reachable either by password or by the Google button on the sign-in
 * page. Signing in with Google *before* linking would make a second, empty
 * account instead, so the link is always made from inside the account.
 */
export function SignInMethods({ accountEmail }: { accountEmail?: string | null }) {
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) {
      setIdentities([]);
      return;
    }
    setIdentities((data?.identities ?? []) as Identity[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const linked = new Set((identities ?? []).map((i) => i.provider));

  async function linkGoogle() {
    setBusy("google");
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/settings/preferences` },
    });
    if (error) {
      setBusy(null);
      toast.error(
        error.message.toLowerCase().includes("manual linking")
          ? "Linking sign-in methods is not switched on for this app yet."
          : error.message,
      );
    }
    // On success the browser leaves for Google and returns here afterwards.
  }

  async function unlink(identity: Identity) {
    // Removing the last method would lock the account out entirely.
    if ((identities?.length ?? 0) < 2) {
      toast.error("This is your only way in, so it cannot be removed.");
      return;
    }
    setBusy(identity.identity_id);
    const { error } = await supabase.auth.unlinkIdentity(identity as never);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${label(identity.provider)} removed from your account.`);
    void load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> How you sign in
        </CardTitle>
        <CardDescription>
          Add Google to {accountEmail || "your account"} so either sign-in brings you to the same
          place, with the same schools and permissions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {identities === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your sign-in methods…
          </div>
        ) : (
          <>
            {identities.map((identity) => (
              <div
                key={identity.identity_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label(identity.provider)}</p>
                  {identity.email && (
                    <p className="truncate text-xs text-muted-foreground">{identity.email}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Active</Badge>
                  {identities.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unlink(identity)}
                      disabled={busy === identity.identity_id}
                    >
                      {busy === identity.identity_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Unlink className="h-4 w-4" />
                      )}
                      <span className="ml-1 hidden sm:inline">Remove</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {!linked.has("google") && (
              <Button onClick={linkGoogle} disabled={busy === "google"} className="w-full sm:w-auto">
                {busy === "google" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-2 h-4 w-4" />
                )}
                Add Google sign-in
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
