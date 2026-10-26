/**
 * Side-by-side spec §13 (settings changes without an upload), Task S10 — EACH ASK IS ADMITTED ON THE ACTIVE SETTINGS
 * VERSION AND STAMPED WITH IT.
 *
 * Plain words: the owners can switch which sealed settings version new debates use. The API reads the active version
 * once per ask, before it decides anything, and everything frozen at admission (the receipt, the seats, the risk tier,
 * the memory question, the estimate) comes from that one version. A version that moves while an ask is being admitted
 * changes nothing of that ask. Without the reader (`admissionSettings` absent) the API admits exactly as before, on its
 * own register version. The room read and GET /v1/session answer from the active version too (`admissionView`).
 */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PickerOutcome, RoleAssignment, RoleSeat, Scorecard, SeatCandidate } from "@debateai/scorecard";

const picker = vi.hoisted(() => ({ outcome: null as unknown }));
/** `insertRunRoleAssignment` is a module function (P2 A6), so the pin is recorded through a module mock. */
const pinning = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("@debateai/scorecard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/scorecard")>()),
  pickRoleAssignment: () => picker.outcome
}));

vi.mock("@debateai/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/db")>()),
  insertRunRoleAssignment: async (_executor: unknown, input: unknown) => { pinning.calls.push(input); }
}));
/**
 * Task SA6 (addition D16): the preview's start-of-debate gate pricing is recorded, never priced — which gate settings it
 * was handed and the frozen panel it would price (tests/unit/preview-budget-estimate.test.ts prices it).
 */
const gatePricing = vi.hoisted(() => ({ calls: [] as Array<Readonly<{ gate: unknown; panel: readonly string[] }>> }));
vi.mock("../../apps/api/src/preview-budget-estimate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/api/src/preview-budget-estimate.js")>()),
  assertPreviewBudgetAdmits: async (gate: unknown, input: Readonly<{ panel: ReadonlyArray<Readonly<{ model_id: string }>> }>) => {
    gatePricing.calls.push(Object.freeze({ gate, panel: Object.freeze(input.panel.map((entry) => entry.model_id)) }));
  }
}));

import {
  PostgresAskApplication, askRefusalStatus, buildApi, type AskApplication, type AskModelPickerSettings, type RunCreationSettings
} from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import type { CostEstimator } from "@debateai/budget";
import { AskRoomResponseSchema, PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import {
  RunCostSubstitutionRepository, RunRepository, type DiscoveredPanelMember, type StartRunInput, type StoredAsk, type WaitingRun,
  type WaitingRunRef
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { LivenessRepository } from "@debateai/liveness";
import {
  composePreviewProviderTestConfig, parsePreviewEnvironmentConfig, parsePreviewLineUp, previewModelRow, type PreviewProviderTestConfig
} from "@debateai/providers";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, computeStructuralCeilingBasis, debateShapePolicyStartValues,
  lengthGuidancePolicyStartValues
} from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { AdmissionRunMembers, AdmissionVersionSettings } from "../../apps/api/src/admission-settings.js";
import { createAdmissionSettingsCache, createAdmissionView } from "../../apps/api/src/admission-settings.js";
import type { AskBilling } from "../../apps/api/src/ask-billing.js";
import {
  AskRoom, type AskAdmissionGate, type AskRoomLine, type AskRoomPort, type AskRoomReader, type AskRoomSpend, type AskWaitingLinePort,
  type Readmission, type RoomDecision, type RoomQuestion
} from "../../apps/api/src/ask-room.js";
import { PostgresAskAdmissionGate } from "../../apps/api/src/release-state.js";
import type { PreviewBudgetGateSettings, PreviewVersionTerms } from "../../apps/api/src/preview-budget-estimate.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import { testReleaseKey } from "../support/releaseKey.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-10-22T12:00:20.000Z");
/** The API's own register version (its release key's number), and the version the activation pointer names. */
const SITE = 17;
const ACTIVE = 18;
const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });

function member(providerRef: string, maker: string, modelId: string): DiscoveredPanelMember {
  return Object.freeze({ provider_ref: providerRef, maker, model_id: modelId,
    probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-22T00:00:00.000Z" });
}

/** Both plan rosters, every model its own maker: the roster path admits either plan. */
const ROSTER_PANEL = Object.freeze([...new Set([...PLAN_TIER_ROSTERS.free, ...PLAN_TIER_ROSTERS.premium])]
  .map((modelId, index) => member(`provider:${String(index)}`, `maker:${String(index)}`, modelId)));
/**
 * A panel the premium roster cannot run (its third model is not on it): only a VALID scorecard's picker, which replaces
 * the roster filter, admits it, so an ask admitted on it proves which version's picker seated it.
 */
const PICKER_PANEL = Object.freeze([
  member("development:codex-premium-cli", "OpenAI", "gpt-5.6-sol"),
  member("development:claude-premium-cli", "Anthropic", "claude-opus-5"),
  member("development:agy-cli", "Google", "gemini-3.8-flash")
]);

function ask(overrides: Partial<AskRequest> = {}): AskRequest {
  return {
    question_line: "Should a city plant trees along every new street?",
    risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:s10", composition_budget_tier: "low",
    depth_params: { depth: 1 }, decision_scope: "s10 per-version admission", as_of: "2026-10-22T00:00:00.000Z",
    steering_presets: [], plan_tier: "premium", steering_annotations: [], ...overrides
  };
}

const session: Session = {
  session_id: "33333333-3333-4333-8333-333333333333", asker_id: `owner:${OWNER_REF}`, caller_scope: "ASKER",
  ownership_provenance: "server_session", provisional_identity_model: false
};
const principal = { kind: "server" as const, userId: "66666666-6666-4666-8666-666666666666", ownerRef: OWNER_REF };

/**
 * A pool whose every query answers the lease's row. Task S11: the direct path's re-check
 * (`register.settings_version_passed`) answers `passed` and is recorded in `asked` (its text and values), and as
 * "passed?" in `used`, in order with the ask's other steps.
 */
function stubPool(passed = true, asked: unknown[][] = [], used: string[] = []): Pool {
  const query = vi.fn(async (sql: unknown, values?: unknown) => {
    if (typeof sql === "string" && sql.includes("register.settings_version_passed")) {
      asked.push([sql, values]);
      used.push("passed?");
      return { rows: [{ passed }], rowCount: 1 } as unknown as QueryResult;
    }
    return { rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult;
  });
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

function candidate(source: DiscoveredPanelMember): SeatCandidate {
  return Object.freeze({ candidateId: `${source.model_id}@DEFAULT_ONLY`, providerRef: source.provider_ref,
    maker: source.maker, modelId: source.model_id, thinkingLevel: "DEFAULT_ONLY" });
}

/** The picker's assignment over PICKER_PANEL (model-picker-submit.test.ts's fixture). */
function assigned(): Extract<PickerOutcome, { state: "ASSIGNED" }> {
  const seats: readonly RoleSeat[] = Object.freeze(PICKER_PANEL.map((entry, seatIndex) => Object.freeze({
    seatIndex, main: candidate(entry), runnerUp: null, diversityShare: 0, source: "SCORECARD" as const
  })));
  const assignment: RoleAssignment = Object.freeze({
    scorecardVersion: 7, strength: "BALANCED",
    roles: Object.freeze({
      POSITION: seats, SUPPORT_ATTACK: seats, CROSS_EXCHANGE: seats, JUDGE: seats, REVIEWER: seats,
      ANSWER_WRITER: Object.freeze([seats[0]!]), ANSWER_CHECKER: Object.freeze([Object.freeze({ ...seats[1]!, seatIndex: 0 })])
    })
  });
  return Object.freeze({
    state: "ASSIGNED" as const, assignment, appliedStrength: "BALANCED" as const, steppedDown: false,
    estimate: Object.freeze({ mode: "LOCAL" as const, moneyMicros: null, seconds: 900 }), notes: Object.freeze([])
  });
}

const VALID_PICKER: AskModelPickerSettings = Object.freeze({
  scorecard: Object.freeze({ state: "VALID" as const, scorecard: Object.freeze({ scorecardVersion: 7 }) as unknown as Scorecard,
    sourceRef: "test:s10" }),
  mode: "LOCAL" as const,
  targetFacts: new Map(),
  perRunCeilingMicros: null,
  answerTokenCeilings: Object.freeze({ POSITION: 2048, SUPPORT_ATTACK: 2048, CROSS_EXCHANGE: 2048, JUDGE: 2048, REVIEWER: 2048,
    ANSWER_WRITER: 2048, ANSWER_CHECKER: 2048 })
});

/**
 * One version's members of `RunCreationSettings` (what `admissionSettingsOfVersion` hands the ask path), each part
 * marked with its version: its receipt carries `version_mark`, its risk tier's provenance ends `:v<version>`, and every
 * use is written into `used` as `<part>:<version>`.
 */
function versionMembers(version: number, used: string[], extra: Partial<AdmissionRunMembers> = {}): AdmissionRunMembers {
  return Object.freeze({
    registerVersion: version,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape }) => {
      used.push(`receipt:${String(version)}`);
      return Object.freeze({ ...computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth),
        backupSequencesProvisioned, ...(shape === null ? {} : { shape }) }), version_mark: version });
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => {
      used.push(`risk:${String(version)}`);
      return { effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef: `${tierProvenanceRef}:v${String(version)}` };
    },
    ...extra
  });
}

type Arranged = Readonly<{
  application: PostgresAskApplication;
  started: StartRunInput[];
  memory: Array<Readonly<Record<string, unknown>>>;
  used: string[];
  pointer: ReturnType<typeof vi.fn>;
  membersFor: ReturnType<typeof vi.fn>;
  /** Task S11: the direct path's re-check queries on the API's pool, each its text and values. */
  settingsAsked: unknown[][];
}>;

/**
 * The site's settings (version 17: its own members, the process members) and, unless `noReader`, the reader over the
 * versions `members` builds. `active` is the pointer's answers in turn (the last one repeats).
 */
function arrange(input: Readonly<{
  active?: readonly number[];
  members?: (version: number, used: string[]) => AdmissionRunMembers;
  site?: (used: string[]) => Partial<RunCreationSettings>;
  panel?: readonly DiscoveredPanelMember[];
  noReader?: boolean;
  room?: AskRoomPort;
  /** Task S13: the waker's line (the room, as main.ts hands it both). */
  waitingLine?: AskWaitingLinePort;
  billing?: AskBilling;
  refuse?: (version: number) => unknown;
  /** Task S11: what the direct path's re-check answers (default: passed). */
  passed?: boolean;
}> = {}): Arranged {
  const started: StartRunInput[] = [];
  const memory: Array<Readonly<Record<string, unknown>>> = [];
  const used: string[] = [];
  pinning.calls.length = 0;
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async (run) => {
    used.push("startRun");
    started.push(run);
    return RUN_ID;
  });
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockImplementation(async (question) => {
    memory.push(question as unknown as Readonly<Record<string, unknown>>);
  });
  vi.spyOn(WorkItemRepository.prototype, "enqueue").mockResolvedValue(WORK_ITEM_ID);
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockResolvedValue(WORK_ITEM_ID);
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockResolvedValue(true);
  vi.spyOn(RunCostSubstitutionRepository.prototype, "record").mockResolvedValue("substitution:s10");
  const answers = [...(input.active ?? [ACTIVE])];
  const pointer = vi.fn(async () => {
    used.push("pointer");
    return answers.length > 1 ? answers.shift()! : answers[0]!;
  });
  const build = input.members ?? ((version: number, into: string[]) => versionMembers(version, into));
  const membersFor = vi.fn(async (version: number) => {
    used.push(`members:${String(version)}`);
    const refusal = input.refuse?.(version);
    if (refusal !== undefined) throw refusal;
    return build(version, used);
  });
  const settings: RunCreationSettings = {
    ...versionMembers(SITE, used),
    ...input.site?.(used),
    strangerSampleRate: 0, releaseKey: testReleaseKey(SITE), batteryVersion: "s10", settlementWatchHandle: "s10",
    resolveDiscoveredPanel: async () => {
      used.push("discovery");
      return input.panel ?? ROSTER_PANEL;
    },
    ...(input.room === undefined ? {} : { room: input.room }),
    ...(input.waitingLine === undefined ? {} : { waitingLine: input.waitingLine }),
    ...(input.billing === undefined ? {} : { billing: input.billing }),
    ...(input.noReader === true ? {} : { admissionSettings: { activeSettingsVersion: pointer, admissionSettingsFor: membersFor } })
  };
  const settingsAsked: unknown[][] = [];
  const application = new PostgresAskApplication(stubPool(input.passed ?? true, settingsAsked, used), { dispatch: vi.fn(async () => undefined) },
    settings, { read: async () => [] }, stubPool(), { server: stubPool(), legacy: stubPool() });
  return { application, started, memory, used, pointer, membersFor, settingsAsked };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("(1) an ask is admitted on the active version: every frozen part is version 18's", () => {
  it("stamps 18 on the run, mints its receipt, seats and risk tier from 18, and asks its memory question at 18", async () => {
    picker.outcome = assigned();
    const { application, started, memory, used } = arrange({
      panel: PICKER_PANEL,
      // Version 18 alone scores its models: its picker seats the debate. The site's version has no scorecard, so its
      // roster filter would refuse this panel (the premium roster's third model is not on it).
      members: (version, into) => versionMembers(version, into, version === ACTIVE ? { modelPicker: VALID_PICKER } : {})
    });
    const accepted = await application.submit(ask({ model_strength: "BEST" }), session, principal);
    expect(accepted).toMatchObject({ run_ref: RUN_ID, status: "QUEUED", model_strength_applied: "BALANCED" });
    expect(started).toHaveLength(1);
    const run = started[0]!;
    expect(run.registerVersion).toBe(ACTIVE);
    // The release stays this API's own: the key names the site version, the run carries the active one.
    expect(run.releaseKey).toBe(testReleaseKey(SITE));
    expect(run.envelopeBasis).toMatchObject({ version_mark: ACTIVE });
    expect(run.tierProvenanceRef).toBe(`asker:s10:v${String(ACTIVE)}`);
    expect(run.discoveredPanel.map((entry) => entry.provider_ref)).toEqual(PICKER_PANEL.map((entry) => entry.provider_ref));
    expect(pinning.calls).toHaveLength(1);
    expect(memory).toEqual([expect.objectContaining({ runId: RUN_ID, policyVersion: ACTIVE })]);
    expect(used.filter((part) => part.endsWith(`:${String(SITE)}`))).toEqual([]);
  });

  it("a member the active version does not have is absent from its ask, never the site version's (no shape row at 18)", async () => {
    const { application, started } = arrange({
      site: () => ({ debateShapePolicy: debateShapePolicyStartValues(), lengthGuidancePolicy: lengthGuidancePolicyStartValues() })
    });
    await application.submit(ask({ depth_params: { depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "short" } }),
      session, principal);
    // Without the shape row (and the length row) the stored ask is `{ depth }` exactly (spec 2026-10-12 §3.2).
    expect(started[0]!.depthParams).toEqual({ depth: 2 });
    expect(started[0]!.envelopeBasis).not.toHaveProperty("shape");
    expect(started[0]!.registerVersion).toBe(ACTIVE);
  });
});

