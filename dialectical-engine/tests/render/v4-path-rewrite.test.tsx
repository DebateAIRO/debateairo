// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortText } from "../../apps/ui/components/v4/V4MapTree.js";
import { V4PointOfView } from "../../apps/ui/components/v4/V4PathRewrite.js";
import { formatDate } from "../../apps/ui/lib/i18n/translate.js";
import { snapshotItems } from "../../apps/ui/lib/v4/changes.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import {
  AnswerSchema, POINT_OF_VIEW_OUTCOMES, POINT_OF_VIEW_SCOPES, type Answer, type AnswerPathRewrites, type PathRewrite, type PointOfViewVerdict
} from "../../packages/contract/src/index.js";
import { DIG_ANSWERS, DIG_RUNS, PATH_REWRITES } from "../../tools/v4-mock-api/rewrite-seed.js";
import {
  branch, buttonNamed, CATALOG, click, harness, mountMap, openPath, page, panel, PATHS, resetHarness, seededAnswer, seededStory, settle,
  advance, text, unmountMap
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
 * Dig model revision W4-6 (plan 2026-10-30-dig-model-revision.md, drafts 5.3 and 5.5): a path a dig rewrote, on the V4 map
 * page (V4DebateClient, its tree, outline and panel). It shows the new text, "What the dig changed", the verdict on the
 * person's point of view (5.3, approved word for word) with their own words and the AI's reason, the text before each
 * rewrite, the dig's own points and sources under the path, the dig's map, and the four states (rewriting, rewritten, no
 * change, failed); at 375px too. The seeded rewrites are the mock API's (tools/v4-mock-api/rewrite-seed.ts).
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const day = (iso: string): string => formatDate("en", iso, { dateStyle: "medium" });

const ROOT = PATH_REWRITES[DIG_RUNS.root]!;
const OWN_VIEW = ROOT.paths.find((path) => path.position_ref === "n-mix")!.history[0]! as Extract<PathRewrite, { state: "READY" }>;
const STORY_LINES = Object.fromEntries(seededStory().story!.short.paths.map((path) => [path.position_ref, path.line]));

/** The served answer of `runId` with these rewrites, checked against the contract. */
function answerWith(runId: string, rewrites: AnswerPathRewrites, extra: Partial<Answer> = {}): Answer {
  return AnswerSchema.parse(seededAnswer(runId, { path_rewrites: rewrites, ...extra }));
}

/** The dig `childRunId` of `runId`, recorded in the account, dug from these places. */
function recordDig(runId: string, childRunId: string, places: readonly string[]): void {
  harness.records = {
    parent: null,
    children: [...harness.records.children, { parent_run_id: runId, child_run_id: childRunId, places: [...places], mode: "quick", created_at: "2026-10-29T10:05:00.000Z" }]
  };
}

/** A dig of the new model as the page reads it: done, with its rewrite and its own points. */
function doneDig(link: DigLink, rewrite: PathRewrite | null): DigView {
  const own = buildV4Map({ runId: link.childRunId, answer: seededAnswer(link.childRunId, { dig: DIG_ANSWERS[DIG_RUNS.ownView] }), story: null });
  return { link, state: "DONE", headline: null, counts: own.counts, rewrite, points: own.points };
}

const LATER = "2026-10-31T09:00:00.000Z";
const DIG_SECOND = "d9000000-0000-4000-8000-000000000009";
const DIG_FAILED = "d9000000-0000-4000-8000-000000000008";
const DIG_SAME = "d9000000-0000-4000-8000-000000000007";
const DIG_WRITING = "d9000000-0000-4000-8000-000000000006";

const SECOND: PathRewrite = {
  rewrite_id: "rw-second-n-mix", dig_run_id: DIG_SECOND, dig_level: 1, dig_finished_at: LATER, state: "READY",
  rewritten_at: "2026-10-31T09:03:00.000Z", changed: true,
  text: { line: "Mostly renewables, with existing plants as the winter back-up: held up.", summary: "Wind and sun first; old plants for winter.", fate: "HELD_UP" },
  what_changed: ["The second dig found that existing plants can carry winter for at least ten more years."],
  fate_before: "HELD_UP", view: null, dig_paths: []
};

/** One path of each state: n-mix rewritten, n-renew rewriting, n-nuclear failed, n-smr not changed. */
const FOUR_STATES: AnswerPathRewrites = {
  paths: [
    { position_ref: "n-mix", current: OWN_VIEW.text, history: [OWN_VIEW] },
    { position_ref: "n-renew", current: null, history: [{ rewrite_id: "rw-writing", dig_run_id: DIG_WRITING, dig_level: 1, dig_finished_at: LATER, state: "WRITING" }] },
    { position_ref: "n-nuclear", current: null, history: [{ rewrite_id: "rw-failed", dig_run_id: DIG_FAILED, dig_level: 1, dig_finished_at: LATER, state: "FAILED", failed_at: "2026-10-31T09:05:00.000Z" }] },
    {
      position_ref: "n-smr",
      current: { line: STORY_LINES["n-smr"]!, summary: "Still too early to weigh.", fate: "SET_ASIDE" },
      history: [{
        rewrite_id: "rw-same", dig_run_id: DIG_SAME, dig_level: 1, dig_finished_at: LATER, state: "READY", rewritten_at: "2026-10-31T09:04:00.000Z",
        changed: false, text: { line: STORY_LINES["n-smr"]!, summary: "Still too early to weigh.", fate: "SET_ASIDE" },
        what_changed: ["The dig found no running small reactor whose cost could be weighed, so the path stays as it was."],
        fate_before: "SET_ASIDE", view: null, dig_paths: []
      }]
    }
  ],
  changed_since: { count: 1, since_report_version: null }
};

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("a rewritten path (desktop)", () => {
  it("shows its new text on the map, and in the panel what the dig changed and the verdict on the person's point of view", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, ROOT);
    await mountMap(1280, runId);
    const card = branch(PATHS.mix).querySelector<HTMLElement>(".v4MapPath")!;
    // The card's title is the new text; its one line says when the dig rewrote it.
    expect(card.querySelector(".v4MapPathTitle")!.textContent).toContain("Mostly renewables, plus some firm power");
    expect(card.querySelector(".v4RewriteNote")!.textContent).toBe(word("v4.rewrite.rewrittenOnce", { date: day(OWN_VIEW.rewritten_at) }));
    expect(card.querySelector(".v4MapFate")!.textContent).toBe(CATALOG["v4.fate.HELD_UP"]);

    await openPath(PATHS.mix);
    const rewrite = panel().querySelector<HTMLElement>(".v4Rewrite")!;
    expect(rewrite.classList.contains("v4RewriteREWRITTEN")).toBe(true);
    expect(rewrite.textContent).toContain(OWN_VIEW.text.summary);
    const changed = rewrite.querySelector<HTMLElement>(".v4RewriteChanged")!;
    expect(changed.querySelector("h3")!.textContent).toBe(CATALOG["v4.rewrite.whatChanged"]);
    expect([...changed.querySelectorAll("li")].map((item) => item.textContent)).toEqual(OWN_VIEW.what_changed);
    expect(changed.querySelector("[data-ai-generated='true']")).not.toBeNull();
    // "Your point of view": the person's own words quoted, the approved line, the AI's reason, and that it stayed theirs.
    const view = rewrite.querySelector<HTMLElement>(".v4RewriteView")!;
    expect(view.querySelector("h3")!.textContent).toBe(CATALOG["v4.view.heading"]);
    expect([...view.querySelectorAll(".v4RewriteOwnWords q")].map((quote) => quote.textContent)).toEqual(OWN_VIEW.view!.own_words);
    expect(view.querySelector(".v4RewriteVerdict")!.textContent).toBe(CATALOG["v4.view.HELPED.MAIN_QUESTION"]);
    expect(view.textContent).toContain(word("v4.view.why", { reason: OWN_VIEW.view!.reason }));
    expect(view.querySelector("[data-ai-generated='true']")!.textContent).toBe(OWN_VIEW.view!.reason);
    expect(view.textContent).toContain(CATALOG["v4.view.asYours"]);
    // No score or engine word reaches the page.
    expect(rewrite.textContent).not.toMatch(/\b(?:score|strength|threshold|P\d+|READY|HELPED|MAIN_QUESTION)\b/u);
  });

  it("a rewrite made of an AI suggestion chosen as it was carries no verdict", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, ROOT);
    await mountMap(1280, runId);
    await openPath(PATHS.renew);
    expect(panel().querySelector(".v4RewriteChanged")).not.toBeNull();
    expect(panel().querySelector(".v4RewriteView")).toBeNull();
    expect(panel().textContent).not.toContain(CATALOG["v4.view.heading"]);
  });

  it("shows each earlier text, and says how many digs rewrote the path", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, {
      paths: [{ position_ref: "n-mix", current: SECOND.state === "READY" ? SECOND.text : null, history: [OWN_VIEW, SECOND] }],
      changed_since: { count: 1, since_report_version: null }
    });
    await mountMap(1280, runId);
    expect(branch(PATHS.mix).querySelector(".v4RewriteNote")!.textContent)
      .toBe(word("v4.rewrite.rewrittenMany", { count: 2, date: day("2026-10-31T09:03:00.000Z") }));
    await openPath(PATHS.mix);
    expect(panel().querySelector(".v4RewriteEarlierList")).toBeNull();
    await click(buttonNamed(CATALOG["v4.rewrite.showEarlier"]!, panel()));
    const earlier = [...panel().querySelectorAll(".v4RewriteEarlierList li")].map((item) => item.textContent?.replace(/\s+/g, " ").trim());
    expect(earlier).toEqual([
      `${word("v4.rewrite.before", { date: day(OWN_VIEW.dig_finished_at) })} ${STORY_LINES["n-mix"]}`,
      `${word("v4.rewrite.before", { date: day(LATER) })} ${OWN_VIEW.text.line}`
    ]);
    // The newest rewrite's "What the dig changed" is the one shown.
    expect(panel().querySelector(".v4RewriteChanged")!.textContent).toContain((SECOND as Extract<PathRewrite, { state: "READY" }>).what_changed[0]);
    await click(buttonNamed(CATALOG["v4.rewrite.hideEarlier"]!, panel()));
    expect(panel().querySelector(".v4RewriteEarlierList")).toBeNull();
  });

  it("shows the dig's points and sources under the path, and opens the dig's map", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, ROOT);
    recordDig(runId, DIG_RUNS.ownView, ["path:n-mix", "p:n-mix-land"]);
    harness.digView = (link) => doneDig(link, OWN_VIEW);
    await mountMap(1280, runId);
    // The dig's card says it changed this path.
    expect(branch(PATHS.mix).querySelector(".v4MapDig")!.textContent).toContain(CATALOG["v4.rewrite.digCard.CHANGED"]);
    await openPath(PATHS.mix);
    expect(panel().querySelector(".v4RewriteDigPoints")).toBeNull();
    await click(buttonNamed(CATALOG["v4.rewrite.seeDigPoints"]!, panel()));
    const points = panel().querySelector<HTMLElement>(".v4RewriteDigPoints")!;
    // Each checked point with its trust word, and the page it rests on.
    expect(points.textContent).toContain("Utility-scale solar and onshore wind now give the lowest cost of new electricity in most markets.");
    expect(points.textContent).toContain(CATALOG["v4.trust.SURE"]);
    expect(points.textContent).toContain("What new power costs in 2025: a survey of recent auctions");
    const map = [...panel().querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.textContent === CATALOG["v4.rewrite.openDigMap"])!;
    expect(map.getAttribute("href")).toBe(`/v4/debate/${DIG_RUNS.ownView}?level=background`);
    await click(buttonNamed(CATALOG["v4.rewrite.hideDigPoints"]!, panel()));
    expect(panel().querySelector(".v4RewriteDigPoints")).toBeNull();
  });
});

