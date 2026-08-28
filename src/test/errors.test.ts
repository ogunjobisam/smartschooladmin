import { describe, it, expect } from "vitest";
import { diagnoseError, getErrorMessage } from "@/lib/errors";

describe("getErrorMessage", () => {
  it("reads a message off anything that carries one", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("boom")).toBe("boom");
    expect(getErrorMessage({ message: "boom" })).toBe("boom");
  });

  it("falls back when there is nothing usable to show", () => {
    // A blank message is worse than the fallback: it renders an empty toast.
    expect(getErrorMessage({ message: "   " }, "fallback")).toBe("fallback");
    expect(getErrorMessage(null, "fallback")).toBe("fallback");
    expect(getErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});

describe("diagnoseError", () => {
  it("explains a row-level security refusal in words a head teacher can act on", () => {
    const d = diagnoseError({
      code: "42501",
      message: "permission denied for table students",
    });
    expect(d.code).toBe("42501");
    expect(d.likelyCause).toMatch(/row-level security|policy/i);
  });

  it("names a missing function as an unapplied migration", () => {
    // The single most likely cause of a sign-in that lands nowhere: the
    // database function AuthContext calls was never created on this project.
    for (const code of ["42883", "PGRST202"]) {
      expect(diagnoseError({ code, message: "not found" }).likelyCause)
        .toMatch(/migration/i);
    }
  });

  it("recognises policy recursion, which fails nothing else the same way", () => {
    expect(diagnoseError({ code: "42P17", message: "infinite recursion" }).likelyCause)
      .toMatch(/loop|recursion/i);
  });

  it("leaves an unrecognised code without a guess", () => {
    // Inventing a cause for a code we do not know sends people down the wrong
    // path; the raw report is more useful than a plausible wrong sentence.
    const d = diagnoseError({ code: "XX999", message: "something odd" });
    expect(d.likelyCause).toBeNull();
    expect(d.report).toContain("XX999");
  });

  it("puts the code, message, details and hint on one copyable line", () => {
    const d = diagnoseError({
      code: "42501",
      message: "permission denied",
      details: "for table students",
      hint: "check the policy",
    });
    expect(d.report).toBe("[42501] — permission denied — for table students — check the policy");
  });

  it("survives an error carrying nothing but a message", () => {
    const d = diagnoseError(new Error("network failure"));
    expect(d.code).toBeNull();
    expect(d.likelyCause).toBeNull();
    expect(d.report).toBe("network failure");
  });

  it("still produces a report when the error is not an object at all", () => {
    const d = diagnoseError(null, "Could not read your role.");
    expect(d.report).toBe("Could not read your role.");
  });
});
