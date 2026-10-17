/**
 * Preview practice, mode "debate": the comparing judges' part of the report (engine redesign R2, spec §13 R2 row;
 * INTERFACE §15.4; owner D1).
 *
 * Plain words: under engine 2, three AIs compare the answers and vote; the code counts the votes and sets the label.
 * This block lists each vote (which AI, which answer letter, conditional or not, counted or why not, the kind of
 * question it named), the label and what triggered it, what today's label ladder would have said over the same final
 * strengths (the runner's record, `engine1Ladder`), how long the judging step took, and whether a conditional answer
 * won (D1: a majority of the counted judges who chose the winning answer called it conditional). Counts and codes only:
 * no judge's reasons, ever (they stay encrypted in the throwaway database). Engine 1: no block, today's report keys.
 *
 * Which votes count is COUNTED AGAIN here, by the code that decided the served answer (`recountJudgesVotes`, the
 * honesty panel's own recount over `deriveJudgesVerdict`, each answer lettered by its plan place), from the stored
 * letters, groups, makers, conditional flags and question kinds. The stored `counted` column is a hint that can drift
 * after a resume and is never read (controller ruling R2b-B5.1).
 */
import type { Pool } from "pg";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { engineOfRun } from "@debateai/register";
import { recountJudgesVotes, type ComparisonVote, type JudgesRecount, type RootCallSite } from "@debateai/serve";

export type PracticeJudgeVoteRow = Readonly<{
  model: string;
  maker: string;
  letter: string | null;
  conditional: boolean | null;
  /** From the recount; null when the votes could not be recounted (no honest letters, or rows the count refuses). */
  counted: boolean | null;
  notCountedReason: "OWN_MAKER" | "JUDGE_FAILED" | null;
  questionKind: string | null;
}>;
export type PracticeLabelBlock = Readonly<{
  label: string;
  trigger: string;
  /** Today's ladder over the same final strengths (report only); null when the receipt does not record it. */
  engine1LadderLabel: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED" | null;
}>;
export type PracticeJudgesBlocks = Readonly<{
  judgeVotes: readonly PracticeJudgeVoteRow[];
  labels: PracticeLabelBlock | null;
  /** Wall time of the judging step (first judge call started to last one finished); null when no judge was called. */
  judgesSeconds: number | null;
  /**
   * D1: a majority of the counted judges who voted for the winning group said "conditional" (a count for the owner,
   * not the label rule); null without a receipt or when the votes could not be recounted.
   */
  conditionalWinner: boolean | null;
}>;
/** What the throwaway database holds for one engine-2 run, read before the database goes. */
export type PracticeJudgesFacts = Readonly<{
  /** The vote rows' content-free columns; never the stored `counted` hint, never the reasons. */
  votes: readonly Readonly<{
    judge_seat: number; maker: string; model_id: string; chosen_letter: string | null; chosen_root_node_id: string | null;
    conditional: boolean | null; question_kind: string | null; same_as: unknown;
  }>[];
  /** The run's answers (roots, set-aside copies skipped): the maker that argued each and its author call's key. */
  roots: readonly Readonly<{ node_id: string; maker: string | null; call_site_key: string | null }>[];
  servedRootSelection: Readonly<Record<string, unknown>> | null;
  judgeWindow: Readonly<{ firstStarted: Date; lastFinished: Date }> | null;
}>;

/**
 * The vote rows' content-free columns (the reasons are encrypted content and never read here; nor is the stored
 * `counted` / `not_counted_reason` hint: the recount says which votes count). One row per seat (0121's key): a later
 * copy after a crash reuses the first copy's row, whose root may be a set-aside one; its letter names its answer.
 */
export const PRACTICE_JUDGE_VOTES_SQL = `SELECT judge_seat, maker, model_id, chosen_letter, chosen_root_node_id::text AS chosen_root_node_id,
       conditional, question_kind, same_as FROM ledger.verdict_vote WHERE run_id=$1 ORDER BY judge_seat`;
/**
 * The answers the recount letters: every root of the run that is not a set-aside copy's, the maker that argued it, and
 * its author call's key (its plan place, ruling R2b-B6.1), as the honesty panel's read finds them.
 */
export const PRACTICE_JUDGE_ROOTS_SQL = `SELECT root.node_id::text AS node_id, artifact.maker, entry.call_site_key
  FROM core.node AS root
  LEFT JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = root.provenance_ref
  LEFT JOIN ledger.ledger_entry AS entry ON entry.run_id = root.run_id AND entry.raw_artifact_ref = root.provenance_ref
   AND entry.action_kind = 'MODEL_CALL'
 WHERE root.run_id=$1 AND root.parent_node_id IS NULL AND root.generation_status IS DISTINCT FROM 'stale'
 ORDER BY root.created_at_seq, entry.sequence`;
