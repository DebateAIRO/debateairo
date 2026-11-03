/**
 * Row-level security S01 (PLAN S3.1, §0.3 "Test helpers"; DECISIONS D55, D67): the product's own database logins on a
 * test cluster, provisioned by the product's own provisioners (SPEC-v4 T9), and the API pools built from them the way
 * apps/api/src/main.ts builds its pools. Test support only.
 *
 * - `provisionRlsLogins(database)` runs apps/runner/src/dev-database-principals.ts once per TestDatabase (memoised: a
 *   second run would issue fresh passwords and void the first run's URLs, `dev-database-principals.ts:221-226`,
 *   `:434-446`). The production logins (apps/runner/src/production-database-principals.ts) are provisioned on the first
 *   `production()` call, on their own `debateai` database as tests/integration/production-database-principals.test.ts
 *   does, and handed out pointed at the harness database: roles are cluster-wide, and the harness database grants the
 *   same capability roles. Lazily, so a file that needs only the dev logins (every C5 file) pays for one provisioner.
 * - Login mode is the default (upload check Task 7, 2026-11-03); DEBATEAI_TEST_API_LOGINS=0 turns it off for a run.
 * - `apiTestPools(database, testFile, overrides)` is the R21 mode switch: the login pools in login mode, the harness
 *   superuser pool in every field when it is off or the file is on tests/support/master-key-files.txt (the master-key
 *   list, `DEBATEAI_TEST_MASTER_KEY_FILES`). In login mode it appends one report line per field to
 *   $DEBATEAI_TEST_API_LOGINS_REPORT and patches pg.Client.prototype.query once, so a query on a client connected as
 *   the harness superuser throws R21_SUPERUSER_POOL_IN_REQUEST inside a request scope.
 * - `runnerTestPool(database, budget)` is the runner's side of the same switch: in login mode a pool on the production
 *   runner login, debateai_prod_runner_runtime, the login the server's runner uses; otherwise nothing, and the caller
 *   keeps the superuser pool it always used.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { appendFile, chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  createEmailBlindIndex,
  encrypt,
  generateDek,
  generateVerificationToken,
  hashToken
} from "@debateai/crypto";
import {
  API_DATABASE_POOLS, configureContentEncryption, contentCipherFor, createPool, migrate, requestScopeActive,
  RUNNER_DATABASE_POOLS, runInRequestScope, setRequestCredential, type Pool
} from "@debateai/db";
import { provisionDevelopmentDatabasePrincipals } from "../../apps/runner/src/dev-database-principals.js";
import {
  PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT,
  provisionProductionDatabasePrincipals
} from "../../apps/runner/src/production-database-principals.js";
import type { TestHttpIdentity } from "./httpSession.js";
import { beforeTestDatabaseStops, type TestDatabase } from "./testDatabase.js";

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PRODUCTION_MANIFEST_PATH = join(PRODUCT_ROOT,
  "docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json");
const PRODUCTION_ADMIN_ROLE = "debateai_prod_migrator";
const MASTER_KEY_LIST = join(PRODUCT_ROOT, "tests/support/master-key-files.txt");
const PRODUCTION_DATABASE = "debateai";

/** The keys of the dev credential file, in apps/runner/src/dev-database-principals.ts order. */
export type DevPrincipalKey =
  | "DATABASE_URL" | "CONTENT_PROVISION_DATABASE_URL" | "ERASURE_DATABASE_URL" | "AUTHORIZATION_DATABASE_URL"
  | "PUBLICATION_CLEANUP_DATABASE_URL" | "REPLAY_SELF_TEST_DATABASE_URL" | "LIVENESS_DATABASE_URL"
  | "SETTLEMENT_DATABASE_URL" | "EVALUATOR_DEV_MENU_DATABASE_URL" | "SUPPORT_CONFIG_OPERATOR_DATABASE_URL"
  | "SUPPORT_DATABASE_URL" | "DATA_EXPORT_DATABASE_URL" | "API_SYSTEM_DATABASE_URL"
  | "API_AUTHORIZATION_SYSTEM_DATABASE_URL" | "RUNNER_DATABASE_URL";

