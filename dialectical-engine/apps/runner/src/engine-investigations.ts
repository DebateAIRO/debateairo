// apps/runner/src/engine-investigations.ts
/**
 * ENGINE 2: THE INVESTIGATION STEP (spec 2026-10-15 §4.2b, E13; INTERFACE §8.4-§8.7).
 *
 * After the reviews and before the final propagation, each "cannot assess" point may get one investigation, up to
 * `investigate.maxPerDebate` per debate, in a fixed order code computes (closest to an answer first, then the higher
 * honest score, then review order). The investigator is one AI of a maker that is neither the point's author's nor its
 * reviewer's, preferring a maker that argued no answer, in seat rotation. Its outcome is read as the review the point
 * lacked. Every qualifying point gets one row: HOLDS, FAILS, DEAD_END, or why it was not investigated
 * (INVESTIGATION_UNAVAILABLE, _SKIPPED, _CAPPED). No answer or vendor failure fails the debate; a code defect does.
 *
 * The runner passes in everything that touches the run (seats, the call, the standings, the record), so this file
 * holds the rules alone and is tested with scripted calls.
 */
import { enginePointPlacement, pointInvestigationCallSiteKey, type EngineMaterialSource, type PointInvestigationMaterial } from "@debateai/kernel";
import {
  orderPointInvestigations, pickPointInvestigator, pointInvestigationResultOf,
  type EngineReviewStatus, type PointInvestigationBasis, type PointInvestigationCandidate,
  type PointInvestigationRecord, type PointInvestigationReply, type PointInvestigationResult, type PointInvestigationSeat
} from "@debateai/judgement";
import type { EngineSettings } from "@debateai/register";
import type { EngineNodeFacts } from "./engine-links.js";
import type { EngineReviewRead } from "./engine-material-reader.js";

/** What one investigation call returned. */
export type PointInvestigationAnswered = Readonly<{
  reply: PointInvestigationReply; rawArtifactRef: string; maker: string; providerRef: string; modelId: string;
}>;
export type PointInvestigationCallOutcome =
  | Readonly<{ kind: "ANSWERED"; answer: PointInvestigationAnswered }>
  | Readonly<{ kind: "UNAVAILABLE" }>;
/** Which answer would lead with and without this one outcome applied (INTERFACE §8.6). Record only. */
export type PointInvestigationStandingsRecord = Readonly<{
  leaderWithoutRootNodeId: string; leaderWithRootNodeId: string; moved: boolean;
}>;
/** One `ledger.point_investigation` row, without the run id (INTERFACE §8.7). */
export type PointInvestigationRow = Readonly<{
  nodeId: string;
  investigationOrder: number;
  result: PointInvestigationResult;
  basis: PointInvestigationBasis | null;
  maker: string | null;
  providerRef: string | null;
  modelId: string | null;
  rawArtifactRef: string | null;
  leaderWithoutRootNodeId: string | null;
  leaderWithRootNodeId: string | null;
  standingsMoved: boolean | null;
  content: Readonly<{ missing: string; found: string; reason: string }> | null;
}>;

/**
 * The qualifying points as candidates: each cannot-assess point the material places on an answer and the ledger holds
 * a review for (its author's and reviewer's makers, its order). `honestScores` are the points' honest scores (base
 * strengths) before propagation.
 */
export function engineInvestigationCandidates(input: Readonly<{
  source: EngineMaterialSource;
  cannotAssess: readonly string[];
  reviews: ReadonlyMap<string, EngineReviewRead>;
  honestScores: ReadonlyMap<string, number>;
}>): readonly PointInvestigationCandidate[] {
  const placed = new Set(input.source.points.map((point) => point.nodeId));
  return Object.freeze(input.cannotAssess.flatMap((nodeId) => {
    const review = input.reviews.get(nodeId);
    if (review === undefined || !placed.has(nodeId)) return [];
    return [Object.freeze({
      nodeId,
      authorMaker: review.authorMaker,
      reviewerMaker: review.reviewerMaker,
      distanceToAnswer: enginePointPlacement(input.source, nodeId).distanceToAnswer,
      honestScore: input.honestScores.get(nodeId) ?? 0,
      reviewOrder: review.reviewOrder
    })];
  }));
}

