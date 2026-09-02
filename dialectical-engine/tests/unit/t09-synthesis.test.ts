import { describe, expect, it } from "vitest";
import {
  DIGEST_CANNOT_EXIST_MARK,
  DIGEST_COMPRESSED_MARK,
  DIGEST_COMPRESSION_LEVELS,
  RETIRED_GATE_TRACE,
  SERVE_CRASH_CLASSES,
  SYNTHESIS_OBJECTION_STANDING_MARK,
  assertEvaluatorVerdict,
  assertFreshContextRequest,
  buildFactBundle,
  buildSynthesisDigest,
  createEnvelopeExhaustedResult,
  isRetiredGateTrace,
  runServeGateChain,
  type ComposedSegment,
  type DigestSourceNode,
  type EvaluatorRequest,
  type EvaluatorVerdict,
  type ServeGateDependencies,
  type ServeGateInput,
  type ServeNode,
  type SynthesizerRequest
} from "@debateai/serve";
import { CONDITION_MARKS, TypedDomainError } from "@debateai/kernel";

/**
 * T9 — the synthesis serve chain (goal-v4 222-270).
 *
 * The DoD rows this file discharges, in the PLAN's order:
 *   1. one test per former gate path AND one per enumerated crash class —
 *      envelope exhaustion included, asserting terminal, mark and the
 *      retired-guard behavior;
 *   2. no non-crash path returns COMPONENTS_ONLY;
 *   3. terminal + mark named per path;
 *   4. evaluator-unsatisfied-3-rounds serves WITH the objection mark;
 *   5. fresh-context + round-2-objection recorded-request assertions;
 *   6. loop-round records.
 * Plus the digest's own RED: a decisive node outside roots/top-2 provably
 * reaches the recorded synthesizer request.
 *
 * No live provider call: every SYNTHESIZER and EVALUATOR call is a recorded
 * double, and the recorded REQUESTS are the evidence.
 */

const BUDGET = Object.freeze({
  tier: "low" as const,
  bound: 200_000,
  registerRowKey: "compositionBundleBudget",
  registerVersion: 7,
  sourceRef: "test:t09"
});

const ROLE_CONTROLS = Object.freeze({
  synthesizerRoleRef: "development:codex-cli",
  evaluatorRoleRef: "development:claude-cli",
  evaluatorLoopMaxRounds: 3
});

const CODE_LABEL = Object.freeze({
  verdictLabel: "CONTESTED",
  servedNodeId: "root:A",
  servedStrength: 0.7,
  margin: 0.1,
  registerVersion: 7
});

function digestNode(overrides: Partial<DigestSourceNode> & { nodeId: string }): DigestSourceNode {
  return Object.freeze({
    statement: `statement for ${overrides.nodeId}`,
    finalStrength: 0.5,
    wayOfKnowing: "LOOKED_UP" as const,
    marks: Object.freeze([]),
    polarityRelations: Object.freeze([]),
    isPosition: false,
    isSurvivingObjection: false,
    ...overrides
  });
}

/** The four-node graph every chain test runs on. */
function digestNodes(): readonly DigestSourceNode[] {
  return Object.freeze([
    digestNode({ nodeId: "root:A", isPosition: true, finalStrength: 0.7 }),
    digestNode({ nodeId: "root:B", isPosition: true, finalStrength: 0.6 }),
    digestNode({
      nodeId: "objection:1",
      isSurvivingObjection: true,
      finalStrength: 0.55,
      polarityRelations: [{ polarity: "attack", targetNodeId: "root:A" }]
    }),
    digestNode({
      nodeId: "objection:2",
      isSurvivingObjection: true,
      finalStrength: 0.5,
      polarityRelations: [{ polarity: "attack", targetNodeId: "root:B" }]
    })
  ]);
}

/**
 * MEASURE, never guess (the fleet's own lesson): a bound that forces the digest
 * to compress but still lets it exist is derived from the artifact — the
 * uncompressed size and the size at MAXIMUM compression, which the
 * DIGEST_CANNOT_EXIST outcome reports — not from a number a test author liked.
 */
function boundForcingCompression(nodes: readonly DigestSourceNode[]): number {
  const uncompressed = buildSynthesisDigest({
    nodes, servedRootNodeId: "root:A", budgetBound: Number.MAX_SAFE_INTEGER
  });
  const atMaxCompression = buildSynthesisDigest({ nodes, servedRootNodeId: "root:A", budgetBound: 0 });
  if (uncompressed.kind !== "DIGEST" || atMaxCompression.kind !== "DIGEST_CANNOT_EXIST") {
    throw new Error("fixture does not span the compression ladder");
  }
  const floor = atMaxCompression.byteSizeAtMaxCompression;
  const ceiling = uncompressed.digest.byteSize;
  expect(ceiling).toBeGreaterThan(floor);
  return Math.floor((floor + ceiling) / 2);
}

