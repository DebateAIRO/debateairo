import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient, QueryResult } from "pg";
import { AskAlreadyWaitingRefusal, AskRefusal, PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { RunRepository } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { LivenessRepository } from "@debateai/liveness";
import { ServeRepository } from "@debateai/serve";
import {
  AskAlreadyWaitingError,
  type AskRoomPort,
  type RoomDecision,
  type RoomPreview
} from "../../apps/api/src/ask-room.js";

/**
 * Budget spec §2.7 (B6b): with a room, `submit` takes the owner's lease FIRST
 * (paid-plans §2.4.2), asks the room inside it, then runs today's checks, then
 * creates the run and its hold then its first job (START) or its place in line
 * (WAIT) inside the room's locked decision, on the decision's own transaction.
 * The CI gate's half; the database half is tests/integration/b6b-ask-waiting-line.test.ts.
 */
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-09-30T18:00:20.000Z");
const MIDNIGHT = new Date("2026-10-01T00:00:00.000Z");
const TX = Object.freeze({ marker: "the decision's own transaction" }) as unknown as PoolClient;
const START: RoomDecision = Object.freeze({ kind: "START", worst: "FITS", worstScope: null });
const WAIT: RoomDecision = Object.freeze({ kind: "WAIT", waitsUntil: MIDNIGHT, worstScope: "SITE_DAY" });
const PREVIEW: RoomPreview = Object.freeze({
  admission: START, estimateMicros: 1_234, now: NOW, personUses: [],
  waitReason: Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null })
});

