// tests/unit/start-step-timing.test.ts
// V4 start step, Task 87 (spec 2026-11-03 §4.1 "About a minute"): is about a minute reachable? A timing model of the lists, the cut and the
// card at the earlier single-call speeds (public figures), checked against the code itself on a virtual StartClock. Each plan's seats are
// taken as the API takes them (startSeatsFor over START_SEAT_SPEED_ORDER, the plan's mapAIs), the planner on the first seat; every list
// starts together; the first merge starts at the cut over the lists in by then, on Haiku, raced with its deadline as the API races it
// (Task 29). Every deadline and the cut come from START_STEP_TIMING, never literals, so the Mac measurement's values (Task 91) move the model
// with the code. A model, not the Mac measurement: the lines it prints are what these speeds predict, to "list shown" (Start waits for the
// list). The question and the replies are made up.
import { describe, expect, it } from "vitest";
import {
  MAP_FALLBACK_ANGLES, START_CALL_SITES, START_STEP_TIMING, mapMergeStartLists, mapRunStartLists, startCodeMenu, type MapCallOutcome, type MapCallRequest,
  type MapCaller, type MapSeat, type StartClock
} from "@debateai/map";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS, parseProviderDiscoveryTargets, previewModelRow, previewTargetJsonRow, type ProviderDiscoveryTarget
} from "@debateai/providers";
import type { StartList, StartMenu } from "@debateai/contract";
import { startModelOfSeat, startSeatsFor } from "../../apps/api/src/start-step/seats.js";

const T = START_STEP_TIMING;
const HAIKU = "claude-haiku-5-5";
const GLM = "zai-org/GLM-5.3-Flash";
const QWEN = "Qwen/Qwen3.8-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";

const LIST_MS: Readonly<Record<string, number>> = Object.freeze({ [HAIKU]: 15_500, [GLM]: 39_000, [QWEN]: 86_000, [DEEPSEEK]: 98_000, [MIMO]: 101_000 });
/** The earlier single-call speeds in ms (public figures, plan Task 87): the planner, the merge, and each model's list. */
const SPEEDS = Object.freeze({ planner: 14_000, merge: 44_000, lists: LIST_MS });
/** Each plan's list writers: its mapAIs (spec §4.1 "Which AIs", S5). */
const PLANS = Object.freeze([["Free", 2], ["Plus", 4], ["Pro", 5], ["Max", 7]] as const);
/** The test site's five companies, one model each; startSeatsFor puts them in the speed order. */
const ROSTER = Object.freeze([GLM, DEEPSEEK, MIMO, QWEN, HAIKU]);

const TARGETS: readonly ProviderDiscoveryTarget[] = parseProviderDiscoveryTargets(
  JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)),
  PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
    const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
  }));
const targetOf = (model: string): ProviderDiscoveryTarget | null => TARGETS.find((target) => target.model === model) ?? null;
const seatsOf = (mapAIs: number) => startSeatsFor({ roster: ROSTER, targetOf, count: mapAIs, busy: new Set() });
/** A seat's measured list time (a "#2" seat is its model again). */
function listMsOf(seat: MapSeat): number {
  const ms = SPEEDS.lists[startModelOfSeat(seat.aiRef)];
  if (ms === undefined) throw new Error(`no measured list time for ${seat.aiRef}`);
  return ms;
}

type ModelSeat = Readonly<{ maker: string; listMs: number }>;
/**
 * The model (plan Task 87, restating Task 23's rules; times from Next): start = min(planner, plannerDeadlineMs); arrivals = start + each
 * list's time, and a list after listsHardCapMs never lands; cut = all-in if that is by cutAtMs, else max(cutAtMs, the first list). In by the
 * cut: every list when all are in by cutAtMs; else those in by cutAtMs; else the first list alone, which brings the cut (lists in the same
 * moment after it are late). card = cut + min(merge, mergeDeadlineMs) (one list is merged too, Task 24). The run returns when every list is
 * in, else at listsHardCapMs.
 */
