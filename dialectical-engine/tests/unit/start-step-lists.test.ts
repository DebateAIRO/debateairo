// tests/unit/start-step-lists.test.ts
// V4 start step, Task 23 (spec 2026-11-03 §4.1): the step before Start in packages/map: the angles dealt to the list writers, the angle
// planner raced with its deadline, and the lists run with its cut (show what is ready at about a minute, then add later lists marked
// late). Fake timers and a scripted caller whose replies are TEXT read by each call's own spec, as a real gateway would. Data is made up.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LENGTH_GUIDANCE_START, READER_SENTENCE_WRITING, detectArgumentLanguage, readerField, replyLanguageExpectation, type ReadingLevel } from "@debateai/kernel";
import {
  START_CALL_SITES, START_PLANNER_LENGTH, START_STEP_TIMING, mapAnglesSpec, mapPlanStartAngles, mapRunStartLists, startCutAtWordEdge, startDealAngles,
  startListCallSiteKey, type MapAngle, type MapCallOutcome, type MapCallRequest, type MapCaller, type MapSeat
} from "@debateai/map";
import type { StartList } from "@debateai/contract";

const S = (aiRef: string, maker: string): MapSeat => ({ aiRef, maker });
const G = (count: number): readonly MapAngle[] => Array.from({ length: count }, (_unused, at) =>
  ({ angleId: `g${String(at + 1)}`, kind: "SPECIFIC" as const, label: `Angle ${String(at + 1)}`, focus: `What angle ${String(at + 1)} shows.` }));
const MAX_SEVEN: readonly MapSeat[] = [S("a", "A"), S("b", "B"), S("c", "C"), S("d", "D"), S("e", "E"), S("a#2", "A"), S("b#2", "B")];
const FOUR: readonly MapSeat[] = [S("a", "A"), S("b", "B"), S("c", "C"), S("d", "D")];
const PLANNER = S("planner", "P");

describe("the angles dealt to the list writers", () => {
  it("more angles than seats: angle j to list j mod S, at most four a list, the rest dropped", () => {
    expect(startDealAngles(G(7), [S("a", "A"), S("b", "B")]).lists.map((list) => list.angles.map((angle) => angle.angleId)))
      .toEqual([["g1", "g3", "g5", "g7"], ["g2", "g4", "g6"]]);
    const one = startDealAngles(G(7), [S("a", "A")]);
    expect(one.lists.map((list) => list.angles.map((angle) => angle.angleId))).toEqual([["g1", "g2", "g3", "g4"]]);
    expect(one.dropped.map((angle) => angle.angleId)).toEqual(["g5", "g6", "g7"]);
  });

  it("as many seats as angles or more: seat i takes the first angle from i mod A its company does not hold, so every angle is covered", () => {
    expect(startDealAngles(G(5), MAX_SEVEN).lists.map((list) => [list.listNo, list.angles.map((angle) => angle.angleId)]))
      .toEqual([[1, ["g1"]], [2, ["g2"]], [3, ["g3"]], [4, ["g4"]], [5, ["g5"]], [6, ["g2"]], [7, ["g3"]]]);
    expect(startDealAngles(G(5), MAX_SEVEN).lists.map((list) => list.seat.aiRef)).toEqual(MAX_SEVEN.map((seat) => seat.aiRef));
    expect(startDealAngles(G(5), MAX_SEVEN).dropped).toEqual([]);
  });

  it("no seat or no angle deals no list", () => {
    expect(startDealAngles(G(4), [])).toEqual({ lists: [], dropped: G(4) });
    expect(startDealAngles([], FOUR).lists).toEqual([]);
  });
});

