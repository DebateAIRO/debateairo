import { describe, expect, it } from "vitest";
import { rulesFor, stylesheet } from "./kbd-r4-e-css.js";

/*
 * Keyboard audit round 4 (E3, 12 Nov 2026): on the classic debate page the one-line footer is one row that scrolls
 * sideways (about 1,270px of links). Its padding-right keeps the Help button's and the token dock's corner empty only
 * when the row is scrolled to its end, so between 761px and about 1,270px of window a footer link Tab reached could sit
 * inside the row yet under the Help button. The row now scrolls a focused link clear of that corner (physical right,
 * as the widget and the dock are pinned to the physical right in both directions).
 */
const legal = stylesheet("legal.css");

describe("the debate page's one-line footer keeps a focused link out of the bottom-right corner", () => {
  it("still scrolls sideways, with the corner kept empty at its end", () => {
    expect(rulesFor(legal, ".appShell:has(.debateView) > .siteFooterLine")[0]?.body).toMatch(/overflow-x:\s*auto/);
    expect(rulesFor(legal, ".appShell:has(.supportWidget) > .siteFooterLine")[0]?.body).toMatch(/padding-right:\s*calc\(var\(--dock-offset-b\) \+ 150px\)/);
  });

  it.each([".supportWidget", ".tokenDock"])("scrolls a focused link clear of the corner %s sits in", (corner) => {
    const found = rulesFor(legal, `.appShell:has(.debateView):has(${corner}) > .siteFooterLine`);
    expect(found).toHaveLength(1);
    expect(found[0]!.body).toMatch(/scroll-padding-right:\s*calc\(var\(--dock-offset-b\) \+ 150px\)/);
    expect(found[0]!.body, "physical, not logical: the corner is physical right in right-to-left too").not.toMatch(/inline-end/);
  });
});
