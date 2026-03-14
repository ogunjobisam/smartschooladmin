// ============================================================
// SchoolFlow Mock Data — Phase 1 Demo
// ============================================================

export type UserRole = 'proprietor' | 'principal' | 'bursar' | 'finance_officer' | 'hr_admin' | 'teacher' | 'parent';

export interface School {
  id: string;
  name: string;
  campus: string;
  studentCount: number;
  staffCount: number;
}

export const currentUser = {
  id: 'u-001',
  name: 'Chief Adebayo Okonkwo',
  email: 'adebayo@schoolflow.ng',
  role: 'proprietor' as UserRole,
  orgName: 'Okonkwo Education Group',
  avatarInitials: 'AO',
};

export const schools: School[] = [
  { id: 's-001', name: 'Bright Future Academy', campus: 'Lekki Campus', studentCount: 62, staffCount: 12 },
  { id: 's-002', name: 'Bright Future Academy', campus: 'Ikeja Campus', studentCount: 48, staffCount: 8 },
];

export const dashboardStats = {
  totalStudents: 110,
  totalStaff: 20,
  feesBilledThisTerm: 18_500_000_00, // kobo
  feesCollectedThisTerm: 12_350_000_00,
  outstandingFees: 6_150_000_00,
  overdueStudents: 23,
  payrollDueThisMonth: 4_800_000_00,
  payrollPaidThisMonth: 4_200_000_00,
  pendingApprovals: 3,
  exceptionsToReview: 2,
};

export const monthlyCollections = [
  { month: 'Sep', billed: 18_000_000, collected: 15_200_000 },
  { month: 'Oct', billed: 1_200_000, collected: 1_800_000 },
  { month: 'Nov', billed: 800_000, collected: 2_400_000 },
  { month: 'Dec', billed: 600_000, collected: 1_600_000 },
  { month: 'Jan', billed: 18_500_000, collected: 8_400_000 },
  { month: 'Feb', billed: 400_000, collected: 3_950_000 },
];

export const schoolComparison = [
  { school: 'Lekki', billed: 11_200_000, collected: 7_800_000, outstanding: 3_400_000 },
  { school: 'Ikeja', billed: 7_300_000, collected: 4_550_000, outstanding: 2_750_000 },
];

export const pendingApprovals = [
  { id: 'apr-001', type: 'Fee Waiver', description: 'Waiver for Chioma Eze — ₦150,000 tuition (Term 2)', requester: 'Mrs. Adamu (Bursar)', date: '2026-03-12', amount: 150_000_00 },
  { id: 'apr-002', type: 'Payroll Run', description: 'March 2026 Payroll — Lekki Campus (12 staff)', requester: 'Mr. Bello (HR)', date: '2026-03-10', amount: 2_800_000_00 },
  { id: 'apr-003', type: 'Salary Change', description: 'Salary revision for Mr. Okafor — ₦280,000 → ₦320,000', requester: 'Mr. Bello (HR)', date: '2026-03-08', amount: 320_000_00 },
];

export const recentActivity = [
  { id: 'act-001', action: 'Payment recorded', detail: '₦350,000 from Guardian Adekunle (Transfer)', time: '2 hours ago', icon: 'payment' as const },
  { id: 'act-002', action: 'Invoice generated', detail: 'Bulk invoice — JSS2 Term 2 (28 students)', time: '4 hours ago', icon: 'invoice' as const },
  { id: 'act-003', action: 'Payroll approved', detail: 'February 2026 — Ikeja Campus', time: '1 day ago', icon: 'approval' as const },
  { id: 'act-004', action: 'Student enrolled', detail: 'Aisha Mohammed — JSS1 Lekki', time: '2 days ago', icon: 'student' as const },
  { id: 'act-005', action: 'Fee waiver requested', detail: '₦150,000 waiver for Chioma Eze', time: '3 days ago', icon: 'waiver' as const },
];

export const overdueStudents = [
  { id: 'st-001', name: 'Chukwuemeka Obi', class: 'SS1', school: 'Lekki', outstanding: 450_000_00, daysOverdue: 45 },
  { id: 'st-012', name: 'Fatima Suleiman', class: 'JSS3', school: 'Ikeja', outstanding: 280_000_00, daysOverdue: 32 },
  { id: 'st-025', name: 'David Okoro', class: 'SS2', school: 'Lekki', outstanding: 520_000_00, daysOverdue: 60 },
  { id: 'st-034', name: 'Grace Ademola', class: 'JSS1', school: 'Ikeja', outstanding: 180_000_00, daysOverdue: 15 },
  { id: 'st-041', name: 'Ibrahim Musa', class: 'SS3', school: 'Lekki', outstanding: 350_000_00, daysOverdue: 28 },
];

export const dailyCollections = [
  { date: 'Mon', amount: 1_200_000 },
  { date: 'Tue', amount: 850_000 },
  { date: 'Wed', amount: 1_450_000 },
  { date: 'Thu', amount: 620_000 },
  { date: 'Fri', amount: 980_000 },
];

export function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

export function formatNairaCompact(value: number): string {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₦${(value / 1_000).toFixed(0)}K`;
  return `₦${value}`;
}
