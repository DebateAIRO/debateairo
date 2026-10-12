import { describe, expect, it } from "vitest";
import {
  CALL_CONCURRENCY_POLICY_ROW_KEY, callConcurrencyPolicyFromValue, callConcurrencyPolicyRow,
  effectiveCallConcurrency, readCallConcurrencyPolicy
} from "@debateai/register";

const valid = { kind: "CALL_CONCURRENCY_POLICY", perDebate: 12, perModelPerDebate: 3,
  perModelPerRunner: { default: 50, deepinfra: 150, anthropic: 50 } };

describe("callConcurrencyPolicy row", () => {
  it("parses the owner's start values", () => {
    expect(callConcurrencyPolicyFromValue(valid)).toEqual({ perDebate: 12, perModelPerDebate: 3,
      perModelPerRunner: { default: 50, deepinfra: 150, anthropic: 50 } });
  });
  it.each([
    { ...valid, perDebate: 0 }, { ...valid, perDebate: 65 }, { ...valid, perModelPerDebate: 17 },
    { ...valid, perModelPerRunner: { deepinfra: 150 } }, { ...valid, perModelPerRunner: { default: 0 } },
    { ...valid, perModelPerRunner: { default: 50, "Bad Key": 3 } }, { ...valid, extra: true },
    { ...valid, kind: "OTHER" }, { ...valid, perDebate: 2.5 }
  ])("refuses %j", (value) => {
    expect(() => callConcurrencyPolicyFromValue(value)).toThrow("CALL_CONCURRENCY_POLICY_INVALID");
  });
  it("absent means one call at a time per debate", () => {
    expect(effectiveCallConcurrency({ state: "ABSENT" })).toEqual({ perDebate: 1, perModelPerDebate: 1,
      perModelPerRunner: { default: 1000 } });
  });
  it("reads ABSENT, SET, and fails loud on a broken row", async () => {
    const query = (rows: unknown[]) => ({ query: async () => ({ rows }) }) as never;
    await expect(readCallConcurrencyPolicy(query([]), 7)).resolves.toEqual({ state: "ABSENT" });
    await expect(readCallConcurrencyPolicy(query([{ value_json: valid }]), 7))
      .resolves.toMatchObject({ state: "SET", policy: { perDebate: 12 } });
    await expect(readCallConcurrencyPolicy(query([{ value_json: { kind: "X" } }]), 7))
      .rejects.toThrow("CALL_CONCURRENCY_POLICY_INVALID");
  });
  it("builds a canonical row a publisher seals", () => {
    const row = callConcurrencyPolicyRow(callConcurrencyPolicyFromValue(valid), "owner-2026-10-12");
    expect(row.rowKey).toBe(CALL_CONCURRENCY_POLICY_ROW_KEY);
    expect(JSON.parse(row.valueJsonText)).toEqual(valid);
  });
});