function serveNode(overrides: Partial<ServeNode> = {}): ServeNode {
  return {
    nodeId: "root:A",
    text: "A looked-up position.",
    wayOfKnowing: "LOOKED_UP",
    provenanceRef: "artifact:root-a",
    locator: "https://example.invalid/t09",
    restatementStatus: "PASS",
    loadBearing: true,
    ...overrides
  };
}

function chainInput(overrides: Partial<ServeGateInput> = {}): ServeGateInput {
  return {
    nodes: [serveNode()],
    factBundle: buildFactBundle({
      facts: ["A looked-up position."],
      residualObjections: ["objection:1 still stands"],
      badges: [],
      conditionMarks: [],
      reversalPoint: "A contrary measurement would reverse this.",
      buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    }),
    compositionBudget: BUDGET,
    candidateConfidenceBand: "medium",
    digestNodes: digestNodes(),
    servedRootNodeId: "root:A",
    codeLabel: CODE_LABEL,
    synthesisRoleControls: ROLE_CONTROLS,
    ...overrides
  };
}

function segments(text: string): readonly ComposedSegment[] {
  return [
    { segmentId: "s1", text, loadBearing: false, assertedNodeRefs: ["root:A"], servedNumberRefs: ["number:final-strength"] },
    { segmentId: "s2", text: `${text} — research plan.`, loadBearing: false, assertedNodeRefs: ["root:A"], servedNumberRefs: [] }
  ];
}

const SATISFIED: EvaluatorVerdict = Object.freeze({
  satisfied: true,
  objection: null,
  criteria: Object.freeze({
    fairnessToLosers: true,
    statementLabelAgreement: true,
    noOverstatement: true,
    restatement: true,
    citationTracing: true
  })
});

function unsatisfied(objection: string, failing: keyof EvaluatorVerdict["criteria"]): EvaluatorVerdict {
  return Object.freeze({
    satisfied: false,
    objection,
    criteria: Object.freeze({ ...SATISFIED.criteria, [failing]: false })
  });
}

/** A recording double: it keeps every request the chain actually sent. */
function recorder(script: {
  readonly verdicts?: readonly EvaluatorVerdict[];
  readonly synthesize?: (request: SynthesizerRequest) => Promise<readonly ComposedSegment[]>;
  /** Overrides the recorded artifact reference each round reports. */
  readonly candidateRefFor?: (round: number) => string;
}): {
  readonly dependencies: ServeGateDependencies;
  readonly synthesizerRequests: SynthesizerRequest[];
  readonly evaluatorRequests: EvaluatorRequest[];
} {
  const synthesizerRequests: SynthesizerRequest[] = [];
  const evaluatorRequests: EvaluatorRequest[] = [];
  const verdicts = script.verdicts ?? [SATISFIED];
  return {
    synthesizerRequests,
    evaluatorRequests,
    dependencies: {
      synthesize: async (request) => {
        synthesizerRequests.push(request);
        const candidate = script.synthesize !== undefined
          ? await script.synthesize(request)
          : segments(`candidate ${request.round}`);
        // A RECORDED artifact reference, the way the runner supplies one from
        // its provider response — never a label the loop made up.
        return {
          candidate,
          candidateRef: (script.candidateRefFor ?? ((round: number) => `artifact:recorded:${round}`))(request.round),
          candidateCallSiteKey: `COMPOSER:SYNTHESIZER:${request.stage}:${request.round}`
        };
      },
      evaluate: async (request) => {
        evaluatorRequests.push(request);
        return {
          verdict: verdicts[Math.min(evaluatorRequests.length - 1, verdicts.length - 1)]!,
          verdictRef: `artifact:evaluator:${request.round}`,
          verdictCallSiteKey: `POST_COMPOSE_R9:EVALUATOR:${request.round}`
        };
      },
      applyBandCeiling: ({ basis, candidateConfidenceBand }) => ({
        kind: "NOT_CAPPED",
        confidenceBand: candidateConfidenceBand,
        ceiling: {
          label: "TEST_CEILING",
          basis,
          registerRowKey: "test-layer:way-of-knowing-ceiling",
          registerVersion: 1,
          sourceRef: "test-layer:t09",
          liftPath: "test-layer:improve-basis"
        }
      })
    }
  };
}

