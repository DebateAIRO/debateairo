/**
 * Preview practice: the operator's Ctrl-C.
 *
 * Plain words: a Ctrl-C in the terminal reaches every process of the command at once (pnpm, tsx and node), and the
 * wrappers pass it on again, so one key press can arrive here two or three times within a moment. Every interrupt that
 * comes within two seconds of the first counts as that same first one. The first one stops new calls and lets the calls
 * in flight finish; the report is written as usual. A later interrupt quits at once, after writing the report from the
 * samples already finished.
 */

/** Interrupts this close to the first count as the first. */
const PRACTICE_INTERRUPT_DEBOUNCE_MS = 2_000;

export type PracticeInterruptAction = "FIRST" | "REPEAT_IGNORED" | "QUIT";

/** Counts the interrupts: `signal()` says what this one means. */
export function practiceInterruptGate(options: Readonly<{ now?: () => number; debounceMs?: number }> = {}): Readonly<{
  signal: () => PracticeInterruptAction;
}> {
  const now = options.now ?? (() => Date.now());
  const debounceMs = options.debounceMs ?? PRACTICE_INTERRUPT_DEBOUNCE_MS;
  let firstAt: number | null = null;
  return Object.freeze({
    signal: () => {
      const at = now();
      if (firstAt === null) { firstAt = at; return "FIRST"; }
      return at - firstAt < debounceMs ? "REPEAT_IGNORED" : "QUIT";
    }
  });
}
