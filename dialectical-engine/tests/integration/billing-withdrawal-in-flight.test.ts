import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { WorkItemRepository } from "@debateai/battery";
import { withdrawalDeadline, withdrawalRefundMicros } from "@debateai/billing-core";
import { PostgresModelSpendStore } from "@debateai/budget";
import { BillingRepository, EntitlementRepository, RunRepository, migrate } from "@debateai/db";
import { recordWithdrawal } from "../../apps/api/src/billing/withdrawal.js";
import { testBillingPolicy } from "../support/billingFixtures.js";
import {
  mountSubscriptionRoutes,
  seedNetopiaSubscription,
  seedWithdrawalGrant,
  subscriptionDeps
} from "../support/billingSubscriptionFixtures.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * NV-45 in real SQL: a withdrawal's credit used counts the vendor-reported RUN/STORY charges of the person's
 * SUBSCRIPTION debates for calls SENT before the instant (the attempt's `ledger.call_prompt` row), whenever they were
 * charged. While more than a day of the window is left and the statement is under an hour old, a debate that may
 * still be sending (a live claim, or a story still to be written) makes the person try again later, with nothing
 * written and the step-up grant unspent; otherwise the withdrawal is recorded at once. CI skips this directory.
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** PLUS's monthly credit (testBillingPlans). */
const PLUS_CREDIT = 5_000_000;
/** 0090 `call_prompt_fingerprint_shape`: a legacy run's prompt row carries its 64-hex fingerprint in the clear. */
const EMPTY_PROMPT_FINGERPRINT = createHash("sha256").update("[]").digest("hex");

async function legacyRun(askerId = `withdraw:${randomUUID()}`): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Does a withdrawal count the calls sent before it?",
    principal: { kind: "legacy", legacyAskerId: askerId },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "test",
    askContract: {}, batteryRows: []
  });
}

async function ownedRun(ownerRef: string): Promise<string> {
  const runId = await legacyRun();
  await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
  return runId;
}

async function withClient<T>(use: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await use(client);
    await client.query("COMMIT");
    return result;
  } finally {
    client.release();
  }
}

async function pin(runId: string, ownerRef: string, admittedAt: Date): Promise<void> {
  const entitlements = new EntitlementRepository(database.pool);
  const entitlement = await entitlements.current(ownerRef, admittedAt);
  await withClient((client) => entitlements.recordRunChargeScope(client, {
    runId, ownerRef, planId: entitlement.planId, entitlementEventId: entitlement.eventId, admittedAt
  }));
}

/** One vendor-reported charge, stored at `recordedAt`, under `attemptId` when the call had one. */
async function chargeAt(
  runId: string, micros: number, recordedAt: Date, source: "RUN" | "STORY" = "RUN", attemptId: string | null = null
): Promise<void> {
  await database.pool.query(
    `INSERT INTO ledger.model_spend
       (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, recorded_at,
        attempt_id)
     VALUES ($1,$2,$3,'provider-1',$4::date,$5,1,1,$6,$7)`,
    [randomUUID(), source, runId, recordedAt.toISOString().slice(0, 10), micros, recordedAt, attemptId]
  );
}

/** The gateway's prompt row, written just before the attempt is sent: its `recorded_at` is the send time. */
async function prompt(runId: string, attemptId: string, at: Date): Promise<void> {
  await database.pool.query(
    `INSERT INTO ledger.call_prompt (attempt_id, run_id, prompt_fingerprint, prompt_text, recorded_at)
     VALUES ($1,$2,$3,'[]',$4)`,
    [attemptId, runId, EMPTY_PROMPT_FINGERPRINT, at]
  );
}

const work = () => new WorkItemRepository(database.pool);

/** One job of the run, claimed now on the database clock for 300 s (a live runner holds it). */
async function claimedJob(runId: string): Promise<string> {
  const workItemId = await work().enqueue({ runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, nodeSet: [] });
  expect(await work().claimById({ workItemId, workerId: "nv45-runner", claimSeconds: 300 })).not.toBeNull();
  return workItemId;
}

async function settled(workItemId: string): Promise<void> {
  expect(await work().settle({ workItemId, attemptId: randomUUID(), artifactRef: randomUUID() })).toBe(true);
}

async function hold(runId: string, heldMicros: number): Promise<void> {
  await withClient((client) => new PostgresModelSpendStore(database.pool).openHold(client, { runId, heldMicros }));
}

/**
 * A PLUS subscriber in RO activated at `activatedAt`, with a live WITHDRAW_SUBSCRIPTION grant (whose identity row also
 * lets their runs be owned), and the withdrawal composed over the real spend store at the fixed `clock`.
 */
