import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAcceptanceArguments, runAcceptanceCeremony } from "./run-acceptance.js";

/** XREV-01's single authorized real depth-1, M=2 proof. */
const dataDirectory = await mkdtemp(join(tmpdir(), "debateai-xrev01-depth1-"));
let ceremony: Awaited<ReturnType<typeof runAcceptanceCeremony>> | undefined;
try {
  ceremony = await runAcceptanceCeremony(
    parseAcceptanceArguments([
      "--token", "xrev01-depth1-local",
      "--agent-count", "2",
      "--depth-params", '{"depth":1}',
      "--question", "Should a software company adopt a four-day workweek?"
    ]),
    process.env,
    { databaseDataDirectory: dataDirectory }
  );
  const authored = ceremony.nodeMakerLineage;
  const reviews = ceremony.nodeReviewLineage;
  if (authored.length !== 8 || reviews.length !== authored.length) {
    throw new Error(`XREV01_REVIEW_COVERAGE_UNPROVEN:${JSON.stringify({ authored, reviews })}`);
  }
  if (reviews.some((review) => review.authorMaker === review.reviewerMaker)) {
    throw new Error(`XREV01_DIFFERENT_MAKER_UNPROVEN:${JSON.stringify(reviews)}`);
  }
  if (ceremony.modelCallCount > 42) {
    throw new Error(`XREV01_RATIFIED_ENVELOPE_EXCEEDED:${ceremony.modelCallCount}`);
  }
  console.info(
    `XREV-01 DEPTH-1 PROOF: ${ceremony.runId} ${ceremony.answerId} ` +
    `${authored.length}/${reviews.length} authored/reviewed nodes ` +
    `${ceremony.modelCallCount}/42 model calls`
  );
  console.info(`XREV-01 REVIEW LINEAGE: ${JSON.stringify(reviews)}`);
} finally {
  await ceremony?.close();
  await rm(dataDirectory, { recursive: true, force: true });
}
