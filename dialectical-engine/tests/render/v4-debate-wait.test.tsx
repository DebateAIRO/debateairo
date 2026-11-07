// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import {
  AnswerSchema,
  RunProjectionSchema,
  type Answer,
  type AnswerBranch,
  type AnswerBranches,
  type AnswerStory,
  type CarryOnPart,
  type PathOutcome,
  type RunProjection
} from "../../packages/contract/src/index.js";
import { createSeed } from "../../tools/v4-mock-api/seed.js";
import {
  advance, buttonNamed, CATALOG, click, harness, mountMap, page, panel, resetHarness, seededAnswer, seededStory, settle, text, unmountMap
} from "./v4-debate-harness.js";

const carry = vi.hoisted(() => ({ built: false }));
vi.mock("@/lib/v4/carryOn", () => ({ get CARRY_ON_BUILT() { return carry.built; } }));
/** The owner's run read the page makes again while the carry-on line shows on the served map (wait-f16). */
const runReads = vi.hoisted(() => ({ calls: 0, answer: null as null | ((runId: string) => unknown) }));
vi.mock("@/lib/api", async (original) => {
  const real = await original<typeof import("../../apps/ui/lib/api.js")>();
  const client = new Proxy({}, {
    get: (_target, property) => (property === "readRun"
      ? async (runId: string) => {
        runReads.calls += 1;
        if (runReads.answer === null) throw new Error("not readable");
        return runReads.answer(runId);
      }
      : Reflect.get(real.contractClient, property))
  });
  return { ...real, contractClient: client };
});
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * V4 start step, Task 62 (spec 2026-11-03 §2 items 7 and 8; items wait-d1, map-d2, journey-f1, map-f4, wait-f16, wait-f9,
 * wait-f10, r2-8, journey-d2; owner answers Q15, Q16, Q17): the debate page is the map from Start. A path debate's run read
 * draws the map at once: the question as it was sent (its answers are sentences in it), the waiting card under it, and each
 * chosen path being looked into, which fills in on its own. The person stays where they were through every redraw; a part that
 * left the map gives way to the part above it, said once. The waits without chosen paths say what happens; an old debate whose
 * short answer is still being written shows its answer card and no waiting card; once the page stops waiting it still checks
 * every 5 minutes. Only the reads and the ask are stand-ins (v4-debate-harness.tsx). All words and figures are made up.
 */

const seed = createSeed(fixture);
const ANSWER_ID = "aaaa1111-1111-4111-8111-111111111111";
const Q = "Should Romania build new nuclear plants?";
const LINE = `${Q}\n\nLooking at Romania. Up to 2050.`;
const T1 = "Keeping the lights on in a calm winter week";
const T2 = "Calm winter week";
const T3 = "Security and weapons risks";
const TITLES = [T1, T2, T3] as const;
const ROOTS = ["n-mix", "n-renew", "n-nuclear"] as const;

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const flat = (node: Element | null | undefined): string => (node?.textContent ?? "").replace(/\s+/gu, " ").trim();

const ready = (line: string): PathOutcome => ({
  state: "READY", text: { line, summary: `Summary of ${line}`, fate: "HELD_UP" }, what_changed: [], view: null, trust: "SURE", rests_on: []
} as PathOutcome);

function branchOf(n: number, filled: boolean): AnswerBranch {
  const title = TITLES[n - 1]!;
  return {
    path_id: `b${n}`, order: n, title, question: `What about ${title.toLowerCase()}?`, author: "AI_SUGGESTION",
    viewpoints: [{ title, question: `What about ${title.toLowerCase()}?`, own: false }],
    state: filled ? "ARGUED" : "LOOKING", root_node_id: filled ? ROOTS[n - 1]! : null, outcome: filled ? ready(`Line of ${title}.`) : null
  };
}

function branchesOf(filled: readonly number[], extra: Partial<AnswerBranches> = {}): AnswerBranches {
  return {
    source: "MENU", width: 3, paths: [1, 2, 3].map((n) => branchOf(n, filled.includes(n))),
    more: [{ more_id: "more-kp06", title: "Falling prices", question: "Will falling prices make new plants a poor deal?", is_new: false }],
    also_raised: [], main_trust: filled.length === 3 ? "SURE" : null, carry_on_to_report: false, ...extra
  };
}

