// apps/runner/src/engine-links.ts
/**
 * ENGINE 2'S LINK RULES (spec docs/superpowers/specs/2026-10-15-engine-redesign-design.md §4.2a, rulings E6 and E12;
 * INTERFACE §7.2, §8.6). Propagation's arithmetic stays exactly as it is (packages/propagation/src/index.ts);
 * engine 2 changes only what goes into it:
 *
 *  - a point a cross-maker review disputed counts for less: its base strength × the disputed weight;
 *  - an answer's own reply to a rival is not support for itself: that reply's link to its own answer carries no
 *    weight (it stays in the graph and on record; its attack on the rival keeps its full weight);
 *  - "cannot assess" no longer deletes a link: such a point stays in the graph and its links count at the
 *    cannot-assess weight until an investigation finds that it holds (then at full weight, as the agreeing review it
 *    lacked); a point found to fail keeps the cannot-assess weight and also counts as disputed, so it weighs least.
 *
 * Pure: no pool, no clock, no AI. Engine 1 never reaches this file.
 */
import { TypedDomainError } from "@debateai/kernel";
import { honestDisputeFactor, type EngineReviewStatus } from "@debateai/judgement";
import { evaluate, type EvaluationSnapshot, type SnapshotArrow, type SnapshotNode } from "@debateai/propagation";
import type { EngineOfRun, EngineSettings } from "@debateai/register";
import type { ConditionMarkRecord } from "@debateai/serve";

export type EngineNodeFacts = Readonly<{
  nodeId: string;
  /** The node's own cross-maker review, after its investigation (A14): AGREE, DISPUTE, CANNOT_ASSESS or NONE. */
  status: EngineReviewStatus;
  /** True when that review answered "cannot assess", whatever an investigation later found. */
  cannotAssessReview: boolean;
  /** A cross-reply's support link to its own answer (empty for every other node). */
  ownReplyEdgeIds: readonly string[];
}>;

const NO_FACTS: Omit<EngineNodeFacts, "nodeId"> = Object.freeze({
  status: "NONE", cannotAssessReview: false, ownReplyEdgeIds: Object.freeze([])
});

/** A link from a point whose review could not assess it reads its measured bearing, or a full one when it has none. */
const bearingOf = (arrow: SnapshotArrow): number =>
  arrow.magnitudeStatus === "MEASURED" && arrow.strength !== null ? arrow.strength : 1;

/**
 * R2a final wave (Ruling (A6 Minors) 2): a value the link rules scale is range-checked BEFORE it is scaled, as engine 1's
 * propagation checks it (`PROPAGATION_MAGNITUDE_INVALID`, the same code and words): a bearing above one times the
 * cannot-assess weight could otherwise pass propagation's own check after scaling. Ids only, never a text.
 */
function unitBeforeScaling(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypedDomainError("PROPAGATION_MAGNITUDE_INVALID", `${field} must be a finite number in [0,1]`);
  }
  return value;
}

/**
 * R2a final wave (Ruling (A6 Minors) 3, 5): facts that contradict themselves or the graph are a code defect, refused
 * before any weight: a cannot-assess status needs the cannot-assess review behind it, and an own reply must be one of
 * its own node's links (engineLinkedGraph checks the second too; this covers a caller that hands facts in directly).
 */
function assertFactsFitGraph(snapshot: EvaluationSnapshot, facts: ReadonlyMap<string, EngineNodeFacts>): void {
  const sourceOf = new Map(snapshot.arrows.map((item) => [item.arrowId, item.sourceNodeId] as const));
  for (const fact of facts.values()) {
    if (fact.status === "CANNOT_ASSESS" && !fact.cannotAssessReview) {
      throw new TypedDomainError("ENGINE_FACTS_INVALID", `${fact.nodeId} is cannot-assess without a cannot-assess review`);
    }
    for (const edgeId of fact.ownReplyEdgeIds) {
      const source = sourceOf.get(edgeId);
      if (source !== undefined && source !== fact.nodeId) {
        throw new TypedDomainError("ENGINE_FACTS_INVALID", `Own reply ${edgeId} of ${fact.nodeId} is ${source}'s link`);
      }
    }
  }
}

