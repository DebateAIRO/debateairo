// tests/unit/dig-suggestion-points.test.ts
// V4 start step, Task 79a (owner answer Q18 A, dig-f35: code finds overlapping dig picks). On a path debate (its paths named b<n>)
// a dig suggestion names the points of the map it rests on: one code finds names its own point, one the AI wrote names the points
// its refs stand for. The page reads them with pickPointsOf, so two picks resting on one point can be offered as one, with no AI
// call and nothing counted. An R22 debate's suggestions name none and keep their bytes; an old stored set without points still
// parses; the suggestion id rule is unchanged. Made-up points and questions.
import { describe, expect, it } from "vitest";
import { AnswerWebSchema, DigSuggestionSchema, type AnswerWeb, type DigSuggestion, type Node } from "@debateai/contract";
import type { ProviderCallRequest } from "@debateai/providers";
import { digLeadSuggestions, digPointSuggestions, pathSuggestionsOfSet, webWithDigSuggestions } from "@debateai/serve";
import {
  digSuggestionIdOf, refreshPathSuggestions, writeDigSuggestions, writeFirstDebateSuggestions, type DigSuggestionsJob, type PathSuggestionsStore
} from "../../apps/runner/src/dig-suggestions-step.js";
import { morePick, openPick, ownViewPick, pickPointsOf, suggestionPick } from "../../apps/ui/lib/v4/suggestions.js";
import type { V4DigPick } from "../../apps/ui/lib/v4/types.js";

/* ----------------------------------------------------------------- what code finds (serve) */

const node = (id: string, overrides: Partial<Node> = {}): Node => ({ node_id: id, claim: `Point ${id} in plain words.`, way_of_knowing: "LOOKED_UP",
  review: null, sources: [], ...overrides } as Node);
const edge = (from: string, to: string) => ({ from_node_ref: from, target_kind: "NODE", target_ref: to });
const DISPUTED = { review: { outcome: "dispute" } as never };
const REASONING = { way_of_knowing: "REASONING" as never };
const webOf = (positionRef: string): AnswerWeb => ({ paths: [{ position_ref: positionRef, search: { status: "NOT_ON_PLAN" }, other_pages: [],
  suggestions: [] }] });

/** A path debate: path b1 whose root in force is r1; the disputed point n3 and the point u4, which rests on reasoning alone, under it. */
const V2_NODES = [node("r1"), node("n3", DISPUTED), node("u4", REASONING)];
const V2_EDGES = [edge("n3", "r1"), edge("u4", "n3")] as never;
const ROOTS = new Map([["b1", "r1"]]);
/** The same points on an R22 debate: the path is named by its root node itself. */
const R22_NODES = [node("root"), node("n3", DISPUTED), node("u4", REASONING)];
const R22_EDGES = [edge("n3", "root"), edge("u4", "n3")] as never;

describe("Task 79a: what code finds on a path debate names its point", () => {
  it("a CONTRADICTING suggestion on node n3 of a v2 run carries points [\"n3\"] (and UNDOCUMENTED on u4 [\"u4\"]); the id rule is unchanged", () => {
    const out = webWithDigSuggestions(webOf("b1"), V2_NODES, V2_EDGES, null, new Map(), ROOTS);
    const offered = out.paths[0]!.suggestions;
    expect(offered.map((entry) => [entry.kind, entry.places, entry.points])).toEqual([
      ["CONTRADICTING", ["path:b1"], ["n3"]], ["UNDOCUMENTED", ["path:b1"], ["u4"]]]);
    expect(AnswerWebSchema.safeParse(out).success).toBe(true);
    // The id is worked out exactly as before: from the point, the kind and the path, whether the points are named or not.
    expect(offered.map((entry) => entry.suggestion_id)).toEqual(digPointSuggestions("b1", [V2_NODES[1]!, V2_NODES[2]!]).map((entry) => entry.suggestion_id));
  });

  it("the same on an R22 run carries no points key, byte for byte as before; a readers' line (no point of its own) names none", () => {
    const today = webWithDigSuggestions(webOf("root"), R22_NODES, R22_EDGES, 1);
    expect(today.paths[0]!.suggestions.map((entry) => entry.kind)).toEqual(["CONTRADICTING", "UNDOCUMENTED"]);
    for (const entry of today.paths[0]!.suggestions) expect(Object.keys(entry)).toEqual(["suggestion_id", "kind", "side", "text", "places"]);
    // A root map that does not name the R22 path (Task 55b's rule) changes nothing either.
    expect(JSON.stringify(webWithDigSuggestions(webOf("root"), R22_NODES, R22_EDGES, 1, new Map(), ROOTS))).toBe(JSON.stringify(today));
    expect(digLeadSuggestions("run", "b1", ["Look up the winter imports."]).map((entry) => Object.keys(entry).includes("points"))).toEqual([false]);
  });
});

