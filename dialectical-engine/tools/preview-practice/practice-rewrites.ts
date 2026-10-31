/**
 * Preview practice, debate mode (dig-model revision 2026-10-30, task W5-2): THE REWRITE TABLE.
 *
 * Plain words: per dig of the practice's investigation (a run whose dig picks name it, or a dig of one of its digs), its
 * level (1 to 10), its picks by who wrote them (an AI suggestion, the person's edit of one, or the person's own view;
 * the person writes no search words, owner 31 Oct), and the rewrite of the path it was dug from: how many rounds the
 * writer and the checker went, how many times the checker objected, the outcome (READY, READY_WITH_RESERVATION, FAILED,
 * or none yet), the verdict on the person's view (HELPED, DID_NOT_HELP, NOT_SETTLED, and whether it is about the path or
 * the main question), the path's fate before and after, and the rewrite's money and time.
 *
 * Codes, counts, money and time only: never a pick's words, the path's text or the checker's objection. An objection is
 * counted from the checker's own reply (`parsePathRewriteVerdict`: not satisfied), opened under the dig's key and kept
 * nowhere.
 */
import type { Pool } from "pg";
import { parsePathRewriteVerdict } from "@debateai/story";
import { readPracticeLedgerCalls, type PracticeLedgerCall } from "./practice-web.js";

export type PracticeRewriteRow = Readonly<{
  digRunId: string;
  /** 1 to 10, or null when the level was not stored. */
  level: number | null;
  picks: Readonly<{ aiSuggestion: number; personEdited: number; personOwnView: number }>;
  rounds: number;
  checkerCalls: number;
  checkerObjections: number;
  /** The rewrite's outcome, or NONE when no rewrite row was stored (yet). */
  outcome: "READY" | "READY_WITH_RESERVATION" | "FAILED" | "NONE";
  failureCode: string | null;
  /** The verdict on the person's view and its scope ("HELPED / PATH"), or null when the dig had none. */
  verdict: string | null;
  fateBefore: string | null;
  fateAfter: string | null;
  costNanoUsd: string;
  /** The rewrite's first call to its last call's end, whole seconds; null when it made none. */
  seconds: number | null;
}>;

export type PracticeRewriteBlock = Readonly<{ digs: readonly PracticeRewriteRow[] }>;

export type PracticeRewriteFacts = Readonly<{
  digRunId: string;
  level: number | null;
  pickAuthors: readonly string[];
  rewrite: Readonly<{
    outcome: string; failureCode: string | null; fateBefore: string; fateAfter: string | null;
    verdictOutcome: string | null; verdictScope: string | null; rounds: number;
  }> | null;
  /** The dig's PATH_REWRITE calls: their money, time, and for a checker call whether it objected (null: unread). */
  calls: readonly Readonly<{ callSiteKey: string; costNanoUsd: bigint; startedAt: Date; finishedAt: Date; objected: boolean | null }>[];
}>;

const OUTCOMES: ReadonlySet<string> = new Set(["READY", "READY_WITH_RESERVATION", "FAILED"]);
const isChecker = (callSiteKey: string): boolean => callSiteKey.startsWith("PATH_REWRITE:CHECKER:");

/** Pure: one row per dig, in the order given. */
export function practiceRewriteBlock(digs: readonly PracticeRewriteFacts[]): PracticeRewriteBlock {
  return Object.freeze({
    digs: Object.freeze(digs.map((dig): PracticeRewriteRow => {
      const count = (author: string) => dig.pickAuthors.filter((entry) => entry === author).length;
      const checkers = dig.calls.filter((call) => isChecker(call.callSiteKey));
      const times = dig.calls.flatMap((call) => [call.startedAt.getTime(), call.finishedAt.getTime()]);
      const rewrite = dig.rewrite;
      return Object.freeze({
        digRunId: dig.digRunId, level: dig.level,
        picks: Object.freeze({ aiSuggestion: count("AI_SUGGESTION"), personEdited: count("PERSON_EDITED"), personOwnView: count("PERSON_OWN_VIEW") }),
        rounds: rewrite?.rounds ?? 0,
        checkerCalls: checkers.length,
        checkerObjections: checkers.filter((call) => call.objected === true).length,
        outcome: rewrite !== null && OUTCOMES.has(rewrite.outcome) ? rewrite.outcome as PracticeRewriteRow["outcome"] : "NONE",
        failureCode: rewrite?.failureCode ?? null,
        verdict: rewrite?.verdictOutcome === null || rewrite?.verdictOutcome === undefined ? null
          : `${rewrite.verdictOutcome} / ${rewrite.verdictScope ?? "-"}`,
        fateBefore: rewrite?.fateBefore ?? null,
        fateAfter: rewrite?.fateAfter ?? null,
        costNanoUsd: String(dig.calls.reduce((sum, call) => sum + call.costNanoUsd, 0n)),
        seconds: times.length === 0 ? null : Math.round((Math.max(...times) - Math.min(...times)) / 1000)
      });
    }))
  });
}

