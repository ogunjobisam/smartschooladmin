import { describe, it, expect } from "vitest";
import {
  toPercentage, gradeForPercentage, gradeForScore, remarkForGrade,
  overallAverage, subjectBreakdown, trendByPeriod, trendDirection,
  attendanceSummary, classPosition, assessRisk, summariseStudent,
  type ScoreRow, type AttendanceRow,
} from "@/lib/performance";

function score(partial: Partial<ScoreRow> & { score: number | null }): ScoreRow {
  return {
    studentId: "s1",
    subjectId: "maths",
    subjectName: "Mathematics",
    examId: "e1",
    examName: "Midterm",
    periodId: "t1",
    periodName: "Term 1",
    maxScore: 100,
    examDate: "2026-01-20",
    ...partial,
  };
}

describe("grading", () => {
  it("converts a raw score to a percentage against the exam maximum", () => {
    expect(toPercentage(30, 40)).toBe(75);
    expect(toPercentage(50, 100)).toBe(50);
  });

  it("refuses to divide by a zero or negative maximum", () => {
    expect(toPercentage(30, 0)).toBeNull();
    expect(toPercentage(30, -10)).toBeNull();
  });

  it("treats an unmarked score as no data, not zero", () => {
    expect(toPercentage(null, 100)).toBeNull();
    expect(gradeForScore(null, 100)).toBe("—");
  });

  it("maps percentages onto the grade bands", () => {
    expect(gradeForPercentage(95)).toBe("A+");
    expect(gradeForPercentage(90)).toBe("A+");
    expect(gradeForPercentage(89.9)).toBe("A");
    expect(gradeForPercentage(70)).toBe("B");
    expect(gradeForPercentage(40)).toBe("E");
    expect(gradeForPercentage(39.9)).toBe("F");
    expect(gradeForPercentage(0)).toBe("F");
  });

  it("clamps a score above the maximum rather than inventing a grade", () => {
    expect(gradeForScore(120, 100)).toBe("A+");
  });

  it("carries a remark for each grade", () => {
    expect(remarkForGrade("A+")).toBe("Outstanding");
    expect(remarkForGrade("F")).toBe("Needs Improvement");
    expect(remarkForGrade("Z")).toBe("");
  });
});

describe("overallAverage", () => {
  it("averages percentages, not raw scores across different maximums", () => {
    // 15/20 is 75%, 50/100 is 50% — a raw mean would give 32.5.
    const rows = [score({ score: 15, maxScore: 20 }), score({ score: 50, maxScore: 100 })];
    expect(overallAverage(rows)).toBe(62.5);
  });

  it("ignores unmarked scores instead of counting them as zero", () => {
    const rows = [score({ score: 80 }), score({ score: null })];
    expect(overallAverage(rows)).toBe(80);
  });

  it("returns null when there is nothing to average", () => {
    expect(overallAverage([])).toBeNull();
    expect(overallAverage([score({ score: null })])).toBeNull();
  });
});

describe("subjectBreakdown", () => {
  it("averages per subject and orders strongest first", () => {
    const rows = [
      score({ subjectId: "eng", subjectName: "English", score: 50 }),
      score({ subjectId: "maths", subjectName: "Mathematics", score: 90 }),
      score({ subjectId: "maths", subjectName: "Mathematics", score: 80 }),
    ];
    const result = subjectBreakdown(rows);
    expect(result.map((r) => r.subjectName)).toEqual(["Mathematics", "English"]);
    expect(result[0]).toMatchObject({ average: 85, grade: "A", count: 2 });
    expect(result[1]).toMatchObject({ average: 50, grade: "D", count: 1 });
  });
});

describe("trend", () => {
  const rows = [
    score({ periodId: "t1", periodName: "Term 1", score: 60 }),
    score({ periodId: "t2", periodName: "Term 2", score: 72 }),
    score({ periodId: "t3", periodName: "Term 3", score: 70 }),
  ];

  it("keeps periods in the order they arrive rather than sorting term names", () => {
    expect(trendByPeriod(rows).map((p) => p.periodName)).toEqual(["Term 1", "Term 2", "Term 3"]);
  });

  it("compares the two most recent periods", () => {
    expect(trendDirection(trendByPeriod(rows))).toEqual({ direction: "steady", change: -2 });
  });

  it("calls a real move improving or declining", () => {
    const up = trendByPeriod([
      score({ periodId: "t1", periodName: "Term 1", score: 55 }),
      score({ periodId: "t2", periodName: "Term 2", score: 75 }),
    ]);
    expect(trendDirection(up)).toEqual({ direction: "improving", change: 20 });

    const down = trendByPeriod([
      score({ periodId: "t1", periodName: "Term 1", score: 80 }),
      score({ periodId: "t2", periodName: "Term 2", score: 55 }),
    ]);
    expect(trendDirection(down)).toEqual({ direction: "declining", change: -25 });
  });

  it("cannot report a trend from a single term", () => {
    expect(trendDirection(trendByPeriod([score({ score: 70 })]))).toEqual({
      direction: "unknown",
      change: null,
    });
  });
});

