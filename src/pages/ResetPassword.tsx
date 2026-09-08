import { Seo } from "@/components/seo/Seo";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * The recovery link hands us a session, not a fragment we can read later: the
 * Supabase client consumes `#access_token=...&type=recovery` (or `?code=`)
 * before this component mounts. So we wait for a session instead of reading
 * the URL — the old fragment check bounced people straight back to login.
 */
export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !cancelled) {
        setReady(true);
        setChecking(false);
      }
    });

    const check = async () => {
      // A PKCE-style link arrives as ?code=... and needs exchanging.
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.error("Recovery code exchange failed:", error);
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setReady(true);
        setChecking(false);
        return;
      }
      // Give the client a moment to process a hash link, then give up.
      setTimeout(async () => {
        const { data: { session: late } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (late) setReady(true);
        else {
          toast.error("This password reset link is invalid or has expired. Please request a new one.");
          navigate("/forgot-password", { replace: true });
        }
        setChecking(false);
      }, 1500);
    };

    check();
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [navigate]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("The two passwords do not match.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Sign out so the new password is what gets them back in — proof it works.
    await supabase.auth.signOut();
    toast.success("Password updated. Please sign in with your new password.");
    navigate("/login", { replace: true });
  };

  return (
    <>
      <Seo title={"Choose a new password"} description={"Set a new password for your SmartSchoolAdmin account."} path="/reset-password" noIndex />
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Set new password</h1>
          <p className="text-sm text-muted-foreground">Enter your new password below</p>
        </div>

        {checking && !ready ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your reset link…
          </div>
        ) : (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !ready}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
    </>
  );
}
