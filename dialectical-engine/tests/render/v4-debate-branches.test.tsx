// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnswerSchema,
  AskParentSchema,
  startMoreOf,
  type Answer,
  type AnswerBranch,
  type PathOutcome
} from "../../packages/contract/src/index.js";
import { NUCLEAR_MENU } from "../support/v4-start-menu.js";
import {
  advance, buttonNamed, buttonsNamed, CATALOG, click, harness, mountMap, page, panel, resetHarness, seededAnswer, unmountMap
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
 * V4 start step, Task 62 (spec 2026-11-03 §2 items 5 and 8; items wait-d1, journey-f13, r2-22): digging on a path debate's
 * map once its answer is ready. A chosen path's one dig button ("Dig here", journey-f13's words) digs deeper into it through
 * the shared Undo note: nothing is sent for 10 seconds. A "+ N more to explore" item becomes a MORE pick of the main question,
 * sent as the AIs' words at its own place. The menu paths left out before Start are the first things the main question offers
 * to dig (spec §2.5); an R22 debate's list is unchanged. The main answer says how sure it is from its paths' words. Only the
 * reads and the ask are stand-ins (v4-debate-harness.tsx). All words are made up.
 */

const CHOSEN = NUCLEAR_MENU.paths.slice(0, 5);
const ROOTS = ["n-mix", "n-renew", "n-nuclear", "n-smr", null] as const;
const MORE_TITLES = ["Falling prices", "Building delays", "Waste for centuries", "Jobs in the regions"];
const KP06 = NUCLEAR_MENU.paths.find((path) => path.path_ref === "kp06")!;
const KP07 = NUCLEAR_MENU.paths.find((path) => path.path_ref === "kp07")!;

const flat = (node: Element | null | undefined): string => (node?.textContent ?? "").replace(/\s+/gu, " ").trim();
const ready = (line: string): PathOutcome => ({
  state: "READY", text: { line, summary: `Summary of ${line}`, fate: "HELD_UP" }, what_changed: [], view: null, trust: "SURE", rests_on: []
} as PathOutcome);
const failed: PathOutcome = { state: "FAILED", text: null, what_changed: [], view: null, trust: null, rests_on: [] };

/** The served answer of a path debate made from NUCLEAR_MENU's top five paths (the fifth could not finish). */
function v2Answer(runId: string): Answer {
  return AnswerSchema.parse({
    ...seededAnswer(runId),
    question_line: "Should Romania build new nuclear plants?\n\nLooking at Romania.",
    branches: {
      source: "MENU", width: 5,
      paths: CHOSEN.map((path, index): AnswerBranch => ({
        path_id: `b${index + 1}`, order: index + 1, title: path.title, question: path.question, author: "AI_SUGGESTION",
        viewpoints: [{ title: path.title, question: path.question, own: false }],
        state: ROOTS[index] === null ? "FAILED" : "ARGUED", root_node_id: ROOTS[index]!,
        outcome: ROOTS[index] === null ? failed : ready(`Line of ${path.title}.`)
      })),
      more: [...startMoreOf(NUCLEAR_MENU, new Set(CHOSEN.flatMap((path) => path.viewpoint_ids)))],
      also_raised: [], main_trust: "SURE", carry_on_to_report: false
    }
  });
}

const cardButton = (id: string): HTMLButtonElement =>
  page().querySelector<HTMLButtonElement>(`[data-path-card="${id}"] .v4PathCardMain`)!;
/** The main question's "Where to dig from here", in the panel. */
const whereToDig = (): HTMLElement => [...panel().querySelectorAll<HTMLElement>(".v4PanelSection")]
  .find((section) => flat(section.querySelector(".v4PanelH3")) === CATALOG["v4.panel.whereToDig"])!;
