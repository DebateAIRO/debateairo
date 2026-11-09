import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresModelSpendStore, askClarifyChargeWriterPresent, askClarifyReservationPresent, deleteAskClarifyReservationsDue, recordAskClarifyCharge,
  reserveAskClarifyCharge } from "@debateai/budget";
import { generateVerificationToken, hashToken } from "@debateai/crypto";
import { createPool, migrate, type Pool } from "@debateai/db";
import { ASK_CLARIFY_SPEND_REF } from "../../apps/api/src/ask-clarify.js";
import { asRequestOf, createSystemTwin, seedLiveSession } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0144 on real PostgreSQL (plan 2026-10-31-r22-owner-changes decisions 29 and 31): step 2's small AI counts in the person's day, week and month, in a team
 * member's grant and in the team's one limit, and in the site's day; the row holds the person, the cost and the time; an erased account takes its rows;
 * the export gets the times only; no request role reads the table. Data is made up. Since the security review's 0171 (F5) the writer is the
 * cross-account marker's alone: the API reserves each paid call on the person's own request (identity.reserve_ask_clarify_charge, which names only the
 * account of the live session the request presents) and makes no call it could not reserve, then records it on its system login (main.ts's site X32),
 * which names the owner it is handed. So each charge here is written as the API writes it: reserved on the API's billing login carrying the person's
 * session, recorded on the system twin (the billing role and the marker). A request login is refused the writer, and a person's windows are read in
 * their own request or on a login that holds the marker, as the runner's does (0171 asks the reader the connection's person too). The site's day counts
 * every call that was paid. A team grant the charge names funds it only when it is that person's own, by its configured event, and was running when the
 * call was reserved (with no reservation, when it is recorded); any other leaves the call on the person's own plan. A reservation is good for an hour,
 * and the API sweeps the ones no charge took.
 */
