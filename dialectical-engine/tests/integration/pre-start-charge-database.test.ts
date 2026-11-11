import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PostgresModelSpendStore, linkPreStartTry, preStartChargeWriterPresent, preStartSpendRef, readRunQuotaUsed, recordPreStartCharge,
  type PreStartChargeKind
} from "@debateai/budget";
import { RUN_PATH_SET_REFUSALS, WORK_ITEM_RETRY, WorkItemRepository } from "@debateai/battery";
import { createPool, migrate, type Pool } from "@debateai/db";
import { createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { asRequestOf, seedLiveSession } from "../support/rls-logins.js";

/**
 * 0158 on real PostgreSQL (V4 start step, plan 2026-11-03 Task 18; spec §5.2): the small AIs before Start count in the person's day, week and month,
 * in a team member's grant and in the team's one limit, and in the site's day; the row holds the person, the kind, the cost and the time; an erased
 * account takes its rows; the export gets the times and the kinds only; no request role reads the table. Data is made up.
 */
let database: TestDatabase;
let runner: Pool;
let billing: Pool;
/** The API's request pool: the billing login with the cross-account target main.ts gives it, so a request's session reaches the database (0171). */
let billingRequests: Pool;
let erasure: Pool;
let worker: Pool;
let authorization: Pool;
let replay: Pool;
/** A system login (the runner's, the API system login's shape): its row security admits a run-less row, so only the guard refuses one. */
let system: Pool;
const GRANT = { grantId: randomUUID(), grantEventId: randomUUID() };
const today = (): string => new Date().toISOString().slice(0, 10);
const window = (): readonly [Date, Date] => [new Date(Date.now() - 60_000), new Date(Date.now() + 60_000)];

type SqlError = { code?: string | undefined; message?: string | undefined };
async function sqlError(run: () => Promise<unknown>): Promise<SqlError> {
  try { await run(); return { code: undefined, message: undefined }; }
  catch (error) { return error as SqlError; }
}
const loginUrl = (role: string, password: string): string => {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return url.toString();
};
const loginPool = (role: string, password: string): Pool => createPool(loginUrl(role, password));
type Account = Readonly<{ userId: string; ownerRef: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `pre-start-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef };
}
const entry = (ownerRef: string, chargeMicros: number, kind: PreStartChargeKind = "LIST", grant: typeof GRANT | null = null) => ({
  spendId: randomUUID(), ownerRef, grant, kind, providerRef: preStartSpendRef(kind, "deepinfra", "zai-org/GLM-5.3-Flash"),
  chargedOn: today(), chargeMicros, inputTokens: 700, outputTokens: 90 });
const total = async (pool: Pool, sql: string, values: readonly unknown[]): Promise<number> => Number((await pool.query<{ total: string }>(sql, [...values])).rows[0]!.total);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // The runner's login as production makes it: the runtime role and the cross-account marker, which 0171's question and its moved grants ask for.
  for (const [login, role] of [["ps_runner", "debateai_runtime, debateai_rls_all_accounts"], ["ps_billing", "debateai_billing_runtime"], ["ps_erasure", "debateai_erasure_runtime"],
    ["ps_worker", "debateai_data_export_worker"], ["ps_authorization", "debateai_authorization_runtime"], ["ps_replay", "debateai_replay"]] as const) {
    await database.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${login}-test-only' IN ROLE ${role}`);
  }
  runner = loginPool("ps_runner", "ps_runner-test-only");
  billing = loginPool("ps_billing", "ps_billing-test-only");
  billingRequests = createPool(loginUrl("ps_billing", "ps_billing-test-only"), { crossAccount: billing });
  erasure = loginPool("ps_erasure", "ps_erasure-test-only");
  worker = loginPool("ps_worker", "ps_worker-test-only");
  authorization = loginPool("ps_authorization", "ps_authorization-test-only");
  replay = loginPool("ps_replay", "ps_replay-test-only");
  await database.pool.query("CREATE ROLE ps_system LOGIN PASSWORD 'ps_system-test-only' IN ROLE debateai_runtime, debateai_rls_all_accounts");
  system = loginPool("ps_system", "ps_system-test-only");
}, 600_000);
afterAll(async () => {
  await Promise.all([runner?.end(), billingRequests?.end(), billing?.end(), erasure?.end(), worker?.end(), authorization?.end(), replay?.end(), system?.end()]);
  await database?.stop();
});