async function subscriber(label: string, input: Readonly<{ activatedAt: Date; clock: Date }>) {
  const identity = testHttpIdentity(label);
  const ownerRef = identity.authenticated.ownerRef;
  const grant = randomBytes(32).toString("base64url");
  await seedWithdrawalGrant(database.pool, identity, grant);
  const seeded = await seedNetopiaSubscription(database.pool, {
    ownerRef, planId: "PLUS", activatedAt: input.activatedAt, taxCountry: "RO"
  });
  const billing = new BillingRepository(database.pool);
  const deps = subscriptionDeps(database.pool, {
    billing, ownerSpend: new PostgresModelSpendStore(database.pool), clock: () => input.clock
  });
  const api = await mountSubscriptionRoutes(deps, identity);
  const withdraw = () => api.inject({
    method: "POST", url: "/v1/billing/subscription/withdraw",
    headers: { "x-test-session": identity.rawSessionToken }, payload: { step_up_grant: grant }
  });
  /** The refund the withdrawal owes at `at` (the clock unless named) for `creditSpentMicros` of credit used. */
  const refundAt = (creditSpentMicros: number, at: Date = input.clock) => withdrawalRefundMicros({
    paidTotalMicros: seeded.totalMicros, periodStart: seeded.periodStart, periodEnd: seeded.periodEnd, now: at,
    creditSpentMicros, monthlyCreditMicros: PLUS_CREDIT
  });
  const withdrawn = async () => (await billing.subscriptionEvents(seeded.subscriptionId))
    .filter((event) => event.kind === "WITHDRAWN");
  /** The owner's command (P14c) for a statement that arrived at `withdrewAt`. */
  const byOwner = (withdrewAt: Date) => recordWithdrawal(deps, {
    ownerRef, withdrewAt, source: "OWNER", authorize: async () => undefined
  });
  return { ownerRef, seeded, api, withdraw, refundAt, withdrawn, byOwner };
}

describe("NV-45 a withdrawal waits for a debate that may still be using credit, while there is time", () => {
  it("waits for a debate held by a live runner: nothing written, the grant unspent, then records once it ends", async () => {
    const now = new Date();
    const person = await subscriber("nv45-live", { activatedAt: new Date(now.getTime() - HOUR), clock: now });
    const run = await ownedRun(person.ownerRef);
    await pin(run, person.ownerRef, new Date(now.getTime() - MINUTE));
    const job = await claimedJob(run);
    const refused = await person.withdraw();
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: "WITHDRAWAL_DEBATE_RUNNING" });
    expect(await person.withdrawn()).toEqual([]);
    await settled(job);
    // The SAME grant: the refusal came before the owner lock, so it was never spent.
    expect((await person.withdraw()).statusCode).toBe(200);
    expect(await person.withdrawn()).toHaveLength(1);
    await person.api.close();
  });

  it("waits for a debate writing its story after its job is DONE (review r1, B2)", async () => {
    const now = new Date();
    const person = await subscriber("nv45-story", { activatedAt: new Date(now.getTime() - HOUR), clock: now });
    const run = await ownedRun(person.ownerRef);
    await pin(run, person.ownerRef, new Date(now.getTime() - 10 * MINUTE));
    await hold(run, 1_000_000);
    const job = await claimedJob(run);
    const answer = randomUUID();
    await prompt(run, answer, new Date(now.getTime() - 3 * MINUTE));
    await chargeAt(run, 500_000, new Date(now.getTime() - 2 * MINUTE), "RUN", answer);
    await settled(job);
    // The story's first call is on its way: its prompt is written, no charge and no serve.answer_story row yet.
    await prompt(run, randomUUID(), new Date(now.getTime() - 30_000));
    const refused = await person.withdraw();
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: "WITHDRAWAL_DEBATE_RUNNING" });
    expect(await person.withdrawn()).toEqual([]);
    await person.api.close();
  });

  it("guard: a finished debate does not wait, and its charge is deducted", async () => {
    const now = new Date();
    const person = await subscriber("nv45-finished", { activatedAt: new Date(now.getTime() - 3 * HOUR), clock: now });
    const run = await ownedRun(person.ownerRef);
    await pin(run, person.ownerRef, new Date(now.getTime() - 2 * HOUR - 10 * MINUTE));
    await hold(run, 1_000_000);
    const job = await claimedJob(run);
    const answer = randomUUID();
    await prompt(run, answer, new Date(now.getTime() - 2 * HOUR - MINUTE));
    await chargeAt(run, 500_000, new Date(now.getTime() - 2 * HOUR), "RUN", answer);
    await settled(job);
    const response = await person.withdraw();
    expect(response.statusCode).toBe(200);
    expect(person.refundAt(500_000)).toBeLessThan(person.refundAt(0));
    expect(await person.withdrawn()).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ refund_micros: person.refundAt(500_000) }) })
    ]);
    await person.api.close();
  });
});

