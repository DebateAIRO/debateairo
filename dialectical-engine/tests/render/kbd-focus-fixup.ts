/**
 * The HTML focus fixup rule, for jsdom.
 *
 * A browser that disables the control holding keyboard focus moves focus to the page: Chromium
 * blurs it at the next update, so `document.activeElement` becomes `<body>` and the next Tab
 * starts from the top of the document. jsdom does not implement the rule — the disabled control
 * stays `document.activeElement`, and its `blur()` refuses an element it no longer counts as
 * focusable — so a render test cannot see the focus loss a keyboard-only person meets after
 * pressing a control that disables itself (Start, a Help suggestion).
 *
 * `installFocusFixup()` applies the rule: whenever a `disabled` attribute changes and the active
 * element now matches `:disabled`, focus is dropped to `<body>` the way jsdom drops it for a
 * removed element (a throwaway focusable node takes focus and leaves). It returns the uninstall.
 */
export function installFocusFixup(): () => void {
  const observer = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return;
    if (!active.matches(":disabled")) return;
    const sink = document.createElement("span");
    sink.tabIndex = -1;
    document.body.append(sink);
    sink.focus();
    sink.remove();
  });
  observer.observe(document, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
  return () => observer.disconnect();
}
