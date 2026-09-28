/**
 * A20 — the role assignment is pinned at run creation, once, and the asker is
 * told which strength ran. With no scorecard nothing is pinned and AskAccepted
 * is exactly today's two members (tests/unit/tiers-s02-wire.test.ts pins the
 * rest of the run-start boundary and stays unchanged).
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PickerOutcome, RoleAssignment, RoleSeat, Scorecard, SeatCandidate } from "@debateai/scorecard";

const picker = vi.hoisted(() => ({ outcome: null as unknown }));
/** `insertRunRoleAssignment` is a module function (P2 A6), so it is recorded through a module mock, not a spy. */
const pinning = vi.hoisted(() => ({ calls: [] as unknown[], order: [] as string[], reject: null as Error | null }));

vi.mock("@debateai/scorecard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/scorecard")>()),
  pickRoleAssignment: () => picker.outcome
}));

vi.mock("@debateai/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/db")>()),
  insertRunRoleAssignment: async (_executor: unknown, input: unknown) => {
    pinning.order.push("insertRunRoleAssignment");
    pinning.calls.push(input);
    if (pinning.reject !== null) throw pinning.reject;
  }
}));

import { PostgresAskApplication, type AskModelPickerSettings, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import type { AskRequest, Session } from "@debateai/contract";
import { RunRepository, type DiscoveredPanelMember, type StartRunInput } from "@debateai/db";
import { LivenessRepository } from "@debateai/liveness";
import { computeStructuralCeilingBasis } from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";

const CEILING_TERMS = Object.freeze({
  judgeMaxAttempts: 3,
  organMaxAttempts: 3,
  maxRecompose: 1,
  maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1,
  branchingFactor: 2,
  compositionSegmentCap: 4,
  fixedOrgansPerComposition: 6,
  reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3,
  evaluatorMaxRounds: 3,
  maxDepth: 5
});

function member(providerRef: string, maker: string, modelId: string): DiscoveredPanelMember {
  return Object.freeze({
    provider_ref: providerRef, maker, model_id: modelId,
    probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-09-26T00:00:00.000Z"
  });
}

const PANEL = Object.freeze([
  member("development:codex-premium-cli", "OpenAI", "gpt-5.6-sol"),
  member("development:claude-premium-cli", "Anthropic", "claude-opus-5"),
  member("development:agy-cli", "Google", "gemini-3.8-flash")
]);

function stubPool(): Pool {
  const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

function session(): Session {
  return {
    session_id: "33333333-3333-4333-8333-333333333333",
    asker_id: `owner:${OWNER_REF}`,
    caller_scope: "ASKER",
    ownership_provenance: "server_session",
    provisional_identity_model: false
  };
}

function ask(): AskRequest {
  return {
    question_line: "Should a small town switch its streetlights to LED lamps?",
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "asker:test",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "a20 submit test",
    as_of: "2026-09-26T00:00:00.000Z",
    steering_presets: [],
    plan_tier: "premium",
    steering_annotations: [],
    model_strength: "BEST"
  };
}

function settings(modelPicker?: AskModelPickerSettings): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "battery:a20",
    settlementWatchHandle: "watch:a20",
    resolveDiscoveredPanel: async () => PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize }) =>
      computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth) }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource, tierProvenanceRef
    }),
    ...(modelPicker === undefined ? {} : { modelPicker })
  };
}

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
      // A single-seat role's one seat is seat 0 (RoleAssignmentSchema); admission refuses to pin anything else (F19).
      ANSWER_WRITER: Object.freeze([seats[0]!]), ANSWER_CHECKER: Object.freeze([Object.freeze({ ...seats[1]!, seatIndex: 0 })])
    })
  });
  return Object.freeze({
    state: "ASSIGNED" as const, assignment, appliedStrength: "BALANCED" as const, steppedDown: true,
    estimate: Object.freeze({ mode: "LOCAL" as const, moneyMicros: null, seconds: 900 }),
    notes: Object.freeze([])
  });
}

