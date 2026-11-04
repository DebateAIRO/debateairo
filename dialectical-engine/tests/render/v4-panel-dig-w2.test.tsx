// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSource } from "../../packages/contract/src/index.js";
import { V4SourcesFold } from "../../apps/ui/components/v4/V4Sources.js";
import {
  advance, branch, buttonNamed, buttonsNamed, CATALOG, click, expandBranch, harness, mountMap, openPath, page, panel, PATHS, resetHarness,
  seededAnswer, settle, tray, typeInto, unmountMap
} from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Wave 2 of the owner's screen review (OWNER-PICKS-2026-11-03.md), the panel and choosing what to dig, on the map page in
 * jsdom: map-d4 A (evidence first, sources folded into one line, "Skip to the dig button", the dig block pinned to the
 * panel's foot), map-f14 and dig-f4 (one pick reads "Dig into your pick", dig-f5 / dig-f31; the tray only from the second pick, docked in the panel
 * column, never on a phone), dig-f9 (consent and crisis help at the click), dig-f14 (Cancel gives the tick back), dig-f21
 * (the person's words keep their direction), dig-f22 (a visible reason over greyed boxes), dig-f26 (Free's line under the
 * own-view box) and dig-f34 ("Open question", "Your view").
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const panelBoxes = (): HTMLInputElement[] => [...panel().querySelectorAll<HTMLInputElement>(".v4Sugs input[type=checkbox]")];
const treeBoxes = (index: number): HTMLInputElement[] =>
  [...branch(index).querySelectorAll<HTMLInputElement>(".v4MapLeafSuggestion input[type=checkbox]")];
const notes = (): HTMLElement[] => [...page().querySelectorAll<HTMLElement>(".v4Undo")];
const css = (name: string): string => readFileSync(resolve(import.meta.dirname, `../../apps/ui/app/v4/${name}`), "utf8");
/** Whether `a` comes before `b` in the page. */
const before = (a: Node, b: Node): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
/** A path's label as a short line shows it: the heading's words, cut at a word edge with "…" when long. */
const shortened = (label: string, heading: string): boolean => heading.startsWith(label.replace(/…$/u, ""));

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

