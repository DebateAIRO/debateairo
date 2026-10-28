/**
 * Row-level security S01, cluster C6, step S6.2 (PLAN.md S6.2; SPEC-v4 R7-R13, R23, R25, R35, R37, T4, T5, T7, T10;
 * DECISIONS D32-D35, D45, D61, F-SEC-1). Every in-scope relation, measured AS each of the four T1 logins (T9): the dev
 * runtime and authorization logins and their production namesakes, provisioned by the product's own provisioners.
 *
 * Rows: tools/rls/seed.ts writes rows of A and B in all 110 tables (superuser seeding, R35); the accounts' own fixture
 * rows (tests/support/rls-logins.ts seedSessionAccount) are added by their keys. Every other row — account C's, rows a
 * migration wrote — belongs to neither. A returned row is classified by its primary-key text against those lists
 * (never by re-deriving a policy). No T1 policy admits public rows (D34, D35), so with no or a forged context every
 * returned row is a private one (T7).
 *
 * RED at base (D45, R37): with RLS_RED_AT_BASE=1 the file applies the base emulation (row security disabled on the 110
 * tables, security_invoker reset on the 3 views) once, after seeding and before any assertion.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, runInRequestScope, setRequestCredential, type Pool } from "../../packages/db/src/index.js";
import {
  RLS_SEED_STEPS,
  prepareRlsSeedWorld,
  rlsRelationSql,
  rlsSeedInserter,
  seedRlsRows,
  type RlsSeedReport
} from "../../tools/rls/seed.js";
import { provisionRlsLogins, seedSessionAccount, type RlsLogins, type RlsTestAccount } from "../support/rls-logins.js";
import { RLS_IN_SCOPE } from "../support/rls-scope.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

type RowClass = "a" | "b" | "ab" | "ba" | "other";
type T1Login = Readonly<{ name: string; url: string; systemUrl: string }>;
type Shape = Readonly<{ relation: string; kind: "r" | "v"; sql: string; identity: string }>;
type Seen = ReadonlyMap<string, readonly string[]>;
type Queryable = Readonly<{ query: (text: string, values?: unknown[]) => Promise<pg.QueryResult> }>;

const CREDENTIAL = "SELECT set_config('debateai.session_credential', $1, false)";
/**
 * The ten tables whose predicate is `false`: they admit no row to any T1 context (their writers run on system logins, D41):
 * D32's four, and the six of FIX-S01-p1a NEW-1 under V-17's default (no signed-in request reads them on a T1 login).
 */
const ADMITS_NO_ROW = new Set(["billing.card_token", "billing.card_token_revocation", "billing.notice_quarantine", "billing.outbox",
  "billing.payment_notice", "billing.payment_notice_outcome", "billing.payment_notice_raw", "billing.xmoney_notice",
  "billing.xmoney_notice_outcome", "identity.audit_event"]);
/**
 * The unpaid-plan review: every other billing table admits a T1 context its own rows to read but none to write (WITH
 * CHECK false), and billing.entitlement_event only the lazy Free row (its guard), which the seed's row is not. R23 takes
 * their rows from the superuser too, and requires each own write refused.
 */
const WRITES_NO_ROW = new Set(RLS_SEED_STEPS.map(({ relation }) => relation)
  .filter((relation) => relation.startsWith("billing.") && !ADMITS_NO_ROW.has(relation)));
/** F-SEC-1: the two-run tables whose policy keys on one run column. */
const TWO_RUN = ["core.run_supersession", "memory.alias_row", "memory.candidate_record", "memory.memory_link"] as const;
/**
 * R13 (ii): for each in-scope relation a T1 login may UPDATE, an UPDATE that reads no existing value (so no SELECT policy
 * filters it, only the UPDATE policies). Measured at head: core.work_item is the only one (privileges probe, C6 seat).
 */
