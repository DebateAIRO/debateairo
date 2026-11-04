// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortText } from "../../apps/ui/components/v4/V4MapTree.js";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import { snapshotItems } from "../../apps/ui/lib/v4/changes.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import {
  AnswerSchema, type Answer, type AnswerPathRewrites, type AnswerStory, type MainAnswerVersion, type PathRewrite, type RunProjection
} from "../../packages/contract/src/index.js";
import { createSeed } from "../../tools/v4-mock-api/seed.js";
import { DIG_ANSWERS, DIG_RUNS } from "../../tools/v4-mock-api/rewrite-seed.js";
import {
  advance, branch, buttonNamed, CATALOG, click, harness, mountMap, openPath, page, panel, PATHS, resetHarness, seededAnswer, seededStory,
  settle, unmountMap
} from "./v4-debate-harness.js";

const saved = vi.hoisted(() => ({ visits: [] as Array<Readonly<Record<string, string>>> }));

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => ({
  ...(await import("./v4-debate-harness.js")).accountMemoryMock(await original()),
  recordLastVisit: async (_runId: string, items: Readonly<Record<string, string>>) => {
    saved.visits.push(items);
    return true;
  }
}));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * V4 screen review, owner picks of 3 Nov 2026, on the map page (V4DebateClient):
 * - journey-f17 / wait-f4: one ready moment for the answer, a dig and the report: a small note with [See it], the tab
 *   title's state word ("Looking into it", "Ready", "(1) changed"), one line for screen readers, focus kept; the dot stays
 *   until the place is opened, and the account keeps what is unseen (in its last visit).
 * - wait-f15 / map-f21: no news bar and no tour on the first arrival of the answer; the long answer waits under "Read the
 *   full answer" while the short one is written, and stays there when it arrives.
 * - dig-f3 / journey-f10: "What your digs did" is the finished-dig notice ("Done: “…” changed." [See it]) and lists what
 *   each dig made of its path; dig-f18: the tour's pinned "Next change › · Done"; dig-f1: the main answer rewritten shows
 *   without a reload, as news at the question; map-f19: "Since you last looked: Confirmed".
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const seed = createSeed(fixture);
const ANSWER_ID = "aaaa1111-1111-4111-8111-111111111111";
const STORY_LINES = Object.fromEntries(seededStory().story!.short.paths.map((path) => [path.position_ref, path.line]));

const LATER = "2026-10-31T09:00:00.000Z";
const DIG_A = "d9000000-0000-4000-8000-000000000006";
const DIG_B = "d9000000-0000-4000-8000-000000000016";

/** The served answer with these rewrites; the seed's page still being read (W4-4) is left out, so only these rules read the answer again. */
function answerWith(runId: string, rewrites: AnswerPathRewrites | null, extra: Partial<Answer> = {}): Answer {
  const answer = AnswerSchema.parse(seededAnswer(runId, { ...(rewrites === null ? {} : { path_rewrites: rewrites }), ...extra }));
  if (answer.web === undefined) return answer;
  return { ...answer, web: { ...answer.web, paths: answer.web.paths.map((path) => ({ ...path,
    other_pages: path.other_pages.filter((other) => other.researched?.state !== "READING") })) } };
}

function recordDig(runId: string, childRunId: string, places: readonly string[]): void {
  harness.records = {
    parent: null,
    children: [...harness.records.children, { parent_run_id: runId, child_run_id: childRunId, places: [...places], mode: "quick", created_at: "2026-10-29T10:05:00.000Z" }]
  };
}

function doneDig(link: DigLink, rewrite: PathRewrite | null): DigView {
  const own = buildV4Map({ runId: link.childRunId, answer: seededAnswer(link.childRunId, { dig: DIG_ANSWERS[DIG_RUNS.ownView] }), story: null });
  return { link, state: "DONE", headline: null, counts: own.counts, rewrite, points: own.points };
}

const writingBy = (digRunId: string, id: string): PathRewrite => ({
  rewrite_id: id, dig_run_id: digRunId, dig_level: 1, dig_finished_at: LATER, state: "WRITING"
});

function readyBy(digRunId: string, id: string, line: string, fate: "PARTLY_HELD" | "SET_ASIDE", changed: boolean): PathRewrite {
  return {
    rewrite_id: id, dig_run_id: digRunId, dig_level: 1, dig_finished_at: LATER, state: "READY", rewritten_at: "2026-10-31T09:06:00.000Z",
    changed, text: { line, summary: "In short.", fate }, what_changed: ["What the dig found."], fate_before: fate, view: null, dig_paths: []
  };
}

