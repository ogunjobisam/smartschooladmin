/**
 * Academic performance analytics.
 *
 * Pure functions over score and attendance rows so they can be unit tested and
 * reused by the student view, the class analytics page and the AI insight
 * prompts without any of them re-deriving the maths.
 */

export interface ScoreRow {
  studentId: string;
  subjectId: string;
  subjectName: string;
  examId: string;
  examName: string;
  periodId: string | null;
  periodName: string;
  /** Raw score as entered. */
  score: number | null;
  /** Denominator for this exam. */
  maxScore: number;
  examDate: string | null;
}

export interface AttendanceRow {
  studentId: string;
  date: string;
  status: "present" | "absent" | "late" | "excused";
}

export const GRADE_BANDS = [
  { min: 90, grade: "A+", remark: "Outstanding" },
  { min: 80, grade: "A", remark: "Excellent" },
  { min: 70, grade: "B", remark: "Very Good" },
  { min: 60, grade: "C", remark: "Good" },
  { min: 50, grade: "D", remark: "Fair" },
  { min: 40, grade: "E", remark: "Below Average" },
  { min: 0, grade: "F", remark: "Needs Improvement" },
] as const;

/** Percentage a score represents. Returns null when it cannot be computed. */
export function toPercentage(score: number | null, maxScore: number): number | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (!Number.isFinite(maxScore) || maxScore <= 0) return null;
  return (score / maxScore) * 100;
}

/** Letter grade for a percentage. */
export function gradeForPercentage(percentage: number | null): string {
  if (percentage === null || !Number.isFinite(percentage)) return "—";
  const clamped = Math.max(0, Math.min(100, percentage));
  return GRADE_BANDS.find((b) => clamped >= b.min)?.grade ?? "F";
}

/** Letter grade for a raw score out of a maximum. */
export function gradeForScore(score: number | null, maxScore: number): string {
  return gradeForPercentage(toPercentage(score, maxScore));
}

export function remarkForGrade(grade: string): string {
  return GRADE_BANDS.find((b) => b.grade === grade)?.remark ?? "";
}

/** A single rubric band configured for one exam. */
export interface RubricBand {
  label: string;
  minPercent: number;
  remark?: string | null;
}

/** Default rubric offered when an exam has no bands configured yet. */
export const DEFAULT_RUBRIC: RubricBand[] = GRADE_BANDS.map((b) => ({
  label: b.grade,
  minPercent: b.min,
  remark: b.remark,
}));

/**
 * Grade for a percentage using an exam's own rubric. Falls back to the built-in
 * bands so an exam without a rubric still grades consistently.
 */
export function gradeFromRubric(percentage: number | null, bands: RubricBand[]): string {
  if (percentage === null || !Number.isFinite(percentage)) return "—";
  const scale = bands.length > 0 ? bands : DEFAULT_RUBRIC;
  const clamped = Math.max(0, Math.min(100, percentage));
  const sorted = [...scale].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((b) => clamped >= b.minPercent)?.label ?? sorted[sorted.length - 1]?.label ?? "—";
}

/** Rubric grade for a raw score out of a per-subject maximum. */
export function gradeScoreFromRubric(score: number | null, maxScore: number, bands: RubricBand[]): string {
  return gradeFromRubric(toPercentage(score, maxScore), bands);
}


function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round1(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

/** Percentages for every score row that can be scored. */
function percentages(rows: ScoreRow[]): number[] {
  return rows
    .map((r) => toPercentage(r.score, r.maxScore))
    .filter((p): p is number => p !== null);
}

/** Overall average percentage across all supplied scores. */
export function overallAverage(rows: ScoreRow[]): number | null {
  return round1(mean(percentages(rows)));
}

export interface SubjectSummary {
  subjectId: string;
  subjectName: string;
  average: number | null;
  grade: string;
  count: number;
}

/** Average per subject, strongest first. */
export function subjectBreakdown(rows: ScoreRow[]): SubjectSummary[] {
  const bySubject = new Map<string, ScoreRow[]>();
  for (const row of rows) {
    const list = bySubject.get(row.subjectId);
    if (list) list.push(row);
    else bySubject.set(row.subjectId, [row]);
  }

  return [...bySubject.entries()]
    .map(([subjectId, subjectRows]) => {
      const average = round1(mean(percentages(subjectRows)));
      return {
        subjectId,
        subjectName: subjectRows[0].subjectName,
        average,
        grade: gradeForPercentage(average),
        count: subjectRows.length,
      };
    })
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
}

export interface PeriodPoint {
  periodId: string | null;
  periodName: string;
  average: number | null;
  count: number;
}

/**
 * Average per academic period, in the order the periods first appear.
 *
 * Callers pass rows already ordered by exam date, so this preserves
 * chronological order without needing to parse term names.
 */
export function trendByPeriod(rows: ScoreRow[]): PeriodPoint[] {
  const order: string[] = [];
  const byPeriod = new Map<string, ScoreRow[]>();

  for (const row of rows) {
    const key = row.periodId ?? row.periodName ?? "unknown";
    const list = byPeriod.get(key);
    if (list) {
      list.push(row);
    } else {
      byPeriod.set(key, [row]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const periodRows = byPeriod.get(key)!;
    const average = round1(mean(percentages(periodRows)));
    return {
      periodId: periodRows[0].periodId,
      periodName: periodRows[0].periodName,
      average,
      count: periodRows.length,
    };
  });
}

export type TrendDirection = "improving" | "declining" | "steady" | "unknown";

export interface Trend {
  direction: TrendDirection;
  /** Percentage points between the most recent period and the one before it. */
  change: number | null;
}

/** Compares the two most recent periods that have an average. */
export function trendDirection(points: PeriodPoint[], threshold = 2): Trend {
  const scored = points.filter((p) => p.average !== null);
  if (scored.length < 2) return { direction: "unknown", change: null };

  const latest = scored[scored.length - 1].average!;
  const previous = scored[scored.length - 2].average!;
  const change = round1(latest - previous)!;

  if (change > threshold) return { direction: "improving", change };
  if (change < -threshold) return { direction: "declining", change };
  return { direction: "steady", change };
}

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** Present and late both count as attending. */
  rate: number | null;
}

export function attendanceSummary(rows: AttendanceRow[]): AttendanceSummary {
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const row of rows) {
    if (row.status in counts) counts[row.status] += 1;
  }
  const total = rows.length;
  // Excused absences are not counted against the child, so they are excluded
  // from the denominator rather than treated as an absence.
  const assessable = total - counts.excused;
  const attended = counts.present + counts.late;
  return {
    total,
    ...counts,
    rate: assessable > 0 ? Math.round((attended / assessable) * 1000) / 10 : null,
  };
}