function cardModel(plannerMs: number, seats: readonly ModelSeat[]) {
  const start = Math.min(plannerMs, T.plannerDeadlineMs);
  const arrivals = seats.map((seat, at) => ({ listNo: at + 1, maker: seat.maker, at: start + seat.listMs }));
  const landed = arrivals.filter((one) => one.at <= T.listsHardCapMs).sort((a, b) => a.at - b.at || a.listNo - b.listNo);
  const first = landed[0];
  if (first === undefined) throw new Error("the model needs one list in");
  const allIn = landed.length === arrivals.length ? landed.at(-1)!.at : null;
  const allByCutTime = allIn !== null && allIn <= T.cutAtMs;
  const cut = allByCutTime ? allIn : Math.max(T.cutAtMs, first.at);
  const inByCut = allByCutTime ? landed : first.at <= T.cutAtMs ? landed.filter((one) => one.at <= T.cutAtMs) : [first];
  const late = landed.filter((one) => !inByCut.includes(one));
  return Object.freeze({ start, cut, card: cut + Math.min(SPEEDS.merge, T.mergeDeadlineMs), returned: allIn ?? T.listsHardCapMs,
    inByCut: inByCut.map((one) => one.listNo).sort((a, b) => a - b), late: late.map((one) => one.listNo).sort((a, b) => a - b),
    companies: new Set(inByCut.map((one) => one.maker)).size, landed: landed.length });
}

/** A StartClock that moves only when nothing else can: once every pending promise has settled, straight to the next wait's end, one wait at a time. */
function virtualClock() {
  let now = 0;
  let order = 0;
  const waits: { until: number; order: number; wake(): void }[] = [];
  const clock: StartClock = Object.freeze({
    now: () => now,
    sleep: (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
      if (signal.aborted) { resolve(); return; }
      const stop = (): void => {
        const at = waits.indexOf(wait);
        if (at >= 0) waits.splice(at, 1);
        resolve();
      };
      const wait = { until: now + Math.max(0, ms), order: order++, wake: () => { signal.removeEventListener("abort", stop); resolve(); } };
      waits.push(wait);
      signal.addEventListener("abort", stop, { once: true });
    })
  });
  const settled = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve); });
  async function until<R>(work: Promise<R>): Promise<R> {
    let over = false;
    void work.then(() => { over = true; }, () => { over = true; });
    for (;;) {
      await settled();
      if (over) return work;
      waits.sort((a, b) => a.until - b.until || a.order - b.order);
      const next = waits.shift();
      if (next === undefined) throw new Error("the virtual clock has nothing left to wait for");
      now = next.until;
      next.wake();
    }
  }
  return { clock, until };
}

const Q = "Should the town build a second ferry pier before next summer?";
const STEP = { questionLine: Q, languageName: "English", languageTag: "en", readingLevel: null };
const MENU_ID = "Ab3_dEf-Gh1jKl2MnOpQ4r";
const STOP = { finishReason: "stop" };
const NEVER = new AbortController().signal;
const ANGLES_REPLY = JSON.stringify({ question_language: "en", angles: [
  { angle_id: "against", kind: "OPPOSITE_CASE", label: "The case against a second pier", focus: "Why a second pier could be a mistake." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "What the town is worried about", focus: "What the people asking are afraid of." },
  { angle_id: "do", kind: "PRACTICAL", label: "What building it would take", focus: "What building and running it would need." },
  { angle_id: "winter", kind: "SPECIFIC", label: "The quiet winter months", focus: "How the pier is used when few ferries run." }
] });
const TITLES = ["Queues at the old pier", "Ferries in the winter", "Building costs"];
const materialOf = (request: MapCallRequest<unknown>, name: string): string | undefined => request.spec.material.find((entry) => entry.name === name)?.content;
const listReply = (request: MapCallRequest<unknown>): string => {
  const angles = JSON.parse(materialOf(request, "angles") ?? "[]") as { angle_id: string }[];
  return JSON.stringify({ paths: TITLES.map((title, at) => ({ angle_id: angles[at % angles.length]!.angle_id, title: `${title} ${request.seat.aiRef}`,
    question: `Would ${title.toLowerCase()} change whether the second pier is worth building?`, why: "It decides whether the second pier pays off for the town." })) });
};
/** The merge keeps every suggestion it is given as a path of its own. */
const mergeReply = (request: MapCallRequest<unknown>): string => {
  const ids = (JSON.parse(materialOf(request, "suggestions") ?? "[]") as { id: string }[]).map((one) => one.id);
  return JSON.stringify({ repeats: [], paths: ids.map((id) => ({ ids: [id], title: null, question: null })), cards: [], suggestions: [] });
};

type Asked = Readonly<{ step: string; callSiteKey: string; aiRef: string; at: number }>;
type Shown = Readonly<{ menu: StartMenu; source: "AI" | "CODE"; at: number }>;

/**
 * One card on the virtual clock: the lists run (STREAM) with the plan's seats and the planner on the first, the first merge at the cut over
 * the lists in by then, on the Haiku seat, raced with mergeDeadlineMs (the API's race, Task 29: past it, the code menu of the first list).
 * Each call answers after its time; nothing else takes time.
 */
