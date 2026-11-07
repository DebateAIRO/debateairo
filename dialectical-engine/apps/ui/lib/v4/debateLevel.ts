import { READING_LEVELS, type ReadingLevel } from "./types.js";

/*
 * The owner's level ruling (5 Nov 2026, question 15 and the second round of follow-ups): the reading level is chosen only
 * when asking, and a debate keeps it for its map, its digs, its report and its public page.
 *
 * The server says that level as `reading_level` on the run read and on the public debate (the start-step session's Tasks
 * 75c and 75d). Both are optional: a debate asked before the field, or published before it, has none, and a page reads a
 * public debate without one as Plain words (the contract's own rule). The map's loader (lib/v4/load.ts) hands the run's
 * level on as `level`. Until those fields are in this branch's contract these readers see nothing, and every page keeps
 * what it showed before; they read the fields loosely so the pages follow them the moment the server sends them.
 */

/** A value that is one of the three levels, else null (never a guess). */
function levelIn(value: unknown): ReadingLevel | null {
  return (READING_LEVELS as readonly unknown[]).includes(value) ? (value as ReadingLevel) : null;
}

/** The optional `reading_level` of a run read or a public debate, or null when it has none. */
export function readingLevelOf(read: object): ReadingLevel | null {
  return levelIn((read as Readonly<Record<string, unknown>>).reading_level);
}

/** A public debate's level: its own, and Plain words when it has none. */
export function publicDebateLevel(debate: object): ReadingLevel {
  return readingLevelOf(debate) ?? "plain";
}

/** The level the map's loader names for a served debate (`level`), or null when the run read gave none. */
export function loadedLevelOf(load: object): ReadingLevel | null {
  return levelIn((load as Readonly<Record<string, unknown>>).level);
}