// map-f14's "Dig into this" for one pick is an owner question: the built words are dig-f5 / dig-f31's "Dig into your pick"
// (one dig-button helper, lib/v4/digQuota.ts), and the tray's "Dig into these" (journey-f13).
describe("map-f14 / dig-f4: one pick reads \"Dig into your pick\"; the tray comes from the second pick, docked in the panel column", () => {
  it("one pick: no tray, and the path's pinned button reads 'Dig into your pick'; two: the tray docks under the panel", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    await click(panelBoxes()[0]!);
    expect(tray()).toBeNull();
    expect(buttonsNamed(CATALOG["v4.dig.yourPicks.one"]!, panel())).toHaveLength(1);
    expect(buttonsNamed(CATALOG["v4.panel.dig"]!, panel())).toHaveLength(0);
    await click(panelBoxes()[1]!);
    const docked = page().querySelector<HTMLElement>(".v4DebPanelCol > .v4DebTrayDock");
    expect(docked).not.toBeNull();
    expect(tray()).toBe(docked);
    // Never in the bottom stack, never floating over the map.
    expect(page().querySelector(".v4Stack .v4DebTray")).toBeNull();
    // One dig button for the picks: the panel's own (the tray has only Clear).
    expect(buttonsNamed(CATALOG["v4.dig.yourPicks.other"]!, panel())).toHaveLength(1);
    expect([...docked!.querySelectorAll("button")].map((button) => button.textContent)).toEqual([CATALOG["v4.dig.trayClear"]]);
    // Undo on the panel's button: the tray steps back while the dig waits, and comes back with Undo.
    await click(buttonNamed(CATALOG["v4.dig.yourPicks.other"]!, panel()));
    expect(tray()).toBeNull();
    await click(page().querySelector<HTMLButtonElement>(".v4Undo .v4UndoBtn")!);
    expect(tray()).not.toBeNull();
  });

  it("with the panel elsewhere, the docked tray carries the dig of the picks itself", async () => {
    await mountMap();
    await expandBranch(PATHS.renew);
    for (const box of treeBoxes(PATHS.renew)) await click(box);
    expect(panel().classList.contains("v4Panel-root")).toBe(true);
    const dig = buttonNamed(CATALOG["v4.dig.trayDigThese"]!, tray()!);
    await click(dig);
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect((harness.submit.mock.calls[0]![3] as { picks?: unknown[] }).picks).toHaveLength(2);
  });

  it("the tray measures itself on the panel column, so the pinned dig block sits right above it", async () => {
    const measured = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { height: this.classList.contains("v4DebTrayDock") ? 87.2 : 0, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    await mountMap();
    await openPath(PATHS.renew);
    await click(panelBoxes()[0]!);
    await click(panelBoxes()[1]!);
    const column = page().querySelector<HTMLElement>(".v4DebPanelCol")!;
    expect(column.style.getPropertyValue("--v4-dock-room")).toBe("88px");
    await click(buttonNamed(CATALOG["v4.dig.trayClear"]!, tray()!));
    expect(column.style.getPropertyValue("--v4-dock-room")).toBe("");
    measured.mockRestore();
  });

  it("a pick on 'Your question' is dug by that panel's own pinned button; a pick it does not list is not", async () => {
    await mountMap();
    const rootBox = panel().querySelector<HTMLInputElement>(".v4PanelOpenRow input[type=checkbox]")!;
    expect(buttonsNamed(CATALOG["v4.dig.yourPicks.one"]!, panel())).toHaveLength(0);
    await click(rootBox);
    expect(tray()).toBeNull();
    await click(buttonNamed(CATALOG["v4.dig.yourPicks.one"]!, panel()));
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    await settle();
    // A suggestion of a path is not on the main question's list: that panel offers no button for it.
    await expandBranch(PATHS.renew);
    await click(treeBoxes(PATHS.renew)[0]!);
    expect(panel().classList.contains("v4Panel-root")).toBe(true);
    expect(buttonsNamed(CATALOG["v4.dig.yourPicks.one"]!, panel())).toHaveLength(0);
  });

  it("on a phone there is no tray at all; the pinned bar carries the picks ('Dig into your picks')", async () => {
    await mountMap(375, crypto.randomUUID(), "n-renew");
    const boxes = [...panel().querySelectorAll<HTMLInputElement>(".v4Sugs input[type=checkbox]")];
    await click(boxes[0]!);
    await click(boxes[1]!);
    expect(page().querySelector(".v4DebTray")).toBeNull();
    expect(page().querySelector(".v4DebPhoneDig")?.textContent).toBe(CATALOG["v4.dig.yourPicks.other"]!);
    // The panel's own dig button is left out on the phone, on "Your question" too (one button only).
    const rules = css("v4-debate.css");
    expect(rules).toMatch(/\.v4DebLayout-phone \.v4Panel-root \.v4PanelDigBtn \{ display: none; \}/u);
  });
});

