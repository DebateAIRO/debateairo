import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AskRefusal,
  PostgresAskApplication,
  askRefusalStatus,
  buildApi,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { AskAcceptedSchema, PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { RunCostSubstitutionRepository, RunRepository } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { LivenessRepository } from "@debateai/liveness";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, planById, type PlanId } from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";
import { decideCoarseFit, decideRoomSettings, normaliseAskForPlan, type AskBilling } from "../../apps/api/src/ask-billing.js";
import type { AskRoomPort, AskRoomReader, RoomDecision, RoomQuestion } from "../../apps/api/src/ask-room.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * PAID PLANS (spec 2026-09-29 §2.3.4, §2.6 item 7; R1 A5; ruling R-28). With
 * billing on (hosted AND billingPolicy.enabled), the SERVER decides the ask's
 * plan tier: the client's `plan_tier` is ignored, Free's gauges are the sealed
 * fixed ones, and a request without a signed-in owner is refused. B6b's room
 * and B7a's room read see the decided settings. Local mode keeps today's ask
 * byte for byte.
 */
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);

function ask(overrides: Partial<AskRequest> = {}): AskRequest {
  return {
    question_line: "Should cities make public transport free at the point of use?",
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "asker:test",
    composition_budget_tier: "medium",
    depth_params: { depth: 3 },
    decision_scope: "b8 unit test",
    as_of: "2026-09-29T00:00:00.000Z",
    steering_presets: [],
    plan_tier: "premium",
    steering_annotations: [],
    ...overrides
  };
}

const serverSession: Session = {
  session_id: "33333333-3333-4333-8333-333333333333",
  asker_id: `owner:${OWNER_REF}`,
  caller_scope: "ASKER",
  ownership_provenance: "server_session",
  provisional_identity_model: false
};
const serverPrincipal = { kind: "server" as const, userId: "66666666-6666-4666-8666-666666666666", ownerRef: OWNER_REF };

function stubPool(): Pool {
  const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

const member = (modelId: string, index: number) => Object.freeze({
  provider_ref: `provider:${index}`, maker: `maker:${index}`, model_id: modelId,
  probe_evidence_ref: `probe:${index}`, probed_at: "2026-09-29T00:00:00.000Z"
});

/**
 * Without `room`, B6b's members are absent, which is local mode's path (and a
 * hosted register without the band): only B8's `billing` is exercised. With
 * `room`, `submit` takes B6b's room branch. `panel` is the models the provider
 * probe finds: both rosters unless a case takes one away.
 */
function settingsWith(
  billing: AskBilling | undefined,
  room?: AskRoomPort,
  panel: readonly string[] = [...PLAN_TIER_ROSTERS.free, ...PLAN_TIER_ROSTERS.premium],
  profile?: {hasPhone(ownerRef:string):Promise<boolean>}
): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "b8-unit",
    settlementWatchHandle: "b8-unit",
    resolveDiscoveredPanel: async () => panel.map(member),
    resolveEnvelopeBasis: async () => Object.freeze({}),
    resolveRisk: (askerRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier: askerRiskTier, tierSource: tierSource as never, tierProvenanceRef
    }),
    ...(billing === undefined ? {} : { billing }),
    ...(profile === undefined ? {} : {accountProfile:profile}),
    ...(room === undefined ? {} : { room })
  };
}

const NOW = new Date("2026-09-29T12:00:00.000Z");
const START: RoomDecision = Object.freeze({ kind: "START", worst: "FITS", worstScope: null });
/** The site's day is FULL: the question waits for its UTC midnight. */
const SITE_MIDNIGHT = new Date("2026-09-30T00:00:00.000Z");
const WAIT_SITE_DAY: RoomDecision = Object.freeze({ kind: "WAIT", waitsUntil: SITE_MIDNIGHT, worstScope: "SITE_DAY" });
/** The room decision's own transaction, as `decide` hands it to its callback. */
const ROOM_TX = Object.freeze({ query: vi.fn() }) as unknown as PoolClient;

