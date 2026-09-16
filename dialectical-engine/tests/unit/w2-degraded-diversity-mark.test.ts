import { describe, expect, it } from "vitest";
import {
  buildFactBundle,
  runServeGateChain,
  type ComposedSegment,
  type DigestSourceNode,
  type EvaluatorVerdict,
  type ServeGateDependencies,
  type ServeGateInput,
  type ServeNode
} from "@debateai/serve";
import { CONDITION_MARKS } from "@debateai/kernel";

/**
 * W2 / F-VS11-1 — the served answer discloses a SHARED synthesizer/evaluator
 * identity.
 *
 * V-S11-1 and V-S11-GRADER make same-identity operation LEGITIMATE: a
 * deployment with one model runs the whole debate on it, and a grader that
 * shares an identity with the candidate is not contamination, because each
 * step is a fresh instance that never learns who wrote what. What those
 * rulings keep is the DISCLOSURE — "same-model provenance is RECORDED, never
 * hidden" — and goal line 26's law that every degradation emits a visible
 * condition mark.
 *
 * Before this suite the disclosure stopped at a server log:
 * `SYNTHESIS_ROLE_REFS_IDENTICAL` is a `console.warn` in
 * `packages/register/src/algorithm-policy.ts:138`, reachable only by an
 * operator reading startup output. `DEGRADED-DIVERSITY` was declared in the
 * kernel vocabulary and rendered by the UI as "Model diversity degraded", and
 * nothing in the codebase emitted it. The reader was never told.
 *
 * The chain is where the two identities are RESOLVED for the run —
 * `ServeGateInput.synthesisRoleControls` carries both sealed refs and
 * `runServeGateChain` hands them to the synthesis loop — and it is where the
 * served answer's condition marks are assembled. So that is where the mark is
 * minted, not from the warning, which stays exactly as it was.
 *
 * No live provider call: the synthesizer and evaluator are recorded doubles.
 */

const BUDGET = Object.freeze({
  tier: "low" as const,
  bound: 200_000,
  registerRowKey: "compositionBundleBudget",
  registerVersion: 7,
  sourceRef: "test:w2"
});

/** The two sealed refs of a HEALTHY deployment: two distinct identities. */
const DISTINCT_ROLE_CONTROLS = Object.freeze({
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

/** The same four-node graph the T9 chain tests run on. */
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

function serveNode(overrides: Partial<ServeNode> = {}): ServeNode {
  return {
    nodeId: "root:A",
    text: "A looked-up position.",
    wayOfKnowing: "LOOKED_UP",
    provenanceRef: "artifact:root-a",
    locator: "https://example.invalid/w2",
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
    synthesisRoleControls: DISTINCT_ROLE_CONTROLS,
    ...overrides
  };
}

/** Both sealed refs naming ONE configured provider identity. */
function collapsedRoleControls(identity: string): ServeGateInput["synthesisRoleControls"] {
  return Object.freeze({
    synthesizerRoleRef: identity,
    evaluatorRoleRef: identity,
    evaluatorLoopMaxRounds: 3
  });
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

/** Recorded doubles for both roles — no provider is called. */
function recordedRoles(): ServeGateDependencies {
  return {
    synthesize: async (request) => ({
      candidate: segments(`candidate ${request.round}`),
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
        sourceRef: "test-layer:w2",
        liftPath: "test-layer:improve-basis"
      }
    })
  };
}

describe("W2 / F-VS11-1 — a shared synthesizer/evaluator identity reaches the READER", () => {
  it("ADMITS the disclosure: identical role refs serve DEGRADED-DIVERSITY naming both roles and the identity", async () => {
    // D71 boundary, admitted side. The deployment sealed one provider identity
    // into both synthesis seats. That is lawful (V-S11-1) and the answer says so.
    const result = await runServeGateChain(
      chainInput({ synthesisRoleControls: collapsedRoleControls("development:codex-cli") }),
      recordedRoles()
    );

    expect(result.terminal).toBe("SERVED");
    expect(result.conditionMarks).toContain("DEGRADED-DIVERSITY");
    // The mark is a member of the kernel vocabulary the UI renders, not a
    // string this chain invented.
    expect(CONDITION_MARKS).toContain("DEGRADED-DIVERSITY");
    // WHICH roles collapsed onto WHICH identity — the disclosure is useless
    // without it, and it travels on the served answer beside the mark, the way
    // `standingObjection` and `bandCeiling` carry their own marks' detail.
    expect(result.degradedDiversity).toEqual({
      roles: ["SYNTHESIZER", "EVALUATOR"],
      identity: "development:codex-cli"
    });
  });

  it("names the identity the refs ACTUALLY resolved to, not a fixed one", async () => {
    // The refutation this row exists for: an emitter that always reports the
    // first configured provider — or any constant — passes the row above and
    // lies here. The identity is read off the sealed controls.
    const result = await runServeGateChain(
      chainInput({ synthesisRoleControls: collapsedRoleControls("development:claude-cli") }),
      recordedRoles()
    );

    expect(result.conditionMarks).toContain("DEGRADED-DIVERSITY");
    expect(result.degradedDiversity).toEqual({
      roles: ["SYNTHESIZER", "EVALUATOR"],
      identity: "development:claude-cli"
    });
  });

  it("REJECTS the disclosure: two distinct role refs serve no diversity mark at all", async () => {
    // D71 boundary, rejected side. A healthy two-identity deployment must not
    // carry a degradation it does not have — a mark that fires always is a
    // mark that says nothing.
    const result = await runServeGateChain(chainInput(), recordedRoles());

    expect(result.terminal).toBe("SERVED");
    expect(result.conditionMarks).not.toContain("DEGRADED-DIVERSITY");
    expect(result.degradedDiversity ?? null).toBeNull();
  });
});
