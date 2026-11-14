import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { expect, vi } from "vitest";
import { FOCUS_PARKED_ATTRIBUTE } from "../../apps/ui/lib/focusGuard";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit 2026-11-12, wave 2 (area SET): the real Settings, billing and staff screens mounted the way the root
 * layout mounts every page (inside `main#main-content`, with the site's focus guard running), so a test can follow a
 * keyboard user through them and name where focus lands.
 *
 * `KBD_R2_NO_GUARD=1` runs the same steps with the browser's focus rule alone (no guard): the losses the audit reported.
 */
export const GUARDED = process.env.KBD_R2_NO_GUARD !== "1";

let root: Root | null = null;
let stop: () => void = () => undefined;

export async function settle(): Promise<void> {
  for (let hop = 0; hop < 8; hop += 1) await act(async () => { await Promise.resolve(); });
}

/** Mounts `node` as a page and starts the guard (or only the browser's focus rule). Returns the main area. */
export async function mountPage(node: ReactNode): Promise<HTMLElement> {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const main = document.createElement("main");
  main.id = "main-content";
  main.tabIndex = -1;
  document.body.append(main);
  if (GUARDED) stop = startFocusGuard();
  else {
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const stopFixup = installFocusFixup();
    stop = () => { stopFixup(); hasFocus.mockRestore(); };
  }
  root = createRoot(main);
  await act(async () => { root!.render(node); });
  await settle();
  return main;
}

export async function unmountPage(): Promise<void> {
  stop();
  stop = () => undefined;
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
}

/** The one button named `label` (its text or its aria-label) inside `scope`. */
export function button(label: string, scope: ParentNode = document): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")]
    .filter((candidate) => candidate.textContent?.trim() === label || candidate.getAttribute("aria-label") === label);
  expect(found.length, `one button named ${label}`).toBe(1);
  return found[0]!;
}

/**
 * A keyboard press on `control`, then the wait for its request and for the guard. React draws an update made inside an
 * async `act` only when that `act` ends, so the request's answer is drawn first (`settle`), and only then is the guard
 * given its wait; twice, for a press whose answer is drawn in two steps.
 */
export async function press(control: HTMLElement, key = "Enter"): Promise<void> {
  pressByKeyboard(control, key);
  for (let round = 0; round < 2; round += 1) {
    await settle();
    await guardSettled();
  }
  await settle();
}

/** The guard's wait after something the page did by itself (a timer), drawn first as in `press`. */
export async function guardWait(): Promise<void> {
  for (let round = 0; round < 2; round += 1) {
    await settle();
    await guardSettled();
  }
  await settle();
}

/** A key press that only moves on (Tab), so the guard sees a keyboard user without anything being activated. */
export function keyboardOn(control: HTMLElement): void {
  act(() => {
    control.focus();
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
}

export async function typeInto(field: HTMLInputElement | HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

/** Focus is on `element`, which holds it as a real place (not parked by the guard). */
export function expectFocusOn(element: Element | null | undefined): void {
  expect(element, "the expected element exists").toBeTruthy();
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(element);
}

/** The guard parked focus on `element` (a part of the page that only keeps the place). */
export function expectParkedOn(element: Element | null | undefined): void {
  expectFocusOn(element);
  expect(element!.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(true);
}

/** The next control a forward Tab reaches from the element that has focus (document order, `tabIndex >= 0`). */
export function nextTabStop(): HTMLElement | null {
  const from = document.activeElement;
  if (from === null) return null;
  const stops = [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]")]
    .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.closest("[inert], [hidden]") === null);
  return stops.find((element) => from.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
    && !(from.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_CONTAINS)) ?? null;
}
