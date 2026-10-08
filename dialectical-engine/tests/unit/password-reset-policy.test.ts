import { describe, expect, it } from "vitest";
import { PASSWORD_RESET_POLICY_REGISTER_ROW, passwordResetPolicyFromValue } from "../../packages/register/src/password-reset-policy.js";
describe("explicit ordinary password-only reset policy", () => {
  it("refuses absent or weakened proof and preservation facets", () => {
    for (const value of [undefined, {}, { ...PASSWORD_RESET_POLICY_REGISTER_ROW.value, proof: "EMAIL_ONLY" }, { ...PASSWORD_RESET_POLICY_REGISTER_ROW.value, preserve_factor: false }, { ...PASSWORD_RESET_POLICY_REGISTER_ROW.value, preserve_unused_recovery_codes: false }]) {
      expect(() => passwordResetPolicyFromValue(value, "fixture")).toThrow("PASSWORD_RESET_POLICY_INVALID");
    }
  });
  it("resolves only the bounded current-authenticator reset policy", () => {
    expect(passwordResetPolicyFromValue(PASSWORD_RESET_POLICY_REGISTER_ROW.value, "fixture")).toMatchObject({ maximumElapsedMs: 1800000, proofFailuresPerAttempt: 5, perSourceAcrossAccounts: 20, sourceWindowMs: 300000, cleanupBatchMax: 1000 });
  });
});
