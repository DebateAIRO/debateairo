import {
  LENGTH_GUIDANCE_START, START_STEP_LIMITS, TypedDomainError, detectArgumentLanguage, lockedReplyLanguageExpectation, replyLanguageExpectation,
  type ReadingLevel
} from "@debateai/kernel";
import type { StartList, StartMenu } from "@debateai/contract";
import type { MapLength } from "./length.js";
import { mapErrorCodeOf, type MapCallOutcome, type MapCaller } from "./orchestrator.js";
import { MAP_FALLBACK_ANGLES, mapOrderAngles } from "./roles.js";
import { mapAnglesSpec, mapLockedLanguage, type MapSpecContext, type MapStepSpec } from "./specs.js";
import { startCodeMenu, startLateMenu, startMenuFromMerge } from "./start-menu.js";
import {
  startCombineSpec, startCutAtWordEdge, startFitSpec, startListSpec, startMergeLateSpec, startMergeSpec, type StartListReply, type StartSpecContext
} from "./start-replies.js";
import type { MapAngle, MapCallRecord, MapMarkRecord, MapNoteRecord, MapSeat, MapStep } from "./types.js";

/**
 * The step before Start (V4 start step, spec 2026-11-03 §4.1): the angle planner, the angles dealt to the list writers, and the lists run.
 *
 * Plain words: at Next one AI plans the angles (the debate map's own planner, map.angles.v2, with a 15 s limit and the fixed angles as
 * fallback); then every list writer starts at the same moment, each from the angles it is dealt. What is in by about the cut time is shown;
 * a list that arrives later is marked late, for a small second merge. There is no second wave: a list that fails is dropped. Leaving the
 * page (an aborted signal) returns at once and asks nothing more; the calls already asked run on to their end and count in the allowance
 * (Calls item 8, from the 31 Oct rule that calls made before Start count even when Start is never pressed).
 */
const L = START_STEP_LIMITS;

/** Start values; changed only after the Mac measurement (Task 91). */
export const START_STEP_TIMING = Object.freeze({ plannerDeadlineMs: 15_000, cutAtMs: 30_000, listsHardCapMs: 150_000, mergeDeadlineMs: 45_000,
  lateMergeDeadlineMs: 30_000, combineDeadlineMs: 15_000, fitDeadlineMs: 10_000, heartbeatMs: 10_000, streamMaxLifeMs: 210_000,
  serverCacheTtlMs: 600_000, signedLifetimeMs: 7_200_000 });
export type StartStepTiming = typeof START_STEP_TIMING;

/** The merge, the late merge, the combine and the fit run on Haiku, fixed in code, as the clarifying call does (spec §9). */
export const START_STEP_HAIKU_MODEL = "claude-haiku-5-5";
/** A company's second list seat (more seats than companies): its provider ref with this suffix. */
export const START_SEAT_REUSE_SUFFIX = "#2";
export const START_CALL_SITE_PREFIX = "START:";
export const START_CALL_SITES = Object.freeze({ angles: "START:angles", merge: "START:merge", mergeLate: "START:merge-late", combine: "START:combine",
  fit: "START:fit" });
/** List `listNo`'s call (1..9). */
export function startListCallSiteKey(listNo: number): string {
  return `${START_CALL_SITE_PREFIX}list:${String(listNo)}`;
}

/** The angle planner's lengths: the length row's start values (it runs before any receipt). */
export const START_PLANNER_LENGTH: MapLength = Object.freeze({ targets: LENGTH_GUIDANCE_START.map, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord });

export type StartListAssignment = Readonly<{ listNo: number; seat: MapSeat; angles: readonly MapAngle[] }>;

/**
 * The angles dealt to the list writers, one list per seat, numbered 1.. in seat order. As many seats as angles or more: seat i takes the
 * first angle, cycling from i mod A, its company does not already hold (so every angle is covered, and a company's second seat looks from
 * another angle). Fewer seats: angle j goes to list j mod S, at most four to a list; the rest are dropped.
 */