const RENEW_LINE = "Renewables and storage alone: partly held; batteries cover hours.";

const tabPrefix = (): string | null => page().querySelector(".v4DebPage")!.getAttribute("data-tab-prefix");
const note = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4ReadyNote");
const notice = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4DigsDid");
const noticeNews = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4DigsDidNews");
const announced = (): string => page().querySelector("p.v4SrOnly[aria-atomic='true']")?.textContent ?? "";
const tourBar = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4TourBar");

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  saved.visits = [];
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("the answer's ready moment (journey-f17, wait-f4)", () => {
  it("while waiting the tab says \"Looking into it\"; when the answer lands, a note, \"Ready\", one line read out, focus kept", async () => {
    const runId = crypto.randomUUID();
    const running: RunProjection = {
      run_ref: runId, question_line: "Should countries build new nuclear power?", state: "RUNNING", terminal_reason: null, hold_until: null
    };
    harness.run = running;
    await mountMap(1600, runId);
    expect(tabPrefix()).toBe(CATALOG["v4.ready.tab.waiting"]);
    expect(note()).toBeNull();

    harness.run = null;
    await advance(5_100);
    await settle(200);
    expect(page().querySelector(".v4MapTree, .v4MapBranch")).not.toBeNull();
    expect(note()!.textContent).toContain(CATALOG["v4.ready.answer"]);
    expect(tabPrefix()).toBe(CATALOG["v4.ready.tab.ready"]);
    expect(announced()).toBe(CATALOG["v4.ready.answer"]);
    // Focus never jumps by itself; the first arrival is no news.
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
    expect(noticeNews()).toBeNull();

    await click(buttonNamed(CATALOG["v4.ready.seeIt"]!, note()!));
    expect(note()).toBeNull();
    expect(tabPrefix()).toBeNull();
    expect(document.activeElement).toBe(panel().querySelector(".v4PanelH2"));
  });

  it("a page opened on a finished answer has no ready note and no state word", async () => {
    await mountMap();
    expect(note()).toBeNull();
    expect(tabPrefix()).toBeNull();
  });
});

describe("the first arrival is not news (wait-f15, map-f21)", () => {
  it("the short answer arriving brings no news bar and no tour, and the long answer stays where the reader opened it", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, null);
    harness.story = seed.story(ANSWER_ID, "WRITING", "2026-10-27T15:41:00.000Z") as AnswerStory;
    await mountMap(1600, runId);
    expect(panel().textContent).toContain(CATALOG["v4.panel.fallbackWriting"]);
    const fold = panel().querySelector<HTMLDetailsElement>("details.v4PanelFullAnswer")!;
    expect(fold.querySelector("summary")!.textContent).toBe(CATALOG["v4.panel.readFullAnswer"]);
    expect(fold.open).toBe(false);
    fold.open = true;
    // The short answer is said once, at the question: not again above the map.
    expect(page().textContent).not.toContain(CATALOG["v4.debate.storyWriting"]);

    harness.story = seededStory();
    await advance(10_100);
    await settle();
    expect(panel().querySelector(".v4PanelHeadline")).not.toBeNull();
    const kept = panel().querySelector<HTMLDetailsElement>("details.v4PanelFullAnswer")!;
    expect(kept).toBe(fold);
    expect(kept.open).toBe(true);
    expect(panel().textContent).not.toContain(CATALOG["v4.panel.fallbackWriting"]);
    expect(notice()).toBeNull();
    expect(note()).toBeNull();
    expect(page().querySelector(".v4MapNew")).toBeNull();
    expect(tabPrefix()).toBeNull();
  });
});

