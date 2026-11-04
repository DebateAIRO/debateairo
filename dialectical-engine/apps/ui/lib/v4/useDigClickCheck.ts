"use client";

import { useCallback, useEffect, useRef } from "react";
import { crisisWordsOf } from "./askText.js";
import { digTargetKey } from "./digUndo.js";
import { askParentOf } from "./suggestions.js";
import type { DigMode, DigTarget } from "./types.js";

/*
 * V4 screen review, 3 Nov 2026 (OWNER-PICKS-2026-11-03.md, dig-f9): the crisis help and the one-time data consent run at
 * the dig's click, before its 10 seconds start, not when it is sent 10 seconds later, when the person may be reading
 * something else (or may have left the map, where a screen that opened would be lost). They are the site's own pieces,
 * lent by useV4Ask: its crisis check and help screen, its consent screen. No second crisis text.
 *  - The crisis check reads exactly the words the send reads: the person's own views in the dig (ASK-4: never the
 *    AI-written text around them), from the same parent the send builds (askParentOf, crisisWordsOf).
 *  - Only when both pass does the dig start its 10 seconds; nothing is sent here, and Undo still means nothing is sent
 *    (lib/v4/digUndo.ts). The send keeps its own checks (they pass at once by then).
 *  - The question-check screen cannot move here: it is the server's answer to a sent dig (ruling N4), so it may still
 *    appear after the 10 seconds; the page names the dig it is about.
 * Nothing here fetches or stores anything of its own; the consent read is useV4Ask's.
 */

export type DigClickChecks = Readonly<{
  /** useV4Ask's one-time consent (true: given now or before). */
  ensureConsent: () => Promise<boolean>;
  /** useV4Ask's crisis check on these words: true when it opened the help screen (then nothing starts). */
  offerCrisisHelp: (words: readonly string[]) => boolean;
}>;

/**
 * Returns `check(target, start)`: runs the crisis check and the consent for a dig of `target` from `parentRunId`, then
 * calls `start()` (which begins the 10 seconds) only when both pass. A second press on the same place while its check is
 * still open (the consent screen is up) does nothing. Resolves to whether the dig was started.
 */
export function useDigClickCheck(checks: DigClickChecks): (target: DigTarget, mode: DigMode, parentRunId: string, start: () => void) => Promise<boolean> {
  const live = useRef(checks);
  useEffect(() => {
    live.current = checks;
  });
  const open = useRef(new Set<string>());
  return useCallback(async (target: DigTarget, mode: DigMode, parentRunId: string, start: () => void): Promise<boolean> => {
    const key = digTargetKey(target);
    if (open.current.has(key)) return false;
    // V, 2026-09-30: the person's own words that read as a crisis get help numbers, never a dig, before anything else.
    if (live.current.offerCrisisHelp(crisisWordsOf("dig", "", askParentOf(parentRunId, target, mode)))) return false;
    open.current.add(key);
    let agreed = false;
    try {
      // V, 2026-09-29: no debate starts before the one-time sensitive-data consent.
      agreed = await live.current.ensureConsent();
    } catch {
      agreed = false;
    } finally {
      open.current.delete(key);
    }
    if (!agreed) return false;
    start();
    return true;
  }, []);
}
