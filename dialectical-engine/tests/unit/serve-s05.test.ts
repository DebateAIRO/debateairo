import { describe, expect, it } from "vitest";
import { preserveEnvelopeTerminalConditionMarkRecords } from "@debateai/runner";
import {
  buildFactBundle,
  assertRequiredConditionMarkRecords,
  compositionEvidenceRequired,
  createEnvelopeExhaustedResult,
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
  type ConditionMarkRecord,
  type DigestSourceNode,
  type EvaluatorVerdict,
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
  compositionBudget: {
    tier: "low",
    bound: 100_000,
    registerRowKey: "compositionBundleBudget.low",
    registerVersion: 91,
    sourceRef: "test-layer:DR-078"
  },
  candidateConfidenceBand: "TOP_TEST_BAND",
  digestNodes: digestNodes(),
  servedRootNodeId: "node:test",
  codeLabel: {
    verdictLabel: "SUPPORTED",
    servedNodeId: "node:test",
    servedStrength: 0.8,
    margin: 0.2,
    registerVersion: 91
  },
  synthesisRoleControls: {
    synthesizerRoleRef: "test-layer:synthesizer",
    evaluatorRoleRef: "test-layer:evaluator",
    evaluatorLoopMaxRounds: 3
  }
});

const digestNodes = (): readonly DigestSourceNode[] => [{
  nodeId: "node:test",
  statement: "A ruled test fact.",
  finalStrength: 0.8,
  wayOfKnowing: "LOOKED_UP",
  marks: [],
  polarityRelations: [],
  isPosition: true,
  isSurvivingObjection: false
}];

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