describe("a dig finishing while the person is here (dig-f3, journey-f10, journey-f17)", () => {
  it("the notice and the note say what it made of its path, the tab says \"(1) changed\", the dot stays until it is opened", async () => {
    const runId = crypto.randomUUID();
    const writing = writingBy(DIG_A, "rw-a");
    harness.answer = answerWith(runId, { paths: [{ position_ref: "n-renew", current: null, history: [writing] }], changed_since: { count: 0, since_report_version: null } });
    recordDig(runId, DIG_A, ["path:n-renew"]);
    harness.digView = (link) => doneDig(link, writing);
    await mountMap(1600, runId);
    expect(notice()).toBeNull();

    const ready = readyBy(DIG_A, "rw-a", RENEW_LINE, "PARTLY_HELD", true);
    harness.fresh = answerWith(runId, { paths: [{ position_ref: "n-renew", current: (ready as Extract<PathRewrite, { state: "READY" }>).text, history: [ready] }], changed_since: { count: 1, since_report_version: null } });
    harness.digView = (link) => doneDig(link, ready);
    await advance(15_100);
    await settle(200);
    const sentence = word("v4.digsDid.news.CHANGED", { line: RENEW_LINE });
    expect(notice()!.querySelector("h2")!.textContent).toBe(CATALOG["v4.digsDid.title"]);
    expect(noticeNews()!.textContent).toContain(sentence);
    expect(noticeNews()!.textContent).not.toMatch(/\d/u);
    // The path's line is the AI's words; the sentence around it is the site's.
    expect(noticeNews()!.querySelector("[data-ai-generated='true']")!.textContent).toBe(RENEW_LINE);
    expect(note()!.textContent).toContain(sentence);
    expect(announced()).toBe(sentence);
    expect(tabPrefix()).toBe(word("v4.ready.tab.changed.one", { count: 1 }));
    expect(branch(PATHS.renew).querySelector(".v4MapNew")).not.toBeNull();
    // journey-f10: the list says what the dig made of the path.
    expect([...notice()!.querySelectorAll(".v4DigsDidList li")].map((item) => item.textContent))
      .toEqual([word("v4.digsDid.line.ADDED_TO", { line: RENEW_LINE })]);
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);

    await click(buttonNamed(CATALOG["v4.ready.seeIt"]!, noticeNews()!));
    expect(panel().querySelector(".v4RewriteREWRITTEN")).not.toBeNull();
    expect(document.activeElement).toBe(panel().querySelector(".v4PanelH2"));
    // The last stop puts the news away; the list of what the digs did stays.
    expect(noticeNews()).toBeNull();
    expect(notice()!.querySelector(".v4DigsDidList")).not.toBeNull();
    expect(note()).toBeNull();
    expect(tabPrefix()).toBeNull();
    expect(branch(PATHS.renew).querySelector(".v4MapNew")).toBeNull();
  });

  it("two digs finishing together are one note, which opens the tour with its pinned \"Next change › · Done\"", async () => {
    const runId = crypto.randomUUID();
    const writingA = writingBy(DIG_A, "rw-a");
    const writingB = writingBy(DIG_B, "rw-b");
    harness.answer = answerWith(runId, {
      paths: [{ position_ref: "n-renew", current: null, history: [writingA] }, { position_ref: "n-smr", current: null, history: [writingB] }],
      changed_since: { count: 0, since_report_version: null }
    });
    recordDig(runId, DIG_A, ["path:n-renew"]);
    recordDig(runId, DIG_B, ["path:n-smr"]);
    harness.digView = (link) => doneDig(link, link.childRunId === DIG_A ? writingA : writingB);
    await mountMap(1600, runId);

    const readyA = readyBy(DIG_A, "rw-a", RENEW_LINE, "PARTLY_HELD", true);
    const readyB = readyBy(DIG_B, "rw-b", STORY_LINES["n-smr"]!, "SET_ASIDE", false);
    harness.fresh = answerWith(runId, {
      paths: [
        { position_ref: "n-renew", current: (readyA as Extract<PathRewrite, { state: "READY" }>).text, history: [readyA] },
        { position_ref: "n-smr", current: (readyB as Extract<PathRewrite, { state: "READY" }>).text, history: [readyB] }
      ],
      changed_since: { count: 2, since_report_version: null }
    });
    harness.digView = (link) => doneDig(link, link.childRunId === DIG_A ? readyA : readyB);
    await advance(15_100);
    await settle(200);
    expect(noticeNews()!.textContent).toContain(CATALOG["v4.digsDid.news.MANY"]);
    expect(note()!.textContent).toContain(CATALOG["v4.digsDid.news.MANY"]);
    expect(tabPrefix()).toBe(word("v4.ready.tab.changed.other", { count: 2 }));

    await click(buttonNamed(CATALOG["v4.ready.showMe"]!, note()!));
    expect(note()).toBeNull();
    const bar = tourBar()!;
    // On a computer the bar sits under the where-you-are line, in the panel; no "1 of 2".
    expect(panel().contains(bar)).toBe(true);
    expect(bar.textContent).not.toMatch(/\d/u);
    expect(panel().querySelector(".v4RewriteREWRITTEN")).not.toBeNull();
    expect(noticeNews()).not.toBeNull();

    await click(buttonNamed(CATALOG["v4.tour.next"]!, bar));
    expect(panel().querySelector(".v4RewriteNO_CHANGE")).not.toBeNull();
    // The last stop: only "Done" is left, and the news is put away.
    expect(() => buttonNamed(CATALOG["v4.tour.next"]!, tourBar()!)).toThrow();
    expect(noticeNews()).toBeNull();
    // The win sentence is not claimed while one path changed.
    expect(notice()!.textContent).not.toContain(CATALOG["v4.digsDid.holds"]);
    await click(buttonNamed(CATALOG["v4.tour.done"]!, tourBar()!));
    expect(tourBar()).toBeNull();
    expect(tabPrefix()).toBeNull();
  });

  it("on a phone the tour bar is pinned just above the bottom bar", async () => {
    const runId = crypto.randomUUID();
    const writingA = writingBy(DIG_A, "rw-a");
    const writingB = writingBy(DIG_B, "rw-b");
    harness.answer = answerWith(runId, {
      paths: [{ position_ref: "n-renew", current: null, history: [writingA] }, { position_ref: "n-smr", current: null, history: [writingB] }],
      changed_since: { count: 0, since_report_version: null }
    });
    recordDig(runId, DIG_A, ["path:n-renew"]);
    recordDig(runId, DIG_B, ["path:n-smr"]);
    harness.digView = (link) => doneDig(link, link.childRunId === DIG_A ? writingA : writingB);
    await mountMap(375, runId);
    const readyA = readyBy(DIG_A, "rw-a", RENEW_LINE, "PARTLY_HELD", true);
    const readyB = readyBy(DIG_B, "rw-b", STORY_LINES["n-smr"]!, "SET_ASIDE", false);
    harness.fresh = answerWith(runId, {
      paths: [
        { position_ref: "n-renew", current: (readyA as Extract<PathRewrite, { state: "READY" }>).text, history: [readyA] },
        { position_ref: "n-smr", current: (readyB as Extract<PathRewrite, { state: "READY" }>).text, history: [readyB] }
      ],
      changed_since: { count: 2, since_report_version: null }
    });
    harness.digView = (link) => doneDig(link, link.childRunId === DIG_A ? readyA : readyB);
    await advance(15_100);
    await settle(200);
    // The note sits in the dock, above the pinned bar.
    const dock = page().querySelector<HTMLElement>(".v4DebDockPhone")!;
    expect(dock.contains(note())).toBe(true);
    expect(dock.firstElementChild).toBe(note());
    await click(buttonNamed(CATALOG["v4.ready.showMe"]!, noticeNews()!));
    const bar = tourBar()!;
    expect(dock.contains(bar)).toBe(true);
    expect(bar.nextElementSibling?.classList.contains("v4DebPhoneBar")).toBe(true);
  });
});

