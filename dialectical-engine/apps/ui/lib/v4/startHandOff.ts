import type { ReadingLevel, V4PathTag } from "./types.js";

/*
 * V4 start step, Task 76i (wait-f14 "no blank page between Start and the map", wait-f20, choose-f19's "if the map takes long"):
 * once the ask page's Start is accepted, it hands the question and the paths it drew to the map page, so they stay on screen
 * while the map page checks the session and reads the debate for the first time. The hand-off is one module variable: it lives
 * while this tab's scripts run, so the client-side move to the map finds it, and a reload or another tab does not. It is never
 * kept in the browser's storage and never put in the address (the cookie list is law, and owner answer Q3 allows only the tab's
 * history entry). A stale one is never drawn: after START_HAND_OFF_MS the map page shows its usual outline.
 */

/** What the map page draws until its first run read answers: the question as it was sent and each path being looked into. */
export type StartHandOff = Readonly<{ runId: string; questionLine: string;
  paths: readonly Readonly<{ title: string; question: string; tag: V4PathTag | null }>[]; level: ReadingLevel | null; at: number }>;

/** How long a hand-off may be drawn after it was made (a slow network then shows the usual outline). */
export const START_HAND_OFF_MS = 60_000;

let held: StartHandOff | null = null;

/** The ask page, at STARTED: this run's hand-off, replacing any earlier one. */
export function handOffStart(handOff: StartHandOff): void {
  held = handOff;
}

/** This run's hand-off while it is younger than START_HAND_OFF_MS; never another run's. */
export function handOffFor(runId: string, now: number): StartHandOff | null {
  if (held === null || held.runId !== runId) return null;
  return now - held.at < START_HAND_OFF_MS ? held : null;
}

/** The map page, once its first run read answered: this run's hand-off is used up (another run's stays). */
export function clearHandOff(runId: string): void {
  if (held !== null && held.runId === runId) held = null;
}