describe("T9 digest — membership is total; the byte budget governs summary LENGTH only", () => {
  it("carries a decisive node that is neither a root nor a top-2 objection into the recorded synthesizer request", async () => {
    // The RED the goal names (223-231): a decisive node outside roots/top-2
    // must PROVABLY reach the synthesizer. It is neither a position nor one of
    // the two strongest surviving objections, so every membership rule that
    // selects "the roots plus the emphasis" drops it.
    const decisive = digestNode({
      nodeId: "evidence:decisive",
      statement: "The measurement that actually settles the question.",
      finalStrength: 0.05,
      wayOfKnowing: "RAN"
    });
    const nodes = [...digestNodes(), decisive];
    const double = recorder({});
    const result = await runServeGateChain(
      chainInput({ digestNodes: nodes }),
      double.dependencies
    );

    const recorded = double.synthesizerRequests[0]!;
    expect(recorded.digest.nodes.map((entry) => entry.nodeId)).toContain("evidence:decisive");
    expect(recorded.digest.nodes).toHaveLength(nodes.length);
    expect(recorded.digest.emphasis.topSurvivingObjectionNodeIds).not.toContain("evidence:decisive");
    expect(recorded.digest.emphasis.runnerUpPositionNodeIds).not.toContain("evidence:decisive");
    expect(JSON.stringify(recorded)).toContain("The measurement that actually settles the question.");
    expect(result.terminal).toBe("SERVED");
  });

  it("keeps every node at every compression level and shortens summaries instead", () => {
    const long = "x".repeat(4_000);
    const nodes = digestNodes().map((node) => digestNode({ ...node, statement: long }));
    // The ladder is widest-first and ends at maximum compression.
    expect(DIGEST_COMPRESSION_LEVELS[0]).toBeNull();
    expect(DIGEST_COMPRESSION_LEVELS.at(-1)).toBe(24);

    // Membership is invariant under tightening: same ids, in the same order,
    // at the widest and the tightest level a real budget can select.
    const wide = buildSynthesisDigest({
      nodes, servedRootNodeId: "root:A", budgetBound: Number.MAX_SAFE_INTEGER
    });
    const tight = buildSynthesisDigest({
      nodes, servedRootNodeId: "root:A", budgetBound: boundForcingCompression(nodes)
    });
    expect(wide.kind).toBe("DIGEST");
    expect(tight.kind).toBe("DIGEST");
    if (wide.kind !== "DIGEST" || tight.kind !== "DIGEST") throw new Error("unreachable");
    expect(tight.digest.nodes.map((node) => node.nodeId))
      .toEqual(wide.digest.nodes.map((node) => node.nodeId));
    expect(tight.digest.compressionLevel).toBeGreaterThan(wide.digest.compressionLevel);
    expect(tight.digest.nodes.every((node) => node.summaryTruncated)).toBe(true);
    expect(wide.digest.nodes.every((node) => node.summaryTruncated)).toBe(false);
    expect(tight.marks).toContain(DIGEST_COMPRESSED_MARK);
    expect(wide.marks).toEqual([]);
  });

  it("selects the TOP-2 surviving objections as emphasis over total membership", () => {
    const nodes = [
      ...digestNodes(),
      digestNode({ nodeId: "objection:3", isSurvivingObjection: true, finalStrength: 0.9 })
    ];
    const outcome = buildSynthesisDigest({
      nodes, servedRootNodeId: "root:A", budgetBound: Number.MAX_SAFE_INTEGER
    });
    if (outcome.kind !== "DIGEST") throw new Error("unreachable");
    expect(outcome.digest.emphasis.topSurvivingObjectionNodeIds).toEqual(["objection:3", "objection:1"]);
    expect(outcome.digest.emphasis.runnerUpPositionNodeIds).toEqual(["root:B"]);
    // Emphasis is not membership: the third objection is still IN the digest.
    expect(outcome.digest.nodes.map((node) => node.nodeId)).toContain("objection:2");
    expect(outcome.digest.nodes).toHaveLength(nodes.length);
  });
});

