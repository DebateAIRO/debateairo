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
import { createPool, EntitlementRepository, migrate, runInRequestScope, setRequestCredential, type Pool } from "../../packages/db/src/index.js";
import { prepareRlsSeedWorld, RLS_SEED_STEPS, rlsRelationSql, rlsSeedInserter, seedRlsRows, type RlsSeedInsert,
  type RlsSeedReport } from "../../tools/rls/seed.js";
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

type Statement = [string, unknown[]];

/** One statement in a savepoint: "ACCEPTED", or the SQLSTATE that refused it. `undo` rolls an accepted one back as well. */
async function attempt(client: pg.Client, sql: string, values: readonly unknown[], undo = false): Promise<string> {
  await client.query("SAVEPOINT attempt");
  try {
    await client.query(sql, [...values]);
    await client.query(undo ? "ROLLBACK TO SAVEPOINT attempt" : "RELEASE SAVEPOINT attempt");
    return "ACCEPTED";
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT attempt");
    return (error as { code?: string }).code ?? "NO_SQLSTATE";
  }
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

  it("S6.3-F10 (SEC-B1, V-15, V-18) an own-account subscription event naming B's subscription is refused, and one already stored makes no row of B readable and no cancel link of B writable", async () => {
    // REV-S01-p1-security B1: billing.cancel_token was B's when ANY subscription event with its subscription_id was
    // visible, and A could append one under A's own owner_ref. V-18 refuses that write on every T1 login; a bridge
    // stored before 0124 (planted here by the superuser: A's owner_ref on B's subscription) must still widen nothing,
    // which is what keeps the read half of this case from being vacuous now that no T1 login can write the bridge.
    const su = database.pool;
    const bSubscription = (await su.query(`SELECT subscription_id::text AS id FROM billing.subscription_event WHERE owner_ref = $1
      ORDER BY seq LIMIT 1`, [B.ownerRef])).rows[0]!.id as string;
    const bToken = (await su.query("SELECT token_sha256 FROM billing.cancel_token WHERE subscription_id = $1", [bSubscription]))
      .rows.map((row) => row.token_sha256 as string);
    expect(bToken).toHaveLength(1);
    expect((await su.query("SELECT count(*)::int AS n FROM billing.cancel_token_use WHERE token_sha256 = $1", [bToken[0]])).rows[0].n)
      .toBe(1);
    const bridge = `INSERT INTO billing.subscription_event(event_id, subscription_id, owner_ref, kind, at, plan_id, data)
      VALUES ($1, $2, $3, 'CREATED', now(), 'PLUS', $4::jsonb)`;
    const netopia = JSON.stringify({ payment_provider: "netopia", payment_environment: "sandbox" });
    const failures: string[] = [];
    const writes: string[] = [];
    for (const login of t1) {
      await asLogin(login.url, async (c) => {
        await c.query(CREDENTIAL, [A.token]);
        await c.query("BEGIN");
        try {
          writes.push(`${login.name} bridge ${await attempt(c, bridge.replace("$3", "(SELECT rls.context_owner_ref())").replace("$4", "$3"),
            [randomUUID(), bSubscription, netopia])}`);
        } finally {
          await c.query("ROLLBACK");
        }
      });
    }
    const bridgeEvent = randomUUID();
    await su.query(bridge, [bridgeEvent, bSubscription, A.ownerRef, netopia]);
    // T4: the planted bridge is A's row (its owner_ref is A's), so its key and the one view row it alone makes are A's
    // values, not foreign ones (T5). What the case pins is that no row of B becomes readable through it (FIX-S01-p1e).
    const ownByT4 = new Set([`billing.subscription_event ${JSON.stringify([bridgeEvent])}`,
      `billing.subscription_latest_v ${JSON.stringify([bSubscription])}`]);
    for (const login of t1) {
      failures.push(...(await forgery(login, "A", "F10", "F10:stored-bridge", (c) => c.query("BEGIN"), async (c) => {
        try {
          const read = (await readFailures(c, login.name, "A", "F10:stored-bridge"))
            .filter((line) => !ownByT4.has(line.replace(/^RLS_FAIL \S+ (\S+) \S+ foreign=[a-z]+:(.*)$/u, "$1 $2")));
          // A login that may not read a relation's owner_ref reads no row of B there (the authorization logins).
          const rowsOf = async (relation: string, where: string, value: string): Promise<number> =>
            (await c.query("SELECT has_column_privilege(current_user, $1::regclass, 'owner_ref', 'SELECT') AS may", [relation])).rows[0].may
              ? (await c.query(`SELECT count(*)::int AS n FROM ${relation} WHERE ${where}`, [value])).rows[0].n as number : 0;
          const ofB = { events: await rowsOf("billing.subscription_event", "owner_ref = $1", B.ownerRef),
            links: await rowsOf("billing.cancel_token", "owner_ref = $1", B.ownerRef),
            view_rows: await rowsOf("billing.subscription_latest_v", "owner_ref IS DISTINCT FROM $1", A.ownerRef) };
          if (ofB.events !== 0 || ofB.links !== 0 || ofB.view_rows !== 0) {
            read.push(`RLS_FAIL ${login.name} F10:stored-bridge rows-of-b=${JSON.stringify(ofB)}`);
          }
          writes.push(`${login.name} use-of-b-token ${await attempt(c,
            "INSERT INTO billing.cancel_token_use(token_sha256, used_at) VALUES ($1, now())", [bToken[0]])}`);
          writes.push(`${login.name} token-owned-by-b ${await attempt(c, `INSERT INTO billing.cancel_token(token_sha256, subscription_id,
            issued_at, expires_at, owner_ref) VALUES ($1, $2, now(), now() + interval '1 day', $3)`,
          [randomBytes(32).toString("hex"), bSubscription, B.ownerRef])}`);
          writes.push(`${login.name} own-token-naming-b ${await attempt(c, `INSERT INTO billing.cancel_token(token_sha256, subscription_id,
            issued_at, expires_at, owner_ref) VALUES ($1, $2, now(), now() + interval '1 day', (SELECT rls.context_owner_ref()))`,
          [randomBytes(32).toString("hex"), bSubscription])}`);
          return read;
        } finally {
          await c.query("ROLLBACK");
        }
      })).failures);
    }
    console.info(`F10 FRAME writes=${writes.join(";")} reads_failed=${failures.length}`);
    expect(failures).toEqual([]);
    // 42501: the row-security WITH CHECK refuses it (a login without INSERT on the table refuses with the same code).
    expect(writes).toEqual([...t1.map(({ name }) => `${name} bridge 42501`), ...t1.flatMap(({ name }) => [
      `${name} use-of-b-token 42501`, `${name} token-owned-by-b 42501`, `${name} own-token-naming-b 42501`])]);
  });

  it("S6.3-F11 (FIX-S01-p1a NEW-1, V-17) a row with no parent row stays unreadable after A inserts an own parent row carrying its key", async () => {
    // FIX-S01-p1a's orphan probe: each child keyed on its parent through a parent check, and no foreign key holds its
    // parent (an unmatched NETOPIA notice, a quarantined notice, a revocation whose token 0111's purge deleted, a saved
    // card whose customer row is gone). Measured before V-17's default: 0 → 1 on both runtime logins. Since the unpaid-plan
    // review no T1 login writes a billing parent under a context (refused, 42501), so the parents are then planted for A and
    // C by the superuser under their contexts, and each login counts again: V-17's `false` must still read 0.
    const su = database.pool;
    const C = await seedSessionAccount(su, "C");
    const hex = (n: number): string => randomBytes(n).toString("hex");
    const orderId = hex(16), quarantineOrder = hex(16), revokedToken = randomUUID(), noticeId = randomUUID();
    const orphanCustomer = randomUUID(), orphanToken = randomUUID();
    await su.query(`INSERT INTO billing.payment_notice(notice_id,payment_provider,payment_environment,received_at,body_sha256,
      key_fingerprint,allowed_ciphertext,key_id,order_id) VALUES($1,'netopia','sandbox',now(),$2,$3,$4,'0123456789abcdef',$5)`,
    [noticeId, hex(32), hex(32), randomBytes(16), orderId]);
    await su.query("INSERT INTO billing.payment_notice_outcome(notice_id,at,outcome) VALUES($1,now(),'APPLIED')", [noticeId]);
    await su.query("INSERT INTO billing.payment_notice_raw(notice_id,raw_ciphertext,key_id,stored_at) VALUES($1,$2,'0123456789abcdef',now())",
      [noticeId, randomBytes(16)]);
    await su.query(`INSERT INTO billing.notice_quarantine(quarantine_id,received_at,reason,raw_ciphertext,key_id,order_id)
      VALUES($1,now(),'NOTICE_HEADER_MISSING',$2,'0123456789abcdef',$3)`, [randomUUID(), randomBytes(16), quarantineOrder]);
    await su.query("INSERT INTO billing.card_token_revocation(token_id,at,reason) VALUES($1,now()-interval '3 days','OWNER')", [revokedToken]);
    const aCustomer = (await su.query("SELECT customer_id FROM billing.customer WHERE owner_ref=$1", [A.ownerRef])).rows[0]!.customer_id as string;
    const aCharge = (await su.query("SELECT charge_id FROM billing.charge WHERE owner_ref=$1 LIMIT 1", [A.ownerRef])).rows[0]!.charge_id as string;
    const aSub = (await su.query("SELECT subscription_id FROM billing.subscription_event WHERE owner_ref=$1 ORDER BY seq LIMIT 1",
      [A.ownerRef])).rows[0]!.subscription_id as string;
    await su.query(`INSERT INTO billing.card_token(token_id,payment_provider,payment_environment,token_ciphertext,key_id,created_at,
      customer_id,source_charge_id) VALUES($1,'netopia','sandbox',$2,'0123456789abcdef',now(),$3,$4)`,
    [orphanToken, randomBytes(16), orphanCustomer, aCharge]);
    const charge = (n: number) => `INSERT INTO billing.charge(charge_id,owner_ref,subscription_id,kind,attempt,period_start,
      period_end,net_micros,tax_micros,total_micros,currency,created_at,payment_environment,payment_provider)
      VALUES($1,(SELECT rls.context_owner_ref()),$2,'CARD_CHECK',${n},now(),now()+interval '30 days',0,0,0,'EUR',now(),'sandbox','netopia')`;
    const frames: string[] = [];
    const sides = [
      ["A", A, [[charge(1), [orderId, aSub]], [charge(2), [quarantineOrder, aSub]],
        [`INSERT INTO billing.card_token(token_id,payment_provider,payment_environment,token_ciphertext,key_id,created_at,customer_id,
          source_charge_id) VALUES($1,'netopia','sandbox',$2,'0123456789abcdef',now(),$3,$4)`, [revokedToken, randomBytes(16), aCustomer, aCharge]]],
      [["billing.payment_notice", "order_id", orderId], ["billing.payment_notice_outcome", "notice_id", noticeId],
        ["billing.payment_notice_raw", "notice_id", noticeId], ["billing.notice_quarantine", "order_id", quarantineOrder],
        ["billing.card_token_revocation", "token_id", revokedToken]]],
      ["C", C, [["INSERT INTO billing.customer(customer_id,owner_ref,created_at,created_locale) VALUES($1,(SELECT rls.context_owner_ref()),now(),'en')",
        [orphanCustomer]]], [["billing.card_token", "token_id", orphanToken]]]
    ] as const;
    // Each count in its own savepoint: a login without SELECT on a child refuses it (42501), and that refusal must not
    // abort the transaction the parent writes run in.
    const count = async (c: pg.Client, counts: (typeof sides)[number][3]): Promise<string> => {
      const parts: string[] = [];
      for (const [relation, column, key] of counts) {
        await c.query("SAVEPOINT count");
        try {
          parts.push(`${relation}=${(await c.query(`SELECT count(*)::int AS n FROM ${relation} WHERE ${column} = $1`, [key])).rows[0].n}`);
          await c.query("RELEASE SAVEPOINT count");
        } catch (error) {
          parts.push(`${relation}=refused-${(error as { code?: string }).code ?? "NO_SQLSTATE"}`);
          await c.query("ROLLBACK TO SAVEPOINT count");
        }
      }
      return parts.join(",");
    };
    for (const login of t1) {
      for (const [who, account, parents, counts] of sides) {
        await asLogin(login.url, async (c) => {
          await c.query(CREDENTIAL, [account.token]);
          await c.query("BEGIN");
          try {
            const before = await count(c, counts);
            const wrote: string[] = [];
            for (const [sql, values] of parents) wrote.push(await attempt(c, sql, values));
            frames.push(`${login.name} ${who} parents=${wrote.join(",")} before=${before} after=${await count(c, counts)}`);
          } finally {
            await c.query("ROLLBACK");
          }
        });
      }
    }
    for (const [, account, parents] of sides) {
      await asLogin(database.connectionString, async (c) => {
        await c.query(CREDENTIAL, [account.token]);
        for (const [sql, values] of parents) await c.query(sql, [...values]);
      });
    }
    for (const login of t1) {
      for (const [who, account, , counts] of sides) {
        await asLogin(login.url, async (c) => {
          await c.query(CREDENTIAL, [account.token]);
          await c.query("BEGIN");
          try {
            frames.push(`${login.name} ${who} planted before=${await count(c, counts)}`);
          } finally {
            await c.query("ROLLBACK");
          }
        });
      }
    }
    console.info(`F11 FRAME ${frames.join(" | ")}`);
    // A login without SELECT on a child refuses the count (42501); one with SELECT must count 0 before and after.
    const leaks = frames.filter((frame) => /=[1-9]/u.test(frame.replace(/^.* before=/u, "")));
    expect(leaks).toEqual([]);
    expect(frames.filter((frame) => / [AC] parents=42501(,42501)*( |$)/u.test(frame))).toHaveLength(2 * t1.length);
    expect(frames.filter((frame) => frame.includes(" planted before="))).toHaveLength(2 * t1.length);
  });

  it("S6.3-F12 (FIX-S01-p1a NEW-2, V-18) no own-account row a T1 login writes may name B's subscription, card, quote, run, entitlement or subscription event", async () => {
    // The class of NEW-2: an own row (its owner_ref A's, so the K2 key admits it) whose OTHER key names an entity of B
    // that a cross-account reader then acts on for B (cancelByToken and subscription_latest_v by subscription, the
    // renewal's usableSavedCard by card token, the invoice by quote, the funding pin by run and entitlement, the
    // withdrawal settlement by subscription and event). Each member is written twice in a rolled-back savepoint: naming
    // B's entity and naming A's own. Both are refused (42501) since the unpaid-plan review, which leaves a T1 login no
    // billing write under a context but the lazy Free entitlement (F13), so each outcome names the check that refused it:
    // V-18's guard (its RLS_ message; it fires before the WITH CHECK) or the policy. Naming A's own reaches the policy,
    // so a guard refusal of B's is the naming's.
    const su = database.pool;
    const first = async (sql: string, owner: string): Promise<string> => String((await su.query(sql, [owner])).rows[0]!.id);
    const ids = async (owner: string) => ({
      subscription: await first("SELECT subscription_id AS id FROM billing.subscription_event WHERE owner_ref=$1 ORDER BY seq LIMIT 1", owner),
      event: await first("SELECT event_id AS id FROM billing.subscription_event WHERE owner_ref=$1 ORDER BY seq LIMIT 1", owner),
      card: await first(`SELECT t.token_id AS id FROM billing.card_token t JOIN billing.customer c ON c.customer_id = t.customer_id
        WHERE c.owner_ref=$1 LIMIT 1`, owner),
      quote: await first("SELECT quote_id AS id FROM billing.quote WHERE owner_ref=$1 LIMIT 1", owner),
      entitlement: await first("SELECT event_id AS id FROM billing.entitlement_event WHERE owner_ref=$1 LIMIT 1", owner)
    });
    const a = await ids(A.ownerRef);
    const b = await ids(B.ownerRef);
    // billing.quote_use holds one row per quote, so each side gets a quote no use names yet (copied from its seeded one).
    const unusedQuote = async (quote: string): Promise<string> => {
      const id = randomUUID();
      await su.query(`INSERT INTO billing.quote(quote_id,owner_ref,plan_id,kind,net_micros,tax_micros,total_micros,tax_country,
        tax_rate_bp,tax_status,tax_name,created_at,expires_at,location_ciphertext,key_id,currency) SELECT $2,owner_ref,plan_id,kind,
        net_micros,tax_micros,total_micros,tax_country,tax_rate_bp,tax_status,tax_name,now(),now()+interval '1 hour',
        location_ciphertext,key_id,currency FROM billing.quote WHERE quote_id=$1`, [quote, id]);
      return id;
    };
    const unused = { a: await unusedQuote(a.quote), b: await unusedQuote(b.quote) };
    // Review F3: card_token.customer_id has no foreign key, so a card of B whose customer row is gone can come to carry
    // A's customer_id (A takes the freed id in its own customer row). Planted here directly: B's card, A's customer, B's
    // source charge. Its source charge is still B's, so the card is still not A's to name.
    const retaken = randomUUID();
    await su.query(`INSERT INTO billing.card_token(token_id,payment_provider,payment_environment,token_ciphertext,key_id,created_at,
      customer_id,source_charge_id) SELECT $2,payment_provider,payment_environment,token_ciphertext,key_id,now(),
      (SELECT customer_id FROM billing.customer WHERE owner_ref=$3),source_charge_id FROM billing.card_token WHERE token_id=$1`,
    [b.card, retaken, A.ownerRef]);
    // A test-tool order's card has no source charge (0111's card_token_one_source), and nothing stops it carrying a
    // customer_id. Planted with A's: no charge of A's saved it, so it is not A's to name either.
    const toolCard = randomUUID();
    await su.query(`INSERT INTO billing.card_token(token_id,payment_provider,payment_environment,token_ciphertext,key_id,created_at,
      customer_id,source_tool_order) SELECT $2,payment_provider,payment_environment,token_ciphertext,key_id,now(),customer_id,$3
      FROM billing.card_token WHERE token_id=$1`, [a.card, toolCard, `t-${randomBytes(15).toString("hex")}`]);
    const ctx = "(SELECT rls.context_owner_ref())";
    const netopia = JSON.stringify({ payment_provider: "netopia", payment_environment: "sandbox" });
    // 0086's checks: a CARD_CHECK carries no quote and may be zero; any other kind carries one and is positive. Every
    // member write below is undone in its savepoint, so attempt 1 never meets charge_attempt_unique.
    const charge = (subscription: string, quote: string | null): Statement => [`INSERT INTO billing.charge(charge_id,owner_ref,
      subscription_id,kind,attempt,period_start,period_end,net_micros,tax_micros,total_micros,currency,created_at,payment_environment,
      payment_provider,quote_id) VALUES($1,${ctx},$2,'${quote === null ? "CARD_CHECK" : "INITIAL"}',1,now(),now()+interval '30 days',
      ${quote === null ? "0,0,0" : "10000,0,10000"},'EUR',now(),'sandbox','netopia',$3)`, [randomBytes(16).toString("hex"), subscription, quote]];
    const settlement = (subscription: string, event: string): Statement => [`INSERT INTO billing.withdrawal_owner_settlement(
      subscription_id,withdrawn_event_id,owner_ref,dashboard_refund_micros,settled_at) VALUES($1,$2,${ctx},0,now())`, [subscription, event]];
    const scope = (run: string, entitlement: string): Statement => [`INSERT INTO billing.run_charge_scope(run_id,owner_ref,
      admitted_at,funding_kind,plan_id,entitlement_event_id) VALUES($1,${ctx},now(),'SUBSCRIPTION','FREE',$2)`, [run, entitlement]];
    const outcomes: string[] = [];
    for (const login of t1) {
      await asLogin(login.url, async (c) => {
        await c.query(CREDENTIAL, [A.token]);
        await c.query("BEGIN");
        try {
          // One statement in a savepoint, always undone: ACCEPTED, or the SQLSTATE and the check that refused it.
          const refusal = async ([sql, values]: Statement): Promise<string> => {
            await c.query("SAVEPOINT member");
            try {
              await c.query(sql, [...values]);
              return "ACCEPTED";
            } catch (error) {
              const e = error as { code?: string; message?: string };
              const message = e.message ?? "";
              return `${e.code ?? "NO_SQLSTATE"}:${/^RLS_[A-Z_]+$/u.test(message) ? message
                : /violates row-level security policy/u.test(message) ? "policy" : message.slice(0, 60)}`;
            } finally {
              await c.query("ROLLBACK TO SAVEPOINT member");
            }
          };
          // A fresh own subscription with its first event (a new subscription is A's to name, but no longer A's to make
          // under a context), for the settlement's pair, and an own CARD_CHECK charge on it for quote_use's.
          const fresh = { subscription: randomUUID(), event: randomUUID() };
          const freshMade = await attempt(c, `INSERT INTO billing.subscription_event(event_id,subscription_id,owner_ref,kind,at,plan_id,data)
            VALUES($1,$2,${ctx},'CREATED',now(),'PLUS',$3::jsonb)`, [fresh.event, fresh.subscription, netopia]);
          const event = (kind: string, subscription: string, card: string | null): Statement => [`INSERT INTO billing.subscription_event(
            event_id,subscription_id,owner_ref,kind,at,plan_id,data,card_token_id) VALUES($1,$2,${ctx},'${kind}',now(),'PLUS',$3::jsonb,$4)`,
          [randomUUID(), subscription, netopia, card]];
          const link = (subscription: string): Statement => [`INSERT INTO billing.cancel_token(token_sha256,subscription_id,issued_at,
            expires_at,owner_ref) VALUES($1,$2,now(),now()+interval '1 day',${ctx})`, [randomBytes(32).toString("hex"), subscription]];
          const entitlement = (subscription: string): Statement => [`INSERT INTO billing.entitlement_event(event_id,owner_ref,plan_id,
            effective_at,period_anchor_at,cause,subscription_id,paid_through) VALUES($1,${ctx},'PLUS',now(),now(),'SUBSCRIBED',$2,
            now()+interval '30 days')`, [randomUUID(), subscription]];
          const useCharge = randomBytes(16).toString("hex");
          const useChargeMade = await attempt(c, `INSERT INTO billing.charge(charge_id,owner_ref,subscription_id,kind,attempt,period_start,
            period_end,net_micros,tax_micros,total_micros,currency,created_at,payment_environment,payment_provider) VALUES($1,${ctx},$2,
            'CARD_CHECK',1,now(),now()+interval '30 days',0,0,0,'EUR',now(),'sandbox','netopia')`, [useCharge, fresh.subscription]);
          if ((await su.query("SELECT has_table_privilege($1, 'billing.subscription_event', 'INSERT') AS may", [login.name])).rows[0].may) {
            outcomes.push(`${login.name} fresh-subscription=${freshMade} use-charge=${useChargeMade}`);
          }
          const use = (quote: string): Statement => [`INSERT INTO billing.quote_use(quote_id,used_at,charge_id) VALUES($1,now(),$2)`,
            [quote, useCharge]];
          const members: ReadonlyArray<readonly [string, Statement, Statement]> = [
            ["billing.subscription_event.subscription_id", event("CANCEL_REQUESTED", b.subscription, null), event("CANCEL_REQUESTED", a.subscription, null)],
            ["billing.subscription_event.card_token_id", event("CARD_SAVED", a.subscription, b.card), event("CARD_SAVED", a.subscription, a.card)],
            ["billing.subscription_event.card_token_id(retaken)", event("CARD_SAVED", a.subscription, retaken), event("CARD_SAVED", a.subscription, a.card)],
            ["billing.subscription_event.card_token_id(tool order)", event("CARD_SAVED", a.subscription, toolCard), event("CARD_SAVED", a.subscription, a.card)],
            ["billing.cancel_token.subscription_id", link(b.subscription), link(a.subscription)],
            ["billing.charge.subscription_id", charge(b.subscription, null), charge(a.subscription, null)],
            ["billing.charge.quote_id", charge(a.subscription, b.quote), charge(a.subscription, a.quote)],
            ["billing.quote_use.quote_id", use(unused.b), use(unused.a)],
            ["billing.entitlement_event.subscription_id", entitlement(b.subscription), entitlement(a.subscription)],
            ["billing.run_charge_scope.run_id", scope(B.runId, a.entitlement), scope(A.runId, a.entitlement)],
            ["billing.run_charge_scope.entitlement_event_id", scope(A.runId, b.entitlement), scope(A.runId, a.entitlement)],
            ["billing.withdrawal_owner_settlement.subscription_id", settlement(b.subscription, fresh.event), settlement(fresh.subscription, fresh.event)],
            ["billing.withdrawal_owner_settlement.withdrawn_event_id", settlement(fresh.subscription, b.event), settlement(fresh.subscription, fresh.event)]
          ];
          for (const [member, [badSql, badValues], [ownSql, ownValues]] of members) {
            const table = member.split(".").slice(0, 2).join(".");
            const may = (await su.query("SELECT has_table_privilege($1, $2::regclass, 'INSERT') AS may", [login.name, table])).rows[0].may as boolean;
            if (!may) continue;
            outcomes.push(`${login.name} ${member} naming-b=${await refusal([badSql, badValues])} naming-own=${await refusal([ownSql, ownValues])}`);
          }
        } finally {
          await c.query("ROLLBACK");
        }
      });
    }
    console.info(`F12 FRAME ${outcomes.join(" | ")}`);
    // Who refuses naming B's: V-18's guard where it checks the member (an entitlement is refused whole first: F13's rule),
    // the policy where V-18's check was the policy's (charge.quote_id, run_charge_scope) or names a subscription with no
    // event (the fresh one, which A could not make).
    const guard = (message: string): string => `42501:${message}`;
    const members: ReadonlyArray<readonly [string, string]> = [
      ["billing.subscription_event.subscription_id", guard("RLS_FOREIGN_SUBSCRIPTION")],
      ["billing.subscription_event.card_token_id", guard("RLS_FOREIGN_CARD_TOKEN")],
      ["billing.subscription_event.card_token_id(retaken)", guard("RLS_FOREIGN_CARD_TOKEN")],
      ["billing.subscription_event.card_token_id(tool order)", guard("RLS_FOREIGN_CARD_TOKEN")],
      ["billing.cancel_token.subscription_id", guard("RLS_FOREIGN_SUBSCRIPTION")],
      ["billing.charge.subscription_id", guard("RLS_FOREIGN_SUBSCRIPTION")],
      ["billing.charge.quote_id", "42501:policy"],
      ["billing.quote_use.quote_id", guard("RLS_FOREIGN_QUOTE")],
      ["billing.entitlement_event.subscription_id", guard("RLS_UNPAID_ENTITLEMENT")],
      ["billing.run_charge_scope.run_id", "42501:policy"],
      ["billing.run_charge_scope.entitlement_event_id", "42501:policy"],
      ["billing.withdrawal_owner_settlement.subscription_id", guard("RLS_FOREIGN_SUBSCRIPTION")],
      ["billing.withdrawal_owner_settlement.withdrawn_event_id", "42501:policy"]];
    expect(outcomes).toEqual(["debateai_dev_runtime", "debateai_prod_api_runtime"].flatMap((login) => [
      `${login} fresh-subscription=42501 use-charge=42501`,
      ...members.map(([member, namingB]) => `${login} ${member} naming-b=${namingB} naming-own=${
        member.startsWith("billing.entitlement_event.") ? guard("RLS_UNPAID_ENTITLEMENT") : "42501:policy"}`)]));
  });

  it("S6.3-F13 under its own context a T1 login adds no billing state a payment does not back: an own MAX entitlement is refused and person_windows_v stays Free, while the lazy Free entitlement is still accepted", async () => {
    // The independent review's case: debateai_billing_runtime gives both runtime logins INSERT on every billing table, and
    // an own MAX entitlement (cause SUBSCRIBED, paid through ten years out, no subscription) made person_windows_v read MAX.
    // The one billing row a T1 login writes under a context is EntitlementRepository.current's lazy Free (the ask room's
    // `pool`, apps/api/src/main.ts); checkout, renewal, settlement and the charge scope write on api-system. Each forgery runs
    // in a rolled-back transaction of A's context; the lazy Free runs through the product's repository on a pool built as
    // main.ts builds `pool`, for an account with no billing row yet (one per login: the Free row is one per account).
    const su = database.pool;
    const ctx = "(SELECT rls.context_owner_ref())";
    const outcomes: string[] = [];
    for (const login of t1) {
      if (!(await su.query("SELECT has_table_privilege($1, 'billing.entitlement_event', 'INSERT') AS may", [login.name])).rows[0].may) continue;
      await asLogin(login.url, async (c) => {
        await c.query(CREDENTIAL, [A.token]);
        await c.query("BEGIN");
        try {
          const max = await attempt(c, `INSERT INTO billing.entitlement_event(event_id,owner_ref,plan_id,effective_at,period_anchor_at,
            cause,subscription_id,paid_through) VALUES($1,${ctx},'MAX',now(),now(),'SUBSCRIBED',NULL,now()+interval '10 years')`, [randomUUID()]);
          const view = (await c.query(`SELECT plan_id FROM billing.person_windows_v WHERE owner_ref=${ctx}`)).rows[0]?.plan_id ?? "none";
          const quote = await attempt(c, `INSERT INTO billing.quote(quote_id,owner_ref,plan_id,kind,net_micros,tax_micros,total_micros,
            tax_country,tax_rate_bp,tax_status,tax_name,created_at,expires_at,location_ciphertext,key_id,currency) SELECT $1,${ctx},'MAX',
            kind,0,0,0,tax_country,tax_rate_bp,tax_status,tax_name,now(),now()+interval '1 hour',location_ciphertext,key_id,currency
            FROM billing.quote WHERE owner_ref=$2 LIMIT 1`, [randomUUID(), A.ownerRef], true);
          outcomes.push(`${login.name} max=${max} view=${view} zero-quote=${quote}`);
        } finally {
          await c.query("ROLLBACK");
        }
      });
      const fresh = await seedSessionAccount(su, `F13-${login.name}`);
      const forgedAnchor = await asLogin(login.url, async (c) => {
        await c.query(CREDENTIAL, [fresh.token]);
        await c.query("BEGIN");
        try {
          return await attempt(c, `INSERT INTO billing.entitlement_event(event_id,owner_ref,plan_id,effective_at,period_anchor_at,cause)
            VALUES($1,${ctx},'FREE',now(),now(),'SIGNED_UP_FREE')`, [randomUUID()]);
        } finally {
          await c.query("ROLLBACK");
        }
      });
      const target = createPool(login.systemUrl, { max: 1 });
      const routed = createPool(login.url, { max: 1, crossAccount: target });
      ownPools.push(routed, target);
      const lazy = await runInRequestScope(async () => {
        setRequestCredential(fresh.token);
        return new EntitlementRepository(routed).current(fresh.ownerRef, new Date()).then((e) => `${e.planId}`, (e) => `refused-${e.code ?? e.message}`);
      });
      const stored = (await su.query(`SELECT e.cause FROM billing.entitlement_event e JOIN identity."user" u ON u.owner_ref=e.owner_ref
        WHERE e.owner_ref=$1 AND e.plan_id='FREE' AND e.subscription_id IS NULL AND e.effective_at=u.created_at AND e.period_anchor_at=u.created_at`,
      [fresh.ownerRef])).rows.map((row) => row.cause as string);
      outcomes.push(`${login.name} free-at-chosen-anchor=${forgedAnchor} lazy-free=${lazy} stored=${stored.join(",") || "none"}`);
    }
    console.info(`F13 FRAME ${outcomes.join(" | ")}`);
    expect(outcomes).toEqual(["debateai_dev_runtime", "debateai_prod_api_runtime"].flatMap((login) => [
      `${login} max=42501 view=FREE zero-quote=42501`,
      `${login} free-at-chosen-anchor=42501 lazy-free=FREE stored=SIGNED_UP_FREE`]));
  });

  it("S6.3-F14 (V-18 on the engine tables) no own-run row a T1 login writes may name a run, node, artifact, ledger entry, judgement, propagation, answer, review, work item or routing of B", async () => {
    // F12's class on core, ledger, serve, memory and scorecard: each rls_account policy there checks the row's own run
    // (or the parent it keys on), not the OTHER entities the row names, which a cross-account reader then follows (the
    // runner's snapshot takes B's node's score from any judgement naming it, the data export worker reads an answer's
    // fact bundle and composed text by id, B's projection reads a stranger check, a reversal point or a served number by
    // the id A named). A fresh account E writes the seed's own row of every engine table under its own context, rolled
    // back (as S6.2-R23). Before each member's table is written, its row is written once to a template and rolled back,
    // then twice more in a rolled-back savepoint: naming B's entity (refused, 42501, by core.guard_own_references) and
    // naming E's own (accepted: the statement is valid, so the refusal is the naming's). A member whose parent the seed
    // writes later is tried after the whole world. `already` members are the class's measured non-members, refused by
    // an older check before the guard: the supersession guard (one principal), the answer-run triggers of answer_story
    // and serve_disclosure, and node_review's lineage triggers, which read B's node and artifacts under the writer's own
    // row security. Left out, nothing following them: work_item.settled_* (the projection projects no column of the
    // matched item), serve_disclosure.floor_leading_node_id (publishing refuses a node outside the answer), the text
    // subject refs of review_clock and revision_trigger (read by run), and the provider and model refs (global).
    // `tag` names a second variant of one column; `extra` sets more columns (it wins over the named values).
    type EngineMember = Readonly<{ table: string; columns: readonly string[]; parent: string; parentColumns: readonly string[];
      tag?: string; list?: true; late?: true; already?: string; extra?: (values: readonly unknown[]) => Record<string, unknown> }>;
    // How a consumer that casts text to uuid still reads B's id: braced and upper case.
    const braced = (value: unknown): string => `{${String(value).toUpperCase()}}`;
    const node = ["core.node", ["node_id"]] as const;
    const artifact = ["ledger.raw_artifact", ["raw_artifact_id"]] as const;
    const propagation = ["ledger.propagation_run", ["propagation_run_id"]] as const;
    const answer = ["serve.answer", ["answer_id", "answer_version"]] as const;
    const answerId = ["serve.answer", ["answer_id"]] as const;
    const run = ["core.run", ["run_id"]] as const;
    const member = (table: string, columns: readonly string[], [parent, parentColumns]: readonly [string, readonly string[]],
      flags: Omit<EngineMember, "table" | "columns" | "parent" | "parentColumns"> = {}): EngineMember =>
      ({ table, columns, parent, parentColumns, ...flags });
    const members: readonly EngineMember[] = [
      // 0011's checks: a critic entry comes with its sequence.
      member("core.independence_receipt", ["critic_ledger_entry_ref"], ["ledger.ledger_entry", ["ledger_entry_id"]],
        { late: true, extra: () => ({ critic_at_seq: 1 }) }),
      member("core.node", ["provenance_ref"], artifact),
      member("core.reversal_point", ["value_hinge_id"], ["core.value_hinge", ["value_hinge_id"]]),
      member("core.run_supersession", ["new_run_id"], run, { already: "23514" }),
      member("core.staleness_state", ["subject_ref"], answerId),
      // The subject columns name a node or an answer whatever their kind column says.
      member("core.staleness_state", ["subject_ref"], node, { tag: "NODE", extra: () => ({ subject_kind: "NODE" }) }),
      member("core.staleness_state", ["subject_ref"], answerId, { tag: "braced", extra: (values) => ({ subject_ref: braced(values[0]) }) }),
      member("core.stranger_restatement", ["subject_id"], node),
      member("core.stranger_restatement", ["subject_id"], node, { tag: "verdict", extra: () => ({ subject_kind: "verdict" }) }),
      member("ledger.ledger_entry", ["raw_artifact_ref"], artifact),
      member("ledger.node_review", ["node_id"], node, { already: "P0001" }),
      member("ledger.node_review", ["author_raw_artifact_ref"], artifact, { already: "P0001" }),
      member("ledger.node_review", ["review_raw_artifact_ref"], artifact, { already: "P0001" }),
      member("ledger.node_review", ["node_id", "author_raw_artifact_ref", "review_raw_artifact_ref"],
        ["ledger.node_review", ["node_id", "author_raw_artifact_ref", "review_raw_artifact_ref"]], { already: "P0001" }),
      member("ledger.node_strength_record", ["propagation_run_id"], propagation),
      member("ledger.node_strength_record", ["reduced_judgement_ref"], ["ledger.reduced_judgement", ["reduced_judgement_id"]]),
      member("ledger.overlay_run", ["propagation_run_id"], propagation),
      // 0121's checks: an artifact belongs to an investigated outcome, which names its investigator and basis.
      member("ledger.point_investigation", ["raw_artifact_ref"], artifact, { extra: () => ({ result: "HOLDS", basis: "established",
        maker: "maker-rls", provider_ref: "provider-rls", model_id: "model-rls" }) }),
      member("ledger.reduced_judgement", ["node_id"], node),
      member("ledger.reduced_judgement", ["raw_artifact_ref"], artifact),
      member("ledger.reduced_judgement", ["selected_judgement_ref"], artifact),
      member("ledger.sensitivity_record", ["propagation_run_id"], propagation),
      member("ledger.verdict_vote", ["raw_artifact_ref"], artifact),
      // A new version under B's answer_id: the primary key is (answer_id, answer_version).
      member("serve.answer", ["answer_id"], answerId, { extra: () => ({ answer_version: 99 }) }),
      member("serve.answer", ["work_item_id"], ["core.work_item", ["work_item_id"]]),
      member("serve.answer", ["fact_bundle_id"], ["serve.fact_bundle", ["fact_bundle_id"]]),
      member("serve.answer", ["composed_text_id"], ["serve.composed_text", ["composed_text_id"]]),
      member("serve.answer", ["conformance_record_id"], ["serve.conformance_record", ["conformance_record_id"]]),
      member("serve.answer_story", ["answer_id", "answer_version"], answer, { already: "23503" }),
      member("serve.answer_story", ["artifact_refs"], artifact, { list: true }),
      member("serve.answer_story", ["artifact_refs"], artifact, { tag: "braced", extra: (values) => ({ artifact_refs: [braced(values[0])] }) }),
      member("serve.composed_text", ["fact_bundle_id"], ["serve.fact_bundle", ["fact_bundle_id"]]),
      // 0053's check: a reviewed mark's subject is the reviewed node.
      member("serve.condition_mark", ["review_ref", "review_node_ref", "review_outcome"], ["ledger.node_review", ["node_review_id", "node_id",
        "outcome"]], { extra: (values) => ({ subject_ref: values[1] }) }),
      member("serve.condition_mark_node", ["condition_mark_id"], ["serve.condition_mark", ["condition_mark_id"]]),
      member("serve.conformance_record", ["raw_artifact_refs"], artifact, { list: true }),
      member("serve.serve_disclosure", ["answer_id", "answer_version"], answer, { already: "23503" }),
      member("serve.served_number", ["provenance_ref"], propagation),
      member("serve.served_number", ["answer_id"], answerId),
      // B's answer already has its round 1 (unique per answer version and round).
      member("serve.synthesis_round", ["answer_id", "answer_version"], answer, { extra: () => ({ round: 2 }) }),
      member("serve.synthesis_round", ["candidate_artifact_ref"], artifact),
      member("serve.synthesis_round", ["evaluator_artifact_ref"], artifact),
      member("memory.alias_row", ["source_run_id"], run),
      member("memory.candidate_record", ["prior_run_id"], run),
      member("memory.memory_link", ["prior_run_id"], run),
      member("memory.memory_link", ["prior_answer_id"], answerId),
      member("memory.memory_link", ["alias_row_ids"], ["memory.alias_row", ["alias_row_id"]], { list: true }),
      member("scorecard.session_assignment", ["routing_decision_id"], ["scorecard.routing_decision", ["routing_decision_id"]])
    ];
    const label = (m: EngineMember): string => `${m.table}.${m.columns.join("+")}${m.tag === undefined ? "" : `(${m.tag})`}`;
    const su = database.pool;
    const keyOf = (relation: string): string => shapes.find((s) => s.relation === relation)!.columns.map((c) => `t."${c}"`).join(",");
    const valuesOf = (row: Record<string, unknown>, columns: readonly string[]): unknown[] => columns.map((c) => row[c]);
    // B's entity: the parent's first seeded row of B, its columns as JSON values.
    const ofB = new Map<string, unknown[]>();
    for (const m of members) {
      ofB.set(label(m), m.parent === "core.run" ? [B.runId] : valuesOf((await su.query(`SELECT ${m.parentColumns.map((c) =>
        `to_jsonb(t."${c}") AS "${c}"`).join(",")} FROM ${m.parent} t WHERE jsonb_build_array(${keyOf(m.parent)})::text = $1`,
      [report.keys.get(m.parent)!.b[0]])).rows[0]!, m.parentColumns));
    }
    const E = await seedSessionAccount(su, "E");
    const world = await prepareRlsSeedWorld(su, E, "E");
    const insertable = async (login: string, relation: string): Promise<readonly string[]> =>
      (await su.query(`SELECT attname::text AS name FROM pg_attribute WHERE attrelid = $2::regclass AND attnum > 0 AND NOT attisdropped
        AND attgenerated = '' AND attidentity <> 'a' AND has_column_privilege($1, attrelid, attname, 'INSERT')`, [login, relation]))
        .rows.map((row) => row.name as string);
    const patch = (m: EngineMember, values: readonly unknown[]): Record<string, unknown> => ({
      ...Object.fromEntries(m.columns.map((c, i) => [c, m.list === true ? [values[i]] : values[i]])), ...m.extra?.(values) });
    // The row again with the member's columns patched, through the columns the login may INSERT (the rest keep defaults).
    const copy = (columns: readonly string[], table: string, row: Record<string, unknown>): Statement => {
      const listed = Object.keys(row).filter((c) => columns.includes(c)).map((c) => `"${c}"`).join(",");
      return [`INSERT INTO ${table}(${listed}) SELECT ${listed} FROM jsonb_populate_record(NULL::${table}, $1::jsonb)`, [JSON.stringify(row)]];
    };
    // "ACCEPTED", "42501" when the guard refused it, or "REFUSED <SQLSTATE>" for any other refusal (its message goes to
    // `messages`); always rolled back.
    const messages: string[] = [];
    const tryWrite = async (c: pg.Client, [sql, values]: Statement): Promise<string> => {
      await c.query("SAVEPOINT member");
      try {
        await c.query(sql, [...values]);
        return "ACCEPTED";
      } catch (error) {
        const e = error as { code?: string; message?: string };
        if (e.code === "42501" && e.message?.startsWith("RLS_FOREIGN_REFERENCE ")) return "42501";
        messages.push(`${e.code ?? "NO_SQLSTATE"} ${e.message ?? String(error)}`);
        return `REFUSED ${e.code ?? "NO_SQLSTATE"}`;
      } finally {
        await c.query("ROLLBACK TO SAVEPOINT member");
      }
    };
    // E's own entity: the template's own values, or else a row of the parent E's context reads (E's alone).
    const ofOwn = async (c: pg.Client, m: EngineMember, template: Record<string, unknown>): Promise<unknown[]> =>
      m.list !== true && m.columns.every((col) => template[col] !== null && template[col] !== undefined) ? valuesOf(template, m.columns)
        : m.parent === "core.run" ? [world.runs.sOld]
        : valuesOf((await c.query(`SELECT ${m.parentColumns.map((col) => `to_jsonb(t."${col}") AS "${col}"`).join(",")} FROM ${m.parent} t
          LIMIT 1`)).rows[0] ?? {}, m.parentColumns);
    const outcomes: string[] = [];
    const expected: string[] = [];
    const failures: string[] = [];
    for (const login of t1) {
      await asLogin(login.url, async (c) => {
        await c.query(CREDENTIAL, [E.token]);
        await c.query("BEGIN");
        try {
          const base = await rlsSeedInserter(c);
          const templates = new Map<string, Record<string, unknown>>();
          const capture: RlsSeedInsert = async (relation, sql, values) => {
            const row = await base(relation, sql, values);
            templates.set(relation, (await c.query(`SELECT to_jsonb(t) AS row FROM ${relation} t
              WHERE jsonb_build_array(${keyOf(relation)})::text = $1`, [row.rls_identity])).rows[0].row as Record<string, unknown>);
            return row;
          };
          const own = { ...world, made: new Map(world.made) };
          const tried = async (m: EngineMember): Promise<void> => {
            const template = templates.get(m.table);
            if (template === undefined) { failures.push(`${login.name} ${label(m)} no-template`); return; }
            const columns = await insertable(login.name, m.table);
            // A late template's sequence was handed out again once its savepoint rolled the allocator back.
            const row = m.late === true && "at_seq" in template
              ? { ...template, at_seq: (await c.query("SELECT ledger.allocate_sequence() AS s")).rows[0].s } : template;
            const named = await tryWrite(c, copy(columns, m.table, { ...row, ...patch(m, ofB.get(label(m))!) }));
            const owned = await tryWrite(c, copy(columns, m.table, { ...row, ...patch(m, await ofOwn(c, m, template)) }));
            outcomes.push(`${login.name} ${label(m)} naming-b=${named} naming-own=${owned}`);
            expected.push(`${login.name} ${label(m)} naming-b=${m.already === undefined ? "42501" : `REFUSED ${m.already}`} naming-own=ACCEPTED`);
          };
          const late: EngineMember[] = [];
          for (const step of RLS_SEED_STEPS) {
            if (!/^(core|ledger|serve|memory|scorecard)\./u.test(step.relation)) continue;
            if ((await insertable(login.name, step.relation)).length === 0) continue;
            const of = members.filter((m) => m.table === step.relation);
            if (of.length > 0) {
              await c.query("SAVEPOINT template");
              try {
                await step.run(capture, c, own);
              } catch (error) {
                failures.push(`${login.name} ${step.relation} template ${(error as { code?: string }).code ?? String(error)}`);
              }
              await c.query("ROLLBACK TO SAVEPOINT template");
              for (const m of of) if (m.late === true) late.push(m); else await tried(m);
            }
            await c.query("SAVEPOINT step");
            try {
              await step.run(base, c, own);
              await c.query("RELEASE SAVEPOINT step");
            } catch (error) {
              await c.query("ROLLBACK TO SAVEPOINT step");
              failures.push(`${login.name} ${step.relation} step ${(error as { code?: string }).code ?? String(error)}`);
            }
          }
          for (const m of late) await tried(m);
        } finally {
          await c.query("ROLLBACK");
        }
      });
    }
    console.info(`F14 FRAME ${outcomes.join(" | ")}${failures.length > 0 ? ` FAILURES ${failures.join(" | ")}` : ""}`);
    console.info(`F14 REFUSALS ${[...new Set(messages.map((m) => m.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gu, "<uuid>")))].join(" | ")}`);
    expect(failures).toEqual([]);
    // All four T1 logins may INSERT the engine tables (the authorization logins too), so every one is tried.
    expect(new Set(outcomes.map((line) => line.split(" ")[0]))).toEqual(new Set(t1.map(({ name }) => name)));
    expect([...outcomes].sort()).toEqual([...expected].sort());
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
