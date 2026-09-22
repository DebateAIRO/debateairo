import * as registerModule from "../../packages/register/src/index.js";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import {
  ALGORITHM_REGISTER_ROW_KEYS,
  AUTH_POLICY_REGISTER_ROWS,
  MFA_POLICY_REGISTER_ROW,
  PRODUCT_ROLE_POLICY_REGISTER_ROW,
  RECOVERY_POLICY_REGISTER_ROW,
  SESSION_POLICY_REGISTER_ROW,
  loadBootstrapRegister,
  createPostgresRegisterPublicationPort,
  parseRegisterVersionText,
  persistBootstrapRegister,
  registerVersionToSafeLegacyNumber
} from "../../packages/register/src/index.js";
import {
  DEVELOPMENT_REGISTER_VERSION,
  buildDevelopmentDeploymentRegisterRows,
  buildDevelopmentRunnerRegisterRows,
  seedDevelopmentDeploymentRegister
} from "../../apps/runner/src/dev-deployment-register.js";
import {
  ACCEPTANCE_ALGORITHM_SOURCE_REF,
  ACCEPTANCE_REGISTER_VERSION,
  buildAcceptanceRegisterPublicationRows,
  buildAcceptanceRegisterRows,
  seedAcceptanceRegister
} from "../../acceptance/seed-register.js";
import { EXPANSION_DEPTH_MAX } from "@debateai/contract";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { importHistoricalRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";

/** The sealed register identities that existed at the base `dev@1c9578a`. */
const BASE_DEVELOPMENT_REGISTER_VERSION = 4;
const BASE_ACCEPTANCE_REGISTER_VERSION = 1;

/** Dev provenance every seeded algorithm row must carry (goal 82-84: dev provenance). */
const DEVELOPMENT_ALGORITHM_SOURCE_REF = "DEV-T16-algorithm-register.md#goal-v4:80-96";

/**
 * The ruling that actually chose each value. J1 rules EXACTLY five values; the
 * role identities are ruled by J8. A sealed row citing a ruling that never
 * mentioned its value is audit poison (codex T16-r1 B2), so every row's
 * source_ref is asserted for EXACT equality, never containment.
 */
const RULING_GOAL = "goal-v4-2026-09-01:80-96";
/**
 * D77 (c): V refitted the two adaptive-stopping thresholds from the first real
 * M>=2 run — delta 0.02 -> 0.01, epsilon 0.01 -> 0.005. The goal SEEDED the
 * coarse pair; D77 CHOSE the values these two rows now carry, so these two rows
 * — and only these two — cite D77 instead of the goal.
 */
const RULING_D77 = "algorithm-live-loop-DECISIONS.md#D77";
const RULING_J1 = "algorithm-live-loop-DECISIONS.md#J1";
const RULING_J8 = "algorithm-live-loop-DECISIONS.md#J8+configured-provider-set-derivation";
const RULING_BANDS =
  "algorithm-live-loop-DECISIONS.md#J1+packages/register/src/engine-shape.ts#ENGINE_BAND_ORDER";
const RULING_FAMILY_MAP = "algorithm-live-loop-DECISIONS.md#J1+register:configuredProviderSet";
/** W10/3: the ticket that MEASURED the inverted deadline chose these two values. */
const RULING_W10 =
  "algorithm-live-loop-board/W10-call-budget-truthfulness.md#3+audits/token-budget-reasoning.md";
const RULING_ENVELOPE =
  "goal-v4-2026-09-01:285-295+packages/register/src/engine-shape.ts#ENGINE_BRANCHING_FACTOR";

type AlgorithmPolicyModule = typeof import("../../packages/register/src/algorithm-policy.js");

const loadAlgorithmPolicy = async (): Promise<AlgorithmPolicyModule> =>
  await import("../../packages/register/src/algorithm-policy.js");

/**
 * T16 · every new sealed row, its ruled default, and the family it belongs to.
 * Values: goal-v4 lines 80-96 (γ, high, low, evaluator-loop max — and the SEEDS
 * for δ and ε), mission DECISIONS.md J1 (dispersion scale, disagreement
 * threshold, repeated-family multiplier, downgrade bands, provider/model→family
 * map), and D77 (c), which REFITTED δ and ε from the first real M≥2 run.
 */
const T16_EXPECTED_ROWS = [
  { family: "stopping", rowKey: "globalStopDelta", rulingRef: RULING_D77, value: { kind: "GLOBAL_STOP_DELTA", delta: 0.01 } },
  { family: "stopping", rowKey: "branchFreezeEpsilon", rulingRef: RULING_D77, value: { kind: "BRANCH_FREEZE_EPSILON", epsilon: 0.005 } },
  { family: "verdictLabel", rowKey: "verdictMarginGamma", rulingRef: RULING_GOAL, value: { kind: "VERDICT_MARGIN_GAMMA", gamma: 0.05 } },
  { family: "verdictLabel", rowKey: "verdictHighCut", rulingRef: RULING_GOAL, value: { kind: "VERDICT_HIGH_CUT", highCut: 0.7 } },
  { family: "verdictLabel", rowKey: "verdictLowCut", rulingRef: RULING_GOAL, value: { kind: "VERDICT_LOW_CUT", lowCut: 0.35 } },
  {
    family: "verdictLabel",
    rowKey: "disagreementThreshold",
    rulingRef: RULING_J1,
    value: { kind: "DISAGREEMENT_THRESHOLD", threshold: 0.25, scaleRowKey: "dispersionScale" }
  },
  {
    family: "verdictLabel",
    rowKey: "disagreementQuantity",
    rulingRef: RULING_GOAL,
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
    rulingRef: RULING_J8,
    value: { kind: "SYNTHESIZER_ROLE_REF", providerRef: "development:codex-cli", provisional: true }
  },
  {
    family: "synthesisRoles",
    rowKey: "evaluatorRoleRef",
    rulingRef: RULING_J8,
    value: { kind: "EVALUATOR_ROLE_REF", providerRef: "development:claude-cli", provisional: true }
  },
  {
    family: "synthesisRoles",
    rowKey: "evaluatorLoopMaxRounds",
    rulingRef: RULING_GOAL,
    value: { kind: "EVALUATOR_LOOP_MAX_ROUNDS", maxRounds: 3 }
  },
  // W10/3 (`board/W10-call-budget-truthfulness.md` section 3): the two roles'
  // OWN cost bounds. Before them the synthesizer borrowed COMPOSER's and the
  // evaluator CONFORMANCE's — two organs T9 retired — so both carried 60_000
  // while the JUDGE carried 180_000. The deadline is the development
  // deployment's own judge clock; `tokenCeiling` stays 2048 until a live run
  // reports `usage.completion_tokens`.
  {
    family: "synthesisRoles",
    rowKey: "synthesizerCallBound",
    rulingRef: RULING_W10,
    value: { kind: "SYNTHESIZER_CALL_BOUND", maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 }
  },
  {
    family: "synthesisRoles",
    rowKey: "evaluatorCallBound",
    rulingRef: RULING_W10,
    value: { kind: "EVALUATOR_CALL_BOUND", maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 }
  },
  { family: "panelWeighting", rowKey: "dispersionScale", rulingRef: RULING_J1, value: { kind: "DISPERSION_SCALE", scale: 1 } },
  {
    family: "panelWeighting",
    rowKey: "repeatedFamilyMultiplier",
    rulingRef: RULING_J1,
    value: { kind: "REPEATED_FAMILY_MULTIPLIER", multiplier: 0.5 }
  },
  {
    family: "panelWeighting",
    rowKey: "downgradeBands",
    rulingRef: RULING_BANDS,
    value: {
      kind: "DOWNGRADE_BANDS",
      bandOrder: ["CAPPED", "FULL"],
      oneStepDown: { CAPPED: "CAPPED", FULL: "CAPPED" }
    }
  },
  {
    family: "panelWeighting",
    rowKey: "providerFamilyMap",
    rulingRef: RULING_FAMILY_MAP,
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
    rulingRef: RULING_ENVELOPE,
    value: {
      kind: "ENVELOPE_FORMULA_INPUTS",
      branchingFactor: 2,
      compositionSegmentCap: 2,
      fixedOrgansPerComposition: 4,
      maxRecompose: 2,
      reviewerCallsPerNode: 1,
      synthesizerMaxRounds: 3,
      evaluatorMaxRounds: 3,
      panelCallsPerNodeBasis: "PANEL_SIZE_MINUS_ONE",
      // The seeder gained this key in 4bbb13e5 (T17 rework r2): the sealed
      // maximum ADMISSION refuses above, so an over-bound ask is refused at
      // admission instead of minting a ceiling the runner rejects later. This
      // expectation predated it by a day (c85d8c6f) and the mismatch was hidden
      // by the conformance break until d08ee928 fixed it (F-GATE-1).
      // Read from the contract owner, never restated: the register derives the
      // same constant (V-T1B3-1), and a literal here would be a second source.
      maxDepth: EXPANSION_DEPTH_MAX
    }
  }
] as const;

const T16_FAMILIES = ["stopping", "verdictLabel", "synthesisRoles", "panelWeighting", "envelope"] as const;

let database: TestDatabase;
let repositoryRoot: string;

beforeEach(async () => {
  repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-t16-receipt-"));
  await mkdir(join(repositoryRoot, ".local", "dev-auth"), { recursive: true, mode: 0o700 });
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterEach(async () => {
  vi.restoreAllMocks();
  if (database !== undefined) await database.stop();
  if (repositoryRoot !== undefined) await rm(repositoryRoot, { recursive: true, force: true });
});

async function publishAlgorithmRows(
  rows: readonly { readonly rowKey: string; readonly value: unknown }[]
): Promise<number> {
  const bootstrap = await loadBootstrapRegister();
  await persistBootstrapRegister(database.pool, bootstrap);
  const receipt = await createPostgresRegisterPublicationPort(database.pool).publishGeneral({
    publicationId: randomUUID(),
    baseRegisterVersion: parseRegisterVersionText(String(bootstrap.registerVersion)),
    rows: rows.map(row => registerFixtureRow(row.rowKey, row.value, "t16-test:scratch")),
    sourceRef: "t16-test:scratch"
  });
  return registerVersionToSafeLegacyNumber(receipt.registerVersion);
}

describe("T16 algorithm register rows + seeding", () => {
  it("rejects development publication when the complete algorithm family is omitted", async () => {
    vi.spyOn(registerModule, "buildAlgorithmRegisterRows").mockReturnValue([]);
    await expect(seedDevelopmentDeploymentRegister({ adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL, repositoryRoot }))
      .rejects.toThrow("DEV_ALGORITHM_REGISTER_ROWS_INCOMPLETE");
    expect((await database.pool.query("SELECT register_version FROM register.register_version WHERE register_version > 4")).rows).toEqual([]);
  });

  /**
   * The literal 2 here is the manifest-DECLARED acceptance version
   * (`migrations/0050_t16_algorithm_register_rows.sql:49-52` declares 2 and 5),
   * NOT the ceremony's pin — `ACCEPTANCE_REGISTER_VERSION` is 3 since D77 (c).
   * The two differ, so this case no longer covers the version the ceremony
   * actually seeds: at the pin, a seal carrying NOT ONE required row is not
   * refused, because version 3 is undeclared and the publication trigger only
   * declares a profile for a version that already carries a required row
   * (`migrations/0061_algorithm_publication_profiles.sql:10-37`). Only the
   * all-missing case is unguarded there: a seal at 3 carrying SOME required rows
   * trips the same `REGISTER_REQUIRED_ROW_MISSING`, measured, and no test pins
   * that yet. Ticket `F-REGISTER-V3-REQUIRED-ROW-PROFILE` adds 3 to the manifest;
   * when it lands, this literal becomes `ACCEPTANCE_REGISTER_VERSION` and the gap
   * closes.
   */
  it("rolls back historical acceptance publication when all required algorithm rows are missing", async () => {
    await expect(importHistoricalRegisterFixture(database.pool, 2, [
      registerFixtureRow("riskTier", "standard", "test:incomplete-acceptance")
    ])).rejects.toThrow("REGISTER_REQUIRED_ROW_MISSING");
    expect((await database.pool.query("SELECT register_version FROM register.register_version WHERE register_version=2")).rows).toEqual([]);
    expect((await database.pool.query("SELECT row_key FROM register.register_row WHERE register_version=2")).rows).toEqual([]);
  });

  it("seeds every ruled algorithm row with its default value and dev provenance", async () => {
    await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
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
      // EXACT, not contains: a row must name the ruling that chose ITS value.
      expect(row?.source_ref, expected.rowKey)
        .toBe(`${DEVELOPMENT_ALGORITHM_SOURCE_REF}+${expected.rulingRef}`);
    }
  });

  it("cites J1 on exactly the five values J1 ruled and J8 on the two role identities", async () => {
    await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    });
    const persisted = await database.pool.query<{ row_key: string; source_ref: string }>(
      `SELECT row_key,source_ref FROM register.register_row
       WHERE register_version=$1 AND row_key=ANY($2::text[])`,
      [DEVELOPMENT_REGISTER_VERSION, T16_EXPECTED_ROWS.map((row) => row.rowKey)]
    );
    const citesJ1 = persisted.rows
      .filter((row) => row.source_ref.includes("#J1"))
      .map((row) => row.row_key)
      .sort();
    const citesJ8 = persisted.rows
      .filter((row) => row.source_ref.includes("#J8"))
      .map((row) => row.row_key)
      .sort();
    // J1 rules EXACTLY five values (mission DECISIONS J1); the role identities are J8's.
    expect(citesJ1).toEqual([
      "disagreementThreshold", "dispersionScale", "downgradeBands",
      "providerFamilyMap", "repeatedFamilyMultiplier"
    ]);
    expect(citesJ8).toEqual(["evaluatorRoleRef", "synthesizerRoleRef"]);
  });

  it("cites D77 on exactly the two thresholds it refitted and leaves the goal on the rest", async () => {
    await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    });
    const persisted = await database.pool.query<{ row_key: string; source_ref: string }>(
      `SELECT row_key,source_ref FROM register.register_row
       WHERE register_version=$1 AND row_key=ANY($2::text[])`,
      [DEVELOPMENT_REGISTER_VERSION, T16_EXPECTED_ROWS.map((row) => row.rowKey)]
    );
    const citing = (ruling: string): readonly string[] => persisted.rows
      .filter((row) => row.source_ref.endsWith(`+${ruling}`))
      .map((row) => row.row_key)
      .sort();
    // D77 (c) refitted TWO values and nothing else. A row citing a ruling that
    // never chose its value is audit poison (J8), in both directions.
    expect(citing(RULING_D77)).toEqual(["branchFreezeEpsilon", "globalStopDelta"]);
    expect(citing(RULING_GOAL)).toEqual([
      "disagreementQuantity", "evaluatorLoopMaxRounds",
      "verdictHighCut", "verdictLowCut", "verdictMarginGamma"
    ]);
  });

  it("refuses to seal a register version that omits any algorithm row family", async () => {
    for (const omitted of T16_FAMILIES) {
      const before = (await database.pool.query("SELECT count(*)::int AS count FROM register.required_row_version")).rows;
      const kept = T16_EXPECTED_ROWS.filter((row) => row.family !== omitted);
      const omittedKeys = T16_EXPECTED_ROWS
        .filter((row) => row.family === omitted)
        .map((row) => row.rowKey);
      const rejection = await publishAlgorithmRows(kept)
        .then(() => null, (error: unknown) => error);
      expect((await database.pool.query("SELECT count(*)::int AS count FROM register.required_row_version")).rows).toEqual(before);
      expect(rejection, omitted).toBeInstanceOf(Error);
      const message = (rejection as Error).message;
      expect(message, omitted).toContain("REGISTER_REQUIRED_ROW_MISSING");
      expect(omittedKeys.some((key) => message.includes(key)), `${omitted}: ${message}`).toBe(true);
    }
  });

  it("leaves a version the manifest does not govern untouched", async () => {
    // Historical versions (dev 4, ceremony 1) are ungoverned by construction.
    // Not an exhaustive list of ungoverned versions: since D77 (c) moved the
    // ceremony pin to 3, that version is ungoverned too until it carries a
    // required row — see the note above and `F-REGISTER-V3-REQUIRED-ROW-PROFILE`.
    await expect(database.pool.query("SELECT register.assert_required_rows($1)", [4]))
      .resolves.toBeDefined();
    await expect(database.pool.query("SELECT register.assert_required_rows($1)", [1]))
      .resolves.toBeDefined();
  });

  it("accepts a register version that carries every algorithm row family", async () => {
    const version = await publishAlgorithmRows(T16_EXPECTED_ROWS);
    await expect(database.pool.query("SELECT register.assert_required_rows($1)", [version]))
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
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    });
    await expect(policy.readAdaptiveStoppingControls(database.pool, DEVELOPMENT_REGISTER_VERSION))
      .resolves.toMatchObject({ delta: 0.01, epsilon: 0.005 });
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
    const version = await publishAlgorithmRows([
      ...T16_EXPECTED_ROWS.filter(row => !["synthesizerRoleRef", "evaluatorRoleRef", "evaluatorLoopMaxRounds"].includes(row.rowKey)),
      { rowKey: "synthesizerRoleRef", value: { kind: "SYNTHESIZER_ROLE_REF", providerRef: "development:codex-cli", provisional: true } },
      { rowKey: "evaluatorRoleRef", value: { kind: "EVALUATOR_ROLE_REF", providerRef: "development:codex-cli", provisional: true } },
      { rowKey: "evaluatorLoopMaxRounds", value: { kind: "EVALUATOR_LOOP_MAX_ROUNDS", maxRounds: 3 } }
    ]);
    const controls = await policy.readSynthesisRoleControls(database.pool, version);
    expect(controls.identicalRoleRefs).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("SYNTHESIS_ROLE_REFS_IDENTICAL");
  });

  it("stays silent when the synthesizer and evaluator role refs differ", async () => {
    const policy = await loadAlgorithmPolicy();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const version = await publishAlgorithmRows([
      ...T16_EXPECTED_ROWS.filter(row => !["synthesizerRoleRef", "evaluatorRoleRef", "evaluatorLoopMaxRounds"].includes(row.rowKey)),
      { rowKey: "synthesizerRoleRef", value: { kind: "SYNTHESIZER_ROLE_REF", providerRef: "development:codex-cli", provisional: true } },
      { rowKey: "evaluatorRoleRef", value: { kind: "EVALUATOR_ROLE_REF", providerRef: "development:claude-cli", provisional: true } },
      { rowKey: "evaluatorLoopMaxRounds", value: { kind: "EVALUATOR_LOOP_MAX_ROUNDS", maxRounds: 3 } }
    ]);
    const controls = await policy.readSynthesisRoleControls(database.pool, version);
    expect(controls.identicalRoleRefs).toBe(false);
    expect(controls.synthesizerRoleRef).not.toBe(controls.evaluatorRoleRef);
    expect(warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B1 · sealed-version identity. A register version that already exists at the
// base is HISTORICAL: it must survive this lane byte-identically, and the new
// rows must land in a NEWLY MINTED version. Fresh-database tests cannot see
// this — every fixture below starts from a base-shaped SEALED version.
// ---------------------------------------------------------------------------

async function readVersionSnapshot(registerVersion: number): Promise<Readonly<{
  rows: readonly { row_key: string; value_json: unknown; source_ref: string }[];
  version: { row_count: number; sealed: boolean } | undefined;
}>> {
  const rows = await database.pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
    `SELECT row_key,value_json,source_ref FROM register.register_row
     WHERE register_version=$1 ORDER BY row_key`,
    [registerVersion]
  );
  const version = await database.pool.query<{ row_count: number; sealed: boolean }>(
    "SELECT row_count,sealed FROM register.register_version WHERE register_version=$1",
    [registerVersion]
  );
  return Object.freeze({ rows: rows.rows, version: version.rows[0] });
}

async function sealVersion(
  registerVersion: number,
  rows: readonly { readonly rowKey: string; readonly value: unknown; readonly sourceRef: string }[]
): Promise<void> {
  if (registerVersion !== 1 && registerVersion !== 4) throw new Error("Historical fixture only");
  await importHistoricalRegisterFixture(database.pool, registerVersion,
    rows.map(row => registerFixtureRow(row.rowKey, row.value, row.sourceRef)));

}

describe("T16 sealed-version identity — historical versions are never re-opened", () => {
  it("leaves a base-shaped sealed dev v4 byte-identical and mints a NEW current version", async () => {
    const bootstrap = await loadBootstrapRegister();
    // The base's v4 row set: everything the seeder wrote at `dev@1c9578a`,
    // i.e. today's row set MINUS the fifteen rows this lane adds.
    const baseRows = [
      ...Object.entries(bootstrap.values).map(([rowKey, value]) => ({
        rowKey,
        value,
        sourceRef: bootstrap.resolution[rowKey as keyof typeof bootstrap.resolution]!
      })),
      ...AUTH_POLICY_REGISTER_ROWS,
      MFA_POLICY_REGISTER_ROW,
      SESSION_POLICY_REGISTER_ROW,
      RECOVERY_POLICY_REGISTER_ROW,
      PRODUCT_ROLE_POLICY_REGISTER_ROW,
      ...buildDevelopmentDeploymentRegisterRows(TEST_DEVELOPMENT_PROVIDER_PANEL),
      ...await buildDevelopmentRunnerRegisterRows()
    ].filter((row) => !(ALGORITHM_REGISTER_ROW_KEYS as readonly string[]).includes(row.rowKey));
    await sealVersion(BASE_DEVELOPMENT_REGISTER_VERSION, baseRows);
    const before = await readVersionSnapshot(BASE_DEVELOPMENT_REGISTER_VERSION);
    expect(before.version).toEqual({ row_count: baseRows.length, sealed: true });

    const receipt = await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    });

    // A NEW identity, never the sealed one that already existed.
    expect(registerVersionToSafeLegacyNumber(receipt.registerVersion)).toBeGreaterThan(BASE_DEVELOPMENT_REGISTER_VERSION);
    expect(registerVersionToSafeLegacyNumber(receipt.registerVersion)).toBe(DEVELOPMENT_REGISTER_VERSION);
    expect(await readVersionSnapshot(BASE_DEVELOPMENT_REGISTER_VERSION)).toEqual(before);
    const current = await readVersionSnapshot(registerVersionToSafeLegacyNumber(receipt.registerVersion));
    expect(current.version).toEqual({ row_count: receipt.rowCount, sealed: true });
    for (const rowKey of ALGORITHM_REGISTER_ROW_KEYS) {
      expect(current.rows.map((row) => row.row_key), rowKey).toContain(rowKey);
    }
  }, 120_000);

  it("leaves a base-shaped sealed acceptance v1 byte-identical and mints a NEW current version", async () => {
    const bootstrap = await loadBootstrapRegister();
    const acceptanceRows = await buildAcceptanceRegisterRows();
    const baseRows = [
      ...Object.entries(bootstrap.values).map(([rowKey, value]) => ({
        rowKey,
        value,
        sourceRef: bootstrap.resolution[rowKey as keyof typeof bootstrap.resolution]!
      })),
      ...acceptanceRows
    ].filter((row) => !(ALGORITHM_REGISTER_ROW_KEYS as readonly string[]).includes(row.rowKey));
    await sealVersion(BASE_ACCEPTANCE_REGISTER_VERSION, baseRows);
    const before = await readVersionSnapshot(BASE_ACCEPTANCE_REGISTER_VERSION);

    const receipt = await seedAcceptanceRegister(database.pool);

    expect(ACCEPTANCE_REGISTER_VERSION).toBeGreaterThan(BASE_ACCEPTANCE_REGISTER_VERSION);
    expect(await readVersionSnapshot(BASE_ACCEPTANCE_REGISTER_VERSION)).toEqual(before);
    const current = await readVersionSnapshot(ACCEPTANCE_REGISTER_VERSION);
    expect(current.version).toEqual({ row_count: receipt.rowCount, sealed: true });
    for (const rowKey of ALGORITHM_REGISTER_ROW_KEYS) {
      expect(current.rows.map((row) => row.row_key), rowKey).toContain(rowKey);
    }
  }, 120_000);

  /**
   * D77 (c) · O2 — what a STANDING ceremony database does with the refit.
   *
   * `seedAcceptanceRegister` imports the ceremony rows into a PINNED version
   * (`ACCEPTANCE_REGISTER_VERSION`) through `importHistorical`, and that path is
   * replay-only: a version that already exists must match the supplied snapshot
   * byte for byte (`migrations/0055_register_support_publication.sql:1343-1374`).
   * Sealed therefore means immutable PER VERSION — the seed can neither
   * overwrite nor merge — so a refit IS a new version. The pin moves and the
   * owner's standing version is left exactly as their run left it, instead of
   * the standing data directory being reset and the run database destroyed.
   *
   * The version below is a LITERAL, never the pin: it is the version the
   * owner's standing database holds (the 2026-09-17 run `d7b73d79`), and it
   * must keep saying 2 the next time the pin moves.
   */
  const STANDING_ACCEPTANCE_REGISTER_VERSION = 2;

  it("mints the refit beside a standing version sealed with the pre-refit thresholds", async () => {
    const supersededRef = `${ACCEPTANCE_ALGORITHM_SOURCE_REF}+${RULING_GOAL}`;
    const standingRows = (await buildAcceptanceRegisterPublicationRows()).map((row) => {
      if (row.rowKey === "globalStopDelta") {
        return registerFixtureRow(row.rowKey, { kind: "GLOBAL_STOP_DELTA", delta: 0.02 }, supersededRef);
      }
      if (row.rowKey === "branchFreezeEpsilon") {
        return registerFixtureRow(row.rowKey, { kind: "BRANCH_FREEZE_EPSILON", epsilon: 0.01 }, supersededRef);
      }
      return row;
    });
    await importHistoricalRegisterFixture(
      database.pool, STANDING_ACCEPTANCE_REGISTER_VERSION, standingRows
    );
    const before = await readVersionSnapshot(STANDING_ACCEPTANCE_REGISTER_VERSION);

    const receipt = await seedAcceptanceRegister(database.pool);

    // The refit lands in a NEW sealed version beside the standing one.
    expect(ACCEPTANCE_REGISTER_VERSION).toBeGreaterThan(STANDING_ACCEPTANCE_REGISTER_VERSION);
    const current = await readVersionSnapshot(ACCEPTANCE_REGISTER_VERSION);
    expect(current.version).toEqual({ row_count: receipt.rowCount, sealed: true });
    // Never re-opened: the owner's run database keeps the pair its run used.
    expect(await readVersionSnapshot(STANDING_ACCEPTANCE_REGISTER_VERSION)).toEqual(before);

    const policy = await loadAlgorithmPolicy();
    await expect(
      policy.readAdaptiveStoppingControls(database.pool, STANDING_ACCEPTANCE_REGISTER_VERSION)
    ).resolves.toMatchObject({ delta: 0.02, epsilon: 0.01 });
    const refitted = await policy.readAdaptiveStoppingControls(database.pool, ACCEPTANCE_REGISTER_VERSION);
    expect(refitted).toMatchObject({ delta: 0.01, epsilon: 0.005 });
    expect(refitted.sourceRefs).toEqual({
      globalStopDelta: `${ACCEPTANCE_ALGORITHM_SOURCE_REF}+${RULING_D77}`,
      branchFreezeEpsilon: `${ACCEPTANCE_ALGORITHM_SOURCE_REF}+${RULING_D77}`
    });
  }, 120_000);

  it("seeds a FRESH ceremony database at the pin alone, inventing no earlier version", async () => {
    const receipt = await seedAcceptanceRegister(database.pool);

    const current = await readVersionSnapshot(ACCEPTANCE_REGISTER_VERSION);
    expect(current.version).toEqual({ row_count: receipt.rowCount, sealed: true });
    // `import_historical_register_version` creates exactly the version it is
    // given: no base, no contiguity requirement, nothing below it imported
    // (`migrations/0055_register_support_publication.sql:1343-1409`). So on a
    // fresh database the versions under the pin simply never exist.
    for (const absent of [1, STANDING_ACCEPTANCE_REGISTER_VERSION]) {
      const snapshot = await readVersionSnapshot(absent);
      expect(snapshot.version, `version ${absent}`).toBeUndefined();
      expect(snapshot.rows, `version ${absent}`).toEqual([]);
    }
    const policy = await loadAlgorithmPolicy();
    await expect(policy.readAdaptiveStoppingControls(database.pool, ACCEPTANCE_REGISTER_VERSION))
      .resolves.toMatchObject({ delta: 0.01, epsilon: 0.005 });
  }, 120_000);
});

