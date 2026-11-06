// tests/unit/start-step-api-merge.test.ts
// V4 start step, Task 29 (spec 2026-11-03 §4.1, §6 items 3 and 4; items ask-f9; owner answers Q2 and Q8 of 4 Nov): THE STEP PORT ON
// STEP 2. The merge turns the signed lists into the signed menu (a first merge raced with its own deadline, so the card shows the first
// list alone when Haiku is slow; a late merge adds the lists that came after it), the combine writes one question for points put together,
// and the fit says which chosen path the person's own view fits inside. The same request from the same person, within ten minutes, gets
// the same answer back with no call (joined while it runs); an answer of none is not kept. References are verified with the read line
// compared and the version not compared (a site update never spoils them); a plan change is STALE. Fake timers, a scripted transport whose
// replies are TEXT read by each call's own spec and that never ends a call at its bound (as the preview's policy never does), the real
// per-person charge seam over a recording writer. Prices and data are made up.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreStartChargeEntry } from "@debateai/budget";
import {
  StartCombineResponseSchema, StartListSchema, StartMergeResponseSchema, purposeAnswerSentence, type SignedStartList, type StartList,
  type StartMenu, type StartMergeResponse
} from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { START_CALL_SITES, START_STEP_TIMING, startCodeMenu, type MapCallOutcome, type MapCallRequest } from "@debateai/map";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS, parsePreviewProviderTestConfig, parseProviderDiscoveryTargets, previewModelRow, previewTargetJsonRow,
  type PreviewProviderTestConfig, type ProviderDiscoveryTarget
} from "@debateai/providers";
import { debateShapePolicyStartValues, debateShapeStartStepStartValues, type DebateShapePolicy } from "@debateai/register";
import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import { createStartCharges } from "../../apps/api/src/start-step/charge.js";
import { startModelOfSeat } from "../../apps/api/src/start-step/seats.js";
import {
  newStartStepKey, signStartCheck, signStartList, signStartMenu, startDigTryRefOf, startMembersHash, startRefVersionOf, startTryRefOfCheck,
  verifyStartCombine, verifyStartMenu
} from "../../apps/api/src/start-step/signing.js";
import {
  createStartStep, type StartCombineInput, type StartFitInput, type StartMergeInput, type StartStepSettings
} from "../../apps/api/src/start-step/step.js";
import { preStartKindOfCallSite, type StartTransport } from "../../apps/api/src/start-step/transport.js";

/**
 * A fault put into the real map's merge for one test: the map never builds a menu that fails the contract, so the API's check of it
 * (moved out of the map, plan Global Constraints) can only be seen failing with a menu spoiled on its way out of the map.
 */
const fault = vi.hoisted(() => ({ menu: null as ((menu: StartMenu) => StartMenu) | null }));
vi.mock("@debateai/map", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@debateai/map")>();
  return {
    ...actual,
    mapMergeStartLists: async (...args: Parameters<typeof actual.mapMergeStartLists>) => {
      const made = await actual.mapMergeStartLists(...args);
      return fault.menu === null ? made : { ...made, menu: fault.menu(made.menu) };
    }
  };
});

const HAIKU = "claude-haiku-5-5";
const GLM = "zai-org/GLM-5.3-Flash";
const QWEN = "Qwen/Qwen3.8-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const OWNER = "4c7b1a64-8f2e-4d55-9a3b-0e6f2d1c9b77";
const OTHER_OWNER = "9d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f";
const SCOPE = `owner:${OWNER}`;
const GRANT = { kind: "INTERNAL", grantId: "0b5e1c8a-3f4d-4e2a-9c71-6d8f2a4b9e10", grantEventId: "7e2d4f6a-1b3c-4d5e-8f9a-0b1c2d3e4f5a" } as const;
/** Made-up prices (micro-units per million tokens): never a real figure. */
const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 2_000_000 });
const PROJECTION = Object.freeze({ requestBytes: 4_000, completionTokenCeiling: 8_192 });
const USAGE = Object.freeze({ prompt_tokens: 1_000, completion_tokens: 500 });
const STOP = { finishReason: "stop" };

const TARGETS: readonly ProviderDiscoveryTarget[] = parseProviderDiscoveryTargets(
  JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)),
  PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
    const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
  }));
const CONFIG: PreviewProviderTestConfig = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", requested_thinking_level: "high", scope_id: "start-step-merge-fixture",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
  free_model_ids: [GLM, HAIKU], premium_model_ids: [HAIKU, GLM, QWEN, DEEPSEEK, MIMO]
}))!;
const POLICY_ON: DebateShapePolicy = Object.freeze({ ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() });
const POLICY_OFF: DebateShapePolicy = debateShapePolicyStartValues();

const Q = "Should the town build a second ferry pier before next summer?";
const EN = Object.freeze({ code: "en", name: "English" });
const TRACE = Object.freeze({ eld: null, fast: null, contractHash: null });
const lockOf = (): QuestionLanguageLock => Object.freeze({ language: EN, source: "ELD_SITE" as const, siteLanguage: "en", rewriteAccepted: false,
  originalQuestionLine: null, trace: TRACE, recordCode: "ELD_SITE", localReason: null });

const viewpoint = (id: string, angle: string, title: string, question: string) =>
  ({ viewpoint_id: id, title, question, why: "It decides whether the second pier pays off for the town.", angle_id: angle });