describe("(2) the pointer is read once per ask, before anything is decided, and one version serves the whole ask", () => {
  it("reads it first, once; a pointer that moves after that changes nothing of this ask", async () => {
    const { application, started, memory, used, pointer, membersFor } = arrange({ active: [ACTIVE, 19] });
    await application.submit(ask(), session, principal);
    expect(pointer).toHaveBeenCalledTimes(1);
    expect(used[0]).toBe("pointer");
    expect(used[1]).toBe(`members:${String(ACTIVE)}`);
    expect(used.indexOf("discovery")).toBeGreaterThan(1);
    expect(membersFor.mock.calls).toEqual([[ACTIVE]]);
    expect(used.filter((part) => part.endsWith(":19"))).toEqual([]);
    expect(started[0]!.registerVersion).toBe(ACTIVE);
    expect(memory[0]).toMatchObject({ policyVersion: ACTIVE });
    // The next ask reads the pointer again and is admitted on the version it names.
    await application.submit(ask(), session, principal);
    expect(pointer).toHaveBeenCalledTimes(2);
    expect(started[1]!.registerVersion).toBe(19);
    expect(memory[1]).toMatchObject({ policyVersion: 19 });
  });

  it("builds each version's settings once: a later ask on the same version asks the loader nothing", async () => {
    const { application, membersFor } = arrange({ active: [ACTIVE] });
    await application.submit(ask(), session, principal);
    await application.submit(ask(), session, principal);
    expect(membersFor).toHaveBeenCalledTimes(1);
  });

  it("the room path reads it once too, and its question names the version (precheck and decision)", async () => {
    const { room, questions } = recordingRoom();
    const { application, pointer, started, memory, used } = arrange({ room, active: [ACTIVE, 19] });
    await application.submit(ask(), session, principal);
    expect(pointer).toHaveBeenCalledTimes(1);
    expect(used[0]).toBe("pointer");
    expect(questions.map((question) => question.registerVersion)).toEqual([ACTIVE, ACTIVE]);
    expect(started[0]!.registerVersion).toBe(ACTIVE);
    expect(memory[0]).toMatchObject({ policyVersion: ACTIVE });
    expect(used.filter((part) => part.endsWith(":19") || part.endsWith(`:${String(SITE)}`))).toEqual([]);
  });
});

describe("(3) without the reader, today's single-version admission", () => {
  it("stamps the API's own register version and asks the memory question at it", async () => {
    const { application, started, memory, used } = arrange({ noReader: true });
    await application.submit(ask(), session, principal);
    expect(started[0]!.registerVersion).toBe(SITE);
    expect(started[0]!.envelopeBasis).toMatchObject({ version_mark: SITE });
    expect(memory[0]).toMatchObject({ policyVersion: SITE });
    expect(used).not.toContain("pointer");
  });
});

describe("a version this API cannot load (should never happen: activation needs a PASS of the same loader)", () => {
  it("is one ADMISSION_SETTINGS_UNSUPPORTED line (version, code); without a room the ask is not started: nothing written", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { application, started, memory } = arrange({
      refuse: () => new TypedDomainError("PREVIEW_LINE_UP_REQUIRED", "PREVIEW_LINE_UP_REQUIRED")
    });
    // The direct path (no room, so no waiting line: P7) answers the plain "cannot be reached right now, please try again
    // in a minute" refusal, with its retry instant (S11, ruling R47); with a room the ask waits in line (S11's cases).
    await expect(application.submit(ask(), session, principal)).rejects.toMatchObject({
      name: "AskRefusal", code: "ASK_MODEL_CANDIDATE_UNAVAILABLE", retryAt: expect.any(Date)
    });
    expect(started).toEqual([]);
    expect(memory).toEqual([]);
    const lines = errors.mock.calls.map(([line]) => String(line));
    expect(lines).toContainEqual(JSON.stringify({
      kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_SETTINGS_UNSUPPORTED", version: ACTIVE, cause: "PREVIEW_LINE_UP_REQUIRED"
    }));
  });

  it("a database failure is not a settings refusal: it reaches the caller as it is, and no line calls it unsupported", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("Connection terminated unexpectedly");
    const { application, started } = arrange({ refuse: () => failure });
    await expect(application.submit(ask(), session, principal)).rejects.toBe(failure);
    expect(started).toEqual([]);
    expect(errors.mock.calls.map(([line]) => String(line)).join("\n")).not.toContain("ADMISSION_SETTINGS_UNSUPPORTED");
  });
});

const START: RoomDecision = Object.freeze({ kind: "START", worst: "FITS", worstScope: null });
const ROOM_TX = Object.freeze({ query: vi.fn() }) as unknown as PoolClient;

function recordingRoom() {
  const questions: RoomQuestion[] = [];
  const room: AskRoomPort = {
    precheck: async (question) => {
      questions.push(question);
      return { admission: START, estimateMicros: 1_000, now: NOW, personUses: [],
        waitReason: Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null }) };
    },
    decide: async (question, apply) => {
      questions.push(question);
      return apply({ admission: START, estimateMicros: 1_000, now: NOW, tx: ROOM_TX });
    },
    enterWait: async () => undefined,
    openStart: async () => undefined,
    expectedStart: async () => null
  };
  return { room, questions };
}

/** An estimator that answers `micros` and records each class it is asked for. */
function estimator(micros: number, asked: unknown[] = []): CostEstimator {
  return { estimateMicros: async (settingsClass) => { asked.push(settingsClass); return micros; } };
}

describe("(4) the room's estimate for an ask comes from its version's estimator (`estimatorFor`)", () => {
  const CLASS = Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 });
  const ACCESS = Object.freeze({ ownerRef: null, legacyAskerId: "legacy:s10" });

  function roomOf(input: Readonly<{ estimatorFor?: (version: number) => Promise<CostEstimator>; line?: readonly WaitingRun[] }>) {
    const holds: Array<Readonly<{ runId: string; heldMicros: number }>> = [];
    const spend: AskRoomSpend = {
      readDaySpentMicros: async () => 0, readSiteCountedHoldsMicros: async () => 0, readOwnerSpentMicros: async () => 0,
      readOwnerCountedHoldsMicros: async () => 0, openHold: async (_client, hold) => { holds.push(hold); }
    };
    const mine: WaitingRunRef[] = [];
    const line: AskRoomLine = {
      siteLineBlocking: async () => false, wakeCandidates: async () => [], waitingForOwner: async () => mine,
      waitingForLegacyAsker: async () => mine,
      readWaiting: async (runId) => (input.line ?? []).find((run) => run.runId === runId) ?? null,
      isWaiting: async (_executor, runId) => (input.line ?? []).some((run) => run.runId === runId),
      enterWait: async () => undefined, recordReason: async () => undefined, markStarted: async () => undefined
    };
    const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
    const room = new AskRoom({
      lockPool: { connect: vi.fn(async () => client) } as unknown as Pool,
      spend, line, estimator: estimator(1_000),
      ...(input.estimatorFor === undefined ? {} : { estimatorFor: input.estimatorFor }),
      personAllowance: { read: async () => [] }, entitlements: null,
      dailyCeilingMicros: 100_000, closeBasisPoints: 9_500, waitingLinePerPerson: 1, clock: () => NOW
    });
    return { room, holds };
  }

  function waiting(extra: Partial<WaitingRun> = {}): WaitingRun {
    return Object.freeze({ runId: randomUUID(), waitingSince: new Date("2026-10-22T11:00:00.000Z"), releaseKey: testReleaseKey(SITE),
      ownerRef: null, legacyAskerId: "legacy:s10", planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 2,
      waitsFor: "SITE", personRecheckAt: null, reasonAt: new Date("2026-10-22T11:00:00.000Z"), ...extra });
  }

  it("precheck, the locked decision and the room read estimate with the question's version", async () => {
    const asked: number[] = [];
    const { room } = roomOf({ estimatorFor: async (version) => { asked.push(version); return estimator(2_000); } });
    const question = Object.freeze({ access: ACCESS, settingsClass: CLASS, registerVersion: ACTIVE });
    expect((await room.precheck(question)).estimateMicros).toBe(2_000);
    expect(await room.decide(question, async ({ estimateMicros }) => estimateMicros)).toBe(2_000);
    await room.readRoom(question);
    expect(asked).toEqual([ACTIVE, ACTIVE, ACTIVE]);
  });

  it("a question without a version (a composition before S10) keeps the room's own estimator", async () => {
    const asked: number[] = [];
    const { room } = roomOf({ estimatorFor: async (version) => { asked.push(version); return estimator(2_000); } });
    expect((await room.precheck({ access: ACCESS, settingsClass: CLASS })).estimateMicros).toBe(1_000);
    expect(asked).toEqual([]);
  });

  it("a waiting run is estimated, and held when it starts, at the version it was stamped with", async () => {
    const run = waiting({ registerVersion: ACTIVE });
    const asked: number[] = [];
    const { room, holds } = roomOf({ line: [run], estimatorFor: async (version) => { asked.push(version); return estimator(3_000); } });
    await room.expectedStart(run.runId);
    const outcome = await room.startWaiting(run, async () => "job");
    expect(outcome).toMatchObject({ kind: "STARTED", runId: run.runId });
    expect(holds).toEqual([{ runId: run.runId, heldMicros: 3_000 }]);
    expect(asked).toEqual([ACTIVE, ACTIVE]);
  });

  it("a version whose estimator cannot be had is estimated with the room's own, with one content-free line per version", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = waiting({ registerVersion: 16 });
    const { room, holds } = roomOf({ line: [run], estimatorFor: async () => {
      throw new TypedDomainError("PREVIEW_LINE_UP_REQUIRED", "PREVIEW_LINE_UP_REQUIRED");
    } });
    await room.startWaiting(run, async () => "job");
    await room.expectedStart(run.runId);
    expect(holds).toEqual([{ runId: run.runId, heldMicros: 1_000 }]);
    const said = errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes("ADMISSION_ESTIMATOR_FALLBACK"));
    expect(said).toEqual([JSON.stringify({
      kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_ESTIMATOR_FALLBACK", version: 16, cause: "PREVIEW_LINE_UP_REQUIRED"
    })]);
  });

  it("with billing on, the coarse fit estimates the ask with its version's estimator", async () => {
    const siteAsked: unknown[] = [];
    const versionAsked: number[] = [];
    const billing: AskBilling = Object.freeze({
      plans: undefined as never,
      entitlements: { current: async () => ({ planId: "PRO" as const, eventId: "55555555-5555-4555-8555-555555555555" }) },
      coarseFit: Object.freeze({
        personAllowance: { read: async () => [{ scope: "PERSON_DAY" as const, limitMicros: 10_000,
          periodStart: new Date("2026-10-22T00:00:00.000Z"), resetsAt: new Date("2026-10-23T00:00:00.000Z"),
          finishBasisPoints: 11_000, closeBasisPoints: 9_500 }] },
        spend: { readOwnerSpentMicros: async () => 0, readOwnerCountedHoldsMicros: async () => 0 },
        estimator: estimator(1_000, siteAsked),
        estimatorFor: async (version: number) => { versionAsked.push(version); return estimator(1_000); }
      }),
      clock: () => NOW
    });
    const { coarseFitFor } = await import("../../apps/api/src/ask-billing.js");
    await coarseFitFor(ask(), OWNER_REF, billing, NOW, undefined, "premium", ACTIVE);
    expect(versionAsked).toEqual([ACTIVE]);
    expect(siteAsked).toEqual([]);
  });
});