describe("a rewritten path's trust words (W4-8, owner Q-D3)", () => {
  it("counts the words the server worked out for the path, and shows the served word on the dig's points it rests on", async () => {
    const runId = crypto.randomUUID();
    const plain = buildV4Map({ runId, answer: answerWith(runId, ROOT), story: seededStory() }).paths.find((path) => path.id === "n-mix")!;
    const digLink: DigLink = { parentRunId: runId, childRunId: DIG_RUNS.ownView, openQuestionIds: ["path:n-mix"], questions: [], mode: "quick", startedAt: null };
    const digPoint = doneDig(digLink, OWN_VIEW).points!.find((point) => point.trust === "SURE")!;
    // The server's words: the path's own points as placed, then the dig's point the rewrite rests on, which it weighed
    // with the dig's own checks (here: still argued).
    const served = { ...OWN_VIEW, rests_on: [digPoint.id],
      trust: [...plain.points.map((point) => ({ node_id: point.id, word: point.trust })), { node_id: digPoint.id, word: "STILL_ARGUED" as const }] };
    harness.answer = answerWith(runId, { ...ROOT, paths: ROOT.paths.map((path) => (path.position_ref === "n-mix" ? { ...path, history: [served] } : path)) });
    recordDig(runId, DIG_RUNS.ownView, ["path:n-mix"]);
    harness.digView = (link) => doneDig(link, served);
    await mountMap(1280, runId);
    // The path's bar counts one more still-argued point than the path's own points give.
    const argued = plain.counts.STILL_ARGUED + 1;
    const bar = branch(PATHS.mix).querySelector<HTMLElement>(".v4MapPath .v4BarTrack")!;
    expect(bar.getAttribute("aria-label")).toContain(word("v4.trustCount.STILL_ARGUED", { count: argued }));
    await openPath(PATHS.mix);
    await click(buttonNamed(CATALOG["v4.rewrite.seeDigPoints"]!, panel()));
    const item = [...panel().querySelectorAll<HTMLElement>(".v4RewriteDigPoints li")].find((entry) => entry.textContent!.includes(digPoint.text))!;
    expect(item.querySelector(".v4RewritePointWord")!.textContent).toBe(CATALOG["v4.trust.STILL_ARGUED"]);
    expect(item.classList.contains("v4PanelPointSTILL_ARGUED")).toBe(true);
    // Words only: no number of the engine reaches the page.
    expect(panel().querySelector(".v4Rewrite")!.textContent).not.toMatch(/\b(?:score|strength|threshold|P\d+)\b/u);
  });

  it("an unrewritten path keeps the words of its own points", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, ROOT);
    await mountMap(1280, runId);
    const plain = buildV4Map({ runId, answer: answerWith(runId, ROOT), story: seededStory() }).paths.find((path) => path.id === "n-nuclear")!;
    const bar = branch(PATHS.nuclear).querySelector<HTMLElement>(".v4MapPath .v4BarTrack")!;
    const words = (["SURE", "SURE_FOR_CASE", "STILL_ARGUED", "DIDNT_HOLD"] as const).filter((name) => plain.counts[name] > 0);
    for (const name of words) expect(bar.getAttribute("aria-label")).toContain(word(`v4.trustCount.${name}`, { count: plain.counts[name] }));
  });
});

