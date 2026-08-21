import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAcceptanceArguments, runAcceptanceCeremony } from "./run-acceptance.js";

/** PANEL-01's single authorized live depth-1 proof over the discovered panel. */
const dataDirectory = await mkdtemp(join(tmpdir(), "debateai-panel01-depth1-"));
let ceremony: Awaited<ReturnType<typeof runAcceptanceCeremony>> | undefined;
try {
  ceremony = await runAcceptanceCeremony(
    parseAcceptanceArguments([
      "--token", "panel01-depth1-local",
      "--depth-params", '{"depth":1}',
      "--question", "Should a software company adopt a four-day workweek?"
    ]),
    process.env,
    { databaseDataDirectory: dataDirectory }
  );
  const rootLineage = ceremony.nodeMakerLineage.filter((node) => node.depth === 0);
  const rootMakers = [...new Set(rootLineage.map((node) => node.maker))];
  if (rootLineage.length !== ceremony.discoveredPanelSize || rootMakers.length !== ceremony.discoveredPanelSize) {
    throw new Error(`PANEL01_ROOT_AUTHORSHIP_UNPROVEN:${JSON.stringify(rootLineage)}`);
  }
  if (ceremony.fairDebate.attackEdgeCount < 4 || ceremony.fairDebate.independentAttackEdgeCount < 4) {
    throw new Error(`PANEL01_CROSS_ROOT_EDGES_UNPROVEN:${JSON.stringify(ceremony.fairDebate)}`);
  }
  if (ceremony.modelCallCount > ceremony.structuralCeilingMaxModelAttempts) {
    throw new Error(
      `PANEL01_STRUCTURAL_CEILING_EXCEEDED:${ceremony.modelCallCount}/${ceremony.structuralCeilingMaxModelAttempts}`
    );
  }
  console.info(
    `PANEL-01 DEPTH-1 PROOF: ${ceremony.runId} ${ceremony.answerId} ` +
    `${rootLineage.length} roots ${ceremony.fairDebate.nodeCount} nodes ` +
    `${ceremony.fairDebate.attackEdgeCount} attack edges ` +
    `${ceremony.modelCallCount}/${ceremony.structuralCeilingMaxModelAttempts} model calls ` +
    `${ceremony.providerProbeEvidenceCount} probe evidence rows`
  );
} finally {
  await ceremony?.close();
  await rm(dataDirectory, { recursive: true, force: true });
}
