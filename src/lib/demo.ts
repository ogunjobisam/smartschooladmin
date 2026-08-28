import { supabase } from "@/integrations/supabase/client";

/** Personas a visitor can try in the demo. */
export const DEMO_PERSONAS = [
  {
    role: "proprietor",
    label: "Proprietor",
    desc: "Group-wide view: revenue, arrears and performance across every school.",
  },
  {
    role: "principal",
    label: "Principal",
    desc: "Run one school: students, staff, exams, attendance and admissions.",
  },
  {
    role: "teacher",
    label: "Teacher",
    desc: "Your classes only: mark attendance and enter exam scores.",
  },
  {
    role: "parent",
    label: "Parent",
    desc: "A guardian's view: fees, results, bus route, notices and events.",
  },
  {
    role: "student",
    label: "Student",
    desc: "The pupil portal: own results, attendance and invoices.",
  },
] as const;

export type DemoRole = (typeof DEMO_PERSONAS)[number]["role"];

/** How long a demo session lasts, in hours. */
export const DEMO_DURATION_HOURS = 4;

const EXPIRY_KEY = "demo_session_expires_at";

export function markDemoSession(expiresAt: string) {
  localStorage.setItem(EXPIRY_KEY, expiresAt);
}

export function demoExpiryFromStorage(): Date | null {
  const raw = localStorage.getItem(EXPIRY_KEY);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function clearDemoSession() {
  localStorage.removeItem(EXPIRY_KEY);
}

/**
 * Start a demo: the server seeds a private sandbox organisation, creates a
 * throwaway login and returns its session, which we install on this browser.
 */
export async function startDemoSession(role: DemoRole) {
  const { data, error } = await supabase.functions.invoke("start-demo", { body: { role } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.session?.access_token) throw new Error("The demo could not be started");

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (sessionError) throw sessionError;

  markDemoSession(data.expires_at);
  return data as { role: DemoRole; expires_at: string; org_id: string; school_id: string };
}

/** Asks the server to erase any demo sandbox whose time is up. */
export async function requestDemoCleanup() {
  try {
    await supabase.functions.invoke("start-demo", { body: { action: "cleanup" } });
  } catch {
    // Cleanup is also swept whenever the next visitor starts a demo.
  }
}

/** "3h 12m" — how long is left on a demo session. */
export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
