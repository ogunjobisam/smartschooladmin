import { Link } from "react-router-dom";
import { GraduationCap, CreditCard, Users, BarChart3, Shield, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import dashboardMockup from "@/assets/dashboard-mockup.png";

const features = [
  { icon: GraduationCap, title: "Student Management", desc: "Enrol, track, and manage students with class assignments and guardian linking." },
  { icon: CreditCard, title: "Fee & Invoice Engine", desc: "Create fee schedules, generate invoices in bulk, and record payments instantly." },
  { icon: Users, title: "Staff & Payroll", desc: "Manage staff records, run payroll, and handle approvals — all in one place." },
  { icon: BarChart3, title: "Reports & Insights", desc: "Real-time dashboards with revenue, arrears, and enrolment analytics." },
  { icon: Shield, title: "Role-Based Access", desc: "Granular permissions for proprietors, principals, bursars, teachers, and parents." },
  { icon: Zap, title: "Bulk Operations", desc: "CSV import for students and staff. Generate hundreds of invoices in seconds." },
];

export default function Landing() {
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
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/signup">
            <Button size="lg" className="gap-2 text-sm">
              Start Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="outline" size="lg" className="text-sm">
              Log in
            </Button>
          </Link>
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
          <Link to="/signup">
            <Button size="lg" className="mt-6 gap-2 text-sm">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} SmartSchool. All rights reserved.</span>
          <div className="flex gap-4">
            <Link to="/login" className="hover:text-foreground transition-colors">Log in</Link>
            <Link to="/signup" className="hover:text-foreground transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
