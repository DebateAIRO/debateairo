import { describe, expect, it } from "vitest";
import { cssRules, stylesheet } from "./kbd-r4-e-css.js";

/*
 * Keyboard audit round 4 (E6, 12 Nov 2026): no stylesheet had a forced-colors rule, and these fields and buttons show
 * focus only with `outline: none` plus a border colour and a box-shadow. Windows High Contrast drops the shadow and
 * paints every border the same, so focus could not be seen. In forced colours they now get a system-colour outline; in
 * normal mode nothing changes (the block applies only under forced colours).
 * The sweep below lists every rule under app/ that takes the outline away; each one is either a non-control (a heading,
 * a region, the main area), has a ring on a parent or on :focus-visible, or is named in the block.
 */
const globals = stylesheet("globals.css");

const COVERED = [
  ".authField input:focus",
  ".authField input.authRecoveryInput:focus",
  ".authField select:focus",
  ".dobFieldset .dobInput:focus",
  ".dobFieldset .dobPickerToggle:focus-visible",
  ".dobFieldset .dobDecadeButton:focus-visible",
  ".dobFieldset .dobCell:focus-visible",
  ".supportComposer input:focus-visible",
  ".v4AskField:focus",
  ".v4AskInput:focus",
  // the fields Design Document v2 gave the same border-and-shadow focus mark
  ".v4StartRewriteField:focus",
  ".v4StartOwnField:focus",
  ".v4PubText:focus",
  ".v4PubText:focus-visible"
];

describe("a focus mark that survives forced colours", () => {
  const block = cssRules(globals).filter((rule) => rule.at.some((head) => head === "@media (forced-colors: active)"));

  it("one block, with a system-colour outline", () => {
    expect(block).toHaveLength(1);
    expect(block[0]!.body).toMatch(/outline:\s*2px solid Highlight/);
    expect(block[0]!.body).toMatch(/outline-offset:\s*1px/);
  });

  it.each(COVERED)("covers %s, and outranks the rule that takes its outline away", (selector) => {
    expect(block[0]!.selectors).toContain(`:root ${selector}`);
  });

  it("every other rule under app/ that takes the outline away is not a control's only focus mark", () => {
    const files = ["globals.css", "legal.css", "language-switcher.css", "billing.css", "data-export.css", "security-confirmation.css",
      "public/debate/[id]/public-lane.css", "v4/v4-ask.css", "v4/v4-base.css", "v4/v4-debate.css", "v4/v4-map-looks.css", "v4/v4-map.css",
      "v4/v4-public.css", "v4/v4-quota.css", "v4/v4-report-map.css", "v4/v4-report.css", "v4/v4-undo.css", "v4/v4-wait.css"];
    // Not controls (the whole page, a region focus is parked on, headings focus is moved to), or a ring elsewhere.
    const known = new Set([
      ".appMain:focus", "#page-content:focus:not([data-focus-parked])", ".policyBody .policySection:focus",
      ".crisisSupport .policyTitle:focus", ".questionRefusal .policyTitle:focus", ".splitFocusClaim:focus", ".splitFocusRootClaim:focus",
      ".v4AskReadTitle:focus", ".v4ReadAskedTitle:focus", ".v4StartWayAdded:focus", '.authAlert[tabindex="-1"]:focus:not([data-focus-parked])', ".v4StartSheet:focus", ".v4StartMore:focus", ".v4PanelH2:focus",
      ".v4StartSuggest:focus:not(:focus-visible)", ".v4RepCard:focus:not(:focus-visible)", ".v4RepStatusBox:focus:not(:focus-visible)",
      // ringed on the parent (.ndTopicBezel:has(...), .libComposer:has(...)) or on :focus-visible
      ".ndTopic:focus", ".libComposerInput:focus", ".languageSwitcherSearch input",
      // an SVG map segment: its focus mark is a 4px stroke, which keeps its width in forced colours
      '.mapStage [role="button"]:focus',
      // the base rules the covered :focus rules sit on
      ".supportComposer input", ".authField input", ".authField input.authRecoveryInput", ".dobFieldset .dobInput",
      ...COVERED
    ]);
    const unknown = files.flatMap((file) => cssRules(stylesheet(file))
      .filter((rule) => /(?:^|;)\s*outline\s*:\s*(?:none|0)\b/.test(rule.body))
      .flatMap((rule) => rule.selectors.filter((selector) => !known.has(selector)).map((selector) => `${file}: ${selector}`)));
    expect(unknown).toEqual([]);
  });
});