/** An application for the HTTP cases: every read answers nothing. */
function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" as const }),
    readAnswer: async () => null, readRunAnswer: async () => null, readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null, readLedgerDigest: async () => null, readNode: async () => null,
    recordInvestigation: async () => null, unlinkMemoryLink: async () => null,
    readDeployment: async () => ({ register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" } }),
    events: async function* () {}
  };
}

describe("(5) the room read and GET /v1/session answer from the active version (`admissionView`)", () => {
  async function withApi<T>(view: ReturnType<typeof vi.fn> | undefined, use: (api: ReturnType<typeof buildApi>,
    identity: ReturnType<typeof testHttpIdentity>, read: RoomQuestion[]) => Promise<T>): Promise<T> {
    const identity = testHttpIdentity("s10-admission-view");
    const read: RoomQuestion[] = [];
    const askRoom: AskRoomReader = {
      readRoom: async (question) => {
        read.push(question);
        return { room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null };
      }
    };
    // The static members are the site version's (no shape, no length, no scorecard); the view is version 18's.
    const api = buildApi({ application: fixtureApplication(), sessions: testSessionApplication([identity]),
      allowedOrigin: TEST_APP_ORIGIN, askRoom, modelScorecardInForce: false,
      ...(view === undefined ? {} : { admissionView: view as never }) });
    try {
      return await use(api, identity, read);
    } finally {
      await api.close();
    }
  }
  const QUERY = "/v1/asks/room?plan_tier=premium&composition_budget_tier=high&depth=3&depth_mode=fixed&scrutiny=deep&answer_length=short";
  const VIEW = Object.freeze({ registerVersion: ACTIVE, debateShapePolicy: debateShapePolicyStartValues(),
    lengthGuidancePolicy: lengthGuidancePolicyStartValues(), modelScorecardInForce: true });

  it("the room read normalises with the active version's shape and length rows, names its version, and says so", async () => {
    const view = vi.fn(async () => VIEW);
    await withApi(view, async (api, identity, read) => {
      const response = await api.inject({ method: "GET", url: QUERY, headers: testSessionHeaders(identity) });
      expect(response.statusCode).toBe(200);
      // Task S12: the body names the version it was read from, which the page sends back with its ask.
      expect(response.json()).toMatchObject({ shape_settings: true, length_settings: true, settings_version: ACTIVE });
      expect(read).toHaveLength(1);
      expect(read[0]).toMatchObject({ registerVersion: ACTIVE,
        settingsClass: { shape: { plan: "premium", depthMode: "fixed", scrutiny: "deep", answerLength: "short" } } });
    });
    expect(view).toHaveBeenCalledTimes(1);
  });

  it("GET /v1/session tells /new whether the active version scores its models", async () => {
    const view = vi.fn(async () => VIEW);
    await withApi(view, async (api, identity) => {
      const response = await api.inject({ method: "GET", url: "/v1/session", headers: testSessionHeaders(identity) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ model_scorecard_in_force: true });
    });
    expect(view).toHaveBeenCalledTimes(1);
  });

  it("(control) without the view, both answer from the static members, as today", async () => {
    await withApi(undefined, async (api, identity, read) => {
      const room = await api.inject({ method: "GET", url: QUERY, headers: testSessionHeaders(identity) });
      expect(room.json()).not.toHaveProperty("shape_settings");
      expect(room.json()).not.toHaveProperty("settings_version");
      expect(read[0]).not.toHaveProperty("registerVersion");
      const sessionRead = await api.inject({ method: "GET", url: "/v1/session", headers: testSessionHeaders(identity) });
      expect(sessionRead.json()).toMatchObject({ model_scorecard_in_force: false });
    });
  });
});

describe("other preview runs are priced at their own version, through the admission cache (spec §8, plan C16)", () => {
  function terms(storyRounds: number): PreviewVersionTerms {
    return Object.freeze({ roleModels: Object.freeze({ answerWriter: "m", answerChecker: "m", storyteller: null, storyChecker: null }),
      roleProviderRefs: Object.freeze([]), storyRounds,
      callOutputTokens: Object.freeze({ debate: 1, storyteller: 0, storytellerRetry: 0, storyChecker: 0 }), maxCooldownHoldsPerRun: 0 });
  }
  function versionWithGate(version: number, own: (other: number) => Promise<PreviewVersionTerms>): AdmissionVersionSettings {
    const gate: PreviewBudgetGateSettings = Object.freeze({ remaining: Object.freeze({}), ...terms(version), askProbeModelIds: [],
      readUnfinishedRuns: async () => [], termsForVersion: own });
    return Object.freeze({ registerVersion: version, previewBudgetGate: gate }) as unknown as AdmissionVersionSettings;
  }

  it("a version's gate asks the cache for another version's terms: loaded once, and its own reader is never asked", async () => {
    const ownReads: number[] = [];
    const own = async (other: number) => { ownReads.push(other); return terms(99); };
    const load = vi.fn(async (version: number) => versionWithGate(version, own));
    const cache = createAdmissionSettingsCache({ load, seed: versionWithGate(SITE, own) });
    const gate = (await cache.admissionSettingsFor(ACTIVE)).previewBudgetGate!;
    expect((await gate.termsForVersion(SITE)).storyRounds).toBe(SITE);
    expect((await gate.termsForVersion(16)).storyRounds).toBe(16);
    expect((await gate.termsForVersion(16)).storyRounds).toBe(16);
    expect((await gate.termsForVersion(ACTIVE)).storyRounds).toBe(ACTIVE);
    expect(load.mock.calls).toEqual([[ACTIVE], [16]]);
    expect(ownReads).toEqual([]);
  });

  it("a version the cache refuses rejects, so the estimate prices that debate at the asking version's own terms", async () => {
    const cache = createAdmissionSettingsCache({
      seed: versionWithGate(SITE, async () => terms(0)),
      load: async (version) => {
        if (version === 16) throw new TypedDomainError("PREVIEW_LINE_UP_REQUIRED", "PREVIEW_LINE_UP_REQUIRED");
        return versionWithGate(version, async () => terms(0));
      }
    });
    const gate = (await cache.admissionSettingsFor(SITE)).previewBudgetGate!;
    await expect(gate.termsForVersion(16)).rejects.toMatchObject({ code: "PREVIEW_LINE_UP_REQUIRED" });
    await expect(gate.termsForVersion(0)).rejects.toThrow("PREVIEW_REGISTER_VERSION_INVALID");
  });
});

describe("(5, composition) main.ts answers the pages from the active version: createAdmissionView", () => {
  function loaded(version: number, scorecard: "VALID" | "ABSENT", shape: boolean): AdmissionVersionSettings {
    return Object.freeze({
      registerVersion: version, debateShapePolicy: shape ? debateShapePolicyStartValues() : null, lengthGuidancePolicy: null,
      modelPicker: { scorecard: { state: scorecard } }, previewConfig: undefined
    }) as unknown as AdmissionVersionSettings;
  }

  it("asks the pointer per request and answers the version it names, each version's view built once", async () => {
    const answers = [ACTIVE, ACTIVE, 19];
    const load = vi.fn(async (version: number) => loaded(version, version === ACTIVE ? "VALID" : "ABSENT", version === ACTIVE));
    const view = createAdmissionView({ activeSettingsVersion: async () => answers.shift()!, admissionSettingsFor: load,
      fallback: loaded(SITE, "ABSENT", false), log: () => undefined });
    expect(await view()).toEqual({ registerVersion: ACTIVE, debateShapePolicy: debateShapePolicyStartValues(), modelScorecardInForce: true });
    await view();
    expect(await view()).toEqual({ registerVersion: 19, modelScorecardInForce: false });
    expect(load.mock.calls).toEqual([[ACTIVE], [19]]);
  });

  it("a version the cache refuses is answered from the site version, said once per version; a database failure is never thrown (F1)", async () => {
    const lines: string[] = [];
    const failure = new Error("Connection terminated unexpectedly");
    let refusal: unknown = new TypedDomainError("PREVIEW_LINE_UP_REQUIRED", "PREVIEW_LINE_UP_REQUIRED");
    const view = createAdmissionView({ activeSettingsVersion: async () => ACTIVE,
      admissionSettingsFor: async () => { throw refusal; }, fallback: loaded(SITE, "ABSENT", false), log: (line) => lines.push(line) });
    expect(await view()).toEqual({ registerVersion: SITE, modelScorecardInForce: false });
    expect(await view()).toEqual({ registerVersion: SITE, modelScorecardInForce: false });
    expect(lines).toEqual([JSON.stringify({
      kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_SETTINGS_UNSUPPORTED", version: ACTIVE, cause: "PREVIEW_LINE_UP_REQUIRED"
    })]);
    // Final fix wave F1: a database failure is answered too (no good view yet: the site version's), with its own one line.
    refusal = failure;
    expect(await view()).toEqual({ registerVersion: SITE, modelScorecardInForce: false });
    expect(lines.slice(1)).toEqual([JSON.stringify({
      kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_VIEW_FALLBACK", version: ACTIVE, cause: "UNTYPED"
    })]);
  });

  it("main.ts hands buildApi the view over the pointer's reader and the admission cache, and no static row or yes/no", () => {
    const main = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    const start = main.indexOf("const api = buildApi({");
    const call = main.slice(start, main.indexOf("\n});\n", start));
    expect(call).toContain([
      "  admissionView: createAdmissionView({",
      "    activeSettingsVersion: () => activeSettings.current(),",
      "    admissionSettingsFor: (version) => admissionCache.admissionSettingsFor(version),",
      "    fallback: siteAdmission,"
    ].join("\n"));
    for (const member of ["modelScorecardInForce:", "debateShapePolicy:", "lengthGuidancePolicy:"]) expect(call).not.toContain(member);
    // The application reads the same pointer and the same cache per ask (S9's composition).
    expect(main).toContain("activeSettingsVersion: () => activeSettings.current(),\n    admissionSettingsFor: async (version) => "
      + "admissionSettingsOfVersion(await admissionCache.admissionSettingsFor(version))");
  });
});

/**
 * Side-by-side spec §13, final fix wave F1 — A NEW ACTIVE VERSION THAT FAILS TO LOAD NEVER FAILS A PAGE READ. Plain words:
 * the sign-in check (GET /v1/session) and the /new page's room read only advise; the page treats a 500 from the session
 * read as "signed out". So when the active version's first load fails for a reason that is not a settings code (the
 * database, an untyped error), these reads answer the last version they answered well, else the site version, with one
 * content-free line per version; the failure is not kept, so the next read loads again.
 */
