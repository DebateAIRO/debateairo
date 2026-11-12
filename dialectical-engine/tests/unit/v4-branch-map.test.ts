import { describe, expect, it } from "vitest";
import {
  AnswerSchema,
  RunProjectionSchema,
  type Answer,
  type AnswerBranch,
  type AnswerBranches,
  type AnswerStory,
  type PathOutcome,
  type PathRewrite,
  type RunPathProgress,
  type RunProjection
} from "@debateai/contract";
import { STORY_FIXTURE_ANSWER, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import {
  buildV4Map,
  buildV4PendingMap,
  buildV4RunMap,
  findPath,
  pathTagOf,
  pointsOfFindings,
  v4BranchOf
} from "../../apps/ui/lib/v4/mapModel.js";
import { V4_PATH_TAGS, type V4DigPick, type V4Map, type V4Selection } from "../../apps/ui/lib/v4/types.js";
import { pathWebOf } from "../../apps/ui/lib/v4/web.js";

/*
 * V4 start step, Task 60 (spec 2026-11-03 §2 items 7 and 8; items wait-d1, map-d2, journey-f1, map-f4, wait-f9, wait-f16,
 * chat-undo-after-start, r2-8): the map's paths are the person's chosen paths. A served path debate draws one path per branch
 * (its id the path id, its points the nodes under its root); while it runs, the run read draws the same paths from the start,
 * each filling in from its own progress; during Start's Undo window the page draws them before any run exists. No path is made up.
 * All words and figures are made up.
 */

const Q = "Should Romania build new nuclear plants?";
const T1 = "Whole-system costs";
const T2 = "Cernavodă jobs";
const T3 = "Using less power first";

const ready = (line: string, fate: "HELD_UP" | "PARTLY_HELD" | "FELL" | "SET_ASIDE", trust: PathOutcome["trust"],
  whatChanged: string[] = []): PathOutcome => ({
  state: "READY", text: { line, summary: `Summary of ${line}`, fate }, what_changed: whatChanged, view: null, trust, rests_on: []
});
const failed: PathOutcome = { state: "FAILED", text: null, what_changed: [], view: null, trust: null, rests_on: [] };

function branch(n: number, extra: Partial<AnswerBranch>): AnswerBranch {
  return {
    path_id: `b${n}`, order: n, title: `Path ${n}`, question: `Question of path ${n}?`, author: "AI_SUGGESTION",
    viewpoints: [{ title: `Viewpoint ${n}`, question: `Question of path ${n}?`, own: false }],
    state: "LOOKING", root_node_id: null, outcome: null, ...extra
  };
}

const B1 = branch(1, {
  title: T1, question: "What does each choice cost the whole power system?", state: "ARGUED", root_node_id: "n-yes",
  viewpoints: [
    { title: "Plant costs", question: "What do new plants cost to build?", own: false },
    { title: "Grid costs", question: "What does the grid need for each choice?", own: false }
  ],
  outcome: ready("Line b1.", "PARTLY_HELD", "SURE_FOR_CASE", ["Changed b1."])
});
const B2 = branch(2, {
  title: T2, question: "What happens to the jobs at Cernavodă?", author: "PERSON_OWN_VIEW", state: "FAILED",
  viewpoints: [{ title: null, question: "My own words about the jobs.", own: true }], outcome: failed
});
const B3 = branch(3, { title: T3, state: "ARGUED", root_node_id: "n-not-now", outcome: ready("Line b3.", "FELL", "DIDNT_HOLD") });

function branchesOf(paths: AnswerBranch[], extra: Partial<AnswerBranches> = {}): AnswerBranches {
  return {
    source: "MENU", width: 3, paths,
    more: [
      { more_id: "more-kp02", title: "Falling prices", question: "Will falling prices of solar change the choice?", is_new: false },
      { more_id: "more-kp07", title: "Building delays", question: "How often are new plants late?", is_new: true }
    ],
    also_raised: ["A point no path took."],
    main_trust: "SURE_FOR_CASE",
    carry_on_to_report: true,
    ...extra
  };
}

/** A served path debate on the fixture's nodes: b1 under "n-yes", b2 failed, b3 under "n-not-now"; b1 searched the web. */
function v2Answer(extra: Partial<Answer> = {}): Answer {
  return AnswerSchema.parse({
    ...STORY_FIXTURE_ANSWER,
    branches: branchesOf([B1, B2, B3]),
    web: { paths: [
      { position_ref: "b1", search: { status: "SEARCHED" }, other_pages: [], suggestions: [] },
      { position_ref: "b3", search: { status: "FAILED" }, other_pages: [], suggestions: [] }
    ] },
    ...extra
  });
}

/** A v2 story: its paths are named by path id. */
function v2Story(): AnswerStory {
  const story = storyFixture("READY");
  story.story!.short.paths = [
    { position_ref: "b1", fate: "HELD_UP", line: "Story b1.", node_refs: ["n-yes"] },
    { position_ref: "b2", fate: "SET_ASIDE", line: "Story b2.", node_refs: ["n-yes"] },
    { position_ref: "b3", fate: "PARTLY_HELD", line: "Story b3.", node_refs: ["n-not-now"] }
  ];
  return story;
}

const NEW_KEYS = ["phase", "pending", "more", "alsoRaised", "mainTrust", "carryOnToReport"] as const;

describe("a served path debate's map (Answer.branches)", () => {
  it("a no-branches answer's map has no new key", () => {
    const map = buildV4Map({ runId: "r", answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY") });
    for (const key of NEW_KEYS) expect(Object.keys(map)).not.toContain(key);
    expect(map.paths.map((path) => path.id)).toEqual(["n-hybrid", "n-yes", "n-not-now"]);
    expect(map.paths.some((path) => "branch" in path)).toBe(false);
  });

  it("draws one path per branch, in order, its id the path id, its line the outcome's or the title", () => {
    const map = buildV4Map({ runId: "r", answer: v2Answer(), story: null });
    expect(map.paths.map((path) => [path.id, path.positionRef, path.branch?.title, path.branch?.state]))
      .toEqual([["b1", "b1", T1, "ARGUED"], ["b2", "b2", T2, "FAILED"], ["b3", "b3", T3, "ARGUED"]]);
    expect(map.paths.map((path) => path.line)).toEqual(["Line b1.", T2, "Line b3."]);
    expect(map.paths.map((path) => path.fate)).toEqual(["PARTLY_HELD", null, "FELL"]);
    expect(findPath(map, "b2")?.branch?.title).toBe(T2);
  });

  it("puts the nodes under each root on its path and counts its bar from them", () => {
    const map = buildV4Map({ runId: "r", answer: v2Answer(), story: null });
    expect(map.paths.map((path) => path.points.map((point) => point.id)))
      .toEqual([["n-yes", "n-yes-pay", "n-yes-rent"], [], ["n-not-now", "n-not-now-once"]]);
    expect(map.paths[0]?.counts).toEqual({ SURE: 0, SURE_FOR_CASE: 3, STILL_ARGUED: 0, DIDNT_HOLD: 0 });
    expect(map.paths[1]?.counts).toEqual({ SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 });
    // The question's own bar still counts every point.
    expect(map.points.map((point) => point.id)).toEqual(STORY_FIXTURE_ANSWER.nodes.map((node) => node.node_id));
  });

  it("a path whose answer so far FELL makes its root not hold (Decision B)", () => {
    const map = buildV4Map({ runId: "r", answer: v2Answer(), story: null });
    // The root's review disputed it (STILL_ARGUED on its own); its path fell, so it did not hold.
    expect(map.points.find((point) => point.id === "n-not-now")).toMatchObject({ trust: "DIDNT_HOLD", basis: "FELL" });
    expect(map.paths[2]?.counts).toEqual({ SURE: 0, SURE_FOR_CASE: 1, STILL_ARGUED: 0, DIDNT_HOLD: 1 });
    expect(map.paths[2]?.open).toEqual([]);
  });

  it("the outcome's fate wins over the story's; a path without one takes the story's", () => {
    const map = buildV4Map({ runId: "r", answer: v2Answer(), story: v2Story() });
    expect(map.storyState).toBe("READY");
    expect(map.paths.map((path) => path.fate)).toEqual(["PARTLY_HELD", "SET_ASIDE", "FELL"]);
    // The story's lines never replace the path's own.
    expect(map.paths.map((path) => path.line)).toEqual(["Line b1.", T2, "Line b3."]);
  });

  it("a dig's rewrite of b2 moves its line and keeps its title", () => {
    const rewrite: PathRewrite = {
      rewrite_id: "rw-b2", dig_run_id: "d9000000-0000-4000-8000-000000000001", dig_level: 1, dig_finished_at: "2026-11-05T09:00:00.000Z",
      state: "READY", rewritten_at: "2026-11-05T09:01:00.000Z", changed: true,
      text: { line: "Rewritten b2.", summary: "Rewritten.", fate: "HELD_UP" },
      what_changed: ["It was looked into again."], fate_before: "SET_ASIDE", view: null, dig_paths: []
    };
    const answer = v2Answer({ path_rewrites: { paths: [{ position_ref: "b2", current: { line: "Rewritten b2.", summary: "Rewritten.", fate: "HELD_UP" },
      history: [rewrite] }], changed_since: { count: 1, since_report_version: null } } });
    const b2 = findPath(buildV4Map({ runId: "r", answer, story: null }), "b2")!;
    expect(b2.line).toBe("Rewritten b2.");
    expect(b2.fate).toBe("HELD_UP");
    expect(b2.branch?.title).toBe(T2);
    expect(b2.rewrites?.original).toEqual({ line: T2, fate: null });
  });

  it("tags each path by who made it, and carries the more list, the also-raised points, the main trust and the carry-on box", () => {
    const map = buildV4Map({ runId: "r", answer: v2Answer(), story: null });
    expect(map.paths.map((path) => path.branch?.tag)).toEqual(["TOGETHER", "ADDED", null]);
    expect(map.more).toEqual([
      { id: "more-kp02", title: "Falling prices", question: "Will falling prices of solar change the choice?", isNew: false },
      { id: "more-kp07", title: "Building delays", question: "How often are new plants late?", isNew: true }
    ]);
    expect(map.alsoRaised).toEqual(["A point no path took."]);
    expect(map.mainTrust).toBe("SURE_FOR_CASE");
    expect(map.carryOnToReport).toBe(true);
    expect("phase" in map).toBe(false);
    expect(buildV4Map({ runId: "r", answer: v2Answer({ branches: branchesOf([B1, B2, B3], { carry_on_to_report: false, main_trust: null }) }),
      story: null })).toMatchObject({ carryOnToReport: false, mainTrust: null });
  });

  it("keeps each branch's own words: its answer so far, what changed, its trust word, and no progress once served", () => {
    const map = buildV4Map({ runId: "r", answer: v2Answer(), story: null });
    expect(map.paths[0]?.branch).toEqual({
      order: 1, title: T1, question: B1.question, author: "AI_SUGGESTION", tag: "TOGETHER", viewpoints: B1.viewpoints, state: "ARGUED",
      answerSoFar: "Line b1.", summary: "Summary of Line b1.", whatChanged: ["Changed b1."], view: null, trust: "SURE_FOR_CASE",
      progress: null
    });
    expect(map.paths[1]?.branch).toMatchObject({ answerSoFar: null, summary: null, whatChanged: [], trust: null, progress: null });
    // The path's one word is its answer so far's, worked out from its points (a failed path has none).
    expect(map.paths.map((path) => path.trust)).toEqual(["SURE_FOR_CASE", null, "DIDNT_HOLD"]);
  });

  it("each path's web part is the one named by its path id", () => {
    const answer = v2Answer();
    const map = buildV4Map({ runId: "r", answer, story: null });
    expect(pathWebOf(answer, "b1")?.search.status).toBe("SEARCHED");
    expect(map.paths[0]?.web).toEqual(pathWebOf(answer, "b1"));
    expect(map.paths[1]?.web).toBeUndefined();
    expect(map.paths[2]?.web?.search.status).toBe("FAILED");
  });

  it("a dig of a path debate draws its own branches, and reads no story", () => {
    const dig = v2Answer({ dig: { parent_run_id: "d9000000-0000-4000-8000-000000000002", position_ref: "b2", places: ["path:b2"], level: 1, picks: [],
      rewrite: null } });
    const map = buildV4Map({ runId: "r", answer: dig, story: v2Story() });
    expect(map.storyState).toBe("NONE");
    expect(map.paths.map((path) => [path.id, path.fate])).toEqual([["b1", "PARTLY_HELD"], ["b2", null], ["b3", "FELL"]]);
    expect(map.paths[0]?.points.map((point) => point.id)).toEqual(["n-yes", "n-yes-pay", "n-yes-rent"]);
  });
});

describe("tags and branches", () => {
  it("names the four tags", () => {
    expect(V4_PATH_TAGS).toEqual(["TOGETHER", "COMBINED", "EDITED", "ADDED"]);
  });

  it("tags a path by its author, and an AI's path only when it puts two viewpoints or more together", () => {
    const two = B1.viewpoints;
    const one = B3.viewpoints;
    expect(pathTagOf({ author: "PERSON_OWN_VIEW", viewpoints: one })).toBe("ADDED");
    expect(pathTagOf({ author: "PERSON_EDITED", viewpoints: one })).toBe("EDITED");
    expect(pathTagOf({ author: "AI_COMBINED", viewpoints: two })).toBe("COMBINED");
    expect(pathTagOf({ author: "AI_SUGGESTION", viewpoints: two })).toBe("TOGETHER");
    expect(pathTagOf({ author: "AI_SUGGESTION", viewpoints: one })).toBeNull();
    expect(pathTagOf({ author: "AI_SUGGESTION", viewpoints: [] })).toBeNull();
  });

  it("keeps a path's progress only while it is being looked into", () => {
    const looking: RunPathProgress = { path_id: "b1", step: "CHECKING", points: ["CHECKED", "BEING_CHECKED", "PUT_FORWARD"], findings: [] };
    expect(v4BranchOf(branch(1, {}), looking).progress).toEqual({ step: "CHECKING", dots: ["CHECKED", "BEING_CHECKED", "PUT_FORWARD"] });
    expect(v4BranchOf(branch(1, {}), null).progress).toBeNull();
    expect(v4BranchOf(B1, { path_id: "b1", step: null, points: [], findings: [] }).progress).toBeNull();
  });

  it("turns findings into points, each with its word and nothing else", () => {
    expect(pointsOfFindings([{ node_ref: "n-1", text: "A made-up finding.", trust: "SURE" }])).toEqual([
      { id: "n-1", text: "A made-up finding.", trust: "SURE", basis: null, reasons: [], answeredBy: null, asOf: null }
    ]);
  });

  it("a '+ N more' item is a dig pick of its own, and 'more' a place the panel can show", () => {
    const map = buildV4Map({ runId: "r", answer: v2Answer(), story: null });
    const more = map.more![0]!;
    const pick: V4DigPick = { kind: "MORE", key: `more:${more.id}`, group: null, more };
    const selection: V4Selection = "more";
    expect([pick.kind, pick.more.id, selection]).toEqual(["MORE", "more-kp02", "more"]);
  });
});

const SIX = ["PUT_FORWARD", "PUT_FORWARD", "PUT_FORWARD", "PUT_FORWARD", "PUT_FORWARD", "PUT_FORWARD"] as const;

/** The run read of a path debate while it runs: b1 arguing, b2 filled in with two sure findings, b3 finding sources. */
function runRead(extra: Partial<RunProjection> = {}): RunProjection {
  return RunProjectionSchema.parse({
    run_ref: "run-1", question_line: Q, state: "RUNNING", terminal_reason: null, hold_until: null,
    branches: branchesOf([
      branch(1, { title: T1 }),
      branch(2, { title: T2, author: "PERSON_OWN_VIEW", viewpoints: [{ title: null, question: "My own words about the jobs.", own: true }],
        state: "ARGUED", root_node_id: "n-not-now", outcome: ready("Line b2.", "HELD_UP", "SURE") }),
      branch(3, { title: T3 })
    ], { main_trust: null, carry_on_to_report: false }),
    path_progress: [
      { path_id: "b1", step: "ARGUING", points: [...SIX], findings: [] },
      { path_id: "b2", step: null, points: [], findings: [
        { node_ref: "n-not-now", text: "A made-up finding about the costs.", trust: "SURE" },
        { node_ref: "n-not-now-once", text: "A made-up finding about the move.", trust: "SURE" }
      ] },
      { path_id: "b3", step: "FINDING_SOURCES", points: [], findings: [] }
    ],
    ...extra
  });
}

const choosing = (extra: Partial<RunProjection> = {}): RunProjection => RunProjectionSchema.parse({
  run_ref: "run-1", question_line: Q, state: "RUNNING", terminal_reason: null, hold_until: null, path_progress: [], ...extra
});

describe("the map while the debate runs (buildV4RunMap)", () => {
  it("draws the chosen paths at once, each filling in from its own progress", () => {
    const map = buildV4RunMap({ runId: "run-1", run: runRead() })!;
    expect(map.phase).toBe("RUN");
    expect(map.pending).toBe(false);
    expect([map.runId, map.answerId, map.answerVersion, map.question]).toEqual(["run-1", "", 0, Q]);
    expect(map.paths.map((path) => path.id)).toEqual(["b1", "b2", "b3"]);
    expect(map.paths.map((path) => path.positionRef)).toEqual(["b1", "b2", "b3"]);
    const [b1, b2, b3] = map.paths;
    expect(b1?.branch?.progress).toEqual({ step: "ARGUING", dots: [...SIX] });
    expect(b1?.points).toEqual([]);
    expect(b1?.line).toBe(T1);
    expect(b2?.counts.SURE).toBe(2);
    expect(b2?.points.map((point) => point.id)).toEqual(["n-not-now", "n-not-now-once"]);
    expect(b2?.line).toBe("Line b2.");
    expect(b2?.fate).toBe("HELD_UP");
    expect(b2?.branch?.progress).toBeNull();
    expect(b2?.trust).toBe("SURE");
    expect(b3?.branch?.progress).toEqual({ step: "FINDING_SOURCES", dots: [] });
    expect(map.paths.map((path) => [path.unchecked, path.open, path.suggestions])).toEqual([[0, [], undefined], [0, [], undefined], [0, [], undefined]]);
  });

  it("keeps the question's own bar empty until the main answer, with nothing open and no star", () => {
    const map = buildV4RunMap({ runId: "run-1", run: runRead() })!;
    expect(map.counts).toEqual({ SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 });
    expect(map.unchecked).toBe(0);
    expect(map.open).toEqual([]);
    expect(map.points.map((point) => point.id)).toEqual(["n-not-now", "n-not-now-once"]);
    expect(map).toMatchObject({
      storyState: "NONE", headline: null, summary: null, confidence: null, fallbackText: null, wouldChange: null, wouldChangeAlt: null,
      why: [], sections: [], objections: [], reservation: false, mainTrust: null, carryOnToReport: false,
      alsoRaised: ["A point no path took."]
    });
    expect(map.more?.map((item) => item.id)).toEqual(["more-kp02", "more-kp07"]);
  });

  it("while the AIs are still choosing the paths: pending, no path, and the carry-on line from the start (Task 57b)", () => {
    const still = buildV4RunMap({ runId: "run-1", run: choosing() })!;
    expect([still.pending, still.paths, still.carryOnToReport, still.more, still.alsoRaised]).toEqual([true, [], false, [], []]);
    const carrying = buildV4RunMap({ runId: "run-1", run: choosing({ carry_on_part: "ANSWER" }) })!;
    expect([carrying.pending, carrying.paths, carrying.carryOnToReport]).toEqual([true, [], true]);
  });

  it("is null for an R22 run read and for a failed run", () => {
    const r22 = RunProjectionSchema.parse({ run_ref: "run-1", question_line: Q, state: "RUNNING", terminal_reason: null, hold_until: null });
    expect(buildV4RunMap({ runId: "run-1", run: r22 })).toBeNull();
    expect(buildV4RunMap({ runId: "run-1", run: choosing({ state: "FAILED", terminal_reason: "RUN_SETUP_FAILED" }) })).toBeNull();
  });

  it("keeps the same path ids and the same point ids when the answer is served", () => {
    const run = buildV4RunMap({ runId: "run-1", run: runRead() })!;
    const served = buildV4Map({ runId: "run-1", story: null, answer: v2Answer({ branches: branchesOf([
      branch(1, { title: T1, state: "ARGUED", root_node_id: "n-yes", outcome: ready("Line b1.", "PARTLY_HELD", "SURE_FOR_CASE") }),
      branch(2, { title: T2, author: "PERSON_OWN_VIEW", viewpoints: [{ title: null, question: "My own words about the jobs.", own: true }],
        state: "ARGUED", root_node_id: "n-not-now", outcome: ready("Line b2.", "HELD_UP", "SURE") }),
      branch(3, { title: T3, state: "FAILED", outcome: failed })
    ]) }) });
    expect(served.paths.map((path) => path.id)).toEqual(run.paths.map((path) => path.id));
    expect(findPath(served, "b2")?.points.map((point) => point.id)).toEqual(findPath(run, "b2")?.points.map((point) => point.id));
    expect(findPath(served, "b2")?.line).toBe(findPath(run, "b2")?.line);
  });

  it("shows the question as it was sent, with the answers as sentences in it (r2-8, answer Q17)", () => {
    const line = `${Q}\n\nLooking at Romania.`;
    expect(buildV4RunMap({ runId: "run-1", run: runRead({ question_line: line }) })?.question).toBe(line);
  });
});

describe("the map during Start's Undo window (buildV4PendingMap)", () => {
  it("draws each chosen path being looked into, before any run exists", () => {
    const map: V4Map = buildV4PendingMap({ questionLine: Q, paths: [
      { title: T1, question: "What does each choice cost the whole power system?", tag: null },
      { title: "Cernavodă jobs", question: "What happens to the jobs at Cernavodă?", tag: "ADDED" }
    ] });
    expect(map.paths.map((path) => [path.id, path.positionRef])).toEqual([["b1", "b1"], ["b2", "b2"]]);
    expect(map.paths.map((path) => [path.branch?.state, path.branch?.progress])).toEqual([["LOOKING", null], ["LOOKING", null]]);
    expect(map.paths.map((path) => path.branch?.author)).toEqual(["AI_SUGGESTION", "PERSON_OWN_VIEW"]);
    expect(map.paths.map((path) => [path.line, path.branch?.title, path.branch?.tag, path.branch?.order]))
      .toEqual([[T1, T1, null, 1], ["Cernavodă jobs", "Cernavodă jobs", "ADDED", 2]]);
    expect(map.paths.every((path) => path.points.length === 0 && path.fate === null)).toBe(true);
    expect([map.runId, map.question, map.phase, map.pending, map.storyState]).toEqual(["", Q, "RUN", false, "NONE"]);
    expect(map.counts).toEqual({ SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 });
  });

  it("takes each tag's author", () => {
    const map = buildV4PendingMap({ questionLine: Q, paths: (["TOGETHER", "COMBINED", "EDITED", "ADDED"] as const)
      .map((tag) => ({ title: tag, question: `${tag}?`, tag })) });
    expect(map.paths.map((path) => path.branch?.author)).toEqual(["AI_SUGGESTION", "AI_COMBINED", "PERSON_EDITED", "PERSON_OWN_VIEW"]);
  });

  it("is pending with no paths", () => {
    const map = buildV4PendingMap({ questionLine: Q, paths: [] });
    expect([map.pending, map.paths]).toEqual([true, []]);
  });
});
