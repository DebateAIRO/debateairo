/*
 * Keyboard audit 2026-11-12 on the map page's stylesheets (V4B-V1, V4B-V2, V4B-V3, V4C-12, CSS-1, CSS-2, CSS-5, CSS-8).
 * jsdom computes no style, so this reads the rules themselves (as kbd-focus-rings.test.ts does) and works the contrast out
 * from the site's tokens (globals.css: Terracotta on :root, Chamber on html[data-mode="chamber"]); how it looks is V's.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(resolve(import.meta.dirname, "../../apps/ui/app", file), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const undo = read("v4/v4-undo.css");
const debate = read("v4/v4-debate.css");
const map = read("v4/v4-map.css");
const looks = read("v4/v4-map-looks.css");
const globals = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/globals.css"), "utf8");

function declarations(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[},])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "m").exec(css);
  expect(match, `${selector} has a rule`).not.toBeNull();
  return match![1]!;
}

/** A token's value in one block of globals.css (the first `--name: #hex` after the block's selector). */
function token(block: string, name: string): string {
  const at = globals.indexOf(`${block} {`);
  expect(at, block).toBeGreaterThanOrEqual(0);
  const found = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(globals.slice(at));
  expect(found, `${block} --${name}`).not.toBeNull();
  return found![1]!;
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
const THEMES = [":root", "html[data-mode=\"chamber\"]"] as const;

describe("V4B-V1 / CSS-2 / V4C-12: a focused control is never scrolled under a fixed or pinned bar", () => {
  it("the map page's window keeps the bottom stack's and the phone where-bar's measured height free", () => {
    const rule = declarations(undo, "html:has(.v4DebPage)");
    expect(rule).toContain("scroll-padding-block-end: max(calc(var(--v4-stack-room, 0px) + 8px), var(--v4-note-foot, 0px))");
    expect(rule).toContain("scroll-padding-block-start: calc(var(--v4-where-room, 0px) + 8px)");
    // The cookie bar's own room still wins while it shows (more specific, block-end only): never less than the 188 px
    // checked in a browser on 4 Nov, and the bar's measured height where that is more (a phone).
    expect(declarations(debate, "html:has(.appShell .consentBar):has(.v4DebPage)"))
      .toBe(" scroll-padding-block-end: max(188px, var(--consent-bar-room, 0px), var(--v4-note-foot, 0px)); ");
  });

  it("the panel column keeps the pinned tour bar's height free above a focused control, except on the bar itself", () => {
    expect(declarations(debate, ".v4DebPanelCol:has(.v4Panel .v4TourBar)")).toContain("scroll-padding-block-start: 72px");
    expect(declarations(debate, ".v4DebPanelCol:has(.v4TourBar :focus)")).toContain("scroll-padding-block-start: 0");
  });

  it("the report and public pages keep the site-wide dig note's height free at the window's foot", () => {
    expect(declarations(undo, "html:has(.v4UndoHost)"))
      .toContain("scroll-padding-block-end: max(var(--consent-bar-room, 0px), calc(var(--v4-undo-room, 72px) + 24px + var(--safe-b, 0px)))");
  });

  it("the note's room is kept wherever another rule sets the window's foot (review, 12 Nov: that rule wins the cascade)", () => {
    // The note follows the person to a map that is still loading, or to the ask page, where a later or more specific
    // html rule decides the foot. Each of those reads the note's room, which the note's own rule publishes.
    expect(declarations(undo, "html:has(.v4UndoHost)")).toContain("--v4-note-foot: calc(var(--v4-undo-room, 72px) + 24px + var(--safe-b, 0px))");
    const ask = read("v4/v4-ask.css");
    for (const [css, selector] of [
      [undo, "html:has(.v4DebPage)"],
      [debate, "html:has(.appShell .consentBar):has(.v4DebPage)"],
      [ask, "html:has(.v4StartBar:not(.v4StartBar--aside):not(.v4StartBar--next)):not(:has(.appShell .consentBar))"]
    ] as const) {
      expect(declarations(css, selector), selector).toMatch(/scroll-padding-block-end: max\([^;]*var\(--v4-note-foot, 0px\)\)/u);
    }
    // Every html rule that sets the foot is one of those, the note's own, or the site's cookie-bar rule (globals.css).
    const feet = [undo, debate, ask].flatMap((css) => [...css.matchAll(/(?:^|\})\s*(html[^{]*)\{[^}]*scroll-padding-block-end/gmu)].map((found) => found[1]!.trim()));
    expect(feet.sort()).toEqual([
      "html:has(.appShell .consentBar):has(.v4DebPage)",
      "html:has(.v4DebPage)",
      "html:has(.v4StartBar:not(.v4StartBar--aside):not(.v4StartBar--next)):not(:has(.appShell .consentBar))",
      "html:has(.v4UndoHost)"
    ]);
  });

  it("V4B-V3: the map scroller stops a card clear of its right-edge fade", () => {
    expect(declarations(looks, ".v4MapScroll")).toContain("scroll-padding-inline-end: 56px");
  });
});

describe("V4B-V2: the keyboard's ring on the map and the outline differs from the selected outline and the LOOKING ring", () => {
  it("a 3 px ink ring with a surface gap on the rows; the selected and LOOKING looks are unchanged", () => {
    const ring = declarations(map, ".v4MapCanvas [data-rove]:focus-visible");
    expect(map).toMatch(/\.v4MapCanvas \[data-rove\]:focus-visible, \.v4OutTree \[data-rove\]:focus-visible \{/u);
    expect(ring).toContain("outline: 3px solid var(--ink)");
    expect(ring).toContain("box-shadow: 0 0 0 2px var(--surface)");
    expect(declarations(map, ".v4MapSelected.v4MapRoot")).toContain("outline: 2.5px solid var(--accent)");
    expect(declarations(map, ".v4OutSelected.v4OutRoot")).toContain("outline: 2.5px solid var(--accent)");
    expect(looks).toMatch(/\.v4GroundLOOKING::after/u);
  });

  it("the ink ring is at least 3:1 against every surface it sits on, in both themes", () => {
    for (const theme of THEMES) {
      const ink = token(theme, "ink");
      for (const surface of ["bg", "surface", "surface-2", "surface-sunken", "con-bg", "gold-bg", "pro-bg"]) {
        expect(contrast(ink, token(theme, surface)), `${theme} --ink on --${surface}`).toBeGreaterThanOrEqual(3);
      }
      // It is not the accent the selected outline and the LOOKING ring use.
      expect(token(theme, "ink")).not.toBe(token(theme, "accent"));
    }
  });
});

describe("CSS-1 / CSS-5 / CSS-8", () => {
  it("CSS-1: the phone where-bar's crumbs draw their ring inside (their list items clip outside)", () => {
    expect(declarations(looks, ".v4WhereLine .v4WherePart:focus-visible")).toContain("outline-offset: -2px");
  });

  it("CSS-5: the Undo note's ring is the surface colour, at least 3:1 on its ink background in both themes", () => {
    expect(declarations(undo, ".v4Root .v4Undo :focus-visible")).toContain("outline-color: var(--surface)");
    for (const theme of THEMES) expect(contrast(token(theme, "surface"), token(theme, "ink")), theme).toBeGreaterThanOrEqual(3);
    // The accent ring it replaces was under 3:1 in Chamber.
    expect(contrast(token(THEMES[1], "focus"), token(THEMES[1], "ink"))).toBeLessThan(3);
  });

  it("CSS-8: the \"good time\" line's × and report button are in the order they are seen (no CSS order)", () => {
    expect(declarations(undo, ".v4StackGoodReport")).not.toMatch(/(^|[;\s])order:/u);
    expect(declarations(undo, ".v4StackGoodClose")).not.toMatch(/(^|[;\s])order:/u);
    const stack = readFileSync(resolve(import.meta.dirname, "../../apps/ui/components/v4/V4BottomStack.tsx"), "utf8");
    expect(stack.indexOf("v4StackGoodClose")).toBeLessThan(stack.indexOf("v4StackGoodReport"));
  });
});

describe("V4C-10: the report page's press buttons while a press is on its way", () => {
  it("look switched off (they keep focus, so they are never natively disabled)", () => {
    const rule = declarations(read("v4/v4-report.css"), '.v4RepPage .v4Btn[aria-busy="true"]');
    expect(rule).toContain("cursor: progress");
    expect(rule).toContain("opacity: .55");
    expect(declarations(read("v4/v4-base.css"), ".v4Btn[disabled]")).toContain("opacity: .55");
  });
});
