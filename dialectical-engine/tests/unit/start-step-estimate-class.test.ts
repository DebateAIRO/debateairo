/**
 * V4 start step, Task 37 (spec 2026-11-03 §5): a path debate (shape receipt v2) is estimated for its number of paths.
 *
 *  - The history estimate's class names the paths of a v2 run (1 to 8): its key gains "|paths:<n>" before the web part,
 *    and its sample is only runs whose receipt names that many paths ($15). Every other class keeps its key, and samples
 *    only runs that name none.
 *  - Short of samples, the depth's start figure stands for a debate of 3 paths: ceil(figure x paths / 3), capped at the
 *    run's maximum, as today.
 *  - The share before Start reads a path debate's web part (`pathsWebPartMicros`), and every path's arguing reads every
 *    chosen path's pack (owner 31 Oct), so the pack is read paths x paths times.
 *  - A waiting run's class reads its receipt's paths the careful way: 1 to 8 kept, none absent, any other the most (8).
 *  - The ask's class (submit, the room) names the start's paths; a re-admitted run's names the paths its new receipt minted.
 * Made-up figures only.
 */
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient, QueryResult } from "pg";
import {
  PostgresRecentRunUsageSource, RecentRunsCostEstimator, estimateWebPartMicros, settingsClassKey,
  waitingShapeClassOf, webCallTokens, type ProviderTargetPrice, type RunSettingsClass, type WebRolePrices
} from "@debateai/budget";
import { PostgresAskApplication, type PlannedAskAdmission, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import type { AskRequest, Session, StartMenu } from "@debateai/contract";
import { RunRepository, type DiscoveredPanelMember, type StartPathsStore, type StoredAsk, type WaitingRun } from "@debateai/db";
import { LivenessRepository } from "@debateai/liveness";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, debateShapeStartStepStartValues, engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues, resolveDebateShapeV2, webSitesOf, type DebateShapePolicy
} from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import { runSettingsClassOfAsk, settingsClassOfWaitingRun, type AskRoomPort, type RoomDecision, type RoomQuestion } from "../../apps/api/src/ask-room.js";
import { runShapeClassOf } from "../../apps/api/src/debate-shape-ask.js";
import { planReadmission } from "../../apps/api/src/readmission.js";
import type { AskStartHandOver, VerifiedStartPaths } from "../../apps/api/src/start-paths-at-ask.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const SHAPE = Object.freeze({ plan: "plus", depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const);
const BASE: RunSettingsClass = Object.freeze({ planTier: "premium", compositionBudgetTier: "low", makerCount: 4, depth: 1 });
const shaped = (paths?: number): RunSettingsClass => Object.freeze({ ...BASE, shape: Object.freeze({ ...SHAPE, ...(paths === undefined ? {} : { paths }) }) });
const price = (input: number, output: number): ProviderTargetPrice => Object.freeze({ inputMicrosPerMillionTokens: input, outputMicrosPerMillionTokens: output });
const PRICES = new Map<string, ProviderTargetPrice>([["provider:made-up", price(100_000, 400_000)]]);
const ROLES: WebRolePrices = Object.freeze({ readerOne: price(100_000, 500_000), pick: price(100_000, 500_000), topReaders: price(200_000, 600_000),
  planner: price(200_000, 600_000), pack: price(200_000, 600_000) });
/** A made-up start figure of 30,000 micro-units at depth 1, trusted from 5 samples. */
const START = Object.freeze({ minSamples: 5, startMicrosByDepth: new Map([[1, 30_000], [2, 10_000]]) });
const estimator = (maximumMicros = 1_000_000, webPrices: WebRolePrices | null = ROLES) => new RecentRunsCostEstimator({
  source: { readRecentRunUsage: async () => [] }, prices: PRICES, maximumMicros, start: START, webPrices, clock: () => new Date(0)
});
const PATHS_5 = webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 5, origin: "START" });

