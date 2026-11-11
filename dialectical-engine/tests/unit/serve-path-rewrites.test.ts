// tests/unit/serve-path-rewrites.test.ts
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { AnswerDigSchema, AnswerPathRewritesSchema, AnswerSchema, type Answer, type AnswerPathRewrites } from "@debateai/contract";
import { withRunContentLease, type PathRewriteEntry } from "@debateai/db";
import {
  changedBelowPathsOf, digLevelsOf, digsBelowOf, latestWrittenReportOf, ownWordsOf, pathHistoryOf, pathRewriteIdOfDig, restsOnOf,
  rewriteTrustOf, serveDig, servePathRewrites, storyPathLinesOf, storyPathPointsOf, type DebatePoints, type PathTrustSources,
  type RewriteTurn, type StoredPathRewriteText
} from "../../packages/serve/src/path-rewrites.js";
import { ServeRepository } from "../../packages/serve/src/index.js";
import { pathRewriteIdOf } from "../../apps/runner/src/path-rewrite.js";
import { buildPublicDebateBody } from "../../apps/api/src/publications.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * Dig-model revision W4-5 (serve the rewrites). What 0134 keeps of each dig's rewrite (codes in clear, the text sealed under
 * the dig's key and opened by the repository) becomes the answer's `path_rewrites` and, on a dig, its `dig`. Owner rules
 * held here: the history is newest last and the current text is the newest READY or READY_WITH_RESERVATION; WRITING and
 * FAILED leave the text; "changed since" counts from the first answer, then from the latest written report (Q-D11); a path
 * is marked when a dig further down changed a path inside its dig, never rewritten (Q-D5); the fate is code's column
 * (Q-D3); the verdict only beside the person's own words (Q-D4); never an engine number; the owner's alone, never in the
 * public debate. Texts are made up.
 */

const DEBATE = "d0000000-0000-4000-8000-000000000000";
const DIG = (n: number) => `d${String(n)}000000-0000-4000-8000-00000000000${String(n)}`;
const RW = (n: number) => `a${String(n)}000000-0000-4000-8000-00000000000${String(n)}`;
const at = (hour: number) => `2026-10-30T${String(hour).padStart(2, "0")}:00:00.123456+00:00`;
const ISO = (hour: number) => `2026-10-30T${String(hour).padStart(2, "0")}:00:00.123Z`;
const STORY_LINE = "Yes: a second pier would cut the queues.";
const OWN_WORDS = "I think tourists keep the ferries full all year.";

function entry(n: number, overrides: Partial<PathRewriteEntry> = {}): PathRewriteEntry {
  return {
    run_id: DIG(n), parent_run_id: DEBATE, position_ref: "pos-a", path_seq: n, taken_at: at(n + 1), state: "READY",
    rewrite_id: RW(n), parent_answer_version: 1, based_on_rewrite_id: null, failure_code: null, fate_before: "HELD_UP",
    fate_after: "PARTLY_HELD", verdict_outcome: "HELPED", verdict_scope: "PATH",
    writer_lineage: { maker: "Anthropic", model_id: "ENGINE_WRITER_MODEL" }, checker_lineage: { maker: "Z.AI", model_id: "ENGINE_CHECKER_MODEL" },
    rounds: 2, artifact_refs: ["ENGINE_ARTIFACT_REF"], recorded_at: at(n + 1).replace(":00:00.", ":05:00."), content: { v: 1 },
    ...overrides
  };
}

/** A text as W3-5 sealed it before W4-8: no `rests_on` (W4-8's texts carry it, see `textResting`). */
function text(n: number, overrides: Partial<StoredPathRewriteText["text"]> = {}): Omit<StoredPathRewriteText, "rests_on"> {
  return {
    text: { line: `Rewritten line ${String(n)}.`, summary: `Rewritten summary ${String(n)}.`, fate: "PARTLY_HELD", ...overrides },
    what_changed: [`What dig ${String(n)} changed.`],
    view_reason: `Why your view mattered, dig ${String(n)}.`,
    dig_paths: [{ position_ref: `dig-${String(n)}-path`, line: `The dig's own path ${String(n)}.`, fate: "FELL" }]
  };
}
const textResting = (n: number, restsOn: readonly string[], overrides: Partial<StoredPathRewriteText["text"]> = {}): StoredPathRewriteText =>
  ({ ...text(n, overrides), rests_on: restsOn });

const turn = (entryValue: PathRewriteEntry, opened: unknown = null, ownWords: readonly string[] | null = [OWN_WORDS]): RewriteTurn =>
  ({ entry: entryValue, opened, ownWords });

