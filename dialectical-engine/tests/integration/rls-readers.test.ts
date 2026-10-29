/**
 * Row-level security S01, cluster C7, step S7.1 (PLAN.md S7.1; SPEC-v4 R18, R19, R36, R44, §6 X1-X24 and X18a-X18j;
 * DECISIONS D36, D37). Every reader that must see more than one account, driven through the entry point D36 names, on
 * a pool connected as the reader's own login (T9: provisioned by the product's own provisioner; never the superuser),
 * over rows of two accounts A and B (tools/rls/seed.ts, superuser seeding only, R35, plus the few reader-specific rows a
 * case writes as the superuser before it drives the reader).
 *
 * The oracle (no policy re-derived): while a case drives its reader, every statement any pg client answers is recorded
 * with the login that answered it (`client.user`) and the rows it returned. A returned row is A's when it carries a value
 * only A's seeded rows hold (their key and identifier values, read as the superuser after seeding; values both accounts
 * hold are dropped), and B's likewise. A case passes when rows of A AND rows of B came back on the reader's own login.
 * A reader whose answer is a count, a sum or a flag is compared with the same entry point on the superuser pool (row
 * security off: base) over rows of both accounts, with B's (or A's) contribution made to decide the answer.
 *
 * RED (PLAN S7.1, R37): at base every case passes (base sees all), so RLS_C7_RED_T1=1 runs each case on a T1 login
 * instead — a plain pool on `debateai_dev_runtime` (or `debateai_dev_authorization` for the authorization pool's
 * readers) with no cross-account target, under the same context the reader runs with — and each case must fail
 * `sees 0 rows of B` (the readers that read only through definers owned by a role row security does not narrow, X6,
 * X7, X12, X15-X17, cannot fail that way; the C7 handoff records their mutants instead). X9, the support session
 * read, left with the stored support sessions (synthesis-flag S05, 0129; merge onto that dev, 2026-10-28).
 * Refutation hook (C7 handoff): RLS_C7_MUTANT_SQL, when set, is run as the superuser after seeding — the reverted,
 * never-committed database change a mutant run applies to this file's throwaway cluster only.
 *
 * S7.1-R44 (D37): the classification of the 66 members of `probes/REQ-FIX-RLS-2/unkeyed-reads.tsv`, and of the one
 * member origin/dev added before the merge (1667370dd, the runner's boot preload), and the two synthesis-flag's settlement
 * check claim added (packages/serve/src/synthesis-check.ts, X26, merge onto 76b76f4ba), and, since the merge with the
 * security fixes of audit run 3, the runner's stale-READY listing (NV-25, X1) and the estimator's rewritten sample (NV-49,
 * X20, in place of the probe's estimate.ts member), covers them EXACT, each member once, and the rule
 * `probes/REQ-FIX-RLS-2/unkeyed-reads.py` (ported below, verbatim in its regular expressions) re-run on this head tree finds
 * no member that is not one of the 70 (matched by file and SQL text).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { SynthesisCheckRepository } from "@debateai/serve";
import { reconcileEvaluatorMetering } from "../../packages/evaluator/src/index.js";
import { PREVIEW_REVIEWED_PROVIDER_REFS } from "@debateai/providers";
import {
  BillingJobQueries,
  createPool,
  crossAccount,
  crossAccountPool,
  migrate,
  PostgresAccountErasureRepository,
  PostgresDataExportRepository,
  PostgresDataExportSource,
  PostgresIdentityRepository,
  PostgresPublicationRepository,
  PostgresSessionRepository,
  PostgresStaffRepository,
  readRoleRotationCounts,
  resolveRunRef,
  RunWaitRepository,
  runInRequestScope,
  setRequestCredential,
  type Pool
} from "@debateai/db";
import { PostgresModelSpendStore, PostgresRecentRunUsageSource } from "@debateai/budget";
import type { CalibrationStrategy, RecordedProperScore, RegisteredProperScore } from "@debateai/settlement";
import { DekBillingRecipientReader } from "../../apps/api/src/billing/account-email.js";
import { threatReportEmailReader } from "../../apps/api/src/staff/threat-reports.js";
import { openBillingOperatorPool } from "../../apps/api/src/billing/operator-connection.js";
import { PREVIEW_MEASURED_USAGE_SQL, PREVIEW_UNFINISHED_RUNS_SQL } from "../../apps/api/src/preview-budget-estimate.js";
import { PostgresAskAdmissionGate } from "../../apps/api/src/release-state.js";
import { createRetentionPurge } from "../../apps/api/src/retention-purge.js";
import { runReplaySelfTest, runSettlementWatch } from "../../apps/scheduler/src/index.js";
import { LivenessRepository } from "@debateai/liveness";
import { rlsRelationSql, seedRlsRows, type RlsSeedReport } from "../../tools/rls/seed.js";
import {
  loginApiPools,
  provisionRlsLogins,
  seedSessionAccount,
  type ApiTestPools,
  type RlsLogins,
  type RlsTestAccount
} from "../support/rls-logins.js";
import { PostgresPasswordResetRepository } from "../../packages/db/src/password-reset.js";
import { RLS_IN_SCOPE } from "../support/rls-scope.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

type Seen = Readonly<{ user: string; rows: readonly unknown[] }>;
type Marks = Readonly<{ a: ReadonlySet<string>; b: ReadonlySet<string> }>;

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RED = process.env.RLS_C7_RED_T1 === "1";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const ONE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** The repositories' audit hasher is used only by their write paths; every read a case drives leaves it uncalled. */
const NO_AUDIT = Object.freeze({
  hashSourceIp: async () => { throw new TypeError("RLS_C7_AUDIT_HASHER_UNUSED"); },
  hashUserAgent: async () => { throw new TypeError("RLS_C7_AUDIT_HASHER_UNUSED"); }
}) as never;

let database: TestDatabase;
let logins: RlsLogins;
let api: ApiTestPools;
let A: RlsTestAccount;
let B: RlsTestAccount;
let report: RlsSeedReport;
let marks: Marks;
/** RED mode's plain T1 pools: no cross-account target, so every statement runs on the T1 login itself. */
let t1: Readonly<{ runtime: Pool; authorization: Pool }>;
const ownPools: Pool[] = [];

// ---------------------------------------------------------------------------------------------------------------------
// Recording: the login and the rows of every statement a pg client answers while a case drives its reader.
let sink: Seen[] | null = null;
const RECORDER = Symbol.for("debateai.rls.c7-reader-recorder.v1");

function installRecorder(): void {
  const prototype = pg.Client.prototype as unknown as { query: (...args: unknown[]) => unknown; [RECORDER]?: true };
  if (prototype[RECORDER] === true) return;
  const original = prototype.query;
  const capture = (user: string, result: unknown): void => {
    if (sink === null) return;
    for (const one of Array.isArray(result) ? result : [result]) {
      const rows = (one as { rows?: unknown[] } | null)?.rows;
      if (Array.isArray(rows)) sink.push(Object.freeze({ user, rows: Object.freeze([...rows]) }));
    }
  };
  prototype.query = function recordedQuery(this: pg.Client, ...args: unknown[]): unknown {
    const user = this.user ?? "";
    const at = args.findIndex((arg) => typeof arg === "function");
    if (at >= 0) {
      const callback = args[at] as (error: Error | null, result: unknown) => void;
      args[at] = (error: Error | null, result: unknown) => { if (error === null || error === undefined) capture(user, result); callback(error, result); };
      return original.apply(this, args);
    }
    const out = original.apply(this, args) as unknown;
    if (out !== null && typeof out === "object" && typeof (out as Promise<unknown>).then === "function"
      && typeof (out as { submit?: unknown }).submit !== "function") {
      return (out as Promise<unknown>).then((result) => { capture(user, result); return result; });
    }
    return out;
  };
  Object.defineProperty(prototype, RECORDER, { value: true });
}

async function record<T>(fn: () => Promise<T>): Promise<Readonly<{ result: T; seen: readonly Seen[] }>> {
  if (sink !== null) throw new TypeError("RLS_C7_RECORDER_NESTED");
  const seen: Seen[] = [];
  sink = seen;
  try { return Object.freeze({ result: await fn(), seen }); } finally { sink = null; }
}

/** Every string inside a value (nested objects and arrays walked), and every UUID inside those strings. */
function tokens(value: unknown, out: Set<string>): Set<string> {
  if (typeof value === "string") {
    out.add(value);
    for (const match of value.matchAll(UUID)) out.add(match[0].toLowerCase());
  } else if (Array.isArray(value)) {
    for (const item of value) tokens(item, out);
  } else if (value !== null && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    for (const item of Object.values(value as Record<string, unknown>)) tokens(item, out);
  }
  return out;
}

function carries(row: unknown, mark: ReadonlySet<string>): boolean {
  for (const token of tokens(row, new Set())) if (mark.has(token)) return true;
  return false;
}

/** The marks of A and B plus a case's own values (rows it wrote for each account just before driving the reader). */
function withMarks(extraA: readonly string[], extraB: readonly string[]): Marks {
  return Object.freeze({ a: new Set([...marks.a, ...extraA]), b: new Set([...marks.b, ...extraB]) });
}

/** S7.1's verdict: rows of A and rows of B came back on `login`. */
function sightings(id: string, login: string, seen: readonly Seen[], of: Marks = marks): string[] {
  const rows = seen.filter((one) => one.user === login).flatMap((one) => one.rows);
  const a = rows.filter((row) => carries(row, of.a)).length;
  const b = rows.filter((row) => carries(row, of.b)).length;
  if (a > 0 && b > 0) return [];
  const answered = [...new Set(seen.map((one) => one.user))].sort().join(",") || "none";
  return [`RLS_FAIL S7.1-${id} on ${login}: sees ${a} rows of A, sees ${b} rows of B (logins that answered: ${answered})`];
}

/** S7.1's verdict for a count, a sum or a flag: the reader's answer equals base's (the superuser pool) on the same rows. */
function sameAnswer(id: string, login: string, got: unknown, base: unknown, why: string): string[] {
  return JSON.stringify(got) === JSON.stringify(base) ? []
    : [`RLS_FAIL S7.1-${id} on ${login}: answers ${JSON.stringify(got)} where base answers ${JSON.stringify(base)} (${why}; sees 0 rows of B)`];
}

function loginOf(url: string): string {
  return decodeURIComponent(new URL(url).username);
}

function trackedPool(url: string, max = 4): Pool {
  const built = createPool(url, { max });
  ownPools.push(built);
  return built;
}

function inRequest<T>(credential: string | null, fn: () => Promise<T>): Promise<T> {
  return runInRequestScope(async () => {
    setRequestCredential(credential);
    return fn();
  });
}

/** A reader's pool and the login it answers on: the head pool, or the plain T1 pool in RED mode. */
function reader(head: Pool, headLogin: string, t1Kind: "runtime" | "authorization" = "runtime"): Readonly<{ pool: Pool; login: string }> {
  if (!RED) return Object.freeze({ pool: head, login: headLogin });
  return Object.freeze({ pool: t1[t1Kind], login: t1Kind === "runtime" ? "debateai_dev_runtime" : "debateai_dev_authorization" });
}

// ---------------------------------------------------------------------------------------------------------------------
// Superuser seeding helpers (seeding only, R35).
const su = (): Pool => database.pool;

