import { describe, expect, it } from "vitest";
import { AnswerSchema, type Answer, type AnswerStory, type PathRewrite } from "@debateai/contract";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import {
  answerHolds, digResultOf, firstAnswerArriving, laterNewsOnly, mainAnswerItems, mainAnswerWriting, newsHeadlineOf, pathResults,
  pathsChangedSinceReport, readyNewsOf, rootLast, sinceLastLookedOf, stopsOfChanges, unseenIdsOf, visitItemsToKeep
} from "../../apps/ui/lib/v4/readyMoment.js";
import type { V4Change } from "../../apps/ui/lib/v4/types.js";
import { createSeed } from "../../tools/v4-mock-api/seed.js";
import { DIG_RUNS, PATH_REWRITES } from "../../tools/v4-mock-api/rewrite-seed.js";

/*
 * V4 screen review, owner picks of 3 Nov 2026: the ready moment's rules, worked out by code (lib/v4/readyMoment.ts).
 * journey-f10/f11: the three result tags and the win sentence; wait-f15 / map-f21: the first arrival is never news; dig-f1:
 * the main answer is news at the question, the tour's last stop; dig-f3: the notice speaks as a result; journey-f17: what
 * is unseen stays unseen in the account's last visit; dig-f19 / map-f17: the paths changed since the report, named.
 */

const seed = createSeed(fixture);
const ANSWER_ID = "aaaa1111-1111-4111-8111-111111111111";
const story = seed.story(ANSWER_ID, "READY", "2026-10-27T15:41:00.000Z") as AnswerStory;

function answerOf(extra: Partial<Answer> = {}): Answer {
  return AnswerSchema.parse({
    ...(seed.answer({
      answerId: ANSWER_ID, runRef: DIG_RUNS.root, question: "Nuclear or renewables?",
      askedAt: "2026-10-27T15:12:00.000Z", servedAt: "2026-10-27T15:40:00.000Z", web: "PAID"
    }) as Answer),
    ...extra
  });
}

const ROOT = PATH_REWRITES[DIG_RUNS.root]!;
const MAP = buildV4Map({ runId: DIG_RUNS.root, answer: answerOf({ path_rewrites: ROOT }), story });
const change = (id: string, now: string, kind: V4Change["kind"] = "CHANGED", before: string | null = "REWRITING"): V4Change =>
  ({ id, kind, before, now });

describe("the result tags (journey-f11)", () => {
  it("a dig that changed nothing confirms its path; one that moved where it landed corrects it; any other change adds to it", () => {
    const own = ROOT.paths.find((path) => path.position_ref === "n-mix")!.history[0]! as Extract<PathRewrite, { state: "READY" }>;
    expect(digResultOf(own)).toBe("ADDED_TO");
    expect(digResultOf({ ...own, changed: false, text: { ...own.text, fate: own.fate_before } })).toBe("CONFIRMED");
    expect(digResultOf({ ...own, fate_before: "FELL" })).toBe("CORRECTED");
    expect(digResultOf({ ...own, state: "READY_WITH_RESERVATION" })).toBe("ADDED_TO");
    const failed = ROOT.paths.find((path) => path.position_ref === "n-nuclear")!.history[0]!;
    expect(digResultOf(failed)).toBeNull();
    expect(digResultOf({ rewrite_id: "w", dig_run_id: DIG_RUNS.levelThree, dig_level: 1, dig_finished_at: "2026-10-30T15:40:00.000Z", state: "WRITING" }))
      .toBeNull();
  });

  it("lists each path a dig settled once, in the map's order, and says the answer holds only when every one was confirmed", () => {
    const results = pathResults(MAP);
    expect(results.map((entry) => [entry.path.id, entry.result])).toEqual([
      ["n-mix", "ADDED_TO"], ["n-renew", "ADDED_TO"], ["n-smr", "CONFIRMED"]
    ]);
    expect(answerHolds(results)).toBe(false);
    expect(answerHolds(results.filter((entry) => entry.result === "CONFIRMED"))).toBe(true);
    expect(answerHolds([])).toBe(false);
  });
});

