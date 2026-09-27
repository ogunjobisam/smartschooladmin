import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_SENDER_ID, MAX_SMS_PARTS, chooseSmsProvider, deliverSms, normalisePhone, planSms, sandboxProvider,
  smsSafeText, smsSegments, validSenderId, type SmsLedger, type SmsProvider, type SmsSendOutcome,
} from "../../supabase/functions/_shared/sms.ts";

describe("normalisePhone", () => {
  it("reads every way a Nigerian parent writes the same mobile number", () => {
    for (const raw of [
      "08031234567", "8031234567", "+2348031234567", "2348031234567", "+234 803 123 4567",
      "234-803-123-4567", "(0803) 123 4567", "+234 0803 123 4567", "002348031234567",
    ]) {
      expect(normalisePhone(raw), raw).toBe("2348031234567");
    }
  });

  it("accepts the 07, 08 and 09 mobile ranges", () => {
    expect(normalisePhone("07061234567")).toBe("2347061234567");
    expect(normalisePhone("09151234567")).toBe("2349151234567");
  });

  it("refuses what cannot be a Nigerian mobile", () => {
    for (const raw of ["", "   ", "0803123456", "080312345678", "01234567890", "abc", "0803-CALL-NOW", null, undefined]) {
      expect(normalisePhone(raw as string), String(raw)).toBeNull();
    }
  });

  it("keeps an international number written with a plus, for a parent abroad", () => {
    expect(normalisePhone("+44 7700 900123")).toBe("447700900123");
    expect(normalisePhone("+1 (415) 555-0100")).toBe("14155550100");
  });
});

describe("smsSafeText", () => {
  it("turns the naira sign and typographic punctuation into plain characters", () => {
    expect(smsSafeText("Balance: ₦45,000 — due “Friday”… it’s")).toBe(`Balance: N45,000 - due "Friday"... it's`);
  });
});

describe("smsSegments", () => {
  it("fits 160 plain characters in one text and bills 153 a part after that", () => {
    expect(smsSegments("a".repeat(160))).toEqual({ encoding: "GSM-7", length: 160, parts: 1 });
    expect(smsSegments("a".repeat(161)).parts).toBe(2);
    expect(smsSegments("a".repeat(306)).parts).toBe(2);
    expect(smsSegments("a".repeat(307)).parts).toBe(3);
  });

  it("counts the GSM extension characters twice", () => {
    expect(smsSegments("€".repeat(80))).toEqual({ encoding: "GSM-7", length: 160, parts: 1 });
    expect(smsSegments("€".repeat(81)).parts).toBe(2);
  });

  it("drops to 70 a text once a character is outside GSM", () => {
    expect(smsSegments("₦" + "a".repeat(69))).toEqual({ encoding: "UCS-2", length: 70, parts: 1 });
    expect(smsSegments("₦" + "a".repeat(70)).parts).toBe(2);
  });

  it("is why the naira sign is replaced: a fee reminder goes from three texts to one", () => {
    const reminder = "Dear parent, Ada's first term fees of ₦45,000 are due on Friday. Please pay at the bursary or by transfer. Thank you, Kings & Queens Academy.";
    expect(smsSegments(reminder).parts).toBe(3);
    expect(smsSegments(smsSafeText(reminder)).parts).toBe(1);
  });
});

describe("planSms", () => {
  it("normalises the number and the text, and prices it", () => {
    expect(planSms("0803 123 4567", "Fees: ₦5,000 due")).toEqual({
      ok: true, to: "2348031234567", body: "Fees: N5,000 due", parts: 1, encoding: "GSM-7",
    });
  });

  it("fails a bad number permanently, so no retry spends credits on it", () => {
    expect(planSms("parent@example.com", "Hello")).toMatchObject({ ok: false, permanent: true });
  });

  it("refuses an empty or runaway message", () => {
    expect(planSms("08031234567", "   ")).toMatchObject({ ok: false });
    expect(planSms("08031234567", "a".repeat(153 * MAX_SMS_PARTS + 1))).toMatchObject({ ok: false });
    expect(planSms("08031234567", "a".repeat(153 * MAX_SMS_PARTS))).toMatchObject({ ok: true, parts: MAX_SMS_PARTS });
  });
});

describe("chooseSmsProvider", () => {
  it("leaves SMS queued when nothing is configured", () => {
    expect(chooseSmsProvider({})).toMatchObject({ provider: null });
  });

  it("picks the sandbox by name", () => {
    expect(chooseSmsProvider({ SMS_PROVIDER: " Sandbox " }).provider).toBe(sandboxProvider);
  });

  it("says plainly that a provider is not connected yet, rather than pretending", () => {
    const choice = chooseSmsProvider({ SMS_PROVIDER: "africastalking" });
    expect(choice.provider).toBeNull();
    expect("reason" in choice && choice.reason).toMatch(/not connected yet/);
  });

  it("will not pick Termii without its API key, and says which secret is missing", () => {
    const choice = chooseSmsProvider({ SMS_PROVIDER: "termii", TERMII_API_KEY: "  " });
    expect(choice.provider).toBeNull();
    expect("reason" in choice && choice.reason).toMatch(/TERMII_API_KEY/);
  });

  it("picks Termii once its key is set", () => {
    const choice = chooseSmsProvider({ SMS_PROVIDER: "Termii", TERMII_API_KEY: "key" });
    expect(choice.provider?.name).toBe("termii");
    expect(choice.provider?.delivers).toBe(true);
  });
});

describe("sandboxProvider", () => {
  it("never reports a text as sent and never claims to deliver", async () => {
    expect(sandboxProvider.delivers).toBe(false);
    const outcome = await sandboxProvider.send({ to: "2348031234567", body: "Hi", senderId: "X", reference: "row-1" });
    expect(outcome).toEqual({ status: "simulated", providerMessageId: "sandbox-row-1" });
  });
});

