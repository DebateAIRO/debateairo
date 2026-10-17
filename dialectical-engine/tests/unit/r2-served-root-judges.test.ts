import { describe, expect, it } from "vitest";
import type { EvaluationSnapshot } from "@debateai/propagation";
import {
  SERVED_ROOT_RULE_HISTORY,
  SERVED_ROOT_SELECTION_RULE,
  SERVED_ROOT_SELECTION_RULE_JUDGES,
  isRetiredServedRootRule
} from "@debateai/kernel";
import { ConditionMarkRecordSchema } from "@debateai/contract";
import {
  deriveHonestVerdict,
  deriveJudgesVerdict,
  verdictDerivationOfJudges,
  type JudgesVerdict
} from "@debateai/serve";
import {
  buildUnservedMakerPositionRecord,
  decideMakerPositionServe,
  selectServedRootByJudges
} from "../../apps/runner/src/index.js";

/**
 * Engine redesign R2b, Task B3 (spec 2026-10-15 §4.4; INTERFACE §9.5): under engine 2 the comparing judges' verdict picks
 * the served root and gives the label record (rung 5); engine 1 keeps today's selection, ladder and records byte for byte.
 */
const ROOT_0 = Object.freeze({ nodeId: "node:root-0", maker: "maker-a" });
const ROOT_1 = Object.freeze({ nodeId: "node:root-1", maker: "maker-b" });
const TWO_ROOTS: EvaluationSnapshot = {
  nodes: [
    { nodeId: ROOT_0.nodeId, baseStrength: 0.6, parentNodeId: null },
    { nodeId: ROOT_1.nodeId, baseStrength: 0.8, parentNodeId: null }
  ],
  arrows: [], arrowOrder: [], operatorResolutions: [], clusterRecords: []
};
const STRENGTHS = Object.freeze([{ nodeId: ROOT_0.nodeId, strength: 0.6 }, { nodeId: ROOT_1.nodeId, strength: 0.8 }]);
/** Two judges of makers that argued nothing both chose A (the WEAKER root): votes, not strength, decide. */
const VERDICT: JudgesVerdict = deriveJudgesVerdict({
  votes: [
    { seat: 1, maker: "maker-c", reply: { best: "A", conditional: false, sameAs: [], questionKind: "general" } },
    { seat: 2, maker: "maker-d", reply: { best: "A", conditional: true, sameAs: [], questionKind: "health" } }
  ],
  answers: [{ letter: "A", rootNodeId: ROOT_0.nodeId, arguedByMaker: "maker-a" },
    { letter: "B", rootNodeId: ROOT_1.nodeId, arguedByMaker: "maker-b" }],
  honestFinalStrength: new Map([[ROOT_0.nodeId, 0.6], [ROOT_1.nodeId, 0.8]]),
  label: { clearAgreeing: 3, closeCallAgreeing: 2 }
});
const decide = (judgesVerdict?: JudgesVerdict) => decideMakerPositionServe({
  effectiveMakerCount: 2,
  runBodyBudgetStop: null,
  authoredMakerPositions: [ROOT_0, ROOT_1],
  snapshot: TWO_ROOTS,
  materialisedNodeIds: [ROOT_0.nodeId, ROOT_1.nodeId],
  reviewedNodeIds: [ROOT_0.nodeId, ROOT_1.nodeId],
  unjudgedReviewNodeIds: [],
  monoMakerConditionMarks: [],
  monoMakerRecords: () => [],
  ...(judgesVerdict === undefined ? {} : { judgesVerdict })
});

