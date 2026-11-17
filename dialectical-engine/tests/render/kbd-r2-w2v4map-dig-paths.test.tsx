// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOCUS_GUARD_SETTLE_MS } from "../../apps/ui/lib/focusGuard.js";
import { AnswerSchema, type Answer, type AnswerBranch, type DigSuggestion, type PathOutcome } from "../../packages/contract/src/index.js";
import { pressByKeyboard, startFocusGuard } from "./kbd-guard-harness.js";
import { advance, buttonsNamed, CATALOG, click, harness, mountMap, page, panel, PATHS, resetHarness, seededAnswer, settle, unmountMap } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Keyboard audit 2026-11-12, wave 2 (W2-V4MAP): the dig's path rows on a path debate's map (V4DigPaths), with the site's focus
 * guard running (tests/render/kbd-guard-harness.ts). The fixtures are tests/render/v4-dig-paths.test.tsx's (copied, so that
 * file stays as it is); every text is made up.
 *   V4C-2  the rows' Undo goes after the last undo.
 *   V4C-3  the overlap suggestion's Combine / Keep apart take the suggestion away.
 * Each time the guard holds focus on the rows' own block, and Tab carries on from where the pressed control was.
 */

let stopGuard: () => void = () => undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  stopGuard = startFocusGuard();
});

afterEach(async () => {
  stopGuard();
  await unmountMap();
  vi.useRealTimers();
});

async function press(button: HTMLElement): Promise<void> {
  pressByKeyboard(button);
  await settle();
  await advance(FOCUS_GUARD_SETTLE_MS + 20);
  await settle();
}

const ROOTS = ["n-mix", "n-renew", "n-nuclear", "n-smr"] as const;
const ready = (line: string): PathOutcome => ({
  state: "READY", text: { line, summary: `Summary of ${line}`, fate: "HELD_UP" }, what_changed: [], view: null, trust: "SURE", rests_on: []
} as PathOutcome);
function v2Answer(runId: string): Answer {
  const seeded = seededAnswer(runId);
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
const B2 = "b2";
const sug = (id: string, text: string, points?: readonly string[]): DigSuggestion => ({
  suggestion_id: id, kind: "UNDOCUMENTED", side: null, text, places: [`path:${B2}`], ...(points === undefined ? {} : { points: [...points] })
});
const LULLS = sug("s-lulls", "Seasonal lulls?", ["n-renew-winter"]);
const GAP = sug("s-gap", "2030s gap?", ["n-renew-winter", "n-renew-cost"]);
const COST = sug("s-cost", "What does storage cost?", ["n-renew-cost"]);
const LAND = sug("s-land", "How much land is needed?");

async function mountV2(suggestions: readonly DigSuggestion[]): Promise<void> {
  const runId = crypto.randomUUID();
  const answer = v2Answer(runId);
  harness.answer = AnswerSchema.parse({
    ...answer, web: { ...answer.web!, paths: answer.web!.paths.map((path) => (path.position_ref !== B2 ? path : { ...path, suggestions: [...suggestions] })) }
  });
  await mountMap(1600, runId);
  page().id = "main-content";
  await click(page().querySelector<HTMLButtonElement>(`[data-path-card="b${String(PATHS.renew + 1)}"] .v4PathCardMain`)!);
}
async function pickInPanel(count: number): Promise<void> {
  for (let n = 0; n < count; n += 1) await click(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]:not(:checked)")!);
}
const block = (): HTMLElement => page().querySelector<HTMLElement>(".v4DigPaths")!;
const digRows = (): HTMLElement[] => [...page().querySelectorAll<HTMLElement>(".v4DigPaths .v4StartRow")];
const firstRowButton = (): HTMLElement => block().querySelector<HTMLElement>(".v4StartList .v4StartRowButton")!;

/** Tab (or Shift+Tab) pressed where focus is; the guard carries on from where the lost control was. */
function tab(shift = false): Element | null {
  act(() => { (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true })); });
  return document.activeElement;
}

describe("V4C-2: the rows' Undo after the last undo", () => {
  it("Undo goes; focus is held on the rows' block, and Shift+Tab goes back into the last row", async () => {
    await mountV2([LAND, COST, sug("s-batteries", "Can batteries cover a windless week?")]);
    await pickInPanel(3);
    await click(digRows()[1]!.querySelector<HTMLButtonElement>(".v4StartRowMore")!);
    await click([...digRows()[1]!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].find((item) => item.textContent === CATALOG["v4.start.menu.remove"])!);
    await press(block().querySelector<HTMLElement>(".v4StartUndo")!);
    expect(block().querySelector(".v4StartUndo")).toBeNull();
    expect(digRows()).toHaveLength(3);
    expect(document.activeElement).toBe(block());
    // Shift+Tab goes back from where Undo was: into the last row.
    expect(digRows().at(-1)!.contains(tab(true))).toBe(true);
  });
});

describe("V4C-3: the overlap suggestion's Combine and Keep apart", () => {
  it("Keep apart: the suggestion goes; focus is held on the rows' block, and Tab goes on to the first row", async () => {
    await mountV2([LULLS, GAP, LAND]);
    await pickInPanel(2);
    await press(buttonsNamed(CATALOG["v4.digPaths.keepApart"]!, block().querySelector(".v4DigOverlap")!)[0]!);
    expect(block().querySelector(".v4DigOverlap")).toBeNull();
    expect(document.activeElement).toBe(block());
    // Tab goes on from where the suggestion was, at the top of the rows: to the first row.
    expect(tab()).toBe(firstRowButton());
  });

  it("Combine: the suggestion goes and the two rows become one; focus is held on the rows' block", async () => {
    await mountV2([LULLS, GAP]);
    await pickInPanel(2);
    await press(buttonsNamed(CATALOG["v4.digPaths.overlapCombine"]!, block().querySelector(".v4DigOverlap")!)[0]!);
    expect(block().querySelector(".v4DigOverlap")).toBeNull();
    expect(digRows()).toHaveLength(1);
    expect(document.activeElement).toBe(block());
    expect(tab()).toBe(firstRowButton());
  });
});