const levels = (level: number) => () => level;
const serve = (turns: readonly RewriteTurn[], extra: Partial<Parameters<typeof servePathRewrites>[0]> = {}) => servePathRewrites({
  turns, levelOf: levels(1), storyLines: new Map([["pos-a", STORY_LINE]]), changedBelow: new Set(), report: null, ...extra
});

describe("W4-5 · a path's rewrites, newest last", () => {
  it("lists the history in the order the digs finished, whatever order the store gave", () => {
    const served = serve([
      turn(entry(2, { based_on_rewrite_id: RW(1), fate_before: "PARTLY_HELD", fate_after: "FELL" }), text(2, { fate: "FELL" })),
      turn(entry(1), text(1))
    ])!;
    expect(served.paths).toHaveLength(1);
    expect(served.paths[0]!.history.map((rewrite) => [rewrite.rewrite_id, rewrite.dig_finished_at])).toEqual([
      [RW(1), ISO(2)], [RW(2), ISO(3)]]);
    AnswerPathRewritesSchema.parse(served);
  });

  it("makes the newest READY or READY_WITH_RESERVATION the current text; a later WRITING leaves it", () => {
    const served = serve([
      turn(entry(1), text(1)),
      turn(entry(2, { state: "READY_WITH_RESERVATION", based_on_rewrite_id: RW(1), fate_before: "PARTLY_HELD" }), text(2)),
      turn(entry(3, { state: "WRITING", rewrite_id: null, fate_before: null, fate_after: null, verdict_outcome: null,
        verdict_scope: null, recorded_at: null, content: null }))
    ])!;
    const path = served.paths[0]!;
    expect(path.history.map((rewrite) => rewrite.state)).toEqual(["READY", "READY_WITH_RESERVATION", "WRITING"]);
    expect(path.current).toEqual({ line: "Rewritten line 2.", summary: "Rewritten summary 2.", fate: "PARTLY_HELD" });
    // A turn still writing keeps the id its row will have: the runner's own, one per dig.
    expect(path.history[2]!.rewrite_id).toBe(pathRewriteIdOf(DIG(3)));
    expect(pathRewriteIdOfDig(DIG(3))).toBe(pathRewriteIdOf(DIG(3)));
  });

  it("a FAILED rewrite leaves the text as it was and serves only its state and when", () => {
    const failed = (n: number, extra: Partial<PathRewriteEntry> = {}) => entry(n, { state: "FAILED",
      failure_code: "PATH_REWRITE_ALL_WRITERS_FAILED", fate_after: null, verdict_outcome: null, verdict_scope: null, content: null, ...extra });
    const after = serve([turn(entry(1), text(1)), turn(failed(2, { based_on_rewrite_id: RW(1), fate_before: "PARTLY_HELD" }))])!;
    expect(after.paths[0]!.current).toEqual({ line: "Rewritten line 1.", summary: "Rewritten summary 1.", fate: "PARTLY_HELD" });
    expect(after.paths[0]!.history[1]).toEqual({ rewrite_id: RW(2), dig_run_id: DIG(2), dig_level: 1, dig_finished_at: ISO(3),
      state: "FAILED", failed_at: "2026-10-30T03:05:00.123Z" });
    // Alone, the path keeps its story line: no current text, and the failure is listed.
    const alone = serve([turn(failed(1))])!;
    expect(alone.paths[0]!.current).toBeNull();
    expect(alone.paths[0]!.history.map((rewrite) => rewrite.state)).toEqual(["FAILED"]);
    expect(alone.changed_since.count).toBe(0);
    expect(JSON.stringify(after)).not.toContain("PATH_REWRITE_ALL_WRITERS_FAILED");
  });

  it("leaves out a path whose stored value makes no rewrite, never failing the answer", () => {
    const broken = serve([turn(entry(1), { text: "not a rewrite" })]);
    expect(broken).toBeNull();
    const other = serve([turn(entry(1), { text: "not a rewrite" }), turn(entry(2, { position_ref: "pos-b", path_seq: 1 }), text(2))])!;
    expect(other.paths.map((path) => path.position_ref)).toEqual(["pos-b"]);
  });
});

