import { describe, expect, it } from "vitest";
import { rebillOutcomeOpen } from "../../apps/api/src/billing/renewal.js";

const event = (kind: string, errorCode: string | null = null) => ({ kind, errorCode }) as Parameters<typeof rebillOutcomeOpen>[0][number];

describe("P12e a renewal whose rebill may have reached xMoney (A2)", () => {
  it("is open while a call may have gone through and nothing is recorded", () => {
    expect(rebillOutcomeOpen([event("REQUESTED")])).toBe(true);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN")])).toBe(true);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("SUBMIT_UNKNOWN", "SUBMIT_INTERRUPTED")])).toBe(true);
    // An unknown, then a call proven never sent: the first call may still have gone through.
    expect(rebillOutcomeOpen([
      event("REQUESTED"), event("SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN"), event("REQUESTED", "RESUBMIT_STARTED"),
      event("REQUESTED", "REBILL_NOT_SENT")
    ])).toBe(true);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("REQUESTED", "REBILL_NOT_SENT"), event("REQUESTED", "RESUBMIT_STARTED")])).toBe(true);
  });

  it("is closed once settled or linked, and for calls proven never sent", () => {
    expect(rebillOutcomeOpen([])).toBe(false);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("SUBMITTED")])).toBe(false);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN"), event("SUBMITTED")])).toBe(false);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("FAILED", "PAYMENT_DECLINED")])).toBe(false);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("SUBMITTED"), event("SUCCEEDED")])).toBe(false);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("REQUESTED", "REBILL_NOT_SENT")])).toBe(false);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("REQUESTED", "REBILL_CREDENTIALS_REFUSED")])).toBe(false);
  });
});
