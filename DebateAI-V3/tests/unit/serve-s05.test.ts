import { describe, expect, it } from "vitest";
import {
  buildFactBundle,
  compositionEvidenceRequired,
  deriveAnswerServeState,
  deriveBandCeiling,
  deriveConformanceOutcome,
  deriveHonestVerdict,
  deriveWorkReadState,
  foldServedNumberEvents,
  projectConditionMarksByNode,
  projectProvenance,
  reconcileServeItems,
  runServeGateChain,
  sanitizeServeItem,
  validateServeItems,
  type BandCeilingDecision,
  type BandCeilingRegisterRow,
  type ComposedSegment,
  type ServeGateInput,
  type ServeGateDependencies
} from "@debateai/serve";

const segment = (segmentId: string, text: string, referencesLoadBearingInput: boolean): ComposedSegment => ({
  segmentId,
  text,
  loadBearing: false,
  assertedNodeRefs: referencesLoadBearingInput ? ["node:test"] : [],
  servedNumberRefs: referencesLoadBearingInput ? [`number:${segmentId}`] : []
});

const factBundle = () => buildFactBundle({
  facts: ["A ruled test fact."],
  residualObjections: [],
  badges: ["TEST-LAYER"],
  conditionMarks: [],
  reversalPoint: "A contrary test-layer observation would reverse the answer.",
  buildsOnPrevious: { value: false, answerRef: null },
  memoryDisclosure: null
});

const input = (): ServeGateInput => ({
  nodes: [{
    nodeId: "node:test",
    text: "A ruled test fact.",
    wayOfKnowing: "LOOKED_UP",
    provenanceRef: "artifact:test",
    locator: "https://example.invalid/test-layer",
    restatementStatus: "PASS",
    loadBearing: true
  }],
  factBundle: factBundle(),
  maxRecompose: 2,
  compositionBudget: {
    tier: "low",
    bound: 10,
    registerRowKey: "compositionBundleBudget.low",
    registerVersion: 91,
    sourceRef: "test-layer:DR-078"
  },
  strangerSampleRate: 0.5,
  candidateConfidenceBand: "TOP_TEST_BAND"
});

const passCeiling: BandCeilingDecision = {
  kind: "NOT_CAPPED",
  confidenceBand: "TOP_TEST_BAND",
  ceiling: {
    label: "TEST_CEILING",
    basis: { LOOKED_UP: 1, RAN: 0, REASONING: 0 },
    registerRowKey: "wayOfKnowingCeiling",
    registerVersion: 91,
    sourceRef: "test-layer:DR-086",
    liftPath: "test-layer:upgrade-way-of-knowing"
  }
};

const bandCeilingRow = (): BandCeilingRegisterRow => ({
  rowKey: "wayOfKnowingCeiling",
  registerVersion: 91,
  sourceRef: "test-layer:DR-082-086",
  value: {
    bandOrder: ["TEST_LOW_BAND", "TEST_TOP_BAND"],
    ceilingLabels: ["TEST_DEFAULT_CEILING", "TEST_REASONING_CEILING"],
    defaultCeiling: {
      label: "TEST_DEFAULT_CEILING",
      ceilingBand: "TEST_TOP_BAND",
      liftPath: "test-layer:retain-top-band"
    },
    cuts: [{
      minimumShares: { REASONING: 0.5 },
      label: "TEST_REASONING_CEILING",
      ceilingBand: "TEST_LOW_BAND",
      liftPath: "test-layer:improve-way-of-knowing"
    }]
  }
});

function dependencies(overrides: Partial<ServeGateDependencies> = {}): ServeGateDependencies {
  return {
    measureCompositionBundle: () => 1,
    compose: async () => [segment("segment:verdict", "Evidence-backed verdict.", true)],
    selectSample: (candidate) => candidate.segmentId === "segment:sampled",
    conform: async (candidate, state) => ({ segmentId: candidate.segmentId, state, conforms: true }),
    postComposeR9: async () => true,
    applyBandCeiling: () => passCeiling,
    ...overrides
  };
}

