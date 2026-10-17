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
 */
const SENTENCES: Readonly<Record<EngineVerdictTrigger, readonly [StoryVerdictBasis["label"], string]>> = {
  JUDGES_UNANIMOUS: ["SUPPORTED", "The label is SUPPORTED because every judge who compared the answers side by side chose this answer or one the judges counted as the same, and none of them found that it holds only in some cases."],
  JUDGES_CONDITIONAL: ["CONTESTED", "The label is CONTESTED because every judge who compared the answers side by side chose this answer or one the judges counted as the same, but at least one found that it holds in some cases and not in others."],
  JUDGES_MAJORITY: ["CONTESTED", "The label is CONTESTED because enough of the judges who compared the answers side by side chose this answer to settle it, but not clearly: at least one judge chose another answer, gave no usable choice, or chose an answer its own maker had argued (or one the judges counted as the same as that answer), which is not counted; or too few judges could take part for the answer to be called clear."],
  JUDGES_NO_MAJORITY: ["SPLIT", "The label is SPLIT because the judges who compared the answers side by side did not settle on one answer: too few of their choices counted for any single answer, and this answer is the one they chose most often or, where that was even, the one whose case held up best against the objections."],
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
    expect(STORY_ENGINE_TRIGGER_RULES[verdict.trigger]).toContain("or too few judges could take part for the answer to be called clear");
  });

  it("has a sentence for every trigger B2 returns, for one to five seated judges", () => {
    const answers = [
      { letter: "A", rootNodeId: "root-a", arguedByMaker: "maker-a" },
      { letter: "B", rootNodeId: "root-b", arguedByMaker: "maker-b" },
      { letter: "C", rootNodeId: "root-c", arguedByMaker: "maker-c" }
    ] as const;
    const strength = new Map([["root-a", 0.5], ["root-b", 0.6], ["root-c", 0.4]]);
    type Reply = ComparingJudgeVote["reply"];
    const replies: readonly Reply[] = [null,
      { best: "A", conditional: false, sameAs: [], questionKind: "general" },
      { best: "A", conditional: true, sameAs: [], questionKind: "general" },
      { best: "B", conditional: false, sameAs: [["A", "B"]], questionKind: "health" },
      { best: "C", conditional: false, sameAs: [], questionKind: "legal" }];
    // A judge of a maker that argued no answer, or of the maker that argued A (its vote for A, or for B grouped with A, is not counted).
    const makers = ["judge-maker", "maker-a"];
    const reached = new Set<string>();
    for (let seats = 1; seats <= 5; seats += 1) {
      for (const label of [{ clearAgreeing: 3, closeCallAgreeing: 2 }, { clearAgreeing: seats, closeCallAgreeing: 1 }]) {
        const walk = (seat: number, votes: ComparingJudgeVote[]): void => {
          if (seat > seats) {
            reached.add(deriveJudgesVerdict({ votes, answers, honestFinalStrength: strength, label }).trigger);
            return;
          }
          for (const reply of replies) for (const maker of makers) {
            walk(seat + 1, [...votes, { seat, maker, reply }]);
          }
        };
        walk(1, []);
      }
    }
    for (const trigger of reached) expect(Object.hasOwn(STORY_ENGINE_TRIGGER_RULES, trigger), trigger).toBe(true);
    expect([...reached].sort()).toEqual([...ENGINE_VERDICT_TRIGGERS].sort());
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
