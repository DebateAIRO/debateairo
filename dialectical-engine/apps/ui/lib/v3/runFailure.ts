import { t,type MessageCatalog } from "../i18n/translate.js";

/**
 * What the asker is told when their debate FAILED: one of four fixed
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
 */

export const RUN_FAILURE_KINDS = Object.freeze([
  /** The API created the run, then could not finish setting it up (`RUN_SETUP_FAILED:<step>`). */
  "NOT_STARTED",
  /**
   * The models pinned when the question was asked were gone when the runner
   * claimed it, or (the model scorecard's role assignment) could not seat a
   * debate when it claimed it.
   */
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
   * role assignment pinned at the ask cannot seat a debate when the runner
   * claims it, so the models chosen for it were not usable and it never began.
   */
  RUN_ROLE_ASSIGNMENT_INVALID: "MODELS_UNAVAILABLE",
  RUN_CEILING_BELOW_FIRST_CALL: "RUN_LIMIT_REACHED"
});

export function runFailureKind(reason: string | null | undefined): RunFailureKind {
  if (typeof reason !== "string") return "STOPPED";
  const code = reason.trim();
  const unwrapped = code.startsWith(RUNNER_WRAPPER) ? code.slice(RUNNER_WRAPPER.length) : code;
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
