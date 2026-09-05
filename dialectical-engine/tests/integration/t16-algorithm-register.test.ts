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
  loadBootstrapRegister
} from "../../packages/register/src/index.js";
import {
  DEVELOPMENT_REGISTER_VERSION,
  buildDevelopmentDeploymentRegisterRows,
  buildDevelopmentRunnerRegisterRows,
  seedDevelopmentDeploymentRegister
} from "../../apps/runner/src/dev-deployment-register.js";
import {
  ACCEPTANCE_REGISTER_VERSION,
  buildAcceptanceRegisterRows,
  seedAcceptanceRegister
} from "../../acceptance/seed-register.js";
import { EXPANSION_DEPTH_MAX } from "@debateai/contract";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
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
const RULING_J1 = "algorithm-live-loop-DECISIONS.md#J1";
const RULING_J8 = "algorithm-live-loop-DECISIONS.md#J8+configured-provider-set-derivation";
const RULING_BANDS =
  "algorithm-live-loop-DECISIONS.md#J1+packages/register/src/engine-shape.ts#ENGINE_BAND_ORDER";
const RULING_FAMILY_MAP = "algorithm-live-loop-DECISIONS.md#J1+register:configuredProviderSet";
const RULING_ENVELOPE =
  "goal-v4-2026-09-01:285-295+packages/register/src/engine-shape.ts#ENGINE_BRANCHING_FACTOR";

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
  { family: "stopping", rowKey: "globalStopDelta", rulingRef: RULING_GOAL, value: { kind: "GLOBAL_STOP_DELTA", delta: 0.02 } },
  { family: "stopping", rowKey: "branchFreezeEpsilon", rulingRef: RULING_GOAL, value: { kind: "BRANCH_FREEZE_EPSILON", epsilon: 0.01 } },
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

beforeEach(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterEach(async () => {
  vi.restoreAllMocks();
  if (database !== undefined) await database.stop();
});

/**
 * The migration declares WHICH versions must carry the manifest (dev 5,
 * ceremony 2); historical versions are deliberately ungoverned. A scratch
 * version used to probe the assertion must therefore declare itself first.
 */
async function declareManifestVersion(registerVersion: number): Promise<void> {
  await database.pool.query(
    `INSERT INTO register.required_row_version (register_version,profile)
     VALUES ($1,'t16-test:scratch') ON CONFLICT (register_version) DO NOTHING`,
    [registerVersion]
  );
}

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
      // EXACT, not contains: a row must name the ruling that chose ITS value.
      expect(row?.source_ref, expected.rowKey)
        .toBe(`${DEVELOPMENT_ALGORITHM_SOURCE_REF}+${expected.rulingRef}`);
    }
  });

  it("cites J1 on exactly the five values J1 ruled and J8 on the two role identities", async () => {
    await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL
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

  it("refuses to seal a register version that omits any algorithm row family", async () => {
    for (const [index, omitted] of T16_FAMILIES.entries()) {
      const registerVersion = 900 + index;
      const kept = T16_EXPECTED_ROWS.filter((row) => row.family !== omitted);
      const omittedKeys = T16_EXPECTED_ROWS
        .filter((row) => row.family === omitted)
        .map((row) => row.rowKey);
      await declareManifestVersion(registerVersion);
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

  it("leaves a version the manifest does not govern untouched", async () => {
    // Historical versions (dev 4, ceremony 1) are ungoverned by construction.
    await expect(database.pool.query("SELECT register.assert_required_rows($1)", [4]))
      .resolves.toBeDefined();
    await expect(database.pool.query("SELECT register.assert_required_rows($1)", [1]))
      .resolves.toBeDefined();
  });

  it("accepts a register version that carries every algorithm row family", async () => {
    await declareManifestVersion(950);
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
  for (const row of rows) {
    await database.pool.query(
      `INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
       VALUES ($1,$2,$3::jsonb,$4)`,
      [registerVersion, row.rowKey, JSON.stringify(row.value), row.sourceRef]
    );
  }
  await database.pool.query(
    `INSERT INTO register.register_version (register_version,row_count,sealed) VALUES ($1,$2,true)`,
    [registerVersion, rows.length]
  );
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
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL
    });

    // A NEW identity, never the sealed one that already existed.
    expect(receipt.registerVersion).toBeGreaterThan(BASE_DEVELOPMENT_REGISTER_VERSION);
    expect(receipt.registerVersion).toBe(DEVELOPMENT_REGISTER_VERSION);
    expect(await readVersionSnapshot(BASE_DEVELOPMENT_REGISTER_VERSION)).toEqual(before);
    const current = await readVersionSnapshot(receipt.registerVersion);
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
    expect(cli.stdout).toContain("DEV_DEPLOYMENT_REGISTER_READY=");
    expect(countWarnings(cli.stderr)).toBe(1);
    expect(cli.stderr).toContain("development:codex-cli");
    expect(cli.stderr).not.toContain(database.connectionString);
  }, 120_000);

  it("prints no warning on the dev seeding CLI's process path when the role refs differ", async () => {
    const cli = await runSeedingCli({});
    expect(cli.exitCode).toBe(0);
    expect(cli.stdout).toContain("DEV_DEPLOYMENT_REGISTER_READY=");
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
