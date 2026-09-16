// REV-S03-p3r-correctness-tests — the V-47 re-check probe, promoted.
// Written against head b97985a8 (integration/all, after the lane's merge of slice/tiers-s03 @ a25c0d99).
// Run it with REV-S03-p3r-correctness-tests-run-probe.sh, which takes the worktree root from
// $WORKTREE or argv and copies this file into <root>/tests/integration/ — never hard-coded.
// Re-derives V-47's regression WITHOUT trusting the FIX handoff or the author's fixtures:
// the historical v4 the code builds at this head is checked ROW BY ROW against the digests the
// orchestrator measured on V's live database (live/serve-merged-diag-v4-rows-a49d9734.log),
// then sealed into an embedded postgres and driven through the real start sequence.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadModelConfig } from "@debateai/model-config";
import { migrate } from "../../packages/db/src/index.js";
import {
  computeRegisterSnapshotSha256,
  createPostgresRegisterPublicationPort,
  loadBootstrapRegister
} from "../../packages/register/src/index.js";
import { parseRegisterVersionText } from "../../packages/register/src/register-publication.js";
import {
  buildDevelopmentDeploymentRegisterHistoricalPublicationRows,
  buildDevelopmentDeploymentRegisterPublicationRows,
  createDevelopmentDeploymentRegisterMachineReceipt,
  developmentPlanTierRosters,
  publishDevelopmentDeploymentRegisterProviderSet,
  readDevelopmentDeploymentRegisterReceipt,
  seedDevelopmentDeploymentRegister,
  writeDevelopmentDeploymentRegisterReceipt
} from "../../apps/runner/src/dev-deployment-register.js";
import {
  developmentConfiguredProviderPanel,
  loadModelConfigConfiguredProviders
} from "../../apps/runner/src/dev-provider-panel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const LIVE_V4_SNAPSHOT = "120bdfea9776cff519113d915694f02b1e4302a14a4282c8e6272a0bf09a5e96";
const LIVE_V9_SNAPSHOT = "42b90bca671d96d6e1c53de5c3115ca2ab7a5e11b33ad0d9eb0437f44a32c6eb";

type OracleRow = Readonly<{ rowKey: string; sha12: string; len: number; sourceRef: string }>;

