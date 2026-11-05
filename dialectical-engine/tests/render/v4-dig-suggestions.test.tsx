// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIG_LEVEL_MAX } from "../../packages/contract/src/index.js";
import {
  advance, branch, buttonNamed, buttonsNamed, CATALOG, click, digPart, expandBranch, harness, mountMap, openPath, panel, PATHS, resetHarness,
  seededAnswer, text, tray, typeInto, unmountMap, page
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
 * Perplexity plan W3-4 and the dig model revision (30-31 Oct): choosing what to dig on the map. Each path shows its dig
 * suggestions by kind (desktop tree, phone outline, panel); the person picks and combines them, edits a suggestion's
 * wording or adds their own view; picks stay on one path (owner Q-D1) and the page says so; Free combines at most 3
 * (Q19); Undo sends nothing; "Dig here too" on what already has a dig and on every path of a dig's own map, none at
 * the deepest level. No search-words box anywhere (the owner's correction of 31 Oct).
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);

const treeBoxes = (index: number): HTMLInputElement[] =>
  [...branch(index).querySelectorAll<HTMLInputElement>(".v4MapLeafSuggestion input[type=checkbox]")];
const panelBoxes = (): HTMLInputElement[] => [...panel().querySelectorAll<HTMLInputElement>(".v4Sugs input[type=checkbox]")];
/** journey-f23 (owner's screen review, 3 Nov): the tray shows the picks as chips, never as "N picked". */
const trayChips = (): HTMLElement[] => [...(tray()?.querySelectorAll<HTMLElement>(".v4ChoiceChip") ?? [])];

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("a path's dig suggestions, by kind", () => {
  it("the tree shows each path's first suggestions with their kind and a pick box; the panel lists them all by kind", async () => {
    await mountMap();
    // map-f22: about 12 cards at once; a path's suggestions wait behind its "+N more" until it is opened or unfolded.
    expect(treeBoxes(PATHS.renew)).toHaveLength(0);
    expect(branch(PATHS.renew).querySelector(".v4MapMore[aria-expanded=\"false\"]")).not.toBeNull();
    await expandBranch(PATHS.mix);
    expect(treeBoxes(PATHS.mix)).toHaveLength(2);
    expect(branch(PATHS.mix).textContent).toContain(CATALOG["v4.suggest.kind.HELPS_MAIN_QUESTION.FOR"]);
    await openPath(PATHS.renew);
    // The opened path shows its own leaves in full.
    expect(treeBoxes(PATHS.renew)).toHaveLength(2);
    expect(branch(PATHS.renew).textContent).toContain(word("v4.suggest.more", { count: 1 }));
    expect(panel().textContent).toContain(CATALOG["v4.suggest.heading"]);
    expect(panel().textContent).toContain(CATALOG["v4.suggest.onePath"]);
    const heads = [...panel().querySelectorAll(".v4SugGroup .v4PanelSmallHead")].map((node) => node.textContent);
    expect(heads).toEqual([
      CATALOG["v4.suggest.kind.CONTRADICTING"],
      CATALOG["v4.suggest.kind.NEEDS_MORE_WEB"],
      CATALOG["v4.suggest.kind.HELPS_MAIN_QUESTION.AGAINST"]
    ]);
    expect(panelBoxes()).toHaveLength(3);
    // No search-words box, no "Suggest search words" button.
    expect(text()).not.toMatch(/search words/iu);
  });
});

describe("pick, combine, edit and add your own view", () => {
  it("picks two suggestions and an open question of one path; they are dug together", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    const [first, second] = panelBoxes();
    await click(first!);
    // dig-f4: one pick shows no tray; the panel's own button reads "Dig into this" (map-f14, question 1 B of 5 Nov).
    expect(tray()).toBeNull();
    expect(buttonsNamed(CATALOG["v4.dig.yourPicks.one"]!, panel())).toHaveLength(1);
    await click(second!);
    // The still-argued point under the same path is picked from the tree.
    const openBox = branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafOpen input[type=checkbox]")!;
    await click(openBox);
    expect(trayChips()).toHaveLength(3);
    expect(tray()!.querySelector(".v4ChoiceChips")!.getAttribute("aria-label")).toBe(CATALOG["v4.map.picked"]);
    expect(tray()!.textContent).not.toMatch(/\bpicked\b/iu);
    // The panel names no count either: the picks are marked where they are.
    expect(panel().textContent).not.toMatch(/\d+ picked/iu);
    // One dig button for the picks: the panel's pinned one on their own path ("Dig into your picks", dig-f5; no count);
    // the docked tray offers no second one ("Dig into these", journey-f13, only where the panel does not dig them).
    expect(buttonsNamed(CATALOG["v4.dig.yourPicks.other"]!, panel())).toHaveLength(1);
    expect(buttonsNamed(CATALOG["v4.dig.trayDigThese"]!, tray()!)).toHaveLength(0);
    // Picks shown on the tree too.
    expect(treeBoxes(PATHS.renew).filter((box) => box.checked)).toHaveLength(2);
  });

  it("edits a suggestion's wording (which picks it) and adds the person's own view", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[0]!);
    const area = panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!;
    expect(area.value).toContain("windless days");
    await typeInto(area, "Can batteries cover a windless week in a small northern country like mine?");
    await click(buttonNamed(CATALOG["v4.suggest.editDone"]!, panel()));
    expect(panel().textContent).toContain("Can batteries cover a windless week in a small northern country like mine?");
    expect(panel().textContent).toContain(CATALOG["v4.suggest.edited"]);
    expect(panelBoxes()[0]!.checked).toBe(true);
    // An emptied wording is refused, and the one before is kept.
    await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[0]!);
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "   ");
    await click(buttonNamed(CATALOG["v4.suggest.editDone"]!, panel()));
    expect(panel().textContent).toContain(CATALOG["v4.suggest.empty"]);
    await click(buttonNamed(CATALOG["v4.suggest.cancel"]!, panel()));

    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "Pumped hydro in the mountains could carry a windless week.");
    await click(buttonNamed(CATALOG["v4.suggest.ownViewAdd"]!, panel()));
    expect(panel().textContent).toContain(CATALOG["v4.suggest.ownViewTag"]);
    expect(panel().textContent).toContain("Pumped hydro in the mountains could carry a windless week.");
    expect(trayChips()).toHaveLength(2);
    // Remove takes the own view out again; one pick left, so the tray goes (dig-f4).
    await click(buttonNamed(CATALOG["v4.suggest.remove"]!, panel()));
    expect(tray()).toBeNull();
    expect(buttonsNamed(CATALOG["v4.dig.yourPicks.one"]!, panel())).toHaveLength(1);
  });

  it("the second browser check (RC-3, the checks of the last fixes): a box that opens is brought into view whole, its buttons too", async () => {
    // jsdom draws nothing, so it has no scrollIntoView of its own: the page's call is recorded on the element it scrolls.
    const scrolled: Array<Readonly<{ element: Element; options: unknown }>> = [];
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true, value(this: HTMLElement, options: unknown) { scrolled.push({ element: this, options }); }
    });
    try {
      await mountMap();
      await openPath(PATHS.renew);
      await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
      const editor = panel().querySelector<HTMLElement>(".v4SugEditor")!;
      expect(document.activeElement).toBe(editor.querySelector("textarea"));
      expect(scrolled).toContainEqual({ element: editor, options: { block: "nearest" } });
      // The same for a suggestion's own wording.
      await click(buttonNamed(CATALOG["v4.suggest.cancel"]!, panel()));
      scrolled.length = 0;
      await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[0]!);
      expect(scrolled).toContainEqual({ element: panel().querySelector(".v4SugEditor"), options: { block: "nearest" } });
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("dig-f20: the tray's chips mark only the AIs' words as AI text, never the person's own view or their own wording", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    // An unedited suggestion, then the first one in the person's own wording, then their own view.
    await click(panelBoxes()[1]!);
    await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[0]!);
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "My own wording of the battery point.");
    await click(buttonNamed(CATALOG["v4.suggest.editDone"]!, panel()));
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "Pumped hydro could carry a windless week.");
    await click(buttonNamed(CATALOG["v4.suggest.ownViewAdd"]!, panel()));
    const chips = trayChips();
    expect(chips).toHaveLength(3);
    const marked = (words: string): string | null => chips.find((chip) => chip.textContent?.includes(words))!.getAttribute("data-ai-generated");
    expect(marked("My own wording")).toBeNull();
    expect(marked("Pumped hydro")).toBeNull();
    expect(chips.filter((chip) => chip.getAttribute("data-ai-generated") === "true")).toHaveLength(1);
    expect(chips.every((chip) => chip.getAttribute("dir") === "auto")).toBe(true);
    // journey-f13 / journey-f23: the dig button counts nothing. On the picks' own path it is the panel's pinned one
    // ("Dig into your picks", dig-f5), and the docked tray offers no second (dig-f4).
    expect(buttonsNamed(CATALOG["v4.dig.yourPicks.other"]!, panel())).toHaveLength(1);
    expect(tray()!.textContent).not.toMatch(/\b3\b/u);
  });
});

