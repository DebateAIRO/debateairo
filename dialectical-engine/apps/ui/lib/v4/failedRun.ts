import type { RunProjection } from "@debateai/contract";
import { t, type MessageCatalog } from "../i18n/translate.js";
import { runFailureKind } from "../v3/runFailure.js";
import { ownWords, parseDigQuestion } from "./askText.js";

/*
 * Owner review 3 Nov 2026 (wait-f11, map-f30, wait-f18): what a debate or a dig that did not finish may say about the
 * person's quota. The rule is the owner's: "Nothing was taken" is said ONLY when the server confirms it.
 *
 * Today's run read does not say it. The server need (written in the track report): the run read of a FAILED run carries
 * `quota_used`, "NONE" (nothing was taken from the person's quota for it) or "SOME". Until the contract carries the field
 * the page never sees it, so it says nothing about the quota; the stand-in API shows the field on its draft view
 * (/__mock/draft/v1/runs/:id). The two failure kinds whose own sentence already says "It did not use your quota"
 * (an upload set the debate aside, or a choice it was asked with is gone) are never told twice.
 *
 * The owner's answers of 5 Nov 2026 (OPEN-OWNER-QUESTIONS-2026-11-04.md):
 *  - question 20 A: a failed QUESTION says "Nothing was taken for the failed try." when the server confirms nothing was
 *    used (NONE), and "The part that ran used some of your quota." when it says some was (SOME). A failed DIG keeps only
 *    "Nothing was taken from your quota for this." when the server confirms it (wait-f18), and says nothing when some was
 *    used (dig-f12). No field: nothing is said, as before.
 *  - question 3 A: a dig that did not finish says its reason ABOUT THE DIG, one line for each of the seven reason groups of
 *    lib/v3/runFailure.ts ("This dig stopped partway because of a problem on our side."), never the question's sentence.
 */

/** The run read's optional field (not in the contract yet): "NONE" or "SOME" on a FAILED run. */
export const QUOTA_USED_FIELD = "quota_used";

/** Whether the server confirmed that nothing was taken from the person's quota for this failed run. */
export function quotaUntouched(run: RunProjection): boolean {
  if (run.state !== "FAILED") return false;
  return (run as RunProjection & Readonly<Record<string, unknown>>)[QUOTA_USED_FIELD] === "NONE";
}

/** Whether the server said that some of the person's quota was used for this failed run (question 20 A). */
export function quotaSomeUsed(run: RunProjection): boolean {
  if (run.state !== "FAILED") return false;
  return (run as RunProjection & Readonly<Record<string, unknown>>)[QUOTA_USED_FIELD] === "SOME";
}

/** The failure kinds whose own plain sentence already says nothing was used (lib/v3/runFailure.ts). */
export function reasonSaysNothingUsed(reason: string | null | undefined): boolean {
  const kind = runFailureKind(reason);
  return kind === "SET_ASIDE" || kind === "CHOICE_GONE";
}

/** Say "nothing was taken" once: only when the server confirmed it, and the reason's sentence does not say it already. */
export function sayNothingTaken(reason: string | null | undefined, untouched: boolean): boolean {
  return untouched && !reasonSaysNothingUsed(reason);
}

/**
 * Question 20 A: say "the part that ran used some of your quota" only when the server said so, and the reason's own
 * sentence does not say that nothing was used (a waived run never reads SOME; the page never contradicts it).
 */
export function saySomeUsed(reason: string | null | undefined, some: boolean): boolean {
  return some && !reasonSaysNothingUsed(reason);
}

/**
 * Owner 7 Nov, question 42 A (relayed by the review session): with "Continue where it stopped" offered, the reason sentence above it drops
 * its "ask again" ending. Each cut line is a V4 line of its own (STOPPED is the owner's words, the others drafted); the shared runFailure.*
 * sentences (35 languages) are untouched. A reason whose sentence has no such ending keeps it (`null` here: the shared sentence).
 */
const CONTINUE_REASON_KEYS: Readonly<Partial<Record<ReturnType<typeof runFailureKind>, string>>> = Object.freeze({
  STOPPED: "v4.failed.continueReason.STOPPED",
  NOT_STARTED: "v4.failed.continueReason.NOT_STARTED",
  SET_ASIDE: "v4.failed.continueReason.SET_ASIDE"
});

/** Question 42 A: the reason sentence of a question whose stopped page offers Continue, or null for the shared sentence as it is. */
export function continuingReason(reason: string | null | undefined, catalog: MessageCatalog): string | null {
  const key = CONTINUE_REASON_KEYS[runFailureKind(reason)];
  return key === undefined ? null : t(catalog, key);
}

/**
 * V4 start step, Task 57n (owner 8 Nov, "Drop it, like digs"): the reason sentence of a question that keeps failing (its read's
 * `keeps_failing`). No ending promises another try: AIs unavailable drops "Please try again in a while." (a drafted line), and the
 * our-side reasons drop their "ask again" ending as with Continue (continuingReason). Null: the shared sentence as it is.
 */