describe("(F1) GET /v1/session and the room read never fail because a new active version did not load", () => {
  function loaded(version: number, scorecard: "VALID" | "ABSENT"): AdmissionVersionSettings {
    return Object.freeze({ registerVersion: version, debateShapePolicy: null, lengthGuidancePolicy: null,
      modelPicker: { scorecard: { state: scorecard } }, previewConfig: undefined }) as unknown as AdmissionVersionSettings;
  }
  const DATABASE_DOWN = Object.assign(new Error("Connection terminated unexpectedly"), { code: "57P01" });

  it("answers the last good view (the version answered before the activation), once said, and loads again next time", async () => {
    const lines: string[] = [];
    let active = ACTIVE;
    let down = true;
    const load = vi.fn(async (version: number) => {
      if (version === 19 && down) throw DATABASE_DOWN;
      return loaded(version, version === ACTIVE ? "VALID" : "ABSENT");
    });
    const view = createAdmissionView({ activeSettingsVersion: async () => active, admissionSettingsFor: load,
      fallback: loaded(SITE, "ABSENT"), log: (line) => lines.push(line) });
    expect(await view()).toEqual({ registerVersion: ACTIVE, modelScorecardInForce: true });
    active = 19;
    expect(await view()).toEqual({ registerVersion: ACTIVE, modelScorecardInForce: true });
    expect(await view()).toEqual({ registerVersion: ACTIVE, modelScorecardInForce: true });
    expect(lines).toEqual([JSON.stringify({ kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_VIEW_FALLBACK", version: 19, cause: "UNTYPED" })]);
    down = false;
    expect(await view()).toEqual({ registerVersion: 19, modelScorecardInForce: false });
    expect(load.mock.calls).toEqual([[ACTIVE], [19], [19], [19]]);
  });

  it("with no good view yet, the site version's; a pointer read that fails is answered the same way, said once", async () => {
    const lines: string[] = [];
    const view = createAdmissionView({ activeSettingsVersion: async () => { throw new Error("pointer down"); },
      admissionSettingsFor: async () => loaded(ACTIVE, "VALID"), fallback: loaded(SITE, "ABSENT"), log: (line) => lines.push(line) });
    expect(await view()).toEqual({ registerVersion: SITE, modelScorecardInForce: false });
    expect(await view()).toEqual({ registerVersion: SITE, modelScorecardInForce: false });
    expect(lines).toEqual([JSON.stringify({ kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_VIEW_FALLBACK", version: null, cause: "UNTYPED" })]);
  });

  /** buildApi over main.ts's own view (`createAdmissionView`) whose active version 19 cannot be loaded: the database is down. */
  async function withFailingView<T>(use: (api: ReturnType<typeof buildApi>, identity: ReturnType<typeof testHttpIdentity>,
    read: RoomQuestion[]) => Promise<T>): Promise<T> {
    const identity = testHttpIdentity("f1-admission-view");
    const read: RoomQuestion[] = [];
    const askRoom: AskRoomReader = {
      readRoom: async (question) => {
        read.push(question);
        return { room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null };
      }
    };
    const admissionView = createAdmissionView({ activeSettingsVersion: async () => 19,
      admissionSettingsFor: async () => { throw DATABASE_DOWN; }, fallback: loaded(SITE, "ABSENT"), log: () => undefined });
    const api = buildApi({ application: fixtureApplication(), sessions: testSessionApplication([identity]),
      allowedOrigin: TEST_APP_ORIGIN, askRoom, admissionView });
    try {
      return await use(api, identity, read);
    } finally {
      await api.close();
    }
  }

  it("GET /v1/session answers 200 (the site version's yes/no), never a 500 the page would read as signed out", async () => {
    await withFailingView(async (api, identity) => {
      const response = await api.inject({ method: "GET", url: "/v1/session", headers: testSessionHeaders(identity) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ model_scorecard_in_force: false });
    });
  });

  it("GET /v1/asks/room answers 200, read from (and naming) the site version", async () => {
    await withFailingView(async (api, identity, read) => {
      const response = await api.inject({ method: "GET", url: "/v1/asks/room?plan_tier=premium&composition_budget_tier=high&depth=3",
        headers: testSessionHeaders(identity) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ room: "FITS", settings_version: SITE });
      expect(read.map((question) => question.registerVersion)).toEqual([SITE]);
    });
  });
});

describe("(2, source) the ask path reads its settings only through the one per-version binding", () => {
  const source = readFileSync(new URL("../../apps/api/src/index.ts", import.meta.url), "utf8");
  /** One method's text: from its header to the next member's doc comment. */
  function method(header: string): string {
    const start = source.indexOf(header);
    expect(start, header).toBeGreaterThan(-1);
    const end = source.indexOf("\n  /**", start);
    return source.slice(start, end === -1 ? undefined : end);
  }

  it("submit binds the version first; submit, #submitWithRoom and #readmit read no `this.settings` after it", () => {
    const submit = method("  async submit(\n");
    expect(submit.split("this.settings")).toHaveLength(2);
    // S11 (ruling R47): the binding also names whether this API could load the version (`settingsUnavailable`).
    const binding = "const { settings, settingsUnavailable } = await askSettingsOf(this.settings);";
    expect(submit).toContain(`  ): Promise<AskAccepted> {\n    // Side-by-side spec §13 (S10): the active settings version, read ONCE, first, before anything is decided; every\n`);
    expect(submit.indexOf(binding)).toBeLessThan(submit.indexOf("if (principal.kind === \"server\")"));
    for (const header of ["  async #submitWithRoom(\n", "  async #readmit(\n"]) {
      expect(method(header)).not.toContain("this.settings");
      expect(method(header)).toContain("    settings: RunCreationSettings,\n");
    }
    // #submitWithRoom is handed submit's settings: the pointer is read once per ask.
    expect(submit).toContain("this.#submitWithRoom(\n        settings, ask,");
    const readmission = method("  async #startReadmitted(\n");
    expect(readmission.split("this.settings")).toHaveLength(2);
    expect(readmission).toContain(binding);
    expect(readmission).toContain("this.#readmit(settings, run, plan, principal, lease, readmitted)");
  });
});

/**
 * Task SA6 (addition D16, D18): ON THE PREVIEW, EACH ASK IS ADMITTED ON ITS VERSION'S LINE-UP. The site version (17) and
 * the active one (18) compose different rosters over the same env gate part. Everything an ask decides from the line-up
 * — the panel frozen on its run (the roster filter), its settings class (`makerCount`), the billing coarse fit's premium
 * count and the gate's start-of-debate pricing (`assertPreviewBudgetAdmits`, handed the frozen panel) — is 18's, and the
 * room read answers with the active version's composed config (`admissionView()`). Without `admissionSettings`, the
 * site's line-up, as today.
 */
describe("(SA6) on the preview an ask is admitted on its version's line-up (addition D16, D18)", () => {
  const GLM = "zai-org/GLM-5.3-Flash";
  const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
  const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
  const QWEN = "Qwen/Qwen3.8-Flash";
  const HAIKU = "claude-haiku-5-5";
  const GATE = parsePreviewEnvironmentConfig(JSON.stringify({
    budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", deployment: "v3-preview",
    requested_thinking_level: "high", scope_id: "sa6-fixture",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock"
  }))!.gate;
  /** The site version's line-up (the env's fallback, or its row): free GLM + DeepSeek, five premium models. */
  const SITE_CONFIG: PreviewProviderTestConfig = composePreviewProviderTestConfig(GATE, parsePreviewLineUp({
    free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU], thinking_levels: null }));
  /** Version 18's own row: free GLM + Haiku, three premium models. */
  const ACTIVE_CONFIG: PreviewProviderTestConfig = composePreviewProviderTestConfig(GATE, parsePreviewLineUp({
    free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, QWEN, HAIKU], thinking_levels: null }));
  /** Each version's gate settings, told apart by identity (the pricing double records which one it was handed). */
  const SITE_GATE = Object.freeze({ gateOf: SITE }) as unknown as PreviewBudgetGateSettings;
  const ACTIVE_GATE = Object.freeze({ gateOf: ACTIVE }) as unknown as PreviewBudgetGateSettings;
  /** Every preview model answered discovery, each under its reviewed maker. */
  const PREVIEW_PANEL = Object.freeze([GLM, DEEPSEEK, MIMO, QWEN, HAIKU]
    .map((modelId, index) => member(`preview:${String(index)}`, previewModelRow(modelId)!.maker, modelId)));

  function previewArrange(input: Readonly<{ noReader?: boolean; room?: AskRoomPort; billing?: AskBilling }> = {}): Arranged {
    gatePricing.calls.length = 0;
    return arrange({
      panel: PREVIEW_PANEL,
      ...(input.noReader === true ? { noReader: true } : {}),
      ...(input.room === undefined ? {} : { room: input.room }),
      ...(input.billing === undefined ? {} : { billing: input.billing }),
      // The site's (process) members: its own composed config and gate, and the team (a process member, ruling R25).
      site: () => ({ previewProviderTestConfig: SITE_CONFIG, previewBudgetGate: SITE_GATE, previewTeamUserIds: [principal.userId] }),
      members: (version, into) => versionMembers(version, into, version === ACTIVE
        ? { previewProviderTestConfig: ACTIVE_CONFIG, previewBudgetGate: ACTIVE_GATE } : {})
    });
  }

  /** Billing on, a PLUS person with room to spare; the coarse fit's estimate records the class it is asked for. */
  function plusBilling(asked: Array<Readonly<{ version: number | null; makerCount: number }>>): AskBilling {
    const recording = (version: number | null): CostEstimator => ({
      estimateMicros: async (settingsClass) => { asked.push(Object.freeze({ version, makerCount: settingsClass.makerCount })); return 1_000; }
    });
    return Object.freeze({
      plans: billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef),
      entitlements: { current: async () => ({ planId: "PLUS" as const, eventId: "55555555-5555-4555-8555-555555555555" }) },
      coarseFit: Object.freeze({
        personAllowance: { read: async () => [{ scope: "PERSON_DAY" as const, limitMicros: 1_000_000,
          periodStart: new Date("2026-10-22T00:00:00.000Z"), resetsAt: new Date("2026-10-23T00:00:00.000Z"),
          finishBasisPoints: 11_000, closeBasisPoints: 9_500 }] },
        spend: { readOwnerSpentMicros: async () => 0, readOwnerCountedHoldsMicros: async () => 0 },
        estimator: recording(null),
        estimatorFor: async (version: number) => recording(version)
      }),
      clock: () => NOW
    });
  }

  it("a Free ask's panel is filtered by 18's roster, and the gate prices exactly that frozen panel with 18's gate", async () => {
    const { application, started } = previewArrange();
    await application.submit(ask({ plan_tier: "free" }), session, principal);
    expect(started[0]!.registerVersion).toBe(ACTIVE);
    expect(started[0]!.discoveredPanel.map((entry) => entry.model_id)).toEqual([GLM, HAIKU]);
    expect(gatePricing.calls).toEqual([{ gate: ACTIVE_GATE, panel: [GLM, HAIKU] }]);
  });

  it("its settings class counts 18's roster (the room's precheck and locked decision)", async () => {
    const { room, questions } = recordingRoom();
    const { application, started } = previewArrange({ room });
    await application.submit(ask({ plan_tier: "premium" }), session, principal);
    expect(questions.map((question) => [question.registerVersion, question.settingsClass.makerCount]))
      .toEqual([[ACTIVE, 3], [ACTIVE, 3]]);
    expect(started[0]!.discoveredPanel.map((entry) => entry.model_id)).toEqual([GLM, QWEN, HAIKU]);
    expect(gatePricing.calls).toEqual([{ gate: ACTIVE_GATE, panel: [GLM, QWEN, HAIKU] }]);
  });

  it("with billing on, the coarse fit counts 18's premium roster, with 18's estimator", async () => {
    const asked: Array<Readonly<{ version: number | null; makerCount: number }>> = [];
    const { application, started } = previewArrange({ billing: plusBilling(asked) });
    await application.submit(ask({ plan_tier: "premium" }), session, principal);
    expect(asked).toEqual([{ version: ACTIVE, makerCount: 3 }]);
    expect(started[0]).toMatchObject({ planTier: "premium", registerVersion: ACTIVE });
    expect(started[0]!.discoveredPanel.map((entry) => entry.model_id)).toEqual([GLM, QWEN, HAIKU]);
  });

  it("(control) without the reader, the site's line-up decides all four, as today", async () => {
    const { room, questions } = recordingRoom();
    const roomed = previewArrange({ noReader: true, room });
    await roomed.application.submit(ask({ plan_tier: "premium" }), session, principal);
    expect(questions.map((question) => question.settingsClass.makerCount)).toEqual([5, 5]);
    expect(roomed.started[0]!.registerVersion).toBe(SITE);
    expect(gatePricing.calls).toEqual([{ gate: SITE_GATE, panel: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU] }]);
    const free = previewArrange({ noReader: true });
    await free.application.submit(ask({ plan_tier: "free" }), session, principal);
    expect(free.started[0]!.discoveredPanel.map((entry) => entry.model_id)).toEqual([GLM, DEEPSEEK]);
    expect(gatePricing.calls).toEqual([{ gate: SITE_GATE, panel: [GLM, DEEPSEEK] }]);
    const asked: Array<Readonly<{ version: number | null; makerCount: number }>> = [];
    const billed = previewArrange({ noReader: true, billing: plusBilling(asked) });
    await billed.application.submit(ask({ plan_tier: "premium" }), session, principal);
    expect(asked).toEqual([{ version: SITE, makerCount: 5 }]);
  });

  async function roomRead(view: (() => Promise<unknown>) | undefined): Promise<RoomQuestion[]> {
    const identity = testHttpIdentity("sa6-room-read");
    const read: RoomQuestion[] = [];
    const askRoom: AskRoomReader = {
      readRoom: async (question) => {
        read.push(question);
        return { room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null };
      }
    };
    // The static member is the site version's composed config (main.ts's default); the view is the active version's.
    const api = buildApi({ application: fixtureApplication(), sessions: testSessionApplication([identity]),
      allowedOrigin: TEST_APP_ORIGIN, askRoom, previewProviderTestConfig: SITE_CONFIG,
      previewTeamUserIds: [identity.authenticated.userId], ...(view === undefined ? {} : { admissionView: view as never }) });
    try {
      const response = await api.inject({ method: "GET", headers: testSessionHeaders(identity),
        url: "/v1/asks/room?plan_tier=premium&composition_budget_tier=high&depth=3" });
      expect(response.statusCode).toBe(200);
    } finally {
      await api.close();
    }
    return read;
  }

  it("the room read's class counts the active version's roster, from admissionView()'s composed config", async () => {
    const view = vi.fn(async () => Object.freeze({ registerVersion: ACTIVE, modelScorecardInForce: false,
      previewProviderTestConfig: ACTIVE_CONFIG }));
    const read = await roomRead(view);
    expect(read.map((question) => [question.registerVersion, question.settingsClass.makerCount])).toEqual([[ACTIVE, 3]]);
    expect(view).toHaveBeenCalledTimes(1);
  });

  it("main.ts's view carries each version's composed config: the active one's, and the site's when it falls back", async () => {
    const loaded = (version: number, previewConfig: PreviewProviderTestConfig) => Object.freeze({ registerVersion: version,
      debateShapePolicy: null, lengthGuidancePolicy: null, modelPicker: { scorecard: { state: "ABSENT" } }, previewConfig
    }) as unknown as AdmissionVersionSettings;
    let refuse = false;
    const view = createAdmissionView({ activeSettingsVersion: async () => (refuse ? 19 : ACTIVE),
      admissionSettingsFor: async (version) => {
        if (refuse) throw new TypedDomainError("PREVIEW_LINE_UP_REQUIRED", "PREVIEW_LINE_UP_REQUIRED");
        return loaded(version, ACTIVE_CONFIG);
      },
      fallback: loaded(SITE, SITE_CONFIG), log: () => undefined });
    expect((await view()).previewProviderTestConfig).toBe(ACTIVE_CONFIG);
    refuse = true;
    expect(await view()).toMatchObject({ registerVersion: SITE, previewProviderTestConfig: SITE_CONFIG });
  });

  it("(control) without the view, the room read counts the static (site) config's roster, as today", async () => {
    const read = await roomRead(undefined);
    expect(read.map((question) => question.settingsClass.makerCount)).toEqual([5]);
    expect(read[0]).not.toHaveProperty("registerVersion");
  });

  /**
   * Task SA7 part A (addition D24): the room read also names the line-up of the version it was read from
   * (`preview_rosters`), taken from the same composed config its class counts, so the list /new shows and the class can
   * never disagree. Off the preview (no composed config) the member is never written: today's body, byte for byte.
   */
  async function roomBody(input: Readonly<{ view?: () => Promise<unknown>; staticConfig?: PreviewProviderTestConfig;
    funding?: boolean }>): Promise<Record<string, unknown>> {
    const identity = testHttpIdentity("sa7a-room-read");
    const askRoom: AskRoomReader = {
      readRoom: async () => ({ room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null,
        ...(input.funding === true ? { funding: { kind: "INTERNAL" as const, expiresAt: new Date("2026-10-23T00:00:00.000Z") } } : {}) })
    };
    const api = buildApi({ application: fixtureApplication(), sessions: testSessionApplication([identity]),
      allowedOrigin: TEST_APP_ORIGIN, askRoom,
      ...(input.staticConfig === undefined ? {} : { previewProviderTestConfig: input.staticConfig,
        previewTeamUserIds: [identity.authenticated.userId] }),
      ...(input.view === undefined ? {} : { admissionView: input.view as never }) });
    try {
      const response = await api.inject({ method: "GET", headers: testSessionHeaders(identity),
        url: "/v1/asks/room?plan_tier=premium&composition_budget_tier=high&depth=3" });
      expect(response.statusCode).toBe(200);
      return response.json() as Record<string, unknown>;
    } finally {
      await api.close();
    }
  }

  it("(SA7A) the room read names the active version's rosters beside its version, from admissionView()'s config", async () => {
    const view = vi.fn(async () => Object.freeze({ registerVersion: ACTIVE, modelScorecardInForce: false,
      previewProviderTestConfig: ACTIVE_CONFIG }));
    const body = await roomBody({ view, staticConfig: SITE_CONFIG });
    expect(body.settings_version).toBe(ACTIVE);
    expect(body.preview_rosters).toEqual({ free: [GLM, HAIKU], premium: [GLM, QWEN, HAIKU] });
    expect(view).toHaveBeenCalledTimes(1);
  });

  it("(SA7A) an internal-funded room read (the second schema) names them too", async () => {
    const view = vi.fn(async () => Object.freeze({ registerVersion: ACTIVE, modelScorecardInForce: false,
      previewProviderTestConfig: ACTIVE_CONFIG }));
    const body = await roomBody({ view, staticConfig: SITE_CONFIG, funding: true });
    expect(body.funding).toMatchObject({ kind: "INTERNAL" });
    expect(body.preview_rosters).toEqual({ free: [GLM, HAIKU], premium: [GLM, QWEN, HAIKU] });
  });

  it("(SA7A) without the view, the static (site) config's rosters, as the class counts them", async () => {
    const body = await roomBody({ staticConfig: SITE_CONFIG });
    expect(body).not.toHaveProperty("settings_version");
    expect(body.preview_rosters).toEqual({ free: [GLM, DEEPSEEK], premium: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU] });
  });

  it("(SA7A) off the preview the member is never written: today's body, byte for byte", async () => {
    const view = vi.fn(async () => Object.freeze({ registerVersion: ACTIVE, modelScorecardInForce: false }));
    expect(await roomBody({ view })).toEqual({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null,
      settings_version: ACTIVE });
    expect(await roomBody({})).toEqual({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null });
  });

  it("(SA7A) the contract stays additive: the member is optional in both room-read schemas, strict when present", () => {
    const fits = Object.freeze({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null });
    const internal = Object.freeze({ ...fits, funding: { kind: "INTERNAL", expires_at: "2026-10-23T00:00:00.000Z" } });
    const rosters = Object.freeze({ free: [GLM], premium: [GLM, QWEN] });
    for (const body of [fits, internal]) {
      // An older API's answer (no member) is read unchanged, and the new member is read as written.
      expect(AskRoomResponseSchema.parse(body)).toEqual(body);
      expect(AskRoomResponseSchema.parse({ ...body, preview_rosters: rosters })).toEqual({ ...body, preview_rosters: rosters });
      for (const bad of [{ free: [GLM] }, { free: [], premium: [GLM] }, { free: [GLM], premium: [GLM], extra: [GLM] },
        { free: [""], premium: [GLM] }, { free: GLM, premium: [GLM] }]) {
        expect(AskRoomResponseSchema.safeParse({ ...body, preview_rosters: bad }).success).toBe(false);
      }
    }
  });
});

/**
 * Task S11 (side-by-side spec §13 "The API re-checks at admission") — THE ADMISSION RE-CHECK ALSO NEEDS A PASSED
 * SETTINGS VERSION. Plain words: the moment an ask would start, the API asks the database once more whether its own
 * release has passed the settings version the ask was admitted on. If not (an ask caught across an activation, a switch
 * or the 1 s pointer cache), the ask is not started: with a room it waits in line ("switching"), with no charge, no
 * hold and no error to the person; on the direct path (no room, no line) it gets the plain "try again in a minute"
 * (ruling R47). A version this API cannot load is treated the same way.
 */
describe("(S11) the admission re-check also needs a passed settings version (side-by-side spec §13)", () => {
  const PASSED_SQL = "SELECT register.settings_version_passed($1::text, $2::bigint) AS passed";
  const RELEASE = testReleaseKey(SITE);
  const OTHER_RELEASE = testReleaseKey(16);
  const CLASS = Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 });
  const ACCESS = Object.freeze({ ownerRef: null, legacyAskerId: "legacy:s11" });

  /** A decision's transaction for the real gate: the release table names `current` (none when null), the re-check answers `passed`. */
  function gateTx(input: Readonly<{ current?: string | null; passed?: unknown }> = {}) {
    const asked: string[] = [];
    const values: unknown[] = [];
    const tx = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("core.read_current_release()")) {
          asked.push("release");
          const current = input.current ?? null;
          return { rows: current === null ? [] : [{ release_key: current, take_traffic_from: NOW }] };
        }
        asked.push(sql);
        values.push(params);
        return { rows: [{ passed: "passed" in input ? input.passed : true }] };
      })
    } as unknown as PoolClient;
    return { tx, asked, values };
  }

  it("the gate: after the release read, ONE query on the same transaction, the plan's text with (RELEASE_KEY, the version)", async () => {
    const gate = new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: false });
    const open = gateTx({ passed: true });
    expect(await gate.ownReleaseIsCurrent(open.tx, ACTIVE)).toBe(true);
    expect(open.asked).toEqual(["release", PASSED_SQL]);
    expect(open.values).toEqual([[RELEASE, ACTIVE]]);
    const closed = gateTx({ current: RELEASE, passed: false });
    expect(await gate.ownReleaseIsCurrent(closed.tx, ACTIVE)).toBe(false);
    expect(closed.asked).toEqual(["release", PASSED_SQL]);
  });

  it("the gate: a release that is not current is not asked about its version; without a version, the release alone (Phase 1)", async () => {
    const gate = new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: false });
    const other = gateTx({ current: OTHER_RELEASE });
    expect(await gate.ownReleaseIsCurrent(other.tx, ACTIVE)).toBe(false);
    expect(other.asked).toEqual(["release"]);
    const hostedNone = gateTx();
    expect(await new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: true }).ownReleaseIsCurrent(hostedNone.tx, ACTIVE)).toBe(false);
    expect(hostedNone.asked).toEqual(["release"]);
    const noVersion = gateTx({ passed: false });
    expect(await gate.ownReleaseIsCurrent(noVersion.tx)).toBe(true);
    expect(noVersion.asked).toEqual(["release"]);
  });

  it("the gate: an answer that is not a boolean is never guessed", async () => {
    const gate = new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: false });
    await expect(gate.ownReleaseIsCurrent(gateTx({ passed: null }).tx, ACTIVE)).rejects.toThrow("ASK_ADMISSION_GATE_SETTINGS_INVALID");
    await expect(gate.ownReleaseIsCurrent(gateTx({ passed: "t" }).tx, ACTIVE)).rejects.toThrow("ASK_ADMISSION_GATE_SETTINGS_INVALID");
  });

  /** A room with a gate that records each question (on the decision's own transaction? which version?). */
  function gatedRoom(input: Readonly<{ passed?: (version: number) => boolean; line?: readonly WaitingRun[] }> = {}) {
    const asked: Array<Readonly<{ onTx: boolean; version: number | undefined }>> = [];
    const holds: string[] = [];
    const reasons: Array<Readonly<{ runId: string; waitsFor: string }>> = [];
    const entered: string[] = [];
    const started: string[] = [];
    const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
    const gate: AskAdmissionGate = {
      releaseKey: RELEASE,
      siteConcurrentDebates: 8,
      ownReleaseIsCurrent: async (executor, version) => {
        asked.push(Object.freeze({ onTx: executor === (client as unknown), version }));
        return version === undefined || (input.passed?.(version) ?? true);
      },
      activeDebates: async () => 0
    };
    const spend: AskRoomSpend = {
      readDaySpentMicros: async () => 0, readSiteCountedHoldsMicros: async () => 0, readOwnerSpentMicros: async () => 0,
      readOwnerCountedHoldsMicros: async () => 0, openHold: async (_client, hold) => { holds.push(hold.runId); }
    };
    const line: AskRoomLine = {
      siteLineBlocking: async () => false, wakeCandidates: async () => [], waitingForOwner: async () => [],
      waitingForLegacyAsker: async () => [],
      readWaiting: async (runId) => (input.line ?? []).find((run) => run.runId === runId) ?? null,
      isWaiting: async (_executor, runId) => (input.line ?? []).some((run) => run.runId === runId),
      enterWait: async (_client, runId) => { entered.push(runId); },
      recordReason: async (_client, runId, reason) => { reasons.push(Object.freeze({ runId, waitsFor: reason.waitsFor })); },
      markStarted: async (_client, runId) => { started.push(runId); }
    };
    const room = new AskRoom({
      lockPool: { connect: vi.fn(async () => client) } as unknown as Pool,
      spend, line, estimator: estimator(1_000), personAllowance: { read: async () => [] }, entitlements: null,
      dailyCeilingMicros: 100_000, closeBasisPoints: 9_500, waitingLinePerPerson: 1, clock: () => NOW, gate
    });
    return { room, asked, holds, reasons, entered, started };
  }

  function waiting(extra: Partial<WaitingRun> = {}): WaitingRun {
    return Object.freeze({ runId: randomUUID(), waitingSince: new Date("2026-10-22T11:00:00.000Z"), releaseKey: RELEASE,
      ownerRef: null, legacyAskerId: "legacy:s11", planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 2,
      waitsFor: "SITE", personRecheckAt: null, reasonAt: new Date("2026-10-22T11:00:00.000Z"), ...extra });
  }

  it("the locked decision asks the gate ONCE, on its own transaction, with the question's version; not passed → WAIT SWITCHING", async () => {
    const { room, asked, holds, reasons } = gatedRoom({ passed: (version) => version !== ACTIVE });
    const question = Object.freeze({ access: ACCESS, settingsClass: CLASS, registerVersion: ACTIVE });
    await room.precheck(question);
    expect(asked).toEqual([]);
    const admission = await room.decide(question, async ({ admission, tx }) => {
      await room.enterWait(tx, RUN_ID, NOW);
      return admission;
    });
    expect(admission).toMatchObject({ kind: "WAIT", cause: "SWITCHING" });
    expect(asked).toEqual([{ onTx: true, version: ACTIVE }]);
    expect(reasons).toEqual([{ runId: RUN_ID, waitsFor: "SWITCHING" }]);
    expect(holds).toEqual([]);
  });

  it("a passed version decides as before (START), with the same one question", async () => {
    const { room, asked } = gatedRoom();
    const admission = await room.decide(Object.freeze({ access: ACCESS, settingsClass: CLASS, registerVersion: ACTIVE }),
      async ({ admission }) => admission);
    expect(admission.kind).toBe("START");
    expect(asked).toEqual([{ onTx: true, version: ACTIVE }]);
  });

  it("the waker's start: a run of this release on a version it has not passed starts nothing and writes nothing (SWITCHING)", async () => {
    const unpassed = waiting({ registerVersion: ACTIVE });
    const own = waiting({ registerVersion: SITE });
    const { room, asked, holds, reasons, started } = gatedRoom({ passed: (version) => version !== ACTIVE, line: [unpassed, own] });
    await expect(room.startWaiting(unpassed, async () => "job")).resolves.toEqual({ kind: "SWITCHING" });
    expect(asked).toEqual([{ onTx: true, version: ACTIVE }]);
    expect(holds).toEqual([]);
    expect(reasons).toEqual([]);
    expect(started).toEqual([]);
    await expect(room.startWaiting(own, async () => "job")).resolves.toMatchObject({ kind: "STARTED", runId: own.runId });
    expect(asked).toEqual([{ onTx: true, version: ACTIVE }, { onTx: true, version: SITE }]);
  });

  it("another release's run: phase one asks the release alone; its re-admission's START asks the new run's version", async () => {
    const stale = waiting({ releaseKey: OTHER_RELEASE, registerVersion: 16 });
    const { room, asked, holds } = gatedRoom({ passed: (version) => version !== ACTIVE, line: [stale] });
    await expect(room.startWaiting(stale, async () => "job")).resolves.toMatchObject({ kind: "NEEDS_READMISSION" });
    expect(asked).toEqual([{ onTx: true, version: undefined }]);
    const createRun = vi.fn(async () => "new-run");
    const readmission: Readmission = {
      plan: { kind: "READMIT", planId: null, holdMicros: 1_000, settingsClass: CLASS } as unknown as Readmission["plan"],
      createRun,
      registerVersion: ACTIVE
    };
    await expect(room.startWaiting(stale, async () => "job", readmission)).resolves.toEqual({ kind: "SWITCHING" });
    expect(asked).toEqual([{ onTx: true, version: undefined }, { onTx: true, version: ACTIVE }]);
    expect(createRun).not.toHaveBeenCalled();
    expect(holds).toEqual([]);
  });

  it("through the room: an ask on a version this release has not passed waits in line (SWITCHING): stamped, no hold, no error", async () => {
    const gated = gatedRoom({ passed: (version) => version !== ACTIVE });
    const { application, started, settingsAsked } = arrange({ room: gated.room });
    const accepted = await application.submit(ask(), session, principal);
    expect(accepted).toMatchObject({ run_ref: RUN_ID, status: "WAITING" });
    expect(started).toHaveLength(1);
    expect(started[0]!.registerVersion).toBe(ACTIVE);
    expect(gated.asked).toEqual([{ onTx: true, version: ACTIVE }]);
    expect(gated.entered).toEqual([RUN_ID]);
    expect(gated.reasons).toEqual([{ runId: RUN_ID, waitsFor: "SWITCHING" }]);
    expect(gated.holds).toEqual([]);
    expect(vi.mocked(WorkItemRepository.prototype.enqueueOn)).not.toHaveBeenCalled();
    // The room's transaction asked; the direct path's query is not asked on the room path.
    expect(settingsAsked).toEqual([]);
  });

  it("(S8b) the waiting journal line names the hold that alone decided the wait (SWITCHING), not the day's scope", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const gated = gatedRoom({ passed: (version) => version !== ACTIVE });
    const { application } = arrange({ room: gated.room });
    await expect(application.submit(ask(), session, principal)).resolves.toMatchObject({ status: "WAITING" });
    const waiting = info.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
      .filter((line) => line.event === "api.ask.waiting");
    expect(waiting).toEqual([{ event: "api.ask.waiting", runId: RUN_ID, cause: "SWITCHING" }]);
  });

  it("through the room: a passed version is unchanged: QUEUED, its hold opened and its first job queued", async () => {
    const gated = gatedRoom();
    const { application } = arrange({ room: gated.room });
    await expect(application.submit(ask(), session, principal)).resolves.toMatchObject({ run_ref: RUN_ID, status: "QUEUED" });
    expect(gated.asked).toEqual([{ onTx: true, version: ACTIVE }]);
    expect(gated.holds).toEqual([RUN_ID]);
    expect(gated.reasons).toEqual([]);
  });

  it("through the room: a version this API cannot load waits in line too (ruling R47): on the site version, SWITCHING, no error", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const gated = gatedRoom();
    const { application, started, used } = arrange({
      room: gated.room, refuse: () => new TypedDomainError("PREVIEW_LINE_UP_REQUIRED", "PREVIEW_LINE_UP_REQUIRED")
    });
    await expect(application.submit(ask(), session, principal)).resolves.toMatchObject({ run_ref: RUN_ID, status: "WAITING" });
    expect(started[0]!.registerVersion).toBe(SITE);
    expect(gated.reasons).toEqual([{ runId: RUN_ID, waitsFor: "SWITCHING" }]);
    expect(gated.holds).toEqual([]);
    // Held without asking: the version it could not load is not the one it was evaluated on.
    expect(gated.asked).toEqual([]);
    expect(used.filter((part) => part.endsWith(`:${String(ACTIVE)}`))).toEqual([`members:${String(ACTIVE)}`]);
    expect(errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes("ADMISSION_SETTINGS_UNSUPPORTED"))).toEqual([
      JSON.stringify({ kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_SETTINGS_UNSUPPORTED", version: ACTIVE, cause: "PREVIEW_LINE_UP_REQUIRED" })
    ]);
  });

  it("the direct path (no room, no line): not passed → the plain 'try again in a minute', nothing written, one line (ruling R47)", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { application, started, memory, settingsAsked } = arrange({ passed: false });
    await expect(application.submit(ask(), session, principal)).rejects.toMatchObject({
      name: "AskRefusal", code: "ASK_MODEL_CANDIDATE_UNAVAILABLE", retryAt: expect.any(Date)
    });
    expect(settingsAsked).toEqual([[PASSED_SQL, [RELEASE, ACTIVE]]]);
    expect(started).toEqual([]);
    expect(memory).toEqual([]);
    expect(vi.mocked(WorkItemRepository.prototype.enqueue)).not.toHaveBeenCalled();
    expect(errors.mock.calls.map(([line]) => String(line))).toContainEqual(JSON.stringify({
      kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_SETTINGS_NOT_PASSED", version: ACTIVE
    }));
  });

  it("the direct path: a passed version is admitted as before; the one query runs once, before any provider probe (S3)", async () => {
    const { application, started, settingsAsked, used } = arrange();
    await expect(application.submit(ask(), session, principal)).resolves.toMatchObject({ run_ref: RUN_ID, status: "QUEUED" });
    expect(settingsAsked).toEqual([[PASSED_SQL, [RELEASE, ACTIVE]]]);
    // Final fix wave S3: next to the cannot-load refusal, so a refused ask never paid for a probe.
    expect(used.indexOf("passed?")).toBeGreaterThan(used.indexOf(`members:${String(ACTIVE)}`));
    expect(used.indexOf("passed?")).toBeLessThan(used.indexOf("discovery"));
    expect(used.indexOf("passed?")).toBeLessThan(used.indexOf("startRun"));
    expect(started[0]!.registerVersion).toBe(ACTIVE);
  });

  it("(S3) the direct path: not passed is refused before any provider probe, admission step or reservation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { application, used } = arrange({ passed: false });
    await expect(application.submit(ask(), session, principal)).rejects.toMatchObject({ name: "AskRefusal", retryAt: expect.any(Date) });
    expect(used).toEqual(["pointer", `members:${String(ACTIVE)}`, "passed?"]);
  });

  it("(F2b) the direct path: not passed also says the alarm line, through the process's once-a-minute alarm", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const alarm = vi.fn(() => true);
    const { application } = arrange({ passed: false, site: () => ({ activeVersionAlarm: alarm }) });
    await expect(application.submit(ask(), session, principal)).rejects.toMatchObject({ name: "AskRefusal" });
    expect(alarm.mock.calls).toEqual([[ACTIVE, "NOT_PASSED"]]);
  });

  it("(F2b) a version this API cannot load says UNSUPPORTED: refused on the direct path, waiting SWITCHING through the room", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const refuse = () => new TypedDomainError("PREVIEW_LINE_UP_REQUIRED", "PREVIEW_LINE_UP_REQUIRED");
    const direct = vi.fn(() => true);
    await expect(arrange({ refuse, site: () => ({ activeVersionAlarm: direct }) }).application.submit(ask(), session, principal))
      .rejects.toMatchObject({ name: "AskRefusal" });
    expect(direct.mock.calls).toEqual([[ACTIVE, "UNSUPPORTED"]]);
    const roomed = vi.fn(() => true);
    const gated = gatedRoom();
    await expect(arrange({ refuse, room: gated.room, site: () => ({ activeVersionAlarm: roomed }) }).application.submit(ask(), session, principal))
      .resolves.toMatchObject({ status: "WAITING" });
    expect(roomed.mock.calls).toEqual([[ACTIVE, "UNSUPPORTED"]]);
  });

  it("(F2b) the real gate: a CURRENT release that has not passed the version says NOT_PASSED; a staged one, or a passed version, nothing", async () => {
    const alarm = vi.fn(() => true);
    const gate = new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: false, alarm });
    expect(await gate.ownReleaseIsCurrent(gateTx({ current: RELEASE, passed: false }).tx, ACTIVE)).toBe(false);
    expect(alarm.mock.calls).toEqual([[ACTIVE, "NOT_PASSED"]]);
    expect(await gate.ownReleaseIsCurrent(gateTx({ current: OTHER_RELEASE, passed: false }).tx, ACTIVE)).toBe(false);
    expect(await gate.ownReleaseIsCurrent(gateTx({ current: RELEASE, passed: true }).tx, ACTIVE)).toBe(true);
    expect(await gate.ownReleaseIsCurrent(gateTx({ current: RELEASE, passed: false }).tx)).toBe(true);
    expect(alarm).toHaveBeenCalledTimes(1);
  });

  it("the direct path without the reader asks nothing: the site version, which its own release always passes (D1)", async () => {
    const { application, settingsAsked } = arrange({ noReader: true });
    await expect(application.submit(ask(), session, principal)).resolves.toMatchObject({ status: "QUEUED" });
    expect(settingsAsked).toEqual([]);
  });
});