describe("T9 roles — fresh context, and initial vs retry DISTINGUISHED", () => {
  it("records a round-2 synthesizer request carrying the round-1 objection VERBATIM", async () => {
    const objection = "Round 1 overstates the RAN evidence: node evidence:decisive is inconclusive.";
    const double = recorder({ verdicts: [unsatisfied(objection, "noOverstatement"), SATISFIED] });
    await runServeGateChain(chainInput(), double.dependencies);

    expect(double.synthesizerRequests).toHaveLength(2);
    const initial = double.synthesizerRequests[0]!;
    const retry = double.synthesizerRequests[1]!;
    expect(initial.stage).toBe("INITIAL");
    expect(retry.stage).toBe("RETRY");
    if (retry.stage !== "RETRY") throw new Error("unreachable");
    // VERBATIM: byte-identical, not a paraphrase and not a truncation.
    expect(retry.priorObjection).toBe(objection);
    expect(retry.priorCandidateRef).toBe("artifact:recorded:1");
    expect(JSON.parse(JSON.stringify(retry)).priorObjection).toBe(objection);
    // The initial request has no way to carry an objection at all.
    expect(Object.keys(initial)).not.toContain("priorObjection");
  });

  it("asserts fresh context: the recorded request keys are EXACTLY the named artifacts", async () => {
    const double = recorder({});
    await runServeGateChain(chainInput(), double.dependencies);

    const synthesizer = double.synthesizerRequests[0]!;
    const evaluator = double.evaluatorRequests[0]!;
    expect(Object.keys(synthesizer).sort())
      .toEqual(["codeLabel", "digest", "instructions", "role", "roleRef", "round", "stage"]);
    expect(Object.keys(evaluator).sort())
      .toEqual(["candidateStatement", "codeLabel", "digest", "instructions", "role", "roleRef", "round"]);
    // No debate transcript or provider history: the ONLY node text in the
    // payload is the digest's, and no message/transcript key exists to hold
    // anything else.
    const wire = JSON.stringify(synthesizer);
    expect(wire).not.toContain("messages");
    expect(wire).not.toContain("transcript");
    expect(wire).not.toContain("provenanceRef");
    // ...and never the absence of an artifact the role needs.
    expect(synthesizer.digest.nodes.length).toBeGreaterThan(0);
    expect(synthesizer.codeLabel.verdictLabel).toBe("CONTESTED");
    expect(evaluator.candidateStatement).toContain("candidate 1");
  });

  it("reads both role refs from the sealed rows, never from a code constant", async () => {
    const double = recorder({});
    await runServeGateChain(chainInput(), double.dependencies);
    expect(double.synthesizerRequests[0]!.roleRef).toBe(ROLE_CONTROLS.synthesizerRoleRef);
    expect(double.evaluatorRequests[0]!.roleRef).toBe(ROLE_CONTROLS.evaluatorRoleRef);
    expect(double.synthesizerRequests[0]!.roleRef).not.toBe(double.evaluatorRequests[0]!.roleRef);
  });

  it("refuses a request whose key set leaked or starved", () => {
    const double = recorder({});
    expect(() => assertFreshContextRequest({
      ...({
        role: "EVALUATOR", roleRef: "r", round: 1, instructions: "i",
        digest: { nodes: [], emphasis: { topSurvivingObjectionNodeIds: [], runnerUpPositionNodeIds: [] }, compressionLevel: 0, summaryCharacterCap: null, byteSize: 0 },
        codeLabel: CODE_LABEL, candidateStatement: "c", transcript: "the whole debate"
      } as unknown as EvaluatorRequest)
    })).toThrowError(/SYNTHESIS_REQUEST_NOT_FRESH_CONTEXT|not exactly/u);
    expect(double.evaluatorRequests).toHaveLength(0);
  });

  it("refuses an evaluator verdict that contradicts its own criteria", () => {
    expect(() => assertEvaluatorVerdict({
      satisfied: true,
      objection: null,
      criteria: { ...SATISFIED.criteria, fairnessToLosers: false }
    })).toThrowError(/EVALUATOR_VERDICT_INCOHERENT|disagrees/u);
    expect(() => assertEvaluatorVerdict({
      satisfied: false,
      objection: "   ",
      criteria: { ...SATISFIED.criteria, fairnessToLosers: false }
    })).toThrowError(/EVALUATOR_OBJECTION_MISSING|verbatim/u);
  });
});

