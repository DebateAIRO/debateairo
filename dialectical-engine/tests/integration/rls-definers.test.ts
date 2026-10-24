/**
 * Row-level security S01, cluster C7, steps S7.2 and S7.3 (PLAN.md S7.2, S7.3, §7; SPEC-v4 R14 F7, R20, R36, R42, T11,
 * X15-X17; DECISIONS D39, D45).
 *
 * S7.2 (R42, D39): the four `rls` functions a T1 login may EXECUTE, called by each of the four T1 logins (T9: the dev
 * runtime and authorization logins and their production namesakes, provisioned by the product's own provisioners) under
 * A's live credential, under no credential and under each of the seven forged kinds of S3.2-c (R9), with R42's call set
 * built as the reference harness `probes/REQ-FIX-RLS-3/p4-probe.mts` (function `v4`) builds it: the T3 call, one call per
 * parameter, the mixed call per parameter, the all-of-B call and the all-NULL call. D39's columns: `owns_run(p_run_id)`
 * compares `core.run.run_id` (a T3 key), `owns_execution_ref(p_execution_ref)` compares
 * `identity.run_execution_binding.execution_ref` (not a T3 key); the context functions take no parameter; no secret
 * exception (T11). A's and B's values are read as the superuser from their seeded rows. `rls.session_credential_hash()`
 * is EXECUTE-able by no T1 login.
 *
 * S7.3 (R20, D45): the 25 owner-role objects PLAN §7 marks "R35 base/head call", each called with the same arguments
 * with row security off (the base emulation of D45: row security disabled on the 110 in-scope tables and
 * security_invoker reset on the 3 views, inside a savepoint) and on (head), in one transaction that is rolled back, so
 * both calls see the same rows and the same now(); results compared EXACT.
 *
 * Refutation hook (C7 handoff): RLS_C7_MUTANT_SQL, when set, is run as the superuser after seeding — the reverted,
 * never-committed database change a mutant run applies (a function body, a grant, a policy role list), so a mutant
 * changes this file's throwaway cluster only and never the lane other seats share.
 */
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { rlsRelationSql, seedRlsRows } from "../../tools/rls/seed.js";
import { provisionRlsLogins, seedSessionAccount, type RlsLogins, type RlsTestAccount } from "../support/rls-logins.js";
import { RLS_IN_SCOPE } from "../support/rls-scope.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

type T1Login = Readonly<{ name: string; url: string }>;
type Context = Readonly<{ kind: string; value: string | null }>;
/** One R42 call: its call-set label and its arguments (null = SQL NULL). */
type R42Call = Readonly<{ label: string; args: readonly (string | null)[] }>;
/** One function of D39: its SQL call text and the R42 calls R42's rule derives from its parameters. */
type R42Function = Readonly<{ signature: string; sql: string; calls: readonly R42Call[] }>;

/** One S7.3 object: PLAN §7's row number, its signature, its owner, and the call its R20 caller makes. */
type BaseHeadObject = Readonly<{ n: number; object: string; owner: string; call: (q: pg.PoolClient) => Promise<unknown> }>;

const CREDENTIAL = "SELECT set_config('debateai.session_credential', $1, false)";
/** A content envelope as core.is_content_envelope accepts it (the seed's shape). */
const ENVELOPE = Object.freeze({ v: 1, keyId: "staff-alert:rls-c7:v1", nonce: "bm9uY2U", ct: "Y3Q", tag: "dGFn" });

let database: TestDatabase;
let logins: RlsLogins;
let A: RlsTestAccount;
let B: RlsTestAccount;
let t1: readonly T1Login[];
/** A's and B's values of D39's compared columns, read as the superuser from their seeded rows. */
let values: Readonly<Record<"a" | "b", Readonly<{ runId: string; executionRef: string }>>>;
/** S7.3's fixture: B is a staff subject; A holds an internal grant funding two runs (one with a live hold). */
let fixture: Readonly<{
  staffB: string; emailChannelA: string; grantA: string; grantEventA: string; internalRuns: readonly [string, string];
}>;

async function asLogin<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000, statement_timeout: 30_000 });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