describe("S05 P9 / FX-LG-03 / FX-SRV-13 — typed gate pipeline", () => {
  it("derives both band-ceiling states from the register cut matrix and WOK basis", () => {
    expect(deriveBandCeiling({
      candidateConfidenceBand: "TEST_TOP_BAND",
      basis: { LOOKED_UP: 0, RAN: 0, REASONING: 2 },
      row: bandCeilingRow()
    })).toMatchObject({
      kind: "CAPPED", confidenceBand: "TEST_LOW_BAND",
      ceiling: { label: "TEST_REASONING_CEILING", registerVersion: 91 }
    });
    expect(deriveBandCeiling({
      candidateConfidenceBand: "TEST_LOW_BAND",
      basis: { LOOKED_UP: 2, RAN: 0, REASONING: 0 },
      row: bandCeilingRow()
    })).toMatchObject({
      kind: "NOT_CAPPED", confidenceBand: "TEST_LOW_BAND",
      ceiling: { label: "TEST_DEFAULT_CEILING", registerVersion: 91 }
    });
  });

  it("requires composition evidence only after the composition stage begins", async () => {
    const basePreComposeR9Input = input();
    const preComposeR9TerminalInput = {
      ...basePreComposeR9Input,
      nodes: basePreComposeR9Input.nodes.map((node, index) => index === 0
        ? { ...node, restatementStatus: "FAIL" as const }
        : node)
    };
    const preComposeR9Terminal = await runServeGateChain(preComposeR9TerminalInput, dependencies());
    const preComposeQ53TerminalInput = input();
    preComposeQ53TerminalInput.factBundle = buildFactBundle({
      ...factBundle(), residualObjections: ["test-layer objection"]
    });
    const preComposeQ53Terminal = await runServeGateChain(preComposeQ53TerminalInput, dependencies());
    const preComposeBudgetTerminal = await runServeGateChain(input(), dependencies({
      measureCompositionBundle: () => 11
    }));
    const postComposeTerminal = await runServeGateChain(input(), dependencies({
      conform: async (candidate, state) => ({ segmentId: candidate.segmentId, state, conforms: false })
    }));

    expect(preComposeR9Terminal).toMatchObject({
      terminal: "COMPONENTS_ONLY", coverageMode: "NOT_RUN", conditionMarks: ["DEFECT"]
    });
    expect(preComposeQ53Terminal).toMatchObject({
      terminal: "COMPONENTS_ONLY", coverageMode: "NOT_RUN", conditionMarks: ["DEFECT"]
    });
    expect(compositionEvidenceRequired(preComposeR9Terminal)).toBe(false);
    expect(compositionEvidenceRequired(preComposeQ53Terminal)).toBe(false);
    expect(compositionEvidenceRequired(preComposeBudgetTerminal)).toBe(false);
    expect(compositionEvidenceRequired(postComposeTerminal)).toBe(true);
  });

  it("distinguishes the independent composition budget from the cost envelope", async () => {
    let composeCalls = 0;
    const result = await runServeGateChain(input(), dependencies({
      measureCompositionBundle: () => 11,
      compose: async () => { composeCalls += 1; return [segment("never", "never", true)]; }
    }));

    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.conditionMarks).toEqual(["DEFECT"]);
    expect(result.gateTrace).toEqual([
      "GATE1_R9_PASS",
      "GATE2_Q53_PASS_VACUOUS",
      "COMPOSITION_BUDGET_EXCEEDED",
      "COMPONENTS_ONLY_DEFECT"
    ]);
    expect(result.compositionBudget).toMatchObject({ tier: "low", registerVersion: 91 });
    expect(result.gateTrace).not.toContain("ENVELOPE_EXHAUSTED");
    expect(composeCalls).toBe(0);
  });

  it("caps a served band as an independent final gate and never adds a terminal", async () => {
    const result = await runServeGateChain(input(), dependencies({
      applyBandCeiling: () => ({
        ...passCeiling,
        kind: "CAPPED",
        confidenceBand: "CAPPED_TEST_BAND"
      })
    }));

    expect(result.terminal).toBe("SERVED");
    expect(result.confidenceBand).toBe("CAPPED_TEST_BAND");
    expect(result.bandCeiling).toMatchObject({
      label: "TEST_CEILING",
      registerRowKey: "wayOfKnowingCeiling",
      liftPath: "test-layer:upgrade-way-of-knowing"
    });
    expect(result.gateTrace.slice(-2)).toEqual(["BAND_CEILING_CAPPED", "SERVE"]);
    expect(result.gateTrace).not.toContain("COMPONENTS_ONLY_DEFECT");
  });

  it("samples only non-load-bearing segments and preserves stable ids plus number refs", async () => {
    const observed: Array<[string, string]> = [];
    const result = await runServeGateChain(input(), dependencies({
      compose: async () => [
        segment("segment:load", "Load-bearing.", true),
        segment("segment:sampled", "Sampled detail.", false),
        segment("segment:omitted", "Unsampled detail.", false)
      ],
      conform: async (candidate, state) => {
        observed.push([candidate.segmentId, state]);
        return { segmentId: candidate.segmentId, state, conforms: true };
      }
    }));

    expect(observed).toEqual([
      ["segment:load", "JUDGED"],
      ["segment:sampled", "SAMPLED_PASSED"]
    ]);
    expect(result.conformance).toEqual([
      { segmentId: "segment:load", state: "JUDGED", conforms: true },
      { segmentId: "segment:sampled", state: "SAMPLED_PASSED", conforms: true },
      { segmentId: "segment:omitted", state: "NOT_SAMPLED", conforms: true }
    ]);
    expect(result.segments[0]).toMatchObject({
      segmentId: "segment:load",
      servedNumberRefs: ["number:segment:load"]
    });
    expect(result.coverageMode).toBe("SAMPLED");
  });

  it("covers Q53, recompose-to-pass, second-failure, and Q51 provenance terminals as values", async () => {
    const q53 = input();
    q53.factBundle = buildFactBundle({ ...factBundle(), residualObjections: ["test-layer objection"] });
    expect((await runServeGateChain(q53, dependencies())).gateTrace).toEqual([
      "GATE1_R9_PASS", "GATE2_Q53_BLOCK", "COMPONENTS_ONLY_DEFECT"
    ]);

    let conformCalls = 0;
    const recovered = await runServeGateChain(input(), dependencies({
      conform: async (candidate, state) => ({
        segmentId: candidate.segmentId,
        state,
        conforms: ++conformCalls > 1
      })
    }));
    expect(recovered.terminal).toBe("SERVED");
    expect(recovered.gateTrace).toContain("RECOMPOSED_ONCE");

    const exhausted = await runServeGateChain(input(), dependencies({
      conform: async (candidate, state) => ({ segmentId: candidate.segmentId, state, conforms: false })
    }));
    expect(exhausted.terminal).toBe("COMPONENTS_ONLY");

    const provenance = input();
    provenance.nodes[0]!.locator = null;
    const provenanceFailure = await runServeGateChain(provenance, dependencies());
    expect(provenanceFailure.terminal).toBe("COMPONENTS_ONLY");
    expect(provenanceFailure.gateTrace.slice(-2))
      .toEqual(["GATE4_Q51_LOCATOR_BLOCK", "COMPONENTS_ONLY_DEFECT"]);
    expect(deriveConformanceOutcome(provenanceFailure.coverageMode, provenanceFailure.conformance)).toBe("PASS");
  });
});