/** A stub of B6b's room that answers every question with `admission` (START unless a case says WAIT) and records what it was asked. */
function recordingRoom(admission: RoomDecision = START) {
  const questions: RoomQuestion[] = [];
  const room: AskRoomPort = {
    // B6a's precheck answers a RoomPreview; B6b does not read it (it is S2's input).
    // `waitReason` is B6a's required member; the stub gives the site's reason, as B6b's PREVIEW does.
    precheck: async (question) => {
      questions.push(question);
      return {
        admission, estimateMicros: 1_000, now: NOW, personUses: [],
        waitReason: Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null })
      };
    },
    decide: async (question, apply) => {
      questions.push(question);
      return apply({ admission, estimateMicros: 1_000, now: NOW, tx: ROOM_TX });
    },
    enterWait: async () => undefined,
    openStart: async () => undefined,
    expectedStart: async () => null
  };
  return { room, questions };
}

function billingFor(planId: PlanId, day: Readonly<{ spent: number; limit: number }> | null = null, estimate = 300_000) {
  const current = vi.fn(async () => ({ planId, eventId: EVENT_ID }));
  const estimateMicros = vi.fn(async () => estimate);
  const billing: AskBilling = Object.freeze({
    plans,
    entitlements: { current },
    coarseFit: Object.freeze({
      personAllowance: {
        read: async () => day === null ? [] : [{
          scope: "PERSON_DAY" as const, limitMicros: day.limit,
          periodStart: new Date("2026-09-29T00:00:00.000Z"), resetsAt: new Date("2026-09-30T00:00:00.000Z"),
          finishBasisPoints: 11_000, closeBasisPoints: 9_500
        }]
      },
      spend: {
        readOwnerSpentMicros: async () => day?.spent ?? 0,
        readOwnerCountedHoldsMicros: async () => 0
      },
      estimator: { estimateMicros }
    }),
    clock: () => NOW
  });
  return { billing, current, estimateMicros };
}

function arrange(billing: AskBilling | undefined, room?: AskRoomPort, panel?: readonly string[], profile?: {hasPhone(ownerRef:string):Promise<boolean>}) {
  const started: Array<Parameters<RunRepository["startRun"]>[0]> = [];
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async (input) => {
    started.push(input);
    return RUN_ID;
  });
  const memory = vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockResolvedValue(undefined);
  const enqueued = vi.spyOn(WorkItemRepository.prototype, "enqueue").mockResolvedValue(WORK_ITEM_ID);
  // B6b's room path queues the first job on the decision's own transaction
  // (`enqueueOn(tx, …)`, last). Unstubbed, a START would reach the real
  // `allocateSequence` on ROOM_TX, whose `query` answers nothing, and throw.
  const enqueuedOnRoom = vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockResolvedValue(WORK_ITEM_ID);
  const setupFailures = vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockResolvedValue(true);
  const substitutions = vi.spyOn(RunCostSubstitutionRepository.prototype, "record").mockResolvedValue("substitution:b8");
  const application = new PostgresAskApplication(
    stubPool(), { dispatch: vi.fn(async () => undefined) }, settingsWith(billing, room, panel, profile),
    { read: async () => [] }, stubPool(), { server: stubPool(), legacy: stubPool() }
  );
  return { application, started, substitutions, memory, enqueued, enqueuedOnRoom, setupFailures };
}

const setupFailureFor = (reason: string) => ({ runId: RUN_ID, batteryRowId: "Q1", commandKey: `S00:${RUN_ID}:Q1`, reason });

const freeClass = Object.freeze({
  planTier: "free", compositionBudgetTier: "low", makerCount: PLAN_TIER_ROSTERS.free.length, depth: 2
});