describe("attendanceSummary", () => {
  const rows = (statuses: AttendanceRow["status"][]): AttendanceRow[] =>
    statuses.map((status, i) => ({ studentId: "s1", date: `2026-01-${i + 1}`, status }));

  it("counts late as attending", () => {
    const summary = attendanceSummary(rows(["present", "present", "late", "absent"]));
    expect(summary.rate).toBe(75);
    expect(summary).toMatchObject({ total: 4, present: 2, late: 1, absent: 1 });
  });

  it("excludes excused absences from the denominator rather than penalising them", () => {
    // 2 present out of 2 assessable days; the excused day is not held against them.
    expect(attendanceSummary(rows(["present", "present", "excused"])).rate).toBe(100);
  });

  it("returns null rather than 0% when there is no register at all", () => {
    expect(attendanceSummary([]).rate).toBeNull();
    expect(attendanceSummary(rows(["excused"])).rate).toBeNull();
  });
});

describe("classPosition", () => {
  it("ranks highest average first", () => {
    const averages = new Map([["a", 80], ["b", 90], ["c", 70]]);
    expect(classPosition(averages, "b")).toEqual({ position: 1, outOf: 3 });
    expect(classPosition(averages, "c")).toEqual({ position: 3, outOf: 3 });
  });

  it("shares a place on a tie and skips the next", () => {
    const averages = new Map([["a", 90], ["b", 90], ["c", 70]]);
    expect(classPosition(averages, "a")).toEqual({ position: 1, outOf: 3 });
    expect(classPosition(averages, "b")).toEqual({ position: 1, outOf: 3 });
    expect(classPosition(averages, "c")).toEqual({ position: 3, outOf: 3 });
  });

  it("leaves unscored students out of the cohort", () => {
    const averages = new Map<string, number | null>([["a", 80], ["b", null]]);
    expect(classPosition(averages, "b")).toEqual({ position: null, outOf: 1 });
    expect(classPosition(averages, "a")).toEqual({ position: 1, outOf: 1 });
  });
});

describe("assessRisk", () => {
  it("leaves a solid student alone", () => {
    const result = assessRisk({
      average: 75,
      trend: { direction: "steady", change: 1 },
      attendanceRate: 95,
    });
    expect(result.level).toBe("on_track");
    expect(result.reasons).toEqual([]);
  });

  it("flags a failing average and poor attendance as at risk", () => {
    const result = assessRisk({
      average: 35,
      trend: { direction: "steady", change: 0 },
      attendanceRate: 60,
    });
    expect(result.level).toBe("at_risk");
    expect(result.reasons.join(" ")).toContain("below a pass");
    expect(result.reasons.join(" ")).toContain("Attendance 60%");
  });

  it("catches a sharp decline even while the average still looks fine", () => {
    const result = assessRisk({
      average: 68,
      trend: { direction: "declining", change: -15 },
      attendanceRate: 70,
    });
    expect(result.level).toBe("at_risk");
  });

  it("says nothing when there is no data to judge on", () => {
    expect(
      assessRisk({ average: null, trend: { direction: "unknown", change: null }, attendanceRate: null })
    ).toEqual({ level: "on_track", reasons: [] });
  });
});

describe("summariseStudent", () => {
  it("uses only the requested student's rows", () => {
    const scores: ScoreRow[] = [
      score({ studentId: "s1", periodId: "t1", periodName: "Term 1", score: 80 }),
      score({ studentId: "s1", periodId: "t2", periodName: "Term 2", subjectId: "eng", subjectName: "English", score: 60 }),
      score({ studentId: "s2", score: 10 }),
    ];
    const attendance: AttendanceRow[] = [
      { studentId: "s1", date: "2026-01-01", status: "present" },
      { studentId: "s2", date: "2026-01-01", status: "absent" },
    ];

    const summary = summariseStudent("s1", scores, attendance);
    expect(summary.average).toBe(70);
    expect(summary.subjects).toHaveLength(2);
    expect(summary.attendance.total).toBe(1);
    expect(summary.trend.direction).toBe("declining");
  });

  it("handles a student with no data at all", () => {
    const summary = summariseStudent("nobody", [], []);
    expect(summary.average).toBeNull();
    expect(summary.grade).toBe("—");
    expect(summary.risk.level).toBe("on_track");
  });
});