describe("the four states (draft 5.5)", () => {
  it("rewriting, rewritten, no change and failed, on the cards and in the panel", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, FOUR_STATES);
    recordDig(runId, DIG_FAILED, ["path:n-nuclear"]);
    harness.digView = (link) => doneDig(link, FOUR_STATES.paths[2]!.history[0]!);
    await mountMap(1280, runId);
    const note = (index: number) => branch(index).querySelector(".v4RewriteNote")?.textContent;
    expect(note(PATHS.mix)).toBe(word("v4.rewrite.rewrittenOnce", { date: day(OWN_VIEW.rewritten_at) }));
    expect(note(PATHS.renew)).toBe(CATALOG["v4.rewrite.state.WRITING"]);
    expect(note(PATHS.nuclear)).toBe(CATALOG["v4.rewrite.card.FAILED"]);
    expect(note(PATHS.smr)).toBe(CATALOG["v4.rewrite.state.NO_CHANGE"]);
    // A rewrite still being written or a failed one leaves the path's text as it was.
    expect(branch(PATHS.renew).querySelector(".v4MapPathTitle")!.textContent).toContain("Only renewables and storage: partly held.");
    expect(branch(PATHS.nuclear).querySelector(".v4MapFate")!.textContent).toBe(CATALOG["v4.fate.FELL"]);
    // The failed rewrite's dig card says so.
    expect(branch(PATHS.nuclear).querySelector(".v4MapDig")!.textContent).toContain(CATALOG["v4.rewrite.digCard.REWRITE_FAILED"]);

    await openPath(PATHS.renew);
    expect(panel().querySelector(".v4RewriteState")!.textContent).toBe(CATALOG["v4.rewrite.state.WRITING"]);
    expect(panel().querySelector(".v4RewriteChanged")).toBeNull();

    await openPath(PATHS.smr);
    expect(panel().querySelector(".v4RewriteState")!.textContent).toBe(CATALOG["v4.rewrite.state.NO_CHANGE"]);
    // Its "What the dig changed" sentence is still shown; "Rewritten after…" is not (nothing was rewritten).
    expect(panel().querySelector(".v4RewriteChanged")!.textContent).toContain("no running small reactor");
    expect(panel().querySelector(".v4RewriteWhen")).toBeNull();

    await openPath(PATHS.nuclear);
    expect(panel().querySelector(".v4RewriteState")!.textContent).toBe(CATALOG["v4.rewrite.state.FAILED"]);
    // "The dig's points and sources are below": open at once.
    expect(panel().querySelector(".v4RewriteDigPoints")).not.toBeNull();
    expect(buttonNamed(CATALOG["v4.rewrite.hideDigPoints"]!, panel())).toBeTruthy();
  });

  it("a failed rewrite whose dig this page has not read points to the dig's map", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, FOUR_STATES);
    await mountMap(1280, runId);
    await openPath(PATHS.nuclear);
    expect(panel().textContent).toContain(CATALOG["v4.rewrite.digPointsElsewhere"]);
    const map = [...panel().querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.textContent === CATALOG["v4.rewrite.openDigMap"])!;
    expect(map.getAttribute("href")).toBe(`/v4/debate/${DIG_FAILED}?level=background`);
  });
});