/** A legacy-asker run owned by `account` through core.append_run_ownership_event (seedSessionAccount's shape). */
async function newRun(account: RlsTestAccount, label: string,
  options: Readonly<{ depth?: number; planTier?: "free"; releaseKey?: string }> = {}): Promise<string> {
  const runId = (await su().query<{ run_id: string }>(`INSERT INTO core.run (question_line, asker_id, session_id,
      caller_scope, as_of, asker_risk_tier, risk_tier, tier_source, tier_provenance_ref, composition_budget_tier, depth_params,
      agent_count, discovered_panel, stranger_sample_rate, envelope_basis, register_version, battery_version, created_at_seq, plan_tier, release_key)
    VALUES ('rls c7 ' || $1, 'asker:rls-c7-' || $1 || '-' || $2::text, 'session:rls-c7', 'ASKER', now(), 'casual', 'casual', 'ASKER',
      'asker-declaration:rls-c7', 'low', $3::jsonb, 1,
      '[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',
      1, '{}', 1, 's00', ledger.allocate_sequence(), $4, $5) RETURNING run_id`,
  [label, account.ownerRef, JSON.stringify(options.depth === undefined ? {} : { depth: options.depth }), options.planTier ?? null,
    options.releaseKey ?? "legacy"]))
    .rows[0]!.run_id;
  await su().query("SELECT core.append_run_ownership_event($1::uuid,$2::uuid)", [runId, account.ownerRef]);
  return runId;
}

async function workItem(runId: string, state: "READY" | "DONE"): Promise<string> {
  return (await su().query<{ work_item_id: string }>(`INSERT INTO core.work_item(run_id,battery_row_id,node_set,command_key,state,
      created_at_seq) VALUES($1,'Q61','[]',$2,$3,ledger.allocate_sequence()) RETURNING work_item_id`,
  [runId, `rls-c7:${randomUUID()}`, state])).rows[0]!.work_item_id;
}

async function finishWork(ids: readonly string[]): Promise<void> {
  await su().query(`UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL
    WHERE work_item_id = ANY($1::uuid[])`, [ids]);
}

/** The rows of `relation` whose primary key the seed recorded for `owner`, as JSON (superuser). */
async function seededRows(relation: string, owner: "a" | "b"): Promise<Record<string, unknown>[]> {
  const ids = report.keys.get(relation)?.[owner] ?? [];
  if (ids.length === 0) return [];
  const pk = (await su().query<{ columns: string }>(`SELECT string_agg(quote_ident(a.attname), ',' ORDER BY array_position(i.indkey::int2[], a.attnum)) AS columns
    FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indisprimary AND i.indrelid = $1::regclass`, [rlsRelationSql(relation)])).rows[0]!.columns;
  return (await su().query<{ row: Record<string, unknown> }>(`SELECT to_jsonb(t) AS row FROM ${rlsRelationSql(relation)} t
    WHERE jsonb_build_array(${pk.split(",").map((c) => `t.${c}`).join(",")})::text = ANY($1::text[])`, [ids])).rows.map((r) => r.row);
}

async function runsOf(owner: "a" | "b"): Promise<string[]> {
  return (await seededRows("core.run", owner)).map((row) => String(row.run_id));
}

async function testLogin(role: string): Promise<string> {
  const password = randomBytes(24).toString("base64url");
  // The test's own password, valid until changed (the production provisioner leaves this login's password expired
  // here: "User has an expired password", measured); the login's roles and attributes stay as provisioned.
  await su().query(`ALTER ROLE ${role} PASSWORD '${password}' VALID UNTIL 'infinity'`);
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return url.toString();
}

/** Every row of every in-scope relation `login` may SELECT (table privilege), read on `pool`. */
async function reach(pool: Pool, login: string): Promise<number> {
  let relations = 0;
  for (const { relation } of RLS_IN_SCOPE) {
    const can = (await su().query<{ can: boolean }>(`SELECT has_table_privilege($1, $2::regclass, 'SELECT')
        AND has_schema_privilege($1, $3, 'USAGE') AS can`, [login, rlsRelationSql(relation), relation.split(".")[0]])).rows[0]!.can;
    if (!can) continue;
    relations += 1;
    await pool.query(`SELECT * FROM ${rlsRelationSql(relation)}`);
  }
  return relations;
}

/** A verified e-mail channel whose address is the account's own sign-up address (staff.live_account, eligibility rules). */
async function verifyEmailChannel(account: RlsTestAccount): Promise<void> {
  await su().query(`UPDATE identity.channel_binding AS binding SET state='verified', verified_at=now(),
      address_ciphertext=account.email_ciphertext
    FROM identity."user" AS account WHERE account.user_id=binding.user_id AND binding.user_id=$1 AND binding.channel_type='email'`,
  [account.userId]);
}

const properScore: RegisteredProperScore = Object.freeze({
  rowKey: "rls-c7:proper-score",
  registerVersion: 1,
  sourceRef: "rls-c7:settlement",
  score(input: { readonly posterior: number; readonly resolvedOutcome: boolean }) {
    const error = input.posterior - (input.resolvedOutcome ? 1 : 0);
    const total = 1 - error * error;
    return Object.freeze({ total, reliability: total, resolution: 0, uncertainty: 0 });
  }
});
const calibration: CalibrationStrategy = Object.freeze({
  rowKey: "rls-c7:calibration",
  registerVersion: 1,
  sourceRef: "rls-c7:settlement",
  deriveValue: (scores: readonly RecordedProperScore[]) => scores.reduce((sum, score) => sum + score.total, 0) / scores.length,
  deriveInterval: (scores: readonly RecordedProperScore[]) => {
    const values = scores.map((score) => score.total);
    return Object.freeze({ lower: Math.min(...values), upper: Math.max(...values) });
  }
});

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  A = await seedSessionAccount(database.pool, "A");
  B = await seedSessionAccount(database.pool, "B");
  report = await seedRlsRows(database.pool, A, B);
  api = await loginApiPools(database);
  t1 = Object.freeze({
    runtime: trackedPool(logins.url("DATABASE_URL")),
    authorization: trackedPool(logins.url("AUTHORIZATION_DATABASE_URL"))
  });
  // The marks: every string (and UUID) of A's seeded rows and of B's, minus the values both hold.
  const collected = { a: new Set<string>(), b: new Set<string>() };
  for (const relation of report.keys.keys()) {
    for (const owner of ["a", "b"] as const) for (const row of await seededRows(relation, owner)) tokens(row, collected[owner]);
  }
  for (const [account, owner] of [[A, "a"], [B, "b"]] as const) {
    for (const sql of [`SELECT to_jsonb(u) AS row FROM identity."user" u WHERE user_id=$1`,
      "SELECT to_jsonb(s) AS row FROM identity.session s WHERE user_id=$1",
      "SELECT to_jsonb(b) AS row FROM identity.run_execution_binding b WHERE user_id=$1"]) {
      for (const { row } of (await su().query<{ row: unknown }>(sql, [account.userId])).rows) tokens(row, collected[owner]);
    }
    collected[owner].add(account.runId);
  }
  const keep = (own: Set<string>, other: Set<string>) =>
    new Set([...own].filter((value) => !other.has(value) && (value.length >= 16 || ONE_UUID.test(value))));
  marks = Object.freeze({ a: keep(collected.a, collected.b), b: keep(collected.b, collected.a) });
  installRecorder();
  if (process.env.RLS_C7_MUTANT_SQL !== undefined && process.env.RLS_C7_MUTANT_SQL !== "") {
    await database.pool.query(process.env.RLS_C7_MUTANT_SQL);
  }
}, 600_000);

afterAll(async () => {
  for (const built of ownPools.splice(0)) await built.end().catch(() => undefined);
  await logins?.end();
  await database?.stop();
});

