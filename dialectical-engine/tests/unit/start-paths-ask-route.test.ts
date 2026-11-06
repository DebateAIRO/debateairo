// tests/unit/start-paths-ask-route.test.ts
// V4 start step, Task 36 (spec 2026-11-03 §4.2; read-d2, choose-d2, read-d3; owner answer Q8 of 4 Nov): POST /v1/asks AT START. The route
// screens everything the person wrote on step 2 for a crisis first, then (after today's checks) verifies the paths signed at Next with the
// one binding Next used, and hands them to `submit`. The question check runs once at most: on the person's own words only when the line is
// the one checked at Next, on the whole line as it now reads when it changed on step 2; the answers the page wrote into the line are said
// once. References have no lifetime; a settings version that moved keeps the paths unless fewer are now allowed (409 NARROWED). A
// version without the switch keeps today's ask. The route's own body limit carries the largest legal Start. Every question, path and
// figure here is made up.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askRefusalStatus, buildApi, type AdmissionView, type AskApplication } from "@debateai/api";
import {
  CRISIS_SUPPORT_OFFERED, START_STEP_LIMITS, StartListSchema, StartMenuSchema, purposeAnswerSentence, purposeLinesUnsaid,
  type AskRequest, type PurposeAnswer, type SignedStartList, type SignedStartMenu, type StartList, type StartMenu, type StartPathChoice,
  type StartPaths
} from "@debateai/contract";
import {
  debateShapePolicyStartValues, debateShapeStartStepStartValues, engineVersionPolicyStartValues, type DebateShapePlanKey, type DebateShapePolicy
} from "@debateai/register";
import { digPickAuthorOf } from "../../apps/api/src/dig-admission.js";
import { questionWithPurposeLines } from "../../apps/api/src/purpose-lines.js";
import type { QuestionCheckOutcome } from "../../apps/api/src/question-check/contract.js";
import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import {
  startQuestionCheckText, startStepOnInView, startTextsOfBody, startWidthsOfView, type AskStartHandOver
} from "../../apps/api/src/start-paths-at-ask.js";
import {
  newStartStepKey, signStartCheck, signStartList, signStartMenu, startDigTryRefOf, startTryRefOfCheck
} from "../../apps/api/src/start-step/signing.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const KEY = newStartStepKey();
const IDENTITY = testHttpIdentity("start-paths-ask-route");
const SCOPE = `owner:${IDENTITY.authenticated.ownerRef}`;
const HEADERS = testSessionHeaders(IDENTITY, true);
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PARENT_RUN_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVE = 31;
const NOW = new Date("2026-11-04T10:00:00.000Z");
const FORTY_DAYS = 40 * 86_400_000;

const Q = "Should Romania build new nuclear plants?";
const OTHER_Q = "Should Romania close its nuclear plants?";
const Q_EDITED = `${Q}\n\nUp to 2050.\nAnd what about jobs?`;
const WASTE = Object.freeze({ title: "Nuclear waste", question: "Where would the waste be kept for centuries?" });
const CRISIS = "I want to kill myself tonight";
const ROMANIA: PurposeAnswer = Object.freeze({ question: "Which country or region is this about?", answer: "Romania" });

const LOCK: QuestionLanguageLock = Object.freeze({
  language: Object.freeze({ code: "en", name: "English" }), source: "ELD_SITE", siteLanguage: "en", rewriteAccepted: false,
  originalQuestionLine: null, trace: Object.freeze({ eld: null, fast: null, contractHash: null }), recordCode: "ELD_SITE", localReason: null
});

/* The made-up nuclear reading: two lists merged into one menu of eight one-viewpoint paths, and a third list late. */
const ANGLES = [{ angle_id: "g1", kind: "PRACTICAL", label: "What building it would take" }] as const;
const vp = (viewpoint_id: string, title: string, question: string) => ({ viewpoint_id, title, question, why: "Made-up reason.", angle_id: "g1" });
const VIEWPOINTS = [
  vp("pt11", "Whole-system costs", "What would new plants cost households once the whole power system is counted?"),
  vp("pt12", "A calm winter week", "What happens to the power in a cold winter week with little wind or sun?"),
  vp("pt13", "Grid reserves", "Is there enough reserve power for the hardest weeks?"),
  vp("pt14", "Imports of fuel", "Would new plants depend on imported fuel?"),
  vp("pt21", "Using less power first", "Would using less power first do more good than building new plants?"),
  vp("pt22", "Unproven designs", "Are the new reactor designs proven enough to build?"),
  vp("pt23", "Building delays", "How likely are long building delays, and who would pay for them?"),
  vp("pt24", "Jobs in the regions", "What would new plants mean for jobs in the regions?")
];
const LIST3: StartList = StartListSchema.parse({ list_no: 3, angles: ANGLES,
  viewpoints: [vp("pt31", "Cooling water in hot summers", "Will rivers stay cool enough in hot summers to cool the plants?")] });
const MENU: StartMenu = StartMenuSchema.parse({
  menu_id: "nuclearAskRouteMadeUp1", revision: 1, language: { code: "en", name: "English" }, angles: ANGLES,
  viewpoints: VIEWPOINTS.map((one) => ({ ...one, repeat_ids: [] })), repeats: [],
  paths: VIEWPOINTS.map((one, index) => ({ path_ref: `kp0${index + 1}`, title: one.title, question: one.question,
    viewpoint_ids: [one.viewpoint_id], put_together: false, is_new: false })),
  cards: [], suggestions: []
});

type Signing = Readonly<{ questionLine?: string; planKey?: DebateShapePlanKey; settingsVersion?: number }>;
const bound = (over: Signing = {}) => ({ ownerScope: SCOPE, questionLine: over.questionLine ?? Q, planKey: over.planKey ?? "premium" as DebateShapePlanKey,
  settingsVersion: over.settingsVersion ?? ACTIVE });
