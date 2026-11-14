"use client";

import { useLayoutEffect, type RefObject } from "react";

/** The custom property, on `<html>`, that says how much of the window's foot the cookie bar covers. */
export const CONSENT_BAR_ROOM = "--consent-bar-room";

/** Breathing room between a control scrolled clear of the bar and the bar itself. */
const GAP = 12;

/**
 * Keyboard audit, 12 Nov 2026 (WCAG 2.4.11, Focus Not Obscured). The first-visit cookie bar is fixed over the foot of the
 * window, so a control a keyboard user tabs to near the bottom edge sat behind it: the browser counts it as "in view" and
 * does not scroll. While the bar shows, this publishes the height it covers (it changes with the language and the window's
 * width, so it is measured, not guessed); `globals.css` turns it into scroll room for focused controls, room at the page's
 * end so the last controls can be scrolled clear, and a lift for the Help button that shares the corner.
 *
 * The bar itself still moves no focus and listens to nothing: it only lends its node.
 */
export function useConsentBarRoom(barRef: RefObject<HTMLElement | null>, shown: boolean): void {
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!shown || bar === null) return undefined;
    const root = document.documentElement;
    const publish = (): void => {
      const covered = window.innerHeight - bar.getBoundingClientRect().top;
      root.style.setProperty(CONSENT_BAR_ROOM, `${Math.max(0, Math.ceil(covered)) + GAP}px`);
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(CONSENT_BAR_ROOM);
    };
  }, [barRef, shown]);
}
