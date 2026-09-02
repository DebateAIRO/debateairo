import { describe, expect, it } from "vitest";
import {
  buildFactBundle,
  runServeGateChain,
  type ComposedSegment,
  type DigestSourceNode,
  type EvaluatorVerdict,
  type ServeGateDependencies,
  type ServeGateInput
} from "@debateai/serve";

/**
 * T9 (goal 248-266) retired every COMPONENTS_ONLY QUALITY gate this file used
 * to pin — R9 at position 1, Q53's residual-objections limb, the composition
 * byte budget, conformance, and the Q51 LOCATOR block. Their new terminals are
 * proved one by one in `tests/unit/t09-synthesis.test.ts`, which is the DoD's
 * "one test per former gate path" file.
 *
 * What stays HERE is what T9 did not touch: the ordered legal serve path, the
 * Q51 DOWNGRADE limb (the answer FORM, which T13 owns) and the composition
 * contract errors that are loud stops rather than terminals.
 */

const composed = (...texts: string[]): readonly ComposedSegment[] => texts.map((text, index) => ({
  segmentId: `segment:${index + 1}`,
  text,
  loadBearing: true,
  assertedNodeRefs: ["node:test"],
  servedNumberRefs: []
}));

const digestNode = (): readonly DigestSourceNode[] => [{
  nodeId: "node:test",
  statement: "A provisional answer.",
  finalStrength: 0.4,
  wayOfKnowing: "REASONING",
  marks: [],
  polarityRelations: [],
  isPosition: true,
  isSurvivingObjection: false
}];

const reasoningInput = (): ServeGateInput => ({
  nodes: [{
    nodeId: "node:test",
    text: "A provisional answer.",
    wayOfKnowing: "REASONING",
    provenanceRef: "artifact:test",
    locator: null,
    restatementStatus: "PASS",
    loadBearing: true
  }],
  factBundle: buildFactBundle({
    facts: ["A provisional answer."],
    residualObjections: [],
    badges: [],
    conditionMarks: [],
    reversalPoint: "An independent contrary source would reverse this test-layer answer.",
    buildsOnPrevious: { value: false, answerRef: null },
    memoryDisclosure: null
  }),
  compositionBudget: {
    tier: "low",
    bound: 100_000,
    registerRowKey: "test-layer:composition-budget",
    registerVersion: 1,
    sourceRef: "test-layer:DR-078"
  },
  candidateConfidenceBand: "TEST_BAND",
  digestNodes: digestNode(),
  servedRootNodeId: "node:test",
  codeLabel: {
    verdictLabel: "CONTESTED",
    servedNodeId: "node:test",
    servedStrength: 0.4,
    margin: null,
    registerVersion: 1
  },
  synthesisRoleControls: {
    synthesizerRoleRef: "test-layer:synthesizer",
    evaluatorRoleRef: "test-layer:evaluator",
    evaluatorLoopMaxRounds: 3
  }
});

const SATISFIED: EvaluatorVerdict = {
  satisfied: true,
  objection: null,
  criteria: {
    fairnessToLosers: true,
    statementLabelAgreement: true,
    noOverstatement: true,
    restatement: true,
    citationTracing: true
  }
};

function passingDependencies(overrides: Partial<ServeGateDependencies> = {}): ServeGateDependencies {
  return {
    synthesize: async () => ({
      candidate: composed("A provisional answer.", "Research it with an independent source."),
      candidateRef: "artifact:test-layer:synthesizer:1"
    }),
    evaluate: async () => ({ verdict: SATISFIED, verdictRef: "artifact:test-layer:evaluator" }),
    applyBandCeiling: ({ basis, candidateConfidenceBand }) => ({
      kind: "NOT_CAPPED",
      confidenceBand: candidateConfidenceBand,
      ceiling: {
        label: "TEST_CEILING",
        basis,
        registerRowKey: "test-layer:way-of-knowing-ceiling",
        registerVersion: 1,
        sourceRef: "test-layer:DR-086",
        liftPath: "test-layer:improve-basis"
      }
    }),
    ...overrides
  };
}