const checkRef = (over: Signing = {}) => signStartCheck(KEY, { ...bound(over), lock: LOCK, originalQuestionLine: null });
const signedMenu = (over: Signing = {}): SignedStartMenu => ({ menu: MENU, ref: signStartMenu(KEY, { ...bound(over), menu: MENU }) });
const signedLate = (over: Signing = {}): SignedStartList => ({ list: LIST3, ref: signStartList(KEY, { ...bound(over), list: LIST3 }) });
/** One character of the signature changed. */
const flippedMac = (ref: string) => `${ref.slice(0, -2)}${ref.at(-2) === "A" ? "B" : "A"}${ref.at(-1)!}`;

/** A menu path as the AIs suggested it: its one viewpoint, in its own words. */
const menuPathOf = (index: number): StartPathChoice => ({ title: VIEWPOINTS[index]!.title, question: VIEWPOINTS[index]!.question,
  members: [{ viewpoint_id: VIEWPOINTS[index]!.viewpoint_id }] });
const FIVE = [0, 1, 2, 3, 4].map(menuPathOf);
const SEVEN = [0, 1, 2, 3, 4, 5, 6].map(menuPathOf);
/** The person's own path: "Nuclear waste". */
const OWN_PATH: StartPathChoice = { ...WASTE, members: [{ own_text: WASTE.question }] };
const WITH_OWN = [...FIVE.slice(0, 4), OWN_PATH];

const baseAsk = (extra: Partial<AskRequest> = {}): AskRequest => ({ question_line: Q, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:start", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "start at the ask route",
  as_of: "2026-11-04T00:00:00.000Z", steering_presets: [], plan_tier: "premium", steering_annotations: [], ...extra });
const pathsOf = (over: Partial<StartPaths> = {}, signing: Signing = {}): StartPaths => ({
  source: "MENU", menu: signedMenu(signing), paths: [...FIVE], width: 5, chosen_by: "PERSON", ...over });
/** A Start from the reading of Q: its check and its chosen paths; `signing` moves every reference's binding at once. */
const startAsk = (extra: Partial<AskRequest> = {}, over: Partial<StartPaths> = {}, signing: Signing = {}): AskRequest =>
  baseAsk({ start_check: { ref: checkRef(signing) }, start_paths: pathsOf(over, signing), ...extra });
const withoutCheck = (request: AskRequest): AskRequest => {
  const { start_check: _check, ...rest } = request;
  void _check;
  return rest;
};

const POLICY_ON: DebateShapePolicy = { ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() };
const POLICY_NARROW: DebateShapePolicy = { ...POLICY_ON,
  startStep: { widths: { ...POLICY_ON.startStep!.widths, premium: { options: [3, 5], default: 5 } } } };
const POLICY_OFF: DebateShapePolicy = debateShapePolicyStartValues();
const ENGINE = engineVersionPolicyStartValues();
const viewOf = (policy: DebateShapePolicy): AdmissionView => Object.freeze({ registerVersion: ACTIVE, debateShapePolicy: policy,
  engineVersionPolicy: ENGINE, modelScorecardInForce: false });

/*
 * Task 36b: a stranger's public page, made up. Its one path is "pos-1"; the run behind it is PUBLIC_PARENT_RUN_ID, which the page never
 * shows. The join after submit is refused (NOT_PUBLIC), so the route answers 202 with `public_dig_not_joined`: only the hand-over is read.
 */
const PUBLIC_REF = "33333333-3333-4333-8333-333333333333";
const PUBLIC_PARENT_RUN_ID = "44444444-4444-4444-8444-444444444444";
const PUBLIC_TREE = Object.freeze({
  pool: {} as never,
  tree: { readTreeOfRun: async () => null, readDigParent: async () => ({ root_run_id: PUBLIC_PARENT_RUN_ID, parent_run_id: PUBLIC_PARENT_RUN_ID,
    level: 0, writing: false }), join: async () => ({ outcome: "NOT_PUBLIC" as const, digLevel: null }) } as never,
  contributions: {} as never,
  readPublicDebate: async () => ({ story_short: { paths: [{ position_ref: "pos-1", node_refs: [] }] } }) as never
});

type Over = Readonly<{ view?: AdmissionView | null; outcome?: QuestionCheckOutcome; key?: "NONE"; dig?: boolean; publicTree?: boolean;
  suggestions?: Readonly<Record<string, string>>; linkFails?: boolean }>;
