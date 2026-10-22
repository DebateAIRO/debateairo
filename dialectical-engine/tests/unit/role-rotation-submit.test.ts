/**
 * Spec 2026-10-11 Part 4: a rotated debate's four roles are pinned beside the run
 * (core.run_role_rotation) as a run-setup step, ROLE_ROTATION, after startRun and BEFORE the
 * work is queued or the question joins the waiting line, on both submit paths (today's and
 * B6b's room, START and WAIT). A failed pin records RUN_SETUP_FAILED:ROLE_ROTATION and queues
 * nothing. A WAIT debate keeps its pin: the waker starts it without re-picking. A scorecard
 * assignment owns the roles: rotation then reads no counts, picks nothing and pins nothing.
 * Harness adapted from s1-scorecard-merge-submit.test.ts.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PickerOutcome, RoleAssignment, RoleSeat, Scorecard, SeatCandidate } from "@debateai/scorecard";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const picker = vi.hoisted(() => ({ outcome: null as unknown, rotationPicks: 0 }));
const pinning = vi.hoisted(() => ({
  order: [] as string[], reject: null as Error | null, rotations: [] as unknown[], rotationReject: null as Error | null
}));

vi.mock("@debateai/scorecard", async (importOriginal) => {
  const original = await importOriginal<typeof import("@debateai/scorecard")>();
  return {
    ...original,
    pickRoleAssignment: () => picker.outcome,
    pickRotatedRoles: (...args: Parameters<typeof original.pickRotatedRoles>) => {
      picker.rotationPicks += 1;
      return original.pickRotatedRoles(...args);
    }
  };
});

vi.mock("@debateai/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/db")>()),
  insertRunRoleAssignment: async () => {
    pinning.order.push("insertRunRoleAssignment");
    if (pinning.reject !== null) throw pinning.reject;
  },
  insertRunRoleRotation: async (_executor: unknown, input: unknown) => {
    pinning.order.push("insertRunRoleRotation");
    pinning.rotations.push(input);
    if (pinning.rotationReject !== null) throw pinning.rotationReject;
  }
}));

import { PostgresAskApplication, type AskModelPickerSettings, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import type { AskRequest, Session } from "@debateai/contract";
import { RunRepository, type DiscoveredPanelMember } from "@debateai/db";
import { LivenessRepository } from "@debateai/liveness";
import { computeStructuralCeilingBasis } from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import { pickRotatedRoles, roleRotationSeed, rotationPinFields } from "@debateai/scorecard";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { AskRoomPort, AskWaitingLinePort, RoomDecision } from "../../apps/api/src/ask-room.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-10-11T10:00:00.000Z");
const MIDNIGHT = new Date("2026-10-12T00:00:00.000Z");
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
    probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-11T00:00:00.000Z"
  });
}

/** The free plan's two roster models (PLAN_TIER_ROSTERS.free), two makers. */
const PANEL = Object.freeze([
  member("development:codex-cli", "OpenAI", "gpt-5.6-luna"),
  member("development:claude-cli", "Anthropic", "claude-sonnet-5")
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
  risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:rotation",
  composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "rotation submit test",
  as_of: "2026-10-11T00:00:00.000Z", steering_presets: [], plan_tier: "free",
  steering_annotations: []
} as unknown as AskRequest;

/** What admission picks for this ask with no earlier pins: the rule's own answer. */
const EXPECTED = pickRotatedRoles({ panel: PANEL, counts: {}, seed: roleRotationSeed(ask) })!;

function candidate(source: DiscoveredPanelMember): SeatCandidate {
  return Object.freeze({
    candidateId: `${source.model_id}@DEFAULT_ONLY`, providerRef: source.provider_ref,
    maker: source.maker, modelId: source.model_id, thinkingLevel: "DEFAULT_ONLY"
  });
}

/** A VALID scorecard's assignment over the same panel (spec "Hand-over to the scorecard"). */
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

const TOKEN_CEILINGS = Object.freeze({
  POSITION: 2048, SUPPORT_ATTACK: 2048, CROSS_EXCHANGE: 2048, JUDGE: 2048, REVIEWER: 2048,
  ANSWER_WRITER: 2048, ANSWER_CHECKER: 2048
});
/** No scorecard: admission takes the roster path, where rotation runs. */
const ABSENT: AskModelPickerSettings = Object.freeze({
  scorecard: Object.freeze({ state: "ABSENT" as const }),
  mode: "LOCAL" as const, targetFacts: new Map(), perRunCeilingMicros: null, answerTokenCeilings: TOKEN_CEILINGS
});
const VALID: AskModelPickerSettings = Object.freeze({
  scorecard: Object.freeze({
    state: "VALID" as const,
    scorecard: Object.freeze({ scorecardVersion: 7 }) as unknown as Scorecard,
    sourceRef: "test:rotation"
  }),
  mode: "LOCAL" as const, targetFacts: new Map(), perRunCeilingMicros: null, answerTokenCeilings: TOKEN_CEILINGS
});

const counts = vi.hoisted(() => ({ reads: 0 }));

function settingsWith(input: Readonly<{ rotation: boolean; picker: AskModelPickerSettings }>): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    releaseKey: TEST_RELEASE_KEY,
    batteryVersion: "battery:rotation",
    settlementWatchHandle: "watch:rotation",
    resolveDiscoveredPanel: async () => PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned }) =>
      computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef
    }),
    modelPicker: input.picker,
    ...(input.rotation ? { roleRotation: { readCounts: async () => { counts.reads += 1; return {}; } } } : {})
  };
}

