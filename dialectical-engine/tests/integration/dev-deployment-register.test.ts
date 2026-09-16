import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chmod, link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadModelConfig } from "@debateai/model-config";
import { readDeploymentMakerCapability } from "../../packages/critique/src/index.js";
import { createPool, migrate, type Pool } from "../../packages/db/src/index.js";
import {
  assertBootstrapEquality,
  computeRegisterSnapshotSha256,
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
  buildDevelopmentDeploymentRegisterHistoricalRows,
  buildDevelopmentDeploymentRegisterPublicationRows,
  createDevelopmentDeploymentRegisterMachineReceipt,
  DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX,
  DEVELOPMENT_REGISTER_VERSION,
  DEVELOPMENT_SOURCE_REF,
  developmentPlanTierRosters,
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
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import {
  buildDevelopmentProviderPanel,
  DEVELOPMENT_UNAVAILABLE_CLI_MODEL,
  developmentProviderSlots,
  loadModelConfigConfiguredProviders,
  type DevelopmentProviderPanel
} from "../../apps/runner/src/dev-provider-panel.js";
import {
  importHistoricalRegisterFixture,
  registerFixtureRow,
  TEST_PLAN_TIER_ROSTERS
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

const PRE_S03_DEVELOPMENT_PROVIDER_PANEL = Object.freeze({
  requiredDistinctMakers: 1,
  configuredProviders: Object.freeze([
    Object.freeze({
      adapterKind: "openai-compatible-http" as const,
      maker: "OpenAI",
      providerRef: "development:codex-cli"
    }),
    Object.freeze({
      adapterKind: "openai-compatible-http" as const,
      maker: "OpenAI",
      providerRef: "development:codex-premium-cli"
    }),
    Object.freeze({
      adapterKind: "openai-compatible-http" as const,
      maker: "Anthropic",
      providerRef: "development:claude-cli"
    }),
    Object.freeze({
      adapterKind: "openai-compatible-http" as const,
      maker: "Anthropic",
      providerRef: "development:claude-premium-cli"
    }),
    Object.freeze({
      adapterKind: "openai-compatible-http" as const,
      maker: "xAI",
      providerRef: "development:grok-cli"
    })
  ])
}) as DevelopmentProviderPanel;

async function preS03DevelopmentV4Rows() {
  return Object.freeze((await buildDevelopmentDeploymentRegisterPublicationRows(
    await loadBootstrapRegister(),
    PRE_S03_DEVELOPMENT_PROVIDER_PANEL,
    TEST_PLAN_TIER_ROSTERS
  )).filter(({ rowKey }) => rowKey !== "planTierRosters"));
}

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
  await mkdir(join(cwd, "config"), { mode: 0o700 });
  await writeFile(join(cwd, "config", "models.yaml"), [
    "free:",
    "  - api: openai",
    "    model: gpt-5.6-luna",
    "    base_url: https://api.openai.com/v1",
    "    key: OPENAI_API_KEY",
    "  - api: zai",
    "    model: glm-5.3-flash",
    "    base_url: https://api.z.ai/api/coding/paas/v4",
    "    key: ZAI_API_KEY",
    "premium:",
    "  - cli: codex",
    "    model: gpt-5.6-sol",
    "  - cli: claude",
    "    model: claude-opus-5",
    "  - cli: grok",
    "    model: grok-4.6-build",
    ""
  ].join("\n"), { mode: 0o600 });
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
  it("accepts the exact pre-S03 sealed v4 without replay drift or byte changes", async () => {
    // Property: a correct historical v4 remains immutable and valid after S03 is installed.
    // Break caught: feeding today's provider/roster rows back through importHistorical(version 4).
    const historicalRows = await preS03DevelopmentV4Rows();
    expect(historicalRows).toHaveLength(32);
    expect(computeRegisterSnapshotSha256(historicalRows))
      .toBe("42b90bca671d96d6e1c53de5c3115ca2ab7a5e11b33ad0d9eb0437f44a32c6eb");
    await createPostgresRegisterPublicationPort(database.pool).importHistorical({
      registerVersion: parseRegisterVersionText("4"),
      rows: historicalRows
    });
    const before = await database.pool.query(
      "SELECT row_key,value_json,source_ref FROM register.register_row WHERE register_version=4 ORDER BY row_key"
    );

    await expect(seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      repositoryRoot
    })).resolves.toMatchObject({
      registerVersion: "4",
      rowCount: 32,
      snapshotSha256: "42b90bca671d96d6e1c53de5c3115ca2ab7a5e11b33ad0d9eb0437f44a32c6eb"
    });
    expect((await database.pool.query(
      "SELECT row_key,value_json,source_ref FROM register.register_row WHERE register_version=4 ORDER BY row_key"
    )).rows).toEqual(before.rows);
  });

  it("publishes the current provider and roster rows once across an identical second restart", async () => {
    // Property: current file-owned rows supersede v4 by publication, and an equal restart is a no-op.
    // Break caught: allocating a new GENERAL version when the latest receipt already has the snapshot.
    const historicalRows = await preS03DevelopmentV4Rows();
    const historical = await createPostgresRegisterPublicationPort(database.pool).importHistorical({
      registerVersion: parseRegisterVersionText("4"),
      rows: historicalRows
    });
    await writeDevelopmentDeploymentRegisterReceipt(
      repositoryRoot,
      createDevelopmentDeploymentRegisterMachineReceipt(historical)
    );
    const first = await publishDevelopmentDeploymentRegisterProviderSet({
      adminPool: database.pool,
      planTierRosters: TEST_PLAN_TIER_ROSTERS,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot,
      baseRegisterVersion: parseRegisterVersionText("4")
    });
    expect(first.registerVersion).toBe("5");
    expect((await database.pool.query<{ row_key: string }>(
      "SELECT row_key FROM register.register_row WHERE register_version=$1 AND row_key IN ('configuredProviderSet','planTierRosters') ORDER BY row_key",
      [first.registerVersion]
    )).rows).toEqual([
      { row_key: "configuredProviderSet" },
      { row_key: "planTierRosters" }
    ]);
    const countAfterFirst = await database.pool.query(
      "SELECT count(*)::int AS count FROM register.register_version"
    );

    const second = await publishDevelopmentDeploymentRegisterProviderSet({
      adminPool: database.pool,
      planTierRosters: TEST_PLAN_TIER_ROSTERS,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      repositoryRoot,
      baseRegisterVersion: first.registerVersion
    });
    expect(second).toEqual(first);
    expect((await database.pool.query(
      "SELECT count(*)::int AS count FROM register.register_version"
    )).rows).toEqual(countAfterFirst.rows);
  });

  it("adds exactly one plan-tier roster row from the file model ids", () => {
    const config = loadModelConfig(process.cwd());
    const planTierRosters = Object.freeze({
      free: Object.freeze(config.free.map(({ model }) => model)),
      premium: Object.freeze(config.premium.map(({ model }) => model))
    });
    const rows = buildDevelopmentDeploymentRegisterRows(
      TEST_DEVELOPMENT_PROVIDER_PANEL,
      planTierRosters
    );
    expect(rows).toHaveLength(
      rows.filter(({ rowKey }) => rowKey !== "planTierRosters").length + 1
    );
    expect(rows.filter(({ rowKey }) => rowKey === "planTierRosters")).toEqual([{
      rowKey: "planTierRosters",
      value: {
        kind: "PLAN_TIER_ROSTERS",
        free: planTierRosters.free,
        premium: planTierRosters.premium
      },
      sourceRef: DEVELOPMENT_SOURCE_REF
    }]);
  });

  it("keeps publication rows byte-identical when API keys appear", async () => {
    const config = loadModelConfig(process.cwd());
    const configuredProviders = loadModelConfigConfiguredProviders(process.cwd());
    const withoutKeys = buildDevelopmentProviderPanel(
      developmentProviderSlots(config).map((slot) => ({
        providerRef: slot.providerRef,
        baseUrl: slot.transport === "cli"
          ? `http://127.0.0.1:${slot.port}/v1`
          : slot.baseUrl!,
        model: slot.transport === "cli" ? slot.model : DEVELOPMENT_UNAVAILABLE_CLI_MODEL,
        ...(slot.transport === "cli" ? { authorizationHeader: "test-cli-header" } : {})
      })),
      configuredProviders
    );
    const withKeys = buildDevelopmentProviderPanel(
      developmentProviderSlots(config).map((slot) => ({
        providerRef: slot.providerRef,
        baseUrl: slot.transport === "cli"
          ? `http://127.0.0.1:${slot.port}/v1`
          : slot.baseUrl!,
        model: slot.model,
        authorizationHeader: slot.transport === "cli" ? "test-cli-header" : "Bearer test-api-key"
      })),
      configuredProviders
    );
    const bootstrap = await loadBootstrapRegister();
    const planTierRosters = developmentPlanTierRosters(config);
    await expect(buildDevelopmentDeploymentRegisterPublicationRows(
      bootstrap,
      withoutKeys,
      planTierRosters
    )).resolves.toEqual(await buildDevelopmentDeploymentRegisterPublicationRows(
      bootstrap,
      withKeys,
      planTierRosters
    ));
  });

  it("publishes a smaller configured provider set after a file entry is removed", async () => {
    const config = loadModelConfig(process.cwd());
    const smallerConfig = {
      ...config,
      premium: config.premium.filter((entry) =>
        entry.transport !== "cli" || entry.cli !== "grok"
      )
    } as typeof config;
    const panelFor = (selected: typeof config) => {
      const slots = developmentProviderSlots(selected);
      return buildDevelopmentProviderPanel(slots.map((slot) => ({
        providerRef: slot.providerRef,
        baseUrl: slot.transport === "cli"
          ? `http://127.0.0.1:${slot.port}/v1`
          : slot.baseUrl!,
        model: DEVELOPMENT_UNAVAILABLE_CLI_MODEL
      })), slots.map(({ providerRef, adapterKind, maker }) => ({
        providerRef, adapterKind, maker
      })));
    };
    const currentPanel = panelFor(config);
    const smallerPanel = panelFor(smallerConfig);
    const currentRows = await buildDevelopmentDeploymentRegisterPublicationRows(
      await loadBootstrapRegister(),
      currentPanel,
      developmentPlanTierRosters(config)
    );
    const smallerRows = await buildDevelopmentDeploymentRegisterPublicationRows(
      await loadBootstrapRegister(),
      smallerPanel,
      developmentPlanTierRosters(smallerConfig)
    );
    const configuredRow = (rows: typeof currentRows) => rows.find(
      ({ rowKey }) => rowKey === "configuredProviderSet"
    )!;
    expect(configuredRow(smallerRows)).not.toEqual(configuredRow(currentRows));
    expect((JSON.parse(configuredRow(smallerRows).valueJsonText) as {
      providers: unknown[];
    }).providers).toHaveLength(4);

    await expect(publishDevelopmentDeploymentRegisterProviderSet({
      adminPool: undefined as never,
      planTierRosters: developmentPlanTierRosters(smallerConfig),
      providerPanel: smallerPanel,
      repositoryRoot,
      baseRegisterVersion: parseRegisterVersionText("4"),
      operations: {
        publishGeneral: async (input) => ({
          registerVersion: parseRegisterVersionText("5"),
          baseRegisterVersion: input.baseRegisterVersion,
          publicationId: input.publicationId,
          publicationKind: "GENERAL",
          requestSha256: "0".repeat(64),
          snapshotSha256: computeRegisterSnapshotSha256(input.rows),
          rowCount: input.rows.length,
          recordedAt: new Date(0)
        })
      }
    })).resolves.toMatchObject({ registerVersion: "5" });
  });

  it("initializes the complete 16-key development support snapshot enabled from the explicit deployed receipt", async () => {
    const deployed = await seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
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

      expect(deployed.registerVersion).toBe("4");
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
      repositoryRoot
    });
    expect(first.registerVersion).toBe(String(DEVELOPMENT_REGISTER_VERSION));
    expect(first.rowCount).toBeGreaterThan(
      buildDevelopmentDeploymentRegisterHistoricalRows().length
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

  it("rejects partial or conflicting state instead of completing or resealing it", async () => {
    await importHistoricalRegisterFixture(database.pool, 4, [
      registerFixtureRow("riskTier", "casual", "fixture:partial")
    ]);
    expect((await database.pool.query(
      "SELECT row_key FROM register.register_row WHERE register_version=$1",
      [DEVELOPMENT_REGISTER_VERSION]
    )).rows).toEqual([{ row_key: "riskTier" }]);
    await expect(seedDevelopmentDeploymentRegister({
      adminPool: database.pool,
      repositoryRoot
    }))
      .rejects.toThrow("REGISTER_PUBLICATION_SEAL_INVALID");
    expect((await database.pool.query(
      "SELECT row_key FROM register.register_row WHERE register_version=$1",
      [DEVELOPMENT_REGISTER_VERSION]
    )).rows).toEqual([{ row_key: "riskTier" }]);
    expect((await database.pool.query(
      "SELECT register_version FROM register.register_version WHERE register_version=$1",
      [DEVELOPMENT_REGISTER_VERSION]
    )).rows).toEqual([{ register_version: String(DEVELOPMENT_REGISTER_VERSION) }]);
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
        repositoryRoot
      })
    ));
    expect(new Set(receipts.map((receipt) => JSON.stringify(receipt))).size).toBe(1);
  }, 120_000);
});
