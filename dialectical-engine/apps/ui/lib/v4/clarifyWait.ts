/*
 * V4 start step, Task 76h (ask-d3, read-f23; the owner's cards "As picked, on measured time" and "Add these as extra moves",
 * 4 Nov night): the clarifying call's wait on step 2, in plain numbers. Pure: no import, so every test and the page read the
 * same values.
 *
 * The wait says "Analyzing your question…" first, "Still analyzing. Your words are still here." from about 6 s, and "This is
 * taking longer than usual. You can wait, or try again." (with a free "Try again") only once it passes the MEASURED top of
 * the call's usual time, never before the 6-second line. Nothing is guessed (wait-f8): until Task 91c's sitting measures the
 * call and the owner says yes, the usual time is unknown and the longer line never shows. The sitting sets the usual time,
 * the API's bound (ASK_CLARIFY_MODEL_SETTINGS.timeoutMs) and the page's wait together, in one commit.
 */

/** "Still analyzing. Your words are still here." from here on (ask-d3: about 6 s). */
export const ASK_CLARIFY_STILL_MS = 6_000;
/** The measured top of the clarifying call's usual time (Task 91c's sitting); null: not measured, so the longer line never shows. */
export const ASK_CLARIFY_USUAL_TOP_MS: number | null = null;
/**
 * The page stops waiting after this and shows no questions: the API's own bound (ASK_CLARIFY_MODEL_SETTINGS.timeoutMs, 8 s
 * today) plus 2 s, so the server always answers first. Task 91c's sitting moves both together.
 */
export const ASK_CLARIFY_PAGE_WAIT_MS = 10_000;
/** read-f23: the pale rows that hold the questions' place while they are read. */
export const CLARIFY_HELD_ROWS = 2;
/** read-f23: a question taking a held row is revealed in place, top first, this far after the one above it. */
export const CLARIFY_REVEAL_GAP_MS = 150;
/** ask-d3: each later question slides up into place this far after the one before it. */
export const CLARIFY_ARRIVE_GAP_MS = 120;

/** Which of the three wait lines shows. */
export type ClarifyWaitLine = "ANALYZING" | "STILL" | "LONGER";

/** The wait line after `elapsedMs` of waiting; LONGER only past the measured usual time and never before the 6-second line. */
export function clarifyWaitLineAt(elapsedMs: number, usualTopMs: number | null): ClarifyWaitLine {
  if (usualTopMs !== null && elapsedMs > Math.max(usualTopMs, ASK_CLARIFY_STILL_MS)) return "LONGER";
  return elapsedMs >= ASK_CLARIFY_STILL_MS ? "STILL" : "ANALYZING";
}

/**
 * When each of `count` questions arrives, from the reply: the first CLARIFY_HELD_ROWS take the held rows (`held`, revealed in
 * place, CLARIFY_REVEAL_GAP_MS apart); each later one slides in CLARIFY_ARRIVE_GAP_MS after the one before.
 */
export function clarifyArrivalDelays(count: number): readonly Readonly<{ delayMs: number; held: boolean }>[] {
  const delays: Readonly<{ delayMs: number; held: boolean }>[] = [];
  for (let at = 0; at < count; at += 1) {
    delays.push(Object.freeze(at < CLARIFY_HELD_ROWS
      ? { delayMs: at * CLARIFY_REVEAL_GAP_MS, held: true }
      : { delayMs: (CLARIFY_HELD_ROWS - 1) * CLARIFY_REVEAL_GAP_MS + (at - CLARIFY_HELD_ROWS + 1) * CLARIFY_ARRIVE_GAP_MS, held: false }));
  }
  return Object.freeze(delays);
}