const NO_READ_UPDATE: Readonly<Record<string, string>> = Object.freeze({
  "core.work_item": "UPDATE core.work_item SET terminal_reason = NULL"
});
/** The three in-scope views and the column that names each row (classified by the row's owner_ref). */
const VIEW_KEY: Readonly<Record<string, string>> = Object.freeze({
  "billing.person_windows_v": "owner_ref",
  "billing.subscription_latest_v": "subscription_id",
  "core.run_waiting_v": "run_id"
});

let database: TestDatabase;
let logins: RlsLogins;
let A: RlsTestAccount;
let B: RlsTestAccount;
let C: RlsTestAccount;
let report: RlsSeedReport;
let t1: readonly T1Login[];
let shapes: readonly Shape[];
/** relation → identity → class, read as the superuser after seeding. */
let classes: ReadonlyMap<string, ReadonlyMap<string, RowClass>>;
/** login → the relations it may SELECT (table privilege, or any column with the identity columns readable). */
let selectable: ReadonlyMap<string, readonly Shape[]>;
const ownPools: Pool[] = [];

function trackedPool(url: string, options: Readonly<{ max?: number; crossAccount?: Pool }> = {}): Pool {
  const built = createPool(url, options);
  ownPools.push(built);
  return built;
}

async function asLogin<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  // Bounded: a stalled connect or statement fails the case instead of holding the file for minutes.
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000, statement_timeout: 30_000 });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

/** One statement that returns the identity of every row the session may read, in every relation of `of`. */
function readStatement(of: readonly Shape[]): string {
  return of.map((shape) => `SELECT '${shape.relation}'::text AS relation, ${shape.identity} AS id FROM ${shape.sql}`)
    .join("\nUNION ALL\n");
}

async function readAll(q: Queryable, of: readonly Shape[]): Promise<Seen> {
  const rows = (await q.query(readStatement(of))).rows as { relation: string; id: string }[];
  const seen = new Map<string, string[]>();
  for (const { relation, id } of rows) seen.set(relation, [...(seen.get(relation) ?? []), id]);
  return seen;
}

function classOf(relation: string, id: string): RowClass {
  return classes.get(relation)?.get(id) ?? "other";
}

/** R7 for account `own` ("a" or "b"): no returned row belongs to the other account alone or to no account (T5). */
function foreignFailures(login: string, seen: Seen, own: "a" | "b", requirement: string): string[] {
  const allowed = new Set<RowClass>([own, "ab", "ba"]);
  return [...seen].flatMap(([relation, ids]) => ids.filter((id) => !allowed.has(classOf(relation, id)))
    .map((id) => `RLS_FAIL ${login} ${relation} ${requirement} foreign=${classOf(relation, id)}:${id}`));
}

/** R8/R9: no returned row at all (every row of a T1 relation is private, T7; D34 has no public entry). */
function privateFailures(login: string, seen: Seen, requirement: string): string[] {
  return [...seen].flatMap(([relation, ids]) => ids.map((id) => `RLS_FAIL ${login} ${relation} ${requirement} private=${id}`));
}

/** Own rows seen: every seeded row that belongs to `own` alone, in every relation the login reads (apart from D32's `false` four). */
function ownRowsMissing(login: string, seen: Seen, of: readonly Shape[], own: "a" | "b", requirement: string): string[] {
  return of.filter(({ relation }) => !ADMITS_NO_ROW.has(relation)).flatMap(({ relation }) => {
    const expected = [...(classes.get(relation) ?? new Map())].filter(([, cls]) => cls === own).map(([id]) => id);
    const got = new Set(seen.get(relation) ?? []);
    const missing = expected.filter((id) => !got.has(id));
    return expected.length === 0 ? [`RLS_FAIL ${login} ${relation} ${requirement} no-${own}-row-seeded`]
      : missing.map((id) => `RLS_FAIL ${login} ${relation} ${requirement} own-row-missing=${id}`);
  });
}

