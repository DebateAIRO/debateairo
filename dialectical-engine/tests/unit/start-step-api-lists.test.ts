// tests/unit/start-step-api-lists.test.ts
// V4 start step, Task 28 (spec 2026-11-03 §4.1; items ask-f7, ask-f9, read-f13; owner answers Q2 and Q8 of 4 Nov): THE STEP PORT AT NEXT.
// At Next the question check, the language decision and the angle planner run together; the lists start once the check passes and the
// language is settled, and stream (progress, list, cut, late_list) to one end. The same words from the same person, within ten minutes,
// get the same reading back with no call and no charge (joined while it still runs), a reload included; a reading that answered nothing
// is not kept. Fake timers, a scripted transport whose replies are TEXT read by each call's own spec, the real per-person charge seam
// over a recording writer, a scripted question check and language port. Prices and data are made up.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreStartChargeEntry } from "@debateai/budget";
import type { StartListsEvent } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { START_CALL_SITES, START_STEP_TIMING, type MapCallOutcome, type MapCallRequest } from "@debateai/map";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS, parsePreviewProviderTestConfig, parseProviderDiscoveryTargets, previewModelRow, previewTargetJsonRow,
  type PreviewProviderTestConfig, type ProviderDiscoveryTarget
} from "@debateai/providers";
import { debateShapePolicyStartValues, debateShapeStartStepStartValues, type DebateShapePolicy } from "@debateai/register";
import { answerForOutcome, type AskQuestionCheck } from "../../apps/api/src/question-check/ask-gate.js";
import type { QuestionCheckOutcome } from "../../apps/api/src/question-check/contract.js";
import { QuestionLanguageChoiceNeeded, type QuestionLanguageLock, type QuestionLanguagePort } from "../../apps/api/src/question-language/decider.js";
import { createStartCharges } from "../../apps/api/src/start-step/charge.js";
import { startModelOfSeat } from "../../apps/api/src/start-step/seats.js";
import { newStartStepKey, startTryRefOfCheck, verifyStartCheck, verifyStartList } from "../../apps/api/src/start-step/signing.js";
import {
  START_LISTS_REUSE, createStartStep, startStepRouteOf, type StartListsInput, type StartStepSettings
} from "../../apps/api/src/start-step/step.js";
import { START_STEP_CALL_BOUNDS, preStartKindOfCallSite, type StartTransport } from "../../apps/api/src/start-step/transport.js";

const HAIKU = "claude-haiku-5-5";
const GLM = "zai-org/GLM-5.3-Flash";
const QWEN = "Qwen/Qwen3.8-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const OWNER = "4c7b1a64-8f2e-4d55-9a3b-0e6f2d1c9b77";
const OTHER_OWNER = "9d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f";
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
const targetOf = (model: string): ProviderDiscoveryTarget | null => TARGETS.find((target) => target.model === model) ?? null;
const configOf = (free: readonly string[], premium: readonly string[]): PreviewProviderTestConfig => parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", requested_thinking_level: "high", scope_id: "start-step-lists-fixture",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
  ...([...free, ...premium].includes(HAIKU) ? { anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock" } : {}),
  free_model_ids: free, premium_model_ids: premium
}))!;
/** The test site's five reviewed models; Free's line-up has Haiku and GLM. */
const CONFIG = configOf([GLM, HAIKU], [HAIKU, GLM, QWEN, DEEPSEEK, MIMO]);
const CONFIG_NO_HAIKU = configOf([GLM, QWEN], [GLM, QWEN, DEEPSEEK, MIMO]);
/** The row in force with the step switched on: Plus has four list writers (mapAIs), Premium five. */
const POLICY_ON: DebateShapePolicy = Object.freeze({ ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() });
const POLICY_OFF: DebateShapePolicy = debateShapePolicyStartValues();

const Q = "Should the town build a second ferry pier before next summer?";
const MIXED = "Should the town build a second ferry pier, adică un debarcader nou, before next summer?";
const REWRITE = "Should the town build a second, new ferry pier before next summer?";
const EN = Object.freeze({ code: "en", name: "English" });
const TRACE = Object.freeze({ eld: null, fast: null, contractHash: null });
const OFFER_REF = "b2ZmZXI.c2lnbmVk";
const OFFER = Object.freeze({ check_ref: OFFER_REF, main_language: EN, languages_seen: [EN, { code: "ro", name: "Romanian" }], proposed_question: REWRITE });

const ANGLES_REPLY = JSON.stringify({ question_language: "en", angles: [
  { angle_id: "against", kind: "OPPOSITE_CASE", label: "The case against a second pier", focus: "Why a second pier could be a mistake." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "What the town is worried about", focus: "What the people asking are afraid of." },
  { angle_id: "do", kind: "PRACTICAL", label: "What building it would take", focus: "What building and running it would need." },
  { angle_id: "winter", kind: "SPECIFIC", label: "The quiet winter months", focus: "How the pier is used when few ferries run." }
] });
const TITLES = ["Queues at the old pier", "Ferries in the winter", "Building costs"];
const listReply = (request: MapCallRequest<unknown>): string => {
  const angles = JSON.parse(request.spec.material.find((entry) => entry.name === "angles")?.content ?? "[]") as { angle_id: string }[];
  return JSON.stringify({ paths: TITLES.map((title, at) => ({ angle_id: angles[at % angles.length]!.angle_id, title: `${title} ${request.seat.aiRef}`,
    question: `Would ${title.toLowerCase()} change whether the second pier is worth building?`, why: "It decides whether the second pier pays off for the town." })) });
};

