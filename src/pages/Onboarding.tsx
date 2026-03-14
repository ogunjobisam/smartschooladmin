import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, ChevronRight, ChevronLeft, Check, Loader2, Database, Plus, X } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

const steps = ["Organisation", "School", "Classes", "Academic Year"];

const countries = [
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
];

const CLASS_PRESETS: Record<string, string[]> = {
  NG: ["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3"],
  GB: ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13"],
  US: ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"],
  GH: ["JHS 1", "JHS 2", "JHS 3", "SHS 1", "SHS 2", "SHS 3"],
  KE: ["Form 1", "Form 2", "Form 3", "Form 4"],
  DEFAULT: ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6"],
};

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

  const [classes, setClasses] = useState<string[]>(CLASS_PRESETS["NG"]);
  const [newClass, setNewClass] = useState("");

  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [terms, setTerms] = useState(["Term 1", "Term 2", "Term 3"]);

  const handleCountryChange = (code: string) => {
    setCountry(code);
    const c = countries.find((c) => c.code === code);
    if (c) setCurrency(c.currency);
    // Update class presets based on country
    setClasses(CLASS_PRESETS[code] || CLASS_PRESETS["DEFAULT"]);
  };

  const handleAddClass = () => {
    if (newClass.trim() && !classes.includes(newClass.trim())) {
      setClasses([...classes, newClass.trim()]);
      setNewClass("");
    }
  };

  const handleRemoveClass = (index: number) => {
    setClasses(classes.filter((_, i) => i !== index));
  };

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: setupData, error: setupErr } = await supabase.functions.invoke("setup-organisation", {
        body: { orgName, country, currency, schoolName, campusName, academicYear, terms, classes },
      });
      if (setupErr) throw setupErr;
      if (setupData?.error) throw new Error(setupData.error);

      const { org_id, school_id } = setupData;

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

  const canNext = (step === 0 && orgName) || (step === 1 && schoolName) || (step === 2 && classes.length > 0) || step === 3;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Set up Smart School Admin</h1>
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
              <div>
                <Label>Classes / Grade Levels</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  We've pre-filled classes based on your country. Add, remove, or rename as needed.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {classes.map((c, i) => (
                  <div key={i} className="flex items-center gap-1 rounded-md border bg-muted/50 px-2.5 py-1.5 text-sm">
                    <span>{c}</span>
                    <button onClick={() => handleRemoveClass(i)} className="ml-1 rounded-sm hover:bg-muted p-0.5">
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a class…"
                  value={newClass}
                  onChange={(e) => setNewClass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddClass())}
                  className="flex-1"
                />
                <Button variant="outline" size="icon" onClick={handleAddClass} disabled={!newClass.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {classes.length === 0 && (
                <p className="text-xs text-destructive">Add at least one class to continue.</p>
              )}
            </div>
          )}

          {step === 3 && (
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
                  <p className="text-xs text-muted-foreground">Add sample students, staff, invoices, payments & payroll for testing.</p>
                </div>
                <Database className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
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