/** An application for the HTTP cases: every read answers nothing, and `submit` is the case's own. */
function fixtureApplication(
  submit: AskApplication["submit"] = async () => ({ run_ref: RUN_ID, status: "QUEUED" as const })
): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit,
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normaliseAskForPlan: Free's gauges are the server's (§2.3.4)", () => {
  it("normalises every Free gauge the client sent, and says so", () => {
    const result = normaliseAskForPlan(ask({
      plan_tier: "premium", risk_tier: "high-stakes", composition_budget_tier: "high", depth_params: { depth: 5 }
    }), planById(plans, "FREE"));
    expect(result.normalised).toBe(true);
    expect(result.ask).toMatchObject({
      plan_tier: "free", risk_tier: "standard", tier_source: "MACHINE_DEFAULT",
      tier_provenance_ref: "machine:plan-tier-free", composition_budget_tier: "low", depth_params: { depth: 2 }
    });
  });

  it("changes nothing for a Free ask that already carries the defaults", () => {
    const sent = ask({
      plan_tier: "free", risk_tier: "standard", tier_source: "MACHINE_DEFAULT", tier_provenance_ref: "machine:plan-tier-free",
      composition_budget_tier: "low", depth_params: { depth: 2 }
    });
    expect(normaliseAskForPlan(sent, planById(plans, "FREE"))).toEqual({ ask: sent, normalised: false });
  });

  it("gives a paid plan premium whatever the client chose, keeps its gauges, and says it raised the tier", () => {
    const result = normaliseAskForPlan(ask({ plan_tier: "free", risk_tier: "casual", depth_params: { depth: 1 } }), planById(plans, "PLUS"));
    expect(result.ask).toMatchObject({ plan_tier: "premium", risk_tier: "casual", depth_params: { depth: 1 } });
    // Final review Part 1b, Minor 4: raising free to premium IS a change, so the flag reports it.
    expect(result.normalised).toBe(true);
  });

  it("changes nothing, and says so, for a paid plan's ask that is already premium", () => {
    const sent = ask({ plan_tier: "premium", risk_tier: "high-stakes", composition_budget_tier: "high", depth_params: { depth: 5 } });
    for (const planId of ["PLUS", "PRO", "MAX"] as const) {
      expect(normaliseAskForPlan(sent, planById(plans, planId))).toEqual({ ask: sent, normalised: false });
    }
  });
});

describe("decideCoarseFit: cheaper models only when that helps (§2.6 item 7, A5)", () => {
  const window = (usedMicros: number, limitMicros: number) => ({ usedMicros, limitMicros });
  it.each([
    ["a Free ask is already the cheapest", "free", 300_000, [window(900_000, 1_000_000)], "AS_ASKED"],
    ["no person window", "premium", 300_000, [], "AS_ASKED"],
    ["the estimate fits every window", "premium", 100_000, [window(900_000, 1_000_000)], "AS_ASKED"],
    ["an exact fit still fits", "premium", 100_000, [window(900_000, 1_000_000), window(0, 5_000_000)], "AS_ASKED"],
    ["a FULL window waits instead (B6b)", "premium", 300_000, [window(1_000_000, 1_000_000)], "AS_ASKED"],
    ["the estimate does not fit and nothing is full", "premium", 300_000, [window(900_000, 1_000_000)], "FREE_ROSTER"],
    ["one of several windows does not fit", "premium", 300_000, [window(0, 5_000_000), window(2_400_000, 2_500_000)], "FREE_ROSTER"]
  ] as const)("%s", (_name, planTier, estimateMicros, windows, expected) => {
    expect(decideCoarseFit({ planTier, estimateMicros, windows })).toBe(expected);
  });
});

