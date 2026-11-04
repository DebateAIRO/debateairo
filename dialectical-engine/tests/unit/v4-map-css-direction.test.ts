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

  it("give the answer card's folds the same arrows (the browser check, 4 Nov: a flex summary draws no marker of its own)", () => {
    const looks = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-map-looks.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    expect(looks).toMatch(/\.v4AnswerMore > summary \{[^}]*display: flex;/u);
    expect(looks).toMatch(/\.v4AnswerMore > summary::-webkit-details-marker \{ display: none; \}/u);
    expect(looks).toMatch(/\.v4AnswerMore > summary::before \{ content: "▸";/u);
    expect(looks).toMatch(/\.v4AnswerMore > summary:dir\(rtl\)::before \{ content: "◂"; \}/u);
    expect(looks).toMatch(/\.v4AnswerMore\[open\] > summary::before \{ content: "▾"; \}/u);
    expect(looks.indexOf(".v4AnswerMore[open] > summary::before")).toBeGreaterThan(looks.indexOf(".v4AnswerMore > summary:dir(rtl)::before"));
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

  it("keep the columns straight when one grows: the headings and every row share one grid's columns (review F2)", () => {
    const start = rules.indexOf("@supports (grid-template-columns: subgrid) {");
    expect(start).toBeGreaterThan(-1);
    const block = rules.slice(start, rules.indexOf("\n}", start));
    const inBlock = (selector: string): string => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const found = new RegExp(`\\n[ \\t]*${escaped} \\{([^}]*)\\}`, "u").exec(block);
      expect(found, selector).not.toBeNull();
      return found![1]!;
    };
    // One grid: each column is its drawn width at least, and grows only as far as its widest card needs (within the caps).
    expect(inBlock(".v4MapCanvas")).toMatch(
      /grid-template-columns: minmax\(196px, min-content\) minmax\(228px, min-content\) minmax\(236px, min-content\);[\s\S]*column-gap: 32px;/u);
    // The headings, the body, the paths and every path's row use those same columns, with the same gap (no gap of their own).
    for (const selector of [".v4MapHeads, .v4MapBody", ".v4MapBranches", ".v4MapBranch"]) {
      expect(inBlock(selector), selector).toMatch(/grid-template-columns: subgrid;[\s\S]*column-gap: normal;/u);
    }
    expect(inBlock(".v4MapBranches")).toMatch(/grid-column: 2 \/ -1;[\s\S]*margin-inline-start: 0;/u);
    // Every card fills its column, so each row's open questions start at the same place.
    expect(inBlock(".v4MapBranch > .v4MapPath")).toMatch(/grid-column: 1; width: 100%;/u);
    expect(inBlock(".v4MapBranch > .v4MapLeaves")).toMatch(/grid-column: 2; width: auto;/u);
    expect(inBlock(".v4MapRootCol")).toMatch(/width: auto;/u);
    // The fixed heading widths are gone from the grid (the per-row floors above stay for browsers without subgrid).
    expect(block).not.toMatch(/196px 228px 236px/u);
  });

  it("leave the laptop's two folded columns (map-d3) out of that grid, so open questions still hang under their path", () => {
    // The merge of wave 1 (4 Nov): measured in a browser, the shared grid put a folded map's open questions in a third column
    // beside the path, and the "Paths" heading off its column. v4-map-looks.css (loaded after v4-map.css) undoes the grid
    // for .v4MapFold only, back to the per-row layout.
    const looks = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-map-looks.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    const start = looks.indexOf("@supports (grid-template-columns: subgrid) {");
    expect(start).toBeGreaterThan(looks.indexOf(".v4MapFold .v4MapBranch {"));
    const block = looks.slice(start, looks.indexOf("\n}", start));
    const inBlock = (selector: string): string => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const found = new RegExp(`\\n[ \\t]*${escaped} \\{([^}]*)\\}`, "u").exec(block);
      expect(found, selector).not.toBeNull();
      return found![1]!;
    };
    expect(inBlock(".v4MapFold .v4MapCanvas")).toMatch(/display: flex;/u);
    expect(inBlock(".v4MapFold .v4MapHeads")).toMatch(/column-gap: 32px;/u);
    expect(inBlock(".v4MapFold .v4MapBody")).toMatch(/display: flex;/u);
    expect(inBlock(".v4MapFold .v4MapRootCol")).toMatch(/width: min-content;/u);
    expect(inBlock(".v4MapFold .v4MapBranches")).toMatch(/display: flex;[\s\S]*margin-inline-start: 32px;/u);
    expect(inBlock(".v4MapFold .v4MapBranch")).toMatch(/display: flex;/u);
  });
});