/**
 * One planned point. NOT_CALLED (a money stop met before the step) keeps the seat it was planned with, so its
 * UNAVAILABLE row names the planned investigator (Ruling PF-R2a8.1; plan deviation 20): A10's record check and 0121's
 * `point_investigation_investigator_whole` CHECK refuse an UNAVAILABLE row with no investigator.
 */
type Planned =
  // Two members, not one with a two-word kind: a union kind does not narrow away on `!==` (the root typecheck).
  | Readonly<{ kind: "CAPPED"; candidate: PointInvestigationCandidate; order: number }>
  | Readonly<{ kind: "SKIPPED"; candidate: PointInvestigationCandidate; order: number }>
  | Readonly<{ kind: "NOT_CALLED"; candidate: PointInvestigationCandidate; order: number; investigator: PointInvestigationSeat }>
  | Readonly<{
      kind: "CALL"; candidate: PointInvestigationCandidate; order: number; callSiteKey: string;
      investigator: PointInvestigationSeat; material: PointInvestigationMaterial;
    }>;

const NO_CALL: Omit<PointInvestigationRow, "nodeId" | "investigationOrder" | "result"> = Object.freeze({
  basis: null, maker: null, providerRef: null, modelId: null, rawArtifactRef: null,
  leaderWithoutRootNodeId: null, leaderWithRootNodeId: null, standingsMoved: null, content: null
});
const NOT_INVESTIGATED: Readonly<Record<"CAPPED" | "SKIPPED", PointInvestigationResult>> = Object.freeze({
  CAPPED: "INVESTIGATION_CAPPED", SKIPPED: "INVESTIGATION_SKIPPED"
});
/** The rows an investigator answered: the ones "standings moved" is computed for. */
const ANSWERED: ReadonlySet<PointInvestigationResult> = new Set<PointInvestigationResult>(["HOLDS", "FAILS", "DEAD_END"]);
/** The two recorded results that settle a point (the review it lacked); every other result leaves it cannot-assess. */
const SETTLED_STATUS_OF_RESULT: Readonly<Record<string, "AGREE" | "DISPUTE">> = Object.freeze({ HOLDS: "AGREE", FAILS: "DISPUTE" });

/**
 * The ONE rule for reading a recorded investigation as a review status (spec §4.2b, §17): HOLDS -> AGREE, FAILS ->
 * DISPUTE; DEAD_END, INVESTIGATION_UNAVAILABLE, _SKIPPED and _CAPPED (or anything else) -> null, the point stays
 * cannot-assess. The runner's step, its record, its review catch-up and the practice transcript all read it here.
 */
export function investigatedStatusOf(result: string): "AGREE" | "DISPUTE" | null {
  return Object.hasOwn(SETTLED_STATUS_OF_RESULT, result) ? SETTLED_STATUS_OF_RESULT[result] ?? null : null;
}

/** One row as `investigated` map entries (A8's `EngineReviewFacts.investigated`): one entry when it settled the point, else none. */
export function investigatedStatusEntry(row: Readonly<{ nodeId: string; result: string }>):
  readonly (readonly [string, EngineReviewStatus])[] {
  const status = investigatedStatusOf(row.result);
  return status === null ? [] : [[row.nodeId, status] as const];
}

/** The `investigated` map (A8's `EngineReviewFacts.investigated`) of these rows: the settled points only. */
export function engineInvestigatedStatuses(rows: readonly Readonly<{ nodeId: string; result: string }>[]):
  ReadonlyMap<string, EngineReviewStatus> {
  return new Map(rows.flatMap(investigatedStatusEntry));
}

/** A TypeError the code raised by name: an upper-case code of two or more words, optionally `:<field path>`. */
const NAMED_CODE_DEFECT = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?::[A-Za-z0-9_.]+)?$/u;