let database: TestDatabase;
/** The runtime role's own login, with no session and no marker. */
let runner: Pool;
/** The runner's production login (the runtime role and the cross-account marker), which reads a person's windows for their runs. */
let runs: Pool;
let billing: Pool;
let erasure: Pool;
let worker: Pool;
let authorization: Pool;
let replay: Pool;
/** The API's billing login wired as main.ts wires its request pool: inside a request its own connections carry the person's session. */
let requests: Pool;
/** The API's system twin (the billing role and the cross-account marker). */
let system: Pool;
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
type Account = Readonly<{ userId: string; ownerRef: string; token: string }>;
type Grant = Readonly<{ grantId: string; grantEventId: string }>;
/** Statements as the migrator with the triggers off (replica mode), so a grant can be written, ended or aged past its projection's guards. */
async function asReplica(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
/** A team grant of `person`'s own, running from a day ago to a day ahead, with its CONFIGURED event, as staff's configure writes one. Made up. */
async function grantOf(person: Pick<Account, "ownerRef">, revision = 1): Promise<Grant> {
  const grant = { grantId: randomUUID(), grantEventId: randomUUID() };
  await asReplica([
    [`INSERT INTO billing.internal_grant (grant_id,owner_ref,configured_event_id,revision,amount_micros,day_micros,week_micros,starts_at,expires_at,
        funding_approval_ref,policy_register_version)
      VALUES ($1,$2,$3,$4,1000000,1000000,1000000,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','fixture',1)`,
      [grant.grantId, person.ownerRef, grant.grantEventId, revision]],
    ["INSERT INTO billing.internal_grant_event (event_id,grant_id,event_type,operation_id,revision) VALUES ($1,$2,'CONFIGURED',$3,$4)",
      [grant.grantEventId, grant.grantId, randomUUID(), revision]]]);
  return grant;
}
/** The Owner takes it back (revoked_at now), or it runs out (expires_at now), while or before a call runs. */
const endGrant = (grant: Grant, how: "revoked_at" | "expires_at") =>
  asReplica([[`UPDATE billing.internal_grant SET ${how}=clock_timestamp() WHERE grant_id=$1`, [grant.grantId]]]);
/** How the person's row of a charge was funded, or null when no person's row was written. */
const fundingOf = async (spendId: string) => (await database.pool.query<{ funding_kind: string; internal_grant_id: string | null; internal_grant_event_id: string | null }>(
  "SELECT funding_kind,internal_grant_id,internal_grant_event_id FROM identity.ask_clarify_charge WHERE charge_id=$1", [spendId])).rows[0] ?? null;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `clarify-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef, token: await seedLiveSession(database.pool, userId) };
}
/** The person's own request, on the API's billing login. */
const asking = (person: Account): Pool => asRequestOf(requests, person.token);
const entry = (ownerRef: string, chargeMicros: number, grant: Grant | null = null) => ({ spendId: randomUUID(), ownerRef, grant, providerRef: ASK_CLARIFY_SPEND_REF,
  chargedOn: today(), chargeMicros, inputTokens: 700, outputTokens: 90 });
const total = async (pool: Pool, sql: string, values: readonly unknown[]): Promise<number> => Number((await pool.query<{ total: string }>(sql, [...values])).rows[0]!.total);
/** One paid call as the API makes it (0171, F5): reserved on the person's own request, then recorded on the system login (main.ts's site X32). */
async function paid(person: Account, made: ReturnType<typeof entry>): Promise<void> {
  await reserveAskClarifyCharge(asking(person), made);
  await recordAskClarifyCharge(system, made);
}
const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
/** PostgreSQL's refusal of the writer to a login that does not hold the cross-account marker (0171, F5). */
const NOT_THE_WRITER = { code: "42501", message: "permission denied for function record_ask_clarify_charge" };
const refusal = async (run: () => Promise<unknown>) => { const { code, message } = await sqlError(run); return { code, message }; };

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
  const billingUrl = new URL(database.connectionString);
  billingUrl.username = "ac_billing";
  billingUrl.password = "ac_billing-test-only";
  requests = createPool(billingUrl.toString(), { crossAccount: billing });
  system = createPool(await createSystemTwin(database, "ac_system", ["debateai_billing_runtime"]));
  runs = createPool(await createSystemTwin(database, "ac_runs", ["debateai_runtime"]));
}, 600_000);
afterAll(async () => {
  await Promise.all([runner?.end(), billing?.end(), erasure?.end(), worker?.end(), authorization?.end(), replay?.end(), requests?.end(), system?.end(), runs?.end()]);
  await database?.stop();
});

describe("0144: the charge reaches every reader", () => {
  it("0171: the API's system login finds the writer and its request login the reservation; no login without the cross-account marker finds the writer", async () => {
    expect(await askClarifyChargeWriterPresent(system)).toBe(true);
    expect(await askClarifyReservationPresent(billing)).toBe(true);
    for (const pool of [runner, billing, authorization, erasure]) expect(await askClarifyChargeWriterPresent(pool)).toBe(false);
  });

  it("a person's own call is in their windows, their ranges and the site's day, and in nobody else's", async () => {
    const [ana, dan] = [await account(), await account()];
    const store = new PostgresModelSpendStore(runs);
    // The site's day reads across accounts, as the migrator here; the request role's row security would hide others' rows.
    const site = new PostgresModelSpendStore(database.pool);
    const dayBefore = await site.readDaySpentMicros(today());
    await paid(ana, entry(ana.ownerRef, 40));
    await paid(ana, entry(ana.ownerRef, 2));
    const [from, to] = window();
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(42);
    expect(await store.readOwnerSpentMicros(dan.ownerRef, from, to)).toBe(0);
    // A window the call is outside of does not count it.
    expect(await store.readOwnerSpentMicros(ana.ownerRef, new Date(Date.now() - 7_200_000), from)).toBe(0);
    expect(await store.readOwnerSpentInRangesMicros(ana.ownerRef, [{ from, to }, { from: new Date(Date.now() - 7_200_000), to: from }])).toEqual([42, 0]);
    expect(await site.readDaySpentMicros(today())).toBe(dayBefore + 42);
    // 0171 (F5): another's request, or the request login with no session, may not reserve the call for ana, so the API makes none; and the writer
    // itself is refused to them (the system login's alone), so nothing is paid into the site's day or anyone's quota.
    for (const pool of [asking(dan), billing]) {
      const made = entry(ana.ownerRef, 1000);
      expect(await refusal(() => reserveAskClarifyCharge(pool, made))).toEqual(MISMATCH);
      expect(await refusal(() => recordAskClarifyCharge(pool, made))).toEqual(NOT_THE_WRITER);
      expect((await database.pool.query("SELECT 1 FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rowCount).toBe(0);
    }
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(42);
    expect(await store.readOwnerSpentMicros(dan.ownerRef, from, to)).toBe(0);
    expect(await site.readDaySpentMicros(today())).toBe(dayBefore + 42);
    // It has no run to name in the borrow notice, and the notice's rows stay runs only.
    expect(await store.readOwnerChargesMicros(ana.ownerRef, from, to)).toEqual([]);
    // The billing login reads her windows in her own request; with no session, or in another's request, it is refused (0171: the total is a count
    // that caps, so it refuses a connection that is not the person's rather than reading 0, which would leave her more to spend).
    expect(await new PostgresModelSpendStore(asking(ana)).readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(42);
    expect(await refusal(() => new PostgresModelSpendStore(asking(dan)).readOwnerSpentMicros(ana.ownerRef, from, to))).toEqual(MISMATCH);
    expect(await refusal(() => new PostgresModelSpendStore(billing).readOwnerSpentMicros(ana.ownerRef, from, to))).toEqual(MISMATCH);
  });

  it("a team member's call, reserved while their own grant runs, is in that grant's window and the team's reader, not in a subscription window", async () => {
    const ana = await account();
    const grant = await grantOf(ana);
    const [from, to] = window();
    // 0171 took 0140's team spend sum back from every role (staff's month reader asks it as its owner): the superuser reads it here.
    const teamBefore = await total(database.pool, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to]);
    const made = entry(ana.ownerRef, 70, grant);
    await paid(ana, made);
    expect(await fundingOf(made.spendId)).toEqual({ funding_kind: "INTERNAL", internal_grant_id: grant.grantId, internal_grant_event_id: grant.grantEventId });
    const store = new PostgresModelSpendStore(runs);
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(0);
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to, { kind: "INTERNAL", ...grant }, "PERSON_MONTH")).toBe(70);
    expect(await total(runner, "SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total", [ana.ownerRef, grant.grantId, grant.grantEventId, from, to])).toBe(70);
    expect(await total(runner, "SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total", [ana.ownerRef, randomUUID(), grant.grantEventId, from, to])).toBe(0);
    expect(await total(database.pool, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to])).toBe(teamBefore + 70);
  });

  /** The writer as the API calls it, but naming any grant and event, either of them possibly missing. */
  const chargeNaming = async (pool: Pool, made: ReturnType<typeof entry>, grantId: string | null, eventId: string | null) => (await pool.query<{ outcome: string }>(
    "SELECT identity.record_ask_clarify_charge($1,$2,$3,$4,$5,$6::date,$7,700,90) AS outcome",
    [made.spendId, made.ownerRef, grantId, eventId, made.providerRef, made.chargedOn, made.chargeMicros])).rows[0]!.outcome;
  const ledgerRows = async (spendId: string) => (await database.pool.query("SELECT 1 FROM ledger.model_spend WHERE spend_id=$1", [spendId])).rowCount;
  const SUBSCRIPTION = { funding_kind: "SUBSCRIPTION", internal_grant_id: null, internal_grant_event_id: null };

  it("0171: a grant that is not the person's own funds nothing: another's, made up, the wrong event or half a pair leaves the call on their own plan, refused nothing", async () => {
    const [ana, ben] = [await account(), await account()];
    const [own, bens] = [await grantOf(ana), await grantOf(ben)];
    const [from, to] = window();
    const store = new PostgresModelSpendStore(runs);
    const team = () => total(database.pool, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to]);
    const onGrant = (person: Account, grant: Grant) => total(runner, "SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total",
      [person.ownerRef, grant.grantId, grant.grantEventId, from, to]);
    const teamBefore = await team();
    const named: ReadonlyArray<readonly [string | null, string | null]> = [
      [bens.grantId, bens.grantEventId], [randomUUID(), randomUUID()], [own.grantId, bens.grantEventId], [own.grantId, null], [null, own.grantEventId]];
    for (const [grantId, eventId] of named) {
      const made = entry(ana.ownerRef, 10);
      await reserveAskClarifyCharge(asking(ana), made);
      expect(await chargeNaming(system, made, grantId, eventId), `${grantId} ${eventId}`).toBe("RECORDED");
      expect(await fundingOf(made.spendId)).toEqual(SUBSCRIPTION);
      expect(await ledgerRows(made.spendId)).toBe(1);
    }
    // Each is in ana's own windows; nothing moved on ben's grant, on hers or in the team's month.
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(10 * named.length);
    expect([await onGrant(ben, bens), await onGrant(ana, own), await onGrant(ana, bens)]).toEqual([0, 0, 0]);
    expect(await team()).toBe(teamBefore);
  });

  it("0171: a grant that ends while the call runs still holds the call it admitted; one ended before the call was reserved funds nothing", async () => {
    const ana = await account();
    const [from, to] = window();
    const team = () => total(database.pool, "SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to]);
    const onGrant = (grant: Grant) => total(runner, "SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total",
      [ana.ownerRef, grant.grantId, grant.grantEventId, from, to]);
    const teamBefore = await team();
    // Reserved, then taken back by the Owner while the AI answers: the call was admitted on the grant, as a run's admitted call settles on it.
    const revoked = await grantOf(ana, 1);
    const during = entry(ana.ownerRef, 30, revoked);
    await reserveAskClarifyCharge(asking(ana), during);
    await endGrant(revoked, "revoked_at");
    await recordAskClarifyCharge(system, during);
    expect(await fundingOf(during.spendId)).toMatchObject({ funding_kind: "INTERNAL", internal_grant_id: revoked.grantId });
    // Reserved after it was taken back: the person's own plan.
    const after = entry(ana.ownerRef, 40, revoked);
    await paid(ana, after);
    expect(await fundingOf(after.spendId)).toEqual(SUBSCRIPTION);
    // Reserved on her next grant, which then runs out while the AI answers: still the grant's.
    const expiring = await grantOf(ana, 2);
    const expired = entry(ana.ownerRef, 50, expiring);
    await reserveAskClarifyCharge(asking(ana), expired);
    await endGrant(expiring, "expires_at");
    await recordAskClarifyCharge(system, expired);
    expect(await fundingOf(expired.spendId)).toMatchObject({ funding_kind: "INTERNAL", internal_grant_id: expiring.grantId });
    expect([await onGrant(revoked), await onGrant(expiring)]).toEqual([30, 50]);
    expect(await team()).toBe(teamBefore + 80);
    expect(await new PostgresModelSpendStore(runs).readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(40);
  });

  it("0171: with no reservation, the system login's charge is the owner's it names, funded by that owner's own running grant only; the person's request may not write it", async () => {
    const [ana, dan] = [await account(), await account()];
    const [anas, dans] = [await grantOf(ana), await grantOf(dan)];
    const [own, others] = [entry(ana.ownerRef, 3, anas), entry(ana.ownerRef, 4, dans)];
    for (const made of [own, others]) expect(await refusal(() => recordAskClarifyCharge(asking(ana), made))).toEqual(NOT_THE_WRITER);
    expect(await Promise.all([own, others].map(({ spendId }) => ledgerRows(spendId)))).toEqual([0, 0]);
    for (const made of [own, others]) await recordAskClarifyCharge(system, made);
    const [hisOwn, hers] = [entry(dan.ownerRef, 5, dans), entry(dan.ownerRef, 6, anas)];
    for (const made of [hisOwn, hers]) await recordAskClarifyCharge(system, made);
    expect(await Promise.all([own, others, hisOwn, hers].map(({ spendId }) => fundingOf(spendId)))).toEqual([
      { funding_kind: "INTERNAL", internal_grant_id: anas.grantId, internal_grant_event_id: anas.grantEventId }, SUBSCRIPTION,
      { funding_kind: "INTERNAL", internal_grant_id: dans.grantId, internal_grant_event_id: dans.grantEventId }, SUBSCRIPTION]);
  });

  it("the row holds the person, the cost and the time; the ledger's names nobody and no run", async () => {
    const ana = await account();
    const made = entry(ana.ownerRef, 5);
    await paid(ana, made);
    const row = (await database.pool.query("SELECT * FROM identity.ask_clarify_charge WHERE charge_id=$1", [made.spendId])).rows[0] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["charge_id", "charge_micros", "funding_kind", "internal_grant_event_id", "internal_grant_id", "owner_ref", "recorded_at"]);
    expect(row).toMatchObject({ owner_ref: ana.ownerRef, funding_kind: "SUBSCRIPTION", internal_grant_id: null });
    const ledger = (await database.pool.query("SELECT spend_source,run_id,provider_ref,charge_micros::text charge FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rows[0];
    expect(ledger).toEqual({ spend_source: "ASK_CLARIFY", run_id: null, provider_ref: ASK_CLARIFY_SPEND_REF, charge: "5" });
  });
});

describe("0144: the writer's refusals", () => {
  it("free text in the reference, a far day: refused on the system login that may call it, nothing written", async () => {
    const ana = await account();
    expect((await sqlError(() => recordAskClarifyCharge(system, { ...entry(ana.ownerRef, 1), providerRef: "Should the town build a pier?" }))).code).toBe("23514");
    expect((await sqlError(() => recordAskClarifyCharge(system, { ...entry(ana.ownerRef, 1), chargedOn: "2020-01-01" }))).code).toBe("23514");
    expect(Number((await database.pool.query("SELECT count(*) c FROM identity.ask_clarify_charge WHERE owner_ref=$1", [ana.ownerRef])).rows[0].c)).toBe(0);
  });
  it("a raw insert of the source is refused to the API's request login and the runtime role's (0171 takes the table's INSERT from them)", async () => {
    for (const pool of [runner, billing, asking(await account())]) {
      expect((await sqlError(() => pool.query(`INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
        VALUES ($1,'ASK_CLARIFY',NULL,'ask-clarify:x:y',$2::date,1,1,1)`, [randomUUID(), today()]))).code).toBe("42501");
    }
  });
  it("a person gone while the call ran: the site's day still counts it, and no row names them", async () => {
    const outcomeOf = async (pool: Pool, made: ReturnType<typeof entry>) => (await pool.query<{ outcome: string }>(
      "SELECT identity.record_ask_clarify_charge($1,$2,NULL,NULL,$3,$4::date,9,1,1) AS outcome", [made.spendId, made.ownerRef, made.providerRef, made.chargedOn])).rows[0]!.outcome;
    const rows = async (made: ReturnType<typeof entry>) => [
      (await database.pool.query("SELECT 1 FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rowCount,
      (await database.pool.query("SELECT 1 FROM identity.ask_clarify_charge WHERE charge_id=$1", [made.spendId])).rowCount];
    // The API's request login may not write it at all (0171, F5): refused, nothing written.
    const onRequest = entry(randomUUID(), 9);
    expect(await refusal(() => outcomeOf(billing, onRequest))).toEqual(NOT_THE_WRITER);
    expect(await rows(onRequest)).toEqual([0, 0]);
    // The system login, which records every call, meets the account's absence itself: GONE, as 0144 wrote it, and the site's day counts the call.
    const onSystem = entry(randomUUID(), 9);
    expect(await outcomeOf(system, onSystem)).toBe("GONE");
    expect(await rows(onSystem)).toEqual([1, 0]);
    // A team member erased while the call ran, naming the grant they held: the erasure left the grant no owner, so it funds nothing, and the person
    // is gone all the same (0171 asks the grant before the person's row, and refuses nothing for it).
    const gone = await account();
    const held = await grantOf(gone);
    // The erasure leaves the grant no owner (staff.erase_internal_grant_mapping, in the deletion's own transaction); written ahead here, as the
    // fixture's grant has none of the audit rows the grant's commit guard asks of a real one.
    await asReplica([["UPDATE billing.internal_grant SET owner_ref=NULL WHERE grant_id=$1", [held.grantId]]]);
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [gone.userId]);
    const withGrant = entry(gone.ownerRef, 9);
    expect((await system.query<{ outcome: string }>("SELECT identity.record_ask_clarify_charge($1,$2,$3,$4,$5,$6::date,9,1,1) AS outcome",
      [withGrant.spendId, gone.ownerRef, held.grantId, held.grantEventId, withGrant.providerRef, withGrant.chargedOn])).rows[0]!.outcome).toBe("GONE");
    expect(await rows(withGrant)).toEqual([1, 0]);
  });
  it("the row is append-only while the account lives", async () => {
    const ana = await account();
    const made = entry(ana.ownerRef, 5);
    await paid(ana, made);
    expect((await sqlError(() => database.pool.query("UPDATE identity.ask_clarify_charge SET charge_micros=0 WHERE charge_id=$1", [made.spendId]))).message).toContain("ASK_CLARIFY_CHARGE_APPEND_ONLY");
    expect((await sqlError(() => database.pool.query("DELETE FROM identity.ask_clarify_charge WHERE charge_id=$1", [made.spendId]))).message).toContain("ASK_CLARIFY_CHARGE_APPEND_ONLY");
  });
});

describe("0171: the person is named before the call is paid, while the request's session is live", () => {
  /** What a charge left: the site's ledger row (the call was paid), and the owner its person's row names, if any. */
  const left = async (made: ReturnType<typeof entry>) => ({
    ledger: (await database.pool.query("SELECT 1 FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rowCount,
    person: (await database.pool.query<{ owner_ref: string }>("SELECT owner_ref FROM identity.ask_clarify_charge WHERE charge_id=$1", [made.spendId])).rows[0]?.owner_ref ?? null
  });
  const reservations = async (made: ReturnType<typeof entry>) => (await database.pool.query<{ owner_ref: string }>(
    "SELECT owner_ref FROM identity.ask_clarify_reservation WHERE charge_id=$1", [made.spendId])).rows.map(({ owner_ref }) => owner_ref);
  const outcomeOf = async (pool: Pool, made: ReturnType<typeof entry>) => (await pool.query<{ outcome: string }>(
    "SELECT identity.record_ask_clarify_charge($1,$2,NULL,NULL,$3,$4::date,$5,700,90) AS outcome",
    [made.spendId, made.ownerRef, made.providerRef, made.chargedOn, made.chargeMicros])).rows[0]!.outcome;
  const reserving = (person: Account, made: ReturnType<typeof entry>) => reserveAskClarifyCharge(asking(person), { spendId: made.spendId, ownerRef: made.ownerRef });
  const signOut = (person: Account) => database.pool.query("UPDATE identity.session SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [person.userId]);
  /** PostgreSQL's own refusal of a login that may not call `fn` (42501, as the function's rule is, so the message tells them apart): for the function,
   *  or for its schema when the login may not even look in it. */
  const deniedTo = async (login: string, fn: string) => ({ code: "42501", message: (await database.pool.query<{ usage: boolean }>(
    "SELECT has_schema_privilege($1,'identity','USAGE') AS usage", [login])).rows[0]!.usage ? `permission denied for function ${fn}` : "permission denied for schema identity" });

  it("the boot asks the writer of the system login and the reservation of the request login: a login that may call the writer alone may not reserve, and the request login may not write", async () => {
    await database.pool.query("CREATE ROLE ac_writer_only LOGIN PASSWORD 'ac_writer_only-test-only'");
    await database.pool.query("GRANT USAGE ON SCHEMA identity TO ac_writer_only");
    await database.pool.query("GRANT EXECUTE ON FUNCTION identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint) TO ac_writer_only");
    const writerOnly = loginPool("ac_writer_only", "ac_writer_only-test-only");
    try {
      expect([await askClarifyChargeWriterPresent(writerOnly), await askClarifyReservationPresent(writerOnly)]).toEqual([true, false]);
    } finally { await writerOnly.end(); }
    expect([await askClarifyChargeWriterPresent(billing), await askClarifyReservationPresent(billing)]).toEqual([false, true]);
    expect([await askClarifyChargeWriterPresent(system), await askClarifyReservationPresent(system)]).toEqual([true, true]);
  });

  it("a person who signs out while the call runs: reserved before it was paid, the call is still theirs, in their quota as in the site's day", async () => {
    const ana = await account();
    const [from, to] = window();
    const store = new PostgresModelSpendStore(runs);
    await paid(ana, entry(ana.ownerRef, 7));
    const made = entry(ana.ownerRef, 11);
    await reserving(ana, made);
    // The sign-out (in another tab) revokes the session the running request still presents; the system login records the call.
    await signOut(ana);
    await recordAskClarifyCharge(system, made);
    expect(await left(made)).toEqual({ ledger: 1, person: ana.ownerRef });
    expect(await store.readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(18);
    // The charge took its reservation.
    expect(await reservations(made)).toEqual([]);
  });

  it("a step-up that rotates the session while the call runs: the reserved call is still the person's, and the old token the request still presents reserves no other", async () => {
    const ana = await account();
    const [from, to] = window();
    const [reserved, unreserved] = [entry(ana.ownerRef, 13), entry(ana.ownerRef, 17)];
    await reserving(ana, reserved);
    // A step-up in another tab replaces the session's token in place, as the rotate definers do (0115's rotate_session_after_step_up_with_audit).
    await database.pool.query(`UPDATE identity.session SET token_hash=$1,csrf_token_hash=$2,last_mfa_at=now(),last_seen_at=now()
      WHERE user_id=$3 AND revoked_at IS NULL`, [hashToken("session", generateVerificationToken()), hashToken("csrf", generateVerificationToken()), ana.userId]);
    expect(await outcomeOf(system, reserved)).toBe("RECORDED");
    // The old token names no live session any more, so it reserves no call after the rotation, and the API makes none.
    expect(await refusal(() => reserving(ana, unreserved))).toEqual(MISMATCH);
    expect(await reservations(unreserved)).toEqual([]);
    expect([await left(reserved), await left(unreserved)]).toEqual([{ ledger: 1, person: ana.ownerRef }, { ledger: 0, person: null }]);
    expect(await new PostgresModelSpendStore(runs).readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(13);
  });

  it("a token revoked before any reservation (stolen, then signed out everywhere) reserves nothing, so the API makes no call; the request it presents may not write one either", async () => {
    const ana = await account();
    await signOut(ana);
    const made = entry(ana.ownerRef, 9_000_000_000);
    expect(await refusal(() => reserving(ana, made))).toEqual(MISMATCH);
    expect(await reservations(made)).toEqual([]);
    expect(await refusal(() => outcomeOf(asking(ana), made))).toEqual(NOT_THE_WRITER);
    expect(await left(made)).toEqual({ ledger: 0, person: null });
    const [from, to] = window();
    expect(await new PostgresModelSpendStore(runs).readOwnerSpentMicros(ana.ownerRef, from, to)).toBe(0);
  });

  it("a reservation names one person and one call: a charge under its id for another owner neither takes it nor is admitted at its time", async () => {
    const [ana, dan] = [await account(), await account()];
    const dans = await grantOf(dan);
    const made = entry(ana.ownerRef, 5);
    await reserving(ana, made);
    // Dan's grant is taken back after ana's reservation: a charge under her id naming dan and his grant is timed as it is recorded, not at her
    // reservation, so the grant funds nothing, and her reservation is left as it was.
    await endGrant(dans, "revoked_at");
    const forDan = { ...made, ownerRef: dan.ownerRef, grant: dans };
    await recordAskClarifyCharge(system, forDan);
    expect(await left(made)).toEqual({ ledger: 1, person: dan.ownerRef });
    expect(await fundingOf(made.spendId)).toMatchObject({ funding_kind: "SUBSCRIPTION", internal_grant_id: null });
    expect(await reservations(made)).toEqual([ana.ownerRef]);
  });

  it("the reservation is refused a session that is revoked, expired, another's or absent; a login holding the marker may reserve for anyone", async () => {
    const [ana, dan] = [await account(), await account()];
    const expired = generateVerificationToken();
    await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,last_seen_at,idle_expires_at,
        absolute_expires_at,last_mfa_at,revoked_at) VALUES ($1,$2,$3,$4,'{}',now()-interval '40 days',now()-interval '40 days',now()-interval '39 days',
        now()-interval '10 days',now()-interval '40 days',NULL)`, [randomUUID(), ana.userId, hashToken("session", expired), hashToken("csrf", generateVerificationToken())]);
    const reserve = (pool: Pool, made: ReturnType<typeof entry>) => reserveAskClarifyCharge(pool, { spendId: made.spendId, ownerRef: made.ownerRef });
    // Ana's live session reserves for her, and for nobody else.
    expect(await refusal(() => reserve(asking(ana), entry(ana.ownerRef, 1)))).toEqual({ code: undefined, message: undefined });
    expect(await refusal(() => reserve(asking(ana), entry(dan.ownerRef, 1)))).toEqual(MISMATCH);
    // Her expired session, the request login with no session, a made-up token.
    expect(await refusal(() => reserve(asRequestOf(requests, expired), entry(ana.ownerRef, 1)))).toEqual(MISMATCH);
    expect(await refusal(() => reserve(billing, entry(ana.ownerRef, 1)))).toEqual(MISMATCH);
    expect(await refusal(() => reserve(asRequestOf(requests, generateVerificationToken()), entry(ana.ownerRef, 1)))).toEqual(MISMATCH);
    // Her revoked session.
    await signOut(ana);
    expect(await refusal(() => reserve(asking(ana), entry(ana.ownerRef, 1)))).toEqual(MISMATCH);
    // The API's system twin names any owner, as its sweeps do.
    const made = entry(dan.ownerRef, 3);
    expect((await system.query<{ outcome: string }>("SELECT identity.reserve_ask_clarify_charge($1,$2) AS outcome", [made.spendId, made.ownerRef])).rows[0]!.outcome).toBe("RESERVED");
    expect(await reservations(made)).toEqual([dan.ownerRef]);
    // An id or an owner missing is refused as the writer refuses (23514).
    expect((await sqlError(() => system.query("SELECT identity.reserve_ask_clarify_charge(NULL,$1)", [dan.ownerRef]))).code).toBe("23514");
    expect((await sqlError(() => system.query("SELECT identity.reserve_ask_clarify_charge($1,NULL)", [randomUUID()]))).code).toBe("23514");
  });

  /** Made older as the migrator: no call of theirs was ever recorded. */
  const age = (made: ReturnType<typeof entry>, by: string) => database.pool.query(
    "UPDATE identity.ask_clarify_reservation SET reserved_at=clock_timestamp()-$2::interval WHERE charge_id=$1", [made.spendId, by]);
  /** Every reservation an hour old or older, the youngest first. */
  const hourOld = async (): Promise<string[]> => (await database.pool.query<{ charge_id: string }>(`SELECT charge_id FROM identity.ask_clarify_reservation
    WHERE reserved_at <= clock_timestamp() - interval '1 hour' ORDER BY reserved_at DESC, charge_id`)).rows.map(({ charge_id }) => charge_id);
  const backdate = (owner: string, rows: number) => database.pool.query(`INSERT INTO identity.ask_clarify_reservation (charge_id, owner_ref, reserved_at)
    SELECT gen_random_uuid(), $1, clock_timestamp() - interval '2 hours' - make_interval(secs => i) FROM generate_series(1, $2::integer) AS i`, [owner, rows]);

  it("a reservation its charge never takes (the vendor refused the call, the day pot's gate stopped it, it was abandoned) goes once an hour old with anyone's next reservation, the oldest first, a hundred at a time", async () => {
    const [ana, dan, cy] = [await account(), await account(), await account()];
    const [stale, fresh, staleOfDan] = [entry(ana.ownerRef, 1), entry(ana.ownerRef, 1), entry(dan.ownerRef, 1)];
    for (const [person, made] of [[ana, stale], [ana, fresh], [dan, staleOfDan]] as const) await reserving(person, made);
    await age(stale, "61 minutes");
    await age(staleOfDan, "1 hour 1 second");
    await age(fresh, "59 minutes");
    // Neither ana nor dan comes back: cy's reservation takes both their hour-old rows, and leaves ana's younger one, which her charge may still take.
    const first = entry(cy.ownerRef, 1);
    await reserving(cy, first);
    expect(await Promise.all([stale, staleOfDan, fresh, first].map(reservations))).toEqual([[], [], [ana.ownerRef], [cy.ownerRef]]);
    // A backlog drains: each reservation takes at most a hundred, the oldest first, and adds one.
    await backdate(dan.ownerRef, 150);
    const youngest = (await hourOld()).slice(0, 50);
    await reserving(cy, entry(cy.ownerRef, 1));
    expect(await hourOld()).toEqual(youngest);
    await reserving(cy, entry(cy.ownerRef, 1));
    expect(await hourOld()).toEqual([]);
    expect(await reservations(fresh)).toEqual([ana.ownerRef]);
    // An hour old, a reservation is not taken: its charge, on the system login, is the owner's it names, timed as it is recorded, and the row waits
    // for the next reservation or the sweep.
    await age(fresh, "1 hour");
    expect(await outcomeOf(system, fresh)).toBe("RECORDED");
    expect(await left(fresh)).toEqual({ ledger: 1, person: ana.ownerRef });
    expect(await reservations(fresh)).toEqual([ana.ownerRef]);
  });

  it("the API's sweep takes every reservation an hour old, whoever's, the oldest first, as many as it asks, whether or not anyone reserves again", async () => {
    const [ana, dan] = [await account(), await account()];
    // What the cases before left past the hour goes first, so the counts below are this case's own.
    while (await deleteAskClarifyReservationsDue(system, 1000) === 1000) { /* drained */ }
    const [stale, staleOfDan, young] = [entry(ana.ownerRef, 1), entry(dan.ownerRef, 1), entry(ana.ownerRef, 1)];
    for (const [person, made] of [[ana, stale], [dan, staleOfDan], [ana, young]] as const) await reserving(person, made);
    await age(stale, "61 minutes");
    await age(staleOfDan, "1 hour 1 second");
    await age(young, "59 minutes");
    // Nobody reserves: the sweep alone takes the two hour-old rows and leaves the young one, which its charge may still take.
    expect(await deleteAskClarifyReservationsDue(system, 100)).toBe(2);
    expect(await Promise.all([stale, staleOfDan, young].map(reservations))).toEqual([[], [], [ana.ownerRef]]);
    // A backlog goes in the batches asked for, the oldest first.
    await backdate(dan.ownerRef, 150);
    const youngest = (await hourOld()).slice(0, 50);
    expect(await deleteAskClarifyReservationsDue(system, 100)).toBe(100);
    expect(await hourOld()).toEqual(youngest);
    expect(await deleteAskClarifyReservationsDue(system, 100)).toBe(50);
    expect(await deleteAskClarifyReservationsDue(system, 100)).toBe(0);
    expect(await reservations(young)).toEqual([ana.ownerRef]);
    // A batch outside 1 to 1000 is refused before anything goes.
    for (const limit of [0, 1001, null]) {
      expect(await refusal(() => system.query("SELECT identity.delete_ask_clarify_reservations_due($1::integer)", [limit])), String(limit))
        .toEqual({ code: "22023", message: "ASK_CLARIFY_RESERVATION_SWEEP_INVALID" });
    }
  });

  it("the sweep is the cross-account marker's alone: no request role or login may call it, the person's own request included", async () => {
    const ana = await account();
    for (const [login, pool] of [["ac_billing", asking(ana)], ["ac_billing", billing], ["ac_runner", runner], ["ac_authorization", authorization], ["ac_erasure", erasure],
      ["ac_worker", worker], ["ac_replay", replay]] as const) {
      expect(await refusal(() => pool.query("SELECT identity.delete_ask_clarify_reservations_due(1)")), login)
        .toEqual(await deniedTo(login, "delete_ask_clarify_reservations_due"));
    }
  });

  it("a charge id already reserved for another owner is refused (23505 ASK_CLARIFY_CHARGE_TAKEN) and left as it was; the same owner's repeat reserves nothing new", async () => {
    const [ana, dan] = [await account(), await account()];
    const made = entry(dan.ownerRef, 1);
    expect((await system.query<{ outcome: string }>("SELECT identity.reserve_ask_clarify_charge($1,$2) AS outcome", [made.spendId, dan.ownerRef])).rows[0]!.outcome).toBe("RESERVED");
    expect(await refusal(() => reserveAskClarifyCharge(asking(ana), { spendId: made.spendId, ownerRef: ana.ownerRef })))
      .toEqual({ code: "23505", message: "ASK_CLARIFY_CHARGE_TAKEN" });
    expect(await reservations(made)).toEqual([dan.ownerRef]);
    const own = entry(ana.ownerRef, 1);
    for (const time of [1, 2]) {
      expect((await asking(ana).query<{ outcome: string }>("SELECT identity.reserve_ask_clarify_charge($1,$2) AS outcome", [own.spendId, ana.ownerRef]))
        .rows[0]!.outcome, String(time)).toBe("RESERVED");
    }
    expect(await reservations(own)).toEqual([ana.ownerRef]);
  });

  it("an erased account takes its reservations; no request role may read or write them, and only debateai_runtime and the roles that inherit it (the billing and authorization runtimes) may reserve, each held to the session it presents", async () => {
    const ana = await account();
    const made = entry(ana.ownerRef, 1);
    await reserving(ana, made);
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [ana.userId]);
    expect(await reservations(made)).toEqual([]);
    for (const pool of [runner, billing, erasure, worker, authorization, replay]) {
      expect((await sqlError(() => pool.query("SELECT * FROM identity.ask_clarify_reservation"))).code).toBe("42501");
    }
    // The erasure, export and replay roles may not call it at all: refused for the privilege, not by the function's own rule (both are 42501).
    for (const [login, pool] of [["ac_erasure", erasure], ["ac_worker", worker], ["ac_replay", replay]] as const) {
      expect(await refusal(() => pool.query("SELECT identity.reserve_ask_clarify_charge($1,$2)", [randomUUID(), randomUUID()])), login)
        .toEqual(await deniedTo(login, "reserve_ask_clarify_charge"));
    }
    // The runtime role's own login and the two that inherit it may call it, and with no session (none holds the marker) the rule refuses them.
    for (const pool of [billing, authorization, runner]) {
      expect(await refusal(() => pool.query("SELECT identity.reserve_ask_clarify_charge($1,$2)", [randomUUID(), randomUUID()]))).toEqual(MISMATCH);
    }
  });
});

