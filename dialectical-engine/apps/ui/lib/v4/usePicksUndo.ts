"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_DRAFT } from "./suggestions.js";
import type { V4DigDraft } from "./types.js";

/*
 * V4 screen review, 3 Nov (dig-f23): "Clear" no longer wipes the picks for good. After it, "Picks cleared [Undo]" shows
 * for 10 seconds, and Undo brings every pick back as it was (edited wordings and own views included: the words were only
 * ever in the page's memory). A new pick, or a dig being started, ends the offer. Memory only; nothing is stored.
 */

/** How long "Picks cleared" offers Undo (the site's Undo time). */
export const PICKS_UNDO_MS = 10_000;

export type PicksUndo = Readonly<{
  /** True while "Picks cleared [Undo]" shows. */
  offered: boolean;
  /** Clears every pick and offers Undo (nothing to clear: nothing happens). */
  clear: () => void;
  undo: () => void;
  /** Ends the offer without bringing the picks back. */
  dismiss: () => void;
}>;

export function usePicksUndo(input: Readonly<{
  draft: V4DigDraft;
  /** The page's draft as it is now (a ref, so Clear always takes the latest picks). */
  current: Readonly<{ current: V4DigDraft }>;
  commit: (draft: V4DigDraft) => void;
}>): PicksUndo {
  const { draft, current, commit } = input;
  const [before, setBefore] = useState<V4DigDraft | null>(null);
  const beforeRef = useRef(before);
  useEffect(() => {
    beforeRef.current = before;
  });

  const clear = useCallback((): void => {
    const now = current.current;
    if (now.picks.length === 0) return;
    commit(EMPTY_DRAFT);
    setBefore(now);
  }, [current, commit]);

  const undo = useCallback((): void => {
    const kept = beforeRef.current;
    setBefore(null);
    if (kept !== null) commit(kept);
  }, [commit]);

  const dismiss = useCallback((): void => setBefore(null), []);

  // Ten seconds, then the offer ends.
  useEffect(() => {
    if (before === null) return;
    const timer = window.setTimeout(() => setBefore(null), PICKS_UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [before]);

  // A new pick ends the offer (Undo would otherwise drop it).
  useEffect(() => {
    if (draft.picks.length > 0 && beforeRef.current !== null && draft !== beforeRef.current) setBefore(null);
  }, [draft]);

  return { offered: before !== null, clear, undo, dismiss };
}