describe("S05 AC-54/55/63 — machine-owned output shape", () => {
  it("requires honesty fields outside the composition model and renders them in components-only mode", async () => {
    const marked = input();
    marked.factBundle = buildFactBundle({ ...factBundle(), conditionMarks: ["TEST-LAYER-MARK"] });
    const result = await runServeGateChain(marked, dependencies({
      measureCompositionBundle: () => 11
    }));
    expect(result.factBundle).toMatchObject({
      badges: ["TEST-LAYER"],
      reversalPoint: expect.any(String),
      buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    });
    expect(result.answerForm).toBeNull();
    expect(result.conditionMarks).toEqual(["TEST-LAYER-MARK", "DEFECT"]);
    expect(result.projections).toEqual({
      reversalPoint: "A contrary test-layer observation would reverse the answer.",
      buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    });
  });

  it("DR-081 keeps layer 1 live and exposes per-side layer 2 only behind the printed flip row", () => {
    const provenance = {
      sourceRef: "artifact:test",
      producer: "provider:test",
      replayHandle: "replay:test",
      perSide: {
        support: ["artifact:support"],
        attack: ["artifact:attack"]
      }
    };
    const flip = {
      registerRowKey: "test-layer:projection-layering",
      registerVersion: 91,
      sourceRef: "test-layer:DR-081"
    };
    expect(projectProvenance(provenance, { ...flip, layer2Enabled: false })).toEqual({
      sourceRef: "artifact:test",
      producer: "provider:test",
      replayHandle: "replay:test",
      layering: { ...flip, layer: 1 }
    });
    expect(projectProvenance(provenance, { ...flip, layer2Enabled: true })).toEqual({
      sourceRef: "artifact:test",
      producer: "provider:test",
      replayHandle: "replay:test",
      perSide: provenance.perSide,
      layering: { ...flip, layer: 2 }
    });
  });
});