describe("T9 loop — bounded by the sealed row, serves after the last round", () => {
  it("stops the moment the evaluator is satisfied", async () => {
    const double = recorder({ verdicts: [SATISFIED] });
    const result = await runServeGateChain(chainInput(), double.dependencies);
    expect(double.synthesizerRequests).toHaveLength(1);
    expect(result.loopRounds).toHaveLength(1);
    expect(result.standingObjection).toBeNull();
    expect(result.conditionMarks).not.toContain(SYNTHESIS_OBJECTION_STANDING_MARK);
    expect(result.gateTrace).toContain("SYNTHESIS_LOOP_SATISFIED");
  });

  it("serves after three unsatisfied rounds WITH the standing-objection mark", async () => {
    // DoD row 4. Three rounds is the SEALED bound, not a constant this test
    // chose: it comes from `evaluatorLoopMaxRounds`.
    const last = "The statement still overstates what the losing position conceded.";
    const double = recorder({
      verdicts: [
        unsatisfied("Round 1 objection.", "fairnessToLosers"),
        unsatisfied("Round 2 objection.", "statementLabelAgreement"),
        unsatisfied(last, "noOverstatement")
      ]
    });
    const result = await runServeGateChain(chainInput(), double.dependencies);

    expect(double.synthesizerRequests).toHaveLength(ROLE_CONTROLS.evaluatorLoopMaxRounds);
    expect(result.terminal).toBe("SERVED");
    expect(result.answerForm).not.toBeNull();
    expect(result.standingObjection).toBe(last);
    expect(result.conditionMarks).toContain(SYNTHESIS_OBJECTION_STANDING_MARK);
    expect(result.gateTrace).toContain("SYNTHESIS_LOOP_EXHAUSTED");
    expect(result.gateTrace).toContain("SYNTHESIS_OBJECTION_STANDING");
    // The mark is a real member of the kernel vocabulary, not a loose string.
    expect(CONDITION_MARKS).toContain(SYNTHESIS_OBJECTION_STANDING_MARK);
  });

  it("honours a DIFFERENT sealed bound — the loop reads the row, not a constant", async () => {
    const double = recorder({ verdicts: [unsatisfied("Standing.", "restatement")] });
    const result = await runServeGateChain(
      chainInput({ synthesisRoleControls: { ...ROLE_CONTROLS, evaluatorLoopMaxRounds: 2 } }),
      double.dependencies
    );
    expect(double.synthesizerRequests).toHaveLength(2);
    expect(result.loopRounds).toHaveLength(2);
    expect(result.terminal).toBe("SERVED");
  });

  it("persists one loop-round record per round, in order, with request and verdict", async () => {
    // DoD row 6.
    const double = recorder({
      verdicts: [unsatisfied("Round 1 objection.", "citationTracing"), SATISFIED]
    });
    const result = await runServeGateChain(chainInput(), double.dependencies);

    expect(result.loopRounds.map((round) => round.round)).toEqual([1, 2]);
    expect(result.loopRounds[0]!.synthesizerRequest.stage).toBe("INITIAL");
    expect(result.loopRounds[1]!.synthesizerRequest.stage).toBe("RETRY");
    expect(result.loopRounds[0]!.verdict.satisfied).toBe(false);
    expect(result.loopRounds[0]!.verdict.objection).toBe("Round 1 objection.");
    expect(result.loopRounds[1]!.verdict.satisfied).toBe(true);
    expect(result.loopRounds[0]!.candidateRef).toBe("artifact:recorded:1");
    expect(result.loopRounds[0]!.verdictRef).toBe("artifact:evaluator:1");
    expect(result.loopRounds[0]!.candidateStatement).toContain("candidate 1");
    expect(result.loopRounds[1]!.evaluatorRequest.candidateStatement)
      .toBe(result.loopRounds[1]!.candidateStatement);
  });
});

