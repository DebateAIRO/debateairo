import type { Pool } from "@debateai/db";
import { withRunContentLease, withWriteTransaction } from "@debateai/db";
import { recordEdgeMeasurementsOnClient } from "@debateai/graph";
import { JudgementRepository, insertPreparedNodeReview, type RecordNodeReviewInput } from "@debateai/judgement";

/**
 * TEST-LAYER ONLY. T5 r4 (codex r3 B1).
 *
 * Production has no self-transacting review writer and no self-transacting
 * measurement writer: `JudgementRepository.recordNodeReview` and
 * `GraphWriter.recordEdgeMeasurements` were REMOVED so the irreversible
 * review-then-measure half-write cannot be expressed, however it is spelled.
 * `apps/runner`'s `recordReviewWithMeasurements` is the only path that writes a
 * review, and it writes the bearings in the same transaction.
 *
 * These helpers rebuild the unsafe single-fact writes for two legitimate
 * test-layer needs only:
 *   1. fixtures that must reach a state directly (measure an edge, seed a
 *      review for a node with no edges in play), and
 *   2. the committed demonstration of WHY the seal exists, which has to perform
 *      the forbidden sequence to show what it strands.
 *
 * Nothing under `apps/` or `packages/` may import this file, and nothing can:
 * `tests/` is outside the package dependency graph the architecture audit
 * enforces.
 */

/** Writes a node review AND NOTHING ELSE — irreversible; never do this in production. */
export async function recordNodeReviewAlone(pool: Pool, input: RecordNodeReviewInput): Promise<string> {
  const judgements = new JudgementRepository(pool);
  return withRunContentLease(pool, [input.runId], async () => {
    const prepared = await judgements.prepareNodeReview(input);
    return withWriteTransaction(pool, (client) => insertPreparedNodeReview(client, prepared));
  });
}

/** Applies edge magnitudes in their own transaction — safe alone, since no review is involved. */
export async function measureEdgesAlone(
  pool: Pool,
  runId: string,
  measurements: readonly { readonly edgeId: string; readonly bearing: number | null }[]
): Promise<readonly string[]> {
  return withWriteTransaction(pool, (client) => recordEdgeMeasurementsOnClient(client, runId, measurements));
}
