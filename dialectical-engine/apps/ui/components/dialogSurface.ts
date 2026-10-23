"use client";

import * as React from "react";
import { useModalSurface } from "@/components/consent/modalSemantics";

/**
 * For a dialog that is mounted only while it is open (the debate drawers, the guide, the
 * challenge popover). Returns the ref for the dialog element, which also needs `tabIndex={-1}`.
 *
 * It reuses the shared modal helper unchanged: focus moves onto the dialog itself, so a screen
 * reader announces its name and starts reading at its top. Tab stays inside, Escape closes the
 * topmost surface only, and closing returns focus to the control that opened it — or to
 * `returnFocusRef` when that control has left the page by then (the helper's own rule).
 */
export function useDialogSurface<T extends HTMLElement = HTMLElement>(
  onClose: () => void,
  returnFocusRef?: React.RefObject<HTMLElement | null>
): React.RefObject<T | null> {
  const containerRef = React.useRef<T | null>(null);
  useHideOutside(containerRef);
  useModalSurface(true, {
    containerRef: containerRef as React.RefObject<HTMLElement | null>,
    initialFocusRef: containerRef as React.RefObject<HTMLElement | null>,
    onClose,
    returnFocusRef
  });
  return containerRef;
}

/** How many open surfaces currently hide each element, so nested dialogs undo only their own. */
const hiddenBy = new WeakMap<Element, number>();

const isLiveRegion = (element: Element): boolean =>
  element.hasAttribute("aria-live") || /^(status|alert|log)$/.test(element.getAttribute("role") ?? "");

/**
 * Marks what an open dialog hid, beside `aria-hidden`, so the page is still the page underneath:
 * DocumentTitle keeps the tab title on the page's h1 while a drawer is open.
 */
export const HIDDEN_BY_DIALOG_ATTRIBUTE = "data-hidden-by-dialog";

/**
 * While `active`, hides everything outside `containerRef` from assistive technology, so a
 * screen reader cannot wander out of an open modal (VoiceOver otherwise leaves it with
 * VO-Shift-Up or through the rotor, `aria-modal` notwithstanding). It sets `aria-hidden` and
 * not `inert`: pointer clicks on a scrim beside the dialog keep working. Live regions stay
 * exposed so announcements still reach the reader. A layout effect, so its cleanup runs before
 * the modal helper's passive cleanup returns focus to the opener.
 */
export function useHideOutside(containerRef: React.RefObject<HTMLElement | null>, active = true): void {
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!active || container === null) return undefined;
    const hidden: Element[] = [];
    for (let node: Element = container; node.parentElement !== null && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node || isLiveRegion(sibling) || sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE") continue;
        const count = hiddenBy.get(sibling) ?? 0;
        // Hidden by its own markup: never this hook's to undo.
        if (count === 0 && sibling.getAttribute("aria-hidden") === "true") continue;
        hiddenBy.set(sibling, count + 1);
        if (count === 0) {
          sibling.setAttribute("aria-hidden", "true");
          sibling.setAttribute(HIDDEN_BY_DIALOG_ATTRIBUTE, "");
        }
        hidden.push(sibling);
      }
    }
    return () => {
      for (const sibling of hidden) {
        const count = (hiddenBy.get(sibling) ?? 1) - 1;
        if (count > 0) {
          hiddenBy.set(sibling, count);
        } else {
          hiddenBy.delete(sibling);
          sibling.removeAttribute("aria-hidden");
          sibling.removeAttribute(HIDDEN_BY_DIALOG_ATTRIBUTE);
        }
      }
    };
  }, [active, containerRef]);
}
