import { lockedReplyLanguageExpectation, questionLanguageOf, replyLanguageExpectation } from "@debateai/kernel";
import { mapFinishChoice } from "./choose.js";
import { mapAssignItemIds, mapNextItemNumbers, type MapItemDraft } from "./items.js";
import { mapAddGapPoints, mapApplyMerge, mapCodeMerge, mapSingletonMap, type MapMergedMap } from "./keypoints.js";
import type { MapPromptContractSet } from "./prompts.js";
import type { MapAnglesReply, MapListReply } from "./replies.js";
import { mapPrimarySubtag } from "./text.js";
import {
  MAP_FALLBACK_ANGLES,
  mapDistinctMakers,
  mapDroppedAngles,
  mapListAssignments,
  mapOrderAngles,
  mapPickChooser,
  mapPickGapSeat,
  mapPickMerger,
  mapPickPlanner,
  mapReassignLists,
  type MapListAssignment
} from "./roles.js";
import {
  mapAnglesSpec,
  mapChooseSpec,
  mapLockedLanguage,
  mapGapSpec,
  mapListSpec,
  mapMergeSpec,
  mapSnowballSpec,
  type MapRaisedByCounts,
  type MapSpecContext,
  type MapStepSpec
} from "./specs.js";
import {
  MAP_LIMITS,
  type MapAngle,
  type MapArm,
  type MapCallRecord,
  type MapChoice,
  type MapItem,
  type MapItemOrigin,
  type MapKeyPoint,
  type MapLean,
  type MapMarkRecord,
  type MapMergedAnswer,
  type MapNote,
  type MapNoteRecord,
  type MapPointItem,
  type MapResult,
  type MapSeat,
  type MapStep
} from "./types.js";

/** One model call the map asks for. `order` is its plan position, given before it is sent. */
export type MapCallRequest<T> = Readonly<{
  step: MapStep;
  /**
   * The spec's call-site key (§3.4): MAP:angles, MAP:list:<i>, MAP:list:<i>:2 (a list reassigned to another seat),
   * MAP:merge, MAP:gap:<k>, MAP:choose.
   */
  callSiteKey: string;
  seat: MapSeat;
  order: number;
  /** BLIND, or the ids of what the AI is shown. */
  shown: "BLIND" | readonly string[];
  spec: MapStepSpec<T>;
}>;

/**
 * OK with the checked value; FAILED (after the caller's own repairs); BUSY (the AI sits out the rest of the map);
 * STOPPED (a money, attempt or lane stop: the map asks nothing more and the code's fallbacks finish it).
 */
export type MapCallOutcome<T> =
  | Readonly<{ kind: "OK"; value: T }>
  | Readonly<{ kind: "FAILED"; code: string }>
  | Readonly<{ kind: "BUSY"; code: string }>
  | Readonly<{ kind: "STOPPED"; code: string }>;

/** The spec's list key; a list handed to another seat (spec §1.2) is asked under its own key, so each key is one task. */
export function mapListCallSiteKey(listIndex: number, wave: 1 | 2): string {
  return wave === 1 ? `MAP:list:${String(listIndex)}` : `MAP:list:${String(listIndex)}:2`;
}

/** The code a thrown caller error carries (a typed domain code), else MAP_CALLER_THREW. Never the error's message. */
export function mapErrorCodeOf(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,95}$/u.test(code) ? code : "MAP_CALLER_THREW";
}

/**
 * The only way the map reaches a model. Phase 1: the practice tool's preview gateway. Phase 2: the runner's gateway
 * through its scheduler lane. The caller owns the frame, the repairs, the busy waits and the record of the call; the
 * orchestrator owns only the plan and the fallbacks.
 */
export interface MapCaller {
  call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>>;
}

export type MapRunInput = Readonly<{
  questionLine: string;
  languageName: string;
  languageTag: string;
  /** The map AIs in this question's rotation order (the first seat plans; arm A: the first seat lists first). */
  seats: readonly MapSeat[];
  caller: MapCaller;
  /** Fixes the opaque item ids (e.g. question id and arm). */
  seed: string;
  /** G: 1 (Free; arm B) or up to 2 (Premium; arm C). Arm A has none. */
  gapRoundsMax: number;
  /** P: the most answers chosen. Capped by the distinct makers still available at the choose (spec §5, ruling P7). */
  maxAnswers: number;
  /** K: points per answer when the code chooses. */
  pointsPerAnswer: number;
  contracts?: MapPromptContractSet;
  /**
   * True for an error that ends the run (claim lost, time limit): rethrown, never a fallback. Must be a pure predicate:
   * a throw inside it replaces the original error.
   */
  abandon?: (error: unknown) => boolean;
}>;

