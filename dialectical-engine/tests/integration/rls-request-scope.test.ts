/**
 * Row-level security S01, cluster C4, step S4.1 (PLAN.md S4.1, S4.2; SPEC-v4 R7, R8, R23, T8; DECISIONS D28, D29,
 * F-C2-1). The request scope apps/api/src/index.ts opens for every request, measured through `buildApi` on the product's
 * own dev logins — `loginApiPools(database)`: the runtime pool is `debateai_dev_runtime` with `debateai_dev_api_system`
 * as its cross-account target, as main.ts wires it — never the harness superuser, with two accounts seeded with live
 * identity.session rows (`seedSessionAccount`) and authenticated by `testSessionApplication`.
 *
 * The routes are the Terms re-acceptance pair, GET /v1/account/legal-status and POST /v1/account/legal-accept, over the
 * real RepositoryLegalAcceptanceApplication and AcceptanceRepository on the runtime pool (main.ts builds them so). Its
 * `acceptances` seam also runs, on that same pool and inside the same handler, one unkeyed probe: the login that
 * answered (`session_user`), the account the database itself derived from the credential (`rls.context_user_id()`),
 * and how many of A's and of B's runs it sees — the observables of R7/R8 a keyed product read cannot show.
 */
import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AcceptanceRepository, migrate, type Pool } from "@debateai/db";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { RepositoryLegalAcceptanceApplication } from "../../apps/api/src/legal.js";
import type { MfaApplication } from "../../apps/api/src/mfa.js";
import { TEST_APP_ORIGIN, testSessionApplication, testSessionHeaders, type TestHttpIdentity } from "../support/httpSession.js";
import {
  httpIdentityFor,
  loginApiPools,
  provisionRlsLogins,
  seedSessionAccount,
  type ApiTestPools,
  type RlsTestAccount
} from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const RUNTIME_LOGIN = "debateai_dev_runtime";
const SYSTEM_LOGIN = "debateai_dev_api_system";

type Probe = Readonly<{ login: string; contextUser: string | null; runsOfA: number; runsOfB: number }>;
type Observation = Readonly<{ ownerRef: string; probe: Probe }>;
type Outcome = Readonly<{ value?: Probe; error?: string; afterResponse?: boolean }>;
/** One statement a pg client sent, and whose credential it set when it was the credential checkout. */
type Statement = Readonly<{ user: string; credential: "A" | "B" | "cleared" | "other" | null }>;

let database: TestDatabase;
let pools: ApiTestPools;
let A: RlsTestAccount;
let B: RlsTestAccount;
let identityA: TestHttpIdentity;
let identityB: TestHttpIdentity;
let api: ReturnType<typeof buildApi>;
let bootTimer: Outcome;
const observations: Observation[] = [];
let jitter = false;
let floatNext = false;
let floating: Promise<Outcome> | undefined;
let responded = false;
let signInProbe: Probe | undefined;

async function probe(pool: Pool): Promise<Probe> {
  const { rows } = await pool.query<{ login: string; context_user: string | null; runs_a: number; runs_b: number }>(
    `SELECT session_user::text AS login, rls.context_user_id()::text AS context_user,
       (SELECT count(*)::int FROM core.run WHERE run_id = $1::uuid) AS runs_a,
       (SELECT count(*)::int FROM core.run WHERE run_id = $2::uuid) AS runs_b`,
    [A.runId, B.runId]
  );
  const row = rows[0]!;
  return Object.freeze({ login: row.login, contextUser: row.context_user, runsOfA: row.runs_a, runsOfB: row.runs_b });
}

/** What a request of `account` must see on the runtime pool: its own login, its own account, its own run only. */
function own(account: RlsTestAccount): Probe {
  return Object.freeze({
    login: RUNTIME_LOGIN,
    contextUser: account.userId,
    runsOfA: account === A ? 1 : 0,
    runsOfB: account === B ? 1 : 0
  });
}

