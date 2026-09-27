import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Report cards are printed through window.open("") + document.write, which runs
 * in the app's origin with the signed-in session in reach. Pupil names arrive
 * from the public admissions form, so every free-text value interpolated into
 * that HTML must go through esc().
 */
const FREE_TEXT = /name|tagline|logoUrl|student_id_number/;

function unescapedInterpolations(file: string, from: string, to: string): string[] {
  const src = readFileSync(resolve(__dirname, "../..", file), "utf8");
  const start = src.indexOf(from);
  const end = src.indexOf(to, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const region = src.slice(start, end);
  // Innermost interpolations only, so a `${cond ? `...${esc(x)}` : ""}` guard is
  // judged by the value it prints, not by its condition.
  return [...region.matchAll(/\$\{((?:(?!\$\{)[^}])*)\}/g)]
    .map((m) => m[1].trim())
    .filter((expr) => FREE_TEXT.test(expr) && !expr.startsWith("esc(") && !expr.startsWith("theme."));
}

describe("report card print windows escape free text", () => {
  it("ExamDetail bulk report cards", () => {
    expect(unescapedInterpolations("src/pages/ExamDetail.tsx", "const rows = studentScores", "win.document.close")).toEqual([]);
  });

  it("ReportCardView single report card", () => {
    expect(unescapedInterpolations("src/components/exams/ReportCardView.tsx", "const handlePrint", "win.document.close")).toEqual([]);
  });
});