const DEV_PRINCIPAL_KEYS: readonly DevPrincipalKey[] = Object.freeze([
  "DATABASE_URL", "CONTENT_PROVISION_DATABASE_URL", "ERASURE_DATABASE_URL", "AUTHORIZATION_DATABASE_URL",
  "PUBLICATION_CLEANUP_DATABASE_URL", "REPLAY_SELF_TEST_DATABASE_URL", "LIVENESS_DATABASE_URL",
  "SETTLEMENT_DATABASE_URL", "EVALUATOR_DEV_MENU_DATABASE_URL", "SUPPORT_CONFIG_OPERATOR_DATABASE_URL",
  "SUPPORT_DATABASE_URL", "DATA_EXPORT_DATABASE_URL", "API_SYSTEM_DATABASE_URL",
  "API_AUTHORIZATION_SYSTEM_DATABASE_URL", "RUNNER_DATABASE_URL"
]);

/** The production principals a test reaches: the two API T1 logins, their system twins and the runner (P3-01 ids). */
export type RlsProductionPrincipalId =
  | "api-runtime" | "api-authorization" | "api-system" | "api-authorization-system" | "runner-runtime";

/**
 * What the logins need of a database: its superuser pool and its URL. A TestDatabase has both, and so does the
 * acceptance harness's standing database (acceptance/standing-db.ts), whose runner the runner pool below also serves.
 */
type RlsDatabase = Pick<TestDatabase, "pool" | "connectionString">;

/** The API's pools, field for field as apps/api/src/main.ts builds them (PLAN §0.3). */
export type ApiTestPools = Readonly<{
  runtime: Pool;
  authorization: Pool;
  legacyAskAdmission: Pool;
  releaseWatch: Pool;
  roomDecision: Pool;
  system: Pool;
  authorizationSystem: Pool;
  erasure: Pool;
  contentProvision: Pool;
  serverAskAdmission: Pool;
  publicationCleanup: Pool;
  support: Pool;
  dataExport: Pool;
  evaluatorDevMenu: Pool;
}>;
type ApiPoolField = keyof ApiTestPools;

/**
 * Each field: the dev credential key of its login, its budget in API_DATABASE_POOLS, and the field whose pool is its
 * cross-account target (main.ts: `setCrossAccountTarget(pool, systemPool)`, `(legacyAskAdmissionPool, systemPool)`,
 * `(authorizationPool, authorizationSystemPool)`; releaseWatch keeps none). Targets come first in this order.
 */
const API_POOL_WIRING: readonly Readonly<{ field: ApiPoolField; key: DevPrincipalKey; target?: ApiPoolField }>[] = Object.freeze([
  { field: "system", key: "API_SYSTEM_DATABASE_URL" },
  { field: "authorizationSystem", key: "API_AUTHORIZATION_SYSTEM_DATABASE_URL" },
  { field: "runtime", key: "DATABASE_URL", target: "system" },
  { field: "authorization", key: "AUTHORIZATION_DATABASE_URL", target: "authorizationSystem" },
  { field: "legacyAskAdmission", key: "DATABASE_URL", target: "system" },
  { field: "releaseWatch", key: "DATABASE_URL" },
  { field: "roomDecision", key: "API_SYSTEM_DATABASE_URL" },
  { field: "erasure", key: "ERASURE_DATABASE_URL" },
  { field: "contentProvision", key: "CONTENT_PROVISION_DATABASE_URL" },
  { field: "serverAskAdmission", key: "CONTENT_PROVISION_DATABASE_URL" },
  { field: "publicationCleanup", key: "PUBLICATION_CLEANUP_DATABASE_URL" },
  { field: "support", key: "SUPPORT_DATABASE_URL" },
  { field: "dataExport", key: "DATA_EXPORT_DATABASE_URL" },
  { field: "evaluatorDevMenu", key: "EVALUATOR_DEV_MENU_DATABASE_URL" }
]);

export type RlsProductionLogins = Readonly<{
  url(id: RlsProductionPrincipalId): string;
  loginPool(id: RlsProductionPrincipalId, max?: number): Pool;
}>;

