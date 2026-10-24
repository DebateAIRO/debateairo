/**
 * Row-level security S01, cluster C3, step S3.2 (PLAN.md S3.2; SPEC-v4 R7-R11, R14 F9, T8, T9; DECISIONS D27, D28,
 * D55, D58, D67, D68, D72). The verified account context — the request scope of packages/db/src/account-context.ts and
 * the routing, credential and release rule createPool adds — measured AS the product's own logins (T9): the dev
 * runtime and authorization logins (apps/runner/src/dev-database-principals.ts) and their production namesakes
 * (apps/runner/src/production-database-principals.ts), over the six relations audit finding L5-F12 names.
 *
 * "No scope" in S3.2-d is an anonymous request (a request scope with no credential): outside every scope a pool with a
 * cross-account target sends its statements to the target (§0.3 routing rule), which is not the connection under test.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hashToken } from "@debateai/crypto";
import {
  ACCOUNT_CREDENTIAL_SETTING,
  createPool,
  crossAccount,
  crossAccountPool,
  migrate,
  runInRequestScope,
  setCrossAccountTarget,
  setRequestCredential,
  type Pool
} from "../../packages/db/src/index.js";
import {
  apiTestPools,
  createSystemTwin,
  httpIdentityFor,
  loginApiPools,
  provisionRlsLogins,
  seedSessionAccount,
  type RlsLogins,
  type RlsTestAccount
} from "../support/rls-logins.js";
import { persistLiveSession, testHttpIdentity } from "../support/httpSession.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const THIS_FILE = "tests/integration/rls-account-context.test.ts";
/** The six relations of audit finding L5-F12 and the key each account's rows carry. */
const RELATIONS = Object.freeze([
  { relation: "core.run", key: "run_id" },
  { relation: "serve.answer", key: "run_id" },
  { relation: 'identity."user"', key: "user_id" },
  { relation: "identity.session", key: "user_id" },
  { relation: "identity.mfa_factor", key: "user_id" },
  { relation: "identity.recovery_code", key: "user_id" }
] as const);

type Queryable = Readonly<{ query: (text: string, values?: unknown[]) => Promise<pg.QueryResult> }>;
type RelationCount = Readonly<{ a: number; b: number; all: number }>;
type Counts = Readonly<Record<string, RelationCount>>;
type T1Login = Readonly<{ name: string; url: string; systemUrl: string; systemLogin: string }>;

let database: TestDatabase;
let logins: RlsLogins;
let A: RlsTestAccount;
let B: RlsTestAccount;
let t1: readonly T1Login[];
const ownPools: Pool[] = [];

/** Every pool a case built is ended when the case ends, so the cases never run the server out of connection slots. */
async function endOwnPools(): Promise<void> {
  for (const built of ownPools.splice(0)) await built.end().catch(() => undefined);
}

function pool(url: string, options: Readonly<{ max?: number; crossAccount?: Pool }> = {}): Pool {
  const built = createPool(url, options);
  ownPools.push(built);
  return built;
}

function routedPool(login: T1Login, max = 4): Pool {
  return pool(login.url, { max, crossAccount: pool(login.systemUrl, { max: 4 }) });
}

const COUNTS_SQL = `SELECT ${RELATIONS.map(({ relation, key }, index) => {
  const [a, b] = key === "run_id" ? ["$1", "$2"] : ["$3", "$4"];
  return `(SELECT count(*) FROM ${relation} WHERE ${key}=${a}::uuid)::int AS a${index},`
    + `(SELECT count(*) FROM ${relation} WHERE ${key}=${b}::uuid)::int AS b${index},`
    + `(SELECT count(*) FROM ${relation})::int AS all${index}`;
}).join(",")}`;

async function counts(q: Queryable): Promise<Counts> {
  const row = (await q.query(COUNTS_SQL, [A.runId, B.runId, A.userId, B.userId])).rows[0] as Record<string, number>;
  return Object.freeze(Object.fromEntries(RELATIONS.map(({ relation }, index) => [relation, Object.freeze({
    a: row[`a${index}`]!, b: row[`b${index}`]!, all: row[`all${index}`]!
  })])));
}

