import { describe, expect, it } from "vitest";
import { AnswerSchema, type Answer } from "@debateai/contract";
import { judgesComparisonOf, type ComparisonVote, type RootCallSite } from "@debateai/serve"; // pre-flight PF-R2b4.4: not A10's StoredVerdictVote
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * R2, INTERFACE §9.8 (plan deviation 33): the honesty panel's comparison, read from the stored votes and the answer's
 * nodes. Which choices counted is RECOUNTED through deriveJudgesVerdict from the stored letters, groups and makers; the
 * stored `counted` column is a hint that can drift after a resume and is never read (controller ruling R2b-B5.1).
 *
 * The fixture's first position (letter A) is argued by OpenAI's model, the second (letter B) by Anthropic's. Each
 * position's letter is its root's place in the PLAN, read from its author call's call-site key (ruling R2b-B6.1 (a)):
 * `JUDGE` is root 0, `JUDGE:root:secondary` root 1, `JUDGE:root:<n>` root n.
 */
function twoPositions(): Answer {
  const base = buildFairShapedAnswer();
  const position = base.nodes.find((node) => node.node_id === "node:position")!;
  const second = {
    ...position, node_id: "node:position-b", claim: "The second position.",
    final_strength: { ...position.final_strength!, value: 0.3 },
    maker_lineage: { ...position.maker_lineage!, maker: "Anthropic", provider_ref: "provider:anthropic" }
  };
  return { ...base, nodes: [...base.nodes, second] };
}
/** The roots' author call sites, as the answer read finds them in the ledger (seat-marked, as the runner writes them). */
const SITES: readonly RootCallSite[] = [
  { nodeId: "node:position", callSiteKey: "JUDGE:seat:main" },
  { nodeId: "node:position-b", callSiteKey: "JUDGE:root:secondary:seat:main" }
];
const vote = (
  judgeSeat: number,
  maker: string,
  chosenLetter: string | null,
  chosenRootNodeId: string | null,
  options: Readonly<{ counted?: boolean; sameAs?: readonly (readonly string[])[] }> = {}
): ComparisonVote => ({
  judgeSeat,
  maker,
  counted: options.counted ?? chosenLetter !== null,
  chosenRootNodeId,
  chosenLetter,
  conditional: chosenLetter === null ? null : false,
  sameAs: options.sameAs ?? [],
  questionKind: chosenLetter === null ? null : "general"
});

