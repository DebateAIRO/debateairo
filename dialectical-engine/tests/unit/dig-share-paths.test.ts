/**
 * V4 start step, Task 79b (owner answer Q19 of 4 Nov, A: "a dig's share follows a combine"; spec 2026-11-03 §4.4; items dig-f35,
 * journey-f8): a path debate's dig shows its share for the number of paths it will look into. The room read for a dig where the
 * start step runs gives the dig's share of today for each path count, 1 to the widest it may send (whole percents, as Task 38's
 * new-question shares, so one path less always shows): the arguing estimate with that many paths, plus the dig's web part for
 * them when the dig searches, plus what follows a dig (its rewrite, the climb and the main answer's update). The page reads the
 * entry for the dig's paths (`digShareLine(room, paths)`). An R22 dig keeps today's single share, byte for byte. Every figure
 * here is made up.
 */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { buildApi, type AdmissionView, type AskApplication } from "@debateai/api";
import { AskRoomResponseSchema } from "@debateai/contract";
import {
  RecentRunsCostEstimator, estimateWebPartMicros, type PersonWindow, type ProviderTargetPrice, type RunSettingsClass, type WebRolePrices
} from "@debateai/budget";
import type { InternalGrant } from "@debateai/kernel";
import { parsePreviewProviderTestConfig, type PreviewProviderTestConfig } from "@debateai/providers";
import {
  debateShapePolicyStartValues, debateShapeStartStepStartValues, engineVersionPolicyStartValues, webSitesOf, type DebateShapePolicy
} from "@debateai/register";
import { AskRoom, type AskRoomAnswer, type AskRoomReader, type RoomQuestion } from "../../apps/api/src/ask-room.js";
import type { AskRoom as PageRoom } from "../../apps/ui/lib/billing/room.js";
import { digShareLine } from "../../apps/ui/lib/v4/money.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const OWNER = "7e1f6c1a-3b9d-4d5e-8f00-000000000079";
const PARENT = "3c0a3c1e-5c0e-4c4e-8a38-000000000079";
/** A made-up day of 1 000 000 micro-units: 10 000 is 1%. */
const DAY_LIMIT = 1_000_000;
const PAID_DAY: PersonWindow = Object.freeze({ scope: "PERSON_DAY", limitMicros: DAY_LIMIT, periodStart: new Date("2026-11-06T00:00:00.000Z"),
  resetsAt: new Date("2026-11-07T00:00:00.000Z"), finishBasisPoints: 10_000, closeBasisPoints: 9_500, borrows: true });
/** Free's only window, its month. */
const FREE_MONTH: PersonWindow = Object.freeze({ scope: "PERSON_MONTH", limitMicros: DAY_LIMIT, periodStart: new Date("2026-11-01T00:00:00.000Z"),
  resetsAt: new Date("2026-12-01T00:00:00.000Z"), finishBasisPoints: 10_000, closeBasisPoints: 9_500, keepsReserveMicros: 0 });
/** A window before the money rule (no borrow, no reserve): no share is shown on it. */
const V3_DAY: PersonWindow = Object.freeze({ scope: "PERSON_DAY", limitMicros: DAY_LIMIT, periodStart: PAID_DAY.periodStart,
  resetsAt: PAID_DAY.resetsAt, finishBasisPoints: 10_000, closeBasisPoints: 9_500 });

const SHAPE = Object.freeze({ plan: "plus" as const, depthMode: "adaptive" as const, scrutiny: "standard" as const, answerLength: "standard" as const });
/** A dig's own class, as the route builds it: shaped, with no path count (the room itself is measured on it, as today). */
const PLUS_DIG_CLASS: RunSettingsClass = Object.freeze({ planTier: "premium", compositionBudgetTier: "low", makerCount: 4, depth: 1, shape: SHAPE });
const FREE_DIG_CLASS: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "low", makerCount: 2, depth: 1,
  shape: Object.freeze({ ...SHAPE, plan: "free" as const }) });