describe("the wave-2 stylesheets follow the reading direction too (the wave-2 review, 4 Nov: ACCESS-15)", () => {
  // The quota marks, the report on the map, the public page and the dig box, the debate page's own rules and the wait card.
  const files = ["app/v4/v4-quota.css", "app/v4/v4-report-map.css", "app/v4/v4-public.css", "app/v4/v4-debate.css", "app/v4/v4-wait.css",
    "app/public/debate/[id]/public-lane.css"];
  it.each(files)("%s places nothing by left or right", (file) => {
    const text = readFileSync(resolve(import.meta.dirname, "../../apps/ui", file), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    const physical = [...text.matchAll(/(?:^|[\s;{])((?:margin|padding|border)-(?:left|right)(?:-[a-z]+)?|left|right|text-align:\s*(?:left|right))\s*:?/gmu)]
      .map((match) => match[1]);
    expect(physical).toEqual([]);
  });

  it("ACCESS-8: the running dig's step arrow is not turned a second time on a right-to-left page (the browser mirrors › there itself)", () => {
    const wait = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-wait.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    expect(wait).toMatch(/\.v4DigStep \+ \.v4DigStep::before \{[^}]*content: "›"/u);
    expect(wait).not.toMatch(/\.v4DigStep:dir\(rtl\)/u);
  });
});

describe("the wave-2 review's layout rules (4 Nov)", () => {
  const read = (file: string): string => readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4", file), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
  it("ACCESS-7: the current step is told apart from a done one by more than colour (larger, ringed)", () => {
    expect(read("v4-debate.css")).toMatch(/\.v4StepsHere \.v4StepsDot \{ width: 10px; height: 10px; box-shadow: 0 0 0 2px var\(--surface\), 0 0 0 3\.5px var\(--accent\); \}/u);
  });
  it("ACCESS-2: a control the keyboard reaches in the panel column scrolls clear of the pinned dig block and the docked tray", () => {
    expect(read("v4-debate.css")).toMatch(/\.v4DebLayout-mid \.v4DebPanelCol \{\s*scroll-padding-block-end: calc\(var\(--v4-pin-room, 0px\) \+ var\(--v4-dock-room, 0px\) \+ 8px\);/u);
  });
  it("ACCESS-1: the phone's stack grows while the report's strip is open in it, so its lines show before Write it", () => {
    expect(read("v4-undo.css")).toMatch(/\.v4StackPhone:has\(\.v4RepStrip-bottom\) \{ max-height: 85vh; max-height: 85dvh; \}/u);
  });
  it("the browser check: the top bar's strip takes its own row at the end side, and the bar's other items keep theirs", () => {
    const css = read("v4-report-map.css");
    // Its long lines no longer widen the bar's right side (contain), and it comes after the account button (order).
    expect(css).toMatch(/\.v4RepStrip-top \{\s*flex: 1 1 100%; order: 1; contain: inline-size; width: min\(30rem, 100%\); max-width: 30rem; margin-inline-start: auto;\s*\}/u);
    expect(css).toMatch(/\.v4HdrRight:has\(> \.v4RepStrip-top\) \{ justify-content: flex-end; \}/u);
    expect(css).toMatch(/\.v4Hdr:has\(> \.v4HdrRight > \.v4RepStrip-top\) \{ align-items: flex-start; \}/u);
  });
});
