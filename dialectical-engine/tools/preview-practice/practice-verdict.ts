/**
 * Preview practice: the verdict and its exit code.
 *
 * Plain words: a practice ends with one word the release steps can read.
 *  - PASS (exit 0): everything worked: the debate finished, an answer was served, the story is ready, every reply had
 *    the right format, no call failed, no gate stopped.
 *  - PASS_WITH_WARNINGS (exit 10): it worked, but some calls were refused as "too busy" before they recovered, or a
 *    model was slow (its 90th-percentile call took more than two minutes).
 *  - FAIL (exit 20): something a person would have seen went wrong.
 *  - NOT_PROVEN (exit 30): it worked, but a model sat out as busy (its vendor refused it, or it was cooling off), or
 *    the practice paused a gate itself after four connection failures in a row, or the operator interrupted it once
 *    (the calls in flight finished, the rest were skipped), so some model was not tested to the end.
 *  - HARNESS_ERROR (exit 40): the practice itself could not run (a start check refused, or the tool broke). No verdict
 *    about the release.
 *  - ABORTED (exit 50): the practice started but did not get to its end (a second interrupt, or the tool broke midway).
 *    The report holds every sample that finished, and every other rule that applied is listed after the abort.
 * When several apply, the first in this order wins: HARNESS_ERROR, ABORTED, FAIL, NOT_PROVEN, PASS_WITH_WARNINGS, PASS.
 */

export const PRACTICE_VERDICTS = ["PASS", "PASS_WITH_WARNINGS", "FAIL", "NOT_PROVEN", "HARNESS_ERROR", "ABORTED"] as const;
export type PracticeVerdict = typeof PRACTICE_VERDICTS[number];

export const PRACTICE_EXIT_CODES: Readonly<Record<PracticeVerdict, number>> = Object.freeze({
  PASS: 0, PASS_WITH_WARNINGS: 10, FAIL: 20, NOT_PROVEN: 30, HARNESS_ERROR: 40, ABORTED: 50
});

/** A model whose 90th-percentile call took longer than this is slow (a warning). */
const PRACTICE_SLOW_P90_MS = 120_000;

export type PracticeVerdictInput = Readonly<{
  /** Set when the practice could not run at all: the refusal or failure code. */
  harnessError: string | null;
  /** Debate: the work item ended COMPLETED. Formats: every planned sample was sent or deliberately skipped. */
  completed: boolean;
  /**
   * Formats: the operator interrupted once; the calls in flight finished and the rest were skipped. Not a failure on its
   * own: NOT_PROVEN. Optional: false when absent.
   */
  interrupted?: boolean;
  /** Set when the practice started but did not reach its end (a second interrupt, a crash midway): the code. */
  aborted?: string | null;
  /** Debate only: an answer was served. Null in formats mode. */
  servedAnswer: boolean | null;
  /** Debate only: the story's outcome (READY, FAILED, ...). Null in formats mode. */
  storyOutcome: string | null;
  /** Replies that failed their format check (PARSE_FAILED or SCHEMA_FAILED), any model, any step, any attempt. */
  formatFailures: number;
  /** Calls that ended FAILED, TIMED_OUT or BLOCKED (debate), or that failed for a reason other than format (formats). */
  failedCalls: number;
  /** A gate's state after the practice is not active, or a gate refused or halted during it. */
  gateHalted: boolean;
  /** The practice's own brake stopped a gate for a gate refusal, a vendor error or an unreadable answer. */
  gateStopped: boolean;
  /**
   * Gates the practice's brake paused itself for connection failures (four in a row): nothing failed, the models behind
   * them were not exercised. Optional: none when absent.
   */
  gatePauses?: readonly string[];
  /** Models that sat out (busy at ask time) or were never exercised (formats: a gate stopped before them). */
  notExercisedModels: readonly string[];
  /**
   * Models whose call ended refused as busy, so the rest of their jobs were skipped (formats) or they sat out the rest
   * of the debate (debate). Not a failure: NOT_PROVEN for that model. Optional: none when absent.
   */
  busyModels?: readonly string[];
  /** Refusals the gate proved unbilled (vendor busy, model cooling off, not reached) during a practice that went through. */
  unbilledRefusals: number;
  /** Each model's 90th-percentile latency in ms. */
  p90ByModel: Readonly<Record<string, number>>;
}>;