const unsatisfied = (objection: string): EvaluatorVerdict => ({
  satisfied: false,
  objection,
  criteria: { ...SATISFIED.criteria, citationTracing: false }
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
    synthesize: async () => [segment("segment:verdict", "Evidence-backed verdict.", true)],
    evaluate: async () => SATISFIED,
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
    // T9: the three PRE-composition quality terminals this test used to build
    // (R9 block, Q53 block, byte-budget block) are gone — they all serve now.
    // The predicate is unchanged and still discriminates: a crash class that
    // never reached synthesis carries no composition evidence; a served answer
    // does. DIGEST_CANNOT_EXIST is the pre-synthesis case that remains.
    const preSynthesisTerminal = await runServeGateChain({
      ...input(),
      digestNodes: digestNodes().map((node) => ({ ...node, statement: "z".repeat(20_000) })),
      compositionBudget: { ...input().compositionBudget, bound: 64 }
    }, dependencies());
    const retiredR9Input = input();
    const servedDespiteFailedRestatement = await runServeGateChain({
      ...retiredR9Input,
      nodes: retiredR9Input.nodes.map((node, index) => index === 0
        ? { ...node, restatementStatus: "FAIL" as const }
        : node)
    }, dependencies());
    const servedDespiteObjections = await runServeGateChain({
      ...input(),
      factBundle: buildFactBundle({ ...factBundle(), residualObjections: ["test-layer objection"] })
    }, dependencies());
    const servedDespiteUntracedCitation = await runServeGateChain(input(), dependencies({
      evaluate: async () => unsatisfied("A claim traces to no digest node.")
    }));

    expect(preSynthesisTerminal).toMatchObject({
      terminal: "COMPONENTS_ONLY", coverageMode: "NOT_RUN", crashClass: "DIGEST_CANNOT_EXIST"
    });
    expect(servedDespiteFailedRestatement.terminal).toBe("SERVED");
    expect(servedDespiteObjections.terminal).toBe("SERVED");
    expect(servedDespiteUntracedCitation.terminal).toBe("SERVED");
    expect(compositionEvidenceRequired(preSynthesisTerminal)).toBe(false);
    expect(compositionEvidenceRequired(servedDespiteFailedRestatement)).toBe(true);
    expect(compositionEvidenceRequired(servedDespiteObjections)).toBe(true);
    expect(compositionEvidenceRequired(servedDespiteUntracedCitation)).toBe(true);
  });

  it("distinguishes the independent composition budget from the cost envelope", async () => {
    // T9: the byte budget is a code PRECONDITION now — it tightens the digest's
    // summaries. It still has nothing to do with the run cost envelope, and it
    // still reaches a terminal only when no digest can exist at all.
    let synthesizeCalls = 0;
    const result = await runServeGateChain({
      ...input(),
      digestNodes: digestNodes().map((node) => ({ ...node, statement: "z".repeat(20_000) })),
      compositionBudget: { ...input().compositionBudget, bound: 64 }
    }, dependencies({
      synthesize: async () => { synthesizeCalls += 1; return [segment("never", "never", true)]; }
    }));

    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.crashClass).toBe("DIGEST_CANNOT_EXIST");
    expect(result.conditionMarks).toEqual(["DIGEST-CANNOT-EXIST"]);
    expect(result.gateTrace).toEqual(["DIGEST_CANNOT_EXIST", "COMPONENTS_ONLY_DIGEST"]);
    expect(result.compositionBudget).toMatchObject({ tier: "low", registerVersion: 91 });
    expect(result.gateTrace).not.toContain("ENVELOPE_EXHAUSTED");
    expect(synthesizeCalls).toBe(0);
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

  it("traces EVERY segment's citations through one evaluator call and keeps stable ids plus number refs", async () => {
    // T9: sampling belonged to the retired conformance gate. The evaluator
    // traces every load-bearing claim to a digest node, so the coverage is
    // EXHAUSTIVE by construction and there is no unsampled segment left.
    const judged: string[] = [];
    const result = await runServeGateChain(input(), dependencies({
      synthesize: async () => [
        segment("segment:load", "Load-bearing.", true),
        segment("segment:second", "Second detail.", false),
        segment("segment:third", "Third detail.", false)
      ],
      evaluate: async (request) => {
        judged.push(request.candidateStatement);
        return SATISFIED;
      }
    }));

    expect(judged).toEqual(["Load-bearing.\nSecond detail.\nThird detail."]);
    expect(result.conformance).toEqual([
      { segmentId: "segment:load", state: "JUDGED", conforms: true },
      { segmentId: "segment:second", state: "JUDGED", conforms: true },
      { segmentId: "segment:third", state: "JUDGED", conforms: true }
    ]);
    expect(result.segments[0]).toMatchObject({
      segmentId: "segment:load",
      servedNumberRefs: ["number:segment:load"]
    });
    expect(result.coverageMode).toBe("EXHAUSTIVE");
  });

  it("covers the retired Q53, the retry-to-satisfied loop, the exhausted loop and the retired Q51 locator block as values", async () => {
    // Every arm below used to end in COMPONENTS_ONLY + DEFECT. Under T9 each
    // one SERVES, and the record says which route it took.
    const q53 = input();
    q53.factBundle = buildFactBundle({ ...factBundle(), residualObjections: ["test-layer objection"] });
    expect((await runServeGateChain(q53, dependencies())).gateTrace).toEqual([
      "DIGEST_BUILT", "COMPOSED", "SYNTHESIS_LOOP_SATISFIED",
      "GATE4_Q51_PASS", "BAND_CEILING_PASS", "SERVE"
    ]);

    let evaluateCalls = 0;
    const recovered = await runServeGateChain(input(), dependencies({
      evaluate: async () => ++evaluateCalls > 1 ? SATISFIED : unsatisfied("Round 1 objection.")
    }));
    expect(recovered.terminal).toBe("SERVED");
    expect(recovered.gateTrace).toContain("RECOMPOSED_ONCE");
    expect(recovered.loopRounds).toHaveLength(2);

    const exhausted = await runServeGateChain(input(), dependencies({
      evaluate: async () => unsatisfied("A claim traces to no digest node.")
    }));
    expect(exhausted.terminal).toBe("SERVED");
    expect(exhausted.standingObjection).toBe("A claim traces to no digest node.");
    expect(exhausted.conditionMarks).toContain("SYNTHESIS-OBJECTION-STANDING");

    const provenance = input();
    provenance.nodes[0]!.locator = null;
    const provenanceServed = await runServeGateChain(provenance, dependencies());
    expect(provenanceServed.terminal).toBe("SERVED");
    expect(provenanceServed.gateTrace).not.toContain("GATE4_Q51_LOCATOR_BLOCK");
    expect(deriveConformanceOutcome(provenanceServed.coverageMode, provenanceServed.conformance)).toBe("PASS");
  });
});

