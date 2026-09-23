import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chmod, link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDeploymentMakerCapability } from "../../packages/critique/src/index.js";
import {
  createPool,
  migrate,
  RunRepository,
  type Pool
} from "../../packages/db/src/index.js";
import {
  assertBootstrapEquality,
  createPostgresRegisterPublicationPort,
  loadBootstrapRegister,
  parseCanonicalRegisterJson,
  persistBootstrapRegister,
  readAuthPolicy,
  readDeploymentRiskTier,
  readMfaPolicy,
  readLivenessPolicy,
  readPanelDiscoveryPolicy,
  readProductRolePolicy,
  readRecoveryPolicy,
  readSessionPolicy,
  readStructuralCeilingPolicyInputs,
  SUPPORT_CONFIGURATION_KEYS,
  registerVersionToSafeLegacyNumber
} from "../../packages/register/src/index.js";
import {
  buildDevelopmentDeploymentRegisterRows,
  createDevelopmentDeploymentRegisterMachineReceipt,
  DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX,
  DEVELOPMENT_REGISTER_VERSION,
  developmentDeploymentRegisterReceiptPath,
  parseDevelopmentDeploymentRegisterCliOutput,
  readDevelopmentDeploymentRegisterReceipt,
  publishDevelopmentDeploymentRegisterProviderSet,
  seedDevelopmentDeploymentRegister,
  serializeDevelopmentDeploymentRegisterReceipt,
  writeDevelopmentDeploymentRegisterReceipt
} from "../../apps/runner/src/dev-deployment-register.js";
import { provisionDevelopmentDatabasePrincipals } from
  "../../apps/runner/src/dev-database-principals.js";
import { parseRegisterVersionText } from "../../packages/register/src/register-publication.js";
import { readDevelopmentRunnerPolicy } from "../../apps/runner/src/dev-runner-policy.js";
// T3C (F33): the production policy path must supply T3's panel family, so this
// file builds the shipped composition and drives it at the claim gate.
import {
  createPostgresProviderGateway,
  WalkingSkeletonRunner
} from "../../apps/runner/src/index.js";
import { createInitialBatteryRows, WorkItemRepository } from "../../packages/battery/src/index.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { observeProviderTarget } from "../../packages/providers/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import {
  importHistoricalRegisterFixture,
  registerFixtureRow
} from "../support/registerFixtures.js";

let database: TestDatabase;
let repositoryRoot: string;
const temporaryRoots: string[] = [];

const DEVELOPMENT_SUPPORT_VALUE_TEXT = Object.freeze<Record<string, string>>({
  support_enabled: "true",
  support_model_ref: '"development:claude-cli"',
  support_relay_concurrency: "2",
  support_daily_call_cap: "500",
  support_limit_anon_msgs_10m: "20",
  support_limit_anon_msgs_24h: "100",
  support_limit_anon_sessions_1h: "5",
  support_limit_session_msgs: "40",
  support_limit_msg_chars: "2000",
  support_limit_account_msgs_10m: "60",
  support_limit_account_msgs_24h: "300",
  support_queue_depth: "10",
  support_lock_after_injections: "3",
  support_ip_cooldown_minutes: "60",
  support_retention_policy: '"keep"',
  support_retention_ratified_by: "null"
});

function developmentOperatorUrl(credentialSource: string): string {
  const rows = new Map(credentialSource.trim().split("\n").map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) throw new TypeError("TEST_CREDENTIAL_LINE_INVALID");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
  const credential = new URL(rows.get("SUPPORT_CONFIG_OPERATOR_DATABASE_URL")!);
  const fixtureUrl = new URL(database.connectionString);
  fixtureUrl.username = credential.username;
  fixtureUrl.password = credential.password;
  return fixtureUrl.toString();
}

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
  repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-dev-register-receipt-"));
  temporaryRoots.push(repositoryRoot);
  await mkdir(join(repositoryRoot, ".local", "dev-auth"), { recursive: true, mode: 0o700 });
}, 120_000);

