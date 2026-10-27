import { describe, expect, it } from "vitest";
import type { Answer, AnswerStory } from "@debateai/contract";
import {
  STORY_FIXTURE_ANSWER,
  storyFixture,
  storyFixtureEdge,
  storyFixtureNode
} from "../../apps/ui/lib/v3/storyFixture.js";
import { addCounts, countTrust, emptyCounts, pointsOf } from "../../apps/ui/lib/v4/trust.js";
import { buildV4Map, findOpenQuestion, findPath, openQuestionsOf } from "../../apps/ui/lib/v4/mapModel.js";
import type { V4Map, V4OpenQuestion } from "../../apps/ui/lib/v4/types.js";

/** V4 initial (2026-10-28): the B1 data model — trust words, paths, open questions and the one star. */

type Node = Answer["nodes"][number];
type Edge = Answer["edges"][number];
type Review = Readonly<{ outcome: "agree" | "dispute" | "cannot-assess"; reason: string }> | null;

function node(id: string, review: Review, way: Node["way_of_knowing"] = "REASONING", extra: Partial<Node> = {}): Node {
  return {
    ...storyFixtureNode({
      id, claim: `Claim ${id}.`, way, base: 0.5, final: 0.5, maker: "OpenAI",
      review: review === null ? null : { outcome: review.outcome, by: "Anthropic", reason: review.reason },
      locator: null, marks: []
    }),
    ...extra
  };
}

function defeat(from: string, to: string): Edge {
  return { ...storyFixtureEdge({ from, to, relation: "attack", strength: 0.5 }), relation: "defeat" };
}

function answerWith(nodes: Node[], edges: Edge[] = [], extra: Partial<Answer> = {}): Answer {
  return { ...STORY_FIXTURE_ANSWER, nodes, edges, ...extra };
}

type StoryPath = NonNullable<AnswerStory["story"]>["short"]["paths"][number];

function storyWith(paths: StoryPath[], status: AnswerStory["status"] = "READY"): AnswerStory {
  const story = storyFixture(status);
  story.story!.short.paths = paths;
  return story;
}

function allOpen(map: V4Map): V4OpenQuestion[] {
  return [...map.open, ...map.paths.flatMap((path) => path.open)];
}

