import { Seo } from "@/components/seo/Seo";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  GraduationCap, CreditCard, Users, Zap, ArrowRight,
  FlaskConical, Loader2, Clock, Trash2, CalendarDays, BellRing,
  FileText, Bus, Award, UserRoundCheck, CircleCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import heroIllustration from "@/assets/hero-illustration.png";
import { useAuth } from "@/contexts/AuthContext";
import { portalPathForRole } from "@/lib/access";
import {
  DEMO_PERSONAS, DEMO_DURATION_HOURS, startDemoSession, requestDemoCleanup, clearDemoSession,
  type DemoRole,
} from "@/lib/demo";

const features = [
  { icon: GraduationCap, title: "Students & admissions", desc: "Move applicants from enquiry to enrolment, keep complete records, and link every child to the right class and guardian.", tone: "coral" },
  { icon: CreditCard, title: "Fees & payments", desc: "Issue invoices in bulk, collect online payments, follow arrears, and generate branded receipts and statements.", tone: "teal" },
  { icon: UserRoundCheck, title: "Attendance & alerts", desc: "Take the register quickly and keep families informed when a child is absent or late.", tone: "gold" },
  { icon: FileText, title: "Exams & report cards", desc: "Enter scores, publish results, and give families polished report cards and transcripts they can download.", tone: "violet" },
  { icon: Users, title: "Staff & payroll", desc: "Manage staff records, salaries, approvals and payslips without juggling disconnected files.", tone: "coral" },
  { icon: CalendarDays, title: "Timetables & events", desc: "Schedule weekly lessons, manage changes, publish events and let families add dates to their calendars.", tone: "teal" },
  { icon: BellRing, title: "Messages that arrive", desc: "Send announcements, reminders and account updates by email, SMS and in-app notification.", tone: "gold" },
  { icon: Award, title: "Achievements that matter", desc: "Celebrate pupils on a public achievement wall and create branded certificates for every milestone.", tone: "violet" },
  { icon: Bus, title: "Transport & operations", desc: "Track routes and riders alongside the rest of each pupil’s school record.", tone: "coral" },
];

const toneClasses: Record<string, string> = {
  coral: "bg-coral/12 text-coral",
  teal: "bg-teal/12 text-teal",
  gold: "bg-gold/18 text-gold-foreground dark:text-gold",
  violet: "bg-violet/12 text-violet",
};

const problems = [
  "Fees scattered across bank alerts, notebooks and spreadsheets",
  "Parents calling because results, balances and attendance are unclear",
  "Staff repeating the same data entry across disconnected records",
];

const proofPoints = [
  { value: "One record", label: "from admission to graduation" },
  { value: "Every role", label: "gets the right view and access" },
  { value: "Your school", label: "on every document and message" },
];