describe("the verdict lines (draft 5.3, approved)", () => {
  const VIEW: PointOfViewVerdict = { outcome: "HELPED", scope: "PATH", reason: "Because of the back-up you named.", own_words: ["My own view.", "My edit."] };
  const render = (view: PointOfViewVerdict): HTMLElement => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<V4PointOfView view={view} catalog={CATALOG} />);
    return host;
  };

  it.each(POINT_OF_VIEW_OUTCOMES.flatMap((outcome) => POINT_OF_VIEW_SCOPES.map((scope) => [outcome, scope] as const)))(
    "%s for %s reads its approved line, under every verdict the same closing line", (outcome, scope) => {
      const shown = render({ ...VIEW, outcome, scope });
      const key = outcome === "NOT_SETTLED" ? "v4.view.NOT_SETTLED" : `v4.view.${outcome}.${scope}`;
      expect(shown.querySelector(".v4RewriteVerdict")!.textContent).toBe(CATALOG[key]);
      expect(shown.textContent).toContain(word("v4.view.why", { reason: VIEW.reason }));
      expect(shown.textContent).toContain(CATALOG["v4.view.asYours"]);
      expect([...shown.querySelectorAll("q")].map((quote) => quote.textContent)).toEqual(VIEW.own_words);
      // The person's words are theirs, never marked as AI text; the reason is the AI's.
      expect(shown.querySelector("q")!.closest("[data-ai-generated]")).toBeNull();
      expect(shown.querySelector("[data-ai-generated='true']")!.textContent).toBe(VIEW.reason);
    });
});

