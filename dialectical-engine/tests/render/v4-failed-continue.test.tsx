// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { V4FailedScreen } from "../../apps/ui/components/v4/V4FailedScreen.js";
// Types only from money.ts: a value import here would load its mock before the harness (the page would then get the real module).
import type { StoppedContinueOutcome } from "../../apps/ui/lib/v4/money.js";
import { handOffContinue } from "../../apps/ui/lib/v4/failedRun.js";
import { START_UNDO_MS } from "../../apps/ui/lib/v4/startUndo.js";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import type { RunProjection } from "../../packages/contract/src/index.js";
import { advance, buttonNamed, buttonsNamed, CATALOG, click, harness, mountMap, page, resetHarness, settle, text, unmountMap } from "./v4-debate-harness.js";

const stopped = vi.hoisted(() => ({ press: undefined as unknown as Mock<(runId: string) => Promise<StoppedContinueOutcome>> }));
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
// The month pause's Continue is the harness's; the stopped page's own press is this file's (the same route, read with its two refusals).
vi.mock("@/lib/v4/money", async (original) => ({
  ...(await import("./v4-debate-harness.js")).moneyMock(await original()),
  continueStopped: (runId: string) => stopped.press(runId)
}));

/*
 * V4 start step, Task 57g (the owner's 7 Nov answers: "continue where it broke, and not charge the customer again"; his card "Button on
 * the stopped page"): the page of a question that did not finish offers "Continue where it stopped" when the server says it can
 * (`continuable`), continuing the SAME debate on the same page after the site's 10-second Undo, as Start's. Beside it "Ask this again" says
 * "Change the question" (the same link). The line under the button ("What already ran is kept. Continuing pays only for what has not run
 * yet.") shows only when some quota was used; with none, only "Nothing was taken for the failed try." (never both). Without `continuable`
 * the screen is as before. Every question here is made up.
 */

const HOME = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/home.json"), "utf8")) as Record<string, string>;
const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const OURS = "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED";
const CONTINUE = "Continue where it stopped";
const CHANGE = "Change the question";
const LINE = "What already ran is kept. Continuing pays only for what has not run yet.";

function failedRun(runId: string, extra: Record<string, unknown> = {}, reason = OURS): RunProjection {
  return { run_ref: runId, question_line: "Should Brightwater ban cars from its old town on Sundays?\n\nWhere? Brightwater.", state: "FAILED",
    terminal_reason: reason, hold_until: null, ...extra } as RunProjection;
}

function runningRun(runId: string): RunProjection {
  return { run_ref: runId, question_line: "Should Brightwater ban cars from its old town on Sundays?\n\nWhere? Brightwater.", state: "RUNNING",
    terminal_reason: null, hold_until: null } as RunProjection;
}

function linkHref(name: string): string | null {
  return [...page().querySelectorAll("a")].find((link) => link.textContent?.trim() === name)?.getAttribute("href") ?? null;
}

