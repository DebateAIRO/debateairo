// PROBE B (codex r3 B1) — the same forbidden pair reached through a bind alias
// and a computed property access. Both defeat any token- or regex-based rule.
// After the r4 seal neither name exists on the type, so this must FAIL TO COMPILE.
import type { GraphRepository } from "@debateai/graph";
import type { JudgementRepository } from "@debateai/judgement";

export async function halfWriteByAlias(
  judgements: JudgementRepository,
  graph: GraphRepository,
  runId: string,
  nodeId: string,
  artifactRef: string,
  edgeId: string
): Promise<void> {
  const persistReview = judgements.recordNodeReview.bind(judgements);
  await persistReview({
    runId, nodeId,
    authorRawArtifactRef: artifactRef,
    reviewRawArtifactRef: artifactRef,
    outcome: "agree",
    reasons: ["the review commits alone"]
  });
  const computed = judgements["recordNodeReview"];
  void computed;
  await graph.withGraphWrite(runId, async (writer) => {
    const measure = writer["recordEdgeMeasurements"];
    await measure.call(writer, { runId, measurements: [{ edgeId, bearing: 0.75 }] });
  });
}
