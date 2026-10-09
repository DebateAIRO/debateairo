import { describe, expect, it } from "vitest";
import { rebillOutcomeOpen } from "../../apps/api/src/billing/renewal.js";

const event = (kind: string, errorCode: string | null = null) => ({ kind, errorCode }) as Parameters<typeof rebillOutcomeOpen>[0][number];

describe("P12e a renewal whose charge may have reached NETOPIA (A2)", () => {
  it("is open while a call may have gone through and nothing is recorded", () => {
    expect(rebillOutcomeOpen([event("REQUESTED")])).toBe(true);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("SUBMIT_UNKNOWN", "CHARGE_OUTCOME_UNKNOWN")])).toBe(true);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("SUBMIT_UNKNOWN", "CHARGE_ORDER_EXISTS")])).toBe(true);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("SUBMIT_UNKNOWN", "SUBMIT_INTERRUPTED")])).toBe(true);
    // An unknown, then a call proven never sent: the first call may still have gone through.
    expect(rebillOutcomeOpen([
      event("REQUESTED"), event("SUBMIT_UNKNOWN", "CHARGE_OUTCOME_UNKNOWN"), event("REQUESTED"),
      event("REQUESTED", "CHARGE_NOT_SENT")
    ])).toBe(true);
    // A call marker after a proven not-sent one: that later call may have gone through.
    expect(rebillOutcomeOpen([event("REQUESTED"), event("REQUESTED", "CHARGE_NOT_SENT"), event("REQUESTED")])).toBe(true);
  });

  it("is closed once settled, and for calls proven never sent", () => {
    expect(rebillOutcomeOpen([])).toBe(false);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("SUBMITTED")])).toBe(false);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("SUBMIT_UNKNOWN", "CHARGE_OUTCOME_UNKNOWN"), event("SUBMITTED")])).toBe(false);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("FAILED", "PAYMENT_DECLINED")])).toBe(false);
    expect(rebillOutcomeOpen([event("REQUESTED"), event("SUBMITTED"), event("SUCCEEDED")])).toBe(false);
    for (const code of ["CHARGE_NOT_SENT", "CHARGE_CREDENTIALS_REFUSED", "CHARGE_CONFIGURATION_REFUSED"]) {
      expect(rebillOutcomeOpen([event("REQUESTED"), event("REQUESTED", code)]), code).toBe(false);
    }
  });
});