async function runCard(input: Readonly<{ seats: readonly MapSeat[]; haiku: MapSeat | null; plannerMs: number; listMs(seat: MapSeat): number }>) {
  const { clock, until } = virtualClock();
  const asked: Asked[] = [];
  const caller: MapCaller = {
    async call<V>(request: MapCallRequest<V>): Promise<MapCallOutcome<V>> {
      const seen = request as MapCallRequest<unknown>;
      asked.push(Object.freeze({ step: request.step, callSiteKey: request.callSiteKey, aiRef: request.seat.aiRef, at: clock.now() }));
      const ms = request.step === "ANGLES" ? input.plannerMs : request.step === "START_LIST" ? input.listMs(request.seat) : SPEEDS.merge;
      await clock.sleep(ms, NEVER);
      const reply = request.step === "ANGLES" ? ANGLES_REPLY : request.step === "START_LIST" ? listReply(seen) : mergeReply(seen);
      if (request.spec.classify(reply, STOP).parseStatus !== "PARSED") return { kind: "FAILED", code: "TEST_UNPARSED" };
      return { kind: "OK", value: request.spec.read(reply, STOP) };
    }
  };
  const progress: string[] = [];
  const cuts: Readonly<{ at: number; listsIn: number }>[] = [];
  const inByCut: StartList[] = [];
  // Set by onCut; a holder, so the type is not narrowed to its first null.
  const first: { shown: Promise<Shown> | null } = { shown: null };
  const firstMerge = async (lists: readonly StartList[]): Promise<Shown> => {
    const waits = new AbortController();
    const merged = mapMergeStartLists({ ...STEP, clarifyLines: [], lists, prior: null, seat: input.haiku, caller, menuId: MENU_ID, signal: NEVER });
    const ended = await Promise.race([merged, clock.sleep(T.mergeDeadlineMs, waits.signal).then(() => "DEADLINE" as const)]);
    waits.abort();
    return ended === "DEADLINE"
      ? Object.freeze({ menu: startCodeMenu(lists[0]!, { menuId: MENU_ID, language: { code: STEP.languageTag, name: STEP.languageName } }),
        source: "CODE" as const, at: clock.now() })
      : Object.freeze({ menu: ended.menu, source: ended.source, at: clock.now() });
  };
  const ran = mapRunStartLists({ ...STEP, seats: input.seats, planner: input.seats[0]!, caller, clock, signal: NEVER, cut: "STREAM",
    onSeatDone: (answered, of) => { progress.push(`${String(answered)}/${String(of)}`); },
    onList: (list, late) => { if (!late) inByCut.push(list); },
    onCut: (listsIn) => {
      cuts.push(Object.freeze({ at: clock.now(), listsIn }));
      if (listsIn > 0) first.shown = firstMerge([...inByCut]);
    } }).then((result) => Object.freeze({ result, at: clock.now() }));
  const run = await until(ran);
  const card = first.shown === null ? null : await until(first.shown);
  return { run, card, asked, progress, cuts };
}

/** Compares one card with the model; every message names the plan and the step. */
function expectModel(plan: string, seats: readonly MapSeat[], done: Awaited<ReturnType<typeof runCard>>, model: ReturnType<typeof cardModel>) {
  const lists = done.asked.filter((one) => one.step === "START_LIST");
  expect(lists.map((one) => one.at), `${plan}: the lists start together at the planner time`).toEqual(seats.map(() => model.start));
  expect(lists.map((one) => one.aiRef), `${plan}: one list a seat`).toEqual(seats.map((seat) => seat.aiRef));
  expect(done.cuts, `${plan}: one cut`).toHaveLength(1);
  expect(done.cuts[0]!.at, `${plan}: cut`).toBe(model.cut);
  expect(done.cuts[0]!.listsIn, `${plan}: cut (lists in)`).toBe(model.inByCut.length);
  expect(done.run.result.lists.map((list) => list.list_no), `${plan}: cut (the lists in by it)`).toEqual(model.inByCut);
  expect(done.run.result.late.map((list) => list.list_no), `${plan}: late`).toEqual(model.late);
  expect(done.card, `${plan}: card`).not.toBeNull();
  expect(done.card!.at, `${plan}: card`).toBe(model.card);
  expect(done.card!.source, `${plan}: card (the first menu comes from the merge)`).toBe("AI");
  expect(done.run.at, `${plan}: the run returns`).toBe(model.returned);
  // The progress counts the AIs: every seat that ended, of the plan's seats.
  expect(done.progress, `${plan}: progress`).toEqual(Array.from({ length: model.landed }, (_unused, at) => `${String(at + 1)}/${String(seats.length)}`));
  // The merge was given the lists in by the cut, and its menu holds every viewpoint of them once.
  const given = done.run.result.lists.flatMap((list) => list.viewpoints.map((one) => one.viewpoint_id)).sort();
  expect([...done.card!.menu.viewpoints, ...done.card!.menu.repeats].map((one) => one.viewpoint_id).sort(), `${plan}: card (the merge's lists)`).toEqual(given);
  // Only the planner, the lists and the first merge are asked.
  expect(done.asked.map((one) => one.callSiteKey), `${plan}: calls`).toEqual([START_CALL_SITES.angles, ...seats.map((_unused, at) => `START:list:${String(at + 1)}`),
    START_CALL_SITES.merge]);
  expect([...new Set(done.asked.map((one) => one.step))].sort(), `${plan}: call steps`).toEqual(["ANGLES", "START_LIST", "START_MERGE"]);
}

