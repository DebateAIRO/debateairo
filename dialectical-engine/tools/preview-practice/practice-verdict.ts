/**
 * Preview practice: the verdict and its exit code.
 *
 * Plain words: a practice ends with one word the release steps can read.
 *  - PASS (exit 0): everything worked: the debate finished, an answer was served, the story is ready, every reply had
 *    the right format the first time, no call failed, no gate stopped.
 *  - PASS_WITH_WARNINGS (exit 10): it worked, but some calls were refused as "too busy" before they recovered, or a
 *    model was slow (its 90th-percentile call took more than two minutes), or (owner ruling 2026-10-12, "Fixed slips =
 *    warning") a reply had the wrong format and the SAME call's second try fixed it (FORMAT_REPAIRED:<model>:<n>), or
 *    (owner ruling 2026-10-12, "Keep GLM, it sits out") a model was busy and sat out the rest after giving at least one
 *    accepted answer (MODEL_BUSY_PARTLY:<model>:answered=<n>:skipped=<m>).
 *  - FAIL (exit 20): something a person would have seen went wrong: among others a call that ended without an accepted
 *    reply after its tries because of its format (FORMAT_FAILED), or one AI whose first tries slipped too often
 *    (SLIP_RATE:<model>:<slips>/<answered>, `practiceSlipRateExceeded`).
 *  - NOT_PROVEN (exit 30): it worked, but a model sat out as busy (its vendor refused it, or it was cooling off) before
 *    it gave a single accepted answer, or the practice paused a gate itself after four connection failures in a row, or
 *    the operator interrupted it once (the calls in flight finished, the rest were skipped), so some model was not
 *    tested to the end.
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

/**
 * One AI's calls, for the slip rule (owner ruling 2026-10-12, "Fixed slips = warning"). A call is one step asked of one
 * model with all its tries (its format repair, its one resend after an unbilled refusal, the runner's final retry).
 *  - answered: calls that ended with an accepted reply;
 *  - slips: calls whose FIRST reply failed its format or content check;
 *  - repaired: slips the same call's later try fixed (a warning);
 *  - unrecovered: calls with a reply that failed its check and no accepted reply after all their tries (a failure).
 */
export type PracticeModelCalls = Readonly<{ answered: number; slips: number; repaired: number; unrecovered: number }>;

/**
 * The slip rule: one AI fails when its slips are more than 1 in 10 of its answered calls, except that ONE slip is always
 * allowed (a short practice has few calls). Exactly: FAIL when slips > max(1, floor(answered / 10)), which is the same
 * as slips >= 2 and slips x 10 > answered. So 1 slip in 3 passes, 2 in 10 fail, 2 in 20 pass, 3 in 25 fail.
 */
export function practiceSlipRateExceeded(calls: Readonly<{ answered: number; slips: number }>): boolean {
  return calls.slips > 1 && calls.slips * 10 > calls.answered;
}

/** The replies a format or content check refused: the gateway's two statuses, and a reply with no content at all. */
const PRACTICE_FORMAT_STATUSES: ReadonlySet<string> = new Set(["PARSE_FAILED", "SCHEMA_FAILED", "UNPARSED"]);

/**
 * Patch follow-up (owner design, 2026-10-12): what one try of a call sent, read from its own recorded prompt
 * (`practiceReplyFormOf`, practice-lanes.ts):
 *  - ORIGINAL: the step's own packet (the first try, a resend after an unbilled refusal, a cut-off reply's resend);
 *  - PATCH: the short follow-up (the model's own first answer as its own turn, then only the failing machine paths);
 *  - FULL: the step's full re-ask (the original packet and one block naming the refusal).
 */
export type PracticeReplyForm = "ORIGINAL" | "PATCH" | "FULL";

/**
 * How a repaired call (a slip a later try of the same call fixed) was fixed: the accepted try's form. PATCH and FULL as
 * above; RESEND when the accepted try sent the original packet again (a cut-off reply's resend, the runner's final
 * retry). Information only: the verdict counts a repaired call the same whichever way it was fixed.
 */