describe("W4-5 · worked out by code (Q-D3, Q-D4)", () => {
  it("serves the fate from 0134's clear column; a sealed text naming another fate is not served", () => {
    expect(serve([turn(entry(1), text(1))])!.paths[0]!.current!.fate).toBe("PARTLY_HELD");
    expect(serve([turn(entry(1), text(1, { fate: "HELD_UP" }))])).toBeNull();
  });

  it("says the dig changed nothing only when the line and fate are the ones it was written on", () => {
    const unchanged = serve([turn(entry(1, { fate_after: "HELD_UP" }), text(1, { line: `  ${STORY_LINE}`, fate: "HELD_UP" }))])!;
    expect(unchanged.paths[0]!.history[0]).toMatchObject({ state: "READY", changed: false, fate_before: "HELD_UP" });
    const reworded = serve([turn(entry(1, { fate_after: "HELD_UP" }), text(1, { fate: "HELD_UP" }))])!;
    expect(reworded.paths[0]!.history[0]).toMatchObject({ changed: true });
    const refated = serve([turn(entry(1), text(1, { line: STORY_LINE }))])!;
    expect(refated.paths[0]!.history[0]).toMatchObject({ changed: true });
    // The second rewrite is compared with the first's text, line and summary.
    const second = serve([turn(entry(1), text(1)), turn(entry(2, { based_on_rewrite_id: RW(1), fate_before: "PARTLY_HELD" }),
      { ...text(2), text: { ...text(1).text } })])!;
    expect(second.paths[0]!.history.map((rewrite) => "changed" in rewrite ? rewrite.changed : null)).toEqual([true, false]);
    // No story line to compare with: the new text stands as a change.
    const noStory = serve([turn(entry(1, { fate_after: "HELD_UP" }), text(1, { line: STORY_LINE, fate: "HELD_UP" }))], { storyLines: new Map() })!;
    expect(noStory.paths[0]!.history[0]).toMatchObject({ changed: true });
  });

  it("shows the verdict only beside the person's own words, quoting them in order, its outcome and scope as codes", () => {
    const words = ownWordsOf([{ author: "AI_SUGGESTION", text: "Does winter ridership fall?" },
      { author: "PERSON_EDITED", text: "Does winter ridership fall in a cold year?" }, { author: "PERSON_OWN_VIEW", text: OWN_WORDS }]);
    expect(words).toEqual(["Does winter ridership fall in a cold year?", OWN_WORDS]);
    const shown = serve([turn(entry(1, { verdict_scope: "MAIN_QUESTION" }), text(1), words)])!.paths[0]!.history[0]!;
    expect("view" in shown && shown.view).toEqual({ outcome: "HELPED", scope: "MAIN_QUESTION", reason: "Why your view mattered, dig 1.",
      own_words: words });
    for (const none of [[], null] as const) {
      const hidden = serve([turn(entry(1), text(1), none)])!.paths[0]!.history[0]!;
      expect("view" in hidden && hidden.view).toBeNull();
    }
  });

  it("serves no engine number: no lineage, round, artifact, failure code or path order", () => {
    const served = JSON.stringify(serve([turn(entry(1), text(1)), turn(entry(2, { position_ref: "pos-b", path_seq: 1 }), text(2))]));
    for (const engine of ["ENGINE_WRITER_MODEL", "ENGINE_CHECKER_MODEL", "ENGINE_ARTIFACT_REF", "Anthropic", "Z.AI", "lineage",
      "rounds", "artifact", "path_seq", "failure_code", "parent_answer_version", "based_on"]) {
      expect(served).not.toContain(engine);
    }
  });
});

describe("W4-5 · paths changed since the answer was written (Q-D11)", () => {
  const twoPaths = [
    turn(entry(1), text(1)),
    turn(entry(2, { position_ref: "pos-b", path_seq: 1 }), text(2)),
    turn(entry(3, { position_ref: "pos-c", path_seq: 1, state: "FAILED", failure_code: "X", fate_after: null, verdict_outcome: null,
      verdict_scope: null, content: null }))
  ];

  it("before any report: every path with a finished rewrite, since the first answer", () => {
    expect(serve(twoPaths)!.changed_since).toEqual({ count: 2, since_report_version: null });
  });

  it("after a report: only the paths rewritten since it, with its version; a turn still writing does not count", () => {
    // Dig 1's rewrite (02:05) is before the report (02:30), dig 2's (03:05) after.
    const report = { version: 1, writtenAt: "2026-10-30T02:30:00.000Z" };
    expect(serve(twoPaths, { report })!.changed_since).toEqual({ count: 1, since_report_version: 1 });
    expect(serve([twoPaths[0]!], { report })!.changed_since).toEqual({ count: 0, since_report_version: 1 });
    const writing = turn(entry(4, { position_ref: "pos-a", path_seq: 2, state: "WRITING", rewrite_id: null, fate_before: null,
      fate_after: null, verdict_outcome: null, verdict_scope: null, recorded_at: null, content: null }));
    expect(serve([twoPaths[0]!, writing], { report })!.changed_since.count).toBe(0);
  });

  it("reads the newest written report of the investigation, skipping a closing whose report is not written yet", () => {
    expect(latestWrittenReportOf([])).toBeNull();
    expect(latestWrittenReportOf([{ report_version: 1, report_written_at: "2026-10-30T03:30:00.5+00:00" },
      { report_version: 2, report_written_at: null }])).toEqual({ version: 1, writtenAt: "2026-10-30T03:30:00.500Z" });
    expect(latestWrittenReportOf([{ report_version: 2, report_written_at: at(9) }, { report_version: 1, report_written_at: at(4) }]))
      .toEqual({ version: 2, writtenAt: ISO(9) });
  });
});

