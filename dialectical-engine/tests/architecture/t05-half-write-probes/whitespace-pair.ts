// PROBE A (codex r3 B1, the reviewer's own evasion) — the forbidden sequential
// pair written with legal whitespace before the call parenthesis. This is valid
// JavaScript and the retired regex pin `/\brecordNodeReview\(/` does not match
// it, which is precisely why the pin was not a law. After the r4 seal there is
// no self-transacting review writer to reach, so this must FAIL TO COMPILE.
import type { GraphRepository } from "@debateai/graph";
import type { JudgementRepository } from "@debateai/judgement";

export async function halfWriteByWhitespace(
  judgements: JudgementRepository,
  graph: GraphRepository,
  runId: string,
  nodeId: string,
  artifactRef: string,
  edgeId: string
): Promise<void> {
  await judgements.recordNodeReview ({
    runId, nodeId,
    authorRawArtifactRef: artifactRef,
    reviewRawArtifactRef: artifactRef,
    outcome: "agree",
    reasons: ["the review commits alone"]
  });
  await graph.withGraphWrite(runId, (writer) => writer.recordEdgeMeasurements({
    runId, measurements: [{ edgeId, bearing: 0.75 }]
  }));
}