describe("the main answer rewritten after a dig (dig-f1)", () => {
  it("shows without a reload (read every 15 s while it is written), as news at the question, the tour's last stop", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, null, { main_answer: { current: null, history: [], writing: true } });
    await mountMap(1600, runId);
    expect(page().textContent).toContain(CATALOG["v4.mainAnswer.writing"]);
    const version: MainAnswerVersion = {
      version: 1, updated_at: "2026-10-31T09:10:00.000Z", trigger: "PATH_REWRITE", position_ref: "n-mix", segments: [{ text: "The rewritten main answer." }]
    };
    harness.fresh = answerWith(runId, null, { main_answer: { current: version, history: [version] } });
    await advance(14_000);
    expect(page().textContent).not.toContain("The rewritten main answer.");
    await advance(1_100);
    await settle(200);
    expect(page().querySelector(".v4MainAnswer")!.textContent).toContain("The rewritten main answer.");
    expect(noticeNews()!.textContent).toContain(CATALOG["v4.digsDid.news.ANSWER"]);
    expect(note()!.textContent).toContain(CATALOG["v4.digsDid.news.ANSWER"]);
    // Nothing is being written any more, so the reads stop.
    const reads = harness.loadAnswer.mock.calls.length;
    await advance(60_000);
    expect(harness.loadAnswer.mock.calls.length).toBe(reads);
    await openPath(PATHS.mix);
    await click(buttonNamed(CATALOG["v4.ready.seeIt"]!, noticeNews()!));
    expect(panel().classList.contains("v4Panel-root")).toBe(true);
    expect(noticeNews()).toBeNull();
  });
});