/* ----------------------------------------------------------------- the contract and a stored set */

const OLD: DigSuggestion = { suggestion_id: "s-1", kind: "HELPS_MAIN_QUESTION", side: "FOR", text: "Seasonal lulls?", places: ["path:b1"] };

describe("Task 79a: the contract names a suggestion's points, only adding", () => {
  it("a stored set without points parses as it was; one with points parses with them", () => {
    expect(pathSuggestionsOfSet({ suggestions: [OLD] })).toEqual([OLD]);
    expect(Object.keys(pathSuggestionsOfSet({ suggestions: [OLD] })[0]!)).not.toContain("points");
    expect(pathSuggestionsOfSet({ suggestions: [{ ...OLD, points: ["n3", "n4"] }] })).toEqual([{ ...OLD, points: ["n3", "n4"] }]);
  });

  it("points: 0 to 40 ids, each 1 to 160 characters", () => {
    const parses = (points: unknown) => DigSuggestionSchema.safeParse({ ...OLD, points }).success;
    expect(parses([])).toBe(true);
    expect(parses(Array.from({ length: 40 }, (_, at) => `n${String(at)}`))).toBe(true);
    expect(parses(Array.from({ length: 41 }, (_, at) => `n${String(at)}`))).toBe(false);
    expect(parses(["x".repeat(160)])).toBe(true);
    expect(parses(["x".repeat(161)])).toBe(false);
    expect(parses([""])).toBe(false);
    expect(parses("n3")).toBe(false);
  });
});

/* ----------------------------------------------------------------- what the AI offers (runner) */

/** One path's points: f1 = n1, f2 = n5 (for), a1 = n2 (against). */
const POINTS = [{ id: "n1", text: "Winter imports rose.", onId: null, side: "for" as const, trust: null, disputed: true },
  { id: "n2", text: "Storage covers a week.", onId: null, side: "against" as const, trust: null, disputed: false },
  { id: "n5", text: "Wind drops in January.", onId: null, side: "for" as const, trust: null, disputed: false }];
const REPLY = JSON.stringify({ suggestions: [
  { side: "for", question: "Seasonal lulls?", why: "They could leave the grid short.", rests_on: ["a1", "f2", "a1"] },
  { side: "against", question: "A point not on this path?", why: "No reason.", rests_on: ["f1", "z9"] }] });
const QUESTION = { line: "Can the country keep the lights on?", place: null, time: null, purpose: null, readingLevel: null as never, language: null };
const WRITER = { provider: {} as never, providerRef: "ref-haiku" };

function sending(reply: string = REPLY) {
  const asked: ProviderCallRequest[] = [];
  return { asked, send: (async (_maker: unknown, request: ProviderCallRequest) => {
    asked.push(request);
    if (request.classifyContent?.(reply, undefined).parseStatus !== "PARSED") throw new Error("REFUSED");
    return { content: reply };
  }) as never };
}

function storeOf() {
  const kept: { positionRef: string; content: { suggestions: readonly DigSuggestion[] } }[] = [];
  return { kept, store: { positionsOf: async () => new Set<string>(), record: async (input: never) => { kept.push(input); return "RECORDED"; } } as unknown as PathSuggestionsStore };
}

const digJob = (positionRef: string): DigSuggestionsJob => ({ digRunId: "33333333-3333-4333-8333-333333333333", workItemId: "w1", level: 2, free: false,
  question: QUESTION, digPaths: [{ positionRef, statement: "The grid holds most winters.", extracts: [], points: POINTS }],
  whatChanged: ["Storage is smaller than first said."], writer: WRITER, send: sending().send, log: () => undefined });