describe("labels cut at a word edge", () => {
  it("keeps whole words, and cuts hard (never inside a surrogate pair) only when there is no edge", () => {
    expect(startCutAtWordEdge("Keeping the lights on in a calm winter week", 20)).toBe("Keeping the lights");
    expect(startCutAtWordEdge("核".repeat(100), 80)).toHaveLength(80);
    expect(startCutAtWordEdge("Short label", 80)).toBe("Short label");
    expect(startCutAtWordEdge("𝔸".repeat(50), 9)).toBe("𝔸".repeat(4));
  });

  it("in Chinese and Japanese, written without spaces, the cut lands on a word edge of that language, never inside a word", () => {
    // Plain cuts at 18 and 13 would end inside 第二个 ("the second") and フェリー ("ferry"); the edges are Intl.Segmenter's in each locale.
    for (const [locale, text, max, cut] of [
      ["zh", "我们的城市应该在明年夏天之前建造第二个渡轮码头吗", 18, "我们的城市应该在明年夏天之前建造"],
      ["ja", "冬の静かな数か月間はフェリーがほとんど運航されず古い桟橋は何週間も空のままです", 13, "冬の静かな数か月間は"]
    ] as const) {
      const edges = new Set([...new Intl.Segmenter(locale, { granularity: "word" }).segment(text)].map((segment) => segment.index + segment.segment.length));
      expect(edges.has(max), `${locale}: a plain cut at ${String(max)} splits a word`).toBe(false);
      const done = startCutAtWordEdge(text, max);
      expect(done).toBe(cut);
      expect(text.startsWith(done) && edges.has(done.length), `${locale}: the cut ends on a word edge`).toBe(true);
    }
  });
});

describe("the start step's names and start values", () => {
  it("are the plan's", () => {
    expect(START_STEP_TIMING).toEqual({ plannerDeadlineMs: 15_000, cutAtMs: 30_000, listsHardCapMs: 150_000, mergeDeadlineMs: 45_000,
      lateMergeDeadlineMs: 30_000, combineDeadlineMs: 15_000, fitDeadlineMs: 10_000, heartbeatMs: 10_000, streamMaxLifeMs: 210_000,
      serverCacheTtlMs: 600_000 });
    expect(Object.keys(START_STEP_TIMING).filter((name) => /lifetime|expir/iu.test(name))).toEqual([]);
    expect(Object.isFrozen(START_STEP_TIMING)).toBe(true);
    expect(START_CALL_SITES).toEqual({ angles: "START:angles", merge: "START:merge", mergeLate: "START:merge-late", combine: "START:combine", fit: "START:fit" });
    expect(startListCallSiteKey(3)).toBe("START:list:3");
    expect(START_PLANNER_LENGTH).toEqual({ targets: LENGTH_GUIDANCE_START.map, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord });
  });
});

const Q = "Should the town build a second ferry pier before next summer?";
const Q_RO = "Ar trebui orașul să construiască un al doilea debarcader înainte de vara viitoare?";
const STOP = { finishReason: "stop" };
/** Longer than a list's angle label may be (80): the list carries it cut at a word edge. */
const WINTER_LABEL = "The quiet winter months when hardly any ferries run and the old pier stands empty for weeks";
const ANGLES_REPLY = JSON.stringify({ question_language: "en", angles: [
  { angle_id: "against", kind: "OPPOSITE_CASE", label: "The case against a second pier", focus: "Why a second pier could be a mistake." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "What the town is worried about", focus: "What the people asking are afraid of." },
  { angle_id: "do", kind: "PRACTICAL", label: "What building it would take", focus: "What building and running it would need." },
  { angle_id: "winter", kind: "SPECIFIC", label: WINTER_LABEL, focus: "How the pier is used when few ferries run." }
] });
const TITLES = ["Queues at the old pier", "Ferries in the winter", "Building costs"];
const materialOf = (request: MapCallRequest<unknown>, name: string): string | undefined => request.spec.material.find((entry) => entry.name === name)?.content;
const listReply = (request: MapCallRequest<unknown>): string => {
  const angles = JSON.parse(materialOf(request, "angles") ?? "[]") as { angle_id: string }[];
  return JSON.stringify({ paths: TITLES.map((title, at) => ({ angle_id: angles[at % angles.length]!.angle_id, title: `${title} ${request.seat.aiRef}`,
    question: `Would ${title.toLowerCase()} change whether the second pier is worth building?`, why: "It decides whether the second pier pays off for the town." })) });
};