describe("row-level security S01 C7: every cross-account reader still sees both accounts (R18, R19, R36, R44)", () => {
  it("S7.1-X1 WorkItemRepository.claimNext (apps/runner/src/main.ts:96) on debateai_dev_runner sees rows of A and of B", async () => {
    const runs = { a: await newRun(A, "x1"), b: await newRun(B, "x1") };
    const items = [await workItem(runs.a, "READY"), await workItem(runs.b, "READY")];
    try {
      const { pool, login } = reader(trackedPool(logins.url("RUNNER_DATABASE_URL")), "debateai_dev_runner");
      const repository = new WorkItemRepository(pool);
      const { seen } = await record(async () => [
        await repository.claimNext({ workerId: randomUUID(), claimSeconds: 60 }),
        await repository.claimNext({ workerId: randomUUID(), claimSeconds: 60 }),
        await repository.listDispatchable(100),
        await repository.listLapsedClaimed(100),
        // Security fixes run 3 (NV-25): the stale-READY re-send's listing, every account's READY items, on this login.
        await repository.listReady(100)
      ]);
      expect(sightings("X1", login, seen, withMarks([runs.a], [runs.b]))).toEqual([]);
    } finally { await finishWork(items); }
  });

  it("S7.1-X1 WorkItemRepository.listOpenRunSettingsVersions (apps/runner/src/run-settings.ts:667) on debateai_dev_runner sees the open runs of A and of B", async () => {
    // Merged from origin/dev (1667370dd, side-by-side spec §13 S8): the runner's boot preload of its own release's open
    // debates, every account's. It answers settings versions only (no run or account in the row), so each account's open
    // run is driven alone, then neither: on a T1 login (RED) A's and B's alone answer [], like the empty control.
    const releaseKey = `r1-${randomBytes(6).toString("hex")}`;
    const runs = { a: await newRun(A, "x1v", { releaseKey }), b: await newRun(B, "x1v", { releaseKey }) };
    const { pool } = reader(trackedPool(logins.url("RUNNER_DATABASE_URL")), "debateai_dev_runner");
    const repository = new WorkItemRepository(pool, { releaseKey });
    const answers: Record<string, readonly number[]> = {};
    for (const owner of ["a", "b"] as const) {
      const item = await workItem(runs[owner], "READY");
      try { answers[owner] = await repository.listOpenRunSettingsVersions(releaseKey); } finally { await finishWork([item]); }
    }
    answers.none = await repository.listOpenRunSettingsVersions(releaseKey);
    expect(answers).toEqual({ a: [1], b: [1], none: [] });
  });

  it("S7.1-X2 LivenessRepository.sweep, the step runLivenessSweep runs per register version (apps/scheduler/src/cli.ts:14; packages/liveness/src/index.ts:366, :415, :473) on debateai_dev_liveness sees rows of A and of B", async () => {
    // runLivenessSweep first reads the version's livenessPolicy row, which this harness's register does not hold
    // (LIVENESS_POLICY_UNRESOLVED livenessPolicy@1); the sweep it then runs is driven with that receipt's shape.
    const { pool, login } = reader(trackedPool(logins.url("LIVENESS_DATABASE_URL")), "debateai_dev_liveness");
    const { seen } = await record(() => new LivenessRepository(pool).sweep(new Date(), {
      rowKey: "livenessPolicy", registerVersion: 1, sourceRef: "rls-c7:liveness", questionClass: "standard",
      reviewAfterMs: 86_400_000, retireAfterMs: 3_650 * 86_400_000
    }));
    expect(sightings("X2", login, seen)).toEqual([]);
  });

  it("S7.1-X3 the in-scope relations debateai_replay may SELECT (apps/scheduler/src/cli.ts:14) on debateai_dev_replay see rows of A and of B", async () => {
    // runReplaySelfTest itself is refused on this login at base and at head, before any row is read: debateai_replay
    // holds SELECT on serve.* but no USAGE on schema serve (C7 finding; nothing in migrations/ grants it), so the case
    // reads every in-scope relation the login may SELECT, the reach the policy rls_all_accounts gives it.
    const { pool, login } = reader(trackedPool(logins.url("REPLAY_SELF_TEST_DATABASE_URL")), "debateai_dev_replay");
    const refused = await runReplaySelfTest(pool).then(() => "RAN", (error: { code?: string; message?: string }) => `${error.code} ${error.message}`);
    const { seen } = await record(() => reach(pool, login));
    expect({ refused, failures: sightings("X3", login, seen) })
      .toEqual({ refused: RED ? refused : "42501 permission denied for schema serve", failures: [] });
  });

  it("S7.1-X4 the in-scope relations debateai_settlement_watch may SELECT (packages/settlement/src/index.ts:713) on debateai_dev_settlement see rows of A and of B", async () => {
    // SettlementRepository.settle is refused on this login at base and at head before :713: its content lease reads
    // core.run (packages/db/src/index.ts:537), which debateai_settlement_watch may not SELECT (C7 finding). The case
    // shows that refusal, then reads every in-scope relation the login may SELECT.
    // B's seeded answer is settled; the scorecard read at :713 then reads every accepted outcome of that model and
    // class, the seeded outcomes of A and of B among them.
    const answer = (await su().query<{ answer_id: string; run_id: string }>(
      "SELECT answer_id, run_id FROM serve.answer WHERE run_id = ANY($1::uuid[]) ORDER BY sealed_at_seq LIMIT 1", [await runsOf("b")])).rows[0]!;
    await su().query(`INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
      VALUES ($1,ledger.allocate_sequence(),'TERMINAL','"SERVED"'::jsonb)`, [answer.run_id]);
    const { pool, login } = reader(trackedPool(logins.url("SETTLEMENT_DATABASE_URL")), "debateai_dev_settlement");
    const refused = await runSettlementWatch(pool, [{
      outcomeAttemptId: randomUUID(), answerId: answer.answer_id, answerVersion: 1, asOf: new Date("2026-01-02T00:00:00.000Z"),
      runId: answer.run_id, modelId: "model-rls", modelVersion: "v1", provider: "provider-rls", taskClass: "general",
      prior: 0.5, posterior: 0.8, basis: "rls-c7:external", resolverRef: "resolver:rls-c7", resolverIsExternal: true,
      resolvedOutcome: true, resolvedAt: new Date("2026-01-02T01:00:00.000Z"), provenanceRef: "resolver-artifact:rls-c7",
      scoreability: "SCOREABLE", actorRef: "settlement-watch:rls-c7"
    }], { properScore, calibration, metric: "judge_weight" }).then(() => "RAN", (error: { code?: string; message?: string }) => `${error.code} ${error.message}`);
    const { seen } = await record(() => reach(pool, login));
    expect({ refused, failures: sightings("X4", login, seen) })
      .toEqual({ refused: RED ? refused : "42501 permission denied for table run", failures: [] });
  });

  it("S7.1-X5 reconcileEvaluatorMetering (evaluator worker; packages/evaluator/src/index.ts:3609) on debateai_prod_evaluator_worker sees rows of A and of B", async () => {
    await logins.production();
    const own: Record<"a" | "b", string[]> = { a: [], b: [] };
    for (const [account, owner] of [[A, "a"], [B, "b"]] as const) {
      const attemptId = randomUUID();
      const runId = (await runsOf(owner))[0]!;
      const artifact = (await su().query<{ raw_artifact_id: string }>(`INSERT INTO ledger.raw_artifact(raw_artifact_id,attempt_id,
          provider_ref,provider,model_id,model_version,maker,raw_text,metadata_json,parse_status,content_hash,at_seq,input_hash,
          contract_hash,run_id)
        VALUES($1,$2,'provider-rls','provider-rls','model-rls','v-rls-c7','maker-rls','rls c7','{}','PARSED',$3,ledger.allocate_sequence(),$4,$5,$6)
        RETURNING raw_artifact_id`, [randomUUID(), attemptId, randomBytes(32).toString("hex"), randomBytes(32).toString("hex"),
        randomBytes(32).toString("hex"), runId])).rows[0]!.raw_artifact_id;
      const entry = (await su().query<{ ledger_entry_id: string }>(`INSERT INTO ledger.ledger_entry(sequence,action_kind,subject_item_id,
          stance_at_action,outcome,actor_ref,input_hash,contract_hash,started_at,finished_at,run_id,attempt_id,call_site_key,raw_artifact_ref)
        VALUES(ledger.allocate_sequence(),'MODEL_CALL','item:rls-c7','NEUTRAL','OK','actor:rls-c7',$1,$2,now(),now(),$3,$4,'site:rls-c7',$5)
        RETURNING ledger_entry_id`, [randomBytes(32).toString("hex"), randomBytes(32).toString("hex"), runId, attemptId, artifact]))
        .rows[0]!.ledger_entry_id;
      own[owner].push(artifact, entry);
      void account;
    }
    const { pool, login } = reader(trackedPool(await testLogin("debateai_prod_evaluator_worker")), "debateai_prod_evaluator_worker");
    const now = Date.now();
    const { seen } = await record(() => reconcileEvaluatorMetering(pool as never, {
      windowStart: new Date(now - 86_400_000), windowEnd: new Date(now + 60_000), asOf: new Date(now)
    } as never));
    expect(sightings("X5", login, seen, withMarks(own.a, own.b))).toEqual([]);
  });

  it("S7.1-X6 PostgresAccountErasureRepository.pendingWork (apps/api/src/main.ts:1250) on debateai_dev_erasure sees rows of A and of B", async () => {
    const ids: Record<"a" | "b", string> = { a: "", b: "" };
    for (const [account, owner] of [[A, "a"], [B, "b"]] as const) {
      ids[owner] = (await su().query<{ erasure_id: string }>(`INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at,
          schedule_session_id) VALUES($1,now()-interval '2 days',now()-interval '1 day',$2) RETURNING erasure_id`,
      [account.userId, account.sessionId])).rows[0]!.erasure_id;
    }
    try {
      const { pool, login } = reader(api.erasure, "debateai_dev_erasure");
      const repository = new PostgresAccountErasureRepository(pool, NO_AUDIT, api.contentProvision);
      const { seen } = await record(() => repository.pendingWork(100));
      expect(sightings("X6", login, seen, withMarks([ids.a], [ids.b]))).toEqual([]);
    } finally {
      await su().query("DELETE FROM identity.account_erasure_request WHERE erasure_id = ANY($1::uuid[])", [[ids.a, ids.b]]);
    }
  });

  it("S7.1-X7 PostgresDataExportRepository.claim + PostgresDataExportSource.readRaw (apps/api/src/main.ts:1670) on debateai_dev_data_export sees rows of A and of B", async () => {
    const ids: Record<"a" | "b", string> = { a: randomUUID(), b: randomUUID() };
    for (const [account, owner] of [[A, "a"], [B, "b"]] as const) {
      await su().query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at)
        VALUES($1,$2,$3,'en','PREPARING',now()-interval '1 minute')`, [ids[owner], account.userId, account.sessionId]);
    }
    const { pool, login } = reader(api.dataExport, "debateai_dev_data_export");
    const repository = new PostgresDataExportRepository(api.authorization, pool, NO_AUDIT);
    const source = new PostgresDataExportSource(pool);
    const worker = randomUUID();
    const { seen } = await record(async () => {
      const claims = [await repository.claim(worker, 60), await repository.claim(worker, 60)];
      return Promise.all(claims.filter((claim) => claim !== null).map((claim) => source.readRaw(claim!.exportId, worker)));
    });
    expect(sightings("X7", login, seen, withMarks([ids.a], [ids.b]))).toEqual([]);
  });

  it("S7.1-X8 PostgresPublicationRepository.claimKeyProvisionCleanup (apps/api/src/main.ts:1236, the cleanup repository of :1221) on debateai_dev_publication_cleanup sees rows of A and of B", async () => {
    const refs: Record<"a" | "b", string> = { a: randomUUID(), b: randomUUID() };
    for (const [account, owner] of [[A, "a"], [B, "b"]] as const) {
      await su().query(`INSERT INTO serve.publication_key_provision_intent(publication_ref,run_id,user_id,owner_ref,session_id,
          grant_token_hash,requested_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()-interval '2 hours',now()-interval '1 hour')`,
      [refs[owner], account.runId, account.userId, account.ownerRef, account.sessionId, `sha256:${randomBytes(32).toString("hex")}`]);
    }
    const { pool, login } = reader(api.publicationCleanup, "debateai_dev_publication_cleanup");
    const repository = new PostgresPublicationRepository(pool, NO_AUDIT);
    const { seen } = await record(() => repository.claimKeyProvisionCleanup(100));
    expect(sightings("X8", login, seen, withMarks([refs.a], [refs.b]))).toEqual([]);
  });

  it("S7.1-X10 PostgresPublicationRepository.listPublicRefs + readPublic (packages/db/src/publication.ts:560, :582, :589) on debateai_dev_api_system sees rows of A and of B", async () => {
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const repository = new PostgresPublicationRepository(pool, NO_AUDIT);
    const published = (await su().query<{ ref: string; run_id: string }>(`SELECT publication_ref::text AS ref, run_id::text AS run_id
      FROM core.run_visibility_event WHERE state='PUBLISHED' AND run_id = ANY($1::uuid[])`, [[...await runsOf("a"), ...await runsOf("b")]])).rows;
    const { seen } = await record(() => inRequest(null, async () => [
      await repository.listPublicRefs(100, 0),
      ...await Promise.all(published.map((row) => repository.readPublic(row.ref))),
      ...await Promise.all(published.map((row) => repository.revalidatePublic(row.run_id, row.ref)))
    ]));
    expect(sightings("X10", login, seen)).toEqual([]);
  });

  it("S7.1-X11 BillingJobQueries.liveSubscriptionIds on crossAccountPool(pool, \"X11\") (apps/api/src/main.ts:915, :1584) on debateai_dev_api_system sees rows of A and of B", async () => {
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const jobs = new BillingJobQueries(crossAccountPool(pool, "X11"));
    const { seen } = await record(() => jobs.liveSubscriptionIds(null, 100));
    expect(sightings("X11", login, seen)).toEqual([]);
  });

  it("S7.1-X13 RunWaitRepository.oldestWaiting + WorkItemRepository.listStalledStarts (apps/api/src/main.ts:1865, background) on debateai_dev_api_system sees rows of A and of B", async () => {
    const runs = { a: await newRun(A, "x13"), b: await newRun(B, "x13") };
    const items = [await workItem(runs.a, "READY"), await workItem(runs.b, "READY")];
    for (const runId of [runs.a, runs.b]) {
      await su().query("INSERT INTO ledger.model_spend_hold(hold_id,run_id,held_micros,opened_at) VALUES($1,$2,1,now()-interval '1 hour')",
        [randomUUID(), runId]);
    }
    try {
      const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
      const { seen } = await record(async () => [
        await new RunWaitRepository(pool).oldestWaiting(100),
        await new WorkItemRepository(pool).listStalledStarts({ olderThanSeconds: 60, limit: 100 })
      ]);
      expect(sightings("X13", login, seen, withMarks([runs.a], [runs.b]))).toEqual([]);
    } finally { await finishWork(items); }
  });

  it("S7.1-X14 PostgresStaffRepository.readContext on crossAccountPool(pool, \"X14\") (apps/api/src/main.ts:1083) on debateai_dev_api_system sees rows of A and of B", async () => {
    const tokens: Record<"a" | "b", string> = { a: "", b: "" };
    const staff: string[] = [];
    for (const [account, owner] of [[A, "a"], [B, "b"]] as const) {
      await verifyEmailChannel(account);
      const staffId = (await su().query<{ staff_id: string }>("INSERT INTO staff.subject(user_id) VALUES($1) RETURNING staff_id",
        [account.userId])).rows[0]!.staff_id;
      staff.push(staffId);
      tokens[owner] = `sha256:${randomBytes(32).toString("hex")}`;
      await su().query(`INSERT INTO staff.privilege_session(staff_id,user_id,ordinary_session_id,token_hash,security_epoch,
          account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
        VALUES($1,$2,$3,$4,0,staff.account_epoch($2),0,now()+interval '10 minutes',now()+interval '1 hour')`,
      [staffId, account.userId, account.sessionId, tokens[owner]]);
    }
    try {
      const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
      const repository = new PostgresStaffRepository(crossAccountPool(pool, "X14"));
      const { seen } = await record(() => inRequest(A.token, async () => [
        await repository.readContext({ userId: A.userId, ordinarySessionId: A.sessionId, staffTokenHash: tokens.a }),
        await repository.readContext({ userId: B.userId, ordinarySessionId: B.sessionId, staffTokenHash: tokens.b })
      ]));
      expect(sightings("X14", login, seen)).toEqual([]);
    } finally {
      await su().query("DELETE FROM staff.privilege_session WHERE staff_id = ANY($1::uuid[])", [staff]);
      await su().query("DELETE FROM staff.subject WHERE staff_id = ANY($1::uuid[])", [staff]);
    }
  });

  it("S7.1-X15 the obs.* views owned by debateai_obs_view_owner (obs.run_progress_v, obs.work_item_liveness_v) on debateai_observation_agent see rows of A and of B", async () => {
    const { pool, login } = reader(trackedPool(await testLogin("debateai_observation_agent")), "debateai_observation_agent");
    const { seen } = await record(async () => [
      (await pool.query("SELECT * FROM obs.run_progress_v")).rows,
      (await pool.query("SELECT * FROM obs.work_item_liveness_v")).rows
    ]);
    expect(sightings("X15", login, seen)).toEqual([]);
  });

  it("S7.1-X17 resolveRunRef -> core.resolve_run_ref, owned by debateai_release_owner (packages/db/src/run-supersession.ts:48) on debateai_dev_runtime sees rows of A and of B", async () => {
    const edges = (await su().query<{ old_run_id: string; new_run_id: string }>(`SELECT old_run_id::text, new_run_id::text
      FROM core.run_supersession WHERE old_run_id = ANY($1::uuid[]) ORDER BY old_run_id`, [[...await runsOf("a"), ...await runsOf("b")]])).rows;
    const { pool, login } = reader(api.runtime, "debateai_dev_runtime");
    const { result, seen } = await record(() => inRequest(A.token, async () =>
      Promise.all(edges.map(async (edge) => ({ edge, resolved: await resolveRunRef(pool, edge.old_run_id) })))));
    const unfollowed = result.filter(({ edge, resolved }) => resolved === edge.old_run_id)
      .map(({ edge }) => `RLS_FAIL S7.1-X17 on ${login}: ${edge.old_run_id} not followed to ${edge.new_run_id}`);
    expect([...sightings("X17", login, seen), ...unfollowed]).toEqual([]);
  });

  it("S7.1-X18a PostgresSessionRepository.readRecoveryCodeForLogin (packages/db/src/sessions.ts:292) on debateai_dev_authorization_system sees rows of A and of B", async () => {
    // read_secure_login_challenge admits a password-first challenge whose snapshot is the account's current password hash
    // and whose factor is its active TOTP: one fresh challenge per account (the seed's snapshot is not the hash).
    const challenges: string[] = [];
    for (const account of [A, B]) {
      const hash = `sha256:${randomBytes(32).toString("hex")}`;
      await su().query(`INSERT INTO identity.login_challenge(user_id,token_hash,binding_hash,created_at,expires_at,first_step,
          password_hash_snapshot,mfa_factor_id)
        SELECT u.user_id,$2,$3,now(),now()+interval '10 minutes','PASSWORD',u.password_hash,
          (SELECT f.mfa_factor_id FROM identity.mfa_factor f WHERE f.user_id=u.user_id AND f.factor_type='totp' AND f.state='active' LIMIT 1)
        FROM identity."user" u WHERE u.user_id=$1`, [account.userId, hash, `sha256:${randomBytes(32).toString("hex")}`]);
      challenges.push(hash);
    }
    const { pool, login } = reader(api.authorization, "debateai_dev_authorization_system", "authorization");
    const repository = new PostgresSessionRepository(pool, NO_AUDIT);
    const { seen } = await record(() => inRequest(null, async () =>
      Promise.all(challenges.map((hash) => repository.readRecoveryCodeForLogin(hash, 1)))));
    expect(sightings("X18a", login, seen)).toEqual([]);
  });

  it("S7.1-X18b PostgresIdentityRepository.findAuditIdentityByBlindIndex (packages/db/src/identity.ts:309) on debateai_dev_api_system sees rows of A and of B", async () => {
    const indexes = await blindIndexes();
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const repository = new PostgresIdentityRepository(pool, NO_AUDIT);
    const { seen } = await record(() => inRequest(null, async () =>
      Promise.all(indexes.map((index) => repository.findAuditIdentityByBlindIndex(index)))));
    expect(sightings("X18b", login, seen)).toEqual([]);
  });

  it("S7.1-X18c PostgresIdentityRepository.ownerRefByEmailBlindIndex (packages/db/src/identity.ts:328) on debateai_dev_api_system sees rows of A and of B", async () => {
    const indexes = await blindIndexes();
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const repository = new PostgresIdentityRepository(pool, NO_AUDIT);
    const { seen } = await record(() => inRequest(null, async () =>
      Promise.all(indexes.map((index) => repository.ownerRefByEmailBlindIndex(index)))));
    expect(sightings("X18c", login, seen)).toEqual([]);
  });

  it("S7.1-X18d PostgresIdentityRepository.readMfaEnrollmentIdentity (packages/db/src/identity.ts:561) on debateai_dev_api_system sees rows of A and of B", async () => {
    const pending = await pendingMfaAccounts("x18d");
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const repository = new PostgresIdentityRepository(pool, NO_AUDIT);
    const { seen } = await record(() => inRequest(null, async () => [
      await repository.readMfaEnrollmentIdentity(pending.a.enrollmentHash),
      await repository.readMfaEnrollmentIdentity(pending.b.enrollmentHash)
    ]));
    expect(sightings("X18d", login, seen, pending.marks)).toEqual([]);
  });

  it("S7.1-X18e PostgresIdentityRepository.readTotpEnrollment (packages/db/src/identity.ts:606) on debateai_dev_api_system sees rows of A and of B", async () => {
    const pending = await pendingMfaAccounts("x18e");
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const repository = new PostgresIdentityRepository(pool, NO_AUDIT);
    const { seen } = await record(() => inRequest(null, async () => [
      await repository.readTotpEnrollment(pending.a.enrollmentHash),
      await repository.readTotpEnrollment(pending.b.enrollmentHash)
    ]));
    expect(sightings("X18e", login, seen, pending.marks)).toEqual([]);
  });

  it("S7.1-X18f PostgresIdentityRepository.readRecoveryCodeForConfirmation (packages/db/src/identity.ts:714) on debateai_dev_api_system sees rows of A and of B", async () => {
    const pending = await pendingMfaAccounts("x18f");
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const repository = new PostgresIdentityRepository(pool, NO_AUDIT);
    const { seen } = await record(() => inRequest(null, async () => [
      await repository.readRecoveryCodeForConfirmation(pending.a.enrollmentHash, 1),
      await repository.readRecoveryCodeForConfirmation(pending.b.enrollmentHash, 1)
    ]));
    expect(sightings("X18f", login, seen, pending.marks)).toEqual([]);
  });

  it("S7.1-X18g PostgresIdentityRepository.readRecoveryCodeForUse (packages/db/src/identity.ts:763; apps/api/src/mfa.ts:347) on debateai_dev_api_system sees rows of A and of B", async () => {
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const repository = new PostgresIdentityRepository(pool, NO_AUDIT);
    const { seen } = await record(() => inRequest(null, async () => [
      await repository.readRecoveryCodeForUse(A.userId, 1),
      await repository.readRecoveryCodeForUse(B.userId, 1)
    ]));
    expect(sightings("X18g", login, seen)).toEqual([]);
  });

  it("S7.1-X18h the run-content key store's owner lookup (apps/api/src/main.ts:985, its statement read from main.ts) on debateai_dev_api_system sees rows of A and of B", async () => {
    const source = await readFile(join(PRODUCT_ROOT, "apps/api/src/main.ts"), "utf8");
    const site = /crossAccount\("X18h", \(\) => pool\.query<\{ user_id: string \}>\(\s*`([^`]+)`/u.exec(source);
    expect(site, "apps/api/src/main.ts no longer wraps the run-content key store's lookup in crossAccount(\"X18h\")").not.toBeNull();
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const { seen } = await record(() => inRequest(A.token, async () => [
      await crossAccount("X18h", () => pool.query(site![1]!, [A.ownerRef])),
      await crossAccount("X18h", () => pool.query(site![1]!, [B.ownerRef]))
    ]));
    expect(sightings("X18h", login, seen)).toEqual([]);
  });

  it("S7.1-X18i DekBillingRecipientReader.currentAddress (apps/api/src/billing/account-email.ts:48-53, part of X11) on debateai_dev_api_system sees rows of A and of B", async () => {
    const customers = (await su().query<{ customer_id: string }>(
      "SELECT customer_id::text FROM billing.customer WHERE owner_ref = ANY($1::uuid[]) ORDER BY owner_ref", [[A.ownerRef, B.ownerRef]])).rows;
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    // The DEK store is consulted only after the read: "no key" answers null without opening any envelope.
    const users = Object.freeze({ exists: async () => false, load: async () => { throw new TypeError("RLS_C7_DEK_UNUSED"); } }) as never;
    const recipients = new DekBillingRecipientReader(crossAccountPool(pool, "X11"), users);
    const { seen } = await record(() => Promise.all(customers.map((row) => recipients.currentAddress(row.customer_id))));
    expect(sightings("X18i", login, seen)).toEqual([]);
  });

  it("S7.1-X18j PostgresPublicationRepository.readAuthorPseudonym (packages/db/src/publication.ts:409) on debateai_dev_api_system sees rows of A and of B", async () => {
    const runs = (await su().query<{ run_id: string; user_id: string; owner_ref: string }>(`SELECT r.run_id::text, u.user_id::text,
        u.owner_ref::text FROM core.run r JOIN identity."user" u ON core.run_is_owned_by(r.run_id, u.owner_ref, NULL)
      WHERE r.content_encryption_version = 1 AND u.user_id = ANY($1::uuid[])`, [[A.userId, B.userId]])).rows;
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const repository = new PostgresPublicationRepository(pool, NO_AUDIT);
    const { seen } = await record(() => inRequest(null, async () =>
      Promise.all(runs.map((run) => repository.readAuthorPseudonym(run.run_id, run.user_id, run.owner_ref)))));
    expect(sightings("X18j", login, seen)).toEqual([]);
  });

  it("S7.1-X19 PostgresAskAdmissionGate.activeDebates (apps/api/src/release-state.ts:372; the room-decision pool, apps/api/src/main.ts:339) on debateai_dev_api_system sees rows of A and of B", async () => {
    const runs = { a: await newRun(A, "x19"), b: await newRun(B, "x19") };
    const items = [await workItem(runs.a, "READY"), await workItem(runs.b, "READY")];
    try {
      const gate = new PostgresAskAdmissionGate({ releaseKey: "legacy", hosted: false });
      const { pool, login } = reader(api.roomDecision, "debateai_dev_api_system");
      const count = async (from: Pool) => {
        const client = await from.connect();
        try { return await gate.activeDebates(client); } finally { client.release(); }
      };
      const got = await inRequest(A.token, () => count(pool));
      const base = await count(su());
      expect([...sameAnswer("X19", login, got, base, "B's READY work item is one of the debates counted"),
        ...(base >= 2 ? [] : [`RLS_FAIL S7.1-X19 base counts ${base} debates, fewer than A's and B's`])]).toEqual([]);
    } finally { await finishWork(items); }
  });

  it("S7.1-X20 PostgresRecentRunUsageSource.readRecentRunUsage (packages/budget/src/estimate.ts:224; apps/api/src/main.ts:624) on debateai_dev_api_system sees rows of A and of B", async () => {
    const runs = { a: await newRun(A, "x20", { depth: 1, planTier: "free" }), b: await newRun(B, "x20", { depth: 1, planTier: "free" }) };
    for (const runId of [runs.a, runs.b]) {
      await workItem(runId, "DONE");
      await su().query(`INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,
        output_tokens,run_id) VALUES($1,'RUN','provider-rls',current_date,10,7,3,$2)`, [randomUUID(), runId]);
    }
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const source = new PostgresRecentRunUsageSource(pool);
    const { seen } = await record(() => inRequest(A.token, () => source.readRecentRunUsage({
      settings: { planTier: "free", compositionBudgetTier: "low", makerCount: 1, depth: 1 },
      since: new Date(Date.now() - 86_400_000), limit: 100
    })));
    expect(sightings("X20", login, seen, withMarks([runs.a], [runs.b]))).toEqual([]);
  });

  it("S7.1-X21 the preview budget gate's two reads inside crossAccount(\"X21\") (apps/api/src/preview-budget-estimate.ts:1485, :1500) on debateai_dev_api_system sees rows of A and of B", async () => {
    // readPreviewBudgetGateSettings needs a preview register version this harness does not hold; the two statements it
    // wraps are exported and run here exactly as it runs them (PREVIEW_STORY_HOLD_WINDOW_SECONDS = 3600 and
    // PREVIEW_CALIBRATION_WINDOW_DAYS = 14 are module-private: :208, :148).
    const runs = { a: await newRun(A, "x21"), b: await newRun(B, "x21") };
    const items = [await workItem(runs.a, "READY"), await workItem(runs.b, "READY")];
    const provider = PREVIEW_REVIEWED_PROVIDER_REFS[0]!;
    for (const [runId, micros] of [[runs.a, 1000], [runs.b, 20]] as const) {
      await su().query(`INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,
        output_tokens,run_id) VALUES($1,'RUN',$2,current_date,$3,11,5,$4)`, [randomUUID(), provider, micros, runId]);
    }
    try {
      const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
      const read = (from: Pool) => Promise.all([
        crossAccount("X21", () => from.query(PREVIEW_UNFINISHED_RUNS_SQL, [true, 3600])).then((r) => r.rows.length),
        crossAccount("X21", () => from.query(PREVIEW_MEASURED_USAGE_SQL, [[...PREVIEW_REVIEWED_PROVIDER_REFS], 14])).then((r) => r.rows)
      ]);
      const got = await inRequest(A.token, () => read(pool));
      const base = await read(su());
      expect(sameAnswer("X21", login, got, base, "B's unfinished run and B's measured call are counted")).toEqual([]);
    } finally { await finishWork(items); }
  });

  it("S7.1-X22 RunWaitRepository.siteLineBlocking (packages/db/src/run-wait.ts:222; apps/api/src/ask-room.ts:814) on debateai_dev_api_system sees rows of A and of B", async () => {
    // Only one account's waiting runs decide the answer at a time: the other's carry a newer PERSON reason whose recheck
    // is a day away (the line's latest reason wins, core.run_waiting_v), so `true` means that account's rows were seen.
    const waiting = async (account: RlsTestAccount) => (await su().query<{ run_id: string }>(
      "SELECT run_id::text FROM core.run_waiting_v WHERE owner_ref = $1", [account.ownerRef])).rows.map((row) => row.run_id);
    const person = async (runIds: readonly string[], waitsFor: "PERSON" | "SITE") => {
      for (const runId of runIds) {
        await su().query(`INSERT INTO core.run_wait_reason(reason_id,run_id,evaluated_at,waits_for,person_recheck_at)
          VALUES($1,$2,clock_timestamp(),$3,$4)`, [randomUUID(), runId, waitsFor, waitsFor === "PERSON" ? new Date(Date.now() + 86_400_000) : null]);
      }
    };
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const repository = new RunWaitRepository(pool);
    const failures: string[] = [];
    const [ofA, ofB] = [await waiting(A), await waiting(B)];
    await person(ofA, "PERSON");
    failures.push(...sameAnswer("X22", login, await inRequest(A.token, () => repository.siteLineBlocking(new Date())),
      await new RunWaitRepository(su()).siteLineBlocking(new Date()), "only B's waiting runs block"));
    await person(ofB, "PERSON");
    await person(ofA, "SITE");
    failures.push(...sameAnswer("X22", login, await inRequest(B.token, () => repository.siteLineBlocking(new Date())),
      await new RunWaitRepository(su()).siteLineBlocking(new Date()), "only A's waiting runs block").map((line) => line.replace("sees 0 rows of B", "sees 0 rows of A")));
    await person(ofB, "SITE");
    expect({ waiting: [ofA.length > 0, ofB.length > 0], failures }).toEqual({ waiting: [true, true], failures: [] });
  });

  it("S7.1-X23 PostgresModelSpendStore.readDaySpentMicros (packages/budget/src/model-spend.ts:1032; apps/api/src/main.ts:453) on debateai_dev_api_system sees rows of A and of B", async () => {
    const day = "2025-03-03";
    for (const [account, micros] of [[A, 1000], [B, 20]] as const) {
      await su().query(`INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,
        output_tokens,run_id) VALUES($1,'RUN','provider-rls',$2::date,$3,0,0,$4)`, [randomUUID(), day, micros, account.runId]);
    }
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const got = await inRequest(A.token, () => new PostgresModelSpendStore(pool).readDaySpentMicros(day));
    const base = await new PostgresModelSpendStore(su()).readDaySpentMicros(day);
    expect([...sameAnswer("X23", login, got, base, "B's 20 micros are part of the day's spend"),
      ...(base === 1020 ? [] : [`RLS_FAIL S7.1-X23 base sums ${base}, not A's 1000 + B's 20`])]).toEqual([]);
  });

  it("S7.1-X24 readRoleRotationCounts (packages/db/src/index.ts:1690; apps/api/src/main.ts:1142) on debateai_dev_api_system sees rows of A and of B", async () => {
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const got = await inRequest(A.token, () => readRoleRotationCounts(pool));
    const base = await readRoleRotationCounts(su());
    expect(sameAnswer("X24", login, got, base, "B's pinned roles are counted")).toEqual([]);
  });

  it("S7.1-X25 openBillingOperatorPool (apps/api/src/billing/operator-connection.ts) + BillingJobQueries on debateai_prod_api_system sees rows of A and of B", async () => {
    const production = await logins.production();
    const url = RED ? logins.url("DATABASE_URL") : production.url("api-system");
    const login = RED ? "debateai_dev_runtime" : "debateai_prod_api_system";
    const pool = await openBillingOperatorPool(url, { production: !RED, readOnly: true, max: 1 });
    ownPools.push(pool);
    const { seen } = await record(() => new BillingJobQueries(pool).liveSubscriptionIds(null, 100));
    expect(sightings("X25", login, seen)).toEqual([]);
  });

  it("S7.1-X26 SynthesisCheckRepository.claimNextRequests (packages/serve/src/synthesis-check.ts:81, :110; the synthesis check worker's timer, apps/api/src/main.ts:1440, background) on debateai_dev_api_system claims the settlement requests of A and of B", async () => {
    // Merged from origin/dev (synthesis-flag S01, 0126): the worker claims every account's pending settlement check,
    // outside every request, so the runtime pool's statements run on its cross-account target. Each account's seeded
    // request names its own answer; the work item that settled that answer is added here, so both are claimable.
    for (const owner of ["a", "b"] as const) {
      const [request] = await seededRows("serve.synthesis_check_request", owner);
      await su().query(`INSERT INTO core.work_item(run_id,battery_row_id,node_set,command_key,state,settled_attempt_id,
          settled_artifact_ref,created_at_seq) VALUES($1,'Q61','[]',$2,'DONE',gen_random_uuid(),$3,ledger.allocate_sequence())`,
      [request!.run_id, `rls-c7:${randomUUID()}`, request!.answer_id]);
    }
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const { seen } = await record(() => new SynthesisCheckRepository(pool).claimNextRequests(10, 3_600_000_000));
    expect(sightings("X26", login, seen)).toEqual([]);
  });

  it("S7.1-X27 threatReportEmailReader on crossAccountPool(pool, \"X27\") (apps/api/src/staff/threat-reports.ts:30, the staff threat report read; apps/api/src/main.ts) on debateai_dev_api_system finds the addresses of A and of B", async () => {
    // Merged from origin/dev (synthesis-flag S04): inside a staff request (here A's session) the reader looks up the
    // reported account's address, another account's identity row. The key store records whose row was found and stops
    // before any decryption.
    const { pool, login } = reader(crossAccountPool(api.runtime, "X27"), "debateai_dev_api_system");
    const found: string[] = [];
    const read = threatReportEmailReader(pool, { load: async (userId: string) => {
      found.push(userId);
      throw new TypeError("RLS_C7_DEK_UNUSED");
    } } as never);
    const { seen } = await record(() => inRequest(A.token, async () => {
      for (const userId of [A.userId, B.userId]) await read(userId).catch(() => null);
    }));
    expect(seen.some((one) => one.user === login)).toBe(true);
    expect(sameAnswer("X27", login, found, [A.userId, B.userId], "an identity row found for each account")).toEqual([]);
  });

  it("S7.1-X28 the staff publication review's readers inside crossAccount(\"X28\") (apps/api/src/main.ts: application.withContentLease and SynthesisCheckRepository.readRecords) on debateai_dev_api_system read the synthesis checks of A and of B", async () => {
    // Merged from origin/dev (synthesis-flag S02): inside a staff request (here A's session) the review leases and reads
    // the debate of its owner, another account. Each account's seeded final check is read under the frame.
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const repository = new SynthesisCheckRepository(pool);
    const rows = [...await seededRows("serve.synthesis_check_result", "a"), ...await seededRows("serve.synthesis_check_result", "b")];
    expect(rows).toHaveLength(2);
    const { seen } = await record(() => inRequest(A.token, () => crossAccount("X28", async () => {
      for (const row of rows) {
        await repository.readRecords({ runId: String(row.run_id), answerId: String(row.answer_id), maxVersion: Number(row.answer_version) })
          .catch(() => []);
      }
    })));
    expect(sightings("X28", login, seen)).toEqual([]);
  });

  it("S7.1-X16 PostgresPasswordResetRepository.prepare (packages/db/src/password-reset.ts:74, identity.password_reset_prepare owned by debateai_password_reset_owner; wired on the runtime pool at apps/api/src/main.ts:1054) on debateai_dev_runtime sees rows of A and of B", async () => {
    // The forgot-password request (apps/api/src/password-reset.ts:124) looks the account up by its e-mail blind index:
    // the definer reads the user row, its e-mail channels and its TOTP factor (password_reset_eligible). Eligibility
    // needs the verified sign-up channel; each account's own index, in a request with no credential, as the page calls it.
    // The capability role is not a migration grant: the preview launcher hands it to the API principal (the comment at
    // tests/architecture/p3-production-database-principals.test.ts:141-143), and C3's provisioner does not. It is granted
    // here for this case only (test database, superuser) and revoked after, as password-reset-flow.test.ts:72-77 does
    // with its fixture login.
    for (const account of [A, B]) await verifyEmailChannel(account);
    const { pool, login } = reader(api.runtime, "debateai_dev_runtime");
    const repository = new PostgresPasswordResetRepository(pool, NO_AUDIT, 1);
    const indexes = await blindIndexes();
    await su().query("GRANT debateai_password_reset_runtime TO debateai_dev_runtime");
    try {
      const { result, seen } = await record(() => inRequest(null, async () => Promise.all(indexes.map((index) => repository.prepare(index)))));
      expect({ answered: result.map((candidate) => candidate?.userId ?? null).sort(), failures: sightings("X16", login, seen) })
        .toEqual({ answered: [A.userId, B.userId].sort(), failures: [] });
    } finally {
      await su().query("REVOKE debateai_password_reset_runtime FROM debateai_dev_runtime");
    }
  });

  it("S7.1-X12 createRetentionPurge(...).run (apps/api/src/main.ts:1296, background) on debateai_dev_api_system sees rows of A and of B", async () => {
    for (const account of [A, B]) {
      await su().query("INSERT INTO legal.account_closure(owner_ref,closed_at) VALUES($1,now()-interval '7 years')", [account.ownerRef]);
    }
    const acceptances = async () => (await su().query<{ owner: string; n: number }>(`SELECT owner_ref::text AS owner, count(*)::int AS n
      FROM legal.acceptance WHERE owner_ref = ANY($1::uuid[]) GROUP BY 1`, [[A.ownerRef, B.ownerRef]])).rows;
    const before = await acceptances();
    const { pool, login } = reader(api.runtime, "debateai_dev_api_system");
    const { result, seen } = await record(() => createRetentionPurge({ pool, clock: () => new Date(), log: () => undefined }).run());
    const after = await acceptances();
    const answered = [...new Set(seen.map((one) => one.user))];
    expect({ before: before.length, after, answered, legal: result.legal })
      .toEqual({ before: 2, after: [], answered: [login], legal: before.reduce((sum, row) => sum + row.n, 0) + 2 });
  });

  it("S7.1-R44 the classification constant (D37's three lists, 70 members: the probe's 66, dev's 1667370dd, synthesis-flag's two claim reads and audit run 3's NV-25 listing; NV-49 rewrote the probe's estimate.ts member) covers probes/REQ-FIX-RLS-2/unkeyed-reads.tsv EXACT, each member once", async () => {
    const classified = Object.entries(R44_CLASSIFICATION).flatMap(([kind, members]) => members.map(([member]) => ({ kind, member })));
    const counts = new Map<string, number>();
    for (const { member } of classified) counts.set(member, (counts.get(member) ?? 0) + 1);
    const base = R44_BASE_MEMBERS.map(([member]) => member);
    expect({
      lists: Object.fromEntries(Object.entries(R44_CLASSIFICATION).map(([kind, members]) => [kind, members.length])),
      twice: [...counts].filter(([, n]) => n > 1).map(([member]) => member),
      missing: base.filter((member) => !counts.has(member)),
      extra: [...counts.keys()].filter((member) => !base.includes(member))
    }).toEqual({ lists: { reader: 60, perAccount: 5, neverT1: 5 }, twice: [], missing: [], extra: [] });
    // R36/R44 at head: the rule re-run on this tree; every member must be one of the 70 (same file, same SQL text).
    const head = await unkeyedReads(PRODUCT_ROOT);
    const known = new Set(R44_BASE_MEMBERS.map(([member, sql]) => `${member.split(":")[0]}\t${sql}`));
    const unclassified = head.filter(({ file, sql }) => !known.has(`${file}\t${sql}`)).map(({ file, line, sql }) => `${file}:${line}\t${sql}`);
    expect({ head: head.length, unclassified }).toEqual({ head: 70, unclassified: [] });
  });
});

/** A's and B's e-mail blind indexes, as the sign-in and cancel-link readers receive them. */
async function blindIndexes(): Promise<Buffer[]> {
  return (await su().query<{ email_blind_index: Buffer }>(`SELECT email_blind_index FROM identity."user"
    WHERE user_id = ANY($1::uuid[]) ORDER BY user_id`, [[A.userId, B.userId]])).rows.map((row) => row.email_blind_index);
}

/**
 * Two accounts at the e-mail-verified, MFA-pending step (X18d-X18f read only `pending_mfa` accounts): a user row, a
 * consumed e-mail verification whose token hash is the enrolment capability, a totp factor awaiting its recovery codes
 * and one recovery code. Their marks are their own values.
 */
async function pendingMfaAccounts(label: string): Promise<Readonly<{
  a: Readonly<{ enrollmentHash: string }>; b: Readonly<{ enrollmentHash: string }>; marks: Marks;
}>> {
  const made: Record<"a" | "b", { enrollmentHash: string; values: string[] }> = { a: { enrollmentHash: "", values: [] }, b: { enrollmentHash: "", values: [] } };
  for (const owner of ["a", "b"] as const) {
    const userId = randomUUID(), ownerRef = randomUUID(), enrollmentHash = `sha256:${randomBytes(32).toString("hex")}`;
    await su().query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,audit_token,owner_ref,
        state,adult_affirmed_at,created_at)
      VALUES($1,$2,'{}'::jsonb,'$argon2id$fixture',$3,$4,$5,'pending_mfa',now(),now())`,
    [userId, randomBytes(32), `pseudo-${label}-${owner}-${userId.slice(0, 8)}`, randomUUID(), ownerRef]);
    await su().query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at,
        verification_token_hash,verification_consumed_at,verification_expires_at)
      VALUES($1,'email','{}'::jsonb,'verified',now(),now(),$2,now(),now()+interval '1 hour')`, [userId, enrollmentHash]);
    const factor = (await su().query<{ mfa_factor_id: string }>(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,
        created_at) VALUES($1,'totp','{}','recovery_pending',now()) RETURNING mfa_factor_id`, [userId])).rows[0]!.mfa_factor_id;
    const code = (await su().query<{ recovery_code_id: string }>(`INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_slot,
        code_hash,created_at) VALUES($1,$2,1,$3,now()) RETURNING recovery_code_id`,
    [randomUUID(), userId, `$argon2id$v=19$m=19456,t=2,p=1$rls-c7-${randomBytes(8).toString("hex")}$fixture`])).rows[0]!.recovery_code_id;
    made[owner] = { enrollmentHash, values: [userId, ownerRef, factor, code] };
  }
  return Object.freeze({
    a: Object.freeze({ enrollmentHash: made.a.enrollmentHash }),
    b: Object.freeze({ enrollmentHash: made.b.enrollmentHash }),
    marks: Object.freeze({ a: new Set(made.a.values), b: new Set(made.b.values) })
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// R44 (D37). The 66 members of probes/REQ-FIX-RLS-2/unkeyed-reads.tsv at base ca61cbe00 (file:line, the first 140
// characters of the literal with its whitespace folded), and D37's classification of each.
const R44_BASE_MEMBERS: readonly (readonly [string, string])[] = Object.freeze([
  ["apps/api/src/index.ts:6195", "SELECT assignment.task_class,assignment.model_id,assignment.model_version, assignment.provider,assignment.routing_decision_id FROM identity."],
  ["apps/api/src/preview-budget-estimate.ts:1226", "SELECT run.envelope_basis, run.discovered_panel, run.composition_budget_tier, run.register_version::integer AS register_version, EXISTS (SEL"],
  ["apps/api/src/preview-budget-estimate.ts:1281", "SELECT spend.provider_ref, spend.spend_source, count(*)::integer AS calls, sum(spend.input_tokens)::text AS input_tokens, sum(spend.output_t"],
  ["apps/api/src/release-state.ts:374", "SELECT count(DISTINCT run_id)::integer AS active FROM core.work_item WHERE state IN ('READY','CLAIMED') AND run_id IS NOT NULL"],
  ["packages/battery/src/index.ts:340", "SELECT item.work_item_id, item.run_id FROM core.work_item AS item JOIN core.run AS run ON run.run_id = item.run_id AND run.release_key = $2 "],
  ["packages/battery/src/index.ts:378", "SELECT item.work_item_id, item.run_id FROM core.work_item AS item JOIN core.run AS run ON run.run_id = item.run_id AND run.release_key = $2 "],
  // Merged from origin/dev (1667370dd, 2026-10-22; not at base): the runner's boot preload, listOpenRunSettingsVersions.
  ["packages/battery/src/index.ts:406", "SELECT DISTINCT run.register_version::integer AS register_version FROM core.work_item AS item JOIN core.run AS run ON run.run_id = item.run_"],
  ["packages/battery/src/index.ts:413", "SELECT work.work_item_id, work.run_id FROM core.work_item AS work JOIN ledger.model_spend_hold AS hold ON hold.run_id = work.run_id WHERE wo"],
  ["packages/battery/src/index.ts:471", "WITH candidate AS ( SELECT work_item_id FROM core.work_item AS item WHERE (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock"],
  // Security fixes run 3 (merged 2026-10-29; not at base): NV-25's stale-READY listing (WorkItemRepository.listReady, the
  // runner's own login, as listLapsedClaimed) and NV-49's estimator sample, which replaced the probe's estimate.ts:233
  // member (`WITH sample AS …`) with its candidate/ranked/sample CTEs, still inside readRecentRunUsage's X20 frame.
  ["packages/battery/src/index.ts:449", "SELECT item.work_item_id, item.run_id, run.register_version::integer AS register_version FROM core.work_item AS item JOIN core.run AS run ON"],
  ["packages/budget/src/estimate.ts:309", "WITH candidate AS ( SELECT run.run_id, run.asker_id, max(spend.recorded_at) AS last_charged_at FROM core.run AS run JOIN ledger.model_spend "],
  ["packages/budget/src/model-spend.ts:1032", "SELECT coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend WHERE charged_on = $1::date"],
  ["packages/budget/src/model-spend.ts:1071", "SELECT coalesce(sum(greatest(0, hold.held_micros - coalesce(spent.total, 0))), 0)::text AS total FROM ( SELECT DISTINCT work.run_id FROM cor"],
  ["packages/budget/src/model-spend.ts:1198", "SELECT ( coalesce((SELECT sum(charge_micros) FROM ledger.model_spend WHERE charged_on = $1::date), 0) + coalesce((SELECT sum(reserved_micros"],
  ["packages/db/src/billing-jobs.ts:138", "SELECT invoice_id, charge_id, kind FROM billing.invoice WHERE issuer = 'SMARTBILL' AND series = $1 AND number = $2 ORDER BY at DESC, invoice"],
  ["packages/db/src/billing-jobs.ts:162", "SELECT job.job_id, job.kind, job.ref, job.payload, job.last_error_code, job.done_at, job.dead_at, NOT EXISTS ( SELECT 1 FROM billing.outbox "],
  ["packages/db/src/billing-jobs.ts:206", "SELECT i.invoice_id, i.charge_id, i.kind, i.series, i.number, i.at, latest.efactura_status FROM billing.invoice AS i LEFT JOIN LATERAL ( SEL"],
  ["packages/db/src/billing-jobs.ts:234", "SELECT c.charge_id, c.subscription_id, c.created_at FROM billing.charge c WHERE c.payment_provider = $1 AND c.payment_environment = $2 AND c"],
  ["packages/db/src/billing-jobs.ts:260", "SELECT c.charge_id, c.subscription_id, c.period_start, c.attempt, c.created_at FROM billing.charge c WHERE c.payment_provider = $1 AND c.pay"],
  ["packages/db/src/billing-jobs.ts:304", "WITH facts AS ( SELECT c.charge_id, c.owner_ref::text AS owner_ref, c.subscription_id::text AS subscription_id, c.kind, c.quote_id::text AS "],
  ["packages/db/src/billing-jobs.ts:395", "SELECT subscription_id FROM billing.subscription_latest_v WHERE kind NOT IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED') AND ($1::uuid IS NULL "],
  ["packages/db/src/billing-jobs.ts:405", "SELECT 1 FROM billing.outbox WHERE kind=$1 AND ref=$2 LIMIT 1"],
  ["packages/db/src/billing.ts:301", "SELECT token.token_id AS \"tokenId\", token.customer_id AS \"customerId\", token.payment_provider AS \"paymentProvider\", token.payment_environmen"],
  ["packages/db/src/billing.ts:650", "SELECT ${SUBSCRIPTION_EVENT_COLUMNS} FROM billing.subscription_event AS event WHERE event.subscription_id IN ( SELECT latest.subscription_id"],
  ["packages/db/src/billing.ts:698", "SELECT ${SUBSCRIPTION_EVENT_COLUMNS} FROM billing.subscription_event AS event WHERE event.subscription_id IN ( SELECT created.subscription_i"],
  ["packages/db/src/billing.ts:714", "SELECT charge.subscription_id FROM billing.charge AS charge WHERE NOT (charge.payment_provider = $1 AND charge.payment_environment = $2) AND"],
  ["packages/db/src/billing.ts:722", "SELECT count(*) AS open_jobs FROM billing.outbox AS job WHERE job.done_at IS NULL AND job.dead_at IS NULL AND EXISTS ( SELECT 1 FROM billing"],
  ["packages/db/src/billing.ts:744", "SELECT ${SUBSCRIPTION_EVENT_COLUMNS} FROM billing.subscription_event AS event WHERE event.subscription_id IN ( SELECT created.subscription_i"],
  ["packages/db/src/billing.ts:772", "WITH edge AS (SELECT $1::timestamptz + interval '1 day' AS at) SELECT (SELECT count(*) FROM billing.subscription_event AS event, edge WHERE "],
  ["packages/db/src/billing.ts:875", "SELECT requested.charge_id, charge.owner_ref, charge.currency, requested.provider_payment_id, requested.error_code, requested.amount_micros:"],
  ["packages/db/src/billing.ts:986", "SELECT job_id FROM billing.outbox WHERE kind = $1 AND ref = $2 AND done_at IS NULL AND dead_at IS NULL"],
  ["packages/db/src/billing.ts:1017", "WITH candidate AS ( SELECT job.job_id FROM billing.outbox AS job WHERE job.kind = ANY($1::text[]) AND job.done_at IS NULL AND job.dead_at IS"],
  ["packages/db/src/billing.ts:1130", "WITH dated AS ( -- When the processor says the money moved; a row recorded without it falls back to when we recorded it. SELECT event.*, COA"],
  ["packages/db/src/billing.ts:1202", "SELECT charge.charge_id, charge.kind, charge.created_at FROM billing.charge AS charge WHERE charge.kind = ANY($1::text[]) AND charge.created"],
  ["packages/db/src/billing.ts:1236", "SELECT split_part(outbox.ref, ':', 1) AS charge_id, split_part(outbox.ref, ':', 2) AS transaction_id, outbox.payload ->> 'reason' AS reason,"],
  ["packages/db/src/billing.ts:1275", "SELECT split_part(outbox.ref, ':', 1) AS charge_id, outbox.kind, outbox.last_error_code AS code, COALESCE(outbox.claimed_at, outbox.not_befo"],
  ["packages/db/src/billing.ts:1330", "SELECT outbox.ref, outbox.payload ->> 'template' AS template, outbox.payload ->> 'recipient' AS recipient, outbox.last_error_code AS code, o"],
  ["packages/db/src/billing.ts:1355", "SELECT ${SUBSCRIPTION_EVENT_COLUMNS} FROM billing.subscription_event AS event ORDER BY event.subscription_id, event.seq"],
  ["packages/db/src/billing.ts:1380", "SELECT latest.subscription_id, latest.kind, latest.data ->> 'reason' AS reason, latest.at FROM ( SELECT DISTINCT ON (event.subscription_id) "],
  ["packages/db/src/billing.ts:1414", "SELECT pending.subscription_id, pending.paid_through FROM billing.entitlement_event AS pending WHERE pending.cause = 'RENEWAL_PENDING' AND p"],
  ["packages/db/src/billing.ts:1454", "SELECT charge.charge_id, failed.at AS since FROM billing.charge AS charge JOIN billing.charge_event AS failed ON failed.charge_id = charge.c"],
  ["packages/db/src/billing.ts:1509", "SELECT ${PAYMENT_NOTICE_COLUMNS} FROM billing.payment_notice AS notice WHERE notice.order_id = $1 ORDER BY notice.received_at DESC, CASE WHE"],
  ["packages/db/src/billing.ts:1531", "SELECT quarantine_id AS \"quarantineId\", received_at AS \"receivedAt\", reason, order_id AS \"orderId\", raw_ciphertext AS \"rawCiphertext\", heade"],
  ["packages/db/src/billing.ts:1619", "SELECT notice.notice_id::text AS \"noticeId\", notice.received_at AS \"receivedAt\", raw.raw_ciphertext AS \"rawCiphertext\" FROM billing.payment_"],
  ["packages/db/src/identity.ts:556", "SELECT u.user_id,u.pseudonym FROM identity.channel_binding binding JOIN identity.\"user\" u ON u.user_id=binding.user_id WHERE binding.verific"],
  ["packages/db/src/identity.ts:606", "SELECT u.user_id,u.pseudonym,factor.mfa_factor_id,factor.secret_ciphertext, factor.last_accepted_step,factor.state AS factor_state FROM iden"],
  ["packages/db/src/identity.ts:710", "SELECT u.user_id,code.recovery_code_id,code.code_hash,code.code_slot FROM identity.channel_binding binding JOIN identity.\"user\" u ON u.user_"],
  ["packages/db/src/index.ts:1603", "WITH picked AS ( SELECT pick.role, pick.model_id, count(*)::integer AS picked FROM core.run_role_rotation CROSS JOIN LATERAL (VALUES ('ANSWE"],
  ["packages/db/src/index.ts:2572", "WHEN count(work.work_item_id) = 0 AND EXISTS ( SELECT 1 FROM core.run_wait AS wait WHERE wait.run_id = run.run_id AND NOT EXISTS (SELECT 1 F"],
  ["packages/db/src/publication.ts:593", "WITH latest AS ( SELECT DISTINCT ON (event.run_id) event.run_id,event.publication_ref,event.state,event.at_seq FROM core.run_visibility_even"],
  ["packages/db/src/run-wait.ts:81", "run_id, waiting_since, owner_ref::text AS owner_ref, legacy_asker_id, plan_tier, composition_budget_tier, depth, maker_count, waits_for, per"],
  ["packages/db/src/run-wait.ts:118", "(line.person_recheck_at <= $1 OR EXISTS ( SELECT 1 FROM billing.entitlement_event AS event WHERE event.owner_ref = line.owner_ref AND event."],
  ["packages/db/src/run-wait.ts:192", "SELECT ${WAITING_COLUMNS} FROM core.run_waiting_v AS line ORDER BY waiting_since, run_id LIMIT $1"],
  ["packages/db/src/run-wait.ts:208", "SELECT count(*)::text AS count FROM core.run_waiting_v"],
  ["packages/db/src/run-wait.ts:222", "SELECT EXISTS ( SELECT 1 FROM core.run_waiting_v AS line WHERE (line.waits_for IS DISTINCT FROM 'PERSON' OR ${PERSON_BLOCK_MAY_HAVE_LIFTED})"],
  ["packages/db/src/run-wait.ts:254", "SELECT ${WAITING_COLUMNS} FROM core.run_waiting_v AS line WHERE ($2::timestamptz IS NULL OR (line.waiting_since, line.run_id) > ($2::timesta"],
  ["packages/db/src/serve-disclosure.ts:300", "( SELECT CASE WHEN jsonb_typeof(receipt.served_root_selection #> '{verdictLabel,basisAbsence}') = 'array' THEN jsonb_array_length(receipt.se"],
  ["packages/db/src/serve-disclosure.ts:317", "SELECT disclosure.answer_id::text AS answer_id, disclosure.answer_version, disclosure.run_id::text AS run_id, disclosure.writer_planned_ref,"],
  ["packages/evaluator/src/consumer-postgres.ts:99", "SELECT DISTINCT ON ( observation.provider,observation.model_id,observation.model_version, observation.domain_id,snapshot.publication_ref ) s"],
  ["packages/evaluator/src/index.ts:3121", "SELECT observation.observation_id,observation.run_id,observation.provider, observation.model_id,observation.model_version,observation.domain"],
  ["packages/evaluator/src/index.ts:3609", "SELECT entry.ledger_entry_id, artifact.raw_artifact_id, artifact.provider_ref, artifact.provider, artifact.model_id, artifact.model_version,"],
  ["packages/evaluator/src/index.ts:3651", "SELECT usage.provider, usage.model_id, usage.model_version, usage.runtime_class, usage.raw_usage FROM evaluator.model_call_usage AS usage JO"],
  ["packages/ledger/src/index.ts:110", "(${entry}.outcome = 'FAILED' AND EXISTS ( SELECT 1 FROM ledger.ledger_entry AS repair_answer WHERE repair_answer.run_id = ${entry}.run_id AN"],
  ["packages/liveness/src/index.ts:366", "WITH subjects AS ( SELECT node.run_id, 'NODE'::text AS subject_kind, node.node_id::text AS subject_ref, node.relevant_as_of FROM core.node A"],
  ["packages/liveness/src/index.ts:415", "WITH ordered AS ( SELECT run_id, provider_ref, model_version, at_seq, lag(model_version) OVER (PARTITION BY run_id, provider_ref ORDER BY at"],
  ["packages/liveness/src/index.ts:473", "SELECT run.run_id, max(query.occurred_at) AS as_of, EXISTS ( SELECT 1 FROM ( SELECT DISTINCT ON (trigger_key) trigger_key, state FROM core.r"],
  ["packages/serve/src/index.ts:2026", "AND NOT EXISTS ( SELECT 1 FROM core.work_item AS failed WHERE failed.run_id = run.run_id AND failed.state = 'FAILED' AND failed.terminal_rea"],
  ["packages/serve/src/synthesis-check.ts:81", "SELECT request.request_id,request.run_id,request.answer_id, request.answer_version,request.requested_at FROM serve.synthesis_check_request A"],
  ["packages/serve/src/synthesis-check.ts:110", "SELECT clock_timestamp() < requested_at + make_interval(secs => $2::double precision / 1000.0) AS fresh FROM serve.synthesis_check_request W"],
  ["packages/settlement/src/index.ts:713", "SELECT answer_outcome_id, model_id, model_version, provider, task_class, prior, posterior, resolved_outcome, proper_score_total, proper_scor"],
]);
const R44_IDENTIFIERS: readonly string[] = Object.freeze([
  "abstention_id", "acceptance_id", "alias_revocation_id", "alias_row_id", "answer_id", "answer_outcome_id",
  "answer_version", "at_seq", "attempt", "attempt_id", "audit_id", "author_raw_artifact_ref", "battery_row_id",
  "body_sha256", "candidate_artifact_ref", "candidate_record_id", "channel_binding_id", "charge_id",
  "chosen_root_node_id", "code_hash", "command_key", "composed_text_id", "condition_mark_id",
  "conformance_record_id", "created_at_seq", "critic_ledger_entry_ref", "critique_packet_id", "critique_packet_ref",
  "customer_id", "decision_record_id", "edge_id", "email_blind_index", "environment", "evaluator_artifact_ref",
  "event_id", "evicted_number_ref", "external_ref", "fact_bundle_id", "from_root_node_id", "hold_id",
  "idempotency_key", "independence_receipt_id", "internal_grant_event_id", "internal_grant_id", "invoice_id",
  "issuer", "item_id", "job_id", "judge_seat", "kind", "leader_with_root_node_id", "leader_without_root_node_id",
  "ledger_entry_id", "login_challenge_id", "memory_link_event_id", "memory_link_id", "mfa_factor_id", "new_run_id",
  "node_id", "node_review_id", "notice_id", "objection_record_id", "old_run_id", "outcome", "outcome_attempt_id",
  "outcome_id", "overlay_run_id", "owner_ref", "packet_fingerprint", "parent_node_id", "payload_sha256",
  "payment_environment", "payment_provider", "period_start", "polarity", "prev_hash", "prior_run_id",
  "profile_event_id", "propagation_run_id", "provenance_ref", "pseudonym", "publication_ref", "pull_record_id",
  "quarantine_id", "question_key_id", "question_liveness_event_id", "quote_id", "raw_artifact_id",
  "raw_artifact_ref", "read_id", "reason_id", "recorded_at_seq", "recovery_code_id", "reduced_judgement_id",
  "reduced_judgement_ref", "removed_node_id", "restatement_id", "reversal_point_id", "review_clock_event_id",
  "review_node_ref", "review_outcome", "review_raw_artifact_ref", "review_ref", "revision_trigger_event_id",
  "root_index", "root_node_id", "round", "routing_decision_id", "run_id", "run_ownership_event_id",
  "run_visibility_event_id", "sealed_at_seq", "segment_id", "selected_judgement_ref", "seq", "sequence",
  "served_number_id", "session_assignment_id", "session_id", "shadow_suppression_id", "snapshot_at_seq",
  "social_identity_id", "source_node_id", "source_run_id", "spend_id", "staleness_state_event_id", "status_event_id",
  "story_id", "subscription_id", "substitution_id", "superseded_by_answer_outcome_id", "symmetry_diff_id",
  "synthesis_round_id", "target_edge_id", "target_edge_polarity", "target_node_id", "this_hash", "token_hash",
  "token_id", "token_sha256", "user_id", "value_hinge_id", "verification_trigger_basis_id", "version",
  "withdrawn_event_id", "work_item_id"
]);

/** One D37 list: `file:line` of a member and the X id (or reason) it is classified under; typed so each pair stays a pair. */
function members(list: readonly (readonly [string, string])[]): readonly (readonly [string, string])[] {
  return Object.freeze(list);
}

const R44_CLASSIFICATION: Readonly<Record<"reader" | "perAccount" | "neverT1", readonly (readonly [string, string])[]>> = Object.freeze({
  reader: members([
    ["apps/api/src/preview-budget-estimate.ts:1226", "X21"], ["apps/api/src/preview-budget-estimate.ts:1281", "X21"],
    ["apps/api/src/release-state.ts:374", "X19"],
    ["packages/battery/src/index.ts:340", "X1"], ["packages/battery/src/index.ts:378", "X1"], ["packages/battery/src/index.ts:406", "X1"],
    ["packages/battery/src/index.ts:471", "X1"], ["packages/battery/src/index.ts:449", "X1"],
    ["packages/battery/src/index.ts:413", "X13"],
    ["packages/budget/src/estimate.ts:309", "X20"],
    ["packages/budget/src/model-spend.ts:1032", "X23"], ["packages/budget/src/model-spend.ts:1071", "X23"], ["packages/budget/src/model-spend.ts:1198", "X23"],
    ...[138, 162, 206, 234, 260, 304, 395, 405].map((line) => [`packages/db/src/billing-jobs.ts:${line}`, "X11"] as const),
    ...[301, 650, 698, 714, 722, 744, 772, 875, 986, 1017, 1130, 1202, 1236, 1275, 1330, 1355, 1380, 1414, 1454, 1509, 1531, 1619]
      .map((line) => [`packages/db/src/billing.ts:${line}`, "X11"] as const),
    ["packages/db/src/identity.ts:556", "X18d"], ["packages/db/src/identity.ts:606", "X18e"], ["packages/db/src/identity.ts:710", "X18f"],
    ["packages/db/src/index.ts:1603", "X24"],
    ["packages/db/src/publication.ts:593", "X10"],
    ...[81, 118, 192, 208, 254].map((line) => [`packages/db/src/run-wait.ts:${line}`, "X13"] as const),
    ["packages/db/src/run-wait.ts:222", "X22"],
    ["packages/liveness/src/index.ts:366", "X2"], ["packages/liveness/src/index.ts:415", "X2"], ["packages/liveness/src/index.ts:473", "X2"],
    ["packages/serve/src/synthesis-check.ts:81", "X26"], ["packages/serve/src/synthesis-check.ts:110", "X26"],
    ["packages/settlement/src/index.ts:713", "X4"]
  ]),
  perAccount: members([
    ["packages/db/src/index.ts:2572", "wait.run_id = run.run_id inside readLoadingProjection, keyed by the requested run"],
    ["packages/db/src/serve-disclosure.ts:300", "joined on the requested answer's run_id/answer_id by the enclosing query"],
    ["packages/db/src/serve-disclosure.ts:317", "joined on the requested answer's run_id/answer_id by the enclosing query"],
    ["packages/ledger/src/index.ts:110", "${entry} alias correlated to the outer entry's run"],
    ["packages/serve/src/index.ts:2026", "failed.run_id = run.run_id"]
  ]),
  neverT1: members([
    ["apps/api/src/index.ts:6195", "readDeployment, GET /v1/deployment, auth operator, refused OPERATOR_REQUIRED"],
    ["packages/evaluator/src/consumer-postgres.ts:99", "evaluator logins (X5, the evaluator API)"],
    ["packages/evaluator/src/index.ts:3121", "evaluator logins (X5, the evaluator API)"],
    ["packages/evaluator/src/index.ts:3609", "evaluator logins (X5, the evaluator API)"],
    ["packages/evaluator/src/index.ts:3651", "evaluator logins (X5, the evaluator API)"]
  ])
});

/** probes/REQ-FIX-RLS-2/unkeyed-reads.py, ported: its STOP list, identifier set and regular expressions, unchanged. */
const R44_STOP = new Set(["environment", "kind", "issuer", "outcome", "attempt", "at_seq", "version", "polarity", "round", "seq", "sequence",
  "payment_environment", "payment_provider", "period_start", "root_index", "judge_seat", "review_outcome", "answer_version",
  "created_at_seq", "recorded_at_seq", "sealed_at_seq", "snapshot_at_seq", "target_edge_polarity"]);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function tsFiles(directory: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", "__tests__", "test", "tests"].includes(entry.name)) out.push(...await tsFiles(path));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      out.push(path);
    }
  }
  return out;
}

async function unkeyedReads(root: string): Promise<{ file: string; line: number; sql: string }[]> {
  const idcols = new Set([...R44_IDENTIFIERS.filter((name) => !R44_STOP.has(name)),
    "owner_ref", "user_id", "identity_owner_ref", "asker_id", "legacy_asker_id", "run_id"]);
  const members = RLS_IN_SCOPE.map(({ relation }) => relation);
  const relations = members.map((member) => {
    const [schema, name] = member.split(".") as [string, string];
    return [member, new RegExp(`\\b(?:FROM|JOIN)\\s+${escapeRegExp(schema)}\\s*\\.\\s*"?${escapeRegExp(name)}"?\\b`, "iu")] as const;
  });
  const alternatives = [...idcols].sort((x, y) => y.length - x.length).map(escapeRegExp).join("|");
  const ident = new RegExp(`\\b(?:[a-z_]+\\.)?"?(${alternatives}|[a-z_]*_run_id|[a-z_]*_owner_ref|[a-z_]*_user_id)"?\\s*(?:=\\s*ANY\\s*\\(\\s*\\$\\d|=\\s*\\$\\d|IN\\s*\\(\\s*\\$\\d|=\\s*\\(\\s*\\$\\d)`, "iu");
  const owned = /core\.(?:run_is_owned_by|lock_owned_live_runs)\s*\(/iu;
  const literal = /`((?:[^`\\]|\\.)*)`|"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/gsu;
  const packages = (await readdir(join(root, "packages"))).sort();
  const directories = [join(root, "apps/api/src"), ...packages.map((name) => join(root, "packages", name, "src"))];
  const out: { file: string; line: number; sql: string }[] = [];
  for (const directory of directories) {
    for (const path of await tsFiles(directory)) {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(literal)) {
        const text = match[1] ?? match[2] ?? match[3] ?? "";
        if (!/\b(SELECT|WITH)\b/u.test(text)) continue;
        if (!relations.some(([, pattern]) => pattern.test(text))) continue;
        if (ident.test(text) || owned.test(text)) continue;
        out.push({ file: relative(root, path), line: source.slice(0, match.index).split("\n").length,
          sql: text.split(/\s+/u).filter((part) => part !== "").join(" ").slice(0, 140) });
      }
    }
  }
  return out;
}