describe("since the last visit (journey-f17, map-f19)", () => {
  it("says \"Since you last looked: Confirmed\" on the path, and the account keeps it unseen until it is opened", async () => {
    const runId = crypto.randomUUID();
    const writing = writingBy(DIG_A, "rw-a");
    const before = buildV4Map({ runId, answer: answerWith(runId, { paths: [{ position_ref: "n-smr", current: null, history: [writing] }], changed_since: { count: 0, since_report_version: null } }), story: seededStory() });
    harness.lastVisit = { at: "2026-10-30T12:00:00.000Z", items: snapshotItems(before, []) };
    const ready = readyBy(DIG_A, "rw-a", STORY_LINES["n-smr"]!, "SET_ASIDE", false);
    harness.answer = answerWith(runId, { paths: [{ position_ref: "n-smr", current: (ready as Extract<PathRewrite, { state: "READY" }>).text, history: [ready] }], changed_since: { count: 0, since_report_version: null } });
    await mountMap(1600, runId);
    expect(noticeNews()!.textContent).toContain(CATALOG["v4.changes.sinceLastVisit"]);
    expect(noticeNews()!.textContent).toContain(word("v4.digsDid.news.HOLDS", { line: shortText(STORY_LINES["n-smr"]!, 80) }));
    // Every dig confirmed its path: the win sentence.
    expect(notice()!.querySelector(".v4DigsDidHolds")!.textContent).toBe(CATALOG["v4.digsDid.holds"]);
    expect(tabPrefix()).toBe(word("v4.ready.tab.changed.one", { count: 1 }));
    // No note for news the person comes back to: the notice tells it.
    expect(note()).toBeNull();
    // The first save keeps the dig as the account had it, so the next visit still tells it.
    expect(saved.visits[0]![`dig:${DIG_A}`]).toBe("REWRITING");

    await openPath(PATHS.smr);
    const since = panel().querySelector(".v4PanelSince")!;
    expect(since.textContent).toBe(word("v4.panel.sinceLastLooked", { result: CATALOG["v4.digsDid.result.CONFIRMED"]! }));
    // It sits right under the where-you-are line.
    expect(since.previousElementSibling?.classList.contains("v4PanelCrumbs")).toBe(true);
    await advance(10_100);
    expect(saved.visits.at(-1)![`dig:${DIG_A}`]).toBe("NO_CHANGE");
    await openPath(PATHS.mix);
    expect(panel().querySelector(".v4PanelSince")).toBeNull();
  });
});

describe("the report's ready moment (journey-f17)", () => {
  it("a report written while the person is on the map gets the same note, the \"Ready\" word and a dot on its step", async () => {
    const runId = crypto.randomUUID();
    const base = { investigation_id: "4e000000-0000-4000-8000-000000000001", root_run_id: runId, digs: 0 } as const;
    harness.investigation = { ...base, state: "CLOSED", versions: [{ report_version: 1, closed_at: "2026-10-31T10:00:00.000Z", state: "WRITING", waiting_for_digs: 0 }], current: null };
    await mountMap(1600, runId);
    expect(note()).toBeNull();
    harness.investigation = {
      ...base, state: "CLOSED", current: 1,
      versions: [{
        report_version: 1, closed_at: "2026-10-31T10:00:00.000Z", state: "READY", written_at: "2026-10-31T10:08:00.000Z",
        answer: { segments: ["The report's answer."] }, story: null, sources: [], shortened: false
      }]
    };
    await advance(15_100);
    await settle(200);
    expect(note()!.textContent).toContain(CATALOG["v4.ready.report"]);
    const link = note()!.querySelector<HTMLAnchorElement>("a")!;
    expect(link.textContent).toBe(CATALOG["v4.ready.seeIt"]);
    expect(link.getAttribute("href")).toBe(`/v4/debate/${runId}/report?level=background`);
    expect(tabPrefix()).toBe(CATALOG["v4.ready.tab.ready"]);
    expect(page().querySelector(".v4DebRail .v4MapNew")).not.toBeNull();
    // The panel's answer is the report's now.
    expect(panel().textContent).toContain("The report's answer.");
  });
});