const continueButton = (): HTMLButtonElement => buttonNamed(CONTINUE);

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => ({ kind: "CONTINUING" }));
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("the stopped page's words (Task 57g)", () => {
  it("drafts the three new lines in the catalogue", () => {
    expect(CATALOG["v4.failed.continue"]).toBe(CONTINUE);
    expect(CATALOG["v4.failed.changeQuestion"]).toBe(CHANGE);
    expect(CATALOG["v4.failed.continueLine"]).toBe(LINE);
  });

  it("continuable, some quota used: the primary button, its line, and 'Change the question' (the same link)", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    await mountMap(1600, runId);
    expect(buttonsNamed(CONTINUE)).toHaveLength(1);
    expect(continueButton().className).toContain("v4BtnPrimary");
    expect(text()).toContain(LINE);
    expect(text()).toContain(CATALOG["v4.debate.failedSomeTaken"]);
    expect(linkHref(CHANGE)).toBe(`/v4?again=${runId}`);
    expect(linkHref(CATALOG["v4.debate.askAgain"]!)).toBeNull();
    // Beside the primary button, "Change the question" is the plain one.
    const change = [...page().querySelectorAll("a")].find((link) => link.textContent?.trim() === CHANGE)!;
    expect(change.className).not.toContain("v4BtnPrimary");
    expect(stopped.press).not.toHaveBeenCalled();
  });

  it("continuable, nothing used: the button, and only 'Nothing was taken for the failed try.' (never both lines)", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "NONE", continuable: true });
    await mountMap(1600, runId);
    expect(buttonsNamed(CONTINUE)).toHaveLength(1);
    expect(text()).toContain(CATALOG["v4.debate.failedNothingTaken"]);
    expect(text()).not.toContain(LINE);
  });

  it("not continuable: today's screen ('Ask this again', its grey line, no button, no line)", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME" }, "RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED");
    await mountMap(1600, runId);
    expect(buttonsNamed(CONTINUE)).toHaveLength(0);
    expect(linkHref(CATALOG["v4.debate.askAgain"]!)).toBe(`/v4?again=${runId}`);
    expect(linkHref(CHANGE)).toBeNull();
    expect(text()).toContain(CATALOG["v4.debate.askAgainNoteQuestion"]);
    expect(text()).not.toContain(LINE);
  });

  it("a dig's own page offers no Continue yet (the owner's open question on a dig's try): as before", async () => {
    const runId = crypto.randomUUID();
    const parent = crypto.randomUUID();
    harness.records = { parent: { parent_run_id: parent, child_run_id: runId, places: ["path:n-mix"], mode: "quick", created_at: "2026-10-29T10:05:00.000Z" }, children: [] };
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    await mountMap(1600, runId);
    expect(buttonsNamed(CONTINUE)).toHaveLength(0);
    expect(text()).not.toContain(LINE);
  });

  it("V4FailedScreen without onContinue is the same markup as before, whatever note it is handed", async () => {
    const run = failedRun("7b000000-0000-4000-8000-000000000001", { quota_used: "SOME", continuable: true });
    const base = { run, askAgainHref: "/v4?again=7b000000-0000-4000-8000-000000000001", askHref: "/v4", dig: null, catalog: CATALOG, homeCatalog: HOME };
    const before = await draw(<V4FailedScreen {...base} />);
    const handed = await draw(<V4FailedScreen {...base} continueNote={<p>made-up note</p>} />);
    expect(handed).toBe(before);
    expect(before).not.toContain(CONTINUE);
    expect(before).toContain(word("v4.debate.askAgain"));
  });
});

describe("the press: the shared 10-second Undo, then one Continue (Task 57g)", () => {
  it("shows Start's Undo note and sends nothing for 10 seconds; Undo sends nothing, ever", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    await mountMap(1600, runId);
    await click(continueButton());
    const note = page().querySelector(".v4Undo-counting");
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain(CATALOG["v4.start.undo.noteNoShare"]);
    // Focus moves to Undo, as with Start's note.
    expect(document.activeElement?.textContent).toBe(CATALOG["v4.start.undo"]);
    await advance(START_UNDO_MS - 50);
    expect(stopped.press).not.toHaveBeenCalled();
    await click(buttonNamed(CATALOG["v4.start.undo"]!));
    expect(text()).toContain(CATALOG["v4.start.undo.done"]);
    await advance(START_UNDO_MS * 2);
    expect(stopped.press).not.toHaveBeenCalled();
    // Nothing went away: the stopped page and its button stay, and no address changed.
    expect(buttonsNamed(CONTINUE)).toHaveLength(1);
    expect(window.location.pathname).toBe(`/v4/debate/${runId}`);
  });

  it("after the window: one POST continue, then the running debate on the same page", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => {
      harness.run = runningRun(runId);
      return { kind: "CONTINUING" };
    });
    await mountMap(1600, runId);
    await click(continueButton());
    // A second press while it waits does nothing.
    await click(continueButton());
    await advance(START_UNDO_MS);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(1);
    expect(stopped.press).toHaveBeenCalledWith(runId);
    expect(page().querySelector(".v4DebFailed")).toBeNull();
    expect(page().querySelector(".v4DebProgress")).not.toBeNull();
    expect(window.location.pathname).toBe(`/v4/debate/${runId}`);
  });

  it("RUN_NOT_CONTINUABLE: the stopped page stays and the button goes (the debate is read again)", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => ({ kind: "NOT_CONTINUABLE" }));
    await mountMap(1600, runId);
    await click(continueButton());
    await advance(START_UNDO_MS);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(1);
    expect(page().querySelector(".v4DebFailed")).not.toBeNull();
    expect(buttonsNamed(CONTINUE)).toHaveLength(0);
    expect(linkHref(CATALOG["v4.debate.askAgain"]!)).toBe(`/v4?again=${runId}`);
  });

  it("no room left for the rest: the usual quota words, and the button stays", async () => {
    const runId = crypto.randomUUID();
    const room = { room: "FULL", scope: "PERSON_DAY", resets_at: "2026-11-08T08:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS",
      new_starts: "BLOCKED_UNTIL_RESET" } as unknown as AskRoom;
    harness.room = room;
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => ({ kind: "NO_ROOM" }));
    await mountMap(1600, runId);
    await click(continueButton());
    await advance(START_UNDO_MS);
    await settle(10);
    const { limitLine } = await vi.importActual<typeof import("../../apps/ui/lib/v4/money.js")>("../../apps/ui/lib/v4/money.js");
    const line = limitLine(room, "en")!;
    expect(text()).toContain(word(line.key, line.values));
    expect(buttonsNamed(CONTINUE)).toHaveLength(1);
  });

  it("a press that fails says so, and the button can be pressed again", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => ({ kind: "FAILED" }));
    await mountMap(1600, runId);
    await click(continueButton());
    await advance(START_UNDO_MS);
    await settle(10);
    expect(text()).toContain(CATALOG["v4.money.continueFailed"]);
    await click(continueButton());
    expect(page().querySelector(".v4Undo-counting")).not.toBeNull();
    await advance(START_UNDO_MS);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(2);
  });

  it("arriving from 'Change the question' with the words unchanged: the same Continue starts at once, with its Undo, once", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    handOffContinue(runId, Date.now());
    await mountMap(1600, runId);
    expect(page().querySelector(".v4Undo-counting")).not.toBeNull();
    expect(stopped.press).not.toHaveBeenCalled();
    await advance(START_UNDO_MS);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(1);
    expect(stopped.press).toHaveBeenCalledWith(runId);
    // The hand-off is used up: the page opened again starts nothing by itself.
    await unmountMap();
    await mountMap(1600, runId);
    expect(page().querySelector(".v4Undo-counting")).toBeNull();
  });

  it("a hand-off for a debate that cannot continue starts nothing, and is dropped", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME" });
    handOffContinue(runId, Date.now());
    await mountMap(1600, runId);
    expect(page().querySelector(".v4Undo")).toBeNull();
    await unmountMap();
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    await mountMap(1600, runId);
    expect(page().querySelector(".v4Undo")).toBeNull();
    await advance(START_UNDO_MS);
    expect(stopped.press).not.toHaveBeenCalled();
  });
});