/** The run read of the path debate: three chosen paths, the filled ones with two sure findings each. */
function runRead(runId: string, filled: readonly number[] = [], extra: Partial<RunProjection> = {}, branches: Partial<AnswerBranches> = {}): RunProjection {
  return RunProjectionSchema.parse({
    run_ref: runId, question_line: LINE, state: "RUNNING", terminal_reason: null, hold_until: null,
    branches: branchesOf(filled, branches),
    path_progress: [1, 2, 3].map((n) => (filled.includes(n)
      ? { path_id: `b${n}`, step: null, points: [], findings: [
        { node_ref: `${ROOTS[n - 1]!}`, text: `A made-up finding of path ${n}.`, trust: "SURE" },
        { node_ref: `${ROOTS[n - 1]!}-cost`, text: `Another made-up finding of path ${n}.`, trust: "SURE" }
      ] }
      : { path_id: `b${n}`, step: "ARGUING", points: ["PUT_FORWARD", "BEING_CHECKED", "CHECKED"], findings: [] })),
    ...extra
  });
}

/** The run read while the AIs are still choosing what to look into ("Just answer it"). */
function choosingRead(runId: string, extra: Partial<RunProjection> = {}): RunProjection {
  return RunProjectionSchema.parse({
    run_ref: runId, question_line: LINE, state: "RUNNING", terminal_reason: null, hold_until: null, path_progress: [], ...extra
  });
}

/** The served answer of the same debate (every path filled). */
function servedAnswer(runId: string, branches: Partial<AnswerBranches> = {}, extra: Partial<Answer> = {}): Answer {
  return AnswerSchema.parse({ ...seededAnswer(runId), question_line: LINE, branches: branchesOf([1, 2, 3], branches), ...extra });
}