/**
 * Side-by-side spec §13 (Task S12) — "PLEASE CHOOSE AGAIN". Plain words: the /new page offered the person's choices as
 * the version its room read named, and sends that version back with the ask. If the owners switched the active version
 * in between and the new one no longer offers one of those choices, the ask is refused 409 ASK_SETTINGS_CHANGED before
 * anything is decided (no fast language call, no billing read of the ask, no room line, nothing written or charged); the
 * page reads the room again and says so in one sentence. An ask whose choices are all still offered is admitted on the
 * new version as usual; an ask that names no version (an older page) is normalised silently, as today.
 */
describe("(S12) an ask whose choices the active version no longer offers is asked to choose again", () => {
  const SHAPED = Object.freeze({ depth: 2, depthMode: "fixed" as const, scrutiny: "deep" as const, answerLength: "short" as const });
  /** The site (17) has the shape and length rows; 18 has neither (its members carry none). */
  const shapedSite = () => ({ debateShapePolicy: debateShapePolicyStartValues(), lengthGuidancePolicy: lengthGuidancePolicyStartValues() });

  function refusedUntouched(arranged: Arranged): void {
    expect(arranged.started).toEqual([]);
    expect(arranged.memory).toEqual([]);
    expect(arranged.used).not.toContain("discovery");
    // Final fix wave S3: the direct path's one read-only "has this release passed it?" query now runs first, beside the
    // cannot-load refusal (before this check) on the direct path; it writes nothing, and nothing else is asked.
    // (Through the room the question is the room's own, on its transaction: none here.)
    expect(arranged.settingsAsked.length).toBeLessThanOrEqual(1);
    for (const [sql] of arranged.settingsAsked) expect(sql).toBe("SELECT register.settings_version_passed($1::text, $2::bigint) AS passed");
    expect(vi.mocked(WorkItemRepository.prototype.enqueue)).not.toHaveBeenCalled();
    expect(vi.mocked(WorkItemRepository.prototype.enqueueOn)).not.toHaveBeenCalled();
  }

  it("17's shaped choices under 18 (no shape row): 409 ASK_SETTINGS_CHANGED, nothing written, decided or charged", async () => {
    const arranged = arrange({ site: shapedSite });
    await expect(arranged.application.submit(ask({ depth_params: SHAPED, settings_version: SITE }), session, principal))
      .rejects.toMatchObject({ name: "AskRefusal", code: "ASK_SETTINGS_CHANGED", message: "ASK_SETTINGS_CHANGED" });
    refusedUntouched(arranged);
    expect(askRefusalStatus("ASK_SETTINGS_CHANGED")).toBe(409);
  });

  it("is refused before the question-language decider (a fast AI call) and before the room: no line row", async () => {
    // 18 has the shape row, but its premium plan no longer offers a fixed depth; its decider would be asked next.
    const start = debateShapePolicyStartValues();
    const noFixed = Object.freeze({ ...start, plans: Object.freeze({ ...start.plans,
      premium: Object.freeze({ ...start.plans.premium, fixedDepthAllowed: false }) }) });
    const decide = vi.fn(async () => null);
    const { room, questions } = recordingRoom();
    const arranged = arrange({ room, site: shapedSite, members: (version, into) => versionMembers(version, into,
      version === ACTIVE ? { debateShapePolicy: noFixed, questionLanguage: { decide } as never } : {}) });
    await expect(arranged.application.submit(ask({ depth_params: SHAPED, settings_version: SITE }), session, principal))
      .rejects.toMatchObject({ code: "ASK_SETTINGS_CHANGED" });
    expect(decide).not.toHaveBeenCalled();
    expect(questions).toEqual([]);
    refusedUntouched(arranged);
  });

  it("a model strength while 18 scores no models (17 did): 409, nothing written", async () => {
    const arranged = arrange({ site: () => ({ modelPicker: VALID_PICKER }) });
    await expect(arranged.application.submit(ask({ model_strength: "BEST", settings_version: SITE }), session, principal))
      .rejects.toMatchObject({ code: "ASK_SETTINGS_CHANGED" });
    refusedUntouched(arranged);
  });

  it("with billing on, the person's own plan key decides (PRO without a fixed depth refuses what premium would keep)", async () => {
    const start = debateShapePolicyStartValues();
    const proNoFixed = Object.freeze({ ...start, plans: Object.freeze({ ...start.plans,
      pro: Object.freeze({ ...start.plans.pro, fixedDepthAllowed: false }) }) });
    const coarse = vi.fn();
    const billing: AskBilling = Object.freeze({
      plans: billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef),
      entitlements: { current: async () => ({ planId: "PRO" as const, eventId: "55555555-5555-4555-8555-555555555555" }) },
      coarseFit: Object.freeze({ personAllowance: { read: async () => { coarse(); return []; } },
        spend: { readOwnerSpentMicros: async () => 0, readOwnerCountedHoldsMicros: async () => 0 }, estimator: estimator(1_000) }),
      clock: () => NOW
    });
    const arranged = arrange({ billing, site: shapedSite, members: (version, into) => versionMembers(version, into,
      version === ACTIVE ? { debateShapePolicy: proNoFixed } : {}) });
    await expect(arranged.application.submit(ask({ depth_params: SHAPED, settings_version: SITE }), session, principal))
      .rejects.toMatchObject({ code: "ASK_SETTINGS_CHANGED" });
    expect(coarse).not.toHaveBeenCalled();
    refusedUntouched(arranged);
  });

  it("the common case: 17 and 18 share their shape and length rows (18 changed something else): all four choices admitted", async () => {
    const rows = () => ({ debateShapePolicy: debateShapePolicyStartValues(), lengthGuidancePolicy: lengthGuidancePolicyStartValues() });
    const { application, started } = arrange({ site: rows, members: (version, into) => versionMembers(version, into, rows()) });
    await expect(application.submit(ask({ depth_params: SHAPED, settings_version: SITE }), session, principal))
      .resolves.toMatchObject({ run_ref: RUN_ID, status: "QUEUED" });
    expect(started[0]!.registerVersion).toBe(ACTIVE);
    expect(started[0]!.depthParams).toEqual(SHAPED);
  });

  it("the same version's choices all still offered under 18: admitted on 18 as usual (a new default is kept)", async () => {
    // 17 had no rows; 18 has the shape row, which adds its defaults to the person's `{ depth }`.
    const { application, started } = arrange({ members: (version, into) => versionMembers(version, into,
      version === ACTIVE ? { debateShapePolicy: debateShapePolicyStartValues() } : {}) });
    await expect(application.submit(ask({ depth_params: { depth: 2 }, settings_version: SITE }), session, principal))
      .resolves.toMatchObject({ run_ref: RUN_ID, status: "QUEUED" });
    expect(started[0]!.registerVersion).toBe(ACTIVE);
    expect(started[0]!.depthParams).toMatchObject({ depth: 2 });
  });

  it("an ask naming no version (an older page), or the active one: today's silent normalisation, unchanged", async () => {
    for (const named of [{}, { settings_version: ACTIVE }]) {
      const { application, started } = arrange({ site: shapedSite });
      await expect(application.submit(ask({ depth_params: SHAPED, ...named }), session, principal))
        .resolves.toMatchObject({ status: "QUEUED" });
      expect(started[0]!.depthParams).toEqual({ depth: 2 });
      expect(started[0]!.registerVersion).toBe(ACTIVE);
      vi.restoreAllMocks();
    }
  });
});

