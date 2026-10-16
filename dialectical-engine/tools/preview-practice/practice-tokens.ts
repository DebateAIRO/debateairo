/**
 * Preview practice, length guidance L27 (LG-B): per AI and per step, the thinking, answer and cached tokens of its calls
 * and the words its replies wrote against the words they were guided to, read from the throwaway database's own records
 * (ledger.raw_artifact's columns, the metadata's usage and finish reason, the ledger's thinking level). Information only:
 * the verdict never reads these tables. report.md shows numbers and codes only.
 */
import { THINKING_LEVEL_DEFAULT_ONLY } from "@debateai/kernel";
import {
  answerTokensOf, previewModelRow, structureRepairOriginalKey, type PreviewCallTier, type PreviewModelRow
} from "@debateai/providers";
import { practiceStepOf, type PracticeStep } from "./practice-lanes.js";
import { latencySummary, type LatencySummary } from "./practice-verdict.js";

/** One stored attempt's measures (null where the record has none). */
export type PracticeMeasuredAttempt = Readonly<{
  /** The AI that wrote this try (its own ledger row's). */
  model: string;
  /**
   * The AI whose words this try's reply holds: its call's AI (LG-A's call join). For a structure-repair try that is the
   * original call's AI, since Haiku copies that AI's words verbatim (STRUCTURE_REPAIR_NOT_VERBATIM guards it).
   */
  wordsModel: string;
  actorRef: string; callSiteKey: string; outcome: string; thinkingLevel: string | null;
  /** The form this try sent (ORIGINAL, PATCH, FULL, LENGTH_RETRY, STRUCTURE; LG-A's reply_form), null when unknown. */
  replyForm: string | null;
  parseStatus: string | null; finishReason: string | null; tokenCeiling: number | null;
  promptTokens: number | null; completionTokens: number | null; thinkingTokens: number | null;
  cachedInputTokens: number | null; actualWords: number | null; guidedWords: number | null;
}>;

/** p50 / p90 / max by nearest rank (practice-verdict.ts latencySummary); nulls with nothing to measure. */
export type PracticeSpread = LatencySummary;

export type PracticeTokenRow = Readonly<{
  model: string; step: PracticeStep;
  /** Stored tries (a call's retries count apart). */
  calls: number; thinkingTokens: PracticeSpread; answerTokens: PracticeSpread;
  /** Cached input tokens over input tokens, over the calls that reported both; null with none. Three decimals. */
  cachedShare: number | null;
  /** Length retries (reply form LENGTH_RETRY) that ran a thinking level below the cut-off try before them (L25). */
  thoughtLess: number;
  /** Tries that asked for more than the row's standard bound (the final-writer tier, L26). */
  finalWriterTier: number;
}>;

export type PracticeLengthRow = Readonly<{
  model: string; step: PracticeStep; guidedWords: number | null; accepted: number;
  actualWords: Readonly<{ median: number | null; p90: number | null; max: number | null }>;
  overGuidedShare: number | null; runawayStops: number; slips: number;
}>;

const CUT_OFF = "length";
const LENGTH_RETRY = "LENGTH_RETRY";
const SLIP_STATUSES: ReadonlySet<string> = new Set(["PARSE_FAILED", "SCHEMA_FAILED"]);

type GroupKey = (attempt: PracticeMeasuredAttempt) => readonly [string, PracticeStep];
/** Tokens: the AI that spent them, at its own call's step (a structure-repair try is Haiku's `structure_repair`). */
const tokenKey: GroupKey = (attempt) => [attempt.model, practiceStepOf(attempt.callSiteKey)];
/** Words: the AI that wrote them, at the step of the call they answer (a structure-repair try: the original call's). */
const wordsKey: GroupKey = (attempt) => [attempt.wordsModel, practiceStepOf(structureRepairOriginalKey(attempt.callSiteKey))];

