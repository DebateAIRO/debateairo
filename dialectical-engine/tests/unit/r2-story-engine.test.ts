// tests/unit/r2-story-engine.test.ts
import { describe, expect, it } from "vitest";
import type { StoryVerdictBasis } from "@debateai/contract";
import { ENGINE_VERDICT_TRIGGERS, deriveJudgesVerdict, type ComparingJudgeVote, type EngineVerdictTrigger } from "@debateai/serve";
import type { ProviderGateway } from "@debateai/providers";
import {
  assembleStoryCheckerInstruction, assembleStorytellerInstruction, buildStoryMaterial, loadStoryPack, resolveStoryPackDir,
  STORY_ENGINE_TOKENS, STORY_ENGINE_TRIGGER_RULES, storyV4ShapeId,
  type StoryCostFallback, type StoryRunSnapshot, type StorySnapshotNode, type StoryStepLease
} from "@debateai/story";
import { buildStoryRunSnapshot, type StorySnapshotSource } from "../../apps/runner/src/story-snapshot.js";

const pack = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));

/**
 * OWNER WORDING (AI-facing story material, option 1): one sentence per engine trigger, no number in any. JUDGES_MAJORITY,
 * JUDGES_NO_MAJORITY and JUDGES_VOTES_IGNORED reworded so each is true in every case B2's counting rules allow (a seated
 * judge that failed or gave an invalid reply, an ignored own-maker vote, one judge answering): pre-flight PF-R2b5.5.
 * Fix round 1 (controller ruling R2b-B9.1): JUDGES_MAJORITY also names too few judges taking part (every seated judge
 * chose the winner, but fewer were seated than a clear answer needs); the group case of ruling R2b-B2.1 is named in
 * JUDGES_MAJORITY and JUDGES_VOTES_IGNORED, and "chose this answer" in UNANIMOUS and CONDITIONAL covers a grouped choice.
 * Fix round 2 (re-review I1, I2, M1, M4): JUDGES_NO_MAJORITY speaks of the counted choices (an own-maker choice is not
 * counted, so the raw leader can lose) and is true with one seated judge; JUDGES_MAJORITY covers a grouped choice and
 * reads as one sentence. The walk below checks each sentence's claims against every verdict it reaches.
 */
const SENTENCES: Readonly<Record<EngineVerdictTrigger, readonly [StoryVerdictBasis["label"], string]>> = {
  JUDGES_UNANIMOUS: ["SUPPORTED", "The label is SUPPORTED because every judge who compared the answers side by side chose this answer or one the judges counted as the same, and none of them found that it holds only in some cases."],
  JUDGES_CONDITIONAL: ["CONTESTED", "The label is CONTESTED because every judge who compared the answers side by side chose this answer or one the judges counted as the same, but at least one found that it holds in some cases and not in others."],
  JUDGES_MAJORITY: ["CONTESTED", "The label is CONTESTED because enough of the judges who compared the answers side by side chose this answer, or one the judges counted as the same, to settle it, but not clearly: too few judges could take part for the answer to be called clear, or at least one judge chose another answer, gave no usable choice, or chose an answer that its own maker had argued or that the judges counted as the same as one its maker had argued, which does not count."],
  JUDGES_NO_MAJORITY: ["SPLIT", "The label is SPLIT because, among the choices of the judges who compared the answers side by side, no single answer got enough of those that counted to settle it (a choice does not count when the judge's own maker argued that answer or one counted as the same), and this answer, together with any answer the judges counted as the same, is the one the counted choices named most often or, where that was even, the one whose strongest case (with the answers counted as the same) held up best against the objections, or, where even that was even, the first in a fixed order."],
  JUDGES_UNAVAILABLE: ["CONTESTED", "The label is CONTESTED because no judge could compare the answers side by side, so this answer was chosen as the one whose case held up best against the objections, and without that comparison it cannot be called clear."],
  JUDGES_VOTES_IGNORED: ["SPLIT", "The label is SPLIT because every judge who gave a usable choice chose an answer that a model of its own maker had argued, or one the judges counted as the same as such an answer, so no choice counted, and this answer was chosen as the one whose case held up best against the objections."]
};