describe("W4-5 · a dig further down changed part of this (Q-D5)", () => {
  // The first debate (level 0) → dig 1 on its pos-a (level 1) → dig 2 on dig 1's path (level 2, FAILED) → dig 3 (level 3).
  const members = [
    { run_id: DEBATE, parent_run_id: null }, { run_id: DIG(1), parent_run_id: DEBATE },
    { run_id: DIG(2), parent_run_id: DIG(1) }, { run_id: DIG(3), parent_run_id: DIG(2) }
  ];

  it("marks the first debate's path when the dig three levels down finished its rewrite", () => {
    expect([...digLevelsOf(members)]).toEqual([[DEBATE, 0], [DIG(1), 1], [DIG(2), 2], [DIG(3), 3]]);
    const below = digsBelowOf(members, [DIG(1)]);
    expect(below.get(DIG(1))).toEqual([DIG(2), DIG(3)]);
    const marked = changedBelowPathsOf([entry(1)], below, new Set([DIG(3)]));
    expect([...marked]).toEqual(["pos-a"]);
    const served = serve([turn(entry(1), text(1))], { changedBelow: marked })!;
    expect(served.paths[0]).toMatchObject({ position_ref: "pos-a", changed_below: true });
    AnswerPathRewritesSchema.parse(served);
  });

  it("marks nothing when no dig below finished a rewrite (writing, failed, or none)", () => {
    expect([...changedBelowPathsOf([entry(1)], digsBelowOf(members, [DIG(1)]), new Set())]).toEqual([]);
    expect(serve([turn(entry(1), text(1))])!.paths[0]).not.toHaveProperty("changed_below");
    // The dig's own rewrite is no change further down.
    expect([...changedBelowPathsOf([entry(1)], digsBelowOf(members, [DIG(1)]), new Set([DIG(1)]))]).toEqual([]);
  });

  it("reads a broken tree (a loop) as no level, never looping", () => {
    expect(digLevelsOf([{ run_id: DIG(1), parent_run_id: DIG(2) }, { run_id: DIG(2), parent_run_id: DIG(1) }]).size).toBe(0);
  });
});

describe("W4-5 · a dig's own answer (Q-D2, Q-D13)", () => {
  const picks = [
    { kind: "NEEDS_MORE_WEB" as const, place: "path:pos-a", author: "AI_SUGGESTION" as const, text: "Does winter ridership fall?" },
    { kind: "OWN_VIEW" as const, place: "path:pos-a", author: "PERSON_OWN_VIEW" as const, text: OWN_WORDS }
  ];

  it("serves what it dug, who wrote each pick, its level and its rewrite with its own paths' lines and fates", () => {
    const [step] = pathHistoryOf({ turns: [turn(entry(1), text(1), ownWordsOf(picks))], levelOf: levels(1), storyLine: STORY_LINE });
    const dig = serveDig({ parentRunId: DEBATE, positionRef: "pos-a", places: ["path:pos-a"], level: 1, picks, rewrite: step!.rewrite })!;
    expect(dig).toMatchObject({ parent_run_id: DEBATE, position_ref: "pos-a", places: ["path:pos-a"], level: 1,
      picks: [{ kind: "NEEDS_MORE_WEB", text: "Does winter ridership fall?", by: "AI_SUGGESTION" },
        { kind: "OWN_VIEW", text: OWN_WORDS, by: "PERSON_OWN_VIEW" }],
      rewrite: { state: "READY", dig_paths: [{ position_ref: "dig-1-path", line: "The dig's own path 1.", fate: "FELL" }],
        view: { own_words: [OWN_WORDS] } } });
    AnswerDigSchema.parse(dig);
  });

  it("serves a dig before its turn with no rewrite, and none for a debate with no level", () => {
    expect(serveDig({ parentRunId: DEBATE, positionRef: "pos-a", places: [], level: 2, picks, rewrite: null })).toMatchObject({ rewrite: null });
    expect(serveDig({ parentRunId: DEBATE, positionRef: "pos-a", places: [], level: null, picks, rewrite: null })).toBeNull();
  });

  it("names a story's paths as the map and 0134 do: a position argued twice is `<ref>#2`", () => {
    const paragraph = { text: "A paragraph.", node_refs: ["n1"] };
    const body = { shape_id: "general", short: { headline: "H.", summary: "S.", confidence: "C.", change: paragraph,
      paths: [{ position_ref: "n1", fate: "HELD_UP", line: "First.", node_refs: ["n1"] },
        { position_ref: "n1", fate: "FELL", line: "Again.", node_refs: ["n1"] }] },
      why: { reasons: [paragraph] }, long: { sections: ["One", "Two", "Three"].map((title) => ({ title, paragraphs: [paragraph] })) },
      reviewer_note: null };
    expect([...storyPathLinesOf(body)]).toEqual([["n1", "First."], ["n1#2", "Again."]]);
    expect(storyPathLinesOf(null).size).toBe(0);
  });
});