/**
 * The ONE code-defect rule of engine 2's AI steps (R2b B5 fix 1): a TypeError whose message is a code the code itself
 * named (`POINT_INVESTIGATION_*`, `LENGTH_FIELD_INVALID`, `ENGINE_MATERIAL_INVALID:<field>`, ...). The investigation step
 * (`pointInvestigationFailureOutcome`) and the judging step (`comparingJudgeCodeDefect`) both read it. Decided by the
 * message being a code, never by the class: fetch's own network failure is a TypeError ("fetch failed") and is no defect.
 */
export function namedCodeDefect(error: unknown): boolean {
  return error instanceof TypeError && NAMED_CODE_DEFECT.test(error.message);
}

/**
 * R2a final wave (Ruling W3): the maker that actually answered an investigation is neither the point's author's nor its
 * reviewer's. The seat caller's eligibility filter already keeps both off the call (a moved call too), so a breach is a
 * code defect: a named TypeError, which the runner's failure rule rethrows and the debate fails, never an unavailable
 * investigation. The code names no maker.
 */
export function assertFairInvestigator(answeredMaker: string,
  candidate: Readonly<{ authorMaker: string; reviewerMaker: string }>): void {
  if (answeredMaker === candidate.authorMaker || answeredMaker === candidate.reviewerMaker) {
    throw new TypeError("POINT_INVESTIGATION_INVESTIGATOR_UNFAIR");
  }
}

/**
 * A code defect, never a debate's state: only a point whose own review said "cannot assess" is investigated, gets
 * investigation material (A11) or a "standings moved" record (A6). The code names no node and no text.
 */
function assertCannotAssessReview(fact: EngineNodeFacts | undefined, statusToo: boolean): void {
  if (fact === undefined || !fact.cannotAssessReview || (statusToo && fact.status !== "CANNOT_ASSESS")) {
    throw new TypeError("POINT_INVESTIGATION_NOT_CANNOT_ASSESS");
  }
}

/**
 * Plans, calls and reads the investigations of one debate; records nothing (Ruling PF-R2a8.10: the runner records the
 * rows after the serve decision, through `recordPointInvestigationRows`). Returns the node facts with each answered
 * outcome applied (a new map; the input is never changed; the same object when nothing qualifies) and the rows, in
 * investigation order, with the standings still null. A rejected call (only the runner's RETHROW errors reject) is
 * thrown once every planned call has settled.
 */
