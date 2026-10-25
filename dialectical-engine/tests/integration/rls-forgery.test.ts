/**
 * Row-level security S01, cluster C6, step S6.3 (PLAN.md S6.3; SPEC-v4 R14 F1-F6, F8, F9, R35; DECISIONS D27, D63).
 * Forgery, run as SQL by each of the four T1 logins (T9) on a database seeded with rows of A and B (tools/rls/seed.ts).
 * Each forgery is either refused with a database error, or the reads that follow it in the same session return no
 * foreign row (the session first carried A's live credential) and no private row (it carried none). F7 (the R42 calls)
 * is S7.2's, not this file's (PLAN N3).
 *
 * A read is one statement over every in-scope relation the session's CURRENT role may read (so a SET ROLE that drops a
 * privilege narrows the read instead of failing it whole); a returned row is classified by its primary-key text against
 * the seed's lists (never by re-deriving a policy). No T1 policy admits public rows (D34, D35).
 */
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, runInRequestScope, setRequestCredential, type Pool } from "../../packages/db/src/index.js";
import { rlsRelationSql, seedRlsRows, type RlsSeedReport } from "../../tools/rls/seed.js";
import { provisionRlsLogins, seedSessionAccount, type RlsLogins, type RlsTestAccount } from "../support/rls-logins.js";
import { RLS_IN_SCOPE } from "../support/rls-scope.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

type RowClass = "a" | "b" | "ab" | "ba" | "other";
type T1Login = Readonly<{ name: string; url: string; systemUrl: string }>;
type Shape = Readonly<{ relation: string; sql: string; columns: readonly string[]; identity: string }>;
type Context = "A" | "none";
type Outcome = Readonly<{ refused: string | null; failures: readonly string[] }>;

const CREDENTIAL_SETTING = "debateai.session_credential";
const CREDENTIAL = `SELECT set_config('${CREDENTIAL_SETTING}', $1, false)`;
const VIEW_KEY: Readonly<Record<string, string>> = Object.freeze({
  "billing.person_windows_v": "owner_ref",
  "billing.subscription_latest_v": "subscription_id",
  "core.run_waiting_v": "run_id"
});

let database: TestDatabase;
let logins: RlsLogins;
let A: RlsTestAccount;
let B: RlsTestAccount;
let report: RlsSeedReport;
let t1: readonly T1Login[];
let shapes: readonly Shape[];
let classes: ReadonlyMap<string, ReadonlyMap<string, RowClass>>;
const ownPools: Pool[] = [];
/** Per family: how many forgeries were refused with an error and how many were followed by a clean read. */
const tally = new Map<string, { refused: number; read: number }>();

async function asLogin<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000, statement_timeout: 30_000 });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** The right-hand side of `SET <name> = …` (search_path takes its list unquoted, as an attacker would write it). */
function setValue(name: string, value: string): string {
  return name === "search_path" ? value : quoteLiteral(value);
}

function classOf(relation: string, id: string): RowClass {
  return classes.get(relation)?.get(id) ?? "other";
}

/** Reads every relation the session's current role may read; returns the failure lines for `context`. */
async function readFailures(client: pg.Client, login: string, context: Context, label: string): Promise<string[]> {
  const readable = (await client.query(`SELECT relation FROM unnest($1::text[], $2::text[], $3::text[]) AS s(relation, sql, cols)
    WHERE has_schema_privilege(current_user, split_part(relation, '.', 1), 'USAGE')
      AND (SELECT bool_and(has_column_privilege(current_user, sql::regclass, c, 'SELECT')) FROM unnest(string_to_array(cols, ',')) AS c)`,
  [shapes.map((s) => s.relation), shapes.map((s) => s.sql), shapes.map((s) => s.columns.join(","))])).rows.map((r) => r.relation as string);
  const of = shapes.filter((s) => readable.includes(s.relation));
  if (of.length === 0) return [];
  const rows = (await client.query(of.map((s) => `SELECT '${s.relation}'::text AS relation, ${s.identity} AS id FROM ${s.sql}`)
    .join("\nUNION ALL\n"))).rows as { relation: string; id: string }[];
  return rows.filter(({ relation, id }) => context === "none" || !["a", "ab", "ba"].includes(classOf(relation, id)))
    .map(({ relation, id }) => `RLS_FAIL ${login} ${relation} R14:${label}:${context} ${context === "A" ? "foreign" : "private"}=${classOf(relation, id)}:${id}`);
}

