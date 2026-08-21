import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { deriveTransmissionReductions, evaluate } from "@debateai/propagation";

describe("FX-HR-H3 — pure propagation", () => {
  it("propagates a one-node immutable snapshot without effects", () => {
    const snapshot = Object.freeze({
      nodes: Object.freeze([{ nodeId: "node:test", baseStrength: 0.61 }]),
      arrows: Object.freeze([]),
      arrowOrder: Object.freeze([]),
      operatorResolutions: Object.freeze([]),
      clusterRecords: Object.freeze([])
    });
    const before = structuredClone(snapshot);
    const result = evaluate(snapshot);
    expect(result.strengths).toHaveLength(1);
    expect(result.strengths[0]).toMatchObject({ nodeId: "node:test", strength: 0.61 });
    expect(snapshot).toEqual(before);
  });

  it("is deterministic for finite one-node strengths on a pinned property seed", () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (strength) => {
      const snapshot = {
        nodes: [{ nodeId: "node:property", baseStrength: strength }],
        arrows: [],
        arrowOrder: [],
        operatorResolutions: [],
        clusterRecords: []
      } as const;
      expect(evaluate(snapshot)).toEqual(evaluate(snapshot));
    }), { seed: 20260807 });
  });
});

describe("S02 graph law in the pure core", () => {
  const nodes = Object.freeze([
    { nodeId: "node:a", baseStrength: 0.8 },
    { nodeId: "node:b", baseStrength: 0.7 }
  ]);

  it("FX-C52-10 layer 3 raises a typed error when a cycle reaches compute", () => {
    expect(() => evaluate({
      nodes,
      arrows: [
        { arrowId: "edge:a-b", sourceNodeId: "node:a", targetKind: "NODE", targetNodeId: "node:b", targetEdgeId: null, polarity: "support", kind: null, strength: 0.4, magnitudeStatus: "MEASURED", strengthSource: "EVIDENCE_VERIFIER" },
        { arrowId: "edge:b-a", sourceNodeId: "node:b", targetKind: "NODE", targetNodeId: "node:a", targetEdgeId: null, polarity: "attack", kind: "rebutting", strength: 0.2, magnitudeStatus: "MEASURED", strengthSource: "EVIDENCE_VERIFIER" }
      ],
      arrowOrder: ["edge:a-b", "edge:b-a"],
      operatorResolutions: [],
      clusterRecords: []
    })).toThrowError(expect.objectContaining({ code: "GRAPH_CYCLE_DETECTED" }));
  });

  it("DR-071 derives a typed per-edge transmission reduction from a real undercut", () => {
    const transmissionReductions = deriveTransmissionReductions({
      nodes,
      arrows: [
        { arrowId: "edge:support", sourceNodeId: "node:a", targetKind: "NODE", targetNodeId: "node:b", targetEdgeId: null, polarity: "support", kind: null, strength: 0.6, magnitudeStatus: "MEASURED", strengthSource: "EVIDENCE_VERIFIER" },
        { arrowId: "edge:undercut", sourceNodeId: "node:b", targetKind: "EDGE", targetNodeId: null, targetEdgeId: "edge:support", polarity: "attack", kind: "undercutting", strength: 0.25, magnitudeStatus: "MEASURED", strengthSource: "UNDERCUT_TRANSMISSION" }
      ],
      arrowOrder: ["edge:support", "edge:undercut"],
      operatorResolutions: [],
      clusterRecords: []
    });

    expect(transmissionReductions).toEqual([{
      targetEdgeId: "edge:support",
      undercutEdgeId: "edge:undercut",
      reduction: 0.25,
      magnitudeStatus: "MEASURED"
    }]);
  });
});