/** The run's served-root receipt (the label, its trigger, the engine-1 ladder's record and the judges' groups). */
export const PRACTICE_JUDGES_RECEIPT_SQL = `SELECT served_root_selection FROM ledger.propagation_run
  WHERE run_id=$1 AND served_root_selection IS NOT NULL ORDER BY at_seq DESC LIMIT 1`;
/**
 * Every judge call's try and its structure repair, failed ones too: the step's wall window. The calls carry no node, so
 * a dead copy's judge calls are inside it on purpose, as the investigations' time counts them (practice-investigations.ts).
 */
export const PRACTICE_JUDGE_WINDOW_SQL = `SELECT min(started_at) AS first_started, max(finished_at) AS last_finished
  FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'
  AND (call_site_key LIKE 'VERDICT:judge:%' OR call_site_key LIKE 'REPAIR:STRUCTURE:VERDICT:judge:%')`;

const RUN_BASIS_SQL = "SELECT envelope_basis FROM core.run WHERE run_id=$1";

/** Null for an engine-1 run (its receipt has no `engine` member) or a run the database does not hold. */
export async function readPracticeJudges(pool: Pick<Pool, "query">, runId: string): Promise<PracticeJudgesFacts | null> {
  const run = (await pool.query<{ envelope_basis: unknown }>(RUN_BASIS_SQL, [runId])).rows[0];
  if (run === undefined || engineOfRun(parseCostEnvelopeBasis(run.envelope_basis)).engine !== 2) return null;
  const votes = (await pool.query<PracticeJudgesFacts["votes"][number]>(PRACTICE_JUDGE_VOTES_SQL, [runId])).rows;
  const roots = (await pool.query<PracticeJudgesFacts["roots"][number]>(PRACTICE_JUDGE_ROOTS_SQL, [runId])).rows;
  const receipt = (await pool.query<{ served_root_selection: Readonly<Record<string, unknown>> | null }>(
    PRACTICE_JUDGES_RECEIPT_SQL, [runId])).rows[0];
  const window = (await pool.query<{ first_started: Date | null; last_finished: Date | null }>(
    PRACTICE_JUDGE_WINDOW_SQL, [runId])).rows[0];
  return Object.freeze({
    votes: Object.freeze(votes.map((row) => Object.freeze({ ...row }))),
    roots: Object.freeze(roots.map((row) => Object.freeze({ ...row }))),
    servedRootSelection: receipt?.served_root_selection ?? null,
    judgeWindow: window === undefined || window.first_started === null || window.last_finished === null ? null
      : Object.freeze({ firstStarted: window.first_started, lastFinished: window.last_finished })
  });
}

const LADDER_LABELS: readonly string[] = Object.freeze(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]);
const MILLISECONDS = Object.freeze({ perTenthOfASecond: 100, tenthsPerSecond: 10 });
const textOf = (value: unknown): string | null => typeof value === "string" ? value : null;
const recordOf = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;

/** The served verdict's count, again, from the stored rows (`recountJudgesVotes`); null when it cannot be given. */
function recountOf(facts: PracticeJudgesFacts): JudgesRecount | null {
  const votes: readonly ComparisonVote[] = facts.votes.map((row) => Object.freeze({
    judgeSeat: row.judge_seat, maker: row.maker, chosenRootNodeId: row.chosen_root_node_id, chosenLetter: row.chosen_letter,
    conditional: row.conditional, sameAs: row.same_as as ComparisonVote["sameAs"], questionKind: row.question_kind
  }));
  const positions = [...new Map(facts.roots.map((row) => [row.node_id, row.maker] as const))]
    .map(([nodeId, maker]) => Object.freeze({ nodeId, maker, strength: null }));
  const sites: readonly RootCallSite[] = facts.roots.flatMap((row) =>
    row.call_site_key === null ? [] : [Object.freeze({ nodeId: row.node_id, callSiteKey: row.call_site_key })]);
  return recountJudgesVotes(votes, positions, sites);
}

