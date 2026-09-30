import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { PostgresAskApplication, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { BillingPersonAllowanceSource } from "@debateai/billing-core";
import { PostgresModelSpendStore, costEnvelopeDay, type PersonWindow } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { EntitlementRepository, RunRepository, RunWaitRepository, migrate, type WaitReason } from "@debateai/db";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue } from "@debateai/register";
import { AskRoom, type AskRoomOptions } from "../../apps/api/src/ask-room.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Budget spec §2.14 "the waiting line: order, one per person, no line-jumping, a
 * midnight crossing, a plan change, a restart that keeps the line, and a
 * dispatch failure recorded FAILED", and §2.3 rule 1 (a run waiting only for its
 * own person holds nobody back and costs the waker nothing) — through the real
 * ask path and the real waker over embedded Postgres. CI skips this directory;
 * run it before merging.
 */
let database: TestDatabase;
let now = new Date("2031-09-01T10:00:00.000Z");
let estimate = 1_000;
const PLANS = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await database.pool.query(
    "UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE state IN ('READY','CLAIMED')"
  );
  await database.pool.query(
    "INSERT INTO core.run_wait_start (run_id, started_at) SELECT run_id, clock_timestamp() FROM core.run_waiting_v"
  );
});

const ask: AskRequest = {
  question_line: "Should cities make public transport free at the point of use?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:b7b",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "b7b integration test",
  as_of: "2026-09-28T00:00:00.000Z",
  steering_presets: [],
  plan_tier: "free",
  steering_annotations: []
};
const CLASS = Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 });

function roomWith(overrides: Partial<AskRoomOptions> = {}): AskRoom {
  return new AskRoom({
    lockPool: database.pool,
    spend: new PostgresModelSpendStore(database.pool),
    line: new RunWaitRepository(database.pool),
    estimator: { estimateMicros: async () => estimate },
    personAllowance: { read: async () => [] },
    entitlements: null,
    dailyCeilingMicros: 1_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: () => now,
    ...overrides
  });
}

function applicationWith(room: AskRoom, dispatcher: Dispatcher): PostgresAskApplication {
  const settings: RunCreationSettings = {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "b7b-integration",
    settlementWatchHandle: "b7b-integration",
    resolveDiscoveredPanel: async () => PLAN_TIER_ROSTERS.free.map((modelId, index) => Object.freeze({
      provider_ref: `provider:b7b:${String(index + 1)}`, maker: `maker:b7b:${String(index + 1)}`, model_id: modelId,
      probe_evidence_ref: randomUUID(), probed_at: "2026-09-28T00:00:00.000Z"
    })),
    resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
    }),
    room,
    waitingLine: room
  };
  return new PostgresAskApplication(
    database.pool, dispatcher, settings, undefined, database.pool, createTestAskAdmissionPoolFacades(database.pool)
  );
}

function recording() {
  const dispatched: string[] = [];
  const dispatcher: Dispatcher = { dispatch: async ({ runId }) => { dispatched.push(runId); } };
  return { dispatched, dispatcher };
}

function submitAs(application: PostgresAskApplication, askerId: string) {
  const session = {
    asker_id: askerId, session_id: `session:b7b:${randomUUID()}`, caller_scope: "ASKER",
    ownership_provenance: "user_dev_token", provisional_identity_model: true
  } as unknown as Session;
  return application.submit(ask, session, { kind: "legacy", legacyAskerId: askerId });
}

async function fillDay(day: string, micros: number): Promise<void> {
  await database.pool.query(
    `INSERT INTO ledger.model_spend
       (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
     VALUES ($1,'SUPPORT',NULL,'provider-1',$2::date,$3,1,1)`,
    [randomUUID(), day, micros]
  );
}

async function waitingIds(): Promise<string[]> {
  return (await new RunWaitRepository(database.pool).oldestWaiting(1_000)).map((run) => run.runId);
}

async function settleJobsOf(runId: string): Promise<void> {
  await database.pool.query(
    "UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE run_id=$1", [runId]
  );
}