/** Whether a checker call objected: its reply read as the loop reads it; null when it gave none or none could be read. */
async function objectedOf(call: PracticeLedgerCall): Promise<boolean | null> {
  if (!isChecker(call.callSiteKey)) return null;
  const reply = await call.reply();
  if (reply === null) return null;
  try { return !parsePathRewriteVerdict(reply).satisfied; } catch { return null; }
}

/**
 * Reads the block from the throwaway database: every dig under the run (its picks' parent chain), oldest first. Null
 * when the run has no dig: today's report keys.
 */
export async function readPracticeRewrites(pool: Pool, runId: string): Promise<PracticeRewriteBlock | null> {
  const digs = (await pool.query<{ run_id: string }>(
    `WITH RECURSIVE under(run_id, recorded_at) AS (
       SELECT run_id, recorded_at FROM identity.dig_pick_set WHERE parent_run_id = $1
       UNION
       SELECT child.run_id, child.recorded_at FROM identity.dig_pick_set AS child JOIN under ON child.parent_run_id = under.run_id
     )
     SELECT run_id::text FROM under ORDER BY recorded_at, run_id`, [runId])).rows;
  if (digs.length === 0) return null;
  const facts: PracticeRewriteFacts[] = [];
  for (const { run_id: digRunId } of digs) {
    const level = (await pool.query<{ dig_level: number }>(
      "SELECT dig_level FROM identity.investigation_dig_level WHERE run_id=$1", [digRunId])).rows[0]?.dig_level ?? null;
    const pickAuthors = (await pool.query<{ author: string }>(
      "SELECT author FROM identity.dig_pick WHERE run_id=$1 ORDER BY pick_no", [digRunId])).rows.map((row) => row.author);
    const stored = (await pool.query<{ outcome: string; failure_code: string | null; fate_before: string; fate_after: string | null;
      verdict_outcome: string | null; verdict_scope: string | null; rounds: number }>(
      `SELECT outcome, failure_code, fate_before, fate_after, verdict_outcome, verdict_scope, rounds
         FROM identity.path_rewrite WHERE run_id=$1`, [digRunId])).rows[0];
    const calls: PracticeRewriteFacts["calls"][number][] = [];
    for (const call of await readPracticeLedgerCalls(pool, digRunId, "PATH_REWRITE:")) {
      calls.push(Object.freeze({ callSiteKey: call.callSiteKey, costNanoUsd: call.costNanoUsd, startedAt: call.startedAt,
        finishedAt: call.finishedAt, objected: await objectedOf(call) }));
    }
    facts.push(Object.freeze({
      digRunId, level, pickAuthors: Object.freeze(pickAuthors),
      rewrite: stored === undefined ? null : Object.freeze({ outcome: stored.outcome, failureCode: stored.failure_code,
        fateBefore: stored.fate_before, fateAfter: stored.fate_after, verdictOutcome: stored.verdict_outcome,
        verdictScope: stored.verdict_scope, rounds: stored.rounds }),
      calls: Object.freeze(calls)
    }));
  }
  return practiceRewriteBlock(facts);
}

/** report.md: the rewrite table, one row per dig (codes and counts only). `dollars` is the report's `usd`. */
export function practiceRewriteLines(block: PracticeRewriteBlock, dollars: (nano: bigint) => string): readonly string[] {
  const lines = [
    "Path rewrites per dig (W5-2; codes, counts, money and time only; picks: AI suggestion / the person's edit / the person's own view):", "",
    "| dig | level | picks (AI / edited / own view) | rounds | checker objections | outcome | verdict | fate before → after | cost $ | time s |",
    "|---|---|---|---|---|---|---|---|---|---|"
  ];
  if (block.digs.length === 0) lines.push("| - | - | - | - | - | - | - | - | - | - |");
  for (const row of block.digs) {
    lines.push(`| ${row.digRunId.slice(0, 8)} | ${row.level === null ? "-" : String(row.level)} | ${String(row.picks.aiSuggestion)} / `
      + `${String(row.picks.personEdited)} / ${String(row.picks.personOwnView)} | ${String(row.rounds)} | `
      + `${String(row.checkerObjections)} of ${String(row.checkerCalls)} | ${row.outcome}${row.failureCode === null ? "" : ` (${row.failureCode})`} | `
      + `${row.verdict ?? "-"} | ${row.fateBefore ?? "-"} → ${row.fateAfter ?? "-"} | ${dollars(BigInt(row.costNanoUsd))} | `
      + `${row.seconds === null ? "-" : String(row.seconds)} |`);
  }
  lines.push("");
  return Object.freeze(lines);
}
