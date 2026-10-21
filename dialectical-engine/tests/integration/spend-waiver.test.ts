import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresModelSpendStore, costEnvelopeDay } from "@debateai/budget";
import { createPool, migrate, EntitlementRepository, PostgresInternalAllowanceRepository, RunRepository, recordSpendWaiver, type Pool } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { internalFundingFixture } from "../support/internalFundingFixture.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * The spend waiver (side-by-side uploads spec 2026-10-21 §9, C10; migration 0123 §7). A debate set aside because of an
 * upload (the runner's backstop, an owner stop, an unsupported settings version, a release that no longer serves it)
 * uses none of the person's quota: ledger.model_spend_waiver names the run, append-only, one row per run, and every
 * person-window reader leaves its spend out (readOwnerSpentMicros' subscription SQL, billing.read_internal_grant_spent
 * for a funded person). The site's day still counts the real spend: readDaySpentMicros is unchanged. The runner's login
 * (debateai_runtime only) and the API's (debateai_runtime and debateai_billing_runtime) both write it. CI skips this
 * directory; run it alone.
 */
let database: TestDatabase, runner: Pool, api: Pool, fixture: ReturnType<typeof internalFundingFixture>;

function login(name: string): Pool {
  const url = new URL(database.connectionString);
  url.username = name;
  url.password = ["private", "fixture", name].join("-");
  return createPool(url.toString());
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query(`CREATE ROLE waiver_runner LOGIN PASSWORD '${["private", "fixture", "waiver_runner"].join("-")}' IN ROLE debateai_runtime`);
  await database.pool.query(`CREATE ROLE waiver_api LOGIN PASSWORD '${["private", "fixture", "waiver_api"].join("-")}' IN ROLE debateai_runtime,debateai_billing_runtime`);
  runner = login("waiver_runner");
  api = login("waiver_api");
  fixture = internalFundingFixture(database.pool, api);
}, 240_000);
afterAll(async () => { await runner?.end(); await api?.end(); await database?.stop(); });

/** An active subscription person (the free plan, no entitlement event), as b6a-room-decisions seeds one. */
async function subscriptionPerson(): Promise<string> {
  const ownerRef = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,
       password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at)
     VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [randomUUID(), randomBytes(32), `waiver-${randomUUID()}`, randomUUID(), ownerRef]
  );
  return ownerRef;
}

/** A run of `ownerRef`, pinned to its subscription window as the room pins it. */
async function subscriptionRun(ownerRef: string, admittedAt: Date): Promise<string> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: "Does a set-aside debate use the person's quota?",
    principal: { kind: "legacy", legacyAskerId: `waiver:${randomUUID()}` },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "test",
    askContract: {}, batteryRows: []
  });
  await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
  const entitlements = new EntitlementRepository(database.pool);
  const entitlement = await entitlements.current(ownerRef, admittedAt);
  const client = await database.pool.connect();
  try {
    await entitlements.recordRunChargeScope(client, { runId, ownerRef, planId: entitlement.planId, entitlementEventId: entitlement.eventId, admittedAt });
  } finally { client.release(); }
  return runId;
}

/** One charge of `runId`, billed to the UTC day (the site day) and recorded now. */
async function charge(runId: string, micros: number, source: "RUN" | "STORY" = "RUN"): Promise<void> {
  await database.pool.query(
    `INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
     VALUES (gen_random_uuid(),$1,$2,'fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,$3,1,1)`,
    [source, runId, micros]
  );
}

async function refusalCode(work: Promise<unknown>): Promise<unknown> {
  try { await work; } catch (error) { return (error as { code?: unknown }).code; }
  return "NOT_REFUSED";
}