describe("what is news (wait-f15, map-f21, dig-f1)", () => {
  it("while the first answer arrives only digs and the main answer count", () => {
    expect(firstAnswerArriving("WRITING", "READY")).toBe(true);
    expect(firstAnswerArriving("READY", "READY")).toBe(false);
    expect(firstAnswerArriving("READY", "WRITING")).toBe(true);
    expect(firstAnswerArriving("WRITING", "UNAVAILABLE")).toBe(true);
    expect(firstAnswerArriving("NONE", "NONE")).toBe(false);
    expect(firstAnswerArriving(null, "READY")).toBe(false);
    const changes = [
      change("path:n-mix", "HELD_UP", "ADDED", null), change("open:o:1", "open", "ADDED", null), change("point:p1", "SURE"),
      change(`dig:${DIG_RUNS.ownView}`, "CHANGED"), change(`main:${ANSWER_ID}`, "v2", "CHANGED", "v1")
    ];
    expect(laterNewsOnly(changes).map((entry) => entry.id)).toEqual([`dig:${DIG_RUNS.ownView}`, `main:${ANSWER_ID}`]);
  });

  it("the main answer is an item of its own (its version), and its rewriting keeps the page reading", () => {
    expect(mainAnswerItems(answerOf())).toEqual({});
    const writing = answerOf({ main_answer: { current: null, history: [], writing: true } });
    expect(mainAnswerItems(writing)).toEqual({ [`main:${ANSWER_ID}`]: "none" });
    expect(mainAnswerWriting(writing)).toBe(true);
    const version = { version: 2, updated_at: "2026-10-31T09:10:00.000Z", trigger: "PATH_REWRITE" as const, position_ref: "n-mix", segments: [{ text: "New." }] };
    const done = answerOf({ main_answer: { current: version, history: [version] } });
    expect(mainAnswerItems(done)).toEqual({ [`main:${ANSWER_ID}`]: "v2" });
    expect(mainAnswerWriting(done)).toBe(false);
    expect(mainAnswerWriting(null)).toBe(false);
  });

  it("tells news by place, the question itself last", () => {
    expect(rootLast(["root", "path:a", "dig:b"])).toEqual(["path:a", "dig:b", "root"]);
    expect(rootLast(["path:a"])).toEqual(["path:a"]);
    const stops = stopsOfChanges(MAP, [change(`main:${ANSWER_ID}`, "v2"), change(`dig:${DIG_RUNS.ownView}`, "CHANGED"), change(`dig:${DIG_RUNS.levelOne}`, "CHANGED")]);
    expect(stops).toEqual(["path:n-mix", "path:n-renew", "root"]);
  });

  it("a finished dig or the main answer is a ready moment; a dig only started elsewhere is not", () => {
    const fresh = [change("dig:other", "RUNNING", "ADDED", null), change("dig:done", "DONE", "CHANGED", "RUNNING"), change(`main:${ANSWER_ID}`, "v2")];
    expect(readyNewsOf(fresh).map((entry) => entry.id)).toEqual(["dig:done", `main:${ANSWER_ID}`]);
  });
});

