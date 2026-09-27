import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  DEFAULT_TRAITS, ordinal, releaseChanges, termReportHtml, traitKey, traitLists, weightStatus, type TermReport,
} from "@/lib/term-report";

describe("ordinal", () => {
  it("writes positions the way a report card does", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });

  it("shows a dash rather than a fake position when there is none", () => {
    expect(ordinal(null)).toBe("—");
    expect(ordinal(undefined)).toBe("—");
  });
});

describe("weightStatus", () => {
  it("is complete at exactly 100", () => {
    expect(weightStatus([{ term_weight: 20 }, { term_weight: 20 }, { term_weight: 60 }])).toMatchObject({
      total: 100, complete: true, message: null,
    });
  });

  it("warns when a component looks missing", () => {
    const s = weightStatus([{ term_weight: 20 }, { term_weight: 60 }]);
    expect(s.complete).toBe(false);
    expect(s.message).toMatch(/80%/);
  });

  it("warns when the weights overshoot", () => {
    expect(weightStatus([{ term_weight: 60 }, { term_weight: 60 }]).message).toMatch(/more than 100%/);
  });

  it("asks for weights when nothing counts yet", () => {
    expect(weightStatus([]).message).toMatch(/term weight/);
  });
});

describe("termReportHtml", () => {
  const report: TermReport = {
    released: true,
    components: [
      { exam_id: "ca1", name: "CA1", term_weight: 20, max_score: 20 },
      { exam_id: "exam", name: "Exam", term_weight: 80, max_score: 100 },
    ],
    arm_size: 3,
    arm_average: 65.2,
    level_size: 4,
    level_average: 65.15,
    students: [
      { student_id: "kemi", subjects_taken: 1, total: 75.6, out_of: 100, average: 75.6, arm_position: 2, level_position: 3 },
    ],
    subjects: [
      { student_id: "kemi", subject_id: "maths", total: 75.6, out_of: 100, percent: 75.6, position: 2, class_average: 81.07, scores: { ca1: 18, exam: 72 } },
    ],
  };

  const render = (overrides: Partial<Parameters<typeof termReportHtml>[0]> = {}) =>
    termReportHtml({
      school: { name: "Kings & Queens Academy" },
      className: "JSS3A",
      levelName: "JSS3",
      periodName: "First Term",
      report,
      subjectNames: new Map([["maths", "Mathematics"]]),
      pupils: [{ id: "kemi", name: "Kemi Ade" }],
      comments: new Map([["kemi", { classTeacher: "Works <steadily> & well.", principal: "A good term." }]]),
      ratings: new Map([["kemi", [{ domain: "affective", trait: "punctuality", rating: 4 }]]]),
      ...overrides,
    });

  it("shows each assessment's own score, the total, and both positions", () => {
    const html = render();
    expect(html).toContain("CA1");
    expect(html).toContain(">18<");
    expect(html).toContain(">72<");
    expect(html).toContain("75.6");
    expect(html).toContain("2nd of 3");
    expect(html).toContain("3rd of 4");
    expect(html).toContain("Position in JSS3");
  });

  it("escapes what teachers and schools type", () => {
    const html = render();
    expect(html).toContain("Works &lt;steadily&gt; &amp; well.");
    expect(html).not.toContain("<steadily>");
    expect(html).toContain("Kings &amp; Queens Academy");
  });

  it("prints the ratings it was given and a dash for the rest", () => {
    const html = render();
    expect(html).toMatch(/Punctuality<\/td><td class="num">4<\/td><td class="muted">Very good/);
    expect(html).toMatch(/Neatness<\/td><td class="num">—/);
  });

  it("shows the class average instead of a level position for a single-arm class", () => {
    const html = render({ levelName: "JSS3A" });
    expect(html).not.toContain("Position in JSS3<");
    expect(html).toContain("65.2%");
  });

  it("prints the school's own traits instead of the defaults", () => {
    const html = render({ traits: { affective: [{ key: "punctuality", label: "Timekeeping" }], psychomotor: [] } });
    expect(html).toContain("Timekeeping");
    expect(html).not.toContain("Neatness");
  });

  it("puts every pupil after the first on a new page", () => {
    const html = render({ pupils: [{ id: "kemi", name: "Kemi Ade" }, { id: "tunde", name: "Tunde Bello" }] });
    expect(html.match(/class="report-page"/g)).toHaveLength(2);
    expect(html).toContain("No results for this term yet.");
  });
});

