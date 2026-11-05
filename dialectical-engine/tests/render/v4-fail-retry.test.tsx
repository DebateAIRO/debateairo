// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V4DigFailed, type V4FailedDigs } from "../../apps/ui/components/v4/V4DigFailed.js";
import { formatDate } from "../../apps/ui/lib/i18n/translate.js";
import type { DigRetry } from "../../apps/ui/lib/v4/digRetry.js";
import { digQuestion } from "../../apps/ui/lib/v4/askText.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import { InvestigationReportsSchema, type RunProjection } from "../../packages/contract/src/index.js";
import {
  advance, branch, buttonNamed, buttonsNamed, CATALOG, click, harness, mountMap, page, panel, PATHS, resetHarness, seededAnswer,
  seededStory, settle, text, unmountMap
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
 * Owner review 3 Nov 2026 (OWNER-PICKS-2026-11-03.md) on the V4 map page:
 *  - wait-f11/map-f30: a debate that did not finish offers "Ask this again" (the ask step filled from this debate, by its
 *    id only), a grey line under it, "Ask a new question" as a small link, and "Nothing was taken" only when the server
 *    confirms it; a dig's own failed page leads back to its map;
 *  - wait-f18/dig-f12: a failed dig shows its plain reason, "Try this dig again" through the 10-second Undo with its own
 *    Quick/Thorough choice, and after a second failure "This keeps failing…";
 *  - wait-f2/public-f16/public-f17: a dig paused at the month wall reads "Dig · paused until …" with a still mark, the rail
 *    counts it as paused, and its panel shows the one pause block, with Continue once the server says so.
 */

const HOME = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/home.json"), "utf8")) as Record<string, string>;
const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const NEXT_MONTH = "2026-12-01T00:00:00.000Z";
const STOPPED = "RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED";

function failedRun(runId: string, extra: Record<string, unknown> = {}, reason = "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM"): RunProjection {
  return { run_ref: runId, question_line: "Will AI tutors replace homework help?\n\nWhere? Romania.", state: "FAILED", terminal_reason: reason, hold_until: null, ...extra } as RunProjection;
}

/** A dig of `runId` recorded in the account (its places and mode). */
function recordDig(runId: string, childRunId: string, places: readonly string[], mode: "quick" | "thorough" = "thorough"): void {
  harness.records = {
    parent: null,
    children: [...harness.records.children, { parent_run_id: runId, child_run_id: childRunId, places: [...places], mode, created_at: "2026-10-29T10:05:00.000Z" }]
  };
}

/** The question a dig of the whole path `pathId` of `runId` was asked with (what the page sends for it). */
function pathDigQuestion(runId: string, pathId: string): string {
  const answer = seededAnswer(runId);
  const map = buildV4Map({ runId, answer, story: seededStory() });
  return digQuestion({ kind: "path", path: map.paths.find((path) => path.id === pathId)! }, answer.question_line, CATALOG, "en");
}

/** A report of `runId` being written (report-d2: digging rests meanwhile). */
function writingReport(runId: string) {
  return InvestigationReportsSchema.parse({
    investigation_id: "4e000000-0000-4000-8000-0000000000aa", root_run_id: runId, state: "CLOSED", digs: 1, current: null,
    versions: [{ report_version: 1, closed_at: "2026-11-04T10:00:00.000Z", state: "WRITING", waiting_for_digs: 0 }]
  });
}

function failedDig(link: DigLink, extra: Partial<DigView> = {}): DigView {
  return { link, state: "FAILED", headline: null, counts: null, terminalReason: STOPPED, ...extra };
}

function linkHref(name: string): string | null {
  return [...page().querySelectorAll("a")].find((link) => link.textContent?.trim() === name)?.getAttribute("href") ?? null;
}

async function openDig(index: number): Promise<void> {
  await click(branch(index).querySelector<HTMLButtonElement>(".v4MapDig")!);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("a debate that did not finish (wait-f11, map-f30)", () => {
  it("offers 'Ask this again' (by its id only), the grey line, and 'Ask a new question' as a small link", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId);
    await mountMap(1600, runId);
    expect(text()).toContain(HOME["runFailure.MODELS_UNAVAILABLE"]);
    // The ask step is filled from this debate: only its id travels in the address, never the words.
    expect(linkHref(CATALOG["v4.debate.askAgain"]!)).toBe(`/v4?again=${runId}&level=background`);
    expect(linkHref(CATALOG["v4.debate.askAgain"]!)).not.toContain("tutors");
    expect(text()).toContain(CATALOG["v4.debate.askAgainNoteQuestion"]);
    const askNew = [...page().querySelectorAll("a")].find((link) => link.textContent?.trim() === CATALOG["v4.debate.askNew"])!;
    expect(askNew.className).not.toContain("v4BtnPrimary");
    // A question's page names the question (a dig's page names the dig, below).
    expect(page().querySelector("h1")!.textContent).toBe(CATALOG["v4.debate.failedTitle"]);
    expect(page().querySelector(".v4DebFailed .v4Eyebrow")!.textContent).toBe(CATALOG["v4.debate.yourQuestion"]);
    // The server did not say whether anything was taken: nothing is said.
    expect(text()).not.toContain(CATALOG["v4.debate.failedNothingTaken"]);
  });

  it("says 'Nothing was taken for the failed try.' only when the server confirms it, and never twice", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "NONE" });
    await mountMap(1600, runId);
    expect(text()).toContain(CATALOG["v4.debate.failedNothingTaken"]);
    await unmountMap();
    // An upload set it aside: its own sentence already says it used none.
    const other = crypto.randomUUID();
    harness.run = failedRun(other, { quota_used: "NONE" }, "RUN_SET_ASIDE:BACKSTOP");
    await mountMap(1600, other);
    expect(text()).toContain(HOME["runFailure.SET_ASIDE"]);
    expect(text()).not.toContain(CATALOG["v4.debate.failedNothingTaken"]);
  });

  // The harness hands the run read straight to the page, so `quota_used` here skips the contract's parse. Today's contract
  // (RunProjectionSchema, strict) refuses a run read that carries it, so the two lines show on a real page only once the
  // contract carries the field; the stand-in keeps it to its draft view until then (tools/v4-mock-api/README.md).
  it("question 20 A: when the server says some was used, the question says 'The part that ran used some of your quota.'", async () => {
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId, { quota_used: "SOME" }, STOPPED);
    await mountMap(1600, runId);
    expect(text()).toContain(HOME["runFailure.STOPPED"]);
    expect(text()).toContain(CATALOG["v4.debate.failedSomeTaken"]);
    expect(CATALOG["v4.debate.failedSomeTaken"]).toBe("The part that ran used some of your quota.");
    expect(text()).not.toContain(CATALOG["v4.debate.failedNothingTaken"]);
    await unmountMap();
    // A waived run never says it used some: its own sentence says it used none, and nothing contradicts it.
    const other = crypto.randomUUID();
    harness.run = failedRun(other, { quota_used: "SOME" }, "RUN_SET_ASIDE:BACKSTOP");
    await mountMap(1600, other);
    expect(text()).not.toContain(CATALOG["v4.debate.failedSomeTaken"]);
    expect(text()).not.toContain(CATALOG["v4.debate.failedNothingTaken"]);
  });

  it("a dig's own failed page leads back to its map instead of 'Ask this again'", async () => {
    const parent = crypto.randomUUID();
    const runId = crypto.randomUUID();
    harness.run = failedRun(runId);
    harness.records = { parent: { parent_run_id: parent, child_run_id: runId, places: ["path:n-mix"], mode: "quick", created_at: "2026-10-29T10:05:00.000Z" }, children: [] };
    await mountMap(1600, runId);
    expect(linkHref(CATALOG["v4.debate.askAgain"]!)).toBeNull();
    expect(linkHref(CATALOG["v4.report.backToMap"]!)).toBe(`/v4/debate/${parent}?level=background`);
    expect(text()).toContain(CATALOG["v4.debate.digFailedBackNote"]);
    // Question 3 A: its reason is said about the dig, never in the question's sentence.
    expect(text()).toContain(CATALOG["v4.digFailed.reason.MODELS_UNAVAILABLE"]);
    expect(text()).not.toContain(HOME["runFailure.MODELS_UNAVAILABLE"]);
    // The wave-4 browser check (5 Nov): the page names the dig too, in its heading (and so its tab) and the line above.
    expect(page().querySelector("h1")!.textContent).toBe(CATALOG["v4.debate.digFailedTitle"]);
    expect(page().querySelector(".v4DebFailed .v4Eyebrow")!.textContent).toBe(CATALOG["v4.seed.yourDig"]);
    expect(text()).not.toContain(CATALOG["v4.debate.failedTitle"]);
  });

  it("question 20 A: a dig's own failed page says the dig's 'nothing taken' when confirmed, and nothing when some was used", async () => {
    const parent = crypto.randomUUID();
    const mount = async (quota: "NONE" | "SOME", reason = STOPPED): Promise<void> => {
      const runId = crypto.randomUUID();
      harness.run = failedRun(runId, { quota_used: quota }, reason);
      harness.records = { parent: { parent_run_id: parent, child_run_id: runId, places: ["path:n-mix"], mode: "quick", created_at: "2026-10-29T10:05:00.000Z" }, children: [] };
      await mountMap(1600, runId);
    };
    await mount("NONE");
    expect(text()).toContain(CATALOG["v4.digFailed.reason.STOPPED"]);
    expect(text()).not.toContain(HOME["runFailure.STOPPED"]);
    expect(text()).toContain(CATALOG["v4.digFailed.nothingTaken"]);
    expect(text()).not.toContain(CATALOG["v4.debate.failedNothingTaken"]);
    await unmountMap();
    await mount("SOME");
    expect(text()).toContain(CATALOG["v4.digFailed.reason.STOPPED"]);
    expect(text()).not.toContain(CATALOG["v4.digFailed.nothingTaken"]);
    expect(text()).not.toContain(CATALOG["v4.debate.failedSomeTaken"]);
    await unmountMap();
    // An upload set the dig aside: its own line already says it did not use the quota, so it is not said twice.
    await mount("NONE", "RUN_SET_ASIDE:BACKSTOP");
    expect(text()).toContain(CATALOG["v4.digFailed.reason.SET_ASIDE"]);
    expect(text()).not.toContain(CATALOG["v4.digFailed.nothingTaken"]);
  });
});

