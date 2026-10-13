import { exhaustive } from "@debateai/kernel";
import {
  mapErrorCodeOf, mapProviderPieces, mapRunAngleMap, mapRunBlindLists, mapRunSnowball,
  type MapCallOutcome, type MapCallRequest, type MapCaller, type MapResult, type MapRunInput, type MapSeat, type MapStep
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
        classifyContent: pieces.classifyContent, buildRepairPacket: pieces.buildRepairPacket
      }));
      return { kind: "OK", value: pieces.readAccepted(response.content) };
    } catch (error) {
      if (deps.abandon(error)) {
        abandoned ??= { error };
        throw error;
      }
      if (deps.laneStopped(error)) { stopped = true; return { kind: "STOPPED", code: mapErrorCodeOf(error) }; }
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
