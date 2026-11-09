// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
// Types only from money.ts: a value import here would load its mock before the harness (the page would then get the real module).
import type { StoppedContinueOutcome } from "../../apps/ui/lib/v4/money.js";
import { digQuestion } from "../../apps/ui/lib/v4/askText.js";
import { DIG_UNDO_MS } from "../../apps/ui/lib/v4/digUndo.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import {
  advance, branch, buttonNamed, buttonsNamed, CATALOG, click, harness, mountMap, page, panel, PATHS, resetHarness, seededAnswer, seededStory,
  settle, unmountMap
} from "./v4-debate-harness.js";

const stopped = vi.hoisted(() => ({ press: undefined as unknown as Mock<(runId: string) => Promise<StoppedContinueOutcome>> }));
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
// The month pause's Continue is the harness's; the failed dig's own Continue is this file's (the same route, read with its two refusals).
vi.mock("@/lib/v4/money", async (original) => ({
  ...(await import("./v4-debate-harness.js")).moneyMock(await original()),
  continueStopped: (runId: string) => stopped.press(runId)
}));

/*
 * V4 start step, Task 57i (the owner's answer of 7 Nov afternoon, his card "Continue the same dig (Recommended)": "Same as the new debate
 * button: what the first try finished is kept, the person pays only for what never ran, and anything we must redo is on us"). On the map, a
 * failed dig whose own run read says `continuable` is tried again by continuing THAT dig: "Try this dig again" (the same words) waits out the
 * same 10-second dig Undo, then one POST /v1/runs/{digRunId}/continue; no new ask and no new dig; the dig keeps its place and id on the map
 * and shows as running again. The API's refusals: not continuable (the dig is read again and the panel offers today's fresh dig), no room
 * (the usual quota words), anything else (the dig's own "couldn't start" line, and the button can be pressed again). A dig that cannot
 * continue still queues today's fresh dig. Every question here is made up.
 */

const STOP = "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED";

function recordDig(runId: string, childRunId: string, places: readonly string[], mode: "quick" | "thorough" = "thorough"): void {
  harness.records = {
    parent: null,
    children: [...harness.records.children, { parent_run_id: runId, child_run_id: childRunId, places: [...places], mode, created_at: "2026-11-07T10:05:00.000Z" }]
  };
}

function pathDigQuestion(runId: string, pathId: string): string {
  const answer = seededAnswer(runId);
  const map = buildV4Map({ runId, answer, story: seededStory() });
  return digQuestion({ kind: "path", path: map.paths.find((path) => path.id === pathId)! }, answer.question_line, CATALOG, "en");
}

function failedDig(link: DigLink, extra: Partial<DigView> = {}): DigView {
  return { link, state: "FAILED", headline: null, counts: null, terminalReason: STOP, ...extra };
}

function runningDig(link: DigLink): DigView {
  return { link, state: "RUNNING", headline: null, counts: null };
}

async function openDig(index: number): Promise<void> {
  await click(branch(index).querySelector<HTMLButtonElement>(".v4MapDig")!);
}

/** A map with one failed dig of the whole path "mix"; `continuable`: what its own run read says. Its run id. */
async function mountFailedDig(continuable: boolean): Promise<Readonly<{ runId: string; child: string }>> {
  const runId = crypto.randomUUID();
  const child = crypto.randomUUID();
  recordDig(runId, child, ["path:n-mix"], "thorough");
  harness.digView = (link) => failedDig(link, { questionLine: pathDigQuestion(runId, "n-mix"), ...(continuable ? { continuable: true as const } : {}) });
  await mountMap(1600, runId);
  await openDig(PATHS.mix);
  return { runId, child };
}