/** R7: every relation shows A's rows and nothing else (0 of B's, no row of any third account). */
function expectOnlyA(seen: Counts, where: string): void {
  for (const { relation } of RELATIONS) {
    const c = seen[relation]!;
    expect({ where, relation, aAtLeastOne: c.a >= 1, b: c.b, foreign: c.all - c.a })
      .toEqual({ where, relation, aAtLeastOne: true, b: 0, foreign: 0 });
  }
}

/** R8/R9: no private row at all. */
function expectNothing(seen: Counts, where: string): void {
  for (const { relation } of RELATIONS) {
    expect({ where, relation, all: seen[relation]!.all }).toEqual({ where, relation, all: 0 });
  }
}

async function asA<T>(fn: () => Promise<T>, token = A.token): Promise<T> {
  return runInRequestScope(async () => {
    setRequestCredential(token);
    return fn();
  });
}

function anonymous<T>(fn: () => Promise<T>): Promise<T> {
  return runInRequestScope(fn);
}

async function settingOf(q: Queryable): Promise<string | null> {
  return (await q.query("SELECT current_setting($1, true) AS v", [ACCOUNT_CREDENTIAL_SETTING])).rows[0].v as string | null;
}

async function whoAmI(q: Queryable): Promise<string> {
  return (await q.query("SELECT current_user::text AS u")).rows[0].u as string;
}

function nextRelease(target: Pool): Promise<unknown> {
  return new Promise((resolve) => {
    target.once("release", (error: unknown) => resolve(error));
  });
}