const node = (overrides: Partial<StorySnapshotNode> & { readonly nodeId: string }): StorySnapshotNode => ({
  claim: `The claim of ${overrides.nodeId}.`, isPosition: false, wayOfKnowing: "REASONING", baseScore: 0.5, finalStrength: 0.45,
  excludedReason: null, authorModel: "model:alpha", panelDispersion: 0.1, criticSummary: null, ...overrides
});
function snapshot(label: StoryVerdictBasis["label"], trigger: string): StoryRunSnapshot {
  return {
    runId: "run:r2", workItemId: "work:r2", answerId: "answer:r2", answerVersion: 1,
    questionLine: "Should the city fund the tram extension?", argumentLanguage: { tag: "en", name: "English" },
    compositionBudgetTier: "low",
    verdictBasis: {
      label, rung: 5, trigger, winner_node_id: "position:a", winner_strength: 0.61, runner_up_node_id: "position:b",
      runner_up_strength: 0.4, margin: 0.21, disagreement: null,
      thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 }, confidence_band: "CAPPED", marks: []
    },
    servedStatement: ["The city should fund it, if fares hold."],
    nodes: [
      node({ nodeId: "position:a", isPosition: true, claim: "The city should fund it.", finalStrength: 0.61 }),
      node({ nodeId: "position:b", isPosition: true, claim: "The city should not fund it.", finalStrength: 0.4, authorModel: "model:beta" })
    ],
    arrows: [], sensitivity: [], setAside: []
  };
}
function ruleInWords(label: StoryVerdictBasis["label"], trigger: string): string {
  const built = buildStoryMaterial({ snapshot: snapshot(label, trigger), enrichment: new Map(), budgetBytes: 40 * 1000,
    shapeIds: new Set(pack.shapes.map((shape) => shape.id)) });
  if (built.kind !== "OK") throw new Error(built.kind);
  return built.material.verdict.rule_in_words;
}

const provider: ProviderGateway = { call: async () => { throw new Error("unused"); } };
const stepLease: StoryStepLease = (use) => use();
const costFallback: StoryCostFallback = async ({ planned, request, call }) => ({ result: await call(planned, request), servedBy: planned });
const ROOT = "11111111-1111-4111-8111-111111111111";
function source(overrides: Partial<StorySnapshotSource> = {}): StorySnapshotSource {
  return {
    runId: "run-1", workItemId: "work-1", answerId: "answer-1", answerVersion: 1, questionLine: "Should we?",
    argumentLanguage: { tag: "en", name: "English" }, compositionBudgetTier: "low",
    verdict: { label: "SPLIT", rung: 5, trigger: "JUDGES_NO_MAJORITY" },
    servedRootNodeId: ROOT, servedStrength: 0.6, runnerUp: null,
    margin: { kind: "ABSENT", reason: "ONE_POSITION" }, disagreement: { kind: "ABSENT", reason: "ENGINE2_JUDGES" },
    thresholds: { gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 },
    confidenceBand: "CAPPED", answerMarks: [], servedSegments: [{ text: "Yes." }],
    authored: [{ nodeId: ROOT, statement: "Yes.", provenanceRef: "artifact-root", wayOfKnowing: "REASONING",
      reversalPoint: "Unless not.", maker: "maker-a", panelDispersion: 0.05 }],
    positionNodeIds: new Set([ROOT]), baseStrengths: [{ nodeId: ROOT, baseStrength: 0.6 }],
    finalStrengths: [{ nodeId: ROOT, strength: 0.6 }], arrows: [], arrowOrder: [], sensitivity: [], conditionMarkRecords: [],
    resolveProvider: () => ({ provider, providerRef: "provider:a" }), stepLease, costFallback,
    ...overrides
  };
}

