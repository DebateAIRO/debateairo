import { describe, expect, it } from "vitest";
import { SYNTHESIS_OBJECTION_STANDING_MARK } from "@debateai/serve";
import {
  ACCEPTANCE_DOD_LOOP_ROUNDS_ABOVE_BOUND,
  ACCEPTANCE_DOD_LOOP_ROUND_NUMBERING_INVALID,
  ACCEPTANCE_DOD_NODE_TAU_MISSING,
  ACCEPTANCE_DOD_VERDICT_LABEL_PROJECTION_INVALID,
  DEFINITION_OF_DONE_TOKENS,
  deriveDefinitionOfDoneFacts,
  renderDefinitionOfDoneLines,
  type DefinitionOfDoneFactsInput
} from "./dod-facts.js";

/**
 * A minimally-lawful input: ONE root that is panel-judged by two voices, its
 * final strength apart from its tau, one measured attack edge from a surviving
 * objection, and a loop satisfied on round 1. Each test below mutates exactly
 * the field it is about, so a failing expectation names one cause.
 *
 * Node ids are deliberately plain ordinal strings: the derivation's tie-break
 * is `localeCompare`, and a test whose ids sort the same way under every
 * comparator could not tell a tie-break from its absence.
 */
function baseInput(overrides: Partial<DefinitionOfDoneFactsInput> = {}): DefinitionOfDoneFactsInput {
  return {
    nodes: [
      { nodeId: "n1", depth: 0, tau: 0.5, finalStrength: 0.7, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
      { nodeId: "n2", depth: 1, tau: 0.4, finalStrength: 0.4, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } }
    ],
    edges: [{ sourceNodeId: "n2", polarity: "attack", magnitudeStatus: "MEASURED" }],
    loopRounds: [{ round: 1, synthesizerStage: "INITIAL", evaluatorSatisfied: true }],
    sealedEvaluatorLoopMaxRounds: 3,
    conditionMarks: [],
    verdictState: "CONTESTED",
    verdictUnavailableReasonRef: null,
    terminal: "SERVED",
    serveState: "COMPOSED",
    confidenceBand: "FULL",
    bandCeiling: { basis: { LOOKED_UP: 1, RAN: 0, REASONING: 2 }, registerRowKey: "wayOfKnowingCeiling" },
    ...overrides
  };
}

