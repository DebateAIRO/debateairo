import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAcceptanceArguments, runAcceptanceCeremony } from "./run-acceptance.js";

/** XREV-01's single authorized real depth-1 proof over the discovered panel. */
const dataDirectory = await mkdtemp(join(tmpdir(), "debateai-xrev01-depth1-"));
let ceremony: Awaited<ReturnType<typeof runAcceptanceCeremony>> | undefined;
try {
  ceremony = await runAcceptanceCeremony(
    // F-CREDENTIAL-ON-ARGV: the credential is read from ACCEPTANCE_SERVICE_CREDENTIAL
    // in the environment of whoever runs this proof, never from the command line.
    parseAcceptanceArguments([
      "--depth-params", '{"depth":1}',
      "--question", "Should a software company adopt a four-day workweek?"
    ]),
    process.env,
    { databaseDataDirectory: dataDirectory }
  );
  const authored = ceremony.nodeMakerLineage;
  const reviews = ceremony.nodeReviewLineage;
  if (authored.length < ceremony.discoveredPanelSize || reviews.length !== authored.length) {
    throw new Error(`XREV01_REVIEW_COVERAGE_UNPROVEN:${JSON.stringify({ authored, reviews })}`);
  }
  if (reviews.some((review) => review.authorMaker === review.reviewerMaker)) {
    throw new Error(`XREV01_DIFFERENT_MAKER_UNPROVEN:${JSON.stringify(reviews)}`);
  }
  if (ceremony.modelCallCount > ceremony.structuralCeilingMaxModelAttempts) {
    throw new Error(
      `XREV01_STRUCTURAL_CEILING_EXCEEDED:${ceremony.modelCallCount}/${ceremony.structuralCeilingMaxModelAttempts}`
    );
  }
  /**
   * T17 (goal 285-295 DoD; Global DoD "envelope WITHIN at terminal"). Both
   * halves are read from the SAME run's ledger as the count above: the
   * observed MODEL_CALL attempts (panel calls included — they are ledgered in
   * the `PANEL:` call-site namespace like every other provider call) and the
   * terminal ENVELOPE_STATE. A run that stayed under a DR-184-v3 ceiling and
   * still ended EXHAUSTED would mean the ceiling and the consumption meter
   * disagree, which is the defect this assertion exists to catch.
   */
  if (ceremony.terminalEnvelopeState !== "WITHIN") {
    throw new Error(
      `XREV01_ENVELOPE_NOT_WITHIN_AT_TERMINAL:${ceremony.terminalEnvelopeState}:` +
      `${ceremony.modelCallCount}/${ceremony.structuralCeilingMaxModelAttempts}`
    );
  }
  console.info(
    `XREV-01 DEPTH-1 PROOF: ${ceremony.runId} ${ceremony.answerId} ` +
    `${authored.length}/${reviews.length} authored/reviewed nodes ` +
    `${ceremony.modelCallCount}/${ceremony.structuralCeilingMaxModelAttempts} model calls ` +
    `envelope ${ceremony.terminalEnvelopeState} at terminal ` +
    `${ceremony.providerProbeEvidenceCount} probe evidence rows`
  );
  console.info(`XREV-01 REVIEW LINEAGE: ${JSON.stringify(reviews)}`);
} finally {
  await ceremony?.close();
  await rm(dataDirectory, { recursive: true, force: true });
}