/** The graph engine 2 propagates: the same nodes and links, with the link rules' values (pure; the input is untouched). */
export function engineSnapshotOf(snapshot: EvaluationSnapshot, facts: ReadonlyMap<string, EngineNodeFacts>,
  engine: EngineSettings): EvaluationSnapshot {
  assertFactsFitGraph(snapshot, facts);
  const factsOf = (nodeId: string): Omit<EngineNodeFacts, "nodeId"> => facts.get(nodeId) ?? NO_FACTS;
  const ownReply = new Set([...facts.values()].flatMap((fact) => fact.ownReplyEdgeIds));
  const nodes = snapshot.nodes.map((node): SnapshotNode => {
    const factor = honestDisputeFactor(factsOf(node.nodeId).status, engine.scoring);
    return node.baseStrength === null || factor === 1 ? node
      : Object.freeze({ ...node, baseStrength: unitBeforeScaling(node.baseStrength, `tau for ${node.nodeId}`) * factor });
  });
  const measuredBearing = (arrow: SnapshotArrow): void => {
    if (arrow.magnitudeStatus === "MEASURED" && arrow.strength !== null) unitBeforeScaling(arrow.strength, `strength for ${arrow.arrowId}`);
  };
  const arrows = snapshot.arrows.map((arrow): SnapshotArrow => {
    if (ownReply.has(arrow.arrowId)) {
      if (arrow.polarity !== "support") {
        throw new TypedDomainError("ENGINE_OWN_REPLY_EDGE_INVALID", `Link ${arrow.arrowId} is an own reply but not a support link`);
      }
      // A measured own reply carries nothing; an unmeasured one already carries nothing and stays unmeasured.
      // C2 (Ruling (A6 Minors) 1): if ownReplyCountsAsSupport is ever widened, a counted own reply from a cannot-assess
      // point must fall through to the cannot-assess rule below, not return here at full weight.
      if (engine.links.ownReplyCountsAsSupport || arrow.magnitudeStatus !== "MEASURED") return arrow;
      measuredBearing(arrow);
      return Object.freeze({ ...arrow, strength: 0 });
    }
    const source = factsOf(arrow.sourceNodeId);
    if (!source.cannotAssessReview) return arrow;
    // Only a point an investigation found to hold counts at full weight. A dead end, an investigation that never ran,
    // and a point found to fail keep the cannot-assess weight; a failed point also carries the disputed weight on its
    // score, so it weighs least (spec §4.2b, §17).
    measuredBearing(arrow);
    const weight = source.status === "AGREE" ? 1 : engine.links.cannotAssessWeight;
    return Object.freeze({ ...arrow, strength: weight * bearingOf(arrow), magnitudeStatus: "MEASURED" as const });
  });
  return Object.freeze({ ...snapshot, nodes: Object.freeze(nodes), arrows: Object.freeze(arrows) });
}

/** Engine 2: a cannot-assess point counts as judged for standing, so `projectJudgedStanding` never hides it. */
export function engineStandingNodeIds(reviewed: readonly string[], cannotAssess: readonly string[]): readonly string[] {
  return Object.freeze([...new Set([...reviewed, ...cannotAssess])]);
}

/** The leading answer by final strength, in `selectServedRootByStrength`'s order: highest, then lexicographic node id. */
function leaderOf(snapshot: EvaluationSnapshot, servableRootIds: readonly string[]): string {
  const strengths = new Map(evaluate(snapshot).strengths.map((row) => [row.nodeId, row.strength] as const));
  const ranked = servableRootIds
    .flatMap((nodeId) => { const strength = strengths.get(nodeId); return strength === undefined ? [] : [{ nodeId, strength }]; })
    .sort((left, right) => right.strength - left.strength
      || (left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0));
  const leader = ranked[0];
  if (leader === undefined) throw new TypedDomainError("ENGINE_STANDINGS_NO_ROOT", "No servable answer has a final strength");
  return leader.nodeId;
}

/**
 * Spec §4.2b "standings moved", for the record only (it never changes the debate): the leading answer with this one
 * investigation's outcome applied (`facts` as given) and without it (the point back at the cannot-assess weight,
 * every other outcome kept). `snapshot` is the served graph BEFORE the link weights (projected, untransformed);
 * propagation's own door (`evaluate`, which runs `computeGraph`) gives the final strengths.
 */