async function errorText(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (error) {
    const e = error as { code?: string; message?: string };
    return `${e.code ?? "NO_SQLSTATE"} ${e.message ?? String(error)}`;
  }
}

/** The seven forged kinds of S3.2-c (R9), each a value of the credential setting. */
function forgedKinds(): readonly Readonly<{ kind: string; value: string }>[] {
  return Object.freeze([
    { kind: "random-32-bytes", value: randomBytes(32).toString("base64url") },
    { kind: "b-session-id", value: B.sessionId },
    { kind: "b-stored-token-hash", value: B.tokenHash },
    { kind: "b-revoked-token", value: B.revokedToken },
    { kind: "b-expired-token", value: B.expiredToken },
    { kind: "empty-string", value: "" },
    { kind: "b-csrf-token", value: B.csrfToken }
  ]);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  const production = await logins.production();
  A = await seedSessionAccount(database.pool, "A");
  B = await seedSessionAccount(database.pool, "B");
  C = await seedSessionAccount(database.pool, "C");
  report = await seedRlsRows(database.pool, A, B);
  t1 = Object.freeze([
    { name: "debateai_dev_runtime", url: logins.url("DATABASE_URL"), systemUrl: logins.url("API_SYSTEM_DATABASE_URL") },
    { name: "debateai_dev_authorization", url: logins.url("AUTHORIZATION_DATABASE_URL"),
      systemUrl: logins.url("API_AUTHORIZATION_SYSTEM_DATABASE_URL") },
    { name: "debateai_prod_api_runtime", url: production.url("api-runtime"), systemUrl: production.url("api-system") },
    { name: "debateai_prod_api_authorization", url: production.url("api-authorization"),
      systemUrl: production.url("api-authorization-system") }
  ]);
  const su = database.pool;
  const pk = new Map((await su.query(`SELECT n.nspname || '.' || c.relname AS relation,
      string_agg(quote_ident(a.attname), ',' ORDER BY array_position(i.indkey::int2[], a.attnum)) AS columns
    FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey) WHERE i.indisprimary GROUP BY 1`)).rows
    .map((row) => [row.relation as string, row.columns as string] as const));
  shapes = Object.freeze(RLS_IN_SCOPE.map(({ relation, kind }) => Object.freeze({
    relation, kind, sql: rlsRelationSql(relation),
    identity: `jsonb_build_array(${kind === "v" ? VIEW_KEY[relation] : pk.get(relation)})::text`
  })));
  const built = new Map<string, Map<string, RowClass>>();
  for (const shape of shapes) {
    const rows = new Map<string, RowClass>();
    if (shape.kind === "v") {
      for (const row of (await su.query(`SELECT ${shape.identity} AS id, owner_ref::text AS owner FROM ${shape.sql}`)).rows) {
        rows.set(row.id, row.owner === A.ownerRef ? "a" : row.owner === B.ownerRef ? "b" : "other");
      }
    } else {
      for (const row of (await su.query(`SELECT ${shape.identity} AS id FROM ${shape.sql}`)).rows) rows.set(row.id, "other");
      const keys = report.keys.get(shape.relation);
      for (const owner of ["a", "b", "ab", "ba"] as const) for (const id of keys?.[owner] ?? []) rows.set(id, owner);
    }
    built.set(shape.relation, rows);
  }
  // The accounts' own fixture rows (seedSessionAccount): user, three sessions, one run and its ownership event.
  for (const [account, owner] of [[A, "a"], [B, "b"]] as const) {
    for (const [relation, where, key] of [["identity.user", "user_id", account.userId],
      ["identity.session", "user_id", account.userId], ["core.run", "run_id", account.runId],
      ["core.run_ownership_event", "run_id", account.runId]] as const) {
      const shape = shapes.find((s) => s.relation === relation)!;
      for (const row of (await su.query(`SELECT ${shape.identity} AS id FROM ${shape.sql} WHERE ${where} = $1`, [key])).rows) {
        built.get(relation)!.set(row.id, owner);
      }
    }
  }
  classes = built;
  const reads = new Map<string, Shape[]>();
  for (const login of t1) {
    const can: Shape[] = [];
    for (const shape of shapes) {
      const columns = shape.identity.slice("jsonb_build_array(".length, -")::text".length).split(",");
      const ok = (await su.query(`SELECT bool_and(has_column_privilege($1, $2::regclass, c, 'SELECT')) AS ok
        FROM unnest($3::text[]) AS c`, [login.name, shape.sql, columns.map((c) => c.replace(/^"|"$/g, ""))])).rows[0].ok;
      if (ok === true) can.push(shape);
    }
    reads.set(login.name, can);
  }
  selectable = reads;
  if (process.env.RLS_RED_AT_BASE === "1") {
    for (const { relation, kind } of RLS_IN_SCOPE) {
      await su.query(kind === "v" ? `ALTER VIEW ${rlsRelationSql(relation)} RESET (security_invoker)`
        : `ALTER TABLE ${rlsRelationSql(relation)} DISABLE ROW LEVEL SECURITY`);
    }
  }
}, 600_000);

