// V4 start step, Task 57j (the owner's answer of 7 Nov afternoon, "Continue, they pay the rest": "Continue; the person pays only for what runs
// after Continue"; his standing rule of 7 Nov night: "whatever was already 'investigated' remains ... continue where it 'broke', and not
// charge the customer again ... Only if we can't re-use, then we need to pay for this ourselves") — A DEBATE AN UPDATE SET ASIDE CONTINUES
// WHERE IT STOPPED. On real PostgreSQL, through 0168:
//  1. A set-aside debate continues only where Continue moves it to the release that is current (the route's hand-over): moved and re-opened
//     in one step, each such Continue recorded insert-only; on its own release, or with no destination, nothing changes. A debate never
//     queued (RELEASE_NOT_SERVED's setup failure, with its waiver) never continues.
//  2. The money: what ran before the set-aside (its charges before Start too) stays out of the person's windows and quota; what is bought
//     after Continue is theirs; the site's day counts both. A second failure after Continue reads like any failure (its quota_used honest);
//     a second set-aside gives back what ran since, and the next Continue starts the person's share again.
//  3. A team member's grant and the team's limit read the same bound.
// Integration suites are skipped by the CI gate: run this file by hand, alone. Every figure and question is made up.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresModelSpendStore, linkPreStartTry, preStartSpendRef, readRunQuotaUsed, recordPreStartCharge } from "@debateai/budget";
import { PostgresDigModelRepository, createPool, migrate, type Pool } from "@debateai/db";
import { continuedRunWake, runHandoverOf, type RunHandoverPort } from "../../apps/api/src/month-pause.js";
import { continueFailedRun, failedRunContinuable, readFailedRunContinuable, readFailedRunMark, type FailedRunContinuePort } from "../../apps/api/src/run-continue.js";
import { createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
let runner: Pool;
let billing: Pool;
let erasure: Pool;

const loginPool = (role: string, password: string): Pool => {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return createPool(url.toString());
};
type SqlError = { code?: string | undefined };
async function sqlError(run: () => Promise<unknown>): Promise<SqlError> {
  try { await run(); return { code: undefined }; } catch (error) { return error as SqlError; }
}

/** The releases around the debates: each debate here is asked on `legacy`; B is current, later C. Keys carry their settings version. */
const B = "r1-bbbbbbbbbbbb";
const C = "r2-cccccccccccc";
/** The release that is current now (the second money case switches to C). */
let current = B;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  for (const [login, role] of [["sa_runner", "debateai_runtime, debateai_rls_all_accounts"], ["sa_billing", "debateai_billing_runtime, debateai_rls_all_accounts"],
    ["sa_erasure", "debateai_erasure_runtime"]] as const) {
    await database.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${login}-test-only' IN ROLE ${role}`);
  }
  runner = loginPool("sa_runner", "sa_runner-test-only");
  billing = loginPool("sa_billing", "sa_billing-test-only");
  erasure = loginPool("sa_erasure", "sa_erasure-test-only");
  owner = await provisionStoryEncryptedOwner(database.pool);
  await database.pool.query("SELECT core.record_release_event($1, 'STAGED', 'test', NULL)", [B]);
  await database.pool.query("SELECT core.record_release_switch($1, NULL, now(), 'test', NULL)", [B]);
}, 600_000);
afterAll(async () => {
  await Promise.all([runner?.end(), billing?.end(), erasure?.end()]);
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

const STOP = "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED";
const ownRun = (): Promise<string> => createEncryptedStoryRun(database.pool, owner!, "Should Harbour Town build a second ferry pier?");
/** The debate's first job, READY, written past every trigger as the database's own fixtures write one; its id. */
async function workItem(runId: string, state: "READY" | "FAILED" = "READY", reason: string | null = null): Promise<string> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    const id = (await seed.query<{ work_item_id: string }>(`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,terminal_reason,created_at_seq)
      VALUES ($1,'Q1','[]'::jsonb,$2,$3,$4,ledger.allocate_sequence()) RETURNING work_item_id::text`, [runId, `set-aside:${randomUUID()}`, state, reason])).rows[0]!.work_item_id;
    await seed.query("COMMIT");
    return id;
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
/** The upload's set-aside of one open job, as the backstop writes it (packages/battery): FAILED RUN_SET_ASIDE:<reason> and the run's waiver. */
const setAside = (releaseKey: string, runId: string, workItemId: string, reason: "BACKSTOP" | "SETTINGS_VERSION_UNSUPPORTED" | "OWNER_STOPPED" = "BACKSTOP") =>
  new WorkItemRepository(database.pool, { releaseKey, workerId: `backstop:${releaseKey}` }).setAsideWorkItem({ runId, workItemId, reason, readyOnly: false });
const itemRow = async (workItemId: string) => (await database.pool.query<{ state: string; terminal_reason: string | null; claimed_by: string | null }>(
  "SELECT state, terminal_reason, claimed_by FROM core.work_item WHERE work_item_id=$1", [workItemId])).rows[0]!;
const continues = async (runId: string) => (await database.pool.query<{ reopen_no: number }>(
  "SELECT reopen_no FROM ledger.set_aside_continue WHERE run_id=$1 ORDER BY reopen_no", [runId])).rows.map((row) => row.reopen_no);
const hops = async (runId: string) => (await database.pool.query<{ from_release_key: string; to_release_key: string }>(
  "SELECT from_release_key, to_release_key FROM identity.run_handover WHERE run_id=$1 ORDER BY hop", [runId])).rows;
/** The API's port over the read and the re-open, on the API's own role's login. */
const store: () => FailedRunContinuePort = () => {
  const repository = new PostgresDigModelRepository(billing);
  return {
    readContinue: (ownerRef, runId) => repository.readRunContinue(ownerRef, runId),
    reopen: (ownerRef, runId, destination) => repository.continueFailedRun(ownerRef, runId, destination?.releaseKey ?? null, destination?.registerVersion ?? null)
  };
};
/** The API's hand-over as main.ts builds it, for a process of release `own` (its active version is the key's own). */
const handoverAt = (own: string): RunHandoverPort => runHandoverOf({
  ownReleaseKey: own,
  readRunReleaseNow: (runId) => new PostgresDigModelRepository(billing).readRunReleaseNow(runId),
  versionPassed: async (version) => (await database.pool.query<{ ok: boolean }>("SELECT register.settings_version_passed($1,$2) AS ok", [own, version])).rows[0]!.ok,
  activeVersion: async () => Number(/^r(\d+)-/u.exec(own)![1]),
  resumeInRelease: async () => "NOT_PAUSED"
});
const wake = continuedRunWake({ claimableWorkItemOf: (runId) => new WorkItemRepository(database.pool).claimableWorkItemOfRun(runId), dispatch: async () => undefined });
const press = (runId: string, own: string) =>
  continueFailedRun({ ownerRef: owner!.ownerRef, runId, now: new Date() }, { store: store(), handover: handoverAt(own), wake });
const readsContinuable = (runId: string, own: string) => readFailedRunContinuable({ ownerRef: owner!.ownerRef, runId }, { store: store(), handover: handoverAt(own) });

describe("Task 57j (0168): a debate an update set aside continues, only where Continue moves it to the release that is current", () => {
  it("each set-aside reason: refused on its own release or with no destination; moved and re-opened once where it moves; each such Continue recorded", async () => {
    for (const reason of ["BACKSTOP", "SETTINGS_VERSION_UNSUPPORTED", "OWNER_STOPPED"] as const) {
      const run = await ownRun();
      const item = await workItem(run);
      expect(await setAside("legacy", run, item, reason), reason).toBe(true);
      const facts = await store().readContinue(owner!.ownerRef, run);
      expect(facts, reason).toMatchObject({ state: "FAILED", terminal_reason: `RUN_SET_ASIDE:${reason}`, waived: true });
      // No destination (a process of its own release): the read says nothing, the route and the database refuse; nothing changes.
      expect(failedRunContinuable(facts), reason).toBe(false);
      expect(await readsContinuable(run, "legacy"), reason).toBe(false);
      await expect(press(run, "legacy"), reason).resolves.toEqual({ kind: "NOT_CONTINUABLE" });
      expect(await new PostgresDigModelRepository(billing).continueFailedRun(owner!.ownerRef, run, null, null), reason).toBe("NOT_CONTINUABLE");
      expect(await itemRow(item), reason).toMatchObject({ state: "FAILED" });
      // Where it moves (a process of B, the current release): read continuable, moved and re-opened in one step.
      expect(await readsContinuable(run, B), reason).toBe(true);
      await expect(press(run, B), reason).resolves.toEqual({ kind: "CONTINUING" });
      expect(await itemRow(item), reason).toEqual({ state: "CLAIMED", terminal_reason: null, claimed_by: "continue" });
      expect(await hops(run), reason).toEqual([{ from_release_key: "legacy", to_release_key: B }]);
      expect(await continues(run), reason).toEqual([1]);
      // A second press while it runs: CONTINUING, nothing written twice.
      await expect(press(run, B), reason).resolves.toEqual({ kind: "CONTINUING" });
      expect(await continues(run), reason).toEqual([1]);
    }
    // Set aside on the release it already belongs to (B's own backstop): the database refuses a "move" to the same release.
    const onB = await ownRun();
    const itemB = await workItem(onB);
    expect(await setAside("legacy", onB, itemB)).toBe(true);
    await expect(press(onB, B)).resolves.toEqual({ kind: "CONTINUING" });
    await database.pool.query("UPDATE core.work_item SET claim_deadline = clock_timestamp() - interval '1 second' WHERE work_item_id=$1", [itemB]);
    expect(await setAside(B, onB, itemB)).toBe(true);
    expect(await readsContinuable(onB, B)).toBe(false);
    expect(await new PostgresDigModelRepository(billing).continueFailedRun(owner!.ownerRef, onB, B, 1)).toBe("NOT_CONTINUABLE");
    expect(await continues(onB)).toEqual([1]);
    // A debate never queued because no release served it keeps its refusal, waiver or not.
    const neverQueued = await ownRun();
    await workItem(neverQueued, "FAILED", "RUN_SETUP_FAILED:RELEASE_NOT_SERVED");
    await database.pool.query("INSERT INTO ledger.model_spend_waiver (run_id, reason) VALUES ($1,'RELEASE_NOT_SERVED')", [neverQueued]);
    expect(await readsContinuable(neverQueued, B)).toBe(false);
    expect(await new PostgresDigModelRepository(billing).continueFailedRun(owner!.ownerRef, neverQueued, B, 1)).toBe("NOT_CONTINUABLE");
    // The record: read by no role, insert-only; its bound's reader for the runtime role (and the readers' owner), never the erasure role.
    for (const pool of [runner, billing, erasure]) {
      expect((await sqlError(() => pool.query("SELECT count(*) FROM ledger.set_aside_continue"))).code).toBe("42501");
    }
    for (const sql of ["UPDATE ledger.set_aside_continue SET reopen_no = 9 WHERE run_id=$1", "DELETE FROM ledger.set_aside_continue WHERE run_id=$1"]) {
      expect((await sqlError(() => database.pool.query(sql, [onB]))).code, sql).toBeDefined();
    }
    expect((await runner.query("SELECT ledger.spend_waived_until($1) IS NOT NULL AS ok", [onB])).rows[0].ok).toBe(true);
    expect((await sqlError(() => erasure.query("SELECT ledger.spend_waived_until($1)", [onB]))).code).toBe("42501");
  });
});

describe("Task 57j (0168): what ran before the set-aside stays the site's; what is bought after Continue is the person's", () => {
  const spend = (runId: string, micros: number) => database.pool.query(`INSERT INTO ledger.model_spend (spend_id,spend_source,spend_phase,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens,attempt_id)
    VALUES (gen_random_uuid(),'RUN','BODY',$1,'fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,$2,1,1,gen_random_uuid())`, [runId, micros]);
  const window = () => ({ from: new Date(Date.now() - 600_000), to: new Date(Date.now() + 600_000) });
  const day = () => new Date().toISOString().slice(0, 10);

  it("subscription: the person's windows, the batch readers and quota_used follow the bound through a second failure, a second set-aside and a second Continue; the site's day counts all", async () => {
    const run = await ownRun();
    await database.pool.query(`INSERT INTO billing.run_charge_scope (run_id,owner_ref,admitted_at,funding_kind,plan_id,entitlement_event_id)
      VALUES ($1,$2,now() - interval '1 minute','SUBSCRIPTION','PLUS',gen_random_uuid())`, [run, owner!.ownerRef]);
    const person = new PostgresModelSpendStore(runner);
    const site = new PostgresModelSpendStore(database.pool);
    const { from, to } = window();
    const mine = async () => {
      const total = await person.readOwnerSpentMicros(owner!.ownerRef, from, to);
      expect(await person.readOwnerSpentInRangesMicros(owner!.ownerRef, [{ from, to }])).toEqual([total]);
      return total;
    };
    const charges = async () => (await person.readOwnerChargesMicros(owner!.ownerRef, from, to)).filter((row) => row.runId === run).map((row) => row.chargeMicros);
    const quota = () => readRunQuotaUsed(runner, { ownerRef: owner!.ownerRef, runId: run });
    const [mineBefore, dayBefore] = [await mine(), await site.readDaySpentMicros(day())];
    // Before Start: the list's charge, given to this debate (it keeps no paths from the list).
    const tryRef = createHash("sha256").update(`try:${randomUUID()}`).digest("hex");
    await recordPreStartCharge(runner, { spendId: randomUUID(), ownerRef: owner!.ownerRef, grant: null, kind: "LIST",
      providerRef: preStartSpendRef("LIST", "deepinfra", "zai-org/GLM-5.3-Flash"), chargedOn: day(), chargeMicros: 4, inputTokens: 700, outputTokens: 90, tryRef });
    expect(await linkPreStartTry(runner, { ownerRef: owner!.ownerRef, tryRef, runId: run })).toBe(1);
    const item = await workItem(run);
    await spend(run, 7);
    expect(await mine()).toBe(mineBefore + 11);
    // The update sets it aside: none of it is the person's; the site's day keeps it (the charge before Start too).
    expect(await setAside("legacy", run, item)).toBe(true);
    expect(await mine()).toBe(mineBefore);
    expect(await charges()).toEqual([]);
    expect(await quota()).toBe("NONE");
    expect(await site.readDaySpentMicros(day())).toBe(dayBefore + 11);
    // Continue (moved to B): what ran before stays the site's, the charge before Start included; what is bought now is the person's.
    await expect(press(run, B)).resolves.toEqual({ kind: "CONTINUING" });
    expect(await mine()).toBe(mineBefore);
    expect(await quota()).toBe("NONE");
    await spend(run, 5);
    expect(await mine()).toBe(mineBefore + 5);
    expect(await charges()).toEqual([5]);
    expect(await quota()).toBe("SOME");
    expect(await site.readDaySpentMicros(day())).toBe(dayBefore + 16);
    // It stops on our side again: a failure like any, its quota_used honest (the part after Continue), and it continues with no move.
    await database.pool.query("UPDATE core.work_item SET state='FAILED', terminal_reason=$2, claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1", [item, STOP]);
    expect(await quota()).toBe("SOME");
    expect(await readsContinuable(run, B)).toBe(true);
    await expect(press(run, B)).resolves.toEqual({ kind: "CONTINUING" });
    expect(await continues(run)).toEqual([1]);
    await spend(run, 3);
    expect(await mine()).toBe(mineBefore + 8);
    // The next upload sets it aside again: what ran since is given back too ("It did not use your quota." stays true).
    await database.pool.query("UPDATE core.work_item SET claim_deadline = clock_timestamp() - interval '1 second' WHERE work_item_id=$1", [item]);
    expect(await setAside(B, run, item)).toBe(true);
    expect(await mine()).toBe(mineBefore);
    expect(await quota()).toBe("NONE");
    expect(await site.readDaySpentMicros(day())).toBe(dayBefore + 19);
    // C becomes current: Continue moves it there; from then on the person pays again, only for what is bought after it.
    await database.pool.query("SELECT core.record_release_event($1, 'STAGED', 'test', NULL)", [C]);
    await database.pool.query("SELECT core.record_release_switch($1, $2, now(), 'test', NULL)", [C, B]);
    current = C;
    expect(await readsContinuable(run, B)).toBe(false);
    expect(await readsContinuable(run, C)).toBe(true);
    await expect(press(run, C)).resolves.toEqual({ kind: "CONTINUING" });
    expect(await continues(run)).toEqual([1, 3]);
    expect(await mine()).toBe(mineBefore);
    await spend(run, 2);
    expect(await mine()).toBe(mineBefore + 2);
    expect(await charges()).toEqual([2]);
    expect(await quota()).toBe("SOME");
    expect(await site.readDaySpentMicros(day())).toBe(dayBefore + 21);
    // It finishes: nothing changes.
    await database.pool.query("UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1", [item]);
    expect(await mine()).toBe(mineBefore + 2);
    expect(await quota()).toBe("SOME");
  });

  it("a team member's grant and the team's limit read the same bound", async () => {
    const run = await ownRun();
    const [grant, event] = [randomUUID(), randomUUID()];
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
    const { from, to } = window();
    const granted = async () => Number((await database.pool.query<{ total: string }>("SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total",
      [owner!.ownerRef, grant, event, from, to])).rows[0]!.total);
    const team = async () => Number((await database.pool.query<{ total: string }>("SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to])).rows[0]!.total);
    const item = await workItem(run);
    await spend(run, 40);
    const teamBefore = await team();
    expect(await granted()).toBe(40);
    expect(await setAside("legacy", run, item)).toBe(true);
    expect(await granted()).toBe(0);
    expect(await team()).toBe(teamBefore - 40);
    await expect(press(run, current)).resolves.toEqual({ kind: "CONTINUING" });
    await spend(run, 2);
    expect(await granted()).toBe(2);
    expect(await team()).toBe(teamBefore - 38);
  });
});

// The coordinator's addendum (the owner's later answer: "We should stop after 2 continues that fail"; the rule and the page are Task 57m): the
// facts also say how many of the debate's re-opens ended FAILED again. Since Task 57m the rule stops at 2.
describe("Task 57j (0168): the facts count the re-opens that ended FAILED again", () => {
  it("0 before any Continue and while a Continue runs; 1, then 2 after each failure; a re-open that finished is not counted", async () => {
    const run = await ownRun();
    const item = await workItem(run, "FAILED", STOP);
    const failedContinues = async () => (await store().readContinue(owner!.ownerRef, run))!.failed_continues;
    const fail = () => database.pool.query("UPDATE core.work_item SET state='FAILED', terminal_reason=$2, claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1", [item, STOP]);
    expect(await failedContinues()).toBe(0);
    await expect(press(run, current)).resolves.toEqual({ kind: "CONTINUING" });
    expect(await failedContinues()).toBe(0);
    await fail();
    expect(await failedContinues()).toBe(1);
    await expect(press(run, current)).resolves.toEqual({ kind: "CONTINUING" });
    expect(await failedContinues()).toBe(1);
    await fail();
    expect(await failedContinues()).toBe(2);
    // Task 57m (owner 8 Nov: "We should stop after 2 continues that fail"): now the rule says no.
    expect(failedRunContinuable(await store().readContinue(owner!.ownerRef, run))).toBe(false);
    await expect(press(run, current)).resolves.toEqual({ kind: "NOT_CONTINUABLE" });
    expect(await failedContinues()).toBe(2);
    // A re-open that finished is not counted (another debate: continued once, then done).
    const done = await ownRun();
    const doneItem = await workItem(done, "FAILED", STOP);
    await expect(press(done, current)).resolves.toEqual({ kind: "CONTINUING" });
    await database.pool.query("UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1", [doneItem]);
    expect((await store().readContinue(owner!.ownerRef, done))!.failed_continues).toBe(0);
    // Not the person's debate: no facts at all.
    expect(await store().readContinue(randomUUID(), run)).toBeNull();
  });
});

// Task 57m-fix (the owner's answer of 8 Nov, card "Update doesn't count"): an update's set-aside is never one of the "2 continues that fail",
// the newest or an earlier one. 0168's facts leave out every re-open that ended in a set-aside (the next Continue of a set-aside is recorded,
// insert-only, with its re-open number), so only the debate's own failures count.
describe("Task 57m-fix (0168): a re-open an update set aside is never a continue that failed", () => {
  it("continued once after our stop, then set aside by three uploads in a row: still continuable; then two continues that fail on our side: keeps failing", async () => {
    const run = await ownRun();
    const item = await workItem(run, "FAILED", STOP);
    const facts = async () => (await store().readContinue(owner!.ownerRef, run))!;
    const mark = (own: string) => readFailedRunMark({ ownerRef: owner!.ownerRef, runId: run }, { store: store(), handover: handoverAt(own) });
    const fail = () => database.pool.query("UPDATE core.work_item SET state='FAILED', terminal_reason=$2, claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1", [item, STOP]);
    /** An upload: the release that drains from the upload before retires (one drains at a time), then `key` becomes the current release. */
    const upload = async (key: string) => {
      for (const { release_key: drained } of (await database.pool.query<{ release_key: string }>(
        "SELECT release_key FROM core.release_state_v WHERE state = 'DRAINING'")).rows) {
        await database.pool.query("SELECT core.record_release_event($1, 'RETIRED', 'test', 'DRAINED')", [drained]);
      }
      await database.pool.query("SELECT core.record_release_event($1, 'STAGED', 'test', NULL)", [key]);
      await database.pool.query("SELECT core.record_release_switch($1, $2, now(), 'test', NULL)", [key, current]);
      current = key;
    };
    await expect(press(run, current)).resolves.toEqual({ kind: "CONTINUING" });
    // Three uploads in a row set it aside while it runs; each time Continue moves it to the new release. No failure of its own.
    for (const next of ["r3-dddddddddddd", "r4-eeeeeeeeeeee", "r5-ffffffffffff"]) {
      await database.pool.query("UPDATE core.work_item SET claim_deadline = clock_timestamp() - interval '1 second' WHERE work_item_id=$1", [item]);
      expect(await setAside(current, run, item), next).toBe(true);
      await upload(next);
      expect(await mark(current), next).toBe("CONTINUABLE");
      expect.soft((await facts()).failed_continues, next).toBe(0);
      await expect(press(run, current), next).resolves.toEqual({ kind: "CONTINUING" });
    }
    expect(await continues(run)).toEqual([2, 3, 4]);
    // Now it fails on our side: one continue that failed, still continuable; continued, it fails again: two, so it keeps failing.
    await fail();
    expect(await facts()).toMatchObject({ state: "FAILED", failed_continues: 1 });
    expect(await mark(current)).toBe("CONTINUABLE");
    await expect(press(run, current)).resolves.toEqual({ kind: "CONTINUING" });
    await fail();
    expect(await facts()).toMatchObject({ state: "FAILED", failed_continues: 2 });
    expect(await mark(current)).toBe("KEEPS_FAILING");
    await expect(press(run, current)).resolves.toEqual({ kind: "NOT_CONTINUABLE" });
    expect(await itemRow(item)).toMatchObject({ state: "FAILED", terminal_reason: STOP });
  });
});
