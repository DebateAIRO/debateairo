import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveScoringOperator } from "@debateai/register";
import {
  evaluate,
  provenanceClusterKey,
  resolveLeverage,
  type EvaluationSnapshot,
  type OperatorResolution,
  type SnapshotArrow,
  type SnapshotNode
} from "@debateai/propagation";
import { agg, product, σ } from "@debateai/published-arithmetic";

const node = (nodeId: string, baseStrength: number | null, rest: Partial<SnapshotNode> = {}): SnapshotNode => ({
  nodeId,
  baseStrength,
  ...rest
});

const arrow = (
  arrowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  polarity: "support" | "attack",
  rest: Partial<SnapshotArrow> = {}
): SnapshotArrow => ({
  arrowId,
  sourceNodeId,
  targetKind: "NODE",
  targetNodeId,
  targetEdgeId: null,
  polarity,
  kind: polarity === "attack" ? "rebutting" : null,
  strength: 1,
  magnitudeStatus: "MEASURED",
  strengthSource: "EVIDENCE_VERIFIER",
  ...rest
});

const resolution = (
  parentNodeId: string,
  operator: "accumulate" | "strict-and" = "accumulate",
  suppliedBy: "parent" | "run" | "deployment" = "deployment"
): OperatorResolution => ({ parentNodeId, operator, suppliedBy });

const snapshot = (
  nodes: readonly SnapshotNode[],
  arrows: readonly SnapshotArrow[],
  operatorResolutions: readonly OperatorResolution[]
): EvaluationSnapshot => ({
  nodes,
  arrows,
  arrowOrder: arrows.map((item) => item.arrowId),
  operatorResolutions,
  clusterRecords: []
});

const strengths = (input: EvaluationSnapshot): Map<string, number> => new Map(
  evaluate(input).strengths.map((record) => [record.nodeId, record.strength])
);