afterAll(async () => {
  for (const built of ownPools.splice(0)) await built.end().catch(() => undefined);
  await logins?.end();
  await database?.stop();
});

describe("row-level security S01 C6: isolation of every in-scope relation on the four T1 logins", () => {
  it("S6.2-seed every one of the 110 tables holds ≥ 1 row of A and ≥ 1 of B and report.unseedable is EMPTY", () => {
    const tables = RLS_IN_SCOPE.filter(({ kind }) => kind === "r").map(({ relation }) => relation);
    expect(tables).toHaveLength(110);
    const thin = tables.filter((relation) => (report.rows.get(relation)?.a ?? 0) < 1 || (report.rows.get(relation)?.b ?? 0) < 1)
      .map((relation) => `${relation} a=${report.rows.get(relation)?.a ?? 0} b=${report.rows.get(relation)?.b ?? 0}`);
    expect({ thin, unseedable: [...report.unseedable].map(([relation, why]) => `${relation}: ${why}`) })
      .toEqual({ thin: [], unseedable: [] });
  });

  it("S6.2-R7 with A's live session credential every relation returns A's own rows and no foreign row, without error", async () => {
    const failures: string[] = [];
    for (const login of t1) {
      const of = selectable.get(login.name)!;
      await asLogin(login.url, async (client) => {
        await client.query(CREDENTIAL, [A.token]);
        const error = await errorText(async () => {
          const seen = await readAll(client, of);
          failures.push(...foreignFailures(login.name, seen, "a", "R7"), ...ownRowsMissing(login.name, seen, of, "a", "R7"));
        });
        if (error !== null) failures.push(`RLS_FAIL ${login.name} * R7 error=${error}`);
      });
    }
    expect(failures).toEqual([]);
  });

  it("S6.2-R8 with no account context every relation returns no private row and raises no database error", async () => {
    const failures: string[] = [];
    for (const login of t1) {
      await asLogin(login.url, async (client) => {
        const error = await errorText(async () => {
          failures.push(...privateFailures(login.name, await readAll(client, selectable.get(login.name)!), "R8"));
        });
        if (error !== null) failures.push(`RLS_FAIL ${login.name} * R8 error=${error}`);
      });
    }
    expect(failures).toEqual([]);
  });

  it("S6.2-R9 each of the 7 forged kinds of S3.2-c returns no private row and raises no database error", async () => {
    const failures: string[] = [];
    for (const login of t1) {
      for (const { kind, value } of forgedKinds()) {
        await asLogin(login.url, async (client) => {
          await client.query(CREDENTIAL, [value]);
          const error = await errorText(async () => {
            failures.push(...privateFailures(login.name, await readAll(client, selectable.get(login.name)!), `R9:${kind}`));
          });
          if (error !== null) failures.push(`RLS_FAIL ${login.name} * R9:${kind} error=${error}`);
        });
      }
    }
    expect(failures).toEqual([]);
  });

  it("S6.2-R10 on a pool of max 1 a call without a context right after a call that served A returns no private row", async () => {
    const failures: string[] = [];
    for (const login of t1) {
      const of = selectable.get(login.name)!;
      const routed = trackedPool(login.url, { max: 1, crossAccount: trackedPool(login.systemUrl, { max: 1 }) });
      const pidA = await runInRequestScope(async () => {
        setRequestCredential(A.token);
        const seen = await readAll(routed, of);
        if (![...seen.values()].some((ids) => ids.length > 0)) failures.push(`RLS_FAIL ${login.name} * R10 served-no-row-of-A`);
        return (await routed.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
      });
      await runInRequestScope(async () => {
        const pid = (await routed.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
        if (pid !== pidA) failures.push(`RLS_FAIL ${login.name} * R10 not-the-same-connection`);
        failures.push(...privateFailures(login.name, await readAll(routed, of), "R10:pool.query"));
      });
      await runInRequestScope(async () => {
        setRequestCredential(A.token);
        const client = await routed.connect();
        try { await readAll(client, of); } finally { client.release(); }
      });
      await runInRequestScope(async () => {
        const client = await routed.connect();
        try { failures.push(...privateFailures(login.name, await readAll(client, of), "R10:checkout")); } finally { client.release(); }
      });
    }
    expect(failures).toEqual([]);
  });

  it("S6.2-R11 50 interleaved calls alternating A and B, on pools of max 1 and max 10, each return only own-account rows", async () => {
    const failures: string[] = [];
    for (const login of t1) {
      const of = selectable.get(login.name)!;
      for (const max of [1, 10]) {
        const routed = trackedPool(login.url, { max, crossAccount: trackedPool(login.systemUrl, { max: 2 }) });
        await Promise.all(Array.from({ length: 50 }, (_, call) => runInRequestScope(async () => {
          const own = call % 2 === 0 ? "a" : "b";
          setRequestCredential(own === "a" ? A.token : B.token);
          const seen = await readAll(routed, of);
          failures.push(...foreignFailures(login.name, seen, own, `R11:max${max}:call${call}`));
          if (![...seen.values()].some((ids) => ids.length > 0)) failures.push(`RLS_FAIL ${login.name} * R11:max${max}:call${call} no-own-row`);
        })));
      }
    }
    expect(failures).toEqual([]);
  });

  it("S6.2-R12 each of the 3 views returns A's rows only with A's context and no row with no or a forged context", async () => {
    const failures: string[] = [];
    const views = shapes.filter(({ kind }) => kind === "v");
    expect(views.map(({ relation }) => relation)).toEqual(Object.keys(VIEW_KEY));
    for (const login of t1) {
      const of = selectable.get(login.name)!.filter(({ kind }) => kind === "v");
      if (login.name.endsWith("runtime")) expect(of.map(({ relation }) => relation)).toEqual(Object.keys(VIEW_KEY));
      for (const context of [{ kind: "A", value: A.token }, { kind: "none", value: null }, ...forgedKinds()]) {
        await asLogin(login.url, async (client) => {
          if (context.value !== null) await client.query(CREDENTIAL, [context.value]);
          const seen = await readAll(client, of);
          failures.push(...(context.kind === "A"
            ? [...foreignFailures(login.name, seen, "a", "R12"), ...ownRowsMissing(login.name, seen, of, "a", "R12")]
            : privateFailures(login.name, seen, `R12:${context.kind}`)));
        });
      }
    }
    expect(failures).toEqual([]);
  });

  it("S6.2-R13 UPDATE/DELETE inside a rolled-back transaction: 0 rows of B with A's context; 0 private rows with no or a forged context", async () => {
    const failures: string[] = [];
    let changedOwn = 0, blindStatements = 0;
    for (const login of t1) {
      for (const context of [{ kind: "A", value: A.token as string | null }, { kind: "none", value: null },
        { kind: "forged", value: randomBytes(32).toString("base64url") }]) {
        await asLogin(login.url, async (client) => {
          if (context.value !== null) await client.query(CREDENTIAL, [context.value]);
          await client.query("BEGIN");
          try {
            for (const shape of selectable.get(login.name)!) {
              const first = shape.identity.slice("jsonb_build_array(".length, -")::text".length).split(",")[0]!;
              const visible = Number((await client.query(`SELECT count(*) AS n FROM ${shape.sql}`)).rows[0].n);
              // (i) statements that read the rows they change: whatever they return belongs to the context's account.
              for (const statement of [`UPDATE ${shape.sql} SET ${first} = ${first} RETURNING ${shape.identity} AS id`,
                `DELETE FROM ${shape.sql} RETURNING ${shape.identity} AS id`]) {
                await client.query("SAVEPOINT r13");
                try {
                  const changed = (await client.query(statement)).rows as { id: string }[];
                  for (const { id } of changed) {
                    const cls = classOf(shape.relation, id);
                    if (context.kind === "A" && (cls === "a" || cls === "ab" || cls === "ba")) { changedOwn += 1; continue; }
                    failures.push(`RLS_FAIL ${login.name} ${shape.relation} R13:${context.kind} changed=${cls}:${id}`);
                  }
                } catch { /* refused with a database error: no row changed */ }
                await client.query("ROLLBACK TO SAVEPOINT r13");
              }
              // (ii) statements that read nothing (no WHERE, RETURNING or column on the right): only the UPDATE/DELETE
              // policies choose their rows, so they change no more rows than the context may SELECT.
              const may = (await database.pool.query(`SELECT has_table_privilege($1, $2::regclass, 'UPDATE') AS u,
                has_table_privilege($1, $2::regclass, 'DELETE') AS d`, [login.name, shape.sql])).rows[0] as { u: boolean; d: boolean };
              const blind = [...(may.u ? [NO_READ_UPDATE[shape.relation] ?? null] : []), ...(may.d ? [`DELETE FROM ${shape.sql}`] : [])];
              for (const statement of blind) {
                if (statement === null) { failures.push(`RLS_FAIL ${login.name} ${shape.relation} R13 no-read-update-unknown`); continue; }
                await client.query("SAVEPOINT r13");
                const count = await client.query(statement).then((result) => result.rowCount ?? 0, () => 0);
                await client.query("ROLLBACK TO SAVEPOINT r13");
                blindStatements += 1;
                if (count > visible) failures.push(`RLS_FAIL ${login.name} ${shape.relation} R13:${context.kind} blind-changed=${count} visible=${visible}`);
              }
            }
          } finally {
            await client.query("ROLLBACK");
          }
        });
      }
    }
    expect(failures).toEqual([]);
    expect(changedOwn).toBeGreaterThan(0);
    expect(blindStatements).toBeGreaterThan(0);
  });

  it("S6.2-R23 an own-row INSERT under an account's own context succeeds on every table the login may INSERT into (rolled back; account C, which holds no rows yet: billing.customer keeps one row per owner)", async () => {
    const world = await prepareRlsSeedWorld(database.pool, C, "C");
    // The `false` tables' rows come from the superuser (their writers run on system logins, D41), so a T1 INSERT into a
    // child of one (billing.xmoney_notice_outcome, billing.payment_notice_outcome) meets its own policy, not a missing
    // parent. Several of them hang off rows C must write itself (billing.card_token off C's customer, which is one row
    // per owner), so the superuser writes them in the world of a fourth account D, every step in order, and only the
    // `false` tables' rows are carried over, and the rows of the billing tables a context may not write (WRITES_NO_ROW).
    const D = await seedSessionAccount(database.pool, "D");
    const dWorld = await prepareRlsSeedWorld(database.pool, D, "D");
    const superuserInsert = await rlsSeedInserter(database.pool);
    for (const step of RLS_SEED_STEPS) await step.run(superuserInsert, database.pool, dWorld);
    const superuserMade = new Map([...dWorld.made].filter(([name]) => RLS_SEED_STEPS.some(({ relation }) =>
      (ADMITS_NO_ROW.has(relation) || WRITES_NO_ROW.has(relation)) && relation.endsWith(`.${name}`))));
    expect([WRITES_NO_ROW.size, superuserMade.size]).toEqual([19, ADMITS_NO_ROW.size + 19]);
    const failures: string[] = [];
    let written = 0;
    for (const login of t1) {
      let insertable = 0, refused = 0, wrote = 0, billingRefused = 0;
      await asLogin(login.url, async (client) => {
        await client.query(CREDENTIAL, [C.token]);
        await client.query("BEGIN");
        try {
          const insert = await rlsSeedInserter(client);
          const own = { ...world, made: new Map(superuserMade) };
          for (const step of RLS_SEED_STEPS) {
            const may = (await database.pool.query("SELECT has_table_privilege($1, $2::regclass, 'INSERT') AS may",
              [login.name, rlsRelationSql(step.relation)])).rows[0].may as boolean;
            if (!may) continue;
            insertable += 1;
            await client.query("SAVEPOINT r23");
            const error = await errorText(() => step.run(insert, client, own));
            await client.query(error === null ? "RELEASE SAVEPOINT r23" : "ROLLBACK TO SAVEPOINT r23");
            if (ADMITS_NO_ROW.has(step.relation)) {
              if (error === null || !error.startsWith("42501 ")) failures.push(`RLS_FAIL ${login.name} ${step.relation} R23 false-policy-admitted=${error}`);
              else refused += 1;
            } else if (WRITES_NO_ROW.has(step.relation)) {
              if (error === null || !error.startsWith("42501 ")) failures.push(`RLS_FAIL ${login.name} ${step.relation} R23 billing-write-admitted=${error}`);
              else billingRefused += 1;
            } else if (error !== null) {
              failures.push(`RLS_FAIL ${login.name} ${step.relation} R23 ${error}`);
            } else {
              wrote += 1;
            }
          }
        } finally {
          await client.query("ROLLBACK");
        }
      });
      written += wrote;
      console.info(`R23 FRAME login=${login.name} insertable=${insertable} written=${wrote} false_policy_refused=${refused} billing_write_refused=${billingRefused}`);
    }
    expect(failures).toEqual([]);
    expect(written).toBeGreaterThan(0);
  });

  it("S6.2-R7 F-SEC-1 the four two-run tables hold mixed-owner rows; A's context returns none of B's alone and reports those naming a run of B", async () => {
    const failures: string[] = [];
    for (const relation of TWO_RUN) {
      const keys = report.keys.get(relation);
      if ((keys?.ab.length ?? 0) < 1 || (keys?.ba.length ?? 0) < 1) failures.push(`RLS_FAIL seed ${relation} F-SEC-1 mixed-row-missing`);
    }
    for (const login of t1) {
      const of = selectable.get(login.name)!.filter(({ relation }) => (TWO_RUN as readonly string[]).includes(relation));
      await asLogin(login.url, async (client) => {
        await client.query(CREDENTIAL, [A.token]);
        const seen = await readAll(client, of);
        failures.push(...foreignFailures(login.name, seen, "a", "R7:F-SEC-1"));
        for (const [relation, ids] of seen) {
          const mixed = ids.filter((id) => classOf(relation, id) === "ab").length;
          console.info(`F-SEC-1 FRAME login=${login.name} relation=${relation} context=A visible_rows_naming_a_run_of_B=${mixed}`);
        }
      });
    }
    expect(failures).toEqual([]);
  });
});