function groups(attempts: readonly PracticeMeasuredAttempt[], keyOf: GroupKey):
  readonly (readonly [string, PracticeStep, readonly PracticeMeasuredAttempt[]])[] {
  const byKey = new Map<string, { model: string; step: PracticeStep; attempts: PracticeMeasuredAttempt[] }>();
  for (const attempt of attempts) {
    const [model, step] = keyOf(attempt);
    const key = `${model}\u0000${step}`;
    const group = byKey.get(key) ?? { model, step, attempts: [] };
    group.attempts.push(attempt);
    byKey.set(key, group);
  }
  return [...byKey.values()].sort((a, b) => a.model.localeCompare(b.model) || a.step.localeCompare(b.step))
    .map((group) => [group.model, group.step, group.attempts] as const);
}
const numbers = (values: readonly (number | null)[]): number[] => values.filter((value): value is number => value !== null);
const share = (part: number, whole: number): number | null => whole === 0 ? null : Math.round((part / whole) * 1000) / 1000;

/** A level's place on the AI's strongest-first menu (Task 3's effortsByStrength; the ledger's DEFAULT_ONLY is "default"); -1 when unknown. */
function strengthIndex(model: string, level: string | null): number {
  if (level === null) return -1;
  const word = level === THINKING_LEVEL_DEFAULT_ONLY ? "default" : level;
  const menu = previewModelRow(model)?.effortsByStrength as readonly string[] | undefined;
  return menu === undefined ? -1 : menu.indexOf(word);
}

/**
 * The tier one stored try ran at, to price what it measured (Task 6 review, Minor 1): FINAL_WRITER when the bound it asked
 * for (its metadata's token_ceiling, the request's max_tokens) is above the row's standard bound, else STANDARD. Priced at
 * STANDARD, a final writer's output would be clamped at the standard bound and its cost under-stated.
 */
export function practiceTryTier(row: PreviewModelRow, tokenCeiling: unknown): PreviewCallTier {
  return typeof tokenCeiling === "number" && Number.isSafeInteger(tokenCeiling) && tokenCeiling > row.outputBound ? "FINAL_WRITER" : "STANDARD";
}

/** The token table: one row per AI and step, in model then step order. */
export function practiceTokenRows(attempts: readonly PracticeMeasuredAttempt[]): readonly PracticeTokenRow[] {
  // L25: a LENGTH_RETRY try of the same call (same AI, same call site), right after its cut-off try, at a level strictly
  // below that try's on the AI's own menu. A repair POST at slip_fix and a retry that thought more are not counted.
  const thoughtLess = new Set<PracticeMeasuredAttempt>();
  const last = new Map<string, PracticeMeasuredAttempt>();
  for (const attempt of attempts) {
    const call = `${attempt.actorRef}\u0000${attempt.callSiteKey}`;
    const before = last.get(call);
    if (before !== undefined && attempt.replyForm === LENGTH_RETRY && before.finishReason === CUT_OFF) {
      const was = strengthIndex(before.model, before.thinkingLevel);
      const now = strengthIndex(attempt.model, attempt.thinkingLevel);
      if (was >= 0 && now > was) thoughtLess.add(attempt);
    }
    last.set(call, attempt);
  }
  return Object.freeze(groups(attempts, tokenKey).map(([model, step, mine]) => {
    const reporting = mine.filter((attempt) => attempt.cachedInputTokens !== null && attempt.promptTokens !== null);
    const bound = previewModelRow(model)?.outputBound;
    return Object.freeze({
      model, step, calls: mine.length,
      thinkingTokens: latencySummary(numbers(mine.map((attempt) => attempt.thinkingTokens))),
      answerTokens: latencySummary(numbers(mine.map((attempt) => answerTokensOf(attempt.completionTokens, attempt.thinkingTokens)))),
      cachedShare: share(reporting.reduce((sum, attempt) => sum + attempt.cachedInputTokens!, 0),
        reporting.reduce((sum, attempt) => sum + attempt.promptTokens!, 0)),
      thoughtLess: mine.filter((attempt) => thoughtLess.has(attempt)).length,
      finalWriterTier: bound === undefined ? 0 : mine.filter((attempt) => attempt.tokenCeiling !== null && attempt.tokenCeiling > bound).length
    });
  }));
}

