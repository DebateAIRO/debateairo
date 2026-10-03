/**
 * Paid plans S2 — the ask path hands the picker the person B6a's preview measured
 * (the room at the instant the debate would start), opens the START hold with the
 * picker's figure, pins the plan made for NOW when the locked decision starts a
 * question the preview said would wait, and runs B8's interim coarse fit only on
 * the roster path.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelStrength } from "@debateai/kernel";
import type { PickerMoneyLimits, PickerOutcome, RoleAssignment, RoleSeat, Scorecard, SeatCandidate } from "@debateai/scorecard";

const picker = vi.hoisted(() => ({ outcomes: [] as unknown[], inputs: [] as Array<{ moneyLimits?: unknown }> }));
const pins = vi.hoisted(() => ({ order: [] as string[], pinned: [] as Array<{ strength: string; steppedDown: boolean }> }));

vi.mock("@debateai/scorecard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/scorecard")>()),
  // One answer per call, in order; the last one repeats.
  pickRoleAssignment: (input: { moneyLimits?: unknown }) => {
    picker.inputs.push(input);
    return picker.outcomes.length > 1 ? picker.outcomes.shift() : picker.outcomes[0];
  }
}));

vi.mock("@debateai/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/db")>()),
  insertRunRoleAssignment: async (_pool: unknown, pin: { strength: string; steppedDown: boolean }) => {
    pins.order.push("pin");
    pins.pinned.push({ strength: pin.strength, steppedDown: pin.steppedDown });
  }
}));

import { PostgresAskApplication, type AskModelPickerSettings, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import type { AskRequest, Session } from "@debateai/contract";
import { RunRepository, type DiscoveredPanelMember } from "@debateai/db";
import { LivenessRepository } from "@debateai/liveness";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, computeStructuralCeilingBasis } from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { AskBilling } from "../../apps/api/src/ask-billing.js";
import type { AskRoomPort, RoomDecision, RoomPreview, RoomWindowUse } from "../../apps/api/src/ask-room.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-10-01T10:00:00.000Z");
const HOUR = 3_600_000;
const TX = Object.freeze({ marker: "the room decision's own transaction" }) as unknown as PoolClient;
const START = Object.freeze({ kind: "START" as const, worst: "CLOSE" as const, worstScope: "PERSON_DAY" as const });
const WAIT = Object.freeze({ kind: "WAIT" as const, waitsUntil: new Date(NOW.getTime() + HOUR), worstScope: "PERSON_DAY" as const });
const SITE = Object.freeze({ perRunCeilingMicros: 250_000, serveReserveBasisPoints: 3000, serveOverrunBasisPoints: 2000 });
const CEILING_TERMS = Object.freeze({
  judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1, finalRetryAttempts: 1,
  branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5
});

const use = (limitMicros: number, usedMicros: number): RoomWindowUse => Object.freeze({
  scope: "PERSON_DAY" as const, limitMicros, usedMicros, resetsAt: new Date(NOW.getTime() + HOUR), closeBasisPoints: 9500
});
// B6a's wait reason for this file's WAIT: the day is full on SPEND, so the wait ends at its reset (`waitsUntil` too);
// with no person window full (a START) the reason names the site.
const FULL_ON_SPEND = Object.freeze({ waitsFor: "PERSON" as const, personRecheckAt: WAIT.waitsUntil });
const NO_PERSON_FULL = Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null });
const preview = (admission: RoomPreview["admission"], personUses: readonly RoomWindowUse[]): RoomPreview =>
  Object.freeze({
    admission, estimateMicros: 1_234, now: NOW, personUses,
    waitReason: admission.kind === "WAIT" ? FULL_ON_SPEND : NO_PERSON_FULL
  });

function member(providerRef: string, maker: string, modelId: string): DiscoveredPanelMember {
  return Object.freeze({ provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-01T00:00:00.000Z" });
}
const PANEL = Object.freeze([
  member("provider:s2:openai", "OpenAI", "gpt-5.6-sol"),
  member("provider:s2:anthropic", "Anthropic", "claude-opus-5"),
  member("provider:s2:google", "Google", "gemini-3.8-flash")
]);

function candidate(source: DiscoveredPanelMember): SeatCandidate {
  return Object.freeze({
    candidateId: `${source.model_id}@DEFAULT_ONLY`, providerRef: source.provider_ref,
    maker: source.maker, modelId: source.model_id, thinkingLevel: "DEFAULT_ONLY"
  });
}

/** A picker answer at `strength`, estimated at `moneyMicros` on the hosted money scale. */
function assignedHosted(strength: ModelStrength = "BALANCED", moneyMicros = 8000): Extract<PickerOutcome, { state: "ASSIGNED" }> {
  const seats: readonly RoleSeat[] = Object.freeze(PANEL.map((entry, seatIndex) => Object.freeze({
    seatIndex, main: candidate(entry), runnerUp: null, diversityShare: 0, source: "SCORECARD" as const
  })));
  const assignment: RoleAssignment = Object.freeze({
    scorecardVersion: 7,
    strength,
    roles: Object.freeze({
      POSITION: seats, SUPPORT_ATTACK: seats, CROSS_EXCHANGE: seats, JUDGE: seats, REVIEWER: seats,
      ANSWER_WRITER: Object.freeze([seats[0]!]),
      ANSWER_CHECKER: Object.freeze([Object.freeze({ ...seats[1]!, seatIndex: 0 })])
    })
  });
  return Object.freeze({
    state: "ASSIGNED" as const, assignment, appliedStrength: strength, steppedDown: false,
    estimate: Object.freeze({ mode: "HOSTED" as const, moneyMicros, seconds: 900 }),
    notes: Object.freeze([])
  });
}
const tooSmall = (): PickerOutcome => Object.freeze({ state: "REFUSED" as const, reason: "BUDGET_TOO_SMALL" as const, detail: "test" });

