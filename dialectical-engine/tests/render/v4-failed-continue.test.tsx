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

/*
 * Owner 7 Nov, question 41 A ("say both ways"; OPEN-OWNER-QUESTIONS-2026-11-04.md, sixth round), word for word: when "Continue where it
 * stopped" is offered, the grey line under "Change the question" says what each way does. Without Continue it is as before.
 */
const BOTH_WAYS =
  "Your question is kept. Change it and it becomes a new question, which uses a little of your quota. Leave it as it is and this debate continues where it stopped.";
const BOTH_WAYS_PICKS =
  "Your question and your picks are kept. Change it and it becomes a new question, which uses a little of your quota. Leave it as it is and this debate continues where it stopped.";

describe("the owner's question 41 A (7 Nov): the grey line under 'Change the question' says both ways", () => {
  it("a debate that can continue: the question's line right under 'Change the question', never the old one", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    await mountMap(1600, runId);
    const change = [...page().querySelectorAll("a")].find((link) => link.textContent?.trim() === CHANGE)!;
    expect(change.nextElementSibling?.textContent).toBe(BOTH_WAYS);
    expect(text()).not.toContain(CATALOG["v4.debate.askAgainNoteQuestion"]);
    expect(text()).not.toContain(CATALOG["v4.debate.askAgainNote"]);
  });

  it("with Continue and the picks kept: the picks' line", async () => {
    const run = failedRun("7b000000-0000-4000-8000-000000000002", { quota_used: "SOME", continuable: true });
    const base = { run, askAgainHref: "/v4?again=7b000000-0000-4000-8000-000000000002", askHref: "/v4", dig: null, catalog: CATALOG, homeCatalog: HOME };
    const withPicks = await draw(<V4FailedScreen {...base} onContinue={() => undefined} picksKept />);
    expect(withPicks).toContain(BOTH_WAYS_PICKS);
    expect(withPicks).not.toContain(CATALOG["v4.debate.askAgainNote"]);
    const questionOnly = await draw(<V4FailedScreen {...base} onContinue={() => undefined} />);
    expect(questionOnly).toContain(BOTH_WAYS);
    expect(questionOnly).not.toContain(BOTH_WAYS_PICKS);
  });

  it("without Continue: both old lines as they were", async () => {
    const run = failedRun("7b000000-0000-4000-8000-000000000003", { quota_used: "SOME" });
    const base = { run, askAgainHref: "/v4?again=7b000000-0000-4000-8000-000000000003", askHref: "/v4", dig: null, catalog: CATALOG, homeCatalog: HOME };
    const withPicks = await draw(<V4FailedScreen {...base} picksKept />);
    expect(withPicks).toContain(CATALOG["v4.debate.askAgainNote"]);
    expect(withPicks).not.toContain(BOTH_WAYS_PICKS);
    const questionOnly = await draw(<V4FailedScreen {...base} />);
    expect(questionOnly).toContain(CATALOG["v4.debate.askAgainNoteQuestion"]);
    expect(questionOnly).not.toContain(BOTH_WAYS);
  });
});

/*
 * Owner 7 Nov, question 42 A (relayed by the review session): with "Continue where it stopped" offered, the reason sentence above it drops
 * its "ask again" ending (STOPPED: the owner's words; the others drafted, new V4 lines). Without Continue the shared sentence is as before.
 */