const writingStory = (): AnswerStory => seed.story(ANSWER_ID, "WRITING", "2026-10-27T15:41:00.000Z") as AnswerStory;
const card = (id: string): HTMLElement => page().querySelector<HTMLElement>(`[data-path-card="${id}"]`)!;
const cardButton = (id: string): HTMLButtonElement => card(id).querySelector<HTMLButtonElement>(".v4PathCardMain")!;
const waitWord = (): string | null => {
  const found = page().querySelector("[data-wait-block] [data-wait-word]");
  return found === null ? null : flat(found);
};
const filledLine = (): string => flat(page().querySelector("[data-paths-filled]"));

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  carry.built = false;
  runReads.calls = 0;
  runReads.answer = null;
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("the map from Start (wait-d1, map-d2, journey-f1, r2-8)", () => {
  it("a path debate's run read draws the map at once: the whole question line, the waiting card and each path being looked into", async () => {
    const runId = crypto.randomUUID();
    harness.run = runRead(runId);
    await mountMap(1600, runId);
    // r2-8 / answer Q17: the first card is the question as it was sent, its answers sentences in it, never chips or pins.
    expect(flat(page().querySelector(".v4MapRoot .v4MapRootTitle"))).toBe(`${Q} Looking at Romania. Up to 2050.`);
    expect(page().querySelector(".v4ChoiceChips")).toBeNull();
    // journey-d2: the waiting card sits under it, with its one state line.
    expect(waitWord()).toBe(CATALOG["v4.state.LOOKING"]);
    expect(page().querySelector(".v4MapRootExtra [data-wait-block]")).not.toBeNull();
    // The paths beside it, in order, each being looked into.
    expect([...page().querySelectorAll("[data-path-card]")].map((node) => node.getAttribute("data-path-card"))).toEqual(["b1", "b2", "b3"]);
    for (const id of ["b1", "b2", "b3"]) expect(flat(card(id))).toContain(CATALOG["v4.paths.looking"]);
    // Nothing digs, picks or tours during the wait, and no time is promised.
    expect(page().querySelector("input[type=checkbox]")).toBeNull();
    expect(page().querySelector(".v4PanelDigBtn")).toBeNull();
    expect(page().querySelector(".v4DebTray")).toBeNull();
    expect(text()).not.toMatch(/usually|minutes/iu);
    // wait-d1 A: with the question selected the map takes the width, so there is no panel column.
    expect(page().querySelector(".v4DebPanelCol")).toBeNull();
  });

  it("a path fills in on its own; the person stays where they were and hears it once", async () => {
    const runId = crypto.randomUUID();
    harness.run = runRead(runId);
    await mountMap(1600, runId);
    const b1 = cardButton("b1");
    b1.focus();
    await click(b1);
    // A press from the keyboard moved focus to the panel's heading (UI-5); from here on, nothing moves it.
    const focused = document.activeElement;
    expect(focused).not.toBeNull();
    // The panel opens only for a path; b1 is still being looked into.
    expect(page().querySelector(".v4DebPanelCol")).not.toBeNull();
    expect(flat(panel())).toContain(word("v4.paths.lookingPanel", { title: T1 }));
    expect(flat(panel().querySelector(".v4PanelSection .v4PanelH3"))).toBe(CATALOG["v4.paths.asks"]);

    harness.run = runRead(runId, [2]);
    await advance(5_000);
    await settle();
    expect(card("b2").querySelector(".v4Bar")).not.toBeNull();
    expect(card("b2").querySelector(".v4Bar [role=img]")!.getAttribute("aria-label")).toContain(word("v4.paths.trustWord", { word: CATALOG["v4.trust.SURE"]! }));
    expect(flat(card("b1"))).toContain(CATALOG["v4.paths.looking"]);
    expect(flat(card("b3"))).toContain(CATALOG["v4.paths.looking"]);
    // map-f4: still on b1, the same button keeps focus; nothing moved by itself.
    expect(cardButton("b1").getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(focused);
    expect(cardButton("b1")).toBe(b1);
    // One polite line, once per path.
    expect(filledLine()).toBe(word("v4.paths.filled", { title: T2 }));
    await advance(5_000);
    await settle();
    expect(filledLine()).toBe(word("v4.paths.filled", { title: T2 }));

    // b1 fills in while it is open: its panel adds the answer so far and the findings; "What this asks" stays first.
    harness.run = runRead(runId, [1, 2]);
    await advance(5_000);
    await settle();
    expect(flat(panel())).toContain(CATALOG["v4.paths.answerSoFar"]);
    expect(panel().querySelector(".v4PanelGroupSURE")).not.toBeNull();
    expect(flat(panel().querySelector(".v4PanelSection .v4PanelH3"))).toBe(CATALOG["v4.paths.asks"]);
    expect(document.activeElement).toBe(focused);

    // The answer arrives: b1 still open, its one dig button there, the waiting card gone, the whole line still first.
    harness.run = null;
    harness.answer = servedAnswer(runId);
    await advance(5_000);
    await settle();
    expect(cardButton("b1").getAttribute("aria-current")).toBe("true");
    expect(flat(panel().querySelector(".v4PanelDigBtn"))).toContain(CATALOG["v4.panel.dig"]);
    expect(page().querySelector("[data-wait-block]")).toBeNull();
    expect(flat(page().querySelector(".v4MapRoot .v4MapRootTitle"))).toBe(`${Q} Looking at Romania. Up to 2050.`);
  });

  it("the polite line marks a path's title as AI text only when the AIs wrote it (the person's own path is theirs)", async () => {
    // Review of Tasks 60-62 (Task 61's rule: PERSON text without data-ai-generated).
    const runId = crypto.randomUUID();
    const own = (read: RunProjection): RunProjection => RunProjectionSchema.parse({
      ...read,
      branches: { ...read.branches!, paths: read.branches!.paths.map((path) => (path.path_id === "b2"
        ? { ...path, author: "PERSON_OWN_VIEW", viewpoints: [{ title: null, question: "My own made-up words about a calm week.", own: true }] }
        : path)) }
    });
    harness.run = own(runRead(runId));
    await mountMap(1600, runId);
    harness.run = own(runRead(runId, [2]));
    await advance(5_000);
    await settle();
    expect(filledLine()).toBe(word("v4.paths.filled", { title: T2 }));
    expect(page().querySelector("[data-paths-filled] [data-ai-generated]")).toBeNull();
    harness.run = own(runRead(runId, [1, 2]));
    await advance(5_000);
    await settle();
    expect(filledLine()).toBe(word("v4.paths.filled", { title: T1 }));
    expect(flat(page().querySelector("[data-paths-filled] [data-ai-generated='true']"))).toBe(T1);
  });

  it("a fresh mount on the served answer shows the same whole line (nothing from the page's memory)", async () => {
    const runId = crypto.randomUUID();
    harness.answer = servedAnswer(runId);
    await mountMap(1600, runId);
    expect(flat(page().querySelector(".v4MapRoot .v4MapRootTitle"))).toBe(`${Q} Looking at Romania. Up to 2050.`);
  });

  it("while the AIs choose what to look into there is no card; the cards come as the debate names them (wait-f16)", async () => {
    const runId = crypto.randomUUID();
    harness.run = choosingRead(runId);
    await mountMap(1600, runId);
    expect(text()).toContain(CATALOG["v4.paths.choosing"]);
    expect(page().querySelector("[data-path-card]")).toBeNull();
    expect(waitWord()).toBe(CATALOG["v4.state.LOOKING"]);
    harness.run = runRead(runId);
    await advance(5_000);
    await settle();
    expect(page().querySelectorAll("[data-path-card]")).toHaveLength(3);
    expect(text()).not.toContain(CATALOG["v4.paths.choosing"]);
  });

  it("an R22 run read is the first card alone: the question and the waiting card, no path column", async () => {
    const runId = crypto.randomUUID();
    harness.run = { run_ref: runId, question_line: Q, state: "RUNNING", terminal_reason: null, hold_until: null } as RunProjection;
    await mountMap(1600, runId);
    expect(flat(page().querySelector(".v4DebFirstCard .v4DebStatusQuestion"))).toBe(Q);
    expect(page().querySelector(".v4DebFirstCard [data-wait-block]")).not.toBeNull();
    expect(waitWord()).toBe(CATALOG["v4.state.LOOKING"]);
    expect(page().querySelector(".v4DebMapCol")).toBeNull();
    expect(page().querySelector(".v4MapBranches")).toBeNull();
    expect(text()).not.toMatch(/usually|minutes/iu);
  });
});

describe("the month pause on the map (wait-f5)", () => {
  it("V4WaitCard's props take the pause through its state and its own part, so the one pause block stands in its place", async () => {
    // V4WaitCard (the other session's) always draws its state line; the pause is said once, by the one pause block, so the
    // block takes the waiting card's place and no older MonthPaused is drawn under it.
    const runId = crypto.randomUUID();
    harness.run = runRead(runId, [], { month_pause: { until: "2026-12-01T00:00:00.000Z", can_continue: false } });
    await mountMap(1600, runId);
    const root = page().querySelector("[data-run-root]")!;
    expect(root.querySelector(".v4Pause")).not.toBeNull();
    expect(page().querySelector("[data-wait-block]")).toBeNull();
    expect(page().querySelector(".v4DebPaused")).toBeNull();
    expect(text()).not.toContain(word("v4.state.PAUSED", { date: "1 December" }));
    // The pulses stop; the step lines and dots stay as they were.
    expect(page().querySelector(".v4PathPulse")).toBeNull();
    expect(flat(card("b1"))).toContain(CATALOG["v4.paths.step.ARGUING"]);
  });

  // Review of Tasks 60-62: the pause block stands in the waiting card's place, so what the waiting card carried at its foot stays
  // with the block, as on the paused screen it replaced: the lost-touch line (wait-f19). "Open in the classic view" is in the
  // header's account menu only since the owner's answer 12 B (5 Nov; Task 76j), so the block draws none.
  const classicLinks = (): Element[] =>
    [...page().querySelectorAll("a")].filter((link) => link.textContent === CATALOG["v4.common.classicView"]);
  const PAUSE = { until: "2026-12-01T00:00:00.000Z", can_continue: false };

  it("paused on the map, it still says it lost touch, and draws no classic link (question 12 B)", async () => {
    const runId = crypto.randomUUID();
    harness.run = runRead(runId, [], { month_pause: PAUSE });
    await mountMap(1600, runId);
    const root = (): Element => page().querySelector("[data-run-root]")!;
    expect(classicLinks()).toEqual([]);
    expect(text()).not.toContain(CATALOG["v4.debate.reconnecting"]);
    harness.loadError = new Error("made-up network fault");
    await advance(5_000);
    await settle();
    expect(flat(root())).toContain(CATALOG["v4.debate.reconnecting"]);
    expect(classicLinks()).toEqual([]);
  });

  it("an R22 run paused at the month wall keeps the lost-touch line too, on its first card, and no classic link", async () => {
    const runId = crypto.randomUUID();
    harness.run = { run_ref: runId, question_line: Q, state: "RUNNING", terminal_reason: null, hold_until: null, month_pause: PAUSE } as RunProjection;
    await mountMap(1600, runId);
    const first = (): Element => page().querySelector(".v4DebFirstCard")!;
    expect(first().querySelector(".v4Pause")).not.toBeNull();
    expect(classicLinks()).toEqual([]);
    harness.loadError = new Error("made-up network fault");
    await advance(5_000);
    await settle();
    expect(flat(first())).toContain(CATALOG["v4.debate.reconnecting"]);
  });
});

describe("the carry-on line (wait-f16, Task 57b)", () => {
  it("shows from the first second, while the AIs still choose the paths, and stays once they are named", async () => {
    carry.built = true;
    const runId = crypto.randomUUID();
    harness.run = choosingRead(runId, { carry_on_part: "ANSWER" });
    await mountMap(1600, runId);
    expect(text()).toContain(CATALOG["v4.paths.choosing"]);
    expect(page().querySelector("[data-path-card]")).toBeNull();
    expect(flat(page().querySelector(".v4CarryOn [aria-current=step]"))).toBe(CATALOG["v4.paths.carryOn.ANSWER"]);
    harness.run = runRead(runId, [], { carry_on_part: "ANSWER" }, { carry_on_to_report: true });
    await advance(5_000);
    await settle();
    expect(page().querySelectorAll("[data-path-card]")).toHaveLength(3);
    expect(flat(page().querySelector(".v4CarryOn [aria-current=step]"))).toBe(CATALOG["v4.paths.carryOn.ANSWER"]);
  });

  it("marks the part the server says is running, and goes when the server names none", async () => {
    carry.built = true;
    const runId = crypto.randomUUID();
    const expected: ReadonlyArray<readonly [CarryOnPart, string]> = [
      ["ANSWER", CATALOG["v4.paths.carryOn.ANSWER"]!],
      ["DIGS", CATALOG["v4.paths.carryOn.DIGS"]!],
      ["REPORT", CATALOG["v4.paths.carryOn.REPORT"]!]
    ];
    harness.run = runRead(runId, [], { carry_on_part: "ANSWER" }, { carry_on_to_report: true });
    await mountMap(1600, runId);
    for (const [part, words] of expected) {
      harness.run = runRead(runId, [], { carry_on_part: part }, { carry_on_to_report: true });
      await advance(5_000);
      await settle();
      expect(flat(page().querySelector(".v4CarryOn [aria-current=step]"))).toBe(words);
    }
    harness.run = runRead(runId, [], {}, { carry_on_to_report: true });
    await advance(5_000);
    await settle();
    expect(page().querySelector(".v4CarryOn")).toBeNull();
  });

  it("after the answer, the owner's run read is asked again once a minute while the line shows, and not after it goes", async () => {
    carry.built = true;
    const runId = crypto.randomUUID();
    harness.answer = servedAnswer(runId, { carry_on_to_report: true }, { carry_on_part: "DIGS" });
    let part: CarryOnPart | null = "DIGS";
    runReads.answer = (id) => ({
      run_ref: id, question_line: LINE, state: "SETTLED", terminal_reason: null, hold_until: null,
      branches: branchesOf([1, 2, 3], { carry_on_to_report: true }),
      path_progress: [1, 2, 3].map((n) => ({ path_id: `b${n}`, step: null, points: [], findings: [] })),
      ...(part === null ? {} : { carry_on_part: part })
    });
    await mountMap(1600, runId);
    expect(flat(page().querySelector(".v4CarryOn [aria-current=step]"))).toBe(CATALOG["v4.paths.carryOn.DIGS"]);
    expect(runReads.calls).toBe(0);
    await advance(59_000);
    expect(runReads.calls).toBe(0);
    await advance(1_100);
    await settle();
    expect(runReads.calls).toBe(1);
    part = "REPORT";
    await advance(60_000);
    await settle();
    expect(runReads.calls).toBe(2);
    expect(flat(page().querySelector(".v4CarryOn [aria-current=step]"))).toBe(CATALOG["v4.paths.carryOn.REPORT"]);
    part = null;
    await advance(60_000);
    await settle();
    expect(runReads.calls).toBe(3);
    expect(page().querySelector(".v4CarryOn")).toBeNull();
    await advance(180_000);
    await settle();
    expect(runReads.calls).toBe(3);
  });
});

describe("an old debate whose short answer is still being written (wait-f9)", () => {
  it("shows the question, the answer card's one line and the long answer under its fold, never a waiting card; then the map", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId);
    harness.story = writingStory();
    await mountMap(1600, runId);
    const own = harness.answer.question_line;
    expect(flat(page().querySelector(".v4DebFirstCard"))).toContain(own);
    const pageText = text();
    expect(pageText.split(CATALOG["v4.panel.fallbackWriting"]!).length - 1).toBe(1);
    const fold = page().querySelector<HTMLDetailsElement>(".v4AnswerCard details.v4PanelFullAnswer")!;
    expect(fold.open).toBe(false);
    expect(flat(fold.querySelector("summary"))).toBe(CATALOG["v4.panel.readFullAnswer"]);
    expect(flat(fold)).toContain(harness.answer.composed_text[0]!.text);
    expect(page().querySelector("[data-wait-block]")).toBeNull();
    expect(page().querySelector("[data-wait-word]")).toBeNull();
    expect(page().querySelector(".v4DebMapCol")).toBeNull();
    expect(page().querySelector(".v4MapBranch")).toBeNull();

    fold.open = true;
    harness.story = seededStory();
    await advance(10_100);
    await settle();
    expect(page().querySelector(".v4AnswerCard .v4AnswerHeadline")).not.toBeNull();
    const kept = page().querySelector<HTMLDetailsElement>(".v4AnswerCard details.v4PanelFullAnswer")!;
    expect(kept).toBe(fold);
    expect(kept.open).toBe(true);
    expect(page().querySelectorAll(".v4MapBranch").length).toBeGreaterThan(0);
    expect(text()).not.toContain("still being written");
  });
});