export function startDealAngles(angles: readonly MapAngle[], seats: readonly MapSeat[]): Readonly<{ lists: readonly StartListAssignment[];
  dropped: readonly MapAngle[] }> {
  if (seats.length > L.listsMax) throw new TypedDomainError("START_SEATS_INVALID", "START_SEATS_INVALID: at most nine list writers");
  if (angles.length === 0 || seats.length === 0) return Object.freeze({ lists: Object.freeze([]), dropped: Object.freeze([...angles]) });
  const assignment = (listNo: number, seat: MapSeat, dealt: readonly MapAngle[]): StartListAssignment =>
    Object.freeze({ listNo, seat, angles: Object.freeze([...dealt]) });
  if (seats.length >= angles.length) {
    const held = new Map<string, Set<string>>();
    return Object.freeze({ dropped: Object.freeze([]), lists: Object.freeze(seats.map((seat, at) => {
      const mine = held.get(seat.maker) ?? new Set<string>();
      held.set(seat.maker, mine);
      const cycle = angles.map((_unused, k) => angles[(at + k) % angles.length]!);
      const pick = cycle.find((angle) => !mine.has(angle.angleId)) ?? cycle[0]!;
      mine.add(pick.angleId);
      return assignment(at + 1, seat, [pick]);
    })) });
  }
  const dealt: MapAngle[][] = seats.map(() => []);
  const dropped: MapAngle[] = [];
  angles.forEach((angle, at) => {
    const list = dealt[at % seats.length]!;
    if (list.length < L.anglesPerListMax) list.push(angle);
    else dropped.push(angle);
  });
  return Object.freeze({ lists: Object.freeze(seats.map((seat, at) => assignment(at + 1, seat, dealt[at]!))), dropped: Object.freeze(dropped) });
}

/** The clock the step waits by (fake in tests). `sleep` resolves after `ms`, or at once when `signal` aborts; it never rejects. */
export type StartClock = Readonly<{ now(): number; sleep(ms: number, signal: AbortSignal): Promise<void> }>;
const START_SYSTEM_CLOCK: StartClock = Object.freeze({
  now: () => Date.now(),
  sleep: (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const done = (): void => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, Math.max(0, ms));
    signal.addEventListener("abort", done, { once: true });
  })
});

/** A controller that also aborts when `signal` does: its own abort ends the step's waits without touching the caller's signal. */
function startLinked(signal: AbortSignal): AbortController {
  const linked = new AbortController();
  if (signal.aborted) linked.abort();
  else signal.addEventListener("abort", () => { linked.abort(); }, { once: true });
  return linked;
}

/** The angles a lists run uses, where they came from, and the planner's call when it ended in time. */
export type StartPlanned = Readonly<{ angles: readonly MapAngle[]; fallback: boolean; calls: readonly MapCallRecord[] }>;

/** A start-step call's context: the question's language lock and the reply expectation built from it once, and the person's level. */
function startContextOf(run: Readonly<{ questionLine: string; languageName: string; languageTag: string; readingLevel: ReadingLevel | null }>):
  StartSpecContext {
  const lock = mapLockedLanguage(run);
  return Object.freeze({ questionLine: run.questionLine, languageName: run.languageName, languageTag: run.languageTag,
    replyLanguage: lock === null ? replyLanguageExpectation(run.questionLine) : lockedReplyLanguageExpectation(lock, run.questionLine),
    readingLevel: run.readingLevel });
}

/** One call's record, in the map's shape. */
const startCallRecord = (step: MapStep, callSiteKey: string, seat: MapSeat, order: number, outcome: MapCallOutcome<unknown>): MapCallRecord =>
  Object.freeze({ step, callSiteKey, aiRef: seat.aiRef, maker: seat.maker, order, shown: "BLIND" as const, outcome: outcome.kind,
    code: outcome.kind === "OK" ? null : outcome.code });