export async function runPointInvestigations(input: Readonly<{
  engine: EngineSettings;
  facts: ReadonlyMap<string, EngineNodeFacts>;
  candidates: readonly PointInvestigationCandidate[];
  /** The debate already met a money stop: a point that would take a slot is not called (UNAVAILABLE). */
  spendStopped: boolean;
  arguingMakers: ReadonlySet<string>;
  /** The seats that may investigate this point at this key, in book order (the runner's eligible members). */
  seatsFor: (candidate: PointInvestigationCandidate, callSiteKey: string) => readonly PointInvestigationSeat[];
  rotationOffsetOf: (callSiteKey: string) => number;
  materialOf: (nodeId: string) => PointInvestigationMaterial;
  call: (call: Readonly<{
    callSiteKey: string; investigator: PointInvestigationSeat; candidate: PointInvestigationCandidate;
    material: PointInvestigationMaterial;
  }>) => Promise<PointInvestigationCallOutcome>;
}>): Promise<Readonly<{ facts: ReadonlyMap<string, EngineNodeFacts>; rows: readonly PointInvestigationRow[] }>> {
  if (input.candidates.length === 0) return Object.freeze({ facts: input.facts, rows: Object.freeze([]) });
  // Before any seat, material or call: every candidate's own review said "cannot assess" and nothing settled it yet.
  for (const candidate of input.candidates) assertCannotAssessReview(input.facts.get(candidate.nodeId), true);
  const cap = input.engine.investigate.maxPerDebate;
  const planned: Planned[] = [];
  let slots = 0;
  for (const [index, candidate] of orderPointInvestigations(input.candidates).entries()) {
    const order = index + 1;
    if (slots >= cap) {
      planned.push(Object.freeze({ kind: "CAPPED", candidate, order }));
      continue;
    }
    const callSiteKey = pointInvestigationCallSiteKey(slots + 1);
    const investigator = pickPointInvestigator({
      seats: input.seatsFor(candidate, callSiteKey), authorMaker: candidate.authorMaker,
      reviewerMaker: candidate.reviewerMaker, arguingMakers: input.arguingMakers,
      rotationOffset: input.rotationOffsetOf(callSiteKey)
    });
    if (investigator === null) {
      planned.push(Object.freeze({ kind: "SKIPPED", candidate, order }));
      continue;
    }
    slots += 1;
    planned.push(input.spendStopped
      ? Object.freeze({ kind: "NOT_CALLED", candidate, order, investigator })
      : Object.freeze({ kind: "CALL", candidate, order, callSiteKey, investigator, material: input.materialOf(candidate.nodeId) }));
  }
  const settled = await Promise.allSettled(planned.map((plan) => plan.kind === "CALL"
    ? input.call({ callSiteKey: plan.callSiteKey, investigator: plan.investigator, candidate: plan.candidate, material: plan.material })
    : Promise.resolve(null)));
  const rejected = settled.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
  if (rejected !== undefined) throw rejected.reason;
  const answerOf = (index: number): PointInvestigationAnswered | null => {
    const outcome = settled[index];
    return outcome?.status === "fulfilled" && outcome.value !== null && outcome.value.kind === "ANSWERED" ? outcome.value.answer : null;
  };
  const facts = new Map(input.facts);
  planned.forEach((plan, index) => {
    const answer = answerOf(index);
    if (answer === null) return;
    const nodeId = plan.candidate.nodeId;
    const prior = facts.get(nodeId);
    facts.set(nodeId, Object.freeze({
      nodeId, ownReplyEdgeIds: prior?.ownReplyEdgeIds ?? Object.freeze([]), cannotAssessReview: true,
      // R2a final wave (re-review Minor 2): the ONE rule the record is read back by.
      status: investigatedStatusOf(pointInvestigationResultOf(answer.reply.outcome)) ?? "CANNOT_ASSESS"
    }));
  });
  const finalFacts: ReadonlyMap<string, EngineNodeFacts> = facts;
  const rows = Object.freeze(planned.map((plan, index): PointInvestigationRow => {
    const base = { nodeId: plan.candidate.nodeId, investigationOrder: plan.order };
    if (plan.kind === "CAPPED" || plan.kind === "SKIPPED") return Object.freeze({ ...base, result: NOT_INVESTIGATED[plan.kind], ...NO_CALL });
    // Ruling PF-R2a8.1: a slot-holder never called (money stop) names the investigator it was planned with.
    if (plan.kind === "NOT_CALLED") {
      return Object.freeze({ ...base, result: "INVESTIGATION_UNAVAILABLE", ...NO_CALL,
        maker: plan.investigator.maker, providerRef: plan.investigator.providerRef });
    }
    const answer = answerOf(index);
    if (answer === null) {
      return Object.freeze({ ...base, result: "INVESTIGATION_UNAVAILABLE", ...NO_CALL,
        maker: plan.investigator.maker, providerRef: plan.investigator.providerRef });
    }
    return Object.freeze({
      ...base,
      result: pointInvestigationResultOf(answer.reply.outcome),
      basis: answer.reply.basis,
      maker: answer.maker,
      providerRef: answer.providerRef,
      modelId: answer.modelId,
      rawArtifactRef: answer.rawArtifactRef,
      // Filled by recordPointInvestigationRows, on the served graph (Ruling PF-R2a8.10).
      leaderWithoutRootNodeId: null,
      leaderWithRootNodeId: null,
      standingsMoved: null,
      // `found` arrives trimmed from A13's reader (Ruling PF-R2a6.1): stored as read.
      content: Object.freeze({ missing: answer.reply.missing, found: answer.reply.found, reason: answer.reply.reason })
    });
  }));
  return Object.freeze({ facts: finalFacts, rows });
}

