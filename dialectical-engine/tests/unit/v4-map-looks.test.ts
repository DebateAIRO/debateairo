import { describe, expect, it } from "vitest";
import type { Answer, AnswerStory, PathRewrite } from "@debateai/contract";
import { STORY_FIXTURE_ANSWER, storyFixture, storyFixtureNode } from "../../apps/ui/lib/v3/storyFixture.js";
import {
  cardLabel,
  digGround,
  digOutcome,
  dugIds,
  firstByOf,
  howSureKeys,
  openLeftCount,
  pathHolds,
  pathOutcome,
  reportMoment,
  rewriteOutcome,
  settledIds,
  starOf
} from "../../apps/ui/lib/v4/mapLooks.js";
import { buildV4Map, restarMap } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigView, TrustCounts, V4Map, V4OpenQuestion, V4Path, V4Point } from "../../apps/ui/lib/v4/types.js";

/*
 * V4 screen review (owner picks of 3 Nov, OWNER-PICKS-2026-11-03.md): the rules behind the map's looks and words
 * (lib/v4/mapLooks.ts) and the moving star (lib/v4/mapModel.ts restarMap).
 *   map-f8: the "How sure" sentence, from a small fixed set, built only from trust words.
 *   dig-d4 / journey-f11: a finished dig is Corrected, Added to or Confirmed, or found nothing new.
 *   map-f26 / dig-f29: the count drops only for Confirmed or Corrected digs; "Good time to write your report" follows it.
 *   map-f5 / journey-f12: exactly one star, on an open question no dig covers, moving on when that one is dug.
 *   r2-20 A / map-f25: one trust word per path; card titles without the outcome words.
 */

const counts = (sure: number, kase: number, argued: number, fell: number): TrustCounts =>
  ({ SURE: sure, SURE_FOR_CASE: kase, STILL_ARGUED: argued, DIDNT_HOLD: fell });

const point = (id: string, trust: V4Point["trust"]): V4Point =>
  ({ id, text: `Claim ${id}`, trust, basis: null, reasons: [], answeredBy: null, asOf: null });

const FINISHED = "2026-10-30T09:15:00.000Z";
const rewrite = (changed: boolean, before: "HELD_UP" | "PARTLY_HELD" | "FELL" = "HELD_UP", after: "HELD_UP" | "PARTLY_HELD" | "FELL" = before,
  extra: Partial<Extract<PathRewrite, { state: "READY" }>> = {}): PathRewrite => ({
  rewrite_id: "rw-1", dig_run_id: "c-done", dig_level: 1, dig_finished_at: FINISHED, state: "READY", rewritten_at: "2026-10-30T09:18:00.000Z",
  changed, text: { line: "The line", summary: "The summary.", fate: after }, what_changed: ["One sentence."], fate_before: before, view: null,
  dig_paths: [], ...extra
});

const dig = (childRunId: string, state: DigView["state"], places: readonly string[], extra: Partial<DigView> = {}): DigView => ({
  link: { parentRunId: "run-1", childRunId, openQuestionIds: places, questions: [`Dig ${childRunId}`], mode: "quick", startedAt: null },
  state, headline: null, counts: state === "DONE" ? counts(1, 0, 0, 0) : null, ...extra
});

const open = (id: string, pathId: string | null, kind: V4OpenQuestion["kind"] = "STILL_ARGUED", star = false): V4OpenQuestion =>
  ({ id, kind, text: `Open ${id}`, star, pathId });

function mapOf(rootOpen: readonly V4OpenQuestion[], paths: readonly Partial<V4Path>[]): V4Map {
  return {
    runId: "run-1", answerId: "a-1", answerVersion: 1, question: "Q?", headline: null, summary: null, confidence: null, why: [], sections: [],
    paths: paths.map((path, index) => ({ id: `p${index}`, fate: "HELD_UP", line: `Line ${index}`, points: [], counts: counts(0, 0, 0, 0), unchecked: 0, open: [], ...path })),
    points: [], open: rootOpen, counts: counts(0, 0, 0, 0), unchecked: 0, wouldChange: null, wouldChangeAlt: null, objections: [],
    storyState: "READY", fallbackText: null, reservation: false
  };
}

