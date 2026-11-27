import type { PostgresPublicDebateUpvoteSweepRepository } from "@debateai/db";

/** One pass: batches of this many, at most this many batches, so a backlog never holds the timer; the next pass takes the rest. */
const PASS = Object.freeze({ batch: 500, batchesPerPass: 20 });

/**
 * One pass of 0194's sweep of the upvotes of public debates gone for good: a debate whose page can never be public again, because it was made
 * private or deleted. The database decides that from its rows alone and never touches a debate that is only held for review. The caller runs it
 * outside any request, so the API's pool sends it to the system login. Batches until one comes back short; a batch that fails ends the pass with
 * its failure, after the line for what already went. Returns how many votes went.
 */
export async function sweepGonePublicDebateUpvotes(deps: Readonly<{
  repository: Pick<PostgresPublicDebateUpvoteSweepRepository, "deleteGone">;
  log: (line: string) => void;
}>): Promise<number> {
  let deleted = 0;
  const written = (): void => { if (deleted > 0) deps.log(JSON.stringify({ event: "public_debate_upvote.gone_deleted", deleted })); };
  try {
    for (let batch = 0; batch < PASS.batchesPerPass; batch += 1) {
      const taken = await deps.repository.deleteGone(PASS.batch);
      deleted += taken;
      if (taken < PASS.batch) break;
    }
  } catch (error) {
    written();
    throw error;
  }
  written();
  return deleted;
}