const lockOf = (over: Partial<QuestionLanguageLock> = {}): QuestionLanguageLock => Object.freeze({ language: EN, source: "ELD_SITE" as const,
  siteLanguage: "en", rewriteAccepted: false, originalQuestionLine: null, trace: TRACE, recordCode: "ELD_SITE", localReason: null, ...over });

type Harness = ReturnType<typeof harness>;
/**
 * The step over a scripted transport. Each seat's list answers after its time (from when it is asked), the planner after `plannerMs`.
 * A call longer than its kind's bound (START_STEP_CALL_BOUNDS: the lists' is listsHardCapMs) ends at the bound with no reply and no usage,
 * so it is not charged, as a gateway applying those bounds would end it. Every other call is charged through the real seam.
 */
function harness(options: Readonly<{
  times?: Readonly<Record<string, number>>; plannerMs?: number; route?: "PREVIEW" | "NONE"; transport?: boolean; config?: PreviewProviderTestConfig;
  policy?: DebateShapePolicy | null; outcome?: (line: string) => QuestionCheckOutcome; questionCheck?: boolean; language?: boolean; lineUp?: boolean;
  report?: (line: Readonly<Record<string, string | number>>) => void;
}> = {}) {
  const key = newStartStepKey();
  const requests: { callSiteKey: string; aiRef: string }[] = [];
  const entries: PreStartChargeEntry[] = [];
  const reports: Readonly<Record<string, string | number>>[] = [];
  const checks: string[] = [];
  const decided: string[] = [];
  const versions: number[] = [];
  const times = options.times ?? {};
  const charges = createStartCharges({ record: async (entry) => { entries.push(entry); }, priceOf: () => PRICE, clock: () => new Date(),
    report: () => undefined });
  const transport: StartTransport = Object.freeze({
    targetOf,
    callerFor: (input) => Object.freeze({
      async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
        const started = Date.now();
        requests.push({ callSiteKey: request.callSiteKey, aiRef: request.seat.aiRef });
        const kind = preStartKindOfCallSite(request.callSiteKey)!;
        const model = startModelOfSeat(request.seat.aiRef);
        const target = targetOf(model)!;
        const seam = input.seamFor(kind, target);
        const ended = (outcome: MapCallOutcome<T>): MapCallOutcome<T> => {
          input.onCallEnd({ callSiteKey: request.callSiteKey, model, outcome: outcome.kind, ms: Date.now() - started });
          return outcome;
        };
        await seam.assertCallAllowed(PROJECTION);
        const ms = kind === "ANGLES" ? options.plannerMs ?? 0 : times[request.seat.aiRef] ?? 1_000;
        const bound = START_STEP_CALL_BOUNDS[kind].deadlineMs;
        await new Promise((resolve) => { setTimeout(resolve, Math.min(ms, bound)); });
        if (ms > bound) return ended({ kind: "FAILED", code: "TEST_CALL_BOUND" });
        await seam.recordCall({ providerRef: target.providerRef, usage: USAGE, projection: PROJECTION });
        const reply = kind === "ANGLES" ? ANGLES_REPLY : listReply(request as MapCallRequest<unknown>);
        if (request.spec.classify(reply, STOP).parseStatus !== "PARSED") return ended({ kind: "FAILED", code: "TEST_UNPARSED" });
        return ended({ kind: "OK", value: request.spec.read(reply, STOP) });
      }
    })
  });
  const questionLanguage: QuestionLanguagePort = Object.freeze({
    async decide(input: Parameters<QuestionLanguagePort["decide"]>[0]): Promise<QuestionLanguageLock> {
      const choice = input.ask.question_language_choice;
      decided.push(choice?.choice ?? "-");
      if (choice !== undefined) {
        if (choice.check_ref !== OFFER_REF) throw new TypedDomainError("QUESTION_LANGUAGE_CHECK_INVALID", "QUESTION_LANGUAGE_CHECK_INVALID");
        return choice.choice === "USE_REWRITE"
          ? lockOf({ source: "CHOICE", recordCode: "CHOICE", rewriteAccepted: true, originalQuestionLine: choice.original_question_line ?? null })
          : lockOf({ source: "CHOICE", recordCode: "CHOICE" });
      }
      if (input.ask.question_line === MIXED) throw new QuestionLanguageChoiceNeeded(OFFER, TRACE);
      return lockOf();
    }
  });
  const questionCheck: AskQuestionCheck = Object.freeze({
    async check(line: string): Promise<QuestionCheckOutcome> { checks.push(line); return options.outcome?.(line) ?? { outcome: "PASS" }; }
  });
  const settings = (): StartStepSettings => Object.freeze({ debateShapePolicy: options.policy === undefined ? POLICY_ON : options.policy,
    previewConfig: options.lineUp === false ? undefined : options.config ?? CONFIG, questionLanguage: options.language === false ? undefined : questionLanguage });
  const step = createStartStep({ route: options.route ?? "PREVIEW", key,
    settingsFor: async (version) => { versions.push(version); return settings(); },
    questionCheck: options.questionCheck === false ? undefined : questionCheck, transport: options.transport === false ? null : transport, charges,
    report: (line) => { reports.push(line); options.report?.(line); } });
  const read = (input: StartListsInput, signal: AbortSignal = new AbortController().signal) => {
    const events: StartListsEvent[] = [];
    const done = step.lists(input, (event) => { events.push(event); }, signal);
    return { events, done };
  };
  const count = (callSite: string): number => requests.filter((request) => request.callSiteKey.startsWith(callSite)).length;
  return { step, key, requests, entries, reports, checks, decided, versions, read, count };
}