describe("0158: the charge reaches every reader", () => {
  it("the API's login finds the writer; another role does not", async () => {
    expect(await preStartChargeWriterPresent(runner)).toBe(true);
    expect(await preStartChargeWriterPresent(erasure)).toBe(false);
  });

  it("RECORDED: a run-less PRE_START ledger row, in the person's windows, their ranges and the site's day, and in nobody else's", async () => {
    const [ana, dan] = [await account(), await account()];
    const store = new PostgresModelSpendStore(runner);
    const site = new PostgresModelSpendStore(database.pool);
    const dayBefore = await site.readDaySpentMicros(today());
    const made = entry(ana.ownerRef, 3);
    const outcome = (await runner.query<{ outcome: string }>("SELECT identity.record_pre_start_charge($1,$2,NULL,NULL,$3,$4,$5::date,3,700,90) AS outcome",
      [made.spendId, made.ownerRef, made.kind, made.providerRef, made.chargedOn])).rows[0]!.outcome;
    expect(outcome).toBe("RECORDED");
    await recordPreStartCharge(runner, entry(ana.ownerRef, 2, "FIT"));
    const [from, to] = window();
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(5);
    expect(await store.readOwnerSpentMicros(dan.ownerRef, from, to)).toBe(0);
    expect(await store.readOwnerSpentInRangesMicros(ana.ownerRef, [{ from, to }, { from: new Date(Date.now() - 7_200_000), to: from }])).toEqual([5, 0]);
    expect(await site.readDaySpentMicros(today())).toBe(dayBefore + 5);
    // On the API's own login a request presents its session (0171): the reader answers only for the session's own owner.
    expect(await new PostgresModelSpendStore(asRequestOf(billingRequests, await seedLiveSession(database.pool, ana.userId))).readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(5);
    const ledger = (await database.pool.query("SELECT spend_source,run_id,provider_ref,charge_micros::text charge FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rows[0];
    expect(ledger).toEqual({ spend_source: "PRE_START", run_id: null, provider_ref: made.providerRef, charge: "3" });
  });

  it("a team member's call is in their grant's window and the team's reader beside step 2's small AI, not in a subscription window", async () => {
    const ana = await account();
    const [from, to] = window();
    const teamBefore = await total(database.pool, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to]);
    await recordPreStartCharge(runner, entry(ana.ownerRef, 4, "MERGE_LATE", GRANT));
    // Step 2's call as its writer leaves it for a grant: 0171 keeps a clarify call's grant only when it is the person's own and was running at its
    // reservation (ask-clarify-charge-database.test.ts proves that), so this reader's input is the row itself.
    await database.pool.query("INSERT INTO identity.ask_clarify_charge (charge_id,owner_ref,funding_kind,internal_grant_id,internal_grant_event_id,charge_micros) VALUES ($1,$2,'INTERNAL',$3,$4,3)",
      [randomUUID(), ana.ownerRef, GRANT.grantId, GRANT.grantEventId]);
    const store = new PostgresModelSpendStore(runner);
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(0);
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to, { kind: "INTERNAL", ...GRANT }, "PERSON_MONTH")).toBe(7);
    expect(await total(runner, "SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total", [ana.ownerRef, GRANT.grantId, GRANT.grantEventId, from, to])).toBe(7);
    expect(await total(database.pool, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to])).toBe(teamBefore + 7);
  });

  it("the row holds the person, the kind, the cost and the time", async () => {
    const ana = await account();
    const made = entry(ana.ownerRef, 5, "COMBINE");
    await recordPreStartCharge(runner, made);
    const row = (await database.pool.query("SELECT * FROM identity.pre_start_charge WHERE charge_id=$1", [made.spendId])).rows[0] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["charge_id", "charge_micros", "funding_kind", "internal_grant_event_id", "internal_grant_id", "kind", "owner_ref", "recorded_at"]);
    expect(row).toMatchObject({ owner_ref: ana.ownerRef, kind: "COMBINE", funding_kind: "SUBSCRIPTION", internal_grant_id: null });
  });
});

