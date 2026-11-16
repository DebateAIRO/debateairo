// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOCUS_GUARD_SETTLE_MS } from "../../apps/ui/lib/focusGuard.js";
import { RunProjectionSchema, type AnswerBranch, type PathOutcome, type RunProjection } from "../../packages/contract/src/index.js";
import { startFocusGuard } from "./kbd-guard-harness.js";
import { advance, harness, mountMap, page, resetHarness, settle, unmountMap, type MapWidth } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Keyboard audit round 4 (2026-11-12), B3: during the run, a path's quiet dots are a button of their own beside its card.
 * When the path is filled in while the dots button has the keyboard, the dots go, and focus goes to that path's own card,
 * on the tree and on the outline, never to the question's card at the top of the map. Made-up questions only.
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

function runRead(runId: string, filled: readonly number[] = []): RunProjection {
  return RunProjectionSchema.parse({
    run_ref: runId, question_line: LINE, state: "RUNNING", terminal_reason: null, hold_until: null,
    branches: {
      source: "MENU", width: 3, paths: [1, 2, 3].map((n) => branchOf(n, filled.includes(n))),
      more: [], also_raised: [], main_trust: null, carry_on_to_report: false
    },
    path_progress: [1, 2, 3].map((n) => (filled.includes(n)
      ? { path_id: `b${n}`, step: null, points: [], findings: [
        { node_ref: `${ROOTS[n - 1]!}`, text: `A made-up finding of path ${n}.`, trust: "SURE" }
      ] }
      : { path_id: `b${n}`, step: "ARGUING", points: ["PUT_FORWARD", "BEING_CHECKED", "CHECKED"], findings: [] }))
  });
}

describe.each([1600, 800] as const)("B3 at %ipx: a path fills in while its dots button has the keyboard", (width: MapWidth) => {
  it("focus goes to that path's own card", async () => {
    const runId = crypto.randomUUID();
    harness.run = runRead(runId);
    await mountMap(width, runId);
    const card = (): HTMLElement => page().querySelector<HTMLElement>(".v4DebMapCol [data-path-card='b2']")!;
    const dots = card().querySelector<HTMLElement>(".v4PathDotsBtn");
    expect(dots, "the path's dots are a button beside its card").not.toBeNull();
    act(() => dots!.focus());
    harness.run = runRead(runId, [2]);
    await advance(5_000);
    await settle();
    await advance(FOCUS_GUARD_SETTLE_MS + 20);
    await settle();
    expect(card().querySelector(".v4PathDotsBtn")).toBeNull();
    const now = document.activeElement as HTMLElement | null;
    expect(now?.className, `focus is on ${now?.getAttribute("data-row") ?? "?"}`).toContain("v4PathCardMain");
    expect(now).toBe(card().querySelector(".v4PathCardMain"));
  });
});