const retryButton = (): HTMLButtonElement => buttonNamed(CATALOG["v4.digFailed.retry"]!, panel());

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => ({ kind: "CONTINUING" }));
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("a failed dig that can continue: 'Try this dig again' continues the same dig (Task 57i)", () => {
  it("keeps the words; nothing during the Undo; then exactly one continue for the dig's own run, no new ask; it runs again in place", async () => {
    const { child } = await mountFailedDig(true);
    stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => {
      harness.digView = (link) => runningDig(link);
      return { kind: "CONTINUING" };
    });
    expect(retryButton().textContent).toBe("Try this dig again");
    await click(retryButton());
    // The same dig Undo note as any dig.
    expect(page().querySelector(".v4Undo-counting")!.textContent).toContain(CATALOG["v4.dig.undo"]);
    // A second press while it waits does nothing.
    await click(retryButton());
    await advance(DIG_UNDO_MS - 500);
    expect(stopped.press).not.toHaveBeenCalled();
    await advance(600);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(1);
    expect(stopped.press).toHaveBeenCalledWith(child);
    expect(harness.submit).not.toHaveBeenCalled();
    // The same dig, at the same place, running again: one card there, and its panel says it is being dug.
    const cards = branch(PATHS.mix).querySelectorAll(".v4MapDig");
    expect(cards).toHaveLength(1);
    expect(cards[0]!.className).toContain("v4MapDigRUNNING");
    expect(panel().textContent).toContain(CATALOG["v4.rewrite.digCard.RUNNING"]);
    expect(panel().textContent).not.toContain(CATALOG["v4.panel.digState.FAILED"]);
    expect(buttonsNamed(CATALOG["v4.digFailed.retry"]!, panel())).toEqual([]);
  });

  it("Undo sends nothing", async () => {
    await mountFailedDig(true);
    await click(retryButton());
    await click(page().querySelector<HTMLButtonElement>(`button[aria-label="${CATALOG["v4.dig.undoLabel"]!}"]`)!);
    await advance(DIG_UNDO_MS * 2);
    expect(stopped.press).not.toHaveBeenCalled();
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("RUN_NOT_CONTINUABLE: the dig is read again and the panel falls back to today's fresh dig", async () => {
    const { runId } = await mountFailedDig(true);
    stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => {
      // The read again says it can no longer continue.
      harness.digView = (link) => failedDig(link, { questionLine: pathDigQuestion(runId, "n-mix") });
      return { kind: "NOT_CONTINUABLE" };
    });
    await click(retryButton());
    await advance(DIG_UNDO_MS);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(1);
    expect(harness.submit).not.toHaveBeenCalled();
    // The same words; this press digs afresh, as today.
    await click(retryButton());
    await advance(DIG_UNDO_MS);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(1);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.submit.mock.calls[0]![2]).toBe("dig");
  });

  it("RUN_NOT_CONTINUABLE with a stale read that still says continuable: the press still digs afresh", async () => {
    await mountFailedDig(true);
    stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => ({ kind: "NOT_CONTINUABLE" }));
    await click(retryButton());
    await advance(DIG_UNDO_MS);
    await settle(10);
    await click(retryButton());
    await advance(DIG_UNDO_MS);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(1);
    expect(harness.submit).toHaveBeenCalledTimes(1);
  });

  it("no room left for the rest: the usual quota words; nothing else changes", async () => {
    harness.room = { room: "FULL", scope: "PERSON_DAY", resets_at: "2026-11-08T08:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS",
      new_starts: "BLOCKED_UNTIL_RESET" } as unknown as AskRoom;
    await mountFailedDig(true);
    stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => ({ kind: "NO_ROOM" }));
    await click(retryButton());
    await advance(DIG_UNDO_MS);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(1);
    expect(page().textContent).toContain(CATALOG["v4.money.startsWait.PERSON_DAY"]!.split("{")[0]!.trim());
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("anything else: the dig's 'couldn't start' line, and the button can be pressed again", async () => {
    await mountFailedDig(true);
    stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => ({ kind: "FAILED" }));
    await click(retryButton());
    await advance(DIG_UNDO_MS);
    await settle(10);
    expect(page().textContent).toContain(CATALOG["v4.dig.failed"]);
    await click(retryButton());
    await advance(DIG_UNDO_MS);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(2);
    expect(harness.submit).not.toHaveBeenCalled();
  });
});

