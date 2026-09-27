import { useQuery } from "@tanstack/react-query";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";
import { openDocument } from "@/lib/document-theme";
import { getErrorMessage } from "@/lib/errors";
import {
  commentsByStudent, fetchTermReport, ordinal, ratingsByStudent, termReportHtml, traitLists,
} from "@/lib/term-report";

/**
 * A pupil's term report cards, for the pupil and their parents. Only terms the
 * school has released appear, and everything shown — marks, positions,
 * comments, ratings, even the trait names — comes from the snapshot taken at
 * release, which term_report() hands families in place of the live report.
 */
export function ReleasedTermReports({
  studentId, studentName, idNumber,
}: {
  studentId: string;
  studentName: string;
  idNumber?: string | null;
}) {
  const { branding } = useSchoolBranding();

  const { data: released = [] } = useQuery({
    queryKey: ["released-term-reports", studentId],
    queryFn: async () => {
      const { data: enrolments } = await supabase
        .from("enrolments")
        .select("class_id, academic_period_id, classes(name, level_name), academic_periods(name, start_date, end_date, academic_years(name))")
        .eq("student_id", studentId);
      const found = await Promise.all(
        (enrolments || []).map(async (e) => {
          const report = await fetchTermReport(e.class_id, e.academic_period_id);
          const mine = report.students.some((s) => s.student_id === studentId)
            || (report.withheld ?? []).some((w) => w.student_id === studentId);
          return mine ? { enrolment: e, report } : null;
        })
      );
      return found
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => (b.enrolment.academic_periods?.start_date ?? "").localeCompare(a.enrolment.academic_periods?.start_date ?? ""));
    },
  });

  if (released.length === 0) return null;

  const open = async (entry: (typeof released)[number]) => {
    const { enrolment, report } = entry;
    try {
      const [{ data: subjects }, { data: attendance }] = await Promise.all([
        supabase.from("subjects").select("id, name").in("id", report.subjects.map((s) => s.subject_id)),
        enrolment.academic_periods?.start_date && enrolment.academic_periods?.end_date
          ? supabase.from("attendance_records").select("status").eq("student_id", studentId).eq("class_id", enrolment.class_id)
              .gte("date", enrolment.academic_periods.start_date).lte("date", enrolment.academic_periods.end_date)
          : Promise.resolve({ data: [] as { status: string }[] }),
      ]);

      const days = attendance || [];
      const present = days.filter((d) => d.status === "present" || d.status === "late").length;
      const period = enrolment.academic_periods;

      openDocument(termReportHtml({
        school: { name: branding.name, logoUrl: branding.logoUrl, primaryColor: branding.primaryColor, accentColor: branding.accentColor },
        className: enrolment.classes?.name ?? "",
        levelName: enrolment.classes?.level_name,
        periodName: `${period?.name ?? "Term"}${period?.academic_years?.name ? ` · ${period.academic_years.name}` : ""}`,
        report,
        subjectNames: new Map((subjects || []).map((s) => [s.id, s.name])),
        pupils: [{ id: studentId, name: studentName, idNumber }],
        comments: commentsByStudent(report.comments),
        ratings: ratingsByStudent(report.ratings),
        attendance: new Map([[studentId, { present, total: days.length }]]),
        traits: traitLists(report.traits),
      }));
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not open the report card."));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-accent" /> Term report cards
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {released.map((entry) => {
          const { enrolment, report } = entry;
          const result = report.students.find((s) => s.student_id === studentId);
          const withheld = (report.withheld ?? []).find((w) => w.student_id === studentId);
          return (
            <div key={`${enrolment.class_id}:${enrolment.academic_period_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div>
                <p className="text-sm font-medium">
                  {enrolment.academic_periods?.name}
                  {enrolment.academic_periods?.academic_years?.name ? ` · ${enrolment.academic_periods.academic_years.name}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {enrolment.classes?.name}
                  {result ? ` · average ${result.average.toFixed(1)}% · ${ordinal(result.arm_position)} of ${report.arm_size}` : ""}
                </p>
              </div>
              {withheld ? (
                <span className="text-xs text-muted-foreground">Withheld</span>
              ) : (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => open(entry)}>
                  <Printer className="h-3.5 w-3.5" /> Report card
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