describe("map-f8: how sure, in words only", () => {
  it("says the one word when only one is there, the word with more than half otherwise, or that the findings are mixed", () => {
    expect(howSureKeys(counts(3, 0, 0, 0))).toEqual(["v4.sure.SURE.all"]);
    expect(howSureKeys(counts(0, 2, 0, 0))).toEqual(["v4.sure.SURE_FOR_CASE.all"]);
    // The owner's example: "Mostly sure for the case named. One point is still argued."
    expect(howSureKeys(counts(3, 6, 1, 0))).toEqual(["v4.sure.SURE_FOR_CASE.most", "v4.sure.argued.one"]);
    expect(howSureKeys(counts(4, 1, 0, 0))).toEqual(["v4.sure.SURE.most"]);
    expect(howSureKeys(counts(1, 0, 3, 0))).toEqual(["v4.sure.STILL_ARGUED.most"]);
    expect(howSureKeys(counts(0, 1, 0, 3))).toEqual(["v4.sure.DIDNT_HOLD.most"]);
    expect(howSureKeys(counts(1, 1, 1, 1))).toEqual(["v4.sure.mixed", "v4.sure.argued.one", "v4.sure.fell.one"]);
    expect(howSureKeys(counts(1, 1, 2, 2))).toEqual(["v4.sure.mixed", "v4.sure.argued.some", "v4.sure.fell.some"]);
  });

  it("says nothing was checked when nothing was, and names unchecked points without counting them", () => {
    expect(howSureKeys(counts(0, 0, 0, 0))).toEqual(["v4.sure.none"]);
    expect(howSureKeys(counts(0, 0, 0, 0), 4)).toEqual(["v4.sure.none"]);
    expect(howSureKeys(counts(2, 0, 0, 0), 5)).toEqual(["v4.sure.SURE.all", "v4.sure.unchecked"]);
  });
});

describe("dig-d4 / journey-f11: what a finished dig did", () => {
  it("a rewrite that changed the text: Corrected when the outcome moved, else Added to", () => {
    expect(rewriteOutcome(rewrite(true, "PARTLY_HELD", "HELD_UP"), null)).toBe("CORRECTED");
    expect(rewriteOutcome(rewrite(true, "HELD_UP", "HELD_UP"), null)).toBe("ADDED_TO");
  });

  it("a rewrite that changed nothing: Confirmed only when a point the dig found came out sure; else nothing new", () => {
    expect(rewriteOutcome(rewrite(false), true)).toBe("CONFIRMED");
    expect(rewriteOutcome(rewrite(false), false)).toBe("NOTHING_NEW");
    expect(rewriteOutcome(rewrite(false), null)).toBeNull();
    // Without the dig's points, the server's words for the points the rewrite rests on tell it.
    const resting = rewrite(false, "HELD_UP", "HELD_UP", { rests_on: ["d1"], trust: [{ node_id: "d1", word: "SURE_FOR_CASE" }, { node_id: "p1", word: "STILL_ARGUED" }] });
    expect(rewriteOutcome(resting, null)).toBe("CONFIRMED");
    const unsure = rewrite(false, "HELD_UP", "HELD_UP", { rests_on: ["d1"], trust: [{ node_id: "d1", word: "STILL_ARGUED" }, { node_id: "p1", word: "SURE" }] });
    expect(rewriteOutcome(unsure, null)).toBe("NOTHING_NEW");
    expect(rewriteOutcome({ rewrite_id: "w", dig_run_id: "c", dig_level: 1, dig_finished_at: FINISHED, state: "WRITING" }, true)).toBeNull();
  });

  it("a dig: nothing while it works or failed, nothing for one from before R22, its own points for one of the question's own", () => {
    expect(digOutcome(dig("c", "RUNNING", ["w"]))).toBeNull();
    expect(digOutcome(dig("c", "FAILED", ["w"]))).toBeNull();
    expect(digOutcome(dig("c", "DONE", ["w"]))).toBeNull();
    expect(digOutcome(dig("c", "DONE", ["w"], { rewrite: null, points: [point("d1", "SURE")] }))).toBe("CONFIRMED");
    expect(digOutcome(dig("c", "DONE", ["w"], { rewrite: null, points: [point("d1", "STILL_ARGUED")] }))).toBe("NOTHING_NEW");
    // A dig of a path whose rewrite is not read yet says nothing yet.
    expect(digOutcome(dig("c", "DONE", ["path:p0"], { rewrite: null, points: [point("d1", "SURE")] }))).toBeNull();
    expect(digOutcome(dig("c", "DONE", ["path:p0"], { rewrite: rewrite(true, "FELL", "PARTLY_HELD") }))).toBe("CORRECTED");
  });

  it("a path carries its newest finished rewrite's outcome; it holds when its own word is sure", () => {
    const path: V4Path = {
      ...mapOf([], [{}]).paths[0]!, trust: "SURE_FOR_CASE",
      rewrites: { original: { line: "Before", fate: "HELD_UP" }, history: [rewrite(false)], changedBelow: false }
    };
    expect(pathOutcome(path, [dig("c-done", "DONE", ["path:p0"], { points: [point("d1", "SURE")] })])?.outcome).toBe("CONFIRMED");
    expect(pathOutcome(path, [])).toBeNull();
    expect(pathHolds(path)).toBe(true);
    expect(pathHolds({ ...path, trust: "DIDNT_HOLD" })).toBe(false);
    expect(pathHolds({ ...path, trust: null, fate: "PARTLY_HELD" })).toBe(true);
  });
});

