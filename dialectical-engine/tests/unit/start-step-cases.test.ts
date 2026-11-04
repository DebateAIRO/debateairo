/**
 * V4 start step, Task 84 (spec 2026-11-03 §8, "the end-to-end test world"): THE START STEP'S SHARED CASES. One list of the
 * cases the end-to-end world (Task 90) and the rehearsal (Task 93) run, and the helpers that drive the step before Start
 * as the page does: read the lists, merge at the cut with the lists in by then, merge the late lists in (Task 71's rule:
 * every list the menu does not hold), and choose paths the two ways a person can: the AIs' top paths ("Just answer it"
 * on step 2) or a shaped list (a combine, a split, an own path). The lean Free shape is the one the world switches on.
 * The fake client signs with a real key and checks every merge request as the server does; the chosen paths go through
 * the verifier at Start (Task 33), so the authors are the ones a real Start records. Every question and path is made up.
 */
import { describe, expect, it } from "vitest";
import {
  StartListSchema, StartMenuSchema, StartPathsSchema, type AskRequest, type SignedStartList, type SignedStartMenu, type StartCombineRequest,
  type StartCombineResponse, type StartList, type StartListsEvent, type StartListsRequest, type StartMenu, type StartMergeRequest,
  type StartMergeResponse, type StartPaths
} from "@debateai/contract";
import {
  debateShapePolicyStartValues, debateShapeStartStepStartValues, parseDebateShapePolicy, type DebateShapeWidths
} from "@debateai/register";
import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import { verifyStartPathsAtAsk } from "../../apps/api/src/start-paths-at-ask.js";
import {
  newStartStepKey, signStartCheck, signStartCombine, signStartList, signStartMenu, startMembersHash, verifyStartMergeRequest
} from "../../apps/api/src/start-step/signing.js";
import {
  LEAN_FREE_MODEL_IDS, SHAPED_OWN_TEXT, START_STEP_CASES, driveStartStep, leanFreeShape, readStartLists, shapedChoice, topPathsChoice,
  type StartStepDrive
} from "../support/start-step-cases.js";
import { NUCLEAR_MENU, NUCLEAR_MENU_REV2, START_FIXTURE_QUESTION } from "../support/v4-start-menu.js";

const KEY = newStartStepKey();
const OWNER = "owner:88888888-8888-4888-8888-888888888888";
const Q = START_FIXTURE_QUESTION;
const SIGNED_FOR = Object.freeze({ ownerScope: OWNER, questionLine: Q, planKey: "plus" as const, settingsVersion: 33 });
const WIDTHS: DebateShapeWidths = Object.freeze({ options: Object.freeze([3, 5, 7]), default: 5 });
const NOW = new Date("2026-11-04T11:00:00.000Z");
const THREE_DAYS = 3 * 86_400_000;
const EN = Object.freeze({ code: "en", name: "English" });
const LOCK: QuestionLanguageLock = Object.freeze({
  language: EN, source: "ELD_SITE", siteLanguage: "en", rewriteAccepted: false, originalQuestionLine: null,
  trace: Object.freeze({ eld: null, fast: null, contractHash: null }), recordCode: "ELD_SITE", localReason: null
});
const CHECK_REF = signStartCheck(KEY, { ...SIGNED_FOR, lock: LOCK, originalQuestionLine: null });

/* The three lists the nuclear menu was merged from (lists 1 and 2 in the first menu, list 3 late, in revision 2). */
function listOf(no: number): StartList {
  const viewpoints = NUCLEAR_MENU_REV2.viewpoints.filter((one) => one.viewpoint_id.startsWith(`pt${no}`))
    .map(({ repeat_ids: _repeats, ...one }) => { void _repeats; return one; });
  const used = new Set(viewpoints.map((one) => one.angle_id));
  return StartListSchema.parse({ list_no: no, angles: NUCLEAR_MENU_REV2.angles.filter((angle) => used.has(angle.angle_id)), viewpoints });
}
const signedListOf = (no: number): SignedStartList => { const list = listOf(no); return { list, ref: signStartList(KEY, { ...SIGNED_FOR, list }) }; };
const signed = (menu: StartMenu): SignedStartMenu => ({ menu, ref: signStartMenu(KEY, { ...SIGNED_FOR, menu }) });
const L1 = signedListOf(1);
const L2 = signedListOf(2);
const L3 = signedListOf(3);
const MENU1 = signed(NUCLEAR_MENU);
const MENU2 = signed(NUCLEAR_MENU_REV2);
/** A CODE menu of list 1 alone (a first merge that failed): each viewpoint its own path, in list order. */
const CODE_MENU = signed(StartMenuSchema.parse({
  menu_id: NUCLEAR_MENU.menu_id, revision: 1, language: EN, angles: L1.list.angles,
  viewpoints: L1.list.viewpoints.map((one) => ({ ...one, repeat_ids: [] })), repeats: [],
  paths: L1.list.viewpoints.map((one, index) => ({ path_ref: `kp0${index + 1}`, title: one.title, question: one.question,
    viewpoint_ids: [one.viewpoint_id], put_together: false, is_new: false })),
  cards: [], suggestions: []
}));