function apiOver(over: Over = {}) {
  const checked: string[] = [];
  const submitted: unknown[][] = [];
  const suggestionReads: string[] = [];
  const linked: unknown[][] = [];
  let consentReads = 0;
  const application = {
    submit: async (...args: unknown[]) => { submitted.push(args); return { run_ref: RUN_ID, status: "QUEUED" as const }; },
    readRunAnswer: async () => null,
    // Task 57c: the try's charges before Start given to the new debate (0164's link).
    linkPreStartTry: async (...args: unknown[]) => {
      linked.push(args);
      if (over.linkFails === true) throw Object.assign(new Error("database down"), { code: "57P01" });
      return 2;
    }
  } as unknown as AskApplication;
  const sessions = { ...testSessionApplication([IDENTITY]),
    readSensitiveDataConsent: async () => { consentReads += 1; return "given" as const; } };
  const api = buildApi({
    application, sessions, allowedOrigin: TEST_APP_ORIGIN,
    questionCheck: { check: async (text: string) => { checked.push(text); return over.outcome ?? { outcome: "PASS" as const }; } },
    ...(over.key === "NONE" ? {} : { startStepKey: KEY }),
    ...(over.view === null ? {} : { admissionView: async () => over.view ?? viewOf(POLICY_ON) }),
    ...(over.dig === true ? {
      digModel: { readDigLevel: async () => 0, readPause: async () => null, resume: async () => "NOT_OWNED" as const },
      investigations: { join: async () => ({ outcome: "JOINED" as const, investigationId: "inv-1", digLevel: 1 }), reopen: async () => "REOPENED" as const }
    } : {}),
    ...(over.suggestions === undefined ? {} : { digSuggestionText: async (_ownerRef: string, _parentRunId: string, suggestionId: string) => {
      suggestionReads.push(suggestionId);
      return over.suggestions?.[suggestionId] ?? null;
    } }),
    ...(over.publicTree === true ? { publicTree: PUBLIC_TREE } : {})
  } as never);
  const post = (payload: AskRequest | string) => api.inject({ method: "POST", url: "/v1/asks", payload,
    headers: typeof payload === "string" ? { ...HEADERS, "content-type": "application/json" } : HEADERS });
  return { api, post, checked, submitted, suggestionReads, linked, consentReads: () => consentReads };
}
type Harness = ReturnType<typeof apiOver>;
const handOverOf = (harness: Harness): AskStartHandOver => harness.submitted[0]![3] as AskStartHandOver;

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /v1/asks at Start: the paths signed at Next are verified and handed to submit", () => {
  it("the line as checked at Next: 202, nothing checked again, the paths handed over with the binding and the check's lock", async () => {
    const h = apiOver();
    const response = await h.post(startAsk());
    expect(response.statusCode).toBe(202);
    expect(h.checked).toEqual([]);
    expect(h.submitted).toHaveLength(1);
    expect(h.submitted[0]).toHaveLength(4);
    expect((h.submitted[0]![0] as AskRequest).question_line).toBe(Q);
    const handOver = handOverOf(h);
    expect(handOver).toEqual({ binding: { planKey: "premium", settingsVersion: ACTIVE }, lock: LOCK, verified: expect.any(Object) });
    expect(handOver.verified).toMatchObject({ source: "MENU", width: 5, questionEdited: false, ownWords: [] });
    expect(handOver.verified!.paths.map((path) => [path.pathId, path.author])).toEqual(
      ["b1", "b2", "b3", "b4", "b5"].map((pathId) => [pathId, "AI_SUGGESTION"]));
    await h.api.close();
  });

  it("with a line the question does not say (what matters): only those words are checked", async () => {
    const h = apiOver();
    expect((await h.post(startAsk({ purpose_lines: { matters: "the cost" } }))).statusCode).toBe(202);
    expect(h.checked).toEqual(["the cost"]);
    await h.api.close();
  });

  it("no start_check (an old or broken page): the whole line, then the person's own words, one per line", async () => {
    const h = apiOver();
    expect((await h.post(withoutCheck(startAsk({}, { paths: WITH_OWN })))).statusCode).toBe(202);
    expect(h.checked).toEqual([`${Q}\n\nNuclear waste\nWhere would the waste be kept for centuries?`]);
    expect(handOverOf(h)).toMatchObject({ lock: null, verified: { questionEdited: false, ownWords: [WASTE.title, WASTE.question] } });
    await h.api.close();
  });

  it("the line changed on step 2 (read-d2): one check of the whole line and the own words; the paths kept; submit gets the whole line", async () => {
    const h = apiOver();
    const response = await h.post(startAsk({ question_line: Q_EDITED }, { paths: WITH_OWN }));
    expect(response.statusCode).toBe(202);
    expect(h.checked).toEqual([`${Q}\n\nUp to 2050.\nAnd what about jobs?\n\nNuclear waste\nWhere would the waste be kept for centuries?`]);
    expect((h.submitted[0]![0] as AskRequest).question_line).toBe(Q_EDITED);
    const handOver = handOverOf(h);
    expect(handOver.verified!.questionEdited).toBe(true);
    expect(handOver.verified!.paths.map((path) => path.pathId)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
    expect(handOver.verified!.paths[4]).toMatchObject({ author: "PERSON_OWN_VIEW", title: WASTE.title, question: WASTE.question });
    expect(handOver.lock).toEqual(LOCK);
    await h.api.close();
  });

  it("read-d3: an answer the page wrote into the line is said once (Romania), as the check reads it", async () => {
    const h = apiOver();
    const line = `${Q}\n\nLooking at Romania.`;
    expect((await h.post(startAsk({ question_line: line, purpose_lines: { answers: [ROMANIA] } }))).statusCode).toBe(202);
    expect(h.checked).toEqual([line]);
    await h.api.close();
  });

  it("answersSaid: the answers are left out as said; without the option, today's lines byte for byte", () => {
    expect(purposeLinesUnsaid(Q, { answers: [ROMANIA] }, { answersSaid: true })).toEqual([]);
    expect(purposeLinesUnsaid(Q, { answers: [ROMANIA] })).toEqual([purposeAnswerSentence(ROMANIA)]);
    expect(purposeLinesUnsaid(Q, { answers: [ROMANIA], matters: "the cost", angles: ["jobs"] }, { answersSaid: true })).toEqual(["the cost", "jobs"]);
    expect(questionWithPurposeLines(Q, { answers: [ROMANIA], matters: "the cost" }, { answersSaid: true })).toBe(`${Q}\n\nthe cost`);
    expect(questionWithPurposeLines(Q, { answers: [ROMANIA] })).toBe(`${Q}\n\n${purposeAnswerSentence(ROMANIA)}`);
  });

  it("the changed line refused by the check: 422 with the check's body, submit never called", async () => {
    const outcome: QuestionCheckOutcome = { outcome: "REFUSE", kind: "DRUGS", screen: "REFUSE", emergencyNumber: false };
    const h = apiOver({ outcome });
    const response = await h.post(startAsk({ question_line: Q_EDITED }, { paths: WITH_OWN }));
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: "QUESTION_NOT_STARTED", message: "QUESTION_NOT_STARTED", kind: "DRUGS", screen: "REFUSE",
      emergency_number: false });
    expect(h.checked).toHaveLength(1);
    expect(h.submitted).toEqual([]);
    await h.api.close();
  });

  it("a changed line whose late list comes from another reading: 409 START_PATHS_STALE, nothing checked or submitted", async () => {
    const h = apiOver();
    const response = await h.post(startAsk({ question_line: Q_EDITED }, { late_lists: [signedLate({ questionLine: OTHER_Q })] }));
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "START_PATHS_STALE", message: "START_PATHS_STALE" });
    expect(h.checked).toEqual([]);
    expect(h.submitted).toEqual([]);
    await h.api.close();
  });
});

