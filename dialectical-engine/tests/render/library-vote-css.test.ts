import { describe, expect, it } from "vitest";
import { contrastRatio } from "../support/contrast.js";
import { styledDocument, tokenValue } from "../support/tokenContract.js";
import { cssRules, rawStylesheet, rulesFor, stylesheet, type CssRule } from "./kbd-r4-e-css.js";

/*
 * Public debate upvotes (design 2026-11-26, section 4 and decision 3): the vote box's rules and its two colour tokens.
 * jsdom does no layout and no cascade, so this reads the rules themselves and measures the token pairs; how the box
 * looks is the owner's (the approved mock-up).
 */
const raw = rawStylesheet("globals.css");
const globals = stylesheet("globals.css");
const rules = cssRules(globals);

/** The one rule that names exactly this selector: top-level, or inside an at-rule whose head contains `at`. */
function one(selector: string, at?: string): CssRule {
  const found = rulesFor(globals, selector, at);
  expect(found, `${selector}${at === undefined ? "" : ` inside ${at}`}: exactly one rule`).toHaveLength(1);
  return found[0]!;
}

/** That rule's declarations, as a property-to-value map. */
function declared(selector: string, at?: string): Readonly<Record<string, string>> {
  return Object.fromEntries(one(selector, at).body.split(";")
    .map((line) => line.trim()).filter((line) => line.length > 0)
    .map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()]));
}

const voteRules = rules.filter((rule) => rule.selectors.some((selector) => selector.includes("libVote")));
const MODES = ["terracotta", "chamber"] as const;

describe("the vote box's tokens", () => {
  it("one green in both modes, and the ink that is drawn on it", () => {
    const { window } = styledDocument();
    expect(tokenValue(window, "--vote", "terracotta")).toBe("#4FA26B");
    expect(tokenValue(window, "--on-vote", "terracotta")).toBe("#121826");
    expect(tokenValue(window, "--vote", "chamber")).toBe("#4FA26B");
    expect(tokenValue(window, "--on-vote", "chamber")).toBe("#0E131D");
  });

  // [what, foreground token, background token, floor]: 3 for a graphic or an edge, 4.5 for the number and the lines.
  const PAIRS = [
    ["the box's edge on the card", "--ink", "--core", 3],
    ["the arrow's fill on the box", "--vote", "--core", 3],
    ["the arrow's outline on the box", "--agree", "--core", 3],
    ["the arrow's outline on the hover tint", "--agree", "--agree-bg", 3],
    ["the number on the box", "--ink", "--core", 4.5],
    ["the number on the hover tint", "--ink", "--agree-bg", 4.5],
    ["upvoted: the fill against the card", "--vote", "--core", 3],
    ["upvoted: the edge against the card", "--agree", "--core", 3],
    ["upvoted: the arrow on the fill", "--on-vote", "--vote", 3],
    ["upvoted: the number on the fill", "--on-vote", "--vote", 4.5],
    ["the focus ring on the card", "--focus", "--core", 3],
    ["the status line on the page", "--muted", "--bg", 4.5],
    ["the status line's link on the page", "--link", "--bg", 4.5]
  ] as const;

  it.each(MODES)("every pair clears its floor in %s", (mode) => {
    const { window } = styledDocument();
    for (const [what, foreground, background, floor] of PAIRS) {
      const ratio = contrastRatio(tokenValue(window, foreground, mode), tokenValue(window, background, mode));
      const label = `${mode}: ${what} (${foreground} on ${background}) = ${ratio.toFixed(2)}`;
      expect(ratio, label).toBeGreaterThanOrEqual(floor);
    }
  });

  it("the mode's own ink would not do on the green in chamber, which is why --on-vote exists", () => {
    const { window } = styledDocument();
    const pair = (mode: (typeof MODES)[number], a: `--${string}`, b: `--${string}`): number =>
      contrastRatio(tokenValue(window, a, mode), tokenValue(window, b, mode));
    expect(pair("chamber", "--ink", "--vote")).toBeLessThan(4.5);
    // and on the light hover tint the green fill alone is under 3:1, which is why the arrow keeps its outline
    expect(pair("terracotta", "--vote", "--agree-bg")).toBeLessThan(3);
  });
});

