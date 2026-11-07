// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import { SHARE_DELTA_SHOW_MS } from "../../apps/ui/lib/v4/money.js";
import { AnswerSchema, type Answer, type AnswerBranch, type PathOutcome } from "../../packages/contract/src/index.js";
import {
  advance, branch, buttonsNamed, CATALOG, click, expandBranch, harness, mountMap, openPath, page, panel, PATHS, resetHarness, seededAnswer, tray,
  unmountMap
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
 * Dig picks on a path debate's map (spec 2026-11-03 §4.4; item dig-f35).
 * V4 start step, Task 79b (owner answer Q19 of 4 Nov, A: "the dig's share follows a combine"; journey-f8): the tray's share is
 * the room read's own share for the number of paths the dig will look into (`dig_share_by_paths`, entry i - 1 for i paths), so a
 * change of that number moves the share at once, without another read; the change shows in grey ("−1%"), never in red, for
 * SHARE_DELTA_SHOW_MS, and no line says what would be left (r2-2). Until the dig's rows land (Task 79: combine, split and rewrite),
 * a dig of picks looks into one path per pick (the server's own rule for a dig that sends no paths). An R22 debate's dig keeps
 * today's single share. Only the reads and the ask are stand-ins (v4-debate-harness.tsx); every share is made up.
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

  it("an R22 debate's dig keeps today's single share, whatever the number of picks", async () => {
    const runId = crypto.randomUUID();
    harness.answer = withThirdPick(seededAnswer(runId));
    harness.room = room({ dig_share_percent: 10, dig_share_by_paths: [3, 5, 6] });
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
