import { projectedCallCeilingMicros, type ProviderTargetPrice } from "@debateai/budget";
import { rootPositionRequestBytesBound } from "@debateai/judgement";
import { exhaustive } from "@debateai/kernel";
import {
  MAP_LIMITS, mapErrorCodeOf, mapProviderPieces, mapRunAngleMap, mapRunBlindLists, mapRunSnowball,
  type MapCallOutcome, type MapCallRequest, type MapCaller, type MapChoiceRepository, type MapResult, type MapRunInput, type MapSeat,
  type MapStep
} from "@debateai/map";
import type { CallBound, ProviderGateway } from "@debateai/providers";
import type { DebateShapeOpening } from "@debateai/register";
import type { ConditionMarkRecord } from "@debateai/serve";
import type { EnvelopeStopKind } from "./index.js";
import { shapeSeatOrder } from "./shape-seats.js";

/**
 * Debate shape (spec 2026-10-12 §3.3 step 1, §3.5) — THE MAP IN THE RUNNER. Each map call goes through the member's
 * own gateway stack (lane, sit-out book, keep-alive, counting gateway), so it waits for a slot, writes its MODEL_CALL
 * and spend rows under its MAP: key, and its repairs (patch, full re-ask) are attempts inside that key's allowance.
 * It never goes through the cooldown hold (no progress records for MAP: keys). A stop (money, attempts, lane) is
 * STOPPED: the orchestrator asks nothing more and finishes with its code fallbacks; a keep-alive refusal is rethrown.
 */
export type MapStageMember = Readonly<{ provider: ProviderGateway; providerRef: string }>;
export type MapStageDeps = Readonly<{
  runId: string; subjectItemId: string; mapContractHash: string; judgeBound: CallBound;
  longBounds: Readonly<{ merge: number; choose: number }>;
  memberOf: (aiRef: string) => MapStageMember | null;
  sitsOut: (aiRef: string) => boolean;
  satOutBy: (error: unknown) => boolean;
  spendStopOf: (error: unknown) => EnvelopeStopKind | null;
  laneStopped: (error: unknown) => boolean;
  abandon: (error: unknown) => boolean;
  serial: boolean;
  /**
   * Controller ruling T12-R0: root 0's worst-case call (`rootZeroKeepRoomMicros`), named on every map call so the money
   * seam refuses a map call that would leave too little for it. Absent or 0: no room is named.
   */
  keepRoomMicros?: number;
  /**
   * Ruling T12-R1: the seam's ROOM-ONLY refusal (RUN_COST_ENVELOPE_ROOM_KEPT: the call would have fitted without the
   * room). It stops the map — STOPPED, nothing more sent — but is never a spend stop: `spendStop()` stays as it was,
   * so the arguing is not stopped. Absent: no such refusal is told apart.
   */
  roomKept?: (error: unknown) => boolean;
}>;
/**
 * `settled()` (Task 1 note): resolves once every call this caller SENT has finished, whatever its outcome. When an
 * abandon (claim lost, time limit) is rethrown during the parallel list round, the other list calls are still running;
 * the runner stops the lane and awaits this before it rethrows, so their receipts land before the run is abandoned and
 * nothing of the map is left running after it.
 */
export type RunnerMapCaller = MapCaller & Readonly<{
  spendStop: () => EnvelopeStopKind | null;
  stopped: () => boolean;
  settled: () => Promise<void>;
}>;

/** Ruling R-2: merge and choose are long structured lists with thinking inside the room — the sealed map bounds; the rest the judge bound. */
export function mapStageBound(bound: CallBound, step: MapStep, longBounds: Readonly<{ merge: number; choose: number }>): CallBound {
  const ceiling = step === "MERGE" ? longBounds.merge : step === "CHOOSE" ? longBounds.choose : null;
  return ceiling === null || ceiling <= bound.tokenCeiling ? bound : Object.freeze({ ...bound, tokenCeiling: ceiling });
}

const MAKER_SAT_OUT = "MAKER_SAT_OUT";