describe("S05 AC-86..AC-90 — refusal, sanitize, reconcile, read expiry, honest absence", () => {
  it.each([
    [{ ledgerProduced: false, items: [], currentNodeIds: [] }, "SERVE_OUTPUT_NOT_FROM_LEDGER"],
    [{ ledgerProduced: true, items: {}, currentNodeIds: [] }, "SERVE_ITEMS_NOT_A_LIST"],
    [{ ledgerProduced: true, items: [{ nodeId: "node:a", status: "READY" }, null], currentNodeIds: ["node:a"] }, "SERVE_ITEM_INVALID"],
    [{ ledgerProduced: true, items: [{ nodeId: "node:a", status: "MYSTERY" }], currentNodeIds: ["node:a"] }, "SERVE_STATUS_UNKNOWN"],
    [{ ledgerProduced: true, items: [{ nodeId: "node:other", status: "READY" }], currentNodeIds: ["node:a"] }, "SERVE_ITEM_OUT_OF_NODE_SET"]
  ] as const)("keeps AC-86 refusal %# distinct", (candidate, code) => {
    expect(() => validateServeItems(candidate)).toThrow(expect.objectContaining({ code }));
  });

  it("strips raw/debug material and drops secret-bearing reason strings", () => {
    expect(sanitizeServeItem({
      nodeId: "node:a",
      status: "READY",
      rawText: "private judge output",
      prompt: "private prompt",
      debug: { contractVersion: "v-test", internalChain: "hidden" },
      reason: "authorization bearer test-secret"
    })).toEqual({
      nodeId: "node:a",
      status: "READY",
      debug: { contractVersion: "v-test" },
      reason: null
    });
  });

  it("derives current coverage and never trusts stale asserted membership", () => {
    expect(reconcileServeItems({
      currentNodes: [
        { nodeId: "node:a", workActive: true },
        { nodeId: "node:b", workActive: false }
      ],
      items: [
        { nodeId: "node:a", status: "READY" },
        { nodeId: "node:stale", status: "READY" }
      ]
    })).toEqual([
      { nodeId: "node:a", status: "READY" },
      { nodeId: "node:b", status: "ERROR", reason: "MISSING_COMPLETED_ITEM" }
    ]);
  });

  it("derives expired work on every read without writing and returns unavailable rather than a number", () => {
    expect(deriveWorkReadState({
      storedState: "ACTIVE",
      deadline: new Date("2026-08-08T00:00:00.000Z"),
      readAt: new Date("2026-08-08T00:00:01.000Z")
    })).toEqual({ state: "FAILED", reason: "DEADLINE_EXPIRED" });
    expect(deriveHonestVerdict({ usableBasis: false, reasonRef: "condition:test" })).toEqual({
      verdictState: null,
      confidenceBand: null,
      unavailable: { reasonRef: "condition:test" }
    });
  });
});

describe("S05 P5/P6 / FX-SRV-03..05 — append-only folds and sealed reads", () => {
  const events = [
    { status: "PRESENT" as const, reason: null, atSequence: 1 },
    { status: "EVICTED" as const, reason: "MISSING-NUMBER", atSequence: 3 }
  ];

  it("folds number status and derives current answer degradation without mutating sealed state", () => {
    expect(foldServedNumberEvents(events)).toEqual({ status: "EVICTED", reason: "MISSING-NUMBER" });
    expect(foldServedNumberEvents([
      { status: "EVICTED", reason: "MISSING-NUMBER", atSequence: 9 },
      { status: "PRESENT", reason: null, atSequence: 2 },
      { status: "WITHHELD", reason: "STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED", atSequence: 4 }
    ], 4)).toEqual({
      status: "WITHHELD", reason: "STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED"
    });
    expect(foldServedNumberEvents([{
      status: "WITHHELD", reason: "STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED", atSequence: 1
    }])).toEqual({
      status: "WITHHELD", reason: "STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED"
    });
    expect(deriveAnswerServeState({
      sealedServeState: "COMPOSED",
      numberEvents: events,
      readMode: "CURRENT"
    })).toEqual({ serveState: "COMPONENTS_ONLY", conditionMarks: ["DEFECT"] });
    expect(deriveAnswerServeState({
      sealedServeState: "COMPOSED",
      numberEvents: events,
      readMode: "SEALED_VERSION"
    })).toEqual({ serveState: "COMPOSED", conditionMarks: [] });
  });
});

describe("S05 FX-SRV-16 read projection limb", () => {
  it("projects one answer-scoped mark only onto its recorded affected nodes", () => {
    const projected = projectConditionMarksByNode(
      ["node:a", "node:b"],
      [
        { nodeId: "node:a", mark: "UNDER-EXPLORED" },
        { nodeId: "node:stale", mark: "SUPERSEDED" }
      ]
    );
    expect(projected.get("node:a")).toEqual(["UNDER-EXPLORED"]);
    expect(projected.get("node:b")).toEqual([]);
  });
});