const rowTitles = (section: HTMLElement): string[] => [...section.querySelectorAll(".v4PanelRowTitle")].map((title) => flat(title).replace(/^★ /u, ""));

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("digging deeper into a chosen path (journey-f13, r2-22)", () => {
  it("its one dig button goes through the shared Undo note and sends one dig after 10 seconds", async () => {
    const runId = crypto.randomUUID();
    harness.answer = v2Answer(runId);
    await mountMap(1600, runId);
    await click(cardButton("b2"));
    await click(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    // The shared Undo note with its quiet shrinking line.
    const note = page().querySelector(".v4Undo")!;
    expect(note).not.toBeNull();
    expect(note.querySelector(".v4UndoLine")).not.toBeNull();
    await advance(9_500);
    expect(harness.submit).not.toHaveBeenCalled();
    await advance(600);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.submit.mock.calls[0]![3]).toEqual({ parent_run_id: runId, places: ["path:b2"], mode: "quick" });
  });
});

describe("a \"+ N more to explore\" item (wait-d1)", () => {
  it("digging into one sends it as a MORE pick of the main question, through the Undo note", async () => {
    const runId = crypto.randomUUID();
    harness.answer = v2Answer(runId);
    await mountMap(1600, runId);
    await click(buttonNamed(`+ ${MORE_TITLES.length} more to explore`));
    expect(panel().classList.contains("v4Panel-more")).toBe(true);
    await click(buttonsNamed(CATALOG["v4.paths.digThis"]!, panel())[1]!);
    expect(page().querySelector(".v4Undo .v4UndoLine")).not.toBeNull();
    expect(harness.submit).not.toHaveBeenCalled();
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    const parent = harness.submit.mock.calls[0]![3];
    expect(AskParentSchema.safeParse(parent).success).toBe(true);
    expect(parent).toEqual({
      parent_run_id: runId, places: ["more-kp07"], mode: "quick",
      picks: [{ kind: "HELPS_MAIN_QUESTION", suggestion_id: "more-kp07", place: "more-kp07", text: KP07.question }]
    });
  });
});

describe("the main answer's trust word (Task 61's line, placed by the page)", () => {
  it("the answer card says how sure the answer is, from what the AIs found", async () => {
    const runId = crypto.randomUUID();
    harness.answer = v2Answer(runId);
    await mountMap(1600, runId);
    const line = CATALOG["v4.paths.mainTrust"]!.replace("{word}", CATALOG["v4.trust.SURE"]!);
    expect(flat(page().querySelector(".v4AnswerCard"))).toContain(line);
    expect(page().querySelectorAll(".v4MainAnswerTrust")).toHaveLength(1);
  });
});

describe("the main question offers the left-out paths first (spec §2.5)", () => {
  it("on a v2 parent its dig list starts with the menu paths left out, and picking the first sends it as a MORE pick", async () => {
    const runId = crypto.randomUUID();
    harness.answer = v2Answer(runId);
    await mountMap(1600, runId);
    expect(panel().classList.contains("v4Panel-root")).toBe(true);
    const section = whereToDig();
    expect(rowTitles(section).slice(0, MORE_TITLES.length)).toEqual(MORE_TITLES);
    const box = section.querySelector<HTMLInputElement>(".v4MorePick input[type=checkbox]")!;
    await click(box);
    expect(box.checked).toBe(true);
    await click(panel().querySelector<HTMLButtonElement>(".v4PanelDigBtn")!);
    expect(page().querySelector(".v4Undo .v4UndoLine")).not.toBeNull();
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.submit.mock.calls[0]![3]).toEqual({
      parent_run_id: runId, places: ["more-kp06"], mode: "quick",
      picks: [{ kind: "HELPS_MAIN_QUESTION", suggestion_id: "more-kp06", place: "more-kp06", text: KP06.question }]
    });
  });

  it("an R22 parent's list is unchanged: its open questions only", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId);
    await mountMap(1600, runId);
    const section = whereToDig();
    expect(section.querySelector(".v4MorePick")).toBeNull();
    expect(rowTitles(section).some((title) => MORE_TITLES.includes(title))).toBe(false);
  });
});