/** One call through the caller; a throw is FAILED with its typed code (never its message). */
async function startAsk<T>(caller: MapCaller, step: MapStep, callSiteKey: string, seat: MapSeat, order: number, spec: MapStepSpec<T>):
  Promise<MapCallOutcome<T>> {
  try {
    return await caller.call({ step, callSiteKey, seat, order, shown: "BLIND", spec });
  } catch (error) {
    return { kind: "FAILED", code: mapErrorCodeOf(error) };
  }
}

/**
 * The angle planner: the debate map's map.angles.v2, byte for byte (engine 2, the start lengths, no language lock: it runs at Next, before
 * the language is settled, under today's directive in the language the kernel reads the question in), raced with `plannerDeadlineMs`.
 * No seat, a failed call or the deadline: the fixed angles (MAP_FALLBACK_ANGLES). A call past the deadline is not stopped: it runs on and
 * is charged by the caller, and its record is not in `calls`.
 */
export async function mapPlanStartAngles(run: Readonly<{ questionLine: string; planner: MapSeat | null; caller: MapCaller; clock?: StartClock;
  signal: AbortSignal }>): Promise<StartPlanned> {
  const fallback: StartPlanned = Object.freeze({ angles: MAP_FALLBACK_ANGLES, fallback: true, calls: Object.freeze([]) });
  if (run.planner === null) return fallback;
  const clock = run.clock ?? START_SYSTEM_CLOCK;
  const planner = run.planner;
  const ctx: MapSpecContext = Object.freeze({ questionLine: run.questionLine, languageName: detectArgumentLanguage(run.questionLine).nameEn,
    languageTag: "und", replyLanguage: replyLanguageExpectation(run.questionLine), length: START_PLANNER_LENGTH, engine: true as const });
  const asked = startAsk(run.caller, "ANGLES", START_CALL_SITES.angles, planner, 0, mapAnglesSpec(ctx));
  const waits = startLinked(run.signal);
  const ended = await Promise.race([asked.then((outcome) => ({ outcome })), clock.sleep(START_STEP_TIMING.plannerDeadlineMs, waits.signal).then(() => null)]);
  waits.abort();
  if (ended === null) return fallback;
  const calls = Object.freeze([startCallRecord("ANGLES", START_CALL_SITES.angles, planner, 0, ended.outcome)]);
  return ended.outcome.kind === "OK"
    ? Object.freeze({ angles: mapOrderAngles(ended.outcome.value), fallback: false, calls })
    : Object.freeze({ angles: MAP_FALLBACK_ANGLES, fallback: true, calls });
}

/** A list writer's reply as the step's list: viewpoint ids pt<list><item>, the list's angles with their labels cut at a word edge. */
function startListOf(assignment: StartListAssignment, reply: StartListReply): StartList {
  return Object.freeze({
    list_no: assignment.listNo,
    angles: assignment.angles.map((angle) => Object.freeze({ angle_id: angle.angleId, kind: angle.kind,
      label: startCutAtWordEdge(angle.label.trim(), L.angleLabelMaxChars) })),
    viewpoints: reply.paths.map((path, at) => Object.freeze({ viewpoint_id: `pt${String(assignment.listNo)}${String(at + 1)}`, title: path.title,
      question: path.question, why: path.why, angle_id: path.angle_id }))
  });
}

export type StartListsResult = Readonly<{
  angles: readonly MapAngle[];
  /** The lists in by the cut (WAIT_ALL: every list), in list order. */
  lists: readonly StartList[];
  /** The lists that arrived after the cut (STREAM only), in list order. */
  late: readonly StartList[];
  /** Every call that ended by the return, in plan order (the planner 0, list n at n). */
  calls: readonly MapCallRecord[];
  notes: readonly MapNoteRecord[];
  marks: readonly MapMarkRecord[];
}>;

