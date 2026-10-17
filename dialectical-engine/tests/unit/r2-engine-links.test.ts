// tests/unit/r2-engine-links.test.ts
import { describe, expect, it } from "vitest";
import { evaluate, type EvaluationSnapshot, type SnapshotArrow } from "@debateai/propagation";
import { engineSettingsOf, engineVersionPolicyStartValues } from "@debateai/register";
import { projectJudgedStanding, selectServedRootByStrength } from "@debateai/runner";
import {
  engineSnapshotOf, engineStandingNodeIds, pointInvestigationStandings, type EngineNodeFacts
} from "../../apps/runner/src/engine-links.js";

/** The start values (spec §8): cannot-assess links at 0.66, a disputed point at 0.7. */
const ENGINE = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 3, mapOpening: true });
const arrow = (arrowId: string, sourceNodeId: string, targetNodeId: string, polarity: "support" | "attack",
  strength: number | null): SnapshotArrow => ({
  arrowId, sourceNodeId, targetKind: "NODE", targetNodeId, targetEdgeId: null, polarity,
  kind: polarity === "attack" ? "rebutting" : null, strength, magnitudeStatus: strength === null ? "UNKNOWN" : "MEASURED",
  strengthSource: "REVIEWER"
});
const graph = (nodes: EvaluationSnapshot["nodes"], arrows: readonly SnapshotArrow[]): EvaluationSnapshot => ({
  nodes, arrows, arrowOrder: arrows.map((item) => item.arrowId),
  operatorResolutions: [...new Set(arrows.map((item) => item.targetNodeId!))]
    .map((parentNodeId) => ({ parentNodeId, operator: "accumulate" as const, suppliedBy: "deployment" as const })),
  clusterRecords: []
});
const fact = (nodeId: string, status: EngineNodeFacts["status"], more: Partial<EngineNodeFacts> = {}): [string, EngineNodeFacts] =>
  [nodeId, { nodeId, status, cannotAssessReview: status === "CANNOT_ASSESS", ownReplyEdgeIds: [], ...more }];
/** A TypedDomainError carries its code on `code`, not in its message. */
const code = (value: string) => expect.objectContaining({ code: value });
const strengthOf = (snapshot: EvaluationSnapshot, nodeId: string): number =>
  evaluate(snapshot).strengths.find((row) => row.nodeId === nodeId)!.strength;

/**
 * Two answers. root-a's own cross-reply supports root-a (0.9) and attacks root-b (0.5); point-p supports root-b and its
 * review said cannot-assess (no bearing); point-q attacks root-a and its review disputed it.
 */
const SHAPED = graph([
  { nodeId: "root-a", baseStrength: 0.6, parentNodeId: null },
  { nodeId: "root-b", baseStrength: 0.5, parentNodeId: null },
  { nodeId: "cross-c", baseStrength: 0.8, parentNodeId: "root-a" },
  { nodeId: "point-p", baseStrength: 0.7, parentNodeId: "root-b" },
  { nodeId: "point-q", baseStrength: 0.4, parentNodeId: "root-a" }
], [
  arrow("own-c", "cross-c", "root-a", "support", 0.9),
  arrow("rival-c", "cross-c", "root-b", "attack", 0.5),
  arrow("unsure-p", "point-p", "root-b", "support", null),
  arrow("disputed-q", "point-q", "root-a", "attack", 0.8)
]);
const SHAPED_FACTS = new Map([
  fact("cross-c", "AGREE", { ownReplyEdgeIds: ["own-c"] }), fact("point-p", "CANNOT_ASSESS"), fact("point-q", "DISPUTE")
]);