describe("traitLists", () => {
  it("uses the defaults for a school that has not customised anything", () => {
    expect(traitLists(null)).toEqual(DEFAULT_TRAITS);
    expect(traitLists([])).toEqual(DEFAULT_TRAITS);
  });

  it("keeps the default list for a domain the school left alone", () => {
    const lists = traitLists([{ domain: "affective", key: "leadership", label: "Leadership" }]);
    expect(lists.affective).toEqual([{ key: "leadership", label: "Leadership" }]);
    expect(lists.psychomotor).toEqual(DEFAULT_TRAITS.psychomotor);
  });
});

describe("traitKey", () => {
  it("makes a plain key from the label", () => {
    expect(traitKey("Relationship with others", [])).toBe("relationship_with_others");
    expect(traitKey("  Games & sports! ", [])).toBe("games_sports");
  });

  it("never reuses a key already in the list", () => {
    expect(traitKey("Neatness", ["neatness"])).toBe("neatness_2");
    expect(traitKey("Neatness", ["neatness", "neatness_2"])).toBe("neatness_3");
  });

  it("still gives a key for a label with no letters", () => {
    expect(traitKey("***", [])).toBe("trait");
  });
});

describe("releaseChanges", () => {
  const released = {
    students: [{ student_id: "kemi", subjects_taken: 1, total: 75.6, out_of: 100, average: 75.6, arm_position: 2, level_position: 3 }],
    subjects: [{ student_id: "kemi", subject_id: "maths", total: 75.6, out_of: 100, percent: 75.6, position: 2, class_average: 81, scores: {} }],
    comments: [{ student_id: "kemi", kind: "class_teacher" as const, body: "Steady." }],
  };

  it("finds nothing when the live report matches the release", () => {
    expect(releaseChanges(released, released)).toEqual([]);
  });

  it("finds nothing to compare before anything is released", () => {
    expect(releaseChanges(released, null)).toEqual([]);
  });

  it("lists a corrected mark, the average and position it moved, and an edited comment", () => {
    const live = {
      students: [{ ...released.students[0], average: 83.6, arm_position: 1 }],
      subjects: [{ ...released.subjects[0], percent: 83.6 }],
      comments: [{ student_id: "kemi", kind: "class_teacher" as const, body: "Improved." }],
    };
    const changes = releaseChanges(live, released, new Map([["maths", "Mathematics"]]));
    expect(changes).toEqual([
      { studentId: "kemi", subjectId: "maths", what: "Mathematics", before: "75.6", after: "83.6" },
      { studentId: "kemi", what: "Average", before: "75.6", after: "83.6" },
      { studentId: "kemi", what: "Position", before: "2nd", after: "1st" },
      { studentId: "kemi", what: "Class teacher's comment", before: "Steady.", after: "Improved." },
    ]);
  });

  it("notices a subject or comment that appeared or disappeared since release", () => {
    const live = {
      students: released.students,
      subjects: [...released.subjects, { ...released.subjects[0], subject_id: "english", percent: 50 }],
      comments: [],
    };
    const changes = releaseChanges(live, released);
    expect(changes).toContainEqual({ studentId: "kemi", subjectId: "english", what: "Subject", before: "—", after: "50.0" });
    expect(changes).toContainEqual({ studentId: "kemi", what: "Class teacher's comment", before: "Steady.", after: "—" });
  });
});
