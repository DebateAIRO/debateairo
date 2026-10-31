"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReadingLevel } from "./types.js";
import { LEVEL_PARAM, levelHref, parseReadingLevel } from "./storage.js";
import { readAccountLevel, saveAccountLevel } from "./accountMemory.js";

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
 * V4 account memory (owner ruling N7, 2026-10-29): the level the person chose is also kept in their ACCOUNT, so it comes
 * back on a fresh visit and on another device. A level in the address still wins for that view. With none, the account's
 * level is read once and used when it arrives (unless the person chose meanwhile); a choice is saved to the account,
 * best-effort. A failed read leaves the page as it was without memory.
 *
 * The address is read from window.location (re-read on every render and on popstate) rather than through Next's
 * useSearchParams, so this module needs nothing from Next: the repository's root typecheck reads lib/v4/storage.ts
 * (through its tests), which re-exports this hook, and cannot resolve Next's extensionless subpaths.
 */

/** Where the account's level is read from and saved to (lib/v4/accountMemory.ts); tests pass their own. */
export type LevelMemory = Readonly<{
  read(): Promise<ReadingLevel | null>;
  save(level: ReadingLevel): Promise<unknown>;
}>;

const ACCOUNT_LEVEL: LevelMemory = Object.freeze({
  read: () => readAccountLevel(),
  save: (level: ReadingLevel) => saveAccountLevel(level)
});

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
 * null when absent), else from the account once read; lives in React state, follows the address when it changes, and on
 * change rewrites `?level=` (so a reload or a shared link keeps it) and saves it to the account. The third value says
 * whether the account's level is known (read, failed, or not needed because the address names one), so a page can wait
 * for it before offering a first choice.
 */
export function useReadingLevel(
  initial: ReadingLevel | null,
  memory: LevelMemory = ACCOUNT_LEVEL
): readonly [ReadingLevel | null, (level: ReadingLevel) => void, boolean] {
  const fallback = parseReadingLevel(initial);
  // While hydrating, React uses the server's reading (the same address), then the browser's.
  const fromAddress = useSyncExternalStore(onTraversal, levelInAddress, () => fallback);
  const [level, setLevel] = useState<ReadingLevel | null>(() => fromAddress ?? fallback);
  const addressNamesOne = fromAddress !== null || fallback !== null;
  const [accountSettled, setAccountSettled] = useState(false);
  /** Set once the person chooses here: a late account read never overrides a choice. */
  const chosen = useRef(false);
  const memoryRef = useRef(memory);
  useEffect(() => {
    // An address without a level keeps what the page holds (the person may not have chosen yet).
    if (fromAddress !== null) setLevel(fromAddress);
  }, [fromAddress]);
  useEffect(() => {
    // Read once per page: with a level in the address there is nothing to look up (that level wins for this view).
    if (addressNamesOne) return;
    let active = true;
    memoryRef.current.read().then(
      (saved) => {
        if (!active) return;
        if (saved !== null && !chosen.current && levelInAddress() === null) setLevel(saved);
        setAccountSettled(true);
      },
      () => {
        if (active) setAccountSettled(true);
      }
    );
    return () => {
      active = false;
    };
  }, [addressNamesOne]);
  const choose = useCallback((next: ReadingLevel): void => {
    const checked = parseReadingLevel(next);
    if (checked === null) return;
    chosen.current = true;
    setLevel(checked);
    writeLevelToAddress(checked);
    void memoryRef.current.save(checked).catch(() => undefined);
  }, []);
  return [level, choose, addressNamesOne || accountSettled || chosen.current] as const;
}
