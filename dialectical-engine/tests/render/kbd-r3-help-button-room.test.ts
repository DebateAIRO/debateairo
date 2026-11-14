import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Keyboard audit round 3 (2026-11-12), seen in a painted browser: the Help button is fixed in the bottom right corner
 * of the window, and a control tabbed to at the foot of the window sat under it. Measured: 82% of the landing page's
 * footer language button at 1280 x 800, 81% at 375 x 667, 93% at 320 x 256, and up to 70% of other right-hand controls
 * on a narrow window. A browser counts a control at the bottom edge as in view and does not scroll it clear.
 * - A focused control is now scrolled clear of the Help button, as it already was of the cookie notice.
 * - The full footer keeps the corner empty, as the one-line footer always did.
 * - In a short window the first-visit cookie notice and the Help button do not both fit above a focused control, so the
 *   Help button waits while the notice shows there.
 * jsdom lays nothing out, so the rules themselves are pinned here; the result was measured in Chrome.
 */
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const globals = strip(readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/globals.css"), "utf8"));
const legal = strip(readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/legal.css"), "utf8"));

/** The declarations of the first rule with exactly this selector at or after `from`. */
function rule(css: string, selector: string, from = 0): string {
  const at = css.indexOf(`${selector} {`, from);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return css.slice(at + selector.length + 2, css.indexOf("}", at));
}

describe("the Help button never covers the control that has the keyboard", () => {
  it("a focused control is scrolled clear of the Help button as well as the cookie notice", () => {
    expect(rule(globals, 'html:has(.supportWidget[data-widget-state="collapsed"])')).toMatch(
      /scroll-padding-block-end:\s*calc\(var\(--consent-bar-room, 0px\) \+ var\(--dock-offset-b\) \+ 54px\)/
    );
  });

  it("the cookie notice's own room is still there for pages without the Help button", () => {
    expect(rule(globals, "html")).toMatch(/scroll-padding-block-end:\s*var\(--consent-bar-room, 0px\)/);
  });

  it("in a short window the Help button waits while the cookie notice shows, and takes no room meanwhile", () => {
    const at = globals.indexOf("@media (max-height: 520px)");
    expect(at).toBeGreaterThan(-1);
    // Round 4 (E7): it fades out rather than leaving the page (display: none could not take focus back from its own
    // panel), and shows again while it has focus. kbd-r4-e-help-room.test.ts pins the rest.
    const waiting = rule(globals, '.appShell:has(> .consentBar) .supportWidget[data-widget-state="collapsed"]:not(:focus-within)', at);
    expect(waiting).toMatch(/opacity:\s*0/);
    expect(waiting).toMatch(/pointer-events:\s*none/);
    expect(rule(globals, 'html:has(.appShell > .consentBar):has(.supportWidget[data-widget-state="collapsed"])', at)).toMatch(
      /scroll-padding-block-end:\s*var\(--consent-bar-room, 0px\)/
    );
  });

  it("the full footer keeps the Help button's corner empty, like the one-line footer", () => {
    expect(rule(legal, ".appShell:has(.supportWidget) .siteFooterFull .siteFooterBase")).toMatch(
      /padding-right:\s*calc\(var\(--dock-offset-b\) \+ 150px\)/
    );
  });

  it("on a phone the full footer ends above the Help button instead", () => {
    const at = legal.indexOf("@media (max-width: 760px)");
    expect(at).toBeGreaterThan(-1);
    expect(rule(legal, ".appShell:has(.supportWidget) .siteFooterFull .siteFooterBase", at)).toMatch(/padding-right:\s*0/);
    expect(rule(legal, ".appShell:has(.supportWidget) .siteFooterFull", at)).toMatch(/padding-bottom:\s*calc\(var\(--dock-offset-b\) \+ 54px\)/);
  });
});