type MapListLike = Readonly<{
  points: readonly Readonly<{ claim: string; why_it_matters: string; leans: MapLean }>[];
  candidate_answers: readonly string[];
}>;

type MapListOutcome = Readonly<{ assignment: MapListAssignment; reply: MapListReply | null }>;
type MapArrivedList = Readonly<{ assignment: MapListAssignment; reply: MapListLike }>;

/** One arm's run: the seats sitting out, the call records, the marks and notes. Not exported: the arms are the API. */
class MapRun {
  readonly out = new Set<string>();
  readonly calls: MapCallRecord[] = [];
  readonly marks: MapMarkRecord[] = [];
  readonly notes: MapNoteRecord[] = [];
  readonly ctx: MapSpecContext;
  stoppedBy: string | null = null;
  /** What the angle planner named (a primary subtag), once its reply was accepted; null otherwise (operators only). */
  plannerLanguage: string | null = null;
  #next = 0;

  constructor(readonly input: MapRunInput, readonly arm: MapArm) {
    // Ruling R-5: the reply-language expectation is built once, from the question line, and every step's check reads it
    // (question-language spec 2026-10-13: the lock, never a re-guess). A tag or name with no lock ("und", a stored
    // fallback name) keeps today's expectation; it never crashes.
    const lock = mapLockedLanguage(input);
    this.ctx = Object.freeze({ questionLine: input.questionLine, languageName: input.languageName, languageTag: input.languageTag,
      replyLanguage: lock === null ? replyLanguageExpectation(input.questionLine) : lockedReplyLanguageExpectation(lock, input.questionLine),
      ...(input.contracts === undefined ? {} : { contracts: input.contracts }) });
  }

  /**
   * Asks one call. Its plan position is taken synchronously, before the caller is reached, so calls running at the
   * same time keep their plan order (spec §3.5). A throwing caller counts as FAILED with the error's typed code, unless
   * the caller's `abandon` claims it (rethrown); BUSY puts the seat out for good; STOPPED ends the map.
   */
  async mapAsk<T>(step: MapStep, callSiteKey: string, seat: MapSeat, shown: "BLIND" | readonly string[], spec: MapStepSpec<T>): Promise<T | null> {
    // A stop ends the map: nothing new is asked; what already arrived is kept, and the code's fallbacks finish it.
    if (this.stoppedBy !== null) return null;
    const order = this.#next;
    this.#next += 1;
    let outcome: MapCallOutcome<T>;
    try {
      outcome = await this.input.caller.call({ step, callSiteKey, seat, order, shown, spec });
    } catch (error) {
      if (this.input.abandon?.(error) === true) throw error;
      outcome = { kind: "FAILED", code: mapErrorCodeOf(error) };
    }
    this.calls.push(Object.freeze({ step, callSiteKey, aiRef: seat.aiRef, maker: seat.maker, order,
      shown: shown === "BLIND" ? "BLIND" : Object.freeze([...shown]), outcome: outcome.kind, code: outcome.kind === "OK" ? null : outcome.code }));
    if (outcome.kind === "BUSY") this.out.add(seat.aiRef);
    if (outcome.kind === "STOPPED" && this.stoppedBy === null) {
      this.stoppedBy = outcome.code;
      this.mapNote("MAP_STOPPED", step, outcome.code);
    }
    return outcome.kind === "OK" ? outcome.value : null;
  }

  mapNote(note: MapNote, step: MapStep, detail: string): void {
    this.notes.push(Object.freeze({ note, step, detail }));
  }

  mapMark(mark: MapMarkRecord["mark"], step: MapMarkRecord["step"], detail: string): void {
    this.marks.push(Object.freeze({ mark, step, detail }));
  }

  /**
   * The planner's question_language (question-language spec 2026-10-13, L7; ruling CR-3): kept as `plannerLanguage`
   * when it is an ISO 639-1 code (reduced to its primary subtag), else null. When it names another language than the
   * lock, ONE operator-only note with both codes (never text): measurement only, never a mark, never a switch.
   */
  mapPlannerLanguage(reply: MapAnglesReply): void {
    const subtag = reply.question_language === undefined ? null : mapPrimarySubtag(reply.question_language);
    const named = subtag !== null && questionLanguageOf(subtag) !== null ? subtag : null;
    this.plannerLanguage = named;
    const locked = mapPrimarySubtag(this.input.languageTag);
    if (named !== null && named !== locked && this.input.languageTag !== "und") {
      this.mapNote("LANGUAGE_PLANNER_DISAGREES", "ANGLES", `${locked}:${named}`);
    }
  }

