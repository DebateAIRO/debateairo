import { describe, expect, it } from "vitest";
import { rulesFor, stylesheet } from "./kbd-r4-e-css.js";

/*
 * Keyboard audit round 4 (12 Nov 2026), fixer E.
 * E2: on the public debate page the Help button (bottom right) and the dig Undo note (bottom left) can both show.
 *     Round 3's Help room rule, html:has(.supportWidget[collapsed]) at 0,2,1, outranked the note's html:has(.v4UndoHost)
 *     at 0,1,1, so a control tabbed to at the window's foot was scrolled clear of the Help button's 72px only, and could
 *     stay under the taller note. Where both show, the window now keeps the larger of the two rooms; the same in a
 *     short window while the cookie notice shows.
 * E7: round 3 hid the whole collapsed widget (display: none) in a short window while the cookie notice shows. A panel
 *     opened before the window became short (a phone turned on its side) then closed onto a button that could not take
 *     focus, and focus was lost. The button now only fades out there while it does not have focus: closing the panel
 *     still lands on it (it shows again while it has focus), and a mouse sees nothing different (it lets presses
 *     through, as before).
 */
const globals = stylesheet("globals.css");
const decl = (selector: string, at?: string): string => {
  const found = rulesFor(globals, selector, at);
  expect(found, `no rule for ${selector}`).toHaveLength(1);
  return found[0]!.body;
};

const HELP = 'html:has(.supportWidget[data-widget-state="collapsed"])';

describe("E2: the Help button's room and the Undo note's room together", () => {
  it("the Help room alone is unchanged", () => {
    expect(decl(HELP)).toMatch(/scroll-padding-block-end:\s*calc\(var\(--consent-bar-room, 0px\) \+ var\(--dock-offset-b\) \+ 54px\)/);
  });

  it("where both show, the window keeps the larger room (and the rule outranks both single rules)", () => {
    expect(decl(`${HELP}:has(.v4UndoHost)`)).toMatch(
      /scroll-padding-block-end:\s*max\(calc\(var\(--consent-bar-room, 0px\) \+ var\(--dock-offset-b\) \+ 54px\), var\(--v4-note-foot, 0px\)\)/
    );
  });

  it("the note's room is still computed where v4-undo.css computes it", () => {
    const undo = stylesheet("v4/v4-undo.css");
    expect(rulesFor(undo, "html:has(.v4UndoHost)")[0]?.body).toMatch(
      /--v4-note-foot:\s*calc\(var\(--v4-undo-room, 72px\) \+ 24px \+ var\(--safe-b, 0px\)\)/
    );
  });

  it("in a short window with the cookie notice, the note's room still counts", () => {
    expect(decl(`html:has(.appShell > .consentBar)${HELP.slice(4)}:has(.v4UndoHost)`, "max-height: 520px")).toMatch(
      /scroll-padding-block-end:\s*max\(var\(--consent-bar-room, 0px\), var\(--v4-note-foot, 0px\)\)/
    );
  });
});

describe("E7: the Help button in a short window with the cookie notice", () => {
  const WAITING = '.appShell:has(> .consentBar) .supportWidget[data-widget-state="collapsed"]';

  it("is never display: none there (it could not take focus back from its own panel)", () => {
    expect(rulesFor(globals, WAITING, "max-height: 520px")).toHaveLength(0);
  });

  it("fades out and lets presses through only while it does not have focus", () => {
    const body = decl(`${WAITING}:not(:focus-within)`, "max-height: 520px");
    expect(body).toMatch(/opacity:\s*0/);
    expect(body).toMatch(/pointer-events:\s*none/);
    expect(body).not.toMatch(/display|visibility/);
  });
});
