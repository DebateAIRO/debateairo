import { describe, expect, it } from "vitest";
import { evaluateFairDebate, type FairDebateEvidence } from "./fair-debate.js";

/**
 * FAIR-01 (DR-140(b), DR-143 clause 1): the more-than-one-node,
 * more-than-one-maker requirement is RUN-LEVEL fair-debate law, enforced on
 * the real acceptance debate by this gate — never a deployment floor.
 */

const fairEvidence: FairDebateEvidence = {
  nodes: [
    {
      nodeId: "node:position",
      childKind: null,
      provenanceRef: "artifact:position",
      maker: "OpenAI",
      modelId: "gpt-5.6-sol"
    },
    {
      nodeId: "node:counter",
      childKind: "defeater",
      provenanceRef: "artifact:counter",
      maker: "Anthropic",
      modelId: "claude-fable-5"
    }
  ],
  attackEdges: [
    { edgeId: "edge:counter-attacks-position", sourceNodeId: "node:counter", targetNodeId: "node:position" }
  ]
};

describe("FAIR-01 / DR-140(b) — the fair-debate gate (pure core)", () => {
  it("passes a two-node two-maker debate joined by a cross-maker attack edge", () => {
    expect(evaluateFairDebate(fairEvidence)).toEqual({
      nodeCount: 2,
      attackEdgeCount: 1,
      distinctMakers: ["Anthropic", "OpenAI"],
      independentAttackEdgeCount: 1
    });
  });

  it("refuses a single-node graph — V's words: more than one node to be fair", () => {
    expect(() => evaluateFairDebate({
      nodes: [fairEvidence.nodes[0]!],
      attackEdges: []
    })).toThrow(expect.objectContaining({ code: "FAIR_DEBATE_NODE_COUNT_UNSATISFIED" }));
  });

  it("refuses a mono-maker two-node graph — more than one model maker is run-level law here", () => {
    expect(() => evaluateFairDebate({
      ...fairEvidence,
      nodes: fairEvidence.nodes.map((node) => ({ ...node, maker: "OpenAI", modelId: "gpt-5.6-sol" }))
    })).toThrow(expect.objectContaining({ code: "FAIR_DEBATE_MAKER_COUNT_UNSATISFIED" }));
  });

  it("refuses a node without persisted artifact lineage instead of guessing its maker", () => {
    expect(() => evaluateFairDebate({
      ...fairEvidence,
      nodes: [
        fairEvidence.nodes[0]!,
        { ...fairEvidence.nodes[1]!, maker: null, modelId: null }
      ]
    })).toThrow(expect.objectContaining({ code: "FAIR_DEBATE_LINEAGE_MISSING" }));
  });

  it("refuses a floating counter node with no attack edge between graph nodes", () => {
    expect(() => evaluateFairDebate({
      ...fairEvidence,
      attackEdges: []
    })).toThrow(expect.objectContaining({ code: "FAIR_DEBATE_COUNTER_EDGE_MISSING" }));
    expect(() => evaluateFairDebate({
      ...fairEvidence,
      attackEdges: [{ edgeId: "edge:foreign", sourceNodeId: "node:counter", targetNodeId: "node:unknown" }]
    })).toThrow(expect.objectContaining({ code: "FAIR_DEBATE_COUNTER_EDGE_MISSING" }));
  });

  it("refuses a debate whose only attack edges join same-maker nodes — the counter must be another maker's", () => {
    expect(() => evaluateFairDebate({
      nodes: [
        ...fairEvidence.nodes,
        {
          nodeId: "node:self-attack",
          childKind: "attack",
          provenanceRef: "artifact:self-attack",
          maker: "OpenAI",
          modelId: "gpt-5.6-sol"
        }
      ],
      // The only in-graph attack joins two OpenAI nodes; the Anthropic node
      // floats without attacking — makers differ, yet no cross-maker attack.
      attackEdges: [
        { edgeId: "edge:same-maker", sourceNodeId: "node:self-attack", targetNodeId: "node:position" }
      ]
    })).toThrow(expect.objectContaining({ code: "FAIR_DEBATE_COUNTER_NOT_INDEPENDENT" }));
  });
});
