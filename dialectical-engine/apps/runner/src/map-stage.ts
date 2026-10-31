import { projectedCallCeilingMicros, type ProviderTargetPrice } from "@debateai/budget";
import { rootPositionRepairRequestBytesBound, rootPositionRequestBytesBound } from "@debateai/judgement";
import {
  LENGTH_ALLOWANCE_LIMITS, answerRoomTokens, exhaustive, guidedAllowanceTokens, lengthGuideForBounds, questionLanguageForBounds,
  TypedDomainError, type QuestionLanguage
} from "@debateai/kernel";
import {
  MAP_ENGINE_LIMITS, MAP_LIMITS, mapErrorCodeOf, mapProviderPieces, mapRunAngleMap, mapRunBlindLists, mapRunSnowball,
  type MapCallOutcome, type MapCallRequest, type MapCaller, type MapChoiceRepository, type MapLimits, type MapResult, type MapRunInput,
  type MapSeat, type MapStep
} from "@debateai/map";
import { lengthRetryTokenCeiling, type CallBound, type ProviderGateway } from "@debateai/providers";
import type { DebateShapeOpening, EngineOfRun, LengthGuidance } from "@debateai/register";
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
  /** Length guidance: the run's frozen numbers (map thinking room, runaway factor); absent or null = today's bounds. */
  lengthGuidance?: LengthGuidance | null;
  /**
   * Engine 2 (engine INTERFACE §2.2): the seal an engine-2 map call records (`engineContractHash()`, from the runner's
   * engine settings). A map call whose spec is engine 2 (`spec.engine`) records it; every other map call records
   * `mapContractHash` as today.
   */
  engineContractHash?: string;
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

/**
 * Length guidance (spec 2026-10-15 §3.3): a map call's bound raised to the map's thinking room + its reply's runaway answer
 * room when that is larger; the same object without the row or without a reply ceiling (merge, choose).
 */
export function guidedMapBound(bound: CallBound, replyWordsCeiling: number | null, guidance: LengthGuidance | null): CallBound {
  if (guidance === null || replyWordsCeiling === null) return bound;
  const tokenCeiling = guidedAllowanceTokens({ todayTokens: bound.tokenCeiling, thinkingRoomTokens: guidance.thinkingRoom.map,
    answerRoomTokens: answerRoomTokens(replyWordsCeiling, guidance.runawayMultiplier, guidance.tokensPerWord),
    capTokens: LENGTH_ALLOWANCE_LIMITS.capTokens });
  return tokenCeiling === bound.tokenCeiling ? bound : Object.freeze({ ...bound, tokenCeiling });
}

const MAKER_SAT_OUT = "MAKER_SAT_OUT";

/**
 * Engine redesign R3 (spec 2026-10-15 §5, deviation 10): engine 2's map sends one answer check, so a shaped engine-2 run
 * whose receipt did not count it (R1d `sites.answerCheck`) must never reach the map: the runner stops it first
 * (ENGINE_MAP_CHECK_UNBUDGETED). Engine 1 and an unshaped run send no check. Pure; the runner's one guard reads it.
 */