/**
 * One forgery in a fresh session of `login`: the session first carries A's credential (context A) or none, then runs
 * `forge` and, unless it was refused, reads. A database error from the forgery or from the read is a refusal.
 */
async function forgery(login: T1Login, context: Context, family: string, label: string,
  forge: (client: pg.Client) => Promise<unknown>, read: (client: pg.Client) => Promise<string[]> =
  (client) => readFailures(client, login.name, context, label)): Promise<Outcome> {
  return asLogin(login.url, async (client) => {
    if (context === "A") await client.query(CREDENTIAL, [A.token]);
    let failures: string[] = [];
    let refused: string | null = null;
    try {
      await forge(client);
      failures = await read(client);
    } catch (error) {
      const e = error as { code?: string; message?: string };
      refused = `${e.code ?? "NO_SQLSTATE"} ${e.message ?? String(error)}`;
    }
    const count = tally.get(family) ?? { refused: 0, read: 0 };
    if (refused === null) count.read += 1; else count.refused += 1;
    tally.set(family, count);
    return { refused, failures };
  });
}

/** F1's setting names: the credential plus every name passed to current_setting( by an in-scope policy or a function it calls. */
async function policySettingNames(): Promise<string[]> {
  const su = database.pool;
  const scope = RLS_IN_SCOPE.filter(({ kind }) => kind === "r").map(({ relation }) => rlsRelationSql(relation));
  const texts = (await su.query(`SELECT pg_get_expr(p.polqual, p.polrelid) AS q, pg_get_expr(p.polwithcheck, p.polrelid) AS c
    FROM pg_policy p WHERE p.polrelid = ANY (SELECT unnest($1::text[])::regclass)`, [scope])).rows
    .flatMap((r) => [r.q as string | null, r.c as string | null]).filter((t): t is string => t !== null);
  const names = new Set<string>([CREDENTIAL_SETTING]);
  const seen = new Set<string>();
  const queue = [...texts];
  while (queue.length > 0) {
    const text = queue.shift()!;
    for (const match of text.matchAll(/current_setting\(\s*'([^']+)'/giu)) names.add(match[1]!);
    for (const match of text.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(/giu)) {
      const key = `${match[1]}.${match[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const bodies = (await su.query(`SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1 AND p.proname = $2`, [match[1], match[2]])).rows.map((r) => r.prosrc as string);
      queue.push(...bodies);
    }
  }
  return [...names].sort();
}

/** The value each F1 name is forged to (a role the login holds for `role`). */
function forgedValue(name: string): string {
  return name === CREDENTIAL_SETTING ? randomBytes(32).toString("base64url")
    : name === "row_security" ? "off"
    : name === "search_path" ? "pg_temp, public, rls"
    : "debateai_runtime";
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  const production = await logins.production();
  A = await seedSessionAccount(database.pool, "A");
  B = await seedSessionAccount(database.pool, "B");
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
      array_agg(a.attname::text ORDER BY array_position(i.indkey::int2[], a.attnum)) AS columns
    FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey) WHERE i.indisprimary GROUP BY 1`)).rows
    .map((row) => [row.relation as string, row.columns as string[]] as const));
  shapes = Object.freeze(RLS_IN_SCOPE.map(({ relation, kind }) => {
    const columns = kind === "v" ? [VIEW_KEY[relation]!] : pk.get(relation)!;
    return Object.freeze({ relation, sql: rlsRelationSql(relation), columns,
      identity: `jsonb_build_array(${columns.map((c) => `"${c}"`).join(",")})::text` });
  }));
  const built = new Map<string, Map<string, RowClass>>();
  for (const shape of shapes) {
    const rows = new Map<string, RowClass>();
    if (shape.relation in VIEW_KEY) {
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
  if (process.env.RLS_RED_AT_BASE === "1") {
    for (const { relation, kind } of RLS_IN_SCOPE) {
      await su.query(kind === "v" ? `ALTER VIEW ${rlsRelationSql(relation)} RESET (security_invoker)`
        : `ALTER TABLE ${rlsRelationSql(relation)} DISABLE ROW LEVEL SECURITY`);
    }
  }
}, 600_000);

afterAll(async () => {
  console.info(`R14 TALLY ${[...tally].map(([family, n]) => `${family}:refused=${n.refused},read=${n.read}`).join(" ")}`);
  for (const built of ownPools.splice(0)) await built.end().catch(() => undefined);
  await logins?.end();
  await database?.stop();
});

describe("row-level security S01 C6: forgery by SQL on the four T1 logins widens nothing (R14)", () => {
  it("S6.3-F1 set_config, SET and SET LOCAL of the credential (the only setting a policy reads, computed from the catalog), row_security, search_path and role", async () => {
    const names = await policySettingNames();
    expect(names).toEqual([CREDENTIAL_SETTING]);
    const failures: string[] = [];
    for (const login of t1) {
      for (const name of [...names, "row_security", "search_path", "role"]) {
        const value = forgedValue(name);
        for (const context of ["A", "none"] as const) {
          for (const [way, forge, read] of [
            ["set_config", (c: pg.Client) => c.query("SELECT set_config($1, $2, false)", [name, value]), undefined],
            ["SET", (c: pg.Client) => c.query(`SET ${name} = ${setValue(name, value)}`), undefined],
            ["SET LOCAL", async (c: pg.Client) => { await c.query("BEGIN"); await c.query(`SET LOCAL ${name} = ${setValue(name, value)}`); },
              async (c: pg.Client) => { try { return await readFailures(c, login.name, context, `F1:${name}:SET LOCAL`); } finally { await c.query("ROLLBACK"); } }]
          ] as const) {
            const outcome = await forgery(login, context, "F1", `F1:${name}:${way}`, forge,
              read === undefined ? undefined : (c) => read(c));
            failures.push(...outcome.failures);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("S6.3-F2 SET ROLE to every role the login is a member of", async () => {
    const failures: string[] = [];
    for (const login of t1) {
      const roles = (await database.pool.query(`SELECT rolname FROM pg_roles WHERE pg_has_role($1, oid, 'MEMBER') ORDER BY 1`,
        [login.name])).rows.map((r) => r.rolname as string);
      expect(roles).toContain("debateai_runtime");
      for (const role of roles) {
        for (const context of ["A", "none"] as const) {
          failures.push(...(await forgery(login, context, "F2", `F2:${role}`, (c) => c.query(`SET ROLE "${role}"`))).failures);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("S6.3-F3 RESET ROLE, RESET ALL and DISCARD ALL", async () => {
    const failures: string[] = [];
    for (const login of t1) {
      for (const statement of ["RESET ROLE", "RESET ALL", "DISCARD ALL"]) {
        for (const context of ["A", "none"] as const) {
          failures.push(...(await forgery(login, context, "F3", `F3:${statement}`, async (c) => {
            await c.query('SET ROLE "debateai_runtime"');
            await c.query(statement);
          })).failures);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("S6.3-F4 SET SESSION AUTHORIZATION to another role is refused with 42501", async () => {
    const refusals: string[] = [];
    for (const login of t1) {
      for (const target of ["debateai", "debateai_runtime", "debateai_dev_api_system"]) {
        const outcome = await forgery(login, "none", "F4", `F4:${target}`, (c) => c.query(`SET SESSION AUTHORIZATION "${target}"`));
        refusals.push(`${login.name} ${target} ${(outcome.refused ?? "ACCEPTED").slice(0, 5)}`);
      }
    }
    expect(refusals).toEqual(t1.flatMap(({ name }) => ["debateai", "debateai_runtime", "debateai_dev_api_system"]
      .map((target) => `${name} ${target} 42501`)));
  });

  it("S6.3-F5 a context naming B's user_id or owner_ref directly", async () => {
    const failures: string[] = [];
    for (const login of t1) {
      for (const [kind, value] of [["b-user-id", B.userId], ["b-owner-ref", B.ownerRef], ["b-asker-id", `owner:${B.ownerRef}`]] as const) {
        for (const context of ["A", "none"] as const) {
          failures.push(...(await forgery(login, context, "F5", `F5:${kind}`, (c) => c.query(CREDENTIAL, [value]))).failures);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("S6.3-F6 a context built from B's session_id or B's stored token_hash", async () => {
    const failures: string[] = [];
    for (const login of t1) {
      for (const [kind, value] of [["b-session-id", B.sessionId], ["b-stored-token-hash", B.tokenHash],
        ["b-token-hash-hex", B.tokenHash.replace(/^sha256:/u, "")]] as const) {
        for (const context of ["A", "none"] as const) {
          failures.push(...(await forgery(login, context, "F6", `F6:${kind}`, (c) => c.query(CREDENTIAL, [value]))).failures);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("S6.3-F8 BEGIN, set, SAVEPOINT s, ROLLBACK TO SAVEPOINT s, then read", async () => {
    const failures: string[] = [];
    for (const login of t1) {
      for (const name of [CREDENTIAL_SETTING, "row_security", "search_path", "role"]) {
        const value = name === CREDENTIAL_SETTING ? B.revokedToken : forgedValue(name);
        for (const [order, steps] of [
          ["set-then-savepoint", [`SET LOCAL ${name} = ${setValue(name, value)}`, "SAVEPOINT s", "ROLLBACK TO SAVEPOINT s"]],
          ["savepoint-then-set", ["SAVEPOINT s", `SET LOCAL ${name} = ${setValue(name, value)}`, "ROLLBACK TO SAVEPOINT s"]],
          ["session-set-in-savepoint", ["SAVEPOINT s", `SET ${name} = ${setValue(name, value)}`, "ROLLBACK TO SAVEPOINT s"]]
        ] as const) {
          for (const context of ["A", "none"] as const) {
            failures.push(...(await forgery(login, context, "F8", `F8:${name}:${order}`, async (c) => {
              await c.query("BEGIN");
              for (const step of steps) await c.query(step);
            }, async (c) => {
              try { return await readFailures(c, login.name, context, `F8:${name}:${order}`); } finally { await c.query("ROLLBACK"); }
            })).failures);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("S6.3-F10 (SEC-B1, V-15) an own-account subscription event naming B's subscription makes no row of B readable, and no cancel link of B writable", async () => {
    // REV-S01-p1-security B1: billing.cancel_token was B's when ANY subscription event with its subscription_id was
    // visible, and A may append one under A's own owner_ref. The bridge below is that permitted write; it must be
    // accepted on the logins that hold INSERT on billing.subscription_event, or this case pins nothing.
    const su = database.pool;
    const bSubscription = (await su.query(`SELECT subscription_id::text AS id FROM billing.subscription_event WHERE owner_ref = $1
      ORDER BY seq LIMIT 1`, [B.ownerRef])).rows[0]!.id as string;
    const bToken = (await su.query("SELECT token_sha256 FROM billing.cancel_token WHERE subscription_id = $1", [bSubscription]))
      .rows.map((row) => row.token_sha256 as string);
    expect(bToken).toHaveLength(1);
    expect((await su.query("SELECT count(*)::int AS n FROM billing.cancel_token_use WHERE token_sha256 = $1", [bToken[0]])).rows[0].n)
      .toBe(1);
    const failures: string[] = [];
    const bridged: string[] = [];
    const writes: string[] = [];
    const attempt = async (client: pg.Client, sql: string, values: readonly unknown[]): Promise<string> => {
      await client.query("SAVEPOINT f10");
      try {
        await client.query(sql, [...values]);
        await client.query("RELEASE SAVEPOINT f10");
        return "ACCEPTED";
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT f10");
        return (error as { code?: string }).code ?? "NO_SQLSTATE";
      }
    };
    for (const login of t1) {
      const eventId = randomUUID();
      failures.push(...(await forgery(login, "A", "F10", "F10:subscription-bridge", async (c) => {
        await c.query("BEGIN");
        const bridge = await attempt(c, `INSERT INTO billing.subscription_event(event_id, subscription_id, owner_ref, kind, at, plan_id, data)
          VALUES ($1, $2, (SELECT rls.context_owner_ref()), 'CREATED', now(), 'PLUS', $3::jsonb)`,
        [eventId, bSubscription, JSON.stringify({ payment_provider: "netopia", payment_environment: "sandbox" })]);
        if (bridge === "ACCEPTED") bridged.push(login.name);
      }, async (c) => {
        try {
          // The bridge event is A's own row (T4: its owner_ref is A's), and so is the one row of the latest-event view it
          // makes for B's subscription id while that row carries A's owner_ref; every other returned row is classified.
          const own = new Set<string>();
          if (bridged.includes(login.name)) {
            own.add(`RLS_FAIL ${login.name} billing.subscription_event R14:F10:subscription-bridge:A foreign=other:${JSON.stringify([eventId])}`);
            const latest = (await c.query("SELECT owner_ref::text AS owner FROM billing.subscription_latest_v WHERE subscription_id = $1",
              [bSubscription])).rows;
            if (latest.length === 1 && latest[0].owner === A.ownerRef) {
              own.add(`RLS_FAIL ${login.name} billing.subscription_latest_v R14:F10:subscription-bridge:A foreign=b:${JSON.stringify([bSubscription])}`);
            }
          }
          const read = (await readFailures(c, login.name, "A", "F10:subscription-bridge")).filter((line) => !own.has(line));
          writes.push(`${login.name} use-of-b-token ${await attempt(c,
            "INSERT INTO billing.cancel_token_use(token_sha256, used_at) VALUES ($1, now())", [bToken[0]])}`);
          writes.push(`${login.name} token-owned-by-b ${await attempt(c, `INSERT INTO billing.cancel_token(token_sha256, subscription_id,
            issued_at, expires_at, owner_ref) VALUES ($1, $2, now(), now() + interval '1 day', $3)`,
          [randomBytes(32).toString("hex"), bSubscription, B.ownerRef])}`);
          return read;
        } finally {
          await c.query("ROLLBACK");
        }
      })).failures);
    }
    console.info(`F10 FRAME bridged=${bridged.join(",")} writes=${writes.join(";")} reads_failed=${failures.length}`);
    expect(bridged).toEqual(["debateai_dev_runtime", "debateai_prod_api_runtime"]);
    expect(failures).toEqual([]);
    // 42501: the row-security WITH CHECK refuses it (a login without INSERT on the table refuses with the same code).
    expect(writes).toEqual(t1.flatMap(({ name }) => [`${name} use-of-b-token 42501`, `${name} token-owned-by-b 42501`]));
  });

  it("S6.3-F9 while an A call runs and after it ends, a second connection of the same login sees no credential or context value of A", async () => {
    const failures: string[] = [];
    const secrets = [A.token, A.tokenHash, A.tokenHash.replace(/^sha256:/u, ""), A.userId, A.ownerRef];
    const executionRef = (await database.pool.query(`SELECT execution_ref::text AS ref FROM identity.run_execution_binding
      WHERE user_id = $1 ORDER BY created_at LIMIT 1`, [A.userId])).rows[0].ref as string;
    const leaks = (where: string, login: string, text: string): string[] =>
      secrets.filter((secret) => text.includes(secret)).map((secret) => `RLS_FAIL ${login} ${where} F9 leak=${secrets.indexOf(secret)}`);
    for (const login of t1) {
      const target = createPool(login.systemUrl, { max: 1 });
      const routed = createPool(login.url, { max: 1, crossAccount: target });
      ownPools.push(routed, target);
      const observe = async (phase: string): Promise<void> => {
        await asLogin(login.url, async (second) => {
          const activity = JSON.stringify((await second.query("SELECT * FROM pg_stat_activity")).rows);
          const settings = JSON.stringify((await second.query("SELECT * FROM pg_settings")).rows);
          failures.push(...leaks(`pg_stat_activity:${phase}`, login.name, activity), ...leaks(`pg_settings:${phase}`, login.name, settings));
          const calls = (await second.query(`SELECT rls.context_user_id()::text AS user_id, rls.context_owner_ref()::text AS owner_ref,
              rls.owns_run($1::uuid) AS owns_run, rls.owns_execution_ref($2) AS owns_execution_ref`, [A.runId, executionRef])).rows[0];
          failures.push(...leaks(`rls-functions:${phase}`, login.name, JSON.stringify(calls)));
          if (calls.owns_run !== false || calls.owns_execution_ref !== false) {
            failures.push(`RLS_FAIL ${login.name} rls-functions:${phase} F9 context-of-A=${JSON.stringify(calls)}`);
          }
          const hash = await second.query("SELECT rls.session_credential_hash() AS h").then((r) => r.rows[0].h as string, () => null);
          if (hash !== null) failures.push(`RLS_FAIL ${login.name} rls.session_credential_hash:${phase} F9 executable`);
          failures.push(...(await readFailures(second, login.name, "none", `F9:${phase}`)));
        });
      };
      let observed = false;
      await runInRequestScope(async () => {
        setRequestCredential(A.token);
        const call = routed.query("SELECT pg_sleep(3), current_user");
        await new Promise((resolve) => setTimeout(resolve, 300));
        await observe("during");
        observed = true;
        await call;
      });
      await observe("after");
      expect(observed).toBe(true);
    }
    expect(failures).toEqual([]);
  });
});