describe("crisis words anywhere the person wrote them come first", () => {
  it("in an own path: 422 CRISIS_SUPPORT_OFFERED before the consent is read, nothing checked or submitted", async () => {
    const h = apiOver();
    const crisisPath: StartPathChoice = { title: "Tonight", question: "What now?", members: [{ own_text: CRISIS }] };
    const response = await h.post(startAsk({}, { paths: [...FIVE.slice(0, 4), crisisPath] }));
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: CRISIS_SUPPORT_OFFERED, message: CRISIS_SUPPORT_OFFERED, country: null });
    expect([h.consentReads(), h.checked.length, h.submitted.length]).toEqual([0, 0, 0]);
    await h.api.close();
  });

  it("typed on step 2 into the line: the same 422, before the consent read", async () => {
    const h = apiOver();
    const response = await h.post(startAsk({ question_line: `${Q}\n\n${CRISIS}` }));
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe(CRISIS_SUPPORT_OFFERED);
    expect([h.consentReads(), h.checked.length, h.submitted.length]).toEqual([0, 0, 0]);
    await h.api.close();
  });
});

describe("refusals of the paths, each before the check and before submit", () => {
  it.each([
    ["How wide 4", () => startAsk({}, { paths: FIVE.slice(0, 3), width: 4 }), 400, "START_PATHS_TOO_MANY"],
    ["a tampered menu reference", () => startAsk({}, { menu: { menu: MENU, ref: flippedMac(signedMenu().ref) } }), 400, "START_PATHS_INVALID"],
    ["references signed for Free while the person is now on premium", () => startAsk({}, {}, { planKey: "free" }), 409, "START_PATHS_STALE"]
  ] as const)("%s: %i %s", async (_name, request, status, code) => {
    const h = apiOver();
    const response = await h.post(request());
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ error: code, message: code });
    expect([h.checked.length, h.submitted.length]).toEqual([0, 0]);
    await h.api.close();
  });

  it("answer Q8: 7 paths at width 7 signed under 30 while 31 offers [3, 5]: 409 START_PATHS_NARROWED, nothing checked or submitted", async () => {
    const h = apiOver({ view: viewOf(POLICY_NARROW) });
    const response = await h.post(startAsk({}, { paths: SEVEN, width: 7 }, { settingsVersion: 30 }));
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "START_PATHS_NARROWED", message: "START_PATHS_NARROWED" });
    expect([h.checked.length, h.submitted.length]).toEqual([0, 0]);
    await h.api.close();
  });

  it("the status of every START_PATHS refusal: INVALID and TOO_MANY 400; STALE, NARROWED and EXPIRED 409", () => {
    expect(["START_PATHS_INVALID", "START_PATHS_TOO_MANY", "START_PATHS_STALE", "START_PATHS_NARROWED", "START_PATHS_EXPIRED"]
      .map(askRefusalStatus)).toEqual([400, 400, 409, 409, 409]);
    // Every other ask refusal keeps its status.
    expect(askRefusalStatus("MAKER_INVENTORY_UNSATISFIED")).toBe(422);
  });
});

describe("answer Q8: no lifetime, and a settings version that moved keeps the paths", () => {
  it("references signed 40 days earlier: 202, the paths handed over", async () => {
    const request = startAsk();
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    vi.setSystemTime(new Date(NOW.getTime() + FORTY_DAYS));
    const h = apiOver();
    expect((await h.post(request)).statusCode).toBe(202);
    expect(handOverOf(h).verified!.paths).toHaveLength(5);
    await h.api.close();
  });

  it("references signed under version 30 while 31 is active (widths [3, 5, 7]): 202 with the five paths, bound to the active version", async () => {
    const h = apiOver();
    expect((await h.post(startAsk({}, {}, { settingsVersion: 30 }))).statusCode).toBe(202);
    expect(handOverOf(h)).toMatchObject({ binding: { planKey: "premium", settingsVersion: ACTIVE }, lock: LOCK });
    expect(handOverOf(h).verified!.paths).toHaveLength(5);
    await h.api.close();
  });
});