describe("FX-SRV-17 / FX-SRV-01b / FX-LG-06 — ordered legal serve path (T9 shape)", () => {
  it("runs digest → synthesis loop → Q51 form → band ceiling and defaults to DOWNGRADED", async () => {
    const judgedStatements: string[] = [];
    const result = await runServeGateChain(reasoningInput(), passingDependencies({
      evaluate: async (request) => {
        judgedStatements.push(request.candidateStatement);
        return { verdict: SATISFIED, verdictRef: "artifact:test-layer:evaluator" };
      }
    }));

    expect(result.terminal).toBe("DOWNGRADED");
    expect(result.answerForm).toEqual({
      kind: "HYPOTHESIS_WITH_RESEARCH_PLAN",
      hypothesis: "A provisional answer.",
      researchPlan: "Research it with an independent source."
    });
    expect(result.gateTrace).toEqual([
      "DIGEST_BUILT", "COMPOSED", "SYNTHESIS_LOOP_SATISFIED",
      "GATE4_Q51_DOWNGRADE", "BAND_CEILING_PASS", "SERVE"
    ]);
    // ONE evaluator call sees the WHOLE candidate — the retired per-segment
    // conformance sweep is gone with the gate it fed.
    expect(judgedStatements).toEqual([
      "A provisional answer.\nResearch it with an independent source."
    ]);
  });

  it("fails loudly when synthesis omits the required research-plan segment", async () => {
    await expect(runServeGateChain(reasoningInput(), passingDependencies({
      synthesize: async () => ({ candidate: composed("Only a hypothesis was composed."), candidateRef: "artifact:1" })
    }))).rejects.toMatchObject({ code: "COMPOSITION_CONTRACT_ERROR" });
  });

  it("reaches the NO_ARTIFACT crash class when synthesis returns no segment", async () => {
    // Before T9 this threw COMPOSITION_CONTRACT_ERROR. The goal enumerates
    // "no-artifact" as one of the four COMPONENTS_ONLY survivors, so it is a
    // terminal with a named mark now, not a run failure.
    const input = reasoningInput();
    input.nodes[0]!.wayOfKnowing = "LOOKED_UP";
    input.nodes[0]!.locator = "https://example.invalid/test-fixture";
    const result = await runServeGateChain(input, passingDependencies({ synthesize: async () => ({ candidate: [], candidateRef: "artifact:1" }) }));
    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.crashClass).toBe("NO_ARTIFACT");
    expect(result.conditionMarks).toEqual(["DEFECT"]);
  });

  it("refuses a segment that references a node outside the serve set", async () => {
    await expect(runServeGateChain(reasoningInput(), passingDependencies({
      synthesize: async () => ({
        candidate: [{
          segmentId: "segment:1",
          text: "Out of set.",
          loadBearing: true,
          assertedNodeRefs: ["node:absent"],
          servedNumberRefs: []
        }],
        candidateRef: "artifact:1"
      })
    }))).rejects.toMatchObject({ code: "COMPOSITION_CONTRACT_ERROR" });
  });
});

describe("FX-SRV-01a / FX-C52-01 — the Q51 FORM limb (T13 owns the form; T9 kept it)", () => {
  it("serves LOOKED_UP with a resolving locator as a verdict", async () => {
    const input = reasoningInput();
    input.nodes[0]!.wayOfKnowing = "LOOKED_UP";
    input.nodes[0]!.locator = "https://example.invalid/test-fixture";
    const result = await runServeGateChain(input, passingDependencies({
      synthesize: async () => ({ candidate: composed("Evidence-backed verdict."), candidateRef: "artifact:1" })
    }));
    expect(result.terminal).toBe("SERVED");
    expect(result.answerForm?.kind).toBe("VERDICT");
  });

  it("serves a LOOKED_UP node whose provenance cannot resolve — the locator BLOCK is deleted", async () => {
    // Former terminal: COMPONENTS_ONLY + DEFECT via GATE4_Q51_LOCATOR_BLOCK.
    const input = reasoningInput();
    input.nodes[0]!.wayOfKnowing = "LOOKED_UP";
    const result = await runServeGateChain(input, passingDependencies({
      synthesize: async () => ({ candidate: composed("Unlocatable claim."), candidateRef: "artifact:1" })
    }));
    expect(result.terminal).toBe("SERVED");
    expect(result.crashClass).toBeNull();
    expect(result.gateTrace).not.toContain("GATE4_Q51_LOCATOR_BLOCK");
  });
});
