import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "../../packages/db/src/index.js";
import {
  PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT,
  provisionProductionDatabasePrincipals
} from "../../apps/runner/src/production-database-principals.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

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
  "debateai_settlement_watch"
] as const;

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

function adminUrlForDatabase(): string {
  const url = new URL(database.connectionString);
  url.username = ADMIN_ROLE;
  url.password = ADMIN_PASSWORD;
  url.pathname = "/debateai";
  return url.toString();
}

function credentialEnvelope(overrides: Readonly<{
  humanValidUntil?: Date;
  duplicatePassword?: boolean;
}> = {}) {
  const byId = new Map(manifest.principals.map((principal) => [principal.id, principal]));
  const humanValidUntil = overrides.humanValidUntil
    ?? new Date(Date.now() + 10 * 60 * 1_000);
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
      ...(principalId === "obs-human"
        ? { validUntil: humanValidUntil.toISOString() }
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
      [join(process.cwd(), "apps", "runner", "src", "production-database-principals-cli.ts")],
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
}, 120_000);

afterAll(async () => {
  await adminPool?.end();
  await database?.stop();
});

describe("P3-02 production database LOGIN principal provisioning", () => {
  it("creates and idempotently reuses sixteen pairwise-distinct actual LOGIN principals", async () => {
    const envelope = credentialEnvelope();
    const first = await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: envelope
    });
    expect(first).toMatchObject({ principalCount: 16, createdCount: 12 });
    expect(first.humanCredentialExpiresAt).toBe(
      envelope.credentials.find(({ principalId }) => principalId === "obs-human")!.validUntil
    );

    const second = await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: envelope
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
    expect(catalog.rows).toHaveLength(16);
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
      credentialEnvelope: envelope
    })).resolves.toMatchObject({ principalCount: 16, createdCount: 0 });

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

  it("rejects duplicate credential material, unsafe JIT expiry, and a service authority before work", async () => {
    await expect(provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: credentialEnvelope({ duplicatePassword: true })
    })).rejects.toThrow("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");

    await expect(provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: credentialEnvelope({
        humanValidUntil: new Date(Date.now() + 30 * 60 * 1_000)
      })
    })).rejects.toThrow("PRODUCTION_DATABASE_JIT_EXPIRY_INVALID");

    const runtimePool = createPool(databaseUrls().get("api-runtime")!);
    try {
      await expect(provisionProductionDatabasePrincipals({
        adminPool: runtimePool,
        adminDatabaseUrl,
        manifest,
        credentialEnvelope: credentialEnvelope()
      })).rejects.toThrow("PRODUCTION_DATABASE_PRINCIPAL_ADMIN_REQUIRED");
    } finally {
      await runtimePool.end();
    }
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
    expect(outcome.stdout).toBe("PRODUCTION_DATABASE_PRINCIPALS_READY=16\n");
  }, 120_000);
});
