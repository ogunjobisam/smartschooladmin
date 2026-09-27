import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { TermReport as TermReportData } from "@/lib/term-report";

// The page against a fake backend: the report is the JSS3A fixture from
// supabase/tests/rls.sql, so the numbers here are the ones the SQL produces.
let report: TermReportData;
const baseReport: TermReportData = {
  released: false,
  components: [
    { exam_id: "ca1", name: "CA1", term_weight: 20, max_score: 20 },
    { exam_id: "exam", name: "Exam", term_weight: 80, max_score: 100 },
  ],
  arm_size: 3, arm_average: 65.2, level_size: 4, level_average: 65.15,
  students: [
    { student_id: "tunde", subjects_taken: 2, total: 140, out_of: 200, average: 70, arm_position: 1, level_position: 1 },
    { student_id: "kemi", subjects_taken: 2, total: 125.6, out_of: 200, average: 62.8, arm_position: 2, level_position: 3 },
    { student_id: "zainab", subjects_taken: 2, total: 125.6, out_of: 200, average: 62.8, arm_position: 2, level_position: 3 },
  ],
  subjects: [
    { student_id: "tunde", subject_id: "maths", total: 92, out_of: 100, percent: 92, position: 1, class_average: 81.07, scores: { ca1: 20, exam: 90 } },
    { student_id: "tunde", subject_id: "english", total: 48, out_of: 100, percent: 48, position: 3, class_average: 49.33, scores: { exam: 60 } },
    { student_id: "kemi", subject_id: "maths", total: 75.6, out_of: 100, percent: 75.6, position: 2, class_average: 81.07, scores: { ca1: 18, exam: 72 } },
  ],
  comments: [{ student_id: "kemi", kind: "class_teacher", body: "Steady." }],
  ratings: [],
  traits: null,
};

const tables: Record<string, unknown[]> = {
  classes: [{ id: "jss3a", name: "JSS3A", level_name: "JSS3", arm: "A", section: "secondary", level_order: 1 }],
  academic_periods: [{ id: "t1", name: "First Term", start_date: "2026-09-01", end_date: "2026-12-15", is_current: true, academic_years: { org_id: "org", name: "2026/27" } }],
  enrolments: [
    { students: { id: "kemi", first_name: "Kemi", last_name: "Ade", student_id_number: "KQ-1", status: "active" } },
    { students: { id: "tunde", first_name: "Tunde", last_name: "Bello", student_id_number: "KQ-2", status: "active" } },
    { students: { id: "zainab", first_name: "Zainab", last_name: "Cole", student_id_number: "KQ-3", status: "active" } },
  ],
  subjects: [{ id: "maths", name: "Mathematics", short_code: "MTH" }, { id: "english", name: "English", short_code: "ENG" }],
  report_traits: [],
  attendance_records: [],
};

function query(table: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "gte", "lte", "order", "limit"]) builder[m] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: null });
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => query(table),
    rpc: async () => ({ data: report, error: null }),
  },
}));

let role = "principal";
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ schoolId: "school", orgId: "org", userRole: role }),
}));
vi.mock("@/contexts/SchoolBrandingContext", () => ({
  useSchoolBranding: () => ({ branding: { name: "Kings & Queens Academy" } }),
}));

import TermReport from "@/pages/TermReport";

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><TermReport /></MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => { role = "principal"; report = baseReport; });

describe("Term report page", () => {
  it("shows each pupil's average and both positions, tied pupils sharing a place", async () => {
    renderPage();
    const tunde = (await screen.findByText("Tunde Bello")).closest("tr")!;
    expect(within(tunde).getByText("70.0")).toBeInTheDocument();
    expect(within(tunde).getAllByText("1st")).toHaveLength(2);

    for (const name of ["Kemi Ade", "Zainab Cole"]) {
      const row = screen.getByText(name).closest("tr")!;
      expect(within(row).getByText("2nd")).toBeInTheDocument();
      expect(within(row).getByText("3rd")).toBeInTheDocument();
    }
    expect(screen.getByText("In JSS3")).toBeInTheDocument();
  });

  it("shows what the term is made of, and has nothing to warn about at 100%", async () => {
    renderPage();
    expect(await screen.findByText("CA1 · 20%")).toBeInTheDocument();
    expect(screen.getByText("Exam · 80%")).toBeInTheDocument();
    expect(screen.queryByText(/add up to/)).not.toBeInTheDocument();
  });

  it("shows a subject a pupil does not take as a dash, not a zero", async () => {
    renderPage();
    const kemi = (await screen.findByText("Kemi Ade")).closest("tr")!;
    expect(within(kemi).getByText("75.6")).toBeInTheDocument();
    expect(within(kemi).getAllByText("—").length).toBeGreaterThan(0);
    expect(await within(kemi).findByText("Teacher")).toBeInTheDocument();
  });

  it("offers release to a principal and not to a teacher", async () => {
    const first = renderPage();
    expect(await screen.findByRole("button", { name: /release to families/i })).toBeInTheDocument();
    first.unmount();

    role = "teacher";
    renderPage();
    await screen.findByText("Tunde Bello");
    expect(screen.getByRole("button", { name: /print all report cards/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /release to families/i })).not.toBeInTheDocument();
  });

  it("lists what has changed since release and offers to update it", async () => {
    // Kemi's Maths was corrected after release: live says 83.6, families still see 75.6.
    report = {
      ...baseReport,
      released: true,
      released_at: "2026-09-27T12:00:00Z",
      snapshot: baseReport,
      subjects: baseReport.subjects.map((x) =>
        x.student_id === "kemi" && x.subject_id === "maths" ? { ...x, percent: 83.6 } : x
      ),
    };
    renderPage();
    expect(await screen.findByText(/1 change since release/)).toBeInTheDocument();
    expect(screen.getByText(/Mathematics: 75.6 → 83.6/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update release/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /release to families/i })).not.toBeInTheDocument();
  });

  it("says nothing about changes when the live report matches the release", async () => {
    report = { ...baseReport, released: true, released_at: "2026-09-27T12:00:00Z", snapshot: baseReport };
    renderPage();
    await screen.findByText("Tunde Bello");
    expect(screen.queryByText(/since release/)).not.toBeInTheDocument();
  });
});
