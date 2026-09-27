/**
 * The term report: CA and exam combined into one total per subject, with
 * positions, averages, comments and ratings.
 *
 * All the arithmetic and every position is computed by `term_report()` in the
 * database — a parent is shown their child's position without being able to
 * read anyone else's marks, so it cannot be worked out in the browser. This
 * module fetches that result and turns it into the printed report card.
 */
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_RUBRIC, gradeFromRubric, remarkForGrade } from "@/lib/performance";
import {
  documentShell, esc, footerHtml, letterheadHtml, printButtonHtml, type DocumentSchool,
} from "@/lib/document-theme";

export interface TermComponent {
  exam_id: string;
  name: string;
  term_weight: number;
  max_score: number;
}

export interface TermStudentResult {
  student_id: string;
  subjects_taken: number;
  total: number;
  out_of: number;
  average: number;
  arm_position: number;
  level_position: number;
}

export interface TermSubjectResult {
  student_id: string;
  subject_id: string;
  total: number;
  out_of: number;
  percent: number;
  position: number;
  class_average: number;
  /** Each assessment's own raw score, keyed by exam id. */
  scores: Record<string, number>;
}

export interface TermCommentRow {
  student_id: string;
  kind: "class_teacher" | "principal";
  body: string;
}

export interface TermRatingRow {
  student_id: string;
  domain: RatingDomain;
  trait: string;
  rating: number;
}

export interface TraitRow {
  domain: RatingDomain;
  key: string;
  label: string;
}

/** The part of a term report that a release freezes. */
export interface TermReportBody {
  components: TermComponent[];
  arm_size?: number;
  arm_average?: number | null;
  level_size?: number;
  level_average?: number | null;
  students: TermStudentResult[];
  subjects: TermSubjectResult[];
  comments?: TermCommentRow[];
  ratings?: TermRatingRow[];
  /** The school's own traits; null when it uses the defaults. */
  traits?: TraitRow[] | null;
}

export interface TermReport {
  released: boolean;
  /** When the report was last released. */
  released_at?: string | null;
  /** Staff only: the report as families currently see it. */
  snapshot?: TermReportBody | null;
  components: TermComponent[];
  arm_size?: number;
  arm_average?: number | null;
  level_size?: number;
  level_average?: number | null;
  students: TermStudentResult[];
  subjects: TermSubjectResult[];
  comments?: TermCommentRow[];
  ratings?: TermRatingRow[];
  traits?: TraitRow[] | null;
}

export const EMPTY_TERM_REPORT: TermReport = { released: false, components: [], students: [], subjects: [] };

export async function fetchTermReport(classId: string, periodId: string): Promise<TermReport> {
  const { data, error } = await supabase.rpc("term_report", { _class_id: classId, _period_id: periodId });
  if (error) throw error;
  return { ...EMPTY_TERM_REPORT, ...((data as unknown as TermReport | null) ?? {}) };
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const v = Math.trunc(n);
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
  switch (v % 10) {
    case 1: return `${v}st`;
    case 2: return `${v}nd`;
    case 3: return `${v}rd`;
    default: return `${v}th`;
  }
}

/**
 * Whether an arm's weighted exams add up to a whole term. A report still
 * computes when they do not — each subject is out of what was actually sat —
 * but a school almost always means them to reach 100.
 */
export function weightStatus(components: Pick<TermComponent, "term_weight">[]): {
  total: number;
  complete: boolean;
  message: string | null;
} {
  const total = Math.round(components.reduce((sum, c) => sum + Number(c.term_weight || 0), 0) * 100) / 100;
  if (components.length === 0) {
    return { total, complete: false, message: "No exam in this term counts toward the term report yet. Give CA1, CA2 and the exam a term weight." };
  }
  if (total === 100) return { total, complete: true, message: null };
  return {
    total,
    complete: false,
    message: total < 100
      ? `The weighted exams add up to ${total}%, not 100%. A component may still be missing.`
      : `The weighted exams add up to ${total}%, more than 100%. Check the weights.`,
  };
}

export interface RatingTrait {
  key: string;
  label: string;
}

export const AFFECTIVE_TRAITS: RatingTrait[] = [
  { key: "punctuality", label: "Punctuality" },
  { key: "attendance", label: "Attendance" },
  { key: "neatness", label: "Neatness" },
  { key: "politeness", label: "Politeness" },
  { key: "honesty", label: "Honesty" },
  { key: "self_control", label: "Self-control" },
  { key: "relationship", label: "Relationship with others" },
  { key: "attentiveness", label: "Attentiveness" },
];

