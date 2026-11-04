"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/*
 * V4 screen review, 3 Nov (dig-f23, journey-d4 A): words the person typed are never lost without a question.
 *  - useTypedWords: words typed on the map page and not added yet (an own view, a wording being edited), kept in the
 *    page's memory while the person moves between questions. Never in the address and never in the browser's storage
 *    (personal words do not go in an address; the cookie inventory is law), so they last as long as the page.
 *  - useLeaveSiteGuard: while there are such words, a reload or closing the tab gets the browser's own "Leave site?".
 *  - useLeaveLinkGuard: a link to another page of the site asks first, in the page ("Leave this page? Your view isn't
 *    added yet."); Leave follows the link as it would have gone, Stay keeps the person where they are.
 */

/** Runs of spaces and line breaks closed up, so a moved space is not "typed words". */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export type TypedWords = Readonly<{
  /** The words kept under `key` (null: none). */
  get(key: string): string | null;
  /** Keeps `text` under `key` (null: forgets it). `from` is what the box started with: words equal to it are not typed. */
  set(key: string, text: string | null, from?: string): void;
  /** Whether any kept words differ from what their box started with. */
  any(): boolean;
}>;

/** The page's typed words: one stable object (writing to it never re-renders the page). */
export function useTypedWords(): TypedWords {
  const kept = useRef(new Map<string, Readonly<{ text: string; from: string }>>());
  return useMemo<TypedWords>(() => Object.freeze({
    get: (key: string) => kept.current.get(key)?.text ?? null,
    set: (key: string, text: string | null, from = "") => {
      if (text === null) kept.current.delete(key);
      else kept.current.set(key, { text, from });
    },
    any: () => [...kept.current.values()].some((entry) => oneLine(entry.text).length > 0 && oneLine(entry.text) !== oneLine(entry.from))
  }), []);
}

/**
 * The browser's own "Leave site?" on a reload or a closed tab while `unsaved()` says words would be lost. `unsaved` is
 * asked at that moment, so it can read refs; `disarmed` (a ref) set true lets the page go without asking.
 */
export function useLeaveSiteGuard(unsaved: () => boolean, disarmed?: Readonly<{ current: boolean }>): void {
  const unsavedRef = useRef(unsaved);
  useEffect(() => {
    unsavedRef.current = unsaved;
  });
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (disarmed?.current === true || !unsavedRef.current()) return;
      event.preventDefault();
      // Older browsers ask only when returnValue is set; every browser shows its own words.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [disarmed]);
}

export type LeaveLinkGuard = Readonly<{
  /** True while the page asks whether to leave. */
  asking: boolean;
  leave: () => void;
  stay: () => void;
}>;

/** Whether a click on `anchor` would take this tab to another page (not a new tab, a download or a part of this page). */
function leavesThisPage(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if ((anchor.target !== "" && anchor.target !== "_self") || anchor.hasAttribute("download")) return false;
  const raw = anchor.getAttribute("href");
  if (raw === null || raw.length === 0 || raw.startsWith("#")) return false;
  try {
    const next = new URL(anchor.href, window.location.href);
    return next.origin !== window.location.origin || next.pathname !== window.location.pathname;
  } catch {
    return false;
  }
}

/**
 * Asks in the page before a link takes the person to another page while `unsaved()` says words would be lost; also arms
 * the browser's own question for a reload or a closed tab (useLeaveSiteGuard). Leave lets the same link go on (a link of
 * the site keeps its own way of opening the page), and nothing asks again on the way out.
 */
export function useLeaveLinkGuard(unsaved: () => boolean): LeaveLinkGuard {
  const unsavedRef = useRef(unsaved);
  useEffect(() => {
    unsavedRef.current = unsaved;
  });
  const leaving = useRef(false);
  const passing = useRef(false);
  const held = useRef<HTMLAnchorElement | null>(null);
  const [asking, setAsking] = useState(false);
  useLeaveSiteGuard(unsaved, leaving);

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (passing.current || leaving.current) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || !leavesThisPage(event, anchor) || !unsavedRef.current()) return;
      // Held before the page's own handlers (a site link included) see it.
      event.preventDefault();
      event.stopPropagation();
      held.current = anchor;
      setAsking(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const leave = useCallback((): void => {
    const anchor = held.current;
    held.current = null;
    setAsking(false);
    if (anchor === null) return;
    leaving.current = true;
    if (anchor.isConnected) {
      passing.current = true;
      try {
        anchor.click();
      } finally {
        passing.current = false;
      }
      return;
    }
    window.location.assign(anchor.href);
  }, []);

  const stay = useCallback((): void => {
    const anchor = held.current;
    held.current = null;
    setAsking(false);
    anchor?.focus();
  }, []);

  return { asking, leave, stay };
}