export function engineMapCheckUnbudgeted(engine: EngineOfRun, shaped: boolean): boolean {
  return engine.engine === 2 && shaped && engine.sites.answerCheck !== 1;
}

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
    // Engine 2: the seal that covers the call's contract. Unreachable without the engine settings (R1d refuses such a run
    // first, ENGINE_RUNNER_UNCONFIGURED); a wiring defect would otherwise record the wrong seal, so it stops here.
    const contractHash = request.spec.engine === true ? deps.engineContractHash : deps.mapContractHash;
    if (contractHash === undefined) throw new TypedDomainError("ENGINE_RUNNER_UNCONFIGURED", "An engine-2 map call needs the engine seal");
    try {
      const pieces = mapProviderPieces(request.spec);
      const response = await inTurn(() => member.provider.call({
        runId: deps.runId, subjectItemId: deps.subjectItemId, callSiteKey: request.callSiteKey, role: "JUDGE", lane: "served",
        bound: guidedMapBound(mapStageBound(deps.judgeBound, request.step, deps.longBounds), request.spec.replyWordsCeiling,
          deps.lengthGuidance ?? null),
        contractHash,
        // Length guidance: the parts' words this call was told, recorded beside what it wrote.
        ...(request.spec.guidedWords === null ? {} : { guidedWords: request.spec.guidedWords }),
        // Length guidance L25 (pre-flight PF-C5.11): the most guided words this reply can hold, which the preview wrapper's
        // length-retry room reads before guidedWords (one item of each part); absent for merge and choose (no most).
        ...(request.spec.replyWordsCeiling === null ? {} : { replyWordsCeiling: request.spec.replyWordsCeiling }),
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
/** Root 0's material limits under a set of map limits (today's: `rootZeroMapMaterialChars`). */
export function rootZeroMapMaterialCharsFor(limits: MapLimits): Readonly<{ answer: number; points: number }> {
  return Object.freeze({
    answer: 2 * limits.claimMaxChars,
    points: (2 * limits.choosePointsPerSideMax + 3) * (limits.claimMaxChars + 64) + 64
  });
}
export const rootZeroMapMaterialChars = rootZeroMapMaterialCharsFor(MAP_LIMITS);

/**
 * Binding note 2 (Task 13) — ROOT 0'S MATERIAL, ENFORCED: what a root is asked to argue, held within
 * `rootZeroMapMaterialChars` (counted in UTF-16 code units, the unit the bound's own worst-case material is made of), so
 * the room the map kept for root 0 stays a ceiling whatever the map, or a stored map, hands the runner. The answer is
 * clipped at a character boundary; whole map points are dropped from the end of the side with more of them (the `for`
 * side on a tie: round 1 asks the points against first) until the points' JSON fits. Over-long points that are not the
 * `{ for, against }` JSON the plan writes are read as none. Material within the limits is returned unchanged.
 */
export function shapeRootMaterial(material: Readonly<{ assignedAnswer: string; mapPoints: string }>,
  limits: Readonly<{ answer: number; points: number }> = rootZeroMapMaterialChars): Readonly<{ assignedAnswer: string; mapPoints: string }> {
  let assignedAnswer = material.assignedAnswer;
  if (assignedAnswer.length > limits.answer) {
    let clipped = "";
    for (const character of assignedAnswer) {
      if (clipped.length + character.length > limits.answer) break;
      clipped += character;
    }
    assignedAnswer = clipped;
  }
  if (assignedAnswer === material.assignedAnswer && material.mapPoints.length <= limits.points) return material;
  let sides: { for: unknown[]; against: unknown[] };
  try {
    const parsed = JSON.parse(material.mapPoints) as unknown;
    // Engine 2's labelled points are objects; engine 1's string arrays read exactly as before.
    const entries = (value: unknown): unknown[] | null => Array.isArray(value) && value.every((entry) => typeof entry === "string"
      || (typeof entry === "object" && entry !== null && !Array.isArray(entry))) ? [...value as unknown[]] : null;
    const record = parsed !== null && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    sides = { for: entries(record.for) ?? [], against: entries(record.against) ?? [] };
  } catch {
    sides = { for: [], against: [] };
  }
  let mapPoints = material.mapPoints.length <= limits.points ? material.mapPoints : JSON.stringify(sides);
  while (mapPoints.length > limits.points && sides.for.length + sides.against.length > 0) {
    if (sides.against.length > sides.for.length) sides.against.pop(); else sides.for.pop();
    mapPoints = JSON.stringify(sides);
  }
  return Object.freeze({ assignedAnswer, mapPoints });
}

/**
 * Engine 2 (R3): root 0's material limits. `answer` and `points` are LG-C's (`rootZeroMapMaterialCharsFor`). `pointsRaised`
 * EQUALS `points` and is never added to it: it is the ONE room the labelled map points and the points raised SHARE
 * (Ruling PF-R35.4 (a): no second points room; together they hold at most `pointsRaised + 2` characters, the `+ 2` being
 * the empty list), so the room root 0 keeps under engine 2 is LG-C's plus the assumptions only. `assumptions` holds up
 * to three of a claim's length.
 */
export type RootZeroEngineMaterialChars = Readonly<{ answer: number; points: number; pointsRaised: number; assumptions: number }>;

/**
 * Engine 2 (spec §5.2 items 2, 6; Review Focus 5): the room root 0 keeps covers the fixed-words call. The answer's room is
 * LG-C's (twice the runaway claim limit): every chosen, reserve, merged or filled answer is within it by its schema, so the
 * words are never clipped. Task 12's bound frames the shared room at both extreme splits (all sided, the raised list
 * empty; none sided, all raised); every character frames at the same bytes, so every split in between is covered.
 */
export function rootZeroEngineMaterialCharsFor(limits: MapLimits): RootZeroEngineMaterialChars {
  const base = rootZeroMapMaterialCharsFor(limits);
  return Object.freeze({ answer: base.answer, points: base.points, pointsRaised: base.points,
    assumptions: MAP_ENGINE_LIMITS.assumptionsMax * (limits.claimMaxChars + 8) + 8 });
}

/** A JSON list trimmed whole from its end until it fits `room` characters (an unreadable list reads as none). */
function listWithin(json: string, room: number): string {
  let entries: unknown[];
  try { const parsed = JSON.parse(json) as unknown; entries = Array.isArray(parsed) ? [...parsed] : []; } catch { entries = []; }
  let text = JSON.stringify(entries);
  while (text.length > room && entries.length > 0) { entries.pop(); text = JSON.stringify(entries); }
  return text;
}

/**
 * Engine 2's root material, held within root 0's room: the chosen words WHOLE (P2.6: "the code sets the words"); the
 * labelled map points by today's rule (`shapeRootMaterial`, whole points dropped from the longer side) within the shared
 * room; then the points raised, whole points dropped from their end, in what is left of it; the assumptions trimmed whole
 * from their end. Code only selects and orders whole items (G1); it never cuts inside a text.
 */
export function shapeEngineRootMaterial(material: Readonly<{ assignedAnswer: string; mapPoints: string; pointsRaised: string; assumptions: string }>,
  limits: RootZeroEngineMaterialChars): Readonly<{ assignedAnswer: string; mapPoints: string; pointsRaised: string; assumptions: string }> {
  const mapPoints = shapeRootMaterial({ assignedAnswer: "", mapPoints: material.mapPoints }, { answer: limits.answer, points: limits.points }).mapPoints;
  return Object.freeze({ assignedAnswer: material.assignedAnswer, mapPoints,
    pointsRaised: listWithin(material.pointsRaised, limits.pointsRaised + "[]".length - mapPoints.length),
    assumptions: listWithin(material.assumptions, limits.assumptions) });
}

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

/**
 * What sizes one of root 0's requests: the question, the language, the completion bound, the run's lock (or none) and
 * whether the run has a length receipt (`lengthed`: the request is framed with the longest target any row can make,
 * `lengthGuideForBounds`, so the room stays a ceiling whatever words the receipt froze; absent or false, today's framing).
 */
type RootZeroRequestInput = Readonly<{
  questionLine: string; argumentLanguageName: string; completionTokenCeiling: number; questionLanguage?: QuestionLanguage | null;
  lengthed?: boolean;
  /**
   * Root 0's map material limits (`rootZeroMapMaterialCharsFor`); absent = today's `rootZeroMapMaterialChars`. With
   * `pointsRaised` and `assumptions` (engine 2, `rootZeroEngineMaterialCharsFor`), the fixed-words leg is framed too.
   */
  materialChars?: Readonly<{ answer: number; points: number; pointsRaised?: number; assumptions?: number; sources?: number }>;
}>;

/**
 * Pre-flight PF-L38 and ruling L-B64 — THE LOCK ROOT 0'S ROOM IS FRAMED WITH. A locked root 0 carries the named sentence
 * and the `question_language` field, so its room frames them; it frames them at the bound lock
 * (`questionLanguageForBounds`: the longest tag and a 64-byte name, which no lock the kernel makes or reads back frames
 * longer than), so the room stays a ceiling whatever lock reaches root 0's call. No lock: today's framing, today's room.
 */
function rootZeroRoomLock(questionLanguage: QuestionLanguage | null | undefined): QuestionLanguage | null {
  return questionLanguage === null || questionLanguage === undefined ? null : questionLanguageForBounds();
}

/** The most bytes root 0's own request can carry for this question (a primary root, or a map-assigned one). */
export function rootZeroRequestBytes(input: RootZeroRequestInput): number {
  return rootPositionRequestBytesBound({ ...input, assignedMaterialChars: input.materialChars ?? rootZeroMapMaterialChars,
    questionLanguage: rootZeroRoomLock(input.questionLanguage), length: input.lengthed === true ? lengthGuideForBounds() : null })
    + ROOT_ZERO_BODY_ALLOWANCES.modelIdBytes;
}

/** Ruling T12-R3: the most bytes root 0's FORMAT REPAIR (the judge's full re-ask) can carry for this question. */
export function rootZeroRepairRequestBytes(input: RootZeroRequestInput): number {
  return rootPositionRepairRequestBytesBound({ ...input, assignedMaterialChars: input.materialChars ?? rootZeroMapMaterialChars,
    questionLanguage: rootZeroRoomLock(input.questionLanguage), length: input.lengthed === true ? lengthGuideForBounds() : null })
    + ROOT_ZERO_BODY_ALLOWANCES.modelIdBytes;
}

/** One attempt of root 0's call, as the money seam projects it. */
export type RootZeroAttempt = Readonly<{ requestBytes: number; completionTokenCeiling: number }>;

/**
 * Ruling T12-R3 — THE ATTEMPTS ROOT 0'S ROOM PAYS FOR: its first attempt (the judge bound's first `max_tokens`) and ONE
 * retry, whichever is dearer: a length retry (the first packet again at `lengthRetryTokenCeiling(tc, 1)`, as the gateway
 * re-sends it after a cut reply) or a format repair (the full re-ask at the first attempt's bound, as the gateway sends it
 * after a reply that failed its check). The backup answering after a billed failure of the main is the first packet at
 * the first bound, under both. Each is sized the conservative way the first attempt is (`rootPositionRequestBytesBound`),
 * and each frames the run's lock when it has one (PF-L38: `rootZeroRoomLock`) and, on a run with a length receipt
 * (`lengthed`), the lengthed variant at its bound target (spec 2026-10-15 §3.2). With `pointsRaised` and `assumptions`
 * (engine 2, `rootZeroEngineMaterialCharsFor`), the fixed-words leg is framed too. Web search W4-1: with `sourcesChars` as
 * well, that leg is also framed reading a pack of that many characters (its sources variant), as the web step keeps it.
 */
export function rootZeroRoomAttempts(input: Readonly<{ questionLine: string; argumentLanguageName: string; tokenCeiling: number;
  questionLanguage?: QuestionLanguage | null; lengthed?: boolean;
  materialChars?: Readonly<{ answer: number; points: number; pointsRaised?: number; assumptions?: number }>;
  sourcesChars?: number }>):
  Readonly<{ first: RootZeroAttempt; retries: readonly RootZeroAttempt[] }> {
  // W4-1: a pack is read only by engine 2's fixed-words leg, so `sourcesChars` rides only with its material limits.
  const materialChars = input.materialChars === undefined || input.sourcesChars === undefined || input.materialChars.pointsRaised === undefined
    ? input.materialChars : { ...input.materialChars, sources: input.sourcesChars };
  const question = { questionLine: input.questionLine, argumentLanguageName: input.argumentLanguageName,
    questionLanguage: input.questionLanguage ?? null, ...(input.lengthed === true ? { lengthed: true } : {}),
    ...(materialChars === undefined ? {} : { materialChars }) };
  const firstBound = lengthRetryTokenCeiling(input.tokenCeiling, 0);
  const lengthRetryBound = lengthRetryTokenCeiling(input.tokenCeiling, 1);
  return Object.freeze({
    first: Object.freeze({ requestBytes: rootZeroRequestBytes({ ...question, completionTokenCeiling: firstBound }), completionTokenCeiling: firstBound }),
    retries: Object.freeze([
      Object.freeze({ requestBytes: rootZeroRequestBytes({ ...question, completionTokenCeiling: lengthRetryBound }), completionTokenCeiling: lengthRetryBound }),
      Object.freeze({ requestBytes: rootZeroRepairRequestBytes({ ...question, completionTokenCeiling: firstBound }), completionTokenCeiling: firstBound })
    ])
  });
}

/**
 * LG-A (Task 14 carry) — ROOT 0'S STRUCTURE-REPAIR CALL. On a routed run (the preview provider config with the repair
 * model a target, `previewStructureRepairRoute`), a reply whose structure the fixer cannot repair goes to the repair
 * model's call, and then (refused-repair salvage B) to root 0's own follow-up, its second POST: the repair call is priced
 * at the repair model's price and at the most the money seam can project for it (`previewStructureRepairCeiling`). Null
 * (hosted production, local): no such call.
 */
export type RootZeroStructureRepair = Readonly<{ price: ProviderTargetPrice; attempt: RootZeroAttempt }>;

/**
 * Root 0's room, in micro-units: the money seam's own projection (`projectedCallCeilingMicros`) of root 0's FIRST ATTEMPT
 * PLUS ONE RETRY (ruling T12-R3, `rootZeroRoomAttempts`), each at the dearest price among the members that could write it
 * (`rootZeroRoomRefs`) — the retry may be the backup's, so its price is never tied to the first attempt's. On a routed run
 * the structure-repair call at its own price (LG-A, `RootZeroStructureRepair`) is ADDED to the two: root 0 may send its
 * first POST, the repair call and its own second POST (refused-repair salvage B), so the room is the sum (money law: never
 * under-count). No price (local mode: no money ceiling) keeps no room.
 *
 * FIRST ATTEMPT + ONE RETRY: so a root 0 whose first reply slips its format, is cut at the token bound, or whose main
 * fails after billing still has the money for one more try once the map has spent down to the room (the owner's "always
 * an answer"). Later attempts, like every attempt of every call, are checked one by one by the money seam as today. A
 * map call refused only because of this room still stops only the map (T12-R1).
 */
export function rootZeroKeepRoomMicros(input: Readonly<{ prices: readonly ProviderTargetPrice[]; first: RootZeroAttempt;
  retries: readonly RootZeroAttempt[]; structureRepair?: RootZeroStructureRepair | null }>): number {
  if (input.prices.length === 0) return 0;
  const dearest = (attempts: readonly RootZeroAttempt[]) => input.prices.reduce((most, price) => Math.max(most,
    ...attempts.map((attempt) => projectedCallCeilingMicros(price, attempt))), 0);
  const repair = input.structureRepair ?? null;
  return dearest([input.first]) + dearest(input.retries)
    + (repair === null ? 0 : projectedCallCeilingMicros(repair.price, repair.attempt));
}

/**
 * Debate shape (spec §3.3 step 1) — WHERE THE RUN'S MAP COMES FROM. A re-claimed run reuses its stored map and asks
 * nothing; a spend stop the stored map met (`stoppedBy`) is restored, so the arguing stops after root 0 exactly as on the
 * first claim (Task 12 fix round 1, Minor 2). Otherwise the map is asked and stored; when another copy of the run stored
 * its map first (ALREADY_PRESENT), this copy argues the STORED map, never its own (Important 1), and keeps its own spend
 * stop too: what it spent is spent. Binding note 4 (Task 13): RUN_ERASED stops the run, as every other writer of an erased
 * run does — the graph's own write refuses it (`assertLive` in the content lease, packages/db): PRIVATE_CONTENT_ERASED,
 * before root 0 is asked.
 */
export async function resolveShapeMap(input: Readonly<{
  store: Pick<MapChoiceRepository, "writeMapRun" | "readMapResultForRun">;
  runId: string;
  answerCount: () => number;
  runMap: () => Promise<Readonly<{ result: MapResult; spendStop: EnvelopeStopKind | null }>>;
  spendStopOfCode: (code: string) => EnvelopeStopKind | null;
  /** Engine 2: the stored also-raised list lists unchosen answers (spec §5.2 item 8). */
  unchosenAnswers?: boolean;
}>): Promise<Readonly<{ result: MapResult; spendStop: EnvelopeStopKind | null }>> {
  const storedStop = (stored: MapResult): EnvelopeStopKind | null =>
    stored.stoppedBy === null ? null : input.spendStopOfCode(stored.stoppedBy);
  const stored = await input.store.readMapResultForRun(input.runId);
  if (stored !== null) return Object.freeze({ result: stored, spendStop: storedStop(stored) });
  const own = await input.runMap();
  const written = await input.store.writeMapRun({ runId: input.runId, result: own.result, answerCount: input.answerCount(),
    ...(input.unchosenAnswers === true ? { unchosenAnswers: true } : {}) });
  if (written === "RUN_ERASED") throw new TypedDomainError("PRIVATE_CONTENT_ERASED", "Private content is no longer available");
  if (written !== "ALREADY_PRESENT") return own;
  const winner = await input.store.readMapResultForRun(input.runId);
  if (winner === null) return own;
  return Object.freeze({ result: winner, spendStop: own.spendStop ?? storedStop(winner) });
}
