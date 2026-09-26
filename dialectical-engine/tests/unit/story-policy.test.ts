import { describe, expect, it } from "vitest";
import * as storyPolicyModule from "../../packages/register/src/story-policy.js";
import {
  STORY_ROW_KEYS,
  buildStoryRegisterRows,
  loadBootstrapRegister,
  readStoryPolicy,
  type StoryRegisterRow
} from "../../packages/register/src/index.js";
import { buildAcceptanceRegisterRows } from "../../acceptance/seed-register.js";
import { readLegacyDevelopmentV4Rows } from "../support/registerFixtures.js";

/**
 * Verdict story, Task 5 — the OPTIONAL story register rows (spec §8-§9).
 * Absent rows mean "story off", never a refused debate; a partial or malformed
 * family is refused by name; every sealed register that exists today still
 * parses and reads as "no story".
 */

const LOCAL = Object.freeze({
  synthesizerRoleRef: "provider:synthesizer",
  evaluatorRoleRef: "provider:evaluator",
  sourceRef: "test-layer:story",
  hosted: false
});
const HOSTED = Object.freeze({ ...LOCAL, hosted: true });

function codeOf(action: () => unknown): string | null {
  try {
    action();
    return null;
  } catch (error) {
    const code = (error as { readonly code?: unknown }).code;
    return typeof code === "string" ? code : `UNTYPED:${String(error)}`;
  }
}

function withValue(rows: readonly StoryRegisterRow[], rowKey: string, value: unknown): StoryRegisterRow[] {
  return rows.map((row) => (row.rowKey === rowKey ? { ...row, value } : row));
}

function without(rows: readonly StoryRegisterRow[], rowKey: string): StoryRegisterRow[] {
  return rows.filter((row) => row.rowKey !== rowKey);
}