describe("after the page stops waiting for the short answer (wait-f10)", () => {
  let visibility: DocumentVisibilityState = "visible";
  beforeEach(() => {
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  });
  const reads = (): number => harness.loadStory.mock.calls.length;
  /** The story's reads back off to once a minute and stop after 15 minutes (the tick at 910 s is the last). */
  const GAVE_UP_MS = 910_100;

  it("checks every 5 minutes; a late short answer brings the map back, says so once, and moves nothing", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId);
    harness.story = writingStory();
    await mountMap(1600, runId, "n-mix");
    await advance(GAVE_UP_MS);
    await settle();
    expect(text()).toContain("You don't need to wait. You can dig or write your report now.");
    const root = page().querySelector<HTMLButtonElement>(".v4MapRoot")!;
    root.focus();
    const before = reads();
    await advance(299_000);
    await settle();
    expect(reads()).toBe(before);
    await advance(2_000);
    await settle();
    expect(reads()).toBe(before + 1);
    await advance(300_000);
    await settle();
    expect(reads()).toBe(before + 2);

    harness.story = seededStory();
    await advance(300_000);
    await settle(200);
    expect(reads()).toBe(before + 3);
    expect(page().querySelector("[data-row='path:n-mix']")?.getAttribute("aria-current")).toBe("true");
    const note = page().querySelector(".v4ReadyNote")!;
    expect(flat(note)).toContain(CATALOG["v4.ready.shortAnswer"]);
    expect(buttonNamed(CATALOG["v4.ready.seeIt"]!, note)).toBeTruthy();
    expect(document.activeElement).toBe(root);
    // One screen-reader line, and the tab title says it is ready.
    expect(page().querySelector(".v4DebPage")!.getAttribute("data-tab-prefix")).toBe(CATALOG["v4.ready.tab.ready"]);
    expect([...page().querySelectorAll("[aria-live=polite]")].map((region) => flat(region))).toContain(CATALOG["v4.ready.shortAnswer"]);
    await advance(600_000);
    await settle();
    expect(reads()).toBe(before + 3);
    // Only a press of [See it] takes focus to the answer card's heading.
    await click(buttonNamed(CATALOG["v4.ready.seeIt"]!, page().querySelector(".v4ReadyNote")!));
    expect(document.activeElement).toBe(page().querySelector(".v4AnswerCard .v4AnswerHead .v4Eyebrow"));
  });

  it("reads once at once when the tab is shown again while it waits slowly", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId);
    harness.story = writingStory();
    await mountMap(1600, runId);
    await advance(GAVE_UP_MS);
    await settle();
    const before = reads();
    visibility = "hidden";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await settle();
    expect(reads()).toBe(before);
    visibility = "visible";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await settle();
    expect(reads()).toBe(before + 1);
  });

  it("a story read that says it could not be written stops the slow reads", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId);
    harness.story = writingStory();
    await mountMap(1600, runId);
    await advance(GAVE_UP_MS);
    await settle();
    harness.story = seed.story(ANSWER_ID, "UNAVAILABLE", "2026-10-27T15:41:00.000Z") as AnswerStory;
    const before = reads();
    await advance(301_000);
    await settle();
    expect(reads()).toBe(before + 1);
    await advance(900_000);
    await settle();
    expect(reads()).toBe(before + 1);
  });

  it("a newer answer version (after a dig) is waited for afresh, at the fast pace", async () => {
    const runId = crypto.randomUUID();
    // The main answer being rewritten keeps the page reading the answer every 15 s (dig-f1).
    harness.answer = seededAnswer(runId, { main_answer: { current: null, history: [], writing: true } });
    harness.story = writingStory();
    await mountMap(1600, runId);
    await advance(GAVE_UP_MS);
    await settle();
    harness.fresh = { ...harness.answer, answer_version: 2 };
    await advance(15_100);
    await settle();
    const before = reads();
    await advance(10_100);
    await settle();
    expect(reads()).toBe(before + 1);
    expect(harness.loadStory.mock.calls.at(-1)?.[2]).toBe(2);
  });
});