describe("a dig that did not finish (wait-f18, dig-f12)", () => {
  it("shows its plain reason and tries the same dig again, with its own mode, through the 10-second Undo", async () => {
    const runId = crypto.randomUUID();
    const child = crypto.randomUUID();
    recordDig(runId, child, ["path:n-mix"], "thorough");
    harness.digView = (link) => failedDig(link, { questionLine: pathDigQuestion(runId, "n-mix") });
    await mountMap(1600, runId);
    expect(branch(PATHS.mix).querySelector(".v4MapDig")!.textContent).toContain(CATALOG["v4.rewrite.digCard.FAILED"]);
    await openDig(PATHS.mix);
    expect(panel().textContent).toContain(CATALOG["v4.panel.digState.FAILED"]);
    // Question 3 A (5 Nov): the reason is said about the dig, not in the question's words.
    expect(panel().textContent).toContain(CATALOG["v4.digFailed.reason.STOPPED"]);
    expect(panel().textContent).toContain("This dig stopped partway because of a problem on our side.");
    expect(panel().textContent).not.toContain(HOME["runFailure.STOPPED"]);
    expect(panel().textContent).not.toContain(CATALOG["v4.digFailed.nothingTaken"]);
    // The page's own switch says Quick; the failed dig was Thorough, and is tried again as it was.
    await click(buttonNamed(CATALOG["v4.digFailed.retry"]!, panel()));
    // The shared dig Undo note (the undo-bottom track's V4UndoNote, journey-f21): the same note as any dig.
    expect(page().querySelector(".v4Undo-counting")!.textContent).toContain(CATALOG["v4.dig.undo"]);
    await advance(9_500);
    expect(harness.submit).not.toHaveBeenCalled();
    await advance(600);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    const [question, mode, origin, parent] = harness.submit.mock.calls[0]!;
    expect([question, mode, origin]).toEqual([pathDigQuestion(runId, "n-mix"), "thorough", "dig"]);
    expect(parent).toEqual({ parent_run_id: runId, places: ["path:n-mix"], mode: "thorough" });
  });

  it("Undo sends nothing; the server's 'nothing taken' is said; a dig it cannot rebuild exactly offers no retry", async () => {
    const runId = crypto.randomUUID();
    recordDig(runId, crypto.randomUUID(), ["path:n-mix"]);
    harness.digView = (link) => failedDig(link, { questionLine: pathDigQuestion(runId, "n-mix"), quotaUntouched: true });
    await mountMap(1600, runId);
    await openDig(PATHS.mix);
    expect(panel().textContent).toContain(CATALOG["v4.digFailed.nothingTaken"]);
    await click(buttonNamed(CATALOG["v4.digFailed.retry"]!, panel()));
    await click(page().querySelector<HTMLButtonElement>(`button[aria-label="${CATALOG["v4.dig.undoLabel"]!}"]`)!);
    await advance(11_000);
    expect(harness.submit).not.toHaveBeenCalled();
    await unmountMap();
    // Its run asked something else (picks this page cannot rebuild exactly): no button that would dig something different.
    const other = crypto.randomUUID();
    recordDig(other, crypto.randomUUID(), ["path:n-mix"]);
    harness.digView = (link) => failedDig(link, { questionLine: "Something the page would not send for this path." });
    await mountMap(1600, other);
    await openDig(PATHS.mix);
    expect(buttonsNamed(CATALOG["v4.digFailed.retry"]!, panel())).toEqual([]);
  });

  it("ACCESS-9 / journey-f14: while digging rests for the report, 'Try this dig again' stays focusable and names the visible reason", async () => {
    const onRetry = vi.fn();
    const failed: V4FailedDigs = { retryOf: () => ({ kind: "OFFER" }) as DigRetry, onRetry, reasonText: () => "" };
    const dig = { state: "FAILED" } as unknown as DigView;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const rest = CATALOG["v4.reportWait.digsRest"]!;
    await act(async () => root.render(<V4DigFailed dig={dig} failed={failed} digBusy={false} rest={rest} catalog={CATALOG} />));
    const button = host.querySelector<HTMLButtonElement>(".v4DigFailedRetry")!;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const line = host.querySelector<HTMLElement>("[data-dig-rest]")!;
    expect(line.textContent).toBe(rest);
    expect(button.getAttribute("aria-describedby")).toBe(line.id);
    await act(async () => button.click());
    expect(onRetry).not.toHaveBeenCalled();
    expect(host.querySelector("[data-dig-rest]")!.classList.contains("v4Highlight")).toBe(true);
    // Once digging opens again it digs, and no rest line is left.
    await act(async () => root.render(<V4DigFailed dig={dig} failed={failed} digBusy={false} rest={null} catalog={CATALOG} />));
    expect(host.querySelector("[data-dig-rest]")).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>(".v4DigFailedRetry")!.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    host.remove();
  });

  it("ACCESS-9 on the map (the wave-2 checks, P2): while the report is written, the panel's 'Try this dig again' rests and names the visible reason", async () => {
    const runId = crypto.randomUUID();
    recordDig(runId, crypto.randomUUID(), ["path:n-mix"], "thorough");
    harness.digView = (link) => failedDig(link, { questionLine: pathDigQuestion(runId, "n-mix") });
    harness.investigation = writingReport(runId);
    await mountMap(1600, runId);
    await openDig(PATHS.mix);
    const retry = panel().querySelector<HTMLButtonElement>(".v4DigFailedRetry")!;
    // The panel passes the report's rest down: focusable, never natively disabled, pointing at the line that says why.
    expect(retry.disabled).toBe(false);
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    const line = document.getElementById(retry.getAttribute("aria-describedby")!)!;
    expect(line.textContent).toBe(CATALOG["v4.reportWait.digsRest"]);
    expect(panel().contains(line)).toBe(true);
    await click(retry);
    await advance(11_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("the second browser check (item 5): with the tray docked beside a failed dig while the report is written, the reason is said once", async () => {
    const runId = crypto.randomUUID();
    recordDig(runId, crypto.randomUUID(), ["path:n-mix"], "thorough");
    harness.digView = (link) => failedDig(link, { questionLine: pathDigQuestion(runId, "n-mix") });
    harness.investigation = writingReport(runId);
    await mountMap(1600, runId);
    await click(branch(PATHS.renew).querySelector<HTMLButtonElement>(".v4MapPath")!);
    const boxes = [...panel().querySelectorAll<HTMLInputElement>(".v4Sugs input[type=checkbox]")];
    await click(boxes[0]!);
    await click(boxes[1]!);
    await openDig(PATHS.mix);
    const tray = page().querySelector<HTMLElement>(".v4DebTrayDock")!;
    const trayDig = tray.querySelector<HTMLButtonElement>(".v4DebTrayActions .v4BtnPrimary")!;
    expect(trayDig.getAttribute("aria-disabled")).toBe("true");
    const rest = panel().querySelector<HTMLElement>(".v4DigFailed [data-dig-rest]")!;
    expect(rest.textContent).toBe(CATALOG["v4.reportWait.digsRest"]);
    expect(trayDig.getAttribute("aria-describedby")).toBe(rest.id);
    expect(tray.querySelector("[data-dig-rest]")).toBeNull();
    const said = [...page().querySelectorAll(".v4DebPanelCol p")].filter((element) => element.textContent === CATALOG["v4.reportWait.digsRest"]);
    expect(said).toHaveLength(1);
  });

  it("after a second failure: 'This keeps failing…', with no button", async () => {
    const runId = crypto.randomUUID();
    recordDig(runId, crypto.randomUUID(), ["path:n-mix"]);
    recordDig(runId, crypto.randomUUID(), ["path:n-mix"]);
    harness.digView = (link) => failedDig(link, { questionLine: pathDigQuestion(runId, "n-mix") });
    await mountMap(1600, runId);
    await openDig(PATHS.mix);
    expect(panel().textContent).toContain(CATALOG["v4.digFailed.keepsFailing"]);
    expect(buttonsNamed(CATALOG["v4.digFailed.retry"]!, panel())).toEqual([]);
  });
});

describe("a dig paused at the month wall (wait-f2, public-f16, public-f17)", () => {
  // journey-f22 / journey-f15 (the wave-2 checks): the month pause's one date form, in a sentence and on a label alike.
  const day = formatDate("en", NEXT_MONTH, { day: "numeric", month: "long" });
  const date = day;
  const pausedDig = (canContinue: boolean) => (link: DigLink): DigView =>
    ({ link, state: "RUNNING", headline: null, counts: null, pausedUntil: NEXT_MONTH, canContinue });

  it("reads 'Dig · paused until …' with a still mark, the rail counts it as paused, and nothing can be pressed yet", async () => {
    const runId = crypto.randomUUID();
    recordDig(runId, crypto.randomUUID(), ["path:n-mix"]);
    harness.digView = pausedDig(false);
    await mountMap(1600, runId);
    const card = branch(PATHS.mix).querySelector(".v4MapDig")!;
    expect(card.textContent).toContain(word("v4.pause.digCard", { date: day }));
    expect(card.querySelector(".v4MapPulse")).toBeNull();
    expect(card.querySelector(".v4PauseDot")).not.toBeNull();
    const rail = page().querySelector(".v4DebRail")!.textContent ?? "";
    expect(rail).toContain(word("v4.rail.digsPaused.one", { count: 1 }));
    // map-f28 (the map track): the rounds name their state instead of counting digs; a paused dig is not "looking into it".
    expect(rail).not.toContain(word("v4.rail.digsRunning.one", { count: 1 }));
    await openDig(PATHS.mix);
    expect(panel().textContent).toContain(word("v4.money.paused", { date }));
    expect(panel().textContent).toContain(word("v4.pause.continuesOn", { date: day }));
    expect(buttonsNamed(CATALOG["v4.money.continue"]!, panel())).toEqual([]);
  });

  it("once the server says its month has reset: 'Dig · ready to continue', and Continue resumes the dig's own run", async () => {
    const runId = crypto.randomUUID();
    const child = crypto.randomUUID();
    recordDig(runId, child, ["path:n-mix"]);
    harness.digView = pausedDig(true);
    await mountMap(1600, runId);
    expect(branch(PATHS.mix).querySelector(".v4MapDig")!.textContent).toContain(CATALOG["v4.pause.digCardReady"]);
    await openDig(PATHS.mix);
    expect(panel().textContent).toContain(CATALOG["v4.money.pausedReady"]);
    await click(buttonNamed(CATALOG["v4.money.continue"]!, panel()));
    expect(harness.continueRun).toHaveBeenCalledWith(child);
    // W2L-4 (the wave-2 checks): it keeps its focus while the dig continues (aria-disabled and aria-busy, never native).
    const continuing = buttonNamed(CATALOG["v4.money.continuing"]!, panel());
    expect(continuing.disabled).toBe(false);
    expect(continuing.getAttribute("aria-disabled")).toBe("true");
    expect(continuing.getAttribute("aria-busy")).toBe("true");
  });

  // RC-3 (the checks of the last fixes, 4 Nov): the month pause's hand-offs on the map, pinned so a revert goes red.
  const running = (link: DigLink): DigView => ({ link, state: "RUNNING", headline: null, counts: null });

  it("W2L-4: the panel's Continue keeps its focus while the dig continues, and when the block goes focus goes to the panel's heading, without scrolling", async () => {
    const runId = crypto.randomUUID();
    const child = crypto.randomUUID();
    recordDig(runId, child, ["path:n-mix"]);
    harness.digView = pausedDig(true);
    await mountMap(1600, runId);
    await openDig(PATHS.mix);
    const press = buttonNamed(CATALOG["v4.money.continue"]!, panel());
    press.focus();
    await click(press);
    const continuing = buttonNamed(CATALOG["v4.money.continuing"]!, panel());
    expect(document.activeElement).toBe(continuing);
    // A press while it continues sends nothing more.
    await click(continuing);
    expect(harness.continueRun).toHaveBeenCalledTimes(1);
    // The dig reads as running again (its next read): the pause block goes, and focus goes on to the panel's heading.
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    harness.digView = running;
    await advance(15_000);
    await settle(10);
    expect(panel().querySelector(".v4Pause")).toBeNull();
    expect(document.activeElement).toBe(panel().querySelector(".v4PanelH2"));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it("W2L-4 on a phone: the pinned bar's Continue keeps its focus while the dig continues; then focus goes to the bar's next job or the Map button, without scrolling", async () => {
    const runId = crypto.randomUUID();
    const child = crypto.randomUUID();
    recordDig(runId, child, ["path:n-mix"]);
    harness.digView = pausedDig(true);
    harness.search = `?dig=${child}`;
    await mountMap(375, runId);
    const bar = (): HTMLElement => page().querySelector<HTMLElement>(".v4DebPhoneBar")!;
    const paused = bar().querySelector<HTMLElement>(".v4DebPhonePaused")!;
    expect(paused.textContent).toContain(CATALOG["v4.money.continue"]);
    const press = paused.querySelector<HTMLButtonElement>(".v4DebPhoneDig")!;
    press.focus();
    await click(press);
    expect(harness.continueRun).toHaveBeenCalledWith(child);
    // It keeps its focus while the press is on its way: never natively disabled, but aria-disabled and aria-busy.
    const busy = bar().querySelector<HTMLButtonElement>(".v4DebPhonePaused .v4DebPhoneDig")!;
    expect(busy.disabled).toBe(false);
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(busy);
    // A press meanwhile sends nothing more.
    await click(busy);
    expect(harness.continueRun).toHaveBeenCalledTimes(1);
    // The dig reads as running again: "Paused · Continue" goes, and focus goes on within the bar, never to the page's body.
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    harness.digView = running;
    await advance(15_000);
    await settle(10);
    expect(bar().querySelector(".v4DebPhonePaused")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(bar().contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.matches(".v4DebPhoneDig, .v4DebPhoneMap")).toBe(true);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });
});
