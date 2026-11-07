// V4 start step, Task 57f (the owner's 7 Nov answers, his words: "we need to have a way to continue where it 'broke', and not charge the
// customer again ... Only if we can't re-use, then we need to pay for this ourselves"; cards "Only what never ran" and "Button on the stopped
// page") — A FAILED DEBATE CONTINUES WHERE IT STOPPED, AND THE PERSON PAYS ONLY FOR WHAT NEVER RAN. On real PostgreSQL:
//  1. 0165's re-open: the person's own FAILED debate's work item goes back to be claimed, once per failure (a second press while it runs writes
//     nothing), recorded insert-only; another account's debate is not theirs; what is not continuable is refused; only the API's role may.
//  2. The pre-Start readers keep their meaning while the debate runs again and after it ends.
//  3. The waiver, call by call: the runner's writer takes over only charges recorded on that debate, once; the person's windows, a funded
//     grant's and the team's leave them out; the site's day keeps them.
//  4. End to end, with the preview harness's scripted vendors and a hosted runner's money guard: a debate stops on our side, its one automatic
//     retry stops too (the second time while a review's every attempt was charged and never answered); Continue re-opens it; the next copy
//     replays every answered call (never bought again), buys the review again and finishes; the stopped copy's charges for that review are the
//     site's, so the person pays each answered call once, what an unbroken debate of the same calls costs.
// Integration suites are skipped by the CI gate: run this file by hand, alone. Every figure and question is made up.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { RUN_PATH_SET_REFUSALS, WorkItemRepository } from "@debateai/battery";
import {
  CostEnvelopeGuard, PostgresModelSpendStore, linkPreStartTry, preStartSpendRef, readRunQuotaUsed, recordPreStartCharge, type PreStartChargeKind
} from "@debateai/budget";
import { PostgresDigModelRepository, createPool, migrate, type Pool } from "@debateai/db";
import type { ProviderCostEnvelopeSeam } from "@debateai/providers";
import { runnerTerminalFailureReason } from "@debateai/runner";
import { continuedRunWake } from "../../apps/api/src/month-pause.js";
import { continueFailedRun, failedRunContinuable, type FailedRunContinuePort } from "../../apps/api/src/run-continue.js";
import { createRunInFlight } from "../../apps/runner/src/run-in-flight.js";
import { waiveRedoneCalls } from "../../apps/runner/src/run-replay.js";
import { PANEL_REFS, TARGETS, previewDebateHarness, type PreviewRunnerMoney } from "../support/preview-debate-harness.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import { createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
let runner: Pool;
let billing: Pool;
let erasure: Pool;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, database: () => database, stubClosers });