afterEach(async () => {
  if (database !== undefined) await database.stop();
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("DEV-05 complete development deployment register", () => {
  it("preserves selected synthesis roles through a real provider-set publication", async () => {
    const configured = TEST_DEVELOPMENT_PROVIDER_PANEL.configuredProviders;
    const roleRefs = {
      synthesizerRoleRef: configured[configured.length - 1]!.providerRef,
      evaluatorRoleRef: configured[0]!.providerRef
    };
    const first = await seedDevelopmentDeploymentRegister({
      adminPool: database.pool, providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot, roleRefs
    });
    const before = await database.pool.query(
      "SELECT row_key, value_json, source_ref FROM register.register_row WHERE register_version=$1 AND row_key IN ('synthesizerRoleRef','evaluatorRoleRef') ORDER BY row_key",
      [first.registerVersion]
    );
    const published = await publishDevelopmentDeploymentRegisterProviderSet({
      adminPool: database.pool, providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot, baseRegisterVersion: parseRegisterVersionText(first.registerVersion)
    });
    const after = await database.pool.query(
      "SELECT row_key, value_json, source_ref FROM register.register_row WHERE register_version=$1 AND row_key IN ('synthesizerRoleRef','evaluatorRoleRef') ORDER BY row_key",
      [published.registerVersion]
    );
    expect(before.rows).toHaveLength(2);
    expect(after.rows).toEqual(before.rows);
  });

  it("initializes the complete 16-key development support snapshot enabled from the explicit deployed receipt", async () => {
    const deployed = await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    });
    const publicationId = randomUUID();
    const sourceRef = "deployment:development-initial-on";
    const patch = SUPPORT_CONFIGURATION_KEYS.map((key) => ({
      key,
      valueJsonText: parseCanonicalRegisterJson(
        Buffer.from(DEVELOPMENT_SUPPORT_VALUE_TEXT[key]!)
      )
    }));
    const credentialFilePath = join(
      repositoryRoot, ".local", "dev-auth", "database-principals.env"
    );
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const operatorPool = createPool(developmentOperatorUrl(
      await readFile(credentialFilePath, "utf8")
    ));
    try {
      const port = createPostgresRegisterPublicationPort(operatorPool);
      const receipt = await port.publishSupport({
        publicationId,
        baseRegisterVersion: deployed.registerVersion,
        expectedSupportRegisterVersion: null,
        schemaVersion: 1,
        patch,
        sourceRef
      });
      const commitAcknowledgedAt = new Date();

      expect(BigInt(deployed.registerVersion)).toBeGreaterThan(4n);
      expect(receipt.baseRegisterVersion).toBe(deployed.registerVersion);
      expect(receipt.previousSupportRegisterVersion).toBeNull();
      expect(receipt.publicationId).toBe(publicationId);
      expect(receipt.changedKeys).toEqual([...SUPPORT_CONFIGURATION_KEYS].sort());
      expect(typeof receipt.registerVersion).toBe("string");
      expect(receipt.recordedAt.getTime()).toBeLessThanOrEqual(commitAcknowledgedAt.getTime());
      const status = await port.readSupportStatus();
      expect(status).toMatchObject({
        supportRegisterVersion: receipt.registerVersion,
        baseRegisterVersion: deployed.registerVersion,
        schemaVersion: 1,
        publicationId,
        changedKeys: [...SUPPORT_CONFIGURATION_KEYS].sort(),
        sourceRef
      });
      const configuration = JSON.parse(status!.configurationText) as readonly Readonly<{
        row_key: string;
        value_json_text: string;
      }>[];
      expect(configuration).toHaveLength(16);
      expect(configuration.map((row) => row.row_key).sort())
        .toEqual([...SUPPORT_CONFIGURATION_KEYS].sort());
      expect(configuration.find((row) => row.row_key === "support_enabled"))
        .toMatchObject({ value_json_text: "true" });

      await expect(operatorPool.query(`
        INSERT INTO register.register_row(register_version,row_key,value_json,source_ref)
        VALUES(4,'operator-direct-dml','true'::jsonb,'deployment:forbidden')
      `)).rejects.toMatchObject({ code: "42501" });
      await expect(port.publishGeneral({
        publicationId: randomUUID(),
        baseRegisterVersion: deployed.registerVersion,
        rows: [{
          rowKey: "operatorGeneralWrite",
          valueJsonText: parseCanonicalRegisterJson(Buffer.from("true")),
          sourceRef: "deployment:forbidden-general"
        }],
        sourceRef: "deployment:forbidden-general"
      })).rejects.toMatchObject({ code: "42501" });
    } finally {
      await operatorPool.end();
    }
  }, 120_000);

  it.each([
    { label: "zero bytes", size: 0 },
    { label: "4097 bytes", size: 4_097 }
  ])("refuses a current-owner 0600 existing receipt of $label without overwriting it", async ({ size }) => {
    const receipt = createDevelopmentDeploymentRegisterMachineReceipt({
      registerVersion: parseRegisterVersionText("424242"),
      rowCount: 32,
      snapshotSha256: "a".repeat(64)
    });
    const path = developmentDeploymentRegisterReceiptPath(repositoryRoot);
    const original = Buffer.alloc(size, "x");
    await writeFile(path, original, { mode: 0o600 });
    const before = await stat(path);
    expect({
      file: before.isFile(),
      uid: before.uid,
      nlink: before.nlink,
      mode: before.mode & 0o777,
      size: before.size
    }).toEqual({
      file: true,
      uid: process.getuid?.(),
      nlink: 1,
      mode: 0o600,
      size
    });

    await expect(writeDevelopmentDeploymentRegisterReceipt(repositoryRoot, receipt))
      .rejects.toThrow("DEV_DEPLOYMENT_REGISTER_RECEIPT_CUSTODY_INVALID");
    expect(await readFile(path)).toEqual(original);
    expect((await stat(path)).size).toBe(size);
  });

  it.each([1, 4_096])("replaces a valid-custody existing receipt at the %i-byte neighbor", async (size) => {
    const receipt = createDevelopmentDeploymentRegisterMachineReceipt({
      registerVersion: parseRegisterVersionText("424242"),
      rowCount: 32,
      snapshotSha256: "a".repeat(64)
    });
    const path = developmentDeploymentRegisterReceiptPath(repositoryRoot);
    await writeFile(path, Buffer.alloc(size, "x"), { mode: 0o600 });

    await expect(writeDevelopmentDeploymentRegisterReceipt(repositoryRoot, receipt))
      .resolves.toBe(path);
    expect(await readFile(path, "utf8"))
      .toBe(`${serializeDevelopmentDeploymentRegisterReceipt(receipt)}\n`);
  });

  it("preserves a future receipt byte-for-byte and rejects malformed hash or custody", async () => {
    const receipt = createDevelopmentDeploymentRegisterMachineReceipt({
      registerVersion: parseRegisterVersionText("424242"),
      rowCount: 32,
      snapshotSha256: "a".repeat(64)
    });
    const path = await writeDevelopmentDeploymentRegisterReceipt(repositoryRoot, receipt);
    const serialized = serializeDevelopmentDeploymentRegisterReceipt(receipt);
    expect(path).toBe(developmentDeploymentRegisterReceiptPath(repositoryRoot));
    expect(await readFile(path, "utf8")).toBe(`${serialized}\n`);
    expect(await readDevelopmentDeploymentRegisterReceipt(repositoryRoot)).toEqual(receipt);
    await expect(parseDevelopmentDeploymentRegisterCliOutput(
      `${DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX}${serialized}\n`,
      repositoryRoot
    )).resolves.toEqual(receipt);

    await writeFile(path, `${serialized.replace(receipt.receiptSha256, "0".repeat(64))}\n`, {
      mode: 0o600
    });
    await expect(readDevelopmentDeploymentRegisterReceipt(repositoryRoot))
      .rejects.toThrow("DEV_DEPLOYMENT_REGISTER_RECEIPT_INVALID");

    await writeFile(path, `${serialized}\n`, { mode: 0o600 });
    await chmod(path, 0o644);
    await expect(readDevelopmentDeploymentRegisterReceipt(repositoryRoot))
      .rejects.toThrow("DEV_DEPLOYMENT_REGISTER_RECEIPT_CUSTODY_INVALID");

    await chmod(path, 0o600);
    await link(path, `${path}.hardlink`);
    await expect(readDevelopmentDeploymentRegisterReceipt(repositoryRoot))
      .rejects.toThrow("DEV_DEPLOYMENT_REGISTER_RECEIPT_CUSTODY_INVALID");
  });

  it("preserves an internally consistent sealed historical bootstrap while publishing current v4", async () => {
    const bootstrap = await loadBootstrapRegister();
    await importHistoricalRegisterFixture(database.pool, 1, [
      registerFixtureRow("riskTier", "casual", "historical:dev-register-v1")
    ]);

    await expect(seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    })).resolves.toMatchObject({ registerVersion: String(DEVELOPMENT_REGISTER_VERSION) });
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
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    });
    expect(first.registerVersion).toBe(String(DEVELOPMENT_REGISTER_VERSION));
    expect(first.rowCount).toBeGreaterThan(
      buildDevelopmentDeploymentRegisterRows(TEST_DEVELOPMENT_PROVIDER_PANEL).length
    );

    await expect(assertBootstrapEquality(database.pool, bootstrap)).resolves.toBeUndefined();
    const registerVersion = registerVersionToSafeLegacyNumber(first.registerVersion);
    const [auth, mfa, session, recovery, roles, makers, discovery, structural, risk] = await Promise.all([
      readAuthPolicy(database.pool, registerVersion),
      readMfaPolicy(database.pool, registerVersion),
      readSessionPolicy(database.pool, registerVersion),
      readRecoveryPolicy(database.pool, registerVersion),
      readProductRolePolicy(database.pool, registerVersion),
      readDeploymentMakerCapability(database.pool, registerVersion),
      readPanelDiscoveryPolicy(database.pool, registerVersion),
      readStructuralCeilingPolicyInputs(database.pool, registerVersion),
      readDeploymentRiskTier(database.pool, registerVersion)
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
        { providerRef: "development:codex-premium-cli", maker: "OpenAI" },
        { providerRef: "development:claude-cli", maker: "Anthropic" },
        { providerRef: "development:claude-premium-cli", maker: "Anthropic" },
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
    await expect(readLivenessPolicy(database.pool, registerVersion, "standard"))
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
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
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

    const policy = await readDevelopmentRunnerPolicy(database.pool, registerVersion);
    expect(Object.keys(policy.compositionRow.value.entries).sort()).toEqual([
      "causal", "comparative", "definitional", "empirical", "mixed", "normative",
      "prediction", "unknown"
    ]);
    expect(policy.compositionBudgets).toMatchObject({
      low: { bound: 10_000, registerVersion },
      medium: { bound: 20_000, registerVersion },
      high: { bound: 30_000, registerVersion }
    });
    expect(policy.bandCeiling.value).toMatchObject({
      bandOrder: ["CAPPED", "FULL"],
      defaultCeiling: { ceilingBand: "FULL" }
    });
    expect(policy.judgementPolicy.selectionRule).toMatchObject({
      kind: "MAXIMIZE_WEIGHTED_TAU",
      registerVersion
    });
    expect(policy.scoringOperator).toMatchObject({ deploymentRowValue: "accumulate" });
    expect(policy.runDeathPolicy).toEqual({
      cooldownMs: 600_000,
      finalRetryAttempts: 1,
      maxCooldownHoldsPerRun: 2
    });
    expect(policy.hiddenNodeScoreThreshold.value).toBe(0.35);
    for (const value of Object.values(policy.hashes)) expect(value).toMatch(/^[a-f0-9]{64}$/u);

    // S06 B1 (codex r1): the sealed T16 verdict-label family IS present in this
    // deployment — the dev seeder writes it. The production policy reader must
    // therefore RETURN it, so the runner entry point can pass it. Before this
    // fix the family was sealed and the only production reader never looked,
    // which is a different failure from a genuinely unresolved family: the run
    // spent judgement and propagation and only then stopped.
    expect(policy.verdictLabelPolicy).toMatchObject({
      registerVersion: registerVersionToSafeLegacyNumber(first.registerVersion),
      gamma: 0.05,
      highCut: 0.7,
      lowCut: 0.35,
      disagreementThreshold: 0.25
    });
    // T3C / F33: the sealed T16 PANEL family is present in this deployment too —
    // the same seeder writes it (dispersionScale, repeatedFamilyMultiplier,
    // downgradeBands, providerFamilyMap), and the disagreement threshold it pairs
    // with comes from the verdict-label family. The production policy reader must
    // therefore RETURN it, or the shipped entry point cannot run a panel at all:
    // J12's claim-time gate refuses every multi-maker work item on a deployment
    // that is, in fact, correctly sealed.
    expect(policy.panelPolicy).toMatchObject({
      registerVersion: registerVersionToSafeLegacyNumber(first.registerVersion),
      dispersionScale: 1,
      repeatedFamilyMultiplier: 0.5,
      disagreementThreshold: 0.25,
      unmappedReason: "PROVIDER_FAMILY_UNMAPPED"
    });
    // The band downgrade map is TOTAL over the seeded vocabulary, and the family
    // map is the deployment's own configured provider set — neither invented here.
    expect(Object.keys(policy.panelPolicy.oneStepDown).length).toBeGreaterThan(0);
    expect(policy.panelPolicy.providerFamilies.length).toBeGreaterThan(0);
    for (const rowKey of [
      "dispersionScale", "repeatedFamilyMultiplier", "downgradeBands", "providerFamilyMap"
    ]) {
      expect(policy.panelPolicy.sourceRefs[rowKey]).toContain(
        "DEV-T16-algorithm-register.md#goal-v4:80-96"
      );
    }

    // Provenance travels with the values — the row refs are the dev algorithm
    // deployment's, not invented here and not the runner-policy deployment's.
    for (const rowKey of [
      "verdictMarginGamma", "verdictHighCut", "verdictLowCut",
      "disagreementThreshold", "disagreementQuantity"
    ]) {
      expect(policy.verdictLabelPolicy.sourceRefs[rowKey]).toContain(
        "DEV-T16-algorithm-register.md#goal-v4:80-96"
      );
    }

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
      stdout: `${DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX}${
        serializeDevelopmentDeploymentRegisterReceipt(first)
      }\n`,
      stderr: ""
    });
    expect(cli.stdout).not.toContain(database.connectionString);
  }, 120_000);

  /**
   * T3C / F33 — the BEHAVIOURAL consequence, at the shipped composition.
   *
   * The deployment below is correctly sealed: the seeder wrote every T16 panel
   * row. The runner is built the way `apps/runner/src/main.ts` builds it — from
   * `readDevelopmentRunnerPolicy` — and handed a MULTI-MAKER work item. Today it
   * refuses at J12's claim-time gate with PANEL_WEIGHTING_UNRESOLVED, not because
   * the rows are missing but because this caller never reads them. That is the
   * whole defect: a sealed deployment that cannot run a panel.
   *
   * The gate fires BEFORE any provider call, so the gateways below point at a
   * port nothing is listening on — if the run ever reached them the test would
   * fail on a transport error instead, which is itself the assertion that no
   * spend happens here.
   */
  it("F33 — the policy the shipped entry point loads lets a multi-maker run past the panel gate", async () => {
    const seeded = await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    });
    const policy = await readDevelopmentRunnerPolicy(database.pool, registerVersionToSafeLegacyNumber(seeded.registerVersion));
    const questionLine = `t3c-panel-gate-${randomBytes(6).toString("hex")}`;
    const runId = await new RunRepository(database.pool).startRun({
      questionLine, principal: { kind: "legacy", legacyAskerId: `asker:${questionLine}` },
      sessionId: `session:${questionLine}`, callerScope: "ASKER",
      asOf: new Date("2026-09-02T00:00:00.000Z"), askerRiskTier: "casual",
      effectiveRiskTier: "casual", tierSource: "ASKER",
      tierProvenanceRef: `asker-declaration:${questionLine}`, compositionBudgetTier: "low",
      depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 1,
      envelopeBasis: fixtureStructuralCeiling(10, 2, 1),
      registerVersion: registerVersionToSafeLegacyNumber(seeded.registerVersion), batteryVersion: "s00",
      batteryRows: createInitialBatteryRows({ settlementWatchHandle: `settlement-watch:${questionLine}` })
    });
    const workItemId = await new WorkItemRepository(database.pool).enqueue({
      runId, batteryRowId: "Q1", nodeSet: [], commandKey: `t3c:${runId}`
    });
    const unreachable = (model: string) => createPostgresProviderGateway(database.pool, {
      endpoint: "http://127.0.0.1:9", model, maker: model
    });
    const runner = new WalkingSkeletonRunner(database.pool, unreachable("maker:primary"), {
      // The claim must cover the dev policy's own call deadlines and cooldown
      // holds, or CLAIM_BOUND_MISMATCH fires BEFORE the panel gate and this test
      // would pass while proving nothing (it did, on the first attempt).
      workerId: "runner:t3c", claimMs: 2_000_000, claimMarginMs: 1_000,
      judgeBound: policy.bounds.JUDGE, composerBound: policy.bounds.COMPOSER,
      conformanceBound: policy.bounds.CONFORMANCE,
      providerRef: "provider:t3c:primary", maker: "maker:primary",
      // T9 x board F33 — the class closure. `synthesisRolePolicy` is REQUIRED on
      // WalkingSkeletonSettings, so a deployment or fixture can no longer omit the
      // family the runner refuses over: omission is a compile error, not a claim-time
      // surprise. Provisioning only — this refusal fires on an EARLIER gate, and both
      // refs name this fixture's own configured provider (identical refs stay lawful,
      // goal 84-85), so no assertion here changes.
      synthesisRolePolicy: {
        registerVersion: 1,
        synthesizerRoleRef: "provider:t3c:primary",
        evaluatorRoleRef: "provider:t3c:primary",
        evaluatorLoopMaxRounds: 3,
        identicalRoleRefs: true,
        // W10/3: provisioning only — this fixture's refusal fires on an EARLIER
        // gate and no synthesis call is made, so the values only have to exist
        // and stay inside the claim the fixture declares.
        synthesizerBound: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 },
        evaluatorBound: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 },
        sourceRefs: {
          synthesizerRoleRef: "test-layer:J8",
          evaluatorRoleRef: "test-layer:J8",
          evaluatorLoopMaxRounds: "test-layer:goal-v4:80-96"
        }
      },
      critique: {
        provider: unreachable("maker:secondary"),
        providerRef: "provider:t3c:secondary", maker: "maker:secondary"
      },
      judgeContractHash: policy.hashes.judge, composerContractHash: policy.hashes.composer,
      conformanceContractHash: policy.hashes.conformance,
      propagationContractHash: policy.hashes.propagation, serveContractHash: policy.hashes.serve,
      maxRecompose: 2, factBundleVersion: registerVersionToSafeLegacyNumber(seeded.registerVersion),
      judgementNumberKind: "base-probability", judgementProducer: "judgement:t3c",
      propagationNumberKind: "propagated-probability", propagationProducer: "propagation:t3c",
      compositionRow: policy.compositionRow,
      servePolicy: {
        compositionBudgets: policy.compositionBudgets,
        candidateConfidenceBand: policy.candidateConfidenceBand,
        bandCeiling: policy.bandCeiling
      },
      judgementPolicy: policy.judgementPolicy,
      scoringOperator: policy.scoringOperator,
      runDeathPolicy: policy.runDeathPolicy,
      hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold,
      verdictLabelPolicy: policy.verdictLabelPolicy,
      // The line under test: the shipped composition passes what the reader loads.
      panelPolicy: policy.panelPolicy,
      // T7's claim-time gate fires before J12's panel gate on any multi-maker
      // run, so the mirror carries it too — see the merge note in dev-runner-policy.
      stoppingPolicy: policy.stoppingPolicy,
      resolveTerminalActivations: async ({ waitingRows }) => waitingRows.map((batteryRowId) => ({
        batteryRowId, state: "INACTIVE" as const,
        predicateInputs: { kind: "PRESENT", values: { fixture: "t3c", predicateResult: false } },
        skipEvidence: { kind: "PRESENT", evidenceType: "T3C", result: "FALSE_AT_COMPLETION" }
      }))
    });

    // The assertion pins the EXACT stop, not merely "not the panel one". Three
    // guards fire before J12's panel gate — CLAIM_BOUND_MISMATCH (settings),
    // SCORING_OPERATOR_UNRESOLVED and the verdict-label stop — and a
    // `not.toMatchObject` assertion is satisfied by ANY of them, so it would pass
    // while proving nothing. (It did, on the first attempt here: the run died on
    // CLAIM_BOUND_MISMATCH and never reached the gate.) Pinning the post-gate
    // stop makes every earlier failure a RED.
    await expect(runner.executeWorkItem(workItemId)).rejects.toMatchObject({
      // Reached only AFTER the claim-time gates pass: the two gateways point at a
      // closed port, so the claim-time provider probe finds the pinned panel empty.
      code: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM"
    });

    // ...and getting there cost nothing: the gates sit before any provider spend.
    const modelCalls = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ledger.ledger_entry
        WHERE run_id=$1 AND action_kind='MODEL_CALL' AND outcome='OK'`, [runId]
    );
    expect(modelCalls.rows[0]?.count).toBe("0");
  }, 120_000);

  /**
   * T3C / F34 — the claim-time re-probe, through the shipped composition.
   *
   * The discovered panel is pinned to the SAME provider refs the runner is
   * configured with, so `configured !== undefined` and the probe is the only
   * thing that can decide the members' fate. Both gateways point at a closed
   * port.
   *
   *   WITHOUT the probe (today): `state` stays HEALTHY, both members are trusted,
   *   nothing is recorded, and the run walks past the claim gate on a panel that
   *   is not there — the silent degradation F34 names.
   *
   *   WITH the probe: both come back ABSENT, one `core.provider_probe` row is
   *   written per member, the panel is revised to empty, and the run stops at
   *   RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM before any model call.
   *
   * The assertion pins BOTH halves — the stop identity and the recorded rows — so
   * neither an earlier failure nor a probe that runs without recording can pass it.
   */
  it("F34 — the claim-time re-probe detects and RECORDS a member absent since ask time", async () => {
    const seeded = await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    });
    const policy = await readDevelopmentRunnerPolicy(database.pool, registerVersionToSafeLegacyNumber(seeded.registerVersion));
    const questionLine = `t3c-f34-${randomBytes(6).toString("hex")}`;
    const runId = await new RunRepository(database.pool).startRun({
      questionLine, principal: { kind: "legacy", legacyAskerId: `asker:${questionLine}` },
      sessionId: `session:${questionLine}`, callerScope: "ASKER",
      asOf: new Date("2026-09-02T00:00:00.000Z"), askerRiskTier: "casual",
      effectiveRiskTier: "casual", tierSource: "ASKER",
      tierProvenanceRef: `asker-declaration:${questionLine}`, compositionBudgetTier: "low",
      depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 1,
      envelopeBasis: fixtureStructuralCeiling(10, 2, 1),
      registerVersion: registerVersionToSafeLegacyNumber(seeded.registerVersion), batteryVersion: "s00",
      batteryRows: createInitialBatteryRows({ settlementWatchHandle: `settlement-watch:${questionLine}` })
    });
    const workItemId = await new WorkItemRepository(database.pool).enqueue({
      runId, batteryRowId: "Q1", nodeSet: [], commandKey: `t3c-f34:${runId}`
    });
    // Closed port: every probe must come back ABSENT.
    const targets = [
      { providerRef: "provider:test-layer", maker: "maker:1", baseUrl: "http://127.0.0.1:9", model: "model:1" },
      { providerRef: "provider:test-layer:secondary", maker: "maker:2", baseUrl: "http://127.0.0.1:9", model: "model:2" }
    ] as const;
    const gateway = (model: string) => createPostgresProviderGateway(database.pool, {
      endpoint: "http://127.0.0.1:9", model, maker: model
    });
    const runner = new WalkingSkeletonRunner(database.pool, gateway("maker:1"), {
      workerId: "runner:t3c-f34", claimMs: 2_000_000, claimMarginMs: 1_000,
      judgeBound: policy.bounds.JUDGE, composerBound: policy.bounds.COMPOSER,
      conformanceBound: policy.bounds.CONFORMANCE,
      // The refs MATCH the discovered panel, so the probe decides.
      providerRef: "provider:test-layer", maker: "maker:1",
      // T9 x board F33 — the class closure. `synthesisRolePolicy` is REQUIRED on
      // WalkingSkeletonSettings, so a deployment or fixture can no longer omit the
      // family the runner refuses over: omission is a compile error, not a claim-time
      // surprise. Provisioning only — this refusal fires on an EARLIER gate, and both
      // refs name this fixture's own configured provider (identical refs stay lawful,
      // goal 84-85), so no assertion here changes.
      synthesisRolePolicy: {
        registerVersion: 1,
        synthesizerRoleRef: "provider:test-layer",
        evaluatorRoleRef: "provider:test-layer",
        evaluatorLoopMaxRounds: 3,
        identicalRoleRefs: true,
        // W10/3: provisioning only — this fixture's refusal fires on an EARLIER
        // gate and no synthesis call is made, so the values only have to exist
        // and stay inside the claim the fixture declares.
        synthesizerBound: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 },
        evaluatorBound: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 },
        sourceRefs: {
          synthesizerRoleRef: "test-layer:J8",
          evaluatorRoleRef: "test-layer:J8",
          evaluatorLoopMaxRounds: "test-layer:goal-v4:80-96"
        }
      },
      critique: {
        provider: gateway("maker:2"),
        providerRef: "provider:test-layer:secondary", maker: "maker:2"
      },
      judgeContractHash: policy.hashes.judge, composerContractHash: policy.hashes.composer,
      conformanceContractHash: policy.hashes.conformance,
      propagationContractHash: policy.hashes.propagation, serveContractHash: policy.hashes.serve,
      maxRecompose: 2, factBundleVersion: registerVersionToSafeLegacyNumber(seeded.registerVersion),
      judgementNumberKind: "base-probability", judgementProducer: "judgement:t3c",
      propagationNumberKind: "propagated-probability", propagationProducer: "propagation:t3c",
      compositionRow: policy.compositionRow,
      servePolicy: {
        compositionBudgets: policy.compositionBudgets,
        candidateConfidenceBand: policy.candidateConfidenceBand,
        bandCeiling: policy.bandCeiling
      },
      judgementPolicy: policy.judgementPolicy, scoringOperator: policy.scoringOperator,
      runDeathPolicy: policy.runDeathPolicy,
      hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold,
      verdictLabelPolicy: policy.verdictLabelPolicy, panelPolicy: policy.panelPolicy,
      stoppingPolicy: policy.stoppingPolicy,
      // Composed exactly as apps/runner/src/main.ts composes it, from the ONE
      // probe implementation ruling J21 moved into @debateai/providers.
      claimTimeProbe: async (member) => {
        const target = targets.find((candidate) => candidate.providerRef === member.provider_ref);
        if (target === undefined) {
          return { state: "ABSENT" as const, modelId: null, failureCode: "CLAIM_GATEWAY_UNRESOLVED" };
        }
        // OBSERVE only, exactly as apps/runner/src/main.ts composes it: the runner
        // owns persistence in both arms, so a persisting probe here writes the same
        // re-probe twice (codex r1 B1 — this arm's RED was 4 rows where 2 are right).
        const observation = await observeProviderTarget({
          target, timeoutMs: 1_000, fetchImplementation: fetch, clock: () => new Date()
        });
        return {
          state: observation.state, modelId: observation.modelId, failureCode: observation.failureCode
        };
      },
      resolveTerminalActivations: async ({ waitingRows }) => waitingRows.map((batteryRowId) => ({
        batteryRowId, state: "INACTIVE" as const,
        predicateInputs: { kind: "PRESENT", values: { fixture: "t3c-f34", predicateResult: false } },
        skipEvidence: { kind: "PRESENT", evidenceType: "T3C", result: "FALSE_AT_COMPLETION" }
      }))
    });

    const probedAtFloor = new Date();
    // Detected at claim: the revised panel is empty, so the run stops there —
    // before any model call, which is the whole point of a claim-time check.
    await expect(runner.executeWorkItem(workItemId)).rejects.toMatchObject({
      code: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM"
    });

    // ...and RECORDED: the probe wrote its verdict, so the absence is evidence
    // rather than a decision that left no trace.
    // ONE re-probe per member, ONE recorded row per member (codex r1 B1). The
    // earlier version of this assertion said DISTINCT provider_ref, which stayed
    // green while the composition wrote the SAME re-probe twice under two
    // independent-looking evidence refs — a deduplicating assertion cannot see a
    // duplication defect. Exact counts and identities, per member.
    const rows = await database.pool.query<{
      provider_ref: string; state: string; probe_id: string; failure_code: string | null;
    }>(
      `SELECT provider_ref, state, probe_id::text AS probe_id, failure_code
         FROM core.provider_probe
        WHERE provider_ref = ANY($1::text[]) AND probed_at >= $2
        ORDER BY provider_ref`,
      [targets.map((target) => target.providerRef), probedAtFloor]
    );
    // Exactly two rows for two members — not "at least", not deduplicated.
    expect(rows.rowCount).toBe(2);
    expect(rows.rows.map((row) => row.provider_ref))
      .toEqual([...targets.map((target) => target.providerRef)].sort());
    // One row each, every one an ABSENCE, each with its own evidence id.
    expect(rows.rows.every((row) => row.state === "ABSENT")).toBe(true);
    expect(new Set(rows.rows.map((row) => row.probe_id)).size).toBe(2);
    expect(rows.rows.every((row) => row.failure_code !== null)).toBe(true);

    const modelCalls = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ledger.ledger_entry
        WHERE run_id=$1 AND action_kind='MODEL_CALL' AND outcome='OK'`, [runId]
    );
    expect(modelCalls.rows[0]?.count).toBe("0");
  }, 120_000);

  /**
   * T3C — the PROVENANCE guard this lane extends, pinned on its own.
   *
   * The reader refuses a family whose rows were sealed by some OTHER deployment
   * under the same register version. That check already covered the verdict-label
   * rows; this lane adds the panel rows to it, and a guard nobody can fail is not
   * a guard.
   *
   * The first version of this test bent one row's `source_ref` and put it back.
   * `register.register_row` is append-only — UPDATE is rejected by trigger, not
   * merely revoked by grant — so that test failed with
   * "append-only or immutable table register_row rejects UPDATE". That refusal is
   * correct and I am not going to work around it: history is not editable, which
   * is the whole point of the table.
   *
   * The lawful seam is the READ. `readDevelopmentRunnerPolicy` takes a pool, so a
   * facade pool answers the register_row SELECT with one panel row bearing a
   * foreign deployment ref and passes everything else through untouched. Nothing
   * is written; the guard under test runs for real, against the real reader.
   */
  it("T3C — refuses a panel row sealed by a foreign deployment under the same version", async () => {
    const seeded = await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    });
    // Baseline: the untouched register reads cleanly.
    await expect(readDevelopmentRunnerPolicy(database.pool, registerVersionToSafeLegacyNumber(seeded.registerVersion)))
      .resolves.toBeDefined();

    const FOREIGN = "SOME-OTHER-DEPLOYMENT.md#not-ours";
    const facade = new Proxy(database.pool, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (property !== "query" || typeof value !== "function") {
          return typeof value === "function" ? value.bind(target) : value;
        }
        return async (...args: unknown[]) => {
          const result = await (value as (...a: unknown[]) => Promise<{
            rows: { row_key?: string; source_ref?: string }[];
          }>).apply(target, args);
          const text = typeof args[0] === "string" ? args[0] : "";
          if (!text.includes("register.register_row")) return result;
          // Exactly one panel row comes back sealed by another deployment.
          return {
            ...result,
            rows: result.rows.map((row) => row.row_key === "dispersionScale" && row.source_ref !== undefined
              ? { ...row, source_ref: FOREIGN }
              : row)
          };
        };
      }
    }) as typeof database.pool;

    await expect(readDevelopmentRunnerPolicy(facade, registerVersionToSafeLegacyNumber(seeded.registerVersion)))
      .rejects.toThrow("DEV_RUNNER_POLICY_PROVENANCE_INVALID");

    // The register itself was never touched — the guard was exercised, not the table.
    const untouched = await database.pool.query<{ source_ref: string }>(
      "SELECT source_ref FROM register.register_row WHERE register_version=$1 AND row_key='dispersionScale'",
      [registerVersionToSafeLegacyNumber(seeded.registerVersion)]
    );
    expect(untouched.rows[0]?.source_ref).toContain("DEV-T16-algorithm-register.md#goal-v4:80-96");
    await expect(readDevelopmentRunnerPolicy(database.pool, registerVersionToSafeLegacyNumber(seeded.registerVersion)))
      .resolves.toBeDefined();
  }, 120_000);

  it("preserves a differently shaped historical version and publishes a new complete snapshot", async () => {
    await importHistoricalRegisterFixture(database.pool, 4, [
      registerFixtureRow("riskTier", "casual", "fixture:partial")
    ]);
    const before = await database.pool.query("SELECT * FROM register.register_row WHERE register_version=4");
    const receipt = await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot
    });
    expect(BigInt(receipt.registerVersion)).toBeGreaterThan(4n);
    expect((await database.pool.query("SELECT * FROM register.register_row WHERE register_version=4")).rows)
      .toEqual(before.rows);
    expect((await readDeploymentRiskTier(database.pool, registerVersionToSafeLegacyNumber(receipt.registerVersion))).value)
      .toBe("standard");
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
        providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
        repositoryRoot
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
        providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
        repositoryRoot
      })
    ));
    expect(new Set(receipts.map((receipt) => JSON.stringify(receipt))).size).toBe(1);
  }, 120_000);
});