async function seedL5Rows(su: Pool, account: RlsTestAccount, label: string): Promise<void> {
  await su.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,created_at,verified_at)
    VALUES($1,'totp','{}','active',clock_timestamp(),clock_timestamp())`, [account.userId]);
  await su.query(`INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_slot,code_hash,created_at)
    VALUES($1,$2,1,$3,now())`, [randomUUID(), account.userId, `$argon2id$v=19$m=19456,t=2,p=1$rls-c3-${label}$fixture`]);
  await su.query(`WITH work AS (
      INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,created_at_seq)
      VALUES ($1,'Q61','[]',$2,'DONE',ledger.allocate_sequence()) RETURNING work_item_id
    ), bundle AS (
      INSERT INTO serve.fact_bundle (run_id,facts,residual_objections,content_hash,version)
      VALUES ($1,'[]','[]',$3,1) RETURNING fact_bundle_id
    )
    INSERT INTO serve.answer (answer_version,run_id,work_item_id,terminal,serve_state,verdict_state,answer_form,
      condition_marks,fact_bundle_id,sealed_at_seq)
    SELECT 1,$1,work.work_item_id,'SERVED','COMPOSED','SUPPORTED','{}','[]',bundle.fact_bundle_id,ledger.allocate_sequence()
    FROM work CROSS JOIN bundle`, [account.runId, `rls-c3:${label}:${account.runId}`, `hash:rls-c3:${label}`]);
}

async function withEnvironment<T>(values: Readonly<Record<string, string | undefined>>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  const production = await logins.production();
  A = await seedSessionAccount(database.pool, "A");
  B = await seedSessionAccount(database.pool, "B");
  await seedL5Rows(database.pool, A, "A");
  await seedL5Rows(database.pool, B, "B");
  t1 = Object.freeze([
    { name: "debateai_dev_runtime", url: logins.url("DATABASE_URL"),
      systemUrl: logins.url("API_SYSTEM_DATABASE_URL"), systemLogin: "debateai_dev_api_system" },
    { name: "debateai_dev_authorization", url: logins.url("AUTHORIZATION_DATABASE_URL"),
      systemUrl: logins.url("API_AUTHORIZATION_SYSTEM_DATABASE_URL"), systemLogin: "debateai_dev_authorization_system" },
    { name: "debateai_prod_api_runtime", url: production.url("api-runtime"),
      systemUrl: production.url("api-system"), systemLogin: "debateai_prod_api_system" },
    { name: "debateai_prod_api_authorization", url: production.url("api-authorization"),
      systemUrl: production.url("api-authorization-system"), systemLogin: "debateai_prod_api_authorization_system" }
  ]);
}, 300_000);

afterEach(endOwnPools);

afterAll(async () => {
  await endOwnPools();
  await logins?.end();
  await database?.stop();
});

describe("row-level security S01 C3: the verified account context on the product's logins", () => {
  it("S3.2-a R7 A's credential returns A's rows and 0 of B's", async () => {
    for (const login of t1) {
      const routed = routedPool(login);
      expect(await whoAmI(pool(login.url, { max: 1 }))).toBe(login.name);
      expectOnlyA(await asA(() => counts(routed)), `${login.name} pool.query`);
      expectOnlyA(await asA(async () => {
        const client = await routed.connect();
        try { return await counts(client); } finally { client.release(); }
      }), `${login.name} connect`);
    }
  });

  it("S3.2-b R8 no scope: 0 private rows, 0 errors", async () => {
    for (const login of t1) {
      expectNothing(await counts(pool(login.url, { max: 2 })), `${login.name} raw login, no scope`);
      expectNothing(await anonymous(() => counts(routedPool(login))), `${login.name} anonymous request`);
    }
  });

  it("S3.2-c R9 each forged kind (32 random bytes base64url, B's session_id, B's stored token_hash, a revoked B token, an expired B token, the empty string, a raw token of another TokenKind issued to B): 0 private rows, 0 errors", async () => {
    const forged: Readonly<Record<string, string>> = {
      random32: randomBytes(32).toString("base64url"),
      bSessionId: B.sessionId,
      bStoredTokenHash: B.tokenHash,
      bRevoked: B.revokedToken,
      bExpired: B.expiredToken,
      empty: "",
      bCsrfToken: B.csrfToken
    };
    for (const login of t1) {
      const raw = pool(login.url, { max: 1 });
      const routed = routedPool(login);
      for (const [kind, value] of Object.entries(forged)) {
        const client = await raw.connect();
        try {
          await client.query("SELECT set_config($1,$2,false)", [ACCOUNT_CREDENTIAL_SETTING, value]);
          expectNothing(await counts(client), `${login.name} database-level ${kind}`);
        } finally {
          const reset = await client.query("SELECT set_config($1,'',false)", [ACCOUNT_CREDENTIAL_SETTING])
            .then(() => undefined, (error: unknown) => (error instanceof Error ? error : new Error(String(error))));
          client.release(reset);
        }
        if (/^[A-Za-z0-9_-]{32,}$/u.test(value)) {
          expectNothing(await asA(() => counts(routed), value), `${login.name} through the request scope ${kind}`);
        }
      }
    }
  });

  it("S3.2-d R10 on a pool of max 1, after each of these A checkouts the next no-scope checkout runs ROLLBACK and then reads 0 private rows and current_setting('debateai.session_credential', true) is not A's token: (1) pool.query, (2) connect/release, (3) connect, BEGIN, release with the block open, (4) pool.query(\"BEGIN\"), (5) connect, BEGIN, a failing statement, release (aborted block); (6) connect, client.query(\"BEGIN\") NOT awaited, release at once; in (3)-(6) the pool's totalCount shows the client was destroyed", async () => {
    const shapes: readonly Readonly<{ id: string; destroyed: boolean; run: (p: Pool) => Promise<void> }>[] = [
      { id: "(1) pool.query", destroyed: false, run: async (p) => { await counts(p); } },
      { id: "(2) connect/release", destroyed: false, run: async (p) => {
        const c = await p.connect(); await counts(c); c.release();
      } },
      { id: "(3) open block", destroyed: true, run: async (p) => {
        const c = await p.connect(); await c.query("BEGIN"); await counts(c); c.release();
      } },
      { id: "(4) pool.query(BEGIN)", destroyed: true, run: async (p) => { await p.query("BEGIN"); } },
      { id: "(5) aborted block", destroyed: true, run: async (p) => {
        const c = await p.connect(); await c.query("BEGIN"); await c.query("SELECT 1/0").catch(() => undefined); c.release();
      } },
      { id: "(6) BEGIN in flight", destroyed: true, run: async (p) => {
        const c = await p.connect(); void c.query("BEGIN").catch(() => undefined); c.release();
      } }
    ];
    for (const login of t1) {
      for (const shape of shapes) {
        const one = routedPool(login, 1);
        const releasing = nextRelease(one);
        await asA(() => shape.run(one));
        const releaseError = await releasing;
        const total = one.totalCount;
        const next = await anonymous(async () => {
          const c = await one.connect();
          try {
            await c.query("ROLLBACK");
            return { seen: await counts(c), setting: await settingOf(c) };
          } finally { c.release(); }
        });
        const where = `${login.name} ${shape.id}`;
        expectNothing(next.seen, where);
        expect({ where, settingIsA: next.setting === A.token }).toEqual({ where, settingIsA: false });
        // pg-pool's own query releases with the query's `err` (null on success): no error is null or undefined.
        const released = releaseError instanceof Error ? releaseError.message : releaseError ?? "none";
        expect({ where, total, released })
          .toEqual(shape.destroyed
            ? { where, total: 0, released: "ACCOUNT_CONTEXT_RELEASE_IN_TRANSACTION" }
            : { where, total: 1, released: "none" });
        await endOwnPools();
      }
    }
  });

  it("S3.2-e R11 50 interleaved A/B calls on max 1 and on max 10: each sees only its own rows", async () => {
    for (const login of t1) {
      for (const max of [1, 10]) {
        const shared = routedPool(login, max);
        const results = await Promise.all(Array.from({ length: 50 }, (_, index) => {
          const who = index % 2 === 0 ? A : B;
          return asA(async () => {
            // A request awaits between authenticating and its statements; the other 49 scopes run meanwhile.
            await new Promise((resolve) => setImmediate(resolve));
            const read = async (q: Queryable) => (await q.query(`SELECT
                (SELECT array_agg(run_id::text) FROM core.run) AS runs,
                (SELECT array_agg(user_id::text) FROM identity."user") AS users`)).rows[0] as { runs: string[] | null; users: string[] | null };
            if (index % 4 < 2) return { who, seen: await read(shared) };
            const client = await shared.connect();
            try { return { who, seen: await read(client) }; } finally { client.release(); }
          }, who.token);
        }));
        const bad = results.filter(({ who, seen }) =>
          JSON.stringify(seen.runs) !== JSON.stringify([who.runId]) || JSON.stringify(seen.users) !== JSON.stringify([who.userId]));
        expect({ login: login.name, max, calls: results.length, bad: bad.length })
          .toEqual({ login: login.name, max, calls: 50, bad: 0 });
        await endOwnPools();
      }
    }
  });

  it("S3.2-f routing: current_user is the T1 login in a scope, the crossAccount target outside a scope and inside crossAccount(), and a client checked out inside crossAccount() stays on the target after the frame returns", async () => {
    for (const login of t1) {
      const routed = routedPool(login);
      expect(await asA(() => whoAmI(routed))).toBe(login.name);
      expect(await anonymous(() => whoAmI(routed))).toBe(login.name);
      expect(await whoAmI(routed)).toBe(login.systemLogin);
      expect(await asA(() => crossAccount("X10", () => whoAmI(routed)))).toBe(login.systemLogin);
      expect(await crossAccount("X10", () => whoAmI(routed))).toBe(login.systemLogin);
      const kept = await asA(async () => {
        const client = await crossAccount("X18b", () => routed.connect());
        try { return await whoAmI(client); } finally { client.release(); }
      });
      expect(kept).toBe(login.systemLogin);
      const own = await asA(async () => {
        const client = await routed.connect();
        try { return await whoAmI(client); } finally { client.release(); }
      });
      expect(own).toBe(login.name);
      expect(crossAccountPool(routed, "X10")).not.toBe(routed);
      expect(await whoAmI(crossAccountPool(routed, "X10"))).toBe(login.systemLogin);
    }
  });

  it("S3.2-g F9 while an A call runs pg_sleep(0.5), a second connection of the same login reads pg_stat_activity (every column) and pg_settings: no A token, no 'sha256:' hash", async () => {
    for (const login of t1) {
      const routed = routedPool(login);
      const observer = pool(login.url, { max: 1 });
      const harvest = async () => JSON.stringify([
        (await observer.query("SELECT * FROM pg_stat_activity")).rows,
        (await observer.query("SELECT * FROM pg_settings")).rows
      ]);
      const sleeping = asA(() => routed.query("SELECT pg_sleep(0.5)"));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const during = await harvest();
      await sleeping;
      const held = await asA(async () => {
        const client = await routed.connect();
        try { return await harvest(); } finally { client.release(); }
      });
      const after = await harvest();
      for (const [moment, seen] of [["during pg_sleep", during], ["checked out idle", held], ["after", after]] as const) {
        expect({ login: login.name, moment, token: seen.includes(A.token), hash: seen.includes("sha256:") })
          .toEqual({ login: login.name, moment, token: false, hash: false });
      }
      expect(during).toContain("pg_sleep");
    }
  });

  it("S3.2-h setRequestCredential outside a scope throws ACCOUNT_SCOPE_MISSING; \"short\" throws ACCOUNT_CREDENTIAL_INVALID", () => {
    expect(() => setRequestCredential(A.token)).toThrow(new TypeError("ACCOUNT_SCOPE_MISSING"));
    expect(() => setRequestCredential(null)).toThrow(new TypeError("ACCOUNT_SCOPE_MISSING"));
    runInRequestScope(() => {
      expect(() => setRequestCredential("short")).toThrow(new TypeError("ACCOUNT_CREDENTIAL_INVALID"));
      expect(() => setRequestCredential(B.tokenHash)).toThrow(new TypeError("ACCOUNT_CREDENTIAL_INVALID"));
      expect(() => setRequestCredential("")).toThrow(new TypeError("ACCOUNT_CREDENTIAL_INVALID"));
      expect(() => setRequestCredential(A.token)).not.toThrow();
      expect(() => setRequestCredential(null)).not.toThrow();
    });
  });

  it("S3.2-i a pool built without crossAccount never sets the credential: current_setting('debateai.session_credential', true) is null or '' inside a scope with one", async () => {
    for (const login of t1) {
      const plain = pool(login.url, { max: 1 });
      const viaQuery = await asA(async () => ({ setting: await settingOf(plain), seen: await counts(plain) }));
      const viaConnect = await asA(async () => {
        const client = await plain.connect();
        try { return { setting: await settingOf(client), seen: await counts(client) }; } finally { client.release(); }
      });
      for (const [path, read] of [["pool.query", viaQuery], ["connect", viaConnect]] as const) {
        expect({ login: login.name, path, empty: read.setting === null || read.setting === "" })
          .toEqual({ login: login.name, path, empty: true });
        expectNothing(read.seen, `${login.name} ${path} without crossAccount`);
      }
      expect(await asA(() => whoAmI(plain))).toBe(login.name);
      expect(await whoAmI(plain)).toBe(login.name);
    }
  });

  it("S3.2-j a testHttpIdentity persisted with persistLiveSession is a live context: inside runInRequestScope with its raw token set, a T1 read returns its identity.\"user\" row", async () => {
    const identity = testHttpIdentity(`rls-c3-${randomUUID()}`);
    await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,
        audit_token,owner_ref,state,adult_affirmed_at,created_at)
      VALUES($1,$2,'{}'::jsonb,'test-password-hash',$3,$4,$5,'active',now(),now())`,
      [identity.authenticated.userId, randomBytes(32), `rls-c3-j-${randomUUID()}`, randomUUID(), identity.authenticated.ownerRef]);
    const routed = routedPool(t1[0]!);
    const before = await asA(async () => (await routed.query('SELECT user_id::text AS id FROM identity."user"')).rows,
      identity.rawSessionToken);
    expect(before).toEqual([]);
    await persistLiveSession(database.pool, identity);
    const stored = (await database.pool.query(
      "SELECT user_id::text AS user_id, token_hash, csrf_token_hash, idle_expires_at > now() + interval '50 minutes' AS idle_ok, absolute_expires_at > now() + interval '110 minutes' AS absolute_ok FROM identity.session WHERE session_id=$1",
      [identity.authenticated.session.session_id])).rows;
    expect(stored).toEqual([{
      user_id: identity.authenticated.userId,
      token_hash: hashToken("session", identity.rawSessionToken),
      csrf_token_hash: hashToken("csrf", identity.rawCsrfToken),
      idle_ok: true,
      absolute_ok: true
    }]);
    for (const login of t1) {
      const rows = await asA(async () => (await routedPool(login).query('SELECT user_id::text AS id FROM identity."user"')).rows,
        identity.rawSessionToken);
      expect({ login: login.name, rows }).toEqual({ login: login.name, rows: [{ id: identity.authenticated.userId }] });
    }
    const mapped = httpIdentityFor(A);
    expect({
      raw: mapped.rawSessionToken, csrf: mapped.rawCsrfToken, session: mapped.authenticated.session.session_id,
      user: mapped.authenticated.userId, owner: mapped.authenticated.ownerRef, tokenHash: mapped.authenticated.tokenHash,
      csrfHash: mapped.authenticated.csrfTokenHash, asker: mapped.authenticated.session.asker_id
    }).toEqual({
      raw: A.token, csrf: A.csrfToken, session: A.sessionId, user: A.userId, owner: A.ownerRef,
      tokenHash: hashToken("session", A.token), csrfHash: hashToken("csrf", A.csrfToken), asker: `owner:${A.ownerRef}`
    });
    expectOnlyA(await asA(() => counts(routed), mapped.rawSessionToken), "httpIdentityFor(A) token");
  });

  it("S3.2-m setCrossAccountTarget(pool, target) routes exactly as the crossAccount option does (S3.2-f's three checks), a second call throws CROSS_ACCOUNT_TARGET_ALREADY_SET, a pool createPool did not build throws CROSS_ACCOUNT_POOL_UNKNOWN, and a crossAccount() frame on a pool with no target runs on its own connections", async () => {
    const login = t1[0]!;
    const late = pool(login.url, { max: 2 });
    const target = pool(login.systemUrl, { max: 2 });
    expect(crossAccountPool(late, "X10")).toBe(late);
    expect(await crossAccount("X10", () => whoAmI(late))).toBe(login.name);
    expect(await whoAmI(late)).toBe(login.name);
    expect(await asA(() => crossAccount("X22", () => whoAmI(late)))).toBe(login.name);
    setCrossAccountTarget(late, target);
    expect(crossAccountPool(late, "X10")).toBe(target);
    expect(await asA(() => whoAmI(late))).toBe(login.name);
    expect(await whoAmI(late)).toBe(login.systemLogin);
    expect(await asA(() => crossAccount("X10", () => whoAmI(late)))).toBe(login.systemLogin);
    const kept = await asA(async () => {
      const client = await crossAccount("X10", () => late.connect());
      try { return await whoAmI(client); } finally { client.release(); }
    });
    expect(kept).toBe(login.systemLogin);
    expectOnlyA(await asA(() => counts(late)), "setCrossAccountTarget pool, A's scope");
    expect(() => setCrossAccountTarget(late, target)).toThrow(new TypeError("CROSS_ACCOUNT_TARGET_ALREADY_SET"));
    const routed = routedPool(login);
    expect(() => setCrossAccountTarget(routed, target)).toThrow(new TypeError("CROSS_ACCOUNT_TARGET_ALREADY_SET"));
    const foreign = new pg.Pool({ connectionString: login.url, max: 1 });
    try {
      expect(() => setCrossAccountTarget(foreign, target)).toThrow(new TypeError("CROSS_ACCOUNT_POOL_UNKNOWN"));
    } finally { await foreign.end(); }
  });

  it("S3.2-k in login mode, after apiTestPools(), the harness pool and a second pool built from the harness URL throw R21_SUPERUSER_POOL_IN_REQUEST inside runInRequestScope and run normally outside it; a login pool runs inside it", async () => {
    const reportDirectory = await mkdtemp(join(tmpdir(), "rls-c3-report-"));
    try {
      const pools = await withEnvironment({
        DEBATEAI_TEST_API_LOGINS: "1", DEBATEAI_TEST_API_LOGINS_REPORT: join(reportDirectory, "report.tsv")
      }, () => apiTestPools(database, import.meta.url));
      const second = pool(database.connectionString, { max: 1 });
      expect(await whoAmI(second)).toBe("debateai");
      for (const [name, superuser] of [["harness pool", database.pool], ["second harness-URL pool", second]] as const) {
        await expect(anonymous(() => superuser.query("SELECT 1")), name).rejects.toThrow("R21_SUPERUSER_POOL_IN_REQUEST");
        await expect(asA(async () => {
          const client = await superuser.connect();
          try { return await client.query("SELECT 1"); } finally { client.release(); }
        }), name).rejects.toThrow("R21_SUPERUSER_POOL_IN_REQUEST");
        expect((await superuser.query("SELECT 1 AS one")).rows, name).toEqual([{ one: 1 }]);
      }
      expect(await asA(() => whoAmI(pools.runtime))).toBe("debateai_dev_runtime");
      expectOnlyA(await asA(() => counts(pools.runtime)), "login-mode runtime pool");
    } finally {
      await rm(reportDirectory, { recursive: true, force: true });
    }
  });

  it("S3.2-l apiTestPools() in login mode appends one report line per pool it returns, each naming a dev login, none naming debateai", async () => {
    const reportDirectory = await mkdtemp(join(tmpdir(), "rls-c3-report-"));
    const report = join(reportDirectory, "report.tsv");
    try {
      const pools = await withEnvironment({ DEBATEAI_TEST_API_LOGINS: "1", DEBATEAI_TEST_API_LOGINS_REPORT: report },
        () => apiTestPools(database, import.meta.url));
      const lines = (await readFile(report, "utf8")).split("\n").filter((line) => line !== "").sort();
      const expected: Readonly<Record<string, string>> = {
        runtime: "debateai_dev_runtime", authorization: "debateai_dev_authorization",
        legacyAskAdmission: "debateai_dev_runtime", releaseWatch: "debateai_dev_runtime",
        roomDecision: "debateai_dev_api_system", system: "debateai_dev_api_system",
        authorizationSystem: "debateai_dev_authorization_system", erasure: "debateai_dev_erasure",
        contentProvision: "debateai_dev_content_provision", serverAskAdmission: "debateai_dev_content_provision",
        publicationCleanup: "debateai_dev_publication_cleanup", support: "debateai_dev_support",
        supportRelayLease: "debateai_dev_support", dataExport: "debateai_dev_data_export",
        evaluatorDevMenu: "debateai_dev_evaluator_api"
      };
      expect(lines).toEqual(Object.entries(expected).map(([field, role]) => `${THIS_FILE}\t${field}\t${role}`).sort());
      expect(lines.filter((line) => line.endsWith("\tdebateai"))).toEqual([]);
      const own = await asA(async () => Object.fromEntries(await Promise.all(Object.keys(expected).map(async (field) =>
        [field, await whoAmI(pools[field as keyof typeof pools])] as const))));
      expect(own).toEqual(expected);
      const outside = Object.fromEntries(await Promise.all(
        (["runtime", "legacyAskAdmission", "authorization", "releaseWatch"] as const).map(async (field) =>
          [field, await whoAmI(pools[field])] as const)));
      expect(outside).toEqual({
        runtime: "debateai_dev_api_system", legacyAskAdmission: "debateai_dev_api_system",
        authorization: "debateai_dev_authorization_system", releaseWatch: "debateai_dev_runtime"
      });
      const always = await loginApiPools(database);
      expect(await whoAmI(always.runtime)).toBe("debateai_dev_api_system");
      expect(await asA(() => whoAmI(always.runtime))).toBe("debateai_dev_runtime");
    } finally {
      await rm(reportDirectory, { recursive: true, force: true });
    }
  });

  it("S3.2-n provisionRlsLogins(db) called twice returns the same object and runs the dev provisioner once; apiTestPools(db, file, { runtime: <a createSystemTwin-free fixture login URL> }) returns, in both modes, a runtime pool whose session_user is that login inside a scope and whose statements outside a scope run as debateai_dev_api_system, and reports it", async () => {
    const passwordOf = async () => (await database.pool.query(
      "SELECT rolpassword FROM pg_authid WHERE rolname='debateai_dev_runtime'")).rows[0].rolpassword as string;
    const before = await passwordOf();
    const again = await provisionRlsLogins(database);
    expect(again).toBe(logins);
    expect(await passwordOf()).toBe(before);
    expect(await whoAmI(pool(again.url("DATABASE_URL"), { max: 1 }))).toBe("debateai_dev_runtime");
    expect([...again.credentials().keys()]).toContain("API_SYSTEM_DATABASE_URL");

    const fixtureName = `rls_c3_fixture_${randomBytes(4).toString("hex")}`;
    const fixturePassword = randomBytes(32).toString("base64url");
    await database.pool.query(`CREATE ROLE ${fixtureName} LOGIN PASSWORD '${fixturePassword}' IN ROLE debateai_billing_runtime`);
    const fixtureUrl = new URL(database.connectionString);
    fixtureUrl.username = fixtureName;
    fixtureUrl.password = fixturePassword;
    const sessionUser = async (q: Queryable) => (await q.query("SELECT session_user::text AS u")).rows[0].u as string;
    const reportDirectory = await mkdtemp(join(tmpdir(), "rls-c3-report-"));
    const report = join(reportDirectory, "report.tsv");
    try {
      for (const mode of ["superuser", "login"] as const) {
        const pools = await withEnvironment({
          DEBATEAI_TEST_API_LOGINS: mode === "login" ? "1" : undefined, DEBATEAI_TEST_API_LOGINS_REPORT: report
        }, () => apiTestPools(database, import.meta.url, { runtime: fixtureUrl.toString() }));
        expect({ mode, inside: await asA(() => sessionUser(pools.runtime)) }).toEqual({ mode, inside: fixtureName });
        expect({ mode, outside: await sessionUser(pools.runtime) }).toEqual({ mode, outside: "debateai_dev_api_system" });
        expect({ mode, authorizationIsHarness: pools.authorization === database.pool })
          .toEqual({ mode, authorizationIsHarness: mode === "superuser" });
      }
      const lines = (await readFile(report, "utf8")).split("\n").filter((line) => line !== "");
      expect(lines.filter((line) => line.startsWith(`${THIS_FILE}\truntime\t`))).toEqual([`${THIS_FILE}\truntime\t${fixtureName}`]);
      expect(lines).toHaveLength(15);

      const twinName = `rls_c3_twin_${randomBytes(4).toString("hex")}`;
      const twinUrl = await createSystemTwin(database, twinName, ["debateai_billing_runtime"]);
      const twin = pool(twinUrl, { max: 1 });
      expect(await sessionUser(twin)).toBe(twinName);
      const reach = (await twin.query(`SELECT pg_has_role(session_user,'debateai_rls_all_accounts','MEMBER') AS marker,
          pg_has_role(session_user,'debateai_billing_runtime','MEMBER') AS billing,
          (SELECT count(*) FROM core.run WHERE run_id=ANY($1::uuid[]))::int AS runs`, [[A.runId, B.runId]])).rows[0];
      expect(reach).toEqual({ marker: true, billing: true, runs: 2 });
      const twinned = await apiTestPools(database, import.meta.url, { runtime: fixtureUrl.toString(), system: twinUrl });
      expect(await sessionUser(twinned.runtime)).toBe(twinName);
      expect(await asA(() => sessionUser(twinned.runtime))).toBe(fixtureName);
    } finally {
      await rm(reportDirectory, { recursive: true, force: true });
    }
  });
});
