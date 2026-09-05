import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "../../packages/db/src/index.js";
import {
  computeRegisterSnapshotSha256,
  createPostgresRegisterPublicationPort,
  loadBootstrapRegister,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  SUPPORT_CONFIGURATION_KEYS
} from "../../packages/register/src/index.js";
import { buildDevelopmentDeploymentRegisterPublicationRows } from
  "../../apps/runner/src/dev-deployment-register.js";
import {
  PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT,
  cleanupProductionSupportConfigOperator,
  provisionProductionDatabasePrincipals
} from "../../apps/runner/src/production-database-principals.js";
import {
  loadProductionSupportConfigCliCredentials,
  withProductionSupportConfigCliConnection
} from "../../apps/runner/src/support-config-cli-credentials.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256 } from "../support/registerFixtures.js";

const MANIFEST_PATH =
  "docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json";
const ADMIN_ROLE = "debateai_prod_migrator";
const ADMIN_PASSWORD = "p3-admin-test-only-abcdefghijklmnopqrstuvwxyz-123456";
const CAPABILITY_ROLES = [
  "debateai_authorization_runtime",
  "debateai_content_provision",
  "debateai_erasure_runtime",
  "debateai_evaluator_api",
  "debateai_evaluator_reader",
  "debateai_evaluator_worker",
  "debateai_publication_cleanup",
  "debateai_replay",
  "debateai_runtime",
  "debateai_settlement_watch",
  "debateai_support_config_operator"
] as const;
const PRODUCTION_SUPPORT_VALUE_TEXT = Object.freeze<Record<string, string>>({
  support_enabled: "false",
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

type Manifest = Readonly<{
  provisioner: Readonly<{ managedPrincipalIds: readonly string[] }>;
  principals: readonly Readonly<{
    id: string;
    roleName: string;
    directMemberships: readonly string[];
    effectiveMemberships: readonly string[];
  }>[];
}>;

let database: TestDatabase;
let adminPool: Pool;
let adminDatabaseUrl: string;
let manifest: Manifest;
let credentialRoot: string;
let supportConfigCredentialFilePath: string;

type QueryHook = (
  queryText: string,
  connectionNumber: number,
  client: PoolClient
) => void | Promise<void>;

function deferred(): Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}> {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => { resolve = resolvePromise; });
  return Object.freeze({ promise, resolve });
}

function queryText(query: unknown): string {
  if (typeof query === "string") return query;
  if (typeof query === "object" && query !== null && "text" in query
    && typeof (query as { text?: unknown }).text === "string") {
    return (query as { text: string }).text;
  }
  return "";
}

function instrumentedAdminPool(hooks: Readonly<{
  beforeConnect?: (connectionAttempt: number) => void | Promise<void>;
  beforeQuery?: QueryHook;
  afterQuery?: QueryHook;
  onRelease?: (
    connectionNumber: number,
    destroy: Error | boolean | undefined,
    client: PoolClient
  ) => void;
}> = {}): Readonly<{
  pool: Pool;
  counts: {
    connects: number;
    releases: number;
    globalUnlocks: number;
    principalUnlocks: number;
  };
}> {
  const counts = { connects: 0, releases: 0, globalUnlocks: 0, principalUnlocks: 0 };
  let connectionAttempts = 0;
  const pool = {
    connect: async () => {
      connectionAttempts += 1;
      await hooks.beforeConnect?.(connectionAttempts);
      counts.connects += 1;
      const connectionNumber = counts.connects;
      const client = await adminPool.connect();
      const realQuery = client.query.bind(client) as unknown as
        (...args: unknown[]) => Promise<unknown>;
      const realRelease = client.release.bind(client);
      return {
        on: client.on.bind(client),
        off: client.off.bind(client),
        query: async (...args: unknown[]) => {
          const text = queryText(args[0]);
          await hooks.beforeQuery?.(text, connectionNumber, client);
          const result = await realQuery(...args);
          if (text.includes("pg_advisory_unlock")
            && text.includes("production-database-principals:v1")) {
            counts.globalUnlocks += 1;
          }
          if (text.includes("pg_advisory_unlock")
            && text.includes("production-support-config-operator")) {
            counts.principalUnlocks += 1;
          }
          await hooks.afterQuery?.(text, connectionNumber, client);
          return result;
        },
        release: (destroy?: Error | boolean) => {
          counts.releases += 1;
          hooks.onRelease?.(connectionNumber, destroy, client);
          realRelease(destroy);
        }
      } as unknown as PoolClient;
    }
  } as unknown as Pool;
  return Object.freeze({ pool, counts });
}

