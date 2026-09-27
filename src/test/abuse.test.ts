import { describe, it, expect, vi } from "vitest";
import {
  clientIp,
  containsLink,
  safeReturnUrl,
  timingSafeEqual,
  withinRateLimit,
} from "../../supabase/functions/_shared/abuse.ts";

const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name.toLowerCase()] ?? null });

describe("clientIp", () => {
  it("takes the first X-Forwarded-For entry, which is the client", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("prefers a header set by the edge itself", () => {
    expect(clientIp(headers({ "cf-connecting-ip": "198.51.100.2", "x-forwarded-for": "1.1.1.1" }))).toBe("198.51.100.2");
  });

  it("still returns a key when nothing identifies the caller", () => {
    expect(clientIp(headers({}))).toBe("unknown");
  });
});

describe("containsLink", () => {
  it("catches the ways a name could carry a link", () => {
    for (const text of [
      "Click https://pay-fees.example to confirm",
      "Visit www.pay-fees-now",
      "Mrs Ade pay-fees-now.xyz",
      "hxxp://x",
    ]) {
      expect(containsLink(text), text).toBe(true);
    }
  });

  it("leaves real names alone", () => {
    for (const name of ["Folake Obi", "St. Mary's Guardian", "Adaeze O'Neil-Okafor", "Dr. J. R. R. Ade"]) {
      expect(containsLink(name), name).toBe(false);
    }
  });
});

describe("timingSafeEqual", () => {
  it("agrees with === on equal and unequal strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("is false when one string is a prefix of the other", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
    expect(timingSafeEqual("", "a")).toBe(false);
  });
});

describe("safeReturnUrl", () => {
  it("accepts the app's own addresses", () => {
    for (const url of [
      "https://smartschooladmin.app/invoices?provider=paystack",
      "https://grace.smartschooladmin.app/billing",
      "https://smartschooladmin.lovable.app/billing",
      "https://id-preview--af2f82cb-fd9f-4ac2-8e61-8aa67cb14264.lovable.app/invoices",
      "http://localhost:8080/invoices",
    ]) {
      expect(safeReturnUrl(url), url).toBe(url);
    }
  });

  it("refuses anywhere else, including look-alikes", () => {
    for (const url of [
      "https://evil.example/phish",
      "https://smartschooladmin.app.evil.example/",
      "https://evilsmartschooladmin.app/",
      "https://someone-else.lovable.app/",
      "http://smartschooladmin.app/",
      "https://smartschooladmin.app@evil.example/",
      "https://user:pass@smartschooladmin.app/",
      "javascript:alert(1)",
      "//evil.example",
      "",
      null,
      42,
    ]) {
      expect(safeReturnUrl(url), String(url)).toBeNull();
    }
  });

  it("accepts an origin configured for a school's own domain", () => {
    expect(safeReturnUrl("https://portal.grace.edu.ng/pay", ["https://portal.grace.edu.ng"]))
      .toBe("https://portal.grace.edu.ng/pay");
    expect(safeReturnUrl("https://portal.grace.edu.ng.evil.example/", ["https://portal.grace.edu.ng"])).toBeNull();
  });
});

describe("withinRateLimit", () => {
  const client = (result: { data: unknown; error: { message: string } | null }) => ({
    rpc: vi.fn().mockResolvedValue(result),
  });

  it("passes the key, limit and window to the database", async () => {
    const c = client({ data: true, error: null });
    expect(await withinRateLimit(c, "demo:ip:1.2.3.4", 3, 3600)).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      _key: "demo:ip:1.2.3.4",
      _limit: 3,
      _window_seconds: 3600,
    });
  });

  it("refuses once the database says the limit is spent", async () => {
    expect(await withinRateLimit(client({ data: false, error: null }), "k", 1, 60)).toBe(false);
  });

  it("allows, and says so, when the limiter itself fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await withinRateLimit(client({ data: null, error: { message: "boom" } }), "k", 1, 60)).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
