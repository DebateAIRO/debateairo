"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addressPicksOf, addressWith, draftFromAddress, picksFromSearch, picksKeyOf, selectionFromSearch, type AddressPick
} from "./questionAddress.js";
import type { V4DigDraft, V4Map, V4Selection } from "./types.js";

/*
 * V4 screen review, 3 Nov (journey-d4 A, map-f24): one rule on every screen size. Opening a question adds one step to the
 * browser's history, so Back returns to the question before; Back and Forward open the question the address names; a
 * reload or a shared link opens it again. Opening the phone's Map sheet leaves no step behind (it holds one while it is
 * open and gives it back when it closes), so Back with the sheet open closes the sheet and stays on the question. The
 * ticked picks ride along in the address (lib/v4/questionAddress.ts); a traversal never brings old ticks back, it writes
 * the page's own ticks into the address it lands on.
 *
 * The address is written with `history.pushState(null, "", href)` / `replaceState`: Next's patched history methods then
 * keep their own state and tell the router (as lib/v4/useReadingLevel.ts does for `?level=`). Nothing is kept in the
 * browser's storage. Every history call is guarded: without a history API the page still works, without addresses.
 */

export type QuestionAddress = Readonly<{
  /** The question the page has open (it may name one the map does not have; the page then shows the main question). */
  selected: V4Selection;
  /** Opens a question: one new step in the history (none when it is already the open one). Closes the Map sheet. */
  openQuestion: (selection: V4Selection) => void;
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
}>;

function hereHref(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

/** The question the current address names (null: none, or no window). */
export function selectionInAddress(): V4Selection | null {
  if (typeof window === "undefined") return null;
  return selectionFromSearch(window.location.search);
}

function writeAddress(kind: "push" | "replace", href: string): boolean {
  try {
    if (href === hereHref()) return kind === "replace";
    if (kind === "push") window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
    return true;
  } catch {
    // No history API (or a sandboxed frame): the page keeps working in React state.
    return false;
  }
}

/**
 * The page's open question, kept in the address. `initial` is used when the address names none (the server's reading of
 * the same address). `picks` are the ticks to keep in the address; null while the page has not read the address's own
 * ticks back yet (they are left as they are). `onTraverse` hears each question Back or Forward opened.
 */
export function useQuestionAddress(input: Readonly<{
  initial: V4Selection;
  picks: readonly AddressPick[] | null;
  onTraverse: (selection: V4Selection) => void;
}>): QuestionAddress {
  const [selected, setSelected] = useState<V4Selection>(() => selectionInAddress() ?? input.initial);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** The page this hook serves: a traversal to another page is that page's business. */
  const pagePath = useRef(typeof window === "undefined" ? "" : window.location.pathname);
  /** True while the Map sheet holds a step of its own in the history. */
  const sheetStep = useRef(false);
  const selectedRef = useRef(selected);
  const picksRef = useRef(input.picks);
  const onTraverseRef = useRef(input.onTraverse);
  useEffect(() => {
    selectedRef.current = selected;
    picksRef.current = input.picks;
    onTraverseRef.current = input.onTraverse;
  });

  const openQuestion = useCallback((selection: V4Selection): void => {
    if (typeof window !== "undefined") {
      const href = addressWith(hereHref(), selection, picksRef.current);
      if (sheetStep.current) {
        // A row of the sheet: the sheet's own step becomes the question's, so the sheet leaves none behind.
        sheetStep.current = false;
        if (href === hereHref()) {
          try {
            window.history.back();
          } catch {
            // Nothing to give back without a history API.
          }
        } else writeAddress("replace", href);
      } else writeAddress("push", href);
    }
    selectedRef.current = selection;
    setSelected(selection);
    setSheetOpen(false);
  }, []);

  const openSheet = useCallback((): void => {
    if (typeof window !== "undefined" && !sheetStep.current) {
      try {
        window.history.pushState(null, "", hereHref());
        sheetStep.current = true;
      } catch {
        // The sheet still opens; Back then leaves the question as it always did.
      }
    }
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback((): void => {
    setSheetOpen(false);
    if (!sheetStep.current || typeof window === "undefined") return;
    sheetStep.current = false;
    try {
      window.history.back();
    } catch {
      // Nothing to give back without a history API.
    }
  }, []);

  // Back and Forward: open the question the address names, close the sheet, and write the page's own ticks.
  useEffect(() => {
    const onTraversal = (): void => {
      if (window.location.pathname !== pagePath.current) return;
      sheetStep.current = false;
      setSheetOpen(false);
      const next = selectionInAddress() ?? "root";
      if (picksRef.current !== null) writeAddress("replace", addressWith(hereHref(), next, picksRef.current));
      if (next === selectedRef.current) return;
      selectedRef.current = next;
      setSelected(next);
      onTraverseRef.current(next);
    };
    window.addEventListener("popstate", onTraversal);
    return () => window.removeEventListener("popstate", onTraversal);
  }, []);

  // The ticks change: the address of the question on screen follows, with no new step.
  const picksKey = input.picks === null ? null : picksKeyOf(input.picks);
  useEffect(() => {
    if (picksKey === null || typeof window === "undefined") return;
    writeAddress("replace", addressWith(hereHref(), selectedRef.current, picksRef.current));
  }, [picksKey]);

  return { selected, openQuestion, sheetOpen, openSheet, closeSheet };
}

/**
 * dig-f23: the ticks the address keeps come back once the map is drawn (a reload or a shared link keeps them), then
 * follow the page's draft. Returns the ticks to write into the address, or null until the address's own were read back
 * (so nothing wipes them while the map loads). A map that cannot be dug from takes none.
 */
export function useAddressPicks(input: Readonly<{
  map: V4Map | null;
  canDig: boolean;
  draft: V4DigDraft;
  commit: (draft: V4DigDraft) => void;
}>): readonly AddressPick[] | null {
  const { map, canDig, draft, commit } = input;
  /** The address's ticks as the page opened (read once, before the page writes any). */
  const [fromAddress] = useState<readonly AddressPick[]>(() => (typeof window === "undefined" ? [] : picksFromSearch(window.location.search)));
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    // While the story is being written the map's paths stand in for the real ones; their ticks wait for those.
    if (restored || map === null || map.storyState === "WRITING") return;
    if (canDig && fromAddress.length > 0 && draft.picks.length === 0) {
      const back = draftFromAddress(map, fromAddress);
      if (back.picks.length > 0) commit(back);
    }
    setRestored(true);
  }, [restored, map, canDig, fromAddress, draft, commit]);
  const picks = useMemo(() => addressPicksOf(draft), [draft]);
  return restored ? picks : null;
}