export const PSYCHOMOTOR_TRAITS: RatingTrait[] = [
  { key: "handwriting", label: "Handwriting" },
  { key: "verbal_fluency", label: "Verbal fluency" },
  { key: "sports", label: "Games and sports" },
  { key: "crafts", label: "Handling tools and crafts" },
  { key: "drawing", label: "Drawing and painting" },
  { key: "music", label: "Musical skills" },
];

export const RATING_SCALE: { value: number; label: string }[] = [
  { value: 5, label: "Excellent" },
  { value: 4, label: "Very good" },
  { value: 3, label: "Good" },
  { value: 2, label: "Fair" },
  { value: 1, label: "Poor" },
];

export type RatingDomain = "affective" | "psychomotor";

export interface TraitLists {
  affective: RatingTrait[];
  psychomotor: RatingTrait[];
}

export const DEFAULT_TRAITS: TraitLists = { affective: AFFECTIVE_TRAITS, psychomotor: PSYCHOMOTOR_TRAITS };

/**
 * A school's traits, falling back to the defaults for any domain it has not
 * customised — a school that only edits the affective list keeps the default
 * psychomotor one rather than losing it.
 */
export function traitLists(rows: Pick<TraitRow, "domain" | "key" | "label">[] | null | undefined): TraitLists {
  const pick = (domain: RatingDomain) => {
    const own = (rows ?? []).filter((r) => r.domain === domain).map((r) => ({ key: r.key, label: r.label }));
    return own.length > 0 ? own : DEFAULT_TRAITS[domain];
  };
  return { affective: pick("affective"), psychomotor: pick("psychomotor") };
}

/**
 * A stable key for a new trait. Ratings refer to a trait by key, so the key
 * never changes when the label is edited; it only has to be unique within the
 * school's list for that domain.
 */
export function traitKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "trait";
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export interface TermRating {
  domain: RatingDomain;
  trait: string;
  rating: number;
}

export interface TermComments {
  classTeacher?: string | null;
  principal?: string | null;
}

export interface ReportCardPupil {
  id: string;
  name: string;
  idNumber?: string | null;
}

/** One thing that is different now from what families were given. */
export interface ReleaseChange {
  studentId: string;
  /** What changed, in words a teacher reads: "Mathematics", "Average", "Position", "Class teacher's comment". */
  what: string;
  subjectId?: string;
  before: string;
  after: string;
}

/**
 * Everything that differs between the live report and the released snapshot:
 * subject totals, averages, positions and comments. Staff see this list until
 * someone releases again; families keep the snapshot meanwhile.
 */
export function releaseChanges(
  live: Pick<TermReportBody, "students" | "subjects" | "comments">,
  released: Pick<TermReportBody, "students" | "subjects" | "comments"> | null | undefined,
  subjectNames: Map<string, string> = new Map(),
): ReleaseChange[] {
  if (!released) return [];
  const changes: ReleaseChange[] = [];
  const num = (v: number | undefined) => (v === undefined ? "—" : Number(v).toFixed(1));

  const subjectKey = (s: { student_id: string; subject_id: string }) => `${s.student_id}:${s.subject_id}`;
  const was = new Map(released.subjects.map((s) => [subjectKey(s), s]));
  const now = new Map(live.subjects.map((s) => [subjectKey(s), s]));
  for (const key of new Set([...was.keys(), ...now.keys()])) {
    const before = was.get(key)?.percent;
    const after = now.get(key)?.percent;
    if (before !== undefined && after !== undefined && Number(before) === Number(after)) continue;
    const [studentId, subjectId] = key.split(":");
    changes.push({ studentId, subjectId, what: subjectNames.get(subjectId) ?? "Subject", before: num(before), after: num(after) });
  }

  const wasPupil = new Map(released.students.map((s) => [s.student_id, s]));
  for (const s of live.students) {
    const before = wasPupil.get(s.student_id);
    if (!before) continue;
    if (Number(before.average) !== Number(s.average)) {
      changes.push({ studentId: s.student_id, what: "Average", before: num(before.average), after: num(s.average) });
    }
    if (Number(before.arm_position) !== Number(s.arm_position)) {
      changes.push({ studentId: s.student_id, what: "Position", before: ordinal(before.arm_position), after: ordinal(s.arm_position) });
    }
  }

  const label = { class_teacher: "Class teacher's comment", principal: "Principal's comment" } as const;
  const commentKey = (c: TermCommentRow) => `${c.student_id}:${c.kind}`;
  const wasComment = new Map((released.comments ?? []).map((c) => [commentKey(c), c.body]));
  const nowComment = new Map((live.comments ?? []).map((c) => [commentKey(c), c.body]));
  for (const key of new Set([...wasComment.keys(), ...nowComment.keys()])) {
    const before = wasComment.get(key) ?? "";
    const after = nowComment.get(key) ?? "";
    if (before === after) continue;
    const [studentId, kind] = key.split(":") as [string, TermCommentRow["kind"]];
    changes.push({ studentId, what: label[kind], before: before || "—", after: after || "—" });
  }

  return changes;
}