// ---------------------------------------------------------------------------
// B3 / ruling J7 · the warning must fire on the SEEDING ENTRYPOINT's real
// process path, not only inside a library reader a test calls directly.
// ---------------------------------------------------------------------------

const cliRoots: string[] = [];

afterEach(async () => {
  await Promise.all(cliRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function runSeedingCli(extra: NodeJS.ProcessEnv): Promise<Readonly<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}>> {
  const sourceRoot = process.cwd();
  const cwd = await mkdtemp(join(tmpdir(), "debateai-t16-cli-"));
  cliRoots.push(cwd);
  await mkdir(join(cwd, ".local", "dev-auth"), { recursive: true, mode: 0o700 });
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    MIGRATION_DATABASE_URL: database.connectionString,
    DEBATEAI_DEV_PROVIDER_TARGETS_JSON: TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson,
    ...extra
  };
  delete environment.FORCE_COLOR;
  delete environment.NO_COLOR;
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--import",
      createRequire(import.meta.url).resolve("tsx"),
      join(sourceRoot, "apps", "runner", "src", "dev-deployment-register-cli.ts")
    ], { cwd, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

const countWarnings = (text: string): number =>
  text.split("SYNTHESIS_ROLE_REFS_IDENTICAL").length - 1;

describe("T16 startup warning on the seeding entrypoint (ruling J7)", () => {
  it("warns exactly once on the dev seeding CLI's own process path when the role refs are identical", async () => {
    const cli = await runSeedingCli({
      DEBATEAI_DEV_SYNTHESIZER_ROLE_REF: "development:codex-cli",
      DEBATEAI_DEV_EVALUATOR_ROLE_REF: "development:codex-cli"
    });
    expect(cli.exitCode).toBe(0);
    expect(cli.stdout).toContain("DEV_DEPLOYMENT_REGISTER_RECEIPT_V1=");
    expect(countWarnings(cli.stderr)).toBe(1);
    expect(cli.stderr).toContain("development:codex-cli");
    expect(cli.stderr).not.toContain(database.connectionString);
  }, 120_000);

  it("prints no warning on the dev seeding CLI's process path when the role refs differ", async () => {
    const cli = await runSeedingCli({});
    expect(cli.exitCode).toBe(0);
    expect(cli.stdout).toContain("DEV_DEPLOYMENT_REGISTER_RECEIPT_V1=");
    expect(countWarnings(cli.stderr)).toBe(0);
    expect(cli.stderr).toBe("");
  }, 120_000);

  it("rejects a role-ref override that names no configured provider", async () => {
    const cli = await runSeedingCli({
      DEBATEAI_DEV_SYNTHESIZER_ROLE_REF: "development:not-configured"
    });
    expect(cli.exitCode).not.toBe(0);
    expect(cli.stderr).toContain("DEV_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED");
  }, 120_000);

  it("warns on the acceptance seeding path when its role refs are identical", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const previous = {
      synthesizer: process.env.ACCEPTANCE_SYNTHESIZER_ROLE_REF,
      evaluator: process.env.ACCEPTANCE_EVALUATOR_ROLE_REF
    };
    process.env.ACCEPTANCE_SYNTHESIZER_ROLE_REF = "acceptance:codex-cli";
    process.env.ACCEPTANCE_EVALUATOR_ROLE_REF = "acceptance:codex-cli";
    try {
      await seedAcceptanceRegister(database.pool);
    } finally {
      if (previous.synthesizer === undefined) delete process.env.ACCEPTANCE_SYNTHESIZER_ROLE_REF;
      else process.env.ACCEPTANCE_SYNTHESIZER_ROLE_REF = previous.synthesizer;
      if (previous.evaluator === undefined) delete process.env.ACCEPTANCE_EVALUATOR_ROLE_REF;
      else process.env.ACCEPTANCE_EVALUATOR_ROLE_REF = previous.evaluator;
    }
    const emitted = warn.mock.calls.filter((call) =>
      String(call[0]).includes("SYNTHESIS_ROLE_REFS_IDENTICAL"));
    expect(emitted).toHaveLength(1);
  }, 120_000);

  it("stays silent on the acceptance seeding path with its derived differing refs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await seedAcceptanceRegister(database.pool);
    expect(warn.mock.calls.filter((call) =>
      String(call[0]).includes("SYNTHESIS_ROLE_REFS_IDENTICAL"))).toHaveLength(0);
  }, 120_000);
});