export type RlsLogins = Readonly<{
  url(key: DevPrincipalKey): string;
  credentials(): ReadonlyMap<DevPrincipalKey, string>;
  loginPool(key: DevPrincipalKey, max?: number): Pool;
  apiPools(): ApiTestPools;
  /** The production logins, provisioned on the first call (memoised). */
  production(): Promise<RlsProductionLogins>;
  end(): Promise<void>;
}>;

/** One seeded account (superuser seeding, spike 1's shape) plus the raw csrf token its live session carries. */
export type RlsTestAccount = Readonly<{
  userId: string;
  ownerRef: string;
  sessionId: string;
  token: string;
  tokenHash: string;
  revokedToken: string;
  expiredToken: string;
  runId: string;
  csrfToken: string;
}>;

type RlsLoginsState = {
  readonly logins: RlsLogins;
  readonly track: (pool: Pool) => Pool;
};

const provisioned = new WeakMap<RlsDatabase, Promise<RlsLoginsState>>();

function poolOptions(field: ApiPoolField, target?: Pool): Parameters<typeof createPool>[1] {
  return target === undefined ? API_DATABASE_POOLS[field] : { ...API_DATABASE_POOLS[field], crossAccount: target };
}

async function privateDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  await chmod(directory, 0o700);
  return directory;
}

function readEnvironmentFile(source: string): ReadonlyMap<string, string> {
  return new Map(source.split("\n").filter((line) => line !== "").map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)] as const;
  }));
}

