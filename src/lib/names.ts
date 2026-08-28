/**
 * Splitting a written-out person's name into first and last.
 *
 * Admissions collects the parent's name as one free-text field, because that is
 * what a parent filling in a form on a phone will actually do. Turning it into
 * a guardian record needs a first and last name, and the naive "everything
 * before the last word" split put the honorific in the first-name field — so
 * "Mrs Folake Okonkwo" produced a parent portal greeting of "Welcome, Mrs".
 *
 * Honorifics are near-universal in Nigerian school correspondence, so they are
 * stripped rather than tolerated.
 */

/**
 * Titles seen on Nigerian school forms. Matched case-insensitively, with or
 * without a trailing full stop.
 */
const HONORIFICS = new Set([
  "mr", "mrs", "miss", "ms", "mstr", "master",
  "dr", "prof", "professor", "engr", "engineer", "arc", "architect", "barr", "barrister",
  "chief", "otunba", "alhaji", "alhaja", "mallam", "malam", "hajia",
  "pastor", "rev", "reverend", "past", "evang", "evangelist", "deacon", "deaconess", "elder", "bishop", "imam",
  "sir", "lady", "hon", "honourable", "honorable", "amb", "ambassador", "capt", "captain",
]);

function isHonorific(word: string): boolean {
  return HONORIFICS.has(word.toLowerCase().replace(/\.$/, ""));
}

export interface SplitName {
  /** The honorific, if one was given — "Mrs", "Alhaji". Empty when there was none. */
  title: string;
  first: string;
  last: string;
}

/**
 * Split a full name into a title, a first name and a last name.
 *
 * A single word becomes both first and last, because the guardian record
 * requires both and a half-empty record is worse than a repeated one.
 */
export function splitPersonName(full: string): SplitName {
  const words = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { title: "", first: "", last: "" };

  const titles: string[] = [];
  while (words.length > 1 && isHonorific(words[0])) {
    titles.push(words.shift()!);
  }

  // "Mrs" on its own is a title and nothing else, but it is all we were given.
  if (words.length === 1 && titles.length === 0 && isHonorific(words[0])) {
    return { title: "", first: words[0], last: words[0] };
  }

  const title = titles.join(" ");
  if (words.length === 1) return { title, first: words[0], last: words[0] };

  return {
    title,
    first: words.slice(0, -1).join(" "),
    last: words[words.length - 1],
  };
}