describe("Task 79a: what the AI offers on a path debate names the points its refs stand for", () => {
  it("a dig's path b1: rests_on [a1, f2] maps to [n2, n5], each once; a suggestion resting on a ref outside the material is dropped as today", async () => {
    const job = digJob("b1");
    const written = await writeDigSuggestions(job, async () => "[]", "seal");
    expect(written).toEqual([{ position_ref: "b1", suggestions: [{ suggestion_id: digSuggestionIdOf(job.digRunId, "b1", 1), kind: "HELPS_MAIN_QUESTION",
      side: "FOR", text: "Seasonal lulls? They could leave the grid short.", places: ["path:b1"], points: ["n2", "n5"] }] }]);
    expect(DigSuggestionSchema.safeParse(written[0]!.suggestions[0]).success).toBe(true);
  });

  it("the same on an R22 dig's path carries no points key, byte for byte as before", async () => {
    const job = digJob("pos-1");
    const written = await writeDigSuggestions(job, async () => "[]", "seal");
    expect(JSON.stringify(written)).toBe(JSON.stringify([{ position_ref: "pos-1", suggestions: [{ suggestion_id: digSuggestionIdOf(job.digRunId, "pos-1", 1),
      kind: "HELPS_MAIN_QUESTION", side: "FOR", text: "Seasonal lulls? They could leave the grid short.", places: ["path:pos-1"] }] }]));
  });

  it("a rewritten path b2 of a path debate (Q-D8's refresh) names them too; an R22 path's refresh does not", async () => {
    const refresh = (positionRef: string) => ({ digRunId: "22222222-2222-4222-8222-222222222222", workItemId: "w", free: false, question: QUESTION,
      debateRunId: "11111111-1111-4111-8111-111111111111", positionRef, line: "The grid holds most winters.", points: POINTS,
      whatChanged: ["Storage is smaller."], step: 0, writer: WRITER, send: sending().send, log: () => undefined });
    const v2 = storeOf();
    await refreshPathSuggestions(refresh("b2"), v2.store, async () => "[]", "seal");
    expect(v2.kept[0]!.content.suggestions.map((entry) => entry.points)).toEqual([["n2", "n5"]]);
    const r22 = storeOf();
    await refreshPathSuggestions(refresh("pos-1"), r22.store, async () => "[]", "seal");
    expect(r22.kept[0]!.content.suggestions.map((entry) => Object.keys(entry).includes("points"))).toEqual([false]);
  });

  it("a first debate's path b1 (web.suggest.v1) names them too; an R22 first debate's path does not", async () => {
    const first = (positionRef: string) => ({ runId: "11111111-1111-4111-8111-111111111111", workItemId: "w", free: false, question: QUESTION.line,
      language: null, paths: [{ positionRef, statement: "The grid holds most winters.", extracts: [], points: POINTS }], wouldChangeIt: null,
      writer: WRITER, send: sending().send, log: () => undefined });
    const v2 = storeOf();
    await writeFirstDebateSuggestions(first("b1"), v2.store, "seal");
    expect(v2.kept[0]!.content.suggestions.map((entry) => [entry.text, entry.points])).toEqual([["Seasonal lulls? They could leave the grid short.", ["n2", "n5"]]]);
    const r22 = storeOf();
    await writeFirstDebateSuggestions(first("pos-1"), r22.store, "seal");
    expect(r22.kept[0]!.content.suggestions.map((entry) => Object.keys(entry).includes("points"))).toEqual([false]);
  });
});

/* ----------------------------------------------------------------- the page (pickPointsOf) */

describe("Task 79a: pickPointsOf, the points a dig pick rests on", () => {
  const open = (id: string, kind: "STILL_ARGUED" | "OBJECTION" | "WOULD_CHANGE"): V4DigPick =>
    openPick({ id, kind, text: "Is storage enough?", star: false, pathId: "b1" });

  it("SUGGESTION: its points, none when it names none; OPEN \"p:<node>\": that node; OWN_VIEW, MORE and other OPEN: none", () => {
    expect(pickPointsOf(suggestionPick("b1", { ...OLD, points: ["n3", "n4"] }))).toEqual(["n3", "n4"]);
    expect(pickPointsOf(suggestionPick("b1", OLD))).toEqual([]);
    expect(pickPointsOf(open("p:n3", "STILL_ARGUED"))).toEqual(["n3"]);
    expect(pickPointsOf(open("o:2", "OBJECTION"))).toEqual([]);
    expect(pickPointsOf(open("w", "WOULD_CHANGE"))).toEqual([]);
    expect(pickPointsOf(ownViewPick("b1", "Batteries will be cheaper by then.", 1))).toEqual([]);
    expect(pickPointsOf(morePick({ id: "more-kp07", title: "The 2030s", question: "2030s gap?", isNew: false }))).toEqual([]);
  });

  it("the spec's example: the AI's \"Seasonal lulls?\" and code's \"2030s gap?\" rest on one point, so the page can see they overlap", () => {
    const [found] = webWithDigSuggestions(webOf("b1"), V2_NODES, V2_EDGES, null, new Map(), ROOTS).paths[0]!.suggestions;
    const lulls = pickPointsOf(suggestionPick("b1", { ...OLD, points: ["n3"] }));
    const gap = pickPointsOf(suggestionPick("b1", { ...found!, text: "2030s gap?" }));
    expect(lulls.filter((point) => gap.includes(point))).toEqual(["n3"]);
  });
});