  /** The seats not sitting out, in plan order. */
  get available(): readonly MapSeat[] {
    return this.input.seats.filter((seat) => !this.out.has(seat.aiRef));
  }

  mapResult(parts: Readonly<{ kind: "MAP" | "UNAVAILABLE"; angles: readonly MapAngle[]; items: readonly MapItem[];
    keyPoints: readonly MapKeyPoint[]; mergedAnswers: readonly MapMergedAnswer[]; framingChallenges: readonly string[]; choice: MapChoice | null }>): MapResult {
    return Object.freeze({
      arm: this.arm,
      ...parts,
      stoppedBy: this.stoppedBy,
      plannerLanguage: this.plannerLanguage,
      marks: Object.freeze([...this.marks]),
      notes: Object.freeze([...this.notes]),
      // Pushed as calls finish; returned in plan order, never finish order.
      calls: Object.freeze([...this.calls].sort((a, b) => a.order - b.order))
    });
  }

  mapUnavailable(angles: readonly MapAngle[], items: readonly MapItem[], detail: string): MapResult {
    this.mapMark("MAP_UNAVAILABLE_TODAYS_OPENING", "MAP", detail);
    return this.mapResult({ kind: "UNAVAILABLE", angles, items, keyPoints: [], mergedAnswers: [], framingChallenges: [], choice: null });
  }
}

function mapDraftsOfList(assignment: MapListAssignment, reply: MapListLike, origin: MapItemOrigin): readonly MapItemDraft[] {
  const base = { seat: assignment.seat, origin, angleId: assignment.angle?.angleId ?? null,
    angleKind: assignment.angle?.kind ?? null, listIndex: assignment.listIndex };
  return [
    ...reply.points.map((point, position): MapItemDraft => Object.freeze({ ...base, position, kind: "POINT" as const,
      claim: point.claim, whyItMatters: point.why_it_matters, leans: point.leans })),
    ...reply.candidate_answers.map((answer, position): MapItemDraft => Object.freeze({ ...base, position, kind: "ANSWER" as const, answer }))
  ];
}

/** The lists in parallel; every plan position is taken before the first await, and the results keep plan order. */
function mapRunLists(run: MapRun, assignments: readonly MapListAssignment[], wave: 1 | 2): Promise<readonly MapListOutcome[]> {
  return Promise.all(assignments.map(async (assignment): Promise<MapListOutcome> => Object.freeze({
    assignment,
    reply: await run.mapAsk("LIST", mapListCallSiteKey(assignment.listIndex, wave), assignment.seat, "BLIND", mapListSpec(run.ctx, assignment.angle))
  })));
}

const mapListLabel = (listIndex: number, angle: MapAngle | null): string => `${String(listIndex)}:${angle?.angleId ?? "open"}`;

const mapArrived = (entries: readonly MapListOutcome[]): readonly MapArrivedList[] =>
  entries.flatMap((entry) => (entry.reply === null ? [] : [Object.freeze({ assignment: entry.assignment, reply: entry.reply })]));

const mapShownIds = (merged: MapMergedMap): readonly string[] =>
  [...merged.keyPoints.map((keyPoint) => keyPoint.keyPointId), ...merged.mergedAnswers.map((answer) => answer.answerId)];