const LIST_1: StartList = StartListSchema.parse({ list_no: 1,
  angles: [{ angle_id: "g1", kind: "OPPOSITE_CASE", label: "The case against a second pier" }],
  viewpoints: [viewpoint("pt11", "g1", "Queues at the old pier", "Would shorter queues at the old pier make a second one needless?"),
    viewpoint("pt12", "g1", "Ferries in the winter", "Would a second pier stand empty through the quiet winter months?"),
    viewpoint("pt13", "g1", "Building costs", "Would the building costs leave less money for the ferries themselves?")] });
const LIST_2: StartList = StartListSchema.parse({ list_no: 2,
  angles: [{ angle_id: "g2", kind: "PRACTICAL", label: "What building it would take" }],
  viewpoints: [viewpoint("pt21", "g2", "Room on the shore", "Is there room on the shore for a second pier and its road?"),
    viewpoint("pt22", "g2", "Who would run it", "Who would run and repair a second pier year after year?")] });

/** The merge's reply: the first two suggestions put together, the rest each its own path, one card that fits the first path. */
const GROUP = Object.freeze({ title: "Queues and quiet winters", question: "Would the summer queues and the quiet winters together change the case for a second pier?" });
const CARD = Object.freeze({ kind: "EITHER_OR" as const, sentence: "It may be a choice between a new pier and more ferries at the old one.",
  title: "More ferries instead", question: "Would more ferries at the old pier do the same job as a second pier?", fits_path: 1, as_question: null });
const COMBINED = Object.freeze({ title: "Queues and winters together", question: "Would the summer queues and the empty winters, taken together, decide it?" });
const PARENT = "Parent question?";
const MENU_ID = "AAAAAAAAAAAAAAAAAAAAAA";
const PARENT_RUN = "5f0c2a7e-91d4-4b3a-8e6f-2c1d0b9a8f7e";

type Kind = "MERGE" | "MERGE_LATE" | "COMBINE" | "FIT";
type Material = readonly Readonly<{ name: string; content: string }>[];
const fieldOf = (material: Material, name: string): unknown => JSON.parse(material.find((entry) => entry.name === name)?.content ?? "null");
/** A field given as text (the material keeps a string as it is). */
const textOf = (material: Material, name: string): string | undefined => material.find((entry) => entry.name === name)?.content;
const mergeReply = (material: Material): string => {
  const ids = (fieldOf(material, "suggestions") as { id: string }[]).map((one) => one.id);
  return JSON.stringify({ repeats: [], cards: [CARD], suggestions: [],
    paths: ids.length < 2 ? ids.map((id) => ({ ids: [id], title: null, question: null }))
      : [{ ids: ids.slice(0, 2), ...GROUP }, ...ids.slice(2).map((id) => ({ ids: [id], title: null, question: null }))] });
};
const lateReply = (material: Material): string => JSON.stringify({ repeats: [], fits: [],
  paths: (fieldOf(material, "new_suggestions") as { id: string }[]).map((one) => ({ ids: [one.id], title: null, question: null })) });

/**
 * The step over a scripted transport. Each call answers after its kind's time (one second unless given) and is charged through the real
 * seam; no call is ended at its kind's bound, so only the step's own races can answer before a slow call ends.
 */