describe("S05 AC-54/55/63 — machine-owned output shape", () => {
  it("PANEL-01 rev3 preserves the DR-161 record when an M=2 serve exhausts its envelope", () => {
    const exhausted = createEnvelopeExhaustedResult({
      factBundle: buildFactBundle({
        ...factBundle(),
        conditionMarks: ["UNSERVED-MAKER-POSITION"]
      }),
      compositionBudget: input().compositionBudget,
      verifiedNodeIds: ["node:openai-root"],
      skippedEnrichmentRows: [],
      // F4: the guard is retired; the status is recorded, not consulted.
      protectedCoreRestatement: "PASS",
      servedStatementExists: false
    });
    const unservedMakerRecord = {
      mark: "UNSERVED-MAKER-POSITION",
      scope: "answer",
      subjectRef: "node:openai-root",
      reason: "The strongest post-exclusion maker root was served: OpenAI position node:openai-root; Anthropic position node:anthropic-root remains graph-visible but unserved",
      liftPath: null,
      servedRootRule: "max-propagated-strength-lexicographic-tiebreak",
      affectedNodeIds: ["node:openai-root", "node:anthropic-root"]
    } as const satisfies ConditionMarkRecord;
    const envelopeRecord = {
      mark: "ENVELOPE_EXHAUSTED",
      scope: "answer",
      subjectRef: "run:two-maker",
      reason: "RUN_COST_ENVELOPE_EXHAUSTED",
      liftPath: null,
      servedRootRule: null,
      affectedNodeIds: ["node:openai-root"]
    } as const satisfies ConditionMarkRecord;

    const records = preserveEnvelopeTerminalConditionMarkRecords([unservedMakerRecord], [envelopeRecord]);

    expect(exhausted).toMatchObject({
      terminal: "COMPONENTS_ONLY",
      conditionMarks: ["UNSERVED-MAKER-POSITION", "ENVELOPE_EXHAUSTED"]
    });
    expect(() => assertRequiredConditionMarkRecords(exhausted.conditionMarks, records)).not.toThrow();
  });

  it("DR-161 refuses either half of the unserved-maker mark/record contract when missing", () => {
    const record = {
      mark: "UNSERVED-MAKER-POSITION",
      scope: "answer",
      subjectRef: "node:openai-root",
      reason: "The strongest root served OpenAI root node:openai-root; Anthropic root node:anthropic-root remains unserved",
      liftPath: null,
      servedRootRule: "max-propagated-strength-lexicographic-tiebreak",
      affectedNodeIds: ["node:openai-root", "node:anthropic-root"]
    } as const;

    expect(() => assertRequiredConditionMarkRecords(["UNSERVED-MAKER-POSITION"], []))
      .toThrowError(expect.objectContaining({ code: "CONDITION_MARK_RECORD_REQUIRED" }));
    expect(() => assertRequiredConditionMarkRecords([], [record]))
      .toThrowError(expect.objectContaining({ code: "CONDITION_MARK_RECORD_WITHOUT_MARK" }));
    expect(() => assertRequiredConditionMarkRecords(["UNSERVED-MAKER-POSITION"], [record])).not.toThrow();
  });

  it("requires honesty fields outside the composition model and renders them in components-only mode", async () => {
    const marked = input();
    marked.factBundle = buildFactBundle({ ...factBundle(), conditionMarks: ["TEST-LAYER-MARK"] });
    const result = await runServeGateChain({
      ...marked,
      digestNodes: digestNodes().map((node) => ({ ...node, statement: "z".repeat(20_000) })),
      compositionBudget: { ...marked.compositionBudget, bound: 64 }
    }, dependencies());
    expect(result.factBundle).toMatchObject({
      badges: ["TEST-LAYER"],
      reversalPoint: expect.any(String),
      buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    });
    expect(result.answerForm).toBeNull();
    expect(result.conditionMarks).toEqual(["TEST-LAYER-MARK", "DIGEST-CANNOT-EXIST"]);
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
    expect(deriveHonestVerdict({ usableBasis: false, reasonRef: "condition:test", labelBasis: null })).toEqual({
      verdictState: null,
      confidenceBand: null,
      unavailable: { reasonRef: "condition:test" },
      derivation: null
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
    // T8 / S5-2: WITHHELD is repealed with the branch that produced it. The fold
    // still honours the sealed cursor and the at-sequence ordering — proved here
    // with the two statuses that survive, out of order and cursor-clipped.
    expect(foldServedNumberEvents([
      { status: "EVICTED", reason: "MISSING-NUMBER", atSequence: 9 },
      { status: "PRESENT", reason: null, atSequence: 2 },
      { status: "EVICTED", reason: "MISSING-NUMBER", atSequence: 4 }
    ], 4)).toEqual({
      status: "EVICTED", reason: "MISSING-NUMBER"
    });
    expect(foldServedNumberEvents([
      { status: "PRESENT", reason: null, atSequence: 2 },
      { status: "EVICTED", reason: "MISSING-NUMBER", atSequence: 9 }
    ], 4)).toEqual({
      status: "PRESENT", reason: null
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