describe("validSenderId", () => {
  it("keeps a registrable sender ID and falls back otherwise", () => {
    expect(validSenderId("KQAcademy")).toBe("KQAcademy");
    expect(validSenderId("Kings & Queens Academy")).toBe(DEFAULT_SENDER_ID);
    expect(validSenderId("12345")).toBe(DEFAULT_SENDER_ID);
    expect(validSenderId(null)).toBe(DEFAULT_SENDER_ID);
  });
});

describe("deliverSms", () => {
  const row = { id: "row-1", org_id: "org-1", recipient: "0803 123 4567", body: "Fees of ₦5,000 are due" };

  function ledger(charge: { data: unknown; error: { message: string } | null } = { data: true, error: null }) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const logged: Record<string, unknown>[] = [];
    const l: SmsLedger = {
      rpc: async (fn, args) => {
        calls.push({ fn, args });
        return fn === "charge_sms" ? charge : { data: 0, error: null };
      },
      from: () => ({ update: (values) => ({ eq: async () => { logged.push(values); } }) }),
    };
    return { l, calls, logged };
  }

  const provider = (outcome: SmsSendOutcome | Error): SmsProvider & { send: ReturnType<typeof vi.fn> } => ({
    name: "test",
    delivers: true,
    send: vi.fn(async () => {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }),
  });

  it("leaves the message queued with the reason when there is no provider", async () => {
    const { l, calls } = ledger();
    expect(await deliverSms(row, l, null, "No provider", "X")).toEqual({ status: "unconfigured", error: "No provider" });
    expect(calls).toEqual([]);
  });

  it("fails a bad number without touching credits or the provider", async () => {
    const { l, calls } = ledger();
    const p = provider({ status: "sent", providerMessageId: "m1" });
    const result = await deliverSms({ ...row, recipient: "not a phone" }, l, p, "", "X");
    expect(result.status).toBe("failed");
    expect(calls).toEqual([]);
    expect(p.send).not.toHaveBeenCalled();
  });

  it("runs the sandbox without charging a credit, and marks it simulated", async () => {
    const { l, calls } = ledger();
    const result = await deliverSms(row, l, sandboxProvider, "", "X");
    expect(result).toEqual({ status: "simulated", sms: { provider: "sandbox", providerMessageId: "sandbox-row-1", parts: 1 } });
    expect(calls).toEqual([]);
  });

  it("reserves the credits, sends the cleaned text, and records the provider's id", async () => {
    const { l, calls, logged } = ledger();
    const p = provider({ status: "sent", providerMessageId: "m1" });
    const result = await deliverSms(row, l, p, "", "KQAcademy");
    expect(calls).toEqual([{ fn: "charge_sms", args: {
      _org_id: "org-1", _queue_id: "row-1", _recipient: "2348031234567", _parts: 1, _provider: "test",
    } }]);
    expect(p.send).toHaveBeenCalledWith({ to: "2348031234567", body: "Fees of N5,000 are due", senderId: "KQAcademy", reference: "row-1" });
    expect(logged).toEqual([{ provider_message_id: "m1" }]);
    expect(result).toEqual({ status: "sent", sms: { provider: "test", providerMessageId: "m1", parts: 1 } });
  });

  it("does not send at all when the credits are not there", async () => {
    const { l } = ledger({ data: false, error: null });
    const p = provider({ status: "sent", providerMessageId: "m1" });
    const result = await deliverSms(row, l, p, "", "X");
    expect(result).toMatchObject({ status: "unconfigured", error: expect.stringMatching(/Not enough SMS credits/) });
    expect(p.send).not.toHaveBeenCalled();
  });

  it("does not send when the credits cannot even be checked", async () => {
    const { l } = ledger({ data: null, error: { message: "timeout" } });
    const p = provider({ status: "sent", providerMessageId: "m1" });
    expect((await deliverSms(row, l, p, "", "X")).status).toBe("retry");
    expect(p.send).not.toHaveBeenCalled();
  });

  it("refunds the credits when the provider refuses the message", async () => {
    const { l, calls } = ledger();
    const result = await deliverSms(row, l, provider({ status: "failed", error: "blacklisted" }), "", "X");
    expect(result).toEqual({ status: "failed", error: "test: blacklisted" });
    expect(calls.map((c) => c.fn)).toEqual(["charge_sms", "refund_sms"]);
  });

  it("refunds the credits when the provider call throws, and retries later", async () => {
    const { l, calls } = ledger();
    const result = await deliverSms(row, l, provider(new Error("socket hang up")), "", "X");
    expect(result).toEqual({ status: "retry", error: "test: socket hang up" });
    expect(calls.map((c) => c.fn)).toEqual(["charge_sms", "refund_sms"]);
  });
});

describe("deliverSms with a provider account problem", () => {
  it("refunds and leaves the message queued rather than failing it", async () => {
    const calls: string[] = [];
    const ledger: SmsLedger = {
      rpc: async (fn) => { calls.push(fn); return { data: true, error: null }; },
      from: () => ({ update: () => ({ eq: async () => undefined }) }),
    };
    const provider: SmsProvider = {
      name: "termii",
      delivers: true,
      send: async () => ({ status: "unconfigured", error: "sender ID not approved" }),
    };
    const result = await deliverSms({ id: "r", org_id: "o", recipient: "08031234567", body: "Hi" }, ledger, provider, "", "X");
    expect(result.status).toBe("unconfigured");
    expect(calls).toEqual(["charge_sms", "refund_sms"]);
  });
});