function harness(options: Readonly<{
  times?: Partial<Record<Kind, number>>; replies?: Partial<Record<Kind, (material: Material) => string>>; route?: "PREVIEW" | "NONE";
  transport?: boolean; haiku?: boolean; recordDown?: boolean; settingsOf?: (version: number) => StartStepSettings; newMenuId?: () => string;
}> = {}) {
  const key = newStartStepKey();
  const requests: { callSiteKey: string; aiRef: string; material: Material }[] = [];
  const entries: PreStartChargeEntry[] = [];
  const reports: Readonly<Record<string, string | number>>[] = [];
  const versions: number[] = [];
  const charges = createStartCharges({
    record: async (entry) => {
      if (options.recordDown === true) throw Object.assign(new Error("denied"), { code: "42501" });
      entries.push(entry);
    },
    priceOf: () => PRICE, clock: () => new Date(), report: () => undefined });
  const targetOf = (model: string): ProviderDiscoveryTarget | null =>
    options.haiku === false && model === HAIKU ? null : TARGETS.find((target) => target.model === model) ?? null;
  const replies: Record<Kind, (material: Material) => string> = { MERGE: mergeReply, MERGE_LATE: lateReply,
    COMBINE: () => JSON.stringify({ title: `  ${COMBINED.title}  `, question: COMBINED.question }), FIT: () => JSON.stringify({ fits: "p1" }),
    ...options.replies };
  const transport: StartTransport = Object.freeze({
    targetOf,
    callerFor: (input) => Object.freeze({
      async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
        const started = Date.now();
        requests.push({ callSiteKey: request.callSiteKey, aiRef: request.seat.aiRef, material: request.spec.material });
        const kind = preStartKindOfCallSite(request.callSiteKey) as Kind;
        const model = startModelOfSeat(request.seat.aiRef);
        const target = targetOf(model)!;
        const seam = input.seamFor(kind, target);
        await seam.assertCallAllowed(PROJECTION);
        await new Promise((resolve) => { setTimeout(resolve, options.times?.[kind] ?? 1_000); });
        await seam.recordCall({ providerRef: target.providerRef, usage: USAGE, projection: PROJECTION });
        const reply = replies[kind](request.spec.material);
        const outcome: MapCallOutcome<T> = request.spec.classify(reply, STOP).parseStatus === "PARSED"
          ? { kind: "OK", value: request.spec.read(reply, STOP) } : { kind: "FAILED", code: "TEST_UNPARSED" };
        input.onCallEnd({ callSiteKey: request.callSiteKey, model, outcome: outcome.kind, ms: Date.now() - started });
        return outcome;
      }
    })
  });
  const settingsOf = options.settingsOf ?? (() => Object.freeze({ debateShapePolicy: POLICY_ON, previewConfig: CONFIG,
    questionLanguage: Object.freeze({ decide: async () => lockOf() }) }));
  const step = createStartStep({ route: options.route ?? "PREVIEW", key,
    settingsFor: async (version) => { versions.push(version); return settingsOf(version); },
    questionCheck: { check: async () => ({ outcome: "PASS" as const }) }, transport: options.transport === false ? null : transport, charges,
    report: (line) => { reports.push(line); }, ...(options.newMenuId === undefined ? {} : { newMenuId: options.newMenuId }) });
  const binding = (over: Readonly<{ planKey?: "plus" | "premium"; settingsVersion?: number }> = {}) =>
    ({ ownerScope: SCOPE, questionLine: Q, planKey: over.planKey ?? "plus", settingsVersion: over.settingsVersion ?? 30 });
  const checkRef = (over: Parameters<typeof binding>[0] = {}): string =>
    signStartCheck(key, { ...binding(over), lock: lockOf(), originalQuestionLine: null });
  const list = (one: StartList, over: Parameters<typeof binding>[0] = {}): SignedStartList => ({ list: one, ref: signStartList(key, { ...binding(over), list: one }) });
  const mergeInput = (over: Partial<StartMergeInput> = {}): StartMergeInput => ({ question_line: Q, check_ref: checkRef(), reading_level: "plain",
    lists: [list(LIST_1)], ownerRef: OWNER, ownerScope: SCOPE, funding: GRANT, planKey: "plus", settingsVersion: 30, ...over });
  const combineInput = (over: Partial<StartCombineInput> = {}): StartCombineInput => ({
    context: { kind: "MENU", question_line: Q, check_ref: checkRef(), menu_id: MENU_ID }, reading_level: "plain", members: MEMBERS,
    ownerRef: OWNER, ownerScope: SCOPE, funding: GRANT, planKey: "plus", settingsVersion: 30, digParent: null, ...over });
  const fitInput = (over: Partial<StartFitInput> = {}): StartFitInput => ({ question_line: Q, check_ref: checkRef(), reading_level: "plain",
    own_text: "What the ferry crews themselves think of a second pier.", paths: FIT_PATHS, ownerRef: OWNER, ownerScope: SCOPE, funding: GRANT,
    planKey: "plus", settingsVersion: 30, ...over });
  const count = (callSite: string): number => requests.filter((request) => request.callSiteKey === callSite).length;
  const timing = (step: string) => reports.filter((line) => line.event === "api.start_step.timing" && line.step === step);
  return { step, key, requests, entries, reports, versions, checkRef, list, mergeInput, combineInput, fitInput, count, timing };
}

const MEMBERS: StartCombineInput["members"] = [
  { viewpoint_id: "pt11", pick_no: null, title: "Queues at the old pier", question: "Would shorter queues at the old pier make a second one needless?" },
  { viewpoint_id: "pt12", pick_no: null, title: "Ferries in the winter", question: "Would a second pier stand empty through the quiet winter months?" }
];
const FIT_PATHS: StartFitInput["paths"] = [
  { key: "p1", title: "Queues at the old pier", question: "Would shorter queues at the old pier make a second one needless?" },
  { key: "kp02", title: "Who would run it", question: "Who would run and repair a second pier year after year?" }
];

const live = (): AbortSignal => new AbortController().signal;
/** Its answer once `ms` have passed on the fake clock. */
async function after<T>(answer: Promise<T>, ms = 60_000): Promise<T> {
  await vi.advanceTimersByTimeAsync(ms);
  return answer;
}
/** Whether, and with what, a promise has settled, read as the fake clock moves. */
function watch<T>(answer: Promise<T>): { done: boolean; value: T | undefined } {
  const box: { done: boolean; value: T | undefined } = { done: false, value: undefined };
  void answer.then((value) => { box.done = true; box.value = value; });
  return box;
}
const menuOf = (answer: StartMergeResponse | undefined) => {
  if (answer === undefined || answer.source === "NONE") throw new Error(`no menu: ${JSON.stringify(answer)}`);
  return answer.menu;
};