/** A's live credential, no credential, and the seven forged kinds of S3.2-c (R9). */
function contexts(): readonly Context[] {
  return Object.freeze([
    { kind: "A", value: A.token },
    { kind: "none", value: null },
    { kind: "random-32-bytes", value: randomBytes(32).toString("base64url") },
    { kind: "b-session-id", value: B.sessionId },
    { kind: "b-stored-token-hash", value: B.tokenHash },
    { kind: "b-revoked-token", value: B.revokedToken },
    { kind: "b-expired-token", value: B.expiredToken },
    { kind: "empty-string", value: "" },
    { kind: "b-csrf-token", value: B.csrfToken }
  ]);
}

/**
 * R42's call set for a function whose parameters compare the columns `compared` (B's and A's values), with `isT3[i]`
 * true when parameter i is compared to a T3 key — p4-probe.mts `v4`, verbatim in shape.
 */
function r42Calls(b: readonly string[], a: readonly string[], isT3: readonly boolean[]): readonly R42Call[] {
  const n = b.length;
  const calls: R42Call[] = [{ label: "t3", args: b.map((v, i) => (isT3[i] ? v : null)) }];
  for (let i = 0; i < n; i++) calls.push({ label: `per-parameter-${i + 1}`, args: b.map((v, j) => (j === i ? v : null)) });
  for (let i = 0; i < n; i++) calls.push({ label: `mixed-${i + 1}`, args: b.map((v, j) => (j === i ? v : a[j]!)) });
  calls.push({ label: "all-of-b", args: [...b] });
  calls.push({ label: "all-null", args: b.map(() => null) });
  return Object.freeze(calls);
}

function r42Functions(): readonly R42Function[] {
  return Object.freeze([
    { signature: "rls.context_user_id()", sql: "SELECT rls.context_user_id()::text AS v", calls: r42Calls([], [], []) },
    { signature: "rls.context_owner_ref()", sql: "SELECT rls.context_owner_ref()::text AS v", calls: r42Calls([], [], []) },
    { signature: "rls.owns_run(uuid)", sql: "SELECT rls.owns_run($1::uuid)::text AS v",
      calls: r42Calls([values.b.runId], [values.a.runId], [true]) },
    { signature: "rls.owns_execution_ref(text)", sql: "SELECT rls.owns_execution_ref($1::text)::text AS v",
      calls: r42Calls([values.b.executionRef], [values.a.executionRef], [false]) }
  ]);
}

/**
 * D39's expected result of one call: the context functions return A's own key under A's credential and NULL otherwise;
 * owns_run and owns_execution_ref return false for every call R42 lists (B's values or NULL), under every context.
 */
function expected(signature: string, context: Context): string | null {
  if (signature === "rls.context_user_id()") return context.kind === "A" ? A.userId : null;
  if (signature === "rls.context_owner_ref()") return context.kind === "A" ? A.ownerRef : null;
  return "false";
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  const production = await logins.production();
  A = await seedSessionAccount(database.pool, "A");
  B = await seedSessionAccount(database.pool, "B");
  await seedRlsRows(database.pool, A, B);
  t1 = Object.freeze([
    { name: "debateai_dev_runtime", url: logins.url("DATABASE_URL") },
    { name: "debateai_dev_authorization", url: logins.url("AUTHORIZATION_DATABASE_URL") },
    { name: "debateai_prod_api_runtime", url: production.url("api-runtime") },
    { name: "debateai_prod_api_authorization", url: production.url("api-authorization") }
  ]);
  const read = async (account: RlsTestAccount) => {
    const ref = (await database.pool.query<{ ref: string }>(`SELECT execution_ref::text AS ref FROM identity.run_execution_binding
      WHERE user_id = $1 ORDER BY created_at, execution_ref LIMIT 1`, [account.userId])).rows[0]?.ref;
    if (ref === undefined) throw new TypeError("RLS_C7_NO_EXECUTION_BINDING_SEEDED");
    return Object.freeze({ runId: account.runId, executionRef: ref });
  };
  values = Object.freeze({ a: await read(A), b: await read(B) });
  fixture = await baseHeadFixture();
  if (process.env.RLS_C7_MUTANT_SQL !== undefined && process.env.RLS_C7_MUTANT_SQL !== "") {
    await database.pool.query(process.env.RLS_C7_MUTANT_SQL);
  }
}, 600_000);

afterAll(async () => {
  await logins?.end();
  await database?.stop();
});