const HOSTED_PICKER: AskModelPickerSettings = Object.freeze({
  scorecard: Object.freeze({ state: "VALID" as const, scorecard: Object.freeze({ scorecardVersion: 7 }) as unknown as Scorecard, sourceRef: "test:s2" }),
  mode: "HOSTED" as const,
  targetFacts: new Map(),
  perRunCeilingMicros: SITE.perRunCeilingMicros,
  moneyPolicy: SITE,
  runMaximumMicros: 300_000,
  answerTokenCeilings: Object.freeze({
    POSITION: 2048, SUPPORT_ATTACK: 2048, CROSS_EXCHANGE: 2048, JUDGE: 2048, REVIEWER: 2048,
    ANSWER_WRITER: 2048, ANSWER_CHECKER: 2048
  })
});

const PLANS = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test:s2-plans");

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
  risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:s2",
  composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "s2 submit test",
  as_of: "2026-10-01T00:00:00.000Z", steering_presets: [], plan_tier: "premium",
  steering_annotations: [], model_strength: "BEST"
} as unknown as AskRequest;

function arrange(input: Readonly<{
  preview: RoomPreview;
  /** What the room's LOCKED decision answers; the preview's admission when absent. */
  decided?: RoomDecision;
  modelPicker: AskModelPickerSettings | null;
  outcomes?: readonly PickerOutcome[];
}>) {
  const order = pins.order;
  order.length = 0;
  pins.pinned.length = 0;
  picker.inputs.length = 0;
  picker.outcomes = [...(input.outcomes ?? [assignedHosted()])];
  const holds: number[] = [];
  const logged: unknown[] = [];
  vi.spyOn(console, "info").mockImplementation((line: unknown) => {
    try { logged.push(JSON.parse(String(line))); } catch { logged.push(line); }
  });
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async () => { order.push("startRun"); return RUN_ID; });
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockImplementation(async () => { order.push("recordMemoryQuestion"); });
  vi.spyOn(WorkItemRepository.prototype, "enqueue").mockImplementation(async () => { order.push("enqueue"); return WORK_ITEM_ID; });
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockImplementation(async () => { order.push("enqueue"); return WORK_ITEM_ID; });
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockResolvedValue(true);
  const room: AskRoomPort = {
    precheck: async () => { order.push("precheck"); return input.preview; },
    decide: async (_question, apply) => {
      order.push("decide");
      return apply({ admission: input.decided ?? input.preview.admission, estimateMicros: 1_234, now: NOW, tx: TX });
    },
    enterWait: async () => { order.push("enterWait"); },
    openStart: async (_tx, hold) => { order.push("openStart"); holds.push(hold.heldMicros); },
    expectedStart: async () => null
  };
  const billing: AskBilling = Object.freeze({
    plans: PLANS,
    entitlements: { current: async () => Object.freeze({ planId: "PLUS" as const, eventId: "55555555-5555-4555-8555-555555555555" }) },
    coarseFit: Object.freeze({
      personAllowance: { read: async () => { order.push("coarseFit"); return []; } },
      spend: { readOwnerSpentMicros: async () => 0, readOwnerCountedHoldsMicros: async () => 0 },
      estimator: { estimateMicros: async () => 1_000 }
    }),
    clock: () => NOW
  });
  const settings: RunCreationSettings = {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "battery:s2",
    settlementWatchHandle: "watch:s2",
    resolveDiscoveredPanel: async () => { order.push("panel"); return PANEL; },
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned }) =>
      computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    room,
    billing,
    ...(input.modelPicker === null ? {} : { modelPicker: input.modelPicker })
  };
  const application = new PostgresAskApplication(
    stubPool(),
    { dispatch: vi.fn(async () => { order.push("dispatch"); }) },
    settings,
    { read: async () => [] },
    stubPool(),
    { server: stubPool(), legacy: stubPool() }
  );
  const submit = () => application.submit(ask, session, { kind: "server", userId: "s2-user", ownerRef: OWNER_REF });
  const limits = () => picker.inputs.map((entry) => entry.moneyLimits as PickerMoneyLimits | null | undefined);
  return { order, holds, logged, pinned: pins.pinned, limits, submit };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// A room of 1000 under a site ceiling of 250 000 (30 % held back for the answer, 20 % overrun):