/**
 * The lists run. The angles are planned here (or come from `planned`, started at Next); then every list starts at once. STREAM: the cut
 * comes when every seat has ended, or at `cutAtMs` once one list is in, else with the first list after it (or at the return when none
 * comes); a list after the cut is late. WAIT_ALL: no list is late, and the cut comes once, at the end. The run returns when every seat has
 * ended or at `listsHardCapMs`, both counted from this call. An aborted signal returns at once with what is in, and nothing more is asked
 * or told (`onSeatDone`, `onList`, `onCut`); it is never passed to the calls already asked.
 */
export async function mapRunStartLists(run: Readonly<{ questionLine: string; languageName: string; languageTag: string; readingLevel: ReadingLevel | null;
  seats: readonly MapSeat[]; planner: MapSeat; caller: MapCaller; clock?: StartClock; signal: AbortSignal; cut: "STREAM" | "WAIT_ALL";
  planned?: Promise<StartPlanned>; onSeatDone(answered: number, of: number): void; onList(list: StartList, late: boolean): void;
  onCut(listsIn: number): void }>): Promise<StartListsResult> {
  const clock = run.clock ?? START_SYSTEM_CLOCK;
  const startedAt = clock.now();
  // Ended at the return: the run's own timers stop, and a call that ends later is no longer recorded here.
  const waits = startLinked(run.signal);
  const aborted = new Promise<"ABORTED">((resolve) => {
    if (run.signal.aborted) resolve("ABORTED");
    else run.signal.addEventListener("abort", () => { resolve("ABORTED"); }, { once: true });
  });
  const calls: MapCallRecord[] = [];
  const notes: MapNoteRecord[] = [];
  const marks: MapMarkRecord[] = [];
  const lists: StartList[] = [];
  const late: StartList[] = [];
  let angles: readonly MapAngle[] = [];
  const result = (): StartListsResult => {
    waits.abort();
    const byNo = (a: StartList, b: StartList) => a.list_no - b.list_no;
    return Object.freeze({ angles, lists: Object.freeze([...lists].sort(byNo)), late: Object.freeze([...late].sort(byNo)),
      calls: Object.freeze([...calls].sort((a, b) => a.order - b.order)), notes: Object.freeze([...notes]), marks: Object.freeze([...marks]) });
  };
  if (run.signal.aborted) return result();

  const planning = run.planned ?? mapPlanStartAngles({ questionLine: run.questionLine, planner: run.planner, caller: run.caller, clock, signal: run.signal });
  const planned = await Promise.race([planning, aborted]);
  if (planned === "ABORTED" || run.signal.aborted) return result();
  angles = planned.angles;
  calls.push(...planned.calls);
  if (planned.fallback) {
    marks.push(Object.freeze({ mark: "MAP_ANGLES_FALLBACK" as const, step: "ANGLES" as const,
      detail: planned.calls.length === 0 ? "no planner reply in time" : "angles reply missing" }));
  }

  const ctx = startContextOf(run);
  const deal = startDealAngles(angles, run.seats);
  for (const angle of deal.dropped) notes.push(Object.freeze({ note: "LIST_DROPPED" as const, step: "START_LIST" as const, detail: `angle:${angle.angleId}` }));

  type Ended = Readonly<{ assignment: StartListAssignment; list: StartList | null }>;
  const ended: Ended[] = [];
  let wake: (() => void) | null = null;
  // Every list starts now, together; each call's record is kept when it ends, whether or not the run still waits for it.
  for (const assignment of deal.lists) {
    const callSiteKey = startListCallSiteKey(assignment.listNo);
    void startAsk(run.caller, "START_LIST", callSiteKey, assignment.seat, assignment.listNo, startListSpec(ctx, assignment.angles, assignment.listNo))
      .then((outcome) => {
        if (waits.signal.aborted) return;
        calls.push(startCallRecord("START_LIST", callSiteKey, assignment.seat, assignment.listNo, outcome));
        ended.push(Object.freeze({ assignment, list: outcome.kind === "OK" ? startListOf(assignment, outcome.value) : null }));
        const woken = wake;
        wake = null;
        woken?.();
      });
  }

  const of = deal.lists.length;
  const sinceStart = (ms: number): number => Math.max(0, startedAt + ms - clock.now());
  const capped = clock.sleep(sinceStart(START_STEP_TIMING.listsHardCapMs), waits.signal).then(() => "CAP" as const);
  let cutTime: Promise<"CUT_TIME"> | null = run.cut === "STREAM"
    ? clock.sleep(sinceStart(START_STEP_TIMING.cutAtMs), waits.signal).then(() => "CUT_TIME" as const) : null;
  let cutTimePassed = false;
  let cut = false;
  const cutNow = (): void => {
    if (cut) return;
    cut = true;
    run.onCut(lists.length);
  };
  let seen = 0;
  while (seen < of) {
    if (seen < ended.length) {
      const one = ended[seen]!;
      seen += 1;
      run.onSeatDone(seen, of);
      if (one.list === null) {
        notes.push(Object.freeze({ note: "LIST_DROPPED" as const, step: "START_LIST" as const, detail: `list:${String(one.assignment.listNo)}` }));
      } else if (run.cut === "STREAM" && cut) {
        late.push(one.list);
        run.onList(one.list, true);
      } else {
        lists.push(one.list);
        run.onList(one.list, false);
        if (run.cut === "STREAM" && cutTimePassed) cutNow();
      }
      continue;
    }
    const next = new Promise<"ENDED">((resolve) => { wake = () => { resolve("ENDED"); }; });
    const event = await Promise.race([next, capped, aborted, ...(cutTime === null ? [] : [cutTime])]);
    if (event === "ABORTED" || run.signal.aborted) return result();
    if (event === "CAP") break;
    if (event === "CUT_TIME") {
      cutTime = null;
      cutTimePassed = true;
      if (lists.length > 0) cutNow();
    }
  }
  cutNow();
  return result();
}

