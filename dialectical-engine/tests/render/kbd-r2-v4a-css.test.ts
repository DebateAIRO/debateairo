/*
 * Keyboard audit 2026-11-12 (V4A-16, V4A-17, V4A-19, V4A-20): the ask page's rules that keep the keyboard's place in sight.
 * jsdom computes no style, so this reads the rules themselves (as kbd-focus-rings.test.ts does); how they look is V's.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[},])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "m").exec(css);
  expect(match, `${selector} has a rule`).not.toBeNull();
  return match![1]!;
}

describe("the ask page keeps the keyboard's place in sight", () => {
  it("V4A-16: while the bar is pinned, the window keeps its measured height free at the foot (not while it sits in the page)", () => {
    const rule = declarations("html:has(.v4StartBar:not(.v4StartBar--aside):not(.v4StartBar--next)):not(:has(.appShell .consentBar))");
    expect(rule).toContain("scroll-padding-block-end: max(calc(var(--v4-start-bar-room, 0px) + 8px), var(--v4-note-foot, 0px))");
    // No other rule gives the window a foot room of its own on this page.
    expect(css.match(/scroll-padding/gu)).toHaveLength(1);
    // The states that put the bar in the page are untouched.
    expect(declarations(".v4StartBar--aside")).toContain("position: static");
    expect(declarations(".appShell:has(.consentBar) .v4StartBar")).toContain("position: static");
  });

  it("V4A-17: the suggestions' list draws no ring for a pointer only; a keyboard press keeps the ring", () => {
    expect(css).not.toMatch(/\.v4StartSuggest:focus\s*\{/u);
    expect(declarations(".v4StartSuggest:focus:not(:focus-visible)")).toContain("outline: none");
  });

  it("V4A-20: the phone's cards row, a Tab stop, keeps the V4 pages' ring (nothing here takes it away)", () => {
    const base = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-base.css"), "utf8");
    expect(base).toContain(".v4Root :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }");
    expect(css).not.toMatch(/\.v4StartWays[^{,]*:focus[^{]*\{[^}]*outline:\s*(none|0)/u);
  });

  it("V4A-19: a saved question wraps to two lines at most instead of one cut line", () => {
    const rule = declarations(".v4NotStartedQuestion");
    expect(rule).toContain("-webkit-line-clamp: 2");
    expect(rule).toContain("overflow: hidden");
    expect(rule).not.toContain("white-space: nowrap");
    expect(rule).not.toContain("text-overflow: ellipsis");
  });
});
