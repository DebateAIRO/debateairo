import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Keyboard audit round 4 (2026-11-13), seen in a painted browser on the real classic debate page with made-up data.
 *
 * 1. Phone (390 x 844, 320 x 256): the owner's Visibility card sticks to the foot of the window over the reading views,
 *    and a control tabbed to under it stayed wholly hidden (10 of the Tree's 67 controls, 3 of the Thread's 99). The
 *    window now keeps the card's height plus 8px clear when it scrolls a focused control into view (the card publishes
 *    its real height, kbd-r4-c8-card-room; the fallback is its least height, 6rem).
 * 2. A short window wider than a phone (844 x 390, a phone on its side): the column was one 100dvh box and the header,
 *    the notices and the card took all of it: the reading views were 0px tall. The column now scrolls as a page there,
 *    as it does on a phone, and the same room applies.
 * After both: 0 focused controls hidden at 390 x 844, 320 x 256, 844 x 390 and 1024 x 500 (Thread, Split, Tree, Map);
 * 1280 x 800 unchanged.
 */
const css = readFileSync(`${process.cwd()}/apps/ui/app/globals.css`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of the first `@media <query> { … }` block whose text contains `needle`. */
function mediaBlock(query: string, needle: string): string {
  let from = 0;
  for (;;) {
    const at = css.indexOf(`@media ${query} {`, from);
    expect(at, `@media ${query} holding ${needle}`).toBeGreaterThanOrEqual(0);
    let depth = 0;
    let end = at;
    for (let index = css.indexOf("{", at); index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      if (css[index] === "}") depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
    const body = css.slice(at, end + 1);
    if (body.includes(needle)) return body;
    from = end + 1;
  }
}

function rule(body: string, selector: string): string {
  const at = body.indexOf(`${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  return body.slice(at, body.indexOf("}", at));
}

const CARD = "html:has(.debateView > section.card.publicationControl)";
const ROOM = "calc(var(--visibility-card-room, min(6rem, 25dvh)) + 8px)";

describe("the Visibility card's room when the page scrolls under it", () => {
  const body = mediaBlock("(max-width: 640px), (max-height: 520px)", CARD);

  it("applies on a phone and in any short window", () => {
    expect(body.startsWith("@media (max-width: 640px), (max-height: 520px) {")).toBe(true);
  });

  it("keeps the card's real height (as it publishes it; its min-height until then) plus 8px, or the cookie notice's room when that is larger", () => {
    expect(rule(body, CARD)).toContain(`scroll-padding-block-end: max(var(--consent-bar-room, 0px), ${ROOM})`);
  });

  it("outranks the Help button's room and keeps the larger of the two", () => {
    expect(rule(body, `${CARD}:has(.supportWidget[data-widget-state="collapsed"])`)).toContain(
      `scroll-padding-block-end: max(calc(var(--consent-bar-room, 0px) + var(--dock-offset-b) + 54px), ${ROOM})`
    );
  });

  it("in a short window with the cookie notice showing (Help waits there), keeps the notice's room or the card's", () => {
    const short = mediaBlock("(max-height: 520px)", ".consentBar):has(.debateView > section.card.publicationControl)");
    expect(
      rule(short, `html:has(.appShell > .consentBar):has(.debateView > section.card.publicationControl):has(.supportWidget[data-widget-state="collapsed"])`)
    ).toContain(`scroll-padding-block-end: max(var(--consent-bar-room, 0px), ${ROOM})`);
  });

  it("matches the card's own least height", () => {
    expect(rule(css, ".debateView > section.card.publicationControl")).toContain("min-height: min(6rem, 25dvh);");
  });
});

describe("a short window wider than a phone scrolls the debate column as a page", () => {
  const body = mediaBlock("(min-width: 641px) and (max-height: 520px)", ".debateMain");

  it("the column grows with its content instead of being one window-high box", () => {
    const view = rule(body, ".debateView");
    expect(view).toContain("height: auto;");
    expect(view).toContain("min-height: 100dvh;");
    expect(view).toContain("overflow: visible;");
  });

  it("the one-row header stays pinned, opaque, and focus stops below it", () => {
    const bar = rule(body, ".debateTopBar");
    expect(bar).toContain("position: sticky;");
    expect(bar).toContain("top: 0;");
    expect(bar).toContain("background: var(--bg);");
    expect(rule(body, "html:has(.debateTopBar)")).toContain("scroll-padding-top: 66px;");
    expect(rule(css, ".debateTopBar")).toMatch(/flex: 0 0 (58|60)px;/);
  });

  it("the reading views keep the window's height under the header", () => {
    const main = rule(body, ".debateMain");
    expect(main).toContain("flex: 0 0 auto;");
    expect(main).toContain("height: calc(100dvh - 58px);");
  });
});
