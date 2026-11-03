/**
 * Check 3's driver (tools/upload-check/start-checks.mjs copies it into an installed release root and runs it there with
 * that root's tsx, so every import below is the target commit's own code and packages).
 *
 *   tsx tools/upload-check/start-checks-driver.ts <cluster folder> <checker pid> [--test-extra-grant=<role>] [--test-system-revoke=<role>]
 *
 * It starts a throwaway PostgreSQL in <cluster folder> on port 5434 with the cluster name the start checks pin, makes
 * the `debateai` database, migrates it, provisions the production logins from the P3-01 principals list (plus the three
 * recovery roles the row-security release note's deployment rule grants the API logins by hand), seals a register
 * publication, and then runs the API's and the runner's start checks unchanged, each as its own production login. The
 * API's system logins get the role checks the API's start runs on them. PostgreSQL is stopped in a finally block, and
 * also when the checker (<checker pid>) is gone. The two --test- options are there for tests only, and act on the
 * throwaway cluster alone: one more role for the runner login, so a test can watch the runner check refuse, and one role
 * taken from the api-system login, so a test can watch a check on the system route refuse.
 *
 * Its stdout is exactly one line, {"ok":boolean,"lines":string[]}; everything else it or a library says goes to stderr.
 * A function this commit does not have makes that part "not checked", with the function's name. Every password here is
 * made up on the spot for the throwaway cluster; nothing reads a server address, a key or a limit.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

type Db = typeof import("@debateai/db");
type Register = typeof import("@debateai/register");
type StaffPolicy = typeof import("../../packages/register/src/staff-access-policy.js");
type PublishRegister = typeof import("../../deploy/preview-auth-dev/v1/publish-register.js");
type VerifyNative = typeof import("../../deploy/preview-auth-dev/v1/verify-native.js");
type Principals = typeof import("../../apps/runner/src/production-database-principals.js");
type AccountContext = typeof import("../../packages/db/src/account-context.js");
type PasswordReset = typeof import("../../packages/db/src/password-reset.js");
type EmailMfaRecovery = typeof import("../../packages/db/src/email-mfa-recovery.js");
type Receipt = Awaited<ReturnType<PublishRegister["publishPreviewRegister"]>>;

/** The port and database the start checks pin (verify-native.ts). */
const PORT = 5434;
const DATABASE = "debateai";
/** The migration login, made as tests/support/rls-logins.ts production() makes it. */
const ADMIN_ROLE = "debateai_prod_migrator";
const PRINCIPALS_MANIFEST = "docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json";
const VERIFY_NATIVE = "deploy/preview-auth-dev/v1/verify-native.ts";
/** The three recovery groups a host with the recovery policies on grants by hand (see the deployment rule below). */
const RECOVERY_ROLES = ["debateai_password_reset_runtime", "debateai_backup_email_runtime", "debateai_mfa_recovery_runtime"] as const;
const KNOWN_GAP = "known gap: the server's logins were made by hand in step B4 of R22's own upload guide; this checks the production list";
/** The engine folder of the release root this driver was copied into. */
const ENGINE = fileURLToPath(new URL("../../", import.meta.url));

// stdout carries the one result line only; console output from here or any library goes to stderr.
const toStderr = (...values: unknown[]): void => { process.stderr.write(`${values.map(String).join(" ")}\n`); };
console.log = console.info = console.warn = console.error = console.debug = toStderr;

/** A part this commit cannot run: the line names what is missing. */
class NotChecked extends Error {}
/** A refusal of the check itself, with its UPLOAD_CHECK_ code. */
class Refused extends Error {
  constructor(readonly code: string, words: string) { super(words); }
}

const codeOf = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code !== "") return code;
  return String((error as { message?: unknown } | null)?.message ?? error).trim().split("\n")[0] || "no message";
};

async function load<M>(specifier: string): Promise<M> {
  try {
    return await import(specifier) as M;
  } catch (error) {
    throw new NotChecked(`${specifier} could not be loaded (${codeOf(error)})`);
  }
}