/** One call raced with the signal: null when the signal aborts first (the call runs on, and is charged by the caller); none when it is aborted. */
async function startAskUnlessAborted<T>(signal: AbortSignal, ask: () => Promise<MapCallOutcome<T>>): Promise<MapCallOutcome<T> | null> {
  if (signal.aborted) return null;
  // The listener goes when the call is over, whichever came first.
  const over = new AbortController();
  const aborted = new Promise<null>((resolve) => { signal.addEventListener("abort", () => { resolve(null); }, { once: true, signal: over.signal }); });
  try {
    return await Promise.race([ask(), aborted]);
  } finally {
    over.abort();
  }
}

/**
 * The menu from the lists (spec §4.1). Without a menu so far: the first merge, on Haiku, over every list in by the cut (one list too: it
 * still marks repeats, puts clear overlaps together, orders, and picks the cards and the suggestions), with what the asker said
 * (`clarifyLines`). With one (`prior`): the late merge of the lists that came after it. Code makes the menu only with no Haiku seat, a failed
 * merge or an aborted signal: the first list's code menu (the other lists are left for the page's next late merge), or the menu so far,
 * unchanged. A menu at its ninth revision takes no late merge. The menu is built, never parsed, here: the API and the runner check it.
 */
export async function mapMergeStartLists(run: Readonly<{ questionLine: string; languageName: string; languageTag: string; readingLevel: ReadingLevel | null;
  clarifyLines: readonly string[]; lists: readonly StartList[]; prior: StartMenu | null; seat: MapSeat | null; caller: MapCaller; menuId: string;
  signal: AbortSignal }>): Promise<Readonly<{ menu: StartMenu; source: "AI" | "CODE"; calls: readonly MapCallRecord[] }>> {
  const language = Object.freeze({ code: run.languageTag, name: run.languageName });
  const ctx = startContextOf(run);
  const seat = run.seat;
  const prior = run.prior;
  const viewpoints = run.lists.flatMap((list) => list.viewpoints);
  if (prior === null) {
    const first = run.lists[0];
    if (first === undefined) throw new TypedDomainError("START_MERGE_INVALID", "START_MERGE_INVALID: a first merge is given one list or more");
    const code = Object.freeze({ menu: startCodeMenu(first, { menuId: run.menuId, language }), source: "CODE" as const, calls: Object.freeze([]) });
    if (seat === null) return code;
    const spec = startMergeSpec(ctx, { said: run.clarifyLines, viewpoints });
    const outcome = await startAskUnlessAborted(run.signal, () => startAsk(run.caller, "START_MERGE", START_CALL_SITES.merge, seat, 0, spec));
    if (outcome === null) return code;
    const calls = Object.freeze([startCallRecord("START_MERGE", START_CALL_SITES.merge, seat, 0, outcome)]);
    return outcome.kind === "OK"
      ? Object.freeze({ menu: startMenuFromMerge(outcome.value, run.lists, { menuId: run.menuId, language }), source: "AI" as const, calls })
      : Object.freeze({ ...code, calls });
  }
  const unchanged = Object.freeze({ menu: prior, source: "CODE" as const, calls: Object.freeze([]) });
  if (seat === null || run.lists.length === 0 || prior.revision >= L.menuRevisionsMax) return unchanged;
  const spec = startMergeLateSpec(ctx, { said: run.clarifyLines, prior, viewpoints });
  const outcome = await startAskUnlessAborted(run.signal, () => startAsk(run.caller, "START_MERGE", START_CALL_SITES.mergeLate, seat, 0, spec));
  if (outcome === null) return unchanged;
  const calls = Object.freeze([startCallRecord("START_MERGE", START_CALL_SITES.mergeLate, seat, 0, outcome)]);
  return outcome.kind === "OK" ? Object.freeze({ menu: startLateMenu(prior, outcome.value, run.lists), source: "AI" as const, calls })
    : Object.freeze({ ...unchanged, calls });
}