describe("where the step does not run, today's ask", () => {
  it("the switch off: a MENU is 409 STALE; a lone start_check is ignored, the whole line checked, submit given three arguments", async () => {
    const h = apiOver({ view: viewOf(POLICY_OFF) });
    const menu = await h.post(startAsk());
    expect(menu.statusCode).toBe(409);
    expect(menu.json()).toEqual({ error: "START_PATHS_STALE", message: "START_PATHS_STALE" });
    const lone = await h.post(baseAsk({ start_check: { ref: checkRef() }, purpose_lines: { matters: "the cost" } }));
    expect(lone.statusCode).toBe(202);
    expect(h.checked).toEqual([`${Q}\n\nthe cost`]);
    expect(h.submitted).toHaveLength(1);
    expect(h.submitted[0]).toHaveLength(3);
    await h.api.close();
  });

  it("no view (no settings version named): a lone check is ignored and the ask is today's; a MENU is 409 STALE", async () => {
    const h = apiOver({ view: null });
    expect((await h.post(baseAsk({ start_check: { ref: checkRef() } }))).statusCode).toBe(202);
    expect(h.checked).toEqual([Q]);
    expect(h.submitted[0]).toHaveLength(3);
    expect((await h.post(startAsk())).json()).toEqual({ error: "START_PATHS_STALE", message: "START_PATHS_STALE" });
    await h.api.close();
  });

  it("an ask with no start members is today's: the whole line checked, three arguments", async () => {
    const h = apiOver();
    expect((await h.post(baseAsk({ purpose_lines: { answers: [ROMANIA] } }))).statusCode).toBe(202);
    expect(h.checked).toEqual([`${Q}\n\n${purposeAnswerSentence(ROMANIA)}`]);
    expect(h.submitted[0]).toHaveLength(3);
    await h.api.close();
  });

  it("startStepOnInView: the switch is the version's (its row, engine 2 in force, no valid scorecard), the same for every plan", () => {
    expect(startStepOnInView(viewOf(POLICY_ON))).toBe(true);
    expect(startStepOnInView(viewOf(POLICY_NARROW))).toBe(true);
    expect(startStepOnInView(viewOf(POLICY_OFF))).toBe(false);
    expect(startStepOnInView(viewOf({ ...POLICY_ON, enabled: false }))).toBe(false);
    expect(startStepOnInView({ ...viewOf(POLICY_ON), modelScorecardInForce: true })).toBe(false);
    const { engineVersionPolicy: _engine, ...noEngine } = viewOf(POLICY_ON);
    void _engine;
    expect(startStepOnInView(noEngine)).toBe(false);
    expect(startStepOnInView({ modelScorecardInForce: false })).toBe(false);
    for (const plan of ["free", "plus", "pro", "max", "premium"] as const) {
      expect(startWidthsOfView(viewOf(POLICY_ON), plan), plan).not.toBeNull();
      expect(startWidthsOfView(viewOf(POLICY_OFF), plan), plan).toBeNull();
    }
  });

  it("no key composed: chosen paths are 400 START_PATHS_INVALID; a lone check is ignored", async () => {
    const h = apiOver({ key: "NONE" });
    expect((await h.post(startAsk())).json()).toEqual({ error: "START_PATHS_INVALID", message: "START_PATHS_INVALID" });
    expect((await h.post(baseAsk({ start_check: { ref: checkRef() } }))).statusCode).toBe(202);
    expect(h.checked).toEqual([Q]);
    expect(h.submitted[0]).toHaveLength(3);
    await h.api.close();
  });
});

describe("a dig's picks", () => {
  const PICKS = [
    { kind: "OWN_VIEW" as const, suggestion_id: null, place: "w", text: "I worry about earthquakes near the plants." },
    { kind: "NEEDS_MORE_WEB" as const, suggestion_id: "sg-1", place: "w", text: "Who pays if building runs years late?" }
  ];
  const digAsk = baseAsk({ question_line: `${Q} Dig: the risks.`, parent: { parent_run_id: PARENT_RUN_ID, places: [], mode: "quick", picks: PICKS } });

  it("on a version where the step runs: one path per pick, handed over (an unread parent answer: never passed off as an AI's)", async () => {
    const h = apiOver({ dig: true });
    expect((await h.post(digAsk)).statusCode).toBe(202);
    const verified = handOverOf(h).verified!;
    expect(verified).toMatchObject({ source: "DIG_PICKS", width: 2, menu: null, carryOnToReport: false });
    expect(verified.paths.map((path) => [path.pathId, path.author, path.question])).toEqual([
      ["b1", "PERSON_OWN_VIEW", PICKS[0]!.text], ["b2", "PERSON_EDITED", PICKS[1]!.text]]);
    // The picks are the person's words: checked with the line.
    expect(h.checked).toEqual([`${Q} Dig: the risks.\n\n${PICKS[0]!.text}\nWho pays if building runs years late?`]);
    await h.api.close();
  });

  it("on a version without the switch: 202 and no hand-over (today's dig), its DIG_PICKS paths ignored", async () => {
    const h = apiOver({ dig: true, view: viewOf(POLICY_OFF) });
    expect((await h.post(digAsk)).statusCode).toBe(202);
    expect(h.submitted[0]).toHaveLength(3);
    expect(h.checked).toEqual([`${Q} Dig: the risks.`]);
    const combined = { ...digAsk, start_paths: { source: "DIG_PICKS" as const, width: 1, chosen_by: "PERSON" as const,
      paths: [{ title: "The risks", question: "What are the risks of the plants?", members: [{ pick_no: 1 }, { pick_no: 2 }] }] } };
    expect((await h.post(combined)).statusCode).toBe(202);
    expect(h.submitted[1]).toHaveLength(3);
    expect(h.checked[1]).toBe(`${Q} Dig: the risks.`);
    await h.api.close();
  });

  it("review: a check from Next sent with a dig's picks and a line of its own: the dig's whole line is checked, never only the picks", async () => {
    // A check signed for Q vouches for Q alone. One path per pick has no reading of its own, so whether the line was edited is the
    // check's: the dig's line is not Q, and the one check reads it whole, then the picks.
    const h = apiOver({ dig: true });
    expect((await h.post({ ...digAsk, start_check: { ref: checkRef() } })).statusCode).toBe(202);
    expect(handOverOf(h)).toMatchObject({ lock: LOCK, verified: { source: "DIG_PICKS", width: 2 } });
    expect(h.checked).toEqual([`${Q} Dig: the risks.\n\n${PICKS[0]!.text}\nWho pays if building runs years late?`]);
    await h.api.close();
  });

  it("a dig's combined picks (DIG_PICKS) where the step runs: the person's paths, handed over and checked with the line", async () => {
    const h = apiOver({ dig: true });
    const combined = { ...digAsk, start_paths: { source: "DIG_PICKS" as const, width: 1, chosen_by: "PERSON" as const,
      paths: [{ title: "The risks", question: "What are the risks of the plants?", members: [{ pick_no: 1 }, { pick_no: 2 }] }] } };
    expect((await h.post(combined)).statusCode).toBe(202);
    expect(handOverOf(h).verified).toMatchObject({ source: "DIG_PICKS", width: 1 });
    expect(handOverOf(h).verified!.paths.map((path) => path.author)).toEqual(["PERSON_EDITED"]);
    expect(h.checked).toEqual([`${Q} Dig: the risks.\n\nThe risks\nWhat are the risks of the plants?\n${PICKS[0]!.text}\n${PICKS[1]!.text}`]);
    await h.api.close();
  });
});

