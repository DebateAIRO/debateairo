"use client";

import { useEffect, useRef } from "react";
import { linkOfSent, type SentDig } from "./digRetry.js";
import type { DigLink, PendingDig } from "./types.js";

/*
 * Owner review 3 Nov 2026 (dig-f12): "Try this dig again" digs the same picks. The digs this visit sends are remembered
 * exactly as sent, by their run id, in memory only (module level, like the page's own dig links of this visit: they
 * survive moving between V4 pages, and are gone on reload; never in the browser's storage). The page's send itself is not
 * touched: the dig last shown in the Undo note is matched to the dig link that appears once it is sent.
 */

const sentThisVisit = new Map<string, SentDig>();

/** The dig this visit sent as run `childRunId`, exactly as sent; null when it was not sent in this visit. */
export function sentDigOf(childRunId: string): SentDig | null {
  return sentThisVisit.get(childRunId) ?? null;
}

/** Remembers each dig the page sends: `pending` is the dig in its Undo window, `links` the page's dig links. */
export function useSentDigMemory(pending: PendingDig | null, links: readonly DigLink[]): void {
  const last = useRef<SentDig | null>(null);
  useEffect(() => {
    if (pending !== null) last.current = { target: pending.target, mode: pending.mode };
  }, [pending]);
  useEffect(() => {
    const sent = last.current;
    if (sent === null) return;
    const link = links.find((candidate) => !sentThisVisit.has(candidate.childRunId) && linkOfSent(candidate, sent));
    if (link === undefined) return;
    sentThisVisit.set(link.childRunId, sent);
    last.current = null;
  }, [links]);
}