describe("the finished-dig notice's sentence (dig-f3)", () => {
  const mix = MAP.paths.find((path) => path.id === "n-mix")!;
  const smr = MAP.paths.find((path) => path.id === "n-smr")!;

  it("one dig names its path and says whether it changed or holds; several are one sentence", () => {
    expect(newsHeadlineOf(MAP, [change(`dig:${DIG_RUNS.ownView}`, "CHANGED")])).toEqual({ kind: "CHANGED", path: mix });
    expect(newsHeadlineOf(MAP, [change(`dig:${DIG_RUNS.noChange}`, "NO_CHANGE")])).toEqual({ kind: "HOLDS", path: smr });
    expect(newsHeadlineOf(MAP, [change(`dig:${DIG_RUNS.ownView}`, "CHANGED"), change(`dig:${DIG_RUNS.noChange}`, "NO_CHANGE")]))
      .toEqual({ kind: "MANY" });
    // The same dig told twice (rewriting, then changed) is one dig.
    expect(newsHeadlineOf(MAP, [change(`dig:${DIG_RUNS.ownView}`, "CHANGED"), change(`dig:${DIG_RUNS.ownView}`, "CHANGED")]).kind).toBe("CHANGED");
  });

  it("a dig that didn't finish says so, with its path when the map has it; an old dig is just done; else the answer or the map", () => {
    expect(newsHeadlineOf(MAP, [change(`dig:${DIG_RUNS.failed}`, "REWRITE_FAILED")]))
      .toEqual({ kind: "FAILED", path: MAP.paths.find((path) => path.id === "n-nuclear") });
    expect(newsHeadlineOf(MAP, [change("dig:elsewhere", "FAILED")])).toEqual({ kind: "FAILED", path: null });
    expect(newsHeadlineOf(MAP, [change("dig:old", "DONE")])).toEqual({ kind: "ONE_DONE" });
    expect(newsHeadlineOf(MAP, [change(`main:${ANSWER_ID}`, "v2")])).toEqual({ kind: "ANSWER" });
    expect(newsHeadlineOf(MAP, [change("dig:new", "RUNNING", "ADDED", null)])).toEqual({ kind: "OTHER" });
  });

  it("since you last looked (map-f19): what a dig made of each path, from the last visit's news only", () => {
    const since = sinceLastLookedOf(MAP, [change(`dig:${DIG_RUNS.noChange}`, "NO_CHANGE"), change(`dig:${DIG_RUNS.ownView}`, "CHANGED"),
      change("dig:running", "RUNNING", "ADDED", null)]);
    expect([...since.entries()]).toEqual([["n-smr", "CONFIRMED"], ["n-mix", "ADDED_TO"]]);
  });
});

describe("seen, kept with the account (journey-f17)", () => {
  it("an item whose place is not opened keeps the account's word, or stays out; everything else is saved as shown", () => {
    const now = { "dig:a": "CHANGED", "path:n-mix": "PARTLY_HELD", "dig:b": "NO_CHANGE", "point:p": "SURE" };
    const account = { "dig:a": "REWRITING", "path:n-mix": "HELD_UP", "point:p": "SURE" };
    expect(visitItemsToKeep(now, account, new Set(["dig:a", "path:n-mix", "dig:b"]))).toEqual({
      "dig:a": "REWRITING", "path:n-mix": "HELD_UP", "point:p": "SURE"
    });
    expect(visitItemsToKeep(now, account, new Set())).toEqual(now);
  });

  it("the unseen items are the news whose place the person has not opened, never the question itself", () => {
    const changes = [change(`dig:${DIG_RUNS.ownView}`, "CHANGED"), change(`dig:${DIG_RUNS.noChange}`, "NO_CHANGE"), change(`main:${ANSWER_ID}`, "v2")];
    expect([...unseenIdsOf(MAP, changes, new Set(["root", "path:n-smr"]))]).toEqual([`dig:${DIG_RUNS.ownView}`]);
    expect([...unseenIdsOf(MAP, changes, new Set(["root"]))]).toEqual([`dig:${DIG_RUNS.ownView}`, `dig:${DIG_RUNS.noChange}`]);
  });
});