describe("Task 36b: a public dig's picks become its paths where the step runs, as an own dig's do", () => {
  const LINE = `${Q} Dig: the risks.`;
  const PICKS = [
    { kind: "OWN_VIEW" as const, suggestion_id: null, place: "path:pos-1", text: "I worry about earthquakes near the plants." },
    { kind: "NEEDS_MORE_WEB" as const, suggestion_id: "sg-1", place: "path:pos-1", text: "Who pays if building runs years late?" }
  ];
  /* The page's suggestion, word for word: an own dig's reader would call the second pick the AI's. A public dig never reads it. */
  const SUGGESTED = Object.freeze({ "sg-1": PICKS[1]!.text });
  const EIGHT = Array.from({ length: 8 }, (_, index) => ({ kind: "OWN_VIEW" as const, suggestion_id: null, place: "path:pos-1",
    text: `Made-up worry number ${String(index + 1)}.` }));
  const publicAsk = (picks?: NonNullable<AskRequest["public_parent"]>["picks"]): AskRequest =>
    baseAsk({ question_line: LINE, public_parent: { public_ref: PUBLIC_REF, places: ["path:pos-1"], mode: "quick", ...(picks === undefined ? {} : { picks }) } });
  const ownAsk = (picks: typeof PICKS | typeof EIGHT): AskRequest =>
    baseAsk({ question_line: LINE, parent: { parent_run_id: PARENT_RUN_ID, places: ["path:pos-1"], mode: "quick", picks } });

  // The join after submit is refused in this made-up world, and says so in one log line: kept off the test output.
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) where the step runs: one path per pick, source DIG_PICKS, each pick's author digPickAuthorOf(pick, null); the suggestion never read", async () => {
    const h = apiOver({ dig: true, publicTree: true, suggestions: SUGGESTED });
    expect((await h.post(publicAsk(PICKS))).statusCode).toBe(202);
    expect(h.submitted[0]).toHaveLength(4);
    const handOver = handOverOf(h);
    expect(handOver).toMatchObject({ binding: { planKey: "premium", settingsVersion: ACTIVE }, lock: null });
    expect(handOver.verified).toMatchObject({ source: "DIG_PICKS", width: 2, chosenBy: "PERSON", menu: null, carryOnToReport: false });
    expect(handOver.verified!.paths.map((path) => [path.pathId, path.author, path.question])).toEqual([
      ["b1", digPickAuthorOf(PICKS[0]!, null), PICKS[0]!.text], ["b2", digPickAuthorOf(PICKS[1]!, null), PICKS[1]!.text]]);
    expect(handOver.verified!.paths.map((path) => path.author)).toEqual(["PERSON_OWN_VIEW", "PERSON_EDITED"]);
    expect(h.suggestionReads).toEqual([]);
    // The picks are the person's words, as on an own dig: checked with the line, once.
    expect(h.checked).toEqual([`${LINE}\n\n${PICKS[0]!.text}\n${PICKS[1]!.text}`]);
    await h.api.close();
  });

  it("(b) on a version without the switch: 202 and no hand-over (three arguments, today's public dig)", async () => {
    const h = apiOver({ dig: true, publicTree: true, view: viewOf(POLICY_OFF) });
    expect((await h.post(publicAsk(PICKS))).statusCode).toBe(202);
    expect(h.submitted[0]).toHaveLength(3);
    expect(h.checked).toEqual([LINE]);
    await h.api.close();
  });

  it("(c) eight picks: 400 START_PATHS_TOO_MANY, as for an own dig; nothing checked or submitted", async () => {
    for (const ask of [publicAsk(EIGHT), ownAsk(EIGHT)]) {
      const h = apiOver({ dig: true, publicTree: true });
      const response = await h.post(ask);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "START_PATHS_TOO_MANY", message: "START_PATHS_TOO_MANY" });
      expect([h.checked.length, h.submitted.length]).toEqual([0, 0]);
      await h.api.close();
    }
  });

  it("(d) an own dig's hand-over, byte for byte as before (its suggestion read from its own debate)", async () => {
    const h = apiOver({ dig: true, publicTree: true, suggestions: SUGGESTED });
    expect((await h.post(ownAsk(PICKS))).statusCode).toBe(202);
    expect(h.suggestionReads).toEqual(["sg-1"]);
    const [own, suggested] = [PICKS[0]!.text, PICKS[1]!.text];
    expect(JSON.stringify(handOverOf(h))).toBe(JSON.stringify({
      binding: { planKey: "premium", settingsVersion: ACTIVE },
      verified: { source: "DIG_PICKS", width: 2, chosenBy: "PERSON", carryOnToReport: false, questionSwap: null, paths: [
        { pathId: "b1", pathNo: 1, author: "PERSON_OWN_VIEW", title: own, question: own,
          viewpoints: [{ viewpointId: null, pickNo: 1, title: null, question: own, own: true }], ownWords: [own] },
        { pathId: "b2", pathNo: 2, author: "AI_SUGGESTION", title: suggested, question: suggested,
          viewpoints: [{ viewpointId: null, pickNo: 2, title: null, question: suggested, own: false }], ownWords: [] }
      ], menu: null, ownWords: [own], questionEdited: false },
      lock: null
    }));
    expect(h.checked).toEqual([`${LINE}\n\n${own}`]);
    await h.api.close();
  });

  it("(e) a public dig with no picks: no hand-over, where the step runs too", async () => {
    const h = apiOver({ dig: true, publicTree: true });
    expect((await h.post(publicAsk())).statusCode).toBe(202);
    expect(h.submitted[0]).toHaveLength(3);
    expect(h.checked).toEqual([LINE]);
    await h.api.close();
  });

  it("(f) one rule for both digs: a public dig's combined picks (DIG_PICKS) are the person's paths; a menu on a dig is 400 INVALID", async () => {
    const h = apiOver({ dig: true, publicTree: true });
    const combined = { ...publicAsk(PICKS), start_paths: { source: "DIG_PICKS" as const, width: 1, chosen_by: "PERSON" as const,
      paths: [{ title: "The risks", question: "What are the risks of the plants?", members: [{ pick_no: 1 }, { pick_no: 2 }] }] } };
    expect((await h.post(combined)).statusCode).toBe(202);
    expect(handOverOf(h).verified).toMatchObject({ source: "DIG_PICKS", width: 1 });
    expect(handOverOf(h).verified!.paths.map((path) => path.author)).toEqual(["PERSON_EDITED"]);
    const menu = await h.post({ ...publicAsk(PICKS), start_paths: pathsOf() });
    expect(menu.statusCode).toBe(400);
    expect(menu.json()).toEqual({ error: "START_PATHS_INVALID", message: "START_PATHS_INVALID" });
    expect(h.submitted).toHaveLength(1);
    await h.api.close();
  });
});