function need<M, K extends keyof M & string>(module: M, name: K, from: string): M[K] {
  const value = (module as Record<string, unknown>)[name];
  if (value === undefined) throw new NotChecked(`this commit has no ${name} in ${from}`);
  return value as M[K];
}

/**
 * The cluster name both start checks pin: the `current_setting('cluster_name')='…'` literal inside each. A check this
 * commit lacks is not checked; a literal that is missing, doubled or not the same in both refuses.
 */
async function clusterName(): Promise<string> {
  const source = await readFile(join(ENGINE, VERIFY_NATIVE), "utf8").catch(() => {
    throw new NotChecked(`this commit has no ${VERIFY_NATIVE}`);
  });
  const names = ["assertSelectedApiConnection", "assertSelectedRunnerConnection"].map((check) => {
    const start = source.indexOf(`export async function ${check}(`);
    if (start < 0) throw new NotChecked(`this commit has no ${check} in ${VERIFY_NATIVE}`);
    const next = source.indexOf("\nexport ", start + 1);
    const found = [...source.slice(start, next < 0 ? undefined : next).matchAll(/current_setting\('cluster_name'\)='([^']+)'/g)];
    return found.length === 1 ? found[0]![1]! : null;
  });
  if (names[0] === null || names[0] !== names[1]) {
    throw new Refused("UPLOAD_CHECK_CLUSTER_NAME_UNREAD", `the cluster name is not one literal, the same in both checks, in ${VERIFY_NATIVE}`);
  }
  return names[0]!;
}

/** The roles <role> is a member of, read as the superuser, for a refusal's second line. */
async function membershipsOf(client: pg.Client, role: string): Promise<string> {
  const roles = (await client.query<{ roles: string[] }>(`SELECT coalesce(array_agg(g.rolname::text ORDER BY g.rolname),ARRAY[]::text[]) roles
    FROM pg_roles r JOIN pg_roles g ON g.oid<>r.oid AND pg_has_role(r.oid,g.oid,'MEMBER') WHERE r.rolname=$1`, [role])).rows[0]?.roles ?? [];
  return `  ${role} is a member of: ${roles.length === 0 ? "nothing" : roles.join(", ")}`;
}

/** One part: "<label>: passed", "<label>: refused (<code>)" plus <onRefusal>'s lines, or "<label>: not checked: …". */
async function part(lines: string[], label: string, run: () => Promise<void>, onRefusal: () => Promise<string[]> = async () => []): Promise<boolean> {
  try {
    await run();
    lines.push(`${label}: passed`);
    return true;
  } catch (error) {
    if (error instanceof NotChecked) {
      lines.push(`${label}: not checked: ${error.message}`);
    } else {
      // The start checks refuse with one code and no detail (PREVIEW_NATIVE_VERIFICATION_REFUSED), so the label line
      // stays exact and the code goes on its own line beneath it.
      lines.push(`${label}: refused`, `  ${codeOf(error)}`, ...await onRefusal().catch(() => []));
    }
    return false;
  }
}

let cluster: EmbeddedPostgres | undefined;
async function stopCluster(): Promise<void> {
  const running = cluster;
  cluster = undefined;
  // embedded-postgres's stop() waits for an exit that never comes when PostgreSQL has already exited, so it is only
  // asked when PostgreSQL still runs, and given 30 s. The checker removes the folder and stops the group either way.
  const child = (running as unknown as { process?: { exitCode: number | null; signalCode: string | null } } | undefined)?.process;
  if (running === undefined || child === undefined || child.exitCode !== null || child.signalCode !== null) return;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    running.stop().catch((error: unknown) => toStderr(`stopping PostgreSQL failed: ${codeOf(error)}`)),
    new Promise<void>((done) => { timer = setTimeout(() => { toStderr("PostgreSQL did not stop within 30 s"); done(); }, 30_000); })
  ]);
  clearTimeout(timer);
}

type TestHooks = Readonly<{ extraGrant?: string; systemRevoke?: string }>;
const PLAIN_ROLE = /^[a-z_][a-z0-9_]{0,62}$/;