export type PracticeVerdictResult = Readonly<{
  verdict: PracticeVerdict;
  exitCode: number;
  /** Every rule that applied, worst first; the verdict is the first one's class. */
  reasons: readonly string[];
}>;

export function practiceVerdict(input: PracticeVerdictInput): PracticeVerdictResult {
  if (input.harnessError !== null) {
    return Object.freeze({ verdict: "HARNESS_ERROR", exitCode: PRACTICE_EXIT_CODES.HARNESS_ERROR,
      reasons: Object.freeze([`HARNESS_ERROR:${input.harnessError}`]) });
  }
  const fail: string[] = [];
  if (!input.completed) fail.push("RUN_NOT_COMPLETED");
  if (input.servedAnswer === false) fail.push("NO_SERVED_ANSWER");
  if (input.storyOutcome !== null && input.storyOutcome !== "READY") fail.push(`STORY_NOT_READY:${input.storyOutcome}`);
  if (input.formatFailures > 0) fail.push(`FORMAT_FAILED:${String(input.formatFailures)}`);
  if (input.failedCalls > 0) fail.push(`CALL_FAILED:${String(input.failedCalls)}`);
  if (input.gateHalted) fail.push("GATE_HALTED");
  if (input.gateStopped) fail.push("GATE_STOPPED_BY_PRACTICE");
  const busy = [...new Set(input.busyModels ?? [])].sort();
  const notProven = [
    ...busy.map((model) => `MODEL_BUSY:${model}`),
    ...[...new Set(input.notExercisedModels)].filter((model) => !busy.includes(model)).sort().map((model) => `MODEL_NOT_EXERCISED:${model}`),
    ...[...(input.gatePauses ?? [])].sort().map((pause) => `GATE_PAUSED:${pause}`)
  ];
  if (input.interrupted === true) notProven.push("RUN_INTERRUPTED");
  const warn: string[] = [];
  if (input.unbilledRefusals > 0) warn.push(`UNBILLED_REFUSALS:${String(input.unbilledRefusals)}`);
  for (const [model, p90] of Object.entries(input.p90ByModel).sort(([a], [b]) => a.localeCompare(b))) {
    if (p90 > PRACTICE_SLOW_P90_MS) warn.push(`SLOW_P90:${model}:${String(Math.round(p90 / 1000))}s`);
  }
  const aborted = input.aborted === undefined || input.aborted === null ? [] : [`ABORTED:${input.aborted}`];
  const reasons = Object.freeze([...aborted, ...fail, ...notProven, ...warn]);
  const verdict: PracticeVerdict = aborted.length > 0 ? "ABORTED" : fail.length > 0 ? "FAIL"
    : notProven.length > 0 ? "NOT_PROVEN"
      : warn.length > 0 ? "PASS_WITH_WARNINGS" : "PASS";
  return Object.freeze({ verdict, exitCode: PRACTICE_EXIT_CODES[verdict], reasons });
}

/** Nearest-rank percentile of a list of numbers; null for an empty list. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  if (!(p > 0 && p <= 100)) throw new TypeError("PRACTICE_PERCENTILE_INVALID");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length, Math.ceil((p / 100) * sorted.length)) - 1]!;
}

export type LatencySummary = Readonly<{ p50: number | null; p90: number | null; max: number | null }>;

export function latencySummary(values: readonly number[]): LatencySummary {
  return Object.freeze({
    p50: percentile(values, 50), p90: percentile(values, 90),
    max: values.length === 0 ? null : Math.max(...values)
  });
}
