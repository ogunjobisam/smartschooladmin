import { describe, it, expect } from "vitest";
import { rowTint } from "@/lib/ledger";

describe("rowTint", () => {
  it("tints the two states worth spotting across the room", () => {
    expect(rowTint("paid")).toBe("row-paid");
    expect(rowTint("overdue")).toBe("row-owing");
  });

  it("leaves everything else alone", () => {
    // The restraint is the point: a tint on every row is a tint on none, and
    // "pending" is the common case. If this list ever grows, that is a design
    // decision, not a tidy-up.
    for (const status of ["pending", "draft", "void", "partial", "", null, undefined]) {
      expect(rowTint(status)).toBe("");
    }
  });
});
