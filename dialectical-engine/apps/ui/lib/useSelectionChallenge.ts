"use client";

import { useEffect, useRef } from "react";

/** Marks an argument's prose as challengeable; the value is the argument's node id. */
export const CHALLENGE_PROSE_ATTRIBUTE = "data-challenge-prose";

/**
 * Opens the challenge for a sentence selected WITHOUT a mouse. A mouse selection already reaches
 * each view's `onMouseUp`. A selection made with the keyboard (caret browsing) or by a screen
 * reader (which sets the page's selection itself, with no mouse event at all) only shows up as
 * `selectionchange`, so this listens there, waits until the selection has rested, and hands over
 * the argument id and the selected text when the selection lies inside challengeable prose.
 */
export function useSelectionChallenge(
  enabled: boolean,
  onSelect: (nodeId: string, text: string) => void
): void {
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = 0;
    let pointerDown = false;
    const down = (): void => {
      pointerDown = true;
    };
    const up = (): void => {
      pointerDown = false;
    };
    const changed = (): void => {
      window.clearTimeout(timer);
      if (pointerDown) return;
      timer = window.setTimeout(() => {
        const selection = window.getSelection();
        if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return;
        const anchor = selection.getRangeAt(0).commonAncestorContainer;
        const element = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
        const prose = element?.closest(`[${CHALLENGE_PROSE_ATTRIBUTE}]`) ?? null;
        const nodeId = prose?.getAttribute(CHALLENGE_PROSE_ATTRIBUTE) ?? "";
        const text = selection.toString().trim();
        if (nodeId === "" || text.length < 4) return;
        onSelectRef.current(nodeId, text);
      }, 700);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("selectionchange", changed);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("selectionchange", changed);
    };
  }, [enabled]);
}