describe("the owner's question 42 A (7 Nov): with Continue offered, the reason drops its 'ask again' ending", () => {
  const STOPPED_CUT = "This debate stopped partway because of a problem on our side.";

  it("a debate that can continue: the STOPPED sentence ends before 'Please ask your question again.'", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    await mountMap(1600, runId);
    expect(text()).toContain(STOPPED_CUT);
    expect(text()).not.toContain(HOME["runFailure.STOPPED"]);
    expect(text()).not.toMatch(/ask (your question )?again\./iu);
  });

  it("not continuable: the shared STOPPED sentence, whole", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME" });
    await mountMap(1600, runId);
    expect(text()).toContain(HOME["runFailure.STOPPED"]);
  });

  it("the other reasons: NOT_STARTED and SET_ASIDE are cut the same way; a reason with no 'ask again' ending is as before", async () => {
    const screen = async (reason: string, quotaUsed: string) => {
      const run = failedRun("7b000000-0000-4000-8000-000000000004", { quota_used: quotaUsed, continuable: true }, reason);
      return draw(<V4FailedScreen run={run} askAgainHref="/v4?again=7b000000-0000-4000-8000-000000000004" askHref="/v4" dig={null}
        onContinue={() => undefined} catalog={CATALOG} homeCatalog={HOME} />);
    };
    const notStarted = await screen("RUNNER_EXECUTION_FAILED:RUN_ROLE_ASSIGNMENT_INVALID", "NONE");
    expect(notStarted).toContain(CATALOG["v4.failed.continueReason.NOT_STARTED"]);
    expect(notStarted).not.toContain(HOME["runFailure.NOT_STARTED"]);
    const setAside = await screen("RUN_SET_ASIDE:BACKSTOP", "NONE");
    expect(setAside).toContain(CATALOG["v4.failed.continueReason.SET_ASIDE"]);
    expect(setAside).not.toContain(HOME["runFailure.SET_ASIDE"]);
    // Never two quota lines: its own "It did not use your quota." and no "Nothing was taken for the failed try.".
    expect(setAside).not.toContain(CATALOG["v4.debate.failedNothingTaken"]);
    const unavailable = await screen("RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", "NONE");
    expect(unavailable).toContain(HOME["runFailure.MODELS_UNAVAILABLE"]);
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

/*
 * V4 start step, Task 57m (the owner's 8 Nov words: "We should stop after 2 continues that fail, and say that we're investigating this and a
 * future fix will solve this"; "Yes, same rule" for a whole debate's stopped page; "Use these drafts"): after two continues that failed again,
 * the read says `keeps_failing`. The page offers no Continue, says the drafted line, and keeps "Change the question" with the grey line it had
 * before Continue existed (the question-41 lines speak of continuing). The reason drops its "ask again" ending as with Continue (the way on is
 * "Change the question"). Without the mark the page is as before.
 */
const KEEPS_FAILING_DEBATE = "This keeps failing. We're looking into it, and a future fix will solve it.";

describe("a question that keeps failing after two continues (Task 57m)", () => {
  it("drafts the debate's line in the catalogue", () => {
    expect(CATALOG["v4.failed.keepsFailing"]).toBe(KEEPS_FAILING_DEBATE);
  });

  it("no Continue; the cut reason, then the drafted line; 'Change the question' (primary) with its grey line from before Continue", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME", keeps_failing: true });
    await mountMap(1600, runId);
    expect(buttonsNamed(CONTINUE)).toHaveLength(0);
    const lines = [...page().querySelectorAll(".v4DebFailed > p")].map((line) => line.textContent);
    expect(lines.indexOf(KEEPS_FAILING_DEBATE)).toBe(lines.indexOf(CATALOG["v4.failed.continueReason.STOPPED"]!) + 1);
    expect(lines.indexOf(KEEPS_FAILING_DEBATE)).toBeGreaterThan(0);
    expect(text()).not.toContain(HOME["runFailure.STOPPED"]);
    expect(text()).toContain(CATALOG["v4.debate.failedSomeTaken"]);
    expect(text()).not.toContain(LINE);
    expect(linkHref(CHANGE)).toBe(`/v4?again=${runId}`);
    expect(linkHref(CATALOG["v4.debate.askAgain"]!)).toBeNull();
    const change = [...page().querySelectorAll("a")].find((link) => link.textContent?.trim() === CHANGE)!;
    expect(change.className).toContain("v4BtnPrimary");
    expect(change.nextElementSibling?.textContent).toBe(CATALOG["v4.debate.askAgainNoteQuestion"]);
    expect(text()).not.toContain(BOTH_WAYS);
    expect(stopped.press).not.toHaveBeenCalled();
  });

  it("with the picks kept: the picks' grey line from before Continue", async () => {
    const run = failedRun("7b000000-0000-4000-8000-000000000005", { quota_used: "SOME", keeps_failing: true });
    const html = await draw(<V4FailedScreen run={run} askAgainHref="/v4?again=7b000000-0000-4000-8000-000000000005" askHref="/v4" dig={null}
      picksKept catalog={CATALOG} homeCatalog={HOME} />);
    expect(html).toContain(CATALOG["v4.debate.askAgainNote"]);
    expect(html).not.toContain(BOTH_WAYS_PICKS);
    expect(html).toContain(KEEPS_FAILING_DEBATE);
  });

  it("a Continue refused because it keeps failing: the page is read again and then says so, with no button", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME", continuable: true });
    stopped.press = vi.fn(async (_runId: string): Promise<StoppedContinueOutcome> => {
      harness.run = failedRun(runId, { quota_used: "SOME", keeps_failing: true });
      return { kind: "NOT_CONTINUABLE" };
    });
    await mountMap(1600, runId);
    await click(continueButton());
    await advance(START_UNDO_MS);
    await settle(10);
    expect(stopped.press).toHaveBeenCalledTimes(1);
    expect(buttonsNamed(CONTINUE)).toHaveLength(0);
    expect(text()).toContain(KEEPS_FAILING_DEBATE);
    expect(linkHref(CHANGE)).toBe(`/v4?again=${runId}`);
  });

  /*
   * Task 57n (owner 8 Nov, "Yes, same line"): a dig's own page says the dig's keeps-failing line too, as the map's panel does, and no
   * longer promises "You can try this dig again from the map.". Still no Continue and no debate line.
   */
  it("a dig's own page: the dig's keeps-failing line, no try-again note, no Continue", async () => {
    const runId = crypto.randomUUID();
    const parent = crypto.randomUUID();
    harness.records = { parent: { parent_run_id: parent, child_run_id: runId, places: ["path:n-mix"], mode: "quick", created_at: "2026-10-29T10:05:00.000Z" }, children: [] };
    harness.run = failedRun(runId, { quota_used: "SOME", keeps_failing: true });
    await mountMap(1600, runId);
    expect(buttonsNamed(CONTINUE)).toHaveLength(0);
    const lines = [...page().querySelectorAll(".v4DebFailed > p")].map((line) => line.textContent);
    expect(lines).toContain(CATALOG["v4.digFailed.keepsFailingContinues"]);
    expect(lines).not.toContain(KEEPS_FAILING_DEBATE);
    expect(text()).not.toContain(CATALOG["v4.debate.digFailedBackNote"]);
  });

  it("a dig's own page, AIs unavailable: its reason drops 'You can try it again in a while.' (the dig's 5 Nov keeps-failing form)", async () => {
    const run = failedRun("7b000000-0000-4000-8000-000000000006", { quota_used: "NONE", keeps_failing: true }, "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM");
    const html = await draw(<V4FailedScreen run={run} askAgainHref="/v4?again=7b000000-0000-4000-8000-000000000006" askHref="/v4"
      dig={{ backHref: "/v4/debate/7b000000-0000-4000-8000-000000000007" }} catalog={CATALOG} homeCatalog={HOME} />);
    expect(html).toContain(CATALOG["v4.digFailed.unavailableKeepsFailing"]);
    expect(html).not.toContain("You can try it again in a while.");
    expect(html).toContain(CATALOG["v4.digFailed.keepsFailingContinues"]);
  });

  /*
   * Task 57n (owner 8 Nov, "Drop it, like digs"): a question that keeps failing because the AIs were unavailable says its reason without
   * "Please try again in a while." (a drafted V4 line), then the keeps-failing line. With Continue offered the shared sentence stays (57k).
   */
  it("AIs unavailable: the reason without 'Please try again in a while.', then the drafted line", async () => {
    const run = failedRun("7b000000-0000-4000-8000-000000000008", { quota_used: "NONE", keeps_failing: true }, "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM");
    const html = await draw(<V4FailedScreen run={run} askAgainHref="/v4?again=7b000000-0000-4000-8000-000000000008" askHref="/v4" dig={null}
      catalog={CATALOG} homeCatalog={HOME} />);
    expect(html).toContain(CATALOG["v4.failed.keepsFailingReason.MODELS_UNAVAILABLE"]);
    expect(html).not.toContain(HOME["runFailure.MODELS_UNAVAILABLE"]);
    expect(html).not.toMatch(/try again/iu);
    expect(html).toContain(KEEPS_FAILING_DEBATE);
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