describe("R2 honesty panel: the comparison read from the votes", () => {
  it("is absent when the run has no vote row (engine 1, or no judge was seated)", () => {
    const answer = twoPositions();
    expect(judgesComparisonOf([], answer.nodes, answer.edges, SITES)).toBeUndefined();
  });

  it("counts seated and counted choices, and lists every position, most chosen first, then by its case's strength", () => {
    const answer = twoPositions();
    const comparison = judgesComparisonOf(
      [vote(1, "Google", "B", "node:position-b"), vote(2, "Mistral", "B", "node:position-b"),
        // OpenAI's judge chose OpenAI's own answer: not counted (its stored row says so too).
        vote(3, "OpenAI", "A", "node:position", { counted: false })],
      answer.nodes, answer.edges, SITES);
    expect(comparison).toEqual({
      judges_seated: 3,
      judges_counted: 2,
      answers: [
        { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 2 },
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 0 }
      ]
    });
  });

  it("counts a failed judge as seated, never as a choice; a point that argues is no answer", () => {
    const answer = twoPositions();
    const comparison = judgesComparisonOf([vote(1, "Google", null, null), vote(2, "Mistral", "A", "node:position")],
      answer.nodes, answer.edges, SITES)!;
    expect([comparison.judges_seated, comparison.judges_counted]).toEqual([2, 1]);
    expect(comparison.answers.map((entry) => entry.root_node_id)).toEqual(["node:position", "node:position-b"]);
    expect(comparison.answers.map((entry) => entry.root_node_id)).not.toContain("node:defeater");
  });

  it("orders equal choices by the stronger case, then by node id, and keeps a position without a strength last", () => {
    const answer = twoPositions();
    const unscored = { ...answer.nodes.find((node) => node.node_id === "node:position-b")!, node_id: "node:position-c", final_strength: null };
    const nodes = [...answer.nodes, unscored];
    const comparison = judgesComparisonOf([vote(1, "Google", "C", "node:position-c")], nodes, answer.edges,
      [...SITES, { nodeId: "node:position-c", callSiteKey: "JUDGE:root:2" }])!;
    expect(comparison.answers).toEqual([
      { root_node_id: "node:position-c", honest_score: null, judges_chose: 1 },
      { root_node_id: "node:position", honest_score: 0.41, judges_chose: 0 },
      { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 0 }
    ]);
  });

  // Ruling PF-R2b4.6 option (a), pre-flight consistency R2b: a vote reused after a re-claim names the dead copy's root;
  // it is resolved by its letter (letter = root index: A the first position, B the second), never dropped.
  it("resolves a counted vote whose root is not a position of this version by its letter", () => {
    const answer = twoPositions();
    const comparison = judgesComparisonOf(
      [vote(1, "Google", "B", "node:stale-root-of-a-dead-copy"), vote(2, "Mistral", "A", "node:position"),
        vote(3, "DeepSeek", "H", "node:stale-root-of-a-dead-copy")],
      answer.nodes, answer.edges, SITES)!;
    expect(comparison).toEqual({
      judges_seated: 3,
      judges_counted: 2,
      answers: [
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 1 },
        { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 1 }
      ]
    });
  });

  // Controller ruling R2b-B5.1: the stored `counted` column is a hint; the panel follows the recount.
  it("follows the recount, never the stored counted column, when the two disagree", () => {
    const answer = twoPositions();
    const comparison = judgesComparisonOf(
      // Seat 1 chose its own maker's answer (Anthropic argued B) but its row says counted; seat 2's row says not
      // counted though no rule refuses it. Reading the column would give B 1, A 0; the recount gives A 1, B 0.
      [vote(1, "Anthropic", "B", "node:position-b", { counted: true }), vote(2, "Google", "A", "node:position", { counted: false })],
      answer.nodes, answer.edges, SITES)!;
    expect(comparison).toEqual({
      judges_seated: 2,
      judges_counted: 1,
      answers: [
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 1 },
        { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 0 }
      ]
    });
  });

  // Ruling R2b-B2.1, read through the recount: a judge cannot count for its own maker's answer through a group either.
  it("ignores a choice whose group (named by a majority) holds the judge's own maker's answer, whatever the row says", () => {
    const answer = twoPositions();
    const grouped = { sameAs: [["A", "B"]] } as const;
    const comparison = judgesComparisonOf(
      [vote(1, "Google", "A", "node:position", grouped), vote(2, "Mistral", "A", "node:position", grouped),
        // Anthropic argued B; B is grouped with A by every judge, so this choice of A is its own maker's group.
        vote(3, "Anthropic", "A", "node:position", { ...grouped, counted: true })],
      answer.nodes, answer.edges, SITES)!;
    expect(comparison).toEqual({
      judges_seated: 3,
      judges_counted: 2,
      answers: [
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 2 },
        { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 0 }
      ]
    });
  });

  // Ruling R2b-B6.1: a root that sat out leaves a gap (roots A and C, no B). The letters are the roots' places in the
  // plan, never their count among the saved roots, so the panel counts what the served verdict counted.
  function rootsAandC(): Answer {
    const answer = twoPositions();
    return { ...answer, nodes: answer.nodes.map((node) => node.node_id === "node:position-b"
      ? { ...node, node_id: "node:position-c", claim: "The third planned position." } : node) };
  }
  const SITES_A_AND_C: readonly RootCallSite[] = [
    { nodeId: "node:position", callSiteKey: "JUDGE:seat:main" },
    { nodeId: "node:position-c", callSiteKey: "JUDGE:root:2:seat:runnerUp" }
  ];
  const gapVotes = (): ComparisonVote[] => [
    vote(1, "Google", "A", "node:position", { sameAs: [["A", "C"]] }),
    vote(2, "Mistral", "A", "node:position", { sameAs: [["A", "C"]] }),
    vote(3, "DeepSeek", "A", "node:position")
  ];

  it("letters each root by its place in the plan, so a root that sat out never shifts the letters", () => {
    const answer = rootsAandC();
    expect(judgesComparisonOf(gapVotes(), answer.nodes, answer.edges, SITES_A_AND_C)).toEqual({
      judges_seated: 3,
      judges_counted: 3,
      answers: [
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 3 },
        { root_node_id: "node:position-c", honest_score: 0.3, judges_chose: 0 }
      ]
    });
  });

  it("shows no section when a root's plan place cannot be read and a letter shows a gap", () => {
    const answer = rootsAandC();
    // No call site read: the letters could only be guessed, and C sits past the two saved roots.
    expect(judgesComparisonOf(gapVotes(), answer.nodes, answer.edges, [])).toBeUndefined();
    // A call site that names no root is no exact place either.
    expect(judgesComparisonOf(gapVotes(), answer.nodes, answer.edges,
      [SITES_A_AND_C[0]!, { nodeId: "node:position-c", callSiteKey: "JUDGE:critic:2" }])).toBeUndefined();
  });

  it("without the plan places: a fresh row that contradicts the saved order shows no section", () => {
    const answer = twoPositions();
    expect(judgesComparisonOf([vote(1, "Google", "B", "node:position")], answer.nodes, answer.edges, [])).toBeUndefined();
  });

  it("without the plan places and with no gap: counts as before, and a resumed row no fresh row fixes is no usable reply", () => {
    const answer = twoPositions();
    expect(judgesComparisonOf([vote(1, "Google", "B", "node:position-b"), vote(2, "Mistral", "A", "node:position")],
      answer.nodes, answer.edges, [])).toEqual({
      judges_seated: 2,
      judges_counted: 2,
      answers: [
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 1 },
        { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 1 }
      ]
    });
    expect(judgesComparisonOf([vote(1, "Google", "B", "node:stale-root-of-a-dead-copy"), vote(2, "Mistral", "A", "node:position")],
      answer.nodes, answer.edges, [])!.judges_counted).toBe(1);
  });

  it("contradicting plan places and stored roots show no section", () => {
    const answer = twoPositions();
    // The row says B is node:position, the ledger says node:position is root 0 (A).
    expect(judgesComparisonOf([vote(1, "Google", "B", "node:position")], answer.nodes, answer.edges, SITES)).toBeUndefined();
  });

  // B6 fix round 1, Minor 2: one bad row never fails the whole answer read.
  it("shows no section when the stored rows cannot be counted (two rows for one seat)", () => {
    const answer = twoPositions();
    expect(judgesComparisonOf([vote(1, "Google", "A", "node:position"), vote(1, "Mistral", "B", "node:position-b")],
      answer.nodes, answer.edges, SITES)).toBeUndefined();
  });

  it("parses on an answer, and an answer without it parses exactly as before", () => {
    const old = buildFairShapedAnswer();
    expect(AnswerSchema.parse(old)).toEqual(old);
    expect(AnswerSchema.parse(old).judges_comparison).toBeUndefined();
    const comparison = { judges_seated: 3, judges_counted: 2,
      answers: [{ root_node_id: "node:position", honest_score: 0.41, judges_chose: 2 }] };
    expect(AnswerSchema.parse({ ...old, judges_comparison: comparison }).judges_comparison).toEqual(comparison);
  });

  it.each([
    ["more counted than seated", { judges_seated: 2, judges_counted: 3, answers: [{ root_node_id: "n", honest_score: 0.5, judges_chose: 0 }] }],
    ["more chosen than counted", { judges_seated: 3, judges_counted: 1, answers: [{ root_node_id: "n", honest_score: 0.5, judges_chose: 2 }] }],
    ["no answer", { judges_seated: 3, judges_counted: 0, answers: [] }],
    ["a score above 1", { judges_seated: 1, judges_counted: 1, answers: [{ root_node_id: "n", honest_score: 1.2, judges_chose: 1 }] }],
    ["a letter (letters are not reader data)", { judges_seated: 1, judges_counted: 1, answers: [{ root_node_id: "n", letter: "A", honest_score: 0.5, judges_chose: 1 }] }],
    ["six judges", { judges_seated: 6, judges_counted: 0, answers: [{ root_node_id: "n", honest_score: 0.5, judges_chose: 0 }] }]
  ])("refuses %s", (_name, comparison) => {
    expect(() => AnswerSchema.parse({ ...buildFairShapedAnswer(), judges_comparison: comparison })).toThrow();
  });
});
