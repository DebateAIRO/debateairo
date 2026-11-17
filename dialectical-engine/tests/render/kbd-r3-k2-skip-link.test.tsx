// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkipLink } from "../../apps/ui/components/SkipLink.js";

/*
 * Keyboard audit 2026-11-12, wave 3 (CHR1-4): "Skip to main content" skipped nothing on the pages that draw their own header
 * inside the main area. Such a page marks where its content starts (`id="page-content"`, `tabIndex={-1}`, on the first
 * element after its own header) and the link goes there; with no mark it is the plain link to `#main-content` it always was.
 * The link is the real component; the page around it is a stand-in of the layout's shape. Made-up words only.
 */

const ui = (path: string): string => readFileSync(resolve(import.meta.dirname, "../../apps/ui", path), "utf8");

let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The layout's shape: the link, then the one main area, and inside it what the page draws. */
async function mount(page: (props: Record<string, never>) => React.ReactElement): Promise<HTMLAnchorElement> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const Page = page;
  await act(async () => root!.render(
    <div className="appShell">
      <SkipLink>Skip to main content</SkipLink>
      <main id="main-content" tabIndex={-1} className="appMain"><Page /></main>
    </div>
  ));
  return host.querySelector<HTMLAnchorElement>("a.skipLink")!;
}

/** Enter on a focused link: the browser fires a click on it. Returns whether the link's own jump was left to happen. */
function pressEnter(link: HTMLAnchorElement): boolean {
  let followed = true;
  act(() => {
    link.focus();
    followed = link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
  return followed;
}

const OwnHeaderPage = () => (
  <div className="v4Root">
    <header className="v4Hdr"><a href="/v4">Brand</a><button type="button">Account</button></header>
    <div id="page-content" tabIndex={-1} className="v4AskMain"><h1>Ask</h1><textarea aria-label="Question" /></div>
  </div>
);

describe("the skip link (CHR1-4)", () => {
  it("is a real link to the main area before any script runs", async () => {
    const link = await mount(() => <p>Plain page</p>);
    expect(link.getAttribute("href")).toBe("#main-content");
    expect(link.textContent).toBe("Skip to main content");
  });

  it("on a page with no mark it stays the plain link: the browser's own jump to #main-content is left alone", async () => {
    const link = await mount(() => <p>Library</p>);
    expect(pressEnter(link)).toBe(true);
  });

  it("on a page that draws its own header it goes past that header, to where the page says its content starts", async () => {
    const link = await mount(OwnHeaderPage);
    expect(pressEnter(link), "the jump to #main-content is replaced").toBe(false);
    expect(document.activeElement).toBe(document.getElementById("page-content"));
  });

  it("a mark that cannot take focus (the page is hidden behind the Terms screen) leaves the plain jump", async () => {
    const link = await mount(() => (
      <>
        <div hidden><div id="page-content" tabIndex={-1}>Hidden page</div></div>
        <p>The Terms screen</p>
      </>
    ));
    // jsdom does not take focus from a hidden element by itself; a browser would. Stand in for it.
    const mark = document.getElementById("page-content")!;
    vi.spyOn(mark, "focus").mockImplementation(() => undefined);
    expect(pressEnter(link)).toBe(true);
    expect(document.activeElement).toBe(link);
  });

  it("a press with a modifier (open in a new tab) is the browser's", async () => {
    const link = await mount(OwnHeaderPage);
    let followed = true;
    act(() => {
      followed = link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    });
    expect(followed).toBe(true);
  });

  it("focus lands without scrolling when the content's start is already in view under the header", async () => {
    const link = await mount(OwnHeaderPage);
    const mark = document.getElementById("page-content")!;
    vi.spyOn(mark, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 64, 800, 900));
    const scroll = vi.fn();
    Object.defineProperty(mark, "scrollIntoView", { configurable: true, value: scroll });
    const focus = vi.spyOn(mark, "focus");
    pressEnter(link);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scroll).not.toHaveBeenCalled();
  });

  it("when it is out of view it is scrolled to the top, clear of a sticky header above it", async () => {
    const link = await mount(() => (
      <div>
        <header className="stuckBar" style={{ position: "sticky", top: "0px" }}>Bar</header>
        <div id="page-content" tabIndex={-1}>Content</div>
      </div>
    ));
    const bar = document.querySelector<HTMLElement>(".stuckBar")!;
    const mark = document.getElementById("page-content")!;
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 56));
    vi.spyOn(mark, "getBoundingClientRect").mockReturnValue(new DOMRect(0, -400, 800, 900));
    let marginWhenScrolled = "";
    const scroll = vi.fn(() => { marginWhenScrolled = mark.style.scrollMarginTop; });
    Object.defineProperty(mark, "scrollIntoView", { configurable: true, value: scroll });
    pressEnter(link);
    expect(document.activeElement).toBe(mark);
    expect(scroll).toHaveBeenCalledWith({ block: "start" });
    expect(marginWhenScrolled, "the sticky bar's height is kept clear").toBe("56px");
    expect(mark.style.scrollMarginTop, "and the page's own style is left as it was").toBe("");
  });
});