// V's own dev database, register version 4, measured read-only by the orchestrator on 2026-09-16:
// .hermes/reports/debate-tiers/review-packages/S03-p3r/live/serve-merged-diag-v4-rows-a49d9734.log
const LIVE_V4_ORACLE: readonly OracleRow[] = Object.freeze([
  { rowKey: "acceptanceOrganCostBounds", sha12: "33e348618141", len: 255,
    sourceRef: "DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05" },
  { rowKey: "auditSourceIpKdfPolicy", sha12: "7788aeb12992", len: 132,
    sourceRef: "AMENDMENTS.md#VR-7 memory-hard immutable audit source-IP hashing (2026-08-19)" },
  { rowKey: "candidateConfidenceBand", sha12: "56c5bf528644", len: 6,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "channelPolicy", sha12: "f3147aa14d70", len: 13851,
    sourceRef: "AMENDMENTS.md#VR-5 own mail service, no relays + S3d D1/D4 delivery boundedness and honesty (2026-08-20) + T1 rework2 clamp-absorption decision_version 2 N*=3 at unchanged 45 ms from three fresh isolated repeats, sealed decision_version 1 N*=2 retained unaltered, N*=4 deliberately not claimed (2026-08-22) + T1 rework7-A decision_version 3 V-approved structural 103 admission budget and 28,000 ms registration mail-permit deadline with 18,000 ms retained for resend, decision_version 2 demoted to contradicted history and no positive current N* published (2026-08-22) + T1 decision_version 4 final hash-first 5700 ms lease availability remeasurement with decision_version 3 retained as superseded history and storage-overrun opacity residual (2026-08-25)" },
  { rowKey: "claimTypeCompositionMap", sha12: "205acc37cef6", len: 1606,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "composerContractHash", sha12: "c679fde7154a", len: 66,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "compositionBundleBudget", sha12: "89d2ff06b2c3", len: 41,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "configuredProviderSet", sha12: "cfbd6996c10b", len: 363,
    sourceRef: "DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05" },
  { rowKey: "conformanceContractHash", sha12: "4bdbbb104ebc", len: 66,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "hiddenNodeScoreThreshold", sha12: "a976726b1d1b", len: 4,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "judgeContractHash", sha12: "6c58650376a8", len: 66,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "judgementSelectionPolicy", sha12: "8fd8bc3f183b", len: 147,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "livenessPolicy", sha12: "251b0c5b64f4", len: 109,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "mfaPolicy", sha12: "3894b0da45e7", len: 477,
    sourceRef: "AMENDMENTS.md A3-7 + MFA RESEARCH M4/M5/M6/M11 + wave-3 P1-S4" },
  { rowKey: "nodeRuntimeVersion", sha12: "b00de7a4f9d7", len: 10,
    sourceRef: "node --version on 2026-08-07" },
  { rowKey: "panelDiscoveryPolicy", sha12: "3f1e4505c562", len: 84,
    sourceRef: "DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05" },
  { rowKey: "passwordPolicy", sha12: "6c45029ad162", len: 179,
    sourceRef: "wave-2-target-architecture.md#10.1 + VR-3/VR-4/VR-5 (2026-08-19)" },
  { rowKey: "pnpmVersion", sha12: "3f866b2ef94c", len: 9,
    sourceRef: "pnpm --version on 2026-08-07" },
  { rowKey: "postgresMajorVersion", sha12: "0234a350f4d5", len: 4,
    sourceRef: "embedded-postgres darwin-arm64 postgres --version on 2026-08-07" },
  { rowKey: "productRolePolicy", sha12: "b4343e9a5abc", len: 1343,
    sourceRef: "wave-2-target-architecture.md#11; wave-3-phase-1-plan.md#phase-2" },
  { rowKey: "propagationContractHash", sha12: "32c58b94c6db", len: 66,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "rateLimitPolicy", sha12: "c61db6142bf2", len: 4137,
    sourceRef: "AMENDMENTS.md#A3-10 + S3c D2 source-owned admission + S3c rework3 C1/C2 process provisioning bound and modelled collateral (2026-08-20)" },
  { rowKey: "recoveryPolicy", sha12: "977d29f5561f", len: 1737,
    sourceRef: "P2-01-account-recovery-state-machine.json; wave-2-target-architecture.md#10.3; MFA recovery research M15/M23" },
  { rowKey: "riskTier", sha12: "cb2842d6687d", len: 10,
    sourceRef: "DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05" },
  { rowKey: "runDeathPolicy", sha12: "e2a1ee02ace7", len: 140,
    sourceRef: "DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05" },
  { rowKey: "scoringOperator", sha12: "d6a941bb49c5", len: 12,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "serveContractHash", sha12: "ffedc397d9ee", len: 66,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" },
  { rowKey: "sessionPolicy", sha12: "fa0aa70a058e", len: 327,
    sourceRef: "DR-179; wave-2-target-architecture:session-security; S5-binding-contract" },
  { rowKey: "typescriptVersion", sha12: "fc74384c893a", len: 7,
    sourceRef: "pnpm exec tsc --version on 2026-08-07" },
  { rowKey: "verificationPolicy", sha12: "788c0b6aada7", len: 832,
    sourceRef: "wave-2-target-architecture.md#10.7 + VR-5 + S3c rework1 B1 outbound cap + S3d D2 credential non-interference (2026-08-20)" },
  { rowKey: "vllmImageDigest", sha12: "457ad5b4dcc2", len: 73,
    sourceRef: "Docker Hub registry API manifest HEAD for vllm/vllm-openai:latest on 2026-08-07" },
  { rowKey: "wayOfKnowingCeiling", sha12: "d416caf4be9b", len: 311,
    sourceRef: "DEV-12D-development-runner-policy.md#sealed-v2" }
]);


let database: TestDatabase;
let repositoryRoot: string;
const temporaryRoots: string[] = [];

// The EXACT SQL + digest the orchestrator's read-only diagnostic ran on V's database.
async function measureV4LikeTheDiagnostic(version: number): Promise<readonly OracleRow[]> {
  const result = await database.pool.query<{ row_key: string; v: string; source_ref: string }>(`
    SELECT row_key, register.canonical_json_text(value_json::text) AS v, source_ref
    FROM register.register_row WHERE register_version=$1 ORDER BY row_key
  `, [version]);
  return result.rows.map((row) => Object.freeze({
    rowKey: row.row_key,
    sha12: createHash("sha256").update(row.v).digest("hex").slice(0, 12),
    len: row.v.length,
    sourceRef: row.source_ref
  }));
}

async function versionList(): Promise<readonly string[]> {
  return (await database.pool.query<{ register_version: string }>(
    "SELECT register_version FROM register.register_version ORDER BY register_version"
  )).rows.map(({ register_version }) => register_version);
}

async function rowValue(version: string, rowKey: string): Promise<unknown> {
  const result = await database.pool.query<{ value_json: unknown }>(
    "SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2",
    [version, rowKey]
  );
  return result.rows[0]?.value_json;
}

// The panel and rosters the REAL start uses (dev-provider-set-publish-cli.ts:23-28),
// not the tests' TEST_ fixtures — the author's own idempotence case used the fixtures.
function realPanel() {
  return developmentConfiguredProviderPanel(loadModelConfigConfiguredProviders(process.cwd()));
}
function realRosters() {
  return developmentPlanTierRosters(loadModelConfig(process.cwd()));
}

beforeEach(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  repositoryRoot = await mkdtemp(join(tmpdir(), "rev-s03-p3r-correctness-"));
  temporaryRoots.push(repositoryRoot);
  await mkdir(join(repositoryRoot, ".local", "dev-auth"), { recursive: true, mode: 0o700 });
}, 180_000);

