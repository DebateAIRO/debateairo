"use client";

import { useCallback, useEffect, useRef } from "react";

/*
 * V4 screen review, 3 Nov 2026 (OWNER-PICKS-2026-11-03.md, dig-f9): the crisis help and the one-time data consent run at
 * a dig's click, before its Undo window starts, not when it is sent once the window is over, when the person may be reading
 * something else or may have left the page, where a screen that opened would be lost. One piece for every dig press of
 * the site (the map's queue, lib/v4/useDigQueue.tsx, and a public page's dig box, components/v4/V4PublicLane.tsx), lent
 * the site's own screens by useV4Ask: its crisis check and help screen, its consent screen. No second crisis text.
 *  - V, 2026-09-30: the words checked are the person's own views in the dig (ASK-4: never the AI-written text around
 *    them), exactly the ones the send reads (the caller passes crisisWordsOf of the parent it will send).
 *  - V, 2026-09-29: the one-time consent opens at the press; "No" starts nothing. One consent question at a time: a
 *    second press anywhere while it is open waits for the same answer, and a second press on the same place does nothing.
 *  - Only when both pass may the caller start the Undo window; nothing is sent here, and Undo still means nothing is sent
 *    (lib/v4/digUndo.ts). The send keeps its own checks (they pass at once by then).
 * Nothing here fetches or keeps anything of its own; the consent read is useV4Ask's. Memory only.
 */

export type DigClickChecks = Readonly<{
  /** useV4Ask's one-time consent (true: given now or before). */
  ensureConsent: () => Promise<boolean>;
  /** useV4Ask's crisis check on these words: true when it opened the help screen (then nothing starts). */
  offerCrisisHelp: (words: readonly string[]) => boolean;
}>;

/**
 * Returns `check(place, words)`: the crisis check on `words`, then the consent, for a dig of `place` (a key that names
 * the place on its page). Resolves true only when the dig may start its Undo window now; false when the help screen
 * opened, the consent was refused, or a check of the same place is already open.
 */
export function useDigClickCheck(checks: DigClickChecks): (place: string, words: readonly string[]) => Promise<boolean> {
  const live = useRef(checks);
  useEffect(() => {
    live.current = checks;
  });
  const consentAsk = useRef<Promise<boolean> | null>(null);
  const askConsent = useCallback((): Promise<boolean> => {
    const pending = consentAsk.current;
    if (pending !== null) return pending;
    const asked = Promise.resolve().then(() => live.current.ensureConsent()).catch(() => false);
    consentAsk.current = asked;
    void asked.then(() => {
      if (consentAsk.current === asked) consentAsk.current = null;
    });
    return asked;
  }, []);
  /** The places whose consent is open right now (a second press there does nothing more). */
  const open = useRef(new Set<string>());
  return useCallback(async (place: string, words: readonly string[]): Promise<boolean> => {
    if (open.current.has(place)) return false;
    // V, 2026-09-30: the person's own words that read as a crisis get help numbers, never a dig, before anything else.
    if (live.current.offerCrisisHelp(words)) return false;
    open.current.add(place);
    try {
      return await askConsent();
    } finally {
      open.current.delete(place);
    }
  }, [askConsent]);
}