const INPUT: StartListsInput = Object.freeze({ question_line: Q, site_language: "en", reading_level: "plain", ownerRef: OWNER,
  ownerScope: `owner:${OWNER}`, funding: GRANT, planKey: "plus", settingsVersion: 30, country: "RO" });
const inputOf = (over: Partial<StartListsInput> = {}): StartListsInput => Object.freeze({ ...INPUT, ...over });
/** The order case: Plus's four seats in the speed order answer at 15 s, 20 s, 40 s and 200 s. */
const ORDER_TIMES = Object.freeze({ [HAIKU]: 15_000, [GLM]: 20_000, [QWEN]: 40_000, [DEEPSEEK]: 200_000 });
const kinds = (events: readonly StartListsEvent[]): string[] => events.map((event) => event.event);
const endOf = (events: readonly StartListsEvent[]) => events.at(-1);
const timingLines = (h: Harness) => h.reports.filter((line) => line.event === "api.start_step.timing");
const listRefs = (events: readonly StartListsEvent[]): string[] => events.flatMap((event) =>
  event.event === "list" || event.event === "late_list" ? [event.data.list.ref] : []);
const checkOf = (events: readonly StartListsEvent[]) => {
  const found = events.find((event) => event.event === "check");
  if (found?.event !== "check") throw new Error("no check event");
  return found.data;
};
/** Reads to its end: every scripted call ends within 200 s (the slowest is cut at the lists' bound). */
async function readToEnd(h: Harness, input: StartListsInput, ms = 200_000): Promise<StartListsEvent[]> {
  const reading = h.read(input);
  await vi.advanceTimersByTimeAsync(ms);
  await reading.done;
  return reading.events;
}