describe("T9 legacy gate disposition — one test per former gate path, naming its NEW terminal", () => {
  it("R9 restatement: a load-bearing FAIL no longer blocks; it is an evaluator criterion", async () => {
    // Former terminal: COMPONENTS_ONLY + DEFECT, trace GATE1_R9_BLOCK, zero
    // composition calls. New terminal: the loop runs and the objection routes.
    const double = recorder({
      verdicts: [unsatisfied("A stranger could not restate the claim.", "restatement"), SATISFIED]
    });
    const result = await runServeGateChain(
      chainInput({ nodes: [serveNode({ restatementStatus: "FAIL" })] }),
      double.dependencies
    );
    expect(result.terminal).toBe("SERVED");
    expect(result.crashClass).toBeNull();
    expect(double.synthesizerRequests.length).toBeGreaterThan(0);
    expect(result.gateTrace).not.toContain("GATE1_R9_BLOCK");
    expect(result.loopRounds[0]!.verdict.criteria.restatement).toBe(false);
  });

  it("residual-objections-empty: DELETED — a bundle full of objections still serves", async () => {
    // Former terminal: COMPONENTS_ONLY + DEFECT, trace GATE2_Q53_BLOCK.
    const double = recorder({});
    const result = await runServeGateChain(chainInput({
      factBundle: buildFactBundle({
        facts: ["A looked-up position."],
        residualObjections: ["one", "two", "three"],
        badges: [],
        conditionMarks: [],
        reversalPoint: "A contrary measurement would reverse this.",
        buildsOnPrevious: { value: false, answerRef: null },
        memoryDisclosure: null
      })
    }), double.dependencies);
    expect(result.terminal).toBe("SERVED");
    expect(result.gateTrace).not.toContain("GATE2_Q53_BLOCK");
    expect(result.gateTrace).not.toContain("GATE2_Q53_PASS_VACUOUS");
  });

  it("composition byte budget: a code PRECONDITION — tighten and serve WITH the mark", async () => {
    // Former terminal: COMPONENTS_ONLY + DEFECT, trace
    // COMPOSITION_BUDGET_EXCEEDED. New terminal: SERVED, digest compressed.
    const long = "y".repeat(3_000);
    const compressible = digestNodes().map((node) => digestNode({ ...node, statement: long }));
    const double = recorder({});
    const result = await runServeGateChain(chainInput({
      digestNodes: compressible,
      compositionBudget: { ...BUDGET, bound: boundForcingCompression(compressible) }
    }), double.dependencies);

    expect(result.terminal).toBe("SERVED");
    expect(result.crashClass).toBeNull();
    expect(result.conditionMarks).toContain(DIGEST_COMPRESSED_MARK);
    expect(result.gateTrace).toContain("DIGEST_COMPRESSED");
    expect(result.gateTrace).not.toContain("COMPOSITION_BUDGET_EXCEEDED");
    expect(result.digest!.nodes).toHaveLength(4);
  });

  it("conformance: an evaluator citation-tracing objection, not a terminal", async () => {
    // Former terminal: COMPONENTS_ONLY + DEFECT after two failed attempts.
    const double = recorder({
      verdicts: [unsatisfied("Claim 2 traces to no digest node.", "citationTracing"), SATISFIED]
    });
    const result = await runServeGateChain(chainInput(), double.dependencies);
    expect(result.terminal).toBe("SERVED");
    expect(result.gateTrace).not.toContain("GATE3_CONFORMANCE_FAIL");
    expect(result.conformance.every((judgement) => judgement.conforms)).toBe(true);
    expect(result.coverageMode).toBe("EXHAUSTIVE");
  });

  it("Q51 locator: DELETED — a locator-less LOOKED_UP node no longer blocks", async () => {
    // Former terminal: COMPONENTS_ONLY + DEFECT, trace
    // GATE4_Q51_LOCATOR_BLOCK. Unreachable by construction now (T4 normalizes
    // a locator-less LOOKED_UP to REASONING first), so the chain must serve
    // even when handed the old predicate's exact input.
    const double = recorder({});
    const result = await runServeGateChain(
      chainInput({ nodes: [serveNode({ locator: null })] }),
      double.dependencies
    );
    expect(result.terminal).toBe("SERVED");
    expect(result.gateTrace).not.toContain("GATE4_Q51_LOCATOR_BLOCK");
  });

  it("post-compose R9: an evaluator criterion, not a terminal", async () => {
    // Former terminal: COMPONENTS_ONLY + DEFECT, trace POST_COMPOSE_R9_FAIL.
    const double = recorder({
      verdicts: [unsatisfied("The composed verdict fails the stranger restatement.", "restatement"), SATISFIED]
    });
    const result = await runServeGateChain(chainInput(), double.dependencies);
    expect(result.terminal).toBe("SERVED");
    expect(result.gateTrace).not.toContain("POST_COMPOSE_R9_FAIL");
  });

  it("writes NO retired gate token on any served path", async () => {
    const double = recorder({
      verdicts: [unsatisfied("Round 1 objection.", "restatement"), SATISFIED]
    });
    const result = await runServeGateChain(
      chainInput({ nodes: [serveNode({ restatementStatus: "FAIL", locator: null })] }),
      double.dependencies
    );
    for (const token of result.gateTrace) {
      expect(isRetiredGateTrace(token)).toBe(false);
    }
    // The retired tokens remain READABLE — J17's shape: history a sealed row
    // may carry, and a fresh chain may never write.
    expect(RETIRED_GATE_TRACE).toContain("GATE1_R9_BLOCK");
    expect(RETIRED_GATE_TRACE).toContain("POST_COMPOSE_R9_FAIL");
    expect(isRetiredGateTrace("GATE4_Q51_LOCATOR_BLOCK")).toBe(true);
    expect(isRetiredGateTrace("SERVE")).toBe(false);
  });
});