const VALID: AskModelPickerSettings = Object.freeze({
  scorecard: Object.freeze({
    state: "VALID" as const,
    scorecard: Object.freeze({ scorecardVersion: 7 }) as unknown as Scorecard,
    sourceRef: "test:a20"
  }),
  mode: "LOCAL" as const,
  targetFacts: new Map(),
  perRunCeilingMicros: null,
  answerTokenCeilings: Object.freeze({
    POSITION: 2048, SUPPORT_ATTACK: 2048, CROSS_EXCHANGE: 2048, JUDGE: 2048, REVIEWER: 2048,
    ANSWER_WRITER: 2048, ANSWER_CHECKER: 2048
  })
});

function recordRunStart(order: string[]) {
  const started: StartRunInput[] = [];
  pinning.calls.length = 0;
  pinning.order = order;
  pinning.reject = null;
  const pinned = pinning.calls;
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async (input) => {
    order.push("startRun");
    started.push(input);
    return RUN_ID;
  });
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockImplementation(async () => {
    order.push("recordMemoryQuestion");
  });
  vi.spyOn(WorkItemRepository.prototype, "enqueue").mockImplementation(async () => {
    order.push("enqueue");
    return WORK_ITEM_ID;
  });
  return { started, pinned };
}

function application(settingsValue: RunCreationSettings, order: string[]): PostgresAskApplication {
  return new PostgresAskApplication(
    stubPool(),
    { dispatch: vi.fn(async () => { order.push("dispatch"); }) },
    settingsValue,
    { read: async () => [] },
    stubPool(),
    { server: stubPool(), legacy: stubPool() }
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("A20 · the role assignment is pinned at run creation", () => {
  it("pins it once, after the run exists and before its work is queued, and reports the applied strength", async () => {
    const outcome = assigned();
    picker.outcome = outcome;
    const order: string[] = [];
    const { started, pinned } = recordRunStart(order);
    const accepted = await application(settings(VALID), order)
      .submit(ask(), session(), { kind: "server", userId: "a20-user", ownerRef: OWNER_REF });
    expect(order).toEqual(["startRun", "insertRunRoleAssignment", "recordMemoryQuestion", "enqueue", "dispatch"]);
    expect(pinned).toEqual([{ runId: RUN_ID, assignment: { ...outcome.assignment }, strength: "BALANCED", steppedDown: true }]);
    expect(started[0]!.discoveredPanel.map((entry) => entry.provider_ref))
      .toEqual(PANEL.map((entry) => entry.provider_ref));
    expect(accepted).toEqual({
      run_ref: RUN_ID, status: "QUEUED", model_strength_applied: "BALANCED", model_strength_stepped_down: true
    });
  });

  it("pins nothing and answers exactly today's AskAccepted when no scorecard is in force", async () => {
    picker.outcome = assigned();
    const order: string[] = [];
    const { pinned } = recordRunStart(order);
    const noScorecard = settings();
    const accepted = await application({
      ...noScorecard,
      resolveDiscoveredPanel: async () => Object.freeze([
        member("development:codex-premium-cli", "OpenAI", "gpt-5.6-sol"),
        member("development:claude-premium-cli", "Anthropic", "claude-opus-5"),
        member("development:grok-cli", "xAI", "grok-4.7-build")
      ])
    }, order).submit(ask(), session(), { kind: "server", userId: "a20-user", ownerRef: OWNER_REF });
    expect(pinned).toEqual([]);
    expect(order).not.toContain("insertRunRoleAssignment");
    expect(accepted).toEqual({ run_ref: RUN_ID, status: "QUEUED" });
  });

  // Carry 16 (A20.3 review m1): a pin that fails queues nothing. A later change that caught the
  // insert and carried on would queue a scorecard-admitted run with no pin, and the runner would
  // seat it from the legacy seat book, ignoring the picked judges, reviewers and answer roles.
  it("queues nothing when the pin fails: submit rejects with the insert's error and stops there", async () => {
    picker.outcome = assigned();
    const order: string[] = [];
    recordRunStart(order);
    const failure = new Error("the pin insert was refused");
    pinning.reject = failure;
    await expect(application(settings(VALID), order)
      .submit(ask(), session(), { kind: "server", userId: "a20-user", ownerRef: OWNER_REF }))
      .rejects.toBe(failure);
    expect(order).toEqual(["startRun", "insertRunRoleAssignment"]);
  });
});