describe("0144: erasure, export and the roles", () => {
  it("an erased account takes its rows; the ledger's row, naming nobody, stays in the site's day", async () => {
    const ana = await account();
    const made = entry(ana.ownerRef, 5);
    await paid(ana, made);
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [ana.userId]);
    expect((await database.pool.query("SELECT 1 FROM identity.ask_clarify_charge WHERE owner_ref=$1", [ana.ownerRef])).rowCount).toBe(0);
    expect((await database.pool.query("SELECT 1 FROM ledger.model_spend WHERE spend_id=$1", [made.spendId])).rowCount).toBe(1);
  });

  it("the export worker reads the times of the leased account's calls, no cost and no one else's, under a live lease only", async () => {
    const [ana, dan] = [await account(), await account()];
    await paid(ana, entry(ana.ownerRef, 5));
    await paid(dan, entry(dan.ownerRef, 6));
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
    // The billing and authorization logins inherit the runtime role, as 0141's test finds: each may read (0171 holds the reader to the connection's
    // person). The writer is the cross-account marker's alone since 0171: of these logins, only the API's system twin and the runner's may call it.
    const logins = async (signature: string) => (await database.pool.query<{ login: string }>(`SELECT login
      FROM unnest(ARRAY['ac_runner','ac_billing','ac_authorization','ac_system','ac_runs']) AS login WHERE has_function_privilege(login,$1,'EXECUTE') ORDER BY 1`,
      [signature])).rows.map(({ login }) => login);
    expect(await logins("identity.read_ask_clarify_spent(uuid,timestamptz,timestamptz)")).toEqual(["ac_authorization", "ac_billing", "ac_runner", "ac_runs", "ac_system"]);
    expect(await logins("identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)")).toEqual(["ac_runs", "ac_system"]);
    for (const pool of [erasure, worker, replay]) expect(await denied(pool, "SELECT identity.read_ask_clarify_spent($1,$2,$3)", [owner, from, to])).toBe(true);
    for (const pool of [runner, billing, authorization, erasure, worker, replay]) {
      expect(await denied(pool, "SELECT identity.record_ask_clarify_charge($1,$2,NULL,NULL,'ask-clarify:x:y',current_date,1,1,1)", [randomUUID(), owner])).toBe(true);
    }
    for (const pool of [runner, billing, erasure, authorization, replay]) expect(await denied(pool, "SELECT identity.read_data_export_ask_clarify($1,$1)", [owner])).toBe(true);
  });
});