/**
 * Side-by-side spec §13 (C14, Task S13) — A WAITING DEBATE STARTED AFTER AN ACTIVATION IS RE-ADMITTED ON THE ACTIVE
 * VERSION. Plain words: a debate that waited in line while the owners switched the settings version starts on the new
 * version, never on the one it was admitted on. Which version is active is read on the very transaction that starts it
 * (never at a tick, never from a cache), and a run stamped with another version takes Phase 1's re-admission path: a
 * new run, stamped with the active version, its receipt and estimate from that version's settings, the hold on the new
 * run; a choice the active version no longer offers is "please ask again", with nothing charged. A room that is still
 * closed touches nothing, and a person never has two places in line.
 */
describe("(S13) a waiting debate started after an activation is re-admitted on the active version (C14)", () => {
  const RELEASE = testReleaseKey(SITE);
  const CLASS = Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 });
  /** Each version's own estimate (its per-run cap), and the room's own (the site's, for a run without a version). */
  const ESTIMATES: Readonly<Record<number, number>> = Object.freeze({ [SITE]: 1_000, [ACTIVE]: 1_800 });
  const never = async (): Promise<string> => { throw new Error("test: nothing may be queued"); };

  /**
   * A room whose gate reads the pointer (`active`), recording on which client and in which order the START asks: the
   * pointer ("pointer:tx") and the re-check ("release:<version>:tx"). Its writes are recorded too: holds (with their
   * figure), line entries, start marks, reasons and supersession edges.
   */
  function s13Room(input: Readonly<{
    active: () => number; passed?: (version: number) => boolean; line?: readonly WaitingRun[]; daySpent?: number;
  }>) {
    const steps: string[] = [];
    const holds: Array<Readonly<{ runId: string; heldMicros: number }>> = [];
    const entered: string[] = [];
    const started: string[] = [];
    const reasons: string[] = [];
    const edges: string[] = [];
    const client = {
      query: vi.fn(async (text: string, values: readonly unknown[] = []) => {
        if (text.includes("INSERT INTO core.run_supersession")) edges.push(`${String(values[0])}->${String(values[1])}`);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn()
    };
    const where = (executor: unknown): string => executor === (client as unknown) ? "tx" : "elsewhere";
    const gate: AskAdmissionGate = {
      releaseKey: RELEASE,
      siteConcurrentDebates: 8,
      ownReleaseIsCurrent: async (executor, version) => {
        steps.push(`release:${String(version)}:${where(executor)}`);
        return version === undefined || (input.passed?.(version) ?? true);
      },
      activeDebates: async () => 0,
      activeSettingsVersion: async (executor) => {
        steps.push(`pointer:${where(executor)}`);
        return input.active();
      }
    };
    const spend: AskRoomSpend = {
      readDaySpentMicros: async () => input.daySpent ?? 0, readSiteCountedHoldsMicros: async () => 0,
      readOwnerSpentMicros: async () => 0, readOwnerCountedHoldsMicros: async () => 0,
      openHold: async (_client, hold) => { holds.push(Object.freeze({ runId: hold.runId, heldMicros: hold.heldMicros })); }
    };
    const line: AskRoomLine = {
      // One page: the whole line from the start, nothing after a cursor (the waker reads until a page comes back empty).
      siteLineBlocking: async () => false, wakeCandidates: async ({ after }) => (after === null ? [...(input.line ?? [])] : []),
      waitingForOwner: async () => [],
      waitingForLegacyAsker: async () => [],
      readWaiting: async (runId) => (input.line ?? []).find((run) => run.runId === runId) ?? null,
      isWaiting: async (_executor, runId) => (input.line ?? []).some((run) => run.runId === runId),
      enterWait: async (_client, runId) => { entered.push(runId); },
      recordReason: async (_client, runId, reason) => { reasons.push(`${runId}:${reason.waitsFor}`); },
      markStarted: async (_client, runId) => { started.push(runId); }
    };
    const room = new AskRoom({
      lockPool: { connect: vi.fn(async () => client) } as unknown as Pool,
      spend, line, estimator: estimator(700),
      estimatorFor: async (version) => estimator(ESTIMATES[version] ?? 9_999),
      personAllowance: { read: async () => [] }, entitlements: null,
      dailyCeilingMicros: 100_000, closeBasisPoints: 9_500, waitingLinePerPerson: 1, clock: () => NOW, gate
    });
    return { room, steps, holds, entered, started, reasons, edges, client };
  }

  function waiting(extra: Partial<WaitingRun> = {}): WaitingRun {
    return Object.freeze({ runId: randomUUID(), waitingSince: new Date("2026-10-22T11:00:00.000Z"), releaseKey: RELEASE,
      ownerRef: null, legacyAskerId: "legacy:s13", planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 2,
      waitsFor: "SITE", personRecheckAt: null, reasonAt: new Date("2026-10-22T11:00:00.000Z"), ...extra });
  }

  /** A READMIT plan as the waker hands it the second time, on `version`; its hold comes from the room (no picker). */
  function readmitOn(version: number, createRun: () => Promise<string>): Readmission {
    return {
      plan: { kind: "READMIT", planId: null, holdMicros: null, settingsClass: CLASS } as unknown as Readmission["plan"],
      createRun,
      registerVersion: version
    };
  }

  it("(1, room) a run of this release stamped 17 while 18 is active: phase one, decided on the START transaction, writes nothing", async () => {
    const run = waiting({ registerVersion: SITE });
    const r = s13Room({ active: () => ACTIVE, line: [run] });
    await expect(r.room.startWaiting(run, never)).resolves.toMatchObject({
      kind: "NEEDS_READMISSION", planId: null, preview: { estimateMicros: ESTIMATES[SITE] }
    });
    // (5) The pointer first, on the start's own client; then the release alone (17 is not the version it would start on).
    expect(r.steps).toEqual(["pointer:tx", "release:undefined:tx"]);
    expect([r.holds, r.entered, r.started, r.reasons, r.edges]).toEqual([[], [], [], [], []]);
  });

  it("(1, room) its READMIT on 18: the new run, the edge, the hold on the NEW run at version 18's estimate, its first job last", async () => {
    const run = waiting({ registerVersion: SITE });
    const r = s13Room({ active: () => ACTIVE, line: [run] });
    const order: string[] = [];
    const createRun = vi.fn(async () => { order.push("createRun"); return "new-run"; });
    const outcome = await r.room.startWaiting(run, async (tx, runId) => {
      order.push(`enqueue:${runId}:${tx === (r.client as unknown) ? "tx" : "elsewhere"}`);
      return "job:new";
    }, readmitOn(ACTIVE, createRun));
    expect(outcome).toEqual({ kind: "STARTED", runId: "new-run", value: "job:new" });
    expect(r.steps).toEqual(["pointer:tx", `release:${String(ACTIVE)}:tx`]);
    expect(r.holds).toEqual([{ runId: "new-run", heldMicros: ESTIMATES[ACTIVE] }]);
    expect(r.edges).toEqual([`${run.runId}->new-run`]);
    expect(order).toEqual(["createRun", "enqueue:new-run:tx"]);
    // (4) The old run is never marked started and the new one never enters the line: the edge takes the old one out.
    expect(r.started).toEqual([]);
    expect(r.entered).toEqual([]);
  });

  it("(2) its room still closed at the tick: untouched — no new row, no hold, no reason it did not already have", async () => {
    const run = waiting({ registerVersion: SITE });
    const r = s13Room({ active: () => ACTIVE, line: [run], daySpent: 100_000 });
    const createRun = vi.fn(async () => "never");
    await expect(r.room.startWaiting(run, never)).resolves.toEqual({ kind: "SITE_FULL" });
    await expect(r.room.startWaiting(run, never, readmitOn(ACTIVE, createRun))).resolves.toEqual({ kind: "SITE_FULL" });
    expect(createRun).not.toHaveBeenCalled();
    expect([r.holds, r.entered, r.started, r.reasons, r.edges]).toEqual([[], [], [], [], []]);
  });

  it("a READMIT planned on 18 while its START reads 19 (an activation in between) plans again: nothing written, 18 never asked", async () => {
    const run = waiting({ registerVersion: SITE });
    const r = s13Room({ active: () => 19, line: [run] });
    const createRun = vi.fn(async () => "never");
    await expect(r.room.startWaiting(run, never, readmitOn(ACTIVE, createRun))).resolves.toEqual({ kind: "NEEDS_READMISSION", planId: null });
    expect(r.steps).toEqual(["pointer:tx", "release:undefined:tx"]);
    expect(createRun).not.toHaveBeenCalled();
    expect([r.holds, r.edges]).toEqual([[], []]);
  });

  it("(S4) an ASK_AGAIN decided on 18 while its START reads 19 plans again too: no 'please ask again' on a version no longer active", async () => {
    const run = waiting({ registerVersion: SITE });
    const r = s13Room({ active: () => 19, line: [run] });
    const createRun = vi.fn(async () => "never");
    const askAgain: Readmission = { plan: { kind: "ASK_AGAIN" } as unknown as Readmission["plan"], createRun, registerVersion: ACTIVE };
    await expect(r.room.startWaiting(run, never, askAgain)).resolves.toEqual({ kind: "NEEDS_READMISSION", planId: null });
    expect(r.steps).toEqual(["pointer:tx", "release:undefined:tx"]);
    expect(createRun).not.toHaveBeenCalled();
    expect([r.holds, r.edges, r.reasons]).toEqual([[], [], []]);
    // (control) decided on the version still active, the same plan answers ASK_AGAIN, as before.
    const same = s13Room({ active: () => ACTIVE, line: [run] });
    await expect(same.room.startWaiting(run, never, { ...askAgain })).resolves.toEqual({ kind: "ASK_AGAIN" });
  });

  it("(5) a run stamped 18 while 18 is active starts on its own row, re-checked about 18 on the same transaction", async () => {
    const run = waiting({ registerVersion: ACTIVE });
    const r = s13Room({ active: () => ACTIVE, line: [run] });
    await expect(r.room.startWaiting(run, async () => "job")).resolves.toEqual({ kind: "STARTED", runId: run.runId, value: "job" });
    expect(r.steps).toEqual(["pointer:tx", `release:${String(ACTIVE)}:tx`]);
    expect(r.holds).toEqual([{ runId: run.runId, heldMicros: ESTIMATES[ACTIVE] }]);
    expect(r.started).toEqual([run.runId]);
    expect(r.edges).toEqual([]);
  });

  it("(R48) a run stamped with a version that is no longer active (a FAIL verdict on it) does not stop the tick: phase one, release alone", async () => {
    const run = waiting({ registerVersion: ACTIVE });
    const r = s13Room({ active: () => SITE, line: [run], passed: (version) => version !== ACTIVE });
    await expect(r.room.startWaiting(run, never)).resolves.toMatchObject({ kind: "NEEDS_READMISSION" });
    expect(r.steps).toEqual(["pointer:tx", "release:undefined:tx"]);
  });

  it("(5, the real gate) the pointer is read on the client it is given, with the one SQL constant; NULL is the site version", async () => {
    const SQL = "SELECT register.read_active_settings_version() AS version";
    const answers: unknown[] = [null, "18", 18, "0"];
    const asked: unknown[][] = [];
    const tx = {
      query: vi.fn(async (sql: string, values?: unknown) => {
        asked.push([sql, values]);
        return { rows: [{ version: answers.shift() }] };
      })
    } as unknown as PoolClient;
    const gate = new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: false, siteVersion: SITE });
    expect(await gate.activeSettingsVersion!(tx)).toBe(SITE);
    expect(await gate.activeSettingsVersion!(tx)).toBe(ACTIVE);
    expect(await gate.activeSettingsVersion!(tx)).toBe(ACTIVE);
    await expect(gate.activeSettingsVersion!(tx)).rejects.toMatchObject({ code: "ACTIVE_SETTINGS_VERSION_INVALID" });
    expect(asked).toEqual([[SQL, undefined], [SQL, undefined], [SQL, undefined], [SQL, undefined]]);
    // Without the site version the gate reads no pointer (Phase 1's start); a site version that is no version refuses.
    expect(new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: false }).activeSettingsVersion).toBeUndefined();
    expect(() => new PostgresAskAdmissionGate({ releaseKey: RELEASE, hosted: false, siteVersion: 0 })).toThrow("ASK_ADMISSION_GATE_INVALID");
    // One runtime module holds the pointer's SQL (S16): the gate and the room never spell it.
    for (const file of ["release-state.ts", "ask-room.ts"]) {
      const source = readFileSync(new URL(`../../apps/api/src/${file}`, import.meta.url), "utf8");
      expect(source, file).not.toContain("read_active_settings_version");
    }
    const reader = readFileSync(new URL("../../apps/api/src/active-settings-version.ts", import.meta.url), "utf8");
    expect(reader).toContain("export async function readActiveSettingsVersionOn(");
    expect(reader).toContain("client.query<{ version: unknown }>(ACTIVE_SETTINGS_VERSION_SQL)");
  });

  /** The waiting run's stored ask, as C10's `readStoredAsk` reads it (a legacy asker's, in the clear). */
  function storedOf(run: WaitingRun): StoredAsk {
    return Object.freeze({
      runId: run.runId, releaseKey: RELEASE, registerVersion: run.registerVersion ?? SITE,
      questionLine: "Should a debate that waited through an activation start on the new settings?",
      askContract: Object.freeze({ decision_scope: "s13 re-admission", steering_presets: [], steering_annotations: [] }),
      askerId: "legacy:s13", sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date("2026-10-22T00:00:00.000Z"),
      askerRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:s13", compositionBudgetTier: "low",
      planTier: "free", depthParams: Object.freeze({ depth: 1 }), argumentLanguageTag: "en", argumentLanguageName: "English",
      contentEncrypted: false
    });
  }

  /** The waker over the room above: the run's stored ask, no orphans, the new row written as `#readmit` writes it. */
  function wakerOver(r: ReturnType<typeof s13Room>, run: WaitingRun, extra: Parameters<typeof arrange>[0] = {}) {
    vi.spyOn(RunRepository.prototype, "readStoredAsk").mockImplementation(async (runId) => (runId === run.runId ? storedOf(run) : null));
    vi.spyOn(RunRepository.prototype, "listUnstartedReadmissions").mockResolvedValue([]);
    const startReadmittedRun = vi.spyOn(RunRepository.prototype, "startReadmittedRun")
      .mockImplementation(async ({ fromRunId }) => `new:${fromRunId}`);
    vi.spyOn(WorkItemRepository.prototype, "listStalledStarts").mockResolvedValue([]);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const arranged = arrange({ room: r.room, waitingLine: r.room, ...extra });
    return { ...arranged, startReadmittedRun };
  }

  it("(1, through the waker) stamped 17, 18 active, its room open: a new run stamped 18 with 18's receipt and estimate, its hold and job", async () => {
    const old = waiting({ registerVersion: SITE });
    const r = s13Room({ active: () => ACTIVE, line: [old] });
    const { application, startReadmittedRun, memory, used } = wakerOver(r, old);
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, failed: 0, skipped: 0 });
    const created = `new:${old.runId}`;
    const row = startReadmittedRun.mock.calls[0]![0];
    expect(row).toMatchObject({ fromRunId: old.runId, registerVersion: ACTIVE, releaseKey: RELEASE, tierProvenanceRef: "asker:s13:v18" });
    expect(row.envelopeBasis).toMatchObject({ version_mark: ACTIVE });
    expect(memory).toMatchObject([{ runId: created, policyVersion: ACTIVE }]);
    // Version 18's receipt only: nothing of the run's own version 17 was used to plan it.
    expect(used.filter((part) => part.startsWith("receipt:"))).toEqual([`receipt:${String(ACTIVE)}`]);
    expect(r.holds).toEqual([{ runId: created, heldMicros: ESTIMATES[ACTIVE] }]);
    expect(r.edges).toEqual([`${old.runId}->${created}`]);
    expect(vi.mocked(WorkItemRepository.prototype.enqueueOn)).toHaveBeenCalledWith(r.client, expect.objectContaining({ runId: created }));
    // Both STARTs read the pointer on their own transaction; the second re-checks the version the new run starts on.
    expect(r.steps).toEqual(["pointer:tx", "release:undefined:tx", "pointer:tx", `release:${String(ACTIVE)}:tx`]);
    // (4) One place in line per person: the new run never enters it, the old one is never marked started (the edge ends it).
    expect(r.entered).toEqual([]);
    expect(r.started).toEqual([]);
  });

  it("(3) a choice version 18 no longer offers (its sealed maximum depth): please ask again, no new run, no hold, no charge", async () => {
    const old = waiting({ registerVersion: SITE });
    const r = s13Room({ active: () => ACTIVE, line: [old] });
    const { application, startReadmittedRun } = wakerOver(r, old, {
      members: (version, into) => versionMembers(version, into, version === ACTIVE ? {
        resolveEnvelopeBasis: async () => {
          throw new TypedDomainError("STRUCTURAL_CEILING_DEPTH_ABOVE_SEALED_MAXIMUM", "STRUCTURAL_CEILING_DEPTH_ABOVE_SEALED_MAXIMUM");
        }
      } : {})
    });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 1 });
    expect(vi.mocked(WorkItemRepository.prototype.recordSetupFailure)).toHaveBeenCalledWith(expect.objectContaining({
      runId: old.runId, reason: "RUN_SETUP_FAILED:CHOICE_UNAVAILABLE"
    }));
    expect(startReadmittedRun).not.toHaveBeenCalled();
    expect([r.holds, r.edges, r.started, r.entered]).toEqual([[], [], [], []]);
  });

  it("(R49) a run stamped with the site version while the active version cannot be loaded is not started on the site version", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const old = waiting({ registerVersion: SITE });
    const r = s13Room({ active: () => ACTIVE, line: [old] });
    const { application, startReadmittedRun } = wakerOver(r, old, {
      refuse: (version) => version === ACTIVE ? new TypedDomainError("PREVIEW_LINE_UP_REQUIRED", "PREVIEW_LINE_UP_REQUIRED") : undefined
    });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, skipped: 1, failed: 0 });
    expect(startReadmittedRun).not.toHaveBeenCalled();
    expect(r.steps).toEqual(["pointer:tx", "release:undefined:tx"]);
    expect([r.holds, r.edges, r.started, r.entered]).toEqual([[], [], [], []]);
    expect(vi.mocked(WorkItemRepository.prototype.recordSetupFailure)).not.toHaveBeenCalled();
  });
});
