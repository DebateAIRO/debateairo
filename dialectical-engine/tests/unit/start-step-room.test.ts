/**
 * V4 start step, Task 38 (spec 2026-11-03 §2.6 "the live share of your allowance, never a price"): the room read gives,
 * for a new question whose start step runs, the share of today a debate of 1, 2, … paths would take (whole percents, so
 * a change of one path shows), and the route says whether the lists run before Start and How wide's widths. A dig, an
 * internal grant, a read with no money-rule window and a version without the switch keep today's answer. Every figure
 * here is made up.
 */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { buildApi, type AdmissionView, type AskApplication } from "@debateai/api";
import { AskRoomResponseSchema } from "@debateai/contract";
import type { PersonWindow, RunSettingsClass } from "@debateai/budget";
import type { InternalGrant } from "@debateai/kernel";
import { parsePreviewProviderTestConfig, type PreviewProviderTestConfig } from "@debateai/providers";
import {
  debateShapePolicyStartValues, debateShapeStartStepStartValues, engineVersionPolicyStartValues, type DebateShapePolicy
} from "@debateai/register";
import { AskRoom, wholeSharePercent, type AskRoomAnswer, type AskRoomReader, type RoomQuestion } from "../../apps/api/src/ask-room.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const NOW = new Date("2026-11-04T12:00:00.000Z");
const OWNER = "7e1f6c1a-3b9d-4d5e-8f00-000000000038";
/** A made-up day of 1 000 000 micro-units: 10 000 is 1%. */
const DAY_LIMIT = 1_000_000;
const PAID_DAY: PersonWindow = Object.freeze({ scope: "PERSON_DAY", limitMicros: DAY_LIMIT, periodStart: new Date("2026-11-04T00:00:00.000Z"),
  resetsAt: new Date("2026-11-05T00:00:00.000Z"), finishBasisPoints: 10_000, closeBasisPoints: 9_500, borrows: true });
/** Free's only window, its month, with its reserve on top of its credit (none kept inside). */
const FREE_MONTH: PersonWindow = Object.freeze({ scope: "PERSON_MONTH", limitMicros: DAY_LIMIT, periodStart: new Date("2026-11-01T00:00:00.000Z"),
  resetsAt: new Date("2026-12-01T00:00:00.000Z"), finishBasisPoints: 10_000, closeBasisPoints: 9_500, keepsReserveMicros: 0 });
/** A window before the money rule (no borrow, no reserve): no share is shown on it. */
const V3_DAY: PersonWindow = Object.freeze({ scope: "PERSON_DAY", limitMicros: DAY_LIMIT, periodStart: PAID_DAY.periodStart,
  resetsAt: PAID_DAY.resetsAt, finishBasisPoints: 10_000, closeBasisPoints: 9_500 });

const SHAPE = Object.freeze({ plan: "plus" as const, depthMode: "adaptive" as const, scrutiny: "standard" as const, answerLength: "standard" as const });
const PLUS_CLASS: RunSettingsClass = Object.freeze({ planTier: "premium", compositionBudgetTier: "low", makerCount: 4, depth: 1,
  shape: Object.freeze({ ...SHAPE, paths: 5 }) });
const FREE_CLASS: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "low", makerCount: 2, depth: 1,
  shape: Object.freeze({ ...SHAPE, plan: "free" as const, paths: 3 }) });
const ACCESS = Object.freeze({ ownerRef: OWNER, legacyAskerId: null });

type Asked = { estimates: Array<number | null>; web: unknown[] };
/** Made-up estimator: 10 000 per path of arguing (50 000 for a class with no paths), 5 000 per path of web. */
function roomWith(input: Readonly<{ windows: readonly PersonWindow[]; asked?: Asked; grant?: boolean; noPathsWeb?: boolean }>): AskRoom {
  const asked = input.asked ?? { estimates: [], web: [] };
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
        asked.estimates.push(paths);
        return paths === null ? 50_000 : paths * 10_000;
      },
      ...(input.noPathsWeb === true ? {} : { pathsWebPartMicros: (web: Readonly<{ depth: "QUICK" | "THOROUGH"; paths: number }>) => {
        asked.web.push(web);
        return web.paths * 5_000;
      } })
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

