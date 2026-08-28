import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Printer } from "lucide-react";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";
import { gradeForScore, remarkForGrade } from "@/lib/performance";

interface ScoreItem {
  subjectId: string;
  score: number;
  grade: string;
}

interface ReportCardViewProps {
  student: {
    first_name: string;
    last_name: string;
    student_id_number?: string | null;
  };
  exam: {
    name: string;
    academic_periods?: { name: string } | null;
    classes?: { name: string } | null;
  };
  subjects: { id: string; name: string }[];
  scores: ScoreItem[];
  maxScore: number;
}

export function ReportCardView({ student, exam, subjects, scores, maxScore }: ReportCardViewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const { branding } = useSchoolBranding();

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const average = scores.length > 0 ? totalScore / scores.length : 0;
  const overallGrade = scores.length > 0 ? gradeForScore(average, maxScore) : "N/A";

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Report Card - ${student?.first_name} ${student?.last_name}</title>
      <style>
        body { font-family: 'Inter', system-ui, sans-serif; padding: 32px; color: #1e293b; max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px double #1e293b; }
        .header h1 { font-size: 22px; margin: 0 0 4px; }
        .header p { font-size: 12px; color: #64748b; margin: 2px 0; }
        .student-info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; font-size: 13px; }
        .student-info .label { color: #64748b; }
        .student-info .value { font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-size: 12px; font-weight: 600; border: 1px solid #e2e8f0; }
        td { padding: 8px 12px; border: 1px solid #e2e8f0; font-size: 13px; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .summary { background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px; }
        .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; text-align: center; }
        .summary-value { font-size: 24px; font-weight: 700; }
        .summary-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
        .grade-key { margin-top: 16px; font-size: 11px; color: #64748b; }
        .grade-key table td, .grade-key table th { padding: 4px 8px; font-size: 11px; }
        .footer { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; font-size: 12px; }
        .footer .sign-line { border-top: 1px solid #1e293b; padding-top: 4px; margin-top: 40px; }
        @media print { body { padding: 16px; } }
      </style></head><body>
      ${content.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  if (!student) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Report Card</CardTitle>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="mr-2 h-3.5 w-3.5" /> Print Report Card
        </Button>
      </CardHeader>
      <CardContent>
        <div ref={printRef}>
          {/* Header */}
          <div className="mb-6 border-b-2 border-double pb-4 text-center">
            <h1 className="text-xl font-bold">{branding.name}</h1>
            {branding.tagline && <p className="text-xs text-muted-foreground">{branding.tagline}</p>}
            <p className="mt-1 text-sm font-semibold">STUDENT REPORT CARD</p>
            <p className="text-xs text-muted-foreground">{exam.name} • {exam.academic_periods?.name || ""}</p>
          </div>

          {/* Student Info */}
          <div className="mb-6 grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Student Name: </span><strong>{student.first_name} {student.last_name}</strong></div>
            <div><span className="text-muted-foreground">Student ID: </span><strong>{student.student_id_number || "N/A"}</strong></div>
            <div><span className="text-muted-foreground">Class: </span><strong>{exam.classes?.name || "—"}</strong></div>
            <div><span className="text-muted-foreground">Term/Period: </span><strong>{exam.academic_periods?.name || "—"}</strong></div>
          </div>

          {/* Scores Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead className="text-center">Max</TableHead>
                <TableHead className="text-center">%</TableHead>
                <TableHead className="text-center">Grade</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scores.map((s, idx) => {
                const subject = subjectMap.get(s.subjectId);
                const pct = ((s.score / maxScore) * 100).toFixed(1);
                return (
                  <TableRow key={s.subjectId}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{subject?.name || "Unknown"}</TableCell>
                    <TableCell className="text-center">{s.score}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{maxScore}</TableCell>
                    <TableCell className="text-center">{pct}%</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className={
                        s.grade === "A+" || s.grade === "A" ? "status-paid" :
                        s.grade === "B" || s.grade === "C" ? "status-pending" :
                        s.grade === "F" ? "status-overdue" : ""
                      }>
                        {s.grade}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{remarkForGrade(s.grade)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Summary */}
          <div className="mt-6 rounded-lg bg-muted/30 p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{totalScore}</p>
                <p className="text-[11px] uppercase text-muted-foreground">Total Score</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{average.toFixed(1)}</p>
                <p className="text-[11px] uppercase text-muted-foreground">Average</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{overallGrade}</p>
                <p className="text-[11px] uppercase text-muted-foreground">Overall Grade</p>
              </div>
            </div>
          </div>

          {/* Grading Key */}
          <div className="mt-4 text-xs text-muted-foreground">
            <p className="mb-1 font-semibold">Grading Scale:</p>
            <p>A+ (90-100) Outstanding • A (80-89) Excellent • B (70-79) Very Good • C (60-69) Good • D (50-59) Fair • E (40-49) Below Average • F (0-39) Needs Improvement</p>
          </div>

          {/* Signature Lines */}
          <div className="mt-10 grid grid-cols-2 gap-10 text-xs">
            <div>
              <div className="mt-10 border-t pt-1">Class Teacher's Signature</div>
            </div>
            <div>
              <div className="mt-10 border-t pt-1">Principal's Signature & Stamp</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
