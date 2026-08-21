import { describe, expect, it } from "vitest";
import {
  buildFactBundle,
  runServeGateChain,
  type ComposedSegment,
  type ServeGateDependencies,
  type ServeGateInput
} from "@debateai/serve";

const composed = (...texts: string[]): readonly ComposedSegment[] => texts.map((text, index) => ({
  segmentId: `segment:${index + 1}`,
  text,
  loadBearing: true,
  assertedNodeRefs: ["node:test"],
  servedNumberRefs: []
}));

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
  maxRecompose: 2,
  compositionBudget: {
    tier: "low",
    bound: 10,
    registerRowKey: "test-layer:composition-budget",
    registerVersion: 1,
    sourceRef: "test-layer:DR-078"
  },
  strangerSampleRate: 1,
  candidateConfidenceBand: "TEST_BAND"
});

function passingDependencies(overrides: Partial<ServeGateDependencies> = {}): ServeGateDependencies {
  return {
    measureCompositionBundle: () => 1,
    compose: async () => composed("A provisional answer.", "Research it with an independent source."),
    selectSample: () => true,
    conform: async (segment, state) => ({ segmentId: segment.segmentId, state, conforms: true }),
    postComposeR9: async () => true,
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

describe("FX-SRV-17 / FX-SRV-01b / FX-LG-06 — ordered legal serve path", () => {
  it("runs R9 → Q53 → composition budget → conformance → Q51 and defaults to DOWNGRADED", async () => {
    const judgedSegments: string[] = [];
    const result = await runServeGateChain(reasoningInput(), passingDependencies({
      conform: async (segment, state) => {
        judgedSegments.push(segment.text);
        return { segmentId: segment.segmentId, state, conforms: true };
      }
    }));

    expect(result.terminal).toBe("DOWNGRADED");
    expect(result.answerForm).toEqual({
      kind: "HYPOTHESIS_WITH_RESEARCH_PLAN",
      hypothesis: "A provisional answer.",
      researchPlan: "Research it with an independent source."
    });
    expect(result.gateTrace).toEqual([
      "GATE1_R9_PASS", "GATE2_Q53_PASS_VACUOUS", "COMPOSITION_BUDGET_PASS",
      "COMPOSED", "GATE3_CONFORMANCE_PASS_EXHAUSTIVE", "GATE4_Q51_DOWNGRADE",
      "POST_COMPOSE_R9_PASS", "BAND_CEILING_PASS", "SERVE"
    ]);
    expect(judgedSegments).toEqual(["A provisional answer.", "Research it with an independent source."]);
  });

  it("fails loudly when composition omits the required research-plan segment", async () => {
    await expect(runServeGateChain(reasoningInput(), passingDependencies({
      compose: async () => composed("Only a hypothesis was composed.")
    }))).rejects.toMatchObject({ code: "COMPOSITION_CONTRACT_ERROR" });
  });

  it("rejects an empty composed segment list inside the serve package", async () => {
    const input = reasoningInput();
    input.nodes[0]!.wayOfKnowing = "LOOKED_UP";
    input.nodes[0]!.locator = "https://example.invalid/test-fixture";
    await expect(runServeGateChain(input, passingDependencies({ compose: async () => [] })))
      .rejects.toMatchObject({ code: "COMPOSITION_CONTRACT_ERROR" });
  });
});

describe("FX-C52-03 — R9 occupies gate position 1", () => {
  it("routes a pre-compose R9 block to components-only + DEFECT", async () => {
    const input = reasoningInput();
    input.nodes[0]!.restatementStatus = "FAIL";
    let compositionCalls = 0;
    const result = await runServeGateChain(input, passingDependencies({
      compose: async () => { compositionCalls += 1; return composed("should not run"); }
    }));
    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.conditionMarks).toEqual(["DEFECT"]);
    expect(result.gateTrace).toEqual(["GATE1_R9_BLOCK", "COMPONENTS_ONLY_DEFECT"]);
    expect(compositionCalls).toBe(0);
  });
});

describe("FX-SRV-01a / FX-C52-01 — Q51 verdict and locator limbs", () => {
  it("serves LOOKED_UP with a resolving locator as a verdict", async () => {
    const input = reasoningInput();
    input.nodes[0]!.wayOfKnowing = "LOOKED_UP";
    input.nodes[0]!.locator = "https://example.invalid/test-fixture";
    const result = await runServeGateChain(input, passingDependencies({
      compose: async () => composed("Evidence-backed verdict.")
    }));
    expect(result.terminal).toBe("SERVED");
    expect(result.answerForm?.kind).toBe("VERDICT");
  });

  it("serves components-only + DEFECT when Q51 provenance cannot resolve", async () => {
    const input = reasoningInput();
    input.nodes[0]!.wayOfKnowing = "LOOKED_UP";
    const result = await runServeGateChain(input, passingDependencies({
      compose: async () => composed("Unlocatable claim.")
    }));
    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.conditionMarks).toEqual(["DEFECT"]);
    expect(result.gateTrace.slice(-2)).toEqual(["GATE4_Q51_LOCATOR_BLOCK", "COMPONENTS_ONLY_DEFECT"]);
  });
});

describe("FX-SRV-18 — AC-53 route 1", () => {
  it("reaches components-only + DEFECT after two conformance failures", async () => {
    let composeCalls = 0;
    const result = await runServeGateChain(reasoningInput(), passingDependencies({
      compose: async () => { composeCalls += 1; return composed(`attempt ${composeCalls}`); },
      conform: async (segment, state) => ({ segmentId: segment.segmentId, state, conforms: false })
    }));
    expect(composeCalls).toBe(2);
    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.conditionMarks).toContain("DEFECT");
  });

  it("reaches components-only + DEFECT when post-compose verdict-R9 blocks", async () => {
    const result = await runServeGateChain(reasoningInput(), passingDependencies({
      postComposeR9: async () => false
    }));
    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.conditionMarks).toEqual(["DEFECT"]);
    expect(result.gateTrace.slice(-2)).toEqual(["POST_COMPOSE_R9_FAIL", "COMPONENTS_ONLY_DEFECT"]);
  });
});