describe("the merge: the signed lists into the signed menu", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }); });
  afterEach(() => { fault.menu = null; vi.useRealTimers(); });

  it("one list: one merge call on Haiku, revision 1 source AI with the reply's paths and cards, signed so it verifies", async () => {
    const h = harness();
    const answer = await after(h.step.merge(h.mergeInput(), live()));
    expect(h.requests.map((request) => [request.callSiteKey, request.aiRef])).toEqual([[START_CALL_SITES.merge, HAIKU]]);
    expect(answer.source).toBe("AI");
    const signed = menuOf(answer);
    expect(StartMergeResponseSchema.parse(answer)).toEqual(answer);
    expect(signed.menu.menu_id).toMatch(/^[A-Za-z0-9_-]{22}$/u);
    expect(signed.menu.revision).toBe(1);
    expect(signed.menu.language).toEqual(EN);
    expect(signed.menu.paths.map((path) => [path.path_ref, path.viewpoint_ids, path.put_together])).toEqual([["kp01", ["pt11", "pt12"], true],
      ["kp02", ["pt13"], false]]);
    expect(signed.menu.paths[0]).toMatchObject(GROUP);
    expect(signed.menu.cards).toEqual([{ card_id: "cd1", kind: CARD.kind, sentence: CARD.sentence, new_path: { title: CARD.title, question: CARD.question },
      fits_path_ref: "kp01", as_question: null }]);
    expect(verifyStartMenu(h.key, { ownerScope: SCOPE, questionLine: Q, planKey: "plus", settingsVersion: 30, signed })).toEqual(signed.menu);
    // Charged to the person and the grant as a MERGE; one timing line, MERGED, with no words in it.
    expect(h.entries.map((entry) => [entry.kind, entry.ownerRef, entry.grant])).toEqual([["MERGE", OWNER,
      { grantId: GRANT.grantId, grantEventId: GRANT.grantEventId }]]);
    expect(h.timing("MERGED")).toEqual([{ event: "api.start_step.timing", step: "MERGED", ms: 1_000 }]);
    expect(JSON.stringify(h.reports)).not.toContain("pier");
  });

  it("what the asker said reaches the merge: each answer as its sentence, then what matters", async () => {
    const h = harness();
    const clarify = { answers: [{ question: "Where is the town?", answer: "On an island" }], matters: "What families pay for the ferry" };
    await after(h.step.merge(h.mergeInput({ clarify }), live()));
    expect(fieldOf(h.requests[0]!.material, "said")).toEqual([purposeAnswerSentence(clarify.answers[0]!), clarify.matters]);
    expect(fieldOf(h.requests[0]!.material, "said")).toEqual(["Where is the town? On an island.", "What families pay for the ferry"]);
    // The same lists with other answers are another merge: a second call.
    await after(h.step.merge(h.mergeInput({ clarify: { answers: clarify.answers } }), live()));
    expect(h.count(START_CALL_SITES.merge)).toBe(2);
    expect(fieldOf(h.requests[1]!.material, "said")).toEqual(["Where is the town? On an island."]);
    await after(h.step.merge(h.mergeInput(), live()));
    expect(fieldOf(h.requests[2]!.material, "said")).toEqual([]);
  });

  it("the same merge body twice: one START:merge call, the same answer (the same menu_id and ref), no second charge", async () => {
    const h = harness();
    const body = h.mergeInput({ lists: [h.list(LIST_1), h.list(LIST_2)] });
    const first = await after(h.step.merge(body, live()));
    const second = await after(h.step.merge(JSON.parse(JSON.stringify(body)) as StartMergeInput, live()), 0);
    expect(h.count(START_CALL_SITES.merge)).toBe(1);
    expect(second).toEqual(first);
    expect(menuOf(second).ref).toBe(menuOf(first).ref);
    expect(menuOf(second).menu.menu_id).toBe(menuOf(first).menu.menu_id);
    expect(h.entries.map((entry) => entry.kind)).toEqual(["MERGE"]);
  });

  it("the same body twice at once: one call, both answered alike", async () => {
    const h = harness();
    const body = h.mergeInput();
    const one = h.step.merge(body, live());
    const two = h.step.merge(body, live());
    await vi.advanceTimersByTimeAsync(60_000);
    const [a, b] = await Promise.all([one, two]);
    expect(h.count(START_CALL_SITES.merge)).toBe(1);
    expect(b).toEqual(a);
    expect(a.source).toBe("AI");
  });

  it("a check ref spelled another way (one MAC, another last character) is the same merge: no second call", async () => {
    const h = harness();
    const body = h.mergeInput();
    const first = await after(h.step.merge(body, live()));
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = body.check_ref.at(-1)!;
    const respelled = `${body.check_ref.slice(0, -1)}${alphabet[alphabet.indexOf(last) ^ 1]!}`;
    expect(respelled).not.toBe(body.check_ref);
    expect(await after(h.step.merge({ ...body, check_ref: respelled }, live()), 0)).toEqual(first);
    expect(h.count(START_CALL_SITES.merge)).toBe(1);
  });

  it("another person with the same lists is another merge", async () => {
    const h = harness();
    await after(h.step.merge(h.mergeInput(), live()));
    const other = `owner:${OTHER_OWNER}`;
    const ref = signStartCheck(h.key, { ownerScope: other, questionLine: Q, planKey: "plus", settingsVersion: 30, lock: lockOf(), originalQuestionLine: null });
    const list = { list: LIST_1, ref: signStartList(h.key, { ownerScope: other, questionLine: Q, planKey: "plus", settingsVersion: 30, list: LIST_1 }) };
    const answer = await after(h.step.merge(h.mergeInput({ ownerRef: OTHER_OWNER, ownerScope: other, check_ref: ref, lists: [list] }), live()));
    expect(answer.source).toBe("AI");
    expect(h.count(START_CALL_SITES.merge)).toBe(2);
    expect(h.entries.map((entry) => entry.ownerRef)).toEqual([OWNER, OTHER_OWNER]);
  });

  it("a merge slower than mergeDeadlineMs: the first list alone (CODE, revision 1) just after the deadline; the call runs on and counts", async () => {
    const h = harness({ times: { MERGE: 60_000 } });
    const answer = watch(h.step.merge(h.mergeInput({ lists: [h.list(LIST_1), h.list(LIST_2)] }), live()));
    await vi.advanceTimersByTimeAsync(START_STEP_TIMING.mergeDeadlineMs - 1);
    expect(answer.done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(answer.done).toBe(true);
    expect(answer.value?.source).toBe("CODE");
    const signed = menuOf(answer.value);
    expect(signed.menu).toEqual(startCodeMenu(LIST_1, { menuId: signed.menu.menu_id, language: EN }));
    expect(signed.menu.paths.map((path) => path.viewpoint_ids)).toEqual([["pt11"], ["pt12"], ["pt13"]]);
    expect(verifyStartMenu(h.key, { ownerScope: SCOPE, questionLine: Q, planKey: "plus", settingsVersion: 30, signed })).toEqual(signed.menu);
    expect(h.timing("MERGED")).toEqual([{ event: "api.start_step.timing", step: "MERGED", ms: START_STEP_TIMING.mergeDeadlineMs }]);
    expect(h.entries).toEqual([]);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(h.entries.map((entry) => entry.kind)).toEqual(["MERGE"]);
  });

  it("a merged menu that fails the contract (a repeat id with no repeats entry): the CODE menu of lists[0], revision 1, never the spoiled one", async () => {
    const h = harness();
    fault.menu = (menu) => ({ ...menu, viewpoints: menu.viewpoints.map((one, at) => (at === 0 ? { ...one, repeat_ids: ["pt16"] } : one)) });
    const answer = await after(h.step.merge(h.mergeInput({ lists: [h.list(LIST_1), h.list(LIST_2)] }), live()));
    expect(answer.source).toBe("CODE");
    const signed = menuOf(answer);
    expect(signed.menu).toEqual(startCodeMenu(LIST_1, { menuId: signed.menu.menu_id, language: EN }));
    expect(JSON.stringify(answer)).not.toContain("pt16");
    expect(h.count(START_CALL_SITES.merge)).toBe(1);
    expect(verifyStartMenu(h.key, { ownerScope: SCOPE, questionLine: Q, planKey: "plus", settingsVersion: 30, signed })).toEqual(signed.menu);
  });

  it("a late merge: the menu so far plus the late list's paths, marked new, as revision 2 with the same menu_id", async () => {
    const h = harness();
    const first = menuOf(await after(h.step.merge(h.mergeInput(), live())));
    const answer = await after(h.step.merge(h.mergeInput({ lists: [h.list(LIST_2)], prior_menu: first }), live()));
    expect(h.count(START_CALL_SITES.mergeLate)).toBe(1);
    expect(answer.source).toBe("AI");
    const signed = menuOf(answer);
    expect(signed.menu.revision).toBe(2);
    expect(signed.menu.menu_id).toBe(first.menu.menu_id);
    expect(signed.menu.paths.slice(0, 2)).toEqual(first.menu.paths);
    expect(signed.menu.paths.slice(2).map((path) => [path.path_ref, path.viewpoint_ids, path.is_new])).toEqual([["kp03", ["pt21"], true],
      ["kp04", ["pt22"], true]]);
    expect(verifyStartMenu(h.key, { ownerScope: SCOPE, questionLine: Q, planKey: "plus", settingsVersion: 30, signed })).toEqual(signed.menu);
    expect(h.entries.map((entry) => entry.kind)).toEqual(["MERGE", "MERGE_LATE"]);
    expect(h.timing("LATE_MERGED")).toEqual([{ event: "api.start_step.timing", step: "LATE_MERGED", ms: 1_000 }]);
    // The same late body again: no second START:merge-late.
    expect(await after(h.step.merge(h.mergeInput({ lists: [h.list(LIST_2)], prior_menu: first }), live()), 0)).toEqual(answer);
    expect(h.count(START_CALL_SITES.mergeLate)).toBe(1);
  });

  it("a late merge slower than lateMergeDeadlineMs: none DEADLINE just after it, not kept: the same body again makes a new call", async () => {
    const h = harness({ times: { MERGE_LATE: 40_000 } });
    const first = menuOf(await after(h.step.merge(h.mergeInput(), live())));
    const body = h.mergeInput({ lists: [h.list(LIST_2)], prior_menu: first });
    const answer = watch(h.step.merge(body, live()));
    await vi.advanceTimersByTimeAsync(START_STEP_TIMING.lateMergeDeadlineMs - 1);
    expect(answer.done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(answer.value).toEqual({ source: "NONE", reason: "DEADLINE" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.entries.map((entry) => entry.kind)).toEqual(["MERGE", "MERGE_LATE"]);
    const again = watch(h.step.merge(body, live()));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.count(START_CALL_SITES.mergeLate)).toBe(2);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(again.value).toEqual({ source: "NONE", reason: "DEADLINE" });
  });

  it("a late merge whose call fails (the prior revision back) or whose menu fails the contract: none UNREADABLE, not kept", async () => {
    const h = harness({ replies: { MERGE_LATE: () => "not a reply" } });
    const first = menuOf(await after(h.step.merge(h.mergeInput(), live())));
    const body = h.mergeInput({ lists: [h.list(LIST_2)], prior_menu: first });
    expect(await after(h.step.merge(body, live()))).toEqual({ source: "NONE", reason: "UNREADABLE" });
    expect(await after(h.step.merge(body, live()))).toEqual({ source: "NONE", reason: "UNREADABLE" });
    expect(h.count(START_CALL_SITES.mergeLate)).toBe(2);
    const spoiled = harness();
    const prior = menuOf(await after(spoiled.step.merge(spoiled.mergeInput(), live())));
    fault.menu = (menu) => ({ ...menu, viewpoints: menu.viewpoints.map((one, at) => (at === 0 ? { ...one, repeat_ids: ["pt16"] } : one)) });
    expect(await after(spoiled.step.merge(spoiled.mergeInput({ lists: [spoiled.list(LIST_2)], prior_menu: prior }), live())))
      .toEqual({ source: "NONE", reason: "UNREADABLE" });
    expect(spoiled.count(START_CALL_SITES.mergeLate)).toBe(1);
  });

  it("a menu at its ninth revision takes no late merge: none NO_LISTS, no call", async () => {
    const h = harness();
    const first = menuOf(await after(h.step.merge(h.mergeInput(), live())));
    const ninth = { ...first.menu, revision: 9 };
    const prior = { menu: ninth, ref: signStartMenu(h.key, { ownerScope: SCOPE, questionLine: Q, planKey: "plus", settingsVersion: 30, menu: ninth }) };
    expect(await after(h.step.merge(h.mergeInput({ lists: [h.list(LIST_2)], prior_menu: prior }), live()))).toEqual({ source: "NONE", reason: "NO_LISTS" });
    expect(h.count(START_CALL_SITES.mergeLate)).toBe(0);
  });

  it("a site update while the page is open: a late merge of version 30's refs on active 31 runs on 31's settings and signs with 30", async () => {
    let active = 30;
    const h = harness({ settingsOf: (version) => Object.freeze({ debateShapePolicy: version === active ? POLICY_ON : POLICY_OFF, previewConfig: CONFIG,
      questionLanguage: Object.freeze({ decide: async () => lockOf() }) }) });
    const first = menuOf(await after(h.step.merge(h.mergeInput(), live())));
    active = 31;
    const answer = await after(h.step.merge(h.mergeInput({ lists: [h.list(LIST_2)], prior_menu: first, settingsVersion: 31 }), live()));
    expect(h.versions).toEqual([30, 31]);
    const signed = menuOf(answer);
    expect(signed.menu.revision).toBe(2);
    expect(startRefVersionOf(h.key, signed.ref)).toBe(30);
    expect(verifyStartMenu(h.key, { ownerScope: SCOPE, questionLine: Q, planKey: "plus", settingsVersion: 30, signed })).toEqual(signed.menu);
  });

  it("refused before anything is asked: another plan or a list of another version is START_PATHS_STALE; a spoiled ref is START_PATHS_INVALID", async () => {
    const h = harness();
    await expect(h.step.merge(h.mergeInput({ planKey: "premium" }), live())).rejects.toThrow("START_PATHS_STALE");
    await expect(h.step.merge(h.mergeInput({ lists: [h.list(LIST_1, { settingsVersion: 31 })] }), live())).rejects.toThrow("START_PATHS_STALE");
    await expect(h.step.merge(h.mergeInput({ question_line: "Should the town close the old pier?" }), live())).rejects.toThrow("START_PATHS_STALE");
    const spoiled = h.mergeInput();
    await expect(h.step.merge({ ...spoiled, check_ref: `${spoiled.check_ref.slice(0, -4)}AAAA` }, live())).rejects.toBeInstanceOf(TypedDomainError);
    await expect(h.step.merge({ ...spoiled, check_ref: `${spoiled.check_ref.slice(0, -4)}AAAA` }, live())).rejects.toThrow("START_PATHS_INVALID");
    expect(h.requests).toEqual([]);
    expect(h.versions).toEqual([]);
  });

  it("off as the lists are (route NONE, no transport, the switch off), and the record down: none, no call", async () => {
    for (const [h, reason] of [[harness({ route: "NONE" }), "OFF"], [harness({ transport: false }), "OFF"],
      [harness({ settingsOf: () => ({ debateShapePolicy: POLICY_OFF, previewConfig: CONFIG, questionLanguage: { decide: async () => lockOf() } }) }), "OFF"],
      [harness({ settingsOf: () => ({ debateShapePolicy: POLICY_ON, previewConfig: undefined, questionLanguage: { decide: async () => lockOf() } }) }), "OFF"]
    ] as const) {
      expect(await after(h.step.merge(h.mergeInput(), live()))).toEqual({ source: "NONE", reason });
      expect(await after(h.step.combine(h.combineInput(), live()))).toEqual({ source: "NONE", reason });
      expect(await after(h.step.fit(h.fitInput(), live()))).toEqual({ source: "NONE", reason });
      expect(h.requests).toEqual([]);
    }
    const down = harness({ recordDown: true });
    await after(down.step.merge(down.mergeInput(), live()));
    expect(down.requests).toHaveLength(1);
    for (const answer of [await after(down.step.merge(down.mergeInput({ clarify: { matters: "Other words" } }), live())),
      await after(down.step.combine(down.combineInput(), live())), await after(down.step.fit(down.fitInput(), live()))]) {
      expect(answer).toEqual({ source: "NONE", reason: "RECORD_DOWN" });
    }
    expect(down.requests).toHaveLength(1);
  });

  it("a page already gone asks nothing new", async () => {
    const h = harness();
    const gone = new AbortController();
    gone.abort();
    expect(await after(h.step.merge(h.mergeInput(), gone.signal))).toEqual({ source: "NONE", reason: "NOT_ASKED" });
    expect(await after(h.step.combine(h.combineInput(), gone.signal))).toEqual({ source: "NONE", reason: "NOT_ASKED" });
    expect(await after(h.step.fit(h.fitInput(), gone.signal))).toEqual({ source: "NONE", reason: "NOT_ASKED" });
    expect(h.requests).toEqual([]);
  });

  it("a menu id: the one given by newMenuId, else 22 base64url characters drawn afresh each first merge", async () => {
    const given = harness({ newMenuId: () => MENU_ID });
    expect(menuOf(await after(given.step.merge(given.mergeInput(), live()))).menu.menu_id).toBe(MENU_ID);
    const h = harness();
    const a = menuOf(await after(h.step.merge(h.mergeInput(), live()))).menu.menu_id;
    const b = menuOf(await after(h.step.merge(h.mergeInput({ clarify: { matters: "Other words" } }), live()))).menu.menu_id;
    expect([a, b].every((id) => /^[A-Za-z0-9_-]{22}$/u.test(id))).toBe(true);
    expect(a).not.toBe(b);
  });

  it("kept for serverCacheTtlMs from its answer: just before, the same answer; one past it, a new call", async () => {
    const h = harness();
    const body = h.mergeInput();
    const first = await after(h.step.merge(body, live()), 1_000);
    await vi.advanceTimersByTimeAsync(START_STEP_TIMING.serverCacheTtlMs - 1);
    expect(await after(h.step.merge(body, live()), 0)).toEqual(first);
    expect(h.count(START_CALL_SITES.merge)).toBe(1);
    await vi.advanceTimersByTimeAsync(2);
    const again = await after(h.step.merge(body, live()), 1_000);
    expect(h.count(START_CALL_SITES.merge)).toBe(2);
    expect(menuOf(again).menu.menu_id).not.toBe(menuOf(first).menu.menu_id);
  });

  it("past 2,000 kept merges the oldest is asked again; the newest is still kept", { timeout: 120_000 }, async () => {
    const h = harness({ times: { MERGE: 0 } });
    const body = (at: number) => h.mergeInput({ clarify: { matters: `What matters most is pier number ${String(at)}` } });
    for (let at = 0; at <= 2_000; at += 1) await after(h.step.merge(body(at), live()), 1);
    expect(h.count(START_CALL_SITES.merge)).toBe(2_001);
    await after(h.step.merge(body(2_000), live()), 1);
    expect(h.count(START_CALL_SITES.merge)).toBe(2_001);
    await after(h.step.merge(body(0), live()), 1);
    expect(h.count(START_CALL_SITES.merge)).toBe(2_002);
  });
});

