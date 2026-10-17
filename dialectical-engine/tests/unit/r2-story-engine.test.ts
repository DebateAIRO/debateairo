// tests/unit/r2-story-engine.test.ts
import { describe, expect, it } from "vitest";
import type { StoryVerdictBasis } from "@debateai/contract";
import { ENGINE_VERDICT_TRIGGERS, type EngineVerdictTrigger } from "@debateai/serve";
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
 */
const SENTENCES: Readonly<Record<EngineVerdictTrigger, readonly [StoryVerdictBasis["label"], string]>> = {
  JUDGES_UNANIMOUS: ["SUPPORTED", "The label is SUPPORTED because every judge who compared the answers side by side chose this answer, and none of them found that it holds only in some cases."],
  JUDGES_CONDITIONAL: ["CONTESTED", "The label is CONTESTED because every judge who compared the answers side by side chose this answer, but at least one found that it holds in some cases and not in others."],
  JUDGES_MAJORITY: ["CONTESTED", "The label is CONTESTED because enough of the judges who compared the answers side by side chose this answer to settle it, but not every judge's choice counted for it: at least one judge chose another answer, gave no usable choice, or chose an answer its own maker had argued, which is not counted."],
  JUDGES_NO_MAJORITY: ["SPLIT", "The label is SPLIT because the judges who compared the answers side by side did not settle on one answer: too few of their choices counted for any single answer, and this answer is the one they chose most often or, where that was even, the one whose case held up best against the objections."],
  JUDGES_UNAVAILABLE: ["CONTESTED", "The label is CONTESTED because no judge could compare the answers side by side, so this answer was chosen as the one whose case held up best against the objections, and without that comparison it cannot be called clear."],
  JUDGES_VOTES_IGNORED: ["SPLIT", "The label is SPLIT because every judge who gave a usable choice chose an answer that a model of its own maker had argued, so no choice counted, and this answer was chosen as the one whose case held up best against the objections."]
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
