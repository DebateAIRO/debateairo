import { readFile } from "node:fs/promises";
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
    edges: [{ sourceNodeId: "n2", polarity: "attack", targetKind: "NODE", magnitudeStatus: "MEASURED" }],
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

  it("counts every edge's magnitude, and separately the attack edges FAIR-01 counts", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      edges: [
        { sourceNodeId: "n2", polarity: "attack", targetKind: "NODE", magnitudeStatus: "MEASURED" },
        { sourceNodeId: "n2", polarity: "attack", targetKind: "NODE", magnitudeStatus: "UNKNOWN" },
        { sourceNodeId: "n1", polarity: "support", targetKind: "NODE", magnitudeStatus: "MEASURED" }
      ]
    }));

    expect(facts.edgeCount).toBe(3);
    expect(facts.edgePresentMagnitudeCount).toBe(2);
    expect(facts.fairDebateAttackEdgeCount).toBe(2);
    expect(facts.fairDebateAttackEdgePresentMagnitudeCount).toBe(1);
  });

  /**
   * The divergence the two counts exist for. Nothing mints an EDGE-targeted
   * arrow today, so on every run the repo can currently produce the two rules
   * agree — which is exactly why a test, not a run, has to hold the difference.
   * `acceptance/fair-debate.ts:122` counts `polarity='attack' AND
   * target_kind='NODE'`; the ceremony prints that number six lines above
   * `DOD-2`, and the two must be reconcilable without arithmetic.
   */
  it("keeps an undercutting attack edge out of the FAIR-01 count and inside the total", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      edges: [
        { sourceNodeId: "n2", polarity: "attack", targetKind: "NODE", magnitudeStatus: "MEASURED" },
        { sourceNodeId: "n2", polarity: "attack", targetKind: "EDGE", magnitudeStatus: "MEASURED" }
      ]
    }));

    expect(facts.edgeCount).toBe(2);
    expect(facts.edgePresentMagnitudeCount).toBe(2);
    expect(facts.fairDebateAttackEdgeCount).toBe(1);
    expect(facts.fairDebateAttackEdgePresentMagnitudeCount).toBe(1);
  });

  it("still counts an EDGE-targeted attacker as a surviving objection, as the runner does", () => {
    const facts = deriveDefinitionOfDoneFacts(baseInput({
      edges: [{ sourceNodeId: "n2", polarity: "attack", targetKind: "EDGE", magnitudeStatus: "MEASURED" }]
    }));

    // The runner's predicate is any attack-polarity arrow — the emphasis the
    // synthesizer was handed was built from that, not from FAIR-01's narrowing.
    expect(facts.fairDebateAttackEdgeCount).toBe(0);
    expect(facts.strongestSurvivingObjection).toEqual({ nodeId: "n2", finalStrength: 0.4 });
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
        { sourceNodeId: "n2", polarity: "attack", targetKind: "NODE", magnitudeStatus: "MEASURED" },
        { sourceNodeId: "n3", polarity: "attack", targetKind: "NODE", magnitudeStatus: "MEASURED" }
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
        { sourceNodeId: "nb", polarity: "attack", targetKind: "NODE", magnitudeStatus: "MEASURED" },
        { sourceNodeId: "na", polarity: "attack", targetKind: "NODE", magnitudeStatus: "MEASURED" }
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
        { sourceNodeId: "n2", polarity: "attack", targetKind: "NODE", magnitudeStatus: "MEASURED" },
        { sourceNodeId: "n3", polarity: "attack", targetKind: "NODE", magnitudeStatus: "MEASURED" }
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
      edges: [{ sourceNodeId: "n2", polarity: "support", targetKind: "NODE", magnitudeStatus: "MEASURED" }]
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
    // Both counting rules on the one line: the clause's reading over every
    // edge, then FAIR-01's, so the judge can reconcile with the FAIR-01 line.
    expect(byToken(DEFINITION_OF_DONE_TOKENS.measuredEdges)).toContain("1/1 edge(s)");
    expect(byToken(DEFINITION_OF_DONE_TOKENS.measuredEdges)).toContain("FAIR-01 rule");
    expect(byToken(DEFINITION_OF_DONE_TOKENS.verdictLabel)).toContain("CONTESTED");
    expect(byToken(DEFINITION_OF_DONE_TOKENS.confidenceBand)).toContain("wayOfKnowingCeiling");
  });

  /* ------------------------------------------------------- O2: the content law */

  /**
   * THE CONTENT LAW, AND WHY IT NEEDS THREE GUARDS.
   *
   * No debate content may reach a printed line or the typed block: ids,
   * numbers, booleans, condition marks and register row keys only. This is the
   * one law here whose violation is irreversible — once a closing run's log is
   * captured with a claim in it, the log is the leak.
   *
   * The first version of this test asserted that no rendered line contained the
   * words "claim" or "statement". The blind review was right that it could not
   * fail: the hand-built input carries no free text, so only the module's own
   * literals could ever have tripped it. A guard that cannot fail is not a
   * guard. These three can, and each catches a different route in:
   *
   *   G1  free text spliced into a RENDERED LINE          → the word vocabulary
   *   G2  free text carried onto a DERIVED FACT           → the string-leaf pin
   *   G3  a text COLUMN pulled into the reader's SQL      → the SELECT-list pin
   *
   * G3 is a source-text pin because the reader needs a database; it is the same
   * floor `run-acceptance.test.ts` uses for the ceremony's statement order.
   */

  /** Every string the input below supplies — the only strings a line may echo. */
  const SUPPLIED_STRINGS = [
    "410fafeb-f575-4d8b-97dd-5a2d52f004fd",
    "31bfcf9d-f832-4cd9-8ac8-f9adcb533d31",
    "serve:verdict-unavailable:no-basis",
    "wayOfKnowingCeiling",
    SYNTHESIS_OBJECTION_STANDING_MARK
  ] as const;

  /**
   * The module's OWN vocabulary — every alphabetic word its fixed prose, its
   * tokens and its JSON field names may contribute to a line. Adding a word
   * here is the review point: a new word must be prose, never data.
   */
  const PINNED_VOCABULARY = new Set([
    // tokens
    "DOD", "panel", "reduced", "tau", "measured", "edges", "root", "final", "vs",
    "surviving", "objection", "evaluator", "loop", "verdict", "label", "confidence", "band",
    // fixed prose
    "node", "s", "every", "has", "a", "non", "author", "voice", "single", "ids", "none",
    "edge", "carry", "PRESENT", "magnitude", "by", "the", "FAIR", "rule", "attack",
    "polarity", "NODE", "target", "roots", "strength", "differs", "from", "its", "witness", "id",
    "strongest", "round", "satisfied", "within", "sealed", "evaluatorLoopMaxRounds",
    "rounds", "unavailable", "terminal", "serve", "state", "basis", "ceiling",
    "register", "row", "key",
    // JSON field names and enum values the two stringified rows contribute
    "nodeId", "finalStrength", "finalDiffersFromTau", "synthesizerStage",
    "evaluatorSatisfied", "true", "false", "INITIAL", "RETRY",
    "LOOKED", "UP", "RAN", "REASONING",
    // the mark and the label vocabulary
    "SYNTHESIS", "OBJECTION", "STANDING", "SUPPORTED", "CONTESTED", "UNSUPPORTED",
    "SERVED", "DOWNGRADED", "BLOCKED", "COMPONENTS", "ONLY", "COMPOSED", "RECOMPOSED", "ONCE",
    "CAPPED", "FULL"
  ]);

  function contentLawInput(): DefinitionOfDoneFactsInput {
    return baseInput({
      nodes: [
        { nodeId: "410fafeb-f575-4d8b-97dd-5a2d52f004fd", depth: 0, tau: 0.72, finalStrength: 0.5, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } },
        { nodeId: "31bfcf9d-f832-4cd9-8ac8-f9adcb533d31", depth: 1, tau: 0.72, finalStrength: 0.4, panel: { voiceCount: 1, nonAuthorVoiceCount: 0 } }
      ],
      edges: [{ sourceNodeId: "31bfcf9d-f832-4cd9-8ac8-f9adcb533d31", polarity: "attack", targetKind: "NODE", magnitudeStatus: "UNKNOWN" }],
      conditionMarks: [SYNTHESIS_OBJECTION_STANDING_MARK],
      verdictState: null,
      verdictUnavailableReasonRef: "serve:verdict-unavailable:no-basis",
      confidenceBand: null,
      bandCeiling: { basis: { LOOKED_UP: 1, RAN: 0, REASONING: 2 }, registerRowKey: "wayOfKnowingCeiling" }
    });
  }

  it("G1: every alphabetic word on a printed line is pinned vocabulary or a string the input supplied", () => {
    const lines = renderDefinitionOfDoneLines(deriveDefinitionOfDoneFacts(contentLawInput()));

    for (const line of lines) {
      // The character class first: anything outside it is not an id, a number,
      // a boolean, a mark or a row key.
      expect(line, `line carries a character no id/number/mark/row-key can produce: ${line}`)
        .toMatch(/^[A-Za-z0-9 ·:/,.\-_{}[\]"@()]+$/u);
      let residue = line;
      for (const supplied of SUPPLIED_STRINGS) residue = residue.split(supplied).join(" ");
      const words = residue.replace(/[^A-Za-z]+/gu, " ").trim().split(/\s+/u).filter(Boolean);
      for (const word of words) {
        expect(
          PINNED_VOCABULARY.has(word),
          `unpinned word "${word}" reached a printed line — if it is data, the content law is broken;`
          + ` if it is prose, pin it: ${line}`
        ).toBe(true);
      }
    }
    // The line the guard is about must actually have been rendered.
    expect(lines.join("\n")).toContain("serve:verdict-unavailable:no-basis");
    expect(lines.join("\n")).toContain(SYNTHESIS_OBJECTION_STANDING_MARK);
  });

  it("G2: every string in the derived block is a string the input supplied", () => {
    const facts = deriveDefinitionOfDoneFacts(contentLawInput());
    const allowed = new Set<string>([
      ...SUPPLIED_STRINGS,
      // the enum values the input supplied on its own typed fields
      "INITIAL", "COMPONENTS_ONLY", "DOWNGRADED", "SERVED", "COMPOSED"
    ]);

    const strings: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === "string") { strings.push(value); return; }
      if (Array.isArray(value)) { for (const item of value) walk(item); return; }
      if (value !== null && typeof value === "object") {
        for (const item of Object.values(value)) walk(item);
      }
    };
    walk(JSON.parse(JSON.stringify(facts)));

    expect(strings.length, "the block must carry strings at all for this to mean anything").toBeGreaterThan(0);
    for (const value of strings) {
      expect(
        allowed.has(value),
        `the derived block carries a string the input never supplied: "${value}" —`
        + " a text column or a free-text field has reached the facts"
      ).toBe(true);
    }
  });

  it("G3: the reader selects exactly the pinned, text-free columns", async () => {
    const source = await readFile(new URL("./dod-facts.ts", import.meta.url), "utf8");
    const readerAt = source.indexOf("export async function readDefinitionOfDoneFacts(");
    expect(readerAt, "the reader must exist to have a SELECT list at all").toBeGreaterThan(-1);
    const body = source.slice(readerAt);

    const selected = [...body.matchAll(/SELECT([\s\S]*?)FROM/gu)]
      .flatMap((match) => (match[1] ?? "").match(/[A-Za-z_][A-Za-z_0-9]*/gu) ?? []);

    // Pinned as a SORTED MULTISET, not a subset check: a new column of ANY name
    // reds this test, and whoever adds it must state here that it carries no
    // debate content. `claim_text`, `reasons`, `question_line`, `statement` and
    // every other text carrier on these relations is refused by construction.
    expect([...new Set(selected)].sort()).toEqual([
      "AS", "depth", "disagreement", "evaluator_satisfied", "int", "judgement",
      "magnitude_status", "node", "node_id", "polarity", "record", "round",
      "source_node_id", "strength", "synthesizer_stage", "target_kind", "tau", "text"
    ]);
  });
});
