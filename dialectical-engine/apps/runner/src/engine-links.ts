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
import type { EngineSettings } from "@debateai/register";

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

/** The graph engine 2 propagates: the same nodes and links, with the link rules' values (pure; the input is untouched). */
export function engineSnapshotOf(snapshot: EvaluationSnapshot, facts: ReadonlyMap<string, EngineNodeFacts>,
  engine: EngineSettings): EvaluationSnapshot {
  const factsOf = (nodeId: string): Omit<EngineNodeFacts, "nodeId"> => facts.get(nodeId) ?? NO_FACTS;
  const ownReply = new Set([...facts.values()].flatMap((fact) => fact.ownReplyEdgeIds));
  const nodes = snapshot.nodes.map((node): SnapshotNode => {
    const factor = honestDisputeFactor(factsOf(node.nodeId).status, engine.scoring);
    return node.baseStrength === null || factor === 1 ? node : Object.freeze({ ...node, baseStrength: node.baseStrength * factor });
  });
  const arrows = snapshot.arrows.map((arrow): SnapshotArrow => {
    if (ownReply.has(arrow.arrowId)) {
      if (arrow.polarity !== "support") {
        throw new TypedDomainError("ENGINE_OWN_REPLY_EDGE_INVALID", `Link ${arrow.arrowId} is an own reply but not a support link`);
      }
      // A measured own reply carries nothing; an unmeasured one already carries nothing and stays unmeasured.
      return engine.links.ownReplyCountsAsSupport || arrow.magnitudeStatus !== "MEASURED" ? arrow : Object.freeze({ ...arrow, strength: 0 });
    }
    const source = factsOf(arrow.sourceNodeId);
    if (!source.cannotAssessReview) return arrow;
    // Only a point an investigation found to hold counts at full weight. A dead end, an investigation that never ran,
    // and a point found to fail keep the cannot-assess weight; a failed point also carries the disputed weight on its
    // score, so it weighs least (spec §4.2b, §17).
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
  const without = new Map(input.facts);
  without.set(input.nodeId, Object.freeze({ ...fact, status: "CANNOT_ASSESS" as const, cannotAssessReview: true }));
  const leaderWithRootNodeId = leaderOf(engineSnapshotOf(input.snapshot, input.facts, input.engine), input.servableRootIds);
  const leaderWithoutRootNodeId = leaderOf(engineSnapshotOf(input.snapshot, without, input.engine), input.servableRootIds);
  return Object.freeze({ leaderWithoutRootNodeId, leaderWithRootNodeId, moved: leaderWithRootNodeId !== leaderWithoutRootNodeId });
}