async function waitForSessionLeaseWait(): Promise<"waiting"> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const waiting = (await adminPool.query<{ waiting: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM pg_catalog.pg_stat_activity
        WHERE datname='debateai'
          AND wait_event_type='Lock'
          AND wait_event='advisory'
          AND query LIKE '%pg_advisory_lock%'
      ) AS waiting
    `)).rows[0]?.waiting;
    if (waiting === true) return "waiting";
    await delay(10);
  }
  throw new Error("session-level production principal lease was not observed waiting");
}

async function expectProductionLeasesAvailable(): Promise<void> {
  const client = await database.pool.connect();
  try {
    const leases = (await client.query<{
      globalLease: boolean;
      principalLease: boolean;
    }>(`
      SELECT
        pg_try_advisory_lock(
          hashtextextended('debateai:production-database-principals:v1',0)
        ) AS "globalLease",
        pg_try_advisory_lock(
          hashtextextended('debateai:production-support-config-operator',0)
        ) AS "principalLease"
    `)).rows[0];
    expect(leases).toEqual({ globalLease: true, principalLease: true });
  } finally {
    await client.query(`
      SELECT
        pg_advisory_unlock(
          hashtextextended('debateai:production-support-config-operator',0)
        ),
        pg_advisory_unlock(
          hashtextextended('debateai:production-database-principals:v1',0)
        )
    `).catch(() => undefined);
    client.release();
  }
}

async function credentialTemporaryFiles(): Promise<readonly string[]> {
  return (await readdir(credentialRoot))
    .filter((name) => name.startsWith(".support-config-operator.json."))
    .sort();
}

async function productionSupportState(): Promise<Readonly<{
  canLogin: boolean;
  sessionCount: number;
  credentialFileExists: boolean;
}>> {
  const row = (await adminPool.query<{ canLogin: boolean; sessionCount: number }>(`
    SELECT role.rolcanlogin AS "canLogin",(
      SELECT count(*)::integer FROM pg_catalog.pg_stat_activity
      WHERE usename='debateai_prod_support_config_operator'
    ) AS "sessionCount"
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname='debateai_prod_support_config_operator'
  `)).rows[0]!;
  const credentialFileExists = await lstat(supportConfigCredentialFilePath)
    .then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
  return Object.freeze({ ...row, credentialFileExists });
}

function adminUrlForDatabase(): string {
  const url = new URL(database.connectionString);
  url.username = ADMIN_ROLE;
  url.password = ADMIN_PASSWORD;
  url.pathname = "/debateai";
  return url.toString();
}

function credentialEnvelope(overrides: Readonly<{
  humanValidUntilByPrincipal?: Partial<Record<
    "obs-human" | "support-config-operator", Date
  >>;
  duplicatePassword?: boolean;
}> = {}) {
  const byId = new Map(manifest.principals.map((principal) => [principal.id, principal]));
  const defaultHumanValidUntil = new Date(Date.now() + 10 * 60 * 1_000);
  const credentials = manifest.provisioner.managedPrincipalIds.map((principalId, index) => {
    const principal = byId.get(principalId)!;
    const url = new URL(adminDatabaseUrl);
    url.username = principal.roleName;
    url.password = overrides.duplicatePassword
      ? "p3-shared-forbidden-password-abcdefghijklmnopqrstuvwxyz"
      : `p3-${String(index).padStart(2, "0")}-${principalId}-abcdefghijklmnopqrstuvwxyz-123456${index === 0 ? ":+/=?#@" : ""}`;
    return {
      principalId,
      databaseUrl: url.toString(),
      ...((principalId === "obs-human" || principalId === "support-config-operator")
        ? {
          validUntil: (overrides.humanValidUntilByPrincipal?.[principalId]
            ?? defaultHumanValidUntil).toISOString()
        }
        : {})
    };
  });
  return {
    format: PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT,
    credentials
  } as const;
}

function databaseUrls(envelope = credentialEnvelope()): ReadonlyMap<string, string> {
  return new Map(envelope.credentials.map(({ principalId, databaseUrl }) => [
    principalId,
    databaseUrl
  ]));
}

async function runProvisioningCli(input: unknown): Promise<Readonly<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}>> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      join(process.cwd(), "node_modules", ".bin", "tsx"),
      [
        join(process.cwd(), "apps", "runner", "src", "production-database-principals-cli.ts"),
        "--support-config-credential-file",
        supportConfigCredentialFilePath
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, MIGRATION_DATABASE_URL: adminDatabaseUrl },
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}

beforeAll(async () => {
  database = await startTestDatabase();
  manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Manifest;
  const adminValidUntil = new Date(Date.now() + 12 * 60 * 1_000).toISOString();
  const createAdmin = (await database.pool.query<{ statement: string }>(`
    SELECT format(
      'CREATE ROLE %I LOGIN INHERIT SUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L VALID UNTIL %L',
      $1::text,$2::text,$3::text
    ) AS statement
  `,[ADMIN_ROLE, ADMIN_PASSWORD, adminValidUntil])).rows[0]!.statement;
  await database.pool.query("SET password_encryption='scram-sha-256'");
  await database.pool.query(createAdmin);
  await database.pool.query(`CREATE DATABASE debateai OWNER ${ADMIN_ROLE}`);
  adminDatabaseUrl = adminUrlForDatabase();
  adminPool = createPool(adminDatabaseUrl);
  await migrate(adminPool);
  credentialRoot = await mkdtemp(join(tmpdir(), "debateai-prod-support-principal-"));
  await chmod(credentialRoot, 0o700);
  supportConfigCredentialFilePath = join(credentialRoot, "support-config-operator.json");
}, 120_000);

afterAll(async () => {
  await adminPool?.end();
  await database?.stop();
  if (credentialRoot !== undefined) {
    await rm(credentialRoot, { recursive: true, force: true });
  }
});

describe("P3-02 production database LOGIN principal provisioning", () => {
  it("creates and idempotently reuses seventeen pairwise-distinct actual LOGIN principals", async () => {
    const envelope = credentialEnvelope();
    const first = await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: envelope,
      supportConfigCredentialFilePath
    });
    expect(first).toMatchObject({
      principalCount: 17,
      createdCount: 13,
      supportConfigCredentialFilePath
    });
    expect(first.humanCredentialExpiresAtByPrincipal).toEqual({
      "obs-human": envelope.credentials.find(
        ({ principalId }) => principalId === "obs-human"
      )!.validUntil,
      "support-config-operator": envelope.credentials.find(
        ({ principalId }) => principalId === "support-config-operator"
      )!.validUntil
    });
    const supportCredential = envelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!;
    expect(JSON.parse(await readFile(supportConfigCredentialFilePath, "utf8"))).toEqual({
      databaseUrl: supportCredential.databaseUrl,
      validUntil: supportCredential.validUntil
    });
    expect((await lstat(supportConfigCredentialFilePath)).mode & 0o777).toBe(0o600);

    const second = await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: envelope,
      supportConfigCredentialFilePath
    });
    expect(second).toEqual({ ...first, createdCount: 0 });

    const managed = manifest.principals
      .filter(({ id }) => manifest.provisioner.managedPrincipalIds.includes(id));
    const roleNames = managed.map(({ roleName }) => roleName);
    const catalog = await adminPool.query<{
      rolname: string;
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
      scram: boolean;
    }>(`
      SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
        rolreplication,rolbypassrls,rolpassword LIKE 'SCRAM-SHA-256$%' AS scram
      FROM pg_catalog.pg_authid
      WHERE rolname=ANY($1::text[])
      ORDER BY rolname
    `,[roleNames]);
    expect(catalog.rows).toHaveLength(17);
    expect(catalog.rows.every((role) => role.rolcanlogin
      && !role.rolsuper
      && !role.rolcreatedb
      && !role.rolcreaterole
      && !role.rolreplication
      && !role.rolbypassrls
      && role.scram)).toBe(true);
    expect(catalog.rows.filter(({ rolname }) => rolname.startsWith("debateai_obs_"))
      .every(({ rolinherit }) => !rolinherit)).toBe(true);
    expect(catalog.rows.filter(({ rolname }) => rolname.startsWith("debateai_prod_"))
      .every(({ rolinherit }) => rolinherit)).toBe(true);

    const urls = databaseUrls(envelope);
    for (const principal of managed) {
      const loginPool = createPool(urls.get(principal.id)!);
      try {
        const witness = (await loginPool.query<{
          sessionPrincipal: string;
          principal: string;
          effectiveRoles: string[];
        }>(`
          SELECT session_user AS "sessionPrincipal",current_user AS principal,
            COALESCE((
              SELECT jsonb_agg(capability.rolname ORDER BY capability.rolname)
              FROM pg_catalog.pg_roles AS capability
              WHERE capability.rolname=ANY($1::text[])
                AND pg_has_role(current_user,capability.oid,'MEMBER')
            ),'[]'::jsonb) AS "effectiveRoles"
        `,[CAPABILITY_ROLES])).rows[0];
        expect(witness).toEqual({
          sessionPrincipal: principal.roleName,
          principal: principal.roleName,
          effectiveRoles: principal.effectiveMemberships
        });
      } finally {
        await loginPool.end();
      }
    }
  }, 120_000);

  it("repairs exact membership, option, attribute, member, and role-setting drift", async () => {
    const envelope = credentialEnvelope();
    await adminPool.query(`
      CREATE ROLE p3_forbidden_bridge NOLOGIN;
      CREATE ROLE p3_forbidden_member NOLOGIN;
      GRANT p3_forbidden_bridge TO debateai_prod_api_runtime;
      GRANT debateai_prod_api_runtime TO p3_forbidden_member;
      REVOKE debateai_runtime FROM debateai_prod_api_runtime;
      GRANT debateai_runtime TO debateai_prod_api_runtime
        WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
      ALTER ROLE debateai_prod_api_runtime CREATEDB CREATEROLE REPLICATION BYPASSRLS NOINHERIT;
      ALTER ROLE debateai_prod_api_runtime SET statement_timeout='1s';
      ALTER ROLE debateai_prod_api_runtime IN DATABASE debateai SET search_path='pg_catalog'
    `);

    await expect(provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: envelope,
      supportConfigCredentialFilePath
    })).resolves.toMatchObject({ principalCount: 17, createdCount: 0 });

    const repaired = (await adminPool.query<{
      rolinherit: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
      rolconfig: string[] | null;
      hasRoleSettings: boolean;
      directRoles: unknown;
      members: unknown;
    }>(`
      SELECT target.rolinherit,target.rolcreatedb,target.rolcreaterole,
        target.rolreplication,target.rolbypassrls,target.rolconfig,
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_db_role_setting AS setting
          WHERE setting.setrole=target.oid
        ) AS "hasRoleSettings",
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'roleName',parent.rolname,'adminOption',membership.admin_option,
            'inheritOption',membership.inherit_option,'setOption',membership.set_option
          ) ORDER BY parent.rolname)
          FROM pg_catalog.pg_auth_members AS membership
          JOIN pg_catalog.pg_roles AS parent ON parent.oid=membership.roleid
          WHERE membership.member=target.oid
        ),'[]'::jsonb) AS "directRoles",
        COALESCE((
          SELECT jsonb_agg(member.rolname ORDER BY member.rolname)
          FROM pg_catalog.pg_auth_members AS membership
          JOIN pg_catalog.pg_roles AS member ON member.oid=membership.member
          WHERE membership.roleid=target.oid
        ),'[]'::jsonb) AS members
      FROM pg_catalog.pg_roles AS target
      WHERE target.rolname='debateai_prod_api_runtime'
    `)).rows[0];
    expect(repaired).toEqual({
      rolinherit: true,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
      rolconfig: null,
      hasRoleSettings: false,
      directRoles: [{
        roleName: "debateai_runtime",
        adminOption: false,
        inheritOption: true,
        setOption: true
      }],
      members: []
    });
  }, 120_000);

  it("removes direct and transitive object ACL drift while preserving only support functions", async () => {
    const envelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: envelope,
      supportConfigCredentialFilePath
    });
    await adminPool.query(`
      CREATE ROLE p3_support_object_acl_bridge NOLOGIN;
      GRANT CONNECT,TEMPORARY ON DATABASE debateai
        TO debateai_prod_support_config_operator;
      GRANT USAGE ON SCHEMA register TO debateai_prod_support_config_operator;
      GRANT SELECT ON register.register_version TO debateai_prod_support_config_operator;
      GRANT SELECT(register_version) ON register.register_version
        TO debateai_prod_support_config_operator;
      CREATE SEQUENCE public.p3_support_object_acl_sequence;
      GRANT USAGE,SELECT ON SEQUENCE public.p3_support_object_acl_sequence
        TO debateai_prod_support_config_operator;
      GRANT EXECUTE ON FUNCTION register.claim_type_composition_map_is_valid(jsonb)
        TO debateai_prod_support_config_operator;
      GRANT SELECT ON register.register_row TO p3_support_object_acl_bridge;
      GRANT EXECUTE ON FUNCTION register.claim_type_composition_map_is_valid(jsonb)
        TO p3_support_object_acl_bridge;
      GRANT p3_support_object_acl_bridge TO debateai_prod_support_config_operator
    `);
    try {
      await expect(provisionProductionDatabasePrincipals({
        adminPool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: envelope,
        supportConfigCredentialFilePath
      })).resolves.toMatchObject({ principalCount: 17, createdCount: 0 });

      const direct = (await adminPool.query<{
        databaseAclCount: number;
        schemaAclCount: number;
        relationAclCount: number;
        columnAclCount: number;
        routineAclCount: number;
      }>(`
        WITH target AS (
          SELECT oid FROM pg_catalog.pg_roles
          WHERE rolname='debateai_prod_support_config_operator'
        )
        SELECT
          (SELECT count(*)::integer FROM pg_catalog.pg_database AS object
            CROSS JOIN LATERAL pg_catalog.aclexplode(object.datacl) AS acl
            WHERE acl.grantee=(SELECT oid FROM target)) AS "databaseAclCount",
          (SELECT count(*)::integer FROM pg_catalog.pg_namespace AS object
            CROSS JOIN LATERAL pg_catalog.aclexplode(object.nspacl) AS acl
            WHERE acl.grantee=(SELECT oid FROM target)) AS "schemaAclCount",
          (SELECT count(*)::integer FROM pg_catalog.pg_class AS object
            CROSS JOIN LATERAL pg_catalog.aclexplode(object.relacl) AS acl
            WHERE acl.grantee=(SELECT oid FROM target)) AS "relationAclCount",
          (SELECT count(*)::integer FROM pg_catalog.pg_attribute AS object
            CROSS JOIN LATERAL pg_catalog.aclexplode(object.attacl) AS acl
            WHERE acl.grantee=(SELECT oid FROM target)) AS "columnAclCount",
          (SELECT count(*)::integer FROM pg_catalog.pg_proc AS object
            CROSS JOIN LATERAL pg_catalog.aclexplode(object.proacl) AS acl
            WHERE acl.grantee=(SELECT oid FROM target)) AS "routineAclCount"
      `)).rows[0];
      expect(direct).toEqual({
        databaseAclCount: 0,
        schemaAclCount: 0,
        relationAclCount: 0,
        columnAclCount: 0,
        routineAclCount: 0
      });

      const supportUrl = envelope.credentials.find(
        ({ principalId }) => principalId === "support-config-operator"
      )!.databaseUrl;
      const operatorPool = createPool(supportUrl);
      try {
        const executable = await operatorPool.query<{
          signature: string;
          allowed: boolean;
        }>(`
          SELECT function.oid::regprocedure::text AS signature,
            has_function_privilege(current_user,function.oid,'EXECUTE') AS allowed
          FROM pg_catalog.pg_proc AS function
          JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=function.pronamespace
          WHERE namespace.nspname='register'
          ORDER BY function.oid::regprocedure::text
        `);
        expect(executable.rows.filter(({ allowed }) => allowed).map(({ signature }) => signature))
          .toEqual([
            "register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)",
            "register.read_support_configuration_status()"
          ]);
        await expect(operatorPool.query("SELECT * FROM register.register_version LIMIT 1"))
          .rejects.toMatchObject({ code: "42501" });
        await expect(operatorPool.query(
          "SELECT register.claim_type_composition_map_is_valid('{}'::jsonb)"
        )).rejects.toMatchObject({ code: "42501" });
        await expect(operatorPool.query<{ allowed: boolean }>(`
          SELECT pg_catalog.has_sequence_privilege(current_user,$1::text,'USAGE') AS allowed
        `, ["public.p3_support_object_acl_sequence"])).resolves.toMatchObject({
          rows: [{ allowed: false }]
        });
      } finally {
        await operatorPool.end();
      }
    } finally {
      await adminPool.query(`
        REVOKE ALL PRIVILEGES ON register.register_row FROM p3_support_object_acl_bridge;
        REVOKE ALL PRIVILEGES ON FUNCTION register.claim_type_composition_map_is_valid(jsonb)
          FROM p3_support_object_acl_bridge;
        DROP SEQUENCE IF EXISTS public.p3_support_object_acl_sequence;
        DROP ROLE p3_support_object_acl_bridge
      `).catch(() => undefined);
    }
  }, 120_000);

  it("rejects duplicate credential material, unsafe JIT expiry, and a service authority before work", async () => {
    const sentinel = "PREEXISTING-CREDENTIAL-TARGET\n";
    await writeFile(supportConfigCredentialFilePath, sentinel, { mode: 0o600 });
    await expect(provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: credentialEnvelope({ duplicatePassword: true }),
      supportConfigCredentialFilePath
    })).rejects.toThrow("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
    await expect(readFile(supportConfigCredentialFilePath, "utf8")).resolves.toBe(sentinel);

    const queryBearingEnvelope = structuredClone(credentialEnvelope()) as {
      credentials: Array<{ principalId: string; databaseUrl: string }>;
    };
    const queryBearingSupportCredential = queryBearingEnvelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!;
    queryBearingSupportCredential.databaseUrl += "?sslmode=disable";
    await expect(provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: queryBearingEnvelope,
      supportConfigCredentialFilePath
    })).rejects.toThrow("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
    await expect(readFile(supportConfigCredentialFilePath, "utf8")).resolves.toBe(sentinel);

    await expect(provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: credentialEnvelope({
        humanValidUntilByPrincipal: {
          "obs-human": new Date(Date.now() + 59 * 1_000)
        }
      }),
      supportConfigCredentialFilePath
    })).rejects.toThrow("PRODUCTION_DATABASE_JIT_EXPIRY_INVALID");
    await expect(readFile(supportConfigCredentialFilePath, "utf8")).resolves.toBe(sentinel);

    await expect(provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: credentialEnvelope({
        humanValidUntilByPrincipal: {
          "support-config-operator": new Date(Date.now() + 30 * 60 * 1_000)
        }
      }),
      supportConfigCredentialFilePath
    })).rejects.toThrow("PRODUCTION_DATABASE_JIT_EXPIRY_INVALID");
    await expect(readFile(supportConfigCredentialFilePath, "utf8")).resolves.toBe(sentinel);

    const purposeReuse = structuredClone(manifest) as unknown as {
      principals: Array<{ id: string; kind?: string }>;
    };
    const supportPrincipal = purposeReuse.principals.find(
      ({ id }) => id === "support-config-operator"
    )!;
    supportPrincipal.kind = "SERVICE";
    await expect(provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest: purposeReuse,
      credentialEnvelope: credentialEnvelope(),
      supportConfigCredentialFilePath
    })).rejects.toThrow("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
    await expect(readFile(supportConfigCredentialFilePath, "utf8")).resolves.toBe(sentinel);

    await expect(provisionProductionDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: credentialEnvelope(),
      supportConfigCredentialFilePath
    })).rejects.toThrow("PRODUCTION_DATABASE_PRINCIPAL_ADMIN_REQUIRED");
  }, 120_000);

  it("preserves an exclusively-created foreign temporary file on a credential collision", async () => {
    const collisionBytes = Buffer.from("FOREIGN-TEMPORARY-CREDENTIAL-SENTINEL\n", "utf8");
    const deterministicRandomBytes = Buffer.alloc(16, 0x42);
    const collisionPath = join(
      credentialRoot,
      `.support-config-operator.json.${process.pid}.${deterministicRandomBytes.toString("hex")}.tmp`
    );
    const mutableCrypto = createRequire(import.meta.url)("node:crypto") as {
      randomBytes: (size: number) => Buffer;
    };
    const originalRandomBytes = mutableCrypto.randomBytes;
    await rm(supportConfigCredentialFilePath, { force: true });
    await writeFile(collisionPath, collisionBytes, { mode: 0o600, flag: "wx" });
    mutableCrypto.randomBytes = (size: number) => {
      expect(size).toBe(16);
      return Buffer.from(deterministicRandomBytes);
    };
    syncBuiltinESMExports();
    try {
      await expect(provisionProductionDatabasePrincipals({
        adminPool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope(),
        supportConfigCredentialFilePath
      })).rejects.toThrow("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_WRITE_FAILED");
      await expect(readFile(collisionPath)).resolves.toEqual(collisionBytes);
      await expect(lstat(supportConfigCredentialFilePath))
        .rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      mutableCrypto.randomBytes = originalRandomBytes;
      syncBuiltinESMExports();
      await rm(collisionPath, { force: true });
    }
  }, 120_000);

  it("cleans its own temporary inode after write, fsync, and rename failures", async () => {
    type OpenFunction = typeof import("node:fs/promises").open;
    const mutableFsPromises = createRequire(import.meta.url)("node:fs/promises") as {
      open: OpenFunction;
    };
    const originalOpen = mutableFsPromises.open;
    await rm(supportConfigCredentialFilePath, { recursive: true, force: true });

    for (const stage of ["writeFile", "sync"] as const) {
      const before = await credentialTemporaryFiles();
      let injected = false;
      mutableFsPromises.open = (async (...args: Parameters<OpenFunction>) => {
        const handle = await originalOpen(...args);
        if (String(args[0]).endsWith(".tmp")) {
          Object.defineProperty(handle, stage, {
            configurable: true,
            value: async () => {
              injected = true;
              throw new Error(`injected credential ${stage} failure`);
            }
          });
        }
        return handle;
      }) as OpenFunction;
      syncBuiltinESMExports();
      const observed = instrumentedAdminPool();
      try {
        const failure = await provisionProductionDatabasePrincipals({
          adminPool: observed.pool,
          adminDatabaseUrl,
          manifest,
          credentialEnvelope: credentialEnvelope(),
          supportConfigCredentialFilePath
        }).then(() => undefined, (error: unknown) => error);
        expect(failure).toMatchObject({
          message: "PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_WRITE_FAILED"
        });
      } finally {
        mutableFsPromises.open = originalOpen;
        syncBuiltinESMExports();
      }
      expect(injected).toBe(true);
      expect(await credentialTemporaryFiles()).toEqual(before);
      expect(observed.counts).toEqual({
        connects: 3,
        releases: 3,
        globalUnlocks: 1,
        principalUnlocks: 1
      });
      await expectProductionLeasesAvailable();
    }

    const beforeRenameFailure = await credentialTemporaryFiles();
    await mkdir(supportConfigCredentialFilePath, { mode: 0o700 });
    const observedRenameFailure = instrumentedAdminPool();
    try {
      await expect(provisionProductionDatabasePrincipals({
        adminPool: observedRenameFailure.pool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope(),
        supportConfigCredentialFilePath
      })).rejects.toThrow("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_WRITE_FAILED");
      expect((await lstat(supportConfigCredentialFilePath)).isDirectory()).toBe(true);
      expect(await credentialTemporaryFiles()).toEqual(beforeRenameFailure);
      expect(observedRenameFailure.counts).toEqual({
        connects: 3,
        releases: 3,
        globalUnlocks: 1,
        principalUnlocks: 1
      });
      await expectProductionLeasesAvailable();
    } finally {
      await rm(supportConfigCredentialFilePath, { recursive: true, force: true });
    }
  }, 120_000);

  it("compensates a post-publication database attestation failure and restores the prior target", async () => {
    const initialEnvelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: initialEnvelope,
      supportConfigCredentialFilePath
    });
    const priorBytes = await readFile(supportConfigCredentialFilePath);
    const priorMode = (await lstat(supportConfigCredentialFilePath)).mode & 0o777;
    const failedEnvelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "obs-human": new Date(Date.now() + 9 * 60 * 1_000),
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    const failedSupportUrl = failedEnvelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!.databaseUrl;
    let exactStateQueries = 0;
    let injected = false;
    const observed = instrumentedAdminPool({
      beforeQuery: (text) => {
        if (text.includes("FROM pg_catalog.pg_authid AS target")) {
          exactStateQueries += 1;
          if (exactStateQueries === 2) {
            injected = true;
            throw new Error("injected post-publication database attestation failure");
          }
        }
      }
    });

    await expect(provisionProductionDatabasePrincipals({
      adminPool: observed.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: failedEnvelope,
      supportConfigCredentialFilePath
    })).rejects.toThrow("injected post-publication database attestation failure");

    expect(injected).toBe(true);
    await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
    expect((await lstat(supportConfigCredentialFilePath)).mode & 0o777).toBe(priorMode);
    const failedCredentialPool = createPool(failedSupportUrl);
    try {
      await expect(failedCredentialPool.query("SELECT 1")).rejects.toBeDefined();
    } finally {
      await failedCredentialPool.end();
    }
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: true
    });
    expect(await credentialTemporaryFiles()).toEqual([]);
    expect(observed.counts).toEqual({
      connects: 3,
      releases: 3,
      globalUnlocks: 1,
      principalUnlocks: 1
    });
    await expectProductionLeasesAvailable();
  }, 120_000);

  it("compensates a post-publication database attestation failure with no prior target", async () => {
    await rm(supportConfigCredentialFilePath, { force: true });
    const failedEnvelope = credentialEnvelope();
    const failedSupportUrl = failedEnvelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!.databaseUrl;
    let exactStateQueries = 0;
    const observed = instrumentedAdminPool({
      beforeQuery: (text) => {
        if (text.includes("FROM pg_catalog.pg_authid AS target")
          && ++exactStateQueries === 2) {
          throw new Error("injected post-publication no-prior attestation failure");
        }
      }
    });

    await expect(provisionProductionDatabasePrincipals({
      adminPool: observed.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: failedEnvelope,
      supportConfigCredentialFilePath
    })).rejects.toThrow("injected post-publication no-prior attestation failure");

    await expect(lstat(supportConfigCredentialFilePath))
      .rejects.toMatchObject({ code: "ENOENT" });
    const failedCredentialPool = createPool(failedSupportUrl);
    try {
      await expect(failedCredentialPool.query("SELECT 1")).rejects.toBeDefined();
    } finally {
      await failedCredentialPool.end();
    }
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: false
    });
    expect(await credentialTemporaryFiles()).toEqual([]);
    expect(observed.counts).toEqual({
      connects: 3,
      releases: 3,
      globalUnlocks: 1,
      principalUnlocks: 1
    });
  }, 120_000);

  it("compensates an indeterminate commit acknowledgement before credential publication", async () => {
    const initialEnvelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: initialEnvelope,
      supportConfigCredentialFilePath
    });
    const priorBytes = await readFile(supportConfigCredentialFilePath);
    const failedEnvelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    const failedSupportUrl = failedEnvelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!.databaseUrl;
    let commitAcknowledgementFailureInjected = false;
    const observed = instrumentedAdminPool({
      afterQuery: (text) => {
        if (!commitAcknowledgementFailureInjected && text.trim() === "COMMIT") {
          commitAcknowledgementFailureInjected = true;
          throw new Error("injected indeterminate commit acknowledgement failure");
        }
      }
    });

    await expect(provisionProductionDatabasePrincipals({
      adminPool: observed.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: failedEnvelope,
      supportConfigCredentialFilePath
    })).rejects.toThrow("PRODUCTION_DATABASE_PRINCIPAL_PROVISIONING_FAILED");

    expect(commitAcknowledgementFailureInjected).toBe(true);
    await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
    const failedCredentialPool = createPool(failedSupportUrl);
    try {
      await expect(failedCredentialPool.query("SELECT 1")).rejects.toBeDefined();
    } finally {
      await failedCredentialPool.end();
    }
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: true
    });
    expect(observed.counts).toEqual({
      connects: 3,
      releases: 3,
      globalUnlocks: 1,
      principalUnlocks: 1
    });
  }, 120_000);

  it("compensates a published credential file attestation failure", async () => {
    const initialEnvelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: initialEnvelope,
      supportConfigCredentialFilePath
    });
    const priorBytes = await readFile(supportConfigCredentialFilePath);
    const failedEnvelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    let exactStateQueries = 0;
    let invalidatedPublishedFile = false;
    const observed = instrumentedAdminPool({
      afterQuery: async (text) => {
        if (text.includes("FROM pg_catalog.pg_authid AS target")
          && ++exactStateQueries === 2) {
          invalidatedPublishedFile = true;
          await chmod(supportConfigCredentialFilePath, 0o640);
        }
      }
    });

    await expect(provisionProductionDatabasePrincipals({
      adminPool: observed.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: failedEnvelope,
      supportConfigCredentialFilePath
    })).rejects.toThrow("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");

    expect(invalidatedPublishedFile).toBe(true);
    await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
    expect((await lstat(supportConfigCredentialFilePath)).mode & 0o777).toBe(0o600);
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: true
    });
    expect(await credentialTemporaryFiles()).toEqual([]);
  }, 120_000);

  it("restores prior bytes when final backup-removal durability fails", async () => {
    type OpenFunction = typeof import("node:fs/promises").open;
    const mutableFsPromises = createRequire(import.meta.url)("node:fs/promises") as {
      open: OpenFunction;
    };
    const originalOpen = mutableFsPromises.open;
    const initialEnvelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: initialEnvelope,
      supportConfigCredentialFilePath
    });
    const priorBytes = await readFile(supportConfigCredentialFilePath);
    let parentSyncCount = 0;
    let finalizationFailureInjected = false;
    mutableFsPromises.open = (async (...args: Parameters<OpenFunction>) => {
      const handle = await originalOpen(...args);
      if (String(args[0]) === credentialRoot) {
        const originalSync = handle.sync.bind(handle);
        Object.defineProperty(handle, "sync", {
          configurable: true,
          value: async () => {
            parentSyncCount += 1;
            if (parentSyncCount === 4) {
              finalizationFailureInjected = true;
              throw new Error("injected final backup-removal directory fsync failure");
            }
            await originalSync();
          }
        });
      }
      return handle;
    }) as OpenFunction;
    syncBuiltinESMExports();
    let failure: unknown;
    try {
      failure = await provisionProductionDatabasePrincipals({
        adminPool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope({
          humanValidUntilByPrincipal: {
            "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
          }
        }),
        supportConfigCredentialFilePath
      }).then(() => undefined, (error: unknown) => error);
    } finally {
      mutableFsPromises.open = originalOpen;
      syncBuiltinESMExports();
    }

    expect(finalizationFailureInjected).toBe(true);
    expect(failure).toMatchObject({
      message: "injected final backup-removal directory fsync failure"
    });
    await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
    expect((await lstat(supportConfigCredentialFilePath)).mode & 0o777).toBe(0o600);
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: true
    });
    expect(await credentialTemporaryFiles()).toEqual([]);
  }, 120_000);

  it("recovers indeterminate backup-link and target-rename acknowledgements", async () => {
    type LinkFunction = typeof import("node:fs/promises").link;
    type RenameFunction = typeof import("node:fs/promises").rename;
    const mutableFsPromises = createRequire(import.meta.url)("node:fs/promises") as {
      link: LinkFunction;
      rename: RenameFunction;
    };
    const originalLink = mutableFsPromises.link;
    const originalRename = mutableFsPromises.rename;
    const outcomes: Array<Readonly<{
      stage: "backup-link" | "target-rename";
      bytesPreserved: boolean;
      residue: readonly string[];
    }>> = [];

    for (const stage of ["backup-link", "target-rename"] as const) {
      await provisionProductionDatabasePrincipals({
        adminPool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope(),
        supportConfigCredentialFilePath
      });
      const priorBytes = await readFile(supportConfigCredentialFilePath);
      let injected = false;
      mutableFsPromises.link = (async (...args: Parameters<LinkFunction>) => {
        const result = await originalLink(...args);
        if (stage === "backup-link"
          && !injected
          && String(args[1]).endsWith(".backup")) {
          injected = true;
          throw new Error("injected indeterminate backup-link acknowledgement");
        }
        return result;
      }) as LinkFunction;
      mutableFsPromises.rename = (async (...args: Parameters<RenameFunction>) => {
        const result = await originalRename(...args);
        if (stage === "target-rename"
          && !injected
          && String(args[0]).endsWith(".tmp")
          && String(args[1]) === supportConfigCredentialFilePath) {
          injected = true;
          throw new Error("injected indeterminate target-rename acknowledgement");
        }
        return result;
      }) as RenameFunction;
      syncBuiltinESMExports();
      try {
        await expect(provisionProductionDatabasePrincipals({
          adminPool,
          adminDatabaseUrl,
          manifest,
          credentialEnvelope: credentialEnvelope({
            humanValidUntilByPrincipal: {
              "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
            }
          }),
          supportConfigCredentialFilePath
        })).rejects.toBeDefined();
      } finally {
        mutableFsPromises.link = originalLink;
        mutableFsPromises.rename = originalRename;
        syncBuiltinESMExports();
      }
      const residue = await credentialTemporaryFiles();
      outcomes.push(Object.freeze({
        stage,
        bytesPreserved: (await readFile(supportConfigCredentialFilePath)).equals(priorBytes),
        residue
      }));
      for (const name of residue) {
        await rm(join(credentialRoot, name), { force: true });
      }
    }

    expect(outcomes).toEqual([
      { stage: "backup-link", bytesPreserved: true, residue: [] },
      { stage: "target-rename", bytesPreserved: true, residue: [] }
    ]);
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: true
    });
  }, 120_000);

  it("retries a failed prior-target restore and surfaces both failures", async () => {
    type RenameFunction = typeof import("node:fs/promises").rename;
    const mutableFsPromises = createRequire(import.meta.url)("node:fs/promises") as {
      rename: RenameFunction;
    };
    const originalRename = mutableFsPromises.rename;
    const initialEnvelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: initialEnvelope,
      supportConfigCredentialFilePath
    });
    const priorBytes = await readFile(supportConfigCredentialFilePath);
    const failedEnvelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    let exactStateQueries = 0;
    let restoreFailureInjected = false;
    const observed = instrumentedAdminPool({
      beforeQuery: (text) => {
        if (text.includes("FROM pg_catalog.pg_authid AS target")
          && ++exactStateQueries === 2) {
          throw new Error("original post-publication failure");
        }
      }
    });
    mutableFsPromises.rename = (async (...args: Parameters<RenameFunction>) => {
      const [from, to] = args;
      if (!restoreFailureInjected
        && String(from).endsWith(".backup")
        && String(to) === supportConfigCredentialFilePath) {
        restoreFailureInjected = true;
        throw new Error("injected prior-target restore failure");
      }
      return originalRename(...args);
    }) as RenameFunction;
    syncBuiltinESMExports();
    let failure: unknown;
    try {
      failure = await provisionProductionDatabasePrincipals({
        adminPool: observed.pool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: failedEnvelope,
        supportConfigCredentialFilePath
      }).then(() => undefined, (error: unknown) => error);
    } finally {
      mutableFsPromises.rename = originalRename;
      syncBuiltinESMExports();
    }

    expect(restoreFailureInjected).toBe(true);
    expect(failure).toMatchObject({
      message: "PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_FAILED",
      cause: expect.any(AggregateError)
    });
    const errors = (failure as { cause: AggregateError }).cause.errors.map(String);
    expect(errors.some((error) => error.includes("original post-publication failure"))).toBe(true);
    expect(errors.some((error) => error.includes("prior-target restore failure"))).toBe(true);
    await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: true
    });
    expect(await credentialTemporaryFiles()).toEqual([]);
  }, 120_000);

  it("retries a failed new-target removal and surfaces both failures", async () => {
    type UnlinkFunction = typeof import("node:fs/promises").unlink;
    const mutableFsPromises = createRequire(import.meta.url)("node:fs/promises") as {
      unlink: UnlinkFunction;
    };
    const originalUnlink = mutableFsPromises.unlink;
    await rm(supportConfigCredentialFilePath, { force: true });
    let exactStateQueries = 0;
    let removalFailureInjected = false;
    const observed = instrumentedAdminPool({
      beforeQuery: (text) => {
        if (text.includes("FROM pg_catalog.pg_authid AS target")
          && ++exactStateQueries === 2) {
          throw new Error("original no-prior publication failure");
        }
      }
    });
    mutableFsPromises.unlink = (async (...args: Parameters<UnlinkFunction>) => {
      if (!removalFailureInjected && String(args[0]) === supportConfigCredentialFilePath) {
        removalFailureInjected = true;
        throw new Error("injected new-target removal failure");
      }
      return originalUnlink(...args);
    }) as UnlinkFunction;
    syncBuiltinESMExports();
    let failure: unknown;
    try {
      failure = await provisionProductionDatabasePrincipals({
        adminPool: observed.pool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope(),
        supportConfigCredentialFilePath
      }).then(() => undefined, (error: unknown) => error);
    } finally {
      mutableFsPromises.unlink = originalUnlink;
      syncBuiltinESMExports();
    }

    expect(removalFailureInjected).toBe(true);
    expect(failure).toMatchObject({
      message: "PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_FAILED",
      cause: expect.any(AggregateError)
    });
    const errors = (failure as { cause: AggregateError }).cause.errors.map(String);
    expect(errors.some((error) => error.includes("original no-prior publication failure")))
      .toBe(true);
    expect(errors.some((error) => error.includes("new-target removal failure"))).toBe(true);
    await expect(lstat(supportConfigCredentialFilePath))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: false
    });
    expect(await credentialTemporaryFiles()).toEqual([]);
  }, 120_000);

  it("keeps unsafe recovery pending and serialized beyond the former retry budget", async () => {
    const initialEnvelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: initialEnvelope,
      supportConfigCredentialFilePath
    });
    const priorBytes = await readFile(supportConfigCredentialFilePath);
    const failedEnvelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    const thirdRecoveryDelay = deferred();
    const liftRecovery = deferred();
    const safeBeforeRelease = deferred();
    const allowRelease = deferred();
    let exactStateQueries = 0;
    let publicationFailureInjected = false;
    let recoveryLifted = false;
    let recoveryDelayCount = 0;
    const observed = instrumentedAdminPool({
      beforeQuery: async (text) => {
        if (text.includes("FROM pg_catalog.pg_authid AS target")
          && ++exactStateQueries === 2) {
          publicationFailureInjected = true;
          throw new Error("original persistent-recovery publication failure");
        }
        if (publicationFailureInjected
          && !recoveryLifted
          && text.includes("debateai_prod_support_config_operator")
          && text.includes("NOLOGIN")) {
          throw new Error("injected persistent compensation NOLOGIN failure");
        }
        if (publicationFailureInjected
          && recoveryLifted
          && text.includes("pg_advisory_unlock")
          && text.includes("production-support-config-operator")) {
          safeBeforeRelease.resolve();
          await allowRelease.promise;
        }
      }
    });
    let originalSettled = false;
    const originalOutcome = provisionProductionDatabasePrincipals({
      adminPool: observed.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: failedEnvelope,
      supportConfigCredentialFilePath,
      recoveryBackoff: async () => {
        recoveryDelayCount += 1;
        if (recoveryDelayCount >= 3) {
          thirdRecoveryDelay.resolve();
          await liftRecovery.promise;
        }
      }
    }).then(
      (value) => {
        originalSettled = true;
        return { status: "fulfilled" as const, value };
      },
      (reason: unknown) => {
        originalSettled = true;
        return { status: "rejected" as const, reason };
      }
    );
    const reachedThirdDelay = await Promise.race([
      thirdRecoveryDelay.promise.then(() => true),
      delay(2_000).then(() => false)
    ]);
    if (!reachedThirdDelay) {
      recoveryLifted = true;
      liftRecovery.resolve();
      allowRelease.resolve();
      await originalOutcome;
    }
    expect(reachedThirdDelay).toBe(true);
    expect(originalSettled).toBe(false);

    const cleanupPromise = cleanupProductionSupportConfigOperator({
      adminPool,
      supportConfigCredentialFilePath
    });
    await expect(waitForSessionLeaseWait()).resolves.toBe("waiting");
    recoveryLifted = true;
    liftRecovery.resolve();
    await safeBeforeRelease.promise;

    expect(originalSettled).toBe(false);
    await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: true
    });
    expect(await credentialTemporaryFiles()).toEqual([]);

    allowRelease.resolve();
    const outcome = await originalOutcome;
    expect(outcome).toMatchObject({
      status: "rejected",
      reason: {
        message: "PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_FAILED",
        cause: expect.any(AggregateError)
      }
    });
    await expect(cleanupPromise).resolves.toMatchObject({
      supportConfigCredentialFilePath
    });
    expect(observed.counts).toEqual({
      connects: 6,
      releases: 6,
      globalUnlocks: 1,
      principalUnlocks: 1
    });
    await expectProductionLeasesAvailable();
  }, 120_000);

  it("recovers persistent query, commit, and connection faults on fresh work clients", async () => {
    for (const recoveryStage of ["query", "COMMIT", "connect"] as const) {
      await provisionProductionDatabasePrincipals({
        adminPool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope(),
        supportConfigCredentialFilePath
      });
      const priorBytes = await readFile(supportConfigCredentialFilePath);
      let exactStateQueries = 0;
      let publicationFailureInjected = false;
      let recoveryLifted = false;
      let recoveryDelayCount = 0;
      const thirdRecoveryDelay = deferred();
      const liftRecovery = deferred();
      const observed = instrumentedAdminPool({
        beforeConnect: () => {
          if (recoveryStage === "connect"
            && publicationFailureInjected
            && !recoveryLifted) {
            throw new Error("injected persistent recovery connection failure");
          }
        },
        beforeQuery: (text) => {
          if (text.includes("FROM pg_catalog.pg_authid AS target")
            && ++exactStateQueries === 2) {
            publicationFailureInjected = true;
            throw new Error(`original publication failure before recovery ${recoveryStage}`);
          }
          if (!publicationFailureInjected || recoveryLifted) return;
          if (recoveryStage === "query"
            && text.trim() === "SELECT pg_catalog.pg_stat_clear_snapshot()") {
            throw new Error("injected persistent recovery query failure");
          }
          if (recoveryStage === "COMMIT" && text.trim() === "COMMIT") {
            throw new Error("injected persistent recovery COMMIT failure");
          }
        }
      });
      let settled = false;
      const outcomePromise = provisionProductionDatabasePrincipals({
        adminPool: observed.pool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope({
          humanValidUntilByPrincipal: {
            "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
          }
        }),
        supportConfigCredentialFilePath,
        recoveryBackoff: async () => {
          recoveryDelayCount += 1;
          if (recoveryDelayCount >= 3) {
            thirdRecoveryDelay.resolve();
            await liftRecovery.promise;
          }
        }
      }).then(
        () => { settled = true; return undefined; },
        (error: unknown) => { settled = true; return error; }
      );
      const reachedThirdDelay = await Promise.race([
        thirdRecoveryDelay.promise.then(() => true),
        delay(2_000).then(() => false)
      ]);
      if (!reachedThirdDelay) {
        recoveryLifted = true;
        liftRecovery.resolve();
        await outcomePromise;
      }
      expect(reachedThirdDelay).toBe(true);
      expect(settled).toBe(false);
      recoveryLifted = true;
      liftRecovery.resolve();
      const outcome = await outcomePromise;

      expect(outcome).toMatchObject({
        message: "PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_FAILED",
        cause: expect.any(AggregateError)
      });
      await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
      expect(await productionSupportState()).toEqual({
        canLogin: false,
        sessionCount: 0,
        credentialFileExists: true
      });
      expect(observed.counts).toEqual({
        connects: recoveryStage === "connect" ? 3 : 6,
        releases: recoveryStage === "connect" ? 3 : 6,
        globalUnlocks: 1,
        principalUnlocks: 1
      });
      await expectProductionLeasesAvailable();
    }
  }, 120_000);

  it("keeps prior restore, no-prior removal, and their directory syncs pending until durable", async () => {
    type RenameFunction = typeof import("node:fs/promises").rename;
    type UnlinkFunction = typeof import("node:fs/promises").unlink;
    type OpenFunction = typeof import("node:fs/promises").open;
    const mutableFsPromises = createRequire(import.meta.url)("node:fs/promises") as {
      rename: RenameFunction;
      unlink: UnlinkFunction;
      open: OpenFunction;
    };
    const originalRename = mutableFsPromises.rename;
    const originalUnlink = mutableFsPromises.unlink;
    const originalOpen = mutableFsPromises.open;

    for (const recoveryStage of [
      "prior-restore",
      "no-prior-removal",
      "restore-directory-sync",
      "removal-directory-sync"
    ] as const) {
      const hasPrior = recoveryStage === "prior-restore"
        || recoveryStage === "restore-directory-sync";
      if (hasPrior) {
        await provisionProductionDatabasePrincipals({
          adminPool,
          adminDatabaseUrl,
          manifest,
          credentialEnvelope: credentialEnvelope(),
          supportConfigCredentialFilePath
        });
      } else {
        await rm(supportConfigCredentialFilePath, { force: true });
      }
      const priorBytes = hasPrior ? await readFile(supportConfigCredentialFilePath) : null;
      let exactStateQueries = 0;
      let publicationFailureInjected = false;
      let recoveryLifted = false;
      let recoveryDelayCount = 0;
      let recoveryMutationObserved = false;
      const thirdRecoveryDelay = deferred();
      const liftRecovery = deferred();
      const observed = instrumentedAdminPool({
        beforeQuery: (text) => {
          if (text.includes("FROM pg_catalog.pg_authid AS target")
            && ++exactStateQueries === 2) {
            publicationFailureInjected = true;
            throw new Error(`original publication failure before ${recoveryStage}`);
          }
        }
      });
      mutableFsPromises.rename = (async (...args: Parameters<RenameFunction>) => {
        const [from, to] = args;
        if (publicationFailureInjected
          && String(from).endsWith(".backup")
          && String(to) === supportConfigCredentialFilePath) {
          if (recoveryStage === "prior-restore" && !recoveryLifted) {
            throw new Error("injected persistent prior-target restore failure");
          }
          const result = await originalRename(...args);
          if (recoveryStage === "restore-directory-sync") {
            recoveryMutationObserved = true;
          }
          return result;
        }
        return originalRename(...args);
      }) as RenameFunction;
      mutableFsPromises.unlink = (async (...args: Parameters<UnlinkFunction>) => {
        if (publicationFailureInjected
          && String(args[0]) === supportConfigCredentialFilePath) {
          if (recoveryStage === "no-prior-removal" && !recoveryLifted) {
            throw new Error("injected persistent no-prior removal failure");
          }
          const result = await originalUnlink(...args);
          if (recoveryStage === "removal-directory-sync") {
            recoveryMutationObserved = true;
          }
          return result;
        }
        return originalUnlink(...args);
      }) as UnlinkFunction;
      mutableFsPromises.open = (async (...args: Parameters<OpenFunction>) => {
        const handle = await originalOpen(...args);
        if (String(args[0]) === credentialRoot
          && recoveryMutationObserved
          && !recoveryLifted) {
          Object.defineProperty(handle, "sync", {
            configurable: true,
            value: async () => {
              throw new Error(`injected persistent ${recoveryStage} failure`);
            }
          });
        }
        return handle;
      }) as OpenFunction;
      syncBuiltinESMExports();

      let settled = false;
      const outcomePromise = provisionProductionDatabasePrincipals({
        adminPool: observed.pool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope({
          humanValidUntilByPrincipal: {
            "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
          }
        }),
        supportConfigCredentialFilePath,
        recoveryBackoff: async () => {
          recoveryDelayCount += 1;
          if (recoveryDelayCount >= 3) {
            thirdRecoveryDelay.resolve();
            await liftRecovery.promise;
          }
        }
      }).then(
        () => { settled = true; return undefined; },
        (error: unknown) => { settled = true; return error; }
      );
      try {
        const reachedThirdDelay = await Promise.race([
          thirdRecoveryDelay.promise.then(() => true),
          delay(2_000).then(() => false)
        ]);
        if (!reachedThirdDelay) {
          recoveryLifted = true;
          liftRecovery.resolve();
          await outcomePromise;
        }
        expect(reachedThirdDelay).toBe(true);
        expect(settled).toBe(false);
        recoveryLifted = true;
        liftRecovery.resolve();
        const outcome = await outcomePromise;

        expect(outcome).toMatchObject({
          message: "PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_FAILED",
          cause: expect.any(AggregateError)
        });
        if (priorBytes === null) {
          await expect(lstat(supportConfigCredentialFilePath))
            .rejects.toMatchObject({ code: "ENOENT" });
        } else {
          await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
        }
        expect(await productionSupportState()).toEqual({
          canLogin: false,
          sessionCount: 0,
          credentialFileExists: hasPrior
        });
        expect(await credentialTemporaryFiles()).toEqual([]);
        expect(observed.counts).toEqual({
          connects: 6,
          releases: 6,
          globalUnlocks: 1,
          principalUnlocks: 1
        });
      } finally {
        recoveryLifted = true;
        liftRecovery.resolve();
        await outcomePromise;
        mutableFsPromises.rename = originalRename;
        mutableFsPromises.unlink = originalUnlink;
        mutableFsPromises.open = originalOpen;
        syncBuiltinESMExports();
      }
      await expectProductionLeasesAvailable();
    }
  }, 120_000);

  it("keeps recovery pending through persistent termination and terminal-census faults", async () => {
    for (const recoveryStage of ["termination", "census"] as const) {
      await provisionProductionDatabasePrincipals({
        adminPool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope(),
        supportConfigCredentialFilePath
      });
      const priorBytes = await readFile(supportConfigCredentialFilePath);
      const failedEnvelope = credentialEnvelope({
        humanValidUntilByPrincipal: {
          "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
        }
      });
      const failedSupportUrl = failedEnvelope.credentials.find(
        ({ principalId }) => principalId === "support-config-operator"
      )!.databaseUrl;
      const failedCredentialPool = createPool(failedSupportUrl);
      let heldClient: PoolClient | undefined;
      let exactStateQueries = 0;
      let publicationFailureInjected = false;
      let recoveryLifted = false;
      let recoveryDelayCount = 0;
      const thirdRecoveryDelay = deferred();
      const liftRecovery = deferred();
      const observed = instrumentedAdminPool({
        beforeQuery: async (text) => {
          if (text.includes("FROM pg_catalog.pg_authid AS target")
            && ++exactStateQueries === 2) {
            heldClient = await failedCredentialPool.connect();
            heldClient.on("error", () => undefined);
            publicationFailureInjected = true;
            throw new Error(`original publication failure before ${recoveryStage}`);
          }
          if (!publicationFailureInjected || recoveryLifted) return;
          if (recoveryStage === "termination" && text.includes("pg_terminate_backend(pid,5000)")) {
            throw new Error("injected persistent termination failure");
          }
          if (recoveryStage === "census"
            && text.includes("SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity")
            && !text.includes("pg_terminate_backend")) {
            throw new Error("injected persistent terminal census failure");
          }
        }
      });
      let settled = false;
      const outcomePromise = provisionProductionDatabasePrincipals({
        adminPool: observed.pool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: failedEnvelope,
        supportConfigCredentialFilePath,
        recoveryBackoff: async () => {
          recoveryDelayCount += 1;
          if (recoveryDelayCount >= 3) {
            thirdRecoveryDelay.resolve();
            await liftRecovery.promise;
          }
        }
      }).then(
        () => { settled = true; return undefined; },
        (error: unknown) => { settled = true; return error; }
      );
      try {
        const reachedThirdDelay = await Promise.race([
          thirdRecoveryDelay.promise.then(() => true),
          delay(2_000).then(() => false)
        ]);
        if (!reachedThirdDelay) {
          recoveryLifted = true;
          liftRecovery.resolve();
          await outcomePromise;
        }
        expect(reachedThirdDelay).toBe(true);
        expect(settled).toBe(false);
        expect(heldClient).toBeDefined();
        const heldSessionStillWorks = await heldClient?.query("SELECT 1")
          .then(() => true, () => false) ?? false;
        expect(heldSessionStillWorks).toBe(recoveryStage === "termination");
        recoveryLifted = true;
        liftRecovery.resolve();
        const outcome = await outcomePromise;

        expect(outcome).toMatchObject({
          message: "PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_FAILED",
          cause: expect.any(AggregateError)
        });
        expect(await heldClient?.query("SELECT 1").then(() => true, () => false)).toBe(false);
        await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
        expect(await productionSupportState()).toEqual({
          canLogin: false,
          sessionCount: 0,
          credentialFileExists: true
        });
        expect(observed.counts).toEqual({
          connects: 6,
          releases: 6,
          globalUnlocks: 1,
          principalUnlocks: 1
        });
      } finally {
        recoveryLifted = true;
        liftRecovery.resolve();
        await outcomePromise;
        heldClient?.release(true);
        await failedCredentialPool.end();
      }
      await expectProductionLeasesAvailable();
    }
  }, 120_000);

  it("discards a poisoned publication client and recovers on a fresh client", async () => {
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: credentialEnvelope(),
      supportConfigCredentialFilePath
    });
    const priorBytes = await readFile(supportConfigCredentialFilePath);
    let exactStateQueries = 0;
    let poisonedConnection: number | undefined;
    const recoveryConnections = new Set<number>();
    const observed = instrumentedAdminPool({
      beforeQuery: (text, connectionNumber) => {
        if (poisonedConnection === connectionNumber) {
          throw new Error("injected poisoned publication client reuse");
        }
        if (text.includes("FROM pg_catalog.pg_authid AS target")
          && ++exactStateQueries === 2) {
          poisonedConnection = connectionNumber;
          throw new Error("original publication failure poisoned its client");
        }
        if (poisonedConnection !== undefined && text.includes("NOLOGIN")) {
          recoveryConnections.add(connectionNumber);
        }
      }
    });

    await expect(provisionProductionDatabasePrincipals({
      adminPool: observed.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: credentialEnvelope({
        humanValidUntilByPrincipal: {
          "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
        }
      }),
      supportConfigCredentialFilePath,
      recoveryBackoff: async () => undefined
    })).rejects.toThrow("original publication failure poisoned its client");

    expect(poisonedConnection).toBe(2);
    expect([...recoveryConnections]).toEqual([3]);
    await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: true
    });
    expect(observed.counts).toEqual({
      connects: 3,
      releases: 3,
      globalUnlocks: 1,
      principalUnlocks: 1
    });
    await expectProductionLeasesAvailable();
  }, 120_000);

  it("uses a durable secret-free marker to quarantine recovery after owner-session loss", async () => {
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: credentialEnvelope(),
      supportConfigCredentialFilePath
    });
    const priorBytes = await readFile(supportConfigCredentialFilePath);
    const failedEnvelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    const markerPath = join(credentialRoot, ".support-config-operator.json.recovery-owner");
    const thirdRecoveryDelay = deferred();
    const liftRecovery = deferred();
    const competitorMarkerBlocked = deferred();
    const allowCompetitor = deferred();
    let exactStateQueries = 0;
    let publicationFailureInjected = false;
    let recoveryLifted = false;
    let recoveryDelayCount = 0;
    let ownerBackendPid: number | undefined;
    const observed = instrumentedAdminPool({
      beforeQuery: (text) => {
        if (text.includes("FROM pg_catalog.pg_authid AS target")
          && ++exactStateQueries === 2) {
          publicationFailureInjected = true;
          throw new Error("original publication failure before owner-session loss");
        }
        if (publicationFailureInjected
          && !recoveryLifted
          && text.includes("debateai_prod_support_config_operator")
          && text.includes("NOLOGIN")) {
          throw new Error("injected persistent recovery failure before owner-session loss");
        }
      },
      afterQuery: async (text, connectionNumber, client) => {
        if (connectionNumber === 1
          && ownerBackendPid === undefined
          && text.includes("pg_advisory_lock")
          && text.includes("production-support-config-operator")) {
          ownerBackendPid = (await client.query<{ pid: number }>(
            "SELECT pg_backend_pid() AS pid"
          )).rows[0]?.pid;
        }
      }
    });
    let originalSettled = false;
    const originalOutcomePromise = provisionProductionDatabasePrincipals({
      adminPool: observed.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: failedEnvelope,
      supportConfigCredentialFilePath,
      recoveryBackoff: async () => {
        recoveryDelayCount += 1;
        if (recoveryDelayCount >= 3) {
          thirdRecoveryDelay.resolve();
          await liftRecovery.promise;
        }
      }
    }).then(
      () => { originalSettled = true; return undefined; },
      (error: unknown) => { originalSettled = true; return error; }
    );
    let cleanupSettled = false;
    let cleanupPromise: Promise<unknown> | undefined;
    try {
      await thirdRecoveryDelay.promise;
      expect(originalSettled).toBe(false);
      expect(ownerBackendPid).toEqual(expect.any(Number));
      expect((await lstat(markerPath)).mode & 0o777).toBe(0o600);
      await expect(readFile(markerPath)).resolves.toEqual(Buffer.alloc(0));

      await expect(adminPool.query(
        "SELECT pg_terminate_backend($1::integer) AS terminated",
        [ownerBackendPid]
      )).resolves.toMatchObject({ rows: [{ terminated: true }] });
      cleanupPromise = cleanupProductionSupportConfigOperator({
        adminPool,
        supportConfigCredentialFilePath,
        recoveryBackoff: async () => {
          competitorMarkerBlocked.resolve();
          await allowCompetitor.promise;
        }
      }).then(
        (value) => { cleanupSettled = true; return value; },
        (error: unknown) => { cleanupSettled = true; throw error; }
      );
      await competitorMarkerBlocked.promise;
      expect(cleanupSettled).toBe(false);

      recoveryLifted = true;
      liftRecovery.resolve();
      const originalOutcome = await originalOutcomePromise;
      expect(originalOutcome).toMatchObject({
        message: "PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_FAILED",
        cause: expect.any(AggregateError)
      });
      expect(await productionSupportState()).toEqual({
        canLogin: false,
        sessionCount: 0,
        credentialFileExists: true
      });
      await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
      await expect(lstat(markerPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(cleanupSettled).toBe(false);

      allowCompetitor.resolve();
      await expect(cleanupPromise).resolves.toMatchObject({ supportConfigCredentialFilePath });
      expect(observed.counts).toEqual({
        connects: 6,
        releases: 6,
        globalUnlocks: 0,
        principalUnlocks: 0
      });
      await expect(lstat(supportConfigCredentialFilePath))
        .rejects.toMatchObject({ code: "ENOENT" });
      await expectProductionLeasesAvailable();
    } finally {
      recoveryLifted = true;
      liftRecovery.resolve();
      allowCompetitor.resolve();
      await originalOutcomePromise;
      await cleanupPromise?.catch(() => undefined);
    }
  }, 120_000);

  it("retries compensation query and commit failures without hiding the publication failure", async () => {
    for (const compensationStage of ["NOLOGIN", "COMMIT"] as const) {
      const initialEnvelope = credentialEnvelope();
      await provisionProductionDatabasePrincipals({
        adminPool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: initialEnvelope,
        supportConfigCredentialFilePath
      });
      const priorBytes = await readFile(supportConfigCredentialFilePath);
      let exactStateQueries = 0;
      let publicationFailureInjected = false;
      let compensationFailureInjected = false;
      const observed = instrumentedAdminPool({
        beforeQuery: (text) => {
          if (text.includes("FROM pg_catalog.pg_authid AS target")
            && ++exactStateQueries === 2) {
            publicationFailureInjected = true;
            throw new Error(`original publication failure before ${compensationStage}`);
          }
          if (publicationFailureInjected && !compensationFailureInjected
            && ((compensationStage === "NOLOGIN"
              && text.includes("debateai_prod_support_config_operator")
              && text.includes("NOLOGIN"))
              || (compensationStage === "COMMIT" && text.trim() === "COMMIT"))) {
            compensationFailureInjected = true;
            throw new Error(`injected compensation ${compensationStage} failure`);
          }
        }
      });
      const failure = await provisionProductionDatabasePrincipals({
        adminPool: observed.pool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope({
          humanValidUntilByPrincipal: {
            "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
          }
        }),
        supportConfigCredentialFilePath
      }).then(() => undefined, (error: unknown) => error);

      expect(compensationFailureInjected).toBe(true);
      expect(failure).toMatchObject({
        message: "PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_FAILED",
        cause: expect.any(AggregateError)
      });
      const errors = (failure as { cause: AggregateError }).cause.errors.map(String);
      expect(errors.some((error) => error.includes("original publication failure"))).toBe(true);
      expect(errors.some((error) => error.includes(`compensation ${compensationStage} failure`)))
        .toBe(true);
      await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
      expect(await productionSupportState()).toEqual({
        canLogin: false,
        sessionCount: 0,
        credentialFileExists: true
      });
      expect(observed.counts).toEqual({
        connects: 4,
        releases: 4,
        globalUnlocks: 1,
        principalUnlocks: 1
      });
      await expectProductionLeasesAvailable();
    }
  }, 120_000);

  it("blocks new authentication during compensation and terminates a published-credential session", async () => {
    const initialEnvelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: initialEnvelope,
      supportConfigCredentialFilePath
    });
    const priorBytes = await readFile(supportConfigCredentialFilePath);
    const failedEnvelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    const failedSupportUrl = failedEnvelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!.databaseUrl;
    const failedCredentialPool = createPool(failedSupportUrl);
    const boundaryPool = createPool(failedSupportUrl);
    const noLoginCommitted = deferred();
    const resumeCompensation = deferred();
    let exactStateQueries = 0;
    let publicationFailureInjected = false;
    let heldClient: PoolClient | undefined;
    const observed = instrumentedAdminPool({
      beforeQuery: async (text) => {
        if (text.includes("FROM pg_catalog.pg_authid AS target")
          && ++exactStateQueries === 2) {
          heldClient = await failedCredentialPool.connect();
          heldClient.on("error", () => undefined);
          publicationFailureInjected = true;
          throw new Error("original publication failure after failed credential authenticated");
        }
      },
      afterQuery: async (text) => {
        if (publicationFailureInjected && text.trim() === "COMMIT") {
          noLoginCommitted.resolve();
          await resumeCompensation.promise;
        }
      }
    });
    const provisionPromise = provisionProductionDatabasePrincipals({
      adminPool: observed.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: failedEnvelope,
      supportConfigCredentialFilePath
    });
    let provisionFailure: unknown;
    let heldSessionWorkedBeforeTermination = false;
    let boundaryAuthenticationSucceeded = false;
    let heldSessionSurvivedTermination = false;
    try {
      await noLoginCommitted.promise;
      heldSessionWorkedBeforeTermination = await heldClient?.query("SELECT 1")
        .then(() => true, () => false) ?? false;
      boundaryAuthenticationSucceeded = await boundaryPool.query("SELECT 1")
        .then(() => true, () => false);
      resumeCompensation.resolve();
      try {
        await provisionPromise;
      } catch (error) {
        provisionFailure = error;
      }
      heldSessionSurvivedTermination = await heldClient?.query("SELECT 1")
        .then(() => true, () => false) ?? false;
    } finally {
      resumeCompensation.resolve();
      heldClient?.release(true);
      await failedCredentialPool.end();
      await boundaryPool.end();
    }

    expect(heldClient).toBeDefined();
    expect(heldSessionWorkedBeforeTermination).toBe(true);
    expect(boundaryAuthenticationSucceeded).toBe(false);
    expect(provisionFailure).toMatchObject({
      message: "original publication failure after failed credential authenticated"
    });
    expect(heldSessionSurvivedTermination).toBe(false);

    await expect(readFile(supportConfigCredentialFilePath)).resolves.toEqual(priorBytes);
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: true
    });
    expect(await credentialTemporaryFiles()).toEqual([]);
    expect(observed.counts).toEqual({
      connects: 3,
      releases: 3,
      globalUnlocks: 1,
      principalUnlocks: 1
    });
  }, 120_000);

  it("publishes an adjacent successful replacement and removes its rollback backup", async () => {
    const initialEnvelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: initialEnvelope,
      supportConfigCredentialFilePath
    });
    const priorBytes = await readFile(supportConfigCredentialFilePath);
    const replacementEnvelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    const replacementCredential = replacementEnvelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!;
    const observed = instrumentedAdminPool();

    await expect(provisionProductionDatabasePrincipals({
      adminPool: observed.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: replacementEnvelope,
      supportConfigCredentialFilePath
    })).resolves.toMatchObject({ supportConfigCredentialFilePath });

    const replacementBytes = await readFile(supportConfigCredentialFilePath);
    expect(replacementBytes.equals(priorBytes)).toBe(false);
    expect(JSON.parse(replacementBytes.toString("utf8"))).toEqual({
      databaseUrl: replacementCredential.databaseUrl,
      validUntil: replacementCredential.validUntil
    });
    expect((await lstat(supportConfigCredentialFilePath)).mode & 0o777).toBe(0o600);
    expect(await credentialTemporaryFiles()).toEqual([]);
    const replacementPool = createPool(replacementCredential.databaseUrl);
    try {
      await expect(replacementPool.query("SELECT current_user AS principal"))
        .resolves.toMatchObject({
          rows: [{ principal: "debateai_prod_support_config_operator" }]
        });
    } finally {
      await replacementPool.end();
    }
    expect(await productionSupportState()).toEqual({
      canLogin: true,
      sessionCount: 0,
      credentialFileExists: true
    });
    expect(observed.counts).toEqual({
      connects: 2,
      releases: 2,
      globalUnlocks: 1,
      principalUnlocks: 1
    });
  }, 120_000);

  it("returns the successful receipt after a confirmed-dead lease owner releases its locks", async () => {
    const envelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "obs-human": new Date(Date.now() + 9 * 60 * 1_000),
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    const supportCredential = envelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!;
    const managedRoleNames = manifest.principals
      .filter(({ id }) => manifest.provisioner.managedPrincipalIds.includes(id))
      .map(({ roleName }) => roleName);
    const existingManagedCount = (await adminPool.query<{ count: number }>(`
      SELECT count(*)::integer AS count FROM pg_catalog.pg_roles
      WHERE rolname=ANY($1::text[])
    `, [managedRoleNames])).rows[0]!.count;
    const expectedReceipt = {
      principalCount: manifest.provisioner.managedPrincipalIds.length,
      createdCount: managedRoleNames.length - existingManagedCount,
      humanCredentialExpiresAtByPrincipal: {
        "obs-human": envelope.credentials.find(
          ({ principalId }) => principalId === "obs-human"
        )!.validUntil,
        "support-config-operator": supportCredential.validUntil
      },
      supportConfigCredentialFilePath
    };
    const markerPath = join(credentialRoot, ".support-config-operator.json.recovery-owner");
    const terminalReleaseReached = deferred();
    const resumeOwnerUnlock = deferred();
    const releaseEvents: Array<Readonly<{
      connectionNumber: number;
      destroy: Error | boolean | undefined;
    }>> = [];
    let ownerBackendPid: number | undefined;
    const observed = instrumentedAdminPool({
      beforeQuery: async (text, connectionNumber) => {
        if (connectionNumber === 1
          && text.includes("pg_advisory_unlock")
          && text.includes("production-support-config-operator")) {
          terminalReleaseReached.resolve();
          await resumeOwnerUnlock.promise;
        }
      },
      afterQuery: async (text, connectionNumber, client) => {
        if (connectionNumber === 1
          && ownerBackendPid === undefined
          && text.includes("pg_advisory_lock")
          && text.includes("production-support-config-operator")) {
          ownerBackendPid = (await client.query<{ pid: number }>(
            "SELECT pg_backend_pid() AS pid"
          )).rows[0]?.pid;
        }
      },
      onRelease: (connectionNumber, destroy) => {
        releaseEvents.push({ connectionNumber, destroy });
      }
    });
    const controlPool = createPool(adminDatabaseUrl);
    const competitor = await adminPool.connect();
    let competitorAcquired = false;
    let competitorLeasePromise: Promise<void> | undefined;
    const provisionPromise = provisionProductionDatabasePrincipals({
      adminPool: observed.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: envelope,
      supportConfigCredentialFilePath
    });
    try {
      await terminalReleaseReached.promise;
      expect(ownerBackendPid).toEqual(expect.any(Number));
      await expect(lstat(markerPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await productionSupportState()).toEqual({
        canLogin: true,
        sessionCount: 0,
        credentialFileExists: true
      });
      await expect(readFile(supportConfigCredentialFilePath, "utf8")).resolves.toBe(
        JSON.stringify({
          databaseUrl: supportCredential.databaseUrl,
          validUntil: supportCredential.validUntil
        })
      );
      const authenticationPool = createPool(supportCredential.databaseUrl);
      try {
        await expect(authenticationPool.query("SELECT current_user AS principal"))
          .resolves.toMatchObject({
            rows: [{ principal: "debateai_prod_support_config_operator" }]
          });
      } finally {
        await authenticationPool.end();
      }

      competitorLeasePromise = (async () => {
        await competitor.query(`
          SELECT pg_advisory_lock(
            hashtextextended('debateai:production-database-principals:v1',0)
          )
        `);
        await competitor.query(`
          SELECT pg_advisory_lock(
            hashtextextended('debateai:production-support-config-operator',0)
          )
        `);
        competitorAcquired = true;
      })();
      await expect(waitForSessionLeaseWait()).resolves.toBe("waiting");
      expect(competitorAcquired).toBe(false);

      await expect(controlPool.query(
        "SELECT pg_terminate_backend($1::integer) AS terminated",
        [ownerBackendPid]
      )).resolves.toMatchObject({ rows: [{ terminated: true }] });
      await expect(Promise.race([
        competitorLeasePromise.then(() => true),
        delay(5_000).then(() => false)
      ])).resolves.toBe(true);
      await competitor.query(`
        SELECT
          pg_advisory_unlock(
            hashtextextended('debateai:production-support-config-operator',0)
          ),
          pg_advisory_unlock(
            hashtextextended('debateai:production-database-principals:v1',0)
          )
      `);
      resumeOwnerUnlock.resolve();

      const outcome = await provisionPromise.then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason })
      );
      expect(outcome).toEqual({ status: "fulfilled", value: expectedReceipt });
      expect(releaseEvents).toEqual([
        { connectionNumber: 2, destroy: false },
        { connectionNumber: 1, destroy: true }
      ]);
      expect(observed.counts).toEqual({
        connects: 2,
        releases: 2,
        globalUnlocks: 0,
        principalUnlocks: 0
      });
      expect(await credentialTemporaryFiles()).toEqual([]);
      await expectProductionLeasesAvailable();
    } finally {
      resumeOwnerUnlock.resolve();
      if (ownerBackendPid !== undefined) {
        await controlPool.query(
          "SELECT pg_terminate_backend($1::integer)",
          [ownerBackendPid]
        ).catch(() => undefined);
      }
      await competitorLeasePromise?.catch(() => undefined);
      await competitor.query(`
        SELECT
          pg_advisory_unlock(
            hashtextextended('debateai:production-support-config-operator',0)
          ),
          pg_advisory_unlock(
            hashtextextended('debateai:production-database-principals:v1',0)
          )
      `).catch(() => undefined);
      competitor.release(true);
      await controlPool.end();
      await provisionPromise.catch(() => undefined);
    }
  }, 120_000);

  it("force-destroys an ambiguous unlock owner and preserves the successful receipt", async () => {
    const envelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "obs-human": new Date(Date.now() + 9 * 60 * 1_000),
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    const supportCredential = envelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!;
    const markerPath = join(credentialRoot, ".support-config-operator.json.recovery-owner");
    const terminalReleaseReached = deferred();
    const injectUnlockFailure = deferred();
    const releaseEvents: Array<Readonly<{
      connectionNumber: number;
      destroy: Error | boolean | undefined;
    }>> = [];
    let ownerBackendPid: number | undefined;
    let ownerClient: PoolClient | undefined;
    let ownerRemoved = false;
    let unlockFailureInjected = false;
    let competitorAcquired = false;
    let competitorAcquiredAtOwnerRelease: boolean | undefined;
    let provisionSettled = false;
    let provisionSettledAtOwnerRelease: boolean | undefined;
    const observeOwnerRemoval = (client: PoolClient): void => {
      if (client === ownerClient) ownerRemoved = true;
    };
    const observed = instrumentedAdminPool({
      beforeQuery: async (text, connectionNumber) => {
        if (!unlockFailureInjected
          && connectionNumber === 1
          && text.includes("pg_advisory_unlock")
          && text.includes("production-support-config-operator")) {
          terminalReleaseReached.resolve();
          await injectUnlockFailure.promise;
          unlockFailureInjected = true;
          throw new Error("injected ambiguous principal unlock failure");
        }
      },
      afterQuery: async (text, connectionNumber, client) => {
        if (connectionNumber === 1
          && ownerBackendPid === undefined
          && text.includes("pg_advisory_lock")
          && text.includes("production-support-config-operator")) {
          ownerClient = client;
          ownerBackendPid = (await client.query<{ pid: number }>(
            "SELECT pg_backend_pid() AS pid"
          )).rows[0]?.pid;
        }
      },
      onRelease: (connectionNumber, destroy) => {
        if (connectionNumber === 1) {
          competitorAcquiredAtOwnerRelease = competitorAcquired;
          provisionSettledAtOwnerRelease = provisionSettled;
        }
        releaseEvents.push({ connectionNumber, destroy });
      }
    });
    const controlPool = createPool(adminDatabaseUrl);
    const competitor = await adminPool.connect();
    let competitorLeasePromise: Promise<void> | undefined;
    adminPool.on("remove", observeOwnerRemoval);
    const provisionPromise = provisionProductionDatabasePrincipals({
      adminPool: observed.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: envelope,
      supportConfigCredentialFilePath
    });
    try {
      await terminalReleaseReached.promise;
      expect(ownerBackendPid).toEqual(expect.any(Number));
      await expect(lstat(markerPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await productionSupportState()).toEqual({
        canLogin: true,
        sessionCount: 0,
        credentialFileExists: true
      });

      competitorLeasePromise = (async () => {
        await competitor.query(`
          SELECT pg_advisory_lock(
            hashtextextended('debateai:production-database-principals:v1',0)
          )
        `);
        await competitor.query(`
          SELECT pg_advisory_lock(
            hashtextextended('debateai:production-support-config-operator',0)
          )
        `);
        competitorAcquired = true;
      })();
      await expect(waitForSessionLeaseWait()).resolves.toBe("waiting");
      expect(competitorAcquired).toBe(false);
      injectUnlockFailure.resolve();

      const outcome = await provisionPromise.then(
        (value) => {
          provisionSettled = true;
          return {
            status: "fulfilled" as const,
            value,
            ownerRemovedAtResolution: ownerRemoved,
            competitorAcquiredAtResolution: competitorAcquired
          };
        },
        (reason: unknown) => {
          provisionSettled = true;
          return {
            status: "rejected" as const,
            reason,
            ownerRemovedAtResolution: ownerRemoved,
            competitorAcquiredAtResolution: competitorAcquired
          };
        }
      );
      expect(outcome.status).toBe("fulfilled");
      expect(unlockFailureInjected).toBe(true);
      expect(competitorAcquiredAtOwnerRelease).toBe(false);
      expect(provisionSettledAtOwnerRelease).toBe(false);
      expect({
        ownerRemovedAtResolution: outcome.ownerRemovedAtResolution,
        competitorAcquiredAtResolution: outcome.competitorAcquiredAtResolution
      }).toEqual({
        ownerRemovedAtResolution: true,
        competitorAcquiredAtResolution: true
      });
      expect(releaseEvents).toEqual([
        { connectionNumber: 2, destroy: false },
        { connectionNumber: 1, destroy: true }
      ]);
      await expect(Promise.race([
        competitorLeasePromise.then(() => true),
        delay(5_000).then(() => false)
      ])).resolves.toBe(true);
      await competitor.query(`
        SELECT
          pg_advisory_unlock(
            hashtextextended('debateai:production-support-config-operator',0)
          ),
          pg_advisory_unlock(
            hashtextextended('debateai:production-database-principals:v1',0)
          )
      `);

      expect(outcome).toMatchObject({
        status: "fulfilled",
        value: {
          principalCount: manifest.provisioner.managedPrincipalIds.length,
          humanCredentialExpiresAtByPrincipal: {
            "obs-human": envelope.credentials.find(
              ({ principalId }) => principalId === "obs-human"
            )!.validUntil,
            "support-config-operator": supportCredential.validUntil
          },
          supportConfigCredentialFilePath
        }
      });
      await expect(readFile(supportConfigCredentialFilePath, "utf8")).resolves.toBe(
        JSON.stringify({
          databaseUrl: supportCredential.databaseUrl,
          validUntil: supportCredential.validUntil
        })
      );
      const authenticationPool = createPool(supportCredential.databaseUrl);
      try {
        await expect(authenticationPool.query("SELECT current_user AS principal"))
          .resolves.toMatchObject({
            rows: [{ principal: "debateai_prod_support_config_operator" }]
          });
      } finally {
        await authenticationPool.end();
      }
      expect(await productionSupportState()).toEqual({
        canLogin: true,
        sessionCount: 0,
        credentialFileExists: true
      });
      await expect(lstat(markerPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await credentialTemporaryFiles()).toEqual([]);
      expect(observed.counts).toEqual({
        connects: 2,
        releases: 2,
        globalUnlocks: 1,
        principalUnlocks: 0
      });
      await expectProductionLeasesAvailable();
    } finally {
      injectUnlockFailure.resolve();
      if (!competitorAcquired && ownerBackendPid !== undefined) {
        await controlPool.query(
          "SELECT pg_terminate_backend($1::integer)",
          [ownerBackendPid]
        ).catch(() => undefined);
      }
      await competitorLeasePromise?.catch(() => undefined);
      await competitor.query(`
        SELECT
          pg_advisory_unlock(
            hashtextextended('debateai:production-support-config-operator',0)
          ),
          pg_advisory_unlock(
            hashtextextended('debateai:production-database-principals:v1',0)
          )
      `).catch(() => undefined);
      competitor.release(true);
      await controlPool.end();
      await provisionPromise.catch(() => undefined);
      adminPool.off("remove", observeOwnerRemoval);
    }
  }, 120_000);

  it("releases the session lease and client once on query, commit, and close paths", async () => {
    for (const failureQuery of ["BEGIN", "COMMIT"] as const) {
      let injected = false;
      const observed = instrumentedAdminPool({
        beforeQuery: (text) => {
          if (!injected && text.trim() === failureQuery) {
            injected = true;
            throw new Error(`injected ${failureQuery} failure`);
          }
        }
      });
      await expect(provisionProductionDatabasePrincipals({
        adminPool: observed.pool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope(),
        supportConfigCredentialFilePath
      })).rejects.toBeDefined();
      expect(injected).toBe(true);
      expect(observed.counts).toEqual({
        connects: failureQuery === "BEGIN" ? 2 : 3,
        releases: failureQuery === "BEGIN" ? 2 : 3,
        globalUnlocks: 1,
        principalUnlocks: 1
      });
      await expectProductionLeasesAvailable();
    }

    const observedSuccess = instrumentedAdminPool();
    await expect(provisionProductionDatabasePrincipals({
      adminPool: observedSuccess.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: credentialEnvelope(),
      supportConfigCredentialFilePath
    })).resolves.toMatchObject({ supportConfigCredentialFilePath });
    expect(observedSuccess.counts).toEqual({
      connects: 2,
      releases: 2,
      globalUnlocks: 1,
      principalUnlocks: 1
    });
    await expectProductionLeasesAvailable();
  }, 120_000);

  it("uses the private production credential for fresh bounded connections and closes them", async () => {
    const envelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "obs-human": new Date(Date.now() + 9 * 60 * 1_000),
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    const receipt = await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: envelope,
      supportConfigCredentialFilePath
    });
    const loaded = await loadProductionSupportConfigCliCredentials(
      supportConfigCredentialFilePath
    );
    expect(loaded).toEqual({
      databaseUrl: envelope.credentials.find(
        ({ principalId }) => principalId === "support-config-operator"
      )!.databaseUrl,
      validUntil: receipt.humanCredentialExpiresAtByPrincipal["support-config-operator"]
    });
    const backendPids = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      backendPids.push(await withProductionSupportConfigCliConnection(
        supportConfigCredentialFilePath,
        async (client) => {
          const row = (await client.query<{
            principal: string;
            backendPid: number;
            statementTimeout: string;
          }>(`
            SELECT current_user AS principal,pg_backend_pid() AS "backendPid",
              current_setting('statement_timeout') AS "statementTimeout"
          `)).rows[0]!;
          expect(row.principal).toBe("debateai_prod_support_config_operator");
          expect(Number.parseInt(row.statementTimeout, 10)).toBeGreaterThan(0);
          expect(Number.parseInt(row.statementTimeout, 10)).toBeLessThan(
            new Date(loaded.validUntil).getTime() - Date.now()
          );
          return row.backendPid;
        }
      ));
    }
    expect(new Set(backendPids).size).toBe(2);
    await expect(adminPool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM pg_catalog.pg_stat_activity
      WHERE usename='debateai_prod_support_config_operator'
    `)).resolves.toMatchObject({ rows: [{ count: "0" }] });
  }, 120_000);

  it("publishes emergency off before cleanup kills every established support session while unrelated sessions survive", async () => {
    const envelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: envelope,
      supportConfigCredentialFilePath
    });
    const supportUrl = envelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!.databaseUrl;
    const adminRegister = createPostgresRegisterPublicationPort(adminPool);
    const deterministicV4Rows = await buildDevelopmentDeploymentRegisterPublicationRows(
      await loadBootstrapRegister(),
      TEST_DEVELOPMENT_PROVIDER_PANEL
    );
    expect(computeRegisterSnapshotSha256(deterministicV4Rows))
      .toBe(DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256);
    await adminRegister.importHistorical({
      registerVersion: parseRegisterVersionText("4"),
      rows: deterministicV4Rows
    });
    const heldPool = createPool(supportUrl);
    const operatorRegister = createPostgresRegisterPublicationPort(heldPool);
    const initialOff = await operatorRegister.publishSupport({
      publicationId: randomUUID(),
      baseRegisterVersion: parseRegisterVersionText("4"),
      expectedSupportRegisterVersion: null,
      schemaVersion: 1,
      patch: SUPPORT_CONFIGURATION_KEYS.map((key) => ({
        key,
        valueJsonText: parseCanonicalRegisterJson(
          Buffer.from(PRODUCTION_SUPPORT_VALUE_TEXT[key]!)
        )
      })),
      sourceRef: "deployment:production-initial-off"
    });
    const initialCommitAcknowledgedAt = new Date();
    expect(initialOff.previousSupportRegisterVersion).toBeNull();
    expect(initialOff.baseRegisterVersion).toBe("4");
    expect(initialOff.changedKeys).toEqual([...SUPPORT_CONFIGURATION_KEYS].sort());
    expect(initialOff.recordedAt.getTime())
      .toBeLessThanOrEqual(initialCommitAcknowledgedAt.getTime());
    const initialStatus = await operatorRegister.readSupportStatus();
    expect(initialStatus).toMatchObject({
      supportRegisterVersion: initialOff.registerVersion,
      baseRegisterVersion: "4",
      schemaVersion: 1,
      sourceRef: "deployment:production-initial-off"
    });
    expect(JSON.parse(initialStatus!.configurationText)).toHaveLength(16);
    expect(JSON.parse(initialStatus!.configurationText)).toContainEqual(
      expect.objectContaining({ row_key: "support_enabled", value_json_text: "false" })
    );
    await expect(heldPool.query(`
      INSERT INTO register.register_row(register_version,row_key,value_json,source_ref)
      VALUES(4,'operator-direct-dml','true'::jsonb,'deployment:forbidden')
    `)).rejects.toMatchObject({ code: "42501" });
    await expect(operatorRegister.publishGeneral({
      publicationId: randomUUID(),
      baseRegisterVersion: parseRegisterVersionText("4"),
      rows: [{
        rowKey: "operatorGeneralWrite",
        valueJsonText: parseCanonicalRegisterJson(Buffer.from("true")),
        sourceRef: "deployment:forbidden-general"
      }],
      sourceRef: "deployment:forbidden-general"
    })).rejects.toMatchObject({ code: "42501" });
    const enabled = await operatorRegister.publishSupport({
      publicationId: randomUUID(),
      baseRegisterVersion: initialOff.registerVersion,
      expectedSupportRegisterVersion: initialOff.registerVersion,
      schemaVersion: 1,
      patch: [{
        key: "support_enabled",
        valueJsonText: parseCanonicalRegisterJson(Buffer.from("true"))
      }],
      sourceRef: "deployment:production-enabled-before-containment"
    });
    const heldClients = await Promise.all([heldPool.connect(), heldPool.connect()]);
    for (const client of heldClients) client.on("error", () => undefined);
    const unrelatedClient = await adminPool.connect();
    const unrelatedSession = (await unrelatedClient.query<{
      backendPid: number;
      principal: string;
    }>(`
      SELECT pg_backend_pid() AS "backendPid",current_user AS principal
    `)).rows[0]!;
    try {
      for (const client of heldClients) {
        await expect(client.query("SELECT current_user AS principal"))
          .resolves.toMatchObject({
            rows: [{ principal: "debateai_prod_support_config_operator" }]
          });
      }
      const disabled = await operatorRegister.publishSupport({
        publicationId: randomUUID(),
        baseRegisterVersion: enabled.registerVersion,
        expectedSupportRegisterVersion: enabled.registerVersion,
        schemaVersion: 1,
        patch: [{
          key: "support_enabled",
          valueJsonText: parseCanonicalRegisterJson(Buffer.from("false"))
        }],
        sourceRef: "deployment:production-emergency-off"
      });
      const commitAcknowledgedAt = new Date();
      const statusBeforeCleanup = await adminRegister.readSupportStatus();
      expect(statusBeforeCleanup).toMatchObject({
        supportRegisterVersion: disabled.registerVersion,
        baseRegisterVersion: enabled.registerVersion,
        sourceRef: "deployment:production-emergency-off"
      });
      expect(statusBeforeCleanup!.recordedAt.getTime())
        .toBeLessThanOrEqual(commitAcknowledgedAt.getTime());
      expect(JSON.parse(statusBeforeCleanup!.configurationText)).toContainEqual(
        expect.objectContaining({ row_key: "support_enabled", value_json_text: "false" })
      );
      expect(await productionSupportState()).toEqual({
        canLogin: true,
        sessionCount: 3,
        credentialFileExists: true
      });
      await expect(cleanupProductionSupportConfigOperator({
        adminPool,
        supportConfigCredentialFilePath
      })).resolves.toMatchObject({
        supportConfigCredentialFilePath,
        terminatedSessionCount: 3
      });
      for (const client of heldClients) {
        await expect(client.query("SELECT 1")).rejects.toBeDefined();
      }
      await expect(unrelatedClient.query(`
        SELECT pg_backend_pid() AS "backendPid",current_user AS principal
      `)).resolves.toMatchObject({ rows: [unrelatedSession] });
    } finally {
      for (const client of heldClients) client.release(true);
      await heldPool.end();
      unrelatedClient.release();
    }
    await expect(lstat(supportConfigCredentialFilePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(adminPool.query(`
      SELECT rolcanlogin AS "canLogin" FROM pg_catalog.pg_roles
      WHERE rolname='debateai_prod_support_config_operator'
    `)).resolves.toMatchObject({ rows: [{ canLogin: false }] });
    await expect(adminPool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM pg_catalog.pg_stat_activity
      WHERE usename='debateai_prod_support_config_operator'
    `)).resolves.toMatchObject({ rows: [{ count: "0" }] });
  }, 120_000);

  it("makes NOLOGIN visible before the terminal census so boundary authentication cannot survive cleanup", async () => {
    const envelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: envelope,
      supportConfigCredentialFilePath
    });
    const supportUrl = envelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!.databaseUrl;
    const censusReached = deferred();
    const resumeCleanup = deferred();
    let paused = false;
    const cleanupPool = instrumentedAdminPool({
      afterQuery: async (text) => {
        if (!paused
          && text.includes("pg_stat_activity")
          && text.includes("count(*)::integer")
          && !text.includes("pg_terminate_backend")) {
          paused = true;
          censusReached.resolve();
          await resumeCleanup.promise;
        }
      }
    });
    const cleanupPromise = cleanupProductionSupportConfigOperator({
      adminPool: cleanupPool.pool,
      supportConfigCredentialFilePath
    });
    await censusReached.promise;

    const racedPool = createPool(supportUrl);
    let authenticatedAtBoundary = false;
    let survivedCleanup = false;
    let cleanupReceipt;
    try {
      authenticatedAtBoundary = await racedPool.query("SELECT 1")
        .then(() => true, () => false);
      resumeCleanup.resolve();
      cleanupReceipt = await cleanupPromise;
      survivedCleanup = await racedPool.query("SELECT 1")
        .then(() => true, () => false);
    } finally {
      resumeCleanup.resolve();
      await cleanupPromise.catch(() => undefined);
      await racedPool.end();
    }

    expect({ authenticatedAtBoundary, survivedCleanup }).toEqual({
      authenticatedAtBoundary: false,
      survivedCleanup: false
    });
    expect(cleanupReceipt).toMatchObject({ terminatedSessionCount: 0 });
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: false
    });
    expect(cleanupPool.counts).toEqual({
      connects: 2,
      releases: 2,
      globalUnlocks: 1,
      principalUnlocks: 1
    });
  }, 120_000);

  it("serializes provision DB commit before cleanup file removal under one session lease", async () => {
    const initialEnvelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: initialEnvelope,
      supportConfigCredentialFilePath
    });
    const nextEnvelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "obs-human": new Date(Date.now() + 9 * 60 * 1_000),
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    const commitReached = deferred();
    const resumeProvision = deferred();
    let paused = false;
    const provisionPool = instrumentedAdminPool({
      afterQuery: async (text) => {
        if (!paused && text.trim() === "COMMIT") {
          paused = true;
          commitReached.resolve();
          await resumeProvision.promise;
        }
      }
    });
    const provisionPromise = provisionProductionDatabasePrincipals({
      adminPool: provisionPool.pool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: nextEnvelope,
      supportConfigCredentialFilePath
    });
    await commitReached.promise;
    const cleanupPromise = cleanupProductionSupportConfigOperator({
      adminPool,
      supportConfigCredentialFilePath
    });
    const observedOrder = await Promise.race([
      cleanupPromise.then(() => "cleanup-returned" as const, () => "cleanup-failed" as const),
      waitForSessionLeaseWait()
    ]);
    resumeProvision.resolve();
    const [provisionResult, cleanupResult] = await Promise.allSettled([
      provisionPromise,
      cleanupPromise
    ]);

    expect(observedOrder).toBe("waiting");
    expect(provisionResult.status).toBe("fulfilled");
    expect(cleanupResult.status).toBe("fulfilled");
    expect(await productionSupportState()).toEqual({
      canLogin: false,
      sessionCount: 0,
      credentialFileExists: false
    });
    expect(provisionPool.counts).toEqual({
      connects: 2,
      releases: 2,
      globalUnlocks: 1,
      principalUnlocks: 1
    });
  }, 120_000);

  it("serializes cleanup DB commit and file removal before a new provision succeeds", async () => {
    const initialEnvelope = credentialEnvelope();
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: initialEnvelope,
      supportConfigCredentialFilePath
    });
    const cleanupCommitReached = deferred();
    const resumeCleanup = deferred();
    let paused = false;
    const cleanupPool = instrumentedAdminPool({
      afterQuery: async (text) => {
        if (!paused && text.trim() === "COMMIT") {
          paused = true;
          cleanupCommitReached.resolve();
          await resumeCleanup.promise;
        }
      }
    });
    const cleanupPromise = cleanupProductionSupportConfigOperator({
      adminPool: cleanupPool.pool,
      supportConfigCredentialFilePath
    });
    await cleanupCommitReached.promise;
    const nextEnvelope = credentialEnvelope({
      humanValidUntilByPrincipal: {
        "obs-human": new Date(Date.now() + 9 * 60 * 1_000),
        "support-config-operator": new Date(Date.now() + 8 * 60 * 1_000)
      }
    });
    const provisionPromise = provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: nextEnvelope,
      supportConfigCredentialFilePath
    });
    const observedOrder = await Promise.race([
      provisionPromise.then(() => "provision-returned" as const, () => "provision-failed" as const),
      waitForSessionLeaseWait()
    ]);
    resumeCleanup.resolve();
    const [cleanupResult, provisionResult] = await Promise.allSettled([
      cleanupPromise,
      provisionPromise
    ]);

    expect(observedOrder).toBe("waiting");
    expect(cleanupResult.status).toBe("fulfilled");
    expect(provisionResult.status).toBe("fulfilled");
    expect(await productionSupportState()).toEqual({
      canLogin: true,
      sessionCount: 0,
      credentialFileExists: true
    });
    const expectedSupportCredential = nextEnvelope.credentials.find(
      ({ principalId }) => principalId === "support-config-operator"
    )!;
    expect(await readFile(supportConfigCredentialFilePath, "utf8")).toBe(JSON.stringify({
      databaseUrl: expectedSupportCredential.databaseUrl,
      validUntil: expectedSupportCredential.validUntil
    }));
    expect(cleanupPool.counts).toEqual({
      connects: 2,
      releases: 2,
      globalUnlocks: 1,
      principalUnlocks: 1
    });
  }, 120_000);

  it("runs the stdin CLI without returning credentials or secret-bearing errors", async () => {
    const envelope = credentialEnvelope();
    const outcome = await runProvisioningCli(envelope);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderr).toBe("");
    const output = `${outcome.stdout}${outcome.stderr}`;
    expect(output).not.toContain(ADMIN_PASSWORD);
    for (const { databaseUrl } of envelope.credentials) {
      expect(output).not.toContain(databaseUrl);
      expect(output).not.toContain(new URL(databaseUrl).password);
      expect(output).not.toContain(decodeURIComponent(new URL(databaseUrl).password));
    }
    expect(outcome.stdout).toBe("PRODUCTION_DATABASE_PRINCIPALS_READY=17\n");
  }, 120_000);
});
