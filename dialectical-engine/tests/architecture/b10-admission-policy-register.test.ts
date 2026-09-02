import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  ADMISSION_POLICY_REGISTER_ROW,
  ADMISSION_POLICY_ROW_KEY,
  admissionPolicyFromValue,
  readAdmissionPolicy
} from "../../packages/register/src/session-policy.js";

describe("B10 sealed admission-policy register row", () => {
  it("pins the proposed admission values pending V-1 ratification", () => {
    expect(ADMISSION_POLICY_ROW_KEY).toBe("admissionPolicy");
    expect(ADMISSION_POLICY_REGISTER_ROW.rowKey).toBe(ADMISSION_POLICY_ROW_KEY);
    expect(ADMISSION_POLICY_REGISTER_ROW.value).toEqual({
      kind: "ADMISSION_POLICY",
      asks: { key: "owner", limit: 20, window_ms: 3_600_000, capacity: 8_192 },
      public_reads: { key: "source", limit: 120, window_ms: 900_000, capacity: 65_536 },
      // B25a appended this scope to the same unratified row (V-12).
      recovery_start: { key: "source", limit: 15, window_ms: 3_600_000, capacity: 65_536 }
    });
    expect(ADMISSION_POLICY_REGISTER_ROW.sourceRef).toContain("PLAN B10 proposed values, V ratification pending (V-1)");
    expect(ADMISSION_POLICY_REGISTER_ROW.sourceRef).toContain("PLAN B25a recovery_start, V ratification pending (V-12)");
    const policy = admissionPolicyFromValue(
      ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef
    );
    expect(policy).toEqual({
      asks: { key: "owner", limit: 20, windowMs: 3_600_000, capacity: 8_192 },
      publicReads: { key: "source", limit: 120, windowMs: 900_000, capacity: 65_536 },
      recoveryStart: { key: "source", limit: 15, windowMs: 3_600_000, capacity: 65_536 },
      sourceRef: ADMISSION_POLICY_REGISTER_ROW.sourceRef
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(ADMISSION_POLICY_REGISTER_ROW.value.asks)).toBe(true);
  });

  it("fails closed for missing, malformed, or provenance-free policy rows", async () => {
    const expectCode = (callback: () => unknown, code: string) => {
      try {
        callback();
        throw new Error("EXPECTED_ADMISSION_POLICY_REFUSAL");
      } catch (error) {
        expect(error).toMatchObject({ code });
      }
    };
    expectCode(() => admissionPolicyFromValue({ kind: "ADMISSION_POLICY" }, "ref"), "ADMISSION_POLICY_INVALID");
    expectCode(() => admissionPolicyFromValue({
      ...ADMISSION_POLICY_REGISTER_ROW.value,
      asks: { ...ADMISSION_POLICY_REGISTER_ROW.value.asks, limit: 0 }
    }, "ref"), "ADMISSION_POLICY_INVALID");
    expectCode(() => admissionPolicyFromValue({
      ...ADMISSION_POLICY_REGISTER_ROW.value,
      public_reads: { ...ADMISSION_POLICY_REGISTER_ROW.value.public_reads, extra: true }
    }, "ref"), "ADMISSION_POLICY_INVALID");
    expectCode(() => admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, " "), "ADMISSION_POLICY_INVALID");

    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(readAdmissionPolicy({ query } as never, 1))
      .rejects.toMatchObject({ code: "ADMISSION_POLICY_UNRESOLVED" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("register.register_row"), [
      1, ADMISSION_POLICY_ROW_KEY
    ]);
    query.mockResolvedValueOnce({ rows: [{
      value_json: ADMISSION_POLICY_REGISTER_ROW.value,
      source_ref: ADMISSION_POLICY_REGISTER_ROW.sourceRef
    }] });
    await expect(readAdmissionPolicy({ query } as never, 1)).resolves.toMatchObject({
      asks: { limit: 20 }, publicReads: { limit: 120 }, recoveryStart: { limit: 15 }
    });
  });

  it("persists the sealed row and makes API boot read it before composing the limiter", async () => {
    const registerSource = await readFile("packages/register/src/index.ts", "utf8");
    const apiMain = await readFile("apps/api/src/main.ts", "utf8");
    const apiIndex = await readFile("apps/api/src/index.ts", "utf8");
    const devSeed = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    expect(registerSource).toContain("ADMISSION_POLICY_REGISTER_ROW");
    // The bootstrap register grows by exactly one row (extends the +4 pin).
    expect(registerSource).toContain("AUTH_POLICY_REGISTER_ROWS.length + 5");
    expect(devSeed).toContain("ADMISSION_POLICY_REGISTER_ROW");
    const readIndex = apiMain.indexOf("await readAdmissionPolicy(pool, environment.REGISTER_VERSION)");
    const limiterIndex = apiMain.indexOf("new AdmissionLimiter(");
    const composeIndex = apiMain.indexOf("buildApi({");
    expect(readIndex).toBeGreaterThan(-1);
    expect(limiterIndex).toBeGreaterThan(readIndex);
    expect(composeIndex).toBeGreaterThan(readIndex);
    // The limiter is optional for test compositions and always supplied by main.
    expect(apiIndex).toContain("readonly admission?: AdmissionLimiter");
    expect(apiMain.slice(composeIndex)).toContain("admission:");
  });
});