afterEach(async () => {
  if (database !== undefined) await database.stop();
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("REV-S03-p3r correctness — V-47 re-derived against V's own sealed v4", () => {
  it("A — the historical v4 this head builds IS the database's sealed v4, row by row", async () => {
    const rows = await buildDevelopmentDeploymentRegisterHistoricalPublicationRows(
      await loadBootstrapRegister()
    );
    expect(rows).toHaveLength(32);
    expect(computeRegisterSnapshotSha256(rows)).toBe(LIVE_V4_SNAPSHOT);
    expect(computeRegisterSnapshotSha256(rows)).not.toBe(LIVE_V9_SNAPSHOT);

    await createPostgresRegisterPublicationPort(database.pool).importHistorical({
      registerVersion: parseRegisterVersionText("4"),
      rows
    });
    expect(await measureV4LikeTheDiagnostic(4)).toEqual(LIVE_V4_ORACLE);
  }, 240_000);

  it("B — RED re-derived: the PRE-FIX row set drifts against that same sealed v4", async () => {
    const bootstrap = await loadBootstrapRegister();
    const port = createPostgresRegisterPublicationPort(database.pool);
    await port.importHistorical({
      registerVersion: parseRegisterVersionText("4"),
      rows: await buildDevelopmentDeploymentRegisterHistoricalPublicationRows(bootstrap)
    });
    // Exactly what the seed replayed before ef302060: today's panel + rosters at version 4.
    const preFixRows = await buildDevelopmentDeploymentRegisterPublicationRows(
      bootstrap, realPanel(), realRosters()
    );
    expect(preFixRows.some(({ rowKey }) => rowKey === "planTierRosters")).toBe(true);
    await expect(port.importHistorical({
      registerVersion: parseRegisterVersionText("4"),
      rows: preFixRows
    })).rejects.toThrow(/historical replay drift/u);
  }, 240_000);

  it("C — MUTANT: the five-slot set back in the historical v4 row — the drift returns", async () => {
    const bootstrap = await loadBootstrapRegister();
    const port = createPostgresRegisterPublicationPort(database.pool);
    const historical = await buildDevelopmentDeploymentRegisterHistoricalPublicationRows(bootstrap);
    await port.importHistorical({
      registerVersion: parseRegisterVersionText("4"), rows: historical
    });
    const fiveSlot = (await buildDevelopmentDeploymentRegisterPublicationRows(
      bootstrap, realPanel(), realRosters()
    )).find(({ rowKey }) => rowKey === "configuredProviderSet")!;
    const mutated = historical.map((row) =>
      row.rowKey === "configuredProviderSet" ? fiveSlot : row);
    expect(mutated).toHaveLength(32);
    expect(computeRegisterSnapshotSha256(mutated)).not.toBe(LIVE_V4_SNAPSHOT);
    await expect(port.importHistorical({
      registerVersion: parseRegisterVersionText("4"), rows: mutated
    })).rejects.toThrow(/historical replay drift/u);
  }, 240_000);

  it("D — GREEN + publication + a SECOND identical start, in one sequence", async () => {
    const bootstrap = await loadBootstrapRegister();
    await createPostgresRegisterPublicationPort(database.pool).importHistorical({
      registerVersion: parseRegisterVersionText("4"),
      rows: await buildDevelopmentDeploymentRegisterHistoricalPublicationRows(bootstrap)
    });
    const before = (await database.pool.query(
      "SELECT row_key,value_json,source_ref FROM register.register_row WHERE register_version=4 ORDER BY row_key"
    )).rows;
    // start 1, stage 1: the seed
    const seeded = await seedDevelopmentDeploymentRegister({
      adminPool: database.pool, repositoryRoot
    });
    expect(seeded).toMatchObject({
      registerVersion: "4", rowCount: 32, snapshotSha256: LIVE_V4_SNAPSHOT
    });
    expect((await database.pool.query(
      "SELECT row_key,value_json,source_ref FROM register.register_row WHERE register_version=4 ORDER BY row_key"
    )).rows).toEqual(before);
    // the seed persists the sealed bootstrap it accepts; it publishes NOTHING above v4
    const afterSeed = await versionList();
    expect(afterSeed.filter((version) => BigInt(version) > 4n)).toEqual([]);

    // start 1, stage 2: the publication
    const published = await publishDevelopmentDeploymentRegisterProviderSet({
      adminPool: database.pool,
      planTierRosters: realRosters(),
      providerPanel: realPanel(),
      repositoryRoot,
      baseRegisterVersion: parseRegisterVersionText(seeded.registerVersion)
    });
    expect(published.registerVersion).toBe("5");
    expect(published.rowCount).toBe(33);
    const afterPublish = await versionList();
    expect(afterPublish).toEqual([...afterSeed, "5"]);
    const config = loadModelConfig(process.cwd());
    expect(await rowValue(published.registerVersion, "planTierRosters")).toEqual({
      kind: "PLAN_TIER_ROSTERS",
      free: config.free.map(({ model }) => model),
      premium: config.premium.map(({ model }) => model)
    });
    const configured = await rowValue(published.registerVersion, "configuredProviderSet") as
      { providers: readonly { providerRef: string }[] };
    expect(configured.providers.map(({ providerRef }) => providerRef))
      .toEqual(realPanel().configuredProviders.map(({ providerRef }) => providerRef));
    expect(configured.providers.length).toBeGreaterThan(3);
    // the v4 rows never moved
    expect((await database.pool.query(
      "SELECT row_key,value_json,source_ref FROM register.register_row WHERE register_version=4 ORDER BY row_key"
    )).rows).toEqual(before);
    expect(await readDevelopmentDeploymentRegisterReceipt(repositoryRoot)).toEqual(published);

    // start 2: identical, from the receipt the first start left on disk
    const reseeded = await seedDevelopmentDeploymentRegister({
      adminPool: database.pool, repositoryRoot
    });
    expect(reseeded).toEqual(published);
    const republished = await publishDevelopmentDeploymentRegisterProviderSet({
      adminPool: database.pool,
      planTierRosters: realRosters(),
      providerPanel: realPanel(),
      repositoryRoot,
      baseRegisterVersion: parseRegisterVersionText(reseeded.registerVersion)
    });
    expect(republished).toEqual(published);
    expect(await versionList()).toEqual(afterPublish);
    expect(await readDevelopmentDeploymentRegisterReceipt(repositoryRoot)).toEqual(published);
  }, 300_000);

  it("E — a receipt that disagrees with the register is refused, not silently trusted", async () => {
    const bootstrap = await loadBootstrapRegister();
    await createPostgresRegisterPublicationPort(database.pool).importHistorical({
      registerVersion: parseRegisterVersionText("4"),
      rows: await buildDevelopmentDeploymentRegisterHistoricalPublicationRows(bootstrap)
    });
    await writeDevelopmentDeploymentRegisterReceipt(
      repositoryRoot,
      createDevelopmentDeploymentRegisterMachineReceipt({
        registerVersion: parseRegisterVersionText("4"),
        rowCount: 32,
        snapshotSha256: LIVE_V9_SNAPSHOT
      })
    );
    await expect(seedDevelopmentDeploymentRegister({
      adminPool: database.pool, repositoryRoot
    })).rejects.toThrow(/DEV_DEPLOYMENT_REGISTER_RECEIPT_REGISTER_MISMATCH/u);
  }, 240_000);
});
