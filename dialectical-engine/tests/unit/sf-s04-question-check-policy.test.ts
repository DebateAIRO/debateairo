import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

const policyModule = () => import("../../packages/register/src/question-check-policy.js");

describe("S04 question-check policy", () => {
  // Property: the deployed row resolves to the 15-second cap, including its database reader.
  it("reads the deployment row's deadline_ms of 15000", async () => {
    const { QUESTION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW, readQuestionCheckPolicy } = await policyModule();
    const row = QUESTION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW;
    expect(row.rowKey).toBe("questionCheckPolicy");
    expect(row.value).toEqual({ kind: "QUESTION_CHECK_POLICY", deadline_ms: 15_000 });
    const poolValue = { query: async () => ({ rows: [{ value_json: row.value, source_ref: row.sourceRef }] }) };
    const pool = poolValue as unknown as Pick<Pool, "query">;
    await expect(readQuestionCheckPolicy(pool, 7)).resolves.toEqual({ deadlineMs: 15_000 });
  });

  // Property: each out-of-range, fractional, or string deadline refuses as INVALID.
  it.each([999, 15_001, 0, 1.5, "15000"])(
    "refuses deadline_ms %s with QUESTION_CHECK_POLICY_INVALID",
    async (deadlineMs) => {
      const { questionCheckPolicyFromValue } = await policyModule();
      expect(() => questionCheckPolicyFromValue(
        { kind: "QUESTION_CHECK_POLICY", deadline_ms: deadlineMs }, "S04-R8"
      )).toThrowError(expect.objectContaining({ code: "QUESTION_CHECK_POLICY_INVALID" }));
    }
  );

  // Property: both inclusive boundaries are accepted without rounding or clamping.
  it("accepts 1000 and 15000, the bounds", async () => {
    const { questionCheckPolicyFromValue } = await policyModule();
    expect(questionCheckPolicyFromValue({ kind: "QUESTION_CHECK_POLICY", deadline_ms: 1_000 }, "S04-R8"))
      .toEqual({ deadlineMs: 1_000 });
    expect(questionCheckPolicyFromValue({ kind: "QUESTION_CHECK_POLICY", deadline_ms: 15_000 }, "S04-R8"))
      .toEqual({ deadlineMs: 15_000 });
  });

  // Property: no register row means no usable deadline, not a fallback value.
  it("refuses a register version without the row with QUESTION_CHECK_POLICY_UNRESOLVED", async () => {
    const { readQuestionCheckPolicy } = await policyModule();
    const pool = { query: async () => ({ rows: [] }) } as unknown as Pick<Pool, "query">;
    await expect(readQuestionCheckPolicy(pool, 7)).rejects.toMatchObject({
      code: "QUESTION_CHECK_POLICY_UNRESOLVED"
    });
  });
});