describe("the route's own body limit (decided 3 Nov: POST /v1/asks only)", () => {
  /** Review Focus 5: seven paths of the person's own words, four 1000-character own texts each, in a 3-byte script. */
  const largest = (): AskRequest => startAsk({}, {
    width: 7,
    paths: Array.from({ length: 7 }, (_, p): StartPathChoice => ({ title: `${p}${"中".repeat(119)}`, question: `${p}${"中".repeat(999)}`,
      members: Array.from({ length: 4 }, (_, m) => ({ own_text: `${p}${m}${"中".repeat(998)}` })) }))
  });
  const padded = (request: AskRequest, bytes: number): string => {
    const body = JSON.stringify(request);
    const size = Buffer.byteLength(body, "utf8");
    if (size > bytes) throw new Error(`FIXTURE_TOO_LARGE:${size}`);
    return `${body}${" ".repeat(bytes - size)}`;
  };

  it("a legal 300 000-byte body and one of exactly askBodyMaxBytes are accepted; one byte more is a typed 413", async () => {
    expect(START_STEP_LIMITS.askBodyMaxBytes).toBe(393_216);
    const h = apiOver();
    expect(Buffer.byteLength(JSON.stringify(largest()), "utf8")).toBeGreaterThan(100_000);
    expect((await h.post(padded(largest(), 300_000))).statusCode).toBe(202);
    expect(handOverOf(h).verified!.paths).toHaveLength(7);
    expect((await h.post(padded(largest(), START_STEP_LIMITS.askBodyMaxBytes))).statusCode).toBe(202);
    const over = await h.post(padded(largest(), START_STEP_LIMITS.askBodyMaxBytes + 1));
    expect(over.statusCode).toBe(413);
    expect(over.json()).toEqual({ error: "PAYLOAD_TOO_LARGE", message: "PAYLOAD_TOO_LARGE" });
    expect(h.submitted).toHaveLength(2);
    await h.api.close();
  });
});

describe("startTextsOfBody: what the person wrote on step 2, read from the unparsed body", () => {
  it("every path's title and question and every own text, in order; viewpoints, picks and other members carry no words", () => {
    const body = startAsk({}, { paths: [menuPathOf(0), { title: "Mine", question: "Is it mine?", members: [{ own_text: "My words." }, { viewpoint_id: "pt12" }] }] });
    expect(startTextsOfBody(body)).toEqual([VIEWPOINTS[0]!.title, VIEWPOINTS[0]!.question, "Mine", "Is it mine?", "My words."]);
  });

  it("an own text after the fourth member is read: a merged path may hold more than four (Task 92a), and the crisis screen must see every word", () => {
    const members = [...["pt11", "pt12", "pt13", "pt14", "pt15"].map((id) => ({ viewpoint_id: id })), { own_text: "Words after five viewpoints." }];
    expect(startTextsOfBody({ start_paths: { paths: [{ title: "Big", question: "A big path?", members }] } }))
      .toEqual(["Big", "A big path?", "Words after five viewpoints."]);
  });

  it("at most 7 paths and 54 members each (Task 92a's pathMembersMax); anything that is not text, or not where the contract puts it, is skipped", () => {
    const many = Array.from({ length: 9 }, (_, p) => ({ title: `t${p}`, question: 7,
      members: Array.from({ length: START_STEP_LIMITS.pathMembersMax + 2 }, (_, m) => ({ own_text: `o${p}-${m}` })) }));
    const texts = startTextsOfBody({ start_paths: { paths: many } });
    expect(texts.filter((text) => text.startsWith("t"))).toHaveLength(7);
    expect(texts.filter((text) => text.startsWith("o"))).toHaveLength(7 * START_STEP_LIMITS.pathMembersMax);
    expect(texts).not.toContain("t7");
    expect(texts).toContain(`o0-${START_STEP_LIMITS.pathMembersMax - 1}`);
    expect(texts).not.toContain(`o0-${START_STEP_LIMITS.pathMembersMax}`);
    for (const body of [null, "text", [], { start_paths: "x" }, { start_paths: { paths: "x" } }, { start_paths: { paths: [null, 3, "y"] } }, {}]) {
      expect(startTextsOfBody(body), JSON.stringify(body)).toEqual([]);
    }
  });

  it("a text longer than the contract allows is not read (the parse refuses it as malformed)", () => {
    const long = "a".repeat(START_STEP_LIMITS.ownTextMaxChars + 1);
    expect(startTextsOfBody({ start_paths: { paths: [{ title: "a".repeat(START_STEP_LIMITS.pathTitleMaxChars + 1), question: "q",
      members: [{ own_text: long }, { own_text: "kept" }] }] } })).toEqual(["q", "kept"]);
  });
});

