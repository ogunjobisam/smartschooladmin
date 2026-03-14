import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, ChevronRight, ChevronLeft, Check, Loader2, Database } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

const steps = ["Organisation", "School", "Academic Year"];

const countries = [
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "GH", name: "Ghana", currency: "GHS" },
  { code: "KE", name: "Kenya", currency: "KES" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
];

export default function Onboarding() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [seedDemo, setSeedDemo] = useState(true);

  const [orgName, setOrgName] = useState("");
  const [country, setCountry] = useState("NG");
  const [currency, setCurrency] = useState("NGN");

  const [schoolName, setSchoolName] = useState("");
  const [campusName, setCampusName] = useState("Main Campus");

  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [terms, setTerms] = useState(["Term 1", "Term 2", "Term 3"]);

  const handleCountryChange = (code: string) => {
    setCountry(code);
    const c = countries.find((c) => c.code === code);
    if (c) setCurrency(c.currency);
  };

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Call edge function to set up org, school, role (bypasses RLS)
      const { data: setupData, error: setupErr } = await supabase.functions.invoke("setup-organisation", {
        body: { orgName, country, currency, schoolName, campusName, academicYear, terms },
      });
      if (setupErr) throw setupErr;
      if (setupData?.error) throw new Error(setupData.error);

      const { org_id, school_id } = setupData;

      // Seed demo data if requested
      if (seedDemo) {
        toast.info("Seeding demo data…");
        const resp = await supabase.functions.invoke("seed-demo-data", {
          body: { org_id, school_id },
        });
        if (resp.error) {
          console.error("Seed error:", resp.error);
          toast.warning("Demo data seeding had issues, but your account is ready.");
        } else {
          const counts = resp.data?.counts;
          toast.success(`Seeded ${counts?.students} students, ${counts?.staff} staff, ${counts?.invoices} invoices`);
        }
      }

      toast.success("Setup complete! Welcome to Smart School Admin.");
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err.message || "Setup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Set up SchoolFlow</h1>
          <p className="text-sm text-muted-foreground">Let's get your school management platform ready</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                i < step ? "bg-success text-success-foreground" :
                i === step ? "bg-accent text-accent-foreground" :
                "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`hidden text-sm sm:block ${i === step ? "font-medium" : "text-muted-foreground"}`}>{s}</span>
              {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <div className="rounded-lg border bg-card p-6">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Organisation Name</Label>
                <Input placeholder="e.g. Okonkwo Education Group" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select value={country} onValueChange={handleCountryChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>School Name</Label>
                <Input placeholder="e.g. Bright Future Academy" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Campus Name</Label>
                <Input placeholder="e.g. Main Campus" value={campusName} onChange={(e) => setCampusName(e.target.value)} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Input placeholder="e.g. 2025/2026" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Terms / Periods</Label>
                {terms.map((t, i) => (
                  <Input
                    key={i}
                    value={t}
                    onChange={(e) => {
                      const newTerms = [...terms];
                      newTerms[i] = e.target.value;
                      setTerms(newTerms);
                    }}
                    placeholder={`Term ${i + 1}`}
                  />
                ))}
              </div>
              <div className="flex items-center space-x-2 rounded-md border border-dashed p-3">
                <Checkbox id="seed" checked={seedDemo} onCheckedChange={(c) => setSeedDemo(!!c)} />
                <div className="flex-1">
                  <label htmlFor="seed" className="text-sm font-medium cursor-pointer">Load demo data</label>
                  <p className="text-xs text-muted-foreground">Add 60 students, 15 staff, invoices, payments & payroll for testing.</p>
                </div>
                <Database className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">Default Nigerian secondary school classes (JSS1–SS3) and fee categories will be created automatically.</p>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={
                (step === 0 && !orgName) || (step === 1 && !schoolName)
              }>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                Complete Setup
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
