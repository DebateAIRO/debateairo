import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingPersonAllowanceSource } from "@debateai/billing-core";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue } from "@debateai/register";
import { EntitlementRepository, RunRepository, migrate } from "../../packages/db/src/index.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * B5 on a real (embedded) PostgreSQL:
 *  - an account created before billing reads as Free, anchored at its creation,
 *    and that event is written lazily and EXACTLY ONCE, even under concurrent
 *    asks (Review Focus 3);
 *  - the latest event in force wins;
 *  - a paid plan past `paid_through` reads as Free, anchored at the end instant (A8);
 *  - a renewal waiting out an outage stays paid up to 72 h past the period end,
 *    then reads as Free (Q-1's RENEWAL_PENDING);
 *  - the A6 override travels;
 *  - the view the runner reads agrees with the repository, also for a lapsed
 *    plan, and the runtime role may read it (A20);
 *  - both tables are append-only.
 */
let database: TestDatabase;
let entitlements: EntitlementRepository;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  entitlements = new EntitlementRepository(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

async function createAccount(createdAt: Date): Promise<string> {
  const ownerRef = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'b5-test-password-hash',$3,$4,$5,'active',$6,$6)`,
    [randomUUID(), randomBytes(32), `b5-${randomUUID()}`, randomUUID(), ownerRef, createdAt]
  );
  return ownerRef;
}

async function eventCount(ownerRef: string): Promise<number> {
  const result = await database.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM billing.entitlement_event WHERE owner_ref=$1", [ownerRef]
  );
  return Number(result.rows[0]!.count);
}

async function appendEvent(input: Parameters<EntitlementRepository["append"]>[1]): Promise<string> {
  const client = await database.pool.connect();
  try {
    return await entitlements.append(client, input);
  } finally {
    client.release();
  }
}

async function createLegacyRun(): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Whose allowance does this run count against?",
    principal: { kind: "legacy", legacyAskerId: `test:${randomUUID()}` },
    sessionId: randomUUID(),
    callerScope: "ASKER",
    asOf: new Date(),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4),
    registerVersion: 1,
    batteryVersion: "test",
    askContract: {},
    batteryRows: []
  });
}

const T0 = new Date("2026-03-01T09:00:00.000Z");
const plusMonthEnd = new Date("2026-04-01T09:00:00.000Z");

describe("an account from before billing is Free, anchored at its creation", () => {
  it("writes one SIGNED_UP_FREE event on first read and reuses it", async () => {
    const createdAt = new Date("2026-02-10T08:15:00.000Z");
    const ownerRef = await createAccount(createdAt);
    expect(await eventCount(ownerRef)).toBe(0);
    const first = await entitlements.current(ownerRef, T0);
    expect(first).toMatchObject({
      ownerRef, planId: "FREE", cause: "SIGNED_UP_FREE", periodAnchorAt: createdAt,
      monthCreditOverrideMicros: null, paidThrough: null, lapsed: false
    });
    const second = await entitlements.current(ownerRef, T0);
    expect(second.eventId).toBe(first.eventId);
    expect(await eventCount(ownerRef)).toBe(1);
  });

  it("writes it exactly once when twelve asks arrive at once (Review Focus 3)", async () => {
    const ownerRef = await createAccount(new Date("2026-02-11T00:00:00.000Z"));
    const reads = await Promise.all(Array.from({ length: 12 }, () => entitlements.current(ownerRef, T0)));
    expect(new Set(reads.map((read) => read.eventId)).size).toBe(1);
    expect(await eventCount(ownerRef)).toBe(1);
  });

  it("refuses an owner no account holds", async () => {
    await expect(entitlements.current(randomUUID(), T0))
      .rejects.toThrowError(expect.objectContaining({ code: "BILLING_OWNER_UNKNOWN" }));
  });
});

describe("the entitlement in force", () => {
  it("is the latest event in force; a later-dated event does not count yet", async () => {
    const ownerRef = await createAccount(new Date("2026-02-01T00:00:00.000Z"));
    await entitlements.current(ownerRef, T0);
    const subscribed = await appendEvent({
      ownerRef, planId: "PLUS", periodAnchorAt: T0, cause: "SUBSCRIBED", effectiveAt: T0,
      subscriptionId: randomUUID(), monthCreditOverrideMicros: null, paidThrough: plusMonthEnd
    });
    expect(await entitlements.current(ownerRef, new Date("2026-03-10T00:00:00.000Z")))
      .toMatchObject({ planId: "PLUS", periodAnchorAt: T0, eventId: subscribed, paidThrough: plusMonthEnd, lapsed: false });
    await appendEvent({
      ownerRef, planId: "PRO", periodAnchorAt: T0, cause: "UPGRADED", effectiveAt: new Date("2026-03-20T00:00:00.000Z"),
      subscriptionId: randomUUID(), monthCreditOverrideMicros: 12_500_000, paidThrough: plusMonthEnd
    });
    expect((await entitlements.current(ownerRef, new Date("2026-03-15T00:00:00.000Z"))).planId).toBe("PLUS");
    expect(await entitlements.current(ownerRef, new Date("2026-03-21T00:00:00.000Z")))
      .toMatchObject({ planId: "PRO", periodAnchorAt: T0, monthCreditOverrideMicros: 12_500_000 });
  });

  it("reads a paid plan past its paid-through instant as Free, anchored at that instant (A8)", async () => {
    const ownerRef = await createAccount(new Date("2026-02-01T00:00:00.000Z"));
    const subscribed = await appendEvent({
      ownerRef, planId: "PLUS", periodAnchorAt: T0, cause: "SUBSCRIBED", effectiveAt: T0,
      subscriptionId: randomUUID(), monthCreditOverrideMicros: null, paidThrough: plusMonthEnd
    });
    expect((await entitlements.current(ownerRef, plusMonthEnd)).planId).toBe("PLUS");
    expect(await entitlements.current(ownerRef, new Date(plusMonthEnd.getTime() + 1))).toMatchObject({
      planId: "FREE", periodAnchorAt: plusMonthEnd, eventId: subscribed,
      monthCreditOverrideMicros: null, paidThrough: null, lapsed: true
    });
  });

  it("refuses an append the table's rules refuse", async () => {
    const ownerRef = await createAccount(new Date("2026-02-01T00:00:00.000Z"));
    await expect(appendEvent({
      ownerRef, planId: "PLUS", periodAnchorAt: T0, cause: "SUBSCRIBED", effectiveAt: T0,
      subscriptionId: randomUUID(), monthCreditOverrideMicros: null, paidThrough: null
    })).rejects.toThrowError(/entitlement_event_paid_through_iff_paid/u);
    await expect(appendEvent({
      ownerRef, planId: "FREE", periodAnchorAt: T0, cause: "ENDED_CANCEL", effectiveAt: T0,
      subscriptionId: null, monthCreditOverrideMicros: 1, paidThrough: null
    })).rejects.toThrowError(/entitlement_event_override_only_paid/u);
    // The extending causes (R-22, Q-1) mean nothing on Free, so a writer that sends one is refused.
    for (const cause of ["RENEWAL_PENDING", "PAST_DUE_GRACE", "RENEWAL_POSTPONED"] as const) {
      await expect(appendEvent({
        ownerRef, planId: "FREE", periodAnchorAt: T0, cause, effectiveAt: T0, subscriptionId: randomUUID(), paidThrough: null
      }), cause).rejects.toThrowError(/entitlement_event_extension_is_paid/u);
    }
    expect(await eventCount(ownerRef)).toBe(0);
  });

  it("keeps a renewal that waits out an outage paid up to 72 h past the period end, then reads it as Free (Q-1)", async () => {
    const ownerRef = await createAccount(new Date("2026-02-01T00:00:00.000Z"));
    const subscriptionId = randomUUID();
    await appendEvent({
      ownerRef, planId: "PLUS", periodAnchorAt: T0, cause: "SUBSCRIBED", effectiveAt: T0,
      subscriptionId, monthCreditOverrideMicros: null, paidThrough: plusMonthEnd
    });
    // P11a's shape at the period end while NETOPIA or the tax service is down:
    // same plan and anchor, no charge, paid_through pushed out by the ruling's 72 hours.
    const pendingUntil = new Date(plusMonthEnd.getTime() + 72 * 3_600_000);
    await appendEvent({
      ownerRef, planId: "PLUS", periodAnchorAt: T0, cause: "RENEWAL_PENDING", effectiveAt: plusMonthEnd,
      subscriptionId, paidThrough: pendingUntil
    });
    // An hour into the outage the person still has the paid plan, on the same windows' anchor.
    expect(await entitlements.current(ownerRef, new Date(plusMonthEnd.getTime() + 3_600_000))).toMatchObject({
      planId: "PLUS", cause: "RENEWAL_PENDING", periodAnchorAt: T0, paidThrough: pendingUntil, lapsed: false
    });
    expect((await entitlements.current(ownerRef, pendingUntil)).planId).toBe("PLUS");
    // No outcome in 72 hours and no newer event: the fail-safe reads Free from that instant (A8a).
    expect(await entitlements.current(ownerRef, new Date(pendingUntil.getTime() + 1))).toMatchObject({
      planId: "FREE", periodAnchorAt: pendingUntil, paidThrough: null, lapsed: true
    });
    // The renewal went through inside the window: P11a's RENEWED event supersedes the pending one.
    const nextEnd = new Date("2026-05-01T09:00:00.000Z");
    await appendEvent({
      ownerRef, planId: "PLUS", periodAnchorAt: T0, cause: "RENEWED", effectiveAt: new Date(plusMonthEnd.getTime() + 7_200_000),
      subscriptionId, paidThrough: nextEnd
    });
    expect(await entitlements.current(ownerRef, new Date(pendingUntil.getTime() + 1)))
      .toMatchObject({ planId: "PLUS", cause: "RENEWED", paidThrough: nextEnd, lapsed: false });
  });

  it("keeps a past-due or postponed plan paid until its extended paid-through instant (R-22, A8a)", async () => {
    const ownerRef = await createAccount(new Date("2026-02-01T00:00:00.000Z"));
    const subscriptionId = randomUUID();
    await appendEvent({
      ownerRef, planId: "PLUS", periodAnchorAt: T0, cause: "SUBSCRIBED", effectiveAt: T0,
      subscriptionId, monthCreditOverrideMicros: null, paidThrough: plusMonthEnd
    });
    // The dunning job's shape (P11): no override member at all, the window extended by eight days.
    const grace = new Date(plusMonthEnd.getTime() + 8 * 86_400_000);
    await appendEvent({
      ownerRef, planId: "PLUS", periodAnchorAt: T0, cause: "PAST_DUE_GRACE", effectiveAt: plusMonthEnd,
      subscriptionId, paidThrough: grace
    });
    expect(await entitlements.current(ownerRef, new Date(plusMonthEnd.getTime() + 86_400_000)))
      .toMatchObject({ planId: "PLUS", cause: "PAST_DUE_GRACE", paidThrough: grace, monthCreditOverrideMicros: null, lapsed: false });
    const postponed = new Date(grace.getTime() + 7 * 86_400_000);
    await appendEvent({
      ownerRef, planId: "PLUS", periodAnchorAt: T0, cause: "RENEWAL_POSTPONED", effectiveAt: grace,
      subscriptionId, paidThrough: postponed
    });
    expect((await entitlements.current(ownerRef, new Date(grace.getTime() + 1))).cause).toBe("RENEWAL_POSTPONED");
    expect(await entitlements.current(ownerRef, new Date(postponed.getTime() + 1)))
      .toMatchObject({ planId: "FREE", periodAnchorAt: postponed, lapsed: true });
  });
});

describe("the runner's read-only path (A20)", () => {
  it("agrees with the repository, and debateai_runtime may read it but never change it", async () => {
    const ownerRef = await createAccount(new Date("2026-02-01T00:00:00.000Z"));
    const now = new Date();
    const past = new Date(now.getTime() - 5 * 86_400_000);
    await appendEvent({
      ownerRef, planId: "MAX", periodAnchorAt: past, cause: "SUBSCRIBED", effectiveAt: past,
      subscriptionId: randomUUID(), monthCreditOverrideMicros: null, paidThrough: new Date(past.getTime() + 30 * 86_400_000)
    });
    const viaRepository = await entitlements.current(ownerRef, now);
    const viaView = await entitlements.readWindowsView(ownerRef);
    expect(viaView).toEqual(viaRepository);
    expect(await entitlements.readOnlyPort().current(ownerRef, now)).toEqual(viaRepository);
    expect(await entitlements.readWindowsView(randomUUID())).toBeNull();
    // R-12: the runner's port never writes, not even the lazy Free sign-up event.
    const untouched = await createAccount(new Date("2026-02-01T00:00:00.000Z"));
    expect(await entitlements.readOnlyPort().current(untouched, now)).toBeNull();
    expect(await eventCount(untouched)).toBe(0);

    const client = await database.pool.connect();
    try {
      await client.query("SET ROLE debateai_runtime");
      const row = await client.query<{ plan_id: string }>(
        "SELECT plan_id FROM billing.person_windows_v WHERE owner_ref=$1", [ownerRef]
      );
      expect(row.rows).toEqual([{ plan_id: "MAX" }]);
      await expect(client.query("UPDATE billing.entitlement_event SET plan_id='FREE' WHERE owner_ref=$1", [ownerRef]))
        .rejects.toThrowError();
      // Go-live row 41 (0093): nor append, to either relation; the appends are the API's billing role's.
      await expect(client.query(
        "INSERT INTO billing.entitlement_event (owner_ref) SELECT owner_ref FROM billing.entitlement_event WHERE false"
      )).rejects.toMatchObject({ code: "42501" });
      await expect(client.query(
        "INSERT INTO billing.run_charge_scope (run_id) SELECT run_id FROM billing.run_charge_scope WHERE false"
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });

  it("reads a lapsed paid plan as Free from paid_through through the view too, and the windows follow (A8)", async () => {
    const ownerRef = await createAccount(new Date("2026-02-01T00:00:00.000Z"));
    const now = new Date();
    const anchorAt = new Date(now.getTime() - 40 * 86_400_000);
    const paidThrough = new Date(now.getTime() - 10 * 86_400_000);
    await appendEvent({
      ownerRef, planId: "PLUS", periodAnchorAt: anchorAt, cause: "SUBSCRIBED", effectiveAt: anchorAt,
      subscriptionId: randomUUID(), monthCreditOverrideMicros: null, paidThrough
    });
    const viaRepository = await entitlements.current(ownerRef, now);
    const viaRunnerPort = await entitlements.readOnlyPort().current(ownerRef, now);
    expect(viaRunnerPort).toMatchObject({ planId: "FREE", lapsed: true, periodAnchorAt: paidThrough, paidThrough: null });
    expect(viaRunnerPort).toEqual(viaRepository);
    const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
    const allowance = new BillingPersonAllowanceSource({ entitlements: entitlements.readOnlyPort(), plans, closeBasisPoints: 9_500 });
    // Ten days after the lapse is inside Free's first month, which opens at paid_through.
    expect(await allowance.read(ownerRef, now)).toEqual([expect.objectContaining({
      scope: "PERSON_MONTH", limitMicros: 200_000, periodStart: paidThrough
    })]);
  });
});

describe("the run's charge scope", () => {
  it("is written once per run, and indexed by owner and time", async () => {
    const runId = await createLegacyRun();
    const ownerRef = await createAccount(new Date("2026-02-01T00:00:00.000Z"));
    const entitlement = await entitlements.current(ownerRef, T0);
    const client = await database.pool.connect();
    try {
      await entitlements.recordRunChargeScope(client, {
        runId, ownerRef, planId: entitlement.planId, entitlementEventId: entitlement.eventId, admittedAt: T0
      });
      await expect(entitlements.recordRunChargeScope(client, {
        runId, ownerRef, planId: "PLUS", entitlementEventId: entitlement.eventId, admittedAt: T0
      })).rejects.toThrowError(/run_charge_scope_pkey/u);
    } finally {
      client.release();
    }
    const stored = await database.pool.query("SELECT owner_ref, plan_id FROM billing.run_charge_scope WHERE run_id=$1", [runId]);
    expect(stored.rows).toEqual([{ owner_ref: ownerRef, plan_id: "FREE" }]);
    const index = await database.pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname='billing' AND indexname='run_charge_scope_owner_admitted_idx'"
    );
    expect(index.rows[0]?.indexdef).toMatch(/\(owner_ref, admitted_at\)/u);
  });

  it("keeps both tables append-only for every role, the owner included", async () => {
    await expect(database.pool.query("DELETE FROM billing.entitlement_event")).rejects.toThrowError(/append-only/u);
    await expect(database.pool.query("UPDATE billing.run_charge_scope SET plan_id='MAX'")).rejects.toThrowError(/append-only/u);
    await expect(database.pool.query("TRUNCATE billing.entitlement_event")).rejects.toThrowError(/TRUNCATE_REJECTED/u);
    await expect(database.pool.query("TRUNCATE billing.run_charge_scope")).rejects.toThrowError("cannot truncate a table referenced in a foreign key constraint");
    await expect(database.pool.query("TRUNCATE billing.run_charge_scope CASCADE")).rejects.toThrowError(/TRUNCATE_REJECTED/u);
  });

  it("opens DELETE only to the retention purge's flag, never UPDATE, and never to the runtime role (A15, R-13)", async () => {
    const ownerRef = await createAccount(new Date("2026-02-01T00:00:00.000Z"));
    const eventId = (await entitlements.current(ownerRef, T0)).eventId;
    const client = await database.pool.connect();
    try {
      // The runtime role holds no DELETE grant, so setting the flag itself cannot delete.
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_runtime");
      await client.query("SET LOCAL debateai.retention_purge = 'on'");
      await expect(client.query("DELETE FROM billing.entitlement_event WHERE event_id=$1", [eventId]))
        .rejects.toThrowError(/permission denied/u);
      await client.query("ROLLBACK");
      // The owner under the flag: UPDATE is still refused; DELETE goes through (what P1a's purge function does).
      await client.query("BEGIN");
      await client.query("SET LOCAL debateai.retention_purge = 'on'");
      await expect(client.query("UPDATE billing.entitlement_event SET plan_id='FREE' WHERE event_id=$1", [eventId]))
        .rejects.toThrowError(/append-only/u);
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await client.query("SET LOCAL debateai.retention_purge = 'on'");
      const deleted = await client.query("DELETE FROM billing.entitlement_event WHERE event_id=$1", [eventId]);
      expect(deleted.rowCount).toBe(1);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect(await eventCount(ownerRef)).toBe(1);
  });

  it("names no account row in any billing constraint", async () => {
    const result = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM pg_catalog.pg_constraint AS constraint_row
      JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'billing' AND constraint_row.confrelid = 'identity."user"'::regclass`);
    expect(result.rows[0]!.count).toBe("0");
  });
});
