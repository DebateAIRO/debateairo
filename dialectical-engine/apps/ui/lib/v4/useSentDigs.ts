import type { SentDig } from "./digRetry.js";

/*
 * Owner review 3 Nov 2026 (dig-f12): "Try this dig again" digs the same picks. The digs this visit sends are remembered
 * exactly as sent, by their run id, in memory only (module level, like the page's own dig links of this visit: they
 * survive moving between V4 pages, and are gone on reload; never in the browser's storage). The page's send records each
 * dig it started (with the shared dig Undo, lib/v4/digUndo.ts, the send knows its new run id).
 */

const sentThisVisit = new Map<string, SentDig>();

/** The dig this visit sent as run `childRunId`, exactly as sent; null when it was not sent in this visit. */
export function sentDigOf(childRunId: string): SentDig | null {
  return sentThisVisit.get(childRunId) ?? null;
}

/** Remembers a dig this visit sent, as it was sent, under its new run id. */
export function rememberSentDig(childRunId: string, sent: SentDig): void {
  sentThisVisit.set(childRunId, sent);
}
