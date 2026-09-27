import { describe, expect, it } from "vitest";
import {
  AnswerQueue,
  CBT_CSV_TEMPLATE,
  formatClock,
  importQuestionsCsv,
  parseCsv,
  secondsRemaining,
  type StorageLike,
} from "@/lib/cbt";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("AnswerQueue", () => {
  it("keeps only the latest pending answer per question", () => {
    const q = new AnswerQueue("a1", memoryStorage());
    q.answer("q1", "a");
    q.answer("q2", "b");
    q.answer("q1", "c");
    expect(q.pending().map((p) => [p.questionId, p.optionId, p.seq])).toEqual([
      ["q2", "b", 2],
      ["q1", "c", 3],
    ]);
  });

  it("survives a page reload", () => {
    const storage = memoryStorage();
    new AnswerQueue("a1", storage).answer("q1", "d");
    const reloaded = new AnswerQueue("a1", storage);
    expect(reloaded.pending()).toHaveLength(1);
    expect(reloaded.chosen()).toEqual({ q1: "d" });
  });

  it("does not drop an answer changed while its earlier value was in flight", () => {
    const q = new AnswerQueue("a1", memoryStorage());
    q.answer("q1", "a");
    const inFlight = q.pending();
    q.answer("q1", "b");
    q.acknowledge(inFlight);
    expect(q.pending().map((p) => p.optionId)).toEqual(["b"]);
  });

  it("hydrating from the server does not override an unsent local pick", () => {
    const q = new AnswerQueue("a1", memoryStorage());
    q.answer("q1", "c");
    q.hydrate({ q1: "a", q2: "b" }, 10);
    expect(q.chosen()).toEqual({ q1: "c", q2: "b" });
    expect(q.answer("q3", "a").seq).toBe(11);
  });

  it("works with no storage at all", () => {
    const q = new AnswerQueue("a1", null);
    q.answer("q1", "a");
    expect(q.pending()).toHaveLength(1);
  });

  it("clear removes the stored copy", () => {
    const storage = memoryStorage();
    const q = new AnswerQueue("a1", storage);
    q.answer("q1", "a");
    q.clear();
    expect(storage.data.size).toBe(0);
  });
});

describe("timer", () => {
  it("measures against server time, not the local clock", () => {
    const now = Date.parse("2026-09-27T10:00:00Z");
    // Local clock is 60s slow: server is 60s ahead.
    expect(secondsRemaining("2026-09-27T10:05:00Z", 60_000, now)).toBe(240);
    expect(secondsRemaining("2026-09-27T09:00:00Z", 0, now)).toBe(0);
  });

  it("formats minutes and hours", () => {
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});

describe("CSV import", () => {
  it("parses quoted fields with commas, quotes and newlines", () => {
    expect(parseCsv('a,"b, c","say ""hi""\nthere"\r\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"\nthere'],
      ["1", "2", "3"],
    ]);
  });

  it("imports the template", () => {
    const { questions, errors } = importQuestionsCsv(CBT_CSV_TEMPLATE);
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ question_type: "mcq", correct_option: "b", marks: 1 });
    expect(questions[0].options).toHaveLength(4);
    expect(questions[1]).toMatchObject({ question_type: "true_false", correct_option: "b" });
  });

  it("accepts the answer as option text", () => {
    const { questions } = importQuestionsCsv("question,option_a,option_b,answer\nPick,Yes,No,no\n");
    expect(questions[0].correct_option).toBe("b");
  });

  it("reports bad rows by line number and keeps the good ones", () => {
    const csv = [
      "question,option_a,option_b,answer,marks",
      "Good,1,2,A,2",
      ",1,2,A,1",
      "One option,1,,A,1",
      "Bad answer,1,2,Z,1",
      "Bad marks,1,2,A,-1",
    ].join("\n");
    const { questions, errors } = importQuestionsCsv(csv);
    expect(questions.map((q) => q.prompt)).toEqual(["Good"]);
    expect(errors).toEqual([
      "Row 3: the question is blank.",
      "Row 4: needs at least two options.",
      'Row 5: answer "Z" does not match any option.',
      "Row 6: marks must be a positive number.",
    ]);
  });

  it("rejects a file without the required headers", () => {
    expect(importQuestionsCsv("foo,bar\n1,2").errors).toHaveLength(1);
  });
});