const ACCESS = Object.freeze({ ownerRef: OWNER, legacyAskerId: null });

type Asked = { estimates: Array<number | null>; pathsWeb: unknown[]; digWeb: unknown[]; updates: unknown[] };
const asked = (): Asked => ({ estimates: [], pathsWeb: [], digWeb: [], updates: [] });
/**
 * Made-up estimator: arguing 10 000 a path plus 5 000 (40 000 for a class with no paths); a path debate's web part 5 000 a path;
 * an R22 dig's web part 4 000 a pick; what follows a dig 10 000.
 */
function roomWith(input: Readonly<{ windows: readonly PersonWindow[]; asked?: Asked; grant?: boolean }>): AskRoom {
  const seen = input.asked ?? asked();
  return new AskRoom({
    lockPool: { connect: vi.fn() } as unknown as Pool,
    spend: {
      readDaySpentMicros: async () => 0, readSiteCountedHoldsMicros: async () => 0, readOwnerSpentMicros: async () => 0,
      readOwnerCountedHoldsMicros: async () => 0, openHold: async () => undefined
    },
    line: {
      siteLineBlocking: async () => false, wakeCandidates: async () => [], waitingForOwner: async () => [],
      waitingForLegacyAsker: async () => [], readWaiting: async () => null, isWaiting: async () => false,
      enterWait: async () => undefined, recordReason: async () => undefined, markStarted: async () => undefined
    },
    estimator: {
      estimateMicros: async (settings) => {
        const paths = settings.shape?.paths ?? null;
        seen.estimates.push(paths);
        return paths === null ? 40_000 : paths * 10_000 + 5_000;
      },
      pathsWebPartMicros: (web) => {
        seen.pathsWeb.push(web);
        return web.paths * 5_000;
      },
      digWebPartMicros: (web) => {
        seen.digWeb.push(web);
        return web.digPicks * 4_000;
      },
      digUpdatesPartMicros: (dig) => {
        seen.updates.push(dig);
        return 10_000;
      }
    },
    personAllowance: { read: async () => input.windows },
    entitlements: null,
    ...(input.grant === true ? { funding: {
      resolveAskFunding: async () => { throw new Error("not asked"); },
      readGrant: async () => ({ expiresAt: new Date("2026-11-20T00:00:00.000Z") }) as unknown as InternalGrant,
      assertProviderFundingAdmission: async () => undefined,
      readRunFundingState: async () => { throw new Error("not asked"); },
      readSubscriptionWindows: async () => []
    } } : {}),
    dailyCeilingMicros: 1_000_000_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: () => NOW
  });
}

/** An R22 dig of three picks (no path counts asked). */
const R22_DIG: RoomQuestion = Object.freeze({ access: ACCESS, settingsClass: PLUS_DIG_CLASS,
  dig: Object.freeze({ parentRunId: PARENT, mode: "quick" as const, picks: 3, level: 1 }) });
/** The same dig of a path debate: up to 7 paths, searching on a Quick look. */
const PATHS_DIG: RoomQuestion = Object.freeze({ ...R22_DIG,
  dig: Object.freeze({ ...R22_DIG.dig!, paths: Object.freeze({ maxPaths: 7, web: "QUICK" as const }) }) });