describe("engine 2: the link rules on the snapshot (spec §4.2a, INTERFACE §7.2)", () => {
  it("reads the start values it is pinned against", () => {
    expect(ENGINE.links.cannotAssessWeight).toBe(0.66);
    expect(ENGINE.scoring.disputedWeight).toBe(0.7);
  });

  it("weights a disputed point by 0.7, zeroes an own reply's support, keeps a cannot-assess link at 0.66", () => {
    const linked = engineSnapshotOf(SHAPED, SHAPED_FACTS, ENGINE);
    expect(linked.nodes.find((node) => node.nodeId === "point-q")!.baseStrength).toBeCloseTo(0.28, 12);
    expect(linked.nodes.find((node) => node.nodeId === "root-a")!.baseStrength).toBe(0.6);
    const byId = new Map(linked.arrows.map((item) => [item.arrowId, item] as const));
    expect(byId.get("own-c")).toMatchObject({ strength: 0, magnitudeStatus: "MEASURED", polarity: "support" });
    expect(byId.get("rival-c")).toEqual(SHAPED.arrows[1]);            // its attack on the rival keeps full weight
    expect(byId.get("unsure-p")).toMatchObject({ strength: 0.66, magnitudeStatus: "MEASURED" });
    expect(byId.get("disputed-q")).toEqual(SHAPED.arrows[3]);
    expect(linked.arrowOrder).toEqual(SHAPED.arrowOrder);
    expect(linked.operatorResolutions).toEqual(SHAPED.operatorResolutions);
  });

  it("changes the leader exactly as the arithmetic says (σ and agg unchanged)", () => {
    // Engine 1's inputs: root-a 0.6 + (1−0.6)(0.72−0.32) = 0.76; root-b 0.5 − 0.5·0.4 = 0.3.
    expect(strengthOf(SHAPED, "root-a")).toBeCloseTo(0.76, 12);
    expect(strengthOf(SHAPED, "root-b")).toBeCloseTo(0.3, 12);
    // Engine 2: root-a 0.6 − 0.6·(0.8·0.28) = 0.4656; root-b 0.5 + 0.5·(0.66·0.7 − 0.4) = 0.531.
    const linked = engineSnapshotOf(SHAPED, SHAPED_FACTS, ENGINE);
    expect(strengthOf(linked, "root-a")).toBeCloseTo(0.4656, 12);
    expect(strengthOf(linked, "root-b")).toBeCloseTo(0.531, 12);
  });

  // pre-flight PF-R2a3.1: retitled; the `fails` case now expects the cannot-assess weight (was full weight).
  it("reads a measured bearing under cannot-assess, full weight once an investigation found the point holds, and the cannot-assess weight for a point found to fail", () => {
    const measured = graph([{ nodeId: "r", baseStrength: 0.5, parentNodeId: null }, { nodeId: "p", baseStrength: 0.5, parentNodeId: "r" }],
      [arrow("p-r", "p", "r", "attack", 0.5)]);
    expect(engineSnapshotOf(measured, new Map([fact("p", "CANNOT_ASSESS")]), ENGINE).arrows[0]!.strength).toBeCloseTo(0.33, 12);
    const holds = new Map([fact("p", "AGREE", { cannotAssessReview: true })]);
    expect(engineSnapshotOf(measured, holds, ENGINE).arrows[0]!.strength).toBe(0.5);
    const unmeasured = graph(measured.nodes, [arrow("p-r", "p", "r", "attack", null)]);
    expect(engineSnapshotOf(unmeasured, holds, ENGINE).arrows[0]).toMatchObject({ strength: 1, magnitudeStatus: "MEASURED" });
    // A point found to fail: its link stays at 0.66 × (bearing ?? 1) and its base strength takes 0.7 (0.5 × 0.7 = 0.35).
    const fails = new Map([fact("p", "DISPUTE", { cannotAssessReview: true })]);
    const failed = engineSnapshotOf(unmeasured, fails, ENGINE);
    expect(failed.arrows[0]).toMatchObject({ strength: 0.66, magnitudeStatus: "MEASURED" });
    expect(failed.nodes[1]!.baseStrength).toBeCloseTo(0.35, 12);
    expect(engineSnapshotOf(measured, fails, ENGINE).arrows[0]!.strength).toBeCloseTo(0.33, 12);
  });

  // pre-flight PF-R2a3.1: the three investigation outcomes are told apart through propagation's own door.
  it("orders the three outcomes: holds (full weight) > dead end (cannot-assess weight) > fails (that weight and the dispute factor)", () => {
    const one = graph([{ nodeId: "r", baseStrength: 0.5, parentNodeId: null }, { nodeId: "p", baseStrength: 0.5, parentNodeId: "r" }],
      [arrow("p-r", "p", "r", "support", null)]);
    const rootWith = (status: EngineNodeFacts["status"]): number =>
      strengthOf(engineSnapshotOf(one, new Map([fact("p", status, { cannotAssessReview: true })]), ENGINE), "r");
    // r = 0.5 + 0.5·(weight × p): holds 0.5 + 0.5·0.5 = 0.75; dead end 0.5 + 0.5·0.33 = 0.665; fails 0.5 + 0.5·(0.66·0.35) = 0.6155.
    expect(rootWith("AGREE")).toBeCloseTo(0.75, 12);
    expect(rootWith("CANNOT_ASSESS")).toBeCloseTo(0.665, 12);
    expect(rootWith("DISPUTE")).toBeCloseTo(0.6155, 12);
  });

  it("leaves an unmeasured own reply unmeasured (even from a cannot-assess point), and unreviewed links as they are", () => {
    const snapshot = graph([{ nodeId: "r", baseStrength: 0.5, parentNodeId: null }, { nodeId: "c", baseStrength: 0.5, parentNodeId: "r" },
      { nodeId: "u", baseStrength: 0.5, parentNodeId: "r" }], [arrow("own", "c", "r", "support", null), arrow("u-r", "u", "r", "attack", null)]);
    const linked = engineSnapshotOf(snapshot, new Map([fact("c", "CANNOT_ASSESS", { ownReplyEdgeIds: ["own"] })]), ENGINE);
    expect(linked.arrows).toEqual(snapshot.arrows);
  });

  it("refuses an own-reply id that names an attack link", () => {
    expect(() => engineSnapshotOf(SHAPED, new Map([fact("cross-c", "AGREE", { ownReplyEdgeIds: ["rival-c"] })]), ENGINE))
      .toThrowError(code("ENGINE_OWN_REPLY_EDGE_INVALID"));
  });

  it("never mutates its input and returns frozen parts", () => {
    const before = JSON.stringify(SHAPED);
    const linked = engineSnapshotOf(SHAPED, SHAPED_FACTS, ENGINE);
    expect(JSON.stringify(SHAPED)).toBe(before);
    expect(Object.isFrozen(linked) && Object.isFrozen(linked.nodes) && Object.isFrozen(linked.arrows)).toBe(true);
  });

  it("commutes with the judged-standing projection (the transform changes values, never which nodes stand)", () => {
    const seed = ["root-a", "root-b", "cross-c", "point-q"];
    const transformThenProject = projectJudgedStanding(engineSnapshotOf(SHAPED, SHAPED_FACTS, ENGINE), seed).snapshot;
    const projectThenTransform = engineSnapshotOf(projectJudgedStanding(SHAPED, seed).snapshot, SHAPED_FACTS, ENGINE);
    expect(transformThenProject).toEqual(projectThenTransform);
  });

  it("counts a cannot-assess point as judged for standing (engineStandingNodeIds)", () => {
    expect(engineStandingNodeIds(["a", "b"], ["c", "a"])).toEqual(["a", "b", "c"]);
    const standing = projectJudgedStanding(SHAPED, engineStandingNodeIds(["root-a", "root-b", "cross-c", "point-q"], ["point-p"]));
    expect(standing.hiddenNodeIds).toEqual([]);
    expect(projectJudgedStanding(SHAPED, ["root-a", "root-b", "cross-c", "point-q"]).hiddenNodeIds).toEqual(["point-p"]);
  });
});