type Timing = number | "FAIL";
/** Each seat answers after its time (from when it is asked); the planner after its own. */
function scripted(times: Readonly<Record<string, Timing>>, planner: Timing = 0) {
  const requests: MapCallRequest<unknown>[] = [];
  const ended: string[] = [];
  const caller: MapCaller = {
    async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
      const seen = request as MapCallRequest<unknown>;
      requests.push(seen);
      const timing = request.callSiteKey === START_CALL_SITES.angles ? planner : times[request.seat.aiRef] ?? 0;
      await new Promise((resolve) => { setTimeout(resolve, timing === "FAIL" ? 1_000 : timing); });
      ended.push(request.callSiteKey);
      if (timing === "FAIL") return { kind: "FAILED", code: "TEST_FAILED" };
      const reply = request.callSiteKey === START_CALL_SITES.angles ? ANGLES_REPLY : listReply(seen);
      if (request.spec.classify(reply, STOP).parseStatus !== "PARSED") return { kind: "FAILED", code: "TEST_UNPARSED" };
      return { kind: "OK", value: request.spec.read(reply, STOP) };
    }
  };
  return { caller, requests, ended };
}

function recorded() {
  const events: string[] = [];
  const lists: StartList[] = [];
  return { events, lists, onSeatDone: (answered: number, of: number) => { events.push(`progress ${String(answered)}/${String(of)}`); },
    onList: (list: StartList, late: boolean) => { lists.push(list); events.push(`${late ? "late" : "list"} ${String(list.list_no)}`); },
    onCut: (listsIn: number) => { events.push(`cut ${String(listsIn)}`); } };
}

/** Every list call the run recorded was told to its seat, and every one recorded OK has its list shown or late: none charged and lost. */
function everyCallKept(result: Awaited<ReturnType<typeof mapRunStartLists>>, events: readonly string[]): void {
  const listCalls = result.calls.filter((call) => call.step === "START_LIST");
  expect(events.filter((event) => event.startsWith("progress "))).toHaveLength(listCalls.length);
  const kept = new Set([...result.lists, ...result.late].map((list) => startListCallSiteKey(list.list_no)));
  expect(listCalls.filter((call) => call.outcome === "OK" && !kept.has(call.callSiteKey)).map((call) => call.callSiteKey)).toEqual([]);
}

const BASE = { questionLine: Q, languageName: "English", languageTag: "en", readingLevel: null as ReadingLevel | null, planner: PLANNER };

