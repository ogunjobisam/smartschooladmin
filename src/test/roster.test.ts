import { describe, it, expect } from "vitest";
import { rosterForPeriod, type EnrolmentRow } from "@/lib/roster";

interface Student { id: string; name: string }

const enrol = (id: string, period: string | null, name = id): EnrolmentRow<Student> => ({
  student_id: id,
  academic_period_id: period,
  students: { id, name },
});

describe("rosterForPeriod", () => {
  it("returns the students enrolled for the requested term", () => {
    const result = rosterForPeriod([enrol("a", "t2"), enrol("b", "t2"), enrol("c", "t1")], "t2");
    expect(result.students.map((s) => s.id)).toEqual(["a", "b"]);
    expect(result.otherPeriodIds).toEqual([]);
    expect(result.isEmptyClass).toBe(false);
  });

  it("distinguishes a class enrolled in another term from an empty class", () => {
    // This is the case that used to render as a bare "No students enrolled",
    // sending the teacher off to add students who were already there.
    const wrongTerm = rosterForPeriod([enrol("a", "t1"), enrol("b", "t1")], "t2");
    expect(wrongTerm.students).toEqual([]);
    expect(wrongTerm.otherPeriodIds).toEqual(["t1"]);
    expect(wrongTerm.isEmptyClass).toBe(false);

    const empty = rosterForPeriod<Student>([], "t2");
    expect(empty.students).toEqual([]);
    expect(empty.otherPeriodIds).toEqual([]);
    expect(empty.isEmptyClass).toBe(true);
  });

  it("lists every other term the class has enrolments in, without duplicates", () => {
    const result = rosterForPeriod(
      [enrol("a", "t1"), enrol("b", "t1"), enrol("c", "t3")],
      "t2"
    );
    expect(result.otherPeriodIds).toEqual(["t1", "t3"]);
  });

  it("falls back to every enrolment when no term is selected yet", () => {
    const result = rosterForPeriod([enrol("a", "t1"), enrol("b", "t2")], null);
    expect(result.students.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("skips enrolments whose student row did not come back", () => {
    // An inactive student is filtered out by the query's inner join, leaving an
    // enrolment with no student attached.
    const rows: EnrolmentRow<Student>[] = [
      enrol("a", "t2"),
      { student_id: "ghost", academic_period_id: "t2", students: null },
    ];
    const result = rosterForPeriod(rows, "t2");
    expect(result.students.map((s) => s.id)).toEqual(["a"]);
  });

  it("treats a class of only unenrolled-term ghosts as empty", () => {
    const rows: EnrolmentRow<Student>[] = [
      { student_id: "ghost", academic_period_id: "t1", students: null },
    ];
    expect(rosterForPeriod(rows, "t2").isEmptyClass).toBe(true);
  });

  it("does not report the requested term as an 'other' term", () => {
    const rows: EnrolmentRow<Student>[] = [
      { student_id: "ghost", academic_period_id: null, students: { id: "g", name: "g" } },
    ];
    const result = rosterForPeriod(rows, "t2");
    expect(result.otherPeriodIds).toEqual([]);
  });
});