describe("the vote box's rules", () => {
  it("the box: 54 x 58 at the card's start edge, ink edge, the card's fill", () => {
    expect(declared(".libVote")).toMatchObject({
      position: "absolute",
      "z-index": "1",
      "inset-inline-start": "18px",
      top: "15px",
      width: "54px",
      height: "58px",
      margin: "0",
      padding: "0",
      "border-width": "1.5px",
      "border-style": "solid",
      "border-color": "var(--ink)",
      "border-radius": "11px",
      "background-color": "var(--core)",
      color: "var(--ink)"
    });
    // longhands only (the test DOM drops a shorthand that holds var()), and logical sides only (Arabic, Hebrew)
    for (const property of ["border", "background", "left", "right", "inset-inline-end"]) {
      expect(declared(".libVote"), property).not.toHaveProperty(property);
    }
  });

  it("the arrow and the number", () => {
    expect(declared(".libVoteArrow")).toMatchObject({
      width: "24px", height: "24px", fill: "var(--vote)", stroke: "var(--agree)", "stroke-width": "1.5"
    });
    expect(declared(".libVoteCount")).toEqual({ "font-size": "14.5px", "font-weight": "700" });
  });

  it("hover: the pale green tint, and the arrow lifts 2px", () => {
    expect(declared(".libVote:hover")).toEqual({ "background-color": "var(--agree-bg)" });
    expect(declared(".libVote:hover .libVoteArrow")).toEqual({ transform: "translateY(-2px)" });
  });

  it("upvoted: green fill, a 3px edge in the site's green, arrow and number in --on-vote", () => {
    expect(declared('.libVote[aria-pressed="true"]')).toEqual({
      "border-width": "3px",
      "border-color": "var(--agree)",
      "background-color": "var(--vote)",
      color: "var(--on-vote)"
    });
    expect(declared('.libVote[aria-pressed="true"] .libVoteArrow')).toEqual({
      fill: "var(--on-vote)", stroke: "var(--on-vote)"
    });
    // the number takes the button's colour, so it must set none of its own
    expect(declared(".libVoteCount")).not.toHaveProperty("color");
    // same weight of selector as the hover rule: it must come later, or an upvoted box loses its fill under the pointer
    expect(one('.libVote[aria-pressed="true"]').index).toBeGreaterThan(one(".libVote:hover").index);
  });

  it("keyboard focus: the site's 2px ring, never taken away", () => {
    expect(declared(".libVote:focus-visible")).toEqual({ outline: "2px solid var(--focus)", "outline-offset": "2px" });
    for (const rule of voteRules) {
      expect(rule.body, rule.selectors.join(", ")).not.toMatch(/(?:^|;)\s*outline\s*:\s*(?:none|0)\b/);
    }
  });

  it("the row: the wrapper slides, the link inside it stands still, the card keeps room for the box", () => {
    expect(declared(".libVoteRow")).toEqual({
      position: "relative", transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
    });
    expect(declared(".libVoteRow:hover")).toEqual({ transform: "translateX(4px)" });
    expect(declared(".libVoteRow .libRowCore")).toEqual({ "min-height": "88px", "padding-inline-start": "88px" });
    // this exact text is what the row's source test reads once the rows are wired
    expect(raw).toContain(".libVoteRow > .libRow:hover { transform: none; }");
    // private rows keep their own slide
    expect(declared(".libRow:hover")).toEqual({ transform: "translateX(4px)" });
  });

  it("the status line under the card", () => {
    expect(declared(".libVoteNote")).toEqual({
      margin: "6px 0 0", "padding-inline-start": "18px", "font-size": "11px", color: "var(--muted)"
    });
    expect(declared(".libVoteNote a")).toEqual({ color: "var(--link)", "text-decoration": "underline" });
  });

  it("less motion: no slide and no lift on these rows", () => {
    const at = "prefers-reduced-motion: reduce";
    expect(declared(".libVoteRow", at)).toEqual({ transition: "none" });
    expect(declared(".libVoteArrow", at)).toEqual({ transition: "none" });
    expect(declared(".libVoteRow:hover", at)).toEqual({ transform: "none" });
    expect(declared(".libVote:hover .libVoteArrow", at)).toEqual({ transform: "none" });
  });

  it("narrow screens: the library's own 720px block keeps its rules and gains two", () => {
    const start = raw.indexOf("@media (max-width: 720px) {\n  .libScreen");
    expect(start).toBeGreaterThan(-1);
    expect(raw.slice(start, raw.indexOf("\n}", start)).split("\n").slice(1).map((line) => line.trim())).toEqual([
      ".libScreen { padding: 28px 20px 36px; }",
      ".libTitle { font-size: 28px; }",
      ".libRowCore { flex-wrap: wrap; gap: 10px; }",
      ".libRowBody { flex: 1 1 100%; }",
      ".libVoteRow .libRowCore { padding-inline-start: 84px; }",
      ".libVote { top: 14px; }"
    ]);
    expect(declared(".libVoteRow .libRowCore", "max-width: 720px")).toEqual({ "padding-inline-start": "84px" });
    expect(declared(".libVote", "max-width: 720px")).toEqual({ top: "14px" });
  });

  it("eighteen rules, all in the library section, with no colour literal and no forced-colours rule", () => {
    expect(voteRules).toHaveLength(18);
    const arrowAt = one(".libArrow").index;
    const emptyAt = one(".libEmpty").index;
    for (const rule of voteRules) {
      const where = rule.selectors.join(", ");
      expect(rule.body, where).not.toMatch(/oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/i);
      expect(rule.at.join(" "), where).not.toContain("forced-colors");
      if (rule.at.some((head) => head.includes("max-width: 720px"))) continue;
      expect(rule.index, where).toBeGreaterThan(arrowAt);
      expect(rule.index, where).toBeLessThan(emptyAt);
    }
  });
});
