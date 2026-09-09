import { Link } from "react-router-dom";
import { CheckCircle2, Sparkles } from "lucide-react";
import { PLANS } from "@/lib/subscriptions";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <Logo variant="mark" alt="" className="h-7 w-7" />
            <span className="text-lg font-bold">SmartSchoolAdmin</span>
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" asChild><Link to="/login">Sign in</Link></Button>
            <Button asChild><Link to="/signup">Get started</Link></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-3">Pricing</Badge>
          <h1 className="text-3xl font-bold sm:text-4xl">Simple, per-student pricing</h1>
          <p className="mt-3 text-muted-foreground">
            Pay per term, per student. No setup fees, no per-class charges. Start free up to 50 students
            and upgrade when your school grows.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <Card key={plan.code} className={plan.highlight ? "border-accent shadow-lg" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {plan.highlight && <Badge>Popular</Badge>}
                </CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">₦{plan.pricePerStudentTerm.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground"> /student/term</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {plan.studentLimit ? `Up to ${plan.studentLimit} students` : "Unlimited students"}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-6 w-full" variant={plan.highlight ? "default" : "outline"}>
                  <Link to="/signup">Get started</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-10 border-accent/30 bg-accent/5">
          <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-accent" />
              <div>
                <p className="font-medium">SMS add-on</p>
                <p className="text-sm text-muted-foreground">
                  Prepaid text-message credits for parents and staff. ₦2,000 for 400, ₦8,000 for 2,000, ₦18,000 for 5,000.
                </p>
              </div>
            </div>
            <Button asChild variant="outline"><Link to="/signup">Add SMS later</Link></Button>
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Prices are in Nigerian Naira (₦). Pay per term via Paystack or Flutterwave.
          Annual billing at a ~10% discount is available on request.
        </p>
      </main>
    </div>
  );
}
