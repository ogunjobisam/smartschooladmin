import { describe, it, expect } from "vitest";
import {
  SCHOOL_SECTIONS, classesForSections, composeClassName, sectionLabel, sectionRank, sortBySection,
} from "@/lib/sections";

describe("classesForSections", () => {
  it("returns the usual class names for the chosen sections, in age order", () => {
    const planned = classesForSections(["nursery", "primary"]);
    expect(planned[0]).toEqual({ name: "Nursery 1", section: "nursery" });
    expect(planned.at(-1)).toEqual({ name: "Primary 6", section: "primary" });
  });

  it("keeps sections in age order regardless of the order they were chosen", () => {
    const planned = classesForSections(["secondary", "toddler"]);
    expect(planned[0].section).toBe("toddler");
    expect(planned.at(-1)?.section).toBe("secondary");
  });

  it("returns nothing when no section is chosen", () => {
    expect(classesForSections([])).toEqual([]);
  });

  it("covers every defined section", () => {
    const all = classesForSections(SCHOOL_SECTIONS.map((s) => s.value));
    expect(new Set(all.map((c) => c.section)).size).toBe(SCHOOL_SECTIONS.length);
  });
});

describe("sectionLabel", () => {
  it("names a section", () => {
    expect(sectionLabel("primary")).toBe("Primary");
  });

  it("calls a class with no section unassigned rather than showing a blank", () => {
    expect(sectionLabel(null)).toBe("Unassigned");
    expect(sectionLabel(undefined)).toBe("Unassigned");
  });
});

describe("sortBySection", () => {
  it("orders by section, then by the school's own level order", () => {
    const sorted = sortBySection([
      { name: "SS1", section: "secondary" as const, level_order: 4 },
      { name: "Primary 2", section: "primary" as const, level_order: 2 },
      { name: "Primary 1", section: "primary" as const, level_order: 1 },
      { name: "Nursery 1", section: "nursery" as const, level_order: 1 },
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["Nursery 1", "Primary 1", "Primary 2", "SS1"]);
  });

  it("puts classes with no section last rather than first", () => {
    // Ordering them first would bury a school's real classes under strays.
    const sorted = sortBySection([
      { name: "Legacy", section: null, level_order: 0 },
      { name: "JSS1", section: "secondary" as const, level_order: 1 },
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["JSS1", "Legacy"]);
  });

  it("falls back to the name when section and order match", () => {
    const sorted = sortBySection([
      { name: "Beta", section: "primary" as const, level_order: 1 },
      { name: "Alpha", section: "primary" as const, level_order: 1 },
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["Alpha", "Beta"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [
      { name: "SS1", section: "secondary" as const, level_order: 1 },
      { name: "Nursery 1", section: "nursery" as const, level_order: 1 },
    ];
    sortBySection(input);
    expect(input[0].name).toBe("SS1");
  });
});

describe("sectionRank", () => {
  it("ranks in age order", () => {
    expect(sectionRank("toddler")).toBeLessThan(sectionRank("secondary"));
  });
});

describe("composeClassName", () => {
  it("writes a letter arm straight after the level number", () => {
    expect(composeClassName("JSS1", "A")).toBe("JSS1A");
    expect(composeClassName("Primary 4", "b")).toBe("Primary 4B");
  });

  it("spaces a word arm", () => {
    expect(composeClassName("JSS2", "Gold")).toBe("JSS2 Gold");
  });

  it("is just the level when there is no arm", () => {
    expect(composeClassName(" Nursery 1 ", null)).toBe("Nursery 1");
    expect(composeClassName("JSS1", "  ")).toBe("JSS1");
  });

  it("spaces a letter arm when the level does not end in a number", () => {
    expect(composeClassName("Reception", "A")).toBe("Reception A");
  });
});