const CHECK: StartListsEvent = { event: "check", data: { check_ref: CHECK_REF, language: EN, seats: 4 } };
const STREAM: readonly StartListsEvent[] = [
  CHECK,
  { event: "progress", data: { answered: 1, of: 4 } },
  { event: "list", data: { list: L1 } },
  { event: "progress", data: { answered: 2, of: 4 } },
  { event: "list", data: { list: L2 } },
  { event: "cut", data: { lists_in: 2 } },
  { event: "progress", data: { answered: 3, of: 4 } },
  { event: "late_list", data: { list: L3 } },
  { event: "end", data: { reason: "DONE" } }
];
const kinds = (events: readonly StartListsEvent[]): string[] => events.map((event) => event.event);

const COMBINED = Object.freeze({ title: "Costs and the hardest weeks", question: "What would new plants cost households, and would they keep the lights on in a calm winter week?" });

/**
 * A client that answers the lists stream from `stream` (one event per turn, as a network would), each merge from
 * `merges` in order, and each combine with `combine` (an AI's answer, signed, by default). Every merge request is checked
 * as the server checks it, and each records the events the page had seen when it was asked.
 */
function fakeClient(stream: readonly StartListsEvent[], merges: readonly StartMergeResponse[],
  combine: (request: StartCombineRequest) => StartCombineResponse = aiCombine) {
  const seen: StartListsEvent[] = [];
  const calls = { lists: [] as StartListsRequest[], merges: [] as Readonly<{ request: StartMergeRequest; seen: string[] }>[],
    combines: [] as StartCombineRequest[], signals: [] as AbortSignal[] };
  const client = {
    async startPathLists(input: StartListsRequest, onEvent: (event: StartListsEvent) => void, signal: AbortSignal): Promise<void> {
      calls.lists.push(input);
      calls.signals.push(signal);
      for (const event of stream) {
        await Promise.resolve();
        seen.push(event);
        onEvent(event);
      }
    },
    async startPathMerge(input: StartMergeRequest): Promise<StartMergeResponse> {
      calls.merges.push({ request: input, seen: kinds(seen) });
      verifyStartMergeRequest(KEY, { ownerScope: OWNER, questionLine: input.question_line, planKey: "plus", request: input });
      await Promise.resolve();
      const answer = merges[calls.merges.length - 1];
      if (answer === undefined) throw new Error("no merge answer scripted");
      return answer;
    },
    async startPathCombine(input: StartCombineRequest): Promise<StartCombineResponse> {
      calls.combines.push(input);
      await Promise.resolve();
      return combine(input);
    }
  };
  return { client, calls };
}
function aiCombine(request: StartCombineRequest): Extract<StartCombineResponse, { source: "AI" }> {
  if (request.context.kind !== "MENU") throw new Error("a menu combine");
  return { source: "AI", ...COMBINED, combine_ref: signStartCombine(KEY, { ownerScope: OWNER, context: { kind: "MENU", menuId: request.context.menu_id },
    membersHash: startMembersHash(request.members), ...COMBINED }) };
}

const INPUT = Object.freeze({ questionLine: Q, siteLanguage: "en" as const, readingLevel: "plain" as const });
const drive = (stream: readonly StartListsEvent[] = STREAM, merges: readonly StartMergeResponse[] = [
  { source: "AI", menu: MENU1 }, { source: "AI", menu: MENU2 }]) => {
  const fake = fakeClient(stream, merges);
  return { fake, done: driveStartStep(fake.client, INPUT) };
};

const baseAsk = (extra: Partial<AskRequest> = {}): AskRequest => ({ question_line: Q, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:start", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "start step cases",
  as_of: "2026-11-04T00:00:00.000Z", steering_presets: [], plan_tier: "premium", steering_annotations: [], ...extra });
