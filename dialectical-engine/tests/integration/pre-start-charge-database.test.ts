import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PostgresModelSpendStore, preStartChargeWriterPresent, preStartSpendRef, recordAskClarifyCharge, recordPreStartCharge, type PreStartChargeKind
} from "@debateai/budget";
import { createPool, migrate, type Pool } from "@debateai/db";
import { ASK_CLARIFY_SPEND_REF } from "../../apps/api/src/ask-clarify.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0156 on real PostgreSQL (V4 start step, plan 2026-11-03 Task 18; spec §5.2): the small AIs before Start count in the person's day, week and month,
 * in a team member's grant and in the team's one limit, and in the site's day; the row holds the person, the kind, the cost and the time; an erased
 * account takes its rows; the export gets the times and the kinds only; no request role reads the table. Data is made up.
 */
let database: TestDatabase;
let runner: Pool;
let billing: Pool;
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
const loginPool = (role: string, password: string): Pool => {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return createPool(url.toString());
};
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
  for (const [login, role] of [["ps_runner", "debateai_runtime"], ["ps_billing", "debateai_billing_runtime"], ["ps_erasure", "debateai_erasure_runtime"],
    ["ps_worker", "debateai_data_export_worker"], ["ps_authorization", "debateai_authorization_runtime"], ["ps_replay", "debateai_replay"]] as const) {
    await database.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${login}-test-only' IN ROLE ${role}`);
  }
  runner = loginPool("ps_runner", "ps_runner-test-only");
  billing = loginPool("ps_billing", "ps_billing-test-only");
  erasure = loginPool("ps_erasure", "ps_erasure-test-only");
  worker = loginPool("ps_worker", "ps_worker-test-only");
  authorization = loginPool("ps_authorization", "ps_authorization-test-only");
  replay = loginPool("ps_replay", "ps_replay-test-only");
  await database.pool.query("CREATE ROLE ps_system LOGIN PASSWORD 'ps_system-test-only' IN ROLE debateai_runtime, debateai_rls_all_accounts");
  system = loginPool("ps_system", "ps_system-test-only");
}, 600_000);
afterAll(async () => {
  await Promise.all([runner?.end(), billing?.end(), erasure?.end(), worker?.end(), authorization?.end(), replay?.end(), system?.end()]);
  await database?.stop();
});

describe("0156: the charge reaches every reader", () => {
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
    expect(await new PostgresModelSpendStore(billing).readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(5);
    const ledger = (await database.pool.query("SELECT spend_source,run_id,provider_ref,charge_micros::text charge FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rows[0];
    expect(ledger).toEqual({ spend_source: "PRE_START", run_id: null, provider_ref: made.providerRef, charge: "3" });
  });

  it("a team member's call is in their grant's window and the team's reader beside step 2's small AI, not in a subscription window", async () => {
    const ana = await account();
    const [from, to] = window();
    const teamBefore = await total(runner, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to]);
    await recordPreStartCharge(runner, entry(ana.ownerRef, 4, "MERGE_LATE", GRANT));
    await recordAskClarifyCharge(runner, { spendId: randomUUID(), ownerRef: ana.ownerRef, grant: GRANT, providerRef: ASK_CLARIFY_SPEND_REF,
      chargedOn: today(), chargeMicros: 3, inputTokens: 1, outputTokens: 1 });
    const store = new PostgresModelSpendStore(runner);
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(0);
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to, { kind: "INTERNAL", ...GRANT }, "PERSON_MONTH")).toBe(7);
    expect(await total(runner, "SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total", [ana.ownerRef, GRANT.grantId, GRANT.grantEventId, from, to])).toBe(7);
    expect(await total(runner, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to])).toBe(teamBefore + 7);
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

describe("0156: the writer's refusals", () => {
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

describe("0156: erasure, export and the roles", () => {
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
