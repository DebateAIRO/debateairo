/**
 * Row-level security S01, FIX-S01-p1b (REV-S01-p1 COR-B1, t_25f52da5; PLAN §0.3; DECISIONS D29, D68; V-12). The boot
 * attestations of apps/api/src/main.ts, run on pools wired exactly as main.ts wires them: the T1 pools built with
 * createPool and then given their system targets by setCrossAccountTarget (main.ts, the three calls after the pool
 * block). Outside a request scope a T1 pool sends every statement to its target, so a role check called there reads the
 * catalog of the SYSTEM login, never the login of DATABASE_URL / AUTHORIZATION_DATABASE_URL (REV-S01-p1-correctness
 * P-B1..B5: a superuser, a dual-role, the erasure and the content-provision login as DATABASE_URL all booted).
 *
 * The remedy measured here: main.ts runs each such check through `attestEveryRoute` (once on the pool's own connections —
 * the T1 login a request runs as — and once on its target, where boot, background and crossAccount statements run), and
 * a new stage, `assertAccountContextLogins`, refuses a T1 login that reaches every account (superuser, BYPASSRLS, a role
 * the rls_all_accounts policy names, the owner of a row-secured relation) and a system login that does not reach them
 * through the marker role. Which main.ts statements are wrapped is pinned by tests/architecture/rls-cross-account-sites.
 */
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNT_CREDENTIAL_SETTING,
  assertAccountErasureDatabaseRole,
  assertContentProvisionDatabaseRole,
  assertPublicationDatabaseRoleSeparation,
  assertSupportDatabaseRole,
  createPool,
  crossAccount,
  migrate,
  runInRequestScope,
  setCrossAccountTarget,
  setRequestCredential,
  type Pool
} from "../../packages/db/src/index.js";
import { assertDataExportDatabaseRoles } from "../../packages/db/src/data-export.js";
import { assertAccountContextLogins, attestEveryRoute, onOwnConnections } from "../../packages/db/src/account-context.js";
import { createSystemTwin, provisionRlsLogins, seedSessionAccount, type RlsLogins, type RlsTestAccount } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let logins: RlsLogins;
let A: RlsTestAccount;
const built: Pool[] = [];

function pool(url: string): Pool {
  const made = createPool(url, { max: 2 });
  built.push(made);
  return made;
}

/** The same login under another spelling (the string compare of runtime-environment.ts:731-738 passes it). */
function alias(url: string): string {
  const spelled = new URL(url);
  spelled.searchParams.set("application_name", "rls-boot-attestation-alias");
  return spelled.toString();
}

type Urls = Readonly<{ runtime: string; authorization: string; system: string; authorizationSystem: string }>;

/** main.ts's pool block and its three setCrossAccountTarget calls, for the URLs given. */
function wired(urls: Urls) {
  const systemPool = pool(urls.system);
  const authorizationSystemPool = pool(urls.authorizationSystem);
  const runtime = pool(urls.runtime);
  const authorizationPool = pool(urls.authorization);
  const legacyAskAdmissionPool = pool(urls.runtime);
  const releaseWatchPool = pool(urls.runtime);
  const roomDecisionPool = pool(urls.system);
  const contentProvisionPool = pool(logins.url("CONTENT_PROVISION_DATABASE_URL"));
  const serverAskAdmissionPool = pool(logins.url("CONTENT_PROVISION_DATABASE_URL"));
  const erasurePool = pool(logins.url("ERASURE_DATABASE_URL"));
  const dataExportPool = pool(logins.url("DATA_EXPORT_DATABASE_URL"));
  const supportPool = pool(logins.url("SUPPORT_DATABASE_URL"));
  setCrossAccountTarget(runtime, systemPool);
  setCrossAccountTarget(legacyAskAdmissionPool, systemPool);
  setCrossAccountTarget(authorizationPool, authorizationSystemPool);
  return {
    pool: runtime, authorizationPool, legacyAskAdmissionPool, releaseWatchPool, systemPool, authorizationSystemPool,
    roomDecisionPool, contentProvisionPool, serverAskAdmissionPool, erasurePool, dataExportPool, supportPool
  };
}

function correctUrls(): Urls {
  return {
    runtime: logins.url("DATABASE_URL"), authorization: logins.url("AUTHORIZATION_DATABASE_URL"),
    system: logins.url("API_SYSTEM_DATABASE_URL"), authorizationSystem: logins.url("API_AUTHORIZATION_SYSTEM_DATABASE_URL")
  };
}

