import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertAccountErasureDatabaseRole,
  assertContentProvisionDatabaseRole,
  assertPublicationCleanupDatabaseRole,
  assertPublicationDatabaseRoleSeparation,
  createPool,
  migrate,
  ProviderProbeRepository,
  RunRepository,
  type Pool
} from "../../packages/db/src/index.js";
import {
  DEVELOPMENT_DATABASE_PRINCIPALS,
  provisionDevelopmentDatabasePrincipals
} from "../../apps/runner/src/dev-database-principals.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { LivenessRepository } from "../../packages/liveness/src/index.js";
import { MemoryRepository } from "../../packages/memory/src/index.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";

let database: TestDatabase;
let secretRoot: string;
let credentialFilePath: string;

function parseCredentialFile(source: string): ReadonlyMap<string, string> {
  return new Map(source.trim().split("\n").map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) throw new TypeError("TEST_CREDENTIAL_LINE_INVALID");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

async function runProvisioningCli(environment: NodeJS.ProcessEnv): Promise<Readonly<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}>> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      join(process.cwd(), "node_modules", ".bin", "tsx"),
      [join(process.cwd(), "apps", "runner", "src", "dev-database-principals-cli.ts")], {
      cwd: secretRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

describe("DEV-03 isolated development database LOGIN principals", () => {
  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    secretRoot = await mkdtemp(join(tmpdir(), "debateai-dev-principals-"));
    credentialFilePath = join(secretRoot, "database-principals.env");
  }, 120_000);

  afterAll(async () => {
    await database.stop();
    await rm(secretRoot, { recursive: true, force: true });
  });

  it("creates nine distinct SCRAM LOGINs with only their ruled direct memberships", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });

    const credentialSource = await readFile(credentialFilePath, "utf8");
    const credentials = parseCredentialFile(credentialSource);
    expect([...credentials.keys()].sort()).toEqual(
      DEVELOPMENT_DATABASE_PRINCIPALS.map(({ environmentKey }) => environmentKey).sort()
    );
    expect((await stat(credentialFilePath)).mode & 0o777).toBe(0o600);
    expect((await stat(secretRoot)).mode & 0o777).toBe(0o700);

    const roles = await database.pool.query<{
      rolname: string;
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
      rolpassword: string | null;
    }>(`
      SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
        rolreplication,rolbypassrls,rolpassword
      FROM pg_catalog.pg_authid
      WHERE rolname=ANY($1::text[])
      ORDER BY rolname
    `,[DEVELOPMENT_DATABASE_PRINCIPALS.map(({ roleName }) => roleName)]);
    expect(roles.rows).toHaveLength(9);
    expect(roles.rows.every((role) => role.rolcanlogin && role.rolinherit
      && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole
      && !role.rolreplication && !role.rolbypassrls
      && role.rolpassword?.startsWith("SCRAM-SHA-256$") === true)).toBe(true);
    expect(new Set(roles.rows.map(({ rolpassword }) => rolpassword)).size).toBe(9);

    const memberships = await database.pool.query<{
      member_name: string;
      role_name: string;
      admin_option: boolean;
      inherit_option: boolean;
      set_option: boolean;
    }>(`
      SELECT member.rolname AS member_name,capability.rolname AS role_name,
        membership.admin_option,membership.inherit_option,membership.set_option
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS member ON member.oid=membership.member
      JOIN pg_catalog.pg_roles AS capability ON capability.oid=membership.roleid
      WHERE member.rolname=ANY($1::text[])
      ORDER BY member.rolname,capability.rolname
    `,[DEVELOPMENT_DATABASE_PRINCIPALS.map(({ roleName }) => roleName)]);
    expect(memberships.rows).toEqual(DEVELOPMENT_DATABASE_PRINCIPALS
      .map(({ roleName, capabilityRole }) => ({
        member_name: roleName,
        role_name: capabilityRole,
        admin_option: false,
        inherit_option: true,
        set_option: true
      }))
      .sort((left, right) => left.member_name.localeCompare(right.member_name)));

    for (const principal of DEVELOPMENT_DATABASE_PRINCIPALS) {
      const databaseUrl = credentials.get(principal.environmentKey);
      expect(databaseUrl).toBeDefined();
      const loginPool = createPool(databaseUrl!);
      try {
        const witness = (await loginPool.query<{
          session_principal: string;
          principal: string;
          designated_member: boolean;
        }>(`
          SELECT session_user AS session_principal,current_user AS principal,
            pg_has_role(current_user,$1,'MEMBER') AS designated_member
        `,[principal.capabilityRole])).rows[0];
        expect(witness).toEqual({
          session_principal: principal.roleName,
          principal: principal.roleName,
          designated_member: true
        });
        const capabilities = [...new Set(DEVELOPMENT_DATABASE_PRINCIPALS
          .map(({ capabilityRole }) => capabilityRole))].sort();
        const effective = await loginPool.query<{ role_name: string; member: boolean }>(`
          SELECT role_name,pg_has_role(current_user,role_name,'MEMBER') AS member
          FROM unnest($1::text[]) AS ruled(role_name) ORDER BY role_name
        `,[capabilities]);
        const expectedEffective = new Set([principal.capabilityRole]);
        if (principal.capabilityRole === "debateai_authorization_runtime") {
          expectedEffective.add("debateai_runtime");
        }
        expect(effective.rows).toEqual(capabilities.map((role_name) => ({
          role_name,
          member: expectedEffective.has(role_name)
        })));
      } finally {
        await loginPool.end();
      }
    }

    const runtimePool = createPool(credentials.get("DATABASE_URL")!);
    const contentPool = createPool(credentials.get("CONTENT_PROVISION_DATABASE_URL")!);
    const erasurePool = createPool(credentials.get("ERASURE_DATABASE_URL")!);
    const authorizationPool = createPool(credentials.get("AUTHORIZATION_DATABASE_URL")!);
    const cleanupPool = createPool(credentials.get("PUBLICATION_CLEANUP_DATABASE_URL")!);
    try {
      await expect(assertContentProvisionDatabaseRole(runtimePool, contentPool))
        .resolves.toBeUndefined();
      await expect(assertAccountErasureDatabaseRole(runtimePool, erasurePool))
        .resolves.toBeUndefined();
      await expect(assertPublicationDatabaseRoleSeparation(runtimePool, authorizationPool))
        .resolves.toBeUndefined();
      await expect(assertPublicationCleanupDatabaseRole(cleanupPool)).resolves.toBeUndefined();
    } finally {
      await Promise.all([
        runtimePool.end(), contentPool.end(), erasurePool.end(),
        authorizationPool.end(), cleanupPool.end()
      ]);
    }
  }, 120_000);

  it("reads latest provider discovery through the actual runtime capability without table SELECT", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const credentials = parseCredentialFile(await readFile(credentialFilePath, "utf8"));
    const runtimePool = createPool(credentials.get("DATABASE_URL")!);
    const probedAt = new Date("2026-08-26T20:00:00.000Z");
    await database.pool.query(
      `INSERT INTO core.provider_probe
         (probe_id,provider_ref,maker,state,model_id,failure_code,probed_at)
       VALUES ($1,$2,$3,'HEALTHY',$4,NULL,$5)`,
      ["00000000-0000-4000-8000-000000000301", "provider:dev-runtime",
        "maker:dev-runtime", "model:dev-runtime", probedAt]
    );
    try {
      await expect(runtimePool.query("SELECT probe_id FROM core.provider_probe LIMIT 1"))
        .rejects.toMatchObject({ code: "42501" });
      await expect(new ProviderProbeRepository(runtimePool).readLatest(["provider:dev-runtime"]))
        .resolves.toEqual([{
          probeEvidenceRef: "00000000-0000-4000-8000-000000000301",
          providerRef: "provider:dev-runtime",
          maker: "maker:dev-runtime",
          state: "HEALTHY",
          modelId: "model:dev-runtime",
          failureCode: null,
          probedAt
        }]);
    } finally {
      await runtimePool.end();
    }
  }, 120_000);

  it("reads the empty private liveness history without erasure-table SELECT", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const credentials = parseCredentialFile(await readFile(credentialFilePath, "utf8"));
    const runtimePool = createPool(credentials.get("DATABASE_URL")!);
    try {
      await expect(runtimePool.query(
        "SELECT run_id FROM serve.private_run_key_cleanup_intent LIMIT 1"
      )).rejects.toMatchObject({ code: "42501" });
      await expect(new LivenessRepository(runtimePool).recordQuery(
        "QA liveness capability check",
        { ownerRef: "00000000-0000-4000-8000-000000000302", legacyAskerId: null }
      )).resolves.toBe(0);
    } finally {
      await runtimePool.end();
    }
  }, 120_000);

  it("records memory through the actual runtime role without erasure-table SELECT", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const credentials = parseCredentialFile(await readFile(credentialFilePath, "utf8"));
    const runtimePool = createPool(credentials.get("DATABASE_URL")!);
    const legacyAskerId = "asker:dev-runtime-memory";
    const question = "Can the actual development runtime persist private memory?";
    const runId = await new RunRepository(database.pool).startRun({
      questionLine: question,
      principal: { kind: "legacy", legacyAskerId },
      sessionId: "session:dev-runtime-memory",
      callerScope: "ASKER",
      asOf: new Date("2026-08-26T20:00:00.000Z"),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "dev-runtime-memory",
      compositionBudgetTier: "low",
      depthParams: { depth: 1 },
      discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1,
      envelopeBasis: { source: "dev-runtime-memory" },
      registerVersion: 1,
      batteryVersion: "dev-runtime-memory",
      batteryRows: []
    });
    try {
      expect((await database.pool.query<{ owned: boolean }>(
        "SELECT core.run_is_owned_by($1,NULL,$2) AS owned",
        [runId, legacyAskerId]
      )).rows[0]?.owned).toBe(true);
      expect((await runtimePool.query<{ run_id: string }>(
        "SELECT run_id FROM core.lock_owned_live_runs(ARRAY[$1]::uuid[],NULL,$2)",
        [runId, legacyAskerId]
      )).rows).toEqual([{ run_id: runId }]);
      await expect(runtimePool.query(
        "SELECT run_id FROM serve.private_run_key_cleanup_intent LIMIT 1"
      )).rejects.toMatchObject({ code: "42501" });
      await expect(new MemoryRepository(runtimePool).recordQuestionAndMatch({
        key: {
          runId,
          canonicalQuestionText: "can the actual development runtime persist private memory?",
          callerScope: "ASKER",
          askerScope: legacyAskerId,
          settlementAct: null,
          questionType: null,
          declaredField: null,
          normalizedBinding: {},
          frozenTerms: [],
          frozenQuerySetHash: null,
          asOf: "2026-08-26T20:00:00.000Z",
          policyVersion: 1,
          keyVersion: 1
        },
        decidedBy: "dev-runtime-memory",
        ownership: legacyAskerId
      })).resolves.toBeNull();
      expect((await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM memory.question_key WHERE run_id=$1",
        [runId]
      )).rows[0]?.count).toBe("1");
    } finally {
      await runtimePool.end();
    }
  }, 120_000);

  it("rejects privilege drift without rotating the credential file and stays idempotent after repair", async () => {
    const sourceBefore = await readFile(credentialFilePath, "utf8");
    await database.pool.query(`
      CREATE ROLE debateai_dev_forbidden_bridge NOLOGIN;
      GRANT debateai_dev_forbidden_bridge TO debateai_dev_runtime;
      ALTER ROLE debateai_dev_runtime CREATEDB CREATEROLE REPLICATION BYPASSRLS NOINHERIT
    `);

    await expect(provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    })).rejects.toThrow("DEV_DATABASE_PRINCIPAL_DRIFT");

    expect(await readFile(credentialFilePath, "utf8")).toBe(sourceBefore);
    await database.pool.query(`
      REVOKE debateai_dev_forbidden_bridge FROM debateai_dev_runtime;
      ALTER ROLE debateai_dev_runtime INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOREPLICATION NOBYPASSRLS
    `);
    await expect(provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    })).resolves.toEqual({ credentialFilePath, principalCount: 9 });
    const repaired = (await database.pool.query<{
      rolinherit: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
      direct_roles: string[];
    }>(`
      SELECT target.rolinherit,target.rolcreatedb,target.rolcreaterole,
        target.rolreplication,target.rolbypassrls,
        COALESCE((
          SELECT jsonb_agg(capability.rolname ORDER BY capability.rolname)
          FROM pg_catalog.pg_auth_members AS membership
          JOIN pg_catalog.pg_roles AS capability ON capability.oid=membership.roleid
          WHERE membership.member=target.oid
        ),'[]'::jsonb) AS direct_roles
      FROM pg_catalog.pg_roles AS target WHERE target.rolname='debateai_dev_runtime'
    `)).rows[0];
    expect(repaired).toEqual({
      rolinherit: true,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
      direct_roles: ["debateai_runtime"]
    });
  });

  it("refuses a service principal as the provisioning authority", async () => {
    const credentials = parseCredentialFile(await readFile(credentialFilePath, "utf8"));
    const runtimePool: Pool = createPool(credentials.get("DATABASE_URL")!);
    try {
      await expect(provisionDevelopmentDatabasePrincipals({
        adminPool: runtimePool,
        adminDatabaseUrl: database.connectionString,
        credentialFilePath
      })).rejects.toThrow("DEV_DATABASE_PRINCIPAL_ADMIN_REQUIRED");
    } finally {
      await runtimePool.end();
    }
  });

  it("runs the admin CLI without placing database credentials in its output", async () => {
    const cliCredentialPath = join(
      await realpath(secretRoot), ".local", "dev-auth", "database-principals.env"
    );
    const outcome = await runProvisioningCli({
      ...process.env,
      MIGRATION_DATABASE_URL: database.connectionString
    });
    expect(outcome).toEqual({
      exitCode: 0,
      stdout: `DEV_DATABASE_PRINCIPALS_READY=9:${cliCredentialPath}\n`,
      stderr: ""
    });
    const credentialSource = await readFile(cliCredentialPath, "utf8");
    expect(outcome.stdout).not.toContain("debateai-test-only");
    for (const databaseUrl of parseCredentialFile(credentialSource).values()) {
      expect(outcome.stdout).not.toContain(new URL(databaseUrl).password);
    }
  }, 120_000);

  it("converges concurrent first writers on one credential file", async () => {
    const concurrentCredentialPath = join(secretRoot, "concurrent-database-principals.env");
    const outcomes = await Promise.allSettled(Array.from({ length: 16 }, async () =>
      provisionDevelopmentDatabasePrincipals({
        adminPool: database.pool,
        adminDatabaseUrl: database.connectionString,
        credentialFilePath: concurrentCredentialPath
      })
    ));
    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    expect(parseCredentialFile(await readFile(concurrentCredentialPath, "utf8")).size).toBe(9);
  }, 120_000);
});
import { spawn } from "node:child_process";
