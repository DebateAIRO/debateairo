import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  RECOVERY_POLICY_REGISTER_ROW,
  RECOVERY_POLICY_ROW_KEY,
  readRecoveryPolicy,
  recoveryPolicyFromRegisterRows
} from "../../packages/register/src/recovery-policy.js";

describe("P2-02 sealed recovery-policy register", () => {
  it("pins the ruled thresholds, retry ceilings, notification fan-out, and degradation envelope", () => {
    const policy = recoveryPolicyFromRegisterRows([RECOVERY_POLICY_REGISTER_ROW]);
    expect(policy).toMatchObject({
      policyVersion: 1,
      tierThresholds: {
        T1: { maximumElapsedMsExclusive: 300_000 },
        T2: { maximumElapsedMsExclusive: 1_800_000 },
        T3: {
          minimumFreezeMs: 604_800_000,
          maximumFreezeMs: 1_209_600_000,
          selection: "SERVER_PINNED_WITHIN_RANGE"
        }
      },
      retry: {
        maximumActiveAttemptsPerAccount: 1,
        proofFailuresPerAttempt: 5,
        perSourceAcrossAccounts: 20,
        windowMs: 300_000,
        temporaryLockMs: 300_000,
        permanentRemoteLockout: false,
        preserveOriginalDelayAnchor: true
      },
      riskSignals:{
        rawSignalRetentionMs:7_776_000_000,
        maximumEvaluatorSignals:128,
        cleanupBatchMax:1_000
      },
      notification: {
        recipients: ["EVERY_HISTORICALLY_BOUND_SUPPORTED_CHANNEL", "IN_PRODUCT_SECURITY_FEED"],
        events: ["STARTED", "DELAY_STARTED", "DELAY_MIDPOINT", "DELAY_24H_REMAINING", "CANCELLED", "REFUSED", "COMPLETED"],
        delaySchedule: ["DAY_ZERO", "MIDPOINT", "TWENTY_FOUR_HOURS_BEFORE_DUE"],
        startOrdering: "DURABLY_ENQUEUE_BEFORE_PROOF_OUTCOME_OR_TIER_DISCLOSURE"
      },
      degradation: {
        postCancelRecoveryLockMs: 86_400_000,
        lastFactorRemovalHold: { minimumMs: 86_400_000, maximumMs: 259_200_000 },
        T2HeightenedMonitoringMs: 604_800_000,
        T3HeightenedMonitoringMs: 2_592_000_000,
        T3RestrictionMs: 2_592_000_000,
        restrictedAllowed: ["READ", "CREATE_PRIVATE_DEBATE"],
        restrictedDenied: ["PUBLISH", "DELETE", "EXPORT", "CHANGE_CONTACT", "CHANGE_FACTOR", "PRIVILEGED_ROUTE"]
      },
      publicResponse: "ENUMERATION_RESISTANT_GENERIC"
    });
    expect(policy.sourceRef).toMatch(/P2-01|recovery/i);
  });

  it("fails closed for missing, malformed, duplicate, or provenance-free policy rows", async () => {
    const expectCode = (callback: () => unknown, code: string) => {
      try {
        callback();
        throw new Error("EXPECTED_RECOVERY_POLICY_REFUSAL");
      } catch (error) {
        expect(error).toMatchObject({ code });
      }
    };
    expectCode(() => recoveryPolicyFromRegisterRows([]), "RECOVERY_POLICY_UNRESOLVED");
    expectCode(() => recoveryPolicyFromRegisterRows([
      { ...RECOVERY_POLICY_REGISTER_ROW, value: { kind: "RECOVERY_POLICY" } }
    ]), "RECOVERY_POLICY_INVALID");
    expectCode(() => recoveryPolicyFromRegisterRows([
      RECOVERY_POLICY_REGISTER_ROW, RECOVERY_POLICY_REGISTER_ROW
    ]), "RECOVERY_POLICY_DUPLICATE");
    expectCode(() => recoveryPolicyFromRegisterRows([
      { ...RECOVERY_POLICY_REGISTER_ROW, sourceRef: "" }
    ]), "RECOVERY_POLICY_PROVENANCE_MISSING");

    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(readRecoveryPolicy({ query } as never, 1))
      .rejects.toMatchObject({ code: "RECOVERY_POLICY_UNRESOLVED" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("register.register_row"), [
      1, RECOVERY_POLICY_ROW_KEY
    ]);
    await expect(readRecoveryPolicy({ query } as never, 0)).rejects.toThrow(
      "A positive register version is required for recovery policy"
    );

    query.mockResolvedValueOnce({ rows: [{
      row_key: RECOVERY_POLICY_ROW_KEY,
      value_json: RECOVERY_POLICY_REGISTER_ROW.value,
      source_ref: RECOVERY_POLICY_REGISTER_ROW.sourceRef,
      sealed: false,
      declared_row_count: 1,
      actual_row_count: "1"
    }] });
    await expect(readRecoveryPolicy({ query } as never, 1))
      .rejects.toMatchObject({ code: "RECOVERY_POLICY_REGISTER_UNSEALED" });

    query.mockResolvedValueOnce({ rows: [{
      row_key: RECOVERY_POLICY_ROW_KEY,
      value_json: RECOVERY_POLICY_REGISTER_ROW.value,
      source_ref: RECOVERY_POLICY_REGISTER_ROW.sourceRef,
      sealed: true,
      declared_row_count: 1,
      actual_row_count: "2"
    }] });
    await expect(readRecoveryPolicy({ query } as never, 1))
      .rejects.toMatchObject({ code: "RECOVERY_POLICY_REGISTER_COUNT_MISMATCH" });
  });

  it("persists the sealed row and makes API boot await it before serving", async () => {
    const registerSource = await readFile("packages/register/src/index.ts", "utf8");
    const apiMain = await readFile("apps/api/src/main.ts", "utf8");
    const devSeed = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    expect(registerSource).toContain("RECOVERY_POLICY_REGISTER_ROW");
    expect(registerSource).toContain("AUTH_POLICY_REGISTER_ROWS.length + 5");
    expect(devSeed).toContain("RECOVERY_POLICY_REGISTER_ROW");
    const readIndex = apiMain.indexOf("await readRecoveryPolicy(pool, environment.REGISTER_VERSION)");
    const workerIndex = apiMain.indexOf("new Argon2WorkerPool(") /* pin updated 2026-09-02: pool takes options (L2-F9) */;
    expect(readIndex).toBeGreaterThan(-1);
    expect(workerIndex).toBeGreaterThan(readIndex);
  });
});
