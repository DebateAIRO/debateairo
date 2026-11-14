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
 *
 * The throwaway node is the helper's own trick, not something a browser does, so its focus events are kept from the page:
 * a browser fires no `focusin` on anything when it lets go of a disabled control, and code that listens for focus (the
 * focus guard, 12 Nov 2026) must not see one here either. The disabled control's own `blur` still fires, and, as in a
 * browser, it names no element that focus went to (`relatedTarget` is null): code that asks "did focus leave this
 * part?" on blur must get the browser's answer here.
 */
const SINK = "data-focus-fixup-sink";

export function installFocusFixup(): () => void {
  const quiet = (event: Event): void => {
    if (event.target instanceof Element && event.target.hasAttribute(SINK)) {
      event.stopImmediatePropagation();
      return;
    }
    const to = event instanceof FocusEvent ? event.relatedTarget : null;
    if (!(to instanceof Element) || !to.hasAttribute(SINK)) return;
    // The control's own blur, told again without the helper's node in it.
    event.stopImmediatePropagation();
    event.target?.dispatchEvent(new FocusEvent(event.type, { bubbles: event.bubbles, composed: true, relatedTarget: null }));
  };
  const sinkEvents = ["focus", "focusin", "blur", "focusout"] as const;
  for (const type of sinkEvents) window.addEventListener(type, quiet, true);
  const observer = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return;
    if (!active.matches(":disabled")) return;
    const sink = document.createElement("span");
    sink.tabIndex = -1;
    sink.setAttribute(SINK, "");
    document.body.append(sink);
    sink.focus();
    sink.remove();
  });
  observer.observe(document, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
  return () => {
    observer.disconnect();
    for (const type of sinkEvents) window.removeEventListener(type, quiet, true);
  };
}