describe("startQuestionCheckText: the one check at Start", () => {
  const input = (over: Partial<Parameters<typeof startQuestionCheckText>[0]> = {}) => ({ questionLine: Q, purposeLines: undefined,
    ownWords: [] as readonly string[], startCheckVerified: true, questionEdited: false, ...over });

  it("a verified check, the line unchanged: only the unsaid lines and the own words; null when there are none", () => {
    expect(startQuestionCheckText(input())).toBeNull();
    expect(startQuestionCheckText(input({ purposeLines: { answers: [ROMANIA] } }))).toBeNull();
    expect(startQuestionCheckText(input({ purposeLines: { matters: "the cost" }, ownWords: ["Mine", "My words."] }))).toBe("the cost\nMine\nMy words.");
  });

  it("a verified check, the line changed: the line with the unsaid lines (answers said), a blank line, the own words", () => {
    expect(startQuestionCheckText(input({ questionLine: Q_EDITED, questionEdited: true, purposeLines: { answers: [ROMANIA] } }))).toBe(Q_EDITED);
    expect(startQuestionCheckText(input({ questionLine: Q_EDITED, questionEdited: true, purposeLines: { matters: "the cost" },
      ownWords: ["Mine"] }))).toBe(`${Q_EDITED}\n\nthe cost\n\nMine`);
  });

  it("no verified check: today's whole-line text (answers counted), then the own words", () => {
    expect(startQuestionCheckText(input({ startCheckVerified: false }))).toBe(Q);
    expect(startQuestionCheckText(input({ startCheckVerified: false, purposeLines: { answers: [ROMANIA] }, ownWords: ["Mine"] })))
      .toBe(`${Q}\n\n${purposeAnswerSentence(ROMANIA)}\n\nMine`);
  });
});

/*
 * Task 57c (the owner's 5 Nov answer Q20 A and its follow-up: a failed question gives back its path-list charge): once the debate is
 * accepted, it takes the charges before Start of each try this Start names, the question's (its check) and a dig's combine (its parent),
 * so 0164 gives them back if it fails. A link that fails never changes the 202, and its one line names no word.
 */
describe("the charges before Start go to the new debate (Task 57c)", () => {
  it("a Start from Next: the check's try, linked to the accepted debate once", async () => {
    const h = apiOver();
    expect((await h.post(startAsk())).statusCode).toBe(202);
    expect(h.linked).toEqual([[IDENTITY.authenticated.ownerRef, startTryRefOfCheck(KEY, SCOPE, checkRef()), RUN_ID]]);
    await h.api.close();
  });

  it("a dig's picks: its parent's try (a combine over them); with a check from Next as well, both", async () => {
    const dig = { parent_run_id: PARENT_RUN_ID, places: [], mode: "quick" as const,
      picks: [{ kind: "OWN_VIEW" as const, suggestion_id: null, place: "w", text: "I worry about earthquakes near the plants." }] };
    const h = apiOver({ dig: true });
    expect((await h.post(baseAsk({ question_line: `${Q} Dig: the risks.`, parent: dig }))).statusCode).toBe(202);
    const digTry = startDigTryRefOf(KEY, { ownerScope: SCOPE, parentRunId: PARENT_RUN_ID });
    expect(h.linked).toEqual([[IDENTITY.authenticated.ownerRef, digTry, RUN_ID]]);
    expect((await h.post(baseAsk({ question_line: `${Q} Dig: the risks.`, parent: dig, start_check: { ref: checkRef() } }))).statusCode).toBe(202);
    expect(h.linked.slice(1)).toEqual([[IDENTITY.authenticated.ownerRef, startTryRefOfCheck(KEY, SCOPE, checkRef()), RUN_ID],
      [IDENTITY.authenticated.ownerRef, digTry, RUN_ID]]);
    await h.api.close();
  });

  it("nothing is linked for today's ask, a refused Start, or where the step does not run", async () => {
    const h = apiOver();
    expect((await h.post(baseAsk())).statusCode).toBe(202);
    expect((await h.post(startAsk({}, {}, { planKey: "plus" }))).statusCode).toBe(409);
    const off = apiOver({ view: viewOf(POLICY_OFF) });
    expect((await off.post(baseAsk({ start_check: { ref: checkRef() } }))).statusCode).toBe(202);
    expect([h.linked, off.linked]).toEqual([[], []]);
    await h.api.close();
    await off.api.close();
  });

  it("a link that fails: still 202, one line with the debate's id and no word", async () => {
    const lines: string[] = [];
    const error = vi.spyOn(console, "error").mockImplementation((line: unknown) => { lines.push(String(line)); });
    const h = apiOver({ linkFails: true });
    const response = await h.post(startAsk());
    expect(response.statusCode).toBe(202);
    expect(h.linked).toHaveLength(1);
    expect(lines.map((line) => JSON.parse(line) as unknown)).toContainEqual({ event: "api.start_step.try_link_failed", run_id: RUN_ID });
    expect(lines.join("\n")).not.toContain("nuclear");
    error.mockRestore();
    await h.api.close();
  });
});