async function mapMergeGapChoose(run: MapRun, angles: readonly MapAngle[], items: readonly MapItem[],
  listWriters: ReadonlySet<string>, premerged: MapMergedMap | null, raisedByCounts: MapRaisedByCounts): Promise<MapResult> {
  const order = run.input.seats;
  let mergedBy: MapSeat | null = null;
  let merged: MapMergedMap;
  if (premerged !== null) {
    merged = premerged;
  } else {
    const merger = mapPickMerger(order, run.out);
    const reply = merger === null ? null
      : await run.mapAsk("MERGE", "MAP:merge", merger, items.map((item) => item.itemId).sort(), mapMergeSpec(run.ctx, items));
    if (reply === null) {
      merged = mapCodeMerge(items);
      run.mapMark("MAP_MERGE_FALLBACK", "MERGE", merger === null ? "no seat to merge" : "merge reply missing");
    } else {
      mergedBy = merger;
      const applied = mapApplyMerge(reply, items);
      merged = Object.freeze({ keyPoints: applied.keyPoints, mergedAnswers: applied.mergedAnswers });
      if (applied.omittedItemIds.length > 0) run.mapNote("MERGE_ITEMS_KEPT", "MERGE", applied.omittedItemIds.join(","));
    }
  }

  let allItems: readonly MapItem[] = items;
  const challenges: string[] = [];
  const rounds = run.arm === "A" ? 0 : run.input.gapRoundsMax;
  for (let round = 1; round <= rounds; round += 1) {
    const seat = mapPickGapSeat(order, run.out, mergedBy, listWriters, round);
    if (seat === null) {
      run.mapNote("GAP_SKIPPED", "GAP", `round ${String(round)}: no seat`);
      break;
    }
    const reply = await run.mapAsk("GAP", `MAP:gap:${String(round)}`, seat, mapShownIds(merged),
      mapGapSpec(run.ctx, merged.keyPoints, merged.mergedAnswers));
    if (reply === null) {
      // A failed round is skipped and is not read by the stop rule (as ruled 2026-10-12).
      run.mapNote("GAP_SKIPPED", "GAP", `round ${String(round)}`);
      continue;
    }
    const drafts = reply.new_points.map((point, position): MapItemDraft => Object.freeze({ kind: "POINT" as const, seat, origin: "GAP" as const,
      angleId: null, angleKind: null, listIndex: 100 + round, position, claim: point.claim, whyItMatters: point.why_it_matters, leans: point.leans }));
    // Numbering continues after EVERY item so far, points and candidate answers alike (no id is ever given twice).
    const gapItems = mapAssignItemIds(drafts, `${run.input.seed}|gap|${String(round)}`, mapNextItemNumbers(allItems))
      .filter((item): item is MapPointItem => item.kind === "POINT");
    allItems = Object.freeze([...allItems, ...gapItems]);
    const added = mapAddGapPoints(merged, allItems, gapItems);
    merged = added.map;
    challenges.push(...reply.framing_challenges);
    if (added.newKeyPoints < MAP_LIMITS.gapRoundNewPointsToContinue) {
      run.mapNote("GAP_STOPPED", "GAP", `round ${String(round)}: ${String(added.newKeyPoints)} new`);
      break;
    }
  }

  // With no merger (arm A, or a failed merge) roles.ts anchors on the would-be merger, which then comes last among equal ranks.
  const chooser = mapPickChooser(order, run.out, mergedBy);
  const reply = chooser === null ? null
    : await run.mapAsk("CHOOSE", "MAP:choose", chooser, mapShownIds(merged), mapChooseSpec(run.ctx, merged.keyPoints, merged.mergedAnswers, { raisedByCounts }));
  // Plan sizes are capped by the makers present (spec §5, ruling P7): no more answers than distinct makers still
  // available, never capped below the two distinct answers the map always gives.
  const makersPresent = Math.max(MAP_LIMITS.chooseDistinctAnswersMin, mapDistinctMakers(run.available));
  const finished = mapFinishChoice({ reply, keyPoints: merged.keyPoints, mergedAnswers: merged.mergedAnswers, items: allItems,
    languageTag: run.input.languageTag, maxAnswers: Math.min(run.input.maxAnswers, makersPresent), pointsPerAnswer: run.input.pointsPerAnswer });
  run.marks.push(...finished.marks);
  return run.mapResult({ kind: "MAP", angles, items: allItems, keyPoints: merged.keyPoints, mergedAnswers: merged.mergedAnswers,
    framingChallenges: Object.freeze(challenges), choice: finished.choice });
}

async function mapAfterLists(run: MapRun, angles: readonly MapAngle[], lists: readonly MapArrivedList[]): Promise<MapResult> {
  const items = mapAssignItemIds(lists.flatMap((entry) => mapDraftsOfList(entry.assignment, entry.reply, "BLIND")), run.input.seed);
  if (lists.length < 2) return run.mapUnavailable(angles, items, `${String(lists.length)} list(s) arrived`);
  return mapMergeGapChoose(run, angles, items, new Set(lists.map((entry) => entry.assignment.seat.aiRef)), null, "BLIND");
}

/** The map needs two makers (spec §3.3); with fewer, today's opening, and no call is made. */
const mapTooFewMakers = (input: MapRunInput): boolean => mapDistinctMakers(input.seats) < MAP_LIMITS.chooseDistinctAnswersMin;