/**
 * Records the rows of `runPointInvestigations`, in investigation order, after the runner's serve decision (Ruling
 * PF-R2a8.10). Each answered row (HOLDS / FAILS / DEAD_END) first gets "standings moved" from `standingsOf`, which the
 * runner reads on the SERVED graph with every outcome applied (`facts`); the other rows go as they are. All standings are
 * computed before the first row is written. Returns the rows as recorded: when `record` hands back a row (the one
 * another write stored first, A10's ALREADY_PRESENT, read back), that stored row stands in for this copy's own.
 */
export async function recordPointInvestigationRows(input: Readonly<{
  rows: readonly PointInvestigationRow[];
  facts: ReadonlyMap<string, EngineNodeFacts>;
  standingsOf: (nodeId: string, facts: ReadonlyMap<string, EngineNodeFacts>) => PointInvestigationStandingsRecord;
  record: (row: PointInvestigationRow) => Promise<PointInvestigationRow | null | void>;
}>): Promise<readonly PointInvestigationRow[]> {
  const rows = Object.freeze(input.rows.map((row): PointInvestigationRow => {
    if (!ANSWERED.has(row.result)) return row;
    assertCannotAssessReview(input.facts.get(row.nodeId), false);
    const standings = input.standingsOf(row.nodeId, input.facts);
    return Object.freeze({ ...row, leaderWithoutRootNodeId: standings.leaderWithoutRootNodeId,
      leaderWithRootNodeId: standings.leaderWithRootNodeId, standingsMoved: standings.moved });
  }));
  const recorded: PointInvestigationRow[] = [];
  for (const row of rows) {
    const stored = await input.record(row);
    recorded.push(stored !== undefined && stored !== null ? stored : row);
  }
  return Object.freeze(recorded);
}

/** A stored investigation (A10's nested record) as this file's flat row, so a row read back reads like one just made. */
export function pointInvestigationRowOfStored(stored: PointInvestigationRecord): PointInvestigationRow {
  return Object.freeze({
    nodeId: stored.nodeId,
    investigationOrder: stored.investigationOrder,
    result: stored.result,
    basis: stored.basis,
    maker: stored.investigator?.maker ?? null,
    providerRef: stored.investigator?.providerRef ?? null,
    modelId: stored.investigator?.modelId ?? null,
    rawArtifactRef: stored.rawArtifactRef,
    leaderWithoutRootNodeId: stored.standings?.leaderWithoutRootNodeId ?? null,
    leaderWithRootNodeId: stored.standings?.leaderWithRootNodeId ?? null,
    standingsMoved: stored.standings?.moved ?? null,
    content: stored.content === null ? null
      : Object.freeze({ missing: stored.content.missing, found: stored.content.found, reason: stored.content.reason })
  });
}

/**
 * The node facts with each row's outcome applied, as `runPointInvestigations` applies a fresh one (holds -> AGREE,
 * fails -> DISPUTE, a dead end and every row without an outcome -> CANNOT_ASSESS; `cannotAssessReview` kept). The
 * runner reads the rows as recorded through this, so a row another write stored first decides every later reading.
 * A new map; the input is never changed.
 */
export function engineFactsWithInvestigations(facts: ReadonlyMap<string, EngineNodeFacts>,
  rows: readonly PointInvestigationRow[]): ReadonlyMap<string, EngineNodeFacts> {
  const next = new Map(facts);
  for (const row of rows) {
    const prior = facts.get(row.nodeId);
    assertCannotAssessReview(prior, false);
    next.set(row.nodeId, Object.freeze({
      nodeId: row.nodeId, ownReplyEdgeIds: prior?.ownReplyEdgeIds ?? Object.freeze([]), cannotAssessReview: true,
      status: investigatedStatusOf(row.result) ?? "CANNOT_ASSESS"
    }));
  }
  return next;
}
