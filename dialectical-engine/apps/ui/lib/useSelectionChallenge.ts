"use client";

import { useCallback, useEffect, useRef } from "react";

/** Marks an argument's prose as challengeable; the value is the argument's node id. */
export const CHALLENGE_PROSE_ATTRIBUTE = "data-challenge-prose";

export type ProseSelection = { nodeId: string; text: string };

/** The page's current selection when it lies inside one argument's prose: that argument's id and the selected words. */
function selectedProse(): ProseSelection | null {
  const selection = typeof window === "undefined" ? null : window.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
  const anchor = selection.getRangeAt(0).commonAncestorContainer;
  const element = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
  const prose = element?.closest(`[${CHALLENGE_PROSE_ATTRIBUTE}]`) ?? null;
  const nodeId = prose?.getAttribute(CHALLENGE_PROSE_ATTRIBUTE) ?? "";
  const text = selection.toString().trim();
  if (nodeId === "" || text === "") return null;
  return { nodeId, text };
}

/** Whether that argument's prose on the page still holds those words (it may have been regenerated since). */
function proseHolds({ nodeId, text }: ProseSelection): boolean {
  const flat = (value: string): string => value.replace(/\s+/g, " ");
  return [...document.querySelectorAll(`[${CHALLENGE_PROSE_ATTRIBUTE}]`)]
    .some((prose) => prose.getAttribute(CHALLENGE_PROSE_ATTRIBUTE) === nodeId && flat(prose.textContent ?? "").includes(flat(text)));
}

/**
 * Opens the challenge for a sentence selected with a pointer that no view's `onMouseUp` sees (a
 * touch or pen selection, whose handles move with no mouse event; a mouse selection goes through
 * the views' own `onMouseUp`): it listens to `selectionchange`,
 * waits until the selection has rested, and hands over the argument id and the selected text when
 * the selection lies inside challengeable prose. A selection made with the KEYBOARD never opens it
 * (keyboard audit 2026-11-12): a pause while extending one with Shift+Arrow would pull focus away
 * mid-selection. The keyboard's route is the Challenge button, which carries the selection.
 *
 * Returns what that button reads: the words selected in one argument's prose, for its "Which
 * part?" box. The last such selection is kept until it is used or replaced, because caret
 * browsing moves the caret onto the button the person tabs to, and the selection collapses there.
 * It is forgotten when a pointer press drops it, when a popover opens (the page switches this hook
 * off while one is open), and when the argument's prose no longer holds those words.
 */
export function useSelectionChallenge(
  enabled: boolean,
  onSelect: (nodeId: string, text: string) => void
): (nodeId: string) => string {
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const lastRef = useRef<ProseSelection | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = 0;
    let pointerDown = false;
    // Whether the selection now forming was started by touch or pen: a key press since says it was not.
    // A mouse press never counts (keyboard audit 2026-11-12): the mouse has the views' onMouseUp, and a
    // screen reader selecting in browse mode sends the page no key, so an earlier click would open it.
    // An empty pointerType (a browser that does not say) counts as touch, so touch is never left out.
    let byPointer = false;
    // A pointer press since the last selection: a selection that collapses now was dropped by it.
    let pressed = false;
    const down = (event: PointerEvent): void => {
      pointerDown = true;
      pressed = true;
      byPointer = event.pointerType !== "mouse";
    };
    // A touch long-press usually ends in pointercancel (the browser takes the gesture over to select).
    const up = (): void => {
      pointerDown = false;
    };
    const key = (): void => {
      byPointer = false;
      window.clearTimeout(timer);
    };
    const changed = (): void => {
      window.clearTimeout(timer);
      const now = selectedProse();
      if (now !== null) {
        lastRef.current = now;
        pressed = false;
      } else if (window.getSelection()?.isCollapsed === false || pressed) lastRef.current = null;
      if (pointerDown || !byPointer) return;
      timer = window.setTimeout(() => {
        const selected = selectedProse();
        if (selected === null || selected.text.length < 4) return;
        lastRef.current = null;
        onSelectRef.current(selected.nodeId, selected.text);
      }, 700);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("keydown", key, true);
    document.addEventListener("selectionchange", changed);
    return () => {
      window.clearTimeout(timer);
      // Switched off while a popover is open: whatever opened it, the words it was opened with are spent.
      lastRef.current = null;
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("selectionchange", changed);
    };
  }, [enabled]);

  return useCallback((nodeId: string): string => {
    const remembered = lastRef.current;
    lastRef.current = null;
    const selected = selectedProse() ?? (remembered !== null && proseHolds(remembered) ? remembered : null);
    return selected?.nodeId === nodeId ? selected.text : "";
  }, []);
}