export function createRunnerMapCaller(deps: MapStageDeps): RunnerMapCaller {
  const keepRoom = deps.keepRoomMicros !== undefined && deps.keepRoomMicros > 0 ? { keepRoomMicros: deps.keepRoomMicros } : {};
  let spendStop: EnvelopeStopKind | null = null;
  let stopped = false;
  /** The first abandon this caller met (boxed: the error itself may be any value). Once set, nothing more is sent. */
  let abandoned: { readonly error: unknown } | null = null;
  const inFlight = new Set<Promise<unknown>>();
  let tail: Promise<unknown> = Promise.resolve();
  /** Sends one call — unless an abandon was already seen: then the same refusal, and nothing is sent. */
  const sendNow = <T>(send: () => Promise<T>): Promise<T> => {
    if (abandoned !== null) return Promise.reject(abandoned.error);
    const sent = send();
    inFlight.add(sent);
    const forget = (): void => { inFlight.delete(sent); };
    sent.then(forget, forget);
    return sent;
  };
  const inTurn = <T>(send: () => Promise<T>): Promise<T> => {
    if (!deps.serial) return sendNow(send);
    const turn = tail.then(() => sendNow(send), () => sendNow(send));
    tail = turn.then(() => undefined, () => undefined);
    return turn;
  };
  const call = async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
    if (abandoned !== null) throw abandoned.error;
    const member = deps.memberOf(request.seat.aiRef);
    if (member === null || deps.sitsOut(request.seat.aiRef)) return { kind: "BUSY", code: MAKER_SAT_OUT };
    try {
      const pieces = mapProviderPieces(request.spec);
      const response = await inTurn(() => member.provider.call({
        runId: deps.runId, subjectItemId: deps.subjectItemId, callSiteKey: request.callSiteKey, role: "JUDGE", lane: "served",
        bound: mapStageBound(deps.judgeBound, request.step, deps.longBounds), contractHash: deps.mapContractHash,
        providerRef: member.providerRef, packet: pieces.framed.packet,
        classifyContent: pieces.classifyContent, buildRepairPacket: pieces.buildRepairPacket, ...keepRoom
      }));
      return { kind: "OK", value: pieces.readAccepted(response.content) };
    } catch (error) {
      if (deps.abandon(error)) {
        abandoned ??= { error };
        throw error;
      }
      if (deps.laneStopped(error)) { stopped = true; return { kind: "STOPPED", code: mapErrorCodeOf(error) }; }
      if (deps.roomKept?.(error) === true) { stopped = true; return { kind: "STOPPED", code: mapErrorCodeOf(error) }; }
      const stop = deps.spendStopOf(error);
      if (stop !== null) { spendStop ??= stop; stopped = true; return { kind: "STOPPED", code: mapErrorCodeOf(error) }; }
      if (deps.satOutBy(error)) return { kind: "BUSY", code: MAKER_SAT_OUT };
      return { kind: "FAILED", code: mapErrorCodeOf(error) };
    }
  };
  const settled = async (): Promise<void> => {
    while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    await tail;
  };
  return Object.freeze({ call, spendStop: () => spendStop, stopped: () => stopped, settled });
}

/** The map AIs: the first `mapAIs` seats of the distinct-maker order (the opener-rotation seat plans). */
export function mapStageSeats(seats: readonly Readonly<{ main: Readonly<{ providerRef: string; maker: string }> }>[], mapAIs: number): readonly MapSeat[] {
  return Object.freeze(shapeSeatOrder(seats).slice(0, mapAIs).map((seat) => Object.freeze({ aiRef: seat.main.providerRef, maker: seat.main.maker })));
}

/** The opening the receipt names (ANGLE_MAP by ruling S1; the two comparison arms stay runnable). */
export function runMapStage(input: Readonly<{ opening: DebateShapeOpening; map: MapRunInput }>): Promise<MapResult> {
  switch (input.opening) {
    case "ANGLE_MAP": return mapRunAngleMap(input.map);
    case "BLIND_LISTS": return mapRunBlindLists(input.map);
    case "SNOWBALL": return mapRunSnowball(input.map);
    // Pre-flight PF-B38: `audit:source` requires `exhaustive(` in any file with a `switch (`.
    default: return exhaustive(input.opening);
  }
}

/**
 * Spec §3.3: every map mark rides the answer with its typed record — the step as a code, never the detail text. It maps
 * every mark the result holds, never a fixed list (P2L adds no mark, but any later map mark needs no edit here). The
 * map's notes are operator facts, stored with the map choice; they never become condition records. Pre-flight PF-B47:
 * each record names the served root (`servedRootNodeId`), the node the answer rests on, as `runBodyStopDisclosure` does;
 * saving the answer refuses a record with an empty node list.
 *
 * Reader-safe (Task 3 note): the honesty drawer prints `reason` and `subjectRef` as written and keys each record by
 * `${mark}:${subjectRef}`, and the story writer reads `${mark}: ${reason}`. So the reason is `<MARK>:<STEP>` codes only
 * (never the detail, which may hold a key point id or an engine phrase), and a mark the map gave more than once
 * (CHOOSE_QUOTA_FILLED, ANSWERS_FILLED) gets a distinct subject ref: the run for its first record, `<run>:<n>` for its
 * n-th.
 */
export function mapConditionRecords(result: MapResult, runId: string, servedRootNodeId: string): readonly ConditionMarkRecord[] {
  const seen = new Map<string, number>();
  return Object.freeze(result.marks.map((record): ConditionMarkRecord => {
    const nth = (seen.get(record.mark) ?? 0) + 1;
    seen.set(record.mark, nth);
    return Object.freeze({
      mark: record.mark, scope: "answer" as const, subjectRef: nth === 1 ? runId : `${runId}:${String(nth)}`,
      reason: `${record.mark}:${record.step}`, liftPath: null, servedRootRule: null, affectedNodeIds: Object.freeze([servedRootNodeId])
    } satisfies ConditionMarkRecord);
  }));
}

/**
 * Controller ruling T12-R0 — HOW MUCH MAP MATERIAL ROOT 0 CAN CARRY, in characters: its assigned answer (a chosen
 * statement, or a filled answer built around one) and the JSON text of its map points (every point either side of a
 * chosen answer, plus the quota fills, each a key point's claim with room for its JSON members). Task 13 frames root 0's
 * `assigned_answer` and `map_points` within these, so the room the map keeps for root 0 is never below its real call.
 */
