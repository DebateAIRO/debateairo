import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDeploymentMakerCapability } from "../../packages/critique/src/index.js";
import { createPool, migrate, type Pool } from "../../packages/db/src/index.js";
import {
  assertBootstrapEquality,
  loadBootstrapRegister,
  persistBootstrapRegister,
  readAuthPolicy,
  readDeploymentRiskTier,
  readMfaPolicy,
  readLivenessPolicy,
  readPanelDiscoveryPolicy,
  readProductRolePolicy,
  readRecoveryPolicy,
  readSessionPolicy,
  readStructuralCeilingPolicyInputs
} from "../../packages/register/src/index.js";
import {
  buildDevelopmentDeploymentRegisterRows,
  DEVELOPMENT_REGISTER_VERSION,
  seedDevelopmentDeploymentRegister
} from "../../apps/runner/src/dev-deployment-register.js";
import { readDevelopmentRunnerPolicy } from "../../apps/runner/src/dev-runner-policy.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";

let database: TestDatabase;
const temporaryRoots: string[] = [];

async function runCli(environment: NodeJS.ProcessEnv): Promise<Readonly<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}>> {
  const sourceRoot = process.cwd();
  const cwd = await mkdtemp(join(tmpdir(), "debateai-dev-register-cli-"));
  temporaryRoots.push(cwd);
  await mkdir(join(cwd, ".local", "dev-auth"), { recursive: true, mode: 0o700 });
  const childEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    DEBATEAI_DEV_PROVIDER_TARGETS_JSON: TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson
  };
  delete childEnvironment.FORCE_COLOR;
  delete childEnvironment.NO_COLOR;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--import",
      createRequire(import.meta.url).resolve("tsx"),
      join(sourceRoot, "apps", "runner", "src", "dev-deployment-register-cli.ts")
    ], { cwd, env: childEnvironment, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

beforeEach(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterEach(async () => {
  if (database !== undefined) await database.stop();
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("DEV-05 complete development deployment register", () => {
  it("preserves an internally consistent sealed historical bootstrap while publishing current v4", async () => {
    const bootstrap = await loadBootstrapRegister();
    await database.pool.query(
      `INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
       VALUES ($1,'riskTier','"casual"'::jsonb,'historical:dev-register-v1')`,
      [bootstrap.registerVersion]
    );
    await database.pool.query(
      `INSERT INTO register.register_version (register_version,row_count,sealed)
       VALUES ($1,1,true)`,
      [bootstrap.registerVersion]
    );

    await expect(seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL
    })).resolves.toMatchObject({ registerVersion: DEVELOPMENT_REGISTER_VERSION });
    expect((await database.pool.query(
      "SELECT row_key,value_json,source_ref FROM register.register_row WHERE register_version=$1",
      [bootstrap.registerVersion]
    )).rows).toEqual([{
      row_key: "riskTier",
      value_json: "casual",
      source_ref: "historical:dev-register-v1"
    }]);
  });

  it("persists recovery and product-role policies inside an exact sealed bootstrap version", async () => {
    const bootstrap = await loadBootstrapRegister();
    await persistBootstrapRegister(database.pool, bootstrap);
    await expect(readRecoveryPolicy(database.pool, bootstrap.registerVersion)).resolves.toMatchObject({
      policyVersion: 1,
      publicResponse: "ENUMERATION_RESISTANT_GENERIC"
    });
    await expect(readProductRolePolicy(database.pool, bootstrap.registerVersion)).resolves.toMatchObject({
      policyVersion: 1,
      assignmentAuthority: "SERVER_DERIVED_ONLY",
      callerSuppliedRole: "DENIED",
      roles: [
        { id: "anonymous", implementation: "ACTIVE" },
        { id: "user", implementation: "ACTIVE" },
        { id: "operator", implementation: "RESERVED_UNASSIGNABLE", grants: [] },
        { id: "moderator", implementation: "UNIMPLEMENTED", grants: [] },
        { id: "support", implementation: "UNIMPLEMENTED", grants: [] },
        { id: "security_auditor", implementation: "UNIMPLEMENTED", grants: [] },
        { id: "db_operator", implementation: "UNIMPLEMENTED", grants: [] },
        { id: "worker_service", implementation: "EXISTING_REUSED", grants: [] }
      ],
      transitions: [{ fromRole: "anonymous", toRole: "user", implementation: "ACTIVE" }]
    });
    const version = (await database.pool.query<{
      row_count: number;
      actual_count: string;
      sealed: boolean;
    }>(`
      SELECT version.row_count,version.sealed,count(row.*)::text AS actual_count
      FROM register.register_version AS version
      JOIN register.register_row AS row USING (register_version)
      WHERE version.register_version=$1
      GROUP BY version.register_version,version.row_count,version.sealed
    `, [bootstrap.registerVersion])).rows[0];
    expect(version).toEqual({
      row_count: Number(version?.actual_count),
      actual_count: version?.actual_count,
      sealed: true
    });
    const before = await database.pool.query(
      "SELECT row_key,value_json,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key",
      [bootstrap.registerVersion]
    );
    await expect(persistBootstrapRegister(database.pool, bootstrap)).resolves.toBeUndefined();
    const after = await database.pool.query(
      "SELECT row_key,value_json,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key",
      [bootstrap.registerVersion]
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("seeds exactly every production API boot row, seals it, and reuses it unchanged", async () => {
    const bootstrap = await loadBootstrapRegister();
    const first = await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL
    });
    expect(first.registerVersion).toBe(DEVELOPMENT_REGISTER_VERSION);
    expect(first.rowCount).toBeGreaterThan(
      buildDevelopmentDeploymentRegisterRows(TEST_DEVELOPMENT_PROVIDER_PANEL).length
    );

    await expect(assertBootstrapEquality(database.pool, bootstrap)).resolves.toBeUndefined();
    const [auth, mfa, session, recovery, roles, makers, discovery, structural, risk] = await Promise.all([
      readAuthPolicy(database.pool, first.registerVersion),
      readMfaPolicy(database.pool, first.registerVersion),
      readSessionPolicy(database.pool, first.registerVersion),
      readRecoveryPolicy(database.pool, first.registerVersion),
      readProductRolePolicy(database.pool, first.registerVersion),
      readDeploymentMakerCapability(database.pool, first.registerVersion),
      readPanelDiscoveryPolicy(database.pool, first.registerVersion),
      readStructuralCeilingPolicyInputs(database.pool, first.registerVersion),
      readDeploymentRiskTier(database.pool, first.registerVersion)
    ]);
    expect(auth.channel.structuralMaximumConcurrentRegistrations).toBe(103);
    expect(mfa.totp.algorithm).toBe("SHA1");
    expect(session.absoluteTtlMs).toBeGreaterThan(session.idleTtlMs);
    expect(recovery).toMatchObject({
      policyVersion: 1,
      publicResponse: "ENUMERATION_RESISTANT_GENERIC",
      degradation: { T3RestrictionMs: 2_592_000_000 }
    });
    expect(roles.roles.map((role) => role.id)).toEqual([
      "anonymous", "user", "operator", "moderator", "support",
      "security_auditor", "db_operator", "worker_service"
    ]);
    expect(roles.roles.slice(2).every((role) => role.grants.length === 0)).toBe(true);
    expect(makers).toMatchObject({
      deploymentMakerCapability: true,
      configuredMakers: ["Anthropic", "OpenAI", "xAI"],
      configuredProviders: [
        { providerRef: "development:codex-cli", maker: "OpenAI" },
        { providerRef: "development:claude-cli", maker: "Anthropic" },
        { providerRef: "development:grok-cli", maker: "xAI" }
      ]
    });
    expect(discovery).toMatchObject({ probeFreshnessMs: 600_000, probeMaxAttempts: 1 });
    expect(structural).toEqual({
      judgeMaxAttempts: 3,
      organMaxAttempts: 3,
      finalRetryAttempts: 1,
      maxCooldownHoldsPerRun: 2
    });
    expect(risk.value).toBe("standard");
    await expect(readLivenessPolicy(database.pool, first.registerVersion, "standard"))
      .resolves.toMatchObject({ reviewAfterMs: 604_800_000, retireAfterMs: 15_552_000_000 });

    const sealed = (await database.pool.query<{
      row_count: number;
      actual_count: string;
      sealed: boolean;
    }>(`
      SELECT version.row_count,version.sealed,count(row.*)::text AS actual_count
      FROM register.register_version AS version
      JOIN register.register_row AS row USING (register_version)
      WHERE version.register_version=$1
      GROUP BY version.register_version,version.row_count,version.sealed
    `,[first.registerVersion])).rows[0];
    expect(sealed).toEqual({
      row_count: first.rowCount,
      actual_count: String(first.rowCount),
      sealed: true
    });
    const before = await database.pool.query<{
      row_key: string;
      value_json: unknown;
      source_ref: string;
    }>(`
      SELECT row_key,value_json,source_ref FROM register.register_row
      WHERE register_version=$1 ORDER BY row_key
    `,[first.registerVersion]);
    await expect(seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL
    }))
      .resolves.toEqual(first);
    const after = await database.pool.query<{
      row_key: string;
      value_json: unknown;
      source_ref: string;
    }>(`
      SELECT row_key,value_json,source_ref FROM register.register_row
      WHERE register_version=$1 ORDER BY row_key
    `,[first.registerVersion]);
    expect(after.rows).toEqual(before.rows);

    const policy = await readDevelopmentRunnerPolicy(database.pool, first.registerVersion);
    expect(Object.keys(policy.compositionRow.value.entries).sort()).toEqual([
      "causal", "comparative", "definitional", "empirical", "mixed", "normative",
      "prediction", "unknown"
    ]);
    expect(policy.compositionBudgets).toMatchObject({
      low: { bound: 10_000, registerVersion: first.registerVersion },
      medium: { bound: 20_000, registerVersion: first.registerVersion },
      high: { bound: 30_000, registerVersion: first.registerVersion }
    });
    expect(policy.bandCeiling.value).toMatchObject({
      bandOrder: ["CAPPED", "FULL"],
      defaultCeiling: { ceilingBand: "FULL" }
    });
    expect(policy.judgementPolicy.selectionRule).toMatchObject({
      kind: "MAXIMIZE_WEIGHTED_TAU",
      registerVersion: first.registerVersion
    });
    expect(policy.scoringOperator).toMatchObject({ deploymentRowValue: "accumulate" });
    expect(policy.runDeathPolicy).toEqual({
      cooldownMs: 600_000,
      finalRetryAttempts: 1,
      maxCooldownHoldsPerRun: 2
    });
    expect(policy.hiddenNodeScoreThreshold.value).toBe(0.35);
    for (const value of Object.values(policy.hashes)) expect(value).toMatch(/^[a-f0-9]{64}$/u);

    const legacyAfter = await database.pool.query(
      "SELECT row_key,value_json,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key",
      [bootstrap.registerVersion]
    );
    expect(legacyAfter.rows).toEqual((await database.pool.query(
      "SELECT row_key,value_json,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key",
      [bootstrap.registerVersion]
    )).rows);

    const cli = await runCli({
      ...process.env,
      MIGRATION_DATABASE_URL: database.connectionString
    });
    expect(cli).toEqual({
      exitCode: 0,
      stdout: `DEV_DEPLOYMENT_REGISTER_READY=${first.registerVersion}:${first.rowCount}\n`,
      stderr: ""
    });
    expect(cli.stdout).not.toContain(database.connectionString);
  }, 120_000);

  it("rejects partial or conflicting state instead of completing or resealing it", async () => {
    await database.pool.query(`
      INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
      VALUES ($1,'riskTier','"casual"'::jsonb,'fixture:partial')
    `, [DEVELOPMENT_REGISTER_VERSION]);
    expect((await database.pool.query(
      "SELECT row_key FROM register.register_row WHERE register_version=$1",
      [DEVELOPMENT_REGISTER_VERSION]
    )).rows).toEqual([{ row_key: "riskTier" }]);
    await expect(seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL
    }))
      .rejects.toThrow("DEV_DEPLOYMENT_REGISTER_DRIFT");
    expect((await database.pool.query(
      "SELECT row_key FROM register.register_row WHERE register_version=$1",
      [DEVELOPMENT_REGISTER_VERSION]
    )).rows).toEqual([{ row_key: "riskTier" }]);
    expect((await database.pool.query(
      "SELECT register_version FROM register.register_version WHERE register_version=$1",
      [DEVELOPMENT_REGISTER_VERSION]
    )).rows).toEqual([]);
  });

  it("serializes concurrent first invocation and refuses a service principal", async () => {
    const password = randomBytes(24).toString("base64url");
    const statement = await database.pool.query<{ sql: string }>(
      "SELECT format('CREATE ROLE debateai_dev_register_attacker LOGIN PASSWORD %L IN ROLE debateai_runtime',$1::text) AS sql",
      [password]
    );
    await database.pool.query(statement.rows[0]!.sql);
    const attackerUrl = new URL(database.connectionString);
    attackerUrl.username = "debateai_dev_register_attacker";
    attackerUrl.password = password;
    const attackerPool: Pool = createPool(attackerUrl.toString());
    try {
      await expect(seedDevelopmentDeploymentRegister({
        adminPool: attackerPool,
        providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL
      }))
        .rejects.toThrow("DEV_DEPLOYMENT_REGISTER_ADMIN_REQUIRED");
    } finally {
      await attackerPool.end();
    }

    expect((await database.pool.query(
      "SELECT count(*)::int AS count FROM register.register_version"
    )).rows).toEqual([{ count: 0 }]);
    const receipts = await Promise.all(Array.from({ length: 12 }, () =>
      seedDevelopmentDeploymentRegister({
        adminPool: database.pool,
        providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL
      })
    ));
    expect(new Set(receipts.map((receipt) => JSON.stringify(receipt))).size).toBe(1);
  }, 120_000);
});