/** B6b's room double: the preview and the locked decision both say `decision`; the writes land in `order`. */
function roomDouble(order: string[], decision: RoomDecision): AskRoomPort {
  return {
    precheck: async () => {
      order.push("precheck");
      return Object.freeze({
        admission: decision, estimateMicros: 1_234, now: NOW, personUses: [],
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

/** B7b's waiting line: hands the waiting run over once, and starts it (its first job queued on the start's tx). */
function lineDouble(order: string[]): AskWaitingLinePort {
  let handedOver = false;
  return {
    wakeCandidates: async () => {
      if (handedOver) return [];
      handedOver = true;
      return [Object.freeze({ runId: RUN_ID, waitingSince: NOW, ownerRef: OWNER_REF, legacyAskerId: null })] as never;
    },
    startWaiting: async (run, enqueue) => {
      order.push("startWaiting");
      return { kind: "STARTED", runId: run.runId, value: await enqueue(TX, run.runId) } as never;
    }
  };
}

function arrange(input: Readonly<{ decision?: RoomDecision | null; rotation?: boolean; picker?: AskModelPickerSettings }> = {}) {
  const order = pinning.order;
  order.length = 0;
  pinning.reject = null;
  pinning.rotations.length = 0;
  pinning.rotationReject = null;
  picker.rotationPicks = 0;
  counts.reads = 0;
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
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockImplementation(async () => {
    order.push("enqueue");
    return WORK_ITEM_ID;
  });
  vi.spyOn(WorkItemRepository.prototype, "listStalledStarts").mockResolvedValue([]);
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockImplementation(async (record) => {
    order.push("recordSetupFailure");
    recorded.push(record);
    return true;
  });
  const base = settingsWith({ rotation: input.rotation ?? true, picker: input.picker ?? ABSENT });
  const decision = input.decision ?? null;
  const application = new PostgresAskApplication(
    stubPool(),
    { dispatch: vi.fn(async () => { order.push("dispatch"); }) },
    decision === null ? base : { ...base, room: roomDouble(order, decision), waitingLine: lineDouble(order) },
    { read: async () => [] },
    stubPool(),
    { server: stubPool(), legacy: stubPool() }
  );
  const submit = () => application.submit(ask, session, { kind: "server", userId: "rotation-user", ownerRef: OWNER_REF });
  const failedReasons = () => recorded.map((record) => (record as { reason: string }).reason);
  return { order, recorded, submit, failedReasons, application };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("role rotation: the pin is a setup step before anything is queued", () => {
  it("pins the four roles with the new run's id, after the run exists and before the memory question and the queue", async () => {
    const { order, submit } = arrange();
    await expect(submit()).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    // The pin is exactly the admission's pick with the run id: no question, no seed, nothing else.
    expect(pinning.rotations).toEqual([{ runId: RUN_ID, ...rotationPinFields(EXPECTED) }]);
    expect(Object.keys(pinning.rotations[0] as object).sort()).toEqual(
      ["answerChecker", "answerWriter", "eligibleModelIds", "rule", "runId", "storyChecker", "storyteller"]);
    // Opener rotation (spec 2026-10-11 Part 2, option B): no opener field; it is the pin's first eligible entry.
    expect((pinning.rotations[0] as { eligibleModelIds: readonly string[] }).eligibleModelIds[0]).toBe(EXPECTED.opener.modelId);
    expect(order).toEqual(["startRun", "insertRunRoleRotation", "recordMemoryQuestion", "enqueue", "dispatch"]);
    expect(counts.reads).toBe(1);
    expect(picker.rotationPicks).toBe(1);
  });

  it("records the run FAILED as ROLE_ROTATION when the pin fails, and queues nothing", async () => {
    const { order, submit, failedReasons } = arrange();
    const failure = new Error("pin refused");
    pinning.rotationReject = failure;
    await expect(submit()).rejects.toBe(failure);
    expect(failedReasons()).toEqual(["RUN_SETUP_FAILED:ROLE_ROTATION"]);
    expect(order).toEqual(["startRun", "insertRunRoleRotation", "recordSetupFailure"]);
  });

  it("without the setting nothing is read, picked or pinned (today's order exactly)", async () => {
    const { order, submit } = arrange({ rotation: false });
    await expect(submit()).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    expect(order).toEqual(["startRun", "recordMemoryQuestion", "enqueue", "dispatch"]);
    expect(counts.reads).toBe(0);
    expect(picker.rotationPicks).toBe(0);
  });
});

describe("role rotation with a room (B6b): START and WAIT alike pin before the hold or the place in line", () => {
  it("START: pins right after the run exists, before the memory question, the hold and the queue", async () => {
    const { order, submit } = arrange({ decision: START });
    await expect(submit()).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    expect(pinning.rotations).toEqual([{ runId: RUN_ID, ...rotationPinFields(EXPECTED) }]);
    expect(order).toEqual([
      "precheck", "decide", "startRun", "insertRunRoleRotation", "recordMemoryQuestion", "openStart", "enqueue", "dispatch"
    ]);
  });

  it("WAIT: pins before the place in line; the waker later starts it on that pin and never picks again", async () => {
    const { order, submit, application } = arrange({ decision: WAIT });
    await expect(submit()).resolves.toMatchObject({ run_ref: RUN_ID, status: "WAITING" });
    expect(pinning.rotations).toEqual([{ runId: RUN_ID, ...rotationPinFields(EXPECTED) }]);
    expect(order).toEqual(["precheck", "decide", "startRun", "insertRunRoleRotation", "recordMemoryQuestion", "enterWait"]);
    const picksAtSubmit = picker.rotationPicks;
    const readsAtSubmit = counts.reads;
    order.length = 0;
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0 });
    expect(order).toEqual(["startWaiting", "enqueue", "dispatch"]);
    expect(picker.rotationPicks).toBe(picksAtSubmit);
    expect(counts.reads).toBe(readsAtSubmit);
    expect(pinning.rotations).toHaveLength(1);
  });

  it.each([START, WAIT])("records the run FAILED as ROLE_ROTATION when the pin fails (%o), and holds or lines up nothing", async (decision) => {
    const { order, submit, failedReasons } = arrange({ decision });
    const failure = new Error("pin refused");
    pinning.rotationReject = failure;
    await expect(submit()).rejects.toBe(failure);
    expect(order).toEqual(["precheck", "decide", "startRun", "insertRunRoleRotation", "recordSetupFailure"]);
    expect(failedReasons()).toEqual(["RUN_SETUP_FAILED:ROLE_ROTATION"]);
  });
});

describe("hand-over to the scorecard: a scorecard assignment owns the roles", () => {
  it.each([null, START, WAIT])("with the setting ON and a VALID scorecard (room %o): no counts read, no pick, no rotation pin", async (decision) => {
    picker.outcome = assigned();
    const { order, submit } = arrange({ decision, picker: VALID });
    await expect(submit()).resolves.toMatchObject({ run_ref: RUN_ID, model_strength_applied: "BALANCED" });
    expect(order).toContain("insertRunRoleAssignment");
    expect(order).not.toContain("insertRunRoleRotation");
    expect(pinning.rotations).toEqual([]);
    expect(counts.reads).toBe(0);
    expect(picker.rotationPicks).toBe(0);
  });
});
