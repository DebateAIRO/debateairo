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
  /** True within two seconds of the first interrupt: a stop signal then is a wrapper's echo of the same key press. */
  justInterrupted: () => boolean;
}> {
  const now = options.now ?? (() => Date.now());
  const debounceMs = options.debounceMs ?? PRACTICE_INTERRUPT_DEBOUNCE_MS;
  let firstAt: number | null = null;
  return Object.freeze({
    signal: () => {
      const at = now();
      if (firstAt === null) { firstAt = at; return "FIRST"; }
      return at - firstAt < debounceMs ? "REPEAT_IGNORED" : "QUIT";
    },
    justInterrupted: () => firstAt !== null && now() - firstAt < debounceMs
  });
}

/** The signals the practice answers itself: Ctrl-C, and a stop from outside (both write the report first). */
export const PRACTICE_SIGNALS = Object.freeze(["SIGINT", "SIGTERM", "SIGHUP"] as const);
export type PracticeSignal = typeof PRACTICE_SIGNALS[number];

/** What `takeOverSignals` needs of the process (a stand-in in the tests). */
export type PracticeSignalTarget = Readonly<{
  listeners: (event: PracticeSignal) => Function[];
  removeListener: (event: PracticeSignal, listener: (...args: unknown[]) => void) => unknown;
  on: (event: PracticeSignal, listener: () => void) => unknown;
}>;

/**
 * Makes the practice the only one answering its signals. A library the command loads can answer them first and quit:
 * embedded-postgres (the debate mode's throwaway database, imported when the command loads) registers async-exit-hook,
 * whose SIGINT listener calls process.exit(130) on the next tick, so one Ctrl-C ended a live run with exit 130 and no
 * report (2026-10-12). Every listener already there is removed (its "exit" hooks stay: the database is still stopped
 * when the process ends), then ours is added. tsx's own hidden listener does not show in listeners() and stays; it
 * only quits when no other listener is left. Returns how many listeners were removed, per signal.
 */
export function takeOverSignals(target: PracticeSignalTarget, handlers: Readonly<Record<PracticeSignal, () => void>>): Readonly<Record<PracticeSignal, number>> {
  const removed = { SIGINT: 0, SIGTERM: 0, SIGHUP: 0 };
  for (const signal of PRACTICE_SIGNALS) {
    for (const listener of target.listeners(signal)) {
      if (listener === handlers[signal]) continue;
      target.removeListener(signal, listener as (...args: unknown[]) => void);
      removed[signal] += 1;
    }
    if (!target.listeners(signal).includes(handlers[signal])) target.on(signal, handlers[signal]);
  }
  return Object.freeze(removed);
}