const PLUS_QUESTION: RoomQuestion = Object.freeze({ access: ACCESS, settingsClass: PLUS_CLASS, start: Object.freeze({ maxPaths: 7, web: "QUICK" as const }) });
const FREE_QUESTION: RoomQuestion = Object.freeze({ access: ACCESS, settingsClass: FREE_CLASS, start: Object.freeze({ maxPaths: 3, web: null }) });

describe("wholeSharePercent: a whole percent of today, so one more path always shows", () => {
  it("is 0 for nothing, else half up, at least 1 and at most 100", () => {
    expect([0, 1, 14_999, 15_000, 2_000_000].map((estimate) => wholeSharePercent(estimate, DAY_LIMIT))).toEqual([0, 1, 1, 2, 100]);
  });

  it("refuses an estimate or a limit that is not a whole number of micro-units, a negative estimate and a limit of 0", () => {
    for (const [estimate, limit] of [[-1, DAY_LIMIT], [1.5, DAY_LIMIT], [Number.NaN, DAY_LIMIT], [1, 0], [1, -5], [1, 2.5]] as const) {
      expect(() => wholeSharePercent(estimate, limit), `${String(estimate)} of ${String(limit)}`).toThrowError(RangeError);
    }
  });
});

describe("the room read's share for each number of paths", () => {
  it("a paid new question that searches: each path count's arguing plus its web part, as a whole share of today", async () => {
    const asked: Asked = { estimates: [], web: [] };
    const answer = await roomWith({ windows: [PAID_DAY], asked }).readRoom(PLUS_QUESTION);
    // 10 000 + 5 000 per path of a 1 000 000 day: 1.5% a path, half up.
    expect(answer.startShareByPaths).toEqual([2, 3, 5, 6, 8, 9, 11]);
    expect(asked.web).toEqual([1, 2, 3, 4, 5, 6, 7].map((paths) => ({ depth: "QUICK", paths })));
    // The room itself is measured for the question's own class (5 paths); then one estimate per path count.
    expect(asked.estimates).toEqual([5, 1, 2, 3, 4, 5, 6, 7]);
    // Today's share in steps of 5 is still there, for the question's own class.
    expect(answer).toMatchObject({ room: "FITS", startSharePercent: 5, reserve: "KEPT" });
    expect(Object.isFrozen(answer.startShareByPaths)).toBe(true);
  });

  it("Free (no web search): arguing alone, of its month", async () => {
    const asked: Asked = { estimates: [], web: [] };
    const answer = await roomWith({ windows: [FREE_MONTH], asked }).readRoom(FREE_QUESTION);
    expect(answer.startShareByPaths).toEqual([1, 2, 3]);
    expect(asked.web).toEqual([]);
    expect(asked.estimates).toEqual([3, 1, 2, 3]);
  });

  it("a THOROUGH start asks the web part at THOROUGH; an estimator with no web part counts arguing alone", async () => {
    const asked: Asked = { estimates: [], web: [] };
    await roomWith({ windows: [PAID_DAY], asked }).readRoom({ ...PLUS_QUESTION, start: { maxPaths: 3, web: "THOROUGH" } });
    expect(asked.web).toEqual([1, 2, 3].map((paths) => ({ depth: "THOROUGH", paths })));
    const plain = await roomWith({ windows: [PAID_DAY], noPathsWeb: true }).readRoom(PLUS_QUESTION);
    expect(plain.startShareByPaths).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("none without a start: today's answer, and no extra estimate", async () => {
    const asked: Asked = { estimates: [], web: [] };
    const { start: _start, ...question } = PLUS_QUESTION;
    const answer = await roomWith({ windows: [PAID_DAY], asked }).readRoom(question);
    expect("startShareByPaths" in answer).toBe(false);
    expect(answer).toEqual({ room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null, startSharePercent: 5, reserve: "KEPT" });
    expect(asked).toEqual({ estimates: [5], web: [] });
  });

  it("none on a dig, even beside a start: the dig's own share instead", async () => {
    const answer = await roomWith({ windows: [PAID_DAY] }).readRoom({ ...PLUS_QUESTION, dig: { parentRunId: OWNER, mode: "quick", picks: 1 } });
    expect("startShareByPaths" in answer).toBe(false);
    expect(answer.digSharePercent).toBe(5);
  });

  it("none on an internal grant: no money-rule member at all", async () => {
    const answer = await roomWith({ windows: [PAID_DAY], grant: true }).readRoom(PLUS_QUESTION);
    expect("startShareByPaths" in answer).toBe(false);
    expect("startSharePercent" in answer).toBe(false);
    expect(answer.funding).toEqual({ kind: "INTERNAL", expiresAt: new Date("2026-11-20T00:00:00.000Z") });
  });

  it("none without a money-rule window (a window before the rule, or none: billing off), and none on a class with no shape", async () => {
    for (const windows of [[V3_DAY], []] as const) {
      expect("startShareByPaths" in await roomWith({ windows }).readRoom(PLUS_QUESTION), String(windows.length)).toBe(false);
    }
    const { shape: _shape, ...unshaped } = PLUS_CLASS;
    expect("startShareByPaths" in await roomWith({ windows: [PAID_DAY] }).readRoom({ ...PLUS_QUESTION, settingsClass: unshaped })).toBe(false);
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
  perplexity_budget_socket: "/run/debateai-v3-preview/perplexity-budget.sock", scope_id: "start-step-room"
}))! as PreviewProviderTestConfig;
const FITS = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null } as const;
const DIG_PARENT = "3c0a3c1e-5c0e-4c4e-8a38-000000000038";
const premiumUrl = (depth = 1) => `/v1/asks/room?plan_tier=premium&composition_budget_tier=low&depth=${String(depth)}`;
const FREE_URL = "/v1/asks/room?plan_tier=free&composition_budget_tier=low&depth=1";

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
async function readRoute(input: Readonly<{
  url: string; route?: "PREVIEW" | "NONE"; signedIn?: boolean; reader?: boolean; noEngine?: boolean;
  view?: Readonly<{ debateShapePolicy?: DebateShapePolicy; modelScorecardInForce?: boolean; previewProviderTestConfig?: PreviewProviderTestConfig }>;
  answer?: (question: RoomQuestion) => AskRoomAnswer;
}>): Promise<RouteRead> {
  const identity = testHttpIdentity("start-step-room");
  const questions: RoomQuestion[] = [];
  const askRoom: AskRoomReader = {
    readRoom: async (question) => {
      questions.push(question);
      return input.answer?.(question) ?? Object.freeze({ room: "FITS" as const, scope: null, resetsAt: null, waitingRunRef: null, planId: null,
        ...(question.start === undefined ? {} : { startShareByPaths: Object.freeze(Array.from({ length: question.start.maxPaths }, (_, index) => (index + 1) * 2)) }) });
    }
  };
  const view: AdmissionView = Object.freeze({ registerVersion: 38, debateShapePolicy: POLICY_ON,
    ...(input.noEngine === true ? {} : { engineVersionPolicy: ENGINE }), modelScorecardInForce: false, ...input.view });
  const api = buildApi({
    application: fixtureApplication(), sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN,
    ...(input.reader === false ? {} : { askRoom }),
    admissionView: async () => view,
    ...(input.route === undefined ? {} : { startStep: { route: input.route } })
  });
  try {
    const response = await api.inject({ method: "GET", url: input.url, ...(input.signedIn === false ? {} : { headers: testSessionHeaders(identity) }) });
    return { status: response.statusCode, body: response.body, questions };
  } finally {
    await api.close();
  }
}

describe("GET /v1/asks/room says the start step", () => {
  it("premium: the lists, How wide's widths and one share per path count up to the widest; the room estimates the default width", async () => {
    const read = await readRoute({ url: premiumUrl(), route: "PREVIEW" });
    expect(read.status).toBe(200);
    expect(read.body).toBe(JSON.stringify({ ...FITS, shape_settings: true, answer_words: SHAPE_WORDS, settings_version: 38,
      start_step: { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [2, 4, 6, 8, 10, 12, 14] } }));
    expect(AskRoomResponseSchema.safeParse(JSON.parse(read.body)).success).toBe(true);
    expect(read.questions).toHaveLength(1);
    // No search gate on this version: the share counts no web part.
    expect(read.questions[0]!.start).toEqual({ maxPaths: 7, web: null });
    expect(read.questions[0]!.settingsClass.shape).toEqual({ plan: "premium", depthMode: "adaptive", scrutiny: "standard", answerLength: "standard", paths: 5 });
  });

  it("free: one width, three paths, three shares", async () => {
    const read = await readRoute({ url: FREE_URL, route: "PREVIEW" });
    expect(JSON.parse(read.body).start_step).toEqual({ lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [2, 4, 6] });
    expect(read.questions[0]!.start).toEqual({ maxPaths: 3, web: null });
    expect(read.questions[0]!.settingsClass.shape?.paths).toBe(3);
  });

  it("the web part follows the ask's own rule: a search gate on a paid plan, QUICK below depth 2, THOROUGH from it; never on Free", async () => {
    const view = { previewProviderTestConfig: PREVIEW_SEARCH };
    expect((await readRoute({ url: premiumUrl(1), view })).questions[0]!.start).toEqual({ maxPaths: 7, web: "QUICK" });
    expect((await readRoute({ url: premiumUrl(2), view })).questions[0]!.start).toEqual({ maxPaths: 7, web: "THOROUGH" });
    expect((await readRoute({ url: FREE_URL, view })).questions[0]!.start).toEqual({ maxPaths: 3, web: null });
  });

  it("lists OFF on the NONE route and with no start step composed", async () => {
    for (const route of ["NONE", undefined] as const) {
      const read = await readRoute({ url: premiumUrl(), ...(route === undefined ? {} : { route }) });
      expect(JSON.parse(read.body).start_step, String(route)).toEqual({ lists: "OFF", widths: { options: [3, 5, 7], default: 5 },
        share_by_paths: [2, 4, 6, 8, 10, 12, 14] });
    }
  });

  it("no share_by_paths when the room gives none (an internal grant, billing off); the widths still come", async () => {
    const read = await readRoute({ url: premiumUrl(), answer: () => ({ room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null }) });
    expect(JSON.parse(read.body).start_step).toEqual({ lists: "OFF", widths: { options: [3, 5, 7], default: 5 } });
    const noReader = await readRoute({ url: premiumUrl(), reader: false });
    expect(JSON.parse(noReader.body).start_step).toEqual({ lists: "OFF", widths: { options: [3, 5, 7], default: 5 } });
  });

  it("none on a dig's read: no start in the question, no start_step in the body", async () => {
    const read = await readRoute({ url: `${premiumUrl()}&dig_parent=${DIG_PARENT}&dig_mode=quick&dig_picks=2`, route: "PREVIEW",
      answer: () => ({ room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null, digSharePercent: 10 }) });
    expect(read.status).toBe(200);
    expect(read.questions[0]!.start).toBeUndefined();
    expect(read.questions[0]!.settingsClass.shape?.paths).toBeUndefined();
    expect(JSON.parse(read.body)).not.toHaveProperty("start_step");
    expect(JSON.parse(read.body).dig_share_percent).toBe(10);
  });

  it("today's body, byte for byte, without the switch, without engine 2 or with a VALID scorecard; a signed-out read never reaches the room", async () => {
    const today = JSON.stringify({ ...FITS, shape_settings: true, answer_words: SHAPE_WORDS, settings_version: 38 });
    for (const change of [{ view: { debateShapePolicy: POLICY } }, { noEngine: true }, { view: { modelScorecardInForce: true } }] as const) {
      const view = JSON.stringify(change);
      const read = await readRoute({ url: premiumUrl(), route: "PREVIEW", ...change });
      expect(read.body, view).toBe(today);
      expect(read.questions[0]!.start, view).toBeUndefined();
      expect(read.questions[0]!.settingsClass.shape?.paths, view).toBeUndefined();
    }
    const signedOut = await readRoute({ url: premiumUrl(), route: "PREVIEW", signedIn: false });
    expect(signedOut.status).toBe(401);
    expect(signedOut.body).not.toContain("start_step");
    expect(signedOut.questions).toEqual([]);
  });
});