describe("the served-root rule vocabulary grows by the judges' rule (INTERFACE §9.5)", () => {
  it("is a live write rule, read by the contract, never a retired one", () => {
    expect(SERVED_ROOT_SELECTION_RULE_JUDGES).toBe("comparing-judges-votes-honest-strength-tiebreak");
    expect(SERVED_ROOT_RULE_HISTORY).toEqual([SERVED_ROOT_SELECTION_RULE, SERVED_ROOT_SELECTION_RULE_JUDGES,
      "first-configured-provider"]);
    expect(isRetiredServedRootRule(SERVED_ROOT_SELECTION_RULE_JUDGES)).toBe(false);
    expect(ConditionMarkRecordSchema.shape.served_root_rule.safeParse(SERVED_ROOT_SELECTION_RULE_JUDGES).success).toBe(true);
  });
});

describe("selectServedRootByJudges", () => {
  it("serves the judges' winner, with its own honest strength, and records the strongest other root as runner-up", () => {
    const selection = selectServedRootByJudges([ROOT_0, ROOT_1], VERDICT, STRENGTHS);
    expect(selection).toMatchObject({ rule: SERVED_ROOT_SELECTION_RULE_JUDGES, root: ROOT_0, servedStrength: 0.6,
      runnerUp: { nodeId: ROOT_1.nodeId, strength: 0.8 }, tiebreak: "NOT_APPLIED" });
    expect(selection.margin.kind).toBe("MEASURED");
    expect(selection.margin.kind === "MEASURED" ? selection.margin.value : null).toBeCloseTo(-0.2, 12);
    expect(Object.isFrozen(selection)).toBe(true);
  });

  it("has no runner-up and an ABSENT margin with a single servable root", () => {
    expect(selectServedRootByJudges([ROOT_0], VERDICT, STRENGTHS)).toMatchObject({
      runnerUp: null, margin: { kind: "ABSENT", reason: "SINGLE_SERVABLE_ROOT" } });
  });

  it("stops, typed, on a winner that is not servable or a root with no propagated strength", () => {
    expect(() => selectServedRootByJudges([ROOT_1], VERDICT, STRENGTHS))
      .toThrowError(expect.objectContaining({ code: "SERVED_ROOT_JUDGES_WINNER_UNSERVABLE" }));
    expect(() => selectServedRootByJudges([ROOT_0, ROOT_1], VERDICT, [STRENGTHS[0]!]))
      .toThrowError(expect.objectContaining({ code: "SERVED_ROOT_STRENGTH_UNRESOLVED" }));
  });
});

describe("decideMakerPositionServe with and without the judges' verdict", () => {
  it("engine 1 (no verdict): today's selection by strength and today's record, byte for byte", () => {
    const decision = decide();
    expect(decision.servedRoot).toBe(ROOT_1);
    expect(decision.servedRootSelection.rule).toBe(SERVED_ROOT_SELECTION_RULE);
    expect(decision.disclosure.records).toEqual([buildUnservedMakerPositionRecord([ROOT_0, ROOT_1], ROOT_1)]);
    expect(decision.disclosure.records[0]!.reason).toBe(
      "The strongest post-exclusion maker root was served: maker-b position node:root-1; maker-a position node:root-0 remains graph-visible but unserved");
  });

  it("engine 2: the judges' winner is served, from the SAME projection and propagation", () => {
    const today = decide();
    const judged = decide(VERDICT);
    expect(judged.servedRoot).toBe(ROOT_0);
    expect(judged.servedRootSelection.rule).toBe(SERVED_ROOT_SELECTION_RULE_JUDGES);
    expect(judged.propagation.strengths).toEqual(today.propagation.strengths);
    expect(judged.standing).toEqual(today.standing);
    expect(judged.disclosure.records).toEqual([buildUnservedMakerPositionRecord([ROOT_0, ROOT_1], ROOT_0,
      SERVED_ROOT_SELECTION_RULE_JUDGES)]);
    expect(judged.disclosure.records[0]).toMatchObject({
      mark: "UNSERVED-MAKER-POSITION", servedRootRule: SERVED_ROOT_SELECTION_RULE_JUDGES,
      reason: "The answer the judges chose was served: maker-a position node:root-0; maker-b position node:root-1 remains graph-visible but unserved"
    });
  });

  // pre-flight PF-R2b2.1: no judge's vote counted (a money stop at judging, every judge failed, every vote ignored): the
  // rule recorded stays the judges' (B5's catch-up keeps the judges' floor by it), only the sentence changes.
  it("engine 2 with no counted vote: the strongest root is served under the judges' rule, and the record says no judge chose", () => {
    const none = deriveJudgesVerdict({ votes: [], answers: [{ letter: "A", rootNodeId: ROOT_0.nodeId, arguedByMaker: "maker-a" },
      { letter: "B", rootNodeId: ROOT_1.nodeId, arguedByMaker: "maker-b" }],
      honestFinalStrength: new Map([[ROOT_0.nodeId, 0.6], [ROOT_1.nodeId, 0.8]]), label: { clearAgreeing: 3, closeCallAgreeing: 2 } });
    const decision = decide(none);
    expect(decision.servedRoot).toBe(ROOT_1);
    expect(decision.servedRootSelection.rule).toBe(SERVED_ROOT_SELECTION_RULE_JUDGES);
    expect(decision.disclosure.records[0]!.reason).toBe(
      "No judge's choice could be counted, so the answer whose case held up best was served: maker-b position node:root-1; maker-a position node:root-0 remains graph-visible but unserved");
  });
});

