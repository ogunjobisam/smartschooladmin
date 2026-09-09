/**
 * Public subscription plan definitions and SMS bundle pricing.
 *
 * These mirror the seeded rows in the database so the marketing pricing page
 * and the proprietor Billing page can render without a round trip, and so the
 * upgrade flow knows which plan to ask the server for.
 */

export interface PlanInfo {
  code: "free" | "standard" | "premium";
  name: string;
  pricePerStudentTerm: number;
  studentLimit: number | null;
  aiEnabled: boolean;
  payrollEnabled: boolean;
  multiSchool: boolean;
  storageLimitMb: number;
  /** Short, plain-English list of what each plan includes, for the pricing page. */
  features: string[];
  highlight?: boolean;
}

export const PLANS: PlanInfo[] = [
  {
    code: "free",
    name: "Free",
    pricePerStudentTerm: 0,
    studentLimit: 50,
    aiEnabled: false,
    payrollEnabled: false,
    multiSchool: false,
    storageLimitMb: 512,
    features: [
      "Up to 50 students",
      "Attendance, admissions, results & report cards",
      "Invoicing & receipting",
      "Parent, student and teacher portals",
      "512 MB document storage",
    ],
  },
  {
    code: "standard",
    name: "Standard",
    pricePerStudentTerm: 300,
    studentLimit: null,
    aiEnabled: false,
    payrollEnabled: true,
    multiSchool: true,
    storageLimitMb: 10240,
    highlight: true,
    features: [
      "Unlimited students",
      "Everything in Free, plus:",
      "Payroll & salary approvals",
      "Multi-school / multi-campus",
      "Achievement wall & events",
      "10 GB document storage",
    ],
  },
  {
    code: "premium",
    name: "Premium",
    pricePerStudentTerm: 450,
    studentLimit: null,
    aiEnabled: true,
    payrollEnabled: true,
    multiSchool: true,
    storageLimitMb: 51200,
    features: [
      "Unlimited students",
      "Everything in Standard, plus:",
      "AI insights & analytics",
      "Timetable & transport billing",
      "Priority support",
      "50 GB document storage",
    ],
  },
];

export function planByCode(code: string): PlanInfo | undefined {
  return PLANS.find((p) => p.code === code);
}

/** Prepaid SMS bundles, priced in NGN. The server re-validates these. */
export interface SmsBundle {
  credits: number;
  price: number;
  label: string;
}

export const SMS_BUNDLES: SmsBundle[] = [
  { credits: 400, price: 2000, label: "400 SMS" },
  { credits: 2000, price: 8000, label: "2,000 SMS" },
  { credits: 5000, price: 18000, label: "5,000 SMS" },
];

export function bundleByCredits(credits: number): SmsBundle | undefined {
  return SMS_BUNDLES.find((b) => b.credits === credits);
}

/** Term cost for a given plan and billable student count, in the org's currency. */
export function termCost(plan: PlanInfo, studentCount: number): number {
  return plan.pricePerStudentTerm * Math.max(0, studentCount);
}