async function run(clusterFolder: string, hooks: TestHooks): Promise<{ ok: boolean; lines: string[] }> {
  const lines: string[] = [];
  const name = await clusterName();
  lines.push("start checks: cluster name read from verify-native.ts, the same in both checks");
  // What setting up needs. Anything missing here means nothing could be checked.
  const db = await load<Db>("@debateai/db");
  const register = await load<Register>("@debateai/register");
  const staffPolicy = await load<StaffPolicy>("../../packages/register/src/staff-access-policy.js");
  const publish = await load<PublishRegister>("../../deploy/preview-auth-dev/v1/publish-register.js");
  const principals = await load<Principals>("../../apps/runner/src/production-database-principals.js");
  const migrate = need(db, "migrate", "@debateai/db");
  const createPool = need(db, "createPool", "@debateai/db");
  const provision = need(principals, "provisionProductionDatabasePrincipals", "production-database-principals.ts");
  const credentialFormat = need(principals, "PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT", "production-database-principals.ts");
  const loadBootstrapRegister = need(register, "loadBootstrapRegister", "@debateai/register");
  const publicationPort = need(register, "createPostgresRegisterPublicationPort", "@debateai/register");
  const canonicalRegisterJson = need(register, "canonicalRegisterJson", "@debateai/register");
  const snapshotSha256 = need(register, "computeRegisterSnapshotSha256", "@debateai/register");
  const parseVersion = need(register, "parseRegisterVersionText", "@debateai/register");
  const staffRow = need(staffPolicy, "STAFF_ACCESS_POLICY_REGISTER_ROW", "staff-access-policy.ts");
  const allowanceRow = need(staffPolicy, "INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW", "staff-access-policy.ts");
  const buildPreviewSourceRows = need(publish, "buildPreviewSourceRows", "publish-register.ts");
  const composePreviewSnapshot = need(publish, "composePreviewSnapshot", "publish-register.ts");
  const publishPreviewRegister = need(publish, "publishPreviewRegister", "publish-register.ts");
  const readSealedSnapshot = need(publish, "readSealedSnapshot", "publish-register.ts");

  // 1. The throwaway cluster: port 5434, the pinned cluster name, loopback only, no socket file.
  const superPassword = randomBytes(24).toString("hex");
  cluster = new EmbeddedPostgres({
    databaseDir: join(clusterFolder, "postgres"),
    user: "postgres",
    password: superPassword,
    port: PORT,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--set=shared_memory_type=mmap", "--set=dynamic_shared_memory_type=mmap"],
    postgresFlags: [
      "-c", "shared_memory_type=mmap", "-c", "dynamic_shared_memory_type=mmap", "-c", "lc_messages=C",
      "-c", `cluster_name=${name}`, "-c", "listen_addresses=127.0.0.1", "-c", "unix_socket_directories="
    ],
    onLog: (message) => toStderr(`[postgres] ${String(message).trimEnd()}`),
    onError: (message) => toStderr(`[postgres] ${String(message).trimEnd()}`)
  });
  await cluster.initialise();
  // embedded-postgres rejects with no reason when PostgreSQL exits before it is ready; its log is on stderr.
  await cluster.start().catch((error: unknown) => { throw error ?? new Error("PostgreSQL exited before it was ready"); });
  const superuser = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: superPassword, database: "postgres" });
  await superuser.connect();
  const pools: { end(): Promise<void> }[] = [];
  try {
    // 2. The migration login and the debateai database, as rls-logins.ts production() makes them.
    const adminPassword = randomBytes(32).toString("base64url");
    await superuser.query("BEGIN");
    await superuser.query("SET LOCAL password_encryption='scram-sha-256'");
    const createAdmin = (await superuser.query<{ statement: string }>(`SELECT format(
      'CREATE ROLE %I LOGIN INHERIT SUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L VALID UNTIL %L',
      $1::text,$2::text,$3::text) AS statement`, [ADMIN_ROLE, adminPassword, new Date(Date.now() + 12 * 60_000).toISOString()])).rows[0]!.statement;
    await superuser.query(createAdmin);
    await superuser.query("COMMIT");
    await superuser.query(`CREATE DATABASE ${DATABASE} OWNER ${ADMIN_ROLE}`);
    const adminDatabaseUrl = `postgresql://${ADMIN_ROLE}:${adminPassword}@127.0.0.1:${PORT}/${DATABASE}`;
    const adminPool = createPool(adminDatabaseUrl, { max: 2 });
    pools.push(adminPool);
    // 3. The target commit's migrations.
    await migrate(adminPool);
    // 4. The production logins, from the P3-01 principals list, by the product's own provisioner.
    const manifest = JSON.parse(await readFile(join(ENGINE, PRINCIPALS_MANIFEST), "utf8")) as Readonly<{
      provisioner: Readonly<{ managedPrincipalIds: readonly string[] }>;
      principals: readonly Readonly<{ id: string; roleName: string }>[];
    }>;
    const roleOf = new Map(manifest.principals.map(({ id, roleName }) => [id, roleName]));
    const humanValidUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    const credentials = manifest.provisioner.managedPrincipalIds.map((principalId) => {
      const url = new URL(adminDatabaseUrl);
      url.username = roleOf.get(principalId)!;
      url.password = randomBytes(32).toString("base64url");
      return {
        principalId,
        databaseUrl: url.toString(),
        ...(principalId === "obs-human" || principalId === "support-config-operator" ? { validUntil: humanValidUntil } : {})
      };
    });
    const custody = join(clusterFolder, "custody");
    await mkdir(custody, { mode: 0o700 });
    await chmod(custody, 0o700);
    await provision({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: { format: credentialFormat, credentials },
      supportConfigCredentialFilePath: join(custody, "support-config-operator.json")
    });
    const urls = new Map(credentials.map(({ principalId, databaseUrl }) => [principalId, databaseUrl]));
    const url = (id: string): string => {
      const found = urls.get(id);
      if (found === undefined) throw new NotChecked(`the production principals list has no ${id}`);
      return found;
    };
    const runnerRole = roleOf.get("runner-runtime") ?? "debateai_prod_runner_runtime";
    const apiRole = roleOf.get("api-runtime") ?? "debateai_prod_api_runtime";
    // The recovery roles are outside the production list (tests/architecture/p3-production-database-principals.test.ts,
    // externalRecoveryRoles). The deployment rule of docs/releases/2026-10-23-row-level-security.md §3 grants them to the
    // API's runtime login and to api-system on a host with the recovery policies on, as the test server has; the API's
    // start check requires them. Granted here the same way, each only if this commit's migrations made it.
    const recoveryGranted: string[] = [];
    for (const login of [apiRole, roleOf.get("api-system")]) {
      if (login === undefined) continue;
      for (const recovery of RECOVERY_ROLES) {
        const grant = (await superuser.query<{ statement: string | null }>(
          "SELECT CASE WHEN to_regrole($1) IS NOT NULL THEN format('GRANT %I TO %I',$1::text,$2::text) END AS statement", [recovery, login])).rows[0]?.statement;
        if (grant === null || grant === undefined) continue;
        await superuser.query(grant);
        if (!recoveryGranted.includes(recovery)) recoveryGranted.push(recovery);
      }
    }
    lines.push(recoveryGranted.length === 0 ? "start checks: this commit has no recovery roles to grant"
      : `start checks: ${recoveryGranted.length} recovery roles granted to the API runtime and system logins, by the row-security release note's deployment rule`);
    // Tests only, on this throwaway cluster: one more role for the runner login, one role fewer for api-system.
    for (const [role, statement, login, words] of [
      [hooks.extraGrant, "GRANT %I TO %I", runnerRole, "granted {role} to the runner login"],
      [hooks.systemRevoke, "REVOKE %I FROM %I", roleOf.get("api-system") ?? "debateai_prod_api_system", "took {role} from the api-system login"]
    ] as const) {
      if (role === undefined) continue;
      if (!PLAIN_ROLE.test(role)) throw new Refused("UPLOAD_CHECK_TEST_GRANT_INVALID", "the test role is not a plain role name");
      const sql = (await superuser.query<{ statement: string }>(`SELECT format('${statement}',$1::text,$2::text) AS statement`, [role, login])).rows[0]!.statement;
      await superuser.query(sql);
      lines.push(`test hook: ${words.replace("{role}", role)} on the throwaway cluster`);
    }
    // 5. A sealed publication, as tests/integration/preview-auth-dev-native-verify.test.ts seals one.
    const observation = { nodeVersion: process.version, pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40), sourceTree: "b".repeat(40),
      operatorSha256: "c".repeat(64), observedAt: "2026-10-09T12:00:00.000Z" };
    const source = await buildPreviewSourceRows(await loadBootstrapRegister(), observation);
    const base = [
      ...source.filter((row) => !["consumerRecoveryPolicy", "publicationCheckPolicy", "questionCheckPolicy", "taxAuthorities"].includes(row.rowKey)),
      ...[staffRow, allowanceRow].map((row) => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }))
    ];
    await publicationPort(adminPool).importHistorical({ registerVersion: parseVersion("4"), rows: base });
    const sealed = await readSealedSnapshot(adminPool, "4");
    const snapshot = composePreviewSnapshot({ sourceRows: source, baseRows: sealed.rows, baseRegisterVersion: "4", baseSnapshotSha256: snapshotSha256(base) });
    const receipt: Receipt = await publishPreviewRegister(adminPool, { publicationId: randomUUID(), sourceRef: "upload check start-checks", snapshot,
      approval: { baseRegisterVersion: snapshot.baseRegisterVersion, baseSnapshotSha256: snapshot.baseSnapshotSha256, snapshotSha256: snapshot.snapshotSha256, deltaSha256: snapshot.deltaSha256 } });
    lines.push(`start checks: migrated, ${credentials.length} production logins provisioned, register version ${receipt.registerVersion} sealed`);

    // 6. The two start checks, unchanged, each as its own login.
    const results: boolean[] = [];
    results.push(await part(lines, "api runtime login", async () => {
      const verify = await load<VerifyNative>("../../deploy/preview-auth-dev/v1/verify-native.js");
      await need(verify, "assertSelectedApiConnection", "verify-native.ts")({ DATABASE_URL: url("api-runtime") }, receipt);
    }, async () => [await membershipsOf(superuser, apiRole)]));
    results.push(await part(lines, "runner login", async () => {
      const verify = await load<VerifyNative>("../../deploy/preview-auth-dev/v1/verify-native.js");
      await need(verify, "assertSelectedRunnerConnection", "verify-native.ts")({ DATABASE_URL: url("runner-runtime") }, receipt);
    }, async () => [await membershipsOf(superuser, runnerRole)]));
    // 7. The system logins: the API's start (apps/api/src/main.ts, boot steps "database-roles", "account-context-logins"
    // and the three recovery roles) wires each T1 pool to its system login and runs the role checks on both routes: first
    // the T1 login's own connections, then its system target (attestEveryRoute). Then it checks each login's account
    // reach. The same here, on the production logins. The recovery checks run as on a host with the recovery policies on,
    // which the grants above assume. Left out, because each depends on a server setting this check cannot know:
    // assertPublicationCleanupDatabaseRole (only with PUBLICATION_ENABLED=true), assertDataExportDatabaseRoles (only with
    // DATA_EXPORT_STORE_PATH set) and assertSupportDatabaseRole (the support console's own start, main.ts:2049).
    results.push(await part(lines, "api system logins", async () => {
      const context = await load<AccountContext>("../../packages/db/src/account-context.js");
      const attestEveryRoute = need(context, "attestEveryRoute", "account-context.ts");
      const assertAccountContextLogins = need(context, "assertAccountContextLogins", "account-context.ts");
      const setCrossAccountTarget = need(db, "setCrossAccountTarget", "@debateai/db");
      const erasureRole = need(db, "assertAccountErasureDatabaseRole", "@debateai/db");
      const publicationRole = need(db, "assertPublicationDatabaseRoleSeparation", "@debateai/db");
      const provisionRole = need(db, "assertContentProvisionDatabaseRole", "@debateai/db");
      const open = (id: string) => { const pool = createPool(url(id), { max: 2 }); pools.push(pool); return pool; };
      const system = open("api-system"), authorizationSystem = open("api-authorization-system");
      const runtime = open("api-runtime"), authorization = open("api-authorization");
      const erasure = open("api-erasure"), contentProvision = open("api-content-provision");
      const passwordReset = await load<PasswordReset>("../../packages/db/src/password-reset.js");
      const emailMfa = await load<EmailMfaRecovery>("../../packages/db/src/email-mfa-recovery.js");
      const PasswordResetRepository = need(passwordReset, "PostgresPasswordResetRepository", "password-reset.ts");
      const BackupEmailRepository = need(emailMfa, "PostgresBackupEmailRepository", "email-mfa-recovery.ts");
      const MfaRecoveryRepository = need(emailMfa, "PostgresMfaRecoveryRepository", "email-mfa-recovery.ts");
      setCrossAccountTarget(runtime, system);
      setCrossAccountTarget(authorization, authorizationSystem);
      await attestEveryRoute(() => Promise.all([
        erasureRole(runtime, erasure), publicationRole(runtime, authorization), provisionRole(runtime, contentProvision)
      ]));
      // main.ts builds the three recovery repositories on the runtime pool, with the register version in force, and
      // attests each on every route. assertRole never uses the audit hasher, as in verify-native.ts.
      const version = Number(receipt.registerVersion);
      for (const repository of [
        new PasswordResetRepository(runtime, {} as never, version),
        new BackupEmailRepository(runtime, {} as never, version),
        new MfaRecoveryRepository(runtime, {} as never, version)
      ]) {
        try {
          await attestEveryRoute(() => repository.assertRole());
        } catch (error) {
          // Which route refused: the runtime login's own connections, or its system target.
          const own = (context as Partial<AccountContext>).onOwnConnections;
          const ownPasses = own === undefined ? undefined : await own(() => repository.assertRole()).then(() => true, () => false);
          throw new Error(`${codeOf(error)} on ${ownPasses === undefined ? "one of the two routes"
            : ownPasses ? "the system route (api-system)" : "the API runtime login's own route"}`);
        }
      }
      await assertAccountContextLogins({ requestPools: [runtime, authorization], systemPools: [system, authorizationSystem] });
    }, async () => [await membershipsOf(superuser, roleOf.get("api-system") ?? "debateai_prod_api_system")]));
    lines.push(KNOWN_GAP);
    return { ok: results.every(Boolean), lines };
  } finally {
    for (const pool of pools.splice(0).reverse()) await pool.end().catch(() => undefined);
    await superuser.end().catch(() => undefined);
    await stopCluster();
  }
}