/**
 * The combined question for points the person put together (spec §6 item 3), on Haiku: a title and a question that never restate the main
 * question (its reader refuses one that does, for the gateway's one re-ask). No seat, or no usable reply: null.
 */
export async function mapCombineStart(run: Readonly<{ mainQuestion: string; languageName: string; languageTag: string; readingLevel: ReadingLevel | null;
  members: readonly Readonly<{ title: string | null; question: string }>[]; seat: MapSeat | null; caller: MapCaller }>):
  Promise<Readonly<{ title: string; question: string }> | null> {
  if (run.seat === null) return null;
  const spec = startCombineSpec(startContextOf({ ...run, questionLine: run.mainQuestion }), run.members);
  const outcome = await startAsk(run.caller, "START_COMBINE", START_CALL_SITES.combine, run.seat, 0, spec);
  return outcome.kind === "OK" ? Object.freeze({ title: outcome.value.title, question: outcome.value.question }) : null;
}

/**
 * Where the person's own point of view fits (spec §6 item 4), on Haiku: the key of the one chosen path it fits inside, or null for none.
 * No seat, or no usable reply (a key it was not given is refused): null.
 */
export async function mapFitOwnPath(run: Readonly<{ questionLine: string; languageName: string; languageTag: string; ownText: string;
  paths: readonly Readonly<{ key: string; title: string; question: string }>[]; seat: MapSeat | null; caller: MapCaller }>):
  Promise<Readonly<{ fitsKey: string | null }> | null> {
  if (run.seat === null) return null;
  const spec = startFitSpec(startContextOf({ ...run, readingLevel: null }), { ownText: run.ownText, paths: run.paths });
  const outcome = await startAsk(run.caller, "START_FIT", START_CALL_SITES.fit, run.seat, 0, spec);
  return outcome.kind === "OK" ? Object.freeze({ fitsKey: outcome.value.fits }) : null;
}