describe("W4-8 · the rewritten path's trust words, worked out by code (Q-D3)", () => {
  // The path's own points (the story's: its position and two points) and a dig's, each with its own debate's checks.
  const NODE = { position: "pos-a", queues: "n-own-queues", cost: "n-own-cost", winter: "n-dig-winter", bridge: "n-dig-bridge", buses: "n-dig-buses" };
  const point = (over: Record<string, unknown> = {}) => ({ review: { outcome: "agree" }, staleness_state: "FRESH", way_of_knowing: "LOOKED_UP",
    looked_up_checked: true, ...over });
  const parentPoints: DebatePoints = { free: false, points: new Map([
    [NODE.position, point({ way_of_knowing: "REASONING" })], [NODE.queues, point()], [NODE.cost, point({ review: { outcome: "dispute" } })]]) };
  const digPoints: DebatePoints = { free: false, points: new Map([
    [NODE.winter, point()], [NODE.bridge, point({ looked_up_checked: false })], [NODE.buses, point()]]) };
  const sources = (over: Partial<PathTrustSources> = {}): PathTrustSources => ({
    own: { positionRef: NODE.position, nodeRefs: [NODE.position, NODE.queues, NODE.cost] }, parent: parentPoints,
    digOf: (digRunId) => (digRunId === DIG(1) ? digPoints : null), ...over
  });
  const resting = [NODE.queues, NODE.winter, NODE.bridge];
  /** `trust` null: the debates' points are not handed in at all (as W4-5 served). */
  const served = (opened: unknown, trust: PathTrustSources | null = sources(), extra: Partial<PathRewriteEntry> = {}) =>
    serve([turn(entry(1, extra), opened)], trust === null ? {} : { trustOf: () => trust })!.paths[0]!.history[0]!;

  it("serves the points the rewrite rests on, as sealed, and every point the path counts with its word: its own, then the dig's", () => {
    const rewrite = served(textResting(1, resting));
    expect(rewrite).toMatchObject({ state: "READY", rests_on: resting });
    expect("trust" in rewrite && rewrite.trust).toEqual([
      { node_id: NODE.position, word: "SURE_FOR_CASE" }, { node_id: NODE.queues, word: "SURE" }, { node_id: NODE.cost, word: "STILL_ARGUED" },
      { node_id: NODE.winter, word: "SURE" }, { node_id: NODE.bridge, word: "SURE_FOR_CASE" }]);
    // The dig's point the rewrite does not rest on is not the path's; words only, never a number.
    expect(JSON.stringify(rewrite)).not.toContain(NODE.buses);
    if ("trust" in rewrite) for (const counted of rewrite.trust!) expect(Object.keys(counted)).toEqual(["node_id", "word"]);
    expect(restsOnOf(textResting(1, resting))).toEqual(resting);
  });

  it("an old row with no rests_on reads as resting on none: its words are the path's own points'", () => {
    const rewrite = served(text(1));
    expect(rewrite).toMatchObject({ rests_on: [] });
    expect("trust" in rewrite && rewrite.trust!.map((counted) => counted.node_id)).toEqual([NODE.position, NODE.queues, NODE.cost]);
    expect(restsOnOf(text(1))).toEqual([]);
    // Without the debates' points the rewrite serves as W4-5 did, plus the empty list.
    const plain = served(text(1), null);
    expect(plain).toMatchObject({ rests_on: [] });
    expect(plain).not.toHaveProperty("trust");
    // A stored list that is not one of ids makes no rewrite.
    expect(serve([turn(entry(1), { ...text(1), rests_on: [7] })])).toBeNull();
  });

  it("'Sure' only by a checked extract of the debate that holds the point: the dig's own checks and plan for the dig's points", () => {
    // The dig's point without the server's checked flag is at most "Sure, for the case named", whatever the parent's flags.
    const unchecked = served(textResting(1, [NODE.winter]), sources({ digOf: () => ({ free: false, points: new Map([[NODE.winter, point({ looked_up_checked: false })]]) }) }));
    expect("trust" in unchecked && unchecked.trust!.at(-1)).toEqual({ node_id: NODE.winter, word: "SURE_FOR_CASE" });
    // A dig that ran on Free never gives "Sure", while the parent's own checked point stays "Sure".
    const free = served(textResting(1, [NODE.winter]), sources({ digOf: () => ({ ...digPoints, free: true }) }));
    expect("trust" in free && free.trust!.filter((counted) => counted.word === "SURE").map((counted) => counted.node_id)).toEqual([NODE.queues]);
    // A rested-on id the dig's points do not hold is left out, never weighed with the parent's checks.
    const stranger = served(textResting(1, ["n-not-the-digs"]));
    expect("trust" in stranger && stranger.trust!.map((counted) => counted.node_id)).toEqual([NODE.position, NODE.queues, NODE.cost]);
  });

  it("the path's position takes the rewrite's FELL; the dig's points never do", () => {
    const fell = served(textResting(1, [NODE.winter], { fate: "FELL" }), sources(), { fate_after: "FELL" });
    expect("trust" in fell && fell.trust).toEqual([{ node_id: NODE.position, word: "DIDNT_HOLD" }, { node_id: NODE.queues, word: "SURE" },
      { node_id: NODE.cost, word: "STILL_ARGUED" }, { node_id: NODE.winter, word: "SURE" }]);
  });

  it("serves no word when the path's points, its debate's or the dig's it rests on cannot be read", () => {
    expect(served(textResting(1, resting), sources({ own: null }))).not.toHaveProperty("trust");
    expect(served(textResting(1, resting), sources({ parent: null }))).not.toHaveProperty("trust");
    expect(served(textResting(1, resting), sources({ digOf: () => null }))).not.toHaveProperty("trust");
    // Resting only on the path's own points, the dig's points are not needed.
    expect(served(textResting(1, [NODE.queues]), sources({ digOf: () => null }))).toHaveProperty("trust");
    expect(rewriteTrustOf({ fate: "HELD_UP", digRunId: DIG(1), restsOn: [], sources: sources({ own: null }) })).toBeNull();
  });

  it("a rewrite still writing or failed, and a path no dig rewrote, carry no word: the page counts as before", () => {
    const writing = entry(2, { state: "WRITING", rewrite_id: null, fate_before: null, fate_after: null, verdict_outcome: null,
      verdict_scope: null, recorded_at: null, content: null, based_on_rewrite_id: RW(1) });
    const failedEntry = entry(3, { state: "FAILED", failure_code: "PATH_REWRITE_ALL_WRITERS_FAILED", fate_after: null, verdict_outcome: null,
      verdict_scope: null, content: null, based_on_rewrite_id: RW(1), fate_before: "PARTLY_HELD" });
    const path = serve([turn(entry(1), textResting(1, resting)), turn(writing), turn(failedEntry)], { trustOf: () => sources() })!.paths[0]!;
    expect(path.history.map((rewrite) => ["trust" in rewrite, "rests_on" in rewrite])).toEqual([[true, true], [false, false], [false, false]]);
    // Only paths a dig took a turn on are listed at all.
    expect(serve([], { trustOf: () => sources() })).toBeNull();
  });

  it("names a story path's own points as the map does: its position and the nodes the story names on it", () => {
    const paragraph = { text: "A paragraph.", node_refs: ["n1"] };
    const body = { shape_id: "general", short: { headline: "H.", summary: "S.", confidence: "C.", change: paragraph,
      paths: [{ position_ref: "n1", fate: "HELD_UP", line: "First.", node_refs: ["n1", "n2"] },
        { position_ref: "n1", fate: "FELL", line: "Again.", node_refs: ["n1", "n3"] }] },
      why: { reasons: [paragraph] }, long: { sections: ["One", "Two", "Three"].map((title) => ({ title, paragraphs: [paragraph] })) },
      reviewer_note: null };
    expect([...storyPathPointsOf(body)]).toEqual([["n1", { positionRef: "n1", nodeRefs: ["n1", "n2"] }],
      ["n1#2", { positionRef: "n1", nodeRefs: ["n1", "n3"] }]]);
    expect(storyPathPointsOf(undefined).size).toBe(0);
  });
});

