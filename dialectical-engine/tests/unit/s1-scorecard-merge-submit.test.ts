/**
 * S1a — dev's rule (PR #33) that a run whose setup fails after it exists is recorded
 * FAILED, extended to the scorecard's pin: the assignment is the FIRST setup step, so
 * a pin that fails names MODEL_ASSIGNMENT and nothing is queued. The same holds on
 * the hosted path with a room (B6b's `#submitWithRoom`), for START and for WAIT.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PickerOutcome, RoleAssignment, RoleSeat, Scorecard, SeatCandidate } from "@debateai/scorecard";

const picker = vi.hoisted(() => ({ outcome: null as unknown }));
const pinning = vi.hoisted(() => ({ order: [] as string[], reject: null as Error | null }));

vi.mock("@debateai/scorecard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/scorecard")>()),
  pickRoleAssignment: () => picker.outcome
}));

vi.mock("@debateai/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/db")>()),
  insertRunRoleAssignment: async () => {
    pinning.order.push("insertRunRoleAssignment");
    if (pinning.reject !== null) throw pinning.reject;
  }
}));

import { PostgresAskApplication, type AskModelPickerSettings, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import type { AskRequest, Session } from "@debateai/contract";
import { RunRepository, type DiscoveredPanelMember } from "@debateai/db";
import { LivenessRepository } from "@debateai/liveness";
import { computeStructuralCeilingBasis } from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { AskRoomPort, RoomDecision } from "../../apps/api/src/ask-room.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-10-01T10:00:00.000Z");
const MIDNIGHT = new Date("2026-10-02T00:00:00.000Z");
const TX = Object.freeze({ marker: "the room decision's own transaction" }) as unknown as PoolClient;
const START: RoomDecision = Object.freeze({ kind: "START", worst: "FITS", worstScope: null });
const WAIT: RoomDecision = Object.freeze({ kind: "WAIT", waitsUntil: MIDNIGHT, worstScope: "SITE_DAY" });
const CEILING_TERMS = Object.freeze({
  judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1, finalRetryAttempts: 1,
  branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5
});

function member(providerRef: string, maker: string, modelId: string): DiscoveredPanelMember {
  return Object.freeze({
    provider_ref: providerRef, maker, model_id: modelId,
    probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-01T00:00:00.000Z"
  });
}

const PANEL = Object.freeze([
  member("provider:s1a:openai", "OpenAI", "gpt-5.6-sol"),
  member("provider:s1a:anthropic", "Anthropic", "claude-opus-5"),
  member("provider:s1a:google", "Google", "gemini-3.8-flash")
]);

function stubPool(): Pool {
  const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

const session: Session = {
  session_id: "33333333-3333-4333-8333-333333333333",
  asker_id: `owner:${OWNER_REF}`,
  caller_scope: "ASKER",
  ownership_provenance: "server_session",
  provisional_identity_model: false
};

const ask = {
  question_line: "Should a small town switch its streetlights to LED lamps?",
  risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:s1a",
  composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "s1a submit test",
  as_of: "2026-10-01T00:00:00.000Z", steering_presets: [], plan_tier: "premium",
  steering_annotations: [], model_strength: "BEST"
} as unknown as AskRequest;

function candidate(source: DiscoveredPanelMember): SeatCandidate {
  return Object.freeze({
    candidateId: `${source.model_id}@DEFAULT_ONLY`, providerRef: source.provider_ref,
    maker: source.maker, modelId: source.model_id, thinkingLevel: "DEFAULT_ONLY"
  });
}

function assigned(): Extract<PickerOutcome, { state: "ASSIGNED" }> {
  const seats: readonly RoleSeat[] = Object.freeze(PANEL.map((entry, seatIndex) => Object.freeze({
    seatIndex, main: candidate(entry), runnerUp: null, diversityShare: 0, source: "SCORECARD" as const
  })));
  const assignment: RoleAssignment = Object.freeze({
    scorecardVersion: 7,
    strength: "BALANCED",
    roles: Object.freeze({
      POSITION: seats, SUPPORT_ATTACK: seats, CROSS_EXCHANGE: seats, JUDGE: seats, REVIEWER: seats,
      ANSWER_WRITER: Object.freeze([seats[0]!]),
      ANSWER_CHECKER: Object.freeze([Object.freeze({ ...seats[1]!, seatIndex: 0 })])
    })
  });
  return Object.freeze({
    state: "ASSIGNED" as const, assignment, appliedStrength: "BALANCED" as const, steppedDown: false,
    estimate: Object.freeze({ mode: "LOCAL" as const, moneyMicros: null, seconds: 900 }),
    notes: Object.freeze([])
  });
}

const VALID: AskModelPickerSettings = Object.freeze({
  scorecard: Object.freeze({
    state: "VALID" as const,
    scorecard: Object.freeze({ scorecardVersion: 7 }) as unknown as Scorecard,
    sourceRef: "test:s1a"
  }),
  mode: "LOCAL" as const,
  targetFacts: new Map(),
  perRunCeilingMicros: null,
  answerTokenCeilings: Object.freeze({
    POSITION: 2048, SUPPORT_ATTACK: 2048, CROSS_EXCHANGE: 2048, JUDGE: 2048, REVIEWER: 2048,
    ANSWER_WRITER: 2048, ANSWER_CHECKER: 2048
  })
});

const settings: RunCreationSettings = {
  strangerSampleRate: 0,
  registerVersion: 1,
  batteryVersion: "battery:s1a",
  settlementWatchHandle: "watch:s1a",
  resolveDiscoveredPanel: async () => PANEL,
  resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned }) =>
    computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned }),
  resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
    effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef
  }),
  modelPicker: VALID
};

/** B6b's room double: the preview and the locked decision both say `decision`; the writes land in `order`. */
function roomDouble(order: string[], decision: RoomDecision): AskRoomPort {
  return {
    precheck: async () => {
      order.push("precheck");
      return Object.freeze({
        admission: decision, estimateMicros: 1_234, now: NOW, personUses: [],
        // B6a's wait reason: this double measures no person window, so any wait is the site's.
        waitReason: Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null })
      });
    },
    decide: async (_question, apply) => {
      order.push("decide");
      return apply({ admission: decision, estimateMicros: 1_234, now: NOW, tx: TX });
    },
    enterWait: async () => { order.push("enterWait"); },
    openStart: async () => { order.push("openStart"); },
    expectedStart: async () => null
  };
}