/**
 * The guided-vs-actual table (deviation 9: guided words from the record when LG-C writes them). A structure-repair try
 * counts for its call's AI and step (pre-flight PF-B4.6): the words are that AI's.
 */
export function practiceLengthRows(attempts: readonly PracticeMeasuredAttempt[]): readonly PracticeLengthRow[] {
  return Object.freeze(groups(attempts, wordsKey).map(([model, step, mine]) => {
    const accepted = mine.filter((attempt) => attempt.outcome === "OK");
    const guided = numbers(accepted.map((attempt) => attempt.guidedWords));
    const words = latencySummary(numbers(accepted.map((attempt) => attempt.actualWords)));
    const compared = accepted.filter((attempt) => attempt.guidedWords !== null && attempt.actualWords !== null);
    return Object.freeze({
      model, step, guidedWords: latencySummary(guided).p50, accepted: accepted.length,
      actualWords: Object.freeze({ median: words.p50, p90: words.p90, max: words.max }),
      // LG-C: a map call is told one target per part of each item (Task 14 records their sum) while its reply holds several
      // items, so its share is no comparison and stays null; its guided words still show.
      overGuidedShare: step === "map" ? null
        : share(compared.filter((attempt) => attempt.actualWords! > attempt.guidedWords!).length, compared.length),
      runawayStops: mine.filter((attempt) => attempt.finishReason === CUT_OFF).length,
      slips: mine.filter((attempt) => attempt.parseStatus !== null && SLIP_STATUSES.has(attempt.parseStatus)).length
    });
  }));
}

const spread = (value: Readonly<{ p50: number | null; p90: number | null; max: number | null }>): string =>
  value.p50 === null ? "-" : `${String(value.p50)} / ${String(value.p90)} / ${String(value.max)}`;
const percent = (value: number | null): string => value === null ? "-" : `${(value * 100).toFixed(1)}%`;

/** report.md: the token table, or nothing without rows. */
export function practiceTokenLines(rows: readonly PracticeTokenRow[]): readonly string[] {
  if (rows.length === 0) return [];
  return ["Tokens per AI and step (information only; tries: stored tries, retries apart; thinking and answer tokens as "
    + "p50 / p90 / max; cached: the share of the input read from the vendor's cache; lower: length retries that thought "
    + "one level lower; final writer: tries that asked for more than the standard 32,768):", "",
    "| model | step | tries | thinking | answer | cached | lower | final writer |", "|---|---|---|---|---|---|---|---|",
    ...rows.map((row) => `| ${row.model} | ${row.step} | ${String(row.calls)} | ${spread(row.thinkingTokens)} | ${spread(row.answerTokens)} | `
      + `${percent(row.cachedShare)} | ${String(row.thoughtLess)} | ${String(row.finalWriterTier)} |`), ""];
}

/** report.md: the guided-vs-actual table, or nothing without rows. */
export function practiceLengthLines(rows: readonly PracticeLengthRow[]): readonly string[] {
  if (rows.length === 0) return [];
  return ["Words per AI and step (information only, never checked; actual words of the accepted replies as median / p90 / max; "
    + "over: the share longer than guided; stopped: replies cut off at their allowance; slips: replies refused for their form; "
    + "a reply Haiku put back into its form counts for the AI and step that wrote it):", "",
    "| model | step | guided | accepted | actual | over | stopped | slips |", "|---|---|---|---|---|---|---|---|",
    ...rows.map((row) => `| ${row.model} | ${row.step} | ${row.guidedWords === null ? "-" : String(row.guidedWords)} | ${String(row.accepted)} | `
      + `${spread({ p50: row.actualWords.median, p90: row.actualWords.p90, max: row.actualWords.max })} | ${percent(row.overGuidedShare)} | `
      + `${String(row.runawayStops)} | ${String(row.slips)} |`), ""];
}