/* ----------------------------------------------------------------- the repository, on a stand-in pool */

const OWNERSHIP = { ownerRef: "00000000-0000-4000-8000-0000000000c1", legacyAskerId: null } as const;

/**
 * One answer read (tests/unit/serve-web-sources.test.ts's stand-in). `rewrites` is what 0134's
 * identity.read_path_rewrites_of_run answers per run (absent: a database that knows no such read); `investigation` 0133's
 * reader. `answer: false` is a debate that is not the reader's (the ownership check finds no row). Every read is kept.
 */
function answerReadPool(reads: string[], options: Readonly<{ rewrites?: Record<string, unknown>; investigation?: unknown;
  answer?: boolean }> = {}): Pool {
  const when = new Date("2026-10-21T00:00:00.000Z");
  const answerRow = {
    answer_id: "answer-1", answer_version: 1, run_id: DEBATE, release_key: "r22-000000000000", served_root_rule: null,
    question_line: "Should Harbour Town build a second ferry pier?", run_content_ciphertext: null, fact_bundle_id: "facts-1", facts: [],
    facts_content_ciphertext: null, composed_text_id: null, composed_content_ciphertext: null, terminal: "SERVED",
    serve_state: "COMPOSED", verdict_state: "SUPPORTED", verdict_unavailable: null, confidence_band: null, band_ceiling: null,
    answer_form: null, answer_content_ciphertext: null, segments: [], residual_objections: [], condition_marks: [], badges: [],
    reversal_point: "none", builds_on_previous: null, memory_disclosure: null, sealed_at_seq: 1, risk_tier: "LOW",
    tier_source: "classifier", tier_provenance_ref: "tier", envelope_basis: { kind: "COMPUTED_STRUCTURAL_CEILING" },
    envelope_state: "WITHIN", envelope_consumed: 1, composition_budget_tier: "low", conformance_segment_results: null,
    conformance_coverage_mode: null, conformance_record_id: null, conformance_content_ciphertext: null, as_of: when,
    relevant_as_of: when, role_assignment_row: null, verdict_votes: [], root_sites: []
  };
  const query = async (sql: string, params: readonly unknown[] = []) => {
    reads.push(sql);
    if (sql.includes("AS root_sites")) return { rows: options.answer === false ? [] : [answerRow] };
    if (sql.includes("identity.read_path_rewrites_of_run")) {
      const answered = options.rewrites?.[String(params[0])];
      return { rows: answered === undefined ? [] : [{ rewrites: answered }] };
    }
    if (sql.includes("identity.read_investigation_of_run")) return { rows: [{ investigation: options.investigation ?? null }] };
    if (sql.includes("pg_try_advisory_lock_shared")) return { rows: [{ acquired: true }] };
    if (sql.includes("pg_advisory_unlock_shared")) return { rows: [{ unlocked: true }] };
    if (sql.includes("run_private_content_is_live")) return { rows: (params[0] as string[]).map((runId) => ({ run_id: runId, live: true })) };
    return { rows: [] };
  };
  const client = { query, release: () => undefined };
  return { query, connect: async () => client } as unknown as Pool;
}

