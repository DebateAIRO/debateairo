// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnswerSchema, InvestigationReportsSchema, type Answer, type AnswerPathRewrites, type InvestigationReports, type PathRewrite,
  type RunProjection
} from "../../packages/contract/src/index.js";
import { DIG_RUNS, PATH_REWRITES } from "../../tools/v4-mock-api/rewrite-seed.js";
import {
  advance, CATALOG, harness, mountMap, openPath, page, panel, PATHS, resetHarness, seededAnswer, settle, unmountMap, type MapWidth
} from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));
vi.mock("@/lib/v4/reportWriting", async (original) => ({ ...(await original()), loadRunPublished: async () => false }));

/*
 * V4 start step, Task 76l: the map page's wiring of the owner's fourth round (chat, 6 Nov 2026), on the real page (only its
 * reads are stand-ins, v4-debate-harness.tsx):
 *  - the browser tab follows the page's state word: "Waiting · …" while the question waits for a free spot, "Looking into
 *    it · …" while it runs, and (the fifth round, 7 Nov) the page's own word for a short break, a wait for the person's other
 *    question and the month's pause; the page hands useV4Ready the run's waiting state;
 *  - "Your report is older than the map. [Update my report]" hides while a new report version waits or is written, and
 *    comes back if the map changes after that version: the page hands V4ChangedSince the report's stage and, once a version
 *    this visit saw being written is done, reads the answer again once (the review session's wiring list, item 21);
 *  - the map's level for a debate asked without one is Plain words (wiring list item 20; Task 75d made the change);
 *  - the map's links into the report page carry no `?level=` (the owner's 5 Nov rule: no level is ever taken from the
 *    address on V4 pages; the report page reads the debate's level from its loader, the review session's PR #249).
 * All words, dates and figures are made up.
 */

const Q = "Should our town put its money into a new tram line?";
const tab = (): string | null => page().querySelector(".v4DebPage")!.getAttribute("data-tab-prefix");