function stubPool(): Pool {
  const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

/** The server principal's admission pool: its session lock is the owner's lease (`withOwnerAskAdmissionLease`). */
function leasePool(order: string[]): Pool {
  const query = vi.fn(async (text: string) => {
    if (text.includes("pg_advisory_lock(")) order.push("lease");
    if (text.includes("pg_advisory_unlock(")) order.push("release");
    return { rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult;
  });
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

const ask = {
  question_line: "Should cities make public transport free at the point of use?",
  as_of: "2026-09-30T00:00:00.000Z",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "test:b6b",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "b6b unit test",
  steering_presets: [],
  steering_annotations: [],
  plan_tier: "free"
} as unknown as AskRequest;

const session: Session = {
  session_id: "33333333-3333-4333-8333-333333333333",
  asker_id: `owner:${OWNER_REF}`,
  caller_scope: "ASKER",
  ownership_provenance: "server_session",
  provisional_identity_model: false
};

type Step = "startRun" | "recordMemoryQuestion" | "enqueue" | "openStart" | "enterWait" | "dispatch";

function arrange(input: {
  readonly decision?: RoomDecision;
  readonly failAt?: Step;
  readonly precheck?: () => Promise<void>;
  readonly withoutRoom?: Partial<RunCreationSettings>;
} = {}) {
  const order: string[] = [];
  const recorded: unknown[] = [];
  const failure = new Error(`test: ${input.failAt ?? "nothing"} failed`);
  const step = (name: Step): void => {
    order.push(name);
    if (input.failAt === name) throw failure;
  };
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async () => {
    step("startRun");
    return RUN_ID;
  });
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockImplementation(async () => { step("recordMemoryQuestion"); });
  // The first job goes on the decision's own transaction, never on a connection of its own.
  const enqueueOn = vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockImplementation(async (client) => {
    if (client !== TX) throw new Error("test: the first job must be queued on the decision's transaction");
    step("enqueue");
    return WORK_ITEM_ID;
  });
  const enqueueApart = vi.spyOn(WorkItemRepository.prototype, "enqueue").mockImplementation(async () => {
    throw new Error("test: the room path may not queue a job on a transaction of its own");
  });
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockImplementation(async (record) => {
    order.push("recordSetupFailure");
    recorded.push(record);
    return true;
  });
  const holds: unknown[] = [];
  const room: AskRoomPort = {
    precheck: async () => {
      order.push("precheck");
      await input.precheck?.();
      return PREVIEW;
    },
    decide: async (_question, apply) => {
      order.push("decide");
      return apply({ admission: input.decision ?? START, estimateMicros: 1_234, now: NOW, tx: TX });
    },
    enterWait: async (tx) => {
      if (tx !== TX) throw new Error("test: the wait row must be written on the decision's transaction");
      step("enterWait");
    },
    openStart: async (tx, hold) => {
      if (tx !== TX) throw new Error("test: the hold must be written on the decision's transaction");
      holds.push(hold);
      step("openStart");
    },
    expectedStart: async () => null
  };
  const settings: RunCreationSettings = {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "b6b-unit",
    settlementWatchHandle: "b6b-unit",
    resolveDiscoveredPanel: async () => {
      order.push("panel");
      return PLAN_TIER_ROSTERS.free.map((modelId, index) => Object.freeze({
        provider_ref: `provider:free:${index + 1}`, maker: `maker:free:${index + 1}`, model_id: modelId,
        probe_evidence_ref: `probe:free:${index + 1}`, probed_at: "2026-09-30T00:00:00.000Z"
      }));
    },
    resolveEnvelopeBasis: async () => Object.freeze({}),
    resolveRisk: (askerRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier: askerRiskTier, tierSource: tierSource as never, tierProvenanceRef
    }),
    ...(input.withoutRoom === undefined ? { room } : input.withoutRoom)
  };
  const logged = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const application = new PostgresAskApplication(
    stubPool(),
    { dispatch: vi.fn(async () => { step("dispatch"); }) },
    settings,
    { read: async () => [] },
    stubPool(),
    { server: leasePool(order), legacy: stubPool() }
  );
  const submit = (request: AskRequest = ask) => application.submit(request, session, {
    kind: "server", userId: "b6b-user", ownerRef: OWNER_REF
  });
  return { submit, order, recorded, failure, holds, logged, enqueueOn, enqueueApart };
}

const recordFor = (reason: string) => ({ runId: RUN_ID, batteryRowId: "Q1", commandKey: `S00:${RUN_ID}:Q1`, reason });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("B6b an ask with a room", () => {
  it("START: takes the owner's lease FIRST, asks the room, runs today's checks, then creates, holds, queues on the decision, releases and dispatches", async () => {
    const { submit, order, recorded, holds, enqueueOn, enqueueApart } = arrange();
    await expect(submit()).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    expect(order).toEqual([
      "lease", "precheck", "panel", "decide", "startRun", "recordMemoryQuestion", "openStart", "enqueue", "release", "dispatch"
    ]);
    expect(holds).toEqual([{
      runId: RUN_ID, access: { ownerRef: OWNER_REF, legacyAskerId: null }, heldMicros: 1_234, now: NOW
    }]);
    expect(enqueueOn).toHaveBeenCalledWith(TX, { runId: RUN_ID, batteryRowId: "Q1", commandKey: `S00:${RUN_ID}:Q1`, nodeSet: [] });
    expect(enqueueApart).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
  });

  // Budget spec §2.7: "run creation happens as today". #submitWithRoom holds a
  // hand copy of today's startRun input and memory question; this pins the two
  // copies to each other, so a field changed or dropped in one alone breaks it.
  it("creates the run and its memory question from exactly what today's path uses (budget spec §2.7)", async () => {
    const hosted = arrange();
    await expect(hosted.submit()).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    const hostedRuns = vi.mocked(RunRepository.prototype.startRun).mock.calls.map(([input]) => input);
    const hostedQuestions = vi.mocked(ServeRepository.prototype.recordMemoryQuestion).mock.calls.map((call) => [...call]);
    vi.restoreAllMocks();

    // Today's path reaches `enqueue`, which this harness refuses, only after both inputs are taken.
    const today = arrange({ withoutRoom: {} });
    await today.submit().catch(() => undefined);
    const todayRuns = vi.mocked(RunRepository.prototype.startRun).mock.calls.map(([input]) => input);
    const todayQuestions = vi.mocked(ServeRepository.prototype.recordMemoryQuestion).mock.calls.map((call) => [...call]);

    expect(hostedRuns).toHaveLength(1);
    expect(hostedRuns).toEqual(todayRuns);
    expect(hostedQuestions).toEqual(todayQuestions);
  });

  it("WAIT: inside the lease, creates the run and its place in line, queues nothing, dispatches nothing, and says when", async () => {
    const { submit, order, logged, enqueueOn } = arrange({ decision: WAIT });
    await expect(submit()).resolves.toEqual({
      run_ref: RUN_ID, status: "WAITING", waits_until: "2026-10-01T00:00:00.000Z", waiting_scope: "SITE_DAY"
    });
    expect(order).toEqual(["lease", "precheck", "panel", "decide", "startRun", "recordMemoryQuestion", "enterWait", "release"]);
    expect(enqueueOn).not.toHaveBeenCalled();
    const lines = logged.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    expect(lines).toEqual([{ event: "api.ask.waiting", runId: RUN_ID, scope: "SITE_DAY" }]);
  });

  it("refuses a question that may not even wait before any vendor is probed, and creates nothing", async () => {
    const { submit, order } = arrange({
      precheck: async () => { throw new AskAlreadyWaitingError("run:waiting", MIDNIGHT); }
    });
    const refusal = await submit().then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(AskAlreadyWaitingRefusal);
    expect(refusal).toMatchObject({ code: "ASK_ALREADY_WAITING", runRef: "run:waiting", waitsUntil: MIDNIGHT });
    expect(order).toEqual(["lease", "precheck", "release"]);
  });

  it.each([
    ["recordMemoryQuestion", START, "RUN_SETUP_FAILED:MEMORY_QUESTION"],
    ["openStart", START, "RUN_SETUP_FAILED:ROOM_HOLD"],
    ["enqueue", START, "RUN_SETUP_FAILED:WORK_QUEUE"],
    ["enterWait", WAIT, "RUN_SETUP_FAILED:WAITING_LINE"],
    ["dispatch", START, "RUN_SETUP_FAILED:DISPATCH"]
  ] as const)("records the run FAILED naming %s, and rethrows the asker's error", async (failAt, decision, reason) => {
    const { submit, failure, recorded } = arrange({ failAt, decision });
    await expect(submit()).rejects.toBe(failure);
    expect(recorded).toEqual([recordFor(reason)]);
  });

  it("queues no job when the hold fails: the first job is the decision's last write", async () => {
    const { submit, failure, enqueueOn } = arrange({ failAt: "openStart" });
    await expect(submit()).rejects.toBe(failure);
    expect(enqueueOn).not.toHaveBeenCalled();
  });

  it("refuses an unknown plan tier before the room is asked", async () => {
    const { submit, order } = arrange();
    const refusal = await submit({ ...ask, plan_tier: "gold" } as unknown as AskRequest).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(AskRefusal);
    expect(refusal).toMatchObject({ code: "ASK_PLAN_TIER_INVALID" });
    expect(order).toEqual([]);
  });

  it("without a room keeps today's path: the daily guard first, and its refusal", async () => {
    const { submit, order } = arrange({
      withoutRoom: {
        assertDailyCostEnvelope: async () => {
          order.push("daily");
          throw new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "spent");
        }
      }
    });
    const refusal = await submit().then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(AskRefusal);
    expect(refusal).toMatchObject({ code: "DAILY_COST_ENVELOPE_REACHED" });
    expect(order).toEqual(["daily"]);
  });
});