describe("the class key names a path debate's paths", () => {
  it("before the web part; a class without paths keeps today's key", () => {
    expect(settingsClassKey(shaped())).toBe("premium|low|4|1|plus|adaptive|standard|standard");
    expect(settingsClassKey(shaped(5))).toBe("premium|low|4|1|plus|adaptive|standard|standard|paths:5");
    expect(settingsClassKey({ ...shaped(5), web: { kind: "PATHS", depth: "QUICK", paths: 5, origin: "START" } }))
      .toBe("premium|low|4|1|plus|adaptive|standard|standard|paths:5|web:PATHS:QUICK:5:20");
    expect(settingsClassKey(BASE)).toBe("premium|low|4|1");
  });

  it("refuses paths outside 1 to 8", () => {
    for (const paths of [0, 9, 2.5, -1]) expect(() => settingsClassKey(shaped(paths))).toThrow("COST_ESTIMATE_SETTINGS_INVALID");
    expect(settingsClassKey(shaped(1))).toContain("|paths:1");
    expect(settingsClassKey(shaped(8))).toContain("|paths:8");
  });
});

describe("short of samples, the start figure counts the paths", () => {
  it("stands for 3 paths: ceil(figure x paths / 3), capped at the maximum", async () => {
    expect(await estimator().estimateMicros(shaped(5))).toBe(50_000);
    expect(await estimator().estimateMicros(shaped(3))).toBe(30_000);
    expect(await estimator().estimateMicros(shaped(7))).toBe(70_000);
    expect(await estimator().estimateMicros(shaped())).toBe(30_000);
    expect(await estimator(60_000).estimateMicros(shaped(7))).toBe(60_000);
    // Rounded up: 10,000 x 2 / 3 is 6,666.67.
    expect(await estimator().estimateMicros({ ...shaped(2), depth: 2 })).toBe(6_667);
  });

  it("a path debate's web class starts at its scaled figure plus its web part", async () => {
    const web = { kind: "PATHS" as const, depth: "QUICK" as const, paths: 5, origin: "START" as const };
    expect(await estimator(100_000_000).estimateMicros({ ...shaped(5), web }))
      .toBe(50_000 + estimateWebPartMicros(PATHS_5, ROLES).totalMicros);
  });

  it("a full sample is never scaled: the 75th percentile, as today", async () => {
    const runs = Array.from({ length: 5 }, (_, index) => Object.freeze({ runId: `run:${index + 1}`,
      charges: Object.freeze([Object.freeze({ providerRef: "provider:made-up", inputTokens: (index + 1) * 100_000, outputTokens: 0 })]) }));
    const full = new RecentRunsCostEstimator({ source: { readRecentRunUsage: async () => runs }, prices: PRICES, maximumMicros: 1_000_000,
      start: START, clock: () => new Date(0) });
    expect(await full.estimateMicros(shaped(7))).toBe(40_000);
  });
});

describe("the share before Start reads a path debate's web part", () => {
  it("pathsWebPartMicros is the web part of a debate's start with that many paths; null without web prices", () => {
    expect(estimator().pathsWebPartMicros({ depth: "QUICK", paths: 5 })).toBe(estimateWebPartMicros(PATHS_5, ROLES).totalMicros);
    expect(estimator().pathsWebPartMicros({ depth: "THOROUGH", paths: 3 }))
      .toBe(estimateWebPartMicros(webSitesOf({ kind: "PATHS", depth: "THOROUGH", paths: 3, origin: "START" }), ROLES).totalMicros);
    expect(estimator(1_000_000, null).pathsWebPartMicros({ depth: "QUICK", paths: 5 })).toBeNull();
  });

  it("every path's arguing reads every chosen path's pack: 5 paths read 25 packs; START and DIG keep today's", () => {
    expect(webCallTokens(PATHS_5).pack.calls).toBe(25);
    expect(webCallTokens(webSitesOf({ kind: "PATHS", depth: "THOROUGH", paths: 3, origin: "DIG" })).pack.calls).toBe(9);
    expect(webCallTokens(webSitesOf({ kind: "START", depth: "QUICK", paths: 5 })).pack.calls).toBe(5);
    expect(webCallTokens(webSitesOf({ kind: "DIG", depth: "QUICK", digPicks: 5 })).pack.calls).toBe(3);
  });
});

