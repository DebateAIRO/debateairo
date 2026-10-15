"use client";

import * as React from "react";
import { useModalSurface } from "@/components/consent/modalSemantics";

/**
 * For a dialog that is mounted only while it is open (the debate drawers, the guide, the
 * challenge popover). Returns the ref for the dialog element, which also needs `tabIndex={-1}`.
 *
 * It reuses the shared modal helper unchanged: focus moves onto the dialog itself, so a screen
 * reader announces its name and starts reading at its top. Tab stays inside, Escape closes the
 * topmost surface only, and closing returns focus to the control that opened it.
 */
export function useDialogSurface<T extends HTMLElement = HTMLElement>(
  onClose: () => void
): React.RefObject<T | null> {
  const containerRef = React.useRef<T | null>(null);
  useModalSurface(true, {
    containerRef: containerRef as React.RefObject<HTMLElement | null>,
    initialFocusRef: containerRef as React.RefObject<HTMLElement | null>,
    onClose
  });
  return containerRef;
}
