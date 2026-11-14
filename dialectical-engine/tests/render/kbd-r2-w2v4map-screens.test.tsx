// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { FOCUS_GUARD_SETTLE_MS } from "../../apps/ui/lib/focusGuard.js";
// Types only from money.ts: a value import here would load its mock before the harness (the page would then get the real module).
import type { StoppedContinueOutcome } from "../../apps/ui/lib/v4/money.js";
import { START_UNDO_MS } from "../../apps/ui/lib/v4/startUndo.js";
import type { V4ResearchedPress } from "../../apps/ui/components/v4/V4Sources.js";
import type { RunProjection } from "../../packages/contract/src/index.js";
import { pressByKeyboard, startFocusGuard } from "./kbd-guard-harness.js";
import { advance, buttonNamed, CATALOG, harness, mountMap, page, resetHarness, settle, unmountMap } from "./v4-debate-harness.js";

const stopped = vi.hoisted(() => ({ press: undefined as unknown as Mock<(runId: string) => Promise<StoppedContinueOutcome>> }));
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
// The stopped page's own press, as tests/render/v4-failed-continue.test.tsx has it.
vi.mock("@/lib/v4/money", async (original) => ({
  ...(await import("./v4-debate-harness.js")).moneyMock(await original()),
  continueStopped: (runId: string) => stopped.press(runId)
}));

/*
 * Keyboard audit 2026-11-12, wave 2 (W2-V4MAP): the map page's presses and reads that swap what is under focus, with the site's
 * focus guard running (tests/render/kbd-guard-harness.ts). The page is the real one, with the stand-ins of v4-debate-harness.tsx;
 * the host stands for the layout's main area. Made-up questions only.
 *   V4B-F4  "Add to researched" switches itself off, then gives way to what became of the page.
 *   V4B-F6  "Continue where it stopped": the stopped screen gives way to the running debate; RUN_NOT_CONTINUABLE takes the button.
 *   V4B-F7  the R22 first card gives way to the map; Retry on "couldn't load" gives way to the outline, then the debate.
 */

let stopGuard: () => void = () => undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => ({ kind: "CONTINUING" }));
  stopGuard = startFocusGuard();
});

afterEach(async () => {
  stopGuard();
  await unmountMap();
  vi.useRealTimers();
});

/** The guard's wait, then the page's reads. */
async function guardWait(): Promise<void> {
  await advance(FOCUS_GUARD_SETTLE_MS + 20);
  await settle();
}

async function press(button: HTMLElement): Promise<void> {
  pressByKeyboard(button);
  await settle();
  await guardWait();
}

/** Focus arrives on `element` by Tab. */
function tabTo(element: HTMLElement): void {
  element.focus();
  element.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
}

async function mountAsMain(...args: Parameters<typeof mountMap>): Promise<string> {
  const runId = await mountMap(...args);
  page().id = "main-content";
  return runId;
}