describe("the route's answers, as the page reads them (Task 57g; apps/ui/lib/v4/money.ts)", () => {
  type Money = typeof import("../../apps/ui/lib/v4/money.js");
  const client = (answer: unknown) => ({ continueRun: async () => answer }) as never;
  const RUN = "7c000000-0000-4000-8000-000000000001";

  it("continueStopped names the failed debate's two refusals; anything else it cannot use is FAILED", async () => {
    const real = await vi.importActual<Money>("../../apps/ui/lib/v4/money.js");
    expect(await real.continueStopped(RUN, client({ state: "CONTINUING" }))).toEqual({ kind: "CONTINUING" });
    expect(await real.continueStopped(RUN, client({ error: "RUN_NOT_CONTINUABLE", message: "RUN_NOT_CONTINUABLE" }))).toEqual({ kind: "NOT_CONTINUABLE" });
    expect(await real.continueStopped(RUN, client({ error: "RUN_CONTINUE_NO_ROOM", message: "RUN_CONTINUE_NO_ROOM" }))).toEqual({ kind: "NO_ROOM" });
    expect(await real.continueStopped(RUN, { continueRun: async () => { throw new Error("503 RUN_CONTINUE_TRY_AGAIN"); } } as never)).toEqual({ kind: "FAILED" });
  });

  it("the month pause's Continue reads exactly as before (the two new refusals never reach it, and would read as FAILED)", async () => {
    const real = await vi.importActual<Money>("../../apps/ui/lib/v4/money.js");
    const until = "2026-12-01T00:00:00.000Z";
    expect(await real.continueRun(RUN, client({ state: "CONTINUING" }))).toEqual({ kind: "CONTINUING" });
    expect(await real.continueRun(RUN, client({ error: "RUN_PAUSED_UNTIL_RESET", message: "RUN_PAUSED_UNTIL_RESET", until }))).toEqual({ kind: "TOO_EARLY", until });
    expect(await real.continueRun(RUN, client({ error: "RUN_NOT_CONTINUABLE", message: "RUN_NOT_CONTINUABLE" }))).toEqual({ kind: "FAILED" });
    expect(await real.continueRun(RUN, client({ error: "RUN_CONTINUE_NO_ROOM", message: "RUN_CONTINUE_NO_ROOM" }))).toEqual({ kind: "FAILED" });
  });
});

async function draw(node: ReactNode): Promise<string> {
  const box = document.body.appendChild(document.createElement("div"));
  const root = createRoot(box);
  await act(async () => root.render(node));
  const html = box.innerHTML;
  await act(async () => root.unmount());
  box.remove();
  return html;
}
