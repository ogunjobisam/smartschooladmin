import { describe, expect, it } from "vitest";
import { buildStatement, statementRangeLabel, type StatementData } from "@/lib/statements";
import { nextSendTime } from "@/lib/notification-dispatcher";

const base: StatementData = {
  school: { name: "Test School" },
  currency: "NGN",
  studentName: "Ada Obi",
  statusFilter: "all",
  openingBalance: 50_000,
  lines: [
    { date: "2026-02-10", kind: "payment", reference: "PAY-1", description: "Payment", credit: 30_000 },
    { date: "2026-01-05", kind: "invoice", reference: "INV-1", description: "Term 2 fees", debit: 100_000 },
  ],
};

describe("statement of account", () => {
  it("orders the ledger by date and carries a running balance", () => {
    const { rows } = buildStatement(base);
    expect(rows.map((r) => r.reference)).toEqual(["INV-1", "PAY-1"]);
    expect(rows[0].balance).toBe(150_000);
    expect(rows[1].balance).toBe(120_000);
  });

  it("closes at opening + charged - paid", () => {
    const { totalCharged, totalPaid, closingBalance } = buildStatement(base);
    expect(totalCharged).toBe(100_000);
    expect(totalPaid).toBe(30_000);
    expect(closingBalance).toBe(120_000);
  });

  it("describes the chosen window", () => {
    expect(statementRangeLabel(null, null)).toBe("All time");
    expect(statementRangeLabel("2026-01-01", null)).toMatch(/^From /);
  });
});

describe("reminder send windows", () => {
  const setting = {
    in_app_frequency: "immediate",
    email_frequency: "immediate",
    sms_frequency: "immediate",
    quiet_hours_enabled: false,
    quiet_start: "21:00",
    quiet_end: "07:00",
  };

  it("sends immediately when nothing restricts it", () => {
    expect(nextSendTime(setting, "email", new Date("2026-03-02T10:00:00"))).toBeNull();
  });

  it("refuses a channel switched off", () => {
    expect(nextSendTime({ ...setting, sms_frequency: "off" }, "sms")).toBe(false);
  });

  it("defers a send that lands inside quiet hours", () => {
    const at = nextSendTime(
      { ...setting, quiet_hours_enabled: true },
      "email",
      new Date("2026-03-02T22:30:00"),
    );
    expect(typeof at).toBe("string");
    expect(new Date(at as string).getHours()).toBe(7);
  });
});
