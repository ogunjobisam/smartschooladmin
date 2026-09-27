import { describe, it, expect, vi } from "vitest";
import {
  TERMII_DEFAULT_BASE_URL, classifyTermiiRefusal, termiiBaseUrl, termiiChannel, termiiProvider,
} from "../../supabase/functions/_shared/termii.ts";

const message = { to: "2348031234567", body: "Fees of N5,000 are due", senderId: "KQAcademy", reference: "row-1" };

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
}

describe("termiiProvider request", () => {
  it("posts Termii's documented body to /api/sms/send", async () => {
    const fetchImpl = respond(200, { message_id: "3017544054459", message: "Successfully Sent", balance: 9.5 });
    const provider = termiiProvider({ apiKey: "TL-key", channel: "dnd" }, fetchImpl);
    await provider.send(message);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${TERMII_DEFAULT_BASE_URL}/api/sms/send`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      api_key: "TL-key", to: "2348031234567", from: "KQAcademy", sms: "Fees of N5,000 are due", type: "plain", channel: "dnd",
    });
  });

  it("uses an account's own base URL", async () => {
    const fetchImpl = respond(200, { message_id: "1" });
    await termiiProvider({ apiKey: "k", baseUrl: "https://v3.api.termii.com/" }, fetchImpl).send(message);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe("https://v3.api.termii.com/api/sms/send");
  });
});

describe("termiiProvider outcomes", () => {
  it("is sent when Termii returns a message id", async () => {
    const outcome = await termiiProvider({ apiKey: "k" }, respond(200, { message_id: 3017544054459, message: "Successfully Sent" })).send(message);
    expect(outcome).toEqual({ status: "sent", providerMessageId: "3017544054459" });
  });

  it("does not count a 200 with no message id as sent", async () => {
    const outcome = await termiiProvider({ apiKey: "k" }, respond(200, { message: "ApplicationSenderId not found" })).send(message);
    expect(outcome.status).toBe("unconfigured");
  });

  it("holds messages on an account problem instead of failing them", async () => {
    for (const [status, text] of [
      [401, "Unauthorized"],
      [400, "Invalid API key"],
      [404, "ApplicationSenderId not found"],
      [400, "Insufficient balance"],
      [400, "Sender ID has not been approved"],
      [400, "DND route not activated on this account"],
    ] as const) {
      const outcome = await termiiProvider({ apiKey: "k" }, respond(status, { message: text })).send(message);
      expect(outcome.status, text).toBe("unconfigured");
    }
  });

  it("fails a message Termii will not deliver to that number", async () => {
    const outcome = await termiiProvider({ apiKey: "k" }, respond(400, { message: "Invalid phone number" })).send(message);
    expect(outcome.status).toBe("failed");
  });

  it("retries on rate limits, server errors, timeouts and unreadable replies", async () => {
    expect((await termiiProvider({ apiKey: "k" }, respond(429, { message: "Too many requests" })).send(message)).status).toBe("retry");
    expect((await termiiProvider({ apiKey: "k" }, respond(502, "<html>Bad gateway</html>")).send(message)).status).toBe("retry");
    const timeout = vi.fn(async () => { throw new DOMException("The operation timed out.", "TimeoutError"); });
    expect(await termiiProvider({ apiKey: "k" }, timeout).send(message)).toMatchObject({ status: "retry", error: /unreachable/ });
  });

  it("gives up on a Termii that never answers, so one slow send cannot stall the queue", async () => {
    const hangs = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    }));
    const outcome = await termiiProvider({ apiKey: "k", timeoutMs: 20 }, hangs).send(message);
    expect(outcome).toMatchObject({ status: "retry", error: /unreachable/ });
  });

  it("never puts the API key in an error that is stored on the queue row", async () => {
    const outcome = await termiiProvider({ apiKey: "TL-secret-key" }, respond(401, { message: "Unauthorized" })).send(message);
    expect("error" in outcome && outcome.error).not.toContain("TL-secret-key");
  });
});

describe("configuration helpers", () => {
  it("defaults to the generic route unless dnd is asked for", () => {
    expect(termiiChannel("DND")).toBe("dnd");
    expect(termiiChannel("")).toBe("generic");
    expect(termiiChannel("whatsapp")).toBe("generic");
  });

  it("only accepts an https base URL", () => {
    expect(termiiBaseUrl("http://evil.example")).toBe(TERMII_DEFAULT_BASE_URL);
    expect(termiiBaseUrl("https://v3.api.termii.com")).toBe("https://v3.api.termii.com");
    expect(termiiBaseUrl(undefined)).toBe(TERMII_DEFAULT_BASE_URL);
  });

  it("classifies an unrecognised 4xx as retryable rather than throwing the message away", () => {
    expect(classifyTermiiRefusal(422, "Something odd").status).toBe("retry");
  });
});