describe("the combine: one question for points put together", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("on the menu: one call for the same members in any order, the same answer, trimmed words signed so the echo verifies", async () => {
    const h = harness();
    const a = await after(h.step.combine(h.combineInput(), live()));
    const b = await after(h.step.combine(h.combineInput({ members: [...MEMBERS].reverse() }), live()), 0);
    expect(h.requests.map((request) => [request.callSiteKey, request.aiRef])).toEqual([[START_CALL_SITES.combine, HAIKU]]);
    expect(b).toEqual(a);
    expect(a).toEqual({ source: "AI", title: COMBINED.title, question: COMBINED.question, combine_ref: expect.any(String) as string });
    // What the page receives, read by the contract, is what Start checks.
    const echoed = StartCombineResponseSchema.parse(JSON.parse(JSON.stringify(a)));
    if (echoed.source !== "AI") throw new Error("no combined question");
    expect(() => { verifyStartCombine(h.key, { ownerScope: SCOPE, context: { kind: "MENU", menuId: MENU_ID }, membersHash: startMembersHash(MEMBERS),
      title: echoed.title, question: echoed.question, ref: echoed.combine_ref }); }).not.toThrow();
    expect(textOf(h.requests[0]!.material, "main_question")).toBe(Q);
    expect(h.entries.map((entry) => entry.kind)).toEqual(["COMBINE"]);
    // Other members, or another menu, are another combine.
    await after(h.step.combine(h.combineInput({ members: [MEMBERS[0]!, { viewpoint_id: "pt13", pick_no: null, title: "Building costs",
      question: "Would the building costs leave less money for the ferries themselves?" }] }), live()));
    await after(h.step.combine(h.combineInput({ context: { kind: "MENU", question_line: Q, check_ref: h.checkRef(), menu_id: "BBBBBBBBBBBBBBBBBBBBBB" } }), live()));
    expect(h.count(START_CALL_SITES.combine)).toBe(3);
  });

  it("over a dig's picks: the parent's question is the main question, signed for the dig", async () => {
    const h = harness();
    const picks = [{ viewpoint_id: null, pick_no: 1, title: null, question: "Would the winter timetable change it?" },
      { viewpoint_id: null, pick_no: 2, title: null, question: "Would the crews' hours change it?" }];
    const answer = await after(h.step.combine(h.combineInput({ context: { kind: "DIG", parent_run_id: PARENT_RUN }, members: picks,
      digParent: { questionLine: PARENT, language: EN } }), live()));
    expect(textOf(h.requests[0]!.material, "main_question")).toBe(PARENT);
    if (answer.source !== "AI") throw new Error("no combined question");
    expect(() => { verifyStartCombine(h.key, { ownerScope: SCOPE, context: { kind: "DIG", parentRunId: PARENT_RUN }, membersHash: startMembersHash(picks),
      title: answer.title, question: answer.question, ref: answer.combine_ref }); }).not.toThrow();
  });

  it("past combineDeadlineMs none DEADLINE, not kept; no usable reply none UNREADABLE; no Haiku none TRANSPORT and no call", async () => {
    const slow = harness({ times: { COMBINE: 20_000 } });
    const answer = watch(slow.step.combine(slow.combineInput(), live()));
    await vi.advanceTimersByTimeAsync(START_STEP_TIMING.combineDeadlineMs - 1);
    expect(answer.done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(answer.value).toEqual({ source: "NONE", reason: "DEADLINE" });
    await vi.advanceTimersByTimeAsync(10_000);
    await after(slow.step.combine(slow.combineInput(), live()));
    expect(slow.count(START_CALL_SITES.combine)).toBe(2);
    expect(slow.entries.map((entry) => entry.kind)).toEqual(["COMBINE", "COMBINE"]);
    const unreadable = harness({ replies: { COMBINE: () => "not a reply" } });
    expect(await after(unreadable.step.combine(unreadable.combineInput(), live()))).toEqual({ source: "NONE", reason: "UNREADABLE" });
    const none = harness({ haiku: false });
    expect(await after(none.step.combine(none.combineInput(), live()))).toEqual({ source: "NONE", reason: "TRANSPORT" });
    expect(none.requests).toEqual([]);
  });

  it("the check is verified with the read line and the version not compared: a site update keeps it; another plan is STALE", async () => {
    const h = harness();
    expect((await after(h.step.combine(h.combineInput({ settingsVersion: 31 }), live()))).source).toBe("AI");
    expect(h.versions).toEqual([31]);
    await expect(h.step.combine(h.combineInput({ planKey: "premium" }), live())).rejects.toThrow("START_PATHS_STALE");
    await expect(h.step.combine(h.combineInput({ context: { kind: "MENU", question_line: "Should the town close the old pier?", check_ref: h.checkRef(),
      menu_id: MENU_ID } }), live())).rejects.toThrow("START_PATHS_STALE");
    await expect(h.step.combine(h.combineInput({ context: { kind: "MENU", question_line: Q, check_ref: "bm90.b3Vycw", menu_id: MENU_ID } }), live()))
      .rejects.toThrow("START_PATHS_INVALID");
    expect(h.count(START_CALL_SITES.combine)).toBe(1);
  });
});

