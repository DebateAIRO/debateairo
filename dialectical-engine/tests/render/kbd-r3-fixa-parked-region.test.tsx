// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOCUS_GUARD_SETTLE_MS, FOCUS_PARKED_ATTRIBUTE, installFocusGuard } from "../../apps/ui/lib/focusGuard.js";
import { installFocusFixup } from "./kbd-focus-fixup.js";

/*
 * Keyboard audit 2026-11-12, wave 3 fix round (A1). The skip link's landing (`#page-content`) shows no ring, but the focus
 * guard can also park focus there (the part a keyboard user pressed is gone and that region is what survives). A parked
 * part must show the guard's ring, so the quiet rule must leave parked parts alone. Made-up words only.
 */

const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

let stopGuard: () => void;
let stopFixup: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  stopFixup = installFocusFixup();
  stopGuard = installFocusGuard();
});
afterEach(() => {
  stopGuard();
  stopFixup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("a parked #page-content shows the ring (A1)", () => {
  it("guard parks on #page-content", async () => {
    document.body.innerHTML = '<main id="main-content" tabindex="-1"><header><a href="/">Home</a></header>'
      + '<div id="page-content" tabindex="-1"><h1>My questions</h1><p id="failed">Could not load <button id="retry">Retry</button></p></div></main>';
    const retry = document.getElementById("retry") as HTMLButtonElement;
    retry.focus();
    retry.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    document.getElementById("failed")!.remove();
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_SETTLE_MS + 20);
    const parked = document.activeElement as HTMLElement;
    expect(parked.id).toBe("page-content");
    expect(parked.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(true);
  });

  it("the rule that hides the ring on the skip link's landing does not apply to a parked part", () => {
    const quiet = [...css.matchAll(/([^{}]*#page-content[^{}]*)\{([^}]*)\}/g)]
      .filter(([, , body]) => /outline:\s*none/.test(body));
    expect(quiet.length).toBe(1);
    expect(quiet[0][1].trim()).toBe("#page-content:focus:not([data-focus-parked])");
    // And the ring rule for parked parts is still there.
    expect(css).toMatch(/\[data-focus-parked\]:not\(\.appMain\):focus-visible\s*\{\s*outline:\s*2px solid var\(--focus\);/);
  });
});