describe("picks stay on one path (owner Q-D1)", () => {
  it("refuses a pick from a second path, says so plainly, and lets the person clear and start again", async () => {
    await mountMap();
    await expandBranch(PATHS.renew);
    await click(treeBoxes(PATHS.renew)[0]!);
    await expandBranch(PATHS.mix);
    await expandBranch(PATHS.smr);
    // Every pick box of another path is closed (suggestions and open questions alike), and says why to a screen reader.
    for (const box of treeBoxes(PATHS.mix)) expect(box.disabled).toBe(true);
    const smrOpen = branch(PATHS.smr).querySelector<HTMLInputElement>(".v4MapLeafOpen input[type=checkbox]")!;
    expect(smrOpen.disabled).toBe(true);
    expect(branch(PATHS.mix).textContent).toContain(CATALOG["v4.suggest.otherPath"]);
    await click(treeBoxes(PATHS.mix)[0]!);
    await click(smrOpen);
    expect(treeBoxes(PATHS.renew).filter((box) => box.checked)).toHaveLength(1);
    expect(treeBoxes(PATHS.mix).some((box) => box.checked)).toBe(false);
    // The other path's panel says it in words (dig-f5: where the picks wait, with [Go to them] [Clear them]), and no own
    // view or edit there.
    await openPath(PATHS.mix);
    expect(panel().textContent).toContain(CATALOG["v4.suggest.waitingOn"]!.split("“")[0]!);
    expect(buttonsNamed(CATALOG["v4.suggest.goToPicks"]!, panel())).toHaveLength(1);
    expect(buttonsNamed(CATALOG["v4.suggest.ownView"]!, panel())).toHaveLength(0);
    expect(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())).toHaveLength(0);
    await click(buttonNamed(CATALOG["v4.suggest.clearPicks"]!, panel()));
    expect(tray()).toBeNull();
    expect(treeBoxes(PATHS.renew).some((box) => box.checked)).toBe(false);
    for (const box of treeBoxes(PATHS.mix)) expect(box.disabled).toBe(false);
    await click(treeBoxes(PATHS.mix)[0]!);
    expect(treeBoxes(PATHS.mix).filter((box) => box.checked)).toHaveLength(1);
  });
});

