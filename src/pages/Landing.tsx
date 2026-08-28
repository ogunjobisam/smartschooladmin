import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  GraduationCap, CreditCard, Users, BarChart3, Shield, Zap, ArrowRight,
  FlaskConical, Loader2, Clock, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import heroIllustration from "@/assets/hero-illustration.png";
import { DEMO_PERSONAS, DEMO_DURATION_HOURS, startDemoSession, type DemoRole } from "@/lib/demo";

const features = [
  { icon: GraduationCap, title: "Student Management", desc: "Enrol, track, and manage students with class assignments and guardian linking." },
  { icon: CreditCard, title: "Fee & Invoice Engine", desc: "Create fee schedules, generate invoices in bulk, and record payments instantly." },
  { icon: Users, title: "Staff & Payroll", desc: "Manage staff records, run payroll, and handle approvals — all in one place." },
  { icon: BarChart3, title: "Reports & Insights", desc: "Real-time dashboards with revenue, arrears, and enrolment analytics." },
  { icon: Shield, title: "Role-Based Access", desc: "Granular permissions for proprietors, principals, bursars, teachers, and parents." },
  { icon: Zap, title: "Bulk Operations", desc: "CSV import for students and staff. Generate hundreds of invoices in seconds." },
];

export default function Landing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [starting, setStarting] = useState<DemoRole | null>(null);
  const demoExpired = params.get("demo") === "expired";

  /**
   * One click, no sign-up: the server builds a private sandbox school, signs
   * the visitor in as the persona they picked, and lands them in the app.
   */
  const startDemo = async (role: DemoRole) => {
    setStarting(role);
    try {
      await startDemoSession(role);
      toast.success(`Demo started — you have ${DEMO_DURATION_HOURS} hours`);
      navigate(role === "parent" ? "/parent" : role === "student" ? "/student" : "/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the demo");
      setStarting(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <GraduationCap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">SmartSchool</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
          <Zap className="h-3 w-3 text-accent" /> Built for African schools
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-foreground leading-[1.1]">
          School admin,
          <br />
          <span className="text-accent">simplified.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg leading-relaxed">
          Fees, invoices, payroll, student records — one platform to run your entire school group. No spreadsheets. No paper trails.
        </p>
        {demoExpired && (
          <Alert className="mx-auto mt-8 max-w-xl text-left">
            <Trash2 className="h-4 w-4" />
            <AlertDescription>
              Your demo session has ended and the sample data has been deleted. Start a fresh one
              below whenever you like.
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" className="gap-2 text-sm" asChild>
            <a href="#demo">
              Try the live demo <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Link to="/signup">
            <Button variant="outline" size="lg" className="text-sm">
              Create an account
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="ghost" size="lg" className="text-sm">
              Log in
            </Button>
          </Link>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          No sign-up, no card. {DEMO_DURATION_HOURS}-hour sandbox, deleted automatically when it ends.
        </p>

        {/* Dashboard mockup */}
        <div className="mx-auto mt-16 max-w-4xl">
          <img
            src={heroIllustration}
            alt="SmartSchool platform showing student management, invoices, payroll, and analytics"
            className="w-full h-auto rounded-2xl"
            loading="lazy"
          />
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="border-t border-border/60 bg-muted/30 py-20 scroll-mt-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
              <FlaskConical className="h-3 w-3 text-accent" /> Live demo
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
              Walk through a real school, as any role
            </h2>
            <p className="mx-auto mt-3 text-sm text-muted-foreground">
              Pick a persona and we will build you a private sandbox school — pupils, classes,
              invoices, payments, exam results, payroll, a bus route and admission enquiries — then
              sign you straight in. Change anything you like: it is yours alone.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-foreground">
              <Clock className="h-3.5 w-3.5 text-accent" />
              Sessions last {DEMO_DURATION_HOURS} hours, then the sandbox and all its data are permanently deleted
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_PERSONAS.map((p) => (
              <div key={p.role} className="flex flex-col rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-card-foreground">{p.label}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
                <Button
                  className="mt-4 w-full gap-2 text-sm"
                  variant="outline"
                  disabled={!!starting}
                  onClick={() => startDemo(p.role as DemoRole)}
                >
                  {starting === p.role ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Building your school…
                    </>
                  ) : (
                    <>
                      Try as {p.label} <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            The demo is separate from a paid account — nothing you do here affects a real school, and
            no demo data is kept.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border/60 bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
            Everything you need to run your school
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-muted-foreground">
            From student enrolment to payroll — purpose-built for school groups across Nigeria and beyond.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <f.icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-card-foreground">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
            Ready to modernise your school?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            Set up in minutes. No credit card required.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup">
              <Button size="lg" className="gap-2 text-sm">
                Get Started Free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="gap-2 text-sm" asChild>
              <a href="#demo">
                <FlaskConical className="h-4 w-4" /> Try the demo first
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
          <div>
            <span>© {new Date().getFullYear()} SmartSchool. All rights reserved.</span>
            <p className="mt-1 text-[11px] text-muted-foreground/70">SmartSchoolAdmin is a trading name of Smartever Ltd. Registered in England &amp; Wales. Company No: 15038603</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link to="/login" className="hover:text-foreground transition-colors">Log in</Link>
            <Link to="/signup" className="hover:text-foreground transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