const Q = "Should Brightwater ban cars from its old town on Sundays?\n\nWhere? Brightwater.";
const failedRun = (runId: string): RunProjection => ({ run_ref: runId, question_line: Q, state: "FAILED",
  terminal_reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", hold_until: null, quota_used: "SOME", continuable: true } as RunProjection);
const runningRun = (runId: string): RunProjection => ({ run_ref: runId, question_line: Q, state: "RUNNING", terminal_reason: null, hold_until: null } as RunProjection);
const CONTINUE = CATALOG["v4.failed.continue"]!;

describe("V4B-F4: \"Add to researched\"", () => {
  const PATH = "n-nuclear";
  const addButton = (): HTMLButtonElement | null => page().querySelector<HTMLButtonElement>(".v4DebPanelCol .v4OtherPageAdd");

  /** `keyMeanwhile`: the person presses a key while the button is switched off (they have moved on). */
  async function pressAdd(outcome: V4ResearchedPress, keyMeanwhile = false): Promise<HTMLLIElement> {
    let answer: (state: "READING" | "WAITS_FOR_RESET" | "TRY_AGAIN") => void = () => undefined;
    harness.addToResearched = vi.fn(() => new Promise((resolve) => { answer = resolve; }));
    await mountAsMain(1600, crypto.randomUUID(), PATH);
    const row = addButton()!.closest("li")!;
    await press(addButton()!);
    expect(addButton()!.disabled).toBe(true);
    if (keyMeanwhile) {
      act(() => { addButton()!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
      // A key during the wait: focus rests on the page's own row, never on the page.
      expect(document.activeElement).toBe(row);
    }
    answer(outcome as "READING");
    await settle();
    await guardWait();
    return row;
  }

  it("READING: the button gives way to the outcome line; focus is held on the page's own row", async () => {
    const row = await pressAdd("READING");
    expect(addButton()).toBeNull();
    expect(row.textContent).toContain(CATALOG["v4.web.researched.READING"]);
    expect(document.activeElement).toBe(row);
  });

  it("TRY_AGAIN: the button is back, and so is focus", async () => {
    await pressAdd("TRY_AGAIN");
    expect(addButton()!.disabled).toBe(false);
    expect(document.activeElement).toBe(addButton());
  });

  it("TRY_AGAIN after a key pressed during the wait: focus stays on the row, so a later Enter cannot add the page twice", async () => {
    const row = await pressAdd("TRY_AGAIN", true);
    expect(addButton()!.disabled).toBe(false);
    expect(document.activeElement).toBe(row);
  });
});

describe("V4B-F6: \"Continue where it stopped\"", () => {
  it("CONTINUING: the stopped screen gives way to the running debate; focus goes to its question", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId);
    stopped.press = vi.fn(async (): Promise<StoppedContinueOutcome> => {
      harness.run = runningRun(runId);
      return { kind: "CONTINUING" };
    });
    await mountAsMain(1600, runId);
    await press(buttonNamed(CONTINUE));
    await advance(START_UNDO_MS);
    await settle(10);
    await guardWait();
    expect(page().querySelector(".v4DebFailed")).toBeNull();
    expect(page().querySelector(".v4DebProgress")).not.toBeNull();
    expect(document.activeElement).toBe(page().querySelector(".v4DebFirstCard .v4DebStatusQuestion"));
  });

  it("RUN_NOT_CONTINUABLE: the button and its note go; focus is held where they were, right before \"Ask this again\"", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId);
    stopped.press = vi.fn(async (): Promise<StoppedContinueOutcome> => ({ kind: "NOT_CONTINUABLE" }));
    await mountAsMain(1600, runId);
    await press(buttonNamed(CONTINUE));
    await advance(START_UNDO_MS);
    await settle(10);
    await guardWait();
    expect(page().querySelector(".v4DebFailedContinue")).toBeNull();
    const again = page().querySelector<HTMLElement>(".v4DebFailedAgain")!;
    expect(document.activeElement).toBe(again);
    expect(again.querySelector("a")!.textContent).toBe(CATALOG["v4.debate.askAgain"]);
  });
});

describe("V4B-F7: the screens before the map", () => {
  it("the R22 first card gives way to the map while focus is on its pause block's Continue: focus goes to the map's question card", async () => {
    // The R22 first card's waiting card draws no Try now and no back link; the month pause's Continue is its one control.
    const runId = crypto.randomUUID();
    harness.run = { ...runningRun(runId), month_pause: { until: "2026-12-01T00:00:00.000Z", can_continue: true } } as RunProjection;
    await mountAsMain(1600, runId);
    expect(page().querySelectorAll(".v4DebFirstCard button, .v4DebFirstCard a")).toHaveLength(1);
    tabTo(page().querySelector<HTMLElement>(".v4DebFirstCard button")!);
    harness.run = null;
    await advance(5_000);
    await settle();
    await guardWait();
    expect(page().querySelector(".v4DebFirstCard")).toBeNull();
    expect(document.activeElement).toBe(page().querySelector(".v4DebMapCol .v4MapRoot"));
  });

  it("Retry on \"couldn't load\": the screen gives way to the outline, then to the debate; focus goes to the map's question card", async () => {
    harness.loadError = new Error("made-up network fault");
    await mountAsMain(1600);
    harness.loadError = null;
    await press(buttonNamed(CATALOG["v4.common.retry"]!));
    expect(page().querySelector(".v4DebMapCol")).not.toBeNull();
    expect(document.activeElement).toBe(page().querySelector(".v4DebMapCol .v4MapRoot"));
  });
});

