import { t,type MessageCatalog } from "../i18n/translate.js";

/**
 * What the asker is told when their debate FAILED: one of five fixed
 * sentences, chosen from the run's terminal reason code and never containing
 * it. Same shape as `requestFailure.ts` (DL3-F7): a closed alphabet, nothing
 * derived from the stored value beyond which group it belongs to.
 *
 * The code itself stays an operator's tool: it is kept in core.work_item,
 * served by GET /v1/runs/:id, logged by the runner and the API, and each group
 * below is listed against its codes in deploy/vps/README.md ("What the asker
 * sees when a debate fails").
 *
 * Owner rulings, 2026-09-28: the four remaining sentences are the owner's
 * picks (the fifth, the day's limit, was retired by the budget rule, spec
 * 2026-09-28 §2.11), and CALL_BUDGET_EXHAUSTED (a re-claim finding a step's
 * tries used up) is "stopped partway", not a spending limit.
 *
 * Owner ruling, 3 October 2026 (Part 4): a waiting question whose paid plan
 * ended is told so (PLAN_ENDED), not "something went wrong on our side".
 */

export const RUN_FAILURE_KINDS = Object.freeze([
  /**
   * The API created the run, then could not finish setting it up
   * (`RUN_SETUP_FAILED:<step>`, any step but PLAN_CHANGED), or the runner,
   * claiming it, refused its pinned role assignment (RUN_ROLE_ASSIGNMENT_INVALID).
   */
  "NOT_STARTED",
  /**
   * Not a fault (`RUN_SETUP_FAILED:PLAN_CHANGED`, B7b): a premium question
   * waited in line, and by the time there was room its owner was on Free
   * because the paid plan ended, was withdrawn or erased, or was paused by a
   * card dispute (the suspension writes Free). It never started; the owner can
   * ask again under the plan they have now.
   */
  "PLAN_ENDED",
  /** The models pinned when the question was asked were gone when the runner claimed it. */
  "MODELS_UNAVAILABLE",
  /** The run's own ceiling refused its very first call. */
  "RUN_LIMIT_REACHED",
  /**
   * Anything else, a code nobody has mapped, or no code at all. Budget spec
   * 2026-09-28 §2.11: that includes the site's day and a person's allowance
   * (`DAILY_COST_ENVELOPE_REACHED`, `PERSON_ALLOWANCE_REACHED`). With the budget
   * members published they stop only the arguing and never end a debate, and a
   * question the day holds back waits in line (sentence C) instead, so a stray
   * one reads as stopped partway.
   */
  "STOPPED"
] as const);

export type RunFailureKind = typeof RUN_FAILURE_KINDS[number];

/**
 * The runner stores anything thrown out of a work item as
 * `RUNNER_EXECUTION_FAILED:<diagnostic>` (runnerTerminalFailureReason in
 * apps/runner). Its claim-time refusals first write their own code, and the
 * same failure then reaches that catch and overwrites it with the wrapped form,
 * so both forms are read the same way.
 */
const RUNNER_WRAPPER = "RUNNER_EXECUTION_FAILED:";

/** The codes that are not STOPPED, by their head (the part before any `:suffix`). */
export const RUN_FAILURE_CODES: Readonly<Record<string, RunFailureKind>> = Object.freeze({
  RUN_SETUP_FAILED: "NOT_STARTED",
  RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM: "MODELS_UNAVAILABLE",
  SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM: "MODELS_UNAVAILABLE",
  /**
   * Part 3's final review, P3-M18: the model scorecard's claim-time refusal. The
   * role assignment stored at the ask was refused by its schema or its seat
   * count when the runner claimed the debate, before any model was probed, so
   * the debate never began; a new ask repairs it. (A pinned model that is gone
   * at claim fails later, with one of the two codes above.)
   */
  RUN_ROLE_ASSIGNMENT_INVALID: "NOT_STARTED",
  RUN_CEILING_BELOW_FIRST_CALL: "RUN_LIMIT_REACHED"
});

/**
 * The whole codes that are read before the head rule, because their head's
 * group would say something untrue of them. Only an exact match counts: any
 * other `RUN_SETUP_FAILED:<step>` reads its head's group.
 */
export const RUN_FAILURE_FULL_CODES: Readonly<Record<string, RunFailureKind>> = Object.freeze({
  /** Part 4 (part4-scope.md §4.1): the API's waiting-line waker, B7b. */
  "RUN_SETUP_FAILED:PLAN_CHANGED": "PLAN_ENDED"
});

export function runFailureKind(reason: string | null | undefined): RunFailureKind {
  if (typeof reason !== "string") return "STOPPED";
  const code = reason.trim();
  const unwrapped = code.startsWith(RUNNER_WRAPPER) ? code.slice(RUNNER_WRAPPER.length) : code;
  if (Object.hasOwn(RUN_FAILURE_FULL_CODES, unwrapped)) return RUN_FAILURE_FULL_CODES[unwrapped]!;
  const head = unwrapped.split(":", 1)[0]!;
  return Object.hasOwn(RUN_FAILURE_CODES, head) ? RUN_FAILURE_CODES[head]! : "STOPPED";
}

/**
 * The sentence for a failed debate, from a `home` or `debateChrome` catalogue
 * (both carry every `runFailure.*` key). Never the code, never a sentence a
 * server wrote.
 */
export function runFailureMessage(
  reason: string | null | undefined,
  catalog: MessageCatalog | null | undefined
): string {
  return t(catalog, `runFailure.${runFailureKind(reason)}`);
}