const companiesOf = (seats: readonly MapSeat[], lists: readonly StartList[]): number => new Set(lists.map((list) => seats[list.list_no - 1]!.maker)).size;

describe("the timing model at the measured speeds (Task 87)", () => {
  for (const [plan, mapAIs] of PLANS) {
    it(`${plan}: the planner, ${String(mapAIs)} lists together, the cut and the card as the model says`, async () => {
      const { seats, haiku } = seatsOf(mapAIs);
      expect(seats, `${plan}: seats`).toHaveLength(mapAIs);
      expect(haiku, `${plan}: the merge's Haiku seat`).toMatchObject({ aiRef: HAIKU });
      const model = cardModel(SPEEDS.planner, seats.map((seat) => ({ maker: seat.maker, listMs: listMsOf(seat) })));
      const done = await runCard({ seats, haiku, plannerMs: SPEEDS.planner, listMs: listMsOf });
      expectModel(plan, seats, done, model);
      expect(done.run.result.marks, `${plan}: the planner's own angles`).toEqual([]);
      expect(companiesOf(seats, done.run.result.lists), `${plan}: companies in by the cut`).toBe(model.companies);
      console.log(`START-STEP TIMING ${plan}: card at ${String(done.card!.at / 1_000)} s from ${String(done.run.result.lists.length)} list(s) by `
        + `${String(model.companies)} compan(ies); ${String(done.run.result.late.length)} late`);
    });
  }

  it("a seat slower than the hard cap never lands: the stream ends at listsHardCapMs, without its list, its call or its progress", async () => {
    const { seats, haiku } = seatsOf(PLANS.find(([plan]) => plan === "Plus")![1]);
    const slow = seats.at(-1)!;
    // Asked at the planner time, it would end listsHardCapMs later: past the cap, which counts from Next.
    const listMs = (seat: MapSeat): number => seat.aiRef === slow.aiRef ? T.listsHardCapMs : listMsOf(seat);
    const model = cardModel(SPEEDS.planner, seats.map((seat) => ({ maker: seat.maker, listMs: listMs(seat) })));
    expect([model.landed, model.returned]).toEqual([seats.length - 1, T.listsHardCapMs]);
    const done = await runCard({ seats, haiku, plannerMs: SPEEDS.planner, listMs });
    expectModel("Plus, a slow seat", seats, done, model);
    const slowNo = seats.length;
    expect([...done.run.result.lists, ...done.run.result.late].map((list) => list.list_no)).not.toContain(slowNo);
    expect(done.run.result.calls.map((call) => call.callSiteKey)).not.toContain(`START:list:${String(slowNo)}`);
  });

  it("a planner past its deadline: the fixed angles, and the lists start at the deadline", async () => {
    for (const [plan, mapAIs] of PLANS) {
      const { seats, haiku } = seatsOf(mapAIs);
      const plannerMs = T.plannerDeadlineMs + 5_000;
      const model = cardModel(plannerMs, seats.map((seat) => ({ maker: seat.maker, listMs: listMsOf(seat) })));
      expect(model.start, `${plan}: the model starts the lists at the deadline`).toBe(T.plannerDeadlineMs);
      const done = await runCard({ seats, haiku, plannerMs, listMs: listMsOf });
      expectModel(`${plan}, a late planner`, seats, done, model);
      expect(done.run.result.angles, `${plan}: the fixed angles`).toEqual(MAP_FALLBACK_ANGLES);
      expect(done.run.result.marks, `${plan}: the fallback mark`).toEqual([{ mark: "MAP_ANGLES_FALLBACK", step: "ANGLES", detail: "no planner reply in time" }]);
      // The planner's call ended after the deadline: it ran on, and is not in the run's record.
      expect(done.run.result.calls.map((call) => call.step), `${plan}: no planner record`).not.toContain("ANGLES");
    }
  });
});
