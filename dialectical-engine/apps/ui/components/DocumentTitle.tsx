"use client";

import * as React from "react";

const PAGE_HEADING = "#main-content h1, #main-content [role='heading'][aria-level='1']";

function pageHeadingText(): string {
  for (const heading of document.querySelectorAll<HTMLElement>(PAGE_HEADING)) {
    if (heading.closest("[hidden], [aria-hidden='true'], [inert]") !== null) continue;
    const text = (heading.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text !== "") return text;
  }
  return "";
}

/**
 * Gives every page its own tab title, "<the page's h1> — <brand>", so a screen reader says where
 * the reader landed and the tab list tells pages apart. It needs no string of its own: the h1 is
 * already in the reader's language. It follows the h1 as it changes (a sign-up step, a debate
 * loading in) and re-applies itself when the router writes the layout's brand title back.
 */
export function DocumentTitle({ brand }: { brand: string }): null {
  React.useEffect(() => {
    // A timer, not an animation frame: frames do not run in a background tab, and a page
    // opened there must still carry its own title in the tab list.
    let pending = 0;
    const apply = (): void => {
      pending = 0;
      const heading = pageHeadingText();
      const desired = heading !== "" && heading !== brand ? `${heading} — ${brand}` : brand;
      if (document.title !== desired) document.title = desired;
    };
    const schedule = (): void => {
      if (pending === 0) pending = window.setTimeout(apply, 0);
    };
    apply();
    const observer = new MutationObserver(schedule);
    const main = document.getElementById("main-content");
    if (main !== null) observer.observe(main, { childList: true, subtree: true, characterData: true });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (pending !== 0) window.clearTimeout(pending);
    };
  }, [brand]);
  return null;
}
