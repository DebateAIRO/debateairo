import { act } from "react";
import { vi } from "vitest";
import { FOCUS_GUARD_SETTLE_MS, installFocusGuard } from "../../apps/ui/lib/focusGuard";
import { installFocusFixup } from "./kbd-focus-fixup";

/*
 * Keyboard audit, 12 Nov 2026. What every page has in a browser, for a render test that follows a keyboard user through
 * a real component: the browser's focus fixup rule (a control that is disabled or removed loses focus to the page) and
 * the site's focus guard (`apps/ui/lib/focusGuard.ts`, mounted once in the root layout), which puts that focus back.
 *
 * Use: `stop = startFocusGuard()` in `beforeEach`, `stop()` in `afterEach`; make each press with `pressByKeyboard` (the
 * guard acts only for a person using the keyboard); `await guardSettled()` before asserting where focus is.
 */

/** Starts the fixup rule and the guard, with the page counted as focused. Returns the stop. */
export function startFocusGuard(): () => void {
  const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const stopFixup = installFocusFixup();
  const stopGuard = installFocusGuard();
  return () => {
    stopGuard();
    stopFixup();
    hasFocus.mockRestore();
  };
}

/** A press made from the keyboard: the control has focus, the key goes down on it, and it is activated. */
export function pressByKeyboard(control: HTMLElement, key = "Enter"): void {
  act(() => {
    control.focus();
    control.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    control.click();
  });
}

/** Enter pressed in a field of a form: the key goes down in the field and the form is submitted. */
export function submitByKeyboard(field: HTMLElement): void {
  act(() => {
    field.focus();
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    field.closest("form")?.requestSubmit();
  });
}

/** Lets pending promises and the guard's wait pass (real timers). With fake timers, advance them past the wait instead. */
export async function guardSettled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, FOCUS_GUARD_SETTLE_MS + 40));
  });
}