export function keepsFailingReason(reason: string | null | undefined, catalog: MessageCatalog): string | null {
  if (runFailureKind(reason) === "MODELS_UNAVAILABLE") return t(catalog, "v4.failed.keepsFailingReason.MODELS_UNAVAILABLE");
  return continuingReason(reason, catalog);
}

/**
 * Question 20 A: the one quota line under a failed run's reason, as its catalogue key, or null when nothing is said. A
 * question: "Nothing was taken for the failed try." (NONE) or "The part that ran used some of your quota." (SOME). A dig:
 * "Nothing was taken from your quota for this." (NONE) only; a dig that used some says nothing about it (dig-f12).
 */
export function failedQuotaKey(run: RunProjection, isDig: boolean): string | null {
  if (sayNothingTaken(run.terminal_reason, quotaUntouched(run))) return isDig ? "v4.digFailed.nothingTaken" : "v4.debate.failedNothingTaken";
  if (!isDig && saySomeUsed(run.terminal_reason, quotaSomeUsed(run))) return "v4.debate.failedSomeTaken";
  return null;
}

/**
 * Question 3 A: why a dig did not finish, said about the dig: one V4 line for each reason group of lib/v3/runFailure.ts
 * (the same groups as a question's sentence, never the code itself). Used in the dig's panel and on its own failed page.
 * The owner's third round (5 Nov afternoon): once the same dig keeps failing (`keepsFailing`, the panel's "This keeps
 * failing. Write your report; it uses everything that finished."), the AIs-unavailable line drops its "You can try it
 * again in a while.", so the two lines do not disagree (a drafted line). Absent or false: the line as before.
 */
export function digFailureMessage(reason: string | null | undefined, catalog: MessageCatalog, keepsFailing = false): string {
  const kind = runFailureKind(reason);
  if (keepsFailing && kind === "MODELS_UNAVAILABLE") return t(catalog, "v4.digFailed.unavailableKeepsFailing");
  return t(catalog, `v4.digFailed.reason.${kind}`);
}

/** Run ids are UUIDs; anything else in `?again=` is ignored (never read, never shown). */
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** The run id an "Ask this again" link names (`/v4?again=<run id>`), or null. Only the id travels in the address. */
export function askAgainRunId(value: string | null | undefined): string | null {
  return typeof value === "string" && RUN_ID_PATTERN.test(value.trim()) ? value.trim().toLowerCase() : null;
}

/** "Ask this again": the ask page, told which of the person's own debates to fill the question from. */
export function askAgainHref(runId: string): string {
  return `/v4?again=${encodeURIComponent(runId)}`;
}

/**
 * The words "Ask this again" fills the question box with: the person's own words of their debate, as the server sends
 * them back (never the lines added from their step-2 answers, which the ask step adds again). Null for a dig, whose
 * question is the site's text for the AIs, and when there are no words.
 */
export function askAgainQuestion(run: Pick<RunProjection, "question_line">, catalog: MessageCatalog): string | null {
  if (parseDigQuestion(run.question_line, catalog) !== null) return null;
  const words = ownWords(run.question_line);
  return words.length > 0 ? words : null;
}

/**
 * V4 start step, Task 57g (the owner's 7 Nov answers, replacing Task 57e's re-use link: "if it stays the same, we need to use whatever was
 * already generated and paid for ... if they change the question, then it's a new question"): whether the person's own FAILED question can
 * continue where it stopped, as its run read says (`continuable`, Task 57f: exactly when POST /v1/runs/{id}/continue would continue it).
 * Never a dig (its question is the site's text for the AIs), nor a run with no words to fill in.
 */
export function askAgainContinuable(run: Pick<RunProjection, "question_line" | "state" | "continuable">, catalog: MessageCatalog): boolean {
  return run.state === "FAILED" && run.continuable === true && askAgainQuestion(run, catalog) !== null;
}

/** Task 57g: the words on the ask page are the stopped question's own once both are trimmed (any other change is a new question). */
export function sameStoppedWords(typed: string, stopped: string | null): boolean {
  return stopped !== null && typed.trim() === stopped.trim();
}

/*
 * Task 57g: "Change the question" with the words left as they were goes back to the stopped debate's map, which starts the same Continue
 * there, with its 10-second Undo. The ask page hands that over in one module variable, as Start's hand-off (startHandOff.ts): it lives
 * while this tab's scripts run, so the client-side move to the map finds it; a reload or another tab does not. Never in the browser's
 * storage, never in the address. Used once, and never after CONTINUE_HAND_OFF_MS.
 */

/** How long the map may take the hand-off after the ask page made it. */
export const CONTINUE_HAND_OFF_MS = 60_000;

let continueHeld: Readonly<{ runId: string; at: number }> | null = null;

/** The ask page: the map of `runId` starts its Continue on arrival (replacing any earlier hand-off). */
export function handOffContinue(runId: string, now: number): void {
  continueHeld = Object.freeze({ runId, at: now });
}

/** The map page, once its first read answered: true once for a fresh hand-off of this run (it is used up either way); never another run's. */
export function takeContinueHandOff(runId: string, now: number): boolean {
  if (continueHeld === null || continueHeld.runId !== runId) return false;
  const fresh = now - continueHeld.at < CONTINUE_HAND_OFF_MS;
  continueHeld = null;
  return fresh;
}
