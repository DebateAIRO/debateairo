import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Keyboard audit round 4 (2026-11-12), C3: at overview zoom (below 50%) the Tree hides every card's header, prose and
 * controls unless the card already has `:focus-within`, with `visibility: hidden`, which takes Challenge and Details
 * out of the Tab order: Tab could never get inside a card. The controls now stay in the Tab order at overview zoom;
 * they stay transparent and unclickable until their card holds focus, so nothing a mouse user sees changes.
 *
 * Seen in Chrome (painted, real Tab presses): a first version showed the controls only while the canvas, or something
 * in it, had the keyboard's ring. Tab from one control to the next then dropped focus on nothing: the browser checks
 * that the next control can take focus after the last one has let go of it, and at that moment nothing in the Tree is
 * focused. So the rule must not depend on where focus is.
 */
const css = readFileSync(`${process.cwd()}/apps/ui/app/globals.css`, "utf8");

function block(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("}", at));
}

describe("C3: the Tree's card controls can be tabbed to at overview zoom", () => {
  const hide = '.canvasInner[data-zoom-band="overview"] .nodeWrap:not(:focus-within) :is(';
  const reach = '.canvasViewport .canvas .canvasInner[data-zoom-band="overview"] .nodeWrap:not(:focus-within) .nodeControls';

  it("the overview rule still hides the cards' parts, controls included, for the pointer", () => {
    const at = css.indexOf(hide);
    expect(at).toBeGreaterThanOrEqual(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toMatch(/\.nodeControls,/);
    expect(rule).toMatch(/visibility: hidden;\s*opacity: 0;\s*pointer-events: none;/);
  });

  it("the controls are visible to Tab, and only that", () => {
    const rule = block(reach);
    expect(rule.replace(/\/\*[\s\S]*?\*\//g, "").slice(reach.length).replace(/[{\s]/g, "")).toBe("visibility:visible;");
  });

  it("outweighs the hiding rule, whose `:is()` list counts as its heaviest entry (seen losing in Chrome without this)", () => {
    // Classes, attributes and pseudo-classes of a selector; `:is()` and `:not()` count as their heaviest argument.
    const weight = (selector: string): number => {
      let total = 0;
      const outer = selector.replace(/:(is|not)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (_all, _name, inner: string) => {
        total += Math.max(...inner.split(",").map((part) => weight(part)));
        return "";
      });
      return total + (outer.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;
    };
    const at = css.indexOf(hide);
    const hiding = css.slice(at, css.indexOf("{", at)).replace(/\s+/g, " ").trim();
    expect(weight(hiding)).toBe(6);
    expect(weight(reach)).toBeGreaterThan(weight(hiding));
  });

  it("no rule makes a card's controls focusable only while something in the Tree is focused", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((rule) => rule.split("{")[0] ?? "");
    const waiting = rules.filter((selector) => /\.nodeControls/.test(selector) && /data-zoom-band/.test(selector)
      && /\.canvas(Viewport)?[^,{]*(:focus-visible|:focus-within|:has\()/.test(selector.split(".nodeWrap")[0] ?? ""));
    expect(waiting).toEqual([]);
  });
});