/** Records every statement any pg client sends while `run` is in flight (the test process makes no other). */
async function statementsOf<T>(run: () => Promise<T>): Promise<{ result: T; statements: Statement[] }> {
  const prototype = pg.Client.prototype as unknown as { query: (...args: unknown[]) => unknown };
  const original = prototype.query;
  const statements: Statement[] = [];
  prototype.query = function recorded(this: pg.Client, ...args: unknown[]): unknown {
    const first = args[0];
    const text = typeof first === "string" ? first : (first as { text?: unknown } | undefined)?.text;
    const values = Array.isArray(args[1]) ? args[1] as unknown[] : (first as { values?: unknown[] } | undefined)?.values;
    const credential = typeof text === "string" && /set_config\(\$1,\s*(\$2|'')/u.test(text)
      ? (/''/u.test(text) || values?.[1] === "" ? "cleared"
        : values?.[1] === A.token ? "A" : values?.[1] === B.token ? "B" : "other")
      : null;
    statements.push(Object.freeze({ user: this.user ?? "", credential }));
    return original.apply(this, args);
  };
  try {
    return { result: await run(), statements };
  } finally {
    prototype.query = original;
  }
}

function postInTwoChunks(url: string, headers: Readonly<Record<string, string>>, body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(url, { method: "POST", headers: { ...headers, "content-type": "application/json" } }, (incoming) => {
      let text = "";
      incoming.setEncoding("utf8");
      incoming.on("data", (chunk: string) => { text += chunk; });
      incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, text }));
    });
    outgoing.on("error", reject);
    const cut = Math.floor(body.length / 2);
    outgoing.write(body.slice(0, cut));
    setTimeout(() => { outgoing.end(body.slice(cut)); }, 30);
  });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  pools = await loginApiPools(database);
  A = await seedSessionAccount(database.pool, "A");
  B = await seedSessionAccount(database.pool, "B");
  identityA = httpIdentityFor(A);
  identityB = httpIdentityFor(B);
  const acceptances = new AcceptanceRepository(pools.runtime);
  api = buildApi({
    application: {} as AskApplication,
    sessions: testSessionApplication([identityA, identityB]),
    allowedOrigin: TEST_APP_ORIGIN,
    // S4.1-f: POST /v1/auth/mfa/totp/begin is a public route whose session is optional (the other preHandler branch).
    mfa: {
      beginTotp: async (_input, _source, session) => {
        observations.push(Object.freeze({ ownerRef: session?.ownerRef ?? "none", probe: await probe(pools.runtime) }));
        return Object.freeze({
          status: "verification_required" as const, secret: "A".repeat(32), otpauthUri: "otpauth://totp/rls-request-scope",
          enrollment_token: "e".repeat(43), expires_at: new Date(Date.now() + 600_000).toISOString()
        });
      },
      verifyTotp: async () => { throw new TypeError("RLS_REQUEST_SCOPE_TEST_UNUSED"); },
      generateRecoveryCodes: async () => { throw new TypeError("RLS_REQUEST_SCOPE_TEST_UNUSED"); },
      confirmRecoveryCode: async () => { throw new TypeError("RLS_REQUEST_SCOPE_TEST_UNUSED"); }
    } satisfies MfaApplication,
    legal: new RepositoryLegalAcceptanceApplication({
      acceptances: {
        latest: async (ownerRef, kind) => {
          if (jitter) await sleep(Math.floor(Math.random() * 6));
          observations.push(Object.freeze({ ownerRef, probe: await probe(pools.runtime) }));
          if (floatNext) {
            floatNext = false;
            // Started here and never awaited by the handler: it runs after the response is sent.
            floating = sleep(40).then(() => {
              const afterResponse = responded;
              return probe(pools.runtime).then(
                (value): Outcome => ({ value, afterResponse }),
                (error: unknown): Outcome => ({ error: String(error), afterResponse })
              );
            });
          }
          return acceptances.latest(ownerRef, kind);
        },
        recordAll: async (rows) => {
          observations.push(Object.freeze({ ownerRef: rows[0]!.ownerRef, probe: await probe(pools.runtime) }));
          return acceptances.recordAll(rows);
        }
      },
      recordsKey: randomBytes(32),
      owedWithoutRecord: true
    })
  });
  // S4.1-g: what a statement made after the handler has sent its answer runs as (onSend runs in the request's scope).
  api.addHook("onSend", async (request, _reply, payload) => {
    if (request.url === "/v1/auth/login") signInProbe = await probe(pools.runtime);
    return payload;
  });
  await api.ready();
  // S4.1-d: a timer started at boot, outside every request, as main.ts's background loops are.
  bootTimer = await new Promise<Outcome>((resolve) => {
    setTimeout(() => {
      probe(pools.runtime).then((value) => resolve({ value }), (error: unknown) => resolve({ error: String(error) }));
    }, 5);
  });
}, 300_000);

afterAll(async () => {
  await api?.close();
  if (database !== undefined) await (await provisionRlsLogins(database)).end();
  await database?.stop();
});

