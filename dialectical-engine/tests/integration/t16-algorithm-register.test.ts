import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import {
  DEVELOPMENT_REGISTER_VERSION,
  seedDevelopmentDeploymentRegister
} from "../../apps/runner/src/dev-deployment-register.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";

/** Dev provenance every seeded algorithm row must carry (goal 82-84: dev provenance). */
const DEVELOPMENT_ALGORITHM_SOURCE_REF = "DEV-T16-algorithm-register.md#goal-v4:80-96";

type AlgorithmPolicyModule = typeof import("../../packages/register/src/algorithm-policy.js");

const loadAlgorithmPolicy = async (): Promise<AlgorithmPolicyModule> =>
  await import("../../packages/register/src/algorithm-policy.js");

/**
 * T16 · every new sealed row, its ruled default, and the family it belongs to.
 * Values: goal-v4 lines 80-96 (δ, ε, γ, high, low, evaluator-loop max) and mission
 * DECISIONS.md J1 (dispersion scale, disagreement threshold, repeated-family
 * multiplier, downgrade bands, provider/model→family map).
 */
const T16_EXPECTED_ROWS = [
  { family: "stopping", rowKey: "globalStopDelta", value: { kind: "GLOBAL_STOP_DELTA", delta: 0.02 } },
  { family: "stopping", rowKey: "branchFreezeEpsilon", value: { kind: "BRANCH_FREEZE_EPSILON", epsilon: 0.01 } },
  { family: "verdictLabel", rowKey: "verdictMarginGamma", value: { kind: "VERDICT_MARGIN_GAMMA", gamma: 0.05 } },
  { family: "verdictLabel", rowKey: "verdictHighCut", value: { kind: "VERDICT_HIGH_CUT", highCut: 0.7 } },
  { family: "verdictLabel", rowKey: "verdictLowCut", value: { kind: "VERDICT_LOW_CUT", lowCut: 0.35 } },
  {
    family: "verdictLabel",
    rowKey: "disagreementThreshold",
    value: { kind: "DISAGREEMENT_THRESHOLD", threshold: 0.25, scaleRowKey: "dispersionScale" }
  },
  {
    family: "verdictLabel",
    rowKey: "disagreementQuantity",
    value: {
      kind: "DISAGREEMENT_QUANTITY",
      quantityRef: "reducedJudgement.dispersion",
      scope: "WINNING_ROOT",
      scaleRowKey: "dispersionScale",
      absentReason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS"
    }
  },
  {
    family: "synthesisRoles",
    rowKey: "synthesizerRoleRef",
    value: { kind: "SYNTHESIZER_ROLE_REF", providerRef: "development:codex-cli", provisional: true }
  },
  {
    family: "synthesisRoles",
    rowKey: "evaluatorRoleRef",
    value: { kind: "EVALUATOR_ROLE_REF", providerRef: "development:claude-cli", provisional: true }
  },
  {
    family: "synthesisRoles",
    rowKey: "evaluatorLoopMaxRounds",
    value: { kind: "EVALUATOR_LOOP_MAX_ROUNDS", maxRounds: 3 }
  },
  { family: "panelWeighting", rowKey: "dispersionScale", value: { kind: "DISPERSION_SCALE", scale: 1 } },
  {
    family: "panelWeighting",
    rowKey: "repeatedFamilyMultiplier",
    value: { kind: "REPEATED_FAMILY_MULTIPLIER", multiplier: 0.5 }
  },
  {
    family: "panelWeighting",
    rowKey: "downgradeBands",
    value: {
      kind: "DOWNGRADE_BANDS",
      bandOrder: ["CAPPED", "FULL"],
      oneStepDown: { CAPPED: "CAPPED", FULL: "CAPPED" }
    }
  },
  {
    family: "panelWeighting",
    rowKey: "providerFamilyMap",
    value: {
      kind: "PROVIDER_FAMILY_MAP",
      families: [
        { familyRef: "OpenAI", providerRefs: ["development:codex-cli"] },
        { familyRef: "Anthropic", providerRefs: ["development:claude-cli"] },
        { familyRef: "xAI", providerRefs: ["development:grok-cli"] }
      ],
      unmappedFamilyKind: "UNKNOWN",
      unmappedReason: "PROVIDER_FAMILY_UNMAPPED",
      unknownFamilyBehavior: "EXEMPT_FROM_REPEATED_FAMILY_DISCOUNT"
    }
  },
  {
    family: "envelope",
    rowKey: "envelopeFormulaInputs",
    value: {
      kind: "ENVELOPE_FORMULA_INPUTS",
      branchingFactor: 2,
      compositionSegmentCap: 2,
      fixedOrgansPerComposition: 4,
      maxRecompose: 2,
      reviewerCallsPerNode: 1,
      synthesizerMaxRounds: 3,
      evaluatorMaxRounds: 3,
      panelCallsPerNodeBasis: "PANEL_SIZE_MINUS_ONE"
    }
  }
] as const;

