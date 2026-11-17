import { describe, expect, it } from "vitest";
import { withdrawalRefundDeadline } from "@debateai/billing-core";

// The per-payment coverage this file once tested (W6, P2-I8) is gone: since the owner's decision of 16 November 2026
// a withdrawal refund counts no days, so no payment has a stretch of the period of its own. What a payment still holds
// is covered through the withdrawal itself (tests/integration/billing-withdrawal.test.ts, billing-withdraw-command.test.ts).
describe("W9 the refund deadline the owner is told (P2-I11, P2-M8)", () => {
  it("is 14 days after the person withdrew (Directive 2011/83/EU art. 13(1)), whatever the withdrawal window's length", () => {
    expect(withdrawalRefundDeadline(new Date("2026-10-12T08:30:00.000Z")).toISOString()).toBe("2026-10-26T08:30:00.000Z");
    // Across a daylight-saving change the instant still moves by 14 times 24 hours (the email shows its UTC date).
    expect(withdrawalRefundDeadline(new Date("2026-10-20T23:59:59.000Z")).toISOString()).toBe("2026-11-03T23:59:59.000Z");
  });
});
