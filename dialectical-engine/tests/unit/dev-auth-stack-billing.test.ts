import { describe, expect, it } from "vitest";
import {
  createDevelopmentAuthStackOperations,
  developmentAuthStackErrorCode,
  DevelopmentAuthStackError
} from "../../apps/runner/src/dev-auth-stack.js";

describe("P6b — the billing fakes in the development stack", () => {
  it("are offered only when DEBATEAI_BILLING_FAKES=1", () => {
    expect(createDevelopmentAuthStackOperations(process.cwd(), {}).startBillingFakes).toBeUndefined();
    expect(createDevelopmentAuthStackOperations(process.cwd(), { DEBATEAI_BILLING_FAKES: "0" }).startBillingFakes).toBeUndefined();
    expect(typeof createDevelopmentAuthStackOperations(process.cwd(), { DEBATEAI_BILLING_FAKES: "1" }).startBillingFakes).toBe("function");
  });
  it("name a failed start by their own stage and cause", () => {
    expect(developmentAuthStackErrorCode(new DevelopmentAuthStackError(
      "DEV_AUTH_STACK_BILLING_FAKES_FAILED", new TypeError("DEV_BILLING_FAKES_SECRET_INVALID")
    ))).toBe("DEV_AUTH_STACK_BILLING_FAKES_FAILED:DEV_BILLING_FAKES_SECRET_INVALID");
  });
});