describe("row-level security S01 C7: the rls functions (R42) and the owner-role objects (R20)", () => {
  it("S7.2-a every call returns no foreign value under A and no private value otherwise", async () => {
    const failures: string[] = [];
    let calls = 0;
    for (const login of t1) {
      for (const context of contexts()) {
        await asLogin(login.url, async (client) => {
          if (context.value !== null) await client.query(CREDENTIAL, [context.value]);
          for (const fn of r42Functions()) {
            for (const call of fn.calls) {
              calls += 1;
              const want = expected(fn.signature, context);
              try {
                const got = (await client.query<{ v: string | null }>(fn.sql, [...call.args])).rows[0]!.v;
                if (got !== want) {
                  failures.push(`RLS_FAIL ${login.name} ${fn.signature} ${call.label} context=${context.kind} R42 got=${got} want=${want}`);
                }
              } catch (error) {
                const e = error as { code?: string; message?: string };
                failures.push(`RLS_FAIL ${login.name} ${fn.signature} ${call.label} context=${context.kind} R42 error=${e.code} ${e.message}`);
              }
            }
          }
          // Control: the context the calls ran under is the one intended — A's credential makes owns_run(A's run) and
          // owns_execution_ref(A's ref) true, every other context leaves them false (so a `false` above is not vacuous).
          const own = (await client.query<{ run: boolean; ref: boolean }>(
            "SELECT rls.owns_run($1::uuid) AS run, rls.owns_execution_ref($2::text) AS ref",
            [values.a.runId, values.a.executionRef])).rows[0]!;
          const ownWant = context.kind === "A";
          if (own.run !== ownWant || own.ref !== ownWant) {
            failures.push(`RLS_FAIL ${login.name} control context=${context.kind} owns_run(A)=${own.run} owns_execution_ref(A)=${own.ref} want=${ownWant}`);
          }
        });
      }
    }
    // 4 logins x 9 contexts x (1 + 1 + 5 + 5) calls (two zero-parameter functions: t3, all-of-b, all-null each).
    expect({ calls, failures }).toEqual({ calls: 4 * 9 * (3 + 3 + 5 + 5), failures: [] });
  });

  it("S7.2-b rls.session_credential_hash() is not EXECUTE-able by any T1 login (has_function_privilege false)", async () => {
    const failures: string[] = [];
    for (const login of t1) {
      const privilege = (await database.pool.query<{ can: boolean }>(
        "SELECT has_function_privilege($1, 'rls.session_credential_hash()', 'EXECUTE') AS can", [login.name])).rows[0]!.can;
      if (privilege !== false) failures.push(`RLS_FAIL ${login.name} rls.session_credential_hash() has_function_privilege=${privilege}`);
      const refused = await asLogin(login.url, async (client) => {
        await client.query(CREDENTIAL, [A.token]);
        try {
          const row = (await client.query<{ h: string | null }>("SELECT rls.session_credential_hash() AS h")).rows[0]!;
          return `CALLED value=${row.h === null ? "null" : "set"}`;
        } catch (error) { return (error as { code?: string }).code ?? "NO_SQLSTATE"; }
      });
      if (refused !== "42501") failures.push(`RLS_FAIL ${login.name} rls.session_credential_hash() call=${refused} want=42501`);
    }
    expect(failures).toEqual([]);
  });

  for (const object of BASE_HEAD_OBJECTS) {
    it(`S7.3-${object.n} ${object.object}`, async () => {
      const { base, head, definer } = await baseAndHead(object);
      if (process.env.RLS_C7_SHOW === "1") console.log(`RLS_C7_SHOW S7.3-${object.n} base=${JSON.stringify(base).slice(0, 400)} head=${JSON.stringify(head).slice(0, 400)}`);
      expect({ definer, head }).toEqual({ definer: { owner: object.owner, securityDefiner: true }, head: base });
    });
  }
});

/**
 * D45's base emulation and the head, for one call, in ONE transaction rolled back at the end: the base call runs in a
 * savepoint with row security disabled on the 110 in-scope tables and security_invoker reset on the 3 views (the base
 * state of every field 0124 sets), then that savepoint is rolled back (the DDL and the call's writes with it) and the
 * head call runs. Both see the same rows and the same now(). A call's result is its value, or its SQLSTATE and message.
 */