export function pointInvestigationStandings(input: Readonly<{ snapshot: EvaluationSnapshot;
  facts: ReadonlyMap<string, EngineNodeFacts>; engine: EngineSettings; nodeId: string; servableRootIds: readonly string[] }>):
  Readonly<{ leaderWithoutRootNodeId: string; leaderWithRootNodeId: string; moved: boolean }> {
  const fact = input.facts.get(input.nodeId);
  if (fact === undefined) throw new TypedDomainError("ENGINE_STANDINGS_NODE_UNKNOWN", input.nodeId);
  // R2a final wave (Ruling (A6 Minors) 4): only a point whose own review said "cannot assess" is ever investigated.
  if (!fact.cannotAssessReview) {
    throw new TypedDomainError("ENGINE_FACTS_INVALID", `${input.nodeId} has no cannot-assess review to investigate`);
  }
  const without = new Map(input.facts);
  without.set(input.nodeId, Object.freeze({ ...fact, status: "CANNOT_ASSESS" as const, cannotAssessReview: true }));
  const leaderWithRootNodeId = leaderOf(engineSnapshotOf(input.snapshot, input.facts, input.engine), input.servableRootIds);
  const leaderWithoutRootNodeId = leaderOf(engineSnapshotOf(input.snapshot, without, input.engine), input.servableRootIds);
  return Object.freeze({ leaderWithoutRootNodeId, leaderWithRootNodeId, moved: leaderWithRootNodeId !== leaderWithoutRootNodeId });
}

/** One run's review outcomes as the ledger holds them, the cross-replies' own links, and (A14) investigation outcomes. */
export type EngineReviewFacts = Readonly<{
  /** `readReviewedNodeIds`: agree and dispute. */
  reviewedNodeIds: readonly string[];
  disputedNodeIds: readonly string[];
  cannotAssessNodeIds: readonly string[];
  ownReplyEdgeIds: ReadonlyMap<string, readonly string[]>;
  /** A14: a cannot-assess point's investigation outcome as a review status (`pointInvestigationStatus`). */
  investigated?: ReadonlyMap<string, EngineReviewStatus>;
}>;

const INVESTIGATED_STATUSES: ReadonlySet<EngineReviewStatus> = new Set(["AGREE", "DISPUTE", "CANNOT_ASSESS"]);

/** The facts map engine 2's link rules read: one entry per reviewed node and per cross-reply. Pure. */
export function engineNodeFactsOf(input: EngineReviewFacts): ReadonlyMap<string, EngineNodeFacts> {
  const reviewed = new Set(input.reviewedNodeIds);
  const disputed = new Set(input.disputedNodeIds);
  const cannotAssess = new Set(input.cannotAssessNodeIds);
  const investigated = input.investigated ?? new Map<string, EngineReviewStatus>();
  const invalid = (why: string): never => { throw new TypedDomainError("ENGINE_FACTS_INVALID", why); };
  for (const nodeId of cannotAssess) if (reviewed.has(nodeId)) invalid(`${nodeId} has two review outcomes`);
  for (const nodeId of disputed) if (!reviewed.has(nodeId)) invalid(`${nodeId} is disputed but not reviewed`);
  for (const [nodeId, status] of investigated) {
    if (!cannotAssess.has(nodeId)) invalid(`${nodeId} was investigated but its review was not cannot-assess`);
    if (!INVESTIGATED_STATUSES.has(status)) invalid(`${nodeId} has no investigation status`);
  }
  const nodeIds = [...new Set([...input.reviewedNodeIds, ...input.cannotAssessNodeIds, ...input.ownReplyEdgeIds.keys()])];
  return new Map(nodeIds.map((nodeId) => [nodeId, Object.freeze({
    nodeId,
    status: cannotAssess.has(nodeId) ? investigated.get(nodeId) ?? "CANNOT_ASSESS"
      : disputed.has(nodeId) ? "DISPUTE" : reviewed.has(nodeId) ? "AGREE" : "NONE",
    cannotAssessReview: cannotAssess.has(nodeId),
    ownReplyEdgeIds: Object.freeze([...(input.ownReplyEdgeIds.get(nodeId) ?? [])])
  } satisfies EngineNodeFacts)] as const));
}

export type EngineLinkedGraph = Readonly<{
  /** The graph engine 2 propagates (`engineSnapshotOf`). */
  snapshot: EvaluationSnapshot;
  /** The judged-standing seed: the reviewed nodes and the cannot-assess ones (`engineStandingNodeIds`). */
  reviewedNodeIds: readonly string[];
  facts: ReadonlyMap<string, EngineNodeFacts>;
  /** Cannot-assess points no investigation settled, in review order: each is disclosed at its reduced weight. */
  unassessedNodeIds: readonly string[];
  cannotAssessWeight: number;
}>;

