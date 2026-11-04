"use client";

import { useCallback, useEffect, useRef, type FocusEvent } from "react";

/*
 * The wave-2 checks (4 Nov, ACCESS NEW-1 and its follow-ups): a part that holds focus and then goes (the report's waiting
 * card once the report is there, "Try now" once the connection is back, a pause block once the run continues) hands focus
 * on, never to the page's body (WCAG 2.4.3), and without scrolling the page (journey-f17: focus kept where it was, nothing
 * moves).
 *
 * Whether the part holds focus comes from its own focus events: focus moving to another element clears it, and so does focus
 * going to the page itself (a click on plain text, which blurs with nothing next while the part stays). A part taken away
 * while focused sends no event, or a blur with nothing next while it is already gone, so it still counts as held. The hand-off
 * happens when `shown` turns false, or when the component that holds the part goes, and only while nothing else has focus.
 * Nothing is kept anywhere.
 */

export type FocusHandOff = Readonly<{
  /** For the part's own element (React's focus events bubble, so a container sees focus on anything inside it). */
  onFocus: () => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
}>;

/** True when no element holds focus (the page's body has it). */
function focusOnPage(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body;
}

/** Gives `element` focus where it is, without scrolling the page to it. */
export function focusInPlace(element: HTMLElement | null | undefined): void {
  if (element === null || element === undefined || !element.isConnected) return;
  element.focus({ preventScroll: true });
}

export function useFocusHandOff(shown: boolean, onGone: (() => void) | undefined): FocusHandOff {
  const held = useRef(false);
  const live = useRef(onGone);
  useEffect(() => {
    live.current = onGone;
  });
  useEffect(() => {
    if (shown || !held.current) return;
    held.current = false;
    if (focusOnPage()) live.current?.();
  }, [shown]);
  // The component itself goes (a pause block once the run continues): the page has drawn what comes next by the time the
  // timer runs.
  useEffect(() => () => {
    if (!held.current) return;
    held.current = false;
    window.setTimeout(() => {
      if (focusOnPage()) live.current?.();
    }, 0);
  }, []);
  const onFocus = useCallback((): void => {
    held.current = true;
  }, []);
  const onBlur = useCallback((event: FocusEvent<HTMLElement>): void => {
    const part = event.currentTarget;
    const next = event.relatedTarget;
    if (next instanceof Node) {
      if (!part.contains(next)) held.current = false;
      return;
    }
    // Nothing next: a click on plain text, the window losing focus, or the part being taken away. Looked at once the
    // browser has settled: still on the page and without focus means focus went to the page itself.
    window.setTimeout(() => {
      if (part.isConnected && !part.contains(document.activeElement)) held.current = false;
    }, 0);
  }, []);
  return { onFocus, onBlur };
}