export const rootZeroMapMaterialChars = Object.freeze({
  answer: 2 * MAP_LIMITS.claimMaxChars,
  points: (2 * MAP_LIMITS.choosePointsPerSideMax + 3) * (MAP_LIMITS.claimMaxChars + 64) + 64
});

/** Room for the target's own `model` member, which `rootPositionRequestBytesBound` leaves empty. */
const ROOT_ZERO_BODY_ALLOWANCES = Object.freeze({ modelIdBytes: 256 });

/**
 * Ruling T12-R2 — WHO CAN WRITE ROOT 0, so the room is priced at root 0's OWN seat: its planned member and its backup
 * (`membersOf`: main and runner-up), and, only where the runner can hand root 0 to another seat (the sit-out book: root
 * 0's member sits out, and the next seat that does not opens instead), that next seat's members too. Never another
 * seat's dearer member. The cheaper-model try (B9) only ever moves root 0 to a CHEAPER maker, so it adds nobody.
 */
export function rootZeroRoomRefs<S>(input: Readonly<{
  seats: readonly S[];
  membersOf: (seat: S) => readonly Readonly<{ providerRef: string }>[];
  canHandOver: boolean;
  sitsOut: (seat: S) => boolean;
}>): readonly string[] {
  const [opener, ...rest] = input.seats;
  if (opener === undefined) return Object.freeze([]);
  const next = input.canHandOver ? rest.find((seat) => !input.sitsOut(seat)) : undefined;
  return Object.freeze([...new Set([opener, ...(next === undefined ? [] : [next])]
    .flatMap((seat) => input.membersOf(seat).map((member) => member.providerRef)))]);
}

/** The most bytes root 0's own request can carry for this question (a primary root, or a map-assigned one). */
export function rootZeroRequestBytes(input: Readonly<{ questionLine: string; argumentLanguageName: string; completionTokenCeiling: number }>): number {
  return rootPositionRequestBytesBound({ ...input, assignedMaterialChars: rootZeroMapMaterialChars })
    + ROOT_ZERO_BODY_ALLOWANCES.modelIdBytes;
}

/**
 * Root 0's worst-case call, in micro-units: the money seam's own projection (`projectedCallCeilingMicros`) of its largest
 * request at its first attempt's completion ceiling, at the dearest price among the members that could write it
 * (`rootZeroRoomRefs`). No price (local mode: no money ceiling) keeps no room.
 *
 * ONE CALL, ITS FIRST ATTEMPT — the same "one call" rule as the boot's RUN_CEILING_BELOW_ONE_CALL check
 * (`firstPositionCallProjections`): the room covers root 0's first attempt only. Its retries and repairs, like every
 * attempt of every call, are checked one by one by the money seam as today.
 */
export function rootZeroKeepRoomMicros(input: Readonly<{ prices: readonly ProviderTargetPrice[]; requestBytes: number; completionTokenCeiling: number }>): number {
  return input.prices.reduce((most, price) => Math.max(most,
    projectedCallCeilingMicros(price, { requestBytes: input.requestBytes, completionTokenCeiling: input.completionTokenCeiling })), 0);
}

/**
 * Debate shape (spec §3.3 step 1) — WHERE THE RUN'S MAP COMES FROM. A re-claimed run reuses its stored map and asks
 * nothing; a spend stop the stored map met (`stoppedBy`) is restored, so the arguing stops after root 0 exactly as on the
 * first claim (Task 12 fix round 1, Minor 2). Otherwise the map is asked and stored; when another copy of the run stored
 * its map first (ALREADY_PRESENT), this copy argues the STORED map, never its own (Important 1), and keeps its own spend
 * stop too: what it spent is spent. RUN_ERASED keeps this copy's map: nothing more of the run is stored.
 */
export async function resolveShapeMap(input: Readonly<{
  store: Pick<MapChoiceRepository, "writeMapRun" | "readMapResultForRun">;
  runId: string;
  answerCount: () => number;
  runMap: () => Promise<Readonly<{ result: MapResult; spendStop: EnvelopeStopKind | null }>>;
  spendStopOfCode: (code: string) => EnvelopeStopKind | null;
}>): Promise<Readonly<{ result: MapResult; spendStop: EnvelopeStopKind | null }>> {
  const storedStop = (stored: MapResult): EnvelopeStopKind | null =>
    stored.stoppedBy === null ? null : input.spendStopOfCode(stored.stoppedBy);
  const stored = await input.store.readMapResultForRun(input.runId);
  if (stored !== null) return Object.freeze({ result: stored, spendStop: storedStop(stored) });
  const own = await input.runMap();
  const written = await input.store.writeMapRun({ runId: input.runId, result: own.result, answerCount: input.answerCount() });
  if (written !== "ALREADY_PRESENT") return own;
  const winner = await input.store.readMapResultForRun(input.runId);
  if (winner === null) return own;
  return Object.freeze({ result: winner, spendStop: own.spendStop ?? storedStop(winner) });
}