describe("submit with billing on", () => {
  it("runs a Free person's premium ask on Free's roster with Free's gauges, and reports them", async () => {
    const { billing, current } = billingFor("FREE");
    const { application, started, substitutions } = arrange(billing);
    const accepted = await application.submit(ask({
      plan_tier: "premium", risk_tier: "high-stakes", composition_budget_tier: "high", depth_params: { depth: 5 }
    }), serverSession, serverPrincipal);
    expect(current).toHaveBeenCalledWith(OWNER_REF, new Date("2026-09-29T12:00:00.000Z"));
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      planTier: "free", askerRiskTier: "standard", tierSource: "MACHINE_DEFAULT",
      tierProvenanceRef: "machine:plan-tier-free", compositionBudgetTier: "low", depthParams: { depth: 2 }
    });
    expect(started[0]!.discoveredPanel.map((panelMember) => panelMember.model_id)).toEqual([...PLAN_TIER_ROSTERS.free]);
    expect(AskAcceptedSchema.parse(accepted).applied).toEqual({
      plan_tier: "free", risk_tier: "standard", composition_budget_tier: "low", depth: 2
    });
    expect(substitutions).not.toHaveBeenCalled();
  });

  it("runs a paid person's ask on the premium roster even when the client chose Free", async () => {
    const { billing } = billingFor("PLUS", { spent: 100_000, limit: 1_000_000 });
    const { application, started, substitutions } = arrange(billing);
    const accepted = await application.submit(ask({ plan_tier: "free" }), serverSession, serverPrincipal);
    expect(started[0]).toMatchObject({ planTier: "premium", compositionBudgetTier: "medium", depthParams: { depth: 3 } });
    expect(started[0]!.discoveredPanel.map((panelMember) => panelMember.model_id)).toEqual([...PLAN_TIER_ROSTERS.premium]);
    expect(AskAcceptedSchema.parse(accepted).applied?.plan_tier).toBe("premium");
    expect(substitutions).not.toHaveBeenCalled();
  });

  it("moves a paid ask that does not fit the person's room to the Free roster, owner-side only", async () => {
    const { billing, estimateMicros } = billingFor("PLUS", { spent: 900_000, limit: 1_000_000 }, 300_000);
    const { application, started, substitutions } = arrange(billing);
    const accepted = await application.submit(ask(), serverSession, serverPrincipal);
    expect(estimateMicros).toHaveBeenCalledWith({
      planTier: "premium", compositionBudgetTier: "medium", makerCount: PLAN_TIER_ROSTERS.premium.length, depth: 3
    });
    expect(started[0]).toMatchObject({ planTier: "free", compositionBudgetTier: "medium", depthParams: { depth: 3 } });
    expect(started[0]!.discoveredPanel.map((panelMember) => panelMember.model_id)).toEqual([...PLAN_TIER_ROSTERS.free]);
    expect(substitutions).toHaveBeenCalledWith({
      runId: RUN_ID, callSiteKey: "ASK:roster", plannedProviderRef: "roster:premium",
      usedProviderRef: "roster:free", reason: "PERSON", recordedAt: NOW
    });
    // The person is never told about a swap (owner decision, budget spec §1.6).
    expect(AskAcceptedSchema.parse(accepted).applied?.plan_tier).toBe("premium");
  });

  it("never starts a swapped run without its owner record: a failed record fails the run before its first job", async () => {
    const { billing } = billingFor("PLUS", { spent: 900_000, limit: 1_000_000 }, 300_000);
    const { application, substitutions, memory, enqueued, setupFailures } = arrange(billing);
    const failure = new Error("test: the substitution record failed");
    substitutions.mockRejectedValue(failure);
    await expect(application.submit(ask(), serverSession, serverPrincipal)).rejects.toBe(failure);
    expect(setupFailures).toHaveBeenCalledWith(setupFailureFor("RUN_SETUP_FAILED:COST_RECORD"));
    expect(memory).not.toHaveBeenCalled();
    expect(enqueued).not.toHaveBeenCalled();
  });

  it("never swaps when a window is FULL: that question waits in B6b's line", async () => {
    const { billing } = billingFor("PLUS", { spent: 1_000_000, limit: 1_000_000 });
    const { application, started, substitutions } = arrange(billing);
    await application.submit(ask(), serverSession, serverPrincipal);
    expect(started[0]).toMatchObject({ planTier: "premium" });
    expect(substitutions).not.toHaveBeenCalled();
  });

  it("refuses a request without a signed-in owner before reading anything (ASK_SIGN_IN_REQUIRED)", async () => {
    const { billing, current } = billingFor("PLUS");
    const { application, started } = arrange(billing);
    const legacySession = { ...serverSession, asker_id: "legacy:b8", ownership_provenance: "legacy_bearer" } as unknown as Session;
    await expect(application.submit(ask(), legacySession, { kind: "legacy", legacyAskerId: "legacy:b8" }))
      .rejects.toMatchObject({ name: "AskRefusal", code: "ASK_SIGN_IN_REQUIRED" });
    expect(current).not.toHaveBeenCalled();
    expect(started).toHaveLength(0);
  });
});

