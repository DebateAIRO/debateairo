import { describe, expect, it } from "vitest";
import { constructEdge } from "@debateai/graph";

const support = (edgeId: string, sourceNodeId: string, targetNodeId: string) => ({
  edgeId,
  sourceNodeId,
  targetKind: "NODE" as const,
  targetNodeId,
  targetEdgeId: null,
  polarity: "support" as const,
  kind: null
});

describe("FX-C52-10 layer 1 — construction refusal and redirect", () => {
  it("refuses a cycle-closing edge and returns the ruled shared-crux redirect", () => {
    const result = constructEdge({
      existingEdges: [support("edge:a-b", "node:a", "node:b")],
      proposedEdge: support("edge:b-a", "node:b", "node:a")
    });

    expect(result).toEqual({
      kind: "CYCLE_REFUSED",
      code: "CIRCULAR_DEPENDENCY_FOUND",
      redirect: {
        childKind: "shared-crux sub-claim",
        sourceNodeId: "node:b",
        targetNodeId: "node:a"
      }
    });
  });

  it("accepts an edge to a non-parent node when it closes no cycle", () => {
    const proposedEdge = support("edge:a-c", "node:a", "node:c");
    expect(constructEdge({
      existingEdges: [support("edge:a-b", "node:a", "node:b")],
      proposedEdge
    })).toEqual({ kind: "ACCEPTED", edge: proposedEdge });
  });
});