describe("the fit: where the person's own view fits", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("a key, or none fits, from Haiku; no usable reply (or a key it was not given) none UNREADABLE", async () => {
    const h = harness();
    expect(await after(h.step.fit(h.fitInput(), live()))).toEqual({ source: "AI", fits_key: "p1" });
    expect(h.requests.map((request) => [request.callSiteKey, request.aiRef])).toEqual([[START_CALL_SITES.fit, HAIKU]]);
    expect(fieldOf(h.requests[0]!.material, "paths")).toEqual(FIT_PATHS);
    expect(h.entries.map((entry) => entry.kind)).toEqual(["FIT"]);
    const nowhere = harness({ replies: { FIT: () => JSON.stringify({ fits: null }) } });
    expect(await after(nowhere.step.fit(nowhere.fitInput(), live()))).toEqual({ source: "AI", fits_key: null });
    for (const reply of ["not a reply", JSON.stringify({ fits: "kp09" })]) {
      const unreadable = harness({ replies: { FIT: () => reply } });
      expect(await after(unreadable.step.fit(unreadable.fitInput(), live()))).toEqual({ source: "NONE", reason: "UNREADABLE" });
    }
  });

  it("past fitDeadlineMs none DEADLINE; no Haiku none TRANSPORT; another plan is STALE; a site update keeps the check", async () => {
    const slow = harness({ times: { FIT: 12_000 } });
    const answer = watch(slow.step.fit(slow.fitInput(), live()));
    await vi.advanceTimersByTimeAsync(START_STEP_TIMING.fitDeadlineMs - 1);
    expect(answer.done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(answer.value).toEqual({ source: "NONE", reason: "DEADLINE" });
    const none = harness({ haiku: false });
    expect(await after(none.step.fit(none.fitInput(), live()))).toEqual({ source: "NONE", reason: "TRANSPORT" });
    expect(none.requests).toEqual([]);
    const h = harness();
    await expect(h.step.fit(h.fitInput({ planKey: "premium" }), live())).rejects.toThrow("START_PATHS_STALE");
    expect((await after(h.step.fit(h.fitInput({ settingsVersion: 31 }), live()))).source).toBe("AI");
    expect(h.versions).toEqual([31]);
  });
});