describe("submit through B6b's room hands it the decided ask (R-28)", () => {
  it("gives the room's precheck and locked decision the plan's settings class, not the client's", async () => {
    const { billing } = billingFor("FREE");
    const { room, questions } = recordingRoom();
    const { application, started, substitutions, enqueued, enqueuedOnRoom } = arrange(billing, room);
    const accepted = await application.submit(ask({
      plan_tier: "premium", risk_tier: "high-stakes", composition_budget_tier: "high", depth_params: { depth: 5 }
    }), serverSession, serverPrincipal);
    // The START queued its first job on the decision's transaction, never through the pool.
    expect(enqueuedOnRoom).toHaveBeenCalledWith(ROOM_TX, {
      runId: RUN_ID, batteryRowId: "Q1", commandKey: `S00:${RUN_ID}:Q1`, nodeSet: []
    });
    expect(enqueued).not.toHaveBeenCalled();
    expect(questions.map((question) => question.settingsClass)).toEqual([freeClass, freeClass]);
    expect(questions[0]!.access).toEqual({ ownerRef: OWNER_REF, legacyAskerId: null });
    expect(started[0]).toMatchObject({ planTier: "free", compositionBudgetTier: "low", depthParams: { depth: 2 } });
    expect(AskAcceptedSchema.parse(accepted)).toEqual({
      run_ref: RUN_ID, status: "QUEUED",
      applied: { plan_tier: "free", risk_tier: "standard", composition_budget_tier: "low", depth: 2 }
    });
    expect(substitutions).not.toHaveBeenCalled();
  });

  it("records the interim swap in the room decision's own transaction, and the room sees the Free roster's class", async () => {
    const { billing } = billingFor("PLUS", { spent: 900_000, limit: 1_000_000 }, 300_000);
    const { room, questions } = recordingRoom();
    const { application, started, substitutions } = arrange(billing, room);
    const accepted = await application.submit(ask(), serverSession, serverPrincipal);
    expect(questions[0]!.settingsClass).toEqual({
      planTier: "free", compositionBudgetTier: "medium", makerCount: PLAN_TIER_ROSTERS.free.length, depth: 3
    });
    expect(started[0]).toMatchObject({ planTier: "free" });
    // Written with `tx`: it commits with the run's hold, or not at all.
    expect(substitutions).toHaveBeenCalledWith({
      runId: RUN_ID, callSiteKey: "ASK:roster", plannedProviderRef: "roster:premium",
      usedProviderRef: "roster:free", reason: "PERSON", recordedAt: NOW
    }, ROOM_TX);
    expect(AskAcceptedSchema.parse(accepted).applied?.plan_tier).toBe("premium");
  });

  it("fails the run inside the room's decision when the record cannot be written, and queues nothing", async () => {
    const { billing } = billingFor("PLUS", { spent: 900_000, limit: 1_000_000 }, 300_000);
    const { room } = recordingRoom();
    const { application, substitutions, memory, enqueued, enqueuedOnRoom, setupFailures } = arrange(billing, room);
    const failure = new Error("test: the substitution record failed");
    substitutions.mockRejectedValue(failure);
    await expect(application.submit(ask(), serverSession, serverPrincipal)).rejects.toBe(failure);
    expect(setupFailures).toHaveBeenCalledWith(setupFailureFor("RUN_SETUP_FAILED:COST_RECORD"));
    expect(memory).not.toHaveBeenCalled();
    // On the room path the first job would be queued with `enqueueOn(tx, …)`: neither form ran.
    expect(enqueuedOnRoom).not.toHaveBeenCalled();
    expect(enqueued).not.toHaveBeenCalled();
  });

  it("keeps a swapped question on its plan's roster and settings when the room makes it WAIT, and records no swap", async () => {
    // A PLUS owner whose own day does not fit the premium estimate (0.90 of 1.00
    // USD used, 0.30 estimated), while the SITE's day is FULL. The coarse fit
    // chose the Free roster, but only a START runs on it (A5, §2.3.4). Stored as
    // a "free" run, B7b's PLAN_CHANGED guard would miss it, and an owner who
    // dropped to Free before the reset would wake with a paid plan's settings.
    const { billing } = billingFor("PLUS", { spent: 900_000, limit: 1_000_000 }, 300_000);
    const { room } = recordingRoom(WAIT_SITE_DAY);
    const { application, started, substitutions, enqueued, enqueuedOnRoom } = arrange(billing, room);
    const accepted = AskAcceptedSchema.parse(await application.submit(ask(), serverSession, serverPrincipal));
    expect(accepted).toMatchObject({
      run_ref: RUN_ID, status: "WAITING", waits_until: SITE_MIDNIGHT.toISOString(), waiting_scope: "SITE_DAY"
    });
    expect(accepted.applied?.plan_tier).toBe("premium");
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      planTier: "premium", askerRiskTier: "casual", compositionBudgetTier: "medium", depthParams: { depth: 3 }
    });
    expect(started[0]!.discoveredPanel.map((panelMember) => panelMember.model_id)).toEqual([...PLAN_TIER_ROSTERS.premium]);
    expect(substitutions).not.toHaveBeenCalled();
    // A waiting run queues no job until the waker starts it.
    expect(enqueuedOnRoom).not.toHaveBeenCalled();
    expect(enqueued).not.toHaveBeenCalled();
  });

  it("refuses a swapped question that must WAIT when its plan's own roster is unavailable, before any run exists", async () => {
    const { billing } = billingFor("PLUS", { spent: 900_000, limit: 1_000_000 }, 300_000);
    const { room } = recordingRoom(WAIT_SITE_DAY);
    const { application, started, substitutions, setupFailures } = arrange(billing, room, PLAN_TIER_ROSTERS.free);
    await expect(application.submit(ask(), serverSession, serverPrincipal))
      .rejects.toMatchObject({ name: "AskRefusal", code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE" });
    expect(started).toHaveLength(0);
    expect(substitutions).not.toHaveBeenCalled();
    expect(setupFailures).not.toHaveBeenCalled();
  });

  it("still STARTs a swapped question on the Free roster when only the plan's own roster is unavailable", async () => {
    // The plan's own admission is taken beside the swapped one, and its refusal is
    // kept as a value: it matters only when the locked decision says WAIT.
    const { billing } = billingFor("PLUS", { spent: 900_000, limit: 1_000_000 }, 300_000);
    const { room } = recordingRoom();
    const { application, started, substitutions } = arrange(billing, room, PLAN_TIER_ROSTERS.free);
    const accepted = AskAcceptedSchema.parse(await application.submit(ask(), serverSession, serverPrincipal));
    expect(accepted).toMatchObject({ run_ref: RUN_ID, status: "QUEUED" });
    expect(started[0]).toMatchObject({ planTier: "free" });
    expect(started[0]!.discoveredPanel.map((panelMember) => panelMember.model_id)).toEqual([...PLAN_TIER_ROSTERS.free]);
    expect(substitutions).toHaveBeenCalledTimes(1);
  });

  /**
   * Final review Part 1b, Important 2 — THE MIRROR CASE. A refused cheaper
   * roster never stops a question its plan's own roster can run: the swap is
   * dropped, and the question starts (CLOSE) or waits on its plan's roster
   * (A5: start at the cheapest choice that can run). The precheck is taken
   * again and the decision is made for the plan's own settings class, so the
   * hold is the premium estimate; no substitution row is written.
   */
  const premiumClass = Object.freeze({
    planTier: "premium", compositionBudgetTier: "medium", makerCount: PLAN_TIER_ROSTERS.premium.length, depth: 3
  });
  const swappedClass = Object.freeze({
    planTier: "free", compositionBudgetTier: "medium", makerCount: PLAN_TIER_ROSTERS.free.length, depth: 3
  });

  it("drops the swap and STARTs on the plan's own roster when only the Free roster is unavailable, with no substitution row", async () => {
    const { billing } = billingFor("PLUS", { spent: 900_000, limit: 1_000_000 }, 300_000);
    const { room, questions } = recordingRoom();
    const { application, started, substitutions, enqueuedOnRoom } = arrange(billing, room, PLAN_TIER_ROSTERS.premium);
    const accepted = AskAcceptedSchema.parse(await application.submit(ask(), serverSession, serverPrincipal));
    expect(accepted).toMatchObject({ run_ref: RUN_ID, status: "QUEUED" });
    expect(accepted.applied?.plan_tier).toBe("premium");
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ planTier: "premium", compositionBudgetTier: "medium", depthParams: { depth: 3 } });
    expect(started[0]!.discoveredPanel.map((panelMember) => panelMember.model_id)).toEqual([...PLAN_TIER_ROSTERS.premium]);
    expect(substitutions).not.toHaveBeenCalled();
    // The first look was the swapped ask's; once the swap is dropped, the precheck and the locked decision are the plan's.
    expect(questions.map((question) => question.settingsClass)).toEqual([swappedClass, premiumClass, premiumClass]);
    expect(enqueuedOnRoom).toHaveBeenCalledTimes(1);
  });

  it("drops the swap and WAITs on the plan's own roster when only the Free roster is unavailable", async () => {
    const { billing } = billingFor("PLUS", { spent: 900_000, limit: 1_000_000 }, 300_000);
    const { room, questions } = recordingRoom(WAIT_SITE_DAY);
    const { application, started, substitutions, enqueuedOnRoom } = arrange(billing, room, PLAN_TIER_ROSTERS.premium);
    const accepted = AskAcceptedSchema.parse(await application.submit(ask(), serverSession, serverPrincipal));
    expect(accepted).toMatchObject({ run_ref: RUN_ID, status: "WAITING", waiting_scope: "SITE_DAY" });
    expect(started[0]).toMatchObject({ planTier: "premium" });
    expect(started[0]!.discoveredPanel.map((panelMember) => panelMember.model_id)).toEqual([...PLAN_TIER_ROSTERS.premium]);
    expect(substitutions).not.toHaveBeenCalled();
    expect(questions.at(-1)!.settingsClass).toEqual(premiumClass);
    expect(enqueuedOnRoom).not.toHaveBeenCalled();
  });

  it("still refuses, before any run exists, when neither roster is available", async () => {
    const { billing } = billingFor("PLUS", { spent: 900_000, limit: 1_000_000 }, 300_000);
    const { room } = recordingRoom();
    const { application, started, substitutions, setupFailures } = arrange(billing, room, []);
    await expect(application.submit(ask(), serverSession, serverPrincipal))
      .rejects.toMatchObject({ name: "AskRefusal", code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE" });
    expect(started).toHaveLength(0);
    expect(substitutions).not.toHaveBeenCalled();
    expect(setupFailures).not.toHaveBeenCalled();
  });
});