/** Start with these paths and the drive's check, read back as the server reads them (Task 33). */
const atStart = (startPaths: StartPaths, d: StartStepDrive, extra: Partial<AskRequest> = {}, now = NOW) => verifyStartPathsAtAsk({
  key: KEY, ownerScope: OWNER, planKey: "plus", settingsVersion: 33, widths: WIDTHS, dig: null, now,
  ask: baseAsk({ start_check: { ref: d.check!.check_ref }, start_paths: startPaths, ...extra })
});
const viewpoint = (id: string) => NUCLEAR_MENU_REV2.viewpoints.find((one) => one.viewpoint_id === id)!;
const asItself = (id: string) => ({ title: viewpoint(id).title, question: viewpoint(id).question, members: [{ viewpoint_id: id }] });
const menuWords = (ref: string) => {
  const path = NUCLEAR_MENU.paths.find((one) => one.path_ref === ref)!;
  return { title: path.title, question: path.question, members: path.viewpoint_ids.map((id) => ({ viewpoint_id: id })) };
};

describe("the shared cases", () => {
  it("are the ten cases in order; Free runs quick only; each id names its plan, depth and start (or its dig)", () => {
    expect(START_STEP_CASES).toEqual([
      { id: "FREE_QUICK_TOP", plan: "FREE", depth: "quick", start: "TOP", dig: false },
      { id: "FREE_QUICK_DIG", plan: "FREE", depth: "quick", start: "TOP", dig: true },
      { id: "PLUS_QUICK_SHAPED", plan: "PLUS", depth: "quick", start: "SHAPED", dig: false },
      { id: "PLUS_THOROUGH_SHAPED", plan: "PLUS", depth: "thorough", start: "SHAPED", dig: false },
      { id: "PLUS_QUICK_JUST_ANSWER", plan: "PLUS", depth: "quick", start: "JUST_ANSWER", dig: false },
      { id: "PLUS_QUICK_NO_START", plan: "PLUS", depth: "quick", start: "NO_START", dig: false },
      { id: "PLUS_QUICK_TROUBLE", plan: "PLUS", depth: "quick", start: "TROUBLE", dig: false },
      { id: "PRO_QUICK_TOP", plan: "PRO", depth: "quick", start: "TOP", dig: false },
      { id: "MAX_THOROUGH_TOP", plan: "MAX", depth: "thorough", start: "TOP", dig: false },
      { id: "PLUS_QUICK_DIG", plan: "PLUS", depth: "quick", start: "TOP", dig: true }
    ]);
    expect(START_STEP_CASES.filter((one) => one.plan === "FREE").map((one) => one.depth)).toEqual(["quick", "quick"]);
    for (const one of START_STEP_CASES) expect(one.id).toBe(`${one.plan}_${one.depth.toUpperCase()}_${one.dig ? "DIG" : one.start}`);
    expect(Object.isFrozen(START_STEP_CASES)).toBe(true);
    expect(START_STEP_CASES.every((one) => Object.isFrozen(one))).toBe(true);
  });

  it("the lean Free shape changes only plans.free and keeps the start step's switch", () => {
    const start = debateShapePolicyStartValues();
    const lean = leanFreeShape(start);
    expect(lean).toEqual({ ...start, plans: { ...start.plans, free: { ...start.plans.free, mapAIs: 2, answers: 2, graders: 1, pointsPerAnswer: 2,
      gapRoundsMax: 0, closeCallExtraGraders: 0 } } });
    expect(JSON.stringify(lean.plans.free)).toBe('{"mapAIs":2,"answers":2,"graders":1,"pointsPerAnswer":2,"deeperTopPoints":1,"gapRoundsMax":0,'
      + '"closeCallExtraGraders":0,"fixedDepthAllowed":false,"scrutiny":{"deep":null,"exhaustive":null,"scrutinyLeverageMin":0.05,'
      + '"scrutinyWeakBelow":0.5},"opening":"ANGLE_MAP"}');
    expect(JSON.stringify({ ...lean, plans: { ...lean.plans, free: start.plans.free } })).toBe(JSON.stringify(start));
    expect(lean).not.toHaveProperty("startStep");
    const on = leanFreeShape({ ...start, startStep: debateShapeStartStepStartValues() });
    expect(on.startStep).toEqual(debateShapeStartStepStartValues());
    expect(on.plans.free).toEqual(lean.plans.free);
    expect(leanFreeShape({ ...start, enabled: false }).enabled).toBe(false);
    expect(parseDebateShapePolicy(JSON.parse(JSON.stringify(on)))).toEqual(on);
    expect(Object.isFrozen(on.plans.free)).toBe(true);
    expect(start.plans.free.mapAIs).toBe(3);
  });

  it("the lean Free line-up is GLM, DeepSeek, Qwen and Haiku", () => {
    expect(LEAN_FREE_MODEL_IDS).toEqual(["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"]);
    expect(Object.isFrozen(LEAN_FREE_MODEL_IDS)).toBe(true);
  });
});