/** Engine 2's link rules on one materialised graph; null on engine 1 (nothing changes there). Pure. */
export function engineLinkedGraph(input: EngineReviewFacts & Readonly<{ engine: EngineOfRun; snapshot: EvaluationSnapshot }>):
  EngineLinkedGraph | null {
  const engine = input.engine;
  if (engine.engine !== 2) return null;
  // An own reply is one of that cross-reply's OWN links (its source is the cross-reply); an id naming another node's
  // link is a code defect. An id naming no link in this graph is skipped, as `engineSnapshotOf` skips it.
  const sourceOf = new Map(input.snapshot.arrows.map((item) => [item.arrowId, item.sourceNodeId] as const));
  for (const [nodeId, edgeIds] of input.ownReplyEdgeIds) {
    for (const edgeId of edgeIds) {
      const source = sourceOf.get(edgeId);
      if (source !== undefined && source !== nodeId) {
        throw new TypedDomainError("ENGINE_FACTS_INVALID", `Own reply ${edgeId} of ${nodeId} is ${source}'s link`);
      }
    }
  }
  const facts = engineNodeFactsOf(input);
  return Object.freeze({
    snapshot: engineSnapshotOf(input.snapshot, facts, engine),
    reviewedNodeIds: engineStandingNodeIds(input.reviewedNodeIds, input.cannotAssessNodeIds),
    facts,
    unassessedNodeIds: Object.freeze(input.cannotAssessNodeIds.filter((nodeId) => facts.get(nodeId)?.status === "CANNOT_ASSESS")),
    cannotAssessWeight: engine.links.cannotAssessWeight
  });
}

/**
 * The review catch-up's reading of the own-reply links (it runs later, without the save sites' record): a node whose
 * parent is an answer (a parentless, non-folder node) and that attacks ANOTHER answer is a cross-reply
 * (apps/runner/src/index.ts `argueShapeCross`, `crossChain`, the serial cross-exchange); its support link to its own
 * answer is its own reply. No other leg links to anything but its parent.
 */
export function engineOwnReplyEdgeIdsOf(snapshot: EvaluationSnapshot): ReadonlyMap<string, readonly string[]> {
  const byId = new Map(snapshot.nodes.map((node) => [node.nodeId, node] as const));
  const isAnswer = (nodeId: string | null | undefined): boolean => {
    const node = nodeId == null ? undefined : byId.get(nodeId);
    return node !== undefined && (node.parentNodeId ?? null) === null && node.isFolder !== true;
  };
  const found = new Map<string, readonly string[]>();
  for (const node of snapshot.nodes) {
    const parent = node.parentNodeId ?? null;
    if (parent === null || !isAnswer(parent)) continue;
    const sourced = snapshot.arrows.filter((item) => item.sourceNodeId === node.nodeId && item.targetKind === "NODE");
    if (!sourced.some((item) => item.polarity === "attack" && item.targetNodeId !== parent && isAnswer(item.targetNodeId))) continue;
    const own = sourced.filter((item) => item.polarity === "support" && item.targetNodeId === parent).map((item) => item.arrowId);
    if (own.length > 0) found.set(node.nodeId, Object.freeze(own));
  }
  return found;
}

/** One UNASSESSED-AT-REDUCED-WEIGHT record per unsettled cannot-assess point (INTERFACE §13); reason codes only. */
export function engineUnassessedRecords(linked: EngineLinkedGraph): readonly ConditionMarkRecord[] {
  return Object.freeze(linked.unassessedNodeIds.map((nodeId): ConditionMarkRecord => Object.freeze({
    mark: "UNASSESSED-AT-REDUCED-WEIGHT", scope: "node", subjectRef: nodeId,
    reason: `UNASSESSED_AT_REDUCED_WEIGHT:${String(linked.cannotAssessWeight)}`, liftPath: null, servedRootRule: null,
    affectedNodeIds: Object.freeze([nodeId]), reviewOutcome: "cannot-assess"
  })));
}

/**
 * The judgement-selection rule a review-catch-up version records (OVERVIEW §4 item 1: the catch-up keeps the receipt's
 * engine). Engine 1: the boot rule the catch-up was built with, the very same object, so its record keeps its bytes.
 * Engine 2: the rule the run's previous propagation version recorded (the run's own honest-median rule), never the boot
 * rule; no previous version on engine 2 is a broken record and stops loudly. Pure.
 */
export function engineCatchUpSelectionRule(input: Readonly<{ engine: EngineOfRun;
  bootRule: Readonly<Record<string, unknown>>; previousRule: Readonly<Record<string, unknown>> | null }>):
  Readonly<Record<string, unknown>> {
  if (input.engine.engine !== 2) return input.bootRule;
  if (input.previousRule === null) {
    throw new TypedDomainError("ENGINE_CATCH_UP_RULE_MISSING", "An engine-2 review catch-up found no previous propagation version");
  }
  return input.previousRule;
}