const readAnswer = (pool: Pool, ownership: Parameters<ServeRepository["readAnswerProjection"]>[1] = OWNERSHIP) =>
  new ServeRepository(pool).readAnswerProjection("answer-1", ownership);
const rewriteReads = (reads: readonly string[]) => reads.filter((sql) => /identity\.read_(path_rewrites|dig_picks|investigation)/u.test(sql));

describe("W4-5 · through the repository", () => {
  it("serves an old answer byte for byte: no rewrite rows, no picks, nothing added", async () => {
    const unknown: string[] = [];
    const before = await readAnswer(answerReadPool(unknown));
    const empty: string[] = [];
    const none = await readAnswer(answerReadPool(empty, { rewrites: { [DEBATE]: { paths: [], own: null } } }));
    expect(JSON.stringify(none)).toBe(JSON.stringify(before));
    expect(none).not.toHaveProperty("path_rewrites");
    expect(none).not.toHaveProperty("dig");
    // Two reads at most: the rewrites, then (none) the picks; no investigation, no lease for the dig model.
    expect(rewriteReads(empty).map((sql) => sql.match(/identity\.read_\w+/u)![0])).toEqual(["identity.read_path_rewrites_of_run",
      "identity.read_dig_picks_of_run"]);
  });

  it("serves a path whose dig is still rewriting it, its level from the investigation", async () => {
    const writing = entry(1, { state: "WRITING", rewrite_id: null, fate_before: null, fate_after: null, verdict_outcome: null,
      verdict_scope: null, writer_lineage: null, checker_lineage: null, rounds: null, artifact_refs: null, recorded_at: null, content: null });
    const reads: string[] = [];
    const answer = await readAnswer(answerReadPool(reads, {
      rewrites: { [DEBATE]: { paths: [writing], own: null }, [DIG(1)]: { paths: [], own: writing } },
      investigation: { closings: [], members: [{ run_id: DEBATE, parent_run_id: null, places: [] },
        { run_id: DIG(1), parent_run_id: DEBATE, places: ["path:pos-a"] }] }
    }));
    expect(answer!.path_rewrites).toEqual({
      paths: [{ position_ref: "pos-a", current: null, history: [{ rewrite_id: pathRewriteIdOf(DIG(1)), dig_run_id: DIG(1), dig_level: 1,
        dig_finished_at: ISO(2), state: "WRITING" }] }],
      changed_since: { count: 0, since_report_version: null }
    });
    expect(answer).not.toHaveProperty("dig");
    AnswerPathRewritesSchema.parse(answer!.path_rewrites);
  });

  it("serves nothing to anyone but the owner: no answer row, a legacy asker, or a read inside another lease reads no rewrite", async () => {
    const rewrites = { [DEBATE]: { paths: [entry(1)], own: null } };
    const stranger: string[] = [];
    expect(await readAnswer(answerReadPool(stranger, { rewrites, answer: false }))).toBeNull();
    expect(rewriteReads(stranger)).toEqual([]);
    const legacy: string[] = [];
    const legacyAnswer = await readAnswer(answerReadPool(legacy, { rewrites }), { ownerRef: null, legacyAskerId: "asker:legacy" });
    expect(legacyAnswer).not.toHaveProperty("path_rewrites");
    expect(rewriteReads(legacy)).toEqual([]);
    // The publication and the review catch-up read the answer inside their own lease on the debate: no rewrite comes.
    const leased: string[] = [];
    const pool = answerReadPool(leased, { rewrites });
    const inLease = await withRunContentLease(pool, [DEBATE], () => readAnswer(pool));
    expect(inLease).not.toHaveProperty("path_rewrites");
    expect(rewriteReads(leased)).toEqual([]);
  });
});

