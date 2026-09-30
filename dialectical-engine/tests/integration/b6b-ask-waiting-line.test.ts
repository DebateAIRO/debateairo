import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AskAlreadyWaitingRefusal, PostgresAskApplication, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresModelSpendStore, NO_PERSON_ALLOWANCE, costEnvelopeDay } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { RunWaitRepository, migrate } from "@debateai/db";
import { ServeRepository } from "@debateai/serve";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Budget spec §2.7 (B6b) end to end, in real SQL: a hosted ask with the band
 * STARTs with a hold, or WAITs with a place in line and no job, or is refused
 * ASK_ALREADY_WAITING without creating a run. CI skips this directory.
 */
let database: TestDatabase;

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
  tier_provenance_ref: "asker-declaration:b6b",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "b6b integration test",
  as_of: "2026-09-28T00:00:00.000Z",
  steering_presets: [],
  plan_tier: "free",
  steering_annotations: []
};

function roomAt(now: Date, dailyCeilingMicros: number, estimate = 1_234): AskRoom {
  return new AskRoom({
    lockPool: database.pool,
    spend: new PostgresModelSpendStore(database.pool),
    line: new RunWaitRepository(database.pool),
    estimator: { estimateMicros: async () => estimate },
    personAllowance: NO_PERSON_ALLOWANCE,
    entitlements: null,
    dailyCeilingMicros,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: () => now
  });
}

function applicationWith(room: AskRoom, dispatcher: Dispatcher): PostgresAskApplication {
  const settings: RunCreationSettings = {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "b6b-integration",
    settlementWatchHandle: "b6b-integration",
    resolveDiscoveredPanel: async () => PLAN_TIER_ROSTERS.free.map((modelId, index) => Object.freeze({
      provider_ref: `provider:b6b:${String(index + 1)}`, maker: `maker:b6b:${String(index + 1)}`, model_id: modelId,
      probe_evidence_ref: randomUUID(), probed_at: "2026-09-28T00:00:00.000Z"
    })),
    resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
    }),
    room
  };
  return new PostgresAskApplication(
    database.pool, dispatcher, settings, undefined, database.pool, createTestAskAdmissionPoolFacades(database.pool)
  );
}

function sessionOf(askerId: string): Session {
  return {
    asker_id: askerId,
    session_id: `session:b6b:${randomUUID()}`,
    caller_scope: "ASKER",
    ownership_provenance: "user_dev_token",
    provisional_identity_model: true
  } as unknown as Session;
}

function submitAs(application: PostgresAskApplication, askerId: string) {
  return application.submit(ask, sessionOf(askerId), { kind: "legacy", legacyAskerId: askerId });
}

