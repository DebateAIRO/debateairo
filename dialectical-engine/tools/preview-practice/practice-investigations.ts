/**
 * Preview practice, debate mode (R2, E12, E13; INTERFACE §15.4): the "cannot assess" reviews and the investigations.
 *
 * Plain words: how many points a reviewer could not assess, and what was done about them: how many one more AI was asked
 * to look into, and what it found (the point holds, fails, or is still a dead end); how many could not be looked into (the
 * call failed or the money had run out, no AI of another maker was left, the debate's cap was reached; an answer itself
 * is never investigated) (pre-flight PF-R2a10.7); how many investigations changed which answer
 * leads; and their money and time. Counts only, never a text. A debate on engine 1 runs no investigation: only its
 * "cannot assess" count is not zero. What the weight of a "cannot assess" link does is measured by the `rescore` mode.
 */
import type { Pool } from "pg";
// (pre-flight PF-R2a10.19) A10's type, imported, never re-derived (declared in engine-repository.ts, plan deviation 16).
import type { PointInvestigationResult } from "@debateai/judgement";

export type PracticeInvestigationBlock = Readonly<{
  cannotAssessReviews: number;
  /**
   * Investigation rows with an outcome or UNAVAILABLE (holds + fails + dead end + unavailable). An UNAVAILABLE row
   * written after a money stop had no call (A14) (pre-flight PF-R2a10.7). An answer (root) marked "cannot assess" is never
   * investigated, nor is a point the material cannot place on an answer (A14, pre-flight PF-R2a8.16 and pre-flight
   * consistency), so `run + capped + skipped` is AT MOST `cannotAssessReviews`, never always equal.
   */
  run: number;
  capped: number;
  skipped: number;
  unavailable: number;
  holds: number;
  fails: number;
  deadEnd: number;
  standingsMoved: number;
  costNanoUsd: string;
  /** The investigation step's time: the first call's start to the last call's end, whole seconds (0 when none ran). */
  seconds: number;
}>;

type ResultCounter = "holds" | "fails" | "deadEnd" | "unavailable" | "skipped" | "capped";
/** A9's row results (A10's list) and the counter each one adds to: one lookup, no branch to forget (pre-flight PF-R2a10.19). */
const COUNTER_OF_RESULT: Readonly<Record<PointInvestigationResult, ResultCounter>> = Object.freeze({
  HOLDS: "holds", FAILS: "fails", DEAD_END: "deadEnd",
  INVESTIGATION_UNAVAILABLE: "unavailable", INVESTIGATION_SKIPPED: "skipped", INVESTIGATION_CAPPED: "capped"
});
/**
 * The results counted in `run`: a call made (holds, fails, dead end), or UNAVAILABLE: made and still refused after LG-A's
 * repairs, or planned and stopped by money with no call (A14) (pre-flight PF-R2a10.7).
 */
const CALL_MADE: readonly ResultCounter[] = Object.freeze(["holds", "fails", "deadEnd", "unavailable"]);
const MILLISECONDS = Object.freeze({ perSecond: 1000 });

/** Pure: the block from the debate's reviews, its investigation rows and its investigator calls. */
export function practiceInvestigationBlock(input: Readonly<{
  reviewOutcomes: readonly string[];
  rows: readonly Readonly<{ result: string; standingsMoved: boolean | null }>[];
  calls: readonly Readonly<{ startedAt: Date; finishedAt: Date }>[];
  costNanoUsd: bigint;
}>): PracticeInvestigationBlock {
  const counts: Record<ResultCounter, number> = { holds: 0, fails: 0, deadEnd: 0, unavailable: 0, skipped: 0, capped: 0 };
  for (const row of input.rows) {
    if (Object.hasOwn(COUNTER_OF_RESULT, row.result)) counts[COUNTER_OF_RESULT[row.result as PointInvestigationResult]] += 1;
  }
  const first = Math.min(...input.calls.map((call) => call.startedAt.getTime()));
  const last = Math.max(...input.calls.map((call) => call.finishedAt.getTime()));
  return Object.freeze({
    cannotAssessReviews: input.reviewOutcomes.filter((outcome) => outcome === "cannot-assess").length,
    run: CALL_MADE.reduce((sum, counter) => sum + counts[counter], 0),
    capped: counts.capped, skipped: counts.skipped, unavailable: counts.unavailable,
    holds: counts.holds, fails: counts.fails, deadEnd: counts.deadEnd,
    standingsMoved: input.rows.filter((row) => row.standingsMoved === true).length,
    costNanoUsd: String(input.costNanoUsd),
    seconds: input.calls.length === 0 ? 0 : Math.round((last - first) / MILLISECONDS.perSecond)
  });
}

/** Reads the block from the throwaway database; the investigators' money is `collect`'s own INVESTIGATOR rows. */
export async function readPracticeInvestigations(pool: Pool, runId: string,
  byModelAndSite: readonly Readonly<{ site: string; costNanoUsd: string }>[]): Promise<PracticeInvestigationBlock> {
  const reviews = (await pool.query<{ outcome: string }>("SELECT outcome FROM ledger.node_review WHERE run_id=$1", [runId])).rows;
  const rows = (await pool.query<{ result: string; standings_moved: boolean | null }>(
    "SELECT result, standings_moved FROM ledger.point_investigation WHERE run_id=$1 ORDER BY investigation_order", [runId])).rows;
  const calls = (await pool.query<{ started_at: Date; finished_at: Date }>(
    `SELECT started_at, finished_at FROM ledger.ledger_entry
      WHERE run_id=$1 AND action_kind='MODEL_CALL' AND call_site_key LIKE 'VERDICT:investigate:%'`, [runId])).rows;
  return practiceInvestigationBlock({
    reviewOutcomes: reviews.map((row) => row.outcome),
    rows: rows.map((row) => Object.freeze({ result: row.result, standingsMoved: row.standings_moved })),
    calls: calls.map((row) => Object.freeze({ startedAt: row.started_at, finishedAt: row.finished_at })),
    costNanoUsd: byModelAndSite.filter((row) => row.site === "INVESTIGATOR").reduce((sum, row) => sum + BigInt(row.costNanoUsd), 0n)
  });
}

/** report.md: one table row of counts (no text). `dollars` is the report's own `usd`. */
export function practiceInvestigationLines(block: PracticeInvestigationBlock, dollars: (nano: bigint) => string): readonly string[] {
  return Object.freeze([
    "\"Cannot assess\" reviews and their investigations (E12, E13; information only; what the weight of such a link does: the rescore mode):", "",
    "| cannot-assess reviews | investigated | holds | fails | dead end | call failed | no other maker | over the cap | standings moved | cost $ | time s |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    `| ${String(block.cannotAssessReviews)} | ${String(block.run)} | ${String(block.holds)} | ${String(block.fails)} | `
      + `${String(block.deadEnd)} | ${String(block.unavailable)} | ${String(block.skipped)} | ${String(block.capped)} | `
      + `${String(block.standingsMoved)} | ${dollars(BigInt(block.costNanoUsd))} | ${String(block.seconds)} |`,
    ""
  ]);
}