/** An unfinished R22 question's run read (no paths), with `extra` on top. */
function unfinished(runId: string, extra: Partial<RunProjection> = {}): RunProjection {
  return { run_ref: runId, question_line: Q, state: "RUNNING", terminal_reason: null, hold_until: null, ...extra } as RunProjection;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("the tab says the page's state word while the question is not answered yet (fourth and fifth rounds)", () => {
  it("\"Waiting\" while the question waits for a free spot (the page says the time; the tab has no room for it)", async () => {
    const runId = crypto.randomUUID();
    harness.run = unfinished(runId, { state: "WAITING", waits_until: "2026-11-06T00:40:00.000Z" });
    await mountMap(1600, runId);
    expect(tab()).toBe(CATALOG["v4.state.WAITING.noTime"]);
    expect(tab()).toBe("Waiting");
  });

  it("\"Looking into it\" while it runs; once the answer is served, \"Ready\"", async () => {
    const runId = crypto.randomUUID();
    harness.run = unfinished(runId, { state: "WAITING", waits_until: "2026-11-06T00:40:00.000Z" });
    await mountMap(1600, runId);
    expect(tab()).toBe("Waiting");
    harness.run = unfinished(runId);
    await advance(5_000);
    await settle();
    expect(tab()).toBe(CATALOG["v4.state.LOOKING"]);
    harness.run = null;
    await advance(5_000);
    await settle();
    expect(page().querySelector(".v4DebGrid")).not.toBeNull();
    expect(tab()).toBe(CATALOG["v4.ready.tab.ready"]);
  });

  it("a short break and a wait for the person's other question say their own words", async () => {
    const runId = crypto.randomUUID();
    harness.run = unfinished(runId, { state: "HOLDING", hold_until: "2026-11-04T10:35:00.000Z" });
    await mountMap(1600, runId);
    expect(tab()).toBe(CATALOG["v4.state.SHORT_BREAK.noTime"]);
    harness.run = unfinished(runId, { state: "WAITING", waits_until: "2026-11-04T10:40:00.000Z", waits_for: "OWN_DEBATES" });
    await advance(5_000);
    await settle();
    expect(tab()).toBe(CATALOG["v4.state.WAITING_OWN"]);
  });

  it("a question paused at the month wall says \"Paused until 1 December\", then \"Ready to continue\"", async () => {
    const runId = crypto.randomUUID();
    // Noon UTC: 1 December in every time zone the tests run in.
    harness.run = unfinished(runId, { month_pause: { until: "2026-12-01T12:00:00.000Z", can_continue: false } });
    await mountMap(1600, runId);
    expect(tab()).toBe("Paused until 1 December");
    harness.run = unfinished(runId, { month_pause: { until: "2026-12-01T12:00:00.000Z", can_continue: true } });
    await advance(5_000);
    await settle();
    expect(tab()).toBe(CATALOG["v4.state.PAUSED.canContinue"]);
  });

  it("a question that did not finish adds no state word to the tab, as before", async () => {
    const runId = crypto.randomUUID();
    harness.run = unfinished(runId, { state: "FAILED", terminal_reason: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM" });
    await mountMap(1600, runId);
    expect(page().querySelector(".v4DebPage")!.hasAttribute("data-tab-prefix")).toBe(false);
  });
});

// ── The older-than-the-map box and the report's stage ───────────────────────────────────────────────────────────────
const ROOT = PATH_REWRITES[DIG_RUNS.root]!;
/** The first debate's rewritten paths but n-smr, which these tests rewrite themselves. */
const OTHERS = ROOT.paths.filter((path) => path.position_ref !== "n-smr");
const box = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4ChangedSince");

/** The seed also holds a page still being read (W4-4), which reads the answer every 5 s of its own; these debates have none. */
function answerWith(runId: string, rewrites: AnswerPathRewrites): Answer {
  const answer = AnswerSchema.parse(seededAnswer(runId, { path_rewrites: rewrites }));
  if (answer.web === undefined) return answer;
  return { ...answer, web: { ...answer.web, paths: answer.web.paths.map((path) => ({ ...path,
    other_pages: path.other_pages.filter((page) => page.researched?.state !== "READING") })) } };
}

// Version 2 began at 10:00; a dig's rewrite of n-smr finished at 10:02, after it began and before it was written (10:08).
const LATE_WRITING: PathRewrite = {
  rewrite_id: "rw-late", dig_run_id: "d9000000-0000-4000-8000-000000000076", dig_level: 1,
  dig_finished_at: "2026-10-31T10:01:00.000Z", state: "WRITING"
};
const LATE_DONE = {
  ...LATE_WRITING, state: "READY", rewritten_at: "2026-10-31T10:02:00.000Z", changed: true,
  text: { line: "Wait for a cheaper tram: set aside. The quotes rose again.", summary: "Still too dear.", fate: "SET_ASIDE" },
  what_changed: ["The dig found two newer quotes, both higher."], fate_before: "SET_ASIDE", view: null, dig_paths: []
} as Extract<PathRewrite, { state: "READY" }>;
const smrWriting = { position_ref: "n-smr", current: null, history: [LATE_WRITING] };
const smrDone = { position_ref: "n-smr", current: LATE_DONE.text, history: [LATE_DONE] };

const VERSION_ONE = {
  report_version: 1, closed_at: "2026-10-30T09:00:00.000Z", state: "READY", written_at: "2026-10-30T09:06:00.000Z",
  answer: { segments: ["Version one's made-up answer."] }, story: null, sources: [], shortened: false
} as const;
const VERSION_TWO_WRITING = { report_version: 2, closed_at: "2026-10-31T10:00:00.000Z", state: "WRITING", waiting_for_digs: 0 } as const;
const VERSION_TWO_DONE = {
  report_version: 2, closed_at: "2026-10-31T10:00:00.000Z", state: "READY", written_at: "2026-10-31T10:08:00.000Z",
  answer: { segments: ["Version two's made-up answer."] }, story: null, sources: [], shortened: false
} as const;

function investigation(runId: string, done: boolean): InvestigationReports {
  return InvestigationReportsSchema.parse({
    investigation_id: "4e000000-0000-4000-8000-000000000076", root_run_id: runId, state: "CLOSED", digs: 1,
    versions: [VERSION_ONE, done ? VERSION_TWO_DONE : VERSION_TWO_WRITING], current: done ? 2 : 1
  });
}

/** Holds the page's next answer read until the test lets it land. */
function holdNextAnswerRead(): (answer: Answer) => Promise<void> {
  let land: (answer: Answer | null) => void = () => undefined;
  harness.loadAnswer = vi.fn(() => new Promise<Answer | null>((resolve) => { land = resolve; }));
  return async (answer) => {
    await act(async () => land(answer));
    await settle();
  };
}

describe("the older-than-the-map box waits for the report (fourth round; wiring list items 14 and 21)", () => {
  it("hides while version 2 is written, stays hidden for a rewrite that finished before it was written, and comes back after the fresh read", async () => {
    const runId = crypto.randomUUID();
    // The map's last read: two paths changed since version 1, and n-smr is still being rewritten.
    harness.answer = answerWith(runId, { paths: [...OTHERS, smrWriting], changed_since: { count: 2, since_report_version: 1 } });
    harness.investigation = investigation(runId, false);
    await mountMap(1600, runId);
    // Version 2 is being written: it takes these changes in.
    expect(box()).toBeNull();
    expect(page().textContent).not.toContain(CATALOG["v4.rewrite.reportOlder"]);

    // n-smr's rewrite finishes while version 2 is written: the server still counts it against version 1.
    harness.fresh = answerWith(runId, { paths: [...OTHERS, smrDone], changed_since: { count: 3, since_report_version: 1 } });
    await advance(15_100);
    await settle();
    expect(box()).toBeNull();

    // Version 2 is written. The rewrite was not in it; the page has not read the answer since, so the box waits for that read.
    const land = holdNextAnswerRead();
    harness.investigation = investigation(runId, true);
    await advance(15_100);
    await settle();
    expect(page().querySelector(".v4ReadyNote")!.textContent).toContain(CATALOG["v4.ready.report"]);
    expect(harness.loadAnswer).toHaveBeenCalledTimes(1);
    expect(harness.loadAnswer).toHaveBeenCalledWith(runId);
    expect(box()).toBeNull();

    // The fresh read counts the map's change against version 2: the box is back.
    await land(answerWith(runId, { paths: [...OTHERS, smrDone], changed_since: { count: 1, since_report_version: 2 } }));
    expect(box()!.querySelector(".v4ChangedSinceText")!.textContent).toBe(CATALOG["v4.rewrite.reportOlder"]);
    expect(box()!.querySelector("a")!.getAttribute("href")).toBe(`/v4/debate/${runId}/report`);
    // Once: nothing else reads the answer again.
    await advance(60_000);
    await settle();
    expect(harness.loadAnswer).toHaveBeenCalledTimes(1);
  });

  it("reads the answer again once when a version this visit saw being written is done, and not for one done when the page opened", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, { paths: [...OTHERS, smrDone], changed_since: { count: 3, since_report_version: 1 } });
    harness.investigation = investigation(runId, false);
    await mountMap(1600, runId);
    expect(harness.loadAnswer).not.toHaveBeenCalled();
    harness.investigation = investigation(runId, true);
    await advance(15_100);
    await settle();
    expect(harness.loadAnswer).toHaveBeenCalledTimes(1);
    await advance(60_000);
    await settle();
    expect(harness.loadAnswer).toHaveBeenCalledTimes(1);

    await unmountMap();
    const opened = crypto.randomUUID();
    harness.loadAnswer = vi.fn(async (id: string) => harness.answer ?? seededAnswer(id));
    harness.answer = answerWith(opened, { paths: [...OTHERS, smrDone], changed_since: { count: 1, since_report_version: 2 } });
    harness.investigation = investigation(opened, true);
    await mountMap(1600, opened);
    await advance(60_000);
    await settle();
    expect(harness.loadAnswer).not.toHaveBeenCalled();
    expect(box()).not.toBeNull();
  });
});

// ── The map's default level ─────────────────────────────────────────────────────────────────────────────────────────
describe("the map's level for a debate asked without one is Plain words (wiring list item 20)", () => {
  // Points shown unfolded with their check line (at Plain words the line only sits inside a closed fold, question 27 A).
  const basisLines = (): number =>
    [...panel().querySelectorAll(".v4PanelPointBody > .v4PanelBasis")].filter((line) => line.closest("details.v4SourcesFold") === null).length;

  it("no level stored: the side panel shows each point without its basis line, as at Plain words", async () => {
    harness.level = null;
    await mountMap(1600);
    await openPath(PATHS.renew);
    expect(panel().querySelectorAll(".v4PanelPoint").length).toBeGreaterThan(0);
    expect(basisLines()).toBe(0);
  });

  it("asked at Some background: the same path shows its basis lines (so the case above is the level, not the path)", async () => {
    harness.level = "background";
    await mountMap(1600);
    await openPath(PATHS.renew);
    expect(basisLines()).toBeGreaterThan(0);
  });
});

// ── The map's links into the report page ────────────────────────────────────────────────────────────────────────────
describe("the map's links into the report page carry no ?level= (owner, 5 Nov; the report page reads the debate's level)", () => {
  const reportLinks = (): string[] =>
    [...page().querySelectorAll<HTMLAnchorElement>("a[href^='/v4/debate/'][href*='/report']")].map((link) => link.getAttribute("href") ?? "");

  for (const width of [1600, 800, 375] as const satisfies readonly MapWidth[]) {
    it(`at ${String(width)} px, on a debate asked at Expert, every link into the report is the bare report address`, async () => {
      harness.level = "expert";
      const runId = crypto.randomUUID();
      // A report stands and the map moved on since: the header's link, the steps, the rail and the box all lead to the report.
      harness.answer = answerWith(runId, ROOT);
      harness.investigation = InvestigationReportsSchema.parse({
        investigation_id: "4e000000-0000-4000-8000-000000000077", root_run_id: runId, state: "CLOSED", digs: 1,
        versions: [VERSION_ONE], current: 1
      });
      await mountMap(width, runId);
      const links = reportLinks();
      expect(links.length).toBeGreaterThan(0);
      expect(new Set(links)).toEqual(new Set([`/v4/debate/${runId}/report`]));
    });
  }
});