describe("kept where you were (map-f4)", () => {
  /** The served answer again, with its still-argued point on b2 settled (and, with `onlyB1`, b2 itself gone). */
  function settled(runId: string, onlyB1: boolean): Answer {
    const answer = structuredClone(servedAnswer(runId, {}, { main_answer: { current: null, history: [], writing: true } }));
    const agreed = answer.nodes.find((node) => node.node_id === "n-renew-cost")!.review;
    const storage = answer.nodes.find((node) => node.node_id === "n-renew-storage")!;
    (storage as { review: typeof agreed }).review = structuredClone(agreed);
    if (onlyB1) answer.branches = { ...answer.branches!, paths: [answer.branches!.paths[0]!], width: 1 };
    return AnswerSchema.parse(answer);
  }

  it("an open question that left the map gives way to its path, said once; with the path gone too, the question", async () => {
    const runId = crypto.randomUUID();
    harness.answer = servedAnswer(runId, {}, { main_answer: { current: null, history: [], writing: true } });
    harness.search = `?open=${encodeURIComponent("p:n-renew-storage")}`;
    await mountMap(1600, runId);
    expect(panel().classList.contains("v4Panel-open")).toBe(true);
    expect(page().querySelector("[data-moved]")).toBeNull();

    harness.fresh = settled(runId, false);
    await advance(15_100);
    await settle();
    expect(panel().classList.contains("v4Panel-path")).toBe(true);
    expect(cardButton("b2").getAttribute("aria-current")).toBe("true");
    const moved = page().querySelector("[data-moved]")!;
    expect(moved.getAttribute("role")).toBe("status");
    expect(flat(moved)).toBe(CATALOG["v4.paths.movedUp"]);

    harness.fresh = settled(runId, true);
    await advance(15_100);
    await settle();
    expect(panel().classList.contains("v4Panel-root")).toBe(true);
    expect(flat(page().querySelector("[data-moved]"))).toBe(CATALOG["v4.paths.movedUp"]);

    // The next selection the person makes puts the line away.
    await click(cardButton("b1"));
    expect(page().querySelector("[data-moved]")).toBeNull();
  });
});