/*
 * Task 57c (the owner's 5 Nov answer Q20 A and its follow-up: a failed question gives back its path-list charge): every call on step 2 is
 * charged to the question's try, which its check carries; a combine over a dig's picks to its parent's try (0164 gives them back when the
 * debate they were for fails).
 */
describe("step 2's charges name the try they were for (Task 57c)", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("the merge, a combine on the menu and the fit: the check's try; a combine over a dig's picks: the parent's", async () => {
    const h = harness();
    const made = startTryRefOfCheck(h.key, SCOPE, h.checkRef());
    expect(made).toMatch(/^[0-9a-f]{64}$/u);
    await after(h.step.merge(h.mergeInput(), live()));
    await after(h.step.combine(h.combineInput(), live()));
    await after(h.step.fit(h.fitInput(), live()));
    expect(h.entries.map((entry) => [entry.kind, entry.tryRef])).toEqual([["MERGE", made], ["COMBINE", made], ["FIT", made]]);
    const picks = [{ viewpoint_id: null, pick_no: 1, title: null, question: "Would the winter timetable change it?" },
      { viewpoint_id: null, pick_no: 2, title: null, question: "Would the crews' hours change it?" }];
    await after(h.step.combine(h.combineInput({ context: { kind: "DIG", parent_run_id: PARENT_RUN }, members: picks,
      digParent: { questionLine: PARENT, language: EN } }), live()));
    expect(h.entries.at(-1)).toMatchObject({ kind: "COMBINE", tryRef: startDigTryRefOf(h.key, { ownerScope: SCOPE, parentRunId: PARENT_RUN }) });
  });
});