describe("the step port at Next: the lists stream", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("streams check, the lists in by the cut, the cut, a late list and one end DONE; every ref verifies", async () => {
    const h = harness({ times: ORDER_TIMES });
    const events = await readToEnd(h, INPUT);
    expect(kinds(events)).toEqual(["check", "progress", "list", "progress", "list", "cut", "progress", "late_list", "end"]);
    expect(endOf(events)).toEqual({ event: "end", data: { reason: "DONE" } });
    const check = checkOf(events);
    expect(check).toEqual({ check_ref: expect.any(String) as string, language: { code: "en", name: "English" }, seats: 4 });
    expect(verifyStartCheck(h.key, { ownerScope: INPUT.ownerScope, questionLine: Q, planKey: "plus", settingsVersion: 30, ref: check.check_ref,
      originalQuestionLine: null })).toMatchObject({ language: EN, rewriteAccepted: false, originalQuestionLine: null });
    expect(events.filter((event) => event.event === "progress").map((event) => event.data)).toEqual([{ answered: 1, of: 4 }, { answered: 2, of: 4 },
      { answered: 3, of: 4 }]);
    expect(events.find((event) => event.event === "cut")).toEqual({ event: "cut", data: { lists_in: 2 } });
    const signed = events.flatMap((event) => event.event === "list" || event.event === "late_list" ? [event.data.list] : []);
    expect(signed.map((one) => one.list.list_no)).toEqual([1, 2, 3]);
    for (const one of signed) {
      expect(verifyStartList(h.key, { ownerScope: INPUT.ownerScope, questionLine: Q, planKey: "plus", settingsVersion: 30, signed: one })).toEqual(one.list);
    }
    // The settings of the version the binding names; the lists written by Plus's seats in the speed order.
    expect(h.versions).toEqual([30]);
    expect(h.requests.map((request) => [request.callSiteKey, request.aiRef])).toEqual([["START:angles", HAIKU], ["START:list:1", HAIKU],
      ["START:list:2", GLM], ["START:list:3", QWEN], ["START:list:4", DEEPSEEK]]);
  });

  it("a refused question: exactly refused 422 and end REFUSED, and no list is asked", async () => {
    const outcome: QuestionCheckOutcome = { outcome: "REFUSE", kind: "made-up-subject", screen: "REFUSE", emergencyNumber: false };
    const h = harness({ outcome: () => outcome });
    const events = await readToEnd(h, INPUT);
    expect(events).toEqual([{ event: "refused", data: { status: 422, body: answerForOutcome(outcome, "RO")!.body } },
      { event: "end", data: { reason: "REFUSED" } }]);
    expect(h.count("START:list:")).toBe(0);
    const crisis = harness({ outcome: () => ({ outcome: "CRISIS" }) });
    expect(await readToEnd(crisis, INPUT)).toEqual([{ event: "refused", data: { status: 422,
      body: answerForOutcome({ outcome: "CRISIS" }, "RO")!.body } }, { event: "end", data: { reason: "REFUSED" } }]);
    expect(crisis.count("START:list:")).toBe(0);
  });

  it("a check that cannot answer is none CHECK_UNAVAILABLE; no question check at all asks nothing", async () => {
    const down = harness({ outcome: () => ({ outcome: "UNAVAILABLE", code: "QUESTION_CHECK_TRANSPORT_FAILED" }) });
    expect(await readToEnd(down, INPUT)).toEqual([{ event: "none", data: { reason: "CHECK_UNAVAILABLE" } }, { event: "end", data: { reason: "NONE" } }]);
    expect(down.count("START:list:")).toBe(0);
    const absent = harness({ questionCheck: false });
    expect(await readToEnd(absent, INPUT)).toEqual([{ event: "none", data: { reason: "CHECK_UNAVAILABLE" } }, { event: "end", data: { reason: "NONE" } }]);
    expect(absent.requests).toEqual([]);
    // Try again really tries again: the check that could not answer is asked again; the planner already asked is kept.
    let answers = 0;
    const flaky = harness({ outcome: () => (answers++ === 0 ? { outcome: "UNAVAILABLE", code: "QUESTION_CHECK_TRANSPORT_FAILED" } : { outcome: "PASS" }) });
    expect(kinds(await readToEnd(flaky, INPUT, 2_000))).toEqual(["none", "end"]);
    expect(endOf(await readToEnd(flaky, INPUT, 2_000))).toEqual({ event: "end", data: { reason: "DONE" } });
    expect(flaky.checks).toEqual([Q, Q]);
    expect(flaky.count(START_CALL_SITES.angles)).toBe(1);
  });

  it("an offer, then the re-post with the rewrite: one planner call, one check of each line, and the check ref verifies with the rewritten line", async () => {
    const h = harness();
    const offered = await readToEnd(h, inputOf({ question_line: MIXED }));
    expect(offered).toEqual([{ event: "language_offer", data: { offer: OFFER } }, { event: "end", data: { reason: "LANGUAGE_CHOICE" } }]);
    expect(h.count("START:list:")).toBe(0);
    const chosen = await readToEnd(h, inputOf({ question_line: REWRITE,
      question_language_choice: { check_ref: OFFER_REF, choice: "USE_REWRITE", original_question_line: MIXED } }));
    expect(endOf(chosen)).toEqual({ event: "end", data: { reason: "DONE" } });
    expect(h.count(START_CALL_SITES.angles)).toBe(1);
    // The person's words once (shared by the offer and its re-post), then the rewrite the lists are written on (wave-4 review).
    expect(h.checks).toEqual([MIXED, REWRITE]);
    expect(h.count("START:list:")).toBe(4);
    const ref = checkOf(chosen).check_ref;
    expect(verifyStartCheck(h.key, { ownerScope: INPUT.ownerScope, questionLine: REWRITE, planKey: "plus", settingsVersion: 30, ref,
      originalQuestionLine: MIXED })).toMatchObject({ rewriteAccepted: true, originalQuestionLine: MIXED });
    expect(() => verifyStartCheck(h.key, { ownerScope: INPUT.ownerScope, questionLine: MIXED, planKey: "plus", settingsVersion: 30, ref,
      originalQuestionLine: MIXED })).toThrow("START_PATHS_STALE");
  });

  // Task 57c (owner, 5 Nov: a failed question gives back its path-list charge): every call of a question is charged to its try, which the
  // check carries, so Start can give the try's charges to the debate (0164). Task 57d (owner, 6 Nov: "Random id"): the try is a random id
  // minted once per reading; the offer and its re-post share the planner, so they share the reading and its try.
  it("every charge of a reading names the check's try: the planner and each list, after an offer and its re-post too", async () => {
    const plain = harness({ times: ORDER_TIMES });
    const read = await readToEnd(plain, INPUT);
    const made = startTryRefOfCheck(plain.key, INPUT.ownerScope, checkOf(read).check_ref);
    expect(made).toMatch(/^[0-9a-f]{64}$/u);
    expect(plain.entries.length).toBeGreaterThan(1);
    expect(plain.entries.map((entry) => entry.tryRef)).toEqual(plain.entries.map(() => made));
    const h = harness();
    await readToEnd(h, inputOf({ question_line: MIXED }));
    const chosen = await readToEnd(h, inputOf({ question_line: REWRITE,
      question_language_choice: { check_ref: OFFER_REF, choice: "USE_REWRITE", original_question_line: MIXED } }));
    const rewritten = startTryRefOfCheck(h.key, INPUT.ownerScope, checkOf(chosen).check_ref);
    expect(rewritten).toMatch(/^[0-9a-f]{64}$/u);
    expect(h.entries.map((entry) => [entry.kind, entry.tryRef])).toEqual(h.entries.map((entry) => [entry.kind, rewritten]));
    expect(h.entries.map((entry) => entry.kind)).toContain("ANGLES");
  });

  // Task 57d (the owner's 6 Nov answer, card "Privacy": "Random id"): nothing made from the question's words is a try. Within the ten
  // minutes the same words share the planner, so a reading at another level is the same reading and keeps its try; past them the same
  // words from the same person, under the same key, are a new reading with a new random try, and each charge names its own reading's.
  it("two readings of the same words by the same person get two random tries; a reading kept for the ten minutes keeps its try", async () => {
    const h = harness();
    const first = await readToEnd(h, INPUT, 2_000);
    const one = startTryRefOfCheck(h.key, INPUT.ownerScope, checkOf(first).check_ref);
    expect(one).toMatch(/^[0-9a-f]{64}$/u);
    const level = await readToEnd(h, inputOf({ reading_level: "expert" }), 2_000);
    expect(h.count(START_CALL_SITES.angles)).toBe(1);
    expect(startTryRefOfCheck(h.key, INPUT.ownerScope, checkOf(level).check_ref)).toBe(one);
    const charged = h.entries.length;
    expect(h.entries.map((entry) => entry.tryRef)).toEqual(h.entries.map(() => one));
    await vi.advanceTimersByTimeAsync(START_STEP_TIMING.serverCacheTtlMs);
    const second = await readToEnd(h, INPUT, 2_000);
    expect(h.count(START_CALL_SITES.angles)).toBe(2);
    const two = startTryRefOfCheck(h.key, INPUT.ownerScope, checkOf(second).check_ref);
    expect(two).toMatch(/^[0-9a-f]{64}$/u);
    expect(two).not.toBe(one);
    expect(h.entries.length).toBeGreaterThan(charged);
    expect(h.entries.slice(charged).map((entry) => entry.tryRef)).toEqual(h.entries.slice(charged).map(() => two));
  });

  it("a choice the language step refuses is none NOT_ASKED, and no list is asked", async () => {
    const h = harness();
    const events = await readToEnd(h, inputOf({ question_line: REWRITE,
      question_language_choice: { check_ref: "bm90.b3Vycw", choice: "USE_REWRITE", original_question_line: MIXED } }));
    expect(events).toEqual([{ event: "none", data: { reason: "NOT_ASKED" } }, { event: "end", data: { reason: "NONE" } }]);
    expect(h.count("START:list:")).toBe(0);
    // A rewrite whose choice does not verify is never checked: only the person's own words were.
    expect(h.checks).toEqual([MIXED]);
  });

  it("review: the rewrite the person accepted is checked too, before any list is written on it; one the check refuses ends REFUSED", async () => {
    // R22 checks the re-post's line (the rewrite) at POST /v1/asks; Start no longer checks a line unchanged since Next (Task 36), so the
    // line the lists are written on and the check ref is signed for must have passed the check here.
    const refuse: QuestionCheckOutcome = { outcome: "REFUSE", kind: "made-up-subject", screen: "REFUSE", emergencyNumber: false };
    const h = harness({ outcome: (line) => (line === REWRITE ? refuse : { outcome: "PASS" }) });
    expect(endOf(await readToEnd(h, inputOf({ question_line: MIXED })))).toEqual({ event: "end", data: { reason: "LANGUAGE_CHOICE" } });
    const chosen = await readToEnd(h, inputOf({ question_line: REWRITE,
      question_language_choice: { check_ref: OFFER_REF, choice: "USE_REWRITE", original_question_line: MIXED } }));
    expect(chosen).toEqual([{ event: "refused", data: { status: 422, body: answerForOutcome(refuse, "RO")!.body } },
      { event: "end", data: { reason: "REFUSED" } }]);
    expect(h.checks).toEqual([MIXED, REWRITE]);
    expect(h.count("START:list:")).toBe(0);
  });

  it("review: everyone gone before the lists start (Back while the planner reads): no list is asked; the same words later read afresh", async () => {
    // Decision record (3 Nov) and Calls item 8: the calls already started finish and count, and nothing new starts.
    const h = harness({ plannerMs: 5_000 });
    const controller = new AbortController();
    const first = h.read(INPUT, controller.signal);
    await vi.advanceTimersByTimeAsync(2_000);
    controller.abort();
    await first.done;
    await vi.advanceTimersByTimeAsync(200_000);
    expect(h.count("START:list:")).toBe(0);
    expect(h.entries.map((entry) => entry.kind)).toEqual(["ANGLES"]);
    // Not kept as a reading; the planner and the check already asked are kept for the same words.
    const again = await readToEnd(h, INPUT, 2_000);
    expect(endOf(again)).toEqual({ event: "end", data: { reason: "DONE" } });
    expect(h.count(START_CALL_SITES.angles)).toBe(1);
    expect(h.checks).toEqual([Q]);
    expect(h.count("START:list:")).toBe(4);
  });

  it("review: the first page gone but a second press joined before the lists start: the lists start, once, and both get the check", async () => {
    const h = harness({ plannerMs: 5_000 });
    const controller = new AbortController();
    const first = h.read(INPUT, controller.signal);
    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();
    await first.done;
    await vi.advanceTimersByTimeAsync(1_000);
    const second = h.read(inputOf({}));
    await vi.advanceTimersByTimeAsync(200_000);
    await second.done;
    expect(kinds(first.events)).toEqual(["check"]);
    expect(kinds(second.events)).toEqual(["check", "progress", "list", "progress", "list", "progress", "list", "progress", "list", "cut", "end"]);
    expect(second.events[0]).toEqual(first.events[0]);
    expect(h.count(START_CALL_SITES.angles)).toBe(1);
    expect(h.count("START:list:")).toBe(4);
  });

  it("the planner is the first seat (Haiku where the line-up has it, GLM where not), charged ANGLES on that seat's model", async () => {
    for (const [config, planner] of [[CONFIG, HAIKU], [CONFIG_NO_HAIKU, GLM]] as const) {
      const h = harness({ config });
      await readToEnd(h, INPUT);
      expect(h.requests.filter((request) => request.callSiteKey === START_CALL_SITES.angles).map((request) => request.aiRef)).toEqual([planner]);
      expect(h.requests.find((request) => request.callSiteKey === "START:list:1")?.aiRef).toBe(planner);
      const angles = h.entries.filter((entry) => entry.kind === "ANGLES");
      expect(angles).toHaveLength(1);
      expect(angles[0]).toMatchObject({ kind: "ANGLES", ownerRef: OWNER,
        providerRef: `pre-start:angles:${previewModelRow(planner)!.provider}:${planner}` });
    }
  });

  it("every seat slower than the lists' hard cap: none NO_LISTS and end NONE, with no cut before it", async () => {
    const slow = Object.fromEntries([HAIKU, GLM, QWEN, DEEPSEEK].map((model) => [model, 200_000]));
    const h = harness({ times: slow });
    const events = await readToEnd(h, INPUT);
    expect(kinds(events)).toEqual(["check", "none", "end"]);
    expect(events.slice(1)).toEqual([{ event: "none", data: { reason: "NO_LISTS" } }, { event: "end", data: { reason: "NONE" } }]);
  });

  it("the switch off for the plan, route NONE, no transport, no settings line-up or no language port: none OFF and no call", async () => {
    for (const h of [harness({ policy: POLICY_OFF }), harness({ policy: null }), harness({ route: "NONE" }), harness({ transport: false }),
      harness({ lineUp: false }), harness({ language: false })]) {
      expect(await readToEnd(h, INPUT)).toEqual([{ event: "none", data: { reason: "OFF" } }, { event: "end", data: { reason: "NONE" } }]);
      expect(h.requests).toEqual([]);
      expect(h.checks).toEqual([]);
      expect(h.entries).toEqual([]);
    }
  });

  it("the record down: none RECORD_DOWN before any call", async () => {
    const charges = createStartCharges({ record: async () => { throw Object.assign(new Error("denied"), { code: "42501" }); }, priceOf: () => PRICE,
      clock: () => new Date(), report: () => undefined });
    const seam = charges.seamFor({ ownerRef: OWNER, funding: null, kind: "LIST", target: targetOf(GLM)! });
    await seam.recordCall({ providerRef: targetOf(GLM)!.providerRef, usage: USAGE, projection: PROJECTION });
    expect(charges.recordDown()).toBe(true);
    const calls: string[] = [];
    const step = createStartStep({ route: "PREVIEW", key: newStartStepKey(), charges, report: () => undefined, questionCheck: undefined,
      settingsFor: async () => ({ debateShapePolicy: POLICY_ON, previewConfig: CONFIG, questionLanguage: { decide: async () => lockOf() } }),
      transport: { targetOf, callerFor: () => ({ call: async (request) => { calls.push(request.callSiteKey); return { kind: "FAILED", code: "X" }; } }) } });
    const events: StartListsEvent[] = [];
    await step.lists(INPUT, (event) => { events.push(event); }, new AbortController().signal);
    expect(events).toEqual([{ event: "none", data: { reason: "RECORD_DOWN" } }, { event: "end", data: { reason: "NONE" } }]);
    expect(calls).toEqual([]);
  });

  it("no seat left (the line-up's models have no target): none NO_LISTS, no call", async () => {
    const step = createStartStep({ route: "PREVIEW", key: newStartStepKey(), charges: createStartCharges({ record: async () => undefined, priceOf: () => PRICE,
      clock: () => new Date(), report: () => undefined }), report: () => undefined, questionCheck: { check: async () => ({ outcome: "PASS" }) },
    settingsFor: async () => ({ debateShapePolicy: POLICY_ON, previewConfig: CONFIG, questionLanguage: { decide: async () => lockOf() } }),
    transport: { targetOf: () => null, callerFor: () => ({ call: async () => ({ kind: "FAILED", code: "X" }) }) } });
    const events: StartListsEvent[] = [];
    await step.lists(INPUT, (event) => { events.push(event); }, new AbortController().signal);
    expect(events).toEqual([{ event: "none", data: { reason: "NO_LISTS" } }, { event: "end", data: { reason: "NONE" } }]);
  });

  it("an abort at 16 s: nothing more is sent; the calls in flight run on and count, the one past the lists' bound is not charged", async () => {
    const h = harness({ times: ORDER_TIMES });
    const controller = new AbortController();
    setTimeout(() => { controller.abort(); }, 16_000);
    const reading = h.read(INPUT, controller.signal);
    await vi.advanceTimersByTimeAsync(16_000);
    await reading.done;
    expect(kinds(reading.events)).toEqual(["check", "progress", "list"]);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(kinds(reading.events)).toEqual(["check", "progress", "list"]);
    expect(h.entries.map((entry) => entry.kind)).toEqual(["ANGLES", "LIST", "LIST", "LIST"]);
    // The charges name the person and the team grant.
    expect(h.entries.every((entry) => entry.ownerRef === OWNER)).toBe(true);
    expect(h.entries.map((entry) => entry.grant)).toEqual(Array.from({ length: 4 }, () => ({ grantId: GRANT.grantId, grantEventId: GRANT.grantEventId })));
  });

  it("timing lines: STARTED, CHECKED, SEAT_IN with its model, CUT; none carries the question, and a throwing report changes nothing", async () => {
    const h = harness({ times: ORDER_TIMES });
    await readToEnd(h, INPUT);
    const lines = timingLines(h);
    expect(lines.map((line) => line.step)).toEqual(["STARTED", "CHECKED", "SEAT_IN", "SEAT_IN", "CUT", "SEAT_IN"]);
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual(line.step === "SEAT_IN" ? ["event", "model", "ms", "step"] : ["event", "ms", "step"]);
    }
    expect(lines.filter((line) => line.step === "SEAT_IN").map((line) => [line.model, line.ms])).toEqual([[HAIKU, 15_000], [GLM, 20_000],
      [QWEN, 40_000]]);
    expect(lines.find((line) => line.step === "CUT")?.ms).toBe(START_STEP_TIMING.cutAtMs);
    // Each call's end is one code line: its site, model, outcome and time.
    const ends = h.reports.filter((line) => line.event === "api.start_step.call");
    expect(ends.map((line) => Object.keys(line).sort())).toEqual(Array.from({ length: 5 }, () => ["call_site", "event", "model", "ms", "outcome"]));
    expect(ends.map((line) => [line.call_site, line.outcome])).toEqual([["START:angles", "OK"], ["START:list:1", "OK"], ["START:list:2", "OK"],
      ["START:list:3", "OK"], ["START:list:4", "FAILED"]]);
    const text = JSON.stringify(h.reports);
    for (const piece of [Q, "second ferry pier", ...TITLES]) expect(text).not.toContain(piece);
    // A reporter that throws never touches the stream.
    const loud = harness({ times: ORDER_TIMES, report: () => { throw new Error("logger down"); } });
    const events = await readToEnd(loud, INPUT);
    expect(kinds(events)).toEqual(["check", "progress", "list", "progress", "list", "cut", "progress", "late_list", "end"]);
  });

  it("the route: PREVIEW only with a preview gate and the pre-Start writer; a NONE step says so", () => {
    expect(startStepRouteOf({ previewGate: Object.freeze({}), writerPresent: true })).toBe("PREVIEW");
    expect(startStepRouteOf({ previewGate: undefined, writerPresent: true })).toBe("NONE");
    expect(startStepRouteOf({ previewGate: Object.freeze({}), writerPresent: false })).toBe("NONE");
    expect(startStepRouteOf({ previewGate: undefined, writerPresent: false })).toBe("NONE");
    expect(harness({ route: "NONE" }).step.route).toBe("NONE");
    expect(harness().step.route).toBe("PREVIEW");
  });
});

