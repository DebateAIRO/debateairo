import { describe, expect, it } from "vitest";
import type { Answer, AnswerStory } from "@debateai/contract";
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_FLOOR_ANSWER,
  storyFixture,
  storyFixtureEdge,
  storyFixtureNode
} from "../../apps/ui/lib/v3/storyFixture.js";
import { addCounts, countTrust, emptyCounts, fellPositionsOf, pointsOf } from "../../apps/ui/lib/v4/trust.js";
import {
  buildV4Map,
  findOpenQuestion,
  findPath,
  openQuestionsOf,
  storyReadFailed,
  uniqueOpenQuestions
} from "../../apps/ui/lib/v4/mapModel.js";
import { unreadableStory } from "../../apps/ui/lib/v4/load.js";
import type { V4Map, V4OpenQuestion } from "../../apps/ui/lib/v4/types.js";

/** V4 initial (2026-10-28): the B1 data model — trust words, paths, open questions and the one star (+ fix wave 1). */

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

const FIXTURE_COMPOSED = STORY_FIXTURE_ANSWER.composed_text.map((segment) => segment.text.trim()).filter(Boolean).join("\n\n");

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

  it("never marks a point DIDNT_HOLD from edges: real answers aim 'defeat' at edges only (Decision B)", () => {
    const edgeDefeat: Edge = { ...defeat("b", "a"), target_kind: "EDGE", target_ref: "edge-1" };
    const points = pointsOf(answerWith(
      [node("a", { outcome: "agree", reason: "ok" }), node("b", null), node("c", { outcome: "dispute", reason: "no" })],
      [storyFixtureEdge({ from: "b", to: "a", relation: "attack", strength: 0.9 }), edgeDefeat, defeat("b", "c")]
    ));
    expect(points.get("a")).toMatchObject({ trust: "SURE_FOR_CASE", answeredBy: null });
    expect(points.get("b")?.trust).toBeNull();
    expect(points.get("c")?.trust).toBe("STILL_ARGUED");
  });

  it("marks the position of a ready story's FELL path DIDNT_HOLD / FELL, whatever its review said (Decision B)", () => {
    const answer = answerWith([
      node("pos", { outcome: "agree", reason: "ok" }, "LOOKED_UP"),
      node("kid", { outcome: "dispute", reason: "no" }),
      node("other", null)
    ]);
    const story = storyWith([
      { position_ref: "pos", fate: "FELL", line: "Fell.", node_refs: ["pos", "kid"] },
      { position_ref: "other", fate: "HELD_UP", line: "Held.", node_refs: ["other"] }
    ]);
    expect([...fellPositionsOf(story)]).toEqual(["pos"]);
    const points = pointsOf(answer, story);
    expect(points.get("pos")).toMatchObject({ trust: "DIDNT_HOLD", basis: "FELL", answeredBy: null, reasons: ["ok"], asOf: null });
    // Only the position: the points under it keep their own words.
    expect(points.get("kid")?.trust).toBe("STILL_ARGUED");
    expect(points.get("other")?.trust).toBeNull();
    // Without a story, or with one that is not ready, nothing fell.
    expect(pointsOf(answer).get("pos")?.trust).toBe("SURE");
    expect(fellPositionsOf(storyFixture("WRITING")).size).toBe(0);
    expect(fellPositionsOf({ ...story, status: "UNAVAILABLE" }).size).toBe(0);
    expect(fellPositionsOf(null).size).toBe(0);
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
    // "Not now" FELL: its position does not hold (Decision B), so it is no longer an open question.
    expect(map.paths[2]?.counts).toEqual({ SURE: 0, SURE_FOR_CASE: 1, STILL_ARGUED: 0, DIDNT_HOLD: 1 });
    expect(map.paths[2]?.open).toEqual([]);
    expect(map.points.find((point) => point.id === "n-not-now")).toMatchObject({ trust: "DIDNT_HOLD", basis: "FELL" });
    expect(map.points.map((point) => point.id)).toEqual(STORY_FIXTURE_ANSWER.nodes.map((n) => n.node_id));
    expect(map.counts).toEqual({ SURE: 2, SURE_FOR_CASE: 3, STILL_ARGUED: 1, DIDNT_HOLD: 1 });
    expect(map.unchecked).toBe(1);
    const body = storyFixture("READY").story!;
    // DATA-7: with a ready story, "what would change it" is the story's checked change paragraph.
    expect(map.open).toEqual([
      { id: "o:0", kind: "OBJECTION", text: STORY_FIXTURE_ANSWER.residual_objections[0], star: false, pathId: null },
      { id: "w", kind: "WOULD_CHANGE", text: body.short.change.text, star: true, pathId: null }
    ]);
    expect(allOpen(map).filter((question) => question.star)).toHaveLength(1);
    expect(map.fallbackText).toBeNull();
    expect(map.reservation).toBe(false);
    expect(map.headline).toBe(body.short.headline);
    expect(map.summary).toBe(body.short.summary);
    expect(map.confidence).toBe(body.short.confidence);
    expect(map.why).toEqual(body.why.reasons.map((reason) => reason.text));
    expect(map.sections[0]).toEqual({ title: body.long.sections[0]?.title, paragraphs: [body.long.sections[0]?.paragraphs[0]?.text] });
    expect(map.sections).toHaveLength(body.long.sections.length);
    expect(map.wouldChange).toBe(body.short.change.text);
    expect(map.objections).toEqual(STORY_FIXTURE_ANSWER.residual_objections);
  });

  it("uses the answer's turning point without a ready story, with node ids cut out (DATA-7)", () => {
    const writing = buildV4Map({ runId: "r", answer: STORY_FIXTURE_ANSWER, story: storyFixture("WRITING") });
    expect(writing.wouldChange).toBe(STORY_FIXTURE_ANSWER.reversal_point);
    expect(writing.open.find((question) => question.id === "w")?.text).toBe(STORY_FIXTURE_ANSWER.reversal_point);
    const withIds = answerWith([node("a", null)], [], {
      reversal_point: "If point (0f8fad5b-d9cb-469f-a165-70867728950e) were wrong, see 7C9E6679-7425-40DE-944B-E07FC1F90AE7 too."
    });
    expect(buildV4Map({ runId: "r", answer: withIds, story: null }).wouldChange).toBe("If point were wrong, see too.");
    const blankChange = storyFixture("READY");
    blankChange.story!.short.change.text = "   ";
    expect(buildV4Map({ runId: "r", answer: STORY_FIXTURE_ANSWER, story: blankChange }).wouldChange).toBe(STORY_FIXTURE_ANSWER.reversal_point);
  });

  it("keeps the other text of 'w' (the reversal_point) once the story's change text is used (R2DIG-4 / R2REG-2)", () => {
    const ready = buildV4Map({ runId: "r", answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY") });
    expect(ready.wouldChange).toBe(storyFixture("READY").story!.short.change.text);
    expect(ready.wouldChangeAlt).toBe(STORY_FIXTURE_ANSWER.reversal_point);
    // Node ids are cut from the other text too.
    const withIds = answerWith([node("a", null)], [], { reversal_point: "Cheaper gas (0f8fad5b-d9cb-469f-a165-70867728950e) for years." });
    expect(buildV4Map({ runId: "r", answer: withIds, story: storyFixture("READY") }).wouldChangeAlt).toBe("Cheaper gas for years.");
    // No ready story: the reversal_point IS the text shown, so there is no other text.
    expect(buildV4Map({ runId: "r", answer: STORY_FIXTURE_ANSWER, story: storyFixture("WRITING") }).wouldChangeAlt).toBeNull();
    expect(buildV4Map({ runId: "r", answer: STORY_FIXTURE_ANSWER, story: null }).wouldChangeAlt).toBeNull();
    // The story says the same thing (spaces aside), or there is no reversal_point: null.
    const same = storyFixture("READY");
    same.story!.short.change.text = `  ${STORY_FIXTURE_ANSWER.reversal_point.replace(/ /g, "  ")} `;
    expect(buildV4Map({ runId: "r", answer: STORY_FIXTURE_ANSWER, story: same }).wouldChangeAlt).toBeNull();
    const noReversal = answerWith([node("a", null)], [], { reversal_point: "  " });
    expect(buildV4Map({ runId: "r", answer: noReversal, story: storyFixture("READY") }).wouldChangeAlt).toBeNull();
  });

  it("keeps the whole composed answer only while there is no ready story body (DATA-2)", () => {
    const answer = STORY_FIXTURE_ANSWER;
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("WRITING") }).fallbackText).toBe(FIXTURE_COMPOSED);
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("UNAVAILABLE") }).fallbackText).toBe(FIXTURE_COMPOSED);
    expect(buildV4Map({ runId: "r", answer, story: null }).fallbackText).toBe(FIXTURE_COMPOSED);
    expect(buildV4Map({ runId: "r", answer, story: { ...storyFixture("READY"), story: null } }).fallbackText).toBe(FIXTURE_COMPOSED);
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("READY") }).fallbackText).toBeNull();
    // A components-only answer with nothing composed has no fallback text (no words invented).
    expect(buildV4Map({ runId: "r", answer: STORY_FIXTURE_FLOOR_ANSWER, story: null }).fallbackText).toBeNull();
    const blanks = answerWith([node("a", null)], [], { composed_text: [{ ...STORY_FIXTURE_ANSWER.composed_text[0]!, text: "  " }] });
    expect(buildV4Map({ runId: "r", answer: blanks, story: null }).fallbackText).toBeNull();
  });

  it("carries the reservation only for a READY_WITH_RESERVATION story with a body (DATA-5/RULES-1)", () => {
    const answer = STORY_FIXTURE_ANSWER;
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("READY_WITH_RESERVATION") }).reservation).toBe(true);
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("READY") }).reservation).toBe(false);
    expect(buildV4Map({ runId: "r", answer, story: { ...storyFixture("READY_WITH_RESERVATION"), story: null } }).reservation).toBe(false);
    expect(buildV4Map({ runId: "r", answer, story: null }).reservation).toBe(false);
  });

  it("cuts only the story's own point numbers out of why and the long sections (DATA-4)", () => {
    const story = storyFixture("READY");
    story.point_numbers = { "n-yes": "P1", "n-hybrid": "P3", "n-yes-rent": "P12" };
    story.story!.why.reasons = [
      { text: "The pay rise holds (P1, P3).", node_refs: [] },
      { text: "P12: rents are higher [P3]; the P2 visa and P30 stay.", node_refs: [] },
      { text: "P1", node_refs: [] }
    ];
    story.story!.long.sections[0]!.paragraphs = [{ text: "As P3 and P1 show , the move pays.", node_refs: [] }];
    const map = buildV4Map({ runId: "r", answer: STORY_FIXTURE_ANSWER, story });
    expect(map.why).toEqual(["The pay rise holds.", "rents are higher; the P2 visa and P30 stay."]);
    expect(map.sections[0]?.paragraphs).toEqual(["As and show, the move pays."]);
    // Text without any of the story's tokens is left exactly as written.
    expect(map.sections[1]?.paragraphs).toEqual(story.story!.long.sections[1]!.paragraphs.map((paragraph) => paragraph.text));
    const noNumbers = { ...storyFixture("READY"), point_numbers: null };
    noNumbers.story!.why.reasons = [{ text: "Keeps P1 as written.", node_refs: [] }];
    expect(buildV4Map({ runId: "r", answer: STORY_FIXTURE_ANSWER, story: noNumbers }).why).toEqual(["Keeps P1 as written."]);
  });

  it("works out the story state", () => {
    const answer = STORY_FIXTURE_ANSWER;
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("READY_WITH_RESERVATION") }).storyState).toBe("READY");
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("WRITING") }).storyState).toBe("WRITING");
    expect(buildV4Map({ runId: "r", answer, story: null }).storyState).toBe("WRITING");
    expect(buildV4Map({ runId: "r", answer, story: null, storyGaveUp: true }).storyState).toBe("UNAVAILABLE");
    // R2TIME-3: a story still being written reads as unavailable once the page has given up waiting (it no longer asks).
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("WRITING"), storyGaveUp: true }).storyState).toBe("UNAVAILABLE");
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("WRITING"), storyGaveUp: false }).storyState).toBe("WRITING");
    expect(buildV4Map({ runId: "r", answer, story: storyFixture("UNAVAILABLE") }).storyState).toBe("UNAVAILABLE");
    const noBody = { ...storyFixture("READY"), story: null };
    const map = buildV4Map({ runId: "r", answer, story: noBody });
    expect(map.storyState).toBe("UNAVAILABLE");
    expect([map.headline, map.summary, map.confidence, map.why, map.sections]).toEqual([null, null, null, [], []]);
    // DATA-3/DATA-10: a read that failed for a moment reads as still being written until the page gives up.
    for (const reason of ["STORY_UNREADABLE", "STORY_READ_FAILED"]) {
      const failed = unreadableStory(answer.answer_id, 1, reason);
      expect(buildV4Map({ runId: "r", answer, story: failed }).storyState).toBe("WRITING");
      expect(buildV4Map({ runId: "r", answer, story: failed, storyGaveUp: true }).storyState).toBe("UNAVAILABLE");
    }
    expect(buildV4Map({ runId: "r", answer, story: unreadableStory(answer.answer_id, 1, "STORY_NOT_FOUND") }).storyState).toBe("UNAVAILABLE");
  });

  it("tells a failed story read worth trying again from a final one (storyReadFailed)", () => {
    expect(storyReadFailed(unreadableStory("a", 1, "STORY_UNREADABLE"))).toBe(true);
    expect(storyReadFailed(unreadableStory("a", 1, "STORY_READ_FAILED"))).toBe(true);
    for (const reason of ["STORY_NOT_FOUND", "STORY_SESSION_REQUIRED", "STORY_FORBIDDEN", "STORY_WINDOW_PASSED"]) {
      expect(storyReadFailed(unreadableStory("a", 1, reason))).toBe(false);
    }
    expect(storyReadFailed(storyFixture("READY"))).toBe(false);
    expect(storyReadFailed(storyFixture("WRITING"))).toBe(false);
    expect(storyReadFailed(null)).toBe(false);
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
  /** A ready story with no "what would change it" paragraph either (DATA-7 reads it from the story). */
  const quietStory = (paths: StoryPath[]): AnswerStory => {
    const story = storyWith(paths);
    story.story!.short.change.text = " ";
    return story;
  };

  it("falls to the first still-argued point under a path that held up", () => {
    const answer = answerWith([disputed("a"), disputed("b"), disputed("c")], [], quiet);
    const map = buildV4Map({ runId: "r", answer, story: quietStory([
      { position_ref: "a", fate: "FELL", line: "Fell.", node_refs: ["a"] },
      { position_ref: "b", fate: "PARTLY_HELD", line: "Partly.", node_refs: ["b", "c"] }
    ]) });
    expect(allOpen(map).filter((question) => question.star).map((question) => [question.id, question.pathId])).toEqual([["p:b", "b"]]);
    expect(openQuestionsOf(map)[0]).toMatchObject({ id: "p:b", star: true });
  });

  it("falls to the first open question when no path held up", () => {
    const answer = answerWith([disputed("a"), disputed("a-kid"), disputed("b")], [], quiet);
    const map = buildV4Map({ runId: "r", answer, story: quietStory([
      { position_ref: "a", fate: "FELL", line: "Fell.", node_refs: ["a", "a-kid"] },
      { position_ref: "b", fate: "SET_ASIDE", line: "Aside.", node_refs: ["b"] }
    ]) });
    // "a" fell (Decision B), so the first open question is the point still argued under it.
    expect(allOpen(map).filter((question) => question.star).map((question) => question.id)).toEqual(["p:a-kid"]);
    expect(allOpen(map).map((question) => question.id)).toEqual(["p:a-kid", "p:b"]);
  });

  it("gives a point argued under several paths one question per path but one star", () => {
    const answer = answerWith([disputed("a")], [], quiet);
    const map = buildV4Map({ runId: "r", answer, story: quietStory([
      { position_ref: "x", fate: "HELD_UP", line: "X.", node_refs: ["a"] },
      { position_ref: "y", fate: "HELD_UP", line: "Y.", node_refs: ["a"] }
    ]) });
    expect(map.paths.map((path) => path.open.map((question) => [question.id, question.pathId, question.star])))
      .toEqual([[["p:a", "x", true]], [["p:a", "y", false]]]);
    expect(findOpenQuestion(map, "p:a")).toMatchObject({ pathId: "x", star: true });
  });

  it("hangs a still-argued point no story path cites under the question itself (DATA-6)", () => {
    const answer = answerWith([disputed("a"), disputed("loose"), node("b", null)], [], quiet);
    const map = buildV4Map({ runId: "r", answer, story: quietStory([
      { position_ref: "a", fate: "HELD_UP", line: "A.", node_refs: ["a"] },
      { position_ref: "b", fate: "SET_ASIDE", line: "B.", node_refs: ["b"] }
    ]) });
    expect(map.open).toEqual([{ id: "p:loose", kind: "STILL_ARGUED", text: "Claim loose.", star: false, pathId: null }]);
    expect(map.paths[0]?.open.map((question) => [question.id, question.star])).toEqual([["p:a", true]]);
    // With nothing under any path, the loose point carries the star.
    const looseOnly = buildV4Map({ runId: "r", answer, story: quietStory([
      { position_ref: "b", fate: "HELD_UP", line: "B.", node_refs: ["b"] }
    ]) });
    expect(allOpen(looseOnly).filter((question) => question.star).map((question) => [question.id, question.pathId]))
      .toEqual([["p:a", null]]);
    expect(looseOnly.open.map((question) => question.id)).toEqual(["p:a", "p:loose"]);
  });

  it("lists every open question once with uniqueOpenQuestions, star first (FIT-1/FIT-2)", () => {
    const answer = answerWith([disputed("a"), disputed("b")], [], quiet);
    const map = buildV4Map({ runId: "r", answer, story: quietStory([
      { position_ref: "x", fate: "SET_ASIDE", line: "X.", node_refs: ["b", "a"] },
      { position_ref: "y", fate: "HELD_UP", line: "Y.", node_refs: ["a"] }
    ]) });
    expect(openQuestionsOf(map).map((question) => question.id)).toEqual(["p:a", "p:b", "p:a"]);
    expect(uniqueOpenQuestions(map).map((question) => [question.id, question.star, question.pathId]))
      .toEqual([["p:a", true, "y"], ["p:b", false, "x"]]);
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