describe("the definition-of-done facts the ceremony report prints", () => {
  /* ------------------------------------------- sub-clause 1: panel-reduced tau */

  it("carries each node's tau with its voice count and its non-author voice count", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput());

    expect(facts.panelNodes).toEqual([
      { nodeId: "n1", tau: 0.5, voiceCount: 2, nonAuthorVoiceCount: 1, singleVoicePanel: false },
      { nodeId: "n2", tau: 0.4, voiceCount: 2, nonAuthorVoiceCount: 1, singleVoicePanel: false }
    ]);
    expect(facts.everyNodeHasNonAuthorVoice).toBe(true);
    expect(facts.singleVoicePanelNodeIds).toEqual([]);
  });

  it("reports a single-voice panel as an outcome, naming the self-graded node, without throwing", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      nodes: [
        { nodeId: "n1", depth: 0, tau: 0.5, finalStrength: 0.7, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "n2", depth: 1, tau: 0.4, finalStrength: 0.4, panel: { voiceCount: 1, nonAuthorVoiceCount: 0 } }
      ]
    }));

    expect(facts.everyNodeHasNonAuthorVoice).toBe(false);
    expect(facts.singleVoicePanelNodeIds).toEqual(["n2"]);
    expect(facts.panelNodes[1]).toEqual({
      nodeId: "n2", tau: 0.4, voiceCount: 1, nonAuthorVoiceCount: 0, singleVoicePanel: true
    });
  });

  it("reads the M=1 skeleton's panel-less judgement as one self-graded voice", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      nodes: [{ nodeId: "n1", depth: 0, tau: 0.5, finalStrength: 0.7, panel: null }],
      edges: []
    }));

    expect(facts.panelNodes).toEqual([
      { nodeId: "n1", tau: 0.5, voiceCount: 1, nonAuthorVoiceCount: 0, singleVoicePanel: true }
    ]);
    expect(facts.everyNodeHasNonAuthorVoice).toBe(false);
  });

  /* ------------------------------------------------- sub-clause 2: measured edges */

  it("counts the attack edges and how many of them carry a present magnitude", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      edges: [
        { sourceNodeId: "n2", polarity: "attack", magnitudeStatus: "MEASURED" },
        { sourceNodeId: "n2", polarity: "attack", magnitudeStatus: "UNKNOWN" },
        { sourceNodeId: "n1", polarity: "support", magnitudeStatus: "MEASURED" }
      ]
    }));

    expect(facts.attackEdgeCount).toBe(2);
    expect(facts.attackEdgePresentMagnitudeCount).toBe(1);
  });

  /* -------------------------------------------- sub-clause 3: a root's final != tau */

  it("names the witness root whose final strength differs from its tau", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput());

    expect(facts.roots).toEqual([
      { nodeId: "n1", tau: 0.5, finalStrength: 0.7, finalDiffersFromTau: true }
    ]);
    expect(facts.aRootFinalDiffersFromTau).toBe(true);
    expect(facts.rootFinalDiffersWitnessNodeId).toBe("n1");
  });

  it("reports 'no root differs' as an outcome with a null witness, without throwing", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      nodes: [
        { nodeId: "n1", depth: 0, tau: 0.5, finalStrength: 0.5, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "n2", depth: 0, tau: 0.4, finalStrength: null, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } }
      ]
    }));

    expect(facts.roots).toEqual([
      { nodeId: "n1", tau: 0.5, finalStrength: 0.5, finalDiffersFromTau: false },
      { nodeId: "n2", tau: 0.4, finalStrength: null, finalDiffersFromTau: false }
    ]);
    expect(facts.aRootFinalDiffersFromTau).toBe(false);
    expect(facts.rootFinalDiffersWitnessNodeId).toBeNull();
  });

  it("reads roots by depth 0 alone, never by position in the node list", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      nodes: [
        { nodeId: "n1", depth: 2, tau: 0.5, finalStrength: 0.9, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "n2", depth: 0, tau: 0.4, finalStrength: 0.4, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } }
      ]
    }));

    expect(facts.roots.map((root) => root.nodeId)).toEqual(["n2"]);
    expect(facts.aRootFinalDiffersFromTau).toBe(false);
  });

  /* ------------------------------------- sub-clause 5: the strongest surviving objection */

  it("picks the strongest surviving objection by strength, descending", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      nodes: [
        { nodeId: "n1", depth: 0, tau: 0.5, finalStrength: 0.7, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "n2", depth: 1, tau: 0.4, finalStrength: 0.2, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "n3", depth: 1, tau: 0.4, finalStrength: 0.6, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } }
      ],
      edges: [
        { sourceNodeId: "n2", polarity: "attack", magnitudeStatus: "MEASURED" },
        { sourceNodeId: "n3", polarity: "attack", magnitudeStatus: "MEASURED" }
      ]
    }));

    expect(facts.strongestSurvivingObjection).toEqual({ nodeId: "n3", finalStrength: 0.6 });
  });

  it("breaks a strength tie on the node id, ascending", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      nodes: [
        { nodeId: "n1", depth: 0, tau: 0.5, finalStrength: 0.7, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "nb", depth: 1, tau: 0.4, finalStrength: 0.6, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "na", depth: 1, tau: 0.4, finalStrength: 0.6, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } }
      ],
      edges: [
        { sourceNodeId: "nb", polarity: "attack", magnitudeStatus: "MEASURED" },
        { sourceNodeId: "na", polarity: "attack", magnitudeStatus: "MEASURED" }
      ]
    }));

    expect(facts.strongestSurvivingObjection).toEqual({ nodeId: "na", finalStrength: 0.6 });
  });

  it("excludes an attacker that carries no propagated number, however it is ordered", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      nodes: [
        { nodeId: "n1", depth: 0, tau: 0.5, finalStrength: 0.7, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "n2", depth: 1, tau: 0.9, finalStrength: null, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "n3", depth: 1, tau: 0.1, finalStrength: 0.1, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } }
      ],
      edges: [
        { sourceNodeId: "n2", polarity: "attack", magnitudeStatus: "MEASURED" },
        { sourceNodeId: "n3", polarity: "attack", magnitudeStatus: "MEASURED" }
      ]
    }));

    expect(facts.strongestSurvivingObjection).toEqual({ nodeId: "n3", finalStrength: 0.1 });
  });

  it("excludes a numbered node that attacks nothing", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      nodes: [
        { nodeId: "n1", depth: 0, tau: 0.5, finalStrength: 0.7, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "n2", depth: 1, tau: 0.4, finalStrength: 0.9, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } }
      ],
      edges: [{ sourceNodeId: "n2", polarity: "support", magnitudeStatus: "MEASURED" }]
    }));

    expect(facts.strongestSurvivingObjection).toBeNull();
  });

  it("reports 'no surviving objection' as an outcome, without throwing", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({ edges: [] }));

    expect(facts.strongestSurvivingObjection).toBeNull();
  });

  /* ------------------------------------------- sub-clause 5/6: the evaluator loop */

  it("records a loop satisfied on round 1", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput());

    expect(facts.loopRounds).toEqual([{ round: 1, synthesizerStage: "INITIAL", evaluatorSatisfied: true }]);
    expect(facts.loopRoundCount).toBe(1);
    expect(facts.sealedEvaluatorLoopMaxRounds).toBe(3);
    expect(facts.finalRoundSatisfied).toBe(true);
    expect(facts.objectionStandingMarkPresent).toBe(false);
  });

  it("records a loop satisfied on round 3 of a bound of 3", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      loopRounds: [
        { round: 1, synthesizerStage: "INITIAL", evaluatorSatisfied: false },
        { round: 2, synthesizerStage: "RETRY", evaluatorSatisfied: false },
        { round: 3, synthesizerStage: "RETRY", evaluatorSatisfied: true }
      ]
    }));

    expect(facts.loopRoundCount).toBe(3);
    expect(facts.finalRoundSatisfied).toBe(true);
    expect(facts.objectionStandingMarkPresent).toBe(false);
  });

  it("reports an objection still standing after the bound as an outcome, without throwing", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      loopRounds: [
        { round: 1, synthesizerStage: "INITIAL", evaluatorSatisfied: false },
        { round: 2, synthesizerStage: "RETRY", evaluatorSatisfied: false },
        { round: 3, synthesizerStage: "RETRY", evaluatorSatisfied: false }
      ],
      conditionMarks: [SYNTHESIS_OBJECTION_STANDING_MARK]
    }));

    expect(facts.loopRoundCount).toBe(3);
    expect(facts.finalRoundSatisfied).toBe(false);
    expect(facts.objectionStandingMarkPresent).toBe(true);
  });

  it("carries the sealed bound it was handed, never a bound of its own", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({ sealedEvaluatorLoopMaxRounds: 5 }));

    expect(facts.sealedEvaluatorLoopMaxRounds).toBe(5);
  });

  /* --------------------------------------- sub-clause 7: the code-derived label */

  it("carries the three-state label with the terminal and the serve state", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput());

    expect(facts.verdictState).toBe("CONTESTED");
    expect(facts.verdictUnavailableReasonRef).toBeNull();
    expect(facts.terminal).toBe("SERVED");
    expect(facts.serveState).toBe("COMPOSED");
  });

  it("carries the unavailability reason ref exactly when there is no label", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      verdictState: null,
      verdictUnavailableReasonRef: "serve:verdict-unavailable:no-basis",
      confidenceBand: null,
      bandCeiling: null,
      terminal: "COMPONENTS_ONLY",
      serveState: "COMPONENTS_ONLY"
    }));

    expect(facts.verdictState).toBeNull();
    expect(facts.verdictUnavailableReasonRef).toBe("serve:verdict-unavailable:no-basis");
  });

  /* ------------------------------------- sub-clause 8: the band over cited nodes */

  it("passes the band, its three basis counts and the ceiling's register row key through", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput());

    expect(facts.confidenceBand).toBe("FULL");
    expect(facts.bandBasis).toEqual({ LOOKED_UP: 1, RAN: 0, REASONING: 2 });
    expect(facts.bandCeilingRegisterRowKey).toBe("wayOfKnowingCeiling");
  });

  it("carries a null band with null basis and null ceiling row key", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      confidenceBand: null,
      bandCeiling: null,
      verdictState: null,
      verdictUnavailableReasonRef: "serve:verdict-unavailable:no-basis"
    }));

    expect(facts.confidenceBand).toBeNull();
    expect(facts.bandBasis).toBeNull();
    expect(facts.bandCeilingRegisterRowKey).toBeNull();
  });

  /* ------------------------------------------------------- O3: the shape refusals */

  it("refuses a node that carries no tau", () => {
    expect(() => deriveDefinitionOfDoneFacts(baseInput({
      nodes: [
        { nodeId: "n1", depth: 0, tau: 0.5, finalStrength: 0.7, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "n2", depth: 1, tau: null, finalStrength: 0.4, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } }
      ]
    }))).toThrow(`${ACCEPTANCE_DOD_NODE_TAU_MISSING}:n2`);
  });

  it("refuses a round count above the sealed bound", () => {
    expect(() => deriveDefinitionOfDoneFacts(baseInput({
      loopRounds: [
        { round: 1, synthesizerStage: "INITIAL", evaluatorSatisfied: false },
        { round: 2, synthesizerStage: "RETRY", evaluatorSatisfied: false },
        { round: 3, synthesizerStage: "RETRY", evaluatorSatisfied: false },
        { round: 4, synthesizerStage: "RETRY", evaluatorSatisfied: true }
      ],
      sealedEvaluatorLoopMaxRounds: 3
    }))).toThrow(`${ACCEPTANCE_DOD_LOOP_ROUNDS_ABOVE_BOUND}:4:3`);
  });

  it("refuses a round record whose numbering is not 1..n", () => {
    expect(() => deriveDefinitionOfDoneFacts(baseInput({
      loopRounds: [
        { round: 1, synthesizerStage: "INITIAL", evaluatorSatisfied: false },
        { round: 3, synthesizerStage: "RETRY", evaluatorSatisfied: true }
      ]
    }))).toThrow(`${ACCEPTANCE_DOD_LOOP_ROUND_NUMBERING_INVALID}:1,3`);
  });

  it("refuses a label that is neither a state nor an unavailability reason", () => {
    expect(() => deriveDefinitionOfDoneFacts(baseInput({
      verdictState: null,
      verdictUnavailableReasonRef: null
    }))).toThrow(`${ACCEPTANCE_DOD_VERDICT_LABEL_PROJECTION_INVALID}:NEITHER`);
  });

  it("refuses a label that is both a state and an unavailability reason", () => {
    expect(() => deriveDefinitionOfDoneFacts(baseInput({
      verdictState: "SUPPORTED",
      verdictUnavailableReasonRef: "serve:verdict-unavailable:no-basis"
    }))).toThrow(`${ACCEPTANCE_DOD_VERDICT_LABEL_PROJECTION_INVALID}:BOTH`);
  });

  /* ------------------------------------------------------ O1: the block is frozen */

  it("returns a frozen block, nested rows included", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput());

    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(facts.panelNodes)).toBe(true);
    expect(Object.isFrozen(facts.panelNodes[0])).toBe(true);
    expect(Object.isFrozen(facts.roots)).toBe(true);
    expect(Object.isFrozen(facts.loopRounds)).toBe(true);
  });

  /* ------------------------------------------------ O2: one printed line per token */

  it("renders exactly one line per documented token, in the documented order", () => {
    const tokens = Object.values(DEFINITION_OF_DONE_TOKENS);
    const lines = renderDefinitionOfDoneLines(deriveDefinitionOfDoneFacts(baseInput()));

    expect(lines).toHaveLength(tokens.length);
    expect(lines.map((line) => line.slice(0, line.indexOf(":")))).toEqual(tokens);
  });

  it("documents seven unique tokens — sub-clauses 1-3 and 5-8", () => {
    const tokens = Object.values(DEFINITION_OF_DONE_TOKENS);

    expect(tokens).toEqual([
      "DOD-1 panel-reduced-tau",
      "DOD-2 measured-edges",
      "DOD-3 root-final-vs-tau",
      "DOD-5 surviving-objection",
      "DOD-6 evaluator-loop",
      "DOD-7 verdict-label",
      "DOD-8 confidence-band"
    ]);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("prints the sealed bound it was handed, never a literal of its own", () => {
    const lines = renderDefinitionOfDoneLines(
      deriveDefinitionOfDoneFacts(baseInput({ sealedEvaluatorLoopMaxRounds: 7 }))
    );
    const loopLine = lines.find((line) => line.startsWith(DEFINITION_OF_DONE_TOKENS.evaluatorLoop));

    expect(loopLine).toContain("1/7");
    expect(loopLine).toContain("evaluatorLoopMaxRounds");
  });

  it("prints the witness root id, the objection id and the single-voice ids", () => {
    const lines = renderDefinitionOfDoneLines(deriveDefinitionOfDoneFacts(baseInput({
      nodes: [
        { nodeId: "n1", depth: 0, tau: 0.5, finalStrength: 0.7, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "n2", depth: 1, tau: 0.4, finalStrength: 0.4, panel: { voiceCount: 1, nonAuthorVoiceCount: 0 } }
      ]
    })));
    const byToken = (token: string): string => lines.find((line) => line.startsWith(token)) ?? "";

    expect(byToken(DEFINITION_OF_DONE_TOKENS.panelReducedTau)).toContain("n2");
    expect(byToken(DEFINITION_OF_DONE_TOKENS.rootFinalVersusTau)).toContain("n1");
    expect(byToken(DEFINITION_OF_DONE_TOKENS.survivingObjection)).toContain("n2");
    expect(byToken(DEFINITION_OF_DONE_TOKENS.measuredEdges)).toContain("1/1");
    expect(byToken(DEFINITION_OF_DONE_TOKENS.verdictLabel)).toContain("CONTESTED");
    expect(byToken(DEFINITION_OF_DONE_TOKENS.confidenceBand)).toContain("wayOfKnowingCeiling");
  });

  it("prints no free text beyond ids, numbers, booleans, marks and register row keys", () => {
    const lines = renderDefinitionOfDoneLines(deriveDefinitionOfDoneFacts(baseInput({
      conditionMarks: [SYNTHESIS_OBJECTION_STANDING_MARK],
      verdictState: null,
      verdictUnavailableReasonRef: "serve:verdict-unavailable:no-basis",
      confidenceBand: null,
      bandCeiling: null
    })));

    // The only strings that may reach a line are the ones the input supplied as
    // ids/refs/marks plus the module's own vocabulary; a claim, a statement or a
    // reason would show up here as an unknown word.
    for (const line of lines) {
      expect(line).not.toContain("claim");
      expect(line).not.toContain("statement");
    }
    expect(lines.join("\n")).toContain("serve:verdict-unavailable:no-basis");
    expect(lines.join("\n")).toContain(SYNTHESIS_OBJECTION_STANDING_MARK);
  });
});