async function provisionProduction(database: RlsDatabase, track: (pool: Pool) => Pool,
  directories: string[]): Promise<RlsProductionLogins> {
  const harness = new URL(database.connectionString);
  const adminPassword = randomBytes(32).toString("base64url");
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL password_encryption='scram-sha-256'");
    const statement = (await client.query<{ statement: string }>(`
      SELECT format(
        'CREATE ROLE %I LOGIN INHERIT SUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L VALID UNTIL %L',
        $1::text,$2::text,$3::text
      ) AS statement`, [PRODUCTION_ADMIN_ROLE, adminPassword, new Date(Date.now() + 12 * 60_000).toISOString()])).rows[0]!.statement;
    await client.query(statement);
    await client.query("COMMIT");
    await client.query(`CREATE DATABASE ${PRODUCTION_DATABASE} OWNER ${PRODUCTION_ADMIN_ROLE}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const admin = new URL(harness);
  admin.username = PRODUCTION_ADMIN_ROLE;
  admin.password = adminPassword;
  admin.pathname = `/${PRODUCTION_DATABASE}`;
  const adminDatabaseUrl = admin.toString();
  const adminPool = createPool(adminDatabaseUrl, { max: 2 });
  try {
    await migrate(adminPool);
    const manifest = JSON.parse(await readFile(PRODUCTION_MANIFEST_PATH, "utf8")) as Readonly<{
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
    const custody = await privateDirectory("rls-logins-production-");
    directories.push(custody);
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: { format: PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT, credentials },
      supportConfigCredentialFilePath: join(custody, "support-config-operator.json")
    });
    const urls = new Map(credentials.map(({ principalId, databaseUrl }) => {
      const url = new URL(databaseUrl);
      url.pathname = harness.pathname;
      return [principalId, url.toString()] as const;
    }));
    const url = (id: RlsProductionPrincipalId): string => {
      const found = urls.get(id);
      if (found === undefined) throw new TypeError(`RLS_PRODUCTION_LOGIN_UNKNOWN:${id}`);
      return found;
    };
    return Object.freeze({
      url,
      loginPool: (id: RlsProductionPrincipalId, max = 4) => track(createPool(url(id), { max }))
    });
  } finally {
    await adminPool.end();
  }
}

async function provision(database: RlsDatabase): Promise<RlsLoginsState> {
  const pools: Pool[] = [];
  const directories: string[] = [];
  const track = (pool: Pool): Pool => { pools.push(pool); return pool; };
  const custody = await privateDirectory("rls-logins-dev-");
  directories.push(custody);
  const credentialFilePath = join(custody, "dev-database.env");
  await provisionDevelopmentDatabasePrincipals({
    adminPool: database.pool,
    adminDatabaseUrl: database.connectionString,
    credentialFilePath
  });
  const file = readEnvironmentFile(await readFile(credentialFilePath, "utf8"));
  if (file.size !== DEV_PRINCIPAL_KEYS.length || DEV_PRINCIPAL_KEYS.some((key) => !file.has(key))) {
    throw new TypeError("RLS_DEV_CREDENTIAL_FILE_UNEXPECTED");
  }
  const credentials: ReadonlyMap<DevPrincipalKey, string> = new Map(DEV_PRINCIPAL_KEYS.map((key) => [key, file.get(key)!]));
  const url = (key: DevPrincipalKey): string => credentials.get(key)!;
  let apiPools: ApiTestPools | undefined;
  let production: Promise<RlsProductionLogins> | undefined;
  const logins: RlsLogins = Object.freeze({
    url,
    credentials: () => credentials,
    loginPool: (key: DevPrincipalKey, max = 4) => track(createPool(url(key), { max })),
    apiPools: () => {
      if (apiPools === undefined) {
        const built: Partial<Record<ApiPoolField, Pool>> = {};
        for (const { field, key, target } of API_POOL_WIRING) {
          built[field] = track(createPool(url(key), poolOptions(field, target === undefined ? undefined : built[target])));
        }
        apiPools = Object.freeze(built as ApiTestPools);
      }
      return apiPools;
    },
    production: () => {
      production ??= provisionProduction(database, track, directories);
      return production;
    },
    end: async () => {
      const open = pools.splice(0);
      for (const pool of open) await pool.end().catch(() => undefined);
      for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
    }
  });
  return { logins, track };
}

function provisionedState(database: RlsDatabase): Promise<RlsLoginsState> {
  let state = provisioned.get(database);
  if (state === undefined) {
    state = provision(database);
    provisioned.set(database, state);
    state.catch(() => { if (provisioned.get(database) === state) provisioned.delete(database); });
    // The logins end before the cluster stops, also in a file that never ends them itself (testDatabase.ts).
    beforeTestDatabaseStops(database, () => endProvisionedRlsLogins(database));
  }
  return state;
}

/** The dev logins of `database`, provisioned once per TestDatabase: the second call returns the first call's object. */
export async function provisionRlsLogins(database: TestDatabase): Promise<RlsLogins> {
  return (await provisionedState(database)).logins;
}

/**
 * Upload check Task 6 (2026-11-02): the runner's pool in login mode. The server's runner reaches the database on the
 * production login debateai_prod_runner_runtime (P3-01's runner-runtime row: debateai_runtime and
 * debateai_rls_all_accounts, no superuser, no row-security bypass), but the tests always ran it on the harness
 * superuser, so a fault in the runner's roles (the start check of 2 Nov) never showed in a test.
 *
 * - Login mode (the default since Task 7): a pool on that login, sized as apps/runner/src/main.ts sizes the `budget`
 *   pool (RUNNER_DATABASE_POOLS), pointed at the harness database. The production logins are provisioned on the first
 *   call for `database` (memoised, as `production()` above), and `endProvisionedRlsLogins(database)` ends the pool.
 * - DEBATEAI_TEST_API_LOGINS=0: `undefined`, and the caller uses the superuser pool it always used, unchanged.
 *
 * The runner runs outside any request scope, so the superuser guard of `apiTestPools` never fires on its work.
 */
export async function runnerTestPool(
  database: RlsDatabase,
  budget: keyof typeof RUNNER_DATABASE_POOLS = "runtime"
): Promise<Pool | undefined> {
  if (loginModeOff()) return undefined;
  // Read before the first wait, while the calling test file is still on the stack.
  const file = callingTestFile();
  const state = await provisionedState(database);
  const production = await state.logins.production();
  const url = production.url("runner-runtime");
  const report = process.env.DEBATEAI_TEST_API_LOGINS_REPORT;
  if (report !== undefined && report !== "") await appendFile(report, `${file}\trunner:${budget}\t${loginOf(url)}\n`);
  return state.track(createPool(url, RUNNER_DATABASE_POOLS[budget]));
}

/**
 * Upload check Task 7 (R21): the pool a test hands to the runner it builds itself, and to the runner's gateways and
 * story writer. In login mode the runner login's pool from `runnerTestPool`, carrying `superuser`'s content cipher if
 * that pool has one; otherwise `superuser` itself (by default the harness superuser pool), exactly as before.
 */
export async function runnerPoolOrSuperuser(
  database: RlsDatabase,
  superuser: Pool = database.pool,
  budget: keyof typeof RUNNER_DATABASE_POOLS = "runtime"
): Promise<Pool> {
  const login = await runnerTestPool(database, budget);
  return login === undefined ? superuser : shareContentCipher(superuser, login);
}

/**
 * Gives `login` the content cipher `superuser` carries, if it carries one and `login` has none yet, so the runner on
 * its own login reads and writes the same encrypted rows. Returns `login`.
 */
export function shareContentCipher(superuser: Pool, login: Pool): Pool {
  const cipher = contentCipherFor(superuser);
  if (cipher !== undefined && contentCipherFor(login) === undefined) configureContentEncryption(login, cipher);
  return login;
}

/**
 * Ends the logins of `database` (their pools and their credential folders) if something above provisioned them, before
 * the caller stops the database. Provisions nothing: with login mode off it does nothing.
 */
export async function endProvisionedRlsLogins(database: RlsDatabase): Promise<void> {
  const state = provisioned.get(database);
  if (state === undefined) return;
  const settled = await state.catch(() => undefined);
  await settled?.logins.end();
}

/** The login pools whatever DEBATEAI_TEST_API_LOGINS says (S4.1, S8.2). */
export async function loginApiPools(database: TestDatabase): Promise<ApiTestPools> {
  return (await provisionRlsLogins(database)).apiPools();
}

/**
 * Upload check Task 7: reads the master-key list, one entry per line: a test file's path from dialectical-engine/, one
 * or more spaces, then the one-line reason it may use the superuser pool inside a request. Lines starting with `#` and
 * blank lines are skipped. An entry without a reason, or a file named twice, refuses MASTER_KEY_FILES_ENTRY_INVALID.
 */
export function readMasterKeyFiles(source: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  for (const line of source.split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const found = /^(\S+)\s+(\S.*)$/u.exec(line.trim());
    if (found === null || entries.has(found[1]!)) throw new TypeError(`MASTER_KEY_FILES_ENTRY_INVALID: ${line}`);
    entries.set(found[1]!, found[2]!);
  }
  return entries;
}

/** The master-key list, tests/support/master-key-files.txt: the files whose API pools stay on the superuser. */
export const DEBATEAI_TEST_MASTER_KEY_FILES: ReadonlyMap<string, string> =
  readMasterKeyFiles(readFileSync(MASTER_KEY_LIST, "utf8"));

/**
 * The mode `testFile`'s API pools run in, decided once per call of apiTestPools:
 * - "off" when DEBATEAI_TEST_API_LOGINS=0: the superuser pool, as before Task 7;
 * - "master-key" when the file is on the master-key list: the superuser pool, with no guard;
 * - "logins" otherwise (the default): the product's own logins, and from now on in this process a query on a client
 *   connected as `superuserUrl`'s login throws R21_SUPERUSER_POOL_IN_REQUEST inside a request scope.
 */
export function enterApiPoolMode(testFile: string, superuserUrl: string): "logins" | "master-key" | "off" {
  if (loginModeOff()) return "off";
  if (DEBATEAI_TEST_MASTER_KEY_FILES.has(relative(PRODUCT_ROOT, fileURLToPath(testFile)))) return "master-key";
  guardSuperuserInRequests(loginOf(superuserUrl));
  return "logins";
}

/** Login mode is on unless DEBATEAI_TEST_API_LOGINS=0 asks for the old superuser runs (upload check Task 7). */
function loginModeOff(): boolean {
  return process.env.DEBATEAI_TEST_API_LOGINS === "0";
}

const R21_GUARD = Symbol.for("debateai.rls.r21-superuser-guard.v1");
type GuardedClientPrototype = { query: (...args: unknown[]) => unknown; [R21_GUARD]?: Set<string> };

/**
 * Login mode (D55): a query on a client whose `user` (pg/lib/client.js:55) is a guarded superuser fails while a request
 * scope is active — `database.pool` and every pool a file builds from the harness URL — instead of passing silently.
 */
function guardSuperuserInRequests(superuser: string): void {
  const prototype = pg.Client.prototype as unknown as GuardedClientPrototype;
  const guarded = prototype[R21_GUARD];
  if (guarded !== undefined) { guarded.add(superuser); return; }
  const users = new Set([superuser]);
  const original = prototype.query;
  prototype.query = function guardedQuery(this: pg.Client, ...args: unknown[]): unknown {
    if (users.has(this.user ?? "") && requestScopeActive()) {
      const failure = new TypeError("R21_SUPERUSER_POOL_IN_REQUEST");
      const callback = args.at(-1);
      if (typeof callback === "function") {
        process.nextTick(() => (callback as (error: Error) => void)(failure));
        return undefined;
      }
      return Promise.reject(failure);
    }
    return original.apply(this, args);
  };
  Object.defineProperty(prototype, R21_GUARD, { value: users });
}

function loginOf(url: string): string {
  return decodeURIComponent(new URL(url).username);
}

/**
 * PRD-N2 (t_283643c4): runs `fn` as the product runs a repository call inside a request — in a request scope carrying
 * the account's raw session token (`null`: an anonymous request) — so in login mode a T1 pool sends the call's
 * statements on its own login with that account's context instead of routing them to its system target, as it does for
 * every statement made outside a scope. In superuser mode the pools have no target and the scope changes nothing.
 */
export function inAccountRequest<T>(sessionToken: string | null, fn: () => Promise<T>): Promise<T> {
  return runInRequestScope(async () => {
    setRequestCredential(sessionToken);
    return fn();
  });
}

const ROUTED_OBSERVED = Symbol.for("debateai.rls.routed-call-report.v1");
/** The T1 fields of ApiTestPools: the pools main.ts gives a system target (runtime, legacyAskAdmission, authorization). */
const T1_FIELDS: readonly ApiPoolField[] = Object.freeze(API_POOL_WIRING.filter(({ target }) => target !== undefined)
  .map(({ field }) => field));

/** The test file of `callingTestLine()`, without its line. */
function callingTestFile(): string {
  return callingTestLine().replace(/:\d+$/u, "");
}

/** The first stack frame in a test file (not tests/support), as `<path from the product root>:<line>`. */
function callingTestLine(): string {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 60;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;
  for (const frame of stack.split("\n").slice(1)) {
    const found = /(\/[^\s():]+\.test\.tsx?):(\d+):\d+/u.exec(frame);
    if (found !== null && !found[1]!.includes("/tests/support/")) return `${relative(PRODUCT_ROOT, found[1]!)}:${found[2]}`;
  }
  return "no-test-frame";
}

/**
 * PRD-N2 (t_283643c4), login mode with $DEBATEAI_TEST_API_LOGINS_ROUTED_REPORT set: a query or checkout on a T1 pool
 * made OUTSIDE a request scope — which therefore runs on the system login, not on the T1 login — appends
 * "<test file>\t<pool field>\t<test file:line that made it>" once. A direct call the product makes inside a request then
 * shows by line; background readers, boot checks and fixture writes through a T1 pool show too, and the reader of the
 * report classifies each line. Off unless the variable is set: cluster.sh's report and counts are unchanged.
 */
function reportRoutedCalls(pools: ApiTestPools, file: string, report: string): void {
  const seen = new Set<string>();
  for (const field of T1_FIELDS) {
    const pool = pools[field] as Pool & { [ROUTED_OBSERVED]?: true };
    if (pool[ROUTED_OBSERVED] === true) continue;
    Object.defineProperty(pool, ROUTED_OBSERVED, { value: true });
    const methods = pool as unknown as Record<"query" | "connect", (...args: unknown[]) => unknown>;
    for (const method of ["query", "connect"] as const) {
      const original = methods[method];
      methods[method] = function observedRoutedCall(...args: unknown[]): unknown {
        if (!requestScopeActive()) {
          const line = `${file}\t${field}\t${callingTestLine()}\n`;
          if (!seen.has(line)) { seen.add(line); appendFileSync(report, line); }
        }
        return original.apply(pool, args);
      };
    }
  }
}

/**
 * The R21 mode switch (S5.x): the login pools in login mode (the default), the harness superuser pool in every field
 * when DEBATEAI_TEST_API_LOGINS=0 or `testFile` is on the master-key list. A field named in `overrides` is, in both
 * modes, a pool on that URL (a login the file made itself) wired as main.ts wires that field: runtime and
 * legacyAskAdmission with the `system` pool (or overrides.system) as target, authorization with `authorizationSystem`
 * (or overrides.authorizationSystem); a target the overrides do not name is the dev system login, so overrides on those
 * fields provision the dev logins in superuser mode too.
 */
export async function apiTestPools(
  database: TestDatabase,
  testFile: string,
  overrides: Partial<Record<ApiPoolField, string>> = {}
): Promise<ApiTestPools> {
  const loginMode = enterApiPoolMode(testFile, database.connectionString) === "logins";
  const fields = API_POOL_WIRING.map(({ field }) => field);
  const overridden = fields.filter((field) => overrides[field] !== undefined);
  if (!loginMode && overridden.length === 0) {
    return Object.freeze(Object.fromEntries(fields.map((field) => [field, database.pool])) as ApiTestPools);
  }
  const state = await provisionedState(database);
  const base = loginMode ? state.logins.apiPools() : undefined;
  const systemPools = (): ApiTestPools => state.logins.apiPools();
  const built: Partial<Record<ApiPoolField, Pool>> = {};
  const own: Partial<Record<ApiPoolField, string>> = {};
  for (const { field, key, target } of API_POOL_WIRING) {
    const url = overrides[field];
    if (url === undefined) {
      built[field] = base === undefined ? database.pool : base[field];
      own[field] = base === undefined ? database.connectionString : state.logins.url(key);
      continue;
    }
    const targetPool = target === undefined ? undefined
      : overrides[target] !== undefined ? built[target] : systemPools()[target];
    built[field] = state.track(createPool(url, poolOptions(field, targetPool)));
    own[field] = url;
  }
  const pools = Object.freeze(built as ApiTestPools);
  if (loginMode) {
    const report = process.env.DEBATEAI_TEST_API_LOGINS_REPORT;
    if (report !== undefined && report !== "") {
      const file = relative(PRODUCT_ROOT, fileURLToPath(testFile));
      await appendFile(report, fields.map((field) => `${file}\t${field}\t${loginOf(own[field]!)}\n`).join(""));
    }
    const routed = process.env.DEBATEAI_TEST_API_LOGINS_ROUTED_REPORT;
    if (routed !== undefined && routed !== "") {
      reportRoutedCalls(pools, relative(PRODUCT_ROOT, fileURLToPath(testFile)), routed);
    }
  }
  return pools;
}

/**
 * The system-side twin of a file's own runtime login (B7): LOGIN role `name`, member of `roles` and of
 * debateai_rls_all_accounts (each WITH INHERIT TRUE, SET TRUE, D54), with a test-only password. Returns its URL.
 */
export async function createSystemTwin(database: TestDatabase, name: string, roles: readonly string[]): Promise<string> {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(name) || roles.some((role) => !/^[a-z][a-z0-9_]{0,62}$/u.test(role))) {
    throw new TypeError("RLS_SYSTEM_TWIN_NAME_INVALID");
  }
  const password = randomBytes(32).toString("base64url");
  await database.pool.query(`CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
  for (const role of [...roles, "debateai_rls_all_accounts"]) {
    await database.pool.query(`GRANT ${role} TO ${name} WITH INHERIT TRUE, SET TRUE`);
  }
  const url = new URL(database.connectionString);
  url.username = name;
  url.password = password;
  return url.toString();
}

/**
 * Account `label`: an active identity."user" row, a live session (and a revoked and an expired one), and one legacy
 * asker run owned through core.append_run_ownership_event — superuser seeding, the rows spike 1 measured
 * (probes/ARCH-S01/spike-context.mts).
 */
export async function seedSessionAccount(superuserPool: Pool, label: string): Promise<RlsTestAccount> {
  const userId = randomUUID(), ownerRef = randomUUID(), sessionId = randomUUID();
  const token = generateVerificationToken(), csrfToken = generateVerificationToken();
  const revokedToken = generateVerificationToken(), expiredToken = generateVerificationToken();
  const email = `${label}-${userId}@example.test`;
  await superuserPool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,
      audit_token,owner_ref,state,adult_affirmed_at,created_at)
    VALUES($1,$2,$6::jsonb,'$argon2id$fixture',$3,$4,$5,'active',now(),now())`, [
    userId, createEmailBlindIndex(Buffer.alloc(32, 0x5a), email), `pseudo-${label}-${userId.slice(0, 8)}`, randomUUID(),
    ownerRef, JSON.stringify(encrypt(generateDek(), Buffer.from(email),
      ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"]))
  ]);
  const session = `INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at)`;
  await superuserPool.query(`${session} VALUES($1,$2,$3,$4,'{}',now(),now(),now()+interval '1 day',now()+interval '30 days',now(),NULL)`,
    [sessionId, userId, hashToken("session", token), hashToken("csrf", csrfToken)]);
  await superuserPool.query(`${session} VALUES($1,$2,$3,$4,'{}',now(),now(),now()+interval '1 day',now()+interval '30 days',now(),now())`,
    [randomUUID(), userId, hashToken("session", revokedToken), hashToken("csrf", generateVerificationToken())]);
  await superuserPool.query(`${session} VALUES($1,$2,$3,$4,'{}',now()-interval '40 days',now()-interval '40 days',
      now()-interval '39 days',now()-interval '10 days',now()-interval '40 days',NULL)`,
    [randomUUID(), userId, hashToken("session", expiredToken), hashToken("csrf", generateVerificationToken())]);
  const runId = (await superuserPool.query<{ run_id: string }>(`INSERT INTO core.run (question_line, asker_id, session_id,
      caller_scope, as_of, asker_risk_tier, risk_tier, tier_source, tier_provenance_ref, composition_budget_tier, depth_params,
      agent_count, discovered_panel, stranger_sample_rate, envelope_basis, register_version, battery_version, created_at_seq)
    VALUES ('rls ' || $2, 'asker:rls-' || $2 || '-' || $1::text, 'session:rls', 'ASKER', now(), 'casual', 'casual', 'ASKER',
      'asker-declaration:rls', 'low', '{}', 1,
      '[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',
      1, '{}', 1, 's00', ledger.allocate_sequence()) RETURNING run_id`, [ownerRef, label])).rows[0]!.run_id;
  await superuserPool.query("SELECT core.append_run_ownership_event($1::uuid,$2::uuid)", [runId, ownerRef]);
  return Object.freeze({
    userId, ownerRef, sessionId, token, tokenHash: hashToken("session", token), revokedToken, expiredToken, runId, csrfToken
  });
}

/** A seeded account as tests/support/httpSession.ts's identity: its live session token, csrf token and session id. */
export function httpIdentityFor(account: RlsTestAccount): TestHttpIdentity {
  return Object.freeze({
    rawSessionToken: account.token,
    rawCsrfToken: account.csrfToken,
    authenticated: Object.freeze({
      session: Object.freeze({
        asker_id: `owner:${account.ownerRef}`,
        session_id: account.sessionId,
        caller_scope: "ASKER" as const,
        ownership_provenance: "server_session" as const,
        provisional_identity_model: false as const
      }),
      userId: account.userId,
      ownerRef: account.ownerRef,
      tokenHash: account.tokenHash,
      csrfTokenHash: hashToken("csrf", account.csrfToken),
      authKind: "cookie" as const
    })
  });
}