const loginPool = (role: string, password: string): Pool => {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return createPool(url.toString());
};
type SqlError = { code?: string | undefined; message?: string | undefined };
async function sqlError(run: () => Promise<unknown>): Promise<SqlError> {
  try { await run(); return { code: undefined, message: undefined }; } catch (error) { return error as SqlError; }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // As production's logins (packages/db's principals): the runner's and the API's system login each hold the cross-account marker.
  for (const [login, role] of [["rc_runner", "debateai_runtime, debateai_rls_all_accounts"], ["rc_billing", "debateai_billing_runtime, debateai_rls_all_accounts"],
    ["rc_erasure", "debateai_erasure_runtime"]] as const) {
    await database.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${login}-test-only' IN ROLE ${role}`);
  }
  runner = loginPool("rc_runner", "rc_runner-test-only");
  billing = loginPool("rc_billing", "rc_billing-test-only");
  erasure = loginPool("rc_erasure", "rc_erasure-test-only");
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => {
  await Promise.all([runner?.end(), billing?.end(), erasure?.end()]);
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

const STOP = "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED";
/** The person's own debate, as the asks route starts one (its ownership event names them). */
const ownRun = (): Promise<string> => createEncryptedStoryRun(database.pool, owner!, "Should Harbour Town build a second ferry pier?");
/** The debate's work item in `state`, written past every trigger as the database's own fixtures write one; its id. */
async function workItem(runId: string, state: "READY" | "DONE" | "FAILED", reason: string | null = state === "FAILED" ? STOP : null): Promise<string> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    const id = (await seed.query<{ work_item_id: string }>(`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,terminal_reason,created_at_seq)
      VALUES ($1,'Q1','[]'::jsonb,$2,$3,$4,ledger.allocate_sequence()) RETURNING work_item_id::text`, [runId, `run-continue:${randomUUID()}`, state, reason])).rows[0]!.work_item_id;
    await seed.query("COMMIT");
    return id;
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
const itemRow = async (workItemId: string) => (await database.pool.query<{ state: string; terminal_reason: string | null; claimed_by: string | null }>(
  "SELECT state, terminal_reason, claimed_by FROM core.work_item WHERE work_item_id=$1", [workItemId])).rows[0]!;
const reopens = async (workItemId: string) => (await database.pool.query<{ reopen_no: number; run_id: string }>(
  "SELECT reopen_no, run_id::text AS run_id FROM core.work_item_reopen WHERE work_item_id=$1 ORDER BY reopen_no", [workItemId])).rows;
/** The API's port over 0165's read and re-open, on the API's own role's login. */
const storeOn = (pool: Pool): FailedRunContinuePort => {
  const repository = new PostgresDigModelRepository(pool);
  return {
    readContinue: (ownerRef, runId) => repository.readRunContinue(ownerRef, runId),
    reopen: (ownerRef, runId, destination) => repository.continueFailedRun(ownerRef, runId, destination?.releaseKey ?? null, destination?.registerVersion ?? null)
  };
};
function wakeLog() {
  const dispatched: Readonly<{ runId: string; workItemId: string }>[] = [];
  const wake = continuedRunWake({ claimableWorkItemOf: (runId) => new WorkItemRepository(database.pool).claimableWorkItemOfRun(runId),
    dispatch: async (job) => { dispatched.push(job); } });
  return { dispatched, wake };
}

describe("0165 (Task 57f): Continue re-opens the person's own failed debate", () => {
  it("once per failure: CONTINUING, its work item back to be claimed and the re-open recorded; a second press writes nothing; the API's role only", async () => {
    const run = await ownRun();
    const item = await workItem(run, "FAILED");
    const store = storeOn(billing);
    const facts = await store.readContinue(owner!.ownerRef, run);
    expect(facts).toEqual({ state: "FAILED", terminal_reason: STOP, content_live: true, waived: false, settled: false, paused: false, reopened: false });
    expect(failedRunContinuable(facts)).toBe(true);
    const { dispatched, wake } = wakeLog();
    const press = () => continueFailedRun({ ownerRef: owner!.ownerRef, runId: run, now: new Date() }, { store, wake });
    await expect(press()).resolves.toEqual({ kind: "CONTINUING" });
    // Claimable at once (a lapsed claim, as a copy that let go of it leaves it): the wake hands it on, or the runner's re-send of lapsed claims.
    expect(await itemRow(item)).toEqual({ state: "CLAIMED", terminal_reason: null, claimed_by: "continue" });
    expect((await new WorkItemRepository(database.pool).listLapsedClaimed(1000)).map((job) => job.workItemId)).toContain(item);
    expect(await reopens(item)).toEqual([{ reopen_no: 1, run_id: run }]);
    expect(dispatched).toEqual([{ runId: run, workItemId: item }]);
    expect(await store.readContinue(owner!.ownerRef, run)).toMatchObject({ state: "OPEN", terminal_reason: null, reopened: true });
    // A second press while it runs: CONTINUING again, nothing re-opened twice (the database answers so itself too).
    await expect(press()).resolves.toEqual({ kind: "CONTINUING" });
    expect(await new PostgresDigModelRepository(billing).continueFailedRun(owner!.ownerRef, run, null, null)).toBe("CONTINUING");
    expect(await reopens(item)).toHaveLength(1);
    // Another account's debate is not theirs: no facts, and the re-open refuses it.
    const stranger = randomUUID();
    expect(await store.readContinue(stranger, run)).toBeNull();
    expect(await new PostgresDigModelRepository(billing).continueFailedRun(stranger, run, null, null)).toBe("NOT_OWNED");
    await expect(continueFailedRun({ ownerRef: stranger, runId: run, now: new Date() }, { store })).resolves.toEqual({ kind: "NOT_FOUND" });
    // It stops on our side again: it can continue again, and that re-open is the second.
    await database.pool.query("UPDATE core.work_item SET state='FAILED', terminal_reason=$2, claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1",
      [item, STOP]);
    await expect(press()).resolves.toEqual({ kind: "CONTINUING" });
    expect((await reopens(item)).map((row) => row.reopen_no)).toEqual([1, 2]);
    // The runner's role, and every other role, never re-opens a debate; the record is insert-only.
    for (const pool of [runner, erasure]) {
      expect((await sqlError(() => pool.query("SELECT core.continue_failed_run($1,$2,NULL,NULL)", [owner!.ownerRef, run]))).code).toBe("42501");
      expect((await sqlError(() => pool.query("SELECT core.read_run_continue($1,$2)", [owner!.ownerRef, run]))).code).toBe("42501");
      expect((await sqlError(() => pool.query("SELECT count(*) FROM core.work_item_reopen"))).code).toBe("42501");
    }
    for (const sql of ["UPDATE core.work_item_reopen SET reopen_no = 9 WHERE work_item_id=$1", "DELETE FROM core.work_item_reopen WHERE work_item_id=$1"]) {
      expect((await sqlError(() => database.pool.query(sql, [item]))).code, sql).toBeDefined();
    }
    expect(await reopens(item)).toHaveLength(2);
  });

  it("refuses what is not continuable (set aside by an upload, never queued, settled, paused at the month wall); NOT_FAILED for the rest", async () => {
    const repository = new PostgresDigModelRepository(billing);
    const refused = async (prepare: (runId: string, itemId: string) => Promise<unknown>, reason: string = STOP) => {
      const run = await ownRun();
      const item = await workItem(run, "FAILED", reason);
      await prepare(run, item);
      expect(await repository.continueFailedRun(owner!.ownerRef, run, null, null), reason).toBe("NOT_CONTINUABLE");
      expect(failedRunContinuable(await repository.readRunContinue(owner!.ownerRef, run)), reason).toBe(false);
      expect(await itemRow(item)).toMatchObject({ state: "FAILED" });
      expect(await reopens(item)).toEqual([]);
    };
    await refused((run) => database.pool.query("INSERT INTO ledger.model_spend_waiver (run_id, reason) VALUES ($1,'BACKSTOP')", [run]), "RUN_SET_ASIDE:BACKSTOP");
    await refused(async () => undefined, "RUN_SET_ASIDE:OWNER_STOPPED");
    await refused(async () => undefined, "RUN_SETUP_FAILED:COST_RECORD");
    await refused((_run, item) => database.pool.query("UPDATE core.work_item SET settled_attempt_id=gen_random_uuid(), settled_artifact_ref=gen_random_uuid() WHERE work_item_id=$1", [item]),
      "CALL_BUDGET_EXHAUSTED");
    await refused((run) => database.pool.query("SELECT identity.record_run_pause($1,'MONTH_WALL',clock_timestamp() + interval '1 hour',1,1,1)", [run]));
    // Task 57h: a path debate the runner refused at its claim because its stored set can never run (every copy would meet it again).
    for (const code of RUN_PATH_SET_REFUSALS) await refused(async () => undefined, code);
    // A stop the person caused, or a spending wall: the database re-opens what the API asks, so the API's rule refuses it first.
    const walled = await ownRun();
    await workItem(walled, "FAILED", "RUNNER_EXECUTION_FAILED:PERSON_ALLOWANCE_REACHED");
    await expect(continueFailedRun({ ownerRef: owner!.ownerRef, runId: walled, now: new Date() }, { store: storeOn(billing) }))
      .resolves.toEqual({ kind: "NOT_CONTINUABLE" });
    // Neither failed nor re-opened: the month wall's Continue answers it, as before.
    const running = await ownRun();
    await workItem(running, "READY");
    expect(await repository.continueFailedRun(owner!.ownerRef, running, null, null)).toBe("NOT_FAILED");
    const waiting = await ownRun();
    expect(await repository.readRunContinue(owner!.ownerRef, waiting)).toMatchObject({ state: "NONE", reopened: false });
    expect(await repository.continueFailedRun(owner!.ownerRef, waiting, null, null)).toBe("NOT_FAILED");
  });
});

describe("0165 (Task 57f): the pre-Start readers keep their meaning while a continued debate runs and after it ends", () => {
  const entry = (ownerRef: string, chargeMicros: number, kind: PreStartChargeKind) => ({
    spendId: randomUUID(), ownerRef, grant: null, kind, providerRef: preStartSpendRef(kind, "deepinfra", "zai-org/GLM-5.3-Flash"),
    chargedOn: new Date().toISOString().slice(0, 10), chargeMicros, inputTokens: 700, outputTokens: 90 });
  it("a debate that kept nothing its lists bought gives their charge back while FAILED; continued, it counts again; ended DONE, nothing is given back", async () => {
    const run = await ownRun();
    const tryRef = createHash("sha256").update(`try:${randomUUID()}`).digest("hex");
    await recordPreStartCharge(runner, { ...entry(owner!.ownerRef, 4, "LIST"), tryRef });
    expect(await linkPreStartTry(runner, { ownerRef: owner!.ownerRef, tryRef, runId: run })).toBe(1);
    const item = await workItem(run, "FAILED");
    const quota = () => readRunQuotaUsed(runner, { ownerRef: owner!.ownerRef, runId: run });
    expect(await quota()).toBe("NONE");
    await expect(continueFailedRun({ ownerRef: owner!.ownerRef, runId: run, now: new Date() }, { store: storeOn(billing) })).resolves.toEqual({ kind: "CONTINUING" });
    expect(await quota()).toBe("SOME");
    await database.pool.query("UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1", [item]);
    expect(await quota()).toBe("SOME");
  });

  /** The debate's set as 0159 keeps it (codes only here: written past the content check, as the database's own fixtures write one). */
  async function menuSet(runId: string): Promise<void> {
    const seed = await database.pool.connect();
    try {
      await seed.query("BEGIN");
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query(`INSERT INTO core.start_path_set (run_id,source,width,path_count,chosen_by,carry_on_to_report,content_ciphertext,content_attestation)
        VALUES ($1,'MENU',3,3,'PERSON',false,'{}'::jsonb,'\\x00'::bytea)`, [runId]);
      await seed.query("COMMIT");
    } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
  }

  it("paths kept from the list keep their charge while the debate can continue; a debate never queued can never continue: given back", async () => {
    const [continuable, neverQueued] = [await ownRun(), await ownRun()];
    for (const run of [continuable, neverQueued]) {
      const tryRef = createHash("sha256").update(`try:${randomUUID()}`).digest("hex");
      await recordPreStartCharge(runner, { ...entry(owner!.ownerRef, 3, "MERGE"), tryRef });
      expect(await linkPreStartTry(runner, { ownerRef: owner!.ownerRef, tryRef, runId: run })).toBe(1);
      await menuSet(run);
    }
    await workItem(continuable, "FAILED");
    await workItem(neverQueued, "FAILED", "RUN_SETUP_FAILED:COST_RECORD");
    expect(await readRunQuotaUsed(runner, { ownerRef: owner!.ownerRef, runId: continuable })).toBe("SOME");
    expect(await readRunQuotaUsed(runner, { ownerRef: owner!.ownerRef, runId: neverQueued })).toBe("NONE");
  });
});

describe("0165 (Task 57f): the waiver, call by call", () => {
  const spend = async (runId: string, micros: number, attemptId: string | null = randomUUID()) => {
    await database.pool.query(`INSERT INTO ledger.model_spend (spend_id,spend_source,spend_phase,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens,attempt_id)
      VALUES (gen_random_uuid(),'RUN','BODY',$1,'fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,$2,1,1,$3)`, [runId, micros, attemptId]);
    return attemptId!;
  };
  const scope = (runId: string) => database.pool.query(`INSERT INTO billing.run_charge_scope (run_id,owner_ref,admitted_at,funding_kind,plan_id,entitlement_event_id)
    VALUES ($1,$2,now() - interval '1 minute','SUBSCRIPTION','PLUS',gen_random_uuid())`, [runId, owner!.ownerRef]);

  it("the runner's writer takes over only charges recorded on that debate, once; the person's windows and quota leave them out; the site's day keeps them", async () => {
    const [run, other] = [await ownRun(), await ownRun()];
    await scope(run);
    await scope(other);
    const [first, second, elsewhere] = [await spend(run, 7), await spend(run, 5), await spend(other, 3)];
    const from = new Date(Date.now() - 600_000);
    const to = new Date(Date.now() + 600_000);
    const store = new PostgresModelSpendStore(runner);
    const site = new PostgresModelSpendStore(database.pool);
    const day = new Date().toISOString().slice(0, 10);
    const [before, dayBefore] = [await store.readOwnerSpentMicros(owner!.ownerRef, from, to), await site.readDaySpentMicros(day)];
    await workItem(run, "FAILED");
    const quota = () => readRunQuotaUsed(runner, { ownerRef: owner!.ownerRef, runId: run });
    expect(await quota()).toBe("SOME");
    // Another debate's charge and an attempt with no charge are never taken; the debate's own is, once.
    expect(await waiveRedoneCalls(runner, run, [first, elsewhere, randomUUID()])).toBe(1);
    expect(await waiveRedoneCalls(runner, run, [first])).toBe(0);
    expect(await store.readOwnerSpentMicros(owner!.ownerRef, from, to)).toBe(before - 7);
    expect(await store.readOwnerSpentInRangesMicros(owner!.ownerRef, [{ from, to }])).toEqual([before - 7]);
    expect(await site.readDaySpentMicros(day)).toBe(dayBefore);
    expect(await quota()).toBe("SOME");
    expect(await waiveRedoneCalls(runner, run, [second])).toBe(1);
    expect(await quota()).toBe("NONE");
    expect(await store.readOwnerSpentMicros(owner!.ownerRef, from, to)).toBe(before - 12);
    // Only the runtime role writes or reads it; the table itself is read by no role, and it is insert-only.
    expect((await sqlError(() => waiveRedoneCalls(erasure, run, [second]))).code).toBe("42501");
    for (const pool of [runner, billing, erasure]) {
      expect((await sqlError(() => pool.query("SELECT count(*) FROM ledger.model_spend_call_waiver"))).code).toBe("42501");
    }
    for (const sql of ["UPDATE ledger.model_spend_call_waiver SET run_id = run_id WHERE attempt_id=$1", "DELETE FROM ledger.model_spend_call_waiver WHERE attempt_id=$1"]) {
      expect((await sqlError(() => database.pool.query(sql, [first]))).code, sql).toBeDefined();
    }
    expect((await sqlError(() => waiveRedoneCalls(runner, run, []))).code).toBe("22023");
  });

  it("a team member's grant and the team's limit leave a taken-over call out too", async () => {
    const run = await ownRun();
    const [grant, event] = [randomUUID(), randomUUID()];
    // Written past the register's foreign key, as the database's own fixtures write a grant (tests/integration/r22-foundation-database.test.ts).
    const seed = await database.pool.connect();
    try {
      await seed.query("BEGIN");
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query(`INSERT INTO billing.internal_grant (grant_id,owner_ref,configured_event_id,revision,amount_micros,day_micros,week_micros,starts_at,expires_at,funding_approval_ref,policy_register_version)
        VALUES ($1,$2,$3,1,1000000,1000000,1000000,now()-interval '1 day',now()+interval '1 day','fixture',1)`, [grant, owner!.ownerRef, event]);
      await seed.query(`INSERT INTO billing.run_charge_scope (run_id,owner_ref,admitted_at,funding_kind,internal_grant_id,internal_grant_event_id)
        VALUES ($1,$2,now(),'INTERNAL',$3,$4)`, [run, owner!.ownerRef, grant, event]);
      await seed.query("COMMIT");
    } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
    const attempt = await spend(run, 40);
    await spend(run, 2);
    const from = new Date(Date.now() - 600_000);
    const to = new Date(Date.now() + 600_000);
    const granted = async () => Number((await database.pool.query<{ total: string }>("SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total",
      [owner!.ownerRef, grant, event, from, to])).rows[0]!.total);
    const team = async () => Number((await database.pool.query<{ total: string }>("SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to])).rows[0]!.total);
    const [grantBefore, teamBefore] = [await granted(), await team()];
    expect(grantBefore).toBe(42);
    expect(await waiveRedoneCalls(runner, run, [attempt])).toBe(1);
    expect(await granted()).toBe(2);
    expect(await team()).toBe(teamBefore - 40);
  });
});

// ── End to end ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
/** Every answered or refused request the stub answers reports 100 tokens in and 50 out: one charged attempt costs this. */
const ONE_ATTEMPT = 150;
const WORKER = "runner:preview-busy-model";
/** The first copy is lost right after its third review is answered; the retry right after its second new one, whose answer is garbage. */
const FIRST_LOST_AT = 3;
const SECOND_LOST_AT = 2;
const GARBAGE = "{ this is not the answer the review was asked for";

describe("Task 57f end to end: a debate stopped twice on our side continues where it stopped", () => {
  it("answered calls are replayed, never bought again; the review bought again is the site's; the person pays each answered call once", async () => {
    const pool = database.pool;
    const store = new PostgresModelSpendStore(pool);
    const debate = await harness.admittedRun("continued", { panelRefs: PANEL_REFS, depth: 2, owner: owner! });
    const guard = new CostEnvelopeGuard({ store, policy: { perRunCeilingMicros: 50_000_000, dailyCeilingMicros: Number.MAX_SAFE_INTEGER },
      inFlight: createRunInFlight() });
    const storySeam: ProviderCostEnvelopeSeam = { assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined };
    const money: PreviewRunnerMoney = {
      buildCostEnvelopeSeam: () => (seamRunId, phase, sharedWall) => guard.providerSeam({ runId: seamRunId, price: PRICE, requireReportedUsage: true, phase, sharedWall }),
      buildStoryCostEnvelopeSeam: () => () => storySeam,
      providerPrices: new Map(TARGETS.map((target) => [target.providerRef, PRICE]))
    };
    const scripted = scriptedAnswers(debate.question);
    const copies = { phase: 1 as 1 | 2 | 3, reviews: 0, first: new AbortController(), second: new AbortController() };
    const gates = await harness.startGates({}, undefined, (request, chat) => {
      if (request.kind === "REVIEW" && copies.phase !== 3) {
        copies.reviews += 1;
        if (copies.phase === 1 && copies.reviews === FIRST_LOST_AT) copies.first.abort();
        // The retry's review: every attempt of it is answered with words that are not an answer (each charged), and the copy is lost.
        if (copies.phase === 2 && copies.reviews >= SECOND_LOST_AT) {
          copies.second.abort();
          return { content: GARBAGE };
        }
      }
      return scripted(request, chat);
    });
    const settled = async () => {
      const settleBy = Date.now() + 30_000;
      for (let last = -1, stillSince = Date.now(); ;) {
        const now = Number((await pool.query<{ n: string }>("SELECT count(*) AS n FROM ledger.ledger_entry WHERE run_id=$1", [debate.runId])).rows[0]!.n);
        if (now !== last) { last = now; stillSince = Date.now(); }
        if (gates.arrivals.every((arrival) => arrival.answeredAt !== null) && Date.now() - stillSince >= 1_000) return;
        if (Date.now() > settleBy) throw new Error("test: the lost copy's calls did not settle within 30 s");
        await new Promise((resolve) => { setTimeout(resolve, 100); });
      }
    };
    const work = new WorkItemRepository(pool, { releaseKey: "legacy", workerId: WORKER });
    const lost = async (signal: AbortSignal): Promise<unknown> => {
      const copy = await harness.previewRunner(gates, "resend", { money });
      return copy.runner.executeWorkItem(debate.workItemId, { executionLimitMs: 3_600_000, signal }).then(
        (result) => { throw new Error(`test: the copy was not lost: ${JSON.stringify(result)}`); }, (error: unknown) => error);
    };

    // 1. The debate stops on our side: the Hatchet task's catch parks it for its one retry.
    const firstStop = await lost(copies.first.signal);
    await settled();
    expect(await work.parkForRetry({ runId: debate.runId, workItemId: debate.workItemId, delaySeconds: 1 })).toBe("PARKED");
    await pool.query("UPDATE core.work_item SET claim_deadline = clock_timestamp() - interval '1 second' WHERE work_item_id=$1", [debate.workItemId]);
    const okBeforeRetry = await okCalls(debate.runId);
    expect(okBeforeRetry.length).toBeGreaterThan(0);
    void firstStop;

    // 2. The retry stops too, while a review's every attempt was charged and never answered: recorded FAILED, as the task's catch records it.
    copies.phase = 2;
    copies.reviews = 0;
    const secondStop = await lost(copies.second.signal);
    await settled();
    expect(await work.parkForRetry({ runId: debate.runId, workItemId: debate.workItemId, delaySeconds: 1 })).toBe("RETRIED");
    expect(await work.recordTerminalFailure({ runId: debate.runId, workItemId: debate.workItemId, reason: runnerTerminalFailureReason(secondStop) })).toBe(true);
    expect(await itemRow(debate.workItemId)).toMatchObject({ state: "FAILED" });
    const unanswered = await chargedUnanswered(debate.runId);
    expect(unanswered.length).toBeGreaterThan(0);
    const okAtFailure = await okCalls(debate.runId);
    const lastAtFailure = Number((await pool.query<{ s: string }>("SELECT coalesce(max(sequence),0)::text AS s FROM ledger.ledger_entry WHERE run_id=$1",
      [debate.runId])).rows[0]!.s);
    const spendAtFailure = await spendOf(debate.runId);

    // 3. The person presses Continue: the read says it can, the press re-opens it once and wakes its runner.
    const continueStore = storeOn(billing);
    expect(failedRunContinuable(await continueStore.readContinue(owner!.ownerRef, debate.runId))).toBe(true);
    const { dispatched, wake } = wakeLog();
    await expect(continueFailedRun({ ownerRef: owner!.ownerRef, runId: debate.runId, now: new Date() }, { store: continueStore, wake }))
      .resolves.toEqual({ kind: "CONTINUING" });
    expect(dispatched).toEqual([{ runId: debate.runId, workItemId: debate.workItemId }]);
    expect(await itemRow(debate.workItemId)).toMatchObject({ state: "CLAIMED", terminal_reason: null, claimed_by: "continue" });

    // 4. The next copy resumes it from what it saved and finishes it.
    copies.phase = 3;
    await harness.completedRun(await harness.previewRunner(gates, "resend", { money }), debate, gates);
    expect(await itemRow(debate.workItemId)).toMatchObject({ state: "DONE" });
    expect(await reopens(debate.workItemId)).toHaveLength(1);

    // Nothing answered before the continue was bought again (one call at a time: nothing was in flight when a copy was lost).
    const answeredBefore = new Set(okAtFailure.map((call) => `${call.key}|${call.actor}`));
    const okAfter = (await okCalls(debate.runId)).filter((call) => Number(call.sequence) > lastAtFailure);
    expect(okAfter.filter((call) => answeredBefore.has(`${call.key}|${call.actor}`)).map((call) => call.key)).toEqual([]);
    expect(okAfter.length).toBeGreaterThan(0);
    // The review that never got an answer was bought again by this copy, and the stopped copy's charges for it are the site's: exactly them.
    const reBought = new Set(okAfter.map((call) => `${call.key}|${call.actor}`));
    for (const attempt of unanswered) expect(reBought.has(`${attempt.key}|${attempt.actor}`), attempt.key).toBe(true);
    const waived = (await pool.query<{ attempt_id: string }>("SELECT attempt_id::text FROM ledger.model_spend_call_waiver WHERE run_id=$1 ORDER BY attempt_id",
      [debate.runId])).rows.map((row) => row.attempt_id);
    expect(waived).toEqual(unanswered.map((attempt) => attempt.attemptId).sort());
    // The money: the site paid every charged attempt (its day and the debate's ceiling count them all); the person pays each answered call
    // once — what an unbroken debate of the same calls charges — and nothing of the stopped copy's charges for the review bought again.
    const total = await spendOf(debate.runId);
    const person = Number((await pool.query<{ total: string }>(`SELECT coalesce(sum(spend.charge_micros),0)::text AS total FROM ledger.model_spend AS spend
      WHERE spend.run_id=$1 AND spend.spend_source='RUN'
        AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_call_waiver cw WHERE cw.attempt_id = spend.attempt_id)`, [debate.runId])).rows[0]!.total);
    // Each answered call the debate's money guard charged (the story's calls go through the stand-in seam above, which records nothing).
    const answered = await pool.query<{ key: string; charged: boolean }>(`SELECT entry.call_site_key || '|' || entry.actor_ref AS key,
        bool_or(EXISTS (SELECT 1 FROM ledger.model_spend AS spend WHERE spend.run_id = entry.run_id AND spend.attempt_id = entry.attempt_id)) AS charged
      FROM ledger.ledger_entry AS entry WHERE entry.run_id=$1 AND entry.action_kind='MODEL_CALL' AND entry.outcome='OK' GROUP BY 1`, [debate.runId]);
    const answeredCalls = answered.rows.filter((row) => row.charged).length;
    const chargedKeys = new Set(answered.rows.filter((row) => row.charged).map((row) => row.key));
    // An answered call never charged was charged to nobody, the site included: no spend row names any attempt at it.
    const uncharged = answered.rows.filter((row) => !row.charged).map((row) => row.key);
    expect(Number((await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM ledger.ledger_entry AS entry JOIN ledger.model_spend AS spend
      ON spend.run_id = entry.run_id AND spend.attempt_id = entry.attempt_id
      WHERE entry.run_id=$1 AND entry.action_kind='MODEL_CALL' AND entry.call_site_key || '|' || entry.actor_ref = ANY($2::text[])`,
      [debate.runId, uncharged])).rows[0]!.n), uncharged.join(", ")).toBe(0);
    expect(answeredCalls).toBeGreaterThan(0);
    expect(person).toBe(answeredCalls * ONE_ATTEMPT);
    expect(total.micros - person).toBe(unanswered.length * ONE_ATTEMPT);
    // Every charge before the continue stands as it was (no row changed), and the new ones are only the calls that never ran (those the
    // debate's money guard charges: the story's calls are charged to nobody here).
    expect(total.rows).toBe(spendAtFailure.rows + okAfter.filter((call) => chargedKeys.has(`${call.key}|${call.actor}`)).length);
  }, 900_000);
});

const okCalls = async (runId: string) => (await database.pool.query<{ key: string; actor: string; sequence: string }>(
  `SELECT call_site_key AS key, actor_ref AS actor, sequence::text AS sequence FROM ledger.ledger_entry
    WHERE run_id=$1 AND action_kind='MODEL_CALL' AND outcome='OK' ORDER BY sequence`, [runId])).rows;
/** Charged attempts at a site and member that never got an answer. */
const chargedUnanswered = async (runId: string) => (await database.pool.query<{ key: string; actor: string; attemptId: string }>(
  `SELECT entry.call_site_key AS key, entry.actor_ref AS actor, entry.attempt_id::text AS "attemptId" FROM ledger.ledger_entry AS entry
    WHERE entry.run_id=$1 AND entry.action_kind='MODEL_CALL' AND entry.outcome <> 'OK'
      AND EXISTS (SELECT 1 FROM ledger.model_spend AS spend WHERE spend.run_id = entry.run_id AND spend.attempt_id = entry.attempt_id AND spend.charge_micros > 0)
      AND NOT EXISTS (SELECT 1 FROM ledger.ledger_entry AS later WHERE later.run_id = entry.run_id AND later.action_kind='MODEL_CALL' AND later.outcome='OK'
        AND later.call_site_key = entry.call_site_key AND later.actor_ref = entry.actor_ref AND later.sequence > entry.sequence)
    ORDER BY entry.attempt_id`, [runId])).rows;
const spendOf = async (runId: string) => {
  const row = (await database.pool.query<{ rows: number; micros: string }>(
    "SELECT count(*)::int AS rows, coalesce(sum(charge_micros),0)::text AS micros FROM ledger.model_spend WHERE run_id=$1 AND spend_source='RUN'", [runId])).rows[0]!;
  return { rows: row.rows, micros: Number(row.micros) };
};