// body 700, whole run 1000 — the room itself, never the site's 120 %.
const WAKE_LIMITS = Object.freeze({ bodyMicros: 700, serveMicros: 1000, personRoomMicros: 1000, unknownEstimateMicros: 300_000 });
// The same windows NOW, the day spent: nothing left.
const NOW_LIMITS = Object.freeze({ bodyMicros: 0, serveMicros: 0, personRoomMicros: 0, unknownEstimateMicros: 300_000 });
// A5: ECONOMY against the site's own ceiling.
const SITE_LIMITS = Object.freeze({ bodyMicros: 175_000, serveMicros: 300_000, personRoomMicros: null, unknownEstimateMicros: 300_000 });

describe("S2 · the ask path plans the debate inside the person's room", () => {
  it("START: the picker is given the room at the preview's instant, and the hold opens with its figure", async () => {
    const { order, holds, limits, submit } = arrange({ preview: preview(START, [use(1000, 700)]), modelPicker: HOSTED_PICKER });
    await expect(submit()).resolves.toMatchObject({ run_ref: RUN_ID, status: "QUEUED", model_strength_applied: "BALANCED" });
    // A room of 300: the site's body share cut from 300 (70 %), the whole run held to the 300 itself.
    expect(limits()).toEqual([{ bodyMicros: 210, serveMicros: 300, personRoomMicros: 300, unknownEstimateMicros: 300_000 }]);
    expect(holds).toEqual([8000]);
    expect(order).toEqual([
      "precheck", "panel", "decide", "startRun", "pin", "recordMemoryQuestion", "openStart", "enqueue", "dispatch"
    ]);
  });

  it("WAIT, decided WAIT: the wake plan is pinned; the plan for NOW is made too, and not used", async () => {
    const { order, holds, limits, pinned, submit } = arrange({
      preview: preview(WAIT, [use(1000, 1000)]), modelPicker: HOSTED_PICKER,
      outcomes: [assignedHosted("BEST", 900), tooSmall(), assignedHosted("ECONOMY", 600)]
    });
    await expect(submit()).resolves.toMatchObject({ status: "WAITING", model_strength_applied: "BEST", model_strength_stepped_down: false });
    expect(limits()).toEqual([WAKE_LIMITS, NOW_LIMITS, SITE_LIMITS]);
    expect(pinned).toEqual([{ strength: "BEST", steppedDown: false }]);
    expect(holds).toEqual([]);
    expect(order.slice(-1)).toEqual(["enterWait"]);
  });

  it("WAIT previewed, START decided under the locks: pins the plan made for NOW (ECONOMY, A5), with its hold", async () => {
    const { holds, limits, pinned, logged, submit } = arrange({
      preview: preview(WAIT, [use(1000, 1000)]), decided: START, modelPicker: HOSTED_PICKER,
      outcomes: [assignedHosted("BEST", 900), tooSmall(), assignedHosted("ECONOMY", 600)]
    });
    await expect(submit()).resolves.toMatchObject({
      status: "QUEUED", model_strength_applied: "ECONOMY", model_strength_stepped_down: true
    });
    expect(limits()).toEqual([WAKE_LIMITS, NOW_LIMITS, SITE_LIMITS]);
    // Never the wake plan: it was sized for a reset window that has not reset.
    expect(pinned).toEqual([{ strength: "ECONOMY", steppedDown: true }]);
    expect(holds).toEqual([600]);
    expect(logged).toContainEqual({ event: "api.ask.person_room_tight", runId: RUN_ID });
  });

  it("with no person window measured, the site's own shares alone, and one pick", async () => {
    const { limits, submit } = arrange({ preview: preview(START, []), modelPicker: HOSTED_PICKER });
    await submit();
    expect(limits()).toEqual([SITE_LIMITS]);
  });

  it("never runs B8's coarse fit while a VALID scorecard plans the debate", async () => {
    const { order, submit } = arrange({ preview: preview(START, [use(1000, 700)]), modelPicker: HOSTED_PICKER });
    await submit();
    expect(order).not.toContain("coarseFit");
    expect(order[0]).toBe("precheck");
  });

  it("runs B8's coarse fit first on the roster path, and asks no picker", async () => {
    const { order, limits, submit } = arrange({ preview: preview(START, [use(1000, 700)]), modelPicker: null });
    await submit().catch(() => undefined);
    expect(order.slice(0, 2)).toEqual(["coarseFit", "precheck"]);
    expect(limits()).toEqual([]);
  });
});