describe("the estimator's web part of a path debate's dig", () => {
  const price = (input: number, output: number): ProviderTargetPrice => Object.freeze({ inputMicrosPerMillionTokens: input, outputMicrosPerMillionTokens: output });
  const roles: WebRolePrices = Object.freeze({ readerOne: price(100_000, 500_000), pick: price(100_000, 500_000), topReaders: price(200_000, 600_000),
    planner: price(200_000, 600_000), pack: price(200_000, 600_000) });
  const estimator = (webPrices: WebRolePrices | null) => new RecentRunsCostEstimator({
    source: { readRecentRunUsage: async () => [] }, prices: new Map([["provider:made-up", price(100_000, 400_000)]]), maximumMicros: 1_000_000,
    webPrices, clock: () => new Date(0)
  });
  it("from a dig's origin is the receipt's own web part of a dig of that many paths; without an origin, a debate's start as before", () => {
    const fromDig = estimateWebPartMicros(webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 3, origin: "DIG" }), roles).totalMicros;
    const fromStart = estimateWebPartMicros(webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 3, origin: "START" }), roles).totalMicros;
    expect(fromDig).toBeLessThan(fromStart);
    expect(estimator(roles).pathsWebPartMicros({ depth: "QUICK", paths: 3, origin: "DIG" })).toBe(fromDig);
    expect(estimator(roles).pathsWebPartMicros({ depth: "QUICK", paths: 3, origin: "START" })).toBe(fromStart);
    expect(estimator(roles).pathsWebPartMicros({ depth: "QUICK", paths: 3 })).toBe(fromStart);
    expect(estimator(null).pathsWebPartMicros({ depth: "THOROUGH", paths: 2, origin: "DIG" })).toBeNull();
  });
});