describe("map-f26 / dig-f29: what is still open, and when it is a good time for the report", () => {
  const map = mapOf([open("w", null, "WOULD_CHANGE", true), open("o:0", null, "OBJECTION")], [{ open: [open("p:a", "p0")] }]);
  const confirmed = (id: string, place: string): DigView => dig(id, "DONE", [place], { rewrite: null, points: [point(`${id}-1`, "SURE")] });

  it("only a dig that came back Confirmed or Corrected takes a question off the count; one that only started does not", () => {
    expect(openLeftCount(map, [])).toBe(3);
    expect(openLeftCount(map, [dig("c1", "RUNNING", ["o:0"])])).toBe(3);
    expect(openLeftCount(map, [confirmed("c1", "o:0")])).toBe(2);
    expect(openLeftCount(map, [dig("c1", "DONE", ["o:0"], { rewrite: null, points: [point("x", "STILL_ARGUED")] })])).toBe(3);
    expect([...settledIds([confirmed("c1", "o:0")])]).toEqual(["o:0"]);
    // A dig that did not fail moves the star off what it covers, running or not.
    expect([...dugIds([dig("c1", "RUNNING", ["o:0"]), dig("c2", "FAILED", ["w"])])]).toEqual(["o:0"]);
  });

  it("is not a good time after one dig on something else: the owner's example gets the neutral line", () => {
    expect(reportMoment(map, [], "w")).toBeNull();
    expect(reportMoment(map, [confirmed("c1", "p:a")], "w")).toBe("DIG_DONE");
    // While something runs, neither line.
    expect(reportMoment(map, [confirmed("c1", "p:a"), dig("c2", "RUNNING", ["o:0"])], "w")).toBeNull();
  });

  it("is a good time once nothing is left open, or once the first star was looked into and nothing open could change the answer", () => {
    expect(reportMoment(map, [confirmed("c1", "w"), confirmed("c2", "o:0"), confirmed("c3", "p:a")], "w")).toBe("GOOD");
    expect(reportMoment(map, [confirmed("c1", "w")], "w")).toBe("GOOD");
    // The star was looked into but found nothing new, so "what would change it" is still open: not yet.
    expect(reportMoment(map, [dig("c1", "DONE", ["w"], { rewrite: null, points: [] })], "w")).toBe("DIG_DONE");
  });
});

describe("map-f5 / journey-f12: one star, moving on", () => {
  const map = mapOf([open("w", null, "WOULD_CHANGE", true), open("o:0", null, "OBJECTION")], [{ open: [open("p:a", "p0")] }]);

  it("keeps the map as it is when its star is not dug", () => {
    expect(restarMap(map, new Set())).toBe(map);
    expect(restarMap(map, new Set(["p:a"]))).toBe(map);
  });

  it("moves the star to the next open question in the same order when the starred one is dug, never leaving a second", () => {
    const moved = restarMap(map, new Set(["w"]));
    expect(starOf(moved)?.id).toBe("o:0");
    expect([...moved.open, ...moved.paths.flatMap((path) => path.open)].filter((question) => question.star)).toHaveLength(1);
    const next = restarMap(map, new Set(["w", "o:0"]));
    expect(starOf(next)).toMatchObject({ id: "p:a", pathId: "p0" });
    expect(starOf(restarMap(map, new Set(["w", "o:0", "p:a"])))).toBeNull();
  });
});