describe("side-by-side §9, C10: a set-aside debate uses none of the person's quota", () => {
  let ownerRef: string, first: string, from: Date, to: Date;

  beforeAll(async () => {
    const now = Date.now();
    from = new Date(now - 3_600_000);
    to = new Date(now + 3_600_000);
    ownerRef = await subscriptionPerson();
    first = await subscriptionRun(ownerRef, new Date());
    const second = await subscriptionRun(ownerRef, new Date());
    await charge(first, 300);
    await charge(first, 50, "STORY");
    await charge(second, 200);
  });

  it("a waived run leaves the person's window but stays in the site day", async () => {
    // The runner's login reads both totals, as its person wall does.
    const store = new PostgresModelSpendStore(runner);
    const day = costEnvelopeDay(new Date());
    expect(await store.readOwnerSpentMicros(ownerRef, from, to)).toBe(550);
    expect(await store.readDaySpentMicros(day)).toBe(550);
    // The runner's backstop writes the waiver with debateai_runtime alone.
    expect(await recordSpendWaiver(runner, first, "BACKSTOP")).toEqual({ written: true });
    expect(await store.readOwnerSpentMicros(ownerRef, from, to)).toBe(200);
    expect(await store.readDaySpentMicros(day)).toBe(550);
  });

  it("a second waiver keeps the first reason", async () => {
    expect(await recordSpendWaiver(api, first, "OWNER_STOPPED")).toEqual({ written: false });
    expect((await database.pool.query("SELECT reason FROM ledger.model_spend_waiver WHERE run_id=$1", [first])).rows)
      .toEqual([{ reason: "BACKSTOP" }]);
  });

  it("a waiver written on a transaction's client commits or rolls back with it", async () => {
    const runId = await subscriptionRun(ownerRef, new Date());
    const client = await api.connect();
    let clean = false;
    try {
      await client.query("BEGIN");
      expect(await recordSpendWaiver(client, runId, "SETTINGS_VERSION_UNSUPPORTED")).toEqual({ written: true });
      await client.query("ROLLBACK");
      expect((await database.pool.query("SELECT count(*)::int AS n FROM ledger.model_spend_waiver WHERE run_id=$1", [runId])).rows[0].n).toBe(0);
      await client.query("BEGIN");
      expect(await recordSpendWaiver(client, runId, "SETTINGS_VERSION_UNSUPPORTED")).toEqual({ written: true });
      await client.query("COMMIT");
      clean = true;
    } finally { client.release(!clean); }
    expect((await database.pool.query("SELECT reason FROM ledger.model_spend_waiver WHERE run_id=$1", [runId])).rows)
      .toEqual([{ reason: "SETTINGS_VERSION_UNSUPPORTED" }]);
  });

  it("an internal grant's spend excludes waived runs", async () => {
    const actor = await fixture.fundedActor();
    await fixture.configure(actor, fixture.configureCommand(actor));
    const grant = (await new PostgresInternalAllowanceRepository(api).current(actor.ownerRef, new Date()))!;
    const runId = await fixture.run(actor.ownerRef);
    const client = await api.connect();
    try {
      await new EntitlementRepository(api).recordRunChargeScope(client, { runId, ownerRef: actor.ownerRef,
        basis: { kind: "INTERNAL", grantId: grant.grantId, grantEventId: grant.grantEventId }, admittedAt: new Date() });
    } finally { client.release(); }
    await charge(runId, 400);
    const spent = async (total: boolean): Promise<string> => (await api.query<{ spent: string }>(
      "SELECT billing.read_internal_grant_spent($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,$5::timestamptz,$6::boolean)::text AS spent",
      [actor.ownerRef, grant.grantId, grant.grantEventId, from, to, total])).rows[0]!.spent;
    expect(await spent(true)).toBe("400");
    expect(await spent(false)).toBe("400");
    // The API's RELEASE_NOT_SERVED path writes it with its own login.
    expect(await recordSpendWaiver(api, runId, "RELEASE_NOT_SERVED")).toEqual({ written: true });
    expect(await spent(true)).toBe("0");
    expect(await spent(false)).toBe("0");
    // The store's INTERNAL branch follows through the SQL reader: the room, the person wall and the usage page with it.
    expect(await new PostgresModelSpendStore(api).readOwnerSpentMicros(actor.ownerRef, from, to,
      { kind: "INTERNAL", grantId: grant.grantId, grantEventId: grant.grantEventId }, "PERSON_GRANT")).toBe(0);
  });

  it("unknown reasons and unknown runs are refused", async () => {
    const runId = await subscriptionRun(ownerRef, new Date());
    expect(await refusalCode(runner.query("INSERT INTO ledger.model_spend_waiver (run_id, reason) VALUES ($1, 'NOPE')", [runId]))).toBe("23514");
    expect(await refusalCode(recordSpendWaiver(runner, randomUUID(), "BACKSTOP"))).toBe("23503");
  });

  it("waivers are append-only", async () => {
    // The owner (the migrator's superuser) included: the statement trigger (0000's core.reject_mutation) refuses UPDATE
    // and DELETE, and 0056's truncate guard (core.reject_truncate) refuses TRUNCATE, each with its own exact refusal.
    await expect(database.pool.query("UPDATE ledger.model_spend_waiver SET reason='OWNER_STOPPED'"))
      .rejects.toMatchObject({ code: "55000", message: "append-only or immutable table model_spend_waiver rejects UPDATE" });
    await expect(database.pool.query("DELETE FROM ledger.model_spend_waiver"))
      .rejects.toMatchObject({ code: "55000", message: "append-only or immutable table model_spend_waiver rejects DELETE" });
    await expect(database.pool.query("TRUNCATE ledger.model_spend_waiver")).rejects.toMatchObject({
      code: "55000", message: "TRUNCATE_REJECTED: append-only or immutable table ledger.model_spend_waiver rejects TRUNCATE"
    });
    // And no runtime holds the privilege in the first place.
    for (const sql of ["UPDATE ledger.model_spend_waiver SET reason='OWNER_STOPPED'", "DELETE FROM ledger.model_spend_waiver", "TRUNCATE ledger.model_spend_waiver"]) {
      expect(await refusalCode(api.query(sql))).toBe("42501");
    }
    expect((await database.pool.query("SELECT reason FROM ledger.model_spend_waiver WHERE run_id=$1", [first])).rows)
      .toEqual([{ reason: "BACKSTOP" }]);
  });
});