async function main(): Promise<{ ok: boolean; lines: string[] }> {
  const [clusterFolder, checkerPid, ...options] = process.argv.slice(2);
  const option = (name: string): string | undefined => options.find((given) => given.startsWith(`--${name}=`))?.slice(name.length + 3);
  const extraGrant = option("test-extra-grant"), systemRevoke = option("test-system-revoke");
  const hooks: TestHooks = { ...(extraGrant === undefined ? {} : { extraGrant }), ...(systemRevoke === undefined ? {} : { systemRevoke }) };
  const checker = Number(checkerPid);
  if (clusterFolder === undefined || !Number.isSafeInteger(checker) || checker <= 1) {
    return { ok: false, lines: ["start checks: not checked: the driver was not given a cluster folder and the checker's pid"] };
  }
  // If the checker is gone (killed, or its terminal closed), stop PostgreSQL and leave.
  const watch = setInterval(() => {
    try { process.kill(checker, 0); } catch (error) {
      if ((error as { code?: unknown }).code === "ESRCH") void stopCluster().finally(() => process.exit(1));
    }
  }, 2000);
  watch.unref();
  try {
    return await run(clusterFolder, hooks);
  } catch (error) {
    if (error instanceof Refused) return { ok: false, lines: [`start checks: refused (${error.message})`, error.code] };
    if (error instanceof NotChecked) return { ok: false, lines: [`start checks: not checked: ${error.message}`] };
    toStderr(error instanceof Error ? error.stack ?? error.message : String(error));
    return { ok: false, lines: [`start checks: not checked: the check could not finish (${codeOf(error)})`] };
  } finally {
    clearInterval(watch);
    await stopCluster();
  }
}

const answer = await main();
process.stdout.write(`${JSON.stringify(answer)}\n`, () => process.exit(0));