const T16_FAMILIES = ["stopping", "verdictLabel", "synthesisRoles", "panelWeighting", "envelope"] as const;

let database: TestDatabase;

beforeEach(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterEach(async () => {
  vi.restoreAllMocks();
  if (database !== undefined) await database.stop();
});

async function insertRows(
  registerVersion: number,
  rows: readonly { readonly rowKey: string; readonly value: unknown }[]
): Promise<void> {
  for (const row of rows) {
    await database.pool.query(
      `INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
       VALUES ($1,$2,$3::jsonb,$4)`,
      [registerVersion, row.rowKey, JSON.stringify(row.value), "t16-test:scratch"]
    );
  }
}

describe("T16 algorithm register rows + seeding", () => {
  it("seeds every ruled algorithm row with its default value and dev provenance", async () => {
    await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL
    });
    const persisted = await database.pool.query<{
      row_key: string;
      value_json: unknown;
      source_ref: string;
    }>(
      `SELECT row_key,value_json,source_ref FROM register.register_row
       WHERE register_version=$1 AND row_key=ANY($2::text[]) ORDER BY row_key`,
      [DEVELOPMENT_REGISTER_VERSION, T16_EXPECTED_ROWS.map((row) => row.rowKey)]
    );
    const byKey = new Map(persisted.rows.map((row) => [row.row_key, row]));
    expect([...byKey.keys()].sort()).toEqual([...T16_EXPECTED_ROWS.map((row) => row.rowKey)].sort());
    for (const expected of T16_EXPECTED_ROWS) {
      const row = byKey.get(expected.rowKey);
      expect(row?.value_json, expected.rowKey).toEqual(expected.value);
      expect(row?.source_ref, expected.rowKey).toContain(DEVELOPMENT_ALGORITHM_SOURCE_REF);
    }
  });

  it("refuses to seal a register version that omits any algorithm row family", async () => {
    for (const [index, omitted] of T16_FAMILIES.entries()) {
      const registerVersion = 900 + index;
      const kept = T16_EXPECTED_ROWS.filter((row) => row.family !== omitted);
      const omittedKeys = T16_EXPECTED_ROWS
        .filter((row) => row.family === omitted)
        .map((row) => row.rowKey);
      await insertRows(registerVersion, kept);
      const rejection = await database.pool
        .query("SELECT register.assert_required_rows($1)", [registerVersion])
        .then(() => null, (error: unknown) => error);
      expect(rejection, omitted).toBeInstanceOf(Error);
      const message = (rejection as Error).message;
      expect(message, omitted).toContain("REGISTER_REQUIRED_ROW_MISSING");
      expect(omittedKeys.some((key) => message.includes(key)), `${omitted}: ${message}`).toBe(true);
    }
  });

  it("accepts a register version that carries every algorithm row family", async () => {
    await insertRows(950, T16_EXPECTED_ROWS);
    await expect(database.pool.query("SELECT register.assert_required_rows($1)", [950]))
      .resolves.toBeDefined();
  });

  it("fails loudly when a consumer reads an algorithm row family that was never seeded", async () => {
    const policy = await loadAlgorithmPolicy();
    const readers = [
      ["stopping", policy.readAdaptiveStoppingControls, "ADAPTIVE_STOPPING_CONTROLS_UNRESOLVED"],
      ["verdictLabel", policy.readVerdictLabelControls, "VERDICT_LABEL_CONTROLS_UNRESOLVED"],
      ["synthesisRoles", policy.readSynthesisRoleControls, "SYNTHESIS_ROLE_CONTROLS_UNRESOLVED"],
      ["panelWeighting", policy.readPanelWeightingControls, "PANEL_WEIGHTING_CONTROLS_UNRESOLVED"],
      ["envelope", policy.readEnvelopeFormulaInputs, "ENVELOPE_FORMULA_INPUTS_UNRESOLVED"]
    ] as const;
    for (const [family, reader, code] of readers) {
      const rejection = await reader(database.pool, DEVELOPMENT_REGISTER_VERSION)
        .then(() => null, (error: unknown) => error);
      expect(rejection, family).toBeInstanceOf(Error);
      expect((rejection as { code?: string }).code, family).toBe(code);
    }
  });

  it("reads every seeded algorithm family back through its register reader", async () => {
    const policy = await loadAlgorithmPolicy();
    await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL
    });
    await expect(policy.readAdaptiveStoppingControls(database.pool, DEVELOPMENT_REGISTER_VERSION))
      .resolves.toMatchObject({ delta: 0.02, epsilon: 0.01 });
    await expect(policy.readVerdictLabelControls(database.pool, DEVELOPMENT_REGISTER_VERSION))
      .resolves.toMatchObject({ gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 });
    await expect(policy.readPanelWeightingControls(database.pool, DEVELOPMENT_REGISTER_VERSION))
      .resolves.toMatchObject({ dispersionScale: 1, repeatedFamilyMultiplier: 0.5 });
    await expect(policy.readEnvelopeFormulaInputs(database.pool, DEVELOPMENT_REGISTER_VERSION))
      .resolves.toMatchObject({ branchingFactor: 2, reviewerCallsPerNode: 1 });
  });

  it("emits a startup warning when the synthesizer and evaluator role refs are identical", async () => {
    const policy = await loadAlgorithmPolicy();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await insertRows(960, [
      { rowKey: "synthesizerRoleRef", value: { kind: "SYNTHESIZER_ROLE_REF", providerRef: "development:codex-cli", provisional: true } },
      { rowKey: "evaluatorRoleRef", value: { kind: "EVALUATOR_ROLE_REF", providerRef: "development:codex-cli", provisional: true } },
      { rowKey: "evaluatorLoopMaxRounds", value: { kind: "EVALUATOR_LOOP_MAX_ROUNDS", maxRounds: 3 } }
    ]);
    const controls = await policy.readSynthesisRoleControls(database.pool, 960);
    expect(controls.identicalRoleRefs).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("SYNTHESIS_ROLE_REFS_IDENTICAL");
  });

  it("stays silent when the synthesizer and evaluator role refs differ", async () => {
    const policy = await loadAlgorithmPolicy();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await insertRows(961, [
      { rowKey: "synthesizerRoleRef", value: { kind: "SYNTHESIZER_ROLE_REF", providerRef: "development:codex-cli", provisional: true } },
      { rowKey: "evaluatorRoleRef", value: { kind: "EVALUATOR_ROLE_REF", providerRef: "development:claude-cli", provisional: true } },
      { rowKey: "evaluatorLoopMaxRounds", value: { kind: "EVALUATOR_LOOP_MAX_ROUNDS", maxRounds: 3 } }
    ]);
    const controls = await policy.readSynthesisRoleControls(database.pool, 961);
    expect(controls.identicalRoleRefs).toBe(false);
    expect(controls.synthesizerRoleRef).not.toBe(controls.evaluatorRoleRef);
    expect(warn).not.toHaveBeenCalled();
  });
});