export interface RankResult {
  position: number | null;
  outOf: number;
}

/**
 * Position within a class, competition-ranked so equal averages share a place.
 * Students with no scores are excluded from the cohort entirely.
 */
export function classPosition(
  averagesByStudent: Map<string, number | null>,
  studentId: string
): RankResult {
  const scored = [...averagesByStudent.entries()].filter(
    (entry): entry is [string, number] => entry[1] !== null
  );
  const outOf = scored.length;

  const own = averagesByStudent.get(studentId);
  if (own === null || own === undefined) return { position: null, outOf };

  const ahead = scored.filter(([, avg]) => avg > own).length;
  return { position: ahead + 1, outOf };
}

export type RiskLevel = "on_track" | "watch" | "at_risk";

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
}

/**
 * Flags students who need attention, from the two signals a school can act on
 * quickly: how they are scoring and whether they are turning up.
 */
export function assessRisk(input: {
  average: number | null;
  trend: Trend;
  attendanceRate: number | null;
  failingSubjects?: number;
}): RiskAssessment {
  const reasons: string[] = [];
  let score = 0;

  if (input.average !== null) {
    if (input.average < 40) {
      score += 2;
      reasons.push(`Average ${input.average}% is below a pass`);
    } else if (input.average < 50) {
      score += 1;
      reasons.push(`Average ${input.average}% is borderline`);
    }
  }

  if (input.trend.direction === "declining" && input.trend.change !== null) {
    score += Math.abs(input.trend.change) >= 10 ? 2 : 1;
    reasons.push(`Down ${Math.abs(input.trend.change)} points since last term`);
  }

  if (input.attendanceRate !== null) {
    if (input.attendanceRate < 75) {
      score += 2;
      reasons.push(`Attendance ${input.attendanceRate}%`);
    } else if (input.attendanceRate < 85) {
      score += 1;
      reasons.push(`Attendance ${input.attendanceRate}%`);
    }
  }

  if (input.failingSubjects && input.failingSubjects >= 3) {
    score += 1;
    reasons.push(`Failing ${input.failingSubjects} subjects`);
  }

  const level: RiskLevel = score >= 3 ? "at_risk" : score >= 1 ? "watch" : "on_track";
  return { level, reasons };
}

export interface StudentPerformance {
  studentId: string;
  average: number | null;
  grade: string;
  subjects: SubjectSummary[];
  trend: Trend;
  periods: PeriodPoint[];
  attendance: AttendanceSummary;
  risk: RiskAssessment;
}

/** Everything the performance views need for one student, in one pass. */
export function summariseStudent(
  studentId: string,
  scores: ScoreRow[],
  attendance: AttendanceRow[]
): StudentPerformance {
  const ownScores = scores.filter((s) => s.studentId === studentId);
  const ownAttendance = attendance.filter((a) => a.studentId === studentId);

  const average = overallAverage(ownScores);
  const subjects = subjectBreakdown(ownScores);
  const periods = trendByPeriod(ownScores);
  const trend = trendDirection(periods);
  const attendanceStats = attendanceSummary(ownAttendance);
  const failingSubjects = subjects.filter((s) => s.average !== null && s.average < 40).length;

  return {
    studentId,
    average,
    grade: gradeForPercentage(average),
    subjects,
    trend,
    periods,
    attendance: attendanceStats,
    risk: assessRisk({
      average,
      trend,
      attendanceRate: attendanceStats.rate,
      failingSubjects,
    }),
  };
}
