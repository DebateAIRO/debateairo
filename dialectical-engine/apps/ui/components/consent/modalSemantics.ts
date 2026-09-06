"use client";

/**
 * The ONE shared modal-semantics module for this repository (ADR-0022, status Proposed).
 *
 * It owns: the focus trap, initial focus, focus return, backdrop close,
 * `prefers-reduced-motion`, and the Esc STACK — the topmost open surface consumes `Escape`
 * and no other surface acts on the same event.
 *
 * Slice S02 writes it; slice S01 consumes it UNCHANGED. Its exported surface is a cross-slice
 * contract fixed in `docs/missions/consent-ui/slices/S02/PLAN.md` §Cluster S02-C1; neither
 * slice changes it alone.
 */

import * as React from "react";

export type ModalSurface = Readonly<{
  containerRef: React.RefObject<HTMLElement | null>;
  initialFocusRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}>;

/**
 * One entry per OPEN surface. `read()` returns the caller's current surface object, so a
 * re-rendered consumer's fresh `onClose` is the one that runs.
 */
type StackEntry = Readonly<{ read: () => ModalSurface }>;

/** The Esc stack: LIFO, module-level, shared by every surface in the app. */
const surfaceStack: StackEntry[] = [];

/** Exactly one `document` keydown listener exists while the stack is non-empty. */
let listenerAttached = false;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Queried at the moment `Tab` is pressed and never cached: the set changes while a surface is
 * open (the policy modal's `I have read it` is `disabled` until the scroll gate latches).
 */
function focusableWithin(container: HTMLElement | null): HTMLElement[] {
  if (container === null) return [];
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
}

function focusElement(element: HTMLElement | null): void {
  if (element === null) return;
  if (typeof element.focus !== "function") return;
  element.focus();
}

function trapTab(entry: StackEntry, event: KeyboardEvent): void {
  const focusable = focusableWithin(entry.read().containerRef.current);
  if (focusable.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  const index = active === null ? -1 : focusable.indexOf(active);
  const step = event.shiftKey ? -1 : 1;
  const next =
    index === -1
      ? focusable[event.shiftKey ? focusable.length - 1 : 0]!
      : focusable[(index + step + focusable.length) % focusable.length]!;
  event.preventDefault();
  focusElement(next);
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  const top = surfaceStack[surfaceStack.length - 1];
  if (top === undefined) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    top.read().onClose();
    return;
  }
  if (event.key === "Tab") {
    trapTab(top, event);
  }
}

function attachListener(): void {
  if (listenerAttached) return;
  document.addEventListener("keydown", handleDocumentKeydown);
  listenerAttached = true;
}

function detachListener(): void {
  if (!listenerAttached) return;
  document.removeEventListener("keydown", handleDocumentKeydown);
  listenerAttached = false;
}

/**
 * Registers `surface` on the Esc stack while `open` is true: initial focus on mount, focus
 * return on close, `Tab`/`Shift+Tab` trapped inside `containerRef`, and `Escape` delivered to
 * this surface only while it is the topmost one.
 */
export function useModalSurface(open: boolean, surface: ModalSurface): void {
  const surfaceRef = React.useRef(surface);
  surfaceRef.current = surface;

  React.useEffect(() => {
    if (!open) return undefined;
    const entry: StackEntry = { read: () => surfaceRef.current };
    const opener = document.activeElement as HTMLElement | null;
    surfaceStack.push(entry);
    attachListener();
    focusElement(surfaceRef.current.initialFocusRef.current);
    return () => {
      const index = surfaceStack.lastIndexOf(entry);
      if (index !== -1) surfaceStack.splice(index, 1);
      if (surfaceStack.length === 0) detachListener();
      focusElement(opener);
    };
  }, [open]);
}

/** Closes only when the click landed ON the scrim, never on a descendant of it. */
export function backdropCloseHandler(
  scrim: HTMLElement | null, onClose: () => void
): (event: { target: EventTarget | null }) => void {
  return (event) => {
    if (scrim === null) return;
    if (event.target !== scrim) return;
    onClose();
  };
}

/** Guarded: jsdom 30.0.1 in this repo has no `window.matchMedia` at all. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// test-visible depth of the Esc stack
export function openSurfaceCount(): number {
  return surfaceStack.length;
}