describe("Undo sends nothing", () => {
  it("a dig undone within 10 seconds is never sent, and the picks wait in the tray", async () => {
    await mountMap();
    await expandBranch(PATHS.renew);
    await click(treeBoxes(PATHS.renew)[0]!);
    await click(treeBoxes(PATHS.renew)[1]!);
    await click(buttonNamed(CATALOG["v4.dig.trayDigThese"]!, tray()!));
    expect(text()).toContain(CATALOG["v4.dig.undo"]);
    await advance(4_000);
    await click(page().querySelector<HTMLButtonElement>(`button[aria-label="${CATALOG["v4.dig.undoLabel"]}"]`)!);
    await advance(20_000);
    expect(harness.submit).not.toHaveBeenCalled();
    expect(trayChips()).toHaveLength(2);
  });
});

describe("Free combines at most 3 picks (owner Q19)", () => {
  it("says the cap, and closes every other box once three are picked", async () => {
    harness.planTier = "free";
    await mountMap();
    await openPath(PATHS.renew);
    expect(panel().textContent).toContain(word("v4.suggest.freeCap", { count: 3 }));
    // Free has no Quick look / Thorough choice.
    expect(buttonsNamed(CATALOG["v4.digMode.thorough"]!, panel())).toHaveLength(0);
    const boxes = panelBoxes();
    await click(boxes[0]!);
    await click(boxes[1]!);
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "My own view.");
    await click(buttonNamed(CATALOG["v4.suggest.ownViewAdd"]!, panel()));
    expect(trayChips()).toHaveLength(3);
    expect(panelBoxes()[2]!.disabled).toBe(true);
    expect(buttonsNamed(CATALOG["v4.suggest.ownView"]!, panel())).toHaveLength(0);
    const openBox = branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafOpen input[type=checkbox]")!;
    expect(openBox.disabled).toBe(true);
    await click(panelBoxes()[2]!);
    expect(trayChips()).toHaveLength(3);
    expect(tray()?.textContent).toContain(word("v4.suggest.freeCap", { count: 3 }));
  });
});

