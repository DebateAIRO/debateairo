import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Keyboard audit round 3 (2026-11-12), seen in a real browser at 320 x 256 (a 1280 x 1024 screen at 400% zoom): the
 * first-visit cookie bar was taller than the window. Its title was cut off above the top edge with no way to reach it,
 * and it covered the whole page, so every control tabbed to before it (it comes 26th on the landing page) was hidden
 * behind it. The bar is now capped in a short window and scrolls inside; in a window it already fits, nothing changes.
 * jsdom lays nothing out, so the rules themselves are pinned here; the result was measured in Chrome.
 */
const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/globals.css"), "utf8");
const S01_START = css.indexOf("/* === consent-ui S01 === */");
const rules = css.slice(0, S01_START).replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the one rule with exactly this selector, outside the pinned consent block. */
function rule(selector: string): string {
  const at = rules.indexOf(`${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return rules.slice(at + selector.length + 2, rules.indexOf("}", at));
}

describe("the cookie bar in a window too short for it", () => {
  it("the pinned consent block is still where it was (these rules live outside it)", () => {
    expect(S01_START).toBeGreaterThan(-1);
  });

  it("is never taller than the window, and leaves a strip of a short one to the page", () => {
    const bar = rule(".appShell > .consentBar");
    expect(bar).toMatch(/max-height:\s*min\(calc\(100dvh - 24px - var\(--safe-b, 0px\)\), max\(calc\(100dvh - 120px\), 170px\)\)/);
    expect(bar).toMatch(/display:\s*flex/);
    expect(bar).toMatch(/flex-direction:\s*column/);
  });

  it("lets its frame shrink with it", () => {
    const bezel = rule(".appShell > .consentBar > .consentBarBezel");
    expect(bezel).toMatch(/display:\s*flex/);
    expect(bezel).toMatch(/flex-direction:\s*column/);
    expect(bezel).toMatch(/min-height:\s*0/);
  });

  it("scrolls its own content instead of cutting it off", () => {
    const core = rule(".appShell > .consentBar .consentBarCore");
    expect(core).toMatch(/min-height:\s*0/);
    expect(core).toMatch(/overflow-y:\s*auto/);
  });
});