describe("T9 crash classes — the ONLY four ways COMPONENTS_ONLY still exists", () => {
  it("names a terminal, a trace token and a mark for every enumerated class", () => {
    // DoD row 3: terminal + mark named per path, as a table a stranger reads.
    expect(Object.keys(SERVE_CRASH_CLASSES).sort())
      .toEqual(["DIGEST_CANNOT_EXIST", "ENVELOPE_EXHAUSTED", "NO_ARTIFACT", "TRANSPORT_DEATH"]);
    for (const wiring of Object.values(SERVE_CRASH_CLASSES)) {
      expect(wiring.terminal).toBe("COMPONENTS_ONLY");
      expect(wiring.gateTrace.startsWith("COMPONENTS_ONLY_")).toBe(true);
      expect(CONDITION_MARKS).toContain(wiring.conditionMark);
    }
  });

  it("DIGEST_CANNOT_EXIST: over budget at MAX compression is loud, never a subset", async () => {
    const long = "z".repeat(20_000);
    const double = recorder({});
    const result = await runServeGateChain(chainInput({
      digestNodes: digestNodes().map((node) => digestNode({ ...node, statement: long })),
      compositionBudget: { ...BUDGET, bound: 64 }
    }), double.dependencies);

    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.crashClass).toBe("DIGEST_CANNOT_EXIST");
    expect(result.conditionMarks).toContain(DIGEST_CANNOT_EXIST_MARK);
    expect(result.gateTrace).toContain("COMPONENTS_ONLY_DIGEST");
    // Never a silent subset: no synthesizer call was made at all.
    expect(double.synthesizerRequests).toHaveLength(0);
    expect(result.digest).toBeNull();
  });

  it("NO_ARTIFACT: the synthesizer answered with nothing to serve", async () => {
    const double = recorder({ synthesize: async () => [] });
    const result = await runServeGateChain(chainInput(), double.dependencies);
    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.crashClass).toBe("NO_ARTIFACT");
    expect(result.conditionMarks).toContain("DEFECT");
    expect(result.gateTrace).toContain("COMPONENTS_ONLY_DEFECT");
    expect(double.evaluatorRequests).toHaveLength(0);
  });

  it("TRANSPORT_DEATH: a dead role transport ends in components-only, not a thrown run", async () => {
    const double = recorder({});
    const result = await runServeGateChain(chainInput(), {
      ...double.dependencies,
      synthesize: async () => {
        throw new TypedDomainError("SYNTHESIS_TRANSPORT_DEATH", "SYNTHESIZER transport exhausted after 3 attempts");
      }
    });
    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.crashClass).toBe("TRANSPORT_DEATH");
    expect(result.conditionMarks).toContain("DEFECT");
  });

  it("ENVELOPE_EXHAUSTED: the retired guard — an exhausted envelope with no served statement takes the envelope terminal even when restatement FAILED", () => {
    // F4, goal 248-251. Before T9 this exact call threw
    // PROTECTED_CORE_NOT_VERIFIED, because the envelope terminal's guard was
    // keyed on R9's gate-hood. R9 is not a gate any more, so the guard is
    // retired WITH it: never serving over budget wins over the retired gate.
    const factBundle = buildFactBundle({
      facts: ["A looked-up position."],
      residualObjections: [],
      badges: [],
      conditionMarks: [],
      reversalPoint: "A contrary measurement would reverse this.",
      buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    });
    const result = createEnvelopeExhaustedResult({
      factBundle,
      compositionBudget: BUDGET,
      verifiedNodeIds: ["root:A"],
      skippedEnrichmentRows: ["row:enrichment-1"],
      protectedCoreRestatement: "FAIL",
      servedStatementExists: false
    });

    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.crashClass).toBe("ENVELOPE_EXHAUSTED");
    expect(result.conditionMarks).toContain("ENVELOPE_EXHAUSTED");
    expect(result.conditionMarks).toContain("SKIPPED-BY-BUDGET");
    expect(result.answerForm).toBeNull();
    expect(result.gateTrace).toContain("COMPONENTS_ONLY_ENVELOPE");
    // The status is OBSERVED and DISCLOSED — it just no longer decides.
    expect(result.gateTrace).toContain("PROTECTED_CORE_GUARD_RETIRED");
    // ...and it still fires identically when restatement passed.
    const passing = createEnvelopeExhaustedResult({
      factBundle,
      compositionBudget: BUDGET,
      verifiedNodeIds: ["root:A"],
      skippedEnrichmentRows: [],
      protectedCoreRestatement: "PASS",
      servedStatementExists: false
    });
    expect(passing.terminal).toBe("COMPONENTS_ONLY");
    expect(passing.crashClass).toBe("ENVELOPE_EXHAUSTED");
    expect(passing.gateTrace).not.toContain("PROTECTED_CORE_GUARD_RETIRED");
  });

  it("ENVELOPE_EXHAUSTED never retracts an already-served statement", () => {
    expect(() => createEnvelopeExhaustedResult({
      factBundle: buildFactBundle({
        facts: ["A looked-up position."],
        residualObjections: [],
        badges: [],
        conditionMarks: [],
        reversalPoint: "A contrary measurement would reverse this.",
        buildsOnPrevious: { value: false, answerRef: null },
        memoryDisclosure: null
      }),
      compositionBudget: BUDGET,
      verifiedNodeIds: ["root:A"],
      skippedEnrichmentRows: [],
      protectedCoreRestatement: "PASS",
      servedStatementExists: true
    })).toThrowError(/ENVELOPE_TERMINAL_OVER_SERVED_STATEMENT|never retracted/u);
  });
});