describe("trust words (first-version mapping)", () => {
  it("places every review outcome on its word and basis", () => {
    const points = pointsOf(answerWith([
      node("looked", { outcome: "agree", reason: "Matches the source." }, "LOOKED_UP"),
      node("ran", { outcome: "agree", reason: "Ran it." }, "RAN"),
      node("reasoned", { outcome: "agree", reason: "Sound." }, "REASONING"),
      node("dated", { outcome: "agree", reason: "Was true." }, "LOOKED_UP", { staleness_state: "STALE", relevant_as_of: "2025-01-02T00:00:00.000Z" }),
      node("disputed", { outcome: "dispute", reason: "Not so." }),
      node("unsure", { outcome: "cannot-assess", reason: "No data." }),
      node("unchecked", null)
    ]));
    const word = (id: string) => [points.get(id)?.trust, points.get(id)?.basis];
    expect(word("looked")).toEqual(["SURE", "LOOKED_UP_AND_AGREED"]);
    expect(word("ran")).toEqual(["SURE", "LOOKED_UP_AND_AGREED"]);
    expect(word("reasoned")).toEqual(["SURE_FOR_CASE", "ARGUED_AND_AGREED"]);
    expect(word("dated")).toEqual(["SURE_FOR_CASE", "AGREED_BUT_DATED"]);
    expect(points.get("dated")?.asOf).toBe("2025-01-02T00:00:00.000Z");
    expect(points.get("looked")?.asOf).toBeNull();
    expect(word("disputed")).toEqual(["STILL_ARGUED", "DISPUTED"]);
    expect(word("unsure")).toEqual(["STILL_ARGUED", "COULD_NOT_CHECK"]);
    expect(word("unchecked")).toEqual([null, null]);
    expect(points.get("disputed")?.reasons).toEqual(["Not so."]);
    expect(points.get("unchecked")?.reasons).toEqual([]);
    expect([...points.keys()]).toEqual(["looked", "ran", "reasoned", "dated", "disputed", "unsure", "unchecked"]);
  });

  it("treats an UNDER_REVIEW agreed point as dated too (any staleness other than FRESH)", () => {
    const points = pointsOf(answerWith([node("a", { outcome: "agree", reason: "ok" }, "REASONING", { staleness_state: "UNDER_REVIEW" })]));
    expect(points.get("a")?.basis).toBe("AGREED_BUT_DATED");
  });

  it("lets an incoming defeat beat every other rule and names who answered it", () => {
    const points = pointsOf(answerWith(
      [
        node("agreed", { outcome: "agree", reason: "ok" }, "LOOKED_UP"),
        node("unreviewed", null),
        node("answerer", { outcome: "agree", reason: "ok" }),
        node("orphan", { outcome: "dispute", reason: "no" })
      ],
      [defeat("answerer", "agreed"), defeat("answerer", "unreviewed"), defeat("missing", "orphan")]
    ));
    expect(points.get("agreed")).toMatchObject({ trust: "DIDNT_HOLD", basis: "ANSWERED", answeredBy: "Claim answerer.", reasons: ["ok"] });
    expect(points.get("unreviewed")).toMatchObject({ trust: "DIDNT_HOLD", basis: "ANSWERED", answeredBy: "Claim answerer." });
    expect(points.get("orphan")).toMatchObject({ trust: "DIDNT_HOLD", answeredBy: null });
    expect(points.get("answerer")?.trust).toBe("SURE_FOR_CASE");
  });

  it("ignores attacks, supports and defeats aimed at an edge", () => {
    const edgeDefeat: Edge = { ...defeat("b", "a"), target_kind: "EDGE", target_ref: "a" };
    const points = pointsOf(answerWith(
      [node("a", { outcome: "agree", reason: "ok" }), node("b", null)],
      [storyFixtureEdge({ from: "b", to: "a", relation: "attack", strength: 0.9 }), edgeDefeat]
    ));
    expect(points.get("a")?.trust).toBe("SURE_FOR_CASE");
  });

  it("never carries a score", () => {
    for (const point of pointsOf(STORY_FIXTURE_ANSWER).values()) {
      expect(Object.keys(point).sort()).toEqual(["answeredBy", "asOf", "basis", "id", "reasons", "text", "trust"]);
    }
    expect(JSON.stringify(buildV4Map({ runId: "r", answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY") })))
      .not.toMatch(/base_score|final_strength|strength/u);
  });

  it("counts words, keeps unchecked apart, and adds counts", () => {
    const points = [...pointsOf(answerWith([
      node("a", { outcome: "agree", reason: "ok" }, "LOOKED_UP"),
      node("b", { outcome: "dispute", reason: "no" }),
      node("c", null),
      node("d", null)
    ])).values()];
    const { counts, unchecked } = countTrust(points);
    expect(counts).toEqual({ SURE: 1, SURE_FOR_CASE: 0, STILL_ARGUED: 1, DIDNT_HOLD: 0 });
    expect(unchecked).toBe(2);
    expect(emptyCounts()).toEqual({ SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 });
    expect(addCounts(counts, { SURE: 2, SURE_FOR_CASE: 1, STILL_ARGUED: 0, DIDNT_HOLD: 3 }))
      .toEqual({ SURE: 3, SURE_FOR_CASE: 1, STILL_ARGUED: 1, DIDNT_HOLD: 3 });
  });
});

describe("buildV4Map", () => {
  it("reads the fixture: story paths in order, points by node_refs, root open questions and the star on 'w'", () => {
    const map = buildV4Map({ runId: "run-1", answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY") });
    expect(map.runId).toBe("run-1");
    expect(map.answerId).toBe(STORY_FIXTURE_ANSWER.answer_id);
    expect(map.question).toBe(STORY_FIXTURE_ANSWER.question_line);
    expect(map.storyState).toBe("READY");
    expect(map.paths.map((path) => path.id)).toEqual(["n-hybrid", "n-yes", "n-not-now"]);
    expect(map.paths.map((path) => path.fate)).toEqual(["PARTLY_HELD", "PARTLY_HELD", "FELL"]);
    expect(map.paths[0]?.points.map((point) => point.id)).toEqual(["n-hybrid", "n-hybrid-school"]);
    expect(map.paths[0]?.open).toEqual([
      { id: "p:n-hybrid-school", kind: "STILL_ARGUED", text: map.paths[0]?.points[1]?.text, star: false, pathId: "n-hybrid" }
    ]);
    expect(map.paths[2]?.counts).toEqual({ SURE: 0, SURE_FOR_CASE: 1, STILL_ARGUED: 1, DIDNT_HOLD: 0 });
    expect(map.points.map((point) => point.id)).toEqual(STORY_FIXTURE_ANSWER.nodes.map((n) => n.node_id));
    expect(map.counts).toEqual({ SURE: 2, SURE_FOR_CASE: 3, STILL_ARGUED: 2, DIDNT_HOLD: 0 });
    expect(map.unchecked).toBe(1);
    expect(map.open).toEqual([
      { id: "o:0", kind: "OBJECTION", text: STORY_FIXTURE_ANSWER.residual_objections[0], star: false, pathId: null },
      { id: "w", kind: "WOULD_CHANGE", text: STORY_FIXTURE_ANSWER.reversal_point, star: true, pathId: null }
    ]);
    expect(allOpen(map).filter((question) => question.star)).toHaveLength(1);
    const body = storyFixture("READY").story!;
    expect(map.headline).toBe(body.short.headline);
    expect(map.summary).toBe(body.short.summary);
    expect(map.confidence).toBe(body.short.confidence);
    expect(map.why).toEqual(body.why.reasons.map((reason) => reason.text));
    expect(map.sections[0]).toEqual({ title: body.long.sections[0]?.title, paragraphs: [body.long.sections[0]?.paragraphs[0]?.text] });
    expect(map.sections).toHaveLength(body.long.sections.length);
    expect(map.wouldChange).toBe(STORY_FIXTURE_ANSWER.reversal_point);
    expect(map.objections).toEqual(STORY_FIXTURE_ANSWER.residual_objections);
  });

  it("works out the story state", () => {
    const answer = STORY_FIXTURE_ANSWER;
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("READY_WITH_RESERVATION") }).storyState).toBe("READY");
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("WRITING") }).storyState).toBe("WRITING");
    expect(buildV4Map({ runId: "r", answer, story: null }).storyState).toBe("WRITING");
    expect(buildV4Map({ runId: "r", answer, story: null, storyGaveUp: true }).storyState).toBe("UNAVAILABLE");
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("WRITING"), storyGaveUp: true }).storyState).toBe("WRITING");
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("UNAVAILABLE") }).storyState).toBe("UNAVAILABLE");
    const noBody = { ...storyFixture("READY"), story: null };
    const map = buildV4Map({ runId: "r", answer, story: noBody });
    expect(map.storyState).toBe("UNAVAILABLE");
    expect([map.headline, map.summary, map.confidence, map.why, map.sections]).toEqual([null, null, null, [], []]);
  });

  it("uses one stand-in path with every point when there is no story", () => {
    const map = buildV4Map({ runId: "r", answer: STORY_FIXTURE_ANSWER, story: storyFixture("WRITING") });
    expect(map.paths).toHaveLength(1);
    expect(map.paths[0]).toMatchObject({ id: "all", fate: null, line: STORY_FIXTURE_ANSWER.composed_text[0]?.text });
    expect(map.paths[0]?.points.map((point) => point.id)).toEqual(STORY_FIXTURE_ANSWER.nodes.map((n) => n.node_id));
    expect(map.paths[0]?.open.map((question) => question.id)).toEqual(["p:n-not-now", "p:n-hybrid-school"]);
    expect(map.paths[0]?.counts).toEqual(map.counts);
    const bare = buildV4Map({ runId: "r", answer: { ...STORY_FIXTURE_ANSWER, composed_text: [] }, story: null });
    expect(bare.paths[0]?.line).toBe(STORY_FIXTURE_ANSWER.question_line);
  });

  it("suffixes repeated position_refs, skips unknown ids and drops duplicates within a path", () => {
    const answer = answerWith([node("a", { outcome: "dispute", reason: "x" }), node("b", null)]);
    const map = buildV4Map({ runId: "r", answer, story: storyWith([
      { position_ref: "a", fate: "HELD_UP", line: "One.", node_refs: ["a", "ghost", "b", "a"] },
      { position_ref: "a", fate: "FELL", line: "Two.", node_refs: ["b"] },
      { position_ref: "a", fate: "SET_ASIDE", line: "Three.", node_refs: [] }
    ]) });
    expect(map.paths.map((path) => path.id)).toEqual(["a", "a#2", "a#3"]);
    expect(map.paths[0]?.points.map((point) => point.id)).toEqual(["a", "b"]);
    expect(map.paths[0]?.unchecked).toBe(1);
    expect(findPath(map, "a#2")?.line).toBe("Two.");
    expect(findPath(map, "nope")).toBeNull();
  });

  it("trims objections and the turning point, skipping blanks, with ids by original position", () => {
    const answer = answerWith([node("a", null)], [], { residual_objections: ["  ", " First. ", "Second."], reversal_point: "   " });
    const map = buildV4Map({ runId: "r", answer, story: null });
    expect(map.open.map((question) => [question.id, question.text, question.star])).toEqual([["o:1", "First.", true], ["o:2", "Second.", false]]);
    expect(map.wouldChange).toBeNull();
    expect(map.objections).toEqual(["First.", "Second."]);
  });
});