export default function Landing() {
  const navigate = useNavigate();
  const { user, loading, userRole } = useAuth();
  const [params] = useSearchParams();
  const [starting, setStarting] = useState<DemoRole | null>(null);
  const demoState = params.get("demo");
  const demoExpired = demoState === "expired" || demoState === "ended";

  // Sweep any sandbox whose four hours are up — this catches visitors who
  // simply closed the tab instead of ending their demo.
  useEffect(() => {
    clearDemoSession();
    void requestDemoCleanup();
  }, []);

  // A full-page Google OAuth flow returns to the public site root. Once the
  // restored session and role are ready, continue into the account instead of
  // leaving the signed-in user on the marketing page with no visible result.
  useEffect(() => {
    if (loading || !user) return;
    navigate(portalPathForRole(userRole) ?? "/dashboard", { replace: true });
  }, [loading, navigate, user, userRole]);

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
    <>
      <Seo
        title={"SmartSchoolAdmin — School Management Software for Private Schools"}
        description={"Run fees, invoicing, payments, payroll, attendance, exams and reports for your private school or school group in one place."}
        path="/"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SmartSchoolAdmin",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: "https://smartschooladmin.app/",
            description:
              "School management software for private schools and school groups: student records, fees and invoicing, payments, payroll, attendance, exams and reporting.",
            featureList: features.map((feature) => feature.title),
          },
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SmartSchoolAdmin",
            url: "https://smartschooladmin.app/",
            legalName: "Smartever Ltd",
          },
        ]}
      />
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center" aria-label="SmartSchoolAdmin home">
            <Logo variant="full" className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild><Link to="/pricing">Pricing</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link to="/login">Log in</Link></Button>
            <Button size="sm" asChild><Link to="/signup">Get started</Link></Button>
          </div>
        </div>
      </header>

      <main>
      <section className="relative isolate min-h-[680px] overflow-hidden border-b border-border/60 lg:min-h-[720px]">
        <img
          src={heroIllustration}
          alt="SmartSchoolAdmin dashboard bringing student records, invoicing, payroll and reports together"
          className="absolute inset-x-0 bottom-0 -z-20 h-[46%] w-full object-cover object-center opacity-90 sm:h-[52%] lg:inset-y-0 lg:left-auto lg:right-0 lg:h-full lg:w-[58%] lg:object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background to-background/15 lg:bg-gradient-to-r lg:from-background lg:via-background lg:to-background/10" />
        <div className="mx-auto flex max-w-7xl px-4 pb-72 pt-16 sm:px-6 sm:pb-80 sm:pt-20 lg:min-h-[720px] lg:items-center lg:pb-24 lg:pt-12">
          <div className="max-w-2xl lg:w-[54%]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal/25 bg-teal/10 px-3 py-1.5 text-xs font-semibold text-teal">
              <Zap className="h-3.5 w-3.5" /> Built for the way African schools work
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.08] text-foreground sm:text-5xl lg:text-6xl">
              Stop running your school from scattered spreadsheets.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              SmartSchoolAdmin brings fees, attendance, results, payroll and parent communication into one reliable place—so your team spends less time chasing records and more time helping pupils thrive.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="gap-2" asChild>
                <a href="#demo">Try a working school <ArrowRight className="h-4 w-4" /></a>
              </Button>
              <Button variant="outline" size="lg" asChild><Link to="/signup">Set up your school</Link></Button>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CircleCheck className="h-4 w-4 text-teal" /> No card required</span>
              <span className="inline-flex items-center gap-1.5"><CircleCheck className="h-4 w-4 text-teal" /> Private by design</span>
              <span className="inline-flex items-center gap-1.5"><CircleCheck className="h-4 w-4 text-teal" /> Works on any device</span>
            </div>
          </div>
        </div>
        {demoExpired && (
          <Alert className="absolute bottom-6 left-1/2 z-10 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 text-left">
            <Trash2 className="h-4 w-4" />
            <AlertDescription>
              Your demo session has ended and the sample data has been deleted. Start a fresh one
              below whenever you like.
            </AlertDescription>
          </Alert>
        )}

      </section>

      <section className="bg-primary py-8 text-primary-foreground">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 sm:grid-cols-3">
          {proofPoints.map((item) => (
            <div key={item.value} className="border-primary-foreground/20 sm:border-l sm:pl-6 first:border-l-0 first:pl-0">
              <p className="text-lg font-bold">{item.value}</p>
              <p className="mt-1 text-sm text-primary-foreground/70">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase text-coral">The daily reality</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-foreground sm:text-4xl">A growing school should not create growing confusion.</h2>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground">When information lives in too many places, payments get missed, families wait for answers and staff lose hours to avoidable admin.</p>
            </div>
            <div className="grid gap-3">
              {problems.map((problem, index) => (
                <div key={problem} className="flex items-start gap-4 border-b border-border py-5 first:border-t">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-bold ${index === 0 ? "bg-coral/12 text-coral" : index === 1 ? "bg-gold/18 text-gold-foreground dark:text-gold" : "bg-violet/12 text-violet"}`}>{index + 1}</span>
                  <p className="pt-1.5 text-base font-medium text-foreground">{problem}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="demo" className="scroll-mt-16 border-y border-border/60 bg-muted/40 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-violet/25 bg-violet/10 px-3 py-1.5 text-xs font-semibold text-violet">
              <FlaskConical className="h-3.5 w-3.5" /> Live, private demo
            </div>
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              Do not take our word for it. Run the school yourself.
            </h2>
            <p className="mx-auto mt-4 text-base leading-relaxed text-muted-foreground">
              Choose a role and step into a complete sample school with pupils, classes, invoices, payments, exam results, payroll, transport and admissions. Change anything you like.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-teal/10 px-3 py-1.5 text-xs font-medium text-teal">
              <Clock className="h-3.5 w-3.5" />
              Your private demo lasts {DEMO_DURATION_HOURS} hours, then deletes itself
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_PERSONAS.map((p) => (
              <article key={p.role} className="flex flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition-transform duration-200 hover:-translate-y-1">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary"><Users className="h-5 w-5" /></div>
                <h3 className="text-base font-semibold text-card-foreground">{p.label}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
                <Button
                  className="mt-4 w-full gap-2 text-sm"
                    variant="secondary"
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
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase text-teal">One connected school</p>
            <h2 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">Built around the work your team already does.</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">No patchwork of apps. Every update flows to the people and records that need it.</p>
          </div>
          <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="border-t border-border pt-6">
                <div className={`flex h-11 w-11 items-center justify-center rounded-md ${toneClasses[feature.tone]}`}>
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-primary py-20 text-primary-foreground">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-3xl">
            <div className="mb-5 flex gap-3">
              <span className="h-2 w-12 rounded-full bg-coral" />
              <span className="h-2 w-12 rounded-full bg-gold" />
              <span className="h-2 w-12 rounded-full bg-teal" />
            </div>
            <h2 className="text-3xl font-bold sm:text-4xl">Give your staff fewer things to chase—and your families fewer reasons to call.</h2>
            <p className="mt-4 text-base text-primary-foreground/75">Bring the whole school together in one clear, secure system.</p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Button size="lg" variant="secondary" className="gap-2" asChild>
              <Link to="/signup">Get started <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button size="lg" className="border border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10" asChild>
              <a href="#demo"><FlaskConical className="h-4 w-4" /> Try the demo</a>
            </Button>
          </div>
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <span>© {new Date().getFullYear()} SmartSchoolAdmin. All rights reserved.</span>
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
    </>
  );
}
