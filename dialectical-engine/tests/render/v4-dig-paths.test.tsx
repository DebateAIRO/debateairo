// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V4DigPaths } from "../../apps/ui/components/v4/V4DigPaths.js";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import { digPathPlanOf } from "../../apps/ui/lib/v4/digPathPlan.js";
import { SHARE_DELTA_SHOW_MS } from "../../apps/ui/lib/v4/money.js";
import { suggestionPick } from "../../apps/ui/lib/v4/suggestions.js";
import {
  AnswerSchema, type Answer, type AnswerBranch, type DigSuggestion, type PathOutcome, type StartCombineRequest, type StartCombineResponse
} from "../../packages/contract/src/index.js";
import {
  advance, branch, buttonsNamed, CATALOG, click, expandBranch, harness, mountMap, openPath, page, panel, PATHS, resetHarness, seededAnswer, settle,
  tray, typeInto, unmountMap
} from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));
// Task 79: the start step's combine call stands in (the contract client is the real one for everything else).
const standIn = vi.hoisted(() => ({ combine: null as null | ((input: unknown, signal?: AbortSignal) => Promise<unknown>) }));
vi.mock("@/lib/api", async (original) => {
  const real = await original<Record<string, unknown>>();
  const client = real.contractClient as object;
  return {
    ...real,
    contractClient: new Proxy(client, {
      get: (target, key) => (key === "startPathCombine" && standIn.combine !== null ? standIn.combine : Reflect.get(target, key))
    })
  };
});