describe("news (draft 5.5)", () => {
  it("a rewrite that finishes while the person is here is news, told by name", async () => {
    const runId = crypto.randomUUID();
    const writing: AnswerPathRewrites = { paths: [FOUR_STATES.paths[1]!], changed_since: { count: 0, since_report_version: null } };
    harness.answer = answerWith(runId, writing);
    recordDig(runId, DIG_WRITING, ["path:n-renew"]);
    harness.digView = (link) => doneDig(link, writing.paths[0]!.history[0]!);
    await mountMap(1280, runId);
    expect(page().querySelector(".v4DebChanges")).toBeNull();
    const ready: PathRewrite = {
      ...OWN_VIEW, rewrite_id: "rw-writing", dig_run_id: DIG_WRITING, dig_finished_at: LATER, rewritten_at: "2026-10-31T09:06:00.000Z",
      text: { line: "Renewables and storage alone: partly held; batteries cover hours.", summary: "Hours, not weeks.", fate: "PARTLY_HELD" },
      fate_before: "PARTLY_HELD", view: null
    };
    harness.fresh = answerWith(runId, { paths: [{ position_ref: "n-renew", current: (ready as Extract<PathRewrite, { state: "READY" }>).text, history: [ready] }], changed_since: { count: 1, since_report_version: null } });
    harness.digView = (link) => doneDig(link, ready);
    await advance(15_100);
    await settle();
    const bar = page().querySelector<HTMLElement>(".v4DebChanges")!;
    expect(bar.getAttribute("aria-label")).toBe(CATALOG["v4.changes.label"]);
    expect(bar.querySelector(".v4DebChangesRewrites")!.textContent)
      .toBe(word("v4.changes.digChanged", { line: "Renewables and storage alone: partly held; batteries cover hours." }));
    // The tour stops at the path the dig rewrote.
    await click(buttonNamed(CATALOG["v4.changes.show"]!));
    expect(panel().querySelector(".v4RewriteREWRITTEN")).not.toBeNull();
  });

  it("a rewrite that finished since the last visit is news too; one that changed nothing says so", async () => {
    const runId = crypto.randomUUID();
    const done: AnswerPathRewrites = { paths: [FOUR_STATES.paths[3]!], changed_since: { count: 0, since_report_version: null } };
    const writing: AnswerPathRewrites = { paths: [{ ...FOUR_STATES.paths[1]!, position_ref: "n-smr" }], changed_since: { count: 0, since_report_version: null } };
    const before = buildV4Map({ runId, answer: answerWith(runId, writing), story: seededStory() });
    harness.lastVisit = { at: "2026-10-30T12:00:00.000Z", items: snapshotItems(before, []) };
    harness.answer = answerWith(runId, done);
    await mountMap(1280, runId);
    const bar = page().querySelector<HTMLElement>(".v4DebChanges")!;
    expect(bar.getAttribute("aria-label")).toBe(CATALOG["v4.changes.labelLastVisit"]);
    expect(bar.querySelector(".v4DebChangesRewrites")!.textContent).toBe(word("v4.changes.digNoChange", { line: shortText(STORY_LINES["n-smr"]!, 80) }));
  });
});