export interface ReportCardInput {
  school: DocumentSchool;
  className: string;
  levelName?: string | null;
  periodName: string;
  report: TermReport;
  subjectNames: Map<string, string>;
  pupils: ReportCardPupil[];
  comments: Map<string, TermComments>;
  ratings: Map<string, TermRating[]>;
  attendance?: Map<string, { present: number; total: number }>;
  nextTermBegins?: string | null;
  /** The school's traits. Defaults when not given. */
  traits?: TraitLists;
}

const fmt = (n: number | null | undefined, dp = 1) =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : Number(n).toFixed(dp);

function ratingsTable(title: string, traits: RatingTrait[], given: TermRating[], domain: RatingDomain): string {
  const byTrait = new Map(given.filter((r) => r.domain === domain).map((r) => [r.trait, r.rating]));
  const rows = traits
    .map((t) => {
      const value = byTrait.get(t.key);
      const label = RATING_SCALE.find((s) => s.value === value)?.label;
      return `<tr><td>${esc(t.label)}</td><td class="num">${value ?? "—"}</td><td class="muted">${esc(label ?? "")}</td></tr>`;
    })
    .join("");
  return `<table class="doc"><thead><tr><th>${esc(title)}</th><th style="text-align:right">Rating</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function pupilPage(input: ReportCardInput, pupil: ReportCardPupil): string {
  const { report } = input;
  const result = report.students.find((s) => s.student_id === pupil.id);
  const subjects = report.subjects
    .filter((s) => s.student_id === pupil.id)
    .sort((a, b) => (input.subjectNames.get(a.subject_id) ?? "").localeCompare(input.subjectNames.get(b.subject_id) ?? ""));
  const comments = input.comments.get(pupil.id) ?? {};
  const ratings = input.ratings.get(pupil.id) ?? [];
  const attendance = input.attendance?.get(pupil.id);

  const componentHeads = report.components
    .map((c) => `<th style="text-align:right">${esc(c.name)}<br><span class="muted" style="font-weight:400">${fmt(c.term_weight, 0)}%</span></th>`)
    .join("");

  const rows = subjects.length
    ? subjects
        .map((s) => {
          const grade = gradeFromRubric(s.percent, DEFAULT_RUBRIC);
          const cells = report.components
            .map((c) => {
              const raw = s.scores[c.exam_id];
              return `<td class="num">${raw === undefined ? "—" : fmt(raw, raw % 1 === 0 ? 0 : 1)}</td>`;
            })
            .join("");
          return `<tr>
            <td>${esc(input.subjectNames.get(s.subject_id) ?? "Subject")}</td>
            ${cells}
            <td class="num" style="font-weight:700">${fmt(s.percent)}</td>
            <td class="num">${esc(grade)}</td>
            <td class="num">${ordinal(s.position)}</td>
            <td class="num">${fmt(s.class_average)}</td>
            <td class="muted">${esc(remarkForGrade(grade))}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="${report.components.length + 6}" class="muted" style="padding:22px;text-align:center">No results for this term yet.</td></tr>`;

  const overallGrade = result ? gradeFromRubric(result.average, DEFAULT_RUBRIC) : "—";
  const levelLabel = input.levelName && input.levelName !== input.className ? input.levelName : null;

  return `<section class="report-page">
  ${letterheadHtml(input.school, {
    kicker: "Report card",
    title: input.periodName,
    meta: [input.className],
  })}

  <div class="grid-3 card">
    <div><p class="label">Pupil</p><p class="value">${esc(pupil.name)}</p>
      <p class="muted" style="font-size:11.5px">${esc(pupil.idNumber || "")}</p></div>
    <div><p class="label">Class</p><p class="value">${esc(input.className)}</p></div>
    <div><p class="label">Attendance</p><p class="value">${
      attendance && attendance.total > 0 ? `${attendance.present} of ${attendance.total} days` : "—"
    }</p></div>
  </div>

  <p class="section-title">Results</p>
  <div class="table-scroll">
  <table class="doc" style="min-width:560px">
    <thead><tr>
      <th>Subject</th>${componentHeads}
      <th style="text-align:right">Total</th><th style="text-align:right">Grade</th>
      <th style="text-align:right">Position</th><th style="text-align:right">Class avg</th><th>Remark</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </div>

  <div class="grid-3 card" style="margin-top:16px">
    <div><p class="label">Average</p><p class="value">${result ? `${fmt(result.average)}%` : "—"} <span class="muted">${esc(overallGrade)}</span></p></div>
    <div><p class="label">Position in ${esc(input.className)}</p><p class="value">${
      result ? `${ordinal(result.arm_position)} of ${report.arm_size ?? "—"}` : "—"
    }</p></div>
    <div><p class="label">${levelLabel ? `Position in ${esc(levelLabel)}` : "Class average"}</p><p class="value">${
      levelLabel
        ? result ? `${ordinal(result.level_position)} of ${report.level_size ?? "—"}` : "—"
        : `${fmt(report.arm_average)}%`
    }</p></div>
  </div>

  <div class="grid-2" style="margin-top:18px">
    ${ratingsTable("Affective", (input.traits ?? DEFAULT_TRAITS).affective, ratings, "affective")}
    ${ratingsTable("Psychomotor", (input.traits ?? DEFAULT_TRAITS).psychomotor, ratings, "psychomotor")}
  </div>
  <p class="muted" style="font-size:10.5px;margin-top:6px">${RATING_SCALE.map((r) => `${r.value} ${esc(r.label)}`).join(" · ")}</p>

  <p class="section-title">Comments</p>
  <div class="card">
    <p class="label">Class teacher</p><p style="margin:4px 0 12px">${esc(comments.classTeacher || "—")}</p>
    <p class="label">Principal</p><p style="margin-top:4px">${esc(comments.principal || "—")}</p>
  </div>

  ${input.nextTermBegins ? `<p style="margin-top:14px"><span class="label">Next term begins</span> <strong>${esc(input.nextTermBegins)}</strong></p>` : ""}

  <div class="sign-row">
    <div class="sign-line">Class teacher</div>
    <div class="sign-line">Principal's signature and stamp</div>
  </div>
  ${footerHtml(input.school, "Positions are shared where averages are equal.")}
</section>`;
}

/** One report card per pupil, each on its own page. */
export function termReportHtml(input: ReportCardInput): string {
  const pages = input.pupils.map((p) => pupilPage(input, p)).join("");
  return documentShell(input.school, {
    title: input.pupils.length === 1
      ? `Report card — ${input.pupils[0].name}`
      : `Report cards — ${input.className}, ${input.periodName}`,
    body: `${pages}${printButtonHtml()}`,
    extraCss: `
      .report-page + .report-page { page-break-before: always; margin-top: 48px; }
      @media print { .report-page + .report-page { margin-top: 0; } }
    `,
  });
}

/** Comments from a term report's rows, keyed by pupil. */
export function commentsByStudent(rows: TermCommentRow[] | undefined): Map<string, TermComments> {
  const map = new Map<string, TermComments>();
  for (const c of rows ?? []) {
    const entry = map.get(c.student_id) ?? {};
    if (c.kind === "principal") entry.principal = c.body;
    else entry.classTeacher = c.body;
    map.set(c.student_id, entry);
  }
  return map;
}

/** Ratings from a term report's rows, keyed by pupil. */
export function ratingsByStudent(rows: TermRatingRow[] | undefined): Map<string, TermRating[]> {
  const map = new Map<string, TermRating[]>();
  for (const r of rows ?? []) {
    map.set(r.student_id, [...(map.get(r.student_id) ?? []), { domain: r.domain, trait: r.trait, rating: r.rating }]);
  }
  return map;
}