async function fillDay(day: string, micros: number): Promise<void> {
  await database.pool.query(
    `INSERT INTO ledger.model_spend
       (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
     VALUES ($1,'SUPPORT',NULL,'provider-1',$2::date,$3,1,1)`,
    [randomUUID(), day, micros]
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

describe("B6b a hosted ask through the room", () => {
  it("STARTs: queues the first job, holds the estimate in the same decision, and dispatches", async () => {
    const dispatched: string[] = [];
    const application = applicationWith(roomAt(new Date("2031-08-01T10:00:00.000Z"), 10_000_000),
      { dispatch: async ({ runId }) => { dispatched.push(runId); } });
    const accepted = await submitAs(application, `b6b:start:${randomUUID()}`);
    expect(accepted.status).toBe("QUEUED");
    expect(await jobsOf(accepted.run_ref)).toEqual([{ state: "READY", terminal_reason: null }]);
    expect(await holdOf(accepted.run_ref)).toBe(1_234);
    expect(dispatched).toEqual([accepted.run_ref]);
  });

  it("WAITs: the run takes its place in line with no job, and reads WAITING until its expected start", async () => {
    const now = new Date("2031-08-02T10:00:00.000Z");
    await fillDay(costEnvelopeDay(now), 1_000);
    const dispatched: string[] = [];
    const room = roomAt(now, 1_000);
    const application = applicationWith(room, { dispatch: async ({ runId }) => { dispatched.push(runId); } });
    const askerId = `b6b:wait:${randomUUID()}`;
    const accepted = await submitAs(application, askerId);
    expect(accepted).toEqual({
      run_ref: accepted.run_ref, status: "WAITING", waits_until: "2031-08-03T00:00:00.000Z", waiting_scope: "SITE_DAY"
    });
    expect(await jobsOf(accepted.run_ref)).toEqual([]);
    expect(await holdOf(accepted.run_ref)).toBeNull();
    expect(dispatched).toEqual([]);
    await expect(application.readRun(accepted.run_ref, sessionOf(askerId), { ownerRef: null, legacyAskerId: askerId }))
      .resolves.toMatchObject({ state: "WAITING", waits_until: "2031-08-03T00:00:00.000Z" });
    const index = await new ServeRepository(database.pool).readAnswerIndex({ ownerRef: null, legacyAskerId: askerId }, 10, 0);
    expect(index.open_runs.find((run) => run.run_ref === accepted.run_ref)?.state).toBe("WAITING");
  });

  it("refuses a second waiting question of the same asker, naming the first, and creates no run", async () => {
    const now = new Date("2031-08-03T10:00:00.000Z");
    await fillDay(costEnvelopeDay(now), 1_000);
    const application = applicationWith(roomAt(now, 1_000), { dispatch: async () => undefined });
    const askerId = `b6b:again:${randomUUID()}`;
    const first = await submitAs(application, askerId);
    const refusal = await submitAs(application, askerId).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(AskAlreadyWaitingRefusal);
    expect(refusal).toMatchObject({ runRef: first.run_ref, waitsUntil: new Date("2031-08-04T00:00:00.000Z") });
    const runs = await database.pool.query("SELECT run_id FROM core.run WHERE core.run_is_owned_by(run_id,NULL,$1)", [askerId]);
    expect(runs.rows).toHaveLength(1);
  });

  it("records a START whose dispatch fails FAILED, and its hold stops counting", async () => {
    const now = new Date("2031-08-04T10:00:00.000Z");
    const application = applicationWith(roomAt(now, 10_000_000), {
      dispatch: async () => { throw new Error("test: the job system refused"); }
    });
    const askerId = `b6b:dispatch:${randomUUID()}`;
    await expect(submitAs(application, askerId)).rejects.toThrow("test: the job system refused");
    const runId = (await database.pool.query<{ run_id: string }>(
      "SELECT run_id FROM core.run WHERE core.run_is_owned_by(run_id,NULL,$1)", [askerId]
    )).rows[0]!.run_id;
    expect(await jobsOf(runId)).toEqual([{ state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:DISPATCH" }]);
    expect(await new PostgresModelSpendStore(database.pool).readSiteCountedHoldsMicros(costEnvelopeDay(now))).toBe(0);
  });

  it("queues the first job on the decision's own transaction: a failure after it leaves no job a runner could claim", async () => {
    const now = new Date("2031-08-05T10:00:00.000Z");
    const application = applicationWith(roomAt(now, 10_000_000), { dispatch: async () => undefined });
    const askerId = `b6b:commit:${randomUUID()}`;
    const seenOutside: number[] = [];
    const queue = WorkItemRepository.prototype.enqueueOn;
    vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockImplementation(async function (this: WorkItemRepository, client, input) {
      const id = await queue.call(this, client, input);
      // Another connection sees nothing yet: the job is the decision's, uncommitted.
      seenOutside.push((await database.pool.query("SELECT 1 FROM core.work_item WHERE run_id=$1", [input.runId])).rowCount ?? 0);
      throw new Error("test: the decision's commit failed");
    });
    await expect(submitAs(application, askerId)).rejects.toThrow("test: the decision's commit failed");
    expect(seenOutside).toEqual([0]);
    const runId = (await database.pool.query<{ run_id: string }>(
      "SELECT run_id FROM core.run WHERE core.run_is_owned_by(run_id,NULL,$1)", [askerId]
    )).rows[0]!.run_id;
    // The READY job rolled back with the hold; the only job is the FAILED one the setup failure wrote.
    expect(await jobsOf(runId)).toEqual([{ state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:WORK_QUEUE" }]);
    expect(await holdOf(runId)).toBeNull();
    expect((await new WorkItemRepository(database.pool).listDispatchable(1_000)).map((item) => item.runId)).not.toContain(runId);
  });

  it("records a START whose hold is refused FAILED as ROOM_HOLD, with no job queued at all", async () => {
    const now = new Date("2031-08-06T10:00:00.000Z");
    // A zero estimate is refused by openHold (MODEL_SPEND_HOLD_INVALID): the step before the first job.
    const application = applicationWith(roomAt(now, 10_000_000, 0), { dispatch: async () => undefined });
    const askerId = `b6b:hold:${randomUUID()}`;
    await expect(submitAs(application, askerId)).rejects.toThrow("MODEL_SPEND_HOLD_INVALID");
    const runId = (await database.pool.query<{ run_id: string }>(
      "SELECT run_id FROM core.run WHERE core.run_is_owned_by(run_id,NULL,$1)", [askerId]
    )).rows[0]!.run_id;
    expect(await jobsOf(runId)).toEqual([{ state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:ROOM_HOLD" }]);
    expect(await holdOf(runId)).toBeNull();
  });

  it("records a WAIT with why it waits, in the same transaction as its place in line", async () => {
    const now = new Date("2031-08-07T10:00:00.000Z");
    await fillDay(costEnvelopeDay(now), 1_000);
    const application = applicationWith(roomAt(now, 1_000), { dispatch: async () => undefined });
    const accepted = await submitAs(application, `b6b:reason:${randomUUID()}`);
    expect(await new RunWaitRepository(database.pool).readWaiting(accepted.run_ref)).toMatchObject({
      waitsFor: "SITE", personRecheckAt: null, reasonAt: now
    });
  });
});