describe("the pages mark where their content starts (CHR1-4)", () => {
  it("the layout renders the skip link component, first in the shell, before the top bar", () => {
    const layout = ui("app/layout.tsx");
    expect(layout).toMatch(/<div className="appShell">\s*(?:\{\/\*[^*]*\*\/\}\s*)?<SkipLink>[^<]*<\/SkipLink>\s*<TopBar \/>/);
    expect(layout).toContain('import { SkipLink } from "@/components/SkipLink";');
  });

  it("the link component keeps the real href and looks for the mark by its one id", () => {
    const source = ui("components/SkipLink.tsx");
    expect(source).toContain('href="#main-content"');
    expect(source).toContain('"page-content"');
  });

  it.each([
    ["the landing (right after LandingChrome)", "components/landing/LandingHero.tsx", 1],
    ["/help (the desk's body after its header)", "components/support/Assistant.tsx", 1],
    ["the public debate page", "app/public/debate/[id]/PublicDebatePageClient.tsx", 1],
    ["the public debate page's notes", "app/public/debate/[id]/PublicPageNote.tsx", 1],
    ["My questions", "components/v4/V4AllMaps.tsx", 1]
  ])("%s", (_name, file, count) => {
    const source = ui(file);
    expect(source.match(/id="page-content"/g)?.length ?? 0).toBe(count);
    expect(source).toMatch(/id="page-content"\s+tabIndex=\{-1\}/);
  });

  it("the ask page marks every screen it can show after its header", () => {
    const source = ui("components/v4/V4AskClient.tsx");
    // The Undo map, step 1 and step 2. The site-update line takes no mark: the mark stays on the step's root in every state,
    // so a focus the skip link put there survives the line coming (wave-3 fix round, A8; the rendered page:
    // kbd-r3-fixa-ask-marks.test.tsx).
    expect(source.match(/id="page-content" tabIndex=\{-1\}/g)?.length ?? 0).toBe(3);
    expect(source).not.toMatch(/site\.updated \? \{\} : \{ id: "page-content"/);
    expect(source).toMatch(/<p className="v4AskHint v4AskSiteUpdated" role="status">/);
  });

  it("the map page marks every screen it can show after its header", () => {
    const source = ui("components/v4/V4DebateClient.tsx");
    // Signed out, the outline, the hand-off map, the screens before the map, and the map.
    expect(source.match(/id="page-content"/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("the report page marks every screen it can show after its header", () => {
    const source = ui("components/v4/V4ReportClient.tsx");
    expect(source.match(/id="page-content"/g)?.length ?? 0).toBe(3);
  });

  it("the mark shows no ring around a whole region, as the main area shows none", () => {
    const css = ui("app/globals.css");
    expect(css).toMatch(/\.appMain:focus\s*\{\s*outline:\s*none;\s*\}/);
    // A part the focus guard parked focus on keeps the guard's ring (wave-3 fix round, A1).
    expect(css).toMatch(/#page-content:focus:not\(\[data-focus-parked\]\)\s*\{\s*outline:\s*none;\s*\}/);
  });
});