describe("W4-5 · never in the public debate", () => {
  it("publishes an answer carrying rewrites and a dig exactly as one without them", async () => {
    const rewrites = serve([turn(entry(1), text(1))], { changedBelow: new Set(["pos-a"]) })!;
    const [step] = pathHistoryOf({ turns: [turn(entry(1), text(1))], levelOf: levels(1), storyLine: STORY_LINE });
    const dig = serveDig({ parentRunId: DEBATE, positionRef: "pos-a", places: ["path:pos-a"], level: 1,
      picks: [{ kind: "OWN_VIEW", place: "path:pos-a", author: "PERSON_OWN_VIEW", text: OWN_WORDS }], rewrite: step!.rewrite })!;
    const base = AnswerSchema.parse(buildFairShapedAnswer());
    const withRewrites: Answer = AnswerSchema.parse({ ...base, path_rewrites: rewrites satisfies AnswerPathRewrites, dig });
    const publicBody = (answer: Answer) => buildPublicDebateBody({
      runId: DEBATE, answer, owner: { userId: "user-1", ownerRef: OWNERSHIP.ownerRef },
      readers: {
        stories: { readStoryShort: async () => null },
        repository: { readArgumentLanguageTag: async () => null, readAnswerFloor: async () => null } as never,
        mapViews: { readMapView: async () => null } as never
      },
      source: {} as never
    });
    const published = JSON.stringify(await publicBody(withRewrites));
    expect(published).toBe(JSON.stringify(await publicBody(base)));
    for (const owned of ["Rewritten line 1.", "What dig 1 changed.", "Why your view mattered", OWN_WORDS, "dig-1-path", "changed_below"]) {
      expect(published).not.toContain(owned);
    }
  });
});
