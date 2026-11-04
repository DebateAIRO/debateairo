import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * V4 review map-f13: long words were cut off at the edge of map cards (fixed widths, no word breaking), and every line and
 * stub of the tree was placed from the left, so a right-to-left page (Arabic, Hebrew) would draw a broken tree. The map's
 * styles now break and hyphenate long words, let a column grow for a word that cannot break, and place every inset, line
 * and side mark by the start and end of the reading direction.
 */
const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-map.css"), "utf8");
const rules = css.replace(/\/\*[\s\S]*?\*\//gu, "");

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const found = new RegExp(`(?:^|[}\\n])[ \\t]*${escaped} \\{`, "u").exec(rules);
  expect(found, selector).not.toBeNull();
  const at = found!.index + found![0].length;
  return rules.slice(at, rules.indexOf("}", at));
}

describe("the V4 map's styles follow the reading direction (map-f13)", () => {
  it("place nothing by left or right: insets, margins, paddings, side lines and text alignment are logical", () => {
    const physical = [...rules.matchAll(/(?:^|[\s;{])((?:margin|padding|border)-(?:left|right)(?:-[a-z]+)?|left|right|text-align:\s*(?:left|right))\s*:?/gmu)]
      .map((match) => match[1]);
    expect(physical).toEqual([]);
    expect(rules).not.toMatch(/border-radius:\s*0 10px 10px 0/u);
  });

  it("draw the tree's trunk, branches and stubs from the start side", () => {
    expect(rule(".v4MapRootCol::after")).toMatch(/inset-inline-end: -32px/u);
    expect(rule(".v4MapBranches")).toMatch(/margin-inline-start: 32px/u);
    expect(rule(".v4MapBranch::before, .v4MapLeaf::before")).toMatch(/inset-inline-start: -16px[\s\S]*border-inline-start: 2px solid/u);
    expect(rule(".v4MapBranch::after")).toMatch(/inset-inline-start: -16px/u);
    expect(rule(".v4MapLeaf::after")).toMatch(/inset-inline-start: -16px/u);
  });

  it("turn the closed disclosure arrows around on a right-to-left page", () => {
    expect(rules).toMatch(/\.v4PanelGroup > summary:dir\(rtl\)::before \{ content: "◂"; \}/u);
    expect(rules).toMatch(/\.v4PanelSent > summary:dir\(rtl\)::before, \.v4PanelFirstAnswer > summary:dir\(rtl\)::before \{ content: "◂"; \}/u);
    // The open arrow still wins once a group is open: its rule comes after the right-to-left one.
    expect(rules.indexOf(".v4PanelGroup[open] > summary::before")).toBeGreaterThan(rules.indexOf(".v4PanelGroup > summary:dir(rtl)::before"));
  });

  it("break and hyphenate long words inside every map card and the phone outline, in the page's language", () => {
    expect(rule(".v4MapRoot, .v4MapPath, .v4MapOpenMain, .v4MapDig")).toMatch(/overflow-wrap: break-word; hyphens: auto;/u);
    expect(rule(".v4MapHeads")).toMatch(/overflow-wrap: break-word; hyphens: auto;/u);
    expect(rule(".v4OutRoot, .v4OutPath, .v4OutMain")).toMatch(/hyphens: auto;/u);
  });

  it("keep each column's drawn width as a floor and let it grow, within a cap, for a word that cannot break", () => {
    for (const [selector, floor] of [[".v4MapRootCol", 196], [".v4MapBranch > .v4MapPath", 228], [".v4MapLeaves", 236]] as const) {
      const declarations = rule(selector);
      expect(declarations, selector).toMatch(/width: min-content;/u);
      expect(declarations, selector).toMatch(new RegExp(`min-width: ${floor}px;`, "u"));
      const cap = Number(/max-width: (\d+)px;/u.exec(declarations)?.[1]);
      expect(cap, selector).toBeGreaterThan(floor);
      // No fixed width is left: a fixed width would cut a long word at the edge again.
      expect(declarations, selector).not.toMatch(/(?:^|[\s;{])width: \d+px/u);
    }
  });
});