describe("the room read decides its settings the way submit does (R-28)", () => {
  it("decideRoomSettings leaves the query alone without billing or without an owner", async () => {
    const query = { plan_tier: "premium" as const, composition_budget_tier: "high" as const, depth_params: { depth: 5 } };
    await expect(decideRoomSettings(query, OWNER_REF, undefined)).resolves.toBe(query);
    const { billing, current } = billingFor("FREE");
    await expect(decideRoomSettings(query, null, billing)).resolves.toBe(query);
    expect(current).not.toHaveBeenCalled();
  });

  it("GET /v1/asks/room reads Free's room for a Free person, whatever the query says", async () => {
    const identity = testHttpIdentity("b8-room-read");
    const { billing, current } = billingFor("FREE");
    const read: RoomQuestion[] = [];
    const askRoom: AskRoomReader = {
      readRoom: async (question) => {
        read.push(question);
        return { room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: "FREE" };
      }
    };
    const api = buildApi({
      application: fixtureApplication(),
      sessions: testSessionApplication([identity]),
      allowedOrigin: TEST_APP_ORIGIN,
      askRoom,
      askBilling: billing
    });
    try {
      const response = await api.inject({
        method: "GET", url: "/v1/asks/room?plan_tier=premium&composition_budget_tier=high&depth=5",
        headers: testSessionHeaders(identity)
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ room: "FITS", plan_id: "FREE" });
    } finally {
      await api.close();
    }
    expect(current).toHaveBeenCalledWith(identity.authenticated.ownerRef, NOW);
    expect(read.map((question) => question.settingsClass)).toEqual([freeClass]);
  });

  it("keeps a paid person's query, raised to premium", async () => {
    const { billing } = billingFor("PRO");
    await expect(decideRoomSettings(
      { plan_tier: "free", composition_budget_tier: "medium", depth_params: { depth: 3 } }, OWNER_REF, billing
    )).resolves.toEqual({ plan_tier: "premium", composition_budget_tier: "medium", depth_params: { depth: 3 } });
  });
});

