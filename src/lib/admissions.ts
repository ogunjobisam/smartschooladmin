import type { Enums } from "@/integrations/supabase/types";
import type { SchoolSection } from "@/lib/sections";

export type ApplicationStatus = Enums<"application_status">;

export interface StatusDefinition {
  value: ApplicationStatus;
  label: string;
  /** What a school office actually does at this stage. */
  hint: string;
  /** Whether the application is still moving. */
  open: boolean;
}

/**
 * The admissions funnel, in the order a family passes through it.
 *
 * "accepted" and "enrolled" are deliberately separate: a school offers a place
 * and the family accepts it well before anyone creates a student record, and
 * conflating the two would have the roll call include children who never turned
 * up.
 */
export const APPLICATION_STATUSES: StatusDefinition[] = [
  { value: "new", label: "New", hint: "Just arrived. Nobody has looked at it yet.", open: true },
  { value: "reviewing", label: "Reviewing", hint: "Someone is checking the details and the child's records.", open: true },
  { value: "interview", label: "Interview", hint: "An assessment or interview has been arranged.", open: true },
  { value: "offered", label: "Offered", hint: "A place has been offered. Waiting on the family.", open: true },
  { value: "accepted", label: "Accepted", hint: "The family has accepted. Ready to become a student.", open: true },
  { value: "enrolled", label: "Enrolled", hint: "Now a student on the roll.", open: false },
  { value: "rejected", label: "Not offered", hint: "The school declined the application.", open: false },
  { value: "withdrawn", label: "Withdrawn", hint: "The family withdrew the application.", open: false },
];

const BY_VALUE = new Map(APPLICATION_STATUSES.map((s) => [s.value, s]));

export function statusLabel(status: ApplicationStatus): string {
  return BY_VALUE.get(status)?.label ?? status;
}

export function statusHint(status: ApplicationStatus): string {
  return BY_VALUE.get(status)?.hint ?? "";
}

export function isOpenStatus(status: ApplicationStatus): boolean {
  return BY_VALUE.get(status)?.open ?? false;
}

/** The stages that make up the funnel proper, excluding the ways out of it. */
export const FUNNEL_STAGES: ApplicationStatus[] = ["new", "reviewing", "interview", "offered", "accepted", "enrolled"];

/**
 * Where an application may go next.
 *
 * Moving forward one step, or out of the funnel, is always allowed. Going
 * backwards is allowed too — an interview gets rescheduled, an offer gets
 * withdrawn and reconsidered — but "enrolled" is a fact about the roll, not an
 * opinion, so nothing moves out of it here.
 */
export function nextStatuses(status: ApplicationStatus): ApplicationStatus[] {
  if (status === "enrolled") return [];
  return APPLICATION_STATUSES
    .map((s) => s.value)
    // Enrolment happens by converting the application to a student, never by
    // picking it from a menu, or the roll and the funnel would disagree.
    .filter((s) => s !== status && s !== "enrolled");
}

export interface FunnelApplication {
  status: ApplicationStatus;
  created_at: string;
}

/** How many applications sit at each stage, including the empty ones. */
export function funnelCounts(applications: FunnelApplication[]): Record<ApplicationStatus, number> {
  const counts = Object.fromEntries(
    APPLICATION_STATUSES.map((s) => [s.value, 0])
  ) as Record<ApplicationStatus, number>;
  for (const application of applications) {
    if (application.status in counts) counts[application.status] += 1;
  }
  return counts;
}

/** Whole days since the application arrived. */
export function daysWaiting(createdAt: string, now: Date = new Date()): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now.getTime() - created) / 86_400_000));
}

/**
 * An application nobody has moved in a week. The whole reason for the pipeline
 * is that these stop being invisible.
 */
export function isStale(application: FunnelApplication, now: Date = new Date(), thresholdDays = 7): boolean {
  if (!isOpenStatus(application.status)) return false;
  return daysWaiting(application.created_at, now) >= thresholdDays;
}

/** Age in whole years on a given date, or null if the birth date is unusable. */
export function ageOn(dateOfBirth: string | null | undefined, on: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;

  let age = on.getFullYear() - born.getFullYear();
  const monthDiff = on.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < born.getDate())) age -= 1;
  return age < 0 ? null : age;
}

/**
 * The section a child of this age would normally start in — a suggestion for
 * the office, not a decision. Returns null when the date of birth is missing or
 * the child is outside the ages the school bands cover.
 */
export function suggestSection(dateOfBirth: string | null | undefined, on: Date = new Date()): SchoolSection | null {
  const age = ageOn(dateOfBirth, on);
  if (age === null) return null;
  if (age <= 2) return "toddler";
  if (age <= 5) return "nursery";
  if (age <= 11) return "primary";
  if (age <= 18) return "secondary";
  return null;
}

/**
 * The public admissions address for a slug, as an absolute URL the office can
 * paste into WhatsApp.
 */
export function admissionsUrl(slug: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/apply/${slug}`;
}

/**
 * Slugs no school may take. Mirrors public.reserved_school_slugs() in
 * supabase/migrations/20260927190000_school_web_address.sql, which is what
 * actually enforces it; this copy only lets the settings page say so before
 * Save. src/test/admissions.test.ts fails if the two drift, or if a top-level
 * route in src/App.tsx is missing — the beta address is smartschooladmin.app/<slug>,
 * so a school called "login" would sit on top of the login page.
 */
export const RESERVED_SLUGS: readonly string[] = [
  // hostnames
  "www", "app", "admin", "api", "mail", "demo",
  "assets", "auth", "blog", "cdn", "docs", "ftp", "help", "static",
  "status", "support", "smtp", "staging", "test",
  // top-level routes in src/App.tsx
  "achievements", "admissions", "announcements", "apply", "approvals",
  "arrears", "attendance", "audit-log", "billing", "cbt", "dashboard", "events",
  "exams", "fees", "forgot-password", "group-overview", "guardians",
  "invoices", "login", "message-delivery", "my-pay",
  "notification-settings", "notification-templates", "notifications",
  "onboarding", "parent", "payments", "payroll", "performance", "pricing",
  "privacy", "reports", "reset-password", "roles", "school-profile",
  "settings", "signup", "staff", "staff-portal", "student", "students",
  "terms", "timetable", "transport", "users", "wall",
];

const RESERVED = new Set(RESERVED_SLUGS);

/**
 * Why a cleaned slug cannot be saved, or null if it can. Same rules as the
 * database trigger. The slug a school already has is always acceptable: rules
 * apply to changes, so a school saved before them is not locked out of Save.
 */
export function slugProblem(slug: string, saved?: string | null): string | null {
  if (slug === (saved ?? null)) return null;
  if (slug.length < 3) return "Use at least 3 characters.";
  if (slug.length > 60) return "Use 60 characters or fewer.";
  if (RESERVED.has(slug)) return `"${slug}" is reserved. Try your school's name instead.`;
  return null;
}

/** Turn a school name into a usable slug. */
export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