/*
 * Dig picks on a path debate's map (spec 2026-11-03 §4.4; item dig-f35).
 * V4 start step, Task 79b (owner answer Q19 of 4 Nov, A: "the dig's share follows a combine"; journey-f8): the tray's share is
 * the room read's own share for the number of paths the dig will look into (`dig_share_by_paths`, entry i - 1 for i paths), so a
 * change of that number moves the share at once, without another read; the change shows in grey ("−1%"), never in red, for
 * SHARE_DELTA_SHOW_MS, and no line says what would be left (r2-2). Before any combine (Task 79's rows, below), a dig of picks looks
 * into one path per pick (the server's own rule for a dig that sends no paths). An R22 debate's dig keeps today's single share.
 * Only the reads and the ask are stand-ins (v4-debate-harness.tsx); every share is made up.
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const trayButton = (percent: number): string => `${CATALOG["v4.dig.trayDigThese"]} · ${word("v4.undo.barShare", { percent })}`;
const ROOTS = ["n-mix", "n-renew", "n-nuclear", "n-smr"] as const;
/** Every button's words under `within`, as buttonsNamed reads them (so a failure names what the page says instead). */
const buttonsOf = (within: ParentNode): string[] =>
  [...within.querySelectorAll("button")].map((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim());

function room(extra: Partial<AskRoom> & Readonly<Record<string, unknown>> = {}): AskRoom {
  return { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", ...extra } as AskRoom;
}

const ready = (line: string): PathOutcome => ({
  state: "READY", text: { line, summary: `Summary of ${line}`, fate: "HELD_UP" }, what_changed: [], view: null, trust: "SURE", rests_on: []
} as PathOutcome);

/**
 * The seeded answer with one more made-up dig suggestion under the renewables path, so three can be picked there (the tray shows
 * from the second pick, and a dig's picks are of one path).
 */
function withThirdPick(answer: Answer): Answer {
  const web = answer.web;
  if (web === undefined || web === null) throw new Error("the seeded answer has a web part");
  return {
    ...answer,
    web: {
      ...web,
      paths: web.paths.map((path) => (path.position_ref !== "n-renew" ? path : {
        ...path,
        suggestions: [...path.suggestions, { suggestion_id: "renew-extra-for", kind: "HELPS_MAIN_QUESTION" as const, side: "FOR" as const,
          text: "How often does a cold, windless week come in a northern winter?", places: ["path:n-renew"] }]
      }))
    }
  };
}

/**
 * The served answer of a path debate whose four chosen paths are the seeded answer's four positions (b1..b4 rooted at them); the
 * web part's paths and the places of their suggestions follow, as a v2 run serves them (`path:b<n>`).
 */
function v2Answer(runId: string): Answer {
  const seeded = withThirdPick(seededAnswer(runId));
  const pathOf = (ref: string): string => {
    const at = ROOTS.indexOf(ref as (typeof ROOTS)[number]);
    return at < 0 ? ref : `b${at + 1}`;
  };
  const web = seeded.web === undefined || seeded.web === null ? seeded.web : {
    ...seeded.web,
    paths: seeded.web.paths.map((path) => ({
      ...path,
      position_ref: pathOf(path.position_ref),
      suggestions: path.suggestions.map((suggestion) => ({
        ...suggestion, places: suggestion.places.map((place) => (place.startsWith("path:") ? `path:${pathOf(place.slice(5))}` : place))
      }))
    }))
  };
  return AnswerSchema.parse({
    ...seeded,
    web,
    branches: {
      source: "MENU", width: 5,
      paths: ROOTS.map((root, index): AnswerBranch => ({
        path_id: `b${index + 1}`, order: index + 1, title: `Path ${index + 1}`, question: `What about path ${index + 1}?`, author: "AI_SUGGESTION",
        viewpoints: [{ title: `Path ${index + 1}`, question: `What about path ${index + 1}?`, own: false }],
        state: "ARGUED", root_node_id: root, outcome: ready(`Line of path ${index + 1}.`)
      })),
      more: [], also_raised: [], main_trust: "SURE", carry_on_to_report: false
    }
  });
}

/** Opens a path in the panel: a path debate's by its path card, an R22 debate's by its tree card. */
async function openOn(paths: boolean, index: number): Promise<void> {
  if (!paths) return openPath(index);
  await click(page().querySelector<HTMLButtonElement>(`[data-path-card="b${String(index + 1)}"] .v4PathCardMain`)!);
}

/**
 * Picks three dig suggestions of the renewables path in its panel (the tree shows only its first ones), as the person would, then
 * opens another path, so the tray (not the panel's pinned button) digs them. Returns the tree's three ticked boxes.
 */
async function pickRenewables(paths: boolean): Promise<HTMLInputElement[]> {
  await openOn(paths, PATHS.renew);
  for (let count = 0; count < 3; count += 1) {
    const box = panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]:not(:checked)");
    if (box === null) break;
    await click(box);
  }
  await openOn(paths, PATHS.smr);
  await expandBranch(PATHS.renew);
  return [...branch(PATHS.renew).querySelectorAll<HTMLInputElement>(".v4MapLeafSuggestion input[type=checkbox]:checked")];
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("Task 79b: the tray's share follows the number of paths the dig looks into (answer Q19)", () => {
  it("three picks read 'up to 6%'; one fewer path reads 'up to 5%' with a grey '−1%' for SHARE_DELTA_SHOW_MS, never red, no 'left'", async () => {
    expect(SHARE_DELTA_SHOW_MS).toBe(2_000);
    const runId = crypto.randomUUID();
    harness.answer = v2Answer(runId);
    // The room read is for the three picks: today's single share (10) and the share for each number of paths (made up).
    harness.room = room({ dig_share_percent: 10, dig_share_by_paths: [3, 5, 6] });
    await mountMap(1600, runId);
    const boxes = await pickRenewables(true);
    expect(boxes).toHaveLength(3);
    expect(buttonsNamed(trayButton(6), tray()!)).toHaveLength(1);
    expect(tray()!.querySelector(".v4ShareChange")).toBeNull();
    // One path less: the share moves at once, from the same read (the stand-in room never changes here). The click alone, so the
    // fake clock stands where the change happened.
    await act(async () => boxes[2]!.click());
    expect(buttonsNamed(trayButton(5), tray()!)).toHaveLength(1);
    const mark = tray()!.querySelector<HTMLElement>(".v4ShareChange")!;
    expect(mark.textContent).toBe("−1%");
    // Grey, never red: the one grey mark's classes, and nothing that reads as a warning.
    expect(mark.className).not.toMatch(/red|danger|error|warn/iu);
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    // r2-2: no line says what would be left.
    expect(tray()!.textContent ?? "").not.toMatch(/\bleft\b/iu);
    await advance(1_999);
    expect(tray()!.querySelector(".v4ShareChange")?.textContent).toBe("−1%");
    await advance(1);
    expect(tray()!.querySelector(".v4ShareChange")).toBeNull();
    expect(buttonsNamed(trayButton(5), tray()!)).toHaveLength(1);
  });

  // Coordinator ruling (7 Nov, the wave-16 review of Task 79): where the start step runs, the server argues EVERY dig of picks as paths,
  // an R22 debate's too (index.ts digRuns; its room read names a share per path count), so the page follows the server.
  it("an R22 debate's dig where the start step runs (the read names a share per path count) reads the share of its paths", async () => {
    const runId = crypto.randomUUID();
    harness.answer = withThirdPick(seededAnswer(runId));
    harness.room = room({ dig_share_percent: 10, dig_share_by_paths: [3, 5, 6] });
    await mountMap(1600, runId);
    const boxes = await pickRenewables(false);
    expect(boxes).toHaveLength(3);
    expect(buttonsNamed(trayButton(6), tray()!)).toHaveLength(1);
    await act(async () => boxes[2]!.click());
    expect(buttonsNamed(trayButton(5), tray()!)).toHaveLength(1);
  });

  it("an R22 debate's dig where the start step is off (no share per path count) keeps today's single share", async () => {
    const runId = crypto.randomUUID();
    harness.answer = withThirdPick(seededAnswer(runId));
    harness.room = room({ dig_share_percent: 10 });
    await mountMap(1600, runId);
    const boxes = await pickRenewables(false);
    expect(boxes).toHaveLength(3);
    expect(buttonsNamed(trayButton(10), tray()!)).toHaveLength(1);
    await click(boxes[2]!);
    expect(buttonsNamed(trayButton(10), tray()!)).toHaveLength(1);
    expect(tray()!.querySelector(".v4ShareChange")).toBeNull();
  });

  it("a path debate's dig whose read names no share per path count keeps today's single share", async () => {
    const runId = crypto.randomUUID();
    harness.answer = v2Answer(runId);
    harness.room = room({ dig_share_percent: 10 });
    await mountMap(1600, runId);
    const boxes = await pickRenewables(true);
    expect(boxes).toHaveLength(3);
    expect(buttonsNamed(trayButton(10), tray()!)).toHaveLength(1);
    await click(boxes[2]!);
    expect(buttonsNamed(trayButton(10), tray()!)).toHaveLength(1);
  });

  // Independent review (Task 79b): an open question the person picks stays a place in the dig's question, never a path (spec
  // 2026-11-03 §4.4; the page sends it in `places`, never in `picks`, so the server makes no path of it). So it never counts.
  it("an open question picked beside two suggestions is a place, not a path: the share of two paths", async () => {
    const runId = crypto.randomUUID();
    harness.answer = v2Answer(runId);
    harness.room = room({ dig_share_percent: 10, dig_share_by_paths: [3, 5, 6] });
    await mountMap(1600, runId);
    await openOn(true, PATHS.renew);
    for (let count = 0; count < 2; count += 1) await click(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]:not(:checked)")!);
    await openOn(true, PATHS.smr);
    await expandBranch(PATHS.renew);
    const open = branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafOpen input[type=checkbox]");
    expect(open).not.toBeNull();
    await click(open!);
    expect(buttonsOf(tray()!), JSON.stringify(buttonsOf(tray()!))).toContain(trayButton(5));
    expect(buttonsOf(page())).not.toContain(trayButton(6));
  });

  it("an open question alone makes no path: today's single share, never the share of one path", async () => {
    const runId = crypto.randomUUID();
    harness.answer = v2Answer(runId);
    harness.room = room({ dig_share_percent: 10, dig_share_by_paths: [3, 5, 6] });
    await mountMap(1600, runId);
    await openOn(true, PATHS.renew);
    const open = branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafOpen input[type=checkbox]");
    expect(open).not.toBeNull();
    await click(open!);
    const picksButton = (percent: number): string => `${CATALOG["v4.dig.yourPicks.one"]} · ${word("v4.undo.barShare", { percent })}`;
    expect(buttonsOf(page()), JSON.stringify(buttonsOf(page()).filter((name) => name.includes("%")))).toContain(picksButton(10));
    expect(buttonsOf(page())).not.toContain(picksButton(3));
  });
});

/*
 * V4 start step, Task 79 (spec 2026-11-03 §4.4; dig-f35 "Do not build it twice", r2-1, r2-22, choose-d3; owner answers Q18 A and
 * Q19 A): on a path debate a dig's picks become paths on the very rows of the choosing step (V4StartRow), combined, split and
 * rewritten before the dig, each change undoable (Undo, Ctrl/Cmd+Z) until it is sent; then the shared 10-second Undo note,
 * unchanged, and the dig goes with its paths (DIG_PICKS). Two picks resting on one point of the map get one suggestion, "Combine ·
 * Keep apart" (code, no AI call). The combine call is the start step's own, for this dig (`{kind: "DIG", parent_run_id}`), and its
 * words are kept by the members, so the same pair combined again asks nothing. Only the reads, the ask and the combine call are
 * stand-ins; every text and share is made up.
 */

const B2 = "b2";
const sug = (id: string, text: string, points?: readonly string[]): DigSuggestion => ({
  suggestion_id: id, kind: "UNDOCUMENTED", side: null, text, places: [`path:${B2}`], ...(points === undefined ? {} : { points: [...points] })
});
const LULLS = sug("s-lulls", "Seasonal lulls?", ["n-renew-winter"]);
const GAP = sug("s-gap", "2030s gap?", ["n-renew-winter", "n-renew-cost"]);
const COST = sug("s-cost", "What does storage cost?", ["n-renew-cost"]);
const LAND = sug("s-land", "How much land is needed?");
const PLAIN = [sug("s-one", "First question?"), sug("s-two", "Second question?"), sug("s-three", "Third question?")];
const AI_WORDS: StartCombineResponse = { source: "AI", title: "T", question: "Q?", combine_ref: "r.s" };
/** What the dig of the combined pair sends as its paths. */
const COMBINED_PATHS = {
  source: "DIG_PICKS", width: 1, chosen_by: "PERSON",
  paths: [{ title: "T", question: "Q?", members: [{ pick_no: 1 }, { pick_no: 2 }], combine_ref: "r.s" }]
};

/** The path debate's answer with these dig suggestions under its second path (b2, the renewables path), in this order. */
function v2AnswerWith(runId: string, suggestions: readonly DigSuggestion[]): Answer {
  const answer = v2Answer(runId);
  const web = answer.web!;
  return AnswerSchema.parse({
    ...answer, web: { ...web, paths: web.paths.map((path) => (path.position_ref !== B2 ? path : { ...path, suggestions: [...suggestions] })) }
  });
}

/** The combine calls the page made, newest last; each waits until the test answers it. */
let combines: { input: StartCombineRequest; answer(response: StartCombineResponse): void }[] = [];
function spyCombine(): void {
  combines = [];
  standIn.combine = (input: unknown) =>
    new Promise<StartCombineResponse>((resolve) => { combines.push({ input: input as StartCombineRequest, answer: resolve }); });
}
async function answerCombine(at: number, response: StartCombineResponse = AI_WORDS): Promise<void> {
  await act(async () => combines[at]!.answer(response));
  await settle();
}

const digRows = (): HTMLElement[] => [...page().querySelectorAll<HTMLElement>(".v4DigPaths .v4StartRow")];
const rowTitles = (): string[] => digRows().map((row) => row.querySelector(".v4StartRowTitle")?.textContent ?? "");
const overlapLines = (): string[] => [...page().querySelectorAll(".v4DigOverlap .v4StartSuggestionLine")].map((line) => line.textContent ?? "");

/** Ticks the next `count` unticked suggestion boxes in the open panel, in their order. */
async function pickInPanel(count: number): Promise<void> {
  for (let n = 0; n < count; n += 1) await click(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]:not(:checked)")!);
}
async function addOwnView(words: string): Promise<void> {
  await click(buttonsNamed(CATALOG["v4.suggest.ownView"]!, panel())[0]!);
  await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, words);
  await click(buttonsNamed(CATALOG["v4.suggest.ownViewAdd"]!, panel())[0]!);
}
/** A row's ⋯, then one of its items. */
async function rowMenu(at: number, label: string): Promise<void> {
  await click(digRows()[at]!.querySelector<HTMLButtonElement>(".v4StartRowMore")!);
  const item = [...digRows()[at]!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].find((button) => button.textContent === label);
  if (item === undefined) throw new Error(`no menu item ${label}`);
  await click(item);
}
/** "Combine with…" on one row, then a press on the other, as the choosing step's rows do it. */
async function combineRows(first: number, second: number): Promise<void> {
  await rowMenu(first, CATALOG["v4.start.menu.combineWith"]!);
  await click(digRows()[second]!.querySelector<HTMLButtonElement>(".v4StartRowButton")!);
}
async function mountV2(suggestions: readonly DigSuggestion[]): Promise<string> {
  const runId = crypto.randomUUID();
  harness.answer = v2AnswerWith(runId, suggestions);
  await mountMap(1600, runId);
  await openOn(true, PATHS.renew);
  return runId;
}
const picksButton = (): HTMLButtonElement => buttonsNamed(CATALOG["v4.dig.yourPicks.other"]!, panel())[0]!;
const handOverOf = (call: number): unknown => (harness.submit.mock.calls[call] as unknown[] | undefined)?.[6];

describe("Task 79: a dig's picks become paths on the choosing step's rows (spec §4.4, dig-f35)", () => {
  afterEach(() => {
    standIn.combine = null;
  });

  it("two picks are two rows; Combine with… makes one row being written, asked for this dig; after the note's 10 s it goes with its paths", async () => {
    spyCombine();
    const stored = vi.spyOn(Storage.prototype, "setItem");
    const runId = await mountV2([LAND, sug("s-batteries", "Can batteries cover a windless week?")]);
    await pickInPanel(2);
    expect(rowTitles()).toEqual(["How much land is needed?", "Can batteries cover a windless week?"]);
    // The choosing step's rows: no tick box, its own words on ⋯.
    expect(digRows()[0]!.querySelector("input[type=checkbox]")).toBeNull();
    await combineRows(0, 1);
    expect(digRows()).toHaveLength(1);
    expect(digRows()[0]!.textContent).toContain(CATALOG["v4.start.writing"]!);
    expect(combines.map((call) => call.input)).toEqual([{
      context: { kind: "DIG", parent_run_id: runId }, reading_level: "background",
      members: [
        { viewpoint_id: null, pick_no: 1, title: null, question: "How much land is needed?" },
        { viewpoint_id: null, pick_no: 2, title: null, question: "Can batteries cover a windless week?" }
      ]
    }]);
    await answerCombine(0);
    expect(rowTitles()).toEqual(["T"]);
    await click(picksButton());
    await advance(9_500);
    expect(harness.submit).not.toHaveBeenCalled();
    await advance(600);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    const call = harness.submit.mock.calls[0] as unknown[];
    expect((call[3] as { picks: unknown[] }).picks).toHaveLength(2);
    expect(call[6]).toEqual({ questionLine: call[0], startPaths: COMBINED_PATHS, ownWords: [] });
    // Nothing of it is kept in the browser.
    expect(stored).not.toHaveBeenCalled();
    stored.mockRestore();
  });

  it("Ctrl+Z after the combine gives the two rows back, and combining the same pair again asks nothing", async () => {
    spyCombine();
    await mountV2([LAND, COST]);
    await pickInPanel(2);
    await combineRows(0, 1);
    await answerCombine(0);
    expect(rowTitles()).toEqual(["T"]);
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true })); });
    await settle();
    expect(rowTitles()).toEqual(["How much land is needed?", "What does storage cost?"]);
    await combineRows(0, 1);
    expect(rowTitles()).toEqual(["T"]);
    expect(combines).toHaveLength(1);
  });

  it("Undo on the dig's note sends nothing", async () => {
    spyCombine();
    await mountV2([LAND, COST]);
    await pickInPanel(2);
    await combineRows(0, 1);
    await answerCombine(0);
    await click(picksButton());
    await advance(3_000);
    await click(page().querySelector<HTMLButtonElement>(`button[aria-label="${CATALOG["v4.dig.undoLabel"]!}"]`)!);
    await advance(30_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("Split apart on the combined row gives the two rows back", async () => {
    spyCombine();
    await mountV2([LAND, COST]);
    await pickInPanel(2);
    await combineRows(0, 1);
    await answerCombine(0);
    await rowMenu(0, CATALOG["v4.start.menu.split"]!);
    expect(rowTitles()).toEqual(["How much land is needed?", "What does storage cost?"]);
  });

  it("a third pick keeps the combined row and comes after it", async () => {
    spyCombine();
    await mountV2([LAND, COST, sug("s-batteries", "Can batteries cover a windless week?")]);
    await pickInPanel(2);
    await combineRows(0, 1);
    await answerCombine(0);
    await pickInPanel(1);
    expect(rowTitles()).toEqual(["T", "Can batteries cover a windless week?"]);
  });

  it("three picks, then a combine: the picks' share goes from 'up to 6%' to 'up to 5%' with a grey '−1%' (Task 79b's made-up shares)", async () => {
    spyCombine();
    harness.room = room({ dig_share_percent: 10, dig_share_by_paths: [3, 5, 6] });
    await mountV2(PLAIN);
    await pickInPanel(3);
    const picksWith = (percent: number): string => `${CATALOG["v4.dig.yourPicks.other"]} · ${word("v4.undo.barShare", { percent })}`;
    expect(buttonsOf(panel())).toContain(picksWith(6));
    await combineRows(0, 1);
    expect(buttonsOf(panel())).toContain(picksWith(5));
    const mark = panel().querySelector<HTMLElement>(".v4PanelDig .v4ShareChange");
    expect(mark?.textContent).toBe("−1%");
    expect(mark?.className ?? "").not.toMatch(/red|danger|error|warn/iu);
    // The tray, once another path is open, digs them at the same share.
    await openOn(true, PATHS.smr);
    expect(buttonsNamed(trayButton(5), tray()!)).toHaveLength(1);
  });

  it("an R22 debate's dig: no rows, and the dig goes as today, without paths", async () => {
    spyCombine();
    const runId = crypto.randomUUID();
    harness.answer = withThirdPick(seededAnswer(runId));
    await mountMap(1600, runId);
    await openOn(false, PATHS.renew);
    await pickInPanel(2);
    expect(page().querySelector(".v4DigPaths")).toBeNull();
    await click(picksButton());
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(handOverOf(0)).toBeUndefined();
    expect(combines).toHaveLength(0);
  });

  it("an R22 debate's dig where the start step runs (the read names a share per path count): rows, and the dig goes with its paths", async () => {
    spyCombine();
    const runId = crypto.randomUUID();
    harness.answer = withThirdPick(seededAnswer(runId));
    harness.room = room({ dig_share_percent: 10, dig_share_by_paths: [3, 5, 6] });
    await mountMap(1600, runId);
    await openOn(false, PATHS.renew);
    await pickInPanel(2);
    expect(digRows()).toHaveLength(2);
    // Two paths: the picks' button carries the share of two paths (Task 79b's made-up [3, 5, 6]).
    await click(buttonsNamed(`${CATALOG["v4.dig.yourPicks.other"]} · ${word("v4.undo.barShare", { percent: 5 })}`, panel())[0]!);
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    const sent = handOverOf(0) as { startPaths: { source: string; width: number } } | undefined;
    expect(sent?.startPaths.source).toBe("DIG_PICKS");
    expect(sent?.startPaths.width).toBe(2);
  });

  it("one pick beside an open question makes no rows (an open question stays a place, never a path)", async () => {
    await mountV2([LAND, COST]);
    await pickInPanel(1);
    await expandBranch(PATHS.renew);
    const open = branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafOpen input[type=checkbox]");
    expect(open).not.toBeNull();
    await click(open!);
    expect(page().querySelector(".v4DigPaths")).toBeNull();
  });

  it("two picks resting on one point: 'Dig them as one?' once; Combine makes one row being written", async () => {
    spyCombine();
    await mountV2([LULLS, GAP]);
    await pickInPanel(2);
    expect(overlapLines()).toEqual([word("v4.digPaths.overlap", { a: "Seasonal lulls?", b: "2030s gap?" })]);
    expect(overlapLines()[0]).toBe("“Seasonal lulls?” and “2030s gap?” overlap. Dig them as one?");
    await click(buttonsNamed(CATALOG["v4.digPaths.overlapCombine"]!, page().querySelector(".v4DigOverlap")!)[0]!);
    expect(digRows()).toHaveLength(1);
    expect(digRows()[0]!.textContent).toContain(CATALOG["v4.start.writing"]!);
    expect(overlapLines()).toEqual([]);
    expect(combines).toHaveLength(1);
  });

  it("Keep apart: the line goes and does not come back for this draft; the two rows stay", async () => {
    await mountV2([LULLS, GAP, LAND]);
    await pickInPanel(2);
    expect(overlapLines()).toHaveLength(1);
    await click(buttonsNamed(CATALOG["v4.digPaths.keepApart"]!, page().querySelector(".v4DigOverlap")!)[0]!);
    expect(overlapLines()).toEqual([]);
    expect(rowTitles()).toEqual(["Seasonal lulls?", "2030s gap?"]);
    await pickInPanel(1);
    const boxes = [...panel().querySelectorAll<HTMLInputElement>(".v4Sugs input[type=checkbox]:checked")];
    await click(boxes.at(-1)!);
    expect(rowTitles()).toEqual(["Seasonal lulls?", "2030s gap?"]);
    expect(overlapLines()).toEqual([]);
  });

  it("three picks overlapping a–b and b–c: one suggestion at a time", async () => {
    await mountV2([LULLS, GAP, COST]);
    await pickInPanel(3);
    expect(overlapLines()).toEqual([word("v4.digPaths.overlap", { a: "Seasonal lulls?", b: "2030s gap?" })]);
    await click(buttonsNamed(CATALOG["v4.digPaths.keepApart"]!, page().querySelector(".v4DigOverlap")!)[0]!);
    expect(overlapLines()).toEqual([word("v4.digPaths.overlap", { a: "2030s gap?", b: "What does storage cost?" })]);
  });

  it("paid: an eighth pick past 7 paths is refused with its line, nothing is sent; once two are combined it fits", async () => {
    spyCombine();
    await mountV2([LAND]);
    for (let n = 1; n <= 7; n += 1) await addOwnView(`My view number ${String(n)}.`);
    expect(digRows()).toHaveLength(7);
    expect(buttonsNamed(CATALOG["v4.suggest.ownView"]!, panel())).toHaveLength(0);
    expect(panel().textContent).toContain(CATALOG["v4.digPaths.full"]!);
    expect(CATALOG["v4.digPaths.full"]).toBe("A dig looks into up to 7 paths. Combine two of your picks, or remove one.");
    // The suggestion's own box is closed for the same reason.
    expect(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]:not(:checked)")?.disabled).toBe(true);
    expect(harness.submit).not.toHaveBeenCalled();
    await combineRows(0, 1);
    await answerCombine(0);
    expect(digRows()).toHaveLength(6);
    await addOwnView("My view number 8.");
    expect(digRows()).toHaveLength(7);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  // Independent review (wave 16): ⋯ Remove on a dig's row takes its pick out of the dig (its box is unticked; a dig has no
  // "+ N more"), and Undo brings it back, ticked, in its place (builder ruling 2, untested until now).
  it("Remove takes the pick out of the dig (its box unticked); Undo brings it back in its place", async () => {
    await mountV2([LAND, COST, sug("s-batteries", "Can batteries cover a windless week?")]);
    await pickInPanel(3);
    const ticked = (): string[] => [...panel().querySelectorAll<HTMLInputElement>(".v4Sugs input[type=checkbox]")]
      .filter((box) => box.checked).map((box) => box.closest("label")?.textContent?.replace(/\s+/gu, " ").trim() ?? "");
    expect(ticked()).toHaveLength(3);
    await rowMenu(1, CATALOG["v4.start.menu.remove"]!);
    expect(rowTitles()).toEqual(["How much land is needed?", "Can batteries cover a windless week?"]);
    expect(ticked()).toHaveLength(2);
    expect(ticked().some((words) => words.includes("What does storage cost?"))).toBe(false);
    await click(page().querySelector<HTMLButtonElement>(".v4DigPaths .v4StartUndo")!);
    expect(rowTitles()).toEqual(["How much land is needed?", "What does storage cost?", "Can batteries cover a windless week?"]);
    expect(ticked()).toHaveLength(3);
  });

  // Independent review (wave 16): a dig pressed while its combined question is still being written waits its 10 seconds anyway;
  // the AI's words that come meanwhile go with it (the combine was asked and counted for them), as Start takes a combine written
  // during its own 10 seconds. Words that have not come by then: the joined words, as before (FALLBACK).
  it("pressed while the combined question is being written: the words that come within the 10 seconds go with the dig", async () => {
    spyCombine();
    await mountV2([LAND, COST]);
    await pickInPanel(2);
    await combineRows(0, 1);
    expect(digRows()[0]!.textContent).toContain(CATALOG["v4.start.writing"]!);
    await click(picksButton());
    await advance(3_000);
    await answerCombine(0);
    await advance(7_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(handOverOf(0)).toMatchObject({ startPaths: COMBINED_PATHS });
  });

  it("pressed while the combined question is being written, and no words by the end of the 10 seconds: the joined words go", async () => {
    spyCombine();
    await mountV2([LAND, COST]);
    await pickInPanel(2);
    await combineRows(0, 1);
    await click(picksButton());
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    const sent = (handOverOf(0) as { startPaths: { paths: { title: string; members: unknown; combine_ref?: string }[] } }).startPaths.paths;
    expect(sent).toHaveLength(1);
    expect(sent[0]!.members).toEqual([{ pick_no: 1 }, { pick_no: 2 }]);
    expect(sent[0]!.title).toBe("How much land is needed? · What does storage cost?");
    expect(sent[0]!.combine_ref).toBeUndefined();
  });

  // Independent review (wave 16): "Try this dig again" digs the same, so a failed dig of combined picks goes again with the same
  // paths (one path of both picks, with its reference), never one path per pick.
  it("a failed dig of two combined picks is tried again with the same paths", async () => {
    spyCombine();
    await mountV2([LAND, COST]);
    await pickInPanel(2);
    await combineRows(0, 1);
    await answerCombine(0);
    const child = crypto.randomUUID();
    harness.submit.mockImplementationOnce(async () => ({ kind: "STARTED", runId: child }));
    harness.digView = (link) => ({ link, state: "FAILED", headline: null, counts: null, terminalReason: "RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED" });
    await click(picksButton());
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(handOverOf(0)).toMatchObject({ startPaths: COMBINED_PATHS });
    await settle();
    const failed = page().querySelector<HTMLElement>(".v4MapDigFAILED");
    expect(failed).not.toBeNull();
    await click(failed!);
    await click(buttonsNamed(CATALOG["v4.digFailed.retry"]!, panel())[0]!);
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(2);
    expect(handOverOf(1)).toEqual(handOverOf(0));
  });

  it("Free: three picks, two combined, go as two paths", async () => {
    spyCombine();
    harness.planTier = "free";
    await mountV2([LAND]);
    for (let n = 1; n <= 3; n += 1) await addOwnView(`My view number ${String(n)}.`);
    expect(digRows()).toHaveLength(3);
    await combineRows(0, 1);
    await answerCombine(0);
    expect(digRows()).toHaveLength(2);
    await click(picksButton());
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(handOverOf(0)).toMatchObject({ startPaths: { source: "DIG_PICKS", width: 2, chosen_by: "PERSON" } });
  });
});

describe("Task 79: the dig's rows on a 375 px phone", () => {
  it("rows of at least 44 px, no drag grip, and ⋯ holds Move up and Move down", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({ matches: 375 <= Number(/max-width:\s*(\d+)px/u.exec(query)?.[1] ?? "0"), media: query, addEventListener() {}, removeEventListener() {} })
    });
    const plan = digPathPlanOf([suggestionPick(B2, LAND), suggestionPick(B2, COST)], false);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <V4DigPaths plan={plan} overlap={null} writing={new Set()} onAction={() => null} onKeepApart={() => undefined} catalog={CATALOG} locale="en" />
    ));
    const rows = [...host.querySelectorAll<HTMLElement>(".v4StartRow")];
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.classList.contains("v4StartRow--narrow"))).toBe(true);
    expect(host.querySelector(".v4StartRowGrip")).toBeNull();
    await act(async () => rows[0]!.querySelector<HTMLButtonElement>(".v4StartRowMore")!.click());
    const items = [...host.querySelectorAll("[role=menuitem]")].map((item) => item.textContent);
    expect(items).toEqual(expect.arrayContaining([CATALOG["v4.start.menu.moveUp"], CATALOG["v4.start.menu.moveDown"]]));
    // Every press on a row is at least 44 px (the choosing card's own rules, which the dig's rows share).
    const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8");
    expect(css).toMatch(/\.v4StartRowButton\s*\{[^}]*min-height: 44px/u);
    expect(css).toMatch(/\.v4StartRowRewrite, \.v4StartRowMore\s*\{[^}]*min-height: 44px/u);
    await act(async () => root.unmount());
    host.remove();
  });
});