describe("submit with billing off keeps today's ask exactly", () => {
  it("takes the client's plan tier and reports nothing extra", async () => {
    const { application, started } = arrange(undefined);
    const accepted = await application.submit(ask({ plan_tier: "free", risk_tier: "high-stakes" }), serverSession, serverPrincipal);
    expect(started[0]).toMatchObject({ planTier: "free", askerRiskTier: "high-stakes", compositionBudgetTier: "medium" });
    expect(accepted).not.toHaveProperty("applied");
  });
});

describe("the HTTP face of ASK_SIGN_IN_REQUIRED", () => {
  it("is 401, not 422", () => {
    expect(askRefusalStatus("ASK_SIGN_IN_REQUIRED")).toBe(401);
    expect(askRefusalStatus("ASK_PLAN_TIER_MODEL_UNAVAILABLE")).toBe(422);
    expect(askRefusalStatus("DAILY_COST_ENVELOPE_REACHED")).toBe(429);
  });

  it("answers POST /v1/asks with 401 and the code", async () => {
    const identity = testHttpIdentity("b8-sign-in");
    const application = fixtureApplication(async () => {
      throw new AskRefusal(new TypedDomainError("ASK_SIGN_IN_REQUIRED", "Sign in to ask a question"));
    });
    const api = buildApi({ application, sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN });
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true), payload: ask() });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "ASK_SIGN_IN_REQUIRED", message: "Sign in to ask a question" });
    await api.close();
  });
});