describe("row-level security S01 C4: the request scope apps/api opens for every request", () => {
  it("S4.1-a inject: a signed-in GET's statements run as debateai_dev_runtime with the requester's credential and read only the requester's rows", async () => {
    observations.length = 0;
    const { result: response, statements } = await statementsOf(() => api.inject({
      method: "GET", url: "/v1/account/legal-status?locale=en", headers: testSessionHeaders(identityA)
    }));
    expect(response.statusCode).toBe(200);
    expect((response.json() as { must_accept: { kind: string }[] }).must_accept.map(({ kind }) => kind))
      .toEqual(["TERMS", "PRIVACY"]);
    expect(observations).toEqual([{ ownerRef: A.ownerRef, probe: own(A) }, { ownerRef: A.ownerRef, probe: own(A) }]);
    expect([...new Set(statements.map(({ user }) => user))]).toEqual([RUNTIME_LOGIN]);
    const credentials = statements.flatMap(({ credential }) => credential === null ? [] : [credential]);
    expect(credentials.filter((credential) => credential === "A").length).toBeGreaterThanOrEqual(1);
    expect(credentials.filter((credential) => credential !== "A" && credential !== "cleared")).toEqual([]);
  });

  it("S4.1-b the same on a real socket with the body sent in two chunks 30 ms apart; the Terms re-acceptance it posts writes A's legal.acceptance rows under A's context (R23, F-C2-1)", async () => {
    const status = await api.inject({
      method: "GET", url: "/v1/account/legal-status?locale=en", headers: testSessionHeaders(identityA)
    });
    const documents = (status.json() as { must_accept: unknown[] }).must_accept;
    expect(documents).toHaveLength(2);
    const before = await database.pool.query("SELECT 1 FROM legal.acceptance WHERE owner_ref = $1", [A.ownerRef]);
    expect(before.rowCount).toBe(0);
    const address = await api.listen({ host: "127.0.0.1", port: 0 });
    observations.length = 0;
    const { result: answer, statements } = await statementsOf(() => postInTwoChunks(
      `${address}/v1/account/legal-accept`, testSessionHeaders(identityA, true),
      JSON.stringify({ documents, locale: "en" })
    ));
    expect(answer).toEqual({ status: 204, text: "" });
    expect(observations.length).toBe(3);
    expect(observations).toEqual(Array.from({ length: 3 }, () => ({ ownerRef: A.ownerRef, probe: own(A) })));
    expect([...new Set(statements.map(({ user }) => user))]).toEqual([RUNTIME_LOGIN]);
    const credentials = statements.flatMap(({ credential }) => credential === null ? [] : [credential]);
    expect(credentials.filter((credential) => credential === "A").length).toBeGreaterThanOrEqual(1);
    expect(credentials.filter((credential) => credential !== "A" && credential !== "cleared")).toEqual([]);
    const written = await database.pool.query<{ kind: string; surface: string }>(
      "SELECT kind, surface FROM legal.acceptance WHERE owner_ref = $1 ORDER BY kind", [A.ownerRef]);
    expect(written.rows).toEqual([{ kind: "PRIVACY_SHOWN", surface: "REACCEPT" }, { kind: "TERMS", surface: "REACCEPT" }]);
  });

  it("S4.1-c a promise a handler starts and does not await reads only the requester's rows and raises nothing", async () => {
    observations.length = 0;
    responded = false;
    floating = undefined;
    floatNext = true;
    const response = await api.inject({
      method: "GET", url: "/v1/account/legal-status?locale=en", headers: testSessionHeaders(identityB)
    });
    responded = true;
    expect(response.statusCode).toBe(200);
    expect(floating).toBeDefined();
    expect(await floating).toEqual({ value: own(B), afterResponse: true });
  });

  it("S4.1-d a statement run from a timer started at boot (no request) runs as debateai_dev_api_system", () => {
    expect(bootTimer).toEqual({ value: { login: SYSTEM_LOGIN, contextUser: null, runsOfA: 1, runsOfB: 1 } });
  });

  it("S4.1-e 40 interleaved A/B requests each read only their own rows", async () => {
    observations.length = 0;
    jitter = true;
    const requesters = Array.from({ length: 40 }, (_, index) => index % 2 === 0 ? A : B);
    let responses: Awaited<ReturnType<typeof api.inject>>[];
    try {
      responses = await Promise.all(requesters.map((account) => api.inject({
        method: "GET", url: "/v1/account/legal-status?locale=en",
        headers: testSessionHeaders(account === A ? identityA : identityB)
      })));
    } finally {
      jitter = false;
    }
    expect(responses.map(({ statusCode }) => statusCode)).toEqual(requesters.map(() => 200));
    expect(observations.filter(({ ownerRef }) => ownerRef === A.ownerRef).length).toBe(40);
    expect(observations.filter(({ ownerRef }) => ownerRef === B.ownerRef).length).toBe(40);
    const crossed = observations.filter(({ ownerRef, probe: seen }) => {
      const expected = own(ownerRef === A.ownerRef ? A : B);
      return seen.login !== expected.login || seen.contextUser !== expected.contextUser
        || seen.runsOfA !== expected.runsOfA || seen.runsOfB !== expected.runsOfB;
    });
    expect(crossed).toEqual([]);
  });

  it("S4.1-f a public route whose session is optional (POST /v1/auth/mfa/totp/begin) runs as debateai_dev_runtime with the presenter's credential once its cookie authenticates", async () => {
    observations.length = 0;
    const response = await api.inject({
      method: "POST", url: "/v1/auth/mfa/totp/begin", headers: testSessionHeaders(identityB, true),
      payload: { step_up_grant: "g".repeat(43) }
    });
    expect(response.statusCode).toBe(200);
    expect(observations).toEqual([{ ownerRef: B.ownerRef, probe: own(B) }]);
  });

  it("S4.1-g a request that signs in (POST /v1/auth/login, second step) carries the new session's account context from the moment sessionCookie() issues its token", async () => {
    signInProbe = undefined;
    const response = await api.inject({
      method: "POST", url: "/v1/auth/login", headers: { origin: TEST_APP_ORIGIN },
      payload: { challenge_token: "c".repeat(43), code: "123456" }
    });
    expect(response.statusCode).toBe(200);
    expect(String(response.headers["set-cookie"])).toContain(`__Host-debateai-session=${A.token};`);
    expect(signInProbe).toEqual(own(A));
  });
});