describe("NV-45 the credit used is read by when each call was SENT", () => {
  it("deducts a call sent before the instant and charged after it", async () => {
    const now = new Date();
    const person = await subscriber("nv45-sent-before", { activatedAt: new Date(now.getTime() - HOUR), clock: now });
    const run = await ownedRun(person.ownerRef);
    await pin(run, person.ownerRef, new Date(now.getTime() - MINUTE));
    const attempt = randomUUID();
    await prompt(run, attempt, new Date(now.getTime() - 30_000));
    await chargeAt(run, 1_000_000, new Date(now.getTime() + 1), "RUN", attempt);
    expect((await person.withdraw()).statusCode).toBe(200);
    // One hour into the month the credit share binds, so the call's charge lowers the refund.
    expect(person.refundAt(1_000_000)).toBeLessThan(person.refundAt(0));
    expect(await person.withdrawn()).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ refund_micros: person.refundAt(1_000_000) }) })
    ]);
    await person.api.close();
  });

  it("never turns away the last minutes of the window, and deducts by send time (review r1, B1)", async () => {
    const activatedAt = new Date(Date.now() - 13 * DAY);
    const closesAt = withdrawalDeadline({
      activatedAt, taxCountry: "RO", withdrawalDays: testBillingPolicy.withdrawalDays
    }).closesAt;
    const now = new Date(closesAt.getTime() - 5 * MINUTE);
    const person = await subscriber("nv45-last-minutes", { activatedAt, clock: now });
    const run = await ownedRun(person.ownerRef);
    await pin(run, person.ownerRef, new Date(now.getTime() - MINUTE));
    // A live claim on the database clock: without the margin this would wait.
    await claimedJob(run);
    const attempt = randomUUID();
    await prompt(run, attempt, new Date(now.getTime() - 30_000));
    await chargeAt(run, 4_000_000, new Date(now.getTime() + 1), "RUN", attempt);
    const response = await person.withdraw();
    expect(response.statusCode).toBe(200);
    // 80 % of the credit used binds over the days share (about half of the month left).
    expect(person.refundAt(4_000_000)).toBeLessThan(person.refundAt(0));
    expect(await person.withdrawn()).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ refund_micros: person.refundAt(4_000_000) }) })
    ]);
    await person.api.close();
  });

  it("the owner's command counts the calls sent before the arrival, not the ones stored before it", async () => {
    const now = new Date();
    const person = await subscriber("nv45-owner", { activatedAt: new Date(now.getTime() - HOUR), clock: now });
    const arrival = new Date(now.getTime() - 10 * MINUTE);
    const run = await ownedRun(person.ownerRef);
    await pin(run, person.ownerRef, new Date(arrival.getTime() - MINUTE));
    const before = randomUUID();
    await prompt(run, before, new Date(arrival.getTime() - 30_000));
    await chargeAt(run, 1_000_000, new Date(arrival.getTime() + 10_000), "RUN", before);
    const after = randomUUID();
    await prompt(run, after, new Date(arrival.getTime() + MINUTE));
    await chargeAt(run, 2_000_000, new Date(arrival.getTime() + MINUTE + 1_000), "RUN", after);
    const outcome = await person.byOwner(arrival);
    expect(outcome.refundMicros).toBe(person.refundAt(1_000_000, arrival));
    expect(person.refundAt(1_000_000, arrival)).toBeLessThan(person.refundAt(0, arrival));
    await person.api.close();
  });

  it("guard: an old statement is never held up by a live debate (review r1, minor 1)", async () => {
    const now = new Date();
    const person = await subscriber("nv45-old-statement", { activatedAt: new Date(now.getTime() - 3 * HOUR), clock: now });
    const arrival = new Date(now.getTime() - 2 * HOUR);
    const run = await ownedRun(person.ownerRef);
    await pin(run, person.ownerRef, new Date(arrival.getTime() - MINUTE));
    await claimedJob(run);
    expect(await person.byOwner(arrival)).toMatchObject({ refundMicros: person.refundAt(0, arrival) });
    expect(await person.withdrawn()).toHaveLength(1);
    await person.api.close();
  });

  it("guard: a debate admitted more than a day before the instant is not waited for (review r2, minor 11)", async () => {
    const now = new Date();
    const person = await subscriber("nv45-old-run", { activatedAt: new Date(now.getTime() - 3 * DAY), clock: now });
    const run = await ownedRun(person.ownerRef);
    await pin(run, person.ownerRef, new Date(now.getTime() - DAY - HOUR));
    await claimedJob(run);
    expect((await person.withdraw()).statusCode).toBe(200);
    expect(await person.withdrawn()).toHaveLength(1);
    await person.api.close();
  });

  it("control: a charge with no prompt is dated by its own row, and a run admitted after the instant counts for nothing", async () => {
    const now = new Date();
    const person = await subscriber("nv45-control", { activatedAt: new Date(now.getTime() - HOUR), clock: now });
    const run = await ownedRun(person.ownerRef);
    await pin(run, person.ownerRef, new Date(now.getTime() - MINUTE));
    // No attempt id, stored before the instant: deducted.
    await chargeAt(run, 1_000_000, new Date(now.getTime() - 1_000));
    // An attempt with no prompt row, stored after the instant: not deducted.
    await chargeAt(run, 2_000_000, new Date(now.getTime() + 1_000), "RUN", randomUUID());
    // Admitted after the instant: neither its charge nor its live claim counts.
    const later = await ownedRun(person.ownerRef);
    await pin(later, person.ownerRef, new Date(now.getTime() + 1_000));
    await claimedJob(later);
    await chargeAt(later, 700_000, new Date(now.getTime() - 1_000));
    expect((await person.withdraw()).statusCode).toBe(200);
    expect(await person.withdrawn()).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ refund_micros: person.refundAt(1_000_000) }) })
    ]);
    await person.api.close();
  });
});