describe("engine 2: whether one investigation moved the standings (spec §4.2b, INTERFACE §8.6)", () => {
  // root-b leads while point-p (attacking it, no bearing) sits at 0.66: 0.7 − 0.7·0.33 = 0.469 > 0.45.
  // An investigation that finds the attack holds gives it full weight: 0.7 − 0.7·0.5 = 0.35 < 0.45, so root-a leads.
  const STANDINGS = graph([
    { nodeId: "root-a", baseStrength: 0.45, parentNodeId: null },
    { nodeId: "root-b", baseStrength: 0.7, parentNodeId: null },
    { nodeId: "point-p", baseStrength: 0.5, parentNodeId: "root-b" }
  ], [arrow("p-b", "point-p", "root-b", "attack", null)]);
  const roots = ["root-a", "root-b"];

  it("names both leaders and says the investigation moved them", () => {
    const facts = new Map([fact("point-p", "AGREE", { cannotAssessReview: true })]);
    expect(pointInvestigationStandings({ snapshot: STANDINGS, facts, engine: ENGINE, nodeId: "point-p", servableRootIds: roots }))
      .toEqual({ leaderWithoutRootNodeId: "root-b", leaderWithRootNodeId: "root-a", moved: true });
  });

  it("a dead end moves nothing", () => {
    const facts = new Map([fact("point-p", "CANNOT_ASSESS")]);
    expect(pointInvestigationStandings({ snapshot: STANDINGS, facts, engine: ENGINE, nodeId: "point-p", servableRootIds: roots }))
      .toEqual({ leaderWithoutRootNodeId: "root-b", leaderWithRootNodeId: "root-b", moved: false });
  });

  // pre-flight PF-R2a3.1: a failed point keeps the cannot-assess weight, so here it cannot move the leader.
  it("a point found to fail weighs less than at the cannot-assess weight, and here moves nothing", () => {
    // point-p at 0.35 behind a 0.66 link: root-b 0.7 − 0.7·0.231 = 0.5383 > 0.45, as without the investigation (0.469).
    const facts = new Map([fact("point-p", "DISPUTE", { cannotAssessReview: true })]);
    expect(pointInvestigationStandings({ snapshot: STANDINGS, facts, engine: ENGINE, nodeId: "point-p", servableRootIds: roots }))
      .toEqual({ leaderWithoutRootNodeId: "root-b", leaderWithRootNodeId: "root-b", moved: false });
  });

  it("names the leader the runner's selection would name (same order, ties by node id)", () => {
    const facts = new Map([fact("point-p", "AGREE", { cannotAssessReview: true })]);
    const linked = engineSnapshotOf(STANDINGS, facts, ENGINE);
    const runner = selectServedRootByStrength(roots.map((nodeId) => ({ nodeId })), evaluate(linked).strengths).root.nodeId;
    expect(pointInvestigationStandings({ snapshot: STANDINGS, facts, engine: ENGINE, nodeId: "point-p", servableRootIds: roots })
      .leaderWithRootNodeId).toBe(runner);
    const tied = graph([{ nodeId: "root-b", baseStrength: 0.5, parentNodeId: null }, { nodeId: "root-a", baseStrength: 0.5, parentNodeId: null },
      { nodeId: "p", baseStrength: 0.5, parentNodeId: "root-b" }], [arrow("p-b", "p", "root-b", "attack", 0)]);
    expect(pointInvestigationStandings({ snapshot: tied, facts: new Map([fact("p", "CANNOT_ASSESS")]), engine: ENGINE, nodeId: "p",
      servableRootIds: ["root-b", "root-a"] }).leaderWithRootNodeId).toBe("root-a");
  });

  it("refuses a point it has no facts for, and a list with no servable answer", () => {
    expect(() => pointInvestigationStandings({ snapshot: STANDINGS, facts: new Map(), engine: ENGINE, nodeId: "point-p", servableRootIds: roots }))
      .toThrowError(code("ENGINE_STANDINGS_NODE_UNKNOWN"));
    expect(() => pointInvestigationStandings({ snapshot: STANDINGS, facts: new Map([fact("point-p", "CANNOT_ASSESS")]), engine: ENGINE,
      nodeId: "point-p", servableRootIds: [] })).toThrowError(code("ENGINE_STANDINGS_NO_ROOT"));
  });
});