async function outcome(check: () => Promise<unknown>): Promise<string> {
  try { await check(); return "PASSED"; } catch (error) { return `REFUSED ${(error as Error).message}`; }
}

/** One member of main.ts's boot attestations, run as main.ts now runs it. */
function member(check: () => Promise<unknown>): Promise<string> {
  return outcome(() => attestEveryRoute(check));
}

type Wired = ReturnType<typeof wired>;

/** main.ts's boot.run("database-roles") members (publication cleanup is off here, as in local mode). */
async function databaseRoles(w: Wired): Promise<Record<string, string>> {
  return {
    erasure: await member(() => assertAccountErasureDatabaseRole(w.pool, w.erasurePool)),
    legacyErasure: await member(() => assertAccountErasureDatabaseRole(w.legacyAskAdmissionPool, w.erasurePool)),
    publication: await member(() => assertPublicationDatabaseRoleSeparation(w.pool, w.authorizationPool)),
    contentProvision: await member(() => assertContentProvisionDatabaseRole(w.pool, w.contentProvisionPool)),
    serverAskAdmission: await member(() => assertContentProvisionDatabaseRole(w.pool, w.serverAskAdmissionPool)),
    dataExport: await member(() => assertDataExportDatabaseRoles(w.authorizationPool, w.dataExportPool))
  };
}

/** main.ts's boot.run("account-context-logins"). */
function contextLogins(w: Wired): Promise<string> {
  return outcome(() => assertAccountContextLogins({
    requestPools: [w.pool, w.legacyAskAdmissionPool, w.authorizationPool, w.releaseWatchPool],
    systemPools: [w.systemPool, w.authorizationSystemPool, w.roomDecisionPool]
  }));
}

const ALL_PASSED = Object.freeze({
  erasure: "PASSED", legacyErasure: "PASSED", publication: "PASSED", contentProvision: "PASSED",
  serverAskAdmission: "PASSED", dataExport: "PASSED"
});

/** A fresh LOGIN role in debateai_billing_runtime (a T1-shaped login), and its URL. */
async function fixtureLogin(prefix: string): Promise<Readonly<{ name: string; url: string }>> {
  const name = `${prefix}_${randomBytes(4).toString("hex")}`;
  const password = randomBytes(32).toString("base64url");
  await database.pool.query(`CREATE ROLE ${name} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}' IN ROLE debateai_billing_runtime`);
  const url = new URL(database.connectionString);
  url.username = name;
  url.password = password;
  return { name, url: url.toString() };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  A = await seedSessionAccount(database.pool, "A");
}, 300_000);

afterEach(async () => {
  for (const made of built.splice(0)) await made.end().catch(() => undefined);
});

afterAll(async () => {
  await logins?.end();
  await database?.stop();
});

