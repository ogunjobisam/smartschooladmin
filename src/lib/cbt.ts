/**
 * Client-side pieces of computer-based testing that do not touch the network.
 *
 * The school sits tests in a lab whose internet drops out, so the test screen
 * never assumes a request will succeed: every answer goes into a queue kept in
 * localStorage first and is sent from there. If the page reloads mid-test the
 * queue is still there; if the connection drops, answers keep accumulating and
 * go up in one batch when it returns. The server keeps the last write per
 * question by sequence number, so replaying a batch is harmless.
 *
 * Marking and the answer key never reach the browser. See the CBT migration.
 */

export interface QueuedAnswer {
  questionId: string;
  optionId: string | null;
  seq: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY_PREFIX = "cbt-answers:";

interface QueueState {
  seq: number;
  /** Latest unsent answer per question. */
  pending: Record<string, QueuedAnswer>;
  /** Latest answer per question, sent or not — what the pupil sees ticked. */
  chosen: Record<string, string | null>;
}

function emptyState(): QueueState {
  return { seq: 0, pending: {}, chosen: {} };
}

export class AnswerQueue {
  private state: QueueState;

  constructor(
    private readonly attemptId: string,
    private readonly storage: StorageLike | null,
  ) {
    this.state = this.load();
  }

  private get key() {
    return KEY_PREFIX + this.attemptId;
  }

  private load(): QueueState {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw) as QueueState;
      if (typeof parsed?.seq !== "number") return emptyState();
      return { seq: parsed.seq, pending: parsed.pending ?? {}, chosen: parsed.chosen ?? {} };
    } catch {
      return emptyState();
    }
  }

  private save() {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch {
      // Storage full or blocked: the answer is still held in memory.
    }
  }

  /** Seed from what the server already holds, without overriding newer local picks. */
  hydrate(serverAnswers: Record<string, string | null>, serverSeq = 0) {
    for (const [questionId, optionId] of Object.entries(serverAnswers)) {
      if (!(questionId in this.state.pending)) this.state.chosen[questionId] = optionId;
    }
    this.state.seq = Math.max(this.state.seq, serverSeq);
    this.save();
  }

  answer(questionId: string, optionId: string | null): QueuedAnswer {
    this.state.seq += 1;
    const entry = { questionId, optionId, seq: this.state.seq };
    this.state.pending[questionId] = entry;
    this.state.chosen[questionId] = optionId;
    this.save();
    return entry;
  }

  chosen(): Record<string, string | null> {
    return { ...this.state.chosen };
  }

  pending(): QueuedAnswer[] {
    return Object.values(this.state.pending).sort((a, b) => a.seq - b.seq);
  }

  /** Drop entries the server has confirmed, keeping any newer re-answers. */
  acknowledge(sent: QueuedAnswer[]) {
    for (const entry of sent) {
      const current = this.state.pending[entry.questionId];
      if (current && current.seq <= entry.seq) delete this.state.pending[entry.questionId];
    }
    this.save();
  }

  clear() {
    this.state = emptyState();
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}

/**
 * Seconds left, measured against the server's clock. `serverOffsetMs` is
 * server time minus local time, taken when the attempt was fetched, so a lab PC
 * with a wrong clock neither gains nor loses time.
 */
export function secondsRemaining(deadlineIso: string, serverOffsetMs: number, nowMs = Date.now()): number {
  const left = (Date.parse(deadlineIso) - (nowMs + serverOffsetMs)) / 1000;
  return Math.max(0, Math.floor(left));
}

export function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// --- CSV import -------------------------------------------------------------

export interface ImportedOption {
  id: string;
  text: string;
}

export interface ImportedQuestion {
  prompt: string;
  question_type: "mcq" | "true_false";
  options: ImportedOption[];
  correct_option: string;
  marks: number;
}

export interface ImportResult {
  questions: ImportedQuestion[];
  errors: string[];
}

export const CBT_CSV_TEMPLATE =
  "question,option_a,option_b,option_c,option_d,option_e,answer,marks\n" +
  '"What is 7 x 8?",54,56,58,64,,B,1\n' +
  '"Lagos is the capital of Nigeria.",True,False,,,,B,1\n';

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const LETTERS = ["a", "b", "c", "d", "e"] as const;

export function importQuestionsCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const questions: ImportedQuestion[] = [];
  if (rows.length === 0) return { questions, errors: ["The file is empty."] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("question") < 0 || col("answer") < 0) {
    return { questions, errors: ['The first row must include "question" and "answer" columns.'] };
  }

  rows.slice(1).forEach((r, index) => {
    const line = index + 2;
    const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? "").trim() : "");
    const prompt = get("question");
    if (!prompt) {
      errors.push(`Row ${line}: the question is blank.`);
      return;
    }
    const options = LETTERS.map((l) => ({ id: l, text: get(`option_${l}`) })).filter((o) => o.text !== "");
    if (options.length < 2) {
      errors.push(`Row ${line}: needs at least two options.`);
      return;
    }
    const answerRaw = get("answer").toLowerCase();
    let correct = options.find((o) => o.id === answerRaw)?.id;
    if (!correct) correct = options.find((o) => o.text.toLowerCase() === answerRaw)?.id;
    if (!correct) {
      errors.push(`Row ${line}: answer "${get("answer")}" does not match any option.`);
      return;
    }
    const marksRaw = get("marks");
    const marks = marksRaw === "" ? 1 : Number(marksRaw);
    if (!Number.isFinite(marks) || marks <= 0) {
      errors.push(`Row ${line}: marks must be a positive number.`);
      return;
    }
    const isTrueFalse =
      options.length === 2 &&
      options[0].text.toLowerCase() === "true" &&
      options[1].text.toLowerCase() === "false";
    questions.push({
      prompt,
      question_type: isTrueFalse ? "true_false" : "mcq",
      options,
      correct_option: correct,
      marks,
    });
  });

  return { questions, errors };
}