describe("AC-80 — published DF-QuAD arithmetic", () => {
  it("FX-LV-09 publishes probabilistic aggregation, the tie-safe mediator, and strict product", () => {
    expect(agg([])).toBe(0);
    expect(agg([0.4, 0.4, 0.4])).toBeCloseTo(0.784, 12);
    expect(σ(0.37, 0.4, 0.4)).toBe(0.37);
    expect(product([0.95, 0.6, 0.35, 0.5])).toBeCloseTo(0.09975, 12);
    expect(() => product([])).toThrow("no identity");
  });

  it("FX-LV-01 reproduces literature vector 1", () => {
    const nodes = ["A", "B", "C", "D", "E", "F", "G", "H"].map((id) => node(id, 0.5));
    const arrows = [
      arrow("B-A", "B", "A", "support"),
      arrow("C-A", "C", "A", "support"),
      arrow("D-A", "D", "A", "attack"),
      arrow("E-B", "E", "B", "attack"),
      arrow("F-D", "F", "D", "attack"),
      arrow("G-F", "G", "F", "attack"),
      arrow("H-F", "H", "F", "attack")
    ];
    const output = strengths(snapshot(nodes, arrows, ["A", "B", "D", "F"].map((id) => resolution(id))));
    expect(output.get("F")).toBeCloseTo(0.125, 12);
    expect(output.get("B")).toBeCloseTo(0.25, 12);
    expect(output.get("D")).toBeCloseTo(0.4375, 12);
    expect(output.get("A")).toBeCloseTo(0.59375, 12);
    for (const id of ["C", "E", "G", "H"]) expect(output.get(id)).toBe(0.5);
  });

  it("FX-LV-02 reproduces literature vector 2", () => {
    const nodes = [node("alpha", 0.5), node("beta", 0.3), node("gamma", 0.6), node("rho", 0.7), node("zeta", 0.4)];
    const arrows = [
      arrow("beta-alpha", "beta", "alpha", "support"),
      arrow("zeta-gamma", "zeta", "gamma", "support"),
      arrow("gamma-alpha", "gamma", "alpha", "attack"),
      arrow("rho-beta", "rho", "beta", "attack")
    ];
    const output = strengths(snapshot(nodes, arrows, ["alpha", "beta", "gamma"].map((id) => resolution(id))));
    expect(output.get("zeta")).toBe(0.4);
    expect(output.get("rho")).toBe(0.7);
    expect(output.get("gamma")).toBeCloseTo(0.76, 12);
    expect(output.get("beta")).toBeCloseTo(0.09, 12);
    expect(output.get("alpha")).toBeCloseTo(0.165, 12);
  });

  it("FX-LV-03/04/05 is deterministic, attack-non-increasing, and support-non-decreasing", () => {
    fc.assert(fc.property(
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
      (tau, source, edgeStrength, existingContributions) => {
        const existingNodes = existingContributions.map((value, index) => node(`existing:${index}`, value));
        const nodes = [node("root", tau), node("source", source), ...existingNodes];
        const existingSupport = existingNodes.map((item, index) => arrow(`existing-support:${index}`, item.nodeId, "root", "support"));
        const existingAttack = existingNodes.map((item, index) => arrow(`existing-attack:${index}`, item.nodeId, "root", "attack"));
        const supportBaseline = snapshot(nodes, existingSupport, existingSupport.length === 0 ? [] : [resolution("root")]);
        const attackBaseline = snapshot(nodes, existingAttack, existingAttack.length === 0 ? [] : [resolution("root")]);
        const supportAdded = snapshot(nodes, [...existingSupport, arrow("added-support", "source", "root", "support", { strength: edgeStrength })], [resolution("root")]);
        const attackAdded = snapshot(nodes, [...existingAttack, arrow("added-attack", "source", "root", "attack", { strength: edgeStrength })], [resolution("root")]);
        expect(evaluate(supportAdded)).toEqual(evaluate(supportAdded));
        expect(strengths(supportAdded).get("root")!).toBeGreaterThanOrEqual(strengths(supportBaseline).get("root")!);
        expect(strengths(attackAdded).get("root")!).toBeLessThanOrEqual(strengths(attackBaseline).get("root")!);
      }
    ), { seed: 20260808 });
  });

  it("FX-LV-06 returns an empty result for an empty graph and tau for an isolated node", () => {
    expect(evaluate(snapshot([], [], [])).strengths).toEqual([]);
    expect(strengths(snapshot([node("isolated", 0.43)], [], [])).get("isolated")).toBe(0.43);
  });

  it("FX-LV-07/08 is strict away from the six ruled exclusions", () => {
    fc.assert(fc.property(
      fc.double({ min: 0.01, max: 0.99, noNaN: true }),
      fc.double({ min: 0.01, max: 0.99, noNaN: true }),
      fc.double({ min: 0.01, max: 0.99, noNaN: true }),
      (tau, source, edgeStrength) => {
        const nodes = [node("root", tau), node("source", source)];
        const baseline = strengths(snapshot(nodes, [], [])).get("root")!;
        const supported = strengths(snapshot(nodes, [arrow("support", "source", "root", "support", { strength: edgeStrength })], [resolution("root")])).get("root")!;
        const attacked = strengths(snapshot(nodes, [arrow("attack", "source", "root", "attack", { strength: edgeStrength })], [resolution("root")])).get("root")!;
        expect(supported).toBeGreaterThan(baseline);
        expect(attacked).toBeLessThan(baseline);
      }
    ), { seed: 20260808 });
  });
});

