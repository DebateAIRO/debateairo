import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertAccountErasureDatabaseRole,
  assertContentProvisionDatabaseRole,
  assertPublicationCleanupDatabaseRole,
  assertPublicationDatabaseRoleSeparation,
  assertSupportDatabaseRole,
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
      [
        join(process.cwd(), "node_modules", ".bin", "tsx"),
        resolvePath(process.cwd(), "../../../node_modules/.bin/tsx")
      ].find((candidate) => existsSync(candidate)) ?? "tsx",
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

  it("creates the declared distinct SCRAM LOGINs with only their ruled direct memberships", async () => {
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
    expect(roles.rows).toHaveLength(DEVELOPMENT_DATABASE_PRINCIPALS.length);
    expect(roles.rows.every((role) => role.rolcanlogin && role.rolinherit
      && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole
      && !role.rolreplication && !role.rolbypassrls
      && role.rolpassword?.startsWith("SCRAM-SHA-256$") === true)).toBe(true);
    expect(new Set(roles.rows.map(({ rolpassword }) => rolpassword)).size)
      .toBe(DEVELOPMENT_DATABASE_PRINCIPALS.length);

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

  it("attests the exact runtime and support pools while runtime cannot resolve support tables", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const credentials = parseCredentialFile(await readFile(credentialFilePath, "utf8"));
    const runtimePool = createPool(credentials.get("DATABASE_URL")!);
    const supportPool = createPool(credentials.get("SUPPORT_DATABASE_URL")!);
    try {
      const runtime = (await runtimePool.query<{
        schema_usage: boolean;
        table_privilege: boolean;
      }>(`
        SELECT has_schema_privilege(current_user,namespace.oid,'USAGE') AS schema_usage,
          bool_or(has_table_privilege(current_user,relation.oid,'SELECT,INSERT'))
            AS table_privilege
        FROM pg_catalog.pg_namespace AS namespace
        JOIN pg_catalog.pg_class AS relation ON relation.relnamespace=namespace.oid
        WHERE namespace.nspname='support' AND relation.relkind IN ('r','p')
        GROUP BY namespace.oid
      `)).rows[0];
      expect(runtime).toEqual({ schema_usage: false, table_privilege: false });
      await expect(runtimePool.query(
        "SELECT * FROM support.session LIMIT 1"
      )).rejects.toMatchObject({ code: "42501" });
      await expect(assertSupportDatabaseRole(runtimePool, supportPool)).resolves.toBeUndefined();
    } finally {
      await Promise.all([runtimePool.end(), supportPool.end()]);
    }
  }, 120_000);

  it("rejects runtime support membership and direct support-table privilege", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const credentials = parseCredentialFile(await readFile(credentialFilePath, "utf8"));
    const runtimePool = createPool(credentials.get("DATABASE_URL")!);
    const supportPool = createPool(credentials.get("SUPPORT_DATABASE_URL")!);
    try {
      await database.pool.query("GRANT debateai_support TO debateai_dev_runtime");
      await expect(assertSupportDatabaseRole(runtimePool, supportPool))
        .rejects.toThrow("SUPPORT_DATABASE_ROLE_INVALID");
      await database.pool.query("REVOKE debateai_support FROM debateai_dev_runtime");

      await database.pool.query("GRANT SELECT ON support.session TO debateai_dev_runtime");
      await expect(assertSupportDatabaseRole(runtimePool, supportPool))
        .rejects.toThrow("SUPPORT_DATABASE_ROLE_INVALID");
      await database.pool.query("REVOKE SELECT ON support.session FROM debateai_dev_runtime");

      await database.pool.query("GRANT SELECT ON support.session TO debateai_dev_support");
      await expect(assertSupportDatabaseRole(runtimePool, supportPool))
        .rejects.toThrow("SUPPORT_DATABASE_ROLE_INVALID");
      await database.pool.query("REVOKE SELECT ON support.session FROM debateai_dev_support");

      await database.pool.query(
        "GRANT UPDATE(state) ON support.session TO debateai_support"
      );
      await expect(assertSupportDatabaseRole(runtimePool, supportPool))
        .rejects.toThrow("SUPPORT_DATABASE_ROLE_INVALID");
      await database.pool.query(
        "REVOKE UPDATE(state) ON support.session FROM debateai_support"
      );

      await database.pool.query(
        "GRANT SELECT ON support._shred_integrity_guard TO debateai_support"
      );
      await expect(assertSupportDatabaseRole(runtimePool, supportPool))
        .rejects.toThrow("SUPPORT_DATABASE_ROLE_INVALID");
      await database.pool.query(
        "REVOKE SELECT ON support._shred_integrity_guard FROM debateai_support"
      );
    } finally {
      await database.pool.query("REVOKE debateai_support FROM debateai_dev_runtime")
        .catch(() => undefined);
      await database.pool.query("REVOKE SELECT ON support.session FROM debateai_dev_runtime")
        .catch(() => undefined);
      await database.pool.query("REVOKE SELECT ON support.session FROM debateai_dev_support")
        .catch(() => undefined);
      await database.pool.query(
        "REVOKE UPDATE(state) ON support.session FROM debateai_support"
      ).catch(() => undefined);
      await database.pool.query(
        "REVOKE SELECT ON support._shred_integrity_guard FROM debateai_support"
      ).catch(() => undefined);
      await Promise.all([runtimePool.end(), supportPool.end()]);
    }
  }, 120_000);

  it("fails closed when a required support relation is missing", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const credentials = parseCredentialFile(await readFile(credentialFilePath, "utf8"));
    const runtimePool = createPool(credentials.get("DATABASE_URL")!);
    const supportPool = createPool(credentials.get("SUPPORT_DATABASE_URL")!);
    try {
      await database.pool.query("ALTER TABLE support.session_key RENAME TO session_key_missing");
      await expect(assertSupportDatabaseRole(runtimePool, supportPool))
        .rejects.toThrow("SUPPORT_DATABASE_ROLE_INVALID");
    } finally {
      await database.pool.query(
        "ALTER TABLE IF EXISTS support.session_key_missing RENAME TO session_key"
      );
      await Promise.all([runtimePool.end(), supportPool.end()]);
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

  it("records nonempty liveness and memory through the actual runtime capability boundary", async () => {
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
      const matchedRuntimePool = new Proxy(runtimePool, {
        get(target, property) {
          if (property === "query") return async (...args: unknown[]) => {
            const sql = String(args[0]);
            if (sql.includes("FROM core.run AS run") && sql.includes("LIMIT $3")) {
              return {
                rows: [{
                  run_id: runId,
                  question_line: question,
                  content_ciphertext: null,
                  created_at_seq: "1"
                }],
                rowCount: 1
              };
            }
            return (target.query as (...queryArgs: unknown[]) => Promise<unknown>)(...args);
          };
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
      }) as Pool;
      await expect(new LivenessRepository(matchedRuntimePool).recordQuery(
        question,
        { ownerRef: null, legacyAskerId }
      )).resolves.toBe(1);
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
    })).resolves.toEqual({ credentialFilePath, principalCount: 11 });
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
      stdout: `DEV_DATABASE_PRINCIPALS_READY=${DEVELOPMENT_DATABASE_PRINCIPALS.length}:${cliCredentialPath}\n`,
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
    expect(parseCredentialFile(await readFile(concurrentCredentialPath, "utf8")).size)
      .toBe(DEVELOPMENT_DATABASE_PRINCIPALS.length);
  }, 120_000);

  it("adds the newly ruled support principal without rotating existing development credentials", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const currentSource = await readFile(credentialFilePath, "utf8");
    const legacySource = currentSource.split("\n")
      .filter((row) => row.length > 0 && !row.startsWith("SUPPORT_DATABASE_URL="))
      .join("\n") + "\n";
    const legacyCredentials = parseCredentialFile(legacySource);
    expect(legacyCredentials.size).toBe(DEVELOPMENT_DATABASE_PRINCIPALS.length-1);
    const upgradedPath = join(secretRoot, "legacy-database-principals.env");
    await writeFile(upgradedPath, legacySource, { encoding: "utf8", mode: 0o600 });

    await expect(provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath: upgradedPath
    })).resolves.toEqual({
      credentialFilePath: upgradedPath,
      principalCount: DEVELOPMENT_DATABASE_PRINCIPALS.length
    });

    const upgraded = parseCredentialFile(await readFile(upgradedPath, "utf8"));
    expect(upgraded.size).toBe(DEVELOPMENT_DATABASE_PRINCIPALS.length);
    for (const [environmentKey, databaseUrl] of legacyCredentials) {
      expect(upgraded.get(environmentKey)).toBe(databaseUrl);
    }
    expect(upgraded.get("SUPPORT_DATABASE_URL")).toMatch(
      /^postgresql?:\/\/debateai_dev_support:/
    );

    const truncatedPath = join(secretRoot, "truncated-database-principals.env");
    const truncatedSource = legacySource.split("\n")
      .filter((row) => row.length > 0 && !row.startsWith("LIVENESS_DATABASE_URL="))
      .join("\n") + "\n";
    await writeFile(truncatedPath, truncatedSource, { encoding: "utf8", mode: 0o600 });
    await expect(provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath: truncatedPath
    })).rejects.toThrow("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    expect(await readFile(truncatedPath, "utf8")).toBe(truncatedSource);
  }, 120_000);

  it("rejects a permissive legacy credential before changing its bytes or mode", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const currentSource = await readFile(credentialFilePath, "utf8");
    const legacySource = currentSource.split("\n").slice(0, -2).join("\n") + "\n";
    const root = join(secretRoot, "unsafe-file-mode");
    const path = join(root, "database-principals.env");
    await mkdir(root, { mode: 0o700 });
    await writeFile(path, legacySource, { mode: 0o644 });

    await expect(provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath: path
    })).rejects.toThrow("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    expect(await readFile(path, "utf8")).toBe(legacySource);
    expect((await lstat(path)).mode & 0o777).toBe(0o644);
  }, 120_000);

  it("rejects a hardlinked legacy credential without replacing either name", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const currentSource = await readFile(credentialFilePath, "utf8");
    const legacySource = currentSource.split("\n").slice(0, -2).join("\n") + "\n";
    const root = join(secretRoot, "unsafe-hardlink");
    const path = join(root, "database-principals.env");
    const sibling = join(root, "database-principals.sibling.env");
    await mkdir(root, { mode: 0o700 });
    await writeFile(path, legacySource, { mode: 0o600 });
    await link(path, sibling);

    await expect(provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath: path
    })).rejects.toThrow("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    expect(await readFile(path, "utf8")).toBe(legacySource);
    expect(await readFile(sibling, "utf8")).toBe(legacySource);
    expect((await lstat(path)).nlink).toBe(2);
  }, 120_000);

  it("rejects an unsafe existing credential parent without normalizing it", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const currentSource = await readFile(credentialFilePath, "utf8");
    const legacySource = currentSource.split("\n").slice(0, -2).join("\n") + "\n";
    const root = join(secretRoot, "unsafe-parent-mode");
    const path = join(root, "database-principals.env");
    await mkdir(root, { mode: 0o700 });
    await writeFile(path, legacySource, { mode: 0o600 });
    await chmod(root, 0o755);

    await expect(provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath: path
    })).rejects.toThrow("DEV_DATABASE_CREDENTIAL_ROOT_INVALID");
    expect(await readFile(path, "utf8")).toBe(legacySource);
    expect((await lstat(root)).mode & 0o777).toBe(0o755);
  }, 120_000);

  it("upgrades exact nine-, ten-, and eleven-row private neighbors by suffix append only", async () => {
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: database.connectionString,
      credentialFilePath
    });
    const currentSource = await readFile(credentialFilePath, "utf8");
    const currentRows = currentSource.trimEnd().split("\n");
    for (const legacyLength of [9, 10, 11]) {
      const legacySource = currentRows.slice(0, legacyLength).join("\n") + "\n";
      const root = join(secretRoot, `valid-legacy-${legacyLength}`);
      const path = join(root, "database-principals.env");
      await mkdir(root, { mode: 0o700 });
      await writeFile(path, legacySource, { mode: 0o600 });

      await expect(provisionDevelopmentDatabasePrincipals({
        adminPool: database.pool,
        adminDatabaseUrl: database.connectionString,
        credentialFilePath: path
      })).resolves.toEqual({
        credentialFilePath: path,
        principalCount: DEVELOPMENT_DATABASE_PRINCIPALS.length
      });
      const upgraded = await readFile(path, "utf8");
      expect(upgraded.startsWith(legacySource)).toBe(true);
      expect(upgraded.slice(0, legacySource.length)).toBe(legacySource);
      expect(upgraded.trimEnd().split("\n"))
        .toHaveLength(DEVELOPMENT_DATABASE_PRINCIPALS.length);
      expect(upgraded.trimEnd().split("\n").slice(legacyLength).map(
        (row) => row.slice(0, row.indexOf("="))
      )).toEqual(DEVELOPMENT_DATABASE_PRINCIPALS.slice(legacyLength).map(
        ({ environmentKey }) => environmentKey
      ));
    }
  }, 120_000);
});
import { spawn } from "node:child_process";
