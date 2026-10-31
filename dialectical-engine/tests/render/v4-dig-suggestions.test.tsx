// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIG_LEVEL_MAX } from "../../packages/contract/src/index.js";
import {
  advance, branch, buttonNamed, buttonsNamed, CATALOG, click, digPart, harness, mountMap, openPath, panel, PATHS, resetHarness,
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
    expect(treeBoxes(PATHS.mix)).toHaveLength(2);
    expect(treeBoxes(PATHS.renew)).toHaveLength(2);
    expect(branch(PATHS.renew).textContent).toContain(word("v4.suggest.more", { count: 1 }));
    expect(branch(PATHS.mix).textContent).toContain(CATALOG["v4.suggest.kind.HELPS_MAIN_QUESTION.FOR"]);
    await openPath(PATHS.renew);
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
  it("picks two suggestions and an open question of one path; the tray digs them together", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    const [first, second] = panelBoxes();
    await click(first!);
    expect(tray()?.textContent).toContain(word("v4.dig.trayPicked.one", { count: 1 }));
    await click(second!);
    // The still-argued point under the same path is picked from the tree.
    const openBox = branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafOpen input[type=checkbox]")!;
    await click(openBox);
    expect(tray()?.textContent).toContain(word("v4.dig.trayPicked.other", { count: 3 }));
    expect(buttonsNamed(word("v4.dig.trayDig.other", { count: 3 }), tray()!)).toHaveLength(1);
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
    expect(tray()?.textContent).toContain(word("v4.dig.trayPicked.other", { count: 2 }));
    // Remove takes the own view out again.
    await click(buttonNamed(CATALOG["v4.suggest.remove"]!, panel()));
    expect(tray()?.textContent).toContain(word("v4.dig.trayPicked.one", { count: 1 }));
  });
});

describe("picks stay on one path (owner Q-D1)", () => {
  it("refuses a pick from a second path, says so plainly, and lets the person clear and start again", async () => {
    await mountMap();
    await click(treeBoxes(PATHS.renew)[0]!);
    // Every pick box of another path is closed (suggestions and open questions alike), and says why to a screen reader.
    for (const box of treeBoxes(PATHS.mix)) expect(box.disabled).toBe(true);
    const smrOpen = branch(PATHS.smr).querySelector<HTMLInputElement>(".v4MapLeafOpen input[type=checkbox]")!;
    expect(smrOpen.disabled).toBe(true);
    expect(branch(PATHS.mix).textContent).toContain(CATALOG["v4.suggest.otherPath"]);
    await click(treeBoxes(PATHS.mix)[0]!);
    await click(smrOpen);
    expect(tray()?.textContent).toContain(word("v4.dig.trayPicked.one", { count: 1 }));
    expect(treeBoxes(PATHS.mix).some((box) => box.checked)).toBe(false);
    // The other path's panel says it in words and offers Clear, and no own view or edit there.
    await openPath(PATHS.mix);
    expect(panel().textContent).toContain(CATALOG["v4.suggest.otherPath"]);
    expect(buttonsNamed(CATALOG["v4.suggest.ownView"]!, panel())).toHaveLength(0);
    expect(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())).toHaveLength(0);
    await click(buttonNamed(CATALOG["v4.dig.trayClear"]!, panel()));
    expect(tray()).toBeNull();
    for (const box of treeBoxes(PATHS.mix)) expect(box.disabled).toBe(false);
    await click(treeBoxes(PATHS.mix)[0]!);
    expect(tray()?.textContent).toContain(word("v4.dig.trayPicked.one", { count: 1 }));
  });
});

describe("Undo sends nothing", () => {
  it("a dig undone within 10 seconds is never sent, and the picks wait in the tray", async () => {
    await mountMap();
    await click(treeBoxes(PATHS.renew)[0]!);
    await click(treeBoxes(PATHS.renew)[1]!);
    await click(buttonNamed(word("v4.dig.trayDig.other", { count: 2 }), tray()!));
    expect(text()).toContain(CATALOG["v4.dig.undo"]);
    await advance(4_000);
    await click(page().querySelector<HTMLButtonElement>(`button[aria-label="${CATALOG["v4.dig.undoLabel"]}"]`)!);
    await advance(20_000);
    expect(harness.submit).not.toHaveBeenCalled();
    expect(tray()?.textContent).toContain(word("v4.dig.trayPicked.other", { count: 2 }));
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
    expect(tray()?.textContent).toContain(word("v4.dig.trayPicked.other", { count: 3 }));
    expect(panelBoxes()[2]!.disabled).toBe(true);
    expect(buttonsNamed(CATALOG["v4.suggest.ownView"]!, panel())).toHaveLength(0);
    const openBox = branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafOpen input[type=checkbox]")!;
    expect(openBox.disabled).toBe(true);
    await click(panelBoxes()[2]!);
    expect(tray()?.textContent).toContain(word("v4.dig.trayPicked.other", { count: 3 }));
    expect(tray()?.textContent).toContain(word("v4.suggest.freeCap", { count: 3 }));
  });
});

describe("\"Dig here too\" (nesting) and the deepest level", () => {
  it("is offered on a path that already has a dig, and only there on a first debate", async () => {
    const runId = crypto.randomUUID();
    harness.records = {
      parent: null,
      children: [{ parent_run_id: runId, child_run_id: crypto.randomUUID(), places: ["path:n-mix"], mode: "quick", created_at: "2026-10-30T10:00:00.000Z" }]
    };
    await mountMap(1280, runId);
    expect(buttonsNamed(CATALOG["v4.nest.digHereToo"]!, branch(PATHS.mix))).toHaveLength(1);
    expect(buttonsNamed(CATALOG["v4.nest.digHereToo"]!, branch(PATHS.renew))).toHaveLength(0);
    await click(buttonNamed(CATALOG["v4.nest.digHereToo"]!, branch(PATHS.mix)));
    expect(panel().textContent).toContain(CATALOG["v4.suggest.heading"]);
    expect(buttonsNamed(CATALOG["v4.nest.digHereToo"]!, panel()).length).toBeGreaterThan(0);
    await openPath(PATHS.renew);
    expect(buttonsNamed(CATALOG["v4.panel.dig"]!, panel())).toHaveLength(1);
  });

  it("is offered on every path of a dig's own map", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId, { dig: digPart(crypto.randomUUID(), 3) });
    await mountMap(1280, runId);
    for (const index of Object.values(PATHS)) {
      expect(buttonsNamed(CATALOG["v4.nest.digHereToo"]!, branch(index)), `path ${index}`).toHaveLength(1);
    }
  });

  it("at level 10 it is replaced by the deepest-level line: nothing can be picked or dug", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId, { dig: digPart(crypto.randomUUID(), DIG_LEVEL_MAX) });
    await mountMap(1280, runId);
    expect(text()).toContain(CATALOG["v4.nest.deepest"]);
    expect(buttonsNamed(CATALOG["v4.nest.digHereToo"]!)).toHaveLength(0);
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
    expect(page().querySelector(".v4DebSheetFoot .v4DebTray")?.textContent).toContain(word("v4.dig.trayPicked.one", { count: 1 }));
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