async function jobsOf(runId: string) {
  return (await database.pool.query<{ state: string; terminal_reason: string | null }>(
    "SELECT state, terminal_reason FROM core.work_item WHERE run_id=$1 ORDER BY created_at_seq", [runId]
  )).rows;
}

async function holdOf(runId: string): Promise<number | null> {
  const row = (await database.pool.query<{ held_micros: string }>(
    "SELECT held_micros::text AS held_micros FROM ledger.model_spend_hold WHERE run_id=$1", [runId]
  )).rows[0];
  return row === undefined ? null : Number(row.held_micros);
}

async function chargeScopeOf(runId: string): Promise<string | null> {
  const row = (await database.pool.query<{ plan_id: string }>(
    "SELECT plan_id FROM billing.run_charge_scope WHERE run_id=$1", [runId]
  )).rows[0];
  return row?.plan_id ?? null;
}

async function activeOwner(): Promise<string> {
  const ownerRef = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [randomUUID(), randomBytes(32), `waker-${randomUUID()}`, randomUUID(), ownerRef]
  );
  return ownerRef;
}

async function newRun(planTier: "free" | "premium" = "free"): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Does a plan change wake a waiting question?",
    principal: { kind: "legacy", legacyAskerId: `waker:${randomUUID()}` },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low", planTier, depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "test",
    askContract: {}, batteryRows: []
  });
}

async function ownedRun(ownerRef: string, planTier: "free" | "premium" = "free"): Promise<string> {
  const runId = await newRun(planTier);
  await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
  return runId;
}

