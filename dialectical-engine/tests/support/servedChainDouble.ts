import {
  runServeGateChain,
  type ComposedSegment,
  type DigestSourceNode,
  type EvaluatorVerdict,
  type FactBundle,
  type ServeGateDependencies
} from "@debateai/serve";

/**
 * Engine money rule (spec §14.4.1), Task M2 — THE SERVE CHAIN A RUN CUT SHORT
 * WHILE ARGUING NOW REACHES.
 *
 * Before M2 a stop while the debate was argued forced the components-only
 * envelope terminal at the serve gate, so the unit files that follow a
 * spend-stopped run from the state the stop leaves behind ended at
 * `createEnvelopeExhaustedResult`. The run now goes on to the answer with the
 * tree as it stands, so those files drive the REAL sealed chain instead, with
 * recorded doubles at the two role calls — the pattern
 * `tests/unit/t09-synthesis.test.ts` uses, reduced to the one path these
 * files need: one round, the evaluator satisfied.
 *
 * No live provider call. The chain itself is the product's; only the two
 * model calls and the band-ceiling lookup are doubles.
 */
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

const BUDGET = Object.freeze({
  tier: "low" as const,
  bound: 200_000,
  registerRowKey: "compositionBundleBudget",
  registerVersion: 7,
  sourceRef: "test-layer:M2"
});

function segments(servedRootNodeId: string): readonly ComposedSegment[] {
  return Object.freeze([
    Object.freeze({
      segmentId: "s1",
      text: "The position that was argued holds, on what the debate could weigh.",
      loadBearing: false,
      assertedNodeRefs: Object.freeze([servedRootNodeId]),
      servedNumberRefs: Object.freeze(["number:final-strength"])
    }),
    Object.freeze({
      segmentId: "s2",
      text: "Check an independent source.",
      loadBearing: false,
      assertedNodeRefs: Object.freeze([servedRootNodeId]),
      servedNumberRefs: Object.freeze([])
    })
  ]);
}

function dependencies(servedRootNodeId: string): ServeGateDependencies {
  return {
    synthesize: async (request) => ({
      candidate: segments(servedRootNodeId),
      candidateRef: `artifact:recorded:${request.round}`,
      candidateCallSiteKey: `COMPOSER:SYNTHESIZER:${request.stage}:${request.round}`
    }),
    evaluate: async (request) => ({
      verdict: SATISFIED,
      verdictRef: `artifact:evaluator:${request.round}`,
      verdictCallSiteKey: `POST_COMPOSE_R9:EVALUATOR:${request.round}`
    }),
    applyBandCeiling: ({ basis, candidateConfidenceBand }) => ({
      kind: "NOT_CAPPED",
      confidenceBand: candidateConfidenceBand,
      ceiling: {
        label: "TEST_CEILING",
        basis,
        registerRowKey: "test-layer:way-of-knowing-ceiling",
        registerVersion: 1,
        sourceRef: "test-layer:M2",
        liftPath: "test-layer:improve-basis"
      }
    })
  };
}

/**
 * Serve the run: the served root is the one position the stop left, its
 * statement is the fact, and every materialised node is in the digest.
 */
export function serveCutShortRun(input: Readonly<{
  factBundle: FactBundle;
  servedRootNodeId: string;
  servedStatement: string;
  materialisedNodeIds: readonly string[];
}>): ReturnType<typeof runServeGateChain> {
  const digestNodes: readonly DigestSourceNode[] = Object.freeze(input.materialisedNodeIds.map((nodeId) => Object.freeze({
    nodeId,
    statement: nodeId === input.servedRootNodeId ? input.servedStatement : `statement for ${nodeId}`,
    finalStrength: 0.5,
    wayOfKnowing: "REASONING" as const,
    marks: Object.freeze([]),
    polarityRelations: Object.freeze([]),
    isPosition: nodeId === input.servedRootNodeId,
    isSurvivingObjection: false
  })));
  return runServeGateChain({
    nodes: [{
      nodeId: input.servedRootNodeId,
      text: input.servedStatement,
      wayOfKnowing: "REASONING",
      provenanceRef: `artifact:${input.servedRootNodeId}`,
      locator: null,
      restatementStatus: "PASS",
      loadBearing: true
    }],
    factBundle: input.factBundle,
    compositionBudget: BUDGET,
    candidateConfidenceBand: "medium",
    digestNodes,
    servedRootNodeId: input.servedRootNodeId,
    codeLabel: Object.freeze({
      verdictLabel: "CONTESTED",
      servedNodeId: input.servedRootNodeId,
      servedStrength: 0.5,
      margin: null,
      registerVersion: 7
    }),
    synthesisRoleControls: Object.freeze({
      synthesizerRoleRef: "test-layer:synthesizer",
      evaluatorRoleRef: "test-layer:evaluator",
      evaluatorLoopMaxRounds: 3
    })
  }, dependencies(input.servedRootNodeId));
}