describe("digging again where a dig is (nesting) and the deepest level", () => {
  it("is offered on a path that already has a dig, and only there on a first debate", async () => {
    const runId = crypto.randomUUID();
    harness.records = {
      parent: null,
      children: [{ parent_run_id: runId, child_run_id: crypto.randomUUID(), places: ["path:n-mix"], mode: "quick", created_at: "2026-10-30T10:00:00.000Z" }]
    };
    await mountMap(1600, runId);
    await expandBranch(PATHS.mix);
    await expandBranch(PATHS.renew);
    // journey-f13 (owner's screen review): the tree's way in says where it goes, never "Dig here too".
    expect(buttonsNamed(CATALOG["v4.dig.chooseWhat"]!, branch(PATHS.mix))).toHaveLength(1);
    expect(buttonsNamed(CATALOG["v4.dig.chooseWhat"]!, branch(PATHS.renew))).toHaveLength(0);
    await click(buttonNamed(CATALOG["v4.dig.chooseWhat"]!, branch(PATHS.mix)));
    expect(panel().textContent).toContain(CATALOG["v4.suggest.heading"]);
    expect(buttonsNamed(CATALOG["v4.panel.dig"]!, panel()).length).toBeGreaterThan(0);
    expect(text()).not.toContain("Dig here too");
    await openPath(PATHS.renew);
    expect(buttonsNamed(CATALOG["v4.panel.dig"]!, panel())).toHaveLength(1);
  });

  it("is offered on every path of a dig's own map", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId, { dig: digPart(crypto.randomUUID(), 3) });
    await mountMap(1600, runId);
    for (const index of Object.values(PATHS)) {
      await expandBranch(index);
      expect(buttonsNamed(CATALOG["v4.dig.chooseWhat"]!, branch(index)), `path ${index}`).toHaveLength(1);
    }
  });

  it("at level 10 it is replaced by the deepest-level line: nothing can be picked or dug", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId, { dig: digPart(crypto.randomUUID(), DIG_LEVEL_MAX) });
    await mountMap(1600, runId);
    expect(text()).toContain(CATALOG["v4.nest.deepest"]);
    expect(buttonsNamed(CATALOG["v4.dig.chooseWhat"]!)).toHaveLength(0);
    expect(page().querySelectorAll(".v4MapLeafSuggestion")).toHaveLength(0);
    for (const box of page().querySelectorAll<HTMLInputElement>(".v4MapLeafOpen input[type=checkbox]")) expect(box.disabled).toBe(true);
    await openPath(PATHS.renew);
    expect(panel().textContent).toContain(CATALOG["v4.nest.deepest"]);
    expect(buttonsNamed(CATALOG["v4.panel.dig"]!)).toHaveLength(0);
    expect(panel().textContent).not.toContain(CATALOG["v4.suggest.heading"]);
  });
});

describe("phone width (375px)", () => {
  it("the phone map lists each path's suggestions with pick boxes, and the panel chooses what to dig", async () => {
    await mountMap(375);
    expect(page().querySelector(".v4DebLayout-phone")).not.toBeNull();
    await click(buttonNamed(CATALOG["v4.debate.mapButton"]!));
    const rows = page().querySelectorAll<HTMLElement>(".v4OutSuggestion");
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const box = page().querySelector<HTMLInputElement>(".v4OutSuggestion input[type=checkbox]")!;
    await click(box);
    // The tray sits in the sheet's footer while the map is open.
    expect(page().querySelectorAll(".v4DebSheetFoot .v4DebTray .v4ChoiceChip")).toHaveLength(1);
    // Tapping a suggestion opens its path in the panel (the sheet closes), where it can be edited.
    await click(page().querySelector<HTMLButtonElement>(".v4OutSuggestion .v4SugMain")!);
    expect(page().querySelector(".v4DebSheet")).toBeNull();
    expect(panel().textContent).toContain(CATALOG["v4.suggest.heading"]);
    expect(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel()).length).toBeGreaterThan(0);
  });

  it("lets every new piece wrap at 375px, with no fixed width, and keeps 44px touch targets", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-map.css"), "utf8");
    const block = css.slice(css.indexOf("Perplexity plan W3-4"));
    const rule = (selector: string): string => {
      const at = block.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThanOrEqual(0);
      return block.slice(at, block.indexOf("}", at));
    };
    for (const selector of [".v4Sug", ".v4SugMain", ".v4SugRow", ".v4Sugs", ".v4SugList"]) expect(rule(selector)).toMatch(/min-width: 0/u);
    expect(rule(".v4SugMain")).toMatch(/overflow-wrap: anywhere/u);
    expect(rule(".v4SugRow")).toMatch(/overflow-wrap: anywhere/u);
    expect(rule(".v4SugMain")).toMatch(/min-height: 44px/u);
    expect(rule(".v4SugEdit")).toMatch(/min-height: 44px/u);
    expect(block).not.toMatch(/(?:^|[\s;{])(?:min-)?width:\s*[0-9]{3,}px/mu);
    for (const match of block.matchAll(/([0-9.]+)px/gu)) expect(Number(match[1]), match[0]).toBeLessThanOrEqual(44);
  });
});
