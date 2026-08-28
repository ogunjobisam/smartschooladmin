import type { Enums } from "@/integrations/supabase/types";

export type SchoolSection = Enums<"school_section">;

export interface SectionDefinition {
  value: SchoolSection;
  label: string;
  ageRange: string;
  /** The class names a school of this section typically runs, in order. */
  defaultClasses: string[];
}

/**
 * The four age bands Nigerian private schools commonly run.
 *
 * Onboarding used to offer JSS1–SS3 only — secondary — which quietly assumed
 * every school was a secondary school. A school picks the sections it actually
 * runs and gets the usual class names for each.
 */
export const SCHOOL_SECTIONS: SectionDefinition[] = [
  {
    value: "toddler",
    label: "Toddler",
    ageRange: "18–36 months",
    defaultClasses: ["Toddler"],
  },
  {
    value: "nursery",
    label: "Nursery",
    ageRange: "Ages 3–5",
    defaultClasses: ["Nursery 1", "Nursery 2", "Reception"],
  },
  {
    value: "primary",
    label: "Primary",
    ageRange: "Ages 6–11",
    defaultClasses: ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"],
  },
  {
    value: "secondary",
    label: "Secondary",
    ageRange: "Ages 12–16",
    defaultClasses: ["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3"],
  },
];

const BY_VALUE = new Map(SCHOOL_SECTIONS.map((s) => [s.value, s]));

export function sectionLabel(section: SchoolSection | null | undefined): string {
  return section ? BY_VALUE.get(section)?.label ?? section : "Unassigned";
}

/** Section order for grouping, with unassigned classes last. */
export function sectionRank(section: SchoolSection | null | undefined): number {
  if (!section) return SCHOOL_SECTIONS.length;
  const index = SCHOOL_SECTIONS.findIndex((s) => s.value === section);
  return index === -1 ? SCHOOL_SECTIONS.length : index;
}

export interface PlannedClass {
  name: string;
  section: SchoolSection;
}

/** The class list for a chosen set of sections, in age order. */
export function classesForSections(sections: SchoolSection[]): PlannedClass[] {
  const chosen = new Set(sections);
  return SCHOOL_SECTIONS
    .filter((s) => chosen.has(s.value))
    .flatMap((s) => s.defaultClasses.map((name) => ({ name, section: s.value })));
}

/** Sorts classes by section, then by the school's own level order. */
export function sortBySection<T extends { section?: SchoolSection | null; level_order?: number | null; name: string }>(
  classes: T[]
): T[] {
  return [...classes].sort((a, b) => {
    const bySection = sectionRank(a.section) - sectionRank(b.section);
    if (bySection !== 0) return bySection;
    const byOrder = (a.level_order ?? 0) - (b.level_order ?? 0);
    if (byOrder !== 0) return byOrder;
    return a.name.localeCompare(b.name);
  });
}