describe("the one star", () => {
  const disputed = (id: string) => node(id, { outcome: "dispute", reason: "x" });
  const quiet = { residual_objections: [], reversal_point: " " } satisfies Partial<Answer>;

  it("falls to the first still-argued point under a path that held up", () => {
    const answer = answerWith([disputed("a"), disputed("b"), disputed("c")], [], quiet);
    const map = buildV4Map({ runId: "r", answer, story: storyWith([
      { position_ref: "a", fate: "FELL", line: "Fell.", node_refs: ["a"] },
      { position_ref: "b", fate: "PARTLY_HELD", line: "Partly.", node_refs: ["b", "c"] }
    ]) });
    expect(allOpen(map).filter((question) => question.star).map((question) => [question.id, question.pathId])).toEqual([["p:b", "b"]]);
    expect(openQuestionsOf(map)[0]).toMatchObject({ id: "p:b", star: true });
  });

  it("falls to the first open question when no path held up", () => {
    const answer = answerWith([disputed("a"), disputed("b")], [], quiet);
    const map = buildV4Map({ runId: "r", answer, story: storyWith([
      { position_ref: "a", fate: "FELL", line: "Fell.", node_refs: ["a"] },
      { position_ref: "b", fate: "SET_ASIDE", line: "Aside.", node_refs: ["b"] }
    ]) });
    expect(allOpen(map).filter((question) => question.star).map((question) => question.id)).toEqual(["p:a"]);
  });

  it("gives a point argued under several paths one question per path but one star", () => {
    const answer = answerWith([disputed("a")], [], quiet);
    const map = buildV4Map({ runId: "r", answer, story: storyWith([
      { position_ref: "x", fate: "HELD_UP", line: "X.", node_refs: ["a"] },
      { position_ref: "y", fate: "HELD_UP", line: "Y.", node_refs: ["a"] }
    ]) });
    expect(map.paths.map((path) => path.open.map((question) => [question.id, question.pathId, question.star])))
      .toEqual([[["p:a", "x", true]], [["p:a", "y", false]]]);
    expect(findOpenQuestion(map, "p:a")).toMatchObject({ pathId: "x", star: true });
  });

  it("prefers 'w' over objections, objections over points, and has none when nothing is open", () => {
    const withBoth = buildV4Map({ runId: "r", answer: answerWith([disputed("a")]), story: null });
    expect(allOpen(withBoth).filter((question) => question.star).map((question) => question.id)).toEqual(["w"]);
    expect(openQuestionsOf(withBoth).map((question) => question.id)).toEqual(["w", "o:0", "p:a"]);
    const objectionOnly = buildV4Map({ runId: "r", answer: answerWith([disputed("a")], [], { reversal_point: " " }), story: null });
    expect(allOpen(objectionOnly).filter((question) => question.star).map((question) => question.id)).toEqual(["o:0"]);
    const none = buildV4Map({ runId: "r", answer: answerWith([node("a", null)], [], quiet), story: null });
    expect(allOpen(none)).toEqual([]);
    expect(findOpenQuestion(none, "w")).toBeNull();
  });
});
