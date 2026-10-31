import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresModelSpendStore, askClarifyChargeWriterPresent, recordAskClarifyCharge } from "@debateai/budget";
import { createPool, migrate, type Pool } from "@debateai/db";
import { ASK_CLARIFY_SPEND_REF } from "../../apps/api/src/ask-clarify.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0144 on real PostgreSQL (plan 2026-10-31-r22-owner-changes decisions 29 and 31): step 2's small AI counts in the person's day, week and month, in a team
 * member's grant and in the team's one limit, and in the site's day; the row holds the person, the cost and the time; an erased account takes its rows;
 * the export gets the times only; no request role reads the table. Data is made up.
 */
let database: TestDatabase;
let runner: Pool;
let billing: Pool;
let erasure: Pool;
let worker: Pool;
let authorization: Pool;
let replay: Pool;
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
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `clarify-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef };
}
const entry = (ownerRef: string, chargeMicros: number, grant: typeof GRANT | null = null) => ({ spendId: randomUUID(), ownerRef, grant, providerRef: ASK_CLARIFY_SPEND_REF,
  chargedOn: today(), chargeMicros, inputTokens: 700, outputTokens: 90 });
const total = async (pool: Pool, sql: string, values: readonly unknown[]): Promise<number> => Number((await pool.query<{ total: string }>(sql, [...values])).rows[0]!.total);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  for (const [login, role] of [["ac_runner", "debateai_runtime"], ["ac_billing", "debateai_billing_runtime"], ["ac_erasure", "debateai_erasure_runtime"],
    ["ac_worker", "debateai_data_export_worker"], ["ac_authorization", "debateai_authorization_runtime"], ["ac_replay", "debateai_replay"]] as const) {
    await database.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${login}-test-only' IN ROLE ${role}`);
  }
  runner = loginPool("ac_runner", "ac_runner-test-only");
  billing = loginPool("ac_billing", "ac_billing-test-only");
  erasure = loginPool("ac_erasure", "ac_erasure-test-only");
  worker = loginPool("ac_worker", "ac_worker-test-only");
  authorization = loginPool("ac_authorization", "ac_authorization-test-only");
  replay = loginPool("ac_replay", "ac_replay-test-only");
}, 600_000);
afterAll(async () => {
  await Promise.all([runner?.end(), billing?.end(), erasure?.end(), worker?.end(), authorization?.end(), replay?.end()]);
  await database?.stop();
});

describe("0144: the charge reaches every reader", () => {
  it("the API's login finds the writer; another role does not", async () => {
    expect(await askClarifyChargeWriterPresent(runner)).toBe(true);
    expect(await askClarifyChargeWriterPresent(erasure)).toBe(false);
  });

  it("a person's own call is in their windows, their ranges and the site's day, and in nobody else's", async () => {
    const [ana, dan] = [await account(), await account()];
    const store = new PostgresModelSpendStore(runner);
    // The site's day reads across accounts, as the migrator here; the request role's row security would hide others' rows.
    const site = new PostgresModelSpendStore(database.pool);
    const dayBefore = await site.readDaySpentMicros(today());
    await recordAskClarifyCharge(runner, entry(ana.ownerRef, 40));
    await recordAskClarifyCharge(runner, entry(ana.ownerRef, 2));
    const [from, to] = window();
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(42);
    expect(await store.readOwnerSpentMicros(dan.ownerRef, from, to)).toBe(0);
    // A window the call is outside of does not count it.
    expect(await store.readOwnerSpentMicros(ana.ownerRef, new Date(Date.now() - 7_200_000), from)).toBe(0);
    expect(await store.readOwnerSpentInRangesMicros(ana.ownerRef, [{ from, to }, { from: new Date(Date.now() - 7_200_000), to: from }])).toEqual([42, 0]);
    expect(await site.readDaySpentMicros(today())).toBe(dayBefore + 42);
    // It has no run to name in the borrow notice, and the notice's rows stay runs only.
    expect(await store.readOwnerChargesMicros(ana.ownerRef, from, to)).toEqual([]);
    // The billing role, which reads a person's windows too, reaches it.
    expect(await new PostgresModelSpendStore(billing).readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(42);
  });

  it("a team member's call is in their grant's window and the team's reader, not in a subscription window", async () => {
    const ana = await account();
    const [from, to] = window();
    const teamBefore = await total(runner, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to]);
    await recordAskClarifyCharge(runner, entry(ana.ownerRef, 70, GRANT));
    const store = new PostgresModelSpendStore(runner);
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(0);
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to, { kind: "INTERNAL", ...GRANT }, "PERSON_MONTH")).toBe(70);
    expect(await total(runner, "SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total", [ana.ownerRef, GRANT.grantId, GRANT.grantEventId, from, to])).toBe(70);
    expect(await total(runner, "SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total", [ana.ownerRef, randomUUID(), GRANT.grantEventId, from, to])).toBe(0);
    expect(await total(runner, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to])).toBe(teamBefore + 70);
  });

  it("the row holds the person, the cost and the time; the ledger's names nobody and no run", async () => {
    const ana = await account();
    const made = entry(ana.ownerRef, 5);
    await recordAskClarifyCharge(runner, made);
    const row = (await database.pool.query("SELECT * FROM identity.ask_clarify_charge WHERE charge_id=$1", [made.spendId])).rows[0] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["charge_id", "charge_micros", "funding_kind", "internal_grant_event_id", "internal_grant_id", "owner_ref", "recorded_at"]);
    expect(row).toMatchObject({ owner_ref: ana.ownerRef, funding_kind: "SUBSCRIPTION", internal_grant_id: null });
    const ledger = (await database.pool.query("SELECT spend_source,run_id,provider_ref,charge_micros::text charge FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rows[0];
    expect(ledger).toEqual({ spend_source: "ASK_CLARIFY", run_id: null, provider_ref: ASK_CLARIFY_SPEND_REF, charge: "5" });
  });
});

