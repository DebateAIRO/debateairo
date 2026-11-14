// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOCUS_GUARD_SETTLE_MS } from "../../apps/ui/lib/focusGuard.js";
import {
  AnswerSchema, RunProjectionSchema, type Answer, type AnswerBranch, type AnswerBranches, type PathOutcome, type RunProjection
} from "../../packages/contract/src/index.js";
import { startFocusGuard } from "./kbd-guard-harness.js";
import { advance, harness, mountMap, page, resetHarness, seededAnswer, settle, unmountMap, type MapWidth } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Keyboard audit round 4 (2026-11-12), B2: on a phone, the waiting card's "Your paths" list goes when the debate finishes,
 * and the same paths come back as the question screen's path rows. When focus was on a path of the old list, it goes to the
 * same path's row in the new one, never parked on the whole panel. Made-up questions only.
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

const Q = "Should Romania build new nuclear plants?";
const LINE = `${Q}\n\nLooking at Romania. Up to 2050.`;
const TITLES = ["Keeping the lights on in a calm winter week", "Calm winter week", "Security and weapons risks"] as const;
const ROOTS = ["n-mix", "n-renew", "n-nuclear"] as const;

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

function branchesOf(filled: readonly number[]): AnswerBranches {
  return {
    source: "MENU", width: 3, paths: [1, 2, 3].map((n) => branchOf(n, filled.includes(n))),
    more: [], also_raised: [], main_trust: filled.length === 3 ? "SURE" : null, carry_on_to_report: false
  };
}

function runRead(runId: string): RunProjection {
  return RunProjectionSchema.parse({
    run_ref: runId, question_line: LINE, state: "RUNNING", terminal_reason: null, hold_until: null, branches: branchesOf([]),
    path_progress: [1, 2, 3].map((n) => ({ path_id: `b${n}`, step: "ARGUING", points: ["PUT_FORWARD"], findings: [] }))
  });
}

const servedAnswer = (runId: string): Answer =>
  AnswerSchema.parse({ ...seededAnswer(runId), question_line: LINE, branches: branchesOf([1, 2, 3]) });

async function runEnds(runId: string): Promise<void> {
  harness.run = null;
  harness.answer = servedAnswer(runId);
  await advance(5_000);
  await settle();
  await advance(FOCUS_GUARD_SETTLE_MS + 20);
  await settle();
}

describe("B2: the debate finishes while focus is on a path of the phone's waiting card", () => {
  it("at 375px focus goes to the same path's row in the question screen's list", async () => {
    const runId = crypto.randomUUID();
    harness.run = runRead(runId);
    await mountMap(375, runId);
    const old = page().querySelector<HTMLElement>(".v4RunPhonePaths [data-path-card='b2'] .v4PathCardMain");
    expect(old, "the waiting card lists the paths on a phone").not.toBeNull();
    act(() => old!.focus());
    await runEnds(runId);
    expect(page().querySelector(".v4RunPhonePaths")).toBeNull();
    const row = page().querySelector<HTMLElement>(".v4PathList [data-path='b2']");
    expect(row, "the new list's row of the same path can be found").not.toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("at 375px, the debate finishes while the person is in another window: the path is not forgotten (round 4 review)", async () => {
    const runId = crypto.randomUUID();
    harness.run = runRead(runId);
    await mountMap(375, runId);
    const old = page().querySelector<HTMLElement>(".v4RunPhonePaths [data-path-card='b2'] .v4PathCardMain")!;
    act(() => old.focus());
    // Another window takes focus: the browser blurs the card, naming nothing it went to.
    const windowFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    act(() => { old.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null })); });
    await advance(10);
    await runEnds(runId);
    windowFocus.mockReturnValue(true);
    const row = page().querySelector<HTMLElement>(".v4PathList [data-path='b2']");
    expect(document.activeElement).toBe(row);
  });

  it("at 375px, focus elsewhere (the header's skip target) is not moved to the list", async () => {
    const runId = crypto.randomUUID();
    harness.run = runRead(runId);
    await mountMap(375, runId);
    const old = page().querySelector<HTMLElement>(".v4RunPhonePaths [data-path-card='b2'] .v4PathCardMain")!;
    act(() => old.focus());
    const outside = document.createElement("button");
    document.body.append(outside);
    act(() => outside.focus());
    await runEnds(runId);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it.each([800, 1600] as const)("at %ipx the same card keeps focus, as before", async (width: MapWidth) => {
    const runId = crypto.randomUUID();
    harness.run = runRead(runId);
    await mountMap(width, runId);
    const cardButton = (): HTMLElement => page().querySelector<HTMLElement>("[data-path-card='b2'] .v4PathCardMain")!;
    const before = cardButton();
    act(() => before.focus());
    await runEnds(runId);
    expect(document.activeElement).toBe(cardButton());
  });
});