describe("T9 DoD row 2 — no NON-CRASH path returns COMPONENTS_ONLY", () => {
  const nonCrashArms: readonly { readonly name: string; readonly run: () => Promise<{
    readonly terminal: string; readonly crashClass: string | null;
  }> }[] = [
    {
      name: "load-bearing restatement FAIL (former gate 1)",
      run: async () => runServeGateChain(
        chainInput({ nodes: [serveNode({ restatementStatus: "FAIL" })] }),
        recorder({ verdicts: [unsatisfied("R9 objection.", "restatement")] }).dependencies
      )
    },
    {
      name: "residual objections present (former gate 2)",
      run: async () => runServeGateChain(chainInput(), recorder({}).dependencies)
    },
    {
      name: "digest over budget but compressible (former byte-budget gate)",
      run: async () => {
        const compressible = digestNodes()
          .map((node) => digestNode({ ...node, statement: "w".repeat(3_000) }));
        return runServeGateChain(chainInput({
          digestNodes: compressible,
          compositionBudget: { ...BUDGET, bound: boundForcingCompression(compressible) }
        }), recorder({}).dependencies);
      }
    },
    {
      name: "locator-less LOOKED_UP (former Q51 locator gate)",
      run: async () => runServeGateChain(
        chainInput({ nodes: [serveNode({ locator: null })] }),
        recorder({}).dependencies
      )
    },
    {
      name: "post-compose restatement objected (former post-compose R9 gate)",
      run: async () => runServeGateChain(chainInput(), recorder({
        verdicts: [unsatisfied("Post-compose R9 objection.", "restatement")]
      }).dependencies)
    },
    {
      name: "three unsatisfied rounds",
      run: async () => runServeGateChain(chainInput(), recorder({
        verdicts: [
          unsatisfied("one", "fairnessToLosers"),
          unsatisfied("two", "noOverstatement"),
          unsatisfied("three", "statementLabelAgreement")
        ]
      }).dependencies)
    }
  ];

  for (const arm of nonCrashArms) {
    it(`serves rather than components-only: ${arm.name}`, async () => {
      const result = await arm.run();
      expect(result.crashClass).toBeNull();
      expect(result.terminal).not.toBe("COMPONENTS_ONLY");
    });
  }

  /**
   * THE FORMER CONFORMANCE GATE, RE-PINNED — V ruling 2026-09-03, finding
   * F-T9B-1. This case used to sit in `nonCrashArms` above and assert that a
   * citation-tracing objection SERVES. It is lifted out and stated on its own
   * because its outcome changed, and it is changed here rather than quietly
   * inside the list, where a reader would not see it.
   *
   * WHAT CHANGED AND WHY. `conforms` is a live axis of the served statement's
   * cited-set filter now: a run whose citation tracing failed must not have its
   * citations counted into the confidence band. Under this chain every
   * judgement carries the same `finalCriteria.citationTracing`, so a failed
   * criterion leaves NO verified segment, the cited set is empty, and S08's
   * empty-basis guard refuses — the case that guard was written for.
   *
   * WHAT DID NOT CHANGE, and this is the DoD row this describe block is named
   * for: the path still does not return COMPONENTS_ONLY, and it still mints no
   * crash class. goal-v4 closes that terminal at four enumerated classes and
   * says no non-crash path returns it; both remain true. The refusal is a
   * TypedDomainError, asserted below, not a fifth crash class — adding one
   * would be a goal override, which is V's alone and is NOT taken here.
   *
   * The neighbouring criteria are unaffected: an objection on fairness,
   * restatement, overstatement or label agreement still SERVES with its
   * standing objection, which the arms above and the three-unsatisfied-rounds
   * arm continue to pin.
   */
  it("citation tracing objected (former conformance gate): refuses loudly, and NOT through a crash class", async () => {
    const run = runServeGateChain(chainInput(), recorder({
      verdicts: [unsatisfied("Untraced claim.", "citationTracing")]
    }).dependencies);

    await expect(run).rejects.toMatchObject({ code: "SERVED_STATEMENT_CITES_NO_VERIFIED_NODE" });
    // It is a typed refusal, not a COMPONENTS_ONLY terminal wearing a new name.
    // Asserted on the ENUMERATION, which can actually fail: a `rejects.not`
    // check on the thrown error's `terminal` cannot — a TypedDomainError has no
    // such field, so it would pass whatever the chain did (D56).
    expect(Object.keys(SERVE_CRASH_CLASSES)).not.toContain("CITATION_TRACING_FAILED");
  });

  it("reaches components-only ONLY through an enumerated crash class", async () => {
    const crashing = await runServeGateChain(chainInput({
      digestNodes: digestNodes().map((node) => digestNode({ ...node, statement: "q".repeat(20_000) })),
      compositionBudget: { ...BUDGET, bound: 64 }
    }), recorder({}).dependencies);
    expect(crashing.terminal).toBe("COMPONENTS_ONLY");
    expect(crashing.crashClass).not.toBeNull();
    expect(Object.keys(SERVE_CRASH_CLASSES)).toContain(crashing.crashClass!);
  });
});
