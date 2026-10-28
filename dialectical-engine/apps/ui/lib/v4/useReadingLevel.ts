"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReadingLevel } from "./types.js";
import { LEVEL_PARAM, levelHref, parseReadingLevel } from "./storage.js";

/*
 * Fix wave 1 (Decision A): the reading level lives in React state and in the address (`?level=`), never in browser
 * storage. Re-exported from lib/v4/storage.ts (that module stays server-safe).
 *
 * Fix wave 2 (R2TIME-2): the address is the source of truth on the client. The level starts from the address, with the
 * server's reading as the fallback, and follows the address when Back/Forward changes it (a traversal restores an older
 * address while the cached server props may be stale). A change is written with `history.replaceState(null, "", href)`:
 * Next's patched replaceState then copies its own history state and tells its router, so the router's address follows
 * (passing the old state would make Next skip that).
 *
 * The address is read from window.location (re-read on every render and on popstate) rather than through Next's
 * useSearchParams, so this module needs nothing from Next: the repository's root typecheck reads lib/v4/storage.ts
 * (through its tests), which re-exports this hook, and cannot resolve Next's extensionless subpaths.
 */

/** The level in the current address, or null (no address on the server, or no valid level in it). */
function levelInAddress(): ReadingLevel | null {
  if (typeof window === "undefined") return null;
  try {
    return parseReadingLevel(new URLSearchParams(window.location.search).get(LEVEL_PARAM));
  } catch {
    return null;
  }
}

/** Back/Forward: the browser fires popstate after the address has changed. */
function onTraversal(changed: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("popstate", changed);
  return () => window.removeEventListener("popstate", changed);
}

/** Rewrites the current address's level without a new history entry or a reload. Never throws. */
function writeLevelToAddress(level: ReadingLevel): void {
  if (typeof window === "undefined") return;
  try {
    const { pathname, search, hash } = window.location;
    window.history.replaceState(null, "", levelHref(`${pathname}${search}${hash}`, level));
  } catch {
    // No history API (or a sandboxed frame): the level still holds for this page in React state.
  }
}

/**
 * The reading level for this page: starts from the address (`?level=`), else from the server's reading of it (`initial`,
 * null when absent), lives in React state, follows the address when it changes, and on change rewrites `?level=` so a
 * reload or a shared link keeps it.
 */
export function useReadingLevel(initial: ReadingLevel | null): readonly [ReadingLevel | null, (level: ReadingLevel) => void] {
  const fallback = parseReadingLevel(initial);
  // While hydrating, React uses the server's reading (the same address), then the browser's.
  const fromAddress = useSyncExternalStore(onTraversal, levelInAddress, () => fallback);
  const [level, setLevel] = useState<ReadingLevel | null>(() => fromAddress ?? fallback);
  useEffect(() => {
    // An address without a level keeps what the page holds (the person may not have chosen yet).
    if (fromAddress !== null) setLevel(fromAddress);
  }, [fromAddress]);
  const choose = useCallback((next: ReadingLevel): void => {
    const checked = parseReadingLevel(next);
    if (checked === null) return;
    setLevel(checked);
    writeLevelToAddress(checked);
  }, []);
  return [level, choose] as const;
}
