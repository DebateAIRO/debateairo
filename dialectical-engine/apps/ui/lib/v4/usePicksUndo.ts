"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DIG_UNDO_MS } from "./digUndo.js";
import { EMPTY_DRAFT } from "./suggestions.js";
import type { V4DigDraft } from "./types.js";

/*
 * V4 screen review, 3 Nov (dig-f23): "Clear" no longer wipes the picks for good. After it, "Picks cleared [Undo]" shows
 * for 10 seconds, and Undo brings every pick back as it was (edited wordings and own views included: the words were only
 * ever in the page's memory). A new pick, or a dig being started, ends the offer. Memory only; nothing is stored. The note
 * itself is the shared Undo note (V4PicksClearedNote → V4UndoNote, journey-f21): same look, same 10 seconds.
 */

/** How long "Picks cleared" offers Undo: the site's one Undo time (row D decision 1, as a dig's). */
export const PICKS_UNDO_MS = DIG_UNDO_MS;

export type PicksUndo = Readonly<{
  /** True while "Picks cleared [Undo]" shows. */
  offered: boolean;
  /** When the offer ends (ms since the epoch), for the note's shrinking line; null when nothing is offered. */
  endsAt: number | null;
  /** Clears every pick and offers Undo (nothing to clear: nothing happens). */
  clear: () => void;
  undo: () => void;
  /** Ends the offer without bringing the picks back. */
  dismiss: () => void;
  /**
   * dig-f7: whether the note already took focus for this offer. The note is drawn again when the phone's Map sheet opens
   * or closes (it moves to the sheet's foot); only its first showing moves focus to Undo.
   */
  focusTaken: boolean;
  markFocusTaken: () => void;
}>;

export function usePicksUndo(input: Readonly<{
  draft: V4DigDraft;
  /** The page's draft as it is now (a ref, so Clear always takes the latest picks). */
  current: Readonly<{ current: V4DigDraft }>;
  commit: (draft: V4DigDraft) => void;
}>): PicksUndo {
  const { draft, current, commit } = input;
  const [before, setBefore] = useState<V4DigDraft | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [focusTaken, setFocusTaken] = useState(false);
  const beforeRef = useRef(before);
  useEffect(() => {
    beforeRef.current = before;
  });

  const clear = useCallback((): void => {
    const now = current.current;
    if (now.picks.length === 0) return;
    commit(EMPTY_DRAFT);
    setBefore(now);
    setEndsAt(Date.now() + PICKS_UNDO_MS);
    setFocusTaken(false);
  }, [current, commit]);
  const markFocusTaken = useCallback((): void => setFocusTaken(true), []);

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

  return { offered: before !== null, endsAt: before === null ? null : endsAt, clear, undo, dismiss, focusTaken, markFocusTaken };
}