describe("the room read's dig share for each number of paths", () => {
  it("a paid dig that searches: each count's arguing, its web part from a dig and what follows a dig, as a whole share of today", async () => {
    const seen = asked();
    const answer = await roomWith({ windows: [PAID_DAY], asked: seen }).readRoom(PATHS_DIG);
    // 15 000 a path + 15 000 of a 1 000 000 day: 1.5% a path and 1.5% beside, half up.
    expect(answer.digShareByPaths).toEqual([3, 5, 6, 8, 9, 11, 12]);
    expect(Object.isFrozen(answer.digShareByPaths)).toBe(true);
    // The dig's web part per path count is priced from a dig (fewer results a search than at a debate's start).
    expect(seen.pathsWeb).toEqual([1, 2, 3, 4, 5, 6, 7].map((paths) => ({ depth: "QUICK", paths, origin: "DIG" })));
    // The room itself is still measured for the dig's own class; then one estimate per path count.
    expect(seen.estimates).toEqual([null, 1, 2, 3, 4, 5, 6, 7]);
    // What follows a dig is the same at every count: at the dig's level, as today's share counts it.
    expect(seen.updates.every((dig) => JSON.stringify(dig) === JSON.stringify({ level: 1, free: false }))).toBe(true);
    // Today's single share (steps of 5) is still there, unchanged, and no new question's shares.
    const today = await roomWith({ windows: [PAID_DAY] }).readRoom(R22_DIG);
    expect(answer.digSharePercent).toBe(today.digSharePercent);
    expect(answer).toMatchObject({ room: "FITS", reserve: "KEPT" });
    expect("startShareByPaths" in answer).toBe(false);
    expect("startSharePercent" in answer).toBe(false);
  });

  it("the brief's made-up three: [3, 5, 6] for 1..3 paths", async () => {
    const answer = await roomWith({ windows: [PAID_DAY] }).readRoom({ ...PATHS_DIG, dig: { ...PATHS_DIG.dig!, paths: { maxPaths: 3, web: "QUICK" } } });
    expect(answer.digShareByPaths).toEqual([3, 5, 6]);
  });

  it("a THOROUGH dig asks its web part at THOROUGH; a dig with no web depth counts arguing and what follows alone", async () => {
    const seen = asked();
    await roomWith({ windows: [PAID_DAY], asked: seen }).readRoom({ ...PATHS_DIG, dig: { ...PATHS_DIG.dig!, mode: "thorough", paths: { maxPaths: 2, web: "THOROUGH" } } });
    expect(seen.pathsWeb).toEqual([1, 2].map((paths) => ({ depth: "THOROUGH", paths, origin: "DIG" })));
    const plain = await roomWith({ windows: [PAID_DAY] }).readRoom({ ...PATHS_DIG, dig: { ...PATHS_DIG.dig!, paths: { maxPaths: 3, web: null } } });
    // 10 000 a path + 15 000: 2.5%, 3.5%, 4.5%, half up.
    expect(plain.digShareByPaths).toEqual([3, 4, 5]);
  });

  it("Free (no web search): arguing and what follows, of its month", async () => {
    const seen = asked();
    const answer = await roomWith({ windows: [FREE_MONTH], asked: seen }).readRoom({ access: ACCESS, settingsClass: FREE_DIG_CLASS,
      dig: { parentRunId: PARENT, mode: "quick", picks: 3, paths: { maxPaths: 3, web: null } } });
    expect(answer.digShareByPaths).toEqual([3, 4, 5]);
    expect(seen.pathsWeb).toEqual([]);
    expect(seen.updates.every((dig) => JSON.stringify(dig) === JSON.stringify({ level: 1, free: true }))).toBe(true);
  });

  it("none on an R22 dig: today's answer, byte for byte, and no estimate per path count", async () => {
    const seen = asked();
    const answer = await roomWith({ windows: [PAID_DAY], asked: seen }).readRoom(R22_DIG);
    expect("digShareByPaths" in answer).toBe(false);
    expect(answer).toEqual({ room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null, digSharePercent: 5, reserve: "KEPT" });
    expect(seen.estimates).toEqual([null]);
    expect(seen.pathsWeb).toEqual([]);
  });

  it("none on an internal grant, without a money-rule window, or on a class with no shape", async () => {
    const granted = await roomWith({ windows: [PAID_DAY], grant: true }).readRoom(PATHS_DIG);
    expect("digShareByPaths" in granted).toBe(false);
    expect("digSharePercent" in granted).toBe(false);
    for (const windows of [[V3_DAY], []] as const) {
      expect("digShareByPaths" in await roomWith({ windows }).readRoom(PATHS_DIG), String(windows.length)).toBe(false);
    }
    const { shape: _shape, ...unshaped } = PLUS_DIG_CLASS;
    expect("digShareByPaths" in await roomWith({ windows: [PAID_DAY] }).readRoom({ ...PATHS_DIG, settingsClass: unshaped })).toBe(false);
  });

  it("a new question's read never carries a dig's shares, and its own shares are unchanged", async () => {
    const answer = await roomWith({ windows: [PAID_DAY] }).readRoom({ access: ACCESS,
      settingsClass: { ...PLUS_DIG_CLASS, shape: { ...SHAPE, paths: 5 } }, start: { maxPaths: 3, web: null } });
    expect("digShareByPaths" in answer).toBe(false);
    expect(answer.startShareByPaths).toEqual([2, 3, 4]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// GET /v1/asks/room
// ---------------------------------------------------------------------------------------------------------------------

const POLICY = debateShapePolicyStartValues();
const POLICY_ON: DebateShapePolicy = { ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() };
const ENGINE = engineVersionPolicyStartValues();
const SHAPE_WORDS = { short: POLICY.answerLength.short.words, standard: POLICY.answerLength.standard.words, detailed: POLICY.answerLength.detailed.words };
const PREVIEW_SEARCH = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash"],
  premium_model_ids: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash"],
  requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/provider-budget.sock",
  perplexity_budget_socket: "/run/debateai-v3-preview/perplexity-budget.sock", scope_id: "dig-share-paths"
}))! as PreviewProviderTestConfig;
const FITS = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null } as const;
const digUrl = (tier: "premium" | "free", mode: "quick" | "thorough" = "quick", depth = 1) =>
  `/v1/asks/room?plan_tier=${tier}&composition_budget_tier=low&depth=${String(depth)}&dig_parent=${PARENT}&dig_mode=${mode}&dig_picks=3`;

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" as const }),
    readAnswer: async () => null, readRunAnswer: async () => null, readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null, readLedgerDigest: async () => null, readNode: async () => null,
    recordInvestigation: async () => null, unlinkMemoryLink: async () => null,
    readDeployment: async () => ({ register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" } }),
    events: async function* () {}
  };
}

type RouteRead = Readonly<{ status: number; body: string; questions: RoomQuestion[] }>;
/** The room stand-in: a dig's share of 10, and the counts 3, 4, 5, … for each path count the question asks. */
async function readRoute(input: Readonly<{
  url: string; noEngine?: boolean;
  view?: Readonly<{ debateShapePolicy?: DebateShapePolicy; modelScorecardInForce?: boolean; previewProviderTestConfig?: PreviewProviderTestConfig }>;
}>): Promise<RouteRead> {
  const identity = testHttpIdentity("dig-share-paths");
  const questions: RoomQuestion[] = [];
  const askRoom: AskRoomReader = {
    readRoom: async (question): Promise<AskRoomAnswer> => {
      questions.push(question);
      const paths = question.dig?.paths;
      return Object.freeze({ room: "FITS" as const, scope: null, resetsAt: null, waitingRunRef: null, planId: null, digSharePercent: 10,
        ...(paths === undefined ? {} : { digShareByPaths: Object.freeze(Array.from({ length: paths.maxPaths }, (_, index) => index + 3)) }) });
    }
  };
  const view: AdmissionView = Object.freeze({ registerVersion: 79, debateShapePolicy: POLICY_ON,
    ...(input.noEngine === true ? {} : { engineVersionPolicy: ENGINE }), modelScorecardInForce: false, ...input.view });
  const api = buildApi({
    application: fixtureApplication(), sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN,
    askRoom, admissionView: async () => view
  });
  try {
    const response = await api.inject({ method: "GET", url: input.url, headers: testSessionHeaders(identity) });
    return { status: response.statusCode, body: response.body, questions };
  } finally {
    await api.close();
  }
}

describe("GET /v1/asks/room gives a path debate's dig its share for each number of paths", () => {
  it("premium, where the start step runs: up to How wide's widest, the dig's own class unchanged, beside today's share", async () => {
    const read = await readRoute({ url: digUrl("premium") });
    expect(read.status).toBe(200);
    expect(read.questions).toHaveLength(1);
    expect(read.questions[0]!.dig).toEqual({ parentRunId: PARENT, mode: "quick", picks: 3, paths: { maxPaths: 7, web: null } });
    // The room is measured on the dig's own class, as today; no new question's start.
    expect(read.questions[0]!.settingsClass.shape?.paths).toBeUndefined();
    expect(read.questions[0]!.start).toBeUndefined();
    expect(read.body).toBe(JSON.stringify({ ...FITS, shape_settings: true, answer_words: SHAPE_WORDS, settings_version: 79,
      dig_share_percent: 10, dig_share_by_paths: [3, 4, 5, 6, 7, 8, 9] }));
    expect(AskRoomResponseSchema.safeParse(JSON.parse(read.body)).success).toBe(true);
  });

  it("Free: three paths at most, and no web part", async () => {
    const read = await readRoute({ url: digUrl("free"), view: { previewProviderTestConfig: PREVIEW_SEARCH } });
    expect(read.questions[0]!.dig?.paths).toEqual({ maxPaths: 3, web: null });
    expect(JSON.parse(read.body).dig_share_by_paths).toEqual([3, 4, 5]);
  });

  it("the web part follows the dig's own rule: a search gate on a paid plan, in the dig's own mode whatever the depth", async () => {
    const view = { previewProviderTestConfig: PREVIEW_SEARCH };
    expect((await readRoute({ url: digUrl("premium", "quick", 2), view })).questions[0]!.dig?.paths).toEqual({ maxPaths: 7, web: "QUICK" });
    expect((await readRoute({ url: digUrl("premium", "thorough", 1), view })).questions[0]!.dig?.paths).toEqual({ maxPaths: 7, web: "THOROUGH" });
  });

  it("an R22 dig (the switch off, no engine 2, or a VALID scorecard): no path counts asked, today's body byte for byte", async () => {
    const today = JSON.stringify({ ...FITS, shape_settings: true, answer_words: SHAPE_WORDS, settings_version: 79, dig_share_percent: 10 });
    for (const change of [{ view: { debateShapePolicy: POLICY } }, { noEngine: true }, { view: { modelScorecardInForce: true } }] as const) {
      const label = JSON.stringify(change);
      const read = await readRoute({ url: digUrl("premium"), ...change });
      expect(read.body, label).toBe(today);
      expect(read.questions[0]!.dig, label).toEqual({ parentRunId: PARENT, mode: "quick", picks: 3 });
    }
  });

  it("a new question's read asks no dig's counts", async () => {
    const read = await readRoute({ url: "/v1/asks/room?plan_tier=premium&composition_budget_tier=low&depth=1" });
    expect(read.questions[0]!.dig).toBeUndefined();
    expect(JSON.parse(read.body)).not.toHaveProperty("dig_share_by_paths");
  });
});

describe("the contract: dig_share_by_paths", () => {
  const DIG = { ...FITS, dig_share_percent: 10 } as const;
  it("goes beside a dig's own share, one whole percent per path count, 1 to 7 of them", () => {
    expect(AskRoomResponseSchema.safeParse({ ...DIG, dig_share_by_paths: [3, 5, 6] }).success).toBe(true);
    expect(AskRoomResponseSchema.safeParse({ ...DIG, dig_share_by_paths: [0, 1, 2, 3, 4, 5, 100] }).success).toBe(true);
    for (const shares of [[], [1, 2, 3, 4, 5, 6, 7, 8], [101], [-1], [2.5]]) {
      expect(AskRoomResponseSchema.safeParse({ ...DIG, dig_share_by_paths: shares }).success, JSON.stringify(shares)).toBe(false);
    }
  });

  it("never without a dig's share, nor beside a new question's share or start step", () => {
    expect(AskRoomResponseSchema.safeParse({ ...FITS, dig_share_by_paths: [3, 5, 6] }).success).toBe(false);
    expect(AskRoomResponseSchema.safeParse({ ...FITS, start_share_percent: 5, dig_share_by_paths: [3, 5, 6] }).success).toBe(false);
    expect(AskRoomResponseSchema.safeParse({ ...FITS, start_step: { lists: "ON", widths: { options: [3], default: 3 } },
      dig_share_by_paths: [3, 5, 6] }).success).toBe(false);
  });
});

describe("the page's line: digShareLine(room, paths)", () => {
  const room = (extra: Readonly<Record<string, unknown>> = {}): PageRoom =>
    ({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", ...extra }) as PageRoom;
  const line = (percent: number) => ({ key: "v4.dig.quotaShare", values: { percent } });

  it("with the dig's paths and the read's shares: that count's entry (the nearest for a count outside them)", () => {
    const read = room({ dig_share_percent: 10, dig_share_by_paths: [3, 5, 6] });
    expect(digShareLine(read, 3)).toEqual(line(6));
    expect(digShareLine(read, 2)).toEqual(line(5));
    expect(digShareLine(read, 1)).toEqual(line(3));
    expect(digShareLine(read, 4)).toEqual(line(6));
  });

  it("without a count, or on an R22 read: today's single share, as before", () => {
    expect(digShareLine(room({ dig_share_percent: 10, dig_share_by_paths: [3, 5, 6] }))).toEqual(line(10));
    const r22 = room({ dig_share_percent: 10 });
    expect(digShareLine(r22, 2)).toEqual(digShareLine(r22));
    expect(digShareLine(r22, 2)).toEqual(line(10));
  });

  it("no line for a share of 0 or none", () => {
    expect(digShareLine(room({ dig_share_percent: 10, dig_share_by_paths: [0, 5, 6] }), 1)).toBeNull();
    expect(digShareLine(room(), 2)).toBeNull();
    expect(digShareLine(null, 2)).toBeNull();
  });
});