describe("the phone during the wait (wait-d1 A, answer Q15)", () => {
  it("shows the question, the waiting card and \"Your paths\" as rows; the bar says the whole question's state, never a path's step", async () => {
    const runId = crypto.randomUUID();
    harness.run = runRead(runId);
    await mountMap(375, runId);
    expect(flat(panel().querySelector(".v4PanelH2"))).toBe(Q);
    expect(panel().querySelector("[data-wait-block]")).not.toBeNull();
    expect(flat(panel())).toContain(CATALOG["v4.paths.yourPaths"]);
    const rows = [...panel().querySelectorAll<HTMLElement>("[data-run-root] [data-path-card]")];
    expect(rows.map((row) => row.getAttribute("data-path-card"))).toEqual(["b1", "b2", "b3"]);
    rows.forEach((row, at) => {
      expect(row.classList.contains("v4PathCardCompact")).toBe(true);
      expect(flat(row)).toContain(TITLES[at]!);
      expect(flat(row.querySelector(".v4PathStep"))).toBe(CATALOG["v4.paths.step.ARGUING"]);
      expect(row.querySelector(".v4PathDotsBtn")).not.toBeNull();
    });
    // Each row keeps the 44px touch height (the card's own button).
    const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-map.css"), "utf8");
    expect(/\.v4PathCardMain \{[^}]*min-height: 44px/u.test(css)).toBe(true);
    const bar = page().querySelector<HTMLElement>(".v4DebPhoneBar")!;
    expect(buttonNamed(CATALOG["v4.debate.mapButton"]!, bar)).toBeTruthy();
    expect(flat(bar.querySelector("[data-bar-status]"))).toBe(CATALOG["v4.state.LOOKING"]);
    expect(flat(bar)).not.toContain(CATALOG["v4.paths.step.ARGUING"]);
    expect(page().querySelector(".v4ChoiceChips")).toBeNull();
    // Review of Tasks 60-62 (Task 61's RUN root): the question's own screen says nothing of an answer while the AIs work: no
    // answer section, no bar, no "Where to dig from here" and no dig button (they come with the main answer, which comes last).
    expect(flat(panel())).not.toContain(CATALOG["v4.panel.answerRoot"]);
    expect(flat(panel())).not.toContain(CATALOG["v4.panel.whereToDig"]);
    expect(flat(panel())).not.toContain(CATALOG["v4.panel.noOpenRoot"]);
    expect(panel().querySelector(".v4Bar")).toBeNull();
    expect(panel().querySelector(".v4PanelDigBtn")).toBeNull();

    await click(rows[0]!.querySelector<HTMLButtonElement>(".v4PathCardMain")!);
    expect(panel().classList.contains("v4Panel-path")).toBe(true);
    expect(flat(panel().querySelector(".v4PanelH2"))).toBe(T1);

    harness.run = runRead(runId, [1, 2, 3]);
    await advance(5_000);
    await settle();
    expect(flat(page().querySelector(".v4DebPhoneBar [data-bar-status]"))).toBe(CATALOG["v4.paths.writingAnswer"]);
  });
});