describe("one reading per words and person (ask-f9, owner answer Q2)", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("pins the book's bounds", () => {
    expect(START_LISTS_REUSE).toEqual({ entries: 2_000, bytesMax: 33_554_432 });
    expect(Object.isFrozen(START_LISTS_REUSE)).toBe(true);
  });

  it("the same words again after the first ended, and after a reload: the same stream event for event, no call, no charge, one REUSED line each", async () => {
    const h = harness({ times: ORDER_TIMES });
    const first = await readToEnd(h, INPUT);
    const calls = h.requests.length;
    const charged = h.entries.length;
    expect(h.count(START_CALL_SITES.angles)).toBe(1);
    expect(h.count("START:list:")).toBe(4);
    const second = await readToEnd(h, inputOf({}), 0);
    expect(second).toEqual(first);
    expect(listRefs(second)).toEqual(listRefs(first));
    expect(checkOf(second).check_ref).toBe(checkOf(first).check_ref);
    expect(h.requests).toHaveLength(calls);
    expect(h.entries).toHaveLength(charged);
    expect(timingLines(h).filter((line) => line.step === "REUSED")).toEqual([{ event: "api.start_step.timing", step: "REUSED", ms: 0 }]);
    // A fresh page load posts the same body: nothing tells the server it is a reload, so it is the stored stream again.
    const reloaded = await readToEnd(h, JSON.parse(JSON.stringify(INPUT)) as StartListsInput, 0);
    expect(reloaded).toEqual(first);
    expect(h.requests).toHaveLength(calls);
    expect(h.checks).toEqual([Q]);
    expect(timingLines(h).filter((line) => line.step === "REUSED")).toHaveLength(2);
  });

  it("the same post 1 s later, while the first still writes: both streams end with the same nine events, one set of calls and charges", async () => {
    const h = harness({ times: ORDER_TIMES });
    const first = h.read(INPUT);
    await vi.advanceTimersByTimeAsync(1_000);
    const second = h.read(inputOf({}));
    await vi.advanceTimersByTimeAsync(200_000);
    await Promise.all([first.done, second.done]);
    expect(kinds(first.events)).toEqual(["check", "progress", "list", "progress", "list", "cut", "progress", "late_list", "end"]);
    expect(second.events).toEqual(first.events);
    expect(h.count(START_CALL_SITES.angles)).toBe(1);
    expect(h.count("START:list:")).toBe(4);
    expect(h.entries.map((entry) => entry.kind)).toEqual(["ANGLES", "LIST", "LIST", "LIST"]);
  });

  it("the first stream aborted at 16 s and the same post at 17 s: no new call; what is in comes at once, the rest as it comes", async () => {
    const h = harness({ times: ORDER_TIMES });
    const controller = new AbortController();
    const first = h.read(INPUT, controller.signal);
    await vi.advanceTimersByTimeAsync(16_000);
    controller.abort();
    await first.done;
    await vi.advanceTimersByTimeAsync(1_000);
    const second = h.read(inputOf({}));
    await vi.advanceTimersByTimeAsync(0);
    expect(kinds(second.events)).toEqual(["check", "progress", "list"]);
    expect(second.events).toEqual(first.events);
    await vi.advanceTimersByTimeAsync(200_000);
    await second.done;
    expect(kinds(second.events)).toEqual(["check", "progress", "list", "progress", "list", "cut", "progress", "late_list", "end"]);
    expect(kinds(first.events)).toEqual(["check", "progress", "list"]);
    expect(h.count(START_CALL_SITES.angles)).toBe(1);
    expect(h.count("START:list:")).toBe(4);
    expect(h.entries.map((entry) => entry.kind)).toEqual(["ANGLES", "LIST", "LIST", "LIST"]);
  });

  it("another owner, other words, another reading level, another plan or another settings version: each its own run, charged", async () => {
    // Each seat answers in a second, so every reading here ends long within the ten minutes.
    const h = harness();
    await readToEnd(h, INPUT, 2_000);
    expect(h.count("START:list:")).toBe(4);
    let lists = 4;
    let charged = h.entries.length;
    for (const [name, other] of [
      ["another owner", inputOf({ ownerRef: OTHER_OWNER, ownerScope: `owner:${OTHER_OWNER}` })],
      ["other words", inputOf({ question_line: "Should the town close the old pier next winter?" })],
      ["another reading level", inputOf({ reading_level: "expert" })],
      ["another settings version (a site update: Next reads with the new one)", inputOf({ settingsVersion: 31 })]
    ] as const) {
      const events = await readToEnd(h, other, 2_000);
      expect(endOf(events), name).toEqual({ event: "end", data: { reason: "DONE" } });
      expect(h.count("START:list:"), name).toBe(lists + 4);
      expect(h.entries.length, name).toBeGreaterThan(charged);
      lists += 4;
      charged = h.entries.length;
    }
    // The owner's planner and check are their own; the same words and owner share one planner and one check.
    expect(h.count(START_CALL_SITES.angles)).toBe(3);
    expect(h.checks).toEqual([Q, Q, "Should the town close the old pier next winter?"]);
    expect(h.versions).toEqual([30, 30, 30, 30, 31]);
  });

  it("the same words after the plan changes from Free to Premium: its own run on Premium's seats, charged", async () => {
    const h = harness();
    const free = await readToEnd(h, inputOf({ planKey: "free" }));
    expect(checkOf(free).seats).toBe(3);
    const charged = h.entries.length;
    const premium = await readToEnd(h, inputOf({ planKey: "premium" }));
    expect(checkOf(premium).seats).toBe(5);
    expect(checkOf(premium).check_ref).not.toBe(checkOf(free).check_ref);
    expect(h.count("START:list:")).toBe(3 + 5);
    expect(h.entries.slice(charged).map((entry) => entry.kind)).toEqual(["LIST", "LIST", "LIST", "LIST", "LIST"]);
  });

  it("a reading that ended none NO_LISTS is not kept: the next post calls again", async () => {
    const slow = Object.fromEntries([HAIKU, GLM, QWEN, DEEPSEEK].map((model) => [model, 200_000]));
    const h = harness({ times: slow });
    expect(kinds(await readToEnd(h, INPUT))).toEqual(["check", "none", "end"]);
    expect(h.count("START:list:")).toBe(4);
    expect(kinds(await readToEnd(h, INPUT))).toEqual(["check", "none", "end"]);
    expect(h.count("START:list:")).toBe(8);
    expect(timingLines(h).filter((line) => line.step === "REUSED")).toEqual([]);
  });

  it("an offer is kept and replayed; KEEP_MINE after it is its own reading, with no second planner call or check", async () => {
    const h = harness();
    const offered = await readToEnd(h, inputOf({ question_line: MIXED }));
    expect(await readToEnd(h, inputOf({ question_line: MIXED }), 0)).toEqual(offered);
    const kept = await readToEnd(h, inputOf({ question_line: MIXED, question_language_choice: { check_ref: OFFER_REF, choice: "KEEP_MINE" } }));
    expect(kinds(kept)[0]).toBe("check");
    expect(endOf(kept)).toEqual({ event: "end", data: { reason: "DONE" } });
    expect(h.count(START_CALL_SITES.angles)).toBe(1);
    expect(h.checks).toEqual([MIXED]);
    expect(h.decided).toEqual(["-", "KEEP_MINE"]);
    expect(verifyStartCheck(h.key, { ownerScope: INPUT.ownerScope, questionLine: MIXED, planKey: "plus", settingsVersion: 30,
      ref: checkOf(kept).check_ref, originalQuestionLine: null })).toMatchObject({ rewriteAccepted: false, source: "CHOICE" });
  });

  it("kept for serverCacheTtlMs from its first event: just before, the stored stream; one past it, a new run, charged", async () => {
    const h = harness();
    const first = await readToEnd(h, INPUT, 2_000);
    await vi.advanceTimersByTimeAsync(START_STEP_TIMING.serverCacheTtlMs - 2_000 - 1);
    expect(await readToEnd(h, INPUT, 0)).toEqual(first);
    expect(h.count("START:list:")).toBe(4);
    const charged = h.entries.length;
    await vi.advanceTimersByTimeAsync(2);
    const again = await readToEnd(h, INPUT, 2_000);
    expect(endOf(again)).toEqual({ event: "end", data: { reason: "DONE" } });
    expect(h.count(START_CALL_SITES.angles)).toBe(2);
    expect(h.count("START:list:")).toBe(8);
    expect(h.entries.length).toBe(charged * 2);
  });

  it("past START_LISTS_REUSE.entries kept readings the oldest is read again; the newest is still the stored stream", { timeout: 120_000 }, async () => {
    const h = harness({ times: Object.fromEntries([HAIKU, GLM, QWEN, DEEPSEEK].map((model) => [model, 0])) });
    const words = (at: number): string => `Should the town build pier number ${String(at)} before next summer?`;
    for (let at = 0; at <= START_LISTS_REUSE.entries; at += 1) await readToEnd(h, inputOf({ question_line: words(at) }), 1);
    const lists = h.count("START:list:");
    expect(lists).toBe(4 * (START_LISTS_REUSE.entries + 1));
    await readToEnd(h, inputOf({ question_line: words(START_LISTS_REUSE.entries) }), 0);
    expect(h.count("START:list:")).toBe(lists);
    const oldest = await readToEnd(h, inputOf({ question_line: words(0) }), 1);
    expect(endOf(oldest)).toEqual({ event: "end", data: { reason: "DONE" } });
    expect(h.count("START:list:")).toBe(lists + 4);
  });
});