describe("0158: the writer's refusals", () => {
  it("a kind its reference does not name, free text, a far day: refused, nothing written", async () => {
    const ana = await account();
    expect((await sqlError(() => recordPreStartCharge(runner, { ...entry(ana.ownerRef, 1, "LIST"), kind: "FIT" }))).code).toBe("23514");
    expect((await sqlError(() => recordPreStartCharge(runner, { ...entry(ana.ownerRef, 1), providerRef: "Should the town build a pier?" }))).code).toBe("23514");
    expect((await sqlError(() => recordPreStartCharge(runner, { ...entry(ana.ownerRef, 1), chargedOn: "2020-01-01" }))).code).toBe("23514");
    expect((await sqlError(() => recordPreStartCharge(runner, { ...entry(ana.ownerRef, 1), kind: "STORY" as never }))).code).toBe("23514");
    expect(Number((await database.pool.query("SELECT count(*) c FROM identity.pre_start_charge WHERE owner_ref=$1", [ana.ownerRef])).rows[0].c)).toBe(0);
  });
  it("a raw insert of the source is refused by the guard to every login but the writer's owner, while other run-less sources still pass", async () => {
    const raw = `INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
      VALUES ($1,'PRE_START',NULL,'pre-start:list:x:y',$2::date,1,1,1)`;
    // The guard's own message: row security refuses a run-less row to the bare runtime login with the same code, so the code alone proves nothing.
    for (const pool of [runner, system, database.pool]) {
      expect(await sqlError(() => pool.query(raw, [randomUUID(), today()]))).toMatchObject({ code: "42501", message: "PRE_START_SPEND_WRITER_ONLY" });
    }
    // On the system login row security admits a run-less row, so the guard alone refused the one above: another source goes through.
    await system.query(`INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
      VALUES ($1,'SUPPORT',NULL,'support:x',$2::date,1,1,1)`, [randomUUID(), today()]);
  });
  it("a person gone while the call ran: GONE, the site's day still counts it, and no row names them", async () => {
    const made = entry(randomUUID(), 9);
    const outcome = (await runner.query<{ outcome: string }>("SELECT identity.record_pre_start_charge($1,$2,NULL,NULL,$3,$4,$5::date,9,1,1) AS outcome",
      [made.spendId, made.ownerRef, made.kind, made.providerRef, made.chargedOn])).rows[0]!.outcome;
    expect(outcome).toBe("GONE");
    expect((await database.pool.query("SELECT 1 FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rowCount).toBe(1);
    expect((await database.pool.query("SELECT 1 FROM identity.pre_start_charge WHERE charge_id=$1", [made.spendId])).rowCount).toBe(0);
  });
  it("the row is append-only while the account lives", async () => {
    const ana = await account();
    const made = entry(ana.ownerRef, 5);
    await recordPreStartCharge(runner, made);
    expect((await sqlError(() => database.pool.query("UPDATE identity.pre_start_charge SET charge_micros=0 WHERE charge_id=$1", [made.spendId]))).message).toContain("PRE_START_CHARGE_APPEND_ONLY");
    expect((await sqlError(() => database.pool.query("DELETE FROM identity.pre_start_charge WHERE charge_id=$1", [made.spendId]))).message).toContain("PRE_START_CHARGE_APPEND_ONLY");
  });
});

describe("0158: erasure, export and the roles", () => {
  it("an erased account takes its rows; the ledger's row, naming nobody, stays in the site's day", async () => {
    const ana = await account();
    const made = entry(ana.ownerRef, 5);
    await recordPreStartCharge(runner, made);
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [ana.userId]);
    expect((await database.pool.query("SELECT 1 FROM identity.pre_start_charge WHERE owner_ref=$1", [ana.ownerRef])).rowCount).toBe(0);
    expect((await database.pool.query("SELECT 1 FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rowCount).toBe(1);
  });

  it("the export worker reads the times and kinds of the leased account's calls, no cost and no one else's, under a live lease only", async () => {
    const [ana, dan] = [await account(), await account()];
    await recordPreStartCharge(runner, entry(ana.ownerRef, 5, "LIST"));
    await recordPreStartCharge(runner, entry(dan.ownerRef, 6, "FIT"));
    const [exportId, workerId] = [randomUUID(), randomUUID()];
    await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, ana.userId, randomUUID(), workerId]);
    const value = (await worker.query<{ value: unknown }>("SELECT identity.read_data_export_pre_start($1,$2) AS value", [exportId, workerId])).rows[0]!.value;
    expect(value).toEqual([{ recorded_at: expect.any(String), kind: "LIST" }]);
    expect((await sqlError(() => worker.query("SELECT identity.read_data_export_pre_start($1,$2)", [randomUUID(), workerId]))).code).toBeDefined();
  });

  it("no request role can SELECT the table, and each function has its roles", async () => {
    for (const pool of [runner, billing, erasure, worker, authorization, replay]) {
      expect((await sqlError(() => pool.query("SELECT * FROM identity.pre_start_charge"))).code).toBe("42501");
    }
    const [from, to] = window();
    const owner = randomUUID();
    const denied = async (pool: Pool, sql: string, values: readonly unknown[]) => (await sqlError(() => pool.query(sql, [...values]))).code === "42501";
    for (const pool of [erasure, worker, replay]) expect(await denied(pool, "SELECT identity.read_pre_start_spent($1,$2,$3)", [owner, from, to])).toBe(true);
    for (const pool of [erasure, worker, replay]) {
      expect(await denied(pool, "SELECT identity.record_pre_start_charge($1,$2,NULL,NULL,'LIST','pre-start:list:x:y',current_date,1,1,1)", [randomUUID(), owner])).toBe(true);
    }
    for (const pool of [runner, billing, erasure, authorization, replay]) expect(await denied(pool, "SELECT identity.read_data_export_pre_start($1,$1)", [owner])).toBe(true);
  });
});

/*
 * 0165 (V4 start step, plan 2026-11-03 Task 57c; the owner's 5 Nov answer Q20 A and its second-round follow-up): a failed question gives back
 * its path-list charge. Each charge names its try; Start gives the try's charges to the debate once; while that debate is FAILED the person's
 * windows, a team member's grant and the team's limit leave them out, and the site's day keeps them. Data is made up.
 */
describe("0165: a failed question gives back its charges before Start", () => {
  let owner: StoryEncryptedOwner;
  beforeAll(async () => { owner = await provisionStoryEncryptedOwner(database.pool); });
  afterAll(async () => { if (owner !== undefined) await releaseStoryEncryptedOwner(owner); });

  const tryRef = (): string => createHash("sha256").update(`try:${randomUUID()}`).digest("hex");
  /** The person's own debate, as the asks route starts one (its ownership event names them). */
  const ownRun = (): Promise<string> => createEncryptedStoryRun(database.pool, owner, "Should Harbour Town build a second ferry pier?");
  /** A work item of the debate in `state` (a FAILED one with `reason`), written past every trigger as the database's own fixtures write one. */
  async function workItem(runId: string, state: "READY" | "DONE" | "FAILED", reason: string | null = state === "FAILED" ? "TEST_RUN_FAILED" : null): Promise<void> {
    const seed = await database.pool.connect();
    try {
      await seed.query("BEGIN");
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query(`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,terminal_reason,created_at_seq)
        VALUES ($1,'Q1','[]'::jsonb,$2,$3,$4,ledger.allocate_sequence())`, [runId, `pre-start-try:${randomUUID()}`, state, reason]);
      await seed.query("COMMIT");
    } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
  }
  /** One round's charge of the debate (the RUN kind the person's windows count). */
  const round = (runId: string, micros: number): Promise<unknown> => database.pool.query(
    `INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
     VALUES (gen_random_uuid(),'RUN',$1,'fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,$2,1,1)`, [runId, micros]);
  const charged = (micros: number, kind: PreStartChargeKind, made: string, grant: typeof GRANT | null = null) =>
    recordPreStartCharge(runner, { ...entry(owner.ownerRef, micros, kind, grant), tryRef: made });
  const quota = (runId: string, ownerRef = owner.ownerRef) => readRunQuotaUsed(runner, { ownerRef, runId });

  it("a try's charges count until its debate fails, then the person's windows fall by exactly them, once; the site's day keeps them", async () => {
    const [mine, another] = [tryRef(), tryRef()];
    const run = await ownRun();
    const [from, to] = window();
    const store = new PostgresModelSpendStore(runner);
    const site = new PostgresModelSpendStore(database.pool);
    const [before, dayBefore] = [await store.readOwnerSpentMicros(owner.ownerRef, from, to), await site.readDaySpentMicros(today())];
    await charged(3, "ANGLES", mine);
    await charged(2, "LIST", mine);
    await charged(4, "LIST", another);
    await recordPreStartCharge(runner, entry(owner.ownerRef, 1, "FIT"));
    expect(await linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: mine, runId: run })).toBe(2);
    expect(await store.readOwnerSpentMicros(owner.ownerRef, from, to)).toBe(before + 10);
    // While it runs, its list's charge is the person's.
    await workItem(run, "READY");
    expect(await quota(run)).toBe("SOME");
    await workItem(run, "FAILED");
    expect(await store.readOwnerSpentMicros(owner.ownerRef, from, to)).toBe(before + 5);
    expect(await store.readOwnerSpentInRangesMicros(owner.ownerRef, [{ from, to }])).toEqual([before + 5]);
    expect(await quota(run)).toBe("NONE");
    // Never given back twice: a second failed work item, a second read.
    await workItem(run, "FAILED");
    expect(await store.readOwnerSpentMicros(owner.ownerRef, from, to)).toBe(before + 5);
    expect(await site.readDaySpentMicros(today())).toBe(dayBefore + 10);
    expect((await database.pool.query("SELECT run_id::text AS run_id FROM identity.pre_start_try WHERE try_ref=$1", [mine])).rows)
      .toEqual([{ run_id: run }, { run_id: run }]);
  });

  it("a debate that does not fail keeps its charges; a failed one whose round ran used some; a set-aside one's round is waived", async () => {
    const [kept, ran, setAside] = [tryRef(), tryRef(), tryRef()];
    const [settled, failed, waived] = [await ownRun(), await ownRun(), await ownRun()];
    const [from, to] = window();
    const store = new PostgresModelSpendStore(runner);
    const before = await store.readOwnerSpentMicros(owner.ownerRef, from, to);
    await charged(6, "MERGE", kept);
    await charged(2, "LIST", ran);
    await charged(1, "LIST", setAside);
    for (const [made, run] of [[kept, settled], [ran, failed], [setAside, waived]] as const) {
      expect(await linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: made, runId: run })).toBe(1);
    }
    await workItem(settled, "DONE");
    await round(failed, 7);
    await workItem(failed, "FAILED");
    await round(waived, 5);
    await database.pool.query("INSERT INTO ledger.model_spend_waiver (run_id, reason) VALUES ($1, 'RELEASE_NOT_SERVED')", [waived]);
    await workItem(waived, "FAILED");
    expect(await store.readOwnerSpentMicros(owner.ownerRef, from, to)).toBe(before + 6);
    expect(await quota(settled)).toBe("SOME");
    expect(await quota(failed)).toBe("SOME");
    expect(await quota(waived)).toBe("NONE");
  });

  it("Start gives a try's charges once, to the person's own debate only; a charge recorded after it waits for the next Start", async () => {
    const made = tryRef();
    const [first, second] = [await ownRun(), await ownRun()];
    await charged(3, "LIST", made);
    expect(await linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: made, runId: first })).toBe(1);
    expect(await linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: made, runId: second })).toBe(0);
    await charged(2, "MERGE_LATE", made);
    // Another person's charges never go to this debate, and this person's never to a debate that is not theirs.
    const dan = await account();
    await recordPreStartCharge(runner, { ...entry(dan.ownerRef, 4, "LIST"), tryRef: made });
    expect(await linkPreStartTry(runner, { ownerRef: dan.ownerRef, tryRef: made, runId: second })).toBe(0);
    expect(await quota(second, dan.ownerRef)).toBeNull();
    expect(await linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: made, runId: randomUUID() })).toBe(0);
    expect(await linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: made, runId: second })).toBe(1);
    expect((await sqlError(() => linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: "not-a-try", runId: second }))).code).toBe("23514");
    expect((await sqlError(() => charged(1, "FIT", made.toUpperCase()))).code).toBe("23514");
    expect(await quota(randomUUID())).toBeNull();
  });

  it("a team member's charge leaves the grant's window and the team's limit when its debate fails", async () => {
    const made = tryRef();
    const run = await ownRun();
    const [from, to] = window();
    const grantSpent = () => total(runner, "SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total",
      [owner.ownerRef, GRANT.grantId, GRANT.grantEventId, from, to]);
    const teamSpent = () => total(database.pool, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to]);
    const [grantBefore, teamBefore] = [await grantSpent(), await teamSpent()];
    await charged(4, "COMBINE", made, GRANT);
    expect(await linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: made, runId: run })).toBe(1);
    expect([await grantSpent(), await teamSpent()]).toEqual([grantBefore + 4, teamBefore + 4]);
    await workItem(run, "FAILED");
    expect([await grantSpent(), await teamSpent()]).toEqual([grantBefore, teamBefore]);
  });

  it("the try's row is append-only but for its one link; an erased account takes it; no request role reads it; each function has its roles", async () => {
    const ana = await account();
    const made = tryRef();
    const charge = { ...entry(ana.ownerRef, 2, "LIST"), tryRef: made };
    await recordPreStartCharge(runner, charge);
    for (const sql of ["UPDATE identity.pre_start_try SET try_ref=repeat('a',64) WHERE charge_id=$1",
      "UPDATE identity.pre_start_try SET run_id=gen_random_uuid() WHERE charge_id=$1", "DELETE FROM identity.pre_start_try WHERE charge_id=$1"]) {
      expect((await sqlError(() => database.pool.query(sql, [charge.spendId]))).message, sql).toContain("PRE_START_TRY_GIVEN_ONCE");
    }
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [ana.userId]);
    expect((await database.pool.query("SELECT 1 FROM identity.pre_start_try WHERE owner_ref=$1", [ana.ownerRef])).rowCount).toBe(0);
    for (const pool of [runner, billing, erasure, worker, authorization, replay]) {
      expect((await sqlError(() => pool.query("SELECT * FROM identity.pre_start_try"))).code).toBe("42501");
    }
    const denied = async (pool: Pool, sql: string, values: readonly unknown[]) => (await sqlError(() => pool.query(sql, [...values]))).code === "42501";
    // As 0158's own: the API's billing and authorization logins hold the runtime role, so only the other roles are refused.
    for (const pool of [erasure, worker, replay]) {
      expect(await denied(pool, "SELECT identity.link_pre_start_try($1,$2,$1)", [randomUUID(), made])).toBe(true);
      expect(await denied(pool, "SELECT identity.read_run_quota_used($1,$1)", [randomUUID()])).toBe(true);
      expect(await denied(pool, "SELECT identity.record_pre_start_try_charge($1,$1,NULL,NULL,'LIST','pre-start:list:x:y',current_date,1,1,1,$2)",
        [randomUUID(), made])).toBe(true);
    }
  });

  // Task 57e (the owner's 6 Nov rule: "re-use what we already paid for ... only in case ... there's no way we can re-use those parts, then
  // of course we will give the user back that credit"): a failed debate that keeps the paths chosen from the list keeps the charges that
  // bought them, for "Ask this again" re-uses those paths at no new charge; one that keeps nothing they bought gives them back.
  /** The debate's set as 0159 keeps it (codes only here: written past the content check, as the database's own fixtures write one). */
  async function pathSet(runId: string, source: "MENU" | "RUN_BUILT" | "DIG_PICKS"): Promise<void> {
    const seed = await database.pool.connect();
    try {
      await seed.query("BEGIN");
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query(`INSERT INTO core.start_path_set (run_id,source,width,path_count,chosen_by,carry_on_to_report,content_ciphertext,content_attestation)
        VALUES ($1,$2,3,3,'PERSON',false,'{}'::jsonb,'\\x00'::bytea)`, [runId, source]);
      await seed.query("COMMIT");
    } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
  }

  it("Task 57e: a failed debate that keeps the paths chosen from the list keeps their charges; one that kept nothing they bought gives them back", async () => {
    const [kept, built, none, dig, setAside] = [tryRef(), tryRef(), tryRef(), tryRef(), tryRef()];
    const [menuRun, builtRun, noSetRun, digRun, setAsideRun] = [await ownRun(), await ownRun(), await ownRun(), await ownRun(), await ownRun()];
    const [from, to] = window();
    const store = new PostgresModelSpendStore(runner);
    const before = await store.readOwnerSpentMicros(owner.ownerRef, from, to);
    await charged(3, "LIST", kept);
    await charged(2, "MERGE", kept);
    await charged(4, "LIST", built);
    await charged(1, "ANGLES", none);
    await charged(6, "COMBINE", dig);
    await charged(7, "MERGE", setAside);
    for (const [made, run] of [[kept, menuRun], [built, builtRun], [none, noSetRun], [dig, digRun], [setAside, setAsideRun]] as const) {
      expect(await linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: made, runId: run })).toBeGreaterThan(0);
    }
    await pathSet(menuRun, "MENU");
    await pathSet(builtRun, "RUN_BUILT");
    await pathSet(digRun, "DIG_PICKS");
    await pathSet(setAsideRun, "MENU");
    expect(await store.readOwnerSpentMicros(owner.ownerRef, from, to)).toBe(before + 23);
    // An upload set one aside: its waiver says it used none of the person's quota, so its charges are given back though its paths stay.
    await database.pool.query("INSERT INTO ledger.model_spend_waiver (run_id, reason) VALUES ($1, 'BACKSTOP')", [setAsideRun]);
    for (const run of [menuRun, builtRun, noSetRun, digRun, setAsideRun]) await workItem(run, "FAILED");
    // Only the charges of the paths kept from the list stay: Ask again re-uses them. The rest (nothing stored for the person) are given back.
    expect(await store.readOwnerSpentMicros(owner.ownerRef, from, to)).toBe(before + 5);
    expect(await quota(menuRun)).toBe("SOME");
    expect([await quota(builtRun), await quota(noSetRun), await quota(digRun), await quota(setAsideRun)]).toEqual(["NONE", "NONE", "NONE", "NONE"]);
  });

  it("Task 57e: a team member's failed debate that keeps its paths keeps their charge in the grant's window and the team's limit", async () => {
    const made = tryRef();
    const run = await ownRun();
    const [from, to] = window();
    const grantSpent = () => total(runner, "SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total",
      [owner.ownerRef, GRANT.grantId, GRANT.grantEventId, from, to]);
    const teamSpent = () => total(database.pool, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to]);
    const [grantBefore, teamBefore] = [await grantSpent(), await teamSpent()];
    await charged(4, "LIST", made, GRANT);
    expect(await linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: made, runId: run })).toBe(1);
    await pathSet(run, "MENU");
    await workItem(run, "FAILED");
    expect([await grantSpent(), await teamSpent()]).toEqual([grantBefore + 4, teamBefore + 4]);
  });

  // Task 57h (the 57f/57g review; the owner's 7 Nov words "Only if we can't re-use, then we need to pay for this ourselves"): a path debate the
  // runner refused at its claim because its stored set can never run (no set, a menu the contract refuses, more paths than its receipt priced)
  // can never continue, so even the paths it kept from the list give their charge back, as a debate never queued does. A stop of ours keeps it.
  it("Task 57h: a path set that can never run gives its list charge back, though its paths were kept from the list; a stop of ours keeps it", async () => {
    const [from, to] = window();
    const store = new PostgresModelSpendStore(runner);
    const grantSpent = () => total(runner, "SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total",
      [owner.ownerRef, GRANT.grantId, GRANT.grantEventId, from, to]);
    const teamSpent = () => total(database.pool, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to]);
    const [before, grantBefore, teamBefore] = [await store.readOwnerSpentMicros(owner.ownerRef, from, to), await grantSpent(), await teamSpent()];
    const refused: (readonly [string, string])[] = [];
    for (const code of RUN_PATH_SET_REFUSALS) {
      const [made, run] = [tryRef(), await ownRun()];
      await charged(2, "LIST", made);
      if (code === "PATHS_OVER_RECEIPT") await charged(5, "MERGE", made, GRANT);
      expect(await linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: made, runId: run })).toBeGreaterThan(0);
      await pathSet(run, "MENU");
      refused.push([code, run]);
    }
    const [made, ours] = [tryRef(), await ownRun()];
    await charged(3, "MERGE", made);
    expect(await linkPreStartTry(runner, { ownerRef: owner.ownerRef, tryRef: made, runId: ours })).toBe(1);
    await pathSet(ours, "MENU");
    expect(await store.readOwnerSpentMicros(owner.ownerRef, from, to)).toBe(before + 9);
    expect([await grantSpent(), await teamSpent()]).toEqual([grantBefore + 5, teamBefore + 5]);
    for (const [code, run] of refused) await workItem(run, "FAILED", code);
    await workItem(ours, "FAILED", "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED");
    expect(await store.readOwnerSpentMicros(owner.ownerRef, from, to)).toBe(before + 3);
    expect([await grantSpent(), await teamSpent()]).toEqual([grantBefore, teamBefore]);
    for (const [code, run] of refused) expect(await quota(run), code).toBe("NONE");
    expect(await quota(ours)).toBe("SOME");
  });

  // Task 57e: a debate that stops on our side is claimed again once, a few minutes later, and resumes from what it saved (0119): the copy
  // that stopped keeps its claim until then (so nothing else takes it early, and the run still reads as running), and the work item's one
  // retry is recorded. The lapsed re-send then lists it and the next copy claims it. A second stop is RETRIED: nothing parked again.
  /** A READY work item of the debate, its id. */
  async function readyItem(runId: string): Promise<string> {
    return (await database.pool.query<{ work_item_id: string }>(`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,created_at_seq)
      VALUES ($1,'Q1','[]'::jsonb,$2,'READY',ledger.allocate_sequence()) RETURNING work_item_id::text`, [runId, `retry:${randomUUID()}`])).rows[0]!.work_item_id;
  }
  const releaseOf = async (runId: string): Promise<string> =>
    (await database.pool.query<{ key: string }>("SELECT identity.run_release_now($1) AS key", [runId])).rows[0]!.key;
  const itemRow = async (workItemId: string) => (await database.pool.query<{ state: string; claimed_by: string | null; deadline: string | null;
    held_seconds: number | null }>(`SELECT state, claimed_by, claim_deadline::text AS deadline,
      round(extract(epoch FROM claim_deadline - clock_timestamp()))::int AS held_seconds FROM core.work_item WHERE work_item_id=$1`, [workItemId])).rows[0]!;
  const retries = async (workItemId: string): Promise<number> =>
    Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM core.work_item_retry WHERE work_item_id=$1", [workItemId])).rows[0]!.n);

  it("Task 57e: a stopped debate is parked once: its claim kept until the delay, then lapsed for the re-send and claimed again; a second stop is RETRIED", async () => {
    const run = await ownRun();
    const workItemId = await readyItem(run);
    const releaseKey = await releaseOf(run);
    const first = new WorkItemRepository(system, { releaseKey, workerId: "runner-a" });
    expect((await first.claimById({ workItemId, workerId: "runner-a", claimSeconds: 600 }))?.workItemId).toBe(workItemId);
    // Another copy's park never touches this copy's claim.
    expect(await new WorkItemRepository(system, { releaseKey, workerId: "runner-b" }).parkForRetry({ runId: run, workItemId, delaySeconds: 1 })).toBe("NOT_HELD");
    expect(await retries(workItemId)).toBe(0);
    expect(await first.parkForRetry({ runId: run, workItemId, delaySeconds: 1 })).toBe("PARKED");
    expect(await itemRow(workItemId)).toMatchObject({ state: "CLAIMED", claimed_by: "runner-a" });
    expect(await retries(workItemId)).toBe(1);
    expect(await first.listLapsedClaimed(1_000)).not.toContainEqual({ runId: run, workItemId });
    await new Promise((resolve) => { setTimeout(resolve, 1_200); });
    // The delay passed: the lapsed re-send lists it, and the next copy claims it and resumes.
    expect(await first.listLapsedClaimed(1_000)).toContainEqual({ runId: run, workItemId });
    const second = new WorkItemRepository(system, { releaseKey, workerId: "runner-c" });
    expect((await second.claimById({ workItemId, workerId: "runner-c", claimSeconds: 600 }))?.workItemId).toBe(workItemId);
    const { held_seconds: _seconds, ...held } = await itemRow(workItemId);
    void _seconds;
    // It stops again: never parked twice. Its claim and deadline are left as they were, for the task to record FAILED as today.
    expect(await second.parkForRetry({ runId: run, workItemId })).toBe("RETRIED");
    expect(await itemRow(workItemId)).toMatchObject(held);
    expect(await retries(workItemId)).toBe(1);
    expect(await second.recordTerminalFailure({ runId: run, workItemId, reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED" })).toBe(true);
    expect((await itemRow(workItemId)).state).toBe("FAILED");
  });

  it("Task 57e: the default delay is a few minutes; a FAILED or settled item is never parked; the retry's row is insert-only and no request role reads it", async () => {
    const run = await ownRun();
    const workItemId = await readyItem(run);
    const releaseKey = await releaseOf(run);
    const copy = new WorkItemRepository(system, { releaseKey, workerId: "runner-d" });
    await copy.claimById({ workItemId, workerId: "runner-d", claimSeconds: 60 });
    expect(await copy.parkForRetry({ runId: run, workItemId })).toBe("PARKED");
    const held = (await itemRow(workItemId)).held_seconds!;
    expect(held).toBeGreaterThanOrEqual(WORK_ITEM_RETRY.delaySeconds - 5);
    expect(held).toBeLessThanOrEqual(WORK_ITEM_RETRY.delaySeconds);
    expect(WORK_ITEM_RETRY.delaySeconds).toBeGreaterThanOrEqual(120);
    expect(WORK_ITEM_RETRY.delaySeconds).toBeLessThanOrEqual(600);
    const failedRun = await ownRun();
    await workItem(failedRun, "FAILED");
    const failedItem = (await database.pool.query<{ id: string }>("SELECT work_item_id::text AS id FROM core.work_item WHERE run_id=$1", [failedRun])).rows[0]!.id;
    expect(await new WorkItemRepository(system, { releaseKey: await releaseOf(failedRun), workerId: "runner-d" })
      .parkForRetry({ runId: failedRun, workItemId: failedItem })).toBe("NOT_HELD");
    for (const sql of ["UPDATE core.work_item_retry SET retry_after = clock_timestamp() WHERE work_item_id=$1", "DELETE FROM core.work_item_retry WHERE work_item_id=$1"]) {
      expect((await sqlError(() => database.pool.query(sql, [workItemId]))).code, sql).toBe("55000");
    }
    for (const pool of [runner, billing, erasure, worker, authorization, replay]) {
      expect((await sqlError(() => pool.query("SELECT * FROM core.work_item_retry"))).code).toBe("42501");
    }
    const denied = async (pool: Pool) => (await sqlError(() => pool.query("SELECT core.record_work_item_retry($1,$1,clock_timestamp())", [randomUUID()]))).code === "42501";
    for (const pool of [erasure, worker, replay]) expect(await denied(pool)).toBe(true);
    for (const pool of [erasure, worker, replay, runner]) {
      expect((await sqlError(() => pool.query("SELECT core.run_pre_start_kept($1)", [randomUUID()]))).code).toBe("42501");
    }
    // The runner's role may write it, for a CLAIMED item only.
    expect((await sqlError(() => runner.query("SELECT core.record_work_item_retry($1,$1,clock_timestamp())", [randomUUID()]))).message).toContain("WORK_ITEM_RETRY_INVALID");
  });
});