describe("the lists run", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("shows the lists in by the cut, marks the later ones late, and returns at the hard cap counted from the call", async () => {
    const script = scripted({ a: 15_000, b: 20_000, c: 40_000, d: 200_000 });
    const seen = recorded();
    const started = Date.now();
    let returnedAt = -1;
    const run = mapRunStartLists({ ...BASE, seats: FOUR, caller: script.caller, signal: new AbortController().signal, cut: "STREAM", ...seen });
    void run.then(() => { returnedAt = Date.now() - started; });
    await vi.advanceTimersByTimeAsync(START_STEP_TIMING.listsHardCapMs - 1);
    expect(returnedAt).toBe(-1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await run;
    expect(returnedAt).toBe(START_STEP_TIMING.listsHardCapMs);
    expect(seen.events).toEqual(["progress 1/4", "list 1", "progress 2/4", "list 2", "cut 2", "progress 3/4", "late 3"]);
    expect(result.lists.map((list) => list.list_no)).toEqual([1, 2]);
    expect(result.late.map((list) => list.list_no)).toEqual([3]);
    expect(result.lists[0]!.viewpoints.map((one) => one.viewpoint_id)).toEqual(["pt11", "pt12", "pt13"]);
    expect(result.lists[1]!.viewpoints.map((one) => one.viewpoint_id)).toEqual(["pt21", "pt22", "pt23"]);
    // The planner's angles in their fixed order (g1..g4), one to each seat, the labels cut at a word edge.
    expect(result.angles.map((angle) => angle.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "SPECIFIC"]);
    expect(result.lists[0]!.angles).toEqual([{ angle_id: "g1", kind: "OPPOSITE_CASE", label: "The case against a second pier" }]);
    expect(result.marks).toEqual([]);
    // Every call in plan order: the planner first, then the lists; the fourth is still running.
    expect(result.calls.map((call) => [call.callSiteKey, call.outcome])).toEqual([["START:angles", "OK"], ["START:list:1", "OK"], ["START:list:2", "OK"],
      ["START:list:3", "OK"]]);
    expect(script.requests.map((request) => [request.callSiteKey, request.step, request.seat.aiRef])).toEqual([["START:angles", "ANGLES", "planner"],
      ["START:list:1", "START_LIST", "a"], ["START:list:2", "START_LIST", "b"], ["START:list:3", "START_LIST", "c"], ["START:list:4", "START_LIST", "d"]]);
    // The late call is not stopped: it runs on to its end (and is charged by the caller).
    await vi.advanceTimersByTimeAsync(60_000);
    expect(script.ended).toContain("START:list:4");
    expect(seen.events).toHaveLength(7);
  });

  it("all lists in before the cut time: one cut when the last seat ends, no late list", async () => {
    const script = scripted({ a: 5_000, b: 9_000, c: 12_000, d: 25_000 });
    const seen = recorded();
    const run = mapRunStartLists({ ...BASE, seats: FOUR, caller: script.caller, signal: new AbortController().signal, cut: "STREAM", ...seen });
    await vi.advanceTimersByTimeAsync(25_000);
    const result = await run;
    expect(seen.events).toEqual(["progress 1/4", "list 1", "progress 2/4", "list 2", "progress 3/4", "list 3", "progress 4/4", "list 4", "cut 4"]);
    expect(result.late).toEqual([]);
    expect(result.lists.map((list) => list.list_no)).toEqual([1, 2, 3, 4]);
    expect(WINTER_LABEL.length).toBeGreaterThan(80);
    expect(result.angles[3]!.label).toBe(WINTER_LABEL);
    expect(result.lists[3]!.angles[0]!.label).toBe("The quiet winter months when hardly any ferries run and the old pier stands");
  });

  it("no list by the cut time: the cut comes with the first list after it", async () => {
    const script = scripted({ a: 35_000, b: 50_000 });
    const seen = recorded();
    const run = mapRunStartLists({ ...BASE, seats: FOUR.slice(0, 2), caller: script.caller, signal: new AbortController().signal, cut: "STREAM", ...seen });
    await vi.advanceTimersByTimeAsync(50_000);
    const result = await run;
    expect(seen.events).toEqual(["progress 1/2", "list 1", "cut 1", "progress 2/2", "late 2"]);
    expect(result.lists.map((list) => list.list_no)).toEqual([1]);
    expect(result.late.map((list) => list.list_no)).toEqual([2]);
  });

  it("WAIT_ALL takes every list, none late, and cuts once at the end", async () => {
    const script = scripted({ a: 15_000, b: 20_000, c: 40_000, d: 100_000 });
    const seen = recorded();
    const run = mapRunStartLists({ ...BASE, seats: FOUR, caller: script.caller, signal: new AbortController().signal, cut: "WAIT_ALL", ...seen });
    await vi.advanceTimersByTimeAsync(100_000);
    const result = await run;
    expect(seen.events).toEqual(["progress 1/4", "list 1", "progress 2/4", "list 2", "progress 3/4", "list 3", "progress 4/4", "list 4", "cut 4"]);
    expect(result.late).toEqual([]);
    expect(result.lists).toHaveLength(4);
  });

  it("a planner past its deadline: the fixed angles and the fallback mark; its call runs on", async () => {
    const script = scripted({ a: 1_000, b: 1_000, c: 1_000, d: 1_000 }, 20_000);
    const seen = recorded();
    const run = mapRunStartLists({ ...BASE, seats: FOUR, caller: script.caller, signal: new AbortController().signal, cut: "STREAM", ...seen });
    await vi.advanceTimersByTimeAsync(START_STEP_TIMING.plannerDeadlineMs + 1_000);
    const result = await run;
    expect(result.angles.map((angle) => angle.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "GENERAL"]);
    expect(result.marks).toEqual([{ mark: "MAP_ANGLES_FALLBACK", step: "ANGLES", detail: "no planner reply in time" }]);
    expect(result.lists).toHaveLength(4);
    expect(script.ended).not.toContain("START:angles");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(script.ended).toContain("START:angles");
  });

  it("a planner that answers in time but fails: the fixed angles, its failed call kept, the mark says the reply was missing", async () => {
    const alone = scripted({}, "FAIL");
    const planned = mapPlanStartAngles({ questionLine: Q, planner: PLANNER, caller: alone.caller, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(1_000);
    const failed = await planned;
    expect(failed.fallback).toBe(true);
    expect(failed.angles.map((angle) => angle.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "GENERAL"]);
    expect(failed.calls.map((call) => [call.callSiteKey, call.order, call.outcome, call.code])).toEqual([["START:angles", 0, "FAILED", "TEST_FAILED"]]);
    const script = scripted({ a: 1_000 }, "FAIL");
    const run = mapRunStartLists({ ...BASE, seats: FOUR.slice(0, 1), caller: script.caller, signal: new AbortController().signal, cut: "STREAM",
      onSeatDone: () => {}, onList: () => {}, onCut: () => {} });
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await run;
    expect(result.marks).toEqual([{ mark: "MAP_ANGLES_FALLBACK", step: "ANGLES", detail: "angles reply missing" }]);
    expect(result.calls.map((call) => [call.callSiteKey, call.outcome])).toEqual([["START:angles", "FAILED"], ["START:list:1", "OK"]]);
    expect(result.lists[0]!.angles.map((angle) => angle.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "GENERAL"]);
  });

  it("an aborted signal asks no planner: the fixed angles and no call, since nothing new starts after an abort", async () => {
    const script = scripted({}, 1_000);
    const controller = new AbortController();
    controller.abort();
    const planned = await mapPlanStartAngles({ questionLine: Q, planner: PLANNER, caller: script.caller, signal: controller.signal });
    expect(script.requests).toEqual([]);
    expect(planned.fallback).toBe(true);
    expect(planned.calls).toEqual([]);
    expect(planned.angles.map((angle) => angle.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "GENERAL"]);
  });

  it("more than nine seats is refused START_SEATS_INVALID before any call, the planner's included", async () => {
    const script = scripted({});
    const ten = Array.from({ length: 10 }, (_unused, at) => S(`s${String(at)}`, `M${String(at)}`));
    const refused = mapRunStartLists({ ...BASE, seats: ten, caller: script.caller, signal: new AbortController().signal, cut: "STREAM",
      onSeatDone: () => {}, onList: () => {}, onCut: () => {} }).then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await refused).toMatchObject({ code: "START_SEATS_INVALID" });
    expect(script.requests).toEqual([]);
  });

  it("a list that ends in the same tick as the hard cap is taken in: late, its seat told, its call recorded", async () => {
    const script = scripted({ a: 1_000, b: START_STEP_TIMING.listsHardCapMs });
    const seen = recorded();
    const run = mapRunStartLists({ ...BASE, seats: FOUR.slice(0, 2), caller: script.caller, signal: new AbortController().signal, cut: "STREAM", ...seen });
    await vi.advanceTimersByTimeAsync(START_STEP_TIMING.listsHardCapMs - 1);
    // The seat's timer and the cap's fire in one synchronous step (the seat's first), so their promise chains interleave, as two ends in
    // one tick do: the seat's call ends before the run stops its waits, while the cap wins the run's race.
    vi.advanceTimersByTime(1);
    const result = await run;
    expect(script.ended).toContain("START:list:2");
    expect(seen.events).toEqual(["progress 1/2", "list 1", "cut 1", "progress 2/2", "late 2"]);
    expect(result.lists.map((list) => list.list_no)).toEqual([1]);
    expect(result.late.map((list) => list.list_no)).toEqual([2]);
    expect(result.calls.map((call) => [call.callSiteKey, call.outcome])).toEqual([["START:angles", "OK"], ["START:list:1", "OK"], ["START:list:2", "OK"]]);
    everyCallKept(result, seen.events);
  });

  it("the planner alone: on time it plans, with no seat or past the deadline the fixed angles", async () => {
    const script = scripted({}, 1_000);
    const planned = mapPlanStartAngles({ questionLine: Q, planner: PLANNER, caller: script.caller, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(1_000);
    const onTime = await planned;
    expect(onTime.fallback).toBe(false);
    expect(onTime.angles.map((angle) => angle.angleId)).toEqual(["g1", "g2", "g3", "g4"]);
    expect(onTime.calls.map((call) => [call.callSiteKey, call.order, call.outcome])).toEqual([["START:angles", 0, "OK"]]);
    const none = await mapPlanStartAngles({ questionLine: Q, planner: null, caller: script.caller, signal: new AbortController().signal });
    expect(none.fallback).toBe(true);
    expect(none.calls).toEqual([]);
    expect(none.angles.map((angle) => angle.kind)).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "GENERAL"]);
  });

  it("asks the planner map.angles.v2 byte for byte: engine 2, the start lengths, no language lock", async () => {
    const script = scripted({ a: 1_000 });
    const run = mapRunStartLists({ ...BASE, seats: FOUR.slice(0, 1), caller: script.caller, signal: new AbortController().signal, cut: "STREAM",
      onSeatDone: () => {}, onList: () => {}, onCut: () => {} });
    await vi.advanceTimersByTimeAsync(1_000);
    await run;
    const planner = script.requests[0]!;
    // It runs before the language is settled: today's directive in the language the kernel reads the question in (this English line
    // reads as undetermined, so "the same language as the question").
    expect(detectArgumentLanguage(Q).nameEn).toBe("the same language as the question");
    const expected = mapAnglesSpec({ questionLine: Q, languageName: detectArgumentLanguage(Q).nameEn, languageTag: "und",
      replyLanguage: replyLanguageExpectation(Q), length: START_PLANNER_LENGTH, engine: true });
    expect(planner.spec.contract.contractId).toBe("map.angles.v2");
    expect(planner.spec.contract).toEqual(expected.contract);
    expect(planner.spec.material).toEqual(expected.material);
    expect(planner.spec.material.map((entry) => entry.name)).toEqual(["question_line", "length"]);
    expect(planner.spec.engine).toBe(true);
    const ro = scripted({}, 1_000);
    const roPlanned = mapPlanStartAngles({ questionLine: Q_RO, planner: PLANNER, caller: ro.caller, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(1_000);
    await roPlanned;
    expect(ro.requests[0]!.spec.contract.instruction).toContain("Write every natural-language field in Romanian, the language of the question,");
  });

  it("a failed list is dropped with a note, and no second wave is asked", async () => {
    const script = scripted({ a: 5_000, b: "FAIL", c: 6_000, d: 7_000 });
    const seen = recorded();
    const run = mapRunStartLists({ ...BASE, seats: FOUR, caller: script.caller, signal: new AbortController().signal, cut: "STREAM", ...seen });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await run;
    // The failed seat ends first (at 1 s), without a list.
    expect(seen.events).toEqual(["progress 1/4", "progress 2/4", "list 1", "progress 3/4", "list 3", "progress 4/4", "list 4", "cut 3"]);
    expect(result.notes).toEqual([{ note: "LIST_DROPPED", step: "START_LIST", detail: "list:2" }]);
    expect(script.requests.map((request) => request.callSiteKey)).toEqual(["START:angles", "START:list:1", "START:list:2", "START:list:3", "START:list:4"]);
    expect(result.calls.find((call) => call.callSiteKey === "START:list:2")).toMatchObject({ outcome: "FAILED", code: "TEST_FAILED" });
  });

  it("an abort returns at once and starts nothing more; the calls already asked run on", async () => {
    const script = scripted({ a: 15_000, b: 20_000, c: 40_000, d: 60_000 });
    const seen = recorded();
    const controller = new AbortController();
    setTimeout(() => { controller.abort(); }, 16_000);
    const run = mapRunStartLists({ ...BASE, seats: FOUR, caller: script.caller, signal: controller.signal, cut: "STREAM", ...seen });
    await vi.advanceTimersByTimeAsync(16_000);
    const result = await run;
    expect(seen.events).toEqual(["progress 1/4", "list 1"]);
    expect(result.lists.map((list) => list.list_no)).toEqual([1]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen.events).toEqual(["progress 1/4", "list 1"]);
    expect(script.ended).toEqual(["START:angles", "START:list:1", "START:list:2", "START:list:3", "START:list:4"]);
    expect(script.requests).toHaveLength(5);
    everyCallKept(result, seen.events);
  });

  it("an abort before the angles are planned asks no list", async () => {
    const script = scripted({ a: 1_000 }, 10_000);
    const controller = new AbortController();
    setTimeout(() => { controller.abort(); }, 2_000);
    const run = mapRunStartLists({ ...BASE, seats: FOUR, caller: script.caller, signal: controller.signal, cut: "STREAM", onSeatDone: () => {},
      onList: () => {}, onCut: () => {} });
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await run;
    expect(result.lists).toEqual([]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(script.requests.map((request) => request.callSiteKey)).toEqual(["START:angles"]);
  });

  it("angles planned elsewhere (at Next) are used as given", async () => {
    const script = scripted({ a: 1_000, b: 1_000 });
    const planned = Promise.resolve({ angles: G(2), fallback: false, calls: [] });
    const run = mapRunStartLists({ ...BASE, seats: FOUR.slice(0, 2), caller: script.caller, signal: new AbortController().signal, cut: "STREAM",
      planned, onSeatDone: () => {}, onList: () => {}, onCut: () => {} });
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await run;
    expect(script.requests.map((request) => request.callSiteKey)).toEqual(["START:list:1", "START:list:2"]);
    expect(result.angles).toEqual(G(2));
    expect(result.lists.map((list) => list.angles.map((angle) => angle.angle_id))).toEqual([["g1"], ["g2"]]);
  });

  it("the reader: no level, no reader field and no reader sentence; a level, both, before the language line", async () => {
    for (const readingLevel of [null, "plain"] as const) {
      const script = scripted({ a: 1_000 });
      const run = mapRunStartLists({ ...BASE, readingLevel, seats: FOUR.slice(0, 1), caller: script.caller, signal: new AbortController().signal,
        cut: "STREAM", onSeatDone: () => {}, onList: () => {}, onCut: () => {} });
      await vi.advanceTimersByTimeAsync(1_000);
      await run;
      const list = script.requests.find((request) => request.callSiteKey === "START:list:1")!;
      expect(list.spec.material.map((entry) => entry.name)).toEqual(readingLevel === null ? ["question_line", "angles", "question_language"]
        : ["question_line", "angles", "reader", "question_language"]);
      if (readingLevel === null) expect(list.spec.contract.instruction).not.toContain(READER_SENTENCE_WRITING);
      else {
        expect(list.spec.contract.instruction).toContain(`\n\n${READER_SENTENCE_WRITING}\n\n`);
        expect(materialOf(list, "reader")).toBe(readerField("plain").content);
      }
    }
  });
});