async function baseAndHead(object: BaseHeadObject): Promise<Readonly<{
  base: unknown; head: unknown; definer: Readonly<{ owner: string; securityDefiner: boolean }>;
}>> {
  const client = await database.pool.connect();
  const outcome = async (savepoint: string): Promise<unknown> => {
    await client.query(`SAVEPOINT ${savepoint}`);
    try { return { value: await object.call(client) }; } catch (error) {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      const e = error as { code?: string; message?: string };
      return { error: `${e.code ?? "NO_SQLSTATE"} ${e.message ?? String(error)}` };
    }
  };
  try {
    const name = object.object.slice(0, object.object.indexOf("("));
    const proc = (await client.query<{ owner: string; secdef: boolean }>(`SELECT r.rolname AS owner, p.prosecdef AS secdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname || '.' || p.proname = $1`, [name])).rows;
    await client.query("BEGIN");
    await client.query("SAVEPOINT base_state");
    for (const { relation, kind } of RLS_IN_SCOPE) {
      await client.query(kind === "v" ? `ALTER VIEW ${rlsRelationSql(relation)} RESET (security_invoker)`
        : `ALTER TABLE ${rlsRelationSql(relation)} DISABLE ROW LEVEL SECURITY`);
    }
    const base = await outcome("base_call");
    await client.query("ROLLBACK TO SAVEPOINT base_state");
    const head = await outcome("head_call");
    return Object.freeze({ base, head, definer: proc.length === 1 ? { owner: proc[0]!.owner, securityDefiner: proc[0]!.secdef }
      : { owner: `${proc.length} functions named ${name}`, securityDefiner: false } });
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function one(q: pg.PoolClient, sql: string, args: readonly unknown[]): Promise<unknown> {
  return (await q.query<{ v: unknown }>(sql, [...args])).rows[0]?.v ?? null;
}

/**
 * The rows S7.3's calls read (superuser seeding, R35): A's sign-up e-mail channel verified at its sign-up address (the
 * eligibility and live-account rules read it), B made a staff subject with TEAM_INVITE and an active owner designation,
 * and an internal grant of A funding two runs of A — the second with a READY work item and a 5-micro hold, so the
 * grant's commitments are not zero. The grant and its two INTERNAL charge scopes are written with triggers off
 * (session_replication_role=replica, superuser, this transaction only): the grant's policy_register_version names no
 * published register (none exists in this database; its foreign key is a trigger), and
 * billing.guard_internal_charge_scope refuses the scopes without a staff funding policy. Calls that go on to read the
 * register or the funding policy stop there in base and head alike; the report names them.
 */
async function baseHeadFixture(): Promise<typeof fixture> {
  const q = database.pool;
  const verify = async (account: RlsTestAccount) => (await q.query<{ id: string }>(`UPDATE identity.channel_binding AS binding
      SET state='verified', verified_at=now(), address_ciphertext=account.email_ciphertext
    FROM identity."user" AS account WHERE account.user_id=binding.user_id AND binding.user_id=$1 AND binding.channel_type='email'
    RETURNING binding.channel_binding_id::text AS id`, [account.userId])).rows[0]!.id;
  const emailChannelA = await verify(A);
  await verify(B);
  const staffB = (await q.query<{ staff_id: string }>(`INSERT INTO staff.subject(user_id,capabilities) VALUES($1,ARRAY['TEAM_INVITE'])
    RETURNING staff_id::text`, [B.userId])).rows[0]!.staff_id;
  await q.query("INSERT INTO staff.owner_designation(staff_id) VALUES($1)", [staffB]);
  const grantA = randomUUID(), grantEventA = randomUUID();
  const runs: string[] = [];
  for (const label of ["internal-1", "internal-2"]) {
    const runId = (await q.query<{ run_id: string }>(`INSERT INTO core.run (question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref, composition_budget_tier, depth_params, agent_count, discovered_panel,
        stranger_sample_rate, envelope_basis, register_version, battery_version, created_at_seq)
      VALUES ('rls c7 ' || $1, 'asker:rls-c7-' || $1 || '-' || $2::text, 'session:rls-c7', 'ASKER', now(), 'casual', 'casual', 'ASKER', 'asker-declaration:rls-c7',
        'low', '{}', 1, '[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',
        1, '{}', 1, 's00', ledger.allocate_sequence()) RETURNING run_id::text`, [label, A.ownerRef])).rows[0]!.run_id;
    await q.query("SELECT core.append_run_ownership_event($1::uuid,$2::uuid)", [runId, A.ownerRef]);
    runs.push(runId);
  }
  const client = await q.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(`INSERT INTO billing.internal_grant(grant_id,owner_ref,configured_event_id,revision,amount_micros,day_micros,week_micros,
        starts_at,expires_at,funding_approval_ref,policy_register_version)
      VALUES($1,$2,$3,1,1000000,1000,10000,now()-interval '1 hour',now()+interval '1 day','rls-c7:approval',1)`, [grantA, A.ownerRef, grantEventA]);
    for (const runId of runs) {
      await client.query(`INSERT INTO billing.run_charge_scope(run_id,owner_ref,admitted_at,funding_kind,internal_grant_id,internal_grant_event_id)
        VALUES($1,$2,now(),'INTERNAL',$3,$4)`, [runId, A.ownerRef, grantA, grantEventA]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  await q.query(`INSERT INTO core.work_item(run_id,battery_row_id,node_set,command_key,state,created_at_seq)
    VALUES($1,'Q61','[]',$2,'READY',ledger.allocate_sequence())`, [runs[1], `rls-c7:${randomUUID()}`]);
  await q.query("INSERT INTO ledger.model_spend_hold(hold_id,run_id,held_micros) VALUES($1,$2,5)", [randomUUID(), runs[1]]);
  return Object.freeze({ staffB, emailChannelA, grantA, grantEventA, internalRuns: Object.freeze([runs[0]!, runs[1]!] as const) });
}

/** PLAN §7's 25 "R35 base/head call" objects, each called with the arguments its R20 caller passes (A's or B's values). */
const BASE_HEAD_OBJECTS: readonly BaseHeadObject[] = Object.freeze([
  { n: 1, object: "staff.hold_account_internal(p_user uuid)", owner: "debateai_staff_security_owner", call: async (q) => {
    await q.query("SELECT staff.hold_account_internal($1::uuid)", [A.userId]);
    return (await q.query(`SELECT (SELECT count(*) FROM identity.session WHERE user_id=$1 AND revoked_at IS NULL)::int AS live_sessions,
        (SELECT count(*) FROM identity.login_challenge WHERE user_id=$1 AND consumed_at IS NULL)::int AS open_challenges,
        (SELECT count(*) FROM identity.mfa_factor WHERE user_id=$1 AND state<>'revoked')::int AS factors,
        (SELECT count(*) FROM identity.recovery_code WHERE user_id=$1 AND revoked_at IS NULL)::int AS codes`, [A.userId])).rows[0];
  } },
  { n: 2, object: "staff.record_mutation(p_operation uuid, p_event text, p_actor uuid, p_subject uuid, p_reason jsonb, p_key_user uuid, p_alert jsonb, p_request jsonb)",
    owner: "debateai_staff_security_owner", call: async (q) => {
      const operation = "00000000-0000-4000-8000-00000000c702";
      const row = await one(q, "SELECT staff.record_mutation($1::uuid,'KEY_CHANGE',$2::uuid,$2::uuid,$3::jsonb,$4::uuid,$5::jsonb,'{}'::jsonb) AS v",
        [operation, fixture.staffB, JSON.stringify({ code: "rls-c7" }), A.userId,
          JSON.stringify({ schema: "staff-alert-v1", event: "KEY_CHANGE", operationId: operation, envelope: ENVELOPE })]) as Record<string, unknown>;
      // recordedAt is the audit row's own clock (two calls, two instants); the rest is compared EXACT.
      const { recordedAt, ...rest } = row;
      return { ...rest, recordedAt: typeof recordedAt };
    } },
  { n: 6, object: "staff.invitation_issuer_current(p_staff uuid, p_epoch bigint)", owner: "debateai_staff_security_owner",
    call: (q) => one(q, "SELECT staff.invitation_issuer_current($1::uuid,0) AS v", [fixture.staffB]) },
  { n: 7, object: "staff.consume_ceremony(p_challenge uuid, p_user uuid, p_base uuid, p_purpose text, p_credential text, p_counter bigint, p_rp text, p_origin text)",
    owner: "debateai_staff_security_owner", call: (q) => one(q,
      "SELECT to_jsonb(staff.consume_ceremony($1::uuid,$2::uuid,$3::uuid,'ELEVATION','credential-rls-c7',1,'localhost','https://localhost')) AS v",
      [randomUUIDFixed(7), B.userId, B.sessionId]) },
  { n: 8, object: "staff.complete_owned_webauthn_registration(p_user uuid, p_base uuid, p_id uuid, p_operation uuid, p_factor uuid, p_credential text, p_key text, p_counter bigint, p_label jsonb, p_transports text[], p_alert jsonb)",
    owner: "debateai_staff_security_owner", call: (q) => one(q, `SELECT staff.complete_owned_webauthn_registration($1::uuid,$2::uuid,$3::uuid,$4::uuid,
        $5::uuid,'credential-rls-c7','key-rls-c7',0,'{}'::jsonb,ARRAY['usb'],$6::jsonb) AS v`,
    [B.userId, B.sessionId, randomUUIDFixed(8), randomUUIDFixed(80), randomUUIDFixed(81),
      JSON.stringify({ schema: "staff-alert-v1", event: "KEY_CHANGE", operationId: randomUUIDFixed(80), envelope: ENVELOPE })]) },
  { n: 9, object: "staff.read_alert_user_mapping(p_user uuid)", owner: "debateai_staff_security_owner",
    call: (q) => one(q, "SELECT staff.read_alert_user_mapping($1::uuid) AS v", [A.userId]) },
  { n: 10, object: "staff.read_alert_key_mapping(p_outbox uuid, p_claim uuid)", owner: "debateai_staff_security_owner",
    call: (q) => one(q, "SELECT staff.read_alert_key_mapping($1::uuid,$2::uuid) AS v", [randomUUIDFixed(10), randomUUIDFixed(100)]) },
  { n: 16, object: "billing.guard_internal_grant_projection()", owner: "debateai_staff_security_owner", call: async (q) =>
    // Its caller is the UPDATE it guards: releasing the owner of a grant whose account still exists is refused.
    (await q.query("UPDATE billing.internal_grant SET owner_ref=NULL WHERE grant_id=$1 RETURNING grant_id::text", [fixture.grantA])).rowCount },
  { n: 17, object: "billing.guard_internal_charge_scope()", owner: "debateai_staff_security_owner", call: async (q) =>
    (await q.query(`INSERT INTO billing.run_charge_scope(run_id,owner_ref,admitted_at,funding_kind,internal_grant_id,internal_grant_event_id)
      VALUES($1,$2,now(),'INTERNAL',$3,$4)`, [A.runId, A.ownerRef, fixture.grantA, fixture.grantEventA])).rowCount },
  { n: 18, object: "billing.read_run_funding_basis(p_run uuid)", owner: "debateai_staff_security_owner",
    call: async (q) => one(q, "SELECT billing.read_run_funding_basis($1::uuid) AS v", [(await mainRunWithScope(q))]) },
  { n: 20, object: "billing.read_internal_allowance_for_run(p_run uuid, p_now timestamp with time zone)", owner: "debateai_staff_security_owner",
    call: (q) => one(q, "SELECT billing.read_internal_allowance_for_run($1::uuid, now()) AS v", [fixture.internalRuns[0]]) },
  { n: 22, object: "billing.read_internal_grant_commitments(p_owner uuid, p_grant uuid, p_event uuid, p_own_run uuid)", owner: "debateai_staff_security_owner",
    call: (q) => one(q, "SELECT billing.read_internal_grant_commitments($1::uuid,$2::uuid,$3::uuid,$4::uuid)::text AS v",
      [A.ownerRef, fixture.grantA, fixture.grantEventA, fixture.internalRuns[0]]) },
  { n: 24, object: "billing.read_internal_run_state(p_run uuid)", owner: "debateai_staff_security_owner",
    call: (q) => one(q, "SELECT billing.read_internal_run_state($1::uuid) AS v", [fixture.internalRuns[0]]) },
  { n: 28, object: "staff.recheck_owner_commit(p_command uuid, p_receipts uuid[])", owner: "debateai_staff_security_owner",
    call: (q) => one(q, "SELECT staff.recheck_owner_commit($1::uuid, ARRAY[$2::uuid])::text AS v", [randomUUIDFixed(28), randomUUIDFixed(280)]) },
  { n: 29, object: "identity.mfa_recovery_channel_inventory(p_user uuid)", owner: "debateai_mfa_recovery_owner",
    call: (q) => one(q, "SELECT identity.mfa_recovery_channel_inventory($1::uuid) AS v", [A.userId]) },
  { n: 30, object: "staff.live_account(p_user uuid, p_session uuid)", owner: "debateai_staff_security_owner",
    call: (q) => one(q, "SELECT staff.live_account($1::uuid,$2::uuid) AS v", [A.userId, A.sessionId]) },
  { n: 31, object: "staff.begin_owned_webauthn(p_user uuid, p_base uuid, p_purpose text, p_hash text, p_handle text, p_rp text, p_origin text, p_user_handle text, p_operation uuid, p_context jsonb, p_binding jsonb, p_scope jsonb)",
    owner: "debateai_staff_security_owner", call: (q) => one(q, `SELECT staff.begin_owned_webauthn($1::uuid,$2::uuid,'REGISTRATION',$3,'handle-rls-c7',
        'localhost','https://localhost','user-handle-rls-c7',$4::uuid,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb) AS v`,
    [B.userId, B.sessionId, `sha256:${"c7".repeat(32)}`, randomUUIDFixed(31)]) },
  { n: 33, object: "identity.mfa_recovery_cancel_channel_current(p_user uuid, p_channel uuid)", owner: "debateai_mfa_recovery_owner",
    call: (q) => one(q, "SELECT identity.mfa_recovery_cancel_channel_current($1::uuid,$2::uuid) AS v", [A.userId, fixture.emailChannelA]) },
  { n: 34, object: "identity.password_reset_eligible(p_user uuid)", owner: "debateai_password_reset_owner",
    call: (q) => one(q, "SELECT identity.password_reset_eligible($1::uuid) AS v", [A.userId]) },
  { n: 35, object: "identity.password_reset_current(p_session text)", owner: "debateai_password_reset_owner",
    call: (q) => one(q, "SELECT to_jsonb(identity.password_reset_current($1)) AS v", [`sha256:${"35".repeat(32)}`]) },
  { n: 40, object: "identity.backup_email_self(p_session uuid, p_token text)", owner: "debateai_backup_email_owner",
    call: async (q) => {
      // nowMs is clock_timestamp() (0105:53): two calls, two instants; it is compared by type, the rest EXACT.
      const value = await one(q, "SELECT identity.backup_email_self($1::uuid,$2::text) AS v", [A.sessionId, A.tokenHash]) as Record<string, unknown> | null;
      return value === null ? null : { ...value, nowMs: typeof value.nowMs };
    } },
  { n: 42, object: "identity.backup_email_eligible(p_user uuid)", owner: "debateai_backup_email_owner",
    call: (q) => one(q, "SELECT identity.backup_email_eligible($1::uuid) AS v", [A.userId]) },
  { n: 43, object: "identity.mfa_recovery_close(p_id uuid, p_stage text)", owner: "debateai_mfa_recovery_owner",
    call: (q) => one(q, "SELECT identity.mfa_recovery_close($1::uuid,'CANCELLED')::text AS v", [randomUUIDFixed(43)]) },
  { n: 46, object: "identity.mfa_recovery_snapshot_current(p_id uuid)", owner: "debateai_mfa_recovery_owner",
    call: (q) => one(q, "SELECT to_jsonb(identity.mfa_recovery_snapshot_current($1::uuid)) AS v", [randomUUIDFixed(46)]) },
  { n: 71, object: "identity.mfa_recovery_waiting_current(p_id uuid)", owner: "debateai_mfa_recovery_owner",
    call: (q) => one(q, "SELECT to_jsonb(identity.mfa_recovery_waiting_current($1::uuid)) AS v", [randomUUIDFixed(71)]) }
]);

/** A fixed UUID per object (the same in the base and the head call), naming no row. */
function randomUUIDFixed(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

/** A's seeded main run: the one whose charge scope the seed wrote (SUBSCRIPTION). */
async function mainRunWithScope(q: pg.PoolClient): Promise<string> {
  return (await q.query<{ run_id: string }>("SELECT run_id::text FROM billing.run_charge_scope WHERE owner_ref=$1 AND funding_kind='SUBSCRIPTION' LIMIT 1",
    [A.ownerRef])).rows[0]!.run_id;
}