describe("verdict story register rows — optional, strict, provisional", () => {
  it("builds the six local rows with the spec's provisional values", () => {
    const rows = buildStoryRegisterRows(LOCAL);
    expect(rows.map((row) => row.rowKey)).toEqual([
      "storytellerRoleRef", "storyCheckerRoleRef", "storyLoopMaxRounds",
      "storytellerCallBound", "storyCheckerCallBound", "storyMaterialBudget"
    ]);
    expect(Object.fromEntries(rows.map((row) => [row.rowKey, row.value]))).toEqual({
      storytellerRoleRef: { kind: "STORYTELLER_ROLE_REF", providerRef: "provider:synthesizer", provisional: true },
      storyCheckerRoleRef: { kind: "STORY_CHECKER_ROLE_REF", providerRef: "provider:evaluator", provisional: true },
      storyLoopMaxRounds: { kind: "STORY_LOOP_MAX_ROUNDS", maxRounds: 2 },
      storytellerCallBound: {
        kind: "STORYTELLER_CALL_BOUND", maxAttempts: 2, tokenCeiling: 12_000, deadlineMs: 300_000
      },
      storyCheckerCallBound: {
        kind: "STORY_CHECKER_CALL_BOUND", maxAttempts: 2, tokenCeiling: 2_048, deadlineMs: 180_000
      },
      storyMaterialBudget: { kind: "STORY_MATERIAL_BUDGET", low: 40_000, medium: 80_000, high: 120_000 }
    });
    for (const row of rows) expect(row.sourceRef.startsWith("test-layer:story+"), row.rowKey).toBe(true);
  });

  it("adds the hosted money row: 50 000 micro-units per story", () => {
    const rows = buildStoryRegisterRows(HOSTED);
    expect(rows.map((row) => row.rowKey)).toEqual([...STORY_ROW_KEYS]);
    expect(rows.find((row) => row.rowKey === "storyCostEnvelopePolicy")?.value).toEqual({
      kind: "STORY_COST_ENVELOPE_POLICY",
      currency: "USD",
      minor_units_per_unit: 1_000_000,
      per_story_ceiling_micros: 50_000,
      provisional: true,
      provisional_reason: expect.stringContaining("NEW version")
    });
  });

  it("reads the rows back as ONE policy; local carries no money ceiling", () => {
    expect(readStoryPolicy(buildStoryRegisterRows(LOCAL), 9)).toEqual({
      storytellerRoleRef: "provider:synthesizer",
      storyCheckerRoleRef: "provider:evaluator",
      loopMaxRounds: 2,
      storytellerBound: { maxAttempts: 2, tokenCeiling: 12_000, deadlineMs: 300_000 },
      checkerBound: { maxAttempts: 2, tokenCeiling: 2_048, deadlineMs: 180_000 },
      materialBudget: { low: 40_000, medium: 80_000, high: 120_000 },
      perStoryCeilingMicros: null,
      registerVersion: 9
    });
    expect(readStoryPolicy(buildStoryRegisterRows(HOSTED), 9)?.perStoryCeilingMicros).toBe(50_000);
  });

  it("reads a register with NO story row as null: the story is off, never a refused debate", () => {
    expect(readStoryPolicy([], 9)).toBeNull();
    expect(readStoryPolicy([{ rowKey: "costEnvelopePolicy", value: {}, sourceRef: "x" }], 9)).toBeNull();
  });

  it("refuses a PARTLY sealed family by name", () => {
    expect(codeOf(() => readStoryPolicy(without(buildStoryRegisterRows(LOCAL), "storyLoopMaxRounds"), 9)))
      .toBe("STORY_POLICY_INCOMPLETE");
    const onlyMoney = buildStoryRegisterRows(HOSTED).filter((row) => row.rowKey === "storyCostEnvelopePolicy");
    expect(codeOf(() => readStoryPolicy(onlyMoney, 9))).toBe("STORY_POLICY_INCOMPLETE");
  });

  it("refuses any row outside its declared member type", () => {
    const rows = buildStoryRegisterRows(HOSTED);
    const cases: ReadonlyArray<readonly [string, unknown]> = [
      ["storyLoopMaxRounds", { kind: "STORY_LOOP_MAX_ROUNDS", maxRounds: 0 }],
      ["storyLoopMaxRounds", { kind: "STORY_LOOP_MAX_ROUNDS", maxRounds: 2, extra: true }],
      ["storytellerRoleRef", { kind: "EVALUATOR_ROLE_REF", providerRef: "provider:x", provisional: true }],
      ["storytellerCallBound", { kind: "STORYTELLER_CALL_BOUND", maxAttempts: 2, tokenCeiling: 12_000, deadlineMs: 0 }],
      ["storyMaterialBudget", { kind: "STORY_MATERIAL_BUDGET", low: 90_000, medium: 80_000, high: 120_000 }],
      ["storyMaterialBudget", { kind: "STORY_MATERIAL_BUDGET", low: 40_000, medium: 80_000, high: 300_000 }],
      ["storyCostEnvelopePolicy", {
        kind: "STORY_COST_ENVELOPE_POLICY", currency: "USD", minor_units_per_unit: 1_000_000,
        per_story_ceiling_micros: 0.5, provisional: true, provisional_reason: "x"
      }]
    ];
    for (const [rowKey, value] of cases) {
      expect(codeOf(() => readStoryPolicy(withValue(rows, rowKey, value), 9)), `${rowKey} ${JSON.stringify(value)}`)
        .toBe("STORY_POLICY_INVALID");
    }
  });

  it("refuses a row with no provenance, and a duplicated row", () => {
    const rows = buildStoryRegisterRows(LOCAL);
    const blank = rows.map((row) => (row.rowKey === "storyLoopMaxRounds" ? { ...row, sourceRef: "  " } : row));
    expect(codeOf(() => readStoryPolicy(blank, 9))).toBe("STORY_POLICY_PROVENANCE_MISSING");
    expect(codeOf(() => readStoryPolicy([...rows, rows[0]!], 9))).toBe("STORY_POLICY_INVALID");
  });

  it("refuses an empty role ref or source ref when building, and a non-positive register version", () => {
    expect(codeOf(() => buildStoryRegisterRows({ ...LOCAL, synthesizerRoleRef: " " }))).toBe("STORY_REGISTER_ROWS_INVALID");
    expect(codeOf(() => buildStoryRegisterRows({ ...LOCAL, evaluatorRoleRef: "" }))).toBe("STORY_REGISTER_ROWS_INVALID");
    expect(codeOf(() => buildStoryRegisterRows({ ...LOCAL, sourceRef: "" }))).toBe("STORY_REGISTER_ROWS_INVALID");
    expect(codeOf(() => readStoryPolicy(buildStoryRegisterRows(LOCAL), 0)))
      .toBe("UNTYPED:TypeError: STORY_POLICY_REGISTER_VERSION_INVALID");
  });

  it("exports no numeric literal: every number leaves the module only inside a row", () => {
    expect(Object.entries(storyPolicyModule).filter(([, value]) => typeof value === "number")).toEqual([]);
  });
});

describe("every sealed register that exists today still parses, and reads as 'no story'", () => {
  it("the frozen development v4 fixture", async () => {
    const rows = (await readLegacyDevelopmentV4Rows()).map((row) => ({
      rowKey: row.rowKey, value: JSON.parse(row.valueJsonText) as unknown, sourceRef: row.sourceRef
    }));
    expect(rows.length).toBeGreaterThan(0);
    expect(readStoryPolicy(rows, 4)).toBeNull();
  });

  it("acceptance register v3", async () => {
    const rows = await buildAcceptanceRegisterRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(readStoryPolicy(rows, 3)).toBeNull();
  });

  it("the sealed bootstrap", async () => {
    const bootstrap = await loadBootstrapRegister();
    const rows = Object.entries(bootstrap.values).map(([rowKey, value]) => ({
      rowKey, value: value as unknown, sourceRef: "register.bootstrap.json"
    }));
    expect(rows.length).toBeGreaterThan(0);
    expect(readStoryPolicy(rows, bootstrap.registerVersion)).toBeNull();
  });
});