export type PracticeRepairKind = "PATCH" | "FULL" | "RESEND";

/**
 * One try of a call, as the ledger (debate) or the formats mode's in-memory record keeps it, in order. `replyForm` is
 * absent (or null) when the try's prompt was not recorded (a log written before it existed, an attempt refused before
 * it was sent).
 */
export type PracticeCallTry = Readonly<{ outcome: string; parseStatus: string | null; replyForm?: PracticeReplyForm | null }>;

/**
 * What one call's tries say for the slip rule. Its first REPLY is its first try that came back with a body (an
 * unbilled refusal or a timeout has none); a call is answered when one of its tries ended OK.
 */
export function practiceCallFacts(tries: readonly PracticeCallTry[]): Readonly<{ answered: boolean; slip: boolean; repaired: boolean; unrecovered: boolean }> {
  const answered = tries.some((attempt) => attempt.outcome === "OK");
  const firstReply = tries.find((attempt) => attempt.parseStatus !== null);
  const slip = firstReply !== undefined && PRACTICE_FORMAT_STATUSES.has(firstReply.parseStatus!);
  const refused = tries.some((attempt) => attempt.parseStatus !== null && PRACTICE_FORMAT_STATUSES.has(attempt.parseStatus));
  return Object.freeze({ answered, slip, repaired: slip && answered, unrecovered: refused && !answered });
}

/** Each AI's calls (`PracticeModelCalls`) from its calls' tries. */
export function practiceModelCalls(calls: readonly Readonly<{ model: string; tries: readonly PracticeCallTry[] }>[]): Readonly<Record<string, PracticeModelCalls>> {
  const out: Record<string, { answered: number; slips: number; repaired: number; unrecovered: number }> = {};
  for (const call of calls) {
    const facts = practiceCallFacts(call.tries);
    const mine = out[call.model] ??= { answered: 0, slips: 0, repaired: 0, unrecovered: 0 };
    if (facts.answered) mine.answered += 1;
    if (facts.slip) mine.slips += 1;
    if (facts.repaired) mine.repaired += 1;
    if (facts.unrecovered) mine.unrecovered += 1;
  }
  return Object.freeze(Object.fromEntries(Object.entries(out).map(([model, mine]) => [model, Object.freeze(mine)])));
}

/**
 * How a repaired call was fixed (`PracticeRepairKind`): the form of its first accepted try. Null for a call that was not
 * repaired, and for a repaired call whose accepted try's form is not known.
 */
export function practiceRepairKindOf(tries: readonly PracticeCallTry[]): PracticeRepairKind | null {
  if (!practiceCallFacts(tries).repaired) return null;
  const form = tries.find((attempt) => attempt.outcome === "OK")?.replyForm ?? null;
  return form === "PATCH" ? "PATCH" : form === "FULL" ? "FULL" : form === "ORIGINAL" ? "RESEND" : null;
}

/**
 * Per AI, its repaired calls by how they were fixed: by the short patch follow-up, by the full re-ask, and otherwise
 * (a resend of the original packet, or a form not recorded). The three add up to `PracticeModelCalls.repaired`.
 */
export type PracticeRepairKinds = Readonly<{ repairedByPatch: number; repairedByFullAsk: number; repairedOtherwise: number }>;

export function practiceRepairKindsByModel(calls: readonly Readonly<{ model: string; tries: readonly PracticeCallTry[] }>[]):
  Readonly<Record<string, PracticeRepairKinds>> {
  const out: Record<string, { repairedByPatch: number; repairedByFullAsk: number; repairedOtherwise: number }> = {};
  for (const call of calls) {
    if (!practiceCallFacts(call.tries).repaired) continue;
    const mine = out[call.model] ??= { repairedByPatch: 0, repairedByFullAsk: 0, repairedOtherwise: 0 };
    const kind = practiceRepairKindOf(call.tries);
    if (kind === "PATCH") mine.repairedByPatch += 1;
    else if (kind === "FULL") mine.repairedByFullAsk += 1;
    else mine.repairedOtherwise += 1;
  }
  return Object.freeze(Object.fromEntries(Object.entries(out).map(([model, mine]) => [model, Object.freeze(mine)])));
}