describe("the sample names the paths ($15)", () => {
  async function sampleQuery(settings: RunSettingsClass) {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const pool = { query: async (sql: string, params: readonly unknown[]) => { calls.push({ sql, params }); return { rows: [] }; } } as unknown as Pool;
    await new PostgresRecentRunUsageSource(pool).readRecentRunUsage({ settings, since: new Date(0), limit: 20 });
    return calls[0]!;
  }

  it("a class with paths samples only runs whose receipt names that many; one without, only runs that name none", async () => {
    const withPaths = await sampleQuery(shaped(5));
    expect(withPaths.sql).toContain("AND COALESCE(run.envelope_basis->'shape'->>'paths', '') = $15");
    expect(withPaths.params).toHaveLength(15);
    expect(withPaths.params[14]).toBe("5");
    expect((await sampleQuery(shaped())).params[14]).toBe("");
    expect((await sampleQuery(BASE)).params[14]).toBe("");
  });
});

const askOf = (depthParams: AskRequest["depth_params"]): Pick<AskRequest, "plan_tier" | "composition_budget_tier" | "depth_params"> =>
  Object.freeze({ plan_tier: "premium", composition_budget_tier: "low", depth_params: depthParams });
const SHAPED_PARAMS = Object.freeze({ depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const);

describe("the ask's class and a waiting run's class carry the paths", () => {
  it("the ask's class names the paths it is given, only on a shaped ask", () => {
    expect(runShapeClassOf(SHAPED_PARAMS, "plus", 5)).toEqual({ ...SHAPE, paths: 5 });
    expect(runShapeClassOf(SHAPED_PARAMS, "plus")).not.toHaveProperty("paths");
    expect(runSettingsClassOfAsk(askOf(SHAPED_PARAMS), undefined, "plus", 5).shape).toEqual({ ...SHAPE, paths: 5 });
    expect(runSettingsClassOfAsk(askOf(SHAPED_PARAMS), undefined, "plus").shape).toEqual(SHAPE);
    expect(runSettingsClassOfAsk(askOf(SHAPED_PARAMS), undefined, "plus").shape).not.toHaveProperty("paths");
    expect(runSettingsClassOfAsk(askOf({ depth: 1 }), undefined, "plus", 5)).not.toHaveProperty("shape");
  });

  const waiting = (shapeSettings: Readonly<Record<string, unknown>>): WaitingRun => Object.freeze({
    runId: "00000000-0000-4000-8000-000000000001", waitingSince: new Date(0), releaseKey: TEST_RELEASE_KEY, ownerRef: null,
    legacyAskerId: "legacy:a", planTier: "premium", compositionBudgetTier: "low", depth: 1, makerCount: 4, waitsFor: null,
    personRecheckAt: null, reasonAt: null, shapeSettings });
  const STORED = Object.freeze({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard", plan: "plus" });

  it("a waiting run's paths: 1 to 8 kept, none absent, any other the most (8)", () => {
    expect(settingsClassOfWaitingRun(waiting({ ...STORED, paths: 5 })).shape).toEqual({ ...SHAPE, paths: 5 });
    expect(settingsClassOfWaitingRun(waiting({ ...STORED, paths: null })).shape).toEqual(SHAPE);
    expect(settingsClassOfWaitingRun(waiting({ ...STORED, paths: null })).shape).not.toHaveProperty("paths");
    expect(waitingShapeClassOf(STORED, "premium")).not.toHaveProperty("paths");
    for (const odd of [0, 9, 2.5, "5", -1, true, {}]) {
      expect(waitingShapeClassOf({ ...STORED, paths: odd }, "premium")).toEqual({ ...SHAPE, paths: 8 });
    }
  });

  it("the waiting line reads the receipt's paths beside the shape settings, only when the receipt names them", async () => {
    const source = await readFile(new URL("../../packages/db/src/run-wait.ts", import.meta.url), "utf8");
    // Review of Task 37: a receipt that names no paths (every run before the start step) keeps today's settings object,
    // with no `paths` member at all (tests/integration/b3-holds-waiting-line.test.ts reads it with toEqual).
    expect(source).toContain("'answerLength', shape_run.depth_params->'answerLength', 'plan', shape_run.envelope_basis->'shape'->'plan')\n"
      + "      || jsonb_strip_nulls(jsonb_build_object('paths', shape_run.envelope_basis->'shape'->'paths')) END");
  });
});

// ---- Submit: the room is asked about the start's paths (harness after start-paths-submit) ----

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-11-04T10:00:00.000Z");
const TX = Object.freeze({ marker: "the room decision's own transaction" }) as unknown as PoolClient;
const ROOM_START: RoomDecision = Object.freeze({ kind: "START", worst: "FITS", worstScope: null });
const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-11-04T00:00:00.000Z" });
const PANEL = Object.freeze([member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "Anthropic", "claude-sonnet-5")]);
const POLICY_OFF = debateShapePolicyStartValues();
const POLICY_ON: DebateShapePolicy = { ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() };
const session: Session = {
  session_id: "33333333-3333-4333-8333-333333333333", asker_id: `owner:${OWNER_REF}`, caller_scope: "ASKER",
  ownership_provenance: "server_session", provisional_identity_model: false
};
const principal = Object.freeze({ kind: "server" as const, userId: "66666666-6666-4666-8666-666666666666", ownerRef: OWNER_REF });
const ask = (extra: Partial<AskRequest> = {}): AskRequest => ({ question_line: "Should our town plant more trees by the river?", risk_tier: "casual",
  tier_source: "ASKER", tier_provenance_ref: "asker:estimate-class", composition_budget_tier: "low", depth_params: { depth: 1 },
  decision_scope: "estimate class", as_of: "2026-11-04T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [], ...extra });
const path = (no: 1 | 2, title: string) => Object.freeze({ pathId: `b${no}` as const, pathNo: no, author: "AI_SUGGESTION" as const, title, question: `${title}?`,
  viewpoints: Object.freeze([{ viewpointId: `pt${no}1`, pickNo: null, title, question: `${title}?`, own: false }]), ownWords: Object.freeze([]) });
/** Two chosen paths, so the class's count is the person's, not the default width. */
const VERIFIED_TWO: VerifiedStartPaths = Object.freeze({
  source: "MENU", width: 3, chosenBy: "PERSON", carryOnToReport: false, questionSwap: null, ownWords: Object.freeze([]), questionEdited: false,
  menu: Object.freeze({ menu: Object.freeze({ menu_id: "madeUpTreesMenu0000001" }) as unknown as StartMenu, lateLists: Object.freeze([]) }),
  paths: Object.freeze([path(1, "Shade in summer"), path(2, "Upkeep costs")])
} as const);
const handOver = (verified: VerifiedStartPaths | null): AskStartHandOver =>
  Object.freeze({ binding: Object.freeze({ planKey: "free" as const, settingsVersion: 1 }), verified, lock: null });

function stubPool(): Pool {
  const query = vi.fn(async () => ({ rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

function arrange(policy: DebateShapePolicy) {
  const asked: Array<{ step: string; question: RoomQuestion }> = [];
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockImplementation(async () => 1);
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async () => RUN_ID);
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockImplementation(async () => undefined);
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockImplementation(async () => "22222222-2222-4222-8222-222222222222");
  const room: AskRoomPort = {
    precheck: async (question) => {
      asked.push({ step: "precheck", question });
      return Object.freeze({ admission: ROOM_START, estimateMicros: 1_234, now: NOW, personUses: [],
        waitReason: Object.freeze({ waitsFor: "SITE" as const, personRecheckAt: null }) });
    },
    decide: async (question, apply) => {
      asked.push({ step: "decide", question });
      return apply({ admission: ROOM_START, estimateMicros: 1_234, now: NOW, tx: TX });
    },
    enterWait: async () => undefined,
    openStart: async () => undefined,
    expectedStart: async () => null
  };
  const store: StartPathsStore = {
    recordStartPaths: async () => "RECORDED", readStartPaths: async () => null, readStartPathIds: async () => null,
    copyStartPathsForReadmission: async () => "NONE", recordCarryOnDue: async () => "NOT_ASKED", claimCarryOnDue: async () => [],
    readCarryOnBegun: async () => [], recordCarryOnDone: async () => "NOT_BEGUN"
  };
  const settings: RunCreationSettings = {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "battery:estimate-class",
    settlementWatchHandle: "watch:estimate-class",
    resolveDiscoveredPanel: async () => PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape, shapeV2, length, engine, web }) =>
      computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned,
        ...(shape === null ? {} : { shape }), ...(shapeV2 == null ? {} : { shapeV2 }), ...(length === null ? {} : { length }),
        ...(engine === null ? {} : { engine }), ...(web === null ? {} : { web }) }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    debateShapePolicy: policy,
    lengthGuidancePolicy: lengthGuidancePolicyStartValues(),
    engineVersionPolicy: engineVersionPolicyStartValues(),
    startPaths: store,
    room
  };
  const application = new PostgresAskApplication(stubPool(), { dispatch: vi.fn(async () => undefined) }, settings,
    { read: async () => [] }, stubPool(), { server: stubPool(), legacy: stubPool() });
  const submit = (asked: AskRequest, startHandOver?: AskStartHandOver) =>
    startHandOver === undefined ? application.submit(asked, session, principal) : application.submit(asked, session, principal, startHandOver);
  return { asked, submit };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submit asks the room about the start's paths", () => {
  it("the person's two paths: the precheck and the locked decision both estimate a debate of 2 paths", async () => {
    const { asked, submit } = arrange(POLICY_ON);
    await expect(submit(ask(), handOver(VERIFIED_TWO))).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    expect(asked.map((entry) => entry.step)).toEqual(["precheck", "decide"]);
    for (const entry of asked) expect(entry.question.settingsClass.shape?.paths).toBe(2);
  });

  it("an old page's ask (the run builds its own list): Free's default width, 3", async () => {
    const { asked, submit } = arrange(POLICY_ON);
    await submit(ask());
    for (const entry of asked) expect(entry.question.settingsClass.shape?.paths).toBe(3);
  });

  it("the switch absent: today's class, shaped and without paths", async () => {
    const { asked, submit } = arrange(POLICY_OFF);
    await submit(ask());
    expect(asked).toHaveLength(2);
    for (const entry of asked) {
      expect(entry.question.settingsClass.shape).toBeDefined();
      expect(entry.question.settingsClass.shape).not.toHaveProperty("paths");
    }
  });
});

// ---- Re-admission: the new run's class names the paths its new receipt minted ----

describe("a re-admitted run's class counts the paths its new evaluation minted", () => {
  const stored: StoredAsk = Object.freeze({
    runId: "00000000-0000-4000-8000-000000000001", releaseKey: TEST_RELEASE_KEY, registerVersion: 1,
    questionLine: "Should our town plant more trees by the river?",
    askContract: Object.freeze({ decision_scope: "personal", steering_presets: Object.freeze([]), steering_annotations: Object.freeze([]),
      critic_unavailable_cap: Object.freeze({ applied: false }) }),
    askerId: "legacy-estimate-class", sessionId: "00000000-0000-4000-8000-000000000002", callerScope: "ASKER",
    asOf: new Date("2026-11-04T09:00:00.000Z"), askerRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:estimate-class",
    compositionBudgetTier: "low", planTier: "free", depthParams: Object.freeze({ depth: 1 }), argumentLanguageTag: "en",
    argumentLanguageName: "English", contentEncrypted: false
  });
  const admission = (envelopeBasis: Readonly<Record<string, unknown>>): PlannedAskAdmission => Object.freeze({
    risk: Object.freeze({ effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:estimate-class" }),
    envelopeBasis, discoveredPanel: Object.freeze([]), criticUnavailableCap: Object.freeze({ applied: false })
  }) as unknown as PlannedAskAdmission;
  const readmit = async (envelopeBasis: Readonly<Record<string, unknown>>) => {
    const plan = await planReadmission({ stored, planId: null, settings: { debateShapePolicy: POLICY_ON, lengthGuidancePolicy: lengthGuidancePolicyStartValues() },
      evaluate: async () => admission(envelopeBasis) });
    if (plan.kind !== "READMIT") throw new Error(`expected READMIT, got ${plan.kind}`);
    return plan.settingsClass;
  };

  it("a v2 receipt of 2 paths: the class names 2; today's receipt: none", async () => {
    const shapeV2 = resolveDebateShapeV2(POLICY_ON, "free",
      { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard", paths: 2, pathsSource: "MENU" }, 2);
    const v2 = computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize: 2, depth: 1, backupSequencesProvisioned: 0, shapeV2 });
    expect((await readmit(v2)).shape?.paths).toBe(2);
    const v1 = computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize: 2, depth: 1, backupSequencesProvisioned: 0 });
    const today = await readmit(v1);
    expect(today.shape).toBeDefined();
    expect(today.shape).not.toHaveProperty("paths");
  });
});
