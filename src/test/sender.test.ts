import { describe, expect, it } from "vitest";
import { formatSender, mailboxOf, replyToAddress } from "../../supabase/functions/_shared/sender.ts";

const MAILBOX = "notifications@smartschool.example";

describe("mailboxOf", () => {
  it("takes the address out of a configured sender that already has a name", () => {
    expect(mailboxOf("Your School <noreply@example.com>")).toBe("noreply@example.com");
  });

  it("passes a bare address through", () => {
    expect(mailboxOf("noreply@example.com")).toBe("noreply@example.com");
  });

  it("returns nothing for nothing", () => {
    expect(mailboxOf("")).toBe("");
    expect(mailboxOf(null)).toBe("");
    expect(mailboxOf(undefined)).toBe("");
  });
});

describe("formatSender", () => {
  it("puts the school's name in front of the platform address", () => {
    expect(formatSender("Grace Academy", MAILBOX)).toBe(`Grace Academy <${MAILBOX}>`);
  });

  describe("names that would corrupt the header", () => {
    it("quotes a name containing a comma", () => {
      // Unquoted, this reads as two addresses and breaks the From line.
      expect(formatSender("Grace Academy, Ikeja", MAILBOX)).toBe(
        `"Grace Academy, Ikeja" <${MAILBOX}>`
      );
    });

    it("quotes a name containing a full stop", () => {
      expect(formatSender("St. Mary's Academy", MAILBOX)).toBe(
        `"St. Mary's Academy" <${MAILBOX}>`
      );
    });

    it("escapes an embedded quote", () => {
      expect(formatSender('The "Best" School', MAILBOX)).toBe(
        `"The \\"Best\\" School" <${MAILBOX}>`
      );
    });

    it("escapes a backslash before it can escape something else", () => {
      expect(formatSender("A\\B School", MAILBOX)).toBe(`"A\\\\B School" <${MAILBOX}>`);
    });

    it("quotes angle brackets rather than letting them close the address", () => {
      expect(formatSender("School <evil@attacker.test>", MAILBOX)).toBe(
        `"School <evil@attacker.test>" <${MAILBOX}>`
      );
    });
  });

  describe("header injection", () => {
    it("strips a newline rather than letting it start a new header", () => {
      const result = formatSender("Grace\r\nBcc: victim@example.com", MAILBOX);
      expect(result).not.toContain("\n");
      expect(result).not.toContain("\r");
      expect(result).toBe(`"Grace Bcc: victim@example.com" <${MAILBOX}>`);
    });

    it("strips control characters", () => {
      expect(formatSender("Grace\u0000Academy", MAILBOX)).toBe(`GraceAcademy <${MAILBOX}>`);
    });

    it("caps an absurdly long name", () => {
      const result = formatSender("A".repeat(500), MAILBOX);
      expect(result.length).toBeLessThan(260);
    });
  });

  describe("falling back", () => {
    it("sends from the bare address when there is no school name", () => {
      expect(formatSender("", MAILBOX)).toBe(MAILBOX);
      expect(formatSender(null, MAILBOX)).toBe(MAILBOX);
      expect(formatSender("   ", MAILBOX)).toBe(MAILBOX);
    });

    it("replaces a display name the operator already configured", () => {
      expect(formatSender("Grace Academy", "Platform <noreply@example.com>")).toBe(
        "Grace Academy <noreply@example.com>"
      );
    });

    it("returns nothing when there is no address to send from", () => {
      expect(formatSender("Grace Academy", "")).toBe("");
    });
  });
});

describe("replyToAddress", () => {
  it("accepts a school's address", () => {
    expect(replyToAddress("office@graceacademy.ng")).toBe("office@graceacademy.ng");
  });

  it("unwraps one written with a display name", () => {
    expect(replyToAddress("Grace Academy <office@graceacademy.ng>")).toBe(
      "office@graceacademy.ng"
    );
  });

  it("omits the header rather than using rubbish", () => {
    // schools.email is nullable free text, so all of these are reachable.
    expect(replyToAddress(null)).toBeNull();
    expect(replyToAddress("")).toBeNull();
    expect(replyToAddress("not an address")).toBeNull();
    expect(replyToAddress("missing-domain@")).toBeNull();
    expect(replyToAddress("@missing-local.ng")).toBeNull();
  });

  it("rejects an address carrying an injected header", () => {
    expect(replyToAddress("office@school.ng\r\nBcc: victim@example.com")).toBeNull();
  });
});
