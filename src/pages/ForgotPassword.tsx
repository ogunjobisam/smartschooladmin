import { Seo } from "@/components/seo/Seo";
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <>
      <Seo title={"Reset your password"} description={"Request a password reset link for your Smart School Admin account."} path="/forgot-password" noIndex />
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Reset password</h1>
          <p className="text-sm text-muted-foreground">We'll send you a link to reset your password</p>
        </div>

        {sent ? (
          <div className="rounded-lg border bg-card p-6 text-center space-y-3">
            <p className="text-sm text-card-foreground">Check your email for a password reset link.</p>
            <Link to="/login"><Button variant="outline" size="sm" className="gap-1.5"><ArrowLeft className="h-3.5 w-3.5" /> Back to login</Button></Link>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@school.ng" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send reset link
            </Button>
            <Link to="/login" className="block text-center text-sm text-muted-foreground hover:text-accent">Back to login</Link>
          </form>
        )}
      </div>
    </div>
    </>
  );
}
