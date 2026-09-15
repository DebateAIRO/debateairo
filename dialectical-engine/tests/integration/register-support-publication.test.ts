import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, mkdtemp, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import type { Pool, PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPool, migrate } from "../../packages/db/src/index.js";
import {
  buildBootstrapRegisterPublicationRows,
  computeRegisterSnapshotSha256,
  createPostgresRegisterPublicationPort,
  loadBootstrapRegister,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  type RegisterPublicationRow,
  type SupportConfigurationKey
} from "../../packages/register/src/index.js";
import { createSupportConfigurationPort } from "../../packages/register/src/support-config.js";
import { seedDevelopmentDeploymentRegister, buildDevelopmentDeploymentRegisterPublicationRows } from
  "../../apps/runner/src/dev-deployment-register.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import {
  readLegacyDevelopmentV4Rows,
  DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256,
  LEGACY_REGISTER_V1_SNAPSHOT_SHA256
} from "../support/registerFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

type RegisterRowInput = Readonly<{
  row_key: string;
  value_json_text: string;
  source_ref: string;
}>;

type SupportPatch = Readonly<{
  key: string;
  value_json_text: string;
}>;

const SUPPORT_VALUES = Object.freeze<Record<string, string>>({
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

const baseRows = (sourceRef = "fixture:base"): RegisterRowInput[] => [
  ...Object.entries(SUPPORT_VALUES).map(([row_key, value_json_text]) => ({
    row_key, value_json_text, source_ref: sourceRef
  })),
  { row_key: "riskTier", value_json_text: '"standard"', source_ref: sourceRef }
];

const completeSupportPatch = (enabled: boolean): SupportPatch[] =>
  Object.entries(SUPPORT_VALUES).map(([key, value]) => ({
    key,
    value_json_text: key === "support_enabled" ? String(enabled) : value
  }));

async function applyMigrationsBeforeSupportPublication(pool: Pool): Promise<void> {
  const names = (await readdir("migrations"))
    .filter((name) => /^\d+.*[.]sql$/u.test(name) && name < "0055_register_support_publication.sql")
    .sort();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('debateai:schema-migrations', 0))");
    await client.query(`
      CREATE TABLE public.debateai_schema_migration (
        name text PRIMARY KEY CHECK (length(btrim(name)) > 0),
        applied_at timestamptz NOT NULL
      )
    `);
    for (const name of names) {
      await client.query(await readFile(`migrations/${name}`, "utf8"));
      await client.query(
        "INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())",
        [name]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function insertPre0055History(
  pool: Pool,
  version: "1" | "4" | "5",
  rows: readonly RegisterPublicationRow[]
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO register.register_version(register_version,row_count,sealed) VALUES($1,$2,true)",
      [version, rows.length]
    );
    for (const row of rows) {
      await client.query(
        "INSERT INTO register.register_row(register_version,row_key,value_json,source_ref) VALUES($1,$2,$3::jsonb,$4)",
        [version, row.rowKey, row.valueJsonText, row.sourceRef]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function readHistoricalBytes(pool: Pool): Promise<readonly Record<string, unknown>[]> {
  const result = await pool.query(`
    SELECT version.register_version::text AS register_version,
      version.row_count,version.sealed,row.row_key,
      encode(convert_to(row.value_json::text,'UTF8'),'hex') AS value_json_hex,
      encode(convert_to(row.source_ref,'UTF8'),'hex') AS source_ref_hex
    FROM register.register_version AS version
    JOIN register.register_row AS row USING(register_version)
    WHERE version.register_version IN (1,4)
    ORDER BY version.register_version,row.row_key
  `);
  return result.rows as readonly Record<string, unknown>[];
}

function lp(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  return Buffer.concat([length, bytes]);
}

function sha256(parts: readonly Buffer[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

function snapshotHash(rows: readonly RegisterRowInput[]): string {
  return sha256([...rows]
    .sort((left, right) => Buffer.compare(Buffer.from(left.row_key), Buffer.from(right.row_key)))
    .flatMap((row) => [lp(row.row_key), lp(row.value_json_text), lp(row.source_ref)]));
}

function generalRequestHash(input: Readonly<{
  publicationId: string;
  base: string;
  rows: readonly RegisterRowInput[];
  sourceRef: string;
}>): string {
  return sha256([
    lp(input.publicationId), lp("GENERAL"), lp(input.base),
    ...[...input.rows]
      .sort((left, right) => Buffer.compare(Buffer.from(left.row_key), Buffer.from(right.row_key)))
      .flatMap((row) => [lp(row.row_key), lp(row.value_json_text), lp(row.source_ref)]),
    lp(input.sourceRef)
  ]);
}

function supportRequestHash(input: Readonly<{
  publicationId: string;
  base: string;
  expected: string | null;
  patch: readonly SupportPatch[];
  sourceRef: string;
}>): string {
  return sha256([
    lp(input.publicationId), lp("SUPPORT_CONFIGURATION"), lp(input.base),
    lp(input.expected ?? ""), lp("1"), lp(JSON.stringify(input.patch)), lp(input.sourceRef)
  ]);
}

async function inTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
  role?: "debateai_runtime" | "debateai_support_config_operator" | "debateai_register_publication_owner"
): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    if (role !== undefined) await client.query(`SET LOCAL ROLE ${role}`);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function captureRolledBackError(
  operation: (client: PoolClient) => Promise<unknown>,
  role?: "debateai_runtime" | "debateai_support_config_operator" | "debateai_register_publication_owner"
): Promise<string | null> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    if (role !== undefined) await client.query(`SET LOCAL ROLE ${role}`);
    try {
      await operation(client);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function waitForAdvisoryBlock(backendPid: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const activity = await database.pool.query<{ wait_event_type: string | null; wait_event: string | null }>(`
      SELECT wait_event_type,wait_event
      FROM pg_catalog.pg_stat_activity
      WHERE pid=$1
    `, [backendPid]);
    if (activity.rows[0]?.wait_event_type === "Lock"
        && activity.rows[0]?.wait_event === "advisory") return;
    await delay(10);
  }
  throw new Error(`backend ${backendPid} did not block on the advisory lock`);
}

async function settleWithin<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    delay(5_000).then(() => {
      throw new Error(`${label} did not settle after lock release`);
    })
  ]);
}

async function importHistorical(
  version: string,
  rows: readonly RegisterRowInput[] = baseRows()
): Promise<Record<string, unknown>> {
  const result = await inTransaction((client) => client.query(
    `SELECT * FROM register.import_historical_register_version(
      $1::bigint,$2::jsonb,$3::char(64)
    )`,
    [version, JSON.stringify(rows), snapshotHash(rows)]
  ));
  return result.rows[0] as Record<string, unknown>;
}

async function publishGeneral(input: Readonly<{
  publicationId: string;
  base: string;
  rows: readonly RegisterRowInput[];
  sourceRef: string;
}>, client?: PoolClient): Promise<Record<string, unknown>> {
  const query = (executor: PoolClient) => executor.query(
    `SELECT * FROM register.publish_register_version(
      $1::uuid,$2::char(64),$3::bigint,$4::jsonb,$5::text
    )`,
    [input.publicationId, generalRequestHash(input), input.base, JSON.stringify(input.rows), input.sourceRef]
  ).then((result) => result.rows[0] as Record<string, unknown>);
  return client === undefined ? inTransaction(query) : query(client);
}

async function publishSupport(input: Readonly<{
  publicationId: string;
  base: string;
  expected: string | null;
  patch: readonly SupportPatch[];
  sourceRef: string;
}>, client?: PoolClient): Promise<Record<string, unknown>> {
  const query = (executor: PoolClient) => executor.query(
    `SELECT * FROM register.publish_support_configuration(
      $1::uuid,$2::char(64),$3::bigint,$4::bigint,1,$5::jsonb,$6::text
    )`,
    [
      input.publicationId, supportRequestHash(input), input.expected,
      input.base, JSON.stringify(input.patch), input.sourceRef
    ]
  ).then((result) => result.rows[0] as Record<string, unknown>);
  return client === undefined ? inTransaction(query) : query(client);
}

beforeEach(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterEach(async () => {
  if (database !== undefined) await database.stop();
});

describe("REGISTER-SUPPORT-PUBLICATION database contract", () => {
  it("preserves legacy algorithm version 5 while allocating and replaying the new development receipt", async () => {
    await database.stop();
    database = await startTestDatabase();
    await applyMigrationsBeforeSupportPublication(database.pool);
    const bootstrap = await loadBootstrapRegister();
    await insertPre0055History(database.pool, "1", buildBootstrapRegisterPublicationRows(bootstrap));
    const rows = await buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, TEST_DEVELOPMENT_PROVIDER_PANEL);
    await insertPre0055History(database.pool, "5", rows);
    const before = (await database.pool.query("SELECT * FROM register.register_row WHERE register_version=5 ORDER BY row_key")).rows;
    await migrate(database.pool);
    const repositoryRoot = await mkdtemp(join(tmpdir(), "dev-register-upgrade-"));
    try {
      await mkdir(join(repositoryRoot, ".local/dev-auth"), { recursive: true, mode: 0o700 });
      const input = { adminPool: database.pool, providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL, repositoryRoot };
      const receipt = await seedDevelopmentDeploymentRegister(input);
      expect(BigInt(receipt.registerVersion)).toBeGreaterThan(5n);
      expect(await seedDevelopmentDeploymentRegister(input)).toEqual(receipt);
      expect((await database.pool.query("SELECT * FROM register.register_row WHERE register_version=5 ORDER BY row_key")).rows).toEqual(before);
      expect((await database.pool.query("SELECT profile FROM register.required_row_version WHERE register_version=$1", [receipt.registerVersion])).rows).toHaveLength(1);
    } finally { await rm(repositoryRoot, { recursive: true, force: true }); }
  });

  it("allocates development after an existing support publication without changing the support head", async () => {
    const port = createPostgresRegisterPublicationPort(database.pool);
    await port.importHistorical({ registerVersion: parseRegisterVersionText("4"), rows: await readLegacyDevelopmentV4Rows() });
    const support = await port.publishSupport({
      publicationId: randomUUID(), baseRegisterVersion: parseRegisterVersionText("4"),
      expectedSupportRegisterVersion: null, schemaVersion: 1, sourceRef: "test:support-before-dev",
      patch: Object.entries(SUPPORT_VALUES).map(([key, value]) => ({ key: key as SupportConfigurationKey,
        valueJsonText: parseCanonicalRegisterJson(Buffer.from(value)) }))
    });
    const repositoryRoot = await mkdtemp(join(tmpdir(), "dev-register-support-upgrade-"));
    try {
      await mkdir(join(repositoryRoot, ".local/dev-auth"), { recursive: true, mode: 0o700 });
      const input = { adminPool: database.pool, providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL, repositoryRoot };
      const receipt = await seedDevelopmentDeploymentRegister(input);
      expect(BigInt(receipt.registerVersion)).toBeGreaterThan(BigInt(support.registerVersion));
      expect(await seedDevelopmentDeploymentRegister(input)).toEqual(receipt);
      expect((await port.readSupportStatus())?.supportRegisterVersion).toBe(support.registerVersion);
    } finally { await rm(repositoryRoot, { recursive: true, force: true }); }
  });

  it("upgrades exact historical v1/v4 bytes, initializes production off, ignores generic versions, and rolls back forward", async () => {
    await database.stop();
    database = await startTestDatabase();
    await applyMigrationsBeforeSupportPublication(database.pool);

    const bootstrap = await loadBootstrapRegister();
    const v1Rows = buildBootstrapRegisterPublicationRows(bootstrap);
    const v4Rows = await readLegacyDevelopmentV4Rows();
    expect(computeRegisterSnapshotSha256(v1Rows)).toBe(LEGACY_REGISTER_V1_SNAPSHOT_SHA256);
    expect(computeRegisterSnapshotSha256(v4Rows))
      .toBe(DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256);
    await insertPre0055History(database.pool, "1", v1Rows);
    await insertPre0055History(database.pool, "4", v4Rows);
    const historicalBefore = await readHistoricalBytes(database.pool);

    await migrate(database.pool);

    expect(await readHistoricalBytes(database.pool)).toEqual(historicalBefore);
    expect((await database.pool.query(`
      SELECT register_version::text,
        register._snapshot_sha256(register_version) AS snapshot_sha256
      FROM register.register_version WHERE register_version IN (1,4)
      ORDER BY register_version
    `)).rows).toEqual([
      { register_version: "1", snapshot_sha256: LEGACY_REGISTER_V1_SNAPSHOT_SHA256 },
      { register_version: "4", snapshot_sha256: DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256 }
    ]);
    expect((await database.pool.query(`
      SELECT register_version::text,base_register_version,publication_id,
        request_sha256,snapshot_sha256,publication_kind,recorded_at
      FROM register.register_version WHERE register_version IN (1,4)
      ORDER BY register_version
    `)).rows).toEqual([
      { register_version: "1", base_register_version: null, publication_id: null,
        request_sha256: null, snapshot_sha256: null, publication_kind: null, recorded_at: null },
      { register_version: "4", base_register_version: null, publication_id: null,
        request_sha256: null, snapshot_sha256: null, publication_kind: null, recorded_at: null }
    ]);
    expect((await database.pool.query(
      "SELECT count(*)::int AS count FROM register.register_version WHERE publication_kind='SUPPORT_CONFIGURATION'"
    )).rows).toEqual([{ count: 0 }]);
    expect((await database.pool.query(
      "SELECT count(*)::int AS count FROM register.register_row WHERE row_key='supportActivation'"
    )).rows).toEqual([{ count: 0 }]);
    expect((await database.pool.query(
      "SELECT * FROM register.read_support_configuration_status()"
    )).rows).toEqual([]);

    const deployedRegisterVersion = "4";
    await database.pool.query(
      "SELECT pg_catalog.setval('register.register_version_id_seq'::regclass,9007199254740993,false)"
    );
    const operatorRole = "debateai_test_rollout_support_operator";
    const operatorPassword = "rollout-test-only-abcdefghijklmnopqrstuvwxyz-123456";
    await database.pool.query(`
      CREATE ROLE ${operatorRole} LOGIN INHERIT
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
        PASSWORD '${operatorPassword}'
    `);
    await database.pool.query(`GRANT debateai_support_config_operator TO ${operatorRole}`);
    const operatorUrl = new URL(database.connectionString);
    operatorUrl.username = operatorRole;
    operatorUrl.password = operatorPassword;
    const operatorPool = createPool(operatorUrl.toString());
    const operatorPort = createPostgresRegisterPublicationPort(operatorPool);
    const adminPort = createPostgresRegisterPublicationPort(database.pool);
    try {
      const incomplete = completeSupportPatch(false)
        .filter(({ key }) => key !== "support_enabled");
      await expect(operatorPort.publishSupport({
        publicationId: randomUUID(),
        baseRegisterVersion: parseRegisterVersionText(deployedRegisterVersion),
        expectedSupportRegisterVersion: null,
        schemaVersion: 1,
        patch: incomplete.map(({ key, value_json_text }) => ({
          key: key as SupportConfigurationKey,
          valueJsonText: parseCanonicalRegisterJson(Buffer.from(value_json_text))
        })),
        sourceRef: "deployment:production-initial-off-incomplete"
      } as never)).rejects.toThrow(/SUPPORT_CONFIG_PATCH_INVALID/u);
      expect((await database.pool.query(
        "SELECT * FROM register.read_support_configuration_status()"
      )).rows).toEqual([]);

      const initialInput = {
        publicationId: randomUUID(),
        baseRegisterVersion: parseRegisterVersionText(deployedRegisterVersion),
        expectedSupportRegisterVersion: null,
        schemaVersion: 1 as const,
        patch: completeSupportPatch(false).map(({ key, value_json_text }) => ({
          key: key as SupportConfigurationKey,
          valueJsonText: parseCanonicalRegisterJson(Buffer.from(value_json_text))
        })),
        sourceRef: "deployment:production-initial-off"
      };
      const initial = await operatorPort.publishSupport(initialInput);
      expect(initial).toMatchObject({
        registerVersion: "9007199254740993",
        baseRegisterVersion: deployedRegisterVersion,
        publicationId: initialInput.publicationId,
        previousSupportRegisterVersion: null,
        changedKeys: Object.keys(SUPPORT_VALUES).sort()
      });
      expect(typeof initial.registerVersion).toBe("string");
      const initialStatus = await operatorPort.readSupportStatus();
      expect(initialStatus).toMatchObject({
        supportRegisterVersion: "9007199254740993",
        baseRegisterVersion: deployedRegisterVersion,
        schemaVersion: 1
      });
      const initialConfiguration = JSON.parse(initialStatus!.configurationText) as readonly Readonly<{
        row_key: string;
        value_json_text: string;
      }>[];
      expect(initialConfiguration).toHaveLength(16);
      expect(initialConfiguration.find((row) => row.row_key === "support_enabled"))
        .toMatchObject({ value_json_text: "false" });

      const generic = await adminPort.publishGeneral({
        publicationId: randomUUID(),
        baseRegisterVersion: parseRegisterVersionText(deployedRegisterVersion),
        rows: [{
          rowKey: "unrelatedDeploymentFlag",
          valueJsonText: parseCanonicalRegisterJson(Buffer.from("true")),
          sourceRef: "deployment:general-later"
        }],
        sourceRef: "deployment:general-later"
      });
      expect(generic.registerVersion).toBe("9007199254740994");
      expect(deployedRegisterVersion).toBe("4");
      const afterGeneric = await operatorPort.readSupportStatus();
      expect(afterGeneric!.supportRegisterVersion).toBe(initial.registerVersion);
      expect(afterGeneric!.baseRegisterVersion).toBe(deployedRegisterVersion);

      const enabled = await operatorPort.publishSupport({
        publicationId: randomUUID(),
        baseRegisterVersion: initial.registerVersion,
        expectedSupportRegisterVersion: initial.registerVersion,
        schemaVersion: 1,
        patch: [{
          key: "support_enabled",
          valueJsonText: parseCanonicalRegisterJson(Buffer.from("true"))
        }],
        sourceRef: "deployment:production-enable"
      });
    const preservedBeforeRollback = (await database.pool.query(`
      SELECT register_version::text,row_key,
        encode(convert_to(value_json::text,'UTF8'),'hex') AS value_json_hex,
        encode(convert_to(source_ref,'UTF8'),'hex') AS source_ref_hex
      FROM register.register_row
      WHERE register_version <= $1::bigint
      ORDER BY register_version,row_key
    `, [enabled.registerVersion])).rows;
      const rollback = await operatorPort.publishSupport({
        publicationId: randomUUID(),
        baseRegisterVersion: enabled.registerVersion,
        expectedSupportRegisterVersion: enabled.registerVersion,
        schemaVersion: 1,
        patch: [{
          key: "support_enabled",
          valueJsonText: parseCanonicalRegisterJson(Buffer.from("false"))
        }],
        sourceRef: "deployment:production-forward-rollback"
      });
      expect(BigInt(rollback.registerVersion)).toBeGreaterThan(BigInt(enabled.registerVersion));
    expect((await database.pool.query(`
      SELECT register_version::text,row_key,
        encode(convert_to(value_json::text,'UTF8'),'hex') AS value_json_hex,
        encode(convert_to(source_ref,'UTF8'),'hex') AS source_ref_hex
      FROM register.register_row
      WHERE register_version <= $1::bigint
      ORDER BY register_version,row_key
    `, [enabled.registerVersion])).rows).toEqual(preservedBeforeRollback);
      const rolledBackStatus = await operatorPort.readSupportStatus();
      expect(rolledBackStatus!.supportRegisterVersion).toBe(rollback.registerVersion);
      expect((JSON.parse(rolledBackStatus!.configurationText) as readonly Readonly<{
        row_key: string;
        value_json_text: string;
      }>[]).find((row) => row.row_key === "support_enabled"))
        .toMatchObject({ value_json_text: "false" });
      expect(deployedRegisterVersion).toBe("4");
      expect(await readHistoricalBytes(database.pool)).toEqual(historicalBefore);
    } finally {
      await operatorPool.end();
    }
  }, 120_000);

  it("accepts legacy 755 and maximum 1024 source refs across SQL write/read and rejects 1025", async () => {
    const legacy = "l".repeat(755);
    const maximum = "m".repeat(1024);
    const tooLong = "x".repeat(1025);
    for (const sourceRef of [legacy, maximum]) {
      await expect(database.pool.query(
        "SELECT register._validate_source_ref($1::text)",
        [sourceRef]
      )).resolves.toBeDefined();
    }
    await expect(database.pool.query(
      "SELECT register._validate_source_ref($1::text)",
      [tooLong]
    )).rejects.toThrow(/REGISTER_PUBLICATION_SEAL_INVALID: source ref/u);

    const rows = baseRows(maximum);
    await expect(importHistorical("4", rows)).resolves.toMatchObject({ outcome: "CREATED" });
    const stored = await database.pool.query<{ source_ref: string }>(
      "SELECT source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key",
      ["4"]
    );
    expect(stored.rows).toHaveLength(rows.length);
    expect(stored.rows.every((row) => row.source_ref === maximum)).toBe(true);
    await expect(importHistorical("3", baseRows(tooLong)))
      .rejects.toThrow(/REGISTER_PUBLICATION_SEAL_INVALID: source ref/u);
  });

  it("installs the exact schema objects, constraints, and roles", async () => {
    const columns = await database.pool.query<{ column_name: string; data_type: string; is_nullable: string }>(`
      SELECT column_name,data_type,is_nullable
      FROM information_schema.columns
      WHERE table_schema='register' AND table_name='register_version'
        AND column_name=ANY($1::text[])
      ORDER BY column_name
    `, [[
      "base_register_version", "publication_id", "request_sha256",
      "snapshot_sha256", "publication_kind", "recorded_at"
    ]]);
    expect(columns.rows).toHaveLength(6);
    expect(columns.rows.every((column) => column.is_nullable === "YES")).toBe(true);

    const constraints = await database.pool.query<{
      conname: string; contype: string; convalidated: boolean;
      condeferrable: boolean; condeferred: boolean; definition: string;
    }>(`
      SELECT conname,contype,convalidated,condeferrable,condeferred,
        pg_get_constraintdef(oid) AS definition
      FROM pg_catalog.pg_constraint
      WHERE connamespace='register'::regnamespace
        AND conname=ANY($1::text[])
      ORDER BY conname
    `, [[
      "register_row_register_version_fk",
      "register_version_base_register_version_fk",
      "register_version_publication_kind_check"
    ]]);
    expect(constraints.rows).toEqual([
      {
        conname: "register_row_register_version_fk", contype: "f",
        convalidated: true, condeferrable: true, condeferred: true,
        definition: "FOREIGN KEY (register_version) REFERENCES register.register_version(register_version) DEFERRABLE INITIALLY DEFERRED"
      },
      {
        conname: "register_version_base_register_version_fk", contype: "f",
        convalidated: true, condeferrable: false, condeferred: false,
        definition: "FOREIGN KEY (base_register_version) REFERENCES register.register_version(register_version)"
      },
      {
        conname: "register_version_publication_kind_check", contype: "c",
        convalidated: true, condeferrable: false, condeferred: false,
        definition: expect.stringMatching(/GENERAL.*SUPPORT_CONFIGURATION/u)
      }
    ]);

    const objects = await database.pool.query<{
      sequence_exists: boolean; function_count: string; role_count: string;
    }>(`
      SELECT to_regclass('register.register_version_id_seq') IS NOT NULL AS sequence_exists,
        (SELECT count(*)::text FROM pg_catalog.pg_proc AS procedure
          WHERE procedure.oid=ANY(ARRAY[
            to_regprocedure('register.allocate_register_version()'),
            to_regprocedure('register.import_historical_register_version(bigint,jsonb,character)'),
            to_regprocedure('register.publish_register_version(uuid,character,bigint,jsonb,text)'),
            to_regprocedure('register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)'),
            to_regprocedure('register.read_support_configuration_status()')
          ])) AS function_count,
        (SELECT count(*)::text FROM pg_catalog.pg_roles
          WHERE rolname=ANY(ARRAY[
            'debateai_register_publication_owner','debateai_support_config_operator'
          ]) AND NOT rolcanlogin AND NOT rolinherit) AS role_count
    `);
    expect(objects.rows[0]).toEqual({
      sequence_exists: true,
      function_count: "5",
      role_count: "2"
    });

    const hardening = await database.pool.query<{
      unique_publication_id: boolean; sequence_increment: string;
      sequence_cycles: boolean; sequence_owner: string; secure_function_count: string;
      public_execute_count: string; crossed_memberships: string;
    }>(`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_index AS index
          WHERE index.indexrelid='register.register_version_publication_id_unique'::regclass
            AND index.indrelid='register.register_version'::regclass
            AND index.indisunique AND index.indisvalid
        ) AS unique_publication_id,
        (SELECT seqincrement::text FROM pg_catalog.pg_sequence
          WHERE seqrelid='register.register_version_id_seq'::regclass) AS sequence_increment,
        (SELECT seqcycle FROM pg_catalog.pg_sequence
          WHERE seqrelid='register.register_version_id_seq'::regclass) AS sequence_cycles,
        pg_get_userbyid((SELECT relowner FROM pg_catalog.pg_class
          WHERE oid='register.register_version_id_seq'::regclass)) AS sequence_owner,
        (SELECT count(*)::text FROM pg_catalog.pg_proc AS procedure
          WHERE procedure.oid=ANY(ARRAY[
            to_regprocedure('register.allocate_register_version()'),
            to_regprocedure('register.import_historical_register_version(bigint,jsonb,character)'),
            to_regprocedure('register.publish_register_version(uuid,character,bigint,jsonb,text)'),
            to_regprocedure('register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)'),
            to_regprocedure('register.read_support_configuration_status()'),
            to_regprocedure('register._assert_register_base_integrity(bigint)'),
            to_regprocedure('register._register_row_insert_guard()'),
            to_regprocedure('register._register_version_seal_guard()')
          ]) AND procedure.provolatile='v' AND procedure.prosecdef
            AND procedure.proconfig=ARRAY['search_path=pg_catalog, register']::text[]
            AND pg_get_userbyid(procedure.proowner)='debateai_register_publication_owner'
        ) AS secure_function_count,
        (SELECT count(*)::text
          FROM pg_catalog.pg_proc AS procedure,
            LATERAL aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) AS acl
          WHERE procedure.pronamespace='register'::regnamespace
            AND procedure.proname=ANY(ARRAY[
              'allocate_register_version','import_historical_register_version',
              'publish_register_version','publish_support_configuration',
              'read_support_configuration_status'
            ]) AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
        ) AS public_execute_count,
        (SELECT count(*)::text FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.roleid=ANY(ARRAY[
            'debateai_register_publication_owner'::regrole,
            'debateai_support_config_operator'::regrole
          ]) OR membership.member=ANY(ARRAY[
            'debateai_register_publication_owner'::regrole,
            'debateai_support_config_operator'::regrole
          ])) AS crossed_memberships
    `);
    expect(hardening.rows[0]).toEqual({
      unique_publication_id: true,
      sequence_increment: "1",
      sequence_cycles: false,
      sequence_owner: "debateai_register_publication_owner",
      secure_function_count: "8",
      public_execute_count: "0",
      crossed_memberships: "0"
    });
  });

  it("keeps its sequence position on migration replay", async () => {
    const before = await database.pool.query<{ last_value: string; is_called: boolean }>(
      "SELECT last_value::text,is_called FROM register.register_version_id_seq"
    );
    await database.pool.query(await readFile("migrations/0055_register_support_publication.sql", "utf8"));
    const after = await database.pool.query<{ last_value: string; is_called: boolean }>(
      "SELECT last_value::text,is_called FROM register.register_version_id_seq"
    );
    expect(after.rows).toEqual(before.rows);

    await database.pool.query("CREATE ROLE rsp_task1_operator_member NOLOGIN INHERIT");
    await database.pool.query(
      "GRANT debateai_support_config_operator TO rsp_task1_operator_member"
    );
    await expect(database.pool.query(
      await readFile("migrations/0055_register_support_publication.sql", "utf8")
    )).resolves.toBeDefined();

    await database.pool.query(`
      ALTER TABLE register.register_row
      ALTER CONSTRAINT register_row_register_version_fk NOT DEFERRABLE
    `);
    await expect(database.pool.query(
      await readFile("migrations/0055_register_support_publication.sql", "utf8")
    )).rejects.toThrow(/REGISTER_PUBLICATION_DEFINITION_DRIFT: row foreign key/u);
    await database.pool.query(`
      ALTER TABLE register.register_row
      ALTER CONSTRAINT register_row_register_version_fk
      DEFERRABLE INITIALLY DEFERRED
    `);

    await database.pool.query(
      "ALTER FUNCTION register.allocate_register_version() STABLE"
    );
    await expect(database.pool.query(
      await readFile("migrations/0055_register_support_publication.sql", "utf8")
    )).rejects.toThrow(/REGISTER_PUBLICATION_DEFINITION_DRIFT: functions/u);
    await database.pool.query(
      "ALTER FUNCTION register.allocate_register_version() VOLATILE"
    );

    await database.pool.query("ALTER SEQUENCE register.register_version_id_seq INCREMENT BY 2");
    await expect(database.pool.query(
      await readFile("migrations/0055_register_support_publication.sql", "utf8")
    )).rejects.toThrow(/REGISTER_PUBLICATION_DEFINITION_DRIFT: allocator sequence/u);
  });

  it("rejects allocator overflow without wrapping or filling a gap", async () => {
    await database.pool.query(`
      SELECT pg_catalog.setval(
        'register.register_version_id_seq'::regclass,
        9223372036854775807,
        true
      )
    `);
    await expect(inTransaction((client) => client.query(
      "SELECT register.allocate_register_version()"
    ))).rejects.toThrow(/REGISTER_VERSION_ALLOCATION_EXHAUSTED/u);
  });

  it("rejects forbidden operator membership drift and its assumable support capability", async () => {
    const forbidden = await database.pool.query<{ rolname: string }>(`
      SELECT rolname FROM pg_catalog.pg_roles
      WHERE rolname=ANY(ARRAY['debateai_runtime','debateai_replay','debateai_support'])
      ORDER BY rolname
    `);
    expect(forbidden.rows.map((row) => row.rolname)).toEqual(expect.arrayContaining([
      "debateai_replay", "debateai_runtime"
    ]));

    for (const { rolname } of forbidden.rows) {
      const before = await database.pool.query<{ can_publish: boolean }>(`
        SELECT has_function_privilege(
          $1,
          'register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)',
          'EXECUTE'
        ) AS can_publish
      `, [rolname]);
      expect(before.rows[0]?.can_publish).toBe(false);

      await database.pool.query(
        `GRANT debateai_support_config_operator TO ${rolname}`
      );
      const drift = await database.pool.query<{
        is_member: boolean;
        can_publish: boolean;
        can_set: boolean;
        inherits: boolean;
      }>(`
        SELECT pg_has_role($1,'debateai_support_config_operator','MEMBER') AS is_member,
          pg_has_role($1,'debateai_support_config_operator','SET') AS can_set,
          (SELECT rolinherit FROM pg_catalog.pg_roles WHERE rolname=$1) AS inherits,
          has_function_privilege(
            $1,
            'register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)',
            'EXECUTE'
          ) AS can_publish
      `, [rolname]);
      const expectedInheritedPrivilege = rolname !== "debateai_support";
      expect(drift.rows[0]).toEqual({
        is_member: true,
        can_publish: expectedInheritedPrivilege,
        can_set: true,
        inherits: expectedInheritedPrivilege
      });
      await expect(database.pool.query(
        await readFile("migrations/0055_register_support_publication.sql", "utf8")
      )).rejects.toThrow(/SUPPORT_CONFIG_ROLE_INVALID/u);
      await database.pool.query(
        `REVOKE debateai_support_config_operator FROM ${rolname}`
      );
    }
  });

  it("rejects a transitive runtime operator privilege bridge while allowing a future operator login", async () => {
    const migration = await readFile("migrations/0055_register_support_publication.sql", "utf8");
    const before = await database.pool.query<{ is_member: boolean; can_publish: boolean }>(`
      SELECT pg_has_role(
          'debateai_runtime','debateai_support_config_operator','MEMBER'
        ) AS is_member,
        has_function_privilege(
          'debateai_runtime',
          'register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)',
          'EXECUTE'
        ) AS can_publish
    `);
    expect(before.rows[0]).toEqual({ is_member: false, can_publish: false });

    await database.pool.query("CREATE ROLE rsp_task1_operator_bridge NOLOGIN INHERIT");
    await database.pool.query(
      "GRANT debateai_support_config_operator TO rsp_task1_operator_bridge"
    );
    await database.pool.query(
      "GRANT rsp_task1_operator_bridge TO debateai_runtime"
    );
    const leaked = await database.pool.query<{ is_member: boolean; can_publish: boolean }>(`
      SELECT pg_has_role(
          'debateai_runtime','debateai_support_config_operator','MEMBER'
        ) AS is_member,
        has_function_privilege(
          'debateai_runtime',
          'register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)',
          'EXECUTE'
        ) AS can_publish
    `);
    expect(leaked.rows[0]).toEqual({ is_member: true, can_publish: true });
    await expect(database.pool.query(migration))
      .rejects.toThrow(/SUPPORT_CONFIG_ROLE_INVALID/u);

    await database.pool.query(
      "REVOKE rsp_task1_operator_bridge FROM debateai_runtime"
    );
    await database.pool.query("CREATE ROLE rsp_task1_future_operator LOGIN INHERIT");
    await database.pool.query(
      "GRANT rsp_task1_operator_bridge TO rsp_task1_future_operator"
    );
    const allowed = await database.pool.query<{ is_member: boolean; can_publish: boolean }>(`
      SELECT pg_has_role(
          'rsp_task1_future_operator','debateai_support_config_operator','MEMBER'
        ) AS is_member,
        has_function_privilege(
          'rsp_task1_future_operator',
          'register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)',
          'EXECUTE'
        ) AS can_publish
    `);
    expect(allowed.rows[0]).toEqual({ is_member: true, can_publish: true });
    await expect(database.pool.query(migration)).resolves.toBeDefined();
  });

  it("canonicalizes the independent JSON vectors and rejects lexical or precision drift", async () => {
    const vectors = [
      ['{ "b": 2, "a": 1 }', '{"a":1,"b":2}'],
      ['{"română":"țară\\n\\"\\\\","slash":"\\/"}', '{"română":"țară\\u000a\\"\\\\","slash":"/"}'],
      ['{"😀":1,"":2}', '{"":2,"😀":1}'],
      ["9007199254740991", "9007199254740991"],
      ["-9007199254740991", "-9007199254740991"],
      ["0.000002", "0.000002"],
      ["5395.831171", "5395.831171"],
      ["99999999999999.5", "99999999999999.5"],
      ["-99999999999999.5", "-99999999999999.5"]
    ] as const;
    for (const [raw, canonical] of vectors) {
      const result = await database.pool.query<{ value: string }>(
        "SELECT register.canonical_json_text($1::text) AS value",
        [raw]
      );
      expect(result.rows[0]?.value).toBe(canonical);
    }
    for (const raw of [
      "9007199254740990.5", "-9007199254740990.5", "1e3", "1e-7",
      "0.0000001", "999999999999999.9", '{"same":1,"same":2}', '"\\u0000"',
      "\v1", "\f1"
    ]) {
      await expect(database.pool.query(
        "SELECT register.canonical_json_text($1::text)",
        [raw]
      )).rejects.toThrow(/SUPPORT_CONFIG_PATCH_INVALID/u);
    }
  });

  it("rejects NULL required inputs at every closed publication port", async () => {
    const rows = baseRows();
    await expect(database.pool.query(
      "SELECT * FROM register.import_historical_register_version(1,$1::jsonb,NULL)",
      [JSON.stringify(rows)]
    )).rejects.toThrow(/historical input/u);
    await expect(database.pool.query(
      "SELECT * FROM register.publish_register_version(NULL,$1::char(64),4,$2::jsonb,$3)",
      ["0".repeat(64), JSON.stringify(rows), "fixture:null-general"]
    )).rejects.toThrow(/GENERAL input/u);
    await expect(database.pool.query(
      "SELECT * FROM register.publish_support_configuration(NULL,$1::char(64),NULL,4,NULL,$2::jsonb,$3)",
      ["0".repeat(64), JSON.stringify([{ key: "support_enabled", value_json_text: "false" }]), "fixture:null-support"]
    )).rejects.toThrow(/SUPPORT_CONFIG_PATCH_INVALID|SUPPORT_CONFIG_SCHEMA_UNSUPPORTED/u);
  });

  it("imports historical bytes once and permits exact replay only", async () => {
    const rows = baseRows();
    await expect(importHistorical("4", rows)).resolves.toMatchObject({
      register_version: "4",
      row_count: rows.length,
      snapshot_sha256: snapshotHash(rows),
      outcome: "CREATED"
    });
    await expect(importHistorical("4", rows)).resolves.toMatchObject({ outcome: "REPLAYED" });
    const stored = await database.pool.query(`
      SELECT base_register_version,publication_id,request_sha256,snapshot_sha256,
        publication_kind,recorded_at
      FROM register.register_version WHERE register_version=4
    `);
    expect(stored.rows[0]).toEqual({
      base_register_version: null,
      publication_id: null,
      request_sha256: null,
      snapshot_sha256: null,
      publication_kind: null,
      recorded_at: null
    });
    const changed = rows.map((row) => row.row_key === "riskTier"
      ? { ...row, value_json_text: '"high"' }
      : row);
    await expect(importHistorical("4", changed)).rejects.toThrow(/historical replay drift/u);
    await expect(importHistorical("5", rows)).rejects.toThrow(/historical input/u);
  });

  it("publishes exact GENERAL snapshots with replay and UUID reuse protection", async () => {
    await importHistorical("4");
    const publicationId = randomUUID();
    const rows: RegisterRowInput[] = [
      { row_key: "only", value_json_text: '{"a":1,"b":2}', source_ref: "fixture:general-row" }
    ];
    const input = { publicationId, base: "4", rows, sourceRef: "fixture:general-op" };
    const first = await publishGeneral(input);
    expect(first).toMatchObject({
      register_version: "5",
      base_register_version: "4",
      publication_id: publicationId,
      publication_kind: "GENERAL",
      request_sha256: generalRequestHash(input),
      snapshot_sha256: snapshotHash(rows),
      row_count: 1
    });
    await expect(publishGeneral(input)).resolves.toEqual(first);
    const stored = await database.pool.query(
      "SELECT row_key,register.canonical_json_text(value_json::text) AS value_json_text,source_ref FROM register.register_row WHERE register_version=5"
    );
    expect(stored.rows).toEqual(rows);

    await expect(publishGeneral({
      ...input, publicationId: randomUUID()
    })).resolves.toMatchObject({ register_version: "6", snapshot_sha256: first.snapshot_sha256 });

    const changed = { ...input, rows: [{ ...rows[0]!, value_json_text: '"changed"' }] };
    await expect(publishGeneral(changed)).rejects.toThrow(/SUPPORT_CONFIG_OPERATION_REUSED/u);
    await expect(publishGeneral({ ...input, publicationId: randomUUID(), rows: [
      { row_key: "supportActivation", value_json_text: "null", source_ref: "fixture:forged" }
    ] })).rejects.toThrow(/GENERAL row envelope/u);
  });

  it("publishes a self-binding support marker, enforces CAS, and reads support rather than numeric latest", async () => {
    await importHistorical("4");
    const firstInput = {
      publicationId: randomUUID(), base: "4", expected: null,
      patch: [{ key: "support_enabled", value_json_text: "true" }],
      sourceRef: "fixture:support-first"
    };
    const first = await publishSupport(firstInput);
    expect(first).toMatchObject({
      register_version: "5",
      base_register_version: "4",
      publication_id: firstInput.publicationId,
      publication_kind: "SUPPORT_CONFIGURATION",
      request_sha256: supportRequestHash(firstInput),
      previous_support_register_version: null,
      changed_keys: ["support_enabled"]
    });
    const marker = await database.pool.query<{ value_json: Record<string, unknown> }>(`
      SELECT value_json FROM register.register_row
      WHERE register_version=5 AND row_key='supportActivation'
    `);
    expect(marker.rows[0]?.value_json).toMatchObject({
      kind: "SUPPORT_CONFIGURATION_ACTIVATION",
      schema_version: 1,
      target_register_version: "5",
      previous_support_register_version: null,
      support_snapshot_sha256: first.support_snapshot_sha256,
      changed_keys: ["support_enabled"],
      source_ref: "fixture:support-first"
    });

    await expect(publishSupport(firstInput)).resolves.toEqual(first);
    await expect(publishSupport({
      ...firstInput,
      patch: [{ key: "support_enabled", value_json_text: "false" }]
    })).rejects.toThrow(/SUPPORT_CONFIG_OPERATION_REUSED/u);

    await expect(publishSupport({
      ...firstInput, publicationId: randomUUID(), base: "5", expected: "5"
    })).rejects.toThrow(/SUPPORT_CONFIG_UNCHANGED/u);
    const secondInput = {
      publicationId: randomUUID(), base: "5", expected: "5",
      patch: [{ key: "support_enabled", value_json_text: "false" }],
      sourceRef: "fixture:support-second"
    };
    const second = await publishSupport(secondInput);
    expect(second).toMatchObject({
      register_version: "6",
      previous_support_register_version: "5",
      changed_keys: ["support_enabled"]
    });
    await expect(publishSupport({
      ...secondInput, publicationId: randomUUID(),
      patch: [{ key: "support_model_ref", value_json_text: '"development:none"' }]
    })).rejects.toThrow(/SUPPORT_CONFIG_ACTIVATION_CONFLICT/u);

    const generalRows: RegisterRowInput[] = [
      { row_key: "new-only", value_json_text: "1", source_ref: "fixture:later-general" }
    ];
    await publishGeneral({
      publicationId: randomUUID(), base: "6", rows: generalRows,
      sourceRef: "fixture:later-general-op"
    });
    const status = await database.pool.query("SELECT * FROM register.read_support_configuration_status()");
    expect(status.rows[0]).toMatchObject({
      support_register_version: "6",
      base_register_version: "5",
      support_snapshot_sha256: second.support_snapshot_sha256,
      changed_keys: ["support_enabled"],
      source_ref: "fixture:support-second"
    });
    expect(status.rows[0]?.configuration).toHaveLength(16);
    const supportRows = await database.pool.query<RegisterRowInput>(`
      SELECT row_key,register.canonical_json_text(value_json::text) AS value_json_text,source_ref
      FROM register.register_row
      WHERE register_version=6 AND row_key=ANY(register._support_keys())
    `);
    expect(snapshotHash(supportRows.rows)).toBe(second.support_snapshot_sha256);
    const allRows = await database.pool.query<RegisterRowInput>(`
      SELECT row_key,register.canonical_json_text(value_json::text) AS value_json_text,source_ref
      FROM register.register_row WHERE register_version=6
    `);
    expect(snapshotHash(allRows.rows)).toBe(second.snapshot_sha256);
    expect(allRows.rows.filter((row) => row.row_key === "supportActivation")).toHaveLength(1);
    expect(allRows.rows.find((row) => row.row_key === "riskTier")?.source_ref).toBe("fixture:base");
  });

  it("fails closed on a corrupt newest support generation instead of falling back to an older enabled one", async () => {
    await importHistorical("4");
    const enabled = await publishSupport({
      publicationId: randomUUID(), base: "4", expected: null,
      patch: [{ key: "support_enabled", value_json_text: "true" }],
      sourceRef: "fixture:selector-enabled"
    });
    const newest = await publishSupport({
      publicationId: randomUUID(), base: enabled.register_version as string,
      expected: enabled.register_version as string,
      patch: [{ key: "support_queue_depth", value_json_text: "11" }],
      sourceRef: "fixture:selector-newest"
    });
    await inTransaction(async (client) => {
      await client.query("SET LOCAL session_replication_role=replica");
      await client.query(`
        UPDATE register.register_row
        SET value_json='false'::jsonb
        WHERE register_version=$1::bigint AND row_key='support_enabled'
      `, [newest.register_version]);
    });

    const port = createSupportConfigurationPort(database.pool);
    await expect(port.current()).resolves.toEqual({
      kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID"
    });
  });

  it("reports an unknown newest activation schema instead of falling back to schema 1", async () => {
    await importHistorical("4");
    const enabled = await publishSupport({
      publicationId: randomUUID(), base: "4", expected: null,
      patch: [{ key: "support_enabled", value_json_text: "true" }],
      sourceRef: "fixture:schema-enabled"
    });
    const newest = await publishSupport({
      publicationId: randomUUID(), base: enabled.register_version as string,
      expected: enabled.register_version as string,
      patch: [{ key: "support_queue_depth", value_json_text: "11" }],
      sourceRef: "fixture:schema-newest"
    });
    await inTransaction(async (client) => {
      await client.query("SET LOCAL session_replication_role=replica");
      await client.query(`
        UPDATE register.register_row
        SET value_json=jsonb_set(value_json,'{schema_version}','2'::jsonb)
        WHERE register_version=$1::bigint AND row_key='supportActivation'
      `, [newest.register_version]);
    });

    const port = createSupportConfigurationPort(database.pool);
    await expect(port.current()).resolves.toEqual({
      kind: "DISABLED", code: "SUPPORT_CONFIG_SCHEMA_UNSUPPORTED"
    });
  });

  it("separates request and snapshot digest domains and rejects stronger isolation", async () => {
    const rows = baseRows();
    await importHistorical("4", rows);
    const publicationId = randomUUID();
    const targetRows: RegisterRowInput[] = [
      { row_key: "domain", value_json_text: "1", source_ref: "fixture:domain-row" }
    ];
    await expect(inTransaction((client) => client.query(
      `SELECT * FROM register.publish_register_version(
        $1::uuid,$2::char(64),4,$3::jsonb,'fixture:domain-op'
      )`,
      [publicationId, snapshotHash(targetRows), JSON.stringify(targetRows)]
    ))).rejects.toThrow(/GENERAL request digest/u);
    expect((await database.pool.query(
      "SELECT last_value::text,is_called FROM register.register_version_id_seq"
    )).rows[0]).toEqual({ last_value: "5", is_called: false });

    const client = await database.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const valid = {
        publicationId: randomUUID(), base: "4", rows: targetRows,
        sourceRef: "fixture:serializable"
      };
      await expect(publishGeneral(valid, client)).rejects.toThrow(/READ COMMITTED required/u);
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("validates closed support syntax, catalogue bounds, and retention ratification order", async () => {
    await importHistorical("4");
    const invalidPatches: readonly (readonly SupportPatch[])[] = [
      [{ key: "support_unknown", value_json_text: "1" }],
      [{ key: "support_relay_concurrency", value_json_text: "17" }],
      [{ key: "support_model_ref", value_json_text: '"https://example.test/model"' }],
      [{ key: "support_retention_policy", value_json_text: '"shred-after-days:3651"' }],
      [
        { key: "support_enabled", value_json_text: "true" },
        { key: "support_enabled", value_json_text: "false" }
      ]
    ];
    for (const patch of invalidPatches) {
      await expect(publishSupport({
        publicationId: randomUUID(), base: "4", expected: null, patch,
        sourceRef: "fixture:invalid-patch"
      })).rejects.toThrow(/SUPPORT_CONFIG_PATCH_INVALID/u);
    }

    const first = await publishSupport({
      publicationId: randomUUID(), base: "4", expected: null,
      patch: [{ key: "support_enabled", value_json_text: "false" }],
      sourceRef: "fixture:retention-initialize"
    });
    const ratified = await publishSupport({
      publicationId: randomUUID(), base: first.register_version as string,
      expected: first.register_version as string,
      patch: [{ key: "support_retention_ratified_by", value_json_text: '"V"' }],
      sourceRef: "fixture:retention-ratify"
    });
    await expect(publishSupport({
      publicationId: randomUUID(), base: ratified.register_version as string,
      expected: ratified.register_version as string,
      patch: [
        { key: "support_retention_ratified_by", value_json_text: "null" },
        { key: "support_retention_policy", value_json_text: '"shred-after-days:30"' }
      ],
      sourceRef: "fixture:retention-combined"
    })).rejects.toThrow(/reset retention ratifier first|separate ratifier reset required/u);
    const reset = await publishSupport({
      publicationId: randomUUID(), base: ratified.register_version as string,
      expected: ratified.register_version as string,
      patch: [{ key: "support_retention_ratified_by", value_json_text: "null" }],
      sourceRef: "fixture:retention-reset"
    });
    await expect(publishSupport({
      publicationId: randomUUID(), base: reset.register_version as string,
      expected: reset.register_version as string,
      patch: [{ key: "support_retention_policy", value_json_text: '"shred-after-days:30"' }],
      sourceRef: "fixture:retention-change"
    })).resolves.toMatchObject({ previous_support_register_version: reset.register_version });
  });

  it("denies direct role privileges and owner-trigger row/seal inversion bypasses", async () => {
    await importHistorical("4");
    const privileges = await database.pool.query<{
      role_name: string; support_publish: boolean; general_publish: boolean;
      allocator: boolean; row_insert: boolean; sequence_usage: boolean;
    }>(`
      SELECT role_name,
        has_function_privilege(role_name,
          'register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)','EXECUTE') AS support_publish,
        has_function_privilege(role_name,
          'register.publish_register_version(uuid,character,bigint,jsonb,text)','EXECUTE') AS general_publish,
        has_function_privilege(role_name,
          'register.allocate_register_version()','EXECUTE') AS allocator,
        has_table_privilege(role_name,'register.register_row','INSERT') AS row_insert,
        has_sequence_privilege(role_name,'register.register_version_id_seq','USAGE') AS sequence_usage
      FROM pg_catalog.unnest(ARRAY[
        'debateai_runtime','debateai_support_config_operator'
      ]) AS role(role_name)
      ORDER BY role_name
    `);
    expect(privileges.rows).toEqual([
      {
        role_name: "debateai_runtime", support_publish: false,
        general_publish: true, allocator: false, row_insert: false, sequence_usage: false
      },
      {
        role_name: "debateai_support_config_operator", support_publish: true,
        general_publish: false, allocator: false, row_insert: false, sequence_usage: false
      }
    ]);
    await expect(inTransaction((client) => client.query(
      "INSERT INTO register.register_row VALUES (999,'dangling','null'::jsonb,'fixture:bypass')"
    ), "debateai_register_publication_owner")).rejects.toThrow(/closed row writer/u);
    await expect(inTransaction((client) => client.query(
      "INSERT INTO register.register_row VALUES (4,'late','null'::jsonb,'fixture:bypass')"
    ), "debateai_register_publication_owner")).rejects.toThrow(/REGISTER_PUBLICATION_LATE_ROW/u);
    await expect(inTransaction(async (client) => {
      await client.query("SELECT set_config('register.publication_context','SEAL:GENERAL:5',true)");
      await client.query(`INSERT INTO register.register_version (
        register_version,row_count,sealed,base_register_version,publication_id,
        request_sha256,snapshot_sha256,publication_kind,recorded_at
      ) VALUES (5,1,true,4,$1,$2,$2,'GENERAL',clock_timestamp())`, [
        randomUUID(), "0".repeat(64)
      ]);
    }, "debateai_register_publication_owner")).rejects.toThrow(/REGISTER_PUBLICATION_SEAL_INVALID/u);
    await expect(inTransaction(async (client) => {
      await client.query("SELECT set_config('register.publication_context','GENERAL_ROWS:50',true)");
      await client.query("INSERT INTO register.register_row VALUES (50,'row','1'::jsonb,'fixture:bypass')");
      const hash = (await client.query<{ hash: string }>(
        "SELECT register._snapshot_sha256(50) AS hash"
      )).rows[0]!.hash;
      await client.query("SELECT set_config('register.publication_context','SEAL:GENERAL:50',true)");
      await client.query(`INSERT INTO register.register_version (
        register_version,row_count,sealed,base_register_version,publication_id,
        request_sha256,snapshot_sha256,publication_kind,recorded_at
      ) VALUES (50,1,true,999,$1,$2,$3,'GENERAL',clock_timestamp())`, [
        randomUUID(), "0".repeat(64), hash
      ]);
    }, "debateai_register_publication_owner")).rejects.toThrow(/REGISTER_PUBLICATION_BASE_INVALID/u);
    await expect(inTransaction(async (client) => {
      await client.query("SELECT set_config('register.publication_context','GENERAL_ROWS:50',true)");
      await client.query("INSERT INTO register.register_row VALUES (50,'row','1'::jsonb,'fixture:bypass')");
      const hash = (await client.query<{ hash: string }>(
        "SELECT register._snapshot_sha256(50) AS hash"
      )).rows[0]!.hash;
      await client.query("SELECT set_config('register.publication_context','SEAL:BAD:50',true)");
      await client.query(`INSERT INTO register.register_version (
        register_version,row_count,sealed,base_register_version,publication_id,
        request_sha256,snapshot_sha256,publication_kind,recorded_at
      ) VALUES (50,1,true,4,$1,$2,$3,'BAD',clock_timestamp())`, [
        randomUUID(), "0".repeat(64), hash
      ]);
    }, "debateai_register_publication_owner")).rejects.toThrow(/REGISTER_PUBLICATION_SEAL_INVALID/u);
  });

  it("rejects corrupt historical counts and corrupt future base digests on every path", async () => {
    await importHistorical("4");
    await database.pool.query("ALTER TABLE register.register_version DISABLE TRIGGER USER");
    await database.pool.query(`
      UPDATE register.register_version SET row_count=row_count+1
      WHERE register_version=4
    `);
    await database.pool.query("ALTER TABLE register.register_version ENABLE TRIGGER USER");

    const historicalGeneral = await captureRolledBackError((client) => publishGeneral({
      publicationId: randomUUID(), base: "4",
      rows: [{ row_key: "child", value_json_text: "1", source_ref: "fixture:bad-history" }],
      sourceRef: "fixture:bad-history-general"
    }, client));
    const historicalSupport = await captureRolledBackError((client) => publishSupport({
      publicationId: randomUUID(), base: "4", expected: null,
      patch: [{ key: "support_enabled", value_json_text: "false" }],
      sourceRef: "fixture:bad-history-support"
    }, client));

    await database.pool.query("ALTER TABLE register.register_version DISABLE TRIGGER USER");
    await database.pool.query(`
      UPDATE register.register_version AS version
      SET row_count=(
        SELECT count(*)::integer FROM register.register_row AS row
        WHERE row.register_version=version.register_version
      )
      WHERE version.register_version=4
    `);
    await database.pool.query("ALTER TABLE register.register_version ENABLE TRIGGER USER");
    const futureRows = baseRows("fixture:future-base");
    const future = await publishGeneral({
      publicationId: randomUUID(), base: "4", rows: futureRows,
      sourceRef: "fixture:future-base"
    });
    await database.pool.query("ALTER TABLE register.register_version DISABLE TRIGGER USER");
    await database.pool.query(`
      UPDATE register.register_version SET snapshot_sha256=$1
      WHERE register_version=$2::bigint
    `, ["0".repeat(64), future.register_version]);
    await database.pool.query("ALTER TABLE register.register_version ENABLE TRIGGER USER");

    const futureGeneral = await captureRolledBackError((client) => publishGeneral({
      publicationId: randomUUID(), base: future.register_version as string,
      rows: [{ row_key: "child", value_json_text: "2", source_ref: "fixture:bad-future" }],
      sourceRef: "fixture:bad-future-general"
    }, client));
    const futureSupport = await captureRolledBackError((client) => publishSupport({
      publicationId: randomUUID(), base: future.register_version as string, expected: null,
      patch: [{ key: "support_enabled", value_json_text: "false" }],
      sourceRef: "fixture:bad-future-support"
    }, client));
    const futureSeal = await captureRolledBackError(async (client) => {
      await client.query("SELECT set_config('register.publication_context','GENERAL_ROWS:50',true)");
      await client.query("INSERT INTO register.register_row VALUES (50,'row','1'::jsonb,'fixture:bad-future-seal')");
      const hash = (await client.query<{ hash: string }>(
        "SELECT register._snapshot_sha256(50) AS hash"
      )).rows[0]!.hash;
      await client.query("SELECT set_config('register.publication_context','SEAL:GENERAL:50',true)");
      await client.query(`
        INSERT INTO register.register_version (
          register_version,row_count,sealed,base_register_version,publication_id,
          request_sha256,snapshot_sha256,publication_kind,recorded_at
        ) VALUES (50,1,true,$1::bigint,$2,$3,$4,'GENERAL',clock_timestamp())
      `, [future.register_version, randomUUID(), "0".repeat(64), hash]);
    }, "debateai_register_publication_owner");

    expect([
      historicalGeneral, historicalSupport, futureGeneral, futureSupport, futureSeal
    ]).toEqual(Array.from({ length: 5 }, () =>
      expect.stringMatching(/REGISTER_PUBLICATION_BASE_INVALID/u)));
    expect((await database.pool.query(`
      SELECT count(*)::text AS count FROM register.register_version
      WHERE base_register_version IN (4,$1::bigint)
    `, [future.register_version])).rows[0]?.count).toBe("1");
  });

  it("rejects forged copied and stale activation markers through row and seal triggers", async () => {
    await importHistorical("4");
    const active = await publishSupport({
      publicationId: randomUUID(), base: "4", expected: null,
      patch: [{ key: "support_enabled", value_json_text: "false" }],
      sourceRef: "fixture:marker-active"
    });
    const copied = (await database.pool.query<{ value_json: Record<string, unknown> }>(`
      SELECT value_json FROM register.register_row
      WHERE register_version=$1 AND row_key='supportActivation'
    `, [active.register_version])).rows[0]!.value_json;
    await expect(inTransaction(async (client) => {
      await client.query("SELECT set_config('register.publication_context','SUPPORT_MARKER:50',true)");
      await client.query(
        "INSERT INTO register.register_row VALUES (50,'supportActivation',$1::jsonb,'fixture:marker-active')",
        [JSON.stringify(copied)]
      );
    }, "debateai_register_publication_owner")).rejects.toThrow(/marker values/u);

    await expect(inTransaction(async (client) => {
      await client.query("SELECT set_config('register.publication_context','SUPPORT_ROWS:50',true)");
      await client.query(`
        INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
        SELECT 50,row_key,value_json,source_ref FROM register.register_row
        WHERE register_version=$1 AND row_key<>'supportActivation'
      `, [active.register_version]);
      const supportHash = (await client.query<{ hash: string }>(
        "SELECT register._support_snapshot_sha256(50) AS hash"
      )).rows[0]!.hash;
      const recordedAt = (await client.query<{ at: Date }>(
        "SELECT clock_timestamp() AS at"
      )).rows[0]!.at;
      const staleMarker = {
        ...copied,
        target_register_version: "50",
        previous_support_register_version: null,
        support_snapshot_sha256: supportHash,
        recorded_at: recordedAt
      };
      await client.query("SELECT set_config('register.publication_context','SUPPORT_MARKER:50',true)");
      await client.query(
        "INSERT INTO register.register_row VALUES (50,'supportActivation',$1::jsonb,'fixture:marker-active')",
        [JSON.stringify(staleMarker)]
      );
      const snapshot = (await client.query<{ hash: string }>(
        "SELECT register._snapshot_sha256(50) AS hash"
      )).rows[0]!.hash;
      await client.query("SELECT set_config('register.publication_context','SEAL:SUPPORT_CONFIGURATION:50',true)");
      await client.query(`
        INSERT INTO register.register_version (
          register_version,row_count,sealed,base_register_version,publication_id,
          request_sha256,snapshot_sha256,publication_kind,recorded_at
        ) VALUES (50,18,true,$1,$2,$3,$4,'SUPPORT_CONFIGURATION',$5)
      `, [active.register_version, randomUUID(), "0".repeat(64), snapshot, recordedAt]);
    }, "debateai_register_publication_owner")).rejects.toThrow(/activation binding/u);
  });

  it("rejects owner-forged empty, subset, and superset activation change sets", async () => {
    await importHistorical("4");
    const active = await publishSupport({
      publicationId: randomUUID(), base: "4", expected: null,
      patch: [{ key: "support_enabled", value_json_text: "false" }],
      sourceRef: "fixture:change-set-active"
    });
    const predecessor = active.register_version as string;
    const cases = [
      { target: "50", replacements: {}, changedKeys: [] },
      {
        target: "51",
        replacements: {
          support_enabled: "true",
          support_model_ref: '"development:none"'
        },
        changedKeys: ["support_enabled"]
      },
      {
        target: "52",
        replacements: { support_enabled: "true" },
        changedKeys: ["support_enabled", "support_model_ref"]
      }
    ] as const;

    const outcomes: (string | null)[] = [];
    for (const forged of cases) {
      outcomes.push(await captureRolledBackError(async (client) => {
        const replacementKeys = Object.keys(forged.replacements);
        await client.query(
          "SELECT set_config('register.publication_context',$1,true)",
          [`SUPPORT_ROWS:${forged.target}`]
        );
        await client.query(`
          INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
          SELECT $1::bigint,row_key,value_json,source_ref
          FROM register.register_row
          WHERE register_version=$2::bigint
            AND row_key<>'supportActivation'
            AND row_key<>ALL($3::text[])
        `, [forged.target, predecessor, replacementKeys]);
        for (const [key, value] of Object.entries(forged.replacements)) {
          await client.query(
            "INSERT INTO register.register_row VALUES ($1::bigint,$2,$3::jsonb,'fixture:forged-change')",
            [forged.target, key, value]
          );
        }
        const supportHash = (await client.query<{ hash: string }>(
          "SELECT register._support_snapshot_sha256($1::bigint) AS hash",
          [forged.target]
        )).rows[0]!.hash;
        const recordedAt = (await client.query<{ at: Date }>(
          "SELECT clock_timestamp() AS at"
        )).rows[0]!.at;
        const marker = {
          kind: "SUPPORT_CONFIGURATION_ACTIVATION",
          schema_version: 1,
          target_register_version: forged.target,
          previous_support_register_version: predecessor,
          support_snapshot_sha256: supportHash,
          changed_keys: forged.changedKeys,
          source_ref: "fixture:forged-marker",
          recorded_at: recordedAt
        };
        await client.query(
          "SELECT set_config('register.publication_context',$1,true)",
          [`SUPPORT_MARKER:${forged.target}`]
        );
        await client.query(
          "INSERT INTO register.register_row VALUES ($1::bigint,'supportActivation',$2::jsonb,'fixture:forged-marker')",
          [forged.target, JSON.stringify(marker)]
        );
        const snapshotHash = (await client.query<{ hash: string }>(
          "SELECT register._snapshot_sha256($1::bigint) AS hash",
          [forged.target]
        )).rows[0]!.hash;
        await client.query(
          "SELECT set_config('register.publication_context',$1,true)",
          [`SEAL:SUPPORT_CONFIGURATION:${forged.target}`]
        );
        await client.query(`
          INSERT INTO register.register_version (
            register_version,row_count,sealed,base_register_version,publication_id,
            request_sha256,snapshot_sha256,publication_kind,recorded_at
          ) VALUES ($1::bigint,18,true,$2::bigint,$3,$4,$5,
            'SUPPORT_CONFIGURATION',$6)
        `, [
          forged.target, predecessor, randomUUID(), "0".repeat(64),
          snapshotHash, recordedAt
        ]);
      }, "debateai_register_publication_owner"));
    }
    expect(outcomes).toEqual([
      expect.stringMatching(/changed keys/u),
      expect.stringMatching(/activation change set/u),
      expect.stringMatching(/activation change set/u)
    ]);
  });

  it("serializes a concurrent same-UUID race into one publication", async () => {
    await importHistorical("4");
    const input = {
      publicationId: randomUUID(), base: "4",
      rows: [{ row_key: "race", value_json_text: "1", source_ref: "fixture:race-row" }],
      sourceRef: "fixture:race-op"
    };
    const first = await database.pool.connect();
    const second = await database.pool.connect();
    try {
      await Promise.all([first.query("BEGIN"), second.query("BEGIN")]);
      const firstReceipt = await publishGeneral(input, first);
      const secondPending = publishGeneral(input, second);
      await first.query("COMMIT");
      const secondReceipt = await secondPending;
      await second.query("COMMIT");
      expect(secondReceipt).toEqual(firstReceipt);
      expect((await database.pool.query(
        "SELECT count(*)::text AS count FROM register.register_version WHERE publication_id=$1",
        [input.publicationId]
      )).rows[0]?.count).toBe("1");
    } finally {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      first.release();
      second.release();
    }
  });

  it("serializes a concurrent same-UUID different-request-byte race before rejecting reuse", async () => {
    await importHistorical("4");
    const publicationId = randomUUID();
    const accepted = {
      publicationId, base: "4",
      rows: [{ row_key: "race", value_json_text: "1", source_ref: "fixture:byte-race" }],
      sourceRef: "fixture:byte-race"
    };
    const changed = {
      ...accepted,
      rows: [{ ...accepted.rows[0]!, value_json_text: "2" }]
    };
    const first = await database.pool.connect();
    const second = await database.pool.connect();
    try {
      await Promise.all([first.query("BEGIN"), second.query("BEGIN")]);
      const secondPid = (await second.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid"
      )).rows[0]!.pid;
      const receipt = await publishGeneral(accepted, first);
      const secondOutcome = publishGeneral(changed, second).then(
        () => null,
        (error: unknown) => error instanceof Error ? error.message : String(error)
      );
      await waitForAdvisoryBlock(secondPid);
      await first.query("COMMIT");
      expect(await settleWithin(secondOutcome, "changed-byte UUID contender"))
        .toMatch(/SUPPORT_CONFIG_OPERATION_REUSED/u);
      await second.query("ROLLBACK");

      const finalState = await database.pool.query<{
        publication_count: string; row_count: string; snapshot_sha256: string;
        value_json_text: string;
      }>(`
        SELECT count(version.*)::text AS publication_count,
          count(row.*)::text AS row_count,
          min(version.snapshot_sha256)::text AS snapshot_sha256,
          min(register.canonical_json_text(row.value_json::text)) AS value_json_text
        FROM register.register_version AS version
        JOIN register.register_row AS row USING (register_version)
        WHERE version.publication_id=$1
      `, [publicationId]);
      expect(finalState.rows[0]).toEqual({
        publication_count: "1",
        row_count: "1",
        snapshot_sha256: receipt.snapshot_sha256,
        value_json_text: "1"
      });
    } finally {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      first.release();
      second.release();
    }
  }, 30_000);

  it("serializes concurrent row-before-seal and seal-before-row schedules", async () => {
    await importHistorical("4");
    const first = await database.pool.connect();
    const second = await database.pool.connect();
    const directRows = [
      { row_key: "scheduled", value_json_text: "1", source_ref: "fixture:row-seal-race" }
    ];
    const directHash = snapshotHash(directRows);
    try {
      await Promise.all([first.query("BEGIN"), second.query("BEGIN")]);
      await Promise.all([
        first.query("SET LOCAL ROLE debateai_register_publication_owner"),
        second.query("SET LOCAL ROLE debateai_register_publication_owner")
      ]);
      const secondPid = (await second.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid"
      )).rows[0]!.pid;
      await first.query("SELECT set_config('register.publication_context','GENERAL_ROWS:50',true)");
      await first.query(
        "INSERT INTO register.register_row VALUES (50,'scheduled','1'::jsonb,'fixture:row-seal-race')"
      );
      await second.query("SELECT set_config('register.publication_context','SEAL:GENERAL:50',true)");
      const competingSeal = second.query(`
        INSERT INTO register.register_version (
          register_version,row_count,sealed,base_register_version,publication_id,
          request_sha256,snapshot_sha256,publication_kind,recorded_at
        ) VALUES (50,1,true,4,$1,$2,$3,'GENERAL',clock_timestamp())
      `, [randomUUID(), "0".repeat(64), directHash]).then(
        () => null,
        (error: unknown) => error instanceof Error ? error.message : String(error)
      );
      await waitForAdvisoryBlock(secondPid);
      await first.query("SELECT set_config('register.publication_context','SEAL:GENERAL:50',true)");
      await first.query(`
        INSERT INTO register.register_version (
          register_version,row_count,sealed,base_register_version,publication_id,
          request_sha256,snapshot_sha256,publication_kind,recorded_at
        ) VALUES (50,1,true,4,$1,$2,$3,'GENERAL',clock_timestamp())
      `, [randomUUID(), "0".repeat(64), directHash]);
      await first.query("COMMIT");
      expect(await settleWithin(competingSeal, "row-before-seal contender"))
        .toMatch(/duplicate key|register_version_pkey/u);
      await second.query("ROLLBACK");

      await Promise.all([first.query("BEGIN"), second.query("BEGIN")]);
      await Promise.all([
        first.query("SET LOCAL ROLE debateai_register_publication_owner"),
        second.query("SET LOCAL ROLE debateai_register_publication_owner")
      ]);
      await first.query("SELECT set_config('register.publication_context','GENERAL_ROWS:51',true)");
      await first.query(
        "INSERT INTO register.register_row VALUES (51,'scheduled','1'::jsonb,'fixture:row-seal-race')"
      );
      await first.query("SELECT set_config('register.publication_context','SEAL:GENERAL:51',true)");
      await first.query(`
        INSERT INTO register.register_version (
          register_version,row_count,sealed,base_register_version,publication_id,
          request_sha256,snapshot_sha256,publication_kind,recorded_at
        ) VALUES (51,1,true,4,$1,$2,$3,'GENERAL',clock_timestamp())
      `, [randomUUID(), "0".repeat(64), directHash]);
      await second.query("SELECT set_config('register.publication_context','GENERAL_ROWS:51',true)");
      const lateRow = second.query(
        "INSERT INTO register.register_row VALUES (51,'late','2'::jsonb,'fixture:late-race')"
      ).then(
        () => null,
        (error: unknown) => error instanceof Error ? error.message : String(error)
      );
      await waitForAdvisoryBlock(secondPid);
      await first.query("COMMIT");
      expect(await settleWithin(lateRow, "seal-before-row contender"))
        .toMatch(/REGISTER_PUBLICATION_LATE_ROW/u);
      await second.query("ROLLBACK");

      const finalState = await database.pool.query<{
        register_version: string; stored_count: number; actual_count: string;
        stored_hash: string; actual_hash: string; row_keys: string[];
      }>(`
        SELECT version.register_version::text,
          version.row_count AS stored_count,
          count(row.*)::text AS actual_count,
          version.snapshot_sha256::text AS stored_hash,
          register._snapshot_sha256(version.register_version) AS actual_hash,
          array_agg(row.row_key ORDER BY row.row_key) AS row_keys
        FROM register.register_version AS version
        JOIN register.register_row AS row USING (register_version)
        WHERE version.register_version IN (50,51)
        GROUP BY version.register_version
        ORDER BY version.register_version
      `);
      expect(finalState.rows).toEqual([
        {
          register_version: "50", stored_count: 1, actual_count: "1",
          stored_hash: directHash, actual_hash: directHash, row_keys: ["scheduled"]
        },
        {
          register_version: "51", stored_count: 1, actual_count: "1",
          stored_hash: directHash, actual_hash: directHash, row_keys: ["scheduled"]
        }
      ]);
    } finally {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      first.release();
      second.release();
    }
  }, 30_000);

  it("serializes a concurrent CAS race from one predecessor", async () => {
    await importHistorical("4");
    const active = await publishSupport({
      publicationId: randomUUID(), base: "4", expected: null,
      patch: [{ key: "support_enabled", value_json_text: "false" }],
      sourceRef: "fixture:cas-active"
    });
    const predecessor = active.register_version as string;
    const firstInput = {
      publicationId: randomUUID(), base: predecessor, expected: predecessor,
      patch: [{ key: "support_enabled", value_json_text: "true" }],
      sourceRef: "fixture:cas-first"
    };
    const secondInput = {
      publicationId: randomUUID(), base: predecessor, expected: predecessor,
      patch: [{ key: "support_model_ref", value_json_text: '"development:none"' }],
      sourceRef: "fixture:cas-second"
    };
    const first = await database.pool.connect();
    const second = await database.pool.connect();
    try {
      await Promise.all([first.query("BEGIN"), second.query("BEGIN")]);
      const firstReceipt = await publishSupport(firstInput, first);
      const secondPending = publishSupport(secondInput, second);
      await first.query("COMMIT");
      await expect(secondPending).rejects.toThrow(/SUPPORT_CONFIG_ACTIVATION_CONFLICT/u);
      await second.query("ROLLBACK");
      expect(firstReceipt.previous_support_register_version).toBe(predecessor);
      expect((await database.pool.query(
        "SELECT count(*)::text AS count FROM register.register_version WHERE base_register_version=$1",
        [predecessor]
      )).rows[0]?.count).toBe("1");
    } finally {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      first.release();
      second.release();
    }
  });

  it("makes rollback allocation monotonic across actual migrate replay", async () => {
    await importHistorical("4");
    const rolledBack: bigint[] = [];
    for (const enabled of ["true", "false"]) {
      const client = await database.pool.connect();
      try {
        await client.query("BEGIN");
        const input = {
          publicationId: randomUUID(), base: "4", expected: null,
          patch: [{ key: "support_enabled", value_json_text: enabled }],
          sourceRef: `fixture:rollback-${enabled}`
        };
        const receipt = await publishSupport(input, client);
        rolledBack.push(BigInt(receipt.register_version as string));
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    }
    await migrate(database.pool);
    const committed = await publishSupport({
      publicationId: randomUUID(), base: "4", expected: null,
      patch: [{ key: "support_enabled", value_json_text: "false" }],
      sourceRef: "fixture:rollback-committed"
    });
    expect(BigInt(committed.register_version as string)).toBeGreaterThan(rolledBack[0]!);
    expect(BigInt(committed.register_version as string)).toBeGreaterThan(rolledBack[1]!);
  });
});