describe("driving the step before Start", () => {
  it("readStartLists hands back every event of the stream, in order", async () => {
    const { client, calls } = fakeClient(STREAM, []);
    const request: StartListsRequest = { question_line: Q, site_language: "en", reading_level: "plain" };
    expect(await readStartLists(client, request)).toEqual(STREAM);
    expect(calls.lists).toEqual([request]);
    expect(calls.signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("merges at the cut with the lists in by then, then merges the late list into the menu so far", async () => {
    const { fake, done } = drive();
    const d = await done;
    expect(fake.calls.lists).toEqual([{ question_line: Q, site_language: "en", reading_level: "plain" }]);
    expect(fake.calls.merges.map((one) => one.request)).toEqual([
      { question_line: Q, check_ref: CHECK_REF, reading_level: "plain", lists: [L1, L2] },
      { question_line: Q, check_ref: CHECK_REF, reading_level: "plain", lists: [L3], prior_menu: MENU1 }
    ]);
    expect(fake.calls.merges[0]!.seen).toEqual(["check", "progress", "list", "progress", "list", "cut"]);
    expect(fake.calls.merges[1]!.seen).toEqual(kinds(STREAM));
    expect(d.events).toEqual(STREAM);
    expect(d.check).toEqual(CHECK.data);
    expect(d.lists).toEqual([L1, L2]);
    expect(d.late).toEqual([L3]);
    expect(d.menu).toEqual(MENU2);
    expect(d.merges).toEqual([{ source: "AI", menu: MENU1 }, { source: "AI", menu: MENU2 }]);
    expect(d.read).toEqual(INPUT);
    expect(fake.calls.combines).toEqual([]);
  });

  it("a first merge that fell back to list 1 alone: the late merge takes list 2 and the late list", async () => {
    const { fake, done } = drive(STREAM, [{ source: "CODE", menu: CODE_MENU }, { source: "AI", menu: MENU2 }]);
    const d = await done;
    expect(fake.calls.merges[1]!.request).toEqual({ question_line: Q, check_ref: CHECK_REF, reading_level: "plain", lists: [L2, L3],
      prior_menu: CODE_MENU });
    expect(d.menu).toEqual(MENU2);
  });

  it("a late merge answering none is asked once more with the same lists, then the menu stays and Start carries the late list", async () => {
    const none: StartMergeResponse = { source: "NONE", reason: "DEADLINE" };
    const { fake, done } = drive(STREAM, [{ source: "AI", menu: MENU1 }, none, none]);
    const d = await done;
    expect(fake.calls.merges.map((one) => one.request.lists)).toEqual([[L1, L2], [L3], [L3]]);
    expect(d.menu).toEqual(MENU1);
    const top = topPathsChoice(d, 5)!;
    expect(top.late_lists).toEqual([L3]);
    expect(atStart(top, d).menu?.lateLists).toEqual([L3.list]);
  });

  it("no list: no merge, no menu, and no paths to choose", async () => {
    const stream: StartListsEvent[] = [CHECK, { event: "none", data: { reason: "NO_LISTS" } }, { event: "end", data: { reason: "NONE" } }];
    const { fake, done } = drive(stream, []);
    const d = await done;
    expect(fake.calls.merges).toEqual([]);
    expect(d.menu).toBeNull();
    expect(d.merges).toEqual([]);
    expect(topPathsChoice(d, 5)).toBeNull();
    await expect(shapedChoice(d, fake.client)).rejects.toThrow("START_SHAPED_NO_MENU");
  });
});

describe("choosing the paths", () => {
  it("the AIs' top paths: MENU, chosen by the AIs, the menu's first paths in its words, every one the AIs' suggestion at Start", async () => {
    const { done } = drive();
    const d = await done;
    const top = topPathsChoice(d, 5)!;
    expect(top).toEqual({ source: "MENU", menu: MENU2, paths: ["kp01", "kp02", "kp03", "kp04", "kp05"].map(menuWords), width: 5, chosen_by: "AIS" });
    expect(StartPathsSchema.parse(top)).toEqual(top);
    const verified = atStart(top, d);
    expect(verified.paths.map((path) => path.author)).toEqual(Array(5).fill("AI_SUGGESTION"));
    expect(verified.questionEdited).toBe(false);
    expect(topPathsChoice(d, 3)!.paths.map((path) => path.title)).toEqual(NUCLEAR_MENU.paths.slice(0, 3).map((path) => path.title));
  });

  it("a shaped list: one combine call, five paths, authors after Task 33's rule, every member a menu viewpoint or the own words", async () => {
    const { fake, done } = drive();
    const d = await done;
    const shaped = await shapedChoice(d, fake.client);
    expect(fake.calls.combines).toEqual([{
      context: { kind: "MENU", question_line: Q, check_ref: CHECK_REF, menu_id: NUCLEAR_MENU.menu_id }, reading_level: "plain",
      members: ["pt11", "pt13"].map((id) => ({ viewpoint_id: id, pick_no: null, title: viewpoint(id).title, question: viewpoint(id).question }))
    }]);
    expect(shaped.source).toBe("MENU");
    expect(shaped.chosen_by).toBe("PERSON");
    expect(shaped.width).toBe(5);
    expect(shaped.menu).toEqual(MENU2);
    expect(shaped).not.toHaveProperty("late_lists");
    expect(shaped.paths).toEqual([
      { ...COMBINED, members: [{ viewpoint_id: "pt11" }, { viewpoint_id: "pt13" }], combine_ref: aiCombine(fake.calls.combines[0]!).combine_ref },
      asItself("pt14"), asItself("pt15"),
      { title: SHAPED_OWN_TEXT, question: SHAPED_OWN_TEXT, members: [{ own_text: SHAPED_OWN_TEXT }] },
      menuWords("kp04")
    ]);
    expect(SHAPED_OWN_TEXT).toBe("Made-up own path: what about the workers?");
    const shown = new Set(NUCLEAR_MENU_REV2.viewpoints.map((one) => one.viewpoint_id));
    for (const member of shaped.paths.flatMap((path) => path.members)) {
      expect("viewpoint_id" in member ? shown.has(member.viewpoint_id) : "own_text" in member && member.own_text === SHAPED_OWN_TEXT).toBe(true);
    }
    const authors = atStart(shaped, d).paths.map((path) => path.author);
    expect(authors).toEqual(["AI_COMBINED", "AI_SUGGESTION", "AI_SUGGESTION", "PERSON_OWN_VIEW", "AI_SUGGESTION"]);
  });

  it("the shaped list after the question was edited on step 2 and three days on: the paths are kept, the whole line checked once", async () => {
    const { fake, done } = drive();
    const d = await done;
    const shaped = await shapedChoice(d, fake.client);
    const verified = atStart(shaped, d, { question_line: `${Q}\n\nUp to 2050.` }, new Date(NOW.getTime() + THREE_DAYS));
    expect(verified.paths.map((path) => path.author)).toEqual(["AI_COMBINED", "AI_SUGGESTION", "AI_SUGGESTION", "PERSON_OWN_VIEW", "AI_SUGGESTION"]);
    expect(verified.questionEdited).toBe(true);
  });

  it("a combine that answers none keeps the joined words, as the page does, and the path is the person's edit", async () => {
    const fake = fakeClient(STREAM, [{ source: "AI", menu: MENU1 }, { source: "AI", menu: MENU2 }], () => ({ source: "NONE", reason: "DEADLINE" }));
    const d = await driveStartStep(fake.client, INPUT);
    const shaped = await shapedChoice(d, fake.client);
    expect(fake.calls.combines).toHaveLength(1);
    expect(shaped.paths[0]).toEqual({ title: `${viewpoint("pt11").title} · ${viewpoint("pt13").title}`,
      question: `1. ${viewpoint("pt11").question}\n2. ${viewpoint("pt13").question}`, members: [{ viewpoint_id: "pt11" }, { viewpoint_id: "pt13" }] });
    expect(atStart(shaped, d).paths.map((path) => path.author)).toEqual(["PERSON_EDITED", "AI_SUGGESTION", "AI_SUGGESTION", "PERSON_OWN_VIEW",
      "AI_SUGGESTION"]);
  });
});