describe("map-d4 A: evidence first, sources folded, Skip to the dig button, the dig block pinned", () => {
  const source = (id: string, site: string): WebSource => ({
    extract_id: `ex-${id}`, quote: `A made-up quote ${id}.`, title: `Page ${id}`, site, link: `https://${site}/${id}`, read_depth: "WHOLE",
    explanation: null, published_on: null
  });

  it("folds a point's sources into one closed line naming the sites, never a count of pages or of sites (journey-f23)", () => {
    const fold = (sources: WebSource[]) => {
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(<V4SourcesFold sources={sources} catalog={CATALOG} locale="en" />);
      return host.querySelector<HTMLDetailsElement>("details.v4SourcesFold")!;
    };
    const two = fold([source("a", "iea.org"), source("b", "oecd-nea.org"), source("c", "iea.org")]);
    expect(two.hasAttribute("open")).toBe(false);
    expect(two.querySelector("summary")!.textContent).toBe(word("v4.web.sourcesFrom", { sites: "iea.org and oecd-nea.org" }));
    // Every page is inside the fold, in full.
    expect(two.querySelectorAll(".v4Sources blockquote")).toHaveLength(3);
    const many = fold([source("a", "iea.org"), source("b", "oecd-nea.org"), source("c", "ember.org"), source("d", "ipcc.ch")]);
    expect(many.querySelector("summary")!.textContent).toBe("From iea.org, oecd-nea.org, ember.org, and ipcc.ch");
    expect(many.querySelector("summary")!.textContent).not.toMatch(/\bpages?\b|\d|\bmore\b/u);
    expect(renderToStaticMarkup(<V4SourcesFold sources={[]} catalog={CATALOG} locale="en" />)).toBe("");
  });

  it("on the map page every source list of the panel sits inside its point's fold, and other pages are folded", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    // The findings' own source lists (the other pages found keep their own list, inside their own fold).
    const lists = [...panel().querySelectorAll(".v4PanelPoint .v4Sources")];
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) expect(list.closest("details.v4SourcesFold")).not.toBeNull();
    const others = panel().querySelector<HTMLDetailsElement>("details.v4PanelOtherPages");
    if (others !== null) {
      expect(others.hasAttribute("open")).toBe(false);
      expect(others.querySelector("summary")!.textContent).toBe(CATALOG["v4.web.otherPages"]);
    }
  });

  it("the findings come under 'What we found', after the answer here and before where to dig", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    const found = [...panel().querySelectorAll<HTMLElement>(".v4PanelGroups > .v4PanelH3")];
    expect(found.map((heading) => heading.textContent)).toEqual([CATALOG["v4.panel.found"]]);
    const answer = [...panel().querySelectorAll<HTMLElement>(".v4PanelH3")].find((heading) => heading.textContent === CATALOG["v4.panel.answerHere"])!;
    const where = [...panel().querySelectorAll<HTMLElement>(".v4PanelH3")].find((heading) => heading.textContent === CATALOG["v4.panel.whereToDig"])!;
    expect(before(answer, found[0]!)).toBe(true);
    expect(before(found[0]!, where)).toBe(true);
  });

  it("'Skip to the dig button' comes before the findings on every path that can be dug, and lands on the button", async () => {
    await mountMap();
    await openPath(PATHS.smr);
    const skip = buttonNamed(CATALOG["v4.panel.skipToDig"]!, panel());
    const groups = panel().querySelector(".v4PanelGroups");
    if (groups !== null) expect(before(skip, groups)).toBe(true);
    await click(skip);
    expect(document.activeElement).toBe(panel().querySelector(".v4PanelDigBtn"));
  });

  it("pins the dig block to the panel's foot on a computer, laptop and tablet, above the docked tray", () => {
    const rules = css("v4-debate.css");
    expect(rules).toMatch(/\.v4DebLayout-desktop \.v4DebPanelCol \.v4PanelDig,\s*\.v4DebLayout-laptop \.v4DebPanelCol \.v4PanelDig,\s*\.v4DebLayout-mid \.v4DebPanelCol \.v4PanelDig \{\s*position: sticky; bottom: var\(--v4-dock-room, 0px\);[^}]*background: var\(--bg\)/u);
    expect(rules).toMatch(/\.v4DebPanelCol > \.v4DebTrayDock \{\s*position: sticky; bottom: 0;/u);
    // Not on the phone: there the pinned bar is the dig button.
    expect(rules).not.toMatch(/\.v4DebLayout-phone[^{]*\.v4PanelDig \{[^}]*sticky/u);
  });

  it("the browser check (4 Nov): while the cookie bar shows, the block and the tray sit in the panel's flow, clear of it", () => {
    const rules = css("v4-debate.css");
    // As the ask bar and the phone stack do (v4-ask.css C4, v4-undo.css journey-d3): the cookie bar, fixed at the bottom,
    // covered the pinned block and the docked tray, so Dig could not be pressed.
    expect(rules).toMatch(/\.appShell:has\(\.consentBar\) \.v4DebPanelCol \.v4PanelDig,\s*\.appShell:has\(\.consentBar\) \.v4DebPanelCol > \.v4DebTrayDock \{ position: static; \}/u);
    // The panel column gets room at its end so both scroll clear of the cookie bar, keyboard focus included.
    expect(rules).toMatch(/\.appShell:has\(\.consentBar\) \.v4DebLayout-desktop \.v4DebPanelCol,\s*\.appShell:has\(\.consentBar\) \.v4DebLayout-laptop \.v4DebPanelCol,\s*\.appShell:has\(\.consentBar\) \.v4DebLayout-mid \.v4DebPanelCol \{\s*padding-bottom: calc\(180px \+ var\(--v4-stack-room, 0px\)\); scroll-padding-block-end: 188px;/u);
    // It comes after the pinned rules, so it wins while the cookie bar shows.
    expect(rules.indexOf(".appShell:has(.consentBar) .v4DebPanelCol .v4PanelDig")).toBeGreaterThan(rules.indexOf("scroll-padding-block-end: calc(var(--v4-pin-room"));
  });
});

describe("dig-f9: the consent and the crisis help run at the click, before the 10 seconds", () => {
  it("asks the consent at the click; the 10 seconds start only once it is given, and nothing is sent before", async () => {
    let answer: (agreed: boolean) => void = () => undefined;
    harness.ensureConsent = vi.fn(() => new Promise<boolean>((resolve) => { answer = resolve; }));
    await mountMap();
    await openPath(PATHS.smr);
    await click(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    expect(harness.ensureConsent).toHaveBeenCalledTimes(1);
    expect(notes()).toHaveLength(0);
    // A second press while the consent is still open does nothing more.
    await click(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    expect(harness.ensureConsent).toHaveBeenCalledTimes(1);
    await advance(30_000);
    expect(harness.submit).not.toHaveBeenCalled();
    await act(async () => answer(true));
    await settle();
    expect(notes()).toHaveLength(1);
    await advance(9_500);
    expect(harness.submit).not.toHaveBeenCalled();
    await advance(600);
    expect(harness.submit).toHaveBeenCalledTimes(1);
  });

  it("a declined consent starts nothing and sends nothing", async () => {
    harness.ensureConsent = vi.fn(async () => false);
    await mountMap();
    await openPath(PATHS.smr);
    await click(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    expect(notes()).toHaveLength(0);
    await advance(30_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("checks only the person's own views for a crisis; when one trips, the help opens at once and nothing starts", async () => {
    await mountMap();
    await openPath(PATHS.smr);
    await click(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    // A whole path is AI-written text around the person's question (ASK-4): no words of theirs to check.
    expect(harness.offerCrisisHelp).toHaveBeenLastCalledWith([]);
    await click(page().querySelector<HTMLButtonElement>(".v4Undo .v4UndoBtn")!);

    harness.offerCrisisHelp = vi.fn(() => true);
    await openPath(PATHS.renew);
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "My own view, in my own words.");
    await click(buttonNamed(CATALOG["v4.suggest.ownViewAdd"]!, panel()));
    await click(buttonNamed(CATALOG["v4.dig.yourPicks.one"]!, panel()));
    expect(harness.offerCrisisHelp).toHaveBeenCalledWith(["My own view, in my own words."]);
    expect(harness.ensureConsent).toHaveBeenCalledTimes(1);
    expect(notes().filter((note) => note.classList.contains("v4Undo-counting"))).toHaveLength(0);
    await advance(30_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("a sent dig names itself on the question check's screen ('About your dig on “…”:')", async () => {
    await mountMap();
    await openPath(PATHS.smr);
    const heading = panel().querySelector("h2")!.textContent!;
    await click(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    await advance(10_100);
    const about = harness.submit.mock.calls[0]![5];
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<>{about}</>);
    const place = host.querySelector("[data-ai-generated]")?.textContent ?? "";
    expect(shortened(place, heading)).toBe(true);
    expect(host.textContent).toBe(word("v4.dig.checkAbout", { path: place }));
  });
});

describe("dig-f14: Cancel on a wording puts the tick back as it was", () => {
  it("unticks a suggestion the edit ticked, and keeps one that was ticked before", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    expect(panelBoxes()[0]!.checked).toBe(false);
    await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[0]!);
    expect(panelBoxes()[0]!.checked).toBe(true);
    await click(buttonNamed(CATALOG["v4.suggest.cancel"]!, panel()));
    expect(panelBoxes()[0]!.checked).toBe(false);

    await click(panelBoxes()[1]!);
    await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[1]!);
    await click(buttonNamed(CATALOG["v4.suggest.cancel"]!, panel()));
    expect(panelBoxes()[1]!.checked).toBe(true);
  });

  it("still knows after the person looked at another question meanwhile (page memory only)", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[0]!);
    await openPath(PATHS.smr);
    await openPath(PATHS.renew);
    expect(panel().querySelector(".v4SugEditor textarea")).not.toBeNull();
    await click(buttonNamed(CATALOG["v4.suggest.cancel"]!, panel()));
    expect(panelBoxes()[0]!.checked).toBe(false);
  });
});

describe("the browser check (4 Nov): focus follows the wording and own-view boxes, never falling to the page", () => {
  it("moves into a box when it opens, back to its button when it closes, and after Remove to the next control", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[0]!);
    expect(document.activeElement).toBe(panel().querySelector(".v4SugEditor textarea"));
    await click(buttonNamed(CATALOG["v4.suggest.cancel"]!, panel()));
    expect(document.activeElement).toBe(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[0]);
    // Done on a wording: back to its button too.
    await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[1]!);
    await click(buttonNamed(CATALOG["v4.suggest.editDone"]!, panel()));
    expect(document.activeElement).toBe(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[1]);
    await click(panelBoxes()[1]!);

    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    const own = panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!;
    expect(document.activeElement).toBe(own);
    await typeInto(own, "Grid links between countries matter more than batteries.");
    await click(buttonNamed(CATALOG["v4.suggest.ownViewAdd"]!, panel()));
    expect(document.activeElement).toBe(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    // Remove takes its own row away: focus goes on to "Add your own view", never to the page.
    await click(buttonNamed(CATALOG["v4.suggest.remove"]!, panel()));
    expect(panel().querySelector(".v4SugRowPlain")).toBeNull();
    expect(document.activeElement).toBe(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    await click(buttonNamed(CATALOG["v4.suggest.cancel"]!, panel()));
    expect(document.activeElement).toBe(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
  });
});

describe("dig-f21: the person's words keep the direction they were typed in", () => {
  it("the wording and own-view boxes, the person's own words and the picks' chips follow what is typed", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[0]!);
    expect(panel().querySelector(".v4SugEditor textarea")!.getAttribute("dir")).toBe("auto");
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "هل تكفي البطاريات لأسبوع بلا رياح؟");
    await click(buttonNamed(CATALOG["v4.suggest.editDone"]!, panel()));
    const edited = [...panel().querySelectorAll<HTMLElement>(".v4SugRowText span")].find((span) => span.textContent?.startsWith("هل"));
    expect(edited?.getAttribute("dir")).toBe("auto");
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    expect(panel().querySelector(".v4SugEditor textarea")!.getAttribute("dir")).toBe("auto");
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "רוח ושמש יספיקו");
    await click(buttonNamed(CATALOG["v4.suggest.ownViewAdd"]!, panel()));
    const own = [...panel().querySelectorAll<HTMLElement>(".v4SugRowPlain .v4SugRowText span")].find((span) => span.textContent === "רוח ושמש יספיקו");
    expect(own?.getAttribute("dir")).toBe("auto");
    for (const chip of tray()!.querySelectorAll(".v4ChoiceChip")) expect(chip.getAttribute("dir")).toBe("auto");
  });

  it("lays the choosing part out by the start and end of the reading direction, never left and right", () => {
    const map = css("v4-map.css");
    const block = map.slice(map.indexOf("Perplexity plan W3-4"));
    expect(block).not.toMatch(/(?:^|[\s;{])(?:(?:margin|padding|border)-(?:left|right)\b|(?:left|right)\s*:|text-align:\s*(?:left|right))/mu);
    const debate = css("v4-debate.css");
    const dock = debate.slice(debate.indexOf("map-d4 A (3 Nov)"), debate.indexOf("/* ---------- the phone map sheet"));
    expect(dock).not.toMatch(/(?:margin|padding|border)-(?:left|right)\b|(?:^|[\s;{])(?:left|right)\s*:/mu);
  });
});

describe("dig-f22: a greyed pick box always has a reason the person can see", () => {
  it("on the map: one line above the first box greyed because the picks are on another path", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    await click(panelBoxes()[0]!);
    const map = page().querySelector<HTMLElement>(".v4Map")!;
    const lines = [...map.querySelectorAll<HTMLElement>(".v4PickReason")];
    expect(lines).toHaveLength(1);
    const heading = panel().querySelector("h2")!.textContent!;
    const label = lines[0]!.querySelector("[data-ai-generated]")?.textContent ?? "";
    expect(shortened(label, heading)).toBe(true);
    expect(lines[0]!.textContent).toBe(word("v4.suggest.picksOn", { path: label }));
    const greyed = [...map.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].filter((box) => box.disabled);
    expect(greyed.length).toBeGreaterThan(0);
    // Right above the first greyed box: nothing greyed comes before the line.
    expect(before(lines[0]!, greyed[0]!)).toBe(true);
    // Each box still says it to a screen reader as well.
    expect(greyed[0]!.closest("label")!.textContent).toContain(CATALOG["v4.suggest.otherPath"]);
  });

  it("on Free, past the cap, a second line names the cap above the first box it greys", async () => {
    harness.planTier = "free";
    await mountMap();
    await openPath(PATHS.renew);
    const boxes = panelBoxes();
    await click(boxes[0]!);
    await click(boxes[1]!);
    await click(boxes[2]!);
    const lines = [...page().querySelectorAll<HTMLElement>(".v4Map .v4PickReason")].map((line) => line.textContent);
    expect(lines).toContain(word("v4.suggest.freeCap", { count: 3 }));
    expect(lines.filter((line) => line === word("v4.suggest.freeCap", { count: 3 }))).toHaveLength(1);
  });

  it("in the phone outline, and in the panel right above the greyed rows of 'Where to dig from here'", async () => {
    await mountMap(375, crypto.randomUUID(), "n-renew");
    await click(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]")!);
    await click(buttonNamed(CATALOG["v4.panel.crumbRoot"]!, panel()));
    const row = panel().querySelector<HTMLElement>(".v4PanelReasonRow .v4PickReason");
    expect(row).not.toBeNull();
    const firstGreyed = [...panel().querySelectorAll<HTMLInputElement>(".v4PanelOpenRow input")].find((box) => box.disabled)!;
    expect(before(row!, firstGreyed)).toBe(true);
    await click(buttonNamed(CATALOG["v4.debate.mapButton"]!));
    const outlineLines = page().querySelectorAll(".v4DebSheet .v4Out .v4PickReason");
    expect(outlineLines).toHaveLength(1);
  });

  it("puts the paid plan's 'as many as one dig can combine' right above the boxes, not under them", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../apps/ui/components/v4/V4DigSuggest.tsx"), "utf8");
    const compose = source.slice(source.indexOf("export function V4DigCompose"));
    expect(compose.indexOf("\"v4.suggest.full\"")).toBeLessThan(compose.indexOf("suggestionsByKind(suggestions)"));
  });
});

describe("dig-f26 / dig-f34: the own view on Free, and what each picked item is", () => {
  // dig-f26 / journey-f20 (the wave-2 review, 4 Nov: lib/v4/publicNotes.ts): the line follows the DEBATE, never the person's
  // plan today. A debate that ran on Free, whose public state says no more than private (today's server), gets dig-f26's own
  // sentence, which says "may"; "This will be public." needs the debate's public state (tests/render/v4-public-mark.test.tsx).
  it("on a debate that ran on Free a line under the own-view box says the view may be shown, and the box points to it", async () => {
    harness.planTier = "free";
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId, {}, "FREE");
    await mountMap(1600, runId);
    await openPath(PATHS.renew);
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    const box = panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!;
    const line = panel().querySelector<HTMLElement>(".v4SugPublic")!;
    expect(line.textContent).toBe(CATALOG["v4.suggest.ownViewPublic"]);
    expect(line.textContent).toBe("Free debates are public, so your view may be shown on this public page.");
    expect(box.getAttribute("aria-describedby")).toBe(line.id);
    expect(before(box, line)).toBe(true);
  });

  it("says nothing of the kind on a paid debate, even when the person's plan is Free today", async () => {
    harness.planTier = "free";
    harness.freePublicNotice = true;
    await mountMap();
    await openPath(PATHS.renew);
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    expect(panel().querySelector(".v4SugPublic")).toBeNull();
    expect(panel().textContent).not.toContain(CATALOG["v4.publicMark.willBePublic"]);
    expect(panel().textContent).not.toContain(CATALOG["v4.suggest.ownViewPublic"]);
  });

  it("labels a picked open question 'Open question' and the person's text 'Your view'", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    await click(panel().querySelector<HTMLInputElement>(".v4PanelOpenRow input[type=checkbox]")!);
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "My view on storage.");
    await click(buttonNamed(CATALOG["v4.suggest.ownViewAdd"]!, panel()));
    const tags = [...panel().querySelectorAll(".v4SugRowPlain .v4SugTag")].map((tag) => tag.textContent);
    expect(tags).toEqual([CATALOG["v4.suggest.openTag"], CATALOG["v4.suggest.ownViewTag"]]);
  });
});
