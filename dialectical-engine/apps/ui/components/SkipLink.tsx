"use client";

import type { MouseEvent, ReactNode } from "react";

/**
 * Where a page that draws its own header inside the main area says its content starts: the first element after that
 * header carries `id="page-content"` and `tabIndex={-1}` (one per page).
 */
const PAGE_CONTENT = "page-content";

/**
 * The layout's "Skip to main content" (keyboard audit 2026-11-12, CHR1-4). It is a plain link to `#main-content`, and that
 * is what it does before any script runs and on every page with no mark. On the landing, /help, the debate pages and the V4
 * pages the header is inside the main area, so that jump skipped nothing: there it goes to the page's mark instead.
 */
export function SkipLink({ children }: Readonly<{ children: ReactNode }>) {
  const skip = (event: MouseEvent<HTMLAnchorElement>): void => {
    // A press that opens a new tab or window is the browser's.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(PAGE_CONTENT);
    if (target === null) return;
    target.focus({ preventScroll: true });
    // A mark that cannot hold focus (its page hidden behind the Terms screen): the plain jump to the main area.
    if (document.activeElement !== target) return;
    event.preventDefault();
    bringIntoView(target);
  };
  return <a className="skipLink" href="#main-content" onClick={skip}>{children}</a>;
}

/** Scrolls only when the start is out of view or under a header that sticks, and then keeps it clear of that header. */
function bringIntoView(target: HTMLElement): void {
  const room = stuckRoom(target);
  const top = target.getBoundingClientRect().top;
  if (top >= room && top < window.innerHeight) return;
  const kept = target.style.scrollMarginTop;
  target.style.scrollMarginTop = `${room}px`;
  target.scrollIntoView?.({ block: "start" });
  target.style.scrollMarginTop = kept;
}

/**
 * How much of the top of the window a sticky or fixed bar before the target covers once it sticks (the classic debate
 * page's top bar on a phone, the V4 map's pinned "where you are" bar): the bars among the earlier siblings of the target
 * and of each of its parents.
 */
function stuckRoom(target: HTMLElement): number {
  let room = 0;
  for (let node: Element | null = target; node !== null && node !== document.body; node = node.parentElement) {
    for (let before = node.previousElementSibling; before !== null; before = before.previousElementSibling) {
      const style = window.getComputedStyle(before);
      if ((style.position !== "sticky" && style.position !== "fixed") || style.top === "auto" || style.top === "") continue;
      const covers = (Number.parseFloat(style.top) || 0) + before.getBoundingClientRect().height;
      if (covers > room) room = covers;
    }
  }
  return room;
}