/** A busy model's run (owner ruling 2026-10-12, "Keep GLM, it sits out"): what it answered, what it skipped. */
export type PracticeBusyModelRun = Readonly<{ answered: number; skipped: number }>;

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
  /**
   * Calls that ended without an accepted reply after all their tries, with a reply that failed its format or content
   * check (PARSE_FAILED, SCHEMA_FAILED, UNPARSED; formats: also a reply the runner's own reading refused after the
   * check). A slip the same call's second try fixed is not counted here (`callsByModel`).
   */
  formatFailures: number;
  /** Each AI's calls for the slip rule (`PracticeModelCalls`). Optional: no slip rule and no warning when absent. */
  callsByModel?: Readonly<Record<string, PracticeModelCalls>>;
  /**
   * For each busy model: its jobs (formats) or calls (debate) that got an accepted answer, and those skipped or ended
   * without one. A busy model with at least one is a warning, not NOT_PROVEN. Optional: absent means none.
   */
  busyRuns?: Readonly<Record<string, PracticeBusyModelRun>>;
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
  // Owner ruling 2026-10-12 ("fix the story but go with Option 1"): a story served with the checker's reservation is a
  // warning (STORY_RESERVED below); any other story that is not READY fails.
  if (input.storyOutcome !== null && input.storyOutcome !== "READY" && input.storyOutcome !== "READY_WITH_RESERVATION") {
    fail.push(`STORY_NOT_READY:${input.storyOutcome}`);
  }
  if (input.formatFailures > 0) fail.push(`FORMAT_FAILED:${String(input.formatFailures)}`);
  const calls = Object.entries(input.callsByModel ?? {}).sort(([a], [b]) => a.localeCompare(b));
  for (const [model, mine] of calls) {
    if (practiceSlipRateExceeded(mine)) fail.push(`SLIP_RATE:${model}:${String(mine.slips)}/${String(mine.answered)}`);
  }
  if (input.failedCalls > 0) fail.push(`CALL_FAILED:${String(input.failedCalls)}`);
  if (input.gateHalted) fail.push("GATE_HALTED");
  if (input.gateStopped) fail.push("GATE_STOPPED_BY_PRACTICE");
  const busy = [...new Set(input.busyModels ?? [])].sort();
  // Owner ruling 2026-10-12 ("Keep GLM, it sits out"): a busy model that gave at least one accepted answer is a warning.
  const answeredOf = (model: string) => input.busyRuns?.[model]?.answered ?? 0;
  const partlyBusy = busy.filter((model) => answeredOf(model) >= 1);
  const notProven = [
    ...busy.filter((model) => answeredOf(model) < 1).map((model) => `MODEL_BUSY:${model}`),
    ...[...new Set(input.notExercisedModels)].filter((model) => !busy.includes(model)).sort().map((model) => `MODEL_NOT_EXERCISED:${model}`),
    ...[...(input.gatePauses ?? [])].sort().map((pause) => `GATE_PAUSED:${pause}`)
  ];
  if (input.interrupted === true) notProven.push("RUN_INTERRUPTED");
  const warn: string[] = [];
  for (const model of partlyBusy) {
    warn.push(`MODEL_BUSY_PARTLY:${model}:answered=${String(answeredOf(model))}:skipped=${String(input.busyRuns?.[model]?.skipped ?? 0)}`);
  }
  for (const [model, mine] of calls) if (mine.repaired > 0) warn.push(`FORMAT_REPAIRED:${model}:${String(mine.repaired)}`);
  if (input.storyOutcome === "READY_WITH_RESERVATION") warn.push("STORY_RESERVED");
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
