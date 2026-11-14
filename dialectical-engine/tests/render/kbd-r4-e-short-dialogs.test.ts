import { describe, expect, it } from "vitest";
import { cssRules, rawStylesheet, rulesFor, stripComments } from "./kbd-r4-e-css.js";

/*
 * Keyboard audit round 4 (E4, 12 Nov 2026): in a 320 x 256 window (400% zoom) the cookie storage card and the legal
 * document modal are 92vh tall with a fixed head and foot, and only the middle may shrink: the storage card's list (a
 * Tab stop) got about 0px, and the Privacy modal's text got about 0px with its "Close" foot cut off. Now the middle
 * never goes under 96px, and the card's inner frame scrolls instead: Tab brings the head, the list or the text, and the
 * foot into view. In a window they already fit, nothing changes (the frame has nothing to scroll).
 * The pinned consent blocks are untouched: these rules live outside them, with selectors that outrank theirs.
 */
const raw = rawStylesheet("globals.css");
const S01 = raw.indexOf("/* === consent-ui S01 === */");
const outside = stripComments(raw.slice(0, S01));

const one = (selector: string): string => {
  const found = rulesFor(outside, selector);
  expect(found, `no rule for ${selector} outside the consent blocks`).toHaveLength(1);
  return found[0]!.body;
};

describe("the consent dialogs in a short window", () => {
  it("the pinned blocks still hold their own rules", () => {
    expect(S01).toBeGreaterThan(-1);
    const pinned = cssRules(stripComments(raw.slice(S01)));
    expect(pinned.find((r) => r.selectors.includes(".consentCardCore"))?.body).toMatch(/overflow:\s*hidden/);
    expect(pinned.find((r) => r.selectors.includes(".policyBody"))?.body).toMatch(/min-height:\s*0/);
  });

  it("the storage card's frame scrolls, and its list keeps a height", () => {
    expect(one(".consentCard > .consentCardCore")).toMatch(/overflow-y:\s*auto/);
    expect(one(".consentCardCore > .consentCatList")).toMatch(/min-height:\s*96px/);
  });

  it("the legal document modal's frame scrolls, and its text keeps a height (its read-to-the-end check still measures the text)", () => {
    expect(one(".policyBezel > .policyCore")).toMatch(/overflow-y:\s*auto/);
    expect(one(".policyCore > .policyBody")).toMatch(/min-height:\s*96px/);
  });
});
