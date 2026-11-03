"use client";

import * as React from "react";
import { HIDDEN_BY_DIALOG_ATTRIBUTE } from "@/components/dialogSurface";

const PAGE_HEADING = "#main-content h1, #main-content [role='heading'][aria-level='1']";
// An open dialog hides the page from screen readers, but the tab is still that page.
const NOT_THE_PAGE_HEADING = `[hidden], [inert], [aria-hidden='true']:not([${HIDDEN_BY_DIALOG_ATTRIBUTE}])`;

/** A page's state word for its tab (V4 wait-f4: "Looking into it", "Ready", "(1) changed"), already in the reader's language. */
export const TAB_PREFIX_ATTRIBUTE = "data-tab-prefix";

function pageHeadingText(): string {
  for (const heading of document.querySelectorAll<HTMLElement>(PAGE_HEADING)) {
    if (heading.closest(NOT_THE_PAGE_HEADING) !== null) continue;
    const text = (heading.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text !== "") return text;
  }
  return "";
}

function pagePrefixText(main: HTMLElement | null): string {
  if (main === null) return "";
  for (const element of main.querySelectorAll<HTMLElement>(`[${TAB_PREFIX_ATTRIBUTE}]`)) {
    if (element.closest("[hidden], [inert]") !== null) continue;
    const text = (element.getAttribute(TAB_PREFIX_ATTRIBUTE) ?? "").replace(/\s+/g, " ").trim();
    if (text !== "") return text;
  }
  return "";
}

/**
 * Gives every page its own tab title, "<the page's h1> — <brand>", so a screen reader says where
 * the reader landed and the tab list tells pages apart. It needs no string of its own: the h1 is
 * already in the reader's language. It follows the h1 as it changes (a sign-up step, a debate
 * loading in) and re-applies itself when the router writes the layout's brand title back.
 * V4 wait-f4 (owner, 3 Nov 2026): a page may put its state word first with `data-tab-prefix`
 * ("Ready · <h1> — <brand>"), so a person in another tab sees when their answer is ready.
 */
export function DocumentTitle({ brand }: { brand: string }): null {
  React.useEffect(() => {
    // A timer, not an animation frame: frames do not run in a background tab, and a page
    // opened there must still carry its own title in the tab list.
    let pending = 0;
    const main = document.getElementById("main-content");
    const apply = (): void => {
      pending = 0;
      const heading = pageHeadingText();
      const titled = heading !== "" && heading !== brand ? `${heading} — ${brand}` : brand;
      const prefix = pagePrefixText(main);
      const desired = prefix === "" ? titled : `${prefix} · ${titled}`;
      if (document.title !== desired) document.title = desired;
    };
    const schedule = (): void => {
      if (pending === 0) pending = window.setTimeout(apply, 0);
    };
    apply();
    const observer = new MutationObserver(schedule);
    if (main !== null) {
      observer.observe(main, {
        childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [TAB_PREFIX_ATTRIBUTE]
      });
    }
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (pending !== 0) window.clearTimeout(pending);
    };
  }, [brand]);
  return null;
}
