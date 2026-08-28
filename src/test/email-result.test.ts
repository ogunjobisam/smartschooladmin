import { describe, expect, it } from "vitest";
import { classifyEmailFailure } from "../../supabase/functions/_shared/email-result.ts";

/**
 * These pin the rule that stops a misconfigured sender destroying the backlog.
 * Before it, "any 4xx except 429 is permanent" marked every queued message
 * `failed` on the first drain, and nothing in the app can move a row back.
 */
describe("classifyEmailFailure", () => {
  describe("sender problems must not burn the queue", () => {
    it("treats an unverified domain as unconfigured, not failed", () => {
      expect(
        classifyEmailFailure(403, 'The example.com domain is not verified. Please verify your domain')
      ).toBe("unconfigured");
    });

    it("treats the test sender's own-address restriction as unconfigured", () => {
      expect(
        classifyEmailFailure(
          403,
          "You can only send testing emails to your own email address (owner@example.com)"
        )
      ).toBe("unconfigured");
    });

    it("treats any 403 as a sender problem, whatever the body says", () => {
      expect(classifyEmailFailure(403, "")).toBe("unconfigured");
      expect(classifyEmailFailure(403, "something unfamiliar")).toBe("unconfigured");
    });

    it("recognises a sender problem arriving as a status other than 403", () => {
      // Providers move these around between releases; the phrase is the backstop.
      expect(classifyEmailFailure(422, "Invalid `from` field")).toBe("unconfigured");
      expect(classifyEmailFailure(400, "The domain is not verified")).toBe("unconfigured");
    });

    it("matches the phrases case-insensitively", () => {
      expect(classifyEmailFailure(422, "INVALID FROM FIELD")).toBe("unconfigured");
    });
  });

  describe("problems with the message itself", () => {
    it("gives up on a rejected recipient", () => {
      expect(classifyEmailFailure(422, "Invalid `to` field: not an email address")).toBe("failed");
    });

    it("gives up on a bad request that names nothing about the sender", () => {
      expect(classifyEmailFailure(400, "missing subject")).toBe("failed");
    });

    it("gives up on an unauthorised API key", () => {
      // 401 is a real permanent problem: the key is wrong, and retrying it
      // forever would hide that behind a growing attempt count.
      expect(classifyEmailFailure(401, "API key is invalid")).toBe("failed");
    });
  });

  describe("transient problems", () => {
    it("retries a rate limit", () => {
      expect(classifyEmailFailure(429, "Too many requests")).toBe("retry");
    });

    it("retries a provider outage", () => {
      expect(classifyEmailFailure(500, "Internal Server Error")).toBe("retry");
      expect(classifyEmailFailure(503, "Service Unavailable")).toBe("retry");
    });

    it("retries rather than guessing when handed a non-failure status", () => {
      expect(classifyEmailFailure(200, "")).toBe("retry");
    });
  });

  it("works with no body at all", () => {
    expect(classifyEmailFailure(429)).toBe("retry");
    expect(classifyEmailFailure(422)).toBe("failed");
  });
});