function arrange(decision: RoomDecision | null = null) {
  const order = pinning.order;
  order.length = 0;
  pinning.reject = null;
  const recorded: unknown[] = [];
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async () => {
    order.push("startRun");
    return RUN_ID;
  });
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockImplementation(async () => {
    order.push("recordMemoryQuestion");
  });
  vi.spyOn(WorkItemRepository.prototype, "enqueue").mockImplementation(async () => {
    order.push("enqueue");
    return WORK_ITEM_ID;
  });
  // B6b queues the first job on the room decision's own transaction, as its LAST write.
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockImplementation(async () => {
    order.push("enqueue");
    return WORK_ITEM_ID;
  });
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockImplementation(async (record) => {
    order.push("recordSetupFailure");
    recorded.push(record);
    return true;
  });
  const application = new PostgresAskApplication(
    stubPool(),
    { dispatch: vi.fn(async () => { order.push("dispatch"); }) },
    decision === null ? settings : { ...settings, room: roomDouble(order, decision) },
    { read: async () => [] },
    stubPool(),
    { server: stubPool(), legacy: stubPool() }
  );
  const submit = () => application.submit(ask, session, { kind: "server", userId: "s1a-user", ownerRef: OWNER_REF });
  return { order, recorded, submit };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("S1a · on the hosted path with a room (B6b), the pin is the first setup step too", () => {
  it("START: pins right after the run exists, before the memory question, the hold and the queue", async () => {
    picker.outcome = assigned();
    const { order, submit } = arrange(START);
    await expect(submit()).resolves.toEqual({
      run_ref: RUN_ID, status: "QUEUED", model_strength_applied: "BALANCED", model_strength_stepped_down: false
    });
    expect(order).toEqual([
      "precheck", "decide", "startRun", "insertRunRoleAssignment", "recordMemoryQuestion", "openStart", "enqueue", "dispatch"
    ]);
  });

  it("WAIT: pins before the place in line, and the 202 answer names the strength", async () => {
    picker.outcome = assigned();
    const { order, submit } = arrange(WAIT);
    await expect(submit()).resolves.toEqual({
      run_ref: RUN_ID, status: "WAITING", waits_until: MIDNIGHT.toISOString(), waiting_scope: "SITE_DAY",
      model_strength_applied: "BALANCED", model_strength_stepped_down: false
    });
    expect(order).toEqual(["precheck", "decide", "startRun", "insertRunRoleAssignment", "recordMemoryQuestion", "enterWait"]);
  });

  it.each([START, WAIT])("records the run FAILED as MODEL_ASSIGNMENT when the pin fails (%o), and holds or lines up nothing", async (decision) => {
    picker.outcome = assigned();
    const { order, recorded, submit } = arrange(decision);
    const failure = new Error("the pin insert was refused");
    pinning.reject = failure;
    await expect(submit()).rejects.toBe(failure);
    expect(order).toEqual(["precheck", "decide", "startRun", "insertRunRoleAssignment", "recordSetupFailure"]);
    expect(recorded).toEqual([{
      runId: RUN_ID, batteryRowId: "Q1", commandKey: `S00:${RUN_ID}:Q1`, reason: "RUN_SETUP_FAILED:MODEL_ASSIGNMENT"
    }]);
  });
});

describe("S1a · the pinned assignment is the first run-setup step", () => {
  it("pins before the memory question, the queue and the dispatch", async () => {
    picker.outcome = assigned();
    const { order, submit } = arrange();
    await expect(submit()).resolves.toMatchObject({ run_ref: RUN_ID, status: "QUEUED", model_strength_applied: "BALANCED" });
    expect(order).toEqual(["startRun", "insertRunRoleAssignment", "recordMemoryQuestion", "enqueue", "dispatch"]);
  });

  it("records the run FAILED as MODEL_ASSIGNMENT when the pin fails, and queues nothing", async () => {
    picker.outcome = assigned();
    const { order, recorded, submit } = arrange();
    const failure = new Error("the pin insert was refused");
    pinning.reject = failure;
    await expect(submit()).rejects.toBe(failure);
    expect(order).toEqual(["startRun", "insertRunRoleAssignment", "recordSetupFailure"]);
    expect(recorded).toEqual([{
      runId: RUN_ID, batteryRowId: "Q1", commandKey: `S00:${RUN_ID}:Q1`, reason: "RUN_SETUP_FAILED:MODEL_ASSIGNMENT"
    }]);
  });
});