describe("phone width (375px)", () => {
  it("the outline row carries the rewrite's line, and the panel shows the whole rewrite", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, ROOT);
    await mountMap(375, runId);
    expect(page().querySelector(".v4DebLayout-phone")).not.toBeNull();
    await click(buttonNamed(CATALOG["v4.debate.mapButton"]!));
    const row = [...page().querySelectorAll<HTMLButtonElement>(".v4OutPath")][PATHS.mix]!;
    expect(row.querySelector(".v4RewriteNote")!.textContent).toBe(word("v4.rewrite.rewrittenOnce", { date: day(OWN_VIEW.rewritten_at) }));
    // n-renew is also marked: a dig further down changed part of it.
    const renew = [...page().querySelectorAll<HTMLButtonElement>(".v4OutPath")][PATHS.renew]!;
    expect(renew.querySelector(".v4RewriteNoteBelow")!.textContent).toBe(CATALOG["v4.rewrite.changedBelow"]);
    await click(row);
    expect(page().querySelector(".v4DebSheet")).toBeNull();
    expect(panel().querySelector(".v4RewriteChanged")).not.toBeNull();
    expect(panel().querySelector(".v4RewriteVerdict")!.textContent).toBe(CATALOG["v4.view.HELPED.MAIN_QUESTION"]);
    expect(text()).toContain(CATALOG["v4.rewrite.seeDigPoints"]);
  });

  it("the rewrite's styles wrap at any width and keep the 44px touch height", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-map.css"), "utf8");
    const block = css.slice(css.indexOf("Dig model revision W4-6"));
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/(?:^|[\s;{])(?:min-)?width:\s*\d+px/u);
    expect(block).toMatch(/\.v4RewriteToggle, \.v4RewriteDigMap, \.v4DigPageBack \{[^}]*min-height: 44px/u);
    expect(block).toMatch(/\.v4Rewrite \{[^}]*overflow-wrap: anywhere/u);
  });
});
