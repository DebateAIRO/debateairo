"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/*
 * The owner's screen review (3 Nov 2026: wait-f22, public-f15, map-f9, read-f20): the quota figures on a page are read
 * again when something that uses quota starts or finishes, and when the person comes back to the tab, never only once
 * when the page opens. Whoever knows such a moment calls quotaChanged(); every figure that listens (the header's pill,
 * "This question: N% of today", the borrow notices, the dig buttons' room read) reads again. It lives in the page's
 * memory only (no browser storage), like the dig Undo store.
 *
 * Who calls it: the map page when a dig is sent and when a dig or the question finishes (useQuotaMoments). The ask page's
 * step 2 (when it opens, and after a refused Start, read-f20) belongs to the start-step session: one call there.
 */

let beat = 0;
const listeners = new Set<() => void>();

/** Something that uses quota started or finished: the quota figures on the page read again. */
export function quotaChanged(): void {
  beat += 1;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const current = (): number => beat;
const onServer = (): number => 0;

/** A number that changes whenever quotaChanged() is called. */
export function useQuotaBeat(): number {
  return useSyncExternalStore(subscribe, current, onServer);
}

/**
 * Calls `read` after every quotaChanged() and whenever the tab is shown again (map-f9), never on the first render (the
 * caller reads once by itself). `enabled` false: nothing is read.
 */
export function useQuotaRefresh(read: () => void, enabled = true): void {
  const beatNow = useQuotaBeat();
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  const seen = useRef(beatNow);
  useEffect(() => {
    if (beatNow === seen.current) return;
    seen.current = beatNow;
    if (enabled) readRef.current();
  }, [beatNow, enabled]);
  useEffect(() => {
    if (!enabled) return undefined;
    const onShow = (): void => {
      if (document.visibilityState === "visible") readRef.current();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [enabled]);
}