/** Arm C, the angle map (spec §1, ruling S1): angle planner, blind angle lists in parallel, merge, gap rounds, choose. */
export async function mapRunAngleMap(input: MapRunInput): Promise<MapResult> {
  const run = new MapRun(input, "C");
  if (mapTooFewMakers(input)) return run.mapUnavailable([], [], "fewer than two makers");
  const order = input.seats;
  const planner = mapPickPlanner(order, run.out);
  const planned = planner === null ? null : await run.mapAsk("ANGLES", "MAP:angles", planner, "BLIND", mapAnglesSpec(run.ctx));
  let angles: readonly MapAngle[];
  if (planned === null) {
    angles = MAP_FALLBACK_ANGLES;
    run.mapMark("MAP_ANGLES_FALLBACK", "ANGLES", planner === null ? "no seat to plan" : "angles reply missing");
  } else {
    run.mapPlannerLanguage(planned);
    angles = mapOrderAngles(planned);
  }
  const first = await mapRunLists(run, mapListAssignments(angles, order, run.out), 1);
  const failed = first.filter((entry) => entry.reply === null).map((entry) => entry.assignment);
  const finished = first.filter((entry) => entry.reply !== null).map((entry) => entry.assignment.seat);
  // A stop reassigns nothing: the lists already paid for are kept and the rest are dropped.
  const reassigned = run.stoppedBy === null ? mapReassignLists(failed, finished, run.out) : [];
  for (const assignment of reassigned) run.mapNote("LIST_REASSIGNED", "LIST", mapListLabel(assignment.listIndex, assignment.angle));
  const second = await mapRunLists(run, reassigned, 2);
  const lists = [...mapArrived(first), ...mapArrived(second)];
  // One LIST_DROPPED per angle left with no list (ruling P8): past min(angles, seats), or failed with no seat to take it.
  for (const angle of mapDroppedAngles(angles, lists.map((entry) => entry.assignment))) {
    run.mapNote("LIST_DROPPED", "LIST", mapListLabel(angles.indexOf(angle), angle));
  }
  return mapAfterLists(run, angles, lists);
}

/** Arm B (Phase 1 comparison only): every AI lists with no angle, blind; then merge, the gap rounds, choose. */
export async function mapRunBlindLists(input: MapRunInput): Promise<MapResult> {
  const run = new MapRun(input, "B");
  if (mapTooFewMakers(input)) return run.mapUnavailable([], [], "fewer than two makers");
  const assignments = run.available.map((seat, index): MapListAssignment => Object.freeze({ listIndex: index, seat, angle: null }));
  const done = await mapRunLists(run, assignments, 1);
  // An open list has no angle to hand on: a failed one is dropped.
  for (const entry of done) if (entry.reply === null) run.mapNote("LIST_DROPPED", "LIST", mapListLabel(entry.assignment.listIndex, null));
  return mapAfterLists(run, [], mapArrived(done));
}

/**
 * Arm A (Phase 1 comparison only): AI 1 lists points blind; each next AI sees the points so far and adds only new
 * ones; then the same choose step (as ruled 2026-10-12, so every map arm ends in chosen answers). No merge, no gap.
 */
export async function mapRunSnowball(input: MapRunInput): Promise<MapResult> {
  const run = new MapRun(input, "A");
  if (mapTooFewMakers(input)) return run.mapUnavailable([], [], "fewer than two makers");
  let items: readonly MapItem[] = [];
  const writers = new Set<string>();
  for (const [index, seat] of input.seats.entries()) {
    if (run.out.has(seat.aiRef)) continue;
    const assignment: MapListAssignment = Object.freeze({ listIndex: index, seat, angle: null });
    const pointsSoFar = items.filter((item): item is MapPointItem => item.kind === "POINT");
    const firstList = writers.size === 0;
    const reply: MapListLike | null = firstList
      ? await run.mapAsk("LIST", `MAP:list:${String(index)}`, seat, "BLIND", mapListSpec(run.ctx, null))
      : await run.mapAsk("SNOWBALL", `MAP:list:${String(index)}`, seat, pointsSoFar.map((point) => point.itemId).sort(),
        mapSnowballSpec(run.ctx, pointsSoFar));
    if (reply === null) {
      run.mapNote("LIST_DROPPED", "LIST", mapListLabel(index, null));
      continue;
    }
    writers.add(seat.aiRef);
    // Numbering continues after every item so far, points and candidate answers alike.
    items = Object.freeze([...items, ...mapAssignItemIds(mapDraftsOfList(assignment, reply, firstList ? "BLIND" : "SHOWN"),
      `${input.seed}|snowball|${String(index)}`, mapNextItemNumbers(items))]);
  }
  if (writers.size < 2) return run.mapUnavailable([], items, `${String(writers.size)} list(s) arrived`);
  // Arm A's later points are shown-origin by design: the choose counts every maker (F-I2), so each reads 1, not 0.
  return mapMergeGapChoose(run, [], items, writers, mapSingletonMap(items), "ALL");
}