describe("row-level security S01 FIX p1b: main.ts's boot attestations attest the logins a statement can run as (COR-B1)", () => {
  it("B1-a attestEveryRoute runs the check on the T1 pool's own login with no account, then on its system target; twice on a pool with no target; the same from inside A's scope and a crossAccount frame; onOwnConnections runs on the own login only", async () => {
    const w = wired(correctUrls());
    const seen: string[] = [];
    // The credential setting, never A's token: an attestation answers for the login, not for an account.
    const who = (p: Pool) => async () => {
      const row = (await p.query("SELECT session_user::text AS login, coalesce(nullif(current_setting($1, true), ''), 'none') AS ctx",
        [ACCOUNT_CREDENTIAL_SETTING])).rows[0] as { login: string; ctx: string };
      seen.push(`${row.login}/${row.ctx === A.token ? "A" : row.ctx}`);
    };
    await attestEveryRoute(who(w.pool));
    await attestEveryRoute(who(w.erasurePool));
    await runInRequestScope(async () => {
      setRequestCredential(A.token);
      await crossAccount("X10", () => attestEveryRoute(who(w.authorizationPool)));
      await attestEveryRoute(who(w.pool));
    });
    await onOwnConnections(who(w.pool));
    expect(seen).toEqual([
      "debateai_dev_runtime/none", "debateai_dev_api_system/none",
      "debateai_dev_erasure/none", "debateai_dev_erasure/none",
      "debateai_dev_authorization/none", "debateai_dev_authorization_system/none",
      "debateai_dev_runtime/none", "debateai_dev_api_system/none",
      "debateai_dev_runtime/none"
    ]);
  });

  it("B1-b P-B0 re-derived: the correct configuration passes every database-roles member on both routes, both support members and the login attestation", async () => {
    const w = wired(correctUrls());
    expect(await databaseRoles(w)).toEqual(ALL_PASSED);
    expect({
      support: await member(() => assertSupportDatabaseRole(w.pool, w.supportPool)),
      logins: await contextLogins(w)
    }).toEqual({ support: "PASSED", logins: "PASSED" });
  });

  it("B1-c P-B1 re-derived: DATABASE_URL = the superuser refuses as base did (PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE), and the login attestation refuses it too", async () => {
    const w = wired({ ...correctUrls(), runtime: database.connectionString });
    expect({
      publication: (await databaseRoles(w)).publication,
      logins: await contextLogins(w)
    }).toEqual({
      publication: "REFUSED PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE",
      logins: "REFUSED RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS"
    });
  });

  it("B1-d P-B2 re-derived: DATABASE_URL = AUTHORIZATION_DATABASE_URL (one dual-role login) refuses PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE", async () => {
    const url = logins.url("AUTHORIZATION_DATABASE_URL");
    const w = wired({ ...correctUrls(), runtime: url, authorization: url });
    expect((await databaseRoles(w)).publication).toBe("REFUSED PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE");
  });

  it("B1-e P-B3 re-derived: DATABASE_URL = ERASURE_DATABASE_URL refuses ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED", async () => {
    const w = wired({ ...correctUrls(), runtime: logins.url("ERASURE_DATABASE_URL") });
    expect((await databaseRoles(w)).erasure).toBe("REFUSED ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED");
  });

  it("B1-f P-B4 re-derived: DATABASE_URL = CONTENT_PROVISION_DATABASE_URL refuses CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED", async () => {
    const w = wired({ ...correctUrls(), runtime: logins.url("CONTENT_PROVISION_DATABASE_URL") });
    expect((await databaseRoles(w)).contentProvision).toBe("REFUSED CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED");
  });

  it("B1-g P-B5 re-derived: with DATABASE_URL = the superuser, main.ts's two stages in order stop the boot at database-roles, so no request is ever served on that login", async () => {
    const w = wired({ ...correctUrls(), runtime: database.connectionString });
    const stages: string[] = [];
    let stage = "database-roles";
    try {
      await attestEveryRoute(() => Promise.all([
        assertAccountErasureDatabaseRole(w.pool, w.erasurePool),
        assertAccountErasureDatabaseRole(w.legacyAskAdmissionPool, w.erasurePool),
        assertPublicationDatabaseRoleSeparation(w.pool, w.authorizationPool),
        assertContentProvisionDatabaseRole(w.pool, w.contentProvisionPool),
        assertContentProvisionDatabaseRole(w.pool, w.serverAskAdmissionPool),
        assertDataExportDatabaseRoles(w.authorizationPool, w.dataExportPool)
      ]));
      stages.push("database-roles passed");
      stage = "account-context-logins";
      await assertAccountContextLogins({
        requestPools: [w.pool, w.legacyAskAdmissionPool, w.authorizationPool, w.releaseWatchPool],
        systemPools: [w.systemPool, w.authorizationSystemPool, w.roomDecisionPool]
      });
      stages.push("account-context-logins passed");
    } catch (error) {
      // Promise.all settles on its first rejection; with a superuser login every member refuses, so any of their codes.
      const code = (error as Error).message;
      stages.push(`${stage} refused ${["ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED", "PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE",
        "CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED", "DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED"].includes(code) ? "by a role check" : code}`);
    }
    expect(stages).toEqual(["database-roles refused by a role check"]);
  });

  it("B1-h the system login's alias as DATABASE_URL (another string, the same login) passes every role check yet the login attestation refuses it: RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS", async () => {
    const system = logins.url("API_SYSTEM_DATABASE_URL");
    expect(alias(system)).not.toBe(system);
    const w = wired({ ...correctUrls(), runtime: alias(system) });
    expect({ roles: await databaseRoles(w), logins: await contextLogins(w) })
      .toEqual({ roles: ALL_PASSED, logins: "REFUSED RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS" });
    const authorizationSystem = logins.url("API_AUTHORIZATION_SYSTEM_DATABASE_URL");
    const v = wired({ ...correctUrls(), authorization: alias(authorizationSystem) });
    expect(await contextLogins(v)).toBe("REFUSED RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS");
  });

  it("B1-i a T1 login's alias as API_SYSTEM_DATABASE_URL (no marker role) refuses RLS_SYSTEM_LOGIN_INVALID", async () => {
    const w = wired({ ...correctUrls(), system: alias(logins.url("DATABASE_URL")) });
    expect(await contextLogins(w)).toBe("REFUSED RLS_SYSTEM_LOGIN_INVALID");
    const v = wired({ ...correctUrls(), authorizationSystem: alias(logins.url("AUTHORIZATION_DATABASE_URL")) });
    expect(await contextLogins(v)).toBe("REFUSED RLS_SYSTEM_LOGIN_INVALID");
  });

  it("B1-j each reach the login attestation refuses, one at a time on a fixture login (a T1-shaped login passes; superuser, BYPASSRLS, the marker role, a TO-listed owner role, a row-secured relation's owner, a session whose role differs refuse); a system twin passes, the same twin as superuser or with BYPASSRLS refuses", async () => {
    const asRequestLogin = async (url: string) => {
      const request = pool(url);
      return outcome(() => assertAccountContextLogins({ requestPools: [request], systemPools: [] }));
    };
    const asSystemLogin = async (url: string) => {
      const system = pool(url);
      return outcome(() => assertAccountContextLogins({ requestPools: [], systemPools: [system] }));
    };
    const results: Record<string, string> = {};
    const plain = await fixtureLogin("rls_boot_plain");
    results.plain = await asRequestLogin(plain.url);
    const reaches: Readonly<Record<string, (name: string) => string[]>> = {
      superuser: (name) => [`ALTER ROLE ${name} SUPERUSER`],
      bypassrls: (name) => [`ALTER ROLE ${name} BYPASSRLS`],
      marker: (name) => [`GRANT debateai_rls_all_accounts TO ${name}`],
      policyRole: (name) => [`GRANT debateai_release_owner TO ${name}`],
      owner: (name) => [`CREATE TABLE public.${name}_t (id int)`, `ALTER TABLE public.${name}_t ENABLE ROW LEVEL SECURITY`,
        `ALTER TABLE public.${name}_t OWNER TO ${name}`],
      switchedRole: (name) => [`ALTER ROLE ${name} SET role = 'debateai_billing_runtime'`],
      // Review of fce5c2d4c..b8bf8b0a4, F1: a role the login may SET ROLE to reaches what that role reaches.
      bypassMember: (name) => [`CREATE ROLE ${name}_r NOLOGIN BYPASSRLS`, `GRANT ${name}_r TO ${name}`],
      superuserMember: (name) => [`CREATE ROLE ${name}_r NOLOGIN SUPERUSER`, `GRANT ${name}_r TO ${name}`]
    };
    for (const [reach, statements] of Object.entries(reaches)) {
      const login = await fixtureLogin(`rls_boot_${reach.toLowerCase()}`);
      for (const statement of statements(login.name)) await database.pool.query(statement);
      results[reach] = await asRequestLogin(login.url);
    }
    const twinName = `rls_boot_twin_${randomBytes(4).toString("hex")}`;
    const twin = await createSystemTwin(database, twinName, ["debateai_billing_runtime"]);
    results.systemTwin = await asSystemLogin(twin);
    results.systemPlain = await asSystemLogin(plain.url);
    await database.pool.query(`ALTER ROLE ${twinName} BYPASSRLS`);
    results.systemTwinBypass = await asSystemLogin(twin);
    await database.pool.query(`ALTER ROLE ${twinName} NOBYPASSRLS SUPERUSER`);
    results.systemTwinSuperuser = await asSystemLogin(twin);
    await database.pool.query(`ALTER ROLE ${twinName} NOSUPERUSER`);
    await database.pool.query(`CREATE ROLE ${twinName}_r NOLOGIN BYPASSRLS`);
    await database.pool.query(`GRANT ${twinName}_r TO ${twinName}`);
    results.systemTwinBypassMember = await asSystemLogin(twin);
    expect(results).toEqual({
      plain: "PASSED",
      superuser: "REFUSED RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS",
      bypassrls: "REFUSED RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS",
      marker: "REFUSED RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS",
      policyRole: "REFUSED RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS",
      owner: "REFUSED RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS",
      switchedRole: "REFUSED RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS",
      bypassMember: "REFUSED RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS",
      superuserMember: "REFUSED RLS_REQUEST_LOGIN_REACHES_ALL_ACCOUNTS",
      systemTwin: "PASSED",
      systemPlain: "REFUSED RLS_SYSTEM_LOGIN_INVALID",
      systemTwinBypass: "REFUSED RLS_SYSTEM_LOGIN_INVALID",
      systemTwinSuperuser: "REFUSED RLS_SYSTEM_LOGIN_INVALID",
      systemTwinBypassMember: "REFUSED RLS_SYSTEM_LOGIN_INVALID"
    });
  });
});
