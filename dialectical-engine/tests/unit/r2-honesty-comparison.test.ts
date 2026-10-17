import { describe, expect, it } from "vitest";
import { AnswerSchema, type Answer } from "@debateai/contract";
import {
  deriveJudgesVerdict, judgesComparisonOf, servedPositionOf, type ComparingJudgeVote, type ComparisonVote, type RootCallSite
} from "@debateai/serve"; // pre-flight PF-R2b4.4: not A10's StoredVerdictVote
import type { EngineAnswerLetter } from "@debateai/kernel";
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
        { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 2, same_answer_as: [] },
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 0, same_answer_as: [] }
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
      { root_node_id: "node:position-c", honest_score: null, judges_chose: 1, same_answer_as: [] },
      { root_node_id: "node:position", honest_score: 0.41, judges_chose: 0, same_answer_as: [] },
      { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 0, same_answer_as: [] }
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
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 1, same_answer_as: [] },
        { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 1, same_answer_as: [] }
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
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 1, same_answer_as: [] },
        { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 0, same_answer_as: [] }
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
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 2, same_answer_as: ["node:position-b"] },
        { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 0, same_answer_as: ["node:position"] }
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
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 3, same_answer_as: ["node:position-c"] },
        { root_node_id: "node:position-c", honest_score: 0.3, judges_chose: 0, same_answer_as: ["node:position"] }
      ]
    });
  });

  // R2b final wave P6 (B6 re-review Minor 2): a bare root key and a structure repair's key read the same plan places.
  it("reads a bare JUDGE key as root 0 and a structure repair's key as the root it repairs", () => {
    const answer = rootsAandC();
    expect(judgesComparisonOf(gapVotes(), answer.nodes, answer.edges, [
      { nodeId: "node:position", callSiteKey: "JUDGE" },
      { nodeId: "node:position-c", callSiteKey: "REPAIR:STRUCTURE:JUDGE:root:2:seat:main" }
    ])).toEqual(judgesComparisonOf(gapVotes(), answer.nodes, answer.edges, SITES_A_AND_C));
    expect(judgesComparisonOf(gapVotes(), answer.nodes, answer.edges, [
      { nodeId: "node:position", callSiteKey: "REPAIR:STRUCTURE:JUDGE" },
      { nodeId: "node:position-c", callSiteKey: "JUDGE:root:2" }
    ])!.judges_counted).toBe(3);
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
        { root_node_id: "node:position", honest_score: 0.41, judges_chose: 1, same_answer_as: [] },
        { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 1, same_answer_as: [] }
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
      answers: [{ root_node_id: "node:position", honest_score: 0.41, judges_chose: 2, same_answer_as: [] }] };
    expect(AnswerSchema.parse({ ...old, judges_comparison: comparison }).judges_comparison).toEqual(comparison);
  });

  it.each([
    ["more counted than seated", { judges_seated: 2, judges_counted: 3, answers: [{ root_node_id: "n", honest_score: 0.5, judges_chose: 0, same_answer_as: [] }] }],
    ["more chosen than counted", { judges_seated: 3, judges_counted: 1, answers: [{ root_node_id: "n", honest_score: 0.5, judges_chose: 2, same_answer_as: [] }] }],
    ["no answer", { judges_seated: 3, judges_counted: 0, answers: [] }],
    ["a score above 1", { judges_seated: 1, judges_counted: 1, answers: [{ root_node_id: "n", honest_score: 1.2, judges_chose: 1, same_answer_as: [] }] }],
    ["a letter (letters are not reader data)", { judges_seated: 1, judges_counted: 1, answers: [{ root_node_id: "n", letter: "A", honest_score: 0.5, judges_chose: 1, same_answer_as: [] }] }],
    ["an answer counted as the same as itself", { judges_seated: 1, judges_counted: 1, answers: [{ root_node_id: "n", honest_score: 0.5, judges_chose: 1, same_answer_as: ["n"] }] }],
    ["a same answer that is not listed", { judges_seated: 1, judges_counted: 1, answers: [{ root_node_id: "n", honest_score: 0.5, judges_chose: 1, same_answer_as: ["m"] }] }],
    ["a same answer named one way only", { judges_seated: 1, judges_counted: 1, answers: [
      { root_node_id: "n", honest_score: 0.5, judges_chose: 1, same_answer_as: ["m"] },
      { root_node_id: "m", honest_score: 0.4, judges_chose: 0, same_answer_as: [] }] }],
    ["an entry without its same answers", { judges_seated: 1, judges_counted: 1, answers: [{ root_node_id: "n", honest_score: 0.5, judges_chose: 1 }] }],
    ["six judges", { judges_seated: 6, judges_counted: 0, answers: [{ root_node_id: "n", honest_score: 0.5, judges_chose: 0, same_answer_as: [] }] }]
  ])("refuses %s", (_name, comparison) => {
    expect(() => AnswerSchema.parse({ ...buildFairShapedAnswer(), judges_comparison: comparison })).toThrow();
  });
});

