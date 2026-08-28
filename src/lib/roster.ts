/**
 * Working out who is in a class for a given term.
 *
 * Enrolment is per (student, class, term), so a class can hold students who are
 * enrolled for a different term than the one being viewed. That is the ordinary
 * state of things right after a term rolls over, and it is very different from a
 * class nobody is in — the first needs a term switch, the second needs students.
 * Keeping the distinction here means the register can say which it is.
 */

export interface EnrolmentRow<TStudent = unknown> {
  student_id: string;
  academic_period_id: string | null;
  students: TStudent | null;
}

export interface RosterResult<TStudent> {
  /** Students enrolled in this class for the requested term. */
  students: TStudent[];
  /** Term ids the class's other enrolments sit in, when the requested term is empty. */
  otherPeriodIds: string[];
  /** True when the class has no enrolments at all, in any term. */
  isEmptyClass: boolean;
}

export function rosterForPeriod<TStudent>(
  enrolments: EnrolmentRow<TStudent>[],
  periodId: string | null | undefined
): RosterResult<TStudent> {
  const withStudent = enrolments.filter((e) => e.students != null);

  const inPeriod = periodId
    ? withStudent.filter((e) => e.academic_period_id === periodId)
    : withStudent;

  if (inPeriod.length > 0) {
    return {
      students: inPeriod.map((e) => e.students as TStudent),
      otherPeriodIds: [],
      isEmptyClass: false,
    };
  }

  const otherPeriodIds = [
    ...new Set(
      withStudent
        .map((e) => e.academic_period_id)
        .filter((id): id is string => id !== null && id !== periodId)
    ),
  ];

  return { students: [], otherPeriodIds, isEmptyClass: withStudent.length === 0 };
}
