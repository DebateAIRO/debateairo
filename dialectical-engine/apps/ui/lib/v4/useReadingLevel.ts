"use client";

import { useCallback, useState } from "react";
import type { ReadingLevel } from "./types.js";
import { levelHref, parseReadingLevel } from "./storage.js";

/*
 * Fix wave 1 (Decision A): the reading level lives in React state and in the address (`?level=`), never in browser
 * storage. Re-exported from lib/v4/storage.ts (that module stays server-safe).
 */

/** Rewrites the current address's level without a new history entry or a reload. Never throws. */
function writeLevelToAddress(level: ReadingLevel): void {
  if (typeof window === "undefined") return;
  try {
    const { pathname, search, hash } = window.location;
    window.history.replaceState(window.history.state, "", levelHref(`${pathname}${search}${hash}`, level));
  } catch {
    // No history API (or a sandboxed frame): the level still holds for this page in React state.
  }
}

/**
 * The reading level for this page: starts from the server's reading of the address (`initial`, null when absent), lives
 * in React state, and on change rewrites `?level=` in the address so a reload or a shared link keeps it.
 */
export function useReadingLevel(initial: ReadingLevel | null): readonly [ReadingLevel | null, (level: ReadingLevel) => void] {
  const [level, setLevel] = useState<ReadingLevel | null>(() => parseReadingLevel(initial));
  const choose = useCallback((next: ReadingLevel): void => {
    const checked = parseReadingLevel(next);
    if (checked === null) return;
    setLevel(checked);
    writeLevelToAddress(checked);
  }, []);
  return [level, choose] as const;
}
