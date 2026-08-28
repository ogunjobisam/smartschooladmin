import { describe, expect, it } from "vitest";

import {
  buildCertificatesDocument,
  categoriesFor,
  categoryLabel,
  type CertificateRecipient,
} from "@/lib/certificates";

const school = { name: "Smartever School of Life", address: "12 Awolowo Road, Lagos" };

const student: CertificateRecipient = {
  name: "Adaeze Okafor",
  subjectType: "student",
  className: "Primary 6",
  title: "Best in Class",
  category: "best_in_class",
  awardDate: "2026-07-24",
  periodName: "Third Term",
};

describe("certificates", () => {
  it("prints one sheet per recipient", () => {
    const html = buildCertificatesDocument([student, { ...student, name: "Chidi Eze" }], { kind: "certificate" }, school);
    expect(html.match(/class="sheet certificate"/g)).toHaveLength(2);
    expect(html).toContain("Adaeze Okafor");
    expect(html).toContain("Chidi Eze");
  });

  it("addresses the student letter to the guardian and the staff letter to the person", () => {
    const forParent = buildCertificatesDocument([student], { kind: "letter" }, school);
    expect(forParent).toContain("Dear Parent or Guardian");

    const forStaff = buildCertificatesDocument(
      [{ ...student, subjectType: "staff", name: "Bisi Adewale", category: "teacher_of_term", title: "Teacher of the Term" }],
      { kind: "letter" },
      school,
    );
    expect(forStaff).toContain("Dear Bisi Adewale");
  });

  it("names the subject on a subject prize", () => {
    const html = buildCertificatesDocument(
      [{ ...student, category: "subject_prize", title: "Mathematics Prize", subjectName: "Mathematics" }],
      { kind: "certificate" },
      school,
    );
    expect(html).toContain("distinguished achievement in Mathematics");
  });

  it("escapes recipient names so a stray angle bracket cannot break the page", () => {
    const html = buildCertificatesDocument([{ ...student, name: "<script>x</script>" }], { kind: "certificate" }, school);
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("offers only categories that fit the recipient", () => {
    expect(categoriesFor("student").map((c) => c.value)).toContain("best_graduating");
    expect(categoriesFor("student").map((c) => c.value)).not.toContain("long_service");
    expect(categoriesFor("staff").map((c) => c.value)).toContain("teacher_of_term");
    expect(categoryLabel("best_in_class")).toBe("Best in Class");
  });
});