describe("0144: the writer's refusals", () => {
  it("free text in the reference, a far day: refused, nothing written", async () => {
    const ana = await account();
    expect((await sqlError(() => recordAskClarifyCharge(runner, { ...entry(ana.ownerRef, 1), providerRef: "Should the town build a pier?" }))).code).toBe("23514");
    expect((await sqlError(() => recordAskClarifyCharge(runner, { ...entry(ana.ownerRef, 1), chargedOn: "2020-01-01" }))).code).toBe("23514");
    expect(Number((await database.pool.query("SELECT count(*) c FROM identity.ask_clarify_charge WHERE owner_ref=$1", [ana.ownerRef])).rows[0].c)).toBe(0);
  });
  it("a raw insert of the source is refused to the API's login", async () => {
    expect((await sqlError(() => runner.query(`INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
      VALUES ($1,'ASK_CLARIFY',NULL,'ask-clarify:x:y',$2::date,1,1,1)`, [randomUUID(), today()]))).code).toBe("42501");
  });
  it("a person gone while the call ran: the site's day still counts it, and no row names them", async () => {
    const made = entry(randomUUID(), 9);
    const outcome = (await runner.query<{ outcome: string }>("SELECT identity.record_ask_clarify_charge($1,$2,NULL,NULL,$3,$4::date,9,1,1) AS outcome",
      [made.spendId, made.ownerRef, made.providerRef, made.chargedOn])).rows[0]!.outcome;
    expect(outcome).toBe("GONE");
    expect((await database.pool.query("SELECT 1 FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rowCount).toBe(1);
    expect((await database.pool.query("SELECT 1 FROM identity.ask_clarify_charge WHERE charge_id=$1", [made.spendId])).rowCount).toBe(0);
  });
  it("the row is append-only while the account lives", async () => {
    const ana = await account();
    const made = entry(ana.ownerRef, 5);
    await recordAskClarifyCharge(runner, made);
    expect((await sqlError(() => database.pool.query("UPDATE identity.ask_clarify_charge SET charge_micros=0 WHERE charge_id=$1", [made.spendId]))).message).toContain("ASK_CLARIFY_CHARGE_APPEND_ONLY");
    expect((await sqlError(() => database.pool.query("DELETE FROM identity.ask_clarify_charge WHERE charge_id=$1", [made.spendId]))).message).toContain("ASK_CLARIFY_CHARGE_APPEND_ONLY");
  });
});

describe("0144: erasure, export and the roles", () => {
  it("an erased account takes its rows; the ledger's row, naming nobody, stays in the site's day", async () => {
    const ana = await account();
    const made = entry(ana.ownerRef, 5);
    await recordAskClarifyCharge(runner, made);
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [ana.userId]);
    expect((await database.pool.query("SELECT 1 FROM identity.ask_clarify_charge WHERE owner_ref=$1", [ana.ownerRef])).rowCount).toBe(0);
    expect((await database.pool.query("SELECT 1 FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rowCount).toBe(1);
  });

  it("the export worker reads the times of the leased account's calls, no cost and no one else's, under a live lease only", async () => {
    const [ana, dan] = [await account(), await account()];
    await recordAskClarifyCharge(runner, entry(ana.ownerRef, 5));
    await recordAskClarifyCharge(runner, entry(dan.ownerRef, 6));
    const [exportId, workerId] = [randomUUID(), randomUUID()];
    await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, ana.userId, randomUUID(), workerId]);
    const value = (await worker.query<{ value: unknown }>("SELECT identity.read_data_export_ask_clarify($1,$2) AS value", [exportId, workerId])).rows[0]!.value;
    expect(value).toEqual([{ recorded_at: expect.any(String) }]);
    expect((await sqlError(() => worker.query("SELECT identity.read_data_export_ask_clarify($1,$2)", [randomUUID(), workerId]))).code).toBeDefined();
  });

  it("no request role can SELECT the table, and each function has its roles", async () => {
    for (const pool of [runner, billing, erasure, worker, authorization, replay]) {
      expect((await sqlError(() => pool.query("SELECT * FROM identity.ask_clarify_charge"))).code).toBe("42501");
    }
    const [from, to] = window();
    const owner = randomUUID();
    const denied = async (pool: Pool, sql: string, values: readonly unknown[]) => (await sqlError(() => pool.query(sql, [...values]))).code === "42501";
    // The billing and authorization logins inherit the runtime role, as 0141's test finds.
    for (const pool of [erasure, worker, replay]) expect(await denied(pool, "SELECT identity.read_ask_clarify_spent($1,$2,$3)", [owner, from, to])).toBe(true);
    for (const pool of [erasure, worker, replay]) {
      expect(await denied(pool, "SELECT identity.record_ask_clarify_charge($1,$2,NULL,NULL,'ask-clarify:x:y',current_date,1,1,1)", [randomUUID(), owner])).toBe(true);
    }
    for (const pool of [runner, billing, erasure, authorization, replay]) expect(await denied(pool, "SELECT identity.read_data_export_ask_clarify($1,$1)", [owner])).toBe(true);
  });
});
