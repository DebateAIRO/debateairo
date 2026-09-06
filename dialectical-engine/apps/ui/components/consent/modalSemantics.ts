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

/**
 * The Esc stack: a module-level REGISTRY of open surfaces, shared by every surface in the app.
 * It is not a LIFO — removal is `lastIndexOf` + `splice`, and the entry that receives `Escape`
 * is never "the last one registered": that entry is only where `topmostSurface()` starts. It
 * decides from DOM POSITION — a surface contained by another is drawn over it and wins, and
 * among unrelated siblings the one later in DOCUMENT order wins. `compareDocumentPosition`
 * knows nothing of the `--z-*` ladder, so what makes that right for this product is its
 * ARRANGEMENT: the policy modal renders AFTER the card (V-20; CODE-REV-S02-C5C6 r1 N2).
 */
const surfaceStack: StackEntry[] = [];

/** Exactly one `document` keydown listener exists while the stack is non-empty. */
let listenerAttached = false;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * `FOCUSABLE_SELECTOR` is an ATTRIBUTE match, and focusability is not an attribute. Two members
 * of that gap are filtered here: `tabindex="-1"` on any element (the selector's
 * `:not([tabindex="-1"])` guard sits on its `[tabindex]` arm ALONE, so `button`, `input`,
 * `select`, `textarea` and `a[href]` re-admit it), and `input[type=hidden]`. The visibility
 * member (`display:none` / `visibility:hidden` / `[hidden]` / `inert`) is NOT filtered by
 * attribute: jsdom's `focus()` lands on all of those, so no test here can discriminate it —
 * `trapTab` covers it instead by advancing past any candidate `focus()` did not land on, which
 * is what a real browser reports. Positive-`tabindex` ORDERING stays out of scope.
 */
function isFocusCandidate(element: HTMLElement): boolean {
  if (element.getAttribute("tabindex") === "-1") return false;
  return !(element.nodeName === "INPUT" && (element as HTMLInputElement).type === "hidden");
}

/**
 * Queried at the moment `Tab` is pressed and never cached: the set changes while a surface is
 * open (the policy modal's `I have read it` is `disabled` until the scroll gate latches).
 */
function focusableWithin(container: HTMLElement | null): HTMLElement[] {
  if (container === null) return [];
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(isFocusCandidate);
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
  // Focus outside the surface enters at the first (or, going backwards, the last) candidate.
  let cursor = index === -1 ? (event.shiftKey ? focusable.length : -1) : index;
  event.preventDefault();
  // Advance past any candidate `focus()` refused, so a control the selector matched but the
  // platform will not focus (a hidden or invisible one) cannot turn Tab into a dead key.
  for (let attempt = 0; attempt < focusable.length; attempt += 1) {
    cursor = (cursor + step + focusable.length) % focusable.length;
    const next = focusable[cursor]!;
    focusElement(next);
    if (document.activeElement === next) return;
  }
}

/**
 * The topmost surface — derived from the DOM, never from the order the surfaces registered in.
 * Registration happens in `React.useEffect`, which runs CHILD-FIRST within one commit, so for a
 * nested pair mounted together the LAST registered entry is the surface UNDERNEATH. Document
 * position is the property itself: a surface contained by another is drawn over it, and among
 * unrelated surfaces the later one in document order is on top. Entries whose container is not
 * in the DOM yet (`null`) cannot be compared and leave the incumbent standing, so a surface that
 * renders no container still receives `Escape`; an entry whose container has LEFT the document
 * is a different case and is skipped outright, because it is no longer on screen at all.
 */
function topmostSurface(): StackEntry | undefined {
  if (surfaceStack.length === 0) return undefined;
  let top = surfaceStack[surfaceStack.length - 1]!;
  for (const candidate of surfaceStack) {
    const held = top.read().containerRef.current;
    const other = candidate.read().containerRef.current;
    if (held === null || other === null || held === other) continue;
    // A container that has left the document cannot be compared for stacking: jsdom answers
    // DISCONNECTED|FOLLOWING|IMPLEMENTATION_SPECIFIC in BOTH directions, so a detached node
    // reads as "above" whichever way it is asked and the entry iterated last would win. A
    // detached candidate therefore never wins, and a detached incumbent never stands.
    if (!other.isConnected) continue;
    if (!held.isConnected) {
      top = candidate;
      continue;
    }
    const relation = held.compareDocumentPosition(other);
    const above =
      (relation & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0 ||
      (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    if (above) top = candidate;
  }
  return top;
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  const top = topmostSurface();
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