describe("r2-20 A / map-f25: a path's one trust word, and titles without outcome words", () => {
  it("takes the word of the point a path stands for; a path that fell has \"Didn't hold\"", () => {
    const disputed = storyFixtureNode({ id: "a", claim: "A.", way: "REASONING", base: 0.5, final: 0.5, maker: "OpenAI",
      review: { outcome: "dispute", by: "Anthropic", reason: "x" }, locator: null, marks: [] });
    const agreed = storyFixtureNode({ id: "b", claim: "B.", way: "REASONING", base: 0.5, final: 0.5, maker: "OpenAI",
      review: { outcome: "agree", by: "Anthropic", reason: "x" }, locator: null, marks: [] });
    const answer: Answer = { ...STORY_FIXTURE_ANSWER, nodes: [disputed, agreed], edges: [] };
    const story: AnswerStory = storyFixture("READY");
    story.story!.short.paths = [
      { position_ref: "a", fate: "PARTLY_HELD", line: "A: partly held. Because.", node_refs: ["a"] },
      { position_ref: "b", fate: "FELL", line: "B: did not hold. Because.", node_refs: ["b"] }
    ];
    const built = buildV4Map({ runId: "r", answer, story });
    expect(built.paths.map((path) => path.trust)).toEqual(["STILL_ARGUED", "DIDNT_HOLD"]);
  });

  it("cuts a story line's own outcome clause off the card title, and leaves any other line whole", () => {
    expect(cardLabel("Mostly renewables, plus some nuclear: held up. The cheapest clean grids pair a lot of wind and sun."))
      .toBe("Mostly renewables, plus some nuclear");
    expect(cardLabel("Nuclear first: did not hold. Recent reactors took 12 to 17 years.")).toBe("Nuclear first");
    expect(cardLabel("Wait for small modular reactors: set aside.")).toBe("Wait for small modular reactors");
    expect(cardLabel("Cost: the cheapest grids pair a lot of wind and sun with firm power.")).toBe("Cost: the cheapest grids pair a lot of wind and sun with firm power.");
    expect(cardLabel("No colon here, just a line.")).toBe("No colon here, just a line.");
  });
});

describe("journey-f2 and dig-f20", () => {
  it("a dig at work is ground being looked into; a paused or finished one is settled", () => {
    expect(digGround(dig("c", "RUNNING", ["w"]))).toBe("LOOKING");
    expect(digGround(dig("c", "WAITING", ["w"]))).toBe("LOOKING");
    expect(digGround(dig("c", "DONE", ["w"], { rewrite: { rewrite_id: "w", dig_run_id: "c", dig_level: 1, dig_finished_at: FINISHED, state: "WRITING" } }))).toBe("LOOKING");
    expect(digGround(dig("c", "RUNNING", ["w"], { pausedUntil: "2026-12-01T00:00:00.000Z" }))).toBe("SETTLED");
    expect(digGround(dig("c", "DONE", ["w"]))).toBe("SETTLED");
  });

  it("who wrote a dig's first pick: the person for their own view or their wording, an AI otherwise", () => {
    const question = open("p:a", "p0");
    const suggestion = { suggestion_id: "s1", kind: "CONTRADICTING" as const, text: "As written.", place: "path:p0" };
    expect(firstByOf({ kind: "open", questions: [question] })).toBe("AI");
    expect(firstByOf({ kind: "picks", path: null, picks: [{ kind: "OWN_VIEW", key: "own:1", group: "p0", text: "Mine." }] })).toBe("PERSON");
    expect(firstByOf({ kind: "picks", path: null, picks: [{ kind: "SUGGESTION", key: "s", group: "p0", suggestion, text: "As written." }] } as never)).toBe("AI");
    expect(firstByOf({ kind: "picks", path: null, picks: [{ kind: "SUGGESTION", key: "s", group: "p0", suggestion, text: "My wording." }] } as never)).toBe("PERSON");
  });
});
