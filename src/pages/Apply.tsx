import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, GraduationCap, Loader2, MapPin, Megaphone, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { suggestSection } from "@/lib/admissions";
import { SCHOOL_SECTIONS, sectionLabel, type SchoolSection } from "@/lib/sections";

interface PublicNotice {
  id: string;
  title: string;
  body: string | null;
}

interface PublicSchool {
  name: string;
  tagline: string | null;
  logo_url: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  intro: string | null;
  admissions_open: boolean;
  sections: SchoolSection[];
}

const SOURCES = ["A friend or family member", "Facebook or Instagram", "A church or mosque", "Walked or drove past", "A search engine", "Somewhere else"];

const emptyForm = {
  applicant_first_name: "",
  applicant_last_name: "",
  date_of_birth: "",
  gender: "",
  section: "",
  previous_school: "",
  guardian_name: "",
  guardian_email: "",
  guardian_phone: "",
  guardian_address: "",
  source: "",
  message: "",
};

/**
 * The public application form. Nobody here is signed in, so every read and write
 * goes through the `admissions` edge function rather than the browser client.
 */
export default function Apply() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState({ ...emptyForm });
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const { data: page, isLoading, isError } = useQuery({
    queryKey: ["public-school", slug],
    queryFn: async () => {
      const { data, error: fnError } = await supabase.functions.invoke("admissions", {
        body: { action: "school", slug },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      return { school: data.school as PublicSchool, notices: (data.notices || []) as PublicNotice[] };
    },
    enabled: !!slug,
    retry: false,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error: fnError } = await supabase.functions.invoke("admissions", {
        body: { action: "apply", slug, ...form },
      });
      // An edge function that answers 4xx surfaces as fnError with the body
      // hidden, so the readable reason has to be dug out of data when present.
      if (data?.error) throw new Error(data.error);
      if (fnError) throw fnError;
      return data as { reference: string };
    },
    onSuccess: (data) => setReference(data.reference),
    onError: (err) => setError(getErrorMessage(err, "We could not send your application. Please try again.")),
  });

  const school = page?.school;
  const notices = page?.notices ?? [];

  // Offer the band their age suggests, but let the parent overrule it.
  const suggested = suggestSection(form.date_of_birth || null);
  const sectionValue = form.section || (suggested && school?.sections.includes(suggested) ? suggested : "");

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-6 py-16">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !school) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <GraduationCap className="mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">This admissions page is not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be out of date. Please check with the school for their current
          application link.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5">
          {school.logo_url ? (
            <img src={school.logo_url} alt="" className="h-11 w-11 rounded-lg object-contain" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
          )}
          <div>
            <p className="font-semibold leading-tight">{school.name}</p>
            {school.tagline && <p className="text-xs text-muted-foreground">{school.tagline}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        {notices.length > 0 && (
          <section className="space-y-2">
            {notices.map((notice) => (
              <div key={notice.id} className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <p className="flex items-start gap-2 text-sm font-medium">
                  <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {notice.title}
                </p>
                {notice.body && (
                  <p className="mt-1 whitespace-pre-wrap pl-6 text-sm text-muted-foreground">{notice.body}</p>
                )}
              </div>
            ))}
          </section>
        )}

        {reference ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <h1 className="text-xl font-semibold">Application received</h1>
              <p className="max-w-md text-sm text-muted-foreground">
                Thank you. {school.name} has your application and will be in touch.
                Please keep your reference — quote it whenever you contact the school.
              </p>
              <p className="rounded-md border bg-muted px-4 py-2 font-mono text-lg tracking-wide">
                {reference}
              </p>
              {(school.phone || school.email) && (
                <p className="text-xs text-muted-foreground">
                  {school.phone && <>Call {school.phone}</>}
                  {school.phone && school.email && " · "}
                  {school.email}
                </p>
              )}
            </CardContent>
          </Card>
        ) : !school.admissions_open ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <h1 className="text-xl font-semibold">Admissions are closed at the moment</h1>
              <p className="max-w-md text-sm text-muted-foreground">
                {school.name} is not taking applications right now. Please contact the
                school to ask when the next intake opens.
              </p>
              {(school.phone || school.email) && (
                <p className="text-sm">
                  {school.phone && (
                    <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{school.phone}</span>
                  )}
                  {school.phone && school.email && <span className="px-2">·</span>}
                  {school.email}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Apply to {school.name}</CardTitle>
              <CardDescription>
                {school.intro ||
                  "Tell us about your child and how to reach you. The school will contact you about the next steps."}
              </CardDescription>
              {school.address && (
                <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {school.address}
                </p>
              )}
            </CardHeader>

            <CardContent className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">About the child</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="first">First name *</Label>
                    <Input id="first" value={form.applicant_first_name} onChange={(e) => set("applicant_first_name", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="last">Last name *</Label>
                    <Input id="last" value={form.applicant_last_name} onChange={(e) => set("applicant_last_name", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dob">Date of birth</Label>
                    <Input id="dob" type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gender">Gender</Label>
                    <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                      <SelectTrigger id="gender"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="section">Applying for</Label>
                    <Select value={sectionValue} onValueChange={(v) => set("section", v)}>
                      <SelectTrigger id="section"><SelectValue placeholder="Select a section" /></SelectTrigger>
                      <SelectContent>
                        {school.sections.map((s) => (
                          <SelectItem key={s} value={s}>
                            {sectionLabel(s)}
                            <span className="text-muted-foreground">
                              {" "}· {SCHOOL_SECTIONS.find((d) => d.value === s)?.ageRange}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="previous">Present or previous school</Label>
                    <Input id="previous" value={form.previous_school} onChange={(e) => set("previous_school", e.target.value)} />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">How to reach you</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="guardian">Parent or guardian name *</Label>
                    <Input id="guardian" value={form.guardian_name} onChange={(e) => set("guardian_name", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone number *</Label>
                    <Input id="phone" type="tel" value={form.guardian_phone} onChange={(e) => set("guardian_phone", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={form.guardian_email} onChange={(e) => set("guardian_email", e.target.value)} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="address">Home address</Label>
                    <Input id="address" value={form.guardian_address} onChange={(e) => set("guardian_address", e.target.value)} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="source">How did you hear about us?</Label>
                    <Select value={form.source} onValueChange={(v) => set("source", v)}>
                      <SelectTrigger id="source"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="message">Anything else we should know?</Label>
                    <Textarea id="message" rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} />
                  </div>
                </div>
              </section>

              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Fields marked * are required. Your details are shared only with {school.name}.
                </p>
                <Button
                  className="gap-1.5"
                  disabled={submit.isPending}
                  onClick={() => submit.mutate()}
                >
                  {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send application
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