function conditionalWinnerOf(facts: PracticeJudgesFacts, recount: JudgesRecount | null): boolean | null {
  const servedNodeId = textOf(facts.servedRootSelection?.servedNodeId);
  if (servedNodeId === null || recount === null) return null;
  const winnerLetter = recount.letterOfRoot.get(servedNodeId);
  if (winnerLetter === undefined) return null;
  const group = new Set<string>(recount.groups.find((candidate) => candidate.some((letter) => letter === winnerLetter)) ?? [winnerLetter]);
  const countedSeats = new Set(recount.counted.filter((entry) => entry.counted).map((entry) => entry.seat));
  const voters = facts.votes.filter((row) => countedSeats.has(row.judge_seat) && row.chosen_letter !== null
    && group.has(row.chosen_letter));
  // No counted voter for the winner (every vote ignored, or no judge could answer): no conditional winner.
  return voters.length > 0 && 2 * voters.filter((row) => row.conditional === true).length > voters.length;
}

/**
 * D1 (owner, 2026-10-16): did a conditional answer win? True when a majority of the counted judges who voted for the
 * winning group said "conditional". The winning group is the served answer's letter together with every letter the
 * judges' count grouped with it (a majority of the seated judges named them as one answer). Which judges count is the
 * recount's, never the stored column. Null when the receipt names no served answer or the votes cannot be recounted.
 * This is a count for the owner, not the label rule: the label already says "Close call" when ANY counted voter for
 * the winner said conditional (`JUDGES_CONDITIONAL`, G6). Pure.
 */
export function practiceConditionalWinner(facts: PracticeJudgesFacts): boolean | null {
  return conditionalWinnerOf(facts, recountOf(facts));
}

/** The report's four members. Pure. */
export function practiceJudgesBlocks(facts: PracticeJudgesFacts): PracticeJudgesBlocks {
  const recount = recountOf(facts);
  const countOf = new Map((recount?.counted ?? []).map((entry) => [entry.seat, entry] as const));
  const judgeVotes = Object.freeze(facts.votes.map((row): PracticeJudgeVoteRow => {
    const count = countOf.get(row.judge_seat);
    return Object.freeze({
      model: row.model_id, maker: row.maker, letter: row.chosen_letter, conditional: row.conditional,
      counted: count?.counted ?? null, notCountedReason: count?.notCountedReason ?? null, questionKind: row.question_kind
    });
  }));
  const verdictLabel = recordOf(facts.servedRootSelection?.verdictLabel);
  const label = textOf(verdictLabel?.label);
  const trigger = textOf(verdictLabel?.trigger);
  const ladder = textOf(recordOf(facts.servedRootSelection?.engine1Ladder)?.label);
  const labels: PracticeLabelBlock | null = label === null || trigger === null ? null : Object.freeze({
    label, trigger,
    engine1LadderLabel: ladder !== null && LADDER_LABELS.includes(ladder) ? ladder as PracticeLabelBlock["engine1LadderLabel"] : null
  });
  const judgesSeconds = facts.judgeWindow === null ? null
    : Math.round((facts.judgeWindow.lastFinished.getTime() - facts.judgeWindow.firstStarted.getTime())
      / MILLISECONDS.perTenthOfASecond) / MILLISECONDS.tenthsPerSecond;
  return Object.freeze({ judgeVotes, labels, judgesSeconds, conditionalWinner: conditionalWinnerOf(facts, recount) });
}

/** report.md's lines for the block (counts and codes, no reply text). Pure. */
export function practiceJudgesLines(blocks: PracticeJudgesBlocks): readonly string[] {
  const lines = ["Comparing judges (engine 2: the label comes from their votes; counts and codes only):", ""];
  lines.push(blocks.labels === null ? "- label: not recorded"
    : `- label: ${blocks.labels.label} (${blocks.labels.trigger}); today's ladder over the same final strengths would say: `
      + (blocks.labels.engine1LadderLabel ?? "not recorded"));
  lines.push(blocks.judgesSeconds === null ? "- judging took no time: no judge was called"
    : `- judging took ${blocks.judgesSeconds.toFixed(1)} s`);
  lines.push(`- conditional winner: ${blocks.conditionalWinner === null ? "not recorded"
    : blocks.conditionalWinner ? "yes" : "no"} (a majority of the counted judges who chose the winning answer called it conditional)`);
  if (blocks.judgeVotes.length > 0) {
    lines.push("", "| judge | maker | chose | conditional | counted | kind of question |", "|---|---|---|---|---|---|");
    for (const vote of blocks.judgeVotes) {
      const counted = vote.counted === null ? "not recounted" : vote.counted ? "yes" : `no (${vote.notCountedReason ?? "-"})`;
      lines.push(`| ${vote.model} | ${vote.maker} | ${vote.letter ?? "-"} | `
        + `${vote.conditional === null ? "-" : vote.conditional ? "yes" : "no"} | ${counted} | ${vote.questionKind ?? "-"} |`);
    }
  }
  lines.push("");
  return Object.freeze(lines);
}