describe("a failed dig that cannot continue: today's fresh 'Try this dig again', unchanged (Task 57i)", () => {
  it("queues a new dig of the same picks after the Undo, and never continues", async () => {
    const { runId } = await mountFailedDig(false);
    await click(retryButton());
    await advance(DIG_UNDO_MS);
    await settle(10);
    expect(stopped.press).not.toHaveBeenCalled();
    expect(harness.submit).toHaveBeenCalledTimes(1);
    const [question, mode, origin, parent] = harness.submit.mock.calls[0]!;
    expect([question, mode, origin]).toEqual([pathDigQuestion(runId, "n-mix"), "thorough", "dig"]);
    expect(parent).toEqual({ parent_run_id: runId, places: ["path:n-mix"], mode: "thorough" });
  });
});

/*
 * V4 start step, Task 57m (the owner's 8 Nov words: "if it keeps failing we shouldn't tell the user that it can continue, because he clearly
 * cannot. We should stop after 2 continues that fail, and say that we're investigating this and a future fix will solve this. Of course we
 * should let him Write the report if he wants"; "Use these drafts"): after two continues of the dig that failed again, its read says
 * `keeps_failing`. The panel then offers no button at all (no Continue, no fresh dig), says the drafted line, and "Write my report" stays.
 */
const KEEPS_FAILING_DIG =
  "This keeps failing. We're looking into it, and a future fix will solve it. You can still write your report; it uses everything that finished.";

describe("a failed dig that keeps failing after two continues (Task 57m)", () => {
  it("drafts the dig's line in the catalogue", () => {
    expect(CATALOG["v4.digFailed.keepsFailingContinues"]).toBe(KEEPS_FAILING_DIG);
  });

  it("no button, the reason and the drafted line (never today's 'keeps failing' line); 'Write my report' stays", async () => {
    const runId = crypto.randomUUID();
    recordDig(runId, crypto.randomUUID(), ["path:n-mix"], "thorough");
    harness.digView = (link) => failedDig(link, { questionLine: pathDigQuestion(runId, "n-mix"), keepsFailing: true });
    await mountMap(1600, runId);
    await openDig(PATHS.mix);
    const lines = [...panel().querySelectorAll(".v4DigFailed p")].map((line) => line.textContent).join(" | ");
    expect(lines).toBe(`${CATALOG["v4.digFailed.reason.STOPPED"]!} | ${KEEPS_FAILING_DIG}`);
    expect(buttonsNamed(CATALOG["v4.digFailed.retry"]!, panel())).toEqual([]);
    expect(panel().textContent).not.toContain(CATALOG["v4.digFailed.keepsFailing"]);
    const report = [...page().querySelectorAll<HTMLAnchorElement>("a")].filter((link) => link.textContent?.trim() === CATALOG["v4.rail.writeReport"]);
    expect(report.length).toBeGreaterThan(0);
    expect(report[0]!.getAttribute("href")).toMatch(new RegExp(`^/v4/debate/${runId}/report`, "u"));
    expect(stopped.press).not.toHaveBeenCalled();
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("a continue refused because it keeps failing: the dig is read again and the panel then says so, with no button", async () => {
    const { runId } = await mountFailedDig(true);
    stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => {
      harness.digView = (link) => failedDig(link, { questionLine: pathDigQuestion(runId, "n-mix"), keepsFailing: true });
      return { kind: "NOT_CONTINUABLE" };
    });
    await click(retryButton());
    await advance(DIG_UNDO_MS);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(1);
    expect(panel().textContent).toContain(KEEPS_FAILING_DIG);
    expect(buttonsNamed(CATALOG["v4.digFailed.retry"]!, panel())).toEqual([]);
    expect(harness.submit).not.toHaveBeenCalled();
  });
});