/**
 * Ruling W1 (whole-branch review I1): answers the judges counted as the same answer are shown together, with one
 * combined count, ordered by the recount's counted totals, the served answer's group first. Every number and every
 * sentence the panel shows is checked against the count that decided the served answer (`deriveJudgesVerdict`).
 */
describe("R2 honesty panel: answers counted as the same (ruling W1)", () => {
  const LETTER_ROOTS = { A: "node:position", B: "node:position-b", C: "node:position-c" } as const;
  const ARGUED_BY = { A: "OpenAI", B: "Anthropic", C: "Google" } as const;
  /** The engine row's label numbers (the register's start values; the panel itself never reads them). */
  const LABEL = { clearAgreeing: 3, closeCallAgreeing: 2 } as const;
  const SITES_3: readonly RootCallSite[] = [
    { nodeId: LETTER_ROOTS.A, callSiteKey: "JUDGE:seat:main" },
    { nodeId: LETTER_ROOTS.B, callSiteKey: "JUDGE:root:secondary:seat:main" },
    { nodeId: LETTER_ROOTS.C, callSiteKey: "JUDGE:root:2:seat:main" }
  ];
  function threePositions(strengths: Readonly<Record<"A" | "B" | "C", number>>): Answer {
    const base = buildFairShapedAnswer();
    const position = base.nodes.find((node) => node.node_id === LETTER_ROOTS.A)!;
    const at = (letter: "A" | "B" | "C") => ({
      ...position, node_id: LETTER_ROOTS[letter], claim: `Position ${letter}.`,
      final_strength: { ...position.final_strength!, value: strengths[letter] },
      maker_lineage: { ...position.maker_lineage!, maker: ARGUED_BY[letter] }
    });
    return { ...base, nodes: [...base.nodes.filter((node) => node.node_id !== LETTER_ROOTS.A), at("A"), at("B"), at("C")] };
  }
  type Reply = Readonly<{ best: "A" | "B" | "C"; sameAs: readonly (readonly ("A" | "B" | "C")[])[] }> | null;
  const stored = (seat: number, maker: string, reply: Reply): ComparisonVote => reply === null
    ? { judgeSeat: seat, maker, chosenRootNodeId: null, chosenLetter: null, conditional: null, sameAs: [], questionKind: null }
    : { judgeSeat: seat, maker, chosenRootNodeId: LETTER_ROOTS[reply.best], chosenLetter: reply.best, conditional: false,
      sameAs: reply.sameAs, questionKind: "general" };
  const counting = (seat: number, maker: string, reply: Reply): ComparingJudgeVote => ({
    seat, maker, reply: reply === null ? null : { best: reply.best, conditional: false, sameAs: reply.sameAs as readonly (readonly EngineAnswerLetter[])[], questionKind: "general" }
  });
  /** The panel's groups, as the drawer reads them: in list order, each entry with the answers it lists as the same. */
  const panelGroups = (answers: NonNullable<Answer["judges_comparison"]>["answers"]) => {
    const placed = new Set<string>();
    const groups: (typeof answers)[] = [];
    for (const entry of answers) {
      if (placed.has(entry.root_node_id)) continue;
      const members = [entry, ...answers.filter((other) => entry.same_answer_as.includes(other.root_node_id))];
      for (const member of members) placed.add(member.root_node_id);
      groups.push(members);
    }
    return groups;
  };
  const total = (group: readonly { judges_chose: number }[]) => group.reduce((sum, entry) => sum + entry.judges_chose, 0);

  // The review's probe: three judges from makers that argued none of the answers, two of them grouping {A, B}.
  it("shows A and B together, chosen 2 of 3, first, where the served answer is A (a Close call by a majority)", () => {
    const strengths = { A: 0.5, B: 0.4, C: 0.6 } as const;
    const answer = threePositions(strengths);
    const replies: Reply[] = [{ best: "A", sameAs: [["A", "B"]] }, { best: "B", sameAs: [["A", "B"]] }, { best: "C", sameAs: [] }];
    const makers = ["Mistral", "DeepSeek", "xAI"];
    const verdict = deriveJudgesVerdict({
      votes: replies.map((reply, index) => counting(index + 1, makers[index]!, reply)),
      answers: (["A", "B", "C"] as const).map((letter) => ({ letter, rootNodeId: LETTER_ROOTS[letter], arguedByMaker: ARGUED_BY[letter] })),
      honestFinalStrength: new Map((["A", "B", "C"] as const).map((letter) => [LETTER_ROOTS[letter], strengths[letter]] as const)),
      label: { clearAgreeing: 3, closeCallAgreeing: 2 }
    });
    expect([verdict.winnerRootNodeId, verdict.label, verdict.trigger]).toEqual([LETTER_ROOTS.A, "CONTESTED", "JUDGES_MAJORITY"]);
    const comparison = judgesComparisonOf(replies.map((reply, index) => stored(index + 1, makers[index]!, reply)),
      answer.nodes, answer.edges, SITES_3);
    expect(comparison).toEqual({
      judges_seated: 3,
      judges_counted: 3,
      answers: [
        { root_node_id: LETTER_ROOTS.A, honest_score: 0.5, judges_chose: 1, same_answer_as: [LETTER_ROOTS.B] },
        { root_node_id: LETTER_ROOTS.B, honest_score: 0.4, judges_chose: 1, same_answer_as: [LETTER_ROOTS.A] },
        { root_node_id: LETTER_ROOTS.C, honest_score: 0.6, judges_chose: 1, same_answer_as: [] }
      ]
    });
    expect(panelGroups(comparison!.answers).map((group) => [group.map((entry) => entry.root_node_id), total(group)])).toEqual([
      [[LETTER_ROOTS.A, LETTER_ROOTS.B], 2],
      [[LETTER_ROOTS.C], 1]
    ]);
  });

  // Follow-up N1 (scoped re-review): a review catch-up refreshes the strengths the panel reads, while the served answer
  // and its label stay as stored. The panel lists the RECORDED served answer's group first; the recount's winner (over
  // the latest strengths) only when no served answer is recorded. Counts never move.
  describe("the recorded served answer first, when the strengths moved after it was served (follow-up N1)", () => {
    const servedAt = { A: 0.5, B: 0.3, C: 0.4 } as const;
    const later = { A: 0.5, B: 0.3, C: 0.6 } as const;
    const verdictOf = (replies: readonly Reply[], makers: readonly string[]) => deriveJudgesVerdict({
      votes: replies.map((reply, index) => counting(index + 1, makers[index]!, reply)),
      answers: (["A", "B", "C"] as const).map((letter) => ({ letter, rootNodeId: LETTER_ROOTS[letter], arguedByMaker: ARGUED_BY[letter] })),
      honestFinalStrength: new Map((["A", "B", "C"] as const).map((letter) => [LETTER_ROOTS[letter], servedAt[letter]] as const)),
      label: LABEL
    });
    const panelOf = (replies: readonly Reply[], makers: readonly string[], served?: string | null) => {
      const answer = threePositions(later);
      return judgesComparisonOf(replies.map((reply, index) => stored(index + 1, makers[index]!, reply)),
        answer.nodes, answer.edges, SITES_3, served)!;
    };

    it("a vote tie: A served (SPLIT) at the time; C's case rose later; A's group still comes first", () => {
      const replies: Reply[] = [{ best: "A", sameAs: [] }, { best: "C", sameAs: [] }];
      const makers = ["Mistral", "DeepSeek"];
      const verdict = verdictOf(replies, makers);
      expect([verdict.winnerRootNodeId, verdict.label, verdict.trigger]).toEqual([LETTER_ROOTS.A, "SPLIT", "JUDGES_NO_MAJORITY"]);
      const panel = panelOf(replies, makers, verdict.winnerRootNodeId);
      expect(panel.answers.map((entry) => [entry.root_node_id, entry.judges_chose])).toEqual([
        [LETTER_ROOTS.A, 1], [LETTER_ROOTS.C, 1], [LETTER_ROOTS.B, 0]]);
      expect([panel.judges_seated, panel.judges_counted]).toEqual([2, 2]);
      // With no served answer recorded, the recount's winner over the latest strengths (C) leads: the fallback.
      expect(panelOf(replies, makers, null).answers[0]!.root_node_id).toBe(LETTER_ROOTS.C);
      expect(panelOf(replies, makers).answers[0]!.root_node_id).toBe(LETTER_ROOTS.C);
    });

    it("no choice counted: the answer served then comes first, beside the sentence that it was chosen", () => {
      // Each judge chose its own maker's answer: OpenAI argued A, Google argued C.
      const replies: Reply[] = [{ best: "A", sameAs: [] }, { best: "C", sameAs: [] }];
      const makers = ["OpenAI", "Google"];
      const verdict = verdictOf(replies, makers);
      expect([verdict.winnerRootNodeId, verdict.trigger]).toEqual([LETTER_ROOTS.A, "JUDGES_VOTES_IGNORED"]);
      const panel = panelOf(replies, makers, verdict.winnerRootNodeId);
      expect(panel.judges_counted).toBe(0);
      expect(panel.answers.map((entry) => entry.root_node_id)).toEqual([LETTER_ROOTS.A, LETTER_ROOTS.C, LETTER_ROOTS.B]);
    });

    // The answer read's source: the position the served number's source_ref (the served node's provenance) names.
    it("reads the served answer as the one position the served number names, else none", () => {
      const answer = threePositions(later);
      const provenanceOf = (nodeId: string) => answer.nodes.find((node) => node.node_id === nodeId)!.provenance_ref;
      const shared = threePositions(later);
      expect(servedPositionOf(answer.nodes, answer.edges, [provenanceOf(LETTER_ROOTS.A)])).toBe(null);
      // The fixture's positions share one provenance; give each its own, as each answer is its own call's reply.
      const own = { ...shared, nodes: shared.nodes.map((node) => ({ ...node, provenance_ref: `prov:${node.node_id}` })) };
      expect(servedPositionOf(own.nodes, own.edges, [`prov:${LETTER_ROOTS.C}`])).toBe(LETTER_ROOTS.C);
      expect(servedPositionOf(own.nodes, own.edges, [])).toBeNull();
      expect(servedPositionOf(own.nodes, own.edges, ["prov:node:defeater"])).toBeNull();   // a point that argues, no answer
      expect(servedPositionOf(own.nodes, own.edges, [`prov:${LETTER_ROOTS.A}`, `prov:${LETTER_ROOTS.C}`])).toBeNull();
    });

    it("a recorded served answer that is not a listed answer falls back to the recount's winner", () => {
      const replies: Reply[] = [{ best: "A", sameAs: [] }, { best: "C", sameAs: [] }];
      expect(panelOf(replies, ["Mistral", "DeepSeek"], "node:defeater").answers[0]!.root_node_id).toBe(LETTER_ROOTS.C);
    });
  });

  // A walk of 1-5 seated judges (makers that argued an answer seated too), every reply shape below, two sets of
  // strengths (one an exact tie, decided by node id): what the panel shows never contradicts the served answer or its
  // label.
  it("never contradicts the served answer or the label: a walk of 1-5 seats with own makers' judges and groups", () => {
    const MAKERS = ["OpenAI", "Anthropic", "Google", "Mistral", "DeepSeek"];
    const REPLIES: readonly Reply[] = [
      null,
      ...(["A", "B", "C"] as const).flatMap((best) => [{ best, sameAs: [] }, { best, sameAs: [["A", "B"]] }] as Reply[]),
      { best: "C", sameAs: [["B", "C"]] },
      { best: "B", sameAs: [["A", "B", "C"]] }
    ];
    const subsets = (size: number, from = 0): string[][] => size === 0 ? [[]]
      : MAKERS.slice(from).flatMap((maker, offset) => subsets(size - 1, from + offset + 1).map((rest) => [maker, ...rest]));
    const seen = { cases: 0, grouped: 0, notCounted: 0, noneCounted: 0, triggers: new Set<string>() };
    // The exact tie walks up to four seats (time: the full walk of five seats is ~60k cases per set of strengths).
    for (const [strengths, maxSeats] of [[{ A: 0.5, B: 0.4, C: 0.6 }, 5], [{ A: 0.5, B: 0.5, C: 0.5 }, 4]] as const) {
      const answer = threePositions(strengths);
      const answers = (["A", "B", "C"] as const).map((letter) => ({ letter, rootNodeId: LETTER_ROOTS[letter], arguedByMaker: ARGUED_BY[letter] }));
      const honestFinalStrength = new Map((["A", "B", "C"] as const).map((letter) => [LETTER_ROOTS[letter], strengths[letter]] as const));
      const strengthOf = new Map(answer.nodes.map((node) => [node.node_id, node.final_strength?.value ?? -1] as const));
      for (let seats = 1; seats <= maxSeats; seats += 1) {
        for (const makers of subsets(seats)) {
          for (let code = 0; code < REPLIES.length ** seats; code += 1) {
            const replies = makers.map((_maker, index) => REPLIES[Math.floor(code / REPLIES.length ** index) % REPLIES.length]!);
            const verdict = deriveJudgesVerdict({
              votes: replies.map((reply, index) => counting(index + 1, makers[index]!, reply)),
              answers, honestFinalStrength, label: LABEL
            });
            const comparison = judgesComparisonOf(replies.map((reply, index) => stored(index + 1, makers[index]!, reply)),
              answer.nodes, answer.edges, SITES_3)!;
            const where = `${JSON.stringify(strengths)} ${makers.join(",")} ${JSON.stringify(replies)}`;
            seen.cases += 1;
            seen.triggers.add(verdict.trigger);
            const countedSeats = verdict.counted.filter((entry) => entry.counted).map((entry) => entry.seat);
            // "Choices counted: {counted} of {seated}".
            expect([comparison.judges_counted, comparison.judges_seated], where).toEqual([countedSeats.length, seats]);
            const groups = panelGroups(comparison.answers);
            const groupOfRoot = new Map(groups.flatMap((group) => group.map((entry) => [entry.root_node_id, group] as const)));
            // The groups shown are the count's groups (one sentence each), every answer exactly once.
            expect(groups.filter((group) => group.length > 1).map((group) => group.map((entry) => entry.root_node_id).sort()).sort(), where)
              .toEqual(verdict.groups.map((group) => group.map((letter) => LETTER_ROOTS[letter as "A" | "B" | "C"]).sort()).sort());
            if (verdict.groups.length > 0) seen.grouped += 1;
            expect(groups.flat().map((entry) => entry.root_node_id).sort(), where).toEqual(Object.values(LETTER_ROOTS).sort());
            // "Chosen {chose} of {counted}" per group: the counted choices that named an answer of the group.
            for (const group of groups) {
              const roots = new Set(group.map((entry) => entry.root_node_id));
              const chose = replies.filter((reply, index) => reply !== null && countedSeats.includes(index + 1)
                && roots.has(LETTER_ROOTS[reply.best])).length;
              expect(total(group), where).toBe(chose);
            }
            // The served answer's group comes first and no group shows more counted choices.
            expect(groups[0]!.map((entry) => entry.root_node_id), where).toContain(verdict.winnerRootNodeId);
            expect(total(groups[0]!), where).toBe(verdict.winnerVotes);
            for (const group of groups) expect(total(group), where).toBeLessThanOrEqual(total(groups[0]!));
            // The label read beside the panel: a Clear answer has every seated choice counted for the first group; a
            // majority has more than half (and at least the row's close-call number); no majority has neither.
            const first = total(groups[0]!);
            if (verdict.label === "SUPPORTED") expect(first, where).toBe(seats);
            if (verdict.trigger === "JUDGES_MAJORITY") expect(first * 2 > seats && first >= LABEL.closeCallAgreeing, where).toBe(true);
            if (verdict.trigger === "JUDGES_NO_MAJORITY") expect(first * 2 > seats && first >= LABEL.closeCallAgreeing, where).toBe(false);
            // "A choice does not count when a model picked the answer its own maker's model argued, or an answer the
            // models counted as the same as that one, or gave no usable reply": true of every uncounted seat.
            if (comparison.judges_counted > 0 && comparison.judges_counted < seats) {
              seen.notCounted += 1;
              replies.forEach((reply, index) => {
                if (countedSeats.includes(index + 1)) return;
                const ownMakerGroup = reply !== null && groupOfRoot.get(LETTER_ROOTS[reply.best])!
                  .some((entry) => answer.nodes.find((node) => node.node_id === entry.root_node_id)!.maker_lineage!.maker === makers[index]);
                expect(reply === null || ownMakerGroup, `${where} seat ${index + 1}`).toBe(true);
              });
            }
            // "No choice could be counted, so the answer whose case held up best against the objections was chosen."
            if (comparison.judges_counted === 0) {
              seen.noneCounted += 1;
              expect(strengthOf.get(verdict.winnerRootNodeId), where).toBe(Math.max(...Object.values(strengths)));
            }
          }
        }
      }
    }
    // The walk reaches every case it claims to check.
    expect(seen.grouped).toBeGreaterThan(0);
    expect(seen.notCounted).toBeGreaterThan(0);
    expect(seen.noneCounted).toBeGreaterThan(0);
    expect([...seen.triggers].sort()).toEqual([
      "JUDGES_CONDITIONAL", "JUDGES_MAJORITY", "JUDGES_NO_MAJORITY", "JUDGES_UNANIMOUS", "JUDGES_UNAVAILABLE", "JUDGES_VOTES_IGNORED"
    ].filter((trigger) => trigger !== "JUDGES_CONDITIONAL"));
  });
});
