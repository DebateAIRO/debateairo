import { describe, expect, it } from "vitest";
import { BATTERY_EXECUTION_CONTRACTS, createInitialBatteryRows, resolveActivationState } from "@debateai/battery";

describe("P18 / DR-115 — run-creation battery evidence", () => {
  it("materialises row-specific inputs and a real Q61 settlement-watch handle", () => {
    const rows = createInitialBatteryRows({ settlementWatchHandle: "settlement-watch:test-layer" });
    expect(rows).toHaveLength(71);
    expect(rows.every((row) => row.predicateRef.includes("10-row-contracts.md §6"))).toBe(true);
    expect(rows.find((row) => row.batteryRowId === "Q1")?.predicateInputs).toEqual({
      kind: "PRESENT",
      values: { run_opened: true }
    });
    expect(rows.find((row) => row.batteryRowId === "Q2")?.predicateInputs).toEqual({
      kind: "ABSENT",
      reason: "NOT_AVAILABLE_AT_RUN_CREATION",
      expectedInputs: ["Q1_route"]
    });
    expect(rows.find((row) => row.batteryRowId === "Q14")?.predicateInputs).toEqual({
      kind: "ABSENT",
      reason: "PREDICATE_UNWRITTEN",
      expectedInputs: []
    });
    expect(rows.find((row) => row.batteryRowId === "Q61")?.skipEvidence).toEqual({
      kind: "PRESENT",
      evidenceType: "SETTLEMENT_WATCH_HANDLE",
      handle: "settlement-watch:test-layer"
    });
  });

  it("rejects an absent or blank settlement-watch handle loudly", () => {
    expect(() => createInitialBatteryRows({ settlementWatchHandle: "" })).toThrow("SETTLEMENT_WATCH_HANDLE_REQUIRED");
  });

  it("FX-S22-05 completes the 13-row zero-call and AC-83 activation proof", () => {
    const machine = BATTERY_EXECUTION_CONTRACTS.filter((row) => row.executionKind === "MACHINE");
    expect(machine).toHaveLength(13);
    expect(machine.every((row) => row.modelCallsAllowed === 0)).toBe(true);
    expect(resolveActivationState({ batteryRowId: "Q15", predicate: "FALSE", cacheHit: true })).toBe("ACTIVE");
    for (const batteryRowId of ["Q14", "Q40", "R6"] as const) {
      expect(resolveActivationState({ batteryRowId, predicate: "FALSE", cacheHit: false })).toBe("POLICY_BLOCKED");
    }
  });
});