describe("the report is older than the map (dig-f19, map-f17)", () => {
  const own = ROOT.paths.find((path) => path.position_ref === "n-mix")!.history[0]! as Extract<PathRewrite, { state: "READY" }>;
  let digs = 0;
  const ready = (id: string, at: string, changed: boolean) => ({ ...own, rewrite_id: `rw-${id}`,
    dig_run_id: `d7000000-0000-4000-8000-${String(++digs).padStart(12, "0")}`, dig_finished_at: "2026-10-29T07:00:00.000Z", rewritten_at: at, changed });
  const mapOf = (paths: { position_ref: string; history: ReturnType<typeof ready>[] }[], count: number) => buildV4Map({
    runId: DIG_RUNS.root, story,
    answer: answerOf({ path_rewrites: { paths: paths.map((path) => ({ ...path, current: own.text })), changed_since: { count, since_report_version: 1 } } })
  });
  const ids = (paths: readonly { id: string }[]) => paths.map((path) => path.id);

  it("names the paths a dig changed among those the server counts (never one it only confirmed), in the map's order", () => {
    // The seed's report is version 1, written before every seeded dig. The server counts every finished rewrite since the report, a
    // confirmation too (packages/serve path-rewrites.ts), so three paths moved on; two of them were changed.
    expect(MAP.changedSince).toEqual({ count: 3, since_report_version: 1 });
    expect(ids(pathsChangedSinceReport(MAP))).toEqual(["n-mix", "n-renew"]);
    // Counting two: the two newest finished rewrites (n-smr's confirmation, n-mix's change) came after the report; n-renew's did not.
    const two = buildV4Map({ runId: DIG_RUNS.root, answer: answerOf({ path_rewrites: { ...ROOT, changed_since: { count: 2, since_report_version: 1 } } }), story });
    expect(ids(pathsChangedSinceReport(two))).toEqual(["n-mix"]);
  });

  it("item 21: a rewrite that finished while the new version was being written is named, though it is older than the version", () => {
    // The version read every rewrite up to 10:00 when it started and was written at 10:40. n-mix's rewrite (10:20) came in between: the
    // server counts it (its cut is the newest rewrite the version read), so the box names it; a cut at 10:40 named nothing.
    const map = mapOf([
      { position_ref: "n-renew", history: [ready("renew", "2026-10-29T10:00:00.000Z", true)] },
      { position_ref: "n-mix", history: [ready("mix", "2026-10-29T10:20:00.000Z", true)] }
    ], 1);
    expect(ids(pathsChangedSinceReport(map))).toEqual(["n-mix"]);
  });

  it("the review of 9 Nov: a change before the counted version was asked for is never named, though a later confirmation counts its path", () => {
    // Dig 1 changed n-mix at 10:00; version 1 was asked for at 10:20 and read it; dig 2 only confirmed n-mix at 11:00, so the server counts it.
    const map = mapOf([
      { position_ref: "n-mix", history: [ready("mix-1", "2026-10-29T10:00:00.000Z", true), ready("mix-2", "2026-10-29T11:00:00.000Z", false)] }
    ], 1);
    const versions = [{ report_version: 1, closed_at: "2026-10-29T10:20:00.000Z" }];
    expect(ids(pathsChangedSinceReport(map, versions))).toEqual([]);
    // A change after the version was asked for, which it may not have read, is still named (item 21).
    const later = mapOf([
      { position_ref: "n-renew", history: [ready("renew", "2026-10-29T10:00:00.000Z", true)] },
      { position_ref: "n-mix", history: [ready("mix", "2026-10-29T10:30:00.000Z", true)] }
    ], 1);
    expect(ids(pathsChangedSinceReport(later, versions))).toEqual(["n-mix"]);
    // Without the version's time (not read yet, or another version), the count alone decides, as before.
    expect(ids(pathsChangedSinceReport(map, []))).toEqual(["n-mix"]);
  });

  it("a path counted for a later confirmation is not named for an older change the report already has", () => {
    const map = mapOf([
      { position_ref: "n-renew", history: [ready("renew", "2026-10-29T09:00:00.000Z", true)] },
      { position_ref: "n-mix", history: [ready("mix-1", "2026-10-29T08:00:00.000Z", true), ready("mix-2", "2026-10-29T11:00:00.000Z", false)] }
    ], 1);
    expect(ids(pathsChangedSinceReport(map))).toEqual([]);
    // Counting both: every change is newer than the report.
    expect(ids(pathsChangedSinceReport(mapOf([
      { position_ref: "n-renew", history: [ready("renew", "2026-10-29T09:00:00.000Z", true)] },
      { position_ref: "n-mix", history: [ready("mix-1", "2026-10-29T08:00:00.000Z", true), ready("mix-2", "2026-10-29T11:00:00.000Z", false)] }
    ], 2)))).toEqual(["n-mix", "n-renew"]);
  });

  it("names nothing before any report, or when nothing changed since it", () => {
    const noReport = buildV4Map({ runId: DIG_RUNS.root, answer: answerOf({ path_rewrites: { ...ROOT, changed_since: { count: 2, since_report_version: null } } }), story });
    expect(pathsChangedSinceReport(noReport)).toEqual([]);
    const none = buildV4Map({ runId: DIG_RUNS.root, answer: answerOf({ path_rewrites: { ...ROOT, changed_since: { count: 0, since_report_version: 1 } } }), story });
    expect(pathsChangedSinceReport(none)).toEqual([]);
    expect(pathsChangedSinceReport(buildV4Map({ runId: "r", answer: answerOf(), story }))).toEqual([]);
  });
});
