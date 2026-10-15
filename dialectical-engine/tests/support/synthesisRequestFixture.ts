import { buildSynthesisDigest, buildSynthesizerRequest, type SynthesizerRequest } from "@debateai/serve";

/** The smallest answer-writer request (one position node, round 1, no prior objection), as the A17 tests build it. */
export function synthesisRequestFixture(): SynthesizerRequest {
  const outcome = buildSynthesisDigest({
    nodes: [{
      nodeId: "position:a", statement: "The proposal holds on cost.", finalStrength: 0.61,
      wayOfKnowing: "REASONING", marks: [], polarityRelations: [], isPosition: true, isSurvivingObjection: false
    }],
    servedRootNodeId: "position:a",
    budgetBound: 8_192
  });
  if (outcome.kind !== "DIGEST") throw new Error("the synthesis request fixture's digest must exist");
  return buildSynthesizerRequest({
    controls: { synthesizerRoleRef: "provider:w", evaluatorRoleRef: "provider:c", evaluatorLoopMaxRounds: 3 },
    round: 1,
    digest: outcome.digest,
    codeLabel: { verdictLabel: "CONTESTED", servedNodeId: "position:a", servedStrength: 0.61, margin: 0.12, registerVersion: 5 },
    prior: null
  });
}