describe("R2 B9: the story under engine 2", () => {
  it("has one sentence per engine trigger, and the six are exactly serve's triggers", () => {
    expect(Object.keys(STORY_ENGINE_TRIGGER_RULES).sort()).toEqual(Object.keys(SENTENCES).sort());
    // Pre-flight PF-R2b5.14: a run-time check against serve's own list (a type-level check would hold by construction).
    expect(Object.keys(STORY_ENGINE_TRIGGER_RULES).sort()).toEqual([...ENGINE_VERDICT_TRIGGERS].sort());
    expect(Object.isFrozen(STORY_ENGINE_TRIGGER_RULES)).toBe(true);
  });

  it.each(Object.entries(SENTENCES))("words %s for the storyteller, with no number", (trigger, [label, sentence]) => {
    const words = ruleInWords(label, trigger);
    expect(words).toBe(sentence);
    expect(words).not.toMatch(/\d/u);
  });

  // Fix round 1 (controller ruling R2b-B9.1): B2 gives JUDGES_MAJORITY when every seated judge chose the winner but fewer
  // were seated than a clear answer needs (start values: clear 3, close call 2), so no judge dissented.
  it("words JUDGES_MAJORITY truly when every seated judge chose this answer but too few could take part", () => {
    const answers = [
      { letter: "A", rootNodeId: "root-a", arguedByMaker: "maker-a" },
      { letter: "B", rootNodeId: "root-b", arguedByMaker: "maker-b" }
    ] as const;
    const votes: ComparingJudgeVote[] = ["judge-1", "judge-2"].map((maker, index) => ({
      seat: index + 1, maker, reply: { best: "A", conditional: false, sameAs: [], questionKind: "general" }
    }));
    const verdict = deriveJudgesVerdict({ votes, answers, honestFinalStrength: new Map([["root-a", 0.5], ["root-b", 0.6]]),
      label: { clearAgreeing: 3, closeCallAgreeing: 2 } });
    expect(verdict).toMatchObject({ trigger: "JUDGES_MAJORITY", label: "CONTESTED", winnerRootNodeId: "root-a", judgesSeated: 2,
      winnerVotes: 2 });
    expect(verdict.counted.every((seat) => seat.counted)).toBe(true);
    expect(STORY_ENGINE_TRIGGER_RULES[verdict.trigger]).toContain("too few judges could take part for the answer to be called clear");
  });

  // Fix round 2 (re-review I1): an own-maker choice is not counted, so the answer most judges chose can lose the split.
  it("words JUDGES_NO_MAJORITY by the counted choices when an own-maker vote is set aside", () => {
    const answers = [
      { letter: "A", rootNodeId: "root-a", arguedByMaker: "maker-x" },
      { letter: "B", rootNodeId: "root-b", arguedByMaker: "maker-y" },
      { letter: "C", rootNodeId: "root-c", arguedByMaker: "maker-z" }
    ] as const;
    const reply = (best: "A" | "C") => ({ best, conditional: false, sameAs: [], questionKind: "general" as const });
    const verdict = deriveJudgesVerdict({
      votes: [{ seat: 1, maker: "maker-p", reply: reply("A") }, { seat: 2, maker: "maker-x", reply: reply("A") },
        { seat: 3, maker: "maker-y", reply: reply("C") }],
      answers, honestFinalStrength: new Map([["root-a", 0.4], ["root-b", 0.5], ["root-c", 0.6]]),
      label: { clearAgreeing: 3, closeCallAgreeing: 2 }
    });
    // Two judges chose A, but one of them is A's own maker: counted, A and C have one choice each, and C held up better.
    expect(verdict).toMatchObject({ trigger: "JUDGES_NO_MAJORITY", label: "SPLIT", winnerRootNodeId: "root-c" });
    expect(verdict.counted.map((seat) => seat.notCountedReason)).toEqual([null, "OWN_MAKER", null]);
    const sentence = STORY_ENGINE_TRIGGER_RULES.JUDGES_NO_MAJORITY!;
    expect(sentence).toContain("the counted choices named most often");
    expect(sentence).toContain("a choice does not count when the judge's own maker argued that answer");
    expect(sentence).not.toContain("chose most often");
  });

  // Fix round 2 (re-review M1): one seated judge gives JUDGES_NO_MAJORITY (one choice is too few), with no disagreement.
  it("words JUDGES_NO_MAJORITY truly with a single seated judge", () => {
    const verdict = deriveJudgesVerdict({
      votes: [{ seat: 1, maker: "maker-p", reply: { best: "A", conditional: false, sameAs: [], questionKind: "general" } }],
      answers: [{ letter: "A", rootNodeId: "root-a", arguedByMaker: "maker-x" }, { letter: "B", rootNodeId: "root-b", arguedByMaker: "maker-y" }],
      honestFinalStrength: new Map([["root-a", 0.4], ["root-b", 0.6]]), label: { clearAgreeing: 3, closeCallAgreeing: 2 }
    });
    expect(verdict).toMatchObject({ trigger: "JUDGES_NO_MAJORITY", winnerRootNodeId: "root-a", judgesSeated: 1 });
    const sentence = STORY_ENGINE_TRIGGER_RULES.JUDGES_NO_MAJORITY!;
    expect(sentence).toContain("no single answer got enough of those that counted to settle it");
    expect(sentence).not.toContain("did not settle on one answer");
  });

  // Fix round 2 (re-review I2): a choice of an answer the judges counted as the same counts for this answer.
  it("words JUDGES_MAJORITY truly when the winning count includes a choice of an answer counted as the same", () => {
    const answers = [
      { letter: "A", rootNodeId: "root-a", arguedByMaker: "maker-x" },
      { letter: "B", rootNodeId: "root-b", arguedByMaker: "maker-y" },
      { letter: "C", rootNodeId: "root-c", arguedByMaker: "maker-z" }
    ] as const;
    const grouped = [["A", "B"]] as const;
    const verdict = deriveJudgesVerdict({
      votes: [
        { seat: 1, maker: "maker-p", reply: { best: "A", conditional: false, sameAs: grouped, questionKind: "general" } },
        { seat: 2, maker: "maker-q", reply: { best: "B", conditional: false, sameAs: grouped, questionKind: "general" } },
        { seat: 3, maker: "maker-r", reply: { best: "C", conditional: false, sameAs: [], questionKind: "general" } }
      ],
      answers, honestFinalStrength: new Map([["root-a", 0.6], ["root-b", 0.5], ["root-c", 0.4]]),
      label: { clearAgreeing: 3, closeCallAgreeing: 2 }
    });
    // A and B counted as the same: two choices for the group, one of them for B; A held up better inside it.
    expect(verdict).toMatchObject({ trigger: "JUDGES_MAJORITY", label: "CONTESTED", winnerRootNodeId: "root-a", winnerVotes: 2,
      groups: [["A", "B"]] });
    expect(STORY_ENGINE_TRIGGER_RULES.JUDGES_MAJORITY).toContain("chose this answer, or one the judges counted as the same, to settle it");
  });

  it("has a true sentence for every verdict B2 returns, for one to five seated judges, own makers' judges included", () => {
    const answers = [
      { letter: "A", rootNodeId: "root-a", arguedByMaker: "maker-a" },
      { letter: "B", rootNodeId: "root-b", arguedByMaker: "maker-b" },
      { letter: "C", rootNodeId: "root-c", arguedByMaker: "maker-c" }
    ] as const;
    // R2b final wave P9 (ruling R2b-B9.2): three sets of strengths: distinct; an exact tie (the node id decides); and
    // A < C < B, so the group {A, B} can win an even count against C through B while the answer named is A.
    const strengths = [
      new Map([["root-a", 0.5], ["root-b", 0.6], ["root-c", 0.4]]),
      new Map([["root-a", 0.5], ["root-b", 0.5], ["root-c", 0.5]]),
      new Map([["root-a", 0.3], ["root-b", 0.6], ["root-c", 0.5]])
    ];
    const letterOf = new Map<string, string>(answers.map((answer) => [answer.rootNodeId, answer.letter] as const));
    type Reply = ComparingJudgeVote["reply"];
    const replies: readonly Reply[] = [null,
      { best: "A", conditional: false, sameAs: [], questionKind: "general" },
      { best: "A", conditional: true, sameAs: [], questionKind: "general" },
      { best: "B", conditional: false, sameAs: [["A", "B"]], questionKind: "health" },
      // P9: a choice of A that groups it with B, so a group can win through B while the answer named is A.
      { best: "A", conditional: false, sameAs: [["A", "B"]], questionKind: "general" },
      { best: "C", conditional: false, sameAs: [], questionKind: "legal" }];
    // A judge of a maker that argued no answer, or of the makers that argued A or C (an own-maker choice, directly or
    // through the A+B group, is not counted). Never two judges of one maker (ruling W2): each seating is a set of
    // distinct makers (the count reads no seat order, so each set is walked once).
    const makers = ["judge-maker", "judge-maker-2", "judge-maker-3", "maker-a", "maker-c"];
    const reached = new Set<string>();
    const false_: string[] = [];
    let rawLeaderLost = false;
    let tieByFixedOrder = false;
    let groupWonThroughStrongerMember = false;
    for (const strength of strengths) for (let seats = 1; seats <= 5; seats += 1) {
      // One seat is also walked with a close call at one agreeing judge and a clear answer above one (P9).
      for (const label of [{ clearAgreeing: 3, closeCallAgreeing: 2 }, { clearAgreeing: seats, closeCallAgreeing: 1 },
        { clearAgreeing: seats + 1, closeCallAgreeing: 1 }]) {
        const check = (votes: readonly ComparingJudgeVote[]): void => {
          const verdict = deriveJudgesVerdict({ votes, answers, honestFinalStrength: strength, label });
          reached.add(verdict.trigger);
          if (!Object.hasOwn(STORY_ENGINE_TRIGGER_RULES, verdict.trigger)) false_.push(`no sentence: ${verdict.trigger}`);
          const classOf = (letter: string): readonly string[] => verdict.groups.find((group) => group.includes(letter as "A")) ?? [letter];
          const winning = classOf(letterOf.get(verdict.winnerRootNodeId)!);
          const ballots = verdict.counted.map((entry, index) => ({ ...entry, best: votes[index]!.reply?.best ?? null }));
          const countedFor = (group: readonly string[]): number =>
            ballots.filter((ballot) => ballot.counted && ballot.best !== null && group.includes(ballot.best)).length;
          const classes = [...new Set(answers.map((answer) => classOf(answer.letter).join("+")))].map((key) => key.split("+"));
          const claim = (holds: boolean, what: string): void => {
            if (!holds) false_.push(`${verdict.trigger} ${what}: ${JSON.stringify({ label, votes })}`);
          };
          const everyoneForWinner = ballots.every((ballot) => ballot.counted && winning.includes(ballot.best!));
          const conditionalForWinner = votes.some((vote, index) => ballots[index]!.counted && vote.reply !== null
            && winning.includes(vote.reply.best) && vote.reply.conditional);
          switch (verdict.trigger) {
            case "JUDGES_UNANIMOUS":
              claim(everyoneForWinner && !conditionalForWinner, "every judge chose it or the same, none conditional");
              break;
            case "JUDGES_CONDITIONAL":
              claim(everyoneForWinner && conditionalForWinner, "every judge chose it or the same, one conditional");
              break;
            case "JUDGES_MAJORITY":
              // "enough chose this answer, or one counted as the same", and one of the named reasons holds.
              claim(countedFor(winning) * 2 > votes.length, "enough chose it");
              claim(votes.length < label.clearAgreeing || !everyoneForWinner, "too few, another answer, no usable choice or own maker");
              break;
            case "JUDGES_NO_MAJORITY": {
              // "the counted choices named most often" (classes counted together), or an even count.
              claim(classes.every((group) => countedFor(group) <= countedFor(winning)), "the counted choices named it most often");
              // "where that was even, the one whose strongest case (with the answers counted as the same) held up best,
              // or, where even that was even, the first in a fixed order" (ruling R2b-B9.2).
              const rootOf = (letter: string): string => answers.find((answer) => answer.letter === letter)!.rootNodeId;
              const strongest = (group: readonly string[]): number => Math.max(...group.map((letter) => strength.get(rootOf(letter))!));
              const tied = classes.filter((group) => group.join("+") !== winning.join("+") && countedFor(group) === countedFor(winning));
              claim(tied.every((group) => strongest(group) <= strongest(winning)), "its strongest case held up best");
              const firstOf = (group: readonly string[]): string => group.filter((letter) => strength.get(rootOf(letter)) === strongest(group))
                .map(rootOf).sort()[0]!;
              const evenStill = tied.filter((group) => strongest(group) === strongest(winning));
              claim(evenStill.every((group) => firstOf(winning) < firstOf(group)), "the first in a fixed order");
              if (evenStill.length > 0) tieByFixedOrder = true;
              const named = strength.get(verdict.winnerRootNodeId)!;
              if (winning.length > 1 && tied.some((group) => strongest(group) > named && strongest(group) < strongest(winning))) {
                groupWonThroughStrongerMember = true;
              }
              const raw = (group: readonly string[]): number => ballots.filter((ballot) => ballot.best !== null && group.includes(ballot.best)).length;
              if (classes.some((group) => raw(group) > raw(winning))) rawLeaderLost = true;
              break;
            }
            case "JUDGES_UNAVAILABLE":
              claim(verdict.judgesAnswered === 0, "no judge could compare");
              break;
            case "JUDGES_VOTES_IGNORED":
              claim(ballots.some((ballot) => ballot.notCountedReason === "OWN_MAKER")
                && ballots.every((ballot) => !ballot.counted && ballot.notCountedReason !== null), "every usable choice was its own maker's");
              break;
          }
        };
        const walk = (seat: number, votes: ComparingJudgeVote[], nextMaker: number): void => {
          if (seat > seats) return check(votes);
          for (const reply of replies) {
            makers.forEach((maker, index) => {
              if (index >= nextMaker) walk(seat + 1, [...votes, { seat, maker, reply }], index + 1);
            });
          }
        };
        walk(1, [], 0);
      }
    }
    expect(false_.slice(0, 5)).toEqual([]);
    expect([...reached].sort()).toEqual([...ENGINE_VERDICT_TRIGGERS].sort());
    // Why the sentence says "counted choices": with own makers' judges seated, the answer most judges chose can lose.
    expect(rawLeaderLost).toBe(true);
    // Why it says "strongest case (with the answers counted as the same)" and "the first in a fixed order" (P9).
    expect(tieByFixedOrder).toBe(true);
    expect(groupWonThroughStrongerMember).toBe(true);
  });

  it("keeps engine 1's sentences (MID_BAND as today)", () => {
    expect(ruleInWords("CONTESTED", "MID_BAND")).toBe(
      "The label is CONTESTED because the strongest position finished at 0.61, between the low cut of 0.35 and the high cut of 0.7: better than unsupported, not strong enough to be supported.");
  });

  it("adds no tie-margin sentence under the judges' rule, even when other answers finished close to or above ours", () => {
    // Pre-flight PF-R2b5.3: the judges' winner position:a finished at 0.40, below position:b (0.61) and within gamma of
    // position:c (0.42). Engine 1's tie-margin sentence would add "P… also finished within the tie margin …".
    const base = snapshot("SPLIT", "JUDGES_NO_MAJORITY");
    const built = buildStoryMaterial({
      snapshot: {
        ...base,
        verdictBasis: { ...base.verdictBasis, winner_strength: 0.4, runner_up_node_id: "position:b", runner_up_strength: 0.61 },
        nodes: [
          node({ nodeId: "position:a", isPosition: true, claim: "The city should fund it.", finalStrength: 0.4 }),
          node({ nodeId: "position:b", isPosition: true, claim: "The city should not fund it.", finalStrength: 0.61, authorModel: "model:beta" }),
          node({ nodeId: "position:c", isPosition: true, claim: "The city should fund half of it.", finalStrength: 0.42, authorModel: "model:gamma" })
        ]
      },
      enrichment: new Map(), budgetBytes: 40 * 1000, shapeIds: new Set(pack.shapes.map((shape) => shape.id))
    });
    if (built.kind !== "OK") throw new Error(built.kind);
    expect(built.material.verdict.rule_in_words).toBe(SENTENCES.JUDGES_NO_MAJORITY[1]);
  });

  it("refuses SPLIT as a word of any story (it is a code of the material, B4)", () => {
    expect(STORY_ENGINE_TOKENS).toContain("SPLIT");
  });

  it("hands the judges' question kinds to the story only when given (engine 1: no member, today's bytes)", () => {
    expect("questionKinds" in buildStoryRunSnapshot(source())).toBe(false);
    const input = buildStoryRunSnapshot(source({ questionKinds: ["health", "health", "legal"] }));
    expect(input.questionKinds).toEqual(["health", "health", "legal"]);
    expect(Object.isFrozen(input.questionKinds)).toBe(true);
    expect(input.verdictBasis).toMatchObject({ label: "SPLIT", rung: 5, trigger: "JUDGES_NO_MAJORITY" });
  });

  it.each([
    [["health", "health", "legal"], "health"],
    [["health", "legal"], pack.defaultShape],
    [[], pack.defaultShape],
    [undefined, pack.defaultShape]
  ] as const)("picks the one v4 shape from the judges' kinds %j", (questionKinds, shape) => {
    expect(storyV4ShapeId(questionKinds === undefined ? {} : { questionKinds }, pack)).toBe(shape);
  });

  it("tells the v4 storyteller and checker about SPLIT, and leaves every v3 instruction as it is", () => {
    expect(pack.commonLength).toContain('the label may also be SPLIT, shown as "Contested"');
    expect(pack.checkerLength).toContain('The site shows a fourth label, SPLIT, as "Contested"');
    expect(pack.checkerLength).not.toContain("under Contested"); // pre-flight PF-R2b5.4: "Contested" could read as CONTESTED
    expect(assembleStorytellerInstruction(pack, false, { shapeId: "general" })).toContain('shown as "Contested"');
    expect(assembleStoryCheckerInstruction(pack, false, { shapeId: "general" })).toContain('SPLIT, as "Contested"');
    for (const v3 of [assembleStorytellerInstruction(pack), assembleStorytellerInstruction(pack, true),
      assembleStoryCheckerInstruction(pack), assembleStoryCheckerInstruction(pack, true), pack.common, pack.checker]) {
      expect(v3).not.toContain("SPLIT");
    }
  });
});