describe("S03 ruled graph behavior", () => {
  it("FX-PT-D1 excludes arbitrary unjudged subsets and accumulates judged children alone", () => {
    fc.assert(fc.property(
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.array(fc.record({
        tau: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
        abstained: fc.boolean()
      }), { minLength: 1, maxLength: 8 }),
      (rootTau, childFacts) => {
        const children = childFacts.map((facts, index) => node(`child:${index}`, facts.tau, {
          parentNodeId: "root",
          abstained: facts.abstained
        }));
        const arrows = children.map((child, index) => arrow(`edge:${index}`, child.nodeId, "root", "support"));
        const complete = evaluate(snapshot([node("root", rootTau), ...children], arrows, [resolution("root")]));
        const judgedIds = new Set(children
          .filter((child) => child.baseStrength !== null && child.abstained !== true)
          .map((child) => child.nodeId));
        const judgedOnly = evaluate(snapshot(
          [node("root", rootTau), ...children.filter((child) => judgedIds.has(child.nodeId))],
          arrows.filter((item) => judgedIds.has(item.sourceNodeId)),
          judgedIds.size === 0 ? [] : [resolution("root")]
        ));
        const completeIds = new Set(complete.strengths.map((record) => record.nodeId));
        for (const child of children) {
          if (child.baseStrength === null || child.abstained === true) expect(completeIds.has(child.nodeId)).toBe(false);
        }
        expect(complete.strengths.find((record) => record.nodeId === "root")?.strength)
          .toBe(judgedOnly.strengths.find((record) => record.nodeId === "root")?.strength);
      }
    ), { seed: 20260808 });
  });

  it("P13 consumes recorded arrow order in the IEEE-754 aggregation fold", () => {
    const nodes = [node("root", 0), node("tiny-a", 1e-16), node("tiny-b", 1e-16), node("large", 0.3)];
    const arrows = [
      arrow("tiny-a-root", "tiny-a", "root", "support"),
      arrow("tiny-b-root", "tiny-b", "root", "support"),
      arrow("large-root", "large", "root", "support")
    ];
    const forward = snapshot(nodes, arrows, [resolution("root")]);
    const reverse: EvaluationSnapshot = { ...forward, arrowOrder: [...forward.arrowOrder].reverse() };
    const forwardRoot = evaluate(forward).strengths.find((record) => record.nodeId === "root")!.strength;
    const reverseRoot = evaluate(reverse).strengths.find((record) => record.nodeId === "root")!.strength;
    expect(forwardRoot).toBe(agg([1e-16, 1e-16, 0.3]));
    expect(reverseRoot).toBe(agg([0.3, 1e-16, 1e-16]));
    expect(Object.is(forwardRoot, reverseRoot)).toBe(false);

    const renamed: EvaluationSnapshot = {
      ...forward,
      arrows: forward.arrows.map((item, index) => ({ ...item, arrowId: `opaque:${index}` })),
      arrowOrder: forward.arrowOrder.map((_, index) => `opaque:${index}`)
    };
    const renamedRoot = evaluate(renamed).strengths.find((record) => record.nodeId === "root")!.strength;
    expect(Object.is(renamedRoot, forwardRoot)).toBe(true);
  });

  it("P13 folds a collapsed cluster at its recorded surviving-member index", () => {
    const clusterKey = {
      evidenceProvenanceRef: "evidence:recorded-order",
      producingRunId: "run:recorded-order",
      modelFamily: "family:recorded-order"
    };
    const nodes = [
      node("root", 0),
      node("absorbed", 0.1),
      node("tiny-a", 1e-16),
      node("tiny-b", 1e-16),
      node("survivor", 0.3)
    ];
    const arrows = [
      arrow("cluster-absorbed", "absorbed", "root", "support", { clusterKey }),
      arrow("tiny-a-root", "tiny-a", "root", "support"),
      arrow("tiny-b-root", "tiny-b", "root", "support"),
      arrow("cluster-survivor", "survivor", "root", "support", { clusterKey })
    ];

    const root = evaluate(snapshot(nodes, arrows, [resolution("root")])).strengths
      .find((record) => record.nodeId === "root")!.strength;

    expect(root).toBe(agg([1e-16, 1e-16, 0.3]));
    expect(Object.is(root, agg([0.3, 1e-16, 1e-16]))).toBe(false);
  });

  it("FX-HR-H4 computes the same tree under both operators and records a rival reading", () => {
    const nodes = [node("root", 0.5), ...["a", "b", "c", "d"].map((id) => node(id, 0.5))];
    const arrows = ["a", "b", "c", "d"].map((id) => arrow(`${id}-root`, id, "root", "support"));
    const accumulate = evaluate(snapshot(nodes, arrows, [resolution("root", "accumulate", "run")]));
    const strict = evaluate(snapshot(nodes, arrows, [resolution("root", "strict-and", "parent")]));
    expect(accumulate.strengths.find((item) => item.nodeId === "root")).toMatchObject({
      strength: 0.96875,
      operatorUsed: "accumulate",
      operatorLevel: "run",
      rivalOperator: "strict-and",
      rivalStrength: 0.53125
    });
    expect(strict.strengths.find((item) => item.nodeId === "root")).toMatchObject({
      strength: 0.53125,
      operatorUsed: "strict-and",
      operatorLevel: "parent",
      rivalOperator: "accumulate",
      rivalStrength: 0.96875
    });
  });

  it("FX-PT-D2 resolves operator rows parent then run then mandatory deployment", () => {
    expect(resolveScoringOperator({
      parent: { scoringOperator: "strict-and" as const },
      run: { scoringOperator: "accumulate" as const },
      deployment: { scoringOperator: "accumulate" as const }
    })).toEqual({ value: "strict-and", suppliedBy: "parent" });
    expect(resolveScoringOperator({
      parent: {}, run: {}, deployment: { scoringOperator: "accumulate" as const }
    })).toEqual({ value: "accumulate", suppliedBy: "deployment" });
    expect(() => resolveScoringOperator({ parent: {}, run: {}, deployment: {} })).toThrow("Mandatory deployment register row");
  });

  it("FX-PT-D3 collapses shared provenance on both polarities and keeps keyless arrows singleton", () => {
    const key = { evidenceProvenanceRef: "evidence:1", producingRunId: "run:1", modelFamily: "family:1" };
    expect(provenanceClusterKey(key)).toContain("evidence:1");
    const nodes = [
      node("root", 0.5), node("s1", 0.4), node("s2", 0.4), node("s3", 0.4),
      node("a1", 0.3), node("a2", 0.1), node("keyless", 0.2)
    ];
    const output = evaluate(snapshot(nodes, [
      arrow("s1-root", "s1", "root", "support", { clusterKey: key }),
      arrow("s2-root", "s2", "root", "support", { clusterKey: key }),
      arrow("s3-root", "s3", "root", "support", { clusterKey: key }),
      arrow("a1-root", "a1", "root", "attack", { clusterKey: key }),
      arrow("a2-root", "a2", "root", "attack", { clusterKey: key }),
      arrow("keyless-root", "keyless", "root", "attack")
    ], [resolution("root")]));
    expect(output.clusterRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({ polarity: "support", absorbedEdgeIds: ["s2-root", "s3-root"], survivingMember: "s1-root" }),
      expect.objectContaining({ polarity: "attack", absorbedEdgeIds: ["a2-root"], survivingMember: "a1-root" }),
      expect.objectContaining({ polarity: "attack", absorbedEdgeIds: [], survivingMember: "keyless-root", key: null })
    ]));
    expect(output.strengths.find((item) => item.nodeId === "root")?.strength).toBeCloseTo(0.48, 12);
  });

  it("selects the strongest propagated member, not the strongest arrow literal", () => {
    const key = { evidenceProvenanceRef: "evidence:2", producingRunId: "run:2", modelFamily: "family:2" };
    const output = evaluate(snapshot([
      node("root", 0.5), node("weak", 0.2), node("strong", 0.9)
    ], [
      arrow("weak-root", "weak", "root", "support", { strength: 1, clusterKey: key }),
      arrow("strong-root", "strong", "root", "support", { strength: 0.8, clusterKey: key })
    ], [resolution("root")]));
    expect(output.clusterRecords).toEqual([
      expect.objectContaining({ survivingMember: "strong-root", absorbedEdgeIds: ["weak-root"] })
    ]);
    expect(output.strengths.find((item) => item.nodeId === "root")?.strength).toBeCloseTo(0.86, 12);
  });

  it("DR-072 applies folder lift before judged-ancestor lift with markers at both ends", () => {
    const output = evaluate(snapshot([
      node("root", 0.5),
      node("pending", null, { parentNodeId: "root", generationStatus: "pending" }),
      node("folder", null, { parentNodeId: "pending", isFolder: true }),
      node("child", 0.5, { parentNodeId: "folder" })
    ], [arrow("child-folder", "child", "folder", "support")], [resolution("root")]));
    expect(output.unjudgedNodeIds).toEqual(["pending", "folder"]);
    expect(output.liftRecords.map((record) => record.liftKind)).toEqual(["FOLDER", "JUDGED_ANCESTOR"]);
    expect(output.liftRecords.every((record) => record.markerAtSource && record.markerAtTarget)).toBe(true);
    expect(output.strengths.find((item) => item.nodeId === "root")?.strength).toBe(0.75);
  });

  it("OD-02 treats an abstained interior node as transparent even when it carries an old tau", () => {
    const output = evaluate(snapshot([
      node("root", 0.5),
      node("abstained", 0.8, { parentNodeId: "root", abstained: true }),
      node("child", 0.5, { parentNodeId: "abstained" })
    ], [arrow("child-abstained", "child", "abstained", "support")], [resolution("root")]));
    expect(output.unjudgedNodeIds).toContain("abstained");
    expect(output.strengths.some((record) => record.nodeId === "abstained")).toBe(false);
    expect(output.liftRecords).toEqual([
      expect.objectContaining({ liftKind: "JUDGED_ANCESTOR", liftTargetNodeId: "root" })
    ]);
    expect(output.strengths.find((record) => record.nodeId === "root")?.strength).toBe(0.75);
  });

  it("AC-26 withholds strict-and when a conjunct is unjudged and does not fabricate tau", () => {
    const output = evaluate(snapshot([
      node("root", 0.5),
      node("pending", null)
    ], [arrow("pending-root", "pending", "root", "support")], [resolution("root", "strict-and")]));
    expect(output.unjudgedNodeIds).toEqual(["pending"]);
    expect(output.withheld).toEqual([{ nodeId: "root", reason: "STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED" }]);
    expect(output.strengths.some((item) => item.nodeId === "root")).toBe(false);
  });

  it("DR-071 / DR-127 subtracts the undercut reduction with zero clamp and serves 0.75", () => {
    const support = arrow("support", "source", "root", "support", { strength: 0.8 });
    const undercut: SnapshotArrow = {
      ...arrow("undercut", "root", "root", "attack"),
      targetKind: "EDGE",
      targetNodeId: null,
      targetEdgeId: "support",
      kind: "undercutting",
      strength: 0.3,
      strengthSource: "UNDERCUT_TRANSMISSION"
    };
    const output = evaluate(snapshot([node("root", 0.5), node("source", 1)], [support, undercut], [resolution("root")]));
    expect(output.transmissionReductions).toEqual([{ targetEdgeId: "support", undercutEdgeId: "undercut", reduction: 0.3, magnitudeStatus: "MEASURED" }]);
    expect(output.strengths.find((item) => item.nodeId === "root")?.strength).toBe(0.75);
  });

  it("FX-PT-FLG/POS fingerprints semantic inputs independent of input order and carries position without arithmetic", () => {
    const left = snapshot([
      node("root", 0.5, { positionLabel: "opposes" }), node("source", 0.4)
    ], [arrow("support", "source", "root", "support")], [resolution("root")]);
    const right: EvaluationSnapshot = { ...left, nodes: [...left.nodes].reverse(), arrows: [...left.arrows].reverse() };
    const leftResult = evaluate(left);
    const rightResult = evaluate(right);
    const flagged = evaluate({ ...left, semanticRestatementFlag: true } as EvaluationSnapshot & { readonly semanticRestatementFlag: true });
    const relabeled = evaluate({ ...left, nodes: [node("root", 0.5, { positionLabel: "supports" }), node("source", 0.4)] });
    expect(leftResult.graphFingerprintMaterial).toBe(rightResult.graphFingerprintMaterial);
    expect(flagged.strengths).toEqual(leftResult.strengths);
    expect(leftResult.strengths.find((item) => item.nodeId === "root")?.positionLabel).toBe("opposes");
    expect(leftResult.strengths.find((item) => item.nodeId === "root")?.strength).toBeCloseTo(0.7, 12);
    expect(relabeled.strengths.find((item) => item.nodeId === "root")?.strength).toBeCloseTo(0.7, 12);
    expect(evaluate({ ...left, nodes: [node("root", 0.6, { positionLabel: "opposes" }), node("source", 0.4)] }).graphFingerprintMaterial)
      .not.toBe(leftResult.graphFingerprintMaterial);
    expect(evaluate({ ...left, operatorResolutions: [resolution("root", "strict-and")] }).graphFingerprintMaterial)
      .not.toBe(leftResult.graphFingerprintMaterial);
  });

  it("FX-C52-09 names the carrying piece after K=1", () => {
    expect(resolveLeverage({ completedRounds: 1, carryingNodeId: "node:carrying" })).toEqual({
      kind: "LEVERAGE_UNRESOLVED",
      carryingNodeId: "node:carrying"
    });
  });

  it("AC-29 reports removal-based leverage and fragility without feeding either back", () => {
    const input = snapshot([
      node("root", 0.5), node("strong", 0.8), node("weak", 0.2)
    ], [
      arrow("strong-root", "strong", "root", "support"),
      arrow("weak-root", "weak", "root", "support")
    ], [resolution("root")]);
    const output = evaluate(input);
    const strong = output.sensitivityRecords.find((record) => record.removedNodeId === "strong")!;
    const weak = output.sensitivityRecords.find((record) => record.removedNodeId === "weak")!;
    expect(strong.leverage).toBeGreaterThan(weak.leverage);
    const rootFragility = strong.fragility.find((row) => row.nodeId === "root")!;
    expect(rootFragility.before).toBeCloseTo(0.92, 12);
    expect(rootFragility.after).toBeCloseTo(0.6, 12);
    expect(rootFragility.difference).toBeCloseTo(0.32, 12);
    expect(evaluate(input).strengths).toEqual(output.strengths);
  });
});