// R2a final wave, Ruling (A6 Minors) (2)-(5): inconsistent inputs are refused, never weighted quietly.
describe("engine 2: the link rules refuse inconsistent inputs (R2a final wave A1)", () => {
  const ONE = graph([{ nodeId: "r", baseStrength: 0.5, parentNodeId: null }, { nodeId: "p", baseStrength: 0.5, parentNodeId: "r" }],
    [arrow("p-r", "p", "r", "attack", 0.5)]);

  it.each([
    ["a base strength above one", graph([{ nodeId: "r", baseStrength: 0.5, parentNodeId: null }, { nodeId: "p", baseStrength: 1.4, parentNodeId: "r" }],
      [arrow("p-r", "p", "r", "attack", 0.5)]), new Map([fact("p", "DISPUTE")])],
    ["a negative base strength", graph([{ nodeId: "r", baseStrength: 0.5, parentNodeId: null }, { nodeId: "p", baseStrength: -0.1, parentNodeId: "r" }],
      [arrow("p-r", "p", "r", "attack", 0.5)]), new Map([fact("p", "DISPUTE")])],
    // 1.4 × 0.66 = 0.924 would pass propagation's own unit check after scaling; it is refused before.
    ["a bearing above one", graph(ONE.nodes, [arrow("p-r", "p", "r", "attack", 1.4)]), new Map([fact("p", "CANNOT_ASSESS")])],
    ["a bearing that is not a number", graph(ONE.nodes, [arrow("p-r", "p", "r", "attack", Number.NaN)]), new Map([fact("p", "CANNOT_ASSESS")])],
    ["a measured own reply above one", graph(ONE.nodes, [arrow("p-r", "p", "r", "support", 1.4)]),
      new Map([fact("p", "AGREE", { ownReplyEdgeIds: ["p-r"] })])]
  ] as const)("refuses %s before scaling it, as engine 1's propagation refuses it (PROPAGATION_MAGNITUDE_INVALID)", (_name, snapshot, facts) => {
    expect(() => engineSnapshotOf(snapshot, facts, ENGINE)).toThrowError(code("PROPAGATION_MAGNITUDE_INVALID"));
    // Engine 1 (no transform): propagation's own door refuses the same value.
    expect(() => evaluate(snapshot)).toThrowError(code("PROPAGATION_MAGNITUDE_INVALID"));
  });

  it("leaves a value it does not scale to propagation's own check", () => {
    const outOfRangeUnscaled = graph([{ nodeId: "r", baseStrength: 1.4, parentNodeId: null }, { nodeId: "p", baseStrength: 0.5, parentNodeId: "r" }],
      [arrow("p-r", "p", "r", "attack", 0.5)]);
    expect(() => engineSnapshotOf(outOfRangeUnscaled, new Map([fact("p", "CANNOT_ASSESS")]), ENGINE)).not.toThrow();
  });

  it("refuses a cannot-assess status without the cannot-assess review behind it", () => {
    expect(() => engineSnapshotOf(ONE, new Map([fact("p", "CANNOT_ASSESS", { cannotAssessReview: false })]), ENGINE))
      .toThrowError(code("ENGINE_FACTS_INVALID"));
  });

  it("refuses the standings of a point whose review was not cannot-assess", () => {
    const facts = new Map([fact("p", "AGREE")]);
    expect(() => pointInvestigationStandings({ snapshot: ONE, facts, engine: ENGINE, nodeId: "p", servableRootIds: ["r"] }))
      .toThrowError(code("ENGINE_FACTS_INVALID"));
  });

  // engineLinkedGraph already refused this (A8's ENGINE_FACTS_INVALID, tests/unit/r2-engine-links-wiring.test.ts); the
  // missing case was a caller that hands facts to the link rules directly (the standings record).
  it("refuses an own-reply id whose link is another node's, also when the facts reach the link rules directly", () => {
    const two = graph([...ONE.nodes, { nodeId: "q", baseStrength: 0.5, parentNodeId: "r" }],
      [arrow("p-r", "p", "r", "support", 0.5), arrow("q-r", "q", "r", "support", 0.5)]);
    const facts = new Map([fact("q", "AGREE", { ownReplyEdgeIds: ["p-r"] }), fact("p", "CANNOT_ASSESS")]);
    expect(() => engineSnapshotOf(two, facts, ENGINE)).toThrowError(code("ENGINE_FACTS_INVALID"));
    expect(() => pointInvestigationStandings({ snapshot: two, facts, engine: ENGINE, nodeId: "p", servableRootIds: ["r"] }))
      .toThrowError(code("ENGINE_FACTS_INVALID"));
  });
});