async function inTransaction<T>(use: (client: PoolClient) => Promise<T>): Promise<T> {
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

/** A waiting run with a recorded reason, as the ask path leaves it (owned when `ownerRef` is given). */
async function waitingWith(ownerRef: string | null, reason: WaitReason, at: Date): Promise<string> {
  const runId = ownerRef === null ? await newRun() : await ownedRun(ownerRef);
  const line = new RunWaitRepository(database.pool);
  await inTransaction(async (client) => {
    await line.enterWait(client, runId, at);
    await line.recordReason(client, runId, { ...reason, at });
  });
  return runId;
}

/** A person's own spend, pinned to them as a started run is (`billing.run_charge_scope`). */
async function spendAs(ownerRef: string, micros: number, recordedAt: Date): Promise<void> {
  const entitlements = new EntitlementRepository(database.pool);
  const runId = await ownedRun(ownerRef);
  const entitlement = await entitlements.current(ownerRef, recordedAt);
  await inTransaction((client) => entitlements.recordRunChargeScope(client, {
    runId, ownerRef, planId: entitlement.planId, entitlementEventId: entitlement.eventId, admittedAt: recordedAt
  }));
  await database.pool.query(
    `INSERT INTO ledger.model_spend
       (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, recorded_at)
     VALUES ($1,'RUN',$2,'provider-1',$3::date,$4,1,1,$5)`,
    [randomUUID(), runId, recordedAt.toISOString().slice(0, 10), micros, recordedAt]
  );
}

/** An owner's question decided and placed in line by the room, as B6b places it; it must wait. */
async function waitAs(room: AskRoom, ownerRef: string, planTier: "free" | "premium" = "free"): Promise<string> {
  return room.decide({ access: { ownerRef, legacyAskerId: null }, settingsClass: { ...CLASS, planTier } },
    async ({ admission, now: at, tx }) => {
      if (admission.kind !== "WAIT") throw new Error("test: this question must wait");
      const runId = await ownedRun(ownerRef, planTier);
      await room.enterWait(tx, runId, at);
      return runId;
    });
}

function monthWindow(limitMicros: number): PersonWindow {
  return Object.freeze({
    scope: "PERSON_MONTH" as const, limitMicros,
    periodStart: new Date("2031-09-05T00:00:00.000Z"), resetsAt: new Date("2031-12-05T00:00:00.000Z"),
    finishBasisPoints: 11_000, closeBasisPoints: 9_500
  });
}

describe("B7b the waiting line, woken", () => {
  it("starts the line oldest first once midnight has passed, and stops the tick when the day is full again", async () => {
    now = new Date("2031-09-01T10:00:00.000Z");
    estimate = 1_000;
    await fillDay("2031-09-01", 1_000);
    const { dispatched, dispatcher } = recording();
    const application = applicationWith(roomWith(), dispatcher);
    const a = await submitAs(application, `b7b:order:a:${randomUUID()}`);
    now = new Date("2031-09-01T10:00:01.000Z");
    const b = await submitAs(application, `b7b:order:b:${randomUUID()}`);
    now = new Date("2031-09-01T10:00:02.000Z");
    const c = await submitAs(application, `b7b:order:c:${randomUUID()}`);
    expect([a, b, c].map((accepted) => accepted.status)).toEqual(["WAITING", "WAITING", "WAITING"]);
    expect(a.waits_until).toBe("2031-09-02T00:00:00.000Z");

    now = new Date("2031-09-01T23:59:59.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, stopped: true });
    now = new Date("2031-09-02T00:00:30.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, stopped: true });
    expect(dispatched).toEqual([a.run_ref]);
    expect(await waitingIds()).toEqual([b.run_ref, c.run_ref]);

    await settleJobsOf(a.run_ref);
    await application.wakeWaitingRuns();
    expect(dispatched).toEqual([a.run_ref, b.run_ref]);
    expect(await waitingIds()).toEqual([c.run_ref]);
  });

  it("starts at most one waiting question per person per tick", async () => {
    now = new Date("2031-09-05T10:00:00.000Z");
    estimate = 1;
    await fillDay("2031-09-05", 1_000);
    const { dispatched, dispatcher } = recording();
    const application = applicationWith(roomWith({ waitingLinePerPerson: 2 }), dispatcher);
    const askerId = `b7b:person:${randomUUID()}`;
    const first = await submitAs(application, askerId);
    now = new Date("2031-09-05T10:00:01.000Z");
    const second = await submitAs(application, askerId);
    expect([first.status, second.status]).toEqual(["WAITING", "WAITING"]);
    now = new Date("2031-09-06T00:00:30.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, skipped: 1 });
    expect(dispatched).toEqual([first.run_ref]);
    await application.wakeWaitingRuns();
    expect(dispatched).toEqual([first.run_ref, second.run_ref]);
  });

  it("never lets a new question jump the line, even just after the reset", async () => {
    now = new Date("2031-09-10T10:00:00.000Z");
    estimate = 1;
    await fillDay("2031-09-10", 1_000);
    const { dispatched, dispatcher } = recording();
    const application = applicationWith(roomWith(), dispatcher);
    const waiting = await submitAs(application, `b7b:first:${randomUUID()}`);
    now = new Date("2031-09-11T00:00:10.000Z");
    const late = await submitAs(application, `b7b:late:${randomUUID()}`);
    expect(late).toMatchObject({ status: "WAITING", waits_until: "2031-09-11T00:01:00.000Z", waiting_scope: "SITE_DAY" });
    await application.wakeWaitingRuns();
    expect(dispatched).toEqual([waiting.run_ref, late.run_ref]);
  });

  it("starts a person's waiting question within a tick of their upgrade, and a new question does not jump ahead of it", async () => {
    now = new Date("2031-09-15T10:00:00.000Z");
    estimate = 500;
    const owner = await activeOwner();
    const entitlements = new EntitlementRepository(database.pool);
    // The month's limit follows the plan in force: Free 1 000, any paid plan 5 000.
    const room = roomWith({
      dailyCeilingMicros: 10_000_000,
      personAllowance: {
        read: async (ownerRef, at) => ownerRef !== owner ? []
          : [monthWindow((await entitlements.current(owner, at)).planId === "FREE" ? 1_000 : 5_000)]
      },
      entitlements,
      billingPlans: PLANS
    });
    await spendAs(owner, 1_000, new Date("2031-09-15T09:00:00.000Z"));
    const waitingRunId = await waitAs(room, owner);
    const { dispatched, dispatcher } = recording();
    const application = applicationWith(room, dispatcher);
    // This process's first sweep measures it again: still full.
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, skipped: 1, stopped: false });
    // Measured and still full, it is no longer a candidate: the next tick does not even look at it.
    now = new Date("2031-09-15T10:01:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ waiting: 0, started: 0 });

    const subscribedAt = new Date("2031-09-15T10:01:30.000Z");
    await inTransaction((client) => entitlements.append(client, {
      ownerRef: owner, planId: "PLUS", periodAnchorAt: subscribedAt, cause: "SUBSCRIBED", effectiveAt: subscribedAt,
      subscriptionId: randomUUID(), paidThrough: new Date("2031-10-15T10:01:30.000Z")
    }));
    now = new Date("2031-09-15T10:01:40.000Z");
    // The upgraded person's run may start now, so it holds the line until the waker gets to it.
    const late = await submitAs(application, `b7b:after-upgrade:${randomUUID()}`);
    expect(late).toMatchObject({ status: "WAITING", waiting_scope: "SITE_DAY" });
    now = new Date("2031-09-15T10:02:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 2 });
    expect(dispatched).toEqual([waitingRunId, late.run_ref]);
    expect(await chargeScopeOf(waitingRunId)).toBe("PLUS");
  });

  it("keeps the line across a restart: a new process wakes what the old one queued", async () => {
    now = new Date("2031-09-20T10:00:00.000Z");
    estimate = 1;
    await fillDay("2031-09-20", 1_000);
    const waiting = await submitAs(applicationWith(roomWith(), recording().dispatcher), `b7b:restart:${randomUUID()}`);
    now = new Date("2031-09-21T00:00:30.000Z");
    const after = recording();
    await applicationWith(roomWith(), after.dispatcher).wakeWaitingRuns();
    expect(after.dispatched).toEqual([waiting.run_ref]);
  });

  it("records a waiting run whose dispatch fails FAILED; it leaves the line and its hold stops counting", async () => {
    now = new Date("2031-09-25T10:00:00.000Z");
    estimate = 1;
    await fillDay("2031-09-25", 1_000);
    const waiting = await submitAs(applicationWith(roomWith(), recording().dispatcher), `b7b:dispatch:${randomUUID()}`);
    now = new Date("2031-09-26T00:00:30.000Z");
    const failing = applicationWith(roomWith(), { dispatch: async () => { throw new Error("test: the job system refused"); } });
    await expect(failing.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(await jobsOf(waiting.run_ref)).toEqual([{ state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:DISPATCH" }]);
    expect(await waitingIds()).not.toContain(waiting.run_ref);
    expect(await new PostgresModelSpendStore(database.pool).readSiteCountedHoldsMicros(costEnvelopeDay(now))).toBe(0);
  });

  it("leaves a run whose start failed after its job was queued in line with nothing written, and starts it next tick", async () => {
    now = new Date("2031-09-27T10:00:00.000Z");
    estimate = 1;
    await fillDay("2031-09-27", 1_000);
    const { dispatched, dispatcher } = recording();
    const application = applicationWith(roomWith(), dispatcher);
    const waiting = await submitAs(application, `b7b:commit:${randomUUID()}`);
    now = new Date("2031-09-28T00:00:30.000Z");
    const seenOutside: number[] = [];
    const queue = WorkItemRepository.prototype.enqueueOn;
    const failing = vi.spyOn(WorkItemRepository.prototype, "enqueueOn")
      .mockImplementationOnce(async function (this: WorkItemRepository, client, input) {
        await queue.call(this, client, input);
        seenOutside.push((await database.pool.query("SELECT 1 FROM core.work_item WHERE run_id=$1", [input.runId])).rowCount ?? 0);
        throw new Error("test: the start's commit failed");
      });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(seenOutside).toEqual([0]);
    expect(await jobsOf(waiting.run_ref)).toEqual([]);
    expect(await holdOf(waiting.run_ref)).toBeNull();
    expect(await waitingIds()).toContain(waiting.run_ref);
    expect((await new WorkItemRepository(database.pool).listDispatchable(1_000)).map((item) => item.runId))
      .not.toContain(waiting.run_ref);
    failing.mockRestore();
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1 });
    expect(dispatched).toEqual([waiting.run_ref]);
    expect(await jobsOf(waiting.run_ref)).toEqual([{ state: "READY", terminal_reason: null }]);
  });
});

describe("B7b a run waiting only for its own person holds nobody back (budget spec §2.3 rule 1)", () => {
  it("lets 600 of them wait while a new question STARTs, the room read says FITS, and one tick starts a site run behind them", async () => {
    now = new Date("2031-10-01T10:00:00.000Z");
    estimate = 1;
    const connects = { count: 0 };
    const lockPool = new Proxy(database.pool, {
      get(target, key, receiver) {
        if (key === "connect") {
          return () => {
            connects.count += 1;
            return target.connect();
          };
        }
        const value: unknown = Reflect.get(target, key, receiver);
        return typeof value === "function" ? (value as (...values: unknown[]) => unknown).bind(target) : value;
      }
    }) as Pool;
    const room = roomWith({ dailyCeilingMicros: 10_000_000, lockPool });
    const { dispatched, dispatcher } = recording();
    const application = applicationWith(room, dispatcher);
    // This process's first sweep is done while the line is empty.
    await application.wakeWaitingRuns();
    const recheck = new Date("2031-10-21T10:00:00.000Z");
    for (let index = 0; index < 600; index += 1) {
      await waitingWith(await activeOwner(), { waitsFor: "PERSON", personRecheckAt: recheck }, now);
    }
    const fresh = await submitAs(application, `b7b:fresh:${randomUUID()}`);
    expect(fresh.status).toBe("QUEUED");
    await expect(room.readRoom({ access: { ownerRef: null, legacyAskerId: `b7b:read:${randomUUID()}` }, settingsClass: CLASS }))
      .resolves.toMatchObject({ room: "FITS" });
    const behind = await waitingWith(null, { waitsFor: "SITE", personRecheckAt: null }, now);
    dispatched.length = 0;
    connects.count = 0;
    // The tick looks at the one site run alone: no lock and no evaluation for the 600.
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ waiting: 1, started: 1, skipped: 0 });
    expect(dispatched).toEqual([behind]);
    expect(connects.count).toBe(1);
  }, 300_000);

  it("re-records a SITE run whose own person became full as PERSON on the next tick, and it stops holding new questions back", async () => {
    now = new Date("2031-10-02T10:00:00.000Z");
    estimate = 1;
    await fillDay("2031-10-02", 1_000);
    const owner = await activeOwner();
    const room = roomWith({ personAllowance: { read: async (ownerRef) => ownerRef === owner ? [monthWindow(1_000)] : [] } });
    const runId = await waitAs(room, owner);
    const line = new RunWaitRepository(database.pool);
    expect(await line.readWaiting(runId)).toMatchObject({ waitsFor: "SITE" });
    // Its own month fills (spend recorded on the old day, inside the month), and the site's day turns.
    await spendAs(owner, 1_000, new Date("2031-10-02T09:00:00.000Z"));
    now = new Date("2031-10-03T00:00:30.000Z");
    expect(await line.siteLineBlocking(now)).toBe(true);
    const application = applicationWith(room, recording().dispatcher);
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, skipped: 1 });
    expect(await line.readWaiting(runId)).toMatchObject({ waitsFor: "PERSON", personRecheckAt: monthWindow(1_000).resetsAt });
    expect(await line.siteLineBlocking(now)).toBe(false);
    await expect(submitAs(application, `b7b:after:${randomUUID()}`)).resolves.toMatchObject({ status: "QUEUED" });
  });

  it("re-records a PERSON run whose recheck passed while another of its windows filled, with the new instant", async () => {
    now = new Date("2031-10-10T10:00:00.000Z");
    estimate = 1;
    const owner = await activeOwner();
    const dayOne = new Date("2031-10-11T00:00:00.000Z");
    const window = (scope: PersonWindow["scope"], limitMicros: number, periodStart: string, resetsAt: string): PersonWindow =>
      Object.freeze({ scope, limitMicros, periodStart: new Date(periodStart), resetsAt: new Date(resetsAt), finishBasisPoints: 11_000, closeBasisPoints: 9_500 });
    const month = window("PERSON_MONTH", 5_000, "2031-10-01T00:00:00.000Z", "2031-11-01T00:00:00.000Z");
    const room = roomWith({
      dailyCeilingMicros: 10_000_000,
      personAllowance: {
        read: async (ownerRef, at) => ownerRef !== owner ? [] : [
          at.getTime() < dayOne.getTime()
            ? window("PERSON_DAY", 1_000, "2031-10-10T00:00:00.000Z", "2031-10-11T00:00:00.000Z")
            : window("PERSON_DAY", 1_000, "2031-10-11T00:00:00.000Z", "2031-10-12T00:00:00.000Z"),
          month
        ]
      }
    });
    await spendAs(owner, 1_000, new Date("2031-10-10T09:00:00.000Z"));
    const runId = await waitAs(room, owner);
    const line = new RunWaitRepository(database.pool);
    expect(await line.readWaiting(runId)).toMatchObject({ waitsFor: "PERSON", personRecheckAt: dayOne });
    // The month fills too, still on the first day; then the day turns.
    await spendAs(owner, 4_000, new Date("2031-10-10T09:30:00.000Z"));
    now = new Date("2031-10-11T00:00:30.000Z");
    expect(await line.siteLineBlocking(now)).toBe(true);
    await expect(applicationWith(room, recording().dispatcher).wakeWaitingRuns()).resolves.toMatchObject({ started: 0, skipped: 1 });
    expect(await line.readWaiting(runId)).toMatchObject({ waitsFor: "PERSON", personRecheckAt: month.resetsAt });
    expect(await line.siteLineBlocking(now)).toBe(false);
  });

  it("re-measures every PERSON run at boot: a stale one waits for no one after a restart", async () => {
    now = new Date("2031-10-12T10:00:00.000Z");
    estimate = 1;
    const room = roomWith({ dailyCeilingMicros: 10_000_000 });
    const first = recording();
    const running = applicationWith(room, first.dispatcher);
    await running.wakeWaitingRuns();
    // Recorded as waiting for its person, but its person has no window at all any more (say, a new register version).
    const stale = await waitingWith(await activeOwner(), { waitsFor: "PERSON", personRecheckAt: new Date("2031-11-12T10:00:00.000Z") }, now);
    await expect(running.wakeWaitingRuns()).resolves.toMatchObject({ waiting: 0, started: 0 });
    const restarted = recording();
    await expect(applicationWith(roomWith({ dailyCeilingMicros: 10_000_000 }), restarted.dispatcher).wakeWaitingRuns())
      .resolves.toMatchObject({ started: 1 });
    expect(restarted.dispatched).toEqual([stale]);
  });
});

describe("B7b a waiting paid question whose owner is now on Free (PLAN_CHANGED)", () => {
  /** A PLUS owner whose day is full, with a premium question waiting; the first (boot) sweep has run. */
  async function plusOwnerWaiting(paidThrough: Date) {
    now = new Date("2031-10-15T12:00:00.000Z");
    estimate = 1_000;
    const owner = await activeOwner();
    const entitlements = new EntitlementRepository(database.pool);
    const anchor = new Date("2031-10-15T10:00:00.000Z");
    const subscriptionId = randomUUID();
    await inTransaction((client) => entitlements.append(client, {
      ownerRef: owner, planId: "PLUS", periodAnchorAt: anchor, cause: "SUBSCRIBED", effectiveAt: anchor,
      subscriptionId, paidThrough
    }));
    const room = roomWith({
      dailyCeilingMicros: 10_000_000,
      personAllowance: new BillingPersonAllowanceSource({ entitlements, plans: PLANS, closeBasisPoints: 9_500 }),
      entitlements,
      billingPlans: PLANS
    });
    // PLUS's day cap is 20 % of 5 USD: one dollar, spent.
    await spendAs(owner, 1_000_000, new Date("2031-10-15T11:59:00.000Z"));
    const waitingRunId = await waitAs(room, owner, "premium");
    const { dispatched, dispatcher } = recording();
    const application = applicationWith(room, dispatcher);
    now = new Date("2031-10-15T12:00:30.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, skipped: 1 });
    return { owner, entitlements, subscriptionId, anchor, waitingRunId, application, dispatched };
  }

  it("records it FAILED as PLAN_CHANGED after a withdrawal, with no job, hold or charge scope, and it leaves the line", async () => {
    const { owner, entitlements, subscriptionId, waitingRunId, application } = await plusOwnerWaiting(new Date("2031-11-15T10:00:00.000Z"));
    const withdrawnAt = new Date("2031-10-15T12:00:40.000Z");
    await inTransaction((client) => entitlements.append(client, {
      ownerRef: owner, planId: "FREE", periodAnchorAt: withdrawnAt, cause: "ENDED_WITHDRAWAL", effectiveAt: withdrawnAt,
      subscriptionId, paidThrough: null
    }));
    now = new Date("2031-10-15T12:01:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(await jobsOf(waitingRunId)).toEqual([{ state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:PLAN_CHANGED" }]);
    expect(await chargeScopeOf(waitingRunId)).toBeNull();
    expect(await holdOf(waitingRunId)).toBeNull();
    expect(await waitingIds()).not.toContain(waitingRunId);
  });

  it("does the same when the paid plan lapsed past its paid-through instant with no event at all", async () => {
    const paidThrough = new Date("2031-10-15T12:30:00.000Z");
    const { waitingRunId, application } = await plusOwnerWaiting(paidThrough);
    // Over an hour after it was last measured, and past paid_through: the hourly backstop looks again.
    now = new Date("2031-10-15T13:31:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(await jobsOf(waitingRunId)).toEqual([{ state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:PLAN_CHANGED" }]);
  });

  it("still starts it on a move between paid plans (PLUS → PRO), pinned to the new plan", async () => {
    const { owner, entitlements, subscriptionId, anchor, waitingRunId, application, dispatched } =
      await plusOwnerWaiting(new Date("2031-11-15T10:00:00.000Z"));
    const upgradedAt = new Date("2031-10-15T12:00:40.000Z");
    await inTransaction((client) => entitlements.append(client, {
      ownerRef: owner, planId: "PRO", periodAnchorAt: anchor, cause: "UPGRADED", effectiveAt: upgradedAt,
      subscriptionId, paidThrough: new Date("2031-11-15T10:00:00.000Z")
    }));
    now = new Date("2031-10-15T12:01:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    expect(dispatched).toEqual([waitingRunId]);
    expect(await chargeScopeOf(waitingRunId)).toBe("PRO");
  });

  it("still starts a Free question once its owner subscribes (FREE → PLUS)", async () => {
    now = new Date("2031-10-20T12:00:00.000Z");
    estimate = 1_000;
    const owner = await activeOwner();
    const entitlements = new EntitlementRepository(database.pool);
    const room = roomWith({
      dailyCeilingMicros: 10_000_000,
      personAllowance: new BillingPersonAllowanceSource({ entitlements, plans: PLANS, closeBasisPoints: 9_500 }),
      entitlements,
      billingPlans: PLANS
    });
    // Free's month is 0.20 USD, spent.
    await spendAs(owner, 200_000, new Date("2031-10-20T11:59:59.000Z"));
    const waitingRunId = await waitAs(room, owner, "free");
    const { dispatched, dispatcher } = recording();
    const application = applicationWith(room, dispatcher);
    now = new Date("2031-10-20T12:00:30.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, skipped: 1 });
    const subscribedAt = new Date("2031-10-20T12:00:40.000Z");
    await inTransaction((client) => entitlements.append(client, {
      ownerRef: owner, planId: "PLUS", periodAnchorAt: subscribedAt, cause: "SUBSCRIBED", effectiveAt: subscribedAt,
      subscriptionId: randomUUID(), paidThrough: new Date("2031-11-20T12:00:40.000Z")
    }));
    now = new Date("2031-10-20T12:01:00.000Z");
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1 });
    expect(dispatched).toEqual([waitingRunId]);
    expect(await chargeScopeOf(waitingRunId)).toBe("PLUS");
  });
});
