import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [schoolBrand, setSchoolBrand] = useState<{ name: string; logo_url: string | null; primary_color: string | null } | null>(null);

  useEffect(() => {
    const schoolSlug = searchParams.get("school");
    if (!schoolSlug) return;
    supabase
      .from("schools")
      .select("name, logo_url, primary_color")
      .eq("id", schoolSlug)
      .maybeSingle()
      .then(({ data }) => { if (data) setSchoolBrand(data); });
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          {schoolBrand?.logo_url ? (
            <Avatar className="h-12 w-12 rounded-xl">
              <AvatarImage src={schoolBrand.logo_url} alt={schoolBrand.name} />
              <AvatarFallback className="rounded-xl bg-primary text-primary-foreground">{schoolBrand.name[0]}</AvatarFallback>
            </Avatar>
          ) : (
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary"
              style={schoolBrand?.primary_color ? { backgroundColor: schoolBrand.primary_color } : undefined}
            >
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{schoolBrand?.name || "Smart School Admin"}</h1>
          <p className="text-sm text-muted-foreground">Sign in to manage your schools</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@school.ng" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-xs text-accent hover:underline">Forgot password?</Link>
            </div>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign in
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/signup" className="text-accent hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