describe("the label record of an engine-2 answer: rung 5", () => {
  it("maps every verdict to its label and trigger, with no basis absence and no mark", () => {
    const derivation = verdictDerivationOfJudges(VERDICT);
    expect(derivation).toEqual({ label: "CONTESTED", rung: 5, trigger: "JUDGES_MAJORITY", basisAbsence: [], marks: [] });
    expect(Object.isFrozen(derivation)).toBe(true);
    expect(verdictDerivationOfJudges({ ...VERDICT, label: "SPLIT", trigger: "JUDGES_NO_MAJORITY" }))
      .toMatchObject({ label: "SPLIT", rung: 5, trigger: "JUDGES_NO_MAJORITY" });
  });

  it("is what the served answer carries: at most one of a ladder basis or the judges' derivation", () => {
    const judges = verdictDerivationOfJudges({ ...VERDICT, label: "SPLIT", trigger: "JUDGES_NO_MAJORITY" });
    expect(deriveHonestVerdict({ usableBasis: true, reasonRef: "serve-gate:SERVED", labelBasis: null, judgesDerivation: judges }))
      .toEqual({ verdictState: "SPLIT", confidenceBand: null, unavailable: null, derivation: judges });
    expect(deriveHonestVerdict({ usableBasis: false, reasonRef: "serve-gate:COMPONENTS_ONLY", labelBasis: null,
      judgesDerivation: judges })).toMatchObject({ verdictState: null, unavailable: { reasonRef: "serve-gate:COMPONENTS_ONLY" } });
    const basis = { winner: 0.8, margin: { kind: "MEASURED", value: 0.2 }, disagreement: { kind: "MEASURED", value: 0.1 },
      controls: { gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 } } as const;
    expect(() => deriveHonestVerdict({ usableBasis: true, reasonRef: "x", labelBasis: basis, judgesDerivation: judges }))
      .toThrowError(expect.objectContaining({ code: "VERDICT_LABEL_BASIS_AMBIGUOUS" }));
    expect(() => deriveHonestVerdict({ usableBasis: true, reasonRef: "x", labelBasis: null }))
      .toThrowError(expect.objectContaining({ code: "VERDICT_LABEL_BASIS_UNRESOLVED" }));
    // pre-flight PF-R2b7.19 (a), pre-flight consistency R2b: an answer that carries no label (components only, or a
    // review catch-up version: `supersedes` set) persists with neither record, as today.
    expect(deriveHonestVerdict({ usableBasis: false, reasonRef: "serve-gate:COMPONENTS_ONLY", labelBasis: null,
      judgesDerivation: null })).toMatchObject({ verdictState: null, unavailable: { reasonRef: "serve-gate:COMPONENTS_ONLY" } });
  });
});
