/*
 * Keyboard audit round 2 (2026-11-12), the debate page's style rules. jsdom computes no style, so
 * this reads the rules themselves, as kbd-focus-rings does.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function declarations(selector: string, within: string = css): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const match = new RegExp(`(?:^|[},{])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "m").exec(within);
  expect(match, `${selector} has a rule`).not.toBeNull();
  return match![1]!;
}

/** The body of every `@media <query>` block, joined (they hold only plain rules). */
function media(query: string): string {
  const bodies: string[] = [];
  const opener = `@media ${query}`;
  for (let at = css.indexOf(opener); at !== -1; at = css.indexOf(opener, at + 1)) {
    let depth = 0;
    const start = css.indexOf("{", at);
    for (let index = start; index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      if (css[index] === "}") depth -= 1;
      if (depth === 0) {
        bodies.push(css.slice(start + 1, index));
        break;
      }
    }
  }
  return bodies.join("\n");
}

describe("the scroll boxes that became Tab stops show an inset ring", () => {
  it.each([".drawerBody", ".synthPanel", ".storyPanelBody", ".thread", ".singleShot"])("%s", (scroller) => {
    const ring = declarations(`${scroller}:focus-visible`);
    expect(ring).toContain("outline: 2px solid var(--focus)");
    expect(ring).toContain("outline-offset: -2px");
  });
});

describe("DEB1-3: zooming the Tree out never hides the controls of the card that holds focus", () => {
  it("hides card controls in the overview band only on cards without focus inside them", () => {
    // The old rule hid them on every card, the focused one included.
    expect(css).not.toMatch(/\.canvasInner\[data-zoom-band="overview"\]\s+:is\(/);
    expect(css).toMatch(/\.canvasInner\[data-zoom-band="overview"\] \.nodeWrap:not\(:focus-within\) :is\([^)]*\.nodeControls[^{]*\{[^}]*visibility: hidden/);
  });
});

describe("DEB1-8: on a phone the pinned debate header never covers the control focus moves to", () => {
  it("pads the page's scroll by the header's height at 640px and below", () => {
    const phone = media("(max-width: 640px)");
    expect(phone).toMatch(/\.debateTopBar\s*\{[^}]*position: sticky;[^}]*top: 0;/);
    expect(declarations("html:has(.debateTopBar)", phone)).toMatch(/scroll-padding-top: 108px/);
  });
});

describe("DEB2-14: the Challenge popover can open below its anchor", () => {
  it("drops the upward shift when it is placed below, above the phone width only", () => {
    const wide = media("(min-width: 641px)");
    expect(declarations('.popAnchor[data-placement="below"]', wide)).toContain("transform: translate(-50%, 0)");
    expect(declarations('.popAnchor[data-placement="below"] .popCard', wide)).toContain("margin-bottom: 0");
  });
});
