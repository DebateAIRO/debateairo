import { describe, expect, it } from "vitest";
import { ROLE_ROTATION_RULE } from "@debateai/scorecard";
import {
  ANSWER_ROLE_ROTATION_POLICY_ROW_KEY, answerRoleRotationPolicyFromValue, answerRoleRotationPolicyRow, readAnswerRoleRotationPolicy
} from "@debateai/register";

const ON = { kind: "ANSWER_ROLE_ROTATION_POLICY", enabled: true, rule: "LEAST_SHARE_SEEDED_TIE_V1" };
const poolReturning = (rows: unknown[]) => {
  const calls: unknown[][] = [];
  return { calls, pool: { query: async (_sql: string, params: unknown[]) => { calls.push(params); return { rows }; } } as never };
};

describe("answerRoleRotationPolicy: one optional row, absent means today's engine", () => {
  it("reads ON, OFF and ABSENT", async () => {
    expect(answerRoleRotationPolicyFromValue(ON)).toEqual({ state: "ON", rule: "LEAST_SHARE_SEEDED_TIE_V1" });
    expect(answerRoleRotationPolicyFromValue({ ...ON, enabled: false })).toEqual({ state: "OFF" });
    const absent = poolReturning([]);
    await expect(readAnswerRoleRotationPolicy(absent.pool, 9)).resolves.toEqual({ state: "ABSENT" });
    expect(absent.calls).toEqual([[9, ANSWER_ROLE_ROTATION_POLICY_ROW_KEY]]);
    await expect(readAnswerRoleRotationPolicy(poolReturning([{ value_json: ON }]).pool, 10)).resolves.toEqual({ state: "ON", rule: "LEAST_SHARE_SEEDED_TIE_V1" });
  });
  it.each([
    ["an extra key", { ...ON, extra: 1 }],
    ["an unknown rule", { ...ON, rule: "LEAST_DONE_SEEDED_TIE_V2" }],
    ["a string enabled", { ...ON, enabled: "true" }],
    ["the wrong kind", { ...ON, kind: "SYNTHESIZER_ROLE_REF" }],
    ["not an object", "ON"]
  ])("refuses %s, loudly", (_name, value) => {
    expect(() => answerRoleRotationPolicyFromValue(value)).toThrow("ANSWER_ROLE_ROTATION_POLICY_INVALID");
  });
  it("the publishers' row is canonical JSON of the value", () => {
    const row = answerRoleRotationPolicyRow(true, "preview-register-composer-v2");
    expect(row.rowKey).toBe("answerRoleRotationPolicy");
    expect(JSON.parse(row.valueJsonText)).toEqual(ON);
    expect(answerRoleRotationPolicyFromValue(JSON.parse(answerRoleRotationPolicyRow(false, "x").valueJsonText))).toEqual({ state: "OFF" });
    expect(() => answerRoleRotationPolicyRow(true, " ")).toThrow("ANSWER_ROLE_ROTATION_POLICY_INVALID");
  });
  it("the rule name is the scorecard's rule name (one literal per package, one test that ties them)", () => {
    expect(ROLE_ROTATION_RULE).toBe(ON.rule);
  });
});