describe("the colleague's consent gate comes before the plan and the room (R3-6)", () => {
  it("refuses a person who has not consented before any plan is decided, any room is read or anything is written", async () => {
    const identity = testHttpIdentity("b8-consent");
    const { billing, current } = billingFor("PLUS");
    const submit = vi.fn(async () => ({ run_ref: RUN_ID, status: "QUEUED" as const }));
    const api = buildApi({
      application: fixtureApplication(submit),
      sessions: { ...testSessionApplication([identity]), readSensitiveDataConsent: async () => "required" as const },
      allowedOrigin: TEST_APP_ORIGIN,
      askBilling: billing
    });
    try {
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true), payload: ask() });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: "SENSITIVE_DATA_CONSENT_REQUIRED" });
    } finally {
      await api.close();
    }
    // Neither waits nor is charged: `submit` (B8's plan decision, B6b's room, the hold) never ran.
    expect(submit).not.toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
  });
});

describe("manual phone completion at the resolved funding seam",()=>{
 it("refuses a resolved Free ask before room quota, hold or run creation",async()=>{
  const {billing}=billingFor("FREE"), {room,questions}=recordingRoom();
  const {application,started}=arrange(billing,room,undefined,{hasPhone:async()=>false});
  await expect(application.submit(ask(),serverSession,serverPrincipal)).rejects.toMatchObject({code:"ACCOUNT_PHONE_REQUIRED"});
  expect(questions).toEqual([]);expect(started).toEqual([]);
 });
 it("allows paid asks without phone even when the room uses Free models",async()=>{
  const {billing}=billingFor("PLUS",{spent:900000,limit:1000000},300000);
  const {application,started}=arrange(billing,undefined,undefined,{hasPhone:async()=>false});
  const result=await application.submit(ask(),serverSession,serverPrincipal);
  expect(result.status).toBe("QUEUED");expect(started).toHaveLength(1);
 });
 it("allows a resolved Free ask once the manual phone is present",async()=>{
  const {billing}=billingFor("FREE"), {room}=recordingRoom();
  const {application,started}=arrange(billing,room,undefined,{hasPhone:async()=>true});
  expect((await application.submit(ask(),serverSession,serverPrincipal)).status).toBe("QUEUED");expect(started).toHaveLength(1);
 });
});

it("offers crisis support first for an owner missing phone without room, quota or run work",async()=>{
 const identity=testHttpIdentity("task3-phone-crisis"),{billing}=billingFor("FREE"),{room,questions}=recordingRoom();
 let phoneReads=0;const {application,started}=arrange(billing,room,undefined,{hasPhone:async()=>{phoneReads++;return false;}});
 const api=buildApi({application,sessions:testSessionApplication([identity]),allowedOrigin:TEST_APP_ORIGIN});
 try{const response=await api.inject({method:"POST",url:"/v1/asks",headers:testSessionHeaders(identity,true),payload:ask({question_line:"I want to kill myself"})});
 expect(response.statusCode).toBe(422);expect(response.json()).toMatchObject({error:"CRISIS_SUPPORT_OFFERED"});expect(phoneReads).toBe(0);expect(questions).toEqual([]);expect(started).toEqual([]);
 const ordinary=await api.inject({method:"POST",url:"/v1/asks",headers:testSessionHeaders(identity,true),payload:ask()});
 expect(ordinary.statusCode).toBe(422);expect(ordinary.json()).toMatchObject({error:"ACCOUNT_PHONE_REQUIRED"});expect(phoneReads).toBe(1);expect(questions).toEqual([]);expect(started).toEqual([]);
 }finally{await api.close();}
});
