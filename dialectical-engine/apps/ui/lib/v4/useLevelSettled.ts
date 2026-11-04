"use client";

import { useEffect, useState } from "react";

/*
 * V4 screen review, 3 Nov (map-f6): the map page shows no reading level until the saved one is known, so it never says
 * "Some background" and then switches to "Plain words". The page keeps its loading outline until the level is known (the
 * address names one, or the account's level was read or could not be read). A read that never answers must not hold the
 * page forever: after LEVEL_WAIT_MS the page draws with the level it has.
 */

/** The longest the page waits for the account's reading level before it draws anyway. */
export const LEVEL_WAIT_MS = 4_000;

/** True once the reading level is known, or once the page has waited LEVEL_WAIT_MS since `ready` (it has something to draw). */
export function useLevelSettled(known: boolean, ready: boolean): boolean {
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (known || !ready || waited) return;
    const timer = window.setTimeout(() => setWaited(true), LEVEL_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [known, ready, waited]);
  return known || waited;
}
