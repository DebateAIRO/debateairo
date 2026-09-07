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
  /**
   * OPTIONAL, and the only member added since the contract was fixed (V-22, ruled after
   * both slices merged). The control focus should return to WHEN THE CAPTURED OPENER DID
   * NOT SURVIVE the opening commit — never a general override of it.
   *
   * It exists because the capture is unusable for a whole CLASS of surfaces: one whose
   * opener is unmounted by the same commit that opens it. The platform moves focus to
   * `document.body` as the opener leaves the document, and it does so before any hook tier
   * runs — `useLayoutEffect` sees `body` too (measured: CODE-REV-S01-C6 r1 B2) — so the
   * capture is `body`, and even a captured reference would be a detached node. A
   * PARENT-owned ref escapes that: React re-attaches it in the layout phase of the commit
   * that remounts the control, which is before this hook's passive cleanup reads it. The
   * cookie bar and its preferences card are the first member of the class; every
   * mutually-exclusive surface pair is another.
   *
   * A surface that omits it keeps the captured-opener behaviour exactly, and a surface
   * that supplies it keeps that behaviour too for every open where the opener is still on
   * the page — see the ordering note in the cleanup below, which is measured law and not
   * a preference.
   */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}>;

/**
 * One entry per OPEN surface. `read()` returns the caller's current surface object, so a
 * re-rendered consumer's fresh `onClose` is the one that runs.
 */
type StackEntry = Readonly<{ read: () => ModalSurface }>;

/**
 * The Esc stack: a module-level REGISTRY of open surfaces, in REGISTRATION order, shared by
 * every surface in the app. The entry that receives `Escape` is the LAST REGISTERED one whose
 * container is still in the document — the surface the visitor opened most recently. Removal
 * stays `lastIndexOf` + `splice`, so a surface that closes out of order takes out its own entry
 * and leaves the rest in order.
 *
 * There is NO arrangement constraint: where a surface renders in the document does not affect
 * which one answers the key (V-20 option (b), ruled 2026-09-07 under CODE-REV-S02-C9 r1 B1).
 * The previous rule ranked by `compareDocumentPosition`, and it was measurably wrong on
 * `/sign-up`, where both slices' surfaces coexist: `app/layout.tsx` mounts `<CookieConsent />`
 * AFTER `{children}` while the sign-up policy renders INSIDE them, so the cookie card was later
 * in document order while the policy was higher in paint, and ONE `Escape` closed the card
 * underneath the open policy — discarding the visitor's unsaved category choices.
 *
 * Open order rather than the `--z-*` ladder, because every surface here opens FROM the one below
 * it and its scrim covers that surface's controls: the last-opened surface IS the one on top in
 * every state a visitor can reach, and a z-rank would restate the ladder in TypeScript.
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
 * The topmost surface: the LAST REGISTERED entry whose container is still in the document.
 *
 * An entry whose container is `null` — a surface that renders no container of its own — still
 * receives `Escape`, exactly as before. An entry whose container has LEFT the document is
 * skipped, because it is no longer on screen at all, and the walk continues to the entry below
 * it; that is the one guard this function keeps from the document-order version it replaces.
 *
 * Registration order IS open order for every surface a visitor can reach, because they open one
 * at a time — each from a control of the surface below it. The one shape where the two part
 * company is a pair mounted in a SINGLE commit: registration happens in `React.useEffect`, which
 * runs CHILD-FIRST, so a nested inner surface registers BEFORE its outer one and the OUTER one
 * answers `Escape`. No surface in this product has that shape (both policy modals are mounted
 * conditionally, by a state change the visitor causes), it is pinned as-is in
 * `tests/render/consent-modal-semantics.test.tsx`, and a future overlay pair that needs its
 * inner surface on top opens that surface in a later commit.
 */
function topmostSurface(): StackEntry | undefined {
  for (let index = surfaceStack.length - 1; index >= 0; index -= 1) {
    const entry = surfaceStack[index]!;
    const container = entry.read().containerRef.current;
    if (container === null || container.isConnected) return entry;
  }
  return undefined;
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
      // The captured opener wins whenever it SURVIVED, and the named control serves only
      // when it did not. `document.body` is the degenerate value `document.activeElement`
      // takes when no element holds focus, and it is exactly what the capture becomes for
      // the class this member exists for, so it counts as "did not survive" rather than as
      // an opener — otherwise every surface would return focus to the body it captured and
      // the member would never be reached.
      //
      // The ORDER is load-bearing and is not V-22's wording. Measured here: with the named
      // control preferred unconditionally, a surface whose opener is still on the page
      // loses its focus return to whatever else the caller lent — the cookie card opened
      // from Settings with nothing stored brings the bar back underneath it, and the bar's
      // control would take a focus that belongs to the Settings opener (S01-R18 names both
      // directions). Surviving-first satisfies both; named-first satisfies one.
      const survived = opener !== null && opener !== document.body && opener.isConnected;
      const named = surfaceRef.current.returnFocusRef?.current ?? null;
      if (survived) {
        focusElement(opener);
        return;
      }
      if (named !== null && named.isConnected) focusElement(named);
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
