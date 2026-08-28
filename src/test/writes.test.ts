import { describe, it, expect } from "vitest";
import { assertWrote, WriteBlockedError } from "@/lib/writes";

/** Stand-in for a Supabase query builder, which is thenable. */
const result = <T>(data: T[] | null, error: { message: string; code?: string } | null = null) =>
  Promise.resolve({ data, error });

describe("assertWrote", () => {
  it("returns the changed rows when the write landed", async () => {
    const rows = await assertWrote(result([{ id: "a" }]), "save the school profile");
    expect(rows).toEqual([{ id: "a" }]);
  });

  it("rejects a write that row-level security filtered out", async () => {
    // The bug this exists for: PostgREST reports an UPDATE that matched no
    // rows as `{ data: [], error: null }`. Code checking only `error` called
    // that a success and showed a green toast while nothing had changed.
    await expect(assertWrote(result([]), "save the school profile"))
      .rejects.toBeInstanceOf(WriteBlockedError);
  });

  it("says what failed and why it plausibly failed", async () => {
    await expect(assertWrote(result([]), "save the school profile"))
      .rejects.toThrow(/Could not save the school profile.*permission/s);
  });

  it("treats a null data payload the same as no rows", async () => {
    await expect(assertWrote(result(null), "delete this class"))
      .rejects.toBeInstanceOf(WriteBlockedError);
  });

  it("passes a real database error straight through", async () => {
    // A foreign-key violation should keep its own message rather than being
    // relabelled as a permissions problem.
    await expect(
      assertWrote(result(null, { message: "violates foreign key constraint", code: "23503" }), "delete this class")
    ).rejects.toMatchObject({ code: "23503" });
  });
});
